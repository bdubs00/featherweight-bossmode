// The direct conversation with one seat of a bridge, at
// #member/<bridge>/<handle>, and the profile of its agent in the details
// pane. The header holds the mark with the halo of the status, the handle,
// the bridge, the tabs Chat, Run, and Files, and the menu of the seat. Chat
// is the direct thread: the entries of the bridge from the seat or to it,
// the cards and system lines of its runs, and the quiet step lines of its
// newest run. A message goes to the seat alone, and a slash command runs a
// skill of its agent. The tab is one-on-one, so the answer of the newest
// run streams in from its live route while the run works, and the finished
// answer of the channel takes its place.
//
// A read of a run goes to its worker and wakes a worker that sleeps. Chat
// shows what the page has from the channel and the stream, and reads the
// steps and the files of the run only while its worker is awake. Run and
// Files read the run when the person opens them, and say in place when the
// read wakes the worker.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Member as MemberT } from '../api/types';
import type { MemberTab } from '../lib/route';
import { go, hrefOf } from '../lib/route';
import { parseSlash } from '../lib/mention';
import { store, useSelect } from '../state/store';
import { entriesOf } from '../state/reducer';
import { fire, loadAgentSkills, loadBridge, loadOlder, patchMember, sendMessage } from '../state/actions';
import { ensureChannels, ensureRuns } from '../state/fetchers';
import { newestRun, slashCommands } from '../state/people';
import { selectFacts } from '../state/reducer';
import { awakeFor, seatPresence, statusOf } from '../lib/status';
import { errorReason } from '../lib/words';
import { directEntries, foldNaps, stepsOf, threadOf, withLive } from '../state/thread';
import { attempt } from './notice';
import { Confirm, Menu, type MenuItem } from './common';
import { Composer } from './Composer';
import { useTranscript } from './Conversation';
import { FilesView, RunView, useResult } from './RunPane';
import { ThreadView, useStickToEnd } from './Thread';
import { LiveLines, useLiveAnswer } from './Live';
import { works } from '../lib/chat';
import { Profile } from './Profile';
import { ProfileLink, rememberOpen } from './Fleet';
import { Button, Field, Led, PaneHeader, Tabs, TextArea } from './primitives';

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
  const presence = useSelect((s) => (m ? seatPresence(selectFacts(s), m) : ''));
  if (!m || m.fired) return '';
  if (state === 'canceled') return 'stopped';
  if (state === 'failed' || presence === 'error') return 'failed';
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

/**
 * SeatMenu is the More key of the header: Profile, which a narrow window
 * reaches only here, Mute, Seat again, Change task, and Fire.
 */
function SeatMenu({ bridge, m, stopped }: { bridge: string; m: MemberT; stopped: boolean }) {
  const [dialog, setDialog] = useState<'' | 'again' | 'task' | 'fire'>('');
  if (m.fired) return null;
  const items: MenuItem[] = [
    { label: 'Profile', onSelect: () => go({ place: 'member', bridge, handle: m.handle, tab: 'chat', profile: true }) },
    { label: m.muted ? 'Unmute' : 'Mute', onSelect: () => attempt(() => patchMember(bridge, m.handle, { muted: !m.muted })) },
    ...(stopped ? [{ label: 'Seat again', onSelect: () => setDialog('again') }] : []),
    { label: 'Change task', onSelect: () => setDialog('task') },
    { label: 'Fire', danger: true, onSelect: () => setDialog('fire') },
  ];
  return (
    <>
      <Menu label={'More for ' + m.handle} kind="secondary" items={items} />
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
    </>
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
  const skills = useSelect((s) => (s.skills ? s.skills.skills : null));
  const loadable = useSelect((s) => s.agentSkills[m.agent]);
  const run = newestRun(m);
  const runObj = useSelect((s) => (run ? s.runs[run] : undefined));
  const presence = useSelect((s) => seatPresence(selectFacts(s), m));
  useEffect(() => {
    loadAgentSkills(m.agent).catch(() => {});
  }, [m.agent]);
  const [busyOlder, setBusyOlder] = useState(false);
  useEffect(() => {
    ensureChannels([bridge]);
  }, [bridge]);
  const entries = useMemo(() => entriesOf(ch), [ch]);
  // The finished answers of the seat are its entries in the channel. The live answer waits for the next one.
  const answers = useMemo(() => entries.filter((e) => e.from.kind === 'agent' && e.from.handle === m.handle).map((e) => e.seq), [entries, m.handle]);
  const mark = entries.length ? entries[entries.length - 1].seq : 0;
  const working = runObj ? works(runObj) : presence === 'working';
  const live = useLiveAnswer(run, { working: working && !m.fired, seq: runObj ? runObj.seq : 0, mark, answers, dropPreamble: true });
  const rows = useMemo(() => {
    const mine = directEntries(entries, m.handle, m.runs);
    // Steps older than the loaded part of the channel wait for Earlier messages.
    const from = ch && ch.prev > 0 && entries.length ? new Date(entries[0].at).getTime() : 0;
    const steps = stepsOf(items).filter((x) => new Date(x.at).getTime() >= from);
    return withLive(foldNaps(threadOf(mine, steps)), m.handle, live.text, new Date().toISOString());
  }, [entries, items, m.handle, m.runs, live.text]);
  const commands = useMemo(() => slashCommands(skills, loadable), [skills, loadable]);
  const names = useMemo(() => commands.map((c) => c.name), [commands]);
  const handles = useMemo(() => (roster ? roster.order : undefined), [roster]);
  const agentOf = (h: string) => (roster && roster.byHandle[h] ? roster.byHandle[h].agent : h === 'manager' ? (store.get().config?.manager?.agent ?? 'manager') : h.replace(/-\d+$/, ''));
  const box = useStickToEnd<HTMLDivElement>(rows.length + live.text.length + (live.tool ? 1 : 0));
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
          <LiveLines live={live} />
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
          // A slash command goes as skill, and its arguments leave the text.
          return attempt(() => sendMessage(bridge, skill ? { text: '', to: [m.handle], skill } : { text, to: [m.handle] }));
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
  const light = useSelect((s) => (m ? statusOf(selectFacts(s), { seat: m }) : null));
  const runObj = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const stopped = useStopped(m);
  // A worker that the page knows awake can take a read. Run and Files read when the person opens them, and say so when the read wakes the worker.
  const awake = useSelect((s) => (runId ? awakeFor(selectFacts(s), s.runs[runId]) : null));
  const opened = tab === 'run' || tab === 'files';
  const wakes = opened && awake === false;
  const res = useResult(runId, opened || awake === true);
  const t = useTranscript(runId, tab === 'run' || awake === true);
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
  const reason = res ? (res.limits && res.limits[0]) || res.error || '' : errorReason(runObj);
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
        lead={<ProfileLink href={hrefOf({ ...base, tab: 'chat', profile: true })} agent={m.agent} label={handle} light={light} />}
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
          {runId ? <RunView runId={runId} result={res} member={m} who={handle} endSeq={end ? end.seq : undefined} gone={t.gone} wakes={wakes} /> : <p class="run-note">{handle + ' has no seat on this bridge, or no run yet.'}</p>}
        </div>
      )}
      {tab === 'files' && <div class="scroll">{runId && <FilesView runId={runId} result={res} wakes={wakes} />}</div>}
    </section>
  );
}

export function MemberProfile({ bridge, handle }: { bridge: string; handle: string }) {
  const { m } = useSeat(bridge, handle);
  if (!m) return null;
  return <Profile agent={m.agent} back={{ href: hrefOf({ place: 'member', bridge, handle, tab: 'chat' }), label: handle }} />;
}
