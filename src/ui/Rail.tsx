// The rail: the manager conversation at the top, then the bridges with open
// ones first and their unread counts, then Fleet, Pages, and the account.

import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import { useSelect } from '../state/store';
import { hrefOf, type Route } from '../lib/route';
import { personName } from '../lib/words';
import { useRoving } from './keys';
import { Avatar, Face } from './common';
import { Icon } from './icons';

const BridgeRow = memo(function BridgeRow({ id, current }: { id: string; current: boolean }) {
  const b = useSelect((s) => s.bridges.byId[id]);
  if (!b) return null;
  const closed = b.state === 'closed';
  const needs = b.needsYou || 0;
  const label = [b.title, closed ? 'closed' : '', b.unread ? b.unread + ' unread' : '', needs ? needs + (needs === 1 ? ' member needs' : ' members need') + ' you' : '']
    .filter(Boolean)
    .join(', ');
  return (
    <a class={'rrow' + (current ? ' sel' : '') + (closed ? ' closed' : '') + (b.unread ? ' unread' : '')} href={hrefOf({ place: 'bridge', id, pane: 'none' })} data-item aria-current={current ? 'page' : undefined} aria-label={label}>
      <span class="ico">
        <Icon name="people" />
      </span>
      <span class="main">
        <span class="t">{b.title}</span>
        <span class="s">
          {closed ? (
            <span class="light quiet">
              <Icon name="stop" />
              <span class="w">closed</span>
            </span>
          ) : needs ? (
            <span class="light need">
              <Icon name="hand" />
              <span class="w">{needs === 1 ? '1 needs you' : needs + ' need you'}</span>
            </span>
          ) : (
            <span>{(b.memberCount || 0) + (b.memberCount === 1 ? ' member' : ' members')}</span>
          )}
        </span>
      </span>
      {b.unread > 0 && (
        <span class="badge" aria-hidden="true">
          {b.unread > 99 ? '99+' : b.unread}
        </span>
      )}
    </a>
  );
});

export function Rail({ route, onSignOut }: { route: Route; onSignOut: () => void }) {
  // The rail reads the ids of the open and the closed bridges as strings,
  // so a new message redraws one row and not the rail.
  const openIds = useSelect((s) => s.bridges.order.filter((id) => s.bridges.byId[id].state === 'open').join('\n'));
  const closedIds = useSelect((s) => s.bridges.order.filter((id) => s.bridges.byId[id].state === 'closed').join('\n'));
  const loaded = useSelect((s) => s.bridges.loaded);
  const me = useSelect((s) => s.me);
  const config = useSelect((s) => s.config);
  const status = useSelect((s) => s.stream.status);
  const [showClosed, setShowClosed] = useState(false);
  const list = useRoving<HTMLDivElement>();
  const open = openIds ? openIds.split('\n') : [];
  const closed = closedIds ? closedIds.split('\n') : [];
  const cur = route.place === 'bridge' ? route.id : '';
  const subject = (me && me.principal && me.principal.subject) || '';
  const name = (me && me.principal && (me.principal.name || personName(subject))) || 'You';
  const manager = config && config.manager;
  return (
    <nav class="col-rail" aria-label="Bossmode">
      <header class="rail-top">
        <span class="brand">
          <Icon name="feather" />
        </span>
        <b>Bossmode</b>
        <span class={'live ' + status} role="status" title={status === 'live' ? 'Live updates arrive.' : 'The page connects to the workbench again.'}>
          <Icon name={status === 'live' ? 'live' : 'lost'} />
          <span class="w">{status === 'live' ? 'Live' : status === 'closed' ? 'Offline' : 'Connecting'}</span>
        </span>
      </header>
      <div class="rail-body" ref={list}>
        <a class={'rrow manager' + (route.place === 'manager' ? ' sel' : '')} href="#manager" data-item aria-current={route.place === 'manager' ? 'page' : undefined}>
          {manager ? <Face agent={manager.agent} size={32} /> : <span class="ico"><Icon name="spark" /></span>}
          <span class="main">
            <span class="t">Manager</span>
            <span class="s">{manager ? 'Your conversation' : 'Not set up'}</span>
          </span>
        </a>
        <div class="rsec">
          <h2 id="rail-bridges">Bridges</h2>
          <a class="icon-btn" href="#new" aria-label="Open a new bridge" title="Open a new bridge">
            <Icon name="plus" />
          </a>
        </div>
        <div role="list" aria-labelledby="rail-bridges" class="rlist">
          {open.map((id) => (
            <div role="listitem">
              <BridgeRow id={id} current={id === cur} />
            </div>
          ))}
          {loaded && open.length === 0 && <p class="empty small">No bridge is open.</p>}
          {!loaded && <p class="empty small">Loading the bridges.</p>}
        </div>
        {closed.length > 0 && (
          <>
            <button type="button" class="rtoggle" aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}>
              <Icon name="chev" class={showClosed ? 'turned' : ''} />
              Closed ({closed.length})
            </button>
            {showClosed && (
              <div role="list" class="rlist">
                {closed.map((id) => (
                  <div role="listitem">
                    <BridgeRow id={id} current={id === cur} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div class="rsec">
          <h2>Places</h2>
        </div>
        <a class={'rrow' + (route.place === 'fleet' ? ' sel' : '')} href="#fleet" data-item aria-current={route.place === 'fleet' ? 'page' : undefined}>
          <span class="ico">
            <Icon name="grid" />
          </span>
          <span class="main">
            <span class="t">Fleet</span>
          </span>
        </a>
        <a class={'rrow' + (route.place === 'pages' ? ' sel' : '')} href="#pages" data-item aria-current={route.place === 'pages' ? 'page' : undefined}>
          <span class="ico">
            <Icon name="page" />
          </span>
          <span class="main">
            <span class="t">Pages</span>
          </span>
        </a>
      </div>
      <footer class="account">
        <Avatar subject={subject} display={name} size={32} />
        <span class="main">
          <span class="t">{name}</span>
          <span class="s">{subject}</span>
        </span>
        <span class="acts">
          <a class="link" href="/ui#connections">
            Connections
          </a>
          <button type="button" class="link" onClick={onSignOut}>
            Sign out
          </button>
        </span>
      </footer>
    </nav>
  );
}
