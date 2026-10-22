// The members of the open bridge. Each row holds the mark, the handle, the
// status, the task, the phrase of the activity, and the reason of an
// error. A row that needs you takes the wash of need. A click opens the
// conversation of the member. The menu More holds Open conversation, Mute,
// Seat again, Change task, and Fire. Add opens the picker, and each pick
// puts a new seat row at the top. The foot sums the usage of the bridge.
// A member dragged out of the pane asks to fire it.

import { memo } from 'preact/compat';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Member, UsageSum } from '../api/types';
import { useSelect } from '../state/store';
import { addMember, fire, loadPages, patchMember } from '../state/actions';
import { errorReason } from '../lib/words';
import { loadRunOnce } from '../state/actions';
import { seatLight } from '../lib/presence';
import { hrefOf, go } from '../lib/route';
import { useRoving } from './keys';
import { attempt } from './notice';
import { Confirm, Empty, Menu } from './common';
import { Picker } from './Picker';
import { draftOf, seatReason, type Draft } from './seats';
import { pagesOfBridge } from './Channel';
import { Button, Chip, Field, Input, Led, Mark, PaneHeader, TextArea, buttonClass } from './primitives';

const DRAG_TYPE = 'application/x-fw-member';

type Ask = { kind: 'fire'; m: Member } | { kind: 'task'; m: Member } | { kind: 'seat'; m: Member } | null;

/** Phrase shows the phrase of an activity. A quoted command, such as Ran "x", shows the command as code. */
export function Phrase({ text }: { text: string }) {
  const m = /^(\S+) "(.+)"$/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]} <code>{m[2]}</code>
    </>
  );
}

const MemberRow = memo(function MemberRow({ bridge, handle, onAsk, current }: { bridge: string; handle: string; onAsk: (a: Ask) => void; current: boolean }) {
  const m = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].byHandle[handle] : undefined));
  const run = m ? m.runs[m.runs.length - 1] : '';
  const runState = useSelect((s) => (run && s.runs[run] ? s.runs[run].state : ''));
  const reason = useSelect((s) => (run && s.runs[run] && m && m.presence === 'error' ? errorReason(s.runs[run]) : ''));
  const presence = m ? m.presence : '';
  const quiet = m ? !m.activity : false;
  // A seat that works with no activity can wait in the queue, and a seat in
  // error has a reason: the row reads its run once to learn which.
  useEffect(() => {
    if (run && (presence === 'error' || (presence === 'working' && quiet))) loadRunOnce(run);
  }, [run, presence, quiet]);
  if (!m) return null;
  const light = seatLight(m.presence, runState);
  // A seat whose newest run failed, stopped at a limit, or was canceled gets
  // no message. Seat again starts a new run with its task.
  const stopped = m.presence === 'error' || runState === 'failed' || runState === 'canceled';
  const href = hrefOf({ place: 'member', bridge, handle: m.handle, tab: 'chat' });
  const phrase = m.activity && m.activity.phrase && (m.presence === 'working' || m.presence === 'needs-you') && light.word !== 'waiting for a worker' ? m.activity.phrase : '';
  return (
    <li
      class={'member' + (m.fired ? ' fired' : '') + (current ? ' sel' : '') + (m.presence === 'needs-you' ? ' needs' : '')}
      draggable={!m.fired}
      onDragStart={(e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData(DRAG_TYPE, m.handle);
        e.dataTransfer.setData('text/plain', '@' + m.handle);
        e.dataTransfer.effectAllowed = 'move';
        document.body.classList.add('dragging-member');
      }}
      onDragEnd={() => document.body.classList.remove('dragging-member')}
    >
      <a class="open" href={href} data-item aria-label={`${m.handle}, ${light.word}. ${m.task}. Open its conversation.`}>
        <Mark agent={m.agent} size={36} />
        <span class="main">
          <span class="t">
            <span class="handle">{m.handle}</span>
            <Led tone={light.tone} word={light.word} struck={light.struck} label={light.label} />
            {m.muted && !m.fired && <Chip>muted</Chip>}
          </span>
          <span class="task">{m.task}</span>
          {phrase && (
            <span class="act">
              <Phrase text={phrase} />
            </span>
          )}
          {reason && <span class="act err">{reason}</span>}
        </span>
      </a>
      {!m.fired && (
        <Menu
          label={'More for ' + m.handle}
          items={[
            { label: 'Open conversation', onSelect: () => go(href) },
            { label: m.muted ? 'Unmute' : 'Mute', onSelect: () => attempt(() => patchMember(bridge, m.handle, { muted: !m.muted })) },
            ...(stopped ? [{ label: 'Seat again', onSelect: () => onAsk({ kind: 'seat', m }) }] : []),
            { label: 'Change task', onSelect: () => onAsk({ kind: 'task', m }) },
            { label: 'Fire', danger: true, onSelect: () => onAsk({ kind: 'fire', m }) },
          ]}
        />
      )}
    </li>
  );
});

/** SeatRow is a new seat before it goes out: the handle, the task from the goal, Seat, and Cancel. */
function SeatRow({ bridge, d, taken, onChange, onDone }: { bridge: string; d: Draft; taken: string[]; onChange: (d: Draft) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seat = async () => {
    const why = seatReason(d.handle, taken);
    setError(why);
    if (why || !d.task.trim()) return;
    setBusy(true);
    const ok = await attempt(() => addMember(bridge, { handle: d.handle, agent: d.agent, task: d.task.trim() }));
    setBusy(false);
    if (ok) onDone();
  };
  const id = 'seat-task-' + d.id;
  return (
    <li class="member draft">
      <Mark agent={d.agent} size={36} selected />
      <div class="main">
        <span class="t">
          <span class="handle">{d.handle}</span>
          <span class="t-meta">new seat</span>
        </span>
        <Field label={<span class="sr">Task</span>} error={error} id={id}>
          <Input
            id={id}
            value={d.task}
            invalid={!!error}
            onInput={(e) => onChange({ ...d, task: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                seat();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onDone();
              }
            }}
          />
        </Field>
        <div class="row-keys">
          <Button kind="primary" size="s" disabled={busy || !d.task.trim()} onClick={seat}>
            Seat
          </Button>
          <Button size="s" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </li>
  );
}

/** NewTask asks for the task of Seat again and of Change task. */
function NewTask({ bridge, m, seat, onClose }: { bridge: string; m: Member; seat?: boolean; onClose: () => void }) {
  const [task, setTask] = useState(m.task);
  const [busy, setBusy] = useState(false);
  return (
    <Confirm
      title={seat ? 'Seat ' + m.handle + ' again' : 'Change the task of ' + m.handle}
      confirm={seat ? 'Seat again' : 'Change task'}
      busy={busy || !task.trim()}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        // Seat again sends the task also when its text is the same: a new run starts with it.
        const ok = await attempt(() => patchMember(bridge, m.handle, { task: task.trim() }));
        setBusy(false);
        if (ok) onClose();
      }}
    >
      <Field label="Task">
        <TextArea value={task} onInput={(e) => setTask((e.target as HTMLTextAreaElement).value)} />
      </Field>
    </Confirm>
  );
}

/** usageParts are the numbers of the foot and their words: turns, cost, and pages. */
export function usageParts(u: UsageSum, pages: number): { n: string; word: string }[] {
  const out: { n: string; word: string }[] = [];
  if (u.turns !== undefined) out.push({ n: String(u.turns), word: u.turns === 1 ? 'turn' : 'turns' });
  if (u.costUSD !== undefined) out.push({ n: '$' + u.costUSD.toFixed(2), word: 'so far' });
  out.push({ n: String(pages), word: pages === 1 ? 'page' : 'pages' });
  return out;
}

/** BridgeFoot is the foot of the members: This bridge, with turns, cost, and pages, for runs that report usage. */
function BridgeFoot({ bridge }: { bridge: string }) {
  const usage = useSelect((s) => (s.bridges.byId[bridge] ? s.bridges.byId[bridge].usage : undefined));
  const pages = useSelect((s) => pagesOfBridge(Object.keys(s.pages.byPath), bridge).length);
  const pagesLoaded = useSelect((s) => s.pages.loaded);
  // Only the record of one bridge carries usage, so a later change of the record keeps the last one.
  const last = useRef<{ bridge: string; u: UsageSum } | null>(null);
  if (usage) last.current = { bridge, u: usage };
  const u = usage || (last.current && last.current.bridge === bridge ? last.current.u : undefined);
  useEffect(() => {
    if (!pagesLoaded) loadPages().catch(() => {});
  }, [pagesLoaded]);
  if (!u || !u.reported) return null;
  return (
    <footer class="pane-foot bridge-foot">
      <div class="t-meta">This bridge</div>
      <div class="nums">
        {usageParts(u, pages).map((p) => (
          <span>
            <strong>{p.n}</strong> {p.word}
          </span>
        ))}
      </div>
    </footer>
  );
}

let draftIds = 0;

export function Roster({ bridge, current }: { bridge: string; current?: string }) {
  const order = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].order : undefined));
  const isOpen = useSelect((s) => !!s.bridges.byId[bridge] && s.bridges.byId[bridge].state === 'open');
  const goal = useSelect((s) => (s.bridges.byId[bridge] ? s.bridges.byId[bridge].goal : ''));
  const title = useSelect((s) => (s.bridges.byId[bridge] ? s.bridges.byId[bridge].title : ''));
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const list = useRoving<HTMLUListElement>();
  const pane = useRef<HTMLElement>(null);
  const addKey = useRef<HTMLButtonElement>(null);
  const draftBox = useRef<HTMLUListElement>(null);
  const [below, setBelow] = useState(0);

  // The picker sits below the new seat rows, so the row that a pick makes stays in sight.
  useLayoutEffect(() => {
    const el = draftBox.current;
    setBelow(el ? el.offsetHeight : 0);
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBelow(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [drafts.length > 0]);

  // Another bridge starts with no new seat and a closed picker.
  useEffect(() => {
    setDrafts([]);
    setPicker(false);
  }, [bridge]);
  useEffect(() => {
    if (!isOpen) setPicker(false);
  }, [isOpen]);

  const taken = [...(order || []), ...drafts.map((d) => d.handle)];
  const pick = (agent: string) => setDrafts((ds) => [draftOf(++draftIds, agent, [...(order || []), ...ds.map((d) => d.handle)], goal, title), ...ds]);
  const closePicker = useCallback(() => setPicker(false), []);

  // A member dropped outside the members asks to fire it.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
      const inside = pane.current && pane.current.contains(e.target as Node);
      if (!inside) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
      document.body.classList.remove('dragging-member');
      if (pane.current && pane.current.contains(e.target as Node)) return;
      e.preventDefault();
      const handle = e.dataTransfer.getData(DRAG_TYPE);
      const m = order && order.includes(handle) ? handle : '';
      if (m) setAsk({ kind: 'fire', m: { handle } as Member });
    };
    document.addEventListener('dragover', over);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('drop', drop);
    };
  }, [order]);

  // The key Add is a plain button with the look of a key, so the picker can give the focus back to it.
  const addButton = (
    <button ref={addKey} type="button" class={buttonClass('secondary', 's')} aria-haspopup="dialog" aria-expanded={picker} onClick={() => setPicker(!picker)}>
      Add
    </button>
  );
  return (
    <section class="screen roster" ref={pane} aria-labelledby="roster-title">
      <PaneHeader
        id="roster-title"
        title="Members"
        count={order ? order.length : undefined}
        countLabel={order ? (order.length === 1 ? '1 member' : order.length + ' members') : undefined}
        back={{ href: hrefOf({ place: 'bridge', id: bridge, pane: 'none' }), label: 'Channel', to: 'main' }}
        actions={isOpen && addButton}
      />
      {picker && <Picker bridge={bridge} drafts={drafts.map((d) => d.agent)} draftHandles={drafts.map((d) => d.handle)} onPick={pick} onClose={closePicker} anchor={addKey} below={below} />}
      {drafts.length > 0 && (
        <ul class="members drafts" ref={draftBox}>
          {drafts.map((d) => (
            <SeatRow
              key={'draft-' + d.id}
              bridge={bridge}
              d={d}
              taken={taken.filter((h) => h !== d.handle)}
              onChange={(n) => setDrafts((ds) => ds.map((x) => (x.id === n.id ? n : x)))}
              onDone={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
            />
          ))}
        </ul>
      )}
      <div class="scroll">
        {order && order.length > 0 && (
          <ul class="members" ref={list}>
            {order.map((h) => (
              <MemberRow key={h} bridge={bridge} handle={h} onAsk={setAsk} current={h === current} />
            ))}
          </ul>
        )}
        {!order && <Empty>Loading the members.</Empty>}
        {order && order.length === 0 && drafts.length === 0 && (
          <div class="empty">
            <p>No one has a seat yet.</p>
            {isOpen && (
              <Button size="s" onClick={() => setPicker(true)}>
                Add
              </Button>
            )}
          </div>
        )}
      </div>
      <BridgeFoot bridge={bridge} />
      {ask && ask.kind === 'fire' && (
        <Confirm
          title={'Fire ' + ask.m.handle + '?'}
          confirm={'Fire ' + ask.m.handle}
          danger
          busy={busy}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            setBusy(true);
            const ok = await attempt(() => fire(bridge, ask.m.handle));
            setBusy(false);
            if (ok) setAsk(null);
          }}
        >
          <p>Its open runs stop, and it gets no more messages.</p>
        </Confirm>
      )}
      {ask && ask.kind === 'task' && <NewTask bridge={bridge} m={ask.m} onClose={() => setAsk(null)} />}
      {ask && ask.kind === 'seat' && <NewTask bridge={bridge} m={ask.m} seat onClose={() => setAsk(null)} />}
    </section>
  );
}
