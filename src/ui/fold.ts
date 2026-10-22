// The folding of a channel. Three or more system lines in a row fold into
// one line, such as "5 updates". Two or more messages in a row that agents
// send only to agents fold into one line, such as "migrator-1 and reviewer:
// 4 messages". A decision card never folds, and a fold never crosses the
// line of a new day. A fold opens in place.
//
// The channel reads the shape of each entry as one string, so a reaction or
// a decision that changes an entry redraws its own row and not the channel.

import { dayWords, list } from '../lib/words';
import type { Entry } from '../api/types';

/** line is a plain system line, chat a message of an agent to agents, card a decision, msg any other message. */
export type ShapeKind = 'line' | 'chat' | 'card' | 'msg';

export interface Shape {
  seq: number;
  kind: ShapeKind;
  day: string;
  /** The sender and the addressees of a message of an agent to agents. */
  who: string[];
  /** True for a system line of a failure. */
  failed: boolean;
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
  return shapes.map((s) => [s.seq, s.kind, s.day, s.who.join(','), s.failed ? 1 : 0].join('|')).join('\n');
}

/** shapesOf reads the string of shapeKey back. */
export function shapesOf(key: string): Shape[] {
  if (!key) return [];
  return key.split('\n').map((row) => {
    const [seq, kind, day, who, failed] = row.split('|');
    return { seq: Number(seq), kind: kind as ShapeKind, day, who: who ? who.split(',') : [], failed: failed === '1' };
  });
}

export type Item =
  /** One entry. prevSeq is the entry before it, for the day line. fresh is true after a fold, so the entry shows its sender again. */
  | { kind: 'entry'; seq: number; prevSeq: number; fresh: boolean }
  | { kind: 'fold'; key: string; type: 'line' | 'chat'; seqs: number[]; prevSeq: number; who: string[]; failed: number };

/** foldShapes groups the shapes of a channel into entries and folds. */
export function foldShapes(shapes: Shape[]): Item[] {
  const out: Item[] = [];
  let i = 0;
  let afterFold = false;
  while (i < shapes.length) {
    const s = shapes[i];
    let j = i + 1;
    if (s.kind === 'line' || s.kind === 'chat') {
      while (j < shapes.length && shapes[j].kind === s.kind && shapes[j].day === s.day) j++;
    }
    const run = shapes.slice(i, j);
    const prevSeq = i > 0 ? shapes[i - 1].seq : 0;
    const min = s.kind === 'line' ? FOLD_LINES : s.kind === 'chat' ? FOLD_CHAT : Infinity;
    if (run.length >= min) {
      const who: string[] = [];
      for (const r of run) for (const h of r.who) if (!who.includes(h)) who.push(h);
      out.push({ kind: 'fold', key: s.kind + ':' + s.seq, type: s.kind as 'line' | 'chat', seqs: run.map((r) => r.seq), prevSeq, who, failed: run.filter((r) => r.failed).length });
      afterFold = true;
    } else {
      for (let k = 0; k < run.length; k++) {
        out.push({ kind: 'entry', seq: run[k].seq, prevSeq: i + k > 0 ? shapes[i + k - 1].seq : 0, fresh: k === 0 && afterFold });
      }
      afterFold = false;
    }
    i = j;
  }
  return out;
}

/** foldWords is the text of a fold: "5 updates", or "migrator-1 and reviewer: 4 messages". */
export function foldWords(f: Extract<Item, { kind: 'fold' }>): string {
  const n = f.seqs.length;
  if (f.type === 'line') return n + ' updates';
  return list(f.who) + ': ' + n + ' messages';
}

/** foldOf returns the key of the fold that holds a seq, or "". */
export function foldOf(items: Item[], seq: number): string {
  for (const it of items) if (it.kind === 'fold' && it.seqs.includes(seq)) return it.key;
  return '';
}
