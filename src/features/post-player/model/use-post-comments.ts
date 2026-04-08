import { ref } from "vue";
import { useAuthStore } from "@/entities/auth";
import type { PostComment } from "@/app/providers/initializers";

export function usePostComments(txid: string) {
  const authStore = useAuthStore();
  const comments = ref<PostComment[]>([]);
  const loading = ref(false);
  const submitting = ref(false);
  const error = ref<string | null>(null);

  const load = async () => {
    if (!txid) {
      console.error("[usePostComments] load called without txid");
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      console.log("[usePostComments] loading comments for txid:", txid);
      const result = await authStore.loadPostComments(txid);
      console.log("[usePostComments] loaded", result.length, "comments:", result);
      comments.value = result;
    } catch (e) {
      console.error("[usePostComments] load error:", e);
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  };

  const submit = async (message: string, parentId?: string) => {
    if (!message.trim() || submitting.value) return false;
    submitting.value = true;

    // Optimistic UI — show comment immediately while blockchain confirms
    const tempId = `temp-${Date.now()}`;
    const optimistic: PostComment = {
      id: tempId,
      postid: txid,
      parentid: parentId ?? "",
      answerid: "",
      address: authStore.address ?? "",
      message: message.trim(),
      time: Math.floor(Date.now() / 1000),
      scoreUp: 0,
      scoreDown: 0,
    };
    comments.value = [...comments.value, optimistic];

    try {
      const ok = await authStore.submitComment(txid, message, parentId);
      if (!ok) {
        // Remove optimistic comment on failure
        comments.value = comments.value.filter((c) => c.id !== tempId);
      }
      return ok;
    } catch (e) {
      console.error("[usePostComments] submit error:", e);
      comments.value = comments.value.filter((c) => c.id !== tempId);
      return false;
    } finally {
      submitting.value = false;
    }
  };

  return { comments, loading, submitting, error, load, submit };
}
