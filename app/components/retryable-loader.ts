export class ScriptLoadError extends Error {
  constructor(public readonly code: "load" | "timeout") { super(code); }
}

// Each attempt owns its callbacks. Failed or timed-out attempts cannot settle a retry.
export function createRetryableLoader<T>(start: (complete: (api: T) => void, fail: () => void) => () => void, timeout = 12_000) {
  let cached: T | undefined;
  let pending: Promise<T> | null = null;
  return () => {
    if (cached !== undefined) return Promise.resolve(cached);
    if (pending) return pending;
    const operation = new Promise<T>((resolve, reject) => {
      let settled = false;
      let cleanup: (() => void) | undefined;
      const finish = (api?: T, error?: ScriptLoadError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else { cached = api!; resolve(api!); }
        cleanup?.();
      };
      const timer = setTimeout(() => finish(undefined, new ScriptLoadError("timeout")), timeout);
      // Defer so synchronous setup failures cannot leave a rejected pending promise cached.
      Promise.resolve().then(() => {
        if (settled) return;
        try {
          cleanup = start((api) => finish(api), () => finish(undefined, new ScriptLoadError("load")));
          if (settled) cleanup();
        } catch { finish(undefined, new ScriptLoadError("load")); }
      });
    });
    pending = operation;
    void operation.then(() => { if (pending === operation) pending = null; }, () => { if (pending === operation) pending = null; });
    return operation;
  };
}
