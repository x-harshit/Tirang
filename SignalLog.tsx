import React, { useState } from 'react';
import { TacticalSignal } from '../types/tactical';
import { X, Download, Search } from 'lucide-react';

interface SignalLogProps {
  signals: TacticalSignal[];
  isOpen: boolean;
  onClose: () => void;
  onSelectUnitByCallsign: (callsign: string) => void;
}

export const SignalLog: React.FC<SignalLogProps> = ({
  signals,
  isOpen,
  onClose,
  onSelectUnitByCallsign,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  if (!isOpen) return null;

  const filteredSignals = signals.filter((s) => {
    const matchesSearch =
      s.unit.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.note.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.status.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesPriority =
      priorityFilter === 'ALL' || s.priority === priorityFilter;

    return matchesSearch && matchesPriority;
  });

  const exportCsv = () => {
    const headers = ['ID', 'Timestamp', 'Unit', 'Type', 'Priority', 'Latitude', 'Longitude', 'Status', 'Note'];
    const rows = filteredSignals.map((s) => [
      s.id,
      s.timestamp,
      s.unit,
      s.type,
      s.priority,
      s.lat,
      s.lon,
      s.status,
      `"${s.note.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `tactical_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 select-none">
      <div className="relative w-full max-w-5xl h-[80vh] bg-[#171b1e] border border-[#38434a] flex flex-col font-mono text-xs shadow-2xl">
        {/* Drawer Header */}
        <div className="bg-[#131618] border-b border-[#2e373d] px-4 py-2.5 flex items-center justify-between">
          <div>
            <h2 className="text-[#c5d3da] font-normal text-xs tracking-wider uppercase">
              TELEMETRY LOG ARCHIVE
            </h2>
            <div className="text-[10px] text-[#63727a]">
              RECORDS: {filteredSignals.length} STORED
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#25323a] border border-[#405461] text-[#9bc1d6] hover:bg-[#2d3d47] transition-colors cursor-pointer text-xs font-normal uppercase tracking-wider"
            >
              <Download className="w-3.5 h-3.5" />
              <span>EXPORT CSV</span>
            </button>

            <button
              onClick={onClose}
              className="text-[#65737a] hover:text-[#c7d5dc] cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-2 border-b border-[#283035] bg-[#14171a] flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#536066]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="SEARCH CALLSIGN, STATUS, OR MESSAGE..."
              className="w-full bg-[#101315] border border-[#283035] pl-8 pr-3 py-1 text-xs text-[#b8c7cf] placeholder-[#505d63] focus:outline-none focus:border-[#425057] uppercase font-mono"
            />
          </div>

          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-[#627077]">PRIORITY:</span>
            {(['ALL', 'NORMAL', 'URGENT', 'CRITICAL'] as const).map((pr) => (
              <button
                key={pr}
                onClick={() => setPriorityFilter(pr)}
                className={`px-2 py-0.5 border cursor-pointer uppercase transition-colors ${
                  priorityFilter === pr
                    ? pr === 'CRITICAL'
                      ? 'bg-[#3b1d1d] border-[#7a3232] text-[#e09b9b]'
                      : 'bg-[#29343b] border-[#4e6471] text-[#cfdbe0]'
                    : 'border-[#262e33] text-[#55636a] hover:text-[#97a6ae]'
                }`}
              >
                {pr}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#121517] sticky top-0 border-b border-[#283035] text-[10px] text-[#6d7c84] uppercase tracking-wider">
              <tr>
                <th className="py-2 px-3">TIMESTAMP</th>
                <th className="py-2 px-3">UNIT</th>
                <th className="py-2 px-3">TYPE</th>
                <th className="py-2 px-3">PRIORITY</th>
                <th className="py-2 px-3">COORDS</th>
                <th className="py-2 px-3">STATUS</th>
                <th className="py-2 px-3">MESSAGE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20262a] text-[11px] font-mono">
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#55636a]">
                    NO RECORDS MATCH
                  </td>
                </tr>
              ) : (
                filteredSignals.map((s) => {
                  const isSos = s.priority === 'CRITICAL';
                  return (
                    <tr
                      key={s.id}
                      onClick={() => {
                        onSelectUnitByCallsign(s.unit);
                        onClose();
                      }}
                      className={`hover:bg-[#1f2529] cursor-pointer transition-colors ${
                        isSos ? 'bg-[#331818] text-[#e89090]' : ''
                      }`}
                    >
                      <td className="py-1.5 px-3 text-[#707f87] tabular-nums">
                        {s.timestamp}
                      </td>
                      <td className="py-1.5 px-3 font-normal text-[#c7d5dc]">
                        {s.unit}
                      </td>
                      <td className="py-1.5 px-3 text-[#82a4b8]">
                        {s.type}
                      </td>
                      <td className="py-1.5 px-3">
                        <span
                          className={`px-1.5 py-0.2 text-[9px] uppercase font-normal border ${
                            s.priority === 'CRITICAL'
                              ? 'border-[#7a3030] text-[#e09b9b] bg-[#3d1818]'
                              : s.priority === 'URGENT'
                              ? 'border-[#705527] text-[#c9a65f] bg-[#2d2212]'
                              : 'border-[#2b3338] text-[#6e7d85]'
                          }`}
                        >
                          {s.priority}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-[#6a7982] tabular-nums text-[10px]">
                        {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
                      </td>
                      <td className="py-1.5 px-3">
                        <span
                          className={`text-[9px] uppercase font-normal ${
                            s.status === 'ALERT'
                              ? 'text-[#db7474]'
                              : s.status === 'RECEIVED'
                              ? 'text-[#7da684]'
                              : 'text-[#84a7ba]'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-[#9daeb8] max-w-xs truncate">
                        {s.note}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="bg-[#121517] border-t border-[#283035] px-3 py-1.5 flex items-center justify-between text-[10px] text-[#55636a]">
          <span>LOCAL AUDIT TRAIL</span>
          <span>CLICK ROW TO SELECT UNIT</span>
        </div>
      </div>
    </div>
  );
};
