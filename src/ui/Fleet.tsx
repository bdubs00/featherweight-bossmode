// The Fleet place. The list pane holds the people: the seats of every open
// bridge, grouped by bridge, then the agents that sit on no bridge, with a
// field to find a member, a key that switches to the board, and for an
// admin the child Tasks that lost their parent. The main
// pane holds the conversation with an agent that sits on no bridge, the
// manager among them, as a run. The details pane holds the profile.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Attachment, OrphanList } from '../api/types';
import { NO_FILES_WITH_COMMAND, refusalOf } from '../lib/attachments';
import { spanWords } from '../lib/words';
import { go, hrefOf, parseRoute, type Route } from '../lib/route';
import { awakeCount, statusOf } from '../lib/status';
import { store, useSelect } from '../state/store';
import { selectFacts } from '../state/reducer';
import { loadAgentSkills, loadAgents, loadFleet } from '../state/actions';
import { selectAgents } from '../state/agents';
import { ensureRosters, ensureRuns, refreshAfterReset } from '../state/fetchers';
import { filterPeople, firstPerson, newestRun, peopleCount, peopleOf, slashCommands, type PeopleGroup, type PersonRow } from '../state/people';
import { parseSlash } from '../lib/mention';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Composer } from './Composer';
import { Conversation, useTranscript, usePoll } from './Conversation';
import { useResult } from './RunPane';
import { FollowBox } from './Thread';
import { useLiveAnswer } from './Live';
import { answerSeqs, lastSeq, works } from '../lib/chat';
import { Profile } from './Profile';
import { EmptyPane } from './Shell';
import { Confirm, Menu } from './common';
import { askOfRun } from '../lib/duties';
import { Button, Chip, Find, Help, IconButton, Led, Mark, PaneHeader } from './primitives';
import { Glyph } from './icons';
import { PastConversations } from './History';
import type { Tone } from '../lib/presence';

/** The width from which two panes show side by side, as App names it. */
const TWO_PANES = '(min-width: 800px)';

/** The conversation that the person had open last, so the main pane opens it again. */
let lastOpen = '';

/** rememberOpen keeps the address of the conversation that the main pane shows. */
export function rememberOpen(href: string): void {
  lastOpen = href;
}

/** useHashRoute reads the route of the address, and reads it again when it changes. */
export function useHashRoute(): Route {
  const [r, setR] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const f = () => setR(parseRoute(location.hash));
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

/**
 * usePeople builds the people list from the store, and loads what it
 * needs: the agents of the fleet, the record of each open bridge, and the
 * newest run of each seat that works, so a seat that waits in the queue
 * says so.
 */
export function usePeople(): { groups: PeopleGroup[]; loaded: boolean } {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const runs = useSelect((s) => s.runs);
  const agents = useSelect(selectAgents);
  const fleet = useSelect((s) => s.fleet);
  const openRuns = useSelect((s) => s.openRuns);
  useEffect(() => {
    const s = store.get();
    if (!s.agents) attempt(loadAgents);
    if (!s.fleet) loadFleet().catch(() => {});
  }, []);
  useEffect(() => {
    if (bridges.loaded) ensureRosters();
  }, [bridges]);
  // A stream that cannot resume leaves the records and the runs behind, so they load again.
  const resets = useSelect((s) => s.resets);
  const seen = useRef(resets);
  useEffect(() => {
    if (resets === seen.current) return;
    seen.current = resets;
    refreshAfterReset();
  }, [resets]);
  const groups = useMemo(() => peopleOf({ bridges, rosters, runs, agents, fleet, openRuns }), [bridges, rosters, runs, agents, fleet, openRuns]);
  const working = groups
    .flatMap((g) => g.rows)
    .filter((r) => r.kind === 'seat' && r.light && r.light.word === 'working' && r.bridge)
    .map((r) => {
      const m = rosters[r.bridge!] && rosters[r.bridge!].byHandle[r.handle];
      return m ? newestRun(m) : '';
    })
    .join(',');
  useEffect(() => {
    if (working) ensureRuns(working.split(','));
  }, [working]);
  const open = bridges.order.filter((id) => bridges.byId[id].state === 'open');
  const loaded = bridges.loaded && !!agents && open.every((id) => !!rosters[id]);
  return { groups, loaded };
}

/** PersonLink is one row of the people list: the mark, the handle, the status, and the task. */
function PersonLink({ r, on }: { r: PersonRow; on: boolean }) {
  return (
    <a class={'person' + (on ? ' sel' : '')} href={r.href} data-item aria-current={on ? 'page' : undefined}>
      <Mark agent={r.agent} size={32} selected={on} />
      <span class="person-main">
        <span class="person-top">
          <span class={'person-handle clip' + (r.light && r.light.struck ? ' struck' : '')}>{r.handle}</span>
          {r.light && <Led tone={r.light.tone} word={r.light.word} struck={r.light.struck} label={r.light.label} />}
        </span>
        <span class="person-task clip">{r.task}</span>
      </span>
    </a>
  );
}

/**
 * OrphanNote tells an admin about the child Tasks whose parent Task is
 * gone, such as the children of a Task that a pool replaced. The front
 * removes each one after it sleeps for removeAfter, and the note offers to
 * remove them now, after a confirmation. A person who is no admin, and a
 * front without the list, see nothing.
 */
export function OrphanNote() {
  const [list, setList] = useState<OrphanList | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const resets = useSelect((s) => s.resets);
  const read = () =>
    api
      .orphans()
      .then(setList)
      .catch(() => setList(null));
  useEffect(() => {
    read();
  }, [resets]);
  const orphans = list ? list.orphans : [];
  if (!orphans.length) return null;
  const after = (list && list.removeAfter) || 0;
  const n = orphans.length;
  const open = orphans.filter((o) => o.open > 0).length;
  const tasks = n === 1 ? '1 child Task' : n + ' child Tasks';
  const remove = async () => {
    setBusy(true);
    await attempt(async () => {
      const r = await api.removeOrphans();
      if (r.failed.length) throw new Error((r.failed.length === 1 ? '1 Task stays: ' : r.failed.length + ' Tasks stay: ') + r.failed.map((f) => f.member + ', ' + f.error).join('; ') + '.');
    });
    setBusy(false);
    setAsking(false);
    read();
    loadFleet().catch(() => {});
  };
  return (
    <div class="orphan-note" role="status">
      <p>
        {tasks} lost {n === 1 ? 'its' : 'their'} parent.{' '}
        <Help label="What a child Task without its parent is">
          An agent starts a child Task for a piece of work, and the Task that started it removes it when the work ends. Here that Task is gone, for example because a pool replaced it.{' '}
          {after > 0 ? 'The front removes each one once it sleeps for ' + spanWords(after) + ', and Remove removes them now.' : 'Nothing removes ' + (n === 1 ? 'this one' : 'these') + ' but Remove.'}
        </Help>
      </p>
      <Button size="s" onClick={() => setAsking(true)}>
        Remove
      </Button>
      {asking && (
        <Confirm title={'Remove ' + tasks + '?'} confirm={n === 1 ? 'Remove the Task' : 'Remove ' + n + ' Tasks'} danger busy={busy} onConfirm={remove} onCancel={() => setAsking(false)}>
          <p>The Task that started {n === 1 ? 'it' : 'them'} is gone. A removed Task takes its runs with it.</p>
          {open > 0 && <p>{n === 1 ? 'It holds' : open === 1 ? '1 of them holds' : open + ' of them hold'} a run that did not end, and that run stops.</p>}
        </Confirm>
      )}
    </div>
  );
}

/** FOLD_KEY is the key under which this browser keeps the choices of the person about the groups of the people list. */
export const FOLD_KEY = 'fw.bossmode.fleet.fold';

/** ATTENTION holds the statuses that open a group: the words of a member that the person must look at. */
export const ATTENTION = ['needs you', 'error', 'failed', 'at its limit'];

/** groupKey names a group: the id of its bridge, or none for Not on a bridge. */
const groupKey = (g: PeopleGroup): string => g.key || 'none';

/** attentionRows are the rows of a group that the person must look at, the most urgent first. */
const attentionRows = (rows: PersonRow[]): PersonRow[] =>
  rows.filter((r) => r.light && !r.light.struck && ATTENTION.includes(r.light.word)).sort((a, b) => ATTENTION.indexOf(a.light!.word) - ATTENTION.indexOf(b.light!.word));

/**
 * A FoldChoice is a click of the person on the key of a group: open or
 * not, and whether the group needed attention at that moment. A choice
 * holds while the group keeps that state of attention.
 */
export interface FoldChoice {
  open: boolean;
  attention: boolean;
}

/**
 * groupOpen decides whether a group shows its members. A group is folded
 * unless a member needs attention. A choice of the person wins while the
 * group keeps the state of attention of that moment, so a quiet group that
 * the person opened stays open, and a group that starts to need attention
 * opens again.
 */
export function groupOpen(choice: FoldChoice | undefined, attention: boolean): boolean {
  if (choice && choice.attention === attention) return choice.open;
  return attention;
}

/** readChoices returns the choices of this browser. A browser without storage has none. */
export function readChoices(): Record<string, FoldChoice> {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}');
    const out: Record<string, FoldChoice> = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
        const o = c as Partial<FoldChoice> | null;
        if (o && typeof o.open === 'boolean' && typeof o.attention === 'boolean') out[k] = { open: o.open, attention: o.attention };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** keepChoices remembers the choices. The list of a browser without storage falls back to the default at the next load. */
function keepChoices(choices: Record<string, FoldChoice>): void {
  try {
    if (Object.keys(choices).length) localStorage.setItem(FOLD_KEY, JSON.stringify(choices));
    else localStorage.removeItem(FOLD_KEY);
  } catch {
    // No storage.
  }
}

/** PeopleGroupView is one group of the people list. A folded group shows its heading, and still the row that is open. */
function PeopleGroupView({ g, sel, shut, onFold }: { g: PeopleGroup; sel: string; shut: boolean; onFold: () => void }) {
  const key = groupKey(g);
  const rows = shut ? g.rows.filter((r) => r.key === sel) : g.rows;
  // A folded group still shows the most urgent status of a member that it hides.
  const waiting = shut ? attentionRows(g.rows.filter((r) => r.key !== sel)) : [];
  return (
    <div class="people-group" role="group" aria-labelledby={'pg-' + key}>
      <div class="people-head" id={'pg-' + key}>
        <button
          type="button"
          class="people-fold"
          aria-expanded={!shut}
          aria-controls={'pl-' + key}
          aria-label={(shut ? 'Show the members of ' : 'Hide the members of ') + g.title}
          title={shut ? 'Show the members' : 'Hide the members'}
          onClick={onFold}
        >
          <Glyph name="back" size={14} class={shut ? 'turn-right' : 'turn-down'} />
        </button>
        {g.href ? (
          <a class="people-title clip" href={g.href}>
            {g.title}
          </a>
        ) : (
          <span class="people-title muted clip">{g.title}</span>
        )}
        {waiting.length > 0 && (
          <Led tone={waiting[0].light!.tone} word={waiting[0].light!.word} label={waiting.length === 1 ? '1 hidden member needs attention' : waiting.length + ' hidden members need attention'} />
        )}
        <span class="people-count" aria-label={g.count === 1 ? '1 member' : g.count + ' members'}>
          {g.count}
        </span>
      </div>
      <div role="list" id={'pl-' + key}>
        {rows.map((r) => (
          <div role="listitem">
            <PersonLink r={r} on={r.key === sel} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** FleetList is the list pane of the Fleet place: the people grouped by bridge, then Not on a bridge. */
export function FleetList({ current, member }: { current?: string; member?: string }) {
  const route = useHashRoute();
  const board = route.place === 'fleet' && !!route.board;
  const { groups, loaded } = usePeople();
  const awake = useSelect((s) => awakeCount(selectFacts(s)));
  const knowFleet = useSelect((s) => !!s.fleet);
  const [q, setQ] = useState('');
  const shown = useMemo(() => filterPeople(groups, q), [groups, q]);
  const list = useRoving<HTMLDivElement>();
  const count = peopleCount(groups);
  const sel = member ? 'seat:' + member : current ? 'agent:' + current : '';
  // The choices of this browser about the groups. A search shows every match.
  const [choices, setChoices] = useState(readChoices);
  const isOpen = (g: PeopleGroup) => groupOpen(choices[groupKey(g)], attentionRows(g.rows).length > 0);
  const fold = (g: PeopleGroup) => {
    const key = groupKey(g);
    const attention = attentionRows(g.rows).length > 0;
    const open = !isOpen(g);
    const next = { ...choices };
    // A click back to the default forgets the choice, so the storage holds only what differs.
    if (open === attention) delete next[key];
    else next[key] = { open, attention };
    setChoices(next);
    keepChoices(next);
  };
  return (
    <section class="screen people" aria-labelledby="fleet-list-title">
      <PaneHeader
        id="fleet-list-title"
        title="Fleet"
        count={loaded ? count : undefined}
        countLabel={count === 1 ? '1 member' : count + ' members'}
        actions={
          <>
            <IconButton icon="board" label="Board" aria-pressed={board} onClick={() => go(board ? { place: 'fleet' } : { place: 'fleet', board: true })} />
            <Button href="#new-agent" size="s" icon="plus" class="key-icon" aria-label="New agent" title="New agent" />
          </>
        }
      >
        {/* A green light never stands for zero: with no worker awake, the chip goes. */}
        {knowFleet && awake > 0 && (
          <Chip label={awake === 1 ? '1 worker awake' : awake + ' workers awake'}>
            <Led tone="green" word={awake + ' awake'} />
          </Chip>
        )}
      </PaneHeader>
      <div class="list-find">
        <Find label="Find a member" value={q} onInput={setQ} />
      </div>
      <OrphanNote />
      <div class="scroll" ref={list}>
        {shown.map((g) => (
          <PeopleGroupView g={g} sel={sel} shut={!q.trim() && !isOpen(g)} onFold={() => fold(g)} />
        ))}
        {!loaded && <p class="people-note">Loading the members.</p>}
        {loaded && groups.length === 0 && (
          <div class="empty">
            <p>No agent yet.</p>
            <Button href="#new-agent" kind="primary">
              New agent
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** agentRunKey is the key under which a tab keeps the conversation of the person with an agent. */
const agentRunKey = (agent: string) => 'fw.bossmode.agentrun.' + agent;

function readRun(agent: string): string {
  try {
    return sessionStorage.getItem(agentRunKey(agent)) || '';
  } catch {
    return '';
  }
}

function keepRun(agent: string, id: string): void {
  try {
    if (id) sessionStorage.setItem(agentRunKey(agent), id);
    else sessionStorage.removeItem(agentRunKey(agent));
  } catch {
    // No storage: the conversation lives while the page lives.
  }
}

/**
 * AgentChat is the conversation with an agent that sits on no bridge, as a
 * run: the first message starts it on a worker of the agent, a later one
 * follows up, and a slash command runs a skill in it. The manager starts
 * on its own member and opens its newest conversation. The conversation is
 * one-on-one, so the answer streams in while the run works.
 */
export function AgentChat({ agent }: { agent: string }) {
  useEffect(() => rememberOpen(hrefOf({ place: 'fleet', agent })), [agent]);
  const config = useSelect((s) => s.config);
  const fleet = useSelect((s) => s.fleet);
  const skills = useSelect((s) => (s.skills ? s.skills.skills : null));
  const loadable = useSelect((s) => s.agentSkills[agent]);
  const face = useSelect((s) => s.faces[agent]);
  useEffect(() => {
    loadAgentSkills(agent).catch(() => {});
  }, [agent]);
  const manager = config && config.manager && config.manager.agent === agent ? config.manager : null;
  // The conversation of this tab comes first, then the newest one of the manager.
  const [runId, setRunId] = useState(() => readRun(agent) || (manager ? manager.run : ''));
  const run = useSelect((s) => (runId ? s.runs[runId] : undefined));
  const res = useResult(runId);
  const t = useTranscript(runId);
  usePoll(runId);
  useEffect(() => {
    setRunId(readRun(agent) || (manager ? manager.run : ''));
  }, [agent, manager && manager.run]);
  const light = useSelect((s) => statusOf(selectFacts(s), { agent }));
  // The member of the fleet that serves the agent: a live one first.
  const member = manager
    ? manager.member
    : ((fleet ? fleet.members : []).filter((m) => m.agents.some((a) => a.name === agent)).sort((a, b) => (a.state === 'live' ? 0 : 1) - (b.state === 'live' ? 0 : 1))[0] || { name: '' }).name;
  const commands = useMemo(() => slashCommands(skills, loadable), [skills, loadable]);
  const names = useMemo(() => commands.map((c) => c.name), [commands]);
  const answers = useMemo(() => answerSeqs(t.items), [t.items]);
  const live = useLiveAnswer(runId, { working: works(run), seq: run ? run.seq : 0, mark: lastSeq(t.items, run), answers });
  // The end of the conversation: its newest item, the live answer, and a card that waits.
  const end = [t.items.length ? t.items[t.items.length - 1].seq : 0, live.text.length, live.tool, run && run.pending ? run.pending.id : ''].join(':');
  const stopped = !!run && ['failed', 'canceled'].includes(run.state);
  const [past, setPast] = useState(false);
  // open shows a conversation in this tab, or an empty one with "", and the tab remembers it.
  const open = (id: string) => {
    setRunId(id);
    keepRun(agent, id);
  };
  const send = async (text: string, files: Attachment[]): Promise<boolean> => {
    const fresh = !runId || stopped;
    const skill = fresh ? null : parseSlash(text, names);
    if (skill && files.length) {
      showError(new Error(NO_FILES_WITH_COMMAND));
      return false;
    }
    return attempt(async () => {
      if (fresh) {
        const r = await api.start(member, files.length ? { agent, input: text, files } : { agent, input: text }).catch((e) => {
          throw refusalOf(e, files.length);
        });
        store.dispatch({ type: 'run', run: r });
        setRunId(r.id);
        keepRun(agent, r.id);
        return;
      }
      if (skill) {
        const r = await api.runSkill(runId, skill);
        if (r && r.id) store.dispatch({ type: 'run', run: r });
        return;
      }
      await api.sendRun(runId, text, files).catch((e) => {
        throw refusalOf(e, files.length);
      });
      const r = await api.run(runId);
      store.dispatch({ type: 'run', run: r });
    });
  };
  const name = (face && face.displayName) || agent;
  return (
    <section class="screen member-main agent-chat" aria-labelledby="agent-chat-title">
      <PaneHeader
        id="agent-chat-title"
        title={agent}
        size="title"
        level={1}
        back={{ href: '#fleet', label: 'Fleet', to: 'list' }}
        lead={<ProfileLink href={hrefOf({ place: 'fleet', agent, profile: true })} agent={agent} label={name} light={light} />}
        actions={
          // The list pane of the Fleet place holds the members, so the past conversations open as a dialog from the menu.
          <Menu
            label="More"
            items={[
              ...(runId ? [{ label: 'New conversation', onSelect: () => open('') }] : []),
              { label: 'Past conversations', onSelect: () => setPast(true) },
              // A conversation that did a job once becomes a duty of this agent that does it again.
              ...(runId ? [{ label: 'Make this a duty', onSelect: () => go({ place: 'duties', fresh: true, seed: { agent, act: 'ask', message: askOfRun(run, t.items) } }) }] : []),
            ]}
          />
        }
      />
      <FollowBox end={end}>
        {runId ? <Conversation run={run} result={res} t={t} agentLabel={agent} live={live} /> : <div class="thread" />}
      </FollowBox>
      <Composer draft={'agent:' + agent} label={'Message to ' + agent} placeholder={'Message ' + agent} disabled={member ? '' : 'Keep 0'} commands={commands} attach onSend={(text, _to, files) => send(text, files)} />
      {past && (
        <PastConversations
          agent={agent}
          label={name}
          current={runId}
          onClose={() => setPast(false)}
          onPick={(r) => {
            store.dispatch({ type: 'run', run: r });
            open(r.id);
            setPast(false);
          }}
        />
      )}
    </section>
  );
}

/**
 * Fleet is the main pane of the Fleet place. With an agent in the address,
 * it holds the conversation with that agent. Without one, where two panes
 * show, it opens the first member, so the pane is never empty.
 */
export function Fleet({ agent }: { agent?: string }) {
  const { groups, loaded } = usePeople();
  // Where two panes show, the main pane opens the conversation of before, or the first member.
  const again = lastOpen && groups.some((g) => g.rows.some((r) => r.href === lastOpen)) ? lastOpen : '';
  const first = !agent && loaded ? again || (firstPerson(groups) || { href: '' }).href : '';
  useEffect(() => {
    if (first && window.matchMedia(TWO_PANES).matches) go(first, true);
  }, [first]);
  if (agent) return <AgentChat agent={agent} />;
  return (
    <EmptyPane back={{ href: '#fleet', label: 'Fleet' }}>
      {loaded && groups.length === 0 ? (
        <>
          <p>No agent yet.</p>
          <Button href="#new-agent" kind="primary">
            New agent
          </Button>
        </>
      ) : (
        <p>Loading the members.</p>
      )}
    </EmptyPane>
  );
}

/** AgentPane is the profile of an agent in the details pane. */
export function AgentPane({ agent }: { agent: string }) {
  return <Profile agent={agent} back={{ href: hrefOf({ place: 'fleet', agent }), label: agent }} />;
}

/**
 * ProfileLink is the mark at the head of a conversation, with the halo of
 * its status. It opens the profile of the agent, which a window narrower
 * than three panes keeps out of sight.
 */
export function ProfileLink({ href, agent, label, light }: { href: string; agent: string; label: string; light: { tone: Tone; word: string } | null }) {
  return (
    <a class="mark-link" href={href} aria-label={'Profile of ' + agent + (light ? ', ' + light.word : '')} title={light ? light.word : undefined}>
      <Mark agent={agent} size={36} label={label} halo={light ? { tone: light.tone, word: light.word } : undefined} />
    </a>
  );
}

