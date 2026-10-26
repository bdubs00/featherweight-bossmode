// One entry of the channel: a message of a person or an agent, a system
// line with the light of its event, or a card that waits for a decision.
// The reaction chips sit at the top right of an entry. The keys that add a
// reaction or a reply show beside them on hover and on focus, and always on
// a touch screen.

import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Entry, Member, ReactionKind } from '../api/types';
import { useSelect } from '../state/store';
import { dayWords, excerpt, list, personName, plainText, senderName } from '../lib/words';
import { hrefOf } from '../lib/route';
import { lineWords, napWords, whoName } from '../lib/lines';
import type { Tone } from '../lib/presence';
import { decide, react } from '../state/actions';
import { attempt } from './notice';
import { useWhole } from '../state/whole';
import { CutEnd } from './Whole';
import { AttachedFiles } from './AttachedFiles';
import { filesWords } from '../lib/attachments';
import { InlineMarkdown, Markdown, When } from './common';
import { AskCard, DecisionCard } from './Decision';
import { questionWaits } from '../state/inbox';
import { Avatar, Button, Chip, IconButton, LineLed, Mark, ReactionChip, TextArea } from './primitives';

/** agentOf finds the agent behind a handle, from the roster or the handle itself. */
export function agentOf(roster: Record<string, Member> | undefined, handle: string): string {
  const m = roster && roster[handle];
  return m ? m.agent : handle.replace(/-\d+$/, '');
}

/** handleOfRun finds the member of a run in the roster. */
function handleOfRun(roster: Record<string, Member> | undefined, run: string): string {
  if (!roster) return '';
  for (const m of Object.values(roster)) if (m.runs.includes(run)) return m.handle;
  return '';
}

/** toneOfEvent is the light of a system line: green for started, amber for needs you and asked, red for failed, grey for the rest. */
export function toneOfEvent(event: string | undefined): Tone {
  if (event === 'started') return 'green';
  if (event === 'needs-you' || event === 'asked') return 'amber';
  if (event === 'failed') return 'red';
  return 'grey';
}

/* ---------- the cards that arrive ---------- */

/** The newest seq of each channel when its first page loaded. A card after it arrived on the stream. */
const loadedAt = new Map<string, number>();

/** markLoaded records the newest seq of a channel at its load, so a card after it settles once. */
export function markLoaded(bridge: string, seq: number): void {
  loadedAt.set(bridge, seq);
}

/** arrived reports whether an entry came on the stream after the channel loaded. */
export function arrived(bridge: string, seq: number): boolean {
  const at = loadedAt.get(bridge);
  return at !== undefined && seq > at;
}

/* ---------- reactions ---------- */

const NAMES: Record<ReactionKind, string> = { up: 'Thumb up', down: 'Thumb down', heart: 'Heart' };

/** HeartNote asks for the optional note of a heart, inside the page. */
function HeartNote({ onSave, onCancel }: { onSave: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.focus();
  }, []);
  return (
    <form
      class="heart-note"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(note.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSave(note.trim());
        }
      }}
    >
      <label class="field">
        <span class="field-label">What made this useful?</span>
        <TextArea ref={ref} rows={2} maxLength={1024} placeholder="Optional" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="card-actions">
        <Button size="s" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="s" kind="primary" icon="heart">
          Heart
        </Button>
      </div>
    </form>
  );
}

/**
 * Reactions draws the chips of an entry and the keys that add a reaction.
 * On a card that waits, a thumb up allows and a thumb down denies, as the
 * keys of the card do. A second press of the person's own reaction takes
 * it back, because the server removes a reaction that the same person
 * sends again, and a thumb up and a thumb down of one person exclude each
 * other.
 */
export function Reactions({ bridge, e, onReply }: { bridge: string; e: Entry; onReply?: (seq: number) => void }) {
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const [heart, setHeart] = useState(false);
  const [busy, setBusy] = useState(false);
  const d = e.decision;
  const deciding = !!(d && d.state === 'pending');
  const thumbs = !(deciding && d && (d.question || d.schema));
  const r = e.reactions || {};
  const press = async (k: ReactionKind, note?: string) => {
    setBusy(true);
    if (deciding && d && k !== 'heart') await attempt(() => decide(d.run, d.id, k === 'up' ? 'allow' : 'deny'));
    else await attempt(() => react(bridge, e.seq, k, note));
    setBusy(false);
  };
  const mineOf = (k: ReactionKind) => !!me && (r[k] || []).includes(me);
  const shown = (['up', 'down', 'heart'] as ReactionKind[]).filter((k) => (r[k] || []).length > 0);
  const label = (k: ReactionKind) => {
    if (deciding && d && k === 'up') return 'Thumb up: ' + (d.label || 'Allow');
    if (deciding && k === 'down') return 'Thumb down: Deny';
    return NAMES[k];
  };
  // A chip adds the same reaction, and a chip of the person's own reaction takes it back. A chip of a thumb on a card that waits only counts.
  const chipPress = (k: ReactionKind) => {
    if (busy) return undefined;
    if (k === 'heart') return mineOf(k) ? () => press(k) : () => setHeart(true);
    if (deciding) return undefined;
    return () => press(k);
  };
  return (
    <>
      <div class="rx">
        <div class={'rx-keys' + (heart ? ' open' : '')} role="group" aria-label="Reactions">
          {thumbs && (
            <>
              <IconButton icon="thumb-up" label={label('up')} aria-pressed={deciding ? undefined : mineOf('up')} disabled={busy} onClick={() => press('up')} />
              <IconButton icon="thumb-down" label={label('down')} aria-pressed={deciding ? undefined : mineOf('down')} disabled={busy} onClick={() => press('down')} />
            </>
          )}
          <IconButton icon="heart" label="Heart" title="Heart: keep this in the wiki" aria-pressed={mineOf('heart')} aria-expanded={heart} disabled={busy} onClick={() => (mineOf('heart') ? press('heart') : setHeart(!heart))} />
          {onReply && e.from.kind !== 'system' && <IconButton icon="reply" label={'Reply to ' + senderName(e.from)} title="Reply" onClick={() => onReply(e.seq)} />}
        </div>
        {shown.map((k) => (
          <ReactionChip kind={k} count={(r[k] || []).length} mine={mineOf(k)} names={(r[k] || []).map((x) => personName(x)).join(', ')} onClick={chipPress(k)} disabled={busy} />
        ))}
      </div>
      {heart && (
        <HeartNote
          onCancel={() => setHeart(false)}
          onSave={(note) => {
            setHeart(false);
            press('heart', note || undefined);
          }}
        />
      )}
    </>
  );
}

/* ---------- the end of a question ---------- */

/**
 * answerOf finds the answer of a person to the question at seq: the first
 * message of a person in reply to it that the page holds, or undefined.
 */
export function answerOf(ch: { seqs: number[]; bySeq: Record<number, Entry> } | undefined, seq: number): Entry | undefined {
  if (!ch) return undefined;
  for (const q of ch.seqs) {
    const x = ch.bySeq[q];
    if (x && x.seq > seq && x.from.kind === 'person' && x.replyTo === seq) return x;
  }
  return undefined;
}

/**
 * AskEnd says how a question of a seat that no longer waits ended: the
 * answer of the person, or Ended without an answer, as after No answer
 * needed, a close, or a later message of the seat.
 */
function AskEnd({ bridge, seq }: { bridge: string; seq: number }) {
  const known = useSelect((s) => !!s.rosters[bridge]);
  const answer = useSelect((s) => {
    const a = answerOf(s.channels[bridge] as { seqs: number[]; bySeq: Record<number, Entry> } | undefined, seq);
    return a ? excerpt(plainText(a.text), 80) : '';
  });
  // Until the seats load, the page cannot tell whether the question still waits.
  if (!known) return null;
  return <p class="ask-end">{answer ? 'Answered: ' + answer : 'Ended without an answer'}</p>;
}

/* ---------- the reply chip ---------- */

/** jumpTo asks the channel to show an entry: it opens the fold that holds it and moves the focus there. */
export function jumpTo(bridge: string, seq: number): void {
  window.dispatchEvent(new CustomEvent('fw-jump', { detail: { bridge, seq } }));
}

/** ReplyChip names the entry that a message answers, and jumps to it. */
function ReplyChip({ bridge, seq }: { bridge: string; seq: number }) {
  const target = useSelect((s) => (s.channels[bridge] ? (s.channels[bridge].bySeq[seq] as Entry | undefined) : undefined));
  return (
    <button type="button" class="reply-chip" onClick={() => jumpTo(bridge, seq)} disabled={!target} title={target ? 'Go to the message' : 'Earlier messages hold it'}>
      <span class="reply-who">{target ? senderName(target.from) : 'An earlier message'}</span>
      {target && <span class="reply-text">{excerpt(plainText(target.text) || filesWords(target.files), 70)}</span>}
    </button>
  );
}

/* ---------- one entry ---------- */

/**
 * NapRow is the one quiet line of a run of sleep and wake pairs of one
 * seat, such as "migrator-1 slept and woke up 4 times", with the clock time
 * of its last line. The pairs say nothing that a person acts on, so the
 * line does not open.
 */
export const NapRow = memo(function NapRow({ bridge, seqs, handle, pairs, prevSeq }: { bridge: string; seqs: number[]; handle: string; pairs: number; prevSeq: number }) {
  const first = useSelect((s) => (s.channels[bridge] ? (s.channels[bridge].bySeq[seqs[0]] as Entry | undefined) : undefined));
  const lastOne = useSelect((s) => (s.channels[bridge] ? (s.channels[bridge].bySeq[seqs[seqs.length - 1]] as Entry | undefined) : undefined));
  const prev = useSelect((s) => (prevSeq && s.channels[bridge] ? (s.channels[bridge].bySeq[prevSeq] as Entry | undefined) : undefined));
  if (!first || !lastOne) return null;
  const day = !prev || dayWords(prev.at) !== dayWords(first.at) ? dayWords(first.at) : '';
  return (
    <>
      {day && (
        <p class="day" role="separator">
          {day}
        </p>
      )}
      <div class="sys ev-naps" id={'entry-' + bridge + '-' + seqs[0]} data-item data-seq={seqs[0]}>
        <p>
          <LineLed tone="grey" />
          <span class="sys-text">{napWords(handle, pairs)}</span>
          <When at={lastOne.at} />
        </p>
      </div>
    </>
  );
});

export interface EntryProps {
  bridge: string;
  seq: number;
  /** The entry before this one, for the line of a new day and for the grouping of one sender. */
  prevSeq: number;
  /** True after a fold: the entry shows its sender again. */
  fresh?: boolean;
  /** True in a list of cards, out of the flow of the channel: no line of a new day. */
  listed?: boolean;
  onReply?: (seq: number) => void;
}

/** EntryRow draws one entry. It reads its own entry, so a change redraws only it. */
export const EntryRow = memo(function EntryRow({ bridge, seq, prevSeq, fresh, listed, onReply }: EntryProps) {
  const e = useSelect((s) => (s.channels[bridge] ? (s.channels[bridge].bySeq[seq] as Entry | undefined) : undefined));
  const prev = useSelect((s) => (prevSeq && s.channels[bridge] ? (s.channels[bridge].bySeq[prevSeq] as Entry | undefined) : undefined));
  // A row reads strings of the roster, never the roster itself, so a change
  // of presence redraws the roster row and no message.
  const handles = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].order : undefined));
  const decisionRun = e && e.decision ? e.decision.run : '';
  const runHandle = useSelect((s) => (decisionRun ? handleOfRun(s.rosters[bridge] ? s.rosters[bridge].byHandle : undefined, decisionRun) : ''));
  const handle = e && e.from.kind === 'agent' ? e.from.handle || '' : runHandle;
  const agent = useSelect((s) => (handle ? agentOf(s.rosters[bridge] ? s.rosters[bridge].byHandle : undefined, handle) : ''));
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  // A card that arrives on the stream after the channel loaded settles once. A card on load never moves.
  const [settle] = useState(() => arrived(bridge, seq));
  // The whole text of a long entry, once the person asked for it with Show all.
  const whole = useWhole(bridge, e && e.cut ? seq : 0);
  // A question of a seat that waits for you, as the front names it.
  // A closed bridge takes no answer, so its question shows as the message that it is.
  const asking = useSelect((s) => (e && e.ask && !(s.bridges.byId[bridge] && s.bridges.byId[bridge].state === 'closed') ? questionWaits(s.rosters[bridge], e) : false));
  if (!e) return null;
  const day = listed ? '' : !prev || dayWords(prev.at) !== dayWords(e.at) ? dayWords(e.at) : '';
  const id = 'entry-' + bridge + '-' + seq;
  const dayLine = day && (
    <p class="day" role="separator">
      {day}
    </p>
  );
  if (e.from.kind === 'system' && !e.decision) {
    // The page words the line from its event, and keeps the sentence of the backend for the tooltip.
    const w = lineWords(e, me);
    const page = w.page || e.page;
    return (
      <>
        {dayLine}
        <div class={'sys' + (e.event ? ' ev-' + e.event : '')} id={id} data-item data-seq={seq}>
          <p>
            <LineLed tone={toneOfEvent(e.event)} />
            <span class="sys-text" title={w.title}>
              {w.raw ? <InlineMarkdown text={w.text} /> : w.text}
              {page && (
                <>
                  {' '}
                  <a class="sys-page" href={hrefOf({ place: 'pages', path: page, mode: 'read' })}>
                    {page}
                  </a>
                </>
              )}
            </span>
            <When at={e.at} />
          </p>
          {e.mirrors && <Reactions bridge={bridge} e={e} />}
        </div>
      </>
    );
  }
  if (e.from.kind === 'system' && e.decision) {
    const who = runHandle || e.text.split(' ')[0] || 'An agent';
    const d = e.decision;
    return (
      <>
        {dayLine}
        <article class={'msg card-row' + (d.state === 'pending' ? ' waiting' : '')} id={id} data-item data-seq={seq} aria-label={(d.question ? 'Question from ' : 'Decision for ') + who}>
          <Mark agent={agent || who.replace(/-\d+$/, '')} size={32} ink={who === 'manager' || undefined} />
          <div class="body">
            <header>
              <b>{who}</b>
              <When at={e.at} />
            </header>
            <DecisionCard d={d} who={who} settle={settle} />
          </div>
          <Reactions bridge={bridge} e={e} />
        </article>
      </>
    );
  }
  const body = (
    <>
      <Markdown text={whole && !whole.cut ? whole.text : e.text} handles={handles} refs />
      {e.cut && <CutEnd bridge={bridge} seq={e.seq} whole={whole} runHref={e.from.kind === 'agent' && e.from.handle ? hrefOf({ place: 'member', bridge, handle: e.from.handle, tab: 'chat' }) : undefined} class="cut" />}
      <AttachedFiles files={e.files} />
    </>
  );
  if (asking) {
    // A question of a seat that waits for you is a card, as a decision is.
    return (
      <>
        {dayLine}
        <article class="msg card-row waiting" id={id} data-item data-seq={seq} aria-label={'Question from ' + handle}>
          <Mark agent={agent} size={32} ink={handle === 'manager' || undefined} />
          <div class="body">
            <header>
              <b>{handle}</b>
              <When at={e.at} />
            </header>
            <AskCard bridge={bridge} e={e} who={handle} body={body} settle={settle} />
          </div>
          <Reactions bridge={bridge} e={e} />
        </article>
      </>
    );
  }
  const name = senderName(e.from);
  const sameAsPrev =
    !fresh &&
    !!prev &&
    !day &&
    !e.replyTo &&
    !e.pinned &&
    prev.from.kind === e.from.kind &&
    !prev.decision &&
    !prev.ask &&
    prev.from.kind !== 'system' &&
    senderName(prev.from) === name &&
    new Date(e.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000;
  const mine = e.from.kind === 'person';
  // The author line of a message of the person who reads the page says You.
  const author = mine ? whoName(e.from.name, me, e.from.display) : name;
  const to = e.to || [];
  const r = e.reactions || {};
  const chips = (r.up || []).length + (r.down || []).length + (r.heart || []).length > 0;
  return (
    <>
      {dayLine}
      <article class={'msg' + (sameAsPrev ? ' compact' : '') + (mine ? ' by-person' : ' by-agent') + (chips ? ' has-rx' : '')} id={id} data-item data-seq={seq} data-reply="1" aria-label={author + ', ' + excerpt(plainText(e.text) || filesWords(e.files), 60)}>
        {sameAsPrev ? (
          <span class="gutter" />
        ) : e.from.kind === 'agent' ? (
          <Mark agent={agent} size={32} ink={handle === 'manager' || undefined} />
        ) : (
          <Avatar subject={e.from.name || ''} display={e.from.display} size={32} />
        )}
        <div class="body">
          {!sameAsPrev && (
            <header>
              <b>{author}</b>
              <When at={e.at} />
              {to.length > 0 && <span class="to">to {list(to.map((h) => (h === 'operator' ? 'you' : h)))}</span>}
              {e.pinned && <Chip>pinned</Chip>}
            </header>
          )}
          {e.replyTo ? <ReplyChip bridge={bridge} seq={e.replyTo} /> : null}
          {body}
          {e.ask && <AskEnd bridge={bridge} seq={e.seq} />}
        </div>
        <Reactions bridge={bridge} e={e} onReply={onReply} />
      </article>
    </>
  );
});
