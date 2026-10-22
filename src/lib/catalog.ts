// The catalog of skills and tools, as the Skills place, the picker of
// skills, and the slash menus read it. GET /v1/bossmode/skills answers the
// skills, each with its origin: local, imported, or mcp with its server.
// The tools come from GET /v1/tools of the kernel. The catalog names no
// agent: GET /v1/agents/{name}/skills names the skills that each agent can
// load, and the profile of an agent names its tools. catalogOf joins them
// into one shape.

import type { Agent, Skill, SkillFile, SkillPreview, SkillProblem, SkillExisting, SkillsList, Tool } from '../api/types';

/** The three kinds of origin of a skill. A skill of an MCP server has the kind server. */
export type SkillKind = 'imported' | 'local' | 'server';

/** One skill of the catalog, in the one shape that the screens read. */
export interface CatalogSkill {
  name: string;
  description: string;
  kind: SkillKind;
  /** The tool server of a skill of kind server, else "". */
  server: string;
  /** The agents that can load the skill, as far as the page read them. */
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
  /** The agents whose profile names the tool. */
  agents: string[];
}

export interface Group<T> {
  key: string;
  title: string;
  /** The server of a group of a server, else "". */
  server: string;
  items: T[];
}

/** Who can load what: the skills that each agent can load, and the agents with their profiles. */
export interface Loaders {
  /** The names of the skills of each agent, from GET /v1/agents/{name}/skills. */
  skillsOf?: Record<string, string[]>;
  agents?: Agent[] | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** kindOf reads the origin of a skill. An origin that names no kind, from an older backend, names its server. */
function kindOf(origin: string, server: string): { kind: SkillKind; server: string } {
  if (origin === 'imported') return { kind: 'imported', server: '' };
  if ((origin === 'local' || origin === '') && !server) return { kind: 'local', server: '' };
  return { kind: 'server', server: server || (origin === 'mcp' ? 'server' : origin) };
}

/** skillOf reads one skill of the catalog. agents are the agents that can load it. */
export function skillOf(raw: Partial<Skill>, agents: string[] = []): CatalogSkill {
  const name = str(raw.name);
  const k = kindOf(str(raw.origin), str(raw.server));
  return {
    name,
    description: str(raw.description),
    kind: k.kind,
    server: k.server,
    agents,
    slash: raw.userInvocable === false ? '' : '/' + name,
    argumentHint: str(raw.argumentHint),
  };
}

/** toolOf reads one capability of GET /v1/tools. agents are the agents whose profile names it. */
export function toolOf(raw: Partial<Tool>, agents: string[] = []): CatalogTool {
  const name = str(raw.name);
  const source = str(raw.source);
  const origin = str(raw.origin);
  const builtin = origin ? origin === 'builtin' : !source || source === 'builtin';
  const server = builtin ? '' : str(raw.server) || (source && source !== 'builtin' ? source : '') || 'server';
  const id = str(raw.id) || (builtin || name.startsWith(server + '/') ? name : server + '/' + name);
  return { id, name, description: str(raw.text) || str(raw.description), builtin, server, agents };
}

/** loadersOf inverts the skills of each agent: the agents of each skill. */
function loadersOf(skillsOf: Record<string, string[]>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const agent of Object.keys(skillsOf).sort()) {
    for (const name of skillsOf[agent]) out.set(name, [...(out.get(name) || []), agent]);
  }
  return out;
}

/** toolUsersOf names the agents whose profile names a tool: by its name, its id, or its whole server. */
function toolUsersOf(t: CatalogTool, agents: Agent[]): string[] {
  return agents.filter((a) => (a.tools || []).some((x) => x === t.name || x === t.id || (!!t.server && x === t.server))).map((a) => a.name).sort();
}

/** catalogOf reads the skills of the front and the tools, with the agents that can load each one. */
export function catalogOf(list: SkillsList | null | undefined, tools?: Tool[] | null, who: Loaders = {}): { skills: CatalogSkill[]; tools: CatalogTool[] } {
  if (!list) return { skills: [], tools: [] };
  const loaders = loadersOf(who.skillsOf || {});
  const agents = who.agents || [];
  const skills = (list.skills || []).map((s) => skillOf(s, loaders.get(s.name) || [])).filter((s) => s.name);
  const raw = list.tools && list.tools.length ? list.tools : tools || [];
  const out = raw.map((t) => toolOf(t)).filter((t) => t.name);
  for (const t of out) t.agents = toolUsersOf(t, agents);
  return { skills, tools: out };
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

/** The skill of the catalog that holds the name of a preview, as the page shows it. */
export type Existing = SkillExisting;

/** What an install would write, and what the checks found, as the chooser shows it. */
export interface Preview {
  name: string;
  description: string;
  /** The keys of the front matter, without name and description, as text. */
  frontMatter: [string, string][];
  body: string;
  files: { path: string; size: number }[];
  problems: SkillProblem[];
  exists: Existing | null;
  installable: boolean;
  /** The digest of what the preview read, which the install sends back. */
  digest: string;
}

/** previewOf reads the answer of POST /v1/bossmode/skills/preview. */
export function previewOf(raw: SkillPreview): Preview {
  const keys = Object.entries(raw.frontMatter || {})
    .filter(([k]) => k !== 'name' && k !== 'description')
    .map(([k, v]) => [k, valueText(v)] as [string, string]);
  return {
    name: raw.name || '',
    description: raw.description || '',
    frontMatter: keys,
    body: raw.body || '',
    files: raw.files || [],
    problems: raw.problems || [],
    exists: raw.exists || null,
    installable: raw.installable !== false,
    digest: raw.digest || '',
  };
}

/** The text of a skill as the Skills place shows it: the keys of its front matter, its body, and its files. */
export interface SkillDoc {
  frontMatter: [string, string][];
  body: string;
  files: { path: string; size?: number }[];
}

/** docOf reads the answer of GET /v1/skills/{name}, whose body is the whole SKILL.md. */
export function docOf(raw: SkillFile | null): SkillDoc {
  const fm = frontMatterOf((raw && raw.body) || '');
  return { frontMatter: fm.keys.filter(([k]) => k !== 'name' && k !== 'description'), body: fm.body, files: ((raw && raw.files) || []).map((path) => ({ path })) };
}
