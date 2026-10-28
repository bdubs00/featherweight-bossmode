// The Know-how place: what each agent learns on the job. The list pane
// holds the agents, the picker of the place, with the agents that need
// you first. The main pane holds one agent: the four numbers of its last
// 7 days with the line of the held-back runs, the switch Ask me before it
// keeps what it learns, and the tabs What it learned, Notes, and Routines.
// The changes that wait for a person show as cards on top of What it
// learned, as the routines that need a sign-off show in Routines, and
// each of the two tabs counts them in amber. docs/DESIGN.md, section
// 11.13, names the screen, and docs/KNOWHOW.md of the kernel holds the
// contract. Its words of section 2 are the only words on the screen.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import type { JournalEntry, WaitingChange } from '../api/knowhow';
import type { Agent } from '../api/types';
import { byWords, canDecide, conflictWords, entrySentence, figuresOf, heldBackLine, runLinks, undoRefusal, waitSentence, type Role, type Sentence } from '../lib/knowhow';
import { go, hrefOf, type KnowhowTab } from '../lib/route';
import { statusOf } from '../lib/routines';
import { clock, dayWords } from '../lib/words';
import { selectAgents } from '../state/agents';
import { decide, loadAgent, loadAllWaiting, loadOlder, setAskFirst, undo, useKnowhow, useKnowhowView } from '../state/knowhow';
import { loadRoutines, useRoutines, useRoutinesView } from '../state/routines';
import { useSelect } from '../state/store';
import { Switch } from './ChannelDialog';
import { KnowhowNotes } from './KnowhowNotes';
import { useRoving } from './keys';
import { showError, showSaid } from './notice';
import { Button, Card, Chip, Find, Help, Led, LineLed, Mark, PaneHeader, Tabs } from './primitives';
import { RoutineGroups } from './Routines';
import { EmptyPane } from './Shell';

/** The width from which two panes show side by side, as App names it. */
const TWO_PANES = '(min-width: 800px)';
/** The list of agents shows Find an agent past this many agents. */
const FIND_PAST = 10;

/** useAgentName is the name of an agent as its face names it. */
export function useAgentName(agent: string): string {
  return useSelect((s) => (s.faces[agent] && s.faces[agent].displayName) || agent);
}

/** useRole is the role of the person on an agent, as GET /v1/whoami names it: owner, operator, or another. */
export function useRole(agent: string): Role {
  return useSelect((s) => (s.me && s.me.roles ? s.me.roles[agent] : undefined));
}

/** useMe is the principal of the person. */
function useMe() {
  return useSelect((s) => (s.me ? s.me.principal : null));
}

/** useRoutinesOn reports whether the server keeps routines. An older server that does not say keeps them. */
function useRoutinesOn(): boolean {
  return useSelect((s) => !s.config || s.config.routines !== false);
}

/* ---------- the agents ---------- */

/** A row of the list of agents: the agent, what waits for a person, and the routines that need a sign-off. */
interface AgentRow {
  agent: Agent;
  waiting: number;
  signOff: number;
}

/** needWords say what needs the person, such as 2 changes wait and 1 routine needs a sign-off. */
function needWords(r: AgentRow): string {
  const parts: string[] = [];
  if (r.waiting) parts.push(r.waiting === 1 ? '1 change waits' : r.waiting + ' changes wait');
  if (r.signOff) parts.push(r.signOff === 1 ? '1 routine needs a sign-off' : r.signOff + ' routines need a sign-off');
  return parts.join(', ');
}

/**
 * useAgentRows lists the agents of the fleet, the agents that need you
 * first, then by name. It reads the changes that wait for every agent,
 * and the routines where the server keeps them.
 */
function useAgentRows(): { rows: AgentRow[] | null; need: AgentRow[]; rest: AgentRow[] } {
  const agents = useSelect(selectAgents);
  const all = useKnowhow((s) => s.allWaiting);
  const routinesOn = useRoutinesOn();
  const order = useRoutines((s) => s.order);
  const byKey = useRoutines((s) => s.byKey);
  useKnowhowView();
  useRoutinesView();
  useEffect(() => {
    loadAllWaiting().catch(() => {});
  }, []);
  useEffect(() => {
    if (routinesOn) loadRoutines().catch(() => {});
  }, [routinesOn]);
  return useMemo(() => {
    if (!agents) return { rows: null, need: [], rest: [] };
    const rows = agents.map((agent) => ({
      agent,
      waiting: (all || []).filter((c) => c.agent === agent.name).length,
      signOff: routinesOn ? (order || []).map((k) => byKey[k]).filter((r) => r && r.agent === agent.name && statusOf(r) === 'needs-you').length : 0,
    }));
    const need = rows.filter((r) => r.waiting || r.signOff);
    return { rows, need, rest: rows.filter((r) => !r.waiting && !r.signOff) };
  }, [agents, all, order, byKey, routinesOn]);
}

function AgentRowView({ r, on, tab }: { r: AgentRow; on: boolean; tab: KnowhowTab }) {
  const name = useAgentName(r.agent.name);
  const tagline = useSelect((s) => (s.faces[r.agent.name] && s.faces[r.agent.name].tagline) || r.agent.description || '');
  const need = needWords(r);
  return (
    <a class={'kh-row' + (on ? ' sel' : '') + (need ? ' need' : '')} href={hrefOf({ place: 'knowhow', agent: r.agent.name, tab: tab === 'learned' ? undefined : tab })} data-item aria-current={on ? 'page' : undefined}>
      <Mark agent={r.agent.name} size={32} selected={on} />
      <span class="kh-row-main">
        <span class="kh-row-top">
          <span class="kh-row-title">{name}</span>
          {need && <Led tone="amber" word="needs you" />}
        </span>
        {(need || tagline) && <span class="t-meta kh-row-meta">{need || tagline}</span>}
      </span>
    </a>
  );
}

/** KnowhowAgents is the list pane: the agents, the agents that need you first, with Find an agent past ten. */
export function KnowhowAgents({ current, tab = 'learned' }: { current?: string; tab?: KnowhowTab }) {
  const { rows, need, rest } = useAgentRows();
  const [q, setQ] = useState('');
  const list = useRoving<HTMLDivElement>();
  const words = q.trim().toLowerCase();
  const faces = useSelect((s) => s.faces);
  const match = (r: AgentRow) => !words || [r.agent.name, (faces[r.agent.name] && faces[r.agent.name].displayName) || ''].some((x) => x.toLowerCase().includes(words));
  const groups = [
    { key: 'need', title: 'Needs you', items: need.filter(match) },
    { key: 'rest', title: 'Agents', items: rest.filter(match) },
  ].filter((g) => g.items.length > 0);
  const heads = need.length > 0;
  return (
    <section class="screen kh-agents" aria-labelledby="kh-title">
      <PaneHeader id="kh-title" title="Know-how" count={rows ? rows.length : undefined} countLabel={rows && rows.length === 1 ? '1 agent' : (rows ? rows.length : 0) + ' agents'} />
      {rows && rows.length > FIND_PAST && (
        <div class="list-find">
          <Find label="Find an agent" value={q} onInput={setQ} />
        </div>
      )}
      <div class="scroll" ref={list}>
        {groups.map((g) => (
          <div class="rt-group" role="group" aria-labelledby={heads ? 'kh-g-' + g.key : undefined} aria-label={heads ? undefined : 'Agents'}>
            {heads && (
              <h3 class="rt-group-head" id={'kh-g-' + g.key}>
                <span>{g.title}</span>
                <Chip tone={g.key === 'need' ? 'amber' : 'plain'}>{g.items.length}</Chip>
              </h3>
            )}
            <div role="list" class="kh-rows">
              {g.items.map((r) => (
                <div role="listitem">
                  <AgentRowView r={r} on={r.agent.name === current} tab={tab} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {!rows && <p class="empty">Loading the agents.</p>}
        {rows && rows.length === 0 && <p class="empty">No agent yet.</p>}
        {rows && words && groups.length === 0 && <p class="empty">No agent holds those words.</p>}
      </div>
    </section>
  );
}

/* ---------- the main pane ---------- */

/**
 * KnowhowMain is the main pane. With an agent in the address, it shows
 * what that agent learned. Without one, where two panes show, it opens the
 * first agent of the list, so the pane is never empty.
 */
export function KnowhowMain({ agent, tab }: { agent?: string; tab: KnowhowTab }) {
  if (agent) return <KnowhowView agent={agent} tab={tab} />;
  return <KnowhowHome tab={tab} />;
}

function KnowhowHome({ tab }: { tab: KnowhowTab }) {
  const { rows, need, rest } = useAgentRows();
  const first = need[0] || rest[0];
  const href = first ? hrefOf({ place: 'knowhow', agent: first.agent.name, tab: tab === 'learned' ? undefined : tab }) : '';
  useEffect(() => {
    if (href && typeof window.matchMedia === 'function' && window.matchMedia(TWO_PANES).matches) go(href, true);
  }, [href]);
  return (
    <EmptyPane back={{ href: '#knowhow', label: 'Know-how' }}>
      <p>{!rows ? 'Loading the agents.' : rows.length === 0 ? 'No agent yet.' : 'Pick an agent.'}</p>
    </EmptyPane>
  );
}

function KnowhowView({ agent, tab: asked }: { agent: string; tab: KnowhowTab }) {
  const name = useAgentName(agent);
  const role = useRole(agent);
  const owner = role === 'owner';
  const off = useKnowhow((s) => s.off);
  const offReason = useKnowhow((s) => s.offReason);
  const routinesOn = useRoutinesOn();
  const signOff = useRoutines((s) => (s.order || []).map((k) => s.byKey[k]).filter((r) => r && r.agent === agent && statusOf(r) === 'needs-you').length);
  const waiting = useKnowhow((s) => (s.agents[agent] && s.agents[agent].waiting ? s.agents[agent].waiting!.length : 0));
  // A server without routines has no tab Routines, so its address shows What it learned.
  const tab: KnowhowTab = asked === 'routines' && !routinesOn ? 'learned' : asked;
  useKnowhowView();
  useRoutinesView();
  useEffect(() => {
    loadAgent(agent).catch(() => {});
  }, [agent]);
  // The count of the tab Routines needs the routines, also where the list of agents is out of sight.
  useEffect(() => {
    if (routinesOn) loadRoutines().catch(() => {});
  }, [routinesOn]);
  const items = [
    // Each tab counts in amber what waits for a person inside it: the changes to keep, and the routines to sign off.
    { id: 'learned', label: 'What it learned', href: hrefOf({ place: 'knowhow', agent }), count: waiting, countTone: 'amber' as const, countLabel: waiting === 1 ? '1 change waits' : waiting + ' changes wait' },
    { id: 'notes', label: 'Notes', href: hrefOf({ place: 'knowhow', agent, tab: 'notes' }) },
    ...(routinesOn
      ? [{ id: 'routines', label: 'Routines', href: hrefOf({ place: 'knowhow', agent, tab: 'routines' }), count: signOff, countTone: 'amber' as const, countLabel: signOff === 1 ? '1 routine needs a sign-off' : signOff + ' routines need a sign-off' }]
      : []),
  ];
  const tabs = <Tabs label={'Know-how of ' + name} current={tab} items={items} />;
  return (
    <section class="screen knowhow" aria-labelledby="kh-agent">
      <PaneHeader
        id="kh-agent"
        title={<span title={name}>{name}</span>}
        size="title"
        level={1}
        lead={<Mark agent={agent} size={36} label={name} />}
        back={{ href: '#knowhow', label: 'Know-how', to: 'list' }}
        actions={<span class="kh-tabs kh-tabs-head">{tabs}</span>}
      />
      <div class="kh-strip">
        <span class="kh-tabs">{tabs}</span>
      </div>
      <div class="scroll pad kh-body">
        {off ? (
          tab !== 'routines' && (
            <p class="t-meta">
              Know-how is off on this server. <Help label="Why Know-how is off">{offReason}</Help>
            </p>
          )
        ) : (
          <Head agent={agent} owner={owner} />
        )}
        {tab === 'learned' && !off && <Waiting key={agent} agent={agent} role={role} name={name} />}
        {tab === 'learned' && !off && <Journal agent={agent} role={role} name={name} />}
        {tab === 'notes' && !off && <KnowhowNotes agent={agent} name={name} />}
        {tab === 'routines' && (
          <section class="kh-sec" aria-label="Routines">
            <RoutineGroups agent={agent} />
          </section>
        )}
      </div>
    </section>
  );
}

/* ---------- the header ---------- */

/**
 * Head is the header of the place for one agent: the four numbers of its
 * last 7 days, the line that compares the held-back runs with the others,
 * and the switch Ask me before it keeps what it learns. A person who does
 * not own the agent gets no switch, and a line says when it is on.
 */
function Head({ agent, owner }: { agent: string; owner: boolean }) {
  const summary = useKnowhow((s) => s.agents[agent] && s.agents[agent].summary);
  const settings = useKnowhow((s) => s.agents[agent] && s.agents[agent].settings);
  const review = settings && settings.review;
  const error = useKnowhow((s) => (s.agents[agent] && s.agents[agent].errors.summary) || '');
  const [busy, setBusy] = useState(false);
  const f = summary ? figuresOf(summary) : null;
  const turn = async (on: boolean) => {
    setBusy(true);
    try {
      await setAskFirst(agent, on);
    } catch (e) {
      showError(e);
    }
    setBusy(false);
  };
  return (
    <section class="kh-head" aria-labelledby="kh-week">
      <h2 class="t-sub kh-sec-head" id="kh-week">
        Last 7 days
      </h2>
      {f && (
        <>
          <dl class="rt-figs kh-figs">
            {f.runs > 0 && (
              <>
                <div>
                  <dt>cost per job{f.trend ? ', ' + f.trend : ''}</dt>
                  <dd class="t-heading">{f.cost}</dd>
                </div>
                <div>
                  <dt>done by routines</dt>
                  <dd class="t-heading">{f.routines}</dd>
                </div>
              </>
            )}
            <div>
              <dt>notes corrected</dt>
              <dd class="t-heading">{f.corrected}</dd>
            </div>
          </dl>
          <p class="kh-held">{f.runs > 0 ? heldBackLine(summary!) : 'No runs in the last 7 days.'}</p>
        </>
      )}
      {!f && <p class="t-meta">{error || 'Loading the figures.'}</p>}
      {owner && settings && (
        <div class="kh-switch">
          <Switch label="Ask me before it keeps what it learns" on={settings.askFirst} disabled={busy} onChange={turn} />
        </div>
      )}
      {!owner && settings && settings.askFirst && <p class="t-meta kh-asks">It asks an owner before it keeps what it learns.</p>}
      {review && !review.on && <p class="t-meta kh-review">{review.reason || 'The after-work review is off: no agent is set.'}</p>}
    </section>
  );
}

/* ---------- the changes that wait ---------- */

/** SentenceText draws a sentence with the name of its subject in bold. */
function SentenceText({ s }: { s: Sentence }) {
  return (
    <>
      {s.head}
      {s.name && <b>{s.name}</b>}
      {s.tail}
    </>
  );
}

/** Runs links the runs of an entry or of a change on the page at /ui. */
function Runs({ runs }: { runs?: string[] }) {
  const links = runLinks(runs);
  if (!links.length) return null;
  return (
    <span class="kh-runs">
      {links.map((l) => (
        <a href={l.href} title={l.run}>
          {l.label}
        </a>
      ))}
    </span>
  );
}

/**
 * Waiting holds the changes that wait for a person under the switch, as
 * cards: Keep this? with Not now and Keep. A card that arrives after the
 * first read settles once. A 409 means that the note or the routine
 * changed since: the page reads the changes again, and a quiet line says
 * so above the cards.
 */
function Waiting({ agent, role, name }: { agent: string; role: Role; name: string }) {
  const list = useKnowhow((s) => s.agents[agent] && s.agents[agent].waiting);
  const [said, setSaid] = useState('');
  // The changes of the first read never move. The pane draws a new Waiting for each agent, so a change of agent starts again.
  const seen = useRef<Set<string> | null>(null);
  if (list && !seen.current) seen.current = new Set(list.map((c) => c.id));
  if (!list || (list.length === 0 && !said)) return null;
  return (
    <section class="kh-waiting" aria-label="Changes that wait for you">
      {said && (
        <p class="rt-changed" role="status">
          <LineLed tone="grey" />
          {said}
        </p>
      )}
      {list.map((c) => (
        <KeepCard key={c.id} c={c} agent={agent} role={role} name={name} settle={!!seen.current && !seen.current.has(c.id)} onSaid={setSaid} />
      ))}
    </section>
  );
}

function KeepCard({ c, agent, role, name, settle, onSaid }: { c: WaitingChange; agent: string; role: Role; name: string; settle: boolean; onSaid: (s: string) => void }) {
  const me = useMe();
  // A change of the own notes of the person needs the operator role, any other change the owner role.
  const owner = canDecide(c.subject, me, role);
  const [busy, setBusy] = useState(false);
  const act = async (keep: boolean) => {
    setBusy(true);
    onSaid('');
    try {
      await decide(agent, c.id, keep);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) onSaid(conflictWords(c.subject));
      else showError(e);
    }
    setBusy(false);
  };
  return (
    <Card
      class="kh-card"
      title="Keep this?"
      tone={owner ? 'amber' : 'grey'}
      quiet={!owner}
      settle={settle}
      label="Keep this?"
      actions={
        owner ? (
          <>
            <Button disabled={busy} onClick={() => act(false)}>
              Not now
            </Button>
            <Button kind="primary" disabled={busy} onClick={() => act(true)}>
              Keep
            </Button>
          </>
        ) : undefined
      }
    >
      <p class="kh-what">
        <SentenceText s={waitSentence(c)} />
      </p>
      {c.text && <p class="kh-text">{c.text}</p>}
      {c.why && <p class="kh-why">{c.why}</p>}
      <Runs runs={c.runs} />
      {!owner && <p class="t-meta">Waits for a decision of an owner of {name}.</p>}
    </Card>
  );
}

/* ---------- What it learned ---------- */

/** Journal is the tab What it learned: the entries of the journal by day, newest first, each with its time, its sentence, its runs, and Undo. */
function Journal({ agent, role, name }: { agent: string; role: Role; name: string }) {
  const entries = useKnowhow((s) => s.agents[agent] && s.agents[agent].journal);
  const more = useKnowhow((s) => !!(s.agents[agent] && s.agents[agent].more));
  const error = useKnowhow((s) => (s.agents[agent] && s.agents[agent].errors.journal) || '');
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => {
    const out: { day: string; items: JournalEntry[] }[] = [];
    for (const e of entries || []) {
      const day = dayWords(e.at);
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [entries]);
  const older = async () => {
    setBusy(true);
    try {
      await loadOlder(agent);
    } catch (e) {
      showError(e);
    }
    setBusy(false);
  };
  return (
    <section class="kh-sec kh-journal" aria-label="What it learned">
      {days.map((d) => (
        <div class="kh-day">
          <h3 class="kh-day-head">{d.day}</h3>
          <ol class="kh-entries">
            {d.items.map((e) => (
              <EntryRow key={e.id} e={e} agent={agent} role={role} name={name} />
            ))}
          </ol>
        </div>
      ))}
      {!entries && <p class="t-meta">{error || 'Loading what it learned.'}</p>}
      {entries && entries.length === 0 && <p class="t-meta">Nothing learned yet.</p>}
      {more && (
        <Button kind="quiet" size="s" disabled={busy} onClick={older}>
          Show older
        </Button>
      )}
    </section>
  );
}

function EntryRow({ e, agent, role, name }: { e: JournalEntry; agent: string; role: Role; name: string }) {
  const me = useMe();
  // An entry can be taken back once, by a person who may change its note or its routine.
  const may = !!e.undo && !e.undoneBy && canDecide(e.subject, me, role);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState(false);
  const s = entrySentence(e);
  const by = byWords(e.by, me, name);
  const d = new Date(e.at);
  const take = async () => {
    setBusy(true);
    setRefused(false);
    try {
      await undo(agent, e.id);
      showSaid('Undone: ' + s.head + s.name + s.tail);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setRefused(true);
      else showError(err);
    }
    setBusy(false);
  };
  return (
    <li class="kh-entry">
      <time class="kh-time" dateTime={e.at} title={isNaN(d.getTime()) ? undefined : d.toLocaleString()}>
        {clock(e.at)}
      </time>
      <div class="kh-entry-main">
        <p class="kh-what">
          <SentenceText s={s} />
        </p>
        {e.why && <p class="kh-why">{e.why}</p>}
        {(by || (e.runs && e.runs.length > 0)) && (
          <p class="kh-meta">
            {by && <span>By {by}</span>}
            <Runs runs={e.runs} />
          </p>
        )}
        {refused && (
          <p class="rt-changed kh-refused" role="status">
            <LineLed tone="grey" />
            {undoRefusal(e.subject)}
          </p>
        )}
      </div>
      {may && (
        <Button kind="quiet" size="s" class="kh-undo" disabled={busy} onClick={take}>
          Undo
        </Button>
      )}
    </li>
  );
}
