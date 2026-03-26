/**
 * Wraps a promise with a timeout. Rejects with a descriptive error if
 * the promise does not settle within `ms` milliseconds.
 *
 * Note: does NOT cancel the underlying operation — it continues running
 * in the background. Safe when the caller reloads the page on error.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
