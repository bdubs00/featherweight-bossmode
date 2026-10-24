import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Duty, DutyRun, Whoami } from '../api/types';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { nextShort, nextWords } from '../lib/duties';
import { DUTY_IS, DutyList, DutyMain } from './Duties';
import { Profile } from './Profile';
import { clearNotice } from './notice';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll } from './testkit-c';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: { scribe: 'owner', triage: 'owner' }, admin: false, canCreate: true };
const ADMIN: Whoami = { ...ALICE, admin: true };
const BOB: Whoami = { principal: { subject: 'bob@example.com', name: 'Bob' }, roles: { scribe: 'viewer', triage: 'viewer' }, admin: false, canCreate: true };

/** The next six times, a day apart from tomorrow at 9:00 in the zone of the test. */
const NEXT = Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + 1 + i);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
});
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const base = (over: Partial<Duty>): Duty => ({
  name: 'x',
  agent: 'scribe',
  owner: 'alice@example.com',
  when: { schedule: { repeat: 'weekdays', times: ['09:00'], timeZone: 'America/New_York' } },
  do: { ask: { message: 'Write the report of {date}.' } },
  limits: { budget: { maxCostUSD: 0.5 }, overlap: 'skip', catchUp: '1h' },
  whileAway: { decider: 'manager', timeout: '2h', then: 'deny' },
  notify: { failure: ['owner'], needsYou: ['owner'] },
  runAs: 'duty',
  paused: false,
  source: 'store',
  revision: 3,
  ...over,
});

const REPORT = base({
  name: 'daily-report',
  readback: 'Every weekday at 9:00 AM, New York time.',
  next: NEXT,
  state: { lastRun: { at: ago(60), run: '01KREPORT', state: 'completed', costUSD: 0.12 }, todayUSD: 0.12, failuresInRow: 0 },
});
const RUNS: DutyRun[] = [
  { at: ago(15), slot: ago(15), run: '01KWOKE', state: 'failed', costUSD: 0.04, found: 2, woke: true, reason: 'The run reached its limit.' },
  { at: ago(30), slot: ago(30), run: '', state: 'completed', found: 0, woke: false },
  { at: ago(45), slot: ago(45), run: '', state: 'skipped', reason: 'The last run still works.' },
];
const WATCH = base({
  name: 'watch-p1',
  agent: 'triage',
  when: { schedule: { repeat: 'every', every: '15m', between: ['08:00', '18:00'], timeZone: 'UTC' } },
  readback: 'Every 15 minutes between 8:00 AM and 6:00 PM, UTC.',
  next: NEXT,
  checkFirst: { look: { tool: 'servicenow.query_incidents', input: { query: 'priority<=2' } }, items: 'result.records', key: 'number', wake: { when: 'new' } },
  do: { ask: { message: 'Triage these: {found}' } },
  state: { lastRun: RUNS[0], todayUSD: 0.04, failuresInRow: 1 },
});
const MONTHLY = base({
  name: 'monthly-summary',
  agent: 'scribe',
  readback: 'On the first Monday of the month at 9:00 AM, New York time.',
  next: NEXT,
  paused: true,
  do: { ask: { message: 'Sum up the month.' } },
  state: { lastRun: { at: ago(600), run: '01KM', state: 'failed' }, todayUSD: 0, failuresInRow: 3, pausedReason: 'Three runs in a row failed.' },
});

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  forgetDuties();
  location.hash = '#duties';
  act(() => store.dispatch({ type: 'me', me: ALICE }));
});
afterEach(() => {
  unmountAll();
  clearNotice();
  if (api) api.restore();
});

/** text is the words of an element as a person reads them, one space between the pieces. */
function text(el: Element | null): string {
  if (!el) return '';
  const parts: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) parts.push(n.textContent || '');
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/ ([,.])/g, '$1');
}

const listOf = (duties: Duty[], paused = false) => ({ 'GET /v1/duties': { duties, paused } });

describe('the list of duties', () => {
  it('shows each duty with its agent, what it does, its time in words, its last run, its next time, and the spend of today', async () => {
    api = fakeApi(listOf([REPORT, MONTHLY, WATCH]));
    const el = mount(<DutyList current="daily-report" />);
    await settle();
    // The page sends the zone of the browser with each call of the duties.
    expect(api.calls[0]).toMatchObject({ method: 'GET', path: '/v1/duties' });
    expect(api.calls[0].headers['X-Time-Zone']).toBe(ZONE);
    expect(text(el.querySelector('.pane-head'))).toContain('Duties');
    expect(text(el.querySelector('.pane-head .chip'))).toContain('3');
    expect(keyNamed(el, 'New duty')!.getAttribute('href')).toBe('#duties/new');
    const rows = [...el.querySelectorAll('.duty-row')];
    // A failed last run comes first, and a paused duty last.
    expect(rows.map((r) => r.getAttribute('href'))).toEqual(['#duties/watch-p1', '#duties/daily-report', '#duties/monthly-summary']);
    expect(rows.every((r) => r.querySelector('.mark'))).toBe(true);
    expect(text(rows[1])).toBe(`Write the report of [Today's date]. finished Every weekday at 9:00 AM, New York time. scribe Next ${nextShort(NEXT[0])} $0.12 today`);
    expect(rows[1].getAttribute('aria-current')).toBe('page');
    expect(text(rows[0])).toContain('failed');
    expect(text(rows[2])).toContain('paused');
    expect(text(rows[2])).not.toContain('Next');
    // A person who is no admin gets no switch.
    expect(keyNamed(el, 'Pause all duties')).toBeUndefined();
  });

  it('finds a duty by its words', async () => {
    api = fakeApi(listOf([REPORT, WATCH]));
    const el = mount(<DutyList />);
    await settle();
    typeIn(el.querySelector('input[type="search"]'), 'triage');
    expect([...el.querySelectorAll('.duty-row')].map((r) => r.getAttribute('href'))).toEqual(['#duties/watch-p1']);
    typeIn(el.querySelector('input[type="search"]'), 'nothing like it');
    expect(text(el)).toContain('No duty holds those words.');
  });

  it('says what a duty is when there is none, with the key New duty', async () => {
    api = fakeApi(listOf([]));
    const el = mount(<DutyList />);
    await settle();
    expect(text(el.querySelector('.empty'))).toBe(DUTY_IS + ' New duty');
    expect(el.querySelector('.empty a.key')!.getAttribute('href')).toBe('#duties/new');
  });

  it('says so when the workbench keeps no duties', async () => {
    api = fakeApi({});
    const el = mount(<DutyList />);
    await settle();
    expect(text(el)).toContain('This workbench keeps no duties.');
    expect(keyNamed(el, 'New duty')).toBeUndefined();
  });

  it('gives an admin the switch that pauses every duty, after a confirmation, and Resume all duties', async () => {
    act(() => store.dispatch({ type: 'me', me: ADMIN }));
    let paused = false;
    api = fakeApi({
      'GET /v1/duties': () => ({ body: { duties: [REPORT], paused } }),
      'PATCH /v1/duties': (c) => {
        paused = (c.body as { paused: boolean }).paused;
        return { body: { paused } };
      },
    });
    const el = mount(<DutyList />);
    await settle();
    click(keyNamed(el, 'Pause all duties'));
    const dialog = document.querySelector('dialog.confirm')!;
    expect(text(dialog.querySelector('h2'))).toBe('Pause every duty?');
    typeIn(dialog.querySelector('input'), 'Freeze for the release');
    click(keyNamed(dialog, 'Pause all duties'));
    await settle();
    const patch = api.calls.find((c) => c.method === 'PATCH')!;
    expect(patch.path).toBe('/v1/duties');
    expect(patch.body).toEqual({ paused: true, reason: 'Freeze for the release' });
    expect(patch.headers['X-Time-Zone']).toBe(ZONE);
    expect(document.querySelector('dialog.confirm')).toBeNull();
    expect(text(el.querySelector('.duty-note'))).toContain('Every duty is paused.');
    expect(text(el.querySelector('.duty-row'))).toContain('paused');
    click(keyNamed(el, 'Resume all duties'));
    await settle();
    expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ paused: true, reason: 'Freeze for the release' }, { paused: false }]);
    expect(el.querySelector('.duty-note')).toBeNull();
    expect(keyNamed(el, 'Pause all duties')).toBeTruthy();
  });

  it('shows a person who is no admin that every duty is paused, with no key', async () => {
    api = fakeApi(listOf([REPORT], true));
    const el = mount(<DutyList />);
    await settle();
    expect(text(el.querySelector('.duty-note'))).toBe('Every duty is paused.');
    expect(keyNamed(el, 'Resume all duties')).toBeUndefined();
    expect(keyNamed(el, 'Pause all duties')).toBeUndefined();
  });
});

describe('the page of a duty', () => {
  const one = (d: Duty, history: DutyRun[] = []) => ({ ...listOf([d]), ['GET /v1/duties/' + d.name]: { ...d, history } });

  it('shows its readback, the next five times, what it does, its check, its limits, and its history', async () => {
    api = fakeApi(one(WATCH, RUNS));
    const el = mount(<DutyMain name="watch-p1" />);
    await settle();
    expect(api.calls.find((c) => c.path === '/v1/duties/watch-p1')!.headers['X-Time-Zone']).toBe(ZONE);
    expect(text(el.querySelector('h1'))).toBe('Triage these: [What the check found]');
    expect(text(el.querySelector('.pane-head'))).toContain('failed');
    expect(text(el.querySelector('.duty-readback'))).toBe('Every 15 minutes between 8:00 AM and 6:00 PM, UTC.');
    expect([...el.querySelectorAll('.duty-next li')].map(text)).toEqual(NEXT.slice(0, 5).map(nextWords));
    expect(text(el.querySelector('.duty-message'))).toBe('Triage these: What the check found');
    expect(el.querySelector('.duty-ph')!.textContent).toBe('What the check found');
    expect(text(el)).toContain('Call the tool servicenow.query_incidents of triage. Take the list at result.records. Wake triage only for items whose number it did not see before.');
    expect(text(el)).toContain('A run gets at most $0.50.');
    expect(text(el)).toContain('The manager decides a question for you. After 2 hours without an answer, the answer is no.');
    expect(text(el)).toContain('Failures and questions.');
    // Each run with its time, its light, what the check found, its cost, and its run.
    const runs = [...el.querySelectorAll('.duty-run')];
    expect(runs.length).toBe(3);
    expect(text(runs[0])).toContain('failed Found 2, woke the agent $0.04 The run reached its limit. Open the run');
    expect(runs[0].querySelector('a.duty-run-link')!.getAttribute('href')).toBe('/ui#run/01KWOKE');
    expect(runs[0].querySelector('time')).toBeTruthy();
    expect(text(runs[1])).toContain('slept Found nothing');
    expect(runs[1].querySelector('a')).toBeNull();
    expect(text(runs[2])).toContain('skipped The last run still works.');
    expect(text(el.querySelector('#duty-history'))).toContain('3');
  });

  it('says in the history who decided a question while you were away', async () => {
    const decided: DutyRun = {
      at: ago(20),
      run: '01KASK',
      state: 'completed',
      costUSD: 0.05,
      decided: [
        { at: ago(19), by: 'manager', verdict: 'allow', tool: 'shell.exec', reason: 'it only reads the disk' },
        { at: ago(18), by: 'timeout', verdict: 'deny', tool: 'git.push' },
        { at: ago(17), by: 'alice@example.com', verdict: 'cancel', tool: 'bash', reason: 'wrong host' },
      ],
    };
    api = fakeApi(one(REPORT, [decided]));
    const el = mount(<DutyMain name="daily-report" />);
    await settle();
    const list = el.querySelector('.duty-run ul.duty-decided')!;
    expect(list.getAttribute('aria-label')).toBe('Decided while you were away');
    expect([...list.querySelectorAll('li')].map((li) => text(li.querySelector('span:last-child')))).toEqual([
      'The manager allowed shell.exec: it only reads the disk',
      'Nobody answered in time, so git.push was denied.',
      'You stopped the run at bash: wrong host',
    ]);
    expect(list.querySelectorAll('time').length).toBe(3);
  });

  it('says what a duty of each action does', async () => {
    act(() => store.dispatch({ type: 'bridges', bridges: [{ id: 'b1', title: 'Homelab operations', goal: '', operator: '', state: 'open', placement: 'queue', createdAt: ago(900), closedAt: null, delegation: { approve: false, budget: false, members: false, report: true }, caps: { maxMessages: 1, maxFanoutPerMinute: 1, maxPairMessages: 1 }, lastSeq: 0, read: 0, unread: 0 }] }));
    const post = base({ name: 'post-review', do: { post: { bridge: 'b1', to: ['reviewer', 'tester'], message: 'Review {date}.' } }, readback: 'Every weekday at 9:00 AM, New York time.' });
    api = fakeApi(one(post));
    let el = mount(<DutyMain name="post-review" />);
    await settle();
    const what = () => text(el.querySelector('section[aria-labelledby="duty-what"]'));
    expect(what()).toBe("What it does scribe posts in Homelab operations to reviewer and tester Review Today's date.");
    expect(el.querySelector('section[aria-labelledby="duty-what"] a[href="#bridge/b1"]')).toBeTruthy();
    unmountAll();
    api.restore();
    const open = base({ name: 'patching', do: { open: { playbook: 'weekly-patching', goal: 'Patch on {date}.' } }, when: { event: { kind: 'bridge.closed', agent: 'triage' } } });
    api = fakeApi(one(open));
    el = mount(<DutyMain name="patching" />);
    await settle();
    expect(what()).toBe("What it does scribe opens a bridge from the playbook Weekly patching Patch on Today's date.");
    expect(text(el.querySelector('.duty-readback'))).toBe('When a bridge of triage closes');
    unmountAll();
    api.restore();
    const manager = base({ name: 'ask-boss', do: { manager: { message: 'Sum up the week.' } } });
    api = fakeApi(one(manager));
    el = mount(<DutyMain name="ask-boss" />);
    await settle();
    expect(what()).toBe('What it does Ask the manager Sum up the week.');
  });

  it('starts a run now and links it, and says why a duty skipped', async () => {
    let n = 0;
    api = fakeApi({ ...one(REPORT), 'POST /v1/duties/daily-report/run': () => (++n === 1 ? { status: 202, body: { run: '01KNEW' } } : { body: { skipped: 'The last run still works.' } }) });
    const el = mount(<DutyMain name="daily-report" />);
    await settle();
    click(keyNamed(el, 'Run now'));
    await settle();
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.path).toBe('/v1/duties/daily-report/run');
    expect(post.headers['X-Time-Zone']).toBe(ZONE);
    expect(text(el.querySelector('.duty-said'))).toBe('A run started. Open the run');
    expect(el.querySelector('.duty-said a')!.getAttribute('href')).toBe('/ui#run/01KNEW');
    click(keyNamed(el, 'Run now'));
    await settle();
    expect(text(el.querySelector('.duty-said'))).toBe('Skipped: The last run still works.');
  });

  it('pauses and resumes a duty', async () => {
    let paused = false;
    api = fakeApi({
      ...listOf([REPORT]),
      'GET /v1/duties/daily-report': () => ({ body: { ...REPORT, paused, history: [] } }),
      'PATCH /v1/duties/daily-report': (c) => {
        paused = (c.body as { paused: boolean }).paused;
        return { body: { ...REPORT, paused } };
      },
    });
    const el = mount(<DutyMain name="daily-report" />);
    await settle();
    click(keyNamed(el, 'Pause'));
    await settle();
    expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ paused: true }]);
    expect(keyNamed(el, 'Resume')).toBeTruthy();
    expect(text(el.querySelector('.pane-head'))).toContain('paused');
    click(keyNamed(el, 'Resume'));
    await settle();
    expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ paused: true }, { paused: false }]);
    expect(keyNamed(el, 'Pause')).toBeTruthy();
  });

  it('says why a duty paused itself', async () => {
    api = fakeApi(one(MONTHLY));
    const el = mount(<DutyMain name="monthly-summary" />);
    await settle();
    expect(text(el)).toContain('Paused. Three runs in a row failed.');
    expect(el.querySelector('.duty-next')).toBeNull();
  });

  it('deletes a duty after a confirmation and goes back to the list', async () => {
    location.hash = '#duties/daily-report';
    api = fakeApi({ ...one(REPORT), 'DELETE /v1/duties/daily-report': () => ({ status: 204 }) });
    const el = mount(<DutyMain name="daily-report" />);
    await settle();
    click(el.querySelector('button[aria-label="More"]'));
    click([...el.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === 'Delete'));
    const dialog = document.querySelector('dialog.confirm')!;
    expect(text(dialog.querySelector('h2'))).toBe("Delete Write the report of [Today's date].?");
    expect(api.calls.some((c) => c.method === 'DELETE')).toBe(false);
    click(keyNamed(dialog, 'Delete'));
    await settle();
    expect(api.calls.find((c) => c.method === 'DELETE')!.path).toBe('/v1/duties/daily-report');
    expect(location.hash).toBe('#duties');
  });

  it('offers only Run now to a person who cannot change the duty, and to a duty of the settings', async () => {
    act(() => store.dispatch({ type: 'me', me: BOB }));
    api = fakeApi(one(REPORT));
    let el = mount(<DutyMain name="daily-report" />);
    await settle();
    expect(keyNamed(el, 'Run now')).toBeTruthy();
    expect(keyNamed(el, 'Pause')).toBeUndefined();
    expect(keyNamed(el, 'Edit')).toBeUndefined();
    expect(el.querySelector('button[aria-label="More"]')).toBeNull();
    unmountAll();
    api.restore();
    act(() => store.dispatch({ type: 'me', me: ADMIN }));
    const file = { ...REPORT, name: 'from-settings', source: 'file' };
    api = fakeApi(one(file));
    el = mount(<DutyMain name="from-settings" />);
    await settle();
    expect(text(el)).toContain('This duty comes from the settings of the front. Change it there.');
    expect(keyNamed(el, 'Edit')).toBeUndefined();
  });

  it('reads the duty again when a run of its history changes its state, as no event of a duty reaches the page', async () => {
    api = fakeApi(one(WATCH, RUNS));
    mount(<DutyMain name="watch-p1" />);
    await settle();
    const reads = () => api.calls.filter((c) => c.path === '/v1/duties/watch-p1').length;
    const at = new Date().toISOString();
    act(() => store.dispatch({ type: 'run', run: { id: '01KWOKE', agent: 'triage', state: 'running', seq: 1, createdAt: at, updatedAt: at } }));
    await settle();
    // The page learns the state of the run: no change yet, so no read.
    expect(reads()).toBe(1);
    act(() => store.dispatch({ type: 'run', run: { id: '01KWOKE', agent: 'triage', state: 'completed', seq: 2, createdAt: at, updatedAt: at } }));
    await settle();
    expect(reads()).toBe(2);
  });

  it('says that a duty is gone', async () => {
    api = fakeApi(listOf([]));
    const el = mount(<DutyMain name="gone-duty" />);
    await settle();
    expect(text(el)).toContain('This duty is not here. It was removed, or you cannot see it.');
  });
});

describe('the profile of an agent', () => {
  it('counts the duties of the agent and links each one', async () => {
    api = fakeApi(listOf([REPORT, WATCH, MONTHLY]));
    const el = mount(<Profile agent="scribe" />);
    await settle();
    const sec = el.querySelector('section[aria-labelledby="duties-scribe"]')!;
    expect(sec.querySelector('h3')!.textContent).toBe('Duties');
    expect(sec.querySelector('.chip .sr')!.textContent).toBe('2 duties');
    expect([...sec.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ["Write the report of [Today's date].", '#duties/daily-report'],
      ['Sum up the month.', '#duties/monthly-summary'],
    ]);
  });

  it('shows no section for an agent without a duty', async () => {
    api = fakeApi(listOf([WATCH]));
    const el = mount(<Profile agent="scribe" />);
    await settle();
    expect(el.querySelector('section[aria-labelledby="duties-scribe"]')).toBeNull();
  });
});
