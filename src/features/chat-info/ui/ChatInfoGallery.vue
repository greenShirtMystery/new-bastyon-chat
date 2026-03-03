<script setup lang="ts">
import { useChatStore } from "@/entities/chat";
import { MessageType } from "@/entities/chat/model/types";
import type { TranslationKey } from "@/shared/lib/i18n";
import MediaViewer from "@/features/messaging/ui/MediaViewer.vue";
import MediaGrid from "./MediaGrid.vue";
import FilesList from "./FilesList.vue";
import LinksList from "./LinksList.vue";
import VoiceList from "./VoiceList.vue";

const props = withDefaults(
  defineProps<{
    initialTab?: "media" | "files" | "links" | "voice";
  }>(),
  { initialTab: "media" },
);

const emit = defineEmits<{ back: [] }>();
const { t } = useI18n();
const chatStore = useChatStore();

type TabId = "media" | "files" | "links" | "voice";
const activeTab = ref<TabId>(props.initialTab);

const tabs: { id: TabId; labelKey: TranslationKey }[] = [
  { id: "media", labelKey: "chatInfo.media" },
  { id: "files", labelKey: "chatInfo.files" },
  { id: "links", labelKey: "chatInfo.links" },
  { id: "voice", labelKey: "chatInfo.voice" },
];

// Filtered message arrays
const mediaMessages = computed(() =>
  chatStore.activeMessages.filter(
    (m) => m.type === MessageType.image || m.type === MessageType.video,
  ),
);
const fileMessages = computed(() =>
  chatStore.activeMessages.filter((m) => m.type === MessageType.file),
);
const voiceMessages = computed(() =>
  chatStore.activeMessages.filter((m) => m.type === MessageType.audio),
);
const textMessages = computed(() =>
  chatStore.activeMessages.filter((m) => m.type === MessageType.text),
);

// MediaViewer state
const showViewer = ref(false);
const viewerMessageId = ref<string | null>(null);

const openViewer = (messageId: string) => {
  viewerMessageId.value = messageId;
  showViewer.value = true;
};

// Tab underline position (for sliding animation)
const tabRefs = ref<HTMLElement[]>([]);
const underlineStyle = computed(() => {
  const idx = tabs.findIndex((tab) => tab.id === activeTab.value);
  if (idx < 0 || !tabRefs.value[idx]) return {};
  const el = tabRefs.value[idx];
  return {
    width: `${el.offsetWidth}px`,
    transform: `translateX(${el.offsetLeft}px)`,
  };
});
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <div
      class="flex items-center gap-2 border-b border-neutral-grad-0 px-2 py-3"
    >
      <button
        class="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-neutral-grad-0"
        @click="emit('back')"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span class="text-base font-semibold text-text-color">{{
        t("chatInfo.mediaAndFiles")
      }}</span>
    </div>

    <!-- Tabs -->
    <div class="relative flex border-b border-neutral-grad-0">
      <button
        v-for="(tab, i) in tabs"
        :key="tab.id"
        :ref="
          (el) => {
            if (el) tabRefs[i] = el as HTMLElement;
          }
        "
        class="flex-1 py-2.5 text-center text-[13px] font-medium transition-colors"
        :class="
          activeTab === tab.id
            ? 'text-color-txt-ac'
            : 'text-text-on-main-bg-color hover:text-text-color'
        "
        @click="activeTab = tab.id"
      >
        {{ t(tab.labelKey) }}
      </button>
      <!-- Sliding underline -->
      <div
        class="absolute bottom-0 h-0.5 bg-color-bg-ac transition-all duration-200 ease-in-out"
        :style="underlineStyle"
      />
    </div>

    <!-- Tab content (scrollable) -->
    <div class="flex-1 overflow-y-auto">
      <MediaGrid
        v-if="activeTab === 'media'"
        :messages="mediaMessages"
        @select="openViewer"
      />
      <FilesList
        v-else-if="activeTab === 'files'"
        :messages="fileMessages"
      />
      <LinksList
        v-else-if="activeTab === 'links'"
        :messages="textMessages"
      />
      <VoiceList
        v-else-if="activeTab === 'voice'"
        :messages="voiceMessages"
      />
    </div>
  </div>

  <!-- MediaViewer teleported to body -->
  <MediaViewer
    :show="showViewer"
    :message-id="viewerMessageId"
    @close="showViewer = false"
  />
</template>
