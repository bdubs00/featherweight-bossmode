// The direct thread with one seat of a bridge: the entries of the channel
// from that handle or addressed to it, the cards and the system lines of
// its runs, and the quiet step lines of its runs, in the order of time.
// The functions here are pure, so the tests read them without a page.

import type { Entry, Item } from '../api/types';
import { commandOf, inputFields, toolBase, toolName } from '../lib/words';
import { hrefOf } from '../lib/route';
import { decidedRuns, hiddenLine, napOf, napRuns } from '../lib/lines';

/** One quiet line for one tool call of a run, such as Ran "ls", Created a/b.yml, or Opened the bridge Release notes. */
export interface Step {
  key: string;
  at: string;
  /** The verb and its target, without the command. */
  text: string;
  /** The command of a shell call, shown as code after the text. */
  cmd?: string;
  /** The bridge that the call acted on, by its id, so the line links it with its title. */
  bridge?: string;
  /** The path of a page that the call acted on, shown as code after the text. */
  path?: string;
  /** The link of the path, for a call that reached its page. */
  href?: string;
  /** Words after the text, such as the title of a bridge that the call names. */
  target?: string;
  isError?: boolean;
  /** True when the text already says that the call failed, so the line adds no Error. */
  worded?: boolean;
}

export type ThreadRow =
  | { kind: 'entry'; key: string; at: string; entry: Entry }
  | { kind: 'step'; key: string; at: string; step: Step }
  | { kind: 'steps'; key: string; at: string; steps: Step[] }
  | { kind: 'live'; key: string; at: string; handle: string; text: string }
  /** The one quiet line of a run of sleep and wake pairs of one seat, at the time of its last line. */
  | { kind: 'naps'; key: string; at: string; handle: string; pairs: number; entries: Entry[] };

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

/** The words of a step of a tool of the front: done, still at work, and failed. */
const FRONT_WORDS: Record<string, [string, string, string]> = {
  fleet: ['Read the fleet', 'Reading the fleet', 'Did not read the fleet'],
  bridge_open: ['Opened the bridge', 'Opening the bridge', 'Did not open the bridge'],
  bridge_close: ['Closed the bridge', 'Closing the bridge', 'Did not close the bridge'],
  bridge_post: ['Posted to the bridge', 'Posting to the bridge', 'Did not post to the bridge'],
  bridge_read: ['Read the bridge', 'Reading the bridge', 'Did not read the bridge'],
  pages_write: ['Wrote the page', 'Writing the page', 'Did not write the page'],
  pages_read: ['Read the page', 'Reading the page', 'Did not read the page'],
  spawn_task: ['Handed off a task', 'Handing off a task', 'Did not hand off a task'],
};

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** openedBridge reads the id of the bridge that bridge_open opened from its result: "Opened the bridge <id> ...". */
export function openedBridge(result: string | undefined): string {
  const m = /\bOpened (?:the bridge )?([a-z0-9][a-z0-9_-]*)/i.exec(String(result || ''));
  return m ? m[1] : '';
}

/**
 * stepOf words one tool call as a quiet line, without a tool name where it
 * can. A tool of the front says what happened in plain words, such as
 * Opened the bridge with its title, and links the bridge or the page once
 * the call reached it. A call with no result yet says what it does now.
 */
export function stepOf(it: Item, file?: Item, result?: Item): Step {
  const base = { key: 'step-' + it.seq, at: it.time, ...(result && result.isError ? { isError: true } : {}) };
  const f = file || (it.kind === 'file' ? it : undefined);
  if (f) return { ...base, text: (f.text === 'created' ? 'Created ' : f.text === 'deleted' ? 'Removed ' : 'Edited ') + (f.path || 'a file') };
  const cmd = commandOf(it.input);
  if (cmd) return { ...base, text: 'Ran', cmd: cmd.length > 80 ? cmd.slice(0, 79) + '…' : cmd };
  const words = FRONT_WORDS[toolBase(it.tool)];
  if (!words) return { ...base, text: 'Used ' + toolName(it.tool || 'a tool') };
  const v = inputFields(it.input) || {};
  const done = !!result && !result.isError;
  const step: Step = { ...base, text: !result ? words[1] : result.isError ? words[2] : words[0], worded: true };
  switch (toolBase(it.tool)) {
    case 'bridge_open': {
      const id = done ? openedBridge(result!.text) : '';
      if (id) step.bridge = id;
      if (text(v.title)) step.target = text(v.title);
      break;
    }
    case 'bridge_close':
    case 'bridge_post':
    case 'bridge_read':
      if (text(v.bridge)) step.bridge = text(v.bridge);
      break;
    case 'pages_write':
    case 'pages_read':
      if (text(v.path)) {
        step.path = text(v.path);
        if (done) step.href = hrefOf({ place: 'pages', path: step.path, mode: 'read' });
      }
      break;
    case 'spawn_task':
      if (text(v.agent)) step.text += ' to ' + text(v.agent);
      break;
  }
  return step;
}

/**
 * placedSteps words the tool calls of a transcript, each at the item where
 * its line belongs, by the seq of that item. A call goes at its own item.
 * A call that asked for a decision goes at its result, after the decision,
 * and makes no line while it waits: the card or the line of the decision
 * says what it asks, and a line before the decision would say that the
 * call already ran.
 */
export function placedSteps(items: Item[]): Map<number, Step> {
  const results = new Map<string, Item>();
  const files = new Map<string, Item>();
  const asked = new Set<string>();
  for (const x of items) {
    if (!x.callId) continue;
    if (x.kind === 'result') results.set(x.callId, x);
    else if (x.kind === 'file') files.set(x.callId, x);
    else if (x.kind === 'ask') asked.add(x.callId);
  }
  const placed: [number, Step][] = [];
  for (const c of items) {
    if (c.kind !== 'tool') continue;
    const r = c.callId ? results.get(c.callId) : undefined;
    const f = c.callId ? files.get(c.callId) : undefined;
    let at: Item = c;
    if (c.callId && asked.has(c.callId)) {
      const after = [r, f].filter((x): x is Item => !!x).sort((a, b) => a.seq - b.seq)[0];
      if (!after) continue;
      at = after;
    }
    placed.push([at.seq, { ...stepOf(c, f, r), at: at.time }]);
  }
  placed.sort((a, b) => a[0] - b[0]);
  return new Map(placed);
}

/** stepsOf turns the tool calls of a transcript into step lines, in the order of their places, with the error of a failed call. */
export function stepsOf(items: Item[]): Step[] {
  return [...placedSteps(items).values()];
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
 * foldNaps folds a sleep line and a wake line of one seat with nothing
 * between them into one quiet row, and a run of such pairs too. A sleep
 * line that no wake line follows stays, because it says where the worker
 * is now. A fold never crosses the line of a new day.
 */
export function foldNaps(rows: ThreadRow[]): ThreadRow[] {
  const day = (r: ThreadRow) => new Date(r.at).toDateString();
  const runs = napRuns(
    rows.map((r) => (r.kind === 'entry' ? napOf(r.entry) : null)),
    (i, j) => day(rows[i]) === day(rows[j]),
  );
  if (!runs.length) return rows;
  const starts = new Map(runs.map((r) => [r[0], r]));
  const out: ThreadRow[] = [];
  for (let i = 0; i < rows.length; i++) {
    const run = starts.get(i);
    if (!run) {
      out.push(rows[i]);
      continue;
    }
    const entries = run.map((k) => (rows[k] as Extract<ThreadRow, { kind: 'entry' }>).entry);
    const end = rows[run[run.length - 1]];
    out.push({ kind: 'naps', key: 'naps-' + entries[0].seq, at: end.at, handle: napOf(entries[0])!.handle, pairs: run.length / 2, entries });
    i += run.length - 1;
  }
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
