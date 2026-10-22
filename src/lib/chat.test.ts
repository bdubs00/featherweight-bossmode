import { describe, expect, it } from 'vitest';
import type { Run, Tool } from '../api/types';
import { answerSeqs, chatTitle, defaultTools, findChats, historyGroups, isQuickChat, lastSeq, startBody, toggle, toolOn, usageParts, works } from './chat';

const run = (id: string, createdAt: string, extra: Partial<Run> = {}): Run => ({ id, agent: 'chat', state: 'completed', seq: 1, createdAt, updatedAt: createdAt, ...extra });
const local = (d: number, h: number) => new Date(2026, 9, 22 - d, h, 30).toISOString();

describe('the history of the quick chat', () => {
  const now = new Date(2026, 9, 22, 15, 0);

  it('groups the chats by the day they started, newest first, with Today, Yesterday, then the date', () => {
    const runs = [run('a', local(3, 9)), run('b', local(0, 14)), run('c', local(1, 8)), run('d', local(0, 9)), run('e', local(1, 20))];
    const groups = historyGroups(runs, now);
    expect(groups.map((g) => g.day)).toEqual(['Today', 'Yesterday', new Date(2026, 9, 19).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })]);
    expect(groups.map((g) => g.runs.map((r) => r.id))).toEqual([['b', 'd'], ['e', 'c'], ['a']]);
  });

  it('titles a chat by its run, else by the start of its first message', () => {
    expect(chatTitle({ title: 'Rotate the logs', input: 'x' })).toBe('Rotate the logs');
    expect(chatTitle({ input: 'How do I rotate the logs?\nMore lines.' })).toBe('How do I rotate the logs?');
    expect(chatTitle({})).toBe('Chat');
  });

  it('finds a chat by the words of its title', () => {
    const runs = [run('a', local(0, 9), { title: 'Rotate the logs of nginx' }), run('b', local(0, 9), { title: 'Release notes' })];
    expect(findChats(runs, 'nginx LOGS').map((r) => r.id)).toEqual(['a']);
    expect(findChats(runs, '  ')).toBe(runs);
  });

  it('knows a quick chat of the person by its agent, its person, and the mark of the page', () => {
    const r = run('a', local(0, 9), { principal: 'alice@example.com', metadata: { 'fw.view': 'quickchat' } });
    expect(isQuickChat(r, 'chat', 'alice@example.com')).toBe(true);
    expect(isQuickChat(r, 'chat', 'bob@example.com')).toBe(false);
    expect(isQuickChat({ ...r, metadata: {} }, 'chat', 'alice@example.com')).toBe(false);
    expect(isQuickChat(r, 'manager', 'alice@example.com')).toBe(false);
  });
});

describe('the picks of a new chat', () => {
  const tools: Tool[] = [
    { name: 'bash', source: 'builtin' },
    { name: 'files', source: 'builtin' },
    { name: 'pages_read', source: 'front' },
    { name: 'pages_write', source: 'front' },
    { name: 'create_issue', source: 'github' },
  ];

  it('turns on the tools that the list of the agent gives: a name, a server, or a glob', () => {
    expect(defaultTools(tools, ['files', 'front.pages_*'])).toEqual(['files', 'pages_read', 'pages_write']);
    expect(defaultTools(tools, ['github'])).toEqual(['create_issue']);
    expect(defaultTools(tools, ['github/*', 'bash'])).toEqual(['bash', 'create_issue']);
    // An empty list, no list, and * give every tool.
    expect(defaultTools(tools, [])).toHaveLength(5);
    expect(defaultTools(tools, null)).toHaveLength(5);
    expect(toolOn(['*'], tools[0])).toBe(true);
  });

  it('toggles a pick and keeps the order', () => {
    expect(toggle(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    expect(toggle(['a', 'b'], 'a', true)).toEqual(['a', 'b']);
    expect(toggle(['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
  });

  it('starts a chat with the picks as an inline profile and the mark of the page', () => {
    expect(startBody('chat', 'How do I rotate the logs?', { tools: ['files', 'web_fetch'], skills: [] })).toEqual({
      agent: 'chat',
      input: 'How do I rotate the logs?',
      profile: { tools: ['files', 'web_fetch'], skills: [] },
      metadata: { 'fw.view': 'quickchat' },
    });
    // A list that the page did not offer stays out, so the list of the agent holds.
    expect(startBody('chat', 'Hi', { skills: ['notes'] })).toEqual({ agent: 'chat', input: 'Hi', profile: { skills: ['notes'] }, metadata: { 'fw.view': 'quickchat' } });
    expect(startBody('chat', 'Hi', {})).toEqual({ agent: 'chat', input: 'Hi', metadata: { 'fw.view': 'quickchat' } });
  });
});

describe('the usage and the live answer', () => {
  it('words the turns, the tokens, and the cost, with so far while the run works', () => {
    const u = { inputTokens: 4200, outputTokens: 380, cacheReadTokens: 1000, turns: 2, costUSD: 0.031 };
    expect(usageParts(u, false)).toEqual([
      { n: '2', word: 'turns' },
      { n: '5,580', word: 'tokens' },
      { n: '$0.03', word: '' },
    ]);
    expect(usageParts({ turns: 1, costUSD: 0 }, true)).toEqual([
      { n: '1', word: 'turn' },
      { n: '$0.00', word: 'so far' },
    ]);
    expect(usageParts({ turns: 3 }, true)).toEqual([{ n: '3', word: 'turns so far' }]);
    expect(usageParts(undefined, true)).toEqual([]);
  });

  it('says whether a run works, and finds the answers and the newest seq of a transcript', () => {
    expect(works({ state: 'queued' })).toBe(true);
    expect(works({ state: 'running' })).toBe(true);
    expect(works({ state: 'input-required' })).toBe(false);
    expect(works(undefined)).toBe(false);
    const items = [
      { seq: 1, time: '', kind: 'user' as const },
      { seq: 2, time: '', kind: 'assistant' as const },
      { seq: 3, time: '', kind: 'tool' as const },
      { seq: 5, time: '', kind: 'assistant' as const },
    ];
    expect(answerSeqs(items)).toEqual([2, 5]);
    expect(lastSeq(items, { seq: 4 })).toBe(5);
    expect(lastSeq(items, { seq: 9 })).toBe(9);
    expect(lastSeq([], null)).toBe(0);
  });
});
