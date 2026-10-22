// The catalog of skills and tools, as the Skills place, the picker of
// skills, and the slash menu of the manager read it. The routes answer two
// shapes: the shape of docs/CONTRACT.md section 12, which the fake server
// serves, and the shape of the backend, where origin is "imported", empty
// for a local skill, or names a server. catalogOf reads both into one shape.
// Screen C owns this file.

import type { Skill, SkillsList, Tool } from '../api/types';

/** The three kinds of origin of a skill. */
export type SkillKind = 'imported' | 'local' | 'server';

/** One skill of the catalog, in the one shape that the screens read. */
export interface CatalogSkill {
  name: string;
  description: string;
  kind: SkillKind;
  /** The tool server of a skill of kind server, else "". */
  server: string;
  /** For an imported skill: the marketplace or the address it came from. */
  source: string;
  license: string;
  allowedTools: string[];
  /** The agents that can load the skill. The backend can leave them out. */
  agents: string[];
  /** The slash command, such as /ansible-style, or "" when no person can hand the skill to a run. */
  slash: string;
  argumentHint: string;
}

/** One tool of the catalog: built in, or from a tool server. */
export interface CatalogTool {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  server: string;
  agents: string[];
}

export interface Group<T> {
  key: string;
  title: string;
  /** The server of a group of a server, else "". */
  server: string;
  items: T[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' && v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

/** skillOf reads one skill of either shape. */
export function skillOf(raw: Partial<Skill> & Record<string, unknown>): CatalogSkill {
  const name = str(raw.name);
  const origin = str(raw.origin);
  const server = str(raw.server);
  let kind: SkillKind;
  let sv = '';
  if (origin === 'imported') kind = 'imported';
  else if ((origin === '' || origin === 'local') && !server) kind = 'local';
  else {
    kind = 'server';
    // The contract says origin server and names it in server. The backend
    // can also put the name of the server in origin.
    sv = server || (origin === 'server' || origin === 'mcp' ? 'server' : origin);
  }
  const slash = typeof raw.slash === 'string' ? raw.slash : raw.userInvocable === false ? '' : '/' + name;
  return {
    name,
    description: str(raw.description),
    kind,
    server: sv,
    source: str(raw.source),
    license: str(raw.license),
    allowedTools: strs(raw['allowed-tools']),
    agents: strs(raw.agents),
    slash,
    argumentHint: str(raw.argumentHint),
  };
}

/** toolOf reads one tool of the contract, or one capability of GET /v1/tools. */
export function toolOf(raw: Partial<Tool> & Record<string, unknown>): CatalogTool {
  const name = str(raw.name);
  const source = str(raw.source);
  const origin = str(raw.origin);
  const builtin = origin ? origin === 'builtin' : !source || source === 'builtin';
  const server = builtin ? '' : str(raw.server) || (source && source !== 'builtin' ? source : '') || 'server';
  const id = str(raw.id) || (builtin || name.startsWith(server + '/') ? name : server + '/' + name);
  return { id, name, description: str(raw.text) || str(raw.description), builtin, server, agents: strs(raw.agents) };
}

/** catalogOf reads the answer of GET /v1/bossmode/skills, sorted by name in each kind. */
export function catalogOf(list: SkillsList | null | undefined): { skills: CatalogSkill[]; tools: CatalogTool[] } {
  if (!list) return { skills: [], tools: [] };
  const skills = (list.skills || []).map((s) => skillOf(s as Skill & Record<string, unknown>)).filter((s) => s.name);
  const tools = (list.tools || []).map((t) => toolOf(t as Tool & Record<string, unknown>)).filter((t) => t.name);
  return { skills, tools };
}

const byName = <T extends { name: string }>(a: T, b: T) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** skillGroups groups the skills: Imported, Local, then one group per server, by name. Empty groups leave. */
export function skillGroups(skills: CatalogSkill[]): Group<CatalogSkill>[] {
  const out: Group<CatalogSkill>[] = [
    { key: 'imported', title: 'Imported', server: '', items: skills.filter((s) => s.kind === 'imported').sort(byName) },
    { key: 'local', title: 'Local', server: '', items: skills.filter((s) => s.kind === 'local').sort(byName) },
  ];
  const servers = [...new Set(skills.filter((s) => s.kind === 'server').map((s) => s.server))].sort();
  for (const sv of servers) out.push({ key: 'server:' + sv, title: sv, server: sv, items: skills.filter((s) => s.kind === 'server' && s.server === sv).sort(byName) });
  return out.filter((g) => g.items.length > 0);
}

/** toolGroups groups the tools: Built in, then one group per server. Empty groups leave. */
export function toolGroups(tools: CatalogTool[]): Group<CatalogTool>[] {
  const out: Group<CatalogTool>[] = [{ key: 'builtin', title: 'Built in', server: '', items: tools.filter((t) => t.builtin).sort(byName) }];
  const servers = [...new Set(tools.filter((t) => !t.builtin).map((t) => t.server))].sort();
  for (const sv of servers) out.push({ key: 'server:' + sv, title: sv, server: sv, items: tools.filter((t) => !t.builtin && t.server === sv).sort(byName) });
  return out.filter((g) => g.items.length > 0);
}

/* ---------- the names of a profile ---------- */

/** globOf is the name in profile.skills that turns on every skill of a server. */
export const globOf = (server: string): string => server + '/*';

/** matches reports whether one entry of profile.skills, a name or a glob with *, names a skill. */
export function matches(entry: string, s: Pick<CatalogSkill, 'name' | 'kind' | 'server'>): boolean {
  if (entry === s.name) return true;
  if (s.kind === 'server' && entry === globOf(s.server)) return true;
  if (!entry.includes('*')) return false;
  const re = new RegExp('^' + entry.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return re.test(s.name);
}

/** isOn reports whether the names of a profile turn a skill on. */
export function isOn(value: string[], s: Pick<CatalogSkill, 'name' | 'kind' | 'server'>): boolean {
  return value.some((e) => matches(e, s));
}

/**
 * toggleSkill turns one skill on or off. A skill of a server whose glob is
 * on stays on through the glob, so turning it off replaces the glob with
 * the names of the other skills of that server.
 */
export function toggleSkill(value: string[], s: CatalogSkill, on: boolean, all: CatalogSkill[]): string[] {
  if (on) return isOn(value, s) ? value : [...value, s.name];
  let next = value.filter((e) => e !== s.name);
  if (s.kind === 'server' && next.includes(globOf(s.server))) {
    const rest = all.filter((x) => x.kind === 'server' && x.server === s.server && x.name !== s.name).map((x) => x.name);
    next = next.filter((e) => e !== globOf(s.server));
    next = [...next, ...rest.filter((n) => !next.includes(n))];
  }
  return next;
}

/**
 * toggleGroup turns every skill of a group on or off. A whole server goes
 * on as its glob, server/*, so a skill that the server adds later is on
 * too. Imported and local skills go on by name.
 */
export function toggleGroup(value: string[], g: Group<CatalogSkill>, on: boolean): string[] {
  const names = new Set(g.items.map((s) => s.name));
  let next = value.filter((e) => !names.has(e));
  if (g.server) {
    next = next.filter((e) => e !== globOf(g.server));
    return on ? [...next, globOf(g.server)] : next;
  }
  return on ? [...next, ...g.items.map((s) => s.name)] : next;
}

/** groupState says whether none, some, or all of the skills of a group are on. */
export function groupState(value: string[], g: Group<CatalogSkill>): 'none' | 'some' | 'all' {
  const n = g.items.filter((s) => isOn(value, s)).length;
  return n === 0 ? 'none' : n === g.items.length ? 'all' : 'some';
}

/* ---------- the front matter of a SKILL.md ---------- */

/**
 * frontMatterOf splits a SKILL.md into the keys of its front matter and its
 * body. A value in brackets is a list. A file without front matter has no
 * keys.
 */
export function frontMatterOf(text: string): { keys: [string, string][]; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(String(text || ''));
  if (!m) return { keys: [], body: String(text || '') };
  const keys: [string, string][] = [];
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean).join(', ');
    else v = v.replace(/^["']|["']$/g, '');
    keys.push([kv[1], v]);
  }
  return { keys, body: String(text).slice(m[0].length) };
}

/** valueText writes one value of a front matter map as text. */
export function valueText(v: unknown): string {
  if (Array.isArray(v)) return v.map(valueText).join(', ');
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v === undefined || v === null ? '' : String(v);
}
