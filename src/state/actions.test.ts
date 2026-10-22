import { afterEach, describe, expect, it } from 'vitest';
import { setFetch, type FetchLike } from '../api/client';
import type { Entry, StreamEvent } from '../api/types';
import { completeEvent } from './actions';

const card = (partial: boolean): Entry => ({
  seq: 37,
  at: '2026-10-21T20:13:00Z',
  from: { kind: 'system' },
  text: 'migrator-2 wants to run a command.',
  event: 'needs-you',
  decision: partial
    ? { run: 'r1', id: 'ap1', label: 'Run command', state: 'pending' }
    : { run: 'r1', id: 'ap1', label: 'Run command', state: 'pending', input: { command: 'git push' } },
  ...(partial ? { partial: true } : {}),
});

const event = (message: Entry): StreamEvent => ({ id: '9', kind: 'bridge.message', data: { bridge: 'br-1', message } });

let old: FetchLike | null = null;
afterEach(() => {
  if (old) setFetch(old);
  old = null;
});

function answer(body: unknown, status = 200, seen: string[] = []): void {
  old = setFetch(async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('completeEvent', () => {
  it('passes a whole entry and other kinds as they are', async () => {
    const e = event(card(false));
    expect(await completeEvent(e)).toBe(e);
    const r: StreamEvent = { id: '1', kind: 'run', data: { id: 'r1' } };
    expect(await completeEvent(r)).toBe(r);
  });

  it('reads a partial entry again with from and limit 1', async () => {
    const seen: string[] = [];
    answer({ bridge: 'br-1', messages: [card(false)], next: 0, prev: 36 }, 200, seen);
    const out = await completeEvent(event(card(true)));
    expect(seen).toEqual(['/v1/bridges/br-1/messages?from=37&limit=1']);
    expect(out && (out.data as { message: Entry }).message.decision!.input).toEqual({ command: 'git push' });
    expect(out!.id).toBe('9');
  });

  it('drops the event when the read fails or answers another entry', async () => {
    answer({ title: 'Not Found', status: 404 }, 404);
    expect(await completeEvent(event(card(true)))).toBeNull();
    setFetch(old!);
    answer({ bridge: 'br-1', messages: [{ ...card(false), seq: 38 }], next: 0, prev: 0 });
    expect(await completeEvent(event(card(true)))).toBeNull();
  });
});
