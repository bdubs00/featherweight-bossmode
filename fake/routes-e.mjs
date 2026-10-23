// The fake routes of the Duties place, after docs/CONTRACT.md, section 16,
// and the contract of the build, reports/Duties contract 2026-10-23.md.
// register gets the helpers of server.mjs: on adds a route, refuse answers
// a problem, readJson reads the body, S is the state, now is the time,
// AGENTS is the sample data, and admin says whether the person is an
// admin (FAKE_ADMIN=1).
//
//   GET    /v1/duties                       {"duties": [<view>], "paused"}: paused is the switch of every duty
//   GET    /v1/duties/{name}                the view with history, the last 50 runs, newest first
//   PUT    /v1/duties/{name}                create (201) or change (200). ?dryRun=true saves nothing and answers
//                                           {"duty", "readback", "next", "problems"}. &test=true adds "check".
//   PATCH  /v1/duties/{name}                {"paused"}
//   DELETE /v1/duties/{name}                204
//   POST   /v1/duties/{name}/run            202 {"run"}, or 200 {"skipped"} while the last run works
//   POST   /v1/duties/{name}/write-check    {"words"}: {"checkFirst", "readback", "check"}, or 422 with the reason
//   PATCH  /v1/duties                       {"paused", "reason"}, for an admin
//
// The header X-Time-Zone gives the zone of a schedule that names none. The
// fake reads the words of a person with a small grammar, as the front
// does: every day at 9am, weekdays at 9:30am and 4pm, every Monday and
// Thursday at 8:00, every other Tuesday at 3pm, on the first of the month
// at 10am, on the last day of the month, on the first Monday of the month
// at 9, every 2 hours between 8am and 6pm, every 15 minutes, and hourly on
// weekdays. A problem of a dry run is {"field", "message"}.
//
// The data: a report every weekday, a nightly restore test, a watch of the
// incident queue with a check that mostly sleeps, a monthly summary that
// paused itself after three failed runs, and a duty of the settings that
// another app starts.

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NAME = /^[a-z0-9_-]{1,63}$/;
const DAY_IDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const REPEATS = ['daily', 'weekdays', 'weekly', 'monthly', 'hourly', 'every'];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'last'];

/* ---------- time in a zone ---------- */

/** zoneOk reports whether the runtime knows a time zone. */
function zoneOk(zone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** wallOf is the wall clock of a moment in a zone: the date, the minutes of the day, and the day of the week. */
function wallOf(t, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, min: +parts.hour * 60 + +parts.minute, dow: parts.weekday.toLowerCase().slice(0, 3) };
}

/** utcOf is the moment of a wall clock in a zone. A time that summer time skips runs at the first minute after the gap. */
function utcOf(y, m, d, min, zone) {
  const guess = Date.UTC(y, m - 1, d, 0, min);
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const w = wallOf(t, zone);
    const seen = Date.UTC(w.y, w.m - 1, w.d, 0, w.min);
    t += guess - seen;
  }
  return t;
}

const hhmm = (s) => {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || ''));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : -1;
};

/** spanOf reads a Go duration such as 15m, 2h, or 1h30m in minutes, or NaN. */
function spanOf(s) {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(String(s || ''));
  if (!m || !s) return s === '0' ? 0 : NaN;
  return (+m[1] || 0) * 60 + (+m[2] || 0);
}

/** domMatches reports whether a day of a month matches dayOfMonth. */
function domMatches(dom, y, m, d, dow) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (dom === 'last') return d === last;
  if (/^\d+$/.test(dom)) return d === Math.min(+dom, last);
  const [ord, wd] = dom.split(' ');
  if (wd.slice(0, 3) !== dow) return false;
  if (ord === 'last') return d + 7 > last;
  return Math.ceil(d / 7) === ORDINALS.indexOf(ord) + 1;
}

/** nextOf computes the next times of a schedule after a moment, in UTC. */
function nextOf(s, n = 5, from = Date.now()) {
  const zone = s.timeZone || 'UTC';
  const out = [];
  const start = wallOf(from, zone);
  const days = s.days && s.days.length ? s.days : null;
  for (let i = 0; i < 400 && out.length < n; i++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    const dow = DAY_IDS[(day.getUTCDay() + 6) % 7];
    let mins = [];
    if (s.repeat === 'daily') mins = s.times.map(hhmm);
    else if (s.repeat === 'weekdays') mins = DAY_IDS.indexOf(dow) < 5 ? s.times.map(hhmm) : [];
    else if (s.repeat === 'weekly') {
      const week = Math.floor((day.getTime() / DAY + 3) / 7);
      mins = s.days.includes(dow) && week % (s.everyWeeks || 1) === 0 ? s.times.map(hhmm) : [];
    } else if (s.repeat === 'monthly') mins = domMatches(s.dayOfMonth, y, m, d, dow) ? s.times.map(hhmm) : [];
    else if (!days || days.includes(dow)) {
      const step = s.repeat === 'hourly' ? 60 : spanOf(s.every);
      const lo = s.between ? hhmm(s.between[0]) : 0;
      const hi = s.between ? hhmm(s.between[1]) : 24 * 60 - 1;
      for (let t = lo; t <= hi; t += step) mins.push(t);
    }
    for (const t of [...new Set(mins)].sort((a, b) => a - b)) {
      const at = utcOf(y, m, d, t, zone);
      if (at > from && out.length < n) out.push(new Date(at).toISOString());
    }
  }
  return out;
}

/* ---------- the schedule in words ---------- */

const clock = (s) => {
  const t = hhmm(s);
  const h = Math.floor(t / 60);
  return (h % 12 || 12) + ':' + String(t % 60).padStart(2, '0') + (h < 12 ? ' AM' : ' PM');
};
const list = (xs) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? xs[0] + ' and ' + xs[1] : xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1]);
const nth = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const zoneName = (z) => (z === 'UTC' || !z.includes('/') ? z : z.split('/').pop().replace(/_/g, ' ') + ' time');
const span = (m) => (m % 60 === 0 ? (m === 60 ? '1 hour' : m / 60 + ' hours') : m + ' minutes');
const dayWords = (days) => {
  const k = days.join(',');
  if (k === 'mon,tue,wed,thu,fri') return 'on weekdays';
  if (k === 'sat,sun') return 'on weekends';
  return 'on ' + list(days.map((d) => DAY_NAMES[d]));
};

/** readbackOf reads a schedule back in words, such as Every weekday at 9:00 AM, New York time. */
function readbackOf(s) {
  const at = s.times && s.times.length ? ' at ' + list(s.times.map(clock)) : '';
  let w = '';
  if (s.repeat === 'daily') w = 'Every day' + at;
  else if (s.repeat === 'weekdays') w = 'Every weekday' + at;
  else if (s.repeat === 'weekly') {
    const days = list(s.days.map((d) => DAY_NAMES[d]));
    const n = s.everyWeeks || 1;
    w = (n === 1 ? 'Every ' + days : n === 2 ? 'Every other ' + days : 'Every ' + ['', '', '', 'third', 'fourth'][n] + ' week on ' + days) + at;
  } else if (s.repeat === 'monthly') {
    const dom = s.dayOfMonth;
    const which = dom === 'last' ? 'the last day' : /^\d+$/.test(dom) ? 'the ' + nth(+dom) : 'the ' + dom.split(' ')[0] + ' ' + DAY_NAMES[dom.split(' ')[1].slice(0, 3)];
    w = 'On ' + which + ' of the month' + at;
  } else {
    w = s.repeat === 'hourly' ? 'Every hour' : 'Every ' + span(spanOf(s.every));
    if (s.days && s.days.length) w += ' ' + dayWords(s.days);
    if (s.between) w += ' between ' + clock(s.between[0]) + ' and ' + clock(s.between[1]);
  }
  return w + ', ' + zoneName(s.timeZone || 'UTC') + '.';
}

/** timeOf reads a time that a person says, such as 9am, 9:30am, 4pm, 8:00, 9, 15:00, or noon, as HH:MM, or "". */
function timeOf(s) {
  const t = String(s || '').trim();
  if (t === 'noon') return '12:00';
  if (t === 'midnight') return '00:00';
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return '';
  let h = +m[1];
  const min = +(m[2] || 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return '';
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

/** cap gives a text a capital first letter, and each name of a day its capital. */
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s).replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, (d) => d[0].toUpperCase() + d.slice(1));

/** timesOf reads the times after at, or a problem in words. */
function timesOf(text, clear) {
  const parts = String(text).split(/\s*,\s*|\s+and\s+/).filter(Boolean);
  const times = parts.map(timeOf);
  const bad = parts.find((p, i) => !times[i]);
  if (bad) return { problem: cap(clear) + ' is clear. ' + cap(bad) + ' is not a time: pick one.' };
  return { times };
}

const DAY_RE = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?';

/** dayIds reads days of the week, such as monday and thursday. */
const dayIds = (text) => [...text.matchAll(new RegExp(DAY_RE, 'g'))].map((m) => m[1].slice(0, 3)).filter((d, i, a) => a.indexOf(d) === i);

/** parseSay reads the words of a person with the grammar of the front: a schedule, or a problem in words. */
function parseSay(words, zone) {
  const w = String(words || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.!]$/, '').trim();
  const with_ = (s, rest, clear) => {
    if (!rest) return { schedule: { ...s, times: s.times || ['09:00'], timeZone: zone } };
    const m = /^at (.+)$/.exec(rest);
    if (!m) return { problem: cap(clear) + ' is clear. ' + cap(rest) + ' is not a time: pick one.' };
    const t = timesOf(m[1], clear);
    return t.problem ? t : { schedule: { ...s, times: t.times, timeZone: zone } };
  };
  const between = (rest) => {
    const m = /^between (.+) and (.+)$/.exec(rest);
    if (!m) return null;
    const a = timeOf(m[1]);
    const b = timeOf(m[2]);
    return a && b ? [a, b] : null;
  };
  let m;
  if ((m = /^every (\d+) ?(minutes?|mins?|m|hours?|h)\b ?(.*)$/.exec(w))) {
    const mins = /^h/.test(m[2]) ? +m[1] * 60 : +m[1];
    if (mins < 15 || mins > 24 * 60) return { problem: 'A duty runs at most every 15 minutes and at least once a day.' };
    const s = { repeat: 'every', every: mins % 60 === 0 ? mins / 60 + 'h' : mins + 'm', timeZone: zone };
    if (!m[3]) return { schedule: s };
    const b = between(m[3]);
    if (b) return { schedule: { ...s, between: b } };
    return { problem: cap('every ' + m[1] + ' ' + m[2]) + ' is clear. ' + cap(m[3]) + ' is not a time: pick one.' };
  }
  if ((m = /^(?:hourly|every hour)(?: on (weekdays|[a-z ,]+?))?(?: (between .+))?$/.exec(w))) {
    const s = { repeat: 'hourly', timeZone: zone };
    if (m[1]) s.days = m[1] === 'weekdays' ? DAY_IDS.slice(0, 5) : dayIds(m[1]);
    if (m[2]) {
      const b = between(m[2]);
      if (!b) return { problem: 'Every hour is clear. ' + cap(m[2]) + ' is not two times: pick them.' };
      s.between = b;
    }
    return { schedule: s };
  }
  if ((m = /^(?:every day|daily)(?: (.+))?$/.exec(w))) return with_({ repeat: 'daily' }, m[1] || '', 'every day');
  if ((m = /^(?:every )?weekdays?(?: (.+))?$/.exec(w))) return with_({ repeat: 'weekdays' }, m[1] || '', 'every weekday');
  if ((m = /^on the (first|last|\d{1,2})(?:st|nd|rd|th)? (?:day )?of (?:the|each|every) month(?: (.+))?$/.exec(w))) {
    const dom = m[1] === 'first' ? '1' : m[1];
    return with_({ repeat: 'monthly', dayOfMonth: dom }, m[2] || '', 'on the ' + m[1] + ' of the month');
  }
  if ((m = new RegExp('^on the (first|second|third|fourth|last) ' + DAY_RE + ' of (?:the|each|every) month(?: (.+))?$').exec(w))) {
    return with_({ repeat: 'monthly', dayOfMonth: m[1] + ' ' + m[2] }, m[3] || '', 'on the ' + m[1] + ' ' + m[2] + ' of the month');
  }
  if ((m = new RegExp('^every (other |second |third |fourth )?(' + DAY_RE + '(?:(?:,| and|, and) ' + DAY_RE + ')*)(?: (.+))?$').exec(w))) {
    const weeks = { 'other ': 2, 'second ': 2, 'third ': 3, 'fourth ': 4 }[m[1] || ''] || 1;
    const days = dayIds(m[2]);
    const s = { repeat: 'weekly', days: DAY_IDS.filter((d) => days.includes(d)) };
    if (weeks > 1) s.everyWeeks = weeks;
    const rest = w.slice(w.indexOf(m[2]) + m[2].length).trim();
    return with_(s, rest, 'every ' + (m[1] || '') + m[2]);
  }
  return { problem: 'The words "' + words + '" are not a schedule. Try every weekday at 9am, or pick from the sentence.' };
}

/* ---------- the record ---------- */

/** problemsOf checks a record as the front does and turns say into a schedule. It answers the record that a save keeps and every problem. */
function problemsOf(body, zone) {
  const problems = [];
  const p = (field, message) => problems.push({ field, message });
  const d = JSON.parse(JSON.stringify(body || {}));
  delete d.owner;
  if (!d.agent) p('agent', 'A duty needs an agent.');
  const when = d.when || {};
  const starts = ['schedule', 'say', 'event', 'webhook'].filter((k) => when[k]);
  if (starts.length !== 1) p('when', 'A duty needs exactly one start: a schedule, words, an event, or a call of another app.');
  if (when.say) {
    const r = parseSay(when.say, zone);
    if (r.problem) p('when.say', r.problem);
    else d.when = { schedule: r.schedule };
  }
  const s = d.when && d.when.schedule;
  if (s) {
    if (!s.timeZone) s.timeZone = zone;
    if (!REPEATS.includes(s.repeat)) p('when.schedule.repeat', 'The repeat is one of ' + REPEATS.join(', ') + '.');
    if (!zoneOk(s.timeZone)) p('when.schedule.timeZone', s.timeZone + ' is not a time zone.');
    if (['daily', 'weekdays', 'weekly', 'monthly'].includes(s.repeat)) {
      if (!Array.isArray(s.times) || !s.times.length || s.times.length > 12 || s.times.some((t) => hhmm(t) < 0)) p('when.schedule.times', 'Pick 1 to 12 times of the day.');
    }
    if (s.repeat === 'weekly' && (!Array.isArray(s.days) || !s.days.length)) p('when.schedule.days', 'A weekly duty needs at least one day.');
    if (s.days && s.days.some((x) => !DAY_IDS.includes(x))) p('when.schedule.days', 'A day is mon to sun.');
    if (s.repeat === 'monthly' && !/^(?:[1-9]|[12]\d|3[01]|last|(?:first|second|third|fourth|last) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))$/.test(String(s.dayOfMonth || ''))) p('when.schedule.dayOfMonth', 'Pick a day of the month.');
    if (s.repeat === 'every' && !(spanOf(s.every) >= 15 && spanOf(s.every) <= 24 * 60)) p('when.schedule.every', 'A span is 15 minutes to 24 hours.');
    if (s.between && (s.between.length !== 2 || s.between.some((t) => hhmm(t) < 0))) p('when.schedule.between', 'Pick two times of the day.');
  }
  const x = d.do || {};
  const actions = ['ask', 'post', 'open', 'manager'].filter((k) => x[k]);
  if (actions.length !== 1) p('do', 'A duty does exactly one thing.');
  if (x.ask && !String(x.ask.message || '').trim()) p('do.ask.message', 'Write what the agent does.');
  const b = (d.limits && d.limits.budget) || {};
  if (!['maxCostUSD', 'maxTurns', 'maxTokens', 'maxToolCalls'].some((k) => Number(b[k]) > 0)) p('limits.budget', 'A duty needs a budget: the most a run can cost, or its turns, tokens, or tool calls.');
  const l = d.limits || {};
  if (l.overlap && !['skip', 'queue', 'allow'].includes(l.overlap)) p('limits.overlap', 'Overlap is skip, queue, or allow.');
  if (l.catchUp !== undefined && !(spanOf(l.catchUp) >= 0 && spanOf(l.catchUp) <= 24 * 60)) p('limits.catchUp', 'Catch up is 0 to 24 hours.');
  if (d.checkFirst) {
    const look = d.checkFirst.look || {};
    if (!!look.http === !!look.tool) p('checkFirst.look', 'A check looks at an address or a tool, one of the two.');
    if (look.http && !/^https?:\/\/\S+$/.test(look.http.url || '')) p('checkFirst.look.http.url', 'The address of a check starts with http:// or https://.');
  }
  return { duty: d, problems };
}

/** The sample items that a check finds now. */
const INCIDENTS = [
  { number: 'INC0012', short_description: 'VPN drops for the Berlin office', priority: 1 },
  { number: 'INC0019', short_description: 'Mail is slow for the finance team', priority: 2 },
];
const QUEUE = [{ id: 'Q-311', title: 'Printer offline on floor 3' }];

/** checkNow runs a check once: the items that it finds now, their count, and whether they wake the agent. */
function checkNow(c) {
  const found = c.look.tool ? INCIDENTS : QUEUE;
  const wake = c.wake || { when: 'new' };
  const wakes = wake.when === 'atLeast' ? found.length >= (wake.count || 1) : found.length > 0;
  return { found, count: found.length, wakes };
}

export function register({ on, refuse, readJson, now, AGENTS, admin }) {
  const T0 = Date.now();
  const ago = (min) => new Date(T0 - min * MIN).toISOString();
  const zoneOf = (c) => {
    const z = String(c.req.headers['x-time-zone'] || '');
    return z && zoneOk(z) ? z : 'UTC';
  };

  /** history makes the sample runs of a duty, newest first. */
  const runsOf = (every, n, make) => Array.from({ length: n }, (_, i) => make(i, ago(i * every + 7)));

  const D = new Map();
  const add = (d, history) => D.set(d.name, { source: 'store', revision: 1, paused: false, runAs: 'duty', owner: 'alice@example.com', whileAway: { decider: 'manager', timeout: '2h', then: 'deny' }, notify: { failure: ['owner'], needsYou: ['owner'] }, ...d, history });
  add(
    {
      name: 'daily-release-notes',
      agent: 'scribe',
      when: { schedule: { repeat: 'weekdays', times: ['16:00'], timeZone: 'Europe/Berlin' } },
      do: { ask: { message: 'Draft the release notes of {date} from the changes merged today. The notes of the last run were {last.title}.' } },
      limits: { budget: { maxCostUSD: 0.5, maxTurns: 40 }, perDayUSD: 2, overlap: 'skip', catchUp: '1h', retries: 1 },
      revision: 7,
    },
    runsOf(24 * 60, 6, (i, at) => ({ at, slot: at, run: 'duty-notes-' + i, state: 'completed', costUSD: 0.11 + i / 100 })),
  );
  add(
    {
      name: 'nightly-restore-test',
      agent: 'backup',
      when: { schedule: { repeat: 'daily', times: ['02:00'], timeZone: 'Europe/Berlin' } },
      do: { ask: { message: 'Restore last night’s backup into the scratch cluster, and write whether it restores to backups/{date}.md.' } },
      limits: { budget: { maxCostUSD: 1 }, overlap: 'skip', catchUp: '6h' },
      whileAway: { decider: 'nobody', timeout: '4h', then: 'cancel' },
    },
    [{ at: ago(300), slot: ago(300), run: 'duty-restore-0', state: 'input-required', costUSD: 0.07 }, ...runsOf(24 * 60, 4, (i, at) => ({ at: ago((i + 1) * 24 * 60 + 300), slot: at, run: 'duty-restore-' + (i + 1), state: 'completed', costUSD: 0.21 }))],
  );
  add(
    {
      name: 'watch-p1-incidents',
      agent: 'triage',
      when: { schedule: { repeat: 'every', every: '15m', days: ['mon', 'tue', 'wed', 'thu', 'fri'], between: ['08:00', '18:00'], timeZone: 'Europe/Berlin' } },
      checkFirst: { look: { tool: 'servicenow.query_incidents', input: { query: 'assignment_group=Platform Ops^priority<=2^active=true' } }, items: 'result.records', key: 'number', where: [{ field: 'priority', oneOf: [1, 2] }], wake: { when: 'new' } },
      do: { ask: { message: 'Triage the new incidents and hand each one to its team: {found}' } },
      limits: { budget: { maxCostUSD: 0.2, maxTurns: 20 }, perDayUSD: 3, overlap: 'queue', catchUp: '15m' },
      revision: 3,
    },
    runsOf(15, 12, (i, at) =>
      i === 3 ? { at, slot: at, run: 'duty-watch-' + i, state: 'completed', costUSD: 0.04, found: 2, woke: true } : i === 7 ? { at, slot: at, run: '', state: 'failed', found: 0, woke: false, reason: 'The check failed: ServiceNow answered 503.' } : { at, slot: at, run: '', state: 'completed', found: 0, woke: false },
    ),
  );
  add(
    {
      name: 'monthly-migration-summary',
      agent: 'writer',
      owner: 'bob@example.com',
      when: { schedule: { repeat: 'monthly', dayOfMonth: 'first monday', times: ['09:00'], timeZone: 'America/New_York' } },
      do: { ask: { message: 'Sum up the migrations of last month in the wiki under migrations/summary-{date}.md.' } },
      limits: { budget: { maxCostUSD: 0.8 }, overlap: 'skip', catchUp: '1h' },
      paused: true,
      state: { pausedReason: 'Three runs in a row failed.' },
    },
    runsOf(60, 3, (i, at) => ({ at, slot: at, run: 'duty-summary-' + i, state: 'failed', costUSD: 0.02, reason: 'The run reached its limit of turns.' })),
  );
  add(
    {
      name: 'renew-certificates',
      agent: 'ops',
      source: 'file',
      when: { webhook: { auth: { mode: 'bearer', secret: 'CERT_HOOK' } } },
      do: { ask: { message: 'Renew the certificate that the call names: {event}' } },
      limits: { budget: { maxCostUSD: 0.3 }, overlap: 'skip' },
    },
    [{ at: ago(3000), run: 'duty-cert-0', state: 'completed', costUSD: 0.05 }],
  );
  let allPaused = false;
  let runN = 0;

  /** view is a duty as a read answers it, with its readback, its next times, and its state. */
  const view = (d, history = false) => {
    const { history: h, state: st, ...rec } = d;
    const s = rec.when.schedule;
    const today = (h || []).filter((r) => Date.now() - Date.parse(r.at) < DAY).reduce((n, r) => n + (r.costUSD || 0), 0);
    const out = {
      ...rec,
      readback: s ? readbackOf(s) : rec.when.webhook ? 'When another app calls.' : '',
      next: s && !rec.paused ? nextOf(s) : [],
      state: { lastRun: (h && h[0]) || null, todayUSD: Math.round(today * 100) / 100, failuresInRow: (h || []).findIndex((r) => r.state !== 'failed') < 0 ? (h || []).length : (h || []).findIndex((r) => r.state !== 'failed'), pausedReason: (st && st.pausedReason) || '' },
    };
    if (history) out.history = (h || []).slice(0, 50);
    return out;
  };
  const find = (raw) => {
    const name = decodeURIComponent(raw);
    const d = D.get(name);
    if (!d) refuse(404, `no duty ${name}`);
    return d;
  };
  const canChange = (c, d) => admin() || (AGENTS.find((a) => a.name === d.agent) || {}).role === 'owner' || d.owner === c.person.subject;

  on('GET', '/v1/duties', () => ({ duties: [...D.values()].map((d) => view(d)), paused: allPaused }));

  on('PATCH', '/v1/duties', async (c) => {
    if (!admin()) refuse(403, 'only an admin can pause every duty');
    const body = await readJson(c.req);
    if (typeof body.paused !== 'boolean') refuse(400, 'paused must be true or false');
    allPaused = body.paused;
    return { paused: allPaused, reason: body.reason || '' };
  });

  on('GET', '/v1/duties/([^/]+)', (c, raw) => view(find(raw), true));

  on('PUT', '/v1/duties/([^/]+)', async (c, raw) => {
    const name = decodeURIComponent(raw);
    if (!NAME.test(name)) refuse(400, `a duty name holds 1 to 63 of a-z, 0-9, - and _, not "${name}"`);
    const body = await readJson(c.req);
    if (body.name && body.name !== name) refuse(400, `the body names the duty "${body.name}" but the path names "${name}"`);
    const old = D.get(name);
    if (old && old.source === 'file') refuse(409, 'the duty comes from the settings of the front, which the routes never change');
    if (old && !canChange(c, old)) refuse(403, `only an owner of ${old.agent} or an admin can change this duty`);
    const zone = zoneOf(c);
    const { duty, problems } = problemsOf({ ...body, name }, zone);
    const dry = c.url.searchParams.get('dryRun') === 'true';
    const s = duty.when && duty.when.schedule;
    const readback = s && !problems.some((p) => p.field.startsWith('when')) ? readbackOf(s) : duty.when && duty.when.webhook ? 'When another app calls.' : '';
    if (dry) {
      const out = { duty: { ...duty, owner: old ? old.owner : c.person.subject }, readback, next: readback && s ? nextOf(s) : [], problems };
      if (c.url.searchParams.get('test') === 'true') {
        if (duty.checkFirst && !problems.some((p) => p.field.startsWith('checkFirst'))) out.check = checkNow(duty.checkFirst);
        else if (!duty.checkFirst) problems.push({ field: 'checkFirst', message: 'The duty has no check to try.' });
      }
      return out;
    }
    if (problems.length) refuse(400, problems[0].message, { problems });
    if (old && body.revision !== undefined && body.revision !== old.revision) refuse(409, `the duty changed: revision ${old.revision} is newer than ${body.revision}`);
    const rec = { ...duty };
    delete rec.revision;
    const runAs = rec.runAs === 'owner' && old && old.owner !== c.person.subject ? 'duty' : rec.runAs || 'duty';
    const next = { ...(old || {}), ...rec, runAs, source: 'store', owner: old ? old.owner : c.person.subject, revision: old ? old.revision + 1 : 1, history: old ? old.history : [], state: old ? old.state : undefined };
    if (!rec.checkFirst) delete next.checkFirst;
    D.set(name, next);
    c.status = old ? 200 : 201;
    return view(next);
  });

  on('PATCH', '/v1/duties/([^/]+)', async (c, raw) => {
    const d = find(raw);
    if (d.source === 'file') refuse(409, 'the duty comes from the settings of the front, which the routes never change');
    if (!canChange(c, d)) refuse(403, `only an owner of ${d.agent} or an admin can pause this duty`);
    const body = await readJson(c.req);
    if (typeof body.paused !== 'boolean') refuse(400, 'paused must be true or false');
    d.paused = body.paused;
    if (!body.paused) d.state = { ...(d.state || {}), pausedReason: '' };
    d.revision++;
    return view(d);
  });

  on('DELETE', '/v1/duties/([^/]+)', (c, raw) => {
    const d = find(raw);
    if (d.source === 'file') refuse(409, 'the duty comes from the settings of the front, which the routes never change');
    if (!canChange(c, d)) refuse(403, `only an owner of ${d.agent} or an admin can delete this duty`);
    D.delete(d.name);
    c.status = 204;
  });

  on('POST', '/v1/duties/([^/]+)/run', (c, raw) => {
    const d = find(raw);
    const last = d.history[0];
    if ((d.limits.overlap || 'skip') === 'skip' && last && ['running', 'queued', 'input-required'].includes(last.state)) return { skipped: 'The last run still works.' };
    const id = 'duty-run-' + ++runN + '-' + Date.now().toString(36);
    const entry = { at: now(), slot: now(), run: id, state: 'running', costUSD: 0 };
    d.history.unshift(entry);
    // The run of the fake finishes after a few seconds, with a small cost.
    setTimeout(() => Object.assign(entry, { state: 'completed', costUSD: 0.03 }), 4000);
    c.status = 202;
    return { run: id };
  });

  on('POST', '/v1/duties/([^/]+)/write-check', async (c, raw) => {
    const d = D.get(decodeURIComponent(raw));
    if (!d) refuse(404, `no duty ${decodeURIComponent(raw)}: save the duty first, so its agent can write the check`);
    const body = await readJson(c.req);
    const words = String(body.words || '').trim();
    if (!words) refuse(400, 'write what the agent waits for');
    const url = /(https?:\/\/\S+)/.exec(words);
    let check;
    if (url) check = { look: { http: { url: url[1] } }, items: 'items', key: 'id', wake: { when: 'new' } };
    else if (/incident|p1|p2|servicenow/i.test(words)) check = { look: { tool: 'servicenow.query_incidents', input: { query: 'priority<=2^active=true' } }, items: 'result.records', key: 'number', where: [{ field: 'priority', oneOf: [1, 2] }], wake: { when: 'new' } };
    else refuse(422, `${d.agent} has no tool that reads that. Name the address of the list, or set the check up by hand`);
    return { checkFirst: check, readback: (check.look.tool ? 'Call the tool ' + check.look.tool : 'Look at ' + check.look.http.url) + '. Wake ' + d.agent + ' only for items that it did not see before.', check: checkNow(check) };
  });
}
