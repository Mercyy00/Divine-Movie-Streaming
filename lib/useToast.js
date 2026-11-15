import { useState, useRef, useEffect, useCallback } from "react";

export function useToast(duration = 2500) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback(
    (msg) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast(msg);
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, duration);
    },
    [duration]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return [toast, showToast];
}

export function Toast({ message, role = "status" }) {
  if (!message) return null;
  return (
    <div className="toastPill" role={role} aria-live="polite">
      {message}
    </div>
  );
}
