import type { LocalMessage } from "./schema";
import type { ParsedMessage } from "./event-writer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BufferedWrite {
  roomId: string;
  localMsg: LocalMessage;
  parsed: ParsedMessage;
  myAddress?: string;
  activeRoomId?: string | null;
}

export interface WriteBufferOptions {
  /** Milliseconds to wait before flushing (default 150) */
  delayMs?: number;
  /** Force-flush when buffer reaches this size (default 50) */
  maxSize?: number;
}

type FlushCallback = (items: BufferedWrite[]) => Promise<void>;

// ---------------------------------------------------------------------------
// WriteBuffer — accumulates DB writes and flushes them in a single batch
// ---------------------------------------------------------------------------

export class WriteBuffer {
  private buffer: BufferedWrite[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly delayMs: number;
  private readonly maxSize: number;
  private disposed = false;

  constructor(
    private readonly onFlush: FlushCallback,
    options?: WriteBufferOptions,
  ) {
    this.delayMs = options?.delayMs ?? 150;
    this.maxSize = options?.maxSize ?? 50;
  }

  /** Add an item to the buffer. Starts the flush timer or force-flushes if full. */
  enqueue(item: BufferedWrite): void {
    if (this.disposed) return;

    this.buffer.push(item);

    if (this.buffer.length >= this.maxSize) {
      this.clearTimer();
      void this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush();
      }, this.delayMs);
    }
  }

  /** Immediately drain the buffer (returns when flush completes). */
  async flushNow(): Promise<void> {
    this.clearTimer();
    await this.flush();
  }

  /** Flush remaining items and stop all pending timers. */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.clearTimer();
    if (this.buffer.length > 0) {
      await this.flush();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const items = this.buffer;
    this.buffer = [];

    try {
      await this.onFlush(items);
    } catch (err) {
      console.error("[WriteBuffer] flush failed:", err);
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
