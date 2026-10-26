import React from 'react';
import { TacticalUnit } from '../types/tactical';
import { AlertTriangle, CheckCircle, Send } from 'lucide-react';

interface SosBannerProps {
  unit: TacticalUnit;
  onAcknowledge: (unitId: string) => void;
  onSendResponse: (unit: TacticalUnit) => void;
}

export const SosBanner: React.FC<SosBannerProps> = ({
  unit,
  onAcknowledge,
  onSendResponse,
}) => {
  return (
    <div className="w-full bg-[#291313] border-b-2 border-[#8f2b2b] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono tracking-wider z-30 select-none">
      {/* Alert Header & Callsign */}
      <div className="flex items-center gap-3">
        <div className="p-1 bg-[#8f2b2b] text-white">
          <AlertTriangle className="w-4 h-4 text-[#ffd1d1]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-[#591b1b] text-[#ffb0b0] font-normal px-1.5 py-0.5 text-[10px] uppercase border border-[#7d2929]">
              DISTRESS BEACON
            </span>
            <span className="text-white font-normal text-sm tracking-wide">
              {unit.callsign} [{unit.code}]
            </span>
            <span className="text-[#998080] text-[11px]">({unit.role})</span>
          </div>
          <div className="text-[#c99595] text-[10px] mt-0.5 flex items-center gap-3">
            <span>OPERATOR: {unit.operator.toUpperCase()}</span>
            <span>TIME: {unit.lastSeen}</span>
          </div>
        </div>
      </div>

      {/* Coordinates & Battery */}
      <div className="flex items-center gap-5 text-[11px] text-[#baa4a4]">
        <div className="flex items-center gap-1.5">
          <span>COORDS:</span>
          <span className="text-white font-normal">
            {unit.lat.toFixed(5)}, {unit.lon.toFixed(5)}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <span>ELEV: {unit.elevation}M</span>
          <span>BATT: {unit.battery}%</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onAcknowledge(unit.id)}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#1d261f] border border-[#445947] text-[#93ba97] hover:bg-[#27332a] transition-colors cursor-pointer text-xs uppercase font-normal"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>ACKNOWLEDGE</span>
        </button>

        <button
          onClick={() => onSendResponse(unit)}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#7d2424] border border-[#a83636] text-white font-normal hover:bg-[#8f2d2d] transition-colors cursor-pointer text-xs uppercase"
        >
          <Send className="w-3.5 h-3.5" />
          <span>DISPATCH ORDER</span>
        </button>
      </div>
    </div>
  );
};
