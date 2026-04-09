import { describe, it, expect, beforeEach } from "vitest";
import { saveShareData, consumeShareData, type ExternalShareData } from "../share-target";

describe("share-target", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("saveShareData / consumeShareData", () => {
    it("saves and retrieves text share data", () => {
      const data: ExternalShareData = { text: "Hello from browser" };
      saveShareData(data);
      const result = consumeShareData();
      expect(result).toEqual(data);
    });

    it("clears data after consuming", () => {
      saveShareData({ text: "once" });
      consumeShareData();
      expect(consumeShareData()).toBeNull();
    });

    it("returns null when no data saved", () => {
      expect(consumeShareData()).toBeNull();
    });

    it("saves file share data", () => {
      const data: ExternalShareData = {
        fileUri: "content://media/image.jpg",
        fileName: "image.jpg",
        mimeType: "image/jpeg",
      };
      saveShareData(data);
      expect(consumeShareData()).toEqual(data);
    });

    it("handles corrupted localStorage gracefully", () => {
      localStorage.setItem("bastyon-chat-share-data", "not-json{{{");
      expect(consumeShareData()).toBeNull();
    });
  });
});
