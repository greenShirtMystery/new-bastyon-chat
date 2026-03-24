/**
 * TaskScheduler — defers post-startup background work so it doesn't
 * compete with UI rendering for main thread time.
 *
 * Two priority levels:
 * - "high" — processed first (e.g. visible room data)
 * - "idle" — processed after high queue is empty (e.g. previews, profiles)
 *
 * Between each task the scheduler yields to the main thread via
 * requestIdleCallback (with 2 s timeout) or setTimeout(16) fallback.
 */

export type Priority = 'high' | 'idle';

export class TaskScheduler {
  private highQueue: Array<() => Promise<void>> = [];
  private idleQueue: Array<() => Promise<void>> = [];
  private running = false;
  private disposed = false;

  /**
   * Add a task to the queue.
   * @param fn    Async function to execute
   * @param priority  "high" runs before "idle". Default: "idle".
   */
  schedule(fn: () => Promise<void>, priority: Priority = 'idle'): void {
    if (this.disposed) return;

    if (priority === 'high') {
      this.highQueue.push(fn);
    } else {
      this.idleQueue.push(fn);
    }

    if (!this.running) {
      this.running = true;
      // Defer start so all synchronous schedule() calls in the same
      // tick get queued before the loop begins processing.
      Promise.resolve().then(() => this.run());
    }
  }

  /**
   * Process all queued tasks synchronously (for testing).
   * High queue first, then idle queue. Stops the background loop.
   */
  async drain(): Promise<void> {
    // Take over from the background loop
    this.running = false;

    while (this.highQueue.length > 0) {
      const task = this.highQueue.shift()!;
      try {
        await task();
      } catch (err) {
        console.error('[TaskScheduler] task failed:', err);
      }
    }

    while (this.idleQueue.length > 0) {
      const task = this.idleQueue.shift()!;
      try {
        await task();
      } catch (err) {
        console.error('[TaskScheduler] task failed:', err);
      }
    }
  }

  /**
   * Cancel all pending tasks and stop the drain loop.
   */
  dispose(): void {
    this.disposed = true;
    this.highQueue.length = 0;
    this.idleQueue.length = 0;
    this.running = false;
  }

  // ---- private ----

  private async run(): Promise<void> {
    while (!this.disposed && this.running) {
      const task = this.highQueue.shift() ?? this.idleQueue.shift();
      if (!task) break;

      try {
        await task();
      } catch (err) {
        console.error('[TaskScheduler] task failed:', err);
      }

      if (this.disposed || !this.running) break;
      await this.waitForIdle();
    }

    this.running = false;
  }

  private waitForIdle(): Promise<void> {
    if (typeof requestIdleCallback === 'function') {
      return new Promise<void>((resolve) => {
        requestIdleCallback(() => resolve(), { timeout: 2000 });
      });
    }
    return new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
}
