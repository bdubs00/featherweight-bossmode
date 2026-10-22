import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setFetch, type FetchLike } from './client';
import { NO_LIVE, liveCount, liveStep, liveText, openLive, parseLive, settle, type LiveEnd, type LiveEvent } from './live';

const msg = (event: string, data: string) => ({ id: '', event, data });

describe('parseLive', () => {
  it('reads the four kinds of the live stream', () => {
    expect(parseLive(msg('delta', '{"turn":2,"text":"Two roles"}'))).toEqual({ kind: 'delta', turn: 2, text: 'Two roles' });
    expect(parseLive(msg('tool', '{"turn":2,"name":"bash","callId":"c1"}'))).toEqual({ kind: 'tool', turn: 2, name: 'bash', callId: 'c1' });
    expect(parseLive(msg('done', '{"turn":2,"stopReason":"end_turn"}'))).toEqual({ kind: 'done', turn: 2, stopReason: 'end_turn' });
    expect(parseLive(msg('idle', '{"state":"completed"}'))).toEqual({ kind: 'idle', state: 'completed' });
  });

  it('reads error as a done that failed, and drops data that is not JSON, an unknown kind, and an empty delta', () => {
    expect(parseLive(msg('error', '{"turn":3}'))).toEqual({ kind: 'done', turn: 3, stopReason: 'error' });
    expect(parseLive(msg('delta', 'not json'))).toBeNull();
    expect(parseLive(msg('delta', '{"turn":1,"text":""}'))).toBeNull();
    expect(parseLive(msg('page', '{}'))).toBeNull();
    expect(parseLive(msg('delta', '[1]'))).toBeNull();
  });
});

describe('the pending answer', () => {
  const ev = (e: LiveEvent) => e;

  it('appends the pieces of one model call, and starts a new segment for the next call', () => {
    let v = liveStep(NO_LIVE, ev({ kind: 'delta', turn: 1, text: 'I read ' }), 10);
    v = liveStep(v, ev({ kind: 'delta', turn: 1, text: 'the module.' }), 11);
    expect(liveText(v)).toBe('I read the module.');
    expect(v.segments).toEqual([{ turn: 1, text: 'I read the module.', done: false, mark: 10 }]);
    v = liveStep(v, ev({ kind: 'tool', turn: 1, name: 'files', callId: 'c1' }), 11);
    expect(v.tool).toBe('files');
    v = liveStep(v, ev({ kind: 'done', turn: 1, stopReason: 'tool_use' }), 11);
    expect(v.tool).toBe('');
    v = liveStep(v, ev({ kind: 'delta', turn: 2, text: 'Done.' }), 12);
    expect(v.segments.map((s) => [s.turn, s.done, s.mark])).toEqual([
      [1, true, 10],
      [2, false, 12],
    ]);
    expect(liveText(v)).toBe('I read the module.\n\nDone.');
  });

  it('drops a call that failed, a call with no text, and with dropPreamble the text before a tool call', () => {
    const one = liveStep(NO_LIVE, ev({ kind: 'delta', turn: 1, text: 'Let me look.' }), 4);
    expect(liveStep(one, ev({ kind: 'done', turn: 1, stopReason: 'error' }), 4).segments).toEqual([]);
    expect(liveStep(one, ev({ kind: 'done', turn: 1, stopReason: 'tool_use' }), 4, true).segments).toEqual([]);
    expect(liveStep(one, ev({ kind: 'done', turn: 1, stopReason: 'tool_use' }), 4).segments.length).toBe(1);
    expect(liveStep(NO_LIVE, ev({ kind: 'done', turn: 1, stopReason: 'end_turn' }), 4).segments).toEqual([]);
    const idle = liveStep(one, ev({ kind: 'idle', state: 'input-required' }), 4);
    expect(idle.segments[0].done).toBe(true);
  });

  it('replaces each finished segment with the first real item above its mark, in order', () => {
    let v = liveStep(NO_LIVE, ev({ kind: 'delta', turn: 1, text: 'One.' }), 10);
    v = liveStep(v, ev({ kind: 'done', turn: 1, stopReason: 'tool_use' }), 10);
    v = liveStep(v, ev({ kind: 'delta', turn: 2, text: 'Two.' }), 10);
    // An answer of before the mark replaces nothing.
    expect(settle(v, [8])).toBe(v);
    // The item of the first call replaces it. The second call still writes, so it stays.
    const s1 = settle(v, [8, 12]);
    expect(liveText(s1)).toBe('Two.');
    const s2 = settle(liveStep(s1, ev({ kind: 'done', turn: 2, stopReason: 'end_turn' }), 13), [8, 12, 15]);
    expect(s2.segments).toEqual([]);
  });
});

/** A live stream whose pieces a test pushes, and which it can end. */
function pushable() {
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctl = c;
    },
  });
  const e = new TextEncoder();
  return {
    res: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    push: (s: string) => ctl.enqueue(e.encode(s)),
    end: () => ctl.close(),
  };
}

const problem = (status: number) => new Response(JSON.stringify({ status, detail: 'no' }), { status, headers: { 'Content-Type': 'application/problem+json' } });

describe('openLive', () => {
  let old: FetchLike;
  let asked: { path: string; headers: Record<string, string> }[] = [];
  let answers: (() => Response)[] = [];
  beforeEach(() => {
    asked = [];
    answers = [];
    sessionStorage.setItem('fw.token', 'tok');
    old = setFetch(async (input, init) => {
      asked.push({ path: String(input), headers: (init && (init.headers as Record<string, string>)) || {} });
      const next = answers.shift();
      return next ? next() : new Promise<Response>(() => {});
    });
  });
  afterEach(() => {
    setFetch(old);
  });

  const start = (working: () => boolean, now = () => 0) => {
    const events: LiveEvent[] = [];
    const ends: LiveEnd[] = [];
    const h = openLive({ run: 'run 1', working, onEvent: (e) => events.push(e), onEnd: (w) => ends.push(w), backoff: [1], sleep: () => Promise.resolve(), now });
    return { events, ends, h };
  };

  it('reads the route of the run with the bearer token and hands each event over', async () => {
    const s = pushable();
    answers.push(() => s.res);
    const { events, h } = start(() => true);
    await vi.waitFor(() => expect(asked.length).toBe(1));
    expect(asked[0].path).toBe('/v1/runs/run%201/live');
    expect(asked[0].headers.Authorization).toBe('Bearer tok');
    expect(asked[0].headers.Accept).toBe('text/event-stream');
    s.push(': keep-alive\n\nevent: delta\ndata: {"turn":1,"text":"Hi"}\n\n');
    s.push('event: tool\ndata: {"turn":1,"name":"bash","callId":"c"}\n\n');
    await vi.waitFor(() => expect(events.map((e) => e.kind)).toEqual(['delta', 'tool']));
    expect(liveCount()).toBe(1);
    h.close();
    expect(liveCount()).toBe(0);
  });

  it('connects again after a clean close while the run works, and stops once it works no more', async () => {
    let working = true;
    let t = 0;
    const a = pushable();
    const b = pushable();
    answers.push(() => a.res, () => b.res);
    const { events, ends } = start(() => working, () => (t += 6000));
    await vi.waitFor(() => expect(asked.length).toBe(1));
    a.push('event: delta\ndata: {"turn":1,"text":"One"}\n\n');
    a.end();
    await vi.waitFor(() => expect(asked.length).toBe(2));
    b.push('event: delta\ndata: {"turn":1,"text":" two"}\n\n');
    await vi.waitFor(() => expect(events.length).toBe(2));
    working = false;
    b.end();
    await vi.waitFor(() => expect(ends).toEqual(['ended']));
    expect(asked.length).toBe(2);
  });

  it('stops on idle and connects no more', async () => {
    const s = pushable();
    answers.push(() => s.res);
    const { events, ends } = start(() => true);
    await vi.waitFor(() => expect(asked.length).toBe(1));
    s.push('event: done\ndata: {"turn":1,"stopReason":"end_turn"}\n\nevent: idle\ndata: {"state":"completed"}\n\n');
    await vi.waitFor(() => expect(ends).toEqual(['idle']));
    expect(events.map((e) => e.kind)).toEqual(['done', 'idle']);
    await new Promise((r) => setTimeout(r, 5));
    expect(asked.length).toBe(1);
    expect(liveCount()).toBe(0);
  });

  it('stops on a 429 as busy, and on a 404 as gone, with no second try', async () => {
    answers.push(() => problem(429));
    const busy = start(() => true);
    await vi.waitFor(() => expect(busy.ends).toEqual(['busy']));
    answers.push(() => problem(404));
    const gone = start(() => true);
    await vi.waitFor(() => expect(gone.ends).toEqual(['gone']));
    expect(asked.length).toBe(2);
  });

  it('tries again after a lost connection while the run works', async () => {
    const s = pushable();
    answers.push(() => {
      throw new TypeError('lost');
    });
    answers.push(() => s.res);
    const { ends, h } = start(() => true);
    await vi.waitFor(() => expect(asked.length).toBe(2));
    expect(ends).toEqual([]);
    h.close();
    expect(ends).toEqual(['closed']);
  });
});
