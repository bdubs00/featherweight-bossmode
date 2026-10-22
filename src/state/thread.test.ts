import { describe, expect, it } from 'vitest';
import type { Entry, Item } from '../api/types';
import { directEntries, foldNaps, sameSender, stepsOf, threadOf, withLive } from './thread';

const at = (min: number) => new Date(Date.UTC(2026, 9, 21, 20, min)).toISOString();

function entry(seq: number, min: number, from: Entry['from'], text: string, more: Partial<Entry> = {}): Entry {
  return { seq, at: at(min), from, to: [], text, ...more };
}

const agent = (handle: string, run = 'run-' + handle): Entry['from'] => ({ kind: 'agent', handle, run });
const alice: Entry['from'] = { kind: 'person', name: 'alice@example.com', display: 'Alice' };
const sys: Entry['from'] = { kind: 'system' };

const channel: Entry[] = [
  entry(1, 0, sys, 'alice opened the bridge with 3 members.', { event: 'opened' }),
  entry(2, 1, sys, 'migrator-1 started: Migrate cron.', { event: 'started', mirrors: { run: 'run-m1', seq: 1, type: 'fw.run.queued' } }),
  entry(3, 2, alice, 'Start with cron, everyone.'),
  entry(4, 3, agent('migrator-1', 'run-m1'), 'I read the module.'),
  entry(5, 4, agent('reviewer'), '@migrator-1 post the path.', { to: ['migrator-1'] }),
  entry(6, 5, alice, '@migrator-2 keep the names.', { to: ['migrator-2'] }),
  entry(7, 6, alice, 'How far is cron?', { to: ['migrator-1'] }),
  entry(8, 7, sys, 'migrator-1 wants to run a command.', { event: 'needs-you', decision: { run: 'run-m1', id: 'ap1', label: 'Run command', state: 'pending' } }),
  entry(9, 8, sys, 'migrator-2 wants to run a command.', { event: 'needs-you', decision: { run: 'run-m2', id: 'ap2', label: 'Run command', state: 'pending' } }),
  entry(10, 9, sys, 'migrator-10 woke up.', { event: 'started' }),
  entry(11, 10, sys, 'migrator-1 woke up.', { event: 'started' }),
];

describe('the direct thread', () => {
  it('keeps the messages of the seat, the messages to it, and the cards and lines of its runs', () => {
    expect(directEntries(channel, 'migrator-1', ['run-m1']).map((e) => e.seq)).toEqual([2, 4, 5, 7, 8, 11]);
  });

  it('leaves out the line of a decision whose card the thread holds', () => {
    const decided: Entry[] = [
      entry(1, 0, sys, 'migrator-1 wants to run a command.', { event: 'needs-you', decision: { run: 'run-m1', id: 'ap1', label: 'Run command', state: 'deny', decidedBy: 'token' } }),
      entry(2, 1, sys, 'the token of the fleet denied the call of migrator-1.', { event: 'decided', mirrors: { run: 'run-m1', seq: 6, type: 'fw.approval.decided' } }),
      entry(3, 2, sys, 'the token of the fleet allowed the call of migrator-1.', { event: 'decided', mirrors: { run: 'run-m1b', seq: 2, type: 'fw.approval.decided' } }),
    ];
    expect(directEntries(decided, 'migrator-1', ['run-m1', 'run-m1b']).map((e) => e.seq)).toEqual([1, 3]);
  });

  it('leaves out a message to everyone, a message to another seat, and a line about a longer handle', () => {
    const seqs = directEntries(channel, 'migrator-1', ['run-m1']).map((e) => e.seq);
    expect(seqs).not.toContain(3);
    expect(seqs).not.toContain(6);
    expect(seqs).not.toContain(10);
    expect(seqs).not.toContain(9);
  });

  it('words each tool call as a quiet step, with the command apart and the error marked', () => {
    const items: Item[] = [
      { seq: 1, time: at(3), kind: 'tool', tool: 'bash', callId: 'c1', input: { command: 'ansible-lint roles/cron' } },
      { seq: 2, time: at(3), kind: 'result', tool: 'bash', callId: 'c1', isError: true },
      { seq: 3, time: at(4), kind: 'tool', tool: 'files', callId: 'c2', input: { op: 'create', path: 'a.yml' } },
      { seq: 4, time: at(4), kind: 'file', tool: 'files', callId: 'c2', path: 'roles/a.yml', text: 'created' },
      { seq: 5, time: at(5), kind: 'tool', tool: 'front.fleet', callId: 'c3', input: {} },
      { seq: 6, time: at(5), kind: 'assistant', text: 'Done.' },
    ];
    expect(stepsOf(items).map((s) => [s.text, s.cmd || '', !!s.isError])).toEqual([
      ['Ran', 'ansible-lint roles/cron', true],
      ['Created roles/a.yml', '', false],
      ['Used fleet', '', false],
    ]);
  });

  it('merges the entries and the steps in the order of time, and folds three steps or more', () => {
    const mine = directEntries(channel, 'migrator-1', ['run-m1']);
    const steps = [
      { key: 's1', at: at(3), text: 'Ran', cmd: 'ls' },
      { key: 's2', at: at(6) + '', text: 'Ran', cmd: 'a' },
      { key: 's3', at: at(6), text: 'Ran', cmd: 'b' },
      { key: 's4', at: at(6), text: 'Ran', cmd: 'c' },
    ];
    const rows = threadOf(mine, steps);
    expect(rows.map((r) => (r.kind === 'entry' ? 'e' + r.entry.seq : r.kind === 'steps' ? 'fold' + r.steps.length : r.key))).toEqual(['e2', 'e4', 's1', 'e5', 'e7', 'fold3', 'e8', 'e11']);
  });

  it('puts the live answer of the member in a pending message of its own at the end', () => {
    const rows = threadOf([entry(1, 0, agent('migrator-1'), 'I read the module.')], []);
    const grown = withLive(rows, 'migrator-1', 'Next: the handler.', at(1));
    expect(grown.map((r) => r.kind)).toEqual(['entry', 'live']);
    expect(grown[0].kind === 'entry' && grown[0].entry.text).toBe('I read the module.');
    expect(grown[1].kind === 'live' && grown[1].text).toBe('Next: the handler.');
    expect(withLive(rows, 'migrator-1', '', at(1))).toBe(rows);
  });

  it('joins a message to the one before it from the same sender within five minutes', () => {
    const a = entry(1, 0, agent('m'), 'one');
    expect(sameSender(a, entry(2, 3, agent('m'), 'two'))).toBe(true);
    expect(sameSender(a, entry(2, 6, agent('m'), 'two'))).toBe(false);
    expect(sameSender(a, entry(2, 1, agent('r'), 'two'))).toBe(false);
    expect(sameSender(a, entry(2, 1, agent('m'), 'two', { replyTo: 1 }))).toBe(false);
    expect(sameSender(undefined, a)).toBe(false);
  });
});

describe('the sleep and wake lines of a seat', () => {
  it('fold into one quiet line, and a last sleep line stays', () => {
    const lines = [
      entry(20, 19, sys, 'migrator-1 went to sleep. A message wakes its Task.', { event: 'asleep' }),
      entry(21, 20, sys, 'migrator-1 woke up.', { event: 'started' }),
      entry(22, 21, sys, 'migrator-1 went to sleep.', { event: 'asleep' }),
      entry(23, 22, sys, 'migrator-1 woke up.', { event: 'started' }),
      entry(24, 23, sys, 'migrator-1 went to sleep.', { event: 'asleep' }),
    ];
    const rows = foldNaps(threadOf([entry(19, 18, agent('migrator-1'), 'Done.'), ...lines], []));
    expect(rows.map((r) => r.kind)).toEqual(['entry', 'naps', 'entry']);
    expect(rows[1]).toMatchObject({ kind: 'naps', handle: 'migrator-1', pairs: 2, at: at(22) });
    expect((rows[2] as Extract<typeof rows[number], { kind: 'entry' }>).entry.seq).toBe(24);
  });

  it('stay apart with a step or a message between them', () => {
    const rows = threadOf([entry(30, 30, sys, 'migrator-1 went to sleep.', { event: 'asleep' }), entry(32, 32, sys, 'migrator-1 woke up.', { event: 'started' })], [{ key: 's', at: at(31), text: 'Ran', cmd: 'ls' }]);
    expect(foldNaps(rows).map((r) => r.kind)).toEqual(['entry', 'step', 'entry']);
  });
});
