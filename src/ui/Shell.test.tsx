import { afterEach, describe, expect, it } from 'vitest';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { Shell, shownOf } from './Shell';

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
    const labels = [...el.querySelectorAll('.place-label')].map((x) => x.textContent);
    expect(labels).toEqual(['Activity', 'Chat', 'Bridges', 'Fleet', 'Skills', 'Routines', 'Wiki', 'Manager']);
    // The count of Activity is the number of members that need you.
    expect(el.querySelector('.place-count .sr')!.textContent).toBe('2 members need you');
  });

  it('gives the main pane the focus of a place without a list', () => {
    const el = mount(<Shell route={{ place: 'manager' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    expect(el.querySelector('.shell')!.getAttribute('data-show')).toBe('main');
    expect(el.querySelector('.pane-list')).toBeNull();
    expect(el.querySelector('.place[aria-current="page"]')!.textContent).toContain('Manager');
  });

  it('opens the account menu with the theme, Connections, and Sign out', () => {
    const el = mount(<Shell route={{ place: 'home' }} list={null} main={<p>main</p>} details={null} onSignOut={() => {}} />);
    const key = el.querySelector('.account-key') as HTMLButtonElement;
    act(() => key.click());
    const items = [...el.querySelectorAll('[role^="menuitem"]')].map((x) => x.textContent);
    expect(items).toEqual(['Match the system', 'Light', 'Graphite', 'Connections', 'Sign out']);
    expect(el.querySelector('[role="menuitemradio"][aria-checked="true"]')!.textContent).toBe('Match the system');
  });
});
