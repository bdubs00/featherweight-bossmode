import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetManagerRun } from '../state/actions';
import type { BossConfig, Fleet } from '../api/types';
import { DRAFT_KEY, NewBridge, askOf, bodyOf, bridgeErrors, titleOf, type BridgeForm } from './NewBridge';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll } from './testkit-c';

const MANAGER: BossConfig = { manager: { agent: 'manager', member: 'default/manager-0', run: '' }, placement: 'queue', maxMembers: 16 };
// The profiles of the front name only its own agent. The pools run the
// migrator and the reviewer, and a member holds an agent that the person
// can only view.
const AGENTS = [{ name: 'default', role: 'owner' }];
const FLEET: Fleet = {
  name: 'front-0',
  members: [{ name: 'default/other-0', state: 'live', lastSeen: '', canForward: true, accessMode: '', agents: [{ name: 'secret', role: 'viewer', description: 'Not for you.' }, { name: 'reviewer', role: 'operator', description: 'Reviews.' }], active: 0, inputRequired: 0 }],
  pools: [
    { name: 'crew', atespace: 'default', agent: 'migrator', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'crew-0', phase: 'Running', current: true }] },
    { name: 'review', atespace: 'default', agent: 'reviewer', intake: 'q', wanted: 1, actual: 1, ready: 1, hash: 'h', checkedAt: '', tasks: [{ name: 'review-0', phase: 'Running', current: true }] },
  ],
};

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  act(() => {
    store.dispatch({ type: 'config', config: MANAGER });
    store.dispatch({ type: 'agents', agents: AGENTS });
    store.dispatch({ type: 'fleet', fleet: FLEET });
  });
  forgetManagerRun();
  sessionStorage.removeItem(DRAFT_KEY);
  location.hash = '#new';
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

const form = (p: Partial<BridgeForm> = {}): BridgeForm => ({ goal: 'Migrate logrotate.', mode: 'pick', seats: [], placement: 'queue', title: '', caps: {}, delegation: { approve: false, budget: false, members: false, report: true }, ...p });

describe('NewBridge', () => {
  it('asks the job and the seats first, and keeps the placement under Advanced, keep warm workers by default', () => {
    api = fakeApi({});
    const el = mount(<NewBridge />);
    // The first view: the job, who seats it, and the key that adds a seat. The rest waits under Advanced.
    const outside = [...el.querySelectorAll('.field-label, legend')].filter((x) => !x.closest('details.advanced')).map((x) => x.textContent);
    expect(outside).toEqual(['What is the job?', 'Seats']);
    expect(keyNamed(el, 'Add a seat')).toBeTruthy();
    const adv = el.querySelector('details.advanced') as HTMLDetailsElement;
    expect(adv.open).toBe(false);
    expect(adv.querySelectorAll('input[name="placement"]').length).toBe(2);
    const choices = [...el.querySelectorAll<HTMLInputElement>('input[name="placement"]')].map((i) => ({ word: i.closest('label')!.querySelector('.t-sub')!.textContent, on: i.checked, value: i.value }));
    expect(choices).toEqual([
      { word: 'Keep warm workers', on: true, value: 'queue' },
      { word: 'Fresh sandbox per seat', on: false, value: 'spawn' },
    ]);
    // The key Add a seat opens the picker of the members pane, and an agent that the person cannot run offers no seat.
    click(keyNamed(el, 'Add a seat'));
    expect([...el.querySelectorAll('.picker .pick-name')].map((x) => x.textContent)).toEqual(['Migrator', 'Reviewer']);
  });

  it('takes the default placement of the settings', () => {
    act(() => store.dispatch({ type: 'config', config: { ...MANAGER, placement: 'spawn' } }));
    api = fakeApi({});
    const el = mount(<NewBridge />);
    expect((el.querySelector('input[value="spawn"]') as HTMLInputElement).checked).toBe(true);
  });

  it('opens the bridge with the placement, the seats, and a title from the goal', async () => {
    api = fakeApi({ 'POST /v1/bridges': () => ({ status: 201, body: { id: 'br-new', title: 'Migrate logrotate', goal: 'g', operator: '', state: 'open', placement: 'spawn', createdAt: '', closedAt: null, delegation: { approve: false, budget: false, members: false, report: true }, caps: { maxMessages: 1, maxFanoutPerMinute: 1, maxPairMessages: 1 }, lastSeq: 0, read: 0, unread: 0, members: [] } }) });
    const el = mount(<NewBridge />);
    typeIn(el.querySelector('textarea'), 'Migrate logrotate. Then review it.');
    click(keyNamed(el, 'Add a seat'));
    const migrator = () => [...el.querySelectorAll('.picker .pick-row')].find((r) => r.querySelector('.pick-name')!.textContent === 'Migrator');
    click(migrator());
    click(migrator());
    click(el.querySelector('input[value="spawn"]'));
    click(keyNamed(el, 'Open bridge'));
    await settle();
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      title: 'Migrate logrotate',
      goal: 'Migrate logrotate. Then review it.',
      placement: 'spawn',
      members: [
        { handle: 'migrator', agent: 'migrator', task: 'Migrate logrotate' },
        { handle: 'migrator-2', agent: 'migrator', task: 'Migrate logrotate' },
      ],
      delegation: { approve: false, budget: false, members: false, report: true },
    });
    expect(location.hash).toBe('#bridge/br-new');
  });

  it('opens Advanced to show why a fresh sandbox per seat cannot open without a manager', () => {
    act(() => store.dispatch({ type: 'config', config: { ...MANAGER, manager: null } }));
    api = fakeApi({});
    const el = mount(<NewBridge />);
    // Without a manager, the seats have a heading of their own, and the placement keeps warm workers.
    expect(el.querySelector('#seats-head')!.textContent).toBe('Seats');
    expect((el.querySelector('input[value="queue"]') as HTMLInputElement).checked).toBe(true);
    typeIn(el.querySelector('textarea'), 'Migrate logrotate.');
    click(el.querySelector('input[value="spawn"]'));
    click(keyNamed(el, 'Open bridge'));
    expect((el.querySelector('details.advanced') as HTMLDetailsElement).open).toBe(true);
    expect([...el.querySelectorAll('[role="alert"]')].map((x) => x.textContent)).toContain('A fresh sandbox per seat needs a manager. Pick keep warm workers, or set up a manager.');
  });

  it('says what is missing in the words of the copy', () => {
    api = fakeApi({});
    const el = mount(<NewBridge />);
    click(keyNamed(el, 'Open bridge'));
    const alerts = [...el.querySelectorAll('[role="alert"]')].map((x) => x.textContent);
    expect(alerts).toContain('Write the goal of the bridge.');
    expect(alerts).toContain('Member 1 needs an agent.');
    // The form reads the playbooks of the person, and sends nothing.
    expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });

  it('hands the job to the manager when the manager splits it', async () => {
    api = fakeApi({ 'POST /v1/runs': () => ({ status: 201, body: { id: 'run-m1', agent: 'manager', state: 'queued', seq: 1, createdAt: '', updatedAt: '' } }) });
    const el = mount(<NewBridge />);
    typeIn(el.querySelector('textarea'), 'Write the release notes of 2.4.');
    click([...el.querySelectorAll('input[name="mode"]')][1]);
    expect(el.querySelector('.pick-anchor')).toBeNull();
    // The key says what it does on this path: the manager plans the seats, and no bridge opens yet.
    expect(keyNamed(el, 'Open bridge')).toBeUndefined();
    click(keyNamed(el, 'Ask the manager'));
    await settle();
    const start = api.calls.find((c) => c.method === 'POST')!;
    expect(start.path).toBe('/v1/runs?member=default%2Fmanager-0');
    // The message reads as the person writes: the job first, then the ask, and the default placement goes without a word.
    expect((start.body as { input: string }).input).toBe('Write the release notes of 2.4.\n\nPlease open a bridge for this and pick the seats.');
    expect(keyNamed(el, 'Ask the manager')).toBeTruthy();
    expect(location.hash).toBe('#manager');
  });
});

describe('the draft and the errors of the form', () => {
  const migrator = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.picker .pick-row')].find((r) => r.querySelector('.pick-name')!.textContent === 'Migrator')!;
  const alerts = (el: HTMLElement) => [...el.querySelectorAll('[role="alert"]')].map((x) => x.textContent);

  it('keeps a draft in the tab, so the form comes back with the job and the seats after a move away', () => {
    api = fakeApi({});
    let el = mount(<NewBridge />);
    typeIn(el.querySelector('textarea'), 'Migrate logrotate. Then review it.');
    click(keyNamed(el, 'Add a seat'));
    click(migrator(el));
    unmountAll();
    el = mount(<NewBridge />);
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Migrate logrotate. Then review it.');
    expect([...el.querySelectorAll('.seat .seat-handle .t-sub')].map((x) => x.textContent)).toEqual(['migrator']);
    expect((el.querySelector('input[aria-label="Task of migrator"]') as HTMLInputElement).value).toBe('Migrate logrotate');
  });

  it('keeps the focus in the picker after a pick, so Escape closes the picker and leaves the form alone', () => {
    api = fakeApi({});
    const el = mount(<NewBridge />);
    click(keyNamed(el, 'Add a seat'));
    const row = migrator(el);
    act(() => row.focus());
    click(row);
    // The pick moves the agent to On this bridge. The focus follows its row and never falls to the page.
    const on = document.activeElement as HTMLElement;
    expect(on.closest('.picker')).not.toBeNull();
    expect(on.dataset.agent).toBe('migrator');
    act(() => {
      on.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(el.querySelector('.picker')).toBeNull();
    expect(document.activeElement).toBe(keyNamed(el, 'Add a seat'));
    expect(el.querySelectorAll('.seat').length).toBe(1);
  });

  it('marks only the field that is wrong, focuses the first one, and clears each error as the person fixes it', async () => {
    api = fakeApi({});
    const el = mount(<NewBridge />);
    click(keyNamed(el, 'Add a seat'));
    click(migrator(el));
    click(keyNamed(el, 'Open bridge'));
    await settle();
    expect(alerts(el)).toEqual(['Write the goal of the bridge.', 'Member 1 needs a task.']);
    // A missing task is no fault of the handle: Advanced stays shut, and the task alone shows red.
    expect((el.querySelector('details.advanced') as HTMLDetailsElement).open).toBe(false);
    expect(el.querySelector('input[aria-label="Task of migrator"]')!.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(el.querySelector('textarea'));
    // The task of the seat follows the goal, so the goal fixes both.
    typeIn(el.querySelector('textarea'), 'Migrate logrotate.');
    expect(alerts(el)).toEqual([]);
    expect(el.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it('asks before Cancel throws a filled form away, and then forgets the draft', () => {
    api = fakeApi({});
    location.hash = '#new';
    const el = mount(<NewBridge />);
    typeIn(el.querySelector('textarea'), 'Migrate logrotate.');
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull();
    click(keyNamed(el, 'Cancel'));
    const dialog = el.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Throw away this bridge?');
    click(keyNamed(dialog, 'Throw away'));
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(location.hash).toBe('');
  });

  it('leaves an empty form at once on Cancel, with no draft and no question', () => {
    api = fakeApi({});
    location.hash = '#new';
    const el = mount(<NewBridge />);
    click(keyNamed(el, 'Cancel'));
    expect(el.querySelector('dialog.confirm')).toBeNull();
    expect(location.hash).toBe('');
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('asks the manager for the job without the caps and what the manager can do, which the manager picks', () => {
    api = fakeApi({});
    const el = mount(<NewBridge />);
    const legends = () => [...el.querySelectorAll('details.advanced legend')].map((x) => x.firstChild!.textContent!.trim());
    expect(legends()).toEqual(['Placement', 'Caps', 'What the manager can do here']);
    click([...el.querySelectorAll('input[name="mode"]')][1]);
    expect(legends()).toEqual(['Placement']);
    // Each placement says in one line what it means.
    expect([...el.querySelectorAll('input[name="placement"]')].map((i) => i.closest('label')!.querySelector('.t-meta')!.textContent)).toEqual([
      'Each seat starts at once on a worker that its agent keeps.',
      'The manager starts a new worker for each seat, so a seat starts later.',
    ]);
  });
});

describe('the record of a bridge', () => {
  it('fills the title from the first sentence of the goal, cut at a word', () => {
    expect(titleOf('Migrate logrotate. Then review it.')).toBe('Migrate logrotate');
    expect(titleOf('Ship it!')).toBe('Ship it');
    const long = 'Migrate every remaining module of the Puppet tree to an Ansible role with its molecule scenario and its notes';
    expect(titleOf(long).length).toBeLessThanOrEqual(80);
    expect(long.startsWith(titleOf(long))).toBe(true);
  });

  it('names the placement in the message to the manager only when it is not the default, and the title only when the person gave one', () => {
    expect(askOf(form())).not.toContain('sandbox');
    expect(askOf(form({ placement: 'spawn' }))).toMatch(/pick the seats\. Give each seat a fresh sandbox \(spawn\)\.$/);
    expect(askOf(form(), 'spawn')).toMatch(/Use the warm workers \(queue\)\.$/);
    expect(askOf(form({ title: 'Notes 2.4' }))).toMatch(/pick the seats\. Call it "Notes 2\.4"\.$/);
  });

  it('sends only the caps that the person set', () => {
    expect(bodyOf(form({ caps: { maxMessages: '500', maxPairMessages: '' } })).caps).toEqual({ maxMessages: 500 });
    expect(bodyOf(form()).caps).toBeUndefined();
  });

  it('refuses a fresh sandbox per seat without a manager, and a handle twice', () => {
    const seats = [
      { key: 1, agent: 'migrator', handle: 'migrator', task: 't', own: false },
      { key: 2, agent: 'migrator', handle: 'migrator', task: 't', own: false },
    ];
    const e = bridgeErrors(form({ placement: 'spawn', seats }), false);
    expect(e.placement).toBe('A fresh sandbox per seat needs a manager. Pick keep warm workers, or set up a manager.');
    expect(e.seat[2]).toBe('migrator has a seat on this bridge already. Pick another handle.');
  });
});
