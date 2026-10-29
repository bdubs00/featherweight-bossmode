// The fake route of the board of the work, after the package work of the
// workbench: one card per piece of work, from the request to its end.
//
//   GET /v1/work?days=7&all=false   {"sentence", "lanes": [{"stage", "count", "yours", "oldest"}], "cards": [<card>], "days",
//                                   "done", "waiting": {"count", "needsYou", "toCheck", "notes"}}
//   POST /v1/work/review            {"bridge", "verdict", "note"}: the check of a team. up closes the bridge with
//                                   the verdict accepted. down posts the note in the bridge to every seat, and the
//                                   bridge stays open.
//   POST /v1/work/letgo             {"card"}: lets a stopped card go. The card moves to Done with the verdict let-go
//                                   and the reason "Let go by <name>.". Only the person whose move it is, or an
//                                   owner of its agent, can. A second call does nothing.
//
// A card is {"id", "kind", "title", "from": {"kind", "name", "via"}, "stage",
// "next", "reason", "opened", "since", "ended", "agents", "parts", "links",
// "costUSD", "lost", "verdict"}. The stages, in the order of the flow:
// waiting, working, needs-you, stopped, review, done. A run is in review
// only when its owner asked to check each result: the metadata
// workbench.review is 1, or its duty has review. It leaves review on the
// first thumb. A done card carries its verdict: accepted (a thumb up; a
// heart is no verdict), checked (the done check of the agent passed, stop
// checked), sent-back (a thumb down), or unchecked. The fake builds the cards from
// its bridges, its runs, and the history of its duties with the rules of
// the workbench, in short: a bridge is one card, a start of a duty is one
// card, the items of a batch are one card, and a conversation is one card.
// A run that only the archive holds and that did not end is stopped and
// lost. A card that waits or works stays however old it is. A stopped card
// stays until a person lets it go, or for seven days, after which it lets
// itself go. To check and Done show the newest card first. done counts the
// done cards without the canceled cards and the cards let go, and waiting
// is the one count of the work that needs the person: the cards of Needs
// you and To check whose next move is the person's. The fake keeps no
// note that waits, so notes is 0. A duty that tells of a result only when it finds something
// puts a run whose answer starts with Found: in review, with that line as
// its reason. A person shows by the name beside the subject, in display.

import { nextOf } from './routes-e.mjs';

const DAY = 24 * 60 * 60 * 1000;
const STAGES = ['waiting', 'working', 'needs-you', 'stopped', 'review', 'done'];
const WEIGHT = { 'needs-you': 6, working: 5, waiting: 4, stopped: 3, review: 2, done: 1 };
const LANE = {
  waiting: ['is coming up', 'are coming up'],
  working: ['is in work', 'are in work'],
  'needs-you': ['needs a person', 'need a person'],
  stopped: ['stopped', 'stopped'],
  review: ['has a result to check', 'have a result to check'],
  done: ['is done', 'are done'],
};

/** The reason of a team whose agents all finished, in plain words. */
const TEAM_DONE = 'Each agent finished its part. Check the result.';

const plural = (n, one, many) => (n === 1 ? '1 ' + one : n + ' ' + many);
const ms = (t) => (t ? Date.parse(t) : 0);

function span(d) {
  if (d < 60_000) return 'less than a minute';
  if (d < 3_600_000) return plural(Math.floor(d / 60_000), 'minute', 'minutes');
  if (d < 2 * DAY) return plural(Math.floor(d / 3_600_000), 'hour', 'hours');
  return plural(Math.floor(d / DAY), 'day', 'days');
}

/** The people of the fake by subject: the name beside the subject. A person of Cloudflare Access has an id as the subject. */
export const PEOPLE = {
  'alice@example.com': 'Alice',
  'bob@example.com': 'Bob',
  'erin@example.com': 'Erin',
  'fd1e8a14-ac12-5a00-b4d6-bb6e50d15c10': 'Dana Reyes',
};

/** foundLine is the first line of an answer that starts with Found:, or "". A duty that tells only of what it finds sends such a result. */
export function foundLine(r) {
  const first = String((r && r.output) || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return first && /^found:/i.test(first) ? first : '';
}

/**
 * inReview reports whether a run waits for a person to check its result: it
 * ended well and has no thumb, and its owner asked to check each result
 * (the metadata workbench.review), or its duty tells of a result only when
 * it finds something (workbench.found) and it found something.
 */
export function inReview(r) {
  const md = r.metadata || {};
  const re = r.reactions || {};
  if (r.state !== 'completed' || re.up > 0 || re.down > 0) return false;
  if (md['workbench.review'] === '1') return true;
  return md['workbench.found'] === '1' && !!foundLine(r);
}

/** verdictOf is the verdict of a run that ended well: a person first, then the done check of the agent. */
function verdictOf(r) {
  const re = r.reactions || {};
  if (re.down > 0) return 'sent-back';
  if (re.up > 0) return 'accepted';
  if (r.stop === 'checked') return 'checked';
  return 'unchecked';
}

/** runPart is the stage of one run, as the workbench words it. */
function runPart(r) {
  const p = { run: r.id, since: r.updatedAt, approval: '', lost: false };
  const open = !['completed', 'failed', 'canceled'].includes(r.state);
  if (r.archived && open) return { ...p, stage: 'stopped', lost: true, reason: 'The agent that held it is gone.' };
  switch (r.state) {
    case 'input-required': {
      const a = r.pending || {};
      const reason = a.schema ? 'Asks: ' + (a.reason || 'a question') : a.tool ? 'Asks to run ' + a.tool + '.' : 'Waits for you.';
      return { ...p, stage: 'needs-you', reason, approval: a.id || '', since: a.requestedAt || r.updatedAt };
    }
    case 'queued':
      return { ...p, stage: 'waiting', reason: 'Waits to start.', since: r.createdAt };
    case 'running':
    case 'suspended':
      return { ...p, stage: 'working', reason: r.activity && r.activity.tool ? 'Runs ' + r.activity.tool + '.' : 'Works.', since: r.createdAt };
    case 'completed': {
      if (inReview(r)) return { ...p, stage: 'review', reason: foundLine(r) || 'A result to check.' };
      const verdict = verdictOf(r);
      const reason = { accepted: 'Accepted.', checked: 'Its done check passed.', 'sent-back': 'Sent back.', unchecked: 'Answered.' }[verdict];
      return { ...p, stage: 'done', reason, verdict };
    }
    case 'failed': {
      // A limit of the budget is no fault: the card says which limit stopped it.
      const limit = /^budget exceeded:?\s*([A-Za-z]+)/.exec(r.error || '');
      if (limit) return { ...p, stage: 'stopped', reason: 'Stopped at its ' + ({ maxTurns: 'turn', maxTokens: 'token', maxCostUSD: 'cost', maxToolCalls: 'tool call', deadline: 'time' }[limit[1]] || 'budget') + ' limit.' };
      return { ...p, stage: 'stopped', reason: r.error ? 'Failed: ' + String(r.error).slice(0, 200) : 'Failed.' };
    }
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
  if (card.kind === 'bridge' && card.stage === 'review') card.reason = TEAM_DONE;
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
    const card = blank('bridge:' + b.id, 'bridge', b.title, { kind: 'person', name: b.operator, via: 'bridge', ...(PEOPLE[b.operator] ? { display: PEOPLE[b.operator] } : {}) }, b.createdAt);
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
          parts.push({ ...p, stage: 'waiting', reason: m.handle + ' waits to start.' });
          break;
        case 'error':
          parts.push({ ...p, stage: 'stopped', reason: m.gone ? m.handle + ' stopped: the agent that held it is gone.' : m.handle + ' stopped with an error.', lost: !!m.gone });
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
          parts.push({ ...p, stage: 'review', reason: TEAM_DONE, since: last });
      }
    }
    // A team that a person checked with Looks right closed as accepted.
    if (b.state === 'closed') parts.push({ stage: 'done', reason: b.verdict === 'accepted' ? 'Accepted.' : 'Closed.', since: b.closedAt || last, verdict: b.verdict || 'unchecked' });
    if (!parts.length) parts.push({ stage: 'stopped', reason: 'The channel has no agent.', since: last });
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
      const via = job ? 'queue' : r.origin === 'mcp' ? 'mcp' : r.origin === 'manager' ? 'manager' : 'page';
      g = { card: blank(id, job ? 'job' : 'conversation', job ? md['fw.batch'] : r.title || r.agent, { kind: 'person', name: r.principal, via, ...(PEOPLE[r.principal] ? { display: PEOPLE[r.principal] } : {}) }, r.createdAt), parts: [] };
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

  // A stopped card that a person let go ends in Done, with the verdict let-go. A card that moved on since then stays where it is.
  for (const c of cards) {
    const g = S.letGo && S.letGo.get(c.id);
    if (!g || c.stage !== 'stopped') continue;
    Object.assign(c, { stage: 'done', verdict: 'let-go', reason: 'Let go by ' + (g.by === me ? 'you' : g.name) + '.', since: g.at, ended: g.at, next: '' });
  }
  // A card that stopped seven days ago and that nobody moved lets itself go.
  for (const c of cards) {
    if (c.stage !== 'stopped' || !c.since || now - ms(c.since) < 7 * DAY) continue;
    const at = new Date(ms(c.since) + 7 * DAY).toISOString();
    Object.assign(c, { stage: 'done', verdict: 'let-go', reason: 'It stopped 7 days ago and nobody moved it, so it let itself go.', since: at, ended: at, next: '' });
  }

  // The board keeps the cards of the person, a card that did not end however old, and a card that ended in the window.
  // A card in review waits for a person, so it stays however old it is.
  const shown = cards.filter((c) => (all || c.mine) && !(c.stage === 'done' && now - ms(c.since) > days * DAY));
  const rank = Object.fromEntries(STAGES.map((s, i) => [s, i]));
  shown.sort((a, b) => rank[a.stage] - rank[b.stage] || (a.stage === 'done' || a.stage === 'review' ? ms(b.since) - ms(a.since) : ms(a.since) - ms(b.since)));
  const lanes = STAGES.map((stage) => {
    const of = shown.filter((c) => c.stage === stage);
    const oldest = of.reduce((o, c) => (!o || ms(c.since) < ms(o) ? c.since : o), '');
    return { stage, count: of.length, yours: of.filter((c) => c.next === 'you').length, ...(oldest ? { oldest } : {}) };
  });
  for (const c of shown) {
    delete c.mine;
    c.links.runs = c.links.runs.slice(0, 20);
  }
  const done = shown.filter((c) => c.stage === 'done' && ['accepted', 'checked', 'sent-back', 'unchecked'].includes(c.verdict)).length;
  const yours = (stage) => lanes.find((l) => l.stage === stage).yours;
  const waiting = { needsYou: yours('needs-you'), toCheck: yours('review'), notes: 0 };
  waiting.count = waiting.needsYou + waiting.toCheck + waiting.notes;
  return { sentence: sentence(lanes, shown.length, days, now, done), lanes, cards: shown, days, done, waiting };
}

function sentence(lanes, n, days, now, finished) {
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
  if (done.count) out.push(finished + ' done in the last ' + plural(days, 'day', 'days') + (done.count > finished ? ', and ' + (done.count - finished) + ' canceled or let go' : '') + '.');
  return out.join(' ');
}

export function register({ on, refuse, readJson, S, now, AGENTS, admin, viewerOf, publish, post, system, moveSeat }) {
  S.letGo = S.letGo || new Map();
  on('GET', '/v1/work', (c) => {
    const q = c.url.searchParams;
    const days = q.has('days') ? Number(q.get('days')) : 7;
    if (!Number.isInteger(days) || days < 1 || days > 90) refuse(400, 'days is not 1 to 90');
    const all = q.get('all');
    if (all && all !== 'true' && all !== 'false') refuse(400, 'all is true or false');
    return board(S, c.person.subject, { days, all: all === 'true' });
  });

  // The check of a team: up closes the bridge as accepted, and down posts the note to every seat.
  on('POST', '/v1/work/review', async (c) => {
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (!['bridge', 'run', 'verdict', 'note'].includes(k)) refuse(400, `json: unknown field "${k}"`);
    // The older words right and work still work.
    const verdict = { right: 'up', work: 'down' }[body.verdict] || body.verdict;
    const note = String(body.note || '').trim();
    if (verdict !== 'up' && verdict !== 'down') refuse(400, `verdict is "${verdict}", not up or down`);
    if (verdict === 'down' && !note) refuse(400, 'Needs work needs a note that says what must change.');
    if (note.length > 4000) refuse(400, 'the note is at most 4000 bytes of text');
    if (viewerOf(c.person)) refuse(403, 'checking a result needs the operator role');
    if (!body.bridge) refuse(400, 'the check of a team names its bridge');
    const b = S.bridges.get(String(body.bridge));
    if (!b) refuse(404, `no bridge ${body.bridge}`);
    if (b.operator !== c.person.subject && !admin()) refuse(403, 'only the person who opened the bridge checks its result');
    if (b.state !== 'open') refuse(409, `the bridge ${b.id} is closed`);
    const who = c.person.name.toLowerCase();
    if (verdict === 'up') {
      Object.assign(b, { state: 'closed', closedAt: now(), verdict: 'accepted' });
      system(b.id, 'closed', `${who} said that the result looks right and closed the channel`);
      return { bridge: b.id, reaction: 'up', followUp: false, closed: true };
    }
    const seats = b.members.filter((m) => !m.fired);
    post(b.id, { kind: 'person', name: c.person.subject, display: c.person.name }, 'Needs work: ' + note, { to: seats.map((m) => m.handle) });
    for (const m of seats) moveSeat(b.id, m, 'working', { turn: 1, tool: '', phrase: 'Reads the note of ' + c.person.name, since: now() });
    // The seats work on the note, then end their turns, and the team waits to be checked again.
    setTimeout(() => {
      for (const m of seats) if (m.presence === 'working') moveSeat(b.id, m, 'idle', null);
    }, 5000);
    return { bridge: b.id, reaction: 'down', followUp: true, closed: false };
  });

  // Let a stopped card go: the person whose move it is, an admin, or an owner of an agent of the card.
  on('POST', '/v1/work/letgo', async (c) => {
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (k !== 'card') refuse(400, `json: unknown field "${k}"`);
    const id = String(body.card || '');
    if (!id) refuse(400, 'card names no card');
    const all = board(S, c.person.subject, { days: 90, all: true });
    const card = all.cards.find((x) => x.id === id);
    if (!card) refuse(404, `no card ${id}`);
    if (card.verdict === 'let-go') return card;
    if (card.stage !== 'stopped') refuse(409, `the card ${id} is not stopped`);
    const owns = admin() || card.agents.some((a) => (AGENTS.find((x) => x.name === a) || {}).role === 'owner');
    if (viewerOf(c.person) || !(card.next === 'you' || owns)) refuse(403, 'only the person whose move it is, or an owner of its agent, can let it go');
    S.letGo.set(id, { by: c.person.subject, name: PEOPLE[c.person.subject] || c.person.name, at: now() });
    return board(S, c.person.subject, { days: 90, all: true }).cards.find((x) => x.id === id) || card;
  });
}
