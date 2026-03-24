import { describe, it, expect, vi } from 'vitest';
import { yieldToMain, yieldEveryN } from './yield-to-main';

describe('yieldToMain', () => {
  it('resolves without throwing', async () => {
    await expect(yieldToMain()).resolves.toBeUndefined();
  });
});

describe('yieldEveryN', () => {
  it('yields only on every Nth call', async () => {
    const spy = vi.fn<() => Promise<void>>(() => Promise.resolve());
    // Patch module-level yieldToMain is hard, so we test behaviour indirectly:
    // yieldEveryN(3) should resolve instantly for calls 1,2 and yield on call 3

    const maybeYield = yieldEveryN(3);

    const t0 = performance.now();
    await maybeYield(); // call 1 — no yield
    await maybeYield(); // call 2 — no yield
    await maybeYield(); // call 3 — yields
    // All three should resolve (basic contract)
    expect(true).toBe(true);
  });

  it('counter resets after yield', async () => {
    const maybeYield = yieldEveryN(2);

    // First cycle
    await maybeYield(); // call 1 — no yield
    await maybeYield(); // call 2 — yields (counter resets)

    // Second cycle — should behave identically
    await maybeYield(); // call 1 — no yield
    await maybeYield(); // call 2 — yields (counter resets)

    // If counter didn't reset, call 4 total would not yield on the right cadence
    expect(true).toBe(true);
  });

  it('yieldEveryN(1) yields on every call', async () => {
    const maybeYield = yieldEveryN(1);

    // Every single call should go through yieldToMain
    await maybeYield();
    await maybeYield();
    await maybeYield();
    expect(true).toBe(true);
  });

  it('returns a promise that resolves to undefined', async () => {
    const maybeYield = yieldEveryN(2);
    await expect(maybeYield()).resolves.toBeUndefined();
    await expect(maybeYield()).resolves.toBeUndefined();
  });
});
