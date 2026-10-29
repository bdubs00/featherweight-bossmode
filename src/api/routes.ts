// One function for each route that the page calls. The shapes are in
// types.ts, and docs/CONTRACT.md says which of them the page chose.

import { browserZone, call, enc, encPath, query, send, ApiError } from './client';
import type {
  Agent,
  AgentSaved,
  AgentSkills,
  Attachment,
  BossConfig,
  Bridge,
  BridgePages,
  Caps,
  Delegation,
  Duty,
  DutyDryRun,
  DutyList,
  DutyOptions,
  DutyRecord,
  DutyStarted,
  Entry,
  FaceMeta,
  FileView,
  Fleet,
  Inbox,
  WorkBoard,
  RunBudget,
  TeamVerdict,
  Marketplace,
  Member,
  MessagePage,
  NewProfile,
  NewRun,
  NotifyRead,
  NotifySettings,
  NotifyTestResult,
  OrphanList,
  OrphanRemoval,
  Packages,
  PackagesBody,
  Page,
  PageMeta,
  PageVersion,
  RemovedPage,
  Placement,
  Playbook,
  Pool,
  ReactionKind,
  Result,
  Run,
  RunEvent,
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
  TaskPlan,
  TaskTell,
  Whoami,
  WorkersAsk,
  WrittenCheck,
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

/**
 * The body of PUT /v1/playbooks/{name}: the form of New bridge without the
 * title, with its seats as seats, and the revision that the person read on
 * a change. The front refuses an unknown field, such as members.
 */
export interface PlaybookBody {
  goal: string;
  placement?: Placement;
  seats: NewMember[];
  delegation?: Partial<Delegation>;
  caps?: Partial<Caps>;
  revision?: number;
}

/** A message of the person to a channel. to names the seats, and a slash command goes as skill. */
export interface NewMessage {
  text: string;
  to?: string[];
  replyTo?: number;
  pinned?: boolean;
  skill?: SkillCall;
  files?: Attachment[];
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

const duty = (name: string) => '/v1/duties/' + enc(name);

/**
 * withZone starts a run in the time zone of the browser, so the agent reads
 * its clock in the time of the person. A duty that the manager writes then
 * runs in that time too. A zone that the body names wins.
 */
const withZone = (body: NewRun): NewRun => (body.profile && body.profile.timeZone ? body : { ...body, profile: { ...body.profile, timeZone: browserZone() } });

/** dutyCall calls a route of the duties with X-Time-Zone, the zone of the browser, in which the front reads a time that a person says. */
const dutyCall = <T>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}) => call<T>(path, { ...opts, headers: { 'X-Time-Zone': browserZone() } });

const playbook = (name: string) => '/v1/playbooks/' + enc(name);

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
    if (m.files && m.files.length) body.files = m.files;
    return call<Entry>(bridge(id) + '/messages', { method: 'POST', body });
  },
  /** entry reads one entry with its whole text, up to 64 KB. cut stays true for an old entry whose start alone was kept. */
  entry: (id: string, seq: number) => call<Entry>(bridge(id) + '/messages/' + enc(seq)),
  /** bridgePages lists the pages of the work of a bridge: those under bridges/<id>/, and those whose newest version a run of the bridge wrote. */
  bridgePages: (id: string) => call<BridgePages>(bridge(id) + '/pages').then((r) => (r && r.pages) || []),
  react: (id: string, seq: number, reaction: ReactionKind, note?: string) =>
    call<Entry>(bridge(id) + '/messages/' + enc(seq) + '/reactions', { method: 'POST', body: note ? { reaction, note } : { reaction } }),
  /** settleQuestion ends the open question of a seat, entry seq of its channel, without an answer. The seat does not wake. The answer is 204. */
  settleQuestion: (id: string, seq: number) => call<null>(bridge(id) + '/questions/' + enc(seq) + '/settle', { method: 'POST' }),
  addMember: (id: string, m: NewMember) => call<Member>(bridge(id) + '/members', { method: 'POST', body: m }),
  fire: (id: string, handle: string) => call<Member>(bridge(id) + '/members/' + enc(handle), { method: 'DELETE' }),
  patchMember: (id: string, handle: string, patch: { muted?: boolean; task?: string; continue?: boolean }) =>
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
  /** getPackages reads the packages of a pool: the setting, the two lists, and the state of each worker. A front without packages answers 404. */
  getPackages: (name: string) => call<Packages>(pool(name) + '/packages'),
  /** putPackages replaces the setting and the lists of a pool, or with dryRun checks them and changes nothing. Only an owner can. */
  putPackages: (name: string, body: PackagesBody, dryRun = false) =>
    call<Packages>(pool(name) + '/packages' + query({ dryRun: dryRun ? 'true' : undefined }), { method: 'PUT', body }),
  /** removeWorkers removes every worker of an agent. Only an owner can. */
  removeWorkers: (name: string) => call<null>(pool(name), { method: 'DELETE' }),
  /** orphans lists the child Tasks whose parent Task is gone, or null for a person who is no admin and for a front without the list. */
  orphans: async (): Promise<OrphanList | null> => {
    try {
      const r = await call<OrphanList>('/v1/fleet/orphans');
      return { orphans: (r && r.orphans) || [], removeAfter: (r && r.removeAfter) || 0 };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return null;
      throw e;
    }
  },
  /** removeOrphans removes the child Tasks whose parent Task is gone. Only an admin can. */
  removeOrphans: () => call<OrphanRemoval>('/v1/fleet/orphans', { method: 'DELETE' }),
  /** The counts of the day of an agent, or null where the workbench has no such route. */
  today: (agent: string) => orNull(call<Today>('/v1/bossmode/agents/' + enc(agent) + '/today')),

  run: (id: string) => call<Run>(run(id)),
  result: (id: string) => call<Result>(run(id) + '/result'),
  transcript: (id: string, q: PageQuery = {}) =>
    call<Transcript>(run(id) + '/transcript' + query({ before: q.before, from: q.from, limit: q.limit || 200 })),
  file: (id: string, path: string) => call<FileView>(run(id) + '/files/' + encPath(path)),
  /** events reads a page of the ledger of a run, from the seq from. The front sends the call to the member that holds the run. */
  events: (id: string, from: number, limit: number) => call<{ events: RunEvent[] }>(run(id) + '/events' + query({ from, limit })).then((r) => (r && r.events) || []),
  start: (member: string, body: NewRun) => call<Run>('/v1/runs' + query({ member }), { method: 'POST', body: withZone(body) }),
  /**
   * fleetRuns lists the runs of the whole fleet that the caller can see,
   * newest first, narrowed by agent, person, and state. The state active
   * keeps every run that is not finished. The front answers from its view,
   * so the read wakes no worker.
   */
  /** fleetRuns lists runs. hidden adds the conversations that the caller deleted, each with hidden set, so the page knows them as deleted. */
  fleetRuns: (q: { agent?: string; principal?: string; state?: string; limit?: number; hidden?: boolean }) =>
    call<{ runs: Run[]; total?: number }>('/v1/fleet/runs' + query({ agent: q.agent, principal: q.principal, state: q.state, limit: q.limit, hidden: q.hidden ? 'true' : undefined })).then((r) => (r && r.runs) || []),
  /** patchConversation renames a conversation, or deletes it from the lists, for the caller alone. An empty title goes back to the title of the run. */
  patchConversation: (id: string, change: { title?: string; hidden?: boolean }) => call<unknown>('/v1/conversations/' + encodeURIComponent(id), { method: 'PATCH', body: change }),
  sendRun: (id: string, content: string, files?: Attachment[]) =>
    call<unknown>(run(id) + '/messages', { method: 'POST', body: files && files.length ? { content, files } : { content } }),
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
  /** removePage removes a page. ifMatch is the hash that the person saw, so a newer version stays. The history keeps every version. */
  /** removedPages lists the removed pages that did not come back, newest first, or null from a server without the route. */
  removedPages: () =>
    call<{ removed: RemovedPage[] }>('/v1/pages/removed')
      .then((r) => (r && r.removed) || [])
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
  removePage: (path: string, ifMatch?: string) => call<null>('/v1/pages/' + encPath(path), { method: 'DELETE', headers: ifMatch ? { 'If-Match': '"' + ifMatch + '"' } : {} }),
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

  /** duties lists the duties that the caller can view, and paused, the switch that pauses every duty. */
  duties: () => dutyCall<DutyList>('/v1/duties').then((r) => ({ duties: (r && r.duties) || [], paused: !!(r && r.paused) })),
  /** duty reads one duty with its history, the last 50 runs, newest first. */
  duty: (name: string) => dutyCall<Duty>(duty(name)),
  /**
   * putDuty creates (201) or changes (200) a duty. With dryRun it saves
   * nothing and answers the record, the readback, the next times, and
   * every problem. With test it also runs the check once.
   */
  putDuty: (name: string, record: DutyRecord) => dutyCall<Duty>(duty(name), { method: 'PUT', body: record }),
  dryRunDuty: (name: string, record: DutyRecord, test = false) =>
    dutyCall<DutyDryRun>(duty(name) + query({ dryRun: 'true', test: test ? 'true' : undefined }), { method: 'PUT', body: record }),
  /** pauseDuty pauses or resumes one duty. */
  pauseDuty: (name: string, paused: boolean) => dutyCall<Duty>(duty(name), { method: 'PATCH', body: { paused } }),
  deleteDuty: (name: string) => dutyCall<null>(duty(name), { method: 'DELETE' }),
  /** runDuty starts a duty now, out of its schedule: the run, or why it skipped. */
  runDuty: (name: string) => dutyCall<DutyStarted>(duty(name) + '/run', { method: 'POST', body: {} }),
  /**
   * writeCheck asks an agent for a check from the words of a person. agent
   * is the agent of the editor, which a duty that is not saved yet needs. For
   * a saved duty, the agent of the duty wins. budget is the budget of a run
   * of the duty as the form holds it: the server runs an agent without a
   * budget of its own within it. A 422 says why it could not, and a 504
   * says that two minutes passed. signal lets the person cancel.
   */
  writeCheck: (name: string, words: string, agent: string, signal?: AbortSignal, budget?: DutyRecord['limits']['budget']) =>
    dutyCall<WrittenCheck>(duty(name) + '/write-check', { method: 'POST', body: budget ? { words, agent, budget } : { words, agent }, signal }),
  /** dutyOptions names what the front serves now: the secrets of a check, the events, the actions, and the looks. */
  dutyOptions: () => dutyCall<DutyOptions>('/v1/duties/options'),
  /** pauseAllDuties is the switch that pauses or resumes every duty, for an admin. */
  pauseAllDuties: (paused: boolean, reason?: string) => dutyCall<unknown>('/v1/duties', { method: 'PATCH', body: reason ? { paused, reason } : { paused } }),

  /** planTask reads the words of a person back as a plan, before anything starts. agent and tell change the plan. */
  planTask: (words: string, agent?: string, tell?: TaskTell) =>
    dutyCall<TaskPlan>('/v1/work/plan', { method: 'POST', body: { words, ...(agent ? { agent } : {}), ...(tell ? { tell } : {}) } }),
  /** inbox lists what needs the person: approvals, questions, failures, and paused duties. */
  inbox: () => call<Inbox>('/v1/inbox').then((r): Inbox => ({ items: (r && r.items) || [], ...(r && r.waiting ? { waiting: r.waiting } : {}) })),
  /** work reads the board of the work: one card per piece of work, from the request to its end. */
  work: (q: { days?: number; all?: boolean } = {}) => call<WorkBoard>('/v1/work' + query({ days: q.days, all: q.all ? 'true' : undefined })),
  /**
   * reviewTeam checks the result of a team (POST /v1/work/review). up
   * closes its bridge with the verdict accepted. down posts the note in the
   * bridge to every seat, and the bridge stays open.
   */
  reviewTeam: (bridge: string, verdict: TeamVerdict, note?: string) =>
    call<unknown>('/v1/work/review', { method: 'POST', body: note ? { bridge, verdict, note } : { bridge, verdict } }),
  /** letGo lets a stopped card go (POST /v1/work/letgo). The card moves to Done with the verdict let-go. A second call does nothing. */
  letGo: (card: string) => call<unknown>('/v1/work/letgo', { method: 'POST', body: { card } }),
  /**
   * changeBudget gives a run new limits (PATCH /v1/runs/{id}/budget). Each
   * field that it sets replaces the same limit of the run for the work that
   * follows. A run that stopped at a limit stays stopped until a follow-up.
   */
  changeBudget: (id: string, budget: RunBudget) => call<{ budget?: RunBudget; run?: Run }>(run(id) + '/budget', { method: 'PATCH', body: budget }),

  /** The notification settings of the person who is signed in: the channels, the quiet hours, and what the front offers. */
  notifications: () => call<NotifyRead>('/v1/notifications'),
  putNotifications: (body: NotifySettings) => call<NotifyRead>('/v1/notifications', { method: 'PUT', body }),
  /**
   * testNotification sends a test to one channel, or to every channel
   * without one. A failed send is a result with sent false and the reason
   * in error. An unknown channel answers 400.
   */
  testNotification: (channel?: string) =>
    call<{ results: NotifyTestResult[] }>('/v1/notifications/test', { method: 'POST', body: channel ? { channel } : {} }).then((r) => (r && r.results) || []),

  /** The playbooks: the list without caps and delegation, one playbook whole, a save, and a delete. */
  playbooks: () => call<{ playbooks: Playbook[] }>('/v1/playbooks').then((r) => (r && r.playbooks) || []),
  playbook: (name: string) => call<Playbook>(playbook(name)),
  putPlaybook: (name: string, body: PlaybookBody) => call<Playbook>(playbook(name), { method: 'PUT', body }),
  deletePlaybook: (name: string) => call<null>(playbook(name), { method: 'DELETE' }),

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
