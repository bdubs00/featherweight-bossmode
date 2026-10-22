// The Fleet place. The list pane holds the people: the seats of every open
// bridge, grouped by bridge, then the agents that sit on no bridge, with a
// field to find a member and a key that switches to the board. The main
// pane holds the conversation with an agent that sits on no bridge, the
// manager among them, as a run. The details pane holds the profile.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { go, hrefOf, parseRoute, type Route } from '../lib/route';
import { awakeWorkers } from '../lib/workers';
import { store, useSelect } from '../state/store';
import { loadAgentSkills, loadAgents } from '../state/actions';
import { ensureRosters, ensureRuns, refreshAfterReset } from '../state/fetchers';
import { filterPeople, firstPerson, newestRun, peopleCount, peopleOf, slashCommands, workerLight, type PeopleGroup, type PersonRow } from '../state/people';
import { workersOf } from '../lib/workers';
import { parseSlash } from '../lib/mention';
import { useRoving } from './keys';
import { attempt } from './notice';
import { Composer } from './Composer';
import { Conversation, useTranscript, usePoll } from './Conversation';
import { useResult } from './RunPane';
import { useStickToEnd } from './Thread';
import { Profile } from './Profile';
import { EmptyPane } from './Shell';
import { Button, Chip, Find, IconButton, Led, Mark, PaneHeader } from './primitives';
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
 * needs: the agents, the record of each open bridge, and the newest run of
 * each seat that works, so a seat that waits in the queue says so.
 */
export function usePeople(): { groups: PeopleGroup[]; loaded: boolean } {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const runs = useSelect((s) => s.runs);
  const agents = useSelect((s) => s.agents);
  const fleet = useSelect((s) => s.fleet);
  useEffect(() => {
    if (!store.get().agents) attempt(loadAgents);
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
  const groups = useMemo(() => peopleOf({ bridges, rosters, runs, agents, fleet }), [bridges, rosters, runs, agents, fleet]);
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

/** FleetList is the list pane of the Fleet place: the people grouped by bridge, then Not on a bridge. */
export function FleetList({ current, member }: { current?: string; member?: string }) {
  const route = useHashRoute();
  const board = route.place === 'fleet' && !!route.board;
  const { groups, loaded } = usePeople();
  const awake = useSelect((s) => awakeWorkers(s.fleet));
  const knowFleet = useSelect((s) => !!s.fleet);
  const [q, setQ] = useState('');
  const shown = useMemo(() => filterPeople(groups, q), [groups, q]);
  const list = useRoving<HTMLDivElement>();
  const count = peopleCount(groups);
  const sel = member ? 'seat:' + member : current ? 'agent:' + current : '';
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
        {knowFleet && (
          <Chip label={awake === 1 ? '1 worker awake' : awake + ' workers awake'}>
            <Led tone="green" word={awake + ' awake'} />
          </Chip>
        )}
      </PaneHeader>
      <div class="list-find">
        <Find label="Find a member" value={q} onInput={setQ} />
      </div>
      <div class="scroll" ref={list}>
        {shown.map((g) => (
          <div class="people-group" role="group" aria-labelledby={'pg-' + (g.key || 'none')}>
            <div class="people-head" id={'pg-' + (g.key || 'none')}>
              {g.href ? (
                <a class="people-title clip" href={g.href}>
                  {g.title}
                </a>
              ) : (
                <span class="people-title muted clip">{g.title}</span>
              )}
              <span class="people-count" aria-label={g.count === 1 ? '1 member' : g.count + ' members'}>
                {g.count}
              </span>
            </div>
            <div role="list">
              {g.rows.map((r) => (
                <div role="listitem">
                  <PersonLink r={r} on={r.key === sel} />
                </div>
              ))}
            </div>
          </div>
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
 * on its own member and opens its newest conversation.
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
  const w = workersOf(fleet, agent);
  const light = workerLight(w);
  // The member of the fleet that serves the agent: a live one first.
  const member = manager
    ? manager.member
    : ((fleet ? fleet.members : []).filter((m) => m.agents.some((a) => a.name === agent)).sort((a, b) => (a.state === 'live' ? 0 : 1) - (b.state === 'live' ? 0 : 1))[0] || { name: '' }).name;
  const commands = useMemo(() => slashCommands(skills, loadable), [skills, loadable]);
  const names = useMemo(() => commands.map((c) => c.name), [commands]);
  const box = useStickToEnd<HTMLDivElement>(t.items.length);
  const stopped = !!run && ['failed', 'canceled'].includes(run.state);
  const send = async (text: string): Promise<boolean> =>
    attempt(async () => {
      if (!runId || stopped) {
        const r = await api.start(member, { agent, input: text });
        store.dispatch({ type: 'run', run: r });
        setRunId(r.id);
        keepRun(agent, r.id);
        return;
      }
      const skill = parseSlash(text, names);
      if (skill) {
        const r = await api.runSkill(runId, skill);
        if (r && r.id) store.dispatch({ type: 'run', run: r });
        return;
      }
      await api.sendRun(runId, text);
      const r = await api.run(runId);
      store.dispatch({ type: 'run', run: r });
    });
  const name = (face && face.displayName) || agent;
  return (
    <section class="screen member-main" aria-labelledby="agent-chat-title">
      <PaneHeader
        id="agent-chat-title"
        title={agent}
        size="title"
        level={1}
        back={{ href: '#fleet', label: 'Fleet', to: 'list' }}
        lead={<ProfileLink href={hrefOf({ place: 'fleet', agent, profile: true })} agent={agent} label={name} light={light} />}
      />
      <div class="scroll thread-scroll" ref={box}>
        {runId ? <Conversation run={run} result={res} t={t} agentLabel={agent} /> : <div class="thread" />}
      </div>
      <Composer draft={'agent:' + agent} label={'Message to ' + agent} placeholder={'Message ' + agent} disabled={member ? '' : 'Keep 0'} commands={commands} onSend={send} />
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

