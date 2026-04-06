import { describe, it, expect, vi } from "vitest";
import { registerUploadAbort, abortUpload, isUploadAbortable, unregisterUploadAbort } from "./upload-abort-registry";

describe("cancel upload integration", () => {
  it("abort mid-upload triggers AbortError", async () => {
    const clientId = "test-cancel-1";
    const controller = registerUploadAbort(clientId);

    // Simulate an upload that checks for abort
    const uploadPromise = new Promise<string>((resolve, reject) => {
      const check = () => {
        if (controller.signal.aborted) {
          reject(new DOMException("Upload cancelled", "AbortError"));
          return;
        }
        setTimeout(check, 10);
      };
      check();
    });

    // Cancel after 50ms
    setTimeout(() => abortUpload(clientId), 50);

    await expect(uploadPromise).rejects.toThrow("Upload cancelled");
    expect(isUploadAbortable(clientId)).toBe(false);
  });

  it("re-register after cancel creates fresh controller", () => {
    const clientId = "test-reuse-1";
    const first = registerUploadAbort(clientId);
    abortUpload(clientId);
    expect(first.signal.aborted).toBe(true);

    const second = registerUploadAbort(clientId);
    expect(second.signal.aborted).toBe(false);
    expect(isUploadAbortable(clientId)).toBe(true);

    unregisterUploadAbort(clientId);
  });

  it("AbortError has correct name property for instanceof check", () => {
    const clientId = "test-abort-name";
    registerUploadAbort(clientId);

    const error = new DOMException("Upload cancelled", "AbortError");
    expect(error instanceof DOMException).toBe(true);
    expect(error.name).toBe("AbortError");

    unregisterUploadAbort(clientId);
  });

  it("abort signal propagates to listener", () => {
    const clientId = "test-signal-listener";
    const controller = registerUploadAbort(clientId);

    const abortHandler = vi.fn();
    controller.signal.addEventListener("abort", abortHandler);

    abortUpload(clientId);

    expect(abortHandler).toHaveBeenCalledTimes(1);
  });
});
