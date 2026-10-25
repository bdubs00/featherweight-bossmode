import { describe, expect, it } from 'vitest';
import type { Bridge, Entry, Member, Result, Run } from '../api/types';
import type { Channel, Roster } from './reducer';
import { asksOf, asksYou, attentionOf, inboxRows, keyAction, needsPerson, questionWaits, questionsOf, reasonOf, sortInbox, type InboxInput, type InboxRow } from './inbox';
import { decisionOf } from '../lib/decision';

const at = (min: number) => new Date(Date.UTC(2026, 9, 21, 20, min)).toISOString();

const bridge = (id: string, extra: Partial<Bridge> = {}): Bridge => ({
  id,
  title: 'Bridge ' + id,
  goal: '',
  operator: '',
  state: 'open',
  placement: 'queue',
  createdAt: at(0),
  closedAt: null,
  delegation: { approve: false, budget: false, members: false, report: true },
  caps: { maxMessages: 1, maxFanoutPerMinute: 1, maxPairMessages: 1 },
  lastSeq: 0,
  read: 0,
  unread: 0,
  ...extra,
});

const seat = (handle: string, presence: Member['presence'], extra: Partial<Member> = {}): Member => ({ handle, agent: 'migrator', task: 't', runs: ['run-' + handle], fired: false, muted: false, presence, ...extra });
const roster = (ms: Member[]): Roster => ({ order: ms.map((m) => m.handle), byHandle: Object.fromEntries(ms.map((m) => [m.handle, m])) });
const run = (id: string, state: Run['state'], extra: Partial<Run> = {}): Run => ({ id, agent: 'migrator', state, seq: 1, createdAt: at(0), updatedAt: at(5), ...extra });
const channel = (entries: Entry[]): Channel => ({ seqs: entries.map((e) => e.seq), bySeq: Object.fromEntries(entries.map((e) => [e.seq, e])), prev: 0 });

function input(): InboxInput {
  return {
    bridges: [bridge('b1', { unread: 2, read: 1 }), bridge('b2'), bridge('b3', { state: 'closed' })],
    rosters: {
      b1: roster([seat('late', 'needs-you'), seat('early', 'needs-you'), seat('broke', 'error'), seat('stop', 'idle'), seat('fine', 'working'), seat('gone', 'fired', { fired: true })]),
      b2: roster([seat('asker', 'needs-you'), seat('sleepy', 'asleep')]),
      b3: roster([seat('closed', 'error')]),
    },
    runs: {
      'run-late': run('run-late', 'input-required', { pending: { id: 'a1', tool: 'bash', input: { command: 'git push' }, reason: 'rule: ask bash: git push*', requestedAt: at(30) } }),
      'run-early': run('run-early', 'input-required', { pending: { id: 'a2', tool: 'bash', reason: 'default', requestedAt: at(10) } }),
      'run-broke': run('run-broke', 'failed', { error: 'boom', updatedAt: at(20) }),
      'run-stop': run('run-stop', 'canceled', { updatedAt: at(25) }),
      'run-asker': run('run-asker', 'input-required', { pending: { id: 'q1', tool: 'ask_user', schema: { type: 'object' }, reason: 'Who reads it?', requestedAt: at(20) } }),
      'run-closed': run('run-closed', 'failed'),
    },
    channels: {
      b1: channel([
        { seq: 1, at: at(1), from: { kind: 'agent', handle: 'fine' }, text: 'old' },
        { seq: 2, at: at(40), from: { kind: 'agent', handle: 'fine' }, text: 'A new **note**.' },
        { seq: 3, at: at(41), from: { kind: 'person', name: 'me@example.com' }, text: 'mine' },
      ]),
    },
    results: { 'run-late': { runId: 'run-late', title: '', agent: '', status: '', started: '', changed: '', pending: { id: 'a1', label: 'Run command', effect: 'Runs git push.' } } as Result },
    me: 'me@example.com',
  };
}

const keys = (rows: InboxRow[]) => rows.map((r) => r.key);

describe('the inbox', () => {
  it('makes one row per decision, question, failed seat, stopped seat, and new message of an open bridge', () => {
    const rows = inboxRows(input());
    expect(rows.map((r) => [r.kind, r.handle || r.bridge])).toEqual([
      ['decision', 'late'],
      ['decision', 'early'],
      ['failed', 'broke'],
      ['stopped', 'stop'],
      ['message', 'fine'],
      ['question', 'asker'],
    ]);
  });

  it('puts needs you first with the oldest wait first, then the errors, then the rest by the status of the sender', () => {
    const s = input();
    s.bridges[1] = { ...s.bridges[1], unread: 1 };
    s.channels.b2 = channel([{ seq: 1, at: at(50), from: { kind: 'agent', handle: 'sleepy' }, text: 'zz' }]);
    expect(keys(sortInbox(inboxRows(s)))).toEqual(['d:run-early/a2', 'd:run-asker/q1', 'd:run-late/a1', 's:b1/stop', 's:b1/broke', 'm:b1', 'm:b2']);
  });

  it('puts a message to you before the other messages of its status', () => {
    const rows: InboxRow[] = [
      { key: 'x', kind: 'message', status: 'idle', bridge: 'b', bridgeTitle: '', at: at(9) },
      { key: 'y', kind: 'message', status: 'idle', bridge: 'b', bridgeTitle: '', at: at(1), toYou: true },
      { key: 'z', kind: 'message', status: 'working', bridge: 'b', bridgeTitle: '', at: at(0) },
    ];
    expect(keys(sortInbox(rows))).toEqual(['z', 'y', 'x']);
  });

  it('builds the decision from the run and its result, and prefers the card of the channel', () => {
    const s = input();
    const d = decisionOf(s.runs['run-late'], s.results['run-late'])!;
    expect([d.label, d.effect, d.question, d.reason]).toEqual(['Run command', 'Runs git push.', false, 'rule: ask bash: git push*']);
    expect(decisionOf(s.runs['run-asker'])!.question).toBe(true);
    const card: Entry = { seq: 9, at: at(9), from: { kind: 'system' }, text: '', decision: { run: 'run-late', id: 'a1', label: 'Push', state: 'pending', always: true } };
    expect(decisionOf(s.runs['run-late'], undefined, card)!.label).toBe('Push');
  });

  it('shows the newest message after the read mark that is not your own', () => {
    const row = inboxRows(input()).find((r) => r.kind === 'message')!;
    expect(row.entry!.seq).toBe(2);
    expect(row.status).toBe('working');
  });

  it('says why a seat stopped in one plain line, without the raw error of a provider', () => {
    const raw = 'model: anthropic: POST "http://x/v1/messages": 400 Bad Request (Request-ID req_1) {"type":"error","error":{"message":"prompt is too long"}}';
    expect(reasonOf(run('r', 'failed', { error: raw }), undefined)).toBe('The conversation is too long for the model');
  });

  it('counts on the app bar each row that needs you, a failure, a stop, and a limit too, and no new message', () => {
    const s = input();
    s.rosters.b1.byHandle.fine = { ...s.rosters.b1.byHandle.fine, presence: 'limit' };
    s.runs['run-fine'] = run('run-fine', 'completed', { updatedAt: at(35) });
    const rows = sortInbox(inboxRows(s));
    expect(rows.map((r) => [r.key, needsPerson(r)])).toEqual([
      ['d:run-early/a2', true],
      ['d:run-asker/q1', true],
      ['d:run-late/a1', true],
      ['s:b1/stop', true],
      ['s:b1/broke', true],
      ['s:b1/fine', true],
      ['m:b1', false],
    ]);
    expect(attentionOf(s, rows)).toBe(6);
    // An open bridge whose record the page has not read yet counts by the needsYou of the list. A closed bridge never counts.
    const more = { ...s, bridges: [...s.bridges, bridge('b4', { needsYou: 2 }), bridge('b5', { state: 'closed', needsYou: 4 })] };
    expect(attentionOf(more, sortInbox(inboxRows(more)))).toBe(8);
  });

  it('makes a row that needs you of a message that asks you, after your read mark, until you answer it or the seat posts again, for a front that names no question', () => {
    const s = input();
    const ask = (seq: number, min: number, handle: string, text: string, to: string[] = []): Entry => ({ seq, at: at(min), from: { kind: 'agent', handle }, text, to });
    s.bridges[1] = { ...s.bridges[1], unread: 3, read: 1 };
    s.channels.b2 = channel([
      ask(1, 1, 'sleepy', '@operator, an old question.'),
      ask(2, 50, 'sleepy', 'Please say whether the rule should be lifted.', ['operator', 'asker']),
      ask(3, 51, 'asker', '@operator which branch?'),
      ask(4, 52, 'asker', 'A note to the team.'),
    ]);
    const rows = sortInbox(inboxRows(s));
    // The note of asker after its question ends that question.
    expect(rows.filter((r) => r.kind === 'asked').map((r) => [r.key, r.handle, r.status, r.entry!.seq])).toEqual([['q:b2/2', 'sleepy', 'needs-you', 2]]);
    // The newest message that does not ask you keeps its row of a message.
    expect(rows.find((r) => r.kind === 'message' && r.bridge === 'b2')!.entry!.seq).toBe(4);
    expect(['r', 'a', 'Enter'].map((k) => keyAction(k, rows.find((r) => r.kind === 'asked')!))).toEqual(['answer', null, 'open']);
    // A message of yours to that handle, or in reply to the message, answers it.
    const answered = channel([...s.channels.b2.seqs.map((q) => s.channels.b2.bySeq[q]), { seq: 5, at: at(53), from: { kind: 'person', name: 'me@example.com' }, text: 'main', to: ['asker'] }, { seq: 6, at: at(54), from: { kind: 'person', name: 'me@example.com' }, text: 'Lift it.', to: [], replyTo: 2 }]);
    expect(asksOf(s.bridges[1], answered, 'me@example.com')).toEqual([]);
    // A message of yours to everyone answers it too.
    const everyone = channel([...s.channels.b2.seqs.map((q) => s.channels.b2.bySeq[q]), { seq: 5, at: at(53), from: { kind: 'person', name: 'me@example.com' }, text: 'Lift it, all of you.', to: [] }]);
    expect(asksOf(s.bridges[1], everyone, 'me@example.com')).toEqual([]);
  });

  it('takes the questions that the front names on the seats: a row per question, also before the page holds its entry, and no count of its own', () => {
    const s = input();
    const q = (seq: number, handle: string, text: string, ask = true): Entry => ({ seq, at: at(seq), from: { kind: 'agent', handle }, text, to: ['operator'], ask: ask ? { choices: ['Yes', 'No'] } : null });
    s.bridges[1] = { ...s.bridges[1], unread: 0, read: 9, needsYou: 2 };
    s.rosters.b2 = roster([seat('asker', 'needs-you', { question: 7 }), seat('sleepy', 'needs-you', { question: 3, runs: [] }), seat('quiet', 'idle', { question: 0 })]);
    s.channels.b2 = channel([q(7, 'asker', 'Restart sshd?'), q(8, 'quiet', '@operator an old word', false)]);
    // The question of sleepy is older than the loaded part, and the page read it alone.
    s.entries = { 'b2/3': q(3, 'sleepy', 'Which host first?') };
    const asked = sortInbox(inboxRows(s)).filter((r) => r.kind === 'asked');
    expect(asked.map((r) => [r.key, r.handle, r.seq, r.entry && r.entry.text])).toEqual([
      ['q:b2/3', 'sleepy', 3, 'Which host first?'],
      ['q:b2/7', 'asker', 7, 'Restart sshd?'],
    ]);
    // Without the entry the row still needs you.
    s.entries = {};
    expect(questionsOf(s.bridges[1], s.channels.b2, 'me@example.com', s.rosters.b2).map((x) => [x.handle, x.seq, !!x.entry])).toEqual([
      ['sleepy', 3, false],
      ['asker', 7, true],
    ]);
    // The card in the channel waits while the seat names it.
    expect(questionWaits(s.rosters.b2, s.channels.b2.bySeq[7])).toBe(true);
    expect(questionWaits(roster([seat('asker', 'idle', { question: 0 })]), s.channels.b2.bySeq[7])).toBe(false);
    expect(questionWaits(s.rosters.b2, s.channels.b2.bySeq[8])).toBe(false);
    // The count of the app bar takes the row of each question, and not the needsYou of the bridge on top.
    const b2: InboxInput = { ...s, bridges: [s.bridges[1]], runs: { ...s.runs, 'run-asker': run('run-asker', 'running') } };
    expect(attentionOf(b2, inboxRows(b2))).toBe(2);
  });

  it('reads a message as asking you when the front marks it, its to holds operator, or its text holds the word @operator anywhere', () => {
    const e = (text: string, to: string[] = [], kind: 'agent' | 'person' = 'agent'): Entry => ({ seq: 1, at: at(1), from: kind === 'agent' ? { kind, handle: 'a' } : { kind, name: 'p' }, text, to });
    expect([e('x', ['operator']), e(' @operator, x'), e('@operators x'), e('@net-auditor go.\n\n@operator Two decisions are open.'), e('mail ops@operator.example'), e('@operator x', [], 'person')].map(asksYou)).toEqual([true, true, false, true, false, false]);
    expect(asksYou({ ...e('Restart?'), ask: {} })).toBe(true);
  });

  it('maps the keys to actions: a allows, d denies, r replies, Enter opens', () => {
    const [decision, , failed] = inboxRows(input());
    const question = inboxRows(input()).find((r) => r.kind === 'question')!;
    const message = inboxRows(input()).find((r) => r.kind === 'message')!;
    expect(['a', 'd', 'r', 'Enter', 'x'].map((k) => keyAction(k, decision))).toEqual(['allow', 'deny', 'reply', 'open', null]);
    expect(['a', 'd'].map((k) => keyAction(k, question))).toEqual(['answer', 'deny']);
    expect(['a', 's'].map((k) => keyAction(k, failed))).toEqual([null, 'seat']);
    expect(['a', 'd', 'r'].map((k) => keyAction(k, message))).toEqual([null, null, 'reply']);
  });
});

describe('the items of the inbox of the duties', () => {
  const base = (): InboxInput => ({
    bridges: [bridge('b1')],
    rosters: { b1: roster([seat('broke', 'error')]) },
    runs: { 'run-broke': run('run-broke', 'failed', { error: 'The run reached its limit.', metadata: { 'workbench.duty': 'nightly-check' } }) },
    channels: {},
    results: {},
    me: 'alice@example.com',
  });

  it('name the duty of a run of a seat from its metadata', () => {
    const rows = inboxRows(base());
    expect(rows.map((r) => [r.key, r.kind, r.duty])).toEqual([['s:b1/broke', 'failed', 'nightly-check']]);
  });

  it('add a failed run and a paused duty, and a question of a duty on no bridge, and show a question of a bridge once', () => {
    const s = base();
    s.runs['run-ask'] = run('run-ask', 'input-required', { agent: 'backup', pending: { id: 'ap-1', tool: 'bash', input: { command: 'restic restore' }, reason: 'ask', requestedAt: at(3) } });
    s.items = [
      { kind: 'failure', run: 'run-x', duty: 'daily-report', agent: 'scribe', text: 'The run reached its limit of turns.', since: at(1) },
      { kind: 'paused', duty: 'monthly-summary', agent: 'writer', text: 'Three runs in a row failed.', since: at(2) },
      { kind: 'approval', run: 'run-ask', duty: 'restore-test', agent: 'backup', text: 'backup wants to run a command.', since: at(3) },
      { kind: 'approval', run: 'run-seat', bridge: 'b1', agent: 'migrator', text: 'In a bridge.' },
      { kind: 'question', run: 'run-later', duty: 'restore-test', agent: 'backup', text: 'Which snapshot?', since: at(4) },
      // A failure that the row of a seat shows gives it its duty, and no second row.
      { kind: 'failure', run: 'run-broke', duty: 'other-duty', text: 'Failed.' },
    ];
    const rows = sortInbox(inboxRows(s));
    expect(rows.map((r) => [r.key, r.kind, r.status, r.duty || ''])).toEqual([
      ['d:run-ask/ap-1', 'decision', 'needs-you', 'restore-test'],
      ['w:run-later', 'duty-waits', 'needs-you', 'restore-test'],
      ['s:b1/broke', 'failed', 'error', 'nightly-check'],
      ['u:failure/daily-report', 'duty-failed', 'error', 'daily-report'],
      ['u:paused/monthly-summary', 'duty-paused', 'limit', 'monthly-summary'],
    ]);
    // The count of the app bar takes every row that needs you: the failures and the paused duty too.
    expect(rows.filter(needsPerson).length).toBe(5);
    expect(attentionOf(s, rows)).toBe(5);
    const ask = rows[0];
    expect([ask.bridge, ask.handle, ask.decision!.tool]).toEqual(['', 'backup', 'bash']);
    expect(rows[3].reason).toBe('The run reached its limit of turns.');
    expect(keyAction('a', ask)).toBe('allow');
    expect(keyAction('s', rows[3])).toBeNull();
  });

  it('give the card of a question of a duty from the approval of its item, with no read of the run', () => {
    const s = base();
    s.items = [
      { kind: 'approval', run: 'run-a', approval: 'ap-7', duty: 'restore-test', agent: 'backup', bridge: '', text: 'backup wants to run restic restore.', since: at(3) },
      { kind: 'question', run: 'run-q', approval: 'ap-8', duty: 'restore-test', agent: 'backup', bridge: '', text: 'Which snapshot?', since: at(4) },
    ];
    const rows = sortInbox(inboxRows(s)).filter((r) => r.duty === 'restore-test');
    expect(rows.map((r) => [r.key, r.kind, r.handle, r.reason])).toEqual([
      ['d:run-a/ap-7', 'decision', 'backup', 'backup wants to run restic restore.'],
      ['d:run-q/ap-8', 'question', 'backup', 'Which snapshot?'],
    ]);
    expect(rows[0].decision).toEqual({ run: 'run-a', id: 'ap-7', label: 'Allow', question: false, reason: undefined, state: 'pending', always: false });
    expect(rows[1].decision).toMatchObject({ run: 'run-q', id: 'ap-8', label: 'Answer', question: true, reason: 'Which snapshot?' });
    expect(keyAction('d', rows[0])).toBe('deny');
    // Once the page holds the run, the run gives the whole card.
    s.runs['run-a'] = run('run-a', 'input-required', { agent: 'backup', pending: { id: 'ap-7', tool: 'bash', input: { command: 'restic restore latest' }, reason: 'ask', requestedAt: at(3) } });
    const whole = inboxRows(s).find((r) => r.key === 'd:run-a/ap-7')!;
    expect(whole.decision!.tool).toBe('bash');
  });
});