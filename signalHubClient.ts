/**
 * Real Signal-Hub Backend Client
 * Connects to {SERVER}/api REST endpoints and {SERVER}/ws/dashboard WebSocket
 * Handles authentication, live streaming, connection backoff, and stale state.
 */

import {
  TacticalUnit,
  TacticalSignal,
  TacticalOrder,
  ConnectionState,
} from '../types/tactical';

const DEFAULT_SERVER_URL = 'http://192.168.1.5:3000';
const BACKOFF_STEPS = [2, 5, 10]; // seconds, then 10s recurring

class SignalHubClient {
  private serverUrl: string;
  private token: string = '';
  private ws: WebSocket | null = null;
  private reconnectAttempt: number = 0;
  private reconnectTimeoutId: any = null;
  private countdownIntervalId: any = null;
  private retryCountdown: number = 0;
  private isStale: boolean = false;
  private lastUpdateTime: string | null = null;
  private connectionStatus: ConnectionState['status'] = 'DISCONNECTED';
  private connectionError: string | null = null;

  private units: TacticalUnit[] = [];
  private signals: TacticalSignal[] = [];
  private orders: TacticalOrder[] = [];
  private activeSosUnitId: string | null = null;

  private listeners: Set<() => void> = new Set();

  constructor() {
    // Restore persisted server URL and token
    const savedUrl = localStorage.getItem('tirang_server_url');
    this.serverUrl = savedUrl ? this.cleanUrl(savedUrl) : DEFAULT_SERVER_URL;

    const savedToken = localStorage.getItem('tirang_auth_token') || '';
    if (savedToken) {
      this.token = savedToken;
      // If we already have a saved token, initiate connection
      this.connect();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  private cleanUrl(url: string): string {
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    return clean.replace(/\/+$/, '');
  }

  public getServerUrl(): string {
    return this.serverUrl;
  }

  public isAuthenticated(): boolean {
    return !!this.token;
  }

  public getConnectionState(): ConnectionState {
    return {
      status: this.connectionStatus,
      serverUrl: this.serverUrl,
      attempt: this.reconnectAttempt,
      retryCountdown: this.retryCountdown,
      lastUpdateTime: this.lastUpdateTime,
      isStale: this.isStale,
      error: this.connectionError,
    };
  }

  public getUnits(): TacticalUnit[] {
    return this.units;
  }

  public getSignals(): TacticalSignal[] {
    return this.signals;
  }

  public getOrders(): TacticalOrder[] {
    return this.orders;
  }

  public getActiveSosUnit(): TacticalUnit | null {
    if (!this.activeSosUnitId) {
      const sosUnit = this.units.find((u) => u.status === 'SOS');
      return sosUnit || null;
    }
    return this.units.find((u) => u.id === this.activeSosUnitId) || null;
  }

  /**
   * Updates server address from Settings and attempts re-connection
   */
  public setServerUrl(newUrl: string) {
    this.serverUrl = this.cleanUrl(newUrl);
    localStorage.setItem('tirang_server_url', this.serverUrl);
    this.resetReconnectState();
    if (this.isAuthenticated()) {
      this.connect();
    } else {
      this.notify();
    }
  }

  /**
   * Authenticates against POST {SERVER}/api/dashboard/login
   */
  public async login(serverAddress: string, username: string, password: string): Promise<boolean> {
    this.serverUrl = this.cleanUrl(serverAddress);
    localStorage.setItem('tirang_server_url', this.serverUrl);

    this.connectionStatus = 'CONNECTING';
    this.connectionError = null;
    this.notify();

    try {
      const res = await fetch(`${this.serverUrl}/api/dashboard/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        let errMsg = `Authentication failed (HTTP ${res.status})`;
        try {
          const errData = await res.json();
          if (errData.error || errData.message) {
            errMsg = errData.error || errData.message;
          }
        } catch {}
        this.connectionStatus = 'DISCONNECTED';
        this.connectionError = errMsg;
        this.notify();
        throw new Error(errMsg);
      }

      const data = await res.json();
      const token = data.token || data.accessToken || data.jwt || data.key;
      if (!token) {
        throw new Error('Server returned invalid authentication payload (missing token)');
      }

      this.token = token;
      localStorage.setItem('tirang_auth_token', token);
      this.reconnectAttempt = 0;
      this.connect();
      return true;
    } catch (err: any) {
      this.connectionStatus = 'DISCONNECTED';
      this.connectionError = err.message || 'Could not connect to server';
      this.notify();
      throw err;
    }
  }

  /**
   * Log out operator, purge stored credentials and disconnect
   */
  public logout() {
    this.token = '';
    localStorage.removeItem('tirang_auth_token');
    this.resetReconnectState();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.units = [];
    this.signals = [];
    this.orders = [];
    this.activeSosUnitId = null;
    this.connectionStatus = 'DISCONNECTED';
    this.connectionError = null;
    this.notify();
  }

  /**
   * Hydrates initial data and opens WebSocket stream
   */
  public async connect() {
    if (!this.token) {
      this.connectionStatus = 'DISCONNECTED';
      this.notify();
      return;
    }

    const previousStatus = this.connectionStatus;
    if (previousStatus !== 'RECONNECTING') {
      this.connectionStatus = 'CONNECTING';
      this.notify();
    }

    try {
      // 1. Fetch initial historical state
      await this.fetchInitialData();

      // 2. Open live WebSocket stream
      this.openWebSocket();
    } catch (err: any) {
      console.warn('Signal-Hub initial fetch warning:', err);
      // Trigger reconnection backoff
      this.scheduleReconnect();
    }
  }

  private async fetchInitialData() {
    const authHeaders = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    // Parallel fetch of /api/units and /api/signals
    const [unitsRes, signalsRes] = await Promise.all([
      fetch(`${this.serverUrl}/api/units`, { headers: authHeaders }),
      fetch(`${this.serverUrl}/api/signals`, { headers: authHeaders }),
    ]);

    if (unitsRes.status === 401 || signalsRes.status === 401) {
      this.logout();
      throw new Error('Session expired. Please log in again.');
    }

    if (unitsRes.ok) {
      const unitsData = await unitsRes.json();
      const rawUnits: any[] = Array.isArray(unitsData)
        ? unitsData
        : unitsData.units || [];

      this.units = rawUnits.map(this.normalizeUnit);
    }

    if (signalsRes.ok) {
      const signalsData = await signalsRes.json();
      const rawSignals: any[] = Array.isArray(signalsData)
        ? signalsData
        : signalsData.signals || [];

      this.signals = rawSignals.map(this.normalizeSignal);
    }

    this.isStale = false;
    this.lastUpdateTime = new Date().toTimeString().split(' ')[0];
    this.notify();
  }

  private openWebSocket() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const wsScheme = this.serverUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const host = this.serverUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsScheme}${host}/ws/dashboard?token=${encodeURIComponent(this.token)}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        const wasReconnecting = this.connectionStatus === 'RECONNECTING';
        this.connectionStatus = wasReconnecting ? 'RESTORED' : 'CONNECTED';
        this.reconnectAttempt = 0;
        this.connectionError = null;
        this.isStale = false;
        this.lastUpdateTime = new Date().toTimeString().split(' ')[0];

        // Re-fetch latest data on link restored to guarantee 100% synchronization
        if (wasReconnecting) {
          this.fetchInitialData().catch(() => {});
          // Briefly display LINK RESTORED for 3 seconds then return to NOMINAL CONNECTED
          setTimeout(() => {
            if (this.connectionStatus === 'RESTORED') {
              this.connectionStatus = 'CONNECTED';
              this.notify();
            }
          }, 3000);
        }

        this.notify();
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          this.handleIncomingMessage(raw);
        } catch (e) {
          console.error('Error parsing WS message:', e);
        }
      };

      this.ws.onerror = (e) => {
        console.warn('Signal-Hub WebSocket error:', e);
      };

      this.ws.onclose = (event) => {
        // If closed unexpectedly while user is logged in, initiate backoff reconnection
        if (this.token && this.connectionStatus !== 'DISCONNECTED') {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.scheduleReconnect();
    }
  }

  private handleIncomingMessage(payload: any) {
    this.isStale = false;
    this.lastUpdateTime = new Date().toTimeString().split(' ')[0];

    const type = (payload.type || payload.event || '').toUpperCase();
    const data = payload.data || payload.payload || payload;

    switch (type) {
      case 'SIGNAL':
      case 'INCOMING_SIGNAL': {
        const signal = this.normalizeSignal(data);
        this.signals = [signal, ...this.signals.filter((s) => s.id !== signal.id)].slice(0, 100);

        // If signal is SOS Alert, trigger SOS state
        if (signal.priority === 'CRITICAL' || signal.status === 'ALERT' || signal.type === 'SOS_ALERT') {
          const matchedUnit = this.units.find((u) => u.callsign === signal.unit || u.id === signal.unit);
          if (matchedUnit) {
            this.activeSosUnitId = matchedUnit.id;
            this.units = this.units.map((u) => (u.id === matchedUnit.id ? { ...u, status: 'SOS' } : u));
          }
        }
        break;
      }

      case 'POSITION':
      case 'POSITION_UPDATE':
      case 'TELEMETRY': {
        const unitId = data.unitId || data.id || data.unit;
        if (unitId) {
          const lat = +(data.lat ?? data.latitude);
          const lon = +(data.lon ?? data.longitude ?? data.lng);

          this.units = this.units.map((u) => {
            if (u.id === unitId || u.callsign === unitId) {
              const currentTrail = u.trail || [];
              const newTrail: [number, number][] =
                isNaN(lat) || isNaN(lon)
                  ? currentTrail
                  : ([...currentTrail, [lat, lon]].slice(-16) as [number, number][]);

              return {
                ...u,
                lat: !isNaN(lat) ? lat : u.lat,
                lon: !isNaN(lon) ? lon : u.lon,
                heading: data.heading !== undefined ? Math.round(data.heading) : u.heading,
                speed: data.speed !== undefined ? +data.speed : u.speed,
                battery: data.battery !== undefined ? +data.battery : u.battery,
                signalStrength: data.signalStrength !== undefined ? +data.signalStrength : u.signalStrength,
                lastSeen: this.lastUpdateTime || u.lastSeen,
                trail: newTrail,
                status: data.status || u.status,
              };
            }
            return u;
          });
        }
        break;
      }

      case 'ORDER_UPDATE':
      case 'ORDER_ACK':
      case 'ORDER_STATUS': {
        const orderId = data.orderId || data.id;
        const newStatus = data.status;
        if (orderId && newStatus) {
          this.orders = this.orders.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o));
        }
        if (data.targetUnit && data.title) {
          this.units = this.units.map((u) => {
            if (data.targetUnit === 'ALL UNITS' || u.callsign === data.targetUnit) {
              return { ...u, currentOrder: data.title };
            }
            return u;
          });
        }
        break;
      }

      case 'SOS':
      case 'SOS_ALERT': {
        const unitId = data.unitId || data.id || data.unit;
        this.units = this.units.map((u) => {
          if (u.id === unitId || u.callsign === unitId) {
            this.activeSosUnitId = u.id;
            return { ...u, status: 'SOS' };
          }
          return u;
        });
        break;
      }

      case 'UNITS': {
        if (Array.isArray(data)) {
          this.units = data.map(this.normalizeUnit);
        }
        break;
      }

      default: {
        // Direct object shape check
        if (data.callsign && (data.lat !== undefined || data.latitude !== undefined)) {
          const unit = this.normalizeUnit(data);
          this.units = this.units.map((u) => (u.id === unit.id ? unit : u));
        } else if (data.unit && data.timestamp) {
          const signal = this.normalizeSignal(data);
          this.signals = [signal, ...this.signals.filter((s) => s.id !== signal.id)].slice(0, 100);
        }
      }
    }

    this.notify();
  }

  /**
   * Reconnection with backoff: 2s, 5s, 10s, then 10s recurring
   */
  private scheduleReconnect() {
    if (!this.token) return;

    this.connectionStatus = 'RECONNECTING';
    this.isStale = true;

    // Pick delay based on attempt index
    const delaySec =
      this.reconnectAttempt < BACKOFF_STEPS.length
        ? BACKOFF_STEPS[this.reconnectAttempt]
        : BACKOFF_STEPS[BACKOFF_STEPS.length - 1];

    this.reconnectAttempt += 1;
    this.retryCountdown = delaySec;
    this.notify();

    // Clear previous timers
    this.resetReconnectTimers();

    // 1-second countdown ticker
    this.countdownIntervalId = setInterval(() => {
      this.retryCountdown = Math.max(0, this.retryCountdown - 1);
      this.notify();
      if (this.retryCountdown <= 0) {
        clearInterval(this.countdownIntervalId);
        this.countdownIntervalId = null;
      }
    }, 1000);

    // Reconnection trigger
    this.reconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delaySec * 1000);
  }

  private resetReconnectTimers() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.countdownIntervalId) {
      clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
  }

  private resetReconnectState() {
    this.resetReconnectTimers();
    this.reconnectAttempt = 0;
    this.retryCountdown = 0;
  }

  /**
   * Dispatches a mission directive via POST {SERVER}/api/orders
   */
  public async dispatchOrder(
    targetCallsign: string,
    title: string,
    customMessage: string,
    priority: 'NORMAL' | 'URGENT'
  ) {
    const now = new Date().toTimeString().split(' ')[0];
    const orderPayload = {
      targetUnit: targetCallsign,
      title,
      message: customMessage || title,
      priority,
      timestamp: now,
    };

    // Optimistically update orders list
    const tempOrderId = `ord-${Date.now()}`;
    const newOrder: TacticalOrder = {
      id: tempOrderId,
      targetUnit: targetCallsign,
      title,
      message: customMessage || title,
      priority,
      timestamp: now,
      status: 'SENT',
    };
    this.orders = [newOrder, ...this.orders];

    const orderSignal: TacticalSignal = {
      id: `sig-ord-${Date.now()}`,
      unit: targetCallsign,
      type: 'ORDER_SENT',
      priority: priority === 'URGENT' ? 'URGENT' : 'NORMAL',
      lat: 28.6139,
      lon: 77.2090,
      note: `DIRECTIVE [${title}]: ${newOrder.message}`,
      timestamp: now,
      status: 'SENT',
    };
    this.signals = [orderSignal, ...this.signals];
    this.notify();

    if (!this.token) return;

    try {
      const res = await fetch(`${this.serverUrl}/api/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });

      if (res.ok) {
        const result = await res.json();
        const serverOrderId = result.id || tempOrderId;
        this.orders = this.orders.map((o) =>
          o.id === tempOrderId ? { ...o, id: serverOrderId, status: result.status || 'SENT' } : o
        );
        this.notify();
      }
    } catch (err) {
      console.error('Failed to post order to Signal-Hub:', err);
    }
  }

  /**
   * Acknowledges distress alert or signal via POST {SERVER}/api/signals/:id/ack
   */
  public async acknowledgeSignal(signalId?: string, unitId?: string) {
    const targetUnit = unitId || this.activeSosUnitId;

    // Local state updates
    if (targetUnit) {
      this.units = this.units.map((u) => {
        if (u.id === targetUnit) {
          return { ...u, status: 'ACTIVE' };
        }
        return u;
      });
      if (this.activeSosUnitId === targetUnit) {
        this.activeSosUnitId = null;
      }
    }

    if (signalId) {
      this.signals = this.signals.map((s) => (s.id === signalId ? { ...s, status: 'ACK' } : s));
    } else {
      this.signals = this.signals.map((s) =>
        s.priority === 'CRITICAL' && s.status === 'ALERT' ? { ...s, status: 'ACK' } : s
      );
    }

    this.notify();

    if (!this.token) return;

    // Send ACK to backend
    const targetSignalId = signalId || this.signals.find((s) => s.priority === 'CRITICAL')?.id;
    if (targetSignalId) {
      try {
        await fetch(`${this.serverUrl}/api/signals/${targetSignalId}/ack`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ unitId: targetUnit }),
        });
      } catch (e) {
        console.warn('Failed to send ACK to Signal-Hub:', e);
      }
    }
  }

  private normalizeUnit(raw: any): TacticalUnit {
    const id = raw.id || raw.unitId || `u-${Math.random().toString(36).substring(2, 7)}`;
    const callsign = raw.callsign || raw.name || raw.code || 'UNIT';
    const code = raw.code || callsign.substring(0, 5);
    const lat = +(raw.lat ?? raw.latitude ?? 28.6139);
    const lon = +(raw.lon ?? raw.longitude ?? raw.lng ?? 77.2090);

    let trail: [number, number][] = [];
    if (Array.isArray(raw.trail)) {
      trail = raw.trail.map((p: any) => [+(p[0] ?? p.lat), +(p[1] ?? p.lon ?? p.lng)]);
    } else {
      trail = [[lat, lon]];
    }

    return {
      id,
      callsign,
      code,
      status: raw.status || 'ACTIVE',
      lat: isNaN(lat) ? 28.6139 : lat,
      lon: isNaN(lon) ? 77.2090 : lon,
      battery: raw.battery !== undefined ? +raw.battery : 100,
      signalStrength: raw.signalStrength !== undefined ? +raw.signalStrength : 100,
      lastSeen: raw.lastSeen || new Date().toTimeString().split(' ')[0],
      trail,
      currentOrder: raw.currentOrder || undefined,
      heading: raw.heading !== undefined ? Math.round(raw.heading) : 0,
      speed: raw.speed !== undefined ? +raw.speed : 0,
      operator: raw.operator || 'Field Unit',
      role: raw.role || 'Tactical Node',
      elevation: raw.elevation !== undefined ? +raw.elevation : 215,
    };
  }

  private normalizeSignal(raw: any): TacticalSignal {
    return {
      id: raw.id || `sig-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      unit: raw.unit || raw.callsign || 'HQ',
      type: raw.type || 'STATUS_PING',
      priority: raw.priority || 'NORMAL',
      lat: +(raw.lat ?? raw.latitude ?? 28.6139),
      lon: +(raw.lon ?? raw.longitude ?? raw.lng ?? 77.2090),
      note: raw.note || raw.message || raw.description || 'Signal report',
      timestamp: raw.timestamp || new Date().toTimeString().split(' ')[0],
      status: raw.status || 'RECEIVED',
    };
  }
}

export const signalHubClient = new SignalHubClient();
