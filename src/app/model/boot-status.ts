import { ref, computed } from "vue";

export type BootStep =
  | "scripts"
  | "tor"
  | "auth"
  | "matrix"
  | "sync"
  | "ready";

export type BootState = "booting" | "ready" | "error";

const _bootStart = Date.now();
const _stepStartedAt = ref(_bootStart);
const _currentStep = ref<BootStep>("scripts");
const _state = ref<BootState>("booting");
const _errorMessage = ref<string | null>(null);

function elapsed(): number {
  return Date.now() - _stepStartedAt.value;
}

export const bootStatus = {
  state: computed(() => _state.value),
  currentStep: computed(() => _currentStep.value),
  error: computed(() => _errorMessage.value),

  /** Advance to the next boot step. Logs timing of the previous step. */
  setStep(step: BootStep) {
    if (_state.value !== "booting") return;
    console.log(`[BOOT] ${_currentStep.value} done in ${elapsed()}ms → ${step}`);
    _currentStep.value = step;
    _stepStartedAt.value = Date.now();
  },

  /** Mark boot as successfully completed. */
  setReady() {
    if (_state.value !== "booting") return;
    const total = Date.now() - _bootStart;
    console.log(`[BOOT] ${_currentStep.value} done in ${elapsed()}ms`);
    console.log(`[BOOT] ✓ App ready (total ${total}ms)`);
    _state.value = "ready";
    _currentStep.value = "ready";
  },

  /** Mark boot as failed. Shows error UI in AppLoading. */
  setError(msg: string) {
    console.error(`[BOOT] ✗ Error at step "${_currentStep.value}": ${msg}`);
    _state.value = "error";
    _errorMessage.value = msg;
  },

  /** Reset to initial state (for retry). */
  reset() {
    _currentStep.value = "scripts";
    _state.value = "booting";
    _errorMessage.value = null;
    _stepStartedAt.value = Date.now();
  },
};
