// The channel of the open bridge. The header holds the title, the tabs
// Posts, Wiki, and Decisions, the key Close bridge, and the menu More. More
// also saves the bridge as a playbook, and makes it a duty. Posts
// opens at the recent end of the channel, folds runs of system lines and of
// agent chatter, and ends with the capacity line when the seats outnumber
// the workers. Earlier messages reads the page in front and keeps the entry
// that the person reads in its place.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import type { BridgePage, Delegation, Entry } from '../api/types';
import { store, useSelect } from '../state/store';
import { loadAllCards, loadBridge, loadChannel, loadOlder, markRead, patchBridge, postMessage } from '../state/actions';
import { useBridgePages } from '../state/bridgepages';
import { membersOf, selectFacts, type Channel as ChannelState, type Roster, type State } from '../state/reducer';
import { questionWaits } from '../state/inbox';
import { senderName, since } from '../lib/words';
import { decidedRuns, hiddenLine, napOf } from '../lib/lines';
import { openedWords } from './chat/channels';
import { go, hrefOf, type BridgeTab } from '../lib/route';
import { useRoving, smooth } from './keys';
import { attempt, showSaid } from './notice';
import { refusalOf } from '../lib/attachments';
import { Confirm, Empty, Menu } from './common';
import { EntryRow, NapRow, markLoaded } from './Message';
import { NewBelow, nearEnd } from './Thread';
import { Composer } from './Composer';
import { foldOf, foldShapes, foldWords, shapeKey, shapeOf, shapesOf, type Item, type Part, type Shape } from './fold';
import { wavesLine } from './seats';
import { Typing, typingPhrase, type Typist } from './Typing';
import { seatPresence } from '../lib/status';
import { newestRun } from '../state/people';
import { Button, Chip, Led, LineLed, Mark, PaneHeader, Tabs, countText } from './primitives';
import { byName } from './Pages';
import { Glyph } from './icons';
import { SavePlaybook } from './Playbooks';

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
        if (!ok) return;
        onClose();
        showSaid('Saved what the manager can do here.');
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

/** typistsKey lists the seats of a bridge that work now, with the phrase of the step of each, as JSON, or "" when none works. */
function typistsKey(s: State, bridge: string): string {
  const roster = s.rosters[bridge];
  if (!roster) return '';
  const f = selectFacts(s);
  const out = membersOf(roster)
    .filter((m) => !m.fired && seatPresence(f, m) === 'working')
    .map((m) => {
      // The run of the store is newer than the activity of the roster, which the bridge reads less often.
      const run = s.runs[newestRun(m)];
      return { agent: m.agent, name: m.handle, phrase: typingPhrase(run) || (m.activity ? m.activity.phrase : '') };
    });
  return out.length ? JSON.stringify(out) : '';
}

/**
 * ChannelComposer is the composer of a bridge. It reads the roster for the @
 * completion, so a change of presence redraws it and not the channel.
 */
function ChannelComposer(p: { id: string; closed: boolean; reply: Entry | null; onClearReply: () => void; placeholder?: string }) {
  const roster = useSelect((s) => s.rosters[p.id]);
  const members = useMemo(() => membersOf(roster).filter((m) => !m.fired), [roster]);
  const r = p.reply;
  return (
    <Composer
      draft={p.id}
      label={p.placeholder || 'Message the team'}
      placeholder={p.placeholder || 'Message the team'}
      members={members}
      disabled={p.closed ? 'Closed. Reopen it to send.' : ''}
      reply={r ? { seq: r.seq, who: senderName(r.from), text: r.text, handle: r.from.kind === 'agent' ? r.from.handle : undefined } : null}
      onClearReply={p.onClearReply}
      attach
      onSend={async (text, to, files) => {
        const ok = await attempt(() =>
          postMessage(p.id, text, to, r ? r.seq : undefined, files).catch((e) => {
            throw refusalOf(e, files.length);
          }),
        );
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
function channelShape(ch: ChannelState | undefined, latestNaps = false): string | undefined {
  if (!ch) return undefined;
  const today = new Date().toDateString();
  const out: Shape[] = [];
  const decided = decidedRuns(ch.seqs.map((seq) => ch.bySeq[seq] as Entry));
  // With latestNaps, a line that says an agent went to sleep or woke up shows only when it is the newest such line of that agent.
  const latest = new Map<string, number>();
  if (latestNaps)
    for (const seq of ch.seqs) {
      const n = napOf(ch.bySeq[seq] as Entry);
      if (n) latest.set(n.handle, seq);
    }
  for (const seq of ch.seqs) {
    const e = ch.bySeq[seq] as Entry;
    if (hiddenLine(e, decided)) continue;
    if (latestNaps) {
      const n = napOf(e);
      if (n && latest.get(n.handle) !== seq) continue;
    }
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

/** partEnd is the seq of the last entry of a part of a fold. */
const partEnd = (p: Part): number => (p.kind === 'naps' ? p.seqs[p.seqs.length - 1] : p.seq);

function FoldLine({ f, open, onToggle, label }: { f: Extract<Item, { kind: 'fold' }>; open: boolean; onToggle: () => void; label?: string }) {
  return (
    <div class="fold">
      <button type="button" class="fold-key" aria-expanded={open} onClick={onToggle} data-item>
        <Glyph name="back" size={14} class={open ? 'turn-down' : 'turn-right'} />
        <span>{label || foldWords(f)}</span>
        {f.failed > 0 && <Led tone="red" word={f.failed + ' failed'} />}
      </button>
    </div>
  );
}

/**
 * Posts is the stream of a channel. The chat-first page (src/ui/chat) reuses
 * it with its own placeholder, and without the line of the waves, which
 * names workers.
 */
export function Posts({ id, closed, placeholder, quiet }: { id: string; closed: boolean; placeholder?: string; quiet?: boolean }) {
  const goal = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].goal || s.bridges.byId[id].title : ''));
  const title = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].title : ''));
  // The channel reads the order and the shapes of the entries, never the
  // entries: a changed entry redraws its own row only.
  const seqs = useSelect((s) => (s.channels[id] ? s.channels[id].seqs : undefined));
  const key = useSelect((s) => channelShape(s.channels[id], quiet));
  const prev = useSelect((s) => (s.channels[id] ? s.channels[id].prev : 0));
  const waves = useSelect((s) => (quiet ? '' : wavesLine(membersOf(s.rosters[id]), s.fleet)));
  // The seats that work now, as one text, so a change elsewhere in the store does not redraw the channel.
  const typingKey = useSelect((s) => typistsKey(s, id));
  const typists = useMemo(() => (typingKey ? (JSON.parse(typingKey) as (Typist & { phrase: string })[]) : []), [typingKey]);
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

  // Scroll: the list opens at the end and follows new entries while the
  // person reads at the end or within a screen of it, so a card that
  // needs the person comes into view. An older page keeps the place of
  // the reader.
  const shape = useRef({ first: 0, last: 0, height: 0, top: 0, atEnd: true });
  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    shape.current.atEnd = nearEnd(el);
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
  // when the composer grows with a reply chip or a long draft, and when an
  // entry grows after it arrived, as a card that reads its whole entry.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (shape.current.atEnd) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [id, seqs]);

  // The typing line grows the foot of the channel: a channel at its end stays there.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && shape.current.atEnd) el.scrollTop = el.scrollHeight;
  }, [typingKey]);

  const onReply = useCallback((seq: number) => setReply(seq), []);
  // The fold that starts with the opening of the channel says so, with the count of its agents.
  const entriesOf = useSelect((s) => s.channels[id]);
  const openedOf = (seqs: number[]): string | undefined => (entriesOf ? openedWords(seqs.map((q) => entriesOf.bySeq[q] as Entry)) : undefined);
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
              if (it.kind === 'naps') return <NapRow key={it.key} bridge={id} seqs={it.seqs} handle={it.handle} pairs={it.pairs} prevSeq={it.prevSeq} />;
              const isOpen = open.has(it.key);
              return (
                <div class={'fold-group' + (isOpen ? ' open' : '')} key={it.key}>
                  <FoldLine f={it} open={isOpen} onToggle={() => toggle(it.key)} label={quiet ? openedOf(it.seqs) : undefined} />
                  {isOpen &&
                    it.parts.map((p, i) => {
                      const prevSeq = i === 0 ? it.prevSeq : partEnd(it.parts[i - 1]);
                      if (p.kind === 'naps') return <NapRow key={p.key} bridge={id} seqs={p.seqs} handle={p.handle} pairs={p.pairs} prevSeq={prevSeq} />;
                      return <EntryRow key={p.seq} bridge={id} seq={p.seq} prevSeq={prevSeq} fresh={i === 0} onReply={onReply} />;
                    })}
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
        {seqs && <Typing who={typists} phrase={typists.length === 1 ? typists[0].phrase : undefined} named />}
      </div>
      {fresh && (
        <NewBelow
          lift={typists.length > 0}
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
            shape.current.atEnd = true;
            setFresh(false);
          }}
        />
      )}
      <ChannelComposer id={id} closed={closed} reply={replyEntry || null} onClearReply={() => setReply(null)} placeholder={placeholder} />
    </>
  );
}

/* ---------- Wiki ---------- */

/**
 * PageWriter names who wrote the newest version of a page of the bridge:
 * the seat, with its face, else the person or the agent that the page
 * names.
 */
function PageWriter({ id, p }: { id: string; p: BridgePage }) {
  const agent = useSelect((s) => (p.seat && s.rosters[id] && s.rosters[id].byHandle[p.seat] ? s.rosters[id].byHandle[p.seat].agent : ''));
  if (!p.seat) return <span class="clip">{byName(p.by)}</span>;
  return (
    <span class="prow-seat">
      <Mark agent={agent || p.seat} size={20} ink={p.seat === 'manager' || undefined} />
      <span class="clip">{p.seat}</span>
    </span>
  );
}

/**
 * WikiTab lists the pages of the work of the bridge: the pages under
 * bridges/<id>/ and every page that a run of the bridge wrote last,
 * wherever its agents put it. Each row links the page in the Wiki and
 * names the seat that wrote it.
 */
export function WikiTab({ id }: { id: string }) {
  const { pages, loaded, failed } = useBridgePages(id);
  const list = useRoving<HTMLUListElement>();
  const head = 'bridges/' + id + '/';
  return (
    <div class="scroll tab-list">
      {!loaded && !failed && <Empty>Loading the pages.</Empty>}
      {!loaded && failed && <Empty>{failed}</Empty>}
      {loaded && pages.length === 0 && (
        <div class="empty center">
          <p>No page yet. The members keep their notes and reports here, and you can write one too.</p>
          <Button href={hrefOf({ place: 'pages', mode: 'create', path: head })}>New page</Button>
        </div>
      )}
      {pages.length > 0 && (
        <ul class="prows" ref={list} aria-label="Pages of this team">
          {pages.map((p) => {
            // A page under the folder of the bridge needs no folder in its name.
            const where = (p.path.startsWith(head) ? p.path.slice(head.length) : p.path).replace(/\.md$/, '');
            return (
              <li>
                <a class="prow" href={hrefOf({ place: 'pages', path: p.path, mode: 'read' })} data-item aria-label={(p.title || where) + ', ' + (p.seat || byName(p.by)) + ', ' + since(p.at)}>
                  <span class="prow-title clip">{p.title || where}</span>
                  <span class="prow-meta">
                    <PageWriter id={id} p={p} />
                    <span class="prow-path clip">{where}</span>
                    {p.at && (
                      <time dateTime={p.at} title={new Date(p.at).toLocaleString()}>
                        {since(p.at)}
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
 * cardOrder lists the cards of a channel, waiting first: the cards and the
 * questions of the seats that wait, the oldest first, then the cards in the
 * state unknown, then the decided ones and the answered questions, the
 * newest first. waits tells whether a question still waits.
 */
export function cardOrder(entries: Entry[], waits: (e: Entry) => boolean = () => false): number[] {
  const rank = (e: Entry) => (e.decision ? (RANK[e.decision.state] ?? 2) : waits(e) ? 0 : 2);
  return entries
    .filter((e) => !!e.decision || !!e.ask)
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return ra === 0 ? a.seq - b.seq : b.seq - a.seq;
    })
    .map((e) => e.seq);
}

/**
 * waitingCards counts the cards and the questions that wait in the loaded
 * part of a channel. A closed bridge takes no answer, so its questions do
 * not count.
 */
export function waitingCards(ch: ChannelState | undefined, r: Roster | undefined, closed = false): number {
  if (!ch) return 0;
  let n = 0;
  for (const seq of ch.seqs) {
    const e = ch.bySeq[seq] as Entry;
    if ((e.decision && e.decision.state === 'pending') || (!closed && questionWaits(r, e))) n++;
  }
  return n;
}

/** isClosed reports whether the page holds a bridge as closed. */
export const isClosed = (s: { bridges: { byId: Record<string, { state: string }> } }, id: string): boolean => !!s.bridges.byId[id] && s.bridges.byId[id].state === 'closed';

/**
 * DecisionsTab lists the cards of the bridge, the ones that wait first.
 * When none waits, a line says so above the cards that were decided or
 * answered, so a past card never reads as work that waits.
 */
export function DecisionsTab({ id }: { id: string }) {
  const [loading, setLoading] = useState(true);
  const waits = useSelect((s) => (s.channels[id] ? waitingCards(s.channels[id], s.rosters[id], isClosed(s, id)) : 0));
  const key = useSelect((s) => {
    const ch = s.channels[id];
    const closed = isClosed(s, id);
    return ch ? cardOrder(ch.seqs.map((q) => ch.bySeq[q] as Entry), (e) => !closed && questionWaits(s.rosters[id], e)).join(',') : '';
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
      {seqs.length > 0 && waits === 0 && !loading && (
        <p class="cards-none" role="status">
          Nothing waits for you. The cards below were decided, answered, or ended without an answer.
        </p>
      )}
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
  const waiting = useSelect((s) => waitingCards(s.channels[id], s.rosters[id], isClosed(s, id)));
  const firstLoaded = useSelect((s) => (s.channels[id] ? s.channels[id].prev === 0 : false));
  const tab: BridgeTab = tabProp || 'posts';
  const [confirm, setConfirm] = useState<'close' | 'delegation' | 'playbook' | 'duty' | null>(null);
  // The agent of the first seat does a duty that Make this a duty starts from the bridge.
  const firstAgent = useSelect((s) => {
    const m = membersOf(s.rosters[id]).find((x) => x && !x.fired);
    return m ? m.agent : '';
  });
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
      ]).catch((e) => {
        // A bridge that is not here says so in place, so no notice repeats it.
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }),
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
      <section class="screen channel" aria-label="Team">
        <PaneHeader title="Team" size="title" level={1} back={{ href: '#', label: 'Teams', to: 'list' }} />
        {known ? (
          <div class="empty center">
            <p>This team is not here. It was removed, or you cannot see it.</p>
            <Button href="#">Teams</Button>
          </div>
        ) : (
          <Empty>Loading the channel.</Empty>
        )}
      </section>
    );
  }
  const closed = b.state === 'closed';
  // The loaded part can miss an older card that waits. The count of members that need you covers it, on a bridge that still takes answers.
  const decisions = firstLoaded || closed ? waiting : Math.max(waiting, b.needsYou || 0);
  const base = { place: 'bridge' as const, id, pane: 'none' as const };
  const tabs = (
    <Tabs
      label="Team"
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
        back={{ href: '#', label: 'Teams', to: 'list' }}
        actions={
          <>
            <Button href={hrefOf({ place: 'bridge', id, pane: 'roster' })} size="s" class="collapsed-only">
              Members <Chip label={(b.memberCount || 0) + ' members'}>{b.memberCount || 0}</Chip>
            </Button>
            {!closed && wide && (
              <Button size="s" onClick={() => setConfirm('close')}>
                Close team
              </Button>
            )}
            <Menu
              label="More"
              items={[
                { label: 'What the manager can do', onSelect: () => setConfirm('delegation') },
                { label: 'Save as playbook', onSelect: () => setConfirm('playbook') },
                // A closed bridge becomes a duty that opens a bridge from its playbook. An open one becomes a duty that posts in it.
                { label: 'Make this a duty', onSelect: () => (closed ? setConfirm('duty') : go({ place: 'duties', fresh: true, seed: { agent: firstAgent, act: 'post', bridge: id } })) },
                ...(closed ? [{ label: 'Reopen', onSelect: () => attempt(() => patchBridge(id, { state: 'open' })) }] : wide ? [] : [{ label: 'Close team', danger: true, onSelect: () => setConfirm('close') }]),
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
          confirm="Close team"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const ok = await attempt(() => patchBridge(id, { state: 'closed' }));
            if (ok) setConfirm(null);
          }}
        >
          <p>Members finish what they do. The channel takes no new message.{b.delegation.report ? ' The manager writes a report.' : ''} You can reopen it from More.</p>
        </Confirm>
      )}
      {confirm === 'delegation' && <Delegations id={id} value={b.delegation} onClose={() => setConfirm(null)} />}
      {confirm === 'playbook' && <SavePlaybook bridge={id} onClose={() => setConfirm(null)} />}
      {confirm === 'duty' && (
        <SavePlaybook bridge={id} confirm="Save and make a duty" onClose={() => setConfirm(null)} onSaved={(name) => go({ place: 'duties', fresh: true, seed: { agent: firstAgent, act: 'open', playbook: name } })} />
      )}
    </section>
  );
}
