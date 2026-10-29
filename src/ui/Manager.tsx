// The conversation of the person with the manager, in the layout of the
// Chat place: the list pane holds the past conversations of the person
// with the manager, newest first, and the key New. The main pane opens the
// conversation of the address (#manager/<run>), a new one (#manager/new),
// or else the newest manager run of the caller, from GET /v1/bossmode. The first message
// starts a run on the manager Task, which sleeps between messages, so the
// status says waking until the first answer arrives. A run of the front
// sends no event on the stream, so the screen reads the run every 3 seconds
// while the conversation is open and the run works or an answer is on its
// way, and reads the new items of the transcript when the run moves. The
// thread is the conversation of a run that the member and the agent
// screens show too. A / at the start of a message opens the menu of the
// skills that the manager can load, and a slash command goes to POST
// /v1/bossmode/runs/{id}/skill. The conversation is one-on-one, so the
// answer streams in from the live route while the run works. Files go with
// a message to the workspace of the manager run, and a slash command takes
// none.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { AttachedFile, Attachment, ManagerConfig, Result, Run } from '../api/types';
import { store, useSelect } from '../state/store';
import { askManager, closed, loadAgentSkills, loadManagerChats, setManagerRun } from '../state/actions';
import { managerRunOf } from '../state/reducer';
import { slashCommands } from '../state/people';
import { parseSlash } from '../lib/mention';
import { attempt, showError } from './notice';
import { NO_FILES_WITH_COMMAND, describeFiles, refusalOf } from '../lib/attachments';
import { AttachedFiles } from './AttachedFiles';
import { Avatar, Menu } from './common';
import { go } from '../lib/route';
import { askOfRun } from '../lib/duties';
import { Help, Mark, PaneHeader } from './primitives';
import { DeletedLine, conversationsOf } from './History';
import { HistoryList, type HistoryWords } from './Chat';
import { chatTitle } from '../lib/chat';
import { hrefOf } from '../lib/route';
import { Composer } from './Composer';
import { ContinuedFrom, Conversation, POLL_MS, focusComposer, startRun, usePoll, useTranscript } from './Conversation';
import { FollowBox, Msg, Quiet } from './Thread';
import { useLiveAnswer } from './Live';
import { Typing, typingPhrase } from './Typing';
import { ARCHIVED_LINE, answerSeqs, lastSeq, works } from '../lib/chat';
import { costText } from '../lib/cost';

export { POLL_MS };

/* ---------- the answers that the person has not opened ---------- */

/** SEEN_KEY is the key under which this browser keeps the seq of each conversation with the manager that the person saw last. */
export const SEEN_KEY = 'fw.bossmode.manager.seen';

let seen: Record<string, number> | null = null;
const seenListeners = new Set<() => void>();

function seenMap(): Record<string, number> {
  if (seen) return seen;
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    seen = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch {
    seen = {};
  }
  return seen;
}

function keepSeen(next: Record<string, number>): void {
  seen = next;
  try {
    // The map keeps the newest 200 conversations, so it never grows without end.
    const ids = Object.keys(next);
    const kept = ids.length > 200 ? Object.fromEntries(ids.slice(-200).map((k) => [k, next[k]])) : next;
    localStorage.setItem(SEEN_KEY, JSON.stringify(kept));
  } catch {
    // No storage: the marks live while the page lives.
  }
  for (const f of [...seenListeners]) f();
}

/** forgetSeen drops the marks of what the person saw, for the tests. */
export function forgetSeen(): void {
  seen = null;
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // No storage.
  }
  for (const f of [...seenListeners]) f();
}

/** forgetSeenCache drops the copy of the marks in memory, so the next read takes them from the storage, as a new page does. For the tests. */
export function forgetSeenCache(): void {
  seen = null;
}

/** markSeen notes that the person sees a conversation as far as its seq. */
export function markSeen(r: Pick<Run, 'id' | 'seq'>): void {
  const m = seenMap();
  if (m[r.id] !== undefined && m[r.id] >= r.seq) return;
  keepSeen({ ...m, [r.id]: r.seq });
}

/** useSeen redraws a view when the marks change, and answers them. */
function useSeen(): Record<string, number> {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    seenListeners.add(f);
    return () => {
      seenListeners.delete(f);
    };
  }, []);
  return seenMap();
}

/** The states in which the manager waits for the person: an answer, or a question. */
const ANSWERED = new Set(['completed', 'input-required']);

/**
 * unreadOf names the conversations of the person with the manager whose
 * newest answer the person has not opened: the run moved past the seq
 * that the person saw last, and the manager waits for the person. A
 * conversation that the page meets for the first time counts as seen as
 * it is, so an old conversation never lights the place; firstSeen
 * receives such runs to note them.
 */
export function unreadOf(runs: Run[], agent: string, me: string, marks: Record<string, number>, firstSeen?: (r: Run) => void): Set<string> {
  const out = new Set<string>();
  for (const r of conversationsOf(runs, agent, me)) {
    const at = marks[r.id];
    if (at === undefined) {
      if (firstSeen) firstSeen(r);
      continue;
    }
    if (r.seq > at && ANSWERED.has(r.state) && !r.archived) out.add(r.id);
  }
  return out;
}

/** useManagerUnread names the conversations with an answer of the manager that the person has not opened. */
export function useManagerUnread(): Set<string> {
  const agent = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : ''));
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const runs = useSelect((s) => s.runs);
  const marks = useSeen();
  const found = useMemo(() => {
    const fresh: Run[] = [];
    const unread = agent ? unreadOf(Object.values(runs), agent, me, marks, (r) => fresh.push(r)) : new Set<string>();
    return { unread, fresh };
  }, [runs, agent, me, marks]);
  // The conversations that the page meets for the first time count as seen as they are.
  useEffect(() => {
    if (!found.fresh.length) return;
    const m = { ...seenMap() };
    for (const r of found.fresh) if (m[r.id] === undefined) m[r.id] = r.seq;
    keepSeen(m);
  }, [found]);
  return found.unread;
}

/** mainShown reports whether the person sees the main pane: two panes show side by side, or a narrow window shows the main pane, and the tab shows. */
function mainShown(): boolean {
  if (typeof document === 'undefined' || document.hidden) return false;
  const shell = document.querySelector('.shell');
  if (!shell || shell.getAttribute('data-show') === 'main') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 800px)').matches;
}

/** useMarkSeen marks the conversation that the main pane shows as seen, as far as its newest change, whenever the person can see it. */
function useMarkSeen(run: Run | undefined): void {
  const id = run ? run.id : '';
  const seq = run ? run.seq : 0;
  useEffect(() => {
    if (!id) return;
    const mark = () => {
      const r = store.get().runs[id];
      if (r && mainShown()) markSeen(r);
    };
    mark();
    // A tab that comes back, or a narrow window that moves to the main pane, shows the conversation again.
    // The shell draws the new column after the event, so the mark waits a frame.
    const later = () => requestAnimationFrame(mark);
    document.addEventListener('visibilitychange', later);
    window.addEventListener('hashchange', later);
    return () => {
      document.removeEventListener('visibilitychange', later);
      window.removeEventListener('hashchange', later);
    };
  }, [id, seq, run && run.state]);
}

/**
 * ManagerDot is the unread dot on the place Manager of the app bar, while
 * an answer of the manager waits that the person has not opened.
 */
export function ManagerDot() {
  const unread = useManagerUnread();
  // The app bar reads the conversations of the person with the manager when the page starts, so an answer that came while the page was closed lights the place.
  const agent = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : ''));
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const loaded = useSelect((s) => s.managerChats.loaded);
  useEffect(() => {
    if (agent && me && !loaded) loadManagerChats().catch(() => {});
  }, [agent, me]);
  if (unread.size === 0) return null;
  return (
    <span class="place-dot" role="status">
      <span class="sr">{unread.size === 1 ? 'The manager answered.' : 'The manager answered in ' + unread.size + ' conversations.'}</span>
    </span>
  );
}

/** continueManager starts a new conversation with the manager that takes up an archived one, and opens it. */
async function continueManager(m: ManagerConfig, runId: string, text: string, files: Attachment[]): Promise<string> {
  const r = await startRun(m.member, files.length ? { agent: m.agent, input: text, files } : { agent: m.agent, input: text }, runId);
  store.dispatch({ type: 'run', run: r });
  setManagerRun(r.id);
  return r.id;
}

function NoManager() {
  return (
    <section class="screen manager" aria-labelledby="manager-title">
      <PaneHeader id="manager-title" title="Manager" size="title" level={1} back={{ href: '#', label: 'Teams', to: 'list' }} />
      <div class="empty center">
        <p>
          No manager is set up.{' '}
          <Help label="Where the manager is set up">
            The setting <code>workbench.bossmode.manager</code> names the agent of the manager.
          </Help>
        </p>
      </div>
    </section>
  );
}

const MANAGER_WORDS: HistoryWords = {
  title: 'Manager',
  one: 'conversation',
  many: 'conversations',
  find: 'Find a conversation',
  loading: 'Loading the conversations.',
  empty: 'No conversation yet.',
  noMatch: 'No conversation holds those words.',
};

/** ManagerList is the list pane of the Manager place: the conversations of the person with the manager. */
export function ManagerList({ run, fresh }: { run?: string; fresh?: boolean }) {
  const agent = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : ''));
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const runs = useSelect((s) => s.runs);
  const loaded = useSelect((s) => s.managerChats.loaded);
  const picked = useSelect(managerRunOf);
  useEffect(() => {
    if (agent) attempt(loadManagerChats);
  }, [agent, me]);
  const list = useMemo(() => (agent ? conversationsOf(Object.values(runs), agent, me) : []), [runs, agent, me]);
  const unread = useManagerUnread();
  if (!agent) return null;
  const current = run || (fresh ? '' : picked);
  return (
    <HistoryList
      id="manager-list-title"
      words={MANAGER_WORDS}
      runs={list}
      loaded={loaded}
      current={current}
      unread={unread}
      hrefFor={(r) => hrefOf({ place: 'manager', run: r.id })}
      newHref={hrefOf({ place: 'manager', fresh: true })}
    />
  );
}

/** spendWords says what a conversation with the Manager cost so far, or that the server put no price on it. */
export function spendWords(run: Pick<Run, 'usage'>): string {
  const usd = run.usage && typeof run.usage.costUSD === 'number' ? run.usage.costUSD : null;
  if (usd === null || (usd === 0 && run.usage && run.usage.unpricedTokens)) return 'This conversation has no price yet.';
  return 'This conversation cost ' + costText(usd) + ' so far.';
}

export function Manager({ run: routeRun, fresh }: { run?: string; fresh?: boolean } = {}) {
  const config = useSelect((s) => s.config);
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const meName = useSelect((s) => (s.me && s.me.principal ? s.me.principal.name : undefined));
  const manager = config ? config.manager : null;
  const agent = manager ? manager.agent : '';
  const picked = useSelect(managerRunOf);
  // A new conversation shows nothing until its first message starts a run here.
  const [startedHere, setStartedHere] = useState('');
  const runId = routeRun || (fresh ? startedHere : picked);
  // The conversation of the address is the one that a message follows up, and a new one follows up nothing.
  useEffect(() => {
    setStartedHere('');
    if (routeRun) setManagerRun(routeRun);
    else if (fresh) {
      setManagerRun('');
      // A new conversation starts with a message, so the focus goes to the box.
      focusComposer();
    }
  }, [routeRun, fresh]);
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const skills = useSelect((s) => (s.skills ? s.skills.skills : null));
  const loadable = useSelect((s) => (agent ? s.agentSkills[agent] : undefined));
  const [sent, setSent] = useState<{ text: string; run: string; users: number; files: AttachedFile[] } | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    if (agent) loadAgentSkills(agent).catch(() => {});
  }, [agent]);

  // A conversation that failed or stopped, or whose worker was replaced, takes no message: the next one starts a new conversation.
  const stopped = closed(run);
  const archived = !!run && !!run.archived;
  const t = useTranscript(runId);
  // The poll runs while the run works, and while an answer to the person is on its way.
  usePoll(runId, !!runId && (!!sent || !run));
  const userCount = useMemo(() => t.items.filter((x) => x.kind === 'user').length, [t.items]);
  const answers = useMemo(() => answerSeqs(t.items), [t.items]);

  // The sent text shows until the transcript holds a new message of the person.
  useEffect(() => {
    if (sent && (sent.run === runId ? userCount > sent.users : userCount > 0)) setSent(null);
  }, [userCount, runId]);

  // The conversation that the screen shows is seen, as far as its newest change, while the person can see it.
  useMarkSeen(run);

  // The decision of the manager reads its label from the result.
  const pendingId = run && run.pending ? run.pending.id : '';
  useEffect(() => {
    setRes(null);
    if (!runId || !pendingId) return;
    api.result(runId).then(setRes).catch(() => {});
  }, [runId, pendingId]);

  const commands = useMemo(() => slashCommands(skills, loadable), [skills, loadable]);

  const lastUser = t.items.map((x) => x.kind).lastIndexOf('user');
  const answered = lastUser >= 0 && t.items.slice(lastUser + 1).some((x) => x.kind === 'assistant' || x.kind === 'ask' || (x.kind === 'end' && !!x.isError));
  // A run that completed waits for nothing, also when its last turn gave no answer.
  const waiting = !stopped && (!!sent || (lastUser >= 0 && !answered && !(run && run.state === 'completed'))) && !(run && run.state === 'input-required');
  const live = useLiveAnswer(runId, { working: works(run) || waiting, seq: run ? run.seq : 0, mark: lastSeq(t.items, run), answers });
  // The manager types while an answer is on its way, until the run stops or waits for the person.
  const typing = !stopped && !(run && run.state === 'input-required') && (waiting || works(run));
  // The end of the conversation: its newest item, the sent text, the live answer, a card that waits, and the typing line.
  const end = [t.items.length ? t.items[t.items.length - 1].seq : 0, sent ? 1 : 0, live.text.length, live.tool || '', pendingId, typing ? 1 : 0].join(':');

  if (!manager) return <NoManager />;
  // The Task of the manager sleeps between messages, so the first answer waits for it to wake.
  const waking = waiting && (!run || run.state === 'queued' || run.state === 'suspended') && !t.items.some((x) => x.kind === 'assistant');

  const send = async (text: string, files: Attachment[]): Promise<boolean> => {
    const slash = runId && !stopped ? parseSlash(text, commands.map((c) => c.name)) : null;
    if (slash && files.length) {
      showError(new Error(NO_FILES_WITH_COMMAND));
      return false;
    }
    setSent({ text, run: runId, users: userCount, files: describeFiles(files) });
    const ok = await attempt(async () => {
      if (slash) {
        const r = await api.runSkill(runId, slash);
        if (r && r.id) store.dispatch({ type: 'run', run: r });
      } else {
        // A message in an archived conversation takes it up in a new one, which starts with a summary of it.
        const id = await (archived && manager ? continueManager(manager, runId, text, files) : askManager(text, files)).catch((e) => {
          throw refusalOf(e, files.length);
        });
        // A new run gets its own address, so the list marks it and a reload opens it.
        if (id && id !== runId) {
          if (fresh) setStartedHere(id);
          go({ place: 'manager', run: id }, !!fresh);
        }
      }
    });
    if (!ok) setSent(null);
    return ok;
  };

  const tail = (
    <>
      {sent && (
        <Msg face={<Avatar subject={me} display={meName} size={32} />} name="You">
          {sent.text && <p class="tmsg-plain sending">{sent.text}</p>}
          <AttachedFiles files={sent.files} />
        </Msg>
      )}
      {stopped && <Quiet tone="grey">{archived ? ARCHIVED_LINE : 'Stopped. Your next message starts a new conversation.'}</Quiet>}
      {/* What the conversation cost, under its newest answer, so a person sees the price of each ask. */}
      {run && !works(run) && t.items.some((x) => x.kind === 'assistant') && <Quiet>{spendWords(run)}</Quiet>}
    </>
  );

  return (
    <section class="screen manager" aria-labelledby="manager-title">
      <PaneHeader
        id="manager-title"
        title={run ? chatTitle(run) : sent ? chatTitle({ input: sent.text || sent.files.map((f) => f.name).join(', ') }) : runId || !fresh ? 'Manager' : 'New conversation'}
        size="title"
        level={1}
        back={{ href: '#manager', label: 'Manager', to: 'list' }}
        lead={<Mark agent={agent} size={36} label={agent} />}
        actions={
          runId ? (
            // A conversation becomes a duty that asks the manager the same again.
            <Menu label="More" items={[{ label: 'Make this a job', onSelect: () => go({ place: 'duties', fresh: true, seed: { agent, act: 'manager', message: askOfRun(run, t.items) } }) }]} />
          ) : undefined
        }
      />
      <FollowBox end={end} foot={typing ? <Typing who={[{ agent, name: 'Manager' }]} phrase={waking ? 'Waking up' : typingPhrase(run, live)} /> : null}>
        {!runId && !sent ? <p class="thread-empty">Ask for work, or ask about your agents. The Manager opens a channel and puts agents on it.</p> : (
          <Conversation
            run={run}
            result={res}
            t={t}
            agentLabel="Manager"
            tail={tail}
            live={live}
            head={
              <>
                {run && run.hidden && <DeletedLine r={run} />}
                <ContinuedFrom run={run} href={(id) => hrefOf({ place: 'manager', run: id })} />
              </>
            }
          />
        )}
      </FollowBox>
      <Composer draft="manager" label="Message to the manager" placeholder="Ask the manager" commands={commands} attach onSend={(text, _to, files) => send(text, files)} />
    </section>
  );
}
