import React, { useState } from 'react';
import { TacticalUnit, UnitStatus } from '../types/tactical';
import { Search } from 'lucide-react';

interface UnitTreeProps {
  units: TacticalUnit[];
  selectedUnit: TacticalUnit | null;
  onSelectUnit: (unit: TacticalUnit) => void;
  onOpenOrderModal: (unit: TacticalUnit) => void;
}

export const UnitTree: React.FC<UnitTreeProps> = ({
  units,
  selectedUnit,
  onSelectUnit,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UnitStatus>('ALL');

  const filteredUnits = units.filter((unit) => {
    const matchesSearch =
      unit.callsign.toLowerCase().includes(searchTerm.toLowerCase()) ||
      unit.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      unit.operator.toLowerCase().includes(searchTerm.toLowerCase()) ||
      unit.role.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || unit.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusTextColor = (status: UnitStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-[#6f9674]';
      case 'WEAK_SIGNAL':
        return 'text-[#b8954c]';
      case 'SOS':
        return 'text-[#cc5e5e]';
      case 'NO_CONTACT':
        return 'text-[#67757d]';
    }
  };

  return (
    <aside className="flex flex-col h-full w-full min-w-[270px] text-xs font-mono select-none bg-[#111417] border border-[#1d2327]">
      {/* Header bar (no dot) */}
      <div className="bg-[#14181b] border-b border-[#1f262b] px-3 py-2 flex items-center justify-between">
        <h2 className="text-[#a4b5be] font-normal uppercase tracking-wider text-xs">
          UNIT ROSTER
        </h2>
        <span className="text-[10px] text-[#63727a] font-mono">
          {filteredUnits.length} UNITS
        </span>
      </div>

      {/* Search box & Status filter */}
      <div className="p-2.5 border-b border-[#1a2024] bg-[#111417] space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-[#4d5c64]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="FILTER CALLSIGN..."
            className="w-full bg-[#0d1012] border border-[#1e252a] pl-7 pr-2.5 py-1 text-[11px] text-[#b8c7cf] placeholder-[#47545b] focus:outline-none focus:border-[#38464f] font-mono uppercase"
          />
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 text-[9px] overflow-x-auto pb-0.5">
          {(['ALL', 'ACTIVE', 'WEAK_SIGNAL', 'SOS', 'NO_CONTACT'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2 py-0.5 cursor-pointer uppercase shrink-0 transition-colors font-normal ${
                statusFilter === st
                  ? 'bg-[#1e272d] text-[#cfdbe1]'
                  : 'text-[#5d6c75] hover:text-[#8e9fa8]'
              }`}
            >
              {st === 'WEAK_SIGNAL' ? 'WEAK' : st === 'NO_CONTACT' ? 'LOST' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Unit List - Minimalist without dots */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#171d21]">
        {filteredUnits.length === 0 ? (
          <div className="p-4 text-center text-[#4b575e] text-xs">
            NO MATCHING UNITS
          </div>
        ) : (
          filteredUnits.map((unit) => {
            const isSelected = selectedUnit?.id === unit.id;
            const isSos = unit.status === 'SOS';

            return (
              <div
                key={unit.id}
                onClick={() => {
                  onSelectUnit(unit);
                }}
                className={`px-3 py-2 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[#182126]'
                    : isSos
                    ? 'bg-[#291414]'
                    : 'hover:bg-[#151a1d]'
                }`}
              >
                {/* Header row: Callsign, Code, Status Text (no dots) */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-normal text-[11px] text-[#cfdbe0]">
                      {unit.callsign}
                    </span>
                    <span className="text-[#5a6972] text-[10px]">[{unit.code}]</span>
                  </div>

                  <span
                    className={`text-[9px] uppercase font-medium ${getStatusTextColor(
                      unit.status
                    )}`}
                  >
                    {unit.status === 'WEAK_SIGNAL'
                      ? 'WEAK'
                      : unit.status === 'NO_CONTACT'
                      ? 'LOST'
                      : unit.status}
                  </span>
                </div>

                {/* Subtitle: Role & Operator */}
                <div className="text-[10px] text-[#6b7c85] mt-0.5">
                  {unit.role} / {unit.operator}
                </div>

                {/* Telemetry metrics: Clean spacing (no dots) */}
                <div className="flex items-center gap-3 mt-1 text-[10px] text-[#65767f] font-mono">
                  <span>BATT {unit.battery}%</span>
                  <span>SIG {unit.signalStrength}%</span>
                  <span>{unit.speed} km/h</span>
                </div>

                {unit.currentOrder && (
                  <div className="mt-1 text-[9px] text-[#7899ab] font-mono truncate">
                    ORDER: {unit.currentOrder}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
