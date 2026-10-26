// The list pane of the Bridges place: the open bridges, newest first, each
// with its unread count, one light in the order of attention: needs you,
// then a seat that failed, then working, and the freshness of its newest
// entry, such as 14 min, so a bridge that went quiet shows it. Then the closed bridges
// behind a toggle, with no unread count, because their work is done, the
// one with the newest entry first. A filter field shows above the list once
// it holds more than ten bridges. A filter shows the closed bridges that
// match under a heading, and a filter that matches none says so, with the
// key Clear. The foot holds the readout of the fleet.

import { memo } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { ensureRosters } from '../state/fetchers';
import { useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { seatPresence } from '../lib/status';
import { hrefOf } from '../lib/route';
import { useRoving } from './keys';
import { FleetFoot } from './Shell';
import { Glyph } from './icons';
import { ago, since, unreadText } from '../lib/words';
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

/** useMinute is the time now, once a minute, so the freshness of the rows stays true while the list shows. */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const BridgeRow = memo(function BridgeRow({ id, current, now }: { id: string; current: boolean; now: number }) {
  const b = useSelect((s) => s.bridges.byId[id]);
  // The roster of the bridge shows whether a seat failed or works, in the status of every screen. The list reads the rosters of the open bridges.
  const failed = useSelect((s) => {
    const r = s.rosters[id];
    if (!r) return 0;
    const f = selectFacts(s);
    return r.order.filter((h) => seatPresence(f, r.byHandle[h]) === 'error').length;
  });
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
  // A closed bridge did its work: an unread count there would pull the eye to nothing that waits.
  const unread = !closed && (b.unread > 0 || !!b.unreadMore);
  const status = closed ? (
    <Led tone="grey" word="closed" />
  ) : needs > 0 ? (
    <Led tone="amber" word={needs === 1 ? '1 needs you' : needs + ' need you'} />
  ) : failed > 0 ? (
    <Led tone="red" word={failed + ' failed'} />
  ) : working ? (
    <Led tone="green" word="working" />
  ) : null;
  const at = b.lastAt || '';
  const fresh = at ? since(at, now) : '';
  const label = [
    b.title,
    closed ? 'closed' : '',
    unread ? unreadText(b) + ' unread' : '',
    needs ? needs + (needs === 1 ? ' member needs' : ' members need') + ' you' : failed ? failed + (failed === 1 ? ' member failed' : ' members failed') : !closed && working ? 'working' : '',
    fresh ? 'last entry ' + ago(at, now) : '',
  ]
    .filter(Boolean)
    .join(', ');
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
        {status}
        {fresh && (
          <time class="brow-when" dateTime={at} title={new Date(at).toLocaleString()}>
            {fresh}
          </time>
        )}
      </span>
    </a>
  );
});

export function BridgeList({ current }: { current: string }) {
  // The list reads the ids of the open and the closed bridges as strings,
  // so a new message redraws one row and not the list.
  const openIds = useSelect((s) => s.bridges.order.filter((id) => s.bridges.byId[id].state === 'open').join('\n'));
  // A closed bridge shows the time of its newest entry, so the list orders them by it, newest first.
  const closedIds = useSelect((s) =>
    s.bridges.order
      .filter((id) => s.bridges.byId[id].state === 'closed')
      .sort((a, b) => (s.bridges.byId[b].lastAt || '').localeCompare(s.bridges.byId[a].lastAt || ''))
      .join('\n'),
  );
  const loaded = useSelect((s) => s.bridges.loaded);
  // A seat that failed shows on the row of its bridge, so the list reads the record of each open bridge once, as Activity does.
  useEffect(() => {
    if (loaded && openIds) ensureRosters();
  }, [loaded, openIds]);
  const [showClosed, setShowClosed] = useState(false);
  const [filter, setFilter] = useState('');
  const list = useRoving<HTMLDivElement>();
  const now = useMinute();
  const allOpen = openIds ? openIds.split('\n') : [];
  const allClosed = closedIds ? closedIds.split('\n') : [];
  const many = allOpen.length + allClosed.length > FILTER_FROM;
  const titles = useSelect((s) => (many && filter.trim() ? s.bridges.byId : null));
  const keep = (id: string) => !titles || (!!titles[id] && matches(titles[id].title, filter));
  const filtering = many && !!filter.trim();
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
        {filtering && open.length === 0 && closed.length === 0 && (
          <div class="empty" role="status">
            <p>No bridge matches {filter.trim()}.</p>
            <Button size="s" onClick={() => setFilter('')}>
              Clear
            </Button>
          </div>
        )}
        <div role="list" aria-labelledby="bridges-title" class="rows">
          {open.map((id) => (
            <div role="listitem">
              <BridgeRow id={id} current={id === current} now={now} />
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
            {/* A filter shows every closed bridge that matches, so the group is a heading then, not a toggle that does nothing. */}
            {filtering ? (
              <h2 class="group-toggle group-head" id="closed-head">
                <span>Closed</span>
                <Chip>{closed.length}</Chip>
              </h2>
            ) : (
              <button type="button" class="group-toggle" aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}>
                <Glyph name="back" size={14} class={showClosed ? 'turn-down' : 'turn-right'} />
                <span>Closed</span>
                <Chip>{closed.length}</Chip>
              </button>
            )}
            {(showClosed || filtering) && (
              <div role="list" class="rows">
                {closed.map((id) => (
                  <div role="listitem">
                    <BridgeRow id={id} current={id === current} now={now} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <FleetFoot />
    </section>
  );
}
