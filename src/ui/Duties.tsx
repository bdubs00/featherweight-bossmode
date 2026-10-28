// The Duties place. A duty is what an agent does on its own: who, when,
// what, and its limits. The list pane holds every duty that the person can
// view, each with the mark of its agent, what it does, its time in words,
// the light of its last run, its next time, and its spend of today. For an
// admin, its foot holds the switch that pauses every duty. The main pane
// holds one duty with its history, or the editor of New duty and Edit
// (DutyEditor.tsx). docs/CONTRACT.md, section 16, names the routes. A duty
// that the configuration of the server set up first says so, and a duty
// that the setup of the server locks shows no key that changes it. While a
// run of the duty works, the page reads the duty again every few seconds,
// so its state and its history follow the run. A key that changes the duty
// keeps the focus, and the focus that a move drops goes to the heading.
// Each run of the history shows the first line of its answer, and Open the
// run opens the run in a pane under its line, at #duties/<name>/run/<run>:
// the result, the files, and the conversation, as the run pane of a seat
// shows them, and the line of that run comes to the top of the pane. A run
// that a person checked, or that waits for a check, shows its verdict:
// to check, accepted, or sent back. The tabs over the list lead to the
// playbooks. A person who cannot change a duty, such as a viewer, sees no
// key that the server refuses: no New duty, no Run now, and no Edit.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Duty, DutyRun } from '../api/types';
import { go, hrefOf, type DutySeed } from '../lib/route';
import { costText } from '../lib/cost';
import {
  LOCKED_LINE,
  ORIGIN_LINE,
  PLACEHOLDERS,
  TEMPLATE_LINE,
  TEMPLATE_REPLACE,
  actOf,
  answerLine,
  awayWords,
  channelsIn,
  checkLine,
  checkWords,
  decidedWords,
  dutyLight,
  dutyShape,
  dutyLabel,
  dutyTitle,
  dutyWhat,
  importedOf,
  limitWords,
  lockedOf,
  listWords,
  retryWords,
  nextShort,
  nextWords,
  resultLight,
  runLight,
  startWords,
  tellWords,
  REVIEW_LINE,
  templatedOf,
  titleOfName,
  toWords,
} from '../lib/duties';
import type { Light } from '../lib/presence';
import { phraseOf } from '../lib/tools';
import { useSelect } from '../state/store';
import { loadDuties, loadDuty, loadSharedChannels, pauseAll, pauseDuty, removeDuty, runDutyNow, useDuties } from '../state/duties';
import { useToolCatalog } from '../state/tools';
import { ensureRuns } from '../state/fetchers';
import { selectFacts } from '../state/reducer';
import { awakeFor } from '../lib/status';
import { Conversation, useTranscript } from './Conversation';
import { FilesView, RunView, filesCount, useResult } from './RunPane';
import { DutyTabs } from './Playbooks';
import { useRoving } from './keys';
import { attempt, showError, showSaid } from './notice';
import { Confirm, Menu, When } from './common';
import { Button, Chip, Field, Find, Input, Led, LineLed, Mark, PaneHeader } from './primitives';
import { EmptyPane } from './Shell';
import { DutyEditor, focusLost, useAgentName, useFocusLost } from './DutyEditor';
import { ForDevelopers } from './DutyCheck';

/** The width from which two panes show side by side, as App names it. */
const TWO_PANES = '(min-width: 800px)';

/** The one sentence of the empty place: what a duty is. */
export const DUTY_IS = 'A duty is work that an agent does on its own, on a schedule and within limits that you set.';

const dutyHref = (name: string) => hrefOf({ place: 'duties', name });

/** runHref is the address of a run of the history of a duty, which opens under its line. */
const runHref = (name: string, run: string) => hrefOf({ place: 'duties', name, run });

/** The runs of the history whose answers the page reads, newest first. A read of a run is served by the view of the fleet and wakes no worker. */
const ANSWERS = 10;

/**
 * How often the page of a duty reads the duty again: every fast
 * milliseconds while a run of the duty waits for a worker or works, and
 * for after milliseconds after Run now, and every slow milliseconds while
 * a run waits for an answer. A test sets them.
 */
export const following = { fast: 3000, slow: 15000, after: 60000 };

/** The states of a run of a duty that change soon by themselves. */
const MOVING = ['queued', 'running', 'suspended', 'retrying'];

/** DutyLed is the light of a duty. The grey lights take a shape of their own: hollow for not run yet, and two bars for paused. */
function DutyLed({ light, class: cls }: { light: Light; class?: string }) {
  const shape = dutyShape(light);
  return <Led tone={light.tone} word={light.word} label={light.label} still={light.still} class={[cls, shape ? 'duty-led-' + shape : ''].filter(Boolean).join(' ') || undefined} />;
}

/** OffWords say that the front keeps no duties. */
function OffWords() {
  return <>This workbench keeps no duties.</>;
}

/* ---------- the list ---------- */

/** rank orders the duties: what needs you, what failed, what works or goes again, then the rest, and a paused duty last. Within a rank, the next time first. */
function rank(d: Duty): number {
  if (d.paused) return 5;
  const light = dutyLight(d);
  if (light.tone === 'amber') return light.still ? 2 : 0;
  return light.tone === 'red' ? 1 : light.tone === 'green' ? 2 : 3;
}

/** sortDuties puts the duties in the order of the list. */
export function sortDuties(list: Duty[]): Duty[] {
  const next = (d: Duty) => (d.next && d.next[0] ? d.next[0] : '￿');
  return [...list].sort((a, b) => rank(a) - rank(b) || (next(a) < next(b) ? -1 : next(a) > next(b) ? 1 : 0) || a.name.localeCompare(b.name));
}

/** matchesDuty reports whether a duty holds the words of a search, in what it does, its name, its agent, or its time. */
function matchesDuty(d: Duty, q: string): boolean {
  const w = q.toLowerCase();
  return [dutyTitle(d), dutyWhat(d), d.name, d.agent, d.readback || ''].some((x) => x.toLowerCase().includes(w));
}

function DutyRow({ d, on, allPaused, named }: { d: Duty; on: boolean; allPaused: boolean; named: boolean }) {
  const light = dutyLight(d, allPaused);
  const agentName = useAgentName(d.agent);
  const when = d.readback || startWords(d);
  const next = !d.paused && !allPaused && d.next && d.next[0] ? nextShort(d.next[0]) : '';
  const today = (d.state && d.state.todayUSD) || 0;
  return (
    <a class={'duty-row' + (on ? ' sel' : '')} href={dutyHref(d.name)} data-item aria-current={on ? 'page' : undefined}>
      <Mark agent={d.agent} size={32} selected={on} />
      <span class="duty-row-main">
        <span class="duty-row-top">
          <span class="duty-row-title">{dutyTitle(d)}</span>
          <DutyLed light={light} />
        </span>
        {when && <span class="duty-row-when">{when}</span>}
        <span class="duty-row-meta">
          {named && <span class="clip">{d.name}</span>}
          <span class="clip">{agentName}</span>
          {next && <span>Next {next}</span>}
          <span>{costText(today)} today</span>
        </span>
      </span>
    </a>
  );
}

/**
 * PauseAll is the switch of an admin that pauses every duty, after a
 * confirmation with an optional reason. While every duty is paused, the
 * list says so, and an admin resumes them in one click.
 */
function PauseAll({ paused }: { paused: boolean }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const turn = async (on: boolean) => {
    setBusy(true);
    const ok = await attempt(() => pauseAll(on, on ? reason.trim() || undefined : undefined));
    setBusy(false);
    if (ok) {
      setAsking(false);
      setReason('');
    }
  };
  if (paused) {
    return (
      <Button size="s" disabled={busy} onClick={() => turn(false)}>
        Resume all duties
      </Button>
    );
  }
  return (
    <>
      <Button size="s" kind="danger" onClick={() => setAsking(true)}>
        Pause all duties
      </Button>
      {asking && (
        <Confirm title="Pause every duty?" confirm="Pause all duties" danger busy={busy} onCancel={() => setAsking(false)} onConfirm={() => turn(true)}>
          <p>No duty starts until an admin resumes them. A run that works now goes on.</p>
          <Field label="Reason">
            <Input value={reason} maxLength={200} placeholder="Optional" onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
          </Field>
        </Confirm>
      )}
    </>
  );
}

/**
 * mayMakeDuty reports whether the person can make a duty: an admin, an
 * owner of an agent, and a person whose roles name no agent, because the
 * server decides. A duty needs the owner role on its agent.
 */
export function mayMakeDuty(me: { admin?: boolean; roles?: Record<string, string> } | null | undefined): boolean {
  if (!me) return true;
  const roles = Object.values(me.roles || {});
  return !!me.admin || roles.length === 0 || roles.includes('owner');
}

/** DutyList is the list pane: the duties in the order of attention, with Find a duty, New duty, and the switch of an admin. */
export function DutyList({ current }: { current?: string }) {
  const list = useDuties((s) => s.list);
  const paused = useDuties((s) => s.paused);
  const error = useDuties((s) => s.error);
  const off = useDuties((s) => s.off);
  const admin = useSelect((s) => !!(s.me && s.me.admin));
  const make = useSelect((s) => mayMakeDuty(s.me));
  const [q, setQ] = useState('');
  const rows = useRoving<HTMLDivElement>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    loadDuties().catch(() => {});
  }, []);
  // In a narrow window the list is the only pane, so its heading takes a focus that a move dropped, such as Cancel of New duty.
  const narrow = typeof window.matchMedia === 'function' && !window.matchMedia(TWO_PANES).matches;
  useFocusLost(narrow ? heading : { current: null }, []);
  const words = q.trim();
  const shown = useMemo(() => sortDuties((list || []).filter((d) => !words || matchesDuty(d, words))), [list, words]);
  // Two duties whose names read the same, such as daily-report and
  // daily_report, show their short names too, so a person can tell them
  // apart.
  const same = useMemo(() => {
    const seen = new Map<string, number>();
    for (const d of list || []) seen.set(dutyTitle(d), (seen.get(dutyTitle(d)) || 0) + 1);
    return seen;
  }, [list]);
  const count = list ? list.length : 0;
  return (
    <section class="screen duty-list" aria-labelledby="duties-title">
      <PaneHeader
        id="duties-title"
        headingRef={heading}
        focusable
        title="Duties"
        count={list && !off ? count : undefined}
        countLabel={count === 1 ? '1 duty' : count + ' duties'}
        actions={
          !off && make ? (
            <Button href="#duties/new" size="s" icon="plus">
              New duty
            </Button>
          ) : undefined
        }
      />
      {!off && <DutyTabs current="duties" />}
      {paused && !off && (
        <div class="duty-note" role="status">
          <p>
            <LineLed tone="grey" /> Every duty is paused.
          </p>
          {admin && <PauseAll paused />}
        </div>
      )}
      {count > 0 && (
        <div class="list-find">
          <Find label="Find a duty" value={q} onInput={setQ} />
        </div>
      )}
      <div class="scroll" ref={rows}>
        <div role="list" class="duty-rows">
          {shown.map((d) => (
            <div role="listitem">
              <DutyRow d={d} on={d.name === current} allPaused={paused} named={(same.get(dutyTitle(d)) || 0) > 1} />
            </div>
          ))}
        </div>
        {!list && !error && <p class="empty">Loading the duties.</p>}
        {error && !list && (
          <p class="empty" role="alert">
            {error}
          </p>
        )}
        {off && (
          <p class="empty">
            <OffWords />
          </p>
        )}
        {list && !off && count === 0 && (
          <div class="empty">
            <p>{DUTY_IS}</p>
            {make && (
              <Button href="#duties/new" kind="primary">
                New duty
              </Button>
            )}
          </div>
        )}
        {list && words && count > 0 && shown.length === 0 && <p class="empty">No duty holds those words.</p>}
      </div>
      {admin && !paused && !off && count > 0 && (
        <footer class="pane-foot duty-foot">
          <PauseAll paused={false} />
        </footer>
      )}
    </section>
  );
}

/* ---------- the main pane ---------- */

/** DutyMain is the main pane: a new duty, the editor of a duty, a duty, or, without one, the first duty where two panes show. A seed fills a new duty from Make this a duty. */
export function DutyMain({ name, edit, fresh, seed, run }: { name?: string; edit?: boolean; fresh?: boolean; seed?: DutySeed; run?: string }) {
  if (fresh) return <DutyEditor seed={seed} />;
  if (name && edit) return <DutyEditor name={name} />;
  if (name) return <DutyView name={name} open={run} />;
  return <DutyHome />;
}

function DutyHome() {
  const list = useDuties((s) => s.list);
  const error = useDuties((s) => s.error);
  const off = useDuties((s) => s.off);
  const make = useSelect((s) => mayMakeDuty(s.me));
  const first = useMemo(() => (list && list.length ? sortDuties(list)[0].name : ''), [list]);
  useEffect(() => {
    if (first && typeof window.matchMedia === 'function' && window.matchMedia(TWO_PANES).matches) go(dutyHref(first), true);
  }, [first]);
  return (
    <EmptyPane back={{ href: '#duties', label: 'Duties' }}>
      {off ? (
        <p>
          <OffWords />
        </p>
      ) : error && !list ? (
        <p>{error}</p>
      ) : !list ? (
        <p>Loading the duties.</p>
      ) : list.length === 0 ? (
        <>
          <p>{DUTY_IS}</p>
          {make && (
            <Button href="#duties/new" kind="primary">
              New duty
            </Button>
          )}
        </>
      ) : (
        <p>Pick a duty.</p>
      )}
    </EmptyPane>
  );
}

/** MessageWords shows a message of a duty with each placeholder as its words, set apart from the text. */
export function MessageWords({ text }: { text: string }) {
  const known = new Set(PLACEHOLDERS.map((p) => '[' + p.words + ']'));
  const parts = toWords(text).split(/(\[[^\[\]\n]{1,40}\])/g);
  return (
    <p class="duty-message">
      {parts.map((p) => (known.has(p) ? <span class="duty-ph">{p.slice(1, -1)}</span> : p))}
    </p>
  );
}

/** useCanChange reports whether the person can change a duty: an admin, an owner of its agent, or the person who made it. */
function useCanChange(d: Duty | undefined): boolean {
  return useSelect((s) => {
    if (!d || !s.me) return false;
    if (s.me.admin) return true;
    if (s.me.roles && s.me.roles[d.agent] === 'owner') return true;
    return !!(d.owner && s.me.principal && s.me.principal.subject === d.owner);
  });
}

/**
 * What Run now said: the run that started, a start with no run of an agent
 * (a duty that posts in a bridge or opens one answers an empty run), or
 * why the duty skipped.
 */
type Said = { run: string } | { started: true } | { skipped: string } | null;

/** DutyView is the page of one duty: what it does, when, its limits, and its history, with Run now, Pause, Edit, and Delete. */
function DutyView({ name, open }: { name: string; open?: string }) {
  const d = useDuties((s) => s.byName[name] || (s.list ? s.list.find((x) => x.name === name) : undefined));
  const gone = useDuties((s) => !!s.gone[name]);
  const off = useDuties((s) => s.off);
  const allPaused = useDuties((s) => s.paused);
  // A locked duty takes no change, no pause, and no delete, whoever the person is.
  const locked = lockedOf(d);
  // Run now needs the same role as a change, also on a locked duty.
  const canRun = useCanChange(d);
  const canChange = canRun && !locked;
  const agentName = useAgentName(d ? d.agent : '');
  const faces = useSelect((s) => s.faces);
  const nameOfAgent = (a: string) => (faces[a] && faces[a].displayName) || titleOfName(a);
  const [failed, setFailed] = useState('');
  const [said, setSaid] = useState<Said>(null);
  const [busy, setBusy] = useState(false);
  // The keys stay enabled while an action works, so they keep the focus. This ref turns a second press away.
  const working = useRef(false);
  const [asking, setAsking] = useState(false);
  // True for a while after Run now: the new run may not be in the history yet.
  const [started, setStarted] = useState(false);
  const shared = useDuties((s) => s.shared);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setFailed('');
    setSaid(null);
    setAsking(false);
    setStarted(false);
    loadDuty(name).catch((e) => setFailed(e instanceof Error ? e.message : 'The action failed. Try it again.'));
  }, [name]);
  useFocusLost(heading, [name, !!d]);
  // While a run of the duty works, or just after Run now, the page reads the duty again, so the state and the history follow it.
  const newest = d ? (d.history && d.history[0]) || (d.state && d.state.lastRun) || null : null;
  const moving = !!newest && MOVING.includes(newest.state);
  const waits = !!newest && newest.state === 'input-required';
  useEffect(() => {
    if (!moving && !started && !waits) return;
    const t = setInterval(() => loadDuty(name).catch(() => {}), moving || started ? following.fast : following.slow);
    return () => clearInterval(t);
  }, [name, moving, started, waits]);
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => setStarted(false), following.after);
    return () => clearTimeout(t);
  }, [started]);
  // A duty that names a shared channel reads the labels of the shared channels once.
  const names = d && d.notify ? [...channelsIn(d.notify.failure), ...channelsIn(d.notify.needsYou)] : [];
  useEffect(() => {
    if (names.length) loadSharedChannels().catch(() => {});
  }, [names.length > 0]);
  const labelOf = (n: string) => ((shared || []).find((c) => c.name === n) || { label: n }).label || n;
  // The stream carries no event of a duty. A run of its history that the
  // store follows, and that changes its state, reads the duty again.
  const runs = d && d.history ? d.history.map((r) => r.run || '').filter(Boolean).slice(0, 10) : [];
  const sig = useSelect((s) => runs.map((id) => id + '=' + (s.runs[id] ? s.runs[id].state : '')).join('\n'));
  const seen = useRef<Record<string, string>>({});
  useEffect(() => {
    const now: Record<string, string> = {};
    for (const part of sig ? sig.split('\n') : []) {
      const i = part.lastIndexOf('=');
      now[part.slice(0, i)] = part.slice(i + 1);
    }
    const moved = Object.keys(now).some((id) => seen.current[id] && now[id] && seen.current[id] !== now[id]);
    seen.current = now;
    if (moved) loadDuty(name).catch(() => {});
  }, [sig]);
  const back = { href: '#duties', label: 'Duties', to: 'list' as const };
  if (!d) {
    return (
      <section class="screen duty" aria-labelledby="duty-title">
        <PaneHeader id="duty-title" title={dutyLabel(name)} size="title" level={1} back={back} headingRef={heading} focusable />
        <div class="empty center">
          <p>{gone && off ? <OffWords /> : gone ? 'This duty is not here. It was removed, or you cannot see it.' : failed || 'Loading the duty.'}</p>
        </div>
      </section>
    );
  }
  const title = dutyTitle(d);
  const light = dutyLight(d, allPaused);
  const run = async (f: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await f();
    } catch (e) {
      showError(e);
    }
    working.current = false;
    setBusy(false);
  };
  const runNow = () =>
    run(async () => {
      setSaid(null);
      const r = await runDutyNow(name);
      setSaid(r.run ? { run: r.run } : r.skipped ? { skipped: r.skipped } : typeof r.run === 'string' ? { started: true } : { skipped: 'The duty started no run.' });
      if (r.run || typeof r.run === 'string') setStarted(true);
    });
  const items = canChange ? [{ label: 'Delete', danger: true, onSelect: () => setAsking(true) }] : [];
  const next = (d.next || []).slice(0, 5);
  const history = d.history || [];
  const reason = d.state && d.state.pausedReason;
  return (
    <section class="screen duty" aria-labelledby="duty-title">
      <PaneHeader id="duty-title" title={<span title={title}>{title}</span>} size="title" level={1} back={back} headingRef={heading} focusable>
        <DutyLed light={light} class="duty-status" />
      </PaneHeader>
      <div class="scroll pad duty-body">
        {importedOf(d) && <p class="duty-said duty-origin">{ORIGIN_LINE}</p>}
        {locked && (
          <p class="duty-said duty-locked">
            <LineLed tone="grey" /> {LOCKED_LINE}
          </p>
        )}
        {canRun && (
          <div class="duty-keys">
            <Button size="s" aria-disabled={busy || undefined} onClick={runNow}>
              Run now
            </Button>
            {canChange && (
              <>
                <Button size="s" aria-disabled={busy || undefined} onClick={() => run(() => pauseDuty(name, !d.paused))}>
                  {d.paused ? 'Resume' : 'Pause'}
                </Button>
                <Button size="s" href={hrefOf({ place: 'duties', name, edit: true })}>
                  Edit
                </Button>
              </>
            )}
            {items.length > 0 && <Menu label="More" kind="secondary" items={items} />}
          </div>
        )}
        {said && (
          <p class="duty-said" role="status">
            {'run' in said ? (
              <>
                A run started. <a href={runHref(name, said.run)}>Open the run</a>
              </>
            ) : 'started' in said ? (
              'Started. See the history for what it did.'
            ) : (
              'Skipped: ' + said.skipped
            )}
          </p>
        )}
        {(d.paused || allPaused) && (
          <p class="duty-said">
            <LineLed tone="grey" /> {allPaused ? 'Every duty is paused.' : reason ? 'Paused. ' + reason : 'Paused.'}
          </p>
        )}
        <section class="duty-sec" aria-labelledby="duty-when">
          <h2 class="t-sub duty-sec-head" id="duty-when">
            When
          </h2>
          <p class="duty-readback">{d.readback || startWords(d, nameOfAgent) || 'No schedule.'}</p>
          <ForDevelopers text={d.forDevelopers} />
          {next.length > 0 && !d.paused && !allPaused && (
            <>
              <p class="t-meta">Next, in your time</p>
              <ol class="duty-next">
                {next.map((t) => (
                  <li>
                    <time dateTime={t}>{nextWords(t)}</time>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
        <section class="duty-sec" aria-labelledby="duty-what">
          <h2 class="t-sub duty-sec-head" id="duty-what">
            What it does
          </h2>
          <DoWords d={d} agentName={agentName} title={title} locked={locked} />
        </section>
        {/* The readback of the front says what the check looks for, so the section shows only without it. */}
        {d.checkFirst && !d.readback && <CheckSection check={d.checkFirst} agentName={agentName} />}
        <section class="duty-sec" aria-labelledby="duty-limits">
          <h2 class="t-sub duty-sec-head" id="duty-limits">
            Limits
          </h2>
          <ul class="duty-lines">
            {limitWords(d.limits, !!(d.when && d.when.schedule), actOf(d.do)).map((w) => (
              <li>{w}</li>
            ))}
          </ul>
        </section>
        <section class="duty-sec" aria-labelledby="duty-away">
          <h2 class="t-sub duty-sec-head" id="duty-away">
            While you are away
          </h2>
          <p>{awayWords(d.whileAway)}</p>
        </section>
        <section class="duty-sec" aria-labelledby="duty-tell">
          <h2 class="t-sub duty-sec-head" id="duty-tell">
            Tell me about
          </h2>
          <p>{tellWords(d.notify, labelOf)}</p>
          {d.review && <p>{REVIEW_LINE}</p>}
        </section>
        <section class="duty-sec" aria-labelledby="duty-history">
          <h2 class="t-sub duty-sec-head" id="duty-history">
            History <Chip label={history.length === 1 ? '1 run' : history.length + ' runs'}>{history.length}</Chip>
          </h2>
          {history.length === 0 ? <p class="t-meta">No run yet.</p> : <History name={name} runs={history} open={open} who={agentName} review={!!d.review} />}
        </section>
      </div>
      {asking && (
        <Confirm
          title={'Delete ' + title + '?'}
          confirm="Delete"
          danger
          busy={busy}
          onCancel={() => setAsking(false)}
          onConfirm={() =>
            run(async () => {
              await removeDuty(name);
              setAsking(false);
              showSaid('Deleted the duty ' + title + '.');
              go('#duties');
              // The duty and its keys are gone, so the focus goes to the heading of the list.
              setTimeout(() => focusLost(document.getElementById('duties-title') || document.getElementById('duty-title')), 0);
            })
          }
        >
          <p>The duty stops for good, and its history goes with it. A run that works now goes on.</p>
        </Confirm>
      )}
    </section>
  );
}

/** CheckSection says the check of a duty in words, each tool by what it does, for a duty whose readback does not say it. */
function CheckSection({ check, agentName }: { check: NonNullable<Duty['checkFirst']>; agentName: string }) {
  const catalog = useToolCatalog();
  return (
    <section class="duty-sec" aria-labelledby="duty-check">
      <h2 class="t-sub duty-sec-head" id="duty-check">
        Check first
      </h2>
      <p>{checkWords(check, agentName, (t) => phraseOf(catalog, t))}</p>
    </section>
  );
}

/**
 * DoWords says what a duty does: it asks its agent, posts in a bridge to
 * some members, opens a bridge from a playbook, or asks the manager, with
 * its message or its goal. A message that comes from the setup of the
 * server never shows: a line says so, and asks for a message unless the
 * duty is locked.
 */
function DoWords({ d, agentName, title, locked }: { d: Duty; agentName: string; title: string; locked: boolean }) {
  const x = d.do || {};
  const bridge = useSelect((s) => (x.post && x.post.bridge ? s.bridges.byId[x.post.bridge] : undefined));
  const agent = <a href={hrefOf({ place: 'fleet', agent: d.agent, profile: true })}>{agentName}</a>;
  if (x.post) {
    return (
      <>
        <p class="duty-who">
          <Mark agent={d.agent} size={24} />
          <span>
            {agent} posts in{' '}
            {bridge ? <a href={hrefOf({ place: 'bridge', id: x.post.bridge, pane: 'none' })}>{bridge.title}</a> : 'a team that you cannot see'}
            {x.post.to && x.post.to.length ? ' to ' + listWords(x.post.to) : ''}
          </span>
        </p>
        <MessageWords text={x.post.message} />
      </>
    );
  }
  if (x.open) {
    return (
      <>
        <p class="duty-who">
          <Mark agent={d.agent} size={24} />
          <span>
            {agent} opens a team from the playbook {x.open.playbook}
          </span>
        </p>
        {x.open.goal && <MessageWords text={x.open.goal} />}
      </>
    );
  }
  if (x.manager) {
    return (
      <>
        <p class="duty-who">
          <Mark agent={d.agent} size={24} />
          <span>Ask the manager</span>
        </p>
        <MessageWords text={x.manager.message} />
      </>
    );
  }
  return (
    <>
      <p class="duty-who">
        <Mark agent={d.agent} size={24} />
        <span>
          {x.ask ? 'Ask ' : ''}
          {agent}
        </span>
      </p>
      {templatedOf(d) ? (
        <p class="duty-template">{locked ? TEMPLATE_LINE : TEMPLATE_LINE + ' ' + TEMPLATE_REPLACE}</p>
      ) : x.ask ? (
        <MessageWords text={x.ask.message || ''} />
      ) : (
        <p>{title}</p>
      )}
    </>
  );
}

/**
 * History lists the runs of a duty, newest first: the time, the light,
 * what the check found, the cost, the first line of the answer, and the
 * key that opens the run. Under a run come the questions that somebody
 * decided while the person was away, and the run that the address opens.
 * The page reads the runs of the newest lines for their answers.
 */
function History({ name, runs, open, who, review }: { name: string; runs: DutyRun[]; open?: string; who: string; review: boolean }) {
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  // The results that wait for the person to check them, from the inbox that the app bar follows.
  const inbox = useDuties((s) => s.inbox);
  const toCheck = useMemo(() => new Set((inbox || []).filter((it) => it.kind === 'result' && it.run).map((it) => it.run!)), [inbox]);
  const ids = runs
    .map((r) => r.run || '')
    .filter(Boolean)
    .slice(0, ANSWERS)
    .join(',');
  useEffect(() => {
    if (ids) ensureRuns(ids.split(','));
  }, [ids]);
  return (
    <ol class="duty-runs">
      {runs.map((r) => (
        <HistoryLine name={name} r={r} me={me} open={!!r.run && r.run === open} who={who} toCheck={!!r.run && toCheck.has(r.run)} review={review} />
      ))}
    </ol>
  );
}

/** HistoryLine is one run of the history, with the first line of its answer, and its run pane when the address opens it. */
function HistoryLine({ name, r, me, open, who, toCheck, review }: { name: string; r: DutyRun; me: string; open: boolean; who: string; toCheck: boolean; review: boolean }) {
  // A result says its verdict where the page knows one, else the light of the run.
  const run = useSelect((s) => (r.run ? s.runs[r.run] : undefined));
  const light = resultLight(r, run, toCheck, review) || runLight(r);
  const found = checkLine(r);
  const decided = r.decided || [];
  const answer = useSelect((s) => (r.run && s.runs[r.run] ? answerLine(s.runs[r.run].output || '') : ''));
  return (
    <li class={'duty-run' + (open ? ' open' : '')}>
      <span class="duty-run-at">
        <When at={r.at} />
      </span>
      <Led tone={light.tone} word={light.word} label={light.label} still />
      {found && <span class="duty-run-found">{found}</span>}
      {typeof r.costUSD === 'number' && r.costUSD > 0 && <span class="duty-run-cost">{costText(r.costUSD)}</span>}
      {r.state === 'retrying' ? <span class="duty-run-why">{retryWords(r)}</span> : r.reason && <span class="duty-run-why">{r.reason}</span>}
      {r.run && (
        <a class="duty-run-link" href={open ? hrefOf({ place: 'duties', name }) : runHref(name, r.run)} aria-expanded={open} aria-controls={open ? 'duty-run-' + r.run : undefined}>
          {open ? 'Hide the run' : 'Open the run'}
        </a>
      )}
      {answer && <span class="duty-run-answer">{answer}</span>}
      {decided.length > 0 && <Decided list={decided} me={me} />}
      {open && r.run && <DutyRunPane runId={r.run} who={who} />}
    </li>
  );
}

/** Decided lists the questions of a run that somebody decided while the person was away, each call in words, such as a shell command. */
function Decided({ list, me }: { list: NonNullable<DutyRun['decided']>; me: string }) {
  const catalog = useToolCatalog();
  return (
    <ul class="duty-decided" aria-label="Decided while you were away">
      {list.map((x) => (
        <li>
          <span class="duty-decided-at">
            <When at={x.at} />
          </span>
          <span title={x.tool || undefined}>{decidedWords(x, me, (t) => phraseOf(catalog, t))}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * DutyRunPane is a run of a duty under its line of the history: the result
 * (its title, its status, a failure, the answer, what it did, the limits,
 * and the reactions), the files that it changed, and its conversation, as
 * the run pane of a seat shows them. The person opened it, so the pane
 * reads the run, and says so when the read wakes its worker.
 */
function DutyRunPane({ runId, who }: { runId: string; who: string }) {
  const run = useSelect((s) => s.runs[runId]);
  const res = useResult(runId);
  const t = useTranscript(runId);
  const archived = !!((res && res.archived) || (run && run.archived));
  const wakes = useSelect((s) => awakeFor(selectFacts(s), s.runs[runId]) === false) && !archived;
  const end = [...t.items].reverse().find((x) => x.kind === 'end');
  const box = useRef<HTMLElement>(null);
  // The run opens in sight: its line comes to the top of the pane, and
  // again while the page around it settles, such as when its result
  // arrives, until the person scrolls, types, or touches the pane.
  const arrived = !!res || t.items.length > 0;
  useEffect(() => {
    const el = box.current;
    const line = el && (el.closest('.duty-run') as HTMLElement | null);
    const pane = line && (line.closest('.scroll') as HTMLElement | null);
    if (!line || !pane) return;
    let moved = false;
    const mine = () => (moved = true);
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'];
    for (const e of events) pane.addEventListener(e, mine, { passive: true });
    // Only the pane scrolls, never the page around it, so the header of the pane stays.
    const align = () => {
      if (moved || !line.isConnected) return;
      pane.scrollTop += line.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    };
    align();
    const timers = [300, 1000].map((ms) => setTimeout(align, ms));
    return () => {
      for (const t of timers) clearTimeout(t);
      for (const e of events) pane.removeEventListener(e, mine);
    };
  }, [runId, arrived]);
  return (
    <section class="duty-runpane" id={'duty-run-' + runId} aria-label={'The run of ' + who} ref={box}>
      <RunView runId={runId} result={res} who={who} items={t.items} endSeq={end ? end.seq : undefined} gone={t.gone} archived={archived} wakes={wakes} />
      {filesCount(res, t.items) > 0 && <FilesView runId={runId} result={res} items={t.items} gone={t.gone} archived={archived} />}
      <Conversation run={run} result={res} t={t} agentLabel={who} />
    </section>
  );
}

/* ---------- the profile of an agent ---------- */

/**
 * AgentDuties is the section of the duties of an agent on its profile: the
 * count and a link to each. An agent without a duty has no section, and
 * neither has a front that keeps no duties.
 */
export function AgentDuties({ agent }: { agent: string }) {
  const list = useDuties((s) => s.list);
  const off = useDuties((s) => s.off);
  useEffect(() => {
    if (!list) loadDuties().catch(() => {});
  }, []);
  const mine = useMemo(() => sortDuties((list || []).filter((d) => d.agent === agent)), [list, agent]);
  if (off || mine.length === 0) return null;
  return (
    <section class="prof-sec" aria-labelledby={'duties-' + agent}>
      <div class="prof-sec-head">
        <h3 class="t-sub" id={'duties-' + agent}>
          Duties
        </h3>
        <Chip label={mine.length === 1 ? '1 duty' : mine.length + ' duties'}>{mine.length}</Chip>
      </div>
      <ul class="prof-duties">
        {mine.map((d) => (
          <li>
            <a class="prof-link" href={dutyHref(d.name)}>
              {dutyTitle(d)}
            </a>
            {d.readback && <span class="t-meta">{d.readback}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
