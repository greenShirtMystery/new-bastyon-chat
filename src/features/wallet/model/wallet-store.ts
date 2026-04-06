import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { useAuthStore } from "@/entities/auth";
import { getPocketnetInstance } from "@/shared/api/sdk-bridge";

const STALE_MS = 60_000;

// Module-level Api singleton, tracks address to detect account switches
let _api: InstanceType<typeof Api> | null = null;
let _apiAddress: string | null = null;

export async function getApi(address?: string | null): Promise<InstanceType<typeof Api>> {
  if (_api && _apiAddress === (address ?? null)) return _api;

  const inst = getPocketnetInstance();
  _api = new Api(inst);
  _apiAddress = address ?? null;
  await _api.initIf();
  await _api.wait.ready("use", 5000);
  return _api;
}

export type WalletStatus = "idle" | "loading" | "ready" | "error";

/**
 * Format PKOIN balance with dynamic precision (matches Bastyon main app).
 * >= 1       → 2 decimals  (e.g. "42.50")
 * 0.0005–0.9 → 4 decimals  (e.g. "0.0006")
 * < 0.0005   → 8 decimals  (e.g. "0.00000050")
 * 0 / null   → "0"
 */
export function formatPkoin(value: number | null | undefined): string {
  if (value == null || value <= 0) return "0";
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.0005) return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

export const useWalletStore = defineStore("wallet", () => {
  const authStore = useAuthStore();

  // --- State ---
  const balance = ref<number | null>(null);
  const status = ref<WalletStatus>("idle");
  const error = ref<string | null>(null);
  const updatedAt = ref<number | null>(null);

  // --- Race guard ---
  let fetchGeneration = 0;

  // --- Polling ---
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // --- Computed ---
  const isAvailable = computed(() => {
    if (!authStore.address || !authStore.isAuthenticated) return false;
    try {
      return typeof bitcoin !== "undefined" && typeof Api !== "undefined";
    } catch {
      return false;
    }
  });

  const isStale = computed(() => {
    if (updatedAt.value === null) return true;
    return Date.now() - updatedAt.value > STALE_MS;
  });

  // --- Actions ---
  async function refresh(): Promise<void> {
    if (!isAvailable.value) return;

    const gen = ++fetchGeneration;
    status.value = "loading";
    error.value = null;

    try {
      const api = await getApi(authStore.address);
      if (gen !== fetchGeneration) return;

      const address = authStore.address!;
      const info = await api.rpc("getaddressinfo", [address]);
      if (gen !== fetchGeneration) return;

      balance.value = (info as { balance: number }).balance;
      status.value = "ready";
      updatedAt.value = Date.now();
    } catch (err) {
      if (gen !== fetchGeneration) return;
      status.value = "error";
      error.value = err instanceof Error ? err.message : String(err);
    }
  }

  function reset(): void {
    fetchGeneration++;
    balance.value = null;
    status.value = "idle";
    error.value = null;
    updatedAt.value = null;
  }

  function startPolling(ms: number = STALE_MS): void {
    stopPolling();
    pollTimer = setInterval(() => {
      refresh();
    }, ms);
  }

  function stopPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // --- Auto-watch: reset + refresh on address change ---
  watch(
    () => authStore.address,
    (newAddr) => {
      reset();
      if (newAddr) refresh();
    },
  );

  return {
    // State
    balance,
    status,
    error,
    updatedAt,
    // Computed
    isAvailable,
    isStale,
    // Actions
    refresh,
    reset,
    startPolling,
    stopPolling,
  };
});
