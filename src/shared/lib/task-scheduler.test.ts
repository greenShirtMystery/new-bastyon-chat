import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskScheduler } from './task-scheduler';

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new TaskScheduler();
  });

  afterEach(() => {
    scheduler.dispose();
    vi.useRealTimers();
  });

  it('executes tasks sequentially', async () => {
    const order: number[] = [];

    scheduler.schedule(async () => { order.push(1); }, 'idle');
    scheduler.schedule(async () => { order.push(2); }, 'idle');
    scheduler.schedule(async () => { order.push(3); }, 'idle');

    await scheduler.drain();

    expect(order).toEqual([1, 2, 3]);
  });

  it('high priority tasks execute before idle tasks', async () => {
    const order: string[] = [];

    scheduler.schedule(async () => { order.push('idle-1'); }, 'idle');
    scheduler.schedule(async () => { order.push('idle-2'); }, 'idle');
    scheduler.schedule(async () => { order.push('high-1'); }, 'high');
    scheduler.schedule(async () => { order.push('high-2'); }, 'high');

    await scheduler.drain();

    expect(order).toEqual(['high-1', 'high-2', 'idle-1', 'idle-2']);
  });

  it('continues after task failure', async () => {
    const order: number[] = [];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    scheduler.schedule(async () => { order.push(1); }, 'high');
    scheduler.schedule(async () => { throw new Error('boom'); }, 'high');
    scheduler.schedule(async () => { order.push(3); }, 'idle');

    await scheduler.drain();

    expect(order).toEqual([1, 3]);
    expect(consoleSpy).toHaveBeenCalledOnce();

    consoleSpy.mockRestore();
  });

  it('dispose cancels pending tasks', async () => {
    const order: number[] = [];

    scheduler.schedule(async () => { order.push(1); }, 'idle');
    scheduler.schedule(async () => { order.push(2); }, 'idle');

    scheduler.dispose();
    await scheduler.drain();

    expect(order).toEqual([]);
  });

  it('does not run new tasks after dispose', async () => {
    const order: number[] = [];

    scheduler.dispose();
    scheduler.schedule(async () => { order.push(1); }, 'idle');

    await scheduler.drain();

    expect(order).toEqual([]);
  });

  it('defaults to idle priority', async () => {
    const order: string[] = [];

    scheduler.schedule(async () => { order.push('default'); });
    scheduler.schedule(async () => { order.push('high'); }, 'high');

    await scheduler.drain();

    // high runs before default (idle)
    expect(order).toEqual(['high', 'default']);
  });
});
