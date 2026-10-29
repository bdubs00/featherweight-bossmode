// An agent: its face, what it does, the channels it works in, the jobs it
// does, and what it learned. A note that waits shows Keep and Not now. The
// setup of the agent (its tools, its rules, its budget) stays in the older
// place behind Set up.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { knowhowApi, type JournalEntry, type KnowhowSettings, type KnowhowSummary, type NoteItem } from '../../api/knowhow';
import { heldBackLine } from '../../lib/knowhow';
import { selectAgents } from '../../state/agents';
import { Switch } from '../ChannelDialog';
import { routinesApi, type RoutineRecord } from '../../api/routines';
import { Profile } from '../Profile';
import { useSelect } from '../../state/store';
import { selectFacts } from '../../state/reducer';
import { seatsOfAgent } from '../../state/people';
import { useDuties } from '../../state/duties';
import { statusOf } from '../../lib/status';
import { dutyTitle } from '../../lib/duties';
import { attempt, showSaid } from '../notice';
import { Glyph } from '../icons';
import { Button, Led, Mark } from '../primitives';
import { agentStatus, pageWords, type Status } from './channels';
import { agentNameOf, reloadWaiting, useWaiting } from './data';
import { Clock } from './Sidebar';
import { chatHref } from './route';
import { shortTime } from './channels';

/** The words of the journal of an agent, one per change. */
const JOURNAL: Record<string, string> = {
  learned: 'Learned',
  updated: 'Updated',
  'out-of-date': 'Out of date',
  resting: 'Resting',
  'put-away': 'Put away',
  undone: 'Undone',
  proposed: 'Proposed a routine',
  rehearsing: 'Rehearses',
  live: 'Went live',
  'stepped-back': 'Stepped back',
  retired: 'Retired',
  paused: 'Paused',
  'stays-out': 'Stays out',
};

/** useAgentStatus is the status of an agent: working or needs you when one of its channels says so, else idle while it is awake, else asleep. */
export function useAgentStatus(name: string): Status {
  const facts = useSelect(selectFacts);
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  return useMemo(() => {
    const ss = seatsOfAgent({ bridges, rosters }, name).map((x) => agentStatus(facts, x.member));
    const urgent = ss.find((x) => x.word === 'needs you') || ss.find((x) => x.word === 'working');
    if (urgent) return urgent;
    const l = statusOf(facts, { agent: name });
    if (l && l.word === 'awake') return { word: 'idle', tone: 'grey' };
    if (l && l.word === 'failed') return { word: 'stopped', tone: 'red' };
    return { word: l && l.word !== 'starting' ? l.word : l ? 'starting' : 'asleep', tone: 'grey' };
  }, [bridges, rosters, facts, name]);
}

/** The words of the state of a note. A note is current, out of date, or resting, and never checked. */
export function noteWords(state: NoteItem['state']): string {
  switch (state) {
    case 'out-of-date':
      return 'out of date';
    case 'resting':
      return 'resting';
    case 'waiting':
      return 'waits for you';
    case 'put-away':
      return 'put away';
  }
  return 'current';
}

/** The words of the standing of a routine. */
const STANDING: Record<string, string> = { proposed: 'proposed', rehearsing: 'rehearses', live: 'live', paused: 'paused', retired: 'retired' };

/** useRead reads a list once per agent, and holds null before the answer and an empty list after a failure. */
function useRead<T>(name: string, read: (name: string) => Promise<T[]>): T[] | null {
  const [list, setList] = useState<T[] | null>(null);
  useEffect(() => {
    let live = true;
    setList(null);
    read(name).then(
      (x) => live && setList(x),
      () => live && setList([]),
    );
    return () => {
      live = false;
    };
  }, [name]);
  return list;
}

export function AgentView({ name }: { name: string }) {
  const title = useSelect((s) => agentNameOf(s, name));
  const face = useSelect((s) => s.faces[name]);
  const facts = useSelect(selectFacts);
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const duties = useDuties((s) => s.list);
  const waiting = useWaiting().filter((w) => w.agent === name);
  const journal = useRead<JournalEntry>(name, (a) => knowhowApi.journal(a, 10));
  const notes = useRead<NoteItem>(name, (a) => knowhowApi.notes(a));
  const routines = useRead<RoutineRecord>(name, (a) => routinesApi.list(a).then((r) => r.routines));
  const seats = useMemo(() => seatsOfAgent({ bridges, rosters }, name), [bridges, rosters, name]);
  const jobs = (duties || []).filter((d) => d.agent === name);
  const status = useAgentStatus(name);
  const decide = async (id: string, keep: boolean) => {
    const ok = await attempt(() => knowhowApi.decide(id, keep));
    if (!ok) return;
    showSaid(keep ? 'Kept the note.' : 'Left the note out.');
    reloadWaiting();
  };
  const shownNotes = (notes || []).filter((n) => n.state !== 'put-away');
  const summary = useRead<KnowhowSummary>(name, (a) => knowhowApi.summary(a, 7).then((x) => (x ? [x] : [])));
  const week = summary && summary[0];
  const owner = useSelect((s) => ((selectAgents(s) || []).find((a) => a.name === name) || { role: '' }).role === 'owner');
  const [settings, setSettings] = useState<KnowhowSettings | null>(null);
  const [turning, setTurning] = useState(false);
  useEffect(() => {
    let live = true;
    setSettings(null);
    knowhowApi.settings(name).then(
      (x) => live && setSettings(x || { askFirst: false }),
      () => live && setSettings(null),
    );
    return () => {
      live = false;
    };
  }, [name]);
  const turn = async (on: boolean) => {
    setTurning(true);
    const ok = await attempt(async () => {
      const x = await knowhowApi.setAskFirst(name, on);
      setSettings(x || { askFirst: on });
    });
    setTurning(false);
    if (ok) showSaid(on ? title + ' asks you before it keeps a note.' : title + ' keeps its notes without asking.');
  };
  return (
    <section class="cf-view cf-agent" aria-labelledby="cf-agent-title">
      <header class="cf-head">
        <a class="cf-back" href={chatHref({ view: 'agents' })} aria-label="Back to the agents">
          <Glyph name="back" size={20} />
        </a>
        <Mark agent={name} size={32} />
        <h1 class="cf-title" id="cf-agent-title">
          {title}
        </h1>
        <Led tone={status.tone} word={status.word} still={status.tone === 'amber' ? undefined : true} />
        <span class="grow" />
        <a class="cf-members-key" href={chatHref({ view: 'agent', name, setup: true })}>
          Setup
        </a>
      </header>
      <div class="scroll cf-stream">
        <div class="cf-stream-in cf-agent-in">
          {face && face.tagline && <p class="cf-agent-tag">{face.tagline}</p>}
          {waiting.length > 0 && (
            <section class="cf-asec">
              <h2 class="cf-asec-head">Waits for you</h2>
              {waiting.map((w) => (
                <div class="cf-suggest">
                  <p class="cf-suggest-head">{w.what === 'updated' ? 'Keep this change to a note?' : 'Keep this note?'}</p>
                  {w.text && <p>{w.text}</p>}
                  {w.why && <p class="cf-post-quiet">{w.why}</p>}
                  <div class="cf-suggest-keys">
                    <Button size="s" onClick={() => decide(w.id, false)}>
                      Not now
                    </Button>
                    <Button size="s" kind="primary" onClick={() => decide(w.id, true)}>
                      Keep
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          )}
          <section class="cf-asec">
            <h2 class="cf-asec-head">Works in</h2>
            {seats.length === 0 && <p class="cf-post-quiet">No open channel.</p>}
            <ul class="cf-alist">
              {seats.map((x) => {
                const st = agentStatus(facts, x.member);
                const b = bridges.byId[x.bridge];
                return (
                  <li>
                    <a href={chatHref({ view: 'channel', id: x.bridge, tab: 'posts' })}># {b ? b.title : x.bridge}</a> <span class="cf-post-quiet">as {x.member.handle}</span> <Led tone={st.tone} word={st.word} still={st.tone === 'amber' ? undefined : true} />
                  </li>
                );
              })}
            </ul>
          </section>
          <section class="cf-asec">
            <h2 class="cf-asec-head">Jobs</h2>
            {jobs.length === 0 && <p class="cf-post-quiet">No job repeats with this agent.</p>}
            <ul class="cf-alist">
              {jobs.map((d) => (
                <li>
                  <Clock /> <a href={chatHref({ view: 'job', name: d.name })}>{dutyTitle(d)}</a> <span class="cf-post-quiet">{d.paused ? 'paused' : pageWords(d.readback || '')}</span>
                </li>
              ))}
            </ul>
          </section>
          {routines && routines.length > 0 && (
            <section class="cf-asec">
              <h2 class="cf-asec-head">Routines of its jobs</h2>
              <ul class="cf-alist">
                {routines.map((r) => (
                  <li>
                    <a href={'#routines/' + encodeURIComponent(r.agent) + '/' + encodeURIComponent(r.routine.name)}>{r.routine.name}</a> <span class="cf-post-quiet">{STANDING[r.standing] || r.standing}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section class="cf-asec">
            <h2 class="cf-asec-head">Notes</h2>
            {notes === null && <p class="cf-post-quiet">Loading.</p>}
            {notes && shownNotes.length === 0 && <p class="cf-post-quiet">No note yet.</p>}
            <ul class="cf-alist cf-notes">
              {shownNotes.map((n) => (
                <li>
                  <strong>{n.name}</strong> <span class={'cf-note-state' + (n.state === 'out-of-date' ? ' stale' : '')}>{noteWords(n.state)}</span>
                  {n.description && <span class="cf-note-desc">{n.description}</span>}
                </li>
              ))}
            </ul>
          </section>
          <section class="cf-asec">
            <h2 class="cf-asec-head">What it learned</h2>
            {week && (week.costPerJob ? week.costPerJob.runs > 0 : true) && <p class="cf-learn-line">{heldBackLine(week)}</p>}
            {owner && settings && <Switch label="Ask me before it keeps a note" on={settings.askFirst} disabled={turning} onChange={turn} />}
            {!owner && settings && settings.askFirst && <p class="cf-post-quiet">It asks an owner before it keeps a note.</p>}
            {journal === null && <p class="cf-post-quiet">Loading.</p>}
            {journal && journal.length === 0 && <p class="cf-post-quiet">Nothing yet.</p>}
            <ul class="cf-alist">
              {(journal || []).map((j) => (
                <li>
                  <strong>{JOURNAL[j.what] || j.what.replace(/-/g, ' ')}</strong> {j.why} <span class="cf-post-quiet">{shortTime(j.at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}

/** AgentSetup is the pane at the right of an agent: what it can do, its face, its hearts, and its packages, as the owner sets them up. */
export function AgentSetup({ name }: { name: string }) {
  return (
    <div class="cf-setup">
      <Profile agent={name} setup back={{ href: chatHref({ view: 'agent', name }), label: 'the agent' }} />
    </div>
  );
}
