import React, { useState, useEffect } from 'react';
import { Server, X, Check, RefreshCw } from 'lucide-react';
import { signalHubClient } from '../services/signalHubClient';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newUrl: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [url, setUrl] = useState<string>('');
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUrl(signalHubClient.getServerUrl());
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    if (!url.trim()) return;
    setIsTesting(true);
    setTestResult(null);

    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'http://' + clean;
    }
    clean = clean.replace(/\/+$/, '');

    try {
      const res = await fetch(`${clean}/api/units`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Status 200 or 401 both mean the server was reached!
      if (res.ok || res.status === 401) {
        setTestResult({
          ok: true,
          message: `Server reachable at ${clean} (HTTP ${res.status})`,
        });
      } else {
        setTestResult({
          ok: false,
          message: `Server returned HTTP ${res.status}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || 'Connection failed. Check host IP and port.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onSave(url.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 select-none">
      <div className="relative w-full max-w-md bg-[#13171a] border border-[#232b30] p-5 font-mono text-xs shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#20272c] pb-2.5 mb-3.5">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#7ec28c]" />
            <h2 className="text-[#c7d5dc] text-xs uppercase tracking-wider font-normal">
              SERVER CONFIGURATION
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#657680] hover:text-[#c7d5dc] cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[10px] text-[#71828c] uppercase tracking-wider mb-1 font-normal">
              SIGNAL-HUB SERVER ADDRESS
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setTestResult(null);
              }}
              placeholder="http://192.168.1.5:3000"
              required
              className="w-full bg-[#0d1012] border border-[#222a30] text-[#c7d5dc] px-3 py-1.5 text-xs focus:outline-none focus:border-[#3d515e] font-mono font-normal"
            />
            <p className="text-[9.5px] text-[#55646d] mt-1.5 font-normal leading-normal">
              Specify your host machine IP (e.g. <code className="text-[#88b0a0]">http://192.168.1.5:3000</code>).
              Do not use localhost when accessing from another device or container.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-2 border text-[10.5px] font-normal ${
                testResult.ok
                  ? 'bg-[#15291b] border-[#2b5936] text-[#7dd994]'
                  : 'bg-[#291717] border-[#5e2828] text-[#e09b9b]'
              }`}
            >
              {testResult.message}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1e252a]">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !url.trim()}
              className="flex items-center gap-1.5 px-3 py-1 bg-[#1a2329] border border-[#2b3a45] text-[#9ac1d6] hover:bg-[#22313b] transition-colors cursor-pointer text-xs font-normal uppercase"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test ping</span>
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 border border-[#242c32] text-[#75848c] hover:text-[#b0bcc2] cursor-pointer uppercase text-xs font-normal"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3.5 py-1 bg-[#203126] border border-[#3b5942] text-[#8fd69b] hover:bg-[#293d2f] transition-colors cursor-pointer text-xs uppercase font-normal"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Connect</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
