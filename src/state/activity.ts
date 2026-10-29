// The rows of Activity as the page holds them, and the reads that fill
// them. The count on the app bar, the head of Activity, Work, and Results
// read one count of the work that needs the person, which GET /v1/inbox
// answers from the lanes of the board (useWaiting). An older front
// answers none, and the count then counts the rows of Activity. The app bar shows on every place, so
// these reads run on every place: the record of each open bridge, the
// newest run of each seat that waits, failed, or rests, the run of a
// question of a duty, and the items of GET /v1/inbox, again each minute.
// Activity reads more for what its rows show, such as the new entries of a
// channel and the results of the runs that wait.

import { useEffect, useMemo } from 'preact/hooks';
import type { Bridge, Member, Waiting } from '../api/types';
import { seatPresence } from '../lib/status';
import { followInbox, useDuties } from './duties';
import { ensureRosters, ensureRuns, useEntries, useResults } from './fetchers';
import { attentionOf, inboxRows, sortInbox, type InboxRow } from './inbox';
import { newestRun } from './people';
import { selectFacts } from './reducer';
import { useSelect } from './store';

export interface InboxView {
  /** The rows in the order of attention. */
  rows: InboxRow[];
  /** The open bridges. */
  open: Bridge[];
  /** True once the page holds the record of each open bridge. */
  loaded: boolean;
  /** True once the items of the duties and the runs of their questions are in too. */
  settled: boolean;
}

/** useInboxRows builds the rows of the inbox from the store, and reads the records, the runs, and the items that decide which rows need you. */
export function useInboxRows(): InboxView {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const runs = useSelect((s) => s.runs);
  const channels = useSelect((s) => s.channels);
  const lost = useSelect((s) => s.lost);
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const facts = useSelect(selectFacts);
  const results = useResults();
  const entries = useEntries();
  const items = useDuties((s) => s.inbox);
  const open = useMemo(() => bridges.order.map((id) => bridges.byId[id]).filter((b) => b.state === 'open'), [bridges]);
  useEffect(() => {
    if (bridges.loaded) ensureRosters();
  }, [bridges]);
  useEffect(() => followInbox(), []);
  // The run of a question of a duty that sits on no bridge and names no approval, so its card shows. An item with its approval needs no read.
  const asking = (items || [])
    .filter((it) => (it.kind === 'approval' || it.kind === 'question') && !it.bridge && it.run && !it.approval)
    .map((it) => it.run!)
    .join(',');
  useEffect(() => {
    if (asking) ensureRuns(asking.split(','));
  }, [asking]);
  // The newest run of a seat that needs you, that failed, or that rests, so a stop shows.
  const want = open
    .flatMap((b) => {
      const r = rosters[b.id];
      return r
        ? r.order
            .map((h) => r.byHandle[h])
            .filter((m: Member) => {
              // A run that no worker holds answers 404, so the page does not ask for it.
              if (!m || m.fired || m.gone || !m.runs.length) return false;
              const p = seatPresence(facts, m);
              return p !== 'working' && p !== 'asleep';
            })
        : [];
    })
    .map((m) => newestRun(m))
    .join(',');
  useEffect(() => {
    if (want) ensureRuns(want.split(','));
  }, [want]);
  const rows = sortInbox(inboxRows({ bridges: open, rosters, runs, channels, results, me, facts, entries, items }));
  const loaded = bridges.loaded && open.every((b) => !!rosters[b.id]);
  // The rows have settled once the items of the duties and the runs of their questions are in too.
  const asked = asking ? asking.split(',').every((id) => !!runs[id] || !!lost[id]) : true;
  return { rows, open, loaded, settled: loaded && items !== null && asked };
}

/** useWaiting is the one count of the work that needs the person, as the front answers it, or null before the read and from an older front. */
export function useWaiting(): Waiting | null {
  return useDuties((s) => s.waiting);
}

/**
 * useAttention is the count on the app bar: the one count of the work that
 * needs the person, the same number as Work and Results. A front that
 * answers no count gives the rows of Activity that need you.
 */
export function useAttention(): number {
  const { rows, open } = useInboxRows();
  const rosters = useSelect((s) => s.rosters);
  const waiting = useWaiting();
  return waiting ? waiting.count : attentionOf({ bridges: open, rosters }, rows);
}
