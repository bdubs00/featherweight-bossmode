// The channel of the open bridge. The header holds the title, the tabs
// Posts, Wiki, and Decisions, the key Close bridge, and the menu More. Posts
// opens at the recent end of the channel, folds runs of system lines and of
// agent chatter, and ends with the capacity line when the seats outnumber
// the workers. Earlier messages reads the page in front and keeps the entry
// that the person reads in its place.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Delegation, Entry } from '../api/types';
import { store, useSelect } from '../state/store';
import { loadAllCards, loadBridge, loadChannel, loadOlder, loadPages, markRead, patchBridge, postMessage } from '../state/actions';
import { membersOf, type Channel as ChannelState } from '../state/reducer';
import { senderName, since } from '../lib/words';
import { decidedRuns, hiddenLine } from '../lib/lines';
import { hrefOf, type BridgeTab } from '../lib/route';
import { useRoving, smooth } from './keys';
import { attempt } from './notice';
import { Confirm, Empty, Menu } from './common';
import { EntryRow, markLoaded } from './Message';
import { Composer } from './Composer';
import { foldOf, foldShapes, foldWords, shapeKey, shapeOf, shapesOf, type Item, type Shape } from './fold';
import { wavesLine } from './seats';
import { Button, Chip, Led, LineLed, PaneHeader, Tabs, countText } from './primitives';
import { Glyph } from './icons';

/** Delegations is the dialog of what the manager can do in this bridge. */
function Delegations({ id, value, onClose }: { id: string; value: Delegation; onClose: () => void }) {
  const [d, setD] = useState<Delegation>(value);
  const [busy, setBusy] = useState(false);
  const rows: [keyof Delegation, string][] = [
    ['approve', 'Decide for members'],
    ['budget', 'Change the budgets of members'],
    ['members', 'Add and remove members'],
    ['report', 'Write a report on close'],
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
      <div class="checks">
        {rows.map(([k, label]) => (
          <label class="check">
            <input type="checkbox" checked={d[k]} onChange={(e) => setD({ ...d, [k]: (e.target as HTMLInputElement).checked })} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </Confirm>
  );
}

/**
 * ChannelComposer is the composer of a bridge. It reads the roster for the @
 * completion, so a change of presence redraws it and not the channel.
 */
function ChannelComposer(p: { id: string; closed: boolean; reply: Entry | null; onClearReply: () => void }) {
  const roster = useSelect((s) => s.rosters[p.id]);
  const members = useMemo(() => membersOf(roster).filter((m) => !m.fired), [roster]);
  const r = p.reply;
  return (
    <Composer
      draft={p.id}
      label="Message the bridge"
      placeholder="Message the bridge"
      members={members}
      disabled={p.closed ? 'Closed. Reopen it to send.' : ''}
      reply={r ? { seq: r.seq, who: senderName(r.from), text: r.text, handle: r.from.kind === 'agent' ? r.from.handle : undefined } : null}
      onClearReply={p.onClearReply}
      onSend={async (text, to) => {
        const ok = await attempt(() => postMessage(p.id, text, to, r ? r.seq : undefined));
        if (ok) p.onClearReply();
        return ok;
      }}
    />
  );
}

/* ---------- the shapes of a channel, for the folding ---------- */

const shapes = new WeakMap<object, { day: string; shape: Shape }>();

/**
 * channelShape reads the shapes of the loaded entries as one string. An
 * entry keeps its shape until it changes. A line that says a decision
 * leaves the channel when the channel holds the card that shows it.
 */
function channelShape(ch: ChannelState | undefined): string | undefined {
  if (!ch) return undefined;
  const today = new Date().toDateString();
  const out: Shape[] = [];
  const decided = decidedRuns(ch.seqs.map((seq) => ch.bySeq[seq] as Entry));
  for (const seq of ch.seqs) {
    const e = ch.bySeq[seq] as Entry;
    if (hiddenLine(e, decided)) continue;
    let c = shapes.get(e);
    if (!c || c.day !== today) {
      c = { day: today, shape: shapeOf(e) };
      shapes.set(e, c);
    }
    out.push(c.shape);
  }
  return shapeKey(out);
}

/** The width of the window from which Close bridge sits on the header, beside the title and the tabs. */
const ROOMY = '(min-width: 1500px)';

/** The width of the channel under which its tabs leave the header for a strip. */
const CRAMPED = 560;

/** useMedia reports whether a media query matches, and follows its changes. */
function useMedia(query: string): boolean {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [on, setOn] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(query);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [query]);
  return on;
}

/* ---------- Posts ---------- */

function FoldLine({ f, open, onToggle }: { f: Extract<Item, { kind: 'fold' }>; open: boolean; onToggle: () => void }) {
  return (
    <div class="fold">
      <button type="button" class="fold-key" aria-expanded={open} onClick={onToggle} data-item>
        <Glyph name="back" size={14} class={open ? 'turn-down' : 'turn-right'} />
        <span>{foldWords(f)}</span>
        {f.failed > 0 && <Led tone="red" word={f.failed + ' failed'} />}
      </button>
    </div>
  );
}

function Posts({ id, closed }: { id: string; closed: boolean }) {
  const goal = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].goal || s.bridges.byId[id].title : ''));
  const title = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].title : ''));
  // The channel reads the order and the shapes of the entries, never the
  // entries: a changed entry redraws its own row only.
  const seqs = useSelect((s) => (s.channels[id] ? s.channels[id].seqs : undefined));
  const key = useSelect((s) => channelShape(s.channels[id]));
  const prev = useSelect((s) => (s.channels[id] ? s.channels[id].prev : 0));
  const waves = useSelect((s) => wavesLine(membersOf(s.rosters[id]), s.fleet));
  const items = useMemo(() => foldShapes(shapesOf(key || '')), [key]);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [reply, setReply] = useState<number | null>(null);
  const [fresh, setFresh] = useState(false);
  const [older, setOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const jump = useRef(0);
  // Enter on a message of a person or an agent starts a reply to it.
  const list = useRoving<HTMLDivElement>({ start: 'last', onEnter: (el) => el.dataset.reply && setReply(Number(el.dataset.seq) || null) });

  useEffect(() => {
    setReply(null);
    setOpen(new Set());
  }, [id]);

  const toggle = (k: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // A reply chip asks for an entry: the fold that holds it opens, and the entry takes the focus.
  useEffect(() => {
    const f = (ev: Event) => {
      const d = (ev as CustomEvent<{ bridge: string; seq: number }>).detail;
      if (!d || d.bridge !== id) return;
      jump.current = d.seq;
      const k = foldOf(items, d.seq);
      if (k && !open.has(k)) toggle(k);
      else show();
    };
    window.addEventListener('fw-jump', f);
    return () => window.removeEventListener('fw-jump', f);
  }, [id, items, open]);
  const show = () => {
    const seq = jump.current;
    if (!seq) return;
    const el = document.getElementById('entry-' + id + '-' + seq);
    if (!el) return;
    jump.current = 0;
    el.scrollIntoView({ block: 'center' });
    el.focus();
  };
  useEffect(show, [open]);

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
  // A reader at the end stays there when the pane changes height, such as
  // when the composer grows with a reply chip or a long draft.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (shape.current.atEnd) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [id]);

  const onReply = useCallback((seq: number) => setReply(seq), []);
  const replyEntry = useSelect((s) => (reply && s.channels[id] ? s.channels[id].bySeq[reply] : undefined));

  const earlier = async () => {
    const el = scroller.current;
    if (el) shape.current = { ...shape.current, height: el.scrollHeight, top: el.scrollTop };
    setOlder(true);
    await attempt(() => loadOlder(id));
    setOlder(false);
  };

  return (
    <>
      <div class="scroll msgs" ref={scroller} onScroll={onScroll}>
        {prev > 0 && (
          <div class="earlier">
            <Button size="s" disabled={older} onClick={earlier}>
              {older ? 'Loading' : 'Earlier messages'}
            </Button>
          </div>
        )}
        {seqs && prev === 0 && <p class="start">{goal}</p>}
        <div class="entries" ref={list} role="log" aria-label={'Messages of ' + title} aria-live="polite" aria-relevant="additions">
          {seqs &&
            items.map((it) => {
              if (it.kind === 'entry') return <EntryRow key={it.seq} bridge={id} seq={it.seq} prevSeq={it.prevSeq} fresh={it.fresh} onReply={onReply} />;
              const isOpen = open.has(it.key);
              return (
                <div class={'fold-group' + (isOpen ? ' open' : '')} key={it.key}>
                  <FoldLine f={it} open={isOpen} onToggle={() => toggle(it.key)} />
                  {isOpen && it.seqs.map((seq, i) => <EntryRow key={seq} bridge={id} seq={seq} prevSeq={i === 0 ? it.prevSeq : it.seqs[i - 1]} fresh={i === 0} onReply={onReply} />)}
                </div>
              );
            })}
          {!seqs && <Empty>Loading the channel.</Empty>}
        </div>
        {seqs && waves && (
          <div class="sys waves" role="note">
            <p>
              <LineLed tone="grey" />
              <span class="sys-text">{waves}</span>
            </p>
          </div>
        )}
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
          New messages
        </button>
      )}
      <ChannelComposer id={id} closed={closed} reply={replyEntry || null} onClearReply={() => setReply(null)} />
    </>
  );
}

/* ---------- Wiki ---------- */

/** pagesOfBridge lists the paths of the pages under bridges/<id>/. */
export function pagesOfBridge(paths: string[], id: string): string[] {
  const head = 'bridges/' + id + '/';
  return paths.filter((p) => p.startsWith(head)).sort();
}

function WikiTab({ id }: { id: string }) {
  const loaded = useSelect((s) => s.pages.loaded);
  const key = useSelect((s) => pagesOfBridge(Object.keys(s.pages.byPath), id).join('\n'));
  const byPath = useSelect((s) => s.pages.byPath);
  const list = useRoving<HTMLUListElement>();
  useEffect(() => {
    if (!loaded) attempt(loadPages);
  }, [loaded]);
  const paths = key ? key.split('\n') : [];
  const head = 'bridges/' + id + '/';
  return (
    <div class="scroll tab-list">
      {!loaded && <Empty>Loading the pages.</Empty>}
      {loaded && paths.length === 0 && (
        <div class="empty center">
          <Button href={hrefOf({ place: 'pages', mode: 'create', path: head })}>New page</Button>
        </div>
      )}
      {paths.length > 0 && (
        <ul class="prows" ref={list}>
          {paths.map((p) => {
            const m = byPath[p];
            return (
              <li>
                <a class="prow" href={hrefOf({ place: 'pages', path: p, mode: 'read' })} data-item>
                  <span class="prow-title clip">{m && m.title ? m.title : p.slice(head.length).replace(/\.md$/, '')}</span>
                  <span class="prow-meta">
                    <span class="clip">{p.slice(head.length).replace(/\.md$/, '')}</span>
                    {m && m.at && (
                      <time dateTime={m.at} title={new Date(m.at).toLocaleString()}>
                        {since(m.at)}
                      </time>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ---------- Decisions ---------- */

const RANK: Record<string, number> = { pending: 0, unknown: 1, allow: 2, deny: 2 };

/**
 * cardOrder lists the cards of a channel, waiting first: the cards that
 * wait, the oldest first, then the cards in the state unknown, then the
 * decided ones, the newest first.
 */
export function cardOrder(entries: Entry[]): number[] {
  return entries
    .filter((e) => !!e.decision)
    .sort((a, b) => {
      const ra = RANK[a.decision!.state] ?? 2;
      const rb = RANK[b.decision!.state] ?? 2;
      if (ra !== rb) return ra - rb;
      return ra === 0 ? a.seq - b.seq : b.seq - a.seq;
    })
    .map((e) => e.seq);
}

/** waitingCards counts the cards that wait in the loaded part of a channel. */
function waitingCards(ch: ChannelState | undefined): number {
  if (!ch) return 0;
  let n = 0;
  for (const seq of ch.seqs) {
    const d = (ch.bySeq[seq] as Entry).decision;
    if (d && d.state === 'pending') n++;
  }
  return n;
}

function DecisionsTab({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const key = useSelect((s) => {
    const ch = s.channels[id];
    return ch ? cardOrder(ch.seqs.map((q) => ch.bySeq[q] as Entry)).join(',') : '';
  });
  const list = useRoving<HTMLDivElement>();
  useEffect(() => {
    let live = true;
    setLoading(true);
    attempt(() => loadAllCards(id)).then(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id]);
  const seqs = key ? key.split(',').map(Number) : [];
  return (
    <div class="scroll tab-list cards">
      {seqs.length === 0 && <Empty>{loading ? 'Loading the channel.' : 'Nothing needs you.'}</Empty>}
      {seqs.length > 0 && (
        <div class="entries" ref={list}>
          {seqs.map((seq) => (
            <EntryRow key={seq} bridge={id} seq={seq} prevSeq={0} fresh listed />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- the channel ---------- */

export function Channel({ id, tab: tabProp }: { id: string; tab?: BridgeTab }) {
  const b = useSelect((s) => s.bridges.byId[id]);
  const known = useSelect((s) => s.bridges.loaded);
  const loadedChannel = useSelect((s) => !!s.channels[id]);
  const waiting = useSelect((s) => waitingCards(s.channels[id]));
  const firstLoaded = useSelect((s) => (s.channels[id] ? s.channels[id].prev === 0 : false));
  const tab: BridgeTab = tabProp || 'posts';
  const [confirm, setConfirm] = useState<'close' | 'delegation' | null>(null);
  // Below 1500 pixels, Close bridge moves into More, so the title keeps
  // the room beside the tabs. In a narrow window, or where the members
  // pane leaves the channel cramped, the tabs take a strip of their own,
  // so the title stays in sight.
  const wide = useMedia(ROOMY);
  const narrow = useMedia('(max-width: 799px)');
  // The channel can first draw its loading state, so a callback ref finds the section once it is there.
  const [box, setBox] = useState<HTMLElement | null>(null);
  const [cramped, setCramped] = useState(false);
  useLayoutEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setCramped(box.clientWidth < CRAMPED));
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);
  const strip = narrow || cramped;

  // Open the bridge: its record, its roster, and the recent end of its channel.
  useEffect(() => {
    let live = true;
    // Until the channel loads, no card settles, also a card that arrived while the person read another bridge.
    markLoaded(id, Number.MAX_SAFE_INTEGER);
    attempt(() =>
      Promise.all([
        loadBridge(id),
        loadChannel(id).then(() => {
          if (!live) return;
          const ch = store.get().channels[id];
          markLoaded(id, ch && ch.seqs.length ? ch.seqs[ch.seqs.length - 1] : 0);
        }),
      ]),
    );
    return () => {
      live = false;
    };
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

  if (!b) {
    return (
      <section class="screen channel" aria-label="Bridge">
        <PaneHeader title="Bridge" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
        {known ? (
          <div class="empty center">
            <p>This bridge is not here. It was removed, or you cannot see it.</p>
            <Button href="#">Bridges</Button>
          </div>
        ) : (
          <Empty>Loading the channel.</Empty>
        )}
      </section>
    );
  }
  const closed = b.state === 'closed';
  // The loaded part can miss an older card that waits. The count of members that need you covers it.
  const decisions = firstLoaded ? waiting : Math.max(waiting, b.needsYou || 0);
  const base = { place: 'bridge' as const, id, pane: 'none' as const };
  const tabs = (
    <Tabs
      label="Bridge"
      current={tab}
      items={[
        { id: 'posts', label: 'Posts', href: hrefOf(base) },
        { id: 'wiki', label: 'Wiki', href: hrefOf({ ...base, tab: 'wiki' }) },
        { id: 'decisions', label: 'Decisions', href: hrefOf({ ...base, tab: 'decisions' }), count: decisions, countTone: 'amber', countLabel: decisions === 1 ? '1 decision waits' : countText(decisions) + ' decisions wait' },
      ]}
    />
  );
  return (
    <section class="screen channel" ref={setBox} aria-labelledby="channel-title">
      <PaneHeader
        id="channel-title"
        title={b.title}
        size="title"
        level={1}
        back={{ href: '#', label: 'Bridges', to: 'list' }}
        actions={
          <>
            <Button href={hrefOf({ place: 'bridge', id, pane: 'roster' })} size="s" class="collapsed-only">
              Members <Chip label={(b.memberCount || 0) + ' members'}>{b.memberCount || 0}</Chip>
            </Button>
            {!closed && wide && (
              <Button size="s" onClick={() => setConfirm('close')}>
                Close bridge
              </Button>
            )}
            <Menu
              label="More"
              items={[
                { label: 'What the manager can do', onSelect: () => setConfirm('delegation') },
                ...(closed ? [{ label: 'Reopen', onSelect: () => attempt(() => patchBridge(id, { state: 'open' })) }] : wide ? [] : [{ label: 'Close bridge', danger: true, onSelect: () => setConfirm('close') }]),
              ]}
            />
          </>
        }
      >
        {closed && <Led tone="grey" word="closed" />}
        {!strip && tabs}
      </PaneHeader>
      {strip && <div class="tab-strip">{tabs}</div>}
      {tab === 'posts' && <Posts id={id} closed={closed} />}
      {tab === 'wiki' && <WikiTab id={id} />}
      {tab === 'decisions' && loadedChannel && <DecisionsTab id={id} />}
      {tab === 'decisions' && !loadedChannel && <Empty>Loading the channel.</Empty>}
      {confirm === 'close' && (
        <Confirm
          title={'Close ' + b.title + '?'}
          confirm="Close bridge"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const ok = await attempt(() => patchBridge(id, { state: 'closed' }));
            if (ok) setConfirm(null);
          }}
        >
          <p>Members finish what they do. The channel takes no new message.{b.delegation.report ? ' The manager writes a report.' : ''}</p>
        </Confirm>
      )}
      {confirm === 'delegation' && <Delegations id={id} value={b.delegation} onClose={() => setConfirm(null)} />}
    </section>
  );
}
