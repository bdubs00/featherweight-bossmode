// Seat again is the way back for a seat whose newest run failed or stopped.
// One click sends the task of the seat unchanged, and a new run starts with
// it. Change task, in the menu of the seat, changes the task first. The
// key sits on the row of the seat, over the composer of its conversation,
// and beside the failure in its run, so the way back is where the failure
// shows.

import { useState } from 'preact/hooks';
import type { Member } from '../api/types';
import { patchMember } from '../state/actions';
import { attempt } from './notice';
import { Button } from './primitives';

/** seatAgain starts a new run of a seat with its task. It resolves true when the seat took it. */
export function seatAgain(bridge: string, m: Pick<Member, 'handle' | 'task'>): Promise<boolean> {
  return attempt(() => patchMember(bridge, m.handle, { task: m.task }));
}

/**
 * SeatAgainKey is the key Seat again: small and secondary in a row, and
 * primary where the failure is the whole view, as in the main pane of
 * Activity. label names the seat for a screen reader where many keys share
 * the screen, as in a list.
 */
export function SeatAgainKey({ bridge, m, label, primary }: { bridge: string; m: Pick<Member, 'handle' | 'task'>; label?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size={primary ? 'm' : 's'}
      kind={primary ? 'primary' : 'secondary'}
      class="seat-again"
      aria-label={label}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await seatAgain(bridge, m);
        setBusy(false);
      }}
    >
      Seat again
    </Button>
  );
}
