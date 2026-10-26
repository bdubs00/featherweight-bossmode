import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import type { BossConfig, Bridge } from '../api/types';
import { store } from '../state/store';
import { forgetPlaybooks } from '../state/playbooks';
import { playbookBodyOf } from '../lib/playbooks';
import { Channel } from './Channel';
import { NewBridge } from './NewBridge';
import { clearSaid, currentSaid } from './notice';
import { bridge, seat } from './testkit-b';
import { click, fakeApi, fieldOf, keyNamed, mount, settle, typeIn, unmountAll, type Call, type Route } from './testkit-c';

const MEMBERS = [seat('migrator-1', 'migrator', 'idle', { task: 'Migrate cron.' }), seat('reviewer', 'reviewer', 'idle', { task: 'Review.' }), seat('old', 'migrator', 'fired', { fired: true })];
const B: Bridge = {
  ...bridge('b1', 'Migrate Puppet', MEMBERS),
  goal: 'Migrate the Puppet modules to Ansible.',
  caps: { maxMessages: 200, maxFanoutPerMinute: 30, maxPairMessages: 6, maxTurns: 400 },
  delegation: { approve: true, budget: false, members: false, report: true },
};
const LIST = { playbooks: [{ name: 'migrate-puppet', goal: 'An older goal.', placement: 'queue', seats: [], revision: 4, updatedAt: '2026-10-01T10:00:00Z' }] };

let api: ReturnType<typeof fakeApi>;
beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  // A draft of the editor lives in the storage of the tab. Each test starts without one.
  sessionStorage.clear();
  forgetPlaybooks();
  location.hash = '#bridge/b1';
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: 'alice@example.com', name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16 } as unknown as BossConfig });
  });
});
afterEach(() => {
  clearSaid();
  unmountAll();
  if (api) api.restore();
});

/** channel serves a bridge in the state given, with an empty channel. */
const channel = (state: 'open' | 'closed', more: Record<string, Route> = {}) => ({
  'GET /v1/bridges/b1': { ...B, state },
  'GET /v1/bridges/b1/messages': { bridge: 'b1', messages: [], next: 0, prev: 0 },
  'PUT /v1/bridges/b1/read': null,
  ...more,
});

function more(el: HTMLElement, item: string): void {
  click(el.querySelector('button[aria-label="More"]'));
  click([...el.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent === item));
}

const dialog = () => document.querySelector('dialog.confirm') as HTMLDialogElement;

describe('a playbook from a bridge', () => {
  it('takes the goal, the placement, the seats that are not fired, the caps, and what the manager can do', () => {
    expect(playbookBodyOf(B, MEMBERS)).toEqual({
      goal: 'Migrate the Puppet modules to Ansible.',
      placement: 'queue',
      seats: [
        { handle: 'migrator-1', agent: 'migrator', task: 'Migrate cron.' },
        { handle: 'reviewer', agent: 'reviewer', task: 'Review.' },
      ],
      caps: { maxMessages: 200, maxFanoutPerMinute: 30, maxPairMessages: 6, maxTurns: 400 },
      delegation: { approve: true, budget: false, members: false, report: true },
    });
  });

  it('saves under the name that the person types, from the menu More', async () => {
    api = fakeApi(channel('open', { 'GET /v1/playbooks': { playbooks: [] }, 'PUT /v1/playbooks/puppet-to-ansible': (c: Call) => ({ body: { name: 'puppet-to-ansible', ...(c.body as object), seats: [] } }) }));
    const el = mount(<Channel id="b1" />);
    await settle();
    more(el, 'Save as playbook');
    await settle();
    expect(dialog().querySelector('h2')!.textContent).toBe('Save as playbook');
    // The name reads as words, and the page shows the short name that it saves as.
    expect(fieldOf(dialog(), 'Name')!.value).toBe('Migrate puppet');
    expect(dialog().querySelector('#playbook-slug')!.textContent).toBe('It saves as migrate-puppet.');
    expect(dialog().textContent).toContain('It keeps the goal, 2 seats, the placement, the caps, and what the manager can do.');
    typeIn(fieldOf(dialog(), 'Name'), '???');
    click(keyNamed(dialog(), 'Save playbook'));
    expect(fieldOf(dialog(), 'Name')!.closest('label')!.querySelector('.field-error')!.textContent).toBe('A name needs at least one letter from a to z, or a digit.');
    typeIn(fieldOf(dialog(), 'Name'), 'Puppet To Ansible');
    expect(dialog().querySelector('#playbook-slug')!.textContent).toBe('It saves as puppet-to-ansible.');
    click(keyNamed(dialog(), 'Save playbook'));
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT' && c.path.startsWith('/v1/playbooks/'))!;
    expect(put.path).toBe('/v1/playbooks/puppet-to-ansible');
    expect(put.body).toEqual(playbookBodyOf(B, MEMBERS));
    // The front refuses an unknown field, so the seats go as seats and never as members.
    expect('members' in (put.body as object)).toBe(false);
    expect(dialog()).toBeNull();
    expect(document.activeElement!.getAttribute('aria-label')).toBe('More');
    // A short notice says that it worked.
    expect(currentSaid()).toBe('Saved the playbook Puppet to ansible.');
  });

  it('replaces a playbook of the same name with the revision that it read, and says when it changed in the meantime', async () => {
    api = fakeApi(channel('open', { 'GET /v1/playbooks': LIST, 'PUT /v1/playbooks/migrate-puppet': () => ({ status: 409, body: { detail: 'the playbook changed' } }) }));
    const el = mount(<Channel id="b1" />);
    await settle();
    more(el, 'Save as playbook');
    await settle();
    expect(dialog().textContent).toContain('A playbook of this name exists. Saving replaces it.');
    click(keyNamed(dialog(), 'Save playbook'));
    await settle();
    expect((api.calls.find((c) => c.method === 'PUT' && c.path === '/v1/playbooks/migrate-puppet')!.body as { revision: number }).revision).toBe(4);
    expect(fieldOf(dialog(), 'Name')!.closest('label')!.querySelector('.field-error')!.textContent).toBe('This playbook changed since you opened it. Try again.');
  });
});

describe('Make this a duty from a bridge', () => {
  it('opens New duty that posts in an open bridge, with the agent of its first seat', async () => {
    api = fakeApi(channel('open'));
    const el = mount(<Channel id="b1" />);
    await settle();
    more(el, 'Make this a duty');
    expect(location.hash).toBe('#duties/new?agent=migrator&do=post&bridge=b1');
  });

  it('saves a closed bridge as a playbook first, then opens New duty that opens a bridge from it', async () => {
    api = fakeApi(channel('closed', { 'GET /v1/playbooks': { playbooks: [] }, 'PUT /v1/playbooks/migrate-puppet': (c: Call) => ({ body: { name: 'migrate-puppet', ...(c.body as object) } }) }));
    const el = mount(<Channel id="b1" />);
    await settle();
    more(el, 'Make this a duty');
    await settle();
    expect(location.hash).toBe('#bridge/b1');
    expect(keyNamed(dialog(), 'Save and make a duty')).toBeTruthy();
    click(keyNamed(dialog(), 'Save and make a duty'));
    await settle();
    expect(api.calls.some((c) => c.method === 'PUT' && c.path === '/v1/playbooks/migrate-puppet')).toBe(true);
    expect(location.hash).toBe('#duties/new?agent=migrator&do=open&playbook=migrate-puppet');
  });
});

describe('New bridge', () => {
  it('starts from a playbook: the goal, the seats, the placement, the caps, and what the manager can do', async () => {
    location.hash = '#new';
    api = fakeApi({
      'GET /v1/playbooks': { playbooks: [{ name: 'weekly-patching', goal: 'Patch the lab hosts and report.', placement: 'queue', seats: [{ handle: 'patcher', agent: 'migrator', task: 'Patch.' }], revision: 1 }] },
      'GET /v1/playbooks/weekly-patching': {
        name: 'weekly-patching',
        goal: 'Patch the lab hosts and report.',
        placement: 'queue',
        seats: [
          { handle: 'patcher', agent: 'migrator', task: 'Patch each host.' },
          { handle: 'checker', agent: 'reviewer', task: 'Check the hosts.' },
        ],
        caps: { maxMessages: 120, maxTurns: 300 },
        delegation: { approve: true, report: false },
        revision: 1,
      },
      'POST /v1/bridges': (c: Call) => ({ body: { ...B, id: 'b9', title: (c.body as { title: string }).title } }),
    });
    const el = mount(<NewBridge />);
    await settle();
    const pick = fieldOf(el, 'Start from a playbook') as unknown as HTMLSelectElement;
    expect([...pick.options].map((o) => o.text)).toEqual(['No playbook', 'Weekly patching: Patch the lab hosts and report.']);
    act(() => {
      pick.value = 'weekly-patching';
      pick.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect((fieldOf(el, 'What is the job?') as unknown as HTMLTextAreaElement).value).toBe('Patch the lab hosts and report.');
    expect([...el.querySelectorAll('.seat .t-sub')].map((x) => x.textContent)).toEqual(['patcher', 'checker']);
    expect((el.querySelector('input[aria-label="Task of checker"]') as HTMLInputElement).value).toBe('Check the hosts.');
    expect(fieldOf(el, 'Most messages')!.value).toBe('120');
    expect(fieldOf(el, 'Most turns')!.value).toBe('300');
    const checks = [...el.querySelectorAll<HTMLInputElement>('details.advanced label.check input')].map((i) => [i.closest('label')!.textContent, i.checked]);
    expect(checks).toEqual([
      ['Decide for members', true],
      ['Change the budgets of members', false],
      ['Add and remove members', false],
      ['Write a report on close', false],
    ]);
    click(keyNamed(el, 'Open bridge'));
    await settle();
    const post = api.calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      title: 'Patch the lab hosts and report',
      goal: 'Patch the lab hosts and report.',
      placement: 'queue',
      members: [
        { handle: 'patcher', agent: 'migrator', task: 'Patch each host.' },
        { handle: 'checker', agent: 'reviewer', task: 'Check the hosts.' },
      ],
      delegation: { approve: true, budget: false, members: false, report: false },
      caps: { maxMessages: 120, maxTurns: 300 },
    });
  });

  it('shows no picker to a person without a playbook', async () => {
    location.hash = '#new';
    api = fakeApi({ 'GET /v1/playbooks': { playbooks: [] } });
    const el = mount(<NewBridge />);
    await settle();
    expect(fieldOf(el, 'Start from a playbook')).toBeNull();
  });
});
