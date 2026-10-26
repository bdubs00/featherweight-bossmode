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
import { ApiError } from '../api/client';
import type { Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { attempt } from './notice';
import { Confirm, Menu } from './common';
import { Field, Input } from './primitives';
import { ago, since } from '../lib/words';
import { CHAT_VIEW, chatStatus, chatTitle, findChats, historyGroups, newestFirst } from '../lib/chat';
import { useRoving } from './keys';
import { Find, GrooveBand, Led, buttonClass } from './primitives';

/** The batch of a run that a bridge starts begins with this, as bridges.BatchPrefix of the workbench. */
export const BRIDGE_BATCH = 'bridge:';

/** The metadata key of a run that the front starts for itself, as fleet.MetaInternal of the workbench. */
export const INTERNAL_KEY = 'workbench.internal';

/** The metadata key of a run in which the manager decides for a duty, as away.MetaVerdict of the workbench. */
export const VERDICT_KEY = 'workbench.dutyVerdict';

/**
 * internalRun reports whether the front started a run for itself, such as
 * the run in which the manager decides an approval for a duty. Such a run
 * is no conversation of a person. The front marks it in its metadata. A
 * run that lost its metadata, as a run of the archive can, still shows the
 * title and the first words that the front gives a decision of a duty.
 */
export function internalRun(r: Pick<Run, 'metadata' | 'title' | 'input'>): boolean {
  const m = r.metadata || {};
  if (m[INTERNAL_KEY] || m[VERDICT_KEY]) return true;
  return (r.title || '').startsWith('Decide for the duty ') && (r.input || '').startsWith('You decide one approval for the duty ');
}

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
      return !r.hidden && !(m['fw.batch'] || '').startsWith(BRIDGE_BATCH) && !internalRun(r) && m[CHAT_VIEW.key] !== CHAT_VIEW.value;
    }),
  );
}

/** The most characters of the title that a person gives a conversation, as the server takes it. */
export const MAX_TITLE = 100;

/** The sentence of a server that has no route for the titles and the hiding of conversations yet. */
export const NO_PATCH = 'This server cannot rename or delete a conversation yet.';

/**
 * patchConversation renames a conversation or deletes it from the lists
 * of the person, and keeps the change in the store, so every list and
 * head shows it at once. A server without the route answers 404 or 405,
 * which reads as NO_PATCH.
 */
export async function patchConversation(r: Run, change: { title?: string; hidden?: boolean }): Promise<void> {
  try {
    await api.patchConversation(r.id, change);
  } catch (e) {
    // A server without the route answers 405, or a 404 of its router, with no problem of its own.
    const detail = e instanceof ApiError && e.problem && typeof e.problem.detail === 'string' ? e.problem.detail.trim() : '';
    if (e instanceof ApiError && (e.status === 405 || (e.status === 404 && (!detail || /^(404 )?page not found|^no route/i.test(detail))))) throw new Error(NO_PATCH);
    throw e;
  }
  const cur = store.get().runs[r.id] || r;
  const next: Run = { ...cur };
  if (change.title !== undefined) next.myTitle = change.title.trim();
  if (change.hidden !== undefined) next.hidden = change.hidden;
  store.dispatch({ type: 'run', run: next });
}

/**
 * ConversationMenu is the menu of a row of a list of conversations:
 * Rename, which takes one line of at most 100 characters, and Delete,
 * which asks first. Delete takes the conversation off the lists of the
 * person alone: the agent keeps no copy, and the archive of the server
 * keeps it. onHidden tells the list that the row went.
 */
export function ConversationMenu({ r, onHidden }: { r: Run; onHidden?: (r: Run) => void }) {
  const [ask, setAsk] = useState<'' | 'rename' | 'delete'>('');
  const [busy, setBusy] = useState(false);
  const title = chatTitle(r);
  const [name, setName] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ask !== 'rename') return;
    setName(title);
    // The dialog gives the focus to Cancel when it opens, so the field takes it a moment later.
    requestAnimationFrame(() => {
      if (field.current) {
        field.current.focus();
        field.current.select();
      }
    });
  }, [ask]);
  const rename = async () => {
    setBusy(true);
    const ok = await attempt(() => patchConversation(r, { title: name.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) }));
    setBusy(false);
    if (ok) setAsk('');
  };
  const remove = async () => {
    setBusy(true);
    const ok = await attempt(() => patchConversation(r, { hidden: true }));
    setBusy(false);
    setAsk('');
    if (ok && onHidden) onHidden(r);
  };
  return (
    <>
      <Menu
        label={'More for ' + title}
        items={[
          { label: 'Rename', onSelect: () => setAsk('rename') },
          { label: 'Delete', danger: true, onSelect: () => setAsk('delete') },
        ]}
      />
      {ask === 'rename' && (
        <Confirm title="Rename the conversation" confirm="Rename" busy={busy} onCancel={() => setAsk('')} onConfirm={rename}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rename();
            }}
          >
            <Field label="Name">
              <Input ref={field} value={name} maxLength={MAX_TITLE} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            </Field>
          </form>
          <p class="t-meta">An empty name gives it back the first words of the conversation.</p>
        </Confirm>
      )}
      {ask === 'delete' && (
        <Confirm title={'Delete ' + title + '?'} confirm="Delete" danger busy={busy} onCancel={() => setAsk('')} onConfirm={remove}>
          <p>It leaves your lists. The agent keeps no copy of it, and the archive of the server keeps it.</p>
        </Confirm>
      )}
    </>
  );
}

function PastRow({ r, on, onPick }: { r: Run; on: boolean; onPick: (r: Run) => void }) {
  const light = chatStatus(r);
  const title = chatTitle(r);
  const d = new Date(r.createdAt);
  return (
    <button
      type="button"
      class={'brow chat-row past-row' + (on ? ' sel strong' : '') + (r.archived ? ' closed' : '')}
      data-item
      aria-current={on ? 'true' : undefined}
      aria-label={title + ', ' + light.word + ', ' + ago(r.createdAt) + (on ? ', open now' : '')}
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
export function PastConversations({ agent, label, current, onPick, onClose, onHidden }: { agent: string; label?: string; current: string; onPick: (r: Run) => void; onClose: () => void; onHidden?: (r: Run) => void }) {
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

  // A rename or a delete changes the run in the store, so the rows follow the store.
  const inStore = useSelect((s) => s.runs);
  const mine = useMemo(() => (runs || []).map((r) => (inStore[r.id] ? { ...r, myTitle: inStore[r.id].myTitle, hidden: inStore[r.id].hidden } : r)).filter((r) => !r.hidden), [runs, inStore]);
  const shown = useMemo(() => findChats(mine, q), [mine, q]);
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
                  <div role="listitem" class="chat-item">
                    <PastRow r={r} on={r.id === current} onPick={onPick} />
                    <ConversationMenu
                      r={r}
                      onHidden={(x) => {
                        setRuns((old) => (old ? old.filter((y) => y.id !== x.id) : old));
                        if (onHidden) onHidden(x);
                      }}
                    />
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
          {runs && mine.length === 0 && <p class="people-note">No conversation with {who} yet.</p>}
          {runs && mine.length > 0 && shown.length === 0 && <p class="people-note">No conversation holds those words.</p>}
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
