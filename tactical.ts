/**
 * Tactical Command Dashboard - Type Definitions
 */

export type UnitStatus = 'ACTIVE' | 'WEAK_SIGNAL' | 'SOS' | 'NO_CONTACT';

export interface TacticalUnit {
  id: string;
  callsign: string;
  code: string;
  status: UnitStatus;
  lat: number;
  lon: number;
  battery: number;
  signalStrength: number;
  lastSeen: string;
  trail: [number, number][];
  currentOrder?: string;
  heading: number;
  speed: number; // km/h
  operator: string;
  role: string;
  elevation: number; // m
}

export type SignalType = 
  | 'MOVING' 
  | 'POSITION_REPORT' 
  | 'ENCRYPTED_BURST' 
  | 'SOS_ALERT' 
  | 'ORDER_SENT' 
  | 'ORDER_ACK' 
  | 'PERIMETER_CHECK' 
  | 'STATUS_PING';

export type SignalPriority = 'NORMAL' | 'URGENT' | 'CRITICAL';

export type SignalStatus = 'RECEIVED' | 'ACK' | 'ALERT' | 'SENT' | 'DELIVERED' | 'READ';

export interface TacticalSignal {
  id: string;
  unit: string;
  type: SignalType;
  priority: SignalPriority;
  lat: number;
  lon: number;
  note: string;
  timestamp: string;
  status: SignalStatus;
}

export interface TacticalOrder {
  id: string;
  targetUnit: string;
  title: string;
  message: string;
  priority: 'NORMAL' | 'URGENT';
  timestamp: string;
  status: 'SENT' | 'DELIVERED' | 'READ';
}

export interface EncryptionState {
  cipherKey: string;
  entropy: number;
  hexStream: string;
  progress: number;
  protocol: string;
}

export type ConnectionStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'RESTORED';

export interface ConnectionState {
  status: ConnectionStatus;
  serverUrl: string;
  attempt: number;
  retryCountdown: number;
  lastUpdateTime: string | null;
  isStale: boolean;
  error?: string | null;
}

