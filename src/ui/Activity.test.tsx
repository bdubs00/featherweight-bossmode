import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { ActivityList, ActivityMain, pick } from './Activity';
import { currentNotice } from './notice';
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

  it('offers no key in the row of a decision: the row names the action and its command, and its card decides', () => {
    const el = mount(<ActivityList />);
    const row = rows(el)[1];
    expect(row.querySelectorAll('button').length).toBe(0);
    expect(row.querySelector('.inbox-text')!.textContent).toBe('late wants to run a command');
    expect(row.querySelector('.inbox-cmd')!.textContent).toBe('git push');
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

  it('opens the decision that waits longest where the main pane shows beside the list, and moves neither the route nor the focus', () => {
    location.hash = '#activity';
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    const card = el.querySelector('.inbox-main-pane section.card')!;
    expect(card.querySelector('h3')!.textContent).toBe('Needs your decision');
    expect(card.querySelector('pre.command')!.textContent).toBe('rm -rf build');
    expect(rows(el)[0].classList.contains('sel')).toBe(true);
    expect(location.hash).toBe('#activity');
    expect(document.activeElement).toBe(document.body);
  });

  it('shows the row with the focus in the main pane', () => {
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    act(() => rows(el)[1].focus());
    expect(el.querySelector('.inbox-main-pane h1')!.textContent).toBe('late');
    expect(el.querySelector('.inbox-main-pane pre.command')!.textContent).toBe('git push');
  });

  it('opens nothing on a narrow window, where the list is the one pane', () => {
    const wide = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...wide(q), matches: false })) as typeof window.matchMedia;
    try {
      location.hash = '#activity';
      const el = mount(
        <>
          <ActivityList />
          <ActivityMain />
        </>,
      );
      expect(el.textContent).toContain('Pick an item to decide or to read it.');
      expect(el.querySelector('.inbox-row.sel')).toBeNull();
      expect(location.hash).toBe('#activity');
    } finally {
      window.matchMedia = wide;
    }
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

describe('a message that asks you', () => {
  const ASK = {
    seq: 1,
    at: at(40),
    from: { kind: 'agent' as const, handle: 'migrator', run: 'run-migrator' },
    to: ['operator', 'tester'],
    text: '@operator, the module keeps 52 copies in `logrotate_rotate`. Please say whether 14 is enough.',
  };
  beforeEach(() => {
    act(() => {
      store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet', undefined, { needsYou: 2 }), bridge('b2', 'Migrate logrotate', undefined, { unread: 1, lastSeq: 1 })] });
      store.dispatch({ type: 'bridge', bridge: bridge('b2', 'Migrate logrotate', [seat('migrator', 'migrator', 'idle')], { unread: 1, lastSeq: 1 }) });
      store.dispatch({ type: 'run', run: run('run-migrator', 'migrator', 'completed') });
      store.dispatch({ type: 'channel', bridge: 'b2', page: { bridge: 'b2', messages: [ASK], next: 0, prev: 0 }, mode: 'latest' });
    });
  });

  it('needs you: the row quotes it with underscores intact, and the counts take it', () => {
    const el = mount(<ActivityList />);
    const row = rows(el).find((r) => r.getAttribute('data-key') === 'q:b2/1')!;
    expect(row.querySelector('.status-word')!.textContent).toBe('needs you');
    expect(row.querySelector('.inbox-text')!.textContent).toBe('migrator asks: The module keeps 52 copies in logrotate_rotate. Please say whether 14 is enough.');
    expect(row.querySelectorAll('button').length).toBe(0);
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('3 members need you');
  });

  it('answers in the bridge, to that member, in reply to the message', async () => {
    const f = fakeFetch([['POST', /\/v1\/bridges\/b2\/messages$/, (b) => ({ seq: 2, at: at(41), from: { kind: 'person', name: 'alice@example.com' }, ...(b as object) })]]);
    try {
      const el = mount(
        <>
          <ActivityList />
          <ActivityMain item="q:b2/1" />
        </>,
      );
      const pane = el.querySelector('.inbox-main-pane')!;
      expect(pane.querySelector('.tmsg .md')!.textContent).toContain('Please say whether 14 is enough.');
      const box = pane.querySelector('#composer') as HTMLTextAreaElement;
      expect(box.getAttribute('placeholder')).toBe('Message migrator');
      act(() => {
        box.value = 'Keep 14.';
        box.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => ([...pane.querySelectorAll('button')].find((b) => b.textContent === 'Send') as HTMLButtonElement).click());
      await vi.waitFor(() => expect(f.calls.some((c) => c.method === 'POST')).toBe(true));
      expect(f.calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/v1/bridges/b2/messages', body: { text: 'Keep 14.', to: ['migrator'], replyTo: 1 } });
      // The answer leaves the row of the question.
      await vi.waitFor(() => expect(rows(el).some((r) => r.getAttribute('data-key') === 'q:b2/1')).toBe(false));
    } finally {
      f.restore();
    }
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


describe('a run that the front knows only from its index', () => {
  it('shows its decision without a title, an input, or a schema, and raises no notice', () => {
    act(() => {
      store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', [seat('bare', 'migrator', 'needs-you')]) });
      store.dispatch({ type: 'run', run: { id: 'run-bare', agent: 'migrator', state: 'input-required', seq: 3, createdAt: at(0), updatedAt: at(4), pending: { id: 'ap-bare', tool: 'bash' } } });
    });
    const el = mount(<ActivityList />);
    const row = rows(el).find((r) => r.querySelector('b')!.textContent === 'bare')!;
    expect(row.querySelector('.status-word')!.textContent).toBe('needs you');
    const main = mount(<ActivityMain item="d:run-bare/ap-bare" />);
    expect(main.querySelector('.inbox-main-pane h1')!.textContent).toBe('bare');
    expect(main.querySelector('.card')).not.toBeNull();
    expect(currentNotice()).toBe('');
  });
});
