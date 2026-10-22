// The helpers of the tests of Screen A: a mount that cleans up, a fake
// fetch that answers by route, and the sample shapes of a bridge. The
// build never imports this file.

import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { setFetch, type FetchLike } from '../api/client';
import type { Bridge, Entry, Member } from '../api/types';

const boxes: HTMLElement[] = [];

/** mount draws a node into a new box of the document. */
export function mount(node: ComponentChildren): HTMLElement {
  const box = document.createElement('div');
  document.body.appendChild(box);
  boxes.push(box);
  act(() => {
    render(node, box);
  });
  return box;
}

/** unmountAll removes every box of mount. */
export function unmountAll(): void {
  while (boxes.length) {
    const b = boxes.pop()!;
    act(() => render(null, b));
    b.remove();
  }
}

export interface Seen {
  method: string;
  path: string;
  body: unknown;
}

/**
 * fakeFetch answers each call with the first route whose method and path
 * match, and records every call. A route answers a value as JSON, or null
 * for 204. A call with no route answers 404.
 */
export function fakeFetch(routes: [string, RegExp, (body: unknown, path: string) => unknown][]): { seen: Seen[]; restore: () => void } {
  const seen: Seen[] = [];
  const old: FetchLike = setFetch(async (input, init) => {
    const method = (init && init.method) || 'GET';
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    seen.push({ method, path: input, body });
    for (const [m, re, f] of routes) {
      if (m === method && re.test(input)) {
        const out = f(body, input);
        if (out === null) return new Response(null, { status: 204 });
        return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ title: 'Not Found', status: 404, detail: 'no route ' + input }), { status: 404, headers: { 'Content-Type': 'application/problem+json' } });
  });
  return { seen, restore: () => setFetch(old) };
}

export function bridgeOf(id: string, over: Partial<Bridge> = {}): Bridge {
  return {
    id,
    title: 'Bridge ' + id,
    goal: 'Migrate the logrotate module. Then test it.',
    operator: 'alice@example.com',
    state: 'open',
    placement: 'queue',
    createdAt: '2026-10-21T10:00:00Z',
    closedAt: null,
    delegation: { approve: false, budget: false, members: false, report: true },
    caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6 },
    lastSeq: 0,
    read: 0,
    unread: 0,
    ...over,
  };
}

export function memberOf(handle: string, over: Partial<Member> = {}): Member {
  return { handle, agent: handle.replace(/-\d+$/, ''), task: 'Do the work of ' + handle, runs: ['run-' + handle], fired: false, muted: false, presence: 'idle', activity: null, ...over };
}

export function entryOf(seq: number, over: Partial<Entry> & Record<string, unknown> = {}): Entry {
  return { seq, at: new Date(Date.now() - (100 - seq) * 60_000).toISOString(), from: { kind: 'agent', handle: 'migrator-1', run: 'run-migrator-1' }, to: [], replyTo: null, text: 'message ' + seq, reactions: { up: [], down: [], heart: [] }, decision: null, ...over } as Entry;
}

/** settle waits for the promises of the page and draws again. */
export async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
