// One function for each route that the page calls. The shapes are in
// types.ts, and docs/CONTRACT.md says which of them the page chose.

import { call, enc, encPath, query, send, ApiError } from './client';
import type {
  Agent,
  AgentSaved,
  AgentSkills,
  BossConfig,
  Bridge,
  Caps,
  Delegation,
  Entry,
  FaceMeta,
  FileView,
  Fleet,
  Marketplace,
  Member,
  MessagePage,
  NewProfile,
  NewRun,
  Page,
  PageMeta,
  PageVersion,
  Placement,
  Pool,
  ReactionKind,
  Result,
  Run,
  SearchHit,
  SkillCall,
  SkillFile,
  SkillInstalled,
  SkillPreview,
  SkillSource,
  SkillsList,
  Today,
  Tool,
  Transcript,
  Whoami,
  WorkersAsk,
} from './types';

const bridge = (id: string) => '/v1/bridges/' + enc(id);
const run = (id: string) => '/v1/runs/' + enc(id);

export interface PageQuery {
  before?: number;
  from?: number;
  limit?: number;
}

export interface NewMember {
  handle: string;
  agent: string;
  task: string;
}

export interface NewBridge {
  title: string;
  goal: string;
  placement?: Placement;
  members: NewMember[];
  delegation?: Partial<Delegation>;
  caps?: Partial<Caps>;
}

/** A message of the person to a channel. to names the seats, and a slash command goes as skill. */
export interface NewMessage {
  text: string;
  to?: string[];
  replyTo?: number;
  pinned?: boolean;
  skill?: SkillCall;
}

/** orNull answers null for a 404, so a missing thing is an empty state and not an error. */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const pool = (name: string) => '/v1/pools/' + enc(name);

export const api = {
  whoami: () => call<Whoami>('/v1/whoami'),

  /** The settings of the page. A workbench without them answers 404. */
  config: async (): Promise<BossConfig | null> => {
    try {
      return await call<BossConfig>('/v1/bossmode');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  bridges: () => call<{ bridges: Bridge[] }>('/v1/bridges').then((r) => (r && r.bridges) || []),
  bridge: (id: string) => call<Bridge>(bridge(id)),
  openBridge: (b: NewBridge) => call<Bridge>('/v1/bridges', { method: 'POST', body: b }),
  patchBridge: (id: string, patch: Partial<Pick<Bridge, 'title' | 'delegation' | 'caps' | 'state'>>) =>
    call<Bridge>(bridge(id), { method: 'PATCH', body: patch }),
  markRead: (id: string, seq: number) => call<null>(bridge(id) + '/read', { method: 'PUT', body: { seq } }),
  messages: (id: string, q: PageQuery = {}) =>
    call<MessagePage>(bridge(id) + '/messages' + query({ before: q.before, from: q.from, limit: q.limit })),
  /** post sends a message. A field that is not set stays out of the body, because the backend refuses an unknown or empty field. */
  post: (id: string, m: NewMessage) => {
    const body: Record<string, unknown> = {};
    // A slash command carries the text of the person that follows the skill, and the text can be empty.
    if (m.text || !m.skill) body.text = m.text;
    if (m.to && m.to.length) body.to = m.to;
    if (m.replyTo) body.replyTo = m.replyTo;
    if (m.pinned) body.pinned = true;
    if (m.skill) body.skill = m.skill.args ? { name: m.skill.name, args: m.skill.args } : { name: m.skill.name };
    return call<Entry>(bridge(id) + '/messages', { method: 'POST', body });
  },
  react: (id: string, seq: number, reaction: ReactionKind, note?: string) =>
    call<Entry>(bridge(id) + '/messages/' + enc(seq) + '/reactions', { method: 'POST', body: note ? { reaction, note } : { reaction } }),
  addMember: (id: string, m: NewMember) => call<Member>(bridge(id) + '/members', { method: 'POST', body: m }),
  fire: (id: string, handle: string) => call<Member>(bridge(id) + '/members/' + enc(handle), { method: 'DELETE' }),
  patchMember: (id: string, handle: string, patch: { muted?: boolean; task?: string }) =>
    call<Member>(bridge(id) + '/members/' + enc(handle), { method: 'PATCH', body: patch }),

  fleet: () => call<Fleet>('/v1/fleet'),
  agents: () => call<{ agents: Agent[] }>('/v1/agents').then((r) => (r && r.agents) || []),
  /** agent reads one agent with its profile: its tools and its skills, among others. */
  agent: (name: string) => call<Agent>('/v1/agents/' + enc(name)),
  /** agentSkills reads the skills that the profile of an agent allows, resolved against the catalog of the front. */
  agentSkills: (agent: string) => call<AgentSkills>('/v1/agents/' + enc(agent) + '/skills'),
  /** putAgent saves a profile with its workers, or with dryRun checks it and saves nothing. The answer carries pool when the front made workers. */
  putAgent: (name: string, profile: NewProfile, workers: WorkersAsk, dryRun = false) =>
    call<AgentSaved>('/v1/agents/' + enc(name) + query({ dryRun: dryRun ? 'true' : undefined }), { method: 'PUT', body: { ...profile, name, workers } }),

  /** The workers of an agent, by the name of their pool, or null when there is no such pool. poolNameOf of src/lib/workers.ts names it. */
  pool: (name: string) => orNull(call<Pool>(pool(name))),
  /** setKeep changes the number of workers that an agent keeps. Only an owner can. */
  setKeep: (name: string, replicas: number) => call<Pool>(pool(name), { method: 'PATCH', body: { replicas } }),
  /** removeWorkers removes every worker of an agent. Only an owner can. */
  removeWorkers: (name: string) => call<null>(pool(name), { method: 'DELETE' }),
  /** The counts of the day of an agent, or null where the workbench has no such route. */
  today: (agent: string) => orNull(call<Today>('/v1/bossmode/agents/' + enc(agent) + '/today')),

  run: (id: string) => call<Run>(run(id)),
  result: (id: string) => call<Result>(run(id) + '/result'),
  transcript: (id: string, q: PageQuery = {}) =>
    call<Transcript>(run(id) + '/transcript' + query({ before: q.before, from: q.from, limit: q.limit || 200 })),
  file: (id: string, path: string) => call<FileView>(run(id) + '/files/' + encPath(path)),
  start: (member: string, body: NewRun) => call<Run>('/v1/runs' + query({ member }), { method: 'POST', body }),
  /** fleetRuns lists the runs of the whole fleet that the caller can see, newest first, narrowed by agent and person. */
  fleetRuns: (q: { agent?: string; principal?: string; limit?: number }) =>
    call<{ runs: Run[]; total?: number }>('/v1/fleet/runs' + query({ agent: q.agent, principal: q.principal, limit: q.limit })).then((r) => (r && r.runs) || []),
  sendRun: (id: string, content: string) => call<unknown>(run(id) + '/messages', { method: 'POST', body: { content } }),
  decide: (id: string, approval: string, decision: 'allow' | 'deny', note?: string, content?: unknown) => {
    const body: Record<string, unknown> = { decision };
    if (note) body.note = note;
    if (content !== undefined) body.content = content;
    return call<unknown>(run(id) + '/approvals/' + enc(approval), { method: 'POST', body });
  },
  /** alwaysAllow adds the tool to the policy of the pool, then allows the call, as /ui does. */
  alwaysAllow: async (id: string, approval: string, note?: string) => {
    await call<unknown>(run(id) + '/approvals/' + enc(approval) + '/rule', { method: 'POST', body: note ? { note } : {} });
    return call<unknown>(run(id) + '/approvals/' + enc(approval), { method: 'POST', body: note ? { decision: 'allow', note } : { decision: 'allow' } });
  },
  cancel: (id: string) => call<unknown>(run(id) + '/cancel', { method: 'POST', body: {} }),
  /** reactRun records a reaction on an event of a run (K2) and answers the run with its counts. */
  reactRun: (id: string, seq: number, reaction: ReactionKind, note?: string) =>
    call<Run>(run(id) + '/reactions', {
      method: 'POST',
      body: note ? { seq, reaction, note } : { seq, reaction },
    }),

  pages: () => call<{ pages: PageMeta[] }>('/v1/pages').then((r) => (r && r.pages) || []),
  page: (path: string, version?: number) => call<Page>('/v1/pages/' + encPath(path) + query({ version })),
  /** putPage writes a page. ifMatch is the hash that the person edited, or "*" to create only. */
  putPage: (path: string, text: string, ifMatch: string, summary?: string) =>
    call<Page>('/v1/pages/' + encPath(path), {
      method: 'PUT',
      body: summary ? { text, summary } : { text },
      headers: ifMatch === '*' ? { 'If-None-Match': '*' } : { 'If-Match': '"' + ifMatch + '"' },
    }),
  history: (path: string) => call<{ path: string; versions: PageVersion[] }>('/v1/pages/' + encPath(path) + '/history').then((r) => (r && r.versions) || []),
  search: (q: string, signal?: AbortSignal) =>
    call<{ q: string; results: SearchHit[]; cut: boolean }>('/v1/pages/search' + query({ q }), { signal }),

  /** The skills of the front. docs/CONTRACT.md, section 12, names the shapes. */
  skills: () => call<SkillsList>('/v1/bossmode/skills').then((r) => ({ skills: (r && r.skills) || [], tools: (r && r.tools) || [] })),
  /** skillFile reads a skill from the kernel: the whole SKILL.md as body, and its other files. The backend has no such route of its own. */
  skillFile: (name: string) => call<SkillFile>('/v1/skills/' + enc(name)),
  /** tools reads the capabilities of the kernel, each tool with its plain phrase in text. */
  tools: () => call<{ tools: Tool[] }>('/v1/tools').then((r) => (r && r.tools) || []),
  marketplaces: () => call<{ marketplaces: Marketplace[] }>('/v1/bossmode/marketplaces').then((r) => (r && r.marketplaces) || []),
  /** previewSkill checks a source and installs nothing. */
  previewSkill: (src: SkillSource) => call<SkillPreview>('/v1/bossmode/skills/preview', { method: 'POST', body: src }),
  /**
   * installSkill writes the skill that a preview showed. digest is the
   * digest of that preview, so a source that changed since answers 409.
   * replace takes the place of the imported skill of that name.
   */
  installSkill: (src: SkillSource, digest: string, replace = false) =>
    call<SkillInstalled>('/v1/bossmode/skills', { method: 'POST', body: { ...src, ...(replace ? { replace: true } : {}), ...(digest ? { digest } : {}) } }),
  removeSkill: (name: string) => call<null>('/v1/bossmode/skills/' + enc(name), { method: 'DELETE' }),
  /** runSkill hands a skill to a run as a slash command of the person. The answer is 202 with the run. */
  runSkill: (run: string, s: SkillCall) => call<Run>('/v1/bossmode/runs/' + enc(run) + '/skill', { method: 'POST', body: s.args ? { name: s.name, args: s.args } : { name: s.name } }),

  faces: () => call<{ faces: FaceMeta[] }>('/v1/faces').then((r) => (r && r.faces) || []),
  /** faceBlob reads a face as SVG bytes behind the token. */
  faceBlob: async (agent: string): Promise<Blob> => {
    const res = await send('/v1/faces/' + enc(agent), { accept: 'image/svg+xml' });
    const type = (res.headers.get('Content-Type') || '').split(';')[0].trim();
    if (type !== 'image/svg+xml') throw new ApiError(res.status, { detail: 'The face of ' + agent + ' is not an SVG image.' });
    return new Blob([await res.arrayBuffer()], { type: 'image/svg+xml' });
  },
  /** logoBlob reads the logo of the theme behind the token. The path is on this origin under /v1/. */
  logoBlob: async (path: string): Promise<Blob> => {
    const res = await send(path, { accept: 'image/svg+xml, image/png, image/webp, image/jpeg' });
    const type = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(svg\+xml|png|webp|jpeg|gif)$/.test(type)) throw new ApiError(res.status, { detail: 'The logo is not an image.' });
    return new Blob([await res.arrayBuffer()], { type });
  },
  putFace: (agent: string, svg: string) =>
    call<FaceMeta>('/v1/faces/' + enc(agent), { method: 'PUT', body: svg, headers: { 'Content-Type': 'image/svg+xml' } }),
  patchFace: (agent: string, meta: { displayName?: string; tagline?: string }) =>
    call<FaceMeta>('/v1/faces/' + enc(agent), { method: 'PATCH', body: meta }),
  deleteFace: (agent: string) => call<FaceMeta>('/v1/faces/' + enc(agent), { method: 'DELETE' }),
};
