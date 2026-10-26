/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActiveTab,
  CommandOrder,
  GpsLocation,
  SignalPayload,
  UnitSettings,
} from './types';
import {
  acknowledgeOrder,
  addOrder,
  clearAllLocalData,
  enqueueSignal,
  getLastSignal,
  getOrders,
  getQueue,
  getSettings,
  getSignalHistory,
  saveSettings,
} from './services/storage';
import {
  flushSignalQueue,
  getLastTransportError,
  getWsConnectionState,
  initFieldWebSocket,
  isDeviceOnline,
  onCommandOrderReceived,
  onSignalUpdated,
  onTransportError,
  onWsStateChanged,
  sendSignal,
} from './services/transport';
import { getCurrentLocation, initGpsTracking, subscribeToGps } from './services/gps';
import { StatusStrip } from './components/StatusStrip';
import { SosButton } from './components/SosButton';
import { StatusAction, StatusGrid } from './components/StatusGrid';
import { LastSignalCard } from './components/LastSignalCard';
import { Inbox } from './components/Inbox';
import { Settings } from './components/Settings';
import { QueueList } from './components/QueueList';
import { UrgentOrderModal } from './components/UrgentOrderModal';
import { PasscodeLock } from './components/PasscodeLock';
import { Toast, ToastMessage } from './components/Toast';
import { HAPTIC_PATTERNS, triggerHaptic } from './services/haptics';
import { playTapSound } from './services/audio';

const SAMPLE_COMMAND_ORDERS = [
  {
    title: 'HOLD DEFENSIVE POSITION',
    message: 'Maintain defensive posture at current coordinates. Minimize radio signature until reconnaissance patrol returns.',
    priority: 'NORMAL' as const,
  },
  {
    title: 'MOVE TO RALLY POINT ECHO',
    message: 'All callsigns relocate to Grid Echo-4 immediately. Hostile reconnaissance aerial assets detected nearby.',
    priority: 'URGENT' as const,
  },
  {
    title: 'SITREP & TELEMETRY CHECK',
    message: 'Command requests immediate ammunition count, sensor status, and battery capacity assessment.',
    priority: 'NORMAL' as const,
  },
  {
    title: 'FLASH: CONTAMINANT ADVISORY',
    message: 'Suspected irritant plume active in North Valley sector. Don protective gear immediately.',
    priority: 'URGENT' as const,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('HOME');
  const [settings, setSettings] = useState<UnitSettings>(getSettings());
  const [queue, setQueue] = useState<SignalPayload[]>(getQueue());
  const [history, setHistory] = useState<SignalPayload[]>(getSignalHistory());
  const [orders, setOrders] = useState<CommandOrder[]>(getOrders());
  const [gps, setGps] = useState<GpsLocation>(getCurrentLocation());
  const [isOnlineState, setIsOnlineState] = useState<boolean>(isDeviceOnline());
  const [activeUrgentOrder, setActiveUrgentOrder] = useState<CommandOrder | null>(null);
  const [showQueueModal, setShowQueueModal] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [transportError, setTransportError] = useState<string | null>(getLastTransportError());
  const [wsStatus, setWsStatus] = useState<'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'>(
    getWsConnectionState()
  );

  const beaconTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    initGpsTracking();
    initFieldWebSocket();

    const unsubscribeGps = subscribeToGps((newLoc) => {
      setGps(newLoc);
    });

    const unsubscribeSignal = onSignalUpdated(() => {
      setQueue(getQueue());
      setHistory(getSignalHistory());
    });

    const unsubscribeOrder = onCommandOrderReceived((newOrder) => {
      setOrders(getOrders());
      if (newOrder.priority === 'URGENT' && !newOrder.acknowledged) {
        setActiveUrgentOrder(newOrder);
      }
    });

    const unsubscribeError = onTransportError((err) => {
      setTransportError(err);
      if (err) {
        showToast('warning', 'COMM ERROR', err);
      }
    });

    const unsubscribeWs = onWsStateChanged((status) => {
      setWsStatus(status);
    });

    const handleOnlineStatus = () => {
      const online = isDeviceOnline();
      setIsOnlineState(online);
      if (online) {
        showToast('success', 'LINK RESTORED', 'Flushing pending signal buffer');
        initFieldWebSocket();
        flushSignalQueue().then((flushed) => {
          if (flushed > 0) {
            setQueue(getQueue());
            setHistory(getSignalHistory());
          }
        });
      } else {
        showToast('warning', 'OFFLINE LINK', 'Signals buffered locally in queue');
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    const existingOrders = getOrders();
    const urgentUnacked = existingOrders.find(
      (o) => o.priority === 'URGENT' && !o.acknowledged
    );
    if (urgentUnacked) {
      setActiveUrgentOrder(urgentUnacked);
    }

    return () => {
      unsubscribeGps();
      unsubscribeSignal();
      unsubscribeOrder();
      unsubscribeError();
      unsubscribeWs();
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  useEffect(() => {
    setIsOnlineState(isDeviceOnline());
    initFieldWebSocket();
  }, [settings.isSimulatedOffline, settings.serverAddress, settings.deviceKey]);

  useEffect(() => {
    if (beaconTimerRef.current) {
      clearInterval(beaconTimerRef.current);
    }

    const intervalMs = settings.beaconInterval * 1000;
    beaconTimerRef.current = setInterval(async () => {
      const currentLoc = getCurrentLocation();
      const beaconSignal: SignalPayload = {
        id: `sig-bcn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        unit: settings.callsign || 'ALPHA-1',
        type: 'BEACON',
        subType: 'AUTO BEACON',
        priority: 'normal',
        lat: currentLoc.lat,
        lon: currentLoc.lon,
        timestamp: Date.now(),
        status: 'QUEUED',
      };

      enqueueSignal(beaconSignal);
      setQueue(getQueue());
      setHistory(getSignalHistory());
      await sendSignal(beaconSignal);
      setQueue(getQueue());
      setHistory(getSignalHistory());
    }, intervalMs);

    return () => {
      if (beaconTimerRef.current) {
        clearInterval(beaconTimerRef.current);
      }
    };
  }, [settings.beaconInterval, settings.callsign]);

  const showToast = (type: 'success' | 'warning' | 'info', title: string, message?: string) => {
    setToast({
      id: String(Date.now()),
      type,
      title,
      message,
    });
  };

  const handleSendStatus = async (action: StatusAction) => {
    const currentLoc = getCurrentLocation();
    const signal: SignalPayload = {
      id: `sig-stat-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      unit: settings.callsign || 'ALPHA-1',
      type: action.type,
      subType: action.subType,
      priority: action.priority,
      lat: currentLoc.lat,
      lon: currentLoc.lon,
      timestamp: Date.now(),
      status: 'QUEUED',
    };

    enqueueSignal(signal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    const online = isDeviceOnline();
    const success = await sendSignal(signal);

    setQueue(getQueue());
    setHistory(getSignalHistory());

    if (success) {
      showToast('success', `${action.label} TRANSMITTED & CONFIRMED`);
    } else {
      const err = getLastTransportError();
      if (!online) {
        showToast('warning', `${action.label} BUFFERED (OFFLINE)`);
      } else {
        showToast('warning', `${action.label} HELD IN QUEUE`, err || 'Server error - retrying');
      }
    }
  };

  const handleSendBeacon = async () => {
    const currentLoc = getCurrentLocation();
    const signal: SignalPayload = {
      id: `sig-mbcn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      unit: settings.callsign || 'ALPHA-1',
      type: 'BEACON',
      subType: 'POSITION BEACON',
      priority: 'normal',
      lat: currentLoc.lat,
      lon: currentLoc.lon,
      timestamp: Date.now(),
      status: 'QUEUED',
    };

    enqueueSignal(signal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    const success = await sendSignal(signal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    if (success) {
      showToast('info', 'POSITION PING CONFIRMED BY HUB');
    } else {
      const err = getLastTransportError();
      showToast('warning', 'POSITION PING QUEUED', err || 'Retrying');
    }
  };

  const handleTriggerSos = async () => {
    const currentLoc = getCurrentLocation();
    const signal: SignalPayload = {
      id: `sig-sos-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      unit: settings.callsign || 'ALPHA-1',
      type: 'SOS',
      subType: 'EMERGENCY DISTRESS BEACON',
      priority: 'critical',
      lat: currentLoc.lat,
      lon: currentLoc.lon,
      note: 'CRITICAL DISTRESS BEACON TRANSMITTED OVERRIDE.',
      timestamp: Date.now(),
      status: 'QUEUED',
    };

    enqueueSignal(signal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    const success = await sendSignal(signal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    if (success) {
      showToast('warning', 'EMERGENCY SOS CONFIRMED BY HUB');
    } else {
      const err = getLastTransportError();
      showToast('warning', 'SOS BUFFERED IN QUEUE', err || 'Retrying...');
    }
  };

  const handleCancelSos = async () => {
    const currentLoc = getCurrentLocation();
    const signal: SignalPayload = {
      id: `sig-soscan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      unit: settings.callsign || 'ALPHA-1',
      type: 'STATUS',
      subType: 'ALL CLEAR (SOS ABORTED)',
      priority: 'normal',
      lat: currentLoc.lat,
      lon: currentLoc.lon,
      note: 'Distress beacon cancelled by field operative.',
      timestamp: Date.now(),
      status: 'QUEUED',
    };

    enqueueSignal(signal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    await sendSignal(signal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    showToast('success', 'SOS BEACON ABORT TRANSMITTED');
  };

  const handleAcknowledgeOrder = async (orderId: string) => {
    acknowledgeOrder(orderId);
    setOrders(getOrders());
    setActiveUrgentOrder(null);

    const currentLoc = getCurrentLocation();
    const ackSignal: SignalPayload = {
      id: `sig-ack-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      unit: settings.callsign || 'ALPHA-1',
      type: 'ACK',
      subType: 'DIRECTIVE ACKNOWLEDGED',
      priority: 'normal',
      lat: currentLoc.lat,
      lon: currentLoc.lon,
      note: `Receipt verified for Directive #${orderId.slice(-6).toUpperCase()}`,
      timestamp: Date.now(),
      status: 'QUEUED',
    };

    enqueueSignal(ackSignal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    await sendSignal(ackSignal);
    setQueue(getQueue());
    setHistory(getSignalHistory());

    showToast('success', 'DIRECTIVE RECEIPT DISPATCHED');
  };

  const handleSimulateOrder = (priority: 'NORMAL' | 'URGENT') => {
    const candidates = SAMPLE_COMMAND_ORDERS.filter((o) => o.priority === priority);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)] || SAMPLE_COMMAND_ORDERS[0];

    const newOrder: CommandOrder = {
      id: `ord-sim-${Date.now()}`,
      sender: 'COMMAND HQ (SIM)',
      title: chosen.title,
      message: chosen.message,
      priority: chosen.priority,
      timestamp: Date.now(),
      acknowledged: false,
    };

    addOrder(newOrder);
    setOrders(getOrders());

    if (newOrder.priority === 'URGENT') {
      setActiveUrgentOrder(newOrder);
    } else {
      showToast('info', 'TEST DIRECTIVE INJECTED', newOrder.title);
    }
  };

  const handleUpdateSettings = (newSettings: UnitSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleClearData = () => {
    clearAllLocalData();
    setSettings(getSettings());
    setQueue([]);
    setHistory([]);
    setOrders(getOrders());
    showToast('info', 'LOCAL BUFFER & CONFIG PURGED');
  };

  const handleTabChange = (tab: ActiveTab) => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, settings.vibrationEnabled);
    playTapSound(settings.soundEnabled);
    setActiveTab(tab);
  };

  const pendingQueuedCount = queue.filter((i) => i.status === 'QUEUED').length;
  const unreadOrdersCount = orders.filter((o) => !o.acknowledged).length;
  const lastSignal = getLastSignal();

  return (
    <div
      className={`min-h-screen w-full bg-[#0c0e12] text-[#f1f5f9] flex flex-col justify-between font-mono select-none antialiased ${
        settings.largeText ? 'text-base' : 'text-sm'
      }`}
    >
      {/* Security Passcode Intercept */}
      {settings.passcodeEnabled && isLocked && (
        <PasscodeLock
          correctPasscode={settings.passcode || '0000'}
          onUnlock={() => setIsLocked(false)}
          soundEnabled={settings.soundEnabled}
          vibrationEnabled={settings.vibrationEnabled}
        />
      )}

      {/* Urgent Order Full-Screen Alert */}
      {activeUrgentOrder && (
        <UrgentOrderModal
          order={activeUrgentOrder}
          soundEnabled={settings.soundEnabled}
          vibrationEnabled={settings.vibrationEnabled}
          onAcknowledge={handleAcknowledgeOrder}
        />
      )}

      {/* Queue Drawer */}
      {showQueueModal && (
        <QueueList
          queue={queue}
          history={history}
          isOnline={isOnlineState}
          soundEnabled={settings.soundEnabled}
          vibrationEnabled={settings.vibrationEnabled}
          onClose={() => setShowQueueModal(false)}
          onFlushQueue={() => {
            flushSignalQueue().then(() => {
              setQueue(getQueue());
              setHistory(getSignalHistory());
            });
          }}
        />
      )}

      {/* Toast Feedback */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Top Status Strip */}
      <StatusStrip
        settings={settings}
        isOnline={isOnlineState}
        queuedCount={pendingQueuedCount}
        gps={gps}
        transportError={transportError}
        wsStatus={wsStatus}
        onOpenQueue={() => setShowQueueModal(true)}
        onNavigateToSettings={() => setActiveTab('SETTINGS')}
      />

      {/* Main Tactical Screen Container */}
      <main className="flex-1 w-full max-w-2xl mx-auto p-3.5 pb-24 overflow-y-auto">
        {/* Screen 1: SIGNALS (HOME) */}
        {activeTab === 'HOME' && (
          <div className="flex flex-col gap-3">
            <SosButton
              onTriggerSos={handleTriggerSos}
              onCancelSos={handleCancelSos}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.vibrationEnabled}
            />

            <StatusGrid
              onSendStatus={handleSendStatus}
              onSendBeacon={handleSendBeacon}
              soundEnabled={settings.soundEnabled}
              vibrationEnabled={settings.vibrationEnabled}
            />

            <LastSignalCard
              signal={lastSignal}
              onOpenQueue={() => setShowQueueModal(true)}
            />
          </div>
        )}

        {/* Screen 2: DIRECTIVES (INBOX) */}
        {activeTab === 'INBOX' && (
          <Inbox
            orders={orders}
            soundEnabled={settings.soundEnabled}
            vibrationEnabled={settings.vibrationEnabled}
            onAcknowledgeOrder={handleAcknowledgeOrder}
            onSimulateOrder={handleSimulateOrder}
          />
        )}

        {/* Screen 3: CONFIG (SETTINGS) */}
        {activeTab === 'SETTINGS' && (
          <Settings
            settings={settings}
            onUpdateSettings={handleUpdateSettings}
            onSimulateOrder={handleSimulateOrder}
            onClearData={handleClearData}
            onLockNow={() => setIsLocked(true)}
          />
        )}
      </main>

      {/* Tactical Military Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#090b0e] border-t border-[#222935] px-3 py-2 select-none">
        <div className="max-w-2xl mx-auto grid grid-cols-3 items-center h-11 text-xs font-mono font-bold tracking-wider gap-2">
          {/* TAB 1: SIGNALS */}
          <button
            onClick={() => handleTabChange('HOME')}
            className={`h-full flex items-center justify-center gap-1.5 transition-colors border cursor-pointer ${
              activeTab === 'HOME'
                ? 'border-[#38719f] bg-[#162738] text-[#7dd3fc]'
                : 'border-[#222935] bg-[#11151c] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#384355]'
            }`}
          >
            <span className="whitespace-nowrap text-[11px]">01 // SIGNALS</span>
          </button>

          {/* TAB 2: DIRECTIVES */}
          <button
            onClick={() => handleTabChange('INBOX')}
            className={`relative h-full flex items-center justify-center gap-1.5 transition-colors border cursor-pointer ${
              activeTab === 'INBOX'
                ? 'border-[#38719f] bg-[#162738] text-[#7dd3fc]'
                : 'border-[#222935] bg-[#11151c] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#384355]'
            }`}
          >
            <span className="whitespace-nowrap text-[11px]">02 // ORDERS</span>
            {unreadOrdersCount > 0 && (
              <span className="ml-1 px-1 py-0.2 bg-[#8c2626] text-white text-[9px] font-bold border border-[#b91c1c]">
                {unreadOrdersCount}
              </span>
            )}
          </button>

          {/* TAB 3: CONFIG */}
          <button
            onClick={() => handleTabChange('SETTINGS')}
            className={`h-full flex items-center justify-center gap-1.5 transition-colors border cursor-pointer ${
              activeTab === 'SETTINGS'
                ? 'border-[#38719f] bg-[#162738] text-[#7dd3fc]'
                : 'border-[#222935] bg-[#11151c] text-[#7d8590] hover:text-[#e6edf3] hover:border-[#384355]'
            }`}
          >
            <span className="whitespace-nowrap text-[11px]">03 // CONFIG</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
