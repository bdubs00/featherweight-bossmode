import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Entry } from '../api/types';
import { store } from '../state/store';
import { MemberMain, appendLive, endLive } from './Member';
import { at, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

const alice = { kind: 'person' as const, name: 'alice@example.com', display: 'Alice' };
const ENTRIES: Entry[] = [
  { seq: 1, at: at(1), from: alice, to: [], text: 'Hello, everyone.' },
  { seq: 2, at: at(2), from: alice, to: ['migrator-1'], text: 'How far is cron?' },
  { seq: 3, at: at(3), from: { kind: 'agent', handle: 'migrator-1', run: 'run-migrator-1' }, to: [], text: 'The role lints clean.' },
  { seq: 4, at: at(4), from: { kind: 'agent', handle: 'reviewer', run: 'run-reviewer' }, to: ['migrator-2'], text: 'Push the branch.' },
];

beforeEach(() => {
  const f = fakeFetch([
    ['GET', /^\/v1\/bridges\/b1\/messages/, () => ({ bridge: 'b1', messages: ENTRIES, next: 0, prev: 0 })],
    ['POST', /^\/v1\/bridges\/b1\/messages$/, (b) => ({ seq: 9, at: at(9), from: alice, to: ['migrator-1'], text: (b as { text: string }).text })],
    ['GET', /^\/v1\/runs\/run-migrator-1\/transcript/, () => ({ run: { id: 'run-migrator-1', agent: 'migrator', state: 'running', seq: 3, createdAt: at(0), updatedAt: at(0) }, items: [{ seq: 3, time: at(2), kind: 'tool', tool: 'bash', callId: 'c1', input: { command: 'ansible-lint roles/cron' } }], next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-migrator-1\/result$/, () => ({ runId: 'run-migrator-1', title: 'Migrate cron', agent: 'migrator', status: 'working', files: [{ path: 'a.yml', op: 'created', seq: 1 }], started: at(0), changed: at(0) })],
  ]);
  calls = f.calls;
  restore = f.restore;
  try {
    sessionStorage.clear();
  } catch {
    // No storage in this run.
  }
  seedFleet();
  act(() => {
    store.dispatch({
      type: 'skills',
      skills: {
        skills: [
          { name: 'plan', description: 'Plan a module.', origin: 'local', agents: ['migrator'] },
          { name: 'notes', description: 'Write notes.', origin: 'local', agents: ['scribe'] },
          { name: 'quiet', description: 'Only for the model.', origin: 'local', agents: ['migrator'], userInvocable: false } as never,
        ],
        tools: [],
      },
    });
  });
});

afterEach(() => {
  unmountAll();
  restore();
});

const type = (box: HTMLTextAreaElement, v: string) =>
  act(() => {
    box.value = v;
    box.setSelectionRange(v.length, v.length);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('the member conversation', () => {
  it('has the halo of the status, the bridge, and the tabs Chat, Run, and Files with the count of files', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    const mark = el.querySelector('header .mark')!;
    expect(mark.getAttribute('aria-label')).toBe('migrator-1, working');
    expect(mark.getAttribute('title')).toBe('working');
    expect(el.querySelector('header .status')).toBeNull();
    expect(el.querySelector('.member-where a')!.getAttribute('href')).toBe('#bridge/b1');
    await vi.waitFor(() => expect(el.querySelector('.tabs .chip .sr')).not.toBeNull());
    expect([...el.querySelectorAll('.tabs a.tab')].map((t) => t.firstChild!.textContent)).toEqual(['Chat', 'Run', 'Files']);
    expect(el.querySelector('.tabs .chip .sr')!.textContent).toBe('1 file');
    expect(el.querySelector('button[aria-label="More for migrator-1"]')).not.toBeNull();
  });

  it('shows the direct thread: the messages to and from the seat, and its quiet step lines', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.tmsg').length).toBe(2));
    const log = el.querySelector('[role="log"]')!;
    expect(log.textContent).toContain('How far is cron?');
    expect(log.textContent).toContain('The role lints clean.');
    expect(log.textContent).not.toContain('Hello, everyone.');
    expect(log.textContent).not.toContain('Push the branch.');
    await vi.waitFor(() => expect(el.querySelector('.tline code')).not.toBeNull());
    expect(el.querySelector('.tline code')!.textContent).toBe('ansible-lint roles/cron');
  });

  it('appends live text to the last message of the member', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.tmsg').length).toBe(2));
    act(() => appendLive('b1', 'migrator-1', ' Next: the handler.'));
    expect(el.querySelectorAll('.tmsg').length).toBe(2);
    expect(el.querySelector('[role="log"]')!.textContent).toContain('The role lints clean. Next: the handler.');
    act(() => endLive('b1', 'migrator-1'));
    expect(el.querySelector('[role="log"]')!.textContent).not.toContain('Next: the handler.');
  });

  it('offers the skills of the agent behind a slash, and sends a slash command as a skill', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    expect(box.placeholder).toBe('Message migrator-1');
    type(box, '/');
    const menu = el.querySelector('[role="listbox"]')!;
    expect(menu.getAttribute('aria-label')).toBe('Commands');
    expect([...menu.querySelectorAll('[role="option"] b')].map((b) => b.textContent)).toEqual(['/plan']);
    type(box, '/plan cron');
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ text: '/plan cron', to: ['migrator-1'], skill: { name: 'plan', args: 'cron' } });
  });

  it('sends a plain message to the seat alone', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    type(box, 'Go ahead with logrotate.');
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/v1/bridges/b1/messages', body: { text: 'Go ahead with logrotate.', to: ['migrator-1'] } });
  });

  it('opens the menu of the seat with Mute, Change task, and Fire, and Seat again for a seat that stopped', () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    act(() => (el.querySelector('button[aria-label="More for migrator-1"]') as HTMLButtonElement).click());
    expect([...el.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Mute', 'Change task', 'Fire']);
    act(() => {
      store.dispatch({ type: 'run', run: { id: 'run-reviewer', agent: 'reviewer', state: 'canceled', seq: 2, createdAt: at(0), updatedAt: at(5) } });
    });
    const other = mount(<MemberMain bridge="b1" handle="reviewer" tab="chat" />);
    act(() => (other.querySelector('button[aria-label="More for reviewer"]') as HTMLButtonElement).click());
    expect([...other.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Mute', 'Seat again', 'Change task', 'Fire']);
    expect(other.querySelector('.seat-bar .status-word')!.textContent).toBe('stopped');
  });

  it('says so for a seat that is not on the bridge', () => {
    const el = mount(<MemberMain bridge="b1" handle="nobody" tab="chat" />);
    expect(el.textContent).toContain('nobody has no seat on this bridge, or no run yet.');
  });
});
