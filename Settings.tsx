/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Key,
  Lock,
  RefreshCw,
  Send,
  Server,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { UnitSettings } from '../types';
import { PWAInstallButton } from './PWAInstallButton';
import { HAPTIC_PATTERNS, triggerHaptic } from '../services/haptics';
import { playTapSound } from '../services/audio';
import {
  getWsConnectionState,
  onWsStateChanged,
  registerDevice,
} from '../services/transport';

interface SettingsProps {
  settings: UnitSettings;
  onUpdateSettings: (newSettings: UnitSettings) => void;
  onSimulateOrder: (priority: 'NORMAL' | 'URGENT') => void;
  onClearData: () => void;
  onLockNow: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
  settings,
  onUpdateSettings,
  onSimulateOrder,
  onClearData,
  onLockNow,
}) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'>(
    getWsConnectionState()
  );

  useEffect(() => {
    const unsub = onWsStateChanged((newStatus) => {
      setWsStatus(newStatus);
    });
    return unsub;
  }, []);

  const handleToggle = (key: keyof UnitSettings) => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, settings.vibrationEnabled);
    playTapSound(settings.soundEnabled);
    onUpdateSettings({
      ...settings,
      [key]: !settings[key],
    });
  };

  const handleBeaconChange = (interval: 10 | 30 | 60) => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, settings.vibrationEnabled);
    playTapSound(settings.soundEnabled);
    onUpdateSettings({
      ...settings,
      beaconInterval: interval,
    });
  };

  const handleInputChange = (field: keyof UnitSettings, val: string) => {
    setRegError(null);
    setRegSuccess(null);
    onUpdateSettings({
      ...settings,
      [field]: val,
    });
  };

  const handleRegister = async () => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, settings.vibrationEnabled);
    playTapSound(settings.soundEnabled);
    setRegError(null);
    setRegSuccess(null);

    const server = (settings.serverAddress || '').trim();
    if (!server) {
      setRegError('Cannot reach server: Please specify a valid Server Address first');
      return;
    }

    const callsign = (settings.callsign || '').trim();
    if (!callsign) {
      setRegError('Operative Callsign is required for registration');
      return;
    }

    const teamCode = (settings.teamCode || '').trim();
    if (!teamCode) {
      setRegError('Team code is required for registration');
      return;
    }

    setIsRegistering(true);
    try {
      const result = await registerDevice(server, callsign, teamCode);

      if (result.success && result.deviceKey) {
        setRegSuccess(`DEVICE REGISTERED // KEY: ${result.deviceKey}`);
        triggerHaptic(HAPTIC_PATTERNS.CONFIRM, settings.vibrationEnabled);
      } else {
        // Display full server error message returned by signal-hub
        setRegError(result.error || 'Cannot reach server');
        triggerHaptic(HAPTIC_PATTERNS.URGENT_ALARM, settings.vibrationEnabled);
      }
    } catch (err: any) {
      setRegError(err?.message || 'Cannot reach server');
      triggerHaptic(HAPTIC_PATTERNS.URGENT_ALARM, settings.vibrationEnabled);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleUnregister = () => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, settings.vibrationEnabled);
    playTapSound(settings.soundEnabled);
    setRegSuccess(null);
    setRegError(null);
    onUpdateSettings({
      ...settings,
      deviceKey: '',
    });
  };

  return (
    <div className="w-full flex flex-col gap-3 pb-6 font-mono text-xs select-none">
      {/* Header */}
      <div className="text-[10px] text-[#7d8590] uppercase font-bold tracking-widest border-b border-[#222935] pb-1.5 flex items-center justify-between">
        <span>UNIT CONFIGURATION // SIGNAL-HUB LINK</span>
        <span>SECURITY LEVEL: NORMAL</span>
      </div>

      {/* PWA Install Button */}
      <PWAInstallButton />

      {/* 4. Server Address Field */}
      <div className="p-3 border border-[#222935] bg-[#11151c] flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#e6edf3] uppercase tracking-widest font-bold flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-[#7dd3fc]" />
            SERVER ADDRESS (SIGNAL-HUB)
          </span>
          <span
            className={`font-bold uppercase text-[9px] px-1.5 py-0.5 border ${
              wsStatus === 'CONNECTED'
                ? 'border-[#2e683e] bg-[#102418] text-[#86efac]'
                : wsStatus === 'CONNECTING'
                ? 'border-[#8c5b1c] bg-[#221609] text-[#fcd34d]'
                : 'border-[#222935] bg-[#090b0e] text-[#7d8590]'
            }`}
          >
            WS: {wsStatus}
          </span>
        </div>
        <input
          type="text"
          value={settings.serverAddress || ''}
          placeholder="http://192.168.1.5:3000"
          onChange={(e) => handleInputChange('serverAddress', e.target.value)}
          onBlur={() => {
            if (settings.serverAddress) {
              handleInputChange('serverAddress', settings.serverAddress.trim());
            }
          }}
          className="h-9 bg-[#090b0e] border border-[#222935] focus:border-[#38719f] px-3 text-xs font-bold text-[#e6edf3] outline-none"
        />
        <div className="flex items-center justify-between text-[10px] text-[#7d8590]">
          <span>Format: http://HOST:PORT (e.g. http://192.168.1.5:3000)</span>
          <span className="text-[#9ca3af]">Never default to localhost</span>
        </div>
      </div>

      {/* 3. Device Registration Section */}
      <div className="p-3 border border-[#222935] bg-[#11151c] flex flex-col gap-2.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#e6edf3] uppercase tracking-widest font-bold flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-[#fcd34d]" />
            DEVICE REGISTRATION & AUTHENTICATION
          </span>
          {settings.deviceKey ? (
            <span className="text-[#86efac] font-bold text-[9px] bg-[#102418] border border-[#2e683e] px-1.5 py-0.5">
              [REGISTERED]
            </span>
          ) : (
            <span className="text-[#fca5a5] font-bold text-[9px] bg-[#240e11] border border-[#6b1e22] px-1.5 py-0.5">
              [NOT REGISTERED]
            </span>
          )}
        </div>

        {/* Current Key Readout if registered */}
        {settings.deviceKey && (
          <div className="p-2 border border-[#2a3e59] bg-[#0d1622] flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[9px] text-[#7dd3fc] uppercase font-bold">ACTIVE DEVICE KEY</span>
              <span className="text-xs font-bold text-white tracking-wider select-all">
                {settings.deviceKey}
              </span>
            </div>
            <button
              onClick={handleUnregister}
              className="text-[10px] text-[#fca5a5] hover:text-white px-2 py-1 border border-[#6b1e22] hover:bg-[#331317] transition-colors cursor-pointer uppercase"
            >
              [UNREGISTER]
            </button>
          </div>
        )}

        {/* Operative Callsign Identity */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[#7d8590] uppercase tracking-widest font-bold">
            OPERATIVE CALLSIGN
          </span>
          <input
            type="text"
            value={settings.callsign || ''}
            placeholder="ALPHA-1"
            onChange={(e) => handleInputChange('callsign', e.target.value)}
            onBlur={() => {
              if (settings.callsign) {
                handleInputChange('callsign', settings.callsign.trim());
              }
            }}
            className="h-9 bg-[#090b0e] border border-[#222935] focus:border-[#38719f] px-3 text-sm font-bold text-[#e6edf3] uppercase outline-none"
          />
        </div>

        {/* Team Code */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-[#7d8590] uppercase tracking-widest font-bold">
            TEAM CODE
          </span>
          <input
            type="text"
            value={settings.teamCode || ''}
            placeholder="BRAVO-TASKFORCE"
            onChange={(e) => handleInputChange('teamCode', e.target.value)}
            onBlur={() => {
              if (settings.teamCode) {
                handleInputChange('teamCode', settings.teamCode.trim());
              }
            }}
            className="h-9 bg-[#090b0e] border border-[#222935] focus:border-[#38719f] px-3 text-sm font-bold text-[#e6edf3] uppercase outline-none"
          />
        </div>

        {/* Full On-screen Server Error Banner */}
        {regError && (
          <div className="p-3 border-2 border-[#b91c1c] bg-[#1a0c0e] text-[#fca5a5] flex items-start gap-2.5 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#ef4444] mt-0.5" />
            <div className="flex flex-col gap-1 w-full">
              <span className="font-bold uppercase tracking-wider text-[11px] text-[#ef4444]">
                SERVER ERROR
              </span>
              <span className="text-xs font-bold text-white break-words bg-[#090b0e] p-2 border border-[#4a181c]">
                {regError}
              </span>
            </div>
          </div>
        )}

        {regSuccess && (
          <div className="p-2 border border-[#2e683e] bg-[#102418] text-[#86efac] flex items-center gap-2 text-xs">
            <CheckCircle className="w-4 h-4 shrink-0 text-[#22c55e]" />
            <span className="font-bold tracking-wider text-[11px]">{regSuccess}</span>
          </div>
        )}

        {/* Action Button: Register with Server */}
        <button
          onClick={handleRegister}
          disabled={isRegistering}
          className={`min-h-[42px] px-3 border font-bold text-xs uppercase tracking-widest transition-colors flex items-center justify-center gap-2 cursor-pointer ${
            isRegistering
              ? 'border-[#222935] bg-[#11151c] text-[#7d8590] cursor-wait'
              : settings.deviceKey
              ? 'border-[#2b4c68] bg-[#122334] text-[#7dd3fc] hover:bg-[#1a334b]'
              : 'border-[#2e683e] bg-[#102418] text-[#86efac] hover:bg-[#163622]'
          }`}
        >
          {isRegistering ? (
            <span>[ CONTACTING SERVER... ]</span>
          ) : settings.deviceKey ? (
            <span>[ RE-REGISTER WITH SERVER ]</span>
          ) : (
            <span>[ REGISTER DEVICE WITH SERVER ]</span>
          )}
        </button>
      </div>

      {/* Network Link Simulator Control */}
      <div className="p-3 border border-[#222935] bg-[#11151c] flex items-center justify-between">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 font-bold text-[#e6edf3] uppercase tracking-wider text-[11px]">
            {settings.isSimulatedOffline ? (
              <WifiOff className="w-3.5 h-3.5 text-[#fcd34d]" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-[#86efac]" />
            )}
            <span>LINK: {settings.isSimulatedOffline ? 'OFFLINE (STORE & FORWARD)' : 'ONLINE (REAL-TIME)'}</span>
          </div>
          <span className="text-[10px] text-[#7d8590] tracking-wide mt-0.5">
            {settings.isSimulatedOffline
              ? 'Signals queued in memory until link reestablished'
              : 'Direct RF / network broadcast channel operational'}
          </span>
        </div>

        <button
          onClick={() => handleToggle('isSimulatedOffline')}
          className={`min-h-[38px] px-3 border text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 ${
            settings.isSimulatedOffline
              ? 'border-[#2e683e] bg-[#102418] text-[#86efac] hover:bg-[#163622]'
              : 'border-[#573b1a] bg-[#1a140b] text-[#fcd34d] hover:bg-[#241a0c]'
          }`}
        >
          {settings.isSimulatedOffline ? (
            <>
              <Wifi className="w-3 h-3 text-[#86efac]" />
              <span>[ SET ONLINE ]</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-[#fcd34d]" />
              <span>[ SET OFFLINE ]</span>
            </>
          )}
        </button>
      </div>

      {/* Auto-Beacon Interval Select */}
      <div className="p-3 border border-[#222935] bg-[#11151c] flex flex-col gap-2">
        <div className="flex justify-between items-center text-[10px]">
          <span className="text-[#7d8590] uppercase tracking-widest font-bold">
            AUTO-BEACON INTERVAL
          </span>
          <span className="text-[#7dd3fc] font-bold">
            RATE: {settings.beaconInterval}S
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {([10, 30, 60] as const).map((sec) => (
            <button
              key={sec}
              onClick={() => handleBeaconChange(sec)}
              className={`h-9 border font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                settings.beaconInterval === sec
                  ? 'border-[#38719f] bg-[#162738] text-[#7dd3fc]'
                  : 'border-[#222935] bg-[#090b0e] text-[#7d8590] hover:border-[#333d4e] hover:text-[#cbd5e1]'
              }`}
            >
              [{sec}S]
            </button>
          ))}
        </div>
      </div>

      {/* Hardware Toggles */}
      <div className="p-3 border border-[#222935] bg-[#11151c] flex flex-col divide-y divide-[#1a202a]">
        {/* Tactical Audio */}
        <div className="flex items-center justify-between py-2 first:pt-0">
          <div className="flex flex-col">
            <span className="text-[#e6edf3] font-bold">SYNTHESIZED AUDIO CUES</span>
            <span className="text-[10px] text-[#7d8590]">Audible alerts on transmissions</span>
          </div>
          <button
            onClick={() => handleToggle('soundEnabled')}
            className={`px-3 py-1 border text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${
              settings.soundEnabled
                ? 'border-[#2e683e] bg-[#102418] text-[#86efac]'
                : 'border-[#222935] bg-[#090b0e] text-[#7d8590]'
            }`}
          >
            {settings.soundEnabled ? '[ ACTIVE ]' : '[ OFF ]'}
          </button>
        </div>

        {/* Haptic Vibration */}
        <div className="flex items-center justify-between py-2">
          <div className="flex flex-col">
            <span className="text-[#e6edf3] font-bold">TACTILE HAPTIC PULSES</span>
            <span className="text-[10px] text-[#7d8590]">Vibratory feedback confirmation</span>
          </div>
          <button
            onClick={() => handleToggle('vibrationEnabled')}
            className={`px-3 py-1 border text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${
              settings.vibrationEnabled
                ? 'border-[#2e683e] bg-[#102418] text-[#86efac]'
                : 'border-[#222935] bg-[#090b0e] text-[#7d8590]'
            }`}
          >
            {settings.vibrationEnabled ? '[ ACTIVE ]' : '[ OFF ]'}
          </button>
        </div>

        {/* Large Text */}
        <div className="flex items-center justify-between py-2">
          <div className="flex flex-col">
            <span className="text-[#e6edf3] font-bold">HIGH-CONTRAST LARGE TYPE</span>
            <span className="text-[10px] text-[#7d8590]">Emergency & night-goggle scale</span>
          </div>
          <button
            onClick={() => handleToggle('largeText')}
            className={`px-3 py-1 border text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${
              settings.largeText
                ? 'border-[#2e683e] bg-[#102418] text-[#86efac]'
                : 'border-[#222935] bg-[#090b0e] text-[#7d8590]'
            }`}
          >
            {settings.largeText ? '[ ACTIVE ]' : '[ OFF ]'}
          </button>
        </div>

        {/* 4-digit lockout */}
        <div className="flex items-center justify-between py-2 last:pb-0">
          <div className="flex flex-col">
            <span className="text-[#e6edf3] font-bold">4-DIGIT TERMINAL LOCK</span>
            <span className="text-[10px] text-[#7d8590]">Field keypad security (0000)</span>
          </div>
          <button
            onClick={() => handleToggle('passcodeEnabled')}
            className={`px-3 py-1 border text-[10px] font-bold tracking-wider transition-colors cursor-pointer ${
              settings.passcodeEnabled
                ? 'border-[#2e683e] bg-[#102418] text-[#86efac]'
                : 'border-[#222935] bg-[#090b0e] text-[#7d8590]'
            }`}
          >
            {settings.passcodeEnabled ? '[ ARMED ]' : '[ OFF ]'}
          </button>
        </div>
      </div>

      {/* Lock terminal immediately button */}
      {settings.passcodeEnabled && (
        <button
          onClick={onLockNow}
          className="w-full min-h-[40px] border border-[#573b1a] bg-[#1a140b] text-[#fcd34d] hover:bg-[#241a0c] font-bold uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <Lock className="w-3.5 h-3.5" />
          <span>[ LOCK TERMINAL NOW ]</span>
        </button>
      )}

      {/* Directive Simulation Sandbox */}
      <div className="p-3 border border-[#222935] bg-[#11151c] flex flex-col gap-2">
        <span className="text-[10px] text-[#7d8590] uppercase tracking-widest font-bold">
          COMMAND DIRECTIVE TEST INJECTION (FIELD TRAINING)
        </span>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSimulateOrder('NORMAL')}
            className="h-10 border border-[#233d59] bg-[#101b26] hover:bg-[#162738] text-[#7dd3fc] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Send className="w-3 h-3 text-[#7dd3fc]" />
            <span>+ ROUTINE</span>
          </button>
          <button
            onClick={() => onSimulateOrder('URGENT')}
            className="h-10 border border-[#6b1e22] bg-[#1c0c0e] hover:bg-[#291114] text-[#fca5a5] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <AlertCircle className="w-3 h-3 text-[#ef4444]" />
            <span>+ FLASH URGENT</span>
          </button>
        </div>
      </div>

      {/* Purge Local Storage */}
      <div className="pt-1">
        {showClearConfirm ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowClearConfirm(false);
                onClearData();
              }}
              className="flex-1 min-h-[42px] bg-[#8c2626] text-white font-bold uppercase tracking-wider border border-[#b91c1c] cursor-pointer"
            >
              [ CONFIRM RESET ALL LOCAL DATA ]
            </button>
            <button
              onClick={() => setShowClearConfirm(false)}
              className="px-4 min-h-[42px] border border-[#222935] bg-[#11151c] text-[#7d8590] font-bold"
            >
              [ CANCEL ]
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full min-h-[40px] border border-[#4a181c] text-[#fca5a5] hover:bg-[#1c0c0e] hover:border-[#6b1e22] bg-[#140b0d] font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>[ PURGE LOCAL BUFFER & RESET TERMINAL ]</span>
          </button>
        )}
      </div>
    </div>
  );
};
