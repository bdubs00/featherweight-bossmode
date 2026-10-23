import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { ActivityList, ActivityMain, pick } from './Activity';
import { at, fakeFetch, mount, run, seat, bridge, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};
// The bridge of the message: a new one for each test, because the read mark of a bridge never moves back in the store.
let n = 0;
let mb = '';

const LIMIT = 'budget exceeded: maxTurns: the run used 6 turns, and its limit is 6 (budget.maxTurns)';

beforeEach(() => {
  const f = fakeFetch([
    ['POST', /\/approvals\//, () => ({})],
    ['PUT', /\/v1\/bridges\/[^/]+\/read$/, () => null],
    ['PATCH', /\/members\/reviewer$/, () => seat('reviewer', 'reviewer', 'working')],
  ]);
  calls = f.calls;
  restore = f.restore;
  pick('');
  location.hash = '#activity';
  mb = 'notes-' + ++n;
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet', undefined, { needsYou: 2 }), bridge(mb, 'Release notes', undefined, { unread: 1, lastSeq: 3 })] });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', [seat('late', 'migrator', 'needs-you'), seat('early', 'migrator', 'needs-you'), seat('reviewer', 'reviewer', 'limit')]) });
    store.dispatch({ type: 'bridge', bridge: bridge(mb, 'Release notes', [seat('writer', 'writer', 'idle')], { unread: 1, lastSeq: 3 }) });
    store.dispatch({ type: 'run', run: run('run-late', 'migrator', 'input-required', { pending: { id: 'ap-late', tool: 'bash', input: { command: 'git push' }, reason: 'rule: ask bash: git push*', requestedAt: at(30) } }) });
    store.dispatch({ type: 'run', run: run('run-early', 'migrator', 'input-required', { pending: { id: 'ap-early', tool: 'bash', input: { command: 'rm -rf build' }, reason: 'default', requestedAt: at(5) } }) });
    store.dispatch({ type: 'run', run: run('run-reviewer', 'reviewer', 'failed', { error: LIMIT }) });
    store.dispatch({ type: 'run', run: run('run-writer', 'writer', 'completed') });
    store.dispatch({
      type: 'channel',
      bridge: mb,
      page: { bridge: mb, messages: [{ seq: 3, at: at(40), from: { kind: 'agent', handle: 'writer', run: 'run-writer' }, to: [], replyTo: null, text: 'The notes for 2.4 are in the wiki.', reactions: { up: [], down: [], heart: [] } }], next: 0, prev: 0 },
      mode: 'latest',
    });
  });
});

afterEach(() => {
  unmountAll();
  restore();
  location.hash = '';
});

const rows = (el: HTMLElement) => [...el.querySelectorAll('.inbox-row')] as HTMLElement[];
const rowOf = (el: HTMLElement, key: string) => rows(el).find((r) => r.getAttribute('data-key') === key);
const press = (el: HTMLElement, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
const button = (el: Element, text: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement | undefined;

describe('a message in Activity', () => {
  it('has Done, which clears it for you through the read mark of its bridge', async () => {
    const el = mount(<ActivityList />);
    const row = rowOf(el, 'm:' + mb)!;
    const done = button(row, 'Done')!;
    expect(done.getAttribute('aria-label')).toBe('Done with writer');
    act(() => done.click());
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')).toEqual({ method: 'PUT', path: '/v1/bridges/' + mb + '/read', body: { seq: 3 } });
    expect(rowOf(el, 'm:' + mb)).toBeUndefined();
  });

  it('takes e for Done, and Done in the head of the main pane opens the next row', async () => {
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item={'m:' + mb} />
      </>,
    );
    const head = el.querySelector('.inbox-main-pane header')!;
    expect(button(head, 'Done')).toBeDefined();
    const row = rowOf(el, 'm:' + mb)!;
    act(() => row.focus());
    press(row, 'e');
    await vi.waitFor(() => expect(calls.filter((c) => c.method === 'PUT').length).toBe(1));
    expect(rowOf(el, 'm:' + mb)).toBeUndefined();
  });

  it('gives a decision no Done: only its decision clears it', () => {
    const el = mount(<ActivityList />);
    expect(button(rowOf(el, 'd:run-early/ap-early')!, 'Done')).toBeUndefined();
  });
});

describe('a seat at its limit in Activity', () => {
  it('says at its limit, not error, with the limit, and Continue goes on with the same run', async () => {
    const el = mount(<ActivityList />);
    const row = rowOf(el, 's:b1/reviewer')!;
    expect(row.querySelector('.status-word')!.textContent).toBe('at its limit');
    expect(row.querySelector('.led-red')).toBeNull();
    expect(row.querySelector('.inbox-text')!.textContent).toBe('Stopped at its turn limit');
    const key = row.querySelector('.seat-again') as HTMLButtonElement;
    expect(key.textContent).toBe('Continue');
    expect(key.getAttribute('aria-label')).toBe('Continue reviewer');
    act(() => key.click());
    await vi.waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').length).toBe(1));
    expect(calls.find((c) => c.method === 'PATCH')).toEqual({ method: 'PATCH', path: '/v1/bridges/b1/members/reviewer', body: { continue: true } });
    act(() => row.focus());
    press(row, 'c');
    await vi.waitFor(() => expect(calls.filter((c) => c.method === 'PATCH').length).toBe(2));
    const main = mount(<ActivityMain item="s:b1/reviewer" />);
    expect(main.querySelector('.inbox-stop .status-word')!.textContent).toBe('at its limit');
    expect(main.querySelector('.inbox-reason')!.textContent).toBe('Stopped at its turn limit');
    expect((main.querySelector('.inbox-stop .seat-again') as HTMLButtonElement).textContent).toBe('Continue');
  });
});

describe('the main pane after a decision', () => {
  it('opens the next item that needs you', async () => {
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain item="d:run-early/ap-early" />
      </>,
    );
    expect(el.querySelector('.inbox-main-pane h1')!.textContent).toBe('early');
    act(() => button(el.querySelector('.inbox-main-pane .card')!, 'Allow')!.click());
    await vi.waitFor(() => expect(location.hash).toBe('#activity/d%3Arun-late/ap-late'));
  });

  it('shows the decided card settled when nothing else needs you', async () => {
    act(() => {
      store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', [seat('early', 'migrator', 'needs-you')], { needsYou: 1 }) });
    });
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    const pane = () => el.querySelector('.inbox-main-pane')!;
    expect(pane().querySelector('h1')!.textContent).toBe('early');
    act(() => button(pane().querySelector('.card')!, 'Allow')!.click());
    await vi.waitFor(() => expect(pane().querySelector('.card .decided')).not.toBeNull());
    expect(pane().querySelector('.card h3')!.textContent).toBe('early wants to run a command');
    expect(pane().querySelector('.card .decided')!.textContent).toContain('You allowed this');
    expect(button(pane(), 'Allow')).toBeUndefined();
    // The decision lands on the stream, and the row leaves: the card stays.
    act(() => {
      store.dispatch({ type: 'run', run: run('run-early', 'migrator', 'running', { seq: 2 }) });
      store.dispatch({ type: 'member', bridge: 'b1', member: seat('early', 'migrator', 'working') });
    });
    expect(rowOf(el, 'd:run-early/ap-early')).toBeUndefined();
    expect(el.textContent).not.toContain('Pick an item to decide or to read it.');
    expect(pane().querySelector('.card .decided')!.textContent).toContain('You allowed this');
  });
});
