import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { AgentChat } from './Fleet';
import { at, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

const RUN = { id: 'run-boss-1', agent: 'manager', state: 'running', seq: 1, createdAt: at(0), updatedAt: at(0), member: 'default/boss-0' };

beforeEach(() => {
  const f = fakeFetch([
    ['POST', /^\/v1\/runs\?member=/, () => RUN],
    ['POST', /^\/v1\/runs\/run-boss-1\/messages$/, () => ({ run: 'run-boss-1', seq: 2 })],
    ['POST', /^\/v1\/bossmode\/runs\/run-boss-1\/skill$/, () => ({ run: 'run-boss-1', seq: 3 })],
    ['GET', /^\/v1\/runs\/run-boss-1$/, () => RUN],
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
    expect(posts()[0]).toEqual({ method: 'POST', path: '/v1/runs?member=default%2Fboss-0', body: { agent: 'manager', input: 'What runs now?' } });
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

  it('reads a run of the front again every 3 seconds while it works', async () => {
    vi.useFakeTimers();
    try {
      sessionStorage.setItem('fw.bossmode.agentrun.manager', 'run-boss-1');
      act(() => store.dispatch({ type: 'run', run: RUN as never }));
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
    } finally {
      vi.useRealTimers();
    }
  });
});
