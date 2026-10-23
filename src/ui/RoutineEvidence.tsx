// The Evidence tab of a routine: what happened, never why. The rehearsal
// as bars per day of agreed, disagreed, and handed to the agent, with the
// three totals. Then the past tickets of the replay, how sure the routine
// was, where it disagreed and what happened afterward, what came back,
// and what the routine was made from.

import { useState } from 'preact/hooks';
import type { RoutineRecord } from '../api/routines';
import { barsOf, bandRows, countsOf, dayLabel, disagreedOf, num, pct0, questionKeys, questionShort, units, verificationWords } from '../lib/routines';
import { runHref } from './Profile';
import { Button, Chip, Help } from './primitives';

/** The disagreements that the tab shows before Show all. */
export const FIRST_DISAGREEMENTS = 5;

/** The rehearsal: one stacked bar per day, the axis, the legend with the totals, and a table for a screen reader. */
function Rehearsal({ rec }: { rec: RoutineRecord }) {
  const days = (rec.evidence && rec.evidence.days) || [];
  const { bars, max, axis } = barsOf(days);
  const t = countsOf(rec.evidence);
  if (bars.length === 0) return null;
  const h = (n: number) => (max > 0 ? (n / max) * 100 + '%' : '0');
  const parts: { key: 'agreed' | 'disagreed' | 'handed'; words: string }[] = [
    { key: 'agreed', words: 'agreed with the agent' },
    { key: 'disagreed', words: 'disagreed' },
    { key: 'handed', words: 'handed to the agent' },
  ];
  return (
    <section class="rt-sec" aria-labelledby="rt-rehearsal">
      <h2 class="t-sub rt-sec-head" id="rt-rehearsal">
        Rehearsal
      </h2>
      <div class="rt-chart-box" style={{ maxWidth: bars.length * 64 + 'px' }}>
        <div class={'rt-chart' + (bars.length > 24 ? ' rt-chart-dense' : '')} aria-hidden="true">
          {bars.map((b) => (
            <div class="rt-bar" title={`${dayLabel(b.day)}: ${num(b.agreed)} agreed, ${num(b.disagreed)} disagreed, ${num(b.handed)} handed to the agent`}>
              {b.handed > 0 && <span class="rt-fill rt-fill-grey" style={{ height: h(b.handed) }} />}
              {b.disagreed > 0 && <span class="rt-fill rt-fill-hatch" style={{ height: h(b.disagreed) }} />}
              {b.agreed > 0 && <span class="rt-fill rt-fill-ink" style={{ height: h(b.agreed) }} />}
            </div>
          ))}
        </div>
        <div class="rt-axis t-meta" aria-hidden="true">
          {axis.map((d) => (
            <span>{dayLabel(d)}</span>
          ))}
        </div>
      </div>
      <ul class="rt-legend">
        {parts.map((p) => (
          <li>
            <span class={'rt-swatch rt-fill-' + (p.key === 'agreed' ? 'ink' : p.key === 'disagreed' ? 'hatch' : 'grey')} aria-hidden="true" />
            <span>{p.words}</span>
            <b>{num(t[p.key])}</b>
          </li>
        ))}
      </ul>
      <table class="sr">
        <caption>Rehearsal per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">agreed with the agent</th>
            <th scope="col">disagreed</th>
            <th scope="col">handed to the agent</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr>
              <th scope="row">{dayLabel(b.day)}</th>
              <td>{b.agreed}</td>
              <td>{b.disagreed}</td>
              <td>{b.handed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * PastTickets is the replay over past runs: how many the routine handled
 * the same way. The workbench keeps no list of those runs yet, so the line
 * has no key to open them.
 */
function PastTickets({ rec }: { rec: RoutineRecord }) {
  const r = rec.evidence && rec.evidence.replay;
  if (!r || !r.total) return null;
  return (
    <section class="rt-sec" aria-labelledby="rt-past">
      <h2 class="t-sub rt-sec-head" id="rt-past">
        Past tickets
      </h2>
      <p>
        {num(r.matched)} of {r.total === 1 ? '1 past ticket' : num(r.total) + ' past tickets'}, handled the same way
      </p>
    </section>
  );
}

/** QuestionHead is the first sentence of a question, with the whole question in its tooltip when the sentence leaves part out. */
function QuestionHead({ short }: { short: { short: string; whole: string; cut: boolean } }) {
  return <span title={short.cut ? short.whole : undefined}>{short.short}</span>;
}

/** HowSure is the table of how sure the routine was, per question, and how often it was right at each level. */
function HowSure({ rec }: { rec: RoutineRecord }) {
  const qs = rec.routine.questions || {};
  const per = (rec.evidence && rec.evidence.questions) || {};
  const keys = questionKeys(qs).filter((k) => (per[k] || []).some((b) => b.runs > 0));
  if (keys.length === 0) return null;
  return (
    <section class="rt-sec" aria-labelledby="rt-sure">
      <h2 class="t-sub rt-sec-head" id="rt-sure">
        How sure it was
        <Help label="How it counts">Each answer of the routine comes with how sure it was. Each row counts the tickets at that level, and how often the agent chose the same answer.</Help>
      </h2>
      <table class="rt-table rt-sure">
        <thead>
          <tr>
            <th scope="col">It said</th>
            <th scope="col">Tickets</th>
            <th scope="col">It was right</th>
          </tr>
        </thead>
        {keys.map((k) => (
          <tbody>
            {keys.length > 1 && (
              <tr class="rt-qrow">
                <th scope="colgroup" colSpan={3}>
                  <QuestionHead short={questionShort(k, qs[k])} />
                </th>
              </tr>
            )}
            {bandRows(per[k], qs[k].act).map((b) => (
              <tr>
                <th scope="row" data-label="It said">
                  {b.words}
                </th>
                <td data-label="Tickets">{num(b.runs)}</td>
                <td data-label="It was right" class={b.handed ? 'muted' : undefined}>
                  {b.handed ? 'handed to the agent' : b.right ? b.right + ' of the time' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}

/** Disagreed is where the routine and the agent differed, newest first, with what happened afterward. */
function Disagreed({ rec }: { rec: RoutineRecord }) {
  const [all, setAll] = useState(false);
  const ev = rec.evidence;
  const list = (ev && ev.disagreements) || [];
  const total = Math.max(countsOf(ev).disagreed, list.length);
  if (list.length === 0) return null;
  const shown = all ? list : list.slice(0, FIRST_DISAGREEMENTS);
  return (
    <section class="rt-sec" aria-labelledby="rt-disagreed">
      <h2 class="t-sub rt-sec-head" id="rt-disagreed">
        Where it disagreed <Chip label={units(total)}>{num(total)}</Chip>
      </h2>
      <table class="rt-table rt-disagreed">
        <thead>
          <tr>
            <th scope="col">Ticket</th>
            <th scope="col">The routine said</th>
            <th scope="col">The agent chose</th>
            <th scope="col">Afterward</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => {
            const diff = disagreedOf(d);
            return (
              <tr>
                <th scope="row" data-label="Ticket">
                  <a href={runHref({ run: d.run })}>{d.input}</a>
                </th>
                <td data-label="The routine said">
                  {diff.map((a) => (
                    <span class="rt-said">
                      <code>{a.said}</code>
                      {typeof a.probability === 'number' && <span class="t-meta"> {pct0(a.probability)} sure</span>}
                    </span>
                  ))}
                </td>
                <td data-label="The agent chose">
                  {diff.map((a) => (
                    <span class="rt-said">{a.observed ? <code>{a.observed}</code> : <span class="t-meta">none</span>}</span>
                  ))}
                </td>
                <td data-label="Afterward" class="t-meta">
                  {verificationWords(d.verification)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length > FIRST_DISAGREEMENTS && (
        <div class="rt-keys">
          <Button kind="quiet" size="s" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : 'Show all'}
          </Button>
        </div>
      )}
    </section>
  );
}

/** SentBack counts the tickets that came back rejected: where the routine acted, and where it agreed with the agent. */
function SentBack({ rec }: { rec: RoutineRecord }) {
  const sb = (rec.evidence && rec.evidence.sentBack) || { applied: 0, agreed: 0 };
  const total = (sb.applied || 0) + (sb.agreed || 0);
  // A routine that never ran beside the agent has nothing that could come back.
  if (total === 0 && !(rec.evidence && rec.evidence.days.length)) return null;
  return (
    <section class="rt-sec" aria-labelledby="rt-sent">
      <h2 class="t-sub rt-sec-head" id="rt-sent">
        Sent back <Chip label={units(total) + ' sent back'}>{num(total)}</Chip>
      </h2>
      {total > 0 && (
        <dl class="rt-per">
          {sb.applied > 0 && (
            <div>
              <dt>where it acted</dt>
              <dd>{num(sb.applied)}</dd>
            </div>
          )}
          {sb.agreed > 0 && (
            <div>
              <dt>where it agreed with the agent</dt>
              <dd>{num(sb.agreed)}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

/** MadeFrom names the runs that the routine was made from, and who proposed it. */
function MadeFrom({ rec }: { rec: RoutineRecord }) {
  const s = rec.source;
  if (!s || !s.runs) return null;
  const by = s.proposedBy || '';
  return (
    <section class="rt-sec" aria-labelledby="rt-made">
      <h2 class="t-sub rt-sec-head" id="rt-made">
        Made from
      </h2>
      <p>
        {units(s.runs)} of {rec.agent}, {dayLabel(s.from)} to {dayLabel(s.to)}
      </p>
      {by && <p class="t-meta">Proposed by {/^fw\s/.test(by) ? <code>{by}</code> : by}</p>}
    </section>
  );
}

export function RoutineEvidence({ rec }: { rec: RoutineRecord }) {
  if (!rec.evidence) return <p class="t-meta">Loading the evidence.</p>;
  return (
    <>
      <Rehearsal rec={rec} />
      <PastTickets rec={rec} />
      <HowSure rec={rec} />
      <Disagreed rec={rec} />
      <SentBack rec={rec} />
      <MadeFrom rec={rec} />
    </>
  );
}
