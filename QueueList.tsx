/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { formatCoordinates } from '../services/gps';
import { SignalDeliveryStatus, SignalPayload } from '../types';
import { HAPTIC_PATTERNS, triggerHaptic } from '../services/haptics';
import { playTapSound } from '../services/audio';

interface QueueListProps {
  queue: SignalPayload[];
  history: SignalPayload[];
  isOnline: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  onClose: () => void;
  onFlushQueue: () => void;
}

export const QueueList: React.FC<QueueListProps> = ({
  queue,
  history,
  isOnline,
  soundEnabled,
  vibrationEnabled,
  onClose,
  onFlushQueue,
}) => {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}Z`;
  };

  const getStatusBadge = (status: SignalDeliveryStatus) => {
    switch (status) {
      case 'QUEUED':
        return '[QUEUED // MEMORY]';
      case 'TRANSMITTING':
        return '[TX ACTIVE]';
      case 'SENT':
        return '[DISPATCHED]';
      case 'RECEIVED':
        return '[RECEIVED // BASE]';
      case 'ACKNOWLEDGED':
        return '[ACKNOWLEDGED]';
      case 'FAILED':
      default:
        return '[TX FAILED]';
    }
  };

  const handleFlush = () => {
    triggerHaptic(HAPTIC_PATTERNS.CONFIRM, vibrationEnabled);
    playTapSound(soundEnabled);
    onFlushQueue();
  };

  const combinedSignals: SignalPayload[] = [];
  const seenIds = new Set<string>();

  queue.forEach((item) => {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      combinedSignals.push(item);
    }
  });

  history.forEach((item) => {
    if (!seenIds.has(item.id)) {
      seenIds.add(item.id);
      combinedSignals.push(item);
    }
  });

  const queuedPendingCount = queue.filter((i) => i.status === 'QUEUED').length;

  return (
    <div className="fixed inset-0 z-50 bg-[#090b0e]/90 backdrop-blur-xs flex flex-col justify-end sm:justify-center p-0 sm:p-4 font-mono select-none">
      <div className="w-full max-w-lg mx-auto bg-[#11151c] border border-[#222935] max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-3.5 border-b border-[#222935] flex items-center justify-between text-xs bg-[#0d1117]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#e6edf3] uppercase tracking-wider text-[11px]">
              TELEMETRY & SIGNAL BUFFER LOG
            </span>
            <span className="text-[10px] text-[#7d8590] font-bold">
              [{queuedPendingCount} HELD]
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-xs text-[#7d8590] hover:text-white uppercase font-bold px-2 py-0.5 border border-[#222935] hover:border-[#384355] transition-colors cursor-pointer"
          >
            [CLOSE]
          </button>
        </div>

        {/* Flush Action Bar */}
        {queuedPendingCount > 0 && (
          <div className="p-3 border-b border-[#222935] flex items-center justify-between text-xs bg-[#151c24]">
            <span className="text-[#cbd5e1] text-[10px]">
              {isOnline
                ? `${queuedPendingCount} signals queued · ready for transmission flush`
                : 'Terminal offline · signals held in secure non-volatile buffer'}
            </span>
            <button
              onClick={handleFlush}
              disabled={!isOnline}
              className={`min-h-[34px] px-3 font-bold text-xs uppercase tracking-wider transition-colors border cursor-pointer ${
                isOnline
                  ? 'border-[#2e683e] bg-[#102418] text-[#86efac] hover:bg-[#163622]'
                  : 'border-[#222935] bg-[#11151c] text-[#7d8590] cursor-not-allowed'
              }`}
            >
              [ FLUSH BUFFER ]
            </button>
          </div>
        )}

        {/* Log Stream */}
        <div className="overflow-y-auto p-3.5 flex flex-col gap-2 divide-y divide-[#1a202a] text-xs">
          {combinedSignals.length === 0 ? (
            <div className="py-12 text-center text-[#7d8590] tracking-wider uppercase text-[11px]">
              BUFFER CLEAR · ALL SIGNALS ACKNOWLEDGED BY BASE
            </div>
          ) : (
            combinedSignals.map((item) => (
              <div key={item.id} className="pt-2 first:pt-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#e6edf3] uppercase tracking-wide text-xs">
                    {item.subType || item.type}
                  </span>
                  <span className={`font-bold text-[10px] ${
                    item.status === 'RECEIVED'
                      ? 'text-[#38bdf8]'
                      : item.status === 'ACKNOWLEDGED'
                      ? 'text-[#86efac]'
                      : item.status === 'QUEUED'
                      ? 'text-[#fcd34d]'
                      : item.status === 'FAILED'
                      ? 'text-[#fca5a5]'
                      : 'text-[#cbd5e1]'
                  }`}>
                    {getStatusBadge(item.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#7d8590]">
                  <span className="tabular-nums">GRID: {formatCoordinates(item.lat, item.lon)}</span>
                  <span className="tabular-nums font-medium text-[#8b949e]">{formatTime(item.timestamp)}</span>
                </div>
                {item.note && (
                  <div className="text-[10px] text-[#8b949e] bg-[#090b0e] border border-[#1a202a] p-1.5 mt-0.5">
                    {item.note}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
