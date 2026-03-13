import { ref, type Ref } from "vue";

export type RecorderState = "idle" | "recording" | "locked" | "preview";

const MAX_DURATION = 60;

const PREFERRED_MIME = "video/webm;codecs=vp9,opus";
const FALLBACK_MIME = "video/webm";

function getSupportedMimeType(): string {
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(PREFERRED_MIME)) {
    return PREFERRED_MIME;
  }
  return FALLBACK_MIME;
}

/**
 * Generate a 240x240 thumbnail from the first frame of a video blob.
 * Returns a Blob (image/png) via an offscreen canvas.
 */
export async function generateThumbnail(videoBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    video.addEventListener("loadeddata", () => {
      // Seek to 0 to ensure the first frame is rendered
      video.currentTime = 0;
    });

    video.addEventListener("seeked", () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 240;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Draw video frame centered/cropped into 240x240
        const size = Math.min(video.videoWidth, video.videoHeight);
        const sx = (video.videoWidth - size) / 2;
        const sy = (video.videoHeight - size) / 2;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, 240, 240);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas toBlob returned null"));
            }
          },
          "image/png",
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    }, { once: true });

    video.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video for thumbnail"));
    }, { once: true });

    video.load();
  });
}

export function useVideoCircleRecorder() {
  const state = ref<RecorderState>("idle");
  const duration = ref(0);
  const recordedBlob = ref<Blob | null>(null);
  const videoStream: Ref<MediaStream | null> = ref(null);

  let mediaRecorder: MediaRecorder | null = null;
  let durationTimer: ReturnType<typeof setInterval> | null = null;
  let videoChunks: Blob[] = [];
  let mimeType = FALLBACK_MIME;

  const cleanup = () => {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
    if (videoStream.value) {
      videoStream.value.getTracks().forEach((t) => t.stop());
      videoStream.value = null;
    }
    mediaRecorder = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 480 },
          height: { ideal: 480 },
        },
        audio: true,
      });

      videoStream.value = stream;
      videoChunks = [];
      mimeType = getSupportedMimeType();

      mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.addEventListener("dataavailable", (e: BlobEvent) => {
        if (e.data.size > 0) videoChunks.push(e.data);
      });

      mediaRecorder.start(1000);
      state.value = "recording";
      duration.value = 0;

      durationTimer = setInterval(() => {
        duration.value++;
        if (duration.value >= MAX_DURATION) {
          stopAndSend();
        }
      }, 1000);
    } catch (e) {
      console.error("Failed to start video recording:", e);
      cleanup();
    }
  };

  /** Stop recording and get blob (used internally) */
  const stopRecorder = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        const blob =
          videoChunks.length > 0
            ? new Blob(videoChunks, { type: mimeType })
            : null;
        cleanup();
        resolve(blob);
      }, 3000);

      mediaRecorder.addEventListener(
        "stop",
        () => {
          clearTimeout(timeout);
          setTimeout(() => {
            const blob =
              videoChunks.length > 0
                ? new Blob(videoChunks, { type: mimeType })
                : null;
            cleanup();
            resolve(blob);
          }, 100);
        },
        { once: true },
      );

      mediaRecorder.stop();
    });
  };

  /** Stop and immediately return file + duration for sending */
  const stopAndSend = async (): Promise<{ file: File; duration: number } | null> => {
    const currentDuration = duration.value;
    const blob = await stopRecorder();
    if (!blob || blob.size === 0) {
      state.value = "idle";
      return null;
    }
    if (currentDuration < 1) {
      state.value = "idle";
      return null;
    }
    state.value = "idle";
    const file = new File([blob], `video_circle_${Date.now()}.webm`, {
      type: mimeType,
    });
    return { file, duration: currentDuration };
  };

  /** Stop recording and enter preview mode */
  const stopAndPreview = async () => {
    const blob = await stopRecorder();
    if (!blob || blob.size === 0) {
      state.value = "idle";
      return;
    }
    recordedBlob.value = blob;
    state.value = "preview";
  };

  /** Send from preview mode */
  const sendPreview = async (): Promise<{ file: File; duration: number } | null> => {
    const blob = recordedBlob.value;
    if (!blob) return null;
    const dur = duration.value;
    recordedBlob.value = null;
    state.value = "idle";
    const file = new File([blob], `video_circle_${Date.now()}.webm`, {
      type: mimeType,
    });
    return { file, duration: dur };
  };

  /** Start recording and immediately go to locked (hands-free) mode */
  const startAndLock = async () => {
    await startRecording();
    if (state.value === "recording") {
      state.value = "locked";
    }
  };

  const lock = () => {
    if (state.value === "recording") {
      state.value = "locked";
    }
  };

  const cancel = () => {
    videoChunks = [];
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    cleanup();
    recordedBlob.value = null;
    state.value = "idle";
  };

  return {
    state,
    duration,
    recordedBlob,
    videoStream,
    startRecording,
    startAndLock,
    stopAndSend,
    stopAndPreview,
    sendPreview,
    lock,
    cancel,
  };
}
