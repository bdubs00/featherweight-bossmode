// The profile of an agent, in the details pane of the Fleet place: the mark
// at 72, which an owner clicks to change it, the tagline, the tools and the
// rules as chips, the count of its skills, its duties, What people liked,
// the workers with Keep,
// and the counts of today. The workers and their phases come from the state of
// each worker that the stream keeps, as on every screen. GET
// /v1/pools/{name} gives only Keep and the gaps. The profile reads it when
// it opens, and again when the phases of the workers change on the stream.
// The page never says pool: it says Workers and Keep. Where the deployment
// has a package mirror, an agent that a pool runs also has the section
// Packages (Packages.tsx).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import type { PackageSwitch, Pool, Today } from '../api/types';
import { store, useSelect } from '../state/store';
import { loadAgentSkills, loadAgents, loadFaces, loadFleet } from '../state/actions';
import { forgetProfiles, useFleetAgent, useProfile } from '../state/profiles';
import { namedProfileOf, useQueued } from '../state/queued';
import { ensureRuns } from '../state/fetchers';
import { agentGone, likedOf, newestRun, parseKeep, policyRules, rulesOf, seatOnWorker, seatsOfAgent, type LikedEntry } from '../state/people';
import { poolNameOf, workersOf } from '../lib/workers';
import { statusOf } from '../lib/status';
import { selectFacts } from '../state/reducer';
import { go, hrefOf } from '../lib/route';
import { attempt, showError, showSaid } from './notice';
import { Confirm, InlineMarkdown, Markdown, Menu } from './common';
import { Glyph, Icon } from './icons';
import { Button, Chip, Field, Help, Input, Led, Mark, PaneHeader } from './primitives';
import { Abilities } from './Abilities';
import { AgentDuties } from './Duties';
import { abilitiesOf, rulesWords } from '../lib/tools';
import { costParts } from '../lib/cost';
import { useToolCatalog } from '../state/tools';
import { forgetReads, readCache, useEventRead } from '../state/eventread';
import { PackagesSection } from './Packages';
import { poolOfAgent, rulesWithPackages, withPackages } from '../lib/packages';

const WORKER_HELP = 'A worker runs the work of one agent, one seat at a time. Keep is how many it keeps ready.';
/** The tooltip of a worker of an older setup of its agent. */
export const OLD_SETUP = 'It takes the new setup of the agent when it starts again.';
/** The line over the gaps of the workers of an agent: a change that the server cannot make yet. */
export const GAPS_LINE = 'Some changes have not reached the workers of this agent yet. An admin can read why.';
/** The answers of the pools and of today, kept for the next view of a profile. */
const pools = readCache<Pool>();
const todays = readCache<Today>();

/** forgetProfileReads drops the answers that the profile read, for the tests. */
export function forgetProfileReads(): void {
  forgetReads(pools);
  forgetReads(todays);
}

/**
 * usePool reads Keep and the gaps of the workers of an agent, and the
 * counts of today, once when the profile opens. It reads them again only
 * on an event that concerns them, at most every few seconds: the pool when
 * the phases of its workers change, and today when a run of the agent
 * changes its state. The page asks only what exists: it reads a pool only
 * once the fleet names it, so a profile of the front costs no read, and a
 * route that answered 404 is not asked again.
 */
function usePool(agent: string): [Pool | null | undefined, (p: Pool | null) => void, Today | null | undefined] {
  const name = useSelect((s) => poolNameOf(s.fleet, agent));
  // The fleet names the pools, so the page waits for it before it reads one, and the read of the fleet after a new agent names its pool.
  const pooled = useSelect((s) => (s.fleet ? (s.fleet.pools || []).some((p) => p.agent === agent) : undefined));
  const poolSig = useSelect((s) => {
    const p = s.fleet ? (s.fleet.pools || []).find((x) => x.agent === agent) : undefined;
    return p ? [p.wanted, p.actual, p.ready, ...(p.tasks || []).map((t) => t.name + ':' + t.phase)].join(',') : '';
  });
  const runSig = useSelect((s) =>
    Object.values(s.runs)
      .filter((r) => r.agent === agent)
      .map((r) => r.id + ':' + r.state)
      .sort()
      .join(','),
  );
  const [pool, setPool] = useEventRead(pools, pooled ? name : '', poolSig, () => api.pool(name));
  const [today] = useEventRead(todays, agent, runSig, () => api.today(agent));
  // While the page does not know the fleet, the pool is unknown, not absent.
  return [pooled === undefined && pool === null ? undefined : pool, setPool, today];
}

/**
 * useLiked reads the page of what people liked about an agent, again when
 * the page changes. Once the page knows the list of the wiki, it reads no
 * page that the list does not hold: an agent without a heart costs no read.
 */
function useLiked(agent: string): { path: string; items: LikedEntry[] | null } {
  const path = 'agents/' + agent + '/learned.md';
  const hash = useSelect((s) => (s.pages.byPath[path] ? s.pages.byPath[path].hash : ''));
  const absent = useSelect((s) => s.pages.loaded && !s.pages.byPath[path]);
  const [items, setItems] = useState<LikedEntry[] | null>(null);
  useEffect(() => {
    if (absent) {
      setItems([]);
      return;
    }
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
  }, [path, hash, absent]);
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

/**
 * Workers is the section of the workers of an agent: the count, the
 * question mark, Keep, and one row per worker. The rows and their words
 * come from the state of each worker on the page. The read of the pool
 * gives Keep and the gaps.
 */
function Workers({ agent, owner, pool, setPool }: { agent: string; owner: boolean; pool: Pool | null | undefined; setPool: (p: Pool | null) => void }) {
  const bridges = useSelect((s) => s.bridges);
  const rosters = useSelect((s) => s.rosters);
  const seats = useMemo(() => seatsOfAgent({ bridges, rosters }, agent), [bridges, rosters, agent]);
  const runs = useSelect((s) => s.runs);
  const facts = useSelect(selectFacts);
  const workers = useMemo(() => workersOf(facts, agent).workers, [facts, agent]);
  // While every worker of a new agent starts, the server names gaps that pass on their own, so the section says that the workers start.
  const starting = !!pool && pool.wanted > 0 && (workers.length === 0 ? true : workers.every((w) => w.phase === 'Pending' || w.phase === ''));
  // The open runs of the fleet name the seat that each worker serves. Until the page reads them, it reads the newest run of each seat.
  const openRuns = useSelect((s) => s.openRuns);
  const runIds = openRuns ? '' : seats.map((x) => newestRun(x.member)).join(',');
  useEffect(() => {
    if (runIds) ensureRuns(runIds.split(','));
  }, [runIds]);
  return (
    <section class="prof-sec" aria-labelledby={'workers-' + agent}>
      <div class="prof-sec-head">
        <h3 class="t-sub" id={'workers-' + agent}>
          Workers
        </h3>
        <Chip label={workers.length === 1 ? '1 worker' : workers.length + ' workers'}>{workers.length}</Chip>
        <Help label="What is a worker">{WORKER_HELP}</Help>
        <span class="grow" />
        {pool !== undefined && <KeepField agent={agent} value={pool ? pool.wanted : 0} owner={owner} onSaved={setPool} />}
      </div>
      {workers.length > 0 && (
        <ul class="workers">
          {workers.map((w) => {
            const light = statusOf(facts, { worker: w.member });
            const seat = seatOnWorker(w.name, seats, runs);
            // The page knows no moment when a worker fell asleep, so a sleeping worker shows its word alone.
            const who = seat;
            return (
              <li>
                <span class="worker-name">{w.name}</span>
                {light && <Led tone={light.tone} word={light.word} label={light.label} />}
                {!w.current && (
                  <span class="worker-old" title={OLD_SETUP}>
                    <Chip label={'old setup. ' + OLD_SETUP}>old setup</Chip>
                  </span>
                )}
                {who && <span class="worker-who clip">{who}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {pool && starting && <p class="worker-starting">{workers.length > 1 ? 'Its workers are starting.' : 'Its worker is starting.'}</p>}
      {pool && !starting && pool.gaps && pool.gaps.length > 0 && (
        // The gaps are the words of the server for an admin, so they sit in a fold under one plain line.
        <div class="worker-gaps">
          <p>{GAPS_LINE}</p>
          <details class="advanced worker-gaps-fold">
            <summary>
              <Glyph name="back" size={16} />
              Details
            </summary>
            <ul>
              {pool.gaps.map((g) => (
                <li>{g}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}

/** dropAgent takes a deleted agent out of the page: out of the profiles of the front, and its pool marked as deleting, as the server marks it. */
function dropAgent(agent: string): void {
  const s = store.get();
  if (s.agents) store.dispatch({ type: 'agents', agents: s.agents.filter((a) => a.name !== agent) });
  if (s.fleet) store.dispatch({ type: 'fleet', fleet: { ...s.fleet, pools: (s.fleet.pools || []).map((p) => (p.agent === agent ? { ...p, deleting: true } : p)) } });
}

/**
 * DeleteAgent is the More menu of the head of the profile, for an owner of
 * an agent that the page made. It holds Delete agent, which deletes the
 * agent with its workers after Confirm, so no destructive key sits in
 * plain sight. The server deletes a pool that the page made with the
 * profile that it runs, and the workers once they are idle. An agent of
 * the setup file has no such key: only the file removes it.
 */
function DeleteAgent({ agent, title }: { agent: string; title: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Menu label={'More for ' + title} kind="secondary" items={[{ label: 'Delete agent', danger: true, onSelect: () => setAsk(true) }]} />
      {ask && (
        <Confirm
          title={'Delete ' + title + '?'}
          confirm="Delete agent"
          danger
          busy={busy}
          onCancel={() => setAsk(false)}
          onConfirm={async () => {
            setBusy(true);
            const ok = await attempt(() => api.removeWorkers(poolNameOf(store.get().fleet, agent)));
            setBusy(false);
            setAsk(false);
            if (!ok) return;
            // The page drops the agent at once: the server deletes its workers once they are idle, so a read of the fleet still lists them a while.
            dropAgent(agent);
            forgetProfiles();
            showSaid('Deleted ' + title + '. Its workers stop once they are idle.');
            go('#fleet');
            requestAnimationFrame(() => {
              const head = document.getElementById('fleet-list-title');
              if (head) head.focus();
            });
            Promise.allSettled([loadAgents(), loadFleet()]);
          }}
        >
          <p>This deletes {title}, its workers, and the files on them. Its seats on bridges stop working.</p>
          <p>You cannot undo this. Your past conversations with it stay readable.</p>
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

/** The length of an answer above which a heart folds it to a few lines, with Show more. */
export const LIKED_FOLD = 240;

/**
 * plainAnswer cleans the answer of a heart for a short view. The front
 * keeps the answer on one line, so a table loses its rows: the line of
 * dashes under its head goes, and each bar between two cells becomes a
 * dot.
 */
export function plainAnswer(text: string): string {
  return String(text || '')
    .replace(/\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?/g, ' ')
    .replace(/(^|\s)\|\s*/g, '$1')
    .replace(/\s*\|(\s|$)/g, ' \u00b7$1')
    .replace(/(\s\u00b7)+/g, ' \u00b7')
    .replace(/\s+\u00b7\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The lines of an answer of several lines above which a heart folds it. */
export const LIKED_FOLD_LINES = 4;

/**
 * LikedItem is one heart: the note of the person first, what was asked,
 * and the answer, folded when it is long. The server keeps the lines of an
 * answer of several lines, which shows as Markdown with its lists and its
 * tables. An answer that an older server kept on one line shows cleaned.
 */
function LikedItem({ t }: { t: LikedEntry }) {
  const [more, setMore] = useState(false);
  const multi = t.did.includes('\n');
  const did = multi ? t.did : plainAnswer(t.did);
  const long = did.length > LIKED_FOLD || (multi && did.split('\n').length > LIKED_FOLD_LINES);
  return (
    <li>
      <Glyph name="heart" size={14} class="heart" />
      <div class="liked-body">
        {t.note && (
          <p class="liked-note">
            <span class="liked-label">Liked because: </span>
            <InlineMarkdown text={t.note} />
          </p>
        )}
        {t.asked && (
          <p class="liked-asked clip" title={t.asked}>
            <span class="liked-label">Asked: </span>
            {t.asked}
          </p>
        )}
        {did &&
          (multi ? (
            <div class={'liked-did liked-block' + (long && !more ? ' folded' : '')}>
              <span class="liked-label">Answer:</span>
              <Markdown text={did} />
            </div>
          ) : (
            <p class={'liked-did' + (long && !more ? ' folded' : '')}>
              <span class="liked-label">Answer: </span>
              <InlineMarkdown text={did} />
            </p>
          ))}
        {long && (
          <button type="button" class="prof-link liked-more" aria-expanded={more} onClick={() => setMore(!more)}>
            {more ? 'Show less' : 'Show more'}
          </button>
        )}
        {t.run && (
          <a class="prof-link" href={runHref(t)}>
            Open the run
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Liked is What people liked: the hearts of people from the page of the
 * agent, newest first. Each leads with the note of the person, then what
 * was asked, then the answer, and its run. An agent with no heart has no
 * section: a heading over nothing says nothing.
 */
function Liked({ agent }: { agent: string }) {
  const { path, items } = useLiked(agent);
  const n = items ? items.length : 0;
  if (n === 0) return null;
  return (
    <section class="prof-sec" aria-labelledby={'liked-' + agent}>
      <div class="prof-sec-head">
        <h3 class="t-sub" id={'liked-' + agent}>
          What people liked
        </h3>
        <Chip label={n === 1 ? '1 heart' : n + ' hearts'}>{n}</Chip>
        <span class="grow" />
        <a class="prof-link" href={hrefOf({ place: 'pages', path, mode: 'read' })}>
          Open page
        </a>
      </div>
      <ul class="liked">
        {items!.slice(0, 3).map((t) => (
          <LikedItem t={t} />
        ))}
      </ul>
    </section>
  );
}

/** TodaySec is the count of runs, the cost, and the decisions of the day of the agent. */
function TodaySec({ agent, today }: { agent: string; today: Today | null | undefined }) {
  if (!today) return null;
  const cost = typeof today.costUSD === 'number' ? costParts(today.costUSD) : null;
  return (
    <section class="prof-sec" aria-labelledby={'today-' + agent}>
      <h3 class="t-sub" id={'today-' + agent}>
        Today
      </h3>
      <p class="today">
        <span>
          <b>{today.runs}</b> {today.runs === 1 ? 'run' : 'runs'}
        </span>
        {cost && (
          <span>
            {cost.lead && cost.lead + ' '}
            <b>{cost.n}</b>
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

/**
 * EditFace is the form of an owner: the name and the tagline, Save, and
 * Use the default picture for a custom face. The fields open with what
 * the profile shows: the name of the face, else the name of the agent,
 * and the tagline, else the description. A field that keeps the name or
 * the description of the agent saves as empty, so the face follows a
 * later change of the profile. The focus opens in Name, Escape cancels,
 * and onDone gives the focus back to Edit.
 */
function EditFace({ agent, description, onDone }: { agent: string; description: string; onDone: (said: string) => void }) {
  const face = useSelect((s) => s.faces[agent]);
  const [name, setName] = useState((face && face.displayName) || agent);
  const [tagline, setTagline] = useState((face && face.tagline) || description);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (first.current) first.current.focus();
  }, []);
  const save = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    const displayName = name.trim() === agent ? '' : name.trim();
    const line = tagline.trim() === description.trim() ? '' : tagline.trim();
    const ok = await attempt(() => api.patchFace(agent, { displayName, tagline: line }).then(() => loadFaces()));
    setBusy(false);
    if (ok) onDone('Saved.');
  };
  return (
    <form
      class="prof-edit"
      onSubmit={save}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) {
          e.preventDefault();
          e.stopPropagation();
          onDone('');
        }
      }}
    >
      <Field label="Name">
        <Input ref={first} value={name} maxLength={64} placeholder={agent} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Tagline">
        <Input value={tagline} maxLength={140} placeholder={description || undefined} onInput={(e) => setTagline((e.target as HTMLInputElement).value)} />
      </Field>
      <div class="prof-edit-do">
        {face && face.custom && (
          <Button size="s" kind="quiet" disabled={busy} onClick={() => attempt(() => api.deleteFace(agent).then(() => loadFaces()))}>
            Use the default picture
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

/**
 * AgentGone is the page of an agent that no longer exists, with the way
 * back to the fleet. The details pane passes quiet: where it shows beside
 * the main pane, the main pane holds the key, and alone it has its back
 * link.
 */
export function AgentGone({ agent, quiet }: { agent: string; quiet?: boolean }) {
  return (
    <section class="screen agent-gone" aria-labelledby={quiet ? 'agent-gone-details' : 'agent-gone-title'}>
      {quiet ? (
        <PaneHeader id="agent-gone-details" title={agent} back={{ href: '#fleet', label: 'Fleet', to: 'main' }} />
      ) : (
        <PaneHeader id="agent-gone-title" title={agent} size="title" level={1} back={{ href: '#fleet', label: 'Fleet', to: 'list' }} />
      )}
      <div class="empty center">
        <p>This agent no longer exists.</p>
        {!quiet && (
          <Button href="#fleet" kind="primary">
            Back to Fleet
          </Button>
        )}
      </div>
    </section>
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
  // The front names the tools of the workers beside a profile that names none, so only a profile that it does not answer reads the start of a run of a seat.
  const answered = !!read && ((!!read.tools && read.tools.length > 0) || !!read.workerTools);
  const started = namedProfileOf(useQueued(read !== undefined && !answered ? seatRun : ''));
  const loadable = useSelect((s) => s.agentSkills[agent]);
  const runs = useSelect((s) => s.runs);
  const channels = useSelect((s) => s.channels);
  const [pool, setPool, today] = usePool(agent);
  // Packages exist only where the deployment has a package mirror, and only for an agent that a pool runs.
  const packagesOn = useSelect((s) => !!(s.config && s.config.packages));
  const listed = useSelect((s) => (s.agents || []).find((a) => a.name === agent && !!a.pool) || (s.agents || []).find((a) => a.name === agent));
  const packagePool = useSelect((s) => (packagesOn ? poolOfAgent(listed, read, s.fleet, agent) : ''));
  const [edit, setEdit] = useState(false);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editKey = useRef<HTMLButtonElement>(null);
  const gone = useSelect((s) => agentGone(s, agent));
  useEffect(() => {
    setEdit(false);
    setSaid('');
  }, [agent]);
  useEffect(() => {
    loadAgentSkills(agent).catch(() => {});
  }, [agent]);
  const owner = !!info && info.role === 'owner';
  // The names of the tools as the profile writes them, a glob as written.
  // A profile that names no tools takes the tools of its workers, which the front names beside it.
  const toolNames = (info && info.tools && info.tools.length ? info.tools : null) || (info && info.workerTools) || (started && started.tools) || [];
  const policy = (info && info.policy) || null;
  // The rules of the workers hold beside the rules of the profile, which can only tighten them.
  const workerPolicy = (info && info.workerPolicy) || (started && started.policy) || null;
  // The switch of the packages: the section of the packages tells it once it reads it, else the profile.
  const [sectionSwitch, setSectionSwitch] = useState<PackageSwitch | null>(null);
  const sw = sectionSwitch || (info && info.workerPackages) || null;
  const skillCount = loadable ? loadable.length : 0;
  const catalog = useToolCatalog();
  // What the agent can do, in plain words: the tools of the profile, a glob as one ability.
  const abilities = useMemo(() => withPackages(abilitiesOf(toolNames, catalog), sw), [toolNames.join('\n'), catalog, sw && sw.on, sw && sw.ask]);
  // The rules of the profile and of its workers, and the rules that its decisions named, as a person reads them.
  const rules = useMemo(
    () => rulesWords(rulesWithPackages([...new Set([...policyRules(policy), ...policyRules(workerPolicy), ...rulesOf(agent, runs, channels)])].sort(), sw), catalog),
    [policy, workerPolicy, agent, runs, channels, catalog, sw && sw.on, sw && sw.ask],
  );
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
  if (gone) return <AgentGone agent={agent} quiet />;
  const description = (info && info.description) || '';
  return (
    <section class="screen profile" aria-labelledby="profile-title">
      <PaneHeader
        id="profile-title"
        title={title}
        back={{ href: back ? back.href : '#fleet', label: back ? back.label : 'Fleet', to: 'main' }}
        actions={
          owner && !edit ? (
            <>
              <Button ref={editKey} size="s" onClick={() => setEdit(true)}>
                Edit
              </Button>
              {pool && pool.source !== 'config' && <DeleteAgent agent={agent} title={title} />}
            </>
          ) : undefined
        }
      >
        <Chip>agent</Chip>
      </PaneHeader>
      <div class="scroll">
        <section class={'prof-ident' + (edit ? ' editing' : '')} aria-label={title}>
          {owner ? (
            // The picture is the key that changes it. The pen says so, also on a touch screen with no hover.
            <button type="button" class="prof-mark-key" disabled={busy} aria-label={'Change the picture of ' + title} title="Change the picture: pick an SVG file" onClick={() => file.current && file.current.click()}>
              <Mark agent={agent} size={72} />
              <span class="prof-mark-pen" aria-hidden="true">
                <Icon name="edit" />
              </span>
            </button>
          ) : (
            <Mark agent={agent} size={72} />
          )}
          {owner && <input ref={file} type="file" accept="image/svg+xml,.svg" class="sr" tabIndex={-1} aria-hidden="true" onChange={upload} />}
          <div class="prof-ident-main">
            {edit ? (
              <EditFace
                agent={agent}
                description={description}
                onDone={(s) => {
                  setEdit(false);
                  setSaid(s);
                  // The form goes, so the focus goes back to the key that opened it.
                  requestAnimationFrame(() => editKey.current && editKey.current.focus());
                }}
              />
            ) : (
              <>
                {((face && face.tagline) || (info && info.description)) && <p class="prof-tagline">{(face && face.tagline) || (info && info.description)}</p>}
              </>
            )}
            {said && (
              <p class="prof-said" role="status">
                {said}
              </p>
            )}
          </div>
        </section>
        {(abilities.length > 0 || rules.length > 0 || loadable) && (
          <section class="prof-sec" aria-labelledby={'can-' + agent}>
            <div class="prof-sec-head">
              <h3 class="t-sub" id={'can-' + agent}>
                What it can do
              </h3>
              <span class="grow" />
              {loadable && <span class="prof-skills t-meta">{skillCount === 1 ? '1 skill' : skillCount + ' skills'}</span>}
            </div>
            <Abilities abilities={abilities} rules={rules} label="Tools and rules" />
            {loadable && loadable.length > 0 && (
              // Each skill links its own page, so the person sees which skills the agent has.
              <p class="prof-skill-list">
                <span class="liked-label">Skills: </span>
                {loadable.map((k, i) => (
                  <>
                    {i > 0 && ', '}
                    <a href={hrefOf({ place: 'skills', item: { kind: 'skill', id: k } })}>{k}</a>
                  </>
                ))}
              </p>
            )}
          </section>
        )}
        <AgentDuties agent={agent} />
        <Liked agent={agent} />
        <Workers agent={agent} owner={owner} pool={pool} setPool={setPool} />
        {packagePool && <PackagesSection key={packagePool} agent={agent} pool={packagePool} owner={owner} onSwitch={setSectionSwitch} />}
        <TodaySec agent={agent} today={today} />
      </div>
    </section>
  );
}
