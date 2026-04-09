<script setup lang="ts">
import { ref, computed } from "vue";
import { useChatStore } from "@/entities/chat";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { UserAvatar } from "@/entities/user";
import { useResolvedRoomName } from "@/entities/chat/lib/use-resolved-room-name";
import { isUnresolvedName } from "@/entities/chat/lib/chat-helpers";

interface Props {
  show: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const chatStore = useChatStore();
const { t } = useI18n();
const { resolve: resolveRoomName } = useResolvedRoomName();

const search = ref("");

const filteredRooms = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return chatStore.sortedRooms;
  return chatStore.sortedRooms.filter(r => {
    const name = resolveRoomName(r);
    return name.toLowerCase().includes(q);
  });
});

const selectRoom = (roomId: string) => {
  // Navigate to selected chat — forwardingMessage stays in store
  chatStore.setActiveRoom(roomId);
  search.value = "";
  emit("close");
};

const handleClose = () => {
  chatStore.cancelForward();
  search.value = "";
  emit("close");
};
</script>

<template>
  <BottomSheet :show="props.show" @close="handleClose">
    <div class="mb-3 flex items-center justify-between">
      <span class="text-base font-semibold text-text-color">{{ t("forward.title") }}</span>
    </div>

    <input
      v-model="search"
      type="text"
      :placeholder="t('forward.searchPlaceholder')"
      class="mb-3 w-full rounded-lg bg-chat-input-bg px-3 py-2 text-sm text-text-color outline-none placeholder:text-neutral-grad-2"
    />

    <div class="max-h-[40vh] overflow-y-auto">
      <button
        v-for="room in filteredRooms"
        :key="room.id"
        class="flex w-full items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-grad-0"
        @click="selectRoom(room.id)"
      >
        <UserAvatar
          v-if="room.avatar?.startsWith('__pocketnet__:')"
          :address="room.avatar.replace('__pocketnet__:', '')"
          size="sm"
        />
        <div
          v-else
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-color-bg-ac text-xs font-medium text-white"
        >
          {{ (resolveRoomName(room) || '?')[0].toUpperCase() }}
        </div>

        <div class="min-w-0 flex-1 text-left">
          <span v-if="isUnresolvedName(resolveRoomName(room))" class="inline-block h-3.5 w-24 animate-pulse rounded bg-neutral-grad-2" />
          <span v-else class="truncate text-sm text-text-color">{{ resolveRoomName(room) }}</span>
        </div>
      </button>

      <div v-if="filteredRooms.length === 0" class="p-4 text-center text-sm text-text-on-main-bg-color">
        {{ t("forward.noChats") }}
      </div>
    </div>
  </BottomSheet>
</template>
