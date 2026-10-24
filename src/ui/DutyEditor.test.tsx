import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Duty, DutyRecord, Fleet, Whoami } from '../api/types';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { nextWords } from '../lib/duties';
import { DutyEditor, timing } from './DutyEditor';
import { clearNotice } from './notice';
import { click, fakeApi, fieldOf, keyNamed, mount, problem, settle, typeIn, unmountAll, type Call, type Route } from './testkit-c';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: { migrator: 'owner' }, admin: false, canCreate: true };
const FLEET: Fleet = {
  name: 'front-0',
  members: [],
  pools: [
    { name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }] },
    { name: 'review', atespace: 'default', agent: 'reviewer', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'review-0', phase: 'Running', current: true }] },
  ],
};
const NEXT = Array.from({ length: 6 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + 1 + i);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
});
const WEEKDAYS = { repeat: 'weekdays', times: ['09:00'], timeZone: ZONE };
const READBACK = 'Every weekday at 9:00 AM, your time.';

/** dry answers a dry run: the record as it came, the readback, and the next times. */
const dry =
  (extra: Record<string, unknown> = {}): Route =>
  (c: Call) => ({ body: { duty: c.body, readback: READBACK, next: NEXT, problems: [], ...extra } });

let api: ReturnType<typeof fakeApi>;
beforeAll(() => {
  timing.preview = 0;
});
beforeEach(() => {
  forgetDuties();
  location.hash = '#duties/new';
  act(() => {
    store.dispatch({ type: 'me', me: ALICE });
    store.dispatch({ type: 'fleet', fleet: FLEET });
    store.dispatch({ type: 'agents', agents: [{ name: 'migrator', role: 'owner' }] });
  });
});
afterEach(() => {
  unmountAll();
  clearNotice();
  if (api) api.restore();
});

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

/** change picks a value of a select and sends the change event. */
function change(el: Element | null, value: string): void {
  if (!el) throw new Error('no select');
  act(() => {
    (el as HTMLSelectElement).value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const select = (root: ParentNode, label: string) => root.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement | null;
const pressed = (root: ParentNode, group: string) => [...root.querySelectorAll(`[role="group"][aria-label="${group}"] button[aria-pressed="true"]`)].map((b) => b.getAttribute('aria-label'));
const puts = () => api.calls.filter((c) => c.method === 'PUT');
const lastPut = () => puts()[puts().length - 1];
const scheduleSent = () => (lastPut().body as DutyRecord).when.schedule;

/** pick opens the picker of Who and picks an agent by its name in the picker. */
function pick(el: HTMLElement, name: string): void {
  click(keyNamed(el, 'Pick an agent') || keyNamed(el, 'Change the agent'));
  click([...el.querySelectorAll('.picker .pick-row')].find((r) => r.querySelector('.pick-name')!.textContent === name));
}

/** openCheck opens the section Check first. */
function openCheck(el: HTMLElement): HTMLDetailsElement {
  const d = el.querySelector('details.duty-check') as HTMLDetailsElement;
  act(() => {
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
  });
  return d;
}

describe('New duty', () => {
  it('asks Who, When, Check first (closed), What, Limits, While you are away, and Tell me about, and reads the default schedule back', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'PUT /v1/duties/new?dryRun=true': dry({ problems: ['A duty needs a budget.'] }) });
    const el = mount(<DutyEditor />);
    await settle();
    expect(text(el.querySelector('h1'))).toBe('New duty');
    expect([...el.querySelectorAll('h2.duty-sec-head, details.duty-check > summary')].map(text)).toEqual(['Who', 'When', 'Check first', 'What', 'Limits', 'While you are away', 'Tell me about']);
    expect((el.querySelector('details.duty-check') as HTMLDetailsElement).open).toBe(false);
    expect(keyNamed(el, 'Pick an agent')).toBeTruthy();
    // The front reads the schedule back: every weekday at 9:00 AM in the zone of the browser.
    const put = lastPut();
    expect(put.path).toBe('/v1/duties/new?dryRun=true');
    expect(put.headers['X-Time-Zone']).toBe(ZONE);
    expect((put.body as DutyRecord).when).toEqual({ schedule: WEEKDAYS });
    // No silent cost: the record goes out with no budget of its own.
    expect((put.body as DutyRecord).limits.budget).toEqual({});
    const box = el.querySelector('.duty-readback-box')!;
    expect(text(box.querySelector('.duty-readback'))).toBe(READBACK);
    expect([...box.querySelectorAll('.duty-next li')].map(text)).toEqual(NEXT.slice(0, 5).map(nextWords));
    // A problem of another section stays out of the readback.
    expect(text(box)).not.toContain('budget');
    // The defaults of the other sections.
    expect((el.querySelector('input[name="duty-overlap"][value="skip"]') as HTMLInputElement).checked).toBe(true);
    expect(fieldOf(el, 'Catch up a missed time')!.value).toBe('1h');
    expect((el.querySelector('input[name="duty-decider"][value="manager"]') as HTMLInputElement).checked).toBe(true);
    expect(select(el, 'How long a question waits')!.value).toBe('2h');
    expect(select(el, 'Then')!.value).toBe('deny');
    expect([...el.querySelectorAll<HTMLInputElement>('section[aria-labelledby="duty-tell-head"] input')].map((i) => [i.closest('label')!.textContent, i.checked])).toEqual([
      ['Failures', true],
      ['Questions', true],
    ]);
    expect(fieldOf(el, 'Time zone')!.value).toBe(ZONE);
  });

  it('starts the sentence from a preset and marks the preset that it matches', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'PUT /v1/duties/new?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    expect(keyNamed(el, 'Every weekday')!.getAttribute('aria-pressed')).toBe('true');
    click(keyNamed(el, 'Every hour during work hours'));
    await settle();
    expect(scheduleSent()).toEqual({ repeat: 'hourly', days: ['mon', 'tue', 'wed', 'thu', 'fri'], between: ['09:00', '17:00'], timeZone: ZONE });
    expect(select(el, 'Repeat')!.value).toBe('hourly');
    expect(pressed(el, 'Days, none for every day')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect((el.querySelector('input[aria-label="From"]') as HTMLInputElement).value).toBe('09:00');
    expect((el.querySelector('input[aria-label="To"]') as HTMLInputElement).value).toBe('17:00');
    expect(keyNamed(el, 'Every hour during work hours')!.getAttribute('aria-pressed')).toBe('true');
    expect(keyNamed(el, 'Every weekday')!.getAttribute('aria-pressed')).toBe('false');
    click(keyNamed(el, 'First of the month'));
    await settle();
    expect(scheduleSent()).toEqual({ repeat: 'monthly', dayOfMonth: '1', times: ['09:00'], timeZone: ZONE });
    click(keyNamed(el, 'Every Monday'));
    await settle();
    expect(scheduleSent()).toEqual({ repeat: 'weekly', days: ['mon'], times: ['09:00'], timeZone: ZONE });
    click(keyNamed(el, 'Every morning'));
    await settle();
    expect(scheduleSent()).toEqual({ repeat: 'daily', times: ['08:00'], timeZone: ZONE });
  });

  it('builds the schedule from the choices of the sentence: the days, the weeks, the times, the day of the month, the span, and the zone', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'PUT /v1/duties/new?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    change(select(el, 'Repeat'), 'weekly');
    click(el.querySelector('[aria-label="Days"] button[aria-label="Monday"]'));
    click(el.querySelector('[aria-label="Days"] button[aria-label="Thursday"]'));
    change(select(el, 'Which weeks'), '2');
    typeIn(el.querySelector('input[aria-label="Time"]'), '15:00');
    click(keyNamed(el, 'Add a time'));
    typeIn(el.querySelector('input[aria-label="Time 2"]'), '16:30');
    await settle();
    expect(scheduleSent()).toEqual({ repeat: 'weekly', days: ['mon', 'thu'], everyWeeks: 2, times: ['15:00', '16:30'], timeZone: ZONE });
    click(el.querySelector('button[aria-label="Remove time 2"]'));
    change(select(el, 'Repeat'), 'monthly');
    change(select(el, 'Day of the month'), 'first-weekday');
    change(select(el, 'Weekday'), 'tue');
    await settle();
    expect(scheduleSent()).toEqual({ repeat: 'monthly', dayOfMonth: 'first tuesday', times: ['15:00'], timeZone: ZONE });
    change(select(el, 'Day of the month'), 'last');
    await settle();
    expect(scheduleSent()).toEqual({ repeat: 'monthly', dayOfMonth: 'last', times: ['15:00'], timeZone: ZONE });
    change(select(el, 'Repeat'), 'every');
    change(select(el, 'How often'), '2h');
    change(fieldOf(el, 'Time zone'), 'UTC');
    await settle();
    // The days of the week stay pressed, so the span runs on those days only.
    expect(scheduleSent()).toEqual({ repeat: 'every', every: '2h', days: ['mon', 'thu'], timeZone: 'UTC' });
    // A week with no day reads nothing back and says what it lacks on a save.
    change(select(el, 'Repeat'), 'weekly');
    click(el.querySelector('[aria-label="Days"] button[aria-label="Monday"]'));
    click(el.querySelector('[aria-label="Days"] button[aria-label="Thursday"]'));
    const before = puts().length;
    await settle();
    expect(puts().length).toBe(before);
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(el.querySelector('section[aria-labelledby="duty-when-head"] .field-error'))).toBe('Pick at least one day.');
  });

  it('reads the words of a person back and fills the sentence with the schedule of the front, or names what it cannot read', async () => {
    const said: string[] = [];
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'PUT /v1/duties/new?dryRun=true': (c: Call) => {
        const b = c.body as DutyRecord;
        if (b.when.say) said.push(b.when.say);
        if (b.when.say === 'every other tuesday at 3pm')
          return { body: { duty: { ...b, when: { schedule: { repeat: 'weekly', days: ['tue'], everyWeeks: 2, times: ['15:00'], timeZone: 'America/New_York' } } }, readback: 'Every other Tuesday at 3:00 PM, New York time.', next: NEXT, problems: [] } };
        if (b.when.say) return { body: { duty: null, readback: '', next: [], problems: ['when.say: Every Tuesday is clear. After lunch is not a time: pick one.', 'limits.budget: A duty needs a budget.'] } };
        return { body: { duty: b, readback: READBACK, next: NEXT, problems: [] } };
      },
    });
    const el = mount(<DutyEditor />);
    await settle();
    const calls = puts().length;
    typeIn(fieldOf(el, 'Say it in your own words'), 'every other tuesday at 3pm');
    click(keyNamed(el, 'Read it back'));
    await settle();
    expect(said).toEqual(['every other tuesday at 3pm']);
    expect(puts()[calls].headers['X-Time-Zone']).toBe(ZONE);
    // The sentence takes the schedule, with its zone, and the page asks no second time.
    expect(select(el, 'Repeat')!.value).toBe('weekly');
    expect(pressed(el, 'Days')).toEqual(['Tuesday']);
    expect(select(el, 'Which weeks')!.value).toBe('2');
    expect((el.querySelector('input[aria-label="Time"]') as HTMLInputElement).value).toBe('15:00');
    expect(fieldOf(el, 'Time zone')!.value).toBe('America/New_York');
    expect(text(el.querySelector('.duty-readback-box .duty-readback'))).toBe('Every other Tuesday at 3:00 PM, New York time.');
    expect(el.querySelectorAll('.duty-readback-box .duty-next li').length).toBe(5);
    expect(puts().length).toBe(calls + 1);
    typeIn(fieldOf(el, 'Say it in your own words'), 'every tuesday after lunch');
    click(keyNamed(el, 'Read it back'));
    await settle();
    const box = fieldOf(el, 'Say it in your own words')!.closest('label')!;
    expect(text(box.querySelector('.field-error'))).toBe('Every Tuesday is clear. After lunch is not a time: pick one.');
    // The sentence stays as it was.
    expect(pressed(el, 'Days')).toEqual(['Tuesday']);
  });

  it('refuses a duty without a budget, then shows the readback and the next five times before it saves', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [{ name: 'taken' }], paused: false },
      'PUT /v1/duties/new?dryRun=true': dry(),
      'PUT /v1/duties/draft-the-notes?dryRun=true': dry(),
      'PUT /v1/duties/draft-the-notes': (c: Call) => ({ status: 201, body: { ...(c.body as object), owner: 'alice@example.com', revision: 1, readback: READBACK, next: NEXT } }),
      'GET /v1/duties/draft-the-notes': (c: Call) => ({ body: { name: 'draft-the-notes', agent: 'migrator', when: { schedule: WEEKDAYS }, do: { ask: { message: 'x' } }, limits: { budget: { maxCostUSD: 0.5 } }, history: [], path: c.path } }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    const before = puts().length;
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(puts().length).toBe(before);
    expect(text(el.querySelector('section[aria-labelledby="duty-who-head"] .field-error'))).toBe('Pick the agent that does the duty.');
    const cost = fieldOf(el, 'The most a run can cost')!;
    expect(cost.getAttribute('aria-invalid')).toBe('true');
    expect(text(cost.closest('label')!.querySelector('.field-error'))).toBe('A duty needs a budget. Write the most a run can cost, such as 0.50.');
    expect(text(fieldOf(el, 'Ask the agent')!.closest('label')!.querySelector('.field-error'))).toBe('Write what the agent does.');

    pick(el, 'Migrator');
    expect(text(el.querySelector('.duty-who'))).toContain('migrator');
    expect(keyNamed(el, 'Change the agent')).toBeTruthy();
    typeIn(fieldOf(el, 'Ask migrator'), 'Draft the notes of ');
    click(keyNamed(el, "Today's date"));
    await settle();
    expect(fieldOf(el, 'Ask migrator')!.value).toBe("Draft the notes of [Today's date]");
    expect(fieldOf(el, 'Name')!.value).toBe('draft-the-notes');
    typeIn(fieldOf(el, 'Name'), 'taken');
    typeIn(cost, '0.50');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Name')!.closest('label')!.querySelector('.field-error'))).toBe('A duty of this name exists. Pick another name.');
    typeIn(fieldOf(el, 'Name'), 'draft-the-notes');
    click(keyNamed(el, 'Save duty'));
    await settle();
    const check = lastPut();
    expect(check.path).toBe('/v1/duties/draft-the-notes?dryRun=true');
    const record = {
      name: 'draft-the-notes',
      agent: 'migrator',
      when: { schedule: WEEKDAYS },
      do: { ask: { message: 'Draft the notes of {date}' } },
      limits: { budget: { maxCostUSD: 0.5 }, overlap: 'skip', catchUp: '1h' },
      whileAway: { decider: 'manager', timeout: '2h', then: 'deny' },
      notify: { failure: ['owner'], needsYou: ['owner'] },
    };
    expect(check.body).toEqual(record);
    // The readback and the next five times, before the save.
    const dialog = document.querySelector('dialog.confirm')!;
    expect(text(dialog.querySelector('h2'))).toBe('Save this duty?');
    expect(text(dialog.querySelector('.duty-readback'))).toBe(READBACK);
    expect([...dialog.querySelectorAll('.duty-next li')].map(text)).toEqual(NEXT.slice(0, 5).map(nextWords));
    expect(text(dialog)).toContain('A run gets at most $0.50.');
    expect(puts().some((c) => c.path === '/v1/duties/draft-the-notes')).toBe(false);
    click(keyNamed(dialog, 'Save duty'));
    await settle();
    const saved = puts().find((c) => c.path === '/v1/duties/draft-the-notes')!;
    expect(saved.body).toEqual(record);
    expect(saved.headers['X-Time-Zone']).toBe(ZONE);
    expect(location.hash).toBe('#duties/draft-the-notes');
  });

  it('shows the problems of the front in words and saves nothing', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'PUT /v1/duties/new?dryRun=true': dry(),
      'PUT /v1/duties/sum-up?dryRun=true': dry({ problems: ['The agent migrator cannot run at night.'] }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'Ask migrator'), 'Sum up.');
    typeIn(fieldOf(el, 'The most a run can cost'), '1');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(el.querySelector('.duty-problems-box'))).toBe('The duty cannot save yet. The agent migrator cannot run at night.');
    expect(document.querySelector('dialog.confirm')).toBeNull();
  });
});

describe('the chips of a message', () => {
  const DUTY: Duty = {
    name: 'watch-queue',
    agent: 'migrator',
    owner: 'bob@example.com',
    when: { schedule: { repeat: 'every', every: '15m', timeZone: 'UTC' } },
    checkFirst: { look: { http: { url: 'https://q.example/api' } }, items: 'items', key: 'id', wake: { when: 'new' } },
    do: { ask: { message: 'Handle {found}. The last report was {last.title} on {date}.', files: ['a.md'] } },
    limits: { budget: { maxCostUSD: 0.25, maxTokens: 5000 }, overlap: 'queue', catchUp: '0', retries: 2 },
    whileAway: { decider: 'nobody', timeout: '30m', then: 'cancel' },
    notify: { failure: ['owner'], needsYou: [] },
    runAs: 'owner',
    paused: true,
    source: 'store',
    revision: 9,
    readback: 'Every 15 minutes, UTC.',
  };

  it('show each placeholder as its words, insert a word at the caret, and store the placeholders of the contract on a save', async () => {
    location.hash = '#duties/watch-queue/edit';
    api = fakeApi({
      'GET /v1/duties': { duties: [DUTY], paused: false },
      'GET /v1/duties/watch-queue': { ...DUTY, history: [] },
      'PUT /v1/duties/watch-queue?dryRun=true': dry(),
      'PUT /v1/duties/watch-queue': (c: Call) => ({ body: { ...DUTY, ...(c.body as object) } }),
    });
    const el = mount(<DutyEditor name="watch-queue" />);
    await settle();
    expect(text(el.querySelector('h1'))).toBe('Edit duty');
    expect(fieldOf(el, 'Name')).toBeNull();
    const box = fieldOf(el, 'Ask migrator') as unknown as HTMLTextAreaElement;
    expect(box.value).toBe("Handle [What the check found]. The last report was [The last run's title] on [Today's date].");
    expect([...el.querySelectorAll('.duty-chips button')].map((b) => b.textContent)).toEqual(["Today's date", 'The time', 'What the check found', "The last run's title", 'The last run', 'How the last run ended', "This duty's name"]);
    expect(el.querySelector('.duty-chips button')!.getAttribute('aria-label')).toBe("Insert Today's date");
    // The caret sits after Handle, and the chip goes there.
    box.setSelectionRange(6, 6);
    click(keyNamed(el, 'The time'));
    await settle();
    expect(box.value).toBe("Handle[The time] [What the check found]. The last report was [The last run's title] on [Today's date].");
    // The sections show the duty as it is.
    expect((el.querySelector('details.duty-check') as HTMLDetailsElement).open).toBe(true);
    expect(fieldOf(el, 'Address')!.value).toBe('https://q.example/api');
    expect((el.querySelector('input[name="duty-overlap"][value="queue"]') as HTMLInputElement).checked).toBe(true);
    expect(fieldOf(el, 'Catch up a missed time')!.value).toBe('0');
    expect((el.querySelector('input[name="duty-decider"][value="nobody"]') as HTMLInputElement).checked).toBe(true);
    expect(select(el, 'Then')!.value).toBe('cancel');
    click(keyNamed(el, 'Save duty'));
    await settle();
    click(keyNamed(document.querySelector('dialog.confirm')!, 'Save duty'));
    await settle();
    const saved = puts().find((c) => c.path === '/v1/duties/watch-queue')!;
    expect(saved.body).toEqual({
      name: 'watch-queue',
      agent: 'migrator',
      when: { schedule: { repeat: 'every', every: '15m', timeZone: 'UTC' } },
      checkFirst: { look: { http: { url: 'https://q.example/api' } }, items: 'items', key: 'id', wake: { when: 'new' } },
      do: { ask: { message: 'Handle{time} {found}. The last report was {last.title} on {date}.', files: ['a.md'] } },
      limits: { budget: { maxCostUSD: 0.25, maxTokens: 5000 }, overlap: 'queue', catchUp: '0', retries: 2 },
      whileAway: { decider: 'nobody', timeout: '30m', then: 'cancel' },
      notify: { failure: ['owner'], needsYou: [] },
      runAs: 'owner',
      paused: true,
      revision: 9,
    });
    expect(location.hash).toBe('#duties/watch-queue');
  });

  it('keep a start that the page cannot change yet', async () => {
    const hook: Duty = { ...DUTY, name: 'on-call', when: { webhook: { auth: { mode: 'bearer', secret: 'HOOK' } } }, readback: '' };
    api = fakeApi({
      'GET /v1/duties': { duties: [hook], paused: false },
      'GET /v1/duties/on-call': { ...hook, history: [] },
      'PUT /v1/duties/on-call?dryRun=true': dry({ readback: '' }),
    });
    const el = mount(<DutyEditor name="on-call" />);
    await settle();
    expect(text(el.querySelector('section[aria-labelledby="duty-when-head"]'))).toBe('When When another app calls. The page keeps this start.');
    expect(select(el, 'Repeat')).toBeNull();
    // Another app starts a run when it calls, so no time can be missed.
    expect(fieldOf(el, 'Catch up a missed time')).toBeNull();
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect((lastPut().body as DutyRecord).when).toEqual(hook.when);
  });

  it('says that a duty changed in the meantime', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [DUTY], paused: false },
      'GET /v1/duties/watch-queue': { ...DUTY, history: [] },
      'PUT /v1/duties/watch-queue?dryRun=true': dry(),
      'PUT /v1/duties/watch-queue': () => problem(409, 'the duty changed: revision 10 is newer than 9'),
    });
    const el = mount(<DutyEditor name="watch-queue" />);
    await settle();
    click(keyNamed(el, 'Save duty'));
    await settle();
    click(keyNamed(document.querySelector('dialog.confirm')!, 'Save duty'));
    await settle();
    expect(text(el.querySelector('.duty-problems-box'))).toContain('This duty changed since you opened it. Open it again, then make your change.');
    expect(location.hash).not.toBe('#duties/watch-queue');
  });
});

describe('Check first', () => {
  const FOUND = { found: [{ number: 'INC0012', short: 'VPN down' }, { number: 'INC0019', short: 'Mail slow' }], count: 2, wakes: true };

  it('takes the fields by hand when the front cannot write a check, reads the check back, and tries it', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'PUT /v1/duties/new?dryRun=true': dry(),
      'PUT /v1/duties/new?dryRun=true&test=true': dry({ check: FOUND }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    pick(el, 'Migrator');
    openCheck(el);
    expect(fieldOf(el, 'Address')).toBeNull();
    typeIn(fieldOf(el, 'Wake the agent only when'), 'there is a new P1 in the queue');
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    const write = api.calls.find((c) => c.method === 'POST')!;
    expect(write.path).toBe('/v1/duties/new/write-check');
    expect(write.body).toEqual({ words: 'there is a new P1 in the queue', agent: 'migrator' });
    expect(write.headers['X-Time-Zone']).toBe(ZONE);
    // The route answered 404: the key goes, and the fields by hand show.
    expect(keyNamed(el, 'Write the check for me')).toBeUndefined();
    expect(fieldOf(el, 'Wake the agent only when')).toBeNull();
    typeIn(fieldOf(el, 'Address'), 'https://example.com/api/queue');
    typeIn(fieldOf(el, 'Where the list is'), 'result.records');
    typeIn(fieldOf(el, 'What makes an item new'), 'number');
    expect(text(el.querySelector('details.duty-check .duty-readback'))).toBe('Look at example.com/api/queue. Take the list at result.records. Wake migrator only for items whose number it did not see before.');
    // A check offers its chip to the message.
    expect(keyNamed(el, 'What the check found')).toBeTruthy();
    click(keyNamed(el, 'Try the check'));
    await settle();
    const tried = lastPut();
    expect(tried.path).toBe('/v1/duties/new?dryRun=true&test=true');
    expect((tried.body as DutyRecord).checkFirst).toEqual({ look: { http: { url: 'https://example.com/api/queue' } }, items: 'result.records', key: 'number', wake: { when: 'new' } });
    expect(text(el.querySelector('.duty-found > p'))).toBe('Now: 2 items. They would wake migrator.');
    expect([...el.querySelectorAll('.duty-items li')].map(text)).toEqual(['INC0012', 'INC0019']);
    // At a count needs a whole number on a save.
    click(el.querySelector('input[name="duty-wake"][value="atLeast"]'));
    typeIn(fieldOf(el, 'The most a run can cost'), '0.10');
    typeIn(fieldOf(el, 'Ask migrator'), 'Handle the queue.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'How many items')!.closest('label')!.querySelector('.field-error'))).toBe('Write a whole number of items.');
    typeIn(fieldOf(el, 'How many items'), '5');
    expect(text(el.querySelector('details.duty-check .duty-readback'))).toContain('Wake migrator at 5 items or more.');
  });

  it('hides Write the check when the front answers 501', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'PUT /v1/duties/new?dryRun=true': dry(),
      'POST /v1/duties/new/write-check': () => problem(501, 'the front cannot write a check'),
    });
    const el = mount(<DutyEditor />);
    await settle();
    pick(el, 'Migrator');
    openCheck(el);
    typeIn(fieldOf(el, 'Wake the agent only when'), 'a new incident');
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    expect(keyNamed(el, 'Write the check for me')).toBeUndefined();
    expect(fieldOf(el, 'Address')).toBeTruthy();
  });

  it('fills the fields from the check that the agent wrote, with its readback and what it finds now, and says why it could not', async () => {
    let n = 0;
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'PUT /v1/duties/new?dryRun=true': dry(),
      'POST /v1/duties/new/write-check': () =>
        ++n === 1
          ? problem(422, 'The agent has no tool that reads the queue.')
          : {
              body: {
                checkFirst: { look: { tool: 'servicenow.query_incidents', input: { query: 'priority<=2', limit: 20 } }, items: 'result.records', key: 'number', where: [{ field: 'priority', oneOf: [1, 2] }], wake: { when: 'new' } },
                readback: 'Every 15 minutes, look in ServiceNow for incidents with priority 1 or 2. Wake triage only for new ones.',
                check: FOUND,
              },
            },
    });
    const el = mount(<DutyEditor />);
    await settle();
    openCheck(el);
    typeIn(fieldOf(el, 'Wake the agent only when'), 'a new P1 or P2');
    // The key stays off until the editor has an agent, which writes the check.
    expect((keyNamed(el, 'Write the check for me') as HTMLButtonElement).disabled).toBe(true);
    expect(text(el.querySelector('#duty-write-hint'))).toBe('Pick the agent first. It writes the check.');
    pick(el, 'Migrator');
    expect((keyNamed(el, 'Write the check for me') as HTMLButtonElement).disabled).toBe(false);
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    expect(text(fieldOf(el, 'Wake the agent only when')!.closest('label')!.querySelector('.field-error'))).toBe('The agent has no tool that reads the queue.');
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    expect(keyNamed(el, 'Write the check for me')).toBeTruthy();
    expect(fieldOf(el, 'Tool')!.value).toBe('servicenow.query_incidents');
    expect(fieldOf(el, 'Where the list is')!.value).toBe('result.records');
    expect((el.querySelector('input[aria-label="Value 2"]') as HTMLInputElement).value).toBe('20');
    // The filter of the agent shows as a field, a test, and a value, which the person can change.
    expect((el.querySelector('input[aria-label="Field of filter 1"]') as HTMLInputElement).value).toBe('priority');
    expect(select(el, 'Test of filter 1')!.value).toBe('oneOf');
    expect((el.querySelector('input[aria-label="Value of filter 1"]') as HTMLInputElement).value).toBe('1, 2');
    expect(text(el.querySelector('details.duty-check .duty-readback'))).toBe('Every 15 minutes, look in ServiceNow for incidents with priority 1 or 2. Wake triage only for new ones.');
    expect(text(el.querySelector('.duty-found > p'))).toBe('Now: 2 items. They would wake migrator.');
  });
});

describe('Tell me about', () => {
  const DUTY: Duty = {
    name: 'nightly-restore',
    agent: 'migrator',
    when: { schedule: { repeat: 'daily', times: ['02:00'], timeZone: 'UTC' } },
    do: { ask: { message: 'Restore last night and check it.' } },
    limits: { budget: { maxCostUSD: 0.5 }, overlap: 'skip', catchUp: '1h' },
    whileAway: { decider: 'manager', timeout: '2h', then: 'deny' },
    notify: { failure: ['owner', 'channel:pager'], needsYou: ['owner'] },
    source: 'store',
    revision: 2,
    readback: 'Every day at 2:00 AM, UTC.',
  };
  const tell = (el: HTMLElement) =>
    [...el.querySelectorAll('section[aria-labelledby="duty-tell-head"] [role="group"]')].map((g) => [
      text(document.getElementById(g.getAttribute('aria-labelledby')!)),
      [...g.querySelectorAll<HTMLInputElement>('input')].map((i) => i.closest('label')!.textContent + (i.checked ? ' on' : ' off')),
    ]);

  it('offers the shared channels of the operator by their label, keeps a channel that the duty names, and stores each as channel:<name>', async () => {
    location.hash = '#duties/nightly-restore/edit';
    api = fakeApi({
      'GET /v1/notifications': { channels: [], quietHours: { from: '', to: '', timeZone: 'UTC' }, shared: [{ name: 'ops-room', kind: 'slack', label: 'Ops room' }] },
      'GET /v1/duties': { duties: [DUTY], paused: false },
      'GET /v1/duties/nightly-restore': { ...DUTY, history: [] },
      'PUT /v1/duties/nightly-restore?dryRun=true': dry(),
      'PUT /v1/duties/nightly-restore': (c: Call) => ({ body: { ...DUTY, ...(c.body as object) } }),
    });
    const el = mount(<DutyEditor name="nightly-restore" />);
    await settle();
    expect(tell(el)).toEqual([
      ['You', ['Failures on', 'Questions on']],
      ['The Ops room channel', ['Failures off', 'Questions off']],
      ['The pager channel', ['Failures on', 'Questions off']],
    ]);
    const room = el.querySelector('[aria-labelledby="duty-tell-0"]')!;
    click([...room.querySelectorAll('input')][1]);
    click([...el.querySelector('[aria-labelledby="duty-tell-1"]')!.querySelectorAll('input')][0]);
    click(keyNamed(el, 'Save duty'));
    await settle();
    click(keyNamed(document.querySelector('dialog.confirm')!, 'Save duty'));
    await settle();
    const saved = puts().find((c) => c.path === '/v1/duties/nightly-restore')!;
    expect((saved.body as DutyRecord).notify).toEqual({ failure: ['owner'], needsYou: ['owner', 'channel:ops-room'] });
  });

  it('shows only the switches of the person when the front lists no shared channel', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'PUT /v1/duties/new?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    expect(tell(el)).toEqual([['Tell me about', ['Failures on', 'Questions on']]]);
  });
});

describe('the dialog of a save', () => {
  const CHECKED: Duty = {
    name: 'watch-queue',
    agent: 'migrator',
    when: { schedule: { repeat: 'every', every: '15m', timeZone: 'UTC' } },
    checkFirst: { look: { http: { url: 'https://q.example/api' } }, items: 'items', key: 'id', wake: { when: 'new' } },
    do: { ask: { message: 'Handle {found}.' } },
    limits: { budget: { maxCostUSD: 0.25 }, overlap: 'skip', catchUp: '1h' },
    source: 'store',
    revision: 4,
  };
  const SAID = 'Every 15 minutes, UTC. First it looks at q.example/api for the items at items. Only items that it did not see before wake migrator, by their id. The run gets the list.';

  it('says the check once: in the readback of the front, or in the words of the page without one', async () => {
    for (const readback of [SAID, '']) {
      location.hash = '#duties/watch-queue/edit';
      api = fakeApi({
        'GET /v1/duties': { duties: [CHECKED], paused: false },
        'GET /v1/duties/watch-queue': { ...CHECKED, history: [] },
        'PUT /v1/duties/watch-queue?dryRun=true': dry({ readback }),
      });
      const el = mount(<DutyEditor name="watch-queue" />);
      await settle();
      click(keyNamed(el, 'Save duty'));
      await settle();
      const dialog = document.querySelector('dialog.confirm')!;
      expect(text(dialog.querySelector('.duty-readback'))).toBe(readback);
      expect(text(dialog).includes('Look at q.example')).toBe(!readback);
      expect(text(dialog).split('q.example').length).toBe(2);
      unmountAll();
      api.restore();
      forgetDuties();
    }
  });
});
