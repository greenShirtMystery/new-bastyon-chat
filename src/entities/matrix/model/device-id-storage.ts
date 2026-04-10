/**
 * Per-account persistence for Matrix device_id.
 *
 * When a Matrix client logs in without specifying device_id, Synapse creates
 * a new device on every login. If the client doesn't persist the assigned
 * device_id between sessions, this leads to device explosion — new device per
 * login — which bloats device_inbox server-side with undelivered messages.
 *
 * This module stores the device_id per account in localStorage so that
 * subsequent logins reuse the existing device.
 *
 * Key format: `matrix_device_id:<address>` — mirrors the per-account naming
 * convention already used for `chat_pinned_rooms:<address>` etc.
 */

const KEY_PREFIX = "matrix_device_id";

function keyFor(address: string): string {
  return `${KEY_PREFIX}:${address}`;
}

/**
 * Read the persisted device_id for the given account address.
 * Returns undefined when no device_id is stored or the address is empty.
 */
export function getStoredDeviceId(address: string): string | undefined {
  if (!address) return undefined;
  const value = localStorage.getItem(keyFor(address));
  return value ?? undefined;
}

/**
 * Persist the device_id for the given account address.
 * No-op when either argument is empty — we never want to overwrite an
 * existing entry with a blank value.
 */
export function storeDeviceId(address: string, deviceId: string): void {
  if (!address || !deviceId) return;
  localStorage.setItem(keyFor(address), deviceId);
}

/**
 * Remove the persisted device_id for the given account address.
 * Called on explicit logout / deactivation so the next login gets a fresh
 * device.
 */
export function clearStoredDeviceId(address: string): void {
  if (!address) return;
  localStorage.removeItem(keyFor(address));
}
