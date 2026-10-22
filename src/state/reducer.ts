// The state of the page and the reducer that changes it. The state is
// normalized: a change to one entry, one member, one run, or one page makes
// a new object for that row and keeps every other row as it was. A row
// component compares its row by identity, so a change redraws one row, and
// no list redraws on a tick.

import type {
  Agent,
  BossConfig,
  Bridge,
  Entry,
  FaceMeta,
  Fleet,
  FleetChange,
  Member,
  MemberEventData,
  MessageEventData,
  MessagePage,
  PageEventData,
  PageMeta,
  Run,
  SkillsList,
  StreamEvent,
  Whoami,
} from '../api/types';
import type { StreamStatus } from '../api/stream';

/** The loaded part of the channel of one bridge. seqs is sorted. */
export interface Channel {
  seqs: number[];
  bySeq: Record<number, Entry>;
  /** The before value of the page in front; 0 when the first entry is here. */
  prev: number;
}

/** The roster of one bridge. order keeps the order of the seats. */
export interface Roster {
  order: string[];
  byHandle: Record<string, Member>;
}

export interface State {
  me: Whoami | null;
  config: BossConfig | null;
  bridges: { order: string[]; byId: Record<string, Bridge>; loaded: boolean };
  channels: Record<string, Channel>;
  rosters: Record<string, Roster>;
  runs: Record<string, Run>;
  pages: { byPath: Record<string, PageMeta>; loaded: boolean };
  faces: Record<string, FaceMeta>;
  /** The agents that the caller can see, from GET /v1/agents. */
  agents: Agent[] | null;
  /** The members and the pools of the fleet, from GET /v1/fleet and the member and task events. */
  fleet: Fleet | null;
  /** The skills of the front, from GET /v1/bossmode/skills. */
  skills: SkillsList | null;
  /** The names of the skills that each agent can load, from GET /v1/agents/{name}/skills, for the agents that the page read. */
  agentSkills: Record<string, string[]>;
  /**
   * The conversation with the manager that a person picked: a run, or ""
   * for a new conversation. null follows the newest run of the settings.
   * by names the person, so another person who signs in follows the
   * settings.
   */
  managerPick: { run: string; by: string } | null;
  /** The bridge that the person reads now, or "". */
  open: string;
  stream: { status: StreamStatus; lastId: string };
  /** Grows when the stream cannot resume, so the page loads again. */
  resets: number;
}

export const initialState: State = {
  me: null,
  config: null,
  bridges: { order: [], byId: {}, loaded: false },
  channels: {},
  rosters: {},
  runs: {},
  pages: { byPath: {}, loaded: false },
  faces: {},
  agents: null,
  fleet: null,
  skills: null,
  agentSkills: {},
  managerPick: null,
  open: '',
  stream: { status: 'connecting', lastId: '' },
  resets: 0,
};

export type Action =
  | { type: 'me'; me: Whoami | null }
  | { type: 'config'; config: BossConfig | null }
  | { type: 'bridges'; bridges: Bridge[] }
  | { type: 'bridge'; bridge: Bridge }
  | { type: 'channel'; bridge: string; page: MessagePage; mode: 'latest' | 'older' | 'newer' }
  | { type: 'entry'; bridge: string; entry: Entry }
  | { type: 'member'; bridge: string; member: Member }
  | { type: 'read'; bridge: string; seq: number }
  | { type: 'open'; bridge: string }
  | { type: 'run'; run: Run }
  | { type: 'pages'; pages: PageMeta[] }
  | { type: 'page'; page: PageEventData }
  | { type: 'agents'; agents: Agent[] }
  | { type: 'fleet'; fleet: Fleet }
  | { type: 'skills'; skills: SkillsList | null }
  | { type: 'agent-skills'; agent: string; skills: string[] }
  | { type: 'agent-skills-forget' }
  | { type: 'manager-pick'; pick: { run: string; by: string } | null }
  | { type: 'faces'; faces: FaceMeta[] }
  | { type: 'face'; face: FaceMeta }
  | { type: 'stream'; event: StreamEvent }
  | { type: 'stream-status'; status: StreamStatus };

/** mine reports whether a person entry comes from the caller. */
export function mine(state: State, e: Entry): boolean {
  const me = state.me && state.me.principal;
  return !!me && e.from.kind === 'person' && e.from.name === me.subject;
}

/**
 * counts reports whether an entry counts as unread: a message of a person or
 * an agent, or a card that waits for a decision. A plain system line does
 * not count, and neither does a message of the caller.
 */
export function counts(state: State, e: Entry): boolean {
  if (mine(state, e)) return false;
  if (e.from.kind === 'system') return !!(e.decision && e.decision.state === 'pending');
  return true;
}

/**
 * bridgeOf strips the members of a record, which the roster holds. A read
 * mark never moves back: the page can know a newer one than the server,
 * because it tells the server a moment later. The open bridge has no
 * unread entry.
 */
function bridgeOf(b: Bridge, old: Bridge | undefined, open: string): Bridge {
  const { members, ...rest } = b;
  const next: Bridge = { ...rest, members: undefined };
  if (old && old.read > next.read) {
    next.read = old.read;
    if (next.lastSeq <= old.read) next.unread = 0;
  }
  if (b.id === open) {
    next.read = Math.max(next.read, next.lastSeq);
    next.unread = 0;
    next.unreadMore = false;
  }
  // Only GET /v1/bridges/{id} carries usage. A list item or a PATCH answer
  // keeps the last sum, so the foot of the members does not blink.
  if (next.usage === undefined && old && old.usage) next.usage = old.usage;
  if (members) {
    next.memberCount = members.length;
    next.needsYou = members.filter((m) => m.presence === 'needs-you').length;
  } else if (old) {
    if (next.memberCount === undefined) next.memberCount = old.memberCount;
    if (next.needsYou === undefined) next.needsYou = old.needsYou;
  }
  delete next.members;
  return next;
}

/** sortBridges puts open bridges first, then the newest first. */
function sortBridges(byId: Record<string, Bridge>): string[] {
  return Object.values(byId)
    .sort((a, b) => {
      if (a.state !== b.state) return a.state === 'open' ? -1 : 1;
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1;
    })
    .map((b) => b.id);
}

/** sameOrder reports whether two lists hold the same ids in the same order. */
function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function putBridge(state: State, b: Bridge): State {
  const old = state.bridges.byId[b.id];
  const byId = { ...state.bridges.byId, [b.id]: bridgeOf(b, old, state.open) };
  const order = sortBridges(byId);
  return { ...state, bridges: { ...state.bridges, byId, order: sameOrder(order, state.bridges.order) ? state.bridges.order : order } };
}

function rosterOf(members: Member[], old?: Roster): Roster {
  const byHandle: Record<string, Member> = {};
  for (const m of members) {
    const prev = old && old.byHandle[m.handle];
    // An equal member keeps its object, so its row does not redraw.
    byHandle[m.handle] = prev && JSON.stringify(prev) === JSON.stringify(m) ? prev : m;
  }
  const order = members.map((m) => m.handle);
  return { order: old && sameOrder(order, old.order) ? old.order : order, byHandle };
}

/** insertSeq puts a seq into a sorted list and returns a new list. */
function insertSeq(seqs: number[], seq: number): number[] {
  if (seqs.length === 0 || seq > seqs[seqs.length - 1]) return [...seqs, seq];
  let i = seqs.length - 1;
  while (i >= 0 && seqs[i] > seq) i--;
  const out = seqs.slice();
  out.splice(i + 1, 0, seq);
  return out;
}

/**
 * putEntry adds or replaces one entry of a channel. An entry older than
 * the loaded part stays out: the page reads it with Load earlier.
 */
function putEntry(ch: Channel, e: Entry): Channel {
  const has = ch.bySeq[e.seq] !== undefined;
  if (!has && ch.seqs.length > 0 && e.seq < ch.seqs[0] && ch.prev > 0) return ch;
  if (has && JSON.stringify(ch.bySeq[e.seq]) === JSON.stringify(e)) return ch;
  return { ...ch, seqs: has ? ch.seqs : insertSeq(ch.seqs, e.seq), bySeq: { ...ch.bySeq, [e.seq]: e } };
}

/** applyEntry puts an entry into the state: the channel, the counts, and the record. */
function applyEntry(state: State, bridgeId: string, e: Entry): State {
  let next = state;
  const ch = state.channels[bridgeId];
  const isNew = ch ? ch.bySeq[e.seq] === undefined : true;
  if (ch) {
    const nch = putEntry(ch, e);
    if (nch !== ch) next = { ...next, channels: { ...next.channels, [bridgeId]: nch } };
  }
  const b = next.bridges.byId[bridgeId];
  if (b) {
    let nb = b;
    if (e.seq > b.lastSeq) {
      nb = { ...nb, lastSeq: e.seq };
      if (isNew && e.seq > b.read && counts(state, e)) {
        if (state.open === bridgeId) nb.read = e.seq;
        else nb.unread = (nb.unread || 0) + 1;
      }
      if (mine(state, e) && nb.read < e.seq && state.open === bridgeId) nb.read = e.seq;
    }
    if (e.from.kind === 'system' && e.event === 'closed' && nb.state !== 'closed') nb = { ...nb, state: 'closed', closedAt: e.at };
    if (e.from.kind === 'system' && e.event === 'reopened' && nb.state !== 'open') nb = { ...nb, state: 'open', closedAt: null };
    if (nb !== b) {
      const byId = { ...next.bridges.byId, [bridgeId]: nb };
      const order = nb.state !== b.state ? sortBridges(byId) : next.bridges.order;
      next = { ...next, bridges: { ...next.bridges, byId, order } };
    }
  }
  return next;
}

/**
 * applyMember puts one member into the roster of its bridge. A roster that
 * the page has not loaded stays out, because one member alone makes a
 * wrong roster. The actions load the record first.
 */
function applyMember(state: State, bridgeId: string, m: Member): State {
  const r = state.rosters[bridgeId];
  if (!r) return state;
  const old = r.byHandle[m.handle];
  if (old && JSON.stringify(old) === JSON.stringify(m)) return state;
  const roster: Roster = { order: old ? r.order : [...r.order, m.handle], byHandle: { ...r.byHandle, [m.handle]: m } };
  let next: State = { ...state, rosters: { ...state.rosters, [bridgeId]: roster } };
  const b = next.bridges.byId[bridgeId];
  if (b) {
    const all = roster.order.map((h) => roster.byHandle[h]);
    const needsYou = all.filter((x) => x.presence === 'needs-you').length;
    if (needsYou !== b.needsYou || all.length !== b.memberCount) {
      next = { ...next, bridges: { ...next.bridges, byId: { ...next.bridges.byId, [bridgeId]: { ...b, needsYou, memberCount: all.length } } } };
    }
  }
  return next;
}

function applyPage(state: State, p: PageEventData): State {
  const byPath = { ...state.pages.byPath };
  if (p.deleted) {
    if (!byPath[p.path]) return state;
    delete byPath[p.path];
  } else {
    const { deleted: _, ...meta } = p;
    void _;
    byPath[p.path] = meta;
  }
  return { ...state, pages: { ...state.pages, byPath } };
}

/** taskKey tells whether a task event names a Task of a pool: atespace/name, or the name alone. */
function sameTask(member: string, atespace: string, name: string): boolean {
  return member === atespace + '/' + name || member === name;
}

/** applyFleet applies a member or a task event to a loaded fleet view. */
function applyFleet(state: State, c: FleetChange): State {
  const f = state.fleet;
  if (!f || !c || typeof c.member !== 'string') return state;
  if (c.kind === 'member') {
    const i = f.members.findIndex((m) => m.name === c.member);
    let members = f.members;
    if (c.gone) {
      if (i < 0) return state;
      members = f.members.filter((_, j) => j !== i);
    } else if (i >= 0) {
      if (!c.state || f.members[i].state === c.state) return state;
      members = f.members.map((m, j) => (j === i ? { ...m, state: c.state as string, lastSeen: c.time || m.lastSeen } : m));
    } else {
      members = [...f.members, { name: c.member, state: c.state || 'unknown', lastSeen: c.time, canForward: false, accessMode: '', agents: [], active: 0, inputRequired: 0 }];
    }
    return { ...state, fleet: { ...f, members } };
  }
  if (c.kind === 'task') {
    let changed = false;
    const pools = (f.pools || []).map((p) => {
      const i = p.tasks.findIndex((t) => sameTask(c.member, p.atespace, t.name));
      if (i < 0) return p;
      if (c.gone) {
        changed = true;
        return { ...p, tasks: p.tasks.filter((_, j) => j !== i) };
      }
      if (!c.phase || p.tasks[i].phase === c.phase) return p;
      changed = true;
      return { ...p, tasks: p.tasks.map((t, j) => (j === i ? { ...t, phase: c.phase as string } : t)) };
    });
    return changed ? { ...state, fleet: { ...f, pools } } : state;
  }
  return state;
}

/** applyStream applies one event of the stream. An unknown kind changes nothing. */
export function applyStream(state: State, ev: StreamEvent): State {
  let next = state;
  const d = ev.data as Record<string, unknown> | null;
  switch (ev.kind) {
    case 'bridge.message': {
      const m = d as unknown as MessageEventData;
      if (m && typeof m.bridge === 'string' && m.message && typeof m.message.seq === 'number') next = applyEntry(state, m.bridge, m.message);
      break;
    }
    case 'bridge.member': {
      const m = d as unknown as MemberEventData;
      if (m && typeof m.bridge === 'string' && m.member && typeof m.member.handle === 'string') next = applyMember(state, m.bridge, m.member);
      break;
    }
    case 'run': {
      const r = d as unknown as Run;
      if (r && typeof r.id === 'string') next = reduce(state, { type: 'run', run: r });
      break;
    }
    case 'page': {
      const p = d as unknown as PageEventData;
      if (p && typeof p.path === 'string') next = applyPage(state, p);
      break;
    }
    case 'face': {
      const f = d as unknown as FaceMeta;
      if (f && typeof f.agent === 'string') next = reduce(state, { type: 'face', face: f });
      break;
    }
    case 'member':
    case 'task': {
      const c = d as unknown as FleetChange;
      if (c && typeof c === 'object') next = applyFleet(state, { ...c, kind: ev.kind });
      break;
    }
    case 'reset':
      next = { ...state, resets: state.resets + 1 };
      break;
    // An event that the page read and dropped, such as a partial entry that
    // it could not read again. Only its id moves.
    case 'skipped':
      break;
    default:
      return state;
  }
  if (ev.id && ev.id !== next.stream.lastId) next = { ...next, stream: { ...next.stream, lastId: ev.id } };
  return next;
}

/** reduce is the reducer of the page. */
export function reduce(state: State, a: Action): State {
  switch (a.type) {
    case 'me':
      return { ...state, me: a.me };
    case 'config':
      return { ...state, config: a.config };
    case 'bridges': {
      const byId: Record<string, Bridge> = {};
      for (const b of a.bridges) byId[b.id] = bridgeOf(b, state.bridges.byId[b.id], state.open);
      const order = sortBridges(byId);
      return { ...state, bridges: { byId, order: sameOrder(order, state.bridges.order) ? state.bridges.order : order, loaded: true } };
    }
    case 'bridge': {
      let next = putBridge(state, a.bridge);
      if (a.bridge.members) next = { ...next, rosters: { ...next.rosters, [a.bridge.id]: rosterOf(a.bridge.members, state.rosters[a.bridge.id]) } };
      return next;
    }
    case 'channel': {
      const old = state.channels[a.bridge];
      let ch: Channel;
      if (a.mode === 'latest' || !old) {
        ch = { seqs: [], bySeq: {}, prev: a.page.prev };
        // Entries from the stream that are newer than the page stay.
        if (old) {
          const top = a.page.messages.length ? a.page.messages[a.page.messages.length - 1].seq : 0;
          for (const s of old.seqs) if (s > top) ch = putEntry(ch, old.bySeq[s]);
        }
      } else {
        ch = a.mode === 'older' ? { ...old, prev: a.page.prev } : old;
      }
      for (const e of a.page.messages) {
        if (a.mode === 'older' && ch.bySeq[e.seq] === undefined) {
          ch = { ...ch, seqs: insertSeq(ch.seqs, e.seq), bySeq: { ...ch.bySeq, [e.seq]: e } };
        } else {
          ch = putEntry(ch, e);
        }
      }
      let next: State = { ...state, channels: { ...state.channels, [a.bridge]: ch } };
      const b = next.bridges.byId[a.bridge];
      const last = ch.seqs.length ? ch.seqs[ch.seqs.length - 1] : 0;
      if (b && last > b.lastSeq) next = { ...next, bridges: { ...next.bridges, byId: { ...next.bridges.byId, [a.bridge]: { ...b, lastSeq: last } } } };
      return next;
    }
    case 'entry':
      return applyEntry(state, a.bridge, a.entry);
    case 'member':
      return applyMember(state, a.bridge, a.member);
    case 'read': {
      const b = state.bridges.byId[a.bridge];
      if (!b || (b.read >= a.seq && b.unread === 0)) return state;
      return { ...state, bridges: { ...state.bridges, byId: { ...state.bridges.byId, [a.bridge]: { ...b, read: Math.max(b.read, a.seq), unread: 0, unreadMore: false } } } };
    }
    case 'open':
      return state.open === a.bridge ? state : { ...state, open: a.bridge };
    case 'run': {
      const old = state.runs[a.run.id];
      if (old && old.seq > a.run.seq) return state;
      if (old && JSON.stringify(old) === JSON.stringify(a.run)) return state;
      return { ...state, runs: { ...state.runs, [a.run.id]: a.run } };
    }
    case 'pages': {
      const byPath: Record<string, PageMeta> = {};
      for (const p of a.pages) byPath[p.path] = p;
      return { ...state, pages: { byPath, loaded: true } };
    }
    case 'page':
      return applyPage(state, a.page);
    case 'agents':
      return { ...state, agents: a.agents };
    case 'fleet':
      return { ...state, fleet: a.fleet };
    case 'skills':
      return { ...state, skills: a.skills };
    case 'agent-skills': {
      const old = state.agentSkills[a.agent];
      if (old && old.length === a.skills.length && old.every((x, i) => x === a.skills[i])) return state;
      return { ...state, agentSkills: { ...state.agentSkills, [a.agent]: a.skills } };
    }
    case 'agent-skills-forget':
      return Object.keys(state.agentSkills).length ? { ...state, agentSkills: {} } : state;
    case 'manager-pick':
      return { ...state, managerPick: a.pick };
    case 'faces': {
      const faces: Record<string, FaceMeta> = {};
      for (const f of a.faces) faces[f.agent] = state.faces[f.agent] && state.faces[f.agent].hash === f.hash && JSON.stringify(state.faces[f.agent]) === JSON.stringify(f) ? state.faces[f.agent] : f;
      return { ...state, faces };
    }
    case 'face': {
      const old = state.faces[a.face.agent];
      if (old && JSON.stringify(old) === JSON.stringify(a.face)) return state;
      return { ...state, faces: { ...state.faces, [a.face.agent]: a.face } };
    }
    case 'stream':
      return applyStream(state, a.event);
    case 'stream-status':
      return state.stream.status === a.status ? state : { ...state, stream: { ...state.stream, status: a.status } };
  }
  return state;
}

/** entriesOf returns the loaded entries of a channel, in order. */
export function entriesOf(ch: Channel | undefined): Entry[] {
  return ch ? ch.seqs.map((s) => ch.bySeq[s]) : [];
}

/** membersOf returns the members of a roster, in the order of the seats. */
export function membersOf(r: Roster | undefined): Member[] {
  return r ? r.order.map((h) => r.byHandle[h]) : [];
}

/**
 * managerRunOf is the run of the conversation with the manager: the one
 * that the person picked, else the newest one of the settings.
 */
export function managerRunOf(state: State): string {
  const me = state.me && state.me.principal ? state.me.principal.subject : '';
  if (state.managerPick && state.managerPick.by === me) return state.managerPick.run;
  return state.config && state.config.manager ? state.config.manager.run : '';
}
