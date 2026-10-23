// The whole text of a long entry of a channel. The channel holds the first
// 4 KB of an entry and marks it cut. GET /v1/bridges/{id}/messages/{seq}
// answers the entry with its whole text, up to 64 KB, and keeps cut only for
// an old entry whose start alone was kept. The page reads it only when the
// person asks for it, never for each entry on load, and keeps it for the
// visit, so a later change of the entry, such as a reaction, keeps it whole.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';

/** The whole text of an entry, and whether the front still holds only its start. */
export interface Whole {
  text: string;
  cut: boolean;
}

const wholes = new Map<string, Whole>();
const reading = new Map<string, Promise<Whole>>();
const listeners = new Set<() => void>();

const keyOf = (bridge: string, seq: number) => bridge + '/' + seq;

/** loadWhole reads the whole text of an entry once, and tells every view that shows the entry. */
export function loadWhole(bridge: string, seq: number): Promise<Whole> {
  const key = keyOf(bridge, seq);
  const held = wholes.get(key);
  if (held) return Promise.resolve(held);
  let p = reading.get(key);
  if (!p) {
    p = api
      .entry(bridge, seq)
      .then((e) => {
        const w: Whole = { text: e.text || '', cut: !!e.cut };
        wholes.set(key, w);
        for (const f of [...listeners]) f();
        return w;
      })
      .finally(() => reading.delete(key));
    reading.set(key, p);
  }
  return p;
}

/** useWhole is the whole text of an entry that the person asked for, or undefined. A seq of 0 names no entry, for an entry that is not cut. */
export function useWhole(bridge: string, seq: number): Whole | undefined {
  const key = keyOf(bridge, seq);
  const [w, setW] = useState(() => (seq ? wholes.get(key) : undefined));
  useEffect(() => {
    if (!seq) {
      setW(undefined);
      return;
    }
    const f = () => setW(wholes.get(key));
    f();
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, [key, seq]);
  return w;
}

/** forgetWholes drops the texts, for the tests. */
export function forgetWholes(): void {
  wholes.clear();
  reading.clear();
}
