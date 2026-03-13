<script setup lang="ts">
interface Props {
  names: string[];
}

const props = defineProps<Props>();

const displayLabel = computed(() => {
  if (props.names.length === 0) return "";
  if (props.names.length === 1) return props.names[0];
  return `${props.names[0]} +${props.names.length - 1}`;
});
</script>

<template>
  <div class="flex flex-row gap-2">
    <div
      class="rounded-bubble rounded-bl-bubble-sm bg-chat-bubble-other flex items-center gap-2 px-3 py-2"
    >
      <!-- Wave dots -->
      <div class="flex items-center gap-1">
        <span
          v-for="i in 3"
          :key="i"
          class="typing-dot h-2 w-2 rounded-full bg-text-on-main-bg-color/50"
          :style="{ animationDelay: `${(i - 1) * 150}ms` }"
        />
      </div>

      <!-- Typing user name(s) -->
      <span class="text-xs text-text-on-main-bg-color">
        {{ displayLabel }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.typing-dot {
  animation: typing-wave 1.2s ease-in-out infinite;
}

@keyframes typing-wave {
  0%,
  60%,
  100% {
    transform: translateY(0) scale(1);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px) scale(1.15);
    opacity: 1;
  }
}
</style>
