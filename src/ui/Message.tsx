// One entry of the channel: a message of a person or an agent, a quiet
// system line, or a card that waits for a decision. Reactions sit under
// each entry on hover and on focus.

import { memo } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Entry, Member, ReactionKind } from '../api/types';
import { useSelect } from '../state/store';
import { dayWords, excerpt, personName, senderName } from '../lib/words';
import { decide, react } from '../state/actions';
import { attempt } from './notice';
import { Avatar, Face, Markdown, When } from './common';
import { DecisionCard } from './Decision';
import { Icon, type IconName } from './icons';

/** plain drops the marks of Markdown from a text, for a label. */
const plain = (t: string) => t.replace(/```[\s\S]*?```/g, ' code ').replace(/[*_`#>|\[\]]/g, '');

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

const SYS_ICON: Record<string, IconName> = {
  opened: 'people',
  closed: 'stop',
  reopened: 'people',
  started: 'play',
  joined: 'plus',
  finished: 'check',
  'needs-you': 'hand',
  asked: 'hand',
  decided: 'check',
  failed: 'cross',
  asleep: 'moon',
  fired: 'slash',
  canceled: 'stop',
  muted: 'slash',
  task: 'edit',
  cap: 'hand',
  changed: 'gear',
};

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
      <label>
        <span>What made this useful? The wiki keeps the heart with your note. The note is optional.</span>
        <textarea ref={ref} maxLength={1024} value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
      </label>
      <div class="do">
        <button type="button" class="btn small" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" class="btn small primary">
          <Icon name="heart" /> Save heart
        </button>
      </div>
    </form>
  );
}

/** Reactions holds the counts and the bar of thumb up, thumb down, and heart. */
function Reactions({ bridge, e, onReply }: { bridge: string; e: Entry; onReply?: (seq: number) => void }) {
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
  return (
    <>
      {shown.length > 0 && (
        <div class="counts">
          {shown.map((k) => (
            <span class={'count' + (mineOf(k) ? ' mine' : '')} title={(r[k] || []).map((x) => personName(x)).join(', ')}>
              <Icon name={k} />
              <span>{(r[k] || []).length}</span>
              <span class="sr">{' ' + NAMES[k] + (mineOf(k) ? ', yours among them' : '')}</span>
            </span>
          ))}
        </div>
      )}
      <div class={'reacts' + (heart ? ' open' : '')} role="group" aria-label="Reactions">
        {thumbs && (
          <>
            <button type="button" class={'icon-btn' + (deciding ? ' decides' : '')} aria-label={label('up')} title={label('up')} aria-pressed={deciding ? undefined : mineOf('up')} disabled={busy} onClick={() => press('up')}>
              <Icon name="up" />
            </button>
            <button type="button" class={'icon-btn' + (deciding ? ' decides' : '')} aria-label={label('down')} title={label('down')} aria-pressed={deciding ? undefined : mineOf('down')} disabled={busy} onClick={() => press('down')}>
              <Icon name="down" />
            </button>
          </>
        )}
        <button type="button" class="icon-btn" aria-label="Heart" title="Heart: keep this in the wiki" aria-pressed={mineOf('heart')} aria-expanded={heart} disabled={busy} onClick={() => setHeart(!heart)}>
          <Icon name="heart" />
        </button>
        {onReply && e.from.kind !== 'system' && (
          <button type="button" class="icon-btn" aria-label={'Reply to ' + senderName(e.from)} title="Reply" onClick={() => onReply(e.seq)}>
            <Icon name="reply" />
          </button>
        )}
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

/** ReplyChip names the entry that a message answers, and jumps to it. */
function ReplyChip({ bridge, seq }: { bridge: string; seq: number }) {
  const target = useSelect((s) => (s.channels[bridge] ? s.channels[bridge].bySeq[seq] : undefined));
  const jump = () => {
    const el = document.getElementById('entry-' + bridge + '-' + seq);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.focus();
    }
  };
  return (
    <button type="button" class="reply-chip" onClick={jump} disabled={!target} title={target ? 'Go to the message' : 'Load earlier messages to see it'}>
      <Icon name="reply" />
      <span>{target ? senderName(target.from) + ': ' + excerpt(target.text, 70) : 'An earlier message'}</span>
    </button>
  );
}

export interface EntryProps {
  bridge: string;
  seq: number;
  prevSeq: number;
  onReply?: (seq: number) => void;
}

/** EntryRow draws one entry. It reads its own entry, so a change redraws only it. */
export const EntryRow = memo(function EntryRow({ bridge, seq, prevSeq, onReply }: EntryProps) {
  const e = useSelect((s) => (s.channels[bridge] ? s.channels[bridge].bySeq[seq] : undefined));
  const prev = useSelect((s) => (prevSeq && s.channels[bridge] ? s.channels[bridge].bySeq[prevSeq] : undefined));
  // A row reads strings of the roster, never the roster itself, so a change
  // of presence redraws the roster row and no message.
  const handles = useSelect((s) => (s.rosters[bridge] ? s.rosters[bridge].order : undefined));
  const decisionRun = e && e.decision ? e.decision.run : '';
  const runHandle = useSelect((s) => (decisionRun ? handleOfRun(s.rosters[bridge] ? s.rosters[bridge].byHandle : undefined, decisionRun) : ''));
  const handle = e && e.from.kind === 'agent' ? e.from.handle || '' : runHandle;
  const agent = useSelect((s) => (handle ? agentOf(s.rosters[bridge] ? s.rosters[bridge].byHandle : undefined, handle) : ''));
  if (!e) return null;
  const day = !prev || dayWords(prev.at) !== dayWords(e.at) ? dayWords(e.at) : '';
  const id = 'entry-' + bridge + '-' + seq;
  if (e.from.kind === 'system' && !e.decision) {
    return (
      <>
        {day && <p class="day" role="separator">{day}</p>}
        <div class={'sys ' + (e.event || '')} id={id} data-item data-seq={seq}>
          <p>
            <Icon name={SYS_ICON[e.event || ''] || 'dot'} />
            <span>{e.text}</span> <When at={e.at} />
          </p>
          {e.mirrors && <Reactions bridge={bridge} e={e} />}
        </div>
      </>
    );
  }
  if (e.from.kind === 'system' && e.decision) {
    const who = runHandle || e.text.split(' ')[0] || 'An agent';
    return (
      <>
        {day && <p class="day" role="separator">{day}</p>}
        <article class={'msg card' + (e.decision.state === 'pending' ? ' waiting' : '')} id={id} data-item data-seq={seq} aria-label={(e.decision.question ? 'Question from ' : 'Permission for ') + who}>
          <Face agent={agent || who.replace(/-\d+$/, '')} size={32} />
          <div class="body">
            <header>
              <b>{who}</b>
              <When at={e.at} />
            </header>
            <DecisionCard d={e.decision} who={who} />
            <Reactions bridge={bridge} e={e} />
          </div>
        </article>
      </>
    );
  }
  const name = senderName(e.from);
  const sameAsPrev =
    !!prev && !day && !e.replyTo && prev.from.kind === e.from.kind && !prev.decision && prev.from.kind !== 'system' && senderName(prev.from) === name && new Date(e.at).getTime() - new Date(prev.at).getTime() < 5 * 60_000;
  const mine = e.from.kind === 'person';
  return (
    <>
      {day && <p class="day" role="separator">{day}</p>}
      <article class={'msg' + (sameAsPrev ? ' compact' : '') + (mine ? ' by-person' : ' by-agent')} id={id} data-item data-seq={seq} data-reply="1" aria-label={name + ', ' + excerpt(plain(e.text), 60)}>
        {sameAsPrev ? <span class="gutter" /> : e.from.kind === 'agent' ? <Face agent={agent} size={32} /> : <Avatar subject={e.from.name || ''} display={e.from.display} size={32} />}
        <div class="body">
          {!sameAsPrev && (
            <header>
              <b>{name}</b>
              {e.from.kind === 'agent' && agent !== e.from.handle && <span class="agent-name">{agent}</span>}
              <When at={e.at} />
            </header>
          )}
          {e.replyTo ? <ReplyChip bridge={bridge} seq={e.replyTo} /> : null}
          {e.to && e.to.length > 0 && <p class="to">to {e.to.map((h) => '@' + h).join(', ')}</p>}
          <Markdown text={e.text} handles={handles} />
          {e.cut && <p class="cut">The channel holds the first 4 KB. The run holds the whole text.</p>}
          <Reactions bridge={bridge} e={e} onReply={onReply} />
        </div>
      </article>
    </>
  );
});
