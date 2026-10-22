// The actions of the page: each one calls the API and puts the answer into
// the store. The stream keeps the store current between them.

import { api, type NewBridge, type NewMember } from '../api/routes';
import { openStream, type StreamHandle } from '../api/stream';
import type { Entry, MessageEventData, ReactionKind, StreamEvent } from '../api/types';
import { store } from './store';
import { ApiError, type SigninNeeded } from '../api/client';

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

/** loadChannel reads the recent end of a channel. */
export async function loadChannel(id: string): Promise<void> {
  const page = await once('channel:' + id, () => api.messages(id, { limit: PAGE }));
  store.dispatch({ type: 'channel', bridge: id, page, mode: 'latest' });
}

/** loadOlder reads the page in front of the loaded part. It returns false at the first page. */
export async function loadOlder(id: string): Promise<boolean> {
  const ch = store.get().channels[id];
  if (!ch || ch.prev === 0) return false;
  const page = await once('older:' + id, () => api.messages(id, { before: ch.prev, limit: PAGE }));
  store.dispatch({ type: 'channel', bridge: id, page, mode: 'older' });
  return page.prev !== 0;
}

/** loadNewer reads what the stream missed, after a reset. */
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

export async function postMessage(id: string, text: string, to: string[], replyTo?: number): Promise<Entry> {
  const e = await api.post(id, { text, to: to.length ? to : undefined, replyTo });
  store.dispatch({ type: 'entry', bridge: id, entry: e });
  return e;
}

export async function react(id: string, seq: number, reaction: ReactionKind, note?: string): Promise<void> {
  const e = await api.react(id, seq, reaction, note);
  store.dispatch({ type: 'entry', bridge: id, entry: e });
}

export async function decide(run: string, approval: string, decision: 'allow' | 'deny', note?: string, content?: unknown): Promise<void> {
  await api.decide(run, approval, decision, note, content);
}

export async function alwaysAllow(run: string, approval: string, note?: string): Promise<void> {
  await api.alwaysAllow(run, approval, note);
}

export async function fire(id: string, handle: string): Promise<void> {
  const m = await api.fire(id, handle);
  store.dispatch({ type: 'member', bridge: id, member: m });
}

export async function patchMember(id: string, handle: string, patch: { muted?: boolean; task?: string }): Promise<void> {
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

export async function loadAgents(): Promise<void> {
  const agents = await once('agents', () => api.agents());
  store.dispatch({ type: 'agents', agents });
}

export async function loadFleet(): Promise<void> {
  const fleet = await once('fleet', () => api.fleet());
  store.dispatch({ type: 'fleet', fleet });
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
  if (!d || !d.message || !d.message.partial || typeof d.bridge !== 'string') return e;
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
  store.dispatch({ type: 'stream', event: e });
  if (e.kind === 'reset') await reload();
}

/** reload reads the lists again, when the stream cannot resume. */
async function reload(): Promise<void> {
  const s = store.get();
  await Promise.allSettled([loadBridges(), loadFaces(), s.pages.loaded ? loadPages() : Promise.resolve(), s.fleet ? loadFleet() : Promise.resolve()]);
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
