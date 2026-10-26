import { describe, expect, it } from 'vitest';
import type { Duty } from '../api/types';
import {
  OPEN_NEEDS_TURNS,
  POST_SPENDS,
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
  DATES_ERROR,
  datesError,
  dutyShape,
  dutyWhat,
  moneyIn,
  nameWordsReason,
  nextTime,
  scheduleWordsIn,
  slugOf,
  titleWordsOf,
  dutySlot,
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

  it('keeps what the form does not show: an event start, another action, other people to tell, and the limits of tokens of a duty that asks', () => {
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
    // A post spends nothing of its own, so the record holds no budget. A duty that asks keeps the limit of tokens.
    expect(r.limits.budget).toBeUndefined();
    expect(recordOf({ ...f, act: 'ask', message: 'Hello' }, d, d.name).limits.budget).toEqual({ maxCostUSD: 1, maxTokens: 9000 });
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

  it('makes the short name from the name in words, and says why a name in words cannot name a duty', () => {
    expect(slugOf('Walk Duty 1')).toBe('walk-duty-1');
    expect(slugOf('  Café / backups: nightly!  ')).toBe('cafe-backups-nightly');
    expect(slugOf('daily_report')).toBe('daily_report');
    expect(slugOf('—')).toBe('');
    const long = slugOf('Summarize every ticket that came in over the weekend for the platform team and the ops team');
    expect(long.length).toBeLessThanOrEqual(63);
    expect(long.endsWith('-')).toBe(false);
    expect(long).toBe('summarize-every-ticket-that-came-in-over-the-weekend-for-the');
    expect(nameWordsReason('Walk Duty 1', [])).toBe('');
    expect(nameWordsReason('  ', [])).toBe('Give the duty a name.');
    expect(nameWordsReason('???', [])).toBe('A name needs at least one letter from a to z, or a digit.');
    expect(nameWordsReason('New', [])).toBe('The names new and options are kept for the page. Pick another name.');
    expect(nameWordsReason('Daily report', ['daily-report'])).toBe('A duty of this name exists. Pick another name.');
    // The form checks the name in words.
    const f = { ...emptyForm('UTC'), agent: 'x', message: 'Hi.', cost: '1' };
    expect(formErrors(f, { fresh: true, name: 'Walk Duty 1', taken: ['walk-duty-1'], keepsWhen: false })).toEqual({ name: 'A duty of this name exists. Pick another name.' });
    expect(formErrors(f, { fresh: true, name: 'Walk Duty 2', taken: ['walk-duty-1'], keepsWhen: false })).toEqual({});
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
    // A tool of the server loses its prefix, and a tool with words says what it does.
    expect(checkWords({ look: { tool: 'front.pages_list' } }, 'Docs Scribe')).toBe('Call the tool pages_list of Docs Scribe. Take the whole answer as the list. Wake Docs Scribe only for items that it did not see before.');
    expect(checkWords({ look: { tool: 'front.pages_list' } }, 'Docs Scribe', () => 'List the pages of the wiki')).toBe(
      'Call a tool of Docs Scribe: list the pages of the wiki. Take the whole answer as the list. Wake Docs Scribe only for items that it did not see before.',
    );
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
    expect(runLight({ at: '', state: 'quiet', found: 0, woke: false })).toMatchObject({ word: 'slept', tone: 'grey' });
    // The front sends woke false also for the run of a duty without a check.
    expect(runLight({ at: '', state: 'completed', found: 0, woke: false })).toMatchObject({ word: 'finished', tone: 'grey' });
    expect(runLight({ at: '', state: 'skipped', reason: 'The last run still works.' })).toMatchObject({ word: 'skipped', label: 'The last run still works.' });
    expect(checkLine({ at: '', state: 'completed', found: 2, woke: true })).toBe('Found 2, woke the agent');
    expect(checkLine({ at: '', state: 'quiet', found: 0, woke: false })).toBe('Found nothing');
    expect(checkLine({ at: '', state: 'quiet', found: 3, woke: false })).toBe('Found 3');
    expect(checkLine({ at: '', state: 'completed', found: 0, woke: false })).toBe('');
    expect(checkLine({ at: '', state: 'failed', found: 0, woke: false, reason: 'The check failed.' })).toBe('');
    expect(checkLine({ at: '', state: 'completed' })).toBe('');
  });

  it('says what a duty does, its limits, who decides, and what you hear of', () => {
    const d = duty();
    // A duty without a title goes by its name as it is. What the duty does is its first line.
    expect(dutyTitle(d)).toBe('daily-homelab-report');
    expect(dutyTitle({ name: 'weekly-patching' })).toBe('weekly-patching');
    expect(dutyWhat(d)).toBe("Write the report of [Today's date].");
    expect(dutyWhat({ do: { open: { playbook: 'weekly-patching' } } })).toBe('Open a bridge from the playbook weekly-patching');
    expect(dutyWhat({ do: {} })).toBe('');
    expect(dutyLight(duty({ paused: true, state: { pausedReason: 'Three runs in a row failed.' } }))).toMatchObject({ word: 'paused', label: 'Three runs in a row failed.' });
    expect(dutyLight(d, true).word).toBe('paused');
    expect(limitWords(d.limits)).toEqual(['A run gets at most $0.50 and 40 turns.', 'The duty spends at most $2.00 a day.', 'A time that comes while the last run works is skipped.', 'A missed time runs once, within 1 hour.']);
    // A duty without a schedule misses no time, and has starts, not times.
    expect(limitWords(d.limits, false)).toEqual(['A run gets at most $0.50 and 40 turns.', 'The duty spends at most $2.00 a day.', 'A start that comes while the last run works is skipped.']);
    expect(limitWords({ ...d.limits, overlap: 'allow' }, false)[2]).toBe('A start that comes while the last run works runs anyway.');
    // A run of ask or manager without a cost limit says so.
    expect(limitWords({ budget: { maxTurns: 40 }, overlap: 'skip', catchUp: '0' })).toEqual(['A run has no cost limit.', 'A run gets at most 40 turns.', 'A time that comes while the last run works is skipped.', 'A missed time does not run.']);
    expect(limitWords({ budget: {} }, false, 'manager')).toEqual(['A run has no cost limit.', 'A start that comes while the last run works is skipped.']);
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
    // A call reads as what it does, such as a shell command, and a tool that the page does not know keeps its name.
    expect(decidedWords({ at: '', by: 'manager', verdict: 'allow', tool: 'shell.exec', reason: 'it only reads the disk' })).toBe('The manager allowed a shell command: it only reads the disk');
    expect(decidedWords({ at: '', by: 'manager', verdict: 'deny', tool: 'shell.exec' })).toBe('The manager denied a shell command.');
    expect(decidedWords({ at: '', by: 'timeout', verdict: 'deny', tool: 'git.push' })).toBe('Nobody answered in time, so the tool git.push was denied.');
    expect(decidedWords({ at: '', by: 'timeout', verdict: 'cancel', tool: 'git.push' })).toBe('Nobody answered in time, so the run stopped at the tool git.push.');
    expect(decidedWords({ at: '', by: 'bob@example.com', verdict: 'cancel', tool: 'bash', reason: 'wrong host' })).toBe('Bob stopped the run at a shell command: wrong host');
    expect(decidedWords({ at: '', by: 'manager', verdict: 'allow', tool: 'front.pages_write' })).toBe('The manager allowed a write to the wiki.');
    expect(decidedWords({ at: '', by: 'manager', verdict: 'deny', tool: 'servicenow.query_incidents' }, '', () => 'Find incidents')).toBe('The manager denied a call to find incidents.');
    // A question is answered or declined.
    expect(decidedWords({ at: '', by: 'token', verdict: 'allow', tool: 'ask_user', question: true }, 'token')).toBe('You answered the question.');
    expect(decidedWords({ at: '', by: 'bob@example.com', verdict: 'deny', tool: 'ask_user', question: true })).toBe('Bob declined the question.');
    expect(decidedWords({ at: '', by: 'timeout', verdict: 'deny', tool: 'ask_user', question: true })).toBe('Nobody answered the question in time, so it was declined.');
    expect(decidedWords({ at: '', by: 'alice@example.com', verdict: 'deny', tool: 'bash' }, 'alice@example.com')).toBe('You denied a shell command.');
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
    // A cap of a duty is its most per day, the words of its field.
    expect(eventWords({ kind: 'cap.reached' })).toBe('When a duty reaches its most per day');
    expect(startWords({ when: { webhook: { auth: { mode: 'bearer' } } } } as never)).toBe('When another app calls the server');
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
    expect(formErrors({ ...s, act: 'open', message: '', bridgeTurns: '40' }, opts)).toEqual({ playbook: 'Pick a playbook.' });
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

describe('the limits of each action', () => {
  const opts = { fresh: false, name: 'x', taken: [], keepsWhen: false };
  const base = { ...emptyForm('UTC'), agent: 'scribe', message: 'Review [Today’s date].', bridge: 'b1', playbook: 'weekly-patching', cost: '0.40', turns: '12', perDay: '2', overlap: 'queue' as const, catchUp: '6h' };

  it('keep the budget and the cap of a day of a duty that asks the agent or the manager', () => {
    for (const act of ['ask', 'manager'] as const) {
      expect(recordOf({ ...base, act }, null, 'x').limits).toEqual({ budget: { maxCostUSD: 0.4, maxTurns: 12 }, perDayUSD: 2, overlap: 'queue', catchUp: '6h' });
      expect(formErrors({ ...base, act, cost: '' }, opts)).toEqual({ cost: 'A duty needs a budget. Write the most a run can cost, such as 0.50.' });
    }
  });

  it('send no budget and no cap of a day for a post, and ask for neither', () => {
    const d = duty({ do: { post: { bridge: 'b1', message: 'Review {date}.' } } });
    // An older post held a budget and a cap of a day. The form reads them, and the record drops them.
    const f = formOf(d, 'UTC');
    expect([f.cost, f.turns, f.perDay]).toEqual(['0.50', '40', '2.00']);
    expect(recordOf(f, d, d.name).limits).toEqual({ overlap: 'skip', catchUp: '1h', retries: 1 });
    expect(recordOf({ ...base, act: 'post' }, null, 'x').limits).toEqual({ overlap: 'queue', catchUp: '6h' });
    expect(formErrors({ ...base, act: 'post', cost: '', turns: 'x', perDay: 'x' }, opts)).toEqual({});
    expect(limitWords(d.limits, true, 'post')).toEqual([POST_SPENDS, 'A time that comes while the last run works is skipped.', 'A missed time runs once, within 1 hour.']);
    expect(POST_SPENDS).toBe('A post spends nothing of its own. The seats of the bridge spend from their own budgets.');
  });

  it('send only the turns of the bridge for an open, and require them', () => {
    const d = duty({ do: { open: { playbook: 'weekly-patching' } }, limits: { budget: { maxTurns: 40 }, overlap: 'skip', catchUp: '1h' } });
    const f = formOf(d, 'UTC');
    // The turns of the bridge stay apart from the turns of a run.
    expect([f.bridgeTurns, f.turns]).toEqual(['40', '']);
    expect(recordOf(f, d, d.name).limits).toEqual({ budget: { maxTurns: 40 }, overlap: 'skip', catchUp: '1h' });
    // An open sends no cost, tokens, tool calls, or cap of a day, also from an older duty that held them.
    const older = duty({ do: { open: { playbook: 'weekly-patching' } }, limits: { budget: { maxCostUSD: 0.5, maxTokens: 9000, maxToolCalls: 20, maxTurns: 40 }, perDayUSD: 2 } });
    expect(recordOf({ ...formOf(older, 'UTC'), cost: '0.50', perDay: '2' }, older, older.name).limits).toEqual({ budget: { maxTurns: 40 }, overlap: 'skip', catchUp: '1h' });
    expect(recordOf({ ...base, act: 'open', bridgeTurns: '' }, null, 'x').limits).toEqual({ budget: {}, overlap: 'queue', catchUp: '6h' });
    expect(formErrors({ ...base, act: 'open', bridgeTurns: '' }, opts)).toEqual({ turns: OPEN_NEEDS_TURNS });
    expect(formErrors({ ...base, act: 'open', bridgeTurns: '0' }, opts)).toEqual({ turns: 'Write a whole number.' });
    expect(formErrors({ ...base, act: 'open', cost: '', bridgeTurns: '40' }, opts)).toEqual({});
    expect(OPEN_NEEDS_TURNS).toBe('A duty that opens a bridge needs the most turns of the whole bridge, such as 40.');
    expect(limitWords(d.limits, false, 'open')).toEqual(['The bridge gets at most 40 turns.', 'A start that comes while the last run works is skipped.']);
    expect(limitWords({ budget: { maxTurns: 1 } }, false, 'open')[0]).toBe('The bridge gets at most 1 turn.');
  });

  it('show a problem of the budget beside the turns of the bridge for an open, and at the top for a post', () => {
    const ps = ['limits.budget: A bridge counts turns. Give maxTurns, such as 40, and leave out the other limits.', 'limits.budget.maxTurns: A duty that opens a bridge needs the most turns of the whole bridge, such as 40.', 'limits.perDayUSD: Too much.'];
    expect(dutyProblems(ps, 'open')).toEqual({
      turns: ['A bridge counts turns. Give maxTurns, such as 40, and leave out the other limits.', 'A duty that opens a bridge needs the most turns of the whole bridge, such as 40.'],
      top: ['Too much.'],
    });
    expect(dutyProblems(ps, 'post')).toEqual({ top: ['A bridge counts turns. Give maxTurns, such as 40, and leave out the other limits.', 'A duty that opens a bridge needs the most turns of the whole bridge, such as 40.', 'Too much.'] });
    expect(dutyProblems(ps, 'ask')).toEqual({ cost: ['A bridge counts turns. Give maxTurns, such as 40, and leave out the other limits.'], turns: ['A duty that opens a bridge needs the most turns of the whole bridge, such as 40.'], perDay: ['Too much.'] });
  });
});

describe('the walk of 2026-10-26', () => {
  it('adds a time that the sentence does not hold yet', () => {
    expect(nextTime(['08:00'])).toBe('09:00');
    expect(nextTime(['08:00', '09:00'])).toBe('10:00');
    expect(nextTime(['23:30'])).toBe('00:30');
    expect(nextTime(['09:00', '08:00'])).toBe('10:00');
    expect(nextTime([])).toBe('09:00');
    expect(nextTime(Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0') + ':00'))).toBe('');
  });

  it('says a last day before the first day in the words of the two fields', () => {
    expect(datesError({ start: '2026-12-10', end: '2026-12-01' })).toBe(DATES_ERROR);
    expect(DATES_ERROR).toBe('The last day comes before the first day.');
    expect(datesError({ start: '2026-12-01', end: '2026-12-10' })).toBe('');
    expect(datesError({ start: '2026-12-01' })).toBe('');
  });

  it('tells the grey lights of a duty apart by their shape', () => {
    expect(dutyShape(runLight(null))).toBe('hollow');
    expect(dutyShape(dutyLight(duty({ paused: true })))).toBe('pause');
    expect(dutyShape(runLight({ at: '', state: 'completed' }))).toBe('');
  });

  it('finds the words of a schedule and an amount in the message of Make this a duty', () => {
    const m = 'Make a duty for docs-scribe: every Monday at 8am, read the wiki page homelab/inventory.md and reply with three short lines on what looks out of date. A run gets at most $0.05.';
    expect(scheduleWordsIn(m)).toBe('every Monday at 8am');
    expect(moneyIn(m)).toBe('0.05');
    expect(scheduleWordsIn('Check the backups every weekday at 9am and tell me what failed')).toBe('every weekday at 9am');
    expect(scheduleWordsIn('On the first Monday of the month at 9:30, sum up the month.')).toBe('first Monday of the month at 9:30');
    expect(scheduleWordsIn('Every other Tuesday at 3pm (UTC) post the report.')).toBe('Every other Tuesday at 3pm');
    // Words with no repeat are no schedule.
    expect(scheduleWordsIn('Reply at 5 with the list.')).toBe('');
    expect(scheduleWordsIn('Summarize the notes of today.')).toBe('');
    expect(moneyIn('Spend at most $2 a run.')).toBe('2');
    expect(moneyIn('No money here.')).toBe('');
    expect(moneyIn('$0 is free.')).toBe('');
  });
});

describe('the title of a duty', () => {
  it('shows the words of the person, keeps them in the record, and makes the short name from them', () => {
    expect(dutyTitle({ name: 'walk-duty-1', title: 'Walk Duty 1' })).toBe('Walk Duty 1');
    expect(dutyTitle({ name: 'walk-duty-1', title: '  ' })).toBe('walk-duty-1');
    // A name from what the duty does keeps the capitals of the message, and its short name is that of nameOf.
    expect(titleWordsOf('Check the VPN logs of [Today\'s date] in the office.')).toBe('Check the VPN logs');
    expect(slugOf(titleWordsOf('Check the VPN logs of [Today\'s date] in the office.'))).toBe(nameOf('Check the VPN logs of [Today\'s date] in the office.'));
    expect(titleWordsOf('list the new helpdesk tickets in one line each.')).toBe('List the new helpdesk tickets');
    const f = { ...emptyForm('UTC'), agent: 'x', message: 'Hi.', cost: '1' };
    expect(recordOf({ ...f, name: '  Walk   Duty 1 ' }, null, 'walk-duty-1').title).toBe('Walk Duty 1');
    expect('title' in recordOf({ ...f, name: '' }, null, 'walk-duty-1')).toBe(false);
    // An edit reads the title into the name field, and a duty without one leaves it empty.
    expect(formOf({ ...duty(), title: 'Morning report' }, 'UTC').name).toBe('Morning report');
    expect(formOf(duty(), 'UTC').name).toBe('');
    // A problem of the title shows beside the name.
    expect(dutySlot('title')).toBe('name');
    expect(nameWordsReason('x'.repeat(101), [])).toBe('A name holds 100 characters at most.');
  });
});
