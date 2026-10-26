/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function triggerHaptic(pattern: number | number[] = 50, enabled = true): void {
  if (!enabled) return;
  if (typeof window !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore vibration failures if blocked by user gesture policies
    }
  }
}

export const HAPTIC_PATTERNS = {
  TAP: 30,
  STATUS_SEND: [60, 40, 60],
  SOS_TICK: 25,
  SOS_SENT: [250, 100, 250, 100, 450],
  URGENT_ALARM: [150, 80, 150, 80, 250],
  CONFIRM: [40, 60, 80],
};
