// The direct thread with one seat of a bridge: the entries of the channel
// from that handle or addressed to it, the cards and the system lines of
// its runs, and the quiet step lines of its runs, in the order of time.
// The functions here are pure, so the tests read them without a page.

import type { Entry, Item } from '../api/types';
import { commandOf } from '../lib/words';
import { decidedRuns, hiddenLine } from '../lib/lines';

/** One quiet line for one tool call of a run, such as Ran "ls" or Created a/b.yml. */
export interface Step {
  key: string;
  at: string;
  /** The verb and its target, without the command. */
  text: string;
  /** The command of a shell call, shown as code after the text. */
  cmd?: string;
  isError?: boolean;
}

export type ThreadRow =
  | { kind: 'entry'; key: string; at: string; entry: Entry }
  | { kind: 'step'; key: string; at: string; step: Step }
  | { kind: 'steps'; key: string; at: string; steps: Step[] }
  | { kind: 'live'; key: string; at: string; handle: string; text: string };

/** aboutHandle reports whether a system line is about a handle: it starts with the handle as a word. */
function aboutHandle(text: string, handle: string): boolean {
  const t = String(text || '');
  if (!t.startsWith(handle)) return false;
  const next = t.charAt(handle.length);
  return next === '' || /[\s:,.]/.test(next);
}

/**
 * directEntries keeps the entries of a channel that belong to the direct
 * thread of a seat: its messages, the messages addressed to it, the cards
 * of its runs, and the system lines of its runs or about its handle. A
 * message to everyone stays in the channel. A line that says a decision
 * leaves the thread when the thread holds the card that shows it.
 */
export function directEntries(entries: Entry[], handle: string, runs: string[]): Entry[] {
  const mine = new Set(runs);
  const kept = entries.filter((e) => {
    if (e.from.kind === 'agent' && e.from.handle === handle) return true;
    if (e.from.kind !== 'system') return !!e.to && e.to.includes(handle);
    if (e.decision) return mine.has(e.decision.run);
    if (e.mirrors && mine.has(e.mirrors.run)) return true;
    return aboutHandle(e.text, handle);
  });
  const decided = decidedRuns(kept);
  return kept.filter((e) => !hiddenLine(e, decided));
}

/** stepOf words one tool call as a quiet line, without a tool name where it can. */
export function stepOf(it: Item, file?: Item): Step {
  const base = { key: 'step-' + it.seq, at: it.time };
  const f = file || (it.kind === 'file' ? it : undefined);
  if (f) return { ...base, text: (f.text === 'created' ? 'Created ' : f.text === 'deleted' ? 'Removed ' : 'Edited ') + (f.path || 'a file') };
  const cmd = commandOf(it.input);
  if (cmd) return { ...base, text: 'Ran', cmd: cmd.length > 80 ? cmd.slice(0, 79) + '…' : cmd };
  return { ...base, text: 'Used ' + (it.tool || 'a tool').replace(/^front\./, '') };
}

/** stepsOf turns the tool calls of a transcript into step lines, with the error of a failed call. */
export function stepsOf(items: Item[]): Step[] {
  const results = new Map(items.filter((x) => x.kind === 'result').map((x) => [x.callId, x]));
  const files = new Map(items.filter((x) => x.kind === 'file').map((x) => [x.callId, x]));
  return items
    .filter((x) => x.kind === 'tool')
    .map((c) => {
      const r = results.get(c.callId);
      const s = stepOf(c, files.get(c.callId));
      return r && r.isError ? { ...s, isError: true } : s;
    });
}

const time = (iso: string): number => {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
};

/**
 * threadOf merges the entries and the steps in the order of time. A run of
 * fold or more steps between two entries folds into one line, such as
 * Took 5 steps, which opens in place.
 */
export function threadOf(entries: Entry[], steps: Step[], fold = 3): ThreadRow[] {
  const all: ThreadRow[] = [
    ...entries.map((e): ThreadRow => ({ kind: 'entry', key: 'e-' + e.seq, at: e.at, entry: e })),
    ...steps.map((s): ThreadRow => ({ kind: 'step', key: s.key, at: s.at, step: s })),
  ];
  // A stable sort: at one moment an entry stays before a step, and each keeps its own order.
  const ranked = all.map((r, i) => ({ r, i, t: time(r.at) }));
  ranked.sort((a, b) => a.t - b.t || a.i - b.i);
  const out: ThreadRow[] = [];
  let run: Step[] = [];
  const flush = () => {
    if (run.length >= fold) out.push({ kind: 'steps', key: 'steps-' + run[0].key, at: run[0].at, steps: run });
    else for (const s of run) out.push({ kind: 'step', key: s.key, at: s.at, step: s });
    run = [];
  };
  for (const { r } of ranked) {
    if (r.kind === 'step') {
      run.push(r.step);
      continue;
    }
    flush();
    out.push(r);
  }
  flush();
  return out;
}

/**
 * withLive adds the answer that a member writes now, from the live stream
 * of its run, as a pending message of its own at the end of the thread. The
 * finished answer arrives as an entry of the channel and takes its place.
 */
export function withLive(rows: ThreadRow[], handle: string, text: string, at: string): ThreadRow[] {
  if (!text) return rows;
  return [...rows, { kind: 'live', key: 'live-' + handle, at, handle, text }];
}

/** sameSender reports whether an entry continues the message before it: one sender, one day, within five minutes. */
export function sameSender(prev: Entry | undefined, e: Entry): boolean {
  if (!prev || e.replyTo || prev.decision || e.decision) return false;
  if (prev.from.kind !== e.from.kind || e.from.kind === 'system') return false;
  const who = (x: Entry) => (x.from.kind === 'agent' ? x.from.handle : x.from.name);
  if (who(prev) !== who(e)) return false;
  const gap = time(e.at) - time(prev.at);
  return gap >= 0 && gap < 5 * 60_000 && new Date(prev.at).toDateString() === new Date(e.at).toDateString();
}
