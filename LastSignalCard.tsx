/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { formatCoordinates } from '../services/gps';
import { SignalDeliveryStatus, SignalPayload } from '../types';

interface LastSignalCardProps {
  signal: SignalPayload | null;
  onOpenQueue: () => void;
}

export const LastSignalCard: React.FC<LastSignalCardProps> = ({
  signal,
  onOpenQueue,
}) => {
  if (!signal) {
    return (
      <div className="w-full border border-[#222935] bg-[#11151c] p-3 text-xs font-mono text-[#7d8590] flex items-center justify-between">
        <span className="tracking-wider uppercase text-[10px]">LOG // ZERO OUTBOUND TRANSMISSIONS</span>
        <span className="font-bold text-[#7d8590]">[STANDBY]</span>
      </div>
    );
  }

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
        return '[QUEUED IN MEMORY]';
      case 'TRANSMITTING':
        return '[TX IN PROGRESS]';
      case 'SENT':
        return '[DISPATCHED]';
      case 'RECEIVED':
        return '[RECV // BASE]';
      case 'ACKNOWLEDGED':
        return '[ACKNOWLEDGED]';
      case 'FAILED':
      default:
        return '[RETRY REQUIRED]';
    }
  };

  const getStatusColor = (status: SignalDeliveryStatus) => {
    switch (status) {
      case 'QUEUED':
        return 'text-[#fcd34d]';
      case 'TRANSMITTING':
        return 'text-[#7dd3fc]';
      case 'SENT':
        return 'text-[#cbd5e1]';
      case 'RECEIVED':
        return 'text-[#38bdf8]';
      case 'ACKNOWLEDGED':
        return 'text-[#86efac]';
      case 'FAILED':
      default:
        return 'text-[#fca5a5]';
    }
  };

  return (
    <div
      onClick={onOpenQueue}
      role="button"
      tabIndex={0}
      className="w-full border border-[#222935] hover:border-[#3b4557] bg-[#11151c] p-3 flex flex-col gap-1.5 text-xs font-mono transition-colors cursor-pointer select-none"
    >
      <div className="flex items-center justify-between text-[10px] text-[#7d8590] tracking-wider uppercase">
        <span>LATEST TX LOG</span>
        <span className={`font-bold ${getStatusColor(signal.status)}`}>
          {getStatusBadge(signal.status)}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-[#f1f5f9]">
        <span className="tracking-wide uppercase">{signal.subType || signal.type}</span>
        <span className="text-xs text-[#8b949e] tabular-nums font-medium">
          {formatTime(signal.timestamp)}
        </span>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[#7d8590] pt-1.5 border-t border-[#1a202a] mt-0.5">
        <span className="tabular-nums">GRID: {formatCoordinates(signal.lat, signal.lon)}</span>
        <span className="text-[#7dd3fc] font-bold tracking-wider">[VIEW BUFFER LOG]</span>
      </div>
    </div>
  );
};
