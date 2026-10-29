// The ways out of Needs you send each answer where the server keeps it: the
// verdict of a channel goes to the channel, also when its card names the run
// of one of its agents, and the verdict of a run goes to the run. A stopped
// task and a failed job say what happened in plain words.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { WorkCard } from '../../api/types';
import { store } from '../../state/store';
import { forgetDuties } from '../../state/duties';
import { fakeApi, mount, settle, unmountAll } from '../testkit-c';
import { forgetAnswers, forgetChatData, setBoardForTest } from './data';
import { WayOut, signsChannel, stoppedWords } from './WayOut';

let api: ReturnType<typeof fakeApi> | null = null;

const card = (over: Partial<WorkCard>): WorkCard => ({
  id: 'c',
  kind: 'conversation',
  title: 'A task',
  from: { kind: 'person', name: 'alice@example.com' },
  stage: 'review',
  next: 'you',
  opened: '2026-10-28T10:00:00Z',
  since: '2026-10-28T10:00:00Z',
  agents: ['scribe'],
  parts: { total: 1 },
  links: {},
  costUSD: 0,
  ...over,
});

beforeEach(() => {
  forgetDuties();
  forgetChatData();
  forgetAnswers();
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  api = null;
});

const click = (el: HTMLElement, text: string) => {
  const b = [...el.querySelectorAll('button')].find((x) => x.textContent === text);
  expect(b, text).toBeTruthy();
  act(() => b!.click());
};

describe('the verdict of a result', () => {
  it('goes to the channel for a card of a channel that names the run of one of its agents', async () => {
    // The card of a channel names the run of one of its agents, as the front names it.
    const board = { sentence: '', lanes: [], days: 7, cards: [card({ id: 'bridge:br-1', kind: 'bridge', links: { bridge: 'br-1', run: 'run-reviewer', runs: ['run-writer', 'run-reviewer'] } })] };
    api = fakeApi({ 'POST /v1/work/review': { closed: true }, 'GET /v1/work': board, 'GET /v1/inbox': { items: [] } });
    act(() => setBoardForTest(board));
    const el = mount(<WayOut bridge="br-1" result="The draft is ready." />);
    await settle();
    click(el, 'Looks right');
    await settle();
    const post = api.calls.find((c) => c.method === 'POST' && c.path === '/v1/work/review');
    expect(post && post.body).toEqual({ bridge: 'br-1', verdict: 'up' });
    expect(el.textContent).toContain('You marked this right');
  });
  it('goes to the run for a card of a run, and for a run of a job that posts in a channel', async () => {
    const board = { sentence: '', lanes: [], days: 7, cards: [card({ id: 'duty:notes@1', kind: 'duty', links: { run: 'run-notes', duty: 'notes' } })] };
    api = fakeApi({ 'POST /v1/work/review': { kept: false }, 'GET /v1/work': board, 'GET /v1/inbox': { items: [] } });
    act(() => setBoardForTest(board));
    const el = mount(<WayOut run="run-notes" brief />);
    await settle();
    click(el, 'Looks right');
    await settle();
    const post = api.calls.find((c) => c.method === 'POST' && c.path === '/v1/work/review');
    expect(post && post.body).toEqual({ run: 'run-notes', verdict: 'up' });
    expect(signsChannel(card({ kind: 'duty', links: { run: 'r', bridge: 'br-9' } }))).toBe('');
    expect(signsChannel(card({ kind: 'bridge', links: { run: 'r', bridge: 'br-9' } }))).toBe('br-9');
    expect(signsChannel(undefined, 'br-9', '')).toBe('br-9');
  });
});

describe('a stopped task and a failed job', () => {
  it('says why a task stopped in plain words, never the name of a limit', () => {
    expect(stoppedWords('The run reached its limit of maxTurns.', '', 1)).toBe('Stopped after 1 step: it reached its limit of turns.');
    expect(stoppedWords('', 'budget exceeded: maxToolCalls', 3)).toBe('Stopped after 3 steps: it reached its limit of tool calls.');
    expect(stoppedWords('Stopped at its turn limit.', '', undefined)).toBe('Stopped: it reached its limit of turns.');
    expect(stoppedWords('Its worker was replaced before it ended.', '', 0)).toBe('Stopped before its first step: the agent that held it was replaced before it ended.');
  });
  it('offers Run again and Pause on a failed job, from its ways out or by default', async () => {
    api = fakeApi({
      'GET /v1/inbox': { items: [{ kind: 'failure', run: 'r1', duty: 'status', agent: 'walk', text: 'The job status: The run failed: not done: check 1 failed.', since: '2026-10-29T02:09:08Z' }] },
      'POST /v1/duties/status/run': { run: 'r2' },
      'GET /v1/duties/status': { name: 'status', agent: 'walk', when: {}, do: {}, limits: {} },
      'GET /v1/work': { sentence: '', lanes: [], cards: [], days: 7 },
    });
    const { loadInbox } = await import('../../state/duties');
    await act(async () => {
      await loadInbox();
    });
    const el = mount(<WayOut duty="status" brief />);
    await settle();
    expect(el.textContent).toContain('Failed');
    expect(el.textContent).toContain('The run failed: not done: check 1 failed.');
    click(el, 'Run again');
    await settle();
    expect(api.calls.some((c) => c.method === 'POST' && c.path === '/v1/duties/status/run')).toBe(true);
    expect(el.textContent).toContain('You ran it again');
  });
});
