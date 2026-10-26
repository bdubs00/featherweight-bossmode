// The playbooks on the page. Save as playbook is a dialog of a bridge that
// saves its goal, placement, seats, caps, and what the manager can do under
// a name. The choice of a playbook serves New bridge and the action open of
// a duty. Under that choice, a list shows the playbooks with Delete.
// docs/CONTRACT.md, section 16, names the routes. The person names a
// playbook in words, and the page makes its short name and shows it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import type { Playbook } from '../api/types';
import { keepsWords, playbookBodyOf, playbookLabel, playbookName, playbookReason } from '../lib/playbooks';
import { slugOf, splitProblem, titleOfName } from '../lib/duties';
import { membersOf } from '../state/reducer';
import { useSelect } from '../state/store';
import { loadPlaybooks, removePlaybook, savePlaybook, seatsOf, usePlaybooks } from '../state/playbooks';
import { attempt, showSaid } from './notice';
import { Confirm } from './common';
import { Glyph } from './icons';
import { Button, Field, Input } from './primitives';

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
  const [words, setWords] = useState(() => titleOfName(playbookName(b ? b.title : '')));
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
      setError('This bridge has no seat to save.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body = playbookBodyOf(b, members);
      await savePlaybook(name, old && typeof old.revision === 'number' ? { ...body, revision: old.revision } : body);
      setBusy(false);
      showSaid('Saved the playbook ' + titleOfName(name) + '.');
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
          placeholder="Weekly patching"
          aria-describedby={name && !error ? 'playbook-slug' : undefined}
          onInput={(e) => {
            setWords((e.target as HTMLInputElement).value);
            setError('');
          }}
        />
        {name && !error && (
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
          {value && list && !names.includes(value) && <option value={value}>{titleOfName(value) + ', not here'}</option>}
        </select>
      </Field>
      {list && list.length === 0 && <p class="t-meta">Save one from a bridge: open More, then Save as playbook.</p>}
    </>
  );
}

/** PlaybookShelf lists the playbooks, each with its goal and its seats, and Delete after a dialog that asks first. */
export function PlaybookShelf() {
  const list = usePlaybooks((s) => s.list);
  const [asking, setAsking] = useState<Playbook | null>(null);
  const [busy, setBusy] = useState(false);
  const head = useRef<HTMLElement>(null);
  if (!list || list.length === 0) return null;
  return (
    <details class="advanced duty-books">
      <summary ref={head}>
        <Glyph name="back" size={16} />
        See the playbooks
      </summary>
      <ul class="duty-book-list">
        {list.map((p) => {
          const n = seatsOf(p).length;
          return (
            <li class="duty-book">
              <span class="duty-book-main">
                <span class="t-sub">{titleOfName(p.name)}</span>
                {p.goal && <span class="t-meta">{p.goal}</span>}
                <span class="t-meta">{n === 1 ? '1 seat' : n + ' seats'}</span>
              </span>
              <Button size="s" kind="quiet" aria-label={'Delete ' + titleOfName(p.name)} onClick={() => setAsking(p)}>
                Delete
              </Button>
            </li>
          );
        })}
      </ul>
      {asking && (
        <Confirm
          title={'Delete ' + titleOfName(asking.name) + '?'}
          confirm="Delete"
          danger
          busy={busy}
          onCancel={() => setAsking(null)}
          onConfirm={async () => {
            setBusy(true);
            const ok = await attempt(() => removePlaybook(asking.name));
            setBusy(false);
            if (ok) {
              setAsking(null);
              showSaid('Deleted the playbook ' + titleOfName(asking.name) + '.');
              // Its row and its key are gone, so the focus goes to the head of the list.
              setTimeout(() => {
                const a = document.activeElement;
                if (head.current && (!a || a === document.body)) head.current.focus();
              }, 0);
            }
          }}
        >
          <p>A duty that opens a bridge from it stops until you pick another playbook.</p>
        </Confirm>
      )}
    </details>
  );
}
