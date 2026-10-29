// The state of the Know-how place: for each agent that the place showed,
// its four numbers, its switch, the changes that wait for a person, the
// journal, and the notes, and each note that the person opened. The
// changes that wait for every agent give the list of agents its needs you.
// A knowhow event of the stream reads again what the page holds of that
// agent, while a pane of the place shows. A reset reads it all again.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import { knowhowApi, type JournalEntry, type KnowhowSettings, type KnowhowSummary, type NoteItem, type NoteRecord, type ReviewNow, type WaitingChange, type WriteAnswer } from '../api/knowhow';
import { noteKey } from '../lib/knowhow';
import { store } from './store';

/** The most entries of the journal that one read brings. */
export const JOURNAL_PAGE = 50;

/** What the page holds of one agent. A part is undefined before its first read. */
export interface AgentKnowhow {
  summary?: KnowhowSummary;
  settings?: KnowhowSettings;
  waiting?: WaitingChange[];
  journal?: JournalEntry[];
  /** True when the journal may hold older entries than the page read. */
  more?: boolean;
  notes?: NoteItem[];
  /** The reason a read failed, by part. */
  errors: Partial<Record<'summary' | 'settings' | 'waiting' | 'journal' | 'notes', string>>;
}

export interface KnowhowState {
  agents: Record<string, AgentKnowhow>;
  /** The changes that wait for every agent, for the list of agents, or null before the first read. */
  allWaiting: WaitingChange[] | null;
  /** The notes that the person opened, by noteKey. */
  notes: Record<string, NoteRecord>;
  /** True when the server answers the journal or the summary with 404 and its reason: it keeps no know-how. */
  off: boolean;
  /** Why Know-how is off, in the words of the server. */
  offReason: string;
}

const initial: KnowhowState = { agents: {}, allWaiting: null, notes: {}, off: false, offReason: '' };

let state: KnowhowState = initial;
const listeners = new Set<() => void>();

function set(next: KnowhowState): void {
  if (next === state) return;
  state = next;
  for (const f of [...listeners]) f();
}

export const knowhow = {
  get: (): KnowhowState => state,
  subscribe(f: () => void): () => void {
    listeners.add(f);
    return () => listeners.delete(f);
  },
};

/** forgetKnowhow drops the state, for the tests. */
export function forgetKnowhow(): void {
  state = initial;
  reading.clear();
  again.clear();
  views = 0;
  watching = null;
  if (unwatch) unwatch();
  unwatch = null;
}

/** useKnowhow reads one part of the state and redraws when it changes. */
export function useKnowhow<T>(select: (s: KnowhowState) => T): T {
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
    return knowhow.subscribe(check);
  }, []);
  const now = select(state);
  return Object.is(now, value.v) ? value.v : now;
}

/* ---------- the reads ---------- */

const EMPTY: AgentKnowhow = { errors: {} };

/** patch changes the part of one agent. */
function patch(agent: string, p: Partial<AgentKnowhow>, error?: { part: keyof AgentKnowhow['errors']; text: string }): void {
  const old = state.agents[agent] || EMPTY;
  const errors = { ...old.errors };
  if (error) errors[error.part] = error.text;
  else for (const k of Object.keys(p)) delete errors[k as keyof AgentKnowhow['errors']];
  set({ ...state, agents: { ...state.agents, [agent]: { ...old, ...p, errors } } });
}

const reason = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'The action failed. Try it again.');

/** offOf is the reason of a server that keeps no know-how: its 404 says Know-how is off. A 404 for an agent that the person cannot view is not one. */
function offOf(e: unknown): string {
  if (!(e instanceof ApiError) || e.status !== 404) return '';
  const detail = (e.problem && e.problem.detail) || '';
  return /^Know-how is off/i.test(detail) ? detail : '';
}

/** read runs one read of a part and keeps its answer, or its reason in words. The off answer of the journal or the summary marks the place off. */
async function read<K extends keyof AgentKnowhow['errors']>(agent: string, part: K, f: () => Promise<Partial<AgentKnowhow>>): Promise<void> {
  try {
    const p = await f();
    patch(agent, p);
    if (state.off && (part === 'journal' || part === 'summary')) set({ ...state, off: false, offReason: '' });
  } catch (e) {
    const off = offOf(e);
    if (off && (part === 'journal' || part === 'summary')) {
      set({ ...state, off: true, offReason: off });
      return;
    }
    patch(agent, {}, { part, text: reason(e) });
  }
}

export const loadSummary = (agent: string) => read(agent, 'summary', async () => ({ summary: await knowhowApi.summary(agent, 7) }));
export const loadSettings = (agent: string) => read(agent, 'settings', async () => ({ settings: (await knowhowApi.settings(agent)) || { askFirst: false } }));
export const loadWaiting = (agent: string) => read(agent, 'waiting', async () => ({ waiting: await knowhowApi.waiting(agent) }));
export const loadNotes = (agent: string) => read(agent, 'notes', async () => ({ notes: await knowhowApi.notes(agent) }));

/** loadJournal reads the newest entries of the journal of an agent. */
export const loadJournal = (agent: string) =>
  read(agent, 'journal', async () => {
    const entries = await knowhowApi.journal(agent, JOURNAL_PAGE);
    return { journal: entries, more: entries.length >= JOURNAL_PAGE };
  });

/** loadOlder reads the entries before the oldest one that the page holds, by its id, and adds them at the end. */
export async function loadOlder(agent: string): Promise<void> {
  const old = (state.agents[agent] && state.agents[agent].journal) || [];
  if (!old.length) return loadJournal(agent);
  const entries = await knowhowApi.journal(agent, JOURNAL_PAGE, old[old.length - 1].id);
  const seen = new Set(old.map((e) => e.id));
  const now = (state.agents[agent] && state.agents[agent].journal) || old;
  patch(agent, { journal: [...now, ...entries.filter((e) => !seen.has(e.id))], more: entries.length >= JOURNAL_PAGE });
}

/**
 * loadAllWaiting reads the changes that wait for every agent, for the list
 * of agents. It copies the state after the answer, not before: a copy of
 * before would put back what other reads stored meanwhile, such as the
 * switch and the waiting list of an agent.
 */
export async function loadAllWaiting(): Promise<void> {
  watchStream();
  try {
    const allWaiting = await knowhowApi.waiting();
    set({ ...state, allWaiting });
  } catch {
    // The list of agents works without it, with no agent marked.
    if (state.allWaiting === null) set({ ...state, allWaiting: [] });
  }
}

/** One read of an agent at a time, and one more after it when an event came during the read. */
const reading = new Map<string, Promise<void>>();
const again = new Set<string>();

/** loadAgent reads the header of the place for an agent: its numbers, its switch, what waits, and the journal. */
export function loadAgent(agent: string): Promise<void> {
  watchStream();
  const busy = reading.get(agent);
  if (busy) {
    again.add(agent);
    return busy;
  }
  const p = Promise.allSettled([loadSummary(agent), loadSettings(agent), loadWaiting(agent), loadJournal(agent)])
    .then(() => undefined)
    .finally(() => {
      reading.delete(agent);
      if (again.delete(agent)) refresh(agent).catch(() => {});
    });
  reading.set(agent, p);
  return p;
}

/** refresh reads again what the page holds of an agent: the header, and the notes and each open note once the page read them. */
async function refresh(agent: string): Promise<void> {
  const a = state.agents[agent];
  const reads: Promise<unknown>[] = [loadAgent(agent)];
  if (a && a.notes) reads.push(loadNotes(agent));
  for (const k of Object.keys(state.notes)) {
    const n = state.notes[k];
    if (n.agent === agent) reads.push(loadNote(n).catch(() => {}));
  }
  if (state.allWaiting !== null) reads.push(loadAllWaiting());
  await Promise.allSettled(reads);
}

/** loadNote reads one note with its text and its sources. */
export async function loadNote(n: Pick<NoteItem, 'agent' | 'scope' | 'name'>): Promise<NoteRecord> {
  const r = await knowhowApi.note(n);
  const rec: NoteRecord = { ...r, agent: r.agent || n.agent, scope: r.scope && r.scope.kind ? r.scope : n.scope, name: r.name || n.name, sources: r.sources || [] };
  set({ ...state, notes: { ...state.notes, [noteKey(rec)]: rec } });
  return rec;
}

/* ---------- the changes ---------- */

/** setAskFirst turns the switch of an agent. */
export async function setAskFirst(agent: string, askFirst: boolean): Promise<void> {
  const r = await knowhowApi.setAskFirst(agent, askFirst);
  patch(agent, { settings: r && typeof r.askFirst === 'boolean' ? r : { askFirst } });
}

/**
 * decide keeps a waiting change, or drops it. Either way the page reads
 * the agent again. A 409 means that the target changed since: the change
 * stays until a person drops it, the page reads the changes again, and
 * the error goes on to the screen.
 */
export async function decide(agent: string, id: string, keep: boolean): Promise<void> {
  try {
    await knowhowApi.decide(id, keep);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) await refresh(agent);
    throw e;
  }
  await refresh(agent);
}

/** reviewNow starts the after-work review of an agent now. It answers what the server did: the run, or why no run started. */
export async function reviewNow(agent: string): Promise<ReviewNow> {
  return knowhowApi.reviewNow(agent);
}

/** undo takes back one entry of the journal, then reads the agent again. A 409 changes nothing, and the error goes on to the screen. */
export async function undo(agent: string, id: string): Promise<void> {
  await knowhowApi.undo(id);
  await refresh(agent);
}

/**
 * saveNote changes the text of a note, for the version that the person
 * read. A 412 means that the note changed since: the page reads it again,
 * and the error goes on to the screen. It answers true when the change
 * waits for a person (202), as a write by the token of the fleet does
 * under the switch.
 */
export async function saveNote(rec: NoteRecord, text: string): Promise<boolean> {
  let answer: WriteAnswer | null = null;
  try {
    answer = await knowhowApi.saveNote(rec, { text, ifHash: rec.hash, sources: rec.sources || [] });
  } catch (e) {
    if (e instanceof ApiError && e.status === 412) await loadNote(rec).catch(() => {});
    throw e;
  }
  await loadNote(rec).catch(() => {});
  await refresh(rec.agent);
  return !!(answer && answer.waiting);
}

/** putAway puts a note away for the version that the person read. A 412 reads it again. It answers true when the change waits for a person. */
export async function putAway(rec: NoteRecord): Promise<boolean> {
  let answer: WriteAnswer | null = null;
  try {
    answer = await knowhowApi.putAway(rec, rec.hash);
  } catch (e) {
    if (e instanceof ApiError && e.status === 412) await loadNote(rec).catch(() => {});
    throw e;
  }
  const waits = !!(answer && answer.waiting);
  if (!waits) {
    const notes = { ...state.notes };
    delete notes[noteKey(rec)];
    set({ ...state, notes });
  }
  await refresh(rec.agent);
  return waits;
}

/* ---------- the stream ---------- */

/** The panes of the place that show now. */
let views = 0;

/** useKnowhowView counts a pane of the place while it shows, so the stream reads only while the place is open. */
export function useKnowhowView(): void {
  useEffect(() => {
    views++;
    return () => {
      views--;
    };
  }, []);
}

/** knowhowChanged reads again what the page holds of the agent that a knowhow event names, while the place is open. */
export function knowhowChanged(data: unknown): void {
  const d = data as { agent?: unknown } | null;
  if (!d || typeof d.agent !== 'string' || views === 0) return;
  if (state.agents[d.agent]) refresh(d.agent).catch(() => {});
  else if (state.allWaiting !== null) loadAllWaiting().catch(() => {});
}

let watching: number | null = null;
let unwatch: (() => void) | null = null;

/** watchStream reads again what the page holds after a reset of the stream, which may have missed events. */
function watchStream(): void {
  if (unwatch) return;
  watching = store.get().resets;
  unwatch = store.subscribe(() => {
    const n = store.get().resets;
    if (n === watching) return;
    watching = n;
    for (const agent of Object.keys(state.agents)) refresh(agent).catch(() => {});
    if (state.allWaiting !== null) loadAllWaiting().catch(() => {});
  });
}
