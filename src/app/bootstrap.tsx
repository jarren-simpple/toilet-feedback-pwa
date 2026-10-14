import { createRoot } from "react-dom/client";
import { getFeedbackPanelItemsApiUrl, MissingFeedbackPanelEnvError } from "../entities/panel/config";
import { RootApp } from "./RootApp";
import { registerServiceWorker } from "../shared/lib/serviceWorker";

function renderConfigEnvError(rootElement: HTMLElement, message: string): void {
  rootElement.textContent = "";
  const pre = document.createElement("pre");
  pre.style.cssText =
    "margin:1.25rem;font-size:14px;line-height:1.45;white-space:pre-wrap;font-family:system-ui,sans-serif;color:#1a1a1a;background:#f2f2f2;padding:1rem;border-radius:8px;max-width:52rem";
  pre.textContent = message;
  rootElement.appendChild(pre);
}

export async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById("app");
  if (!rootElement) {
    throw new Error("Missing #app root element");
  }

  try {
    getFeedbackPanelItemsApiUrl();
  } catch (error: unknown) {
    const message =
      error instanceof MissingFeedbackPanelEnvError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    renderConfigEnvError(rootElement, message);
    return;
  }

  createRoot(rootElement).render(<RootApp />);

  if (import.meta.env.PROD) {
    await registerServiceWorker();
  }
}
