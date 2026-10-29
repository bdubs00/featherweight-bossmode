// The way out of each item of Needs you, where it lands. A result to check
// shows its first lines and the keys Looks right and Needs work: a run on
// its task, a channel at the top of its posts (POST /v1/work/review with the
// channel). A stopped task offers Let it go. An item that nobody can answer
// any more, because its run is gone, says so and offers Dismiss. After an
// answer, the row leaves Needs you at once, every count drops, and a line
// stays here, such as You marked this right at 9:49 AM.

import { useRef, useState } from 'preact/hooks';
import { ApiError } from '../../api/client';
import { api } from '../../api/routes';
import type { WorkCard } from '../../api/types';
import { useSelect } from '../../state/store';
import { clock, excerpt, plainText } from '../../lib/words';
import { noteProblem } from '../ResultKeys';
import { showError } from '../notice';
import { Markdown } from '../common';
import { Button, LineLed, TextArea } from '../primitives';
import { answerFor, markAnswered, useAnswered, useBoard } from './data';
import { pageWords } from './channels';

/** The lines of a result that the card shows before More. */
const RESULT_CHARS = 600;

/** Done is the line that stays after an answer of the person. */
function Done({ words, at }: { words: string; at: string }) {
  return (
    <p class="cf-done" role="status">
      <LineLed tone="green" /> {words} at {clock(at)}.
    </p>
  );
}

/** Nobody says that nobody can answer an item any more, with Dismiss, which lets its task go. */
function Nobody({ card, why }: { card?: WorkCard; why?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div class="cf-wayout cf-nobody">
      <p class="cf-wayout-head">Nobody can answer this one any more.</p>
      {why && <p class="cf-post-quiet">{pageWords(why)}</p>}
      <div class="cf-wayout-keys">
        <Button
          size="s"
          aria-disabled={busy || undefined}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            // Dismiss lets the task go. A server that refuses it still takes the row off this page.
            if (card) await api.letGo(card.id).catch(() => {});
            markAnswered({ kind: 'dismiss', card: card ? card.id : undefined, run: card ? card.links.run : undefined, bridge: card ? card.links.bridge : undefined, words: 'You dismissed this' });
            setBusy(false);
          }}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/**
 * SignOff is the card of a result to check: its first lines, and the keys
 * Looks right and Needs work, the ways out looks-right and needs-work of its
 * item. The verdict lands also on a run whose worker is gone, and the front
 * answers kept. An older server refuses such a verdict with 409; the card
 * then says that nobody can answer it any more, with Dismiss.
 */
export function SignOff({ run, bridge, card, result, title, brief }: { run?: string; bridge?: string; card?: WorkCard; result?: string; title: string; brief?: boolean }) {
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState('');
  const [more, setMore] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const done = answerFor(useAnswered(), { run, bridge: run ? undefined : bridge, card: card ? card.id : undefined });
  if (done) return <Done words={done.words} at={done.at} />;
  if (gone) return <Nobody card={card} why={gone} />;
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
    try {
      const said = reaction === 'down' ? note.trim() : undefined;
      // The verdict goes to POST /v1/work/review, which lands also on a run
      // whose worker the pool replaced: the answer then says kept, and the
      // note of Needs work stays with the result.
      const ans = bridge && !run ? await api.reviewTeam(bridge, reaction, said) : await api.reviewRun(run || '', reaction, said);
      const kept = !!(ans && ans.kept);
      const words = reaction === 'up' ? 'You marked this right' : kept ? 'You sent this back. No agent holds this task any more, so your note stays with the result' : 'You sent this back with your note';
      markAnswered({ kind: 'verdict', run, bridge, card: card ? card.id : undefined, words });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setGone(e.message);
      else if (e instanceof ApiError && e.status === 400) setError(e.message);
      else showError(e);
    }
    setBusy(false);
  };
  const long = !!result && result.length > RESULT_CHARS;
  return (
    <section class="cf-wayout cf-signoff" aria-label={'Sign off: ' + title}>
      <p class="cf-wayout-head">Ready to sign off</p>
      {brief ? null : result ? (
        <div class={'cf-signoff-result' + (long && !more ? ' cut' : '')}>
          {long && !more ? <p>{excerpt(plainText(result), RESULT_CHARS)}</p> : <Markdown text={result} refs headings={4} />}
          {long && (
            <button type="button" class="cf-link-key" onClick={() => setMore(!more)}>
              {more ? 'Show less' : 'Show all of it'}
            </button>
          )}
        </div>
      ) : (
        <p>{title}</p>
      )}
      {writing ? (
        <div class="result-note">
          <label class="field-label" for={'cf-note-' + (run || bridge)}>
            What must change?
          </label>
          <TextArea
            id={'cf-note-' + (run || bridge)}
            ref={box}
            rows={3}
            value={note}
            invalid={!!error}
            onInput={(e) => {
              setNote((e.target as HTMLTextAreaElement).value);
              setError('');
            }}
          />
          {error && (
            <span class="field-error" role="alert">
              {error}
            </span>
          )}
          <div class="cf-wayout-keys">
            <Button size="s" kind="quiet" onClick={() => setWriting(false)}>
              Cancel
            </Button>
            <Button size="s" kind="primary" aria-disabled={busy || undefined} onClick={() => send('down')}>
              Send back
            </Button>
          </div>
        </div>
      ) : (
        <div class="cf-wayout-keys">
          {error && (
            <span class="field-error" role="alert">
              {error}
            </span>
          )}
          <Button
            size="s"
            onClick={() => {
              setWriting(true);
              setTimeout(() => box.current && box.current.focus(), 0);
            }}
          >
            Needs work
          </Button>
          <Button size="s" kind="primary" aria-disabled={busy || undefined} onClick={() => send('up')}>
            Looks right
          </Button>
        </div>
      )}
    </section>
  );
}

/** LetGo is the way out of a stopped task: why it stopped, and Let it go. */
function LetGo({ card }: { card: WorkCard }) {
  const [busy, setBusy] = useState(false);
  return (
    <div class="cf-wayout cf-stopped">
      <p class="cf-wayout-head">Stopped</p>
      <p>{pageWords(card.reason || 'It stopped before it finished.')}</p>
      <div class="cf-wayout-keys">
        <Button
          size="s"
          aria-disabled={busy || undefined}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              await api.letGo(card.id);
              markAnswered({ kind: 'dismiss', card: card.id, run: card.links.run, bridge: card.links.bridge, words: 'You let this go' });
            } catch (e) {
              showError(e);
            }
            setBusy(false);
          }}
        >
          Let it go
        </Button>
      </div>
    </div>
  );
}

/** cardsOf finds the tasks of the board whose next move is the person's, for a run, a channel, or a job. */
export function useCardsFor(q: { run?: string; bridge?: string; duty?: string }): WorkCard[] {
  const board = useBoard();
  if (!board) return [];
  return board.cards.filter((c) => c.next === 'you' && (c.stage === 'review' || c.stage === 'stopped' || c.stage === 'needs-you') && ((q.run && (c.links.run === q.run || (c.links.runs || []).includes(q.run))) || (q.bridge && c.links.bridge === q.bridge) || (q.duty && !c.links.bridge && c.links.duty === q.duty)));
}

/**
 * WayOut shows what the person can do about the tasks of a run, a channel,
 * or a job that wait for them: sign off a result, let a stopped task go,
 * or dismiss a task that nobody can answer any more. A decision that waits
 * shows its own card in the stream, so WayOut shows nothing for it while
 * its run is there.
 */
export function WayOut({ run, bridge, duty, result, brief }: { run?: string; bridge?: string; duty?: string; result?: string; brief?: boolean }) {
  const cards = useCardsFor({ run, bridge, duty });
  const answered = useAnswered();
  const runs = useSelect((s) => s.runs);
  const lost = useSelect((s) => s.lost);
  const items = cards.map((c) => {
    const r = c.links.run || '';
    const done = answerFor(answered, { card: c.id, run: r || undefined, bridge: r ? undefined : c.links.bridge });
    if (done) return <Done words={done.words} at={done.at} />;
    if (c.stage === 'review') {
      const text = result || (r && runs[r] && runs[r].output) || c.summary || '';
      return <SignOff run={r || undefined} bridge={c.links.bridge} card={c} result={text} title={c.title} brief={brief} />;
    }
    if (c.stage === 'stopped') return <LetGo card={c} />;
    // A decision whose run is gone, or that the archive keeps, waits for nobody.
    const held = r ? runs[r] : undefined;
    if (r && (lost[r] || (held && held.archived))) return <Nobody card={c} why="Its run ended when the agent that held it restarted." />;
    return null;
  });
  // The answers of this page about this place stay as lines after the task leaves the board.
  const left = answered.filter((a) => !cards.some((c) => a.card === c.id) && ((run && a.run === run) || (bridge && !run && a.bridge === bridge && a.kind !== 'decision')));
  if (!items.some(Boolean) && !left.length) return null;
  return (
    <div class="cf-wayouts">
      {items}
      {left.map((a) => (
        <Done words={a.words} at={a.at} />
      ))}
    </div>
  );
}
