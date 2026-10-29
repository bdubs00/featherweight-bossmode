import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import type { Fleet } from '../api/types';
import { store } from '../state/store';
import { fakeFetch } from './testkit-b';
import { forgetReach, noteAnswer } from '../state/reach';
import { FleetFoot, GRACE_MS, RACK_LAMPS, Shell, captionOf, isToken, opensOn, operates, placesOf, shownOf, tabTitle } from './Shell';

let box: HTMLElement | null = null;

afterEach(() => {
  if (!box) return;
  const b = box;
  act(() => render(null, b));
  b.remove();
  box = null;
});

function mount(node: ComponentChildren): HTMLElement {
  const b = document.createElement('div');
  box = b;
  document.body.appendChild(b);
  act(() => render(node, b));
  return b;
}

describe('shownOf', () => {
  it('shows the focus column, or the main pane when that column is empty', () => {
    expect(shownOf('list', true, true)).toBe('list');
    expect(shownOf('list', false, true)).toBe('main');
    expect(shownOf('details', true, false)).toBe('main');
    expect(shownOf('details', true, true)).toBe('details');
    expect(shownOf('main', false, false)).toBe('main');
  });
});

describe('placesOf', () => {
  const base = { manager: null, placement: 'queue' as const, maxMembers: 16 };
  const ids = (c: Parameters<typeof placesOf>[0]) => placesOf(c).map((p) => p.id);
  it('keeps Know-how where Routines was, also for a front that keeps no routines', () => {
    expect(ids({ ...base, routines: false })).toEqual(['activity', 'chat', 'bridges', 'fleet', 'duties', 'skills', 'knowhow', 'wiki', 'manager']);
    expect(ids(base)).toContain('knowhow');
    expect(ids(null)).toContain('knowhow');
    expect(ids(base)).not.toContain('routines');
  });
});

describe('Shell', () => {
  it('draws the app bar and the panes of a route, and marks the place', () => {
    act(() => store.dispatch({ type: 'bridges', bridges: [{ id: 'b1', title: 'One', goal: '', operator: '', state: 'open', placement: 'queue', createdAt: '', closedAt: null, delegation: { approve: false, budget: false, members: false, report: true }, caps: { maxMessages: 1, maxFanoutPerMinute: 1, maxPairMessages: 1 }, lastSeq: 0, read: 0, unread: 0, needsYou: 2 }] }));
    const el = mount(<Shell route={{ place: 'bridge', id: 'b1', pane: 'roster' }} list={<p>list</p>} main={<p>main</p>} details={<p>details</p>} onSignOut={() => {}} />);
    const shell = el.querySelector('.shell')!;
    expect(shell.getAttribute('data-show')).toBe('details');
    expect(shell.getAttribute('data-place')).toBe('bridges');
    expect(el.querySelector('.pane-list')!.textContent).toBe('list');
    expect(el.querySelector('main.pane-main')!.textContent).toBe('main');
    expect(el.querySelector('aside.pane-details')!.textContent).toBe('details');
    const current = el.querySelector('.place[aria-current="page"]')!;
    expect(current.textContent).toContain('Teams');
    const labels = () => [...el.querySelectorAll('.place-label')].map((x) => x.textContent);
    // Know-how takes the place of Routines, and shows whatever the settings say of routines.
    expect(labels()).toEqual(['Activity', 'Chat', 'Teams', 'Fleet', 'Duties', 'Skills', 'Know-how', 'Wiki', 'Manager']);
    act(() => store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: false } }));
    expect(labels()).toEqual(['Activity', 'Chat', 'Teams', 'Fleet', 'Duties', 'Skills', 'Know-how', 'Wiki', 'Manager']);
    // With work, the bar shows five places, the place of the screen, and More.
    act(() => store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: false, work: true } }));
    expect(labels()).toEqual(['Work', 'Results', 'Activity', 'Chat', 'Wiki', 'Teams', 'More']);
    act(() => store.dispatch({ type: 'config', config: null }));
    // The count of Activity counts what needs you. The page has not read the record of the bridge yet, so its needsYou counts.
    expect(el.querySelector('.place-count .sr')!.textContent).toBe('2 items need you');
  });

  it('gives the main pane the focus of a place without a list', () => {
    const el = mount(<Shell route={{ place: 'manager' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    expect(el.querySelector('.shell')!.getAttribute('data-show')).toBe('main');
    expect(el.querySelector('.pane-list')).toBeNull();
    expect(el.querySelector('.place[aria-current="page"]')!.textContent).toContain('Manager');
  });

  it('opens the account menu with the theme, Where to reach me, Connections, and Sign out', () => {
    const el = mount(<Shell route={{ place: 'home' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    const key = el.querySelector('.account-key') as HTMLButtonElement;
    act(() => key.click());
    const items = [...el.querySelectorAll('[role^="menuitem"]')].map((x) => x.textContent);
    expect(items).toEqual(['Match the system', 'Light', 'Dark', 'Where to reach me', 'Connections', 'Sign out']);
    expect(el.querySelector('[role="menuitemradio"][aria-checked="true"]')!.textContent).toBe('Match the system');
  });
});

describe('the account and the tab', () => {
  it('says You for the token of the fleet, never the word token', () => {
    expect(isToken({ subject: 'token', kind: 'token' })).toBe(true);
    expect(isToken({ subject: 'token' })).toBe(true);
    expect(isToken({ subject: 'alice@example.com', name: 'Alice' })).toBe(false);
    act(() => store.dispatch({ type: 'me', me: { principal: { subject: 'token', kind: 'token' }, roles: {}, admin: true, canCreate: true } }));
    const el = mount(<Shell route={{ place: 'home' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    const key = el.querySelector('.account-key') as HTMLButtonElement;
    expect(key.getAttribute('aria-label')).toBe('Your account');
    expect(key.textContent).toBe('');
    act(() => key.click());
    expect(el.querySelector('.menu-head')!.textContent).toBe('YouSigned in with an access token');
    act(() => store.dispatch({ type: 'me', me: null }));
  });

  it('names the place, the count of what needs you, and the deployment in the title of the tab', () => {
    expect(tabTitle('activity', 2, 'Homelab')).toBe('(2) Activity - Homelab');
    expect(tabTitle('bridges', 0, '')).toBe('Teams - Bossmode');
    mount(<Shell route={{ place: 'manager' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    // The bridge of the first test still needs you twice.
    expect(document.title).toMatch(/^(\(\d+\) )?Manager - Bossmode$/);
  });

  it('lights the place that the page names, and starts with a link that skips the places', () => {
    const el = mount(<Shell route={{ place: 'member', bridge: 'b1', handle: 'migrator-1', tab: 'chat' }} place="bridges" list={null} main={<h1 class="t-title">main</h1>} details={null} onSignOut={() => {}} />);
    expect(el.querySelector('.place[aria-current="page"]')!.textContent).toContain('Teams');
    const skip = el.querySelector('.shell > a.skip') as HTMLAnchorElement;
    expect(skip.textContent).toBe('Skip to the content');
    expect(skip.getAttribute('href')).toBe('#main');
  });
});

describe('the count of Activity', () => {
  it('reads the inbox again as soon as a run starts to wait for you, so the count does not lag a minute', async () => {
    const f = fakeFetch([['GET', /^\/v1\/inbox/, () => ({ items: [] })]]);
    try {
      mount(<Shell route={{ place: 'home' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
      await act(async () => new Promise((r) => setTimeout(r, 0)));
      const reads = () => f.calls.filter((c) => c.path.startsWith('/v1/inbox')).length;
      const before = reads();
      act(() => store.dispatch({ type: 'run', run: { id: 'run-ask', agent: 'proxmox-admin', state: 'input-required', seq: 2, createdAt: '', updatedAt: '', pending: { id: 'ap-1', tool: 'packages', requestedAt: '' } as never } }));
      await act(async () => new Promise((r) => setTimeout(r, 0)));
      expect(reads()).toBe(before + 1);
    } finally {
      f.restore();
    }
  });
});

describe('the bar Offline', () => {
  it('shows while the page reaches no server, pushes the shell down, and marks the figures as stale', () => {
    forgetReach();
    act(() => {
      store.dispatch({ type: 'stream-status', status: 'live' });
      store.dispatch({ type: 'fleet', fleet: { name: 'front-0', members: [], pools: [{ name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }] }] } });
    });
    const el = mount(<Shell route={{ place: 'home' }} list={<FleetFoot />} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    expect(el.querySelector('.offline-bar')).toBeNull();
    expect(el.querySelector('.shell')!.hasAttribute('data-offline')).toBe(false);
    act(() => noteAnswer(0));
    expect(el.querySelector('.offline-bar')!.textContent).toBe('Offline.Trying again.');
    expect(el.querySelector('.shell > .sr[role="status"]')!.textContent).toBe('Offline. Trying again.');
    expect(el.querySelector('.shell')!.getAttribute('data-offline')).toBe('1');
    // The readout of the fleet shows what the page read last, and says so.
    expect(el.querySelector('.readout.stale')).not.toBeNull();
    expect(el.querySelector('.readout')!.getAttribute('aria-label')).toContain('Offline');
    act(() => noteAnswer(200));
    expect(el.querySelector('.offline-bar')).toBeNull();
    expect(el.querySelector('.readout.stale')).toBeNull();
    forgetReach();
  });
});

/** fleetOf is a fleet of one agent with workers in the phases given. */
function fleetOf(phases: string[]): Fleet {
  return {
    name: 'front-0',
    members: [],
    pools: [{ name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: phases.length, actual: phases.length, ready: phases.length, hash: 'h', checkedAt: '', tasks: phases.map((phase, i) => ({ name: 'crew-' + i, phase, current: true })) }],
  };
}

describe('FleetFoot', () => {
  it('reads out the workers: a caption with the size of the fleet, one lamp per worker, and the count of each status', () => {
    act(() => {
      store.dispatch({ type: 'stream-status', status: 'live' });
      store.dispatch({ type: 'fleet', fleet: fleetOf(['Suspended', 'Running', 'Failed', 'Suspended']) });
      store.dispatch({ type: 'open-runs', runs: [] });
    });
    const el = mount(<FleetFoot />);
    const a = el.querySelector('a.readout') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('#fleet');
    expect(a.getAttribute('aria-label')).toBe('Fleet: 4 workers, 1 failed, 1 awake, 2 asleep');
    expect(el.querySelector('.readout-head .t-meta')!.textContent).toBe('4 workers');
    expect([...el.querySelectorAll('.rack .lamp')].map((x) => x.className)).toEqual(['lamp lamp-failed', 'lamp lamp-awake', 'lamp lamp-asleep', 'lamp lamp-asleep']);
    expect(el.querySelector('.rack .lamp')!.getAttribute('title')).toBe('migrator, crew-2: failed');
    expect([...el.querySelectorAll('.figure')].map((x) => x.textContent)).toEqual(['1 failed', '1 awake', '2 asleep']);
    expect(el.querySelector('.figure-failed')).not.toBeNull();
    expect(el.querySelector('.readout.stale')).toBeNull();
    expect(el.querySelector('[role="status"]')!.textContent).toBe('');
  });

  it('shows each status as its share of the rack for a fleet past the lamps of the rack', () => {
    act(() => store.dispatch({ type: 'fleet', fleet: fleetOf([...Array(RACK_LAMPS).fill('Suspended'), 'Running']) }));
    const el = mount(<FleetFoot />);
    expect(el.querySelector('.rack-share')).not.toBeNull();
    const shares = [...el.querySelectorAll('.rack-share .lamp')] as HTMLElement[];
    expect(shares.map((x) => x.className)).toEqual(['lamp lamp-awake', 'lamp lamp-asleep']);
    expect(shares.map((x) => x.style.flexGrow)).toEqual(['1', String(RACK_LAMPS)]);
    expect(el.querySelector('.readout-head .t-meta')!.textContent).toBe(RACK_LAMPS + 1 + ' workers');
  });

  it('darkens the lamps and says the state of the stream once it has been down for the grace time', () => {
    vi.useFakeTimers();
    act(() => {
      store.dispatch({ type: 'fleet', fleet: fleetOf(['Running']) });
      store.dispatch({ type: 'stream-status', status: 'lost' });
    });
    const el = mount(<FleetFoot />);
    // The reads of the page are fresh while the stream connects, so the lamps stand at first.
    expect(el.querySelector('.readout.stale')).toBeNull();
    expect(el.querySelector('.readout-figures')!.textContent).toBe('1 awake');
    act(() => {
      vi.advanceTimersByTime(GRACE_MS - 1);
    });
    expect(el.querySelector('.readout.stale')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    vi.useRealTimers();
    expect(el.querySelector('.readout.stale')).not.toBeNull();
    expect(el.querySelector('.readout-figures')!.textContent).toBe('Connecting');
    expect(el.querySelector('[role="status"]')!.textContent).toBe('Connecting');
    expect(el.querySelector('.readout-head .t-meta')!.textContent).toBe('1 worker');
    act(() => store.dispatch({ type: 'stream-status', status: 'closed' }));
    expect(el.querySelector('.readout-figures .tone-red')!.textContent).toBe('Offline');
    act(() => store.dispatch({ type: 'stream-status', status: 'live' }));
    expect(el.querySelector('.readout.stale')).toBeNull();
    expect(el.querySelector('.readout-figures')!.textContent).toBe('1 awake');
  });

  it('names the size of a fleet in words', () => {
    expect(captionOf(0)).toBe('No workers');
    expect(captionOf(1)).toBe('1 worker');
    expect(captionOf(12)).toBe('12 workers');
  });
});

describe('the places of a person who operates no agent', () => {
  const viewer = { principal: { subject: 'erin', name: 'erin@quillwork.example', kind: 'user' }, roles: { writer: 'viewer', ops: 'viewer' }, admin: false, canCreate: false };
  it('says who operates: an admin, the token, an operator or an owner, and a whoami without roles', () => {
    expect(operates(viewer)).toBe(false);
    expect(operates({ ...viewer, roles: { writer: 'viewer', ops: 'operator' } })).toBe(true);
    expect(operates({ ...viewer, roles: { writer: 'owner' } })).toBe(true);
    expect(operates({ ...viewer, admin: true })).toBe(true);
    expect(operates({ ...viewer, principal: { subject: 'token', kind: 'token' } })).toBe(true);
    expect(operates({ ...viewer, roles: {} })).toBe(true);
    expect(operates(null)).toBe(true);
    // A sponsor opens on Results, which answers what the work gave.
    expect(opensOn(viewer)).toBe('results');
    expect(opensOn({ ...viewer, roles: { writer: 'operator' } })).toBe('work');
    // Work is the home of everyone who can start work, also a person who can create agents and runs none yet (plan 4.1).
    expect(opensOn({ ...viewer, canCreate: true })).toBe('work');
    expect(opensOn({ ...viewer, admin: true })).toBe('work');
    expect(opensOn(null)).toBe('work');
  });

  it('leaves out Chat and Wiki, which refuse a viewer, and the logo opens Results', () => {
    act(() => {
      store.dispatch({ type: 'me', me: viewer });
      store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: true, work: true } });
    });
    const el = mount(<Shell route={{ place: 'results' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    expect([...el.querySelectorAll('.place-label')].map((x) => x.textContent)).toEqual(['Work', 'Results', 'Activity', 'More']);
    expect(el.querySelector('.logo-well')!.getAttribute('href')).toBe('#results');
    // Every place: the places that refuse a viewer stay out.
    localStorage.setItem('fw.bossmode.everyPlace', '1');
    act(() => render(null, el));
    el.remove();
    const all = mount(<Shell route={{ place: 'results' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    expect([...all.querySelectorAll('.place-label')].map((x) => x.textContent)).toEqual(['Work', 'Results', 'Activity', 'Teams', 'Fleet', 'Duties', 'Skills', 'Know-how', 'Manager', 'Fewer']);
    localStorage.removeItem('fw.bossmode.everyPlace');
    act(() => {
      store.dispatch({ type: 'me', me: null });
      store.dispatch({ type: 'config', config: null });
    });
  });
});

