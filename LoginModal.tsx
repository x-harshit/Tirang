import React, { useState } from 'react';
import { Radio, Lock, Server, User, AlertCircle, ArrowRight } from 'lucide-react';
import { signalHubClient } from '../services/signalHubClient';

interface LoginModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onSuccess }) => {
  const [serverAddress, setServerAddress] = useState<string>(
    signalHubClient.getServerUrl() || 'http://192.168.1.5:3000'
  );
  const [username, setUsername] = useState<string>('admin');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverAddress.trim()) {
      setError('Server address is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signalHubClient.login(serverAddress.trim(), username.trim(), password);
      setLoading(false);
      onSuccess();
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Authentication failed. Verify server URL and credentials.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 select-none">
      <div className="relative w-full max-w-md bg-[#13171a] border border-[#232b30] p-6 font-mono text-xs shadow-2xl">
        {/* Header HUD Brackets */}
        <div className="flex items-center justify-between border-b border-[#20272c] pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#7ec28c]" />
            <h1 className="text-[#d1dce2] text-sm uppercase tracking-wider font-normal">
              TIRANG COMMAND LINK
            </h1>
          </div>
          <span className="text-[10px] text-[#5e707a] font-normal uppercase">
            AUTH REQUIRED
          </span>
        </div>

        <p className="text-[11px] text-[#7d8f99] mb-4 font-normal leading-relaxed">
          Establish secure tactical feed to the remote Signal-Hub server. Enter the host IP address and operator credentials.
        </p>

        {error && (
          <div className="mb-4 p-2.5 bg-[#2b1616] border border-[#6b2a2a] text-[#e09b9b] text-[11px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#e07575] shrink-0" />
            <span className="font-normal">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Server URL Input */}
          <div>
            <label className="block text-[10px] text-[#71828c] uppercase tracking-wider mb-1 font-normal flex items-center gap-1.5">
              <Server className="w-3 h-3 text-[#5e7865]" />
              <span>SERVER ADDRESS (IP & PORT)</span>
            </label>
            <input
              type="text"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="http://192.168.1.5:3000"
              required
              className="w-full bg-[#0d1012] border border-[#222a30] text-[#c7d5dc] px-3 py-1.5 text-xs focus:outline-none focus:border-[#3d515e] font-mono font-normal"
            />
            <span className="text-[9px] text-[#55646d] block mt-1 font-normal">
              Target IP must be reachable (e.g. laptop local network IP, not localhost).
            </span>
          </div>

          {/* Username Input */}
          <div>
            <label className="block text-[10px] text-[#71828c] uppercase tracking-wider mb-1 font-normal flex items-center gap-1.5">
              <User className="w-3 h-3 text-[#5e7865]" />
              <span>OPERATOR USERNAME</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              className="w-full bg-[#0d1012] border border-[#222a30] text-[#c7d5dc] px-3 py-1.5 text-xs focus:outline-none focus:border-[#3d515e] font-mono font-normal"
            />
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-[10px] text-[#71828c] uppercase tracking-wider mb-1 font-normal flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-[#5e7865]" />
              <span>ACCESS PASSWORD</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
              className="w-full bg-[#0d1012] border border-[#222a30] text-[#c7d5dc] px-3 py-1.5 text-xs focus:outline-none focus:border-[#3d515e] font-mono font-normal"
            />
          </div>

          {/* Action button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 px-4 bg-[#1f2d25] border border-[#3b5942] text-[#8fd69b] hover:bg-[#283b30] transition-colors cursor-pointer text-xs uppercase font-normal tracking-wider flex items-center justify-center gap-2 ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <div className="w-3 h-3 border border-[#8fd69b] border-t-transparent rounded-full animate-spin" />
                  <span>CONNECTING...</span>
                </>
              ) : (
                <>
                  <span>AUTHENTICATE & CONNECT</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Footer info */}
        <div className="mt-4 pt-3 border-t border-[#1b2126] text-[10px] text-[#4f5e66] flex justify-between font-normal">
          <span>PORT: 3000 DEFAULT</span>
          <span>WEBSOCKET / REST</span>
        </div>
      </div>
    </div>
  );
};
