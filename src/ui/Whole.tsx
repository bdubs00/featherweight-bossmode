// The end of a long entry that the channel cut at 4 KB: a quiet Show all,
// which reads the whole text only when the person asks for it. An old
// entry whose start alone was kept says so, with a link to the run of its
// agent where one holds the whole text.

import { useState } from 'preact/hooks';
import { loadWhole, type Whole } from '../state/whole';
import { attempt } from './notice';
import { Button } from './primitives';

/** CutEnd is the end of a cut entry: Show all, or, once the front says it kept only the start, Cut at 4 KB. with the link to the whole text of the run. */
export function CutEnd({ bridge, seq, whole, runHref, class: cls }: { bridge: string; seq: number; whole?: Whole; runHref?: string; class: string }) {
  const [busy, setBusy] = useState(false);
  if (whole && !whole.cut) return null;
  if (whole) {
    return (
      <p class={cls}>
        Cut at 4 KB. {runHref && <a href={runHref}>Whole text</a>}
      </p>
    );
  }
  return (
    <p class={cls}>
      <Button
        kind="quiet"
        size="s"
        class="cut-more"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await attempt(() => loadWhole(bridge, seq));
          setBusy(false);
        }}
      >
        Show all
      </Button>
    </p>
  );
}
