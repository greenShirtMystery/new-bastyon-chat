/**
 * Remove all account-specific localStorage keys.
 * Preserves device settings: theme, locale, call device preferences.
 */
export function clearAccountLocalStorage(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith("bastyon-cache-ts:")) toRemove.push(key);
  }
  for (const key of toRemove) localStorage.removeItem(key);
}
