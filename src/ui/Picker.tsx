// The picker of Add: one field, Who, and the agents in two groups, On this
// bridge and Everyone else. Each agent shows its mark, its tagline, and its
// workers: N free with a green light, or waiting for a worker with a grey
// one. A click puts a new seat row at the top of the members, and the
// picker stays open for another add. Advanced opens the full form, and New
// agent opens the screen that makes one.
//
// The picker is a layer over the members pane, or below the key Add of the
// new-bridge screen, for a bridge that does not exist yet. There the seats
// of the form are the agents on this bridge, and the form holds its own
// Advanced. Escape and a click outside close it, and the focus goes back to
// the key Add.

import type { JSX, RefObject } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { store, useSelect } from '../state/store';
import { addMember, loadAgents, loadFleet } from '../state/actions';
import { selectAgents } from '../state/agents';
import { membersOf, selectFacts } from '../state/reducer';
import { nextHandle } from '../lib/handles';
import { attempt } from './notice';
import { freeWords, pickGroups, seatReason, taskOfGoal, type PickRow } from './seats';
import { Button, Field, Find, GrooveBand, Input, Led, Mark, TextArea } from './primitives';

export interface PickerProps {
  /** The bridge of the seats, or "" for a bridge that the new-bridge screen opens. */
  bridge: string;
  /** The agents of the new seats that wait in the members pane. */
  drafts: string[];
  /** The handles that the new seats hold, so a new handle never meets one. */
  draftHandles: string[];
  onPick: (agent: string) => void;
  onClose: () => void;
  /** The key Add, which takes the focus back when the picker closes. */
  anchor: RefObject<HTMLElement>;
  /** The height of the new seat rows, which the picker sits below. */
  below?: number;
  /** pane: a layer at the top of the members pane. key: a layer below the key Add. */
  place?: 'pane' | 'key';
}

/**
 * Row is one agent of the picker. The name stays on one line. Where the
 * name and the word of the workers do not fit side by side, the status
 * shrinks to its light, and the word goes to the tooltip and the
 * accessible name.
 */
function Row({ r, onPick }: { r: PickRow; onPick: (agent: string) => void }) {
  const word = r.free >= 0 ? freeWords(r.free) : '';
  const name = useRef<HTMLSpanElement>(null);
  // The word for which the row has no room. A new word measures again.
  const [tightFor, setTightFor] = useState('');
  const tight = !!word && tightFor === word;
  useLayoutEffect(() => {
    const el = name.current;
    if (!el || !word || tight) return;
    if (el.scrollWidth > el.clientWidth + 1) setTightFor(word);
  }, [word, r.name, tight]);
  return (
    <button type="button" class="pick-row" data-pick onClick={() => onPick(r.agent)}>
      <Mark agent={r.agent} size={32} />
      <span class="pick-text">
        <span class="pick-name" ref={name}>
          {r.name}
        </span>
        <span class="pick-tag">{r.tagline}</span>
      </span>
      {word && <Led tone={r.free > 0 ? 'green' : 'grey'} word={word} quiet={tight} />}
    </button>
  );
}

/** Advanced is the full form of a seat: the handle, the agent, and the task. */
function Advanced({ bridge, agents, taken, onDone }: { bridge: string; agents: PickRow[]; taken: string[]; onDone: () => void }) {
  const goal = useSelect((s) => (s.bridges.byId[bridge] ? s.bridges.byId[bridge].goal : ''));
  const title = useSelect((s) => (s.bridges.byId[bridge] ? s.bridges.byId[bridge].title : ''));
  const [agent, setAgent] = useState(agents.length ? agents[0].agent : '');
  const [handle, setHandle] = useState(() => (agent ? nextHandle(agent, taken) : ''));
  const [edited, setEdited] = useState(false);
  const [task, setTask] = useState(() => taskOfGoal(goal, title));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (first.current) first.current.focus();
  }, []);
  const reason = seatReason(handle.trim(), taken);
  const submit = async (e: Event) => {
    e.preventDefault();
    setTried(true);
    if (reason || !agent || !task.trim()) return;
    setBusy(true);
    const ok = await attempt(() => addMember(bridge, { handle: handle.trim(), agent, task: task.trim() }));
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <form class="pick-form" onSubmit={submit} noValidate>
      <Field label="Handle" error={tried || edited ? reason : ''}>
        <Input
          ref={first}
          value={handle}
          maxLength={32}
          invalid={!!((tried || edited) && reason)}
          onInput={(e) => {
            setHandle((e.target as HTMLInputElement).value);
            setEdited(true);
          }}
        />
      </Field>
      <Field label="Agent">
        <select
          class="recess"
          value={agent}
          onChange={(e) => {
            const a = (e.target as HTMLSelectElement).value;
            setAgent(a);
            if (!edited) setHandle(nextHandle(a, taken));
          }}
        >
          {agents.map((r) => (
            <option value={r.agent}>{r.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Task">
        <TextArea rows={3} value={task} invalid={tried && !task.trim()} onInput={(e) => setTask((e.target as HTMLTextAreaElement).value)} />
      </Field>
      <div class="card-actions">
        <Button size="s" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="s" kind="primary" disabled={busy}>
          Seat
        </Button>
      </div>
    </form>
  );
}

export function Picker({ bridge, drafts, draftHandles, onPick, onClose, anchor, below = 0, place = 'pane' }: PickerProps) {
  const agents = useSelect(selectAgents);
  const faces = useSelect((s) => s.faces);
  const roster = useSelect((s) => s.rosters[bridge]);
  const facts = useSelect((s) => (s.fleet ? selectFacts(s) : null));
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'list' | 'advanced'>('list');
  const panel = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // A bridge that does not exist yet has the seats of the form.
  const seats = useMemo(() => (bridge ? membersOf(roster) : drafts.map((agent) => ({ agent, fired: false }))), [bridge, roster, drafts]);
  // The manager and the agent of the quick chat are no workers for a bridge.
  const skipKey = useSelect((s) => [s.config && s.config.manager ? s.config.manager.agent : '', s.config && s.config.chat ? s.config.chat.agent : ''].filter(Boolean).join('\n'));
  const skip = useMemo(() => (skipKey ? skipKey.split('\n') : []), [skipKey]);
  const groups = useMemo(() => pickGroups(agents || [], faces, seats, facts, query, drafts, skip), [agents, faces, seats, facts, query, drafts, skip]);
  const taken = useMemo(() => [...membersOf(roster).map((m) => m.handle), ...draftHandles], [roster, draftHandles]);
  const all = useMemo(() => pickGroups(agents || [], faces, seats, facts, '', drafts, skip), [agents, faces, seats, facts, drafts, skip]);

  useEffect(() => {
    // The agents come from the fleet and from the profiles of the front.
    const s = store.get();
    if (!s.agents) attempt(loadAgents);
    if (!s.fleet) loadFleet().catch(() => {});
    if (field.current) field.current.focus();
  }, []);

  // Below a key, the layer takes the height below it, at least 240 pixels,
  // and scrolls into view when the window has less. A new seat moves the key.
  const [fit, setFit] = useState(0);
  useLayoutEffect(() => {
    if (place !== 'key' || !panel.current) return;
    const top = panel.current.getBoundingClientRect().top;
    const room = Math.floor(window.innerHeight - top - 16);
    setFit(Math.max(240, Math.min(420, room)));
    if (room < 240 && typeof panel.current.scrollIntoView === 'function') panel.current.scrollIntoView({ block: 'nearest' });
  }, [place, drafts.length]);

  // A click outside the picker and the key Add closes it.
  useEffect(() => {
    const away = (e: Event) => {
      const t = e.target as Node;
      if (panel.current && panel.current.contains(t)) return;
      if (anchor.current && anchor.current.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [onClose]);

  const close = () => {
    onClose();
    if (anchor.current) anchor.current.focus();
  };

  // Escape closes. The arrows move between the field and the rows.
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (mode !== 'list' || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    const rows = [...(panel.current ? panel.current.querySelectorAll<HTMLElement>('[data-pick]') : [])];
    if (rows.length === 0) return;
    const i = rows.indexOf(document.activeElement as HTMLElement);
    e.preventDefault();
    if (e.key === 'ArrowDown') rows[i < 0 ? 0 : Math.min(i + 1, rows.length - 1)].focus();
    else if (i <= 0) field.current && field.current.focus();
    else rows[i - 1].focus();
  };

  const none = groups.here.length === 0 && groups.others.length === 0;
  return (
    <div
      class={'picker' + (place === 'key' ? ' picker-key' : '')}
      role="dialog"
      aria-label="Add"
      ref={panel}
      onKeyDown={onKey}
      style={below && place === 'pane' ? { top: `calc(var(--h-header) + var(--groove) + ${below + 2}px)`, maxHeight: `calc(100% - var(--h-header) - var(--groove) - ${below + 18}px)` } : place === 'key' && fit ? { maxHeight: fit + 'px' } : undefined}
    >
      <GrooveBand on="card" />
      {mode === 'list' ? (
        <>
          <div class="pick-search">
            <Find
              label="Who"
              placeholder="Who?"
              size="m"
              inputRef={field}
              value={query}
              onInput={setQuery}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const r = groups.here[0] || groups.others[0];
                  if (r) onPick(r.agent);
                }
              }}
            />
          </div>
          <div class="pick-list">
            {groups.here.length > 0 && (
              <div role="group" aria-labelledby="pick-here">
                <div class="pick-group" id="pick-here">
                  On this bridge
                </div>
                {groups.here.map((r) => (
                  <Row r={r} onPick={onPick} />
                ))}
              </div>
            )}
            {groups.others.length > 0 && (
              <div role="group" aria-labelledby="pick-others">
                <div class="pick-group" id="pick-others">
                  Everyone else
                </div>
                {groups.others.map((r) => (
                  <Row r={r} onPick={onPick} />
                ))}
              </div>
            )}
            {none && agents && <div class="pick-none" />}
          </div>
          <div class="pick-foot">
            {bridge ? (
              <button type="button" class="pick-link" onClick={() => setMode('advanced')}>
                Advanced
              </button>
            ) : (
              <span />
            )}
            <a class="pick-link" href="#new-agent">
              New agent
            </a>
          </div>
        </>
      ) : (
        <Advanced bridge={bridge} agents={[...all.here, ...all.others]} taken={taken} onDone={() => setMode('list')} />
      )}
    </div>
  );
}
