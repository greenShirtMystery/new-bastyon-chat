import { shallowRef, watch, onScopeDispose, type ShallowRef } from "vue";
import { liveQuery } from "dexie";

/**
 * Vue 3 composable that wraps Dexie's liveQuery into a reactive ShallowRef.
 * Auto-subscribes to IndexedDB changes on the tables/indexes read by `querier`.
 * Unsubscribes on scope dispose. Re-subscribes when `deps` change.
 *
 * @param querier  Dexie query function (may be async)
 * @param deps     Optional reactive dependency getter — resubscribes on change
 * @param initial  Initial value before first query completes
 */
export function useLiveQuery<T>(
  querier: () => T | Promise<T>,
  deps?: () => unknown,
  initial?: T,
): ShallowRef<T> {
  const result = shallowRef<T>(initial as T) as ShallowRef<T>;
  let subscription: { unsubscribe(): void } | null = null;

  const subscribe = () => {
    subscription?.unsubscribe();
    const observable = liveQuery(querier);
    subscription = observable.subscribe({
      next: (value: T) => {
        result.value = value;
      },
      error: (err: unknown) => {
        console.error("[useLiveQuery] query error:", err);
      },
    });
  };

  if (deps) {
    watch(deps, () => {
      subscribe();
    }, { immediate: true });
  } else {
    subscribe();
  }

  onScopeDispose(() => {
    subscription?.unsubscribe();
    subscription = null;
  });

  return result;
}
