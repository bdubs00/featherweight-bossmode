import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { Bridge } from '../api/types';
import { BridgeList, FILTER_FROM, matches } from './BridgeList';
import { bridgeOf, memberOf, mount, unmountAll } from './testkit-a';

afterEach(unmountAll);

const rowOf = (el: HTMLElement, title: string) => [...el.querySelectorAll('a.brow')].find((a) => a.querySelector('.brow-title')!.textContent === title)!;

describe('the list of bridges', () => {
  it('shows the unread count as an ink chip, 2000+ at the bound, the members, and the light of what needs you', () => {
    act(() => {
      store.dispatch({
        type: 'bridges',
        bridges: [
          bridgeOf('l1', { title: 'Migrate the remaining Puppet modules', unread: 0, memberCount: 5, needsYou: 1 }),
          bridgeOf('l2', { title: 'Migrate logrotate', unread: 2, memberCount: 2, createdAt: '2026-10-21T09:00:00Z' }),
          { ...bridgeOf('l3', { title: 'A busy bridge', unread: 2000, memberCount: 1, createdAt: '2026-10-21T08:00:00Z' }), unreadMore: true } as Bridge,
          bridgeOf('l4', { title: 'Release notes for 2.4', state: 'closed', memberCount: 2 }),
        ],
      });
      store.dispatch({ type: 'bridge', bridge: { ...bridgeOf('l2', { title: 'Migrate logrotate', unread: 2, createdAt: '2026-10-21T09:00:00Z' }), members: [memberOf('migrator', { presence: 'working' }), memberOf('tester')] } });
    });
    const el = mount(<BridgeList current="l1" />);
    const one = rowOf(el, 'Migrate the remaining Puppet modules');
    expect(one.getAttribute('aria-current')).toBe('page');
    expect(one.querySelector('.brow-meta')!.textContent).toBe('5 members1 needs you');
    expect(one.querySelector('.led-amber.breathe')).not.toBeNull();
    const two = rowOf(el, 'Migrate logrotate');
    expect(two.querySelector('.chip-ink')!.textContent).toBe('2');
    expect(two.querySelector('.status')!.textContent).toBe('working');
    expect(rowOf(el, 'A busy bridge').querySelector('.chip-ink')!.textContent).toBe('2000+');
    // The closed bridges wait behind their toggle.
    expect([...el.querySelectorAll('a.brow')].length).toBe(3);
    const toggle = el.querySelector('.group-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toBe('Closed1');
    act(() => toggle.click());
    expect(rowOf(el, 'Release notes for 2.4').querySelector('.status')!.textContent).toBe('closed');
    expect(el.querySelector('.list-find')).toBeNull();
  });

  it('puts a failed seat before the work of the others, and shows no unread count on a closed bridge', () => {
    act(() => {
      store.dispatch({
        type: 'bridges',
        bridges: [
          bridgeOf('e1', { title: 'Monitoring', unread: 1, memberCount: 3, createdAt: '2026-10-21T09:00:00Z' }),
          bridgeOf('e2', { title: 'Done work', state: 'closed', unread: 6, memberCount: 2 }),
        ],
      });
      store.dispatch({ type: 'bridge', bridge: { ...bridgeOf('e1', { title: 'Monitoring', unread: 1, createdAt: '2026-10-21T09:00:00Z' }), members: [memberOf('a', { presence: 'working' }), memberOf('b', { presence: 'error' }), memberOf('c', { presence: 'working' })] } });
    });
    const el = mount(<BridgeList current="" />);
    const row = rowOf(el, 'Monitoring');
    expect(row.querySelector('.status')!.textContent).toBe('1 failed');
    expect(row.querySelector('.led-red')).not.toBeNull();
    expect(row.getAttribute('aria-label')).toBe('Monitoring, 1 unread, 1 member failed');
    act(() => (el.querySelector('.group-toggle') as HTMLButtonElement).click());
    const done = rowOf(el, 'Done work');
    expect(done.querySelector('.chip-ink')).toBeNull();
    expect(done.getAttribute('aria-label')).toBe('Done work, closed');
    expect(el.querySelector('.group-toggle')!.textContent).toBe('Closed1');
  });

  it('shows a filter field above a list of more than ten bridges', () => {
    const many = Array.from({ length: FILTER_FROM + 1 }, (_, i) => bridgeOf('f' + i, { title: (i === 3 ? 'Migrate logrotate ' : 'Bridge ') + i, createdAt: '2026-10-2' + (i % 9) + 'T10:00:00Z' }));
    act(() => store.dispatch({ type: 'bridges', bridges: many }));
    const el = mount(<BridgeList current="" />);
    const field = el.querySelector('.list-find input') as HTMLInputElement;
    expect(field.getAttribute('placeholder')).toBe('Find a team');
    act(() => {
      field.value = 'logrotate';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect([...el.querySelectorAll('.brow-title')].map((t) => t.textContent)).toEqual(['Migrate logrotate 3']);
    expect(matches('Migrate the remaining Puppet modules', 'puppet MIGRATE')).toBe(true);
    expect(matches('Migrate logrotate', 'nginx')).toBe(false);
  });

  it('says when a filter matches no bridge, with the key Clear, and shows the closed bridges that match under a heading', () => {
    const many = Array.from({ length: FILTER_FROM + 1 }, (_, i) => bridgeOf('m' + i, { title: 'Bridge ' + i, state: i === 2 ? 'closed' : 'open' }));
    act(() => store.dispatch({ type: 'bridges', bridges: many }));
    const el = mount(<BridgeList current="" />);
    const field = el.querySelector('.list-find input') as HTMLInputElement;
    const type = (v: string) =>
      act(() => {
        field.value = v;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    type('zzzz');
    expect(el.querySelector('.empty[role="status"] p')!.textContent).toBe('No team matches zzzz.');
    // A filter that matches a closed bridge shows it at once, under a heading and not a toggle that does nothing.
    type('bridge 2');
    expect(el.querySelector('button.group-toggle')).toBeNull();
    expect(el.querySelector('h2.group-head')!.textContent).toBe('Closed1');
    expect([...el.querySelectorAll('.brow-title')].map((t) => t.textContent)).toEqual(['Bridge 2']);
    type('zzzz');
    act(() => ([...el.querySelectorAll('button')].find((b) => b.textContent === 'Clear') as HTMLButtonElement).click());
    expect(field.value).toBe('');
    expect(el.querySelectorAll('a.brow').length).toBe(FILTER_FROM);
  });

  it('lists the closed bridges by their newest entry, the newest first, as each row shows it', () => {
    act(() =>
      store.dispatch({
        type: 'bridges',
        bridges: [
          bridgeOf('c1', { title: 'Old talk', state: 'closed', createdAt: '2026-10-25T09:00:00Z', lastAt: '2026-10-21T10:00:00Z' }),
          bridgeOf('c2', { title: 'Fresh talk', state: 'closed', createdAt: '2026-10-20T09:00:00Z', lastAt: '2026-10-25T10:00:00Z' }),
        ],
      }),
    );
    const el = mount(<BridgeList current="" />);
    act(() => (el.querySelector('.group-toggle') as HTMLButtonElement).click());
    expect([...el.querySelectorAll('.brow-title')].map((t) => t.textContent)).toEqual(['Fresh talk', 'Old talk']);
  });
});
