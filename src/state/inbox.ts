// The inbox of the Activity place: one row per decision, question, failed
// seat, stopped seat, seat at its limit, message that asks you, and new
// message, across every open bridge, in the order of attention. The items
// of GET /v1/inbox add a row for each failed run and each paused duty, and
// for a question of a run of a duty that sits on no bridge. A question of
// a bridge has its row already, so it never shows twice. The functions
// here are pure, so the tests read them without a page.

import type { Bridge, Decision, Entry, InboxItem, Member, Result, Run } from '../api/types';
import type { Channel, Roster } from './reducer';
import { newestRun } from './people';
import { decisionOf } from '../lib/decision';
import { plainError, providerMessage } from '../lib/runerror';
import { seatPresence, type Facts } from '../lib/status';

/**
 * The kinds of a row. asked is a message of an agent that asks you, in
 * the channel: it needs you, and it is no card, so you answer it in the
 * bridge.
 */
export type InboxKind = 'decision' | 'question' | 'asked' | 'failed' | 'stopped' | 'limit' | 'message' | 'duty-failed' | 'duty-paused' | 'duty-waits' | 'result';

/** The statuses of the inbox, in the order of attention. A seat at its limit did nothing wrong, and it waits for you to continue it. */
export const INBOX_ORDER = ['needs-you', 'error', 'limit', 'working', 'idle', 'asleep'] as const;
export type InboxStatus = (typeof INBOX_ORDER)[number];

export interface InboxRow {
  key: string;
  kind: InboxKind;
  status: InboxStatus;
  bridge: string;
  bridgeTitle: string;
  /** The seat that the row is about, or the agent that sent a message. */
  handle?: string;
  agent?: string;
  run?: string;
  decision?: Decision;
  entry?: Entry;
  /** Why a seat stopped, in one plain line. */
  reason?: string;
  /** The message of the model provider inside the error of the run, for a tooltip, or "". */
  said?: string;
  /** The moment of the row: when the wait started, the run stopped, or the message came. */
  at: string;
  /** True for a message that an agent addressed to you. */
  toYou?: boolean;
  /** The seq of the entry of a question, also before the page holds the entry. */
  seq?: number;
  /** The duty whose run the row is about, from the metadata workbench.duty of the run or from the item of the inbox. */
  duty?: string;
}

/** The key of the metadata of a run that names its duty. */
export const DUTY_KEY = 'workbench.duty';

/** dutyOfRun names the duty of a run, or "". */
export const dutyOfRun = (r: Run | undefined): string => (r && r.metadata && r.metadata[DUTY_KEY]) || '';

export interface InboxInput {
  /** The open bridges. */
  bridges: Bridge[];
  rosters: Record<string, Roster>;
  runs: Record<string, Run>;
  channels: Record<string, Channel>;
  /** The results of runs that the page read, for the label and the effect of a decision. */
  results: Record<string, Result>;
  /** The subject of the person. */
  me: string;
  /** What the page knows about the workers, so the status of a seat is the status of every screen. Without it, the presence of the bridge stands. */
  facts?: Facts;
  /** The entries that the page read alone, such as a question older than the loaded part of its channel, by bridge/seq. */
  entries?: Record<string, Entry>;
  /** The items of GET /v1/inbox. */
  items?: InboxItem[] | null;
}

/** cardOf finds the card of a decision in a loaded channel. */
export function cardOf(ch: Channel | undefined, run: string, id: string): Entry | undefined {
  if (!ch) return undefined;
  for (let i = ch.seqs.length - 1; i >= 0; i--) {
    const e = ch.bySeq[ch.seqs[i]];
    if (e && e.decision && e.decision.run === run && e.decision.id === id) return e;
  }
  return undefined;
}

/** reasonOf says why the newest run of a seat stopped, in one plain line, without the addresses, the ids, and the JSON of a provider. */
export function reasonOf(run: Run | undefined, res: Result | undefined): string {
  if (res && res.limits && res.limits.length) return plainError(res.limits[0]);
  if (res && res.error) return plainError(res.error);
  return run && run.error ? plainError(run.error) : '';
}

/** saidOf is the message of the model provider inside the error of the newest run of a seat, or "". */
export function saidOf(run: Run | undefined, res: Result | undefined): string {
  return providerMessage((res && res.error) || (run && run.error) || '');
}

/** The handle that an agent writes to address the person who runs the page. */
export const OPERATOR = 'operator';

/** The word @operator anywhere in a text, as the front reads it: not inside a longer handle or an address. */
const OPERATOR_WORD = /(^|[^a-z0-9._@-])@operator([^a-z0-9_-]|$)/i;

/**
 * asksYou reports whether an entry of an agent asks you: the front marks
 * it with ask, or its to holds operator, or its text holds the word
 * @operator anywhere, as the front reads a message of a seat.
 */
export function asksYou(e: Entry): boolean {
  if (e.from.kind !== 'agent') return false;
  if (e.ask || (e.to && e.to.includes(OPERATOR))) return true;
  return OPERATOR_WORD.test(e.text || '');
}

/** tracksQuestions reports whether the front names the question of each seat (the question of a member), so the page reads no question from the channel. */
export function tracksQuestions(r: Roster | undefined): boolean {
  return !!r && r.order.some((h) => r.byHandle[h] && typeof r.byHandle[h].question === 'number');
}

/** A question of a seat that waits for you: the seat, the seq of its entry, and the entry when the page holds it. */
export interface Question {
  handle: string;
  seq: number;
  entry?: Entry;
}

/**
 * questionsOf lists the questions of the seats of a bridge that wait for
 * you, the oldest first. The front names the question of each seat, until
 * a person answers it or the seat posts again. An older front names none,
 * and the page then reads them from the channel (asksOf). entries holds
 * the entries that the page read alone, by bridge/seq.
 */
export function questionsOf(b: Bridge, ch: Channel | undefined, me: string, r: Roster | undefined, entries: Record<string, Entry> = {}): Question[] {
  if (!tracksQuestions(r)) return asksOf(b, ch, me).map((e) => ({ handle: e.from.handle || '', seq: e.seq, entry: e }));
  const out: Question[] = [];
  for (const h of r!.order) {
    const m = r!.byHandle[h];
    if (!m || m.fired || !m.question) continue;
    out.push({ handle: h, seq: m.question, entry: (ch && ch.bySeq[m.question]) || entries[b.id + '/' + m.question] });
  }
  return out.sort((x, y) => x.seq - y.seq);
}

/** questionWaits reports whether an entry is a question of a seat that waits for you, as the front names it. */
export function questionWaits(r: Roster | undefined, e: Entry): boolean {
  if (!e.ask || e.from.kind !== 'agent' || !e.from.handle || !r) return false;
  const m = r.byHandle[e.from.handle];
  return !!m && !m.fired && m.question === e.seq;
}

/**
 * asksOf finds the messages of the agents that ask you and wait for your
 * answer, for a front that names no question of a seat: after your read
 * mark, with no later message of yours to that handle, to everyone, or in
 * reply to it, and no later message of the seat. Each seat gives its
 * newest one.
 */
export function asksOf(b: Bridge, ch: Channel | undefined, me: string): Entry[] {
  if (!ch) return [];
  const out = new Map<string, Entry>();
  const answered = new Set<string>();
  const posted = new Set<string>();
  let everyone = false;
  for (let i = ch.seqs.length - 1; i >= 0; i--) {
    const e = ch.bySeq[ch.seqs[i]];
    if (!e || e.seq <= b.read) break;
    if (e.from.kind === 'person' && (!me || e.from.name === me)) {
      for (const h of e.to || []) answered.add(h);
      if (!e.to || e.to.length === 0) everyone = true;
      if (e.replyTo) answered.add('#' + e.replyTo);
      continue;
    }
    const h = e.from.kind === 'agent' ? e.from.handle || '' : '';
    if (!h || posted.has(h)) continue;
    // The newest message of the seat decides: a later one ends its question.
    posted.add(h);
    if (everyone || answered.has(h) || answered.has('#' + e.seq) || !asksYou(e)) continue;
    out.set(h, e);
  }
  return [...out.values()].reverse();
}

const statusOfPresence = (p: string | undefined): InboxStatus => (p === 'working' || p === 'needs-you' ? 'working' : p === 'asleep' ? 'asleep' : 'idle');

/** messageOf is the newest entry of a bridge that counts as new: a message of a person or an agent after the read mark, not of the person, and not a question that waits for you, which has a row of its own. */
function messageOf(b: Bridge, ch: Channel | undefined, me: string, asked: Set<number>): Entry | undefined {
  if (!ch || !b.unread) return undefined;
  for (let i = ch.seqs.length - 1; i >= 0; i--) {
    const e = ch.bySeq[ch.seqs[i]];
    if (!e || e.seq <= b.read) break;
    if (e.from.kind === 'system' || asked.has(e.seq)) continue;
    if (e.from.kind === 'person' && e.from.name === me) continue;
    return e;
  }
  return undefined;
}

/** inboxRows builds the rows of the inbox, not yet in order. A seat whose newest run the page has not read gives no row yet. */
export function inboxRows(s: InboxInput): InboxRow[] {
  const rows: InboxRow[] = [];
  for (const b of s.bridges) {
    if (b.state !== 'open') continue;
    const roster = s.rosters[b.id];
    const members: Member[] = roster ? roster.order.map((h) => roster.byHandle[h]).filter((m) => m && !m.fired) : [];
    const presence = (m: Member | undefined) => (m ? (s.facts ? seatPresence(s.facts, m) : m.presence) : undefined);
    for (const m of members) {
      const id = newestRun(m);
      const run = s.runs[id];
      const duty = dutyOfRun(run);
      const base = { bridge: b.id, bridgeTitle: b.title, handle: m.handle, agent: m.agent, run: id, ...(duty ? { duty } : {}) };
      const p = presence(m);
      if (p === 'needs-you' && run && run.state === 'input-required' && run.pending) {
        const d = decisionOf(run, s.results[run.id], cardOf(s.channels[b.id], run.id, run.pending.id));
        if (d) {
          rows.push({ ...base, key: 'd:' + run.id + '/' + d.id, kind: d.question || d.schema ? 'question' : 'decision', status: 'needs-you', decision: d, at: run.pending.requestedAt || run.updatedAt });
          continue;
        }
      }
      if (p === 'limit') {
        rows.push({ ...base, key: 's:' + b.id + '/' + m.handle, kind: 'limit', status: 'limit', reason: reasonOf(run, s.results[id]), at: run ? run.updatedAt : '' });
        continue;
      }
      if (p === 'error' || (run && (run.state === 'failed' || run.state === 'canceled'))) {
        const kind: InboxKind = run && run.state === 'canceled' ? 'stopped' : 'failed';
        rows.push({ ...base, key: 's:' + b.id + '/' + m.handle, kind, status: 'error', reason: reasonOf(run, s.results[id]), said: saidOf(run, s.results[id]), at: run ? run.updatedAt : '' });
      }
    }
    const asked = new Set<number>();
    for (const q of questionsOf(b, s.channels[b.id], s.me, roster, s.entries)) {
      const m = roster ? roster.byHandle[q.handle] : undefined;
      asked.add(q.seq);
      rows.push({ key: 'q:' + b.id + '/' + q.seq, kind: 'asked', status: 'needs-you', bridge: b.id, bridgeTitle: b.title, handle: q.handle, agent: m ? m.agent : undefined, entry: q.entry, seq: q.seq, at: q.entry ? q.entry.at : '', toYou: true });
    }
    const e = messageOf(b, s.channels[b.id], s.me, asked);
    if (e) {
      const handle = e.from.kind === 'agent' ? e.from.handle : undefined;
      const m = handle && roster ? roster.byHandle[handle] : undefined;
      rows.push({
        key: 'm:' + b.id,
        kind: 'message',
        status: e.from.kind === 'agent' ? statusOfPresence(presence(m)) : 'idle',
        bridge: b.id,
        bridgeTitle: b.title,
        handle,
        agent: m ? m.agent : undefined,
        entry: e,
        at: e.at,
        toYou: !!e.to && (e.to.includes('operator') || (!!s.me && e.to.includes(s.me))),
      });
    }
  }
  return [...rows, ...itemRows(s, rows)];
}

/**
 * itemRows builds the rows of the items of GET /v1/inbox that no row of a
 * bridge shows: a failed run, a paused duty, and a question of a run of a
 * duty that sits on no bridge. The approval of the item gives the card of
 * a question at once, with Allow and Deny. The run, once the page holds
 * it, gives the whole card, with the call and its rule. An item without
 * an approval shows as a line that waits for its run. A failed run that a
 * row of a seat shows gives that row its duty instead.
 */
function itemRows(s: InboxInput, seats: InboxRow[]): InboxRow[] {
  const out: InboxRow[] = [];
  const titles = new Map(s.bridges.map((b) => [b.id, b.title]));
  for (const it of s.items || []) {
    const duty = it.duty || '';
    const where = { bridge: it.bridge || '', bridgeTitle: (it.bridge && titles.get(it.bridge)) || '', agent: it.agent || undefined, run: it.run || undefined, ...(duty ? { duty } : {}) };
    if (it.kind === 'failure' || it.kind === 'paused') {
      const seat = it.run ? seats.find((r) => r.run === it.run) : undefined;
      if (seat) {
        if (duty && !seat.duty) seat.duty = duty;
        continue;
      }
      const failed = it.kind === 'failure';
      out.push({ ...where, key: 'u:' + it.kind + '/' + (duty || it.run || it.text || ''), kind: failed ? 'duty-failed' : 'duty-paused', status: failed ? 'error' : 'limit', reason: it.text || '', at: it.since || '' });
      continue;
    }
    // A result to check: its owner asked to check each result. Looks right and Needs work end it.
    if (it.kind === 'result') {
      if (it.run) out.push({ ...where, agent: it.agent || undefined, handle: it.agent || undefined, key: 'v:' + it.run, kind: 'result', status: 'needs-you', reason: it.text || '', at: it.since || '' });
      continue;
    }
    // A question of a bridge has its row in the bridge.
    if ((it.kind !== 'approval' && it.kind !== 'question') || it.bridge || !it.run) continue;
    const run = s.runs[it.run];
    const agent = it.agent || (run ? run.agent : '');
    const approval = it.approval || '';
    if (run && run.state === 'input-required' && run.pending && (!approval || run.pending.id === approval)) {
      const d = decisionOf(run, s.results[run.id]);
      if (d) {
        out.push({ ...where, agent, handle: agent, key: 'd:' + run.id + '/' + d.id, kind: d.question || d.schema ? 'question' : 'decision', status: 'needs-you', decision: d, reason: it.text || '', at: run.pending.requestedAt || it.since || run.updatedAt });
        continue;
      }
    }
    if (approval) {
      // The card of the item needs no read of the run. It knows no call, so it offers no Always allow.
      const question = it.kind === 'question';
      const d: Decision = { run: it.run, id: approval, label: question ? 'Answer' : 'Allow', question, reason: question ? it.text || undefined : undefined, state: 'pending', always: false };
      out.push({ ...where, agent, handle: agent, key: 'd:' + it.run + '/' + approval, kind: question ? 'question' : 'decision', status: 'needs-you', decision: d, reason: it.text || '', at: it.since || '' });
      continue;
    }
    if (run && !['input-required', 'queued', 'running', 'suspended'].includes(run.state)) continue;
    out.push({ ...where, agent, key: 'w:' + it.run, kind: 'duty-waits', status: 'needs-you', reason: it.text || '', at: it.since || '' });
  }
  return out;
}

/**
 * needsPerson reports whether a row of the inbox needs the person: a
 * decision, a question, a message that asks you, a failed or a stopped
 * seat, a seat at its limit, a failed run of a duty, and a paused duty. A
 * new message needs nobody. Done clears it.
 */
export const needsPerson = (r: InboxRow): boolean => r.status === 'needs-you' || r.status === 'error' || r.status === 'limit';

/**
 * attentionOf is the count on the app bar: the rows of Activity that need
 * the person, from the same rows as the list. An open bridge whose record
 * the page has not read yet gives no row of a seat, so until then it
 * counts by the needsYou of the list of the bridges.
 */
export function attentionOf(s: Pick<InboxInput, 'bridges' | 'rosters'>, rows: InboxRow[]): number {
  let n = rows.filter(needsPerson).length;
  for (const b of s.bridges) if (b.state === 'open' && !s.rosters[b.id]) n += b.needsYou || 0;
  return n;
}

const ms = (iso: string): number => {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
};

/**
 * sortInbox puts the rows in the order of attention: needs you, error,
 * working, idle, asleep. Inside needs you, the oldest wait comes first.
 * Elsewhere a message to you comes first, then the newest.
 */
export function sortInbox(rows: InboxRow[]): InboxRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const ra = INBOX_ORDER.indexOf(a.r.status);
      const rb = INBOX_ORDER.indexOf(b.r.status);
      if (ra !== rb) return ra - rb;
      if (a.r.status === 'needs-you') return ms(a.r.at) - ms(b.r.at) || a.i - b.i;
      if (!!a.r.toYou !== !!b.r.toYou) return a.r.toYou ? -1 : 1;
      return ms(b.r.at) - ms(a.r.at) || a.i - b.i;
    })
    .map((x) => x.r);
}

export type InboxAction = 'allow' | 'deny' | 'always' | 'answer' | 'decline' | 'reply' | 'open' | 'seat' | 'continue' | 'done';

/**
 * keyAction maps a key on a row of the inbox to an action: a allows, d
 * denies, r replies, and Enter opens. On a question, a opens the answer and
 * d declines. On a message that asks you, r opens the answer in place. A failed or a stopped seat takes s to seat it again.
 * A seat at its limit takes c to continue it. A message takes e for Done, which clears it for you.
 */
export function keyAction(key: string, row: InboxRow): InboxAction | null {
  if (key === 'Enter') return 'open';
  if (key === 'r') return row.kind === 'asked' ? 'answer' : 'reply';
  // A question of a seat: a opens the answer, and d picks the choice that says no.
  if (row.kind === 'asked') return key === 'a' ? 'answer' : key === 'd' ? 'decline' : null;
  if (row.kind === 'decision') return key === 'a' ? 'allow' : key === 'd' ? 'deny' : null;
  if (row.kind === 'question') return key === 'a' ? 'answer' : key === 'd' ? 'deny' : null;
  if (row.kind === 'failed' || row.kind === 'stopped') return key === 's' ? 'seat' : null;
  if (row.kind === 'limit') return key === 'c' ? 'continue' : null;
  if (row.kind === 'message') return key === 'e' ? 'done' : null;
  return null;
}
