// Needs you from the items of the inbox of the front: one row per item that
// the one count counts, each with its ways out, and each landing where the
// person takes them. The items are the answer of the fake, which builds them
// as the front does (inbox.fromBoard).

import { describe, expect, it } from 'vitest';
import type { InboxItem } from '../../api/types';
import { fromItems, needsOfItems, type NeedsInput } from './needs';

const at = '2026-10-28T10:00:00Z';
const card = (id: string) => id + '@' + at;

/** ITEMS is the shape of the inbox of the fake: three items of Needs you, three to check, a paused job and a failure, and two notes. */
const ITEMS: InboxItem[] = [
  { kind: 'approval', run: 'duty-restore-0', approval: 'ap-restore', duty: 'nightly-restore-test', agent: 'backup', bridge: '', text: 'backup waits for your answer.', since: at, card: card('duty:nightly-restore-test'), costUSD: 0.07, summary: 'Asks before it runs bash: restic restore', actions: ['allow', 'deny'] },
  { kind: 'approval', run: 'run-p-2', approval: 'ap-push', duty: '', agent: 'migrator', bridge: 'br-puppet', handle: 'migrator-2', text: 'migrator-2 in Migrate the remaining Puppet modules waits for a decision.', since: at, card: 'bridge:br-puppet', costUSD: 0.7, summary: 'Asks before it runs bash: git push', channel: 'Migrate the remaining Puppet modules', actions: ['allow', 'deny'] },
  { kind: 'question', run: 'run-scribe', approval: 'q-scribe', duty: '', agent: 'scribe', bridge: 'br-notes', handle: 'scribe', text: 'scribe asks in Release notes for 2.4: Who reads these notes first?', since: at, card: 'bridge:br-notes', costUSD: 0.28, summary: 'Who reads these notes first?', channel: 'Release notes for 2.4', actions: ['answer', 'decline'] },
  { kind: 'result', run: '', approval: '', duty: '', agent: 'writer', bridge: 'br-launch', text: 'Write the launch email: the agents finished.', since: at, card: 'bridge:br-launch', costUSD: 0.12, summary: 'Done: the prices change on November 15.', channel: 'Write the launch email', actions: ['looks-right', 'needs-work'] },
  { kind: 'result', run: 'run-drift', approval: '', duty: 'check-the-web-hosts', agent: 'ops', bridge: '', text: 'Check the web hosts: it found something.', since: at, card: card('duty:check-the-web-hosts'), costUSD: 0.04, summary: 'Found: web-2 drifted from its role in two files.', actions: ['looks-right', 'needs-work'] },
  { kind: 'paused', run: '', approval: '', duty: 'monthly-migration', agent: 'writer', bridge: '', text: 'The job monthly-migration paused itself: three runs in a row failed.', since: at },
  { kind: 'failure', run: 'run-x', approval: '', duty: 'review-after-close', agent: 'reviewer', bridge: '', text: 'The job review-after-close: the queue did not take the run.', since: at },
  { kind: 'note', run: '', approval: '', duty: '', agent: 'triage', bridge: '', note: 'triage.01', text: 'triage wrote a note, ports.md. Keep it?', since: at, actions: ['keep', 'refuse'] },
];

const input: NeedsInput = {
  cards: [],
  rows: [],
  waiting: [],
  agentName: (a) => a.charAt(0).toUpperCase() + a.slice(1),
  channelTitle: (id) => 'Channel ' + id,
  jobTitle: (n) => 'Job ' + n,
};

describe('Needs you from the items of the front', () => {
  it('reads the items as they are only from a front that names their task or their ways out', () => {
    expect(fromItems(ITEMS)).toBe(true);
    expect(fromItems([{ kind: 'approval', run: 'r', approval: 'a', text: 'x', since: at }])).toBe(false);
    expect(fromItems(null)).toBe(false);
  });

  it('gives one row per counted item and per failed job, each with its ways out and a place that offers them, and no row for a paused job', () => {
    const rows = needsOfItems(input, ITEMS);
    // The count of the front counts six cards and the note: so do the rows.
    // A failed job waits for the person too: Run again or Pause, on the page of the job.
    expect(rows.length).toBe(7);
    const failed = rows.find((r) => r.kind === 'failed')!;
    expect([failed.href, failed.actions, failed.head, failed.duty]).toEqual(['#j/review-after-close', ['run-again', 'pause'], 'The queue did not take the run.', 'review-after-close']);
    for (const r of rows) expect(r.actions && r.actions.length).toBeGreaterThan(0);
    const by = (card: string) => rows.find((r) => r.card === card)!;
    // A decision of a job waits on its task, a decision and a question of a channel on its tab Decisions.
    expect([by(card('duty:nightly-restore-test')).kind, by(card('duty:nightly-restore-test')).href, by(card('duty:nightly-restore-test')).actions]).toEqual(['asks', '#r/duty-restore-0', ['allow', 'deny']]);
    expect([by('bridge:br-puppet').href, by('bridge:br-puppet').approval]).toEqual(['#c/br-puppet/decisions', 'ap-push']);
    expect([by('bridge:br-notes').kind, by('bridge:br-notes').href, by('bridge:br-notes').actions]).toEqual(['question', '#c/br-notes/decisions', ['answer', 'decline']]);
    // A result of a channel signs off at the top of its posts, and a result of a run on its task.
    expect([by('bridge:br-launch').kind, by('bridge:br-launch').href, by('bridge:br-launch').actions]).toEqual(['check', '#c/br-launch', ['looks-right', 'needs-work']]);
    expect(by(card('duty:check-the-web-hosts')).href).toBe('#r/run-drift');
    // A note waits on its agent, with Keep and Not now.
    const note = rows.find((r) => r.note === 'triage.01')!;
    expect([note.kind, note.href, note.actions]).toEqual(['suggestion', '#a/triage', ['keep', 'refuse']]);
  });

  it('heads a row with the summary of the front, and names the channel, the agent, and the cost once each', () => {
    const rows = needsOfItems(input, ITEMS);
    const launch = rows.find((r) => r.card === 'bridge:br-launch')!;
    expect(launch.head).toBe('Done: the prices change on November 15.');
    expect(launch.line).toBe('Sign off · Write the launch email · Writer · $0.12');
    const puppet = rows.find((r) => r.card === 'bridge:br-puppet')!;
    expect(puppet.line).toBe('Asks first · Migrate the remaining Puppet modules · migrator-2 · $0.70');
  });
});

describe('a paused job that the server counts', () => {
  const paused: InboxItem = { kind: 'paused', run: '', approval: '', duty: 'monthly-migration', agent: 'writer', bridge: '', text: 'The job monthly-migration paused itself: three runs in a row failed.', since: at, card: card('duty:monthly-migration'), actions: ['resume', 'run-again', 'let-go'] };

  it('is a row of the kind paused that opens the job, with its ways out', () => {
    const rows = needsOfItems(input, [paused]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('paused');
    expect(rows[0].head).toBe('Three runs in a row failed.');
    expect(rows[0].href).toContain('monthly-migration');
    expect(rows[0].actions).toEqual(['resume', 'run-again', 'let-go']);
  });

  it('is no row while the server does not count it', () => {
    const rows = needsOfItems(input, [{ ...paused, card: undefined, actions: undefined }]);
    expect(rows).toHaveLength(0);
  });
});

