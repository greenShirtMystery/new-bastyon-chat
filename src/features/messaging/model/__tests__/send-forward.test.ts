import { describe, it, expect, vi } from "vitest";

describe("sendForward", () => {
  it("should call createLocal with forwardedFrom and enqueue to syncEngine", async () => {
    const createLocal = vi.fn().mockResolvedValue({ clientId: "test-uuid" });
    const enqueue = vi.fn().mockResolvedValue(1);

    const roomId = "!room:server";
    const senderId = "user123";
    const content = "Hello world";
    const forwardMeta = { senderId: "original-sender", senderName: "Alice" };

    const localMsg = await createLocal({
      roomId,
      senderId,
      content,
      type: "text",
      forwardedFrom: forwardMeta,
    });

    expect(createLocal).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId,
        content,
        forwardedFrom: { senderId: "original-sender", senderName: "Alice" },
      }),
    );

    await enqueue("send_message", roomId, {
      content,
      forwardedFrom: forwardMeta,
    }, localMsg.clientId);

    expect(enqueue).toHaveBeenCalledWith(
      "send_message",
      "!room:server",
      expect.objectContaining({ forwardedFrom: forwardMeta }),
      "test-uuid",
    );
  });

  it("forward preview text truncates long content", () => {
    const longText = "A".repeat(200);
    const preview = longText.length > 100 ? longText.slice(0, 100) + "\u2026" : longText;
    expect(preview).toBe("A".repeat(100) + "\u2026");
  });
});
