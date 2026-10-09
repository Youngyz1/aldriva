/** Shared, DOM-free helpers for bounded invitation gallery uploads. */

export const INVITATION_GALLERY_UPLOAD_CONCURRENCY = 2;

export function selectFilesWithinLimit<T>(files: readonly T[], remaining: number) {
  const limit = Math.max(0, Math.floor(remaining));
  return {
    accepted: files.slice(0, limit),
    overflowCount: Math.max(0, files.length - limit),
  };
}

export function createBoundedTaskQueue(concurrency = INVITATION_GALLERY_UPLOAD_CONCURRENCY) {
  const limit = Math.max(1, Math.floor(concurrency));
  const waiting: Array<() => void> = [];
  let active = 0;

  function pump() {
    while (active < limit && waiting.length > 0) {
      const start = waiting.shift();
      if (!start) continue;
      active += 1;
      start();
    }
  }

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        waiting.push(() => {
          void Promise.resolve()
            .then(task)
            .then(resolve, reject)
            .finally(() => {
              active -= 1;
              pump();
            });
        });
        pump();
      });
    },
  };
}
