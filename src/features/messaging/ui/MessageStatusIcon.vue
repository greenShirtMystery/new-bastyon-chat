<script setup lang="ts">
import { MessageStatus } from "@/entities/chat";
import { computed } from "vue";

const props = defineProps<{
  status: MessageStatus;
  light?: boolean;
}>();

const isSending = computed(() => props.status === MessageStatus.sending);
const isFailed = computed(() => props.status === MessageStatus.failed);
const isCancelled = computed(() => props.status === MessageStatus.cancelled);
const isRead = computed(() => props.status === MessageStatus.read);
const isDouble = computed(() => props.status === MessageStatus.delivered || props.status === MessageStatus.read);

const iconColor = computed(() => {
  if (isRead.value) return "#34B7F1";
  if (isFailed.value) return "#FF4444";
  return props.light ? "rgba(255,255,255,0.9)" : "currentColor";
});
</script>

<template>
  <!-- Sending: clock icon -->
  <svg v-if="isSending" width="14" height="14" viewBox="0 0 24 24" fill="none" class="inline-block align-text-bottom">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" :style="{ color: iconColor }" />
    <path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" :style="{ color: iconColor }" />
  </svg>

  <!-- Failed: exclamation -->
  <svg v-else-if="isFailed" width="14" height="14" viewBox="0 0 24 24" fill="none" class="inline-block align-text-bottom">
    <circle cx="12" cy="12" r="9" stroke="#FF4444" stroke-width="1.8" />
    <path d="M12 8v5" stroke="#FF4444" stroke-width="2" stroke-linecap="round" />
    <circle cx="12" cy="16" r="1" fill="#FF4444" />
  </svg>

  <!-- Cancelled: grey X circle -->
  <svg v-else-if="isCancelled" width="14" height="14" viewBox="0 0 24 24" fill="none" class="inline-block align-text-bottom">
    <circle cx="12" cy="12" r="9" stroke="#999" stroke-width="1.8" />
    <path d="M9 9l6 6M15 9l-6 6" stroke="#999" stroke-width="1.8" stroke-linecap="round" />
  </svg>

  <!-- Double check (delivered / read) -->
  <svg v-else-if="isDouble" width="18" height="14" viewBox="0 0 20 14" fill="none" class="inline-block align-text-bottom">
    <path d="M1.5 7.5L5.5 11.5L13.5 2.5" :stroke="iconColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M6.5 7.5L10.5 11.5L18.5 2.5" :stroke="iconColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
  </svg>

  <!-- Single check (sent) -->
  <svg v-else width="14" height="14" viewBox="0 0 16 14" fill="none" class="inline-block align-text-bottom">
    <path d="M1.5 7.5L5.5 11.5L14.5 2.5" :stroke="iconColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</template>
