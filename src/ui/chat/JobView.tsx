// A job: a duty of the API, work that repeats on a schedule. The stream
// holds its runs, newest at the foot as a chat does: each run posts what it
// was asked and what it found, with its status, its verdict, and its cost.
// The pane at the right says when it runs, who does it, what it costs at
// most, and holds Run now, Pause, and Edit.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import type { Duty, DutyRun } from '../../api/types';
import { useSelect } from '../../state/store';
import { ensureRuns } from '../../state/fetchers';
import { loadDuty, pauseDuty, runDutyNow, useDuties } from '../../state/duties';
import { dutyTitle, dutyWhat, nextShort, tellWords } from '../../lib/duties';
import { costText } from '../../lib/cost';
import { clock, dayWords, excerpt, plainText } from '../../lib/words';
import { attempt, showSaid } from '../notice';
import { Empty, Markdown } from '../common';
import { Glyph } from '../icons';
import { Button, Led, Mark } from '../primitives';
import { Clock } from './Sidebar';
import { WayOut } from './WayOut';
import { agentNameOf, reloadBoard } from './data';
import { chatHref } from './route';
import { pageWords, type Status } from './channels';

/** runStatus says the state of a run of a job in the words of the stream. */
export function runStatus(r: DutyRun): Status {
  const v = (r as { verdict?: string }).verdict;
  if (v === 'accepted') return { word: 'accepted', tone: 'green' };
  if (v === 'sent-back') return { word: 'sent back', tone: 'red' };
  switch (r.state) {
    case 'completed':
      return { word: 'done', tone: 'grey' };
    case 'running':
    case 'queued':
      return { word: 'working', tone: 'green' };
    case 'input-required':
      return { word: 'needs you', tone: 'amber' };
    case 'failed':
      return { word: 'failed', tone: 'red' };
    case 'retrying':
      return { word: 'trying again', tone: 'grey' };
    case 'skipped':
    case 'quiet':
      return { word: 'nothing to do', tone: 'grey' };
  }
  return { word: String(r.state || '').replace(/-/g, ' '), tone: 'grey' };
}

function useJob(name: string): Duty | undefined {
  useEffect(() => {
    loadDuty(name).catch(() => {});
  }, [name]);
  const whole = useDuties((s) => s.byName[name]);
  const listed = useDuties((s) => (s.list || []).find((d) => d.name === name));
  return whole || listed;
}

function RunPost({ d, r }: { d: Duty; r: DutyRun }) {
  const run = useSelect((s) => (r.run ? s.runs[r.run] : undefined));
  const name = useSelect((s) => agentNameOf(s, d.agent));
  const st = runStatus(r);
  const answer = run && run.output ? run.output : '';
  return (
    <article class="cf-post">
      <span class="cf-post-face">
        <Mark agent={d.agent} size={36} />
      </span>
      <div class="cf-post-main">
        <p class="cf-post-head">
          <strong>{name}</strong>
          <time dateTime={r.at} title={new Date(r.at).toLocaleString()}>
            {dayWords(r.at)} {clock(r.at)}
          </time>
        </p>
        {r.title && <p class="cf-post-title">{r.title}</p>}
        {answer ? <Markdown text={answer.length > 1200 ? excerpt(plainText(answer), 600) : answer} refs headings={4} /> : r.reason ? <p class="cf-post-quiet">{pageWords(r.reason)}</p> : null}
        <p class="cf-post-status">
          <Led tone={st.tone} word={st.word} still={st.tone === 'amber' ? undefined : true} />
          {typeof r.costUSD === 'number' && r.costUSD > 0 && <span> · {costText(r.costUSD)}</span>}
          {r.run && (
            <>
              {' · '}
              <a href={chatHref({ view: 'run', id: r.run })}>Open the run</a>
            </>
          )}
        </p>
      </div>
    </article>
  );
}

export function JobView({ name }: { name: string }) {
  const d = useJob(name);
  const gone = useDuties((s) => !!s.gone[name]);
  const history = useMemo(() => (d && d.history ? [...d.history].reverse() : []), [d]);
  const ids = history.map((r) => r.run || '').filter(Boolean).join(',');
  useEffect(() => {
    if (ids) ensureRuns(ids.split(','));
  }, [ids]);
  // The stream opens at its foot, on the newest run, as a chat does.
  const box = useRef<HTMLDivElement>(null);
  const runsIn = useSelect((s) => ids.split(',').filter((x) => !!s.runs[x]).length);
  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [name, history.length, runsIn]);
  if (!d) {
    return (
      <section class="cf-view">
        <header class="cf-head">
          <a class="cf-back" href="#" aria-label="Back to the channels">
            <Glyph name="back" size={20} />
          </a>
          <h1 class="cf-title">Job</h1>
        </header>
        <Empty>{gone ? 'This job is not here. It was removed, or you cannot see it.' : 'Loading the job.'}</Empty>
      </section>
    );
  }
  const next = d.paused ? '' : d.next && d.next[0] ? nextShort(d.next[0]) : '';
  return (
    <section class="cf-view cf-job-view" aria-labelledby="cf-job-title">
      <header class="cf-head">
        <a class="cf-back" href="#" aria-label="Back to the jobs">
          <Glyph name="back" size={20} />
        </a>
        <Mark agent={d.agent} size={32} />
        <h1 class="cf-title" id="cf-job-title" title={dutyTitle(d)}>
          {dutyTitle(d)}
        </h1>
        <Clock label="Repeats on a schedule" />
        <span class="grow" />
        <a class="cf-members-key" href={chatHref({ view: 'job', name, about: true })}>
          About
        </a>
      </header>
      <div class="scroll cf-stream" ref={box}>
        <div class="cf-stream-in">
          <p class="cf-stream-start">
            {pageWords(d.readback || '')} {pageWords(dutyWhat(d))}
          </p>
          {history.length === 0 && <p class="cf-post-quiet">No run yet.</p>}
          {history.map((r) => (
            <RunPost d={d} r={r} />
          ))}
          <WayOut duty={name} brief />
          <p class="cf-sys">
            <Led tone="grey" word={d.paused ? 'Paused. It runs again when you resume it.' : next ? 'Next run ' + next : 'No run planned'} still />
          </p>
        </div>
      </div>
    </section>
  );
}

export function JobPane({ name }: { name: string }) {
  const d = useJob(name);
  const agentName = useSelect((s) => (d ? agentNameOf(s, d.agent) : ''));
  if (!d) return null;
  const budget = d.limits && d.limits.budget ? d.limits.budget : {};
  return (
    <section class="cf-members" aria-labelledby="cf-job-about">
      <header class="cf-head cf-head-right">
        <a class="cf-back" href={chatHref({ view: 'job', name })} aria-label="Back to the job">
          <Glyph name="back" size={20} />
        </a>
        <h2 class="cf-title cf-title-s" id="cf-job-about">
          About this job
        </h2>
        <Button size="s" href={'#duties/' + encodeURIComponent(name) + '/edit'}>
          Edit
        </Button>
      </header>
      <div class="cf-members-scroll">
        <section class="cf-msec">
          <dl class="cf-facts">
            <dt>When</dt>
            <dd>{pageWords(d.readback || 'On a schedule')}</dd>
            <dt>Who</dt>
            <dd>
              <a href={chatHref({ view: 'agent', name: d.agent })}>{agentName}</a>
            </dd>
            <dt>What it does</dt>
            <dd>{pageWords(dutyWhat(d)) || 'The setup of the server names it.'}</dd>
            {typeof budget.maxCostUSD === 'number' && (
              <>
                <dt>Most per run</dt>
                <dd>{costText(budget.maxCostUSD)}</dd>
              </>
            )}
            <dt>Tells</dt>
            <dd>{tellWords(d.notify)}</dd>
            {d.review && (
              <>
                <dt>Sign off</dt>
                <dd>Each result waits for you: Looks right or Needs work.</dd>
              </>
            )}
          </dl>
        </section>
        <section class="cf-msec cf-job-keys">
          <Button
            size="s"
            kind="primary"
            onClick={async () => {
              const ok = await attempt(() => runDutyNow(name));
              if (ok) {
                showSaid('Started ' + dutyTitle(d) + '.');
                reloadBoard();
              }
            }}
          >
            Run now
          </Button>
          <Button
            size="s"
            onClick={async () => {
              const ok = await attempt(() => pauseDuty(name, !d.paused));
              if (ok) showSaid((d.paused ? 'Resumed ' : 'Paused ') + dutyTitle(d) + '.');
            }}
          >
            {d.paused ? 'Resume' : 'Pause'}
          </Button>
        </section>
      </div>
    </section>
  );
}
