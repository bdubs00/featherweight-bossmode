// The newest pass of the checks of done of a run, from its event
// fw.done.checked. The run object holds the state of the latest pass and
// its checks (run.done), but not the limit of the budget at which the run
// stopped, for a pass that ran after that stop. The event names it, so the
// page reads the end of the ledger once per run and end: the pass comes
// right before fw.run.finished, or a few events before it. A run that
// works, or that has no definition of done, costs no read.

import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { DoneChecked, Run } from '../api/types';

/** TAIL is the number of events at the end of the ledger that the page reads for the pass. */
const TAIL = 8;

const cache = new Map<string, DoneChecked | null>();
const reads = new Map<string, Promise<DoneChecked | null>>();

/** keyOf names a read: the run and the seq of its newest event, so a run that goes on reads again. */
const keyOf = (run: Pick<Run, 'id' | 'seq'>): string => run.id + '@' + run.seq;

/** ended reports whether a run has stopped, so its newest pass no longer changes. */
const ended = (run: Pick<Run, 'state'>): boolean => run.state === 'completed' || run.state === 'failed' || run.state === 'canceled';

/** readPass reads the newest fw.done.checked at the end of the ledger of a run, or null when the page finds none. */
export function readPass(run: Pick<Run, 'id' | 'seq'>): Promise<DoneChecked | null> {
  const key = keyOf(run);
  if (cache.has(key)) return Promise.resolve(cache.get(key) || null);
  let p = reads.get(key);
  if (!p) {
    p = api
      .events(run.id, Math.max(1, run.seq - TAIL + 1), TAIL)
      .then((events) => {
        const e = [...events].reverse().find((x) => x.type === 'fw.done.checked');
        return e && e.data && typeof e.data === 'object' ? (e.data as DoneChecked) : null;
      })
      .catch(() => null)
      .then((d) => {
        cache.set(key, d);
        reads.delete(key);
        return d;
      });
    reads.set(key, p);
  }
  return p;
}

/** forgetPasses drops what readPass read, for the tests. */
export function forgetPasses(): void {
  cache.clear();
  reads.clear();
}

/**
 * useDoneLimit is the limit of the budget, such as maxToolCalls, after
 * which the newest pass of a run ran, or "" for a pass that ran at the end
 * of a turn, for a run that works, and for a run without a definition of
 * done.
 */
export function useDoneLimit(run: Run | undefined): string {
  const want = !!run && !!run.done && ended(run) && run.seq > 0;
  const key = want ? keyOf(run!) : '';
  const [got, setGot] = useState<{ key: string; limit: string } | null>(null);
  useEffect(() => {
    if (!key || !run) return;
    let live = true;
    readPass(run).then((d) => live && setGot({ key, limit: (d && d.limit) || '' }));
    return () => {
      live = false;
    };
  }, [key]);
  if (!key) return '';
  if (got && got.key === key) return got.limit;
  const held = cache.get(key);
  return (held && held.limit) || '';
}
