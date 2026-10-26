/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  if (isInstalled) {
    return (
      <div className="flex items-center gap-2 p-2 border border-[#1c3624] bg-[#0e1711] text-xs font-mono text-[#86efac]">
        <Smartphone className="w-4 h-4 text-[#86efac]" />
        <span className="font-bold tracking-wider">[ STANDALONE MILITARY PWA ACTIVE ]</span>
      </div>
    );
  }

  return (
    <div className="w-full font-mono">
      <button
        onClick={handleInstallClick}
        className="w-full min-h-[42px] border border-[#2a4d35] bg-[#0e1c14] hover:bg-[#14291d] text-[#86efac] font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4 text-[#86efac]" />
        <span>[ INSTALL FIELD UNIT PWA ]</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-[#090b0e]/95 p-4 flex items-center justify-center">
          <div className="w-full max-w-sm border border-[#222935] bg-[#11151c] p-5 flex flex-col gap-4 text-xs font-mono shadow-2xl">
            <h3 className="font-bold text-[#e6edf3] text-sm uppercase tracking-wider">
              INSTALL ON SAFARI (iOS)
            </h3>
            <p className="text-[#cbd5e1] leading-relaxed">
              1. Tap the <strong className="text-white">Share</strong> icon in the Safari toolbar.<br />
              2. Select <strong className="text-white">Add to Home Screen</strong>.<br />
              3. Launch standalone FIELD UNIT directly from your home screen.
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full min-h-[38px] border border-[#222935] bg-[#151a24] text-white hover:border-[#384355] font-bold uppercase transition-colors"
            >
              [ CLOSE ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
