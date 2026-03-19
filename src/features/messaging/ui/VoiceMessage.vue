<script lang="ts">
// Module-level: shared across ALL VoiceMessage instances.
// Only one voice message can play at a time.
let activeInstance: { pause: () => void } | null = null;
</script>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { Message } from "@/entities/chat";
import { useFileDownload } from "../model/use-file-download";

interface Props {
  message: Message;
  isOwn: boolean;
}

const props = defineProps<Props>();

const { getState, download } = useFileDownload();
const fileState = computed(() => getState(props.message.id));

const audio = ref<HTMLAudioElement | null>(null);
const waveformEl = ref<HTMLElement | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const audioDuration = ref(0);
const playbackRate = ref(1);
const hasListened = ref(false);

const selfHandle = {
  pause: () => {
    audio.value?.pause();
    isPlaying.value = false;
    stopProgressLoop();
  },
};

const becomeActive = () => {
  if (activeInstance && activeInstance !== selfHandle) activeInstance.pause();
  activeInstance = selfHandle;
};

// ── Progress tracking via rAF for smooth waveform animation ──
let rafId: number | null = null;

const startProgressLoop = () => {
  stopProgressLoop();
  const tick = () => {
    if (audio.value) currentTime.value = audio.value.currentTime;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
};

const stopProgressLoop = () => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

const totalDuration = computed(() => {
  if (audioDuration.value > 0) return audioDuration.value;
  return props.message.fileInfo?.duration ?? 0;
});

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const displayTime = computed(() => {
  if (isPlaying.value || currentTime.value > 0) {
    return formatTime(currentTime.value);
  }
  return formatTime(totalDuration.value);
});

// Waveform: use stored data or generate from audio buffer
const waveform = ref<number[]>(props.message.fileInfo?.waveform ?? []);
const BARS = 40;

const normalizedWaveform = computed(() => {
  if (waveform.value.length === 0) return Array(BARS).fill(0.15);
  const src = waveform.value;
  const result: number[] = [];
  for (let i = 0; i < BARS; i++) {
    const idx = Math.floor((i / BARS) * src.length);
    result.push(src[idx] ?? 0.15);
  }
  const max = Math.max(...result, 0.01);
  return result.map(v => Math.max(0.08, v / max));
});

const progress = computed(() => {
  if (totalDuration.value === 0) return 0;
  return currentTime.value / totalDuration.value;
});

const playedBars = computed(() => Math.floor(progress.value * BARS));

// Generate waveform from audio buffer when no stored data
const generateWaveform = async (url: string) => {
  if (waveform.value.length > 0) return;
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    ctx.close();
    const channelData = buffer.getChannelData(0);
    const samples: number[] = [];
    const step = Math.floor(channelData.length / 50);
    for (let i = 0; i < 50; i++) {
      let sum = 0;
      const start = i * step;
      for (let j = start; j < start + step && j < channelData.length; j++) {
        sum += Math.abs(channelData[j]);
      }
      samples.push(sum / step);
    }
    waveform.value = samples;
  } catch { /* ignore */ }
};

const initAudio = async () => {
  if (audio.value) return;
  if (!fileState.value.objectUrl) {
    await download(props.message);
  }
  const url = fileState.value.objectUrl;
  if (!url) return;

  generateWaveform(url);

  const el = new Audio(url);
  el.playbackRate = playbackRate.value;

  el.onloadedmetadata = () => {
    if (Number.isFinite(el.duration)) {
      audioDuration.value = el.duration;
    }
  };

  el.onended = () => {
    isPlaying.value = false;
    currentTime.value = 0;
    stopProgressLoop();
    if (activeInstance === selfHandle) activeInstance = null;
  };

  audio.value = el;
};

const togglePlay = async () => {
  if (!audio.value) await initAudio();
  if (!audio.value) return;

  if (isPlaying.value) {
    audio.value.pause();
    isPlaying.value = false;
    stopProgressLoop();
  } else {
    becomeActive();
    await audio.value.play();
    isPlaying.value = true;
    hasListened.value = true;
    if (audioDuration.value === 0 && Number.isFinite(audio.value.duration)) {
      audioDuration.value = audio.value.duration;
    }
    startProgressLoop();
  }
};

const seek = async (e: MouseEvent) => {
  if (!waveformEl.value) return;
  const rect = waveformEl.value.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

  if (!audio.value) await initAudio();
  if (!audio.value) return;

  // Wait for duration to become available
  const el = audio.value;
  if (!Number.isFinite(el.duration) || el.duration === 0) {
    await new Promise<void>((resolve) => {
      const handler = () => { el.removeEventListener("loadedmetadata", handler); resolve(); };
      el.addEventListener("loadedmetadata", handler);
    });
  }

  const dur = el.duration;
  if (!Number.isFinite(dur) || dur === 0) return;

  el.currentTime = ratio * dur;
  currentTime.value = el.currentTime;
  if (audioDuration.value === 0) audioDuration.value = dur;

  if (!isPlaying.value) {
    becomeActive();
    await el.play();
    isPlaying.value = true;
    hasListened.value = true;
    startProgressLoop();
  }
};

const cycleSpeed = () => {
  const speeds = [1, 1.5, 2];
  const idx = speeds.indexOf(playbackRate.value);
  playbackRate.value = speeds[(idx + 1) % speeds.length];
  if (audio.value) audio.value.playbackRate = playbackRate.value;
};

onMounted(() => {
  if (props.message.fileInfo?.url) {
    download(props.message);
  }
});

onUnmounted(() => {
  stopProgressLoop();
  if (audio.value) {
    audio.value.pause();
    audio.value = null;
  }
  if (activeInstance === selfHandle) activeInstance = null;
});
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Play/Pause button -->
    <button
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
      :class="props.isOwn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-color-bg-ac/10 text-color-bg-ac hover:bg-color-bg-ac/20'"
      @click.stop="togglePlay"
    >
      <div v-if="fileState.loading" class="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <svg v-else-if="!isPlaying" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
    </button>

    <!-- Waveform + progress -->
    <div class="flex min-w-0 flex-1 flex-col gap-1">
      <div ref="waveformEl" class="flex h-6 cursor-pointer items-end gap-[2px]" @click.stop="seek">
        <div
          v-for="(v, i) in normalizedWaveform"
          :key="i"
          class="w-[3px] rounded-full transition-colors"
          :class="i < playedBars
            ? (props.isOwn ? 'bg-white' : 'bg-color-bg-ac')
            : (props.isOwn ? 'bg-white/30' : 'bg-color-bg-ac/30')"
          :style="{ height: `${Math.max(3, v * 24)}px` }"
        />
      </div>
      <div class="flex items-center justify-between">
        <span class="text-[11px] tabular-nums" :class="props.isOwn ? 'text-white/60' : 'text-text-on-main-bg-color'">
          {{ displayTime }}
        </span>
        <!-- Unlistened dot -->
        <span v-if="!hasListened && !props.isOwn" class="h-2 w-2 rounded-full bg-color-bg-ac" />
      </div>
    </div>

    <!-- Speed button -->
    <button
      class="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition-colors"
      :class="props.isOwn ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-color-bg-ac/10 text-color-bg-ac hover:bg-color-bg-ac/20'"
      @click.stop="cycleSpeed"
    >
      {{ playbackRate }}x
    </button>
  </div>
</template>
