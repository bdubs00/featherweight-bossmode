// The faces of the agents. A face is an SVG from GET /v1/faces/{agent},
// read behind the token and shown as a blob URL in an img element. The page
// never puts an SVG of the API into its own markup.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';

interface Slot {
  hash: string;
  url: string;
  loading: Promise<void> | null;
  failed: boolean;
}

const slots = new Map<string, Slot>();
const listeners = new Map<string, Set<() => void>>();

function notify(agent: string): void {
  for (const f of listeners.get(agent) || []) f();
}

/** loadFace reads the face of an agent once for each hash. */
export function loadFace(agent: string, hash = ''): void {
  const old = slots.get(agent);
  if (old && old.hash === hash && (old.url || old.loading || old.failed)) return;
  const slot: Slot = { hash, url: old ? old.url : '', loading: null, failed: false };
  slots.set(agent, slot);
  slot.loading = api
    .faceBlob(agent)
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      if (old && old.url) URL.revokeObjectURL(old.url);
      slot.url = url;
    })
    .catch(() => {
      slot.failed = true;
    })
    .finally(() => {
      slot.loading = null;
      notify(agent);
    });
}

/** faceUrl returns the blob URL of a face, or "" while none is loaded. */
export function faceUrl(agent: string): string {
  const s = slots.get(agent);
  return s ? s.url : '';
}

/** useFace returns the blob URL of the face of an agent, and loads it. */
export function useFace(agent: string, hash = ''): string {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!agent) return;
    const set = listeners.get(agent) || new Set();
    const f = () => tick((n) => n + 1);
    set.add(f);
    listeners.set(agent, set);
    loadFace(agent, hash);
    return () => set.delete(f);
  }, [agent, hash]);
  return agent ? faceUrl(agent) : '';
}

/** forgetFaces drops every face, after a sign-out. */
export function forgetFaces(): void {
  for (const s of slots.values()) if (s.url) URL.revokeObjectURL(s.url);
  slots.clear();
}
