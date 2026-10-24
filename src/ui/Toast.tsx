import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastMessage {
  text: string;
  action?: { label: string; run: () => void };
}

/** One short-lived message at a time, announced to screen readers. */
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef(0);
  const show = useCallback((message: ToastMessage, ms = 4000) => {
    window.clearTimeout(timer.current);
    setToast(message);
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const view = (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <div className="toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              className="toast__action"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
  return { show, view };
}
