import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Item, Run } from '../api/types';
import { store } from '../state/store';
import { POLL_MS, READ_GAP_MS, blocksOf, forgetTranscripts, usePoll, useTranscript } from './Conversation';
import { at, fakeFetch, mount, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

const run = (id: string, state: Run['state']): Run => ({ id, agent: 'migrator', state, seq: 1, createdAt: at(0), updatedAt: at(1) });

function Poller({ id, also }: { id: string; also?: boolean }) {
  usePoll(id, also);
  return null;
}

function Reader({ id, load }: { id: string; load: boolean }) {
  const t = useTranscript(id, load);
  return <p>{t.items.map((x) => x.text).join(' ')}</p>;
}

beforeEach(() => {
  const f = fakeFetch([
    ['GET', /^\/v1\/runs\/r-[a-z]+$/, () => run('r-poll', 'running')],
    ['GET', /^\/v1\/runs\/r-read\/transcript/, () => ({ run: run('r-read', 'running'), items: [{ seq: 1, time: at(1), kind: 'assistant', text: 'The role lints clean.' }], next: 0, prev: 0 })],
  ]);
  calls = f.calls;
  restore = f.restore;
  forgetTranscripts();
});

afterEach(() => {
  unmountAll();
  restore();
  vi.useRealTimers();
});

describe('usePoll', () => {
  it('reads a run only while it works, because a read of a run that rests can wake its worker', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const polls = (id: string) => calls.filter((c) => c.path === '/v1/runs/' + id).length;
    act(() => {
      store.dispatch({ type: 'run', run: run('r-wait', 'input-required') });
      store.dispatch({ type: 'run', run: run('r-rest', 'suspended') });
      store.dispatch({ type: 'run', run: run('r-done', 'completed') });
      store.dispatch({ type: 'run', run: run('r-work', 'running') });
    });
    mount(<Poller id="r-wait" />);
    mount(<Poller id="r-rest" />);
    mount(<Poller id="r-done" />);
    mount(<Poller id="r-work" />);
    mount(<Poller id="r-none" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    });
    expect([polls('r-wait'), polls('r-rest'), polls('r-done'), polls('r-none')]).toEqual([0, 0, 0, 0]);
    expect(polls('r-work')).toBe(2);
  });

  it('reads a run while an answer is on its way, whatever its state', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    act(() => store.dispatch({ type: 'run', run: run('r-sent', 'completed') }));
    mount(<Poller id="r-sent" also />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(calls.filter((c) => c.path === '/v1/runs/r-sent').length).toBe(1);
  });
});

describe('useTranscript', () => {
  it('reads nothing without load, and shows what the page read before', async () => {
    const off = mount(<Reader id="r-read" load={false} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls.length).toBe(0);
    expect(off.textContent).toBe('');
    const on = mount(<Reader id="r-read" load />);
    await vi.waitFor(() => expect(on.textContent).toBe('The role lints clean.'));
    unmountAll();
    const again = mount(<Reader id="r-read" load={false} />);
    expect(again.textContent).toBe('The role lints clean.');
    expect(calls.filter((c) => c.path.includes('/transcript')).length).toBe(1);
  });

  it('reads the newer items of a run that works at most once every few seconds, also through a burst of events', async () => {
    const on = mount(<Reader id="r-read" load />);
    await vi.waitFor(() => expect(on.textContent).toBe('The role lints clean.'));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const reads = () => calls.filter((c) => c.path.includes('/transcript')).length;
    // A burst of ten steps, one every 200 milliseconds.
    for (let seq = 2; seq < 12; seq++) {
      act(() => store.dispatch({ type: 'run', run: { ...run('r-read', 'running'), seq } }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(READ_GAP_MS);
    });
    // The first read, the first step at once, and one more read after the gap for the rest.
    expect(reads()).toBe(3);
  });
});

describe('blocksOf and a note that waits', () => {
  it('words the call of a note that waits for a person, and gives the change of the note no line of its own (U1)', () => {
    const t = '2026-10-28T10:00:00Z';
    const items: Item[] = [
      { seq: 1, time: t, kind: 'tool', tool: 'memory', callId: 'm1', input: { command: 'create', path: '/memories/ports.md', file_text: 'x' } },
      { seq: 2, time: t, kind: 'memory', tool: 'memory', callId: 'm1', path: 'mem://agent/triage/ports.md', text: 'create', detail: 'waiting' },
      { seq: 3, time: t, kind: 'result', callId: 'm1', text: 'Not kept yet.' },
    ];
    const blocks = blocksOf(items);
    expect(blocks.length).toBe(1);
    expect(blocks[0].kind === 'steps' && blocks[0].steps.map((s) => s.text)).toEqual(['A note waits for you']);
  });
});
