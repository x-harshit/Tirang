/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Delete, ShieldAlert } from 'lucide-react';
import { HAPTIC_PATTERNS, triggerHaptic } from '../services/haptics';
import { playTapSound } from '../services/audio';

interface PasscodeLockProps {
  correctPasscode: string;
  onUnlock: () => void;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const PasscodeLock: React.FC<PasscodeLockProps> = ({
  correctPasscode,
  onUnlock,
  soundEnabled,
  vibrationEnabled,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    triggerHaptic(HAPTIC_PATTERNS.TAP, vibrationEnabled);
    playTapSound(soundEnabled);
    const nextPin = pin + digit;
    setPin(nextPin);
    setError(false);

    if (nextPin.length === 4) {
      if (nextPin === correctPasscode) {
        triggerHaptic(HAPTIC_PATTERNS.CONFIRM, vibrationEnabled);
        setTimeout(() => {
          onUnlock();
        }, 150);
      } else {
        triggerHaptic(HAPTIC_PATTERNS.URGENT_ALARM, vibrationEnabled);
        setError(true);
        setTimeout(() => {
          setPin('');
        }, 600);
      }
    }
  };

  const handleDelete = () => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, vibrationEnabled);
    playTapSound(soundEnabled);
    setPin((prev) => prev.slice(0, -1));
    setError(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090b0e] flex flex-col justify-between p-6 select-none font-mono">
      <div className="flex flex-col items-center gap-2 pt-10 text-center max-w-sm mx-auto w-full">
        <div className="w-11 h-11 border border-[#2b3544] bg-[#11151c] flex items-center justify-center text-[#e6edf3]">
          <ShieldAlert className="w-5 h-5 text-[#cbd5e1]" />
        </div>
        <h2 className="text-xs font-bold tracking-widest uppercase text-[#e6edf3] mt-2">
          SECURITY INTERCEPT // TERMINAL LOCKED
        </h2>
        <p className="text-[10px] text-[#7d8590] tracking-wider uppercase">
          OPERATIVE AUTHORIZATION PIN REQUIRED
        </p>

        {/* PIN Slot Indicators */}
        <div className="flex items-center gap-2.5 my-5">
          {[0, 1, 2, 3].map((idx) => {
            const filled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-9 h-11 border flex items-center justify-center text-sm font-bold transition-colors ${
                  error
                    ? 'border-[#8c2626] bg-[#1a0c0e] text-[#fca5a5]'
                    : filled
                    ? 'border-[#38719f] bg-[#162738] text-[#7dd3fc]'
                    : 'border-[#222935] bg-[#11151c] text-[#384355]'
                }`}
              >
                {filled ? '■' : '·'}
              </div>
            );
          })}
        </div>

        {error && (
          <span className="text-xs font-bold text-[#fca5a5] tracking-widest uppercase border border-[#8c2626] bg-[#1a0c0e] px-3 py-1">
            ACCESS DENIED // INVALID PIN
          </span>
        )}
      </div>

      {/* Numeric Keypad */}
      <div className="w-full max-w-xs mx-auto flex flex-col gap-2 pb-6">
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-12 border border-[#222935] bg-[#11151c] hover:border-[#384355] text-base font-bold text-[#e6edf3] active:bg-[#1a222d] transition-colors flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}
          <div className="h-12" />
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 border border-[#222935] bg-[#11151c] hover:border-[#384355] text-base font-bold text-[#e6edf3] active:bg-[#1a222d] transition-colors flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="h-12 border border-[#222935] bg-[#11151c] hover:border-[#6b1e22] text-[#7d8590] hover:text-[#fca5a5] transition-colors flex items-center justify-center cursor-pointer"
            title="Delete"
          >
            <Delete className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
