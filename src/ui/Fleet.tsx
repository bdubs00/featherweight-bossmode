// The fleet: every pool with its Tasks and their phases, and every agent
// with its face, so an operator sees the whole team. An agent opens its face
// in the pane, where a person can change the name, the tagline, and the
// picture.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import type { Fleet as FleetT } from '../api/types';
import { useSelect } from '../state/store';
import { loadAgents, loadFaces } from '../state/actions';
import { phaseOf } from '../lib/presence';
import { ago } from '../lib/words';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Back, Empty, Face, Light } from './common';
import { Icon } from './icons';

export function Fleet() {
  const [fleet, setFleet] = useState<FleetT | null>(null);
  const [busy, setBusy] = useState(false);
  const agents = useSelect((s) => s.agents);
  const faces = useSelect((s) => s.faces);
  const grid = useRoving<HTMLUListElement>();
  const read = async () => {
    setBusy(true);
    try {
      setFleet(await api.fleet());
    } catch (e) {
      showError(e);
    }
    setBusy(false);
  };
  useEffect(() => {
    read();
    if (!agents) attempt(loadAgents);
  }, []);
  const names = (agents || []).map((a) => a.name);
  return (
    <section class="screen fleet" aria-labelledby="fleet-title">
      <header class="bar">
        <Back narrow label="Bridges" href="#" />
        <div class="title">
          <h1 id="fleet-title">Fleet</h1>
          <p class="goal">{fleet ? `${(fleet.pools || []).length} pools, ${fleet.members.length} Tasks, ${names.length} agents` : 'Loading'}</p>
        </div>
        <div class="end">
          <button type="button" class="btn small" disabled={busy} onClick={read}>
            Read again
          </button>
        </div>
      </header>
      <div class="scroll pad">
        <h2 class="sec">Pools</h2>
        {fleet && (fleet.pools || []).length === 0 && <Empty>The fleet has no pool that you can see.</Empty>}
        <div class="pools">
          {fleet &&
            (fleet.pools || []).map((p) => (
              <article class="pool" aria-labelledby={'pool-' + p.name}>
                <header>
                  <Face agent={p.agent} size={40} />
                  <div>
                    <h3 id={'pool-' + p.name}>{p.name}</h3>
                    <p class="s">
                      Runs <b>{p.agent}</b> from the queue <code>{p.intake}</code>
                    </p>
                  </div>
                  <span class={'ready ' + (p.ready >= p.wanted ? 'ok' : 'need')}>
                    {p.ready} of {p.wanted} ready
                  </span>
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
      <header class="bar">
        <Back label="Fleet" href="#fleet" />
        <div class="title">
          <h2 id="agent-title">{(face && face.displayName) || agent}</h2>
          <p class="goal">{agent}</p>
        </div>
      </header>
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
