import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { FeedbackApp } from "../features/feedback/components/FeedbackApp";
import { GateScreen } from "../features/gate/components/GateScreen";
import { HiddenLoginTrigger } from "../features/gate/components/HiddenLoginTrigger";
import { AppVersion } from "../shared/ui/AppVersion";
import { getStoredPanelSession, savePanelSession } from "../features/gate/panelSession";
import { clearPersistedPanelState, getStoredGateSetup, saveGateSetup } from "../features/gate/storage";
import { OrientationLock, useLandscapeGuard } from "../features/orientation/orientation";
import type { PanelConfig } from "../entities/panel/config";
import { loadPanelConfig } from "../entities/panel/config";
import { DEMO_LOCATION_CODE, DEMO_PANEL_CONFIG } from "../entities/panel/demoConfig";
import type { FeedbackPanelApiResponse } from "../entities/panel/types";
import { buildHeartbeatUrl, buildPanelRealtimeUrls } from "../entities/panel/endpoints";
import { authenticateGateWithBackend } from "../shared/api/gateApi";
import { mapPanelResponseToConfigPatch } from "../entities/panel/mappers";
import { nextNetworkRetryDelayMs, waitForRetry } from "../shared/lib/retry";

interface RuntimeState {
  config: PanelConfig;
  locationCode: string;
}

function isConfirmedInvalidCredentials(failureReason: string | undefined): boolean {
  return failureReason === "invalid_credentials";
}

function persistSuccessfulLogin(
  locationCode: string,
  password: string,
  panelResponse: FeedbackPanelApiResponse | null,
): void {
  try {
    saveGateSetup(locationCode, password);
    if (panelResponse) {
      savePanelSession(locationCode, panelResponse);
    }
  } catch {
    // Login should still proceed if localStorage is unavailable.
  }
}

export function RootApp(): ReactElement {
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [initialConfig, setInitialConfig] = useState<PanelConfig | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateStatus, setGateStatus] = useState<string | null>(null);
  const [isCheckingGate, setIsCheckingGate] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [needsBackgroundAuth, setNeedsBackgroundAuth] = useState(false);
  const [showLoginOverride, setShowLoginOverride] = useState(false);
  const [hasStoredGateSetup, setHasStoredGateSetup] = useState(() => getStoredGateSetup() !== null);
  const runtimeStateRef = useRef<RuntimeState | null>(null);
  const loggedOutRef = useRef(false);

  useLandscapeGuard();

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const config = await loadPanelConfig();
        if (!cancelled) {
          setInitialConfig(config);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialConfig || runtimeState) {
      return;
    }

    const stored = getStoredGateSetup();
    if (!stored) {
      return;
    }

    let cancelled = false;
    let attemptIndex = 0;
    const shouldStop = (): boolean => cancelled || loggedOutRef.current || runtimeStateRef.current !== null;

    void (async () => {
      const cachedSession = getStoredPanelSession();
      if (cachedSession && cachedSession.locationCode === stored.locationCode) {
        setGateStatus("Restoring saved panel...");
        const mergedConfig = await buildRuntimeConfig(cachedSession.panelResponse);
        if (shouldStop()) {
          return;
        }
        setRuntimeState({
          config: mergedConfig,
          locationCode: stored.locationCode,
        });
        setNeedsBackgroundAuth(true);
        setGateError(null);
        setGateStatus(null);
        setIsCheckingGate(false);
        return;
      }

      setIsCheckingGate(true);
      setGateError(null);
      setGateStatus("Saved credentials found. Signing in...");

      while (!shouldStop()) {
        const auth = await authenticateGateWithBackend(initialConfig, stored);
        if (shouldStop()) {
          return;
        }

        if (auth.isValid) {
          persistSuccessfulLogin(stored.locationCode, stored.password, auth.panelResponse);
          const mergedConfig = await buildRuntimeConfig(auth.panelResponse);
          if (shouldStop()) {
            return;
          }
          setRuntimeState({
            config: mergedConfig,
            locationCode: stored.locationCode,
          });
          setNeedsBackgroundAuth(false);
          setGateError(null);
          setGateStatus(null);
          setIsCheckingGate(false);
          return;
        }

        if (isConfirmedInvalidCredentials(auth.failureReason)) {
          clearPersistedPanelState();
          setGateStatus(null);
          setGateError("Credentials not valid.");
          setIsCheckingGate(false);
          return;
        }

        const waitMs = nextNetworkRetryDelayMs(attemptIndex);
        setIsCheckingGate(false);
        setGateStatus(`Network unavailable. Retrying login in ${Math.round(waitMs / 1000)}s...`);
        await waitForRetry(waitMs, shouldStop);
        attemptIndex += 1;
        if (shouldStop()) {
          return;
        }
        setIsCheckingGate(true);
        setGateStatus("Retrying login...");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialConfig, runtimeState]);

  useEffect(() => {
    if (!initialConfig || !runtimeState || !needsBackgroundAuth) {
      return;
    }

    const stored = getStoredGateSetup();
    if (!stored || stored.locationCode !== runtimeState.locationCode) {
      return;
    }

    let cancelled = false;
    let attemptIndex = 0;
    const shouldStop = (): boolean => cancelled || loggedOutRef.current;

    void (async () => {
      while (!shouldStop()) {
        const auth = await authenticateGateWithBackend(initialConfig, stored);
        if (shouldStop()) {
          return;
        }

        if (auth.isValid) {
          persistSuccessfulLogin(stored.locationCode, stored.password, auth.panelResponse);
          const mergedConfig = await buildRuntimeConfig(auth.panelResponse);
          if (shouldStop()) {
            return;
          }
          setRuntimeState((current) =>
            current
              ? {
                  ...current,
                  config: mergedConfig,
                }
              : current,
          );
          setNeedsBackgroundAuth(false);
          return;
        }

        if (isConfirmedInvalidCredentials(auth.failureReason)) {
          clearPersistedPanelState();
          setNeedsBackgroundAuth(false);
          setRuntimeState(null);
          setGateError("Credentials not valid.");
          setGateStatus(null);
          return;
        }

        const waitMs = nextNetworkRetryDelayMs(attemptIndex);
        await waitForRetry(waitMs, shouldStop);
        attemptIndex += 1;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialConfig, needsBackgroundAuth, runtimeState?.locationCode]);

  const onGateSubmit = useCallback(
    async (locationCode: string, password: string): Promise<void> => {
      if (!initialConfig) {
        return;
      }

      const trimmedLocation = locationCode.trim();
      const trimmedPassword = password.trim();
      if (trimmedLocation === "") {
        setGateError("Please enter a location code.");
        setGateStatus(null);
        return;
      }

      setIsCheckingGate(true);
      setGateError(null);
      setGateStatus("Signing in...");
      try {
        const auth = await authenticateGateWithBackend(initialConfig, {
          locationCode: trimmedLocation,
          password: trimmedPassword,
        });

        if (!auth.isValid) {
          if (isConfirmedInvalidCredentials(auth.failureReason)) {
            setGateError("Credentials not valid.");
            setGateStatus(null);
            return;
          }
          setGateError("Network unavailable. Check the connection and try again.");
          setGateStatus(null);
          return;
        }

        persistSuccessfulLogin(trimmedLocation, trimmedPassword, auth.panelResponse);
        const mergedConfig = await buildRuntimeConfig(auth.panelResponse);
        setRuntimeState({
          config: mergedConfig,
          locationCode: trimmedLocation,
        });
        setNeedsBackgroundAuth(false);
        setGateError(null);
        setGateStatus(null);
      } finally {
        setIsCheckingGate(false);
      }
    },
    [initialConfig],
  );

  const onLogout = useCallback((): void => {
    // Flips synchronously (unlike React state) so any in-flight background auto-login
    // from before logout bails out on its next check instead of re-saving the
    // just-cleared credentials via persistSuccessfulLogin.
    loggedOutRef.current = true;
    setNeedsBackgroundAuth(false);
    setRuntimeState(null);
    // Go straight to a blank gate screen (not demo mode) so it's unambiguous that
    // logout actually happened, instead of reappearing as a fake-data screen that
    // looks identical to being logged in.
    setShowLoginOverride(true);
    setHasStoredGateSetup(false);
    setGateError(null);
    setGateStatus(null);
    clearPersistedPanelState();
  }, []);

  if (bootError) {
    return (
      <pre
        style={{
          color: "#1f2a37",
          background: "#f4f7fa",
          margin: "1.25rem",
          padding: "1.25rem",
          fontSize: "14px",
          whiteSpace: "pre-wrap",
          borderRadius: "12px",
        }}
      >
        {bootError}
      </pre>
    );
  }

  if (!initialConfig) {
    return (
      <>
        <div className="gate-screen">Loading...</div>
        <AppVersion />
      </>
    );
  }

  if (!runtimeState) {
    if (!hasStoredGateSetup && !showLoginOverride) {
      return (
        <>
          <FeedbackApp config={DEMO_PANEL_CONFIG} locationCode={DEMO_LOCATION_CODE} isDemoMode />
          <HiddenLoginTrigger onActivated={() => setShowLoginOverride(true)} />
          <AppVersion isDemo />
          <OrientationLock />
        </>
      );
    }

    return (
      <>
        <GateScreen
          isSubmitting={isCheckingGate}
          error={gateError}
          status={gateStatus}
          onSubmit={onGateSubmit}
        />
        <AppVersion />
        <OrientationLock />
      </>
    );
  }

  return (
    <>
      <FeedbackApp config={runtimeState.config} locationCode={runtimeState.locationCode} />
      <HiddenLoginTrigger onActivated={onLogout} />
      <AppVersion />
      <OrientationLock />
    </>
  );
}

async function buildRuntimeConfig(panelResponse: FeedbackPanelApiResponse | null): Promise<PanelConfig> {
  const configPatch = mapPanelResponseToConfigPatch(panelResponse);
  const loadedConfig = await loadPanelConfig(configPatch);
  const realtimeUrls = buildPanelRealtimeUrls(loadedConfig.realtimeBaseUrl, loadedConfig.feedbackPanelId);
  return {
    ...loadedConfig,
    panelLatestMetricsUrl: realtimeUrls.latestMetricsUrl,
    panelHeartbeatUrl: buildHeartbeatUrl(loadedConfig.realtimeBaseUrl),
  };
}
