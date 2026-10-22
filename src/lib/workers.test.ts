import { describe, expect, it } from 'vitest';
import type { Fleet } from '../api/types';
import { awakeWorkers, workersOf } from './workers';

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
    const w = workersOf(fleet, 'migrator');
    expect(w.keep).toBe(3);
    expect(w.workers.map((x) => x.name)).toEqual(['crew-0', 'crew-1', 'crew-2']);
    expect(w.awake).toBe(2);
    expect(w.busy).toBe(1);
    expect(w.free).toBe(2);
  });

  it('gives zeros to an agent with no worker and to no fleet', () => {
    expect(workersOf(fleet, 'scribe')).toEqual({ keep: 0, workers: [], awake: 0, busy: 0, free: 0 });
    expect(workersOf(null, 'migrator').free).toBe(0);
  });
});

describe('awakeWorkers', () => {
  it('counts the awake workers of the fleet', () => {
    expect(awakeWorkers(fleet)).toBe(2);
    expect(awakeWorkers(null)).toBe(0);
  });
});
