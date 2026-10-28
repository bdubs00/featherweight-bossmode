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
//   FAKE_ADMIN=1       whoami says that the person is an admin, who can add and remove skills and pause every duty
//   FAKE_A=1           the sample data shows each state of the bridges screen (routes-a.mjs)
//   FAKE_LIVE=1        GET /v1/runs/{id}/live streams each answer outside a bridge in pieces, as the model writes it
//   FAKE_LIVE_MS=120   the time between two pieces of a live answer, in milliseconds
//   FAKE_LIVE_HOLD=1   a live answer stops near its middle and waits there, for a screenshot
//   FAKE_ASLEEP=1      every worker of the fleet sleeps, as a fleet at night with no worker awake
//   FAKE_ASK=<tool>    the manager waits for a decision on one call: bridge_open, pages_write, spawn_task, create_issue, or env
//   FAKE_PACKAGES=0    the settings say that the deployment has no package mirror, so no profile shows Packages
//   FAKE_WORK=0        the settings name no work, so the page shows no Work and no Results, and every place of the app bar
//
// The token fake-erin signs in erin, a sponsor who views every agent: her
// roles are viewer, she can create no agent, and the wiki refuses her, as
// a real front does.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTS, FLEET, WHOLE, hash, seed, wiki } from './data.mjs';
import { checkSvg, identicon } from './faces.mjs';
import { TEMPLATES } from './routes-c.mjs';
import { TOOLS_OF, allowlistOf, givesTool } from './skills.mjs';
import { ARCHIVED_REFUSAL } from './archive.mjs';
import { foundLine } from './routes-work.mjs';

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
const LIVE = process.env.FAKE_LIVE === '1';
const LIVE_MS = Number(process.env.FAKE_LIVE_MS || 120);
const LIVE_HOLD = process.env.FAKE_LIVE_HOLD === '1';
const PACKAGES = process.env.FAKE_PACKAGES !== '0';

const S = seed(process.env.FAKE_ASK || '');

// A fleet at night: every worker sleeps, so the page shows no worker awake.
if (process.env.FAKE_ASLEEP === '1') {
  for (const p of FLEET.pools) for (const t of p.tasks) t.phase = 'Suspended';
  for (const m of FLEET.members) if (!m.self) m.state = 'quiet';
}

/** The logo of the organization of the theme, with FAKE_LOGO=1. */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44"><title>Example Org</title><rect width="44" height="44" fill="#111"/><path d="M10 12h24v5H16v3h14v5H16v3h18v5H10z" fill="#f3f3ef"/></svg>`;
const now = () => new Date().toISOString();
const MANAGER_MEMBER = 'default/manager-0';
/** The agent of the quick chat, on the Task of the manager, as the example of the workbench sets it up. */
const CHAT_AGENT = 'chat';

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

/** viewerOf reports whether a person only views the agents: erin, the sponsor. */
const viewerOf = (person) => !!person && person.subject === 'erin@example.com';


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

async function readJson(req, max) {
  const raw = await readBody(req, max);
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

/* ---------- the files of a message ---------- */

// A body with files holds 32 MiB of bytes in base64 and 1 MB more, as
// native.MaxFilesBodyBytes of the kernel.
const FILE_BODY_BYTES = Math.floor((32 * 1024 * 1024) / 3) * 4 + 1024 * 1024;

/** uploadedFiles checks the files of a body as the front does, and decodes them. */
function uploadedFiles(body) {
  const files = body.files === undefined || body.files === null ? [] : body.files;
  if (!Array.isArray(files)) refuse(400, 'json: cannot unmarshal files');
  if (files.length > 20) refuse(400, 'a message holds at most 20 files');
  let total = 0;
  return files.map((f) => {
    const name = f && typeof f.name === 'string' ? f.name : '';
    if (!name.trim() || name === '.' || name === '..' || Buffer.byteLength(name) > 255 || /[\/\\\u0000-\u001f\u007f]/.test(name)) refuse(400, 'a file needs a name of at most 255 bytes, without a path or a control character');
    if (typeof f.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data)) refuse(400, 'illegal base64 data');
    const data = Buffer.from(f.data, 'base64');
    if (!data.length) refuse(400, `the file "${name}" is empty`);
    total += data.length;
    if (total > 32 * 1024 * 1024) refuse(413, 'the files of a message hold at most 32 MiB together');
    const text = data.toString('utf8');
    const mediaType = !text.includes('\0') && Buffer.from(text).equals(data) ? 'text/plain' : 'application/octet-stream';
    return { name, size: data.length, mediaType };
  });
}

/** attachedOf is the file blocks of a user item of a transcript, as the kernel keeps them under attachments/. */
const attachedOf = (files) => files.map((f) => ({ ...f, path: 'attachments/' + f.name }));

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
 * an entry with a decision goes out cut, as the backend sends a large card:
 * without the input and the schema of the decision, and partial set beside
 * the entry. The page reads the entry again with ?from=<seq>&limit=1.
 */
function wire(ev) {
  if (!PARTIAL || ev.kind !== 'bridge.message' || !ev.data || !ev.data.message || !ev.data.message.decision) return ev.data;
  const { input: _i, schema: _s, ...decision } = ev.data.message.decision;
  return { bridge: ev.data.bridge, message: { ...ev.data.message, decision }, partial: true };
}

/**
 * pageBuild is the build of the page in dist/, from the element that the
 * build writes into index.html, or "" without a build. It reads the file at
 * each stream, as the workbench reads a directory, so a new build counts at
 * the next stream.
 */
function pageBuild() {
  try {
    const m = /<meta\s+name="bossmode-build"\s+content="([A-Za-z0-9._-]{1,64})"\s*\/?>/.exec(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

function stream(req, res) {
  const head = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' };
  const build = pageBuild();
  if (build) head['Fw-Page-Build'] = build;
  res.writeHead(200, head);
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
    ...(ch.length ? { lastAt: ch[ch.length - 1].at } : {}),
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
  // The channel keeps the whole text of a cut entry, up to 64 KB, for GET /v1/bridges/{id}/messages/{seq}.
  if (String(text).length > 4096) {
    e.cut = true;
    WHOLE.set(e, String(text).slice(0, 65536));
  }
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

/**
 * moveSeat changes the presence of a seat and the state of its newest run
 * together, as the backend does. The page derives the status of a seat
 * from its run and the phase of its worker, so a presence that moves alone
 * shows nothing. A run that failed, stopped, or waits for a decision stays.
 */
function moveSeat(bridgeId, m, presence, activity) {
  const run = S.runs.get(m.runs[m.runs.length - 1]);
  const state = presence === 'working' ? 'running' : presence === 'idle' || presence === 'asleep' ? 'completed' : '';
  if (run && state && run.state !== state && !['failed', 'canceled', 'input-required'].includes(run.state)) {
    Object.assign(run, { state, activity: state === 'running' ? activity : null, updatedAt: now(), seq: run.seq + 1 });
    publish('run', run);
  }
  setMember(bridgeId, m, { presence, activity });
}

/** workerOfSeat names the worker that holds the newest run of a seat, such as crew-2, or "". */
function workerOfSeat(m) {
  const run = S.runs.get(m.runs[m.runs.length - 1]);
  return run && run.member ? run.member.slice(run.member.lastIndexOf('/') + 1) : '';
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

/**
 * filesReach refuses files that cannot reach every member that a message
 * reaches, in the words of the front: the channel keeps no bytes for a
 * later run.
 */
function filesReach(b, to) {
  const targets = b.members.filter((m) => !m.fired && (to.length ? to.includes(m.handle) : !m.muted));
  if (!targets.length) refuse(409, 'the message reaches no member, so its files have nowhere to go: address a member');
  const waiting = targets.filter((m) => !m.runs.length).map((m) => m.handle);
  const failed = targets.filter((m) => m.runs.length && stoppedRun(m) === 'failed').map((m) => m.handle);
  const and = (hs) => (hs.length < 3 ? hs.join(' and ') : hs.slice(0, -1).join(', ') + ', and ' + hs[hs.length - 1]);
  if (waiting.length === 1) refuse(409, `files go only to a member with a run, and ${waiting[0]} has none yet: send them once it works, or address another member`);
  if (waiting.length > 1) refuse(409, `files go only to a member with a run, and ${and(waiting)} have none yet: send them once they work, or address other members`);
  if (failed.length === 1) refuse(409, `files go only to a run that takes messages, and the run of ${failed[0]} failed: give it a new task, or address another member`);
  if (failed.length > 1) refuse(409, `files go only to a run that takes messages, and the runs of ${and(failed)} failed: give them new tasks, or address other members`);
}

/** seatFiles puts the message with its files into the transcript of the run of each member that gets it. */
function seatFiles(b, e, files) {
  for (const m of b.members.filter((x) => !x.fired && (e.to.length ? e.to.includes(x.handle) : !x.muted))) {
    const items = S.transcripts.get(m.runs[m.runs.length - 1]);
    if (!items) continue;
    const seq = items.length ? items[items.length - 1].seq + 1 : 1;
    items.push({ seq, time: now(), kind: 'user', text: e.text, who: e.from.name, files: attachedOf(files) });
  }
}

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
      if (wasAsleep) {
        const w = workerOfSeat(m);
        if (w) taskPhase(w, 'Running');
        system(bridgeId, 'started', `${m.handle} woke up.`);
      }
      moveSeat(bridgeId, m, 'working', { turn: 1, phrase: 'Read the message of ' + e.from.display, since: now() });
    }, 600 + i * 400);
    setTimeout(() => {
      if (m.fired) return;
      post(bridgeId, { kind: 'agent', handle: m.handle, run: m.runs[m.runs.length - 1] }, REPLIES[replyN++ % REPLIES.length], { replyTo: e.seq });
      moveSeat(bridgeId, m, 'idle', null);
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
  // packages.mjs adds the package of an allowed call of env to the list of its pool.
  for (const f of S.decided || []) f(run, pending, decision, person);
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
    // The line says what the backend says (decidedText of the bridges of the workbench).
    const note = body.note ? ', with the note: ' + body.note : '';
    const line = question
      ? decision === 'allow' ? `${person.name.toLowerCase()} answered the question of ${who}: ${words}.` : `${person.name.toLowerCase()} declined the question of ${who}${note}.`
      : `${person.name.toLowerCase()} ${decision === 'allow' ? 'allowed' : 'denied'} the call of ${who}${note}.`;
    system(bid, 'decided', line, { mirrors: { run: runId, seq, type: 'fw.approval.decided' } });
    if (m) {
      setMember(bid, m, { presence: 'working', activity: run.activity });
      setTimeout(() => finish(bid, m, run, decision, question, words), 5000);
    }
  }
  if (run.agent === 'manager') setTimeout(() => managerAfter(run, pending, decision, person), 2000);
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

/* ---------- the live answer ---------- */

/** The clients of the live stream of each run, by the id of the run. */
const liveClients = new Map();
const TERMINAL = ['completed', 'failed', 'canceled'];

/** liveWrite sends one event of the live stream of a run to each of its clients. */
function liveWrite(id, kind, data) {
  for (const res of liveClients.get(id) || []) res.write(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** liveIdle tells the clients that the run left the running state, and ends the stream of a run that finished. */
function liveIdle(run) {
  liveWrite(run.id, 'idle', { state: run.state });
  if (TERMINAL.includes(run.state)) for (const res of liveClients.get(run.id) || []) res.end();
}

/**
 * liveText streams a text as the model writes it: a piece of a few words
 * every FAKE_LIVE_MS, then done. With FAKE_LIVE_HOLD=1 it stops near its
 * middle and waits there. A run that stops working ends it.
 */
function liveText(run, turn, text, then) {
  const words = text.match(/\S+\s*/g) || [text];
  const hold = LIVE_HOLD ? Math.ceil(words.length * 0.45) : words.length;
  let i = 0;
  const step = () => {
    if (run.state !== 'running') return;
    if (i >= words.length) {
      liveWrite(run.id, 'done', { turn, stopReason: 'end_turn' });
      then();
      return;
    }
    if (i >= hold) return;
    liveWrite(run.id, 'delta', { turn, text: words.slice(i, i + 3).join('') });
    i += 3;
    setTimeout(step, LIVE_MS);
  };
  step();
}

/* ---------- the manager ---------- */

/**
 * managerAfter ends the call of the manager that waited for a decision: it
 * writes the result of the call, as the front words it, and the answer of
 * the manager. An allowed bridge_open opens the bridge, and the answer
 * names it by its id, as a model does.
 */
function managerAfter(run, pending, decision, person) {
  const items = S.transcripts.get(run.id);
  const callId = (items.find((x) => x.kind === 'ask' && x.id === pending.id) || {}).callId;
  let result = { text: 'Done.' };
  let answer = 'Done. The plan runs now.';
  if (decision !== 'allow') {
    result = { text: 'The person denied the call.', isError: true };
    answer = 'I stopped, as you asked. Tell me what to change.';
  } else if (/bridge_open$/.test(pending.tool || '')) {
    const b = openBridge(pending.input || {}, person);
    const p = `bridges/${b.id}/plan.md`;
    writePage(p, `# ${b.title}\n\n${b.goal}\n\n${b.members.map((m) => `- **${m.handle}**: ${m.task}`).join('\n')}\n`, 'agent:manager', 'The plan of the bridge', run.id);
    result = { text: `Opened the bridge ${b.id} "${b.title}" for ${person.subject} with ${b.members.length} members, placement ${b.placement}. Follow it with bridge_read (bridge ${b.id}).` };
    answer = `The bridge is open: \`${b.id}\`. Each seat has its task, and the plan is in \`${p}\`.`;
  } else if (/pages_write$/.test(pending.tool || '') && pending.input && pending.input.path) {
    writePage(pending.input.path, String(pending.input.text || ''), 'agent:manager', String(pending.input.summary || ''), run.id);
    result = { text: `Wrote ${pending.input.path}.` };
    answer = `The page is in the wiki: ${pending.input.path}.`;
  }
  const seq = items[items.length - 1].seq + 1;
  items.push({ seq, time: now(), kind: 'result', tool: pending.tool, callId, ...result });
  Object.assign(run, { seq, updatedAt: now() });
  managerAnswer(run, answer);
}

function managerAnswer(run, text) {
  const items = S.transcripts.get(run.id);
  const seq = items[items.length - 1].seq + 1;
  items.push({ seq, time: now(), kind: 'assistant', text });
  items.push({ seq: seq + 1, time: now(), kind: 'end', text: 'completed' });
  Object.assign(run, { state: 'completed', output: text, seq: seq + 1, updatedAt: now(), activity: null });
  const res = S.results.get(run.id);
  if (res) Object.assign(res, { status: 'ready', summary: text });
  publish('run', run);
  liveIdle(run);
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

/** The answers of the quick chat. */
const CHAT_ANSWERS = [
  'Logrotate reads `/etc/logrotate.d/nginx` once a day. Keep **14** rotations, compress all but the newest, and send `USR1` to nginx in `postrotate`, so nginx opens its new log without a restart. The role of the migration does the same with one template and one handler.',
  'The freeze starts on Friday at noon. Merge what is green by Thursday, and tag the release on Monday after the checks pass again. A change after noon on Friday needs a second reviewer.',
  'Two things differ. A handler runs once at the end of a play, however many tasks notify it. A task that you list after another runs every time, in order.',
];
let quickN = 0;

/** answerOf is the next answer of an agent outside a bridge. */
function answerOf(run) {
  if (run.agent === 'manager') return MANAGER_ANSWERS[managerN++ % MANAGER_ANSWERS.length];
  if (run.agent === CHAT_AGENT) return CHAT_ANSWERS[quickN++ % CHAT_ANSWERS.length];
  return AGENT_ANSWERS[agentN++ % AGENT_ANSWERS.length];
}

/** spend adds the usage of one turn to a run. */
function spend(run) {
  const u = run.usage || {};
  run.usage = { ...u, inputTokens: (u.inputTokens || 0) + 2140, outputTokens: (u.outputTokens || 0) + 310, turns: (u.turns || 0) + 1, costUSD: Math.round(((u.costUSD || 0) + 0.04) * 100) / 100 };
}

/**
 * managerTurn runs one turn of the manager, or of another agent outside a
 * bridge: it wakes, works, and answers. With FAKE_LIVE=1, the quick chat
 * first recalls its notes, and every answer goes out on the live stream in
 * pieces before it enters the transcript.
 */
function managerTurn(run, first) {
  const wake = first ? 3500 : 800;
  const manager = run.agent === 'manager';
  const chat = run.agent === CHAT_AGENT;
  const text = answerOf(run);
  const turn = ((run.usage && run.usage.turns) || 0) + 1;
  setTimeout(() => {
    const activity = manager ? { turn, tool: 'front.fleet', phrase: 'Read the fleet', since: now() } : chat ? { turn, phrase: 'Thinking in turn ' + turn, since: now() } : { turn, tool: 'files', phrase: 'Read index.md', since: now() };
    Object.assign(run, { state: 'running', updatedAt: now(), activity });
    publish('run', run);
    if (!LIVE) return;
    const answer = (t) => liveText(run, t, text, () => {
      spend(run);
      managerAnswer(run, text);
    });
    if (!chat) return setTimeout(() => answer(turn), 300);
    // The chat calls one tool first: the stream names it, and the model call ends with the tool call.
    setTimeout(() => {
      liveWrite(run.id, 'tool', { turn, name: 'recall', callId: 'call-' + run.seq });
      setTimeout(() => {
        if (run.state !== 'running') return;
        liveWrite(run.id, 'done', { turn, stopReason: 'tool_use' });
        const items = S.transcripts.get(run.id);
        const seq = items[items.length - 1].seq + 1;
        items.push({ seq, time: now(), kind: 'tool', tool: 'recall', callId: 'call-' + seq, input: { query: 'notes of before' } });
        items.push({ seq: seq + 1, time: now(), kind: 'result', tool: 'recall', callId: 'call-' + seq, text: '2 notes' });
        // The model call of the tool counts as a turn of the run.
        spend(run);
        Object.assign(run, { seq: seq + 1, updatedAt: now(), activity: { turn: turn + 1, phrase: 'Thinking in turn ' + (turn + 1), since: now() } });
        publish('run', run);
        setTimeout(() => answer(turn + 1), 400);
      }, 700);
    }, 400);
  }, wake);
  if (LIVE) return;
  setTimeout(() => {
    spend(run);
    managerAnswer(run, text);
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

on('GET', '/v1/whoami', (c) =>
  viewerOf(c.person)
    ? { principal: c.person, roles: Object.fromEntries(AGENTS.map((a) => [a.name, 'viewer'])), admin: false, canCreate: false, teams: [], fleet: 'front-0' }
    : { principal: c.person, roles: Object.fromEntries(AGENTS.map((a) => [a.name, a.role])), admin: ADMIN, canCreate: true, teams: ['team-platform'], fleet: 'front-0' },
);
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
    chat: { agent: CHAT_AGENT, member: MANAGER_MEMBER },
    packages: PACKAGES,
    // The places Work and Results: GET /v1/work, POST /v1/work/plan, and GET /v1/value. FAKE_WORK=0 leaves them out.
    work: process.env.FAKE_WORK !== '0',
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

// A bridge needs its operator or the operator role on every agent of its seats, so erin, who views every agent, sees none.
on('GET', '/v1/bridges', (c) => ({ bridges: [...S.bridges.values()].filter((b) => !viewerOf(c.person) || b.operator === c.person.subject).map((b) => listItem(b, c.person.subject)) }));
/** openBridge opens a bridge from a plan of title, goal, placement, and members, as a person, and seats its members. */
function openBridge(body, person) {
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
    id, title, goal: String(body.goal || ''), operator: person.subject, state: 'open', placement: body.placement === 'spawn' ? 'spawn' : 'queue', createdAt: now(), closedAt: null, manager: null,
    delegation: { approve: false, budget: false, members: false, report: true, ...(body.delegation || {}) },
    caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6, ...(body.caps || {}) },
    members: [],
  };
  if (b.placement === 'spawn') refuse(400, 'a spawn bridge needs a manager, and the fake server seats queue bridges only');
  b.members = members.map((m) => seat(id, m, person.subject));
  S.bridges.set(id, b);
  S.channels.set(id, []);
  system(id, 'opened', `${person.name.toLowerCase()} opened the bridge with ${b.members.length} member${b.members.length === 1 ? '' : 's'}.`);
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
  return b;
}

on('POST', '/v1/bridges', async (c) => {
  const b = openBridge(await readJson(c.req), c.person);
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
  const body = await readJson(c.req, FILE_BODY_BYTES);
  for (const k of Object.keys(body)) if (!['text', 'to', 'replyTo', 'pinned', 'skill', 'files'].includes(k)) refuse(400, `json: unknown field "${k}"`);
  const files = uploadedFiles(body);
  if (files.length && (body.pinned || body.skill)) refuse(400, 'a pinned message and a slash command take no files');
  const skill = body.skill && typeof body.skill === 'object' ? { name: String(body.skill.name || ''), ...(body.skill.args ? { args: String(body.skill.args) } : {}) } : null;
  if (body.skill !== undefined && (!skill || !skill.name)) refuse(400, 'a slash command names a skill');
  // A slash command can come without a text: the skill and its arguments say it.
  const text = String(body.text || '').trim() || (skill ? '/' + skill.name + (skill.args ? ' ' + skill.args : '') : '');
  if (!text && !files.length) refuse(400, 'a message needs a text, a skill, or files');
  const to = Array.isArray(body.to) ? body.to.map(String) : [];
  if (to.includes('operator')) refuse(400, 'a person does not address the operator; the operator reads the channel');
  for (const h of to) {
    const m = b.members.find((x) => x.handle === h);
    if (!m) refuse(400, `no member ${h} in this bridge`);
    if (m.fired) refuse(400, `${h} is fired and gets no message`);
  }
  const ch = S.channels.get(id);
  if (body.replyTo != null && !ch.some((e) => e.seq === Number(body.replyTo))) refuse(400, `no entry ${body.replyTo} to reply to`);
  if (files.length) filesReach(b, to);
  const e = post(id, { kind: 'person', name: c.person.subject, display: c.person.name }, text, { to, replyTo: body.replyTo != null ? Number(body.replyTo) : null, pinned: !!body.pinned || !!skill, ...(skill ? { skill } : {}), ...(files.length ? { files } : {}) });
  if (files.length) seatFiles(b, e, files);
  S.reads.set(id + '|' + c.person.subject, e.seq);
  fanOut(id, e);
  c.status = 201;
  return e;
});
// One entry with its whole text, up to 64 KB. cut stays true only for an entry whose start alone was kept.
on('GET', '/v1/bridges/([^/]+)/messages/([^/]+)', (c, id, seqText) => {
  bridgeOr404(id);
  const seq = Number(seqText);
  if (!Number.isInteger(seq) || seq < 1) refuse(400, 'the seq of an entry is a positive whole number');
  const e = (S.channels.get(id) || []).find((x) => x.seq === seq);
  if (!e) refuse(404, `no entry ${seq} in the bridge ${id}`);
  const whole = WHOLE.get(e);
  return whole ? { ...e, text: whole, cut: false } : e;
});
/**
 * The pages of the work of a bridge: each page under bridges/<id>/, and each
 * page whose newest version a run of the bridge wrote, with the seat of that
 * run, sorted by path.
 */
on('GET', '/v1/bridges/([^/]+)/pages', (c, id) => {
  const b = bridgeOr404(id);
  const seatOf = (run) => {
    const m = b.members.find((x) => x.runs.includes(run));
    if (m) return m.handle;
    const r = S.runs.get(run);
    return r && r.metadata && r.metadata['fw.batch'] === 'bridge:' + id ? r.metadata['fw.bridge.member'] || '' : null;
  };
  const pages = [];
  for (const p of S.pages.values()) {
    const v = live(p);
    if (!v) continue;
    const seat = v.run ? seatOf(v.run) : null;
    if (!p.path.startsWith('bridges/' + id + '/') && seat === null) continue;
    pages.push({ ...pageMeta(p), ...(seat ? { seat } : {}) });
  }
  pages.sort((a, b2) => (a.path < b2.path ? -1 : 1));
  return { bridge: id, pages, count: pages.length };
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
// A person ends the open question of a seat without an answer. The seat does not wake.
on('POST', '/v1/bridges/([^/]+)/questions/(\\d+)/settle', (c, id, seqText) => {
  const b = bridgeOr404(id);
  const seq = Number(seqText);
  const m = b.members.find((x) => x.question === seq);
  if (!m) refuse(404, `no question waits at entry ${seq} of the bridge ${id}`);
  setMember(id, m, { question: 0 });
  system(id, 'answered', `${c.person.name.toLowerCase()} ended the question of ${m.handle} without an answer`);
  c.status = 204;
  return undefined;
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
  if (body.continue === true) {
    // Continue goes on with the run that stopped at a limit of its budget, with more room.
    if ('task' in patch) refuse(400, 'continue goes on with the run that stopped; a task alone seats the member again on a new run');
    const last = S.runs.get(m.runs[m.runs.length - 1]);
    if (m.fired || !last || last.state !== 'failed' || !/^budget exceeded/.test(last.error || '')) refuse(409, `the newest run of ${m.handle} did not stop at a limit, so there is nothing to continue`);
    S.runs.set(last.id, { ...last, state: 'running', error: undefined });
    setMember(id, m, { presence: 'working' });
    system(id, 'task', `${c.person.name.toLowerCase()} continued ${m.handle}`);
    return m;
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

// The fleet names the role of the person on each agent of a member: erin views every agent.
on('GET', '/v1/fleet', (c) => (viewerOf(c.person) ? { ...FLEET, members: FLEET.members.map((m) => ({ ...m, agents: m.agents.map((a) => ({ ...a, role: 'viewer' })) })) } : FLEET));
// An agent of the view carries the parts of its profile that the page shows: the tools, the skills that it allows, and its rules.
const agentView = ({ name, description, role }) => ({ name, description, role, tools: TOOLS_OF[name] || [], skills: allowlistOf(name), policy: name === 'migrator' ? { ask: ['bash: git push*', 'ansible.playbook: check=false', 'ansible.adhoc: check=false'] } : name === 'reviewer' ? { ask: ['destructive'] } : undefined });
// The front names only its own profile in GET /v1/agents, as the real
// front does. The profiles that the workers of the pools run come from
// GET /v1/agents/{name}, with the pool and with no abilities, and the page
// reads the agents of the fleet from GET /v1/fleet.
const FRONT_AGENTS = [{ name: 'default', description: 'The profile of the front itself.', role: 'owner' }];
// The role of an agent is the role of the person who asks: erin views every agent.
const roleFor = (c, a) => (viewerOf(c.person) ? { ...a, role: 'viewer' } : a);
on('GET', '/v1/agents', (c) => ({ agents: FRONT_AGENTS.map((a) => agentView(roleFor(c, a))) }));
on('GET', '/v1/agents/([^/]+)', (c, raw) => {
  const name = decodeURIComponent(raw);
  const own = FRONT_AGENTS.find((x) => x.name === name);
  if (own) return agentView(roleFor(c, own));
  const a = AGENTS.find((x) => x.name === name);
  if (!a) refuse(404, `no agent ${name}`);
  return { ...agentView(roleFor(c, a)), pool: poolOfAgent(name) };
});
/** poolOfAgent names the pool whose workers run an agent: the pool of the agent, else the pool of a worker that holds it. */
function poolOfAgent(name) {
  const own = FLEET.pools.find((p) => p.agent === name);
  if (own) return own.name;
  const m = FLEET.members.find((x) => x.agents.some((a) => a.name === name));
  const p = m && FLEET.pools.find((q) => q.tasks.some((t) => q.atespace + '/' + t.name === m.name));
  return p ? p.name : undefined;
}

const runOr404 = (id) => {
  const r = S.runs.get(id);
  if (!r) refuse(404, `no run ${id}`);
  return r;
};
// The live stream of a run: the pieces of the answer while the run works,
// then idle. A client of a run that does not work gets idle at once.
on('GET', '/v1/runs/([^/]+)/live', (c, raw) => {
  const id = decodeURIComponent(raw);
  const run = runOr404(id);
  const set = liveClients.get(id) || new Set();
  if (set.size >= 16) refuse(429, 'the run has 16 live clients, which is the most it takes', {}, { 'Retry-After': '1' });
  const res = c.res;
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' });
  res.write(': live\n\n');
  if (run.state !== 'queued' && run.state !== 'running') {
    res.write(`event: idle\ndata: ${JSON.stringify({ state: run.state })}\n\n`);
    if (TERMINAL.includes(run.state)) res.end();
    return undefined;
  }
  set.add(res);
  liveClients.set(id, set);
  const ping = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  c.req.on('close', () => {
    clearInterval(ping);
    set.delete(res);
    if (!set.size) liveClients.delete(id);
  });
  return undefined;
});
// A run starts on any member of the fleet whose agents hold the agent of the body.
on('POST', '/v1/runs', async (c) => {
  const member = c.url.searchParams.get('member') || '';
  const body = await readJson(c.req, FILE_BODY_BYTES);
  const agent = String(body.agent || '');
  const fm = FLEET.members.find((m) => m.name === member);
  if (!fm) refuse(400, `no fleet member ${member}`);
  if (!agent || !fm.agents.some((a) => a.name === agent)) refuse(400, `the fleet member ${member} runs no agent ${agent || '""'}`);
  const input = String(body.input || '').trim();
  for (const k of Object.keys(body)) if (!['agent', 'input', 'title', 'profile', 'metadata', 'instructions', 'budget', 'files'].includes(k)) refuse(400, `json: unknown field "${k}"`);
  const files = uploadedFiles(body);
  if (!input && !files.length) refuse(400, 'the field input is required and must not be empty');
  const id = 'run-' + agent + '-' + Date.now().toString(36);
  // The kernel titles a run from the first sentence of its input.
  const title = String(body.title || '').trim() || (input.split('\n')[0].split(/(?<=[.?!])\s/)[0] || '').slice(0, 64);
  const run = { id, agent, title, state: 'queued', input, seq: 1, origin: 'http', principal: c.person.subject, createdAt: now(), updatedAt: now(), member, usage: { turns: 0, costUSD: 0 } };
  if (body.metadata && typeof body.metadata === 'object') run.metadata = { ...body.metadata };
  // An inline profile replaces the lists of the agent for this run. A tool that the agent does not give is an extra tool of the run.
  const p = body.profile && typeof body.profile === 'object' ? body.profile : null;
  const tools = p && Array.isArray(p.tools) ? p.tools.map(String) : TOOLS_OF[agent] || [];
  const skills = p && Array.isArray(p.skills) ? p.skills.map(String) : allowlistOf(agent);
  run.resolved = { model: 'model-large', tools, skills };
  if (p && Array.isArray(p.tools)) {
    const extra = tools.filter((t) => !givesTool(TOOLS_OF[agent] || [], t));
    if (extra.length) run.extraTools = extra;
  }
  S.runs.set(id, run);
  S.transcripts.set(id, [{ seq: 1, time: now(), kind: 'user', text: input, who: c.person.subject, ...(files.length ? { files: attachedOf(files) } : {}) }]);
  S.results.set(id, { runId: id, title: run.title, agent: run.agent, status: 'working', started: run.createdAt, changed: run.updatedAt, next: [] });
  publish('run', run);
  managerTurn(run, true);
  c.status = 201;
  return run;
});
on('GET', '/v1/runs/([^/]+)', (c, id) => runOr404(id));
// The first event of the ledger of a run, fw.run.queued, with the inline
// profile of a quick chat, its extra tools, and the resolved profile. The
// fake keeps no other event, so a later seq answers no event.
on('GET', '/v1/runs/([^/]+)/events', (c, id) => {
  const run = runOr404(id);
  const from = Number(c.url.searchParams.get('from') || 1);
  if (from > 1) return { run, events: [], lines: [] };
  const chat = run.metadata && run.metadata['fw.view'] === 'quickchat';
  const resolved = run.resolved || { model: 'model-large', tools: TOOLS_OF[run.agent] || [], skills: allowlistOf(run.agent), policy: run.agent === 'migrator' ? { ask: ['bash: git push*'] } : undefined };
  const data = { agent: run.agent, input: run.input || '', origin: run.origin || 'http', resolved };
  if (chat) data.profile = { tools: resolved.tools, skills: resolved.skills };
  if (run.extraTools) data.extraTools = run.extraTools;
  return { run, events: [{ specversion: '1.0', id: id + '-1', source: 'fake', type: 'fw.run.queued', time: run.createdAt, subject: id, seq: 1, data }], lines: [] };
});
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
  const body = await readJson(c.req, FILE_BODY_BYTES);
  const files = uploadedFiles(body);
  const content = String(body.content || '').trim();
  if (!content && !files.length) refuse(400, 'a message needs content');
  // A run of the archive is read-only: its worker was replaced.
  if (run.archived) refuse(409, ARCHIVED_REFUSAL);
  // A run that stopped at a limit takes a follow-up once a person gave it more room (PATCH /v1/runs/{id}/budget).
  const roomy = run.state === 'failed' && /^budget exceeded\b/.test(run.error || '') && run.moreRoom;
  if ((run.state === 'failed' && !roomy) || run.state === 'canceled') refuse(409, `the run ${id} ${run.state === 'failed' ? 'failed' : 'was canceled'}, so it takes no message`);
  if (roomy) {
    delete run.error;
    delete run.moreRoom;
  }
  const items = S.transcripts.get(id);
  const seq = items[items.length - 1].seq + 1;
  items.push({ seq, time: now(), kind: 'user', text: content, who: c.person.subject, ...(files.length ? { files: attachedOf(files) } : {}) });
  Object.assign(run, { state: 'running', seq, updatedAt: now() });
  publish('run', run);
  if (!run.metadata || !run.metadata['fw.bridge.member']) managerTurn(run, false);
  c.status = 202;
  return { run: id, seq };
});
// The budget of a run: each field that the body sets replaces the same limit for the work that follows. A finished run stays finished until a follow-up.
const LIMITS = ['maxTurns', 'maxTokens', 'maxCostUSD', 'maxToolCalls', 'maxCallsPerTurn', 'maxRepeats', 'deadline'];
on('PATCH', '/v1/runs/([^/]+)/budget', async (c, id) => {
  const run = runOr404(id);
  if (run.archived) refuse(409, ARCHIVED_REFUSAL);
  const body = await readJson(c.req);
  for (const k of Object.keys(body)) if (!LIMITS.includes(k)) refuse(400, `json: unknown field "${k}" of the budget`);
  for (const k of Object.keys(body)) if (k !== 'deadline' && !(Number(body[k]) > 0)) refuse(400, `the budget: ${k} must be above 0`);
  run.budget = { ...(run.budget || {}), ...body };
  if (run.state === 'failed' && /^budget exceeded\b/.test(run.error || '')) run.moreRoom = true;
  run.seq += 1;
  run.updatedAt = now();
  publish('run', run);
  return { budget: run.budget, run };
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
  liveIdle(run);
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
  // Needs work on a result to check: the front sends the note to the agent
  // as a follow-up, so the run works on it again, and ends a few seconds later.
  const md = run.metadata || {};
  // A result to check: the owner asked to check each result, or a duty that tells of what it found found something.
  const review = md['workbench.review'] === '1' || (md['workbench.found'] === '1' && !!foundLine(run));
  if (review && body.reaction === 'down' && body.note && run.state === 'completed') {
    const note = String(body.note);
    items.push({ seq: items.length + 1, time: now(), kind: 'user', text: 'Needs work: ' + note, who: c.person.subject });
    Object.assign(run, { state: 'running', seq: run.seq + 1, updatedAt: now(), reworks: (run.reworks || 0) + 1 });
    publish('run', run);
    setTimeout(() => {
      items.push({ seq: items.length + 1, time: now(), kind: 'assistant', text: 'I changed it as you asked: ' + note });
      // The new answer is a new result to check.
      Object.assign(run, { state: 'completed', output: (run.output || '') + '\n\nChanged: ' + note, reactions: {}, seq: run.seq + 1, updatedAt: now() });
      publish('run', run);
    }, 4000);
  }
  publish('run', run);
  return run;
});

// prefix keeps the pages whose path starts with it, as the workbench does.
on('GET', '/v1/pages', (c) => {
  const prefix = String(c.url.searchParams.get('prefix') || '');
  const pages = [...S.pages.values()].filter((p) => live(p) && p.path.startsWith(prefix));
  return { pages: pages.map((p) => pageMeta(p)).sort((a, b) => (a.path < b.path ? -1 : 1)) };
});
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
  if (viewerOf(c.person)) refuse(403, 'Reading the wiki needs the operator role');
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
    if (step % 2 === 0) moveSeat(b.id, m1, 'working', { turn: 7 + moveN, tool: 'bash', phrase: phrases[moveN % phrases.length], since: now() });
    else moveSeat(b.id, m1, 'idle', null);
  }
  // The tester wakes, works, rests, and sleeps again, with the worker that holds its run.
  if (tester && !tester.fired) {
    const w = workerOfSeat(tester) || 'crew-2';
    if (step === 0) {
      taskPhase(w, 'Running');
      system(b.id, 'started', 'tester woke up.');
      moveSeat(b.id, tester, 'working', { turn: 3, tool: 'bash', phrase: 'Ran "molecule test"', since: now() });
    } else if (step === 2) moveSeat(b.id, tester, 'idle', null);
    else if (step === 3) {
      moveSeat(b.id, tester, 'asleep', null);
      taskPhase(w, 'Suspended');
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
// routes-d.mjs serves the Routines place, and writes the runbook of a
// routine on a sign-off with writePage. routes-e.mjs serves the Duties place.
// packages.mjs serves the packages of the pools, and archive.mjs adds the
// conversations whose worker was replaced. routes-k.mjs serves the
// Know-how place, after routes-d.mjs adds the agents of the routines.
// routes-work.mjs serves the board of the work, routes-value.mjs the
// Results place, and routes-door.mjs the door of the Work place.
for (const name of ['skills.mjs', 'routes-a.mjs', 'routes-b.mjs', 'routes-c.mjs', 'routes-chat.mjs', 'routes-d.mjs', 'routes-e.mjs', 'routes-k.mjs', 'packages.mjs', 'archive.mjs', 'routes-value.mjs', 'routes-work.mjs', 'routes-door.mjs']) {
  const mod = await import('./' + name);
  mod.register({ on, refuse, readJson, readBody, publish, S, now, AGENTS, FLEET, admin: () => ADMIN, viewerOf, writePage, post, system, moveSeat, port: PORT });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`The fake server of bossmode listens on http://127.0.0.1:${PORT}. It is for development only.`);
  console.log(SIGNIN ? 'A 401 names /ui/signin, which signs you in as alice.' : 'A 401 names no sign-in route. Paste the token fake-alice.');
  if (!QUIET) setInterval(tick, TICK);
});
