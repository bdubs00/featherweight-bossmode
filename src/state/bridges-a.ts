// The shapes and the actions that Screen A needs beyond the shared files.
// The backend sends three fields that src/api/types.ts does not name yet: the
// pinned mark and the page of an entry, the state unknown of a decision, and
// unreadMore on a bridge. The lead folds these into the shared files after
// the merge (docs/DESIGN.md, section 11.1, rule 4).

import { api } from '../api/routes';
import type { Bridge, Decision, Entry, Run } from '../api/types';
import { store } from './store';

/** The state of a decision. unknown means the page cannot tell whether the decision reached the run. */
export type DecisionState = Decision['state'] | 'unknown';

/** DecisionA is a decision with the state unknown of the backend. */
export type DecisionA = Omit<Decision, 'state'> & { state: DecisionState };

/** EntryA is an entry with the fields of the backend that the shared type lacks. */
export type EntryA = Omit<Entry, 'decision'> & {
  /** True when the members keep the message through every compaction of their runs. */
  pinned?: boolean;
  /** The wiki path that a system line is about. The text of the line holds no link. */
  page?: string;
  decision?: DecisionA | null;
};

/** BridgeA is a bridge with unreadMore: true when the unread count reached its bound of 2000. */
export type BridgeA = Bridge & { unreadMore?: boolean };

/** asDecision gives a decision to the shared card code, which takes the shared type. */
export const asDecision = (d: DecisionA): Decision => d as unknown as Decision;

/** unreadText writes the unread count of a bridge: 2000+ at the bound of the backend, else 99+ above 99. */
export function unreadText(b: Pick<BridgeA, 'unread' | 'unreadMore'>): string {
  if (b.unreadMore) return '2000+';
  return b.unread > 99 ? '99+' : String(b.unread || 0);
}

const asked = new Set<string>();

/**
 * loadRunOnce reads a run once per page load, for a seat that shows no
 * activity. The roster needs its state: a queued run shows waiting for a
 * worker, and a failed run gives the reason of an error. The stream keeps
 * the run current after that.
 */
export async function loadRunOnce(id: string): Promise<void> {
  if (!id || asked.has(id) || store.get().runs[id]) return;
  asked.add(id);
  try {
    const run = await api.run(id);
    store.dispatch({ type: 'run', run });
  } catch {
    // The row shows the presence alone. The next stream event of the run fills it.
  }
}

/** forgetRuns clears the memory of loadRunOnce, for the tests. */
export function forgetRuns(): void {
  asked.clear();
}

/** The most entries that the tab of decisions reads, 8 pages of 500. */
export const CARD_PAGES = 8;

/**
 * loadAllCards reads the channel back to its first entry, at most
 * CARD_PAGES pages of 500, so the tab of decisions can list every card of
 * the bridge. The entries join the loaded part of the channel, so the
 * stream keeps each card current.
 */
export async function loadAllCards(id: string): Promise<void> {
  for (let i = 0; i < CARD_PAGES; i++) {
    const ch = store.get().channels[id];
    if (!ch || ch.prev === 0) return;
    const page = await api.messages(id, { before: ch.prev, limit: 500 });
    store.dispatch({ type: 'channel', bridge: id, page, mode: 'older' });
  }
}

/**
 * errorReason is the short reason of a stopped run for a row of the
 * members, such as "Stopped at 40 turns". A limit gives that form. Another
 * error gives its first sentence.
 */
export function errorReason(run: Pick<Run, 'state' | 'error'> | undefined): string {
  if (!run || !run.error) return '';
  const text = run.error.trim();
  const limit = /\blimit of (.+?)\.?$/i.exec(text.split(/(?<=\.)\s/)[0]);
  if (limit) return 'Stopped at ' + limit[1].trim();
  const first = text.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '');
  return first.length > 80 ? first.slice(0, 79).trimEnd() + '…' : first;
}
