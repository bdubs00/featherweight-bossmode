import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { ActivityList, ActivityMain, pick } from './Activity';
import { at, fakeFetch, mount, run, seat, bridge, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

beforeEach(() => {
  const f = fakeFetch([['POST', /\/approvals\//, () => ({})]]);
  calls = f.calls;
  restore = f.restore;
  pick('');
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet', undefined, { needsYou: 2 })] });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', [seat('late', 'migrator', 'needs-you'), seat('early', 'migrator', 'needs-you'), seat('broke', 'writer', 'error')]) });
    store.dispatch({ type: 'run', run: run('run-late', 'migrator', 'input-required', { pending: { id: 'ap-late', tool: 'bash', input: { command: 'git push' }, reason: 'rule: ask bash: git push*', requestedAt: at(30) } }) });
    store.dispatch({ type: 'run', run: run('run-early', 'migrator', 'input-required', { pending: { id: 'ap-early', tool: 'bash', input: { command: 'rm -rf build' }, reason: 'default', requestedAt: at(5) } }) });
    store.dispatch({ type: 'run', run: run('run-broke', 'writer', 'failed', { error: 'The run reached its limit of 40 turns.' }) });
  });
});

afterEach(() => {
  unmountAll();
  restore();
});

const rows = (el: HTMLElement) => [...el.querySelectorAll('.inbox-row')] as HTMLElement[];
const key = (el: HTMLElement, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });

describe('the inbox', () => {
  it('lists what needs you first, the oldest wait first, then the error', () => {
    const el = mount(<ActivityList />);
    expect(rows(el).map((r) => r.querySelector('b')!.textContent)).toEqual(['early', 'late', 'broke']);
    expect(rows(el)[0].querySelector('.status-word')!.textContent).toBe('needs you');
    expect(rows(el)[2].querySelector('.status-word')!.textContent).toBe('error');
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('2 members need you');
  });

  it('offers the thumbs and Always allow in the row of a decision', () => {
    const el = mount(<ActivityList />);
    const keys = [...rows(el)[1].querySelectorAll('.inbox-do button')].map((b) => b.getAttribute('aria-label') || b.textContent);
    expect(keys).toEqual(['Thumb up: Allow', 'Thumb down: Deny', 'Always allow']);
  });

  it('moves with j and k, allows with a, and denies with d', async () => {
    const el = mount(<ActivityList />);
    const [first, second] = rows(el);
    act(() => first.focus());
    key(first, 'j');
    expect(document.activeElement).toBe(second);
    key(second, 'k');
    expect(document.activeElement).toBe(first);
    key(first, 'a');
    await vi.waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')).toEqual({ method: 'POST', path: '/v1/runs/run-early/approvals/ap-early', body: { decision: 'allow' } });
    act(() => second.focus());
    key(second, 'd');
    await vi.waitFor(() => expect(calls.filter((c) => c.method === 'POST').length).toBe(2));
    expect(calls.filter((c) => c.method === 'POST')[1]).toEqual({ method: 'POST', path: '/v1/runs/run-late/approvals/ap-late', body: { decision: 'deny' } });
  });

  it('shows the row with the focus in the main pane, a decision as its card', () => {
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    expect(el.textContent).toContain('Pick an item to decide or to read it.');
    act(() => rows(el)[0].focus());
    const card = el.querySelector('.inbox-main-pane section.card')!;
    expect(card.querySelector('h3')!.textContent).toBe('Needs your decision');
    expect(card.querySelector('pre.command')!.textContent).toBe('rm -rf build');
  });

  it('says that nothing needs you when nothing does', () => {
    act(() => {
      store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', [seat('fine', 'migrator', 'working')], { needsYou: 0 }) });
    });
    const el = mount(<ActivityList />);
    expect(rows(el).length).toBe(0);
    expect(el.querySelector('.empty')!.textContent).toBe('Nothing needs you.');
  });
});

describe('the inbox after a decision', () => {
  it('hands the main pane and the focus to the row that takes the place of a decided one', () => {
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    act(() => rows(el)[0].focus());
    expect(el.querySelector('.inbox-main-pane h1')!.textContent).toBe('early');
    // The decision lands: the run goes on, and the seat works.
    act(() => {
      store.dispatch({ type: 'run', run: run('run-early', 'migrator', 'running', { seq: 2 }) });
      store.dispatch({ type: 'member', bridge: 'b1', member: seat('early', 'migrator', 'working') });
    });
    expect(rows(el).map((r) => r.querySelector('b')!.textContent)).toEqual(['late', 'broke']);
    expect(el.querySelector('.inbox-main-pane h1')!.textContent).toBe('late');
    expect(document.activeElement).toBe(rows(el)[0]);
  });
});

describe('the address of the inbox', () => {
  it('names the row with the focus, and a narrow window opens the row in the main pane', () => {
    location.hash = '#activity';
    const el = mount(<ActivityList />);
    // An earlier test decided for early, so the rows hold late and broke.
    const named = (i: number) => '#activity/' + rows(el)[i].getAttribute('data-key')!.split('/').map(encodeURIComponent).join('/');
    act(() => rows(el)[0].focus());
    expect(location.hash).toBe(named(0));
    act(() => rows(el)[rows(el).length - 1].click());
    expect(location.hash).toBe('#activity/s%3Ab1/broke');
    location.hash = '';
  });

  it('shows the row that the address names', () => {
    const el = mount(<ActivityMain item="d:run-late/ap-late" />);
    expect(el.querySelector('.inbox-main-pane h1')!.textContent).toBe('late');
  });
});

