import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useSelectionStore = defineStore("selection", () => {
  const isSelectionMode = ref(false);
  const _selectedIds = ref<Set<string>>(new Set());

  const count = computed(() => _selectedIds.value.size);
  const selectedIds = computed(() => [..._selectedIds.value]);

  function isSelected(id: string): boolean {
    return _selectedIds.value.has(id);
  }

  function activate(roomId: string) {
    isSelectionMode.value = true;
    const next = new Set(_selectedIds.value);
    next.add(roomId);
    _selectedIds.value = next;
  }

  function toggle(roomId: string) {
    const next = new Set(_selectedIds.value);
    if (next.has(roomId)) next.delete(roomId);
    else next.add(roomId);
    _selectedIds.value = next;

    if (next.size === 0) {
      isSelectionMode.value = false;
    }
  }

  function deactivate() {
    isSelectionMode.value = false;
    _selectedIds.value = new Set();
  }

  function selectAll(ids: string[]) {
    const next = new Set(_selectedIds.value);
    for (const id of ids) next.add(id);
    _selectedIds.value = next;
  }

  return {
    isSelectionMode,
    selectedIds,
    count,
    isSelected,
    activate,
    toggle,
    deactivate,
    selectAll,
  };
});
