import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Value } from '../api/value';
import { LineSpend, Results, firstWork, hours, lineHref, pct, periodWords, span } from './Results';
import { forgetDuties } from '../state/duties';
import { fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';

const flush = async () => {
  for (let i = 0; i < 6; i++) await act(() => new Promise((r) => setTimeout(r, 0)));
};

function value(days: number, over: Partial<Value> = {}): Value {
  return {
    days, since: '2026-09-27T12:00:00Z', until: '2026-10-27T12:00:00Z', sentence: 'In the last ' + days + ' days, the agents finished 12 pieces of work.',
    work: { pieces: 14, done: 12, failed: 1, stopped: 0, open: 1 },
    checks: { accepted: 3, sentBack: 1, unchecked: 8 },
    people: { actions: 5, noPerson: 9, reworked: 1, waitSeconds: 7200, waitingNow: 1, handled: 0 },
    lead: { measured: 12, medianSeconds: 600, waitShare: 0.25 },
    spend: { usd: 1.5, perDone: 0.125, failedUSD: 0.1, coordinationUSD: 0.2, unpriced: 2, atLeast: true },
    periods: [{ start: '2026-10-20T12:00:00Z', end: '2026-10-27T12:00:00Z', done: 12, accepted: 3, sentBack: 1, unchecked: 8, failed: 1, usd: 1.3 }],
    lines: [
      { key: 'agent:migrator', kind: 'agent', name: 'migrator', agent: 'migrator', work: { pieces: 8, done: 7, failed: 1, stopped: 0, open: 0 }, checks: { accepted: 3, sentBack: 1, unchecked: 3 }, actions: 5, noPerson: 4, medianLeadSeconds: 900, usd: 1.1, perDone: 0.157, unpriced: 2 },
      { key: 'duty:nightly', kind: 'duty', name: 'nightly', agent: 'reviewer', work: { pieces: 6, done: 5, failed: 0, stopped: 0, open: 1 }, checks: { accepted: 0, sentBack: 0, unchecked: 5 }, actions: 0, noPerson: 5, medianLeadSeconds: 120, usd: 0.2, perDone: 0.04, unpriced: 0 },
    ],
    partial: false,
    ...over,
  };
}

describe('the words of the figures', () => {
  it('says a span, hours, and a share', () => {
    expect(span(40)).toBe('40 s');
    expect(span(720)).toBe('12 min');
    expect(span(11400)).toBe('3 h 10 min');
    expect(span(2 * 86400 + 4 * 3600)).toBe('2 d 4 h');
    expect(hours(45)).toBe('45 min');
    expect(hours(4525)).toBe('75 h');
    expect(pct(0.676)).toBe('68%');
  });

  it('names a day by the date that most of it covers, a week by its first day, and a short period by its length', () => {
    // A day of the window ends now, at 2 AM: most of it is the day before.
    const d = periodWords({ start: '2026-10-26T02:00:00', end: '2026-10-27T02:00:00' }, 'day');
    expect(d).toEqual({ label: 'Oct 26', short: '' });
    const w = periodWords({ start: '2026-10-20T12:00:00', end: '2026-10-27T12:00:00' }, 'week');
    expect(w).toEqual({ label: 'Oct 20', short: '' });
    // The first week of a window of 30 days holds 2 days.
    expect(periodWords({ start: '2026-09-27T12:00:00', end: '2026-09-29T12:00:00' }, 'week')).toEqual({ label: 'Sep 27', short: '2 days' });
    expect(periodWords({ start: '2026-09-27T12:00:00', end: '2026-09-28T12:00:00' }, 'week').short).toBe('1 day');
    expect(periodWords({ start: '2026-09-27T12:00:00', end: '2026-09-27T20:00:00' }, 'day').short).toBe('under a day');
  });

  it('opens the duty of a line and the profile of its agent, and no page for a source', () => {
    expect(lineHref({ kind: 'duty', name: 'daily-release-notes', agent: 'scribe' })).toBe('#duties/daily-release-notes');
    expect(lineHref({ kind: 'agent', name: 'migrator', agent: 'migrator' })).toBe('#fleet/migrator/profile');
    expect(lineHref({ kind: 'source', name: 'hooks', agent: 'triage' })).toBe('');
  });
});

describe('Results', () => {
  let calls: Call[] = [];
  let restore = () => {};
  let estimate: { minutes: number; by: string; at: string } | undefined;
  let inbox: unknown[] = [];
  let waiting: unknown = null;
  let over: Partial<Value> = {};
  const valueCalls = () => calls.filter((c) => c.path.startsWith('/v1/value'));
  beforeEach(() => {
    estimate = undefined;
    inbox = [];
    waiting = null;
    over = {};
    forgetDuties();
    try {
      localStorage.clear();
    } catch {
      // No storage in this run.
    }
    const f = fakeFetch([
      ['GET', /^\/v1\/inbox$/, () => ({ items: inbox, ...(waiting ? { waiting } : {}) })],
      ['GET', /^\/v1\/value\?days=(7|30|90)$/, () => {
        const days = Number(/days=(\d+)/.exec(valueCalls()[valueCalls().length - 1].path)![1]);
        const v = value(days, over);
        if (estimate) {
          v.lines[0] = { ...v.lines[0], estimate, estimatedMinutes: estimate.minutes * 6 };
          v.estimated = { minutes: estimate.minutes * 6, lines: 1, pieces: 6 };
        }
        return v;
      }],
      ['PUT', /^\/v1\/value\/estimates$/, (b) => {
        estimate = { minutes: (b as { minutes: number }).minutes, by: 'alice@example.com', at: '2026-10-27T12:00:00Z' };
        return value(90).lines[0];
      }],
    ]);
    calls = f.calls;
    restore = f.restore;
    seedFleet();
  });
  afterEach(() => {
    unmountAll();
    restore();
  });

  it('shows the figures of the window and says what it cannot measure', async () => {
    const box = mount(<Results />);
    await flush();
    expect(valueCalls()[0].path).toBe('/v1/value?days=30');
    const text = box.textContent || '';
    expect(box.querySelector('.rs-figure')!.textContent).toBe('12');
    expect(text).toContain('4 of 12');
    expect(text).toContain('8 unchecked');
    expect(text).toContain('at least $1.50');
    expect(text).toContain('2 runs without a price');
    // The inbox holds nothing for this person, so the open wait names no "you".
    expect(text).toContain('1 waiting for a person');
    expect(text).not.toContain('waiting for you');
    expect(text).toContain('25% of the time to done waited on people');
    expect(text).toContain('2 h of waits on people in all, 1 still open');
    expect(text).toContain('Not set');
    expect(box.querySelector('#results-sentence')!.textContent).toContain('the agents finished 12 pieces');
    // The hatch of sent back and the three verdicts have words beside their colors.
    expect(box.querySelector('.rs-verdicts .rs-bar')!.getAttribute('aria-label')).toBe('3 accepted, 0 checked, 1 sent back, 8 unchecked');
  });

  it('keeps the window that the person picks', async () => {
    const box = mount(<Results />);
    await flush();
    const tab = [...box.querySelectorAll('[role="tab"]')].find((t) => t.textContent === '7 days') as HTMLElement;
    act(() => tab.click());
    await flush();
    expect(valueCalls()[valueCalls().length - 1].path).toBe('/v1/value?days=7');
    expect(localStorage.getItem('fw.bossmode.results.days')).toBe('7');
    expect(box.textContent).toContain('Done by day');
  });

  it('lets the owner of an agent set the minutes of a piece, and nobody else', async () => {
    const box = mount(<Results />);
    await flush();
    const rows = [...box.querySelectorAll('tbody tr')];
    expect(rows[0].textContent).toContain('migrator');
    // seedFleet makes alice the owner of the migrator and an operator of the reviewer.
    const set = [...rows[0].querySelectorAll('button')].find((b) => b.textContent === 'Set') as HTMLButtonElement;
    expect(set).toBeTruthy();
    expect([...rows[1].querySelectorAll('button')].some((b) => b.textContent === 'Set')).toBe(false);
    act(() => set.click());
    const input = rows[0].querySelector('input') as HTMLInputElement;
    act(() => {
      input.value = '9999';
      input.dispatchEvent(new Event('input'));
    });
    act(() => (rows[0].querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(rows[0].textContent).toContain('From 0 to 2400 minutes');
    act(() => {
      input.value = '90';
      input.dispatchEvent(new Event('input'));
    });
    act(() => (rows[0].querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(calls.find((c) => c.method === 'PUT')!.body).toEqual({ line: 'agent:migrator', minutes: 90 });
    expect(box.textContent).toContain('90 min by alice');
    expect(box.textContent).toContain('9 h');
  });

  it('links a result to check and the name of each line to the work behind it', async () => {
    inbox = [{ kind: 'result', run: 'run-notes', approval: '', duty: 'nightly', agent: 'reviewer', bridge: '', text: 'Notes are ready to check.', since: '2026-10-27T11:00:00Z' }];
    const box = mount(<Results />);
    await flush();
    const check = [...box.querySelectorAll('a.rs-now')].find((a) => a.textContent === '1 to check') as HTMLAnchorElement;
    expect(check).toBeTruthy();
    expect(check.getAttribute('href')).toBe('#activity/v%3Arun-notes');
    // A result to check is no decision: nothing waits for this person to decide.
    expect([...box.querySelectorAll('a.rs-now')].map((a) => a.textContent)).toEqual(['1 to check']);
    const names = [...box.querySelectorAll('tbody th a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(names).toEqual([
      ['migrator', '#fleet/migrator/profile'],
      ['nightly', '#duties/nightly'],
    ]);
  });

  it('says None yet for a time to done that nothing measured, and its definitions never name the server', async () => {
    over = { work: { pieces: 2, done: 0, failed: 2, stopped: 0, open: 0 }, lead: { measured: 0, medianSeconds: 0, waitShare: 0 }, lines: [], periods: [] };
    const box = mount(<Results />);
    await flush();
    const tile = [...box.querySelectorAll('.rs-tile')].find((t) => t.querySelector('h2')!.textContent === 'Time to done')!;
    expect(tile.querySelector('.rs-figure')!.textContent).toBe('None yet');
    expect(tile.querySelector('.rs-bar')).toBeNull();
    // Failed work and no done task: no spend of a done task.
    expect(box.textContent).not.toContain('a done task');
    for (const key of [...box.querySelectorAll<HTMLButtonElement>('.help-key')]) {
      act(() => key.click());
      const said = key.parentElement!.textContent || '';
      expect(said.length).toBeGreaterThan(40);
      expect(said).not.toMatch(/\bfront\b/);
      act(() => key.click());
    }
  });

  it('says once that a window holds no work, with the key that starts a task, in place of a wall of zeros', async () => {
    over = { work: { pieces: 0, done: 0, failed: 0, stopped: 0, open: 0 }, lead: { measured: 0, medianSeconds: 0, waitShare: 0 }, lines: [], periods: [] };
    const box = mount(<Results />);
    await flush();
    expect(box.querySelector('.rs-tiles')).toBeNull();
    expect(box.querySelector('.rs-nothing')!.textContent).toBe('No work in the last 30 days.Start a task');
    expect(box.querySelector('.rs-nothing a')!.getAttribute('href')).toBe('#work');
  });

  it('counts the decisions that no named person made beside the actions of people', async () => {
    over = { people: { actions: 5, noPerson: 9, reworked: 1, waitSeconds: 7200, waitingNow: 0, handled: 3 } };
    const box = mount(<Results />);
    await flush();
    expect(box.textContent).toContain('5 actions of people, 1 followed up after they ended, 3 decisions without a named person');
    expect(box.textContent).not.toContain('waiting for');
  });

  it('counts in "waiting for you" only the decisions of this person, and leads to the first one', async () => {
    inbox = [{ kind: 'approval', run: 'run-restore', approval: 'ap-restore', duty: 'nightly', agent: 'backup', bridge: '', text: 'backup waits for your answer.', since: '2026-10-27T11:00:00Z' }];
    const box = mount(<Results />);
    await flush();
    const wait = [...box.querySelectorAll('a.rs-now')].find((a) => a.textContent === '1 waiting for you')!;
    expect(wait.getAttribute('href')).toBe('#activity/d%3Arun-restore/ap-restore');
    expect(box.textContent).not.toContain('waiting for a person');
  });

  it('reads the one count of the front, the number of the app bar and of Work, and links the rows of Activity (plan A7)', async () => {
    inbox = [
      { kind: 'approval', run: 'run-restore', approval: 'ap-restore', duty: 'nightly', agent: 'backup', bridge: '', text: 'backup waits for your answer.', since: '2026-10-27T11:00:00Z' },
      { kind: 'result', run: 'run-notes', approval: '', duty: 'nightly', agent: 'reviewer', bridge: '', text: 'Notes are ready to check.', since: '2026-10-27T11:00:00Z' },
    ];
    // The front counts a team to check and a note that waits, which this read of Activity does not list.
    waiting = { count: 5, needsYou: 1, toCheck: 2, notes: 2 };
    const box = mount(<Results />);
    await flush();
    expect([...box.querySelectorAll('a.rs-now')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['2 to check', '#activity/v%3Arun-notes'],
      ['3 waiting for you', '#activity/d%3Arun-restore/ap-restore'],
    ]);
  });

  it('says that a heart and a check that only reads a file are no check (plan 4.2 and 4.4)', async () => {
    const box = mount(<Results />);
    await flush();
    const tile = [...box.querySelectorAll('.rs-tile')].find((t) => t.querySelector('h2')!.textContent === 'Checked')!;
    act(() => tile.querySelector<HTMLButtonElement>('.help-key')!.click());
    const said = tile.textContent || '';
    expect(said).toContain('A heart keeps a result on the wiki, and it is no check.');
    expect(said).toContain('A done check that only reads a file does not count');
    expect(said).not.toContain('a thumb or a heart');
  });

  it('names failed, stopped, and lost tasks of a line apart', async () => {
    over = { lines: [{ key: 'agent:writer', kind: 'agent', name: 'writer', agent: 'writer', work: { pieces: 6, done: 3, failed: 1, stopped: 1, open: 0, lost: 1 }, checks: { accepted: 0, checked: 3, sentBack: 0, unchecked: 0 }, actions: 0, noPerson: 3, medianLeadSeconds: 5, usd: 0.01, perDone: 0.003, unpriced: 0 }] };
    const box = mount(<Results />);
    await flush();
    const done = box.querySelector('tbody td.num')!;
    expect(done.textContent).toBe('3 1 failed 1 stopped 1 lost');
  });

  it('says one action of a person in the singular', async () => {
    over = { people: { actions: 1, noPerson: 9, reworked: 1, waitSeconds: 0, waitingNow: 0, handled: 0 } };
    const box = mount(<Results />);
    await flush();
    expect(box.textContent).toContain('1 action of a person, 1 followed up after they ended');
  });

  it('says no price, unknown, or at least for a line with runs without a price, and never at least under $0.01', () => {
    const text = (n: preact.ComponentChildren) => {
      const b = mount(<>{n}</>);
      return b.textContent;
    };
    expect(text(<LineSpend usd={0} unpriced={39} />)).toBe('no price');
    expect(text(<LineSpend usd={0.004} unpriced={3} />)).toBe('under $0.01, more without a price');
    expect(text(<LineSpend usd={0.27} unpriced={60} />)).toBe('at least$0.27');
    expect(text(<LineSpend usd={0.002} unpriced={60} each />)).toBe('unknown');
    expect(text(<LineSpend usd={0.04} unpriced={0} each />)).toBe('$0.04');
  });

  it('says that nothing came before the first period with work', () => {
    const empty = { start: '2026-10-07T04:00:00Z', end: '2026-10-14T04:00:00Z', done: 0, accepted: 0, checked: 0, sentBack: 0, unchecked: 0, failed: 0, usd: 0 };
    const full = { ...empty, start: '2026-10-14T12:00:00Z', end: '2026-10-21T12:00:00Z', done: 225, unchecked: 225 };
    const work = { pieces: 225, done: 225, failed: 0, stopped: 0, open: 0 };
    expect(firstWork({ periods: [empty, full], work })).toBe('Oct 14');
    expect(firstWork({ periods: [full, empty], work })).toBe('');
    expect(firstWork({ periods: [empty, empty], work: { ...work, pieces: 0 } })).toBe('');
  });

  it('says at least for the spend of a done task when runs have no price, and leaves out a bound under a cent', async () => {
    over = { spend: { usd: 1.31, perDone: 0.0033, failedUSD: 0.11, coordinationUSD: 0.25, unpriced: 245, atLeast: true } };
    let box = mount(<Results />);
    await flush();
    expect(box.textContent).not.toContain('a done task');
    unmountAll();
    over = { spend: { usd: 1.5, perDone: 0.125, failedUSD: 0.1, coordinationUSD: 0.2, unpriced: 2, atLeast: true } };
    box = mount(<Results />);
    await flush();
    expect(box.textContent).toContain('at least $0.13 a done task');
  });
});
