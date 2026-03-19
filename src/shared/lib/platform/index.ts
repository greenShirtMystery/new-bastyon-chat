import { Capacitor } from '@capacitor/core';

/** True when running inside a native Capacitor shell (Android/iOS). */
export const isNative = Capacitor.isNativePlatform();

/** True on Android specifically. */
export const isAndroid = Capacitor.getPlatform() === 'android';

/** True on iOS specifically. */
export const isIOS = Capacitor.getPlatform() === 'ios';

/** True in Electron desktop app. */
export const isElectron = !!(window as any).electronAPI?.isElectron;

/** True in plain browser (no native shell). */
export const isWeb = !isNative && !isElectron;

/** Current platform name for logging/analytics. */
export type Platform = 'android' | 'ios' | 'electron' | 'web';
export const currentPlatform: Platform = isAndroid
  ? 'android'
  : isIOS
    ? 'ios'
    : isElectron
      ? 'electron'
      : 'web';
