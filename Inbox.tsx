/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertCircle, CheckCircle, FileText, Send } from 'lucide-react';
import { CommandOrder } from '../types';
import { HAPTIC_PATTERNS, triggerHaptic } from '../services/haptics';
import { playAcknowledgeSound, playTapSound } from '../services/audio';

interface InboxProps {
  orders: CommandOrder[];
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  onAcknowledgeOrder: (orderId: string) => void;
  onSimulateOrder: (priority: 'NORMAL' | 'URGENT') => void;
}

export const Inbox: React.FC<InboxProps> = ({
  orders,
  soundEnabled,
  vibrationEnabled,
  onAcknowledgeOrder,
  onSimulateOrder,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<CommandOrder | null>(null);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}Z`;
  };

  const handleOrderClick = (order: CommandOrder) => {
    triggerHaptic(HAPTIC_PATTERNS.TAP, vibrationEnabled);
    playTapSound(soundEnabled);
    setSelectedOrder(order);
  };

  const handleAcknowledge = (orderId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    triggerHaptic(HAPTIC_PATTERNS.CONFIRM, vibrationEnabled);
    playAcknowledgeSound(soundEnabled);
    onAcknowledgeOrder(orderId);
    if (selectedOrder?.id === orderId) {
      setSelectedOrder({ ...selectedOrder, acknowledged: true });
    }
  };

  return (
    <div className="w-full flex flex-col gap-3 font-mono select-none">
      {/* Top Bar with Precision Military Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-[#222935] gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#e6edf3] uppercase tracking-wider text-xs">
            DIRECTIVES INBOX
          </span>
          <span className="text-[10px] text-[#7d8590] font-bold">
            [{orders.length} LOGGED]
          </span>
        </div>

        {/* Clean Flat Simulation Triggers */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSimulateOrder('NORMAL')}
            className="px-2.5 py-1 border border-[#233d59] bg-[#101b26] text-[#7dd3fc] hover:bg-[#162738] hover:border-[#38618c] text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Send className="w-3 h-3 text-[#7dd3fc]" />
            <span>+ ROUTINE</span>
          </button>
          <button
            onClick={() => onSimulateOrder('URGENT')}
            className="px-2.5 py-1 border border-[#6b1e22] bg-[#1c0c0e] text-[#fca5a5] hover:bg-[#291114] hover:border-[#991b1b] text-[10px] font-bold tracking-wider uppercase transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <AlertCircle className="w-3 h-3 text-[#ef4444]" />
            <span>+ FLASH URGENT</span>
          </button>
        </div>
      </div>

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="py-16 text-center text-xs text-[#7d8590] border border-[#222935] bg-[#11151c]">
          [ ALL DIRECTIVES CLEARED · NO LOGGED ORDERS ]
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => {
            const isUrgent = order.priority === 'URGENT';
            return (
              <div
                key={order.id}
                onClick={() => handleOrderClick(order)}
                className={`p-3 border cursor-pointer transition-colors text-left ${
                  isUrgent
                    ? order.acknowledged
                      ? 'border-[#381619] bg-[#12090b]'
                      : 'border-[#6b1e22] bg-[#170c0e] hover:border-[#991b1b]'
                    : 'border-[#222935] bg-[#11151c] hover:border-[#333d4e]'
                }`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between text-[10px] tracking-wider">
                  <span className="font-bold uppercase text-[#cbd5e1] flex items-center gap-1.5">
                    {isUrgent ? (
                      <span className="text-[#fca5a5] font-bold">
                        [FLASH // URGENT]
                      </span>
                    ) : (
                      <span className="text-[#7dd3fc] font-bold">
                        [ROUTINE]
                      </span>
                    )}
                    ORIGIN: {order.sender}
                  </span>
                  <span className="text-[#7d8590] tabular-nums font-medium">
                    {formatTime(order.timestamp)}
                  </span>
                </div>

                {/* Directive Title */}
                <div className="text-xs sm:text-sm font-bold text-[#e6edf3] uppercase tracking-wide mt-1.5 flex items-center gap-1.5">
                  {isUrgent && !order.acknowledged && (
                    <span className="w-1.5 h-1.5 bg-[#b91c1c] shrink-0" />
                  )}
                  <span>{order.title}</span>
                </div>

                {/* Message Body */}
                <p className="text-xs text-[#8b949e] line-clamp-2 mt-1 leading-relaxed">
                  {order.message}
                </p>

                {/* Directive Action Controls */}
                <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#1a202a] gap-2">
                  <div className="flex items-center gap-2">
                    {!order.acknowledged ? (
                      <button
                        onClick={(e) => handleAcknowledge(order.id, e)}
                        className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border transition-colors cursor-pointer flex items-center gap-1.5 ${
                          isUrgent
                            ? 'bg-[#240e11] border-[#6b1e22] text-[#fca5a5] hover:bg-[#331317] hover:border-[#991b1b]'
                            : 'bg-[#102418] border-[#1e4a30] text-[#86efac] hover:bg-[#163622] hover:border-[#2b6944]'
                        }`}
                      >
                        <CheckCircle className="w-3 h-3" />
                        <span>ACKNOWLEDGE RECEIPT</span>
                      </button>
                    ) : (
                      <span className="text-[#86efac] text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-[#22c55e]" />
                        <span>[VERIFIED // ACKNOWLEDGED]</span>
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-[#7d8590] flex items-center gap-1">
                    <FileText className="w-3 h-3 text-[#7d8590]" />
                    <span>#{order.id.slice(-6).toUpperCase()}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-[#090b0e]/95 backdrop-blur-xs p-4 flex items-center justify-center font-mono">
          <div
            className={`w-full max-w-md border p-5 flex flex-col gap-4 text-xs shadow-2xl ${
              selectedOrder.priority === 'URGENT'
                ? 'border-[#6b1e22] bg-[#12090b]'
                : 'border-[#233d59] bg-[#0f151e]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between text-[#8b949e] border-b border-[#222935] pb-2">
              <span className="font-bold text-[#e6edf3] uppercase tracking-wider flex items-center gap-1.5">
                {selectedOrder.priority === 'URGENT' ? (
                  <span className="text-[#fca5a5] font-bold">
                    [FLASH]
                  </span>
                ) : (
                  <span className="text-[#7dd3fc] font-bold">
                    [ROUTINE]
                  </span>
                )}
                ORIGIN: {selectedOrder.sender}
              </span>
              <span className="tabular-nums font-medium text-[11px] text-[#cbd5e1]">
                {formatTime(selectedOrder.timestamp)}
              </span>
            </div>

            {/* Directive content */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-bold text-[#f1f5f9] uppercase tracking-wide">
                {selectedOrder.title}
              </span>
              <p className="text-xs text-[#cbd5e1] leading-relaxed whitespace-pre-wrap bg-[#090b0e] border border-[#1e2530] p-3 mt-1">
                {selectedOrder.message}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col gap-2 pt-2 border-t border-[#222935]">
              {!selectedOrder.acknowledged ? (
                <button
                  onClick={() => handleAcknowledge(selectedOrder.id)}
                  className={`w-full min-h-[44px] font-bold text-xs uppercase tracking-widest border transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                    selectedOrder.priority === 'URGENT'
                      ? 'bg-[#8c2626] hover:bg-[#a82e2e] text-white border-[#b91c1c]'
                      : 'bg-[#14532d] hover:bg-[#166534] text-white border-[#22c55e]'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>[ ACKNOWLEDGE DIRECTIVE ]</span>
                </button>
              ) : (
                <div className="w-full py-2 text-center text-xs font-bold text-[#86efac] border border-[#1e4a30] bg-[#0e1711]">
                  [ DIRECTIVE ACKNOWLEDGED & LOGGED ]
                </div>
              )}

              <button
                onClick={() => setSelectedOrder(null)}
                className="w-full min-h-[38px] border border-[#222935] hover:border-[#384355] bg-[#11151c] text-[#cbd5e1] hover:text-white text-xs uppercase tracking-wider font-bold cursor-pointer transition-colors"
              >
                [ CLOSE ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
