import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import type { Fleet } from '../api/types';
import { store } from '../state/store';
import { FleetFoot, GRACE_MS, RACK_LAMPS, Shell, captionOf, placesOf, shownOf } from './Shell';

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
  it('leaves out Routines for a front that keeps no routines, and keeps it for an older front that does not say', () => {
    expect(ids({ ...base, routines: false })).not.toContain('routines');
    expect(ids({ ...base, routines: true })).toContain('routines');
    expect(ids(base)).toContain('routines');
    expect(ids(null)).not.toContain('routines');
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
    expect(current.textContent).toContain('Bridges');
    const labels = () => [...el.querySelectorAll('.place-label')].map((x) => x.textContent);
    // Routines shows once the settings say that the front keeps routines.
    expect(labels()).toEqual(['Activity', 'Chat', 'Bridges', 'Fleet', 'Duties', 'Skills', 'Wiki', 'Manager']);
    act(() => store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, routines: true } }));
    expect(labels()).toEqual(['Activity', 'Chat', 'Bridges', 'Fleet', 'Duties', 'Skills', 'Routines', 'Wiki', 'Manager']);
    act(() => store.dispatch({ type: 'config', config: null }));
    // The count of Activity is the number of members that need you.
    expect(el.querySelector('.place-count .sr')!.textContent).toBe('2 members need you');
  });

  it('gives the main pane the focus of a place without a list', () => {
    const el = mount(<Shell route={{ place: 'manager' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    expect(el.querySelector('.shell')!.getAttribute('data-show')).toBe('main');
    expect(el.querySelector('.pane-list')).toBeNull();
    expect(el.querySelector('.place[aria-current="page"]')!.textContent).toContain('Manager');
  });

  it('opens the account menu with the theme, Notifications, Connections, and Sign out', () => {
    const el = mount(<Shell route={{ place: 'home' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    const key = el.querySelector('.account-key') as HTMLButtonElement;
    act(() => key.click());
    const items = [...el.querySelectorAll('[role^="menuitem"]')].map((x) => x.textContent);
    expect(items).toEqual(['Match the system', 'Light', 'Graphite', 'Notifications', 'Connections', 'Sign out']);
    expect(el.querySelector('[role="menuitemradio"][aria-checked="true"]')!.textContent).toBe('Match the system');
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
