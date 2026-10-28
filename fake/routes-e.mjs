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
//                                           The draft of a duty without a name is new. A save refuses new and options.
//   PATCH  /v1/duties/{name}                {"paused"}
//   DELETE /v1/duties/{name}                204
//   POST   /v1/duties/{name}/run            202 {"run"}, 202 {"run": ""} for a duty that posts or opens a bridge,
//                                           or 200 {"skipped"} while the last run works
//   POST   /v1/duties/{name}/write-check    {"words", "agent"}: {"checkFirst", "readback", "check"} after a few
//                                           seconds. 400 {"problems"} for no words or no agent. 422 with the reason
//                                           in error, and the record that the agent tried for words about a queue.
//                                           504 for words that hold "slow"
//   PATCH  /v1/duties                       {"paused", "reason"}, for an admin
//   GET    /v1/duties/options               {"secrets": [{"name", "hosts"}], "events", "actions", "looks"}
//   GET    /v1/notifications                {"channels", "quietHours", "offered", "shared", "off", "serverDefault"}: url,
//                                           secret, and ntfy.token read "set" or ""
//   PUT    /v1/notifications                {"channels", "quietHours"}: "set" keeps a write-only value, "" clears it.
//                                           400 {"problems"} with paths such as channels[1].url
//   POST   /v1/notifications/test           {"channel"} or {}: {"results": [{"channel", "sent", "error"}]}. 400 for an
//                                           unknown place
//   GET    /v1/playbooks                    {"playbooks": [...]}, without caps and delegation
//   GET    /v1/playbooks/{name}             the playbook whole
//   PUT    /v1/playbooks/{name}             {"goal", "placement", "seats", "caps", "delegation", "revision"}: 201, 200, 400, or 409
//   DELETE /v1/playbooks/{name}             204
//   GET    /v1/inbox                        {"items": [{"kind", "run", "approval", "duty", "agent", "bridge", "text", "since"}]}
//
// The header X-Time-Zone gives the zone of a schedule that names none. The
// fake reads the words of a person with a small grammar, as the front
// does: every day at 9am, weekdays at 9:30am and 4pm, every Monday and
// Thursday at 8:00, every other Tuesday at 3pm, on the first of the month
// at 10am, on the last day of the month, on the first Monday of the month
// at 9, every 2 hours between 8am and 6pm, every 15 minutes, and hourly on
// weekdays. A problem is a string. A problem of a field starts with the
// dotted path of the field and a colon, such as "when.schedule: ...".
//
// The data: a report every weekday, a nightly restore test that waits for
// an answer, a watch of the incident queue with a check that mostly sleeps
// and a question that the manager allowed, a monthly summary that paused
// itself after three failed runs, a duty of the settings that another app
// starts and whose last run failed, a duty that posts in a bridge when
// another bridge closes, and a playbook of weekly patching. A run that Run now starts carries the
// metadata workbench.duty. A nightly check of the web hosts tells alice
// only of a result that found something: last night it found a drift,
// which waits for her to check it, and the nights before found nothing. A
// weekly summary of competitors does the work of the template of the door,
// so the door names it as the same work.

import { foundLine, inReview } from './routes-work.mjs';

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

/** The refusal of a change of a locked duty, as the server says it. */
const LOCKED = 'This duty is locked by the setup of this server. The person who runs the server can change it.';

/** problemsOf checks a record as the server does and turns say into a schedule. It answers the record that a save keeps and every problem. templated lets an ask go with no message. */
function problemsOf(body, zone, { templated = false } = {}) {
  const problems = [];
  const p = (field, message) => problems.push(field ? field + ': ' + message : message);
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
  if (d.when && d.when.event && !EVENTS.includes(d.when.event.kind)) p('when.event.kind', 'Pick what starts the duty.');
  const x = d.do || {};
  const actions = ['ask', 'post', 'open', 'manager'].filter((k) => x[k]);
  if (actions.length !== 1) p('do', 'A duty does exactly one thing.');
  if (x.ask && !templated && !String(x.ask.message || '').trim()) p('do.ask.message', 'Write what the agent does.');
  if (x.post) {
    const b = ctx.bridges.get(x.post.bridge);
    if (!b) p('do.post.bridge', 'Pick the bridge.');
    else if (b.state !== 'open') p('do.post.bridge', 'The bridge ' + b.title + ' is closed. Pick an open bridge.');
    const handles = b ? b.members.filter((m) => !m.fired).map((m) => m.handle) : [];
    for (const h of x.post.to || []) if (b && !handles.includes(h)) p('do.post.to', h + ' has no seat on this bridge.');
    if (!String(x.post.message || '').trim()) p('do.post.message', 'Write the message for the bridge.');
  }
  if (x.open && !ctx.playbooks.has(x.open.playbook)) p('do.open.playbook', 'There is no playbook ' + (x.open.playbook || '') + '. Pick one.');
  if (x.manager && !String(x.manager.message || '').trim()) p('do.manager.message', 'Write what the manager does.');
  // The budget follows the action. A post spends nothing of its own, so the
  // front drops its budget and its cap of a day. The budget of an open is
  // the turns of the whole bridge, and it has no cap of a day either.
  const l = d.limits || {};
  const b = l.budget || {};
  if (x.post) {
    delete l.budget;
    delete l.perDayUSD;
  } else if (x.open) {
    if (['maxCostUSD', 'maxTokens', 'maxToolCalls'].some((k) => Number(b[k]) > 0)) p('limits.budget', 'A bridge counts turns. Give maxTurns, such as 40, and leave out the other limits.');
    else if (!(Number(b.maxTurns) > 0)) p('limits.budget.maxTurns', 'A duty that opens a bridge needs the most turns of the whole bridge, such as 40.');
    delete l.perDayUSD;
  } else if (!['maxCostUSD', 'maxTurns', 'maxTokens', 'maxToolCalls'].some((k) => Number(b[k]) > 0)) p('limits.budget', 'A duty needs a budget: the most a run can cost, or its turns, tokens, or tool calls.');
  if (l.overlap && !['skip', 'queue', 'allow'].includes(l.overlap)) p('limits.overlap', 'Overlap is skip, queue, or allow.');
  if (l.catchUp !== undefined && !(spanOf(l.catchUp) >= 0 && spanOf(l.catchUp) <= 24 * 60)) p('limits.catchUp', 'Catch up is 0 to 24 hours.');
  if (d.checkFirst) {
    const look = d.checkFirst.look || {};
    if (!!look.http === !!look.tool) p('checkFirst.look', 'A check looks at an address or a tool, one of the two.');
    if (look.http && !/^https?:\/\/\S+$/.test(look.http.url || '')) p('checkFirst.look.http.url', 'The address of a check starts with http:// or https://.');
    else if (look.http && look.http.secret) {
      const secret = SECRETS.find((x) => x.name === look.http.secret);
      const host = new URL(look.http.url).hostname.toLowerCase();
      if (!secret) p('checkFirst.look.http.secret', 'The server has no secret ' + look.http.secret + '.');
      else if (!secret.hosts.some((h) => hostGlob(h, host))) p('checkFirst.look.http.secret', 'The secret ' + secret.name + ' does not go to ' + host + '.');
    }
  }
  return { duty: d, problems };
}

/**
 * hostGlob matches the host name of an address, without its port, against
 * a pattern of a secret, as path.Match of Go does for a name without a
 * slash: * is any run of characters, ? one character, and [...] a class,
 * with ^ for one that negates. A bad pattern matches nothing.
 */
function hostGlob(pattern, host) {
  const esc = (c) => c.replace(/[\\^$.*+?()[\]{}|\/-]/g, '\\$&');
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '\\') {
      if (++i >= pattern.length) return false;
      re += esc(pattern[i]);
    } else if (c === '[') {
      let j = i + 1;
      let cls = '';
      if (pattern[j] === '^') {
        cls = '^';
        j++;
      }
      const start = j;
      // As in Go, a class takes no bare ] or - first.
      if (pattern[j] === ']' || pattern[j] === '-') return false;
      for (; j < pattern.length && !(pattern[j] === ']' && j > start); j++) {
        if (pattern[j] === '\\') j++;
        cls += pattern[j] === '-' && j > start ? '-' : esc(pattern[j] || '');
      }
      if (j >= pattern.length) return false;
      re += '[' + cls + ']';
      i = j;
    } else re += esc(c);
  }
  try {
    return new RegExp('^' + re + '$').test(host);
  } catch {
    return false;
  }
}

/** What the fake serves now, as GET /v1/duties/options answers it. */
const EVENTS = ['bridge.closed', 'run.failed', 'question.waiting', 'page.changed', 'routine.ready', 'cap.reached'];
const SECRETS = [
  { name: 'QUEUE_TOKEN', hosts: ['queue.example.com'] },
  { name: 'GITHUB_TOKEN', hosts: ['api.github.com'] },
  { name: 'LAB_API', hosts: ['*.lab.example.org', 'node[0-9].lab.example.org'] },
];

/** eventWords reads an event back in words, as the page does. */
function eventWords(e) {
  const who = e.agent || '';
  switch (e.kind) {
    case 'bridge.closed':
      return who ? `When a bridge of ${who} closes.` : 'When a bridge closes.';
    case 'run.failed':
      return who ? `When a run of ${who} fails.` : 'When a run of an agent fails.';
    case 'question.waiting':
      return `When a question waits longer than ${span(spanOf(e.after || '1h'))}.`;
    case 'page.changed':
      return e.path ? `When a page under ${e.path} changes.` : 'When a page changes.';
    case 'routine.ready':
      return 'When a routine is ready.';
    case 'cap.reached':
      return 'When a cap is reached.';
  }
  return 'When something happens in the fleet.';
}

/** whereSaid says one filter of a check, as the front does. */
function whereSaid(w) {
  const f = String(w.field || '').trim();
  const v = (x) => JSON.stringify(x);
  if (w.is !== undefined) return f + ' is ' + v(w.is);
  if (w.isNot !== undefined) return f + ' is not ' + v(w.isNot);
  if (Array.isArray(w.oneOf)) return f + ' is ' + w.oneOf.map(v).join(' or ');
  if (w.contains !== undefined) return f + ' contains ' + v(w.contains);
  if (w.atLeast !== undefined) return f + ' is at least ' + v(w.atLeast);
  if (w.atMost !== undefined) return f + ' is at most ' + v(w.atMost);
  return f;
}

/** checkSaid says what the check of a duty looks for and when it wakes the agent, as the readback of the front does after the start. */
function checkSaid(d) {
  const c = d.checkFirst;
  let s = '';
  if (c.look && c.look.http) {
    const u = new URL(c.look.http.url);
    s = 'First it looks at ' + u.host + u.pathname.replace(/\/$/, '');
  } else if (c.look && c.look.tool) s = 'First it calls the tool ' + c.look.tool;
  if (c.items) s += ' for the items at ' + c.items;
  if (c.where && c.where.length) s += ', where ' + c.where.map(whereSaid).join(' and ');
  s += '. ';
  const wake = c.wake || { when: 'new' };
  if (wake.when === 'any') s += 'Any item wakes ' + d.agent + '.';
  else if (wake.when === 'atLeast') s += wake.count + ' items or more wake ' + d.agent + '.';
  else s += 'Only items that it did not see before wake ' + d.agent + ', by their ' + (c.key || '') + '.';
  const x = d.do || {};
  const message = (x.ask && x.ask.message) || (x.post && x.post.message) || (x.manager && x.manager.message) || '';
  if (message.includes('{found}')) s += ' The run gets the list.';
  return s;
}

/** withCheck adds what the check looks for to the readback of a start, as the front does. A start that does not read back stays empty. */
const withCheck = (start, d) => (start && d.checkFirst && d.checkFirst.look ? start + ' ' + checkSaid(d) : start);

/** The bridges and the playbooks that problemsOf checks a duty against. register fills them. */
const ctx = { bridges: new Map(), playbooks: new Map() };

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

// The door of the Tasks place (routes-door.mjs) reads words with the same grammar.
export { parseSay, readbackOf, nextOf, zoneOk };

export function register({ on, refuse, readJson, now, AGENTS, admin, S, publish }) {
  const T0 = Date.now();
  ctx.bridges = S.bridges;
  const ago = (min) => new Date(T0 - min * MIN).toISOString();
  const zoneOf = (c) => {
    const z = String(c.req.headers['x-time-zone'] || '');
    return z && zoneOk(z) ? z : 'UTC';
  };

  /** history makes the sample runs of a duty, newest first. */
  const runsOf = (every, n, make) => Array.from({ length: n }, (_, i) => make(i, ago(i * every + 7)));

  const D = new Map();
  // The board of the work (routes-work.mjs) reads the starts of the duties.
  S.duties = D;
  const add = (d, history) => D.set(d.name, { source: 'store', revision: 1, paused: false, runAs: 'duty', owner: 'alice@example.com', whileAway: { decider: 'manager', timeout: '2h', then: 'deny' }, notify: { failure: ['owner'], needsYou: ['owner'] }, ...d, history });
  add(
    {
      name: 'daily-release-notes',
      agent: 'scribe',
      when: { schedule: { repeat: 'weekdays', times: ['16:00'], timeZone: 'Europe/Berlin' } },
      do: { ask: { message: 'Draft the release notes of {date} from the changes merged today. The notes of the last run were {last.title}.' } },
      limits: { budget: { maxCostUSD: 0.5, maxTurns: 40 }, perDayUSD: 2, overlap: 'skip', catchUp: '1h', retries: 1 },
      // alice checks each draft, and hears of each result.
      review: true,
      notify: { failure: ['owner'], needsYou: ['owner'], result: ['owner'], resultWhen: 'always' },
      revision: 7,
    },
    // The last start failed and goes again. Its first run failed, so the start names none until the next attempt.
    // The draft of yesterday waits for alice to check it. She accepted the drafts before it, and sent one back.
    [
      { at: ago(4), slot: ago(4), run: '', state: 'retrying', costUSD: 0.03, attempt: 1, reason: 'The run failed: the model answered 529 overloaded. It goes again.' },
      ...runsOf(24 * 60, 6, (i, at) => ({ at: ago((i + 1) * 24 * 60 + 7), slot: at, run: 'duty-notes-' + i, state: 'completed', costUSD: 0.11 + i / 100, ...(i > 0 ? { verdict: i === 2 ? 'sent-back' : 'accepted' } : {}) })),
    ],
  );
  S.runs.set('duty-notes-0', {
    id: 'duty-notes-0', agent: 'scribe', title: 'Release notes of yesterday', state: 'completed', seq: 6, origin: 'duty', principal: 'duty:daily-release-notes',
    input: 'Draft the release notes of yesterday from the changes merged today.',
    output: '## For people who run the fleet\n\n- A pool keeps its workers when only its packages change.\n- The wiki restores a removed page.\n\n## Changes that need an action\n\n- Set `workbench.bossmode.chat.agent` again after the upgrade.',
    metadata: { 'workbench.duty': 'daily-release-notes', 'workbench.review': '1', 'fw.title': 'Release notes of yesterday' },
    createdAt: ago(24 * 60 + 7), updatedAt: ago(24 * 60), member: 'default/crew-1', usage: { turns: 4, costUSD: 0.11 },
  });
  S.transcripts.set('duty-notes-0', [{ seq: 1, time: ago(24 * 60 + 7), kind: 'user', text: 'Draft the release notes of yesterday from the changes merged today.', who: 'duty:daily-release-notes' }]);
  S.results.set('duty-notes-0', { runId: 'duty-notes-0', title: 'Release notes of yesterday', agent: 'scribe', status: 'ready', started: ago(24 * 60 + 7), changed: ago(24 * 60), next: [] });
  // The drafts before it, which alice checked: each run holds the thumb of its verdict, so the page of the duty shows it.
  for (const e of D.get('daily-release-notes').history) {
    if (!e.run || S.runs.has(e.run)) continue;
    const day = new Date(e.slot).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    S.runs.set(e.run, {
      id: e.run, agent: 'scribe', title: 'Release notes of ' + day, state: 'completed', seq: 7, origin: 'duty', principal: 'duty:daily-release-notes',
      input: 'Draft the release notes of ' + day + ' from the changes merged that day.',
      output: '## For people who run the fleet\n\n- The notes of ' + day + '.',
      metadata: { 'workbench.duty': 'daily-release-notes', 'workbench.review': '1', 'fw.title': 'Release notes of ' + day },
      reactions: e.verdict === 'sent-back' ? { down: 1 } : { up: 1 },
      createdAt: e.slot, updatedAt: e.at, member: 'default/crew-1', usage: { turns: 4, costUSD: e.costUSD },
    });
    S.results.set(e.run, { runId: e.run, title: 'Release notes of ' + day, agent: 'scribe', status: 'ready', started: e.slot, changed: e.at, next: [] });
  }
  add(
    {
      name: 'nightly-restore-test',
      agent: 'backup',
      when: { schedule: { repeat: 'daily', times: ['02:00'], timeZone: 'Europe/Berlin' } },
      do: { ask: { message: 'Restore last night’s backup into the scratch cluster, and write whether it restores to backups/{date}.md.' } },
      limits: { budget: { maxCostUSD: 1 }, overlap: 'skip', catchUp: '6h' },
      whileAway: { decider: 'nobody', timeout: '4h', then: 'cancel' },
    },
    // Each restore that ended passed the done check of the agent: the restored database answers. So each one is checked.
    [{ at: ago(300), slot: ago(300), run: 'duty-restore-0', state: 'input-required', costUSD: 0.07 }, ...runsOf(24 * 60, 4, (i, at) => ({ at: ago((i + 1) * 24 * 60 + 300), slot: at, run: 'duty-restore-' + (i + 1), state: 'completed', costUSD: 0.21, verdict: 'checked' }))],
  );
  add(
    {
      name: 'watch-p1-incidents',
      agent: 'triage',
      when: { schedule: { repeat: 'every', every: '15m', days: ['mon', 'tue', 'wed', 'thu', 'fri'], between: ['08:00', '18:00'], timeZone: 'Europe/Berlin' } },
      checkFirst: { look: { tool: 'servicenow.query_incidents', input: { query: 'assignment_group=Platform Ops^priority<=2^active=true' } }, items: 'result.records', key: 'number', where: [{ field: 'priority', oneOf: [1, 2] }], wake: { when: 'new' } },
      do: { ask: { message: 'Triage the new incidents and hand each one to its team: {found}' } },
      limits: { budget: { maxCostUSD: 0.2, maxTurns: 20 }, perDayUSD: 3, overlap: 'queue', catchUp: '15m' },
      notify: { failure: ['owner', 'channel:ops-room'], needsYou: ['owner'] },
      revision: 3,
    },
    runsOf(15, 12, (i, at) =>
      i === 3
        ? { at, slot: at, run: 'duty-watch-' + i, state: 'completed', costUSD: 0.04, found: 2, woke: true, decided: [{ at, by: 'manager', verdict: 'allow', tool: 'servicenow.update_incident', reason: 'It only adds a work note to INC0012.' }, { at, by: 'timeout', verdict: 'deny', tool: 'servicenow.close_incident' }] }
        : i === 7 ? { at, slot: at, run: '', state: 'failed', found: 0, woke: false, reason: 'The check failed: ServiceNow answered 503.' } : { at, slot: at, run: '', state: 'completed', found: 0, woke: false },
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
  // The entries of workbench.sources, as the server imports them once into
  // the store: ordinary duties with the origin config. The message of
  // renew-certificates comes from a template of the setup, which no route
  // shows. audit-access is locked, so a change, a pause, or a delete of it
  // answers 409.
  const imported = (d) => D.set(d.name, { source: 'store', revision: 1, runAs: 'duty', owner: '', limits: { budget: {} }, whileAway: { decider: 'manager', timeout: '2h', then: 'deny' }, notify: { failure: [], needsYou: [] }, ...d, origin: { kind: 'config', name: d.name }, history: [] });
  imported({
    name: 'renew-certificates',
    agent: 'ops',
    // alice runs the setup of the fake, so she can change this duty, as an operator of ops cannot otherwise.
    owner: 'alice@example.com',
    template: true,
    when: { webhook: { auth: { mode: 'bearer', secret: 'CERT_HOOK' } } },
    do: { ask: {} },
  });
  imported({
    name: 'helpdesk-tickets',
    agent: 'triage',
    when: { schedule: { repeat: 'every', every: '15m', timeZone: 'UTC' } },
    checkFirst: { look: { http: { url: 'https://helpdesk.example.com/api/tickets' } }, items: 'tickets', key: 'id', wake: { when: 'new' } },
    do: { ask: { message: 'Sort the new tickets of the helpdesk: {found}.' } },
    limits: { budget: { maxCostUSD: 0.2 }, overlap: 'skip', catchUp: '1h' },
  });
  imported({
    name: 'audit-access',
    agent: 'ops',
    locked: true,
    when: { schedule: { repeat: 'daily', times: ['06:00'], timeZone: 'UTC' } },
    do: { ask: { message: 'Audit the access log of last night, and list each login from a new address.' } },
    limits: { budget: { maxCostUSD: 0.3 }, overlap: 'skip', catchUp: '1h' },
  });
  add(
    {
      name: 'review-after-close',
      agent: 'reviewer',
      when: { event: { kind: 'bridge.closed', agent: 'migrator' } },
      do: { post: { bridge: [...S.bridges.keys()][0], to: [], message: 'A bridge of the migrator closed: {event}. Review what it changed.' } },
      limits: { overlap: 'queue', catchUp: '1h' },
      revision: 2,
    },
    // The queue never took the run of the last start, so the start and its failure name no run.
    [{ at: ago(40), slot: ago(40), run: '', state: 'failed', start: 'event', reason: 'The queue of reviewer did not take the run: the queue is full.' }],
  );
  // The nightly check of the web hosts tells alice only of what it finds. Last night it found a drift, which waits for her to check it.
  add(
    {
      name: 'check-the-web-hosts-for-drift',
      title: 'Check the web hosts for drift',
      agent: 'ops',
      when: { schedule: { repeat: 'daily', times: ['02:00'], timeZone: 'Europe/Berlin' } },
      do: { ask: { message: 'Every night, check the web hosts for drift from their Ansible roles. When you find nothing, say so in one line. When you find a drift, start your answer with Found: and the drift.' } },
      limits: { budget: { maxCostUSD: 0.3 }, overlap: 'skip', catchUp: '6h' },
      whileAway: { decider: 'nobody', timeout: '24h', then: 'deny' },
      notify: { failure: ['owner'], needsYou: ['owner'], result: ['owner'], resultWhen: 'found' },
    },
    runsOf(24 * 60, 4, (i) => ({ at: ago(i * 24 * 60 + 300), slot: ago(i * 24 * 60 + 310), run: 'duty-drift-' + i, state: 'completed', costUSD: Math.round((0.04 + i / 100) * 100) / 100, ...(i > 0 ? { verdict: 'unchecked' } : {}) })),
  );
  for (const e of D.get('check-the-web-hosts-for-drift').history) {
    const found = e.run === 'duty-drift-0';
    const output = found
      ? 'Found: web-2 drifted from its role in two files.\n\n| File | Role | Host |\n|---|---|---|\n| /etc/nginx/nginx.conf | worker_processes auto | worker_processes 4 |\n| /etc/logrotate.d/nginx | rotate 14 | rotate 52 |\n\nweb-1 and web-3 match their roles.'
      : 'Nothing drifted. web-1, web-2, and web-3 match their roles.';
    S.runs.set(e.run, {
      id: e.run, agent: 'ops', title: 'Check the web hosts for drift', state: 'completed', seq: 5, origin: 'duty', principal: 'duty:check-the-web-hosts-for-drift',
      input: 'Check the web hosts for drift from their Ansible roles.', output,
      metadata: { 'workbench.duty': 'check-the-web-hosts-for-drift', 'workbench.found': '1', 'fw.title': 'Check the web hosts for drift' },
      createdAt: e.slot, updatedAt: e.at, member: 'default/ops-0', usage: { turns: 3, costUSD: e.costUSD },
    });
    S.transcripts.set(e.run, [{ seq: 1, time: e.slot, kind: 'user', text: 'Check the web hosts for drift from their Ansible roles.', who: 'duty:check-the-web-hosts-for-drift' }, { seq: 2, time: e.at, kind: 'assistant', text: output }]);
    S.results.set(e.run, { runId: e.run, title: 'Check the web hosts for drift', agent: 'ops', status: 'ready', summary: output, started: e.slot, changed: e.at, next: [] });
  }
  // A weekly summary of competitors: the template of the door does the same work, so its plan names this duty.
  add(
    {
      name: 'weekly-competitor-summary',
      title: 'Weekly competitor summary',
      agent: 'writer',
      when: { schedule: { repeat: 'weekly', days: ['mon'], times: ['09:00'], timeZone: 'Europe/Berlin' } },
      do: { ask: { message: 'Sum up what our competitors shipped last week, in the wiki under market/{date}.md.' } },
      limits: { budget: { maxCostUSD: 0.4 }, overlap: 'skip', catchUp: '6h' },
      notify: { failure: ['owner'], needsYou: ['owner'], result: ['owner'], resultWhen: 'always' },
    },
    [],
  );
  // The run of the restore test waits for an answer, on no bridge, so Activity shows its card.
  const waiting = D.get('nightly-restore-test').history[0];
  S.runs.set(waiting.run, {
    id: waiting.run,
    agent: 'backup',
    title: 'Restore the backup of last night',
    state: 'input-required',
    input: 'Restore last night’s backup into the scratch cluster.',
    seq: 3,
    origin: 'duty',
    principal: 'duty:nightly-restore-test',
    metadata: { 'workbench.duty': 'nightly-restore-test', 'workbench.dutySlot': waiting.slot, 'fw.batch': 'duty:nightly-restore-test', 'fw.title': 'Restore the backup of last night' },
    pending: { id: 'ap-restore', tool: 'bash', input: { command: 'restic restore latest --target /scratch' }, reason: 'rule: ask bash: restic restore*', requestedAt: waiting.at },
    createdAt: waiting.at,
    updatedAt: waiting.at,
    member: 'default/backup-0',
    usage: { turns: 2, toolCalls: 1, costUSD: 0.07 },
  });
  S.transcripts.set(waiting.run, [{ seq: 1, time: waiting.at, kind: 'user', text: 'Restore last night’s backup into the scratch cluster.', who: 'duty:nightly-restore-test' }]);
  S.results.set(waiting.run, { runId: waiting.run, title: 'Restore the backup of last night', agent: 'backup', status: 'needs-you', started: waiting.at, changed: waiting.at, next: [] });
  let allPaused = false;
  let runN = 0;

  /** view is a duty as a read answers it, with its readback, its next times, and its state. */
  const view = (d, history = false) => {
    const { history: h, state: st, ...rec } = d;
    const s = rec.when.schedule;
    const today = (h || []).filter((r) => Date.now() - Date.parse(r.at) < DAY).reduce((n, r) => n + (r.costUSD || 0), 0);
    const out = {
      ...rec,
      readback: withCheck(s ? readbackOf(s) : rec.when.webhook ? 'When another app calls.' : rec.when.event ? eventWords(rec.when.event) : '', rec),
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

  // Before the route of one duty, so the word options never reads as the name of a duty.
  on('GET', '/v1/duties/options', () => ({ secrets: SECRETS, events: EVENTS, actions: ['ask', 'post', 'open', 'manager'], looks: ['http', 'tool'] }));

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
    if (old && old.locked) refuse(409, LOCKED);
    if (old && !canChange(c, old)) refuse(403, `only an owner of ${old.agent} or an admin can change this duty`);
    const zone = zoneOf(c);
    // A duty whose message comes from the setup of the server asks its agent with no message of the person.
    const { duty, problems } = problemsOf({ ...body, name }, zone, { templated: !!(old && old.template) });
    const dry = c.url.searchParams.get('dryRun') === 'true';
    const s = duty.when && duty.when.schedule;
    const start = s && !problems.some((p) => p.startsWith('when')) ? readbackOf(s) : duty.when && duty.when.webhook ? 'When another app calls.' : duty.when && duty.when.event && !problems.some((p) => p.startsWith('when')) ? eventWords(duty.when.event) : '';
    const readback = problems.some((p) => p.startsWith('checkFirst')) ? start : withCheck(start, duty);
    if (dry) {
      const out = { duty: { ...duty, owner: old ? old.owner : c.person.subject }, readback, next: readback && s ? nextOf(s) : [], problems };
      if (c.url.searchParams.get('test') === 'true') {
        if (duty.checkFirst && !problems.some((p) => p.startsWith('checkFirst'))) out.check = checkNow(duty.checkFirst);
        else if (!duty.checkFirst) problems.push('checkFirst: The duty has no check to try.');
      }
      return out;
    }
    // new is the draft of a duty without a name, and options is a route: a dry run takes them, and a save refuses them.
    if (name === 'new' || name === 'options') problems.push('name: The names new and options are kept for the page. Pick another name.');
    if (problems.length) refuse(400, problems[0].replace(/^[\w.[\]]+: /, ''), { problems });
    if (old && body.revision !== undefined && body.revision !== old.revision) refuse(409, `the duty changed: revision ${old.revision} is newer than ${body.revision}`);
    const rec = { ...duty };
    delete rec.revision;
    const runAs = rec.runAs === 'owner' && old && old.owner !== c.person.subject ? 'duty' : rec.runAs || 'duty';
    const next = { ...(old || {}), ...rec, runAs, source: 'store', owner: old ? old.owner : c.person.subject, revision: old ? old.revision + 1 : 1, history: old ? old.history : [], state: old ? old.state : undefined };
    // A message of the person replaces the template of the setup.
    next.template = !!(old && old.template) && !(rec.do && rec.do.ask && String(rec.do.ask.message || '').trim());
    if (!next.template) delete next.template;
    if (!rec.checkFirst) delete next.checkFirst;
    D.set(name, next);
    c.status = old ? 200 : 201;
    return view(next);
  });

  on('PATCH', '/v1/duties/([^/]+)', async (c, raw) => {
    const d = find(raw);
    if (d.locked) refuse(409, LOCKED);
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
    if (d.locked) refuse(409, LOCKED);
    if (!canChange(c, d)) refuse(403, `only an owner of ${d.agent} or an admin can delete this duty`);
    D.delete(d.name);
    c.status = 204;
  });

  on('POST', '/v1/duties/([^/]+)/run', (c, raw) => {
    const d = find(raw);
    const last = d.history[0];
    if ((d.limits.overlap || 'skip') === 'skip' && last && ['running', 'queued', 'input-required'].includes(last.state)) return { skipped: 'The last run still works.' };
    const at = now();
    // A duty that posts in a bridge or opens one starts no run of an agent: the answer names an empty run, and the history says what it did.
    if (d.do.post || d.do.open) {
      const bridge = d.do.post ? S.bridges.get(d.do.post.bridge) : null;
      d.history.unshift({ at, slot: at, run: '', state: 'completed', reason: d.do.post ? 'Posted in ' + (bridge ? bridge.title : 'the bridge') + '.' : 'Opened a bridge from the playbook ' + d.do.open.playbook + '.' });
      c.status = 202;
      return { run: '' };
    }
    const id = 'duty-run-' + ++runN + '-' + Date.now().toString(36);
    const entry = { at, slot: at, run: id, state: 'running', costUSD: 0 };
    d.history.unshift(entry);
    const x = d.do || {};
    const input = (x.ask && x.ask.message) || (x.post && x.post.message) || (x.manager && x.manager.message) || (x.open && x.open.goal) || d.name;
    const title = d.name + ': ' + at.slice(0, 10);
    const run = {
      id,
      agent: d.agent,
      title,
      state: 'running',
      input,
      seq: 1,
      origin: 'duty',
      principal: 'duty:' + d.name,
      metadata: { 'workbench.duty': d.name, 'workbench.dutySlot': at, 'fw.batch': 'duty:' + d.name, 'fw.title': title },
      createdAt: at,
      updatedAt: at,
      member: 'default/' + d.agent + '-0',
    };
    S.runs.set(id, run);
    S.transcripts.set(id, [{ seq: 1, time: at, kind: 'user', text: input, who: 'duty:' + d.name }]);
    S.results.set(id, { runId: id, title, agent: d.agent, status: 'working', started: at, changed: at, next: [] });
    publish('run', run);
    // The run of the fake finishes after a few seconds, with a small cost.
    setTimeout(() => {
      Object.assign(entry, { state: 'completed', costUSD: 0.03 });
      Object.assign(run, { state: 'completed', output: 'Done.', seq: 2, updatedAt: now(), usage: { turns: 1, costUSD: 0.03 } });
      S.transcripts.get(id).push({ seq: 2, time: now(), kind: 'assistant', text: 'Done.' });
      Object.assign(S.results.get(id), { status: 'ready', changed: now() });
      publish('run', run);
    }, 4000);
    c.status = 202;
    return { run: id };
  });

  on('POST', '/v1/duties/([^/]+)/write-check', async (c, raw) => {
    const d = D.get(decodeURIComponent(raw));
    const body = await readJson(c.req);
    // For a saved duty, the agent of the duty wins. A duty that is not saved yet names its agent.
    const agent = d ? d.agent : String(body.agent || '');
    if (!agent) refuse(400, 'name the agent that writes the check: the duty is not saved yet', { problems: ['agent: Pick the agent that writes the check.'] });
    const words = String(body.words || '').trim();
    if (!words) refuse(400, 'write what the agent waits for', { problems: ['words: Write what the agent waits for.'] });
    // The agent of the fake thinks for a few seconds, and words that hold slow wait until the front gives up.
    await new Promise((r) => setTimeout(r, /slow/i.test(words) ? 8000 : 2500));
    if (/slow/i.test(words)) refuse(504, 'the agent did not answer within 120 seconds');
    const url = /(https?:\/\/\S+)/.exec(words);
    let check;
    if (url) check = { look: { http: { url: url[1] } }, items: 'items', key: 'id', wake: { when: 'new' } };
    else if (/incident|p1|p2|servicenow/i.test(words)) check = { look: { tool: 'servicenow.query_incidents', input: { query: 'priority<=2^active=true' } }, items: 'result.records', key: 'number', where: [{ field: 'priority', oneOf: [1, 2] }], wake: { when: 'new' } };
    else if (/queue/i.test(words)) {
      // The agent wrote a record, and its test found no list: the 422 carries what it tried.
      const tried = { look: { tool: 'servicenow.query_incidents', input: { query: 'active=true' } }, items: 'result.records', key: 'number', wake: { when: 'new' } };
      const why = 'the check found no list at result.records. The answer of the tool holds its list at data.items';
      refuse(422, why, { error: why, checkFirst: tried, readback: 'Call the tool servicenow.query_incidents of ' + agent + '. Take the list at result.records. Wake ' + agent + ' only for items whose number it did not see before.' });
    } else {
      const why = `${agent} has no tool that reads that. Name the address of the list, or set the check up by hand`;
      refuse(422, why, { error: why });
    }
    return { checkFirst: check, readback: (check.look.tool ? 'Call the tool ' + check.look.tool : 'Look at ' + check.look.http.url) + '. Wake ' + agent + ' only for items that it did not see before.', check: checkNow(check) };
  });

  /* ---------- notifications ---------- */

  // Each person keeps a list of channels, after section 11 of the contract
  // of the build. The fake offers every kind and one shared channel of the
  // operator. A read answers "set" or "" for url, secret, and ntfy.token. A
  // write keeps the stored value for "set", clears it for "", and replaces
  // it with any other value. alice starts with her phone and Home
  // Assistant. A test fails for a place whose topic or stored address holds
  // fail, as the stored address of Home Assistant does.
  const SERVER = 'https://ntfy.sh';
  const KINDS = ['ntfy', 'slack', 'discord', 'teams', 'webhook', 'email', 'agent', 'shared'];
  const KIND_LABELS = { ntfy: 'ntfy', slack: 'Slack', discord: 'Discord', teams: 'Teams', webhook: 'Webhook', email: 'Email', agent: 'Agent', shared: 'Shared' };
  const SHARED = [{ name: 'ops-room', kind: 'slack', label: 'Ops room' }];
  const SEND = { questions: true, failures: true, digest: false };
  const notes = new Map();
  const settingsOf = (c) => {
    const who = c.person.subject;
    if (!notes.has(who))
      notes.set(who, {
        channels:
          who === 'alice@example.com'
            ? [
                { id: 'phone', kind: 'ntfy', label: 'My phone', send: SEND, ntfy: { server: '', topic: 'alice-fw-8f3k', token: 'tk_alice' } },
                { id: 'home', kind: 'webhook', label: 'Home Assistant', send: { questions: true, failures: false, digest: true }, url: 'https://ha.example.com/api/webhook/fw-failing', secret: 'ha-signing-secret' },
              ]
            : [],
        quietHours: { from: '', to: '', timeZone: zoneOf(c) },
      });
    return notes.get(who);
  };
  const set = (v) => (v ? 'set' : '');
  const channelView = (ch) => {
    const out = { ...ch, send: { ...ch.send } };
    if (ch.url !== undefined) out.url = set(ch.url);
    if (ch.secret !== undefined) out.secret = set(ch.secret);
    if (ch.ntfy) out.ntfy = { ...ch.ntfy, token: set(ch.ntfy.token) };
    return out;
  };
  const notifyView = (n) => {
    const reaches = n.channels.some((ch) => ch.send.questions || ch.send.failures || ch.send.digest);
    return {
      channels: n.channels.map(channelView),
      quietHours: n.quietHours,
      offered: KINDS.map((kind) => ({ kind, label: KIND_LABELS[kind] })),
      shared: SHARED,
      off: !n.channels.length ? 'No place reaches you yet.' : !reaches ? 'Each of your places has every switch off.' : '',
      serverDefault: SERVER,
    };
  };
  /** privateHost reports whether an address goes to a host of a private network, which the fake never allows. */
  const privateHost = (u) => {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return h === 'localhost' || /^(10|127)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.(lan|local|internal)$/.test(h);
    } catch {
      return false;
    }
  };
  const runnable = (agent) => AGENTS.some((a) => a.name === agent && (a.role === 'owner' || a.role === 'operator'));

  /** writeOnly reads a write-only field of a write: "set" keeps the old value, "" clears it, and any other value replaces it. */
  const writeOnly = (v, old) => (v === 'set' ? old || '' : String(v || ''));

  on('GET', '/v1/notifications', (c) => notifyView(settingsOf(c)));

  on('PUT', '/v1/notifications', async (c) => {
    const old = settingsOf(c);
    const body = await readJson(c.req);
    const list = Array.isArray(body.channels) ? body.channels : [];
    const q = body.quietHours || {};
    const problems = [];
    if (list.length > 10) problems.push('channels: A person keeps at most 10 places.');
    const ids = new Set();
    const channels = list.map((x, i) => {
      const at = `channels[${i}]`;
      const was = old.channels.find((o) => x.id && o.id === x.id) || {};
      const id = x.id || String(x.label || x.kind || 'place').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
      if (ids.has(id)) problems.push(`${at}.id: Another place has the id ${id}.`);
      ids.add(id);
      const s = x.send || {};
      const ch = { id, kind: String(x.kind || ''), label: String(x.label || '').trim(), send: { questions: !!s.questions, failures: !!s.failures, digest: !!s.digest } };
      if (!KINDS.includes(ch.kind)) problems.push(`${at}.kind: This workbench does not send to ${ch.kind || 'that kind'}.`);
      if (!ch.label) problems.push(`${at}.label: Give the place a name.`);
      const url = writeOnly(x.url, was.url);
      switch (ch.kind) {
        case 'ntfy': {
          const n = x.ntfy || {};
          ch.ntfy = { server: String(n.server || ''), topic: String(n.topic || ''), token: writeOnly(n.token, was.ntfy && was.ntfy.token) };
          if (ch.ntfy.server && !/^https?:\/\/[^\s/]+/.test(ch.ntfy.server)) problems.push(`${at}.ntfy.server: The address of a server starts with https://.`);
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(ch.ntfy.topic)) problems.push(`${at}.ntfy.topic: A topic holds 1 to 64 of letters, digits, hyphens, and underscores.`);
          break;
        }
        case 'slack':
          ch.url = url;
          if (url && !/^https:\/\/hooks\.slack\.com\//.test(url)) problems.push(`${at}.url: The address of Slack starts with https://hooks.slack.com/.`);
          break;
        case 'discord':
          ch.url = url;
          if (url && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url)) problems.push(`${at}.url: The address of Discord starts with https://discord.com/api/webhooks/.`);
          break;
        case 'teams':
        case 'webhook':
          ch.url = url;
          if (ch.kind === 'webhook') ch.secret = writeOnly(x.secret, was.secret);
          if (url && !/^https:\/\//.test(url)) problems.push(`${at}.url: The address starts with https://.`);
          else if (url && privateHost(url)) problems.push(`${at}.url: The server posts to no private address that the operator did not allow.`);
          break;
        case 'email': {
          const to = String((x.email && x.email.to) || '').trim();
          ch.email = { to };
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) problems.push(`${at}.email.to: Write an email address.`);
          break;
        }
        case 'agent': {
          const a = x.agent || {};
          const budget = a.budget || {};
          ch.agent = { agent: String(a.agent || ''), how: String(a.how || '').trim(), budget };
          if (!runnable(ch.agent.agent)) problems.push(`${at}.agent.agent: You cannot run the agent ${ch.agent.agent || 'that you picked'}.`);
          if (!ch.agent.how) problems.push(`${at}.agent.how: Say how the agent should reach you.`);
          if (!(Number(budget.maxCostUSD) > 0)) problems.push(`${at}.agent.budget: A place through an agent needs the most that a message can cost.`);
          break;
        }
        case 'shared':
          ch.shared = String(x.shared || '');
          if (!SHARED.some((s) => s.name === ch.shared)) problems.push(`${at}.shared: There is no shared channel ${ch.shared || 'of that name'}.`);
          break;
      }
      if (['slack', 'discord', 'teams', 'webhook'].includes(ch.kind) && !url) problems.push(`${at}.url: Paste the address.`);
      return ch;
    });
    if ((q.from || q.to) && (hhmm(q.from) < 0 || hhmm(q.to) < 0)) problems.push('quietHours.from: Quiet hours need two times of the day.');
    if (q.timeZone && !zoneOk(q.timeZone)) problems.push('quietHours.timeZone: ' + q.timeZone + ' is not a time zone.');
    if (problems.length) refuse(400, problems[0].replace(/^[\w.[\]]+: /, ''), { problems });
    const next = { channels, quietHours: { from: String(q.from || ''), to: String(q.to || ''), timeZone: String(q.timeZone || zoneOf(c)) } };
    notes.set(c.person.subject, next);
    return notifyView(next);
  });

  on('POST', '/v1/notifications/test', async (c) => {
    const n = settingsOf(c);
    const body = await readJson(c.req).catch(() => ({}));
    const id = body && body.channel ? String(body.channel) : '';
    if (id && !n.channels.some((ch) => ch.id === id)) refuse(400, 'there is no place ' + id, { error: 'there is no place ' + id });
    // The quiet hours hold no test.
    const results = n.channels
      .filter((ch) => !id || ch.id === id)
      .map((ch) => {
        const where = (ch.ntfy && ch.ntfy.topic) || ch.url || '';
        if (/fail/i.test(where)) return { channel: ch.id, sent: false, error: ch.kind === 'ntfy' ? 'the ntfy server answered 401 unauthorized' : 'the address answered 404 not found' };
        return { channel: ch.id, sent: true, error: '' };
      });
    return { results };
  });

  /* ---------- playbooks ---------- */

  const books = ctx.playbooks;
  books.set('weekly-patching', {
    name: 'weekly-patching',
    goal: 'Patch the lab hosts, reboot the ones that need it, and report what changed.',
    placement: 'queue',
    seats: [
      { handle: 'patcher', agent: 'migrator', task: 'Patch each host and reboot it when the kernel changed.' },
      { handle: 'checker', agent: 'tester', task: 'Check that each host answers after the patch.' },
    ],
    caps: { maxMessages: 200, maxTurns: 400 },
    delegation: { approve: true, budget: false, members: false, report: true },
    revision: 3,
    owner: 'alice@example.com',
    updatedAt: ago(3 * 24 * 60),
  });
  const brief = ({ caps: _c, delegation: _d, ...p }) => p;
  const book = (raw) => {
    const name = decodeURIComponent(raw);
    const p = books.get(name);
    if (!p) refuse(404, `no playbook ${name}`);
    return p;
  };

  on('GET', '/v1/playbooks', () => ({ playbooks: [...books.values()].map(brief) }));
  on('GET', '/v1/playbooks/([^/]+)', (c, raw) => book(raw));

  on('PUT', '/v1/playbooks/([^/]+)', async (c, raw) => {
    const name = decodeURIComponent(raw);
    if (!NAME.test(name)) refuse(400, `a playbook name holds 1 to 63 of a-z, 0-9, - and _, not "${name}"`);
    const body = await readJson(c.req);
    const old = books.get(name);
    if (old && body.revision !== undefined && body.revision !== old.revision) refuse(409, `the playbook changed: revision ${old.revision} is newer than ${body.revision}`);
    // As the front, the fake refuses a field that a playbook does not have, such as members.
    for (const k of Object.keys(body)) if (!['goal', 'placement', 'seats', 'caps', 'delegation', 'revision'].includes(k)) refuse(400, `json: unknown field "${k}"`);
    const seats = Array.isArray(body.seats) ? body.seats : [];
    const problems = [];
    if (!String(body.goal || '').trim()) problems.push('goal: Write the goal of the playbook.');
    if (!seats.length) problems.push('seats: A playbook needs at least one seat.');
    seats.forEach((m, i) => {
      if (!AGENTS.some((a) => a.name === m.agent)) problems.push(`seats[${i}].agent: There is no agent ${m.agent || ''}.`);
    });
    if (problems.length) refuse(400, problems[0].replace(/^[\w.[\]]+: /, ''), { problems });
    const p = {
      name,
      goal: String(body.goal).trim(),
      placement: body.placement === 'spawn' ? 'spawn' : 'queue',
      seats: seats.map((m) => ({ handle: m.handle, agent: m.agent, task: m.task || '' })),
      caps: body.caps || {},
      delegation: { approve: false, budget: false, members: false, report: true, ...(body.delegation || {}) },
      revision: old ? old.revision + 1 : 1,
      owner: old ? old.owner : c.person.subject,
      updatedAt: now(),
    };
    books.set(name, p);
    c.status = old ? 200 : 201;
    return p;
  });

  on('DELETE', '/v1/playbooks/([^/]+)', (c, raw) => {
    const p = book(raw);
    books.delete(p.name);
    c.status = 204;
  });

  /* ---------- the inbox ---------- */

  // What needs the person from the duties: a paused duty, a failed last run, and a run of a duty that waits for an answer.
  on('GET', '/v1/inbox', () => {
    const items = [];
    for (const d of D.values()) {
      const last = d.history[0];
      if (d.paused) items.push({ kind: 'paused', run: '', approval: '', duty: d.name, agent: d.agent, bridge: '', text: (d.state && d.state.pausedReason) || 'Someone paused this duty.', since: last ? last.at : now() });
      else if (last && last.state === 'failed') items.push({ kind: 'failure', run: last.run || '', approval: '', duty: d.name, agent: d.agent, bridge: '', text: last.reason || 'The run failed.', since: last.at });
      const run = last && last.run ? S.runs.get(last.run) : null;
      if (run && run.state === 'input-required' && run.pending) items.push({ kind: run.pending.schema ? 'question' : 'approval', run: run.id, approval: run.pending.id, duty: d.name, agent: d.agent, bridge: '', text: d.agent + ' waits for your answer.', since: last.at });
    }
    // A result to check: a run whose owner asked to check each result, until a person reacts. A duty that tells only of
    // what it finds gives the people of notify.result a result that found something.
    for (const r of S.runs.values()) {
      const duty = (r.metadata || {})['workbench.duty'] || '';
      const d = duty ? D.get(duty) : null;
      if (!inReview(r)) continue;
      const found = (r.metadata || {})['workbench.review'] !== '1' && !!foundLine(r);
      const title = r.title || (d && d.title) || 'A result';
      items.push({ kind: 'result', run: r.id, approval: '', duty, agent: r.agent, bridge: '', text: found ? title + ': it found something.' : title + ' is ready to check.', since: r.updatedAt });
    }
    return { items };
  });
}
