// The state of the Routines place: the records of the store of the
// workbench, each with its evidence once the page read it, and the week of
// each agent. The list route leaves out evidence, and a row needs it for
// its meta line, so the page reads each routine that is not retired. A
// routine event of the stream reads that routine again, and a reset reads
// the list again. The lead folds this file into the store after the merge.

import { useEffect, useRef, useState } from 'preact/hooks';
import { routinesApi, type RoutineEvent, type RoutineRecord, type RoutineSummary, type Standing } from '../api/routines';
import { keyOf } from '../lib/routines';
import { store } from './store';

export interface RoutinesState {
  /** The keys of the routines, in the order of the list route, or null before the first read. */
  order: string[] | null;
  /** Each routine by its key, with its evidence once the page read the routine. */
  byKey: Record<string, RoutineRecord>;
  /** The keys that the list route no longer names, or that answered 404. */
  gone: Record<string, true>;
  /** The week of each agent, or null where the workbench has no summary. */
  weeks: Record<string, RoutineSummary | null>;
  /** The reason the list did not load. */
  error: string;
}

const initial: RoutinesState = { order: null, byKey: {}, gone: {}, weeks: {}, error: '' };

let state: RoutinesState = initial;
const listeners = new Set<() => void>();

function set(next: RoutinesState): void {
  if (next === state) return;
  state = next;
  for (const f of [...listeners]) f();
}

export const routines = {
  get: (): RoutinesState => state,
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

/** forgetRoutines drops the state, for the tests. */
export function forgetRoutines(): void {
  state = initial;
  reading.clear();
  listing = null;
  views = 0;
  watching = null;
  if (unwatch) unwatch();
  unwatch = null;
}

/** useRoutines reads one part of the state and redraws when it changes. */
export function useRoutines<T>(select: (s: RoutinesState) => T): T {
  const [value, setValue] = useState<{ v: T }>(() => ({ v: select(state) }));
  const sel = useRef(select);
  sel.current = select;
  const last = useRef(value.v);
  last.current = value.v;
  useEffect(() => {
    const check = () => {
      const v = sel.current(state);
      if (!Object.is(v, last.current)) {
        last.current = v;
        setValue({ v });
      }
    };
    check();
    return routines.subscribe(check);
  }, []);
  const now = select(state);
  return Object.is(now, value.v) ? value.v : now;
}

/* ---------- the reads ---------- */

/** One read per routine at a time, so a burst of events reads it once. */
const reading = new Map<string, Promise<void>>();

/** putRecord keeps a record. A record of the list keeps the evidence that the page read before. */
function putRecord(r: RoutineRecord, full: boolean): void {
  const key = keyOf(r.agent, r.routine.name);
  const old = state.byKey[key];
  const rec = !full && old && old.evidence && !('evidence' in r && r.evidence) ? { ...r, evidence: old.evidence } : r;
  const order = state.order && !state.order.includes(key) ? [key, ...state.order] : state.order;
  const gone = state.gone[key] ? { ...state.gone } : state.gone;
  if (gone !== state.gone) delete gone[key];
  set({ ...state, order, byKey: { ...state.byKey, [key]: rec }, gone });
}

/** loadRoutine reads one routine with its evidence. A 404 marks it gone. */
export function loadRoutine(agent: string, name: string): Promise<void> {
  const key = keyOf(agent, name);
  const busy = reading.get(key);
  if (busy) return busy;
  const p = routinesApi
    .get(agent, name)
    .then((r) => putRecord(r, true))
    .catch((e: { status?: number }) => {
      if (e && e.status === 404) set({ ...state, gone: { ...state.gone, [key]: true } });
      else throw e;
    })
    .finally(() => reading.delete(key));
  reading.set(key, p);
  return p;
}

/** The read of the list that runs, so the list pane and the main pane read it once. */
let listing: Promise<void> | null = null;

/**
 * loadRoutines reads the list, then each routine that is not retired with
 * its evidence, for the meta lines of the rows.
 */
export function loadRoutines(): Promise<void> {
  if (!listing) listing = readList().finally(() => (listing = null));
  return listing;
}

async function readList(): Promise<void> {
  watchStream();
  let list: RoutineRecord[];
  try {
    list = await routinesApi.list();
  } catch (e) {
    set({ ...state, error: e instanceof Error ? e.message : 'The action failed. Try it again.' });
    throw e;
  }
  const byKey: Record<string, RoutineRecord> = {};
  const order: string[] = [];
  for (const r of list) {
    const key = keyOf(r.agent, r.routine.name);
    order.push(key);
    const old = state.byKey[key];
    byKey[key] = old && old.evidence && old.updatedAt === r.updatedAt ? { ...r, evidence: old.evidence } : r;
  }
  set({ ...state, order, byKey, error: '' });
  await Promise.allSettled(list.filter((r) => r.standing !== 'retired').map((r) => loadRoutine(r.agent, r.routine.name)));
}

/** loadWeek reads the week of an agent. */
export async function loadWeek(agent: string): Promise<void> {
  const w = await routinesApi.summary(agent, 7);
  set({ ...state, weeks: { ...state.weeks, [agent]: w } });
}

/**
 * move changes the standing of a routine, then reads the routine again and
 * the week of its agent. The page reads the record and does not rely on
 * the answer of the move.
 */
export async function move(agent: string, name: string, standing: Standing, note?: string): Promise<void> {
  await routinesApi.move(agent, name, standing, note);
  reading.delete(keyOf(agent, name));
  await loadRoutine(agent, name);
  if (agent in state.weeks) loadWeek(agent).catch(() => {});
}

/* ---------- the stream ---------- */

/** The panes of the Routines place that show now. A pane that opens reads what it shows again. */
let views = 0;

/** useRoutinesView counts a pane of the place while it shows, so the stream reads routines only while the place is open. */
export function useRoutinesView(): void {
  useEffect(() => {
    views++;
    return () => {
      views--;
    };
  }, []);
}

/**
 * routineChanged reads again a routine that a routine event names, while
 * the place is open and holds the list. A pane that opens later reads
 * what it shows.
 */
export function routineChanged(data: unknown): void {
  const d = data as RoutineEvent | null;
  if (!d || typeof d.agent !== 'string' || typeof d.name !== 'string' || !state.order || views === 0) return;
  loadRoutine(d.agent, d.name).catch(() => {});
  if (d.agent in state.weeks) loadWeek(d.agent).catch(() => {});
}

let watching: number | null = null;
let unwatch: (() => void) | null = null;

/** watchStream reads the list again after a reset of the stream, once the place has read it. */
function watchStream(): void {
  if (unwatch) return;
  watching = store.get().resets;
  unwatch = store.subscribe(() => {
    const n = store.get().resets;
    if (n === watching) return;
    watching = n;
    if (state.order) loadRoutines().catch(() => {});
  });
}
