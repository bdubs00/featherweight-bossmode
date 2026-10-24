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
import { click, fakeApi, fieldOf, keyNamed, mount, settle, typeIn, unmountAll, type Call, type Route } from './testkit-c';

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
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': { secrets: [], events: [], actions: ['ask'], looks: ['http'] }, 'PUT /v1/duties/new-duty?dryRun=true': dry() });
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
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new-duty?dryRun=true': dry() });
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
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new-duty?dryRun=true': dry({ readback: '' }) });
    const el = mount(<DutyEditor />);
    await settle();
    expect(keyNamed(el, 'What happened')).toBeUndefined();
    click(radio(el, 'duty-start', 'event'));
    expect(select(el, 'Repeat')).toBeNull();
    change(fieldOf(el, 'What happens'), 'bridge.closed');
    change(fieldOf(el, 'Of the agent'), 'migrator');
    await settle();
    expect((lastPut().body as DutyRecord).when).toEqual({ event: { kind: 'bridge.closed', agent: 'migrator' } });
    expect(text(el.querySelector('.duty-readback-box .duty-readback'))).toBe('When a bridge of migrator closes.');
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
    expect((fieldOf(el, 'Ask migrator') as unknown as HTMLTextAreaElement).value).toBe('Read [What happened].');
  });

  it('takes a first and a last day, and refuses a last day before the first', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new-duty?dryRun=true': dry() });
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
    typeIn(fieldOf(el, 'Ask migrator'), 'Report.');
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
      'PUT /v1/duties/new-duty?dryRun=true': dry(),
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

  it('opens a bridge from a playbook, with a goal, and deletes a playbook after it asks', async () => {
    // A route of 204 answers no body.
    const del: Route = () => ({ status: 204 });
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'GET /v1/playbooks': { playbooks: [{ name: 'weekly-patching', goal: 'Patch the lab hosts and report.', placement: 'queue', seats: [{ handle: 'patcher', agent: 'migrator', task: 'Patch.' }], revision: 3, updatedAt: '2026-10-20T10:00:00Z' }] },
      'DELETE /v1/playbooks/weekly-patching': del,
      'PUT /v1/duties/new-duty?dryRun=true': dry(),
      'PUT /v1/duties/patch-on?dryRun=true': dry(),
    });
    const el = mount(<DutyEditor />);
    await settle();
    fill(el);
    click(radio(el, 'duty-do', 'open'));
    await settle();
    expect(fieldOf(el, 'Ask migrator')).toBeNull();
    expect(optionsOf(fieldOf(el, 'Playbook'))).toEqual(['Pick a playbook', 'Weekly patching: Patch the lab hosts and report.']);
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Playbook')!.closest('label')!.querySelector('.field-error'))).toBe('Pick a playbook.');
    change(fieldOf(el, 'Playbook'), 'weekly-patching');
    typeIn(fieldOf(el, 'Goal'), 'Patch on ');
    click(keyNamed(el, "Today's date"));
    expect(fieldOf(el, 'Name')!.value).toBe('patch-on');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect((lastPut().body as DutyRecord).do).toEqual({ open: { playbook: 'weekly-patching', goal: 'Patch on {date}' } });
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
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new-duty?dryRun=true': dry(), 'PUT /v1/duties/sum-up-the-week?dryRun=true': dry() });
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
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new-duty?dryRun=true': dry(), 'PUT /v1/duties/check-the-backups?dryRun=true': dry() });
    let el = mount(<DutyEditor seed={{ agent: 'migrator', act: 'manager', message: 'Check the backups.' }} />);
    await settle();
    expect(text(el.querySelector('.duty-who'))).toContain('migrator');
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
    expect((fieldOf(el, 'Ask migrator') as unknown as HTMLTextAreaElement).value).toBe('Check the backups.');
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
      'PUT /v1/duties/new-duty?dryRun=true': dry(),
    });
    const el = mount(<DutyEditor />);
    await settle();
    openCheck(el);
    click(keyNamed(el, 'Set it up by hand'));
    click(radio(el, 'duty-look', 'tool'));
    expect(text(el.querySelector('details.duty-check'))).toContain('Pick the agent first. Its tools show here.');
    pick(el, 'Migrator');
    await settle();
    expect(optionsOf(fieldOf(el, 'Tool'))).toEqual(['Pick a tool', 'Find incidents, servicenow.query_incidents', 'servicenow.get_incident', 'Run shell commands, bash']);
    change(fieldOf(el, 'Tool'), 'servicenow.query_incidents');
    click(keyNamed(el, 'Add a value'));
    typeIn(el.querySelector('input[aria-label="Name 1"]'), 'query');
    typeIn(el.querySelector('input[aria-label="Value 1"]'), 'priority<=2');
    click(keyNamed(el, 'Add a filter'));
    typeIn(el.querySelector('input[aria-label="Field of filter 1"]'), 'priority');
    change(select(el, 'Test of filter 1'), 'atMost');
    typeIn(el.querySelector('input[aria-label="Value of filter 1"]'), 'two');
    typeIn(fieldOf(el, 'Ask migrator'), 'Triage.');
    typeIn(fieldOf(el, 'The most a run can cost'), '1');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(el.querySelector('[aria-label="Keep the items where"] .field-error'))).toBe('At least and at most need a number.');
    typeIn(el.querySelector('input[aria-label="Value of filter 1"]'), '2');
    expect(text(el.querySelector('details.duty-check .duty-readback'))).toBe('Call the tool servicenow.query_incidents of migrator. Take the whole answer as the list. Keep the items where priority is at most 2. Wake migrator only for items that it did not see before.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect((lastPut().body as DutyRecord).checkFirst).toEqual({ look: { tool: 'servicenow.query_incidents', input: { query: 'priority<=2' } }, where: [{ field: 'priority', atMost: 2 }], wake: { when: 'new' } });
    click(keyNamed(document.querySelector('dialog.confirm')!, 'Cancel'));
    click(el.querySelector('button[aria-label="Remove filter 1"]'));
    expect(el.querySelector('input[aria-label="Field of filter 1"]')).toBeNull();
  });

  it('offers only the secrets of the front for the host of the address', async () => {
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new-duty?dryRun=true': dry() });
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
    api = fakeApi({ 'GET /v1/duties': { duties: [], paused: false }, 'GET /v1/duties/options': ALL, 'PUT /v1/duties/new-duty?dryRun=true': dry() });
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
      expect(text(wait)).toBe('migrator writes the check, then tries it once. This can take up to two minutes. 0 seconds so far.');
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
      'PUT /v1/duties/new-duty?dryRun=true': dry(),
      'POST /v1/duties/new-duty/write-check': () => ({ status: 504, body: { detail: 'gateway timeout' } }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    openCheck(el);
    pick(el, 'Migrator');
    typeIn(fieldOf(el, 'Wake the agent only when'), 'a new P1');
    click(keyNamed(el, 'Write the check for me'));
    await settle();
    expect(text(fieldOf(el, 'Wake the agent only when')!.closest('label')!.querySelector('.field-error'))).toBe('migrator did not answer within two minutes. Try again, or set the check up by hand.');
  });
});

describe('the problems of the front', () => {
  it('show beside their fields, and a problem with no path at the top', async () => {
    api = fakeApi({
      'GET /v1/duties': { duties: [], paused: false },
      'GET /v1/duties/options': ALL,
      'PUT /v1/duties/new-duty?dryRun=true': dry(),
      'PUT /v1/duties/sum-up?dryRun=true': dry({
        problems: ['do.ask.message: the message names no file.', 'limits.budget: A run of migrator costs at least $1.', 'whileAway.timeout: Too long.', 'checkFirst.look.http.url: The front cannot reach this host.', 'The agent migrator cannot run at night.'],
      }),
    });
    const el = mount(<DutyEditor />);
    await settle();
    fill(el);
    typeIn(fieldOf(el, 'Ask migrator'), 'Sum up.');
    click(keyNamed(el, 'Save duty'));
    await settle();
    expect(text(fieldOf(el, 'Ask migrator')!.closest('label')!.querySelector('.field-error'))).toBe('The message names no file.');
    expect(text(fieldOf(el, 'The most a run can cost')!.closest('label')!.querySelector('.field-error'))).toBe('A run of migrator costs at least $1.');
    expect(text(el.querySelector('section[aria-labelledby="duty-away-head"] .duty-problems'))).toBe('Too long.');
    expect((el.querySelector('details.duty-check') as HTMLDetailsElement).open).toBe(true);
    expect(text(el.querySelector('details.duty-check .duty-problems'))).toBe('The front cannot reach this host.');
    const top = el.querySelector('.duty-form > .duty-problems-box')!;
    expect(text(top)).toBe('The duty cannot save yet. The agent migrator cannot run at night.');
    expect(document.querySelector('dialog.confirm')).toBeNull();
  });
});
