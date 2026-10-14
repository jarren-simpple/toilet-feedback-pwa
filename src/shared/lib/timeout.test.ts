import { afterEach, describe, expect, it, vi } from "vitest";
import { AbortedError, TimeoutError, runWithTimeout } from "./timeout";

describe("runWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the task's value when it finishes in time", async () => {
    await expect(runWithTimeout(1_000, async () => 42)).resolves.toBe(42);
  });

  it("rejects with TimeoutError and aborts the task's signal when the budget runs out", async () => {
    vi.useFakeTimers();
    let taskSignal: AbortSignal | undefined;
    const result = runWithTimeout(500, (signal) => {
      taskSignal = signal;
      return new Promise<never>(() => undefined);
    });
    const assertion = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    expect(taskSignal?.aborted).toBe(true);
  });

  it("rejects with AbortedError as soon as the parent signal aborts", async () => {
    const parent = new AbortController();
    const result = runWithTimeout(60_000, () => new Promise<never>(() => undefined), parent.signal);
    parent.abort();
    await expect(result).rejects.toBeInstanceOf(AbortedError);
  });

  it("rejects immediately when the parent signal is already aborted", async () => {
    const parent = new AbortController();
    parent.abort();
    const task = vi.fn(async () => 1);
    await expect(runWithTimeout(60_000, task, parent.signal)).rejects.toBeInstanceOf(AbortedError);
    expect(task).not.toHaveBeenCalled();
  });
});
