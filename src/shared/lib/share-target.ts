import { isNative } from "@/shared/lib/platform";

const STORAGE_KEY = "bastyon-chat-share-data";

export interface ExternalShareData {
  text?: string;
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
}

/** Save share data to localStorage for deferred processing (cold start / not authed) */
export function saveShareData(data: ExternalShareData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/** Read and clear deferred share data */
export function consumeShareData(): ExternalShareData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  localStorage.removeItem(STORAGE_KEY);
  try {
    return JSON.parse(raw) as ExternalShareData;
  } catch {
    return null;
  }
}

/** Initialize the share target listener (call once on app mount, native only).
 *  Calls `onShare` when content is received from Android Share Sheet. */
export async function initShareTargetListener(
  onShare: (data: ExternalShareData) => void,
): Promise<void> {
  if (!isNative) return;

  const { CapacitorShareTarget } = await import("@capgo/capacitor-share-target");

  await CapacitorShareTarget.addListener("shareReceived", (event) => {
    const data: ExternalShareData = {};

    // Text / URL
    if (event.texts?.length) {
      data.text = event.texts.join("\n");
    }

    // First file only (single-file sharing)
    if (event.files?.length) {
      const file = event.files[0];
      data.fileUri = file.uri;
      data.fileName = file.name;
      data.mimeType = file.mimeType;
    }

    if (data.text || data.fileUri) {
      onShare(data);
    }
  });
}
