# Read Watermarks — Design Document

**Date:** 2026-03-18
**Status:** Approved

## Problem Statement

Read receipts and unread counts desync between Chat List and Chat Room screens due to:
1. **Three competing sources of truth**: in-memory chat-store, Dexie `rooms` table, Dexie `messages` table per-row `status` field
2. **`markRoomAsRead()` doesn't write to Dexie** — unread count resurrects after reload
3. **`writeReceipt()` updates only one message** — Matrix receipt means "read everything up to this eventId", but code marks only one row as `read`, leaving earlier messages as `synced`
4. **`lastMessageStatus` in room preview not updated on receipt** — Chat List shows stale checkmarks
5. **`send_read_receipt` shares FIFO queue with `send_message`** — a stuck receipt blocks message delivery (Sync Queue Poisoning)
6. **Race between in-memory and async Dexie writes** — receipt handler updates memory synchronously, Dexie asynchronously; component remount between the two reads stale Dexie data

## Architecture: Read Watermarks (Cursors)

### Core Principle

Replace per-message `status` field (for read/sent distinction) with **two monotonic timestamps** on the `rooms` table:

| Field | Meaning |
|-------|---------|
| `lastReadInboundTs` | Timestamp of the last **incoming** message WE have read |
| `lastReadOutboundTs` | Timestamp of our last message that the **other party** has read |

Message display status becomes a **pure derivation**: `msg.timestamp <= room.lastReadOutboundTs → read`, otherwise `sent`.

### Schema Changes (LocalRoom)

```typescript
interface LocalRoom {
  // ... existing fields ...

  // NEW: Read Watermarks
  lastReadInboundTs: number;   // 0 = nothing read
  lastReadOutboundTs: number;  // 0 = nothing read by other party

  // KEEP: unreadCount (cached derived value for Chat List badge)
  unreadCount: number;

  // REMOVE: lastMessageStatus (derived from watermark now)
}
```

### Derived Status (No Per-Message Status Field)

```typescript
function deriveOutboundStatus(message, room): MessageStatus {
  if (message.status === "pending" || message.status === "syncing") return sending;
  if (message.status === "failed") return failed;
  if (room.lastReadOutboundTs >= message.timestamp) return read;  // ✓✓
  return sent;  // ✓
}
```

Both Chat List preview and Chat Room bubbles use the **same field** → desync is structurally impossible.

### Read Flow (User Opens Chat)

1. **Optimistic**: `room.lastReadInboundTs = lastMsg.ts`, `room.unreadCount = 0` → single Dexie write
2. **Fire-and-forget**: `matrixClient.setRoomReadMarkers(roomId, lastEventId)` — NOT through sync queue
3. **On server error**: NO rollback (user already saw messages). Schedule retry with exponential backoff.
4. **Incoming receipt**: Update `room.lastReadOutboundTs` in Dexie → liveQuery auto-updates all UI

### Sync Queue Separation

Read receipts move OUT of the main PendingOperation queue:
- Direct `matrixClient.setRoomReadMarkers()` call
- Separate retry mechanism (3 attempts, then drop)
- Idempotent: sending same watermark twice = no-op
- Cannot block message delivery

### Migration Strategy

1. Add `lastReadInboundTs`, `lastReadOutboundTs` to schema (Dexie version 4)
2. Backfill: scan messages with `status === "read"` to set initial outbound watermark
3. New `writeReceipt()`: updates `rooms.lastReadOutboundTs` instead of `messages.status`
4. New `deriveOutboundStatus()` composable replaces `localStatusToMessageStatus()` for sent/read
5. Remove `send_read_receipt` from `OperationType` and sync queue
6. Fix `markRoomAsRead()` to write to Dexie

### Key Guarantees

- **Single source of truth**: both screens derive from `rooms.lastReadOutboundTs`
- **Monotonic**: watermark only moves forward (`if (newTs <= currentTs) return`)
- **Idempotent**: repeated receipt sends are no-ops
- **Zero per-message writes**: receipt updates 1 row in `rooms`, not N rows in `messages`
- **Queue isolation**: receipts cannot poison the message delivery queue

## Files to Modify

| File | Change |
|------|--------|
| `src/shared/lib/local-db/schema.ts` | Add watermark fields to LocalRoom, Dexie version 4, remove `lastMessageStatus` |
| `src/shared/lib/local-db/event-writer.ts` | Rewrite `writeReceipt()` to update room watermark |
| `src/shared/lib/local-db/sync-engine.ts` | Remove `send_read_receipt` operation |
| `src/shared/lib/local-db/mappers.ts` | Add `deriveOutboundStatus()`, update `localToMessage()` |
| `src/shared/lib/local-db/room-repository.ts` | Add `updateReadWatermark()` method |
| `src/entities/chat/model/chat-store.ts` | Fix `markRoomAsRead()`, rewrite receipt handling, direct receipt sending |
| `src/entities/chat/model/types.ts` | Verify MessageStatus enum compatibility |
| `src/features/messaging/ui/MessageList.vue` | Pass room watermark to message status derivation |
| Chat List components | Use derived status from watermark instead of `lastMessageStatus` |
