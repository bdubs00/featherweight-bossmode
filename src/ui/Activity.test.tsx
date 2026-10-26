import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { ActivityList, ActivityMain, holdFor, negativeChoice, pick } from './Activity';
import { AppBar } from './Shell';
import { clearNotice, clearSaid, currentNotice, currentSaid, undoSaid } from './notice';
import { at, fakeFetch, mount, run, seat, bridge, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

beforeEach(() => {
  // A decision of a key waits a moment before it goes out. The tests wait little.
  holdFor(0);
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

/** badge is the count on Activity in the app bar, as a screen reader says it. */
function badge(): string {
  const el = mount(<AppBar route={{ place: 'activity' }} onSignOut={() => {}} onReach={() => {}} />);
  const sr = el.querySelector('.place-count .sr');
  return sr ? sr.textContent || '' : '';
}
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
    // The chip counts what the list shows. The app bar counts what needs you: the decisions and the error too.
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('3 items');
    expect(badge()).toBe('3 items need you');
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

  it('holds a decision of a key a moment with Undo, keeps the focus on its row, and sends it after the wait', async () => {
    holdFor(80);
    const el = mount(<ActivityList />);
    const first = rows(el)[0];
    act(() => first.focus());
    key(first, 'd');
    // Nothing goes out yet: the notice says Denied. with Undo, and the row says what it holds.
    expect(currentSaid()).toBe('Denied.');
    expect(first.querySelector('.status-word')!.textContent).toBe('denied');
    expect(document.activeElement).toBe(first);
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    // u takes it back, and nothing goes out after the wait.
    key(first, 'u');
    expect(currentSaid()).toBe('Undone. Nothing went out.');
    expect(first.querySelector('.status-word')!.textContent).toBe('needs you');
    expect(document.activeElement).toBe(first);
    await new Promise((r) => setTimeout(r, 120));
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    // Undo of the notice takes a decision back too.
    key(first, 'a');
    expect(currentSaid()).toBe('Allowed.');
    act(() => undoSaid());
    await new Promise((r) => setTimeout(r, 120));
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    // A decision that nobody takes back goes out after the wait.
    key(first, 'a');
    await new Promise((r) => setTimeout(r, 40));
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    await vi.waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toEqual([{ method: 'POST', path: '/v1/runs/run-early/approvals/ap-early', body: { decision: 'allow' } }]));
    act(() => clearSaid());
  });

  it('shows the held decision on the card too, with the seconds left and Undo, in place of Deny and Allow', () => {
    holdFor(3000);
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    const first = rows(el)[0];
    act(() => first.focus());
    key(first, 'd');
    const pane = el.querySelector('.inbox-main-pane')!;
    expect(pane.querySelector('.card.held .held-line')!.textContent).toBe('Denied. It goes out in 3 seconds.');
    expect([...pane.querySelectorAll('.card button')].map((b) => b.textContent)).toEqual(['Undo']);
    act(() => ([...pane.querySelectorAll('.card button')][0] as HTMLButtonElement).click());
    expect(pane.querySelector('.card.held')).toBeNull();
    expect([...pane.querySelectorAll('.card-actions button')].map((b) => b.textContent)).toContain('Deny');
    expect(document.activeElement).toBe(first);
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    act(() => clearSaid());
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

  it('seats a failed seat again in one click, on its row, in the main pane, and with s, each with its task unchanged', async () => {
    const f = fakeFetch([['PATCH', /\/members\/broke$/, (b) => ({ ...seat('broke', 'writer', 'working'), ...(b as object) })]]);
    try {
      const el = mount(<ActivityList />);
      const row = rows(el)[2];
      const keyOf = row.querySelector('.seat-again') as HTMLButtonElement;
      expect(keyOf.getAttribute('aria-label')).toBe('Seat broke again');
      act(() => keyOf.click());
      await vi.waitFor(() => expect(f.calls.filter((c) => c.method === 'PATCH').length).toBe(1));
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      act(() => row.focus());
      key(row, 's');
      await vi.waitFor(() => expect(f.calls.filter((c) => c.method === 'PATCH').length).toBe(2));
      const main = mount(<ActivityMain item={'s:b1/broke'} />);
      expect(main.querySelector('.inbox-reason')!.textContent).toBe('Stopped at 40 turns');
      act(() => (main.querySelector('.seat-again') as HTMLButtonElement).click());
      await vi.waitFor(() => expect(f.calls.filter((c) => c.method === 'PATCH').length).toBe(3));
      expect(f.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ task: 'The task of broke' }, { task: 'The task of broke' }, { task: 'The task of broke' }]);
    } finally {
      f.restore();
    }
  });

  it('reads the newest run of a seat that rests, and not a run that the front calls gone', async () => {
    act(() => {
      store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet', undefined, { needsYou: 2 }), bridge('b2', 'Docs')] });
      store.dispatch({ type: 'bridge', bridge: bridge('b2', 'Docs', [seat('kept', 'writer', 'idle'), seat('lost', 'writer', 'idle', { gone: true })]) });
    });
    mount(<ActivityList />);
    await vi.waitFor(() => expect(calls.some((c) => c.path === '/v1/runs/run-kept')).toBe(true));
    expect(calls.some((c) => c.path.includes('run-lost'))).toBe(false);
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
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('4 items');
    expect(badge()).toBe('4 items need you');
  });

  it('shows its card, and answers in the bridge, to that member, in reply to the message', async () => {
    const f = fakeFetch([['POST', /\/v1\/bridges\/b2\/messages$/, (b) => ({ seq: 2, at: at(41), from: { kind: 'person', name: 'alice@example.com' }, ...(b as object) })]]);
    try {
      const el = mount(
        <>
          <ActivityList />
          <ActivityMain item="q:b2/1" />
        </>,
      );
      const pane = el.querySelector('.inbox-main-pane')!;
      expect(pane.querySelector('.card-title h3')!.textContent).toBe('Needs your answer');
      expect(pane.querySelector('.ask-text .md')!.textContent).toContain('Please say whether 14 is enough.');
      const box = pane.querySelector('textarea') as HTMLTextAreaElement;
      expect(box.getAttribute('placeholder')).toBe('Your answer');
      act(() => {
        box.value = 'Keep 14.';
        box.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => ([...pane.querySelectorAll('button')].find((b) => b.textContent === 'Answer') as HTMLButtonElement).click());
      await vi.waitFor(() => expect(f.calls.some((c) => c.method === 'POST')).toBe(true));
      expect(f.calls.find((c) => c.method === 'POST')).toMatchObject({ path: '/v1/bridges/b2/messages', body: { text: 'Keep 14.', to: ['migrator'], replyTo: 1 } });
      // The answer leaves the row of the question.
      await vi.waitFor(() => expect(rows(el).some((r) => r.getAttribute('data-key') === 'q:b2/1')).toBe(false));
    } finally {
      f.restore();
    }
  });
});

describe('a question that the front names on a seat', () => {
  const Q = { seq: 7, at: at(42), from: { kind: 'agent' as const, handle: 'reviewer', run: 'run-reviewer' }, to: ['operator'], text: 'Do you consent to restarting sshd on both hosts?', ask: { choices: ['Yes', 'No'] } };
  beforeEach(() => {
    act(() => {
      store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet', undefined, { needsYou: 2 }), bridge('b3', 'Harden the lab hosts', undefined, { needsYou: 1, lastSeq: 9, read: 9 })] });
      store.dispatch({ type: 'bridge', bridge: bridge('b3', 'Harden the lab hosts', [{ ...seat('reviewer', 'reviewer', 'needs-you'), question: 7 }, { ...seat('auditor', 'net-auditor', 'idle'), question: 0 }], { needsYou: 1, lastSeq: 9, read: 9 }) });
      store.dispatch({ type: 'run', run: run('run-reviewer', 'reviewer', 'completed') });
    });
  });

  it('needs you while the seat names it, reads its entry alone, and counts once in the app bar', async () => {
    const f = fakeFetch([['GET', /\/v1\/bridges\/b3\/messages\/7$/, () => Q]]);
    try {
      const el = mount(
        <>
          <ActivityList />
          <ActivityMain item="q:b3/7" />
        </>,
      );
      const row = () => rows(el).find((r) => r.getAttribute('data-key') === 'q:b3/7')!;
      expect(row().querySelector('.status-word')!.textContent).toBe('needs you');
      await vi.waitFor(() => expect(row().querySelector('.inbox-text')!.textContent).toBe('reviewer asks: Do you consent to restarting sshd on both hosts?'));
      const pane = el.querySelector('.inbox-main-pane')!;
      await vi.waitFor(() => expect([...pane.querySelectorAll('.pick button')].map((b) => b.textContent)).toEqual(['Yes', 'No']));
      // The row of the question counts once, and the needsYou of the bridge does not count on top.
      expect(badge()).toBe('4 items need you');
      // The seat no longer names it: the row leaves.
      act(() => store.dispatch({ type: 'member', bridge: 'b3', member: { ...seat('reviewer', 'reviewer', 'idle'), question: 0 } }));
      expect(rows(el).some((r) => r.getAttribute('data-key') === 'q:b3/7')).toBe(false);
    } finally {
      f.restore();
    }
  });
});

describe('the keys on a question of a seat', () => {
  const Q = { seq: 8, at: at(42), from: { kind: 'agent' as const, handle: 'reviewer', run: 'run-reviewer' }, to: ['operator'], text: 'May I restart sshd on both hosts?', ask: { choices: ['Approve', 'Decline'] } };
  beforeEach(() => {
    act(() => {
      store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet', undefined, { needsYou: 2 }), bridge('b4', 'Harden the lab hosts', undefined, { needsYou: 1, lastSeq: 9, read: 9 })] });
      store.dispatch({ type: 'bridge', bridge: bridge('b4', 'Harden the lab hosts', [{ ...seat('reviewer', 'reviewer', 'needs-you'), question: 8 }], { needsYou: 1, lastSeq: 9, read: 9 }) });
      store.dispatch({ type: 'run', run: run('run-reviewer', 'reviewer', 'completed') });
    });
  });

  it('finds the choice that says no', () => {
    expect(negativeChoice(['Approve', 'Decline'])).toBe('Decline');
    expect(negativeChoice(['Yes', 'No'])).toBe('No');
    expect(negativeChoice(['Not now', 'Go'])).toBe('Not now');
    expect(negativeChoice(['Red', 'Blue'])).toBe('');
    expect(negativeChoice(undefined)).toBe('');
  });

  it('holds the choice that says no on d, with Undo, and sends it as the answer after the wait', async () => {
    holdFor(60);
    const f = fakeFetch([
      ['GET', /\/v1\/bridges\/b4\/messages\/8$/, () => Q],
      ['POST', /\/v1\/bridges\/b4\/messages$/, (b) => ({ seq: 10, at: at(43), from: { kind: 'person', name: 'alice@example.com' }, ...(b as object) })],
    ]);
    try {
      const el = mount(
        <>
          <ActivityList />
          <ActivityMain item="q:b4/8" />
        </>,
      );
      const row = () => rows(el).find((r) => r.getAttribute('data-key') === 'q:b4/8')!;
      await vi.waitFor(() => expect(el.querySelector('.inbox-main-pane .pick')).not.toBeNull());
      act(() => row().focus());
      key(row(), 'd');
      expect(currentSaid()).toBe('Answered Decline.');
      expect(row().querySelector('.status-word')!.textContent).toBe('answered');
      expect(el.querySelector('.inbox-main-pane .held-line')!.textContent).toMatch(/^Answered Decline\. It goes out in /);
      expect(f.calls.filter((c) => c.method === 'POST')).toEqual([]);
      await vi.waitFor(() => expect(f.calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([{ text: 'Decline', to: ['reviewer'], replyTo: 8 }]));
    } finally {
      f.restore();
      act(() => clearSaid());
    }
  });

  it('says to answer with a when no choice says no, and opens the answer on a', async () => {
    // A question of its own, since the page keeps the entry that it read for the test before.
    act(() => store.dispatch({ type: 'bridge', bridge: bridge('b4', 'Harden the lab hosts', [{ ...seat('reviewer', 'reviewer', 'needs-you'), question: 11 }], { needsYou: 1, lastSeq: 11, read: 11 }) }));
    const f = fakeFetch([['GET', /\/v1\/bridges\/b4\/messages\/11$/, () => ({ ...Q, seq: 11, ask: { choices: ['Red', 'Blue'] } })]]);
    try {
      const el = mount(
        <>
          <ActivityList />
          <ActivityMain />
        </>,
      );
      const row = () => rows(el).find((r) => r.getAttribute('data-key') === 'q:b4/11')!;
      await vi.waitFor(() => expect(row()).toBeTruthy());
      act(() => row().focus());
      await vi.waitFor(() => expect(el.querySelector('.inbox-main-pane .pick')).not.toBeNull());
      key(row(), 'd');
      expect(currentSaid()).toBe('This question has no choice that says no. Press a to answer it.');
      key(row(), 'a');
      await vi.waitFor(() => expect((document.activeElement as HTMLElement).closest('.inbox-main-pane .card')).not.toBeNull());
    } finally {
      f.restore();
      act(() => {
        clearSaid();
        clearNotice();
      });
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

describe('the next row after a decision', () => {
  // The tests before these leave newer runs in the store, so each test sets the runs of its rows again, with a newer seq.
  let seq = 20;
  const fresh = () =>
    act(() => {
      seq += 10;
      store.dispatch({ type: 'run', run: run('run-late', 'migrator', 'input-required', { seq, pending: { id: 'ap-late-2', tool: 'bash', input: { command: 'git push' }, reason: 'rule: ask bash: git push*', requestedAt: at(30) } }) });
      store.dispatch({ type: 'run', run: run('run-early', 'migrator', 'input-required', { seq, pending: { id: 'ap-early-2', tool: 'bash', input: { command: 'rm -rf build' }, reason: 'default', requestedAt: at(5) } }) });
    });

  it('moves the main pane and the focus together to the next row that needs you, not to the row at the same place', () => {
    fresh();
    const el = mount(
      <>
        <ActivityList />
        <ActivityMain />
      </>,
    );
    // The person decides the second row, late. The row at its place after it leaves is broke, which needs nobody.
    act(() => rows(el)[1].focus());
    expect(el.querySelector('.inbox-main-pane h1')!.textContent).toBe('late');
    act(() => {
      store.dispatch({ type: 'run', run: run('run-late', 'migrator', 'running', { seq: seq + 1 }) });
      store.dispatch({ type: 'member', bridge: 'b1', member: seat('late', 'migrator', 'working') });
    });
    expect(rows(el).map((r) => r.querySelector('b')!.textContent)).toEqual(['early', 'broke']);
    expect(el.querySelector('.inbox-main-pane h1')!.textContent).toBe('early');
    expect(document.activeElement).toBe(rows(el)[0]);
  });

  it('keeps the focus with its row when a new row comes in above it', () => {
    fresh();
    const el = mount(<ActivityList />);
    act(() => rows(el)[1].focus());
    const late = rows(el)[1];
    expect(late.getAttribute('data-key')).toBe('d:run-late/ap-late-2');
    // A new decision waits longer than both, so it takes the top of the list.
    act(() => {
      store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', [seat('late', 'migrator', 'needs-you'), seat('early', 'migrator', 'needs-you'), seat('broke', 'writer', 'error'), seat('first', 'migrator', 'needs-you')]) });
      store.dispatch({ type: 'run', run: run('run-first', 'migrator', 'input-required', { pending: { id: 'ap-first', tool: 'bash', input: { command: 'ls' }, reason: 'default', requestedAt: at(1) } }) });
    });
    expect((document.activeElement as HTMLElement).getAttribute('data-key')).toBe('d:run-late/ap-late-2');
  });
});
