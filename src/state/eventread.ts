// A read that follows the stream instead of a clock. A view reads a route
// once when it opens, and again only when the signature of what the route
// answers changes on the page, such as the phases of the workers of a pool
// or the states of the runs of an agent, which the stream keeps current.
// Two reads of one key are at least GAP_MS apart: a burst of events gives
// one read at the end of the gap. The page keeps each answer for the next
// view, so a view that opens again within the gap reads nothing. An answer
// of null, a 404 of a route that the workbench lacks, ends the reads of
// that key.

import { useEffect, useRef, useState } from 'preact/hooks';

/** The least time between two reads of one key. */
export const GAP_MS = 5000;

interface Held<T> {
  /** The signature that the answer follows. */
  sig: string;
  value: T | null;
}

/** One cache of answers per route, by key. */
export interface ReadCache<T> {
  held: Map<string, Held<T>>;
  /** The start of the newest read of each key. */
  started: Map<string, number>;
}

export const readCache = <T,>(): ReadCache<T> => ({ held: new Map(), started: new Map() });

/** forgetReads drops what a cache holds, for the tests. */
export function forgetReads<T>(c: ReadCache<T>): void {
  c.held.clear();
  c.started.clear();
}

/**
 * useEventRead answers the value of a route for key: undefined until the
 * first answer, then the answer, or null when the route has none. An empty
 * key reads nothing and answers null. set replaces the value, such as the
 * answer of a change that the view made itself.
 */
export function useEventRead<T>(c: ReadCache<T>, key: string, sig: string, read: () => Promise<T | null>): [T | null | undefined, (v: T | null) => void] {
  const [value, setValue] = useState<T | null | undefined>(() => (key ? c.held.get(key)?.value : null));
  const want = useRef(sig);
  want.current = sig;
  const reader = useRef(read);
  reader.current = read;
  useEffect(() => {
    if (!key) {
      setValue(null);
      return;
    }
    const held = c.held.get(key);
    setValue(held ? held.value : undefined);
    // A route that answered null has nothing to follow.
    const fresh = (h: Held<T> | undefined) => !!h && (h.sig === want.current || h.value === null);
    if (fresh(held)) return;
    let live = true;
    const go = () => {
      if (fresh(c.held.get(key))) return;
      const at = want.current;
      c.started.set(key, Date.now());
      reader
        .current()
        .then((v) => {
          c.held.set(key, { sig: at, value: v });
          if (live) setValue(v);
        })
        .catch(() => {
          // A failed read keeps the answer that the view shows, and the next change, or the next view, reads again.
          if (live) setValue((v) => (v === undefined ? null : v));
        });
    };
    const last = c.started.get(key);
    const wait = last === undefined ? 0 : Math.max(0, last + GAP_MS - Date.now());
    const timer = setTimeout(go, wait);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, sig]);
  const set = (v: T | null) => {
    if (key) c.held.set(key, { sig: want.current, value: v });
    setValue(v);
  };
  return [value, set];
}
