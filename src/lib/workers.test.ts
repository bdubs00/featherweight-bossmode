import { describe, expect, it } from 'vitest';
import type { Fleet } from '../api/types';
import { workersOf } from './workers';
import { awakeCount, factsOf } from './status';

const fleet: Fleet = {
  name: 'front-0',
  members: [
    { name: 'default/crew-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 2, inputRequired: 0 },
    { name: 'default/crew-1', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
    { name: 'default/crew-2', state: 'suspended', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
  ],
  pools: [
    {
      name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 3, actual: 3, ready: 2, hash: 'h', checkedAt: '',
      tasks: [
        { name: 'crew-0', phase: 'Running', current: true },
        { name: 'crew-1', phase: 'Running', current: true },
        { name: 'crew-2', phase: 'Suspended', current: true },
      ],
    },
  ],
};

describe('workersOf', () => {
  it('counts the workers of an agent, busy and free', () => {
    const w = workersOf(factsOf(fleet), 'migrator');
    expect(w.keep).toBe(3);
    expect(w.workers.map((x) => x.name)).toEqual(['crew-0', 'crew-1', 'crew-2']);
    expect(w.awake).toBe(2);
    expect(w.busy).toBe(1);
    expect(w.free).toBe(2);
  });

  it('gives zeros to an agent with no worker and to no fleet', () => {
    expect(workersOf(factsOf(fleet), 'scribe')).toEqual({ keep: 0, workers: [], awake: 0, busy: 0, free: 0 });
    expect(workersOf(null, 'migrator').free).toBe(0);
    expect(workersOf(factsOf(null), 'migrator').free).toBe(0);
  });
});

describe('workersOf with the open runs', () => {
  it('counts a worker busy while it holds an open run, once the page read the open runs', () => {
    const runs = {
      a: { id: 'a', agent: 'migrator', state: 'running' as const, seq: 1, createdAt: '', updatedAt: '', member: 'default/crew-1' },
      b: { id: 'b', agent: 'migrator', state: 'completed' as const, seq: 1, createdAt: '', updatedAt: '', member: 'default/crew-0' },
    };
    const w = workersOf(factsOf(fleet, runs, true), 'migrator');
    // The count of the fleet view says crew-0 is busy, and the runs say crew-1 is: the runs win.
    expect(w.workers.map((x) => x.name + ':' + x.busy)).toEqual(['crew-0:false', 'crew-1:true', 'crew-2:false']);
    expect(w.free).toBe(2);
  });
});

describe('awakeCount', () => {
  it('counts the awake workers of the fleet', () => {
    expect(awakeCount(factsOf(fleet))).toBe(2);
    expect(awakeCount(factsOf(null))).toBe(0);
  });
});
