import { ref, type Ref } from "vue";

export type VideoRecorderState = "idle" | "recording" | "locked" | "preview";

const MAX_DURATION = 60;
const PREFERRED_MIME = "video/webm;codecs=vp9,opus";
const FALLBACK_MIME = "video/webm";

function getSupportedMimeType(): string {
  if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(PREFERRED_MIME)) {
    return PREFERRED_MIME;
  }
  return FALLBACK_MIME;
}

export function useVideoCircleRecorder() {
  const state = ref<VideoRecorderState>("idle");
  const duration = ref(0);
  const recordedBlob = ref<Blob | null>(null);
  const videoStream: Ref<MediaStream | null> = ref(null);

  let mediaRecorder: MediaRecorder | null = null;
  let durationTimer: ReturnType<typeof setInterval> | null = null;
  let videoChunks: Blob[] = [];
  let mimeType = FALLBACK_MIME;

  const cleanup = () => {
    if (durationTimer) { clearInterval(durationTimer); durationTimer = null; }
    if (videoStream.value) {
      videoStream.value.getTracks().forEach(t => t.stop());
      videoStream.value = null;
    }
    mediaRecorder = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
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

  const stopRecorder = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        const blob = videoChunks.length > 0 ? new Blob(videoChunks, { type: mimeType }) : null;
        cleanup();
        resolve(blob);
      }, 3000);

      mediaRecorder.addEventListener("stop", () => {
        clearTimeout(timeout);
        setTimeout(() => {
          const blob = videoChunks.length > 0 ? new Blob(videoChunks, { type: mimeType }) : null;
          cleanup();
          resolve(blob);
        }, 100);
      }, { once: true });

      mediaRecorder.stop();
    });
  };

  const stopAndSend = async (): Promise<{ file: File; duration: number } | null> => {
    const currentDuration = duration.value;
    const blob = await stopRecorder();
    if (!blob || blob.size === 0 || currentDuration < 1) {
      state.value = "idle";
      return null;
    }
    state.value = "idle";
    const file = new File([blob], `video_circle_${Date.now()}.webm`, { type: mimeType });
    return { file, duration: currentDuration };
  };

  const stopAndPreview = async () => {
    const blob = await stopRecorder();
    if (!blob || blob.size === 0) {
      state.value = "idle";
      return;
    }
    recordedBlob.value = blob;
    state.value = "preview";
  };

  const sendPreview = async (): Promise<{ file: File; duration: number } | null> => {
    const blob = recordedBlob.value;
    if (!blob) return null;
    const dur = duration.value;
    recordedBlob.value = null;
    state.value = "idle";
    const file = new File([blob], `video_circle_${Date.now()}.webm`, { type: mimeType });
    return { file, duration: dur };
  };

  const startAndLock = async () => {
    await startRecording();
    if (state.value === "recording") {
      state.value = "locked";
    }
  };

  const lock = () => {
    if (state.value === "recording") state.value = "locked";
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
    state, duration, recordedBlob, videoStream,
    startRecording, startAndLock, stopAndSend, stopAndPreview, sendPreview,
    lock, cancel,
  };
}
