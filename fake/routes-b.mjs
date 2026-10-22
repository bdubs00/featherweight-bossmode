// The fake routes of Screen B: the fleet, the member conversation, the profile, Activity, and the board.
// Screen B owns this file. register gets the helpers of server.mjs: on
// adds a route, refuse answers a problem, readJson and readBody read the
// body, publish sends a stream event, S is the state, now is the time, and
// AGENTS and FLEET are the sample data.
//
// The routes:
//   GET    /v1/pools/{name}                     the workers of an agent, as the fleet view names a pool
//   PATCH  /v1/pools/{name}                     {"replicas": n} changes Keep, for an owner
//   DELETE /v1/pools/{name}                     removes the workers, for an owner
//   GET    /v1/bossmode/agents/{agent}/today    {"runs", "costUSD", "decisions", "partial"?} of the day
//
// A pool goes by its name, such as crew. The pool that the front makes for
// a new agent has the name of the agent in lower case, with a hyphen for
// each character that is not a letter or a digit, so that name finds it too.

/** poolName is the name of the pool of an agent. */
const poolName = (agent) => String(agent).toLowerCase().replace(/[^a-z0-9]/g, '-');

/** The workers on which the sample runs work, so the profile names the seat of each worker. */
const WORKER_OF_RUN = {
  'run-migrator-1': 'default/crew-0',
  'run-migrator-2': 'default/crew-1',
  'run-reviewer': 'default/review-0',
  'run-tester': 'default/test-0',
  'run-writer': 'default/notes-0',
  'run-scribe': 'default/crew-1',
  'run-reviewer-2': 'default/review-0',
};

export function register({ on, refuse, readJson, publish, S, now, AGENTS, FLEET }) {
  for (const [id, member] of Object.entries(WORKER_OF_RUN)) {
    const r = S.runs.get(id);
    if (r) r.member = member;
  }

  // A direct exchange with migrator-1 at the end of the first channel: a
  // question of alice to the seat, its answer, a quiet step of its run, its
  // report with a heart, and the next task.
  const ch = S.channels.get('br-puppet');
  const items = S.transcripts.get('run-migrator-1');
  const run = S.runs.get('run-migrator-1');
  if (ch && items && run) {
    const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();
    const alice = { kind: 'person', name: 'alice@example.com', display: 'Alice' };
    const m1 = { kind: 'agent', handle: 'migrator-1', run: 'run-migrator-1' };
    const add = (min, from, text, more = {}) => {
      const e = { seq: ch[ch.length - 1].seq + 1, at: ago(min), from, to: [], replyTo: null, text, mirrors: null, reactions: { up: [], down: [], heart: [] }, decision: null, ...more };
      ch.push(e);
      return e;
    };
    const q = add(30, alice, 'How far is cron? The bridge wants it before nginx lands.', { to: ['migrator-1'] });
    add(29, m1, 'The role is written and lints clean. Two things are left: the handler for the cron service, and the molecule scenario. About twenty minutes.', { replyTo: q.seq });
    const seq = items[items.length - 1].seq + 1;
    items.push({ seq, time: ago(12), kind: 'tool', tool: 'bash', callId: 'c9', input: { command: 'ansible-lint roles/cron' } });
    items.push({ seq: seq + 1, time: ago(12), kind: 'result', tool: 'bash', callId: 'c9', text: 'Passed.' });
    run.seq = seq + 1;
    add(6, m1, 'Cron is done: handler added, molecule converges twice without a change. Notes are on the wiki at [modules/cron.md](modules/cron.md). I move to logrotate unless you want something else first.', { reactions: { up: [], down: [], heart: ['alice@example.com'] } });
    add(4, alice, 'Go ahead with logrotate. Keep the template names as they are in the manifest.', { to: ['migrator-1'] });
  }

  const poolOf = (name) => FLEET.pools.find((p) => p.name === name) || FLEET.pools.find((p) => poolName(p.agent) === name);
  // The status of a pool, as GET /v1/pools/{name} of the backend answers it.
  const view = (p) => ({
    name: p.name,
    source: p.source || 'config',
    ...(p.template ? { template: p.template } : {}),
    atespace: p.atespace,
    agent: p.agent,
    intake: p.intake,
    wanted: p.wanted,
    actual: p.tasks.length,
    ready: p.tasks.filter((t) => t.phase === 'Running' || t.phase === 'Suspended').length,
    hash: p.hash || '',
    tasks: p.tasks.map((t) => ({ name: t.name, phase: t.phase, current: t.current !== false, ...(t.note ? { note: t.note } : {}) })),
    gaps: p.gaps || [],
    checkedAt: now(),
  });
  const ownerOnly = (c, agent) => {
    const a = AGENTS.find((x) => x.name === agent);
    if (!a || a.role !== 'owner') refuse(403, `only an owner of ${agent} can change its workers`);
  };

  /** setPhase moves one worker and sends the events of the fleet view. */
  const setPhase = (p, t, phase) => {
    t.phase = phase;
    const member = p.atespace + '/' + t.name;
    publish('task', { kind: 'task', member, phase, time: now() });
  };

  on('GET', '/v1/pools/([^/]+)', (c, name) => {
    const p = poolOf(decodeURIComponent(name));
    if (!p) refuse(404, `no workers for ${decodeURIComponent(name)}`);
    return view(p);
  });

  on('PATCH', '/v1/pools/([^/]+)', async (c, name) => {
    const p = poolOf(decodeURIComponent(name));
    if (!p) refuse(404, `no workers for ${decodeURIComponent(name)}`);
    ownerOnly(c, p.agent);
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (k !== 'replicas') refuse(400, `unknown field ${k}`);
    const n = body.replicas;
    if (!Number.isInteger(n) || n < 0 || n > 16) refuse(400, 'replicas must be a whole number from 0 to 16');
    p.wanted = n;
    // New workers start and wake a moment later. Extra workers stop and leave.
    while (p.tasks.length < n) {
      const t = { name: p.name + '-' + p.tasks.length, phase: 'Pending', current: true };
      p.tasks.push(t);
      setPhase(p, t, 'Pending');
      FLEET.members.push({ name: p.atespace + '/' + t.name, self: false, state: 'live', lastSeen: now(), canForward: true, accessMode: 'static', agents: [{ name: p.agent, role: 'operator' }], active: 0, inputRequired: 0 });
      setTimeout(() => setPhase(p, t, 'Running'), 3000);
    }
    for (const t of p.tasks.slice(n)) {
      setPhase(p, t, 'Terminating');
      setTimeout(() => {
        p.tasks = p.tasks.filter((x) => x !== t);
        publish('task', { kind: 'task', member: p.atespace + '/' + t.name, gone: true, time: now() });
      }, 2000);
    }
    p.actual = n;
    return view(p);
  });

  on('DELETE', '/v1/pools/([^/]+)', (c, name) => {
    const p = poolOf(decodeURIComponent(name));
    if (!p) refuse(404, `no workers for ${decodeURIComponent(name)}`);
    ownerOnly(c, p.agent);
    for (const t of p.tasks) publish('task', { kind: 'task', member: p.atespace + '/' + t.name, gone: true, time: now() });
    FLEET.pools.splice(FLEET.pools.indexOf(p), 1);
    c.status = 204;
    return undefined;
  });

  on('GET', '/v1/bossmode/agents/([^/]+)/today', (c, a) => {
    const agent = decodeURIComponent(a);
    if (!AGENTS.some((x) => x.name === agent)) refuse(404, `no agent ${agent}`);
    // The fake counts the last 24 hours, so its sample runs count at any hour.
    const day = Date.now() - 24 * 3600_000;
    const runs = [...S.runs.values()].filter((r) => r.agent === agent && new Date(r.createdAt).getTime() >= day);
    let cost = 0;
    let decisions = 0;
    let partial = false;
    for (const r of runs) {
      if (r.usage && typeof r.usage.costUSD === 'number') cost += r.usage.costUSD;
      else partial = true;
      decisions += (S.transcripts.get(r.id) || []).filter((x) => x.kind === 'ask').length;
    }
    const out = { runs: runs.length, costUSD: Math.round(cost * 100) / 100, decisions };
    // A run that reports no cost leaves the sum short, and partial says so.
    return partial ? { ...out, partial: true } : out;
  });

}
