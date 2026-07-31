// The device-registry key ceiling. PURE.

// firestore.rules rejects a devices write with more than 200 followKeys or
// 200 pollPaths. The write fails WHOLESALE — not truncated — so a device
// over the limit stops being swept entirely: its follows are never
// re-polled and its fixtures go stale for good. That used to be a
// console.warn nobody would ever see.
export const REGISTRY_KEY_LIMIT = 200;
const REGISTRY_ERROR_KEY = 'deviceRegistry.lastError.v1';

export interface RegistryOverflow {
  followKeys: number;
  pollPaths: number;
  limit: number;
}

export function registryOverflow(
  followKeys: readonly string[],
  pollPaths: readonly string[],
  limit: number = REGISTRY_KEY_LIMIT,
): RegistryOverflow | null {
  if (followKeys.length <= limit && pollPaths.length <= limit) return null;
  return { followKeys: followKeys.length, pollPaths: pollPaths.length, limit };
}
