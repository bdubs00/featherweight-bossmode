// The routes and the shapes of screen C, "what you make": the import of a
// skill, the text of a skill, the tools, a new agent with its workers, and
// a skill handed to the conversation of the manager. The lead folds them
// into routes.ts and types.ts after the merge (docs/DESIGN.md, section
// 11.1). Each shape follows the backend. Where the fake server of the
// contract answers another shape, the page reads both.

import { ApiError, call, enc } from './client';
import type { BossConfig, Pool, Run, SkillSource } from './types';
import { frontMatterOf, valueText } from '../lib/catalog';

/* ---------- skills ---------- */

/**
 * AddSource is where a new skill comes from, as the backend takes it:
 * exactly one of url, marketplace with name, text, and files.
 */
export type AddSource = { url: string } | { marketplace: string; name: string } | { text: string } | { files: { path: string; text: string }[] };

/** contractSource writes a source in the shape of docs/CONTRACT.md, section 12. */
export function contractSource(s: AddSource): SkillSource {
  if ('url' in s) return { kind: 'url', url: s.url };
  if ('marketplace' in s) return { kind: 'marketplace', marketplace: s.marketplace, skill: s.name };
  if ('text' in s) return { kind: 'text', text: s.text };
  return { kind: 'files', files: s.files };
}

/** A finding of the checks of a preview. A finding that blocks stops an install. */
export interface Problem {
  code: string;
  path?: string;
  text: string;
  blocks: boolean;
}

/** The skill of the catalog that holds the name of a preview. Only an imported one can be replaced. */
export interface Existing {
  origin: string;
  replaceable: boolean;
}

/** What an install would write, and what the checks found. */
export interface Preview {
  name: string;
  description: string;
  /** The keys of the front matter, without name and description, as text. */
  frontMatter: [string, string][];
  body: string;
  files: { path: string; size: number }[];
  problems: Problem[];
  exists: Existing | null;
  installable: boolean;
  /** The token of a preview of the contract, for its install route. The backend has none. */
  token?: string;
}

interface BackendPreview {
  name?: string;
  description?: string;
  frontMatter?: Record<string, unknown>;
  body?: string;
  files?: { path: string; size: number }[];
  problems?: Problem[] | null;
  exists?: Existing | null;
  installable?: boolean;
}

interface ContractPreview {
  token: string;
  skill: { name: string; description: string };
  text: string;
  files?: { path: string; size: number }[];
}

/** previewOf reads the answer of a preview of either shape. */
export function previewOf(raw: BackendPreview | ContractPreview): Preview {
  if (raw && 'token' in raw && typeof raw.token === 'string') {
    const fm = frontMatterOf(raw.text);
    return {
      name: raw.skill ? raw.skill.name : '',
      description: raw.skill ? raw.skill.description : '',
      frontMatter: fm.keys.filter(([k]) => k !== 'name' && k !== 'description'),
      body: fm.body,
      files: raw.files || [],
      problems: [],
      exists: null,
      installable: true,
      token: raw.token,
    };
  }
  const b = (raw || {}) as BackendPreview;
  const keys = Object.entries(b.frontMatter || {})
    .filter(([k]) => k !== 'name' && k !== 'description')
    .map(([k, v]) => [k, valueText(v)] as [string, string]);
  return {
    name: b.name || '',
    description: b.description || '',
    frontMatter: keys,
    body: b.body || '',
    files: b.files || [],
    problems: b.problems || [],
    exists: b.exists || null,
    installable: b.installable !== false,
  };
}

/** A marketplace that the admin configured. error says why its index did not load. */
export interface Marketplace {
  name: string;
  url: string;
  skills: { name: string; description: string }[];
  error?: string;
}

/** The answer of an install. replaced is true when it took the place of an imported skill. */
export interface Installed {
  name: string;
  replaced: boolean;
}

/** The text of a skill: its front matter keys, its body, and its files. */
export interface SkillDoc {
  frontMatter: [string, string][];
  body: string;
  files: { path: string; size?: number }[];
}

/** unknownField reports a refusal of a body with a field that the route does not know. */
const unknownField = (e: unknown) => e instanceof ApiError && e.status === 400 && /unknown field/i.test(String((e.problem && e.problem.detail) || e.message));

export const make = {
  marketplaces: () => call<{ marketplaces: Marketplace[] }>('/v1/bossmode/marketplaces').then((r) => (r && r.marketplaces) || []),

  /**
   * preview checks a source and installs nothing. The backend takes the
   * source as the body. The contract of section 12 wraps it in source, and
   * the fake server takes only that, so a refusal of an unknown field sends
   * the wrapped shape once more.
   */
  preview: async (src: AddSource): Promise<Preview> => {
    try {
      return previewOf(await call<BackendPreview>('/v1/bossmode/skills/preview', { method: 'POST', body: src }));
    } catch (e) {
      if (!unknownField(e)) throw e;
      return previewOf(await call<ContractPreview>('/v1/bossmode/skills/preview', { method: 'POST', body: { source: contractSource(src) } }));
    }
  },

  /**
   * install writes the skill. With the backend, it sends the source again
   * with replace when the name belongs to an imported skill, and a name
   * that exists without replace answers 409. A preview of the contract
   * installs by its token.
   */
  install: async (src: AddSource, p: Preview, replace: boolean): Promise<Installed> => {
    if (p.token) {
      const s = await call<{ name: string }>('/v1/bossmode/skills/install', { method: 'POST', body: { token: p.token } });
      return { name: (s && s.name) || p.name, replaced: false };
    }
    const body = replace ? { ...src, replace: true } : src;
    const r = await call<{ skill?: { name: string }; replaced?: boolean }>('/v1/bossmode/skills', { method: 'POST', body });
    return { name: (r && r.skill && r.skill.name) || p.name, replaced: !!(r && r.replaced) };
  },

  remove: (name: string) => call<null>('/v1/bossmode/skills/' + enc(name), { method: 'DELETE' }),

  /**
   * skill reads the text of a skill. The contract serves it at
   * /v1/bossmode/skills/{name} with the whole SKILL.md. The backend has no
   * such route, and the kernel serves the body at /v1/skills/{name}.
   */
  skill: async (name: string): Promise<SkillDoc> => {
    try {
      const s = await call<{ text?: string; files?: { path: string; size: number }[] }>('/v1/bossmode/skills/' + enc(name));
      const fm = frontMatterOf((s && s.text) || '');
      return { frontMatter: fm.keys.filter(([k]) => k !== 'name' && k !== 'description'), body: fm.body, files: (s && s.files) || [] };
    } catch (e) {
      if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 405)) throw e;
      const k = await call<{ body?: string; files?: string[] }>('/v1/skills/' + enc(name));
      const fm = frontMatterOf((k && k.body) || '');
      return { frontMatter: fm.keys.filter(([x]) => x !== 'name' && x !== 'description'), body: fm.body, files: ((k && k.files) || []).map((path) => ({ path })) };
    }
  },

  /** tools reads the capability catalog of the front, each tool with its plain phrase in text. */
  tools: () => call<{ tools: Record<string, unknown>[] }>('/v1/tools').then((r) => (r && r.tools) || []),

  /* ---------- agents ---------- */

  /**
   * putAgent saves a profile with its workers, or with dryRun checks it and
   * saves nothing. The answer carries pool when the front made workers for
   * the agent, and a dry run carries exists.
   */
  putAgent: (name: string, profile: NewProfile, workers: WorkersAsk, dryRun = false) =>
    call<AgentSaved>('/v1/agents/' + enc(name) + (dryRun ? '?dryRun=true' : ''), { method: 'PUT', body: { ...profile, name, workers } }),

  /* ---------- the manager ---------- */

  /** sendSkill hands a skill to a run as a slash command of the person. It answers 202 with the run. */
  sendSkill: (run: string, name: string, args: string) => call<Run>('/v1/bossmode/runs/' + enc(run) + '/skill', { method: 'POST', body: args ? { name, args } : { name } }),
};

/* ---------- a new agent ---------- */

/** The policy of a profile: the tools that ask first, and the tools that never run. */
export interface Rules {
  ask?: string[];
  deny?: string[];
}

/** The budget of each run of a profile. */
export interface Budget {
  maxTurns?: number;
  maxTokens?: number;
  maxCostUSD?: number;
}

/** The profile that the new-agent screen sends, a part of the profile of the kernel. */
export interface NewProfile {
  description?: string;
  instructions?: string[];
  /** The names of the skills, and server/* for every skill of a server. */
  skills: string[];
  model?: string;
  effort?: string;
  timeZone?: string;
  policy?: Rules;
  budget?: Budget;
  compaction?: { at: number; model?: string };
}

/** The workers of a new agent: how many work at once, and the template when the settings offer several. */
export interface WorkersAsk {
  template?: string;
  replicas: number;
}

/** The answer of PUT /v1/agents/{name}: the view of the agent, and its workers when the front made them. */
export interface AgentSaved {
  name: string;
  description?: string;
  role?: string;
  /** True on a dry run when an agent of that name exists. */
  exists?: boolean;
  pool?: Pool | null;
}

/** A worker template of the settings. */
export interface Template {
  name: string;
  default: boolean;
}

/** templatesOf reads the worker templates of GET /v1/bossmode. */
export function templatesOf(config: BossConfig | null | undefined): Template[] {
  const t = config ? (config as BossConfig & { templates?: unknown }).templates : null;
  if (!Array.isArray(t)) return [];
  return t.filter((x): x is Template => !!x && typeof x.name === 'string' && x.name !== '').map((x) => ({ name: x.name, default: !!x.default }));
}
