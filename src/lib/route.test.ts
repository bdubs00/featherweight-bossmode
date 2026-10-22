import { describe, expect, it } from 'vitest';
import { columnOf, hrefOf, parentOf, parseRoute, type Route } from './route';

describe('routes', () => {
  const cases: [string, Route][] = [
    ['#', { place: 'home' }],
    ['#manager', { place: 'manager' }],
    ['#new', { place: 'new' }],
    ['#bridge/b%201', { place: 'bridge', id: 'b 1', pane: 'none' }],
    ['#bridge/b1/roster', { place: 'bridge', id: 'b1', pane: 'roster' }],
    ['#bridge/b1/run/r9/reviewer', { place: 'bridge', id: 'b1', pane: 'run', run: 'r9', handle: 'reviewer' }],
    ['#fleet', { place: 'fleet' }],
    ['#fleet/reviewer', { place: 'fleet', agent: 'reviewer' }],
    ['#pages', { place: 'pages', mode: 'tree' }],
    ['#pages/agents/reviewer/learned.md', { place: 'pages', path: 'agents/reviewer/learned.md', mode: 'read' }],
    ['#history/index.md', { place: 'pages', path: 'index.md', mode: 'history' }],
    ['#edit/a%20b.md', { place: 'pages', path: 'a b.md', mode: 'edit' }],
    ['#version/3/index.md', { place: 'pages', path: 'index.md', mode: 'read', version: 3 }],
  ];

  it('reads and writes each route', () => {
    for (const [hash, route] of cases) {
      expect(parseRoute(hash)).toEqual(route);
      expect(parseRoute(hrefOf(route))).toEqual(route);
    }
  });

  it('opens home for an old or unknown address', () => {
    expect(parseRoute('#usage')).toEqual({ place: 'home' });
    expect(parseRoute('#version/x/index.md')).toEqual({ place: 'pages', mode: 'tree' });
  });

  it('picks one column for a narrow window and a parent for Back', () => {
    expect(columnOf({ place: 'home' })).toBe('rail');
    expect(columnOf({ place: 'bridge', id: 'b', pane: 'none' })).toBe('main');
    expect(columnOf({ place: 'bridge', id: 'b', pane: 'run', run: 'r' })).toBe('pane');
    expect(parentOf({ place: 'bridge', id: 'b', pane: 'run', run: 'r' })).toEqual({ place: 'bridge', id: 'b', pane: 'roster' });
    expect(parentOf({ place: 'bridge', id: 'b', pane: 'none' })).toEqual({ place: 'home' });
  });
});
