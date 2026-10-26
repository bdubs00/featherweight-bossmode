import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { forgetManagerRun } from '../state/actions';
import { managerRunOf } from '../state/reducer';
import type { BossConfig, Run } from '../api/types';
import { NO_PATCH, conversationsOf, FIND_PAST_FROM, PastConversations, patchConversation } from './History';
import { Manager, ManagerList } from './Manager';
import { AgentChat } from './Fleet';
import { click, fakeApi, keyNamed, mount, problem, settle, typeIn, unmountAll } from './testkit-c';
import { clearNotice, currentSaid, undoSaid } from './notice';

const ME = 'alice@example.com';
const day = (d: number, h = 9) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const conv = (id: string, extra: Partial<Run> = {}): Run => ({ id, agent: 'manager', state: 'completed', seq: 3, principal: ME, input: 'Question ' + id, createdAt: day(20), updatedAt: day(20), ...extra });
const CONFIG: BossConfig = { manager: { agent: 'manager', member: 'default/manager-0', run: 'run-new' }, placement: 'queue', maxMembers: 16 };

let api: ReturnType<typeof fakeApi> | null = null;
beforeEach(() => {
  sessionStorage.clear();
  forgetManagerRun();
  // A name or a deletion of an earlier test stays in the store, so each test starts without them.
  act(() => {
    for (const r of Object.values(store.get().runs)) if (r.myTitle) store.dispatch({ type: 'run', run: { ...r, myTitle: '' } });
  });
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
      conv('verdict', { metadata: { 'workbench.dutyVerdict': 'run-1/ap-1' } }),
      // A decision of a duty whose run lost its metadata, as a run of the archive can.
      conv('bare-verdict', { title: 'Decide for the duty away', input: 'You decide one approval for the duty away while its owner token is away.', archived: true }),
      conv('quick', { metadata: { 'fw.view': 'quickchat' } }),
      conv('duty', { createdAt: day(19), metadata: { 'fw.batch': 'duty:daily' } }),
    ];
    expect(conversationsOf(runs, 'manager', ME).map((r) => r.id)).toEqual(['b', 'duty', 'a']);
  });

  it('fill the list of the Manager place, newest first, with a link each and the open one marked', async () => {
    api = fakeApi(listing([conv('run-new', { title: 'Plan the k3s upgrade', createdAt: day(22) }), conv('run-old', { title: 'Which hosts run Proxmox?', createdAt: day(20) }), conv('run-bridge', { metadata: { 'fw.batch': 'bridge:01x' } })]));
    let el = mount(<ManagerList />);
    await settle();
    expect(api.calls.some((c) => c.path === '/v1/fleet/runs?agent=manager&principal=alice%40example.com&limit=200&hidden=true')).toBe(true);
    expect(el.querySelector('#manager-list-title')!.textContent).toContain('Manager');
    expect([...el.querySelectorAll('.chip .sr')].map((x) => x.textContent)).toEqual(['2 conversations']);
    const rows = [...el.querySelectorAll('a.chat-row')];
    expect(rows.map((a) => a.querySelector('.brow-title')!.textContent)).toEqual(['Plan the k3s upgrade', 'Which hosts run Proxmox?']);
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(['#manager/run-new', '#manager/run-old']);
    // Without an address the newest conversation is the open one.
    expect(el.querySelector('a.chat-row[aria-current="page"]')!.getAttribute('href')).toBe('#manager/run-new');
    expect(keyNamed(el, 'New')!.getAttribute('href')).toBe('#manager/new');
    unmountAll();
    el = mount(<ManagerList run="run-old" />);
    await settle();
    expect(el.querySelector('a.chat-row[aria-current="page"]')!.getAttribute('href')).toBe('#manager/run-old');
    unmountAll();
    el = mount(<ManagerList fresh />);
    await settle();
    expect(el.querySelector('a.chat-row[aria-current="page"]')).toBeNull();
  });

  it('show the name that the person gave a conversation, and leave out a deleted one', async () => {
    api = fakeApi(listing([conv('run-new', { title: 'Plan the k3s upgrade', myTitle: 'k3s plan', createdAt: day(22) }), conv('run-old', { title: 'Old' }), conv('run-gone', { title: 'Gone', hidden: true })]));
    const el = mount(<ManagerList />);
    await settle();
    expect([...el.querySelectorAll('a.chat-row .brow-title')].map((x) => x.textContent)).toEqual(['k3s plan', 'Old']);
  });

  it('rename a conversation from the menu of its row, in one line of at most 100 characters', async () => {
    api = fakeApi({ ...listing([conv('run-ren', { title: 'Rename me' })]), 'PATCH /v1/conversations/run-ren': () => ({ status: 204 }) });
    const el = mount(<ManagerList run="run-new" />);
    await settle();
    const titles = () => [...el.querySelectorAll('a.chat-row .brow-title')].map((x) => x.textContent);
    const row = [...el.querySelectorAll('.chat-item')].find((x) => x.textContent!.includes('Rename me'))!;
    click(row.querySelector('button[aria-label="More for Rename me"]'));
    click([...row.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === 'Rename'));
    const dialog = document.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Rename the conversation');
    const field = dialog.querySelector('input') as HTMLInputElement;
    expect(field.value).toBe('Rename me');
    expect(field.maxLength).toBe(100);
    typeIn(field, '  Proxmox   hosts ');
    click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Rename'));
    await settle();
    expect(api.calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/v1/conversations/run-ren', body: { title: 'Proxmox hosts' } });
    expect(titles()).toContain('Proxmox hosts');
    expect(titles()).not.toContain('Rename me');
    // A later read of the run alone keeps the name of the person.
    act(() => store.dispatch({ type: 'run', run: conv('run-ren', { title: 'Rename me', seq: 4 }) }));
    expect(titles()).toContain('Proxmox hosts');
  });

  it('delete a conversation from the lists after a confirmation that says what keeps it', async () => {
    api = fakeApi({ ...listing([conv('run-del', { title: 'Delete me' })]), 'PATCH /v1/conversations/run-del': () => ({ status: 204 }) });
    const el = mount(<ManagerList run="run-new" />);
    await settle();
    const row = [...el.querySelectorAll('.chat-item')].find((x) => x.textContent!.includes('Delete me'))!;
    click(row.querySelector('button[aria-label="More for Delete me"]'));
    click([...row.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === 'Delete'));
    const dialog = document.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Delete this conversation?');
    expect(dialog.textContent).toContain('\u201cDelete me\u201d leaves your lists. An admin can still read it.');
    click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Delete'));
    await settle();
    expect(api.calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/v1/conversations/run-del', body: { hidden: true } });
    expect(el.textContent).not.toContain('Delete me');
    // The notice takes the delete back: the conversation comes back to the list.
    expect(currentSaid()).toBe('Deleted.');
    act(() => undoSaid());
    await settle();
    expect(api.calls.filter((c) => c.method === 'PATCH').map((c) => c.body)).toEqual([{ hidden: true }, { hidden: false }]);
    expect(el.textContent).toContain('Delete me');
  });

  it('say that a conversation opened by its link is deleted, and put it back', async () => {
    api = fakeApi({ ...listing([conv('run-new')]), 'GET /v1/runs/run-hid': conv('run-hid'), 'GET /v1/runs/run-hid/transcript': { run: conv('run-hid'), items: [], next: 0, prev: 0 }, 'GET /v1/runs/run-hid/result': {}, 'PATCH /v1/conversations/run-hid': () => ({ status: 204 }) });
    // A list with the deleted ones marks it hidden.
    act(() => store.dispatch({ type: 'manager-chats', runs: [conv('run-new'), conv('run-hid', { hidden: true })] }));
    const el = mount(<Manager run="run-hid" />);
    await settle();
    expect(el.querySelector('.deleted-line')!.textContent).toContain('You deleted this conversation.');
    click(keyNamed(el, 'Put it back in my list'));
    await settle();
    expect(api.calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/v1/conversations/run-hid', body: { hidden: false } });
    expect(el.querySelector('.deleted-line')).toBeNull();
  });

  it('never open a deleted conversation as the newest one, though the settings name it', async () => {
    act(() => store.dispatch({ type: 'config', config: { ...CONFIG, manager: { ...CONFIG.manager!, run: 'run-gone2' } } }));
    act(() => store.dispatch({ type: 'manager-chats', runs: [conv('run-new'), conv('run-gone2', { hidden: true })] }));
    expect(managerRunOf(store.get())).toBe('');
    // A server without hidden lists leaves the deleted one out, which says the same.
    act(() => store.dispatch({ type: 'manager-chats', runs: [conv('run-new')] }));
    act(() => store.dispatch({ type: 'config', config: { ...CONFIG, manager: { ...CONFIG.manager!, run: 'run-gone3' } } }));
    expect(managerRunOf(store.get())).toBe('');
    act(() => store.dispatch({ type: 'config', config: CONFIG }));
    expect(managerRunOf(store.get())).toBe('run-new');
  });

  it('say so when the server cannot rename a conversation yet, and keep the row', async () => {
    api = fakeApi({ ...listing([conv('run-np', { title: 'No route here' })]), 'PATCH /v1/conversations/run-np': () => problem(404, 'no route /v1/conversations/run-np') });
    const el = mount(<ManagerList />);
    await settle();
    const row = [...el.querySelectorAll('.chat-item')].find((x) => x.textContent!.includes('No route here'))!;
    click(row.querySelector('button[aria-label="More for No route here"]'));
    click([...row.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === 'Delete'));
    click([...document.querySelectorAll('dialog.confirm button')].find((b) => b.textContent === 'Delete'));
    await settle();
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(true);
    expect(el.textContent).toContain('No route here');
    clearNotice();
    // The router of a server without the route answers 404 with no problem, or 405, and either reads as one sentence.
    await expect(patchConversation(conv('run-np'), { hidden: true })).rejects.toThrow(NO_PATCH);
    api.restore();
    api = fakeApi({ 'PATCH /v1/conversations/run-np': () => ({ status: 405 }) });
    await expect(patchConversation(conv('run-np'), { title: 'x' })).rejects.toThrow('This server cannot rename or delete a conversation yet.');
    // A 404 with a problem of its own, such as a run that the person cannot see, says its own sentence.
    api.restore();
    api = fakeApi({ 'PATCH /v1/conversations/run-np': () => problem(404, 'No run run-np is visible to you.') });
    await expect(patchConversation(conv('run-np'), { title: 'x' })).rejects.toThrow('No run run-np is visible to you.');
  });

  it('open the conversation of the address, and follow it up', async () => {
    api = fakeApi(listing([conv('run-new'), conv('run-old', { title: 'Which hosts run Proxmox?' })]));
    const el = mount(<Manager run="run-old" />);
    await settle();
    expect(managerRunOf(store.get())).toBe('run-old');
    // The run of the transcript has no title, so the header names its first message.
    expect(el.querySelector('#manager-title')!.textContent).toContain('Question run-old');
    expect(api.calls.some((c) => c.path.startsWith('/v1/runs/run-old/transcript'))).toBe(true);
    expect(api.calls.some((c) => c.path.startsWith('/v1/runs/run-new/transcript'))).toBe(false);
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
    const menu = () => {
      click(el.querySelector('.pane-head button[aria-label="More"]'));
      return [...document.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
    };
    let items = menu();
    expect(items.map((x) => x.textContent)).toEqual(['New conversation', 'Past conversations', 'Make this a duty']);
    click(items[0]);
    expect(sessionStorage.getItem('fw.bossmode.agentrun.reviewer')).toBeNull();
    // A new conversation has nothing to start again or to make a duty of.
    items = menu();
    expect(items.map((x) => x.textContent)).toEqual(['Past conversations']);
    click(items[0]);
    await settle();
    expect(rowTitles()).toEqual(['Now', 'Before']);
    click([...document.querySelectorAll('dialog.past-dialog .past-row')][1]);
    await settle();
    expect(dialog()).toBeNull();
    expect(sessionStorage.getItem('fw.bossmode.agentrun.reviewer')).toBe('run-old');
  });
});
