// The inbox of the Activity place: one row per decision, question, failed
// seat, stopped seat, and new message, across every open bridge, in the
// order of attention. The functions here are pure, so the tests read them
// without a page.

import type { Bridge, Decision, Entry, Member, Result, Run } from '../api/types';
import type { Channel, Roster } from './reducer';
import { newestRun } from './people';
import { decisionOf } from '../lib/decision';
import { seatPresence, type Facts } from '../lib/status';

export type InboxKind = 'decision' | 'question' | 'failed' | 'stopped' | 'message';

/** The statuses of the inbox, in the order of attention. */
export const INBOX_ORDER = ['needs-you', 'error', 'working', 'idle', 'asleep'] as const;
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
  /** Why a seat stopped, such as the error of its run. */
  reason?: string;
  /** The moment of the row: when the wait started, the run stopped, or the message came. */
  at: string;
  /** True for a message that an agent addressed to you. */
  toYou?: boolean;
}

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
}

/** cardOf finds the card of a decision in a loaded channel. */
function cardOf(ch: Channel | undefined, run: string, id: string): Entry | undefined {
  if (!ch) return undefined;
  for (let i = ch.seqs.length - 1; i >= 0; i--) {
    const e = ch.bySeq[ch.seqs[i]];
    if (e && e.decision && e.decision.run === run && e.decision.id === id) return e;
  }
  return undefined;
}

/** reasonOf says why the newest run of a seat stopped, in one line. */
export function reasonOf(run: Run | undefined, res: Result | undefined): string {
  if (res && res.limits && res.limits.length) return res.limits[0];
  if (res && res.error) return res.error;
  return run && run.error ? run.error : '';
}

const statusOfPresence = (p: string | undefined): InboxStatus => (p === 'working' || p === 'needs-you' ? 'working' : p === 'asleep' ? 'asleep' : 'idle');

/** messageOf is the newest entry of a bridge that counts as new: a message of a person or an agent after the read mark, not of the person. */
function messageOf(b: Bridge, ch: Channel | undefined, me: string): Entry | undefined {
  if (!ch || !b.unread) return undefined;
  for (let i = ch.seqs.length - 1; i >= 0; i--) {
    const e = ch.bySeq[ch.seqs[i]];
    if (!e || e.seq <= b.read) break;
    if (e.from.kind === 'system') continue;
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
      const base = { bridge: b.id, bridgeTitle: b.title, handle: m.handle, agent: m.agent, run: id };
      const p = presence(m);
      if (p === 'needs-you' && run && run.state === 'input-required' && run.pending) {
        const d = decisionOf(run, s.results[run.id], cardOf(s.channels[b.id], run.id, run.pending.id));
        if (d) {
          rows.push({ ...base, key: 'd:' + run.id + '/' + d.id, kind: d.question || d.schema ? 'question' : 'decision', status: 'needs-you', decision: d, at: run.pending.requestedAt || run.updatedAt });
          continue;
        }
      }
      if (p === 'error' || (run && (run.state === 'failed' || run.state === 'canceled'))) {
        const kind: InboxKind = run && run.state === 'canceled' ? 'stopped' : 'failed';
        rows.push({ ...base, key: 's:' + b.id + '/' + m.handle, kind, status: 'error', reason: reasonOf(run, s.results[id]), at: run ? run.updatedAt : '' });
      }
    }
    const e = messageOf(b, s.channels[b.id], s.me);
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
  return rows;
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

export type InboxAction = 'allow' | 'deny' | 'always' | 'answer' | 'reply' | 'open' | 'seat';

/**
 * keyAction maps a key on a row of the inbox to an action: a allows, d
 * denies, r replies, and Enter opens. On a question, a opens the answer and
 * d declines. A failed or a stopped seat takes s to seat it again.
 */
export function keyAction(key: string, row: InboxRow): InboxAction | null {
  if (key === 'Enter') return 'open';
  if (key === 'r') return 'reply';
  if (row.kind === 'decision') return key === 'a' ? 'allow' : key === 'd' ? 'deny' : null;
  if (row.kind === 'question') return key === 'a' ? 'answer' : key === 'd' ? 'deny' : null;
  if (row.kind === 'failed' || row.kind === 'stopped') return key === 's' ? 'seat' : null;
  return null;
}
