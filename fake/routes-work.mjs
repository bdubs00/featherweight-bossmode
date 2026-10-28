// The fake route of the board of the work, after the package work of the
// workbench: one card per piece of work, from the request to its end.
//
//   GET /v1/work?days=7&all=false   {"sentence", "lanes": [{"stage", "count", "yours", "oldest"}], "cards": [<card>], "days"}
//
// A card is {"id", "kind", "title", "from": {"kind", "name", "via"}, "stage",
// "next", "reason", "opened", "since", "ended", "agents", "parts", "links",
// "costUSD", "lost", "verdict"}. The stages, in the order of the flow:
// waiting, working, needs-you, stopped, review, done. A run is in review
// only when its owner asked to check each result: the metadata
// workbench.review is 1, or its duty has review. It leaves review on the
// first reaction. A done card carries its verdict: accepted (a thumb up or
// a heart), checked (the done check of the agent passed, stop checked),
// sent-back (a thumb down), or unchecked. The fake builds the cards from
// its bridges, its runs, and the history of its duties with the rules of
// the workbench, in short: a bridge is one card, a start of a duty is one
// card, the items of a batch are one card, and a conversation is one card.
// A run that only the archive holds and that did not end is stopped and
// lost. A card that did not end stays however old it is.

import { nextOf } from './routes-e.mjs';

const DAY = 24 * 60 * 60 * 1000;
const STAGES = ['waiting', 'working', 'needs-you', 'stopped', 'review', 'done'];
const WEIGHT = { 'needs-you': 6, working: 5, waiting: 4, stopped: 3, review: 2, done: 1 };
const LANE = {
  waiting: ['waits for a worker', 'wait for a worker'],
  working: ['is in work', 'are in work'],
  'needs-you': ['needs a person', 'need a person'],
  stopped: ['stopped', 'stopped'],
  review: ['has a result to check', 'have a result to check'],
  done: ['is done', 'are done'],
};

const plural = (n, one, many) => (n === 1 ? '1 ' + one : n + ' ' + many);
const ms = (t) => (t ? Date.parse(t) : 0);

function span(d) {
  if (d < 60_000) return 'less than a minute';
  if (d < 3_600_000) return plural(Math.floor(d / 60_000), 'minute', 'minutes');
  if (d < 2 * DAY) return plural(Math.floor(d / 3_600_000), 'hour', 'hours');
  return plural(Math.floor(d / DAY), 'day', 'days');
}

/** inReview reports whether a run waits for its owner to check its result: it asked for a check, ended well, and has no reaction. */
export function inReview(r) {
  const md = r.metadata || {};
  const re = r.reactions || {};
  return r.state === 'completed' && md['workbench.review'] === '1' && !(re.up > 0 || re.down > 0 || re.heart > 0);
}

/** verdictOf is the verdict of a run that ended well: a person first, then the done check of the agent. */
function verdictOf(r) {
  const re = r.reactions || {};
  if (re.down > 0) return 'sent-back';
  if (re.up > 0 || re.heart > 0) return 'accepted';
  if (r.stop === 'checked') return 'checked';
  return 'unchecked';
}

/** runPart is the stage of one run, as the workbench words it. */
function runPart(r) {
  const p = { run: r.id, since: r.updatedAt, approval: '', lost: false };
  const open = !['completed', 'failed', 'canceled'].includes(r.state);
  if (r.archived && open) return { ...p, stage: 'stopped', lost: true, reason: 'Its worker was replaced before it ended, so it cannot go on.' };
  switch (r.state) {
    case 'input-required': {
      const a = r.pending || {};
      const reason = a.schema ? 'Asks: ' + (a.reason || 'a question') : a.tool ? 'Asks to run ' + a.tool + '.' : 'Waits for you.';
      return { ...p, stage: 'needs-you', reason, approval: a.id || '', since: a.requestedAt || r.updatedAt };
    }
    case 'queued':
      return { ...p, stage: 'waiting', reason: 'Waits for a worker.', since: r.createdAt };
    case 'running':
    case 'suspended':
      return { ...p, stage: 'working', reason: r.activity && r.activity.tool ? 'Runs ' + r.activity.tool + '.' : 'Works.', since: r.createdAt };
    case 'completed': {
      if (inReview(r)) return { ...p, stage: 'review', reason: 'A result to check.' };
      const verdict = verdictOf(r);
      const reason = { accepted: 'Accepted.', checked: 'Its done check passed.', 'sent-back': 'Sent back.', unchecked: 'Answered.' }[verdict];
      return { ...p, stage: 'done', reason, verdict };
    }
    case 'failed':
      return { ...p, stage: 'stopped', reason: r.error ? 'Failed: ' + String(r.error).slice(0, 200) : 'Failed.' };
    case 'canceled':
      return { ...p, stage: 'done', reason: 'Canceled.' };
  }
  return { ...p, stage: 'working', reason: 'Works.' };
}

function partsOf(parts) {
  const out = { waiting: 0, working: 0, needsYou: 0, stopped: 0, review: 0, done: 0, total: 0 };
  for (const p of parts) {
    out.total++;
    out[p.stage === 'needs-you' ? 'needsYou' : p.stage]++;
  }
  return out;
}

function partWords(c) {
  const w = [
    [c.needsYou, 'need you'],
    [c.waiting, 'waiting'],
    [c.working, 'working'],
    [c.stopped, 'stopped'],
    [c.review, 'to check'],
    [c.done, 'done'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, s]) => n + ' ' + s);
  return w.length ? w.join(', ') + '.' : '';
}

/** settle gives a card its stage from its parts: the part that needs a person, else the part that moves. */
function settle(card, parts, me) {
  let top = null;
  for (const p of parts) {
    if (p.quiet) continue;
    if (p.lost) card.lost = true;
    if (!top || WEIGHT[p.stage] > WEIGHT[top.stage]) top = p;
    else if (p.stage === top.stage && ms(p.since) < ms(top.since) && p.stage !== 'done' && p.stage !== 'review') top = p;
  }
  card.parts = partsOf(parts);
  card.stage = top.stage;
  card.reason = top.reason;
  card.since = top.since;
  if (card.kind === 'bridge' && card.stage === 'review') card.reason = 'The seats ended their turns.';
  if ((card.kind === 'job' && card.stage !== 'needs-you') || (card.kind === 'bridge' && card.parts.total > 1 && (card.stage === 'working' || card.stage === 'waiting'))) {
    card.reason = partWords(card.parts) || card.reason;
  }
  if (top.run && (top.stage === 'needs-you' || top.stage === 'stopped')) card.links.run = top.run;
  card.links.approval = top.stage === 'needs-you' ? top.approval || '' : '';
  card.ended = card.stage === 'done' ? card.since : null;
  if (card.stage === 'done') card.verdict = top.verdict || 'unchecked';
  card.next = { waiting: 'worker', working: 'agent', done: '' }[card.stage];
  if (card.next === undefined) card.next = card.managerDecides ? 'manager' : card.mine ? 'you' : 'person';
  if (card.stage !== 'needs-you') delete card.managerDecides;
  return card;
}

export function board(S, me, { days = 7, all = false } = {}) {
  const now = Date.now();
  const cards = [];
  const taken = new Set();
  const blank = (id, kind, title, from, opened) => ({ id, kind, title, from, stage: '', next: '', reason: '', opened, since: opened, ended: null, agents: [], parts: {}, links: { runs: [] }, costUSD: 0, lost: false, mine: false });

  // A bridge is one card, from its seats.
  for (const b of S.bridges.values()) {
    const ch = S.channels.get(b.id) || [];
    const last = ch.length ? ch[ch.length - 1].at : b.createdAt;
    const card = blank('bridge:' + b.id, 'bridge', b.title, { kind: 'person', name: b.operatorName || b.operator, via: 'bridge' }, b.createdAt);
    card.links.bridge = b.id;
    card.mine = b.operator === me;
    const parts = [];
    for (const m of b.members) {
      card.agents.push(m.agent);
      for (const id of m.runs) {
        taken.add(id);
        card.links.runs.push(id);
        const r = S.runs.get(id);
        if (r && r.usage) card.costUSD += r.usage.costUSD || 0;
      }
      const run = m.runs.length ? S.runs.get(m.runs[m.runs.length - 1]) : null;
      const p = { run: run ? run.id : '', since: run ? run.updatedAt : last, approval: '' };
      if (b.state === 'closed') continue;
      switch (m.presence) {
        case 'needs-you': {
          const pend = run && run.pending;
          const ask = pend && pend.schema;
          parts.push({ ...p, stage: 'needs-you', approval: pend ? pend.id : '', since: (pend && pend.requestedAt) || p.since, reason: ask ? m.handle + ' asks: ' + pend.reason : m.handle + ' waits for a decision.' });
          break;
        }
        case 'working':
          parts.push({ ...p, stage: 'working', reason: m.handle + ' works.' });
          break;
        case 'waiting':
          parts.push({ ...p, stage: 'waiting', reason: m.handle + ' waits for a worker.' });
          break;
        case 'error':
          parts.push({ ...p, stage: 'stopped', reason: m.gone ? m.handle + ' lost its worker before it ended.' : m.handle + ' stopped with an error.', lost: !!m.gone });
          break;
        case 'limit':
          parts.push({ ...p, stage: 'stopped', reason: m.handle + ' stopped at a limit.' });
          break;
        case 'not-started':
          parts.push({ ...p, stage: 'stopped', reason: m.handle + ' never started.' });
          break;
        case 'fired':
          break;
        default:
          parts.push({ ...p, stage: 'review', reason: 'The seats ended their turns.', since: last });
      }
    }
    if (b.state === 'closed') parts.push({ stage: 'done', reason: 'Closed.', since: b.closedAt || last, verdict: 'unchecked' });
    if (!parts.length) parts.push({ stage: 'stopped', reason: 'No seat.', since: last });
    card.agents = [...new Set(card.agents)].sort();
    cards.push(settle(card, parts, me));
  }

  // A start of a duty is one card. A start that found no work is none.
  for (const d of (S.duties || new Map()).values()) {
    for (const e of d.history || []) {
      if (e.state === 'completed' && !e.run) continue;
      if (now - ms(e.at) > days * DAY && ['completed', 'failed', 'canceled'].includes(e.state)) continue;
      const card = blank('duty:' + d.name + '@' + e.slot, 'duty', d.title || d.name, { kind: 'duty', name: d.name, via: e.start || 'schedule' }, e.slot);
      card.links.duty = d.name;
      card.agents = [d.agent];
      card.costUSD = e.costUSD || 0;
      card.mine = d.owner === me || (d.notify && (d.notify.failure || []).includes(me));
      const r = e.run ? S.runs.get(e.run) : null;
      if (e.run) {
        taken.add(e.run);
        card.links.run = e.run;
        card.links.runs.push(e.run);
      }
      if (r) card.title = r.title || card.title;
      let p;
      if (r && e.state !== 'failed') p = runPart(r);
      else if (e.state === 'retrying') p = { stage: 'waiting', reason: 'Goes again soon.', since: e.at };
      else if (e.state === 'failed') p = { stage: 'stopped', reason: e.reason || 'Stopped.', since: e.at, run: e.run };
      else if (e.state === 'input-required') p = { stage: 'needs-you', reason: 'Waits for you.', since: e.at, run: e.run };
      else if (e.state === 'completed' && !e.verdict && d.review) p = { stage: 'review', reason: 'A result to check.', since: e.at, run: e.run };
      else if (e.state === 'completed') p = { stage: 'done', reason: { accepted: 'Accepted.', checked: 'Its done check passed.', 'sent-back': 'Sent back.' }[e.verdict] || 'Done.', since: e.at, run: e.run, verdict: e.verdict || 'unchecked' };
      else p = { stage: 'working', reason: 'Works.', since: e.at, run: e.run };
      card.managerDecides = !!(d.whileAway && d.whileAway.decider === 'manager' && r && r.pending && !r.pending.schema);
      cards.push(settle(card, [p], me));
    }
  }

  // The start that comes next of a duty of the person is one card in Coming up, unless a start is open already.
  for (const d of (S.duties || new Map()).values()) {
    if (d.paused || d.owner !== me) continue;
    const s = d.when && d.when.schedule;
    const open = (d.history || []).some((e) => ['retrying', 'queued', 'running', 'input-required'].includes(e.state));
    if (!s || open) continue;
    const next = nextOf(s, 1)[0];
    if (!next) continue;
    const card = blank('duty:' + d.name + '@next', 'duty', d.title || d.name, { kind: 'duty', name: d.name, via: 'schedule' }, next);
    card.links.duty = d.name;
    card.agents = [d.agent];
    card.mine = true;
    cards.push(settle(card, [{ stage: 'waiting', reason: 'Starts on its schedule.', since: next }], me));
  }

  // The other runs: a batch is one card, a conversation is one card.
  const groups = new Map();
  const runs = [...S.runs.values()].filter((r) => !taken.has(r.id) && !(r.metadata || {})['workbench.internal'] && !(r.metadata || {})['workbench.duty']);
  runs.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  const root = (r, depth = 0) => {
    const md = r.metadata || {};
    const up = r.parent || md['workbench.continues'] || md['fw.forkOf'];
    if (up && depth < 32 && S.runs.has(up)) return root(S.runs.get(up), depth + 1);
    const batch = md['fw.batch'];
    if (batch && !batch.startsWith('bridge:') && !r.parent) return 'job:' + r.principal + '/' + batch;
    return 'run:' + r.id;
  };
  for (const r of runs) {
    const id = root(r);
    let g = groups.get(id);
    if (!g) {
      const md = r.metadata || {};
      const job = id.startsWith('job:');
      g = { card: blank(id, job ? 'job' : 'conversation', job ? md['fw.batch'] : r.title || r.agent, { kind: 'person', name: r.principal, via: job ? 'queue' : r.origin === 'mcp' ? 'mcp' : 'page' }, r.createdAt), parts: [] };
      if (job) g.card.links.batch = md['fw.batch'];
      groups.set(id, g);
    }
    const c = g.card;
    c.agents = [...new Set([...c.agents, r.agent])].sort();
    c.links.runs.unshift(r.id);
    if (!r.parent) c.links.run = r.id;
    if (r.usage) c.costUSD += r.usage.costUSD || 0;
    if (r.principal === me) c.mine = true;
    const p = runPart(r);
    if (c.kind === 'conversation') {
      if (!r.parent) for (const q of g.parts) q.quiet = true;
      else if (['stopped', 'review', 'done'].includes(p.stage)) p.quiet = true;
    }
    g.parts.push(p);
  }
  for (const g of groups.values()) cards.push(settle(g.card, g.parts, me));

  // The board keeps the cards of the person, a card that did not end however old, and a card that ended in the window.
  // A card in review waits for a person, so it stays however old it is.
  const shown = cards.filter((c) => (all || c.mine) && !(c.stage === 'done' && now - ms(c.since) > days * DAY));
  const rank = Object.fromEntries(STAGES.map((s, i) => [s, i]));
  shown.sort((a, b) => rank[a.stage] - rank[b.stage] || (a.stage === 'done' ? ms(b.since) - ms(a.since) : ms(a.since) - ms(b.since)));
  const lanes = STAGES.map((stage) => {
    const of = shown.filter((c) => c.stage === stage);
    const oldest = of.reduce((o, c) => (!o || ms(c.since) < ms(o) ? c.since : o), '');
    return { stage, count: of.length, yours: of.filter((c) => c.next === 'you').length, ...(oldest ? { oldest } : {}) };
  });
  for (const c of shown) {
    delete c.mine;
    c.links.runs = c.links.runs.slice(0, 20);
  }
  return { sentence: sentence(lanes, shown.length, days, now), lanes, cards: shown, days };
}

function sentence(lanes, n, days, now) {
  if (!n) return 'No work in the last ' + plural(days, 'day', 'days') + '.';
  const open = lanes.filter((l) => l.stage !== 'done').reduce((s, l) => s + l.count, 0);
  const out = [plural(open, 'task is open', 'tasks are open') + '.'];
  for (const l of lanes) {
    if (!l.count || l.stage === 'done') continue;
    let s = l.count + ' ' + LANE[l.stage][l.count === 1 ? 0 : 1];
    if (l.stage !== 'working' && l.oldest) s += ', the oldest for ' + span(now - ms(l.oldest));
    out.push(s + '.');
  }
  const done = lanes.find((l) => l.stage === 'done');
  if (done.count) out.push(done.count + ' done in the last ' + plural(days, 'day', 'days') + '.');
  return out.join(' ');
}

export function register({ on, refuse, S }) {
  on('GET', '/v1/work', (c) => {
    const q = c.url.searchParams;
    const days = q.has('days') ? Number(q.get('days')) : 7;
    if (!Number.isInteger(days) || days < 1 || days > 90) refuse(400, 'days is not 1 to 90');
    const all = q.get('all');
    if (all && all !== 'true' && all !== 'false') refuse(400, 'all is true or false');
    return board(S, c.person.subject, { days, all: all === 'true' });
  });
}
