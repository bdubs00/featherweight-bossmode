import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetManagerRun } from '../state/actions';
import { managerRunOf } from '../state/reducer';
import type { BossConfig, Run } from '../api/types';
import { conversationsOf, FIND_PAST_FROM, PastConversations } from './History';
import { Manager } from './Manager';
import { AgentChat } from './Fleet';
import { click, fakeApi, keyNamed, mount, problem, settle, typeIn, unmountAll } from './testkit-c';

const ME = 'alice@example.com';
const day = (d: number, h = 9) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const conv = (id: string, extra: Partial<Run> = {}): Run => ({ id, agent: 'manager', state: 'completed', seq: 3, principal: ME, input: 'Question ' + id, createdAt: day(20), updatedAt: day(20), ...extra });
const CONFIG: BossConfig = { manager: { agent: 'manager', member: 'default/manager-0', run: 'run-new' }, placement: 'queue', maxMembers: 16 };

let api: ReturnType<typeof fakeApi> | null = null;
beforeEach(() => {
  sessionStorage.clear();
  forgetManagerRun();
  act(() => {
    store.dispatch({ type: 'config', config: CONFIG });
    store.dispatch({ type: 'me', me: { principal: { subject: ME }, roles: {}, admin: false, canCreate: true } });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
  api = null;
});

/** listing answers GET /v1/fleet/runs with runs, and the rest of a conversation with nothing new. */
const listing = (runs: Run[]) => ({
  'GET /v1/fleet/runs': { runs },
  'GET /v1/runs/run-new/transcript': { run: conv('run-new'), items: [], next: 0, prev: 0 },
  'GET /v1/runs/run-old/transcript': { run: conv('run-old'), items: [], next: 0, prev: 0 },
  'GET /v1/runs/run-new': conv('run-new'),
  'GET /v1/runs/run-old': conv('run-old'),
  'GET /v1/runs/run-new/result': {},
  'GET /v1/runs/run-old/result': {},
  'GET /v1/tools': { tools: [] },
});

const dialog = () => document.querySelector('dialog.past-dialog') as HTMLDialogElement | null;
const rowTitles = () => [...document.querySelectorAll('dialog.past-dialog .past-row .brow-title')].map((x) => x.textContent);

describe('the past conversations', () => {
  it('keep the top-level runs of the agent that the person started outside a bridge, newest first', () => {
    const runs: Run[] = [
      conv('a', { createdAt: day(18) }),
      conv('b', { createdAt: day(21) }),
      conv('other-agent', { agent: 'migrator' }),
      conv('child', { parent: 'a' }),
      conv('other-person', { principal: 'bob@example.com' }),
      conv('bridge', { metadata: { 'fw.batch': 'bridge:01abc' } }),
      conv('internal', { metadata: { 'workbench.internal': 'duty-verdict:x' } }),
      conv('quick', { metadata: { 'fw.view': 'quickchat' } }),
      conv('duty', { createdAt: day(19), metadata: { 'fw.batch': 'duty:daily' } }),
    ];
    expect(conversationsOf(runs, 'manager', ME).map((r) => r.id)).toEqual(['b', 'duty', 'a']);
  });

  it('open from the Manager screen, mark the open one, and open a pick there', async () => {
    api = fakeApi(listing([conv('run-new', { title: 'Plan the k3s upgrade', createdAt: day(22) }), conv('run-old', { title: 'Which hosts run Proxmox?', createdAt: day(20) })]));
    const el = mount(<Manager />);
    await settle();
    expect(managerRunOf(store.get())).toBe('run-new');
    click(el.querySelector('button[aria-label="Past conversations"]'));
    await settle();
    expect(dialog()).not.toBeNull();
    expect(api.calls.some((c) => c.path === '/v1/fleet/runs?agent=manager&principal=alice%40example.com&limit=200')).toBe(true);
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Past conversations');
    expect(dialog()!.textContent).toContain('Your conversations with the manager');
    expect(rowTitles()).toEqual(['Plan the k3s upgrade', 'Which hosts run Proxmox?']);
    const open = dialog()!.querySelector('.past-row[aria-current="true"] .brow-title')!;
    expect(open.textContent).toBe('Plan the k3s upgrade');
    click([...document.querySelectorAll('dialog.past-dialog .past-row')][1]);
    await settle();
    expect(dialog()).toBeNull();
    expect(managerRunOf(store.get())).toBe('run-old');
  });

  it('close with Close and with Escape, and pick nothing', async () => {
    api = fakeApi(listing([conv('run-new')]));
    const el = mount(<Manager />);
    await settle();
    const key = el.querySelector('button[aria-label="Past conversations"]');
    click(key);
    await settle();
    click(keyNamed(dialog()!, 'Close'));
    expect(dialog()).toBeNull();
    click(key);
    await settle();
    act(() => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(managerRunOf(store.get())).toBe('run-new');
  });

  it('say so when there is none, and when the workbench refuses the list', async () => {
    api = fakeApi({ 'GET /v1/fleet/runs': { runs: [] } });
    mount(<PastConversations agent="reviewer" current="" onPick={() => {}} onClose={() => {}} />);
    await settle();
    expect(dialog()!.textContent).toContain('No conversation with reviewer yet.');
    unmountAll();
    api.restore();
    api = fakeApi({ 'GET /v1/fleet/runs': () => problem(503, 'The fleet view is not ready.') });
    mount(<PastConversations agent="reviewer" current="" onPick={() => {}} onClose={() => {}} />);
    await settle();
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toBe('The fleet view is not ready.');
  });

  it('offer a field to find one in a long list', async () => {
    const many = Array.from({ length: FIND_PAST_FROM + 1 }, (_, i) => conv('r' + i, { agent: 'reviewer', title: i === 4 ? 'Review the logrotate role' : 'Check run ' + i, createdAt: day(1 + i) }));
    api = fakeApi({ 'GET /v1/fleet/runs': { runs: many } });
    const pick = vi.fn();
    mount(<PastConversations agent="reviewer" current="" onPick={pick} onClose={() => {}} />);
    await settle();
    const field = dialog()!.querySelector('input[type="search"]');
    expect(field).not.toBeNull();
    typeIn(field, 'logrotate');
    expect(rowTitles()).toEqual(['Review the logrotate role']);
    click(dialog()!.querySelector('.past-row'));
    expect(pick).toHaveBeenCalledWith(expect.objectContaining({ id: 'r4' }));
  });
});

describe('the conversation with an agent', () => {
  it('starts a new conversation, and opens a past one that the tab remembers', async () => {
    sessionStorage.setItem('fw.bossmode.agentrun.reviewer', 'run-new');
    const runs = [conv('run-new', { agent: 'reviewer', title: 'Now', createdAt: day(22) }), conv('run-old', { agent: 'reviewer', title: 'Before', createdAt: day(20) })];
    api = fakeApi({ ...listing(runs), 'GET /v1/runs/run-new': runs[0], 'GET /v1/runs/run-old': runs[1] });
    const el = mount(<AgentChat agent="reviewer" />);
    await settle();
    const fresh = keyNamed(el, 'New conversation')!;
    expect(fresh.hasAttribute('disabled')).toBe(false);
    click(fresh);
    expect(sessionStorage.getItem('fw.bossmode.agentrun.reviewer')).toBeNull();
    expect(keyNamed(el, 'New conversation')!.hasAttribute('disabled')).toBe(true);
    click(el.querySelector('button[aria-label="Past conversations"]'));
    await settle();
    expect(rowTitles()).toEqual(['Now', 'Before']);
    click([...document.querySelectorAll('dialog.past-dialog .past-row')][1]);
    await settle();
    expect(dialog()).toBeNull();
    expect(sessionStorage.getItem('fw.bossmode.agentrun.reviewer')).toBe('run-old');
  });
});
