import type { ReactElement } from "react";

interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps): ReactElement {
  return (
    <div className="feedback-toast" hidden={message === null} role="alert" aria-live="assertive">
      <p className="feedback-toast-text">{message}</p>
    </div>
  );
}
