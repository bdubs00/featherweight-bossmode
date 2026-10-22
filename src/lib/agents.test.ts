import { describe, expect, it } from 'vitest';
import type { Agent, Fleet } from '../api/types';
import { canSeat, fleetAgents } from './agents';

// A fleet as the real front shows it: the front itself holds no agent, the
// pools run the migrator and the reviewer, and other members hold agents
// with no pool. GET /v1/agents names only the profile of the front.
const fleet: Fleet = {
  name: 'front-0',
  members: [
    { name: 'front-0', self: true, state: 'live', lastSeen: '', canForward: false, accessMode: 'rules', agents: [{ name: 'default', role: 'owner' }], active: 0, inputRequired: 0 },
    { name: 'default/crew-migrator-0', state: 'quiet', lastSeen: '', canForward: true, accessMode: 'rules', agents: [{ name: 'bootstrap', role: 'owner' }, { name: 'migrator', role: 'owner', description: 'Migrates modules.' }], active: 0, inputRequired: 0 },
    { name: 'default/tickets-0', state: 'quiet', lastSeen: '', canForward: true, accessMode: 'rules', agents: [{ name: 'triage', role: 'viewer' }], active: 0, inputRequired: 0 },
  ],
  pools: [
    { name: 'crew-migrator', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-migrator-0', phase: 'Suspended', current: true }] },
    { name: 'crew-reviewer', atespace: 'default', agent: 'reviewer', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [] },
  ],
};
const own: Agent[] = [{ name: 'default', role: 'owner', description: 'The front.' }];

describe('fleetAgents', () => {
  it('names the agents of the pools and of the members, by name, and never the profile of the front alone', () => {
    expect(fleetAgents(fleet, own).map((a) => a.name)).toEqual(['bootstrap', 'migrator', 'reviewer', 'triage']);
  });

  it('keeps the role and the description that a member names, and no role for an agent of a pool alone', () => {
    const list = fleetAgents(fleet, own);
    expect(list.find((a) => a.name === 'migrator')).toEqual({ name: 'migrator', role: 'owner', description: 'Migrates modules.' });
    expect(list.find((a) => a.name === 'reviewer')!.role).toBe('');
    expect(list.find((a) => a.name === 'triage')!.role).toBe('viewer');
  });

  it('shows a profile of the front once the page knows a run of it, and merges a profile of the front into an agent of the fleet', () => {
    expect(fleetAgents(fleet, own, ['default']).map((a) => a.name)).toContain('default');
    const both = fleetAgents(fleet, [{ name: 'reviewer', role: 'operator', tools: ['bash'] }]);
    expect(both.find((a) => a.name === 'reviewer')).toEqual({ name: 'reviewer', role: 'operator', tools: ['bash'], description: undefined });
  });

  it('reads the profiles of the front alone when the fleet is not known', () => {
    expect(fleetAgents(null, own)).toEqual([]);
    expect(fleetAgents(null, own, ['default']).map((a) => a.name)).toEqual(['default']);
  });
});

describe('canSeat', () => {
  it('lets an owner, an operator, and a role that the page cannot tell seat an agent, and not a viewer', () => {
    expect(canSeat({ role: 'owner' })).toBe(true);
    expect(canSeat({ role: 'operator' })).toBe(true);
    expect(canSeat({ role: '' })).toBe(true);
    expect(canSeat({ role: 'viewer' })).toBe(false);
  });
});
