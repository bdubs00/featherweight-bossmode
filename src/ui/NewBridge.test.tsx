import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetManagerRun } from '../state/actions';
import type { BossConfig } from '../api/types';
import { NewBridge, bodyOf, bridgeErrors, titleOf, type BridgeForm } from './NewBridge';
import { click, fakeApi, keyNamed, mount, settle, typeIn, unmountAll } from './testkit-c';

const MANAGER: BossConfig = { manager: { agent: 'manager', member: 'default/manager-0', run: '' }, placement: 'queue', maxMembers: 16 };
const AGENTS = [
  { name: 'migrator', role: 'owner', description: 'Moves a module.' },
  { name: 'reviewer', role: 'operator', description: 'Reviews.' },
  { name: 'secret', role: 'viewer', description: 'Not for you.' },
];

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  act(() => {
    store.dispatch({ type: 'config', config: MANAGER });
    store.dispatch({ type: 'agents', agents: AGENTS });
  });
  forgetManagerRun();
  location.hash = '#new';
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

const form = (p: Partial<BridgeForm> = {}): BridgeForm => ({ goal: 'Migrate logrotate.', mode: 'pick', seats: [], placement: 'queue', title: '', caps: {}, delegation: { approve: false, budget: false, members: false, report: true }, ...p });

describe('NewBridge', () => {
  it('asks the job first and offers the two placements, keep warm workers by default', () => {
    api = fakeApi({});
    const el = mount(<NewBridge />);
    const labels = [...el.querySelectorAll('.field-label, legend')].map((x) => x.textContent);
    expect(labels[0]).toBe('What is the job?');
    const choices = [...el.querySelectorAll<HTMLInputElement>('input[name="placement"]')].map((i) => ({ word: i.closest('label')!.textContent, on: i.checked, value: i.value }));
    expect(choices).toEqual([
      { word: 'Keep warm workers', on: true, value: 'queue' },
      { word: 'Fresh sandbox per seat', on: false, value: 'spawn' },
    ]);
    // An agent that the person cannot run offers no seat.
    expect(keyNamed(el, 'secret')).toBeUndefined();
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
    click(keyNamed(el, 'migrator'));
    click(keyNamed(el, 'migrator'));
    click(el.querySelector('input[value="spawn"]'));
    click(keyNamed(el, 'Open bridge'));
    await settle();
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      title: 'Migrate logrotate',
      goal: 'Migrate logrotate. Then review it.',
      placement: 'spawn',
      members: [
        { handle: 'migrator', agent: 'migrator', task: 'Migrate logrotate. Then review it.' },
        { handle: 'migrator-2', agent: 'migrator', task: 'Migrate logrotate. Then review it.' },
      ],
      delegation: { approve: false, budget: false, members: false, report: true },
    });
    expect(location.hash).toBe('#bridge/br-new');
  });

  it('says what is missing in the words of the copy', () => {
    api = fakeApi({});
    const el = mount(<NewBridge />);
    click(keyNamed(el, 'Open bridge'));
    const alerts = [...el.querySelectorAll('[role="alert"]')].map((x) => x.textContent);
    expect(alerts).toContain('Write the goal of the bridge.');
    expect(alerts).toContain('Member 1 needs an agent.');
    expect(api.calls).toEqual([]);
  });

  it('hands the job to the manager when the manager splits it', async () => {
    api = fakeApi({ 'POST /v1/runs': () => ({ status: 201, body: { id: 'run-m1', agent: 'manager', state: 'queued', seq: 1, createdAt: '', updatedAt: '' } }) });
    const el = mount(<NewBridge />);
    typeIn(el.querySelector('textarea'), 'Write the release notes of 2.4.');
    click([...el.querySelectorAll('input[name="mode"]')][1]);
    expect(el.querySelector('.agent-keys')).toBeNull();
    click(keyNamed(el, 'Open bridge'));
    await settle();
    const start = api.calls.find((c) => c.method === 'POST')!;
    expect(start.path).toBe('/v1/runs?member=default%2Fmanager-0');
    expect((start.body as { input: string }).input).toContain('Job: Write the release notes of 2.4.');
    expect((start.body as { input: string }).input).toContain('Placement: keep warm workers (queue)');
    expect(location.hash).toBe('#manager');
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
