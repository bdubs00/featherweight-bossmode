// The packages of the workers of an agent, as the section Packages of its
// profile shows them. GET /v1/pools/{name}/packages answers the setting,
// the Python packages, the programs, and the state of each worker. The
// functions here are pure, so the tests read them without a page. They
// accept an answer with missing fields, because an older or a newer front
// can leave a field out.

import type { Agent, Fleet, PackageFailure, PackageItem, PackageSwitch, PackageWorker, Packages, PackagesBody } from '../api/types';
import type { Ability } from './tools';
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
  /** True when every worker that takes the change sleeps. */
  asleep?: boolean;
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
export function lineOf(p: Packages, asleep: (task: string) => boolean = () => false): PackageLine | null {
  if (!p.on) return null;
  const ws = p.workers || [];
  const failed = ws.find((w) => w.state === 'failed');
  if (failed) return { tone: 'red', text: `The install failed on ${failed.task}.`, failure: failed.failure || undefined };
  const total = ws.length;
  const waits = ws.filter((w) => w.state === 'pending' || w.state === 'materializing');
  const updating = waits.filter((w) => !asleep(w.task)).length;
  if (updating > 0) return { tone: 'amber', text: `Updating on ${updating} of ${total} ${workers(total)}.` };
  // A worker that sleeps takes the change when a request wakes it, which can take hours, so the line says so and promises no time.
  if (waits.length > 0) return { tone: 'grey', text: waits.length === 1 ? 'The change waits for its worker to wake up.' : `The change waits for ${waits.length} workers to wake up.`, asleep: true };
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

/* ---------- the check of a name, as the kernel makes it ---------- */

/**
 * The clauses of a refusal, as pkglist.CheckRequirement of the kernel
 * words them. A clause follows the name, and the server sends the
 * sentence "<name in quotes> <clause>.", so the page says the same.
 */
const NOT_PYTHON = 'is not a Python package: write a name with optional extras and a version, such as pyyaml, pyyaml>=6, or ansible-lint[yaml]==24.9.2';
const NOT_TOOL = 'is not a program: write a conda name with an optional version and build, such as jq, nodejs>=22, or nodejs 22.*';

const isAlnum = (c: string): boolean => /^[A-Za-z0-9]$/.test(c);
const isNameChar = (c: string): boolean => /^[A-Za-z0-9._-]$/.test(c);

/** nameEnd is the end of a name of PEP 508 that starts at i, or i when none starts there. A name starts and ends with a letter or a digit. */
function nameEnd(s: string, i: number): number {
  if (i >= s.length || !isAlnum(s[i])) return i;
  let j = i;
  while (j < s.length && isNameChar(s[j])) j++;
  return isAlnum(s[j - 1]) ? j : i;
}

/** versionOp is the length of the version operator of PEP 440 that starts s, or 0. */
function versionOp(s: string): number {
  for (const op of ['===', '~=', '==', '!=', '<=', '>=', '<', '>']) if (s.startsWith(op)) return op.length;
  return 0;
}

const skipSpaces = (s: string, i: number): number => {
  while (i < s.length && s[i] === ' ') i++;
  return i;
};

/** pythonClause checks a requirement of PEP 508 without a URL and without a condition, and answers the clause of a refusal, or "". */
function pythonClause(req: string): string {
  if (req.includes(';')) return 'holds a semicolon; a condition after a semicolon is not available, so write the name and the version alone, such as pyyaml>=6';
  if (req.includes('@') || req.includes('://')) return 'names a URL; name a package of the index instead, such as pyyaml>=6';
  let i = nameEnd(req, 0);
  if (i === 0) return NOT_PYTHON;
  const j = skipSpaces(req, i);
  if (j > i && j < req.length && isAlnum(req[j])) return 'holds a space inside the name';
  i = j;
  if (i < req.length && req[i] === '[') {
    i = skipSpaces(req, i + 1);
    while (i < req.length && req[i] !== ']') {
      const end = nameEnd(req, i);
      if (end === i) return NOT_PYTHON;
      i = skipSpaces(req, end);
      if (i < req.length && req[i] === ',') {
        i = skipSpaces(req, i + 1);
        // A comma needs a name after it.
        if (i < req.length && req[i] === ']') return NOT_PYTHON;
        continue;
      }
      break;
    }
    if (i >= req.length || req[i] !== ']') return NOT_PYTHON;
    i = skipSpaces(req, i + 1);
  }
  if (i === req.length) return '';
  const paren = req[i] === '(';
  if (paren) i = skipSpaces(req, i + 1);
  for (;;) {
    const op = versionOp(req.slice(i));
    if (op === 0) return NOT_PYTHON;
    i = skipSpaces(req, i + op);
    const start = i;
    while (i < req.length && (isAlnum(req[i]) || '_.*+!-'.includes(req[i]))) i++;
    if (i === start) return NOT_PYTHON;
    i = skipSpaces(req, i);
    if (i < req.length && req[i] === ',') {
      i = skipSpaces(req, i + 1);
      continue;
    }
    break;
  }
  if (paren) {
    if (i >= req.length || req[i] !== ')') return NOT_PYTHON;
    i = skipSpaces(req, i + 1);
  }
  return i === req.length ? '' : NOT_PYTHON;
}

/** toolClause checks a conda name with an optional version and an optional build, such as jq, nodejs>=22, or nodejs 22.*, and answers the clause of a refusal, or "". */
function toolClause(req: string): string {
  if (req.includes('::')) return 'names a channel; a channel is not available, so name a package of conda-forge, such as jq';
  let end = 0;
  while (end < req.length && (isAlnum(req[end]) || '-_.'.includes(req[end]))) end++;
  if (end === 0 || !isAlnum(req[0])) return NOT_TOOL;
  const rest = req.slice(end);
  if (rest === '') return '';
  if (!'<>=!~'.includes(rest[0]) && rest[0] !== ' ') return NOT_TOOL;
  const fields = rest.split(/\s+/).filter(Boolean);
  if (fields.length === 0 || fields.length > 2) return NOT_TOOL;
  // A version starts with a digit, a star, or an operator.
  if (!/^[0-9<>=!~*]/.test(fields[0])) return NOT_TOOL;
  for (let k = 0; k < fields.length; k++) {
    const allowed = k === 1 ? '*._+-' : '<>=!~*.,|_+-';
    for (const c of fields[k]) if (!isAlnum(c) && !allowed.includes(c)) return NOT_TOOL;
  }
  return '';
}

/**
 * requirementClause checks one name of a list as pkglist.CheckRequirement
 * of the kernel does, after the caller trims it: for Python a name of PEP
 * 508 with optional extras and versions, without a URL, a condition after
 * a semicolon, or a space inside the name, and for programs a conda name
 * with an optional version and build, without a channel. No quote and no
 * control character pass. It answers the clause of a refusal, or "".
 */
export function requirementClause(kind: PackageKind, req: string): string {
  if (req === '') return 'is empty';
  if (new TextEncoder().encode(req).length > MAX_NAME) return `is longer than ${MAX_NAME} characters`;
  if (req.startsWith('-')) return 'starts with a dash';
  if (/[\u0000-\u001f\u007f-\u009f]/.test(req)) return 'holds a control character';
  if (/["'`]/.test(req)) return 'holds a quote, which a package name never holds';
  return kind === 'python' ? pythonClause(req) : toolClause(req);
}

/**
 * nameProblem checks a package that a person adds, and answers the reason
 * of a refusal in one sentence, or "". The server refuses the same names
 * with the same sentence, the name in quotes and then the reason, so the
 * person reads it before the call. The list adds two rules of its own: a
 * name it holds, and its size.
 */
export function nameProblem(p: Packages, kind: PackageKind, raw: string): string {
  const name = raw.trim();
  if (!name) return 'Write the name of a package.';
  const clause = requirementClause(kind, name);
  if (clause) return JSON.stringify(name) + ' ' + clause + '.';
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

/* ---------- the switch and what an agent can do ---------- */

/** The base name of the tool that adds and removes packages, and of the rules that ask before it does. */
const ENV = 'env';

const baseName = (name: string): string => name.slice(Math.max(name.lastIndexOf('.'), name.lastIndexOf('/')) + 1);

/**
 * addsPackages reports whether the workers of an agent can add a package
 * on their own: the tool env adds one only while packages are on and the
 * agent may ask. Without a switch, the page cannot tell, so it trusts the
 * tools.
 */
export function addsPackages(sw: PackageSwitch | null | undefined): boolean {
  return !sw || (sw.on && sw.ask);
}

/** withPackages leaves out the ability of the tool env and its rules when the switch says that the agent cannot add a package. */
export function withPackages<T extends Pick<Ability, 'names'>>(abilities: T[], sw: PackageSwitch | null | undefined): T[] {
  if (addsPackages(sw)) return abilities;
  return abilities.filter((a) => !a.names.length || !a.names.every((n) => baseName(n) === ENV));
}

/** rulesWithPackages leaves out the rules of the tool env, such as env: command=add, when the agent cannot add a package. */
export function rulesWithPackages(rules: string[], sw: PackageSwitch | null | undefined): string[] {
  if (addsPackages(sw)) return rules;
  return rules.filter((r) => baseName((/^([^\s:]+)/.exec(r.trim()) || ['', ''])[1]) !== ENV);
}

/** switchWords says the switch of the packages of the workers of a new agent in one sentence. */
export function switchWords(sw: PackageSwitch): string {
  if (!sw.on) return 'Packages are off, so it has only the programs that it came with. Its profile can turn them on.';
  if (sw.ask) return 'Packages are on. It can ask for a package, and you approve each one.';
  return 'Packages are on. You add each package on its profile.';
}
