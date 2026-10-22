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

/** The presence of a member, from section 6.5 of the plan. */
export type Presence = 'working' | 'needs-you' | 'idle' | 'asleep' | 'error' | 'fired';

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

/** One channel entry. */
export interface Entry {
  seq: number;
  at: string;
  from: Sender;
  to?: string[];
  replyTo?: number | null;
  text: string;
  cut?: boolean;
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
  /**
   * True on a stream event that carries a cut entry: a card without
   * decision.input and decision.schema. The page reads the entry again with
   * ?from=<seq>&limit=1 and never shows the cut card.
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
  member?: string;
  activity?: Activity | null;
  reactions?: Partial<Record<ReactionKind, number>>;
  /** The usage of the run so far: its tokens, its turns, and its cost. */
  usage?: RunUsage;
  /** The tools that an inline profile gave the run beyond the tool list of its agent. */
  extraTools?: string[];
  /** The profile that the kernel resolved when it queued the run, when the run object carries it. */
  resolved?: ResolvedProfile | null;
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

/** The parts of the resolved profile of a run that the page shows. */
export interface ResolvedProfile {
  model?: string;
  tools?: string[];
  skills?: string[];
}

/** An inline profile of a new run: a tool or skill list replaces the list of the agent for that run. */
export interface InlineProfile {
  tools?: string[];
  skills?: string[];
}

/** The body of POST /v1/runs. A field that is not set stays out, because the kernel refuses an unknown field. */
export interface NewRun {
  agent: string;
  input: string;
  title?: string;
  profile?: InlineProfile;
  metadata?: Record<string, string>;
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
}
