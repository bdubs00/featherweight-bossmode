// The fake routes of Screen B: the fleet, the member conversation, the profile, Activity, and the board.
// Screen B owns this file. register gets the helpers of server.mjs: on
// adds a route, refuse answers a problem, readJson and readBody read the
// body, publish sends a stream event, S is the state, now is the time, and
// AGENTS and FLEET are the sample data.
//
// The routes:
//   GET    /v1/pools/{name}                     the workers of an agent
//   PATCH  /v1/pools/{name}                     {"replicas": n} changes Keep, for an owner
//   DELETE /v1/pools/{name}                     removes the workers, for an owner
//   GET    /v1/bossmode/agents/{agent}/today    {"runs", "costUSD", "decisions"} of the day
//   POST   /v1/bossmode/runs/{id}/skill         {"name", "args"} runs a skill in a run
//
// The name of a pool is the name of its agent in lower case, with a hyphen
// for each character that is not a letter or a digit.

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

/** The cost of a sample turn, so Today shows a cost. */
const TURN_USD = 0.05;

export function register({ on, refuse, readJson, publish, S, now, AGENTS, FLEET }) {
  for (const [id, member] of Object.entries(WORKER_OF_RUN)) {
    const r = S.runs.get(id);
    if (r) r.member = member;
  }

  // A recent step of migrator-1, so its thread holds a quiet step line between its messages.
  const items = S.transcripts.get('run-migrator-1');
  const run = S.runs.get('run-migrator-1');
  if (items && run) {
    const at = new Date(Date.now() - 44 * 60_000).toISOString();
    const seq = items[items.length - 1].seq + 1;
    items.push({ seq, time: at, kind: 'tool', tool: 'bash', callId: 'c9', input: { command: 'ansible-lint roles/cron' } });
    items.push({ seq: seq + 1, time: at, kind: 'result', tool: 'bash', callId: 'c9', text: 'Passed.' });
    run.seq = seq + 1;
  }

  const poolOf = (name) => FLEET.pools.find((p) => poolName(p.agent) === name);
  const view = (p) => ({
    name: poolName(p.agent),
    agent: p.agent,
    wanted: p.wanted,
    actual: p.tasks.length,
    ready: p.tasks.filter((t) => t.phase === 'Running' || t.phase === 'Suspended').length,
    tasks: p.tasks.map((t) => ({ name: t.name, phase: t.phase, current: t.current !== false, ...(t.note ? { note: t.note } : {}) })),
    gaps: p.gaps || [],
    source: 'config',
    template: 'default',
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
    let turns = 0;
    let decisions = 0;
    for (const r of runs) {
      turns += (r.usage && r.usage.turns) || 0;
      decisions += (S.transcripts.get(r.id) || []).filter((x) => x.kind === 'ask').length;
    }
    return { runs: runs.length, costUSD: Math.round(turns * TURN_USD * 100) / 100, decisions };
  });

  on('POST', '/v1/bossmode/runs/([^/]+)/skill', async (c, id) => {
    const run = S.runs.get(id);
    if (!run) refuse(404, `no run ${id}`);
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (k !== 'name' && k !== 'args') refuse(400, `unknown field ${k}`);
    const name = String(body.name || '');
    if (!/^[A-Za-z0-9._-]+$/.test(name)) refuse(400, 'a skill needs a name');
    if (run.state === 'failed' || run.state === 'canceled') refuse(409, `the run ${id} ended, so it takes no skill`);
    const items = S.transcripts.get(id);
    const args = String(body.args || '');
    let seq = items[items.length - 1].seq + 1;
    items.push({ seq, time: now(), kind: 'user', text: '/' + name + (args ? ' ' + args : ''), who: c.person.subject });
    Object.assign(run, { state: 'running', seq, updatedAt: now(), activity: { turn: 1, phrase: 'Read the skill ' + name, since: now() } });
    publish('run', run);
    setTimeout(() => {
      seq = items[items.length - 1].seq + 1;
      items.push({ seq, time: now(), kind: 'tool', tool: 'files', callId: 'sk' + seq, input: { op: 'read', path: 'skills/' + name + '/SKILL.md' } });
      items.push({ seq: seq + 1, time: now(), kind: 'result', tool: 'files', callId: 'sk' + seq, text: 'Read.' });
      const text = `I followed the skill **${name}**${args ? ` for \`${args}\`` : ''}. The plan is in the wiki.`;
      items.push({ seq: seq + 2, time: now(), kind: 'assistant', text });
      items.push({ seq: seq + 3, time: now(), kind: 'end', text: 'completed' });
      Object.assign(run, { state: 'completed', output: text, seq: seq + 3, updatedAt: now(), activity: null });
      publish('run', run);
    }, 2500);
    c.status = 202;
    return { run: id, seq };
  });
}
