import { describe, expect, it } from 'vitest';
import { SseParser, openStream, toEvent } from './stream';
import type { StreamEvent } from './types';

describe('SseParser', () => {
  it('reads id, event, and data, and ends a message on a blank line', () => {
    const p = new SseParser();
    const out = p.feed('id: 7\nevent: bridge.message\ndata: {"a":1}\n\n');
    expect(out).toEqual([{ id: '7', event: 'bridge.message', data: '{"a":1}' }]);
    expect(p.lastId).toBe('7');
  });

  it('joins data lines and reads a message split over chunks', () => {
    const p = new SseParser();
    expect(p.feed('event: page\ndata: {"pa')).toEqual([]);
    expect(p.feed('th":"a.md",\ndata: "x":2}\n')).toEqual([]);
    expect(p.feed('\n')).toEqual([{ id: '', event: 'page', data: '{"path":"a.md",\n"x":2}' }]);
  });

  it('takes CR LF and CR as line ends, also when a chunk ends between them', () => {
    const p = new SseParser();
    expect(p.feed('id: 1\r\ndata: a\r')).toEqual([]);
    expect(p.feed('\n\r\n')).toEqual([{ id: '1', event: 'message', data: 'a' }]);
    expect(p.feed('data: b\r\r')).toEqual([{ id: '1', event: 'message', data: 'b' }]);
  });

  it('skips comments and keeps the last id for the next message', () => {
    const p = new SseParser();
    const out = p.feed(': keep-alive\n\nid: 9\ndata: x\n\ndata: y\n\n');
    expect(out.map((m) => [m.id, m.data])).toEqual([
      ['9', 'x'],
      ['9', 'y'],
    ]);
  });

  it('reads retry and ignores an unknown field', () => {
    const p = new SseParser();
    p.feed('retry: 3000\nfoo: bar\n\n');
    expect(p.retry).toBe(3000);
  });

  it('drops data that is not JSON', () => {
    expect(toEvent({ id: '1', event: 'run', data: 'not json' })).toBeNull();
    expect(toEvent({ id: '1', event: 'reset', data: '' })).toEqual({ id: '1', kind: 'reset', data: null });
  });
});

/** stream builds an answer whose body yields the chunks, then ends. */
function stream(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      const e = new TextEncoder();
      for (const s of chunks) c.enqueue(e.encode(s));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('openStream', () => {
  it('connects again with Last-Event-ID after the stream ends', async () => {
    sessionStorage.setItem('fw.token', 'tok');
    const heads: Record<string, string>[] = [];
    const events: StreamEvent[] = [];
    let n = 0;
    let finish!: () => void;
    const done = new Promise<void>((r) => (finish = r));
    const h = openStream({
      onEvent: (e) => events.push(e),
      backoff: [1],
      sleep: () => Promise.resolve(),
      fetch: async (_url, init) => {
        heads.push(init!.headers as Record<string, string>);
        n++;
        if (n === 1) return stream(['id: 4\nevent: run\ndata: {"id":"r1","seq":3}\n\n']);
        if (n === 2) return stream(['id: 5\nevent: face\ndata: {"agent":"reviewer"}\n\n']);
        finish();
        return new Promise<Response>(() => {});
      },
    });
    await done;
    h.close();
    expect(events.map((e) => [e.id, e.kind])).toEqual([
      ['4', 'run'],
      ['5', 'face'],
    ]);
    expect(heads[0]['Last-Event-ID']).toBeUndefined();
    expect(heads[0].Authorization).toBe('Bearer tok');
    expect(heads[0].Accept).toBe('text/event-stream');
    expect(heads[1]['Last-Event-ID']).toBe('4');
    expect(heads[2]['Last-Event-ID']).toBe('5');
    expect(h.lastId()).toBe('5');
  });

  it('connects again at once and stays live after a routine close', async () => {
    const statuses: string[] = [];
    const heads: Record<string, string>[] = [];
    const slept: number[] = [];
    let clock = 0;
    let n = 0;
    await new Promise<void>((resolve) => {
      openStream({
        onEvent: () => {},
        onStatus: (s) => statuses.push(s),
        now: () => clock,
        sleep: async (ms) => {
          slept.push(ms);
        },
        fetch: async (_url, init) => {
          heads.push(init!.headers as Record<string, string>);
          n++;
          if (n === 1) {
            // The front closes the stream after 15 minutes.
            clock += 15 * 60_000;
            return stream(['id: 1761000000000001\nevent: run\ndata: {"id":"r1","seq":1}\n\n']);
          }
          resolve();
          return new Promise<Response>(() => {});
        },
      });
    });
    expect(statuses).toEqual(['connecting', 'live']);
    expect(slept).toEqual([]);
    expect(heads[1]['Last-Event-ID']).toBe('1761000000000001');
  });

  it('waits before it connects again when a stream closes at once', async () => {
    const statuses: string[] = [];
    const slept: number[] = [];
    let n = 0;
    await new Promise<void>((resolve) => {
      openStream({
        onEvent: () => {},
        onStatus: (s) => statuses.push(s),
        now: () => 0,
        backoff: [7],
        sleep: async (ms) => {
          slept.push(ms);
        },
        fetch: async () => {
          n++;
          if (n === 1) return stream([': hello\n\n']);
          resolve();
          return new Promise<Response>(() => {});
        },
      });
    });
    expect(slept).toEqual([7]);
    expect(statuses).toContain('lost');
  });

  it('stops on a 401 and reports it', async () => {
    let calls = 0;
    const statuses: string[] = [];
    const got = await new Promise<string>((resolve) => {
      openStream({
        onEvent: () => {},
        onStatus: (s) => statuses.push(s),
        onUnauthorized: (e) => resolve(e.signinUrl),
        sleep: () => Promise.resolve(),
        fetch: async () => {
          calls++;
          return new Response(JSON.stringify({ status: 401, signin: '/ui/signin' }), { status: 401 });
        },
      });
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(got).toBe('/ui/signin');
    expect(calls).toBe(1);
    expect(statuses[statuses.length - 1]).toBe('closed');
  });

  it('names the build of the page that the front serves at each start of the stream', async () => {
    const builds: string[] = [];
    let n = 0;
    await new Promise<void>((resolve) => {
      openStream({
        onEvent: () => {},
        onBuild: (b) => builds.push(b),
        backoff: [1],
        sleep: () => Promise.resolve(),
        fetch: async () => {
          n++;
          if (n === 1) return new Response(new ReadableStream({ start: (c) => c.close() }), { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Fw-Page-Build': 'bf5ebeab9889130a' } });
          if (n === 2) return stream([]);
          resolve();
          return new Promise<Response>(() => {});
        },
      });
    });
    // A front without the header names no build.
    expect(builds).toEqual(['bf5ebeab9889130a', '']);
  });

  it('tries again after a failed answer', async () => {
    let calls = 0;
    const statuses: string[] = [];
    await new Promise<void>((resolve) => {
      openStream({
        onEvent: () => {},
        onStatus: (s) => statuses.push(s),
        sleep: () => Promise.resolve(),
        fetch: async () => {
          calls++;
          if (calls < 3) return new Response('{}', { status: 503 });
          resolve();
          return new Promise<Response>(() => {});
        },
      });
    });
    expect(calls).toBe(3);
    expect(statuses).toContain('lost');
  });
});
