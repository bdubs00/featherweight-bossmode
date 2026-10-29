// Agents: every agent of the workspace, each with its face, its status,
// what it does, and the channels and the jobs where it works, and New agent
// for a person who can make one. An agent opens its view, with its setup at
// the right.

import { useMemo } from 'preact/hooks';
import type { Agent } from '../../api/types';
import { useSelect } from '../../state/store';
import { selectAgents } from '../../state/agents';
import { seatsOfAgent } from '../../state/people';
import { useDuties } from '../../state/duties';
import { mayCreateAgent } from '../../lib/agents';
import { dutyTitle } from '../../lib/duties';
import { Glyph } from '../icons';
import { Button, Led, Mark } from '../primitives';
import { useAgentStatus } from './AgentView';
import { agentNameOf } from './data';
import { chatHref } from './route';

function AgentRow({ a, manager }: { a: Agent; manager: boolean }) {
  const name = useSelect((s) => agentNameOf(s, a.name));
  const face = useSelect((s) => s.faces[a.name]);
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const duties = useDuties((s) => s.list);
  const status = useAgentStatus(a.name);
  const channels = useMemo(() => [...new Set(seatsOfAgent({ bridges, rosters }, a.name).map((x) => x.bridge))], [bridges, rosters, a.name]);
  const jobs = (duties || []).filter((d) => d.agent === a.name);
  const does = (face && face.tagline) || a.description || '';
  return (
    <li class="cf-agent-row">
      <a class="cf-agent-link" href={manager ? chatHref({ view: 'manager' }) : chatHref({ view: 'agent', name: a.name })}>
        <Mark agent={a.name} size={36} ink={manager || undefined} />
        <span class="cf-agent-main">
          <span class="cf-agent-top">
            <strong>{name}</strong>
            <Led tone={status.tone} word={status.word} still={status.tone === 'amber' ? undefined : true} />
          </span>
          {does && <span class="cf-agent-does">{does}</span>}
          {(channels.length > 0 || jobs.length > 0) && (
            <span class="cf-agent-where">
              {channels.map((id) => (
                <span class="cf-tag">
                  <span aria-hidden="true"># </span>
                  {bridges.byId[id] ? bridges.byId[id].title : id}
                </span>
              ))}
              {jobs.map((d) => (
                <span class="cf-tag cf-tag-job">{dutyTitle(d)}</span>
              ))}
            </span>
          )}
        </span>
        <Glyph name="back" size={14} class="cf-agent-go" />
      </a>
    </li>
  );
}

export function AgentsView() {
  const agents = useSelect(selectAgents);
  const manager = useSelect((s) => (s.config && s.config.manager ? s.config.manager.agent : ''));
  const make = useSelect((s) => mayCreateAgent(s.me));
  // The profile default is the front itself, which no person talks to.
  const list = useMemo(() => {
    const all = (agents || []).filter((a) => a.name !== 'default');
    return [...all.filter((a) => a.name === manager), ...all.filter((a) => a.name !== manager)];
  }, [agents, manager]);
  return (
    <section class="cf-view cf-agents" aria-labelledby="cf-agents-title">
      <header class="cf-head">
        <a class="cf-back" href="#" aria-label="Back">
          <Glyph name="back" size={20} />
        </a>
        <h1 class="cf-title" id="cf-agents-title">
          Agents
        </h1>
        <span class="cf-head-n">{list.length}</span>
        <span class="grow" />
        {make && (
          <Button size="s" kind="primary" href="#new-agent">
            New agent
          </Button>
        )}
      </header>
      <div class="scroll cf-stream">
        <div class="cf-stream-in cf-list-in">
          {agents === null && <p class="cf-post-quiet">Loading the agents.</p>}
          <ul class="cf-agent-list">
            {list.map((a) => (
              <AgentRow a={a} manager={a.name === manager} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
