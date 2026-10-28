import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { setToken } from '../api/client';
import { App } from './App';
import { fakeFetch, FLEET, mount, unmountAll } from './testkit-b';

// A sponsor views every agent and starts none. The front answers 403 to
// the catalog of the skills for such a person, and the browser showed that
// as an error on every place, so the page does not ask for it at the start.

const stream = () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

let restore = () => {};
let calls: { method: string; path: string }[] = [];

beforeAll(() => {
  setToken('t');
  const f = fakeFetch([
    ['GET', /^\/v1\/whoami$/, () => ({ principal: { subject: 'erin', kind: 'user' }, roles: { writer: 'viewer', ops: 'viewer' }, admin: false, canCreate: false })],
    ['GET', /^\/v1\/bossmode$/, () => ({ manager: null, placement: 'queue', maxMembers: 16 })],
    ['GET', /^\/v1\/bossmode\/stream/, stream],
    ['GET', /^\/v1\/bridges$/, () => ({ bridges: [] })],
    ['GET', /^\/v1\/faces$/, () => ({ faces: [] })],
    ['GET', /^\/v1\/agents$/, () => ({ agents: [] })],
    ['GET', /^\/v1\/fleet$/, () => FLEET],
    ['GET', /^\/v1\/fleet\/runs/, () => ({ runs: [] })],
    ['GET', /^\/v1\/bossmode\/skills$/, () => new Response('{"status":403}', { status: 403, headers: { 'Content-Type': 'application/problem+json' } })],
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

describe('the start of the page for a viewer', () => {
  it('reads the fleet and does not ask for the catalog of the skills', async () => {
    mount(<App />);
    await settle();
    expect(calls.some((c) => c.path === '/v1/fleet')).toBe(true);
    expect(calls.some((c) => c.path === '/v1/bossmode/skills')).toBe(false);
  });
});
