// An agent: its face, what it does, the channels it works in, the jobs it
// does, and what it learned. A note that waits shows Keep and Not now. The
// setup of the agent (its tools, its rules, its budget) stays in the older
// place behind Set up.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { knowhowApi, type JournalEntry } from '../../api/knowhow';
import { useSelect } from '../../state/store';
import { selectFacts } from '../../state/reducer';
import { seatsOfAgent } from '../../state/people';
import { useDuties } from '../../state/duties';
import { statusOf } from '../../lib/status';
import { dutyTitle } from '../../lib/duties';
import { attempt, showSaid } from '../notice';
import { Glyph } from '../icons';
import { Button, Led, Mark } from '../primitives';
import { agentStatus, type Status } from './channels';
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

export function AgentView({ name }: { name: string }) {
  const title = useSelect((s) => agentNameOf(s, name));
  const face = useSelect((s) => s.faces[name]);
  const facts = useSelect(selectFacts);
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const duties = useDuties((s) => s.list);
  const waiting = useWaiting().filter((w) => w.agent === name);
  const [journal, setJournal] = useState<JournalEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    knowhowApi.journal(name, 10).then(
      (j) => live && setJournal(j),
      () => live && setJournal([]),
    );
    return () => {
      live = false;
    };
  }, [name]);
  const seats = useMemo(() => seatsOfAgent({ bridges, rosters }, name), [bridges, rosters, name]);
  const jobs = (duties || []).filter((d) => d.agent === name);
  // An agent is working or needs you when one of its channels says so, else idle while it is awake, else asleep.
  const status: Status = useMemo(() => {
    const ss = seats.map((x) => agentStatus(facts, x.member));
    const urgent = ss.find((x) => x.word === 'needs you') || ss.find((x) => x.word === 'working');
    if (urgent) return urgent;
    const l = statusOf(facts, { agent: name });
    if (l && l.word === 'awake') return { word: 'idle', tone: 'grey' };
    if (l && l.word === 'failed') return { word: 'stopped', tone: 'red' };
    return { word: l ? l.word : 'asleep', tone: 'grey' };
  }, [seats, facts, name]);
  const decide = async (id: string, keep: boolean) => {
    const ok = await attempt(() => knowhowApi.decide(id, keep));
    if (!ok) return;
    showSaid(keep ? 'Kept the note.' : 'Left the note out.');
    reloadWaiting();
  };
  return (
    <section class="cf-view cf-agent" aria-labelledby="cf-agent-title">
      <header class="cf-head">
        <a class="cf-back" href="#" aria-label="Back">
          <Glyph name="back" size={20} />
        </a>
        <Mark agent={name} size={32} />
        <h1 class="cf-title" id="cf-agent-title">
          {title}
        </h1>
        <Led tone={status.tone} word={status.word} still={status.tone === 'amber' ? undefined : true} />
        <span class="grow" />
        <Button size="s" href={'#fleet/' + encodeURIComponent(name) + '/profile'}>
          Set up
        </Button>
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
                  <Clock /> <a href={chatHref({ view: 'job', name: d.name })}>{dutyTitle(d)}</a> <span class="cf-post-quiet">{d.paused ? 'paused' : d.readback || ''}</span>
                </li>
              ))}
            </ul>
          </section>
          <section class="cf-asec">
            <h2 class="cf-asec-head">What it learned</h2>
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
