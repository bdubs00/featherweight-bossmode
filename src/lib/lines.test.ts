import { describe, expect, it } from 'vitest';
import type { Entry } from '../api/types';
import { decidedRuns, hiddenLine, isMe, lineWords, lostRunOf, napOf, napRuns, napWords, whoName, type Nap } from './lines';

const TOKEN = { subject: 'token', kind: 'token' };
const ALICE = { subject: 'alice@example.com', name: 'Alice Example' };
const line = (event: string, text: string, page?: string) => lineWords({ event, text, page }, TOKEN);

describe('lineWords', () => {
  it('says that a seat woke up or took the seat, and never the task', () => {
    expect(line('started', 'migrator-1 woke up.')).toEqual({ text: 'migrator-1 woke up' });
    expect(line('started', 'migrator-2 started: Migrate the Puppet module nginx to an Ansible role. The module installs the package.')).toEqual({ text: 'migrator-2 took the seat' });
    expect(line('started', 'The manager started: it seats the members of the bridge.')).toEqual({ text: 'manager took the seat' });
  });

  it('says that a seat went to sleep, with no second sentence', () => {
    expect(line('asleep', 'reviewer went to sleep. A message wakes its Task.')).toEqual({ text: 'reviewer went to sleep' });
  });

  it('words a decision with the person, and keeps the note on the card', () => {
    expect(line('decided', 'the token of the fleet denied the call of migrator-1, with the note: No remote is set; keep the commit local..')).toEqual({ text: "You denied migrator-1's command" });
    expect(lineWords({ event: 'decided', text: 'alice@example.com allowed the call of migrator-2.' }, TOKEN)).toEqual({ text: "alice allowed migrator-2's command" });
    expect(lineWords({ event: 'decided', text: 'the token of the fleet allowed the call of migrator-2.' }, ALICE)).toEqual({ text: "token allowed migrator-2's command" });
    expect(lineWords({ event: 'decided', text: 'alice answered the question of reviewer: Yes.' }, ALICE)).toEqual({ text: 'You answered reviewer' });
    expect(lineWords({ event: 'decided', text: 'bob@example.com declined the question of reviewer.' }, ALICE)).toEqual({ text: "bob declined reviewer's question" });
  });

  it('keeps a short line of the page for the other events, with the sentence of the backend in a tooltip', () => {
    const cases: [string, string, string][] = [
      ['failed', 'The front failed to seat reviewer-2: no queue for the agent', 'reviewer-2 did not take the seat'],
      ['failed', 'tester did not get message 41: the run is gone.', 'tester did not get a message'],
      ['cap', 'The bridge reached its cap of 2000 messages, so the front delivers no more messages to the members. Raise caps.maxMessages to go on; the channel keeps every message.', 'The bridge reached its cap of 2000 messages'],
      ['cap', 'writer cannot take messages: its run stopped at a limit (the run reached its limit of 40 turns). It needs a larger budget.', 'writer stopped at a limit'],
      ['cap', 'migrator-1 and reviewer exchanged 20 messages without a message of a person, so the front delivers no more between them.', 'migrator-1 and reviewer reached their cap'],
      ['fired', 'token fired scribe. Its Task stays in its pool.', 'You fired scribe'],
      ['task', 'writer has a new task: Write the notes of the logrotate role', 'writer has a new task'],
      ['task', 'token seated writer again on its task: Write the notes', 'You seated writer again'],
      ['changed', 'token changed the settings of the bridge.', 'You changed the settings'],
      ['closed', 'token closed the bridge. Nothing was canceled.', 'You closed the bridge'],
      ['reopened', 'token opened the bridge again.', 'You reopened the bridge'],
      ['joined', 'token added reviewer-2: Review the logrotate role', 'You seated reviewer-2'],
      ['finished', 'scribe finished with no answer.', 'scribe finished'],
      ['canceled', 'The run of tester was canceled.', 'tester stopped'],
      ['needs-you', 'migrator-2 waits for you to connect a service: GitHub.', 'migrator-2 needs you'],
      ['asked', 'reviewer asks: Which manifest is the source?', 'reviewer asks you'],
    ];
    for (const [event, text, words] of cases) expect(line(event, text)).toEqual({ text: words, title: text });
    // A failed run keeps no raw error in its tooltip: the plain line, and the message of the provider.
    expect(line('failed', 'migrator-1 failed: the model answered 529 three times')).toEqual({ text: 'migrator-1 failed', title: 'The model answered 529 three times.' });
    const raw =
      'writer failed: model: anthropic: stream claude-haiku-5-5: POST "http://ax-anthropic:8080/v1/messages?beta=true": 400 Bad Request (Request-ID: req_1) {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support assistant message prefill."}}';
    expect(line('failed', raw)).toEqual({ text: 'writer failed', title: 'The model refused the request. This model does not support assistant message prefill.' });
    expect(line('failed', 'writer failed')).toEqual({ text: 'writer failed' });
    // A sentence that says no more than the words gets no tooltip.
    expect(line('muted', 'alice muted tester.')).toEqual({ text: 'alice muted tester' });
  });

  it('links the report of a bridge, from the text or the page of the line', () => {
    expect(line('changed', 'The report is in the wiki: bridges/br-1/report.md.')).toEqual({ text: 'The report is in the wiki', title: 'The report is in the wiki: bridges/br-1/report.md.', page: 'bridges/br-1/report.md' });
    expect(line('changed', 'The manager wrote the report: [bridges/b1/report.md](bridges/b1/report.md)').page).toBe('bridges/b1/report.md');
  });

  it('keeps the sentence of the backend for an event that the page has no words for', () => {
    expect(line('', 'Something new.')).toEqual({ text: 'Something new.', raw: true });
  });
});

describe('the plain facts of a later front', () => {
  it('words a decision on a command, a file change, or the call of a tool, and leaves the note on the card', () => {
    expect(line('decided', "token denied migrator-1's command, with the note: No remote is set")).toEqual({ text: "You denied migrator-1's command" });
    expect(lineWords({ event: 'decided', text: "alice@example.com allowed migrator-2's command" }, TOKEN)).toEqual({ text: "alice allowed migrator-2's command" });
    expect(lineWords({ event: 'decided', text: "token allowed migrator-2's file change" }, ALICE)).toEqual({ text: "token allowed migrator-2's file change" });
    expect(lineWords({ event: 'decided', text: "alice@example.com denied writer's call of front.pages_write, with the note: Not yet" }, ALICE)).toEqual({ text: "You denied writer's call of pages_write" });
    expect(lineWords({ event: 'decided', text: "bob@example.com allowed writer's call of github.create_pr" }, ALICE)).toEqual({ text: "bob allowed writer's call of github.create_pr" });
  });

  it('words an answer and a declined question, with the decider as You where it is the person', () => {
    expect(lineWords({ event: 'decided', text: "alice@example.com answered reviewer's question: Yes" }, ALICE)).toEqual({ text: 'You answered reviewer' });
    expect(lineWords({ event: 'decided', text: "token declined scribe's question, with the note: Later" }, TOKEN)).toEqual({ text: "You declined scribe's question" });
    expect(lineWords({ event: 'decided', text: "token declined scribe's question" }, ALICE)).toEqual({ text: "token declined scribe's question" });
  });

  it('says that a seat lost its worker, with the id of the run in the tooltip, and names the run', () => {
    const text = 'migrator-1 lost its run 01RUN9: no worker of the fleet holds it';
    expect(line('lost', text)).toEqual({ text: 'migrator-1 lost its worker', title: text });
    expect(lostRunOf({ from: { kind: 'system' }, event: 'lost', text })).toBe('01RUN9');
    expect(lostRunOf({ from: { kind: 'system' }, event: 'asleep', text: 'migrator-1 went to sleep' })).toBe('');
  });

  it('reads the lines that only lose their end mark', () => {
    const cases: [string, string, string][] = [
      ['started', 'migrator-1 woke up', 'migrator-1 woke up'],
      ['asleep', 'reviewer went to sleep', 'reviewer went to sleep'],
      ['opened', 'alice@example.com opened the bridge with 3 members', 'You opened the bridge'],
      ['closed', 'token closed the bridge', 'token closed the bridge'],
      ['fired', 'token fired scribe', 'token fired scribe'],
      ['cap', 'The bridge reached its cap of 2000 messages', 'The bridge reached its cap of 2000 messages'],
      ['failed', 'migrator-1 failed: the model answered 529 three times', 'migrator-1 failed'],
      ['canceled', 'alice@example.com stopped the run of tester', 'You stopped tester'],
    ];
    for (const [event, text, words] of cases) expect(lineWords({ event, text }, ALICE).text).toBe(words);
    expect(napOf({ from: { kind: 'system' }, event: 'started', text: 'migrator-1 woke up' })).toEqual({ nap: 'wake', handle: 'migrator-1' });
  });
});

describe('isMe and whoName', () => {
  it('names the person who reads the page You, by the subject, the name, or the words of the token', () => {
    expect(isMe('token', TOKEN)).toBe(true);
    expect(isMe('the token of the fleet', TOKEN)).toBe(true);
    expect(isMe('the token of the fleet', ALICE)).toBe(false);
    expect(isMe('alice@example.com', ALICE)).toBe(true);
    expect(isMe('Alice Example', ALICE)).toBe(true);
    expect(isMe('alice', ALICE)).toBe(true);
    expect(isMe('bob@example.com', ALICE)).toBe(false);
    expect(whoName('token', TOKEN)).toBe('You');
    expect(whoName('bob@example.com', TOKEN)).toBe('bob');
    expect(whoName('somebody', TOKEN)).toBe('Someone');
    expect(whoName('the front', TOKEN)).toBe('The front');
  });
});

describe('hiddenLine', () => {
  const card = (run: string, state: 'pending' | 'allow' | 'deny'): Entry => ({ seq: 1, at: '', from: { kind: 'system' }, text: 'migrator-1 wants to run a command.', event: 'needs-you', decision: { run, id: 'ap', state } as Entry['decision'] });
  const decided = (run: string): Entry => ({ seq: 2, at: '', from: { kind: 'system' }, text: 'token denied the call of migrator-1.', event: 'decided', mirrors: { run, seq: 9, type: 'fw.approval.decided' } });

  it('hides the line of a decision whose card the view holds, and keeps it while the card waits or is out of view', () => {
    expect(hiddenLine(decided('r1'), decidedRuns([card('r1', 'deny')]))).toBe(true);
    expect(hiddenLine(decided('r1'), decidedRuns([card('r1', 'pending')]))).toBe(false);
    expect(hiddenLine(decided('r1'), decidedRuns([card('r2', 'allow')]))).toBe(false);
    expect(hiddenLine(card('r1', 'deny'), decidedRuns([card('r1', 'deny')]))).toBe(false);
  });
});

describe('the sleep and wake lines', () => {
  const sys = { kind: 'system' as const };
  it('reads a line that says that a worker went to sleep or woke up, in the sentence of today and the plain fact of later', () => {
    expect(napOf({ from: sys, event: 'asleep', text: 'migrator-1 went to sleep. A message wakes its Task.' })).toEqual({ nap: 'sleep', handle: 'migrator-1' });
    expect(napOf({ from: sys, event: 'asleep', text: 'migrator-1 went to sleep' })).toEqual({ nap: 'sleep', handle: 'migrator-1' });
    expect(napOf({ from: sys, event: 'started', text: 'migrator-1 woke up.' })).toEqual({ nap: 'wake', handle: 'migrator-1' });
    expect(napOf({ from: sys, event: 'started', text: 'migrator-1 started: Migrate cron.' })).toBeNull();
    expect(napOf({ from: { kind: 'agent', handle: 'migrator-1', run: 'r' }, event: 'asleep', text: 'migrator-1 went to sleep.' })).toBeNull();
  });

  it('pairs a sleep line with the wake line after it, joins a run of pairs, and leaves a last sleep line alone', () => {
    const S = (h = 'm'): Nap => ({ nap: 'sleep', handle: h });
    const W = (h = 'm'): Nap => ({ nap: 'wake', handle: h });
    expect(napRuns([S(), W(), S(), W(), S(), W(), S(), W()])).toEqual([[0, 1, 2, 3, 4, 5, 6, 7]]);
    expect(napRuns([S(), W(), S()])).toEqual([[0, 1]]);
    expect(napRuns([W(), S(), W(), S()])).toEqual([[1, 2]]);
    // Something between them, another seat, or another day keeps the lines apart.
    expect(napRuns([S(), null, W()])).toEqual([]);
    expect(napRuns([S('a'), W('b')])).toEqual([]);
    expect(napRuns([S(), W(), S(), W()], (i, j) => !(i === 1 && j === 2))).toEqual([[0, 1], [2, 3]]);
  });

  it('words a run of pairs as one quiet line', () => {
    expect(napWords('migrator-1', 1)).toBe('migrator-1 slept and woke up');
    expect(napWords('migrator-1', 4)).toBe('migrator-1 slept and woke up 4 times');
  });
});
