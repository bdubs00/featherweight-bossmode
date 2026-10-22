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

/** The answer of GET /v1/bossmode: the settings that the page reads. */
export interface BossConfig {
  manager: ManagerConfig | null;
  placement: Placement;
  maxMembers: number;
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
  state: 'pending' | 'allow' | 'deny';
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

export interface Pool {
  name: string;
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
}

/** The answer of GET /v1/fleet. */
export interface Fleet {
  name: string;
  members: FleetMember[];
  pools?: Pool[];
}

/** One agent of GET /v1/agents (view.AgentView, in part). */
export interface Agent {
  name: string;
  description?: string;
  role: string;
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
