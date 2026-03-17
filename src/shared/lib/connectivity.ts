import { ref } from "vue";
import { MATRIX_SERVER } from "@/shared/config";

const PING_URL = `https://${MATRIX_SERVER}/_matrix/client/versions`;
const PING_INTERVAL_MS = 30_000;
const SLOW_THRESHOLD_MS = 3_000;

const isOnline = ref(typeof navigator !== "undefined" ? navigator.onLine : true);
const isSlow = ref(false);

function updateOnline() {
  isOnline.value = navigator.onLine;
}

async function ping() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLOW_THRESHOLD_MS);
  const start = Date.now();
  try {
    await fetch(PING_URL, { method: "HEAD", signal: controller.signal, cache: "no-store" });
    isSlow.value = Date.now() - start >= SLOW_THRESHOLD_MS;
  } catch {
    // aborted (timeout) or network error — treat as slow, not offline
    // offline state is handled separately via navigator.onLine events
    isSlow.value = isOnline.value;
  } finally {
    clearTimeout(timeout);
  }
}

// Global listeners (only initialized once)
let initialized = false;
function initListeners() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  ping();
  setInterval(ping, PING_INTERVAL_MS);
}

export function useConnectivity() {
  initListeners();
  return { isOnline, isSlow };
}
