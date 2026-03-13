<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";

interface Props {
  state: "idle" | "recording" | "locked" | "preview";
  duration: number;
  recordedBlob: Blob | null;
  videoStream: MediaStream | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  start: [];
  startLocked: [];
  stopAndSend: [];
  stopAndPreview: [];
  sendPreview: [];
  lock: [];
  cancel: [];
}>();

const MAX_DURATION = 60;
const CIRCLE_RADIUS = 112;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// Progress ring offset: starts full (CIRCUMFERENCE) and decreases to 0 at 60s
const progressOffset = computed(() => {
  const progress = Math.min(props.duration / MAX_DURATION, 1);
  return CIRCUMFERENCE * (1 - progress);
});

// Track whether interaction came from touch (to prevent click firing after touch)
let wasTouch = false;

const handleDesktopClick = () => {
  if (wasTouch) { wasTouch = false; return; }
  emit("startLocked");
};

// Gesture tracking for camera button
const touchStartY = ref(0);
const touchStartX = ref(0);
const isCancelling = ref(false);

const handleTouchStart = (e: TouchEvent) => {
  wasTouch = true;
  touchStartY.value = e.touches[0].clientY;
  touchStartX.value = e.touches[0].clientX;
  isCancelling.value = false;
  emit("start");
};

const handleTouchMove = (e: TouchEvent) => {
  if (props.state !== "recording") return;
  const dy = touchStartY.value - e.touches[0].clientY;
  const dx = touchStartX.value - e.touches[0].clientX;

  if (dy > 80) {
    emit("lock");
    return;
  }
  if (dx > 130) {
    isCancelling.value = true;
  }
};

const handleTouchEnd = () => {
  if (isCancelling.value) {
    emit("cancel");
    isCancelling.value = false;
    return;
  }
  if (props.state === "recording") {
    emit("stopAndSend");
  }
};

// Live camera preview
const liveVideoRef = ref<HTMLVideoElement | null>(null);

watch(() => props.videoStream, (stream) => {
  if (liveVideoRef.value) {
    liveVideoRef.value.srcObject = stream;
  }
});

// Also set srcObject when the element mounts (ref becomes available)
watch(liveVideoRef, (el) => {
  if (el && props.videoStream) {
    el.srcObject = props.videoStream;
  }
});

// Preview playback
const previewVideoRef = ref<HTMLVideoElement | null>(null);
const previewUrl = ref<string | null>(null);
const isPlaying = ref(false);

watch(() => props.recordedBlob, (blob) => {
  // Revoke old URL
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
  if (blob) {
    previewUrl.value = URL.createObjectURL(blob);
    isPlaying.value = false;
  } else {
    isPlaying.value = false;
  }
});

const togglePreviewPlay = () => {
  if (!previewVideoRef.value) return;
  if (isPlaying.value) {
    previewVideoRef.value.pause();
    isPlaying.value = false;
  } else {
    previewVideoRef.value.play();
    isPlaying.value = true;
  }
};

const handlePreviewEnded = () => {
  isPlaying.value = false;
};

onBeforeUnmount(() => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }
});
</script>

<template>
  <!-- Recording state (mobile hold-to-record) -->
  <div v-if="state === 'recording'" class="video-circle-recorder flex flex-col items-center gap-3 px-2 py-2">
    <!-- Circular video preview with progress ring -->
    <div class="relative flex items-center justify-center" style="width: 240px; height: 240px;">
      <svg class="absolute inset-0" width="240" height="240" viewBox="0 0 240 240">
        <!-- Background track -->
        <circle
          cx="120" cy="120" :r="CIRCLE_RADIUS"
          fill="none"
          stroke="currentColor"
          class="text-text-on-main-bg-color/10"
          stroke-width="4"
        />
        <!-- Progress ring -->
        <circle
          cx="120" cy="120" :r="CIRCLE_RADIUS"
          fill="none"
          class="progress-ring"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="progressOffset"
          transform="rotate(-90 120 120)"
        />
      </svg>
      <div class="h-[224px] w-[224px] overflow-hidden rounded-full">
        <video
          ref="liveVideoRef"
          autoplay
          muted
          playsinline
          class="h-full w-full object-cover"
          style="transform: scaleX(-1);"
        />
      </div>
    </div>

    <!-- Recording indicator + timer -->
    <div class="flex items-center gap-2">
      <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-color-bad" />
      <span class="text-sm tabular-nums font-medium text-text-color">{{ formatDuration(duration) }}</span>
    </div>

    <!-- Slide to cancel -->
    <span class="text-xs text-text-on-main-bg-color/60">&lt; Slide to cancel</span>

    <!-- Lock hint -->
    <div class="flex flex-col items-center text-text-on-main-bg-color/40">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    </div>
  </div>

  <!-- Locked state (hands-free) -->
  <div v-else-if="state === 'locked'" class="video-circle-recorder flex flex-col items-center gap-3 px-2 py-2">
    <!-- Circular video preview with progress ring -->
    <div class="relative flex items-center justify-center" style="width: 240px; height: 240px;">
      <svg class="absolute inset-0" width="240" height="240" viewBox="0 0 240 240">
        <circle
          cx="120" cy="120" :r="CIRCLE_RADIUS"
          fill="none"
          stroke="currentColor"
          class="text-text-on-main-bg-color/10"
          stroke-width="4"
        />
        <circle
          cx="120" cy="120" :r="CIRCLE_RADIUS"
          fill="none"
          class="progress-ring"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="progressOffset"
          transform="rotate(-90 120 120)"
        />
      </svg>
      <div class="h-[224px] w-[224px] overflow-hidden rounded-full">
        <video
          ref="liveVideoRef"
          autoplay
          muted
          playsinline
          class="h-full w-full object-cover"
          style="transform: scaleX(-1);"
        />
      </div>
    </div>

    <!-- Timer -->
    <div class="flex items-center gap-2">
      <span class="h-2.5 w-2.5 animate-pulse rounded-full bg-color-bad" />
      <span class="text-sm tabular-nums font-medium text-text-color">{{ formatDuration(duration) }}</span>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center gap-4">
      <!-- Cancel (trash) -->
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-color-bad transition-colors hover:bg-neutral-grad-0"
        title="Discard"
        @click="emit('cancel')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      <!-- Stop (preview) -->
      <button
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-grad-0 text-text-color transition-all hover:bg-neutral-grad-1"
        title="Stop and preview"
        @click="emit('stopAndPreview')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
      </button>

      <!-- Send -->
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-color-bg-ac text-white transition-all hover:brightness-110"
        title="Send"
        @click="emit('stopAndSend')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Preview state -->
  <div v-else-if="state === 'preview'" class="video-circle-recorder flex flex-col items-center gap-3 px-2 py-2">
    <!-- Circular recorded video preview -->
    <div class="relative flex items-center justify-center" style="width: 240px; height: 240px;">
      <div class="h-[224px] w-[224px] overflow-hidden rounded-full">
        <video
          v-if="previewUrl"
          ref="previewVideoRef"
          :src="previewUrl"
          loop
          autoplay
          muted
          playsinline
          class="h-full w-full object-cover"
          @ended="handlePreviewEnded"
        />
      </div>
    </div>

    <!-- Action buttons -->
    <div class="flex items-center gap-4">
      <!-- Delete (trash) -->
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-color-bad transition-colors hover:bg-neutral-grad-0"
        title="Discard"
        @click="emit('cancel')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>

      <!-- Play/Pause -->
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-color-bg-ac/10 text-color-bg-ac transition-colors hover:bg-color-bg-ac/20"
        @click="togglePreviewPlay"
      >
        <svg v-if="!isPlaying" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
      </button>

      <!-- Duration -->
      <span class="text-sm tabular-nums text-text-color">{{ formatDuration(duration) }}</span>

      <div class="flex-1" />

      <!-- Send -->
      <button
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-color-bg-ac text-white transition-all hover:brightness-110"
        title="Send"
        @click="emit('sendPreview')"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Idle: camera button (to be placed in MessageInput) -->
  <button
    v-else
    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-on-main-bg-color/60 transition-colors hover:text-text-on-main-bg-color"
    title="Video message"
    @touchstart.prevent="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @click="handleDesktopClick"
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  </button>
</template>

<style scoped>
.progress-ring {
  stroke: var(--color-bg-ac);
  transition: stroke-dashoffset 0.3s ease;
}
</style>
