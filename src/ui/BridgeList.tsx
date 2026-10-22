// The list pane of the Bridges place: the open bridges, newest first, each
// with its unread count and the light of what needs you, then the closed
// bridges behind a toggle. The foot holds the state of the stream.

import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import { useSelect } from '../state/store';
import { hrefOf } from '../lib/route';
import { useRoving } from './keys';
import { LiveStatus } from './Shell';
import { Glyph } from './icons';
import { Button, Chip, Led, PaneHeader, countText } from './primitives';

const BridgeRow = memo(function BridgeRow({ id, current }: { id: string; current: boolean }) {
  const b = useSelect((s) => s.bridges.byId[id]);
  if (!b) return null;
  const closed = b.state === 'closed';
  const needs = b.needsYou || 0;
  const members = b.memberCount || 0;
  const label = [b.title, closed ? 'closed' : '', b.unread ? b.unread + ' unread' : '', needs ? needs + (needs === 1 ? ' member needs' : ' members need') + ' you' : ''].filter(Boolean).join(', ');
  return (
    <a
      class={'brow' + (current ? ' sel' : '') + (closed ? ' closed' : '') + (b.unread || current ? ' strong' : '')}
      href={hrefOf({ place: 'bridge', id, pane: 'none' })}
      data-item
      aria-current={current ? 'page' : undefined}
      aria-label={label}
    >
      <span class="brow-top">
        <span class="brow-title clip">{b.title}</span>
        {b.unread > 0 && (
          <Chip tone="ink" class="brow-unread">
            {countText(b.unread)}
          </Chip>
        )}
      </span>
      <span class="brow-meta">
        <span>{members === 1 ? '1 member' : members + ' members'}</span>
        {closed ? <Led tone="grey" word="closed" /> : needs > 0 ? <Led tone="amber" word={needs === 1 ? '1 needs you' : needs + ' need you'} /> : null}
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
  const list = useRoving<HTMLDivElement>();
  const open = openIds ? openIds.split('\n') : [];
  const closed = closedIds ? closedIds.split('\n') : [];
  return (
    <section class="screen bridge-list" aria-labelledby="bridges-title">
      <PaneHeader
        id="bridges-title"
        title="Bridges"
        count={loaded ? open.length : undefined}
        countLabel={open.length === 1 ? '1 open bridge' : open.length + ' open bridges'}
        actions={
          <Button href="#new" size="s">
            New
          </Button>
        }
      />
      <div class="scroll" ref={list}>
        <div role="list" aria-labelledby="bridges-title" class="rows">
          {open.map((id) => (
            <div role="listitem">
              <BridgeRow id={id} current={id === current} />
            </div>
          ))}
        </div>
        {loaded && open.length === 0 && (
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
            <button type="button" class="group-toggle" aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}>
              <Glyph name="back" size={14} class={showClosed ? 'turn-down' : 'turn-right'} />
              <span>Closed</span>
              <Chip>{closed.length}</Chip>
            </button>
            {showClosed && (
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
