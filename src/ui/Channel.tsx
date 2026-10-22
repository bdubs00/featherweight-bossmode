// The channel of the open bridge: the header, the entries, and the
// composer. The list opens at its recent end. Load earlier reads the page in
// front and keeps the entry that the person reads in its place.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Delegation } from '../api/types';
import { useSelect } from '../state/store';
import { loadBridge, loadChannel, loadOlder, markRead, patchBridge, postMessage } from '../state/actions';
import { membersOf } from '../state/reducer';
import { senderName } from '../lib/words';
import { hrefOf } from '../lib/route';
import { useRoving, smooth } from './keys';
import { attempt } from './notice';
import { Back, Confirm, Empty, Menu } from './common';
import { EntryRow } from './Message';
import { Composer } from './Composer';
import { Icon } from './icons';

/** Delegations is the dialog of what the manager can do in this bridge. */
function Delegations({ id, value, onClose }: { id: string; value: Delegation; onClose: () => void }) {
  const [d, setD] = useState<Delegation>(value);
  const [busy, setBusy] = useState(false);
  const rows: [keyof Delegation, string][] = [
    ['approve', 'Approve the calls of members'],
    ['budget', 'Change the budgets of members'],
    ['members', 'Add and remove members'],
    ['report', 'Write a report to the wiki when the bridge closes'],
  ];
  return (
    <Confirm
      title="What the manager can do here"
      confirm="Save"
      busy={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        const ok = await attempt(() => patchBridge(id, { delegation: d }));
        setBusy(false);
        if (ok) onClose();
      }}
    >
      <p class="lede">The manager acts for you only where you let it. A decision of the manager shows in the channel.</p>
      {rows.map(([k, label]) => (
        <label class="check">
          <input type="checkbox" checked={d[k]} onChange={(e) => setD({ ...d, [k]: (e.target as HTMLInputElement).checked })} />
          <span>{label}</span>
        </label>
      ))}
    </Confirm>
  );
}

export function Channel({ id }: { id: string }) {
  const b = useSelect((s) => s.bridges.byId[id]);
  const known = useSelect((s) => s.bridges.loaded);
  const ch = useSelect((s) => s.channels[id]);
  const seqs = ch ? ch.seqs : undefined;
  const prev = ch ? ch.prev : 0;
  const roster = useSelect((s) => s.rosters[id]);
  const [reply, setReply] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<'close' | 'delegation' | null>(null);
  const [fresh, setFresh] = useState(false);
  const [older, setOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  // Enter on a message of a person or an agent starts a reply to it.
  const list = useRoving<HTMLDivElement>({ start: 'last', onEnter: (el) => el.dataset.reply && setReply(Number(el.dataset.seq) || null) });
  const members = useMemo(() => membersOf(roster).filter((m) => !m.fired), [roster]);

  // Open the bridge: its record, its roster, and the recent end of its channel.
  useEffect(() => {
    setReply(null);
    attempt(() => Promise.all([loadBridge(id), loadChannel(id)]));
  }, [id]);

  // The person reads the open bridge, so its count stays at zero.
  const lastSeq = b ? b.lastSeq : 0;
  useEffect(() => {
    if (!b || document.visibilityState !== 'visible') return;
    if (b.unread > 0 || b.read < b.lastSeq) markRead(id);
  }, [id, lastSeq]);
  useEffect(() => {
    const f = () => {
      if (document.visibilityState === 'visible') markRead(id);
    };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [id]);

  // Scroll: the list opens at the end and follows new entries when the
  // person is at the end. An older page keeps the place of the reader.
  const shape = useRef({ first: 0, last: 0, height: 0, top: 0, atEnd: true });
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    shape.current.atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (shape.current.atEnd) setFresh(false);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !seqs || seqs.length === 0) return;
    const first = seqs[0];
    const last = seqs[seqs.length - 1];
    const was = shape.current;
    if (was.first === 0) {
      el.scrollTop = el.scrollHeight;
    } else if (first < was.first) {
      el.scrollTop = was.top + (el.scrollHeight - was.height);
    } else if (last > was.last) {
      if (was.atEnd) el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
      else setFresh(true);
    }
    shape.current = { first, last, height: el.scrollHeight, top: el.scrollTop, atEnd: was.first === 0 ? true : was.atEnd };
  }, [seqs]);
  useEffect(() => {
    shape.current = { first: 0, last: 0, height: 0, top: 0, atEnd: true };
  }, [id]);

  const onReply = useCallback((seq: number) => setReply(seq), []);
  const replyEntry = reply && ch ? ch.bySeq[reply] : undefined;

  const earlier = async () => {
    const el = scroller.current;
    if (el) shape.current = { ...shape.current, height: el.scrollHeight, top: el.scrollTop };
    setOlder(true);
    await attempt(() => loadOlder(id));
    setOlder(false);
  };

  if (!b) {
    return (
      <section class="screen channel" aria-label="Bridge">
        <div class="bar">
          <Back narrow label="Bridges" href="#" />
        </div>
        <Empty>{known ? 'This bridge is not here, or you cannot see it.' : 'Loading the bridge.'}</Empty>
      </section>
    );
  }
  const closed = b.state === 'closed';
  return (
    <section class="screen channel" aria-labelledby="channel-title">
      <header class="bar">
        <Back narrow label="Bridges" href="#" />
        <div class="title">
          <h1 id="channel-title">{b.title}</h1>
          <p class="goal" title={b.goal}>
            {closed ? 'Closed. ' : ''}
            {b.goal}
          </p>
        </div>
        <div class="end">
          <a class="btn small roster-link" href={hrefOf({ place: 'bridge', id, pane: 'roster' })}>
            <Icon name="people" /> {b.memberCount || members.length}
            <span class="sr"> members</span>
          </a>
          <Menu
            label="Bridge settings"
            icon="gear"
            items={[
              { label: 'What the manager can do', onSelect: () => setConfirm('delegation') },
              closed ? { label: 'Open the bridge again', onSelect: () => attempt(() => patchBridge(id, { state: 'open' })) } : { label: 'Close the bridge', danger: true, onSelect: () => setConfirm('close') },
            ]}
          />
        </div>
      </header>
      <div class="scroll msgs" ref={scroller} onScroll={onScroll}>
        {prev > 0 && (
          <div class="earlier">
            <button type="button" class="btn small" disabled={older} onClick={earlier}>
              {older ? 'Loading' : 'Load earlier messages'}
            </button>
          </div>
        )}
        {ch && prev === 0 && <p class="start">The start of the bridge {b.title}.</p>}
        <div class="entries" ref={list} role="log" aria-label={'Messages of ' + b.title} aria-live="polite" aria-relevant="additions">
          {seqs && seqs.map((seq, i) => <EntryRow key={seq} bridge={id} seq={seq} prevSeq={i > 0 ? seqs[i - 1] : 0} onReply={onReply} />)}
          {!ch && <Empty>Loading the channel.</Empty>}
        </div>
      </div>
      {fresh && (
        <button
          type="button"
          class="fresh"
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
            setFresh(false);
          }}
        >
          New messages below
        </button>
      )}
      <Composer
        draft={id}
        label={'Message to the bridge ' + b.title}
        placeholder="Message every member, or @ one member"
        members={members}
        disabled={closed ? 'This bridge is closed. Open it again to send.' : ''}
        reply={replyEntry ? { seq: replyEntry.seq, who: senderName(replyEntry.from), text: replyEntry.text, handle: replyEntry.from.kind === 'agent' ? replyEntry.from.handle : undefined } : null}
        onClearReply={() => setReply(null)}
        onSend={async (text, to) => {
          const ok = await attempt(() => postMessage(id, text, to, replyEntry ? replyEntry.seq : undefined));
          if (ok) setReply(null);
          return ok;
        }}
      />
      {confirm === 'close' && (
        <Confirm
          title={'Close ' + b.title + '?'}
          confirm="Close the bridge"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const ok = await attempt(() => patchBridge(id, { state: 'closed' }));
            if (ok) setConfirm(null);
          }}
        >
          <p>A close cancels nothing. The members finish what they do, and the channel takes no new message.{b.delegation.report ? ' The manager writes a report to the wiki.' : ''}</p>
        </Confirm>
      )}
      {confirm === 'delegation' && <Delegations id={id} value={b.delegation} onClose={() => setConfirm(null)} />}
    </section>
  );
}
