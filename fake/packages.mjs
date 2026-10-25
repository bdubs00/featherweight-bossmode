// The fake routes of the packages of a pool (section 6.5 of the Packages
// plan of 2026-10-25). register gets the helpers of server.mjs: on adds a
// route, refuse answers a problem, readJson reads the body, S is the state,
// now is the time, and AGENTS and FLEET are the sample data.
//
// The routes:
//   GET /v1/pools/{name}/packages                the setting, the packages, and the state of each worker
//   PUT /v1/pools/{name}/packages[?dryRun=true]  {on, ask, python, tools} replaces them, for an owner
//
// The workers of crew, the pool of migrator, have packages: ansible-lint,
// which migrator asked for, and iproute2. Every other pool starts off. With
// FAKE_ASK=env, the manager asks for a Python package, and its pool starts
// on. A change makes each worker install for a few seconds, one after the
// other, and then it is ready. A package named does-not-exist fails, with a
// short output. An allowed call of env adds its package to the list.

/** The most characters of one package, and the most packages of one list, as the kernel takes them. */
const MAX_NAME = 200;
const MAX_ITEMS = 100;
/** The time until a worker starts its install, the time between two workers, and the time of one install, in milliseconds. */
const START_MS = 1000;
const STEP_MS = 2000;
const INSTALL_MS = 4000;
/** The package that never installs. */
const BAD = 'does-not-exist';

/** The output of a failed install of each kind, as the manager prints it. */
const FAILED_OUTPUT = {
  python: (name) =>
    `Resolving the requirements of the environment\n  × No solution found when resolving dependencies:\n  ╰─▶ Because ${name} was not found in the package registry and you require ${name}, we can conclude that your requirements are unsatisfiable.\n`,
  tools: (name) => `Error:   × failed to solve the environment\n  ╰─▶ Cannot solve the request because of: No candidates were found for ${name} *.\n`,
};

/** nameOf is the name of a requirement without its version, such as pyyaml for pyyaml>=6. */
const nameOf = (req) => String(req).trim().split(/[\s<>=!~;[]/)[0].toLowerCase();

/** versionOf gives a believable version for an installed package. */
const versionOf = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${1 + (h % 24)}.${(h >>> 5) % 10}.${(h >>> 9) % 7}`;
};

export function register({ on, refuse, readJson, S, now, AGENTS, FLEET }) {
  /** The packages of each pool by its name: the setting, the lists, the workers, and the timers of a change. */
  const byPool = new Map();
  const stamp = (name, by, at, extra = {}) => ({ name, by, at, ...extra });
  const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

  const poolOf = (name) => FLEET.pools.find((p) => p.name === name);

  /** stateOf answers the record of a pool, and makes one, off, for a pool that has none. */
  const stateOf = (pool) => {
    let st = byPool.get(pool.name);
    if (!st) {
      st = { on: false, ask: true, python: [], tools: [], workers: new Map(), applying: false, timers: [] };
      byPool.set(pool.name, st);
    }
    // A worker that the record does not know yet installs what the pool has, as a new worker does at its start.
    for (const t of pool.tasks) {
      if (st.workers.has(t.name)) continue;
      st.workers.set(t.name, { task: t.name, state: st.on ? 'materializing' : 'unknown', at: now() });
      if (st.on) setTimeout(() => finish(st, t.name), INSTALL_MS);
    }
    for (const name of [...st.workers.keys()]) if (!pool.tasks.some((t) => t.name === name)) st.workers.delete(name);
    return st;
  };

  /** finish ends the install of one worker: ready with its packages, or failed on the package that does not exist. */
  const finish = (st, task) => {
    const w = st.workers.get(task);
    if (!w) return;
    const bad = st.on ? ['python', 'tools'].map((k) => [k, st[k].find((x) => nameOf(x.name) === BAD)]).find(([, x]) => x) : null;
    if (bad) {
      const [step, item] = bad;
      Object.assign(w, { state: 'failed', at: now(), failure: { step, error: `the install of ${item.name} failed`, output: FAILED_OUTPUT[step](item.name), retryAt: new Date(Date.now() + 10 * 60_000).toISOString() } });
      delete w.installed;
      delete w.digest;
    } else {
      const installed = (k) => (st.on ? st[k].map((x) => ({ name: nameOf(x.name), version: versionOf(nameOf(x.name)) })) : []);
      Object.assign(w, { state: 'ready', at: now(), digest: 'sha256:' + versionOf(JSON.stringify([st.python, st.tools])).replace(/\./g, ''), installed: { python: installed('python'), tools: installed('tools') } });
      delete w.failure;
    }
  };

  /**
   * apply rolls a change through the workers, one after the other: each
   * one waits for its turn, installs for a few seconds, and is then ready,
   * or failed. applying stays true until the last one ends.
   */
  const apply = (st) => {
    for (const t of st.timers) clearTimeout(t);
    st.timers = [];
    st.applying = true;
    const tasks = [...st.workers.keys()];
    tasks.forEach((task, i) => {
      st.timers.push(
        setTimeout(() => {
          const w = st.workers.get(task);
          if (w) Object.assign(w, { state: st.on ? 'materializing' : 'pending', at: now() });
        }, START_MS + i * STEP_MS),
      );
      st.timers.push(setTimeout(() => finish(st, task), START_MS + i * STEP_MS + INSTALL_MS));
    });
    st.timers.push(setTimeout(() => (st.applying = false), START_MS + Math.max(0, tasks.length - 1) * STEP_MS + INSTALL_MS + 50));
  };

  /** view is the answer of both routes. */
  const view = (pool, st) => ({
    pool: pool.name,
    available: true,
    on: st.on,
    ask: st.ask,
    python: st.python.map((x) => ({ ...x })),
    tools: st.tools.map((x) => ({ ...x })),
    applying: st.applying,
    workers: [...st.workers.values()].map((w) => ({ ...w })),
  });

  /** check refuses a body that the front refuses, with the problem of the first wrong field. */
  const check = (body) => {
    for (const k of Object.keys(body)) if (!['on', 'ask', 'python', 'tools'].includes(k)) refuse(400, `unknown field ${k}`);
    for (const k of ['on', 'ask']) if (body[k] !== undefined && typeof body[k] !== 'boolean') refuse(400, `${k} must be true or false`);
    for (const k of ['python', 'tools']) {
      const list = body[k] === undefined ? [] : body[k];
      if (!Array.isArray(list)) refuse(400, `${k} must be a list of packages`);
      if (list.length > MAX_ITEMS) refuse(400, `${k} holds ${list.length} packages, and a list holds ${MAX_ITEMS} at most`);
      const seen = new Set();
      for (const x of list) {
        if (typeof x !== 'string' || !x.trim()) refuse(400, `${k} holds a package that is not a name`);
        const r = x.trim();
        if (r.startsWith('-')) refuse(400, `the package ${r} starts with a dash`);
        if (/[\u0000-\u001f\u007f]/.test(r)) refuse(400, `a package of ${k} holds a control character`);
        if (r.length > MAX_NAME) refuse(400, `a package of ${k} holds more than ${MAX_NAME} characters`);
        if (seen.has(nameOf(r))) refuse(400, `${k} names ${nameOf(r)} twice`);
        seen.add(nameOf(r));
      }
    }
  };

  /** merge keeps who added each package that stays, and stamps a new one with the person. */
  const merge = (old, names, person) => names.map((n) => old.find((x) => x.name === n.trim()) || stamp(n.trim(), person.subject, now()));

  // The sample data: crew has packages, and the manager asks for one with FAKE_ASK=env.
  const crew = poolOf('crew');
  if (crew) {
    const st = stateOf(crew);
    Object.assign(st, {
      on: true,
      ask: true,
      python: [stamp('ansible-lint', 'alice@example.com', minutesAgo(90), { agent: 'migrator', run: 'run-migrator-1' })],
      tools: [stamp('iproute2', 'alice@example.com', minutesAgo(200))],
    });
    for (const w of st.workers.values()) w.state = 'materializing';
    for (const task of st.workers.keys()) finish(st, task);
  }
  const managerPool = poolOf('manager');
  if (managerPool && process.env.FAKE_ASK === 'env') {
    const st = Object.assign(stateOf(managerPool), { on: true, ask: true });
    for (const task of st.workers.keys()) finish(st, task);
  }

  on('GET', '/v1/pools/([^/]+)/packages', (c, raw) => {
    const pool = poolOf(decodeURIComponent(raw));
    if (!pool) refuse(404, `no workers for ${decodeURIComponent(raw)}`);
    return view(pool, stateOf(pool));
  });

  on('PUT', '/v1/pools/([^/]+)/packages', async (c, raw) => {
    const pool = poolOf(decodeURIComponent(raw));
    if (!pool) refuse(404, `no workers for ${decodeURIComponent(raw)}`);
    const a = AGENTS.find((x) => x.name === pool.agent);
    if (!a || a.role !== 'owner') refuse(403, `only an owner of ${pool.agent} can change its packages`);
    const body = await readJson(c.req);
    check(body);
    const st = stateOf(pool);
    const next = {
      on: body.on === undefined ? st.on : body.on,
      ask: body.ask === undefined ? st.ask : body.ask,
      python: body.python === undefined ? st.python : merge(st.python, body.python, c.person),
      tools: body.tools === undefined ? st.tools : merge(st.tools, body.tools, c.person),
    };
    if (c.url.searchParams.get('dryRun') === 'true') return view(pool, { ...st, ...next });
    const same = next.on === st.on && next.ask === st.ask && JSON.stringify(next.python) === JSON.stringify(st.python) && JSON.stringify(next.tools) === JSON.stringify(st.tools);
    Object.assign(st, next);
    if (!same) apply(st);
    return view(pool, st);
  });

  /** An allowed call of env adds its package to the list of the pool of its agent, or removes it, and the workers get the change. */
  S.decided = S.decided || [];
  S.decided.push((run, pending, decision, person) => {
    if (decision !== 'allow' || !pending || String(pending.tool || '').split(/\.|__/).pop() !== 'env') return;
    const input = pending.input || {};
    const k = input.manager === 'tools' ? 'tools' : input.manager === 'python' ? 'python' : '';
    const name = String(input.package || '').trim();
    const pool = FLEET.pools.find((p) => p.agent === run.agent);
    if (!k || !name || !pool) return;
    const st = stateOf(pool);
    if (!st.on) return;
    if (input.command === 'add' && !st[k].some((x) => nameOf(x.name) === nameOf(name))) st[k] = [...st[k], stamp(name, person.subject, now(), { agent: run.agent, run: run.id })];
    else if (input.command === 'remove') st[k] = st[k].filter((x) => nameOf(x.name) !== nameOf(name));
    else return;
    apply(st);
  });
}
