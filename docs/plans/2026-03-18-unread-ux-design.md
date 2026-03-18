# Unread Messages UX — Telegram-style

## Problems

1. **Scroll misses**: Opening a chat with many unread messages doesn't scroll to the first unread. Current code loads last 50 messages and scrolls to bottom or restores saved position.
2. **No "New messages" banner**: No unread divider exists on desktop. No component renders between read and unread messages.
3. **No per-message read tracking**: Read receipt is sent for the last message in room on activation. No IntersectionObserver tracks which messages the user actually saw.

## Design Decisions

- **Always jump to first unread** on room open (Telegram-style, no saved scroll position)
- **Frozen watermark** for banner stability — banner position fixed at room open, doesn't react to reads
- **FAB is two-step**: first press → first unread; second press → bottom
- **Watermark-based reads** (single timestamp), not per-message `is_read` field
- **Batched IntersectionObserver** with 500ms dwell time and 2s flush interval

## Architecture

### 1. Anchored Window Load

When opening a chat with unread messages, load messages AROUND the first unread, not from the end.

```
Timeline:  [msg_435]...[msg_450_LAST_READ] | [msg_451_FIRST_UNREAD]...[msg_500]
                                              ^
                                   Load 15 before + 35 after this point
```

- Query Dexie: `getMessagesBefore(roomId, watermarkTs, 15)` + `getMessagesAfter(roomId, watermarkTs, 35)`
- If Dexie has no messages around watermark, fetch from Matrix server via context API
- This puts the chat in **detached mode** — bidirectional pagination needed (up and down)
- Exit detached mode when `loadNewer()` reaches the latest message

### 2. Frozen Watermark Banner

On room open:
1. Read `lastReadInboundTs` from `LocalRoom`
2. Find the last message with `ts <= watermarkTs` — this is `frozenLastReadId`
3. Count inbound messages after watermark — this is `frozenUnreadCount`
4. Store both in a non-reactive ref (set once, never updated by reads)

Banner renders as a list item between `frozenLastReadId` and the next message:
```
[msg_450] → [BANNER: "50 unread messages"] → [msg_451]
```

Banner disappears only when:
- User switches room (`activeRoomId` changes)
- User scrolls to near-bottom (< 200px from bottom)

### 3. IntersectionObserver Read Tracker

Observe each inbound message element with `threshold: [0, 0.5]`.

Rules:
- Message enters viewport at >=50% → start dwell timer
- Message leaves viewport before 500ms → cancel
- Message stays >=500ms → promote to "read", update `pendingHighestTs`
- Every 2 seconds: flush batch
  - 1 Dexie write: `roomRepo.markAsRead(roomId, highestTs)`
  - 1 Matrix API call: `sendReadReceipt(roomId, eventId)`

No per-message status updates. Only the watermark moves forward.

### 4. Two-Step FAB

FAB button behavior:
- **Has unread + not near first unread**: scroll to first unread (same as initial open)
- **Already at/past first unread OR no unread**: scroll to bottom
- Badge shows `frozenUnreadCount` (frozen, not live-updating)

### 5. Room Open Sequence

```
Phase 1 — FREEZE
  switching = true, settled = false (hide list)
  Stop previous IntersectionObserver

Phase 2 — LOAD
  Read watermarkTs from LocalRoom
  freezeBanner(lastReadMsgId, unreadCount)
  loadMessagesAroundWatermark() → messages + anchorIndex

Phase 3 — RENDER + SCROLL
  Set activeMessages (triggers virtua render)
  await 2x nextTick + requestAnimationFrame
  scrollToIndex(anchorIndex) with retry (max 3 attempts)

Phase 4 — REVEAL
  settled = true (show list at correct position)
  switching = false

Phase 5 — TRACK
  Start IntersectionObserver on visible message elements
```

### 6. Bidirectional Pagination (Detached Mode)

When anchored to first unread, user can scroll both ways:
- **Scroll up** → `loadOlder()` — fetch 50 messages before first loaded
- **Scroll down** → `loadNewer()` — fetch 50 messages after last loaded
- When `loadNewer()` returns the room's latest messages → exit detached mode, enable live tail

## Files to Modify

| File | Change |
|------|--------|
| `src/features/messaging/ui/MessageList.vue` | Room open sequence, banner insertion, FAB logic, Observer setup |
| `src/features/messaging/model/use-messages.ts` | Anchored window load, detached mode pagination |
| `src/entities/chat/model/chat-store.ts` | Remove saved scroll position, add watermark query helpers |
| `src/shared/lib/local-db/message-repository.ts` | Add `getMessagesBefore/After` by timestamp queries |
| `src/shared/lib/local-db/room-repository.ts` | Add `countInboundAfter` method |

## New Files

| File | Purpose |
|------|---------|
| `src/features/messaging/model/use-unread-banner.ts` | Frozen watermark composable |
| `src/features/messaging/model/use-read-tracker.ts` | IntersectionObserver + batching composable |
| `src/features/messaging/ui/UnreadBanner.vue` | Presentational banner component |
