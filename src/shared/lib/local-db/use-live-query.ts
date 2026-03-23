import { shallowRef, ref, watch, onScopeDispose, type ShallowRef, type Ref } from "vue";
import { liveQuery } from "dexie";

export interface LiveQueryResult<T> {
  /** Reactive query data (starts as `initial`, updates on every DB change) */
  data: ShallowRef<T>;
  /** `false` until the first query result arrives; stays `true` across re-subscriptions */
  isReady: Ref<boolean>;
}

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
): LiveQueryResult<T> {
  const data = shallowRef<T>(initial as T) as ShallowRef<T>;
  const isReady = ref(false);
  let subscription: { unsubscribe(): void } | null = null;

  const subscribe = () => {
    subscription?.unsubscribe();
    // Do NOT reset isReady — stale data is better than a skeleton flash.
    // isReady stays true after the first emission so UI keeps showing
    // existing messages while the new query settles.
    const observable = liveQuery(querier);
    subscription = observable.subscribe({
      next: (value: T) => {
        data.value = value;
        isReady.value = true;
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

  return { data, isReady };
}
