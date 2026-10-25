// The past conversations of the person with one agent outside a bridge.
// The Manager screen and the conversation with an agent of the Fleet place
// open it as a dialog, and a pick opens that conversation in the screen.
// The list comes from GET /v1/fleet/runs with the agent and the person. It
// leaves out the runs of a bridge, the runs that the front starts for
// itself, the children of a run, and the quick chats, which the Chat place
// lists. The rows take the look of the history of the Chat place: the
// title, the status, and the time, grouped by day, with a field to find
// one in a long list.

import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Run } from '../api/types';
import { useSelect } from '../state/store';
import { runStatus } from '../lib/presence';
import { since } from '../lib/words';
import { CHAT_VIEW, chatTitle, findChats, historyGroups, newestFirst } from '../lib/chat';
import { useRoving } from './keys';
import { Find, GrooveBand, Led, buttonClass } from './primitives';

/** The batch of a run that a bridge starts begins with this, as bridges.BatchPrefix of the workbench. */
export const BRIDGE_BATCH = 'bridge:';

/** The metadata key of a run that the front starts for itself, as fleet.MetaInternal of the workbench. */
export const INTERNAL_KEY = 'workbench.internal';

/** The number of conversations above which the dialog gets a field to find one. */
export const FIND_PAST_FROM = 12;

/** The most runs that the dialog reads. */
const READ_LIMIT = 200;

/**
 * conversationsOf keeps the conversations of the person with an agent: the
 * top-level runs of the agent that the person started outside a bridge,
 * newest first. me "" keeps the runs of every person.
 */
export function conversationsOf(runs: Run[], agent: string, me: string): Run[] {
  return newestFirst(
    runs.filter((r) => {
      if (r.agent !== agent || r.parent || (me && r.principal !== me)) return false;
      const m = r.metadata || {};
      return !(m['fw.batch'] || '').startsWith(BRIDGE_BATCH) && !m[INTERNAL_KEY] && m[CHAT_VIEW.key] !== CHAT_VIEW.value;
    }),
  );
}

function PastRow({ r, on, onPick }: { r: Run; on: boolean; onPick: (r: Run) => void }) {
  const light = runStatus(r);
  const title = chatTitle(r);
  const d = new Date(r.createdAt);
  return (
    <button
      type="button"
      class={'brow chat-row past-row' + (on ? ' sel strong' : '')}
      data-item
      aria-current={on ? 'true' : undefined}
      aria-label={title + ', ' + light.word + ', ' + since(r.createdAt) + (on ? ', open now' : '')}
      onClick={() => onPick(r)}
    >
      <span class="brow-top">
        <span class="brow-title clip">{title}</span>
      </span>
      <span class="brow-meta">
        <Led tone={light.tone} word={light.word} label={light.label} />
        <span class="grow" />
        {!isNaN(d.getTime()) && (
          <time dateTime={r.createdAt} title={d.toLocaleString()}>
            {since(r.createdAt)}
          </time>
        )}
      </span>
    </button>
  );
}

/**
 * PastConversations is the dialog of the past conversations with an agent.
 * current marks the conversation that the screen shows. A pick hands the
 * run to onPick, and the screen opens it. Escape and Close close the dialog,
 * and the focus goes back to the key that opened it.
 */
export function PastConversations({ agent, label, current, onPick, onClose }: { agent: string; label?: string; current: string; onPick: (r: Run) => void; onClose: () => void }) {
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDialogElement>(null);
  const back = useRef<Element | null>(null);
  const titleId = 'past-' + useId();
  const list = useRoving<HTMLDivElement>();

  useEffect(() => {
    let live = true;
    api
      .fleetRuns({ agent, principal: me, limit: READ_LIMIT })
      .then((rs) => live && setRuns(conversationsOf(rs, agent, me)))
      .catch((e: Error) => live && setError(e.message || 'The workbench did not answer. Try again.'));
    return () => {
      live = false;
    };
  }, [agent, me]);

  useEffect(() => {
    back.current = document.activeElement;
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    const close = d && (d.querySelector('[data-cancel]') as HTMLElement | null);
    if (close) close.focus();
    return () => {
      // The dialog closes before it leaves the document, else the focus falls to the body.
      if (d && d.open) {
        if (typeof d.close === 'function') d.close();
        else d.removeAttribute('open');
      }
      const el = back.current as HTMLElement | null;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, []);

  const shown = useMemo(() => findChats(runs || [], q), [runs, q]);
  const groups = useMemo(() => historyGroups(shown), [shown]);
  const who = label || agent;

  return (
    <dialog
      ref={ref}
      class="confirm past-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <GrooveBand on="card" />
      <div class="confirm-body">
        <h2 id={titleId}>Past conversations</h2>
        <p>Your conversations with {who}, newest first. Pick one to open it.</p>
        {runs && runs.length > FIND_PAST_FROM && <Find label="Find a conversation" value={q} onInput={setQ} />}
        <div class="past-list" ref={list}>
          {groups.map((g, i) => (
            <div class="chat-day" role="group" aria-labelledby={titleId + '-d' + i}>
              <div class="people-head" id={titleId + '-d' + i}>
                <span class="people-title muted">{g.day}</span>
              </div>
              <div role="list" class="rows">
                {g.runs.map((r) => (
                  <div role="listitem">
                    <PastRow r={r} on={r.id === current} onPick={onPick} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!runs && !error && <p class="people-note">Loading the conversations.</p>}
          {error && (
            <p class="people-note" role="alert">
              {error}
            </p>
          )}
          {runs && runs.length === 0 && <p class="people-note">No conversation with {who} yet.</p>}
          {runs && runs.length > 0 && shown.length === 0 && <p class="people-note">No conversation holds those words.</p>}
        </div>
        <div class="do">
          <button type="button" class={buttonClass('secondary')} data-cancel onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </dialog>
  );
}
