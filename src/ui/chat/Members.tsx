// Members, the pane at the right of a channel: its agents with their status
// and what each does now, its people, the jobs that repeat in it with Make
// this a job, and the files that it wrote. Edit adds an agent to the channel
// or takes one off. The scheduler places the work of each agent: the pane
// never says where an agent runs.

import { useMemo, useState } from 'preact/hooks';
import type { Duty } from '../../api/types';
import { useSelect } from '../../state/store';
import { membersOf, selectFacts } from '../../state/reducer';
import { useDuties } from '../../state/duties';
import { useBridgePages } from '../../state/bridgepages';
import { addMember, fire } from '../../state/actions';
import { selectAgents } from '../../state/agents';
import { dutyTitle } from '../../lib/duties';
import { personName } from '../../lib/words';
import { canSeat } from '../../lib/agents';
import { attempt, showSaid } from '../notice';
import { Glyph } from '../icons';
import { Avatar, Button, Led, Mark } from '../primitives';
import { agentStatus, jobsOf, nowWords, pageWords, peopleOf } from './channels';
import { entriesOf } from '../../state/reducer';
import { agentNameOf } from './data';
import { Clock } from './Sidebar';
import { MakeJob } from './MakeJob';
import { chatHref } from './route';
import { newestRun } from '../../state/people';

/** handleFor makes a free handle for a new agent of a channel: its name, then its name with a number. */
export function handleFor(agent: string, taken: string[]): string {
  if (!taken.includes(agent)) return agent;
  for (let i = 2; ; i++) if (!taken.includes(agent + '-' + i)) return agent + '-' + i;
}

/** jobLine says the schedule and the agent of a job, such as Every weekday at 4:00 PM · Scribe. */
function jobLine(d: Duty, name: string): string {
  return [pageWords(d.readback || ''), name].filter(Boolean).join(' · ');
}

function JobsHere({ id, jobs }: { id: string; jobs: Duty[] }) {
  const faces = useSelect((s) => s.faces);
  const [make, setMake] = useState(false);
  return (
    <section class="cf-msec" aria-labelledby="cf-jobs-here">
      <h3 class="cf-msec-head" id="cf-jobs-here">
        <span>Jobs here</span>
        <span class="cf-sec-n">{jobs.length}</span>
      </h3>
      {jobs.map((d) => (
        <a class="cf-mrow" href={chatHref({ view: 'job', name: d.name })}>
          <span class="cf-mrow-ic">
            <Clock />
          </span>
          <span class="cf-mrow-main">
            <span class="cf-mrow-top">
              <strong>{dutyTitle(d)}</strong>
              {d.paused ? <Led tone="grey" word="paused" still /> : <Led tone="green" word="running" />}
            </span>
            <span class="cf-mrow-line">{jobLine(d, agentNameOf({ faces }, d.agent))}</span>
          </span>
        </a>
      ))}
      <button type="button" class="cf-link-key" onClick={() => setMake(true)}>
        Make this a job
      </button>
      {make && <MakeJob bridge={id} onClose={() => setMake(false)} />}
    </section>
  );
}

function Files({ id }: { id: string }) {
  const { pages, loaded, failed } = useBridgePages(id);
  return (
    <section class="cf-msec" aria-labelledby="cf-files">
      <h3 class="cf-msec-head" id="cf-files">
        <span>Files</span>
        <span class="cf-sec-n">{pages.length}</span>
      </h3>
      {!loaded && !failed && <p class="cf-side-note">Loading the files.</p>}
      {failed && <p class="cf-side-note">{failed}</p>}
      {loaded && pages.length === 0 && <p class="cf-side-note">Nothing written yet.</p>}
      <ul class="cf-files">
        {pages.map((p) => (
          <li>
            <a href={'#pages/' + p.path.split('/').map(encodeURIComponent).join('/')} title={p.path}>
              {p.path.split('/').pop()}
            </a>
            {p.version ? <span class="cf-file-v"> · v{p.version}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** AddAgent is the picker of Edit: an agent that the person can start, and Add. */
function AddAgent({ id, taken }: { id: string; taken: string[] }) {
  const agents = useSelect(selectAgents);
  const faces = useSelect((s) => s.faces);
  const manager = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : ''));
  const goal = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].goal || s.bridges.byId[id].title : ''));
  const [agent, setAgent] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (agents || []).filter((a) => a.name !== 'default' && a.name !== manager && canSeat(a));
  return (
    <div class="cf-add">
      <label class="t-meta" for="cf-add-agent">
        Add an agent
      </label>
      <div class="cf-add-row">
        <select id="cf-add-agent" class="recess" value={agent} onChange={(e) => setAgent((e.target as HTMLSelectElement).value)}>
          <option value="">Pick one</option>
          {list.map((a) => (
            <option value={a.name}>{agentNameOf({ faces }, a.name)}</option>
          ))}
        </select>
        <Button
          size="s"
          aria-disabled={!agent || busy || undefined}
          onClick={async () => {
            if (!agent || busy) return;
            setBusy(true);
            const handle = handleFor(agent, taken);
            const ok = await attempt(() => addMember(id, { handle, agent, task: goal }));
            setBusy(false);
            if (ok) {
              showSaid('Added ' + handle + ' to the channel.');
              setAgent('');
            }
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

export function Members({ id }: { id: string }) {
  const b = useSelect((s) => s.bridges.byId[id]);
  const roster = useSelect((s) => s.rosters[id]);
  const facts = useSelect(selectFacts);
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const meName = useSelect((s) => (s.me && s.me.principal ? s.me.principal.name : undefined));
  const duties = useDuties((s) => s.list);
  const [edit, setEdit] = useState(false);
  const agents = useMemo(() => membersOf(roster).filter((m) => m && !m.fired), [roster]);
  const channel = useSelect((s) => s.channels[id]);
  const entries = useMemo(() => entriesOf(channel), [channel]);
  const jobs = useMemo(() => jobsOf(id, duties), [id, duties]);
  if (!b) return null;
  const closed = b.state === 'closed';
  const people = peopleOf(b.operator, me, entries);
  return (
    <section class="cf-members" aria-labelledby="cf-members-h">
      <header class="cf-head cf-head-right">
        <a class="cf-back" href={chatHref({ view: 'channel', id, tab: 'posts' })} aria-label="Back to the channel">
          <Glyph name="back" size={20} />
        </a>
        <h2 class="cf-title cf-title-s" id="cf-members-h">
          Members
        </h2>
        {!closed && (
          <Button size="s" aria-pressed={edit} onClick={() => setEdit(!edit)}>
            {edit ? 'Done' : 'Edit'}
          </Button>
        )}
      </header>
      <div class="cf-members-scroll">
        <section class="cf-msec" aria-labelledby="cf-agents-h">
          <h3 class="cf-msec-head" id="cf-agents-h">
            <span>Agents</span>
            <span class="cf-sec-n">{agents.length}</span>
          </h3>
          {!roster && <p class="cf-side-note">Loading the agents.</p>}
          {agents.map((m) => {
            const st = agentStatus(facts, m);
            return (
              <div class="cf-mrow">
                <a class="cf-mrow-face" href={chatHref({ view: 'agent', name: m.agent })} aria-label={'About ' + m.handle}>
                  <Mark agent={m.agent} size={32} />
                </a>
                <span class="cf-mrow-main">
                  <span class="cf-mrow-top">
                    <strong>{m.handle}</strong>
                    <Led tone={st.tone} word={st.word} still={st.tone === 'amber' ? undefined : true} />
                  </span>
                  <span class="cf-mrow-line">{nowWords(m, facts.runs[newestRun(m)])}</span>
                </span>
                {edit && (
                  <Button
                    size="s"
                    kind="quiet"
                    aria-label={'Take ' + m.handle + ' off the channel'}
                    onClick={async () => {
                      const ok = await attempt(() => fire(id, m.handle));
                      if (ok) showSaid('Took ' + m.handle + ' off the channel.');
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            );
          })}
          {edit && <AddAgent id={id} taken={membersOf(roster).map((m) => m.handle)} />}
        </section>
        <section class="cf-msec" aria-labelledby="cf-people-h">
          <h3 class="cf-msec-head" id="cf-people-h">
            <span>People</span>
            <span class="cf-sec-n">{people.length}</span>
          </h3>
          {people.map((p) => {
            const name = p.subject === me ? meName || personName(p.subject) : p.display || personName(p.subject);
            const part = [p.subject === b.operator ? 'Asked for this' : '', p.subject === me ? 'you' : ''].filter(Boolean).join(', ');
            return (
              <div class="cf-mrow">
                <Avatar subject={p.subject} display={name} size={32} />
                <span class="cf-mrow-main">
                  <span class="cf-mrow-top">
                    <strong>{name}</strong>
                  </span>
                  {part && <span class="cf-mrow-line">{part}</span>}
                </span>
              </div>
            );
          })}
        </section>
        <JobsHere id={id} jobs={jobs} />
        <Files id={id} />
      </div>
    </section>
  );
}
