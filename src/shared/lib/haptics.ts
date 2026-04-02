import { isNative } from '@/shared/lib/platform';

export async function hapticImpact(style: 'LIGHT' | 'MEDIUM' | 'HEAVY' = 'MEDIUM') {
  if (isNative) {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const map = { LIGHT: ImpactStyle.Light, MEDIUM: ImpactStyle.Medium, HEAVY: ImpactStyle.Heavy };
    await Haptics.impact({ style: map[style] });
  } else {
    navigator.vibrate?.(10);
  }
}
