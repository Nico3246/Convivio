/** A failed connection cannot leave a form busy forever. Caller cancellation wins. */
export const boundedFetch: typeof fetch = async (input, init) => {
  const controller = new AbortController();
  const previous = init?.signal;
  const cancel = () => controller.abort();
  if (previous?.aborted) cancel();
  else previous?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 20_000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    previous?.removeEventListener('abort', cancel);
  }
};
