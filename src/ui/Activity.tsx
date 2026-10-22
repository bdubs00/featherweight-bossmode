// The Activity place: the inbox of what needs the operator. This first cut
// lists the open bridges with members that need you, then the bridges with
// unread entries, attention first. Screen B reworks it into the inbox of
// docs/DESIGN.md, section 11: the decisions themselves, in order of
// attention, with keyboard decisions.

import { useSelect } from '../state/store';
import { hrefOf } from '../lib/route';
import { useRoving } from './keys';
import { Chip, Led, PaneHeader, countText } from './primitives';

export function ActivityList() {
  const ids = useSelect((s) =>
    s.bridges.order
      .filter((id) => s.bridges.byId[id].state === 'open' && ((s.bridges.byId[id].needsYou || 0) > 0 || s.bridges.byId[id].unread > 0))
      .sort((a, b) => (s.bridges.byId[b].needsYou || 0) - (s.bridges.byId[a].needsYou || 0))
      .join('\n'),
  );
  const loaded = useSelect((s) => s.bridges.loaded);
  const byId = useSelect((s) => s.bridges.byId);
  const list = useRoving<HTMLDivElement>();
  const items = ids ? ids.split('\n') : [];
  const needs = items.reduce((n, id) => n + (byId[id].needsYou || 0), 0);
  return (
    <section class="screen activity" aria-labelledby="activity-title">
      <PaneHeader id="activity-title" title="Activity" count={loaded ? needs : undefined} countLabel={needs === 1 ? '1 member needs you' : needs + ' members need you'} />
      <div class="scroll" ref={list}>
        <div class="rows" role="list">
          {items.map((id) => {
            const b = byId[id];
            const n = b.needsYou || 0;
            return (
              <div role="listitem">
                <a class={'brow' + (b.unread ? ' strong' : '')} href={hrefOf({ place: 'bridge', id, pane: 'none' })} data-item>
                  <span class="brow-top">
                    <span class="brow-title clip">{b.title}</span>
                    {b.unread > 0 && <Chip tone="ink" label={b.unread + ' unread'}>{countText(b.unread)}</Chip>}
                  </span>
                  <span class="brow-meta">{n > 0 ? <Led tone="amber" word={n === 1 ? '1 needs you' : n + ' need you'} /> : <span>New messages</span>}</span>
                </a>
              </div>
            );
          })}
        </div>
        {loaded && items.length === 0 && (
          <div class="empty">
            <p>Nothing needs you. New decisions and messages land here first.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function ActivityMain() {
  return (
    <section class="screen">
      <div class="empty center">
        <p>Pick an item in the list to decide or to read it.</p>
      </div>
    </section>
  );
}
