import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { getToken, setToken } from '../api/client';
import { App } from './App';
import { bridge, fakeFetch, FLEET, mount, unmountAll } from './testkit-b';

// A 401 of one route ends the session only when GET /v1/whoami answers 401
// too. On the lab, one stray 401 sent a person to the sign-in with an
// unsent draft, though the token still worked.

const stream = () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const refused = () => new Response(JSON.stringify({ status: 401, detail: 'the request carries no valid credential' }), { status: 401, headers: { 'Content-Type': 'application/problem+json' } });

let restore = () => {};
let calls: { method: string; path: string }[] = [];

beforeAll(() => {
  setToken('t');
  const f = fakeFetch([
    ['GET', /^\/v1\/whoami$/, () => ({ principal: { subject: 'token', kind: 'token' }, roles: {}, admin: true, canCreate: true })],
    ['GET', /^\/v1\/bossmode$/, () => ({ manager: null, placement: 'queue', maxMembers: 16 })],
    ['GET', /^\/v1\/bossmode\/stream/, stream],
    ['GET', /^\/v1\/bridges$/, () => ({ bridges: [bridge('b1', 'Migrate Puppet')] })],
    ['GET', /^\/v1\/bridges\/b1$/, () => bridge('b1', 'Migrate Puppet', [])],
    ['GET', /^\/v1\/bridges\/b1\/messages/, () => ({ bridge: 'b1', messages: [], next: 0, prev: 0 })],
    ['GET', /^\/v1\/bridges\/b1\/pages/, () => ({ pages: [] })],
    ['PUT', /\/read$/, () => null],
    ['GET', /^\/v1\/faces$/, refused],
    ['GET', /^\/v1\/agents$/, () => ({ agents: [] })],
    ['GET', /^\/v1\/fleet$/, () => FLEET],
    ['GET', /^\/v1\/bossmode\/skills$/, () => ({ skills: [] })],
  ]);
  restore = f.restore;
  calls = f.calls;
});
afterAll(() => {
  unmountAll();
  restore();
});

const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

describe('a 401 of one route', () => {
  it('asks GET /v1/whoami again, and keeps the session while it answers', async () => {
    const el = mount(<App />);
    await settle();
    expect(calls.some((c) => c.path === '/v1/faces')).toBe(true);
    expect(getToken()).toBe('t');
    expect(el.querySelector('input[type=password]')).toBeNull();
    // The boot asks once, and the 401 of the faces asks again.
    expect(calls.filter((c) => c.path === '/v1/whoami').length).toBeGreaterThanOrEqual(2);
  });
});
