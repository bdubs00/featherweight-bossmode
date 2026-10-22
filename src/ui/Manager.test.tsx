import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetManagerRun } from '../state/actions';
import type { BossConfig, Item, Run } from '../api/types';
import { Manager, POLL_MS, slashOf } from './Manager';
import { appendDelta, threadOf } from './ManagerThread';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll } from './testkit-c';

const CONFIG: BossConfig = { manager: { agent: 'manager', member: 'default/manager-0', run: 'run-m' }, placement: 'queue', maxMembers: 16 };
const run = (state: Run['state'], seq: number): Run => ({ id: 'run-m', agent: 'manager', state, seq, createdAt: '', updatedAt: '' });
const T = '2026-10-22T00:00:00Z';
const ASK: Item = { seq: 1, time: T, kind: 'user', text: 'What is the fleet doing?', who: 'alice@example.com' };
const ANSWER: Item[] = [
  { seq: 2, time: T, kind: 'assistant', text: 'Two bridges are open.' },
  { seq: 3, time: T, kind: 'end', text: 'completed' },
];

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  sessionStorage.clear();
  forgetManagerRun();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  act(() => {
    store.dispatch({ type: 'config', config: CONFIG });
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'skills', skills: { skills: [{ name: 'ansible-style', description: 'Write roles.', origin: 'imported' }] } });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  vi.useRealTimers();
});

const runReads = () => api.calls.filter((c) => c.method === 'GET' && c.path === '/v1/runs/run-m').length;

describe('the manager', () => {
  it('reads the run every 3 seconds while it works, and the new items when it moves', async () => {
    api = fakeApi({
      'GET /v1/runs/run-m/transcript': (c) => ({ body: c.path.includes('from=2') ? { run: run('completed', 3), items: ANSWER, next: 0, prev: 0 } : { run: run('running', 1), items: [ASK], next: 0, prev: 0 } }),
      'GET /v1/runs/run-m': (_c, n) => ({ body: n < 2 ? run('running', 1) : run('completed', 3) }),
      'GET /v1/tools': { tools: [] },
    });
    const el = mount(<Manager />);
    await settle();
    expect(el.querySelector('[role="status"] .status')!.textContent).toBe('working');
    expect(runReads()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(runReads()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    await settle();
    expect(runReads()).toBe(2);
    expect([...el.querySelectorAll('.mmsg .md')].map((m) => m.textContent!.trim())).toEqual(['Two bridges are open.']);
    expect(el.querySelector('[role="status"] .status')).toBeNull();
    // The run completed and nothing waits, so the poll stops.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(runReads()).toBe(2);
  });

  it('says waking while the first answer waits for the Task of the manager', async () => {
    // The store keeps the newest state of a run, so this test has a run of its own.
    const w = { ...run('queued', 1), id: 'run-w' };
    act(() => store.dispatch({ type: 'config', config: { ...CONFIG, manager: { ...CONFIG.manager!, run: 'run-w' } } }));
    api = fakeApi({ 'GET /v1/runs/run-w/transcript': { run: w, items: [ASK], next: 0, prev: 0 }, 'GET /v1/runs/run-w': w, 'GET /v1/tools': { tools: [] } });
    const el = mount(<Manager />);
    await settle();
    const status = el.querySelector('[role="status"] .status')!;
    expect(status.textContent).toBe('waking');
    expect(status.getAttribute('title')).toBe('Waking the manager');
    const reads = () => api.calls.filter((c) => c.path === '/v1/runs/run-w').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(reads()).toBe(1);
    // The poll ends with the screen.
    unmountAll();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });
    expect(reads()).toBe(1);
  });

  it('sends a slash command to the skill route of the run', async () => {
    api = fakeApi({
      'GET /v1/runs/run-m/transcript': { run: run('completed', 3), items: [ASK, ...ANSWER], next: 0, prev: 0 },
      'POST /v1/bossmode/runs/run-m/skill': () => ({ status: 202, body: run('running', 4) }),
      'GET /v1/tools': { tools: [] },
    });
    const el = mount(<Manager />);
    await settle();
    typeIn(el.querySelector('#composer'), '/ansible-style roles/nginx');
    click(keyNamed(el, 'Send'));
    await settle();
    const call = api.calls.find((c) => c.path === '/v1/bossmode/runs/run-m/skill')!;
    expect(call.body).toEqual({ name: 'ansible-style', args: 'roles/nginx' });
  });

  it('starts a new conversation on the member of the manager', async () => {
    api = fakeApi({
      'GET /v1/runs/run-m/transcript': { run: run('completed', 3), items: [ASK, ...ANSWER], next: 0, prev: 0 },
      'POST /v1/runs': () => ({ status: 201, body: { ...run('queued', 1), id: 'run-n' } }),
      'GET /v1/runs/run-n/transcript': { run: { ...run('queued', 1), id: 'run-n' }, items: [{ ...ASK, text: 'Hello' }], next: 0, prev: 0 },
      'GET /v1/tools': { tools: [] },
    });
    const el = mount(<Manager />);
    await settle();
    click(keyNamed(el, 'New conversation'));
    expect(el.querySelector('.mthread-empty')!.textContent).toBe('Ask about the fleet, or ask for a bridge.');
    typeIn(el.querySelector('#composer'), 'Hello');
    click(keyNamed(el, 'Send'));
    await settle();
    const start = api.calls.find((c) => c.method === 'POST')!;
    expect(start.path).toBe('/v1/runs?member=default%2Fmanager-0');
    expect(start.body).toEqual({ agent: 'manager', input: 'Hello' });
    expect(el.querySelector('[role="status"] .status')!.textContent).toBe('waking');
  });

  it('says that no manager is set up, with the setting behind the question mark', () => {
    act(() => store.dispatch({ type: 'config', config: { ...CONFIG, manager: null } }));
    api = fakeApi({});
    const el = mount(<Manager />);
    expect(el.querySelector('.empty')!.textContent).toContain('No manager is set up.');
    click(el.querySelector('.help-key'));
    expect(el.querySelector('[role="note"]')!.textContent).toContain('workbench.bossmode.manager');
  });
});

describe('the thread', () => {
  it('folds the tool calls between two messages, and a stream can append to the last answer', () => {
    const items: Item[] = [
      ASK,
      { seq: 2, time: T, kind: 'tool', tool: 'bash', callId: 'c1', input: { command: 'ls' } },
      { seq: 3, time: T, kind: 'result', callId: 'c1' },
      { seq: 4, time: T, kind: 'tool', tool: 'front.fleet', callId: 'c2' },
      { seq: 5, time: T, kind: 'assistant', text: 'Two' },
    ];
    const t = threadOf(items, 'manager');
    expect(t.map((e) => e.kind)).toEqual(['msg', 'steps', 'msg']);
    expect(t[1].kind === 'steps' && t[1].steps.map((s) => s.phrase)).toEqual(['Ran "ls"', 'Used fleet']);
    const more = appendDelta(t, ' bridges are open.', 'manager', T);
    expect(more[2].kind === 'msg' && more[2].text).toBe('Two bridges are open.');
    expect(more[0]).toBe(t[0]);
    expect(appendDelta(t.slice(0, 2), 'Hi', 'manager', T).length).toBe(3);
  });

  it('reads a slash command of a known skill', () => {
    expect(slashOf('/ansible-style roles/nginx', ['ansible-style'])).toEqual({ name: 'ansible-style', args: 'roles/nginx' });
    expect(slashOf('/unknown x', ['ansible-style'])).toBeNull();
    expect(slashOf('plain words', ['ansible-style'])).toBeNull();
  });
});
