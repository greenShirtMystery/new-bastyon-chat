import { describe, it, expect } from "vitest";

/**
 * Tests for the scroll-up prefetch and expand logic from MessageList.vue.
 *
 * The Telegram-like scroll architecture has three tiers:
 * 1. Display: activeMessages from Dexie liveQuery (limited by messageWindowSize)
 * 2. Cache: all messages in Dexie (filled by prefetchOlderToCache)
 * 3. Network: Matrix scrollback (only when cache exhausted)
 *
 * These tests verify the threshold logic and state machine behavior
 * without requiring a running browser or Dexie.
 */

// Constants matching MessageList.vue
const LOAD_THRESHOLD = 1200;
const PREFETCH_THRESHOLD = 2500;
const VELOCITY_BOOST_THRESHOLD = 1500;

/** Replicates the velocity-adaptive threshold calculation */
function getEffectiveThresholds(scrollVelocity: number) {
  const speed = Math.abs(scrollVelocity);
  const effectiveLoadThreshold = speed > 3000 ? 3000
    : speed > VELOCITY_BOOST_THRESHOLD ? 2000
    : LOAD_THRESHOLD;
  const effectivePrefetchThreshold = speed > 3000 ? 6000
    : speed > VELOCITY_BOOST_THRESHOLD ? 4000
    : PREFETCH_THRESHOLD;
  return { load: effectiveLoadThreshold, prefetch: effectivePrefetchThreshold };
}

/** Simulates the scroll handler decision logic */
function getScrollActions(opts: {
  scrollTop: number;
  scrollVelocity: number;
  loadingMore: boolean;
  prefetchInFlight: boolean;
  hasMore: boolean;
}) {
  const { load, prefetch } = getEffectiveThresholds(opts.scrollVelocity);
  const actions: string[] = [];

  // Background prefetch zone
  if (opts.scrollTop < prefetch && opts.scrollVelocity > 0 && !opts.prefetchInFlight && opts.hasMore) {
    actions.push("prefetch");
  }

  // Primary expand zone
  if (opts.scrollTop < load && !opts.loadingMore && opts.hasMore) {
    actions.push("expand");
  }

  return actions;
}

describe("velocity-adaptive thresholds", () => {
  it("uses base thresholds at low speed", () => {
    const t = getEffectiveThresholds(500);
    expect(t.load).toBe(LOAD_THRESHOLD);
    expect(t.prefetch).toBe(PREFETCH_THRESHOLD);
  });

  it("uses medium thresholds at medium speed", () => {
    const t = getEffectiveThresholds(2000);
    expect(t.load).toBe(2000);
    expect(t.prefetch).toBe(4000);
  });

  it("uses aggressive thresholds at high speed", () => {
    const t = getEffectiveThresholds(4000);
    expect(t.load).toBe(3000);
    expect(t.prefetch).toBe(6000);
  });

  it("handles negative velocity (scrolling down)", () => {
    const t = getEffectiveThresholds(-3000);
    // Uses abs(velocity), so still gets boosted thresholds
    expect(t.load).toBe(2000);
  });

  it("handles zero velocity", () => {
    const t = getEffectiveThresholds(0);
    expect(t.load).toBe(LOAD_THRESHOLD);
    expect(t.prefetch).toBe(PREFETCH_THRESHOLD);
  });
});

describe("scroll action decisions", () => {
  it("triggers both prefetch and expand when near top and scrolling up", () => {
    const actions = getScrollActions({
      scrollTop: 800,
      scrollVelocity: 500,
      loadingMore: false,
      prefetchInFlight: false,
      hasMore: true,
    });
    expect(actions).toContain("prefetch");
    expect(actions).toContain("expand");
  });

  it("triggers only prefetch in prefetch zone", () => {
    const actions = getScrollActions({
      scrollTop: 2000,
      scrollVelocity: 500,
      loadingMore: false,
      prefetchInFlight: false,
      hasMore: true,
    });
    expect(actions).toContain("prefetch");
    expect(actions).not.toContain("expand");
  });

  it("does not trigger prefetch when scrolling down", () => {
    const actions = getScrollActions({
      scrollTop: 2000,
      scrollVelocity: -500,
      loadingMore: false,
      prefetchInFlight: false,
      hasMore: true,
    });
    expect(actions).not.toContain("prefetch");
  });

  it("does not trigger expand when loadingMore is true", () => {
    const actions = getScrollActions({
      scrollTop: 800,
      scrollVelocity: 500,
      loadingMore: true,
      prefetchInFlight: false,
      hasMore: true,
    });
    expect(actions).not.toContain("expand");
  });

  it("does not trigger prefetch when already in flight", () => {
    const actions = getScrollActions({
      scrollTop: 800,
      scrollVelocity: 500,
      loadingMore: false,
      prefetchInFlight: true,
      hasMore: true,
    });
    expect(actions).not.toContain("prefetch");
  });

  it("triggers nothing when hasMore is false", () => {
    const actions = getScrollActions({
      scrollTop: 100,
      scrollVelocity: 2000,
      loadingMore: false,
      prefetchInFlight: false,
      hasMore: false,
    });
    expect(actions).toHaveLength(0);
  });

  it("triggers nothing when far from top", () => {
    const actions = getScrollActions({
      scrollTop: 5000,
      scrollVelocity: 500,
      loadingMore: false,
      prefetchInFlight: false,
      hasMore: true,
    });
    expect(actions).toHaveLength(0);
  });

  it("fast scroll expands threshold to catch more", () => {
    // At normal speed, 2500px would only trigger prefetch
    const normalActions = getScrollActions({
      scrollTop: 2500,
      scrollVelocity: 500,
      loadingMore: false,
      prefetchInFlight: false,
      hasMore: true,
    });
    expect(normalActions).not.toContain("expand");

    // At fast speed, 2500px triggers expand too (threshold boosted to 3000)
    const fastActions = getScrollActions({
      scrollTop: 2500,
      scrollVelocity: 4000,
      loadingMore: false,
      prefetchInFlight: false,
      hasMore: true,
    });
    expect(fastActions).toContain("expand");
  });
});

describe("expand-first pattern", () => {
  /** Simulates the doLoadMore decision flow */
  function simulateExpandFirst(opts: {
    prevMessageCount: number;
    afterExpandCount: number;
    hasMore: boolean;
  }) {
    const steps: string[] = [];

    steps.push("expand_window"); // Always start with Dexie expand

    if (opts.afterExpandCount <= opts.prevMessageCount && opts.hasMore) {
      steps.push("network_fetch"); // Cache exhausted
      steps.push("expand_window_retry"); // Re-expand after network writes to Dexie
    }

    return steps;
  }

  it("only expands when Dexie has cached data", () => {
    const steps = simulateExpandFirst({
      prevMessageCount: 50,
      afterExpandCount: 100, // Got 50 more from cache
      hasMore: true,
    });
    expect(steps).toEqual(["expand_window"]);
    expect(steps).not.toContain("network_fetch");
  });

  it("falls back to network when cache exhausted", () => {
    const steps = simulateExpandFirst({
      prevMessageCount: 50,
      afterExpandCount: 50, // No new messages from cache
      hasMore: true,
    });
    expect(steps).toContain("network_fetch");
    expect(steps).toContain("expand_window_retry");
  });

  it("does not fetch network when at beginning of history", () => {
    const steps = simulateExpandFirst({
      prevMessageCount: 50,
      afterExpandCount: 50,
      hasMore: false,
    });
    expect(steps).not.toContain("network_fetch");
  });
});
