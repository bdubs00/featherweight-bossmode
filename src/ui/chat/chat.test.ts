// The pure parts of the chat-first page: its addresses, the one list of
// Needs you, the status of a channel, and the words of the page.

import { describe, expect, it } from 'vitest';
import type { Bridge, Member, WorkCard } from '../../api/types';
import type { InboxRow } from '../../state/inbox';
import { chatHref, focusOf, parseChat, type ChatRoute } from './route';
import { askWords, needsOf, type NeedsInput } from './needs';
import { channelRow, pageWords, peopleWords, sortChannels } from './channels';
import { handleFor } from './Members';
import { matches } from './TopBar';
import { lastWords } from './Sidebar';

describe('the addresses of the chat-first page', () => {
  it('reads and writes each route', () => {
    const routes: ChatRoute[] = [
      { view: 'home' },
      { view: 'channel', id: 'br-1', tab: 'posts' },
      { view: 'channel', id: 'br-1', tab: 'wiki' },
      { view: 'channel', id: 'br-1', tab: 'decisions' },
      { view: 'channel', id: 'br 2', tab: 'posts', members: true },
      { view: 'manager' },
      { view: 'manager', fresh: true },
      { view: 'manager', run: 'run-1' },
      { view: 'job', name: 'nightly-check' },
      { view: 'job', name: 'nightly-check', about: true },
      { view: 'run', id: 'run-9' },
      { view: 'agent', name: 'scribe' },
    ];
    for (const r of routes) expect(parseChat(chatHref(r))).toEqual(r);
  });
  it('leaves the addresses of the older places alone', () => {
    expect(parseChat('#work')).toBeNull();
    expect(parseChat('#bridge/br-1')).toBeNull();
    expect(parseChat('#pages/a.md')).toBeNull();
    expect(parseChat('')).toEqual({ view: 'home' });
  });
  it('names the pane that a phone shows', () => {
    expect(focusOf({ view: 'home' })).toBe('side');
    expect(focusOf({ view: 'channel', id: 'x', tab: 'posts' })).toBe('main');
    expect(focusOf({ view: 'channel', id: 'x', tab: 'posts', members: true })).toBe('right');
  });
});

const card = (over: Partial<WorkCard>): WorkCard => ({
  id: 'c',
  kind: 'conversation',
  title: 'A task',
  from: { kind: 'person', name: 'ann@example.com' },
  stage: 'needs-you',
  next: 'you',
  opened: '2026-10-28T10:00:00Z',
  since: '2026-10-28T10:00:00Z',
  agents: ['scribe'],
  parts: { total: 1 },
  links: {},
  costUSD: 0,
  ...over,
});

const row = (over: Partial<InboxRow>): InboxRow => ({ key: 'r', kind: 'decision', status: 'needs-you', bridge: '', bridgeTitle: '', at: '2026-10-28T10:00:00Z', ...over });

const input = (over: Partial<NeedsInput>): NeedsInput => ({
  cards: [],
  rows: [],
  waiting: [],
  agentName: (a) => a.charAt(0).toUpperCase() + a.slice(1),
  channelTitle: (id) => 'Channel ' + id,
  jobTitle: (n) => 'Job ' + n,
  ...over,
});

describe('Needs you', () => {
  it('gives one row per task, with the words of its decision', () => {
    const rows = needsOf(
      input({
        cards: [card({ id: 'a', links: { run: 'r1', approval: 'p1' } })],
        rows: [row({ key: 'd:r1/p1', run: 'r1', agent: 'scribe', handle: 'scribe', decision: { run: 'r1', id: 'p1', label: 'Allow', tool: 'bash', input: { command: 'make test' }, state: 'pending' } })],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('asks');
    expect(rows[0].head).toBe('scribe asks first');
    expect(rows[0].line).toContain('make test');
    expect(rows[0].href).toBe('#r/r1');
  });
  it('gives each wait of a channel its own row, and opens the decisions of the channel', () => {
    const rows = needsOf(
      input({
        cards: [card({ id: 'b', kind: 'bridge', links: { bridge: 'br-1', run: 'x', approval: 'zz' } })],
        rows: [row({ key: 'd:x/1', bridge: 'br-1', handle: 'one', decision: { run: 'x', id: '1', label: 'Allow', state: 'pending' } }), row({ key: 'q:br-1/7', kind: 'asked', bridge: 'br-1', handle: 'two' })],
      }),
    );
    expect(rows.map((r) => r.head).sort()).toEqual(['one asks first', 'two asks you']);
    expect(rows.find((r) => r.head === 'one asks first')!.href).toBe('#c/br-1/decisions');
    expect(rows.find((r) => r.head === 'two asks you')!.href).toBe('#c/br-1');
  });
  it('keeps a wait that no task names, a task that no row explains, and a note, newest first', () => {
    const rows = needsOf(
      input({
        cards: [card({ id: 'c', stage: 'review', links: { run: 'r2', duty: 'nightly' }, since: '2026-10-28T09:00:00Z' }), card({ id: 'd', stage: 'done', next: '' })],
        rows: [row({ key: 'u:paused/weekly', kind: 'duty-paused', status: 'limit', duty: 'weekly', reason: 'Three runs failed.', at: '2026-10-28T11:00:00Z' })],
        waiting: [{ id: 'k1', at: '2026-10-28T12:00:00Z', agent: 'scribe', what: 'learned', subject: {}, by: 'review', text: 'Use the full name.' }],
      }),
    );
    expect(rows.map((r) => r.kind)).toEqual(['suggestion', 'paused', 'check']);
    expect(rows[1].head).toBe('Job paused: Job weekly');
    expect(rows[2].head).toBe('Job ready to sign off');
    expect(rows[0].href).toBe('#a/scribe');
  });
  it('leaves out a row that needs nobody', () => {
    const rows = needsOf(input({ rows: [row({ key: 'm:br-1', kind: 'message', status: 'idle', bridge: 'br-1' })] }));
    expect(rows).toHaveLength(0);
  });
  it('says what a package call asks', () => {
    expect(askWords({ run: 'r', id: 'p', label: 'Allow', tool: 'env', input: { command: 'add', manager: 'tools', package: 'jq' }, state: 'pending' })).toBe('Add package jq?');
  });
});

describe('the words of the page', () => {
  it('says channel and agent for the words of the server', () => {
    expect(pageWords('When a bridge of the migrator closes.')).toBe('When a channel of the migrator closes.');
    expect(pageWords('Waiting for a worker')).toBe('Waiting to start');
    expect(pageWords('5 seats share 3 workers')).toBe('5 agents share 3 agents');
  });
  it('names the people of a channel', () => {
    expect(peopleWords('me@example.com', 'me@example.com')).toBe('you');
    expect(peopleWords('dana@example.com', 'me@example.com', 'Dana Reyes')).toBe('Dana, you');
  });
  it('finds by every word of a query', () => {
    expect(matches('Release notes for 2.4', 'notes 2.4')).toBe(true);
    expect(matches('Release notes for 2.4', 'notes 3')).toBe(false);
  });
  it('makes a free name for a new agent of a channel', () => {
    expect(handleFor('scribe', [])).toBe('scribe');
    expect(handleFor('scribe', ['scribe', 'scribe-2'])).toBe('scribe-3');
  });
  it('says the last result of a job', () => {
    expect(lastWords({ name: 'n', agent: 'a', when: {}, do: {}, limits: {}, state: { lastRun: { at: '', state: 'completed', verdict: 'accepted' } } } as never)).toBe('last accepted');
    expect(lastWords({ name: 'n', agent: 'a', when: {}, do: {}, limits: {} } as never)).toBe('no run yet');
  });
});

describe('a channel in the sidebar', () => {
  const b = (over: Partial<Bridge>): Bridge => ({
    id: 'br-1',
    title: 'A channel',
    goal: '',
    operator: 'me@example.com',
    state: 'open',
    placement: 'queue' as never,
    createdAt: '2026-10-28T08:00:00Z',
    closedAt: null,
    delegation: { approve: false, budget: false, members: false, report: false },
    caps: { maxMessages: 0, maxFanoutPerMinute: 0, maxPairMessages: 0 },
    lastSeq: 1,
    read: 0,
    unread: 2,
    ...over,
  });
  const m = (handle: string, presence: Member['presence']): Member => ({ handle, agent: 'scribe', task: 'Write it', runs: [], fired: false, muted: false, presence });
  const facts = { fleet: null, runs: {}, openRuns: false };
  it('takes the most urgent status of its agents', () => {
    const r = channelRow(b({}), [m('one', 'idle'), m('two', 'working'), m('three', 'needs-you')], facts, 'me@example.com', []);
    expect(r.status.word).toBe('needs you');
    expect(r.agents.map((a) => a.status.word)).toEqual(['idle', 'working', 'needs you']);
    expect(r.people).toBe('you');
    expect(r.unread).toBe(2);
  });
  it('says asleep, never where an agent runs', () => {
    const r = channelRow(b({}), [m('one', 'waiting')], facts, 'me@example.com', []);
    expect(r.agents[0].status.word).toBe('starting');
  });
  it('puts the channels that need you first', () => {
    const quiet = channelRow(b({ id: 'q', lastAt: '2026-10-28T12:00:00Z' }), [m('a', 'idle')], facts, '', []);
    const needs = channelRow(b({ id: 'n', lastAt: '2026-10-28T09:00:00Z' }), [m('a', 'needs-you')], facts, '', []);
    expect(sortChannels([quiet, needs]).map((c) => c.id)).toEqual(['n', 'q']);
  });
  it('marks a channel where a job repeats', () => {
    const r = channelRow(b({}), [], facts, '', [{ name: 'j', agent: 'scribe', when: {}, do: { post: { bridge: 'br-1', message: 'Go' } }, limits: {} } as never]);
    expect(r.repeats).toBe(true);
  });
});
