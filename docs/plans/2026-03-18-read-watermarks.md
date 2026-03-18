# Read Watermarks Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace per-message read status with room-level watermark cursors, eliminating desync between Chat List and Chat Room screens.

**Architecture:** Two monotonic timestamps (`lastReadInboundTs`, `lastReadOutboundTs`) on the `rooms` table become the single source of truth for read status. Message display status (sent vs read) is derived by comparing `message.timestamp` against the room watermark. Read receipts are sent directly (fire-and-forget), not through the sync queue.

**Tech Stack:** Dexie.js (IndexedDB), Vue 3 + Pinia, Matrix SDK, TypeScript

---

### Task 1: Add Watermark Fields to Dexie Schema

**Files:**
- Modify: `src/shared/lib/local-db/schema.ts:44-72` (LocalRoom interface)
- Modify: `src/shared/lib/local-db/schema.ts:186-276` (ChatDatabase versions)

**Step 1: Add watermark fields to LocalRoom interface**

In `schema.ts`, add two fields to the `LocalRoom` interface after `unreadCount`:

```typescript
// In LocalRoom interface, after line 51 (unreadCount):
  /** Watermark: timestamp of last inbound message WE have read (0 = unread) */
  lastReadInboundTs: number;
  /** Watermark: timestamp of our last outbound message the OTHER party has read (0 = unread) */
  lastReadOutboundTs: number;
```

**Step 2: Add Dexie version 4 with migration**

After the existing `this.version(3)` block, add version 4:

```typescript
    // Version 4: add read watermarks to rooms, backfill from message statuses
    this.version(4).stores({
      rooms: "id, updatedAt, membership",
      messages: "++localId, eventId, clientId, [roomId+timestamp], [roomId+status], senderId",
      users: "address, updatedAt",
      pendingOps: "++id, [roomId+createdAt], status",
      syncState: "key",
      attachments: "++id, messageLocalId, status",
      decryptionQueue: "++id, eventId, roomId, status, [status+nextAttemptAt]",
    }).upgrade(async (tx) => {
      const rooms = tx.table("rooms");
      const messages = tx.table("messages");

      const allRooms = await rooms.toArray();
      for (const room of allRooms) {
        // Backfill outbound watermark: find the latest "read" message we sent
        const readMsgs = await messages
          .where("[roomId+status]")
          .equals([room.id, "read"])
          .toArray();
        const latestRead = readMsgs.reduce(
          (max, m) => (m.timestamp > max ? m.timestamp : max),
          0,
        );

        await rooms.update(room.id, {
          lastReadInboundTs: 0,        // Will be set on next room open
          lastReadOutboundTs: latestRead,
        });
      }

      console.log(`[ChatDB] Watermark migration: backfilled ${allRooms.length} rooms`);
    });
```

**Step 3: Verify build compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: Compilation errors in files that construct LocalRoom without new fields (we'll fix in subsequent tasks)

**Step 4: Commit**

```bash
git add src/shared/lib/local-db/schema.ts
git commit -m "feat: add read watermark fields to LocalRoom schema (Dexie v4)"
```

---

### Task 2: Add Room Repository Watermark Methods

**Files:**
- Modify: `src/shared/lib/local-db/room-repository.ts:99-102`

**Step 1: Add watermark update method**

After `setUnreadCount` method in `room-repository.ts`, add:

```typescript
  /** Update outbound read watermark (other party read our messages up to this timestamp) */
  async updateOutboundWatermark(roomId: string, timestamp: number): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) return;
    // Watermark only moves forward (monotonic)
    if (timestamp <= (room.lastReadOutboundTs ?? 0)) return;
    await this.db.rooms.update(roomId, { lastReadOutboundTs: timestamp });
  }

  /** Update inbound read watermark + clear unread (we read messages up to this timestamp) */
  async markAsRead(roomId: string, timestamp: number): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) return;
    if (timestamp <= (room.lastReadInboundTs ?? 0)) return;
    await this.db.rooms.update(roomId, {
      lastReadInboundTs: timestamp,
      unreadCount: 0,
    });
  }
```

**Step 2: Commit**

```bash
git add src/shared/lib/local-db/room-repository.ts
git commit -m "feat: add watermark update methods to RoomRepository"
```

---

### Task 3: Rewrite EventWriter.writeReceipt() to Use Watermarks

**Files:**
- Modify: `src/shared/lib/local-db/event-writer.ts:269-280`

**Step 1: Update ParsedReceipt to include timestamp**

Change the `ParsedReceipt` interface:

```typescript
/** A parsed read receipt */
export interface ParsedReceipt {
  eventId: string;
  readerAddress: string;
  roomId: string;
  /** Timestamp of the read message — used to advance the outbound watermark */
  timestamp: number;
}
```

**Step 2: Rewrite writeReceipt to update room watermark**

Replace the `writeReceipt` method body:

```typescript
  /** Update outbound read watermark for a room (someone read our message) */
  async writeReceipt(receipt: ParsedReceipt): Promise<void> {
    // Advance the outbound watermark — all our messages with ts <= receipt.timestamp
    // are now considered "read" (derived, no per-message update needed)
    await this.roomRepo.updateOutboundWatermark(receipt.roomId, receipt.timestamp);
    this.onChange?.(receipt.roomId);
  }
```

**Step 3: Commit**

```bash
git add src/shared/lib/local-db/event-writer.ts
git commit -m "feat: rewrite writeReceipt to update room watermark instead of per-message status"
```

---

### Task 4: Add Derived Status Function to Mappers

**Files:**
- Modify: `src/shared/lib/local-db/mappers.ts`
- Modify: `src/shared/lib/local-db/index.ts:20`

**Step 1: Add deriveOutboundStatus function**

Add this function to `mappers.ts` after the existing exports:

```typescript
/**
 * Derive the display status for an outbound (own) message
 * by comparing its timestamp against the room's outbound read watermark.
 *
 * This replaces per-message "read"/"delivered" status with a pure derivation
 * from the room-level watermark, ensuring Chat List and Chat Room always agree.
 */
export function deriveOutboundStatus(
  localStatus: LocalMessageStatus,
  messageTimestamp: number,
  roomLastReadOutboundTs: number,
): MessageStatus {
  // Local-only statuses take priority (not yet on server)
  if (localStatus === "pending" || localStatus === "syncing") return MessageStatus.sending;
  if (localStatus === "failed") return MessageStatus.failed;

  // Derived from watermark: if the other party read up to this timestamp → read
  if (roomLastReadOutboundTs >= messageTimestamp) return MessageStatus.read;

  // On server but not yet read
  return MessageStatus.sent;
}
```

**Step 2: Update localToMessage to accept optional watermark**

Modify `localToMessage` to accept an optional watermark parameter:

```typescript
export function localToMessage(
  local: LocalMessage,
  outboundWatermark?: number,
): Message & { _key?: string } {
  const isDeleted = local.deleted || local.softDeleted;
  const status = outboundWatermark !== undefined
    ? deriveOutboundStatus(local.status, local.timestamp, outboundWatermark)
    : localStatusToMessageStatus(local.status);
  return {
    id: local.eventId ?? local.clientId,
    _key: local.clientId,
    roomId: local.roomId,
    senderId: local.senderId,
    content: isDeleted ? "" : local.content,
    timestamp: local.timestamp,
    status,
    type: local.type,
    fileInfo: isDeleted ? undefined : local.fileInfo,
    replyTo: isDeleted ? undefined : local.replyTo,
    reactions: isDeleted ? undefined : local.reactions,
    edited: local.edited,
    forwardedFrom: isDeleted ? undefined : local.forwardedFrom,
    callInfo: local.callInfo,
    pollInfo: isDeleted ? undefined : local.pollInfo,
    transferInfo: isDeleted ? undefined : local.transferInfo,
    linkPreview: isDeleted ? undefined : local.linkPreview,
    deleted: isDeleted,
    systemMeta: local.systemMeta,
  };
}

export function localToMessages(locals: LocalMessage[], outboundWatermark?: number): Message[] {
  return locals.map(l => localToMessage(l, outboundWatermark));
}
```

**Step 3: Export deriveOutboundStatus from barrel**

In `src/shared/lib/local-db/index.ts`, update the export line:

```typescript
export { localToMessage, localToMessages, messageStatusToLocal, localStatusToMessageStatus, deriveOutboundStatus } from "./mappers";
```

**Step 4: Commit**

```bash
git add src/shared/lib/local-db/mappers.ts src/shared/lib/local-db/index.ts
git commit -m "feat: add deriveOutboundStatus for watermark-based message status"
```

---

### Task 5: Wire Watermarks into Chat Store — activeMessages

**Files:**
- Modify: `src/entities/chat/model/chat-store.ts` (~line 490-542, dexieRooms/dexieMessages/activeMessages)

**Step 1: Create a computed for the active room's outbound watermark**

After the `dexieRooms` liveQuery (around line 508), add:

```typescript
  // Outbound watermark for active room — used to derive message statuses
  const activeRoomOutboundWatermark = computed(() => {
    if (!activeRoomId.value) return 0;
    const lr = dexieRooms.value.find(r => r.id === activeRoomId.value);
    return lr?.lastReadOutboundTs ?? 0;
  });
```

**Step 2: Pass watermark into localToMessages**

In the `activeMessages` computed (line ~522), change:

```typescript
// Before:
msgs = localToMessages(dexieMessages.value);

// After:
msgs = localToMessages(dexieMessages.value, activeRoomOutboundWatermark.value);
```

**Step 3: Commit**

```bash
git add src/entities/chat/model/chat-store.ts
git commit -m "feat: wire outbound watermark into activeMessages for derived read status"
```

---

### Task 6: Wire Watermarks into Chat Store — sortedRooms (Chat List)

**Files:**
- Modify: `src/entities/chat/model/chat-store.ts` (~line 548-587, sortedRooms computed)

**Step 1: Replace lastMessageStatus with watermark-derived status in sortedRooms**

In the `sortedRooms` computed, where `LocalRoom` is mapped to `ChatRoom`, change the status derivation:

```typescript
// Replace lines 568-570:
//   status: lr.lastMessageStatus
//     ? localStatusToMessageStatus(lr.lastMessageStatus)
//     : MessageStatus.sent,

// With:
          status: lr.lastMessageSenderId
            ? deriveOutboundStatus(
                lr.lastMessageStatus ?? "synced",
                lr.lastMessageTimestamp ?? 0,
                lr.lastReadOutboundTs ?? 0,
              )
            : MessageStatus.sent,
```

Add `deriveOutboundStatus` to the imports from `@/shared/lib/local-db` at the top of the file.

**Step 2: Commit**

```bash
git add src/entities/chat/model/chat-store.ts
git commit -m "feat: derive Chat List message status from outbound watermark"
```

---

### Task 7: Fix handleReceiptEvent to Use Watermarks

**Files:**
- Modify: `src/entities/chat/model/chat-store.ts` (~line 3312-3391, handleReceiptEvent)

**Step 1: Rewrite handleReceiptEvent**

Replace the current `handleReceiptEvent` implementation. The new version:
1. Finds the timestamp of the read message (from in-memory messages array)
2. Updates the in-memory room's lastMessage status (for immediate UI reactivity)
3. Writes the watermark to Dexie (which auto-updates liveQuery subscribers)

```typescript
  /** Handle read receipt events from other users */
  const handleReceiptEvent = (event: unknown, room: unknown) => {
    try {
      const receiptEvent = event as any;
      const roomObj = room as Record<string, unknown>;
      const roomId = roomObj?.roomId as string;
      if (!roomId) return;

      const matrixService = getMatrixClientService();
      const myUserId = matrixService.getUserId();

      const content = receiptEvent?.getContent?.() ?? receiptEvent?.event?.content;
      if (!content) return;

      for (const [eventId, receiptTypes] of Object.entries(content)) {
        const readReceipts = (receiptTypes as Record<string, unknown>)?.["m.read"] as Record<string, unknown> | undefined;
        if (!readReceipts) continue;

        for (const userId of Object.keys(readReceipts)) {
          if (userId === myUserId) continue;

          // Find the message timestamp for the watermark
          const roomMessages = messages.value[roomId];
          const msg = roomMessages?.find(m => m.id === eventId);
          const receiptData = (readReceipts[userId] as Record<string, unknown>) ?? {};
          const timestamp = msg?.timestamp ?? (receiptData.ts as number) ?? 0;
          if (timestamp === 0) continue;

          // Write watermark to Dexie (single source of truth)
          if (chatDbKitRef.value) {
            chatDbKitRef.value.eventWriter.writeReceipt({
              eventId,
              readerAddress: matrixIdToAddress(userId),
              roomId,
              timestamp,
            }).catch(() => {});
          }
        }
      }

      // Trigger reactivity for Chat List — dexieRooms liveQuery will pick up
      // the watermark change and sortedRooms will re-derive status
      triggerRef(rooms);
    } catch (e) {
      console.warn("[chat-store] handleReceiptEvent error:", e);
    }
  };
```

**Step 2: Commit**

```bash
git add src/entities/chat/model/chat-store.ts
git commit -m "feat: rewrite handleReceiptEvent to update watermark instead of per-message status"
```

---

### Task 8: Fix markRoomAsRead and setActiveRoom

**Files:**
- Modify: `src/entities/chat/model/chat-store.ts` (~line 467-470, markRoomAsRead)
- Modify: `src/entities/chat/model/chat-store.ts` (~line 1314-1349, setActiveRoom)

**Step 1: Fix markRoomAsRead to write to Dexie**

```typescript
  const markRoomAsRead = (roomId: string) => {
    const room = getRoomById(roomId);
    if (room) room.unreadCount = 0;

    // Persist to Dexie (was missing — caused unread count resurrection after reload)
    if (chatDbKitRef.value) {
      chatDbKitRef.value.eventWriter.clearUnread(roomId).catch(() => {});
    }
  };
```

**Step 2: Update setActiveRoom to write inbound watermark**

In `setActiveRoom`, after `clearUnread`, add watermark update:

```typescript
  const setActiveRoom = (roomId: string | null) => {
    activeRoomId.value = roomId;
    messageWindowSize.value = 50;
    if (roomId) {
      const room = getRoomById(roomId);
      if (room) room.unreadCount = 0;

      // Write inbound watermark + clear unread in Dexie
      if (chatDbKitRef.value) {
        // Find latest inbound message timestamp for watermark
        const roomMsgs = messages.value[roomId];
        const myAddr = useAuthStore().address;
        const lastInbound = roomMsgs
          ?.filter(m => m.senderId !== myAddr)
          .reduce((max, m) => (m.timestamp > max ? m.timestamp : max), 0) ?? 0;

        if (lastInbound > 0) {
          chatDbKitRef.value.rooms.markAsRead(roomId, lastInbound).catch(() => {});
        } else {
          chatDbKitRef.value.eventWriter.clearUnread(roomId).catch(() => {});
        }
      }

      // ... rest of existing code (loadProfiles, sendReadReceipt, etc.)
```

**Step 3: Commit**

```bash
git add src/entities/chat/model/chat-store.ts
git commit -m "fix: markRoomAsRead writes to Dexie, setActiveRoom updates inbound watermark"
```

---

### Task 9: Remove send_read_receipt from Sync Queue

**Files:**
- Modify: `src/shared/lib/local-db/schema.ts:27-37` (OperationType)
- Modify: `src/shared/lib/local-db/sync-engine.ts:141-142,386-400` (executeOperation, syncSendReadReceipt)

**Step 1: Remove "send_read_receipt" from OperationType**

In `schema.ts`, remove `"send_read_receipt"` from the `OperationType` union:

```typescript
export type OperationType =
  | "send_message"
  | "send_file"
  | "edit_message"
  | "delete_message"
  | "send_reaction"
  | "remove_reaction"
  | "send_poll"
  | "vote_poll"
  | "send_transfer";
```

**Step 2: Remove the case and method from SyncEngine**

In `sync-engine.ts`, remove:
- The `case "send_read_receipt"` line in `executeOperation` (line ~142)
- The entire `syncSendReadReceipt` method (lines ~386-400)

**Step 3: Verify no code enqueues send_read_receipt anymore**

Run: `grep -r "send_read_receipt" src/` — should return only this plan file or nothing.

**Step 4: Commit**

```bash
git add src/shared/lib/local-db/schema.ts src/shared/lib/local-db/sync-engine.ts
git commit -m "refactor: remove send_read_receipt from sync queue (now fire-and-forget)"
```

---

### Task 10: Fix Room Construction to Include Watermark Fields

**Files:**
- Modify: `src/entities/chat/model/chat-store.ts` (~line 722-744, ~line 931-957)

These are the two places where `LocalRoom` objects are constructed for Dexie upsert. Both need the new fields.

**Step 1: Add watermark fields to initial room sync (line ~722)**

In the `localRooms` mapping inside the rooms sync, add defaults:

```typescript
        lastReadInboundTs: 0,
        lastReadOutboundTs: 0,
```

Add these after `hasMoreHistory: true,` in both locations (line ~733 and ~946).

**Important:** Use `0` as default — the migration in Task 1 handles backfill for existing data. For new rooms, watermarks start at 0 and advance as receipts arrive.

**Step 2: Verify build**

Run: `npx vue-tsc --noEmit 2>&1 | head -30`
Expected: No type errors related to LocalRoom

**Step 3: Commit**

```bash
git add src/entities/chat/model/chat-store.ts
git commit -m "fix: include watermark fields in LocalRoom construction for Dexie sync"
```

---

### Task 11: Remove lastMessageStatus from Schema (Cleanup)

**Files:**
- Modify: `src/shared/lib/local-db/schema.ts:60` (remove field)
- Modify: `src/entities/chat/model/chat-store.ts` (remove all `lastMessageStatus` references)

**Step 1: Remove lastMessageStatus from LocalRoom interface**

Delete line 60 from `schema.ts`:
```typescript
  lastMessageStatus?: LocalMessageStatus;  // DELETE THIS LINE
```

**Step 2: Remove lastMessageStatus from all LocalRoom constructions in chat-store.ts**

Search for `lastMessageStatus` in `chat-store.ts` and remove those lines from the two `localRooms` construction blocks (around lines 740-741 and 953-954).

**Step 3: Update sortedRooms to not reference lastMessageStatus**

In the `sortedRooms` computed, the status derivation from Task 6 should already use `deriveOutboundStatus`. Verify the `lr.lastMessageStatus ?? "synced"` fallback still works — it uses the `localStatus` parameter which defaults to `"synced"` for messages that are on the server.

Actually, since we're removing `lastMessageStatus`, simplify the derivation:

```typescript
          status: deriveOutboundStatus(
              "synced",  // all server messages start as synced baseline
              lr.lastMessageTimestamp ?? 0,
              lr.lastReadOutboundTs ?? 0,
            ),
```

**Step 4: Verify build compiles**

Run: `npx vue-tsc --noEmit 2>&1 | head -30`
Expected: Clean compilation

**Step 5: Commit**

```bash
git add src/shared/lib/local-db/schema.ts src/entities/chat/model/chat-store.ts
git commit -m "refactor: remove lastMessageStatus from LocalRoom (replaced by watermark derivation)"
```

---

### Task 12: Handle In-Memory Messages Status for Non-Dexie Path

**Files:**
- Modify: `src/entities/chat/model/chat-store.ts` (~line 1750-1776, addMessage)

The `addMessage` function sets `room.lastMessage = message` for the in-memory path. Since `message.status` is already set by the caller, this path continues to work. However, we need to ensure the `unreadCount` increment in `addMessage` also updates Dexie:

**Step 1: Add Dexie unread increment to addMessage**

In `addMessage` (around line 1772), after `room.unreadCount++`, add:

```typescript
        // Persist unread increment to Dexie
        if (chatDbKitRef.value) {
          chatDbKitRef.value.eventWriter.incrementUnread(roomId).catch(() => {});
        }
```

**Note:** `eventWriter.writeMessage()` already calls `incrementUnread`, but `addMessage` is called from the in-memory path. Check if this would double-count. If `writeMessage` is called separately, skip this step.

**Step 2: Verify no double-counting**

Search for all callers of `addMessage` in chat-store.ts to confirm whether `writeMessage` is called in the same flow. If it is, skip adding the increment here.

**Step 3: Commit (if changes were made)**

```bash
git add src/entities/chat/model/chat-store.ts
git commit -m "fix: ensure unread count increments persist to Dexie from in-memory path"
```

---

### Task 13: Verify and Smoke Test

**Step 1: Build check**

Run: `npx vue-tsc --noEmit`
Expected: Clean compilation with no errors

**Step 2: Dev server startup**

Run: `npm run dev`
Expected: App starts without console errors

**Step 3: Manual smoke test checklist**

- [ ] Open a chat with unread messages → badge disappears, messages show as read
- [ ] Receive a read receipt from another user → checkmarks turn blue in Chat Room AND Chat List
- [ ] Reload page → unread counts persist correctly
- [ ] Mark chat as read via context menu → badge disappears AND persists after reload
- [ ] Send message → shows single checkmark, turns blue when other party reads

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete read watermarks migration — single source of truth for read status"
```
