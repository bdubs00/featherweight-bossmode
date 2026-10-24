// The Duties place. A duty is what an agent does on its own: who, when,
// what, and its limits. The list pane holds every duty that the person can
// view, each with the mark of its agent, what it does, its time in words,
// the light of its last run, its next time, and its spend of today. For an
// admin, its foot holds the switch that pauses every duty. The main pane
// holds one duty with its history, or the editor of New duty and Edit
// (DutyEditor.tsx). docs/CONTRACT.md, section 16, names the routes.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Duty, DutyRun } from '../api/types';
import { go, hrefOf, type DutySeed } from '../lib/route';
import { costText } from '../lib/cost';
import {
  PLACEHOLDERS,
  awayWords,
  channelsIn,
  checkLine,
  checkWords,
  decidedWords,
  dutyLight,
  dutyTitle,
  limitWords,
  listWords,
  retryWords,
  nextShort,
  nextWords,
  runLight,
  startWords,
  tellWords,
  titleOfName,
  toWords,
} from '../lib/duties';
import { useSelect } from '../state/store';
import { loadDuties, loadDuty, loadSharedChannels, pauseAll, pauseDuty, removeDuty, runDutyNow, useDuties } from '../state/duties';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Confirm, Menu, When } from './common';
import { Button, Chip, Field, Find, Input, Led, LineLed, Mark, PaneHeader } from './primitives';
import { EmptyPane } from './Shell';
import { DutyEditor, useAgentName } from './DutyEditor';

/** The width from which two panes show side by side, as App names it. */
const TWO_PANES = '(min-width: 800px)';

/** The one sentence of the empty place: what a duty is. */
export const DUTY_IS = 'A duty is work that an agent does on its own, on a schedule and within limits that you set.';

const dutyHref = (name: string) => hrefOf({ place: 'duties', name });

/** runHref links a run of a duty on the page at /ui, as a heart and a ticket of a routine do. */
const runHref = (run: string) => '/ui#run/' + encodeURIComponent(run);

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
  return [dutyTitle(d), d.name, d.agent, d.readback || ''].some((x) => x.toLowerCase().includes(w));
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
          <Led tone={light.tone} word={light.word} label={light.label} still={light.still} />
        </span>
        {when && <span class="duty-row-when">{when}</span>}
        <span class="duty-row-meta">
          {named && <span class="clip">{titleOfName(d.name)}</span>}
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

/** DutyList is the list pane: the duties in the order of attention, with Find a duty, New duty, and the switch of an admin. */
export function DutyList({ current }: { current?: string }) {
  const list = useDuties((s) => s.list);
  const paused = useDuties((s) => s.paused);
  const error = useDuties((s) => s.error);
  const off = useDuties((s) => s.off);
  const admin = useSelect((s) => !!(s.me && s.me.admin));
  const [q, setQ] = useState('');
  const rows = useRoving<HTMLDivElement>();
  useEffect(() => {
    loadDuties().catch(() => {});
  }, []);
  const words = q.trim();
  const shown = useMemo(() => sortDuties((list || []).filter((d) => !words || matchesDuty(d, words))), [list, words]);
  // Two duties that say the same show their names too, so a person can
  // tell them apart.
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
        title="Duties"
        count={list && !off ? count : undefined}
        countLabel={count === 1 ? '1 duty' : count + ' duties'}
        actions={
          !off ? (
            <Button href="#duties/new" size="s" icon="plus">
              New duty
            </Button>
          ) : undefined
        }
      />
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
            <Button href="#duties/new" kind="primary">
              New duty
            </Button>
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
export function DutyMain({ name, edit, fresh, seed }: { name?: string; edit?: boolean; fresh?: boolean; seed?: DutySeed }) {
  if (fresh) return <DutyEditor seed={seed} />;
  if (name && edit) return <DutyEditor name={name} />;
  if (name) return <DutyView name={name} />;
  return <DutyHome />;
}

function DutyHome() {
  const list = useDuties((s) => s.list);
  const error = useDuties((s) => s.error);
  const off = useDuties((s) => s.off);
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
          <Button href="#duties/new" kind="primary">
            New duty
          </Button>
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
function DutyView({ name }: { name: string }) {
  const d = useDuties((s) => s.byName[name] || (s.list ? s.list.find((x) => x.name === name) : undefined));
  const gone = useDuties((s) => !!s.gone[name]);
  const off = useDuties((s) => s.off);
  const allPaused = useDuties((s) => s.paused);
  const canChange = useCanChange(d);
  const agentName = useAgentName(d ? d.agent : '');
  const faces = useSelect((s) => s.faces);
  const nameOfAgent = (a: string) => (faces[a] && faces[a].displayName) || a;
  const [failed, setFailed] = useState('');
  const [said, setSaid] = useState<Said>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const shared = useDuties((s) => s.shared);
  useEffect(() => {
    setFailed('');
    setSaid(null);
    setAsking(false);
    loadDuty(name).catch((e) => setFailed(e instanceof Error ? e.message : 'The action failed. Try it again.'));
  }, [name]);
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
        <PaneHeader id="duty-title" title={titleOfName(name)} size="title" level={1} back={back} />
        <div class="empty center">
          <p>{gone && off ? <OffWords /> : gone ? 'This duty is not here. It was removed, or you cannot see it.' : failed || 'Loading the duty.'}</p>
        </div>
      </section>
    );
  }
  const title = dutyTitle(d);
  const light = dutyLight(d, allPaused);
  if (d.source === 'file') return <SourceView d={d} title={title} agentName={agentName} back={back} />;
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      showError(e);
    }
    setBusy(false);
  };
  const runNow = () =>
    run(async () => {
      setSaid(null);
      const r = await runDutyNow(name);
      setSaid(r.run ? { run: r.run } : r.skipped ? { skipped: r.skipped } : typeof r.run === 'string' ? { started: true } : { skipped: 'The duty started no run.' });
    });
  const items = canChange ? [{ label: 'Delete', danger: true, onSelect: () => setAsking(true) }] : [];
  const next = (d.next || []).slice(0, 5);
  const history = d.history || [];
  const reason = d.state && d.state.pausedReason;
  return (
    <section class="screen duty" aria-labelledby="duty-title">
      <PaneHeader id="duty-title" title={<span title={title}>{title}</span>} size="title" level={1} back={back}>
        <Led tone={light.tone} word={light.word} label={light.label} still={light.still} class="duty-status" />
      </PaneHeader>
      <div class="scroll pad duty-body">
        <div class="duty-keys">
          <Button size="s" disabled={busy} onClick={runNow}>
            Run now
          </Button>
          {canChange && (
            <>
              <Button size="s" disabled={busy} onClick={() => run(() => pauseDuty(name, !d.paused))}>
                {d.paused ? 'Resume' : 'Pause'}
              </Button>
              <Button size="s" href={hrefOf({ place: 'duties', name, edit: true })}>
                Edit
              </Button>
            </>
          )}
          {items.length > 0 && <Menu label="More" kind="secondary" items={items} />}
        </div>
        {said && (
          <p class="duty-said" role="status">
            {'run' in said ? (
              <>
                A run started. <a href={runHref(said.run)}>Open the run</a>
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
          <DoWords d={d} agentName={agentName} title={title} />
        </section>
        {/* The readback of the front says what the check looks for, so the section shows only without it. */}
        {d.checkFirst && !d.readback && (
          <section class="duty-sec" aria-labelledby="duty-check">
            <h2 class="t-sub duty-sec-head" id="duty-check">
              Check first
            </h2>
            <p>{checkWords(d.checkFirst, agentName)}</p>
          </section>
        )}
        <section class="duty-sec" aria-labelledby="duty-limits">
          <h2 class="t-sub duty-sec-head" id="duty-limits">
            Limits
          </h2>
          <ul class="duty-lines">
            {limitWords(d.limits, !!(d.when && d.when.schedule)).map((w) => (
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
        </section>
        <section class="duty-sec" aria-labelledby="duty-history">
          <h2 class="t-sub duty-sec-head" id="duty-history">
            History <Chip label={history.length === 1 ? '1 run' : history.length + ' runs'}>{history.length}</Chip>
          </h2>
          {history.length === 0 ? <p class="t-meta">No run yet.</p> : <History runs={history} />}
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
              go('#duties');
            })
          }
        >
          <p>The duty stops for good, and its history goes with it. A run that works now goes on.</p>
        </Confirm>
      )}
    </section>
  );
}

/**
 * SourceView is the page of a duty that comes from the settings of the
 * front, an entry of workbench.sources: the note that it changes there,
 * when it starts, and its agent. It has no limits, no decisions while the
 * person is away, and no notifications, and the front refuses every
 * change, so the page offers no key.
 */
function SourceView({ d, title, agentName, back }: { d: Duty; title: string; agentName: string; back: { href: string; label: string; to: 'list' } }) {
  return (
    <section class="screen duty" aria-labelledby="duty-title">
      <PaneHeader id="duty-title" title={<span title={title}>{title}</span>} size="title" level={1} back={back} />
      <div class="scroll pad duty-body">
        <p class="duty-said">This duty comes from the settings of the front. Change it there.</p>
        <section class="duty-sec" aria-labelledby="duty-when">
          <h2 class="t-sub duty-sec-head" id="duty-when">
            When
          </h2>
          <p class="duty-readback">{d.readback || startWords(d) || 'Another app starts it.'}</p>
        </section>
        <section class="duty-sec" aria-labelledby="duty-agent">
          <h2 class="t-sub duty-sec-head" id="duty-agent">
            Agent
          </h2>
          <p class="duty-who">
            <Mark agent={d.agent} size={24} />
            <a href={hrefOf({ place: 'fleet', agent: d.agent, profile: true })}>{agentName}</a>
          </p>
        </section>
      </div>
    </section>
  );
}

/**
 * DoWords says what a duty does: it asks its agent, posts in a bridge to
 * some members, opens a bridge from a playbook, or asks the manager, with
 * its message or its goal.
 */
function DoWords({ d, agentName, title }: { d: Duty; agentName: string; title: string }) {
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
            {bridge ? <a href={hrefOf({ place: 'bridge', id: x.post.bridge, pane: 'none' })}>{bridge.title}</a> : 'a bridge that you cannot see'}
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
            {agent} opens a bridge from the playbook {titleOfName(x.open.playbook)}
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
      {x.ask ? <MessageWords text={x.ask.message} /> : <p>{title}</p>}
    </>
  );
}

/**
 * History lists the runs of a duty, newest first: the time, the light,
 * what the check found, the cost, and the run. Under a run come the
 * questions that somebody decided while the person was away.
 */
function History({ runs }: { runs: DutyRun[] }) {
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  return (
    <ol class="duty-runs">
      {runs.map((r) => {
        const light = runLight(r);
        const found = checkLine(r);
        const decided = r.decided || [];
        return (
          <li class="duty-run">
            <span class="duty-run-at">
              <When at={r.at} />
            </span>
            <Led tone={light.tone} word={light.word} label={light.label} still />
            {found && <span class="duty-run-found">{found}</span>}
            {typeof r.costUSD === 'number' && r.costUSD > 0 && <span class="duty-run-cost">{costText(r.costUSD)}</span>}
            {r.state === 'retrying' ? <span class="duty-run-why">{retryWords(r)}</span> : r.reason && <span class="duty-run-why">{r.reason}</span>}
            {r.run && (
              <a class="duty-run-link" href={runHref(r.run)}>
                Open the run
              </a>
            )}
            {decided.length > 0 && (
              <ul class="duty-decided" aria-label="Decided while you were away">
                {decided.map((x) => (
                  <li>
                    <span class="duty-decided-at">
                      <When at={x.at} />
                    </span>
                    <span>{decidedWords(x, me)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
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
