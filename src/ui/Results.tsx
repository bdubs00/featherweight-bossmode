// Results: what the work of the agents gave and what it took, for a person
// who pays for the agents and decides whether they are worth it. One pane:
// the window, six figures, the done work by period with the verdicts of
// people, and the lines of work. A result that waits for a check and a
// task that waits for a person link to Activity, and the name of a line
// opens its duty or its agent. Every figure is what the records hold: an
// unchecked result shows as unchecked, a spend with unpriced tokens says
// at least, and hours of a person show only from an estimate that names
// the person who set it. The operator metrics stay in Prometheus.

import { useEffect, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import { valueApi, WINDOWS, type Value, type ValueChecks, type ValueLine, type ValuePeriod, type Window } from '../api/value';
import { fleetAgents } from '../lib/agents';
import { costText } from '../lib/cost';
import { hrefOf } from '../lib/route';
import { personName } from '../lib/words';
import { useSelect } from '../state/store';
import { useInboxRows } from '../state/activity';
import { Face } from './common';
import { Button, Help, Input, Led, PaneHeader, Tabs } from './primitives';

/** The key of the window that the person picked, a convenience of one browser. */
const WINDOW_KEY = 'fw.bossmode.results.days';

function readWindow(): Window {
  try {
    const v = Number(localStorage.getItem(WINDOW_KEY));
    return (WINDOWS as readonly number[]).includes(v) ? (v as Window) : 30;
  } catch {
    return 30;
  }
}

function keepWindow(d: Window) {
  try {
    localStorage.setItem(WINDOW_KEY, String(d));
  } catch {
    /* The choice lives for this view only. */
  }
}

/** span words a number of seconds in its largest units: 40 s, 12 min, 3 h 10 min, or 2 d 4 h. */
export function span(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '0 min';
  if (s < 60) return Math.round(s) + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (s < 86400) {
    const m = Math.floor((s % 3600) / 60);
    return Math.floor(s / 3600) + ' h' + (m ? ' ' + m + ' min' : '');
  }
  const h = Math.floor((s % 86400) / 3600);
  return Math.floor(s / 86400) + ' d' + (h ? ' ' + h + ' h' : '');
}

/** hours words a number of minutes of a person as whole hours, or minutes under an hour. */
export function hours(minutes: number): string {
  if (minutes < 60) return minutes + ' min';
  return Math.round(minutes / 60).toLocaleString() + ' h';
}

/** pct words a share from 0 to 1 as a whole percent. */
export const pct = (x: number): string => Math.round(x * 100) + '%';

/** day words a moment as a short date, such as Oct 21. */
const day = (iso: string | number): string => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const DAY_MS = 86_400_000;

/**
 * periodWords names a column of the chart. A day says the date that most of
 * it covers, because a day of the window ends now and not at midnight. A
 * week says its first day. A period shorter than its unit, such as the
 * first week of a window of 30 days, also says its length, so a short
 * column never reads as a slow week.
 */
export function periodWords(p: { start: string; end: string }, unit: 'day' | 'week'): { label: string; short: string } {
  const a = Date.parse(p.start);
  const b = Date.parse(p.end);
  const len = b - a;
  const label = unit === 'day' ? day(a + len / 2) : day(a);
  const full = unit === 'day' ? DAY_MS : 7 * DAY_MS;
  if (!(len > 0) || len >= full - 60_000) return { label, short: '' };
  const days = Math.round(len / DAY_MS);
  return { label, short: days < 1 ? 'under a day' : days === 1 ? '1 day' : days + ' days' };
}

/** lineHref is the address of what a line of work is: the page of its duty, or the profile of its agent. A source has no page. */
export function lineHref(l: Pick<ValueLine, 'kind' | 'name' | 'agent'>): string {
  if (l.kind === 'duty') return hrefOf({ place: 'duties', name: l.name });
  if (l.kind === 'agent') return hrefOf({ place: 'fleet', agent: l.agent, profile: true });
  return '';
}

const KIND_WORD: Record<ValueLine['kind'], string> = { duty: 'duty', source: 'source', agent: 'agent' };

export function Results() {
  const [days, setDays] = useState<Window>(readWindow);
  const [value, setValue] = useState<Value | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError('');
    valueApi
      .get(days)
      .then((v) => live && setValue(v))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [days, tick]);
  const pick = (id: string) => {
    const d = Number(id) as Window;
    keepWindow(d);
    setDays(d);
  };
  const v = value && value.days === days ? value : null;
  return (
    <section class="screen results" aria-labelledby="results-title" aria-describedby={v ? 'results-sentence' : undefined}>
      <PaneHeader id="results-title" title="Results" size="title" level={1}>
        <Tabs label="Window" items={WINDOWS.map((d) => ({ id: String(d), label: d + ' days' }))} current={String(days)} onSelect={pick} />
      </PaneHeader>
      <div class="scroll pad">
        {error && (
          <p class="rs-error" role="alert">
            <Led tone="red" word="Failed" /> {error}{' '}
            <Button kind="quiet" size="s" onClick={() => setTick((n) => n + 1)}>
              Try again
            </Button>
          </p>
        )}
        {!v && !error && (
          <p class="t-meta" role="status">
            Loading the results.
          </p>
        )}
        {v && <Body v={v} onSaved={() => setTick((n) => n + 1)} />}
      </div>
    </section>
  );
}

function Body({ v, onSaved }: { v: Value; onSaved: () => void }) {
  const unit: 'day' | 'week' = v.days <= 7 ? 'day' : 'week';
  // The results that wait for a check of the person, as Activity lists them.
  const { rows } = useInboxRows();
  const toCheck = rows.filter((r) => r.kind === 'result');
  const measured = v.lead.measured > 0;
  return (
    <div class="rs">
      <p class="sr" id="results-sentence">
        {v.sentence}
      </p>
      <p class="rs-span t-meta">
        <time dateTime={v.since}>{day(v.since)}</time> to <time dateTime={v.until}>{day(v.until)}</time>
        {v.partial && (
          <>
            {' '}
            <Led tone="grey" word={'Partial: ' + v.unknown + ' without a record'} />
          </>
        )}
      </p>
      <div class="rs-tiles">
        <Tile
          label="Done"
          figure={v.work.done.toLocaleString()}
          help="A task is one thing that a person or a duty asked of an agent, such as a start of a duty or a message to an agent. The work of the manager and of the quick chat is no task. Its cost shows as coordination under Spend."
        >
          <p class="t-meta">
            {v.work.failed + v.work.stopped} failed or stopped, {v.work.open} open
            {(v.work.lost || 0) > 0 && <>, {v.work.lost} lost</>}
          </p>
        </Tile>
        <Tile
          label="Checked"
          figure={checkedOf(v.checks).toLocaleString()}
          unit={'of ' + v.work.done.toLocaleString()}
          help="A result is checked when a person gave it a thumb or a heart, when a receipt of another system accepted or rejected it, or when the done check of the agent passed. The grade of a model does not count."
        >
          <Verdicts checks={v.checks} />
          {toCheck.length > 0 && (
            <a class="rs-now" href={hrefOf({ place: 'activity', item: toCheck[0].key })}>
              <Led tone="amber" word={toCheck.length + ' to check'} />
            </a>
          )}
        </Tile>
        <Tile
          label="Spend"
          lead={v.spend.atLeast ? 'at least' : ''}
          figure={costText(v.spend.usd)}
          help="What the models of the agents cost in the window, for all the work, also the work that failed. Coordination is the manager and the quick chat. The spend says at least when some runs used a model without a price."
        >
          <p class="t-meta">
            <b class="rs-ink">{costText(v.spend.perDone)}</b> a done task
          </p>
          <p class="t-meta">
            {costText(v.spend.failedUSD)} on failed work, {costText(v.spend.coordinationUSD)} on coordination
          </p>
          {v.spend.unpriced > 0 && <Led tone="grey" word={v.spend.unpriced + (v.spend.unpriced === 1 ? ' run without a price' : ' runs without a price')} />}
        </Tile>
        <Tile label="Needed nobody" figure={v.people.noPerson.toLocaleString()} unit={'of ' + v.work.done.toLocaleString()}>
          <p class="t-meta">
            {v.people.actions.toLocaleString()} actions of people, {v.people.reworked} sent back with a message
          </p>
          {v.people.waitingNow > 0 && (
            <a class="rs-now" href="#activity">
              <Led tone="amber" word={v.people.waitingNow + ' waiting for you'} />
            </a>
          )}
        </Tile>
        <Tile
          label="Time to done"
          figure={measured ? span(v.lead.medianSeconds) : 'None yet'}
          unit={measured ? 'median' : ''}
          muted={!measured}
          help="From the ask to the first end of a done task. Half of the done tasks took this long or less. The bar adds up the time of all the done tasks and shows the part that waited for a person, so a few long waits weigh much. The time that a task waited for a worker is not in it."
        >
          {measured && (
            <>
              <Share share={v.lead.waitShare} />
              <p class="t-meta">
                {span(v.people.waitSeconds)} waiting on people, {pct(v.lead.waitShare)} of all the time to done
              </p>
            </>
          )}
        </Tile>
        <Tile
          label="Hours of a person"
          figure={v.estimated ? hours(v.estimated.minutes) : 'Not set'}
          unit={v.estimated ? 'est.' : ''}
          muted={!v.estimated}
          help="Nothing measures the time that people spend. The owner of an agent sets the minutes that a person takes for one task of a line, in Lines of work. The page multiplies them by the done tasks that nobody sent back."
        >
          {v.estimated && (
            <p class="t-meta">
              {v.estimated.pieces} tasks of {v.estimated.lines} {v.estimated.lines === 1 ? 'line' : 'lines'}, {v.work.done - v.estimated.pieces} without an estimate
            </p>
          )}
        </Tile>
      </div>
      <section class="rs-sec" aria-labelledby="rs-chart">
        <div class="rs-sec-head">
          <h2 class="t-sub" id="rs-chart">
            Done by {unit}
          </h2>
          <Legend />
        </div>
        <Chart periods={v.periods} unit={unit} />
      </section>
      <section class="rs-sec" aria-labelledby="rs-lines">
        <div class="rs-sec-head">
          <h2 class="t-sub" id="rs-lines">
            Lines of work
          </h2>
        </div>
        <Lines lines={v.lines} onSaved={onSaved} />
      </section>
    </div>
  );
}

function Tile(p: { label: string; figure: string; unit?: string; lead?: string; muted?: boolean; help?: string; children?: preact.ComponentChildren }) {
  return (
    <div class="rs-tile">
      <div class="rs-tile-head">
        <h2 class="t-caption">{p.label}</h2>
        {p.help && <Help label={'About ' + p.label}>{p.help}</Help>}
      </div>
      <p class={'rs-figure' + (p.muted ? ' muted' : '')}>
        {p.lead && <span class="rs-lead">{p.lead} </span>}
        {p.figure}
        {p.unit && <span class="rs-unit"> {p.unit}</span>}
      </p>
      {p.children}
    </div>
  );
}

/** The verdicts in the order of the bar: a person accepted, a machine check passed, a person sent back, nobody checked. */
const PARTS: [keyof ValueChecks, string][] = [
  ['accepted', 'accepted'],
  ['checked', 'checked'],
  ['sentBack', 'sent back'],
  ['unchecked', 'unchecked'],
];

/** checkedOf counts the done pieces that somebody or something checked: accepted, checked by a machine, or sent back. */
export function checkedOf(c: ValueChecks): number {
  return c.accepted + (c.checked || 0) + c.sentBack;
}

/** Verdicts is the bar of the done pieces by verdict, with the word and the count of each part. */
function Verdicts({ checks, compact }: { checks: ValueChecks; compact?: boolean }) {
  const n = (k: keyof ValueChecks) => checks[k] || 0;
  const total = PARTS.reduce((t, [k]) => t + n(k), 0);
  const parts = PARTS;
  const label = parts.map(([k, w]) => n(k) + ' ' + w).join(', ');
  return (
    <div class={'rs-verdicts' + (compact ? ' compact' : '')}>
      <div class="rs-bar" role="img" aria-label={label}>
        {total > 0 && parts.map(([k]) => (n(k) > 0 ? <span class={'rs-seg seg-' + k} style={{ flexGrow: n(k) }} /> : null))}
      </div>
      {!compact && (
        <ul class="rs-keys t-meta">
          {parts.map(([k, w]) => (
            <li>
              <span class={'rs-key seg-' + k} aria-hidden="true" />
              <b class="rs-ink">{n(k).toLocaleString()}</b> {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Share is a meter of the part of the time to done that waited for people. */
function Share({ share }: { share: number }) {
  const w = Math.max(0, Math.min(1, share));
  return (
    <div class="rs-bar" role="img" aria-label={pct(w) + ' waiting on people'}>
      {w > 0 && <span class="rs-seg seg-wait" style={{ flexGrow: w }} />}
      {w < 1 && <span class="rs-seg seg-work" style={{ flexGrow: 1 - w }} />}
    </div>
  );
}

function Legend() {
  return (
    <ul class="rs-keys t-meta" aria-hidden="true">
      <li>
        <span class="rs-key seg-accepted" /> accepted
      </li>
      <li>
        <span class="rs-key seg-checked" /> checked
      </li>
      <li>
        <span class="rs-key seg-sentBack" /> sent back
      </li>
      <li>
        <span class="rs-key seg-unchecked" /> unchecked
      </li>
    </ul>
  );
}

/** The geometry of the chart, in the units of its view box. */
const CH = { h: 180, top: 20, foot: 36, gap: 2 };

/** Chart draws one column per period: the done pieces stacked by verdict, the count on top, and the failed pieces under the date. */
function Chart({ periods, unit }: { periods: ValuePeriod[]; unit: 'day' | 'week' }) {
  const n = Math.max(1, periods.length);
  const words = periods.map((p) => periodWords(p, unit));
  const said = periods.map((p, i) => words[i].label + (words[i].short ? ', ' + words[i].short : '') + ': ' + p.done + ' done' + (p.failed ? ', ' + p.failed + ' failed' : '')).join('; ');
  const w = 100 * n;
  const max = Math.max(1, ...periods.map((p) => p.done));
  const plot = CH.h - CH.top - CH.foot;
  const base = CH.top + plot;
  const bw = 40;
  return (
    <div class="rs-chart">
      <svg viewBox={`0 0 ${w} ${CH.h}`} preserveAspectRatio="none" role="img" aria-label={'Done by ' + unit + '. ' + said}>
        <defs>
          <pattern id="rs-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect class="rs-hatch-ground" width="5" height="5" />
            <line class="rs-hatch-line" x1="1.5" y1="0" x2="1.5" y2="5" />
          </pattern>
        </defs>
        <line class="rs-grid" x1="0" x2={w} y1={base + 0.5} y2={base + 0.5} />
        <line class="rs-grid soft" x1="0" x2={w} y1={CH.top + 0.5} y2={CH.top + 0.5} />
        {periods.map((p, i) => {
          const x = i * 100 + (100 - bw) / 2;
          let y = base;
          const segs: [string, number][] = [
            ['accepted', p.accepted],
            ['checked', p.checked || 0],
            ['sentBack', p.sentBack],
            ['unchecked', p.unchecked],
          ];
          return (
            <g class="rs-col">
              <title>
                {day(p.start)} to {day(p.end)}: {p.done} done, {p.accepted} accepted, {p.checked || 0} checked, {p.sentBack} sent back, {p.unchecked} unchecked, {p.failed} failed, {costText(p.usd)}
              </title>
              <rect class="rs-hit" x={i * 100} y={0} width={100} height={CH.h} />
              {segs.map(([k, c]) => {
                if (c <= 0) return null;
                const hh = Math.max(1, (c / max) * plot);
                y -= hh;
                const r = <rect class={'seg-' + k} x={x} y={y + CH.gap / 2} width={bw} height={Math.max(1, hh - CH.gap / 2)} />;
                return r;
              })}
            </g>
          );
        })}
      </svg>
      <ol class="rs-axis t-meta" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
        {periods.map((p, i) => (
          <li title={day(p.start) + ' to ' + day(p.end)}>
            <b class="rs-ink">{p.done}</b>
            <span>{words[i].label}</span>
            {words[i].short && <span class="rs-short">{words[i].short}</span>}
            {p.failed > 0 && <span class="rs-failed">{p.failed} failed</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Lines({ lines, onSaved }: { lines: ValueLine[]; onSaved: () => void }) {
  const fleet = useSelect((s) => s.fleet);
  const own = useSelect((s) => s.agents);
  const agents = fleetAgents(fleet, own);
  const owner = (agent: string) => agents.some((a) => a.name === agent && a.role === 'owner');
  if (!lines.length) return <p class="t-meta">No work</p>;
  return (
    <div class="rs-table">
    <table class="rs-lines">
      <thead>
        <tr class="t-caption">
          <th scope="col">Line</th>
          <th scope="col" class="num">
            Done
          </th>
          <th scope="col">Checked</th>
          <th scope="col" class="num narrow-hide">
            Needed nobody
          </th>
          <th scope="col" class="num narrow-hide">
            Time to done
          </th>
          <th scope="col" class="num phone-hide">
            Spend
          </th>
          <th scope="col" class="num narrow-hide">
            Per task
          </th>
          <th scope="col" class="phone-hide">
            Minutes a task
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.key}>
            <th scope="row" class="rs-line">
              <span class="rs-line-name">
                <Face agent={l.agent} size={20} />
                {lineHref(l) ? (
                  <a class="clip" href={lineHref(l)} title={l.name}>
                    {l.name}
                  </a>
                ) : (
                  <span class="clip" title={l.name}>
                    {l.name}
                  </span>
                )}
              </span>
              <span class="t-meta">{KIND_WORD[l.kind]}</span>
            </th>
            <td class="num">
              <b>{l.work.done.toLocaleString()}</b>
              {l.work.failed + l.work.stopped > 0 && <span class="t-meta rs-failed"> {l.work.failed + l.work.stopped} failed</span>}
            </td>
            <td>
              <Verdicts checks={l.checks} compact />
              <span class="t-meta">
                {checkedOf(l.checks)} of {l.work.done}
              </span>
            </td>
            <td class="num narrow-hide">{l.work.done ? pct(l.noPerson / l.work.done) : ''}</td>
            <td class="num narrow-hide">{l.medianLeadSeconds ? span(l.medianLeadSeconds) : ''}</td>
            <td class="num phone-hide">
              {l.unpriced > 0 && <span class="t-meta rs-lead-line">at least</span>}
              {costText(l.usd)}
            </td>
            <td class="num narrow-hide">{l.work.done ? costText(l.perDone) : ''}</td>
            <td class="phone-hide">
              <Estimate line={l} owner={owner(l.agent)} onSaved={onSaved} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/** Estimate is the minutes that a person takes for one piece of a line, with who set it, and Set for the owner of the agent. */
function Estimate({ line, owner, onSaved }: { line: ValueLine; owner: boolean; onSaved: () => void }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const e = line.estimate;
  if (!edit) {
    return (
      <span class="rs-est">
        {e ? (
          <span title={'Set by ' + e.by + ' on ' + day(e.at)}>
            <b>{e.minutes} min</b> <span class="t-meta">by {personName(e.by)}</span>
          </span>
        ) : (
          <span class="t-meta">Not set</span>
        )}
        {owner && (
          <Button
            kind="quiet"
            size="s"
            onClick={() => {
              setText(e ? String(e.minutes) : '');
              setErr('');
              setEdit(true);
            }}
          >
            {e ? 'Change' : 'Set'}
          </Button>
        )}
      </span>
    );
  }
  const save = async (ev: Event) => {
    ev.preventDefault();
    const n = text.trim() === '' ? 0 : Number(text);
    if (!Number.isInteger(n) || n < 0 || n > 2400) {
      setErr('From 0 to 2400 minutes');
      return;
    }
    setBusy(true);
    try {
      await valueApi.estimate(line.key, n);
      setEdit(false);
      onSaved();
    } catch (x: unknown) {
      setErr(x instanceof ApiError || x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="rs-est-edit" onSubmit={save} noValidate>
      <Input
        type="number"
        min={0}
        max={2400}
        inputMode="numeric"
        aria-label={'Minutes a task of ' + line.name}
        value={text}
        invalid={!!err}
        onInput={(x) => setText((x.target as HTMLInputElement).value)}
        autoFocus
      />
      <Button type="submit" kind="primary" size="s" disabled={busy}>
        Save
      </Button>
      <Button kind="quiet" size="s" onClick={() => setEdit(false)}>
        Cancel
      </Button>
      {err && (
        <span class="field-error" role="alert">
          {err}
        </span>
      )}
    </form>
  );
}
