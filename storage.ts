/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandOrder, SignalPayload, UnitSettings } from '../types';

const QUEUE_KEY = 'fieldunit_queue_v1';
const HISTORY_KEY = 'fieldunit_history_v1';
const SETTINGS_KEY = 'fieldunit_settings_v1';
const ORDERS_KEY = 'fieldunit_orders_v1';

export const DEFAULT_SETTINGS: UnitSettings = {
  serverAddress: '',
  deviceKey: '',
  deviceName: 'PANASONIC-FZ-G2',
  callsign: 'ALPHA-1',
  teamCode: 'BRAVO-TASKFORCE',
  beaconInterval: 30,
  soundEnabled: true,
  vibrationEnabled: true,
  largeText: false,
  highContrast: false,
  passcodeEnabled: false,
  passcode: '0000',
  isSimulatedOffline: false,
};

const INITIAL_ORDERS: CommandOrder[] = [
  {
    id: 'ord-init-01',
    sender: 'FORWARD BASE 4',
    title: 'SECTOR RECON PATROL',
    message: 'Proceed to Waypoint Charlie. Maintain low radio profile. Transmit regular beacon every 30s.',
    priority: 'NORMAL',
    timestamp: Date.now() - 1000 * 60 * 25,
    acknowledged: true,
  },
  {
    id: 'ord-init-02',
    sender: 'COMMAND HQ',
    title: 'WEATHER ADVISORY: ZERO VISIBILITY',
    message: 'Dense fog and particulate dust front advancing from Grid 44-North. Verify all optics and sensors.',
    priority: 'NORMAL',
    timestamp: Date.now() - 1000 * 60 * 10,
    acknowledged: true,
  },
];

// Helper for safe JSON parse
function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('Failed to parse storage item:', e);
    return fallback;
  }
}

// Queue Management (Signals waiting to be transmitted or acknowledged)
export function getQueue(): SignalPayload[] {
  return safeParse<SignalPayload[]>(localStorage.getItem(QUEUE_KEY), []);
}

export function saveQueue(queue: SignalPayload[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueSignal(signal: SignalPayload): void {
  const queue = getQueue();
  // Prevent duplicate ID insertion
  const exists = queue.some((item) => item.id === signal.id);
  if (!exists) {
    queue.push(signal);
    saveQueue(queue);
  }
  // Also register in history log
  recordSignalHistory(signal);
}

export function updateQueueSignalStatus(
  id: string,
  status: SignalPayload['status']
): void {
  const queue = getQueue();
  const index = queue.findIndex((item) => item.id === id);
  if (index !== -1) {
    queue[index].status = status;
    saveQueue(queue);
  }
  updateHistorySignalStatus(id, status);
}

export function removeQueueSignal(id: string): void {
  const queue = getQueue().filter((item) => item.id !== id);
  saveQueue(queue);
}

// Signal History
export function getSignalHistory(): SignalPayload[] {
  return safeParse<SignalPayload[]>(localStorage.getItem(HISTORY_KEY), []);
}

export function recordSignalHistory(signal: SignalPayload): void {
  const history = getSignalHistory();
  const index = history.findIndex((item) => item.id === signal.id);
  if (index !== -1) {
    history[index] = { ...history[index], ...signal };
  } else {
    history.unshift(signal);
  }
  // Cap history to 50 most recent
  if (history.length > 50) {
    history.length = 50;
  }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function updateHistorySignalStatus(
  id: string,
  status: SignalPayload['status']
): void {
  const history = getSignalHistory();
  const index = history.findIndex((item) => item.id === id);
  if (index !== -1) {
    history[index].status = status;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }
}

export function getLastSignal(): SignalPayload | null {
  const history = getSignalHistory();
  return history.length > 0 ? history[0] : null;
}

// Unit Settings
export function getSettings(): UnitSettings {
  return safeParse<UnitSettings>(localStorage.getItem(SETTINGS_KEY), DEFAULT_SETTINGS);
}

export function saveSettings(settings: UnitSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Inbox Orders
export function getOrders(): CommandOrder[] {
  const stored = localStorage.getItem(ORDERS_KEY);
  if (!stored) {
    saveOrders(INITIAL_ORDERS);
    return INITIAL_ORDERS;
  }
  return safeParse<CommandOrder[]>(stored, INITIAL_ORDERS);
}

export function saveOrders(orders: CommandOrder[]): void {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function addOrder(order: CommandOrder): void {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
}

export function acknowledgeOrder(orderId: string): void {
  const orders = getOrders();
  const order = orders.find((o) => o.id === orderId);
  if (order) {
    order.acknowledged = true;
    saveOrders(orders);
  }
}

// Clear local data
export function clearAllLocalData(): void {
  localStorage.removeItem(QUEUE_KEY);
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(ORDERS_KEY);
  saveSettings(DEFAULT_SETTINGS);
}
