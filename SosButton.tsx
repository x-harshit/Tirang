/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Radio } from 'lucide-react';
import { HAPTIC_PATTERNS, triggerHaptic } from '../services/haptics';
import { playSosWarningSound, playTapSound } from '../services/audio';

interface SosButtonProps {
  onTriggerSos: () => void;
  onCancelSos: () => void;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const SosButton: React.FC<SosButtonProps> = ({
  onTriggerSos,
  onCancelSos,
  soundEnabled,
  vibrationEnabled,
}) => {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSosActive, setIsSosActive] = useState(false);
  const [cancelCountdown, setCancelCountdown] = useState(5);

  const holdStartRef = useRef<number>(0);
  const timerAnimRef = useRef<number | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const HOLD_DURATION_MS = 2000;

  const startHold = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if (isSosActive) return;
    // Prevent default to stop scrolling or text selection on touch devices
    if ('button' in e && e.button !== 0) return; // Only primary mouse button

    setHolding(true);
    setProgress(0);
    holdStartRef.current = performance.now();
    triggerHaptic(HAPTIC_PATTERNS.SOS_TICK, vibrationEnabled);
    playTapSound(soundEnabled);

    if (timerAnimRef.current) {
      cancelAnimationFrame(timerAnimRef.current);
    }

    const step = (now: number) => {
      const elapsed = now - holdStartRef.current;
      const pct = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setProgress(pct);

      if (elapsed >= HOLD_DURATION_MS) {
        setHolding(false);
        setProgress(100);
        setIsSosActive(true);
        setCancelCountdown(5);

        triggerHaptic(HAPTIC_PATTERNS.SOS_SENT, vibrationEnabled);
        playSosWarningSound(soundEnabled);
        onTriggerSos();

        let remaining = 5;
        if (cancelTimerRef.current) clearInterval(cancelTimerRef.current);
        cancelTimerRef.current = setInterval(() => {
          remaining -= 1;
          setCancelCountdown(remaining);
          if (remaining <= 0) {
            if (cancelTimerRef.current) clearInterval(cancelTimerRef.current);
            setTimeout(() => {
              setIsSosActive(false);
              setProgress(0);
            }, 800);
          }
        }, 1000);
      } else {
        timerAnimRef.current = requestAnimationFrame(step);
      }
    };

    timerAnimRef.current = requestAnimationFrame(step);
  };

  const endHold = () => {
    if (isSosActive) return;
    setHolding(false);
    setProgress(0);
    if (timerAnimRef.current) {
      cancelAnimationFrame(timerAnimRef.current);
      timerAnimRef.current = null;
    }
  };

  const handleCancelClick = () => {
    if (cancelTimerRef.current) {
      clearInterval(cancelTimerRef.current);
      cancelTimerRef.current = null;
    }
    setIsSosActive(false);
    setProgress(0);
    triggerHaptic(HAPTIC_PATTERNS.CONFIRM, vibrationEnabled);
    playTapSound(soundEnabled);
    onCancelSos();
  };

  useEffect(() => {
    return () => {
      if (timerAnimRef.current) cancelAnimationFrame(timerAnimRef.current);
      if (cancelTimerRef.current) clearInterval(cancelTimerRef.current);
    };
  }, []);

  const remainingSeconds = Math.max(
    0,
    ((HOLD_DURATION_MS - (progress / 100) * HOLD_DURATION_MS) / 1000)
  ).toFixed(1);

  return (
    <div className="w-full font-mono select-none">
      {isSosActive ? (
        /* ACTIVE BROADCASTING STATE */
        <div className="border-2 border-[#b91c1c] bg-[#140b0d] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[#3b1517]">
            <span className="font-bold text-[#fca5a5] tracking-widest uppercase flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-[#ef4444] animate-pulse" />
              EMERGENCY DISTRESS BEACON ACTIVE
            </span>
            <span className="text-[#fca5a5] tabular-nums font-bold text-xs bg-[#3b1517] px-2 py-0.5 border border-[#6b1e22]">
              ABORT WINDOW: 0{cancelCountdown}S
            </span>
          </div>

          {/* Abort countdown progress bar */}
          <div className="w-full h-1.5 bg-[#261013] border border-[#4a181c] overflow-hidden">
            <div
              className="h-full bg-[#ef4444] transition-all duration-1000 ease-linear"
              style={{ width: `${(cancelCountdown / 5) * 100}%` }}
            />
          </div>

          <div className="text-[10px] text-[#9ca3af] tracking-wide leading-relaxed">
            CRITICAL DISTRESS TELEMETRY ENGAGED. BROADCASTING REAL-TIME GPS COORDINATES TO ALL COMMAND UNITS.
          </div>

          <button
            onClick={handleCancelClick}
            className="w-full min-h-[46px] bg-[#8c2626] hover:bg-[#a82e2e] active:bg-[#6e1e1e] text-white font-bold text-xs uppercase tracking-widest border border-[#ef4444] transition-colors flex items-center justify-center gap-2 cursor-pointer mt-1"
          >
            <AlertCircle className="w-4 h-4 text-white" />
            <span>[ ABORT EMERGENCY BROADCAST · 0{cancelCountdown}S ]</span>
          </button>
        </div>
      ) : (
        /* READY ARMED STATE */
        <div className="border border-[#42171b] bg-[#12080a] hover:border-[#6e2228] transition-colors">
          {/* Header */}
          <div className="flex items-center justify-between text-[10px] font-bold tracking-widest px-3 py-1 bg-[#1a0b0e] border-b border-[#2d1215] uppercase">
            <span className="flex items-center gap-1.5 text-[#fca5a5]">
              <span className={`w-1.5 h-1.5 ${holding ? 'bg-[#ef4444] animate-ping' : 'bg-[#b91c1c]'}`} />
              PRIORITY-0 // DISTRESS OVERRIDE
            </span>
            <span className={`tabular-nums ${holding ? 'text-[#fca5a5] font-bold' : 'text-[#7d8590]'}`}>
              {holding ? `HOLDING: ${remainingSeconds}S` : 'CALIBRATED: 2.0S'}
            </span>
          </div>

          {/* Touch/Pointer Interaction Trigger */}
          <button
            type="button"
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            className="w-full p-3 flex flex-col gap-2.5 text-left cursor-pointer transition-colors touch-none"
          >
            {/* Title & Numeric Percent Indicator */}
            <div className="flex items-center justify-between text-xs font-bold w-full">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.2 bg-[#331114] text-[#fca5a5] text-[10px] font-bold border border-[#6b1e22]">
                  SOS
                </span>
                <span className="tracking-widest uppercase text-sm font-extrabold text-[#f1f5f9]">
                  EMERGENCY S.O.S.
                </span>
              </div>
              <span className={`text-[11px] font-black tabular-nums tracking-wider ${
                holding ? 'text-[#ef4444]' : 'text-[#7d8590]'
              }`}>
                {holding ? `[ ${Math.round(progress)}% ]` : '[ HOLD 2.0S ]'}
              </span>
            </div>

            {/* Robust 60fps Calibrated Progress Bar Track */}
            <div className="relative w-full h-3.5 bg-[#1b090c] border border-[#4d161a] overflow-hidden">
              {/* Dynamic Smooth Linear Fill - Zero CSS lag during hold */}
              <div
                className="h-full bg-[#dc2626]"
                style={{
                  width: `${progress}%`,
                  transition: holding ? 'none' : 'width 0.15s ease-out',
                }}
              />

              {/* Calibration Markers (0%, 25%, 50%, 75%, 100%) */}
              <div className="absolute inset-0 flex justify-between pointer-events-none px-0.5">
                <div className="w-[1px] h-full bg-[#7f1d1d]/40" />
                <div className="w-[1px] h-full bg-[#7f1d1d]/40" />
                <div className="w-[1px] h-full bg-[#7f1d1d]/40" />
                <div className="w-[1px] h-full bg-[#7f1d1d]/40" />
                <div className="w-[1px] h-full bg-[#7f1d1d]/40" />
              </div>
            </div>

            {/* Bottom Status Row */}
            <div className="flex items-center justify-between text-[10px] tracking-wider">
              <span className={holding ? 'text-[#fca5a5] font-bold' : 'text-[#7d8590]'}>
                {holding ? 'TRANSMITTING IN...' : 'PRESS & HOLD STEADY TO TRANSMIT'}
              </span>
              <span className="tabular-nums text-[#cbd5e1] font-bold">
                {holding ? `${remainingSeconds}s remaining` : '2.0s hold requirement'}
              </span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
