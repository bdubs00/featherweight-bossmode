import { describe, expect, it } from 'vitest';
import { canonicalPath, columnOf, hrefOf, parentOf, parseRoute, placeOf, type Route } from './route';

describe('routes', () => {
  const cases: [string, Route][] = [
    ['#', { place: 'home' }],
    ['#activity', { place: 'activity' }],
    ['#activity/d:run-1/ap-2', { place: 'activity', item: 'd:run-1/ap-2' }],
    ['#manager', { place: 'manager' }],
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

  it('adds the slash that the sign-in needs to the path of the page', () => {
    expect(canonicalPath('/bossmode')).toBe('/bossmode/');
    expect(canonicalPath('/bossmode/')).toBe('/bossmode/');
    expect(canonicalPath('/x/bossmode')).toBe('/x/bossmode/');
    expect(canonicalPath('/bossmode/index.html')).toBe('/bossmode/index.html');
  });
});
