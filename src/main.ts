import { Buffer } from "buffer";

// Polyfill Node.js globals for browser environment
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;

import { app } from "./app";

app.then(app => {
  // On boot failure app is null — AppLoading stays mounted with error UI
  if (app) app.mount("#app");
});
