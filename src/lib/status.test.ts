import { describe, expect, it } from 'vitest';
import type { Fleet, Member, Run } from '../api/types';
import { initialState, reduce, selectFacts, type State } from '../state/reducer';
import { PRESENCE, WAITING } from './presence';
import { awakeCount, awakeFor, factsOf, seatPresence, statusOf, workerOf, workerStates } from './status';

const fleet: Fleet = {
  name: 'front-0',
  members: [
    { name: 'front-0', self: true, state: 'live', lastSeen: '', canForward: false, accessMode: '', agents: [], active: 0, inputRequired: 0 },
    { name: 'default/crew-0', state: 'live', lastSeen: '2026-10-22T08:20:00Z', canForward: true, accessMode: '', agents: [], active: 1, inputRequired: 0 },
    { name: 'default/crew-1', state: 'quiet', lastSeen: '2026-10-22T08:10:00Z', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
    { name: 'default/crew-2', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0, blockedReason: 'the store is full' },
    { name: 'default/static-0', state: 'quiet', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
  ],
  pools: [
    {
      name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 3, actual: 3, ready: 3, hash: 'h', checkedAt: '',
      tasks: [
        { name: 'crew-0', phase: 'Running', current: true },
        { name: 'crew-1', phase: 'Suspended', current: true },
        { name: 'crew-2', phase: 'Running', current: false },
      ],
    },
    { name: 'new', atespace: 'default', agent: 'scribe', intake: 'q', wanted: 1, actual: 1, ready: 0, hash: 'h', checkedAt: '', tasks: [{ name: 'new-0', phase: 'Pending', current: true }] },
    { name: 'dead', atespace: 'default', agent: 'tester', intake: 'q', wanted: 1, actual: 1, ready: 0, hash: 'h', checkedAt: '', tasks: [{ name: 'dead-0', phase: 'Failed', current: true }] },
  ],
};

const run = (id: string, state: Run['state'], member?: string): Run => ({ id, agent: 'migrator', state, seq: 1, createdAt: '', updatedAt: '', member });

const seat = (presence: Member['presence'], runs: string[], extra: Partial<Member> = {}): Member => ({ handle: 'migrator-1', agent: 'migrator', task: 'Migrate cron', runs, fired: false, muted: false, presence, ...extra });

describe('the state of each worker', () => {
  it('keeps one state per worker: the phase of its Task, the state of its member, and the open runs it holds', () => {
    const f = factsOf(fleet, { a: run('a', 'running', 'default/crew-0'), b: run('b', 'completed', 'default/crew-0'), c: run('c', 'input-required', 'crew-1') }, true);
    const ws = workerStates(f);
    expect(ws.map((w) => w.name)).toEqual(['crew-0', 'crew-1', 'crew-2', 'new-0', 'dead-0']);
    expect(ws[0]).toMatchObject({ member: 'default/crew-0', agent: 'migrator', phase: 'Running', state: 'live', runs: ['a'], busy: true, current: true, lastSeen: '2026-10-22T08:20:00Z' });
    // A run can name its worker by its name alone.
    expect(ws[1]).toMatchObject({ phase: 'Suspended', state: 'quiet', runs: ['c'], busy: true });
    expect(ws[2]).toMatchObject({ busy: false, blocked: true, current: false });
  });

  it('counts the active runs of the fleet view as busy until the page reads the open runs', () => {
    expect(workerOf(factsOf(fleet), 'default/crew-0')!.busy).toBe(true);
    expect(workerOf(factsOf(fleet, {}, true), 'default/crew-0')!.busy).toBe(false);
  });

  it('finds a worker by its full name or its name, and a member with no Task by its state', () => {
    const f = factsOf(fleet);
    expect(workerOf(f, 'crew-1')!.member).toBe('default/crew-1');
    expect(workerOf(f, 'front-0')!.phase).toBe('Running');
    expect(workerOf(f, 'default/static-0')!.phase).toBe('Suspended');
    expect(workerOf(f, 'nobody')).toBeUndefined();
    expect(workerOf(factsOf(null), 'crew-0')).toBeUndefined();
  });
});

describe('statusOf', () => {
  it('words a worker from the phase of its Task, and keeps one object per word', () => {
    const f = factsOf(fleet);
    expect(statusOf(f, { worker: 'default/crew-0' })).toMatchObject({ word: 'awake', tone: 'green' });
    expect(statusOf(f, { worker: 'crew-1' })).toMatchObject({ word: 'asleep', tone: 'grey' });
    expect(statusOf(f, { worker: 'new-0' })!.word).toBe('starting');
    expect(statusOf(f, { worker: 'dead-0' })).toMatchObject({ word: 'failed', tone: 'red' });
    expect(statusOf(f, { worker: 'nobody' })).toBeNull();
    expect(statusOf(f, { worker: 'crew-0' })).toBe(statusOf(factsOf(fleet), { worker: 'crew-2' }));
  });

  it('words an agent from its workers: awake, starting, failed, or asleep, and nothing without a worker', () => {
    const f = factsOf(fleet);
    expect(statusOf(f, { agent: 'migrator' })!.word).toBe('awake');
    expect(statusOf(f, { agent: 'scribe' })!.word).toBe('starting');
    expect(statusOf(f, { agent: 'tester' })!.word).toBe('failed');
    expect(statusOf(f, { agent: 'idler' })).toBeNull();
    const asleep = { ...fleet, pools: [{ ...fleet.pools![0], tasks: [{ name: 'crew-1', phase: 'Suspended', current: true }] }] };
    expect(statusOf(factsOf(asleep), { agent: 'migrator' })!.word).toBe('asleep');
  });

  it('derives the presence of a seat from its newest run and the phase of the worker that holds it', () => {
    const f = (r: Run) => factsOf(fleet, { [r.id]: r });
    // The bridge says asleep, but the worker is up and the run finished: idle.
    expect(statusOf(f(run('r', 'completed', 'default/crew-0')), { seat: seat('asleep', ['r']) })).toBe(PRESENCE.idle);
    // The bridge says idle, but the worker sleeps: asleep.
    expect(statusOf(f(run('r', 'completed', 'default/crew-1')), { seat: seat('idle', ['r']) })).toBe(PRESENCE.asleep);
    expect(statusOf(f(run('r', 'running', 'default/crew-0')), { seat: seat('idle', ['r']) })).toBe(PRESENCE.working);
    expect(statusOf(f(run('r', 'input-required', 'default/crew-1')), { seat: seat('asleep', ['r']) })).toBe(PRESENCE['needs-you']);
    expect(statusOf(f(run('r', 'failed', 'default/crew-0')), { seat: seat('idle', ['r']) })).toBe(PRESENCE.error);
    // A blocked worker is an error, as the workbench says.
    expect(statusOf(f(run('r', 'completed', 'default/crew-2')), { seat: seat('idle', ['r']) })).toBe(PRESENCE.error);
    // A worker that starts counts as asleep, and a member with no Task by its state.
    expect(statusOf(f(run('r', 'completed', 'default/new-0')), { seat: seat('idle', ['r']) })).toBe(PRESENCE.asleep);
    expect(statusOf(f(run('r', 'completed', 'front-0')), { seat: seat('asleep', ['r']) })).toBe(PRESENCE.idle);
  });

  it('says waiting for a worker while the newest run waits in the queue, and fired for a fired seat', () => {
    const f = factsOf(fleet, { r: run('r', 'queued') });
    expect(statusOf(f, { seat: seat('working', ['r']) })).toBe(WAITING);
    expect(statusOf(f, { seat: seat('working', ['r'], { fired: true }) })).toBe(PRESENCE.fired);
  });

  it('takes the presence of the bridge only where the page lacks the facts', () => {
    // No run: the bridge says it.
    expect(statusOf(factsOf(fleet), { seat: seat('asleep', ['r']) })).toBe(PRESENCE.asleep);
    expect(statusOf(factsOf(fleet), { seat: seat('working', []) })).toBe(PRESENCE.working);
    // A finished run on a worker that the page does not know: idle or asleep, the bridge says which.
    expect(statusOf(factsOf(fleet, { r: run('r', 'completed', 'default/gone-0') }), { seat: seat('asleep', ['r']) })).toBe(PRESENCE.asleep);
    expect(statusOf(factsOf(null, { r: run('r', 'completed') }), { seat: seat('idle', ['r']) })).toBe(PRESENCE.idle);
    // A run that decides alone needs no phase.
    expect(statusOf(factsOf(null, { r: run('r', 'running') }), { seat: seat('asleep', ['r']) })).toBe(PRESENCE.working);
    expect(statusOf(factsOf(null, { r: run('r', 'failed') }), { seat: seat('idle', ['r']) })).toBe(PRESENCE.error);
    expect(seatPresence(factsOf(null, { r: run('r', 'input-required') }), seat('idle', ['r']))).toBe('needs-you');
  });

  it('counts the awake workers for the headers', () => {
    expect(awakeCount(factsOf(fleet))).toBe(2);
    expect(awakeCount(factsOf(null))).toBe(0);
  });
});

describe('one state from the stream', () => {
  /** apply sends events of the stream through the reducer. */
  const apply = (s: State, ...events: [string, unknown][]) => events.reduce((x, [kind, data], i) => reduce(x, { type: 'stream', event: { id: String(i + 1), kind, data } }), s);

  it('moves the header, the seat, and the worker together on a task event', () => {
    let s: State = reduce(initialState, { type: 'fleet', fleet });
    s = reduce(s, { type: 'open-runs', runs: [run('r', 'input-required', 'default/crew-1')] });
    s = apply(s, ['run', run('r', 'completed', 'default/crew-1')]);
    const words = (st: State) => {
      const f = selectFacts(st);
      return [awakeCount(f), statusOf(f, { seat: seat('asleep', ['r']) })!.word, statusOf(f, { worker: 'default/crew-1' })!.word];
    };
    expect(words(s)).toEqual([2, 'asleep', 'asleep']);
    s = apply(s, ['task', { kind: 'task', member: 'default/crew-1', phase: 'Running', time: '' }]);
    expect(words(s)).toEqual([3, 'idle', 'awake']);
  });

  it('keeps the facts as one object while they stay the same', () => {
    const s: State = reduce(initialState, { type: 'fleet', fleet });
    expect(selectFacts(s)).toBe(selectFacts({ ...s }));
    expect(selectFacts(s).openRuns).toBe(false);
    expect(selectFacts(reduce(s, { type: 'open-runs', runs: [] })).openRuns).toBe(true);
  });
});

describe('awakeFor', () => {
  it('says whether a read of a run finds its worker awake', () => {
    const f = factsOf(fleet);
    expect(awakeFor(f, run('r', 'running', 'default/crew-1'))).toBe(true);
    expect(awakeFor(f, run('r', 'queued'))).toBe(true);
    expect(awakeFor(f, run('r', 'completed', 'default/crew-0'))).toBe(true);
    expect(awakeFor(f, run('r', 'completed', 'default/crew-1'))).toBe(false);
    expect(awakeFor(f, run('r', 'input-required', 'crew-1'))).toBe(false);
    expect(awakeFor(f, run('r', 'completed', 'default/new-0'))).toBe(false);
    // The page cannot tell: no run, no member, or a worker that it does not know.
    expect(awakeFor(f, undefined)).toBeNull();
    expect(awakeFor(f, run('r', 'completed'))).toBeNull();
    expect(awakeFor(f, run('r', 'completed', 'default/gone-0'))).toBeNull();
  });
});
