import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetRuns } from '../state/actions';
import type { Fleet } from '../api/types';
import { Roster, usageParts } from './Roster';
import { bridgeOf, fakeFetch, memberOf, mount, settle, unmountAll } from './testkit-a';

const B = 'b-roster';

// The error of a seat on the homelab fleet, as the run held it.
const PREFILL =
  'model: anthropic: stream claude-haiku-5-5: POST "http://ax-anthropic.fw-fleet.svc.cluster.local:8080/v1/messages?beta=true": 400 Bad Request (Request-ID: req_011CgJhPGRsjUd3vHdi7JLjE) (Workspace-ID: wrkspc_018mMkT171jg5neTmcSP7ha8) {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support assistant message prefill. The conversation must end with a user message."},"request_id":"req_011CgJhPGRsjUd3vHdi7JLjE"}';

const fleet: Fleet = {
  name: 'front-0',
  members: [
    { name: 'default/crew-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 1, inputRequired: 0 },
    { name: 'default/crew-1', state: 'suspended', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 0, inputRequired: 0 },
    { name: 'default/review-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [], active: 1, inputRequired: 0 },
  ],
  pools: [
    { name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 2, actual: 2, ready: 2, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }, { name: 'crew-1', phase: 'Suspended', current: true }] },
    { name: 'review', atespace: 'default', agent: 'reviewer', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'review-0', phase: 'Running', current: true }] },
  ],
};

let f: ReturnType<typeof fakeFetch>;

beforeAll(() => {
  f = fakeFetch([
    ['GET', /^\/v1\/pages$/, () => ({ pages: [{ path: 'bridges/b-roster/plan.md', title: 'Plan', hash: 'h', size: 1, by: 'token', at: '2026-10-21T10:00:00Z' }] })],
    ['GET', /^\/v1\/runs\/run-writer$/, () => ({ id: 'run-writer', agent: 'writer', state: 'failed', error: 'The run reached its limit of 40 turns.', seq: 9, createdAt: '', updatedAt: '' })],
    ['GET', /^\/v1\/runs\/run-notes$/, () => ({ id: 'run-notes', agent: 'writer', state: 'failed', error: PREFILL, seq: 9, createdAt: '', updatedAt: '' })],
    ['GET', /^\/v1\/runs\/run-reviewer-2$/, () => ({ id: 'run-reviewer-2', agent: 'reviewer', state: 'queued', seq: 1, createdAt: '', updatedAt: '' })],
    ['POST', /\/members$/, (body) => ({ ...(body as object), runs: ['run-new'], fired: false, muted: false, presence: 'working', activity: null })],
    ['PATCH', /\/members\//, (body, path) => ({ ...memberOf(decodeURIComponent(path.split('/').pop()!), { agent: 'writer', presence: 'working' }), ...(body as object) })],
  ]);
  forgetRuns();
  act(() => {
    store.dispatch({ type: 'agents', agents: [{ name: 'migrator', role: 'owner' }, { name: 'reviewer', role: 'owner' }, { name: 'writer', role: 'operator' }, { name: 'scribe', role: 'operator' }] });
    store.dispatch({ type: 'faces', faces: [{ agent: 'migrator', displayName: 'Migrator', tagline: 'Turns manifests into roles', hash: 'h1', custom: false }] });
    store.dispatch({ type: 'fleet', fleet });
    store.dispatch({
      type: 'bridge',
      bridge: {
        ...bridgeOf(B),
        usage: { turns: 41, costUSD: 0.62, reported: 5, final: 1, missing: 0, partial: false },
        members: [
          memberOf('migrator-1', { presence: 'working', activity: { turn: 7, phrase: 'Ran "ansible-lint roles/cron"', since: '' } }),
          memberOf('migrator-2', { presence: 'needs-you' }),
          memberOf('reviewer', { presence: 'idle' }),
          memberOf('reviewer-2', { agent: 'reviewer', presence: 'working', activity: null }),
          memberOf('tester', { presence: 'asleep', muted: true }),
          memberOf('writer', { presence: 'error' }),
          memberOf('notes', { agent: 'writer', presence: 'error' }),
          memberOf('scribe', { presence: 'fired', fired: true, muted: true }),
        ],
      },
    });
  });
});
afterEach(unmountAll);
afterAll(() => f.restore());

const status = (el: HTMLElement, handle: string) => {
  const li = [...el.querySelectorAll('li.member')].find((x) => x.querySelector('.handle')!.textContent === handle)!;
  return li;
};

describe('the members', () => {
  it('shows each status as a word beside its light, the phrase, the tag, and the reason of an error', async () => {
    const el = mount(<Roster bridge={B} />);
    await settle();
    const word = (h: string) => status(el, h).querySelector('.status')!.textContent;
    expect(word('migrator-1')).toBe('working');
    expect(word('migrator-2')).toBe('needs you');
    expect(word('reviewer')).toBe('idle');
    expect(word('reviewer-2')).toBe('waiting for a worker');
    expect(word('tester')).toBe('asleep');
    expect(word('writer')).toBe('error');
    expect(word('scribe')).toBe('fired');
    expect(status(el, 'scribe').querySelector('.status.struck')).not.toBeNull();
    expect(status(el, 'migrator-2').classList.contains('needs')).toBe(true);
    expect(status(el, 'migrator-1').querySelector('.act')!.textContent).toBe('Ran ansible-lint roles/cron');
    expect(status(el, 'migrator-1').querySelector('.act code')!.textContent).toBe('ansible-lint roles/cron');
    expect(status(el, 'tester').querySelector('.chip')!.textContent).toBe('muted');
    expect(status(el, 'writer').querySelector('.act.fail')!.textContent).toBe('Stopped at 40 turns');
    // A refusal of the provider reads as one plain line, with the message of the provider in its tooltip.
    const notes = status(el, 'notes').querySelector('.act.fail')!;
    expect(notes.textContent).toBe('The model refused the request');
    expect(notes.getAttribute('title')).toBe('This model does not support assistant message prefill. The conversation must end with a user message.');
    expect(status(el, 'notes').textContent).not.toContain('anthropic');
    expect(status(el, 'notes').querySelector('a.open')!.getAttribute('aria-label')).toBe('notes, error. Do the work of notes. The model refused the request. Open its conversation.');
    expect(status(el, 'migrator-1').querySelector('a.open')!.getAttribute('href')).toBe('#member/b-roster/migrator-1');
    expect(status(el, 'migrator-1').querySelector('a.open')!.getAttribute('aria-label')).toBe('migrator-1, working. Do the work of migrator-1. Open its conversation.');
  });

  it('puts Seat again on the row of a seat in error and in its menu, and each sends its task unchanged at once', async () => {
    const el = mount(<Roster bridge={B} />);
    await settle();
    const key = status(el, 'writer').querySelector('.member-keys button')!;
    expect(key.textContent).toBe('Seat again');
    expect(key.getAttribute('aria-label')).toBe('Seat writer again');
    expect(status(el, 'migrator-1').querySelector('.member-keys')).toBeNull();
    expect(status(el, 'scribe').querySelector('.member-keys')).toBeNull();
    act(() => (status(el, 'notes').querySelector('button[aria-label="More for notes"]') as HTMLButtonElement).click());
    const items = [...status(el, 'notes').querySelectorAll('[role="menuitem"]')].map((x) => x.textContent);
    expect(items).toEqual(['Open conversation', 'Mute', 'Seat again', 'Change task', 'Fire']);
    act(() => ([...status(el, 'notes').querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === 'Seat again') as HTMLButtonElement).click());
    await settle();
    expect(el.querySelector('dialog.confirm')).toBeNull();
    expect(f.seen.filter((s) => s.method === 'PATCH').pop()).toEqual({ method: 'PATCH', path: '/v1/bridges/b-roster/members/notes', body: { task: 'Do the work of notes' } });
    act(() => (key as HTMLButtonElement).click());
    await settle();
    expect(el.querySelector('dialog.confirm')).toBeNull();
    expect(f.seen.filter((s) => s.method === 'PATCH').pop()).toEqual({ method: 'PATCH', path: '/v1/bridges/b-roster/members/writer', body: { task: 'Do the work of writer' } });
    expect(status(el, 'migrator-1').querySelector('[aria-label="More for migrator-1"]')).not.toBeNull();
  });

  it('sums the usage of the bridge in its foot', async () => {
    const el = mount(<Roster bridge={B} />);
    await settle();
    const foot = el.querySelector('.bridge-foot')!;
    expect(foot.querySelector('.t-meta')!.textContent).toBe('This bridge');
    expect([...foot.querySelectorAll('.nums > span')].map((x) => x.textContent)).toEqual(['41 turns', '$0.62 so far', '1 page']);
    expect(usageParts({ reported: 1, final: 0, missing: 0, partial: false, turns: 1 }, 2).map((p) => p.n + ' ' + p.word)).toEqual(['1 turn', '2 pages']);
  });
});

describe('the picker of Add', () => {
  const open = (el: HTMLElement) => act(() => ([...el.querySelectorAll('.pane-actions button')].find((b) => b.textContent === 'Add') as HTMLButtonElement).click());
  const rows = (el: HTMLElement) => [...el.querySelectorAll('.pick-row')].map((r) => r.querySelector('.pick-name')!.textContent + ' ' + r.querySelector('.status')!.textContent);

  it('groups the agents by this bridge and everyone else, with their free workers', () => {
    const el = mount(<Roster bridge={B} />);
    open(el);
    const picker = el.querySelector('.picker[role="dialog"]')!;
    expect(picker.querySelector('input')!.getAttribute('placeholder')).toBe('Who?');
    expect([...picker.querySelectorAll('.pick-group')].map((g) => g.textContent)).toEqual(['On this bridge', 'Everyone else']);
    // On this bridge holds the agents of the seats, also the tester, which the profiles of the front do not name.
    expect(rows(el)).toEqual(['Migrator 1 free', 'Reviewer waiting for a worker', 'Tester waiting for a worker', 'Writer waiting for a worker', 'Scribe waiting for a worker']);
    expect(picker.querySelector('.pick-row .led-green')).not.toBeNull();
    expect(picker.querySelector('a[href="#new-agent"]')!.textContent).toBe('New agent');
  });

  it('puts a new seat row at the top with the next handle and the task from the goal, and stays open', () => {
    const el = mount(<Roster bridge={B} />);
    open(el);
    act(() => (el.querySelector('.pick-row') as HTMLButtonElement).click());
    const draft = el.querySelector('li.member.draft')!;
    expect(draft.querySelector('.handle')!.textContent).toBe('migrator-3');
    expect(draft.querySelector('.t-meta')!.textContent).toBe('new seat');
    expect((draft.querySelector('input') as HTMLInputElement).value).toBe('Migrate the logrotate module');
    expect([...draft.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Seat', 'Cancel']);
    expect(el.querySelector('.picker')).not.toBeNull();
    // The last free worker of the migrator now has a seat that waits.
    expect(rows(el)[0]).toBe('Migrator waiting for a worker');
    act(() => (el.querySelector('.pick-row') as HTMLButtonElement).click());
    expect([...el.querySelectorAll('li.member.draft .handle')].map((h) => h.textContent)).toEqual(['migrator-4', 'migrator-3']);
  });

  it('seats a new seat with Seat, and drops it with Cancel', async () => {
    const el = mount(<Roster bridge={B} />);
    open(el);
    act(() => (el.querySelector('.pick-row') as HTMLButtonElement).click());
    act(() => (el.querySelector('.pick-row') as HTMLButtonElement).click());
    act(() => ([...el.querySelectorAll('li.member.draft button')].find((b) => b.textContent === 'Cancel') as HTMLButtonElement).click());
    expect(el.querySelectorAll('li.member.draft').length).toBe(1);
    act(() => ([...el.querySelectorAll('li.member.draft button')].find((b) => b.textContent === 'Seat') as HTMLButtonElement).click());
    await settle();
    expect(f.seen.filter((s) => s.method === 'POST').pop()).toEqual({ method: 'POST', path: '/v1/bridges/b-roster/members', body: { handle: 'migrator-3', agent: 'migrator', task: 'Migrate the logrotate module' } });
    expect(el.querySelectorAll('li.member.draft').length).toBe(0);
  });

  it('keeps the agents that match Who, and closes on Escape', () => {
    const el = mount(<Roster bridge={B} />);
    open(el);
    const field = el.querySelector('.picker input') as HTMLInputElement;
    act(() => {
      field.value = 'manifests';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows(el)).toEqual(['Migrator 1 free']);
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(el.querySelector('.picker')).toBeNull();
  });

  it('opens the full form in Advanced, with the reason of a bad handle', () => {
    const el = mount(<Roster bridge={B} />);
    open(el);
    act(() => ([...el.querySelectorAll('.pick-foot button')].find((b) => b.textContent === 'Advanced') as HTMLButtonElement).click());
    const form = el.querySelector('.pick-form')!;
    expect([...form.querySelectorAll('.field-label')].map((l) => l.textContent)).toEqual(['Handle', 'Agent', 'Task']);
    const handle = form.querySelector('input') as HTMLInputElement;
    // The test before seated migrator-3, so the next handle is migrator-4.
    expect(handle.value).toBe('migrator-4');
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Migrate the logrotate module');
    act(() => {
      handle.value = 'manager';
      handle.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(form.querySelector('[role="alert"]')!.textContent).toBe('The handle manager is reserved. Pick another.');
    act(() => {
      handle.value = 'reviewer';
      handle.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(form.querySelector('[role="alert"]')!.textContent).toBe('reviewer has a seat on this bridge already. Pick another handle.');
  });
});

describe('an empty bridge', () => {
  it('invites the first seat', () => {
    act(() => store.dispatch({ type: 'bridge', bridge: { ...bridgeOf('b-empty'), members: [] } }));
    const el = mount(<Roster bridge="b-empty" />);
    expect(el.querySelector('.empty p')!.textContent).toBe('No one has a seat yet.');
    expect(el.querySelector('.empty button')!.textContent).toBe('Add');
  });
});
