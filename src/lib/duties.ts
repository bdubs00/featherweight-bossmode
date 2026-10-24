// The words of the Duties place. A person never sees cron or the syntax of
// a template: a schedule is a sentence with choices, and a placeholder of a
// message is a word in brackets, such as [Today's date]. This file turns
// the record of a duty into those words and the words back into the record
// of docs/CONTRACT.md, section 16. The front reads the schedule back and
// computes the next times. The page only shows its answer.

import type { CheckFirst, CheckFound, CheckWhere, Day, Duty, DutyDecided, DutyDo, DutyEvent, DutyProblem, DutyRecord, DutyRun, DutySecret, Repeat, Schedule, Tool } from '../api/types';
import type { Light } from './presence';
import { costText } from './cost';
import { personName } from './words';
import type { DutySeed } from './route';

/* ---------- placeholders ---------- */

/** A placeholder of a message: its key in the record and its words on the page. chip is false for one that no chip inserts yet. */
export interface Placeholder {
  key: string;
  words: string;
  chip: boolean;
}

/** The placeholders of the contract. Nothing else is a placeholder. */
export const PLACEHOLDERS: Placeholder[] = [
  { key: 'date', words: "Today's date", chip: true },
  { key: 'time', words: 'The time', chip: true },
  { key: 'found', words: 'What the check found', chip: true },
  { key: 'last.title', words: "The last run's title", chip: true },
  { key: 'last.run', words: 'The last run', chip: true },
  { key: 'last.state', words: 'How the last run ended', chip: true },
  { key: 'duty', words: "This duty's name", chip: true },
  // The editor offers this chip only to a duty that an event starts.
  { key: 'event', words: 'What happened', chip: true },
];

/** fold is the form of a word that a match ignores: the case and the kind of apostrophe. */
const fold = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const BY_KEY = new Map(PLACEHOLDERS.map((p) => [p.key, p]));
const BY_WORDS = new Map(PLACEHOLDERS.map((p) => [fold(p.words), p]));

/** chipText is the text that a chip puts into a message: the words in brackets. */
export const chipText = (p: Placeholder): string => '[' + p.words + ']';

/** toWords shows each placeholder of a stored message as its words in brackets: {date} becomes [Today's date]. */
export function toWords(message: string): string {
  return String(message || '').replace(/\{([a-z.]+)\}/g, (all, key: string) => {
    const p = BY_KEY.get(key);
    return p ? chipText(p) : all;
  });
}

/** toPlaceholders stores the words in brackets of a message as placeholders: [Today's date] becomes {date}. Other brackets stay. */
export function toPlaceholders(text: string): string {
  return String(text || '').replace(/\[([^\[\]\n]{1,40})\]/g, (all, words: string) => {
    const p = BY_WORDS.get(fold(words));
    return p ? '{' + p.key + '}' : all;
  });
}

/* ---------- days and times ---------- */

/** The days of the week, with the short and the whole word. */
export const DAYS: { id: Day; short: string; long: string }[] = [
  { id: 'mon', short: 'Mon', long: 'Monday' },
  { id: 'tue', short: 'Tue', long: 'Tuesday' },
  { id: 'wed', short: 'Wed', long: 'Wednesday' },
  { id: 'thu', short: 'Thu', long: 'Thursday' },
  { id: 'fri', short: 'Fri', long: 'Friday' },
  { id: 'sat', short: 'Sat', long: 'Saturday' },
  { id: 'sun', short: 'Sun', long: 'Sunday' },
];
export const WEEKDAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_IDS = DAYS.map((d) => d.id);

/** sortDays puts days in the order of the week, once each. */
export const sortDays = (days: Day[]): Day[] => DAY_IDS.filter((d) => days.includes(d));

/** timeOf is the time of day of a moment in the zone of the browser, such as 9:00 AM. */
export function timeOf(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** nextWords is a next time in the zone of the browser, such as Mon, Oct 26, 9:00 AM. */
export function nextWords(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** nextShort is the next time for a row: the time today, Tomorrow and the time, the day of this week, or the date. */
export function nextShort(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(d) - start(now)) / 86400000);
  if (days <= 0) return timeOf(iso);
  if (days === 1) return 'tomorrow ' + timeOf(iso);
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' + timeOf(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** zoneWords names a time zone as a person reads it: America/New_York is New York (America). */
export function zoneWords(zone: string): string {
  if (!zone || !zone.includes('/')) return zone || 'UTC';
  const parts = zone.split('/');
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  return city + ' (' + parts.slice(0, -1).join(', ').replace(/_/g, ' ') + ')';
}

/** zonesOf lists the time zones of the browser, the zone of the browser and the given zones first, without a repeat. */
export function zonesOf(first: string[]): string[] {
  let all: string[] = [];
  try {
    const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof f === 'function') all = f('timeZone');
  } catch {
    all = [];
  }
  return [...new Set([...first.filter(Boolean), 'UTC', ...all])];
}

/* ---------- spans ---------- */

/** seconds reads a span of the front, such as 15m, 2h, or 1h30m, in seconds, or NaN. */
export function seconds(span: string): number {
  const s = String(span || '').trim();
  if (s === '0') return 0;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (!m || !s) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/** spanText says a span in words, such as 15 minutes, 2 hours, a day, or 1 hour 30 minutes. */
export function spanText(span: string): string {
  const n = seconds(span);
  if (!Number.isFinite(n)) return span;
  if (n === 86400) return 'a day';
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const parts: string[] = [];
  if (h) parts.push(h + (h === 1 ? ' hour' : ' hours'));
  if (m) parts.push(m + (m === 1 ? ' minute' : ' minutes'));
  return parts.join(' ') || '0 minutes';
}

/** The spans that the sentence offers for Every. A duty of another span keeps it as one more choice. */
export const SPANS = ['15m', '30m', '45m', '1h', '2h', '3h', '4h', '6h', '8h', '12h', '24h'];

/** The choices of Catch up a missed time: how late a missed time can run once. 0 runs none. */
export const CATCH_UPS: [string, string][] = [
  ['0', 'No'],
  ['15m', 'Within 15 minutes'],
  ['1h', 'Within 1 hour'],
  ['6h', 'Within 6 hours'],
  ['24h', 'Within a day'],
];

/** The spans that a question waits for an answer while the person is away. */
export const TIMEOUTS: [string, string][] = [
  ['30m', '30 minutes'],
  ['1h', '1 hour'],
  ['2h', '2 hours'],
  ['4h', '4 hours'],
  ['8h', '8 hours'],
  ['24h', 'a day'],
];

/** withChoice adds the value of a record that a list of choices lacks, in words, so an edit keeps it. */
export function withChoice(list: [string, string][], value: string, words: (v: string) => string): [string, string][] {
  if (!value || list.some(([v]) => v === value || seconds(v) === seconds(value))) return list;
  return [...list, [value, words(value)]];
}

/* ---------- the schedule as a sentence ---------- */

/** The repeats of the sentence, as the first choice says them. */
export const REPEATS: { id: Repeat; label: string }[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Every weekday' },
  { id: 'weekly', label: 'Every week on' },
  { id: 'monthly', label: 'Every month on' },
  { id: 'hourly', label: 'Every hour' },
  { id: 'every', label: 'Every' },
];

/** The words of everyWeeks: 1 to 4. */
export const EVERY_WEEKS: [number, string][] = [
  [1, 'every week'],
  [2, 'every other week'],
  [3, 'every third week'],
  [4, 'every fourth week'],
];

/** The repeats that run at times of the day. The others run through the hours. */
export const AT_TIMES: Repeat[] = ['daily', 'weekdays', 'weekly', 'monthly'];

/** The sentence of a schedule as the form holds it. */
export interface WhenForm {
  repeat: Repeat;
  days: Day[];
  everyWeeks: number;
  /** 1 to 31, last, or an ordinal with a weekday, such as first monday. */
  dayOfMonth: string;
  times: string[];
  every: string;
  /** The hours of the day, or null for all of them. */
  between: [string, string] | null;
  timeZone: string;
  /** The dates of the record, which the sentence does not show and keeps. */
  start?: string;
  end?: string;
}

/** The ordinals of a weekday of the month. */
export const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'];
const WEEKDAY_NAMES: Record<Day, string> = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday' };

/** nth writes a day of the month, such as 1st, 2nd, 23rd. */
export function nth(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

/** The day of the month as two choices: which (a day such as 15, last, or an ordinal) and the weekday of an ordinal. */
export interface MonthDay {
  which: string;
  weekday: Day | '';
}

/** monthDayOf splits dayOfMonth into its two choices: first monday gives first and mon, 15 gives 15. */
export function monthDayOf(dom: string): MonthDay {
  const s = String(dom || '1').trim().toLowerCase();
  const m = /^(first|second|third|fourth|last)\s+([a-z]+)$/.exec(s);
  if (m) {
    const day = (Object.keys(WEEKDAY_NAMES) as Day[]).find((d) => WEEKDAY_NAMES[d] === m[2] || d === m[2]);
    if (day) return { which: m[1] + '-weekday', weekday: day };
  }
  return { which: s, weekday: '' };
}

/** domOf joins the two choices into dayOfMonth. */
export function domOf(m: MonthDay): string {
  if (m.which.endsWith('-weekday')) return m.which.replace('-weekday', '') + ' ' + WEEKDAY_NAMES[m.weekday || 'mon'];
  return m.which;
}

/** The choices of which day of the month: the 1st to the 31st, the last day, and the ordinals of a weekday. */
export const MONTH_DAYS: [string, string][] = [
  ...Array.from({ length: 31 }, (_, i) => [String(i + 1), 'the ' + nth(i + 1)] as [string, string]),
  ['last', 'the last day'],
  ...ORDINALS.map((o) => [o + '-weekday', 'the ' + o] as [string, string]),
];

/** whenFormOf reads a schedule into the sentence, with the zone of the browser for a schedule that names none. */
export function whenFormOf(s: Schedule | undefined | null, zone: string): WhenForm {
  const f: WhenForm = { repeat: 'weekdays', days: [], everyWeeks: 1, dayOfMonth: '1', times: ['09:00'], every: '1h', between: null, timeZone: zone || 'UTC' };
  if (!s) return f;
  f.repeat = s.repeat || 'weekdays';
  f.days = sortDays((s.days || []).filter((d) => DAY_IDS.includes(d)));
  f.everyWeeks = s.everyWeeks && s.everyWeeks >= 1 && s.everyWeeks <= 4 ? s.everyWeeks : 1;
  f.dayOfMonth = s.dayOfMonth || '1';
  if (s.times && s.times.length) f.times = [...s.times];
  if (s.every) f.every = s.every;
  f.between = s.between && s.between.length === 2 ? [s.between[0], s.between[1]] : null;
  f.timeZone = s.timeZone || zone || 'UTC';
  if (s.start) f.start = s.start;
  if (s.end) f.end = s.end;
  return f;
}

/** scheduleOf writes the sentence as a schedule, with only the fields of its repeat. */
export function scheduleOf(f: WhenForm): Schedule {
  const s: Schedule = { repeat: f.repeat };
  const times = f.times.filter(Boolean);
  if (f.repeat === 'weekly') {
    s.days = sortDays(f.days);
    if (f.everyWeeks > 1) s.everyWeeks = f.everyWeeks;
  }
  if (f.repeat === 'monthly') s.dayOfMonth = f.dayOfMonth || '1';
  if (AT_TIMES.includes(f.repeat)) s.times = times;
  if (f.repeat === 'every') s.every = f.every || '1h';
  if (f.repeat === 'hourly' || f.repeat === 'every') {
    if (f.days.length) s.days = sortDays(f.days);
    if (f.between) s.between = [f.between[0], f.between[1]];
  }
  s.timeZone = f.timeZone || 'UTC';
  if (f.start) s.start = f.start;
  if (f.end) s.end = f.end;
  return s;
}

/** A preset starts the sentence. It keeps the time zone. */
export interface Preset {
  id: string;
  label: string;
  schedule: Omit<Schedule, 'timeZone'>;
}

export const PRESETS: Preset[] = [
  { id: 'morning', label: 'Every morning', schedule: { repeat: 'daily', times: ['08:00'] } },
  { id: 'weekday', label: 'Every weekday', schedule: { repeat: 'weekdays', times: ['09:00'] } },
  { id: 'monday', label: 'Every Monday', schedule: { repeat: 'weekly', days: ['mon'], times: ['09:00'] } },
  { id: 'work-hours', label: 'Every hour during work hours', schedule: { repeat: 'hourly', days: [...WEEKDAYS], between: ['09:00', '17:00'] } },
  { id: 'first', label: 'First of the month', schedule: { repeat: 'monthly', dayOfMonth: '1', times: ['09:00'] } },
];

/** applyPreset gives the sentence of a preset in the zone of the sentence. */
export function applyPreset(p: Preset, f: WhenForm): WhenForm {
  return whenFormOf({ ...p.schedule, timeZone: f.timeZone }, f.timeZone);
}

/** presetOf names the preset that the sentence matches, or "". */
export function presetOf(f: WhenForm): string {
  const key = (s: Schedule) => JSON.stringify({ ...s, timeZone: '' });
  const now = key(scheduleOf(f));
  const p = PRESETS.find((x) => key(scheduleOf(applyPreset(x, f))) === now);
  return p ? p.id : '';
}

/** whenErrors says what the sentence lacks, or "" for a whole sentence. */
export function whenError(f: WhenForm): string {
  if (f.repeat === 'weekly' && f.days.length === 0) return 'Pick at least one day.';
  if (AT_TIMES.includes(f.repeat) && f.times.filter(Boolean).length === 0) return 'Pick at least one time.';
  if (f.between && (!f.between[0] || !f.between[1])) return 'Pick both hours, or run through the whole day.';
  return '';
}

/* ---------- the check ---------- */

/** quote shows a value of a filter: a text as it is, anything else as JSON. */
const quote = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));

/** listWords joins words: a, b, and c. */
export function listWords(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  if (xs.length === 2) return xs[0] + ' and ' + xs[1];
  return xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1];
}

/** whereWords says one filter of a check, such as priority is one of 1 and 2. */
export function whereWords(w: CheckWhere): string {
  if ('oneOf' in w && Array.isArray(w.oneOf)) return w.field + ' is one of ' + listWords(w.oneOf.map(quote));
  if ('isNot' in w) return w.field + ' is not ' + quote(w.isNot);
  if ('is' in w) return w.field + ' is ' + quote(w.is);
  if ('contains' in w) return w.field + ' holds ' + quote(w.contains);
  if ('atLeast' in w) return w.field + ' is at least ' + quote(w.atLeast);
  if ('atMost' in w) return w.field + ' is at most ' + quote(w.atMost);
  return w.field;
}

/** hostOf is an address without its scheme, as a person reads it. */
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

/**
 * checkWords reads a check back in words, from the record and never from
 * the words of a model: what it looks at, where the list is, the filters,
 * and when the agent wakes.
 */
export function checkWords(c: CheckFirst, agent: string): string {
  const who = agent || 'the agent';
  const out: string[] = [];
  if (c.look.http && c.look.http.url) out.push('Look at ' + hostOf(c.look.http.url) + '.');
  else if (c.look.tool) out.push('Call the tool ' + c.look.tool + ' of ' + who + '.');
  out.push(c.items ? 'Take the list at ' + c.items + '.' : 'Take the whole answer as the list.');
  if (c.where && c.where.length) out.push('Keep the items where ' + listWords(c.where.map(whereWords)) + '.');
  const wake = c.wake || { when: 'new' };
  if (wake.when === 'any') out.push('Wake ' + who + ' when the check finds an item.');
  else if (wake.when === 'atLeast') out.push('Wake ' + who + ' at ' + (wake.count || 1) + (wake.count === 1 ? ' item' : ' items') + ' or more.');
  else out.push('Wake ' + who + ' only for items ' + (c.key ? 'whose ' + c.key + ' it did not see before' : 'that it did not see before') + '.');
  return out.join(' ');
}

/** foundWords says what a check finds now, such as Now: 2 items. They would wake the agent. */
export function foundWords(c: CheckFound, agent: string): string {
  const who = agent || 'the agent';
  if (!c.count) return 'Now: no items. ' + cap(who) + ' would sleep.';
  const n = c.count === 1 ? '1 item' : c.count + ' items';
  const they = c.count === 1 ? 'It' : 'They';
  return 'Now: ' + n + '. ' + they + (c.wakes ? ' would wake ' : ' would not wake ') + who + '.';
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** itemWords names one item that a check found: its key, else its first text, else its JSON, cut at 80 characters. */
export function itemWords(item: unknown, key: string): string {
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const o = item as Record<string, unknown>;
    const v = key ? key.split('.').reduce<unknown>((x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined), o) : undefined;
    if (v !== undefined && v !== null && typeof v !== 'object') return String(v);
    const text = Object.values(o).find((x) => typeof x === 'string' && x.trim());
    if (typeof text === 'string') return cut(text);
  }
  if (typeof item === 'string' || typeof item === 'number') return cut(String(item));
  return cut(JSON.stringify(item));
}

const cut = (s: string) => (s.length > 80 ? s.slice(0, 79) + '…' : s);

/* ---------- a run and a duty in words ---------- */

/** runLight is the light of a run of a duty: what the time did. */
export function runLight(r: DutyRun | null | undefined): Light {
  if (!r) return { word: 'not run yet', tone: 'grey', label: 'This duty has not run yet.' };
  const why = r.reason ? r.reason : '';
  switch (r.state) {
    case 'failed':
      return { word: 'failed', tone: 'red', label: why || 'The run failed.' };
    case 'input-required':
      return { word: 'needs you', tone: 'amber', label: 'The run waits for an answer.' };
    case 'queued':
      return { word: 'waiting for a worker', tone: 'grey', label: 'The run waits for a free worker.' };
    case 'running':
    case 'suspended':
      return { word: 'working', tone: 'green', label: 'The run works now.' };
    case 'skipped':
      return { word: 'skipped', tone: 'grey', label: why || 'This time started no run.' };
    case 'canceled':
      return { word: 'stopped', tone: 'grey', label: why || 'Someone stopped the run.' };
  }
  if (r.woke === false) return { word: 'slept', tone: 'grey', label: 'The check found no work, so the agent slept.' };
  if (r.state === 'completed') return { word: 'finished', tone: 'grey', label: 'The run finished.' };
  const word = r.state ? r.state.replace(/[-_]/g, ' ') : 'unknown';
  return { word, tone: 'grey', label: why || 'The front reports ' + word + '.' };
}

/** dutyLight is the light of a duty in the list: paused, else the light of its last run. */
export function dutyLight(d: Duty, allPaused = false): Light {
  if (allPaused) return { word: 'paused', tone: 'grey', label: 'Every duty is paused.' };
  if (d.paused) return { word: 'paused', tone: 'grey', label: (d.state && d.state.pausedReason) || 'Someone paused this duty.' };
  return runLight(d.state ? d.state.lastRun : null);
}

/**
 * checkLine says what the check of a run found, such as Found 2, woke the
 * agent. The light of a run that slept says slept, and a check that failed
 * says why in its reason, so both say only the count or nothing. A run
 * without a check gives "".
 */
export function checkLine(r: DutyRun): string {
  if (typeof r.found !== 'number' && typeof r.woke !== 'boolean') return '';
  if (r.state === 'failed' && !r.woke) return '';
  const n = typeof r.found === 'number' ? (r.found === 0 ? 'Found nothing' : 'Found ' + r.found) : 'Checked';
  return n + (r.woke ? ', woke the agent' : '');
}

/**
 * decidedWords says who decided a question of a run of a duty while the
 * person was away, such as The manager allowed shell.exec: it only reads.
 * me is the subject of the person who reads it.
 */
export function decidedWords(d: DutyDecided, me = ''): string {
  const tool = d.tool || 'a tool';
  const why = d.reason && d.reason.trim() ? ': ' + d.reason.trim() : '.';
  if (d.by === 'timeout') {
    if (d.verdict === 'cancel') return 'Nobody answered in time, so the run stopped at ' + tool + why;
    if (d.verdict === 'allow') return 'Nobody answered in time, so ' + tool + ' went ahead' + why;
    return 'Nobody answered in time, so ' + tool + ' was denied' + why;
  }
  const who = d.by === 'manager' ? 'The manager' : me && d.by === me ? 'You' : cap(personName(d.by));
  if (d.verdict === 'allow') return who + ' allowed ' + tool + why;
  if (d.verdict === 'cancel') return who + ' stopped the run at ' + tool + why;
  return who + ' denied ' + tool + why;
}

/** firstLine is the first sentence or line of a text, cut at a word past 80 characters. */
export function firstLine(text: string): string {
  const line = String(text || '').trim().split('\n')[0].trim();
  const sentence = line.replace(/([.!?])\s.*$/, '$1');
  if (sentence.length <= 80) return sentence;
  const c = sentence.slice(0, 80);
  const space = c.lastIndexOf(' ');
  return (space > 40 ? c.slice(0, space) : c) + '…';
}

/** titleOfName makes a name into words: daily-homelab-report is Daily homelab report. */
export const titleOfName = (name: string) => cap(String(name || '').replace(/[-_]+/g, ' ').trim());

/** dutyTitle says what a duty does, from its message, else from its name. */
export function dutyTitle(d: Pick<DutyRecord, 'name' | 'do'>): string {
  const x = d.do || {};
  const message = (x.ask && x.ask.message) || (x.post && x.post.message) || (x.manager && x.manager.message) || '';
  if (message.trim()) return firstLine(toWords(message));
  if (x.open && x.open.playbook) return 'Open a bridge from ' + x.open.playbook;
  return titleOfName(d.name);
}

/* ---------- events ---------- */

/** The words of each event of the fleet, as the choice of When says it. */
export const EVENT_WORDS: Record<string, string> = {
  'bridge.closed': 'When a bridge closes',
  'run.failed': 'When a run of an agent fails',
  'question.waiting': 'When a question waits too long',
  'page.changed': 'When a page changes',
  'routine.ready': 'When a routine is ready',
  'cap.reached': 'When a cap is reached',
};

/** The fields that each event takes beside its kind: an agent that narrows it, how long a question waits, or a path of the wiki. */
export const EVENT_FIELDS: Record<string, ('agent' | 'after' | 'path')[]> = {
  'bridge.closed': ['agent'],
  'run.failed': ['agent'],
  'question.waiting': ['after', 'agent'],
  'page.changed': ['path'],
  'routine.ready': ['agent'],
  'cap.reached': [],
};

/** eventLabel is the choice of an event kind in words. */
export const eventLabel = (kind: string): string => EVENT_WORDS[kind] || 'When something happens in the fleet';

/** The spans that a question can wait before it starts a duty. */
export const WAITS: [string, string][] = [
  ['15m', '15 minutes'],
  ['30m', '30 minutes'],
  ['1h', '1 hour'],
  ['2h', '2 hours'],
  ['4h', '4 hours'],
  ['24h', 'a day'],
];

/** eventWords reads an event back in words, with its agent, its wait, or its path, such as When a bridge of triage closes. */
export function eventWords(e: DutyEvent, name: (agent: string) => string = (a) => a): string {
  const who = e.agent ? name(e.agent) : '';
  switch (e.kind) {
    case 'bridge.closed':
      return who ? 'When a bridge of ' + who + ' closes' : 'When a bridge closes';
    case 'run.failed':
      return who ? 'When a run of ' + who + ' fails' : 'When a run of an agent fails';
    case 'question.waiting':
      return 'When a question' + (who ? ' of ' + who : '') + ' waits longer than ' + spanText(e.after || '1h');
    case 'page.changed':
      return e.path ? 'When a page under ' + e.path + ' changes' : 'When a page changes';
    case 'routine.ready':
      return who ? 'When a routine of ' + who + ' is ready' : 'When a routine is ready';
  }
  return eventLabel(e.kind);
}

/** startWords says what starts a duty that has no schedule. */
export function startWords(d: Pick<DutyRecord, 'when'>, name?: (agent: string) => string): string {
  const w = d.when || {};
  if (w.webhook) return 'When another app calls';
  if (w.event) return eventWords(w.event, name);
  return '';
}

/** limitWords reads the limits of a duty back in words. */
export function limitWords(l: DutyRecord['limits'] | undefined): string[] {
  if (!l) return [];
  const out: string[] = [];
  const b = l.budget || {};
  const run: string[] = [];
  if (b.maxCostUSD) run.push(costText(b.maxCostUSD));
  if (b.maxTurns) run.push(b.maxTurns + (b.maxTurns === 1 ? ' turn' : ' turns'));
  if (b.maxTokens) run.push(b.maxTokens.toLocaleString() + ' tokens');
  if (b.maxToolCalls) run.push(b.maxToolCalls + (b.maxToolCalls === 1 ? ' tool call' : ' tool calls'));
  if (run.length) out.push('A run gets at most ' + listWords(run) + '.');
  if (l.perDayUSD) out.push('The duty spends at most ' + costText(l.perDayUSD) + ' a day.');
  const overlap = l.overlap || 'skip';
  out.push(overlap === 'queue' ? 'A time that comes while the last run works runs after it.' : overlap === 'allow' ? 'A time that comes while the last run works runs anyway.' : 'A time that comes while the last run works is skipped.');
  const c = l.catchUp === undefined ? '1h' : l.catchUp;
  out.push(seconds(c) === 0 ? 'A missed time does not run.' : 'A missed time runs once, within ' + spanText(c) + '.');
  return out;
}

/** awayWords reads back who decides while the person is away. */
export function awayWords(w: DutyRecord['whileAway'] | undefined): string {
  const a = w || { decider: 'manager', timeout: '2h', then: 'deny' };
  const who = a.decider === 'nobody' ? 'Nobody decides a question for you.' : 'The manager decides a question for you.';
  const then = a.then === 'cancel' ? 'the run stops' : 'the answer is no';
  return who + ' After ' + spanText(a.timeout || '2h') + ' without an answer, ' + then + '.';
}

/** tellWords reads back what the person hears of. */
export function tellWords(n: DutyRecord['notify'] | undefined): string {
  const fail = !!(n && n.failure && n.failure.includes('owner'));
  const ask = !!(n && n.needsYou && n.needsYou.includes('owner'));
  if (fail && ask) return 'Failures and questions.';
  if (fail) return 'Failures.';
  if (ask) return 'Questions.';
  return 'Nothing.';
}

/* ---------- the name ---------- */

const NAME = /^[a-z0-9_-]{1,63}$/;

/** nameOf makes a name from what a duty does: the first words, in lower case, joined by hyphens. */
export function nameOf(message: string): string {
  const words = String(message || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .slice(0, 6);
  let s = '';
  for (const w of words) {
    if ((s ? s.length + 1 : 0) + w.length > 40) break;
    s += (s ? '-' : '') + w;
  }
  return s;
}

/** nameReason says why a name cannot name a duty, or "". */
export function nameReason(name: string, taken: string[]): string {
  if (!name) return 'Give the duty a name.';
  if (!NAME.test(name)) return 'A name holds 1 to 63 of a to z, 0 to 9, hyphens, and underscores.';
  if (taken.includes(name)) return 'A duty of this name exists. Pick another name.';
  return '';
}

/* ---------- the form ---------- */

/** One value of the input of a tool: a name, its text, and the value of the record that the text came from. */
export interface InputRow {
  name: string;
  text: string;
  was?: unknown;
}

/** The tests of a filter, as the record names them. */
export type WhereTest = 'is' | 'isNot' | 'oneOf' | 'contains' | 'atLeast' | 'atMost';

/** The tests of a filter in words, as the choice says them. */
export const WHERE_TESTS: [WhereTest, string][] = [
  ['is', 'is'],
  ['isNot', 'is not'],
  ['oneOf', 'is one of'],
  ['contains', 'holds'],
  ['atLeast', 'is at least'],
  ['atMost', 'is at most'],
];

/** One filter of a check as the form holds it: a field of an item, a test, and the value as text. was is the value of the record, which an unchanged text keeps. */
export interface WhereRow {
  field: string;
  test: WhereTest;
  text: string;
  was?: unknown;
}

/** The check as the form holds it. */
export interface CheckForm {
  look: 'http' | 'tool';
  url: string;
  secret: string;
  header: string;
  tool: string;
  input: InputRow[];
  items: string;
  key: string;
  wake: 'new' | 'any' | 'atLeast';
  count: string;
  /** The filters that keep some items, such as priority is one of 1 and 2. */
  where: WhereRow[];
}

/** The actions of a duty. */
export type Act = 'ask' | 'post' | 'open' | 'manager';
export const ACTS: Act[] = ['ask', 'post', 'open', 'manager'];

/** An event as the form holds it. after and path are text. */
export interface EventForm {
  kind: string;
  agent: string;
  after: string;
  path: string;
}

/** The form of a duty, each field as the person typed it. */
export interface DutyForm {
  name: string;
  /** True once the person wrote the name, so it no longer follows the message. */
  nameOwn: boolean;
  agent: string;
  /** What starts the duty: a schedule or an event of the fleet. */
  start: 'schedule' | 'event';
  when: WhenForm;
  /** The words of the box, when the front read them back with no schedule to fill the sentence. The record then sends them. */
  say: string;
  event: EventForm;
  check: CheckForm;
  act: Act;
  /** The message in words, with the placeholders in brackets, for ask, post, and manager. */
  message: string;
  /** The bridge of post and the handles that the message goes to. No handle is everyone. */
  bridge: string;
  to: string[];
  /** The playbook of open and the goal that takes the place of its own, in words. */
  playbook: string;
  goal: string;
  cost: string;
  turns: string;
  perDay: string;
  overlap: 'skip' | 'queue' | 'allow';
  catchUp: string;
  decider: 'manager' | 'nobody';
  timeout: string;
  then: 'deny' | 'cancel';
  failures: boolean;
  questions: boolean;
}

export function emptyCheck(): CheckForm {
  return { look: 'http', url: '', secret: '', header: '', tool: '', input: [], items: '', key: '', wake: 'new', count: '', where: [] };
}

export const emptyEvent = (): EventForm => ({ kind: '', agent: '', after: '1h', path: '' });

/** emptyForm is a new duty: no agent, every weekday at 9:00 AM in the zone of the browser, and no budget. */
export function emptyForm(zone: string): DutyForm {
  return {
    name: '',
    nameOwn: false,
    agent: '',
    start: 'schedule',
    when: whenFormOf(null, zone),
    say: '',
    event: emptyEvent(),
    check: emptyCheck(),
    act: 'ask',
    message: '',
    bridge: '',
    to: [],
    playbook: '',
    goal: '',
    // No silent cost: the person writes the budget.
    cost: '',
    turns: '',
    perDay: '',
    overlap: 'skip',
    catchUp: '1h',
    decider: 'manager',
    timeout: '2h',
    then: 'deny',
    failures: true,
    questions: true,
  };
}

const num = (n: number | undefined) => (typeof n === 'number' && n > 0 ? String(n) : '');
/** amount shows dollars as a person writes them, with cents: 0.2 is 0.20. A finer amount stays whole. */
const amount = (n: number | undefined) => (typeof n === 'number' && n > 0 ? (Number.isInteger(Math.round(n * 1e6) / 1e4) ? n.toFixed(2) : String(n)) : '');

/** valueText shows a value of a filter or of a tool as text: a text as it is, anything else as JSON. */
const valueText = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

/** whereRowsOf reads the filters of a check into the form. A filter of another shape keeps its field and its first test. */
export function whereRowsOf(where: CheckWhere[] | undefined): WhereRow[] {
  return (where || []).map((w) => {
    const test = (WHERE_TESTS.map(([t]) => t).find((t) => t in w) || 'is') as WhereTest;
    const v = (w as unknown as Record<string, unknown>)[test];
    const text = test === 'oneOf' && Array.isArray(v) ? v.map(valueText).join(', ') : v === undefined ? '' : valueText(v);
    return { field: w.field, test, text, was: v };
  });
}

/** valueOfText reads the text of a value that a person changed: a number stays a number, else the text. */
function valueOfText(text: string): unknown {
  const t = text.trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t;
}

/** whereOf writes the filters of the form. An unchanged text keeps the value of the record, and a row without a field goes. */
export function whereOf(rows: WhereRow[]): CheckWhere[] {
  const out: CheckWhere[] = [];
  for (const r of rows) {
    const field = r.field.trim();
    if (!field) continue;
    const before = r.was !== undefined && (r.test === 'oneOf' && Array.isArray(r.was) ? r.was.map(valueText).join(', ') : valueText(r.was));
    let v: unknown;
    if (before === r.text) v = r.was;
    else if (r.test === 'oneOf') v = r.text.split(',').map((x) => x.trim()).filter(Boolean).map(valueOfText);
    else if (r.test === 'atLeast' || r.test === 'atMost') v = Number(r.text.trim());
    else v = valueOfText(r.text);
    out.push({ field, [r.test]: v } as CheckWhere);
  }
  return out;
}

/** checkFormOf reads a check into the form. */
export function checkFormOf(c: CheckFirst | null | undefined): CheckForm {
  const f = emptyCheck();
  if (!c) return f;
  const look = c.look || {};
  if (look.tool) {
    f.look = 'tool';
    f.tool = look.tool;
    f.input = Object.entries(look.input || {}).map(([name, v]) => ({ name, text: valueText(v), was: v }));
  } else if (look.http) {
    f.url = look.http.url || '';
    f.secret = look.http.secret || '';
    f.header = look.http.header || '';
  }
  f.items = c.items || '';
  f.key = c.key || '';
  f.wake = (c.wake && c.wake.when) || 'new';
  f.count = c.wake && c.wake.count ? String(c.wake.count) : '';
  f.where = whereRowsOf(c.where);
  return f;
}

/** actOf names the action of a duty. */
export function actOf(x: DutyDo | undefined): Act {
  if (x && x.post) return 'post';
  if (x && x.open) return 'open';
  if (x && x.manager) return 'manager';
  return 'ask';
}

/** formOf reads a duty into the form. */
export function formOf(d: Duty, zone: string): DutyForm {
  const f = emptyForm(zone);
  const l = d.limits || ({} as DutyRecord['limits']);
  const b = l.budget || {};
  const w = d.whileAway;
  const x = d.do || {};
  const e = d.when && d.when.event;
  return {
    ...f,
    name: d.name,
    nameOwn: true,
    agent: d.agent,
    start: e ? 'event' : 'schedule',
    when: whenFormOf(d.when && d.when.schedule, zone),
    say: d.when && !d.when.schedule && d.when.say ? d.when.say : '',
    event: e ? { kind: e.kind || '', agent: e.agent || '', after: e.after || '1h', path: e.path || '' } : emptyEvent(),
    check: checkFormOf(d.checkFirst),
    act: actOf(x),
    message: toWords((x.ask && x.ask.message) || (x.post && x.post.message) || (x.manager && x.manager.message) || ''),
    bridge: (x.post && x.post.bridge) || '',
    to: (x.post && x.post.to) || [],
    playbook: (x.open && x.open.playbook) || '',
    goal: toWords((x.open && x.open.goal) || ''),
    cost: amount(b.maxCostUSD),
    turns: num(b.maxTurns),
    perDay: amount(l.perDayUSD),
    overlap: l.overlap || 'skip',
    catchUp: l.catchUp === undefined ? '1h' : l.catchUp,
    decider: w && w.decider === 'nobody' ? 'nobody' : 'manager',
    timeout: (w && w.timeout) || '2h',
    then: w && w.then === 'cancel' ? 'cancel' : 'deny',
    failures: !d.notify || !d.notify.failure ? true : d.notify.failure.includes('owner'),
    questions: !d.notify || !d.notify.needsYou ? true : d.notify.needsYou.includes('owner'),
  };
}

/** seededForm is a new duty with what Make this a duty brought. The budget stays empty: the person writes it. */
export function seededForm(seed: DutySeed | undefined, zone: string): DutyForm {
  const f = emptyForm(zone);
  if (!seed) return f;
  return {
    ...f,
    agent: seed.agent || '',
    act: seed.act && ACTS.includes(seed.act) ? seed.act : 'ask',
    message: seed.message || '',
    bridge: seed.bridge || '',
    playbook: seed.playbook || '',
  };
}

/** hasCheck reports whether the form names something to look at, so the duty has a check. */
export const hasCheck = (c: CheckForm) => !!(c.look === 'http' ? c.url.trim() : c.tool.trim());

/** valueOf reads the text of a value of a tool: a text stays a text, and a value that was no text goes back to its kind when the text still reads as JSON. */
function valueOf(r: InputRow): unknown {
  if (r.was !== undefined && typeof r.was !== 'string') {
    try {
      return JSON.parse(r.text);
    } catch {
      return r.text;
    }
  }
  return r.text;
}

/** checkOf writes the check of the form, or null for a form without one. */
export function checkOf(c: CheckForm): CheckFirst | null {
  if (!hasCheck(c)) return null;
  const out: CheckFirst = { look: {} };
  if (c.look === 'http') {
    const http: { url: string; secret?: string; header?: string } = { url: c.url.trim() };
    if (c.secret.trim()) http.secret = c.secret.trim();
    if (c.header.trim()) http.header = c.header.trim();
    out.look.http = http;
  } else {
    out.look.tool = c.tool.trim();
    const input: Record<string, unknown> = {};
    for (const r of c.input) if (r.name.trim()) input[r.name.trim()] = valueOf(r);
    out.look.input = input;
  }
  if (c.items.trim()) out.items = c.items.trim();
  if (c.key.trim()) out.key = c.key.trim();
  const where = whereOf(c.where);
  if (where.length) out.where = where;
  out.wake = c.wake === 'atLeast' ? { when: 'atLeast', count: Math.max(1, Math.floor(Number(c.count) || 1)) } : { when: c.wake };
  return out;
}

/** urlHost is the host of an address, with and without its port, or null for an address that does not read. */
export function urlHost(url: string): { host: string; hostname: string } | null {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return { host: u.host.toLowerCase(), hostname: u.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/** secretsFor keeps the secrets of the front that may go to the host of an address: a host by name, with its port, or a host under *.domain. */
export function secretsFor(secrets: DutySecret[], url: string): DutySecret[] {
  const h = urlHost(url);
  if (!h) return [];
  const fits = (pattern: string) => {
    const p = String(pattern || '').toLowerCase();
    if (p === h.host || p === h.hostname) return true;
    return p.startsWith('*.') && (h.hostname.endsWith(p.slice(1)) || h.host.endsWith(p.slice(1)));
  };
  return secrets.filter((s) => (s.hosts || []).some(fits));
}

/**
 * checkTools lists the tools of an agent that a check can call: each tool
 * that the profile names, and each tool of the catalog under a server that
 * it names whole, such as servicenow.*. A profile without a list gives the
 * whole catalog.
 */
export function checkTools(names: string[] | null | undefined, catalog: Tool[] | null | undefined): string[] {
  const all = (catalog || []).map((t) => {
    const src = t.source || t.server || '';
    return src && src !== 'builtin' && t.origin !== 'builtin' ? src + '.' + t.name : t.name;
  });
  if (!names) return [...new Set(all)].sort();
  const out: string[] = [];
  for (const n of names) {
    const glob = /^(.+)[./]\*$/.exec(n);
    const server = glob ? glob[1] : !/[.*/]/.test(n) && (catalog || []).some((t) => (t.source || t.server) === n) ? n : '';
    if (server) {
      for (const t of catalog || []) if ((t.source || t.server) === server) out.push(server + '.' + t.name);
    } else if (!n.includes('*')) out.push(n);
  }
  return [...new Set(out)];
}

/** money reads an amount of dollars that a person typed, such as 0.50 or $2, or NaN. */
export function money(text: string): number {
  const s = String(text || '').trim().replace(/^\$/, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return NaN;
  return Number(s);
}

/** keepOthers keeps the people of a list other than owner, and adds owner when on. */
const keepOthers = (list: string[] | undefined, on: boolean) => [...(list || []).filter((x) => x !== 'owner'), ...(on ? ['owner'] : [])];

/** eventOf writes the event of the form, with only the fields of its kind. */
export function eventOf(e: EventForm): DutyEvent {
  const out: DutyEvent = { kind: e.kind };
  const fields = EVENT_FIELDS[e.kind] || ['agent', 'after', 'path'];
  if (fields.includes('agent') && e.agent) out.agent = e.agent;
  if (fields.includes('after') && e.after) out.after = e.after;
  if (fields.includes('path') && e.path.trim()) out.path = e.path.trim();
  return out;
}

/** doOf writes the action of the form. The placeholders go back to the record. */
export function doOf(f: DutyForm, base: Duty | null): DutyDo {
  const message = toPlaceholders(f.message.trim());
  switch (f.act) {
    case 'post': {
      const post: NonNullable<DutyDo['post']> = { bridge: f.bridge, message };
      if (f.to.length) post.to = [...f.to];
      return { post };
    }
    case 'open': {
      const open: NonNullable<DutyDo['open']> = { playbook: f.playbook };
      if (f.goal.trim()) open.goal = toPlaceholders(f.goal.trim());
      return { open };
    }
    case 'manager':
      return { manager: { message } };
  }
  return { ask: { ...((base && base.do && base.do.ask) || {}), message } };
}

/**
 * recordOf writes the record of PUT /v1/duties/{name}. A field that the
 * form does not show keeps its value from the duty that the person
 * edits: the pool, a start by another app, the limits of tokens and tool
 * calls, the retries, and runAs. The owner never goes out: the front
 * sets it.
 */
export function recordOf(f: DutyForm, base: Duty | null, name: string): DutyRecord {
  const b = base;
  const keepWhen = !!(b && b.when && b.when.webhook);
  const old = (b && b.limits) || ({} as DutyRecord['limits']);
  const budget: DutyRecord['limits']['budget'] = { ...(old.budget || {}) };
  delete budget.maxCostUSD;
  delete budget.maxTurns;
  const cost = money(f.cost);
  if (cost > 0) budget.maxCostUSD = cost;
  const turns = Math.floor(Number(f.turns));
  if (f.turns.trim() && turns > 0) budget.maxTurns = turns;
  const limits: DutyRecord['limits'] = { budget, overlap: f.overlap, catchUp: f.catchUp };
  const perDay = money(f.perDay);
  if (perDay > 0) limits.perDayUSD = perDay;
  if (old.retries !== undefined) limits.retries = old.retries;
  const when = keepWhen ? b!.when : f.start === 'event' ? { event: eventOf(f.event) } : f.say ? { say: f.say } : { schedule: scheduleOf(f.when) };
  const r: DutyRecord = {
    name,
    agent: f.agent,
    when,
    do: doOf(f, b),
    limits,
    whileAway: { decider: f.decider, timeout: f.timeout, then: f.then },
    notify: { failure: keepOthers(b && b.notify ? b.notify.failure : undefined, f.failures), needsYou: keepOthers(b && b.notify ? b.notify.needsYou : undefined, f.questions) },
  };
  if (b && b.pool) r.pool = b.pool;
  const check = checkOf(f.check);
  if (check) r.checkFirst = check;
  if (b && b.runAs) r.runAs = b.runAs;
  if (b) r.paused = !!b.paused;
  if (b && typeof b.revision === 'number') r.revision = b.revision;
  return r;
}

/** The errors of the form, by field. */
export interface FormErrors {
  agent?: string;
  when?: string;
  dates?: string;
  message?: string;
  bridge?: string;
  playbook?: string;
  cost?: string;
  turns?: string;
  perDay?: string;
  count?: string;
  where?: string;
  name?: string;
}

/** formErrors says what is wrong with the form before a dry run. taken names the duties that exist, for a new one. */
export function formErrors(f: DutyForm, opts: { fresh: boolean; name: string; taken: string[]; keepsWhen: boolean }): FormErrors {
  const e: FormErrors = {};
  if (!f.agent) e.agent = 'Pick the agent that does the duty.';
  if (!opts.keepsWhen && f.start === 'event') {
    if (!f.event.kind) e.when = 'Pick what starts the duty.';
  } else if (!opts.keepsWhen && !f.say) {
    const w = whenError(f.when);
    if (w) e.when = w;
    if (f.when.start && f.when.end && f.when.end < f.when.start) e.dates = 'The last day comes before the first day.';
  }
  if (f.act === 'post' && !f.bridge) e.bridge = 'Pick the bridge.';
  if (f.act === 'open' && !f.playbook) e.playbook = 'Pick a playbook.';
  if (f.act !== 'open' && !f.message.trim()) e.message = f.act === 'post' ? 'Write the message for the bridge.' : f.act === 'manager' ? 'Write what the manager does.' : 'Write what the agent does.';
  // No silent cost: a duty saves only with the most that a run can cost.
  if (!f.cost.trim()) e.cost = 'A duty needs a budget. Write the most a run can cost, such as 0.50.';
  else if (!(money(f.cost) > 0)) e.cost = 'Write an amount above 0, such as 0.50.';
  if (f.turns.trim() && !(Number.isInteger(Number(f.turns)) && Number(f.turns) > 0)) e.turns = 'Write a whole number.';
  if (f.perDay.trim() && !(money(f.perDay) > 0)) e.perDay = 'Write an amount above 0, such as 2.00.';
  if (hasCheck(f.check) && f.check.wake === 'atLeast' && !(Number.isInteger(Number(f.check.count)) && Number(f.check.count) > 0)) e.count = 'Write a whole number of items.';
  if (hasCheck(f.check) && f.check.where.some((r) => r.field.trim() && (r.test === 'atLeast' || r.test === 'atMost') && !Number.isFinite(Number(r.text.trim() || 'x'))))
    e.where = 'At least and at most need a number.';
  if (opts.fresh) {
    const why = nameReason(opts.name, opts.taken);
    if (why) e.name = why;
  }
  return e;
}

/* ---------- the problems of the front ---------- */

/** The first parts of a path that a problem can name: the fields of a duty, of the notifications, and of a playbook. */
const ROOTS = ['name', 'agent', 'pool', 'owner', 'when', 'checkFirst', 'do', 'limits', 'whileAway', 'notify', 'runAs', 'paused', 'revision', 'ntfy', 'send', 'quietHours', 'goal', 'placement', 'seats', 'members', 'caps', 'delegation'];

/** A problem of the front: the dotted path of its field, or "", and its words. */
export interface Problem {
  path: string;
  text: string;
}

/**
 * splitProblem reads a problem of the front. A problem that concerns a
 * field starts with the dotted path of the field and a colon, such as
 * "when.schedule: Pick a time.". The text after the colon shows beside
 * the field, with a capital. A problem with no path shows at the top.
 */
export function splitProblem(p: DutyProblem | unknown): Problem {
  const s = String(p === null || p === undefined ? '' : p).trim();
  const m = /^([A-Za-z][\w-]*(?:\.[\w-]+|\[\d+\])*):\s*([\s\S]+)$/.exec(s);
  if (m && ROOTS.includes(m[1].split(/[.[]/)[0])) return { path: m[1], text: cap(m[2].trim()) };
  return { path: '', text: s };
}

/** problemsBy sorts the problems of the front by the place that shows them. slot names the place of a path, and "top" is the top of the form. */
export function problemsBy<S extends string>(ps: unknown[] | null | undefined, slot: (path: string) => S | 'top'): Partial<Record<S | 'top', string[]>> {
  const out: Partial<Record<S | 'top', string[]>> = {};
  for (const p of ps || []) {
    const { path, text } = splitProblem(p);
    if (!text) continue;
    const k = path ? slot(path) : 'top';
    (out[k] = out[k] || []).push(text);
  }
  return out;
}

/** The places of the editor of a duty that show a problem of the front beside them. */
export type DutySlot = 'name' | 'agent' | 'when' | 'check' | 'message' | 'bridge' | 'to' | 'playbook' | 'goal' | 'what' | 'cost' | 'turns' | 'perDay' | 'limits' | 'away' | 'tell';

/** dutySlot names the place of the editor that shows a problem of a path, or top for a path that the form does not show. */
export function dutySlot(path: string): DutySlot | 'top' {
  const parts = path.replace(/\[\d+\]/g, '').split('.');
  const leaf = parts[parts.length - 1];
  switch (parts[0]) {
    case 'name':
      return 'name';
    case 'agent':
      return 'agent';
    case 'when':
      return 'when';
    case 'checkFirst':
      return 'check';
    case 'do':
      if (leaf === 'message') return 'message';
      if (leaf === 'bridge' || leaf === 'to' || leaf === 'playbook' || leaf === 'goal') return leaf;
      return 'what';
    case 'limits':
      if (parts[1] === 'budget') return parts[2] === 'maxTurns' ? 'turns' : 'cost';
      if (parts[1] === 'perDayUSD') return 'perDay';
      return 'limits';
    case 'whileAway':
      return 'away';
    case 'notify':
      return 'tell';
  }
  return 'top';
}

/** dutyProblems sorts the problems of a dry run or a save by the place of the editor that shows them. */
export const dutyProblems = (ps: unknown[] | null | undefined) => problemsBy(ps, dutySlot);

/** elapsedWords says how long a wait took so far, such as 45 seconds so far, or 1 minute 5 seconds so far. */
export function elapsedWords(s: number): string {
  const n = Math.max(0, Math.floor(s));
  if (n < 60) return n + (n === 1 ? ' second' : ' seconds') + ' so far.';
  const m = Math.floor(n / 60);
  const r = n % 60;
  return m + (m === 1 ? ' minute' : ' minutes') + (r ? ' ' + r + (r === 1 ? ' second' : ' seconds') : '') + ' so far.';
}
