// The roster of the open bridge: each member with its face, handle,
// presence light and word, task, and activity phrase. A click opens the run
// of the member. Fire in the menu, or a drag out of the roster, fires after
// one confirmation inside the page.

import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Member } from '../api/types';
import { useSelect } from '../state/store';
import { addMember, fire, loadAgents, patchMember } from '../state/actions';
import { presenceOf } from '../lib/presence';
import { hrefOf, go } from '../lib/route';
import { useRoving } from './keys';
import { attempt } from './notice';
import { Back, Confirm, Empty, Face, Light, Menu } from './common';
import { Icon } from './icons';

const DRAG_TYPE = 'application/x-fw-member';

type Ask = { kind: 'fire'; m: Member } | { kind: 'task'; m: Member } | { kind: 'add' } | null;

const MemberRow = memo(function MemberRow({ bridge, handle, onAsk, current }: { bridge: string; handle: string; onAsk: (a: Ask) => void; current: boolean }) {
  const m = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].byHandle[handle] : undefined));
  if (!m) return null;
  const light = presenceOf(m.presence);
  const run = m.runs[m.runs.length - 1];
  const open = () => run && go({ place: 'bridge', id: bridge, pane: 'run', run, handle: m.handle });
  return (
    <li
      class={'member' + (m.fired ? ' fired' : '') + (current ? ' sel' : '')}
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
      <button type="button" class="open" data-item onClick={open} disabled={!run} aria-label={`${m.handle}, ${light.word}. ${m.task}${m.activity && m.activity.phrase ? '. ' + m.activity.phrase : ''}. Open its run.`}>
        <Face agent={m.agent} size={40} />
        <span class="main">
          <span class="t">
            <span class="handle">{m.handle}</span>
            {m.muted && !m.fired && <span class="tag">muted</span>}
          </span>
          <Light light={light} />
          <span class="task">{m.task}</span>
          {m.activity && m.activity.phrase && m.presence === 'working' && <span class="act">{m.activity.phrase}</span>}
        </span>
      </button>
      {!m.fired && (
        <Menu
          label={'More for ' + m.handle}
          items={[
            { label: 'Open its run', onSelect: open },
            { label: m.muted ? 'Unmute' : 'Mute', hint: m.muted ? 'It gets the messages of the channel again.' : 'It gets no broadcast, only a message to it.', onSelect: () => attempt(() => patchMember(bridge, m.handle, { muted: !m.muted })) },
            { label: 'Change its task', onSelect: () => onAsk({ kind: 'task', m }) },
            { label: 'Fire', danger: true, hint: 'Its open runs stop. Its Task stays in its pool.', onSelect: () => onAsk({ kind: 'fire', m }) },
          ]}
        />
      )}
    </li>
  );
});

function AddMember({ bridge, onClose }: { bridge: string; onClose: () => void }) {
  const agents = useSelect((s) => s.agents);
  const faces = useSelect((s) => s.faces);
  const names = (agents || []).filter((a) => a.role === 'owner' || a.role === 'operator').map((a) => a.name);
  useEffect(() => {
    if (!agents) attempt(loadAgents);
  }, []);
  const [handle, setHandle] = useState('');
  const [agent, setAgent] = useState('');
  useEffect(() => {
    if (!agent && names.length) setAgent(names[0]);
  }, [names.length]);
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Confirm
      title="Add a member"
      confirm="Add and start"
      busy={busy || !handle.trim() || !agent || !task.trim()}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        const ok = await attempt(() => addMember(bridge, { handle: handle.trim(), agent, task: task.trim() }));
        setBusy(false);
        if (ok) onClose();
      }}
    >
      <label class="fld">
        <span>Handle, such as reviewer or migrator-3</span>
        <input value={handle} maxLength={32} pattern="[a-z0-9][a-z0-9._-]*" onInput={(e) => setHandle((e.target as HTMLInputElement).value)} />
      </label>
      <label class="fld">
        <span>Agent</span>
        <select value={agent} onChange={(e) => setAgent((e.target as HTMLSelectElement).value)}>
          {names.map((n) => (
            <option value={n}>{faces[n] && faces[n].displayName ? faces[n].displayName + ' (' + n + ')' : n}</option>
          ))}
        </select>
      </label>
      <label class="fld">
        <span>Task</span>
        <textarea value={task} onInput={(e) => setTask((e.target as HTMLTextAreaElement).value)} />
      </label>
      <p class="why">The member starts a run on the queue of the pool of its agent, as you.</p>
    </Confirm>
  );
}

function NewTask({ bridge, m, onClose }: { bridge: string; m: Member; onClose: () => void }) {
  const [task, setTask] = useState(m.task);
  const [busy, setBusy] = useState(false);
  return (
    <Confirm
      title={'A new task for ' + m.handle}
      confirm="Save the task"
      busy={busy || !task.trim()}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        const ok = await attempt(() => patchMember(bridge, m.handle, { task: task.trim() }));
        setBusy(false);
        if (ok) onClose();
      }}
    >
      <label class="fld">
        <span>Task</span>
        <textarea value={task} onInput={(e) => setTask((e.target as HTMLTextAreaElement).value)} />
      </label>
    </Confirm>
  );
}

export function Roster({ bridge, current }: { bridge: string; current?: string }) {
  const order = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].order : undefined));
  const b = useSelect((s) => s.bridges.byId[bridge]);
  const [ask, setAsk] = useState<Ask>(null);
  const [busy, setBusy] = useState(false);
  const list = useRoving<HTMLUListElement>();
  const pane = useRef<HTMLElement>(null);

  // A member dropped outside the roster asks to fire it.
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

  return (
    <section class="screen roster" ref={pane} aria-labelledby="roster-title">
      <header class="bar">
        <Back narrow label="Channel" href={hrefOf({ place: 'bridge', id: bridge, pane: 'none' })} />
        <div class="title">
          <h2 id="roster-title">Roster</h2>
          <p class="goal">{order ? order.length + (order.length === 1 ? ' member' : ' members') : 'Loading'}</p>
        </div>
        <div class="end">
          {b && b.state === 'open' && (
            <button type="button" class="btn small" onClick={() => setAsk({ kind: 'add' })}>
              <Icon name="plus" /> Add
            </button>
          )}
        </div>
      </header>
      <div class="scroll">
        {order && order.length > 0 ? (
          <ul class="members" ref={list}>
            {order.map((h) => (
              <MemberRow key={h} bridge={bridge} handle={h} onAsk={setAsk} current={h === current} />
            ))}
          </ul>
        ) : (
          <Empty>{order ? 'This bridge has no member.' : 'Loading the roster.'}</Empty>
        )}
        <p class="hint drag-hint">To fire a member, drag it out of the roster, or pick Fire in its menu.</p>
      </div>
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
          <p>The open runs of {ask.m.handle} in this bridge stop, and its seat gets no more messages. Its Task stays in its pool, so other bridges can still use it.</p>
        </Confirm>
      )}
      {ask && ask.kind === 'task' && <NewTask bridge={bridge} m={ask.m} onClose={() => setAsk(null)} />}
      {ask && ask.kind === 'add' && <AddMember bridge={bridge} onClose={() => setAsk(null)} />}
    </section>
  );
}
