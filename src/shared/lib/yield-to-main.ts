/**
 * Yield control to the main thread so the browser can process
 * pending paint, input events, and other high-priority tasks.
 * Uses scheduler.yield() -> MessageChannel -> setTimeout(0) fallback.
 */
export function yieldToMain(): Promise<void> {
  // 1. scheduler.yield() — best option (Chrome 115+)
  if (
    typeof globalThis.scheduler !== 'undefined' &&
    typeof globalThis.scheduler.yield === 'function'
  ) {
    return globalThis.scheduler.yield();
  }

  // 2. MessageChannel — yields after microtasks but before setTimeout
  if (typeof MessageChannel !== 'undefined') {
    return new Promise<void>((resolve) => {
      const mc = new MessageChannel();
      mc.port1.onmessage = () => {
        mc.port1.close();
        resolve();
      };
      mc.port2.postMessage(undefined);
    });
  }

  // 3. setTimeout(0) — universal fallback
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/**
 * Returns a function that yields to main every `n` calls.
 * Use in hot loops: const maybeYield = yieldEveryN(5);
 * then `await maybeYield()` inside the loop.
 */
export function yieldEveryN(n: number): () => Promise<void> {
  let counter = 0;
  const resolved = Promise.resolve();

  return () => {
    counter++;
    if (counter >= n) {
      counter = 0;
      return yieldToMain();
    }
    return resolved;
  };
}
