// The tab Notes of the Know-how place: the notes of an agent and of its
// duties, grouped by scope, each with its label checked, out of date, or
// resting. A note opens in place with its text and its sources. A person
// edits and puts away the notes that they wrote. A note that changed since
// the person read it answers 412: the page reads it again and says so in
// place, and the draft stays.

import { useEffect, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import type { NoteItem, NoteRecord } from '../api/knowhow';
import { byWords, groupNotes, isMine, labelOf, noteKey, noteTitle, sourceOf, usesWords } from '../lib/knowhow';
import { dateWords } from '../lib/routines';
import { since } from '../lib/words';
import { loadNote, loadNotes, putAway, saveNote, useKnowhow } from '../state/knowhow';
import { useSelect } from '../state/store';
import { showError, showSaid } from './notice';
import { Button, Chip, Field, Led, LineLed, TextArea } from './primitives';

/** KnowhowNotes lists the notes of an agent by scope: the notes of the person, the agent notes, and the notes of each duty. */
export function KnowhowNotes({ agent, name }: { agent: string; name: string }) {
  const notes = useKnowhow((s) => s.agents[agent] && s.agents[agent].notes);
  const error = useKnowhow((s) => (s.agents[agent] && s.agents[agent].errors.notes) || '');
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  const [open, setOpen] = useState<string>('');
  useEffect(() => {
    setOpen('');
    loadNotes(agent).catch(() => {});
  }, [agent]);
  const groups = notes ? groupNotes(notes, me) : [];
  return (
    <section class="kh-sec kh-notes" aria-label="Notes">
      {groups.map((g) => (
        <div class="kh-group" role="group" aria-labelledby={'kh-n-' + g.key}>
          <h3 class="rt-group-head kh-group-head" id={'kh-n-' + g.key}>
            <span>{g.title}</span>
            <Chip>{g.items.length}</Chip>
          </h3>
          <ul class="kh-note-rows">
            {g.items.map((n) => {
              const k = noteKey(n);
              return <NoteRow key={k} n={n} name={name} open={open === k} onToggle={() => setOpen(open === k ? '' : k)} />;
            })}
          </ul>
        </div>
      ))}
      {!notes && <p class="t-meta">{error || 'Loading the notes.'}</p>}
      {notes && groups.length === 0 && <p class="t-meta">No note yet.</p>}
    </section>
  );
}

function NoteRow({ n, name, open, onToggle }: { n: NoteItem; name: string; open: boolean; onToggle: () => void }) {
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  const label = labelOf(n.state);
  const by = byWords(n.by, me, name);
  const id = 'kh-note-' + noteKey(n).replace(/[^A-Za-z0-9_-]/g, '-');
  return (
    <li class={'kh-note' + (open ? ' open' : '') + (n.state === 'out-of-date' ? ' ood' : '')}>
      <button type="button" class="kh-note-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span class="kh-note-top">
          <span class="kh-note-desc">{n.description || noteTitle(n.name)}</span>
          {label && <Led tone={label.tone} word={label.word} still={label.still} />}
        </span>
        <span class="kh-meta">
          <span>{noteTitle(n.name)}</span>
          {by && <span>By {by}</span>}
          {n.at && <span title={new Date(n.at).toLocaleString()}>{since(n.at)}</span>}
          <span>{usesWords(n.uses)}</span>
        </span>
      </button>
      {open && <NoteBody n={n} id={id} />}
    </li>
  );
}

/** NoteBody is an open note: its text, the source that put it out of date, its sources, and Edit and Put away for a note of the person. */
function NoteBody({ n, id }: { n: NoteItem; id: string }) {
  const key = noteKey(n);
  const rec = useKnowhow((s) => s.notes[key]);
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  const [failed, setFailed] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    setFailed('');
    loadNote(n).catch((e) => setFailed(e instanceof Error ? e.message : 'The action failed. Try it again.'));
  }, [key, n.hash]);
  if (!rec) {
    return (
      <div class="kh-note-body" id={id}>
        <p class="t-meta">{failed || 'Loading the note.'}</p>
      </div>
    );
  }
  const mine = isMine(rec.by, me);
  const editing = draft !== null;
  const conflict = (e: unknown): boolean => {
    if (e instanceof ApiError && e.status === 412) {
      setChanged(true);
      return true;
    }
    showError(e);
    return false;
  };
  const save = async () => {
    if (draft === null) return;
    setBusy(true);
    setChanged(false);
    try {
      await saveNote(rec, draft);
      setDraft(null);
    } catch (e) {
      conflict(e);
    }
    setBusy(false);
  };
  const away = async () => {
    setBusy(true);
    setChanged(false);
    try {
      await putAway(rec);
      showSaid('Put away the note ' + noteTitle(rec.name) + '.');
    } catch (e) {
      conflict(e);
    }
    setBusy(false);
  };
  return (
    <div class="kh-note-body" id={id}>
      {changed && (
        <p class="rt-changed" role="status">
          <LineLed tone="grey" />
          This note changed since. Read it again.
        </p>
      )}
      {(!editing || changed) && <p class="kh-text">{rec.text}</p>}
      {rec.outOfDate && rec.outOfDate.source && <OutOfDate rec={rec} />}
      <Sources rec={rec} />
      {editing ? (
        <>
          <Field label="Text">
            <TextArea value={draft!} rows={4} onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)} />
          </Field>
          <div class="rt-keys">
            <Button
              size="s"
              disabled={busy}
              onClick={() => {
                setDraft(null);
                setChanged(false);
              }}
            >
              Cancel
            </Button>
            <Button size="s" kind="primary" disabled={busy || !draft!.trim()} onClick={save}>
              Save
            </Button>
          </div>
        </>
      ) : (
        mine && (
          <div class="rt-keys">
            <Button size="s" disabled={busy} onClick={() => setDraft(rec.text)}>
              Edit
            </Button>
            <Button size="s" disabled={busy} onClick={away}>
              Put away
            </Button>
          </div>
        )
      )}
    </div>
  );
}

/** OutOfDate says since when a note is out of date, and the source that changed. */
function OutOfDate({ rec }: { rec: NoteRecord }) {
  const src = sourceOf(rec.outOfDate!.source);
  const when = rec.outOfDate!.since ? dateWords(rec.outOfDate!.since) : '';
  return (
    <p class="kh-ood">
      <LineLed tone="amber" />
      <span>
        Out of date{when ? ' since ' + when : ''}: {src.href ? <a href={src.href}>{src.words}</a> : src.words} changed.
      </span>
    </p>
  );
}

/** Sources lists where a note came from: runs, pages, and items of a source. */
function Sources({ rec }: { rec: NoteRecord }) {
  const list = (rec.sources || []).map((s) => sourceOf(s.ref));
  if (!list.length) return null;
  return (
    <p class="kh-meta kh-sources">
      <span>Sources:</span>
      {list.map((s) => (s.href ? <a href={s.href}>{s.words}</a> : <span>{s.words}</span>))}
    </p>
  );
}
