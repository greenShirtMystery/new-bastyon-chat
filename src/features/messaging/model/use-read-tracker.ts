import { type Ref } from "vue";

const VISIBILITY_THRESHOLD = 0.5;   // 50% of element visible
const BATCH_INTERVAL_MS = 2000;     // flush batch every 2 seconds

export interface ReadTrackerOptions {
  /** The scroll container element */
  containerRef: Ref<HTMLElement | null>;
  /** Extract message timestamp from a DOM element's data attributes.
   *  Returns null if the element is not a trackable message (e.g., own message). */
  getMessageTs: (el: HTMLElement) => number | null;
  /** Called with the highest read timestamp when a batch is ready */
  onBatchReady: (highestTs: number) => void;
}

export function useReadTracker(options: ReadTrackerOptions) {
  const { containerRef, getMessageTs, onBatchReady } = options;

  /** High-water mark: the highest timestamp seen so far (not yet flushed) */
  let pendingHighestTs = 0;
  /** High-water mark already sent to the store (avoid duplicate flushes) */
  let flushedHighestTs = 0;
  let batchTimer: ReturnType<typeof setInterval> | null = null;
  let observer: IntersectionObserver | null = null;
  /** Stored root element for use by performManualScan() */
  let trackedRoot: HTMLElement | null = null;

  /**
   * Elements registered via observeElement() before startTracking() was called.
   * Once the observer is created, these are bulk-observed so IntersectionObserver
   * fires initial callbacks for elements already in the viewport.
   */
  const pendingElements = new Set<HTMLElement>();

  function promoteToRead(el: HTMLElement) {
    const ts = getMessageTs(el);
    if (ts !== null && ts > pendingHighestTs) {
      pendingHighestTs = ts;
    }
  }

  function flushBatch() {
    if (pendingHighestTs > flushedHighestTs) {
      const ts = pendingHighestTs;
      flushedHighestTs = ts;
      onBatchReady(ts);
    }
  }

  /** Imperative scan: check all tracked elements via getBoundingClientRect. */
  function scanViewport() {
    if (!observer || !trackedRoot) return;
    const rootRect = trackedRoot.getBoundingClientRect();
    const tracked = trackedRoot.querySelectorAll<HTMLElement>("[data-message-ts]");
    for (const el of tracked) {
      const elRect = el.getBoundingClientRect();
      const visibleTop = Math.max(elRect.top, rootRect.top);
      const visibleBottom = Math.min(elRect.bottom, rootRect.bottom);
      const visibleHeight = visibleBottom - visibleTop;
      const ratio = elRect.height > 0 ? visibleHeight / elRect.height : 0;
      if (ratio >= VISIBILITY_THRESHOLD) {
        promoteToRead(el);
      }
    }
  }

  function startTracking(container?: HTMLElement | null): boolean {
    if (observer) return true; // already tracking

    const root = container ?? containerRef.value;
    if (!root) {
      console.warn("[read-tracker] startTracking called without container");
      return false;
    }

    trackedRoot = root;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          // HWM: any message entering viewport immediately contributes its timestamp.
          // No dwell time needed — seeing a newer message marks all older ones as read.
          if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
            promoteToRead(el);
          }
        }
      },
      {
        root,
        threshold: [0, VISIBILITY_THRESHOLD],
      },
    );

    // Observe all elements that were registered before tracking started.
    // IntersectionObserver fires an initial callback for each observed element,
    // so elements already in viewport will be detected immediately.
    for (const el of pendingElements) {
      observer.observe(el);
    }
    pendingElements.clear();

    // Periodic flush of the high-water mark
    batchTimer = setInterval(flushBatch, BATCH_INTERVAL_MS);

    // Synchronous initial scan: catch elements already visible before
    // IntersectionObserver callbacks fire (belt-and-suspenders).
    scanViewport();
    flushBatch();

    // Deferred second scan: layout may not be fully settled yet, so re-check
    // after one animation frame for elements that became visible.
    requestAnimationFrame(() => {
      if (!observer) return; // stopped before rAF fired
      scanViewport();
      flushBatch();
    });

    return true;
  }

  /** Synchronous scan + flush — for callers that need to force re-checking. */
  function performManualScan() {
    scanViewport();
  }

  /** Immediately flush the current high-water mark to the store. */
  function flushNow() {
    flushBatch();
  }

  function observeElement(el: HTMLElement) {
    if (observer) {
      observer.observe(el);
    } else {
      // Observer not ready yet — queue for later
      pendingElements.add(el);
    }
  }

  function unobserveElement(el: HTMLElement) {
    if (observer) {
      observer.unobserve(el);
    }
    pendingElements.delete(el);
  }

  function stopTracking() {
    observer?.disconnect();
    observer = null;
    trackedRoot = null;
    if (batchTimer !== null) {
      clearInterval(batchTimer);
      batchTimer = null;
    }
    flushBatch(); // send remaining reads
    pendingElements.clear();
    pendingHighestTs = 0;
    flushedHighestTs = 0;
  }

  return { startTracking, stopTracking, observeElement, unobserveElement, performManualScan, flushNow };
}
