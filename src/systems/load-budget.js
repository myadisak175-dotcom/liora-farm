/** Bound a load without allowing its late result to mutate its caller. */
export function withLoadBudget(promise, milliseconds, label = "asset", onLate = null) {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error(`Load timed out: ${label}`));
    }, milliseconds);
    Promise.resolve(promise).then((value) => {
      clearTimeout(timer);
      if (expired) {
        try { onLate?.(value); } catch (error) { console.warn("Late load cleanup failed", error); }
        return;
      }
      resolve(value);
    }, (error) => {
      clearTimeout(timer);
      if (!expired) reject(error);
    });
  });
}

/** Covers both headers and body: a stalled JSON body also has a deadline. */
export async function fetchBootJSON(url, milliseconds = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
