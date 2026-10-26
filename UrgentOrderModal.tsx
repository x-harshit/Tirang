/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { CommandOrder } from '../types';
import { HAPTIC_PATTERNS, triggerHaptic } from '../services/haptics';
import { playAcknowledgeSound, playUrgentOrderAlert } from '../services/audio';

interface UrgentOrderModalProps {
  order: CommandOrder;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  onAcknowledge: (orderId: string) => void;
}

export const UrgentOrderModal: React.FC<UrgentOrderModalProps> = ({
  order,
  soundEnabled,
  vibrationEnabled,
  onAcknowledge,
}) => {
  useEffect(() => {
    playUrgentOrderAlert(soundEnabled);
    triggerHaptic(HAPTIC_PATTERNS.URGENT_ALARM, vibrationEnabled);

    const interval = setInterval(() => {
      playUrgentOrderAlert(soundEnabled);
      triggerHaptic(HAPTIC_PATTERNS.URGENT_ALARM, vibrationEnabled);
    }, 4000);

    return () => clearInterval(interval);
  }, [soundEnabled, vibrationEnabled]);

  const handleAcknowledge = () => {
    triggerHaptic(HAPTIC_PATTERNS.CONFIRM, vibrationEnabled);
    playAcknowledgeSound(soundEnabled);
    onAcknowledge(order.id);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090b0e] flex flex-col justify-between p-5 border-2 border-[#8c2626] font-mono select-none">
      {/* Top Header */}
      <div className="flex flex-col gap-1.5 border-b border-[#2d1215] pb-3">
        <div className="flex items-center justify-between text-xs text-[#cbd5e1]">
          <span className="font-bold tracking-widest uppercase flex items-center gap-1.5 text-[#fca5a5]">
            <AlertCircle className="w-4 h-4 text-[#ef4444]" />
            FLASH INTERCEPT // PRIORITY 1
          </span>
          <span className="text-[10px] font-bold text-[#fca5a5] bg-[#240e11] px-2 py-0.5 border border-[#521b1f]">
            ORIGIN: {order.sender}
          </span>
        </div>

        <div className="text-sm sm:text-base font-bold text-[#f1f5f9] uppercase tracking-wider mt-1 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-[#b91c1c]" />
          {order.title}
        </div>
      </div>

      {/* Directive Text Body */}
      <div className="my-auto py-6 border border-[#222935] bg-[#11151c] p-4">
        <p className="text-base sm:text-xl font-bold text-[#f1f5f9] uppercase leading-relaxed tracking-wide">
          "{order.message}"
        </p>
        <div className="mt-4 pt-2.5 border-t border-[#1a202a] text-[10px] text-[#7d8590] tracking-widest uppercase flex items-center justify-between">
          <span>OPERATIVE COMPLIANCE MANDATORY</span>
          <span>DISPATCHES RECEIPT TELEMETRY</span>
        </div>
      </div>

      {/* Flat Military Red Acknowledge Button */}
      <div className="w-full pt-3">
        <button
          onClick={handleAcknowledge}
          className="w-full min-h-[50px] bg-[#8c2626] hover:bg-[#a82e2e] active:bg-[#6e1e1e] text-white font-bold text-xs uppercase tracking-widest border border-[#b91c1c] transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <CheckCircle className="w-4 h-4" />
          <span>[ ACKNOWLEDGE & DISPATCH RECEIPT TELEMETRY ]</span>
        </button>
      </div>
    </div>
  );
};
