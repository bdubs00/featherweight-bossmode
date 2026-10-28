// The routes and the shapes of Know-how: the notes of an agent, the
// journal of what it learned, the switch Ask me before it keeps what it
// learns, the changes that wait for a person, and the four numbers of a
// week. Section 5 of docs/KNOWHOW.md of the kernel is the contract.
// docs/CONTRACT.md, section 19, names each shape that the page assumed
// where the contract gives no JSON. The page reads them all from this file.

import { call, enc, encPath, query } from './client';

/** The scope of a note: the agent itself, or one principal, such as a person or duty:<name>. */
export interface NoteScope {
  kind: 'agent' | 'principal';
  /** The principal of a principal note, such as alice@example.com or duty:nightly-sweep. */
  principal?: string;
}

/** The states of a note. Only checked, out of date, and resting show as labels. */
export type NoteState = 'checked' | 'unchecked' | 'out-of-date' | 'resting' | 'put-away' | 'waiting';

/** A source of a note: a run, a page with its version, or an item of a source with its version. */
export interface NoteSource {
  /** run:<id>, page:<path>, or item:<source>/<key>. */
  ref: string;
  version?: string;
}

/**
 * A note of the list. The contract names name, hash, state, description,
 * by, at, uses, and the count of the sources. The list without a scope
 * holds the notes of every scope that the person can read, so each item
 * carries its scope and its agent, as the record does.
 */
export interface NoteItem {
  agent: string;
  scope: NoteScope;
  name: string;
  hash: string;
  state: NoteState;
  description: string;
  /** agent, review, or person:<subject>. */
  by: string;
  at: string;
  uses: number;
  /** The count of the sources of the note. */
  sources: number;
  lastUsed?: string;
}

/** One note with its text and its sources. */
export interface NoteRecord extends Omit<NoteItem, 'sources'> {
  text: string;
  run?: string;
  sources: NoteSource[];
  /** The source that changed after the note was written, and when. */
  outOfDate?: { since: string; source: string } | null;
}

/** The kinds of an entry of the journal. */
export type JournalWhat = 'learned' | 'updated' | 'out-of-date' | 'resting' | 'put-away' | 'proposed' | 'rehearsing' | 'live' | 'stepped-back' | 'retired' | 'undone';

/** What an entry changed: a note, with its scope where the page needs it, or a routine. */
export interface JournalSubject {
  note?: string;
  scope?: NoteScope;
  routine?: string;
}

/** One entry of the journal, newest first. undo is set on an entry that an undo can take back. */
export interface JournalEntry {
  id: string;
  at: string;
  agent: string;
  what: JournalWhat;
  subject: JournalSubject;
  /** One plain sentence that a person reads. */
  why: string;
  runs?: string[];
  /** review, agent, the front, or person:<subject>. */
  by: string;
  undo?: { revision?: number } | null;
}

/**
 * A change that waits for a person under the switch: an entry of the
 * journal that has not happened yet. A note change carries the text that
 * the agent would keep.
 */
export interface WaitingChange extends Omit<JournalEntry, 'undo'> {
  text?: string;
}

/** The switch of an agent. */
export interface KnowhowSettings {
  askFirst: boolean;
}

/** The figures of one kind of run over the days of the summary. */
export interface RunFigures {
  /** The runs that finished. */
  runs: number;
  /** The runs that ended with a result that a system recorded as good (section 1 of the contract). */
  doneWell: number;
  /** The mean cost of a run in dollars. */
  costPerJob: number;
  /** The runs that a routine handled with no model call. */
  byRoutines: number;
}

/**
 * The four numbers of an agent over its last days, split into normal and
 * held-back runs. costPerJobBefore is the mean cost of the days before,
 * for the trend, and is null when the agent had no run then.
 */
export interface KnowhowSummary {
  agent: string;
  days: number;
  normal: RunFigures;
  heldBack: RunFigures;
  costPerJobBefore?: number | null;
  notesCorrected: number;
}

/** The address of one note. */
export interface NoteAddress {
  agent: string;
  scope: NoteScope;
  name: string;
}

const noteUrl = (n: NoteAddress, extra: Record<string, string | undefined> = {}) =>
  '/v1/knowhow/notes/' + enc(n.agent) + '/' + enc(n.scope.kind) + '/' + encPath(n.name) + query({ principal: n.scope.kind === 'principal' ? n.scope.principal : undefined, ...extra });

/** noteOf fills the scope and the agent of a note that the list left out. */
function noteOf(n: Partial<NoteItem>, agent: string): NoteItem {
  return {
    agent: n.agent || agent,
    scope: n.scope && n.scope.kind ? n.scope : { kind: 'agent' },
    name: n.name || '',
    hash: n.hash || '',
    state: n.state || 'unchecked',
    description: n.description || '',
    by: n.by || '',
    at: n.at || '',
    uses: n.uses || 0,
    sources: typeof n.sources === 'number' ? n.sources : 0,
    lastUsed: n.lastUsed,
  };
}

export const knowhowApi = {
  /** notes lists the notes of an agent that the person can read: the agent notes, the notes of the person, and the notes of the duties of the agent. */
  notes: (agent: string) => call<{ notes?: Partial<NoteItem>[] }>('/v1/knowhow/notes' + query({ agent })).then((r) => ((r && r.notes) || []).map((n) => noteOf(n, agent))),
  /** note reads one note with its text and its sources. */
  note: (n: NoteAddress) => call<NoteRecord>(noteUrl(n)),
  /** saveNote changes the text of a note that the person wrote. A note that changed since the person read it answers 412. */
  saveNote: (n: NoteAddress, body: { text: string; ifHash: string; sources: NoteSource[] }) => call<NoteRecord>(noteUrl(n), { method: 'PUT', body }),
  /** putAway puts a note away. A note that changed since the person read it answers 412. */
  putAway: (n: NoteAddress, ifHash: string) => call<unknown>(noteUrl(n, { ifHash }), { method: 'DELETE' }),
  /** journal reads the entries of an agent, newest first. before is the time of the oldest entry that the page holds. */
  journal: (agent: string, limit: number, before?: string) => call<{ entries?: JournalEntry[] }>('/v1/knowhow/journal' + query({ agent, limit, before })).then((r) => (r && r.entries) || []),
  /** undo takes back one entry. A later change of the same note or routine answers 409. */
  undo: (id: string) => call<unknown>('/v1/knowhow/journal/' + enc(id) + '/undo', { method: 'POST' }),
  settings: (agent: string) => call<KnowhowSettings>('/v1/knowhow/settings/' + enc(agent)),
  setAskFirst: (agent: string, askFirst: boolean) => call<KnowhowSettings | null>('/v1/knowhow/settings/' + enc(agent), { method: 'PUT', body: { askFirst } }),
  /** waiting lists the changes that wait for a person: of one agent, or of every agent that the person can view. */
  waiting: (agent?: string) => call<{ waiting?: WaitingChange[] }>('/v1/knowhow/waiting' + query({ agent })).then((r) => (r && r.waiting) || []),
  /** decide keeps a waiting change, or leaves it. A target that changed since answers 409. */
  decide: (id: string, keep: boolean) => call<unknown>('/v1/knowhow/waiting/' + enc(id), { method: 'POST', body: { keep } }),
  summary: (agent: string, days = 7) => call<KnowhowSummary>('/v1/knowhow/summary' + query({ agent, days })),
};
