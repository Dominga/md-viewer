import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { extname } from "./paths";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  ico: "image/x-icon",
};

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export type AssetStatus = "loading" | "ready" | "error";

/** Load an asset through the backend and expose it as an object URL. */
export function loadAsset(rel: string): Promise<string> {
  const cached = cache.get(rel);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(rel);
  if (inFlight) return inFlight;

  const task = (async () => {
    const buffer = await api.readAsset(rel);
    const type = MIME[extname(rel)] ?? "application/octet-stream";
    const url = URL.createObjectURL(new Blob([buffer], { type }));
    cache.set(rel, url);
    return url;
  })();

  pending.set(rel, task);
  task.finally(() => pending.delete(rel));
  return task;
}

export function invalidateAsset(rel: string) {
  const url = cache.get(rel);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(rel);
  }
}

export function clearAssetCache() {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
}

/**
 * React binding for {@link loadAsset}. `fsTick` bumps whenever the watcher
 * reports a change, so a replaced image is fetched again.
 */
export function useAsset(rel: string | null, fsTick = 0) {
  const [state, setState] = useState<{ status: AssetStatus; url: string | null }>({
    status: "loading",
    url: null,
  });

  useEffect(() => {
    if (!rel) {
      setState({ status: "error", url: null });
      return;
    }
    let alive = true;
    setState((prev) => (prev.url ? prev : { status: "loading", url: null }));
    loadAsset(rel)
      .then((url) => {
        if (alive) setState({ status: "ready", url });
      })
      .catch(() => {
        if (alive) setState({ status: "error", url: null });
      });
    return () => {
      alive = false;
    };
  }, [rel, fsTick]);

  return state;
}

export function useAssetUrl(rel: string | null, fsTick = 0) {
  const { url } = useAsset(rel, fsTick);
  return url;
}

export function useOpenExternal() {
  return useCallback((url: string) => api.openExternal(url), []);
}
