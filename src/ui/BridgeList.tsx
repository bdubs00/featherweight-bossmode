// The list pane of the Bridges place: the open bridges, newest first, each
// with its unread count and the light of what needs you, then the closed
// bridges behind a toggle. A filter field shows above the list once it
// holds more than ten bridges. The foot holds the state of the stream.

import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import { useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { seatPresence } from '../lib/status';
import { hrefOf } from '../lib/route';
import { useRoving } from './keys';
import { LiveStatus } from './Shell';
import { Glyph } from './icons';
import { unreadText } from '../lib/words';
import { Button, Chip, Find, Led, PaneHeader } from './primitives';

/** The number of bridges above which the list shows its filter field. */
export const FILTER_FROM = 10;

/** matches reports whether a bridge title holds every word of a filter. */
export function matches(title: string, filter: string): boolean {
  const t = title.toLowerCase();
  return filter
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w));
}

const BridgeRow = memo(function BridgeRow({ id, current }: { id: string; current: boolean }) {
  const b = useSelect((s) => s.bridges.byId[id]);
  // A roster that the page holds shows whether a member works, in the status of every screen. The list loads no roster for it.
  const working = useSelect((s) => {
    const r = s.rosters[id];
    if (!r) return false;
    const f = selectFacts(s);
    return r.order.some((h) => seatPresence(f, r.byHandle[h]) === 'working');
  });
  if (!b) return null;
  const closed = b.state === 'closed';
  const needs = b.needsYou || 0;
  const members = b.memberCount || 0;
  const unread = b.unread > 0 || b.unreadMore;
  const label = [b.title, closed ? 'closed' : '', unread ? unreadText(b) + ' unread' : '', needs ? needs + (needs === 1 ? ' member needs' : ' members need') + ' you' : ''].filter(Boolean).join(', ');
  return (
    <a
      class={'brow' + (current ? ' sel' : '') + (closed ? ' closed' : '') + (unread || current ? ' strong' : '')}
      href={hrefOf({ place: 'bridge', id, pane: 'none' })}
      data-item
      aria-current={current ? 'page' : undefined}
      aria-label={label}
    >
      <span class="brow-top">
        <span class="brow-title clip">{b.title}</span>
        {unread && (
          <Chip tone="ink" class="brow-unread">
            {unreadText(b)}
          </Chip>
        )}
      </span>
      <span class="brow-meta">
        <span>{members === 1 ? '1 member' : members + ' members'}</span>
        {closed ? <Led tone="grey" word="closed" /> : needs > 0 ? <Led tone="amber" word={needs === 1 ? '1 needs you' : needs + ' need you'} /> : working ? <Led tone="green" word="working" /> : null}
      </span>
    </a>
  );
});

export function BridgeList({ current }: { current: string }) {
  // The list reads the ids of the open and the closed bridges as strings,
  // so a new message redraws one row and not the list.
  const openIds = useSelect((s) => s.bridges.order.filter((id) => s.bridges.byId[id].state === 'open').join('\n'));
  const closedIds = useSelect((s) => s.bridges.order.filter((id) => s.bridges.byId[id].state === 'closed').join('\n'));
  const loaded = useSelect((s) => s.bridges.loaded);
  const [showClosed, setShowClosed] = useState(false);
  const [filter, setFilter] = useState('');
  const list = useRoving<HTMLDivElement>();
  const allOpen = openIds ? openIds.split('\n') : [];
  const allClosed = closedIds ? closedIds.split('\n') : [];
  const many = allOpen.length + allClosed.length > FILTER_FROM;
  const titles = useSelect((s) => (many && filter.trim() ? s.bridges.byId : null));
  const keep = (id: string) => !titles || (!!titles[id] && matches(titles[id].title, filter));
  const open = allOpen.filter(keep);
  const closed = allClosed.filter(keep);
  return (
    <section class="screen bridge-list" aria-labelledby="bridges-title">
      <PaneHeader
        id="bridges-title"
        title="Bridges"
        count={loaded ? allOpen.length : undefined}
        countLabel={allOpen.length === 1 ? '1 open bridge' : allOpen.length + ' open bridges'}
        actions={
          <Button href="#new" size="s">
            New
          </Button>
        }
      />
      {many && (
        <div class="list-find">
          <Find label="Find a bridge" value={filter} onInput={setFilter} />
        </div>
      )}
      <div class="scroll" ref={list}>
        <div role="list" aria-labelledby="bridges-title" class="rows">
          {open.map((id) => (
            <div role="listitem">
              <BridgeRow id={id} current={id === current} />
            </div>
          ))}
        </div>
        {loaded && allOpen.length === 0 && (
          <div class="empty">
            <p>No bridge is open.</p>
            <Button href="#new" kind="primary">
              Open a bridge
            </Button>
          </div>
        )}
        {!loaded && <p class="empty">Loading the bridges.</p>}
        {closed.length > 0 && (
          <>
            <button type="button" class="group-toggle" aria-expanded={showClosed || (many && !!filter.trim())} onClick={() => setShowClosed(!showClosed)}>
              <Glyph name="back" size={14} class={showClosed ? 'turn-down' : 'turn-right'} />
              <span>Closed</span>
              <Chip>{closed.length}</Chip>
            </button>
            {(showClosed || (many && !!filter.trim())) && (
              <div role="list" class="rows">
                {closed.map((id) => (
                  <div role="listitem">
                    <BridgeRow id={id} current={id === current} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <footer class="pane-foot">
        <LiveStatus />
      </footer>
    </section>
  );
}
