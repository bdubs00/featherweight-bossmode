// The rows of a one-on-one thread, in the look of the channel: a message
// with its face, its name, and its clock time; a quiet system line with the
// light of its event; a quiet step line for a tool call; a fold of many
// steps; and the card of a decision. The member conversation and the
// conversation of a run both draw with these rows.

import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Entry, ReactionKind } from '../api/types';
import type { Step, ThreadRow } from '../state/thread';
import { sameSender } from '../state/thread';
import { react } from '../state/actions';
import { useSelect } from '../state/store';
import { dayWords, personName } from '../lib/words';
import type { Tone } from '../lib/presence';
import { attempt } from './notice';
import { InlineMarkdown, Markdown, When } from './common';
import { DecisionCard } from './Decision';
import { Avatar, Button, Chip, IconButton, LineLed, Mark, ReactionChip, TextArea } from './primitives';

/** The light of a system line: green for started, amber for needs you and asked, red for failed, grey for the rest. */
export function eventTone(event: string | undefined): Tone {
  if (event === 'started') return 'green';
  if (event === 'needs-you' || event === 'asked') return 'amber';
  if (event === 'failed') return 'red';
  return 'grey';
}

/**
 * Msg is one message: the face, the name and the clock time, and the text.
 * A pending message is the answer that the model writes now: it has no
 * clock time yet, and aria-busy tells a screen reader that it grows.
 */
export function Msg(p: { face: ComponentChildren; name: string; at?: string; compact?: boolean; label?: string; id?: string; corner?: ComponentChildren; tag?: ComponentChildren; pending?: boolean; children: ComponentChildren }) {
  return (
    <article class={'tmsg' + (p.compact ? ' compact' : '') + (p.pending ? ' pending' : '')} id={p.id} aria-label={p.label} aria-busy={p.pending ? 'true' : undefined}>
      {p.compact ? <span class="tmsg-gutter" /> : p.face}
      <div class="tmsg-body">
        {!p.compact && (
          <header class="tmsg-head">
            <b>{p.name}</b>
            {p.at && <When at={p.at} />}
            {p.tag}
          </header>
        )}
        {p.children}
      </div>
      {p.corner}
    </article>
  );
}

/** Quiet is a quiet line in the middle of the thread: a system line or a step, with an optional light. */
export function Quiet({ tone, at, err, children }: { tone?: Tone; at?: string; err?: boolean; children: ComponentChildren }) {
  return (
    <div class={'tline' + (err ? ' err' : '')}>
      {tone && <LineLed tone={tone} />}
      <span class="tline-text">{children}</span>
      {at && <When at={at} />}
    </div>
  );
}

/** StepText words a step: the verb, and the command as code. */
export function StepText({ step }: { step: Step }) {
  return (
    <>
      {step.text}
      {step.cmd && (
        <>
          {' '}
          <code>{step.cmd}</code>
        </>
      )}
      {step.isError && <span class="tline-err"> Error</span>}
    </>
  );
}

/** Steps folds many steps into one line that opens in place. */
export function StepsFold({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="tfold">
      <div class="tline">
        <button type="button" class="tfold-key" aria-expanded={open} onClick={() => setOpen(!open)}>
          {steps.length === 1 ? 'Took 1 step' : `Took ${steps.length} steps`}
        </button>
        <When at={steps[steps.length - 1].at} />
      </div>
      {open &&
        steps.map((s) => (
          <Quiet at={s.at} err={s.isError}>
            <StepText step={s} />
          </Quiet>
        ))}
    </div>
  );
}

/** HeartNote asks for the optional note of a heart, in place. */
export function HeartNote({ onSave, onCancel }: { onSave: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.focus();
  }, []);
  return (
    <form
      class="theart"
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
      }}
    >
      <label class="field">
        <span class="field-label">What made this useful?</span>
        <TextArea ref={ref} rows={2} maxLength={1024} placeholder="Optional" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="theart-do">
        <Button size="s" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="s" kind="primary" type="submit">
          Heart
        </Button>
      </div>
    </form>
  );
}

const KINDS: ReactionKind[] = ['up', 'down', 'heart'];
const NAMES: Record<ReactionKind, string> = { up: 'Thumb up', down: 'Thumb down', heart: 'Heart' };
const GLYPH = { up: 'thumb-up', down: 'thumb-down', heart: 'heart' } as const;

/**
 * Reactions sits at the top right of an entry: a chip for each reaction
 * with its count, and on hover or focus a key for each reaction that has
 * none yet. A heart asks for its note first.
 */
function Reactions({ bridge, e, onHeart }: { bridge: string; e: Entry; onHeart: () => void }) {
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const [busy, setBusy] = useState(false);
  const r = e.reactions || {};
  const press = async (k: ReactionKind) => {
    if (k === 'heart') return onHeart();
    setBusy(true);
    await attempt(() => react(bridge, e.seq, k));
    setBusy(false);
  };
  return (
    <div class="treact" role="group" aria-label="Reactions">
      {KINDS.map((k) => {
        const who = r[k] || [];
        const mine = !!me && who.includes(me);
        if (who.length > 0) return <ReactionChip kind={k} count={who.length} mine={mine} names={who.map((x) => personName(x)).join(', ')} disabled={busy || mine} onClick={() => press(k)} />;
        return <IconButton class="treact-add" icon={GLYPH[k]} label={NAMES[k]} disabled={busy} onClick={() => press(k)} />;
      })}
    </div>
  );
}

/** reacted reports whether an entry has a reaction, whose chips need the header line of the entry. */
const reacted = (e: Entry): boolean => KINDS.some((k) => ((e.reactions || {})[k] || []).length > 0);

/** EntryMsg draws one entry of a bridge in a thread. */
function EntryMsg({ bridge, e, prev, agentOf, handles, runHref }: { bridge: string; e: Entry; prev?: Entry; agentOf: (handle: string) => string; handles?: string[]; runHref?: string }) {
  const [heart, setHeart] = useState(false);
  if (e.from.kind === 'system' && !e.decision) {
    return (
      <Quiet tone={eventTone(e.event)} at={e.at}>
        <InlineMarkdown text={e.text} />
      </Quiet>
    );
  }
  if (e.decision) {
    const who = (e.from.kind === 'agent' && e.from.handle) || e.text.split(' ')[0] || 'An agent';
    return (
      <Msg face={<Mark agent={agentOf(who)} size={32} />} name={who} at={e.at} id={'t-' + e.seq} label={(e.decision.question ? 'Question from ' : 'Decision for ') + who}>
        <DecisionCard d={e.decision} who={who} />
      </Msg>
    );
  }
  const agent = e.from.kind === 'agent';
  const name = agent ? e.from.handle || 'an agent' : personName(e.from.name, e.from.display);
  const face = agent ? <Mark agent={agentOf(e.from.handle || '')} size={32} /> : <Avatar subject={e.from.name || ''} display={e.from.display} size={32} />;
  return (
    <Msg face={face} name={name} at={e.at} compact={sameSender(prev, e) && !e.pinned && !reacted(e)} id={'t-' + e.seq} tag={e.pinned ? <Chip>pinned</Chip> : undefined} corner={<Reactions bridge={bridge} e={e} onHeart={() => setHeart(true)} />}>
      <Markdown text={e.text} handles={handles} />
      {e.cut && (
        <p class="tmsg-cut">
          Cut at 4 KB. {runHref && <a href={runHref}>Whole text</a>}
        </p>
      )}
      {heart && (
        <HeartNote
          onCancel={() => setHeart(false)}
          onSave={(note) => {
            setHeart(false);
            attempt(() => react(bridge, e.seq, 'heart', note || undefined));
          }}
        />
      )}
    </Msg>
  );
}

export interface ThreadViewProps {
  rows: ThreadRow[];
  bridge: string;
  agentOf: (handle: string) => string;
  handles?: string[];
  runHref?: string;
}

/** ThreadView draws the rows of a direct thread, with a line for each new day. */
export function ThreadView({ rows, bridge, agentOf, handles, runHref }: ThreadViewProps) {
  let lastDay = '';
  let prev: Entry | undefined;
  return (
    <>
      {rows.map((r) => {
        const day = dayWords(r.at);
        const sep = day && day !== lastDay ? day : '';
        if (day) lastDay = day;
        if (sep) prev = undefined;
        let node: ComponentChildren = null;
        if (r.kind === 'entry') {
          node = <EntryMsg bridge={bridge} e={r.entry} prev={prev} agentOf={agentOf} handles={handles} runHref={runHref} />;
          prev = r.entry;
        } else {
          prev = undefined;
          if (r.kind === 'step')
            node = (
              <Quiet at={r.at} err={r.step.isError}>
                <StepText step={r.step} />
              </Quiet>
            );
          else if (r.kind === 'steps') node = <StepsFold steps={r.steps} />;
          else
            node = (
              <Msg face={<Mark agent={agentOf(r.handle)} size={32} />} name={r.handle} pending>
                <Markdown text={r.text} handles={handles} />
              </Msg>
            );
        }
        return (
          <div class="trow" key={r.key}>
            {sep && (
              <p class="tday" role="separator">
                {sep}
              </p>
            )}
            {node}
          </div>
        );
      })}
    </>
  );
}

/**
 * useStickToEnd keeps a scroll box at its end when new rows arrive, unless
 * the person scrolled up to read. It opens at the end.
 */
export function useStickToEnd<T extends HTMLElement>(size: number) {
  const ref = useRef<T>(null);
  const atEnd = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => {
      atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', f, { passive: true });
    return () => el.removeEventListener('scroll', f);
  }, [ref.current]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && atEnd.current) el.scrollTop = el.scrollHeight;
  }, [size]);
  return ref;
}
