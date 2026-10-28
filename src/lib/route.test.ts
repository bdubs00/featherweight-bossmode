import { describe, expect, it } from 'vitest';
import { canonicalPath, columnOf, hrefOf, parentOf, parseRoute, placeOf, type Route } from './route';

describe('routes', () => {
  const cases: [string, Route][] = [
    ['#', { place: 'home' }],
    ['#activity', { place: 'activity' }],
    ['#activity/d:run-1/ap-2', { place: 'activity', item: 'd:run-1/ap-2' }],
    ['#manager', { place: 'manager' }],
    ['#manager/new', { place: 'manager', fresh: true }],
    ['#manager/run%201', { place: 'manager', run: 'run 1' }],
    ['#chat', { place: 'chat' }],
    ['#chat/new', { place: 'chat', fresh: true }],
    ['#chat/run%201', { place: 'chat', run: 'run 1' }],
    ['#chat/run-1/details', { place: 'chat', run: 'run-1', details: true }],
    ['#new', { place: 'new' }],
    ['#new-agent', { place: 'new-agent' }],
    ['#appearance', { place: 'appearance' }],
    ['#bridge/b%201', { place: 'bridge', id: 'b 1', pane: 'none' }],
    ['#bridge/b1/roster', { place: 'bridge', id: 'b1', pane: 'roster' }],
    ['#bridge/b1/wiki', { place: 'bridge', id: 'b1', pane: 'none', tab: 'wiki' }],
    ['#bridge/b1/decisions', { place: 'bridge', id: 'b1', pane: 'none', tab: 'decisions' }],
    ['#bridge/b1/run/r9/reviewer', { place: 'bridge', id: 'b1', pane: 'run', run: 'r9', handle: 'reviewer' }],
    ['#member/b1/migrator-1', { place: 'member', bridge: 'b1', handle: 'migrator-1', tab: 'chat' }],
    ['#member/b1/migrator-1/run', { place: 'member', bridge: 'b1', handle: 'migrator-1', tab: 'run' }],
    ['#member/b1/migrator-1/files', { place: 'member', bridge: 'b1', handle: 'migrator-1', tab: 'files' }],
    ['#member/b1/migrator-1/profile', { place: 'member', bridge: 'b1', handle: 'migrator-1', tab: 'chat', profile: true }],
    ['#fleet', { place: 'fleet' }],
    ['#board', { place: 'fleet', board: true }],
    ['#fleet/reviewer', { place: 'fleet', agent: 'reviewer' }],
    ['#fleet/reviewer/profile', { place: 'fleet', agent: 'reviewer', profile: true }],
    ['#pages', { place: 'pages', mode: 'tree' }],
    ['#pages/agents/reviewer/learned.md', { place: 'pages', path: 'agents/reviewer/learned.md', mode: 'read' }],
    ['#history/index.md', { place: 'pages', path: 'index.md', mode: 'history' }],
    ['#edit/a%20b.md', { place: 'pages', path: 'a b.md', mode: 'edit' }],
    ['#version/3/index.md', { place: 'pages', path: 'index.md', mode: 'read', version: 3 }],
    ['#skills', { place: 'skills' }],
    ['#skills/add', { place: 'skills', add: true }],
    ['#skills/skill/ansible-style', { place: 'skills', item: { kind: 'skill', id: 'ansible-style' } }],
    ['#skills/tool/github/create_issue', { place: 'skills', item: { kind: 'tool', id: 'github/create_issue' } }],
    ['#knowhow', { place: 'knowhow' }],
    ['#knowhow/triage', { place: 'knowhow', agent: 'triage' }],
    ['#knowhow/identity%20desk/notes', { place: 'knowhow', agent: 'identity desk', tab: 'notes' }],
    ['#knowhow/triage/routines', { place: 'knowhow', agent: 'triage', tab: 'routines' }],
    ['#routines', { place: 'knowhow', tab: 'routines' }],
    ['#routines/triage/acknowledge-a-new-ticket', { place: 'routines', agent: 'triage', name: 'acknowledge-a-new-ticket' }],
    ['#routines/triage/acknowledge-a-new-ticket/evidence', { place: 'routines', agent: 'triage', name: 'acknowledge-a-new-ticket', tab: 'evidence' }],
    ['#routines/identity%20desk/reset/runbook', { place: 'routines', agent: 'identity desk', name: 'reset', tab: 'runbook' }],
    ['#routines/triage/acknowledge-a-new-ticket/agent', { place: 'routines', agent: 'triage', name: 'acknowledge-a-new-ticket', details: true }],
  ];

  it('reads and writes each route', () => {
    for (const [hash, route] of cases) {
      expect(parseRoute(hash)).toEqual(route);
      expect(parseRoute(hrefOf(route))).toEqual(route);
    }
  });

  it('reads the wiki links of the backend and the name of the place', () => {
    expect(parseRoute('#page/bridges/br-1/report.md')).toEqual({ place: 'pages', path: 'bridges/br-1/report.md', mode: 'read' });
    expect(parseRoute('#wiki')).toEqual({ place: 'pages', mode: 'tree' });
    expect(parseRoute('#wiki/index.md')).toEqual({ place: 'pages', path: 'index.md', mode: 'read' });
    expect(parseRoute('#bridges')).toEqual({ place: 'home' });
    expect(parseRoute('#bridge/b1/members')).toEqual({ place: 'bridge', id: 'b1', pane: 'roster' });
  });

  it('opens home for an old or unknown address', () => {
    expect(parseRoute('#usage')).toEqual({ place: 'home' });
    expect(parseRoute('#version/x/index.md')).toEqual({ place: 'pages', mode: 'tree' });
    expect(parseRoute('#member/b1')).toEqual({ place: 'fleet' });
  });

  it('names the place of the app bar for each route', () => {
    expect(placeOf({ place: 'home' })).toBe('bridges');
    expect(placeOf({ place: 'new' })).toBe('bridges');
    expect(placeOf({ place: 'bridge', id: 'b', pane: 'none' })).toBe('bridges');
    expect(placeOf({ place: 'member', bridge: 'b', handle: 'h', tab: 'chat' })).toBe('fleet');
    expect(placeOf({ place: 'new-agent' })).toBe('fleet');
    expect(placeOf({ place: 'pages', mode: 'tree' })).toBe('wiki');
    expect(placeOf({ place: 'activity' })).toBe('activity');
    expect(placeOf({ place: 'manager' })).toBe('manager');
    expect(placeOf({ place: 'chat', run: 'r' })).toBe('chat');
    expect(placeOf({ place: 'skills', item: { kind: 'tool', id: 'bash' } })).toBe('skills');
    expect(columnOf({ place: 'skills' })).toBe('list');
    expect(columnOf({ place: 'skills', item: { kind: 'skill', id: 'x' } })).toBe('main');
  });

  it('picks one column for a narrow window and a parent for Back', () => {
    expect(columnOf({ place: 'home' })).toBe('list');
    expect(columnOf({ place: 'activity' })).toBe('list');
    expect(columnOf({ place: 'bridge', id: 'b', pane: 'none' })).toBe('main');
    expect(columnOf({ place: 'bridge', id: 'b', pane: 'run', run: 'r' })).toBe('details');
    expect(columnOf({ place: 'fleet' })).toBe('list');
    expect(columnOf({ place: 'fleet', agent: 'a' })).toBe('main');
    expect(columnOf({ place: 'fleet', agent: 'a', profile: true })).toBe('details');
    expect(columnOf({ place: 'member', bridge: 'b', handle: 'h', tab: 'chat' })).toBe('main');
    expect(columnOf({ place: 'member', bridge: 'b', handle: 'h', tab: 'chat', profile: true })).toBe('details');
    expect(columnOf({ place: 'activity', item: 'd:r/a' })).toBe('main');
    expect(columnOf({ place: 'skills', add: true })).toBe('main');
    expect(parentOf({ place: 'member', bridge: 'b', handle: 'h', tab: 'chat', profile: true })).toEqual({ place: 'member', bridge: 'b', handle: 'h', tab: 'chat' });
    expect(parentOf({ place: 'fleet', agent: 'a', profile: true })).toEqual({ place: 'fleet', agent: 'a' });
    expect(parentOf({ place: 'activity', item: 'd:r/a' })).toEqual({ place: 'activity' });
    expect(parentOf({ place: 'skills', add: true })).toEqual({ place: 'skills' });
    expect(parentOf({ place: 'manager', run: 'r' })).toEqual({ place: 'manager' });
    expect(parentOf({ place: 'manager', fresh: true })).toEqual({ place: 'manager' });
    expect(parentOf({ place: 'manager' })).toEqual({ place: 'home' });
    expect(columnOf({ place: 'manager' })).toBe('list');
    expect(columnOf({ place: 'manager', run: 'r' })).toBe('main');
    expect(columnOf({ place: 'pages', mode: 'tree' })).toBe('list');
    expect(parentOf({ place: 'bridge', id: 'b', pane: 'run', run: 'r' })).toEqual({ place: 'bridge', id: 'b', pane: 'roster' });
    expect(parentOf({ place: 'bridge', id: 'b', pane: 'none' })).toEqual({ place: 'home' });
    expect(parentOf({ place: 'member', bridge: 'b', handle: 'h', tab: 'run' })).toEqual({ place: 'fleet' });
    expect(columnOf({ place: 'chat' })).toBe('list');
    expect(columnOf({ place: 'chat', fresh: true })).toBe('main');
    expect(columnOf({ place: 'chat', run: 'r' })).toBe('main');
    expect(columnOf({ place: 'chat', run: 'r', details: true })).toBe('details');
    expect(parentOf({ place: 'chat', run: 'r', details: true })).toEqual({ place: 'chat', run: 'r' });
    expect(parentOf({ place: 'chat', run: 'r' })).toEqual({ place: 'chat' });
    expect(parentOf({ place: 'chat', fresh: true })).toEqual({ place: 'chat' });
  });

  it('gives a routine its columns inside Know-how: the agents, a routine, and the week of its agent', () => {
    const r = { place: 'routines' as const, agent: 'triage', name: 'ack' };
    expect(placeOf(r)).toBe('knowhow');
    expect(columnOf(r)).toBe('main');
    expect(columnOf({ ...r, tab: 'evidence' })).toBe('main');
    expect(columnOf({ ...r, details: true })).toBe('details');
    expect(parentOf({ ...r, details: true })).toEqual(r);
    // A routine goes back to the tab Routines of its agent.
    expect(parentOf({ ...r, tab: 'runbook' })).toEqual({ place: 'knowhow', agent: 'triage', tab: 'routines' });
    expect(parseRoute('#routines/triage')).toEqual({ place: 'knowhow', tab: 'routines' });
    expect(parseRoute('#routines/triage/ack/steps')).toEqual(r);
  });

  it('gives the Know-how place its columns: the agents, then an agent with its tabs', () => {
    expect(placeOf({ place: 'knowhow' })).toBe('knowhow');
    expect(columnOf({ place: 'knowhow' })).toBe('list');
    expect(columnOf({ place: 'knowhow', agent: 'triage', tab: 'notes' })).toBe('main');
    expect(parentOf({ place: 'knowhow', agent: 'triage', tab: 'notes' })).toEqual({ place: 'knowhow' });
    expect(parentOf({ place: 'knowhow' })).toEqual({ place: 'home' });
    // What it learned is the tab of the bare address of an agent.
    expect(hrefOf({ place: 'knowhow', agent: 'triage', tab: 'learned' })).toBe('#knowhow/triage');
    expect(parseRoute('#knowhow/triage/whatever')).toEqual({ place: 'knowhow', agent: 'triage' });
  });

  it('gives the Duties place its routes and columns: the list, a new duty, a duty, and its editor', () => {
    const cases: [string, Route][] = [
      ['#duties', { place: 'duties' }],
      ['#duties/new', { place: 'duties', fresh: true }],
      ['#duties/daily-homelab-report', { place: 'duties', name: 'daily-homelab-report' }],
      ['#duties/daily-homelab-report/edit', { place: 'duties', name: 'daily-homelab-report', edit: true }],
      // A duty named new keeps its own address, with the slash.
      ['#duties/new/', { place: 'duties', name: 'new' }],
      ['#duties/new/edit', { place: 'duties', name: 'new', edit: true }],
      // A run of the history of a duty opens on the page of the duty.
      ['#duties/daily-homelab-report/run/01KRUN', { place: 'duties', name: 'daily-homelab-report', run: '01KRUN' }],
      // The tab Playbooks, and one playbook, under a head of their own.
      ['#playbooks', { place: 'duties', tab: 'playbooks' }],
      ['#playbooks/weekly-patching', { place: 'duties', tab: 'playbooks', playbook: 'weekly-patching' }],
    ];
    for (const [hash, route] of cases) {
      expect(parseRoute(hash)).toEqual(route);
      expect(hrefOf(route)).toBe(hash);
    }
    expect(placeOf({ place: 'duties' })).toBe('duties');
    expect(placeOf({ place: 'duties', name: 'x', edit: true })).toBe('duties');
    expect(columnOf({ place: 'duties' })).toBe('list');
    expect(columnOf({ place: 'duties', fresh: true })).toBe('main');
    expect(columnOf({ place: 'duties', name: 'x' })).toBe('main');
    expect(columnOf({ place: 'duties', name: 'x', edit: true })).toBe('main');
    expect(parentOf({ place: 'duties', name: 'x', edit: true })).toEqual({ place: 'duties', name: 'x' });
    expect(parentOf({ place: 'duties', name: 'x' })).toEqual({ place: 'duties' });
    expect(parentOf({ place: 'duties', fresh: true })).toEqual({ place: 'duties' });
    expect(parentOf({ place: 'duties' })).toEqual({ place: 'home' });
    expect(parentOf({ place: 'duties', name: 'x', run: 'r' })).toEqual({ place: 'duties', name: 'x' });
    expect(columnOf({ place: 'duties', name: 'x', run: 'r' })).toBe('main');
    expect(placeOf({ place: 'duties', tab: 'playbooks' })).toBe('duties');
    expect(columnOf({ place: 'duties', tab: 'playbooks' })).toBe('list');
    expect(columnOf({ place: 'duties', tab: 'playbooks', playbook: 'p' })).toBe('main');
    expect(parentOf({ place: 'duties', tab: 'playbooks', playbook: 'p' })).toEqual({ place: 'duties', tab: 'playbooks' });
    expect(parentOf({ place: 'duties', tab: 'playbooks' })).toEqual({ place: 'home' });
  });

  it('keeps what Make this a duty brought in a short query after #duties/new, so a reload keeps it', () => {
    const r: Route = { place: 'duties', fresh: true, seed: { agent: 'scribe', act: 'ask', message: 'Write the notes of today / tomorrow & more.' } };
    const h = hrefOf(r);
    expect(h).toBe('#duties/new?agent=scribe&do=ask&message=Write+the+notes+of+today+%2F+tomorrow+%26+more.');
    expect(parseRoute(h)).toEqual(r);
    expect(parseRoute('#duties/new?agent=x&do=open&playbook=weekly-patching')).toEqual({ place: 'duties', fresh: true, seed: { agent: 'x', act: 'open', playbook: 'weekly-patching' } });
    expect(parseRoute('#duties/new?do=nonsense&bridge=b1')).toEqual({ place: 'duties', fresh: true, seed: { bridge: 'b1' } });
    expect(parseRoute('#duties/new?')).toEqual({ place: 'duties', fresh: true });
    expect(columnOf(r)).toBe('main');
    // A long message is cut, so the address stays short.
    const long = hrefOf({ place: 'duties', fresh: true, seed: { message: 'x'.repeat(5000) } });
    expect((parseRoute(long) as { seed: { message: string } }).seed.message.length).toBe(2000);
  });

  it('adds the slash that the sign-in needs to the path of the page', () => {
    expect(canonicalPath('/bossmode')).toBe('/bossmode/');
    expect(canonicalPath('/bossmode/')).toBe('/bossmode/');
    expect(canonicalPath('/x/bossmode')).toBe('/x/bossmode/');
    expect(canonicalPath('/bossmode/index.html')).toBe('/bossmode/index.html');
  });
});
