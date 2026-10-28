import { describe, expect, it } from 'vitest';
import type { KnowhowSummary, NoteItem } from '../api/knowhow';
import { byWords, conflictWords, entrySentence, figuresOf, groupNotes, heldBackLine, isMine, labelOf, moneyPair, noteTitle, runLinks, sourceOf, undoRefusal, usesWords, waitSentence } from './knowhow';

const ME = { subject: 'alice@example.com', name: 'Alice' };

const sentence = (s: { head: string; name: string; tail: string }) => s.head + s.name + s.tail;

const summary = (normal: Partial<KnowhowSummary['normal']>, heldBack: Partial<KnowhowSummary['heldBack']>, more: Partial<KnowhowSummary> = {}): KnowhowSummary => ({
  agent: 'triage',
  days: 7,
  normal: { runs: 0, doneWell: 0, costPerJob: 0, byRoutines: 0, ...normal },
  heldBack: { runs: 0, doneWell: 0, costPerJob: 0, byRoutines: 0, ...heldBack },
  notesCorrected: 3,
  ...more,
});

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

describe('the sentences of the journal and of a change that waits', () => {
  it('says what an entry did, for a note and for a routine', () => {
    expect(sentence(entrySentence({ what: 'learned', subject: { note: 'gotchas/gitea-labels.md' } }))).toBe('Learned the note Gitea labels.');
    expect(sentence(entrySentence({ what: 'out-of-date', subject: { note: 'gotchas/gitea-labels.md' } }))).toBe('The note Gitea labels went out of date.');
    expect(sentence(entrySentence({ what: 'put-away', subject: { note: 'x.md' } }))).toBe('Put away the note X.');
    expect(sentence(entrySentence({ what: 'stepped-back', subject: { routine: 'acknowledge-a-new-ticket' } }))).toBe('The routine Acknowledge a new ticket stepped back to rehearsing.');
    expect(sentence(entrySentence({ what: 'live', subject: { routine: 'reset-a-password' } }))).toBe('The routine Reset a password went live.');
    expect(sentence(entrySentence({ what: 'undone', subject: { routine: 'reset-a-password' } }))).toBe('Took back a change to the routine Reset a password.');
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
  it('gives the cost per job of every run with its trend, the share done by routines with its runs, and the notes corrected', () => {
    const f = figuresOf(summary({ runs: 380, doneWell: 346, costPerJob: 0.02, byRoutines: 140 }, { runs: 20, doneWell: 16, costPerJob: 0.04 }, { costPerJobBefore: 0.025 }));
    expect(f).toEqual({ runs: 400, cost: '$0.02', trend: 'down 16%', routines: '35% of 400', corrected: '3' });
  });

  it('shows no percentage from fewer than 20 runs: the share turns to counts, and the trend goes', () => {
    const f = figuresOf(summary({ runs: 12, doneWell: 10, costPerJob: 0.03, byRoutines: 4 }, {}, { costPerJobBefore: 0.06 }));
    expect(f.routines).toBe('4 of 12');
    expect(f.trend).toBe('');
  });

  it('compares the held-back runs with the others only from 20 held-back runs', () => {
    expect(heldBackLine(summary({ runs: 380, doneWell: 346, costPerJob: 0.021 }, { runs: 20, doneWell: 16, costPerJob: 0.035 }))).toBe(
      'Held back 1 in 20 runs. Done well: 80% without what it learned, 91% with it. Cost per job: $0.04 without, $0.02 with.',
    );
    expect(heldBackLine(summary({ runs: 380, doneWell: 346 }, { runs: 19, doneWell: 19 }))).toBe('Not enough held-back runs yet.');
    expect(heldBackLine(summary({ runs: 0 }, { runs: 0 }))).toBe('Not enough held-back runs yet.');
  });

  it('writes two costs that differ by less than a cent with three decimals, so the line never compares $0.02 with $0.02', () => {
    expect(moneyPair(0.021, 0.0196)).toEqual(['$0.021', '$0.020']);
    expect(moneyPair(0.04, 0.02)).toEqual(['$0.04', '$0.02']);
    expect(moneyPair(0.02, 0.02)).toEqual(['$0.02', '$0.02']);
    expect(moneyPair(0.004, 0.003)).toEqual(['$0.004', '$0.003']);
  });
});
