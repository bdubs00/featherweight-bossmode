// The helpers of the tests of screen B: a mount that cleans up, a fake
// fetch that answers by route and records the calls, and the sample state
// of a small fleet.

import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { setFetch, type FetchLike } from '../api/client';
import type { Bridge, Fleet, Member, Run } from '../api/types';
import { store } from '../state/store';

let boxes: HTMLElement[] = [];

// jsdom has no layout: the page scrolls a row into view and asks for the
// width of the window, so the tests give it both.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
}

/** mount draws a node into a new element of the document. */
export function mount(node: ComponentChildren): HTMLElement {
  const box = document.createElement('div');
  document.body.appendChild(box);
  boxes.push(box);
  act(() => {
    render(node, box);
  });
  return box;
}

/** unmountAll removes what mount drew. */
export function unmountAll(): void {
  for (const b of boxes) {
    act(() => render(null, b));
    b.remove();
  }
  boxes = [];
}

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * fakeFetch answers each call with the first route whose method and path
 * match, else with a 404 problem, and records every call. A route that
 * answers a Response, such as an event stream, sends it as it is.
 */
export function fakeFetch(routes: [string, RegExp, (body: unknown) => unknown][]): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const f: FetchLike = async (input, init) => {
    const method = (init && init.method) || 'GET';
    const path = String(input);
    const body = init && typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    for (const [m, re, h] of routes) {
      if (m === method && re.test(path)) {
        const out = h(body);
        if (out instanceof Response) return out;
        return new Response(out === null ? '' : JSON.stringify(out), { status: out === null ? 204 : 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({ status: 404, detail: 'no route ' + path }), { status: 404, headers: { 'Content-Type': 'application/problem+json' } });
  };
  const old = setFetch(f);
  return { calls, restore: () => setFetch(old) };
}

export const at = (min: number) => new Date(Date.UTC(2026, 9, 21, 20, min)).toISOString();

export const seat = (handle: string, agent: string, presence: Member['presence'], extra: Partial<Member> = {}): Member => ({ handle, agent, task: 'The task of ' + handle, runs: ['run-' + handle], fired: false, muted: false, presence, ...extra });

export const bridge = (id: string, title: string, members?: Member[], extra: Partial<Bridge> = {}): Bridge => ({
  id,
  title,
  goal: '',
  operator: 'alice@example.com',
  state: 'open',
  placement: 'queue',
  createdAt: at(0),
  closedAt: null,
  delegation: { approve: false, budget: false, members: false, report: true },
  caps: { maxMessages: 1, maxFanoutPerMinute: 1, maxPairMessages: 1 },
  lastSeq: 0,
  read: 0,
  unread: 0,
  members,
  ...extra,
});

export const run = (id: string, agent: string, state: Run['state'], extra: Partial<Run> = {}): Run => ({ id, agent, state, seq: 1, createdAt: at(0), updatedAt: at(1), ...extra });

export const FLEET: Fleet = {
  name: 'front',
  members: [
    { name: 'default/crew-0', state: 'live', lastSeen: at(0), canForward: true, accessMode: '', agents: [{ name: 'migrator' }], active: 1, inputRequired: 0 },
    { name: 'default/boss-0', state: 'live', lastSeen: at(0), canForward: true, accessMode: '', agents: [{ name: 'manager' }], active: 0, inputRequired: 0 },
  ],
  pools: [
    { name: 'crew', atespace: 'default', agent: 'migrator', intake: '', wanted: 1, actual: 1, ready: 1, hash: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }], checkedAt: '' },
    { name: 'boss', atespace: 'default', agent: 'manager', intake: '', wanted: 1, actual: 1, ready: 1, hash: '', tasks: [{ name: 'boss-0', phase: 'Running', current: true }], checkedAt: '' },
  ],
};

/** seedFleet fills the store with one open bridge of three seats, the agents, and the fleet. */
export function seedFleet(): void {
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    const members = [seat('migrator-1', 'migrator', 'working'), seat('migrator-2', 'migrator', 'needs-you'), seat('reviewer', 'reviewer', 'idle')];
    store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet', undefined, { needsYou: 1 })] });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', members) });
    store.dispatch({ type: 'agents', agents: ['migrator', 'reviewer', 'manager'].map((name) => ({ name, role: name === 'migrator' ? 'owner' : 'operator' })) });
    store.dispatch({ type: 'fleet', fleet: FLEET });
    store.dispatch({ type: 'run', run: run('run-migrator-1', 'migrator', 'running') });
  });
}
