import React from 'react';
import { TacticalUnit, TacticalSignal } from '../types/tactical';
import { Activity, Battery, Gauge, Radio } from 'lucide-react';

interface AnalyticsPanelProps {
  units: TacticalUnit[];
  signals: TacticalSignal[];
  onSelectUnit: (unit: TacticalUnit) => void;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  units,
  signals,
  onSelectUnit,
}) => {
  const activeCount = units.filter((u) => u.status === 'ACTIVE').length;
  const weakCount = units.filter((u) => u.status === 'WEAK_SIGNAL').length;
  const sosCount = units.filter((u) => u.status === 'SOS').length;
  const lostCount = units.filter((u) => u.status === 'NO_CONTACT').length;

  const avgBattery = Math.round(
    units.reduce((acc, u) => acc + u.battery, 0) / (units.length || 1)
  );

  const avgSpeed = (
    units.reduce((acc, u) => acc + u.speed, 0) / (units.length || 1)
  ).toFixed(1);

  const avgSignal = Math.round(
    units.reduce((acc, u) => acc + u.signalStrength, 0) / (units.length || 1)
  );

  const readinessScore = Math.round(
    ((activeCount * 1.0 + weakCount * 0.5) / (units.length || 1)) * 100
  );

  return (
    <div className="bg-[#111417] border-t border-[#1d2327] px-4 py-2 select-none font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Metric 1: Readiness & Operational Status (no dots) */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#5e7865]" />
            <span className="text-[#65767f] text-[11px] uppercase">READINESS</span>
            <span className="text-white font-normal text-sm font-mono">{readinessScore}%</span>
          </div>

          <span className="text-[#252c30]">/</span>

          {/* Unit Status Breakdown (no dots) */}
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-[#7da684] font-normal">
              {activeCount} ACTIVE
            </span>

            {weakCount > 0 && (
              <span className="text-[#ba9548] font-normal">
                {weakCount} WEAK
              </span>
            )}

            {sosCount > 0 && (
              <span className="text-[#cc5e5e] font-normal">
                {sosCount} SOS
              </span>
            )}

            {lostCount > 0 && (
              <span className="text-[#67757d]">
                {lostCount} LOST
              </span>
            )}
          </div>
        </div>

        {/* Metric 2: Telemetry Averages (clean spacing, no dots) */}
        <div className="flex items-center gap-5 text-[11px] text-[#80919b]">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#677780]" />
            <span>AVG SPEED:</span>
            <span className="text-[#cfdbe0] font-normal">{avgSpeed} km/h</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Battery className="w-3.5 h-3.5 text-[#677780]" />
            <span>AVG BATTERY:</span>
            <span className="text-[#cfdbe0] font-normal">{avgBattery}%</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-[#677780]" />
            <span>LINK INTEGRITY:</span>
            <span className="text-[#cfdbe0] font-normal">{avgSignal}%</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5">
            <span>PACKETS:</span>
            <span className="text-[#cfdbe0] font-normal">{signals.length} PKTS</span>
          </div>
        </div>

        {/* Quick Unit Focus Buttons */}
        <div className="hidden xl:flex items-center gap-1.5 text-[10px]">
          {units.slice(0, 8).map((u) => (
            <button
              key={u.id}
              onClick={() => onSelectUnit(u)}
              className="px-1.5 py-0.5 text-[#73858f] hover:text-white hover:bg-[#1a2126] transition-colors cursor-pointer"
              title={`Focus ${u.callsign} (${u.status})`}
            >
              {u.callsign}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
