// A viewer of every agent, such as a sponsor, gets no key that the server
// refuses (F31 and F32 of the walk of Results, 2026-10-28): no New and no
// Open a team in Teams, no New agent in Fleet, and no composer in the
// conversation of an agent that the person only views.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { Whoami } from '../api/types';
import { BridgeList } from './BridgeList';
import { AgentChat, FleetList } from './Fleet';
import { bridgeOf, mount, unmountAll } from './testkit-a';
import { fakeFetch, seedFleet } from './testkit-b';
import { mayCreateAgent, viewsAll, viewsOnly } from '../lib/agents';

const ERIN: Whoami = { principal: { subject: 'erin@example.com', name: 'Erin' }, roles: { manager: 'viewer', migrator: 'viewer', writer: 'viewer' }, admin: false, canCreate: false };
const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: { manager: 'operator', migrator: 'owner' }, admin: false, canCreate: true };

let restore = () => {};
beforeEach(() => {
  restore = fakeFetch([['GET', /^\/v1\/fleet$/, () => store.get().fleet]]).restore;
  seedFleet();
});
afterEach(() => {
  unmountAll();
  restore();
  act(() => store.dispatch({ type: 'me', me: null }));
});

describe('the roles of a person', () => {
  it('tell a viewer of an agent, a person who views every agent, and a person who may make an agent', () => {
    expect(viewsOnly(ERIN, 'migrator')).toBe(true);
    expect(viewsOnly(ALICE, 'migrator')).toBe(false);
    expect(viewsOnly({ ...ERIN, admin: true }, 'migrator')).toBe(false);
    expect(viewsOnly(null, 'migrator')).toBe(false);
    expect(viewsAll(ERIN)).toBe(true);
    expect(viewsAll(ALICE)).toBe(false);
    expect(viewsAll({ ...ERIN, roles: {} })).toBe(false);
    expect(mayCreateAgent(ERIN)).toBe(false);
    expect(mayCreateAgent(ALICE)).toBe(true);
    expect(mayCreateAgent(null)).toBe(true);
  });
});

describe('a viewer of every agent', () => {
  it('gets no New and no Open a team in the list of the teams', () => {
    act(() => {
      store.dispatch({ type: 'me', me: ERIN });
      store.dispatch({ type: 'bridges', bridges: [] });
    });
    const el = mount(<BridgeList current="" />);
    expect(el.querySelector('h2')!.textContent).toBe('Teams');
    expect(el.textContent).toContain('No team is open.');
    expect(el.querySelector('a[href="#new"]')).toBeNull();
    act(() => store.dispatch({ type: 'me', me: ALICE }));
    expect([...el.querySelectorAll('a[href="#new"]')].map((a) => a.textContent)).toEqual(['New', 'Open a team']);
  });

  it('gets no New agent in Fleet, and no composer in the conversation of an agent that the person views', () => {
    act(() => {
      store.dispatch({ type: 'me', me: ERIN });
      store.dispatch({ type: 'bridges', bridges: [bridgeOf('b1', { title: 'Migrate Puppet' })] });
    });
    const list = mount(<FleetList />);
    expect(list.querySelector('a[href="#new-agent"]')).toBeNull();
    const chat = mount(<AgentChat agent="migrator" />);
    expect(chat.querySelector('#composer, textarea')).toBeNull();
    expect(chat.querySelector('.pane-head button[aria-label="More"]')).toBeNull();
    expect(chat.querySelector('.thread-empty')!.textContent).toContain('You can follow migrator. Only an owner or an operator of it can talk to it.');
  });

  it('keeps the composer and New agent for an owner', () => {
    act(() => store.dispatch({ type: 'me', me: ALICE }));
    const list = mount(<FleetList />);
    expect(list.querySelector('a[href="#new-agent"]')).not.toBeNull();
    const chat = mount(<AgentChat agent="migrator" />);
    expect(chat.querySelector('textarea')).not.toBeNull();
  });
});
