<script setup lang="ts">
import AccountList from "./AccountList.vue";

const emit = defineEmits<{
  switch: [address: string];
  add: [];
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <div class="fixed inset-0 z-40" @click="emit('close')" />
    <!-- Popover positioned above tab bar -->
    <div
      class="fixed bottom-16 left-1/2 z-50 w-64 -translate-x-1/2 rounded-xl border border-neutral-grad-0 bg-background-secondary-theme p-2 shadow-xl"
      style="margin-bottom: var(--safe-area-inset-bottom, 0px)"
    >
      <AccountList
        compact
        :show-active="true"
        @switch="(addr: string) => { emit('switch', addr); emit('close'); }"
        @add="() => { emit('add'); emit('close'); }"
      />
    </div>
  </Teleport>
</template>
