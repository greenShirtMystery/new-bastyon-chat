import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useSelectionStore } from "./selection-store";

describe("useSelectionStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts in non-selection mode with empty set", () => {
    const store = useSelectionStore();
    expect(store.isSelectionMode).toBe(false);
    expect(store.count).toBe(0);
  });

  it("activate enters selection mode and adds the room", () => {
    const store = useSelectionStore();
    store.activate("room1");
    expect(store.isSelectionMode).toBe(true);
    expect(store.isSelected("room1")).toBe(true);
    expect(store.count).toBe(1);
  });

  it("toggle adds and removes rooms", () => {
    const store = useSelectionStore();
    store.activate("room1");
    store.toggle("room2");
    expect(store.count).toBe(2);
    expect(store.isSelected("room2")).toBe(true);

    store.toggle("room2");
    expect(store.count).toBe(1);
    expect(store.isSelected("room2")).toBe(false);
  });

  it("auto-deactivates when last room is toggled off", () => {
    const store = useSelectionStore();
    store.activate("room1");
    store.toggle("room1");
    expect(store.isSelectionMode).toBe(false);
    expect(store.count).toBe(0);
  });

  it("deactivate clears everything", () => {
    const store = useSelectionStore();
    store.activate("room1");
    store.toggle("room2");
    store.deactivate();
    expect(store.isSelectionMode).toBe(false);
    expect(store.count).toBe(0);
    expect(store.isSelected("room1")).toBe(false);
  });

  it("selectAll adds multiple rooms at once", () => {
    const store = useSelectionStore();
    store.activate("room1");
    store.selectAll(["room2", "room3", "room4"]);
    expect(store.count).toBe(4);
  });

  it("selectedIds returns current selection as array", () => {
    const store = useSelectionStore();
    store.activate("room1");
    store.toggle("room2");
    expect(store.selectedIds).toContain("room1");
    expect(store.selectedIds).toContain("room2");
    expect(store.selectedIds).toHaveLength(2);
  });
});
