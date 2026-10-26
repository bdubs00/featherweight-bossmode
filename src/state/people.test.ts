import { describe, expect, it } from 'vitest';
import type { Agent, Bridge, Fleet, Member, Run, Skill } from '../api/types';
import { poolName } from '../lib/workers';
import type { Roster } from './reducer';
import {
  NOT_ON_A_BRIDGE,
  capacityWords,
  filterPeople,
  filterStatus,
  firstPerson,
  likedOf,
  parseKeep,
  peopleCount,
  peopleOf,
  rulesOf,
  seatOnWorker,
  slashCommands,
  stripOf,
  type PeopleInput,
} from './people';
import { parseSlash } from '../lib/mention';
import { workersOf } from '../lib/workers';
import { factsOf } from '../lib/status';
import { fleetAgents } from '../lib/agents';

const bridge = (id: string, title: string, state: 'open' | 'closed' = 'open'): Bridge => ({
  id,
  title,
  goal: '',
  operator: '',
  state,
  placement: 'queue',
  createdAt: '2026-10-21T20:00:00Z',
  closedAt: null,
  delegation: { approve: false, budget: false, members: false, report: true },
  caps: { maxMessages: 1, maxFanoutPerMinute: 1, maxPairMessages: 1 },
  lastSeq: 0,
  read: 0,
  unread: 0,
});

const seat = (handle: string, agent: string, presence: Member['presence'], extra: Partial<Member> = {}): Member => ({ handle, agent, task: 'Task of ' + handle, runs: ['run-' + handle], fired: false, muted: false, presence, ...extra });

const roster = (members: Member[]): Roster => ({ order: members.map((m) => m.handle), byHandle: Object.fromEntries(members.map((m) => [m.handle, m])) });

const run = (id: string, state: Run['state'], member?: string): Run => ({ id, agent: 'a', state, seq: 1, createdAt: '', updatedAt: '', member });

const fleet: Fleet = {
  name: 'front',
  members: [
    { name: 'default/crew-0', state: 'live', lastSeen: '2026-10-21T20:00:00Z', canForward: true, accessMode: '', agents: [], active: 1, inputRequired: 0 },
    { name: 'default/crew-1', state: 'suspended', lastSeen: '2026-10-21T19:46:00Z', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
    { name: 'default/boss-0', state: 'live', lastSeen: '2026-10-21T20:00:00Z', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
  ],
  pools: [
    { name: 'crew', atespace: 'default', agent: 'migrator', intake: '', wanted: 2, actual: 2, ready: 2, hash: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }, { name: 'crew-1', phase: 'Suspended', current: true }], checkedAt: '' },
    { name: 'boss', atespace: 'default', agent: 'manager', intake: '', wanted: 1, actual: 1, ready: 1, hash: '', tasks: [{ name: 'boss-0', phase: 'Running', current: true }], checkedAt: '' },
    { name: 'sleepy', atespace: 'default', agent: 'scribe', intake: '', wanted: 1, actual: 1, ready: 1, hash: '', tasks: [{ name: 'sleepy-0', phase: 'Suspended', current: true }], checkedAt: '' },
  ],
};

const agents: Agent[] = ['scribe', 'migrator', 'manager', 'reviewer', 'idler'].map((name) => ({ name, role: 'owner' }));

function input(): PeopleInput {
  return {
    bridges: { order: ['b2', 'b1', 'b3'], byId: { b1: bridge('b1', 'Migrate Puppet'), b2: bridge('b2', 'Release notes'), b3: bridge('b3', 'Old work', 'closed') } },
    rosters: {
      b1: roster([seat('migrator-1', 'migrator', 'working'), seat('gone', 'reviewer', 'fired', { fired: true }), seat('migrator-2', 'migrator', 'needs-you')]),
      b2: roster([seat('reviewer', 'reviewer', 'idle')]),
      b3: roster([seat('old', 'idler', 'idle')]),
    },
    runs: { 'run-migrator-1': run('run-migrator-1', 'queued') },
    agents,
    fleet,
  };
}

describe('the people list', () => {
  it('groups the seats of the open bridges in the order of the bridges, with Not on a bridge last', () => {
    const groups = peopleOf(input());
    expect(groups.map((g) => g.title)).toEqual(['Release notes', 'Migrate Puppet', NOT_ON_A_BRIDGE]);
    expect(groups[0].href).toBe('#bridge/b2');
    expect(groups[2].href).toBeUndefined();
  });

  it('keeps the order of the roster and puts a fired seat last, out of the count', () => {
    const g = peopleOf(input())[1];
    expect(g.rows.map((r) => r.handle)).toEqual(['migrator-1', 'migrator-2', 'gone']);
    expect(g.count).toBe(2);
    expect(g.rows[0].href).toBe('#member/b1/migrator-1');
  });

  it('lists the agents with no seat on an open bridge by name, also an agent of a closed bridge', () => {
    const g = peopleOf(input())[2];
    expect(g.rows.map((r) => r.handle)).toEqual(['idler', 'manager', 'scribe']);
    expect(g.rows[1].href).toBe('#fleet/manager');
    // A fired seat does not seat its agent, so reviewer sits on b2 only and stays out.
    expect(g.rows.some((r) => r.handle === 'reviewer')).toBe(false);
  });

  it('shows Not on a bridge only when every open bridge has its roster', () => {
    const s = input();
    delete s.rosters.b2;
    expect(peopleOf(s).map((g) => g.title)).toEqual(['Migrate Puppet']);
  });

  it('counts every row but a fired seat', () => {
    expect(peopleCount(peopleOf(input()))).toBe(6);
  });

  it('finds a member by handle, task, agent, or bridge, with every word', () => {
    const groups = peopleOf(input());
    expect(filterPeople(groups, 'MIGRATOR-2').flatMap((g) => g.rows.map((r) => r.handle))).toEqual(['migrator-2']);
    expect(filterPeople(groups, 'release').flatMap((g) => g.rows.map((r) => r.handle))).toEqual(['reviewer']);
    expect(filterPeople(groups, 'task migrator-1').flatMap((g) => g.rows.map((r) => r.handle))).toEqual(['migrator-1']);
    expect(filterPeople(groups, 'nobody')).toEqual([]);
    expect(filterPeople(groups, '  ')).toBe(groups);
  });

  it('opens a seat that needs you first, else the first seat', () => {
    expect(firstPerson(peopleOf(input()))!.handle).toBe('migrator-2');
    const s = input();
    s.rosters.b1 = roster([seat('migrator-1', 'migrator', 'idle')]);
    expect(firstPerson(peopleOf(s))!.handle).toBe('reviewer');
    expect(firstPerson([])).toBeNull();
  });
});

describe('the presence words', () => {
  it('says waiting for a worker for a working seat whose newest run waits in the queue', () => {
    const s = input();
    const rows = peopleOf(s)[1].rows;
    expect(rows[0].light!.word).toBe('waiting for a worker');
    expect(rows[1].light!.word).toBe('needs you');
    expect(rows[1].light!.tone).toBe('amber');
    expect(rows[2].light!.word).toBe('fired');
    expect(rows[2].light!.struck).toBe(true);
  });

  it('gives an agent its free workers, and no words without a worker', () => {
    expect(capacityWords(workersOf(factsOf(fleet), 'migrator'))).toBe('1 worker free');
    expect(capacityWords(workersOf(factsOf(fleet), 'scribe'))).toBe('1 worker free');
    // An agent with no worker gets no words: no row says Keep 0.
    expect(capacityWords(workersOf(factsOf(fleet), 'idler'))).toBe('');
    const busy = workersOf(factsOf({ ...fleet, members: fleet.members.map((x) => ({ ...x, active: 1 })) }), 'manager');
    expect(capacityWords(busy)).toBe('waiting for a worker');
  });
});

describe('Not on a bridge, from the agents of the fleet', () => {
  // The front names only its own profile, default. The pools run the
  // migrator and the scribe, and a member holds the writer.
  const real: Fleet = {
    ...fleet,
    members: [...fleet.members, { name: 'default/notes-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [{ name: 'writer', role: 'operator' }], active: 0, inputRequired: 0 }],
  };
  const own: Agent[] = [{ name: 'default', role: 'owner' }];
  const base = (): PeopleInput => ({ ...input(), agents: fleetAgents(real, own, []), fleet: real });

  it('lists the agents of the pools and of the members, and leaves out a profile of the front with no pool and no run', () => {
    const last = peopleOf(base()).pop()!;
    expect(last.title).toBe(NOT_ON_A_BRIDGE);
    expect(last.rows.map((r) => r.handle)).toEqual(['manager', 'scribe', 'writer']);
    expect(last.rows.map((r) => r.task)).toEqual(['1 worker free', '1 worker free', '']);
    expect(peopleOf(base()).flatMap((g) => g.rows).some((r) => /Keep/.test(r.task))).toBe(false);
  });

  it('shows a profile of the front once the page knows a run of it', () => {
    const s = { ...base(), agents: fleetAgents(real, own, ['default']) };
    const last = peopleOf(s).pop()!;
    expect(last.rows.map((r) => r.handle)).toContain('default');
    expect(last.rows.find((r) => r.handle === 'default')!.light).toBeNull();
  });
});

describe('the board', () => {
  it('counts the statuses of a group in the order of attention', () => {
    const rows = peopleOf(input())[1].rows;
    expect(stripOf(rows).map((s) => [s.word, s.count])).toEqual([
      ['needs you', 1],
      ['waiting for a worker', 1],
      ['fired', 1],
    ]);
  });

  it('filters to one status and drops a group with none', () => {
    const groups = filterStatus(peopleOf(input()), 'needs you');
    expect(groups.map((g) => g.title)).toEqual(['Migrate Puppet']);
    expect(groups[0].rows.map((r) => r.handle)).toEqual(['migrator-2']);
    expect(filterStatus(peopleOf(input()), '').length).toBe(3);
  });
});

describe('the slash menu', () => {
  const skills: Skill[] = [
    { name: 'plan', description: 'Plan a module.', origin: 'local', argumentHint: '<module>' },
    { name: 'hidden', description: 'Only for the model.', origin: 'local', userInvocable: false },
    { name: 'notes', description: 'Write notes.', origin: 'imported' },
    { name: 'docs/audit', description: 'Audit a role.', origin: 'mcp', server: 'docs', argumentHint: '[role]' },
  ];
  const migrator = ['plan', 'hidden', 'docs/audit'];

  it('offers the skills that the agent can load and a person can invoke, each with the hint of its arguments', () => {
    expect(slashCommands(skills, migrator)).toEqual([
      { name: 'docs/audit', description: 'Audit a role.', hint: '[role]' },
      { name: 'plan', description: 'Plan a module.', hint: '<module>' },
    ]);
    expect(slashCommands(skills, ['notes'])).toEqual([{ name: 'notes', description: 'Write notes.' }]);
    expect(slashCommands(null, ['notes'])).toEqual([]);
    expect(slashCommands(skills, undefined)).toEqual([]);
  });

  it('reads a command of the list at the start of the text, and leaves any other text alone', () => {
    expect(parseSlash('/plan cron and nginx', ['plan'])).toEqual({ name: 'plan', args: 'cron and nginx' });
    expect(parseSlash('/plan', ['plan'])).toEqual({ name: 'plan', args: '' });
    expect(parseSlash('/other x', ['plan'])).toBeNull();
    expect(parseSlash('please /plan x', ['plan'])).toBeNull();
  });
});

describe('the Keep field', () => {
  it('takes a whole number, 0 or more', () => {
    expect(parseKeep('3')).toEqual({ value: 3 });
    expect(parseKeep(' 0 ')).toEqual({ value: 0 });
    for (const bad of ['', '-1', '2.5', 'two', '99999']) expect(parseKeep(bad)).toEqual({ error: 'Keep is a whole number, 0 or more.' });
  });

  it('names the pool of an agent without saying pool to a person', () => {
    expect(poolName('migrator')).toBe('migrator');
    expect(poolName('Release.Notes_v2')).toBe('release-notes-v2');
  });
});

describe('the profile', () => {
  it('names the seat that a worker serves from the newest run of a seat', () => {
    const seats = [
      { bridge: 'b1', member: seat('migrator-1', 'migrator', 'working') },
      { bridge: 'b1', member: seat('migrator-2', 'migrator', 'idle') },
    ];
    const runs = { 'run-migrator-1': run('run-migrator-1', 'running', 'default/crew-0'), 'run-migrator-2': run('run-migrator-2', 'completed', 'default/crew-1') };
    expect(seatOnWorker('crew-0', seats, runs)).toBe('migrator-1');
    // A finished run sits on no worker.
    expect(seatOnWorker('crew-1', seats, runs)).toBe('');
  });

  it('names the rules that held a call of the agent', () => {
    const runs: Record<string, Run> = {
      r1: { ...run('r1', 'input-required'), agent: 'migrator', pending: { id: 'p', reason: 'rule: ask bash: git push*' } },
      r2: { ...run('r2', 'input-required'), agent: 'scribe', pending: { id: 'q', reason: 'Who reads these notes first?' } },
    };
    expect(rulesOf('migrator', runs, {})).toEqual(['bash: git push*']);
    expect(rulesOf('scribe', runs, {})).toEqual([]);
  });

  it('reads each heart of the front as its parts, in the order of the front, which puts the newest first', () => {
    const text = [
      '# What people liked from reviewer',
      '',
      'The front adds an entry for each heart. The newest entry comes first.',
      '',
      '## 2026-10-22, bridge "boss A 20261022-032331" (01m5h7wt3wxph1gxc34gqz2tnq), reviewer, run 01M5H7WXC6MCR0QGT4CM8JAX0B',
      '',
      '- What token asked: Reply with the single word READY and nothing else. Use no tool.',
      '- What reviewer did: ACK',
      '- The note of token: boss heart 20261022-032331',
      '- [Open the run](#run/01M5H7WXC6MCR0QGT4CM8JAX0B)',
      '',
      '## 2026-10-21, bridge "Migrate Puppet" (b1), reviewer-2, run 01RUN2',
      '',
      '- What alice asked: Review roles/cron',
      '  against its manifest.',
      '- What reviewer did: Named the one change of behavior.',
      '- [Open the run](#run/01RUN2)',
      '',
    ].join('\n');
    expect(likedOf(text)).toEqual([
      { did: 'ACK', asked: 'Reply with the single word READY and nothing else. Use no tool.', note: 'boss heart 20261022-032331', run: '01M5H7WXC6MCR0QGT4CM8JAX0B', bridge: '01m5h7wt3wxph1gxc34gqz2tnq', handle: 'reviewer' },
      { did: 'Named the one change of behavior.', asked: 'Review roles/cron against its manifest.', run: '01RUN2', bridge: 'b1', handle: 'reviewer-2' },
    ]);
  });

  it('reads an entry in paragraphs, as an older front wrote them, and a page with no entry', () => {
    const text = '# What people liked from migrator\n\n## 2026-10-21, bridge b, migrator-2\n\nBob hearted: Pushed the branch.\n\nTheir note: Ran the lint first.\n\n## 2026-10-20, bridge b, migrator-1\n\nAlice hearted: Kept the hiera names. [run](#)\n';
    expect(likedOf(text)).toEqual([{ did: 'Pushed the branch.', note: 'Ran the lint first.' }, { did: 'Kept the hiera names.' }]);
    expect(likedOf('# Nothing yet\n')).toEqual([]);
  });
});
