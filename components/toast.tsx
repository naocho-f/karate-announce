"use client";

import { useEffect, useState, useCallback } from "react";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

let nextId = 0;
const listeners: Array<(toast: ToastItem) => void> = [];

export function showToast(message: string, type: ToastType = "error") {
  const toast: ToastItem = { id: nextId++, message, type };
  listeners.forEach((fn) => fn(toast));
}

const BG: Record<ToastType, string> = {
  success: "bg-green-600",
  error: "bg-red-600",
  info: "bg-blue-600",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((toast: ToastItem) => {
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 3000);
  }, []);

  useEffect(() => {
    listeners.push(addToast);
    return () => {
      const idx = listeners.indexOf(addToast);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={`${BG[t.type]} text-white px-4 py-2 rounded-lg shadow-lg text-sm max-w-xs animate-fade-in`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
