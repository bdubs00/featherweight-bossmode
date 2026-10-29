// The rows of a one-on-one thread, in the look of the channel: a message
// with its face, its name, and its clock time; a quiet system line with the
// light of its event; a quiet step line for a tool call; a fold of many
// steps; and the card of a decision. The member conversation and the
// conversation of a run both draw with these rows.

import type { ComponentChildren } from 'preact';
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { LineText } from './linetext';
import type { Entry, ReactionKind } from '../api/types';
import type { Step, ThreadRow } from '../state/thread';
import { sameSender } from '../state/thread';
import { react } from '../state/actions';
import { useSelect } from '../state/store';
import { dayWords, personName } from '../lib/words';
import { lineWords, napWords, whoName } from '../lib/lines';
import { hrefOf } from '../lib/route';
import type { Tone } from '../lib/presence';
import { attempt } from './notice';
import { smooth } from './keys';
import { useWhole } from '../state/whole';
import { CutEnd } from './Whole';
import { AttachedFiles } from './AttachedFiles';
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
  const words = useContext(LineText);
  return (
    <article class={'tmsg' + (p.compact ? ' compact' : '') + (p.pending ? ' pending' : '')} id={p.id} aria-label={p.label} aria-busy={p.pending ? 'true' : undefined}>
      {p.compact ? <span class="tmsg-gutter" /> : p.face}
      <div class="tmsg-body">
        {!p.compact && (
          <header class="tmsg-head">
            <b>{words(p.name)}</b>
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

/** Quiet is a quiet line in the middle of the thread: a system line or a step, with an optional light. title is the tooltip of its text. */
export function Quiet({ tone, at, err, title, children }: { tone?: Tone; at?: string; err?: boolean; title?: string; children: ComponentChildren }) {
  const words = useContext(LineText);
  return (
    <div class={'tline' + (err ? ' err' : '')}>
      {tone && <LineLed tone={tone} />}
      <span class="tline-text" title={title}>
        {typeof children === 'string' ? words(children) : children}
      </span>
      {at && <When at={at} />}
    </div>
  );
}

/** BridgeRef links a bridge by its id, with the title that the page knows, else the title that the call gave. */
export function BridgeRef({ id, title }: { id: string; title?: string }) {
  const known = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].title : ''));
  return <a href={hrefOf({ place: 'bridge', id, pane: 'none' })}>{known || title || id}</a>;
}

/**
 * StepText words a step: the verb, then the command or the path as code,
 * or the bridge as a link with its title. A failed step that its words do
 * not already say adds Error.
 */
export function StepText({ step }: { step: Step }) {
  const words = useContext(LineText);
  const path = step.path ? <code>{step.path}</code> : null;
  return (
    <>
      {words(step.text)}
      {step.cmd && (
        <>
          {' '}
          <code>{step.cmd}</code>
        </>
      )}
      {step.bridge ? (
        <>
          {' '}
          <BridgeRef id={step.bridge} title={step.target} />
        </>
      ) : path ? (
        <>
          {' '}
          {step.href ? <a href={step.href}>{path}</a> : path}
        </>
      ) : step.target ? (
        ' ' + step.target
      ) : null}
      {step.isError && !step.worded && <span class="tline-err"> Error</span>}
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
        // Ctrl+Enter, or Cmd+Enter on a Mac, saves the heart, as it sends in a composer.
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
 * none yet. A heart asks for its note first. A press on a chip of the
 * person's own reaction takes it back: the server removes a reaction that
 * the same person sends again, and a thumb up and a thumb down of one
 * person exclude each other.
 */
function Reactions({ bridge, e, onHeart }: { bridge: string; e: Entry; onHeart: () => void }) {
  const me = useSelect((s) => (s.me && s.me.principal ? s.me.principal.subject : ''));
  const [busy, setBusy] = useState(false);
  const r = e.reactions || {};
  const press = async (k: ReactionKind, mine = false) => {
    if (k === 'heart' && !mine) return onHeart();
    setBusy(true);
    await attempt(() => react(bridge, e.seq, k));
    setBusy(false);
  };
  return (
    <div class="treact" role="group" aria-label="Reactions">
      {KINDS.map((k) => {
        const who = r[k] || [];
        const mine = !!me && who.includes(me);
        if (who.length > 0) return <ReactionChip kind={k} count={who.length} mine={mine} names={who.map((x) => personName(x)).join(', ')} disabled={busy} onClick={() => press(k, mine)} />;
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
  const me = useSelect((s) => (s.me ? s.me.principal : null));
  // The whole text of a long entry, once the person asked for it with Show all.
  const whole = useWhole(bridge, e.cut ? e.seq : 0);
  if (e.from.kind === 'system' && !e.decision) {
    // The page words the line from its event, and keeps the sentence of the backend for the tooltip.
    const w = lineWords(e, me);
    const page = w.page || e.page;
    return (
      <Quiet tone={eventTone(e.event)} at={e.at} title={w.title}>
        {w.raw ? <InlineMarkdown text={w.text} /> : w.text}
        {page && (
          <>
            {' '}
            <a class="sys-page" href={hrefOf({ place: 'pages', path: page, mode: 'read' })}>
              {page}
            </a>
          </>
        )}
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
  // The author line of a message of the person who reads the page says You.
  const name = agent ? e.from.handle || 'an agent' : whoName(e.from.name, me, e.from.display);
  const face = agent ? <Mark agent={agentOf(e.from.handle || '')} size={32} /> : <Avatar subject={e.from.name || ''} display={e.from.display} size={32} />;
  return (
    <Msg face={face} name={name} at={e.at} compact={sameSender(prev, e) && !e.pinned && !reacted(e)} id={'t-' + e.seq} tag={e.pinned ? <Chip>pinned</Chip> : undefined} corner={<Reactions bridge={bridge} e={e} onHeart={() => setHeart(true)} />}>
      <Markdown text={whole && !whole.cut ? whole.text : e.text} handles={handles} refs />
      {e.cut && <CutEnd bridge={bridge} seq={e.seq} whole={whole} runHref={runHref} class="tmsg-cut" />}
      <AttachedFiles files={e.files} />
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
          else if (r.kind === 'naps')
            node = (
              <Quiet tone="grey" at={r.at}>
                {napWords(r.handle, r.pairs)}
              </Quiet>
            );
          else
            node = (
              <Msg face={<Mark agent={agentOf(r.handle)} size={32} />} name={r.handle} pending>
                <Markdown text={r.text} handles={handles} refs />
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

/** nearEnd reports whether a scroll box shows its end, or lies within one screen of it. */
export function nearEnd(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= Math.max(80, el.clientHeight);
}

/**
 * useFollow keeps a conversation at its end while the person reads at the
 * end or within a screen of it: when a new entry arrives, and when an entry
 * grows after it arrived, as a card that reads its plan. A card that needs
 * the person thus comes into view. Where the person scrolled up to read,
 * the box stays, and below says that something new waits under the fold.
 * end names the newest content, such as the seq of the last item: it
 * changes for a new entry and never for an earlier page.
 */
export function useFollow<T extends HTMLElement>(end: string) {
  const ref = useRef<T>(null);
  const near = useRef(true);
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = () => {
      near.current = nearEnd(el);
      if (near.current) setBelow(false);
    };
    el.addEventListener('scroll', f, { passive: true });
    return () => el.removeEventListener('scroll', f);
  }, [ref.current]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (near.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c);
    return () => ro.disconnect();
  }, [ref.current, end]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (near.current) el.scrollTop = el.scrollHeight;
    else setBelow(true);
  }, [end]);
  const toEnd = () => {
    const el = ref.current;
    near.current = true;
    setBelow(false);
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth() });
  };
  return { ref, below, toEnd };
}

/** NewBelow is the key at the foot of a list that takes the person to what arrived below the fold. lift raises it above the typing line of a channel. */
export function NewBelow({ onClick, lift }: { onClick: () => void; lift?: boolean }) {
  return (
    <button type="button" class={'fresh' + (lift ? ' lifted' : '')} onClick={onClick}>
      New below
    </button>
  );
}

/**
 * FollowBox is the scroll box of a conversation that follows its end
 * (useFollow), with New below at its foot while something new waits under
 * the fold. foot follows the thread inside the box, such as the typing
 * line, which sticks to the foot of the box; New below then sits above it.
 */
export function FollowBox({ end, foot, children }: { end: string; foot?: ComponentChildren; children: ComponentChildren }) {
  const f = useFollow<HTMLDivElement>(end);
  return (
    <div class={'follow' + (foot ? ' footed' : '')}>
      <div class="scroll thread-scroll" ref={f.ref}>
        {children}
        {foot}
      </div>
      {f.below && <NewBelow onClick={f.toEnd} />}
    </div>
  );
}
