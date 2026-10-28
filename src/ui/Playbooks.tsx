// The playbooks on the page. Save as playbook is a dialog of a bridge that
// saves its goal, placement, seats, caps, and what the manager can do under
// a name. The choice of a playbook serves New bridge and the action open of
// a duty. The tab Playbooks of Duties, at #playbooks, lists them, and the
// page of a playbook, at #playbooks/<name>, shows its goal, its seats, how
// its bridge runs, and the duties that open it, with Make a duty, Rename,
// and Delete. docs/CONTRACT.md, section 16, names the routes. The person
// names a playbook in words, and the page makes its short name and shows
// it. The notice of a saved playbook links to its page.

import { useEffect, useRef, useState } from 'preact/hooks';
import { api, type PlaybookBody } from '../api/routes';
import { ApiError } from '../api/client';
import type { Caps, Delegation, Duty, Playbook } from '../api/types';
import { keepsWords, playbookBodyOf, playbookLabel, playbookName, playbookReason } from '../lib/playbooks';
import { dutyTitle, firstLine, listWords, slugOf, splitProblem } from '../lib/duties';
import { go, hrefOf } from '../lib/route';
import { membersOf } from '../state/reducer';
import { useSelect } from '../state/store';
import { loadDuties, saveDuty, useDuties } from '../state/duties';
import { loadPlaybooks, readPlaybook, removePlaybook, savePlaybook, seatsOf, usePlaybooks } from '../state/playbooks';
import { useRoving } from './keys';
import { attempt, showError, showSaid } from './notice';
import { Confirm, Menu } from './common';
import { EmptyPane } from './Shell';
import { Button, Chip, Field, Find, Input, Mark, PaneHeader, Tabs } from './primitives';

/** problemsOfError reads the problems of a 400 of the front, each in words, or the sentence of the error. */
export function problemsOfError(e: unknown): string[] {
  const ps = e instanceof ApiError && e.problem && Array.isArray(e.problem.problems) ? (e.problem.problems as unknown[]) : [];
  const words = ps.map((p) => splitProblem(p).text).filter(Boolean);
  if (words.length) return words;
  return [e instanceof Error && e.message ? e.message : 'The action failed. Try it again.'];
}

/**
 * SavePlaybook is the dialog of Save as playbook, from a bridge. The name
 * starts from the title of the bridge, in words, and the page makes the
 * short name that the server keeps. A name that a playbook holds already
 * replaces it, with the revision that the list read, so a change in the
 * meantime answers 409. confirm names the key, such as Save and make a
 * duty, and onSaved gets the short name.
 */
export function SavePlaybook({ bridge, confirm = 'Save playbook', onClose, onSaved }: { bridge: string; confirm?: string; onClose: () => void; onSaved?: (name: string) => void }) {
  const b = useSelect((s) => s.bridges.byId[bridge]);
  const roster = useSelect((s) => s.rosters[bridge]);
  const list = usePlaybooks((s) => s.list);
  // The name starts as the short name of the title of the bridge, and the page shows a playbook by its name as it is.
  const [words, setWords] = useState(() => playbookName(b ? b.title : ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    loadPlaybooks().catch(() => {});
  }, []);
  const name = slugOf(words);
  const members = membersOf(roster).filter((m) => m && !m.fired);
  const old = (list || []).find((p) => p.name === name);
  const save = async () => {
    const why = words.trim() && !name ? 'A name needs at least one letter from a to z, or a digit.' : playbookReason(name);
    if (why) {
      setError(why);
      return;
    }
    if (!b || members.length === 0) {
      setError('This team has no seat to save.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = playbookBodyOf(b, members);
      await savePlaybook(name, old && typeof old.revision === 'number' ? { ...body, revision: old.revision } : body);
      setBusy(false);
      showSaid('Saved the playbook ' + name + '.', { label: 'See the playbook', href: bookHref(name) });
      onClose();
      if (onSaved) onSaved(name);
      return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError('This playbook changed since you opened it. Try again.');
      else setError(problemsOfError(e).join(' '));
    }
    setBusy(false);
  };
  return (
    <Confirm title="Save as playbook" confirm={confirm} busy={busy} onCancel={onClose} onConfirm={save}>
      <Field label="Name" error={error}>
        <Input
          value={words}
          maxLength={80}
          invalid={!!error}
          placeholder="weekly-patching"
          aria-describedby={name && name !== words.trim() && !error ? 'playbook-slug' : undefined}
          onInput={(e) => {
            setWords((e.target as HTMLInputElement).value);
            setError('');
          }}
        />
        {name && name !== words.trim() && !error && (
          <span class="t-meta duty-slug" id="playbook-slug">
            It saves as {name}.
          </span>
        )}
      </Field>
      <p>{keepsWords(members.length)}</p>
      {old && <p>A playbook of this name exists. Saving replaces it.</p>}
    </Confirm>
  );
}

/**
 * PlaybookPick is the choice of a playbook. It reads the list once. A
 * playbook that the value names and the list lacks stays as a choice, so
 * an edit keeps it. A front without playbooks says so.
 */
export function PlaybookPick({ value, onChange, label = 'Playbook', error, empty }: { value: string; onChange: (name: string) => void; label?: string; error?: string; empty?: string }) {
  const list = usePlaybooks((s) => s.list);
  const off = usePlaybooks((s) => s.off);
  const failed = usePlaybooks((s) => s.error);
  useEffect(() => {
    loadPlaybooks().catch(() => {});
  }, []);
  if (off) return <p class="t-meta">This workbench keeps no playbooks.</p>;
  const names = (list || []).map((p) => p.name);
  return (
    <>
      <Field label={label} error={error || failed || undefined}>
        <select class="recess" value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
          <option value="">{!list ? 'Loading the playbooks' : list.length ? empty || 'Pick a playbook' : 'No playbook yet'}</option>
          {(list || []).map((p) => (
            <option value={p.name}>{playbookLabel(p)}</option>
          ))}
          {value && list && !names.includes(value) && <option value={value}>{value + ', not here'}</option>}
        </select>
      </Field>
      {list && list.length === 0 && <p class="t-meta">Save one from a team: open More, then Save as playbook.</p>}
    </>
  );
}

/** PlaybookShelf leads from the choice of a playbook to the tab Playbooks of Duties, where each playbook has its page with Rename and Delete. */
export function PlaybookShelf() {
  const list = usePlaybooks((s) => s.list);
  if (!list || list.length === 0) return null;
  return (
    <p class="duty-books">
      <a href={hrefOf({ place: 'duties', tab: 'playbooks' })}>See the playbooks</a>
    </p>
  );
}

/* ---------- the tab Playbooks of Duties ---------- */

/** DutyTabs switch the list of the Duties place between its duties and its playbooks. */
export function DutyTabs({ current }: { current: 'duties' | 'playbooks' }) {
  return (
    <div class="duty-tabs">
      <Tabs
        label="Duties and playbooks"
        current={current}
        items={[
          { id: 'duties', label: 'Duties', href: hrefOf({ place: 'duties' }) },
          { id: 'playbooks', label: 'Playbooks', href: hrefOf({ place: 'duties', tab: 'playbooks' }) },
        ]}
      />
    </div>
  );
}

const bookHref = (name: string) => hrefOf({ place: 'duties', tab: 'playbooks', playbook: name });

/** usersOf names the duties that open a bridge from a playbook, among the duties that the page lists. */
const usersOf = (duties: Duty[] | null, name: string): Duty[] => (duties || []).filter((d) => !!(d.do && d.do.open && d.do.open.playbook === name));

/** matchesBook reports whether a playbook holds the words of a search, in its name or its goal. */
const matchesBook = (p: Playbook, q: string) => [p.name, p.goal || ''].some((x) => x.toLowerCase().includes(q.toLowerCase()));

/** PlaybookList is the list pane of the tab Playbooks: each playbook with the first line of its goal and its seats. */
export function PlaybookList({ current }: { current?: string }) {
  const list = usePlaybooks((s) => s.list);
  const off = usePlaybooks((s) => s.off);
  const error = usePlaybooks((s) => s.error);
  const [q, setQ] = useState('');
  const rows = useRoving<HTMLDivElement>();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    loadPlaybooks().catch(() => {});
  }, []);
  const words = q.trim();
  const shown = (list || []).filter((p) => !words || matchesBook(p, words));
  const count = list ? list.length : 0;
  return (
    <section class="screen duty-list book-list" aria-labelledby="books-title">
      <PaneHeader id="books-title" title="Playbooks" headingRef={heading} focusable count={list && !off ? count : undefined} countLabel={count === 1 ? '1 playbook' : count + ' playbooks'} />
      <DutyTabs current="playbooks" />
      {count > 0 && (
        <div class="list-find">
          <Find label="Find a playbook" value={q} onInput={setQ} />
        </div>
      )}
      <div class="scroll" ref={rows}>
        <div role="list" class="duty-rows">
          {shown.map((p) => {
            const seats = seatsOf(p);
            const on = p.name === current;
            const goal = firstLine(p.goal || '');
            return (
              <div role="listitem">
                <a class={'duty-row' + (on ? ' sel' : '')} href={bookHref(p.name)} data-item aria-current={on ? 'page' : undefined}>
                  {seats[0] ? <Mark agent={seats[0].agent} size={32} selected={on} /> : <span class="mark s32 mark-empty" aria-hidden="true" />}
                  <span class="duty-row-main">
                    <span class="duty-row-top">
                      <span class="duty-row-title">{p.name}</span>
                    </span>
                    {goal && <span class="duty-row-when">{goal}</span>}
                    <span class="duty-row-meta">
                      <span>{seats.length === 1 ? '1 seat' : seats.length + ' seats'}</span>
                    </span>
                  </span>
                </a>
              </div>
            );
          })}
        </div>
        {!list && !error && <p class="empty">Loading the playbooks.</p>}
        {error && !list && (
          <p class="empty" role="alert">
            {error}
          </p>
        )}
        {off && <p class="empty">This workbench keeps no playbooks.</p>}
        {list && !off && count === 0 && (
          <div class="empty">
            <p>No playbook yet. Save one from a team: open More, then Save as playbook.</p>
          </div>
        )}
        {list && words && count > 0 && shown.length === 0 && <p class="empty">No playbook holds those words.</p>}
      </div>
    </section>
  );
}

/** The words of the placement of a bridge, as New bridge says them. */
const PLACEMENT_WORDS: Record<string, string> = { queue: 'Keep warm workers', spawn: 'Fresh sandbox per seat' };

/** The words of the caps of a bridge and of what the manager can do, as New bridge says them. */
const CAP_WORDS: [keyof Caps, string][] = [
  ['maxMessages', 'Most messages'],
  ['maxTurns', 'Most turns'],
  ['maxFanoutPerMinute', 'Most messages a minute'],
  ['maxPairMessages', 'Most messages between two members'],
];
const MANAGER_WORDS: [keyof Delegation, string][] = [
  ['approve', 'Decide for members'],
  ['budget', 'Change the budgets of members'],
  ['members', 'Add and remove members'],
  ['report', 'Write a report on close'],
];

/** PlaybookMain is the main pane of the tab Playbooks: one playbook, or, without one, the first playbook where two panes show. */
export function PlaybookMain({ name }: { name?: string }) {
  if (name) return <PlaybookView name={name} />;
  return <PlaybookHome />;
}

function PlaybookHome() {
  const list = usePlaybooks((s) => s.list);
  const off = usePlaybooks((s) => s.off);
  const first = list && list.length ? list[0].name : '';
  useEffect(() => {
    if (first && typeof window.matchMedia === 'function' && window.matchMedia(TWO_PANES).matches) go(bookHref(first), true);
  }, [first]);
  return (
    <EmptyPane back={{ href: hrefOf({ place: 'duties', tab: 'playbooks' }), label: 'Playbooks' }}>
      <p>{off ? 'This workbench keeps no playbooks.' : !list ? 'Loading the playbooks.' : list.length === 0 ? PLAYBOOK_IS : 'Pick a playbook.'}</p>
    </EmptyPane>
  );
}

/** PLAYBOOK_IS says what a playbook is, on the empty tab. */
export const PLAYBOOK_IS = 'A playbook is a team that you saved to open again: its goal, its seats, and its caps.';

/** The width from which two panes show side by side, as App names it. */
const TWO_PANES = '(min-width: 800px)';

/**
 * PlaybookView is the page of one playbook: its goal, its seats, how its
 * bridge runs, and the duties that open a bridge from it, with Make a duty
 * and, in More, Rename and Delete. The page reads the playbook whole for
 * its caps and what the manager can do.
 */
function PlaybookView({ name }: { name: string }) {
  const listed = usePlaybooks((s) => (s.list ? s.list.find((p) => p.name === name) : undefined));
  const loaded = usePlaybooks((s) => !!s.list);
  const duties = useDuties((s) => s.list);
  const [whole, setWhole] = useState<Playbook | null>(null);
  const [failed, setFailed] = useState('');
  const [asking, setAsking] = useState<'rename' | 'delete' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setWhole(null);
    setFailed('');
    setAsking(null);
    loadPlaybooks().catch(() => {});
    loadDuties().catch(() => {});
    readPlaybook(name).then(setWhole, (e) => setFailed(e instanceof ApiError && e.status === 404 ? 'gone' : e instanceof Error ? e.message : 'The action failed. Try it again.'));
  }, [name]);
  // A page that a move opens gives its heading the focus that fell to the body.
  useEffect(() => {
    const t = setTimeout(() => {
      const a = document.activeElement;
      if (heading.current && (!a || a === document.body)) heading.current.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [name, !!(whole || listed)]);
  const p = whole || listed;
  const title = name;
  const back = { href: hrefOf({ place: 'duties', tab: 'playbooks' }), label: 'Playbooks', to: 'list' as const };
  if (!p) {
    return (
      <section class="screen duty book" aria-labelledby="book-title">
        <PaneHeader id="book-title" title={title} size="title" level={1} back={back} headingRef={heading} focusable />
        <div class="empty center">
          <p>{failed === 'gone' || (loaded && failed) ? 'This playbook is not here. It was removed, or you cannot see it.' : failed || 'Loading the playbook.'}</p>
        </div>
      </section>
    );
  }
  const seats = seatsOf(p);
  const users = usersOf(duties, name);
  const caps = CAP_WORDS.filter(([k]) => p.caps && typeof p.caps[k] === 'number' && (p.caps[k] as number) > 0);
  const manager = MANAGER_WORDS.filter(([k]) => p.delegation && p.delegation[k]);
  const seed = { act: 'open' as const, playbook: name, agent: seats[0] ? seats[0].agent : undefined };
  return (
    <section class="screen duty book" aria-labelledby="book-title">
      <PaneHeader id="book-title" title={<span title={title}>{title}</span>} size="title" level={1} back={back} headingRef={heading} focusable />
      <div class="scroll pad duty-body">
        <div class="duty-keys">
          <Button size="s" href={hrefOf({ place: 'duties', fresh: true, seed })}>
            Make a duty
          </Button>
          <Menu
            label="More"
            kind="secondary"
            items={[
              { label: 'Rename', onSelect: () => setAsking('rename') },
              { label: 'Delete', danger: true, onSelect: () => setAsking('delete') },
            ]}
          />
        </div>
        <section class="duty-sec" aria-labelledby="book-goal">
          <h2 class="t-sub duty-sec-head" id="book-goal">
            Goal
          </h2>
          {p.goal ? <p class="duty-message book-goal">{p.goal}</p> : <p class="t-meta">No goal.</p>}
        </section>
        <section class="duty-sec" aria-labelledby="book-seats">
          <h2 class="t-sub duty-sec-head" id="book-seats">
            Seats <Chip label={seats.length === 1 ? '1 seat' : seats.length + ' seats'}>{seats.length}</Chip>
          </h2>
          <ul class="book-seats">
            {seats.map((m) => (
              <li class="book-seat">
                <Mark agent={m.agent} size={24} />
                <span class="book-seat-main">
                  <span class="t-sub">{m.handle}</span>
                  {m.task && <SeatTask task={m.task} />}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section class="duty-sec" aria-labelledby="book-runs">
          <h2 class="t-sub duty-sec-head" id="book-runs">
            How its bridge runs
          </h2>
          <ul class="duty-lines">
            <li>{PLACEMENT_WORDS[p.placement] || PLACEMENT_WORDS.queue}</li>
            {caps.map(([k, w]) => (
              <li>{w + ': ' + (p.caps as Partial<Caps>)[k]}</li>
            ))}
            {whole && <li>{manager.length ? 'The manager can: ' + manager.map(([, w]) => w.toLowerCase()).join(', ') + '.' : 'The manager decides nothing for the members.'}</li>}
          </ul>
        </section>
        <section class="duty-sec" aria-labelledby="book-users">
          <h2 class="t-sub duty-sec-head" id="book-users">
            Duties that open it <Chip label={users.length === 1 ? '1 duty' : users.length + ' duties'}>{users.length}</Chip>
          </h2>
          {users.length === 0 ? (
            <p class="t-meta">No duty opens a team from it.</p>
          ) : (
            <ul class="prof-duties">
              {users.map((d) => (
                <li>
                  <a class="prof-link" href={hrefOf({ place: 'duties', name: d.name })}>
                    {dutyTitle(d)}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {asking === 'rename' && <RenamePlaybook name={name} users={users} onClose={() => setAsking(null)} />}
      {asking === 'delete' && (
        <DeletePlaybook
          name={name}
          users={users}
          onClose={() => setAsking(null)}
          onDone={() => {
            go(hrefOf({ place: 'duties', tab: 'playbooks' }));
            setTimeout(() => {
              const h = document.getElementById('books-title');
              const a = document.activeElement;
              if (h && (!a || a === document.body)) h.focus();
            }, 0);
          }}
        />
      )}
    </section>
  );
}

/** A task of a seat longer than this, or of several lines, shows its first line and folds the rest. */
const SHORT_TASK = 160;

/** SeatTask shows the task of a seat of a playbook whole: in full when it is short, else its first line with the whole task in a fold. */
function SeatTask({ task }: { task: string }) {
  const t = task.trim();
  if (t.length <= SHORT_TASK && !t.includes('\n')) return <span class="t-meta book-task">{t}</span>;
  return (
    <details class="book-task-fold">
      <summary>
        <span class="t-meta">{firstLine(t)}</span> <span class="book-task-more">The whole task</span>
      </summary>
      <p class="t-meta book-task">{t}</p>
    </details>
  );
}

/** usersWords says how many duties open a bridge from a playbook. */
const usersWords = (n: number) => (n === 1 ? '1 duty opens a team from it.' : n + ' duties open a team from it.');

/** DeletePlaybook asks before it deletes a playbook, and says what a duty that opens a bridge from it does then. */
function DeletePlaybook({ name, users, onClose, onDone }: { name: string; users: Duty[]; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const title = name;
  return (
    <Confirm
      title={'Delete ' + title + '?'}
      confirm="Delete"
      danger
      busy={busy}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        const ok = await attempt(() => removePlaybook(name));
        setBusy(false);
        if (!ok) return;
        onClose();
        showSaid('Deleted the playbook ' + title + '.');
        onDone();
      }}
    >
      {users.length > 0 ? (
        <p>{usersWords(users.length) + (users.length === 1 ? ' It stops until you pick another playbook for it.' : ' They stop until you pick another playbook for them.')}</p>
      ) : (
        <p>The teams that it opened stay.</p>
      )}
    </Confirm>
  );
}

/**
 * RenamePlaybook gives a playbook a new name. The server keys a playbook by
 * its name, so the page saves it whole under the new name, moves each duty
 * that opens a bridge from it to the new name, and then deletes the old
 * name. A duty that does not move keeps the old playbook, and the page
 * says which one.
 */
function RenamePlaybook({ name, users, onClose }: { name: string; users: Duty[]; onClose: () => void }) {
  const list = usePlaybooks((s) => s.list);
  const [words, setWords] = useState(name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // The dialog opens with the focus in the name, which the person came to change. The dialog gives Cancel the focus first, so this runs after it.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!field.current) return;
      field.current.focus();
      field.current.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const next = slugOf(words);
  const save = async () => {
    const why = words.trim() && !next ? 'A name needs at least one letter from a to z, or a digit.' : playbookReason(next);
    if (why) {
      setError(why);
      return;
    }
    if (next === name) {
      onClose();
      return;
    }
    if ((list || []).some((p) => p.name === next)) {
      setError('A playbook of this name exists. Pick another name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const whole = await readPlaybook(name);
      await savePlaybook(next, bodyOfPlaybook(whole));
    } catch (e) {
      setBusy(false);
      setError(problemsOfError(e).join(' '));
      return;
    }
    // Each duty that opens a bridge from the playbook moves to the new name, with the revision that it has now.
    const stuck: string[] = [];
    for (const d of users) {
      try {
        const now = await api.duty(d.name);
        await saveDuty(d.name, { ...now, do: { ...now.do, open: { ...(now.do.open || { playbook: name }), playbook: next } } });
      } catch {
        stuck.push(dutyTitle(d));
      }
    }
    setBusy(false);
    onClose();
    const newTitle = next;
    if (stuck.length) {
      showError(new Error('Saved the playbook as ' + newTitle + '. ' + listWords(stuck) + (stuck.length === 1 ? ' still opens' : ' still open') + ' a team from ' + name + ', so that playbook stays too.'));
    } else {
      const ok = await attempt(() => removePlaybook(name));
      if (ok) showSaid('Renamed the playbook to ' + newTitle + '.', { label: 'See the playbook', href: bookHref(next) });
    }
    go(bookHref(next));
  };
  return (
    <Confirm title={'Rename ' + name} confirm="Rename" busy={busy} onCancel={onClose} onConfirm={save}>
      <Field label="Name" error={error}>
        <Input
          ref={field}
          value={words}
          maxLength={80}
          invalid={!!error}
          aria-describedby={next && next !== words.trim() && !error ? 'rename-slug' : undefined}
          onInput={(e) => {
            setWords((e.target as HTMLInputElement).value);
            setError('');
          }}
        />
        {next && next !== words.trim() && !error && (
          <span class="t-meta duty-slug" id="rename-slug">
            It saves as {next}.
          </span>
        )}
      </Field>
      {users.length > 0 && <p>{users.length === 1 ? 'The duty that opens a team from it moves to the new name.' : 'The ' + users.length + ' duties that open a team from it move to the new name.'}</p>}
    </Confirm>
  );
}

/** bodyOfPlaybook is the body of a save of a playbook that the page read: everything but its name, revision, owner, and time. */
function bodyOfPlaybook(p: Playbook): PlaybookBody {
  const body: PlaybookBody = { goal: p.goal || '', placement: p.placement || 'queue', seats: seatsOf(p).map((m) => ({ handle: m.handle, agent: m.agent, task: m.task })) };
  if (p.caps && Object.keys(p.caps).length) body.caps = p.caps;
  if (p.delegation && Object.keys(p.delegation).length) body.delegation = p.delegation;
  return body;
}
