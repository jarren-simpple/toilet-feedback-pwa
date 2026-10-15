/** Thrown when an operation run through {@link runWithTimeout} exceeds its time budget. */
export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

/** Thrown when the caller's own signal aborts the operation (e.g. an outer deadline or a stop()). */
export class AbortedError extends Error {
  constructor() {
    super("Aborted");
    this.name = "AbortedError";
  }
}

/**
 * Runs `task` with an AbortSignal that fires after `timeoutMs` or when `parentSignal` aborts,
 * whichever comes first, and rejects at that moment even if `task` ignores the signal.
 *
 * On a weak link a request can be "connected" yet trickle bytes for minutes, so the budget
 * must cover the whole operation — headers *and* body (`response.json()`) — not just `fetch()`.
 * Put both inside `task`.
 */
export function runWithTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const finish = (): void => {
      settled = true;
      globalThis.clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    };

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      finish();
      controller.abort();
      reject(error);
    };

    const onParentAbort = (): void => fail(new AbortedError());

    const timer = globalThis.setTimeout(() => fail(new TimeoutError(timeoutMs)), timeoutMs);

    if (parentSignal?.aborted) {
      onParentAbort();
      return;
    }
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });

    task(controller.signal).then(
      (value) => {
        if (settled) {
          return;
        }
        finish();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        finish();
        reject(error);
      },
    );
  });
}

/**
 * An AbortSignal that aborts after `ms`. Used as an overall deadline across several sequential
 * requests (`AbortSignal.timeout` is not available on older kiosk WebViews).
 */
export function createDeadline(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => globalThis.clearTimeout(timer),
  };
}
