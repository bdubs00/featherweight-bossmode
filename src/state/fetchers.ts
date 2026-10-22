// The loads of screen B: the record of each open bridge, the newest run of
// each seat, the result of a run that waits, and the channel of a bridge
// with new entries. Each load runs once per key at a time and fills the
// store, and the stream keeps the store current after it.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Result } from '../api/types';
import { loadBridge, loadChannel } from './actions';
import { store } from './store';

/** pool runs the loads of a list with at most n at a time. */
async function pool<T>(items: T[], n: number, f: (x: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const x = items[i++];
      try {
        await f(x);
      } catch {
        // One failed load leaves its row as it is. The stream or the next open loads it.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
}

const askedBridges = new Set<string>();

/** ensureRosters reads the record of each open bridge whose roster the page has not loaded. */
export function ensureRosters(): void {
  const s = store.get();
  const ids = s.bridges.order.filter((id) => s.bridges.byId[id].state === 'open' && !s.rosters[id] && !askedBridges.has(id));
  for (const id of ids) askedBridges.add(id);
  void pool(ids, 3, (id) => loadBridge(id).finally(() => askedBridges.delete(id)));
}

const askedRuns = new Set<string>();

/** ensureRuns reads the runs that the store does not hold yet. */
export function ensureRuns(ids: string[]): void {
  const s = store.get();
  const want = ids.filter((id) => id && !s.runs[id] && !askedRuns.has(id));
  for (const id of want) askedRuns.add(id);
  void pool(want, 3, async (id) => {
    const r = await api.run(id);
    store.dispatch({ type: 'run', run: r });
  });
}

const askedChannels = new Set<string>();

/** ensureChannels reads the recent end of the channels that the store does not hold yet. */
export function ensureChannels(ids: string[]): void {
  const s = store.get();
  const want = ids.filter((id) => !s.channels[id] && !askedChannels.has(id));
  for (const id of want) askedChannels.add(id);
  void pool(want, 3, (id) => loadChannel(id).finally(() => askedChannels.delete(id)));
}

/* ---------- the results of runs that wait ---------- */

const results: Record<string, Result> = {};
const resultKeys: Record<string, string> = {};
let resultTick = 0;
const listeners = new Set<() => void>();

/**
 * ensureResults reads the result of each run whose state or decision
 * changed since the last read, for the label and the effect of a decision
 * and the reason of a stop.
 */
export function ensureResults(ids: string[]): void {
  const s = store.get();
  const want = ids.filter((id) => {
    const r = s.runs[id];
    if (!r) return false;
    const key = r.state + '|' + (r.pending ? r.pending.id : '');
    if (resultKeys[id] === key) return false;
    resultKeys[id] = key;
    return true;
  });
  void pool(want, 3, async (id) => {
    results[id] = await api.result(id);
    resultTick++;
    for (const f of [...listeners]) f();
  });
}

/** useResults returns the results that the page read. It redraws when one arrives. */
export function useResults(): Record<string, Result> {
  const [, setTick] = useState(resultTick);
  useEffect(() => {
    const f = () => setTick(resultTick);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return results;
}

/** forgetLoads clears the marks of the loads, so a reset of the stream reads again. */
export function forgetLoads(): void {
  askedBridges.clear();
  askedRuns.clear();
  askedChannels.clear();
  for (const k of Object.keys(resultKeys)) delete resultKeys[k];
}

/**
 * refreshAfterReset reads again what the stream did not resume: the
 * record of each open bridge, and the newest run of each seat that works
 * or waits for you, whose state the people list and the inbox show.
 */
let lastReset = 0;

export function refreshAfterReset(): void {
  const s = store.get();
  // Several screens follow the resets: the first one reads, once per reset.
  if (s.resets === lastReset) return;
  lastReset = s.resets;
  forgetLoads();
  const open = s.bridges.order.filter((id) => s.bridges.byId[id] && s.bridges.byId[id].state === 'open');
  void pool(open, 3, (id) => loadBridge(id));
  const runs: string[] = [];
  for (const id of open) {
    const r = s.rosters[id];
    if (!r) continue;
    for (const h of r.order) {
      const m = r.byHandle[h];
      if (m && !m.fired && m.runs.length && (m.presence === 'working' || m.presence === 'needs-you')) runs.push(m.runs[m.runs.length - 1]);
    }
  }
  void pool(runs, 3, async (id) => {
    store.dispatch({ type: 'run', run: await api.run(id) });
  });
}
