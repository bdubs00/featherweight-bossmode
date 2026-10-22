// The direct conversation with one seat of a bridge, at
// #member/<bridge>/<handle>, and the profile of its agent in the details
// pane. The header holds the mark with the halo of the status, the handle,
// the bridge, the tabs Chat, Run, and Files, and the menu of the seat. Chat
// is the direct thread: the entries of the bridge from the seat or to it,
// the cards and system lines of its runs, and the quiet step lines of its
// newest run. A message goes to the seat alone, and a slash command runs a
// skill of its agent.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Member as MemberT } from '../api/types';
import { peopleApi } from '../api/people';
import type { MemberTab } from '../lib/route';
import { hrefOf } from '../lib/route';
import { store, useSelect } from '../state/store';
import { entriesOf } from '../state/reducer';
import { fire, loadBridge, loadOlder, patchMember } from '../state/actions';
import { ensureChannels, ensureRuns } from '../state/fetchers';
import { newestRun, parseSlash, seatRowLight, slashCommands } from '../state/people';
import { directEntries, stepsOf, threadOf, withLive } from '../state/thread';
import type { SlashSkill } from '../api/people';
import { attempt } from './notice';
import { Confirm } from './common';
import { Composer } from './Composer';
import { useTranscript } from './Conversation';
import { FilesView, RunView, useResult } from './RunPane';
import { ThreadView, useStickToEnd } from './Thread';
import { Profile } from './Profile';
import { rememberOpen } from './Fleet';
import { Button, Field, Led, Mark, PaneHeader, Tabs, TextArea, buttonClass } from './primitives';
import { Glyph } from './icons';

/* ---------- the live tail of an answer ---------- */

const liveTexts = new Map<string, string>();
const liveListeners = new Set<() => void>();
const tellLive = () => {
  for (const f of [...liveListeners]) f();
};

/** appendLive adds text that a live stream sends for the answer of a seat that is not finished. */
export function appendLive(bridge: string, handle: string, chunk: string): void {
  const k = bridge + '/' + handle;
  liveTexts.set(k, (liveTexts.get(k) || '') + chunk);
  tellLive();
}

/** endLive drops the live text of a seat, once its finished answer is in the channel. */
export function endLive(bridge: string, handle: string): void {
  if (liveTexts.delete(bridge + '/' + handle)) tellLive();
}

function useLive(bridge: string, handle: string): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    liveListeners.add(f);
    return () => {
      liveListeners.delete(f);
    };
  }, []);
  return liveTexts.get(bridge + '/' + handle) || '';
}

/* ---------- the seat ---------- */

function useSeat(bridge: string, handle: string) {
  const m = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].byHandle[handle] : undefined));
  const loaded = useSelect((s) => !!s.rosters[bridge]);
  // The record of the bridge holds the seat, also for a closed bridge.
  useEffect(() => {
    if (!loaded) attempt(() => loadBridge(bridge));
  }, [bridge, loaded]);
  return { m, loaded };
}

/** useStopped reports how the newest run of a seat stopped: failed, stopped, or "" when it takes messages. */
function useStopped(m: MemberT | undefined): '' | 'failed' | 'stopped' {
  const state = useSelect((s) => (m && s.runs[newestRun(m)] ? s.runs[newestRun(m)].state : ''));
  if (!m || m.fired) return '';
  if (state === 'canceled') return 'stopped';
  if (state === 'failed' || m.presence === 'error') return 'failed';
  return '';
}

/** TaskDialog seats a member again, or changes its task. Seat again sends the task also when its text stays the same. */
export function TaskDialog({ bridge, m, again, onClose }: { bridge: string; m: MemberT; again: boolean; onClose: () => void }) {
  const [task, setTask] = useState(m.task);
  const [busy, setBusy] = useState(false);
  return (
    <Confirm
      title={again ? 'Seat ' + m.handle + ' again' : 'Change the task of ' + m.handle}
      confirm={again ? 'Seat again' : 'Change task'}
      busy={busy || !task.trim()}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        const ok = await attempt(() => patchMember(bridge, m.handle, { task: task.trim() }));
        setBusy(false);
        if (ok) onClose();
      }}
    >
      <Field label="Task">
        <TextArea rows={3} value={task} onInput={(e) => setTask((e.target as HTMLTextAreaElement).value)} />
      </Field>
    </Confirm>
  );
}

/** SeatMenu is the More key of the header: Mute, Seat again, Change task, and Fire. */
function SeatMenu({ bridge, m, stopped }: { bridge: string; m: MemberT; stopped: boolean }) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'' | 'again' | 'task' | 'fire'>('');
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const first = list.current && (list.current.querySelector('button') as HTMLButtonElement | null);
    if (first) first.focus();
    const away = (e: Event) => {
      const t = e.target as Node;
      if (list.current && !list.current.contains(t) && btn.current && !btn.current.contains(t)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const pick = (f: () => void) => {
    setOpen(false);
    f();
  };
  const items: { label: string; danger?: boolean; run: () => void }[] = [];
  if (!m.fired) {
    items.push({ label: m.muted ? 'Unmute' : 'Mute', run: () => attempt(() => patchMember(bridge, m.handle, { muted: !m.muted })) });
    if (stopped) items.push({ label: 'Seat again', run: () => setDialog('again') });
    items.push({ label: 'Change task', run: () => setDialog('task') });
    items.push({ label: 'Fire', danger: true, run: () => setDialog('fire') });
  }
  if (!items.length) return null;
  return (
    <span class="pop">
      <button
        ref={btn}
        type="button"
        class={buttonClass('secondary', 's', 'key-icon')}
        aria-label={'More for ' + m.handle}
        title={'More for ' + m.handle}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Glyph name="more" size={18} />
      </button>
      {open && (
        <div
          ref={list}
          class="menu"
          role="menu"
          aria-label={'More for ' + m.handle}
          onKeyDown={(e) => {
            const all = [...(list.current ? list.current.querySelectorAll('button') : [])] as HTMLButtonElement[];
            const i = all.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              if (btn.current) btn.current.focus();
            } else if (e.key === 'ArrowDown' || e.key === 'j') {
              e.preventDefault();
              all[(i + 1) % all.length].focus();
            } else if (e.key === 'ArrowUp' || e.key === 'k') {
              e.preventDefault();
              all[(i - 1 + all.length) % all.length].focus();
            } else if (e.key === 'Tab') setOpen(false);
          }}
        >
          {items.map((it) => (
            <button type="button" role="menuitem" class={it.danger ? 'danger' : ''} onClick={() => pick(it.run)}>
              <span class="t">{it.label}</span>
            </button>
          ))}
        </div>
      )}
      {(dialog === 'again' || dialog === 'task') && <TaskDialog bridge={bridge} m={m} again={dialog === 'again'} onClose={() => setDialog('')} />}
      {dialog === 'fire' && (
        <Confirm
          title={'Fire ' + m.handle + '?'}
          confirm={'Fire ' + m.handle}
          danger
          onCancel={() => setDialog('')}
          onConfirm={async () => {
            const ok = await attempt(() => fire(bridge, m.handle));
            if (ok) setDialog('');
          }}
        >
          <p>Its open runs stop, and it gets no more messages.</p>
        </Confirm>
      )}
    </span>
  );
}

/** SeatBar sits over the composer of a seat whose newest run stopped: the status, the reason, and Seat again. */
function SeatBar({ bridge, m, how, reason }: { bridge: string; m: MemberT; how: 'failed' | 'stopped'; reason: string }) {
  const [again, setAgain] = useState(false);
  return (
    <div class="seat-bar">
      {how === 'failed' ? <Led tone="red" word="error" /> : <Led tone="grey" word="stopped" />}
      {reason && <span class="seat-bar-why clip">{reason}</span>}
      <Button size="s" onClick={() => setAgain(true)}>
        Seat again
      </Button>
      {again && <TaskDialog bridge={bridge} m={m} again onClose={() => setAgain(false)} />}
    </div>
  );
}

/** Chat is the direct thread of a seat and its composer. */
function Chat({ bridge, m, items, closed, stopped, reason }: { bridge: string; m: MemberT; items: ReturnType<typeof useTranscript>['items']; closed: boolean; stopped: '' | 'failed' | 'stopped'; reason: string }) {
  const ch = useSelect((s) => s.channels[bridge]);
  const roster = useSelect((s) => s.rosters[bridge]);
  const skills = useSelect((s) => (s.skills ? (s.skills.skills as SlashSkill[]) : null));
  const live = useLive(bridge, m.handle);
  const [busyOlder, setBusyOlder] = useState(false);
  useEffect(() => {
    ensureChannels([bridge]);
  }, [bridge]);
  const rows = useMemo(() => {
    const entries = entriesOf(ch);
    const mine = directEntries(entries, m.handle, m.runs);
    // Steps older than the loaded part of the channel wait for Earlier messages.
    const from = ch && ch.prev > 0 && entries.length ? new Date(entries[0].at).getTime() : 0;
    const steps = stepsOf(items).filter((x) => new Date(x.at).getTime() >= from);
    return withLive(threadOf(mine, steps), m.handle, live, new Date().toISOString());
  }, [ch, items, m.handle, m.runs, live]);
  const commands = useMemo(() => slashCommands(skills, m.agent), [skills, m.agent]);
  const names = useMemo(() => commands.map((c) => c.name), [commands]);
  const handles = useMemo(() => (roster ? roster.order : undefined), [roster]);
  const agentOf = (h: string) => (roster && roster.byHandle[h] ? roster.byHandle[h].agent : h === 'manager' ? (store.get().config?.manager?.agent ?? 'manager') : h.replace(/-\d+$/, ''));
  const box = useStickToEnd<HTMLDivElement>(rows.length + live.length);
  const run = newestRun(m);
  return (
    <>
      <div class="scroll thread-scroll" ref={box}>
        <div class="thread" role="log" aria-label={'Messages with ' + m.handle}>
          {ch && ch.prev > 0 && (
            <div class="tearlier">
              <Button
                size="s"
                disabled={busyOlder}
                onClick={async () => {
                  setBusyOlder(true);
                  await attempt(() => loadOlder(bridge));
                  setBusyOlder(false);
                }}
              >
                Earlier messages
              </Button>
            </div>
          )}
          {!ch && <p class="tline">Loading the conversation.</p>}
          <ThreadView rows={rows} bridge={bridge} agentOf={agentOf} handles={handles} runHref={run ? hrefOf({ place: 'member', bridge, handle: m.handle, tab: 'run' }) : undefined} />
        </div>
      </div>
      {stopped && <SeatBar bridge={bridge} m={m} how={stopped} reason={reason} />}
      <Composer
        draft={'member:' + bridge + '/' + m.handle}
        label={'Message to ' + m.handle}
        placeholder={'Message ' + m.handle}
        disabled={closed ? 'Closed. Reopen it to send.' : m.fired ? 'Fired. It gets no message.' : ''}
        commands={commands}
        onSend={async (text) => {
          const skill = parseSlash(text, names);
          return attempt(async () => {
            const e = await peopleApi.direct(bridge, m.handle, text, skill);
            if (e && typeof e.seq === 'number') store.dispatch({ type: 'entry', bridge, entry: e });
          });
        }}
      />
    </>
  );
}

export function MemberMain({ bridge, handle, tab }: { bridge: string; handle: string; tab: MemberTab }) {
  useEffect(() => rememberOpen(hrefOf({ place: 'member', bridge, handle, tab: 'chat' })), [bridge, handle]);
  const { m, loaded } = useSeat(bridge, handle);
  const b = useSelect((s) => s.bridges.byId[bridge]);
  const runId = m ? newestRun(m) : '';
  const light = useSelect((s) => (m ? seatRowLight(m, s.runs) : null));
  const stopped = useStopped(m);
  const res = useResult(runId);
  const t = useTranscript(runId);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (runId) ensureRuns([runId]);
  }, [runId]);
  useEffect(() => {
    if (heading.current && document.activeElement === document.body) heading.current.focus();
  }, [bridge, handle]);

  if (!m) {
    return (
      <section class="screen member-main">
        <PaneHeader title={handle} size="title" level={1} back={{ href: '#fleet', label: 'Fleet', to: 'list' }} />
        <div class="empty">
          <p>{loaded ? handle + ' has no seat on this bridge, or no run yet.' : 'Loading the member.'}</p>
        </div>
      </section>
    );
  }

  const files = (res && res.files) || [];
  const base = { place: 'member' as const, bridge, handle };
  const end = [...t.items].reverse().find((x) => x.kind === 'end');
  const reason = res ? (res.limits && res.limits[0]) || res.error || '' : '';
  return (
    <section class="screen member-main" aria-labelledby="member-title">
      <PaneHeader
        id="member-title"
        title={handle}
        size="title"
        level={1}
        headingRef={heading}
        focusable
        back={{ href: '#fleet', label: 'Fleet', to: 'list' }}
        lead={<Mark agent={m.agent} size={36} label={handle} halo={light ? { tone: light.tone, word: light.word } : undefined} />}
        actions={
          <>
            <Tabs
              label={'Conversation with ' + handle}
              current={tab}
              items={[
                { id: 'chat', label: 'Chat', href: hrefOf({ ...base, tab: 'chat' }) },
                { id: 'run', label: 'Run', href: hrefOf({ ...base, tab: 'run' }) },
                { id: 'files', label: 'Files', href: hrefOf({ ...base, tab: 'files' }), count: files.length, countLabel: files.length === 1 ? '1 file' : files.length + ' files' },
              ]}
            />
            <SeatMenu bridge={bridge} m={m} stopped={!!stopped} />
          </>
        }
      >
        {b && (
          <span class="meta clip member-where">
            in <a href={hrefOf({ place: 'bridge', id: bridge, pane: 'none' })}>{b.title}</a>
          </span>
        )}
      </PaneHeader>
      {tab === 'chat' && <Chat bridge={bridge} m={m} items={t.items} closed={!!b && b.state === 'closed'} stopped={stopped} reason={reason} />}
      {tab === 'run' && (
        <div class="scroll">
          {runId ? <RunView runId={runId} result={res} member={m} who={handle} endSeq={end ? end.seq : undefined} /> : <p class="run-note">{handle + ' has no seat on this bridge, or no run yet.'}</p>}
        </div>
      )}
      {tab === 'files' && <div class="scroll">{runId && <FilesView runId={runId} result={res} />}</div>}
    </section>
  );
}

export function MemberProfile({ bridge, handle }: { bridge: string; handle: string }) {
  const { m } = useSeat(bridge, handle);
  if (!m) return null;
  return <Profile agent={m.agent} />;
}
