import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetManagerRun } from '../state/actions';
import type { BossConfig, Item, Run } from '../api/types';
import { Manager, POLL_MS } from './Manager';
import { blocksOf } from './Conversation';
import { parseSlash } from '../lib/mention';
import { click, fakeApi, keyNamed, mount, problem, settle, typeIn, unmountAll } from './testkit-c';
import { clearNotice, currentNotice } from './notice';

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
    store.dispatch({ type: 'skills', skills: { skills: [{ name: 'ansible-style', description: 'Write roles.', origin: 'imported', argumentHint: '<role>' }] } });
    store.dispatch({ type: 'agent-skills', agent: 'manager', skills: ['ansible-style'] });
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
    expect([...el.querySelectorAll('.tmsg .md')].map((m) => m.textContent!.trim())).toEqual(['Two bridges are open.']);
    // The end of a turn that did not fail says nothing.
    expect(el.textContent).not.toContain('The turn ended');
    expect(el.querySelector('[role="status"] .status')).toBeNull();
    // The run completed and nothing waits, so the poll stops.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(runReads()).toBe(2);
  });

  it('stops the poll of a run that the fleet lost: a read that answers 404 marks it lost', async () => {
    const g = { ...run('running', 1), id: 'run-g' };
    act(() => store.dispatch({ type: 'config', config: { ...CONFIG, manager: { ...CONFIG.manager!, run: 'run-g' } } }));
    api = fakeApi({ 'GET /v1/runs/run-g/transcript': { run: g, items: [ASK], next: 0, prev: 0 }, 'GET /v1/runs/run-g': () => problem(404, 'no run run-g'), 'GET /v1/tools': { tools: [] } });
    mount(<Manager />);
    await settle();
    const reads = () => api.calls.filter((c) => c.method === 'GET' && c.path === '/v1/runs/run-g').length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    await settle();
    expect(reads()).toBe(1);
    await vi.waitFor(() => expect(store.get().lost['run-g']).toBe(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    });
    expect(reads()).toBe(1);
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
    expect(el.querySelector('.thread-empty')!.textContent).toBe('Ask about the fleet, or ask for a bridge.');
    typeIn(el.querySelector('#composer'), 'Hello');
    click(keyNamed(el, 'Send'));
    await settle();
    const start = api.calls.find((c) => c.method === 'POST')!;
    expect(start.path).toBe('/v1/runs?member=default%2Fmanager-0');
    expect(start.body).toEqual({ agent: 'manager', input: 'Hello' });
    expect(el.querySelector('[role="status"] .status')!.textContent).toBe('waking');
  });

  it('sends files with a message, starts a new conversation with them, and names them until the transcript holds them', async () => {
    const pick = (el: HTMLElement, files: File[]) => {
      const input = el.querySelector('.composer input[type=file]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      act(() => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    api = fakeApi({
      'GET /v1/runs/run-m/transcript': { run: run('completed', 3), items: [ASK, ...ANSWER], next: 0, prev: 0 },
      'POST /v1/runs/run-m/messages': () => ({ status: 202, body: run('running', 4) }),
      'POST /v1/runs': () => ({ status: 201, body: { ...run('queued', 1), id: 'run-f' } }),
      'GET /v1/runs/run-f/transcript': { run: { ...run('queued', 1), id: 'run-f' }, items: [], next: 0, prev: 0 },
      'GET /v1/tools': { tools: [] },
    });
    const el = mount(<Manager />);
    await settle();
    typeIn(el.querySelector('#composer'), 'Read this');
    pick(el, [new File(['hello'], 'note.txt')]);
    click(keyNamed(el, 'Send'));
    await settle();
    const follow = api.calls.find((c) => c.method === 'POST' && c.path === '/v1/runs/run-m/messages')!;
    expect(follow.body).toEqual({ content: 'Read this', files: [{ name: 'note.txt', data: 'aGVsbG8=' }] });
    click(keyNamed(el, 'New conversation'));
    pick(el, [new File(['name,role'], 'team.csv')]);
    click(keyNamed(el, 'Send'));
    await settle();
    const start = api.calls.find((c) => c.method === 'POST' && c.path.startsWith('/v1/runs?'))!;
    expect(start.body).toEqual({ agent: 'manager', input: '', files: [{ name: 'team.csv', data: 'bmFtZSxyb2xl' }] });
    // The files that went out show while the transcript does not hold the message yet.
    expect([...el.querySelectorAll('.tmsg .attached li')].map((li) => li.textContent)).toEqual(['team.csv9 B']);
  });

  it('sends no files with a slash command, and says so', async () => {
    api = fakeApi({
      'GET /v1/runs/run-m/transcript': { run: run('completed', 3), items: [ASK, ...ANSWER], next: 0, prev: 0 },
      'GET /v1/tools': { tools: [] },
    });
    const el = mount(<Manager />);
    await settle();
    typeIn(el.querySelector('#composer'), '/ansible-style roles/nginx');
    const input = el.querySelector('.composer input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'a.txt')], configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    click(keyNamed(el, 'Send'));
    await settle();
    expect(currentNotice()).toBe('A command takes no files. Send the files in a message of their own.');
    expect(api.calls.some((c) => c.method === 'POST')).toBe(false);
    expect([...el.querySelectorAll('.composer .attached li')].map((li) => li.textContent)).toEqual(['a.txt1 B']);
    clearNotice();
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
  it('folds the tool calls between two messages into one block of steps', () => {
    const items: Item[] = [
      ASK,
      { seq: 2, time: T, kind: 'tool', tool: 'bash', callId: 'c1', input: { command: 'ls' } },
      { seq: 3, time: T, kind: 'result', callId: 'c1' },
      { seq: 4, time: T, kind: 'tool', tool: 'front.fleet', callId: 'c2' },
      { seq: 5, time: T, kind: 'assistant', text: 'Two' },
    ];
    const blocks = blocksOf(items);
    expect(blocks.map((b) => b.kind)).toEqual(['item', 'steps', 'item']);
    expect(blocks[1].kind === 'steps' && blocks[1].steps.map((x) => x.cmd || x.text)).toEqual(['ls', 'Reading the fleet']);
  });

  it('puts the step of a call that asked for a decision after the decision, and none while it waits', () => {
    const call: Item[] = [
      ASK,
      { seq: 2, time: T, kind: 'tool', tool: 'front.bridge_open', callId: 'c1', input: { title: 'Notes' } },
      { seq: 3, time: T, kind: 'ask', id: 'ap', tool: 'front.bridge_open', callId: 'c1' },
    ];
    expect(blocksOf(call).map((b) => (b.kind === 'item' ? b.it.kind : 'steps'))).toEqual(['user', 'ask']);
    const after: Item[] = [...call, { seq: 4, time: T, kind: 'decided', id: 'ap', text: 'allow' }, { seq: 5, time: T, kind: 'result', callId: 'c1', text: 'Opened the bridge br-n "Notes".' }, { seq: 6, time: T, kind: 'assistant', text: 'Open.' }];
    const blocks = blocksOf(after);
    expect(blocks.map((b) => (b.kind === 'item' ? b.it.kind : 'steps'))).toEqual(['user', 'ask', 'decided', 'steps', 'assistant']);
    expect(blocks[3].kind === 'steps' && blocks[3].steps[0]).toMatchObject({ text: 'Opened the bridge', bridge: 'br-n', target: 'Notes' });
  });

  it('reads a slash command of a known skill, also the skill of a server', () => {
    expect(parseSlash('/ansible-style roles/nginx', ['ansible-style'])).toEqual({ name: 'ansible-style', args: 'roles/nginx' });
    expect(parseSlash('/docs/quote the rule', ['docs/quote'])).toEqual({ name: 'docs/quote', args: 'the rule' });
    expect(parseSlash('/unknown x', ['ansible-style'])).toBeNull();
    expect(parseSlash('plain words', ['ansible-style'])).toBeNull();
  });

  it('offers the skills of the manager with the hint of their arguments in a slot of its own', async () => {
    api = fakeApi({ 'GET /v1/runs/run-m/transcript': { run: run('completed', 3), items: [ASK, ...ANSWER], next: 0, prev: 0 } });
    const el = mount(<Manager />);
    await settle();
    typeIn(el.querySelector('#composer'), '/');
    const option = el.querySelector('[role="option"]')!;
    expect(option.querySelector('b')!.textContent).toBe('/ansible-style');
    expect(option.querySelector('.arg-hint')!.textContent).toBe('<role>');
    typeIn(el.querySelector('#composer'), '/ansible-style ');
    expect(el.querySelector('.composer .address .arg-hint')!.textContent).toBe('/ansible-style <role>');
  });
});
