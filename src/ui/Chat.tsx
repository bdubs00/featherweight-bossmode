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
import type { Agent, InlineProfile, QueuedData, QuickChat, Run, Skill, Tool } from '../api/types';
import { store, useSelect } from '../state/store';
import { forgetProfiles, useProfile } from '../state/profiles';
import { forgetQueued, useQueued } from '../state/queued';
import { loadAgentSkills, loadChats, loadSkills } from '../state/actions';
import { slashCommands } from '../state/people';
import { runStatus } from '../lib/presence';
import { go, hrefOf } from '../lib/route';
import { parseSlash } from '../lib/mention';
import { since } from '../lib/words';
import { answerSeqs, chatTitle, findChats, historyGroups, isQuickChat, lastSeq, newestFirst, startBody, toggle, toolPicks, usageParts, works, type PickItem } from '../lib/chat';
import { isOn, skillOf } from '../lib/catalog';
import { useRoving } from './keys';
import { attempt } from './notice';
import { Composer } from './Composer';
import { Conversation, usePoll, useTranscript } from './Conversation';
import { useResult } from './RunPane';
import { Msg, Quiet, useStickToEnd } from './Thread';
import { useLiveAnswer } from './Live';
import { Avatar, Button, Chip, Find, Help, Led, Mark, PaneHeader } from './primitives';

/** The number of items of a list of picks above which it gets a field to find one. */
export const FIND_FROM = 12;

/** The picks of the chats that this tab started, so the details pane names them before the run object does. */
const picksOf = new Map<string, InlineProfile>();
/** The first message of a chat on its way, so the new conversation shows it before its transcript does. */
let firstSent: { run: string; text: string } | null = null;

let toolCache: Tool[] | null = null;
let toolLoad: Promise<Tool[]> | null = null;

/** forgetChat drops what the place keeps between two visits, for the tests. */
export function forgetChat(): void {
  picksOf.clear();
  firstSent = null;
  toolCache = null;
  toolLoad = null;
  forgetProfiles();
  forgetQueued();
}

/** useChat is the quick chat of the settings, or null when none is set up. */
function useChat(): QuickChat | null {
  return useSelect((s) => (s.config && s.config.chat && s.config.chat.agent ? s.config.chat : null));
}

const meOf = (s: ReturnType<typeof store.get>) => (s.me && s.me.principal ? s.me.principal.subject : '');

/** useTools reads the catalog of tools of GET /v1/tools once per page load. A workbench without it gives none. */
function useTools(): Tool[] | null {
  const [tools, setTools] = useState<Tool[] | null>(toolCache);
  useEffect(() => {
    if (tools) return;
    let live = true;
    if (!toolLoad) toolLoad = api.tools().catch(() => [] as Tool[]);
    toolLoad.then((t) => {
      toolCache = t;
      if (live) setTools(t);
    });
    return () => {
      live = false;
    };
  }, []);
  return tools;
}

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
    return newestFirst(Object.values(runs).filter((r) => ids.has(r.id) || isQuickChat(r, chat.agent, me)));
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

function ChatRow({ r, on }: { r: Run; on: boolean }) {
  const light = runStatus(r);
  const title = chatTitle(r);
  const d = new Date(r.createdAt);
  return (
    <a class={'brow chat-row' + (on ? ' sel strong' : '')} href={hrefOf({ place: 'chat', run: r.id })} data-item aria-current={on ? 'page' : undefined} aria-label={title + ', ' + light.word + ', ' + since(r.createdAt)}>
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
    </a>
  );
}

/** ChatList is the list pane of the Chat place: the history of the person, newest first, grouped by day. */
export function ChatList({ current }: { current?: string }) {
  const chat = useChat();
  const { runs, loaded } = useHistory(chat);
  const [q, setQ] = useState('');
  const shown = useMemo(() => findChats(runs, q), [runs, q]);
  const groups = useMemo(() => historyGroups(shown), [shown]);
  const list = useRoving<HTMLDivElement>();
  return (
    <section class="screen chat-list" aria-labelledby="chat-list-title">
      <PaneHeader
        id="chat-list-title"
        title="Chat"
        count={loaded ? runs.length : undefined}
        countLabel={runs.length === 1 ? '1 chat' : runs.length + ' chats'}
        actions={
          <Button href={hrefOf({ place: 'chat', fresh: true })} size="s">
            New
          </Button>
        }
      />
      <div class="list-find">
        <Find label="Find a chat" value={q} onInput={setQ} />
      </div>
      <div class="scroll" ref={list}>
        {groups.map((g, i) => (
          <div class="chat-day" role="group" aria-labelledby={'chat-day-' + i}>
            <div class="people-head" id={'chat-day-' + i}>
              <span class="people-title muted">{g.day}</span>
            </div>
            <div role="list" class="rows">
              {g.runs.map((r) => (
                <div role="listitem">
                  <ChatRow r={r} on={r.id === current} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {!loaded && runs.length === 0 && <p class="people-note">Loading the chats.</p>}
        {loaded && runs.length === 0 && (
          <div class="empty">
            <p>No chat yet.</p>
            <Button href={hrefOf({ place: 'chat', fresh: true })} kind="primary">
              New chat
            </Button>
          </div>
        )}
        {runs.length > 0 && shown.length === 0 && <p class="people-note">No chat holds those words.</p>}
      </div>
    </section>
  );
}

/* ---------- the picks of a new chat ---------- */

/** PickRow is one row of chips with check boxes, with a field to find one when it holds more than FIND_FROM. */
function PickRow({ id, title, find, items, value, onChange, error }: { id: string; title: string; find: string; items: PickItem[]; value: string[]; onChange: (next: string[]) => void; error?: string }) {
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase();
  const shown = words ? items.filter((x) => x.name.toLowerCase().includes(words) || x.text.toLowerCase().includes(words)) : items;
  const on = items.filter((x) => value.includes(x.id)).length;
  return (
    <section class="pick-sec" aria-labelledby={id}>
      <div class="pick-head">
        <h2 class="t-sub" id={id}>
          {title}
        </h2>
        <Chip label={on + ' of ' + items.length}>{on}</Chip>
        {items.length > FIND_FROM && <Find label={find} value={q} onInput={setQ} class="pick-find" />}
      </div>
      <div class="pick-chips" role="group" aria-labelledby={id}>
        {shown.map((x) => (
          <label class="pick-chip" title={x.text || undefined}>
            <input type="checkbox" checked={value.includes(x.id)} onChange={(e) => onChange(toggle(value, x.id, (e.target as HTMLInputElement).checked))} />
            <span>{x.name}</span>
          </label>
        ))}
      </div>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** skillItems are the skills of the catalog that a person can pick: the ones that a person can hand to a run. */
function skillItems(skills: Skill[] | null): PickItem[] {
  return (skills || []).filter((s) => s.userInvocable !== false || s.modelInvocable !== false).map((s) => ({ id: s.name, name: s.name, text: s.description }));
}

/** defaultSkills are the skills of the catalog that the list of an agent gives: every skill for a list of null. */
function defaultSkills(skills: Skill[] | null, list: string[] | null | undefined): string[] {
  const all = skills || [];
  if (list === null || list === undefined) return all.map((s) => s.name);
  return all.filter((s) => isOn(list, skillOf(s))).map((s) => s.name);
}

/** NewChat is a chat before its first message: the picks of tools and skills, and the composer. */
function NewChat({ chat }: { chat: QuickChat }) {
  const tools = useTools();
  const skills = useSelect((s) => (s.skills ? s.skills.skills : null));
  const agent = useAgent(chat.agent);
  const [picks, setPicks] = useState<InlineProfile | null>(null);
  const [error, setError] = useState('');
  const [noSkills, setNoSkills] = useState(false);
  // The page reads the skills at boot. A chat that opens before them, or after a failed read, reads them again.
  useEffect(() => {
    if (!skills) loadSkills().catch(() => setNoSkills(true));
  }, []);
  const ready = tools !== null && agent !== undefined && (skills !== null || noSkills);
  // The tools of the profile start on, each tool of the catalog that an
  // entry names, or the entry by its name where the catalog holds no such
  // tool. The other tools of the catalog wait under More tools.
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
  const skillList = useMemo(() => skillItems(skills), [skills]);
  const commands = useMemo(() => slashCommands(skills, picks && picks.skills ? picks.skills : []), [skills, picks]);

  const send = async (text: string): Promise<boolean> => {
    if (!picks) return false;
    if (picks.tools && picks.tools.length === 0) {
      setError('A chat needs at least one tool. Pick one.');
      return false;
    }
    setError('');
    // A slash command on a new chat starts the run with its text, as any first message does.
    return attempt(async () => {
      const r = await api.start(chat.member, startBody(chat.agent, text, picks));
      picksOf.set(r.id, picks);
      firstSent = { run: r.id, text };
      store.dispatch({ type: 'run', run: r });
      go({ place: 'chat', run: r.id }, true);
    });
  };

  return (
    <section class="screen chat-main" aria-labelledby="chat-title">
      <PaneHeader id="chat-title" title="New chat" size="title" level={1} back={{ href: '#chat', label: 'Chat', to: 'list' }} lead={<Mark agent={chat.agent} size={36} />} />
      <div class="scroll chat-picks-scroll">
        <div class="chat-picks">
          {!picks && <p class="people-note">Loading the tools.</p>}
          {picks && picks.tools && (
            <PickRow
              id="chat-tools"
              title="Tools"
              find="Find a tool"
              items={rows.own}
              value={picks.tools}
              error={error}
              onChange={(next) => {
                setError('');
                setPicks({ ...picks, tools: next });
              }}
            />
          )}
          {picks && picks.tools && rows.more.length > 0 && (
            <PickRow
              id="chat-more-tools"
              title="More tools"
              find="Find a tool"
              items={rows.more}
              value={picks.tools}
              onChange={(next) => {
                setError('');
                setPicks({ ...picks, tools: next });
              }}
            />
          )}
          {picks && picks.skills && <PickRow id="chat-skills" title="Skills" find="Find a skill" items={skillList} value={picks.skills} onChange={(next) => setPicks({ ...picks, skills: next })} />}
        </div>
      </div>
      <Composer draft={'chat:new'} label={'Message to ' + chat.agent} placeholder="Ask a question" disabled={picks ? '' : 'Loading the tools.'} commands={commands} onSend={send} />
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
  const [sent, setSent] = useState<{ text: string; users: number } | null>(() => (firstSent && firstSent.run === runId ? { text: firstSent.text, users: 0 } : null));
  useEffect(() => {
    loadAgentSkills(chat.agent).catch(() => {});
  }, [chat.agent]);
  useEffect(() => {
    setSent(firstSent && firstSent.run === runId ? { text: firstSent.text, users: 0 } : null);
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
  const stopped = !!run && (run.state === 'failed' || run.state === 'canceled');
  const lastUser = t.items.map((x) => x.kind).lastIndexOf('user');
  const answered = lastUser >= 0 && t.items.slice(lastUser + 1).some((x) => x.kind === 'assistant' || x.kind === 'ask' || (x.kind === 'end' && !!x.isError));
  const waiting = !stopped && (!!sent || (lastUser >= 0 && !answered && !(run && run.state === 'completed'))) && !(run && run.state === 'input-required');
  const answers = useMemo(() => answerSeqs(t.items), [t.items]);
  const live = useLiveAnswer(runId, { working: works(run) || waiting, seq: run ? run.seq : 0, mark: lastSeq(t.items, run), answers });
  const box = useStickToEnd<HTMLDivElement>(t.items.length + (sent ? 1 : 0) + live.text.length + (live.tool ? 1 : 0));
  const start = useStart(run, runId);
  const picks = picksOfRun(run, runId, agent, start);
  const commands = useMemo(() => slashCommands(skills, picks.skills || loadable || (skills || []).map((s) => s.name)), [skills, picks.skills, loadable]);
  const names = useMemo(() => commands.map((c) => c.name), [commands]);

  const send = async (text: string): Promise<boolean> => {
    setSent({ text, users: userCount });
    const ok = await attempt(async () => {
      if (stopped) {
        // A chat that stopped takes no message: the next one starts a new chat with the same picks.
        // A list that the page does not know stays out, so the list of the agent holds.
        const p: InlineProfile = { tools: picks.tools || undefined, skills: picks.skills || undefined };
        const r = await api.start(chat.member, startBody(chat.agent, text, p));
        picksOf.set(r.id, p);
        firstSent = { run: r.id, text };
        store.dispatch({ type: 'run', run: r });
        go({ place: 'chat', run: r.id }, true);
        return;
      }
      const skill = parseSlash(text, names);
      if (skill) {
        const r = await api.runSkill(runId, skill);
        if (r && r.id) store.dispatch({ type: 'run', run: r });
        return;
      }
      await api.sendRun(runId, text);
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
          <p class="tmsg-plain sending">{sent.text}</p>
        </Msg>
      )}
      {waiting && !live.text && !live.tool && (
        <div role="status">
          <Msg face={<Mark agent={chat.agent} size={32} />} name={chat.agent}>
            <p class="tmsg-status">
              {run && run.state === 'queued' && light ? <Led tone={light.tone} word={light.word} label={light.label} /> : <Led tone="green" word="working" />}
              {run && run.activity && run.activity.phrase && <span>{run.activity.phrase}</span>}
            </p>
          </Msg>
        </div>
      )}
      {stopped && <Quiet tone="grey">Stopped. Your next message starts a new chat.</Quiet>}
    </>
  );
  const title = run ? chatTitle(run) : sent ? chatTitle({ input: sent.text }) : 'Chat';
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
      />
      <div class="scroll thread-scroll" ref={box}>
        <Conversation run={run} result={res} t={t} agentLabel={chat.agent} tail={tail} live={live} />
      </div>
      <Composer draft={'chat:' + runId} label={'Message to ' + chat.agent} placeholder="Ask a question" commands={commands} onSend={send} />
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

/** ChatDetails is the details pane of a chat: the tools and the skills in use, the model, and the usage. */
export function ChatDetails({ run: runId }: { run: string }) {
  const chat = useChat();
  const run = useSelect((s) => s.runs[runId]);
  const skillsCatalog = useSelect((s) => (s.skills ? s.skills.skills : null));
  const agent = useAgent(chat ? chat.agent : '');
  const start = useStart(run, runId);
  if (!chat) return null;
  // The tools that the chat started with. A list that the page cannot tell leaves the section out, so a chat with tools never reads Tools 0.
  const picks = picksOfRun(run, runId, agent, start);
  const extra = (run && run.extraTools) || (start && start.extraTools) || [];
  const tools = picks.tools ? [...picks.tools.filter((x) => !extra.includes(x)), ...extra] : null;
  const skills = picks.skills || (skillsCatalog || []).map((s) => s.name);
  const model = run && run.resolved && run.resolved.model;
  const parts = run ? usageParts(run.usage, works(run)) : [];
  return (
    <section class="screen chat-details" aria-labelledby="chat-details-title">
      <PaneHeader id="chat-details-title" title="This chat" back={{ href: hrefOf({ place: 'chat', run: runId }), label: run ? chatTitle(run) : 'Chat', to: 'main' }} />
      <div class="scroll">
        {tools && (
          <section class="prof-sec" aria-labelledby="chat-tools-in-use">
            <div class="prof-sec-head">
              <h3 class="t-sub" id="chat-tools-in-use">
                Tools
              </h3>
              <Chip label={tools.length === 1 ? '1 tool' : tools.length + ' tools'}>{tools.length}</Chip>
            </div>
            {tools.length > 0 && (
              <ul class="prof-chips chat-chips">
                {tools.map((x) => (
                  <li>
                    <Chip class="prof-tool">
                      {x}
                      {extra.includes(x) && <span class="chip-note">for this chat</span>}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section class="prof-sec" aria-labelledby="chat-skills-in-use">
          <div class="prof-sec-head">
            <h3 class="t-sub" id="chat-skills-in-use">
              Skills
            </h3>
            <Chip label={skills.length === 1 ? '1 skill' : skills.length + ' skills'}>{skills.length}</Chip>
          </div>
          {skills.length > 0 && (
            <ul class="prof-chips chat-chips">
              {skills.map((x) => (
                <li>
                  <Chip class="prof-tool">{x}</Chip>
                </li>
              ))}
            </ul>
          )}
        </section>
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

