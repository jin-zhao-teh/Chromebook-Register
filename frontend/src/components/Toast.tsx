import { useCallback, useEffect, useRef, useState } from "react";

export type ToastTone = "success" | "error" | "info";

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

const TOAST_TIMEOUT = 4500;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      const timer = window.setTimeout(() => dismissToast(id), TOAST_TIMEOUT);
      timers.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}

export function ToastStack({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span>{toast.message}</span>
          <button className="toast-dismiss" type="button" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
