import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Run } from '../api/types';
import { store } from '../state/store';
import { ChatDetails, ChatList, ChatMain, forgetChat } from './Chat';
import { at, fakeFetch, mount, unmountAll, type Call } from './testkit-b';

let calls: Call[] = [];
let restore = () => {};

const ME = 'alice@example.com';
const CHAT = { agent: 'chat', member: 'default/boss-0' };
const NEW: Run = { id: 'run-chat-9', agent: 'chat', state: 'queued', seq: 1, input: 'How do I rotate the logs?', principal: ME, metadata: { 'fw.view': 'quickchat' }, createdAt: at(30), updatedAt: at(30), member: CHAT.member };
const OLD: Run = { id: 'run-chat-1', agent: 'chat', title: 'Summarize the notes', state: 'completed', seq: 4, input: 'Summarize the notes.', output: 'Three notes.', principal: ME, metadata: { 'fw.view': 'quickchat' }, createdAt: at(5), updatedAt: at(6), member: CHAT.member, usage: { inputTokens: 1000, outputTokens: 200, turns: 1, costUSD: 0.02 }, extraTools: ['web_fetch'], resolved: { model: 'model-large', tools: ['files', 'web_fetch'], skills: ['notes'] } };
const TOOLS = ['bash', 'files', 'web_fetch'].map((name) => ({ name, source: 'builtin', text: 'The tool ' + name + '.' }));

const configure = (chat: typeof CHAT | null) =>
  act(() => {
    store.dispatch({ type: 'me', me: { principal: { subject: ME, name: 'Alice' }, roles: {}, admin: false, canCreate: true } });
    store.dispatch({ type: 'config', config: { manager: null, placement: 'queue', maxMembers: 16, chat } });
    store.dispatch({
      type: 'skills',
      skills: {
        skills: [
          { name: 'notes', description: 'Write notes.', origin: 'local' },
          { name: 'plan', description: 'Plan a module.', origin: 'local', argumentHint: '<module>' },
        ],
      },
    });
  });

beforeEach(() => {
  forgetChat();
  const f = fakeFetch([
    ['GET', /^\/v1\/tools$/, () => ({ tools: TOOLS })],
    ['GET', /^\/v1\/agents\/chat$/, () => ({ name: 'chat', role: 'operator', tools: ['files'], skills: ['notes'] })],
    ['GET', /^\/v1\/agents\/chat\/skills$/, () => ({ agent: 'chat', allowlist: ['notes'], skills: [{ name: 'notes', description: 'Write notes.', origin: 'local' }] })],
    ['GET', /^\/v1\/fleet\/runs\?/, () => ({ runs: [OLD], total: 1 })],
    ['POST', /^\/v1\/runs\?member=/, () => NEW],
    ['GET', /^\/v1\/runs\/run-chat-9$/, () => NEW],
    ['GET', /^\/v1\/runs\/run-chat-9\/transcript/, () => ({ run: NEW, items: [{ seq: 1, time: at(30), kind: 'user', text: NEW.input, who: ME }], next: 0, prev: 0 })],
    ['GET', /^\/v1\/runs\/run-chat-1$/, () => OLD],
    ['GET', /^\/v1\/runs\/run-chat-1\/result$/, () => ({ runId: OLD.id, title: OLD.title, agent: 'chat', status: 'ready', started: at(5), changed: at(6) })],
    ['GET', /^\/v1\/runs\/run-chat-1\/transcript/, () => ({ run: OLD, items: [{ seq: 1, time: at(5), kind: 'user', text: OLD.input, who: ME }, { seq: 3, time: at(6), kind: 'assistant', text: 'Three notes.' }], next: 0, prev: 0 })],
    ['POST', /^\/v1\/runs\/run-chat-1\/messages$/, () => ({ run: 'run-chat-1', seq: 5 })],
    ['POST', /^\/v1\/bossmode\/runs\/run-chat-1\/skill$/, () => ({ ...OLD, state: 'running', seq: 6 })],
  ]);
  calls = f.calls;
  restore = f.restore;
  try {
    sessionStorage.clear();
  } catch {
    // No storage in this run.
  }
  location.hash = '';
});

afterEach(() => {
  unmountAll();
  restore();
  act(() => store.dispatch({ type: 'chats', runs: [] }));
});

const send = (box: HTMLTextAreaElement, v: string) => {
  act(() => {
    box.value = v;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => {
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
  });
};
const posts = () => calls.filter((c) => c.method === 'POST');
const chip = (el: HTMLElement, name: string) => [...el.querySelectorAll('.pick-chip')].find((l) => l.textContent!.trim() === name) as HTMLLabelElement;

describe('the Chat place', () => {
  it('says that no quick chat is set up, and names the setting behind the question mark', () => {
    configure(null);
    const el = mount(<ChatMain />);
    expect(el.textContent).toContain('No quick chat is set up.');
    const help = el.querySelector('button[aria-label="Where the quick chat is set up"]') as HTMLButtonElement;
    act(() => help.click());
    expect(el.textContent).toContain('workbench.bossmode.chat');
    expect(calls.some((c) => c.path.startsWith('/v1/tools') || c.path.startsWith('/v1/fleet/runs'))).toBe(false);
  });

  it('lists the history of the person, grouped by day, with the state and the time', async () => {
    configure(CHAT);
    const el = mount(<ChatList current="run-chat-1" />);
    await vi.waitFor(() => expect(el.querySelectorAll('.chat-row').length).toBe(1));
    expect(calls.find((c) => c.path.startsWith('/v1/fleet/runs'))!.path).toBe('/v1/fleet/runs?agent=chat&principal=alice%40example.com');
    const row = el.querySelector('.chat-row')!;
    expect(row.querySelector('.brow-title')!.textContent).toBe('Summarize the notes');
    expect(row.querySelector('.status-word')!.textContent).toBe('ready');
    expect(row.getAttribute('aria-current')).toBe('page');
    expect(row.getAttribute('href')).toBe('#chat/run-chat-1');
    expect(el.querySelector('.people-head')!.textContent).not.toBe('');
    expect(el.querySelector('header .chip .sr')!.textContent).toBe('1 chat');
  });

  it('starts a new chat with the picks of the person, and opens it', async () => {
    configure(CHAT);
    const el = mount(<ChatMain />);
    await vi.waitFor(() => expect(el.querySelectorAll('.pick-chip').length).toBe(5));
    // The picks start from the lists of the agent.
    expect(chip(el, 'files').querySelector('input')!.checked).toBe(true);
    expect(chip(el, 'bash').querySelector('input')!.checked).toBe(false);
    expect(chip(el, 'notes').querySelector('input')!.checked).toBe(true);
    expect(chip(el, 'plan').querySelector('input')!.checked).toBe(false);
    expect([...el.querySelectorAll('.pick-sec h2')].map((h) => h.textContent)).toEqual(['Tools', 'Skills']);
    act(() => chip(el, 'web_fetch').querySelector('input')!.click());
    act(() => chip(el, 'notes').querySelector('input')!.click());
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    expect(box.placeholder).toBe('Ask a question');
    send(box, 'How do I rotate the logs?');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toEqual({
      method: 'POST',
      path: '/v1/runs?member=default%2Fboss-0',
      body: { agent: 'chat', input: 'How do I rotate the logs?', profile: { tools: ['files', 'web_fetch'], skills: [] }, metadata: { 'fw.view': 'quickchat' } },
    });
    await vi.waitFor(() => expect(location.hash).toBe('#chat/run-chat-9'));
  });

  it('starts a new chat with the text of a slash command, because the chat has no run yet', async () => {
    configure(CHAT);
    const el = mount(<ChatMain />);
    await vi.waitFor(() => expect(el.querySelectorAll('.pick-chip').length).toBe(5));
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    send(box, '/notes the freeze');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0].path).toBe('/v1/runs?member=default%2Fboss-0');
    expect((posts()[0].body as { input: string }).input).toBe('/notes the freeze');
    expect(calls.some((c) => c.path.includes('/skill'))).toBe(false);
  });

  it('asks for a tool when the person turns every tool off', async () => {
    configure(CHAT);
    const el = mount(<ChatMain />);
    await vi.waitFor(() => expect(el.querySelectorAll('.pick-chip').length).toBe(5));
    act(() => chip(el, 'files').querySelector('input')!.click());
    send(el.querySelector('#composer') as HTMLTextAreaElement, 'Hello?');
    await vi.waitFor(() => expect(el.querySelector('.pick-sec [role="alert"]')).not.toBeNull());
    expect(el.querySelector('.pick-sec [role="alert"]')!.textContent).toBe('A chat needs at least one tool. Pick one.');
    expect(posts().length).toBe(0);
  });

  it('follows up in an open chat, and runs a skill for a slash command', async () => {
    configure(CHAT);
    act(() => store.dispatch({ type: 'run', run: OLD }));
    const el = mount(<ChatMain run="run-chat-1" />);
    await vi.waitFor(() => expect(el.querySelector('.thread')!.textContent).toContain('Three notes.'));
    expect(el.querySelector('h1')!.textContent).toBe('Summarize the notes');
    const box = el.querySelector('#composer') as HTMLTextAreaElement;
    send(box, 'And the fourth?');
    await vi.waitFor(() => expect(posts().length).toBe(1));
    expect(posts()[0]).toEqual({ method: 'POST', path: '/v1/runs/run-chat-1/messages', body: { content: 'And the fourth?' } });
    await vi.waitFor(() => expect(box.value).toBe(''));
    send(box, '/notes the freeze');
    await vi.waitFor(() => expect(posts().length).toBe(2));
    expect(posts()[1]).toEqual({ method: 'POST', path: '/v1/bossmode/runs/run-chat-1/skill', body: { name: 'notes', args: 'the freeze' } });
  });

  it('shows the tools and skills in use, an extra tool for this chat, the model, and the usage', () => {
    configure(CHAT);
    // The run finished after the skill of the test before.
    act(() => store.dispatch({ type: 'run', run: { ...OLD, seq: 10 } }));
    const el = mount(<ChatDetails run="run-chat-1" />);
    expect(el.querySelector('h2')!.textContent).toBe('This chat');
    const chips = [...el.querySelectorAll('.chat-chips .chip')].map((c) => c.textContent);
    expect(chips).toEqual(['files', 'web_fetchfor this chat', 'notes']);
    expect(el.querySelector('.chat-model')!.textContent).toBe('model-large');
    expect(el.querySelector('.today')!.textContent).toBe('1 turn1,200 tokens$0.02');
    expect([...el.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Rename');
  });
});
