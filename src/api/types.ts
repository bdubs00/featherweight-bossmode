// The shapes of the API. The plan of bossmode (BOSSMODE_2026-10-21.md in
// the workbench repository) gives most of them. docs/CONTRACT.md names the
// shapes that the page chose where the plan gives no JSON.

/** A principal is the caller as the kernel knows it. */
export interface Principal {
  subject: string;
  name?: string;
  kind?: string;
  issuer?: string;
  groups?: string[];
}

/** The answer of GET /v1/whoami. */
export interface Whoami {
  principal: Principal | null;
  roles: Record<string, string>;
  admin: boolean;
  canCreate: boolean;
  teams?: string[];
  fleet?: string;
  links?: Record<string, string>;
}

/**
 * The answer of GET /v1/bossmode: the settings that the page reads, in the
 * order of the keys of the backend.
 */
export interface BossConfig {
  manager: ManagerConfig | null;
  placement: Placement;
  maxMembers: number;
  /** The theme of the deployment. The backend sends every key, with "" for a key that the deployment leaves out. */
  theme?: ThemeSettings | null;
  /** The worker templates for a new agent, in the order of the configuration. [] without templates. */
  templates?: Template[];
  /** The quick chat, or null when the configuration names no profile for it. */
  chat?: QuickChat | null;
  /** False when the front keeps no routines, so the page shows no place Routines. An older front leaves it out. */
  routines?: boolean;
  /** True when the deployment has a package mirror, so the profile of an agent that a pool runs shows Packages. An older front leaves it out. */
  packages?: boolean;
  /** True when the front serves GET /v1/work, POST /v1/work/plan, and GET /v1/value. The page then shows the places Work and Results and opens on Work. An older front leaves it out, and the page shows the places of before. */
  work?: boolean;
}

/** A child Task whose parent Task is gone, from GET /v1/fleet/orphans. */
export interface Orphan {
  /** The Task, as <atespace>/<task>. */
  member: string;
  /** The parent that the Task names, as ax:<atespace>/<task>. */
  parent: string;
  phase: string;
  pool?: string;
  createdAt?: string;
  /** The runs of the Task that have not ended. */
  open: number;
}

/** The answer of GET /v1/fleet/orphans: the orphan Tasks, and the seconds that one sleeps before the front removes it, 0 when it does not. An older front leaves removeAfter out. */
export interface OrphanList {
  orphans: Orphan[];
  removeAfter?: number;
}

/** The answer of DELETE /v1/fleet/orphans: the Tasks that went, and each Task whose delete failed. */
export interface OrphanRemoval {
  removed: string[];
  failed: { member: string; error: string }[];
}

/** A worker template of the settings: its name, and whether a new agent gets it when the page names none. */
export interface Template {
  name: string;
  default: boolean;
}

/** The quick chat of the settings: its profile, and the fleet member that runs it, or "". */
export interface QuickChat {
  agent: string;
  member: string;
}

/** The theme of a deployment, from GET /v1/bossmode. Each field is optional. */
export interface ThemeSettings {
  /** The accent color, as a hex color such as #FF4D00. */
  accent?: string;
  /** The name of the organization that runs the platform. */
  name?: string;
  /** The path of the logo on this origin, such as /v1/bossmode/logo. */
  logo?: string;
}

export interface ManagerConfig {
  /** The profile of the manager. */
  agent: string;
  /** The fleet member, the Task, that runs the manager. */
  member: string;
  /** The newest conversation of the caller with the manager, or "". */
  run: string;
}

export type Placement = 'queue' | 'spawn';

/**
 * The presence of a member, from section 6.5 of the plan. A seat with no
 * run is waiting while a job or the manager will seat it, and not-started
 * when nothing will: the manager of its spawn bridge stopped first.
 */
export type Presence = 'working' | 'needs-you' | 'waiting' | 'not-started' | 'idle' | 'asleep' | 'limit' | 'error' | 'fired';

/** The activity of a run that works (K4). */
export interface Activity {
  turn: number;
  tool?: string;
  callId?: string;
  phrase: string;
  since: string;
}

export type RunState =
  | 'queued'
  | 'running'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'suspended';

/** One seat on the roster of a bridge. */
export interface Member {
  handle: string;
  agent: string;
  pool?: string;
  task: string;
  runs: string[];
  fired: boolean;
  muted: boolean;
  presence: Presence;
  activity?: Activity | null;
  /**
   * The seq of the question of the seat that waits for a person, or 0. A
   * front before questions leaves it out, and the page then finds the
   * questions in the channel.
   */
  question?: number;
  /**
   * True when no worker of the fleet holds the newest run of the seat, as
   * the channel said, so a read of the run answers 404. A front before
   * this key leaves it out.
   */
  gone?: boolean;
}

export interface Delegation {
  approve: boolean;
  budget: boolean;
  members: boolean;
  report: boolean;
}

export interface Caps {
  maxMessages: number;
  maxFanoutPerMinute: number;
  maxPairMessages: number;
  /** The turns of every run of the bridge together. An older workbench has none. */
  maxTurns?: number;
}

/** A bridge record. GET /v1/bridges leaves out members and adds counts. */
export interface Bridge {
  id: string;
  title: string;
  goal: string;
  operator: string;
  state: 'open' | 'closed';
  placement: Placement;
  createdAt: string;
  closedAt: string | null;
  manager?: { member: string; run: string } | null;
  delegation: Delegation;
  caps: Caps;
  members?: Member[];
  /** The seq of the newest entry of the channel. */
  lastSeq: number;
  /** The time of the newest entry of the channel, for the freshness of a row of the list. Absent before the first entry, and from an older workbench. */
  lastAt?: string;
  /** The seq that the caller read last. */
  read: number;
  /** The entries after read that count as unread for the caller. */
  unread: number;
  /** The number of seats, fired seats included. */
  memberCount?: number;
  /** The number of members with the presence needs-you. */
  needsYou?: number;
  /** True when the unread entries reached past the bound of 2000 that the backend counts. */
  unreadMore?: boolean;
  /** The sum of the usage of the runs of the bridge. Only GET /v1/bridges/{id} carries it. */
  usage?: UsageSum;
}

/** A sum of the usage of runs, with the partial mark of the tool batch. */
export interface UsageSum {
  turns?: number;
  toolCalls?: number;
  costUSD?: number;
  reported: number;
  final: number;
  missing: number;
  partial: boolean;
}

export type SenderKind = 'person' | 'agent' | 'system';

/** The sender of a channel entry. */
export interface Sender {
  kind: SenderKind;
  /** The handle of an agent member. */
  handle?: string;
  /** The subject of a person. */
  name?: string;
  /** A display name of a person, when the server knows one. */
  display?: string;
  /** The run of an agent message. */
  run?: string;
}

/** The run event that a channel entry mirrors. */
export interface Mirror {
  run: string;
  seq: number;
  type: string;
}

export type ReactionKind = 'up' | 'down' | 'heart';

/**
 * The state of a decision. unknown means that the backend cannot tell
 * whether the decision reached the run, such as when the run stopped first.
 */
export type DecisionState = 'pending' | 'allow' | 'deny' | 'unknown';

/** A pending or decided approval or question, on a channel entry. */
export interface Decision {
  run: string;
  /** The approval id of the run. */
  id: string;
  tool?: string;
  label: string;
  question?: boolean;
  reason?: string;
  effect?: string;
  input?: unknown;
  schema?: unknown;
  state: DecisionState;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  /** The answer to a question, as text. */
  answer?: string;
  /** True when the card can offer Always allow. */
  always?: boolean;
}

/** A file that the person sends with a message: its name and its bytes in base64, as the native run API takes them. */
export interface Attachment {
  name: string;
  data: string;
}

/** A file of a message as the channel names it. The workspace of each run that got the message holds the bytes. */
export interface AttachedFile {
  name: string;
  size: number;
  mediaType?: string;
}

/** One channel entry. */
export interface Entry {
  seq: number;
  at: string;
  from: Sender;
  to?: string[];
  replyTo?: number | null;
  text: string;
  cut?: boolean;
  /** The files of a message of a person. */
  files?: AttachedFile[];
  /** For a system line: what happened, such as opened, closed, or fired. */
  event?: string;
  mirrors?: Mirror | null;
  reactions?: Partial<Record<ReactionKind, string[]>>;
  decision?: Decision | null;
  /** True when each delivery of the message is pinned, so it survives every compaction of the runs of the members. */
  pinned?: boolean;
  /** The wiki path that a system line is about. The text of the line holds no link to it. */
  page?: string;
  /** The slash command of a message, such as {name: "ansible-style", args: "roles/nginx"}. */
  skill?: SkillCall | null;
  /** On a message of a seat that asks you: the answers that you pick from, or none for an answer in words. Whether it still waits is the question of the member. */
  ask?: { choices?: string[] } | null;
  /**
   * True on the entry of a stream event of an older page that carries a
   * cut entry: a card without decision.input and decision.schema. The front
   * sets partial beside the entry (MessageEventData). The page reads the
   * entry again with ?from=<seq>&limit=1 and never shows the cut card.
   */
  partial?: boolean;
}

/** One page of the channel, as the transcript route pages. */
export interface MessagePage {
  bridge: string;
  messages: Entry[];
  next: number;
  prev: number;
}

export interface ApprovalPending {
  id: string;
  tool?: string;
  callId?: string;
  input?: unknown;
  reason?: string;
  schema?: unknown;
  requestedAt?: string;
  connect?: { server: string; title?: string; reason?: string } | null;
}

/** The run object of the kernel, with the fields of the fleet. */
export interface Run {
  id: string;
  agent: string;
  title?: string;
  state: RunState;
  input?: string;
  output?: string;
  error?: string;
  pending?: ApprovalPending | null;
  seq: number;
  origin?: string;
  principal?: string;
  parent?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  /** When the run ended, when the server names it. updatedAt is no end: a later reaction moves it. */
  endedAt?: string;
  member?: string;
  activity?: Activity | null;
  reactions?: Partial<Record<ReactionKind, number>>;
  /** The usage of the run so far: its tokens, its turns, and its cost. */
  usage?: RunUsage;
  /** The tools that an inline profile gave the run beyond the tool list of its agent. */
  extraTools?: string[];
  /** The profile that the kernel resolved when it queued the run, when the run object carries it. */
  resolved?: ResolvedProfile | null;
  /**
   * What the person may do with the run, as the front decides it with the
   * rules of what the person sees: view, and operate, which decides,
   * cancels, and sends. A front before this field sends none.
   */
  can?: { view: boolean; operate: boolean };
  /**
   * True for a run that the front answers from its archive, because the
   * worker that held it was replaced. The page shows it to read, and a
   * message to it answers 409, so the next message starts a new
   * conversation.
   */
  archived?: boolean;
  /** The title that the caller gave the conversation, from the lists of the caller (PATCH /v1/conversations/{run}). */
  myTitle?: string;
  /** True when the caller deleted the conversation from the lists. The server keeps the run in its archive. */
  hidden?: boolean;
}

/** The usage of a run, as the kernel sums it. Every field is a sum. */
export interface RunUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  turns?: number;
  toolCalls?: number;
  costUSD?: number;
  unpricedTokens?: number;
}

/** The parts of the resolved profile of a run that the page shows. A list that is missing gives every tool or every skill. */
export interface ResolvedProfile {
  model?: string;
  tools?: string[];
  skills?: string[] | null;
  policy?: Rules | null;
}

/**
 * The data of fw.run.queued, the first event of a run, in part: the inline
 * profile of the request, the tools that it gives beyond the list of the
 * agent, and the profile that the kernel resolved when it queued the run.
 */
export interface QueuedData {
  agent?: string;
  profile?: InlineProfile | null;
  extraTools?: string[];
  resolved?: ResolvedProfile | null;
}

/** One event of the ledger of a run, from GET /v1/runs/{id}/events. */
export interface RunEvent {
  seq: number;
  type: string;
  time?: string;
  data?: unknown;
}

/** An inline profile of a new run: a tool or skill list replaces the list of the agent for that run. */
export interface InlineProfile {
  tools?: string[];
  skills?: string[];
  /** The IANA time zone of the run, such as America/New_York. */
  timeZone?: string;
}

/** The body of POST /v1/runs. A field that is not set stays out, because the kernel refuses an unknown field. */
export interface NewRun {
  agent: string;
  input: string;
  title?: string;
  profile?: InlineProfile;
  metadata?: Record<string, string>;
  files?: Attachment[];
  /** The id of an earlier conversation that the run takes up: the server puts a summary of it in front of the input. */
  continues?: string;
}

/** The decision of a result (dashboard.Decision). */
export interface ResultDecision {
  id: string;
  tool?: string;
  label: string;
  question?: boolean;
  reason?: string;
  effect?: string;
  input?: unknown;
  schema?: unknown;
}

export interface ResultFile {
  path: string;
  oldPath?: string;
  op: string;
  size?: number;
  seq: number;
}

export interface ResultStep {
  seq: number;
  tool: string;
  text: string;
  isError?: boolean;
  done: boolean;
}

/** The answer of GET /v1/runs/{id}/result. */
export interface Result {
  runId: string;
  /** True when no worker holds the run any more, and the front reads it from its archive. */
  archived?: boolean;
  title: string;
  agent: string;
  status: string;
  summary?: string;
  error?: string;
  files?: ResultFile[];
  steps?: ResultStep[];
  pending?: ResultDecision | null;
  limits?: string[];
  next?: { kind: string; label: string }[];
  started: string;
  changed: string;
}

/** One chat item of a transcript (dashboard.Item). */
export interface Item {
  seq: number;
  time: string;
  kind: 'user' | 'assistant' | 'tool' | 'result' | 'file' | 'ask' | 'decided' | 'note' | 'end' | 'tools';
  text?: string;
  detail?: string;
  tool?: string;
  callId?: string;
  id?: string;
  input?: unknown;
  schema?: unknown;
  who?: string;
  path?: string;
  size?: number;
  isError?: boolean;
  cut?: boolean;
  /** The files of a user message, as the workspace of the run keeps them under attachments/. */
  files?: (AttachedFile & { path?: string })[];
}

/** The answer of GET /v1/runs/{id}/transcript. */
export interface Transcript {
  run: Run;
  items: Item[];
  next: number;
  prev: number;
}

/** The view of a file that a run changed (view.FileView). */
export interface FileView {
  path: string;
  op: string;
  size: number;
  mediaType?: string;
  text?: string;
  cut?: boolean;
  binary?: boolean;
  large?: boolean;
  gone?: boolean;
}

export interface FleetAgent {
  name: string;
  description?: string;
  role?: string;
  teams?: string[];
}

export interface FleetMember {
  name: string;
  url?: string;
  self?: boolean;
  state: string;
  lastSeen: string;
  canForward: boolean;
  accessMode: string;
  agents: FleetAgent[];
  active: number;
  inputRequired: number;
  blockedReason?: string;
}

export interface TaskStatus {
  name: string;
  phase: string;
  current: boolean;
  note?: string;
}

/**
 * The workers of one agent, as GET /v1/fleet lists them and GET
 * /v1/pools/{name} answers. The page never says pool: the profile shows
 * Workers, and wanted is Keep.
 */
export interface Pool {
  name: string;
  /** config for a pool of the configuration, runtime for one that the page made. */
  source?: string;
  /** The worker template of a pool that the page made. */
  template?: string;
  atespace: string;
  agent: string;
  intake: string;
  wanted: number;
  actual: number;
  ready: number;
  hash: string;
  generation?: number;
  tasks: TaskStatus[];
  gaps?: string[];
  checkedAt: string;
  by?: string;
  at?: string;
  deleting?: boolean;
}

/** The counts of the day of an agent, from GET /v1/bossmode/agents/{agent}/today. partial is true when a run reports no cost. */
export interface Today {
  runs: number;
  costUSD?: number;
  decisions: number;
  partial?: boolean;
}

/** The answer of GET /v1/fleet. */
export interface Fleet {
  name: string;
  members: FleetMember[];
  pools?: Pool[];
}

/** The rules of a profile: the tools that ask first, and the tools that never run. */
export interface Rules {
  ask?: string[];
  deny?: string[];
}

/** One agent of GET /v1/agents (view.AgentView, in part). skills is the allowlist of the profile: null allows every skill. */
export interface Agent {
  name: string;
  description?: string;
  role: string;
  tools?: string[];
  skills?: string[] | null;
  policy?: Rules | null;
  /** The pool whose workers run the profile. A profile of the front itself has none. */
  pool?: string;
  /** True for a profile of the front itself, which no worker of a pool runs. */
  front?: boolean;
  /** For a profile that names no tools: the tools and the rules that its workers give it, as the dry run of PUT /v1/agents/{name} names them. */
  workerTools?: string[];
  workerPolicy?: Rules | null;
  /** The switch of the packages of its workers, on a server with a package mirror. */
  workerPackages?: PackageSwitch | null;
}

/** The switch of the packages of the workers of an agent: on, and whether the agent can ask for a package. */
export interface PackageSwitch {
  on: boolean;
  ask: boolean;
}

/** The display of an agent: GET /v1/faces and PATCH /v1/faces/{agent}. */
export interface FaceMeta {
  agent: string;
  displayName: string;
  tagline: string;
  hash: string;
  custom: boolean;
  by?: string;
  at?: string;
  version?: number;
}

/**
 * One page of the wiki in the tree. by is a subject, agent:<profile>,
 * run:<id>, token, or bossmode. version is the revision of the store: it
 * grows with each write of the wiki, so the versions of one page are not
 * consecutive.
 */
export interface PageMeta {
  path: string;
  title: string;
  tags?: string[];
  hash: string;
  version?: number;
  size: number;
  by: string;
  run?: string;
  at: string;
  summary?: string;
}

/** The answer of GET /v1/pages/{path}. */
export interface Page extends PageMeta {
  text: string;
  version: number;
}

/** A page that someone removed, from GET /v1/pages/removed: its path, its title, its last version before the removal, and when it went. */
export interface RemovedPage {
  path: string;
  title: string;
  version: number;
  removedAt: string;
}

/** One version of a page. A removal has deleted set, and no text, hash, or writer. */
export interface PageVersion {
  version: number;
  hash: string;
  by: string;
  at: string;
  summary?: string;
  size: number;
  title?: string;
  run?: string;
  deleted?: boolean;
}

export interface SearchHit {
  path: string;
  title: string;
  snippet: string;
  version?: number;
  score?: number;
}

/** The kinds of the event stream, GET /v1/bossmode/stream. */
export type StreamKind = 'bridge.message' | 'bridge.member' | 'run' | 'page' | 'face' | 'member' | 'task' | 'reset';

export interface StreamEvent {
  id: string;
  kind: StreamKind | string;
  data: unknown;
}

/** The data of a bridge.message event. */
export interface MessageEventData {
  bridge: string;
  message: Entry;
  /** True when the event carries the entry without decision.input and decision.schema, because the whole entry is larger than an event. */
  partial?: boolean;
}

/** The data of a bridge.member event. */
export interface MemberEventData {
  bridge: string;
  member: Member;
}

/** The data of a page event. */
export interface PageEventData extends PageMeta {
  deleted?: boolean;
}

/** A page of the work of a bridge: a page of GET /v1/pages, and the seat whose run wrote its newest version, when the front knows it. */
export interface BridgePage extends PageMeta {
  seat?: string;
}

/** The answer of GET /v1/bridges/{id}/pages: the pages of the work of a bridge, sorted by path. */
export interface BridgePages {
  bridge: string;
  pages: BridgePage[];
  count: number;
}

/**
 * The data of a member or a task event of the fleet view. A member event
 * has state, a task event has phase, and gone marks one that left the view.
 */
export interface FleetChange {
  kind: 'member' | 'task';
  member: string;
  state?: string;
  phase?: string;
  gone?: boolean;
  time: string;
}

/* ---------- skills and tools ---------- */

/**
 * Where a skill comes from: local to a skills directory of the
 * configuration, imported by an admin, or offered by an MCP server, which
 * server names.
 */
export type SkillOrigin = 'local' | 'imported' | 'mcp';

/** A named argument of a skill, for its placeholders. */
export interface SkillArgument {
  name: string;
  description?: string;
}

/**
 * A skill of GET /v1/bossmode/skills: the keys of its front matter that a
 * slash command reads, and where it comes from. A skill of a server is
 * named <server>/<name>.
 */
export interface Skill {
  name: string;
  description: string;
  origin: SkillOrigin;
  /** The tools.mcp entry of a skill of origin mcp. */
  server?: string;
  /** The URI of the skill of a server, else the path of its SKILL.md in its skills directory. */
  uri?: string;
  /** False when the front matter says user-invocable: false, so no person hands the skill to a run. */
  userInvocable?: boolean;
  /** False when the front matter says disable-model-invocation: true. */
  modelInvocable?: boolean;
  /** The argument-hint of the front matter, such as "<role>". */
  argumentHint?: string;
  arguments?: SkillArgument[];
  /** The other files of the skill directory. */
  files?: string[];
}

/** A skill as the view of an agent names it, in GET /v1/agents/{name}/skills. */
export interface SkillRef {
  name: string;
  description: string;
  origin: SkillOrigin;
  server?: string;
}

/** The answer of GET /v1/agents/{name}/skills: the allowlist of the profile, null for every skill, and the skills that it allows. */
export interface AgentSkills {
  agent: string;
  pool?: string;
  allowlist: string[] | null;
  skills: SkillRef[];
}

/** The answer of GET /v1/skills/{name} of the kernel: the skill, the whole SKILL.md as body, and the other files. */
export interface SkillFile {
  name: string;
  description: string;
  origin: string;
  server?: string;
  uri?: string;
  body: string;
  files: string[];
}

/**
 * A tool of the fleet. The catalog of the backend holds no tools, so the
 * page reads the capabilities of GET /v1/tools: each with its name, its
 * source, builtin or a server, and its plain phrase in text.
 */
export interface Tool {
  /** The id of the tool, unique over the fleet, such as bash or github/create_issue. */
  id?: string;
  name: string;
  description?: string;
  text?: string;
  origin?: 'builtin' | 'server';
  source?: string;
  server?: string;
}

/** The answer of GET /v1/bossmode/skills. tools is there only in an older shape. */
export interface SkillsList {
  skills: Skill[];
  tools?: Tool[];
}

/** A skill of a marketplace. */
export interface MarketSkill {
  name: string;
  description: string;
  url?: string;
  path?: string;
}

/** A marketplace that the admin configured, from GET /v1/bossmode/marketplaces. error says why its index did not load. */
export interface Marketplace {
  name: string;
  url: string;
  kind?: string;
  skills: MarketSkill[];
  notes?: string[];
  error?: string;
  fetchedAt?: string;
}

/** Where a new skill comes from: exactly one of url, marketplace with name, text, and files. */
export type SkillSource = { url: string } | { marketplace: string; name: string } | { text: string } | { files: { path: string; text: string }[] };

/** A finding of the checks of a preview. A finding that blocks stops an install. */
export interface SkillProblem {
  code: string;
  path?: string;
  text: string;
  blocks: boolean;
}

/** The skill of the catalog, or a directory, that holds the name of a preview. Only an imported skill is replaceable. */
export interface SkillExisting {
  origin: string;
  replaceable: boolean;
  digest?: string;
  directory?: boolean;
}

/** The source of an imported skill, as a preview names it. */
export interface SkillRecord {
  kind: 'url' | 'marketplace' | 'text' | 'files';
  url?: string;
  marketplace?: string;
  name?: string;
  digest?: string;
  installedBy?: string;
  installedAt?: string;
  files?: { path: string; size: number }[];
}

/** The answer of POST /v1/bossmode/skills/preview: what an install will write, and what the checks found. Nothing is installed. */
export interface SkillPreview {
  name: string;
  description: string;
  frontMatter: Record<string, unknown> | null;
  entry: Skill;
  body: string;
  files: { path: string; size: number }[];
  /** The digest of what the preview read. An install from a URL or a marketplace sends it back. */
  digest: string;
  source: SkillRecord;
  exists: SkillExisting | null;
  problems: SkillProblem[] | null;
  installable: boolean;
}

/** The answer of POST /v1/bossmode/skills: the entry of the catalog, whether it replaced an imported skill, and the preview of what it wrote. */
export interface SkillInstalled {
  skill: Skill;
  replaced: boolean;
  preview: SkillPreview;
}

/** A slash command: the name of a skill and its arguments. */
export interface SkillCall {
  name: string;
  args?: string;
}

/* ---------- a new agent ---------- */

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
  /** On a dry run for workers: their tools for a profile that names none, a server as <server>.*. */
  workerTools?: string[];
  /** On a dry run for workers: their rules, which the rules of the profile can only tighten. */
  workerPolicy?: Rules | null;
  /** On a dry run for workers: the switch of their packages, on a server with a package mirror. */
  workerPackages?: PackageSwitch | null;
}

/* ---------- duties ---------- */

/** The repeat of a schedule. */
export type Repeat = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'hourly' | 'every';

/** A day of the week, as a schedule names it. */
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/**
 * The schedule of a duty: a small record that matches how a person says a
 * time. The front reads each time in timeZone. docs/CONTRACT.md, section
 * 16, gives the rule of each field.
 */
export interface Schedule {
  repeat: Repeat;
  /** With weekly, and optional with hourly and every. */
  days?: Day[];
  /** 1 to 4, with weekly. 2 is every other week. */
  everyWeeks?: number;
  /** With monthly: 1 to 31, last, or first, second, third, fourth, or last with a weekday, such as first monday. */
  dayOfMonth?: string;
  /** HH:MM in 24 hours, with daily, weekdays, weekly, and monthly. */
  times?: string[];
  /** A span from 15m to 24h, with every. */
  every?: string;
  /** Two HH:MM, with hourly and every. */
  between?: [string, string];
  timeZone?: string;
  start?: string;
  end?: string;
}

/**
 * An event of the fleet that starts a duty: kind is one of the events of
 * GET /v1/duties/options, such as bridge.closed. agent narrows it to one
 * agent, after is how long a question waits, and path is a path of the
 * wiki for page.changed.
 */
export interface DutyEvent {
  kind: string;
  agent?: string;
  after?: string;
  path?: string;
}

/** What starts a duty: exactly one of a schedule, the words of a person, an event, or a call of another app. */
export interface DutyWhen {
  schedule?: Schedule;
  /** The words of a person, such as every weekday at 9am. The front turns them into a schedule and keeps only the schedule. */
  say?: string;
  event?: DutyEvent;
  webhook?: { auth: { mode: string; secret: string; header?: string } };
}

/** A filter of the items of a check: a dotted path in an item and one test. */
export interface CheckWhere {
  field: string;
  is?: unknown;
  isNot?: unknown;
  oneOf?: unknown[];
  contains?: unknown;
  atLeast?: number;
  atMost?: number;
}

/** When the items of a check wake the agent: new items (the default), any item, or at a count. */
export interface CheckWake {
  when: 'new' | 'any' | 'atLeast';
  count?: number;
}

/** Check first: one look at an address or a tool before the duty wakes the model. */
export interface CheckFirst {
  look: {
    http?: { url: string; secret?: string; header?: string };
    tool?: string;
    input?: Record<string, unknown>;
  };
  /** Where the list is in the answer, such as result.records. */
  items?: string;
  /** What makes an item new: the field that names an item. */
  key?: string;
  where?: CheckWhere[];
  wake?: CheckWake;
}

/** What a duty does: exactly one of ask, post (in a bridge that stays open), open (a bridge from a playbook), and manager. */
export interface DutyDo {
  /** The message of the person. A duty whose message comes from the setup of the server names none. */
  ask?: { message?: string; [k: string]: unknown };
  post?: { bridge: string; to?: string[]; message: string };
  open?: { playbook: string; goal?: string };
  manager?: { message: string };
}

/**
 * The limits of a duty. They follow the action. For ask and manager,
 * budget is required, with at least one limit above zero. A post spends
 * nothing of its own, so the front drops budget and perDayUSD. For open,
 * budget holds only maxTurns, the turns of the whole bridge, and the front
 * drops perDayUSD.
 */
export interface DutyLimits {
  budget?: { maxCostUSD?: number; maxTurns?: number; maxTokens?: number; maxToolCalls?: number };
  perDayUSD?: number;
  /** skip (the default), queue, or allow, for a time that comes while the last run still works. */
  overlap?: 'skip' | 'queue' | 'allow';
  /** A duration from 0 to 24h. A missed time younger than this runs once. */
  catchUp?: string;
  retries?: number;
}

/** Who decides a question of a run of the duty while the person is away, and what happens after the timeout. */
export interface WhileAway {
  decider: 'manager' | 'nobody';
  timeout: string;
  then: 'deny' | 'cancel';
}

/** Who hears of a failure and of a question that needs a person. owner is the owner of the duty. */
export interface DutyNotify {
  failure?: string[];
  needsYou?: string[];
  /** Who hears of each result of a run that ended well. An older front leaves it out. */
  result?: string[];
  /** always, or found: only a result that found something. */
  resultWhen?: 'always' | 'found';
}

/** One run of a duty, as lastRun and the history show it. */
export interface DutyRun {
  at: string;
  /** The time of the schedule that the run belongs to. */
  slot?: string;
  /** The run of the agent, or "" for a time that started no run. */
  run?: string;
  state: string;
  costUSD?: number;
  /** The count of the items that the check found. */
  found?: number;
  /** True when the check woke the agent. The front sends false also for a run without a check. The state quiet says that the agent slept. */
  woke?: boolean;
  /** Why the time started no run, in words, such as a skip. */
  reason?: string;
  /** When the run started, and its attempt from 1 when a failed run went again. */
  start?: string;
  attempt?: number;
  /** The title of the run. */
  title?: string;
  /** The questions of the run that somebody decided while the person was away, oldest first. */
  decided?: DutyDecided[];
}

/**
 * A decision on a question of a run of a duty. by is manager, timeout (the
 * default of the duty after its wait), or the subject of a person. verdict
 * is allow, deny, or cancel.
 */
export interface DutyDecided {
  at: string;
  by: string;
  verdict: 'allow' | 'deny' | 'cancel' | string;
  tool: string;
  reason?: string;
  /** True for a question, which a person answers or declines. */
  question?: boolean;
}

/** The state of a duty that the front keeps. */
export interface DutyState {
  lastRun?: DutyRun | null;
  todayUSD?: number;
  failuresInRow?: number;
  /** Why the duty paused itself, such as after three failed runs in a row. */
  pausedReason?: string;
}

/** The record of a duty, as the page writes it. */
export interface DutyRecord {
  name: string;
  /** The name in the words of the person, such as Walk Duty 1, one line of at most 100 characters. The page shows it in place of the name. */
  title?: string;
  agent: string;
  pool?: string;
  owner?: string;
  when: DutyWhen;
  checkFirst?: CheckFirst | null;
  do: DutyDo;
  limits: DutyLimits;
  whileAway?: WhileAway;
  notify?: DutyNotify;
  /** True when each result waits for its owner to check it: Looks right or Needs work. Each start sets workbench.review on its run. */
  review?: boolean;
  runAs?: string;
  paused?: boolean;
  /** The revision that the person read, on a change, so a change in the meantime answers 409. */
  revision?: number;
}

/** A duty as a read answers it: the record, and what the front adds. */
export interface Duty extends DutyRecord {
  /** store for a duty of the bucket. An older server answers file for an entry of its settings that the routes never change, and the page shows it locked. */
  source?: 'store' | 'file' | string;
  /** Where the duty came from: kind config for an entry of the configuration of the server that the server imported once. */
  origin?: { kind: string; name?: string } | null;
  /** True for a duty that the setup of the server locks: a change, a pause, or a delete answers 409. */
  locked?: boolean;
  /** True when the message of the duty comes from the setup of the server. No route shows that message. */
  template?: boolean;
  revision?: number;
  /** The schedule in words, such as Every weekday at 9:00 AM, New York time. */
  readback?: string;
  /** The technical part of the readback, such as the address and the credential of a webhook, for the fold For developers. */
  forDevelopers?: string;
  /** The next times, in UTC. */
  next?: string[];
  state?: DutyState;
  /** The last 50 runs, newest first, on a read of one duty. */
  history?: DutyRun[];
}

/** The answer of GET /v1/duties. paused is the switch that pauses every duty. */
export interface DutyList {
  duties: Duty[];
  paused: boolean;
}

/** What a check finds now: at most 20 items, the count, and whether they wake the agent. */
export interface CheckFound {
  found: unknown[];
  count: number;
  wakes: boolean;
}

/**
 * A problem of a dry run, in words. A problem that concerns a field starts
 * with the dotted path of the field and a colon, such as
 * "when.schedule: Pick a time.". A problem with no path concerns the whole.
 */
export type DutyProblem = string;

/** The answer of PUT /v1/duties/{name}?dryRun=true: the record that a save keeps, its readback, the next times, and every problem. */
export interface DutyDryRun {
  duty?: Duty | null;
  readback?: string;
  /** The technical part of the readback, for the fold For developers. */
  forDevelopers?: string;
  next?: string[];
  problems?: DutyProblem[] | null;
  /** With test=true: what the check finds now. */
  check?: CheckFound | null;
}

/** The answer of POST /v1/duties/{name}/write-check: the check that the agent proposed, its readback, and a test of it. */
export interface WrittenCheck {
  checkFirst: CheckFirst;
  readback?: string;
  /** Where the check finds its items and what makes an item new, for the fold For developers. */
  forDevelopers?: string;
  check?: CheckFound | null;
}

/** The answer of POST /v1/duties/{name}/run: the run that started, or why the duty skipped. */
export interface DutyStarted {
  run?: string;
  skipped?: string;
}

/** A secret of the front that a check can use, with the hosts that it may go to. The page never sees its value. */
export interface DutySecret {
  name: string;
  hosts: string[];
}

/**
 * The answer of GET /v1/duties/options: what the front serves now. The
 * editor offers no other choice. events are kinds such as bridge.closed,
 * actions are among ask, post, open, and manager, and looks are among http
 * and tool.
 */
export interface DutyOptions {
  secrets: DutySecret[];
  events: string[];
  actions: string[];
  looks: string[];
}

/** One item of GET /v1/inbox: what needs the person. kind is approval, question, failure, or paused. */
export interface InboxItem {
  /** result: a run whose owner asked to check each result, until a person reacts (docs/CONTRACT.md, section 21). */
  kind: 'approval' | 'question' | 'failure' | 'paused' | 'result' | string;
  run?: string;
  /** The id of the approval that the run waits for, or "" for a question of a seat in a bridge and for a failure or a paused duty. */
  approval?: string;
  duty?: string;
  agent?: string;
  bridge?: string;
  text?: string;
  since?: string;
}

/* ---------- notifications ---------- */

/** The kinds of a channel that the page knows. */
export type ChannelKind = 'ntfy' | 'slack' | 'discord' | 'teams' | 'webhook' | 'email' | 'agent' | 'shared';

/** What goes to a channel: the questions that wait, the failures, and a daily digest. */
export interface NotifySend {
  questions: boolean;
  failures: boolean;
  digest: boolean;
}

/**
 * One place that the front reaches: a channel of one kind with its own
 * switches. It holds only the fields of its kind. url, secret, and
 * ntfy.token are write only: a read answers "set" or "". A write with
 * "set" keeps the stored value, "" clears it, and another value replaces
 * it. A channel without an id gets one from the front.
 */
export interface NotifyChannel {
  id?: string;
  kind: ChannelKind | string;
  label: string;
  send: NotifySend;
  ntfy?: { server: string; topic: string; token: string };
  /** The address of slack, discord, teams, and webhook. */
  url?: string;
  /** The secret that signs the body of a webhook. */
  secret?: string;
  email?: { to: string };
  agent?: { agent: string; how: string; budget: { maxCostUSD?: number; [limit: string]: number | undefined } };
  /** The name of a shared channel of the operator. */
  shared?: string;
}

/** The quiet hours of the person. Off is two empty times. */
export interface QuietHours {
  from: string;
  to: string;
  timeZone: string;
}

/** The notification settings of the person who is signed in, as a write sends them. */
export interface NotifySettings {
  channels: NotifyChannel[];
  quietHours: QuietHours;
}

/** A kind that the front serves now, with its name. */
export interface OfferedKind {
  kind: ChannelKind | string;
  label: string;
}

/** A channel of the operator that a person picks by name. The page never sees its address. */
export interface SharedChannel {
  name: string;
  kind: ChannelKind | string;
  label: string;
}

/**
 * The answer of GET /v1/notifications: the settings, and what a write
 * leaves out. offered names the kinds that the front serves now, shared the
 * channels of the operator, off the reason in words when no channel reaches
 * the person, and serverDefault the ntfy server of the front for an empty
 * server.
 */
export interface NotifyRead extends NotifySettings {
  offered?: OfferedKind[];
  shared?: SharedChannel[];
  off?: string;
  serverDefault?: string;
}

/** What a test did for one channel: sent, or the reason in words. */
export interface NotifyTestResult {
  channel: string;
  sent: boolean;
  error?: string;
}

/* ---------- playbooks ---------- */

/** A seat of a playbook. */
export interface PlaybookSeat {
  handle: string;
  agent: string;
  task: string;
}

/** A playbook: the form of New bridge without a title, saved under a name. GET /v1/playbooks leaves out caps and delegation. */
export interface Playbook {
  name: string;
  goal: string;
  placement: Placement;
  seats: PlaybookSeat[];
  caps?: Partial<Caps>;
  delegation?: Partial<Delegation>;
  revision?: number;
  owner?: string;
  updatedAt?: string;
}

/** One package of the setting of a pool: who added it and when, and for an approval, the agent and the run that asked. */
export interface PackageItem {
  name: string;
  by?: string;
  at?: string;
  agent?: string;
  run?: string;
}

/** A package that a worker installed, with its version. */
export interface InstalledPackage {
  name: string;
  version?: string;
}

/** Why the install of a worker failed: the step, the error, the end of the output of the manager, and the time of the next try. */
export interface PackageFailure {
  step?: string;
  error?: string;
  output?: string;
  retryAt?: string;
}

/** The state of the packages of one worker. unknown means that the front has no event of the Task yet. */
export type PackageState = 'pending' | 'materializing' | 'ready' | 'failed' | 'unknown';

/** One worker of a pool, with the state of its packages. */
export interface PackageWorker {
  task: string;
  state: PackageState;
  at?: string;
  digest?: string;
  installed?: { python?: InstalledPackage[]; tools?: InstalledPackage[] };
  failure?: PackageFailure | null;
}

/**
 * The answer of GET and PUT /v1/pools/{name}/packages: the setting, the
 * packages, and the state of each worker. python holds the Python
 * packages, and tools holds the programs. applying is true while a worker
 * runs an older configuration of the pool.
 */
export interface Packages {
  pool: string;
  available?: boolean;
  on: boolean;
  ask: boolean;
  python: PackageItem[];
  tools: PackageItem[];
  applying?: boolean;
  workers?: PackageWorker[];
}

/** The body of PUT /v1/pools/{name}/packages. It replaces the setting and both lists, which name the packages as the person wrote them. */
export interface PackagesBody {
  on: boolean;
  ask: boolean;
  python: string[];
  tools: string[];
}

/** A stage of a card of the board of the work, in the order of the flow. */
export type WorkStage = 'waiting' | 'working' | 'needs-you' | 'stopped' | 'review' | 'done';

/** One piece of work on the board, a task in the words of the page, from GET /v1/work (docs/CONTRACT.md, section 19). */
export interface WorkCard {
  id: string;
  /** conversation, bridge, duty, job, or event. */
  kind: 'conversation' | 'bridge' | 'duty' | 'job' | 'event';
  title: string;
  /** Who asked: kind person, duty, app, manager, or agent; via page, mcp, queue, bridge, schedule, event, call, now, or manager. */
  from: { kind: string; name?: string; via?: string };
  stage: WorkStage;
  /** Who moves it next: worker, agent, you, person, manager, or "" when it is done. */
  next?: string;
  reason?: string;
  opened: string;
  since: string;
  ended?: string | null;
  agents: string[];
  parts: { waiting?: number; working?: number; needsYou?: number; stopped?: number; review?: number; done?: number; total: number };
  links: { run?: string; approval?: string; bridge?: string; duty?: string; batch?: string; source?: string; runs?: string[] };
  costUSD: number;
  /** True when the pool replaced the worker of a part that had not ended. */
  lost?: boolean;
  /** The verdict of a done card: accepted (a thumb up or a heart), checked (a machine check passed), sent-back (a thumb down), or unchecked. */
  verdict?: WorkVerdict;
}

/** The verdict on a result: a person accepted it, a machine check passed, a person sent it back, or nobody checked it. */
export type WorkVerdict = 'accepted' | 'checked' | 'sent-back' | 'unchecked';

/** One lane of the board: the cards of a stage, the cards whose next move is the person's, and the oldest wait. */
export interface WorkLane {
  stage: WorkStage;
  count: number;
  yours: number;
  oldest?: string;
}

/** GET /v1/work: the board of the work of the person. */
export interface WorkBoard {
  sentence: string;
  lanes: WorkLane[];
  cards: WorkCard[];
  days: number;
}

/* ---------- the door of the Work place ---------- */

/** How a task runs: once now, on a schedule, or by a team of agents. */
export type TaskKind = 'once' | 'repeat' | 'team';

/** When the person hears of a result: each one, only one that found something, or only a failure. */
export type TaskTell = 'each' | 'found' | 'failures';

/** One agent of a plan, and what it does in the task. */
export interface PlanWho {
  agent: string;
  name: string;
  /** In words, such as does it, checks it, or takes a share. */
  does: string;
  /** The seats of this agent, for a team that splits the work. */
  count?: number;
}

/**
 * The answer of POST /v1/work/plan: the words of the person read back
 * before anything starts. start holds the record that Start sends to a
 * route that exists. The plan never names a cost: the page refuses Start
 * until the person types one.
 */
export interface TaskPlan {
  words: string;
  kind: TaskKind;
  title: string;
  who: PlanWho[];
  /** The agents that the person can pick instead. */
  others: { agent: string; name: string }[];
  when: { said?: string; readback: string; next: string[] };
  cost: { basis: string; per: 'run' | 'bridge'; runsPerMonth: number };
  asks: string[];
  quiet: string[];
  tell: TaskTell;
  result: string;
  gaps: string[];
  problems: string[];
  start: { duty?: DutyRecord & { notify?: DutyNotify & { result?: string[]; resultWhen?: 'always' | 'found' } }; bridge?: { title: string; goal: string; placement?: Placement; members: { handle: string; agent: string; task: string }[]; caps?: Record<string, number>; delegation?: Record<string, boolean> }; run?: { member: string; body: NewRun } };
  /** The address of what Start makes, when the plan knows it. */
  open: string;
}
