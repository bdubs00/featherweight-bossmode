import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { AgentChat } from './Fleet';
import { FLEET, at, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';
import { clearNotice, currentNotice } from './notice';

/** The time zone of the browser of the test, which each new run carries. */
const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

let calls: Call[] = [];
let restore = () => {};

const RUN = { id: 'run-boss-1', agent: 'manager', state: 'running', seq: 1, createdAt: at(0), updatedAt: at(0), member: 'default/boss-0' };

beforeEach(() => {
  const f = fakeFetch([
    ['POST', /^\/v1\/runs\?member=/, () => RUN],
    ['POST', /^\/v1\/runs\/run-boss-1\/messages$/, () => ({ run: 'run-boss-1', seq: 2 })],
    ['POST', /^\/v1\/bossmode\/runs\/run-boss-1\/skill$/, () => ({ run: 'run-boss-1', seq: 3 })],
    ['GET', /^\/v1\/runs\/run-boss-1$/, () => RUN],
    // The fleet view answers what the store holds, as a read of an unchanged fleet does.
    ['GET', /^\/v1\/fleet$/, () => store.get().fleet],
    ['GET', /^\/v1\/runs\/run-boss-1\/transcript/, () => ({ run: RUN, items: [{ seq: 1, time: at(1), kind: 'user', text: 'What runs now?', who: 'alice@example.com' }], next: 0, prev: 0 })],
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
    store.dispatch({ type: 'config', config: { manager: { agent: 'manager', member: 'default/boss-0', run: '' }, placement: 'queue', maxMembers: 16 } });
    store.dispatch({ type: 'skills', skills: { skills: [{ name: 'plan', description: 'Plan a module.', origin: 'local' }] } });
    store.dispatch({ type: 'agent-skills', agent: 'manager', skills: ['plan'] });
  });
});

afterEach(() => {
  unmountAll();
  restore();
});

const send = (box: HTMLTextAreaElement, v: string) => {
  act(() => {
    box.value = v;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  });
};

const posts = () => calls.filter((c) => c.method === 'POST');

describe('the conversation with an agent on no bridge', () => {
  it('starts a run with the first message, follows up with the next, and runs a skill for a slash command', async () => {
    const el = mount(<AgentChat agent="manager" />);
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    expect(box.placeholder).toBe('Message manager');
    send(box, 'What runs now?');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toEqual({ method: 'POST', path: '/v1/runs?member=default%2Fboss-0', body: { agent: 'manager', input: 'What runs now?', profile: { timeZone: ZONE } } });
    await vi.waitFor(() => expect(el.querySelector('.thread')!.textContent).toContain('What runs now?'));
    await vi.waitFor(() => expect(box.value).toBe(''));
    send(box, 'And the next one?');
    await vi.waitFor(() => expect(posts().length).toBe(2));
    await vi.waitFor(() => expect(box.value).toBe(''));
    expect(posts()[1]).toEqual({ method: 'POST', path: '/v1/runs/run-boss-1/messages', body: { content: 'And the next one?' } });
    send(box, '/plan cron');
    await vi.waitFor(() => expect(posts().length).toBe(3));
    expect(posts()[2]).toEqual({ method: 'POST', path: '/v1/bossmode/runs/run-boss-1/skill', body: { name: 'plan', args: 'cron' } });
  });

  it('sends files with the first message and with a follow-up, and refuses them with a slash command', async () => {
    const attach = (el: HTMLElement, files: File[]) => {
      const input = el.querySelector('.composer input[type=file]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: files, configurable: true });
      act(() => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    };
    const el = mount(<AgentChat agent="manager" />);
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    attach(el, [new File(['hello'], 'note.txt')]);
    send(box, 'Read this');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toEqual({ method: 'POST', path: '/v1/runs?member=default%2Fboss-0', body: { agent: 'manager', input: 'Read this', profile: { timeZone: ZONE }, files: [{ name: 'note.txt', data: 'aGVsbG8=' }] } });
    await vi.waitFor(() => expect(box.value).toBe(''));
    attach(el, [new File(['name,role'], 'team.csv')]);
    send(box, '');
    await vi.waitFor(() => expect(posts().length).toBe(2));
    expect(posts()[1]).toEqual({ method: 'POST', path: '/v1/runs/run-boss-1/messages', body: { content: '', files: [{ name: 'team.csv', data: 'bmFtZSxyb2xl' }] } });
    attach(el, [new File(['a'], 'a.txt')]);
    send(box, '/plan nginx');
    await vi.waitFor(() => expect(currentNotice()).toBe('A command takes no files. Send the files in a message of their own.'));
    expect(posts().length).toBe(2);
    clearNotice();
  });

  it('reads a run of the front again every 3 seconds while it works, and never a run that a worker holds, which comes on the stream', async () => {
    vi.useFakeTimers();
    try {
      sessionStorage.setItem('fw.bossmode.agentrun.manager', 'run-boss-1');
      // A run of the front names no member of the fleet.
      act(() => store.dispatch({ type: 'run', run: { ...RUN, member: '', seq: 2 } as never }));
      mount(<AgentChat agent="manager" />);
      const reads = () => calls.filter((c) => c.method === 'GET' && c.path === '/v1/runs/run-boss-1').length;
      const before = reads();
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(reads()).toBe(before + 1);
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(reads()).toBe(before + 2);
      // The same run on a worker of the fleet sends its events, so the poll stops.
      act(() => store.dispatch({ type: 'run', run: { ...RUN, seq: 3 } as never }));
      await act(async () => {
        vi.advanceTimersByTime(9000);
      });
      expect(reads()).toBe(before + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says what the agent does in an empty conversation', () => {
    act(() =>
      store.dispatch({
        type: 'agents',
        agents: [
          { name: 'migrator', role: 'owner', description: 'Moves Puppet modules to Ansible.' },
          { name: 'manager', role: 'operator' },
        ],
      }),
    );
    const el = mount(<AgentChat agent="migrator" />);
    expect(el.querySelector('.thread-empty')!.textContent).toBe('Start a conversation with migrator. Moves Puppet modules to Ansible.');
    expect((el.querySelector('#composer') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('waits for the worker of a new agent with a sentence, reads the fleet until the worker is up, and then takes a message', async () => {
    vi.useFakeTimers();
    try {
      // New agent made walker: its pool wants one worker, and the fleet lists no member for it yet.
      const pool = { name: 'walker', atespace: 'default', agent: 'walker', intake: '', wanted: 1, actual: 0, ready: 0, hash: '', tasks: [{ name: 'walker-0', phase: 'Pending', current: true }], checkedAt: '' };
      act(() => store.dispatch({ type: 'fleet', fleet: { ...FLEET, pools: [...(FLEET.pools || []), pool] } }));
      const el = mount(<AgentChat agent="walker" />);
      const box = el.querySelector('#composer') as HTMLTextAreaElement;
      expect(box.disabled).toBe(true);
      expect(box.placeholder).toBe('The worker of walker is starting.');
      const reads = () => calls.filter((c) => c.method === 'GET' && c.path === '/v1/fleet').length;
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(reads()).toBe(1);
      // The worker wakes: the stream says so, and the member names no agent yet.
      act(() => store.dispatch({ type: 'stream', event: { id: '9', kind: 'task', data: { member: 'default/walker-0', phase: 'Running' } } as never }));
      expect(box.disabled).toBe(false);
      expect(box.placeholder).toBe('Message walker');
      await act(async () => {
        vi.advanceTimersByTime(9000);
      });
      expect(reads()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says that an agent of an old address no longer exists, with the way back to the fleet', () => {
    const el = mount(<AgentChat agent="nobody-here" />);
    expect(el.querySelector('h1')!.textContent).toBe('nobody-here');
    expect(el.textContent).toContain('This agent no longer exists.');
    expect(el.querySelector('#composer')).toBeNull();
    expect(el.querySelector('a[href="#fleet"].button, .empty a[href="#fleet"]')!.textContent).toBe('Back to Fleet');
  });
});
