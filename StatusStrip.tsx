/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Server, Wifi, WifiOff } from 'lucide-react';
import { formatCoordinates } from '../services/gps';
import { GpsLocation, UnitSettings } from '../types';

interface StatusStripProps {
  settings: UnitSettings;
  isOnline: boolean;
  queuedCount: number;
  gps: GpsLocation;
  transportError?: string | null;
  wsStatus?: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  onOpenQueue: () => void;
  onNavigateToSettings?: () => void;
}

export const StatusStrip: React.FC<StatusStripProps> = ({
  settings,
  isOnline,
  queuedCount,
  gps,
  transportError,
  wsStatus,
  onOpenQueue,
  onNavigateToSettings,
}) => {
  const [batteryLevel, setBatteryLevel] = useState<number>(88);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      (navigator as any)
        .getBattery()
        .then((battery: any) => {
          setBatteryLevel(Math.round(battery.level * 100));
          battery.addEventListener('levelchange', () => {
            setBatteryLevel(Math.round(battery.level * 100));
          });
        })
        .catch(() => {});
    }
  }, []);

  const hasConfigWarning = !settings.serverAddress || !settings.deviceKey;

  return (
    <header className="sticky top-0 z-30 w-full bg-[#090b0e] border-b border-[#222935] px-4 py-2 select-none font-mono">
      <div className="max-w-2xl mx-auto flex flex-col gap-1.5">
        {/* Row 1: Operational Telemetry Bar */}
        <div className="flex items-center justify-between text-xs tracking-wider">
          {/* Unit Callsign & Link Status */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#e6edf3] uppercase tracking-wider bg-[#141822] border border-[#2b3544] px-2 py-0.5 text-[11px]">
              {settings.callsign || 'ALPHA-1'}
            </span>
            <span className="text-[#3b4657]">/</span>
            <span
              className={`text-[10px] font-bold uppercase ${
                isOnline ? 'text-[#86efac]' : 'text-[#fcd34d]'
              }`}
            >
              {isOnline ? '[NET: OK]' : '[NET: OFFLINE]'}
            </span>
            {settings.deviceKey && (
              <>
                <span className="text-[#3b4657]">/</span>
                <span
                  className={`text-[10px] font-bold uppercase ${
                    wsStatus === 'CONNECTED'
                      ? 'text-[#86efac]'
                      : wsStatus === 'CONNECTING'
                      ? 'text-[#fcd34d]'
                      : 'text-[#94a3b8]'
                  }`}
                  title="WebSocket Link to Hub"
                >
                  WS:{wsStatus || 'OFF'}
                </span>
              </>
            )}
          </div>

          {/* Buffer & Battery Telemetry */}
          <div className="flex items-center gap-3 text-[11px]">
            <button
              onClick={onOpenQueue}
              className={`px-2 py-0.5 border text-left font-bold transition-colors cursor-pointer ${
                queuedCount > 0
                  ? 'border-[#7dd3fc] bg-[#162738] text-[#7dd3fc]'
                  : 'border-[#222935] bg-[#11151c] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#384355]'
              }`}
              title="Inspect Signal Buffer"
            >
              BUF:<span className="tabular-nums ml-1 text-white">{queuedCount}</span>
            </button>
            <span className="text-[#3b4657]">/</span>
            <span className="tabular-nums font-bold text-[#cbd5e1] text-[10px]">
              PWR:{batteryLevel}%
            </span>
          </div>
        </div>

        {/* Row 2: GPS Coordinate Strip */}
        <div className="flex items-center justify-between text-[10px] text-[#7d8590] pt-1 border-t border-[#1a202a]">
          <span className="tabular-nums tracking-wide">
            LOC: {formatCoordinates(gps.lat, gps.lon)}
          </span>
          <span className="uppercase tracking-wider">
            GPS: [{gps.status} ±{gps.accuracy}M]
          </span>
        </div>

        {/* 5. Clear On-Screen Errors if sending or registration fails */}
        {transportError && (
          <div className="mt-0.5 p-1.5 border border-[#6b1e22] bg-[#240e11] text-[#fca5a5] flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 font-bold uppercase">
              <AlertTriangle className="w-3.5 h-3.5 text-[#ef4444] shrink-0" />
              <span>COMM ERROR: {transportError}</span>
            </div>
            {onNavigateToSettings && (
              <button
                onClick={onNavigateToSettings}
                className="underline hover:text-white uppercase font-bold cursor-pointer text-[9px]"
              >
                [FIX IN CONFIG]
              </button>
            )}
          </div>
        )}

        {/* Device Not Registered Warning */}
        {!transportError && hasConfigWarning && (
          <div className="mt-0.5 p-1 border border-[#8c5b1c] bg-[#1c1308] text-[#fcd34d] flex items-center justify-between text-[10px]">
            <div className="flex items-center gap-1.5 font-bold uppercase">
              <Server className="w-3.5 h-3.5 text-[#f59e0b] shrink-0" />
              <span>
                {!settings.serverAddress
                  ? 'HUB ADDRESS NOT CONFIGURED'
                  : 'DEVICE NOT REGISTERED WITH HUB'}
              </span>
            </div>
            {onNavigateToSettings && (
              <button
                onClick={onNavigateToSettings}
                className="underline hover:text-white uppercase font-bold cursor-pointer text-[9px]"
              >
                [OPEN CONFIG]
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
