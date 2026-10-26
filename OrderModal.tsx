import React, { useState } from 'react';
import { TacticalUnit } from '../types/tactical';
import { Send, X } from 'lucide-react';

interface OrderModalProps {
  units: TacticalUnit[];
  initialTargetUnit?: TacticalUnit | null;
  isOpen: boolean;
  onClose: () => void;
  onDispatchOrder: (
    targetCallsign: string,
    title: string,
    customMessage: string,
    priority: 'NORMAL' | 'URGENT'
  ) => void;
}

const TEMPLATES = [
  'HOLD POSITION',
  'MOVE TO RALLY POINT',
  'RETURN TO BASE',
  'REPORT STATUS',
  'SURVEILLANCE MODE',
  'RADIO SILENCE',
];

export const OrderModal: React.FC<OrderModalProps> = ({
  units,
  initialTargetUnit,
  isOpen,
  onClose,
  onDispatchOrder,
}) => {
  const [targetCallsign, setTargetCallsign] = useState<string>(
    initialTargetUnit ? initialTargetUnit.callsign : 'ALL UNITS'
  );
  const [selectedTemplate, setSelectedTemplate] = useState<string>('HOLD POSITION');
  const [customText, setCustomText] = useState<string>('');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onDispatchOrder(targetCallsign, selectedTemplate, customText, priority);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 select-none">
      <div className="relative w-full max-w-md bg-[#14181b] border border-[#262f36] p-4 font-mono text-xs shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#212930] pb-2 mb-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#7595a8]" />
            <h2 className="text-[#c7d5dc] font-normal text-xs tracking-wider uppercase">
              TRANSMIT DIRECTIVE
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#627178] hover:text-[#c7d5dc] cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Unit Selector */}
          <div>
            <label className="block text-[10px] text-[#788992] mb-1 uppercase tracking-wider">
              TARGET UNIT
            </label>
            <select
              value={targetCallsign}
              onChange={(e) => setTargetCallsign(e.target.value)}
              className="w-full bg-[#0e1113] border border-[#232c32] text-[#c2d0d7] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#3d4e59] font-mono"
            >
              <option value="ALL UNITS">⚡ ALL UNITS (BROADCAST DIRECTIVE)</option>
              {units.map((u) => (
                <option key={u.id} value={u.callsign}>
                  {u.callsign} · {u.code} - {u.role} ({u.status})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Mission Templates */}
          <div>
            <label className="block text-[10px] text-[#788992] mb-1 uppercase tracking-wider">
              DIRECTIVE TEMPLATE
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map((tmpl) => (
                <button
                  type="button"
                  key={tmpl}
                  onClick={() => setSelectedTemplate(tmpl)}
                  className={`px-2 py-1 text-[10px] font-medium border cursor-pointer text-left transition-all ${
                    selectedTemplate === tmpl
                      ? 'bg-[#1e2830] border-[#364954] text-[#cfdbe0]'
                      : 'bg-[#0e1113] border-[#1f262b] text-[#6d7c84] hover:text-[#a0afb8]'
                  }`}
                >
                  {tmpl}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Directive Text */}
          <div>
            <label className="block text-[10px] text-[#788992] mb-1 uppercase tracking-wider">
              DETAILS / WAYPOINT
            </label>
            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="ENTER SPECIFIC INSTRUCTIONS..."
              rows={2}
              className="w-full bg-[#0e1113] border border-[#232c32] text-[#b8c7ce] px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#3d4e59] font-mono uppercase"
            />
          </div>

          {/* Priority Toggle */}
          <div>
            <label className="block text-[10px] text-[#788992] mb-1 uppercase tracking-wider">
              PRIORITY
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPriority('NORMAL')}
                className={`flex-1 py-1 border font-medium text-[10px] uppercase cursor-pointer transition-colors ${
                  priority === 'NORMAL'
                    ? 'bg-[#1e2a33] border-[#344854] text-[#9ac1d6]'
                    : 'bg-[#0e1113] border-[#1f262b] text-[#55636a]'
                }`}
              >
                NORMAL
              </button>
              <button
                type="button"
                onClick={() => setPriority('URGENT')}
                className={`flex-1 py-1 border font-medium text-[10px] uppercase cursor-pointer transition-colors ${
                  priority === 'URGENT'
                    ? 'bg-[#2b1717] border-[#5e2626] text-[#e09b9b]'
                    : 'bg-[#0e1113] border-[#1f262b] text-[#55636a]'
                }`}
              >
                URGENT / FLASH
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[#212930]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 border border-[#242c32] text-[#75848c] hover:text-[#b0bcc2] cursor-pointer uppercase text-xs"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-1 bg-[#23313a] border border-[#3b4e5c] text-[#d4e1e8] font-medium uppercase tracking-wider hover:bg-[#2b3c47] cursor-pointer text-xs"
            >
              <Send className="w-3 h-3" />
              <span>TRANSMIT</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
