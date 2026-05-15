"use client";

import { X } from "lucide-react";

interface PerformanceAlertBannerProps {
  message: string;
  onDismiss: () => void;
}

export function PerformanceAlertBanner({ message, onDismiss }: PerformanceAlertBannerProps) {
  if (!message) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white px-4 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm font-medium">{message}</span>
      </div>
      <button
        onClick={onDismiss}
        aria-label="Fechar notificação"
        className="ml-4 p-1 rounded hover:bg-blue-700 transition-colors shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
