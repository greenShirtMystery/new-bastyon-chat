import { ref, onMounted, onBeforeUnmount, watch, type Ref } from "vue";

export type FeedPlayerState = "idle" | "loading" | "ready" | "playing" | "paused" | "error";

export interface FeedPlayerOptions {
  /** Ref to the <video> element */
  videoRef: Ref<HTMLVideoElement | null>;
  /** Ref to the root container (for IntersectionObserver) */
  containerRef: Ref<HTMLElement | null>;
  /** Video URL (reactive — may arrive after decryption) */
  src: Ref<string | null>;
  /** Poster URL */
  poster?: string;
  /** Auto-play when visible (default false — tap-to-play for feed) */
  autoplay?: boolean;
  /** rootMargin for preload zone */
  preloadMargin?: string;
}

// ---------------------------------------------------------------------------
// Single Active Player — only one video plays at a time globally
// ---------------------------------------------------------------------------
let activePlayer: { pause: () => void } | null = null;

function claimActivePlayer(player: { pause: () => void }) {
  if (activePlayer && activePlayer !== player) {
    activePlayer.pause();
  }
  activePlayer = player;
}

function releaseActivePlayer(player: { pause: () => void }) {
  if (activePlayer === player) {
    activePlayer = null;
  }
}

/** Exported for test cleanup only. */
export function _resetActivePlayer() {
  activePlayer = null;
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 6000];
const IDLE_TIMEOUT = 10_000;

export function useFeedVideoPlayer(options: FeedPlayerOptions) {
  const {
    videoRef,
    containerRef,
    src,
    poster,
    autoplay = false,
    preloadMargin = "200px",
  } = options;

  const state = ref<FeedPlayerState>("idle");
  const currentTime = ref(0);
  const duration = ref(0);
  const buffered = ref(0);
  const isMuted = ref(true);
  const errorCount = ref(0);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let visibilityObserver: IntersectionObserver | null = null;
  let preloadObserver: IntersectionObserver | null = null;
  let isInViewport = false;
  let playInProgress = false;

  const playerHandle = { pause };

  // --- Source management ---

  function attachSource() {
    const el = videoRef.value;
    const url = src.value;
    if (!el || !url) return;
    if (el.src === url && state.value !== "idle") return;

    el.preload = "metadata";
    el.src = url;
    el.load();
    state.value = "loading";
  }

  function detachSource() {
    const el = videoRef.value;
    if (!el) return;

    el.pause();
    el.removeAttribute("src");
    el.load();
    state.value = "idle";
    releaseActivePlayer(playerHandle);
    clearIdleTimer();
  }

  // --- Play / Pause ---

  async function play() {
    const el = videoRef.value;
    if (!el || !src.value || playInProgress) return;

    playInProgress = true;
    try {
      if (state.value === "idle") {
        attachSource();
        await new Promise<void>((resolve, reject) => {
          const onMeta = () => {
            el.removeEventListener("loadedmetadata", onMeta);
            el.removeEventListener("error", onErr);
            resolve();
          };
          const onErr = () => {
            el.removeEventListener("loadedmetadata", onMeta);
            el.removeEventListener("error", onErr);
            reject(new Error("Video load failed"));
          };
          el.addEventListener("loadedmetadata", onMeta);
          el.addEventListener("error", onErr);
        });
      }

      claimActivePlayer(playerHandle);
      clearIdleTimer();

      el.muted = isMuted.value;
      await el.play();
      state.value = "playing";
      errorCount.value = 0;
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name !== "AbortError") {
        console.warn("[FeedPlayer] play failed:", e.name, e.message);
        state.value = "error";
        scheduleRetry();
      }
    } finally {
      playInProgress = false;
    }
  }

  function pause() {
    const el = videoRef.value;
    if (!el) return;

    el.pause();
    if (state.value === "playing") {
      state.value = "paused";
    }
    releaseActivePlayer(playerHandle);
    startIdleTimer();
  }

  function togglePlay() {
    if (state.value === "playing") {
      pause();
    } else {
      play();
    }
  }

  function toggleMute() {
    const el = videoRef.value;
    if (!el) return;
    isMuted.value = !isMuted.value;
    el.muted = isMuted.value;
  }

  function seek(time: number) {
    const el = videoRef.value;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(time, duration.value));
    currentTime.value = el.currentTime;
  }

  // --- Idle timer: release decoder after 10s of being paused ---

  function startIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      if (state.value === "paused") {
        detachSource();
      }
    }, IDLE_TIMEOUT);
  }

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  // --- Error recovery ---

  function scheduleRetry() {
    if (errorCount.value >= MAX_RETRIES) return;

    const delay = RETRY_DELAYS[errorCount.value] ?? 6000;
    errorCount.value++;

    retryTimer = setTimeout(() => {
      detachSource();
      attachSource();
    }, delay);
  }

  // --- Video element event listeners ---

  function onLoadedMetadata() {
    const el = videoRef.value;
    if (!el) return;
    duration.value = el.duration;
    state.value = "ready";
  }

  function onTimeUpdate() {
    const el = videoRef.value;
    if (!el) return;
    currentTime.value = el.currentTime;
  }

  function onProgress() {
    const el = videoRef.value;
    if (!el || !el.buffered.length) return;
    buffered.value = el.buffered.end(el.buffered.length - 1);
  }

  function onEnded() {
    const el = videoRef.value;
    if (el) el.currentTime = 0;
    currentTime.value = 0;
    state.value = "paused";
    releaseActivePlayer(playerHandle);
  }

  function onError() {
    if (state.value === "idle") return;
    state.value = "error";
    scheduleRetry();
  }

  // --- IntersectionObserver ---

  function setupObservers() {
    const container = containerRef.value;
    if (!container) return;

    preloadObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && state.value === "idle" && src.value) {
          attachSource();
        }
      },
      { rootMargin: preloadMargin, threshold: 0 },
    );
    preloadObserver.observe(container);

    visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isInViewport = entry.isIntersecting;
        if (!entry.isIntersecting && state.value === "playing") {
          pause();
        } else if (entry.isIntersecting && autoplay && state.value === "ready") {
          play();
        }
      },
      { threshold: 0.5 },
    );
    visibilityObserver.observe(container);
  }

  // --- Lifecycle ---

  function bindListeners() {
    const el = videoRef.value;
    if (!el) return;

    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("progress", onProgress);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);

    if (poster) el.poster = poster;
    el.playsInline = true;
  }

  function unbindListeners() {
    const el = videoRef.value;
    if (!el) return;

    el.removeEventListener("loadedmetadata", onLoadedMetadata);
    el.removeEventListener("timeupdate", onTimeUpdate);
    el.removeEventListener("progress", onProgress);
    el.removeEventListener("ended", onEnded);
    el.removeEventListener("error", onError);
  }

  onMounted(() => {
    bindListeners();
    setupObservers();
  });

  watch(src, (newSrc) => {
    if (newSrc && state.value === "idle" && isInViewport) {
      attachSource();
    }
  });

  onBeforeUnmount(() => {
    unbindListeners();
    detachSource();
    clearIdleTimer();
    if (retryTimer) clearTimeout(retryTimer);
    preloadObserver?.disconnect();
    visibilityObserver?.disconnect();
    releaseActivePlayer(playerHandle);
  });

  return {
    state,
    currentTime,
    duration,
    buffered,
    isMuted,
    play,
    pause,
    togglePlay,
    toggleMute,
    seek,
  };
}
