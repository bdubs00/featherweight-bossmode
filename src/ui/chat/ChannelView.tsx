// A channel: its header with the title, the faces of its members, the tabs
// Posts, Wiki, and Decisions, and the menu, then the tab. Posts is the stream
// of the channel and its composer (Channel.tsx). A channel is a bridge of the
// API; the page never says so.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { ApiError } from '../../api/client';
import { store, useSelect } from '../../state/store';
import { loadBridge, loadChannel, markRead, patchBridge } from '../../state/actions';
import { entriesOf, membersOf } from '../../state/reducer';
import { peopleOf } from './channels';
import { personName } from '../../lib/words';
import { attempt, showSaid } from '../notice';
import { Confirm, Empty } from '../common';
import { markLoaded } from '../Message';
import { DecisionsTab, Posts, WikiTab, isClosed, waitingCards } from '../Channel';
import { Glyph } from '../icons';
import { Avatar, Led, Mark, Tabs, countText } from '../primitives';
import { Pop } from './Pop';
import { MakeJob } from './MakeJob';
import { chatHref, type ChannelTab } from './route';

/** useOpenChannel reads the record, the members, and the recent end of a channel, and keeps it read while the person sees it. */
export function useOpenChannel(id: string): void {
  useEffect(() => {
    let live = true;
    markLoaded(id, Number.MAX_SAFE_INTEGER);
    attempt(() =>
      Promise.all([
        loadBridge(id),
        loadChannel(id).then(() => {
          if (!live) return;
          const ch = store.get().channels[id];
          markLoaded(id, ch && ch.seqs.length ? ch.seqs[ch.seqs.length - 1] : 0);
        }),
      ]).catch((e) => {
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  const b = useSelect((s) => s.bridges.byId[id]);
  const lastSeq = b ? b.lastSeq : 0;
  useEffect(() => {
    if (!b || document.visibilityState !== 'visible') return;
    if (b.unread > 0 || b.read < b.lastSeq) markRead(id);
  }, [id, lastSeq]);
}

/** Faces shows the faces of the agents of a channel, then the people. */
function Faces({ id }: { id: string }) {
  const roster = useSelect((s) => s.rosters[id]);
  const operator = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].operator : ''));
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const meName = useSelect((s) => (s.me && s.me.principal ? s.me.principal.name : undefined));
  const agents = membersOf(roster).filter((m) => m && !m.fired);
  const channel = useSelect((s) => s.channels[id]);
  const people = useMemo(() => peopleOf(operator, me, entriesOf(channel)), [operator, me, channel]);
  return (
    <a class="cf-faces" href={chatHref({ view: 'channel', id, tab: 'posts', members: true })} title="Members" aria-label={agents.length + (agents.length === 1 ? ' agent' : ' agents') + ' and ' + people.length + (people.length === 1 ? ' person' : ' people')}>
      {agents.slice(0, 5).map((m) => (
        <Mark agent={m.agent} size={20} />
      ))}
      {people.map((p) => (
        <Avatar subject={p.subject} display={p.subject === me ? meName : p.display || personName(p.subject)} size={20} />
      ))}
    </a>
  );
}

export function ChannelView({ id, tab }: { id: string; tab: ChannelTab }) {
  useOpenChannel(id);
  const b = useSelect((s) => s.bridges.byId[id]);
  const known = useSelect((s) => s.bridges.loaded);
  const loadedChannel = useSelect((s) => !!s.channels[id]);
  const waiting = useSelect((s) => waitingCards(s.channels[id], s.rosters[id], isClosed(s, id)));
  const firstLoaded = useSelect((s) => (s.channels[id] ? s.channels[id].prev === 0 : false));
  const face = useSelect((s) => {
    const m = membersOf(s.rosters[id]).find((x) => x && !x.fired);
    return m ? m.agent : '';
  });
  const [confirm, setConfirm] = useState<'close' | 'job' | null>(null);
  if (!b) {
    return (
      <section class="cf-view" aria-label="Channel">
        <header class="cf-head">
          <a class="cf-back" href="#" aria-label="Back to the channels">
            <Glyph name="back" size={20} />
          </a>
          <h1 class="cf-title">Channel</h1>
        </header>
        {known ? (
          <div class="empty center">
            <p>This channel is not here. It was removed, or you cannot see it.</p>
          </div>
        ) : (
          <Empty>Loading the channel.</Empty>
        )}
      </section>
    );
  }
  const closed = b.state === 'closed';
  const decisions = firstLoaded || closed ? waiting : Math.max(waiting, b.needsYou || 0);
  const base = { view: 'channel' as const, id };
  return (
    <section class="cf-view cf-channel" aria-labelledby="cf-channel-title">
      <header class="cf-head">
        <a class="cf-back" href="#" aria-label="Back to the channels">
          <Glyph name="back" size={20} />
        </a>
        {face ? <Mark agent={face} size={32} /> : <span class="cf-chan-hash">#</span>}
        <h1 class="cf-title" id="cf-channel-title" title={b.title}>
          {b.title}
        </h1>
        {closed && <Led tone="grey" word="closed" />}
        <Faces id={id} />
        <Tabs
          label="Channel"
          current={tab}
          items={[
            { id: 'posts', label: 'Posts', href: chatHref({ ...base, tab: 'posts' }) },
            { id: 'wiki', label: 'Wiki', href: chatHref({ ...base, tab: 'wiki' }) },
            { id: 'decisions', label: 'Decisions', href: chatHref({ ...base, tab: 'decisions' }), count: decisions, countTone: 'amber', countLabel: decisions === 1 ? '1 decision waits' : countText(decisions) + ' decisions wait' },
          ]}
        />
        <a class="cf-members-key" href={chatHref({ ...base, tab: 'posts', members: true })}>
          Members
        </a>
        <Pop
          label="More"
          keyClass="cf-icon-key"
          align="end"
          keyBody={<Glyph name="more" size={20} />}
          items={[
            { label: 'Make this a job', onSelect: () => setConfirm('job') },
            closed ? { label: 'Reopen the channel', onSelect: () => void attempt(() => patchBridge(id, { state: 'open' })) } : { label: 'Close the channel', onSelect: () => setConfirm('close') },
            { label: 'Open in the old view', href: '#bridge/' + encodeURIComponent(id), sep: true },
          ]}
        />
      </header>
      {tab === 'posts' && <Posts id={id} closed={closed} quiet placeholder="Post to the channel · type @ to ask one agent" />}
      {tab === 'wiki' && <WikiTab id={id} />}
      {tab === 'decisions' && loadedChannel && <DecisionsTab id={id} />}
      {tab === 'decisions' && !loadedChannel && <Empty>Loading the channel.</Empty>}
      {confirm === 'close' && (
        <Confirm
          title={'Close ' + b.title + '?'}
          confirm="Close the channel"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const ok = await attempt(() => patchBridge(id, { state: 'closed' }));
            if (!ok) return;
            setConfirm(null);
            showSaid('Closed ' + b.title + '.');
          }}
        >
          <p>Its agents finish what they do. The channel takes no new post.{b.delegation.report ? ' The Manager writes a report.' : ''} You can reopen it from the menu.</p>
        </Confirm>
      )}
      {confirm === 'job' && <MakeJob bridge={id} onClose={() => setConfirm(null)} />}
    </section>
  );
}
