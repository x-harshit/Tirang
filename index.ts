/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SignalType =
  | 'SOS'
  | 'STATUS'
  | 'BEACON'
  | 'ACK';

export type SignalPriority = 'critical' | 'high' | 'normal';

export type SignalDeliveryStatus =
  | 'QUEUED'
  | 'TRANSMITTING'
  | 'SENT'
  | 'RECEIVED'
  | 'ACKNOWLEDGED'
  | 'FAILED';

export interface SignalPayload {
  id: string;              // Unique UUID/timestamp
  unit: string;            // Callsign e.g. "ALPHA-1"
  type: SignalType;
  priority: SignalPriority;
  lat: number;
  lon: number;
  note?: string;
  timestamp: number;       // Epoch ms
  status: SignalDeliveryStatus;
  subType?: string;        // e.g. "MOVING", "IN POSITION", "ALL CLEAR", "NEED SUPPORT", "UNDER THREAT"
}

export type OrderPriority = 'NORMAL' | 'URGENT';

export interface CommandOrder {
  id: string;
  sender: string;          // e.g. "COMMAND HQ", "FORWARD BASE 4"
  title: string;
  message: string;
  priority: OrderPriority;
  timestamp: number;
  acknowledged: boolean;
}

export interface UnitSettings {
  serverAddress: string;       // e.g. "http://192.168.1.5:3000", never default to localhost
  deviceKey?: string;          // Stored key returned from POST /api/register
  deviceName: string;
  callsign: string;
  teamCode: string;
  beaconInterval: 10 | 30 | 60; // seconds
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  largeText: boolean;
  highContrast: boolean;
  passcodeEnabled: boolean;
  passcode: string;
  isSimulatedOffline: boolean;
}

export type ActiveTab = 'HOME' | 'INBOX' | 'SETTINGS';

export interface GpsLocation {
  lat: number;
  lon: number;
  accuracy: number;
  isRealGps: boolean;
  status: 'LOCKED' | 'SEARCHING' | 'SIMULATED';
  lastFixTime: number;
}
