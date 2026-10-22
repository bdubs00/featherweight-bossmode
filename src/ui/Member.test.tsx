import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Entry } from '../api/types';
import { store } from '../state/store';
import { MemberMain } from './Member';
import { currentNotice } from './notice';
import { forgetTranscripts } from './Conversation';
import { FLEET, at, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

/** push sends one piece of the live stream of run-migrator-1 while it is open. */
let push = (_: string) => {};
const liveStream = () =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        const e = new TextEncoder();
        push = (s) => c.enqueue(e.encode(s));
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );

const alice = { kind: 'person' as const, name: 'alice@example.com', display: 'Alice' };
const ENTRIES: Entry[] = [
  { seq: 1, at: at(1), from: alice, to: [], text: 'Hello, everyone.' },
  { seq: 2, at: at(2), from: alice, to: ['migrator-1'], text: 'How far is cron?' },
  { seq: 3, at: at(3), from: { kind: 'agent', handle: 'migrator-1', run: 'run-migrator-1' }, to: [], text: 'The role lints clean.' },
  { seq: 4, at: at(4), from: { kind: 'agent', handle: 'reviewer', run: 'run-reviewer' }, to: ['migrator-2'], text: 'Push the branch.' },
  { seq: 5, at: at(5), from: { kind: 'system' }, to: [], event: 'started', text: 'migrator-1 started: Migrate cron. Read the plan with front.pages_read.', mirrors: { run: 'run-migrator-1', seq: 1, type: 'fw.run.queued' } },
  { seq: 6, at: at(6), from: { kind: 'system' }, to: [], event: 'asleep', text: 'migrator-1 went to sleep. A message wakes its Task.' },
];

beforeEach(() => {
  const f = fakeFetch([
    ['GET', /^\/v1\/bridges\/b1\/messages/, () => ({ bridge: 'b1', messages: ENTRIES, next: 0, prev: 0 })],
    ['POST', /^\/v1\/bridges\/b1\/messages$/, (b) => ({ seq: 9, at: at(9), from: alice, to: ['migrator-1'], text: (b as { text: string }).text })],
    ['GET', /^\/v1\/runs\/run-migrator-1\/transcript/, () => ({ run: { id: 'run-migrator-1', agent: 'migrator', state: 'running', seq: 3, createdAt: at(0), updatedAt: at(0) }, items: [{ seq: 3, time: at(2), kind: 'tool', tool: 'bash', callId: 'c1', input: { command: 'ansible-lint roles/cron' } }], next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-migrator-1\/live$/, liveStream],
    ['GET', /^\/v1\/runs\/run-migrator-1\/result$/, () => ({ runId: 'run-migrator-1', title: 'Migrate cron', agent: 'migrator', status: 'working', files: [{ path: 'a.yml', op: 'created', seq: 1 }], started: at(0), changed: at(0) })],
    ['GET', /^\/v1\/runs\/run-tester\/result$/, () => ({ runId: 'run-tester', title: 'Run molecule', agent: 'tester', status: 'ready', summary: 'Molecule passed.', files: [], started: at(0), changed: at(0) })],
    ['GET', /^\/v1\/runs\/run-tester\/transcript/, () => ({ run: { id: 'run-tester', agent: 'tester', state: 'completed', seq: 2, createdAt: at(0), updatedAt: at(0), member: 'default/crew-1' }, items: [], next: 0, prev: 0 })],
  ]);
  calls = f.calls;
  restore = f.restore;
  forgetTranscripts();
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
          { name: 'plan', description: 'Plan a module.', origin: 'local' },
          { name: 'notes', description: 'Write notes.', origin: 'local' },
          { name: 'quiet', description: 'Only for the model.', origin: 'local', userInvocable: false },
        ],
      },
    });
    store.dispatch({ type: 'agent-skills', agent: 'migrator', skills: ['plan', 'quiet'] });
    store.dispatch({ type: 'agent-skills', agent: 'scribe', skills: ['notes'] });
  });
});

afterEach(() => {
  unmountAll();
  restore();
});

/** seatAsleep seats tester, whose newest run finished on crew-1, a worker that sleeps. The bridge still calls it idle. */
function seatAsleep(): void {
  act(() => {
    store.dispatch({ type: 'fleet', fleet: { ...FLEET, members: [...FLEET.members, { name: 'default/crew-1', state: 'quiet', lastSeen: at(3), canForward: true, accessMode: '', agents: [{ name: 'tester' }], active: 0, inputRequired: 0 }], pools: [...FLEET.pools!, { name: 'test', atespace: 'default', agent: 'tester', intake: '', wanted: 1, actual: 1, ready: 1, hash: '', tasks: [{ name: 'crew-1', phase: 'Suspended', current: true }], checkedAt: '' }] } });
    store.dispatch({ type: 'member', bridge: 'b1', member: { handle: 'tester', agent: 'tester', task: 'Run molecule', runs: ['run-tester'], fired: false, muted: false, presence: 'idle' } });
    store.dispatch({ type: 'run', run: { id: 'run-tester', agent: 'tester', state: 'completed', seq: 2, createdAt: at(0), updatedAt: at(3), member: 'default/crew-1' } });
    store.dispatch({ type: 'entry', bridge: 'b1', entry: { seq: 7, at: at(7), from: alice, to: ['tester'], text: 'Run molecule now.' } });
  });
}

const type = (box: HTMLTextAreaElement, v: string) =>
  act(() => {
    box.value = v;
    box.setSelectionRange(v.length, v.length);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('the member conversation', () => {
  it('says in place that the run of a seat is gone, and raises no notice', async () => {
    // The fake answers 404 for the transcript, the run, and the result of run-reviewer, as the front does after a worker that held the run was replaced.
    const el = mount(<MemberMain bridge="b1" handle="reviewer" tab="run" />);
    await vi.waitFor(() => expect(el.textContent).toContain('This run is gone.'));
    expect(currentNotice()).toBe('');
    const chat = mount(<MemberMain bridge="b1" handle="reviewer" tab="chat" />);
    await vi.waitFor(() => expect(chat.textContent).toContain('Push the branch.'));
    expect(chat.textContent).not.toContain('This run is gone.');
    expect(currentNotice()).toBe('');
  });

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
    // The lines say the words of the page, never the task, and the person reads You on a message of their own.
    const texts = [...el.querySelectorAll('.tline-text')].map((x) => x.textContent);
    expect(texts).toContain('migrator-1 took the seat');
    expect(texts).toContain('migrator-1 went to sleep');
    expect(log.textContent).not.toContain('Read the plan');
    expect([...el.querySelectorAll('.tmsg-head b')].map((b) => b.textContent)).toEqual(['You', 'migrator-1']);
  });

  it('streams the answer of a seat that works into a pending message, and the finished answer of the channel takes its place', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.tmsg').length).toBe(2));
    await vi.waitFor(() => expect(calls.filter((c) => c.path === '/v1/runs/run-migrator-1/live').length).toBe(1));
    const lines = () => [...el.querySelectorAll('.tline')].map((x) => x.textContent);
    push('event: delta\ndata: {"turn":4,"text":"Next: "}\n\n');
    push('event: tool\ndata: {"turn":4,"name":"bash","callId":"c2"}\n\n');
    push('event: delta\ndata: {"turn":4,"text":"the handler."}\n\n');
    await vi.waitFor(() => expect(el.querySelector('.tmsg.pending')!.textContent).toContain('Next: the handler.'));
    expect(el.querySelectorAll('.tmsg').length).toBe(3);
    expect(el.querySelector('.tmsg.pending')!.getAttribute('aria-busy')).toBe('true');
    expect(lines()).toContain('Working: bash');
    // The model call ends: the tool line goes, and the answer waits for its entry.
    push('event: done\ndata: {"turn":4,"stopReason":"end_turn"}\n\n');
    await vi.waitFor(() => expect(lines()).not.toContain('Working: bash'));
    expect(el.querySelector('.tmsg.pending')).not.toBeNull();
    act(() => {
      store.dispatch({ type: 'entry', bridge: 'b1', entry: { seq: 12, at: at(12), from: { kind: 'agent', handle: 'migrator-1', run: 'run-migrator-1' }, to: [], text: 'Next: the handler, as the plan says.' } });
    });
    await vi.waitFor(() => expect(el.querySelector('.tmsg.pending')).toBeNull());
    expect(el.querySelector('[role="log"]')!.textContent).toContain('Next: the handler, as the plan says.');
    expect(el.querySelectorAll('.tmsg').length).toBe(3);
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
    // The arguments go in the skill, so no text of the person follows it.
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ to: ['migrator-1'], skill: { name: 'plan', args: 'cron' } });
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

  it('opens the menu of the seat with Profile, Mute, Change task, and Fire, and Seat again for a seat that stopped', () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    act(() => (el.querySelector('button[aria-label="More for migrator-1"]') as HTMLButtonElement).click());
    expect([...el.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Profile', 'Mute', 'Change task', 'Fire']);
    act(() => {
      store.dispatch({ type: 'run', run: { id: 'run-reviewer', agent: 'reviewer', state: 'canceled', seq: 2, createdAt: at(0), updatedAt: at(5) } });
    });
    const other = mount(<MemberMain bridge="b1" handle="reviewer" tab="chat" />);
    act(() => (other.querySelector('button[aria-label="More for reviewer"]') as HTMLButtonElement).click());
    expect([...other.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Profile', 'Mute', 'Seat again', 'Change task', 'Fire']);
    expect(other.querySelector('.seat-bar .status-word')!.textContent).toBe('stopped');
  });

  it('reads nothing of a sleeping worker on the Chat tab, and shows what the channel holds', async () => {
    seatAsleep();
    const el = mount(<MemberMain bridge="b1" handle="tester" tab="chat" />);
    await vi.waitFor(() => expect(el.querySelector('[role="log"]')!.textContent).toContain('Run molecule now.'));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.filter((c) => c.path.startsWith('/v1/runs/run-tester')).map((c) => c.path)).toEqual([]);
    expect(el.textContent).not.toContain('This read wakes the worker.');
    // The halo says the status of the worker on the page, not the word of the bridge.
    expect(el.querySelector('header .mark')!.getAttribute('aria-label')).toBe('tester, asleep');
  });

  it('reads the run of a sleeping worker when the person opens Run or Files, and says that the read wakes it', async () => {
    seatAsleep();
    const run = mount(<MemberMain bridge="b1" handle="tester" tab="run" />);
    await vi.waitFor(() => expect(run.textContent).toContain('Molecule passed.'));
    expect(run.querySelector('.wake-note')!.textContent).toBe('This read wakes the worker.');
    expect(calls.some((c) => c.path === '/v1/runs/run-tester/result')).toBe(true);
    const files = mount(<MemberMain bridge="b1" handle="tester" tab="files" />);
    await vi.waitFor(() => expect(files.querySelector('.files-view')).not.toBeNull());
    expect(files.querySelector('.wake-note')!.textContent).toBe('This read wakes the worker.');
    // The worker wakes, and the line goes.
    act(() => store.dispatch({ type: 'stream', event: { id: '', kind: 'task', data: { kind: 'task', member: 'default/crew-1', phase: 'Running', time: at(9) } } }));
    expect(run.querySelector('.wake-note')).toBeNull();
    expect(files.querySelector('.wake-note')).toBeNull();
  });

  it('keeps the steps that it read while the run worked, once the worker sleeps', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    await vi.waitFor(() => expect(el.querySelector('.tline code')).not.toBeNull());
    unmountAll();
    act(() => {
      store.dispatch({ type: 'fleet', fleet: { ...FLEET, pools: FLEET.pools!.map((p) => (p.name === 'crew' ? { ...p, tasks: [{ name: 'crew-0', phase: 'Suspended', current: true }] } : p)) } });
      store.dispatch({ type: 'run', run: { id: 'run-migrator-1', agent: 'migrator', state: 'completed', seq: 9, createdAt: at(0), updatedAt: at(9), member: 'default/crew-0' } });
    });
    const reads = calls.filter((c) => c.path.startsWith('/v1/runs/run-migrator-1/transcript')).length;
    const again = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    await vi.waitFor(() => expect(again.querySelector('.tline code')).not.toBeNull());
    expect(again.querySelector('.tline code')!.textContent).toBe('ansible-lint roles/cron');
    expect(calls.filter((c) => c.path.startsWith('/v1/runs/run-migrator-1/transcript')).length).toBe(reads);
  });

  it('says so for a seat that is not on the bridge', () => {
    const el = mount(<MemberMain bridge="b1" handle="nobody" tab="chat" />);
    expect(el.textContent).toContain('nobody has no seat on this bridge, or no run yet.');
  });
});
