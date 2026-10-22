// The fleet: the agents in the list pane, every agent with its workers and
// their phases in the main pane, and the face of an agent in the details
// pane, where a person can change the name, the tagline, and the picture.
// Screen B reworks the place into the people list grouped by bridge, the
// board, and the profile of docs/DESIGN.md, section 11.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { useSelect } from '../state/store';
import { loadAgents, loadFaces, loadFleet } from '../state/actions';
import { phaseOf } from '../lib/presence';
import { ago } from '../lib/words';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Empty, Face, Light } from './common';
import { Icon } from './icons';
import { Button, Chip, Mark, PaneHeader } from './primitives';

/** FleetList is the list pane of the Fleet place: the agents, each with its mark and its tagline. */
export function FleetList({ current }: { current?: string; member?: string }) {
  const agents = useSelect((s) => s.agents);
  const faces = useSelect((s) => s.faces);
  const list = useRoving<HTMLDivElement>();
  useEffect(() => {
    if (!agents) attempt(loadAgents);
  }, []);
  return (
    <section class="screen fleet-list" aria-labelledby="fleet-list-title">
      <PaneHeader
        id="fleet-list-title"
        title="Fleet"
        count={agents ? agents.length : undefined}
        countLabel={agents ? agents.length + ' agents' : undefined}
        actions={
          <Button href="#new-agent" size="s" icon="plus" class="key-icon" aria-label="New agent" title="New agent" />
        }
      />
      <div class="scroll" ref={list}>
        <div class="rows" role="list">
          {(agents || []).map((a) => {
            const f = faces[a.name];
            const on = a.name === current;
            return (
              <div role="listitem">
                <a class={'prow-agent' + (on ? ' sel' : '')} href={'#fleet/' + encodeURIComponent(a.name)} data-item aria-current={on ? 'page' : undefined}>
                  <Mark agent={a.name} size={32} selected={on} />
                  <span class="main">
                    <span class="t-sub clip">{(f && f.displayName) || a.name}</span>
                    <span class="t-meta clip">{(f && f.tagline) || a.description || a.name}</span>
                  </span>
                </a>
              </div>
            );
          })}
        </div>
        {agents && agents.length === 0 && <Empty>You can see no agent.</Empty>}
      </div>
    </section>
  );
}

export function Fleet() {
  // The view comes from GET /v1/fleet, and the member and task events of
  // the stream keep its phases current.
  const fleet = useSelect((s) => s.fleet);
  const [busy, setBusy] = useState(false);
  const agents = useSelect((s) => s.agents);
  const faces = useSelect((s) => s.faces);
  const grid = useRoving<HTMLUListElement>();
  const read = async () => {
    setBusy(true);
    try {
      await loadFleet();
    } catch (e) {
      showError(e);
    }
    setBusy(false);
  };
  useEffect(() => {
    read();
    if (!agents) attempt(loadAgents);
  }, []);
  return (
    <section class="screen fleet" aria-labelledby="fleet-title">
      <PaneHeader
        id="fleet-title"
        title="Workers"
        size="title"
        level={1}
        back={{ href: '#fleet', label: 'Fleet', to: 'list' }}
        count={fleet ? (fleet.pools || []).reduce((n, p) => n + p.tasks.length, 0) : undefined}
        countLabel="workers"
        actions={
          <Button size="s" disabled={busy} onClick={read}>
            Read again
          </Button>
        }
      />
      <div class="scroll pad">
        {fleet && (fleet.pools || []).length === 0 && <Empty>No agent has a worker that you can see.</Empty>}
        <div class="pools">
          {fleet &&
            (fleet.pools || []).map((p) => (
              <article class="pool" aria-labelledby={'pool-' + p.name}>
                <header>
                  <Face agent={p.agent} size={40} />
                  <div>
                    <h3 id={'pool-' + p.name}>{(faces[p.agent] && faces[p.agent].displayName) || p.agent}</h3>
                    <p class="s">Keep {p.wanted}</p>
                  </div>
                  <span class={'ready ' + (p.ready >= p.wanted ? 'ok' : 'need')}>{p.ready} ready</span>
                </header>
                <ul class="tasks">
                  {p.tasks.map((t) => (
                    <li>
                      <span class="name">{t.name}</span>
                      <Light light={phaseOf(t.phase)} />
                      {!t.current && <span class="tag">older configuration</span>}
                      {t.note && <span class="note">{t.note}</span>}
                    </li>
                  ))}
                </ul>
                {p.gaps && p.gaps.length > 0 && (
                  <ul class="gaps">
                    {p.gaps.map((g) => (
                      <li>
                        <Icon name="hand" /> {g}
                      </li>
                    ))}
                  </ul>
                )}
                <p class="why">Checked {ago(p.checkedAt)}.</p>
              </article>
            ))}
        </div>
        <h2 class="sec">Agents</h2>
        <ul class="agents" ref={grid}>
          {(agents || []).map((a) => {
            const f = faces[a.name];
            return (
              <li>
                <a class="agent-card" href={'#fleet/' + encodeURIComponent(a.name)} data-item>
                  <Face agent={a.name} size={64} />
                  <b>{(f && f.displayName) || a.name}</b>
                  <span class="s">{a.name}</span>
                  {f && f.tagline && <span class="tagline">{f.tagline}</span>}
                  <span class="role">You are {a.role || 'a viewer'}</span>
                </a>
              </li>
            );
          })}
        </ul>
        {agents && agents.length === 0 && <Empty>You can see no agent.</Empty>}
        {fleet && (
          <>
            <h2 class="sec">Tasks</h2>
            <ul class="fleet-members">
              {fleet.members.map((m) => (
                <li>
                  <span class="name">{m.name}</span>
                  <Light light={m.state === 'live' ? phaseOf('Running') : m.state === 'suspended' ? phaseOf('Suspended') : phaseOf(m.state)} />
                  <span class="s">
                    {m.agents.map((x) => x.name).join(', ')}
                    {m.inputRequired ? ` · ${m.inputRequired} waiting for input` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

export function AgentPane({ agent }: { agent: string }) {
  const face = useSelect((s) => s.faces[agent]);
  const info = useSelect((s) => (s.agents || []).find((a) => a.name === agent));
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setName(face ? face.displayName : '');
    setTagline(face ? face.tagline : '');
    setSaved('');
  }, [agent, face && face.hash]);
  const canEdit = !!info && info.role === 'owner';
  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const ok = await attempt(() => api.patchFace(agent, { displayName: name, tagline }).then(() => loadFaces()));
    setBusy(false);
    if (ok) setSaved('Saved.');
  };
  const upload = async () => {
    const f = file.current && file.current.files && file.current.files[0];
    if (!f) return;
    if (f.size > 32 * 1024) {
      showError(new Error('A face holds at most 32 KB.'));
      return;
    }
    setBusy(true);
    const ok = await attempt(async () => {
      await api.putFace(agent, await f.text());
      await loadFaces();
    });
    setBusy(false);
    if (file.current) file.current.value = '';
    if (ok) setSaved('The new face is up.');
  };
  return (
    <section class="screen agentpane" aria-labelledby="agent-title">
      <PaneHeader id="agent-title" title={(face && face.displayName) || agent} back={{ href: '#fleet', label: 'Fleet', to: 'main' }}>
        <Chip>agent</Chip>
      </PaneHeader>
      <div class="scroll pad">
        <div class="bigface">
          <Face agent={agent} size={96} />
          {face && <p class="why">{face.custom ? 'A person drew this face.' : 'A pattern from the name. No model drew it.'}</p>}
        </div>
        {info && info.description && <p class="lede">{info.description}</p>}
        <form class="form" onSubmit={save}>
          <label class="fld">
            <span>Display name, at most 64 characters</span>
            <input value={name} maxLength={64} disabled={!canEdit} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
          </label>
          <label class="fld">
            <span>Tagline, at most 140 characters</span>
            <input value={tagline} maxLength={140} disabled={!canEdit} onInput={(e) => setTagline((e.target as HTMLInputElement).value)} />
          </label>
          {canEdit && (
            <div class="do">
              <button type="submit" class="btn primary" disabled={busy}>
                Save
              </button>
            </div>
          )}
        </form>
        {canEdit ? (
          <div class="form">
            <label class="fld">
              <span>A new face: an SVG file of at most 32 KB. The workbench refuses a face with a script, a link, or an image inside.</span>
              <input ref={file} type="file" accept="image/svg+xml,.svg" disabled={busy} onChange={upload} />
            </label>
            {face && face.custom && (
              <button type="button" class="btn" disabled={busy} onClick={() => attempt(() => api.deleteFace(agent).then(() => loadFaces()))}>
                Use the pattern again
              </button>
            )}
          </div>
        ) : (
          <p class="why">Only an owner of {agent} can change its face.</p>
        )}
        {saved && (
          <p class="why" role="status">
            {saved}
          </p>
        )}
      </div>
    </section>
  );
}
