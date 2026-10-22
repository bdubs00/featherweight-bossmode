// The fake routes of Screen C: the wiki, the manager, the new-agent and new-bridge screens, Skills, and Appearance.
// Screen C owns this file. register gets the helpers of server.mjs: on
// adds a route, refuse answers a problem, readJson and readBody read the
// body, publish sends a stream event, S is the state, now is the time, and
// AGENTS and FLEET are the sample data.
//
// The routes here are the ones that the contract leaves open, in the
// shapes of the backend:
//
//   PUT  /v1/agents/{name}              a profile with workers {template?, replicas}.
//                                       201 for a new agent, 200 for a replaced one,
//                                       with pool when the front made workers.
//                                       ?dryRun=true checks, saves nothing, and
//                                       answers exists and the planned pool.
//   POST /v1/bossmode/runs/{id}/skill   {name, args?, text?}: a slash command of the
//                                       person, pinned in the run. 202 with the run.

import { hash } from './data.mjs';
import { identicon } from './faces.mjs';

/** The keys of the profile of the kernel, and workers. Any other key answers 400, as the backend does. */
const PROFILE_KEYS = ['name', 'description', 'system', 'instructions', 'skills', 'tools', 'model', 'effort', 'timeZone', 'policy', 'budget', 'access', 'outcome', 'compaction', 'workers'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/;
/** The workers of an agent when the request names no number, as fleet.DefaultWorkers. */
const DEFAULT_WORKERS = 2;
/** The worker templates of the fake. GET /v1/bossmode of the backend lists them as templates. */
const TEMPLATES = [
  { name: 'standard', default: true },
  { name: 'large', default: false },
];

export function register({ on, refuse, readJson, publish, S, now, AGENTS, FLEET }) {
  /** check refuses a profile that the backend refuses, with its words. */
  const check = (name, body) => {
    if (!NAME.test(name) || name.startsWith('.')) refuse(400, `invalid profile name "${name}"`);
    for (const k of Object.keys(body)) if (!PROFILE_KEYS.includes(k)) refuse(400, `json: unknown field "${k}"`);
    if (body.name && body.name !== name) refuse(400, `the body names the profile "${body.name}" but the path names "${name}"`);
    if (body.effort && !EFFORTS.includes(body.effort)) refuse(400, `effort must be one of ${EFFORTS.join(', ')}`);
    if (body.skills !== undefined && !Array.isArray(body.skills)) refuse(400, 'skills must be a list of names');
    if (body.compaction && (!Number.isInteger(body.compaction.at) || body.compaction.at < 0)) refuse(400, 'compaction.at must be a whole number of tokens');
    const w = body.workers;
    if (w !== undefined) {
      if (typeof w !== 'object' || w === null) refuse(400, 'workers must be an object');
      for (const k of Object.keys(w)) if (k !== 'template' && k !== 'replicas') refuse(400, `json: unknown field "${k}"`);
      if (w.replicas !== undefined && (!Number.isInteger(w.replicas) || w.replicas < 1 || w.replicas > 32)) refuse(400, 'workers.replicas must be between 1 and 32');
      if (w.template !== undefined && !TEMPLATES.some((t) => t.name === w.template)) refuse(400, `no worker template ${w.template}; the templates are ${TEMPLATES.map((t) => t.name).join(', ')}`);
    }
  };

  /** planned is the pool that a save makes for an agent that no pool runs yet. */
  const planned = (name, w) => {
    const replicas = (w && w.replicas) || DEFAULT_WORKERS;
    const template = (w && w.template) || TEMPLATES.find((t) => t.default).name;
    return { name, source: 'runtime', template, atespace: 'default', agent: name, intake: 'fw.jobs.' + name, wanted: replicas, actual: 0, ready: 0, hash: '', tasks: [], checkedAt: now() };
  };

  on('PUT', '/v1/agents/([^/]+)', async (c, raw) => {
    const name = decodeURIComponent(raw);
    const body = await readJson(c.req);
    check(name, body);
    const known = AGENTS.find((a) => a.name === name);
    const runs = FLEET.pools.find((p) => p.agent === name);
    const makesPool = !runs;
    if (c.url.searchParams.get('dryRun') === 'true') {
      const out = { name, description: body.description || '', role: 'owner', exists: !!known };
      if (makesPool) out.pool = planned(name, body.workers);
      return out;
    }
    if (known) {
      known.description = body.description || known.description;
    } else {
      AGENTS.push({ name, description: body.description || '', role: 'owner', displayName: name, tagline: body.description || '' });
      const svg = identicon(name);
      const face = { agent: name, displayName: name, tagline: body.description || '', svg, hash: hash(svg + name), custom: false };
      S.faces.set(name, face);
      publish('face', { agent: name, displayName: name, tagline: face.tagline, hash: face.hash, custom: false });
    }
    let pool = null;
    if (makesPool) {
      pool = planned(name, body.workers);
      pool.actual = pool.wanted;
      pool.tasks = Array.from({ length: pool.wanted }, (_, i) => ({ name: `${name}-${i}`, phase: 'Pending', current: true, note: 'Starts.' }));
      FLEET.pools.push(pool);
      for (const t of pool.tasks) {
        FLEET.members.push({ name: 'default/' + t.name, self: false, state: 'suspended', lastSeen: now(), canForward: true, accessMode: 'static', agents: [{ name, role: 'owner' }], active: 0, inputRequired: 0 });
      }
      // The workers start a moment later, as Tasks of a new pool do.
      setTimeout(() => {
        for (const t of pool.tasks) {
          Object.assign(t, { phase: 'Running', note: undefined });
          const m = FLEET.members.find((x) => x.name === 'default/' + t.name);
          if (m) Object.assign(m, { state: 'live', lastSeen: now() });
          publish('task', { kind: 'task', member: 'default/' + t.name, phase: 'Running', time: now() });
          publish('member', { kind: 'member', member: 'default/' + t.name, state: 'live', time: now() });
        }
        pool.ready = pool.wanted;
      }, 3000);
    }
    c.status = known ? 200 : 201;
    return { name, description: body.description || '', role: 'owner', ...(pool ? { pool } : {}) };
  });

  on('POST', '/v1/bossmode/runs/([^/]+)/skill', async (c, raw) => {
    const id = decodeURIComponent(raw);
    const run = S.runs.get(id);
    if (!run) refuse(404, `no run ${id}`);
    const body = await readJson(c.req);
    for (const k of Object.keys(body)) if (!['name', 'args', 'text'].includes(k)) refuse(400, `json: unknown field "${k}"`);
    const name = String(body.name || '').replace(/^\//, '');
    if (!/^[a-z0-9][a-z0-9._/-]*$/.test(name)) refuse(400, 'a slash command names a skill');
    if (run.state === 'failed' || run.state === 'canceled') refuse(409, `the run ${id} ${run.state === 'failed' ? 'failed' : 'was canceled'}, so it takes no message`);
    const items = S.transcripts.get(id);
    const seq = items[items.length - 1].seq + 1;
    const line = '/' + name + (body.args ? ' ' + body.args : '') + (body.text ? '\n\n' + body.text : '');
    items.push({ seq, time: now(), kind: 'user', text: line, who: c.person.subject });
    Object.assign(run, { state: 'running', seq, updatedAt: now(), activity: { turn: 1, tool: 'skill', phrase: 'Read the skill ' + name, since: now() } });
    publish('run', run);
    // The run answers a moment later. A run of the front sends no stream
    // event in the backend, so the page reads it with a poll.
    setTimeout(() => {
      const n = items[items.length - 1].seq + 1;
      const text = `I loaded **${name}**${body.args ? ' for `' + body.args + '`' : ''}. Tell me what to apply it to, or I start with the open bridge.`;
      items.push({ seq: n, time: now(), kind: 'assistant', text });
      items.push({ seq: n + 1, time: now(), kind: 'end', text: 'completed' });
      Object.assign(run, { state: 'completed', output: text, seq: n + 1, updatedAt: now(), activity: null });
      publish('run', run);
    }, 2500);
    c.status = 202;
    return run;
  });
}

export { TEMPLATES };
