import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";

/**
 * Tests for useLiveQuery re-subscription behavior.
 *
 * Key invariant: isReady must NOT reset to false when deps change.
 * Resetting isReady causes skeleton flash in MessageList because the
 * skeleton condition checks `!dexieMessagesReady`. Since re-subscription
 * happens on every expandMessageWindow() call during scroll pagination,
 * this would show a skeleton on every scroll-up batch — breaking UX.
 *
 * These tests verify the extracted logic since the actual composable
 * depends on Dexie's liveQuery which requires IndexedDB.
 */

/** Extracted re-subscription logic from useLiveQuery */
function createLiveQuerySimulator<T>(initial: T) {
  const data = ref(initial) as { value: T };
  const isReady = ref(false);
  let subscribeCalls = 0;

  const subscribe = () => {
    subscribeCalls++;
    // OLD behavior: isReady.value = false; ← REMOVED
    // New behavior: preserve isReady across re-subscriptions
    // Simulate async emission
    setTimeout(() => {
      isReady.value = true;
    }, 0);
  };

  return { data, isReady, subscribe, getSubscribeCalls: () => subscribeCalls };
}

describe("useLiveQuery re-subscription", () => {
  it("isReady starts as false before first emission", () => {
    const { isReady } = createLiveQuerySimulator([]);
    expect(isReady.value).toBe(false);
  });

  it("isReady becomes true after first emission", async () => {
    const { isReady, subscribe } = createLiveQuerySimulator([]);
    subscribe();
    await new Promise(r => setTimeout(r, 10));
    expect(isReady.value).toBe(true);
  });

  it("isReady does NOT reset to false on re-subscription", async () => {
    const { isReady, subscribe } = createLiveQuerySimulator([]);
    // First subscription
    subscribe();
    await new Promise(r => setTimeout(r, 10));
    expect(isReady.value).toBe(true);

    // Re-subscribe (simulates dep change from expandMessageWindow)
    subscribe();
    // KEY ASSERTION: isReady stays true during re-subscription gap
    expect(isReady.value).toBe(true);
  });

  it("re-subscription still emits new data", async () => {
    const { isReady, subscribe, getSubscribeCalls } = createLiveQuerySimulator([]);
    subscribe();
    await new Promise(r => setTimeout(r, 10));
    expect(getSubscribeCalls()).toBe(1);

    subscribe();
    await new Promise(r => setTimeout(r, 10));
    expect(getSubscribeCalls()).toBe(2);
    expect(isReady.value).toBe(true);
  });
});

describe("skeleton flash prevention", () => {
  /**
   * Simulates the MessageList skeleton condition:
   * OLD: loading || (switching && msgs === 0) || (chatDbKit && !dexieMessagesReady)
   * NEW: (loading || switching) && msgs === 0
   */
  function shouldShowSkeleton(opts: {
    loading: boolean;
    switching: boolean;
    messageCount: number;
    dexieMessagesReady?: boolean;
  }) {
    // New condition — no dependency on dexieMessagesReady
    return (opts.loading || opts.switching) && opts.messageCount === 0;
  }

  it("shows skeleton on initial room load with no messages", () => {
    expect(shouldShowSkeleton({ loading: true, switching: false, messageCount: 0 })).toBe(true);
  });

  it("does NOT show skeleton during pagination with existing messages", () => {
    expect(shouldShowSkeleton({ loading: false, switching: false, messageCount: 50 })).toBe(false);
  });

  it("does NOT show skeleton when dexieMessagesReady is false but messages exist", () => {
    // This was the old bug — skeleton flashed during liveQuery re-subscription
    expect(shouldShowSkeleton({
      loading: false,
      switching: false,
      messageCount: 50,
      dexieMessagesReady: false,
    })).toBe(false);
  });

  it("shows skeleton during room switch with no messages", () => {
    expect(shouldShowSkeleton({ loading: false, switching: true, messageCount: 0 })).toBe(true);
  });

  it("does NOT show skeleton during room switch when messages already cached", () => {
    expect(shouldShowSkeleton({ loading: false, switching: true, messageCount: 20 })).toBe(false);
  });
});
