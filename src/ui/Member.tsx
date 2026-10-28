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
// A seat whose newest run failed or stopped shows a bar over the composer:
// the status, the plain line of the failure, and the key Seat again, which
// starts the seat anew with its task in one click.
//
// The screen belongs to the place that opened it. From a bridge or from
// Activity, Back goes to the members of the bridge. From the Fleet place,
// Back goes to the Fleet list, as before.
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
import { directEntries, foldNaps, stepsOf, threadOf, withLive } from '../state/thread';
import { attempt, showError } from './notice';
import { NO_FILES_WITH_COMMAND, refusalOf } from '../lib/attachments';
import { Confirm, Menu, type MenuItem } from './common';
import { Composer } from './Composer';
import { useTranscript } from './Conversation';
import { FilesView, RunView, failureOf, filesCount, useResult } from './RunPane';
import { SeatAgainKey, continueSeat, seatAgain } from './SeatAgain';
import { muteItem } from './Roster';
import { FollowBox, ThreadView } from './Thread';
import { LiveLines, useLiveAnswer } from './Live';
import { Typing, typingPhrase } from './Typing';
import { works } from '../lib/chat';
import { Profile } from './Profile';
import { ProfileLink, rememberOpen } from './Fleet';
import { Button, Field, Led, PaneHeader, Tabs, TextArea } from './primitives';

/* ---------- the place that opened the seat ---------- */

let from: 'bridges' | 'fleet' = 'bridges';

/** setMemberFrom notes the place that opened the conversation of a seat. The shell calls it when the route moves to a seat. */
export function setMemberFrom(place: 'bridges' | 'fleet'): void {
  from = place;
}

/** memberFrom is the place that opened the conversation of a seat: bridges, unless the Fleet place opened it. */
export function memberFrom(): 'bridges' | 'fleet' {
  return from;
}

/** backTo is the way back from the conversation of a seat: the members of its bridge, or the Fleet list. */
function backTo(bridge: string, title: string): { href: string; label: string; to: 'list' } {
  if (from === 'fleet') return { href: '#fleet', label: 'Fleet', to: 'list' };
  return { href: hrefOf({ place: 'bridge', id: bridge, pane: 'roster' }), label: 'the members of ' + (title || 'the bridge'), to: 'list' };
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

/**
 * useStopped reports how the newest run of a seat stopped: failed,
 * stopped, limit for a run at a limit of its budget, not-started for a
 * seat that the manager never seated, or "" when it takes messages.
 */
function useStopped(m: MemberT | undefined): '' | 'failed' | 'stopped' | 'limit' | 'not-started' {
  const state = useSelect((s) => (m && s.runs[newestRun(m)] ? s.runs[newestRun(m)].state : ''));
  const presence = useSelect((s) => (m ? seatPresence(selectFacts(s), m) : ''));
  if (!m || m.fired) return '';
  if (presence === 'not-started') return 'not-started';
  if (presence === 'limit') return 'limit';
  if (state === 'canceled') return 'stopped';
  if (state === 'failed' || presence === 'error') return 'failed';
  return '';
}

/**
 * TaskDialog changes the task of a seat, and a new run starts with it.
 * Seat again needs no dialog: SeatAgainKey sends the task unchanged in one
 * click.
 */
export function TaskDialog({ bridge, m, onClose }: { bridge: string; m: MemberT; onClose: () => void }) {
  const [task, setTask] = useState(m.task);
  const [busy, setBusy] = useState(false);
  // The field takes the focus, so the person types the new task at once.
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (field.current) field.current.focus();
  }, []);
  return (
    <Confirm
      title={'Change the task of ' + m.handle}
      confirm="Change task"
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
        <TextArea ref={field} rows={3} value={task} onInput={(e) => setTask((e.target as HTMLTextAreaElement).value)} />
      </Field>
    </Confirm>
  );
}

/**
 * SeatMenu is the More key of the header: Profile, which a narrow window
 * reaches only here, Mute, Seat again, Change task, and Fire. Seat again
 * acts at once, as its key does.
 */
function SeatMenu({ bridge, m, stopped, closed }: { bridge: string; m: MemberT; stopped: '' | 'failed' | 'stopped' | 'limit' | 'not-started'; closed: boolean }) {
  const [dialog, setDialog] = useState<'' | 'task' | 'fire'>('');
  if (m.fired) return null;
  const profile: MenuItem = { label: 'Profile', onSelect: () => go({ place: 'member', bridge, handle: m.handle, tab: 'chat', profile: true }) };
  // A closed bridge takes no change, so its seat offers the profile alone.
  const items: MenuItem[] = closed
    ? [profile]
    : [
        profile,
        muteItem(bridge, m),
        ...(stopped === 'limit' ? [{ label: 'Continue', onSelect: () => continueSeat(bridge, m) }] : []),
        ...(stopped ? [{ label: 'Seat again', onSelect: () => seatAgain(bridge, m) }] : []),
        { label: 'Change task', onSelect: () => setDialog('task') },
        { label: 'Fire', danger: true, onSelect: () => setDialog('fire') },
      ];
  return (
    <>
      <Menu label={'More for ' + m.handle} kind="secondary" items={items} />
      {dialog === 'task' && <TaskDialog bridge={bridge} m={m} onClose={() => setDialog('')} />}
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

/**
 * SeatBar sits over the composer of a seat whose newest run stopped, or
 * that never started: the status, the plain line of the failure with the
 * message of the provider in its tooltip, and Seat again, or Continue for
 * a seat at its limit.
 */
function SeatBar({ bridge, m, how, reason, said }: { bridge: string; m: MemberT; how: 'failed' | 'stopped' | 'limit' | 'not-started'; reason: string; said: string }) {
  const why = how === 'failed' || how === 'limit';
  return (
    <div class="seat-bar">
      {how === 'failed' ? <Led tone="red" word="error" /> : <Led tone="grey" word={how === 'not-started' ? 'not started' : how === 'limit' ? 'at its limit' : 'stopped'} />}
      {/* A stopped seat says it in its status, so only a failure and a limit, which names its limit, have a line. */}
      <span class="seat-bar-why" title={why ? said || reason || undefined : undefined}>
        {why ? reason : ''}
      </span>
      <SeatAgainKey bridge={bridge} m={m} />
    </div>
  );
}

/** Chat is the direct thread of a seat and its composer. */
function Chat({ bridge, m, items, closed, stopped, reason, said }: { bridge: string; m: MemberT; items: ReturnType<typeof useTranscript>['items']; closed: boolean; stopped: '' | 'failed' | 'stopped' | 'limit' | 'not-started'; reason: string; said: string }) {
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
  // The end of the conversation: its newest row, which an earlier page never changes, and the live answer.
  const last = rows.length ? rows[rows.length - 1] : null;
  const typing = working && !m.fired;
  const end = [last ? last.key : '', last && last.kind === 'entry' && last.entry.decision ? last.entry.decision.state : '', live.text.length, live.tool, typing ? 1 : 0].join(':');
  return (
    <>
      <FollowBox end={end} foot={typing ? <Typing who={[{ agent: m.agent, name: m.handle }]} phrase={typingPhrase(runObj, live)} /> : null}>
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
      </FollowBox>
      {stopped && <SeatBar bridge={bridge} m={m} how={stopped} reason={reason} said={said} />}
      <Composer
        draft={'member:' + bridge + '/' + m.handle}
        label={'Message to ' + m.handle}
        placeholder={'Message ' + m.handle}
        disabled={closed ? 'Closed. Reopen it to send.' : m.fired ? 'Fired. It gets no message.' : ''}
        commands={commands}
        attach
        onSend={async (text, _to, files) => {
          const skill = parseSlash(text, names);
          if (skill && files.length) {
            showError(new Error(NO_FILES_WITH_COMMAND));
            return false;
          }
          // A slash command goes as skill, and its arguments leave the text. The files go to this member alone, through the bridge.
          return attempt(() =>
            sendMessage(bridge, skill ? { text: '', to: [m.handle], skill } : files.length ? { text, to: [m.handle], files } : { text, to: [m.handle] }).catch((e) => {
              throw refusalOf(e, files.length);
            }),
          );
        }}
      />
    </>
  );
}

export function MemberMain({ bridge, handle, tab }: { bridge: string; handle: string; tab: MemberTab }) {
  // The Fleet place opens this seat again only when the Fleet place opened it.
  useEffect(() => {
    if (from === 'fleet') rememberOpen(hrefOf({ place: 'member', bridge, handle, tab: 'chat' }));
  }, [bridge, handle]);
  const { m, loaded } = useSeat(bridge, handle);
  const b = useSelect((s) => s.bridges.byId[bridge]);
  const runId = m ? newestRun(m) : '';
  const light = useSelect((s) => (m ? statusOf(selectFacts(s), { seat: m }) : null));
  const runObj = useSelect((s) => (runId ? s.runs[runId] : undefined));
  // A closed bridge seats no one again, so a stop there offers no key.
  const halted = useStopped(m);
  const stopped = b && b.state === 'closed' ? '' : halted;
  // A worker that the page knows awake can take a read. Run and Files read when the person opens them, and say so when the read wakes the worker.
  const awake = useSelect((s) => (runId ? awakeFor(selectFacts(s), s.runs[runId]) : null));
  const opened = tab === 'run' || tab === 'files';
  // No worker holds a run that the front calls gone. The archive of the
  // front still answers it, read-only, so the page reads it, and a read of
  // it wakes no worker. Only a read that answers 404 says that it is gone.
  const gone = !!(m && m.gone);
  const wakes = opened && awake === false && !gone;
  const read = gone || opened || awake === true;
  const res = useResult(runId, read);
  // Files reads the transcript too, for the pages of the wiki that the run wrote.
  const t = useTranscript(runId, read);
  const archived = !!((res && res.archived) || (runObj && runObj.archived));
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
        <PaneHeader title={handle} size="title" level={1} back={backTo(bridge, b ? b.title : '')} />
        <div class="empty">
          <p>{loaded ? handle + ' has no seat on this team, or no run yet.' : 'Loading the member.'}</p>
        </div>
      </section>
    );
  }

  const files = filesCount(res, t.items);
  const base = { place: 'member' as const, bridge, handle };
  const end = [...t.items].reverse().find((x) => x.kind === 'end');
  const fail = failureOf(runObj, res);
  return (
    <section class="screen member-main" aria-labelledby="member-title">
      <PaneHeader
        id="member-title"
        title={handle}
        size="title"
        level={1}
        headingRef={heading}
        focusable
        back={backTo(bridge, b ? b.title : '')}
        lead={<ProfileLink href={hrefOf({ ...base, tab: 'chat', profile: true })} agent={m.agent} label={handle} light={light} />}
        actions={
          <>
            <Tabs
              label={'Conversation with ' + handle}
              current={tab}
              items={[
                { id: 'chat', label: 'Chat', href: hrefOf({ ...base, tab: 'chat' }) },
                { id: 'run', label: 'Run', href: hrefOf({ ...base, tab: 'run' }) },
                { id: 'files', label: 'Files', href: hrefOf({ ...base, tab: 'files' }), count: files, countLabel: files === 1 ? '1 file' : files + ' files' },
              ]}
            />
            <SeatMenu bridge={bridge} m={m} stopped={stopped} closed={!!b && b.state === 'closed'} />
          </>
        }
      >
        {b && (
          <span class="meta clip member-where">
            in <a href={hrefOf({ place: 'bridge', id: bridge, pane: 'none' })}>{b.title}</a>
          </span>
        )}
      </PaneHeader>
      {tab === 'chat' && <Chat bridge={bridge} m={m} items={t.items} closed={!!b && b.state === 'closed'} stopped={stopped} reason={fail.line} said={fail.said} />}
      {tab === 'run' && (
        <div class="scroll">
          {runId ? <RunView runId={runId} result={res} bridge={bridge} member={m} who={handle} items={t.items} endSeq={end ? end.seq : undefined} gone={t.gone} archived={archived} wakes={wakes} /> : <p class="run-note">{handle + ' has no seat on this team, or no run yet.'}</p>}
        </div>
      )}
      {tab === 'files' && <div class="scroll">{runId && <FilesView runId={runId} result={res} items={t.items} wakes={wakes} gone={t.gone} archived={archived} />}</div>}
    </section>
  );
}

export function MemberProfile({ bridge, handle }: { bridge: string; handle: string }) {
  const { m } = useSeat(bridge, handle);
  if (!m) return null;
  return <Profile agent={m.agent} back={{ href: hrefOf({ place: 'member', bridge, handle, tab: 'chat' }), label: handle }} />;
}
