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
import type { AttachedFile, Attachment, Result } from '../api/types';
import { store, useSelect } from '../state/store';
import { askManager, ended, loadAgentSkills, loadManagerChats, setManagerRun } from '../state/actions';
import { managerRunOf } from '../state/reducer';
import { slashCommands } from '../state/people';
import { parseSlash } from '../lib/mention';
import { attempt, showError } from './notice';
import { NO_FILES_WITH_COMMAND, describeFiles, refusalOf } from '../lib/attachments';
import { AttachedFiles } from './AttachedFiles';
import { Avatar, Menu } from './common';
import { go } from '../lib/route';
import { askOfRun } from '../lib/duties';
import { Help, Led, Mark, PaneHeader } from './primitives';
import { conversationsOf } from './History';
import { HistoryList, type HistoryWords } from './Chat';
import { chatTitle } from '../lib/chat';
import { hrefOf } from '../lib/route';
import { Composer } from './Composer';
import { Conversation, POLL_MS, usePoll, useTranscript } from './Conversation';
import { FollowBox, Msg, Quiet } from './Thread';
import { useLiveAnswer } from './Live';
import { answerSeqs, lastSeq, works } from '../lib/chat';

export { POLL_MS };

function NoManager() {
  return (
    <section class="screen manager" aria-labelledby="manager-title">
      <PaneHeader id="manager-title" title="Manager" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
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
  if (!agent) return null;
  const current = run || (fresh ? '' : picked);
  return <HistoryList id="manager-list-title" words={MANAGER_WORDS} runs={list} loaded={loaded} current={current} hrefFor={(r) => hrefOf({ place: 'manager', run: r.id })} newHref={hrefOf({ place: 'manager', fresh: true })} />;
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
    else if (fresh) setManagerRun('');
  }, [routeRun, fresh]);
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const skills = useSelect((s) => (s.skills ? s.skills.skills : null));
  const loadable = useSelect((s) => (agent ? s.agentSkills[agent] : undefined));
  const [sent, setSent] = useState<{ text: string; run: string; users: number; files: AttachedFile[] } | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    if (agent) loadAgentSkills(agent).catch(() => {});
  }, [agent]);

  const stopped = !!run && ended(run.state);
  const t = useTranscript(runId);
  // The poll runs while the run works, and while an answer to the person is on its way.
  usePoll(runId, !!runId && (!!sent || !run));
  const userCount = useMemo(() => t.items.filter((x) => x.kind === 'user').length, [t.items]);
  const answers = useMemo(() => answerSeqs(t.items), [t.items]);

  // The sent text shows until the transcript holds a new message of the person.
  useEffect(() => {
    if (sent && (sent.run === runId ? userCount > sent.users : userCount > 0)) setSent(null);
  }, [userCount, runId]);

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
  // The end of the conversation: its newest item, the sent text, the live answer, and a card that waits.
  const end = [t.items.length ? t.items[t.items.length - 1].seq : 0, sent ? 1 : 0, live.text.length, live.tool || '', pendingId].join(':');

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
        const id = await askManager(text, files).catch((e) => {
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
      {waiting && !live.text && !live.tool && (
        <div role="status">
          <Msg face={<Mark agent={agent} size={32} />} name={agent}>
            <p class="tmsg-status">
              {waking ? <Led tone="grey" word="waking" label="Waking the manager" /> : <Led tone="green" word="working" />}
              {!waking && run && run.activity && run.activity.phrase && <span>{run.activity.phrase}</span>}
            </p>
          </Msg>
        </div>
      )}
      {stopped && <Quiet tone="grey">Stopped. Your next message starts a new conversation.</Quiet>}
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
            <Menu label="More" items={[{ label: 'Make this a duty', onSelect: () => go({ place: 'duties', fresh: true, seed: { agent, act: 'manager', message: askOfRun(run, t.items) } }) }]} />
          ) : undefined
        }
      />
      <FollowBox end={end}>
        {!runId && !sent ? <p class="thread-empty">Ask about the fleet, or ask for a bridge.</p> : <Conversation run={run} result={res} t={t} agentLabel={agent} tail={tail} live={live} />}
      </FollowBox>
      <Composer draft="manager" label="Message to the manager" placeholder="Ask the manager" commands={commands} attach onSend={(text, _to, files) => send(text, files)} />
    </section>
  );
}
