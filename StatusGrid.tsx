/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SignalPriority, SignalType } from '../types';
import { HAPTIC_PATTERNS, triggerHaptic } from '../services/haptics';
import { playSentSound, playTapSound } from '../services/audio';

export interface StatusAction {
  id: string;
  code: string;
  label: string;
  type: SignalType;
  subType: string;
  priority: SignalPriority;
  shortTag: string;
  panelStyle: string;
  badgeStyle: string;
}

const STATUS_ACTIONS: StatusAction[] = [
  {
    id: 'act-moving',
    code: '01',
    label: 'MOVING',
    type: 'STATUS',
    subType: 'MOVING',
    priority: 'normal',
    shortTag: 'TRANSIT',
    panelStyle: 'border-[#222935] bg-[#11151c] hover:border-[#384355] hover:bg-[#151a24]',
    badgeStyle: 'text-[#8b949e]',
  },
  {
    id: 'act-in-position',
    code: '02',
    label: 'IN POSITION',
    type: 'STATUS',
    subType: 'IN POSITION',
    priority: 'normal',
    shortTag: 'HOLDING',
    panelStyle: 'border-[#1b2738] bg-[#101622] hover:border-[#2a3e59] hover:bg-[#141c2c]',
    badgeStyle: 'text-[#7dd3fc]',
  },
  {
    id: 'act-all-clear',
    code: '03',
    label: 'ALL CLEAR',
    type: 'STATUS',
    subType: 'ALL CLEAR',
    priority: 'normal',
    shortTag: 'SECURE',
    panelStyle: 'border-[#1c3022] bg-[#0e1711] hover:border-[#2a4d35] hover:bg-[#121f17]',
    badgeStyle: 'text-[#86efac]',
  },
  {
    id: 'act-need-support',
    code: '04',
    label: 'NEED SUPPORT',
    type: 'STATUS',
    subType: 'NEED SUPPORT',
    priority: 'high',
    shortTag: 'ASSIST',
    panelStyle: 'border-[#382613] bg-[#17120a] hover:border-[#52371a] hover:bg-[#1f170c]',
    badgeStyle: 'text-[#fcd34d]',
  },
  {
    id: 'act-under-threat',
    code: '05',
    label: 'UNDER THREAT',
    type: 'STATUS',
    subType: 'UNDER THREAT',
    priority: 'critical',
    shortTag: 'CONTACT',
    panelStyle: 'border-[#4a181c] bg-[#170c0e] hover:border-[#6e2228] hover:bg-[#200e12]',
    badgeStyle: 'text-[#fca5a5]',
  },
];

interface StatusGridProps {
  onSendStatus: (action: StatusAction) => void;
  onSendBeacon: () => void;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export const StatusGrid: React.FC<StatusGridProps> = ({
  onSendStatus,
  onSendBeacon,
  soundEnabled,
  vibrationEnabled,
}) => {
  const handleActionClick = (action: StatusAction) => {
    triggerHaptic(HAPTIC_PATTERNS.STATUS_SEND, vibrationEnabled);
    playTapSound(soundEnabled);
    playSentSound(soundEnabled);
    onSendStatus(action);
  };

  const handleBeaconClick = () => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, vibrationEnabled);
    playTapSound(soundEnabled);
    playSentSound(soundEnabled);
    onSendBeacon();
  };

  return (
    <div className="w-full flex flex-col gap-2 font-mono select-none">
      <div className="flex items-center justify-between text-[10px] text-[#7d8590] tracking-widest px-0.5 uppercase">
        <span>TACTICAL SIGNALS // DIRECT TRANSMIT</span>
        <span>HUD REV-4</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {STATUS_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => handleActionClick(action)}
            className={`min-h-[68px] p-3 text-left border flex flex-col justify-between transition-colors active:scale-[0.99] cursor-pointer ${action.panelStyle}`}
          >
            <div className="flex items-center justify-between text-[10px] tracking-wider">
              <span className="font-bold text-[#7d8590]">{action.code}</span>
              <span className={`font-bold uppercase tracking-widest text-[9px] ${action.badgeStyle}`}>
                [{action.shortTag}]
              </span>
            </div>
            <div className="text-xs sm:text-sm font-bold tracking-wider uppercase leading-none mt-2 text-[#e6edf3]">
              {action.label}
            </div>
          </button>
        ))}

        {/* 6th Slot: GPS Position Beacon Ping */}
        <button
          onClick={handleBeaconClick}
          className="min-h-[68px] p-3 text-left border border-[#1b2b36] bg-[#0d161c] hover:border-[#274254] hover:bg-[#111e26] flex flex-col justify-between transition-colors active:scale-[0.99] cursor-pointer"
        >
          <div className="flex items-center justify-between text-[10px] tracking-wider">
            <span className="font-bold text-[#7d8590]">06</span>
            <span className="font-bold text-[#7dd3fc] uppercase tracking-widest text-[9px]">
              [GPS FIX]
            </span>
          </div>
          <div className="text-xs sm:text-sm font-bold tracking-wider uppercase leading-none mt-2 text-[#e6edf3]">
            PING BEACON
          </div>
        </button>
      </div>
    </div>
  );
};
