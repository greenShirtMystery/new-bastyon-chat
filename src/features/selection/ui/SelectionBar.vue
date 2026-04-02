<script setup lang="ts">
interface Props {
  count: number;
}

defineProps<Props>();
const emit = defineEmits<{
  cancel: [];
  action: [type: "delete" | "read" | "pin" | "mute"];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex h-14 items-center gap-3 border-b border-neutral-grad-0 px-3">
    <!-- Cancel + counter -->
    <button
      class="btn-press flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-neutral-grad-0"
      :aria-label="t('common.cancel')"
      @click="emit('cancel')"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
    <span class="text-sm font-semibold text-text-color">
      {{ t("selection.selected", { count }) }}
    </span>

    <div class="flex-1" />

    <!-- Bulk actions -->
    <button
      class="btn-press flex h-9 w-9 items-center justify-center rounded-full text-text-on-main-bg-color transition-colors hover:bg-neutral-grad-0"
      :title="t('contactList.markAsRead')"
      @click="emit('action', 'read')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </button>
    <button
      class="btn-press flex h-9 w-9 items-center justify-center rounded-full text-text-on-main-bg-color transition-colors hover:bg-neutral-grad-0"
      :title="t('contactList.pin')"
      @click="emit('action', 'pin')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
      </svg>
    </button>
    <button
      class="btn-press flex h-9 w-9 items-center justify-center rounded-full text-text-on-main-bg-color transition-colors hover:bg-neutral-grad-0"
      :title="t('contactList.mute')"
      @click="emit('action', 'mute')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    </button>
    <button
      class="btn-press flex h-9 w-9 items-center justify-center rounded-full text-color-bad transition-colors hover:bg-color-bad/10"
      :title="t('contactList.delete')"
      @click="emit('action', 'delete')"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  </div>
</template>
