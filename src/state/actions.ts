// The actions of the page: each one calls the API and puts the answer into
// the store. The stream keeps the store current between them.

import { api, type NewBridge, type NewMember, type NewMessage } from '../api/routes';
import { openStream, type StreamHandle } from '../api/stream';
import type { Attachment, Entry, FleetChange, MemberEventData, MessageEventData, ReactionKind, Run, RunState, StreamEvent } from '../api/types';
import { managerRunOf, seatOfRun, type State } from './reducer';
import { store } from './store';
import { ApiError, type SigninNeeded } from '../api/client';
import { noteDecided } from './done';
import { holdsTask } from '../lib/agents';
import { routineChanged } from './routines';
import { sawBuild } from '../lib/build';

const loading = new Map<string, Promise<unknown>>();

/** once runs one load per key at a time. */
function once<T>(key: string, f: () => Promise<T>): Promise<T> {
  const cur = loading.get(key);
  if (cur) return cur as Promise<T>;
  const p = f().finally(() => loading.delete(key));
  loading.set(key, p);
  return p;
}

export async function loadBridges(): Promise<void> {
  const bridges = await once('bridges', () => api.bridges());
  store.dispatch({ type: 'bridges', bridges });
}

/** loadBridge reads one record with its roster. */
export async function loadBridge(id: string): Promise<void> {
  const b = await once('bridge:' + id, () => api.bridge(id));
  store.dispatch({ type: 'bridge', bridge: b });
}

export const PAGE = 50;

/** loadChannel reads the recent end of a channel, and then what came while it read. */
export async function loadChannel(id: string): Promise<void> {
  const page = await once('channel:' + id, () => api.messages(id, { limit: PAGE }));
  store.dispatch({ type: 'channel', bridge: id, page, mode: 'latest' });
  // An entry that the stream brought while the read ran found no channel
  // to join, and the read can answer before the entry landed. The record
  // knows the newest seq, so the page reads on to it.
  if (behind(id)) await loadNewer(id);
}

/** newestOf is the seq of the newest loaded entry of a channel, or 0. */
function newestOf(id: string): number {
  const ch = store.get().channels[id];
  return ch && ch.seqs.length ? ch.seqs[ch.seqs.length - 1] : 0;
}

/** behind reports whether the record of a bridge knows a newer entry than the loaded part of its channel. */
function behind(id: string): boolean {
  const b = store.get().bridges.byId[id];
  const ch = store.get().channels[id];
  return !!b && !!ch && b.lastSeq > newestOf(id);
}

/** loadOlder reads the page in front of the loaded part. It returns false at the first page. */
export async function loadOlder(id: string): Promise<boolean> {
  const ch = store.get().channels[id];
  if (!ch || ch.prev === 0) return false;
  const page = await once('older:' + id, () => api.messages(id, { before: ch.prev, limit: PAGE }));
  store.dispatch({ type: 'channel', bridge: id, page, mode: 'older' });
  return page.prev !== 0;
}

/** The most pages of 500 entries that loadAllCards reads. */
export const CARD_PAGES = 8;

/**
 * loadAllCards reads the channel forward past its newest loaded entry, so
 * a card that the stream did not bring shows, and back to its first entry,
 * at most CARD_PAGES pages of 500, so the tab Decisions lists every card
 * of the bridge. The entries join the loaded part of the channel, so the
 * stream keeps each card current. The tab says Nothing needs you only
 * after both reads.
 */
export async function loadAllCards(id: string): Promise<void> {
  await loadNewer(id);
  for (let i = 0; i < CARD_PAGES; i++) {
    const ch = store.get().channels[id];
    if (!ch || ch.prev === 0) return;
    const page = await api.messages(id, { before: ch.prev, limit: 500 });
    store.dispatch({ type: 'channel', bridge: id, page, mode: 'older' });
  }
}

/** loadNewer reads the entries after the newest loaded one: what the stream missed, after a reset or a lost event. */
export async function loadNewer(id: string): Promise<void> {
  const ch = store.get().channels[id];
  if (!ch || ch.seqs.length === 0) return loadChannel(id);
  let from = ch.seqs[ch.seqs.length - 1] + 1;
  for (let i = 0; i < 20; i++) {
    const page = await api.messages(id, { from, limit: 200 });
    store.dispatch({ type: 'channel', bridge: id, page, mode: 'newer' });
    if (!page.next) return;
    from = page.next;
  }
}

/**
 * The pauses before the page reads a channel for an entry that the stream
 * did not bring: the first lets the event still come, and the later ones
 * wait for a card that the front writes a moment after the run asked.
 */
export const MISSED_WAITS = [1500, 5000, 15000];

const missedTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * readMissed reads a channel forward a moment later, once for a burst: a
 * seat waits for a decision or for your answer and the loaded channel
 * holds no card of it, or an entry came after a gap. A replica of the
 * front can miss the event of an entry that the other replica wrote, and
 * the page then showed needs you without the card. still tells whether
 * the entry is still missing after a read, and the page then reads again
 * after the next pause.
 */
export function readMissed(id: string, still: () => boolean = () => false, attempt = 0): void {
  if (missedTimers.has(id) || !store.get().channels[id] || attempt >= MISSED_WAITS.length) return;
  missedTimers.set(
    id,
    setTimeout(() => {
      missedTimers.delete(id);
      loadNewer(id)
        .catch(() => {
          // The next pause reads again.
        })
        .then(() => {
          if (still()) readMissed(id, still, attempt + 1);
        });
    }, MISSED_WAITS[attempt]),
  );
}

/** forgetMissed drops the reads that wait, for the tests. */
export function forgetMissed(): void {
  for (const t of missedTimers.values()) clearTimeout(t);
  missedTimers.clear();
}

/**
 * missedCard names the bridge whose loaded channel lacks the card or the
 * question that an event says waits, or "": a run of a seat that waits for
 * a decision, a seat whose question waits, or an entry after a gap.
 */
export function missedCard(s: State, e: StreamEvent): string {
  const d = e.data as Record<string, unknown> | null;
  if (!d) return '';
  if (e.kind === 'run') {
    const r = d as unknown as Run;
    if (r.state !== 'input-required' || !r.pending || !r.pending.id) return '';
    for (const id of Object.keys(s.rosters)) {
      const ch = s.channels[id];
      if (!ch || !seatOfRun(s.rosters[id], r.id)) continue;
      const held = ch.seqs.some((q) => {
        const x = ch.bySeq[q];
        return !!x && !!x.decision && x.decision.run === r.id && x.decision.id === r.pending!.id;
      });
      return held ? '' : id;
    }
    return '';
  }
  if (e.kind === 'bridge.member') {
    const m = d as unknown as MemberEventData;
    const ch = m && m.member ? s.channels[m.bridge] : undefined;
    if (!ch || !m.member.question) return '';
    return ch.bySeq[m.member.question] || m.member.question < (ch.seqs[0] || 0) ? '' : m.bridge;
  }
  if (e.kind === 'bridge.message') {
    const m = d as unknown as MessageEventData;
    const ch = m && m.message ? s.channels[m.bridge] : undefined;
    if (!ch || !ch.seqs.length) return '';
    return m.message.seq > ch.seqs[ch.seqs.length - 1] + 1 ? m.bridge : '';
  }
  return '';
}

const readTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** markRead tells the workbench what the person read, a moment later. */
export function markRead(id: string): void {
  const b = store.get().bridges.byId[id];
  if (!b) return;
  const seq = b.lastSeq;
  store.dispatch({ type: 'read', bridge: id, seq });
  const old = readTimers.get(id);
  if (old) clearTimeout(old);
  readTimers.set(
    id,
    setTimeout(() => {
      readTimers.delete(id);
      api.markRead(id, seq).catch(() => {
        // A lost read mark costs only a count. The next read sets it.
      });
    }, 800),
  );
}

export async function postMessage(id: string, text: string, to: string[], replyTo?: number, files?: Attachment[]): Promise<Entry> {
  return sendMessage(id, { text, to, replyTo, files });
}

/** sendMessage posts a message with any field of the route, such as the skill of a slash command, and puts the entry into the channel. */
export async function sendMessage(id: string, m: NewMessage): Promise<Entry> {
  const e = await api.post(id, m);
  if (e && typeof e.seq === 'number') store.dispatch({ type: 'entry', bridge: id, entry: e });
  return e;
}

/**
 * answerQuestion answers the question of a seat: a message of the person to
 * the seat in reply to the question, with a choice or the words of the
 * person. The front ends the question and gives the answer to the seat,
 * which starts its next turn.
 */
export async function answerQuestion(id: string, handle: string, seq: number, text: string): Promise<Entry> {
  return sendMessage(id, { text, to: [handle], replyTo: seq });
}

export async function react(id: string, seq: number, reaction: ReactionKind, note?: string): Promise<void> {
  const e = await api.react(id, seq, reaction, note);
  store.dispatch({ type: 'entry', bridge: id, entry: e });
}

export async function decide(run: string, approval: string, decision: 'allow' | 'deny', note?: string, content?: unknown): Promise<void> {
  await api.decide(run, approval, decision, note, content);
  noteDecided(run, approval, decision, note, content);
}

export async function alwaysAllow(run: string, approval: string, note?: string): Promise<void> {
  try {
    await api.alwaysAllow(run, approval, note);
    noteDecided(run, approval, 'allow', note);
  } catch (e) {
    // The rule lands on the profile of the agent, which only its owner or
    // an admin changes. The backend says so with the subject of the caller
    // in front, which the page words instead.
    if (e instanceof ApiError && e.status === 403) throw new Error('Always allow needs an owner of the agent. Allow once instead.');
    throw e;
  }
}

export async function fire(id: string, handle: string): Promise<void> {
  const m = await api.fire(id, handle);
  store.dispatch({ type: 'member', bridge: id, member: m });
}

export async function patchMember(id: string, handle: string, patch: { muted?: boolean; task?: string; continue?: boolean }): Promise<void> {
  const m = await api.patchMember(id, handle, patch);
  store.dispatch({ type: 'member', bridge: id, member: m });
}

export async function addMember(id: string, m: NewMember): Promise<void> {
  const member = await api.addMember(id, m);
  store.dispatch({ type: 'member', bridge: id, member });
}

export async function openNewBridge(b: NewBridge): Promise<string> {
  const rec = await api.openBridge(b);
  store.dispatch({ type: 'bridge', bridge: rec });
  return rec.id;
}

export async function patchBridge(id: string, patch: Parameters<typeof api.patchBridge>[1]): Promise<void> {
  const rec = await api.patchBridge(id, patch);
  store.dispatch({ type: 'bridge', bridge: rec });
}

export async function loadPages(): Promise<void> {
  const pages = await once('pages', () => api.pages());
  store.dispatch({ type: 'pages', pages });
}

/**
 * loadBridgePages reads the pages of the work of a bridge, GET
 * /v1/bridges/{id}/pages. A workbench without the route answers 404, and
 * the list then takes the pages under bridges/<id>/ from the wiki.
 */
export async function loadBridgePages(id: string): Promise<void> {
  try {
    const pages = await once('bridge-pages:' + id, () => api.bridgePages(id));
    store.dispatch({ type: 'bridge-pages', bridge: id, pages });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    store.dispatch({ type: 'bridge-pages', bridge: id, pages: null });
    if (!store.get().pages.loaded) await loadPages();
  }
}

export async function loadAgents(): Promise<void> {
  const agents = await once('agents', () => api.agents());
  store.dispatch({ type: 'agents', agents });
}

export async function loadFleet(): Promise<void> {
  const fleet = await once('fleet', () => api.fleet());
  store.dispatch({ type: 'fleet', fleet });
}

/** The run states that are not finished. */
const OPEN_STATES = ['queued', 'running', 'input-required', 'suspended'];

/**
 * loadOpenRuns reads the runs of the fleet that are not finished, from the
 * view of the front, so the page knows the runs that each worker holds.
 * The run events keep them current after that. A run that the page holds
 * as open and that the answer leaves out finished during a gap of the
 * stream, so the page reads it again.
 */
export async function loadOpenRuns(): Promise<void> {
  const runs = await once('open-runs', () => api.fleetRuns({ state: 'active' }));
  const listed = new Set(runs.map((r) => r && r.id));
  const lost = store.get().lost;
  const left = Object.values(store.get().runs)
    .filter((r) => !!r.member && OPEN_STATES.includes(r.state) && !listed.has(r.id) && !lost[r.id])
    .map((r) => r.id);
  store.dispatch({ type: 'open-runs', runs });
  for (const id of left) {
    api
      .run(id)
      .then((r) => store.dispatch({ type: 'run', run: r }))
      .catch((e) => {
        // The next run event of the run brings its state.
        noteLost(id, e);
      });
  }
}


let fleetTimer: ReturnType<typeof setTimeout> | null = null;

/** refreshFleetSoon reads the fleet view again a moment later, once for a burst of events. */
function refreshFleetSoon(): void {
  if (fleetTimer) return;
  fleetTimer = setTimeout(() => {
    fleetTimer = null;
    loadFleet().catch(() => {});
  }, 1000);
}

/** loadSkills reads the skills and the tools. A workbench without the route leaves them out. */
export async function loadSkills(): Promise<void> {
  try {
    const skills = await once('skills', () => api.skills());
    store.dispatch({ type: 'skills', skills });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      store.dispatch({ type: 'skills', skills: { skills: [], tools: [] } });
      return;
    }
    throw e;
  }
}

/* ---------- runs ---------- */

const askedRuns = new Set<string>();

/** noteLost notes a run that the fleet does not hold, after a read of it answered 404, so its old object says nothing about its seat. */
export function noteLost(id: string, e: unknown): void {
  if (e instanceof ApiError && e.status === 404) store.dispatch({ type: 'run-lost', id });
}

/**
 * loadRunOnce reads a run that the store does not hold, once per page
 * load. A row needs its state: a queued run shows waiting for a worker,
 * and a failed run gives the reason of an error. The stream keeps the run
 * current after that.
 */
export async function loadRunOnce(id: string): Promise<void> {
  // A run that the fleet lost answers 404 to every read, so the page asks it no more.
  if (!id || askedRuns.has(id) || store.get().runs[id] || store.get().lost[id]) return;
  askedRuns.add(id);
  try {
    const run = await api.run(id);
    store.dispatch({ type: 'run', run });
  } catch (e) {
    // The row shows the presence alone. The next stream event of the run fills it.
    noteLost(id, e);
  }
}

/** forgetRuns clears the memory of loadRunOnce, after a reset of the stream and for the tests. */
export function forgetRuns(): void {
  askedRuns.clear();
}

/* ---------- the skills of each agent ---------- */

/**
 * loadAgentSkills reads the skills that an agent can load, once while the
 * page holds them. The Skills place reads them for every agent and forgets
 * them when it closes, so the next visit reads them again.
 */
export async function loadAgentSkills(agent: string): Promise<void> {
  if (!agent || store.get().agentSkills[agent]) return;
  // The front answers the skills of an agent that a pool runs, and of a
  // profile of its own. A profile that only a member of the fleet holds,
  // such as a profile of the process of a worker, answers 404, so the page
  // takes it as no skill without a request.
  // The page first learns the fleet and the profiles, so it never asks the front for an agent that it cannot answer.
  const known = store.get();
  if (!known.fleet || !known.agents) await Promise.allSettled([known.fleet ? null : loadFleet(), known.agents ? null : loadAgents()]);
  if (store.get().agentSkills[agent]) return;
  if (!skillsAnswerFor(store.get(), agent)) {
    store.dispatch({ type: 'agent-skills', agent, skills: [] });
    return;
  }
  try {
    const r = await once('agent-skills:' + agent, () => api.agentSkills(agent));
    store.dispatch({ type: 'agent-skills', agent, skills: ((r && r.skills) || []).map((x) => x.name) });
  } catch (e) {
    // An agent that the caller cannot see, or a workbench without the route, loads no skill.
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) store.dispatch({ type: 'agent-skills', agent, skills: [] });
    else throw e;
  }
}

/**
 * skillsAnswerFor reports whether the front can answer the skills of an
 * agent: a pool runs it, a worker of a pool holds it, or it is a profile
 * of the front itself. A profile that only a member outside the pools
 * holds is none of these. Before the page knows both the fleet and the
 * profiles of the front, it asks.
 */
export function skillsAnswerFor(s: Pick<State, 'fleet' | 'agents'>, agent: string): boolean {
  const fleet = s.fleet;
  if (!fleet || !s.agents) return true;
  if ((fleet.pools || []).some((p) => p.agent === agent) || s.agents.some((a) => a.name === agent)) return true;
  return (fleet.members || []).some((m) => !m.self && (m.agents || []).some((a) => a && a.name === agent) && holdsTask(fleet, m.name));
}

/** forgetAgentSkills drops the skills of every agent. */
export function forgetAgentSkills(): void {
  store.dispatch({ type: 'agent-skills-forget' });
}

/* ---------- the manager ---------- */

/** ended reports whether a run takes no more messages, so the next one starts a new conversation. */
export function ended(state: RunState | string | undefined): boolean {
  return state === 'failed' || state === 'canceled';
}

/* ---------- the quick chat ---------- */

/**
 * loadChats reads the history of the quick chat of the person: the runs of
 * the agent of the chat that the person started, newest first.
 */
export async function loadChats(): Promise<void> {
  const s = store.get();
  const chat = s.config && s.config.chat;
  const me = s.me && s.me.principal ? s.me.principal.subject : '';
  if (!chat || !chat.agent) return;
  const runs = await once('chats', () => api.fleetRuns({ agent: chat.agent, principal: me }));
  store.dispatch({ type: 'chats', runs });
}

/**
 * loadManagerChats reads the conversations of the person with the manager
 * for the list of the Manager place. The list keeps the ones outside a
 * bridge (conversationsOf).
 */
export async function loadManagerChats(): Promise<void> {
  const s = store.get();
  const m = s.config && s.config.manager;
  const me = s.me && s.me.principal ? s.me.principal.subject : '';
  if (!m || !m.agent) return;
  const runs = await once('manager-chats', () => api.fleetRuns({ agent: m.agent, principal: me, limit: 200 }));
  store.dispatch({ type: 'manager-chats', runs });
}

/** setManagerRun opens a conversation with the manager, or a new one with "". */
export function setManagerRun(run: string): void {
  const s = store.get();
  store.dispatch({ type: 'manager-pick', pick: { run, by: s.me && s.me.principal ? s.me.principal.subject : '' } });
}

/** forgetManagerRun follows the settings again, for the tests and a sign-out. */
export function forgetManagerRun(): void {
  store.dispatch({ type: 'manager-pick', pick: null });
}

/**
 * askManager sends a message to the manager: a follow-up of the
 * conversation, or the first message of a new run when there is none or
 * the last one ended. The files go with the message in either case, and
 * the workspace of the manager run keeps them. It returns the run.
 */
export async function askManager(text: string, files?: Attachment[]): Promise<string> {
  const s = store.get();
  const m = s.config && s.config.manager;
  if (!m) throw new Error('No manager is set up.');
  const id = managerRunOf(s);
  const run = id ? s.runs[id] : undefined;
  if (id && !ended(run && run.state)) {
    try {
      await api.sendRun(id, text, files);
      return id;
    } catch (e) {
      // A run that ended since the page read it refuses the message, and
      // the message starts a new conversation.
      if (!(e instanceof ApiError) || e.status !== 409) throw e;
    }
  }
  const r = await api.start(m.member, files && files.length ? { agent: m.agent, input: text, files } : { agent: m.agent, input: text });
  store.dispatch({ type: 'run', run: r });
  setManagerRun(r.id);
  return r.id;
}

export async function loadFaces(): Promise<void> {
  const faces = await once('faces', () => api.faces());
  store.dispatch({ type: 'faces', faces });
}

/* ---------- the stream ---------- */

let stream: StreamHandle | null = null;

/**
 * completeEvent returns the event with its whole entry. A bridge.message
 * event can carry a partial entry, a card without its input and its schema.
 * The page reads that entry again with ?from=<seq>&limit=1 and applies what
 * the route answers. When the read fails, or the route answers another
 * entry, the event drops, and the next read of the channel brings the card.
 */
export async function completeEvent(e: StreamEvent): Promise<StreamEvent | null> {
  if (e.kind !== 'bridge.message') return e;
  const d = e.data as MessageEventData | null;
  // The front marks the event partial beside the entry; an older page read the mark on the entry.
  if (!d || !d.message || !(d.partial || d.message.partial) || typeof d.bridge !== 'string') return e;
  try {
    const page = await api.messages(d.bridge, { from: d.message.seq, limit: 1 });
    const whole = page && page.messages ? page.messages.find((m) => m.seq === d.message.seq) : undefined;
    if (!whole || whole.partial) return null;
    return { ...e, data: { bridge: d.bridge, message: whole } };
  } catch {
    return null;
  }
}

/** onEvent handles one event: a bridge that the page does not know loads first. */
async function onEvent(raw: StreamEvent): Promise<void> {
  const e = await completeEvent(raw);
  if (!e) {
    // The id still moves, so a reconnect does not ask for the event again.
    if (raw.id) store.dispatch({ type: 'stream', event: { id: raw.id, kind: 'skipped', data: null } });
    return;
  }
  const s = store.get();
  if (e.kind === 'bridge.message' || e.kind === 'bridge.member') {
    const d = e.data as { bridge?: string } | null;
    const id = d && typeof d.bridge === 'string' ? d.bridge : '';
    // A bridge that the page does not know, or a member of a roster that it
    // has not loaded, loads the record first, so the counts of the rail stay right.
    const unknown = id && s.bridges.loaded && !s.bridges.byId[id];
    const noRoster = id && e.kind === 'bridge.member' && s.bridges.byId[id] && !s.rosters[id];
    if (unknown || noRoster) {
      try {
        await loadBridge(id);
      } catch {
        // A bridge that the caller cannot read stays out of the rail.
        return;
      }
    }
  }
  // A card or a question that the event says waits, and that the channel
  // lacks, is read from the channel a moment later (readMissed).
  const missed = missedCard(store.get(), e);
  store.dispatch({ type: 'stream', event: e });
  if (missed) readMissed(missed, () => missedCard(store.get(), e) === missed);
  if (e.kind === 'reset') await reload();
  if (e.kind === 'routine') routineChanged(e.data);
  // A Task that the fleet view does not list, such as a new worker after a
  // change of Keep, brings the fleet view again, so its worker shows.
  if (e.kind === 'task') {
    const d = e.data as FleetChange | null;
    const fleet = store.get().fleet;
    if (d && typeof d.member === 'string' && !d.gone && fleet && !holdsTask(fleet, d.member)) refreshFleetSoon();
  }
}

/** reload reads the lists again, when the stream cannot resume. */
async function reload(): Promise<void> {
  const s = store.get();
  await Promise.allSettled([loadBridges(), loadFaces(), s.pages.loaded ? loadPages() : Promise.resolve(), s.fleet ? loadFleet() : Promise.resolve(), s.openRuns ? loadOpenRuns() : Promise.resolve()]);
  if (s.open) await Promise.allSettled([loadBridge(s.open), loadNewer(s.open)]);
}

export function startStream(onUnauthorized: (e: SigninNeeded) => void): void {
  if (stream) return;
  let chain = Promise.resolve();
  stream = openStream({
    lastId: store.get().stream.lastId,
    onEvent: (e) => {
      // Events apply in order, also when one waits for a load.
      chain = chain.then(() => onEvent(e)).catch(() => {});
    },
    onStatus: (status) => store.dispatch({ type: 'stream-status', status }),
    // Each start of the stream, at boot and after each end, names the build
    // of the page that the front serves, so a tab learns of a deploy.
    onBuild: sawBuild,
    onUnauthorized: (e) => {
      stream = null;
      onUnauthorized(e);
    },
  });
}

export function stopStream(): void {
  if (stream) stream.close();
  stream = null;
}
