# Telegram-like Smooth Chat Scroll Design

## Problem

When scrolling up in chat, the current implementation shows visible loaders/skeletons, causes scroll jumps, and creates a jarring UX. Messages should load seamlessly in the background.

## Root Causes

1. **Data path mismatch**: `loadMoreMessages()` writes to `messages.value` (shallowRef) but `activeMessages` reads from Dexie liveQuery — scrollback data never reaches UI
2. **Double scroll correction**: Virtua `shift` mode + manual `scrollTop += delta` fight each other
3. **liveQuery re-subscription resets isReady**: causes skeleton flash during pagination
4. **Fake prefetch**: `doPrefetch` calls `loadMoreMessages` (network), not actual cache fill
5. **Visible spinner** at index 0 during `loadingMore`

## Architecture: Three-Tier Message Pipeline

```
TIER 1: DISPLAY — activeMessages ← Dexie liveQuery (messageWindowSize limit)
TIER 2: CACHE — all messages ever loaded in Dexie (expandMessageWindow reads from here)
TIER 3: NETWORK — Matrix scrollback (only when Dexie exhausted)
```

## Changes Made

### Phase 0: Hotfix
- Removed spinner at index 0
- Skeleton only during initial room load (not pagination)
- `useLiveQuery` no longer resets `isReady` on re-subscription
- Added Dexie dual-write to `loadMoreMessages`

### Phase 1: True Background Prefetch
- New `prefetchOlderToCache()` — writes ONLY to Dexie, zero UI side effects
- `doLoadMore` → expand-first pattern (local cache first, network fallback)
- `shiftModeLock` replaces computed shiftMode for explicit control
- Removed manual scrollTop correction — Virtua shift handles it

### Phase 2: Velocity-Adaptive Thresholds
- Dynamic thresholds based on scroll speed (1200-6000px)
- Subtle 2px shimmer bar instead of spinner when waiting for network
