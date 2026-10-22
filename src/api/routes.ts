// One function for each route that the page calls. The shapes are in
// types.ts, and docs/CONTRACT.md says which of them the page chose.

import { call, enc, encPath, query, send, ApiError } from './client';
import type {
  Agent,
  BossConfig,
  Bridge,
  Caps,
  Delegation,
  Entry,
  FaceMeta,
  FileView,
  Fleet,
  Member,
  MessagePage,
  Page,
  PageMeta,
  PageVersion,
  Placement,
  ReactionKind,
  Result,
  Run,
  SearchHit,
  Skill,
  SkillPreview,
  SkillSource,
  SkillText,
  SkillsList,
  Marketplace,
  Transcript,
  Whoami,
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
  post: (id: string, m: { text: string; to?: string[]; replyTo?: number }) =>
    call<Entry>(bridge(id) + '/messages', { method: 'POST', body: m }),
  react: (id: string, seq: number, reaction: ReactionKind, note?: string) =>
    call<Entry>(bridge(id) + '/messages/' + enc(seq) + '/reactions', { method: 'POST', body: note ? { reaction, note } : { reaction } }),
  addMember: (id: string, m: NewMember) => call<Member>(bridge(id) + '/members', { method: 'POST', body: m }),
  fire: (id: string, handle: string) => call<Member>(bridge(id) + '/members/' + enc(handle), { method: 'DELETE' }),
  patchMember: (id: string, handle: string, patch: { muted?: boolean; task?: string }) =>
    call<Member>(bridge(id) + '/members/' + enc(handle), { method: 'PATCH', body: patch }),

  fleet: () => call<Fleet>('/v1/fleet'),
  agents: () => call<{ agents: Agent[] }>('/v1/agents').then((r) => (r && r.agents) || []),

  run: (id: string) => call<Run>(run(id)),
  result: (id: string) => call<Result>(run(id) + '/result'),
  transcript: (id: string, q: PageQuery = {}) =>
    call<Transcript>(run(id) + '/transcript' + query({ before: q.before, from: q.from, limit: q.limit || 200 })),
  file: (id: string, path: string) => call<FileView>(run(id) + '/files/' + encPath(path)),
  start: (member: string, body: { agent: string; input: string }) =>
    call<Run>('/v1/runs' + query({ member }), { method: 'POST', body }),
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

  /** The skills and the tools of the fleet. docs/CONTRACT.md, section 12, names the shapes. */
  skills: () => call<SkillsList>('/v1/bossmode/skills').then((r) => ({ skills: (r && r.skills) || [], tools: (r && r.tools) || [] })),
  skill: (name: string) => call<SkillText>('/v1/bossmode/skills/' + enc(name)),
  marketplaces: () => call<{ marketplaces: Marketplace[] }>('/v1/bossmode/marketplaces').then((r) => (r && r.marketplaces) || []),
  previewSkill: (source: SkillSource) => call<SkillPreview>('/v1/bossmode/skills/preview', { method: 'POST', body: { source } }),
  installSkill: (token: string) => call<Skill>('/v1/bossmode/skills/install', { method: 'POST', body: { token } }),
  removeSkill: (name: string) => call<null>('/v1/bossmode/skills/' + enc(name), { method: 'DELETE' }),

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
