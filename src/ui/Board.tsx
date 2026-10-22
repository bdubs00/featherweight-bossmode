// The board: one light per member, for a fleet too large for a list. Screen
// B builds it (docs/DESIGN.md, section 11). This first cut names the place.

import { PaneHeader } from './primitives';

export function Board() {
  return (
    <section class="screen board" aria-labelledby="board-title">
      <PaneHeader id="board-title" title="Board" size="title" level={1} back={{ href: '#fleet', label: 'Fleet', to: 'list' }} />
      <div class="empty center">
        <p>The board shows one light per member. It comes with the next stage.</p>
      </div>
    </section>
  );
}
