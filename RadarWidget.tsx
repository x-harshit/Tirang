import React, { useEffect, useRef, useState } from 'react';
import { TacticalUnit } from '../types/tactical';

interface RadarWidgetProps {
  units: TacticalUnit[];
  centerLat: number;
  centerLon: number;
  onSelectUnit: (unit: TacticalUnit) => void;
}

export const RadarWidget: React.FC<RadarWidgetProps> = ({
  units,
  centerLat,
  centerLon,
  onSelectUnit,
}) => {
  const [sweepAngle, setSweepAngle] = useState<number>(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let lastTime = performance.now();
    const rotate = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      setSweepAngle((prev) => (prev + delta * 0.08) % 360);
      animRef.current = requestAnimationFrame(rotate);
    };

    animRef.current = requestAnimationFrame(rotate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const MAX_DEG = 0.065;
  const RADIUS = 44;

  return (
    <div className="relative w-28 h-28 bg-[#07120b]/95 border border-[#1b3d27] rounded-full p-1 select-none shadow-xl backdrop-blur-xs">
      {/* Concentric distance rings */}
      <div className="absolute inset-2 border border-[#142d1e] rounded-full pointer-events-none" />
      <div className="absolute inset-5 border border-[#142d1e] rounded-full pointer-events-none" />
      <div className="absolute inset-8 border border-[#142d1e] rounded-full pointer-events-none" />

      {/* Axis crosshairs */}
      <div className="absolute top-1/2 left-2 right-2 h-[1px] bg-[#142d1e] -translate-y-1/2 pointer-events-none" />
      <div className="absolute top-2 bottom-2 left-1/2 w-[1px] bg-[#142d1e] -translate-x-1/2 pointer-events-none" />

      {/* Rotating Sweep Beam */}
      <div
        className="absolute top-0 left-0 w-full h-full rounded-full pointer-events-none"
        style={{
          transform: `rotate(${sweepAngle}deg)`,
          background: `conic-gradient(from 0deg, rgba(52, 211, 153, 0.45) 0deg, rgba(52, 211, 153, 0) 40deg, transparent 40deg)`,
        }}
      />

      {/* Center blip */}
      <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-[#6ee7b7] rounded-full -translate-x-1/2 -translate-y-1/2" />

      {/* Unit blips - clean circles */}
      {units.map((unit) => {
        const dLat = unit.lat - centerLat;
        const dLon = unit.lon - centerLon;
        const angle = (Math.atan2(dLon, dLat) * 180) / Math.PI;
        const normalizedAngle = (angle + 360) % 360;
        const dist = Math.hypot(dLat, dLon);
        const normDist = Math.min(1, dist / MAX_DEG) * RADIUS;

        const x = 56 + Math.sin((normalizedAngle * Math.PI) / 180) * normDist;
        const y = 56 - Math.cos((normalizedAngle * Math.PI) / 180) * normDist;

        const angleDiff = Math.abs((normalizedAngle - sweepAngle + 360) % 360);
        const isIlluminated = angleDiff < 32;
        const isSos = unit.status === 'SOS';

        return (
          <button
            key={unit.id}
            onClick={() => onSelectUnit(unit)}
            className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10 p-1"
            style={{ left: `${x}px`, top: `${y}px` }}
            title={`${unit.callsign} (${unit.status})`}
          >
            <div
              className={`w-2 h-2 rounded-full transition-opacity duration-300 ${
                isSos
                  ? 'bg-[#ef4444] scale-125'
                  : unit.status === 'WEAK_SIGNAL'
                  ? 'bg-[#f59e0b]'
                  : 'bg-[#22c55e]'
              } ${isIlluminated || isSos ? 'opacity-100' : 'opacity-40'}`}
            />
          </button>
        );
      })}

      {/* Labels */}
      <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] text-[#4ade80]/70 font-mono pointer-events-none">
        N
      </span>
      <span className="absolute bottom-1 right-2 text-[8px] text-[#34d399]/70 font-mono tracking-wider pointer-events-none">
        RADAR
      </span>
    </div>
  );
};
