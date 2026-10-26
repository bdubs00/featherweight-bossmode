import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Run } from '../api/types';
import { store } from '../state/store';
import { closed, forgetManagerRun } from '../state/actions';
import { ARCHIVED_LINE, works } from '../lib/chat';
import { runStatus } from '../lib/presence';
import { factsOf } from '../lib/status';
import { workersOf } from '../lib/workers';
import { AgentChat } from './Fleet';
import { ChatList, ChatMain, forgetChat } from './Chat';
import { Manager, ManagerList } from './Manager';
import { PastConversations } from './History';
import { at, fakeFetch, mount, seedFleet, unmountAll, type Call } from './testkit-b';
import { FLEET } from './testkit-b';

const ME = 'alice@example.com';
const REFUSAL = { status: 409, detail: 'The worker of this conversation was replaced, so the conversation is read-only. Start a new one.' };

/** An archived conversation with the manager, which still worked when its worker was replaced. */
const OLD: Run = { id: 'run-old', agent: 'manager', title: 'Which workers slept?', state: 'running', seq: 2, input: 'Which workers slept?', principal: ME, createdAt: at(1), updatedAt: at(2), member: 'default/boss-0', archived: true };
const NEW: Run = { id: 'run-new', agent: 'manager', state: 'queued', seq: 1, input: 'Again', principal: ME, createdAt: at(10), updatedAt: at(10), member: 'default/boss-0' };
/** The same conversation as the page read it before its worker was replaced. */
const STALE: Run = { ...OLD, id: 'run-stale', archived: undefined, seq: 1 };
const CHAT = { agent: 'chat', member: 'default/boss-0' };
const OLD_CHAT: Run = { ...OLD, id: 'run-chat-old', agent: 'chat', state: 'completed', output: 'A handler runs once.', metadata: { 'fw.view': 'quickchat' } };
const NEW_CHAT: Run = { ...NEW, id: 'run-chat-new', agent: 'chat', metadata: { 'fw.view': 'quickchat' } };

let calls: Call[] = [];
let staleReads = 0;
let restore = () => {};
const posts = () => calls.filter((c) => c.method === 'POST');

const items = (r: Run) => [{ seq: 1, time: at(1), kind: 'user', text: r.input, who: ME }];

beforeEach(() => {
  staleReads = 0;
  forgetManagerRun();
  forgetChat();
  try {
    sessionStorage.clear();
  } catch {
    // No storage in this run.
  }
  const f = fakeFetch([
    ['GET', /^\/v1\/fleet\/runs\?/, () => ({ runs: [OLD, OLD_CHAT], total: 2 })],
    ['POST', /^\/v1\/runs\?member=/, (b) => ((b as { agent: string }).agent === 'chat' ? NEW_CHAT : NEW)],
    ['POST', /^\/v1\/runs\/run-[a-z-]+\/messages$/, () => new Response(JSON.stringify(REFUSAL), { status: 409, headers: { 'Content-Type': 'application/problem+json' } })],
    ['GET', /^\/v1\/runs\/run-old$/, () => OLD],
    ['GET', /^\/v1\/runs\/run-old\/transcript/, () => ({ run: OLD, items: items(OLD), next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-new$/, () => NEW],
    ['GET', /^\/v1\/runs\/run-new\/transcript/, () => ({ run: NEW, items: items(NEW), next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-chat-old$/, () => OLD_CHAT],
    ['GET', /^\/v1\/runs\/run-chat-old\/transcript/, () => ({ run: OLD_CHAT, items: items(OLD_CHAT), next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-chat-new$/, () => NEW_CHAT],
    ['GET', /^\/v1\/runs\/run-chat-new\/transcript/, () => ({ run: NEW_CHAT, items: items(NEW_CHAT), next: 0, prev: 0 })],
    // A read of run-stale finds it on its worker until a message meets the 409, and then in the archive.
    ['GET', /^\/v1\/runs\/run-stale$/, () => (++staleReads > 0 && posts().some((c) => c.path === '/v1/runs/run-stale/messages') ? { ...OLD, id: 'run-stale' } : STALE)],
    ['GET', /^\/v1\/runs\/run-stale\/transcript/, () => ({ run: STALE, items: items(STALE), next: 0, prev: 0 })],
    ['GET', /^\/v1\/tools$/, () => ({ tools: [] })],
  ]);
  calls = f.calls;
  restore = f.restore;
  seedFleet();
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: ME, name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'config', config: { manager: { agent: 'manager', member: 'default/boss-0', run: 'run-old' }, placement: 'queue', maxMembers: 16, chat: CHAT } });
  });
});

afterEach(() => {
  unmountAll();
  restore();
  act(() => store.dispatch({ type: 'config', config: null }));
});

const send = (el: HTMLElement, v: string) => {
  const box = el.querySelector('#composer') as HTMLTextAreaElement;
  act(() => {
    box.value = v;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  });
};

describe('a run of the archive', () => {
  it('works no more, says ended while it had not finished, and keeps no worker busy', () => {
    expect(works(OLD)).toBe(false);
    expect(closed(OLD)).toBe(true);
    expect(closed({ ...OLD, archived: false })).toBe(false);
    expect(runStatus(OLD)).toEqual({ word: 'ended', tone: 'grey', label: 'Its worker was replaced. You can read it.' });
    // A run that finished keeps the word of its state.
    expect(runStatus({ ...OLD, state: 'completed', output: 'Two.' }).word).toBe('answered');
    expect(runStatus({ ...OLD, state: 'failed' }).word).toBe('failed');
    // A run on crew-0 keeps it busy, and the same run from the archive does not.
    const held = { ...OLD, agent: 'migrator', member: 'default/crew-0', archived: false };
    expect(workersOf(factsOf(FLEET, { [held.id]: held }, true), 'migrator').busy).toBe(1);
    expect(workersOf(factsOf(FLEET, { [held.id]: { ...held, archived: true } }, true), 'migrator').busy).toBe(0);
  });
});

describe('an archived conversation with the manager', () => {
  it('shows in the list, reads as closed, and shows the line of a replaced worker', async () => {
    const list = mount(<ManagerList />);
    await vi.waitFor(() => expect(list.querySelectorAll('.chat-row').length).toBe(1));
    expect(list.querySelector('.chat-row')!.getAttribute('aria-label')).toMatch(/^Which workers slept\?, closed, (\d+ (minute|hour|day)s? ago|yesterday|just now)$/);
    const el = mount(<Manager />);
    await vi.waitFor(() => expect(el.textContent).toContain(ARCHIVED_LINE));
    // The run worked when its worker went, and nothing works now.
    expect(el.querySelector('[role="status"] .status')).toBeNull();
  });

  it('starts a new conversation with the next message and never sends to the archived run', async () => {
    const el = mount(<Manager />);
    await vi.waitFor(() => expect(el.textContent).toContain(ARCHIVED_LINE));
    send(el, 'Again');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0].path).toBe('/v1/runs?member=default%2Fboss-0');
    expect(calls.some((c) => c.path === '/v1/runs/run-old/messages')).toBe(false);
    // The new conversation takes up the archived one: the server puts a summary of it in front of the message.
    expect((posts()[0].body as { continues?: string }).continues).toBe('run-old');
  });

  it('starts the new conversation without continues on a server that does not know the field', async () => {
    restore();
    let tries = 0;
    const f = fakeFetch([
      ['GET', /^\/v1\/fleet\/runs\?/, () => ({ runs: [OLD], total: 1 })],
      [
        'POST',
        /^\/v1\/runs\?member=/,
        (b) =>
          ++tries === 1 && (b as { continues?: string }).continues
            ? new Response(JSON.stringify({ status: 400, detail: 'the body is not valid: json: unknown field "continues"' }), { status: 400, headers: { 'Content-Type': 'application/problem+json' } })
            : NEW,
      ],
      ['GET', /^\/v1\/runs\/run-old$/, () => OLD],
      ['GET', /^\/v1\/runs\/run-old\/transcript/, () => ({ run: OLD, items: items(OLD), next: 0, prev: 0 })],
      ['GET', /^\/v1\/runs\/run-new$/, () => NEW],
      ['GET', /^\/v1\/runs\/run-new\/transcript/, () => ({ run: NEW, items: items(NEW), next: 0, prev: 0 })],
      ['GET', /^\/v1\/tools$/, () => ({ tools: [] })],
    ]);
    calls = f.calls;
    restore = f.restore;
    const el = mount(<Manager />);
    await vi.waitFor(() => expect(el.textContent).toContain(ARCHIVED_LINE));
    send(el, 'Again');
    await vi.waitFor(() => expect(posts().length).toBe(2));
    expect(posts().map((c) => (c.body as { continues?: string }).continues)).toEqual(['run-old', undefined]);
  });
});

describe('an archived conversation with an agent', () => {
  it('shows the line, and the next message starts a new conversation', async () => {
    const el = mount(<AgentChat agent="manager" />);
    await vi.waitFor(() => expect(el.textContent).toContain(ARCHIVED_LINE));
    send(el, 'Again');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0].path).toBe('/v1/runs?member=default%2Fboss-0');
    expect((posts()[0].body as { continues?: string }).continues).toBe('run-old');
    await vi.waitFor(() => expect(el.textContent).not.toContain(ARCHIVED_LINE));
  });

  it('starts a new conversation when a message answers 409 and the run reads as archived', async () => {
    act(() => store.dispatch({ type: 'config', config: { manager: { agent: 'manager', member: 'default/boss-0', run: 'run-stale' }, placement: 'queue', maxMembers: 16, chat: CHAT } }));
    // The list of the person holds the conversation, so the page opens it as the newest.
    act(() => store.dispatch({ type: 'manager-chats', runs: [OLD, STALE] }));
    const el = mount(<AgentChat agent="manager" />);
    await vi.waitFor(() => expect(el.querySelector('.thread')!.textContent).toContain('Which workers slept?'));
    send(el, 'Again');
    await vi.waitFor(() => expect(posts().length).toBe(2));
    expect(posts().map((c) => c.path)).toEqual(['/v1/runs/run-stale/messages', '/v1/runs?member=default%2Fboss-0']);
  });

  it('lists the archived conversation in Past conversations', async () => {
    const el = mount(<PastConversations agent="manager" current="" onPick={() => {}} onClose={() => {}} />);
    await vi.waitFor(() => expect(document.querySelectorAll('.past-row').length).toBe(1));
    expect(document.querySelector('.past-row')!.getAttribute('aria-label')).toContain('closed');
    expect(el).toBeDefined();
  });
});

describe('an archived quick chat', () => {
  it('shows in the history, shows the line, and the next message starts a new chat', async () => {
    const list = mount(<ChatList />);
    await vi.waitFor(() => expect(list.querySelectorAll('.chat-row').length).toBe(1));
    const el = mount(<ChatMain run="run-chat-old" />);
    await vi.waitFor(() => expect(el.textContent).toContain(ARCHIVED_LINE));
    send(el, 'Again');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0].path).toBe('/v1/runs?member=default%2Fboss-0');
    expect((posts()[0].body as { agent: string }).agent).toBe('chat');
    expect((posts()[0].body as { continues?: string }).continues).toBe('run-chat-old');
  });
});
