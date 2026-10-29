// The pure parts of the chat-first page: its addresses, the one list of
// Needs you, the status of a channel, and the words of the page.

import { describe, expect, it } from 'vitest';
import type { Bridge, Member, WorkCard } from '../../api/types';
import type { InboxRow } from '../../state/inbox';
import { chatHref, focusOf, parseChat, type ChatRoute } from './route';
import { askWords, needsOf, needsOfCount, type NeedsInput } from './needs';
import { channelRow, lineText, openedWords, pageWords, peopleWords, sortChannels, channelPeople, roleWords, channelStatus } from './channels';
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
  it('leaves the older places that have no home here to the shell as they are', () => {
    expect(parseChat('#pages/a.md')).toBeNull();
    expect(parseChat('#skills')).toBeNull();
    expect(parseChat('#duties/new')).toBeNull();
    expect(parseChat('#duties/nightly/edit')).toBeNull();
    expect(parseChat('#new-agent')).toBeNull();
    expect(parseChat('')).toEqual({ view: 'home' });
  });
  it('sends an older address to its home on this page', () => {
    expect(parseChat('#manager')).toEqual({ view: 'manager' });
    expect(parseChat('#work')).toEqual({ view: 'home' });
    expect(parseChat('#bridge/br-1')).toEqual({ view: 'channel', id: 'br-1', tab: 'posts' });
    expect(parseChat('#bridge/br-1/roster')).toEqual({ view: 'channel', id: 'br-1', tab: 'posts', members: true });
    expect(parseChat('#member/br-1/one')).toEqual({ view: 'channel', id: 'br-1', tab: 'posts', members: true });
    expect(parseChat('#fleet')).toEqual({ view: 'agents' });
    expect(parseChat('#fleet/scribe/profile')).toEqual({ view: 'agent', name: 'scribe', setup: true });
    expect(parseChat('#knowhow/scribe/notes')).toEqual({ view: 'agent', name: 'scribe' });
    expect(parseChat('#duties/nightly')).toEqual({ view: 'job', name: 'nightly' });
    expect(parseChat('#duties/nightly/run/r1')).toEqual({ view: 'run', id: 'r1' });
    expect(parseChat('#activity/d:r1/p1')).toEqual({ view: 'run', id: 'r1' });
    expect(parseChat('#activity/q:br-1/7')).toEqual({ view: 'channel', id: 'br-1', tab: 'posts' });
    expect(parseChat('#chat/r2')).toEqual({ view: 'run', id: 'r2' });
    expect(parseChat('#new')).toEqual({ view: 'manager', fresh: true });
  });
  it('reads and writes the views of the grid and of an agent', () => {
    const routes: ChatRoute[] = [{ view: 'agents' }, { view: 'results' }, { view: 'files' }, { view: 'settings' }, { view: 'agent', name: 'scribe', setup: true }];
    for (const r of routes) expect(parseChat(chatHref(r))).toEqual(r);
    expect(focusOf({ view: 'agent', name: 'scribe', setup: true })).toBe('right');
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
    // The title says what it asks; the second line says the action and the agent, and names nobody twice.
    expect(rows[0].head).toBe('Allow: make test');
    expect(rows[0].line).toBe('Asks first · scribe');
    expect(rows[0].approval).toBe('p1');
    expect(rows[0].card).toBe('a');
    expect(rows[0].href).toBe('#r/r1');
  });
  it('gives each wait of a channel its own row, and opens the decisions of the channel', () => {
    const rows = needsOf(
      input({
        cards: [card({ id: 'b', kind: 'bridge', links: { bridge: 'br-1', run: 'x', approval: 'zz' } })],
        rows: [row({ key: 'd:x/1', bridge: 'br-1', handle: 'one', decision: { run: 'x', id: '1', label: 'Allow', state: 'pending' } }), row({ key: 'q:br-1/7', kind: 'asked', bridge: 'br-1', handle: 'two' })],
      }),
    );
    expect(rows.map((r) => r.line).sort()).toEqual(['Asks first · Channel br-1 · one', 'Asks you · Channel br-1 · two']);
    expect(rows.find((r) => r.line.startsWith('Asks first'))!.href).toBe('#c/br-1/decisions');
    expect(rows.find((r) => r.line.startsWith('Asks you'))!.href).toBe('#c/br-1');
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
    expect(rows[1].head).toBe('Three runs failed.');
    expect(rows[1].line).toBe('Paused · Job weekly');
    expect(rows[2].head).toBe('A task');
    expect(rows[2].line).toBe('Sign off · Job nightly · Scribe');
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
  it('sorts the channels by their last activity, since Needs you leads the sidebar', () => {
    const quiet = channelRow(b({ id: 'q', lastAt: '2026-10-28T12:00:00Z' }), [m('a', 'idle')], facts, '', []);
    const needs = channelRow(b({ id: 'n', lastAt: '2026-10-28T09:00:00Z' }), [m('a', 'needs-you')], facts, '', []);
    expect(sortChannels([needs, quiet]).map((c) => c.id)).toEqual(['q', 'n']);
  });
  it('says done, done to check, or done and checked for a finished channel, and never idle', () => {
    const idle = [m('a', 'idle'), m('b', 'asleep')];
    expect(channelRow(b({}), idle, facts, '', []).status.word).toBe('done');
    expect(channelRow(b({}), idle, facts, '', [], { stage: 'review' } as never).status.word).toBe('done, to check');
    expect(channelRow(b({}), idle, facts, '', [], { stage: 'done', verdict: 'accepted' } as never).status.word).toBe('done, checked');
    expect(channelRow(b({ state: 'closed' }), idle, facts, '', [], { stage: 'done', verdict: 'checked' } as never).status.word).toBe('done, checked');
    expect(channelRow(b({}), [m('a', 'working')], facts, '', [], { stage: 'review' } as never).status.word).toBe('working');
  });
  it('marks a channel where a job repeats', () => {
    const r = channelRow(b({}), [], facts, '', [{ name: 'j', agent: 'scribe', when: {}, do: { post: { bridge: 'br-1', message: 'Go' } }, limits: {} } as never]);
    expect(r.repeats).toBe(true);
  });
});

describe('the lines of a channel', () => {
  const sys = (event: string, text: string) => ({ from: { kind: 'system' as const }, event, text });
  it('says how many agents an opened channel got', () => {
    expect(openedWords([sys('opened', 'manager opened the bridge for ann, with 2 members.'), sys('started', 'one started: x'), sys('started', 'two started: y')])).toBe('Opened channel · 2 members');
    expect(openedWords([sys('opened', 'ann opened the bridge with 3 members.')])).toBe('Opened channel · 3 members');
    expect(openedWords([sys('started', 'one started: x')])).toBeUndefined();
  });
  it('says channel and joined in a line', () => {
    expect(lineText('ann opened the team')).toBe('ann opened the channel');
    expect(lineText('migrator-1 took the seat')).toBe('migrator-1 joined');
    expect(lineText('ann seated tester again')).toBe('ann started tester again');
    expect(lineText('tester lost its worker')).toBe('tester lost its run');
  });
});

describe('the people of a channel', () => {
  it('lists the person who opened it, the people who posted, and you, each once', async () => {
    const { peopleOf } = await import('./channels');
    const got = peopleOf('ann@example.com', 'me@example.com', [
      { from: { kind: 'agent' } },
      { from: { kind: 'person', name: 'bob@example.com', display: 'Bob' } },
      { from: { kind: 'person', name: 'ann@example.com', display: 'Ann' } },
      { from: { kind: 'person', name: 'me@example.com' } },
    ]);
    expect(got).toEqual([{ subject: 'ann@example.com', display: 'Ann' }, { subject: 'bob@example.com', display: 'Bob' }, { subject: 'me@example.com', display: undefined }]);
  });
});

describe('Needs you from the one count of the front', () => {
  it('gives one row per counted task and one per note that waits, and leaves out stopped tasks and rows that no task names', () => {
    const rows = needsOfCount(
      input({
        cards: [
          card({ id: 'a', since: '2026-10-28T10:01:00Z', links: { run: 'r1', approval: 'p1' } }),
          card({ id: 'b', since: '2026-10-28T10:02:00Z', links: { bridge: 'br-1' } }),
          card({ id: 'c', since: '2026-10-28T10:03:00Z', stage: 'review', links: { run: 'r3' } }),
          card({ id: 'd', stage: 'stopped', links: { run: 'r4' } }),
          card({ id: 'e', stage: 'working', next: 'agent' }),
        ],
        rows: [
          row({ key: 'd:r1/p1', run: 'r1', agent: 'scribe', handle: 'scribe', decision: { run: 'r1', id: 'p1', label: 'Allow', tool: 'bash', input: { command: 'make test' }, state: 'pending' } }),
          // Two agents of one channel wait: the count counts the task once, so the list does too.
          row({ key: 'q:br-1/4', kind: 'asked', bridge: 'br-1', handle: 'scribe', agent: 'scribe' }),
          row({ key: 'q:br-1/5', kind: 'asked', bridge: 'br-1', handle: 'reviewer-2', agent: 'reviewer' }),
          row({ key: 'u:duty-paused/nightly', kind: 'duty-paused', status: 'limit', duty: 'nightly', reason: 'Three runs in a row failed.' }),
          row({ key: 'n:triage.01', kind: 'note', handle: 'triage', note: 'triage.01', reason: 'triage wrote a note, ports.md. Keep it?', at: '2026-10-28T10:04:00Z' }),
        ],
      }),
    );
    expect(rows.map((r) => r.key + ' ' + r.kind).sort()).toEqual(['card:c check', 'd:r1/p1 asks', 'n:triage.01 suggestion', 'q:br-1/4 question']);
    expect(rows[0].key).toBe('n:triage.01');
    expect(rows[0].head).toBe('triage wrote a note, ports.md. Keep it?');
    // The title names triage already, so the line does not name it again.
    expect(rows[0].line).toBe('Keep this note?');
  });
  it('shows a note of the inbox once beside the notes of Know-how, from an older build of the list', () => {
    const rows = needsOf(
      input({
        rows: [row({ key: 'n:triage.01', kind: 'note', handle: 'triage', note: 'triage.01', reason: 'Keep it?' })],
        waiting: [{ id: 'triage.01', at: '2026-10-28T10:00:00Z', agent: 'triage', what: 'learned', subject: { note: 'ports.md' }, text: 'Port 22 is closed.', by: 'agent', pin: '' } as never],
      }),
    );
    expect(rows.map((r) => r.key)).toEqual(['k:triage.01']);
  });
});

describe('the words of round 3', () => {
  it('names a person, never a bare id or the word token', async () => {
    const { personName } = await import('../../lib/words');
    expect(personName('token')).toBe('Admin token');
    expect(personName('fd1e8a14-ac12-5a00-b4d6-bb6e50d15c10')).toBe('Someone');
    expect(personName('fd1e8a14-ac12-5a00-b4d6-bb6e50d15c10', 'Dana Reyes')).toBe('Dana Reyes');
    expect(personName('ann@example.com')).toBe('ann');
  });
  it('names an agent of a channel by both names only where they differ', async () => {
    const { memberName, agentLine } = await import('./Members');
    expect(memberName('author', 'Net Auditor', 'net-auditor')).toBe('author (Net Auditor)');
    expect(memberName('migrator-2', 'Migrator', 'migrator')).toBe('migrator-2');
    expect(agentLine('a', { a: { tagline: 'Reads every line twice.' } }, null)).toBe('Reads every line twice.');
    expect(agentLine('b', {}, [{ name: 'b', description: 'Writes notes.\nYou are a writer who...' }])).toBe('Writes notes.');
  });
  it('keeps the cost line of Make this a job to the agent that runs it, and one sentence of a task', async () => {
    const { basisWords, shortTask } = await import('./MakeJob');
    const plan = { cost: { basis: 'Runs of Docs Scribe in the last 30 days cost under $0.01. The job spends nothing of its own.' }, members: [{ handle: 'collector', agent: 'collector', name: 'Collector' }], who: [] } as never;
    expect(basisWords(plan, 'collector')).toBe('The job spends nothing of its own.');
    expect(shortTask('Read the pages. Then write a table.')).toBe('Read the pages.');
  });
  it('says what a conversation with the Manager cost', async () => {
    const { spendWords } = await import('../Manager');
    expect(spendWords({ usage: { costUSD: 0.08 } })).toBe('This conversation cost $0.08 so far.');
    expect(spendWords({})).toBe('This conversation has no price yet.');
  });
  it('previews the last post of a channel with its sender', async () => {
    const { previewOf } = await import('./Sidebar');
    const ch = { seqs: [1, 2, 3], bySeq: { 1: { from: { kind: 'agent', handle: 'scribe' }, text: '## Notes\nDraft one is up.' }, 2: { from: { kind: 'person', name: 'me@x' }, text: 'Thanks' }, 3: { from: { kind: 'system' }, text: 'scribe went to sleep.' } } } as never;
    expect(previewOf(ch, 'me@x')).toBe('You: Thanks');
    expect(previewOf({ seqs: [1], bySeq: { 1: { from: { kind: 'agent', handle: 'scribe' }, text: '## Notes\nDraft one is up.' } } } as never, '')).toBe('scribe: Draft one is up.');
  });
});

describe('a decision whose call the page has not read', () => {
  it('takes the title of its task', () => {
    const rows = needsOfCount(
      input({
        cards: [card({ id: 'r', title: 'Restore the backup of last night', links: { run: 'r9', approval: 'ap' } })],
        rows: [row({ key: 'd:r9/ap', run: 'r9', agent: 'backup', handle: 'backup', decision: { run: 'r9', id: 'ap', label: 'Allow', state: 'pending' } })],
      }),
    );
    expect(rows[0].head).toBe('Restore the backup of last night');
    expect(rows[0].line).toBe('Asks first · backup');
  });
});

describe('the people of a channel from the front', () => {
  it('lists the people of the front with their names and roles, and you once', () => {
    const b = { operator: 'fd1e8a14-ac12', people: [{ subject: 'fd1e8a14-ac12', display: 'Dana Reyes', role: 'asked' }, { subject: 'bob@example.com', display: 'Bob', role: 'posted' }] };
    expect(channelPeople(b, 'alice@example.com', [])).toEqual([
      { subject: 'fd1e8a14-ac12', display: 'Dana Reyes', role: 'asked' },
      { subject: 'bob@example.com', display: 'Bob', role: 'posted' },
      { subject: 'alice@example.com' },
    ]);
    expect([roleWords('asked'), roleWords('owner'), roleWords('posted'), roleWords(undefined)]).toEqual(['Asked for this', 'Owns the job that opened it', 'Posted here', '']);
  });
  it('reads the people from the posts of an older front, which names none', () => {
    const got = channelPeople({ operator: 'dana@example.com' }, 'alice@example.com', [{ from: { kind: 'person', name: 'bob@example.com', display: 'Bob' } }]);
    expect(got.map((p) => [p.subject, p.role || ''])).toEqual([
      ['dana@example.com', 'asked'],
      ['bob@example.com', ''],
      ['alice@example.com', ''],
    ]);
  });
  it('says whom a channel of another person waits for, and needs you for your own', () => {
    expect(channelStatus({ state: 'open', needsYou: 1, waitsFor: 'Dana Reyes' }, [{ word: 'needs you', tone: 'amber' }]).word).toBe('waits for Dana');
    expect(channelStatus({ state: 'open', needsYou: 1, waitsFor: 'you' }, [{ word: 'needs you', tone: 'amber' }]).word).toBe('needs you');
  });
});
