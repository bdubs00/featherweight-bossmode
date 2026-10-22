// The fake server of bossmode. It serves every route that the page calls,
// with sample data, and the event stream, with timers that move members and
// post messages. It accepts writes and reflects them. It is for development
// only: it keeps everything in memory, trusts any token that starts with
// "fake-", and checks nothing that a real workbench checks.
//
// Run it with `npm run fake`. Variables:
//   FAKE_PORT=8787     the port
//   FAKE_SIGNIN=0      a 401 names no sign-in route, so the page shows the token form
//   FAKE_QUIET=1       no timers
//   FAKE_TICK=5000     the time between two timer steps, in milliseconds
//   FAKE_STREAM_MS     the life of one stream before the server closes it, 15 minutes by default
//   FAKE_THEME=0       the theme of GET /v1/bossmode names no organization, as a deployment without a theme
//   FAKE_ACCENT        the accent of the theme, #FF4D00 by default
//   FAKE_ORG           the name of the organization of the theme, Example Org by default
//   FAKE_LOGO=1        the theme names a logo, served at /v1/bossmode/logo
//   FAKE_PARTIAL=1     a stream event of a card carries a partial entry, so the page reads it again
//   FAKE_ADMIN=1       whoami says that the person is an admin, who can add and remove skills
//   FAKE_A=1           the sample data shows each state of the bridges screen (routes-a.mjs)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, FLEET, hash, seed, wiki } from './data.mjs';
import { checkSvg, identicon } from './faces.mjs';
import { TEMPLATES } from './routes-c.mjs';
import { TOOLS_OF, allowlistOf } from './skills.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', 'dist');
const PORT = Number(process.env.FAKE_PORT || 8787);
const SIGNIN = process.env.FAKE_SIGNIN !== '0';
const QUIET = process.env.FAKE_QUIET === '1';
const TICK = Number(process.env.FAKE_TICK || 5000);
const STREAM_MS = Number(process.env.FAKE_STREAM_MS || 15 * 60_000);
const THEME = process.env.FAKE_THEME !== '0';
const PARTIAL = process.env.FAKE_PARTIAL === '1';
const ADMIN = process.env.FAKE_ADMIN === '1';

const S = seed();

/** The logo of the organization of the theme, with FAKE_LOGO=1. */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44"><title>Example Org</title><rect width="44" height="44" fill="#111"/><path d="M10 12h24v5H16v3h14v5H16v3h18v5H10z" fill="#f3f3ef"/></svg>`;
const now = () => new Date().toISOString();
const MANAGER_MEMBER = 'default/manager-0';

/* ---------- people ---------- */

/** The people of the fake: a token fake-<name> signs in <name>@example.com. */
function personOf(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer (fake-[a-z0-9-]{1,40})$/.exec(h);
  if (!m) return null;
  const name = m[1].slice(5);
  const subject = name + '@example.com';
  return { subject, name: name[0].toUpperCase() + name.slice(1), kind: 'user' };
}

/* ---------- answers ---------- */

function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Cache-Control': 'no-store', ...(typeof body === 'string' ? {} : { 'Content-Type': 'application/json' }), ...headers });
  res.end(data);
}

/** problem answers an RFC 9457 problem document. */
function problem(res, status, detail, extra = {}, headers = {}) {
  const titles = { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 409: 'Conflict', 412: 'Precondition Failed', 413: 'Content Too Large', 422: 'Unprocessable Content' };
  res.writeHead(status, { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify({ type: 'about:blank', title: titles[status] || 'Error', status, detail, ...extra }));
}

class Refusal extends Error {
  constructor(status, detail, extra, headers) {
    super(detail);
    this.status = status;
    this.extra = extra;
    this.headers = headers;
  }
}
const refuse = (status, detail, extra, headers) => {
  throw new Refusal(status, detail, extra, headers);
};

async function readBody(req, max = 512 * 1024) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > max) refuse(413, 'the body is too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) refuse(400, 'the body must be a JSON object');
    return v;
  } catch (e) {
    if (e instanceof Refusal) throw e;
    refuse(400, 'the body is not JSON');
  }
}

/* ---------- the stream ---------- */

const RING = 500;
const events = [];
// The ids count from the start time of the server in microseconds, as the
// front counts them, so an id from before a restart gives reset.
const FIRST_ID = Date.now() * 1000;
let eventSeq = FIRST_ID;
const clients = new Set();

/** publish sends one event to every stream and keeps it for a resume. */
function publish(kind, data) {
  const ev = { id: String(++eventSeq), kind, data };
  events.push(ev);
  if (events.length > RING) events.shift();
  for (const c of clients) write(c, ev);
}

function write(res, ev) {
  res.write(`id: ${ev.id}\nevent: ${ev.kind}\ndata: ${JSON.stringify(wire(ev))}\n\n`);
}

/**
 * wire is the data of an event as the stream sends it. With FAKE_PARTIAL=1,
 * an entry with a decision goes out cut, as the backend can send it: with
 * partial set and without the input and the schema of the decision. The
 * page reads the entry again with ?from=<seq>&limit=1.
 */
function wire(ev) {
  if (!PARTIAL || ev.kind !== 'bridge.message' || !ev.data || !ev.data.message || !ev.data.message.decision) return ev.data;
  const { input: _i, schema: _s, ...decision } = ev.data.message.decision;
  return { bridge: ev.data.bridge, message: { ...ev.data.message, partial: true, decision } };
}

function stream(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 2000\n\n');
  const last = req.headers['last-event-id'];
  if (last) {
    const n = Number(last);
    const first = events.length ? Number(events[0].id) : eventSeq + 1;
    if (!Number.isSafeInteger(n) || n < first - 1 || n < FIRST_ID || n > eventSeq) {
      // The page asks for events that the ring no longer holds.
      write(res, { id: String(eventSeq), kind: 'reset', data: null });
    } else {
      for (const ev of events) if (Number(ev.id) > n) write(res, ev);
    }
  }
  clients.add(res);
  const ping = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  // The front closes a stream after a while, and the page connects again with Last-Event-ID.
  const life = setTimeout(() => res.end(), STREAM_MS);
  req.on('close', () => {
    clearInterval(ping);
    clearTimeout(life);
    clients.delete(res);
  });
}

/* ---------- bridges ---------- */

function bridgeOr404(id) {
  const b = S.bridges.get(id);
  if (!b) refuse(404, `no bridge ${id}`);
  return b;
}

function counts(e, subject) {
  if (e.from.kind === 'person' && e.from.name === subject) return false;
  if (e.from.kind === 'system') return !!(e.decision && e.decision.state === 'pending');
  return true;
}

/** listItem is a bridge of GET /v1/bridges for one person. */
function listItem(b, subject) {
  const ch = S.channels.get(b.id) || [];
  const read = S.reads.get(b.id + '|' + subject) || 0;
  const { members, ...rest } = b;
  return {
    ...rest,
    lastSeq: ch.length ? ch[ch.length - 1].seq : 0,
    read,
    unread: ch.slice(-2000).filter((e) => e.seq > read && counts(e, subject)).length,
    memberCount: members.length,
    needsYou: members.filter((m) => m.presence === 'needs-you').length,
  };
}

const record = (b, subject) => ({ ...listItem(b, subject), members: b.members });

/** usageOf sums the usage of the runs of a bridge, with the partial mark of the tool batch. */
function usageOf(b) {
  const u = { turns: 0, toolCalls: 0, costUSD: 0, reported: 0, final: 0, missing: 0, partial: false };
  for (const m of b.members) {
    for (const id of m.runs) {
      const r = S.runs.get(id);
      if (!r || !r.usage) {
        u.missing++;
        continue;
      }
      u.turns += r.usage.turns || 0;
      u.toolCalls += r.usage.toolCalls || 0;
      u.costUSD += r.usage.costUSD || 0;
      u.reported++;
      if (['completed', 'failed', 'canceled'].includes(r.state)) u.final++;
    }
  }
  u.partial = u.missing > 0;
  u.costUSD = Math.round(u.costUSD * 100) / 100;
  return u;
}

/** stoppedRun names how the newest run of a seat stopped, or "" when it can take a message. */
function stoppedRun(m) {
  const r = S.runs.get(m.runs[m.runs.length - 1]);
  if (!r) return '';
  if (r.state === 'failed') return 'failed';
  if (r.state === 'canceled') return 'was canceled';
  return '';
}

/** dropCards rewrites the cards of a run that stopped waiting as denied, with no decider and a note. */
function dropCards(bridgeId, runIds, note) {
  for (const e of S.channels.get(bridgeId) || []) {
    if (e.decision && e.decision.state === 'pending' && runIds.includes(e.decision.run)) {
      e.decision = { ...e.decision, state: 'deny', decidedAt: now(), note };
      delete e.decision.decidedBy;
      republish(bridgeId, e);
    }
  }
}

/** post appends an entry to a channel and publishes it. */
function post(bridgeId, from, text, more = {}) {
  const ch = S.channels.get(bridgeId);
  const seq = ch.length ? ch[ch.length - 1].seq + 1 : 1;
  const e = { seq, at: now(), from, to: [], replyTo: null, text: String(text).slice(0, 4096), mirrors: null, reactions: { up: [], down: [], heart: [] }, decision: null, pinned: false, ...more };
  if (String(text).length > 4096) e.cut = true;
  ch.push(e);
  publish('bridge.message', { bridge: bridgeId, message: e });
  return e;
}

const system = (bridgeId, event, text, more = {}) => post(bridgeId, { kind: 'system' }, text, { event, ...more });

function republish(bridgeId, e) {
  publish('bridge.message', { bridge: bridgeId, message: e });
}

function setMember(bridgeId, m, patch) {
  Object.assign(m, patch);
  publish('bridge.member', { bridge: bridgeId, member: m });
}

const HANDLE = /^[a-z0-9][a-z0-9._-]{0,31}$/;

function newRun(agent, handle, bridgeId, task, principal) {
  const id = 'run-' + handle + '-' + Date.now().toString(36);
  const run = { id, agent, title: task, state: 'running', input: task, seq: 1, origin: 'http', principal, metadata: { 'fw.batch': 'bridge:' + bridgeId, 'fw.bridge.member': handle }, createdAt: now(), updatedAt: now(), member: 'default/crew-0', activity: { turn: 1, phrase: 'Read index.md', since: now() }, reactions: { up: 0, down: 0, heart: 0 } };
  S.runs.set(id, run);
  S.transcripts.set(id, [{ seq: 1, time: now(), kind: 'user', text: task, who: principal }]);
  S.results.set(id, { runId: id, title: task, agent, status: 'working', started: run.createdAt, changed: run.updatedAt, next: [] });
  publish('run', run);
  return run;
}

function seat(bridgeId, m, principal) {
  if (!HANDLE.test(m.handle || '')) refuse(400, `the handle ${JSON.stringify(m.handle || '')} must be lower-case letters, digits, dots, dashes, or underscores, at most 32`);
  if (!AGENTS.some((a) => a.name === m.agent)) refuse(400, `no agent ${m.agent}`);
  if (!m.task || !String(m.task).trim()) refuse(400, `the member ${m.handle} needs a task`);
  const run = newRun(m.agent, m.handle, bridgeId, String(m.task), principal);
  return { handle: m.handle, agent: m.agent, pool: 'crew', task: String(m.task), runs: [run.id], fired: false, muted: false, presence: 'working', activity: run.activity };
}

function memberOf(b, handle) {
  const m = b.members.find((x) => x.handle === handle);
  if (!m) refuse(404, `no member ${handle} in the bridge ${b.id}`);
  return m;
}

/** messagesPage pages a channel as the transcript route pages. */
function messagesPage(id, q) {
  const ch = S.channels.get(id) || [];
  const limit = Math.min(Math.max(Number(q.get('limit')) || 50, 1), 500);
  const before = q.get('before');
  const from = q.get('from');
  if (before && from) refuse(400, 'from and before together are not allowed');
  let list;
  let next = 0;
  if (from) {
    const f = Number(from);
    const rest = ch.filter((e) => e.seq >= f);
    list = rest.slice(0, limit);
    if (rest.length > limit) next = rest[limit].seq;
  } else {
    const b = Number(before) || 0;
    const head = b ? ch.filter((e) => e.seq < b) : ch;
    list = head.slice(-limit);
    if (b && ch.some((e) => e.seq >= b)) next = b;
  }
  const prev = list.length && ch.length && list[0].seq > ch[0].seq ? list[0].seq : 0;
  return { bridge: id, messages: list, next, prev };
}

const REPLIES = [
  'On it. I will post the path when it is ready.',
  'Understood. I change the plan and keep the rest as it is.',
  'Done. The change is in the branch, and the lint passes.',
  'I read that. One question: does this hold for every module, or only for this one?',
  'Noted in the wiki under `index.md`.',
];
let replyN = 0;

/** fanOut answers a message of a person in the place of the members. */
function fanOut(bridgeId, e) {
  const b = S.bridges.get(bridgeId);
  if (!b || b.state !== 'open') return;
  for (const h of e.to || []) {
    const m = b.members.find((x) => x.handle === h);
    const how = m && stoppedRun(m);
    if (how) system(bridgeId, 'failed', `${h} got no message, because its newest run ${how}. Seat it again with a new task.`);
  }
  const active = b.members.filter((m) => !m.fired && !m.muted && !stoppedRun(m));
  const to = e.to && e.to.length ? active.filter((m) => e.to.includes(m.handle)) : active.slice(0, 2);
  to.forEach((m, i) => {
    const wasAsleep = m.presence === 'asleep';
    setTimeout(() => {
      if (wasAsleep) system(bridgeId, 'started', `${m.handle} woke up.`);
      setMember(bridgeId, m, { presence: 'working', activity: { turn: 1, phrase: 'Read the message of ' + e.from.display, since: now() } });
    }, 600 + i * 400);
    setTimeout(() => {
      if (m.fired) return;
      post(bridgeId, { kind: 'agent', handle: m.handle, run: m.runs[m.runs.length - 1] }, REPLIES[replyN++ % REPLIES.length], { replyTo: e.seq });
      setMember(bridgeId, m, { presence: 'idle', activity: null });
    }, 2500 + i * 1500);
  });
}

/* ---------- decisions ---------- */

/** decide applies a decision to a run and to the card of its channel. */
function decide(runId, approvalId, body, person) {
  const run = S.runs.get(runId);
  if (!run) refuse(404, `no run ${runId}`);
  if (!run.pending || run.pending.id !== approvalId) refuse(409, `the run ${runId} does not wait for the approval ${approvalId}`);
  const decision = body.decision;
  if (decision !== 'allow' && decision !== 'deny') refuse(400, 'decision must be allow or deny');
  const question = !!run.pending.schema;
  const answer = question && decision === 'allow' ? (body.content !== undefined ? JSON.stringify(body.content) : String(body.note || '')) : '';
  const items = S.transcripts.get(runId);
  const seq = items.length ? items[items.length - 1].seq + 1 : 1;
  items.push({ seq, time: now(), kind: 'decided', id: approvalId, text: decision, who: person.subject, detail: body.note || '' });
  const pending = run.pending;
  Object.assign(run, { pending: null, state: 'running', seq, updatedAt: now(), activity: { turn: 8, phrase: decision === 'allow' ? 'Went on after your decision' : 'Read your denial', since: now() } });
  const res = S.results.get(runId);
  if (res) Object.assign(res, { pending: null, status: 'working', next: [] });
  publish('run', run);
  // The card in the channel and the line under it.
  for (const [bid, ch] of S.channels) {
    const card = ch.find((e) => e.decision && e.decision.run === runId && e.decision.id === approvalId);
    if (!card) continue;
    const words = question ? answerWords(body.content, body.note) : '';
    card.decision = { ...card.decision, state: decision, decidedBy: person.subject, decidedAt: now(), note: body.note || undefined, answer: words || undefined };
    republish(bid, card);
    const b = S.bridges.get(bid);
    const m = b.members.find((x) => x.runs.includes(runId));
    const who = m ? m.handle : run.agent;
    const what = pending.input && pending.input.command ? '`' + pending.input.command + '`' : pending.tool;
    const line = question
      ? decision === 'allow' ? `${person.name.toLowerCase()} answered the question of ${who}: ${words}.` : `${person.name.toLowerCase()} declined the question of ${who}.`
      : `${person.name.toLowerCase()} ${decision === 'allow' ? 'allowed' : 'denied'} ${what} for ${who}${body.note ? ', with a note' : ''}.`;
    system(bid, 'decided', line, { mirrors: { run: runId, seq, type: 'fw.approval.decided' } });
    if (m) {
      setMember(bid, m, { presence: 'working', activity: run.activity });
      setTimeout(() => finish(bid, m, run, decision, question, words), 5000);
    }
  }
  if (run.agent === 'manager') setTimeout(() => managerAnswer(run, decision === 'allow' ? 'Done. The plan runs now.' : 'I stopped, as you asked. Tell me what to change.'), 2000);
  return { run };
}

function answerWords(content, note) {
  if (content && typeof content === 'object') {
    const v = Object.values(content);
    return v.length === 1 ? (v[0] === true ? 'Yes' : v[0] === false ? 'No' : String(v[0])) : Object.entries(content).map(([k, x]) => k + ': ' + x).join(', ');
  }
  return String(note || '');
}

/** finish ends the turn of a member after a decision, with an answer in the channel. */
function finish(bridgeId, m, run, decision, question, words) {
  if (m.fired || run.state !== 'running') return;
  const text = question
    ? `Thanks. I write the notes for **${words || 'that audience'}** now, and I post the draft when it is ready.`
    : decision === 'allow'
      ? 'I pushed `migrate/nginx`. @reviewer the branch is up for review.'
      : 'I did not push. The branch stays local until you say so.';
  const items = S.transcripts.get(run.id);
  const seq = items[items.length - 1].seq + 1;
  items.push({ seq, time: now(), kind: 'assistant', text });
  items.push({ seq: seq + 1, time: now(), kind: 'end', text: 'completed' });
  Object.assign(run, { state: 'completed', output: text, seq: seq + 1, updatedAt: now(), activity: null });
  const res = S.results.get(run.id);
  if (res) Object.assign(res, { status: 'ready', summary: text, next: [{ kind: 'reply', label: 'Reply' }] });
  publish('run', run);
  post(bridgeId, { kind: 'agent', handle: m.handle, run: run.id }, text, { mirrors: { run: run.id, seq: seq + 1, type: 'fw.run.finished' } });
  setMember(bridgeId, m, { presence: 'idle', activity: null });
}

/* ---------- the manager ---------- */

function managerAnswer(run, text) {
  const items = S.transcripts.get(run.id);
  const seq = items[items.length - 1].seq + 1;
  items.push({ seq, time: now(), kind: 'assistant', text });
  items.push({ seq: seq + 1, time: now(), kind: 'end', text: 'completed' });
  Object.assign(run, { state: 'completed', output: text, seq: seq + 1, updatedAt: now(), activity: null });
  const res = S.results.get(run.id);
  if (res) Object.assign(res, { status: 'ready', summary: text });
  publish('run', run);
}

/** The answers of an agent that is not the manager, in a conversation outside a bridge. */
const AGENT_ANSWERS = ['I read that. I start now and post what I find.', 'Done. The change is in the branch, and the checks pass.'];
let agentN = 0;

const MANAGER_ANSWERS = [
  'Two bridges are open. **migrator-2** waits for you to allow a push, and **scribe** waits for an answer about the audience of the notes.',
  'The `crew` pool has 3 Tasks: two are up, and one sleeps. Nothing failed in the last hour, except **writer**, which reached its limit of 40 turns.',
  'I can open a bridge for that. Tell me the members and their tasks, or let me split the goal, and I show you the plan before anything starts.',
];
let managerN = 0;

/** managerTurn runs one turn of the manager, or of another agent outside a bridge: it wakes, works, and answers. */
function managerTurn(run, first) {
  const wake = first ? 3500 : 800;
  const manager = run.agent === 'manager';
  setTimeout(() => {
    Object.assign(run, { state: 'running', updatedAt: now(), activity: manager ? { turn: 1, tool: 'front.fleet', phrase: 'Read the fleet', since: now() } : { turn: 1, tool: 'files', phrase: 'Read index.md', since: now() } });
    publish('run', run);
  }, wake);
  setTimeout(() => {
    if (run.usage) run.usage = { ...run.usage, turns: (run.usage.turns || 0) + 1, costUSD: Math.round(((run.usage.costUSD || 0) + 0.04) * 100) / 100 };
    managerAnswer(run, manager ? MANAGER_ANSWERS[managerN++ % MANAGER_ANSWERS.length] : AGENT_ANSWERS[agentN++ % AGENT_ANSWERS.length]);
  }, wake + 2500);
}

/* ---------- pages ---------- */

/** live returns the newest version of a page, or null for a removed page. */
function live(p) {
  const v = p && p.versions[p.versions.length - 1];
  return v && !v.deleted ? v : null;
}

function titleOf(text, path) {
  const t = (/^title:\s*(.+)$/m.exec(text) || [])[1] || (/^#\s+(.+)$/m.exec(text) || [])[1] || '';
  return t.replace(/^["']|["']$/g, '').trim() || path;
}

const tagsOf = (text) => ((/^tags:\s*\[(.*)\]$/m.exec(text) || [])[1] || '').split(',').map((t) => t.trim()).filter(Boolean);

/** pageMeta is a page without its text, as GET /v1/pages lists it. */
function pageMeta(p, v = live(p)) {
  const out = { path: p.path, title: titleOf(v.text, p.path), tags: tagsOf(v.text), hash: v.hash, version: v.version, size: Buffer.byteLength(v.text), by: v.by, at: v.at, summary: v.summary || '' };
  if (v.run) out.run = v.run;
  return out;
}

function pageBody(p, version) {
  const v = version ? p.versions.find((x) => x.version === version && !x.deleted) : live(p);
  if (!v) refuse(404, version ? `the page ${p.path} has no version ${version}` : `no page ${p.path}`);
  return { ...pageMeta(p, v), text: v.text };
}

/**
 * checkPath applies the rule of the store: a relative path of at most 8
 * parts and 512 bytes, no part that is empty or starts with a dot, no
 * control character, and .md on the last part alone. The paths search and
 * .../history meet routes of their own.
 */
function checkPath(p) {
  const parts = p.split('/');
  if (!p) refuse(400, 'the path is empty; a page path ends with .md, such as notes/plan.md');
  if (Buffer.byteLength(p) > 512) refuse(400, 'a page path has at most 512 bytes');
  if (parts.length > 8 || parts.some((x) => !x || x.startsWith('.')) || /[\u0000-\u001f\u007f]/.test(p)) {
    refuse(400, `the path ${JSON.stringify(p)} must be a relative path of at most 8 parts, with no part that starts with a dot`);
  }
  if (p === 'search') refuse(400, 'the path search is the route GET /v1/pages/search, so no page has it; a page path ends with .md, such as search.md');
  if (parts[parts.length - 1] === 'history') refuse(400, `the path ${JSON.stringify(p)} ends with history, which is the route of the history of a page; a page path ends with .md`);
  if (!p.endsWith('.md')) refuse(400, `the path ${JSON.stringify(p)} does not end with .md; a page path ends with .md, such as notes/plan.md`);
  if (parts.slice(0, -1).some((x) => x.endsWith('.md'))) refuse(400, `the path ${JSON.stringify(p)} has a directory that ends with .md; only the last part of a page path ends with .md`);
}

function checkWritable(p) {
  checkPath(p);
  if (p === '_index.md') refuse(400, 'the store writes _index.md after each change of the wiki, so nobody else writes or removes it; write index.md instead');
}

/**
 * writePage writes a page. The same text again makes no new version and
 * answers the page as it is. by is a subject, agent:<profile>, run:<id>,
 * token, or bossmode.
 */
function writePage(p, text, by, summary, run) {
  let page = S.pages.get(p);
  const cur = live(page);
  if (cur && cur.text === text) return { page, changed: false };
  if (!page) {
    page = { path: p, versions: [] };
    S.pages.set(p, page);
  }
  const v = { version: ++wiki.rev, text, hash: hash(text), by, at: now(), summary: summary || '' };
  if (run) v.run = run;
  page.versions.push(v);
  if (page.versions.length > 64) page.versions.shift();
  publish('page', pageMeta(page));
  return { page, changed: true };
}

/** heart appends an entry to the learned page of the agent, as section 4.5 says. */
function heart(bridgeId, e, person, note) {
  const b = S.bridges.get(bridgeId);
  const m = e.from.handle ? b.members.find((x) => x.handle === e.from.handle) : null;
  const agent = m ? m.agent : e.mirrors ? (S.runs.get(e.mirrors.run) || {}).agent : '';
  if (!agent) return;
  const p = `agents/${agent}/learned.md`;
  const old = live(S.pages.get(p));
  const head = old ? old.text : `# What people liked from ${agent}\n`;
  const entry = `\n## ${now().slice(0, 10)}, bridge ${bridgeId}, ${e.from.handle || agent}\n\n${person.name} hearted: ${e.text.replace(/\s+/g, ' ').slice(0, 280)}${note ? `\n\nTheir note: ${note}` : ''}\n`;
  writePage(p, (head + entry).slice(-64 * 1024), 'bossmode', 'A heart from ' + person.name.toLowerCase());
}

/* ---------- faces ---------- */

/** faceOf returns the face of an agent that the fake knows, else a 404. */
function faceOf(agent) {
  const f = S.faces.get(agent);
  if (!f) refuse(404, `no agent ${agent}`);
  return f;
}

let faceRev = 0;
const faceMeta = (f) => {
  const out = { agent: f.agent, displayName: f.displayName, tagline: f.tagline, hash: f.hash, custom: f.custom };
  if (f.by) Object.assign(out, { by: f.by, at: f.at, version: f.version });
  return out;
};

/** stamp records who changed a face and when. */
function stamp(f, person) {
  Object.assign(f, { by: person.subject, at: now(), version: ++faceRev });
}

/* ---------- the routes ---------- */

const routes = [];
const on = (method, pattern, h, open = false) => routes.push({ method, re: new RegExp('^' + pattern + '$'), h, open });

on('GET', '/v1/whoami', (c) => ({ principal: c.person, roles: Object.fromEntries(AGENTS.map((a) => [a.name, a.role])), admin: ADMIN, canCreate: true, teams: ['team-platform'], fleet: 'front-0' }));
// The settings in the order of the keys of the backend. The backend sends
// every key of the theme, with "" for a key that the deployment leaves out.
on('GET', '/v1/bossmode', (c) => {
  const latest = [...S.runs.values()].filter((r) => r.agent === 'manager' && r.principal === c.person.subject).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  return {
    manager: { agent: 'manager', member: MANAGER_MEMBER, run: latest ? latest.id : '' },
    placement: 'queue',
    maxMembers: 16,
    theme: { accent: process.env.FAKE_ACCENT || '#FF4D00', name: THEME ? process.env.FAKE_ORG || 'Example Org' : '', logo: process.env.FAKE_LOGO === '1' ? '/v1/bossmode/logo' : '' },
    templates: TEMPLATES,
    chat: { agent: 'manager', member: MANAGER_MEMBER },
  };
});
on('GET', '/v1/bossmode/logo', (c) => {
  c.headers['Content-Type'] = 'image/svg+xml';
  c.headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return LOGO;
});
on('GET', '/v1/bossmode/stream', (c) => {
  stream(c.req, c.res);
  return undefined;
});

on('GET', '/v1/bridges', (c) => ({ bridges: [...S.bridges.values()].map((b) => listItem(b, c.person.subject)) }));
on('POST', '/v1/bridges', async (c) => {
  const body = await readJson(c.req);
  const title = String(body.title || '').trim();
  if (!title) refuse(400, 'a bridge needs a title');
  const members = Array.isArray(body.members) ? body.members : [];
  if (members.length === 0) refuse(400, 'a bridge needs at least one member');
  if (members.length > 16) refuse(400, 'a bridge holds at most 16 members');
  const handles = new Set();
  for (const m of members) {
    if (handles.has(m.handle)) refuse(400, `the handle ${m.handle} is taken twice`);
    handles.add(m.handle);
  }
  const id = 'br-' + Date.now().toString(36);
  const b = {
    id, title, goal: String(body.goal || ''), operator: c.person.subject, state: 'open', placement: body.placement === 'spawn' ? 'spawn' : 'queue', createdAt: now(), closedAt: null, manager: null,
    delegation: { approve: false, budget: false, members: false, report: true, ...(body.delegation || {}) },
    caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6, ...(body.caps || {}) },
    members: [],
  };
  if (b.placement === 'spawn') refuse(400, 'a spawn bridge needs a manager, and the fake server seats queue bridges only');
  b.members = members.map((m) => seat(id, m, c.person.subject));
  S.bridges.set(id, b);
  S.channels.set(id, []);
  system(id, 'opened', `${c.person.name.toLowerCase()} opened the bridge with ${b.members.length} member${b.members.length === 1 ? '' : 's'}.`);
  for (const m of b.members) {
    publish('bridge.member', { bridge: id, member: m });
    system(id, 'started', `${m.handle} started: ${m.task}`, { mirrors: { run: m.runs[0], seq: 1, type: 'fw.run.queued' } });
  }
  setTimeout(() => {
    for (const m of b.members) {
      post(id, { kind: 'agent', handle: m.handle, run: m.runs[0] }, `I read the plan. I start with: ${m.task.toLowerCase()}.`);
      setMember(id, m, { presence: 'idle', activity: null });
    }
  }, 4000);
  c.status = 201;
  return record(b, c.person.subject);
});
on('GET', '/v1/bridges/([^/]+)', (c, id) => {
  const b = bridgeOr404(id);
  return { ...record(b, c.person.subject), usage: usageOf(b) };
});
on('PATCH', '/v1/bridges/([^/]+)', async (c, id) => {
  const b = bridgeOr404(id);
  const body = await readJson(c.req);
  if (body.title !== undefined) {
    if (!String(body.title).trim()) refuse(400, 'a bridge needs a title');
    b.title = String(body.title).trim();
  }
  if (body.delegation) b.delegation = { ...b.delegation, ...body.delegation };
  if (body.caps) b.caps = { ...b.caps, ...body.caps };
  if (body.state === 'closed' && b.state !== 'closed') {
    b.state = 'closed';
    b.closedAt = now();
    system(id, 'closed', `${c.person.name.toLowerCase()} closed the bridge. Nothing was canceled.`);
    if (b.delegation.report) {
      setTimeout(() => {
        const p = `bridges/${id}/report.md`;
        writePage(p, `# Report of ${b.title}\n\n${b.members.map((m) => `- **${m.handle}**: ${m.task}`).join('\n')}\n`, 'agent:manager', 'The report of the bridge', 'run-manager-1');
        system(id, 'changed', `The manager wrote the report: [${p}](${p})`);
      }, 3000);
    }
  } else if (body.state === 'open' && b.state !== 'open') {
    b.state = 'open';
    b.closedAt = null;
    system(id, 'reopened', `${c.person.name.toLowerCase()} opened the bridge again.`);
  } else if (body.delegation || body.caps || body.title !== undefined) {
    system(id, 'changed', `${c.person.name.toLowerCase()} changed the settings of the bridge.`);
  }
  return record(b, c.person.subject);
});
on('PUT', '/v1/bridges/([^/]+)/read', async (c, id) => {
  bridgeOr404(id);
  const body = await readJson(c.req);
  const seq = Number(body.seq);
  if (!Number.isInteger(seq) || seq < 0) refuse(400, 'seq must be a whole number');
  const key = id + '|' + c.person.subject;
  S.reads.set(key, Math.max(S.reads.get(key) || 0, seq));
  c.status = 204;
  return undefined;
});
on('GET', '/v1/bridges/([^/]+)/messages', (c, id) => {
  bridgeOr404(id);
  return messagesPage(id, c.url.searchParams);
});
on('POST', '/v1/bridges/([^/]+)/messages', async (c, id) => {
  const b = bridgeOr404(id);
  if (b.state !== 'open') refuse(409, 'the bridge is closed, so it takes no message');
  const body = await readJson(c.req);
  for (const k of Object.keys(body)) if (!['text', 'to', 'replyTo', 'pinned', 'skill'].includes(k)) refuse(400, `json: unknown field "${k}"`);
  const skill = body.skill && typeof body.skill === 'object' ? { name: String(body.skill.name || ''), ...(body.skill.args ? { args: String(body.skill.args) } : {}) } : null;
  if (body.skill !== undefined && (!skill || !skill.name)) refuse(400, 'a slash command names a skill');
  // A slash command can come without a text: the skill and its arguments say it.
  const text = String(body.text || '').trim() || (skill ? '/' + skill.name + (skill.args ? ' ' + skill.args : '') : '');
  if (!text) refuse(400, 'a message needs a text');
  const to = Array.isArray(body.to) ? body.to.map(String) : [];
  if (to.includes('operator')) refuse(400, 'a person does not address the operator; the operator reads the channel');
  for (const h of to) {
    const m = b.members.find((x) => x.handle === h);
    if (!m) refuse(400, `no member ${h} in this bridge`);
    if (m.fired) refuse(400, `${h} is fired and gets no message`);
  }
  const ch = S.channels.get(id);
  if (body.replyTo != null && !ch.some((e) => e.seq === Number(body.replyTo))) refuse(400, `no entry ${body.replyTo} to reply to`);
  const e = post(id, { kind: 'person', name: c.person.subject, display: c.person.name }, text, { to, replyTo: body.replyTo != null ? Number(body.replyTo) : null, pinned: !!body.pinned || !!skill, ...(skill ? { skill } : {}) });
  S.reads.set(id + '|' + c.person.subject, e.seq);
  fanOut(id, e);
  c.status = 201;
  return e;
});
on('POST', '/v1/bridges/([^/]+)/messages/(\\d+)/reactions', async (c, id, seqText) => {
  bridgeOr404(id);
  const e = S.channels.get(id).find((x) => x.seq === Number(seqText));
  if (!e) refuse(404, `no entry ${seqText} in the bridge ${id}`);
  const body = await readJson(c.req);
  if (!['up', 'down', 'heart'].includes(body.reaction)) refuse(400, 'reaction must be up, down, or heart');
  if (body.note && String(body.note).length > 1024) refuse(400, 'a note holds at most 1 KB');
  const list = (e.reactions[body.reaction] = e.reactions[body.reaction] || []);
  if (!list.includes(c.person.subject)) {
    list.push(c.person.subject);
    if (body.reaction === 'heart') heart(id, e, c.person, body.note ? String(body.note) : '');
    if (e.mirrors) {
      const r = S.runs.get(e.mirrors.run);
      if (r && r.reactions) {
        r.reactions[body.reaction] = (r.reactions[body.reaction] || 0) + 1;
        publish('run', r);
      }
    }
    republish(id, e);
  }
  return e;
});
on('POST', '/v1/bridges/([^/]+)/members', async (c, id) => {
  const b = bridgeOr404(id);
  if (b.state !== 'open') refuse(409, 'the bridge is closed');
  const body = await readJson(c.req);
  if (b.members.some((m) => m.handle === body.handle)) refuse(409, `the handle ${body.handle} is taken in this bridge`);
  const m = seat(id, body, c.person.subject);
  b.members.push(m);
  publish('bridge.member', { bridge: id, member: m });
  system(id, 'joined', `${c.person.name.toLowerCase()} added ${m.handle}: ${m.task}`, { mirrors: { run: m.runs[0], seq: 1, type: 'fw.run.queued' } });
  setTimeout(() => {
    post(id, { kind: 'agent', handle: m.handle, run: m.runs[0] }, 'Hello. I read the channel and start on my task.');
    setMember(id, m, { presence: 'idle', activity: null });
  }, 3000);
  c.status = 201;
  return m;
});
on('DELETE', '/v1/bridges/([^/]+)/members/([^/]+)', (c, id, handle) => {
  const b = bridgeOr404(id);
  const m = memberOf(b, decodeURIComponent(handle));
  if (m.fired) return m;
  for (const rid of m.runs) {
    const r = S.runs.get(rid);
    if (r && !['completed', 'failed', 'canceled'].includes(r.state)) {
      Object.assign(r, { state: 'canceled', pending: null, activity: null, updatedAt: now() });
      publish('run', r);
    }
  }
  setMember(id, m, { fired: true, muted: true, presence: 'fired', activity: null });
  dropCards(id, m.runs, 'the seat was fired, so the run stopped waiting.');
  system(id, 'fired', `${c.person.name.toLowerCase()} fired ${m.handle}. Its Task stays in its pool.`);
  return m;
});
on('PATCH', '/v1/bridges/([^/]+)/members/([^/]+)', async (c, id, handle) => {
  const b = bridgeOr404(id);
  const m = memberOf(b, decodeURIComponent(handle));
  const body = await readJson(c.req);
  const patch = {};
  if (typeof body.muted === 'boolean') patch.muted = body.muted;
  if (typeof body.task === 'string') {
    if (!body.task.trim()) refuse(400, 'a task needs words');
    patch.task = body.task.trim();
  }
  if ('task' in patch) {
    // A new task seats the member again: a new run starts with the task.
    if (m.fired) refuse(409, `${m.handle} is fired`);
    const run = newRun(m.agent, m.handle, id, patch.task, c.person.subject);
    patch.runs = [...m.runs, run.id];
    patch.presence = 'working';
    patch.activity = run.activity;
  }
  setMember(id, m, patch);
  if ('muted' in patch) system(id, 'muted', `${c.person.name.toLowerCase()} ${patch.muted ? 'muted' : 'unmuted'} ${m.handle}.`);
  if ('task' in patch) {
    system(id, 'task', `${m.handle} has a new task: ${patch.task}`, { mirrors: { run: patch.runs[patch.runs.length - 1], seq: 1, type: 'fw.run.queued' } });
    setTimeout(() => {
      post(id, { kind: 'agent', handle: m.handle, run: m.runs[m.runs.length - 1] }, 'I read the channel and start on my new task.');
      setMember(id, m, { presence: 'idle', activity: null });
    }, 3000);
  }
  return m;
});

on('GET', '/v1/fleet', () => FLEET);
// An agent of the view carries the parts of its profile that the page shows: the tools, the skills that it allows, and its rules.
on('GET', '/v1/agents', () => ({ agents: AGENTS.map(({ name, description, role }) => ({ name, description, role, tools: TOOLS_OF[name] || [], skills: allowlistOf(name), policy: name === 'migrator' ? { ask: ['bash: git push*'] } : name === 'reviewer' ? { ask: ['destructive'] } : undefined })) }));

const runOr404 = (id) => {
  const r = S.runs.get(id);
  if (!r) refuse(404, `no run ${id}`);
  return r;
};
// A run starts on any member of the fleet whose agents hold the agent of the body.
on('POST', '/v1/runs', async (c) => {
  const member = c.url.searchParams.get('member') || '';
  const body = await readJson(c.req);
  const agent = String(body.agent || '');
  const fm = FLEET.members.find((m) => m.name === member);
  if (!fm) refuse(400, `no fleet member ${member}`);
  if (!agent || !fm.agents.some((a) => a.name === agent)) refuse(400, `the fleet member ${member} runs no agent ${agent || '""'}`);
  const input = String(body.input || '').trim();
  if (!input) refuse(400, 'a run needs an input');
  const id = 'run-' + agent + '-' + Date.now().toString(36);
  const run = { id, agent, title: input.slice(0, 80), state: 'queued', input, seq: 1, origin: 'http', principal: c.person.subject, createdAt: now(), updatedAt: now(), member, usage: { turns: 0, costUSD: 0 } };
  S.runs.set(id, run);
  S.transcripts.set(id, [{ seq: 1, time: now(), kind: 'user', text: input, who: c.person.subject }]);
  S.results.set(id, { runId: id, title: run.title, agent: run.agent, status: 'working', started: run.createdAt, changed: run.updatedAt, next: [] });
  publish('run', run);
  managerTurn(run, true);
  c.status = 201;
  return run;
});
on('GET', '/v1/runs/([^/]+)', (c, id) => runOr404(id));
on('GET', '/v1/runs/([^/]+)/result', (c, id) => {
  const r = runOr404(id);
  return { ...S.results.get(id), status: r.state === 'input-required' ? 'needs-you' : S.results.get(id).status };
});
on('GET', '/v1/runs/([^/]+)/transcript', (c, id) => {
  const run = runOr404(id);
  const items = S.transcripts.get(id) || [];
  const q = c.url.searchParams;
  const limit = Math.min(Math.max(Number(q.get('limit')) || 200, 1), 1000);
  if (q.get('from') && q.get('before')) refuse(400, 'from and before together are not allowed');
  let list;
  let next = 0;
  if (q.get('from')) {
    const rest = items.filter((x) => x.seq >= Number(q.get('from')));
    list = rest.slice(0, limit);
    if (rest.length > limit) next = rest[limit].seq;
  } else {
    const b = Number(q.get('before')) || 0;
    list = (b ? items.filter((x) => x.seq < b) : items).slice(-limit);
    if (b) next = b;
  }
  const prev = list.length && items.length && list[0].seq > items[0].seq ? list[0].seq : 0;
  return { run, items: list, next, prev };
});
on('GET', '/v1/runs/([^/]+)/files/(.+)', (c, id, p) => {
  runOr404(id);
  const f = S.files.get(id + '|' + decodeURIComponent(p));
  if (!f) refuse(404, `the run ${id} changed no file ${decodeURIComponent(p)}`);
  return f;
});
on('POST', '/v1/runs/([^/]+)/messages', async (c, id) => {
  const run = runOr404(id);
  const body = await readJson(c.req);
  const content = String(body.content || '').trim();
  if (!content) refuse(400, 'a message needs content');
  if (run.state === 'failed' || run.state === 'canceled') refuse(409, `the run ${id} ${run.state === 'failed' ? 'failed' : 'was canceled'}, so it takes no message`);
  const items = S.transcripts.get(id);
  const seq = items[items.length - 1].seq + 1;
  items.push({ seq, time: now(), kind: 'user', text: content, who: c.person.subject });
  Object.assign(run, { state: 'running', seq, updatedAt: now() });
  publish('run', run);
  if (!run.metadata || !run.metadata['fw.bridge.member']) managerTurn(run, false);
  c.status = 202;
  return { run: id, seq };
});
on('POST', '/v1/runs/([^/]+)/approvals/([^/]+)', async (c, id, ap) => decide(id, decodeURIComponent(ap), await readJson(c.req), c.person));
on('POST', '/v1/runs/([^/]+)/approvals/([^/]+)/rule', async (c, id, ap) => {
  const run = runOr404(id);
  if (!run.pending || run.pending.id !== decodeURIComponent(ap)) refuse(409, `the run ${id} does not wait for the approval ${ap}`);
  const rule = { rule: run.pending.tool, agent: run.agent, run: id, by: c.person.subject, at: now() };
  S.rules.push(rule);
  return rule;
});
on('POST', '/v1/runs/([^/]+)/cancel', (c, id) => {
  const run = runOr404(id);
  if (['completed', 'failed', 'canceled'].includes(run.state)) refuse(409, `the run ${id} already ended`);
  Object.assign(run, { state: 'canceled', pending: null, activity: null, updatedAt: now() });
  publish('run', run);
  for (const [bid, b] of S.bridges) {
    const m = b.members.find((x) => x.runs.includes(id));
    if (m) {
      setMember(bid, m, { presence: 'idle', activity: null });
      dropCards(bid, [id], 'the run was canceled, so it stopped waiting.');
      system(bid, 'canceled', `${c.person.name.toLowerCase()} stopped the run of ${m.handle}.`);
    }
  }
  return run;
});
on('POST', '/v1/runs/([^/]+)/reactions', async (c, id) => {
  const run = runOr404(id);
  const body = await readJson(c.req);
  if (!['up', 'down', 'heart'].includes(body.reaction)) refuse(400, 'reaction must be up, down, or heart');
  const seq = Number(body.seq || 0);
  const items = S.transcripts.get(id) || [];
  if (seq !== 0 && !items.some((x) => x.seq === seq)) refuse(400, `the run ${id} has no event ${seq}`);
  if (body.note && String(body.note).length > 1024) refuse(400, 'a note holds at most 1 KB');
  run.reactions = run.reactions || { up: 0, down: 0, heart: 0 };
  run.reactions[body.reaction] = (run.reactions[body.reaction] || 0) + 1;
  // The reaction is one more event of the run, so its seq grows.
  run.seq += 1;
  run.updatedAt = now();
  publish('run', run);
  return run;
});

on('GET', '/v1/pages', () => ({ pages: [...S.pages.values()].filter(live).map((p) => pageMeta(p)).sort((a, b) => (a.path < b.path ? -1 : 1)) }));
on('GET', '/v1/pages/search', (c) => {
  const q = String(c.url.searchParams.get('q') || '').trim().toLowerCase();
  if (!q) return { q, results: [], read: 0, unread: 0, cut: false };
  const words = q.split(/\s+/);
  const results = [];
  let read = 0;
  for (const p of S.pages.values()) {
    const v = live(p);
    if (!v) continue;
    read++;
    const meta = pageMeta(p);
    const hay = (p.path + '\n' + meta.title + '\n' + v.text).toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    // A word in the path or the title weighs more than a word in the text.
    const score = words.reduce((n, w) => n + (p.path.toLowerCase().includes(w) ? 3 : 0) + (meta.title.toLowerCase().includes(w) ? 2 : 0) + (v.text.toLowerCase().split(w).length - 1), 0);
    const at = v.text.toLowerCase().indexOf(words[0]);
    const snippet = at >= 0 ? v.text.slice(Math.max(0, at - 40), at + 80).replace(/\s+/g, ' ') : meta.title;
    results.push({ path: p.path, title: meta.title, snippet, version: v.version, score });
  }
  results.sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : 1));
  return { q, results, read, unread: 0, cut: false };
});
on('GET', '/v1/pages/(.+)/history', (c, p) => {
  const path = decodeURIComponent(p);
  checkPath(path);
  const page = S.pages.get(path);
  if (!page) refuse(404, `no page ${path}`);
  return {
    path,
    versions: [...page.versions].reverse().map((v) =>
      v.deleted
        ? { version: v.version, hash: '', by: '', at: v.at, summary: '', size: 0, deleted: true }
        : { version: v.version, hash: v.hash, by: v.by, at: v.at, summary: v.summary, size: Buffer.byteLength(v.text), title: titleOf(v.text, path), ...(v.run ? { run: v.run } : {}) },
    ),
  };
});
on('GET', '/v1/pages/(.+)', (c, p) => {
  const path = decodeURIComponent(p);
  checkPath(path);
  const page = S.pages.get(path);
  if (!page) refuse(404, `no page ${path}`);
  const v = c.url.searchParams.get('version');
  const body = pageBody(page, v ? Number(v) : 0);
  c.headers.ETag = '"' + body.hash + '"';
  if ((c.req.headers.accept || '').startsWith('text/markdown')) {
    c.headers['Content-Type'] = 'text/markdown; charset=utf-8';
    return body.text;
  }
  return body;
});
on('PUT', '/v1/pages/(.+)', async (c, p) => {
  const path = decodeURIComponent(p);
  checkWritable(path);
  const body = await readJson(c.req);
  if (typeof body.text !== 'string') refuse(400, 'a page needs a text');
  if (Buffer.byteLength(body.text) > 262144) refuse(413, 'a page holds at most 256 KB');
  const cur = live(S.pages.get(path));
  const ifMatch = String(c.req.headers['if-match'] || '').replace(/^W\//, '').replace(/"/g, '');
  const ifNone = c.req.headers['if-none-match'];
  const etag = cur ? { ETag: '"' + cur.hash + '"' } : {};
  if (ifNone === '*' && cur) refuse(412, `the page ${path} exists already`, { hash: cur.hash }, etag);
  if (ifMatch && (!cur || ifMatch !== cur.hash)) refuse(412, `the page ${path} changed since you read it`, cur ? { hash: cur.hash } : {}, etag);
  const out = writePage(path, body.text, c.person.subject, body.summary);
  const res = pageBody(out.page, 0);
  c.headers.ETag = '"' + res.hash + '"';
  c.status = out.changed && !cur ? 201 : 200;
  return res;
});
on('DELETE', '/v1/pages/(.+)', (c, p) => {
  const path = decodeURIComponent(p);
  checkWritable(path);
  const page = S.pages.get(path);
  if (!live(page)) refuse(404, `no page ${path}`);
  page.versions.push({ version: ++wiki.rev, deleted: true, at: now() });
  publish('page', { path, title: '', hash: '', by: c.person.subject, at: now(), size: 0, deleted: true });
  c.status = 204;
  return undefined;
});

on('GET', '/v1/faces', () => ({ faces: AGENTS.map((a) => faceMeta(faceOf(a.name))) }));
on('GET', '/v1/faces/([^/]+)', (c, a) => {
  const agent = decodeURIComponent(a);
  // An agent that the caller cannot see, or that the fake does not know, gets the identicon.
  const f = S.faces.get(agent) || { svg: identicon(agent), hash: hash(identicon(agent)) };
  const etag = '"' + f.hash + '"';
  if (c.req.headers['if-none-match'] === etag) {
    c.status = 304;
    c.headers.ETag = etag;
    return '';
  }
  c.headers['Content-Type'] = 'image/svg+xml';
  c.headers.ETag = etag;
  c.headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return f.svg;
});
on('PUT', '/v1/faces/([^/]+)', async (c, a) => {
  const f = faceOf(decodeURIComponent(a));
  const raw = await readBody(c.req, 1024 * 1024);
  if (Buffer.byteLength(raw) > 32 * 1024) refuse(413, 'a face holds at most 32 KB');
  const why = checkSvg(raw);
  if (why) refuse(422, why);
  Object.assign(f, { svg: raw, custom: true, hash: hash(raw + f.displayName + f.tagline) });
  stamp(f, c.person);
  publish('face', faceMeta(f));
  return faceMeta(f);
});
on('PATCH', '/v1/faces/([^/]+)', async (c, a) => {
  const f = faceOf(decodeURIComponent(a));
  const body = await readJson(c.req);
  if (body.displayName !== undefined) {
    if ([...String(body.displayName)].length > 64) refuse(400, 'a display name holds at most 64 characters');
    f.displayName = String(body.displayName);
  }
  if (body.tagline !== undefined) {
    if ([...String(body.tagline)].length > 140) refuse(400, 'a tagline holds at most 140 characters');
    f.tagline = String(body.tagline);
  }
  f.hash = hash(f.svg + f.displayName + f.tagline);
  stamp(f, c.person);
  publish('face', faceMeta(f));
  return faceMeta(f);
});
on('DELETE', '/v1/faces/([^/]+)', (c, a) => {
  const f = faceOf(decodeURIComponent(a));
  const svg = identicon(f.agent);
  Object.assign(f, { svg, custom: false, hash: hash(svg + f.displayName + f.tagline) });
  stamp(f, c.person);
  publish('face', faceMeta(f));
  return faceMeta(f);
});

/* ---------- the sign-in stub and the static page ---------- */

/** safeNext keeps a return address on this origin under /bossmode, else /bossmode/. */
function safeNext(next) {
  const n = String(next || '');
  if (n.startsWith('#')) return '/bossmode/' + n;
  if (/^\/bossmode(\/|$)/.test(n) && !/[\u0000-\u001f\\]/.test(n)) return n;
  return '/bossmode/';
}

function signinStub(req, res, url) {
  const next = safeNext(url.searchParams.get('next'));
  const who = /^[a-z]{1,20}$/.test(url.searchParams.get('as') || '') ? url.searchParams.get('as') : 'alice';
  const html = `<!doctype html><meta charset="utf-8"><title>Fake sign-in</title>
<p>The fake server signs you in as ${who}@example.com.</p>
<script>sessionStorage.setItem('fw.token', ${JSON.stringify('fake-' + who)}); location.replace(${JSON.stringify(next)});</script>`;
  send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8' });
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png' };

/** The content security policy that the page needs. docs/CONTRACT.md names it. */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function serveStatic(req, res, url) {
  if (!fs.existsSync(DIST)) {
    send(res, 404, 'Build the page first with `npm run build`, or run `npm run dev` and open http://localhost:5173/bossmode/.', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  if (url.pathname === '/bossmode') {
    res.writeHead(301, { Location: '/bossmode/' });
    res.end();
    return;
  }
  const rel = decodeURIComponent(url.pathname.slice('/bossmode/'.length)) || 'index.html';
  const file = path.resolve(DIST, rel);
  const inside = file === DIST || file.startsWith(DIST + path.sep);
  const target = inside && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html');
  const type = TYPES[path.extname(target)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': target.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600' });
  fs.createReadStream(target).pipe(res);
}

/* ---------- the server ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/ui/signin' && req.method === 'GET') return signinStub(req, res, url);
    if (url.pathname === '/ui' || url.pathname === '/ui/') {
      return send(res, 200, '<!doctype html><meta charset="utf-8"><title>Fake /ui</title><p>This is the fake server of bossmode. The page at /ui is not here. Open <a href="/bossmode/">/bossmode/</a>.</p>', { 'Content-Type': 'text/html; charset=utf-8' });
    }
    if (url.pathname === '/bossmode' || url.pathname.startsWith('/bossmode/')) return serveStatic(req, res, url);
    if (!url.pathname.startsWith('/v1/')) return problem(res, 404, `no route ${url.pathname}`);
    const route = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!route) {
      const any = routes.some((r) => r.re.test(url.pathname));
      return problem(res, any ? 405 : 404, any ? `the route ${url.pathname} takes no ${req.method}` : `no route ${url.pathname}`);
    }
    const person = personOf(req);
    if (!person) return problem(res, 401, 'the request has no valid bearer token', SIGNIN ? { signin: '/ui/signin' } : {});
    const c = { req, res, url, person, status: 200, headers: {} };
    const args = route.re.exec(url.pathname).slice(1);
    const out = await route.h(c, ...args);
    if (out === undefined && res.headersSent) return;
    if (c.status === 204 || c.status === 304) {
      res.writeHead(c.status, c.headers);
      return res.end();
    }
    if (typeof out === 'string') return send(res, c.status, out, c.headers);
    send(res, c.status, out, c.headers);
  } catch (e) {
    if (e instanceof Refusal) return problem(res, e.status, e.message, e.extra, e.headers);
    console.error(e);
    if (!res.headersSent) problem(res, 500, 'the fake server failed: ' + e.message);
  }
});

/* ---------- the timers ---------- */

const CHATTER = [
  ['migrator-1', 'logrotate has one template. I port it now, with the same handler style as nginx.'],
  ['reviewer', 'While I wait for nginx, I read the style guide again. Handler names start with a verb.'],
  ['migrator-1', '`ansible-lint roles/logrotate` passes with no warning.'],
  ['tester', 'I can run molecule for logrotate when the role has a converge playbook.'],
  ['migrator-1', 'The converge playbook is at `roles/logrotate/molecule/default/converge.yml`.'],
  ['reviewer', '@migrator-1 the `rotate` count defaults to 7 in Puppet. Keep 7.'],
];
let chatN = 0;
let moveN = 0;

/** taskPhase moves a Task of the fleet view and sends the task and member events. */
function taskPhase(name, phase) {
  const member = 'default/' + name;
  const state = phase === 'Running' ? 'live' : 'suspended';
  for (const pool of FLEET.pools) {
    for (const t of pool.tasks) {
      if (t.name !== name) continue;
      t.phase = phase;
      if (phase === 'Running') delete t.note;
      else t.note = 'Asleep. A request wakes it.';
    }
  }
  for (const m of FLEET.members) if (m.name === member) Object.assign(m, { state, lastSeen: now() });
  publish('task', { kind: 'task', member, phase, time: now() });
  publish('member', { kind: 'member', member, state, time: now() });
}

function tick() {
  const b = S.bridges.get('br-puppet');
  if (!b || b.state !== 'open') return;
  const step = moveN++ % 4;
  const m1 = b.members.find((m) => m.handle === 'migrator-1');
  const tester = b.members.find((m) => m.handle === 'tester');
  // A member moves between presences.
  if (m1 && !m1.fired) {
    const phrases = ['Ran "ansible-lint roles/logrotate"', 'Edited roles/logrotate/tasks/main.yml', 'Read modules/logrotate/manifests/init.pp', 'Ran "molecule converge"'];
    if (step % 2 === 0) setMember(b.id, m1, { presence: 'working', activity: { turn: 7 + moveN, tool: 'bash', phrase: phrases[moveN % phrases.length], since: now() } });
    else setMember(b.id, m1, { presence: 'idle', activity: null });
  }
  if (tester && !tester.fired) {
    if (step === 0) {
      taskPhase('crew-2', 'Running');
      system(b.id, 'started', 'tester woke up.');
      setMember(b.id, tester, { presence: 'working', activity: { turn: 3, tool: 'bash', phrase: 'Ran "molecule test"', since: now() } });
    } else if (step === 2) setMember(b.id, tester, { presence: 'idle', activity: null });
    else if (step === 3) {
      setMember(b.id, tester, { presence: 'asleep', activity: null });
      taskPhase('crew-2', 'Suspended');
      system(b.id, 'asleep', 'tester went to sleep.');
    }
  }
  // A member posts a message.
  const [handle, text] = CHATTER[chatN++ % CHATTER.length];
  const m = b.members.find((x) => x.handle === handle);
  if (m && !m.fired) post(b.id, { kind: 'agent', handle, run: m.runs[m.runs.length - 1] }, text, { to: (text.match(/@([a-z0-9-]+)/g) || []).map((x) => x.slice(1)) });
}

// The routes of the next stage. Each screen of docs/DESIGN.md, section 11,
// adds its routes in its own file, so two screens never edit one file.
// skills.mjs serves the Skills place.
for (const name of ['skills.mjs', 'routes-a.mjs', 'routes-b.mjs', 'routes-c.mjs']) {
  const mod = await import('./' + name);
  mod.register({ on, refuse, readJson, readBody, publish, S, now, AGENTS, FLEET, admin: () => ADMIN });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`The fake server of bossmode listens on http://127.0.0.1:${PORT}. It is for development only.`);
  console.log(SIGNIN ? 'A 401 names /ui/signin, which signs you in as alice.' : 'A 401 names no sign-in route. Paste the token fake-alice.');
  if (!QUIET) setInterval(tick, TICK);
});
