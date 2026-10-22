// The live answer streams only in a one-on-one view. These tests follow it
// in the quick chat, and check that the bridge channel, the inbox of
// Activity, and the board never open a live stream.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Entry, Run } from '../api/types';
import { liveCount, liveOpens } from '../api/live';
import { store } from '../state/store';
import { ChatMain, forgetChat } from './Chat';
import { Channel } from './Channel';
import { ActivityList, ActivityMain } from './Activity';
import { Board } from './Board';
import { at, bridge, fakeFetch, mount, run, seat, seedFleet, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

const ME = 'alice@example.com';
/** Each test has a run of its own, because the store keeps the runs of the test before. */
let n = 0;
let RUN: Run;
const runOf = (id: string): Run => ({ id, agent: 'chat', title: 'Rotate the logs', state: 'running', seq: 1, input: 'Rotate the logs?', principal: ME, metadata: { 'fw.view': 'quickchat' }, createdAt: at(1), updatedAt: at(1) });

/** push sends a piece of the live stream while it is open; status answers the next connection. */
let push = (_: string) => {};
let status = 200;
const liveStream = () => {
  if (status !== 200) return new Response(JSON.stringify({ status, detail: 'the run has 16 live clients' }), { status, headers: { 'Content-Type': 'application/problem+json' } });
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        const e = new TextEncoder();
        push = (s) => c.enqueue(e.encode(s));
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
};

let finished = false;

beforeEach(() => {
  forgetChat();
  RUN = runOf('run-live-' + ++n);
  finished = false;
  status = 200;
  const f = fakeFetch([
    ['GET', /\/live$/, liveStream],
    ['GET', /^\/v1\/tools$/, () => ({ tools: [] })],
    ['GET', /^\/v1\/agents\/chat$/, () => ({ name: 'chat', role: 'operator', tools: ['files'], skills: [] })],
    ['GET', /^\/v1\/runs\/run-live-\d+$/, () => (finished ? { ...RUN, state: 'completed', seq: 3, output: 'Keep 14.' } : RUN)],
    ['GET', /^\/v1\/runs\/run-live-\d+\/result$/, () => ({ runId: RUN.id, title: 'Rotate the logs', agent: 'chat', status: 'working', started: at(1), changed: at(1) })],
    ['GET', /^\/v1\/runs\/run-live-\d+\/transcript\?from=/, () => ({ run: RUN, items: [{ seq: 2, time: at(2), kind: 'tool', tool: 'recall', callId: 'c1' }, { seq: 3, time: at(2), kind: 'assistant', text: 'Keep 14 rotations.' }], next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-live-\d+\/transcript/, () => ({ run: RUN, items: [{ seq: 1, time: at(1), kind: 'user', text: 'Rotate the logs?', who: ME }], next: 0, prev: 0 })],
  ]);
  calls = f.calls;
  restore = f.restore;
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: ME, name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, chat: { agent: 'chat', member: '' } } });
    store.dispatch({ type: 'skills', skills: { skills: [] } });
    store.dispatch({ type: 'run', run: RUN });
  });
});

afterEach(() => {
  unmountAll();
  restore();
});

const lives = () => calls.filter((c) => c.path.endsWith('/live'));
const lines = (el: HTMLElement) => [...el.querySelectorAll('.tline')].map((x) => x.textContent);

describe('the live answer of the quick chat', () => {
  it('grows a pending answer, names the tool while the model calls it, and gives its place to the real item', async () => {
    const el = mount(<ChatMain run={RUN.id} />);
    await vi.waitFor(() => expect(lives().length).toBe(1));
    expect(lives()[0].path).toBe('/v1/runs/' + RUN.id + '/live');
    push('event: tool\ndata: {"turn":1,"name":"front.recall","callId":"c1"}\n\n');
    await vi.waitFor(() => expect(lines(el)).toContain('Working: recall'));
    push('event: done\ndata: {"turn":1,"stopReason":"tool_use"}\n\n');
    await vi.waitFor(() => expect(lines(el)).not.toContain('Working: recall'));
    push('event: delta\ndata: {"turn":2,"text":"Keep 14 "}\n\n');
    push('event: delta\ndata: {"turn":2,"text":"rotations."}\n\n');
    await vi.waitFor(() => expect(el.querySelector('.tmsg.pending')!.textContent).toContain('Keep 14 rotations.'));
    // A pending answer has no clock time and no cursor: only its text grows.
    expect(el.querySelector('.tmsg.pending time')).toBeNull();
    expect(el.querySelector('.tmsg.pending')!.getAttribute('aria-busy')).toBe('true');
    finished = true;
    push('event: done\ndata: {"turn":2,"stopReason":"end_turn"}\n\nevent: idle\ndata: {"state":"completed"}\n\n');
    await vi.waitFor(() => expect(el.querySelector('.tmsg.pending')).toBeNull());
    expect([...el.querySelectorAll('.tmsg')].filter((m) => m.textContent!.includes('Keep 14 rotations.')).length).toBe(1);
    expect(liveCount()).toBe(0);
    // The run left the running state, so the stream does not open again.
    await new Promise((r) => setTimeout(r, 20));
    expect(lives().length).toBe(1);
  });

  it('falls back to the poll with a quiet note when the run has as many live clients as it takes', async () => {
    status = 429;
    const el = mount(<ChatMain run={RUN.id} />);
    await vi.waitFor(() => expect(lines(el)).toContain('Live view is busy'));
    await new Promise((r) => setTimeout(r, 20));
    expect(lives().length).toBe(1);
  });

  it('closes the stream when the view closes', async () => {
    mount(<ChatMain run={RUN.id} />);
    await vi.waitFor(() => expect(liveCount()).toBe(1));
    unmountAll();
    expect(liveCount()).toBe(0);
  });
});

describe('the group views', () => {
  it('never open a live stream: the bridge channel, the inbox, and the board', async () => {
    const before = liveOpens();
    seedFleet();
    const entries: Entry[] = [{ seq: 1, at: at(1), from: { kind: 'agent', handle: 'migrator-1', run: 'run-migrator-1' }, to: [], text: 'I start.' }];
    const f = fakeFetch([
      ['GET', /\/live$/, liveStream],
      ['GET', /^\/v1\/bridges\/b1$/, () => bridge('b1', 'Migrate Puppet', [seat('migrator-1', 'migrator', 'working'), seat('migrator-2', 'migrator', 'needs-you')], { lastSeq: 1, read: 1 })],
      ['GET', /^\/v1\/bridges\/b1\/messages/, () => ({ bridge: 'b1', messages: entries, next: 0, prev: 0 })],
      ['PUT', /\/read$/, () => null],
      ['GET', /^\/v1\/pages$/, () => ({ pages: [] })],
    ]);
    act(() => {
      store.dispatch({ type: 'run', run: run('run-migrator-1', 'migrator', 'running') });
      store.dispatch({ type: 'run', run: run('run-migrator-2', 'migrator', 'input-required', { pending: { id: 'ap-1', tool: 'bash', input: { command: 'git push' }, requestedAt: at(3) } }) });
    });
    try {
      mount(<Channel id="b1" tab="posts" />);
      mount(<ActivityList />);
      mount(<ActivityMain item="d:run-migrator-2/ap-1" />);
      mount(<Board />);
      await new Promise((r) => setTimeout(r, 50));
      expect(f.calls.filter((c) => c.path.endsWith('/live'))).toEqual([]);
      expect(liveOpens()).toBe(before);
      expect(liveCount()).toBe(0);
    } finally {
      f.restore();
    }
  });
});
