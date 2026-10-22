// The live answer of one run, from GET /v1/runs/{id}/live. The kernel sends
// the text of the answer as the model produces it, as server-sent events
// without ids: delta {turn, text}, tool {turn, name, callId}, done {turn,
// stopReason}, and idle {state}. Nothing of it is in the ledger, so a client
// that connects again gets the pieces from then on, with no replay.
//
// Only a one-on-one view opens it: the quick chat, the manager, an agent
// that sits on no bridge, and the Chat tab of a seat. The bridge channel,
// the inbox of Activity, and the board never do, because a group view with
// many answers that grow at once is too much to read.
//
// The file has two parts. openLive is the transport: it reads the stream
// with fetch and the bearer token, connects again after a clean close while
// the run works, and stops on idle, on a 429, and when the view closes. The
// pending answer is pure state: liveStep applies an event, and settle drops
// the part whose real item the view now holds.

import { ApiError, enc, send } from './client';
import { SseParser, QUIET_MS, type SseMessage } from './stream';

export type LiveEvent =
  | { kind: 'delta'; turn: number; text: string }
  | { kind: 'tool'; turn: number; name: string; callId: string }
  | { kind: 'done'; turn: number; stopReason: string }
  | { kind: 'idle'; state: string };

/** The stop reason of a model call that ends with a tool call. */
export const TOOL_USE = 'tool_use';
/** The stop reason of a model call that failed. */
export const CALL_FAILED = 'error';

/**
 * parseLive reads one message of the live stream. A message of an unknown
 * kind, data that is not JSON, and a delta without text give null. The
 * kind error, for a model call that failed, reads as done with the stop
 * reason error.
 */
export function parseLive(m: SseMessage): LiveEvent | null {
  let d: Record<string, unknown> = {};
  if (m.data) {
    try {
      const v = JSON.parse(m.data);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
      d = v as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  const turn = typeof d.turn === 'number' ? d.turn : 0;
  switch (m.event) {
    case 'delta':
      return typeof d.text === 'string' && d.text ? { kind: 'delta', turn, text: d.text } : null;
    case 'tool':
      return { kind: 'tool', turn, name: typeof d.name === 'string' ? d.name : '', callId: typeof d.callId === 'string' ? d.callId : '' };
    case 'done':
      return { kind: 'done', turn, stopReason: typeof d.stopReason === 'string' ? d.stopReason : '' };
    case 'error':
      return { kind: 'done', turn, stopReason: CALL_FAILED };
    case 'idle':
      return { kind: 'idle', state: typeof d.state === 'string' ? d.state : '' };
  }
  return null;
}

/* ---------- the transport ---------- */

/**
 * Why a live stream stopped for good: idle, the run left the running
 * state; ended, the stream closed and the run no longer works; busy, the
 * run has as many live clients as it takes (429); gone, the route answered
 * another error, such as a 404 of a workbench without it; closed, the view
 * closed it.
 */
export type LiveEnd = 'idle' | 'ended' | 'busy' | 'gone' | 'closed';

export interface LiveOptions {
  run: string;
  onEvent: (e: LiveEvent) => void;
  onEnd?: (why: LiveEnd) => void;
  /** working reports whether the run still works. The client reads it after a clean close or a lost connection. */
  working: () => boolean;
  /** The waits between attempts after a lost connection, in milliseconds. A test sets them short. */
  backoff?: number[];
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface LiveHandle {
  close(): void;
}

const BACKOFF = [1000, 2000, 4000, 8000];

let opened = 0;

/** liveCount is the number of live streams that are open now, for the tests that check that a view opens none. */
export function liveCount(): number {
  return opened;
}

let everOpened = 0;

/** liveOpens is the number of live streams that the page opened since it loaded, for the tests. */
export function liveOpens(): number {
  return everOpened;
}

/**
 * openLive reads the live stream of a run until it stops. After a clean
 * close, it connects again at once while the run works, unless the stream
 * lived less than QUIET_MS: then it waits first, so a server that closes at
 * once never makes a tight loop. A lost connection or a 5xx waits and
 * tries again while the run works. idle, a 429, and any other error answer
 * stop it, and so does close.
 */
export function openLive(o: LiveOptions): LiveHandle {
  const ctl = new AbortController();
  const backoff = o.backoff || BACKOFF;
  const sleep = o.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now || (() => Date.now());
  let stopped = false;
  opened++;
  everOpened++;

  const stop = (why: LiveEnd) => {
    if (stopped) return;
    stopped = true;
    opened--;
    ctl.abort();
    if (o.onEnd) o.onEnd(why);
  };

  /** once reads one connection. It answers idle when the run left the running state, and clean when the stream ended. */
  async function once(): Promise<'idle' | 'clean'> {
    const res = await send('/v1/runs/' + enc(o.run) + '/live', { accept: 'text/event-stream', signal: ctl.signal });
    if (!res.body) return 'clean';
    const parser = new SseParser();
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return 'clean';
        for (const m of parser.feed(value)) {
          const e = parseLive(m);
          if (!e || stopped) continue;
          o.onEvent(e);
          if (e.kind === 'idle') return 'idle';
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  (async () => {
    let fails = 0;
    while (!stopped) {
      const start = now();
      let out: 'idle' | 'clean' | 'lost';
      try {
        out = await once();
      } catch (e) {
        if (stopped) return;
        if (e instanceof ApiError && e.status === 429) return stop('busy');
        if (e instanceof ApiError && e.status > 0 && e.status < 500) return stop('gone');
        out = 'lost';
      }
      if (stopped) return;
      if (out === 'idle') return stop('idle');
      if (!o.working()) return stop('ended');
      if (out === 'clean' && now() - start >= QUIET_MS) {
        fails = 0;
        continue;
      }
      fails++;
      await sleep(backoff[Math.min(fails - 1, backoff.length - 1)]);
    }
  })();

  return { close: () => stop('closed') };
}

/* ---------- the pending answer ---------- */

/**
 * A segment is the text of one model call while the model writes it. mark
 * is the newest seq that the view held when the segment began, so an item
 * of the answer with a higher seq is the real item of the segment.
 */
export interface Segment {
  turn: number;
  text: string;
  done: boolean;
  mark: number;
}

/** LiveView is the pending answer at the end of a thread, and the tool that the model calls now. */
export interface LiveView {
  segments: Segment[];
  tool: string;
}

export const NO_LIVE: LiveView = { segments: [], tool: '' };

/**
 * liveStep applies one event to the pending answer. A delta grows the
 * segment of its turn, or starts a new one. A tool names the tool that the
 * model calls, until the call ends. done ends the segment of its turn: a
 * segment with no text goes, a call that failed takes its text with it, and
 * with dropPreamble so does the text before a tool call, for a view that
 * shows only the final answer. idle ends every segment.
 */
export function liveStep(v: LiveView, e: LiveEvent, mark: number, dropPreamble = false): LiveView {
  switch (e.kind) {
    case 'delta': {
      const last = v.segments[v.segments.length - 1];
      if (last && !last.done && last.turn === e.turn) return { ...v, segments: [...v.segments.slice(0, -1), { ...last, text: last.text + e.text }] };
      return { ...v, segments: [...v.segments, { turn: e.turn, text: e.text, done: false, mark }] };
    }
    case 'tool':
      return e.name && e.name !== v.tool ? { ...v, tool: e.name } : v;
    case 'done': {
      const drop = e.stopReason === CALL_FAILED || (dropPreamble && e.stopReason === TOOL_USE);
      const segments = v.segments
        .filter((s) => !(s.turn === e.turn && !s.done && drop))
        .map((s) => (s.turn === e.turn && !s.done ? { ...s, done: true } : s))
        .filter((s) => s.text.trim() !== '');
      return { segments, tool: '' };
    }
    case 'idle':
      return { segments: v.segments.filter((s) => s.text.trim() !== '').map((s) => (s.done ? s : { ...s, done: true })), tool: '' };
  }
  return v;
}

/**
 * settle replaces the pending answer with the real items once they arrive.
 * answers are the seqs of the items of the answer that the view holds, such
 * as the assistant items of a transcript. Each segment that is done takes
 * the first unused seq above its mark, in order, and leaves the pending
 * answer. A segment that the model still writes has no item yet.
 */
export function settle(v: LiveView, answers: number[]): LiveView {
  if (!v.segments.length) return v;
  const seqs = [...answers].sort((a, b) => a - b);
  let i = 0;
  const keep: Segment[] = [];
  for (const s of v.segments) {
    while (i < seqs.length && seqs[i] <= s.mark) i++;
    if (s.done && i < seqs.length) {
      i++;
      continue;
    }
    keep.push(s);
  }
  return keep.length === v.segments.length ? v : { ...v, segments: keep };
}

/** liveText is the text of the pending answer: its segments, one paragraph each. */
export function liveText(v: LiveView): string {
  return v.segments.map((s) => s.text).join('\n\n');
}
