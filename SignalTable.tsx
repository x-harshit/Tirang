import React, { useState } from 'react';
import { TacticalSignal } from '../types/tactical';
import { AlertTriangle } from 'lucide-react';

interface SignalTableProps {
  signals: TacticalSignal[];
  isStale?: boolean;
  lastUpdateTime?: string | null;
  onSelectUnitByCallsign: (callsign: string) => void;
}

export const SignalTable: React.FC<SignalTableProps> = ({
  signals,
  isStale = false,
  lastUpdateTime = null,
  onSelectUnitByCallsign,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'ALERTS' | 'ORDERS'>('ALL');

  const filteredSignals = signals.filter((sig) => {
    if (filter === 'ALERTS') return sig.priority === 'CRITICAL' || sig.status === 'ALERT';
    if (filter === 'ORDERS') return sig.type === 'ORDER_SENT' || sig.type === 'ORDER_ACK';
    return true;
  });

  return (
    <aside className="flex flex-col h-full w-full min-w-[270px] text-xs font-mono select-none bg-[#111417] border border-[#1d2327]">
      {/* Header bar (no dot) */}
      <div className="bg-[#14181b] border-b border-[#1f262b] px-3 py-2 flex items-center justify-between">
        <h2 className="text-[#a4b5be] font-normal uppercase tracking-wider text-xs">
          INCOMING SIGNALS
        </h2>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2 py-0.5 cursor-pointer font-normal ${
              filter === 'ALL'
                ? 'bg-[#1e272d] text-[#cfdbe1]'
                : 'text-[#5d6c75] hover:text-[#8e9fa8]'
            }`}
          >
            ALL
          </button>
          <button
            onClick={() => setFilter('ALERTS')}
            className={`px-2 py-0.5 cursor-pointer font-normal ${
              filter === 'ALERTS'
                ? 'bg-[#2b1717] text-[#e09b9b]'
                : 'text-[#5d6c75] hover:text-[#8e9fa8]'
            }`}
          >
            ALERTS
          </button>
          <button
            onClick={() => setFilter('ORDERS')}
            className={`px-2 py-0.5 cursor-pointer font-normal ${
              filter === 'ORDERS'
                ? 'bg-[#1a252d] text-[#8cb0c4]'
                : 'text-[#5d6c75] hover:text-[#8e9fa8]'
            }`}
          >
            ORDERS
          </button>
        </div>
      </div>

      {/* Table Column Titles */}
      <div className="grid grid-cols-12 px-2 py-1 bg-[#0e1113] border-b border-[#1b2126] text-[9px] text-[#55636a] uppercase tracking-wider font-normal">
        <div className="col-span-3">TIME</div>
        <div className="col-span-6">SIGNAL / TELEMETRY</div>
        <div className="col-span-3 text-right">STATUS</div>
      </div>

      {/* Signal Rows Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#14191c]">
        {filteredSignals.length === 0 ? (
          <div className="p-4 text-center text-[#4b575e] text-xs">
            NO SIGNALS RECORDED
          </div>
        ) : (
          filteredSignals.map((signal) => {
            const isSos = signal.priority === 'CRITICAL' || signal.status === 'ALERT';
            const isOrder = signal.type === 'ORDER_SENT';

            return (
              <div
                key={signal.id}
                onClick={() => onSelectUnitByCallsign(signal.unit)}
                className={`grid grid-cols-12 items-center px-2 py-1 cursor-pointer transition-colors leading-tight ${
                  isSos
                    ? 'bg-[#291414] hover:bg-[#331919]'
                    : isOrder
                    ? 'bg-[#141d24] hover:bg-[#18232b]'
                    : 'hover:bg-[#151a1d]'
                }`}
                title={`${signal.unit} [${signal.type}]: ${signal.note} (${signal.timestamp})`}
              >
                {/* Time */}
                <div className="col-span-3 text-[9.5px] font-mono text-[#5f7079] tabular-nums truncate">
                  {signal.timestamp}
                </div>

                {/* Description */}
                <div className="col-span-6 pr-1 min-w-0">
                  <div className="flex items-center gap-1 truncate">
                    {isSos && (
                      <AlertTriangle className="w-2.5 h-2.5 text-[#d14b4b] shrink-0" />
                    )}
                    <span
                      className={`font-normal text-[10px] shrink-0 ${
                        isSos ? 'text-[#e08989]' : 'text-[#b8c6cf]'
                      }`}
                    >
                      {signal.unit}
                    </span>
                    <span className="text-[9px] text-[#596972] truncate">
                      {signal.type}
                    </span>
                  </div>
                  <div className="text-[8.5px] text-[#4d5c64] truncate leading-tight">
                    {signal.note}
                  </div>
                </div>

                {/* Status Tag */}
                <div className="col-span-3 flex justify-end">
                  <span
                    className={`text-[8.5px] uppercase tracking-wider font-normal font-mono ${
                      isSos
                        ? 'text-[#e07575]'
                        : signal.status === 'RECEIVED'
                        ? 'text-[#5d8564]'
                        : signal.status === 'ACK'
                        ? 'text-[#5e8296]'
                        : signal.status === 'SENT'
                        ? 'text-[#9c7e43]'
                        : 'text-[#5a7686]'
                    }`}
                  >
                    {signal.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-[#14181b] border-t border-[#1f262b] text-[10px] text-[#55636a] flex justify-between font-normal">
        <span className={isStale ? 'text-[#c28246]' : 'text-[#55636a]'}>
          {isStale ? `FEED: STALE (${lastUpdateTime || 'LINK LOST'})` : 'FEED: LIVE'}
        </span>
        <span>{filteredSignals.length} SIGNALS</span>
      </div>
    </aside>
  );
};
