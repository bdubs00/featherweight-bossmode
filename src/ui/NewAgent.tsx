// A new agent: one question first, how many workers it keeps, and the rest
// behind Advanced. Screen C builds it (docs/DESIGN.md, section 11). This
// first cut names the place.

import { PaneHeader } from './primitives';

export function NewAgent() {
  return (
    <section class="screen new-agent" aria-labelledby="new-agent-title">
      <PaneHeader id="new-agent-title" title="New agent" size="title" level={1} back={{ href: '#fleet', label: 'Fleet', to: 'list' }} />
      <div class="empty center">
        <p>A new agent starts with a name and the number of workers it keeps. The form comes with the next stage.</p>
      </div>
    </section>
  );
}
