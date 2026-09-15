import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 8000;

export function useToast(): { toastMessage: string | null; showToast: (message: string) => void } {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setToastMessage(message);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setToastMessage(null);
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { toastMessage, showToast };
}
