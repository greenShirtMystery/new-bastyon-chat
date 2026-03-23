<script setup lang="ts" generic="T extends ChatVirtualItem">
/**
 * Inverted virtual scroller for chat messages.
 *
 * Uses CSS `flex-direction: column-reverse` so that:
 *   - Data is passed as [newest, …, oldest]
 *   - item[0] renders at the visual BOTTOM (newest message)
 *   - scrollTop = 0  →  user sees newest messages
 *   - scrollTop ↑     →  user scrolls toward older messages
 *   - Appending older messages (history) = adding at the END of the array,
 *     which is the visual TOP — far from the viewport. Zero scroll correction.
 *
 * Only items in the visible range (+overscan) are mounted in the DOM.
 * Heights are measured lazily via ResizeObserver.
 */
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";

// ───────────────── Props / Emits ─────────────────

export interface ChatVirtualItem {
  id: string;
  [key: string]: unknown;
}

const props = withDefaults(
  defineProps<{
    items: T[];
    /** Estimated average item height (px). Used before measurement. */
    estimatedHeight?: number;
    /** Extra items rendered above & below the viewport. */
    overscan?: number;
  }>(),
  { estimatedHeight: 80, overscan: 6 },
);

defineSlots<{
  default(props: { item: T; index: number }): any;
}>();

const emit = defineEmits<{
  (e: "scroll", scrollTop: number): void;
  (e: "nearTop"): void;
}>();

// ───────────────── Refs ─────────────────

const containerRef = ref<HTMLElement | null>(null);
const heightCache = new Map<string, number>();
/** Incremented when heights change — forces computed re-evaluation. */
const heightVer = ref(0);
const scrollTopRef = ref(0);
const viewportH = ref(0);

// ───────────────── Height helpers ─────────────────

const h = (id: string) => heightCache.get(id) ?? props.estimatedHeight;

/** Cumulative offset from the bottom (scroll origin) for each item. */
const offsets = computed<number[]>(() => {
  void heightVer.value; // reactive dependency on height changes
  const items = props.items;
  const res = new Array<number>(items.length);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    res[i] = acc;
    acc += h(items[i].id);
  }
  return res;
});

const totalH = computed(() => {
  void heightVer.value;
  const items = props.items;
  if (items.length === 0) return 0;
  return offsets.value[items.length - 1] + h(items[items.length - 1].id);
});

// ───────────────── Visible range ─────────────────

const range = computed(() => {
  const st = scrollTopRef.value;
  const vh = viewportH.value;
  const items = props.items;
  const offs = offsets.value;
  const os = props.overscan;

  if (items.length === 0) return { start: 0, end: -1 };

  // Binary-ish scan for first visible item (offset + height > scrollTop)
  let start = 0;
  for (let i = 0; i < items.length; i++) {
    if (offs[i] + h(items[i].id) > st) {
      start = i;
      break;
    }
    if (i === items.length - 1) start = i;
  }

  let end = start;
  for (let i = start; i < items.length; i++) {
    end = i;
    if (offs[i] >= st + vh) break;
  }

  start = Math.max(0, start - os);
  end = Math.min(items.length - 1, end + os);
  return { start, end };
});

// ───────────────── Spacers ─────────────────

/** Below-viewport spacer (DOM first child → visual bottom in column-reverse). */
const belowPx = computed(() => {
  const s = range.value.start;
  return s > 0 ? offsets.value[s] : 0;
});

/** Above-viewport spacer (DOM last child → visual top). */
const abovePx = computed(() => {
  const e = range.value.end;
  if (e >= props.items.length - 1) return 0;
  return totalH.value - offsets.value[e + 1];
});

/** Indices to render. */
const indices = computed(() => {
  const { start, end } = range.value;
  if (end < start) return [] as number[];
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
});

// ───────────────── Scroll handling ─────────────────

const onScroll = () => {
  if (!containerRef.value) return;
  scrollTopRef.value = containerRef.value.scrollTop;
  emit("scroll", scrollTopRef.value);
};

// ───────────────── ResizeObserver ─────────────────

let itemRo: ResizeObserver | null = null;
let containerRo: ResizeObserver | null = null;
let heightRaf: number | null = null;

const observeItem = (id: string, el: HTMLElement | null) => {
  if (!el || !itemRo) return;
  el.dataset.virtualId = id;
  itemRo.observe(el);
};

// ───────────────── New-message scroll anchoring ─────────────────
// When a new message arrives (insert at index 0 → visual bottom) while the
// user is scrolled up, we must bump scrollTop by the new item's height so
// the viewport stays on the same content.

let prevFirstId: string | undefined;

watch(
  () => props.items[0]?.id,
  (firstId) => {
    if (!containerRef.value || !prevFirstId || firstId === prevFirstId) {
      prevFirstId = firstId;
      return;
    }
    // New item(s) appeared at the start — user might be scrolled up
    const st = containerRef.value.scrollTop;
    if (st > 50) {
      // Count how many new items were prepended
      const oldIdx = props.items.findIndex((it) => it.id === prevFirstId);
      if (oldIdx > 0) {
        let added = 0;
        for (let i = 0; i < oldIdx; i++) added += h(props.items[i].id);
        containerRef.value.scrollTop = st + added;
      }
    }
    prevFirstId = firstId;
  },
);

// ───────────────── Public API ─────────────────

const scrollToBottom = () => {
  if (containerRef.value) containerRef.value.scrollTop = 0;
};

const scrollToIndex = (index: number, opts?: { align?: "start" | "center" | "end" }) => {
  const el = containerRef.value;
  if (!el || index < 0 || index >= props.items.length) return;
  const off = offsets.value[index];
  const ih = h(props.items[index].id);
  const vh = viewportH.value;
  const align = opts?.align ?? "center";

  switch (align) {
    case "start":
      el.scrollTop = off;
      break;
    case "center":
      el.scrollTop = Math.max(0, off - (vh - ih) / 2);
      break;
    case "end":
      el.scrollTop = Math.max(0, off - vh + ih);
      break;
  }
};

defineExpose({ scrollToBottom, scrollToIndex, $el: containerRef });

// ───────────────── Lifecycle ─────────────────

onMounted(() => {
  const el = containerRef.value;
  if (!el) return;
  viewportH.value = el.clientHeight;

  containerRo = new ResizeObserver(() => {
    if (containerRef.value) viewportH.value = containerRef.value.clientHeight;
  });
  containerRo.observe(el);

  itemRo = new ResizeObserver((entries) => {
    let changed = false;
    for (const entry of entries) {
      const target = entry.target as HTMLElement;
      const id = target.dataset.virtualId;
      if (!id) continue;
      const newH = Math.ceil(
        entry.borderBoxSize?.[0]?.blockSize ?? target.offsetHeight,
      );
      if (heightCache.get(id) !== newH) {
        heightCache.set(id, newH);
        changed = true;
      }
    }
    if (changed) {
      // Batch recompute into one rAF to avoid layout thrashing
      if (heightRaf === null) {
        heightRaf = requestAnimationFrame(() => {
          heightRaf = null;
          heightVer.value++;
        });
      }
    }
  });
});

onBeforeUnmount(() => {
  containerRo?.disconnect();
  itemRo?.disconnect();
  if (heightRaf !== null) cancelAnimationFrame(heightRaf);
});
</script>

<template>
  <div
    ref="containerRef"
    style="display: flex; flex-direction: column-reverse; overflow-anchor: none"
    class="overflow-y-auto"
    @scroll.passive="onScroll"
  >
    <!-- Below spacer (DOM first = visual bottom): items [0..start) -->
    <div
      v-if="belowPx > 0"
      :style="{ minHeight: belowPx + 'px', flexShrink: 0 }"
      aria-hidden="true"
    />

    <!-- Rendered items -->
    <div
      v-for="i in indices"
      :key="items[i].id"
      :ref="(el) => observeItem(items[i].id, el as HTMLElement)"
      :data-virtual-id="items[i].id"
      style="flex-shrink: 0"
    >
      <slot :item="items[i]" :index="i" />
    </div>

    <!-- Above spacer (DOM last = visual top): items (end..N) -->
    <div
      v-if="abovePx > 0"
      :style="{ minHeight: abovePx + 'px', flexShrink: 0 }"
      aria-hidden="true"
    />
  </div>
</template>
