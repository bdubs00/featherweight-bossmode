import { describe, expect, it } from 'vitest';
import { entriesOf, initialState, managerRunOf, membersOf, reduce, type State } from './reducer';
import type { Bridge, Entry, Member, StreamEvent } from '../api/types';

const me = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true };

function bridge(id: string, over: Partial<Bridge> = {}): Bridge {
  return {
    id,
    title: 'Bridge ' + id,
    goal: 'A goal',
    operator: 'alice@example.com',
    state: 'open',
    placement: 'queue',
    createdAt: '2026-10-21T10:00:00Z',
    closedAt: null,
    delegation: { approve: false, budget: false, members: false, report: true },
    caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6 },
    lastSeq: 2,
    read: 2,
    unread: 0,
    ...over,
  };
}

function member(handle: string, over: Partial<Member> = {}): Member {
  return { handle, agent: handle.replace(/-\d+$/, ''), task: 'Do ' + handle, runs: ['run-' + handle], fired: false, muted: false, presence: 'working', ...over };
}

function entry(seq: number, over: Partial<Entry> = {}): Entry {
  return { seq, at: '2026-10-21T10:0' + (seq % 10) + ':00Z', from: { kind: 'agent', handle: 'migrator-1', run: 'r1' }, text: 'message ' + seq, ...over };
}

const ev = (kind: string, data: unknown, id = String(Math.random())): StreamEvent => ({ id, kind, data });

/** setup builds a state with two bridges, a loaded channel, and a roster. */
function setup(): State {
  let s = reduce(initialState, { type: 'me', me });
  s = reduce(s, { type: 'bridges', bridges: [bridge('b1'), bridge('b2', { createdAt: '2026-10-21T11:00:00Z' })] });
  s = reduce(s, { type: 'bridge', bridge: { ...bridge('b1'), members: [member('migrator-1'), member('reviewer', { presence: 'idle' })] } });
  s = reduce(s, { type: 'channel', bridge: 'b1', mode: 'latest', page: { bridge: 'b1', messages: [entry(1), entry(2)], next: 0, prev: 0 } });
  return s;
}

describe('the reducer', () => {
  it('sorts bridges open first, then the newest first', () => {
    let s = setup();
    expect(s.bridges.order).toEqual(['b2', 'b1']);
    s = reduce(s, { type: 'bridge', bridge: bridge('b2', { state: 'closed' }) });
    expect(s.bridges.order).toEqual(['b1', 'b2']);
  });

  it('appends a new message of the stream to a loaded channel', () => {
    const s0 = setup();
    const s1 = reduce(s0, { type: 'stream', event: ev('bridge.message', { bridge: 'b1', message: entry(3) }, '10') });
    expect(entriesOf(s1.channels.b1).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(s1.bridges.byId.b1.lastSeq).toBe(3);
    expect(s1.stream.lastId).toBe('10');
    // The rows that did not change keep their objects.
    expect(s1.channels.b1.bySeq[1]).toBe(s0.channels.b1.bySeq[1]);
    expect(s1.channels.b1.bySeq[2]).toBe(s0.channels.b1.bySeq[2]);
  });

  it('replaces an entry in place when a decision changes', () => {
    const card = entry(3, { from: { kind: 'system' }, decision: { run: 'r2', id: 'ap1', label: 'Run command', state: 'pending' } });
    let s = reduce(setup(), { type: 'entry', bridge: 'b1', entry: card });
    const before = s.channels.b1;
    s = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b1', message: { ...card, decision: { ...card.decision!, state: 'allow', decidedBy: 'alice@example.com' } } }) });
    expect(s.channels.b1.seqs).toBe(before.seqs);
    expect(s.channels.b1.bySeq[3].decision!.state).toBe('allow');
    expect(s.channels.b1.bySeq[2]).toBe(before.bySeq[2]);
  });

  it('applies the same event twice as once', () => {
    const e = ev('bridge.message', { bridge: 'b2', message: entry(3) });
    const s1 = reduce(setup(), { type: 'stream', event: e });
    const s2 = reduce(s1, { type: 'stream', event: e });
    expect(s2.bridges.byId.b2.unread).toBe(1);
    expect(s2.channels).toBe(s1.channels);
  });

  it('counts unread messages of a bridge that is not open', () => {
    let s = setup();
    s = reduce(s, { type: 'open', bridge: 'b1' });
    s = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b2', message: entry(3) }) });
    s = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b2', message: entry(4, { from: { kind: 'person', name: 'bob@example.com' } }) }) });
    expect(s.bridges.byId.b2.unread).toBe(2);
    // The open bridge counts nothing and moves its read mark.
    s = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b1', message: entry(3) }) });
    expect(s.bridges.byId.b1.unread).toBe(0);
    expect(s.bridges.byId.b1.read).toBe(3);
  });

  it('counts no message of the caller and no plain system line', () => {
    let s = setup();
    s = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b2', message: entry(3, { from: { kind: 'person', name: 'alice@example.com' } }) }) });
    s = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b2', message: entry(4, { from: { kind: 'system' }, event: 'started' }) }) });
    expect(s.bridges.byId.b2.unread).toBe(0);
    s = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b2', message: entry(5, { from: { kind: 'system' }, decision: { run: 'r', id: 'a', label: 'Allow', state: 'pending' } }) }) });
    expect(s.bridges.byId.b2.unread).toBe(1);
  });

  it('clears the count on read', () => {
    let s = reduce(setup(), { type: 'stream', event: ev('bridge.message', { bridge: 'b2', message: entry(3) }) });
    s = reduce(s, { type: 'read', bridge: 'b2', seq: 3 });
    expect(s.bridges.byId.b2.unread).toBe(0);
    expect(s.bridges.byId.b2.read).toBe(3);
  });

  it('keeps the open bridge at zero when a record of the server arrives', () => {
    let s = setup();
    s = reduce(s, { type: 'open', bridge: 'b1' });
    s = reduce(s, { type: 'bridge', bridge: bridge('b1', { lastSeq: 12, read: 2, unread: 10 }) });
    expect(s.bridges.byId.b1.unread).toBe(0);
    expect(s.bridges.byId.b1.read).toBe(12);
    // Another bridge keeps the count of the server, and a read mark never moves back.
    s = reduce(s, { type: 'read', bridge: 'b2', seq: 5 });
    s = reduce(s, { type: 'bridges', bridges: [bridge('b1', { lastSeq: 12 }), bridge('b2', { lastSeq: 5, read: 2, unread: 3 })] });
    expect(s.bridges.byId.b2.read).toBe(5);
    expect(s.bridges.byId.b2.unread).toBe(0);
  });

  it('keeps an old entry out of a channel that has earlier pages to load', () => {
    let s = reduce(initialState, { type: 'bridges', bridges: [bridge('b1', { lastSeq: 60 })] });
    s = reduce(s, { type: 'channel', bridge: 'b1', mode: 'latest', page: { bridge: 'b1', messages: [entry(50), entry(60)], next: 0, prev: 50 } });
    const s2 = reduce(s, { type: 'stream', event: ev('bridge.message', { bridge: 'b1', message: entry(10) }) });
    expect(s2.channels.b1).toBe(s.channels.b1);
    // Load earlier adds the page in front.
    const s3 = reduce(s2, { type: 'channel', bridge: 'b1', mode: 'older', page: { bridge: 'b1', messages: [entry(10), entry(20)], next: 50, prev: 0 } });
    expect(entriesOf(s3.channels.b1).map((e) => e.seq)).toEqual([10, 20, 50, 60]);
    expect(s3.channels.b1.prev).toBe(0);
  });

  it('closes a bridge on its closed line', () => {
    const s = reduce(setup(), { type: 'stream', event: ev('bridge.message', { bridge: 'b2', message: entry(3, { from: { kind: 'system' }, event: 'closed', text: 'alice closed the bridge' }) }) });
    expect(s.bridges.byId.b2.state).toBe('closed');
    expect(s.bridges.order).toEqual(['b1', 'b2']);
  });

  it('updates one member and keeps the other rows', () => {
    const s0 = setup();
    const s1 = reduce(s0, { type: 'stream', event: ev('bridge.member', { bridge: 'b1', member: member('reviewer', { presence: 'needs-you' }) }) });
    expect(s1.rosters.b1.byHandle.reviewer.presence).toBe('needs-you');
    expect(s1.rosters.b1.byHandle['migrator-1']).toBe(s0.rosters.b1.byHandle['migrator-1']);
    expect(s1.rosters.b1.order).toBe(s0.rosters.b1.order);
    expect(s1.bridges.byId.b1.needsYou).toBe(1);
    // A new seat goes to the end of the roster.
    const s2 = reduce(s1, { type: 'stream', event: ev('bridge.member', { bridge: 'b1', member: member('tester') }) });
    expect(membersOf(s2.rosters.b1).map((m) => m.handle)).toEqual(['migrator-1', 'reviewer', 'tester']);
    expect(s2.bridges.byId.b1.memberCount).toBe(3);
  });

  it('keeps a member out of a roster that the page has not loaded', () => {
    const s0 = setup();
    const s1 = reduce(s0, { type: 'stream', event: ev('bridge.member', { bridge: 'b2', member: member('scribe') }, '') });
    expect(s1).toBe(s0);
    expect(s1.bridges.byId.b2.memberCount).toBe(s0.bridges.byId.b2.memberCount);
  });

  it('changes nothing for an equal member', () => {
    const s0 = setup();
    const s1 = reduce(s0, { type: 'stream', event: ev('bridge.member', { bridge: 'b1', member: member('reviewer', { presence: 'idle' }) }, '') });
    expect(s1).toBe(s0);
  });

  it('keeps the newest run and ignores an older one', () => {
    let s = reduce(initialState, { type: 'stream', event: ev('run', { id: 'r1', agent: 'a', state: 'running', seq: 9, createdAt: '', updatedAt: '' }) });
    s = reduce(s, { type: 'stream', event: ev('run', { id: 'r1', agent: 'a', state: 'queued', seq: 3, createdAt: '', updatedAt: '' }) });
    expect(s.runs.r1.state).toBe('running');
  });

  it('adds, changes, and removes a page of the tree', () => {
    let s = reduce(initialState, { type: 'pages', pages: [{ path: 'index.md', title: 'Index', hash: 'h1', by: 'alice', at: '', size: 3 }] });
    s = reduce(s, { type: 'stream', event: ev('page', { path: 'index.md', title: 'Index', hash: 'h2', by: 'agent:reviewer', at: '', size: 4 }) });
    expect(s.pages.byPath['index.md'].hash).toBe('h2');
    s = reduce(s, { type: 'stream', event: ev('page', { path: 'index.md', title: '', hash: '', by: '', at: '', size: 0, deleted: true }) });
    expect(s.pages.byPath['index.md']).toBeUndefined();
  });

  it('keeps the pages of the work of a bridge current, and reads the list again after a page that it cannot place', () => {
    let s = reduce(initialState, { type: 'bridge', bridge: { ...bridge('b1'), members: [member('migrator-1'), member('reviewer')] } });
    s = reduce(s, { type: 'bridge', bridge: { ...bridge('b2'), members: [member('scribe')] } });
    const page = (path: string, more: object = {}) => ({ path, title: path, hash: 'h', by: 'agent:x', at: '', size: 1, ...more });
    s = reduce(s, { type: 'bridge-pages', bridge: 'b1', pages: [{ ...page('k3s/alerts.md', { run: 'run-migrator-1' }), seat: 'migrator-1' }] });
    const list = () => Object.keys(s.bridgePages.b1.byPath).sort();
    // A page of a seat of the bridge joins, with its seat, wherever it sits.
    s = reduce(s, { type: 'stream', event: ev('page', page('k3s/rules.md', { run: 'run-reviewer' })) });
    expect(s.bridgePages.b1.byPath['k3s/rules.md'].seat).toBe('reviewer');
    // A page under the folder of the bridge joins whoever wrote it.
    s = reduce(s, { type: 'stream', event: ev('page', page('bridges/b1/report.md', { by: 'bossmode' })) });
    expect(list()).toEqual(['bridges/b1/report.md', 'k3s/alerts.md', 'k3s/rules.md']);
    // A page that a person or a seat of another bridge wrote last leaves, and so does a removed page.
    s = reduce(s, { type: 'stream', event: ev('page', page('k3s/alerts.md', { by: 'bob' })) });
    s = reduce(s, { type: 'stream', event: ev('page', page('k3s/rules.md', { run: 'run-scribe' })) });
    s = reduce(s, { type: 'stream', event: ev('page', page('bridges/b1/report.md', { deleted: true })) });
    expect(list()).toEqual([]);
    expect(s.bridgePages.b1.stale).toBe(false);
    // A page of a run that no seat names, such as a helper of a seat, makes the list stale.
    s = reduce(s, { type: 'stream', event: ev('page', page('k3s/helper.md', { run: 'run-helper' })) });
    expect(s.bridgePages.b1.stale).toBe(true);
    s = reduce(s, { type: 'bridge-pages', bridge: 'b1', pages: [] });
    expect(s.bridgePages.b1.stale).toBe(false);
    // A run that the page holds places itself by the batch of its metadata.
    s = reduce(s, { type: 'run', run: { id: 'run-helper', agent: 'x', state: 'running', seq: 1, createdAt: '', updatedAt: '', metadata: { 'fw.batch': 'bridge:b1', 'fw.bridge.member': 'reviewer' } } });
    s = reduce(s, { type: 'stream', event: ev('page', page('k3s/helper.md', { run: 'run-helper' })) });
    expect(s.bridgePages.b1.byPath['k3s/helper.md'].seat).toBe('reviewer');
    expect(s.bridgePages.b1.stale).toBe(false);
    // A workbench without the route marks the list missing, and a reset drops every list.
    s = reduce(s, { type: 'bridge-pages', bridge: 'b2', pages: null });
    expect(s.bridgePages.b2.missing).toBe(true);
    s = reduce(s, { type: 'stream', event: ev('reset', null) });
    expect(s.bridgePages).toEqual({});
  });

  it('takes a new face', () => {
    const s = reduce(initialState, { type: 'stream', event: ev('face', { agent: 'reviewer', displayName: 'Rev', tagline: 'Reads', hash: 'f2', custom: true }) });
    expect(s.faces.reviewer.hash).toBe('f2');
  });

  it('moves a Task and a member of the fleet view, and drops one that is gone', () => {
    const fleet = {
      name: 'front-0',
      members: [{ name: 'default/crew-2', state: 'suspended', lastSeen: '', canForward: true, accessMode: 'static', agents: [], active: 0, inputRequired: 0 }],
      pools: [{ name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 2, actual: 2, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-1', phase: 'Running', current: true }, { name: 'crew-2', phase: 'Suspended', current: true }] }],
    };
    let s = reduce(initialState, { type: 'fleet', fleet });
    const before = s.fleet!.pools![0].tasks[0];
    s = reduce(s, { type: 'stream', event: ev('task', { kind: 'task', member: 'default/crew-2', phase: 'Running', time: 't' }) });
    expect(s.fleet!.pools![0].tasks[1].phase).toBe('Running');
    expect(s.fleet!.pools![0].tasks[0]).toBe(before);
    s = reduce(s, { type: 'stream', event: ev('member', { kind: 'member', member: 'default/crew-2', state: 'live', time: 't' }) });
    expect(s.fleet!.members[0].state).toBe('live');
    s = reduce(s, { type: 'stream', event: ev('task', { kind: 'task', member: 'default/crew-1', gone: true, time: 't' }) });
    expect(s.fleet!.pools![0].tasks.map((t) => t.name)).toEqual(['crew-2']);
    s = reduce(s, { type: 'stream', event: ev('member', { kind: 'member', member: 'default/crew-2', gone: true, time: 't' }) });
    expect(s.fleet!.members).toEqual([]);
    // Without a loaded view, the events change nothing.
    const s0 = reduce(initialState, { type: 'stream', event: ev('task', { kind: 'task', member: 'x', phase: 'Running', time: 't' }, '') });
    expect(s0).toBe(initialState);
  });

  it('counts a reset, so the page loads again', () => {
    const s = reduce(initialState, { type: 'stream', event: ev('reset', null) });
    expect(s.resets).toBe(1);
  });

  it('moves only the id for an event that the page dropped', () => {
    const s0 = setup();
    const s1 = reduce(s0, { type: 'stream', event: ev('skipped', null, '77') });
    expect(s1.stream.lastId).toBe('77');
    expect(s1.channels).toBe(s0.channels);
  });

  it('ignores an unknown kind and a bad event', () => {
    const s0 = setup();
    expect(reduce(s0, { type: 'stream', event: ev('weather', { sunny: true }) })).toBe(s0);
    const s1 = reduce(s0, { type: 'stream', event: ev('bridge.message', { bridge: 'b1' }, '') });
    expect(s1).toBe(s0);
  });
});

describe('the state of the next stage', () => {
  it('keeps the usage of a bridge when a record arrives without it', () => {
    const usage = { turns: 41, costUSD: 0.62, reported: 3, final: 2, missing: 0, partial: false };
    let s = reduce(setup(), { type: 'bridge', bridge: { ...bridge('b1'), usage } });
    expect(s.bridges.byId.b1.usage).toEqual(usage);
    s = reduce(s, { type: 'bridges', bridges: [bridge('b1', { title: 'Renamed' })] });
    expect(s.bridges.byId.b1.title).toBe('Renamed');
    expect(s.bridges.byId.b1.usage).toEqual(usage);
  });

  it('keeps the skills that each agent can load until the page forgets them', () => {
    let s = reduce(initialState, { type: 'agent-skills', agent: 'migrator', skills: ['plan'] });
    const same = reduce(s, { type: 'agent-skills', agent: 'migrator', skills: ['plan'] });
    expect(same).toBe(s);
    s = reduce(s, { type: 'agent-skills', agent: 'scribe', skills: [] });
    expect(s.agentSkills).toEqual({ migrator: ['plan'], scribe: [] });
    expect(reduce(s, { type: 'agent-skills-forget' }).agentSkills).toEqual({});
  });

  it('follows the conversation with the manager that the person picked, and the settings for another person', () => {
    let s = reduce(initialState, { type: 'me', me });
    s = reduce(s, { type: 'config', config: { manager: { agent: 'manager', member: 'default/manager-0', run: 'run-1' }, placement: 'queue', maxMembers: 16 } });
    expect(managerRunOf(s)).toBe('run-1');
    s = reduce(s, { type: 'manager-pick', pick: { run: '', by: 'alice@example.com' } });
    expect(managerRunOf(s)).toBe('');
    s = reduce(s, { type: 'me', me: { ...me, principal: { subject: 'bob@example.com' } } });
    expect(managerRunOf(s)).toBe('run-1');
  });
});

