/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 2400);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const getColorClasses = () => {
    switch (toast.type) {
      case 'warning':
        return 'border-[#6b1e22] bg-[#1a0c0e] text-[#fca5a5]';
      case 'success':
        return 'border-[#1e4a30] bg-[#102418] text-[#86efac]';
      case 'info':
      default:
        return 'border-[#233d59] bg-[#101b26] text-[#7dd3fc]';
    }
  };

  return (
    <div className="fixed top-12 left-0 right-0 z-40 px-4 pointer-events-none flex justify-center font-mono select-none">
      <div
        className={`max-w-md w-full border p-2 flex items-center justify-between text-xs pointer-events-auto shadow-md ${getColorClasses()}`}
      >
        <span className="font-bold uppercase tracking-wider text-[11px]">{toast.title}</span>
        {toast.message && (
          <span className="text-[10px] text-[#cbd5e1] break-words ml-2 font-medium">
            {toast.message}
          </span>
        )}
      </div>
    </div>
  );
};
