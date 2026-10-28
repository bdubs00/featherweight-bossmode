import { describe, expect, it } from 'vitest';
import type { KnowhowSummary, NoteItem } from '../api/knowhow';
import { byWords, canDecide, canEditNote, conflictWords, entrySentence, figuresOf, groupNotes, heldBackLine, isMine, labelOf, moneyPair, noteTitle, runLinks, sourceOf, undoRefusal, usesWords, waitSentence } from './knowhow';

const ME = { subject: 'alice@example.com', name: 'Alice' };

const sentence = (s: { head: string; name: string; tail: string }) => s.head + s.name + s.tail;

/** SUMMARY is the answer of summary.go of the workbench for triage: 400 runs, 20 of them held back, and the line of the server. */
const SUMMARY: KnowhowSummary = {
  agent: 'triage',
  days: 7,
  costPerJob: { usd: 0.021, runs: 400, previousUsd: 0.025, trend: 'down' },
  doneByRoutines: { runs: 380, byRoutine: 140, share: 140 / 380 },
  notesCorrected: 3,
  normal: { runs: 380, doneWell: 346, byRoutine: 140, costPerJobUsd: 0.0196 },
  heldBack: { runs: 20, doneWell: 16, byRoutine: 0, costPerJobUsd: 0.035 },
  compare: { enough: true, heldBack: 20, normal: 300, oneIn: 16, doneWellWithout: 0.8, doneWellWith: 0.91, line: 'Held back 1 in 16 runs. Done well: 80% without what it learned, 91% with it.' },
};

describe('the words of a note', () => {
  it('titles a note from its name', () => {
    expect(noteTitle('gotchas/gitea-labels.md')).toBe('Gitea labels');
    expect(noteTitle('vpn-reset')).toBe('VPN reset');
  });

  it('labels checked, out of date, and resting, and leaves an unchecked note without a label', () => {
    expect(labelOf('checked')).toEqual({ word: 'checked', tone: 'green' });
    expect(labelOf('out-of-date')).toEqual({ word: 'out of date', tone: 'amber', still: true });
    expect(labelOf('resting')).toEqual({ word: 'resting', tone: 'grey' });
    expect(labelOf('unchecked')).toBeNull();
  });

  it('says who wrote a note, and knows the notes of the person', () => {
    expect(byWords('review', ME, 'Triage')).toBe('the after-work review');
    expect(byWords('agent', ME, 'Triage')).toBe('Triage');
    expect(byWords('person:alice@example.com', ME, 'Triage')).toBe('you');
    expect(byWords('person:bob@example.com', ME, 'Triage')).toBe('bob');
    // The server names no actor on the page.
    expect(byWords('front', ME, 'Triage')).toBe('');
    expect(isMine('person:alice@example.com', ME)).toBe(true);
    expect(isMine('person:bob@example.com', ME)).toBe(false);
    expect(isMine('agent', ME)).toBe(false);
  });

  it('says each kind of source, with the address that opens it', () => {
    expect(sourceOf('run:01K9')).toEqual({ kind: 'run', words: 'a run', href: '/ui#run/01K9' });
    expect(sourceOf('page:agents/triage/labels.md')).toEqual({ kind: 'page', words: 'the page agents/triage/labels.md', href: '#pages/agents/triage/labels.md' });
    expect(sourceOf('item:gitea/issue/42')).toEqual({ kind: 'item', words: 'Gitea issue 42', href: '' });
  });

  it('says how often runs used a note', () => {
    expect(usesWords(0)).toBe('not used yet');
    expect(usesWords(1)).toBe('used once');
    expect(usesWords(1200)).toBe('used 1,200 times');
  });

  it('groups the notes by scope: the notes of the person, the agent notes, then each duty, out of date first, and leaves put-away notes out', () => {
    const note = (name: string, scope: NoteItem['scope'], more: Partial<NoteItem> = {}): NoteItem => ({ agent: 'triage', scope, name, hash: 'h', state: 'checked', description: name, by: 'review', at: '2026-10-20T10:00:00Z', uses: 1, sources: 1, ...more });
    const groups = groupNotes(
      [
        note('a.md', { kind: 'agent' }),
        note('b.md', { kind: 'agent' }, { state: 'out-of-date', at: '2026-10-01T10:00:00Z' }),
        note('c.md', { kind: 'principal', principal: 'duty:nightly-sweep' }),
        note('d.md', { kind: 'principal', principal: 'alice@example.com' }),
        note('e.md', { kind: 'agent' }, { state: 'put-away' }),
      ],
      ME,
    );
    expect(groups.map((g) => g.title)).toEqual(['Your notes', 'Agent notes', 'The duty nightly-sweep']);
    expect(groups[1].items.map((n) => n.name)).toEqual(['b.md', 'a.md']);
  });
});

describe('who may change what, as access.go of the workbench decides', () => {
  const own = { kind: 'principal' as const, principal: 'alice@example.com' };
  it('lets a person change their own notes with the operator role, and the agent notes and the notes of a duty with the owner role', () => {
    expect(canEditNote({ scope: own, by: 'review' }, ME, 'operator')).toBe(true);
    expect(canEditNote({ scope: own, by: 'review' }, ME, 'viewer')).toBe(false);
    expect(canEditNote({ scope: { kind: 'agent' }, by: 'person:alice@example.com' }, ME, 'owner')).toBe(true);
    expect(canEditNote({ scope: { kind: 'agent' }, by: 'person:alice@example.com' }, ME, 'operator')).toBe(false);
    // The page offers no key on a note that the person did not write, outside their own scope.
    expect(canEditNote({ scope: { kind: 'agent' }, by: 'review' }, ME, 'owner')).toBe(false);
  });

  it('lets an operator undo and decide a change of their own notes, and only an owner any other change', () => {
    expect(canDecide({ note: 'a.md', scope: 'principal', principal: 'alice@example.com' }, ME, 'operator')).toBe(true);
    expect(canDecide({ note: 'a.md', scope: 'agent' }, ME, 'operator')).toBe(false);
    expect(canDecide({ note: 'a.md', scope: 'principal', principal: 'duty:sweep' }, ME, 'owner')).toBe(true);
    expect(canDecide({ routine: 'ack' }, ME, 'operator')).toBe(false);
    expect(canDecide({ routine: 'ack' }, ME, 'owner')).toBe(true);
  });
});

describe('the sentences of the journal and of a change that waits', () => {
  it('says what an entry did, for a note and for a routine', () => {
    expect(sentence(entrySentence({ what: 'learned', subject: { note: 'gotchas/gitea-labels.md' } }))).toBe('Learned the note Gitea labels.');
    expect(sentence(entrySentence({ what: 'out-of-date', subject: { note: 'gotchas/gitea-labels.md' } }))).toBe('The note Gitea labels went out of date.');
    expect(sentence(entrySentence({ what: 'put-away', subject: { note: 'x.md' } }))).toBe('Put away the note X.');
    expect(sentence(entrySentence({ what: 'stepped-back', subject: { routine: 'acknowledge-a-new-ticket' } }))).toBe('The routine Acknowledge a new ticket stepped back to rehearsing.');
    expect(sentence(entrySentence({ what: 'live', subject: { routine: 'reset-a-password' } }))).toBe('The routine Reset a password went live.');
    expect(sentence(entrySentence({ what: 'undone', subject: { routine: 'reset-a-password' } }))).toBe('Took back a change to the routine Reset a password.');
    expect(sentence(entrySentence({ what: 'stays-out', subject: { routine: 'reset-a-password' } }))).toBe('The proposal of the routine Reset a password stayed out.');
    expect(sentence(entrySentence({ what: 'paused', subject: { routine: 'reset-a-password' } }))).toBe('Paused the routine Reset a password.');
  });

  it('says what a waiting change would do', () => {
    expect(sentence(waitSentence({ what: 'learned', subject: { note: 'gotchas/vpn-reset.md' } }))).toBe('A new note: VPN reset');
    expect(sentence(waitSentence({ what: 'live', subject: { routine: 'reset-a-password' } }))).toBe('Let the routine Reset a password go live');
  });

  it('says in words why a change or an undo did not happen', () => {
    expect(conflictWords({ note: 'x.md' })).toBe('This note changed since. Read it again.');
    expect(conflictWords({ routine: 'x' })).toBe('This routine changed since. Read it again.');
    expect(undoRefusal({ note: 'x.md' })).toBe('A later change touched this note. Take that one back first.');
  });

  it('links the runs of an entry', () => {
    expect(runLinks(['r1'])).toEqual([{ label: 'The run', href: '/ui#run/r1', run: 'r1' }]);
    expect(runLinks(['r1', 'r2']).map((l) => l.label)).toEqual(['Run 1', 'Run 2']);
    expect(runLinks(undefined)).toEqual([]);
  });
});

describe('the four numbers', () => {
  it('gives the cost per job of every run with the trend of the server, the share of the normal runs done by routines, and the notes corrected', () => {
    expect(figuresOf(SUMMARY)).toEqual({ runs: 400, cost: '$0.02', trend: 'down 16%', routines: '37% of 380', corrected: '3' });
    expect(figuresOf({ ...SUMMARY, costPerJob: { usd: 0.0251, runs: 400, previousUsd: 0.025, trend: 'flat' } }).trend).toBe('about the same');
    expect(figuresOf({ ...SUMMARY, costPerJob: { usd: 0.02, runs: 0 } }).trend).toBe('');
  });

  it('shows no percentage from fewer than 20 runs: the share turns to counts, and the trend keeps only its word', () => {
    const f = figuresOf({ ...SUMMARY, costPerJob: { usd: 0.03, runs: 12, previousUsd: 0.06, trend: 'down' }, doneByRoutines: { runs: 12, byRoutine: 4, share: 1 / 3 } });
    expect(f.routines).toBe('4 of 12');
    expect(f.trend).toBe('down');
  });

  it('takes the rule of 20 and the line from the server, and adds the cost per job of each kind', () => {
    expect(heldBackLine(SUMMARY)).toBe('Held back 1 in 16 runs. Done well: 80% without what it learned, 91% with it. Cost per job: $0.04 without, $0.02 with.');
    // The server says not enough, whatever the page could count.
    expect(heldBackLine({ ...SUMMARY, compare: { enough: false, heldBack: 25, normal: 0, line: 'Not enough held-back runs yet.' } })).toBe('Not enough held-back runs yet.');
    // A line that the server leaves out is worded from its shares.
    expect(heldBackLine({ ...SUMMARY, heldBack: { ...SUMMARY.heldBack, costPerJobUsd: 0.021 }, compare: { ...SUMMARY.compare, line: '' } })).toBe(
      'Held back 1 in 16 runs. Done well: 80% without what it learned, 91% with it. Cost per job: $0.021 without, $0.020 with.',
    );
  });

  it('writes two costs that differ by less than a cent with three decimals, so the line never compares $0.02 with $0.02', () => {
    expect(moneyPair(0.021, 0.0196)).toEqual(['$0.021', '$0.020']);
    expect(moneyPair(0.04, 0.02)).toEqual(['$0.04', '$0.02']);
    expect(moneyPair(0.02, 0.02)).toEqual(['$0.02', '$0.02']);
    expect(moneyPair(0.004, 0.003)).toEqual(['$0.004', '$0.003']);
  });
});
