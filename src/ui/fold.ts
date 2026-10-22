// The folding of a channel. A sleep line and a wake line of one seat with
// nothing between them fold into one quiet line, such as "migrator-1 slept
// and woke up", and so does a run of such pairs. Three or more system lines
// in a row then fold into one line, such as "5 updates", where the quiet
// line of the pairs counts as one. Two or more messages in a row that
// agents send only to agents fold into one line, such as "migrator-1 and
// reviewer: 4 messages". A decision card never folds, and a fold never
// crosses the line of a new day. A fold of lines or of messages opens in
// place.
//
// The channel reads the shape of each entry as one string, so a reaction or
// a decision that changes an entry redraws its own row and not the channel.

import { dayWords, list } from '../lib/words';
import { napOf, napRuns } from '../lib/lines';
import type { Entry } from '../api/types';

/** line is a plain system line, chat a message of an agent to agents, card a decision, msg any other message. */
export type ShapeKind = 'line' | 'chat' | 'card' | 'msg';

export interface Shape {
  seq: number;
  kind: ShapeKind;
  day: string;
  /** The sender and the addressees of a message of an agent to agents, or the handle of a sleep or a wake line. */
  who: string[];
  /** True for a system line of a failure. */
  failed: boolean;
  /** A line that says that the worker of a seat went to sleep or woke up. */
  nap?: 'sleep' | 'wake';
}

/** The fewest lines in a row that fold. */
export const FOLD_LINES = 3;
/** The fewest messages of agents to agents in a row that fold. */
export const FOLD_CHAT = 2;

/** shapeOf names what an entry is, for the folding. */
export function shapeOf(e: Entry, now?: Date): Shape {
  const day = dayWords(e.at, now);
  if (e.from.kind === 'system') {
    if (e.decision) return { seq: e.seq, kind: 'card', day, who: [], failed: false };
    const n = napOf(e);
    if (n) return { seq: e.seq, kind: 'line', day, who: [n.handle], failed: false, nap: n.nap };
    return { seq: e.seq, kind: 'line', day, who: [], failed: e.event === 'failed' };
  }
  const to = e.to || [];
  if (e.from.kind === 'agent' && e.from.handle && to.length > 0 && !to.includes('operator') && !e.pinned) {
    return { seq: e.seq, kind: 'chat', day, who: [e.from.handle, ...to], failed: false };
  }
  return { seq: e.seq, kind: 'msg', day, who: [], failed: false };
}

/** shapeKey writes the shapes of a channel as one string, for a selector that compares by value. */
export function shapeKey(shapes: Shape[]): string {
  return shapes.map((s) => [s.seq, s.kind, s.day, s.who.join(','), s.failed ? 1 : 0, s.nap || ''].join('|')).join('\n');
}

/** shapesOf reads the string of shapeKey back. */
export function shapesOf(key: string): Shape[] {
  if (!key) return [];
  return key.split('\n').map((row) => {
    const [seq, kind, day, who, failed, nap] = row.split('|');
    const s: Shape = { seq: Number(seq), kind: kind as ShapeKind, day, who: who ? who.split(',') : [], failed: failed === '1' };
    if (nap === 'sleep' || nap === 'wake') s.nap = nap;
    return s;
  });
}

/** The quiet line of a run of sleep and wake pairs of one seat. */
export interface Naps {
  kind: 'naps';
  key: string;
  seqs: number[];
  handle: string;
  /** The number of pairs: a sleep line and the wake line after it. */
  pairs: number;
}

/** A part of a fold of lines: one entry, or the quiet line of a run of pairs. */
export type Part = { kind: 'entry'; seq: number } | Naps;

export type Item =
  /** One entry. prevSeq is the entry before it, for the day line. fresh is true after a fold, so the entry shows its sender again. */
  | { kind: 'entry'; seq: number; prevSeq: number; fresh: boolean }
  /** The quiet line of a run of sleep and wake pairs. */
  | (Naps & { prevSeq: number })
  | { kind: 'fold'; key: string; type: 'line' | 'chat'; seqs: number[]; parts: Part[]; prevSeq: number; who: string[]; failed: number };

/** A unit of the folding: one shape, or a run of pairs, which counts as one line. */
interface Unit {
  kind: ShapeKind;
  day: string;
  shapes: Shape[];
  naps?: Naps;
}

/** unitsOf folds the runs of sleep and wake pairs of the shapes into units. */
function unitsOf(shapes: Shape[]): Unit[] {
  const runs = napRuns(
    shapes.map((s) => (s.kind === 'line' && s.nap ? { nap: s.nap, handle: s.who[0] || '' } : null)),
    (i, j) => shapes[i].day === shapes[j].day,
  );
  const starts = new Map(runs.map((r) => [r[0], r]));
  const out: Unit[] = [];
  let i = 0;
  while (i < shapes.length) {
    const run = starts.get(i);
    if (run) {
      const part = run.map((k) => shapes[k]);
      out.push({ kind: 'line', day: part[0].day, shapes: part, naps: { kind: 'naps', key: 'naps:' + part[0].seq, seqs: part.map((x) => x.seq), handle: part[0].who[0], pairs: part.length / 2 } });
      i += run.length;
      continue;
    }
    out.push({ kind: shapes[i].kind, day: shapes[i].day, shapes: [shapes[i]] });
    i++;
  }
  return out;
}

/** foldShapes groups the shapes of a channel into entries, quiet lines of pairs, and folds. */
export function foldShapes(shapes: Shape[]): Item[] {
  const units = unitsOf(shapes);
  const out: Item[] = [];
  // The seq of the entry before each shape, for the day line of an item.
  const before = new Map(shapes.map((s, i) => [s.seq, i > 0 ? shapes[i - 1].seq : 0]));
  let i = 0;
  let afterFold = false;
  while (i < units.length) {
    const u = units[i];
    let j = i + 1;
    if (u.kind === 'line' || u.kind === 'chat') {
      while (j < units.length && units[j].kind === u.kind && units[j].day === u.day) j++;
    }
    const run = units.slice(i, j);
    const prevSeq = before.get(u.shapes[0].seq) || 0;
    const min = u.kind === 'line' ? FOLD_LINES : u.kind === 'chat' ? FOLD_CHAT : Infinity;
    if (run.length >= min) {
      const all = run.flatMap((x) => x.shapes);
      const who: string[] = [];
      if (u.kind === 'chat') for (const r of all) for (const h of r.who) if (!who.includes(h)) who.push(h);
      const parts: Part[] = run.map((x) => x.naps || { kind: 'entry', seq: x.shapes[0].seq });
      out.push({ kind: 'fold', key: u.kind + ':' + all[0].seq, type: u.kind as 'line' | 'chat', seqs: all.map((r) => r.seq), parts, prevSeq, who, failed: all.filter((r) => r.failed).length });
      afterFold = true;
    } else {
      for (let k = 0; k < run.length; k++) {
        const x = run[k];
        const p = before.get(x.shapes[0].seq) || 0;
        if (x.naps) out.push({ ...x.naps, prevSeq: p });
        else out.push({ kind: 'entry', seq: x.shapes[0].seq, prevSeq: p, fresh: k === 0 && afterFold });
      }
      afterFold = false;
    }
    i = j;
  }
  return out;
}

/** foldWords is the text of a fold: "5 updates", where the quiet line of a run of pairs counts as one, or "migrator-1 and reviewer: 4 messages". */
export function foldWords(f: Extract<Item, { kind: 'fold' }>): string {
  if (f.type === 'line') return f.parts.length + ' updates';
  const n = f.seqs.length;
  return list(f.who) + ': ' + n + ' messages';
}

/** foldOf returns the key of the fold that holds a seq, or "". */
export function foldOf(items: Item[], seq: number): string {
  for (const it of items) if (it.kind === 'fold' && it.seqs.includes(seq)) return it.key;
  return '';
}
