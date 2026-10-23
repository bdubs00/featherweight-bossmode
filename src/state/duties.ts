// The state of the Duties place: the list of GET /v1/duties with the switch
// that pauses every duty, and each duty that the page read whole, with its
// history. A pane that opens reads what it shows, an action reads again
// what it changed, and a reset of the stream reads the list again. The
// stream carries no event of a duty, so the duty page also reads its duty
// again when a run of its history changes its state in the store.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { Duty, DutyRecord, DutyStarted } from '../api/types';
import { store } from './store';

export interface DutiesState {
  /** The duties of the list, or null before the first read. */
  list: Duty[] | null;
  /** True when the switch pauses every duty. */
  paused: boolean;
  /** Each duty that the page read whole, with its history. */
  byName: Record<string, Duty>;
  /** The names that answered 404. */
  gone: Record<string, true>;
  /** The reason the list did not load. */
  error: string;
  /** True when the front answers 404 to the list: it keeps no duties. */
  off: boolean;
}

const initial: DutiesState = { list: null, paused: false, byName: {}, gone: {}, error: '', off: false };

let state: DutiesState = initial;
const listeners = new Set<() => void>();

function set(next: DutiesState): void {
  if (next === state) return;
  state = next;
  for (const f of [...listeners]) f();
}

export const duties = {
  get: (): DutiesState => state,
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

/** forgetDuties drops the state, for the tests. */
export function forgetDuties(): void {
  state = initial;
  listing = null;
  reading.clear();
  if (unwatch) unwatch();
  unwatch = null;
}

/** useDuties reads one part of the state and redraws when it changes. */
export function useDuties<T>(select: (s: DutiesState) => T): T {
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
    return duties.subscribe(check);
  }, []);
  const now = select(state);
  return Object.is(now, value.v) ? value.v : now;
}

/* ---------- the reads ---------- */

/** The read of the list that runs, so the list, the main pane, and a profile read it once. */
let listing: Promise<void> | null = null;

/** loadDuties reads the list and the switch. A 404 means that the front keeps no duties. */
export function loadDuties(): Promise<void> {
  if (!listing) listing = readList().finally(() => (listing = null));
  return listing;
}

async function readList(): Promise<void> {
  watchStream();
  try {
    const r = await api.duties();
    set({ ...state, list: r.duties, paused: r.paused, error: '', off: false });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      set({ ...state, list: [], off: true, error: '' });
      return;
    }
    set({ ...state, error: e instanceof Error ? e.message : 'The action failed. Try it again.' });
    throw e;
  }
}

/** One read per duty at a time. */
const reading = new Map<string, Promise<void>>();

/** putDuty keeps a duty that the page read whole, and its row in the list. */
function putDuty(d: Duty): void {
  const list = state.list ? (state.list.some((x) => x.name === d.name) ? state.list.map((x) => (x.name === d.name ? { ...x, ...strip(d) } : x)) : [...state.list, strip(d)]) : state.list;
  const gone = { ...state.gone };
  delete gone[d.name];
  set({ ...state, list, byName: { ...state.byName, [d.name]: d }, gone });
}

/** strip leaves out the history, which a row of the list does not hold. */
const strip = ({ history: _h, ...d }: Duty): Duty => d;

/** dropDuty forgets a duty that is gone. */
function dropDuty(name: string): void {
  const byName = { ...state.byName };
  delete byName[name];
  set({ ...state, list: state.list ? state.list.filter((d) => d.name !== name) : state.list, byName, gone: { ...state.gone, [name]: true } });
}

/** loadDuty reads one duty with its history. A 404 marks it gone. */
export function loadDuty(name: string): Promise<void> {
  const busy = reading.get(name);
  if (busy) return busy;
  const p = api
    .duty(name)
    .then(putDuty)
    .catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) dropDuty(name);
      else throw e;
    })
    .finally(() => {
      if (reading.get(name) === p) reading.delete(name);
    });
  reading.set(name, p);
  return p;
}

/* ---------- the actions ---------- */

/** saveDuty creates or changes a duty, then keeps the answer and reads the list again. */
export async function saveDuty(name: string, record: DutyRecord): Promise<Duty> {
  const d = await api.putDuty(name, record);
  if (d && d.name) putDuty(d);
  reading.delete(name);
  await Promise.allSettled([loadDuty(name), loadDuties()]);
  return d;
}

/** pauseDuty pauses or resumes a duty, then reads it again. */
export async function pauseDuty(name: string, paused: boolean): Promise<void> {
  await api.pauseDuty(name, paused);
  reading.delete(name);
  await loadDuty(name);
}

/** removeDuty deletes a duty and forgets it. */
export async function removeDuty(name: string): Promise<void> {
  await api.deleteDuty(name);
  dropDuty(name);
}

/** runDutyNow starts a duty out of its schedule, then reads it again for its history. */
export async function runDutyNow(name: string): Promise<DutyStarted> {
  const r = await api.runDuty(name);
  reading.delete(name);
  loadDuty(name).catch(() => {});
  return r || {};
}

/** pauseAll turns the switch that pauses every duty, for an admin, then reads the list again. */
export async function pauseAll(paused: boolean, reason?: string): Promise<void> {
  await api.pauseAllDuties(paused, reason);
  set({ ...state, paused });
  await loadDuties();
}

/* ---------- the stream ---------- */

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
    if (state.list) loadDuties().catch(() => {});
  });
}
