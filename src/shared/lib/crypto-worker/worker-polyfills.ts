/**
 * Polyfills for Web Worker environment.
 * Must be imported BEFORE any Node.js packages (pbkdf2, create-hash, etc.)
 * because ES module imports are hoisted but side-effect imports execute in order.
 */

// Node.js packages reference `global` which doesn't exist in Web Workers
if (typeof (globalThis as Record<string, unknown>).global === "undefined") {
  (globalThis as Record<string, unknown>).global = globalThis;
}

// Some packages check for `process`
if (typeof (globalThis as Record<string, unknown>).process === "undefined") {
  (globalThis as Record<string, unknown>).process = { browser: true, env: {} } as unknown;
}
