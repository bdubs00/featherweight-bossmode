// The start of a run, from its first event, fw.run.queued: the inline
// profile of the request, the tools beyond the list of the agent, and the
// profile that the kernel resolved. The run object does not carry the
// resolved profile yet (docs/CONTRACT.md, section 7.1), so the page reads
// the event once per run. A run never changes its start, so the page keeps
// the answer for the life of the tab.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { QueuedData } from '../api/types';

const cache = new Map<string, QueuedData | null>();
const reads = new Map<string, Promise<QueuedData | null>>();

/** readQueued reads the data of fw.run.queued of a run, or null when the page cannot read it. */
export function readQueued(run: string): Promise<QueuedData | null> {
  if (cache.has(run)) return Promise.resolve(cache.get(run) || null);
  let p = reads.get(run);
  if (!p) {
    p = api
      .events(run, 1, 1)
      .then((events) => {
        const e = events.find((x) => x.type === 'fw.run.queued');
        return e && e.data && typeof e.data === 'object' ? (e.data as QueuedData) : null;
      })
      .catch(() => null)
      .then((d) => {
        cache.set(run, d);
        reads.delete(run);
        return d;
      });
    reads.set(run, p);
  }
  return p;
}

/** forgetQueued drops what readQueued read, for the tests. */
export function forgetQueued(): void {
  cache.clear();
  reads.clear();
}

/** useQueued is the start of a run: undefined while it loads, null when the page cannot read it, or for no run. */
export function useQueued(run: string): QueuedData | null | undefined {
  const [got, setGot] = useState<{ run: string; d: QueuedData | null } | null>(() => (run && cache.has(run) ? { run, d: cache.get(run) || null } : null));
  useEffect(() => {
    if (!run) return;
    let live = true;
    readQueued(run).then((d) => live && setGot({ run, d }));
    return () => {
      live = false;
    };
  }, [run]);
  if (!run) return null;
  if (got && got.run === run) return got.d;
  return cache.has(run) ? cache.get(run) || null : undefined;
}

/**
 * namedProfileOf is the resolved profile of a run whose request gave no
 * inline profile: the profile of its agent as the kernel resolved it.
 */
export function namedProfileOf(d: QueuedData | null | undefined): QueuedData['resolved'] | null {
  if (!d || !d.resolved) return null;
  const inline = d.profile;
  if (inline && (inline.tools !== undefined || inline.skills !== undefined)) return null;
  return d.resolved;
}
