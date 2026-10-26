import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { FleetList, FOLD_KEY, groupOpen } from './Fleet';
import { Board } from './Board';
import { FLEET, fakeFetch, mount, seedFleet, unmountAll } from './testkit-b';
import { settle } from './testkit-a';
import { currentNotice } from './notice';
import { store } from '../state/store';

let restore = () => {};

beforeEach(() => {
  localStorage.clear();
  restore = fakeFetch([]).restore;
  seedFleet();
});

/** openQuiet opens the group Not on a bridge, which folds by default, as a click of the person does. */
const openQuiet = () => localStorage.setItem(FOLD_KEY, JSON.stringify({ none: { open: true, attention: false } }));

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
    openQuiet();
    const el = mount(<FleetList member="b1/migrator-1" />);
    const titles = [...el.querySelectorAll('.people-title')].map((x) => x.textContent);
    expect(titles).toEqual(['Migrate Puppet', 'Not on a bridge']);
    expect(el.querySelector('a.people-title')!.getAttribute('href')).toBe('#bridge/b1');
    expect(handles(el)).toEqual(['migrator-1', 'migrator-2', 'reviewer', 'manager']);
  });

  it('gives each row its status as a word beside its light', () => {
    openQuiet();
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
    expect(el.querySelector('p.sr[role="status"]')!.textContent).toBe('1 member matches');
  });

  it('says when a search finds no member, and clears it with one key', () => {
    const el = mount(<FleetList />);
    const field = el.querySelector('input[type="search"]') as HTMLInputElement;
    act(() => {
      field.value = 'zzzq';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(handles(el)).toEqual([]);
    expect(el.querySelector('.people-none')!.textContent).toContain('No member matches \u201czzzq\u201d.');
    expect(el.querySelector('p.sr[role="status"]')!.textContent).toBe('0 members match');
    act(() => (el.querySelector('.people-none button') as HTMLButtonElement).click());
    expect(el.querySelector('.people-none')).toBeNull();
    expect(handles(el).length).toBeGreaterThan(0);
  });
});

describe('folding a bridge in the people list', () => {
  beforeEach(() => localStorage.clear());

  const foldKey = (el: HTMLElement, i = 0) => el.querySelectorAll('.people-fold')[i] as HTMLButtonElement;
  const click = (b: HTMLElement) => act(() => b.click());

  it('folds every group unless a member in it needs attention', () => {
    // Migrate Puppet holds migrator-2, which needs you. Not on a bridge holds the manager, which is awake.
    const el = mount(<FleetList />);
    expect(handles(el)).toEqual(['migrator-1', 'migrator-2', 'reviewer']);
    expect(foldKey(el, 0).getAttribute('aria-expanded')).toBe('true');
    expect(foldKey(el, 0).getAttribute('aria-label')).toBe('Hide the members of Migrate Puppet');
    expect(foldKey(el, 1).getAttribute('aria-expanded')).toBe('false');
    expect(foldKey(el, 1).getAttribute('aria-label')).toBe('Show the members of Not on a bridge');
    expect(localStorage.getItem(FOLD_KEY)).toBeNull();
  });

  it('remembers a quiet group that the person opens, and forgets the choice when the person folds it again', () => {
    let el = mount(<FleetList />);
    click(foldKey(el, 1));
    expect(handles(el)).toEqual(['migrator-1', 'migrator-2', 'reviewer', 'manager']);
    expect(JSON.parse(localStorage.getItem(FOLD_KEY)!)).toEqual({ none: { open: true, attention: false } });
    unmountAll();
    el = mount(<FleetList />);
    expect(handles(el)).toContain('manager');
    click(foldKey(el, 1));
    expect(handles(el)).not.toContain('manager');
    expect(localStorage.getItem(FOLD_KEY)).toBeNull();
  });

  it('folds a group that needs attention on a click, and its heading keeps the most urgent status', () => {
    const el = mount(<FleetList />);
    click(foldKey(el, 0));
    expect(handles(el)).toEqual([]);
    const head = el.querySelector('.people-head')!;
    expect(head.querySelector('.people-count')!.textContent).toBe('3');
    expect(head.querySelector('.status-word')!.textContent).toBe('needs you');
    expect(JSON.parse(localStorage.getItem(FOLD_KEY)!)).toEqual({ b1: { open: false, attention: true } });
  });

  it('keeps the open member in sight', () => {
    const el = mount(<FleetList current="manager" />);
    expect(foldKey(el, 1).getAttribute('aria-expanded')).toBe('false');
    expect(handles(el)).toEqual(['migrator-1', 'migrator-2', 'reviewer', 'manager']);
  });

  it('shows every match while the person searches', () => {
    const el = mount(<FleetList />);
    const field = el.querySelector('input[type="search"]') as HTMLInputElement;
    act(() => {
      field.value = 'manager';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(handles(el)).toEqual(['manager']);
  });

  it('falls back to the default when the storage of the browser holds something else', () => {
    localStorage.setItem(FOLD_KEY, '["b1"]');
    const el = mount(<FleetList />);
    expect(handles(el)).toEqual(['migrator-1', 'migrator-2', 'reviewer']);
  });

  it('lets a choice hold while the group keeps its state of attention', () => {
    // No choice: open only with attention.
    expect(groupOpen(undefined, false)).toBe(false);
    expect(groupOpen(undefined, true)).toBe(true);
    // A quiet group that the person opened stays open while it is quiet, and stays open when it needs attention.
    expect(groupOpen({ open: true, attention: false }, false)).toBe(true);
    expect(groupOpen({ open: true, attention: false }, true)).toBe(true);
    // A group that the person folded while it needed attention stays folded, and folds by default once it is quiet.
    expect(groupOpen({ open: false, attention: true }, true)).toBe(false);
    expect(groupOpen({ open: false, attention: true }, false)).toBe(false);
  });
});

describe('the board', () => {
  it('draws one light per member with the handle in its tooltip and the status for a screen reader', () => {
    const el = mount(<Board />);
    const lights = [...el.querySelectorAll('a.board-light')];
    expect(lights.map((a) => a.textContent)).toEqual(['migrator-1, working', 'migrator-2, needs you', 'reviewer, idle', 'manager, awake']);
    expect(lights[1].getAttribute('href')).toBe('#member/b1/migrator-2');
    expect(lights[1].getAttribute('title')).toBe('migrator-2: needs you');
  });

  it('filters to the status of a segment of a strip, and back', () => {
    const el = mount(<Board />);
    // Each key of the strip says its status in words.
    const seg = [...el.querySelectorAll('.strip-seg')].find((b) => b.textContent === '1 needs you') as HTMLButtonElement;
    act(() => seg.click());
    expect([...el.querySelectorAll('a.board-light')].map((a) => a.textContent)).toEqual(['migrator-2, needs you']);
    expect(el.querySelector('.strip-seg[aria-pressed="true"]')!.textContent).toBe('1 needs you');
    // The head says what the board shows, and its key shows every member again.
    const only = el.querySelector('.board-only') as HTMLButtonElement;
    expect(only.textContent).toBe('Showing needs you only (1)');
    expect(only.getAttribute('aria-label')).toBe('Showing needs you only, 1 member. Show every member.');
    act(() => only.click());
    expect(el.querySelectorAll('a.board-light').length).toBe(4);
    expect(el.querySelector('.board-only')).toBeNull();
    act(() => seg.click());
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

  it('says when the front removes them on its own, and that only Remove does without the sweep', async () => {
    const help = async (removeAfter?: number) => {
      fakeFetch([['GET', /^\/v1\/fleet\/orphans$/, () => ({ orphans: [orphan('default/manager-0-a'), orphan('default/manager-0-b')], removeAfter })]]);
      const el = mount(<FleetList />);
      await settle();
      act(() => (el.querySelector('.orphan-note button[aria-label="What a child Task without its parent is"]') as HTMLButtonElement).click());
      const text = el.querySelector('.orphan-note')!.textContent!;
      unmountAll();
      return text;
    };
    expect(await help(86400)).toContain('The server removes each one once it sleeps for 1 day, and Remove removes them now.');
    expect(await help(0)).toContain('Nothing removes these but Remove.');
    expect(await help()).toContain('Nothing removes these but Remove.');
  });

  it('shows nothing to a person who is no admin', async () => {
    const f = fakeFetch([['GET', /^\/v1\/fleet\/orphans$/, () => new Response(JSON.stringify({ status: 403, detail: 'no' }), { status: 403, headers: { 'Content-Type': 'application/problem+json' } })]]);
    const el = mount(<FleetList />);
    await settle();
    expect(f.calls.some((c) => c.path === '/v1/fleet/orphans')).toBe(true);
    expect(el.querySelector('.orphan-note')).toBeNull();
  });
});
