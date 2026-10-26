import React from 'react';
import { AlertTriangle, CheckCircle, RefreshCw, Settings } from 'lucide-react';
import { ConnectionState } from '../types/tactical';

interface ReconnectingBannerProps {
  connectionState: ConnectionState;
  onChangeServerClick: () => void;
  onRetryNow?: () => void;
}

export const ReconnectingBanner: React.FC<ReconnectingBannerProps> = ({
  connectionState,
  onChangeServerClick,
  onRetryNow,
}) => {
  const { status, attempt, retryCountdown, lastUpdateTime } = connectionState;

  if (status === 'RESTORED') {
    return (
      <div className="w-full bg-[#122b1c] border-b border-[#2d6641] px-4 py-1.5 flex items-center justify-between text-xs font-mono text-[#86e2a2] z-40 select-none animate-pulse">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#72df94]" />
          <span className="font-normal uppercase tracking-wider">
            LINK RESTORED — TELEMETRY AND POSITIONS SYNCHRONIZED
          </span>
        </div>
        <span className="text-[10px] text-[#55996c] uppercase font-normal">
          LIVE FEED
        </span>
      </div>
    );
  }

  if (status !== 'RECONNECTING') {
    return null;
  }

  return (
    <div className="w-full bg-[#291717] border-b border-[#782828] px-4 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#e69f9f] z-40 select-none">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-[#ea7474] shrink-0 animate-pulse" />
        <span className="font-normal uppercase tracking-wider text-[#ffd6d6]">
          LINK LOST - RECONNECTING (attempt {attempt}, next retry in {retryCountdown}s)
        </span>
        {lastUpdateTime && (
          <span className="text-[10px] text-[#aa7a7a] font-normal hidden md:inline">
            · DISPLAYING STALE DATA (LAST SEEN {lastUpdateTime})
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[11px]">
        {onRetryNow && (
          <button
            onClick={onRetryNow}
            className="flex items-center gap-1 text-[#d8a4a4] hover:text-white transition-colors cursor-pointer font-normal underline"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry now</span>
          </button>
        )}
        <button
          onClick={onChangeServerClick}
          className="flex items-center gap-1 text-[#e8b388] hover:text-white transition-colors cursor-pointer font-normal underline"
        >
          <Settings className="w-3 h-3" />
          <span>Change server address</span>
        </button>
      </div>
    </div>
  );
};
