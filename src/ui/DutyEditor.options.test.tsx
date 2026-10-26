import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { Duty, DutyOptions, DutyRecord, Whoami } from '../api/types';
import { setFetch, type FetchLike } from '../api/client';
import { store } from '../state/store';
import { forgetDuties } from '../state/duties';
import { forgetPlaybooks } from '../state/playbooks';
import { forgetProfiles } from '../state/profiles';
import { forgetToolCatalog } from '../state/tools';
import { DutyEditor, timing } from './DutyEditor';
import { clearNotice } from './notice';
import { bridge, seat } from './testkit-b';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll, type Call, type Route } from './testkit-c';

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


const ALICE: Whoami = { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: { migrator: 'owner' }, admin: false, canCreate: true };
const ALL: DutyOptions = {
  secrets: [
    { name: 'QUEUE_TOKEN', hosts: ['q.example.com'] },
    { name: 'GITHUB_TOKEN', hosts: ['api.github.com'] },
  ],
  events: ['bridge.closed', 'question.waiting', 'page.changed'],
  actions: ['ask', 'post', 'open', 'manager'],
  looks: ['http', 'tool'],
};
const READBACK = 'Every weekday at 9:00 AM, your time.';

/** dry answers a dry run: the record as it came, the readback, and no problem. */
const dry =
  (extra: Record<string, unknown> = {}): Route =>
  (c: Call) => ({ body: { duty: c.body, readback: READBACK, next: [], problems: [], ...extra } });

let api: ReturnType<typeof fakeApi>;
beforeAll(() => {
  timing.preview = 0;
});
beforeEach(() => {
  // A draft of the editor lives in the storage of the tab. Each test starts without one.
  sessionStorage.clear();
  forgetDuties();
  forgetPlaybooks();
  forgetProfiles();
  forgetToolCatalog();
  location.hash = '#duties/new';
  act(() => {
    store.dispatch({ type: 'me', me: ALICE });
    store.dispatch({ type: 'agents', agents: [{ name: 'migrator', role: 'owner' }, { name: 'reviewer', role: 'operator' }] });
    store.dispatch({ type: 'bridges', bridges: [bridge('b1', 'Migrate Puppet'), bridge('b2', 'Old work', undefined, { state: 'closed' })] });
    store.dispatch({ type: 'bridge', bridge: bridge('b1', 'Migrate Puppet', [seat('migrator-1', 'migrator', 'idle'), seat('reviewer', 'reviewer', 'idle'), seat('gone', 'migrator', 'fired', { fired: true })]) });
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

function change(el: Element | null, value: string): void {
  if (!el) throw new Error('no select');
  act(() => {
    (el as HTMLSelectElement).value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const optionsOf = (el: Element | null) => [...((el as HTMLSelectElement | null)?.options || [])].map((o) => o.text);
const puts = () => api.calls.filter((c) => c.method === 'PUT');
const lastPut = () => puts()[puts().length - 1];
const radio = (el: HTMLElement, name: string, value: string) => el.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;

function pick(el: HTMLElement, name: string): void {
  click(keyNamed(el, 'Pick an agent') || keyNamed(el, 'Change the agent'));
  click([...el.querySelectorAll('.picker .pick-row')].find((r) => r.querySelector('.pick-name')!.textContent === name));
}

function openCheck(el: HTMLElement): void {
  const d = el.querySelector('details.duty-check') as HTMLDetailsElement;
  act(() => {
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
  });
}

/** fill gives a new duty its agent, a message, and a budget. */
function fill(el: HTMLElement): void {
  pick(el, 'Migrator');
  typeIn(fieldOf(el, 'The most a run can cost'), '0.40');
}

describe('what the front serves', () => {
  it('offers no event, no other action, and no other look when the front serves none', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': { secrets: [], events: [], actions: ['ask'], looks: ['http'] }, 'PUT /v1/duties/new?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    expect(radio(el, 'duty-start', 'event')).toBeNull();
    expect(radio(el, 'duty-do', 'post')).toBeNull();
    openCheck(el);
    click(keyNamed(el, 'Set it up by hand'));
    expect(radio(el, 'duty-look', 'tool')).toBeNull();
    expect(fieldOf(el, 'Address')).toBeTruthy();
  });

  it('offers each start, action, and look that the front serves, in words', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    expect([...el.querySelectorAll('input[name="duty-start"]')].map((i) => i.closest('label')!.textContent)).toEqual(['On a schedule', 'When something happens']);
    expect([...el.querySelectorAll('input[name="duty-do"]')].map((i) => i.closest('label')!.textContent)).toEqual(['Ask the agent', 'Post in a bridge', 'Open a bridge from a playbook', 'Ask the manager']);
    click(radio(el, 'duty-start', 'event'));
    expect(optionsOf(fieldOf(el, 'What happens'))).toEqual(['Pick what happens', 'When a bridge closes', 'When a question waits too long', 'When a page changes']);
  });
});

describe('When', () => {
  it('starts a duty from an event, with its agent, and offers the chip of what happened', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry({ readback: '' }) });
    const el = mount(<DutyEditor />);
    await settle();
    expect(keyNamed(el, 'What happened')).toBeUndefined();
    click(radio(el, 'duty-start', 'event'));
    expect(select(el, 'Repeat')).toBeNull();
    change(fieldOf(el, 'What happens'), 'bridge.closed');
    change(fieldOf(el, 'Of the agent'), 'migrator');
    await settle();
    expect((lastPut().body as DutyRecord).when).toEqual({ event: { kind: 'bridge.closed', agent: 'migrator' } });
    expect(text(el.querySelector('.duty-readback-box .duty-readback'))).toBe('When a bridge of Migrator closes.');
    expect(keyNamed(el, 'What happened')).toBeTruthy();
    change(fieldOf(el, 'What happens'), 'question.waiting');
    expect(fieldOf(el, 'Waits longer than')!.value).toBe('1h');
    change(fieldOf(el, 'Waits longer than'), '4h');
    await settle();
    // The agent stays with an event that takes one, and the record holds only the fields of its kind.
    expect((lastPut().body as DutyRecord).when).toEqual({ event: { kind: 'question.waiting', after: '4h', agent: 'migrator' } });
    change(fieldOf(el, 'What happens'), 'page.changed');
    typeIn(fieldOf(el, 'Pages under'), 'homelab/');
    await settle();
    expect((lastPut().body as DutyRecord).when).toEqual({ event: { kind: 'page.changed', path: 'homelab/' } });
    expect(text(el.querySelector('.duty-readback-box .duty-readback'))).toBe('When a page under homelab/ changes.');
  });

  it('asks to catch up a missed time only for a schedule, and keeps what happens while the last run works for every start', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry({ readback: '' }) });
    const el = mount(<DutyEditor />);
    await settle();
    const legends = () => [...el.querySelectorAll('section[aria-labelledby="duty-limits-head"] legend')].map(labelOf);
    expect(fieldOf(el, 'Catch up a missed time')).toBeTruthy();
    click(radio(el, 'duty-start', 'event'));
    expect(fieldOf(el, 'Catch up a missed time')).toBeNull();
    expect(legends()).toEqual(['If the last run still works']);
    click(radio(el, 'duty-start', 'schedule'));
    expect(fieldOf(el, 'Catch up a missed time')).toBeTruthy();
  });

  it('keeps the event of a duty that the front no longer lists', async () => {
    const d: Duty = {
      name: 'after-close',
      agent: 'migrator',
      when: { event: { kind: 'routine.ready', agent: 'migrator' } },
      do: { ask: { message: 'Read {event}.' } },
      limits: { budget: { maxCostUSD: 0.2 } },
      source: 'store',
      revision: 2,
    };
    api = fakeApi({ 'GET /v1/duties': { duties: [d], paused: false }, 'GET /v1/duties/after-close': { ...d, history: [] }, 'GET /v1/duties/options': { ...ALL, events: ['bridge.closed'] }, 'PUT /v1/duties/after-close?dryRun=true': dry({ readback: '' }) });
    const el = mount(<DutyEditor name="after-close" />);
    await settle();
    expect(radio(el, 'duty-start', 'event')!.checked).toBe(true);
    expect(fieldOf(el, 'What happens')!.value).toBe('routine.ready');
    expect(optionsOf(fieldOf(el, 'What happens'))).toEqual(['Pick what happens', 'When a bridge closes', 'When a routine is ready']);
    expect((fieldOf(el, 'Ask Migrator') as unknown as HTMLTextAreaElement).value).toBe('Read [What happened].');
  });

  it('takes a first and a last day, and refuses a last day before the first', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    expect(fieldOf(el, 'First day')).toBeNull();
    click([...el.querySelectorAll('label.check')].find((l) => l.textContent === 'Only between two dates')!.querySelector('input'));
    typeIn(fieldOf(el, 'First day'), '2026-11-02');
    typeIn(fieldOf(el, 'Last day'), '2026-12-18');
    await settle();
    expect((lastPut().body as DutyRecord).when.schedule).toMatchObject({ repeat: 'weekdays', start: '2026-11-02', end: '2026-12-18' });
    typeIn(fieldOf(el, 'Last day'), '2026-10-01');
    fill(el);
    typeIn(fieldOf(el, 'Ask Migrator'), 'Report.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Last day')!.closest('label')!.querySelector('.field-error'))).toBe('The last day comes before the first day.');
    // Off, the dates go.
    click([...el.querySelectorAll('label.check')].find((l) => l.textContent === 'Only between two dates')!.querySelector('input'));
    await settle();
    expect((lastPut().body as DutyRecord).when.schedule!.start).toBeUndefined();
  });
});

const select = (root: ParentNode, label: string) => root.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement | null;

describe('What', () => {
  it('posts in an open bridge to the members that the person picks', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'PUT /v1/duties/new?dryRun=true': dry(),
      'PUT /v1/duties/review-what-changed-since?dryRun=true': dry(),
    });
    const el = mount(<DutyEditor />);
    await settle();
    fill(el);
    click(radio(el, 'duty-do', 'post'));
    // Only the open bridges are choices.
    expect(optionsOf(fieldOf(el, 'Bridge'))).toEqual(['Pick a bridge', 'Migrate Puppet']);
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Bridge')!.closest('label')!.querySelector('.field-error'))).toBe('Pick the bridge.');
    change(fieldOf(el, 'Bridge'), 'b1');
    const members = [...el.querySelectorAll('.duty-to label.check')];
    expect(members.map((l) => l.textContent)).toEqual(['migrator-1', 'reviewer']);
    expect(text(el.querySelector('.duty-to .t-meta'))).toBe('Everyone on the bridge reads it.');
    click(members[1].querySelector('input'));
    expect(text(el.querySelector('.duty-to .t-meta'))).toBe('1 member reads it.');
    typeIn(fieldOf(el, 'Message'), 'Review what changed since ');
    click(keyNamed(el, 'The last run'));
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect((lastPut().body as DutyRecord).do).toEqual({ post: { bridge: 'b1', to: ['reviewer'], message: 'Review what changed since {last.run}' } });
    expect(document.querySelector('dialog.confirm')).toBeTruthy();
  });

  it('opens a bridge from a playbook, with a goal and the turns of the bridge, and deletes a playbook after it asks', async () => {
    // A route of 204 answers no body.
    const del: Route = () => ({ status: 204 });
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'GET /v1/playbooks': { playbooks: [{ name: 'weekly-patching', goal: 'Patch the lab hosts and report.', placement: 'queue', seats: [{ handle: 'patcher', agent: 'migrator', task: 'Patch.' }], revision: 3, updatedAt: '2026-10-20T10:00:00Z' }] },
      'DELETE /v1/playbooks/weekly-patching': del,
      'PUT /v1/duties/new?dryRun=true': dry(),
      // The first save of the front finds the turns of the bridge too few, by its path.
      'PUT /v1/duties/patch?dryRun=true': (c: Call, n: number) => ({ body: { duty: c.body, readback: READBACK, next: [], problems: n === 1 ? ['limits.budget.maxTurns: A bridge of this playbook needs at least 20 turns.'] : [] } }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    fill(el);
    click(radio(el, 'duty-do', 'open'));
    await settle();
    expect(fieldOf(el, 'Ask Migrator')).toBeNull();
    expect(optionsOf(fieldOf(el, 'Playbook'))).toEqual(['Pick a playbook', 'Weekly patching: Patch the lab hosts and report.']);
    // The budget of an open is the turns of the bridge, and nothing else.
    expect(fieldOf(el, 'The most a run can cost')).toBeNull();
    const turns = () => fieldOf(el, 'The most turns of the bridge')!;
    const said = () => text(turns().closest('label')!.querySelector('.field-error'));
    expect(turns().placeholder).toBe('Required, such as 40');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Playbook')!.closest('label')!.querySelector('.field-error'))).toBe('Pick a playbook.');
    expect(said()).toBe('A duty that opens a bridge needs the most turns of the whole bridge, such as 40.');
    expect(turns().getAttribute('aria-invalid')).toBe('true');
    change(fieldOf(el, 'Playbook'), 'weekly-patching');
    typeIn(fieldOf(el, 'Goal'), 'Patch on ');
    click(keyNamed(el, "Today's date"));
    // The name drops the joining word at its end, and reads as words.
    expect(fieldOf(el, 'Name')!.value).toBe('Patch');
    typeIn(turns(), '12');
    click(keyNamed(el, 'Save duty'));
    await settle();
    // A problem of the front with the path limits.budget.maxTurns shows beside the turns of the bridge.
    expect(said()).toBe('A bridge of this playbook needs at least 20 turns.');
    expect(document.querySelector('dialog.confirm')).toBeNull();
    typeIn(turns(), '40');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect((lastPut().body as DutyRecord).do).toEqual({ open: { playbook: 'weekly-patching', goal: 'Patch on {date}' } });
    // The cost that fill typed for asking stays out of the record of an open.
    expect((lastPut().body as DutyRecord).limits).toEqual({ budget: { maxTurns: 40 }, overlap: 'skip', catchUp: '1h' });
    expect(text(document.querySelector('dialog.confirm'))).toContain('The bridge gets at most 40 turns.');
    click(keyNamed(document.querySelector('dialog.confirm')!, 'Cancel'));
    // The list of the playbooks, with Delete after a dialog that asks first.
    const shelf = el.querySelector('details.duty-books') as HTMLDetailsElement;
    expect(text(shelf.querySelector('.duty-book'))).toBe('Weekly patching Patch the lab hosts and report. 1 seat Delete');
    click(shelf.querySelector('button[aria-label="Delete Weekly patching"]'));
    const ask = document.querySelector('dialog.confirm')!;
    expect(text(ask.querySelector('h2'))).toBe('Delete Weekly patching?');
    click(keyNamed(ask, 'Delete'));
    await settle();
    expect(api.calls.some((c) => c.method === 'DELETE' && c.path === '/v1/playbooks/weekly-patching')).toBe(true);
    expect(el.querySelector('details.duty-books')).toBeNull();
  });

  it('asks the manager with a message', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry(), 'PUT /v1/duties/sum-up-the-week?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    fill(el);
    click(radio(el, 'duty-do', 'manager'));
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Ask the manager')!.closest('label')!.querySelector('.field-error'))).toBe('Write what the manager does.');
    typeIn(fieldOf(el, 'Ask the manager'), 'Sum up the week.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect((lastPut().body as DutyRecord).do).toEqual({ manager: { message: 'Sum up the week.' } });
  });

  it('opens with what Make this a duty brought, and asks the agent when the front does not serve the action', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry(), 'PUT /v1/duties/check-the-backups?dryRun=true': dry() });
    let el = mount(<DutyEditor seed={{ agent: 'migrator', act: 'manager', message: 'Check the backups.' }} />);
    await settle();
    expect(text(el.querySelector('.duty-who'))).toContain('Migrator');
    expect(radio(el, 'duty-do', 'manager')!.checked).toBe(true);
    expect((fieldOf(el, 'Ask the manager') as unknown as HTMLTextAreaElement).value).toBe('Check the backups.');
    // No silent cost: the budget stays empty.
    expect(fieldOf(el, 'The most a run can cost')!.value).toBe('');
    unmountAll();
    api.restore();
    forgetDuties();
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': { ...ALL, actions: ['ask'] }, 'PUT /v1/duties/check-the-backups?dryRun=true': dry() });
    el = mount(<DutyEditor seed={{ agent: 'migrator', act: 'manager', message: 'Check the backups.' }} />);
    await settle();
    expect(radio(el, 'duty-do', 'manager')).toBeNull();
    expect((fieldOf(el, 'Ask Migrator') as unknown as HTMLTextAreaElement).value).toBe('Check the backups.');
  });
});

describe('Limits', () => {
  const POST_WORDS = 'A post spends nothing of its own. The seats of the bridge spend from their own budgets.';
  const limits = (el: HTMLElement) => el.querySelector('section[aria-labelledby="duty-limits-head"]')!;
  const labels = (el: HTMLElement) => [...limits(el).querySelectorAll('.field-label')].map(labelOf);

  it('follow the action at once: ask shows the budget, a post spends nothing of its own, and an open asks for the turns of the bridge', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'GET /v1/playbooks': { playbooks: [] }, 'PUT /v1/duties/new?dryRun=true': dry(), 'PUT /v1/duties/review-what-changed?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    expect(labels(el)).toEqual(['The most a run can cost', 'Most turns', 'The most per day', 'Catch up a missed time']);
    fill(el);
    typeIn(fieldOf(el, 'Most turns'), '12');
    typeIn(fieldOf(el, 'The most per day'), '2');
    click(radio(el, 'duty-do', 'post'));
    // A post hides the budget and the cap of a day, and says why in their place. Overlap and catch up stay.
    expect(labels(el)).toEqual(['Catch up a missed time']);
    expect(text(limits(el).querySelector('.duty-spends'))).toBe(POST_WORDS);
    expect([...limits(el).querySelectorAll('legend')].map(labelOf)).toEqual(['If the last run still works']);
    change(fieldOf(el, 'Bridge'), 'b1');
    typeIn(fieldOf(el, 'Message'), 'Review what changed.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    // The record of a post holds no budget and no cap of a day, also after the person typed them for asking.
    expect(lastPut().path).toBe('/v1/duties/review-what-changed?dryRun=true');
    expect((lastPut().body as DutyRecord).limits).toEqual({ overlap: 'skip', catchUp: '1h' });
    const dialog = document.querySelector('dialog.confirm')!;
    expect(text(dialog)).toContain(POST_WORDS);
    click(keyNamed(dialog, 'Cancel'));
    click(radio(el, 'duty-do', 'open'));
    await settle();
    // An open shows one field, and the turns of a run do not carry over to the bridge.
    expect(labels(el)).toEqual(['The most turns of the bridge', 'Catch up a missed time']);
    expect(fieldOf(el, 'The most turns of the bridge')!.value).toBe('');
    expect(limits(el).querySelector('.duty-spends')).toBeNull();
    typeIn(fieldOf(el, 'The most turns of the bridge'), '40');
    click(radio(el, 'duty-do', 'ask'));
    // Back to ask, the budget that the person typed is still there.
    expect(labels(el)).toEqual(['The most a run can cost', 'Most turns', 'The most per day', 'Catch up a missed time']);
    expect([fieldOf(el, 'The most a run can cost')!.value, fieldOf(el, 'Most turns')!.value, fieldOf(el, 'The most per day')!.value]).toEqual(['0.40', '12', '2']);
  });

  it('keep Make this a duty working: a post from a bridge asks for no budget, and an open from a playbook asks for the turns of the bridge', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'GET /v1/playbooks': { playbooks: [] }, 'PUT /v1/duties/new?dryRun=true': dry(), 'PUT /v1/duties/review-the-bridge?dryRun=true': dry() });
    let el = mount(<DutyEditor seed={{ agent: 'migrator', act: 'post', bridge: 'b1', message: 'Review the bridge.' }} />);
    await settle();
    expect(radio(el, 'duty-do', 'post')!.checked).toBe(true);
    expect(text(limits(el).querySelector('.duty-spends'))).toBe(POST_WORDS);
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(lastPut().path).toBe('/v1/duties/review-the-bridge?dryRun=true');
    expect((lastPut().body as DutyRecord).do).toEqual({ post: { bridge: 'b1', message: 'Review the bridge.' } });
    expect((lastPut().body as DutyRecord).limits).toEqual({ overlap: 'skip', catchUp: '1h' });
    unmountAll();
    el = mount(<DutyEditor seed={{ agent: 'migrator', act: 'open', playbook: 'weekly-patching' }} />);
    await settle();
    expect(radio(el, 'duty-do', 'open')!.checked).toBe(true);
    // No silent limit: the turns of the bridge stay empty until the person writes them.
    expect(labels(el)).toEqual(['The most turns of the bridge', 'Catch up a missed time']);
    expect(fieldOf(el, 'The most turns of the bridge')!.value).toBe('');
  });
});

describe('Check first', () => {
  it('picks a tool of the agent from its profile, with its phrase, and takes its input as names and values', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'GET /v1/agents/migrator': { name: 'migrator', role: 'owner', tools: ['servicenow.*', 'bash'] },
      'GET /v1/tools': { tools: [{ name: 'query_incidents', source: 'servicenow', text: 'Find incidents' }, { name: 'get_incident', source: 'servicenow' }, { name: 'bash', origin: 'builtin', source: 'builtin' }] },
      'PUT /v1/duties/triage?dryRun=true': dry(),
      'PUT /v1/duties/new?dryRun=true': dry(),
    });
    const el = mount(<DutyEditor />);
    await settle();
    openCheck(el);
    click(keyNamed(el, 'Set it up by hand'));
    click(radio(el, 'duty-look', 'tool'));
    expect(text(el.querySelector('details.duty-check'))).toContain('Pick the agent first. Its tools show here.');
    pick(el, 'Migrator');
    await settle();
    // Each tool shows what it does. Its name stays in the tooltip, and a tool without words keeps its name.
    expect(optionsOf(fieldOf(el, 'Tool'))).toEqual(['Pick a tool', 'Find incidents', 'servicenow.get_incident', 'Run shell commands']);
    expect((fieldOf(el, 'Tool') as unknown as HTMLSelectElement).options[1].title).toBe('servicenow.query_incidents');
    change(fieldOf(el, 'Tool'), 'servicenow.query_incidents');
    click(keyNamed(el, 'Add a value'));
    typeIn(el.querySelector('input[aria-label="Name 1"]'), 'query');
    typeIn(el.querySelector('input[aria-label="Value 1"]'), 'priority<=2');
    click(keyNamed(el, 'Add a filter'));
    typeIn(el.querySelector('input[aria-label="Field of filter 1"]'), 'priority');
    change(select(el, 'Test of filter 1'), 'atMost');
    typeIn(el.querySelector('input[aria-label="Value of filter 1"]'), 'two');
    typeIn(fieldOf(el, 'Ask Migrator'), 'Triage.');
    typeIn(fieldOf(el, 'The most a run can cost'), '1');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(el.querySelector('[aria-label="Keep the items where"] .field-error'))).toBe('At least and at most need a number.');
    typeIn(el.querySelector('input[aria-label="Value of filter 1"]'), '2');
    // The readback says the tool by what it does.
    expect(text(el.querySelector('details.duty-check .duty-readback'))).toBe('Call a tool of Migrator: find incidents. Take the whole answer as the list. Keep the items where priority is at most 2. Wake Migrator only for items that it did not see before.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect((lastPut().body as DutyRecord).checkFirst).toEqual({ look: { tool: 'servicenow.query_incidents', input: { query: 'priority<=2' } }, where: [{ field: 'priority', atMost: 2 }], wake: { when: 'new' } });
    click(keyNamed(document.querySelector('dialog.confirm')!, 'Cancel'));
    click(el.querySelector('button[aria-label="Remove filter 1"]'));
    expect(el.querySelector('input[aria-label="Field of filter 1"]')).toBeNull();
  });

  it('offers only the secrets of the front for the host of the address', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry() });
    const el = mount(<DutyEditor />);
    await settle();
    openCheck(el);
    click(keyNamed(el, 'Set it up by hand'));
    const secret = () => [...el.querySelectorAll('label.field')].find((l) => l.querySelector('.field-label')!.textContent!.startsWith('Secret'))!.querySelector('select') as HTMLSelectElement;
    expect(secret().tagName).toBe('SELECT');
    expect(secret().disabled).toBe(true);
    typeIn(fieldOf(el, 'Address'), 'https://q.example.com/api/queue');
    expect(optionsOf(secret())).toEqual(['No secret', 'QUEUE_TOKEN']);
    change(secret(), 'QUEUE_TOKEN');
    await settle();
    expect((lastPut().body as DutyRecord).checkFirst).toBeUndefined();
    typeIn(fieldOf(el, 'Address'), 'https://other.example.org/');
    // A secret that the check names stays, and says that it is not for this address.
    expect(optionsOf(secret())).toEqual(['No secret', 'QUEUE_TOKEN, not for this address']);
  });

  it('writes the check with the agent of the editor, says how long it waits, and stops on Cancel', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry() });
    let seen: RequestInit | undefined;
    const under: FetchLike = setFetch(((input: string, init?: RequestInit) => {
      if (!String(input).endsWith('/write-check')) return under(input, init);
      seen = init;
      return new Promise<Response>((_, reject) => {
        init!.signal!.addEventListener('abort', () => reject(new DOMException('The call was stopped.', 'AbortError')));
      });
    }) as FetchLike);
    try {
      const el = mount(<DutyEditor />);
      await settle();
      openCheck(el);
      pick(el, 'Migrator');
      typeIn(fieldOf(el, 'Wake the agent only when'), 'a new P1 shows up');
      click(keyNamed(el, 'Write the check for me'));
      await settle();
      expect(JSON.parse(String(seen!.body))).toEqual({ words: 'a new P1 shows up', agent: 'migrator' });
      const wait = el.querySelector('.duty-wait')!;
      expect(wait.getAttribute('role')).toBe('status');
      expect(text(wait)).toBe('Migrator writes the check, then tries it once. This can take up to two minutes. 0 seconds so far.');
      expect((keyNamed(el, 'Write the check for me') as HTMLButtonElement).disabled).toBe(true);
      click(keyNamed(el, 'Cancel'));
      await settle();
      expect(seen!.signal!.aborted).toBe(true);
      expect(el.querySelector('.duty-wait')).toBeNull();
      expect(text(el.querySelector('details.duty-check [role="status"]'))).toBe('Stopped. The check did not change.');
      expect(fieldOf(el, 'Wake the agent only when')!.closest('label')!.querySelector('.field-error')).toBeNull();
    } finally {
      setFetch(under);
    }
  });

  it('says that the agent took longer than two minutes on a 504', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'PUT /v1/duties/new?dryRun=true': dry(),
      'POST /v1/duties/new/write-check': () => ({ status: 504, body: { detail: 'gateway timeout' } }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    openCheck(el);
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'Wake the agent only when'), 'a new P1');
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    expect(text(fieldOf(el, 'Wake the agent only when')!.closest('label')!.querySelector('.field-error'))).toBe('Migrator did not answer within two minutes. Try again, or set the check up by hand.');
  });
});

describe('the problems of the front', () => {
  it('show beside their fields, and a problem with no path at the top', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'PUT /v1/duties/new?dryRun=true': dry(),
      'PUT /v1/duties/sum-up?dryRun=true': dry({
        problems: ['do.ask.message: the message names no file.', 'limits.budget: A run of migrator costs at least $1.', 'whileAway.timeout: Too long.', 'checkFirst.look.http.url: The front cannot reach this host.', 'The agent migrator cannot run at night.'],
      }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    fill(el);
    typeIn(fieldOf(el, 'Ask Migrator'), 'Sum up.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Ask Migrator')!.closest('label')!.querySelector('.field-error'))).toBe('The message names no file.');
    expect(text(fieldOf(el, 'The most a run can cost')!.closest('label')!.querySelector('.field-error'))).toBe('A run of migrator costs at least $1.');
    expect(text(el.querySelector('section[aria-labelledby="duty-away-head"] .duty-problems'))).toBe('Too long.');
    expect((el.querySelector('details.duty-check') as HTMLDetailsElement).open).toBe(true);
    expect(text(el.querySelector('details.duty-check .duty-problems'))).toBe('The front cannot reach this host.');
    const top = el.querySelector('.duty-form > .duty-problems-box')!;
    expect(text(top)).toBe('The duty cannot save yet. The agent migrator cannot run at night.');
    expect(document.querySelector('dialog.confirm')).toBeNull();
  });
});

describe('the name of a draft', () => {
  it('reads a draft back as new, says before a save that new and options name no duty, and writes the check of a draft as new', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'PUT /v1/duties/new?dryRun=true': dry(),
      'PUT /v1/duties/sum-up-the-week?dryRun=true': dry(),
      'POST /v1/duties/new/write-check': { checkFirst: { look: { http: { url: 'https://queue.example.com/x' } }, wake: { when: 'new' } }, readback: 'Look at the queue.' },
    });
    const el = mount(<DutyEditor />);
    await settle();
    expect(lastPut().path).toBe('/v1/duties/new?dryRun=true');
    fill(el);
    const nameField = () => fieldOf(el, 'Name')!;
    const why = () => text(nameField().closest('label')!.querySelector('.field-error'));
    typeIn(nameField(), 'options');
    // The reason shows as the person types, before any save.
    expect(why()).toBe('The names new and options are kept for the page. Pick another name.');
    expect(nameField().getAttribute('aria-invalid')).toBe('true');
    change(select(el, 'Repeat'), 'daily');
    await settle();
    // A name that cannot name a duty reads back as the draft, never as the route of the options.
    expect(lastPut().path).toBe('/v1/duties/new?dryRun=true');
    typeIn(nameField(), 'new');
    expect(why()).toBe('The names new and options are kept for the page. Pick another name.');
    typeIn(fieldOf(el, 'Ask Migrator'), 'Sum up the week.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(document.querySelector('dialog.confirm')).toBeNull();
    typeIn(nameField(), 'Sum up the week');
    expect(nameField().closest('label')!.querySelector('.field-error')).toBeNull();
    // Write the check for me of a duty that is not saved yet goes to the draft, with the agent.
    openCheck(el);
    typeIn(fieldOf(el, 'Wake the agent only when'), 'the queue has new items');
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    const write = api.calls.find((c) => c.method === 'POST')!;
    expect(write.path).toBe('/v1/duties/new/write-check');
    // The run that writes the check takes the budget of a run of the duty that the form holds.
    expect(write.body).toEqual({ words: 'the queue has new items', agent: 'migrator', budget: { maxCostUSD: 0.4 } });
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(lastPut().path).toBe('/v1/duties/sum-up-the-week?dryRun=true');
  });
});

describe('the refusals of Write the check for me', () => {
  const writeWith = async (answer: Route) => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new?dryRun=true': dry(), 'POST /v1/duties/new/write-check': answer });
    const el = mount(<DutyEditor />);
    await settle();
    openCheck(el);
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'Wake the agent only when'), 'a new P1 in the queue');
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    return el;
  };
  const wordsError = (el: HTMLElement) => text(fieldOf(el, 'Wake the agent only when')!.closest('label')!.querySelector('.field-error'));

  it('show the whole reason of a 422, and fill the fields with what the agent tried, so the person can fix it', async () => {
    const el = await writeWith(() => ({
      status: 422,
      body: {
        title: 'Unprocessable Content',
        detail: 'the check found no list at result.records. The answer holds a list at data.items',
        error: 'the check found no list at result.records. The answer holds a list at data.items',
        checkFirst: { look: { tool: 'servicenow.query_incidents', input: {} }, items: 'result.records', key: 'number', wake: { when: 'new' } },
        readback: 'First it asks Migrator to find incidents.',
        forDevelopers: 'It takes the items at result.records, and number makes an item new.',
      },
    }));
    expect(wordsError(el)).toBe('The check found no list at result.records. The answer holds a list at data.items.');
    expect(text(el.querySelector('.duty-tried'))).toBe('The fields below hold what Migrator tried. Change them, then use Try the check.');
    // The fields hold the record, with the readback of the server and its technical part in a closed fold.
    expect(fieldOf(el, 'Where the list is')!.value).toBe('result.records');
    expect(fieldOf(el, 'What makes an item new')!.value).toBe('number');
    expect(keyNamed(el, 'Remove the check')).toBeTruthy();
    const check = el.querySelector('details.duty-check')!;
    expect(text(check.querySelector('.duty-readback:not(.duty-tried *)'))).toBe('First it asks Migrator to find incidents.');
    const dev = check.querySelector('details.duty-dev') as HTMLDetailsElement;
    expect(dev.open).toBe(false);
    expect(text(dev.querySelector('summary'))).toBe('For developers');
    expect(text(dev.querySelector('.duty-dev-text'))).toBe('It takes the items at result.records, and number makes an item new.');
  });

  it('read a record that the agent tried in words when the 422 holds no readback, and fill the fields with it', async () => {
    const el = await writeWith(() => ({ status: 422, body: { detail: 'no list', error: 'no list', checkFirst: { look: { http: { url: 'https://queue.example.com/api' } }, wake: { when: 'any' } } } }));
    expect(fieldOf(el, 'Address')!.value).toBe('https://queue.example.com/api');
    expect(text(el.querySelector('details.duty-check > .advanced-body > .duty-readback'))).toBe('Look at queue.example.com/api. Take the whole answer as the list. Wake Migrator when the check finds an item.');
  });

  it('show what the agent tried in words when the 422 holds only a readback', async () => {
    const el = await writeWith(() => ({ status: 422, body: { detail: 'no list', error: 'no list', readback: 'First it looks at the queue.', forDevelopers: 'At queue.example.com/api.' } }));
    expect(text(el.querySelector('.duty-tried'))).toBe('What Migrator tried First it looks at the queue. For developers At queue.example.com/api.');
  });

  it('show a problem of the words under the words, and one of the agent under the agent picker', async () => {
    const el = await writeWith(() => ({ status: 400, body: { detail: 'bad', problems: ['words: Say what the agent waits for in more words.', 'agent: migrator has no tool that reads a queue.'] } }));
    expect(wordsError(el)).toBe('Say what the agent waits for in more words.');
    expect(text(el.querySelector('section[aria-labelledby="duty-who-head"] .duty-problems'))).toBe('Migrator has no tool that reads a queue.');
    expect(el.querySelector('.duty-tried')).toBeNull();
  });
});
