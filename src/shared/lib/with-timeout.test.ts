import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("resolves when promise settles before timeout", async () => {
    const p = withTimeout(Promise.resolve(42), 1000, "test");
    await expect(p).resolves.toBe(42);
  });

  it("rejects when promise rejects before timeout", async () => {
    const p = withTimeout(Promise.reject(new Error("fail")), 1000, "test");
    await expect(p).rejects.toThrow("fail");
  });

  it("rejects with timeout error when promise does not settle in time", async () => {
    const neverResolve = new Promise(() => {});
    const p = withTimeout(neverResolve, 500, "slow-op");

    vi.advanceTimersByTime(500);

    await expect(p).rejects.toThrow("slow-op timed out after 500ms");
  });

  it("clears timer when promise resolves before timeout", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const p = withTimeout(Promise.resolve("ok"), 5000, "test");
    await p;
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
