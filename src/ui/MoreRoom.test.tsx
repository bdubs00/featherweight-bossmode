// A chat that stopped at a limit of its budget offers Continue with more
// room, through the route that changes the limits of a run (L11 of the
// walk of Work, 2026-10-28).

import { afterEach, describe, expect, it } from 'vitest';
import type { Run } from '../api/types';
import { GO_ON, MoreRoom, roomOf } from './MoreRoom';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll } from './testkit-c';

const T = '2026-10-28T09:00:00Z';
const limited = (error: string, usage: Run['usage'] = {}): Run => ({ id: 'run-chat-4', agent: 'chat', state: 'failed', error, usage, seq: 4, createdAt: T, updatedAt: T });

let api: ReturnType<typeof fakeApi> | null = null;
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  api = null;
});

describe('roomOf', () => {
  it('gives the same room again for a limit that the usage measures, and asks for a cost', () => {
    expect(roomOf(limited('budget exceeded: maxTurns', { turns: 8 }))).toEqual({ change: { maxTurns: 16 }, words: '8 more turns' });
    expect(roomOf(limited('budget exceeded: maxToolCalls', { toolCalls: 1 }))).toEqual({ change: { maxToolCalls: 2 }, words: '1 more tool call' });
    expect(roomOf(limited('budget exceeded: maxTokens', { inputTokens: 30000, outputTokens: 2000, cacheReadTokens: 9000 }))).toEqual({ change: { maxTokens: 64000 }, words: 'about 32,000 more tokens' });
    expect(roomOf(limited('budget exceeded: maxCostUSD', { costUSD: 0.12 }))).toEqual({ cost: true });
  });
  it('gives nothing for a limit that the page cannot measure, and for a run at no limit', () => {
    expect(roomOf(limited('budget exceeded: deadline'))).toBeNull();
    expect(roomOf(limited('budget exceeded: maxTurns', {}))).toBeNull();
    expect(roomOf(limited('model: 529 overloaded'))).toBeNull();
    expect(roomOf({ ...limited('budget exceeded: maxTurns', { turns: 3 }), state: 'completed' })).toBeNull();
  });
});

describe('MoreRoom', () => {
  it('says the limit and continues the chat with more room: the budget first, then the follow-up', async () => {
    const run = limited('budget exceeded: maxTurns', { turns: 8 });
    api = fakeApi({
      'PATCH /v1/runs/run-chat-4/budget': { budget: { maxTurns: 16 } },
      'POST /v1/runs/run-chat-4/messages': { status: 202, body: { run: 'run-chat-4', seq: 5 } },
      'GET /v1/runs/run-chat-4': { ...run, state: 'running', error: undefined },
    });
    const el = mount(<MoreRoom run={run} next="Your next message starts a new chat." />);
    expect(el.querySelector('.tline-text')!.textContent).toBe('Stopped at its turn limit. Your next message starts a new chat.');
    expect(el.textContent).toContain('It gets 8 more turns and goes on where it stopped.');
    click(keyNamed(el, 'Continue with more room'));
    await settle();
    expect(api.calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.path, c.body])).toEqual([
      ['PATCH', '/v1/runs/run-chat-4/budget', { maxTurns: 16 }],
      ['POST', '/v1/runs/run-chat-4/messages', { content: GO_ON }],
    ]);
  });

  it('asks the most that a run at its cost limit can cost in all, and fills no amount', async () => {
    const run = limited('budget exceeded: maxCostUSD', { costUSD: 0.12 });
    api = fakeApi({
      'PATCH /v1/runs/run-chat-4/budget': { budget: { maxCostUSD: 0.5 } },
      'POST /v1/runs/run-chat-4/messages': { status: 202, body: { run: 'run-chat-4', seq: 5 } },
      'GET /v1/runs/run-chat-4': { ...run, state: 'running' },
    });
    const el = mount(<MoreRoom run={run} next="Your next message starts a new chat." />);
    const field = el.querySelector('.more-room input') as HTMLInputElement;
    expect(field.value).toBe('');
    click(keyNamed(el, 'Continue with more room'));
    await settle();
    expect(el.textContent).toContain('Say the most that it can cost in all, such as 0.50.');
    typeIn(field, '0.10');
    click(keyNamed(el, 'Continue with more room'));
    await settle();
    expect(el.textContent).toContain('Say more than it spent so far: $0.12.');
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false);
    typeIn(field, '0.50');
    click(keyNamed(el, 'Continue with more room'));
    await settle();
    expect(api.calls.find((c) => c.method === 'PATCH')!.body).toEqual({ maxCostUSD: 0.5 });
  });

  it('offers no key for a limit that it cannot measure', () => {
    const el = mount(<MoreRoom run={limited('budget exceeded: deadline')} next="Your next message starts a new chat." />);
    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).toBe('Stopped at its time limit. Your next message starts a new chat.');
  });
});
