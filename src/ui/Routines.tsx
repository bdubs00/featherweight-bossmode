// The Routines place. The list pane holds the routines of every agent in
// the order of attention: Needs you, Live, Rehearsing, Proposed, Paused,
// then Retired behind a toggle. The main pane holds one routine with the
// tabs Steps, Evidence, and Runbook. A routine that needs you opens on the
// card of its sign-off. The details pane holds the week of its agent.
// docs/DESIGN.md, section 11.9, names the screen, and docs/ROUTINES.md of
// the kernel holds the contract. A server without routines answers the
// list with off and its reason: the list says so once, with the reason
// behind its question mark, the main pane says what a routine is, and a
// routine or the week of an agent asks the server nothing, since those
// routes answer 404 while the routines are off.

import { useEffect, useLayoutEffect, useMemo, useState } from 'preact/hooks';
import type { RoutineRecord, RoutineSummary, Standing } from '../api/routines';
import { api } from '../api/routes';
import type { Page } from '../api/types';
import { go, hrefOf, type RoutineTab } from '../lib/route';
import { whoName } from '../lib/lines';
import { stripFrontMatter } from '../lib/markdown';
import {
  STATUS,
  actsWhen,
  answersOf,
  checkWords,
  dateWords,
  figuresOf,
  groupsOf,
  keyOf,
  matchesRoutine,
  metaOf,
  money,
  num,
  questionKeys,
  questionShort,
  resumeTo,
  runbookOf,
  runbookPath,
  statusOf,
  stepWords,
  titleOf,
  units,
} from '../lib/routines';
import { useSelect } from '../state/store';
import { loadRoutine, loadRoutines, loadWeek, move, routines, useRoutines, useRoutinesView } from '../state/routines';
import { useRoving } from './keys';
import { showError } from './notice';
import { ApiError } from '../api/client';
import { Confirm, Markdown, Menu, type MenuItem } from './common';
import { Glyph } from './icons';
import { Button, Card, Chip, Field, Find, Help, Input, Led, LineLed, Mark, PaneHeader, Tabs } from './primitives';
import { EmptyPane } from './Shell';
import { RoutineEvidence } from './RoutineEvidence';

/** The width from which two panes show side by side, as App names it. */
const TWO_PANES = '(min-width: 800px)';
/** The widths that hide the details pane. */
const COLLAPSED = '(max-width: 1199px)';
const NARROW = '(max-width: 799px)';

/** useMedia reports whether a media query matches, and follows its changes. */
function useMedia(query: string): boolean {
  const read = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [on, setOn] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const m = window.matchMedia(query);
    const f = () => setOn(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [query]);
  return on;
}

/** useAgentName is the name of an agent as its face names it. */
function useAgentName(agent: string): string {
  return useSelect((s) => (s.faces[agent] && s.faces[agent].displayName) || agent);
}

/** useOwner reports whether the person may change the standing of the routines of an agent: an owner of the agent. */
function useOwner(agent: string): boolean {
  return useSelect((s) => !!(s.me && s.me.roles && s.me.roles[agent] === 'owner'));
}

const routineHref = (r: RoutineRecord, tab?: RoutineTab) => hrefOf({ place: 'routines', agent: r.agent, name: r.routine.name, tab });

/* ---------- the list ---------- */

function RoutineRow({ r, on }: { r: RoutineRecord; on: boolean }) {
  const s = statusOf(r);
  const light = STATUS[s];
  return (
    <a class={'rt-row' + (on ? ' sel' : '') + (s === 'needs-you' ? ' need' : '')} href={routineHref(r)} data-item aria-current={on ? 'page' : undefined}>
      <span class="rt-row-top">
        <span class="rt-row-title">{titleOf(r.routine.name)}</span>
        <Led tone={light.tone} word={light.word} struck={light.struck} />
      </span>
      <span class="t-meta clip">{metaOf(r)}</span>
    </a>
  );
}

/** OFF_REASON is the reason of an older server, which says none. */
const OFF_REASON = 'An admin turns routines on in the setup of the server.';

/** OffWords say that the server keeps no routines, with its reason behind the question mark. */
function OffWords() {
  const reason = useRoutines((s) => s.reason);
  return (
    <>
      Routines are off.{' '}
      <Help label="Where routines are turned on">{reason || OFF_REASON}</Help>
    </>
  );
}

/** ROUTINE_IS says what a routine is, in the main pane while routines are off, so the list alone says that they are off. */
export const ROUTINE_IS = 'A routine does work that an agent repeats, in the same steps and without the model, once a person signs it off.';

/** RoutineList is the list pane: the routines in the order of attention, with Find a routine and the retired ones behind a toggle. */
export function RoutineList({ agent, name }: { agent?: string; name?: string }) {
  const order = useRoutines((s) => s.order);
  const byKey = useRoutines((s) => s.byKey);
  const error = useRoutines((s) => s.error);
  const off = useRoutines((s) => s.off);
  const [q, setQ] = useState('');
  const [retiredOpen, setRetiredOpen] = useState(false);
  const list = useRoving<HTMLDivElement>();
  useRoutinesView();
  useEffect(() => {
    loadRoutines().catch(() => {});
  }, []);
  const all = useMemo(() => (order || []).map((k) => byKey[k]).filter(Boolean), [order, byKey]);
  const current = agent && name ? keyOf(agent, name) : '';
  const words = q.trim();
  const groups = groupsOf(words ? all.filter((r) => matchesRoutine(r, words)) : all);
  const retired = groups.find((g) => g.status === 'retired');
  const count = all.filter((r) => r.standing !== 'retired').length;
  const live = all.filter((r) => r.standing === 'live').length;
  // A retired routine that the address names, or that a search finds, shows its group.
  const showRetired = retiredOpen || !!words || (!!retired && retired.items.some((r) => keyOf(r.agent, r.routine.name) === current));
  if (off) {
    return (
      <section class="screen rt-list" aria-labelledby="routines-title">
        <PaneHeader id="routines-title" title="Routines" />
        <div class="scroll">
          <div class="empty">
            <p>
              <OffWords />
            </p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section class="screen rt-list" aria-labelledby="routines-title">
      <PaneHeader id="routines-title" title="Routines" count={order ? count : undefined} countLabel={count === 1 ? '1 routine' : count + ' routines'}>
        {order && live > 0 && (
          <Chip label={live === 1 ? '1 routine live' : live + ' routines live'}>
            <Led tone="green" word={live + ' live'} />
          </Chip>
        )}
      </PaneHeader>
      <div class="list-find">
        <Find label="Find a routine" value={q} onInput={setQ} />
      </div>
      <div class="scroll" ref={list}>
        {groups
          .filter((g) => g.status !== 'retired')
          .map((g) => (
            <div class="rt-group" role="group" aria-labelledby={'rg-' + g.status}>
              <h3 class="rt-group-head" id={'rg-' + g.status}>
                <span>{g.title}</span>
                <Chip tone={g.status === 'needs-you' ? 'amber' : 'plain'}>{g.items.length}</Chip>
              </h3>
              <div role="list" class="rt-rows">
                {g.items.map((r) => (
                  <div role="listitem">
                    <RoutineRow r={r} on={keyOf(r.agent, r.routine.name) === current} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        {retired && (
          <>
            <button type="button" class="rt-toggle" aria-expanded={showRetired} onClick={() => setRetiredOpen(!showRetired)}>
              <Glyph name="back" size={14} class={showRetired ? 'rt-turn-down' : 'rt-turn-right'} />
              <span>Retired</span>
              <Chip>{retired.items.length}</Chip>
            </button>
            {showRetired && (
              <div role="list" class="rt-rows">
                {retired.items.map((r) => (
                  <div role="listitem">
                    <RoutineRow r={r} on={keyOf(r.agent, r.routine.name) === current} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {!order && !error && <p class="empty">Loading the routines.</p>}
        {error && !order && (
          <p class="empty" role="alert">
            {error}
          </p>
        )}
        {order && all.length === 0 && <p class="empty">No routine yet.</p>}
        {order && words && groups.length === 0 && <p class="empty">No routine holds those words.</p>}
      </div>
    </section>
  );
}

/* ---------- the main pane ---------- */

/**
 * RoutineMain is the main pane. With a routine in the address, it shows
 * the routine. Without one, where two panes show, it opens the first
 * routine of the list, so the pane is never empty.
 */
export function RoutineMain({ agent, name, tab }: { agent?: string; name?: string; tab: RoutineTab }) {
  if (agent && name) return <RoutineView agent={agent} name={name} tab={tab} />;
  return <RoutineHome />;
}

function RoutineHome() {
  const order = useRoutines((s) => s.order);
  const byKey = useRoutines((s) => s.byKey);
  const error = useRoutines((s) => s.error);
  const off = useRoutines((s) => s.off);
  const first = useMemo(() => {
    const g = groupsOf((order || []).map((k) => byKey[k]).filter((r) => r && r.standing !== 'retired'));
    return g.length ? g[0].items[0] : undefined;
  }, [order, byKey]);
  const href = first ? routineHref(first) : '';
  useEffect(() => {
    if (href && typeof window.matchMedia === 'function' && window.matchMedia(TWO_PANES).matches) go(href, true);
  }, [href]);
  return (
    <EmptyPane back={{ href: '#routines', label: 'Routines' }}>
      <p>{off ? ROUTINE_IS : error && !order ? error : !order ? 'Loading the routines.' : order.length === 0 ? 'No routine yet.' : 'Pick a routine.'}</p>
    </EmptyPane>
  );
}

/** The room of the header of a routine: cramped puts the tabs and the status in a strip, and tight sets the title in the heading role. */
interface Room {
  cramped: boolean;
  tight: boolean;
}

/**
 * useRoom measures the header of a routine. When the header lacks the room
 * for the title, the status, the tabs, and More on one line, the tabs and
 * the status take a strip under it, so the title keeps its room. When the
 * title still lacks the room beside Back and More, it takes the heading
 * role, so a title of a few words shows whole. A hidden copy of the title
 * gives its width at the title size, so the measure holds in either role.
 */
function useRoom(box: HTMLElement | null, deps: unknown[]): Room {
  const [room, setRoom] = useState<Room>({ cramped: false, tight: false });
  useLayoutEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const head = box.querySelector('.pane-head') as HTMLElement | null;
      if (!head) return;
      const width = (sel: string) => {
        const el = box.querySelector(sel) as HTMLElement | null;
        return el ? el.offsetWidth : 0;
      };
      const cs = getComputedStyle(head);
      const gap = parseFloat(cs.columnGap) || 12;
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const back = width('.pane-head .back');
      const more = width('.rt-more');
      const title = width('.rt-measure');
      const fixed = pad + (back ? back + gap : 0) + (more ? more + gap : 0);
      const cramped = head.clientWidth < fixed + title + gap + width('.rt-status') + gap + width('.rt-tabs .tabs');
      const tight = head.clientWidth < fixed + title;
      setRoom((r) => (r.cramped === cramped && r.tight === tight ? r : { cramped, tight }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [box, ...deps]);
  return room;
}

function RoutineView({ agent, name, tab }: { agent: string; name: string; tab: RoutineTab }) {
  const key = keyOf(agent, name);
  const rec = useRoutines((s) => s.byKey[key]);
  const gone = useRoutines((s) => !!s.gone[key]);
  const off = useRoutines((s) => s.off);
  const owner = useOwner(agent);
  const agentName = useAgentName(agent);
  const [failed, setFailed] = useState('');
  const [retire, setRetire] = useState(false);
  // Not yet puts the card of a sign-off away for this visit of the routine. It sends nothing.
  const [later, setLater] = useState(false);
  // True after a move met a newer version of the routine: the page read it again.
  const [changed, setChanged] = useState(false);
  useRoutinesView();
  const [busy, setBusy] = useState(false);
  const narrow = useMedia(NARROW);
  const collapsed = useMedia(COLLAPSED);
  const [box, setBox] = useState<HTMLElement | null>(null);
  const title = titleOf(name);
  const status = rec ? statusOf(rec) : null;
  const room = useRoom(box, [title, status, collapsed]);
  const strip = narrow || room.cramped;
  useEffect(() => {
    setFailed('');
    setLater(false);
    setChanged(false);
    if (routines.get().off) return;
    loadRoutine(agent, name).catch((e) => setFailed(e instanceof Error ? e.message : 'The action failed. Try it again.'));
  }, [key]);
  const back = { href: '#routines', label: 'Routines', to: 'list' as const };
  if (!rec) {
    return (
      <section class="screen routine" aria-labelledby="routine-title">
        <PaneHeader id="routine-title" title={title} size="title" level={1} back={back} />
        <div class="empty center">
          <p>{off ? narrow ? <OffWords /> : 'This routine does not show while routines are off.' : gone ? 'This routine is not here. It was removed, or you cannot see it.' : failed || 'Loading the routine.'}</p>
        </div>
      </section>
    );
  }
  const light = STATUS[status!];
  /**
   * shift moves the version of the routine that the person reads. A 409
   * means that the routine changed in the meantime: the store read it
   * again, and the pane shows it with a quiet line instead of a notice.
   */
  const shift = async (standing: Standing, note?: string): Promise<boolean> => {
    setBusy(true);
    setChanged(false);
    let ok = false;
    try {
      await move(agent, name, standing, rec.routine.version, note);
      ok = true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setChanged(true);
      else showError(e);
    }
    setBusy(false);
    return ok;
  };
  const items: MenuItem[] = [];
  // A window that hides the details pane reaches the week of the agent here.
  if (collapsed) items.push({ label: agentName, onSelect: () => go(hrefOf({ place: 'routines', agent, name, details: true })) });
  if (owner && (rec.standing === 'rehearsing' || rec.standing === 'live')) items.push({ label: 'Pause', onSelect: () => shift('paused') });
  if (owner && rec.standing === 'paused') items.push({ label: 'Resume', onSelect: () => shift(resumeTo(rec)) });
  // The moves of docs/ROUTINES.md, section 4.1: a paused routine resumes before it can retire.
  if (owner && (rec.standing === 'rehearsing' || rec.standing === 'live')) items.push({ label: 'Retire', danger: true, onSelect: () => setRetire(true) });
  const statusEl = <Led tone={light.tone} word={light.word} struck={light.struck} class="rt-status" />;
  const tabs = (
    <span class="rt-tabs">
      <Tabs
        label={title}
        current={tab}
        items={[
          { id: 'steps', label: 'Steps', href: routineHref(rec) },
          { id: 'evidence', label: 'Evidence', href: routineHref(rec, 'evidence') },
          { id: 'runbook', label: 'Runbook', href: routineHref(rec, 'runbook') },
        ]}
      />
    </span>
  );
  return (
    <section class={'screen routine' + (room.tight ? ' rt-tight' : '')} ref={setBox} aria-labelledby="routine-title">
      <span class="t-title rt-measure" aria-hidden="true">
        {title}
      </span>
      <PaneHeader
        id="routine-title"
        title={<span title={title}>{title}</span>}
        size="title"
        level={1}
        back={back}
        actions={
          <>
            {!strip && tabs}
            {items.length > 0 && <Menu label="More" kind="secondary" class="rt-more" items={items} />}
          </>
        }
      >
        {!strip && statusEl}
      </PaneHeader>
      {strip && (
        <div class="rt-strip">
          {tabs}
          {statusEl}
        </div>
      )}
      <div class="scroll pad rt-body">
        {changed && (
          <p class="rt-changed" role="status">
            <LineLed tone="grey" />
            This routine changed. Read it again.
          </p>
        )}
        {tab === 'steps' && <StepsTab rec={rec} owner={owner} busy={busy} shift={shift} onRetire={() => setRetire(true)} later={later} onLater={() => setLater(true)} />}
        {tab === 'evidence' && <RoutineEvidence rec={rec} />}
        {tab === 'runbook' && <RunbookTab rec={rec} />}
      </div>
      {retire && (
        <Confirm
          title={'Retire ' + title + '?'}
          confirm="Retire"
          danger
          busy={busy}
          onCancel={() => setRetire(false)}
          onConfirm={async () => {
            await shift('retired');
            setRetire(false);
          }}
        >
          <p>A retired routine stays retired.</p>
        </Confirm>
      )}
    </section>
  );
}

/* ---------- Steps ---------- */

/** ByLine says who moved a routine and when, such as By you, today. */
function ByLine({ by, at, note }: { by: string; at: string; note?: string }) {
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  const who = whoName(by, me);
  const when = dateWords(at);
  const d = new Date(at);
  return (
    <>
      <p class="t-meta">
        <time dateTime={at} title={isNaN(d.getTime()) ? undefined : d.toLocaleString()}>
          By {who === 'You' ? 'you' : who}
          {when ? ', ' + when : ''}.
        </time>
      </p>
      {note && <p class="rt-note">{note}</p>}
    </>
  );
}

/** The props of the card on top of the Steps tab. */
interface CardProps {
  rec: RoutineRecord;
  owner: boolean;
  busy: boolean;
  shift: (s: Standing, note?: string) => Promise<boolean>;
  onRetire: () => void;
  /** True after Not yet, for this visit of the routine. */
  later: boolean;
  onLater: () => void;
}

/**
 * SignOff is the card of a routine that needs you: three figures, the note,
 * and the keys Not yet and Sign off. Not yet sends nothing: the routine
 * keeps rehearsing and keeps needing you, and the card goes away for this
 * visit.
 */
function SignOff({ rec, owner, busy, shift, onLater }: Pick<CardProps, 'rec' | 'owner' | 'busy' | 'shift' | 'onLater'>) {
  const [note, setNote] = useState('');
  const f = figuresOf(rec);
  const signOff = async () => {
    if (await shift('live', note.trim() || undefined)) setNote('');
  };
  const title = owner ? 'Needs your sign-off' : 'Needs a sign-off';
  return (
    <Card
      class="rt-card"
      title={title}
      tone="amber"
      label={title}
      actions={
        owner ? (
          <>
            <Button disabled={busy} onClick={onLater}>
              Not yet
            </Button>
            <Button kind="primary" disabled={busy} onClick={signOff}>
              Sign off
            </Button>
          </>
        ) : undefined
      }
    >
      {f && (
        <dl class="rt-figs">
          <div>
            <dt>agreed with the agent</dt>
            <dd class="t-heading">{f.agreed}</dd>
          </div>
          <div>
            <dt>handed to the agent</dt>
            <dd class="t-heading">{num(f.handed)}</dd>
          </div>
          <div>
            <dt>sent back</dt>
            <dd class="t-heading">{num(f.sentBack)}</dd>
          </div>
        </dl>
      )}
      {owner && (
        <Field label="Note">
          <Input value={note} maxLength={1024} placeholder="Optional" onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
        </Field>
      )}
    </Card>
  );
}

function TopCard({ rec, owner, busy, shift, onRetire, later, onLater }: CardProps) {
  const s = statusOf(rec);
  if (s === 'needs-you' && later) return <Card class="rt-card" title="Kept for later" tone="grey" quiet label="Kept for later" />;
  if (s === 'needs-you') return <SignOff rec={rec} owner={owner} busy={busy} shift={shift} onLater={onLater} />;
  if (s === 'proposed') {
    const title = rec.source && rec.source.runs ? 'Proposed from ' + units(rec.source.runs) : 'Proposed';
    return (
      <Card
        class="rt-card"
        title={title}
        tone="grey"
        label={title}
        actions={
          owner ? (
            <>
              <Button kind="danger" disabled={busy} onClick={onRetire}>
                Retire
              </Button>
              <Button kind="primary" disabled={busy} onClick={() => shift('rehearsing')}>
                Rehearse
              </Button>
            </>
          ) : undefined
        }
      />
    );
  }
  if ((s === 'live' || s === 'paused') && rec.signedOff) {
    const m = [...(rec.history || [])].reverse().find((x) => x.standing === 'live');
    return (
      <Card class="rt-card" title="Signed off" tone="green" quiet label="Signed off">
        <ByLine by={rec.signedOff.by} at={rec.signedOff.at} note={m ? m.note : undefined} />
      </Card>
    );
  }
  return null;
}

function StepsTab(p: CardProps) {
  const { rec } = p;
  const qs = rec.routine.questions || {};
  const keys = questionKeys(qs);
  const after = rec.routine.after || [];
  return (
    <>
      <TopCard {...p} />
      <section class="rt-sec" aria-labelledby="rt-steps">
        <h2 class="t-sub rt-sec-head" id="rt-steps">
          Steps
        </h2>
        <ol class="rt-steps">
          {(rec.routine.steps || []).map((s, i) => {
            const w = stepWords(s, keys);
            return (
              <li>
                <span class="rt-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span class="rt-words">
                  {w.words}
                  {w.uses.map((u) => (
                    <>
                      {' '}
                      <code>{u}</code>
                    </>
                  ))}
                </span>
                <span class="t-code rt-tool">{s.tool}</span>
              </li>
            );
          })}
        </ol>
      </section>
      {keys.length > 0 && (
        <section class="rt-sec" aria-labelledby="rt-decides">
          <h2 class="t-sub rt-sec-head" id="rt-decides">
            What it decides
            <Help label="When it is not sure">When an answer is under its mark, the agent handles the ticket, with the answers of the routine in hand.</Help>
          </h2>
          <table class="rt-table rt-decides">
            <thead>
              <tr>
                <th scope="col">Question</th>
                <th scope="col">Answers</th>
                <th scope="col">Acts when</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const q = qs[k];
                const crit = q.criteria && !Array.isArray(q.criteria) ? (q.criteria as Record<string, string>) : null;
                const words = questionShort(k, q);
                return (
                  <tr>
                    <th scope="row" data-label="Question">
                      <span class="rt-question" title={words.cut ? words.whole : undefined}>
                        {words.short}
                      </span>
                      {words.cut && <Help label="The whole question">{words.whole}</Help>}
                    </th>
                    <td data-label="Answers">
                      <span class="rt-answers">
                        {answersOf(q).map((a) => (
                          <code title={crit && crit[a] ? crit[a] : undefined}>{a}</code>
                        ))}
                      </span>
                    </td>
                    <td data-label="Acts when">{actsWhen(q)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {after.length > 0 && (
        <section class="rt-sec" aria-labelledby="rt-after">
          <h2 class="t-sub rt-sec-head" id="rt-after">
            Afterward
          </h2>
          <ol class="rt-steps rt-checks">
            {after.map((c) => {
              const w = checkWords(c);
              return (
                <li>
                  <span class="rt-num" aria-hidden="true">
                    <Glyph name="check" size={14} />
                  </span>
                  <span class="rt-words">
                    {w.words}
                    {w.holds.length > 0 && ' holds'}
                    {w.holds.map((x) => (
                      <>
                        {' '}
                        <code>{x}</code>
                      </>
                    ))}
                    {w.lacks.length > 0 && (w.holds.length ? ' and not' : ' lacks')}
                    {w.lacks.map((x) => (
                      <>
                        {' '}
                        <code>{x}</code>
                      </>
                    ))}
                  </span>
                  <span class="t-code rt-tool">{c.tool}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </>
  );
}

/* ---------- Runbook ---------- */

/**
 * RunbookTab shows the page of the wiki that the front writes on a
 * sign-off. Before a sign-off, the page renders the routine in the same
 * way, under the line Not yet signed off.
 */
function RunbookTab({ rec }: { rec: RoutineRecord }) {
  const signed = !!rec.signedOff;
  const path = runbookPath(rec.agent, rec.routine.name);
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  useEffect(() => {
    if (!signed) return;
    let live = true;
    setPage(undefined);
    api
      .page(path)
      .then((p) => live && setPage(p))
      .catch(() => live && setPage(null));
    return () => {
      live = false;
    };
  }, [path, signed, rec.updatedAt]);
  if (signed && page === undefined) return <p class="t-meta">Loading the runbook.</p>;
  const text = signed && page ? stripFrontMatter(page.text || '').body : runbookOf(rec);
  return (
    <article class="rt-runbook" aria-label={'Runbook of ' + titleOf(rec.routine.name)}>
      {!signed && <p class="t-meta rt-unsigned">{rec.standing === 'retired' ? 'Not signed off' : 'Not yet signed off'}</p>}
      <Markdown text={text} base={path} class="article" />
      {signed && page && (
        <div class="rt-keys">
          <Button kind="quiet" size="s" href={hrefOf({ place: 'pages', path, mode: 'read' })}>
            Open in wiki
          </Button>
        </div>
      )}
    </article>
  );
}

/* ---------- the details pane ---------- */

/** RoutineAgent is the details pane: the agent of the routine and its week. It never repeats a figure of the routine. */
export function RoutineAgent({ agent, name }: { agent: string; name: string }) {
  const face = useSelect((s) => s.faces[agent]);
  const week = useRoutines((s) => s.weeks[agent]);
  const [failed, setFailed] = useState('');
  useRoutinesView();
  useEffect(() => {
    setFailed('');
    if (routines.get().off) return;
    loadWeek(agent).catch((e) => setFailed(e instanceof Error ? e.message : 'The action failed. Try it again.'));
  }, [agent]);
  const display = (face && face.displayName) || agent;
  const tagline = face ? face.tagline : '';
  return (
    <section class="screen rt-agent" aria-labelledby="rt-agent-title">
      <PaneHeader
        id="rt-agent-title"
        title={display}
        back={{ href: hrefOf({ place: 'routines', agent, name }), label: titleOf(name), to: 'main' }}
        actions={
          <Button size="s" href={hrefOf({ place: 'fleet', agent, profile: true })}>
            Profile
          </Button>
        }
      >
        <Chip>agent</Chip>
      </PaneHeader>
      <div class="scroll">
        <div class="rt-ident">
          <Mark agent={agent} size={72} />
          {tagline && <p class="t-meta">{tagline}</p>}
        </div>
        {week === undefined && !failed && <p class="rt-dsec t-meta">Loading the week.</p>}
        {failed && week === undefined && <p class="rt-dsec t-meta">{failed}</p>}
        {week && <Week w={week} />}
      </div>
    </section>
  );
}

/** Week is This week, Per ticket, and Sent back of an agent. */
function Week({ w }: { w: RoutineSummary }) {
  const parts = [
    { key: 'ink', words: 'by routines', n: w.byRoutine || 0 },
    { key: 'grey', words: 'by the agent', n: w.byAgent || 0 },
    { key: 'hatch', words: 'with a person', n: w.withPerson || 0 },
  ];
  const sum = parts.reduce((n, p) => n + p.n, 0);
  // The summary gives the average cost of one run of each kind.
  const perRoutine = w.byRoutine > 0 && w.costUSD ? w.costUSD.routine : null;
  const perAgent = w.byAgent > 0 && w.costUSD ? w.costUSD.agent : null;
  return (
    <>
      <section class="rt-dsec" aria-labelledby="rt-week">
        <h3 class="t-sub rt-sec-head" id="rt-week">
          This week <Chip label={units(w.runs || 0)}>{num(w.runs || 0)}</Chip>
        </h3>
        {sum > 0 && (
          <>
            <div class="rt-share" role="img" aria-label={parts.map((p) => num(p.n) + ' ' + p.words).join(', ')}>
              {parts.map((p) => (p.n > 0 ? <span class={'rt-fill rt-fill-' + p.key} style={{ width: (p.n / sum) * 100 + '%' }} /> : null))}
            </div>
            <ul class="rt-legend rt-legend-col">
              {parts.map((p) => (
                <li>
                  <span class={'rt-swatch rt-fill-' + p.key} aria-hidden="true" />
                  <span>{p.words}</span>
                  <b>{num(p.n)}</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {(perRoutine !== null || perAgent !== null) && (
        <section class="rt-dsec" aria-labelledby="rt-per">
          <h3 class="t-sub rt-sec-head" id="rt-per">
            Per ticket
          </h3>
          <dl class="rt-per">
            {perRoutine !== null && (
              <div>
                <dt>by a routine</dt>
                <dd>{money(perRoutine)}</dd>
              </div>
            )}
            {perAgent !== null && (
              <div>
                <dt>by the agent</dt>
                <dd>{money(perAgent)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
      <section class="rt-dsec" aria-labelledby="rt-back">
        <h3 class="t-sub rt-sec-head" id="rt-back">
          Sent back <Chip label={units(w.sentBack || 0) + ' sent back'}>{num(w.sentBack || 0)}</Chip>
        </h3>
      </section>
    </>
  );
}
