<script setup lang="ts">
import type { Message } from "@/entities/chat/model/types";
import { useAuthStore } from "@/entities/auth";
import VoiceMessage from "@/features/messaging/ui/VoiceMessage.vue";

const props = defineProps<{
  messages: Message[];
}>();

const { t } = useI18n();
const authStore = useAuthStore();

// Month grouping (same pattern as MediaGrid / FilesList)
interface MonthGroup {
  label: string;
  messages: Message[];
}

const grouped = computed<MonthGroup[]>(() => {
  const groups: MonthGroup[] = [];
  let currentLabel = "";
  let currentGroup: Message[] = [];

  // Sort newest-first
  const sorted = [...props.messages].sort((a, b) => b.timestamp - a.timestamp);

  for (const msg of sorted) {
    const d = new Date(msg.timestamp);
    const label = d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (label !== currentLabel) {
      if (currentGroup.length) groups.push({ label: currentLabel, messages: currentGroup });
      currentLabel = label;
      currentGroup = [msg];
    } else {
      currentGroup.push(msg);
    }
  }
  if (currentGroup.length) groups.push({ label: currentLabel, messages: currentGroup });
  return groups;
});

/** Resolve display name for a sender address */
function getSenderName(address: string): string {
  return authStore.getBastyonUserData(address)?.name || address.slice(0, 10);
}
</script>

<template>
  <div v-if="messages.length === 0" class="flex flex-col items-center justify-center py-16">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-text-on-main-bg-color">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
    <span class="mt-3 text-sm text-text-on-main-bg-color">{{ t("chatInfo.noVoice") }}</span>
  </div>

  <div v-else>
    <div v-for="group in grouped" :key="group.label" class="mb-1">
      <div class="px-3 pb-1 pt-3 text-[13px] font-medium text-text-on-main-bg-color">
        {{ group.label }}
      </div>
      <div
        v-for="msg in group.messages"
        :key="msg.id"
        class="px-3 py-2"
      >
        <div class="mb-1 text-xs text-text-on-main-bg-color">
          {{ getSenderName(msg.senderId) }}
        </div>
        <VoiceMessage
          :message="msg"
          :is-own="msg.senderId === authStore.address"
        />
      </div>
    </div>
  </div>
</template>
