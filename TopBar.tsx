import React, { useState, useEffect } from 'react';
import { TacticalUnit, ConnectionState } from '../types/tactical';
import { 
  Radio, 
  FileText, 
  Send,
  Settings,
  LogOut,
  Server
} from 'lucide-react';

interface TopBarProps {
  units: TacticalUnit[];
  connectionState: ConnectionState;
  onOpenOrderModal: () => void;
  onOpenSignalLog: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  units,
  connectionState,
  onOpenOrderModal,
  onOpenSignalLog,
  onOpenSettings,
  onLogout,
}) => {
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setUtcTime(now.toISOString().substring(11, 19) + ' UTC');
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const activeUnitsCount = units.filter((u) => u.status === 'ACTIVE').length;
  const sosUnitsCount = units.filter((u) => u.status === 'SOS').length;

  const getLinkStatusDisplay = () => {
    switch (connectionState.status) {
      case 'CONNECTED':
        return {
          label: 'LINK: NOMINAL',
          color: 'text-[#6e8a99]',
          dotColor: 'bg-[#5eab72]',
        };
      case 'RESTORED':
        return {
          label: 'LINK: RESTORED',
          color: 'text-[#6ee7b7]',
          dotColor: 'bg-[#6ee7b7]',
        };
      case 'RECONNECTING':
        return {
          label: `LINK: RECONNECTING (${connectionState.retryCountdown}s)`,
          color: 'text-[#e09b9b]',
          dotColor: 'bg-[#e07575]',
        };
      case 'CONNECTING':
        return {
          label: 'LINK: CONNECTING...',
          color: 'text-[#e0b06c]',
          dotColor: 'bg-[#e0b06c]',
        };
      default:
        return {
          label: 'LINK: DISCONNECTED',
          color: 'text-[#6b7b85]',
          dotColor: 'bg-[#6b7b85]',
        };
    }
  };

  const linkStatus = getLinkStatusDisplay();
  const hostDisplay = connectionState.serverUrl.replace(/^https?:\/\//, '');

  return (
    <header className="bg-[#121619] border-b border-[#1c2226] px-4 py-2 flex flex-wrap items-center justify-between gap-4 text-xs tracking-wider z-20 select-none font-mono">
      {/* Brand & Connection */}
      <div className="flex items-center gap-4 shrink-0">
        <span className="font-normal text-[#d1dce2] uppercase tracking-widest text-sm">
          TIRANG
        </span>

        <div className={`flex items-center gap-1.5 text-[11px] ${linkStatus.color}`}>
          <Radio className="w-3.5 h-3.5" />
          <span className="font-normal">{linkStatus.label}</span>
        </div>

        <button
          onClick={onOpenSettings}
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 bg-[#14181c] border border-[#232b31] text-[#788f9e] hover:text-[#b8c9d4] hover:bg-[#1b2228] transition-colors cursor-pointer text-[10px] font-normal"
          title="Configure Server Address"
        >
          <Server className="w-2.5 h-2.5 text-[#5e7865]" />
          <span className="truncate max-w-[150px]">{hostDisplay}</span>
        </button>
      </div>

      {/* Zulu Time & Status counts */}
      <div className="flex items-center gap-6 text-[11px]">
        <div className="text-[#96aab5] font-mono tabular-nums font-normal">
          <span className="text-[#516067] mr-1.5 font-normal">ZULU</span>
          {utcTime || '00:00:00 UTC'}
        </div>

        <div className="flex items-center gap-4 font-normal">
          <div className="flex items-center gap-1.5">
            <span className="text-[#5e6d76]">UNITS</span>
            <span className="text-[#b4c3cb] font-normal font-mono">
              {activeUnitsCount}/{units.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#5e6d76]">SOS</span>
            <span
              className={`font-normal font-mono ${
                sosUnitsCount > 0 ? 'text-[#e06c6c]' : 'text-[#6e7d86]'
              }`}
            >
              {sosUnitsCount > 0 ? `${sosUnitsCount} ACTIVE` : 'NONE'}
            </span>
          </div>
        </div>
      </div>

      {/* Actions: Order, Log, Settings, Logout */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onOpenOrderModal}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#1a2329] text-[#93b3c4] hover:bg-[#202c34] transition-colors cursor-pointer text-[11px] uppercase font-mono font-normal"
        >
          <Send className="w-3 h-3" />
          <span>ORDER</span>
        </button>

        <button
          onClick={onOpenSignalLog}
          className="flex items-center gap-1.5 px-3 py-1 bg-[#15191c] text-[#80919b] hover:text-[#b8c7cf] hover:bg-[#1b2024] transition-colors cursor-pointer text-[11px] uppercase font-mono font-normal"
        >
          <FileText className="w-3 h-3" />
          <span>LOG</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 px-2.5 py-1 bg-[#15191c] text-[#80919b] hover:text-[#b8c7cf] hover:bg-[#1b2024] transition-colors cursor-pointer text-[11px] uppercase font-mono font-normal"
          title="Server Settings"
        >
          <Settings className="w-3 h-3" />
          <span className="hidden md:inline">CONFIG</span>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[#261616] border border-[#4a2121] text-[#d67e7e] hover:bg-[#381e1e] hover:text-[#ffd6d6] transition-colors cursor-pointer text-[11px] uppercase font-mono font-normal"
          title="Sign out operator"
        >
          <LogOut className="w-3 h-3" />
          <span>LOGOUT</span>
        </button>
      </div>
    </header>
  );
};
