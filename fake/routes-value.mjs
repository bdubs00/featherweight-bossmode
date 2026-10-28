// The fake routes of the Results place: what the work of the agents gave
// and took over a window, as the package value of the workbench answers it.
//
//   GET /v1/value?days=7|30|90    the answer of value.Fold: days, since, until, sentence, work, checks,
//                                 people, lead, spend, estimated, periods, lines, partial, unknown.
//                                 400 for another number of days
//   PUT /v1/value/estimates       {"line", "minutes"}: the line with its estimate. 0 minutes removes it.
//                                 404 for a line that the person does not see, 403 for a person who
//                                 does not own its agent, 400 for minutes past 2400
//
// The data: 90 days of pieces of work from a seeded generator, so the
// three windows agree. A release-notes duty that people mostly accept, a
// nightly restore test that waits hours for an approval, the migrations of
// the migrator with pushes that a person allows and some results sent
// back, quick reviews that nobody checks, a helpdesk duty that sorts many
// tickets and that no person ever checks, and a tester whose runs fail
// more often. The manager and the quick chat cost coordination. Two runs
// of the last month have tokens without a price, so the spend is a lower
// bound. Bob set an estimate for the release notes, and alice for the
// migrations. FAKE_VALUE_PARTIAL=1 leaves the facts out of the oldest
// pieces, as an archive that a server before the value wrote.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const PARTIAL = process.env.FAKE_VALUE_PARTIAL === '1';

/** rng is a small seeded generator, so every start of the fake has the same data. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const LINES = [
  { key: 'duty:daily-release-notes', kind: 'duty', name: 'daily-release-notes', agent: 'scribe', perDay: 1, weekdays: true, usd: [0.02, 0.05], accept: 0.7, back: 0.1, acts: [0, 1], lead: [4, 9], wait: 0, fail: 0.04 },
  { key: 'duty:nightly-restore-test', kind: 'duty', name: 'nightly-restore-test', agent: 'backup', perDay: 1, usd: [0.18, 0.24], accept: 0.15, back: 0, acts: [1, 1], lead: [12, 20], wait: [90, 330], fail: 0.05 },
  { key: 'agent:migrator', kind: 'agent', name: 'migrator', agent: 'migrator', perDay: 2, usd: [0.09, 0.42], accept: 0.4, back: 0.12, acts: [1, 3], lead: [18, 70], wait: [5, 60], fail: 0.06, stop: 0.03 },
  { key: 'agent:reviewer', kind: 'agent', name: 'reviewer', agent: 'reviewer', perDay: 2.5, usd: [0.02, 0.06], accept: 0.05, back: 0.02, acts: [0, 0], lead: [2, 6], wait: 0, fail: 0.02 },
  { key: 'duty:helpdesk-tickets', kind: 'duty', name: 'helpdesk-tickets', agent: 'triage', perDay: 6, usd: [0.002, 0.006], accept: 0, back: 0, acts: [0, 0], lead: [0.3, 1.2], wait: 0, fail: 0.01 },
  { key: 'agent:tester', kind: 'agent', name: 'tester', agent: 'tester', perDay: 0.8, usd: [0.04, 0.1], accept: 0.1, back: 0.05, acts: [0, 1], lead: [6, 15], wait: [2, 10], fail: 0.2 },
];
const COORDINATION = [
  { agent: 'manager', perDay: 1.5, usd: [0.01, 0.04] },
  { agent: 'chat', perDay: 1, usd: [0.005, 0.02] },
];

/** pieces makes 90 days of pieces of work before the time t0, newest last. */
function generate(t0) {
  const r = rng(20261027);
  const pick = ([a, b]) => a + (b - a) * r();
  const out = [];
  const coord = [];
  for (let d = 89; d >= 0; d--) {
    const day = t0 - d * DAY;
    const wd = new Date(day).getUTCDay();
    for (const ln of LINES) {
      if (ln.weekdays && (wd === 0 || wd === 6)) continue;
      let n = Math.floor(ln.perDay) + (r() < ln.perDay % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const created = day - Math.floor(r() * DAY);
        const x = r();
        const state = x < ln.fail ? 'failed' : x < ln.fail + (ln.stop || 0) ? 'canceled' : 'completed';
        const acts = Math.round(pick(ln.acts));
        const waitMin = ln.wait && acts > 0 ? pick(ln.wait) : 0;
        const leadMin = pick(ln.lead) + waitMin;
        const v = r();
        const verdict = state !== 'completed' ? '' : v < ln.accept ? 'accepted' : v < ln.accept + ln.back ? 'rejected' : '';
        out.push({
          line: ln, created, state, acts, verdict,
          rework: verdict === 'rejected' && r() < 0.6 ? 1 : 0,
          waitMs: waitMin * MIN, leadMs: state === 'completed' ? leadMin * MIN : 0,
          usd: state === 'completed' ? pick(ln.usd) : pick(ln.usd) * 0.6,
          unpriced: false, facts: true,
        });
      }
    }
    for (const c of COORDINATION) {
      const n = Math.floor(c.perDay) + (r() < c.perDay % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) coord.push({ created: day - Math.floor(r() * DAY), usd: pick(c.usd) });
    }
  }
  // Two runs of the last month ran on a model without a price.
  const recent = out.filter((p) => p.line.agent === 'migrator' && p.created > t0 - 20 * DAY);
  for (const p of recent.slice(0, 2)) Object.assign(p, { unpriced: true, usd: 0 });
  // The newest piece of the restore test waits for its approval now.
  const wait = out.filter((p) => p.line.name === 'nightly-restore-test').pop();
  if (wait) Object.assign(wait, { state: 'input-required', verdict: '', leadMs: 0, waitMs: 0, asked: t0 - 5 * HOUR });
  if (PARTIAL) for (const p of out) if (p.created < t0 - 60 * DAY) Object.assign(p, { facts: false, acts: 0, verdict: '', leadMs: 0, waitMs: 0 });
  return { pieces: out, coord };
}

const round = (f, n) => Math.round(f * 10 ** n) / 10 ** n;
const median = (v) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : Math.floor((s[n / 2 - 1] + s[n / 2]) / 2);
};

function duration(s) {
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (Math.floor((s % 3600) / 60) === 0) return Math.floor(s / 3600) + ' h';
  return Math.floor(s / 3600) + ' h ' + Math.floor((s % 3600) / 60) + ' min';
}
const plural = (n, one, many) => (n === 1 ? '1 ' + one : n + ' ' + many);

/** fold folds the pieces of a window as value.Fold does. */
function fold(data, days, nowMs, estimates) {
  const since = nowMs - days * DAY;
  const step = days <= 7 ? DAY : 7 * DAY;
  const periods = [];
  for (let end = nowMs; end > since; end -= step) periods.unshift({ start: Math.max(end - step, since), end, done: 0, accepted: 0, sentBack: 0, unchecked: 0, failed: 0, usd: 0 });
  const ans = {
    days, since: new Date(since).toISOString(), until: new Date(nowMs).toISOString(), sentence: '',
    work: { pieces: 0, done: 0, failed: 0, stopped: 0, open: 0 }, checks: { accepted: 0, sentBack: 0, unchecked: 0 },
    people: { actions: 0, noPerson: 0, reworked: 0, waitSeconds: 0, waitingNow: 0, handled: 0 },
    lead: { measured: 0, medianSeconds: 0, waitShare: 0 },
    spend: { usd: 0, perDone: 0, failedUSD: 0, coordinationUSD: 0, unpriced: 0, atLeast: false },
    periods: [], lines: [], partial: false,
  };
  const lines = new Map();
  const leads = [];
  let leadSum = 0;
  let waitSum = 0;
  for (const p of data.pieces) {
    if (p.created < since) continue;
    const ln = p.line;
    let l = lines.get(ln.key);
    if (!l) {
      l = { key: ln.key, kind: ln.kind, name: ln.name, agent: ln.agent, work: { pieces: 0, done: 0, failed: 0, stopped: 0, open: 0 }, checks: { accepted: 0, sentBack: 0, unchecked: 0 }, actions: 0, noPerson: 0, medianLeadSeconds: 0, usd: 0, perDone: 0, unpriced: 0, leads: [] };
      lines.set(ln.key, l);
    }
    const per = periods.find((x) => p.created >= x.start && p.created < x.end);
    ans.work.pieces++;
    l.work.pieces++;
    ans.spend.usd += p.usd;
    l.usd += p.usd;
    if (per) per.usd += p.usd;
    if (p.unpriced) {
      ans.spend.unpriced++;
      l.unpriced++;
    }
    if (!p.facts) ans.unknown = (ans.unknown || 0) + 1;
    ans.people.actions += p.acts;
    l.actions += p.acts;
    let wait = Math.floor(p.waitMs / 1000);
    if (p.state === 'input-required' && p.asked) {
      wait += Math.floor((nowMs - p.asked) / 1000);
      ans.people.waitingNow++;
    }
    ans.people.waitSeconds += wait;
    if (p.state === 'completed') {
      ans.work.done++;
      l.work.done++;
      if (per) per.done++;
      const k = p.verdict === 'accepted' ? 'accepted' : p.verdict === 'rejected' ? 'sentBack' : 'unchecked';
      ans.checks[k]++;
      l.checks[k]++;
      if (per) per[k]++;
      if (p.facts && p.acts === 0) {
        ans.people.noPerson++;
        l.noPerson++;
      }
      if (p.rework) ans.people.reworked++;
      if (p.facts && p.leadMs > 0) {
        leads.push(p.leadMs);
        l.leads.push(p.leadMs);
        leadSum += p.leadMs;
        waitSum += Math.min(p.waitMs, p.leadMs);
      }
    } else if (p.state === 'failed') {
      ans.work.failed++;
      l.work.failed++;
      ans.spend.failedUSD += p.usd;
      if (per) per.failed++;
    } else if (p.state === 'canceled') {
      ans.work.stopped++;
      l.work.stopped++;
      ans.spend.failedUSD += p.usd;
    } else {
      ans.work.open++;
      l.work.open++;
    }
  }
  for (const c of data.coord) {
    if (c.created < since) continue;
    ans.spend.usd += c.usd;
    ans.spend.coordinationUSD += c.usd;
  }
  ans.partial = (ans.unknown || 0) > 0;
  ans.lead = { measured: leads.length, medianSeconds: Math.floor(median(leads) / 1000), waitShare: leadSum ? round(waitSum / leadSum, 3) : 0 };
  ans.spend.atLeast = ans.spend.unpriced > 0;
  ans.spend.perDone = ans.work.done ? round(ans.spend.usd / ans.work.done, 4) : 0;
  for (const k of ['usd', 'failedUSD', 'coordinationUSD']) ans.spend[k] = round(ans.spend[k], 4);
  ans.periods = periods.map((x) => ({ ...x, start: new Date(x.start).toISOString(), end: new Date(x.end).toISOString(), usd: round(x.usd, 4) }));
  let est = null;
  for (const l of lines.values()) {
    l.medianLeadSeconds = Math.floor(median(l.leads) / 1000);
    delete l.leads;
    l.perDone = l.work.done ? round(l.usd / l.work.done, 4) : 0;
    l.usd = round(l.usd, 4);
    const e = estimates.get(l.key);
    if (e && e.minutes > 0) {
      l.estimate = e;
      const n = l.work.done - l.checks.sentBack;
      l.estimatedMinutes = e.minutes * n;
      est = est || { minutes: 0, lines: 0, pieces: 0 };
      est.minutes += l.estimatedMinutes;
      est.lines++;
      est.pieces += n;
    }
    ans.lines.push(l);
  }
  if (est) ans.estimated = est;
  ans.lines.sort((a, b) => b.work.done - a.work.done || b.work.pieces - a.work.pieces || (a.key < b.key ? -1 : 1));
  ans.sentence = sentence(ans);
  return ans;
}

function sentence(a) {
  let s = `In the last ${a.days} days, `;
  if (!a.work.pieces) return s + 'the agents finished no work that you can view.';
  s += `the agents finished ${plural(a.work.done, 'piece', 'pieces')} of work`;
  if (a.work.failed + a.work.stopped) s += `, and ${a.work.failed + a.work.stopped} failed or stopped`;
  s += '.';
  if (a.work.done) {
    s += ` People accepted ${a.checks.accepted} and sent back ${a.checks.sentBack}; ${a.checks.unchecked} ${a.checks.unchecked === 1 ? 'is' : 'are'} unchecked.`;
    s += ` ${a.people.noPerson} of the ${a.work.done} finished without an action of a person.`;
  }
  if (a.people.waitSeconds) s += ` Work waited ${duration(a.people.waitSeconds)} for people.`;
  s += ` The work cost ${a.spend.atLeast ? 'at least ' : ''}$${a.spend.usd.toFixed(2)}`;
  if (a.work.done) s += `, $${a.spend.perDone.toFixed(2)} for each finished piece`;
  s += '.';
  if (a.spend.unpriced) s += ` ${plural(a.spend.unpriced, 'run has', 'runs have')} tokens without a price.`;
  if (a.estimated) s += ` At the estimates of people, the finished work of ${plural(a.estimated.lines, 'line', 'lines')} would take a person ${duration(a.estimated.minutes * 60)}.`;
  if (a.partial) s += ` ${plural(a.unknown, 'piece has', 'pieces have')} no record of the actions of people.`;
  return s;
}

export function register({ on, refuse, readJson, AGENTS }) {
  // The time of the data: the start of the fake, on a whole minute.
  const t0 = Math.floor(Date.now() / MIN) * MIN;
  const data = generate(t0);
  const estimates = new Map([
    ['duty:daily-release-notes', { minutes: 25, by: 'bob@example.com', at: new Date(t0 - 6 * DAY).toISOString() }],
    ['agent:migrator', { minutes: 90, by: 'alice@example.com', at: new Date(t0 - 12 * DAY).toISOString() }],
  ]);
  const roleOf = (agent) => (AGENTS.find((a) => a.name === agent) || { role: '' }).role;

  on('GET', '/v1/value', (c) => {
    const raw = c.url.searchParams.get('days');
    const days = raw === null || raw === '' ? 30 : Number(raw);
    if (![7, 30, 90].includes(days)) refuse(400, 'days is 7, 30, or 90');
    return fold(data, days, Date.now(), estimates);
  });

  on('PUT', '/v1/value/estimates', async (c) => {
    const body = await readJson(c.req);
    const line = String((body && body.line) || '').trim();
    const minutes = Number(body && body.minutes);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 2400) refuse(400, 'minutes is from 0 to 2400');
    const all = fold(data, 90, Date.now(), estimates);
    const l = all.lines.find((x) => x.key === line);
    if (!l) refuse(404, `no line of work "${line}" that you can view in the last 90 days`);
    if (roleOf(l.agent) !== 'owner') refuse(403, `you do not own the agent ${l.agent}`);
    if (minutes === 0) estimates.delete(line);
    else estimates.set(line, { minutes, by: c.person.subject, at: new Date().toISOString() });
    return fold(data, 90, Date.now(), estimates).lines.find((x) => x.key === line);
  });
}
