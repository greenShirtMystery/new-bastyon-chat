import { describe, it, expect } from "vitest";
import { ref, computed, nextTick } from "vue";

/**
 * Tests for the shiftMode logic extracted from MessageList.vue.
 *
 * Virtua's VList `shift` prop controls how the internal height cache is updated
 * when the data array length changes:
 *   - shift=true  → assumes items were prepended (added at START)
 *   - shift=false → assumes items were appended (added at END)
 *
 * The fix: shiftModeLock is explicitly set true/false around expand operations,
 * not derived from loading flags. This prevents unintended shift activation
 * during background prefetch (which writes only to Dexie, no UI change).
 */

/** Replicates the shiftMode logic from MessageList.vue.
 *  Uses an explicit lock ref instead of deriving from loading state. */
function createShiftMode() {
  const loadingMore = ref(false);
  const loadingNewer = ref(false);
  const shiftModeLock = ref(false);
  const shiftMode = computed(() => shiftModeLock.value);
  return { loadingMore, loadingNewer, shiftModeLock, shiftMode };
}

describe("VList shiftMode", () => {
  it("defaults to false (safe for appending messages)", () => {
    const { shiftMode } = createShiftMode();
    expect(shiftMode.value).toBe(false);
  });

  it("is true when shiftModeLock is explicitly set", () => {
    const { shiftModeLock, shiftMode } = createShiftMode();
    shiftModeLock.value = true;
    expect(shiftMode.value).toBe(true);
  });

  it("reverts to false when shiftModeLock is released", async () => {
    const { shiftModeLock, shiftMode } = createShiftMode();
    shiftModeLock.value = true;
    expect(shiftMode.value).toBe(true);

    shiftModeLock.value = false;
    await nextTick();
    expect(shiftMode.value).toBe(false);
  });

  it("stays false during background prefetch (prefetch has no UI effect)", () => {
    const { shiftMode } = createShiftMode();
    // Background prefetch writes only to Dexie — no shiftModeLock change
    expect(shiftMode.value).toBe(false);
  });

  it("stays false when new messages are appended (no pagination)", () => {
    const { shiftMode } = createShiftMode();
    expect(shiftMode.value).toBe(false);
  });

  it("stays false during forward pagination (loadNewer appends to END)", () => {
    const { loadingNewer, shiftMode } = createShiftMode();
    loadingNewer.value = true;
    expect(shiftMode.value).toBe(false);
  });

  it("loadingNewer does not interfere with shiftModeLock", () => {
    const { shiftModeLock, loadingNewer, shiftMode } = createShiftMode();
    loadingNewer.value = true;
    shiftModeLock.value = true;
    expect(shiftMode.value).toBe(true);

    shiftModeLock.value = false;
    expect(shiftMode.value).toBe(false);
  });
});

/**
 * Tests for the typing-indicator swap scenario.
 *
 * When the typing indicator disappears and a new message arrives in the same
 * reactive flush, the virtualItems array stays the same length but the last
 * item swaps from TypingBubble (~48px) to MessageBubble (~100-200px).
 * Virtua keeps the old cached height for that index until ResizeObserver fires.
 *
 * The fix: watch typingText and call nudgeVirtua() on toggle to force remeasure.
 */
describe("typing indicator toggle detection", () => {
  it("detects transition from typing to no typing", async () => {
    const typingText = ref("Alice is typing...");
    let nudgeCalled = false;

    const pendingScrollToBottom = false;
    const watchEffect = (cur: string, prev: string) => {
      const appeared = !prev && !!cur;
      const disappeared = !!prev && !cur;
      if ((appeared || disappeared) && !pendingScrollToBottom) {
        nudgeCalled = true;
      }
    };

    watchEffect("", "Alice is typing...");
    expect(nudgeCalled).toBe(true);
  });

  it("detects transition from no typing to typing", () => {
    let nudgeCalled = false;
    const pendingScrollToBottom = false;

    const watchEffect = (cur: string, prev: string) => {
      const appeared = !prev && !!cur;
      const disappeared = !!prev && !cur;
      if ((appeared || disappeared) && !pendingScrollToBottom) {
        nudgeCalled = true;
      }
    };

    watchEffect("Bob is typing...", "");
    expect(nudgeCalled).toBe(true);
  });

  it("does NOT nudge when typing text just changes (same users)", () => {
    let nudgeCalled = false;
    const pendingScrollToBottom = false;

    const watchEffect = (cur: string, prev: string) => {
      const appeared = !prev && !!cur;
      const disappeared = !!prev && !cur;
      if ((appeared || disappeared) && !pendingScrollToBottom) {
        nudgeCalled = true;
      }
    };

    watchEffect("Alice, Bob are typing...", "Alice is typing...");
    expect(nudgeCalled).toBe(false);
  });

  it("does NOT nudge during pendingScrollToBottom (handled by ResizeObserver)", () => {
    let nudgeCalled = false;
    const pendingScrollToBottom = true;

    const watchEffect = (cur: string, prev: string) => {
      const appeared = !prev && !!cur;
      const disappeared = !!prev && !cur;
      if ((appeared || disappeared) && !pendingScrollToBottom) {
        nudgeCalled = true;
      }
    };

    watchEffect("", "Alice is typing...");
    expect(nudgeCalled).toBe(false);
  });
});
