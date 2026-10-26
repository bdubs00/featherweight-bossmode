// The packages of the workers of an agent, as the section Packages of its
// profile shows them. GET /v1/pools/{name}/packages answers the setting,
// the Python packages, the programs, and the state of each worker. The
// functions here are pure, so the tests read them without a page. They
// accept an answer with missing fields, because an older or a newer front
// can leave a field out.

import type { Agent, Fleet, PackageFailure, PackageItem, PackageWorker, Packages, PackagesBody } from '../api/types';
import type { Tone } from './presence';

/** The time between two reads while a change reaches the workers. */
export const POLL_MS = 5000;

/** The most characters of one package, and the most packages of one list, as the kernel takes them. */
export const MAX_NAME = 200;
export const MAX_ITEMS = 100;

/** The two kinds of package: a Python package, or a program. The keys are the keys of the route. */
export type PackageKind = 'python' | 'tools';

/** The words of each kind, as the section shows them. */
export const KIND_WORDS: Record<PackageKind, { one: string; many: string }> = {
  python: { one: 'Python package', many: 'Python packages' },
  tools: { one: 'Program', many: 'Programs' },
};

const STATES = ['pending', 'materializing', 'ready', 'failed', 'unknown'];

/** itemsOf reads one list of the answer. A plain name stands for an item with that name. */
function itemsOf(v: unknown): PackageItem[] {
  if (!Array.isArray(v)) return [];
  const out: PackageItem[] = [];
  for (const x of v) {
    if (typeof x === 'string' && x.trim()) out.push({ name: x.trim() });
    else if (x && typeof x === 'object' && typeof (x as PackageItem).name === 'string' && (x as PackageItem).name.trim()) out.push({ ...(x as PackageItem), name: (x as PackageItem).name.trim() });
  }
  return out;
}

/** workersOf reads the workers of the answer. A worker with a state that the page does not know is unknown. */
function workersOf(v: unknown): PackageWorker[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((w): w is PackageWorker => !!w && typeof w === 'object' && typeof (w as PackageWorker).task === 'string')
    .map((w) => ({ ...w, state: STATES.includes(w.state) ? w.state : 'unknown' }));
}

/** normalize makes an answer whole: every list exists, and on, ask, and applying are true or false. */
export function normalize(p: Partial<Packages> | null | undefined, pool = ''): Packages {
  const v = p || {};
  return {
    pool: typeof v.pool === 'string' && v.pool ? v.pool : pool,
    available: v.available !== false,
    on: !!v.on,
    ask: !!v.ask,
    python: itemsOf(v.python),
    tools: itemsOf(v.tools),
    applying: !!v.applying,
    workers: workersOf(v.workers),
  };
}

/** bodyOf is the body of a PUT that keeps the answer as it is. A change of the section overrides a part of it. */
export function bodyOf(p: Packages): PackagesBody {
  return { on: p.on, ask: p.ask, python: p.python.map((x) => x.name), tools: p.tools.map((x) => x.name) };
}

/** The state line of the section: its light, its sentence, and the failure of a worker. */
export interface PackageLine {
  tone: Tone;
  text: string;
  /** The failure of the worker that the line names, for the fold of its output. */
  failure?: PackageFailure;
}

const workers = (n: number) => (n === 1 ? 'worker' : 'workers');

/**
 * lineOf is the state line of the packages of an agent, or null when there
 * is nothing to say: packages are off, no worker runs, or the lists are
 * empty and nothing changes. A failed worker comes first, then the workers
 * that take a change, then the count of the workers that are ready. A
 * running worker takes a change in place, so no change waits for an idle
 * worker.
 */
export function lineOf(p: Packages): PackageLine | null {
  if (!p.on) return null;
  const ws = p.workers || [];
  const failed = ws.find((w) => w.state === 'failed');
  if (failed) return { tone: 'red', text: `The install failed on ${failed.task}.`, failure: failed.failure || undefined };
  const total = ws.length;
  const updating = ws.filter((w) => w.state === 'pending' || w.state === 'materializing').length;
  if (updating > 0) return { tone: 'amber', text: `Updating on ${updating} of ${total} ${workers(total)}.` };
  if (total === 0 || (p.python.length === 0 && p.tools.length === 0)) return null;
  const ready = ws.filter((w) => w.state === 'ready').length;
  return { tone: ready === total ? 'green' : 'grey', text: `Ready on ${ready} of ${total} ${workers(total)}.` };
}

/**
 * shouldPoll reports whether the section reads the route again in
 * POLL_MS: while a change reaches the workers, or while packages are on
 * and a worker is not ready. Otherwise the section reads it on open only.
 */
export function shouldPoll(p: Packages | null | undefined): boolean {
  if (!p) return false;
  if (p.applying) return true;
  return p.on && (p.workers || []).some((w) => w.state !== 'ready');
}

/**
 * nameProblem checks a package that a person adds, and answers the reason
 * of a refusal in one sentence, or "". The kernel refuses the same names,
 * so the person reads the reason before the call.
 */
export function nameProblem(p: Packages, kind: PackageKind, raw: string): string {
  const name = raw.trim();
  if (!name) return 'Write the name of a package.';
  if (name.startsWith('-')) return 'A package name cannot start with a dash.';
  if (/[\u0000-\u001f\u007f]/.test(name)) return 'A package name cannot hold a control character.';
  if (name.length > MAX_NAME) return `A package name holds ${MAX_NAME} characters at most.`;
  const list = p[kind];
  if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) return `${name} is in the list already.`;
  if (list.length >= MAX_ITEMS) return `A list holds ${MAX_ITEMS} packages at most.`;
  return '';
}

/**
 * poolOfAgent names the pool whose workers run an agent: the field pool of
 * the agent list, else the pool of the profile that the page read, else
 * the pool of the fleet that runs the agent. It answers "" for an agent
 * that no pool runs, such as a profile of the front itself.
 */
export function poolOfAgent(listed: Agent | undefined, read: Agent | null | undefined, fleet: Fleet | null | undefined, agent: string): string {
  if (listed && listed.pool) return listed.pool;
  if (read && read.pool) return read.pool;
  if ((listed && listed.front) || (read && read.front)) return '';
  const p = fleet && fleet.pools ? fleet.pools.find((x) => x.agent === agent) : undefined;
  return p ? p.name : '';
}

/**
 * keyOf is the key of a package name for a match: the name without its
 * version, in lower case, with each run of dashes, underscores, and dots
 * as one dash, as the Python index compares names. pyyaml>=6 and PyYAML
 * give pyyaml.
 */
export function keyOf(req: string): string {
  const name = String(req).trim().split(/[\s<>=!~;[@]/)[0];
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * versionsOf names the installed version of each package of a kind, by the
 * key of its name, from the workers that are ready. The first ready worker
 * that names a package gives its version.
 */
export function versionsOf(p: Packages, kind: PackageKind): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of p.workers || []) {
    if (w.state !== 'ready' || !w.installed) continue;
    for (const x of w.installed[kind] || []) {
      if (!x || typeof x.name !== 'string' || typeof x.version !== 'string' || !x.version) continue;
      const k = keyOf(x.name);
      if (!out.has(k)) out.set(k, x.version);
    }
  }
  return out;
}
