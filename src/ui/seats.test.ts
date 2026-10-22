import { describe, expect, it } from 'vitest';
import type { Agent, FaceMeta, Fleet, Member } from '../api/types';
import { draftOf, freeWords, pickGroups, seatReason, taskOfGoal, wavesLine } from './seats';
import { fleetAgents } from '../lib/agents';

const fleet: Fleet = {
  name: 'front-0',
  members: [
    { name: 'default/crew-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 2, inputRequired: 0 },
    { name: 'default/crew-1', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 1, inputRequired: 0 },
    { name: 'default/crew-2', state: 'suspended', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
    { name: 'default/review-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 1, inputRequired: 0 },
  ],
  pools: [
    { name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 3, actual: 3, ready: 2, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }, { name: 'crew-1', phase: 'Running', current: true }, { name: 'crew-2', phase: 'Suspended', current: true }] },
    { name: 'review', atespace: 'default', agent: 'reviewer', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'review-0', phase: 'Running', current: true }] },
  ],
};

const agents: Agent[] = [
  { name: 'migrator', role: 'owner', description: 'Moves modules.' },
  { name: 'reviewer', role: 'operator' },
  { name: 'scribe', role: 'operator', description: 'Writes notes.' },
  { name: 'secret', role: 'viewer' },
];
const faces: Record<string, FaceMeta> = {
  migrator: { agent: 'migrator', displayName: 'Migrator', tagline: 'Turns manifests into roles', hash: 'h', custom: false },
};
const seat = (handle: string, agent: string, over: Partial<Member> = {}): Member => ({ handle, agent, task: 't', runs: [], fired: false, muted: false, presence: 'working', ...over });

describe('pickGroups', () => {
  it('puts the agents with a seat first, and leaves out an agent the person cannot seat', () => {
    const g = pickGroups(agents, faces, [seat('migrator-1', 'migrator'), seat('scribe', 'scribe', { fired: true, presence: 'fired' })], fleet);
    expect(g.here.map((r) => r.agent)).toEqual(['migrator']);
    expect(g.others.map((r) => r.agent)).toEqual(['reviewer', 'scribe']);
  });

  it('names an agent and its tagline from its face, or from the agent', () => {
    const g = pickGroups(agents, faces, [], fleet);
    expect(g.others[0]).toMatchObject({ name: 'Migrator', tagline: 'Turns manifests into roles' });
    expect(g.others[2]).toMatchObject({ name: 'Scribe', tagline: 'Writes notes.' });
  });

  it('counts the free workers of each agent, less the new seats that wait', () => {
    const g = pickGroups(agents, faces, [], fleet);
    expect(g.others.map((r) => r.free)).toEqual([1, 0, 0]);
    expect(pickGroups(agents, faces, [], fleet, '', ['migrator']).others[0].free).toBe(0);
    expect(pickGroups(agents, faces, [], null).others[0].free).toBe(-1);
  });

  it('keeps the agents that match the field Who', () => {
    expect(pickGroups(agents, faces, [], fleet, 'manifests').others.map((r) => r.agent)).toEqual(['migrator']);
    expect(pickGroups(agents, faces, [], fleet, 'REVIEW').others.map((r) => r.agent)).toEqual(['reviewer']);
    expect(pickGroups(agents, faces, [], fleet, 'nobody').others).toEqual([]);
  });
});

describe('pickGroups over the agents of the fleet', () => {
  // The front names only its own profile, default, which no pool runs. The
  // pools run the migrator and the reviewer, and a member holds the tester.
  const withMember: Fleet = { ...fleet, members: [...fleet.members, { name: 'default/test-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [{ name: 'tester', role: 'operator' }], active: 0, inputRequired: 0 }] };
  const list = fleetAgents(withMember, [{ name: 'default', role: 'owner' }]);

  it('offers the agents that the pools run and that the members hold, and never the profile of the front alone', () => {
    const g = pickGroups(list, faces, [], withMember);
    expect(g.here).toEqual([]);
    expect(g.others.map((r) => r.agent)).toEqual(['migrator', 'reviewer', 'tester']);
    expect(g.others.map((r) => r.free)).toEqual([1, 0, 0]);
  });

  it('holds the agents of the seats in On this bridge, also an agent that the fleet does not list', () => {
    const g = pickGroups(list, faces, [seat('reviewer', 'reviewer'), seat('scribe', 'scribe'), seat('migrator-1', 'migrator')], withMember);
    expect(g.here.map((r) => r.agent)).toEqual(['reviewer', 'scribe', 'migrator']);
    expect(g.others.map((r) => r.agent)).toEqual(['tester']);
  });
});

describe('freeWords', () => {
  it('says how many workers are free, or that a seat waits', () => {
    expect(freeWords(1)).toBe('1 free');
    expect(freeWords(2)).toBe('2 free');
    expect(freeWords(0)).toBe('waiting for a worker');
  });
});

describe('the new seat', () => {
  it('fills the task from the first sentence of the goal', () => {
    expect(taskOfGoal('Migrate the logrotate module. Then test it.')).toBe('Migrate the logrotate module');
    expect(taskOfGoal('  Write   the notes!  ')).toBe('Write the notes');
    expect(taskOfGoal('', 'Release notes for 2.4')).toBe('Release notes for 2.4');
  });

  it('takes the next free handle of the agent, never a reserved one', () => {
    expect(draftOf(1, 'migrator', ['migrator-1', 'migrator-2', 'reviewer'], 'Migrate logrotate.')).toEqual({ id: 1, agent: 'migrator', handle: 'migrator-3', task: 'Migrate logrotate' });
    expect(draftOf(2, 'scribe', ['migrator-1'], 'x').handle).toBe('scribe');
    expect(draftOf(3, 'manager', [], 'x').handle).toBe('manager-1');
    expect(draftOf(4, 'operator', [], 'x').handle).toBe('operator-1');
  });

  it('gives the reason of a bad handle', () => {
    expect(seatReason('reviewer', ['reviewer'])).toMatch(/has a seat on this bridge/);
    expect(seatReason('manager', [])).toMatch(/reserved/);
    expect(seatReason('-x', [])).toMatch(/starts with a letter or a digit/);
    expect(seatReason('migrator-3', ['migrator-1'])).toBe('');
  });
});

describe('wavesLine', () => {
  it('says that the seats run in waves when they outnumber the workers of their agents', () => {
    const seats = [seat('migrator-1', 'migrator'), seat('migrator-2', 'migrator'), seat('migrator-3', 'migrator'), seat('reviewer', 'reviewer'), seat('reviewer-2', 'reviewer')];
    expect(wavesLine(seats, fleet)).toBe('Runs in waves: 5 seats share 4 workers.');
  });

  it('says nothing when the workers suffice, when the fleet is not known, or when no worker exists', () => {
    expect(wavesLine([seat('migrator-1', 'migrator'), seat('reviewer', 'reviewer')], fleet)).toBe('');
    expect(wavesLine([seat('migrator-1', 'migrator'), seat('migrator-2', 'migrator'), seat('m3', 'migrator'), seat('m4', 'migrator')], null)).toBe('');
    expect(wavesLine([seat('scribe', 'scribe'), seat('scribe-2', 'scribe')], fleet)).toBe('');
  });

  it('counts no fired seat, and says worker for one', () => {
    const seats = [seat('reviewer', 'reviewer'), seat('reviewer-2', 'reviewer'), seat('reviewer-3', 'reviewer', { fired: true, presence: 'fired' })];
    expect(wavesLine(seats, fleet)).toBe('Runs in waves: 2 seats share 1 worker.');
    expect(wavesLine(seats.slice(0, 1).concat(seats[2]), fleet)).toBe('');
  });
});
