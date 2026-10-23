import { describe, expect, it } from 'vitest';
import type { Bridge, Entry, Member, Result, Run } from '../api/types';
import type { Channel, Roster } from './reducer';
import { asksOf, asksYou, inboxRows, keyAction, reasonOf, sortInbox, type InboxInput, type InboxRow } from './inbox';
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
    expect(reasonOf(run('r', 'failed', { error: raw }), undefined)).toBe('Prompt is too long.');
  });

  it('makes a row that needs you of a message that asks you, after your read mark, until you answer it', () => {
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
    expect(rows.filter((r) => r.kind === 'asked').map((r) => [r.key, r.handle, r.status, r.entry!.seq])).toEqual([
      ['q:b2/2', 'sleepy', 'needs-you', 2],
      ['q:b2/3', 'asker', 'needs-you', 3],
    ]);
    // The newest message that does not ask you keeps its row of a message.
    expect(rows.find((r) => r.kind === 'message' && r.bridge === 'b2')!.entry!.seq).toBe(4);
    expect(['r', 'a', 'Enter'].map((k) => keyAction(k, rows.find((r) => r.kind === 'asked')!))).toEqual(['answer', null, 'open']);
    // A message of yours to that handle, or in reply to the message, answers it.
    const answered = channel([...s.channels.b2.seqs.map((q) => s.channels.b2.bySeq[q]), { seq: 5, at: at(53), from: { kind: 'person', name: 'me@example.com' }, text: 'main', to: ['asker'] }, { seq: 6, at: at(54), from: { kind: 'person', name: 'me@example.com' }, text: 'Lift it.', to: [], replyTo: 2 }]);
    expect(asksOf(s.bridges[1], answered, 'me@example.com')).toEqual([]);
  });

  it('reads a message as asking you when its to holds operator or its text starts with @operator', () => {
    const e = (text: string, to: string[] = [], kind: 'agent' | 'person' = 'agent'): Entry => ({ seq: 1, at: at(1), from: kind === 'agent' ? { kind, handle: 'a' } : { kind, name: 'p' }, text, to });
    expect([e('x', ['operator']), e(' @operator, x'), e('@operators x'), e('ask @operator'), e('@operator x', [], 'person')].map(asksYou)).toEqual([true, true, false, false, false]);
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
