import { useAuthStore } from "@/entities/auth";
import type { PostScore } from "@/app/providers/initializers";

// Shared state per txid so PostCard and PostPlayerModal stay in sync
const scoresCache = new Map<string, { scores: Ref<PostScore[]>; myScore: Ref<number | null> }>();

export function usePostScores(txid: string) {
  const authStore = useAuthStore();

  // Reuse existing reactive state for this txid, or create new
  if (!scoresCache.has(txid)) {
    scoresCache.set(txid, {
      scores: ref<PostScore[]>([]),
      myScore: ref<number | null>(null),
    });
  }
  const cached = scoresCache.get(txid)!;
  const scores = cached.scores;
  const myScore = cached.myScore;

  const loading = ref(false);
  const submitting = ref(false);

  const averageScore = computed(() => {
    if (scores.value.length === 0) return 0;
    const sum = scores.value.reduce((acc, s) => acc + s.value, 0);
    return sum / scores.value.length;
  });

  const totalVotes = computed(() => scores.value.length);
  const hasVoted = computed(() => myScore.value !== null && myScore.value > 0);

  const load = async () => {
    loading.value = true;
    try {
      const [scoresData, myVal] = await Promise.all([
        authStore.loadPostScores(txid),
        authStore.loadMyPostScore(txid),
      ]);
      // Don't overwrite optimistic vote with stale blockchain data
      if (hasVoted.value) {
        // Merge: use server scores but keep our optimistic vote appended
        const myVoteValue = myScore.value!;
        const alreadyInServer = scoresData.some(
          (s) => s.address === authStore.address && s.value === myVoteValue,
        );
        scores.value = alreadyInServer
          ? scoresData
          : [...scoresData, { address: authStore.address!, value: myVoteValue, posttxid: txid }];
      } else {
        scores.value = scoresData;
        myScore.value = myVal;
      }
    } finally {
      loading.value = false;
    }
  };

  const submitVote = (value: number) => {
    if (hasVoted.value) return false;

    // Optimistic update — show rating immediately, blockchain confirms later
    myScore.value = value;
    scores.value = [...scores.value, { address: authStore.address!, value, posttxid: txid }];

    // Fire-and-forget — don't revert on error (blockchain will catch up)
    console.log("[postScores] submitting vote:", txid, value);
    authStore.submitUpvote(txid, value)
      .then((ok) => console.log("[postScores] vote result:", txid, ok))
      .catch((e) => console.warn("[postScores] vote error:", txid, e));

    return true;
  };

  return { scores, myScore, averageScore, totalVotes, hasVoted, loading, submitting, load, submitVote };
}
