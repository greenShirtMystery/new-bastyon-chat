import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/platform', () => ({ isNative: false }));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn() },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}));

describe('hapticImpact', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls navigator.vibrate on web', async () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, writable: true });

    const { hapticImpact } = await import('./haptics');
    await hapticImpact();
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('does not throw when navigator.vibrate is undefined', async () => {
    Object.defineProperty(navigator, 'vibrate', { value: undefined, writable: true });

    const { hapticImpact } = await import('./haptics');
    await expect(hapticImpact()).resolves.not.toThrow();
  });
});
