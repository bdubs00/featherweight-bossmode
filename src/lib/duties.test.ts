import { describe, expect, it } from 'vitest';
import type { Duty } from '../api/types';
import {
  PRESETS,
  applyPreset,
  checkFormOf,
  checkLine,
  checkOf,
  checkWords,
  domOf,
  dutyLight,
  dutyTitle,
  emptyForm,
  formErrors,
  formOf,
  foundWords,
  itemWords,
  limitWords,
  monthDayOf,
  nameOf,
  nameReason,
  presetOf,
  recordOf,
  retryWords,
  runLight,
  scheduleOf,
  seconds,
  spanText,
  toPlaceholders,
  toWords,
  whenError,
  whenFormOf,
  awayWords,
  tellWords,
  checkTools,
  decidedWords,
  dutyProblems,
  eventOf,
  eventWords,
  secretsFor,
  seededForm,
  splitProblem,
  startWords,
  whereOf,
  whereRowsOf,
} from './duties';

const duty = (over: Partial<Duty> = {}): Duty => ({
  name: 'daily-homelab-report',
  agent: 'docs-scribe',
  owner: 'alice@example.com',
  when: { schedule: { repeat: 'weekdays', times: ['09:00'], timeZone: 'America/New_York' } },
  do: { ask: { message: 'Write the report of {date}. Found: {found}' } },
  limits: { budget: { maxCostUSD: 0.5, maxTurns: 40 }, perDayUSD: 2, overlap: 'skip', catchUp: '1h', retries: 1 },
  whileAway: { decider: 'manager', timeout: '2h', then: 'deny' },
  notify: { failure: ['owner'], needsYou: ['owner'] },
  runAs: 'duty',
  paused: false,
  source: 'store',
  revision: 7,
  readback: 'Every weekday at 9:00 AM, New York time.',
  ...over,
});

describe('the placeholders of a message', () => {
  it('show as words in brackets and go back to the placeholders of the contract', () => {
    const stored = 'Report of {date} at {time}. Found: {found}. Last: {last.title}, {last.run}, {last.state}. Duty {duty}. Event {event}.';
    const words = toWords(stored);
    expect(words).toBe("Report of [Today's date] at [The time]. Found: [What the check found]. Last: [The last run's title], [The last run], [How the last run ended]. Duty [This duty's name]. Event [What happened].");
    expect(toPlaceholders(words)).toBe(stored);
  });

  it('leave every other brace and bracket as it is, and read the words in any case and with a curly apostrophe', () => {
    expect(toWords('A {foo} and {date.x} stay.')).toBe('A {foo} and {date.x} stay.');
    expect(toPlaceholders('See [the docs] and [today’s DATE].')).toBe('See [the docs] and {date}.');
    expect(toPlaceholders('[The time] [the  time]')).toBe('{time} {time}');
  });
});

describe('the schedule as a sentence', () => {
  it('reads each repeat into the sentence and writes only the fields of the repeat', () => {
    const z = 'Europe/Berlin';
    expect(scheduleOf(whenFormOf({ repeat: 'daily', times: ['08:00'], timeZone: z }, z))).toEqual({ repeat: 'daily', times: ['08:00'], timeZone: z });
    expect(scheduleOf(whenFormOf({ repeat: 'weekly', days: ['thu', 'mon'], everyWeeks: 2, times: ['15:00'], timeZone: z }, z))).toEqual({ repeat: 'weekly', days: ['mon', 'thu'], everyWeeks: 2, times: ['15:00'], timeZone: z });
    expect(scheduleOf(whenFormOf({ repeat: 'monthly', dayOfMonth: 'first monday', times: ['09:00'] }, z))).toEqual({ repeat: 'monthly', dayOfMonth: 'first monday', times: ['09:00'], timeZone: z });
    expect(scheduleOf(whenFormOf({ repeat: 'every', every: '2h', between: ['08:00', '18:00'], timeZone: z }, z))).toEqual({ repeat: 'every', every: '2h', between: ['08:00', '18:00'], timeZone: z });
    expect(scheduleOf(whenFormOf({ repeat: 'hourly', days: ['mon', 'tue', 'wed', 'thu', 'fri'], timeZone: z }, z))).toEqual({ repeat: 'hourly', days: ['mon', 'tue', 'wed', 'thu', 'fri'], timeZone: z });
    // A change of the repeat drops the fields of the old one.
    const f = whenFormOf({ repeat: 'weekly', days: ['mon'], times: ['09:00'] }, z);
    expect(scheduleOf({ ...f, repeat: 'hourly' })).toEqual({ repeat: 'hourly', days: ['mon'], timeZone: z });
    expect(scheduleOf({ ...f, repeat: 'weekdays' })).toEqual({ repeat: 'weekdays', times: ['09:00'], timeZone: z });
  });

  it('keeps the dates of a schedule, which the sentence does not show', () => {
    const s = { repeat: 'daily' as const, times: ['09:00'], timeZone: 'UTC', start: '2026-10-26', end: '2026-12-31' };
    expect(scheduleOf(whenFormOf(s, 'UTC'))).toEqual(s);
  });

  it('starts from the five presets in the zone of the sentence, and knows the preset that a sentence matches', () => {
    const f = whenFormOf(null, 'Asia/Tokyo');
    expect(PRESETS.map((p) => p.label)).toEqual(['Every morning', 'Every weekday', 'Every Monday', 'Every hour during work hours', 'First of the month']);
    const work = applyPreset(PRESETS[3], f);
    expect(scheduleOf(work)).toEqual({ repeat: 'hourly', days: ['mon', 'tue', 'wed', 'thu', 'fri'], between: ['09:00', '17:00'], timeZone: 'Asia/Tokyo' });
    expect(presetOf(work)).toBe('work-hours');
    expect(presetOf(applyPreset(PRESETS[4], f))).toBe('first');
    expect(presetOf({ ...work, between: ['08:00', '17:00'] })).toBe('');
  });

  it('splits the day of a month into two choices and joins them again', () => {
    expect(monthDayOf('15')).toEqual({ which: '15', weekday: '' });
    expect(monthDayOf('last')).toEqual({ which: 'last', weekday: '' });
    expect(monthDayOf('first monday')).toEqual({ which: 'first-weekday', weekday: 'mon' });
    expect(domOf({ which: 'last-weekday', weekday: 'fri' })).toBe('last friday');
    expect(domOf({ which: '3', weekday: '' })).toBe('3');
  });

  it('says what a sentence lacks', () => {
    const f = whenFormOf(null, 'UTC');
    expect(whenError(f)).toBe('');
    expect(whenError({ ...f, repeat: 'weekly', days: [] })).toBe('Pick at least one day.');
    expect(whenError({ ...f, times: [''] })).toBe('Pick at least one time.');
  });

  it('reads a span of the front in words', () => {
    expect(seconds('1h30m')).toBe(5400);
    expect(seconds('0')).toBe(0);
    expect(spanText('15m')).toBe('15 minutes');
    expect(spanText('2h')).toBe('2 hours');
    expect(spanText('24h')).toBe('a day');
    expect(spanText('1h30m')).toBe('1 hour 30 minutes');
  });
});

describe('the form of a duty', () => {
  it('reads a duty and writes the same record back, without the owner and with the revision', () => {
    const d = duty();
    const r = recordOf(formOf(d, 'UTC'), d, d.name);
    expect(r).toEqual({
      name: 'daily-homelab-report',
      agent: 'docs-scribe',
      when: { schedule: { repeat: 'weekdays', times: ['09:00'], timeZone: 'America/New_York' } },
      do: { ask: { message: 'Write the report of {date}. Found: {found}' } },
      limits: { budget: { maxCostUSD: 0.5, maxTurns: 40 }, perDayUSD: 2, overlap: 'skip', catchUp: '1h', retries: 1 },
      whileAway: { decider: 'manager', timeout: '2h', then: 'deny' },
      notify: { failure: ['owner'], needsYou: ['owner'] },
      runAs: 'duty',
      paused: false,
      revision: 7,
    });
    expect('owner' in r).toBe(false);
  });

  it('keeps what the form does not show: an event start, another action, other people to tell, and the limits of tokens', () => {
    const d = duty({
      when: { webhook: { auth: { mode: 'bearer', secret: 'HOOK' } } },
      do: { post: { bridge: 'b1', message: 'Hello' } },
      notify: { failure: ['owner', 'bob@example.com'], needsYou: [] },
      limits: { budget: { maxCostUSD: 1, maxTokens: 9000 } },
      pool: 'crew',
    });
    const f = { ...formOf(d, 'UTC'), failures: false, questions: true };
    const r = recordOf(f, d, d.name);
    expect(r.when).toEqual(d.when);
    expect(r.do).toEqual(d.do);
    expect(r.notify).toEqual({ failure: ['bob@example.com'], needsYou: ['owner'] });
    expect(r.limits.budget).toEqual({ maxCostUSD: 1, maxTokens: 9000 });
    expect(r.pool).toBe('crew');
  });

  it('reads the shared channels of notify into the form, and writes each one that is on as channel:<name>', () => {
    const d = duty({ notify: { failure: ['bob@example.com', 'owner', 'channel:ops-room'], needsYou: ['channel:pager'] } });
    const f = formOf(d, 'UTC');
    expect([f.failures, f.questions, f.channelFailures, f.channelQuestions]).toEqual([true, false, ['ops-room'], ['pager']]);
    expect(recordOf(f, d, d.name).notify).toEqual({ failure: ['bob@example.com', 'owner', 'channel:ops-room'], needsYou: ['channel:pager'] });
    const r = recordOf({ ...f, channelFailures: [], channelQuestions: ['pager', 'ops-room'] }, d, d.name);
    expect(r.notify).toEqual({ failure: ['bob@example.com', 'owner'], needsYou: ['channel:pager', 'channel:ops-room'] });
    expect(emptyForm('UTC')).toMatchObject({ channelFailures: [], channelQuestions: [] });
  });

  it('sends a new duty with no budget of its own, so a save without one fails', () => {
    const f = { ...emptyForm('UTC'), agent: 'scribe', message: 'Draft the notes of [Today’s date].' };
    const r = recordOf(f, null, 'draft-the-notes');
    expect(r.limits.budget).toEqual({});
    expect(r.do.ask!.message).toBe('Draft the notes of {date}.');
    expect(r.whileAway).toEqual({ decider: 'manager', timeout: '2h', then: 'deny' });
    expect(r.notify).toEqual({ failure: ['owner'], needsYou: ['owner'] });
    expect(r.limits.catchUp).toBe('1h');
    expect('revision' in r).toBe(false);
    const opts = { fresh: true, name: 'draft-the-notes', taken: ['other'], keepsWhen: false };
    expect(formErrors(f, opts)).toEqual({ cost: 'A duty needs a budget. Write the most a run can cost, such as 0.50.' });
    expect(formErrors({ ...f, cost: '0' }, opts).cost).toBe('Write an amount above 0, such as 0.50.');
    expect(formErrors({ ...f, cost: '$0.50' }, opts)).toEqual({});
    expect(recordOf({ ...f, cost: '$0.50', turns: '12', perDay: '2' }, null, 'x').limits).toEqual({ budget: { maxCostUSD: 0.5, maxTurns: 12 }, perDayUSD: 2, overlap: 'skip', catchUp: '1h' });
  });

  it('asks for an agent, a message, a free name, and a whole count of items', () => {
    const f = { ...emptyForm('UTC'), cost: '1', check: { ...checkFormOf(null), url: 'https://q.example/api', wake: 'atLeast' as const, count: 'x' } };
    const e = formErrors(f, { fresh: true, name: 'taken', taken: ['taken'], keepsWhen: false });
    expect(e).toEqual({ agent: 'Pick the agent that does the duty.', message: 'Write what the agent does.', count: 'Write a whole number of items.', name: 'A duty of this name exists. Pick another name.' });
    expect(nameReason('Daily Report', [])).toBe('A name holds 1 to 63 of a to z, 0 to 9, hyphens, and underscores.');
    expect(nameReason('', [])).toBe('Give the duty a name.');
    // new is the draft of a duty without a name, and options is a route of the front.
    expect(nameReason('new', [])).toBe('The names new and options are kept for the page. Pick another name.');
    expect(nameReason('options', [])).toBe('The names new and options are kept for the page. Pick another name.');
    expect(nameReason('new-report', [])).toBe('');
  });

  it('makes a name from what the duty does', () => {
    expect(nameOf("Write the report of [Today's date] to homelab/reports.")).toBe('write-the-report-of-to-homelab');
    expect(nameOf('')).toBe('');
    // A name ends on a word that carries the meaning, never on a joining word that reads as cut.
    expect(nameOf('List the new helpdesk tickets in one line each.')).toBe('list-the-new-helpdesk-tickets');
    expect(nameOf('Check the backups of the cluster and report.')).toBe('check-the-backups-of-the-cluster');
    expect(nameOf('Summarize everything that happened yesterday in the incident channel of the platform team')).toBe('summarize-everything-that-happened');
    expect(nameOf('The')).toBe('the');
  });
});

describe('the check', () => {
  it('reads a check into the fields and back, with the kinds of the values of a tool', () => {
    const c = { look: { tool: 'servicenow.query_incidents', input: { query: 'priority<=2', limit: 20 } }, items: 'result.records', key: 'number', where: [{ field: 'priority', oneOf: [1, 2] }], wake: { when: 'new' as const } };
    const f = checkFormOf(c);
    expect(f.look).toBe('tool');
    expect(f.input.map((r) => [r.name, r.text])).toEqual([
      ['query', 'priority<=2'],
      ['limit', '20'],
    ]);
    expect(checkOf(f)).toEqual(c);
    expect(checkOf({ ...f, input: f.input.map((r) => (r.name === 'limit' ? { ...r, text: '50' } : r)) })!.look.input).toEqual({ query: 'priority<=2', limit: 50 });
    expect(checkOf({ ...f, tool: '' })).toBeNull();
    expect(checkOf({ ...checkFormOf(null), url: 'https://q.example/api', secret: 'Q_TOKEN', wake: 'atLeast', count: '5' })).toEqual({ look: { http: { url: 'https://q.example/api', secret: 'Q_TOKEN' } }, wake: { when: 'atLeast', count: 5 } });
  });

  it('reads a check back in words from the record', () => {
    expect(checkWords({ look: { tool: 'servicenow.query_incidents' }, items: 'result.records', key: 'number', where: [{ field: 'priority', oneOf: [1, 2] }], wake: { when: 'new' } }, 'Triage')).toBe(
      'Call the tool servicenow.query_incidents of Triage. Take the list at result.records. Keep the items where priority is one of 1 and 2. Wake Triage only for items whose number it did not see before.',
    );
    expect(checkWords({ look: { http: { url: 'https://example.com/api/queue' } }, wake: { when: 'atLeast', count: 5 } }, '')).toBe('Look at example.com/api/queue. Take the whole answer as the list. Wake the agent at 5 items or more.');
  });

  it('says what a check finds now', () => {
    expect(foundWords({ found: [{}, {}], count: 2, wakes: true }, 'the agent')).toBe('Now: 2 items. They would wake the agent.');
    expect(foundWords({ found: [{}], count: 1, wakes: false }, 'Triage')).toBe('Now: 1 item. It would not wake Triage.');
    expect(foundWords({ found: [], count: 0, wakes: false }, 'the agent')).toBe('Now: no items. The agent would sleep.');
    expect(itemWords({ number: 'INC0012', short: 'VPN down' }, 'number')).toBe('INC0012');
    expect(itemWords({ id: 3, title: 'Disk full' }, '')).toBe('Disk full');
  });
});

describe('a duty in words', () => {
  it('gives each run its light and what its check found', () => {
    expect(runLight(null).word).toBe('not run yet');
    // A start that goes again holds a still amber light: it waits for nothing from the person.
    expect(runLight({ at: '', state: 'retrying', run: '', reason: 'The run failed: the model answered 529. It goes again.' })).toEqual({ word: 'retrying', tone: 'amber', still: true, label: 'The run failed: the model answered 529. It goes again.' });
    expect(retryWords({ reason: 'The queue of triage did not answer. It goes again.' })).toBe('The run failed: the queue of triage did not answer. It goes again.');
    expect(retryWords({ reason: 'The run failed: no worker' })).toBe('The run failed: no worker. It goes again.');
    expect(retryWords({})).toBe('The run failed, and it goes again.');
    expect(runLight({ at: '', state: 'completed', run: 'r1' })).toMatchObject({ word: 'finished', tone: 'grey' });
    expect(runLight({ at: '', state: 'failed', reason: 'The model refused.' })).toMatchObject({ word: 'failed', tone: 'red', label: 'The model refused.' });
    expect(runLight({ at: '', state: 'running' })).toMatchObject({ word: 'working', tone: 'green' });
    expect(runLight({ at: '', state: 'input-required' })).toMatchObject({ word: 'needs you', tone: 'amber' });
    expect(runLight({ at: '', state: 'completed', found: 0, woke: false })).toMatchObject({ word: 'slept', tone: 'grey' });
    expect(runLight({ at: '', state: 'skipped', reason: 'The last run still works.' })).toMatchObject({ word: 'skipped', label: 'The last run still works.' });
    expect(checkLine({ at: '', state: 'completed', found: 2, woke: true })).toBe('Found 2, woke the agent');
    expect(checkLine({ at: '', state: 'completed', found: 0, woke: false })).toBe('Found nothing');
    expect(checkLine({ at: '', state: 'failed', found: 0, woke: false, reason: 'The check failed.' })).toBe('');
    expect(checkLine({ at: '', state: 'completed' })).toBe('');
  });

  it('says what a duty does, its limits, who decides, and what you hear of', () => {
    const d = duty();
    expect(dutyTitle(d)).toBe("Write the report of [Today's date].");
    expect(dutyTitle({ name: 'weekly-patching', do: {} })).toBe('Weekly patching');
    expect(dutyLight(duty({ paused: true, state: { pausedReason: 'Three runs in a row failed.' } }))).toMatchObject({ word: 'paused', label: 'Three runs in a row failed.' });
    expect(dutyLight(d, true).word).toBe('paused');
    expect(limitWords(d.limits)).toEqual(['A run gets at most $0.50 and 40 turns.', 'The duty spends at most $2.00 a day.', 'A time that comes while the last run works is skipped.', 'A missed time runs once, within 1 hour.']);
    // A duty without a schedule misses no time.
    expect(limitWords(d.limits, false)).toEqual(['A run gets at most $0.50 and 40 turns.', 'The duty spends at most $2.00 a day.', 'A time that comes while the last run works is skipped.']);
    expect(awayWords(d.whileAway)).toBe('The manager decides a question for you. After 2 hours without an answer, the answer is no.');
    expect(awayWords({ decider: 'nobody', timeout: '30m', then: 'cancel' })).toBe('Nobody decides a question for you. After 30 minutes without an answer, the run stops.');
    expect(tellWords(d.notify)).toBe('Failures and questions.');
    expect(tellWords({ failure: [], needsYou: [] })).toBe('Nothing.');
    // A shared channel of the operator hears of what the duty names for it, by its label.
    const label = (n: string) => (n === 'ops-room' ? 'Ops room' : n);
    expect(tellWords({ failure: ['owner', 'channel:ops-room'], needsYou: ['channel:ops-room', 'channel:pager'] }, label)).toBe(
      'Failures. The Ops room channel hears of failures and questions. The pager channel hears of questions.',
    );
  });

  it('says who decided a question while the person was away', () => {
    expect(decidedWords({ at: '', by: 'manager', verdict: 'allow', tool: 'shell.exec', reason: 'it only reads the disk' })).toBe('The manager allowed shell.exec: it only reads the disk');
    expect(decidedWords({ at: '', by: 'manager', verdict: 'deny', tool: 'shell.exec' })).toBe('The manager denied shell.exec.');
    expect(decidedWords({ at: '', by: 'timeout', verdict: 'deny', tool: 'git.push' })).toBe('Nobody answered in time, so git.push was denied.');
    expect(decidedWords({ at: '', by: 'timeout', verdict: 'cancel', tool: 'git.push' })).toBe('Nobody answered in time, so the run stopped at git.push.');
    expect(decidedWords({ at: '', by: 'bob@example.com', verdict: 'cancel', tool: 'bash', reason: 'wrong host' })).toBe('Bob stopped the run at bash: wrong host');
    expect(decidedWords({ at: '', by: 'alice@example.com', verdict: 'allow', tool: 'bash' }, 'alice@example.com')).toBe('You allowed bash.');
  });
});

describe('the problems of the front', () => {
  it('read the path of a field before the colon, and keep a problem with no path whole', () => {
    expect(splitProblem('when.schedule: pick a time of the day.')).toEqual({ path: 'when.schedule', text: 'Pick a time of the day.' });
    expect(splitProblem('do.post.bridge: The bridge is closed.')).toEqual({ path: 'do.post.bridge', text: 'The bridge is closed.' });
    expect(splitProblem('when.schedule.times[1]: 25:00 is not a time.')).toEqual({ path: 'when.schedule.times[1]', text: '25:00 is not a time.' });
    expect(splitProblem('The agent cannot run at night.')).toEqual({ path: '', text: 'The agent cannot run at night.' });
    // A sentence with a colon is no path.
    expect(splitProblem('Note: the agent sleeps.')).toEqual({ path: '', text: 'Note: the agent sleeps.' });
  });

  it('sort by the place of the editor that shows them', () => {
    expect(
      dutyProblems([
        'when.say: After lunch is not a time: pick one.',
        'limits.budget: A duty needs a budget.',
        'limits.budget.maxTurns: Write a whole number.',
        'limits.perDayUSD: Too much.',
        'do.ask.message: Write what the agent does.',
        'do.post.to[0]: No such member.',
        'do.open.playbook: No such playbook.',
        'checkFirst.look.http.url: The address starts with https://.',
        'runAs: Only the owner sets this.',
        'The front is busy.',
      ]),
    ).toEqual({
      when: ['After lunch is not a time: pick one.'],
      cost: ['A duty needs a budget.'],
      turns: ['Write a whole number.'],
      perDay: ['Too much.'],
      message: ['Write what the agent does.'],
      to: ['No such member.'],
      playbook: ['No such playbook.'],
      check: ['The address starts with https://.'],
      top: ['Only the owner sets this.', 'The front is busy.'],
    });
  });
});

describe('events and actions', () => {
  it('say an event in words and write only the fields of its kind', () => {
    expect(eventWords({ kind: 'bridge.closed' })).toBe('When a bridge closes');
    expect(eventWords({ kind: 'bridge.closed', agent: 'triage' }, (a) => a.toUpperCase())).toBe('When a bridge of TRIAGE closes');
    expect(eventWords({ kind: 'question.waiting', after: '2h' })).toBe('When a question waits longer than 2 hours');
    expect(eventWords({ kind: 'page.changed', path: 'homelab/' })).toBe('When a page under homelab/ changes');
    expect(eventWords({ kind: 'something.new' })).toBe('When something happens in the fleet');
    expect(startWords({ when: { event: { kind: 'run.failed', agent: 'backup' } } })).toBe('When a run of backup fails');
    expect(eventOf({ kind: 'page.changed', agent: 'triage', after: '1h', path: ' homelab/ ' })).toEqual({ kind: 'page.changed', path: 'homelab/' });
    expect(eventOf({ kind: 'question.waiting', agent: '', after: '30m', path: '' })).toEqual({ kind: 'question.waiting', after: '30m' });
  });

  it('read and write each action, and start a new duty from what Make this a duty brought', () => {
    const post = duty({ do: { post: { bridge: 'b1', to: ['reviewer'], message: 'Review {date}.' } } });
    const f = formOf(post, 'UTC');
    expect([f.act, f.bridge, f.to, f.message]).toEqual(['post', 'b1', ['reviewer'], "Review [Today's date]."]);
    expect(recordOf(f, post, post.name).do).toEqual(post.do);
    expect(recordOf({ ...f, to: [] }, post, post.name).do).toEqual({ post: { bridge: 'b1', message: "Review {date}." } });
    const open = duty({ do: { open: { playbook: 'weekly-patching', goal: 'Patch on {date}.' } } });
    const g = formOf(open, 'UTC');
    expect([g.act, g.playbook, g.goal]).toEqual(['open', 'weekly-patching', "Patch on [Today's date]."]);
    expect(recordOf(g, open, open.name).do).toEqual(open.do);
    expect(recordOf({ ...g, goal: '' }, open, open.name).do).toEqual({ open: { playbook: 'weekly-patching' } });
    expect(recordOf({ ...g, act: 'manager', message: 'Sum up the week.' }, open, open.name).do).toEqual({ manager: { message: 'Sum up the week.' } });
    const ev = duty({ when: { event: { kind: 'bridge.closed', agent: 'triage' } } });
    const h = formOf(ev, 'UTC');
    expect([h.start, h.event.kind, h.event.agent]).toEqual(['event', 'bridge.closed', 'triage']);
    expect(recordOf(h, ev, ev.name).when).toEqual({ event: { kind: 'bridge.closed', agent: 'triage' } });
    const s = seededForm({ agent: 'manager', act: 'manager', message: 'Check the backups.' }, 'UTC');
    expect([s.agent, s.act, s.message, s.cost]).toEqual(['manager', 'manager', 'Check the backups.', '']);
    expect(seededForm({ act: 'nonsense' as never }, 'UTC').act).toBe('ask');
    const opts = { fresh: false, name: 'x', taken: [], keepsWhen: false };
    expect(formErrors({ ...s, act: 'post', cost: '1' }, opts)).toEqual({ bridge: 'Pick the bridge.' });
    expect(formErrors({ ...s, act: 'open', message: '', cost: '1' }, opts)).toEqual({ playbook: 'Pick a playbook.' });
    expect(formErrors({ ...s, start: 'event', cost: '1' }, opts)).toEqual({ when: 'Pick what starts the duty.' });
    expect(formErrors({ ...s, cost: '1', when: { ...s.when, start: '2026-12-01', end: '2026-11-01' } }, opts)).toEqual({ dates: 'The last day comes before the first day.' });
  });
});

describe('the check by hand', () => {
  it('edits the filters, and keeps the kind of a value that did not change', () => {
    const rows = whereRowsOf([{ field: 'priority', oneOf: [1, 2] }, { field: 'active', is: true }, { field: 'age', atLeast: 3 }]);
    expect(rows.map((r) => [r.field, r.test, r.text])).toEqual([
      ['priority', 'oneOf', '1, 2'],
      ['active', 'is', 'true'],
      ['age', 'atLeast', '3'],
    ]);
    expect(whereOf(rows)).toEqual([{ field: 'priority', oneOf: [1, 2] }, { field: 'active', is: true }, { field: 'age', atLeast: 3 }]);
    const changed = [{ ...rows[0], text: '1, 2, P3' }, { ...rows[1], test: 'contains' as const, text: 'yes' }, { ...rows[2], text: '5' }, { field: ' ', test: 'is' as const, text: 'x' }];
    expect(whereOf(changed)).toEqual([{ field: 'priority', oneOf: [1, 2, 'P3'] }, { field: 'active', contains: 'yes' }, { field: 'age', atLeast: 5 }]);
  });

  it('offers the secrets of the host of the address, and the tools of the agent', () => {
    const secrets = [
      { name: 'QUEUE_TOKEN', hosts: ['q.example.com'] },
      { name: 'WIDE', hosts: ['*.example.com'] },
      { name: 'NODES', hosts: ['node[0-9].lab', 'api?.lab'] },
      { name: 'PORTED', hosts: ['api.lab:8443'] },
    ];
    expect(secretsFor(secrets, 'https://q.example.com/api').map((s) => s.name)).toEqual(['QUEUE_TOKEN', 'WIDE']);
    // The host name, in lower case and without the port, is what the pattern matches.
    expect(secretsFor(secrets, 'https://Q.Example.COM:8443/api').map((s) => s.name)).toEqual(['QUEUE_TOKEN', 'WIDE']);
    expect(secretsFor(secrets, 'https://a.b.example.com/').map((s) => s.name)).toEqual(['WIDE']);
    expect(secretsFor(secrets, 'https://example.com/').map((s) => s.name)).toEqual([]);
    expect(secretsFor(secrets, 'http://node4.lab:9000/q').map((s) => s.name)).toEqual(['NODES']);
    expect(secretsFor(secrets, 'http://api1.lab/q').map((s) => s.name)).toEqual(['NODES']);
    // A pattern with a port never matches, because the host name has none.
    expect(secretsFor(secrets, 'https://api.lab:8443/x').map((s) => s.name)).toEqual([]);
    expect(secretsFor(secrets, 'not an address')).toEqual([]);
    const catalog = [
      { name: 'query_incidents', source: 'servicenow' },
      { name: 'get_incident', source: 'servicenow' },
      { name: 'bash', origin: 'builtin' as const, source: 'builtin' },
    ];
    expect(checkTools(['servicenow.*', 'bash', 'github.*'], catalog)).toEqual(['servicenow.query_incidents', 'servicenow.get_incident', 'bash']);
    expect(checkTools(undefined, catalog)).toEqual(['bash', 'servicenow.get_incident', 'servicenow.query_incidents']);
  });
});
