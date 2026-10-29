// The words and the figures of the Know-how place, as pure functions: the
// title of a note, its label, its sources, who wrote it, the sentence of an
// entry of the journal and of a change that waits, the four numbers of a
// week, and the line that compares the held-back runs with the others.
// The words of section 2 of docs/KNOWHOW.md of the kernel are the only
// words on the screen.

import type { JournalEntry, JournalSubject, JournalWhat, KnowhowSummary, NoteItem, NoteScope, NoteState, WaitingChange } from '../api/knowhow';
import type { Tone } from './presence';
import { isMe, whoName, type Me } from './lines';
import { hrefOf } from './route';
import { money, num, titleOf } from './routines';

/** The fewest runs from which the page shows a share or a change in percent. The server keeps the same rule for the held-back runs. */
export const HELD_BACK_MIN = 20;

/** noteTitle is the title of a note from its name: gotchas/gitea-labels.md is Gitea labels. */
export function noteTitle(name: string): string {
  const last = (name || '').split('/').filter(Boolean).pop() || name || '';
  return titleOf(last.replace(/\.(md|txt)$/i, ''));
}

/** noteKey names a note in the page: its agent, its scope, and its name. */
export const noteKey = (n: { agent: string; scope: NoteScope; name: string }): string => [n.agent, n.scope.kind, n.scope.principal || '', n.name].join('|');

/** The label of a note: a light and its word. A note that is unchecked has none. */
export interface NoteLabel {
  word: string;
  tone: Tone;
  still?: boolean;
}

const LABELS: Partial<Record<NoteState, NoteLabel>> = {
  checked: { word: 'checked', tone: 'green' },
  'out-of-date': { word: 'out of date', tone: 'amber', still: true },
  resting: { word: 'resting', tone: 'grey' },
  'put-away': { word: 'put away', tone: 'grey' },
  waiting: { word: 'waiting', tone: 'grey' },
};

/** labelOf gives the label of the state of a note, or null for a note that is unchecked. */
export const labelOf = (state: NoteState): NoteLabel | null => LABELS[state] || null;

/** authorOf is the person who wrote a note or made a change, from by: person:<subject>, or "" for anyone else. */
export function authorOf(by: string): string {
  const b = (by || '').trim();
  return b.startsWith('person:') ? b.slice(7) : '';
}

/** isMine reports whether the person wrote a note. */
export function isMine(by: string, me: Me): boolean {
  const who = authorOf(by);
  return !!who && isMe(who, me);
}

/* ---------- who may change what ---------- */

// The rights of access.go of the workbench, read from the role of the
// person on the agent in GET /v1/whoami: an owner may edit the agent, and
// an owner or an operator may run it.

/** The role of the person on an agent, as GET /v1/whoami names it. */
export type Role = string | undefined;

const runs = (role: Role) => role === 'owner' || role === 'operator';

/** isOwnScope reports whether a scope holds the notes of the person: their own principal. */
export const isOwnScope = (sc: NoteScope, me: Me): boolean => sc.kind === 'principal' && !!me && !!me.subject && sc.principal === me.subject;

/**
 * canChangeScope reports whether the person may change the notes of a
 * scope: their own notes with the operator role, and the notes of the
 * agent or of a duty with the owner role.
 */
export function canChangeScope(sc: NoteScope, me: Me, role: Role): boolean {
  return isOwnScope(sc, me) ? runs(role) : role === 'owner';
}

/**
 * canEditNote reports whether the page offers Edit and Put away on a
 * note: a note of the own scope of the person, a note that the person
 * wrote, or a note that went out of date, where the server lets them
 * change it. An out-of-date note has no undo, so an owner corrects it in
 * place: a new text, or Put away.
 */
export function canEditNote(n: Pick<NoteItem, 'scope' | 'by'> & { state?: NoteState }, me: Me, role: Role): boolean {
  if (isOwnScope(n.scope, me)) return runs(role);
  return (isMine(n.by, me) || n.state === 'out-of-date') && canChangeScope(n.scope, me, role);
}

/** canUndo reports whether an entry offers Undo: the server can take it back, nobody did yet, and it is no move to out of date, which would make the agent trust the note over its source again. */
export function canUndo(e: Pick<JournalEntry, 'undo' | 'undoneBy' | 'what' | 'subject'>, me: Me, role: Role): boolean {
  return !!e.undo && !e.undoneBy && e.what !== 'out-of-date' && canDecide(e.subject, me, role);
}

/** subjectScope is the scope of the note of an entry or of a change. */
export const subjectScope = (s: JournalSubject): NoteScope => (s.scope === 'principal' ? { kind: 'principal', principal: s.principal } : { kind: 'agent' });

/** canDecide reports whether the person may undo an entry or decide a change: a note of a scope that they may change, or a routine with the owner role. */
export function canDecide(s: JournalSubject, me: Me, role: Role): boolean {
  return s && s.note ? canChangeScope(subjectScope(s), me, role) : role === 'owner';
}

/**
 * byWords names who made a note or a change, for a meta line: you, a
 * person, the agent, or the after-work review. The server names no actor,
 * so its own changes give "".
 */
export function byWords(by: string, me: Me, agentName: string): string {
  const b = (by || '').trim();
  if (b === 'review') return 'the after-work review';
  if (b === 'agent') return agentName;
  const who = authorOf(b);
  if (who) {
    const w = whoName(who, me);
    return w === 'You' ? 'you' : w;
  }
  return '';
}

/** A source of a note in words, with the address that opens it, if any. */
export interface SourceWords {
  kind: 'run' | 'page' | 'item' | 'other';
  words: string;
  href: string;
}

/** runHref is the address of a run on this page: its chat, as a card of Work opens it. */
export const runHref = (run: string): string => hrefOf({ place: 'chat', run });

/**
 * sourceOf says a source: a run, a page of the wiki, or an item of a
 * source such as an issue. A page is a link only for a person who may
 * read the wiki (wiki), because a link that refuses the person is no link.
 */
export function sourceOf(ref: string, opts: { wiki?: boolean } = {}): SourceWords {
  const r = (ref || '').trim();
  if (r.startsWith('run:')) return { kind: 'run', words: 'a run', href: runHref(r.slice(4)) };
  if (r.startsWith('page:')) {
    const path = r.slice(5);
    return { kind: 'page', words: 'the page ' + path, href: opts.wiki === false ? '' : hrefOf({ place: 'pages', path, mode: 'read' }) };
  }
  if (r.startsWith('item:')) {
    const [source, ...key] = r.slice(5).split('/');
    return { kind: 'item', words: key.length ? cap(source) + ' ' + key.join(' ') : r.slice(5), href: '' };
  }
  return { kind: 'other', words: r, href: '' };
}

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A group of notes: the notes of one scope. */
export interface NoteGroup {
  key: string;
  title: string;
  items: NoteItem[];
}

/**
 * groupNotes puts the notes in groups by scope: the notes of the person
 * first, then the agent notes, then the notes of each duty and of any other
 * principal, by name. Inside a group, the notes that need a look come
 * first: out of date, then the rest by the time of their last change.
 * A put-away note stays out of the groups.
 */
export function groupNotes(notes: NoteItem[], me: Me): NoteGroup[] {
  const groups = new Map<string, NoteGroup & { rank: number }>();
  for (const n of notes) {
    if (n.state === 'put-away') continue;
    const p = n.scope.kind === 'principal' ? n.scope.principal || '' : '';
    let key = 'agent';
    let title = 'Agent notes';
    let rank = 1;
    if (n.scope.kind === 'principal') {
      key = 'principal:' + p;
      if (isMe(p, me)) {
        title = 'Your notes';
        rank = 0;
      } else {
        title = whoName(p, me);
        rank = 2;
      }
    }
    let g = groups.get(key);
    if (!g) {
      g = { key, title, items: [], rank };
      groups.set(key, g);
    }
    g.items.push(n);
  }
  const order = (n: NoteItem) => (n.state === 'out-of-date' ? 0 : 1);
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .map(({ key, title, items }) => ({ key, title, items: items.sort((a, b) => order(a) - order(b) || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)) }));
}

/** A sentence with the name of its subject apart, so the page can set the name in bold. */
export interface Sentence {
  head: string;
  name: string;
  tail: string;
}

/** subjectOf names the subject of an entry: the title of a note or of a routine. */
function subjectOf(s: JournalEntry['subject']): { kind: 'note' | 'routine' | ''; title: string } {
  if (s && s.routine) return { kind: 'routine', title: titleOf(s.routine) };
  if (s && s.note) return { kind: 'note', title: noteTitle(s.note) };
  return { kind: '', title: '' };
}

const NOTE_DONE: Partial<Record<JournalWhat, [string, string]>> = {
  learned: ['Learned the note ', '.'],
  updated: ['Changed the note ', '.'],
  'out-of-date': ['The note ', ' went out of date.'],
  resting: ['The note ', ' is resting.'],
  'put-away': ['Put away the note ', '.'],
  undone: ['Took back a change to the note ', '.'],
};

const ROUTINE_DONE: Partial<Record<JournalWhat, [string, string]>> = {
  proposed: ['Proposed the routine ', '.'],
  rehearsing: ['The routine ', ' started rehearsing.'],
  live: ['The routine ', ' went live.'],
  'stepped-back': ['The routine ', ' stepped back to rehearsing.'],
  retired: ['Retired the routine ', '.'],
  paused: ['Paused the routine ', '.'],
  'stays-out': ['The proposal of the routine ', ' stayed out.'],
  undone: ['Took back a change to the routine ', '.'],
};

/** entrySentence says what an entry of the journal did, such as Learned the note Gitea labels. */
export function entrySentence(e: Pick<JournalEntry, 'what' | 'subject'>): Sentence {
  const s = subjectOf(e.subject);
  const table = s.kind === 'routine' ? ROUTINE_DONE : NOTE_DONE;
  const pair = table[e.what];
  if (pair) return { head: pair[0], name: s.title, tail: pair[1] };
  return { head: s.kind === 'routine' ? 'Changed the routine ' : 'Changed the note ', name: s.title, tail: '.' };
}

const NOTE_WAIT: Partial<Record<JournalWhat, [string, string]>> = {
  learned: ['A new note: ', ''],
  updated: ['A change to the note ', ''],
  'out-of-date': ['Mark the note ', ' out of date'],
  resting: ['Rest the note ', ''],
  'put-away': ['Put away the note ', ''],
};

const ROUTINE_WAIT: Partial<Record<JournalWhat, [string, string]>> = {
  proposed: ['A new routine: ', ''],
  rehearsing: ['Rehearse the routine ', ''],
  live: ['Let the routine ', ' go live'],
  'stepped-back': ['Step the routine ', ' back to rehearsing'],
  retired: ['Retire the routine ', ''],
};

/** waitSentence says what a waiting change would do, under the title Keep this?. */
export function waitSentence(c: Pick<WaitingChange, 'what' | 'subject'>): Sentence {
  const s = subjectOf(c.subject);
  const table = s.kind === 'routine' ? ROUTINE_WAIT : NOTE_WAIT;
  const pair = table[c.what];
  if (pair) return { head: pair[0], name: s.title, tail: pair[1] };
  return { head: s.kind === 'routine' ? 'A change to the routine ' : 'A change to the note ', name: s.title, tail: '' };
}

/** conflictWords say in place that the note or the routine of a change changed since, after a 409 or a 412. */
export function conflictWords(s: { note?: string; routine?: string }): string {
  return s && s.routine && !s.note ? 'This routine changed since. Read it again.' : 'This note changed since. Read it again.';
}

/** undoRefusal says in place why an undo did not happen: a later change touched the same note or routine. */
export function undoRefusal(s: { note?: string; routine?: string }): string {
  return s && s.routine && !s.note ? 'A later change touched this routine. Take that one back first.' : 'A later change touched this note. Take that one back first.';
}

/** runLinks names the runs of an entry: The run for one, else Run 1, Run 2, and so on. Each opens on this page. */
export function runLinks(runs: string[] | undefined): { label: string; href: string; run: string }[] {
  const list = (runs || []).filter(Boolean);
  return list.map((run, i) => ({ label: list.length === 1 ? 'The run' : 'Run ' + (i + 1), href: runHref(run), run }));
}

/**
 * undoRefusalOf says in place why an undo did not happen. The server
 * answers outOfDate for a note that went out of date since: an undo would
 * make the agent trust it again, so the sentence points to Notes, whose
 * name the page links, where the person corrects the note.
 */
export function undoRefusalOf(s: { note?: string; routine?: string }, outOfDate: boolean): Sentence {
  if (outOfDate && s && s.note) return { head: 'This note went out of date since. Edit it or put it away in ', name: 'Notes', tail: '.' };
  return { head: undoRefusal(s), name: '', tail: '' };
}

/* ---------- the four numbers ---------- */

/** The figures of the header of the place: cost per job with its trend, done by routines, and notes corrected. */
export interface Figures {
  /** The finished runs of the days of the summary, of both kinds. */
  runs: number;
  cost: string;
  /** The trend of the cost against the days before, such as down 12%, or "". */
  trend: string;
  /** The share of the normal runs that routines did, with the runs that it counts, such as 34% of 433, or a count under the rule of 20. */
  routines: string;
  corrected: string;
}

const pct = (x: number): string => Math.round(x * 100) + '%';

/**
 * figuresOf gives the figures of a summary. The server gives the trend as
 * a word: down, up, or flat within 5%. From 20 runs, the page adds the
 * change in percent. A share also needs 20 runs, else the figure gives
 * counts.
 */
export function figuresOf(s: KnowhowSummary): Figures {
  const c = s.costPerJob || { usd: 0, runs: 0 };
  const d = s.doneByRoutines || { runs: 0, byRoutine: 0, share: 0 };
  let trend = '';
  if (c.trend === 'flat') trend = 'about the same';
  else if (c.trend === 'down' || c.trend === 'up') {
    const before = c.previousUsd;
    trend = c.trend;
    if (c.runs >= HELD_BACK_MIN && typeof before === 'number' && before > 0) trend += ' ' + pct(Math.abs(c.usd - before) / before);
  }
  return {
    runs: c.runs || 0,
    cost: money(c.usd || 0),
    trend,
    routines: d.runs >= HELD_BACK_MIN ? pct(d.share) + ' of ' + num(d.runs) : num(d.byRoutine || 0) + ' of ' + num(d.runs || 0),
    corrected: num(s.notesCorrected || 0),
  };
}

/**
 * heldBackLine compares the runs that got none of what the agent learned
 * with the others. The server says whether there are enough held-back
 * runs (the rule of 20) and words the line. With enough, the page adds the
 * cost per job of each kind.
 */
export function heldBackLine(s: KnowhowSummary): string {
  const c = s.compare;
  if (!c || !c.enough) return (c && c.line) || 'Not enough held-back runs yet.';
  const line =
    c.line ||
    `Held back 1 in ${c.oneIn} runs. Done well: ${pct(c.doneWellWithout || 0)} without what it learned, ${pct(c.doneWellWith || 0)} with it.`;
  const h = s.heldBack;
  const n = s.normal;
  if (!h || !n || !h.runs || !n.runs) return line;
  const [without, withIt] = moneyPair(h.costPerJobUsd || 0, n.costPerJobUsd || 0);
  return `${line} Cost per job: ${without} without, ${withIt} with.`;
}

/** moneyPair writes two costs that the page compares. Where two decimals write two different costs the same, both take three. */
export function moneyPair(a: number, b: number): [string, string] {
  const x = money(a);
  const y = money(b);
  if (x !== y || a === b || a < 0.01 || b < 0.01) return [x, y];
  return ['$' + a.toFixed(3), '$' + b.toFixed(3)];
}

/** usesWords says how often runs used a note, such as used 7 times. */
export function usesWords(uses: number): string {
  if (!uses) return 'not used yet';
  return uses === 1 ? 'used once' : 'used ' + num(uses) + ' times';
}
