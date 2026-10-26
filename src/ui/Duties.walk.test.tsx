// The fixes of the walk of 2026-10-26 on the Duties place: a duty page that
// follows its run, keys that keep the focus, lights that tell their states
// apart, an editor that keeps a draft, says its errors at once, and takes
// the words of Make this a duty, and a name that a person writes in words.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Duty, DutyRecord, DutyRun, Fleet, Whoami } from '../api/types';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { forgetPlaybooks } from '../state/playbooks';
import { forgetToolCatalog } from '../state/tools';
import { DutyList, DutyMain, following } from './Duties';
import { DutyEditor, timing } from './DutyEditor';
import { clearNotice, clearSaid, currentSaid } from './notice';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll, type Call, type Route, type RouteFn } from './testkit-c';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: { migrator: 'owner' }, admin: false, canCreate: true };
const FLEET: Fleet = {
  name: 'front-0',
  members: [],
  pools: [{ name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }] }],
};
const READBACK = 'Every weekday at 9:00 AM, your time.';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const duty = (over: Partial<Duty>): Duty => ({
  name: 'walk-duty',
  agent: 'migrator',
  owner: 'alice@example.com',
  when: { schedule: { repeat: 'weekdays', times: ['09:00'], timeZone: 'UTC' } },
  do: { ask: { message: 'Sum up the day.' } },
  limits: { budget: { maxCostUSD: 0.05 }, overlap: 'skip', catchUp: '1h' },
  whileAway: { decider: 'manager', timeout: '2h', then: 'deny' },
  notify: { failure: ['owner'], needsYou: ['owner'] },
  paused: false,
  source: 'store',
  revision: 3,
  readback: READBACK,
  ...over,
});

/** dry answers a dry run: the record as it came, the readback, and no problem. */
const dry =
  (extra: Record<string, unknown> = {}): RouteFn =>
  (c: Call) => ({ body: { duty: c.body, readback: READBACK, next: [], problems: [], ...extra } });

let api: ReturnType<typeof fakeApi>;
const saved = { ...following };
beforeAll(() => {
  timing.preview = 0;
});
beforeEach(() => {
  sessionStorage.clear();
  forgetDuties();
  forgetPlaybooks();
  forgetToolCatalog();
  location.hash = '#duties/new';
  act(() => {
    store.dispatch({ type: 'me', me: ALICE });
    store.dispatch({ type: 'fleet', fleet: FLEET });
    store.dispatch({ type: 'agents', agents: [{ name: 'migrator', role: 'owner' }, { name: 'default', role: 'owner' }] });
  });
});
afterEach(() => {
  unmountAll();
  clearNotice();
  clearSaid();
  Object.assign(following, saved);
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

/** labelOf is the label of a field as a person reads it, without the question mark of its help. */
function labelOf(l: Element): string {
  const c = l.cloneNode(true) as Element;
  c.querySelectorAll('.help').forEach((h) => h.remove());
  return (c.textContent || '').trim();
}

/** fieldOf finds the control of a field by its label. */
function fieldOf(root: ParentNode, label: string): HTMLInputElement | null {
  const f = [...root.querySelectorAll('label.field')].find((l) => labelOf(l.querySelector('.field-label')!) === label);
  return f ? (f.querySelector('input, textarea, select') as HTMLInputElement | null) : null;
}

function change(el: Element | null, value: string): void {
  if (!el) throw new Error('no select');
  act(() => {
    (el as HTMLSelectElement).value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const puts = () => api.calls.filter((c) => c.method === 'PUT');
const lastPut = () => puts()[puts().length - 1];
const optionsOf = (el: Element | null) => [...((el as HTMLSelectElement | null)?.options || [])].map((o) => o.text);
const radio = (el: HTMLElement, name: string, value: string) => el.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;
const datesSwitch = (el: HTMLElement) => [...el.querySelectorAll('label.check')].find((l) => l.textContent === 'Only between two dates')!.querySelector('input') as HTMLInputElement;
/** wait lets the timers of the page run for a while, in short steps, so each redraw between them happens. */
async function wait(ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 10) await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
}

function pick(el: HTMLElement, name: string): void {
  click(keyNamed(el, 'Pick an agent') || keyNamed(el, 'Change the agent'));
  click([...el.querySelectorAll('.picker .pick-row')].find((r) => r.querySelector('.pick-name')!.textContent === name));
}

describe('the page of a duty', () => {
  it('reads the duty again while its run works, so its state and its history follow the run, and stops once it ends', async () => {
    following.fast = 10;
    const queued: DutyRun = { at: ago(1), run: '01KRUN', state: 'queued' };
    const done: DutyRun = { ...queued, state: 'completed', costUSD: 0.004 };
    let n = 0;
    api = fakeApi({
      'GET /v1/duties': { duties: [duty({ state: { lastRun: queued, todayUSD: 0, failuresInRow: 0 } })], paused: false },
      'GET /v1/duties/walk-duty': () => {
        const r = ++n >= 3 ? done : queued;
        return { body: duty({ state: { lastRun: r, todayUSD: 0, failuresInRow: 0 }, history: [r] }) };
      },
    });
    const list = mount(<DutyList current="walk-duty" />);
    const el = mount(<DutyMain name="walk-duty" />);
    await settle();
    expect(text(el.querySelector('.pane-head'))).toContain('waiting for a worker');
    await wait(80);
    expect(text(el.querySelector('.pane-head'))).toContain('finished');
    expect(text(el.querySelector('.duty-run'))).toContain('finished');
    // The row of the list follows too.
    expect(text(list.querySelector('.duty-row'))).toContain('finished');
    const reads = api.calls.filter((c) => c.path === '/v1/duties/walk-duty').length;
    await wait(60);
    expect(api.calls.filter((c) => c.path === '/v1/duties/walk-duty').length).toBe(reads);
  });

  it('reads the duty again for a while after Run now, before the history holds the new run', async () => {
    following.fast = 10;
    following.after = 50;
    api = fakeApi({
      'GET /v1/duties': { duties: [duty({})], paused: false },
      'GET /v1/duties/walk-duty': { ...duty({}), history: [] },
      'POST /v1/duties/walk-duty/run': () => ({ status: 202, body: { run: '01KNEW' } }),
    });
    const el = mount(<DutyMain name="walk-duty" />);
    await settle();
    const before = api.calls.filter((c) => c.path === '/v1/duties/walk-duty').length;
    click(keyNamed(el, 'Run now'));
    await wait(40);
    expect(api.calls.filter((c) => c.path === '/v1/duties/walk-duty').length).toBeGreaterThan(before + 1);
    await wait(40);
    const after = api.calls.filter((c) => c.path === '/v1/duties/walk-duty').length;
    await wait(40);
    expect(api.calls.filter((c) => c.path === '/v1/duties/walk-duty').length).toBe(after);
  });

  it('keeps the focus on Pause, Resume, and Run now, and gives a page that opens its heading', async () => {
    let paused = false;
    api = fakeApi({
      'GET /v1/duties': { duties: [duty({})], paused: false },
      'GET /v1/duties/walk-duty': () => ({ body: { ...duty({ paused }), history: [] } }),
      'PATCH /v1/duties/walk-duty': (c) => {
        paused = (c.body as { paused: boolean }).paused;
        return { body: duty({ paused }) };
      },
      'POST /v1/duties/walk-duty/run': () => ({ status: 202, body: { run: '01KNEW' } }),
    });
    (document.activeElement as HTMLElement | null)?.blur();
    const el = mount(<DutyMain name="walk-duty" />);
    await settle();
    // The focus fell to the body, so the heading of the duty takes it.
    expect(document.activeElement).toBe(el.querySelector('h1'));
    const pause = keyNamed(el, 'Pause')!;
    pause.focus();
    click(pause);
    // The key stays enabled while the call works, so it keeps the focus.
    expect(pause.hasAttribute('disabled')).toBe(false);
    await settle();
    expect(document.activeElement!.textContent).toBe('Resume');
    const now = keyNamed(el, 'Run now')!;
    now.focus();
    click(now);
    await settle();
    expect(document.activeElement).toBe(now);
  });

  it('deletes a duty with a notice, and gives the focus to a heading', async () => {
    location.hash = '#duties/walk-duty';
    api = fakeApi({ 'GET /v1/duties': { duties: [duty({})], paused: false }, 'GET /v1/duties/walk-duty': { ...duty({}), history: [] }, 'DELETE /v1/duties/walk-duty': () => ({ status: 204 }) });
    const list = mount(<DutyList current="walk-duty" />);
    const el = mount(<DutyMain name="walk-duty" />);
    await settle();
    click(el.querySelector('button[aria-label="More"]'));
    click([...el.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent === 'Delete'));
    const dialog = document.querySelector('dialog.confirm')!;
    expect(text(dialog.querySelector('h2'))).toBe('Delete Walk duty?');
    click(keyNamed(dialog, 'Delete'));
    await settle();
    expect(currentSaid()).toBe('Deleted the duty Walk duty.');
    expect(document.activeElement).toBe(list.querySelector('#duties-title'));
  });

  it('tells apart the grey lights of a duty that has not run yet, that is paused, and that finished', async () => {
    api = fakeApi({
      'GET /v1/duties': {
        duties: [
          duty({ name: 'fresh-one' }),
          duty({ name: 'resting', paused: true }),
          duty({ name: 'done-one', state: { lastRun: { at: ago(5), run: '01K', state: 'completed' }, todayUSD: 0, failuresInRow: 0 } }),
        ],
        paused: false,
      },
    });
    const el = mount(<DutyList />);
    await settle();
    const status = (name: string) => el.querySelector(`a[href="#duties/${name}"] .status`)!;
    expect(status('fresh-one').classList.contains('duty-led-hollow')).toBe(true);
    expect(status('resting').classList.contains('duty-led-pause')).toBe(true);
    expect(status('done-one').classList.contains('duty-led-hollow') || status('done-one').classList.contains('duty-led-pause')).toBe(false);
    expect([text(status('fresh-one')), text(status('resting')), text(status('done-one'))]).toEqual(['not run yet', 'paused', 'finished']);
  });

  it('says that a run of a duty without a cost limit has none', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/walk-duty': { ...duty({ limits: { budget: {}, overlap: 'skip', catchUp: '1h' } }), history: [] } });
    const el = mount(<DutyMain name="walk-duty" />);
    await settle();
    expect(text(el.querySelector('section[aria-labelledby="duty-limits"]'))).toContain('A run has no cost limit.');
  });
});

describe('the editor of a duty', () => {
  const NEW: Record<string, Route> = { 'GET /v1/duties': { duties: [], paused: false }, 'PUT /v1/duties/new?dryRun=true': dry() };

  it('keeps a draft when the person leaves, brings it back, and drops it on Discard them or Cancel', async () => {
    api = fakeApi({ ...NEW, 'PUT /v1/duties/sum-up-the-day?dryRun=true': dry() });
    let el = mount(<DutyEditor />);
    await settle();
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'Ask Migrator'), 'Sum up the day.');
    typeIn(fieldOf(el, 'The most a run can cost'), '0.05');
    await settle();
    unmountAll();
    // Another screen, then New duty again: the changes are back.
    el = mount(<DutyEditor />);
    await settle();
    expect(text(el.querySelector('.duty-kept'))).toBe('Your unsaved changes are back. Discard them');
    expect(fieldOf(el, 'Ask Migrator')!.value).toBe('Sum up the day.');
    expect(fieldOf(el, 'The most a run can cost')!.value).toBe('0.05');
    click(keyNamed(el, 'Discard them'));
    await settle();
    expect(el.querySelector('.duty-kept')).toBeNull();
    expect(fieldOf(el, 'Ask the agent')!.value).toBe('');
    expect(sessionStorage.getItem('fw.bossmode.duty.new')).toBeNull();
    // Cancel drops a draft too.
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'Ask Migrator'), 'Sum up the day.');
    await settle();
    expect(sessionStorage.getItem('fw.bossmode.duty.new')).not.toBeNull();
    click(keyNamed(el, 'Cancel'));
    expect(sessionStorage.getItem('fw.bossmode.duty.new')).toBeNull();
  });

  it('brings back the draft of an edit, and says when the duty changed since', async () => {
    let revision = 3;
    api = fakeApi({ 'GET /v1/duties': { duties: [duty({})], paused: false }, 'GET /v1/duties/walk-duty': () => ({ body: { ...duty({ revision }), history: [] } }), 'PUT /v1/duties/walk-duty?dryRun=true': dry() });
    let el = mount(<DutyEditor name="walk-duty" />);
    await settle();
    typeIn(fieldOf(el, 'Ask Migrator'), 'Sum up the week.');
    await settle();
    unmountAll();
    forgetDuties();
    revision = 4;
    el = mount(<DutyEditor name="walk-duty" />);
    await settle();
    expect(fieldOf(el, 'Ask Migrator')!.value).toBe('Sum up the week.');
    expect(text(el.querySelector('.duty-kept'))).toBe('Your unsaved changes are back. The duty changed since you made them, and Save puts yours in its place. Discard them');
  });

  it('gives the focus to the first field that a failed save names', async () => {
    api = fakeApi(NEW);
    const el = mount(<DutyEditor />);
    await settle();
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(document.activeElement).toBe(keyNamed(el, 'Pick an agent'));
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'The most a run can cost'), '0.05');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(document.activeElement).toBe(fieldOf(el, 'Ask Migrator'));
  });

  it('adds a time that the sentence does not hold yet', async () => {
    api = fakeApi(NEW);
    const el = mount(<DutyEditor />);
    await settle();
    click(keyNamed(el, 'Add a time'));
    click(keyNamed(el, 'Add a time'));
    expect([...el.querySelectorAll('.duty-sentence input[type="time"]')].map((i) => (i as HTMLInputElement).value)).toEqual(['09:00', '10:00', '11:00']);
  });

  it('says a last day before the first day at once, in the words of the fields, and asks the server nothing for it', async () => {
    api = fakeApi(NEW);
    const el = mount(<DutyEditor />);
    await settle();
    click(datesSwitch(el));
    typeIn(fieldOf(el, 'First day'), '2026-12-10');
    await settle();
    const n = puts().length;
    typeIn(fieldOf(el, 'Last day'), '2026-12-01');
    await settle();
    expect(text(fieldOf(el, 'Last day')!.closest('label')!.querySelector('.field-error'))).toBe('The last day comes before the first day.');
    expect(puts().length).toBe(n);
    expect(text(el.querySelector('.duty-readback-box'))).not.toContain('2026');
  });

  it('hides the readback of the sentence while the words of the box hold a problem', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'PUT /v1/duties/new': (c: Call) => ((c.body as DutyRecord).when.say ? { body: { problems: ['when.say: "twice a day" is not a repeat.'] } } : dry()(c, 1)) });
    const el = mount(<DutyEditor />);
    await settle();
    expect(text(el.querySelector('.duty-readback-box'))).toContain(READBACK);
    typeIn(fieldOf(el, 'Say it in your own words'), 'twice a day');
    click(keyNamed(el, 'Read it back'));
    await settle();
    expect(text(fieldOf(el, 'Say it in your own words')!.closest('label')!.querySelector('.field-error'))).toBe('"twice a day" is not a repeat.');
    expect(el.querySelector('.duty-readback-box')).toBeNull();
    // A change of the words clears the problem, and the readback of the sentence is back.
    typeIn(fieldOf(el, 'Say it in your own words'), 'twice a d');
    expect(text(el.querySelector('.duty-readback-box'))).toContain(READBACK);
  });

  it('drops a first day that earlier words set, and keeps the dates that the person set', async () => {
    const anchored = { repeat: 'weekly', days: ['tue'], everyWeeks: 2, times: ['15:00'], timeZone: ZONE, start: '2026-10-26' };
    const mondays = { repeat: 'weekly', days: ['mon'], times: ['09:00'], timeZone: ZONE };
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'PUT /v1/duties/new': (c: Call) => {
        const say = (c.body as DutyRecord).when.say;
        return say ? { body: { duty: { ...(c.body as object), when: { schedule: /other/.test(say) ? anchored : mondays } }, readback: READBACK, next: [], problems: [] } } : dry()(c, 1);
      },
    });
    const el = mount(<DutyEditor />);
    await settle();
    typeIn(fieldOf(el, 'Say it in your own words'), 'every other Tuesday at 3pm');
    click(keyNamed(el, 'Read it back'));
    await settle();
    // The server anchors every other week at a first day, and the switch shows it.
    expect(datesSwitch(el).checked).toBe(true);
    expect(fieldOf(el, 'First day')!.value).toBe('2026-10-26');
    typeIn(fieldOf(el, 'Say it in your own words'), 'every Monday at 9am');
    click(keyNamed(el, 'Read it back'));
    await settle();
    expect(datesSwitch(el).checked).toBe(false);
    expect(fieldOf(el, 'First day')).toBeNull();
    // Dates by hand stay.
    click(datesSwitch(el));
    typeIn(fieldOf(el, 'First day'), '2026-11-02');
    typeIn(fieldOf(el, 'Say it in your own words'), 'every Monday at 9am');
    click(keyNamed(el, 'Read it back'));
    await settle();
    expect(fieldOf(el, 'First day')!.value).toBe('2026-11-02');
  });

  it('takes a name in words and saves it under its short name', async () => {
    api = fakeApi({ ...NEW, 'PUT /v1/duties/sum-up-the-day?dryRun=true': dry(), 'PUT /v1/duties/walk-duty-1?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'Ask Migrator'), 'Sum up the day.');
    typeIn(fieldOf(el, 'The most a run can cost'), '0.05');
    expect(fieldOf(el, 'Name')!.value).toBe('Sum up the day');
    typeIn(fieldOf(el, 'Name'), 'Walk Duty 1');
    expect(text(el.querySelector('#duty-slug'))).toBe('It saves as walk-duty-1.');
    expect(fieldOf(el, 'Name')!.getAttribute('aria-describedby')).toBe('duty-slug');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(lastPut().path).toBe('/v1/duties/walk-duty-1?dryRun=true');
    expect((lastPut().body as DutyRecord).name).toBe('walk-duty-1');
  });

  it('offers the agents that workers run for an event, and names each in words', async () => {
    api = fakeApi({ ...NEW, 'GET /v1/duties/options': { secrets: [], events: ['bridge.closed'], actions: ['ask'], looks: [] } });
    const el = mount(<DutyEditor />);
    await settle();
    click(radio(el, 'duty-start', 'event'));
    change(fieldOf(el, 'What happens'), 'bridge.closed');
    expect(optionsOf(fieldOf(el, 'Of the agent'))).toEqual(['Any agent', 'Migrator']);
  });

  it('puts the hint of each field behind its question mark', async () => {
    api = fakeApi({ ...NEW, 'GET /v1/duties/options': { secrets: [], events: [], actions: ['ask', 'manager'], looks: [] } });
    const el = mount(<DutyEditor />);
    await settle();
    const helps = () => [...el.querySelectorAll('.help-key')].map((k) => k.getAttribute('aria-label'));
    expect(helps()).toEqual(['What a turn is', 'When this happens', 'What a missed time is', 'What away means', 'Where you hear of it']);
    click(radio(el, 'duty-do', 'manager'));
    expect(helps()[0]).toBe('What the agent does here');
    click(el.querySelector('[aria-label="What the agent does here"]'));
    expect(text(el.querySelector('.help-pop'))).toContain('The manager does the work.');
  });
});

describe('Make this a duty', () => {
  const MESSAGE = 'Make a duty for docs-scribe: every Monday at 8am, read the wiki page homelab/inventory.md and reply with three short lines on what looks out of date. A run gets at most $0.05.';
  const SEED = { agent: 'migrator', act: 'manager' as const, message: MESSAGE };

  it('reads the schedule and the cost that the message names, and Cancel goes back to the conversation', async () => {
    location.hash = '#manager/run-m';
    await settle();
    location.hash = '#duties/new?agent=migrator';
    await settle();
    const monday = { repeat: 'weekly', days: ['mon'], times: ['08:00'], timeZone: ZONE };
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': { secrets: [], events: [], actions: ['ask', 'manager'], looks: [] },
      'PUT /v1/duties/make-a-duty-for-docs-scribe': (c: Call) => {
        const say = (c.body as DutyRecord).when.say;
        return say ? { body: { duty: { ...(c.body as object), when: { schedule: monday } }, readback: 'Every Monday at 8:00 AM.', next: [], problems: [] } } : dry()(c, 1);
      },
    });
    const el = mount(<DutyEditor seed={SEED} />);
    await settle();
    const said = puts().find((c) => (c.body as DutyRecord).when.say);
    expect((said!.body as DutyRecord).when).toEqual({ say: 'every Monday at 8am' });
    expect(fieldOf(el, 'Say it in your own words')!.value).toBe('every Monday at 8am');
    expect((el.querySelector('select[aria-label="Repeat"]') as HTMLSelectElement).value).toBe('weekly');
    expect(text(el.querySelector('.duty-readback-box .duty-readback'))).toBe('Every Monday at 8:00 AM.');
    expect(fieldOf(el, 'The most a run can cost')!.value).toBe('0.05');
    // Cancel and Back go to the conversation that Make this a duty came from.
    expect(keyNamed(el, 'Cancel')!.getAttribute('href')).toBe('#manager/run-m');
    expect(el.querySelector('a.back')!.getAttribute('aria-label')).toBe('Back to the manager');
  });

  it('leaves words that the server cannot read in the box, with no error, and reads the sentence back', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'PUT /v1/duties/check-the-mornings-every-morning': (c: Call) => ((c.body as DutyRecord).when.say ? { body: { problems: ['when.say: "mornings" is not a repeat.'] } } : dry()(c, 1)),
    });
    const el = mount(<DutyEditor seed={{ agent: 'migrator', act: 'ask', message: 'Check the mornings, every morning.' }} />);
    await settle();
    expect(fieldOf(el, 'Say it in your own words')!.value).toBe('every morning');
    expect(fieldOf(el, 'Say it in your own words')!.closest('label')!.querySelector('.field-error')).toBeNull();
    expect(text(el.querySelector('.duty-readback-box .duty-readback'))).toBe(READBACK);
    // No amount in the message: the cost stays empty.
    expect(fieldOf(el, 'The most a run can cost')!.value).toBe('');
  });
});
