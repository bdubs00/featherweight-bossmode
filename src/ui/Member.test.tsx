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

// The error of a seat on the homelab fleet, as the run held it.
const PREFILL =
  'model: anthropic: stream claude-haiku-5-5: POST "http://ax-anthropic.fw-fleet.svc.cluster.local:8080/v1/messages?beta=true": 400 Bad Request (Request-ID: req_011CgJhPGRsjUd3vHdi7JLjE) (Workspace-ID: wrkspc_018mMkT171jg5neTmcSP7ha8) {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support assistant message prefill. The conversation must end with a user message."},"request_id":"req_011CgJhPGRsjUd3vHdi7JLjE"}';
const SAID = 'This model does not support assistant message prefill. The conversation must end with a user message.';
const PAGE = 'k3s/monitoring/manifests/prometheusrule.md';
const NOTES_RUN = { id: 'run-notes', agent: 'writer', state: 'failed' as const, error: PREFILL, seq: 9, createdAt: at(0), updatedAt: at(5), member: 'default/crew-0' };
/** The transcript of run-notes: it read the channel, wrote a page, posted, and failed at the next model call. */
const NOTES_ITEMS = [
  { seq: 1, time: at(0), kind: 'user', text: 'Write the runbook of the alerts', who: 'alice@example.com' },
  { seq: 2, time: at(1), kind: 'tool', tool: 'front.bridge_read', callId: 'c1', input: {} },
  { seq: 3, time: at(1), kind: 'result', tool: 'front.bridge_read', callId: 'c1', text: '3 messages' },
  { seq: 4, time: at(2), kind: 'tool', tool: 'front.pages_write', callId: 'c2', input: { path: PAGE, text: '# Rules' } },
  { seq: 5, time: at(2), kind: 'result', tool: 'front.pages_write', callId: 'c2', text: 'Wrote the page.' },
  { seq: 6, time: at(3), kind: 'tool', tool: 'front.bridge_post', callId: 'c3', input: { text: 'The runbook is in the wiki.' } },
  { seq: 7, time: at(3), kind: 'result', tool: 'front.bridge_post', callId: 'c3', text: 'Posted.' },
  { seq: 9, time: at(5), kind: 'end', text: 'failed', isError: true },
];

/** OLD_RUN is the run of a seat whose worker was replaced: the front reads it from its archive. */
const OLD_RUN = { id: 'run-old', agent: 'reviewer', state: 'completed' as const, archived: true, seq: 3, createdAt: at(0), updatedAt: at(3), member: 'default/reviewer-0' };

/** seatFailed seats notes, whose newest run failed when the provider refused the request. */
function seatFailed(): void {
  act(() => {
    store.dispatch({ type: 'member', bridge: 'b1', member: { handle: 'notes', agent: 'writer', task: 'Write the runbook of the alerts', runs: ['run-notes'], fired: false, muted: false, presence: 'error' } });
    store.dispatch({ type: 'run', run: NOTES_RUN });
  });
}
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
    ['GET', /^\/v1\/runs\/run-notes\/result$/, () => ({ runId: 'run-notes', title: 'Write the runbook of the alerts', agent: 'writer', status: 'failed', error: PREFILL, steps: [{ seq: 12, tool: 'front.bridge_read', text: 'front.bridge_read', done: true }, { seq: 14, tool: 'front.pages_write', text: 'front.pages_write', done: true }, { seq: 16, tool: 'front.bridge_post', text: 'front.bridge_post', done: true }], started: at(0), changed: at(5) })],
    ['GET', /^\/v1\/runs\/run-notes\/transcript/, () => ({ run: NOTES_RUN, items: NOTES_ITEMS, next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-notes$/, () => NOTES_RUN],
    ['GET', /^\/v1\/runs\/run-old\/result$/, () => ({ runId: 'run-old', archived: true, title: 'Write the role node_exporter', agent: 'reviewer', status: 'ready', summary: 'The role is on the wiki.', files: [{ path: 'roles/node_exporter/tasks/main.yml', op: 'created', seq: 4 }], started: at(0), changed: at(3) })],
    ['GET', /^\/v1\/runs\/run-old\/transcript/, () => ({ run: OLD_RUN, items: [{ seq: 1, time: at(0), kind: 'user', text: 'Write the role.', who: 'alice@example.com' }], next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-old$/, () => OLD_RUN],
    ['PATCH', /^\/v1\/bridges\/b1\/members\/notes$/, (b) => ({ handle: 'notes', agent: 'writer', task: 'Write the runbook of the alerts', runs: ['run-notes', 'run-notes-2'], fired: false, muted: false, presence: 'working', ...(b as object) })],
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
    // Files says it too, instead of loading for good.
    const files = mount(<MemberMain bridge="b1" handle="reviewer" tab="files" />);
    await vi.waitFor(() => expect(files.textContent).toContain('This run is gone.'));
    expect(files.textContent).not.toContain('Loading the conversation.');
    const chat = mount(<MemberMain bridge="b1" handle="reviewer" tab="chat" />);
    await vi.waitFor(() => expect(chat.textContent).toContain('Push the branch.'));
    expect(chat.textContent).not.toContain('This run is gone.');
    expect(currentNotice()).toBe('');
  });

  it('reads a run that the front calls gone from the archive, and says that its worker was replaced', async () => {
    act(() => {
      store.dispatch({ type: 'member', bridge: 'b1', member: { handle: 'old', agent: 'reviewer', task: 'Review', runs: ['run-old'], fired: false, muted: false, presence: 'idle', gone: true } });
    });
    const run = mount(<MemberMain bridge="b1" handle="old" tab="run" />);
    await vi.waitFor(() => expect(run.textContent).toContain('This run is from a worker that was replaced.'));
    expect(run.textContent).toContain('Write the role node_exporter');
    expect(run.textContent).not.toContain('This run is gone.');
    // A run that changes nothing now has no Stop.
    expect([...run.querySelectorAll('button')].some((b) => b.textContent === 'Stop')).toBe(false);
    const files = mount(<MemberMain bridge="b1" handle="old" tab="files" />);
    await vi.waitFor(() => expect(files.textContent).toContain('The files of this run were on a worker that was replaced'));
    expect((files.querySelector('button.file') as HTMLButtonElement).disabled).toBe(true);
    expect(currentNotice()).toBe('');
  });

  it('says that a run is gone when even the archive does not hold it', async () => {
    act(() => {
      store.dispatch({ type: 'member', bridge: 'b1', member: { handle: 'ghost', agent: 'reviewer', task: 'Review', runs: ['run-ghost'], fired: false, muted: false, presence: 'idle', gone: true } });
    });
    const run = mount(<MemberMain bridge="b1" handle="ghost" tab="run" />);
    await vi.waitFor(() => expect(run.textContent).toContain('This run is gone.'));
    expect(calls.some((c) => c.path.includes('run-ghost'))).toBe(true);
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

  it('sends files to the seat alone through the bridge', async () => {
    const el = mount(<MemberMain bridge="b1" handle="migrator-1" tab="chat" />);
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    const input = el.querySelector('.composer input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['hello'], 'note.txt')], configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    type(box, 'Read this.');
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/v1/bridges/b1/messages', body: { text: 'Read this.', to: ['migrator-1'], files: [{ name: 'note.txt', data: 'aGVsbG8=' }] } });
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

  it('shows a run that the front knows only from its index, without a title, an input, or an output, and raises no notice', async () => {
    act(() => {
      store.dispatch({ type: 'member', bridge: 'b1', member: { handle: 'bare', agent: 'migrator', task: 'Migrate ntp', runs: ['run-bare'], fired: false, muted: false, presence: 'needs-you' } });
      store.dispatch({ type: 'run', run: { id: 'run-bare', agent: 'migrator', state: 'input-required', seq: 3, createdAt: at(0), updatedAt: at(4), member: 'default/crew-0', pending: { id: 'ap-bare', tool: 'bash' } } });
    });
    const run = mount(<MemberMain bridge="b1" handle="bare" tab="run" />);
    await vi.waitFor(() => expect(calls.some((c) => c.path === '/v1/runs/run-bare/result')).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(run.querySelector('.run-view h3')!.textContent).toBe('The run');
    expect(run.querySelector('.run-status .status-word')!.textContent).toBe('needs you');
    const chat = mount(<MemberMain bridge="b1" handle="bare" tab="chat" />);
    expect(chat.querySelector('header .mark')!.getAttribute('aria-label')).toBe('bare, needs you');
    await new Promise((r) => setTimeout(r, 20));
    expect(currentNotice()).toBe('');
  });

  it('shows a failure of the run as a plain line with the message of the provider, Seat again, and the whole error behind Details', async () => {
    seatFailed();
    const el = mount(<MemberMain bridge="b1" handle="notes" tab="run" />);
    await vi.waitFor(() => expect(el.querySelector('.run-fail-line')).not.toBeNull());
    expect(el.querySelector('.run-fail-line')!.textContent).toBe('The model refused the request');
    expect(el.querySelector('.run-fail-said')!.textContent).toBe(SAID);
    expect(el.querySelector('.run-status .status-word')!.textContent).toBe('failed');
    expect(el.textContent).not.toContain('req_011');
    const more = el.querySelector('.run-fail-more') as HTMLButtonElement;
    expect(more.textContent).toBe('Details');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    act(() => more.click());
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('pre.command.run-fail-raw')!.textContent).toBe(PREFILL);
    // The steps say what the run did, with the page that it wrote.
    await vi.waitFor(() => expect([...el.querySelectorAll('.run-steps li > span')].map((x) => x.textContent)).toEqual(['Read the channel', 'Wrote ' + PAGE, 'Posted to the bridge']));
    act(() => (el.querySelector('.run-fail .seat-again') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/v1/bridges/b1/members/notes', body: { task: 'Write the runbook of the alerts' } });
    expect(el.querySelector('dialog.confirm')).toBeNull();
  });

  it('puts the plain line and Seat again over the composer of a seat whose run failed', async () => {
    seatFailed();
    const el = mount(<MemberMain bridge="b1" handle="notes" tab="chat" />);
    await vi.waitFor(() => expect(el.querySelector('.seat-bar-why')!.textContent).toBe('The model refused the request'));
    expect(el.querySelector('.seat-bar-why')!.getAttribute('title')).toBe(SAID);
    expect(el.querySelector('.seat-bar .status-word')!.textContent).toBe('error');
    act(() => (el.querySelector('.seat-bar .seat-again') as HTMLButtonElement).click());
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.path === '/v1/bridges/b1/members/notes')).toBe(true));
    expect(el.querySelector('dialog.confirm')).toBeNull();
  });

  it('lists the pages of the wiki that the run wrote as links to the Wiki, and counts them on the tab Files', async () => {
    seatFailed();
    const el = mount(<MemberMain bridge="b1" handle="notes" tab="files" />);
    await vi.waitFor(() => expect(el.querySelector('.run-pages a.file')).not.toBeNull());
    const link = el.querySelector('.run-pages a.file')!;
    expect(link.getAttribute('href')).toBe('#pages/' + PAGE);
    expect(link.querySelector('b')!.textContent).toBe('prometheusrule');
    expect(el.querySelector('.run-pages h4')!.textContent).toBe('Wiki pages');
    expect(el.textContent).not.toContain('No files changed in this run.');
    expect(el.querySelector('.tabs .chip .sr')!.textContent).toBe('1 file');
  });

  it('says that a run changed no file, with no empty list', async () => {
    seatAsleep();
    const el = mount(<MemberMain bridge="b1" handle="tester" tab="files" />);
    await vi.waitFor(() => expect(el.textContent).toContain('No files changed in this run.'));
    expect(el.querySelector('.files')).toBeNull();
    expect(el.querySelector('.run-pages')).toBeNull();
  });

  it('says so for a seat that is not on the bridge', () => {
    const el = mount(<MemberMain bridge="b1" handle="nobody" tab="chat" />);
    expect(el.textContent).toContain('nobody has no seat on this bridge, or no run yet.');
  });
});
