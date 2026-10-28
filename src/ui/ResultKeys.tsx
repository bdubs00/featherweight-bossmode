// ResultKeys are the two keys of a result to check, on a card of the board
// and on a card of Activity: Looks right and Needs work. Looks right is the
// reaction up on the run. Needs work opens a note, and Send back sends the
// reaction down with the note. The front records the reaction on the end of
// the run, so it counts as a verdict, and it sends the note to the agent as
// a follow-up message (docs/CONTRACT.md, section 21). A team has no one
// run: its keys go to POST /v1/work/review with its bridge. Looks right
// closes the bridge as accepted, and Send back posts the note to every
// seat, and the bridge stays open. Escape or Cancel closes the note and
// gives the focus back to Needs work. After a decision, the focus goes to
// the nearest key that still stands, as holdFocus says.

import { useRef, useState } from 'preact/hooks';
import { api } from '../api/routes';
import { ApiError } from '../api/client';
import { holdFocus } from './keys';
import { showError, showSaid } from './notice';
import { Button, TextArea } from './primitives';

/** The longest note of Needs work, as the kernel takes it: 1 KB. */
export const NOTE_MAX = 1024;

/** noteProblem says what is wrong with a note of Needs work, or "". */
export function noteProblem(note: string): string {
  const t = note.trim();
  if (!t) return 'Say what must change.';
  if (new TextEncoder().encode(t).length > NOTE_MAX) return 'Say it in at most 1,000 characters.';
  return '';
}

/** saidOf is the notice after a check: the verdict and the title, and for a team what the verdict did. */
export function saidOf(reaction: 'up' | 'down', title: string, team: boolean): string {
  if (reaction === 'up') return 'Marked as right: ' + title + '.' + (team ? ' The team closed.' : '');
  return 'Sent back with your note: ' + title + '.' + (team ? ' Each agent of the team reads it.' : '');
}

/** ResultKeys check the result of a run, or with bridge the result of a team. */
export function ResultKeys({ run, bridge, title, size = 'm', primary, onDone }: { run?: string; bridge?: string; title: string; size?: 's' | 'm'; primary?: boolean; onDone?: () => void }) {
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const needs = useRef<HTMLButtonElement>(null);
  /** close puts the note away and gives the focus back to Needs work. */
  const close = () => {
    setWriting(false);
    setError('');
    setTimeout(() => needs.current && needs.current.focus(), 0);
  };
  const send = async (reaction: 'up' | 'down') => {
    if (busy) return;
    if (reaction === 'down') {
      const p = noteProblem(note);
      if (p) {
        setError(p);
        if (box.current) box.current.focus();
        return;
      }
    }
    setBusy(true);
    const after = holdFocus();
    try {
      const said = reaction === 'down' ? note.trim() : undefined;
      if (bridge) await api.reviewTeam(bridge, reaction, said);
      else await api.reactRun(run || '', 0, reaction, said);
      showSaid(saidOf(reaction, title, !!bridge));
      setWriting(false);
      setNote('');
      if (onDone) onDone();
      after();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setBusy(false);
  };
  if (writing) {
    return (
      <div class="result-note">
        <label class="field-label" for={'note-' + (bridge || run)}>
          What must change?
        </label>
        <TextArea
          id={'note-' + (bridge || run)}
          ref={box}
          rows={3}
          value={note}
          invalid={!!error}
          onInput={(e) => {
            setNote((e.target as HTMLTextAreaElement).value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        />
        {error && (
          <span class="field-error" role="alert">
            {error}
          </span>
        )}
        <div class="result-keys">
          <Button size={size} kind="quiet" onClick={close}>
            Cancel
          </Button>
          <Button size={size} kind={primary ? 'primary' : 'secondary'} aria-disabled={busy || undefined} onClick={() => send('down')}>
            Send back
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div class="result-keys">
      <Button
        ref={needs}
        size={size}
        onClick={() => {
          setWriting(true);
          setTimeout(() => box.current && box.current.focus(), 0);
        }}
      >
        Needs work
      </Button>
      <Button size={size} kind={primary ? 'primary' : 'secondary'} aria-disabled={busy || undefined} onClick={() => send('up')}>
        Looks right
      </Button>
    </div>
  );
}
