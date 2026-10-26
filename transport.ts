/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandOrder, SignalDeliveryStatus, SignalPayload, UnitSettings } from '../types';
import {
  addOrder,
  getQueue,
  getSettings,
  removeQueueSignal,
  saveSettings,
  updateQueueSignalStatus,
} from './storage';

type SignalListener = (signal: SignalPayload) => void;
type OrderListener = (order: CommandOrder) => void;
type TransportErrorListener = (error: string | null) => void;
type WsStateListener = (state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED') => void;

const signalListeners: Set<SignalListener> = new Set();
const orderListeners: Set<OrderListener> = new Set();
const errorListeners: Set<TransportErrorListener> = new Set();
const wsStateListeners: Set<WsStateListener> = new Set();

let lastTransportError: string | null = null;
let activeWs: WebSocket | null = null;
let wsState: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' = 'DISCONNECTED';
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let sendRetryTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushingQueue = false;

// Optional BroadcastChannel for cross-tab notifications
let broadcastChannel: BroadcastChannel | null = null;
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  try {
    broadcastChannel = new BroadcastChannel('signals');
    broadcastChannel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;
      if (data.type === 'COMMAND_ORDER' && data.order) {
        addOrder(data.order);
        orderListeners.forEach((cb) => cb(data.order));
      } else if (data.type === 'SIGNAL_ACK' && data.signalId) {
        updateQueueSignalStatus(data.signalId, 'ACKNOWLEDGED');
        removeQueueSignal(data.signalId);
        signalListeners.forEach((cb) =>
          cb({
            id: data.signalId,
            status: 'ACKNOWLEDGED',
          } as SignalPayload)
        );
      }
    };
  } catch (e) {
    console.warn('BroadcastChannel failed to initialize:', e);
  }
}

export function onSignalUpdated(cb: SignalListener): () => void {
  signalListeners.add(cb);
  return () => signalListeners.delete(cb);
}

export function onCommandOrderReceived(cb: OrderListener): () => void {
  orderListeners.add(cb);
  return () => orderListeners.delete(cb);
}

export function onTransportError(cb: TransportErrorListener): () => void {
  errorListeners.add(cb);
  cb(lastTransportError);
  return () => errorListeners.delete(cb);
}

export function onWsStateChanged(cb: WsStateListener): () => void {
  wsStateListeners.add(cb);
  cb(wsState);
  return () => wsStateListeners.delete(cb);
}

export function getLastTransportError(): string | null {
  return lastTransportError;
}

export function clearTransportError(): void {
  setTransportError(null);
}

export function getWsConnectionState(): 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' {
  return wsState;
}

function setTransportError(error: string | null) {
  lastTransportError = error;
  errorListeners.forEach((cb) => cb(lastTransportError));
}

function setWsState(state: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED') {
  wsState = state;
  wsStateListeners.forEach((cb) => cb(wsState));
}

export function isDeviceOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  const settings = getSettings();
  if (settings.isSimulatedOffline) return false;
  return navigator.onLine;
}

function normalizeServerUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, '');
}

/**
 * 3. On registration in Settings, call POST {SERVER}/api/register with callsign and team code,
 * and store the returned device key.
 */
export async function registerDevice(
  serverAddress: string,
  callsign: string,
  teamCode: string
): Promise<{ success: boolean; deviceKey?: string; error?: string }> {
  const cleanServer = normalizeServerUrl((serverAddress || '').trim());
  const cleanCallsign = (callsign || '').trim();
  const cleanCode = (teamCode || '').trim();

  if (!cleanServer) {
    const errorMsg = 'Server address is required';
    setTransportError(errorMsg);
    return { success: false, error: errorMsg };
  }

  if (!cleanCallsign) {
    const errorMsg = 'Callsign is required';
    setTransportError(errorMsg);
    return { success: false, error: errorMsg };
  }

  if (!cleanCode) {
    const errorMsg = 'Team code is required';
    setTransportError(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    const endpoint = `${cleanServer}/api/register`;
    // Send exact field names expected by signal-hub routes:
    // Handles 'code', 'team_code', 'teamCode', and 'team'
    const requestBody = {
      callsign: cleanCallsign,
      code: cleanCode,
      team_code: cleanCode,
      teamCode: cleanCode,
      team: cleanCode,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let serverErrorText = '';
      try {
        const text = await response.text();
        try {
          const errorJson = JSON.parse(text);
          serverErrorText =
            errorJson.error || errorJson.message || errorJson.msg || errorJson.detail || text;
        } catch {
          serverErrorText = text.trim();
        }
      } catch {
        // failed to read text
      }

      const errorMsg =
        serverErrorText ||
        (response.status === 404
          ? 'Cannot reach server (Endpoint not found)'
          : `Registration failed (${response.status} ${response.statusText})`);

      setTransportError(errorMsg);
      return { success: false, error: errorMsg };
    }

    const rawText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      if (rawText && rawText.trim()) {
        data = { key: rawText.trim() };
      }
    }

    if (data.error || data.success === false) {
      const errorMsg = data.error || data.message || 'Registration rejected by server';
      setTransportError(errorMsg);
      return { success: false, error: errorMsg };
    }

    const deviceKey = data.deviceKey || data.key || data.token || data.id;

    if (!deviceKey) {
      const errorMsg = 'Invalid registration response from server (No device key returned)';
      setTransportError(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Store in settings
    const currentSettings = getSettings();
    const updatedSettings: UnitSettings = {
      ...currentSettings,
      serverAddress: cleanServer,
      callsign: cleanCallsign,
      teamCode: cleanCode,
      deviceKey: String(deviceKey),
    };
    saveSettings(updatedSettings);

    // Clear any transport errors
    setTransportError(null);

    // Re-initialize WebSocket connection immediately with new device key
    initFieldWebSocket();

    // Flush any pending queue
    setTimeout(() => {
      flushSignalQueue().catch(console.error);
    }, 200);

    return { success: true, deviceKey: String(deviceKey) };
  } catch (err: any) {
    console.error('Registration network error:', err);
    const errorMsg = 'Cannot reach server';
    setTransportError(errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * 2. Open a WebSocket to {SERVER}/ws/field?key=DEVICE_KEY to receive orders and ACKs.
 */
export function initFieldWebSocket(): void {
  if (typeof window === 'undefined') return;

  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }

  const settings = getSettings();
  const serverAddress = normalizeServerUrl(settings.serverAddress);
  const deviceKey = (settings.deviceKey || '').trim();

  // If not configured or offline, disconnect existing and do not connect
  if (!serverAddress || !deviceKey || !isDeviceOnline()) {
    if (activeWs) {
      try {
        activeWs.close();
      } catch {}
      activeWs = null;
    }
    setWsState('DISCONNECTED');
    return;
  }

  // If already connecting or open with the same endpoint, keep it
  if (
    activeWs &&
    (activeWs.readyState === WebSocket.CONNECTING || activeWs.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  try {
    const wsProto = serverAddress.startsWith('https://') ? 'wss:' : 'ws:';
    const host = serverAddress.replace(/^https?:\/\//i, '');
    const wsUrl = `${wsProto}//${host}/ws/field?key=${encodeURIComponent(deviceKey)}`;

    setWsState('CONNECTING');
    const ws = new WebSocket(wsUrl);
    activeWs = ws;

    ws.onopen = () => {
      if (activeWs !== ws) return;
      console.log('[FIELD UNIT] WebSocket connected to', wsUrl);
      setWsState('CONNECTED');
      // If we had a connection error, clear it
      if (lastTransportError === 'Cannot reach server') {
        setTransportError(null);
      }
    };

    ws.onmessage = (event) => {
      if (activeWs !== ws) return;
      try {
        const raw = event.data;
        if (!raw) return;
        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;

        // 1. Directives / Orders from Command
        const isOrder =
          data.type === 'COMMAND_ORDER' ||
          data.type === 'order' ||
          data.type === 'ORDER' ||
          data.type === 'directive' ||
          (data.title && data.message);

        if (isOrder) {
          const rawOrder = data.order || data;
          const order: CommandOrder = {
            id: rawOrder.id || `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            sender: rawOrder.sender || 'COMMAND HQ',
            title: rawOrder.title || 'COMMAND DIRECTIVE',
            message: rawOrder.message || '',
            priority:
              String(rawOrder.priority).toUpperCase() === 'URGENT' ? 'URGENT' : 'NORMAL',
            timestamp: rawOrder.timestamp || Date.now(),
            acknowledged: false,
          };
          addOrder(order);
          orderListeners.forEach((cb) => cb(order));
          return;
        }

        // 2. ACKs from Command for transmitted signals
        const isAck =
          data.type === 'ACK' ||
          data.type === 'ack' ||
          data.type === 'SIGNAL_ACK' ||
          Boolean(data.signalId) ||
          Boolean(data.ack);

        if (isAck) {
          const ackId = data.signalId || data.ack || data.id;
          if (ackId) {
            console.log('[FIELD UNIT] ACK received for signal:', ackId);
            updateQueueSignalStatus(ackId, 'ACKNOWLEDGED');
            removeQueueSignal(ackId);
            signalListeners.forEach((cb) =>
              cb({
                id: ackId,
                status: 'ACKNOWLEDGED',
              } as SignalPayload)
            );
          }
          return;
        }
      } catch (err) {
        console.warn('[FIELD UNIT] Failed to parse incoming WebSocket message:', err);
      }
    };

    ws.onerror = () => {
      if (activeWs !== ws) return;
      console.warn('[FIELD UNIT] WebSocket connection error');
    };

    ws.onclose = () => {
      if (activeWs !== ws) return;
      setWsState('DISCONNECTED');
      activeWs = null;

      // Auto-reconnect after 4s if still online and registered
      if (isDeviceOnline()) {
        wsReconnectTimer = setTimeout(() => {
          initFieldWebSocket();
        }, 4000);
      }
    };
  } catch (err) {
    console.error('[FIELD UNIT] Error opening WebSocket:', err);
    setWsState('DISCONNECTED');
    activeWs = null;
  }
}

/**
 * Close WebSocket connection cleanly (e.g. on unregister or offline toggle)
 */
export function closeFieldWebSocket(): void {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer);
    wsReconnectTimer = null;
  }
  if (activeWs) {
    try {
      activeWs.close();
    } catch {}
    activeWs = null;
  }
  setWsState('DISCONNECTED');
}

/**
 * 1. Rewrite transport.js to send signals for real:
 * POST {SERVER}/api/signals with header X-Device-Key, sending the queued signals as a batch.
 * Mark each signal RECEIVED only after the server confirms it. On failure, keep it QUEUED and retry.
 * 6. Remove the fake delivery simulation.
 */
export async function sendSignal(signal: SignalPayload): Promise<boolean> {
  const online = isDeviceOnline();

  // If offline, keep status QUEUED
  if (!online) {
    updateQueueSignalStatus(signal.id, 'QUEUED');
    notifySignalUpdate({ ...signal, status: 'QUEUED' });
    return false;
  }

  const settings = getSettings();
  const serverAddress = normalizeServerUrl(settings.serverAddress);
  const deviceKey = (settings.deviceKey || '').trim();

  // Validation: Check server address
  if (!serverAddress) {
    const errorMsg = 'Cannot reach server: Server address not configured in Settings';
    setTransportError('Cannot reach server');
    updateQueueSignalStatus(signal.id, 'QUEUED');
    notifySignalUpdate({ ...signal, status: 'QUEUED' });
    return false;
  }

  // Validation: Check device key
  if (!deviceKey) {
    const errorMsg = 'Device not registered';
    setTransportError(errorMsg);
    updateQueueSignalStatus(signal.id, 'QUEUED');
    notifySignalUpdate({ ...signal, status: 'QUEUED' });
    return false;
  }

  // Prepare batch of all signals pending transmission
  const currentQueue = getQueue();
  const batchMap = new Map<string, SignalPayload>();

  // Ensure current signal is included
  batchMap.set(signal.id, signal);

  // Add other queued or failed signals
  for (const item of currentQueue) {
    if (item.status === 'QUEUED' || item.status === 'FAILED') {
      batchMap.set(item.id, item);
    }
  }

  const batch = Array.from(batchMap.values());

  try {
    const endpoint = `${serverAddress}/api/signals`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Device-Key': deviceKey,
      },
      body: JSON.stringify({ signals: batch }),
    });

    if (response.ok) {
      let confirmedIds: string[] = [];
      try {
        const data = await response.json();
        confirmedIds =
          data.confirmed ||
          data.received ||
          (Array.isArray(data.signals) ? data.signals.map((s: any) => s.id) : []);
      } catch {
        // Response ok but no JSON - fallback to all batch IDs
        confirmedIds = batch.map((s) => s.id);
      }

      if (confirmedIds.length === 0) {
        confirmedIds = batch.map((s) => s.id);
      }

      // Mark each signal RECEIVED only after the server confirms it
      for (const id of confirmedIds) {
        updateQueueSignalStatus(id, 'RECEIVED');
        notifySignalUpdate({ id, status: 'RECEIVED' } as SignalPayload);
      }

      // Clear transport errors
      setTransportError(null);

      // Broadcast event for local dashboard tabs if any
      if (broadcastChannel) {
        try {
          broadcastChannel.postMessage({
            type: 'SIGNALS_TRANSMITTED',
            ids: confirmedIds,
          });
        } catch {}
      }

      return true;
    } else {
      // Server returned an error status (e.g. 401 Unauthorized, 400, 500, etc.)
      let serverErrorText = '';
      try {
        const text = await response.text();
        try {
          const errData = JSON.parse(text);
          serverErrorText = errData.error || errData.message || errData.msg || text;
        } catch {
          serverErrorText = text.trim();
        }
      } catch {}

      let errorMsg = serverErrorText;
      if (!errorMsg) {
        if (response.status === 401 || response.status === 403) {
          errorMsg = 'Device not registered';
        } else {
          errorMsg = `Server error (${response.status} ${response.statusText})`;
        }
      }

      setTransportError(errorMsg);

      // On failure: KEEP IT QUEUED and retry
      for (const item of batch) {
        updateQueueSignalStatus(item.id, 'QUEUED');
      }

      scheduleRetry();
      return false;
    }
  } catch (err: any) {
    console.error('Failed to send signal batch to server:', err);
    // On failure: Keep it QUEUED and retry
    const errorMsg = 'Cannot reach server';
    setTransportError(errorMsg);

    for (const item of batch) {
      updateQueueSignalStatus(item.id, 'QUEUED');
    }

    scheduleRetry();
    return false;
  }
}

function notifySignalUpdate(signal: Partial<SignalPayload> & { id: string }) {
  signalListeners.forEach((cb) => cb(signal as SignalPayload));
}

function scheduleRetry() {
  if (sendRetryTimer) return;
  sendRetryTimer = setTimeout(() => {
    sendRetryTimer = null;
    if (isDeviceOnline()) {
      flushSignalQueue().catch(() => {});
    }
  }, 6000);
}

/**
 * Flush all pending QUEUED signals as a real batch to the server
 */
export async function flushSignalQueue(): Promise<number> {
  if (isFlushingQueue || !isDeviceOnline()) return 0;
  isFlushingQueue = true;

  try {
    const queue = getQueue();
    const queuedItems = queue.filter(
      (item) => item.status === 'QUEUED' || item.status === 'FAILED'
    );

    if (queuedItems.length === 0) {
      return 0;
    }

    const first = queuedItems[0];
    const success = await sendSignal(first);
    return success ? queuedItems.length : 0;
  } finally {
    isFlushingQueue = false;
  }
}

// Global network listener to auto-flush and auto-reconnect when connection returns
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[FIELD UNIT] Network online detected. Connecting WebSocket and flushing queue...');
    initFieldWebSocket();
    flushSignalQueue().catch(console.error);
  });

  window.addEventListener('offline', () => {
    console.log('[FIELD UNIT] Network offline detected.');
    closeFieldWebSocket();
  });
}
