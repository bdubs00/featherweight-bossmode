// The profile of an agent, in the details pane of the Fleet place: the mark
// at 72, the tagline, the tools and the rules as chips, the count of its
// skills, New face, What people liked, the workers with Keep, and the
// counts of today. The workers come from GET /v1/pools/{name}, read again
// every 10 seconds while the profile is open, because no event of the
// stream carries them. The page never says pool: it says Workers and Keep.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { Pool, Today } from '../api/types';
import { store, useSelect } from '../state/store';
import { loadAgentSkills, loadFaces } from '../state/actions';
import { useFleetAgent, useProfile } from '../state/profiles';
import { namedProfileOf, useQueued } from '../state/queued';
import { ensureRuns } from '../state/fetchers';
import { likedOf, newestRun, parseKeep, policyRules, rulesOf, seatOnWorker, seatsOfAgent, type LikedEntry } from '../state/people';
import { poolNameOf } from '../lib/workers';
import { phaseOf } from '../lib/presence';
import { hrefOf } from '../lib/route';
import { since } from '../lib/words';
import { attempt, showError } from './notice';
import { Confirm, InlineMarkdown, Menu } from './common';
import { Glyph } from './icons';
import { Button, Chip, Field, Help, Input, Led, Mark, PaneHeader } from './primitives';

const WORKER_HELP = 'A worker runs the work of one agent, one seat at a time. Keep is how many it keeps ready.';
const POLL_MS = 10_000;

/** usePool reads the workers of an agent now and every 10 seconds while the profile is open. */
function usePool(agent: string): [Pool | null | undefined, (p: Pool | null) => void, Today | null | undefined] {
  const [pool, setPool] = useState<Pool | null | undefined>(undefined);
  const [today, setToday] = useState<Today | null | undefined>(undefined);
  const name = useSelect((s) => poolNameOf(s.fleet, agent));
  useEffect(() => {
    let live = true;
    setPool(undefined);
    setToday(undefined);
    const read = () => {
      api
        .pool(name)
        .then((p) => live && setPool(p))
        .catch(() => live && setPool((old) => (old === undefined ? null : old)));
      api
        .today(agent)
        .then((t) => live && setToday(t))
        .catch(() => live && setToday((old) => (old === undefined ? null : old)));
    };
    read();
    const t = setInterval(read, POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [agent, name]);
  return [pool, setPool, today];
}

/** useLiked reads the page of what people liked about an agent, again when the page changes. */
function useLiked(agent: string): { path: string; items: LikedEntry[] | null } {
  const path = 'agents/' + agent + '/learned.md';
  const hash = useSelect((s) => (s.pages.byPath[path] ? s.pages.byPath[path].hash : ''));
  const [items, setItems] = useState<LikedEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    api
      .page(path)
      .then((p) => live && setItems(likedOf(p.text)))
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 404) setItems([]);
        else showError(e);
      });
    return () => {
      live = false;
    };
  }, [path, hash]);
  return { path, items };
}

/** KeepField is the number of workers that an agent keeps, changed in place by an owner. */
export function KeepField({ agent, value, owner, onSaved }: { agent: string; value: number; owner: boolean; onSaved: (p: Pool) => void }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setText(String(value));
  }, [value]);
  if (!owner) return <span class="keep-read">Keep {value}</span>;
  const commit = async () => {
    editing.current = false;
    const k = parseKeep(text);
    if ('error' in k) {
      setError(k.error);
      return;
    }
    setError('');
    if (k.value === value) return;
    setBusy(true);
    const ok = await attempt(async () => onSaved(await api.setKeep(poolNameOf(store.get().fleet, agent), k.value)));
    setBusy(false);
    if (!ok) setText(String(value));
  };
  return (
    <div class="keep">
      <label class="keep-label">
        <span>Keep</span>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={text}
          invalid={!!error}
          disabled={busy}
          aria-describedby={error ? 'keep-error' : undefined}
          onInput={(e) => {
            editing.current = true;
            setText((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape' && editing.current) {
              e.preventDefault();
              e.stopPropagation();
              editing.current = false;
              setError('');
              setText(String(value));
            }
          }}
          onBlur={() => {
            if (editing.current) commit();
          }}
        />
      </label>
      {error && (
        <span class="field-error keep-error" id="keep-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** Workers is the section of the workers of an agent: the count, the question mark, Keep, and one row per worker. */
function Workers({ agent, owner, pool, setPool }: { agent: string; owner: boolean; pool: Pool | null | undefined; setPool: (p: Pool | null) => void }) {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const seats = useMemo(() => seatsOfAgent({ bridges, rosters }, agent), [bridges, rosters, agent]);
  const runs = useSelect((s) => s.runs);
  const fleetMembers = useSelect((s) => (s.fleet ? s.fleet.members : []));
  const runIds = seats.map((x) => newestRun(x.member)).join(',');
  useEffect(() => {
    if (runIds) ensureRuns(runIds.split(','));
  }, [runIds]);
  const tasks = pool ? pool.tasks : [];
  const sleptAt = (name: string) => {
    const fm = fleetMembers.find((x) => x.name === name || x.name.endsWith('/' + name));
    return fm ? since(fm.lastSeen) : '';
  };
  return (
    <section class="prof-sec" aria-labelledby={'workers-' + agent}>
      <div class="prof-sec-head">
        <h3 class="t-sub" id={'workers-' + agent}>
          Workers
        </h3>
        <Chip label={tasks.length === 1 ? '1 worker' : tasks.length + ' workers'}>{tasks.length}</Chip>
        <Help label="What is a worker">{WORKER_HELP}</Help>
        <span class="grow" />
        {pool !== undefined && <KeepField agent={agent} value={pool ? pool.wanted : 0} owner={owner} onSaved={setPool} />}
        {owner && pool && <RemoveWorkers agent={agent} onDone={() => setPool(null)} />}
      </div>
      {tasks.length > 0 && (
        <ul class="workers">
          {tasks.map((t) => {
            const light = phaseOf(t.phase);
            const seat = seatOnWorker(t.name, seats, runs);
            const who = seat || (t.phase === 'Suspended' ? sleptAt(t.name) : '');
            return (
              <li>
                <span class="worker-name">{t.name}</span>
                <Led tone={light.tone} word={light.word} label={light.label} />
                {t.current === false && <Chip>old setup</Chip>}
                {who && <span class="worker-who clip">{who}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {pool && pool.gaps && pool.gaps.length > 0 && (
        <ul class="worker-gaps">
          {pool.gaps.map((g) => (
            <li>{g}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * RemoveWorkers is the More menu of the section of the workers, for an
 * owner. It holds Remove workers, which removes every worker of the agent
 * after Confirm, so no destructive key sits in plain sight on the profile.
 */
function RemoveWorkers({ agent, onDone }: { agent: string; onDone: () => void }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Menu label="More for workers" items={[{ label: 'Remove workers', danger: true, onSelect: () => setAsk(true) }]} />
      {ask && (
        <Confirm
          title={'Remove the workers of ' + agent + '?'}
          confirm="Remove workers"
          danger
          busy={busy}
          onCancel={() => setAsk(false)}
          onConfirm={async () => {
            setBusy(true);
            const ok = await attempt(() => api.removeWorkers(poolNameOf(store.get().fleet, agent)));
            setBusy(false);
            setAsk(false);
            if (ok) onDone();
          }}
        >
          <p>Every worker of {agent} stops. A seat of {agent} waits for a worker.</p>
        </Confirm>
      )}
    </>
  );
}

/** runHref links the run of a heart: the run pane of its bridge, else the run on the page at /ui. */
export function runHref(t: Pick<LikedEntry, 'run' | 'bridge' | 'handle'>): string {
  if (!t.run) return '';
  if (t.bridge) return hrefOf({ place: 'bridge', id: t.bridge, pane: 'run', run: t.run, handle: t.handle });
  return '/ui#run/' + encodeURIComponent(t.run);
}

/** Liked is What people liked: the hearts of people from the page of the agent, newest first. Each shows what the agent did, what was asked, the note, and its run. */
function Liked({ agent }: { agent: string }) {
  const { path, items } = useLiked(agent);
  const n = items ? items.length : 0;
  return (
    <section class="prof-sec" aria-labelledby={'liked-' + agent}>
      <div class="prof-sec-head">
        <h3 class="t-sub" id={'liked-' + agent}>
          What people liked
        </h3>
        <Chip label={n === 1 ? '1 heart' : n + ' hearts'}>{n}</Chip>
        <span class="grow" />
        {n > 0 && (
          <a class="prof-link" href={hrefOf({ place: 'pages', path, mode: 'read' })}>
            Open page
          </a>
        )}
      </div>
      {n > 0 && (
        <ul class="liked">
          {items!.slice(0, 3).map((t) => (
            <li>
              <Glyph name="heart" size={14} class="heart" />
              <div class="liked-body">
                {t.did && (
                  <p class="liked-did">
                    <InlineMarkdown text={t.did} />
                  </p>
                )}
                {t.asked && (
                  <p class="liked-asked">
                    <InlineMarkdown text={t.asked} />
                  </p>
                )}
                {t.note && (
                  <p class="liked-note">
                    <InlineMarkdown text={t.note} />
                  </p>
                )}
                {t.run && (
                  <a class="prof-link" href={runHref(t)}>
                    Open the run
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** TodaySec is the count of runs, the cost, and the decisions of the day of the agent. */
function TodaySec({ agent, today }: { agent: string; today: Today | null | undefined }) {
  if (!today) return null;
  return (
    <section class="prof-sec" aria-labelledby={'today-' + agent}>
      <h3 class="t-sub" id={'today-' + agent}>
        Today
      </h3>
      <p class="today">
        <span>
          <b>{today.runs}</b> {today.runs === 1 ? 'run' : 'runs'}
        </span>
        {typeof today.costUSD === 'number' && (
          <span>
            <b>${today.costUSD.toFixed(2)}</b>
            {today.partial && ' so far'}
          </span>
        )}
        <span>
          <b>{today.decisions}</b> {today.decisions === 1 ? 'decision' : 'decisions'}
        </span>
      </p>
    </section>
  );
}

/** EditFace is the form of an owner: the name and the tagline, Save, and Use the mark for a custom face. */
function EditFace({ agent, onDone }: { agent: string; onDone: (said: string) => void }) {
  const face = useSelect((s) => s.faces[agent]);
  const [name, setName] = useState(face ? face.displayName : '');
  const [tagline, setTagline] = useState(face ? face.tagline : '');
  const [busy, setBusy] = useState(false);
  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const ok = await attempt(() => api.patchFace(agent, { displayName: name, tagline }).then(() => loadFaces()));
    setBusy(false);
    if (ok) onDone('Saved.');
  };
  return (
    <form class="prof-edit" onSubmit={save}>
      <Field label="Name">
        <Input value={name} maxLength={64} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Tagline">
        <Input value={tagline} maxLength={140} onInput={(e) => setTagline((e.target as HTMLInputElement).value)} />
      </Field>
      <div class="prof-edit-do">
        {face && face.custom && (
          <Button size="s" kind="quiet" disabled={busy} onClick={() => attempt(() => api.deleteFace(agent).then(() => loadFaces()))}>
            Use the mark
          </Button>
        )}
        <span class="grow" />
        <Button size="s" disabled={busy} onClick={() => onDone('')}>
          Cancel
        </Button>
        <Button size="s" kind="primary" type="submit" disabled={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

/** Profile is the profile of an agent. back is the conversation that a narrow window goes back to. */
export function Profile({ agent, back }: { agent: string; back?: { href: string; label: string } }) {
  const face = useSelect((s) => s.faces[agent]);
  // The profile of GET /v1/agents/{name}, else the agent of the fleet,
  // which also stands in while the profile loads.
  const read = useProfile(agent);
  const stand = useFleetAgent(agent);
  const info = read === undefined ? stand : read || undefined;
  // A profile that a pool runs can come without its lists, where the front
  // does not answer it. The start of a run of a seat then names the tools
  // and the rules that the kernel resolved for the agent.
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const seatRun = useMemo(() => {
    const seat = seatsOfAgent({ bridges, rosters }, agent).find((x) => !!newestRun(x.member));
    return seat ? newestRun(seat.member) : '';
  }, [bridges, rosters, agent]);
  const started = namedProfileOf(useQueued(read !== undefined && !(read && read.tools) ? seatRun : ''));
  const loadable = useSelect((s) => s.agentSkills[agent]);
  const runs = useSelect((s) => s.runs);
  const channels = useSelect((s) => s.channels);
  const [pool, setPool, today] = usePool(agent);
  const [edit, setEdit] = useState(false);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setEdit(false);
    setSaid('');
  }, [agent]);
  useEffect(() => {
    loadAgentSkills(agent).catch(() => {});
  }, [agent]);
  const owner = !!info && info.role === 'owner';
  // The names of the tools as the profile writes them, a glob as written.
  const toolNames = (info && info.tools) || (started && started.tools) || [];
  const policy = (info && info.policy) || (started && started.policy) || null;
  const skillCount = loadable ? loadable.length : 0;
  // The rules of the profile, and the rules that its decisions named.
  const rules = useMemo(() => [...new Set([...policyRules(policy), ...rulesOf(agent, runs, channels)])].sort(), [policy, agent, runs, channels]);
  const upload = async () => {
    const f = file.current && file.current.files && file.current.files[0];
    if (!f) return;
    if (f.size > 32 * 1024) {
      showError(new Error('This face is over 32 KB. Pick a smaller SVG.'));
      if (file.current) file.current.value = '';
      return;
    }
    setBusy(true);
    const ok = await attempt(async () => {
      await api.putFace(agent, await f.text());
      await loadFaces();
    });
    setBusy(false);
    if (file.current) file.current.value = '';
    if (ok) setSaid('The new face is up.');
  };
  const title = (face && face.displayName) || agent;
  return (
    <section class="screen profile" aria-labelledby="profile-title">
      <PaneHeader
        id="profile-title"
        title={title}
        back={{ href: back ? back.href : '#fleet', label: back ? back.label : 'Fleet', to: 'main' }}
        actions={
          owner && !edit ? (
            <Button size="s" onClick={() => setEdit(true)}>
              Edit
            </Button>
          ) : undefined
        }
      >
        <Chip>agent</Chip>
      </PaneHeader>
      <div class="scroll">
        <section class="prof-ident" aria-label={title}>
          <Mark agent={agent} size={72} />
          <div class="prof-ident-main">
            {edit ? (
              <EditFace
                agent={agent}
                onDone={(s) => {
                  setEdit(false);
                  setSaid(s);
                }}
              />
            ) : (
              <>
                {((face && face.tagline) || (info && info.description)) && <p class="prof-tagline">{(face && face.tagline) || (info && info.description)}</p>}
                {(toolNames.length > 0 || rules.length > 0) && (
                  <ul class="prof-chips" aria-label="Tools and rules">
                    {toolNames.map((t) => (
                      <li>
                        <Chip class="prof-tool">{t}</Chip>
                      </li>
                    ))}
                    {rules.map((r) => (
                      <li>
                        <Chip class="prof-rule">{r}</Chip>
                      </li>
                    ))}
                  </ul>
                )}
                {loadable && (
                  <a class="prof-link prof-skills" href="#skills">
                    {skillCount === 1 ? '1 skill' : skillCount + ' skills'}
                  </a>
                )}
                {owner && (
                  <div class="prof-face">
                    <Button size="s" disabled={busy} onClick={() => file.current && file.current.click()}>
                      New face
                    </Button>
                    <input ref={file} type="file" accept="image/svg+xml,.svg" class="sr" tabIndex={-1} aria-hidden="true" onChange={upload} />
                  </div>
                )}
              </>
            )}
            {said && (
              <p class="prof-said" role="status">
                {said}
              </p>
            )}
          </div>
        </section>
        <Liked agent={agent} />
        <Workers agent={agent} owner={owner} pool={pool} setPool={setPool} />
        <TodaySec agent={agent} today={today} />
      </div>
    </section>
  );
}
