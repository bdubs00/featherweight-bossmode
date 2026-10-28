// The routes and the shapes of Know-how: the notes of an agent, the
// journal of what it learned, the switch Ask me before it keeps what it
// learns, the changes that wait for a person, and the four numbers of a
// week. Section 5 of docs/KNOWHOW.md of the kernel is the contract, and
// the package knowhow of the workbench (routes.go, summary.go, journal.go,
// access.go) gives the shapes. docs/CONTRACT.md, section 19, names them.
// The page reads them all from this file.

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

/** The source that changed after a note was written, and when. */
export interface OutOfDate {
  since: string;
  source: string;
}

/** A note of the list: the record without its text, with the count of its sources. */
export interface NoteItem {
  agent: string;
  scope: NoteScope;
  name: string;
  hash: string;
  state: NoteState;
  description: string;
  /** agent, review, or person:<subject>. */
  by: string;
  run?: string;
  at: string;
  uses: number;
  lastUsed?: string;
  /** The count of the sources of the note. */
  sources: number;
  outOfDate?: OutOfDate | null;
  origin?: string;
  revision?: number;
}

/** One note with its text and its sources. */
export interface NoteRecord extends Omit<NoteItem, 'sources'> {
  text: string;
  sources: NoteSource[];
}

/** The kinds of an entry of the journal. paused and stays-out are moves of a routine that the contract does not name. */
export type JournalWhat = 'learned' | 'updated' | 'out-of-date' | 'resting' | 'put-away' | 'proposed' | 'rehearsing' | 'live' | 'stepped-back' | 'retired' | 'undone' | 'paused' | 'stays-out';

/** What an entry changed: a note with its scope, or a routine. */
export interface JournalSubject {
  note?: string;
  /** agent or principal, for a note. */
  scope?: 'agent' | 'principal';
  principal?: string;
  routine?: string;
}

/** How to take an entry back: the revisions of a note, or the standings of a routine. */
export interface UndoInfo {
  revision: number;
  after?: number;
  from?: string;
  to?: string;
  version?: number;
}

/** One entry of the journal, newest first. Its id is a public id that names the agent too. */
export interface JournalEntry {
  id: string;
  at: string;
  agent: string;
  what: JournalWhat;
  subject: JournalSubject;
  /** One plain sentence that a person reads. */
  why: string;
  runs?: string[];
  /** review, agent, or person:<subject>. */
  by: string;
  /** Set on an entry that an undo can take back. */
  undo?: UndoInfo | null;
  /** True for a change that replaced or put away a note that was out of date. */
  corrects?: boolean;
  /** The entry that took this one back. */
  undoneBy?: string;
}

/** A change that waits for a person under the switch. A note change carries the text that the agent would keep. */
export interface WaitingChange {
  id: string;
  at: string;
  agent: string;
  what: JournalWhat;
  subject: JournalSubject;
  text?: string;
  sources?: NoteSource[];
  why?: string;
  runs?: string[];
  by: string;
  run?: string;
  /** The hash of the target that the change pinned. */
  pin?: string;
}

/** Whether the after-work review runs, and why not. */
export interface ReviewState {
  on: boolean;
  agent?: string;
  every?: string;
  reason?: string;
}

/** The switch of an agent, with the state of the after-work review. */
export interface KnowhowSettings {
  agent?: string;
  askFirst: boolean;
  review?: ReviewState;
}

/** The mean cost of the finished runs, of the window before for the trend, and the trend: down, up, or flat within 5%. */
export interface CostPerJob {
  usd: number;
  runs: number;
  previousUsd?: number | null;
  trend?: '' | 'down' | 'up' | 'flat';
}

/** The share of the normal runs that a routine did with no model call. */
export interface ShareOfRoutines {
  runs: number;
  byRoutine: number;
  share: number;
}

/** The counts of one kind of run. */
export interface RunSplit {
  runs: number;
  doneWell: number;
  byRoutine: number;
  costPerJobUsd: number;
}

/** The line with and without what it learned. The shares are absent while fewer than 20 runs were held back. */
export interface Compare {
  enough: boolean;
  heldBack: number;
  normal: number;
  oneIn?: number;
  doneWellWithout?: number;
  doneWellWith?: number;
  line: string;
}

/** The four numbers of an agent over its last days, split into normal and held-back runs. */
export interface KnowhowSummary {
  agent: string;
  days: number;
  since?: string;
  costPerJob: CostPerJob;
  doneByRoutines: ShareOfRoutines;
  notesCorrected: number;
  normal: RunSplit;
  heldBack: RunSplit;
  compare: Compare;
}

/** The answer of a write of a note: the note without its text, and the change that waits for a person when the write waits (202). */
export interface WriteAnswer {
  note?: NoteItem | null;
  waiting?: WaitingChange | null;
}

/** The address of one note. */
export interface NoteAddress {
  agent: string;
  scope: NoteScope;
  name: string;
}

const noteUrl = (n: NoteAddress, extra: Record<string, string | undefined> = {}) =>
  '/v1/knowhow/notes/' + enc(n.agent) + '/' + enc(n.scope.kind) + '/' + encPath(n.name) + query({ principal: n.scope.kind === 'principal' ? n.scope.principal : undefined, ...extra });

/** noteOf fills what a note of the list left out. */
function noteOf(n: Partial<NoteItem>, agent: string): NoteItem {
  return {
    ...n,
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
  };
}

export const knowhowApi = {
  /** notes lists the notes of an agent that the person can read: the agent notes, the notes of the person, and the notes of the duties for an operator. */
  notes: (agent: string) => call<{ notes?: Partial<NoteItem>[] }>('/v1/knowhow/notes' + query({ agent })).then((r) => ((r && r.notes) || []).map((n) => noteOf(n, agent))),
  /** note reads one note with its text and its sources. */
  note: (n: NoteAddress) => call<NoteRecord>(noteUrl(n)),
  /** saveNote changes the text of a note. A note that changed since the person read it answers 412. A write that waits for a person answers 202 with waiting. */
  saveNote: (n: NoteAddress, body: { text: string; ifHash: string; sources: NoteSource[] }) => call<WriteAnswer | null>(noteUrl(n), { method: 'PUT', body }),
  /** putAway puts a note away. 412 and 202 as saveNote. */
  putAway: (n: NoteAddress, ifHash: string) => call<WriteAnswer | null>(noteUrl(n, { ifHash }), { method: 'DELETE' }),
  /** journal reads the entries of an agent, newest first. before is the id of the oldest entry that the page holds. */
  journal: (agent: string, limit: number, before?: string) => call<{ entries?: JournalEntry[] }>('/v1/knowhow/journal' + query({ agent, limit, before })).then((r) => (r && r.entries) || []),
  /** undo takes back one entry. A later change of the same note or routine, or an entry taken back already, answers 409. */
  undo: (id: string) => call<unknown>('/v1/knowhow/journal/' + enc(id) + '/undo', { method: 'POST' }),
  settings: (agent: string) => call<KnowhowSettings>('/v1/knowhow/settings/' + enc(agent)),
  setAskFirst: (agent: string, askFirst: boolean) => call<KnowhowSettings | null>('/v1/knowhow/settings/' + enc(agent), { method: 'PUT', body: { askFirst } }),
  /** waiting lists the changes that wait for a person: of one agent, or of every agent that the person can view. */
  waiting: (agent?: string) => call<{ waiting?: WaitingChange[] }>('/v1/knowhow/waiting' + query({ agent })).then((r) => (r && r.waiting) || []),
  /** decide keeps a waiting change, or drops it. A target that changed since answers 409, and the change stays until a person drops it. */
  decide: (id: string, keep: boolean) => call<unknown>('/v1/knowhow/waiting/' + enc(id), { method: 'POST', body: { keep } }),
  summary: (agent: string, days = 7) => call<KnowhowSummary>('/v1/knowhow/summary' + query({ agent, days })),
};
