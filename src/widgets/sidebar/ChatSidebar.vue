<script setup lang="ts">
import { ContactList, ContactSearch, FolderTabs } from "@/features/contacts";
import { useChatStore } from "@/entities/chat";
import { RoomListSkeleton } from "@/shared/ui/skeleton";
import BottomTabBar from "./ui/BottomTabBar.vue";
import ContactsPanel from "./ui/ContactsPanel.vue";
import SettingsPanel from "./ui/SettingsPanel.vue";
import { useSidebarTab } from "./model/use-sidebar-tab";
import type { SidebarTab } from "./model/use-sidebar-tab";

const emit = defineEmits<{ selectRoom: []; newGroup: [] }>();
const chatStore = useChatStore();

onMounted(() => {
  chatStore.loadCachedRooms();
});

const { t } = useI18n();
const { activeTab, setTab } = useSidebarTab();

const searchOpen = ref(false);
const activeFilter = ref<"all" | "personal" | "groups" | "invites">("all");
const tabOrder = ["all", "personal", "groups", "invites"] as const;
const slideDirection = ref<"left" | "right">("left");

watch(activeFilter, (newVal, oldVal) => {
  slideDirection.value = tabOrder.indexOf(newVal) > tabOrder.indexOf(oldVal) ? "left" : "right";
});

// Sidebar tab slide direction
const sidebarTabOrder: SidebarTab[] = ["contacts", "chats", "settings"];
const tabSlideDir = ref<"left" | "right">("left");

watch(activeTab, (newVal, oldVal) => {
  tabSlideDir.value =
    sidebarTabOrder.indexOf(newVal) > sidebarTabOrder.indexOf(oldVal) ? "left" : "right";
});

const roomsLoading = ref(true);

// Hide loader only when rooms + user names are both ready
let stopWatch: ReturnType<typeof watch> | undefined;
const cancelLoading = () => {
  roomsLoading.value = false;
  stopWatch?.();
};
stopWatch = watch(
  [() => chatStore.sortedRooms.length, () => chatStore.namesReady],
  ([len, names]) => {
    // Both rooms and names loaded — reveal everything at once
    if (len > 0 && names) cancelLoading();
  },
  { immediate: true },
);
// Fallback: if rooms loaded but namesReady never fires (API fail) — show after 15s
setTimeout(() => {
  if (chatStore.sortedRooms.length > 0) cancelLoading();
}, 15000);
// Absolute fallback: 60s (user truly has no chats, or everything failed)
setTimeout(cancelLoading, 60000);

// Auto-switch away from "invites" tab when no invites remain
watch(
  () => chatStore.inviteCount,
  (count) => {
    if (count === 0 && activeFilter.value === "invites") {
      activeFilter.value = "all";
    }
  },
);

const handleSelectRoom = () => {
  searchOpen.value = false;
  emit("selectRoom");
};

const handleRoomCreated = () => {
  searchOpen.value = false;
  emit("selectRoom");
};
</script>

<template>
  <aside
    class="flex h-full flex-col border-r border-neutral-grad-0 bg-chat-sidebar"
    aria-label="Chat sidebar"
  >
    <div class="relative min-h-0 flex-1 overflow-hidden">
      <transition :name="'sidebar-slide-' + tabSlideDir" mode="out-in">
        <!-- CHATS tab -->
        <div
          v-if="activeTab === 'chats'"
          key="chats"
          class="flex h-full flex-col"
        >
        <!-- Header -->
        <div
          class="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-grad-0 px-3"
        >
          <span class="flex-1 pl-1 text-base font-semibold text-text-color">{{ t("nav.chats") }}</span>

          <!-- Search toggle -->
          <button
            class="btn-press flex h-11 w-11 items-center justify-center rounded-full text-text-on-main-bg-color transition-colors hover:bg-neutral-grad-0"
            :title="t('nav.searchUsers')"
            :aria-label="searchOpen ? t('nav.closeSearch') : t('nav.searchUsers')"
            :aria-pressed="searchOpen"
            @click="searchOpen = !searchOpen"
          >
            <svg
              v-if="!searchOpen"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <svg
              v-else
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <!-- New Group -->
          <button
            class="btn-press flex h-11 w-11 items-center justify-center rounded-full text-text-on-main-bg-color transition-colors hover:bg-neutral-grad-0"
            :title="t('nav.newGroup')"
            :aria-label="t('nav.newGroup')"
            @click="emit('newGroup')"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>

        <!-- Search bar (collapsible) -->
        <div v-if="searchOpen" class="shrink-0 border-b border-neutral-grad-0 p-3">
          <ContactSearch @room-created="handleRoomCreated" />
        </div>

        <FolderTabs v-model="activeFilter" />

        <div class="relative flex-1 overflow-hidden">
          <RoomListSkeleton v-if="roomsLoading" :first-load="true" />
          <transition v-else :name="'tab-slide-' + slideDirection">
            <ContactList
              :key="activeFilter"
              :filter="activeFilter"
              class="absolute inset-0 overflow-y-auto"
              @select-room="handleSelectRoom"
            />
          </transition>
        </div>
      </div>

        <!-- CONTACTS tab -->
        <ContactsPanel
          v-else-if="activeTab === 'contacts'"
          key="contacts"
          class="h-full"
          @select-room="handleSelectRoom"
        />

        <!-- SETTINGS tab -->
        <SettingsPanel
          v-else
          key="settings"
          class="h-full"
        />
      </transition>
    </div>

    <BottomTabBar :model-value="activeTab" @update:model-value="setTab" />
  </aside>
</template>

<style scoped>
/* FolderTab content slides (existing) */
.tab-slide-left-enter-active,
.tab-slide-left-leave-active,
.tab-slide-right-enter-active,
.tab-slide-right-leave-active {
  transition: transform 0.25s ease, opacity 0.2s ease;
}
.tab-slide-left-leave-active,
.tab-slide-right-leave-active {
  position: absolute;
  inset: 0;
}
.tab-slide-left-enter-from {
  transform: translateX(35%);
  opacity: 0;
}
.tab-slide-left-leave-to {
  transform: translateX(-35%);
  opacity: 0;
}
.tab-slide-right-enter-from {
  transform: translateX(-35%);
  opacity: 0;
}
.tab-slide-right-leave-to {
  transform: translateX(35%);
  opacity: 0;
}

/* Sidebar tab slides (Contacts ↔ Chats ↔ Settings) */
.sidebar-slide-left-enter-active,
.sidebar-slide-left-leave-active,
.sidebar-slide-right-enter-active,
.sidebar-slide-right-leave-active {
  transition: transform 0.2s ease, opacity 0.15s ease;
}
.sidebar-slide-left-leave-active,
.sidebar-slide-right-leave-active {
  position: absolute;
  inset: 0;
}
.sidebar-slide-left-enter-from {
  transform: translateX(30%);
  opacity: 0;
}
.sidebar-slide-left-leave-to {
  transform: translateX(-30%);
  opacity: 0;
}
.sidebar-slide-right-enter-from {
  transform: translateX(-30%);
  opacity: 0;
}
.sidebar-slide-right-leave-to {
  transform: translateX(30%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .tab-slide-left-enter-active,
  .tab-slide-left-leave-active,
  .tab-slide-right-enter-active,
  .tab-slide-right-leave-active,
  .sidebar-slide-left-enter-active,
  .sidebar-slide-left-leave-active,
  .sidebar-slide-right-enter-active,
  .sidebar-slide-right-leave-active {
    transition: none;
  }
}
</style>
