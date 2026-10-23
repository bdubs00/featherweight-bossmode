// The fake routes and the sample data of Screen A: the bridge list, the
// channel, the picker, and the members. Screen A owns this file. register
// gets the helpers of server.mjs: on adds a route, refuse answers a
// problem, readJson and readBody read the body, publish sends a stream
// event, S is the state, now is the time, and AGENTS and FLEET are the
// sample data.
//
// Every entry carries pinned, as the backend sends it. With FAKE_A=1, the
// sample data also shows each state of Screen A:
//   - br-puppet gains a seat that waits for a worker (its run is queued), a
//     fired seat, a fold of four system lines with a failure and a line
//     about a wiki page, a card in the state unknown, and the end of the
//     artboard: reactions, a message of alice to the reviewer, and its answer.
//   - br-logrotate is a second open bridge with two unread messages, a
//     seat with no run, whose job waits on the queue, and a seat whose run
//     failed with the error of a real fleet: the provider refused the
//     request with a 400 and a JSON message. That run read the channel,
//     wrote a page of the wiki, and posted before it failed.
//   - br-notes-23 is a closed bridge.
// The routes of the server serve all of it. This file adds no route.

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';
const T0 = Date.now();
const ago = (m) => new Date(T0 - m * 60_000).toISOString();

const alice = { kind: 'person', name: ALICE, display: 'Alice' };
const agent = (handle, run) => ({ kind: 'agent', handle, run: run || 'run-' + handle });
const system = { kind: 'system' };

function entry(at, from, text, more = {}) {
  return { seq: 0, at, from, to: [], replyTo: null, text, mirrors: null, reactions: { up: [], down: [], heart: [] }, decision: null, pinned: false, ...more };
}

/** run adds a run of a seat, with a short transcript and a result, so every route of a run answers. */
function addRun(S, { id, agentName, handle, bridge, task, state, minutes, activity = null, error = '' }) {
  const run = {
    id, agent: agentName, title: task, state, input: task, seq: 1, origin: 'http', principal: ALICE,
    metadata: { 'fw.batch': 'bridge:' + bridge, 'fw.bridge.member': handle },
    createdAt: ago(minutes), updatedAt: ago(Math.max(0, minutes - 2)), member: state === 'queued' ? '' : 'default/crew-0',
    activity, reactions: { up: 0, down: 0, heart: 0 }, usage: state === 'queued' ? undefined : { turns: 3, toolCalls: 2, costUSD: 0.06 },
  };
  if (error) run.error = error;
  S.runs.set(id, run);
  S.transcripts.set(id, [{ seq: 1, time: run.createdAt, kind: 'user', text: task, who: ALICE }]);
  S.results.set(id, { runId: id, title: task, agent: agentName, status: state === 'queued' ? 'working' : state === 'canceled' ? 'canceled' : 'ready', started: run.createdAt, changed: run.updatedAt, next: [] });
  return run;
}

/**
 * renumber gives the entries of a channel their seqs in order, and moves
 * each replyTo with its entry.
 */
function renumber(list) {
  const map = new Map();
  list.forEach((e, i) => {
    if (e.seq) map.set(e.seq, i + 1);
  });
  list.forEach((e, i) => {
    e.seq = i + 1;
  });
  for (const e of list) if (e.replyTo != null) e.replyTo = map.get(e.replyTo) || null;
  return list;
}

/** between is a time between two entries, so an inserted entry keeps the order of the clock. */
function between(a, b) {
  return new Date((new Date(a.at).getTime() + new Date(b.at).getTime()) / 2).toISOString();
}

function puppet(S) {
  const b = S.bridges.get('br-puppet');
  const ch = S.channels.get('br-puppet');
  if (!b || !ch) return;
  b.createdAt = ago(50);

  // A seat that waits for a worker: its run is queued, and the reviewer has one worker, busy.
  addRun(S, { id: 'run-a-reviewer-2', agentName: 'reviewer', handle: 'reviewer-2', bridge: b.id, task: 'Review the logrotate role', state: 'queued', minutes: 30 });
  b.members.push({ handle: 'reviewer-2', agent: 'reviewer', pool: 'review', task: 'Review the logrotate role', runs: ['run-a-reviewer-2'], fired: false, muted: false, presence: 'working', activity: null });
  // A fired seat.
  addRun(S, { id: 'run-a-scribe', agentName: 'scribe', handle: 'scribe', bridge: b.id, task: 'Draft the changelog of the migration', state: 'canceled', minutes: 90 });
  b.members.push({ handle: 'scribe', agent: 'scribe', pool: 'crew', task: 'Draft the changelog of the migration', runs: ['run-a-scribe'], fired: true, muted: true, presence: 'fired', activity: null });
  // The tester is muted, so the tag shows.
  const tester = b.members.find((m) => m.handle === 'tester');
  if (tester) tester.muted = true;

  // After the failure of the writer: three more system lines, so four fold with one failure.
  const failed = ch.findIndex((e) => e.event === 'failed');
  if (failed >= 0) {
    const next = ch[failed + 1];
    const at = between(ch[failed], next);
    ch.splice(
      failed + 1,
      0,
      entry(at, system, 'alice added reviewer-2: Review the logrotate role', { event: 'joined', mirrors: { run: 'run-a-reviewer-2', seq: 1, type: 'fw.run.queued' } }),
      entry(at, system, 'alice fired scribe.', { event: 'fired' }),
      entry(at, system, 'migrator-1 changed the plan of the bridge.', { event: 'changed', page: 'bridges/br-puppet/plan.md' }),
    );
  }

  // After the table of the tester: a card that the page cannot confirm, and the failed line with it.
  const table = ch.findIndex((e) => e.from.kind === 'agent' && e.from.handle === 'tester' && /Ubuntu 24\.04 passed/.test(e.text));
  if (table >= 0) {
    const at = between(ch[table], ch[table + 1]);
    ch.splice(
      table + 1,
      0,
      entry(at, system, 'tester wants to run a command.', {
        event: 'needs-you',
        mirrors: { run: 'run-tester', seq: 8, type: 'fw.approval.requested' },
        decision: { run: 'run-tester', id: 'ap-a-tester', tool: 'bash', label: 'Run command', reason: 'rule: ask bash: molecule destroy*', effect: 'Runs "molecule destroy".', input: { command: 'molecule destroy' }, state: 'unknown', note: 'The run stopped before the decision reached it.', always: true },
      }),
      entry(at, system, 'A decision for tester did not reach its run.', { event: 'failed' }),
    );
  }

  // The end of the channel, as the artboard draws it.
  const card = ch.findIndex((e) => e.decision && e.decision.state === 'pending');
  const tail = ch.splice(card >= 0 ? card - 1 : ch.length);
  const before = tail.find((e) => e.from.kind === 'agent' && e.from.handle === 'migrator-1');
  const cardEntry = tail.find((e) => e.decision && e.decision.state === 'pending');
  const keep = tail.filter((e) => e !== before && e !== cardEntry && !(e.from.kind === 'agent' && e.from.handle === 'tester') && e.event !== 'asleep');
  const t = (m) => ago(m);
  const head = [];
  if (before) head.push(Object.assign(before, { at: t(14) }));
  if (cardEntry) head.push(Object.assign(cardEntry, { at: t(13) }));
  ch.push(...keep, ...head);
  ch.push(
    entry(t(11), agent('reviewer'), 'While I wait for nginx, I read the style guide again. Handler names start with a verb.', { reactions: { up: [BOB], down: [], heart: [] } }),
    entry(t(11), system, 'tester went to sleep.', { event: 'asleep', mirrors: { run: 'run-tester', seq: 9, type: 'fw.run.finished' } }),
    entry(t(10), agent('migrator-1'), '`ansible-lint roles/logrotate` passes with no warning.', { reactions: { up: [], down: [], heart: [ALICE] } }),
    entry(t(8), alice, '@reviewer check the logrotate role when migrator-1 posts the branch. The plan is in [bridges/br-puppet/plan.md](bridges/br-puppet/plan.md).', { to: ['reviewer'] }),
    entry(t(7), agent('reviewer'), 'Will do. I keep the checklist on the wiki page, so the next bridge gets it too.'),
  );
  renumber(ch);
  S.reads.set('br-puppet|' + ALICE, ch.length);
}

/** The error of a seat on the homelab fleet, as the run held it. */
const PREFILL =
  'model: anthropic: stream claude-haiku-5-5: POST "http://ax-anthropic.fw-fleet.svc.cluster.local:8080/v1/messages?beta=true": 400 Bad Request (Request-ID: req_011CgJhPGRsjUd3vHdi7JLjE) (Workspace-ID: wrkspc_018mMkT171jg5neTmcSP7ha8) {"type":"error","error":{"type":"invalid_request_error","message":"This model does not support assistant message prefill. The conversation must end with a user message."},"request_id":"req_011CgJhPGRsjUd3vHdi7JLjE"}';

/** failedWriter seats a writer on a bridge whose run read the channel, wrote a page, posted, and failed at its next model call. */
function failedWriter(S, bridge) {
  const id = 'run-lr-writer';
  const task = 'Write the runbook of the logrotate role in the wiki';
  const page = 'runbooks/logrotate.md';
  const text = '---\ntitle: The logrotate role\n---\n# The logrotate role\n\nThe role keeps the rotation of the Puppet module: daily, seven copies, compressed.\n';
  const run = addRun(S, { id, agentName: 'writer', handle: 'writer', bridge, task, state: 'failed', minutes: 36, error: PREFILL });
  run.member = 'default/notes-0';
  run.seq = 9;
  run.usage = { turns: 4, toolCalls: 3, costUSD: 0.02 };
  const t = (m) => ago(m);
  S.transcripts.set(id, [
    { seq: 1, time: t(36), kind: 'user', text: task, who: ALICE },
    { seq: 2, time: t(35), kind: 'tool', tool: 'front.bridge_read', callId: 'w1', input: {} },
    { seq: 3, time: t(35), kind: 'result', tool: 'front.bridge_read', callId: 'w1', text: '3 messages' },
    { seq: 4, time: t(34), kind: 'tool', tool: 'front.pages_write', callId: 'w2', input: { path: page, text, summary: 'The runbook of the logrotate role' } },
    { seq: 5, time: t(34), kind: 'result', tool: 'front.pages_write', callId: 'w2', text: 'Wrote ' + page + '.' },
    { seq: 6, time: t(33), kind: 'tool', tool: 'front.bridge_post', callId: 'w3', input: { text: 'The runbook of the logrotate role is in the wiki.' } },
    { seq: 7, time: t(33), kind: 'result', tool: 'front.bridge_post', callId: 'w3', text: 'Posted.' },
    { seq: 9, time: t(32), kind: 'end', text: 'failed', isError: true },
  ]);
  // The kernel words a step of the front by the name of its tool, as on the real fleet.
  S.results.set(id, {
    runId: id, title: task, agent: 'writer', status: 'failed', error: PREFILL, started: run.createdAt, changed: t(32), next: [{ kind: 'retry', label: 'Try again' }],
    steps: [
      { seq: 10, tool: 'front.bridge_read', text: 'front.bridge_read', done: true },
      { seq: 12, tool: 'front.pages_write', text: 'front.pages_write', done: true },
      { seq: 14, tool: 'front.bridge_post', text: 'front.bridge_post', done: true },
    ],
  });
  if (!S.pages.has(page)) S.pages.set(page, { path: page, versions: [{ version: 900, text, hash: 'lr-writer-1', by: 'run:' + id, run: id, at: t(34), summary: 'The runbook of the logrotate role' }] });
  return { handle: 'writer', agent: 'writer', pool: 'notes', task, runs: [id], fired: false, muted: false, presence: 'error', activity: null };
}

function logrotate(S) {
  const id = 'br-logrotate';
  const seats = [
    { handle: 'migrator', agent: 'migrator', task: 'Migrate the logrotate module to an Ansible role', state: 'running', presence: 'working', activity: { turn: 3, tool: 'bash', phrase: 'Read modules/logrotate/manifests/init.pp', since: ago(2) } },
    { handle: 'tester', agent: 'tester', task: 'Run molecule for the logrotate role', state: 'completed', presence: 'idle', activity: null },
  ];
  const members = seats.map((s) => {
    const run = addRun(S, { id: 'run-lr-' + s.handle, agentName: s.agent, handle: s.handle, bridge: id, task: s.task, state: s.state, minutes: 40, activity: s.activity });
    return { handle: s.handle, agent: s.agent, pool: 'crew', task: s.task, runs: [run.id], fired: false, muted: false, presence: s.presence, activity: s.activity };
  });
  // A seat with no run yet: its job waits on the queue of its agent.
  members.push({ handle: 'reviewer', agent: 'reviewer', pool: 'review', task: 'Review the logrotate role against its manifest', runs: [], fired: false, muted: false, presence: 'waiting', activity: null });
  members.push(failedWriter(S, id));
  S.bridges.set(id, {
    id, title: 'Migrate logrotate', goal: 'Migrate the logrotate module to an Ansible role and test it with molecule.', operator: ALICE, state: 'open', placement: 'queue',
    createdAt: ago(52), closedAt: null, manager: null,
    delegation: { approve: false, budget: false, members: false, report: true },
    caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6 },
    members,
  });
  S.channels.set(
    id,
    renumber([
      entry(ago(41), system, 'alice opened the bridge with 4 members.', { event: 'opened' }),
      entry(ago(41), system, 'migrator started: Migrate the logrotate module to an Ansible role.', { event: 'started', mirrors: { run: 'run-lr-migrator', seq: 1, type: 'fw.run.queued' } }),
      entry(ago(41), system, 'tester started: Run molecule for the logrotate role.', { event: 'started', mirrors: { run: 'run-lr-tester', seq: 1, type: 'fw.run.queued' } }),
      entry(ago(36), system, 'writer started: Write the runbook of the logrotate role in the wiki.', { event: 'started', mirrors: { run: 'run-lr-writer', seq: 1, type: 'fw.run.queued' } }),
      entry(ago(33), agent('writer', 'run-lr-writer'), 'The runbook of the logrotate role is in the wiki.'),
      entry(ago(32), system, 'writer failed: ' + PREFILL, { event: 'failed', mirrors: { run: 'run-lr-writer', seq: 9, type: 'fw.run.finished' } }),
      entry(ago(30), agent('migrator', 'run-lr-migrator'), 'logrotate has one class and one template. I keep the handler style of nginx.'),
      entry(ago(20), agent('tester', 'run-lr-tester'), 'molecule converge passed on Debian 12. I wait for the role to settle before idempotence.'),
    ]),
  );
  S.reads.set(id + '|' + ALICE, 6);
}

function closedNotes(S) {
  const id = 'br-notes-23';
  const seats = [
    { handle: 'scribe', agent: 'scribe', task: 'Draft the release notes of 2.3' },
    { handle: 'reviewer', agent: 'reviewer', task: 'Check each note against its pull request' },
  ];
  const members = seats.map((s) => {
    const run = addRun(S, { id: 'run-n23-' + s.handle, agentName: s.agent, handle: s.handle, bridge: id, task: s.task, state: 'completed', minutes: 3000 });
    return { handle: s.handle, agent: s.agent, pool: 'crew', task: s.task, runs: [run.id], fired: false, muted: false, presence: 'idle', activity: null };
  });
  S.bridges.set(id, {
    id, title: 'Release notes for 2.3', goal: 'Draft the release notes of 2.3.', operator: ALICE, state: 'closed', placement: 'spawn',
    createdAt: ago(3100), closedAt: ago(2900), manager: null,
    delegation: { approve: false, budget: false, members: false, report: true },
    caps: { maxMessages: 2000, maxFanoutPerMinute: 30, maxPairMessages: 6 },
    members,
  });
  S.channels.set(
    id,
    renumber([
      entry(ago(3100), system, 'alice opened the bridge with 2 members.', { event: 'opened' }),
      entry(ago(3000), agent('scribe', 'run-n23-scribe'), 'The notes of 2.3 are in the wiki.'),
      entry(ago(2900), system, 'alice closed the bridge. Nothing was canceled.', { event: 'closed' }),
    ]),
  );
  S.reads.set(id + '|' + ALICE, 3);
}

export function register({ S }) {
  if (process.env.FAKE_A === '1') {
    puppet(S);
    logrotate(S);
    closedNotes(S);
  }
  // Every entry carries pinned, as the backend sends it.
  for (const ch of S.channels.values()) for (const e of ch) if (e.pinned === undefined) e.pinned = false;
}
