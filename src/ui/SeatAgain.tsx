// Seat again is the way back for a seat whose newest run failed or stopped.
// One click sends the task of the seat unchanged, and a new run starts with
// it. Change task, in the menu of the seat, changes the task first. The
// key sits on the row of the seat, over the composer of its conversation,
// and beside the failure in its run, so the way back is where the failure
// shows. A seat whose newest run stopped at a limit of its budget did
// nothing wrong: there the key is Continue, which goes on with the same
// run with more room, so the run keeps what it knows.

import { useState } from 'preact/hooks';
import type { Member } from '../api/types';
import { patchMember } from '../state/actions';
import { useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { seatPresence } from '../lib/status';
import { attempt } from './notice';
import { Button } from './primitives';

/** seatAgain starts a new run of a seat with its task. It resolves true when the seat took it. */
export function seatAgain(bridge: string, m: Pick<Member, 'handle' | 'task'>): Promise<boolean> {
  return attempt(() => patchMember(bridge, m.handle, { task: m.task }));
}

/** continueSeat goes on with the run of a seat that stopped at a limit, with more room. It resolves true when the seat took it. */
export function continueSeat(bridge: string, m: Pick<Member, 'handle'>): Promise<boolean> {
  return attempt(() => patchMember(bridge, m.handle, { continue: true }));
}

type Seat = Pick<Member, 'handle' | 'task'> & Partial<Pick<Member, 'fired' | 'presence' | 'runs'>>;

/** useAtLimit reports whether the newest run of a seat stopped at a limit of its budget, in the status of every screen. */
export function useAtLimit(m: Seat | undefined): boolean {
  return useSelect((s) => !!m && !!m.runs && m.presence !== undefined && seatPresence(selectFacts(s), m as Pick<Member, 'fired' | 'presence' | 'runs'>) === 'limit');
}

/**
 * SeatAgainKey is the way back of a stopped seat: Seat again, or Continue
 * for a seat at its limit. It is small and secondary in a row, and
 * primary where the stop is the whole view, as in the main pane of
 * Activity. label names the seat for a screen reader where many keys share
 * the screen, as in a list.
 */
export function SeatAgainKey({ bridge, m, label, primary }: { bridge: string; m: Seat; label?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const limit = useAtLimit(m);
  return (
    <Button
      size={primary ? 'm' : 's'}
      kind={primary ? 'primary' : 'secondary'}
      class="seat-again"
      aria-label={label ? (limit ? 'Continue ' + m.handle : label) : undefined}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await (limit ? continueSeat(bridge, m) : seatAgain(bridge, m));
        setBusy(false);
      }}
    >
      {limit ? 'Continue' : 'Seat again'}
    </Button>
  );
}
