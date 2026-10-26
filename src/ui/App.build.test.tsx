import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { setToken } from '../api/client';
import { BUILD_META } from '../lib/build';
import { App } from './App';
import { showError } from './notice';
import { bridge, fakeFetch, FLEET, mount, unmountAll } from './testkit-b';

// A tab that stays open through a deploy runs the old page. Each start of
// the stream names the build that the front serves, and the page offers a
// reload when it is not the build of the tab. On the lab, a page open
// during a deploy ran the old bundle until a manual reload.

let restore = () => {};
let realFetch: typeof fetch;

beforeAll(() => {
  setToken('t');
  const m = document.createElement('meta');
  m.name = BUILD_META;
  m.content = 'old1';
  document.head.appendChild(m);
  const f = fakeFetch([
    ['GET', /^\/v1\/whoami$/, () => ({ principal: { subject: 'token', kind: 'token' }, roles: {}, admin: true, canCreate: true })],
    ['GET', /^\/v1\/bossmode$/, () => ({ manager: null, placement: 'queue', maxMembers: 16 })],
    ['GET', /^\/v1\/bridges$/, () => ({ bridges: [bridge('b1', 'Migrate Puppet')] })],
    ['GET', /^\/v1\/bridges\/b1$/, () => bridge('b1', 'Migrate Puppet', [])],
    ['GET', /^\/v1\/bridges\/b1\/messages/, () => ({ bridge: 'b1', messages: [], next: 0, prev: 0 })],
    ['GET', /^\/v1\/bridges\/b1\/pages/, () => ({ pages: [] })],
    ['PUT', /\/read$/, () => null],
    ['GET', /^\/v1\/faces$/, () => ({ faces: [] })],
    ['GET', /^\/v1\/agents$/, () => ({ agents: [] })],
    ['GET', /^\/v1\/fleet$/, () => FLEET],
    ['GET', /^\/v1\/fleet\/runs/, () => ({ runs: [] })],
    ['GET', /^\/v1\/bossmode\/skills$/, () => ({ skills: [] })],
    ['GET', /^\/v1\/pages$/, () => ({ pages: [] })],
  ]);
  restore = f.restore;
  // The stream reads with fetch itself. It stays open and names the new build.
  realFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).startsWith('/v1/bossmode/stream')) {
      return new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Fw-Page-Build': 'new2' } });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
});
afterAll(() => {
  unmountAll();
  restore();
  globalThis.fetch = realFetch;
  document.head.querySelectorAll('meta[name="' + BUILD_META + '"]').forEach((m) => m.remove());
});

const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};

const visit = async (hash: string) => {
  await act(async () => {
    location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await settle();
};

const offer = (el: HTMLElement) => el.querySelector('.notice[role=status]');

/** The page that the first test mounts, which the next tests go on with. */
let el: HTMLElement;

describe('a new build of the page', () => {
  it('offers a reload in one line, and stays through a move to another screen', async () => {
    el = mount(<App />);
    await vi.waitFor(() => expect(offer(el)).not.toBeNull());
    const line = offer(el)!;
    expect(line.querySelector('p')!.textContent).toBe('A new version of this page is ready.');
    expect([...line.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Reload', 'Dismiss']);
    expect(document.querySelector('dialog[open]')).toBeNull();
    await visit('#fleet');
    expect(offer(el)).not.toBeNull();
  });

  it('gives the place to the notice of a failed action first', async () => {
    act(() => showError(new Error('The save failed.')));
    await vi.waitFor(() => expect(el.querySelector('.notice[role=alert]')).not.toBeNull());
    expect(offer(el)).toBeNull();
    await visit('#pages');
    expect(el.querySelector('.notice[role=alert]')).toBeNull();
    expect(offer(el)).not.toBeNull();
  });

  it('goes on Dismiss and does not come back for the same build', async () => {
    const dismiss = [...offer(el)!.querySelectorAll('button')].find((b) => b.textContent === 'Dismiss')!;
    await act(async () => {
      dismiss.click();
    });
    expect(offer(el)).toBeNull();
    await visit('#activity');
    expect(offer(el)).toBeNull();
  });
});
