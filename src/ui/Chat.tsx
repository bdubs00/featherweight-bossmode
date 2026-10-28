// The Chat place: the quick chat of the person with the agent that the
// settings name in chat, beside the bridges. A chat is a run of that agent:
// the first message starts it with the tools and the skills that the person
// picked, a later message follows up, and a slash command runs a skill in
// it. The list pane holds the history of the person, newest first, grouped
// by day. The main pane holds the conversation, or the picks of a new chat.
// The details pane holds This chat: the tools and the skills in use, the
// model, and the usage. The chat is one-on-one, so its answer streams in.
//
// The page names no key to rename a chat or to save it as an agent: the
// backend has no route that sets the title of a run, and the new-agent
// screen takes no run to start from (docs/CONTRACT.md, section 14).

import { useEffect, useMemo, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { Agent, AttachedFile, Attachment, InlineProfile, QueuedData, QuickChat, Run, Skill } from '../api/types';
import { store, useSelect } from '../state/store';
import { forgetProfiles, useProfile } from '../state/profiles';
import { forgetQueued, useQueued } from '../state/queued';
import { closed, loadAgentSkills, loadChats, loadSkills, rereadRun } from '../state/actions';
import { slashCommands } from '../state/people';
import { atLimit, runStatus } from '../lib/presence';
import { go, hrefOf } from '../lib/route';
import { parseSlash } from '../lib/mention';
import { ago, since } from '../lib/words';
import { ARCHIVED_LINE, answerSeqs, chatStatus, chatTitle, findChats, historyGroups, isQuickChat, lastSeq, newestFirst, startBody, toolPicks, usageParts, works } from '../lib/chat';
import { abilitiesOf, joined, summaryOf, type Ability } from '../lib/tools';
import { forgetToolCatalog, useToolCatalog } from '../state/tools';
import { Abilities } from './Abilities';
import { Glyph } from './icons';
import { isOn, skillOf } from '../lib/catalog';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { AttachedFiles } from './AttachedFiles';
import { NO_FILES_WITH_COMMAND, describeFiles, refusalOf } from '../lib/attachments';
import { Composer } from './Composer';
import { ContinuedFrom, Conversation, startRun, takeUpOf, usePoll, useTranscript } from './Conversation';
import { useResult } from './RunPane';
import { FollowBox, Msg, Quiet } from './Thread';
import { useLiveAnswer } from './Live';
import { MoreRoom } from './MoreRoom';
import { Typing, typingPhrase } from './Typing';
import { Avatar, Button, Chip, Find, Help, Led, Mark, PaneHeader } from './primitives';
import { Menu } from './common';
import { ConversationMenu, DeletedLine } from './History';
import { askOfRun } from '../lib/duties';

/** The number of items of a list of picks above which it gets a field to find one. */
export const FIND_FROM = 12;

/** The picks of the chats that this tab started, so the details pane names them before the run object does. */
const picksOf = new Map<string, InlineProfile>();
/** The first message of a chat on its way, so the new conversation shows it before its transcript does. */
let firstSent: { run: string; text: string; files: AttachedFile[] } | null = null;

/** forgetChat drops what the place keeps between two visits, for the tests. */
export function forgetChat(): void {
  picksOf.clear();
  firstSent = null;
  forgetToolCatalog();
  forgetProfiles();
  forgetQueued();
}

/** useChat is the quick chat of the settings, or null when none is set up. */
function useChat(): QuickChat | null {
  return useSelect((s) => (s.config && s.config.chat && s.config.chat.agent ? s.config.chat : null));
}

const meOf = (s: ReturnType<typeof store.get>) => (s.me && s.me.principal ? s.me.principal.subject : '');

/** useAgent reads the profile of an agent: its tools and its skills. undefined while it loads, null when the page cannot read it. */
const useAgent = (name: string): Agent | null | undefined => useProfile(name);

/** useHistory is the history of the person: the runs of the list of the backend, and the quick chats that this tab started. */
function useHistory(chat: QuickChat | null): { runs: Run[]; loaded: boolean } {
  const runs = useSelect((s) => s.runs);
  const chats = useSelect((s) => s.chats);
  const me = useSelect(meOf);
  useEffect(() => {
    if (chat) attempt(loadChats);
  }, [chat && chat.agent, me]);
  const list = useMemo(() => {
    if (!chat) return [];
    const ids = new Set(chats.ids);
    return newestFirst(Object.values(runs).filter((r) => !r.hidden && (ids.has(r.id) || isQuickChat(r, chat.agent, me))));
  }, [runs, chats, chat, me]);
  return { runs: list, loaded: chats.loaded };
}

/* ---------- the empty state ---------- */

/** NoChat is the place without a quick chat in the settings. */
export function NoChat() {
  return (
    <section class="screen chat-main" aria-labelledby="chat-title">
      <PaneHeader id="chat-title" title="Chat" size="title" level={1} back={{ href: '#', label: 'Bridges', to: 'list' }} />
      <div class="empty center">
        <p>
          No quick chat is set up.{' '}
          <Help label="Where the quick chat is set up">
            The setting <code>workbench.bossmode.chat</code> names the agent of the quick chat.
          </Help>
        </p>
      </div>
    </section>
  );
}

/* ---------- the history ---------- */

/** HistoryRow is one conversation of a history list: its title, its status, and when it started. */
function HistoryRow({ r, on, href, unread }: { r: Run; on: boolean; href: string; unread?: boolean }) {
  const light = chatStatus(r);
  const title = chatTitle(r);
  const d = new Date(r.createdAt);
  return (
    <a
      class={'brow chat-row' + (on ? ' sel strong' : '') + (r.archived ? ' closed' : '') + (unread ? ' unread' : '')}
      href={href}
      data-item
      aria-current={on ? 'page' : undefined}
      aria-label={title + ', ' + (unread ? 'new answer, ' : '') + light.word + ', ' + ago(r.createdAt)}
    >
      <span class="brow-top">
        <span class="brow-title clip">{title}</span>
        {unread && <span class="unread-dot" aria-hidden="true" />}
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
    </a>
  );
}

/** The words of a history list: its title, the nouns of one and of many rows, and the lines of its states. */
export interface HistoryWords {
  title: string;
  one: string;
  many: string;
  find: string;
  loading: string;
  empty: string;
  noMatch: string;
}

/**
 * HistoryList is the list pane of a place of conversations, such as Chat
 * and Manager: the conversations of the person, newest first, grouped by
 * day, with a field to find one and the key New.
 */
export function HistoryList({
  id,
  words,
  runs,
  loaded,
  current,
  hrefFor,
  newHref,
  unread,
}: {
  id: string;
  words: HistoryWords;
  runs: Run[];
  loaded: boolean;
  current?: string;
  hrefFor: (r: Run) => string;
  newHref: string;
  /** The conversations whose newest answer the person has not opened. */
  unread?: Set<string>;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => findChats(runs, q), [runs, q]);
  const groups = useMemo(() => historyGroups(shown), [shown]);
  const list = useRoving<HTMLDivElement>();
  return (
    <section class="screen chat-list" aria-labelledby={id}>
      <PaneHeader
        id={id}
        title={words.title}
        count={loaded ? runs.length : undefined}
        countLabel={runs.length === 1 ? '1 ' + words.one : runs.length + ' ' + words.many}
        actions={
          <Button href={newHref} size="s">
            New
          </Button>
        }
      />
      <div class="list-find">
        <Find label={words.find} value={q} onInput={setQ} />
      </div>
      <div class="scroll" ref={list}>
        {groups.map((g, i) => (
          <div class="chat-day" role="group" aria-labelledby={id + '-day-' + i}>
            <div class="people-head" id={id + '-day-' + i}>
              <span class="people-title muted">{g.day}</span>
            </div>
            <div role="list" class="rows">
              {g.runs.map((r) => (
                <div role="listitem" class="chat-item">
                  <HistoryRow r={r} on={r.id === current} href={hrefFor(r)} unread={!!unread && unread.has(r.id)} />
                  <ConversationMenu r={r} onHidden={(x) => x.id === current && go(newHref)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {!loaded && runs.length === 0 && <p class="people-note">{words.loading}</p>}
        {/* The key New of the header starts a conversation, so the empty list holds no second key. */}
        {loaded && runs.length === 0 && <p class="people-note">{words.empty}</p>}
        {runs.length > 0 && shown.length === 0 && <p class="people-note">{words.noMatch}</p>}
      </div>
    </section>
  );
}

const CHAT_WORDS: HistoryWords = { title: 'Chat', one: 'chat', many: 'chats', find: 'Find a chat', loading: 'Loading the chats.', empty: 'No chat yet.', noMatch: 'No chat holds those words.' };

/** ChatList is the list pane of the Chat place: the history of the person, newest first, grouped by day. */
export function ChatList({ current }: { current?: string }) {
  const chat = useChat();
  const { runs, loaded } = useHistory(chat);
  return <HistoryList id="chat-list-title" words={CHAT_WORDS} runs={runs} loaded={loaded} current={current} hrefFor={(r) => hrefOf({ place: 'chat', run: r.id })} newHref={hrefOf({ place: 'chat', fresh: true })} />;
}

/* ---------- the picks of a new chat ---------- */

/** One row of the picks: a check box and the plain words of an ability or a skill. ids are the names that it turns on or off together. */
interface PickRowItem {
  key: string;
  label: string;
  sub?: string;
  /** The raw names, for the tooltip. */
  title: string;
  ids: string[];
}

const fromAbility = (a: Ability): PickRowItem => ({ key: a.key, label: a.text, title: a.names.join(', '), ids: a.names });

/** isOnAll reports whether every name of a row is on. */
const isOnAll = (value: string[], ids: string[]) => ids.length > 0 && ids.every((x) => value.includes(x));

/** setAll turns every name of a row on or off, and keeps the order of the picks. */
function setAll(value: string[], ids: string[], on: boolean): string[] {
  if (on) return [...value, ...ids.filter((x) => !value.includes(x))];
  return value.filter((x) => !ids.includes(x));
}

/**
 * PickList is one list of picks with its heading and the count of the rows
 * that are on. The rows that start on come first, and the rows that start
 * off follow below a line. Past FIND_FROM rows, a field finds one.
 */
function PickList({ id, title, find, first, rest = [], value, onChange, error }: { id: string; title: string; find: string; first: PickRowItem[]; rest?: PickRowItem[]; value: string[]; onChange: (next: string[]) => void; error?: string }) {
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase();
  const hit = (x: PickRowItem) => !words || (x.label + ' ' + (x.sub || '') + ' ' + x.title).toLowerCase().includes(words);
  const all = [...first, ...rest];
  const on = all.filter((x) => isOnAll(value, x.ids)).length;
  const row = (x: PickRowItem) => (
    <label class="kit-row" title={x.title}>
      <input type="checkbox" checked={isOnAll(value, x.ids)} onChange={(e) => onChange(setAll(value, x.ids, (e.target as HTMLInputElement).checked))} />
      <span class="kit-text">
        <span class="kit-label">{x.label}</span>
        {x.sub && <span class="kit-sub">{x.sub}</span>}
      </span>
    </label>
  );
  const shownFirst = first.filter(hit);
  const shownRest = rest.filter(hit);
  return (
    <section class="pick-sec" aria-labelledby={id}>
      <div class="pick-head">
        <h2 class="t-sub" id={id}>
          {title}
        </h2>
        <Chip label={on + ' of ' + all.length}>{on}</Chip>
        {all.length > FIND_FROM && <Find label={find} value={q} onInput={setQ} class="pick-find" />}
      </div>
      <div class="kit-rows" role="group" aria-labelledby={id}>
        {shownFirst.map(row)}
        {shownFirst.length > 0 && shownRest.length > 0 && <div class="kit-sep" role="separator" />}
        {shownRest.map(row)}
      </div>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** skillItems are the skills of the catalog that a person can pick: the ones that a person or a model can hand to a run. */
function skillItems(skills: Skill[] | null): PickRowItem[] {
  return (skills || []).filter((s) => s.userInvocable !== false || s.modelInvocable !== false).map((s) => ({ key: s.name, label: s.name, sub: s.description, title: s.name, ids: [s.name] }));
}

/** defaultSkills are the skills of the catalog that the list of an agent gives: every skill for a list of null. */
function defaultSkills(skills: Skill[] | null, list: string[] | null | undefined): string[] {
  const all = skills || [];
  if (list === null || list === undefined) return all.map((s) => s.name);
  return all.filter((s) => isOn(list, skillOf(s))).map((s) => s.name);
}

/**
 * NewChat is a chat before its first message: a question first. The pane
 * holds the composer, and right above it one quiet line that says what the
 * chat can use, such as Can use files, memory, the time, the wiki, and 2
 * skills. The line opens the picks of tools and skills, each in the words
 * of a person, with the raw names in a tooltip.
 */
function NewChat({ chat }: { chat: QuickChat }) {
  const tools = useToolCatalog();
  const skills = useSelect((s) => (s.skills ? s.skills.skills : null));
  const agent = useAgent(chat.agent);
  const [picks, setPicks] = useState<InlineProfile | null>(null);
  const [error, setError] = useState('');
  const [noSkills, setNoSkills] = useState(false);
  const [open, setOpen] = useState(false);
  // The page reads the skills at boot. A chat that opens before them, or after a failed read, reads them again.
  useEffect(() => {
    if (!skills) loadSkills().catch(() => setNoSkills(true));
  }, []);
  const ready = tools !== null && agent !== undefined && (skills !== null || noSkills);
  // The tools of the profile start on, each tool of the catalog that an
  // entry names, or the entry by its name where the catalog holds no such
  // tool. The other tools of the catalog start off.
  const rows = useMemo(() => {
    const list = agent ? agent.tools : null;
    if (tools && tools.length) return toolPicks(tools, list);
    // A catalog that is empty or did not load offers the entries of the profile alone.
    return { own: (list || []).filter((x) => x !== '*').map((x) => ({ id: x, name: x, text: '' })), more: [] };
  }, [tools, agent]);
  // The picks start from the lists of the agent, once the catalogs and the agent are in. With no
  // tool to offer, the tool list stays out of the inline profile, so the list of the agent holds.
  useEffect(() => {
    if (!ready || picks) return;
    setPicks({
      tools: rows.own.length || rows.more.length ? rows.own.map((x) => x.id) : undefined,
      skills: skills && skills.length ? defaultSkills(skills, agent ? agent.skills : null) : undefined,
    });
  }, [ready]);
  // The tools of the wiki make one row, and so do the tools of the bridges.
  const own = useMemo(() => abilitiesOf(rows.own.map((x) => x.id), tools).map(fromAbility), [rows, tools]);
  const more = useMemo(() => abilitiesOf(rows.more.map((x) => x.id), tools).map(fromAbility), [rows, tools]);
  const skillList = useMemo(() => skillItems(skills), [skills]);
  const commands = useMemo(() => slashCommands(skills, picks && picks.skills ? picks.skills : []), [skills, picks]);
  const summary = !picks ? 'Loading the tools.' : picks.tools || (agent && agent.tools) ? summaryOf(abilitiesOf(picks.tools || (agent && agent.tools) || [], tools), picks.skills ? picks.skills.length : 0) : 'Tools and skills';

  const send = async (text: string, files: Attachment[]): Promise<boolean> => {
    if (!picks) return false;
    if (picks.tools && picks.tools.length === 0) {
      setError('A chat needs at least one tool. Pick one.');
      setOpen(true);
      return false;
    }
    setError('');
    // A slash command on a new chat starts the run with its text, as any first message does, and its files go with it.
    return attempt(async () => {
      const r = await api.start(chat.member, startBody(chat.agent, text, picks, files)).catch((e) => {
        throw refusalOf(e, files.length);
      });
      picksOf.set(r.id, picks);
      firstSent = { run: r.id, text, files: describeFiles(files) };
      store.dispatch({ type: 'run', run: r });
      go({ place: 'chat', run: r.id }, true);
    });
  };

  return (
    <section class="screen chat-main" aria-labelledby="chat-title">
      <PaneHeader id="chat-title" title="New chat" size="title" level={1} back={{ href: '#chat', label: 'Chat', to: 'list' }} />
      <div class="scroll chat-picks-scroll">
        <div class="chat-picks">
          {!picks ? (
            <p class="chat-kit-line">{summary}</p>
          ) : (
            <details class="chat-kit" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
              <summary>
                <Glyph name="back" size={16} />
                <span>{summary}</span>
              </summary>
              <div class="chat-kit-body">
                {picks.tools && (
                  <PickList
                    id="chat-tools"
                    title="Tools"
                    find="Find a tool"
                    first={own}
                    rest={more}
                    value={picks.tools}
                    error={error}
                    onChange={(next) => {
                      setError('');
                      setPicks({ ...picks, tools: next });
                    }}
                  />
                )}
                {picks.skills && <PickList id="chat-skills" title="Skills" find="Find a skill" first={skillList} value={picks.skills} onChange={(next) => setPicks({ ...picks, skills: next })} />}
              </div>
            </details>
          )}
        </div>
      </div>
      <Composer draft={'chat:new'} label={'Message to ' + chat.agent} placeholder="Ask a question" disabled={picks ? '' : 'Loading the tools.'} commands={commands} attach onSend={(text, _to, files) => send(text, files)} />
    </section>
  );
}

/* ---------- a chat ---------- */

/**
 * picksOfRun are the tools and the skills that a chat started with: the
 * resolved profile of the run object, the picks of this tab, the resolved
 * profile of the first event of the run, else the lists of the agent with
 * the tools that the run has beyond them. null where the page cannot tell.
 */
function picksOfRun(run: Run | undefined, runId: string, agent: Agent | null | undefined, queued?: QueuedData | null): { tools: string[] | null; skills: string[] | null } {
  const r = run && run.resolved;
  const q = queued && queued.resolved;
  const p = picksOf.get(runId);
  const extra = (run && run.extraTools) || (queued && queued.extraTools) || [];
  const listed = agent && agent.tools && agent.tools.length ? agent.tools : null;
  const fromAgent = listed ? [...listed, ...extra.filter((x) => !listed.includes(x))] : extra.length ? [...extra] : null;
  return {
    tools: (r && r.tools) || (p && p.tools) || (q && q.tools) || fromAgent,
    skills: (r && r.skills) || (p && p.skills) || (q && q.skills) || (agent ? (agent.skills === undefined ? null : agent.skills) : null),
  };
}

/** useStart reads the first event of a chat when neither the run object nor this tab names its picks. */
function useStart(run: Run | undefined, runId: string): QueuedData | null | undefined {
  const known = !!(run && run.resolved && run.resolved.tools) || picksOf.has(runId);
  return useQueued(run && !known ? runId : '');
}

/** ChatRun is the conversation of a chat and its composer. */
function ChatRun({ chat, runId }: { chat: QuickChat; runId: string }) {
  const me = useSelect(meOf);
  const meName = useSelect((s) => (s.me && s.me.principal ? s.me.principal.name : undefined));
  const run = useSelect((s) => s.runs[runId]);
  const skills = useSelect((s) => (s.skills ? s.skills.skills : null));
  const loadable = useSelect((s) => s.agentSkills[chat.agent]);
  const agent = useAgent(chat.agent);
  const res = useResult(runId);
  const t = useTranscript(runId);
  const [sent, setSent] = useState<{ text: string; users: number; files: AttachedFile[] } | null>(() => (firstSent && firstSent.run === runId ? { text: firstSent.text, users: 0, files: firstSent.files } : null));
  useEffect(() => {
    loadAgentSkills(chat.agent).catch(() => {});
  }, [chat.agent]);
  useEffect(() => {
    setSent(firstSent && firstSent.run === runId ? { text: firstSent.text, users: 0, files: firstSent.files } : null);
  }, [runId]);
  // A run of the front sends no run event, so the chat reads it while it works and while an answer is on its way.
  usePoll(runId, !!sent || !run);
  const userCount = useMemo(() => t.items.filter((x) => x.kind === 'user').length, [t.items]);
  useEffect(() => {
    if (sent && userCount > sent.users) {
      setSent(null);
      if (firstSent && firstSent.run === runId) firstSent = null;
    }
  }, [userCount]);
  // A chat that failed or stopped, or whose worker was replaced, takes no message.
  const archived = !!run && !!run.archived;
  const stopped = closed(run);
  const lastUser = t.items.map((x) => x.kind).lastIndexOf('user');
  const answered = lastUser >= 0 && t.items.slice(lastUser + 1).some((x) => x.kind === 'assistant' || x.kind === 'ask' || (x.kind === 'end' && !!x.isError));
  const waiting = !stopped && (!!sent || (lastUser >= 0 && !answered && !(run && run.state === 'completed'))) && !(run && run.state === 'input-required');
  const answers = useMemo(() => answerSeqs(t.items), [t.items]);
  const live = useLiveAnswer(runId, { working: works(run) || waiting, seq: run ? run.seq : 0, mark: lastSeq(t.items, run), answers });
  // The agent types while an answer is on its way, until the run stops or waits for the person.
  const typing = !stopped && !(run && run.state === 'input-required') && (waiting || works(run));
  // The end of the conversation: its newest item, the sent text, the live answer, a card that waits, and the typing line.
  const end = [t.items.length ? t.items[t.items.length - 1].seq : 0, sent ? 1 : 0, live.text.length, live.tool, run && run.pending ? run.pending.id : '', typing ? 1 : 0].join(':');
  const start = useStart(run, runId);
  const picks = picksOfRun(run, runId, agent, start);
  const commands = useMemo(() => slashCommands(skills, picks.skills || loadable || (skills || []).map((s) => s.name)), [skills, picks.skills, loadable]);
  const names = useMemo(() => commands.map((c) => c.name), [commands]);

  const send = async (text: string, files: Attachment[]): Promise<boolean> => {
    const skill = stopped ? null : parseSlash(text, names);
    if (skill && files.length) {
      showError(new Error(NO_FILES_WITH_COMMAND));
      return false;
    }
    setSent({ text, users: userCount, files: describeFiles(files) });
    // A chat that stopped takes no message: the next one starts a new chat with the same picks.
    const startNew = async () => {
      // A list that the page does not know stays out, so the list of the agent holds.
      const p: InlineProfile = { tools: picks.tools || undefined, skills: picks.skills || undefined };
      // A message in an archived chat takes it up in a new one, which starts with a summary of it.
      const r = await startRun(chat.member, startBody(chat.agent, text, p, files), takeUpOf(runId)).catch((e) => {
        throw refusalOf(e, files.length);
      });
      picksOf.set(r.id, p);
      firstSent = { run: r.id, text, files: describeFiles(files) };
      store.dispatch({ type: 'run', run: r });
      go({ place: 'chat', run: r.id }, true);
    };
    const ok = await attempt(async () => {
      if (stopped) return startNew();
      if (skill) {
        const r = await api.runSkill(runId, skill);
        if (r && r.id) store.dispatch({ type: 'run', run: r });
        return;
      }
      try {
        await api.sendRun(runId, text, files);
      } catch (e) {
        // A chat that ended since the page read it, or whose worker was replaced, refuses the message, and the message starts a new chat.
        if (e instanceof ApiError && e.status === 409 && closed(await rereadRun(runId))) return startNew();
        throw refusalOf(e, files.length);
      }
      store.dispatch({ type: 'run', run: await api.run(runId) });
    });
    if (!ok) setSent(null);
    return ok;
  };

  const light = run ? runStatus(run) : null;
  const tail = (
    <>
      {sent && (
        <Msg face={<Avatar subject={me} display={meName} size={32} />} name="You">
          {sent.text && <p class="tmsg-plain sending">{sent.text}</p>}
          <AttachedFiles files={sent.files} />
        </Msg>
      )}
      {/* A chat at a limit of its budget did nothing wrong: Continue with more room goes on with it. */}
      {stopped && run && !archived && atLimit(run) ? (
        <MoreRoom run={run} next="Your next message starts a new chat." />
      ) : (
        stopped && <Quiet tone="grey">{archived ? ARCHIVED_LINE : 'Stopped. Your next message starts a new chat.'}</Quiet>
      )}
    </>
  );
  const title = run ? chatTitle(run) : sent ? chatTitle({ input: sent.text || sent.files.map((f) => f.name).join(', ') }) : 'Chat';
  return (
    <section class="screen chat-main" aria-labelledby="chat-title">
      <PaneHeader
        id="chat-title"
        title={title}
        size="title"
        level={1}
        back={{ href: '#chat', label: 'Chat', to: 'list' }}
        lead={
          <a class="mark-link" href={hrefOf({ place: 'chat', run: runId, details: true })} aria-label={'This chat' + (light ? ', ' + light.word : '')} title={light ? light.word : undefined}>
            <Mark agent={chat.agent} size={36} label={chat.agent} halo={light ? { tone: light.tone, word: light.word } : undefined} />
          </a>
        }
        actions={
          run ? (
            // A chat that did a job once becomes a duty that does it again, with the agent and the first message.
            // About this chat opens the details, which a narrow window keeps out of sight.
            <Menu
              label="More"
              items={[
                { label: 'About this chat', onSelect: () => go({ place: 'chat', run: runId, details: true }) },
                { label: 'Make this a duty', onSelect: () => go({ place: 'duties', fresh: true, seed: { agent: chat.agent, act: 'ask', message: askOfRun(run, t.items) } }) },
              ]}
            />
          ) : undefined
        }
      />
      <FollowBox end={end} foot={typing ? <Typing who={[{ agent: chat.agent, name: chat.agent }]} phrase={typingPhrase(run, live)} /> : null}>
        <Conversation
          run={run}
          result={res}
          t={t}
          agentLabel={chat.agent}
          tail={tail}
          live={live}
          head={
            <>
              {run && run.hidden && <DeletedLine r={run} />}
              <ContinuedFrom run={run} href={(id) => hrefOf({ place: 'chat', run: id })} />
            </>
          }
        />
      </FollowBox>
      <Composer draft={'chat:' + runId} label={'Message to ' + chat.agent} placeholder="Ask a question" commands={commands} attach onSend={(text, _to, files) => send(text, files)} />
    </section>
  );
}

/** ChatMain is the main pane of the Chat place: a chat, or a new chat. */
export function ChatMain({ run }: { run?: string }) {
  const chat = useChat();
  if (!chat) return <NoChat />;
  return run ? <ChatRun chat={chat} runId={run} /> : <NewChat chat={chat} />;
}

/* ---------- This chat ---------- */

/** skillsLine names the skills of a chat compactly: 2 skills: notes and plan, or 5 skills: a, b, and 3 more. */
export function skillsLine(skills: string[]): string {
  if (skills.length === 0) return '';
  const head = skills.length === 1 ? '1 skill: ' : skills.length + ' skills: ';
  if (skills.length <= 3) return head + joined(skills);
  return head + joined([...skills.slice(0, 2), skills.length - 2 + ' more']);
}

/**
 * ChatDetails is the details pane of a chat: what the chat can do, in the
 * words of a person, with a quiet for this chat on a tool that the picks
 * gave beyond the list of the agent, its skills in one line, the model, and
 * the usage.
 */
export function ChatDetails({ run: runId }: { run: string }) {
  const chat = useChat();
  const run = useSelect((s) => s.runs[runId]);
  const skillsCatalog = useSelect((s) => (s.skills ? s.skills.skills : null));
  const agent = useAgent(chat ? chat.agent : '');
  const start = useStart(run, runId);
  const catalog = useToolCatalog();
  if (!chat) return null;
  // The tools that the chat started with. A list that the page cannot tell leaves the tools out, so a chat with tools never reads no tool.
  const picks = picksOfRun(run, runId, agent, start);
  const extra = (run && run.extraTools) || (start && start.extraTools) || [];
  const tools = picks.tools ? [...picks.tools.filter((x) => !extra.includes(x)), ...extra] : null;
  const abilities = tools ? abilitiesOf(tools, catalog) : [];
  const skills = picks.skills || (skillsCatalog || []).map((s) => s.name);
  const model = run && run.resolved && run.resolved.model;
  const parts = run ? usageParts(run.usage, works(run)) : [];
  return (
    <section class="screen chat-details" aria-labelledby="chat-details-title">
      <PaneHeader id="chat-details-title" title="This chat" back={{ href: hrefOf({ place: 'chat', run: runId }), label: run ? chatTitle(run) : 'Chat', to: 'main' }} />
      <div class="scroll">
        {(abilities.length > 0 || skills.length > 0) && (
          <section class="prof-sec" aria-labelledby="chat-can">
            <div class="prof-sec-head">
              <h3 class="t-sub" id="chat-can">
                What it can do
              </h3>
            </div>
            <Abilities abilities={abilities} extra={extra} label="Tools" />
            {skills.length > 0 && (
              <p class="chat-skills" title={skills.join(', ')}>
                {skillsLine(skills)}
              </p>
            )}
          </section>
        )}
        {model && (
          <section class="prof-sec" aria-labelledby="chat-model">
            <div class="prof-sec-head">
              <h3 class="t-sub" id="chat-model">
                Model
              </h3>
            </div>
            <p class="chat-model">{model}</p>
          </section>
        )}
        {parts.length > 0 && (
          <section class="prof-sec" aria-labelledby="chat-usage">
            <div class="prof-sec-head">
              <h3 class="t-sub" id="chat-usage">
                Usage
              </h3>
            </div>
            <div class="today">
              {parts.map((p) => (
                <span>
                  {p.lead && p.lead + ' '}
                  <b>{p.n}</b>
                  {p.word && ' ' + p.word}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
