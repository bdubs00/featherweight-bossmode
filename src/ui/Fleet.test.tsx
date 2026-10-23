import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { FleetList } from './Fleet';
import { Board } from './Board';
import { FLEET, fakeFetch, mount, seedFleet, unmountAll } from './testkit-b';
import { settle } from './testkit-a';
import { currentNotice } from './notice';
import { store } from '../state/store';

let restore = () => {};

beforeEach(() => {
  restore = fakeFetch([]).restore;
  seedFleet();
});

afterEach(() => {
  unmountAll();
  restore();
});

const handles = (el: HTMLElement) => [...el.querySelectorAll('.person-handle')].map((x) => x.textContent);

describe('the people list', () => {
  it('counts the members and the awake workers on the header line', () => {
    const el = mount(<FleetList member="b1/migrator-1" />);
    const head = el.querySelector('header.pane-head')!;
    expect(head.querySelector('h2')!.textContent).toBe('Fleet');
    const chips = [...head.querySelectorAll('.chip .sr')].map((x) => x.textContent);
    expect(chips).toEqual(['4 members', '2 workers awake']);
    expect(head.querySelector('a[href="#new-agent"]')!.getAttribute('aria-label')).toBe('New agent');
  });

  it('shows no awake chip, and no green light, while no worker is awake', () => {
    act(() => {
      store.dispatch({
        type: 'fleet',
        fleet: { ...FLEET, pools: FLEET.pools!.map((p) => ({ ...p, tasks: p.tasks!.map((t) => ({ ...t, phase: 'Suspended' })) })) },
      });
    });
    const el = mount(<FleetList member="b1/migrator-1" />);
    const head = el.querySelector('header.pane-head')!;
    const chips = [...head.querySelectorAll('.chip .sr')].map((x) => x.textContent);
    expect(chips).toEqual(['4 members']);
    expect(head.querySelector('.led-green')).toBeNull();
  });

  it('groups the seats under the title of their bridge, then Not on a bridge', () => {
    const el = mount(<FleetList member="b1/migrator-1" />);
    const titles = [...el.querySelectorAll('.people-title')].map((x) => x.textContent);
    expect(titles).toEqual(['Migrate Puppet', 'Not on a bridge']);
    expect(el.querySelector('a.people-title')!.getAttribute('href')).toBe('#bridge/b1');
    expect(handles(el)).toEqual(['migrator-1', 'migrator-2', 'reviewer', 'manager']);
  });

  it('gives each row its status as a word beside its light', () => {
    const el = mount(<FleetList member="b1/migrator-1" />);
    const words = [...el.querySelectorAll('.person .status-word')].map((x) => x.textContent);
    expect(words).toEqual(['working', 'needs you', 'idle', 'awake']);
    expect(el.querySelector('.person .led-amber.breathe')).not.toBeNull();
  });

  it('marks the open member', () => {
    const el = mount(<FleetList member="b1/migrator-2" />);
    const on = el.querySelector('.person[aria-current="page"]')!;
    expect(on.getAttribute('href')).toBe('#member/b1/migrator-2');
  });

  it('finds a member as the person types', () => {
    const el = mount(<FleetList />);
    const field = el.querySelector('input[type="search"]') as HTMLInputElement;
    expect(field.placeholder).toBe('Find a member');
    act(() => {
      field.value = 'review';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(handles(el)).toEqual(['reviewer']);
  });
});

describe('the board', () => {
  it('draws one light per member with the handle in its tooltip and the status for a screen reader', () => {
    const el = mount(<Board />);
    const lights = [...el.querySelectorAll('a.board-light')];
    expect(lights.map((a) => a.textContent)).toEqual(['migrator-1, working', 'migrator-2, needs you', 'reviewer, idle', 'manager, awake']);
    expect(lights[1].getAttribute('href')).toBe('#member/b1/migrator-2');
    expect(lights[1].getAttribute('title')).toBe('migrator-2');
  });

  it('filters to the status of a segment of a strip, and back', () => {
    const el = mount(<Board />);
    // Each key of the strip says its status in words.
    const seg = [...el.querySelectorAll('.strip-seg')].find((b) => b.textContent === '1 needs you') as HTMLButtonElement;
    act(() => seg.click());
    expect([...el.querySelectorAll('a.board-light')].map((a) => a.textContent)).toEqual(['migrator-2, needs you']);
    expect(el.querySelector('.strip-seg[aria-pressed="true"]')!.textContent).toBe('1 needs you');
    act(() => (el.querySelector('.strip-seg[aria-pressed="true"]') as HTMLButtonElement).click());
    expect(el.querySelectorAll('a.board-light').length).toBe(4);
  });
});

describe('the orphan Tasks', () => {
  const orphan = (member: string, open = 0) => ({ member, parent: 'ax:default/manager-0', phase: 'Suspended', open });
  const button = (root: Element, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

  it('tells an admin how many child Tasks lost their parent, and removes them after a confirmation', async () => {
    let left = [orphan('default/manager-0-a', 1), orphan('default/manager-0-b')];
    const f = fakeFetch([
      ['GET', /^\/v1\/fleet\/orphans$/, () => ({ orphans: left })],
      [
        'DELETE',
        /^\/v1\/fleet\/orphans$/,
        () => {
          const removed = left.map((o) => o.member);
          left = [];
          return { removed, failed: [] };
        },
      ],
    ]);
    const el = mount(<FleetList />);
    await settle();
    const note = el.querySelector('.orphan-note')!;
    expect(note.querySelector('p')!.textContent).toContain('2 child Tasks lost their parent.');
    act(() => button(note, 'Remove').click());
    const dialog = el.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Remove 2 child Tasks?');
    expect(dialog.textContent).toContain('1 of them holds a run that did not end, and that run stops.');
    act(() => button(dialog, 'Remove 2 Tasks').click());
    await settle();
    expect(f.calls.filter((c) => c.method === 'DELETE').map((c) => c.path)).toEqual(['/v1/fleet/orphans']);
    expect(el.querySelector('dialog.confirm')).toBeNull();
    expect(el.querySelector('.orphan-note')).toBeNull();
  });

  it('names each Task that stays after a removal', async () => {
    fakeFetch([
      ['GET', /^\/v1\/fleet\/orphans$/, () => ({ orphans: [orphan('default/manager-0-a')] })],
      ['DELETE', /^\/v1\/fleet\/orphans$/, () => ({ removed: [], failed: [{ member: 'default/manager-0-a', error: 'the ax API did not answer' }] })],
    ]);
    const el = mount(<FleetList />);
    await settle();
    act(() => button(el.querySelector('.orphan-note')!, 'Remove').click());
    act(() => button(el.querySelector('dialog.confirm')!, 'Remove the Task').click());
    await settle();
    expect(currentNotice()).toBe('1 Task stays: default/manager-0-a, the ax API did not answer.');
    expect(el.querySelector('.orphan-note p')!.textContent).toContain('1 child Task lost its parent.');
  });

  it('shows nothing to a person who is no admin', async () => {
    const f = fakeFetch([['GET', /^\/v1\/fleet\/orphans$/, () => new Response(JSON.stringify({ status: 403, detail: 'no' }), { status: 403, headers: { 'Content-Type': 'application/problem+json' } })]]);
    const el = mount(<FleetList />);
    await settle();
    expect(f.calls.some((c) => c.path === '/v1/fleet/orphans')).toBe(true);
    expect(el.querySelector('.orphan-note')).toBeNull();
  });
});
