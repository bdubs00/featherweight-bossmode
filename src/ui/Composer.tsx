// The composer: a text box with @ completion over the roster, a slash menu
// of commands in a one-on-one conversation, a reply chip, and Cmd or
// Ctrl+Enter to send. A draft stays in sessionStorage, so a move to another
// screen, a reload, or a sign-in keeps it.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { applyCompletion, completionAt, mentionsIn, slashAt, type Completion } from '../lib/mention';
import { list } from '../lib/words';
import { Face } from './common';
import { Glyph } from './icons';
import { Button } from './primitives';

const draftKey = (k: string) => 'fw.bossmode.draft.' + k;

function readDraft(k: string): string {
  try {
    return sessionStorage.getItem(draftKey(k)) || '';
  } catch {
    return '';
  }
}

function writeDraft(k: string, v: string): void {
  try {
    if (v) sessionStorage.setItem(draftKey(k), v);
    else sessionStorage.removeItem(draftKey(k));
  } catch {
    // No storage: the draft lives in memory only.
  }
}

export interface ComposerMember {
  handle: string;
  agent: string;
  task: string;
}

export interface ComposerProps {
  /** The key of the draft, such as the bridge id. */
  draft: string;
  label: string;
  placeholder: string;
  members?: ComposerMember[];
  /** The entry that the message answers. A reply to an agent addresses it, unless the text names others. */
  reply?: { seq: number; who: string; text: string; handle?: string } | null;
  onClearReply?: () => void;
  disabled?: string;
  /** onSend sends the text. It resolves true when the text went out. */
  onSend: (text: string, to: string[]) => Promise<boolean>;
  /**
   * The slash commands of a one-on-one conversation, such as the skills of
   * the agent. A / at the start of the text opens the menu.
   */
  commands?: { name: string; description: string }[];
}

export function Composer(p: ComposerProps) {
  const [text, setText] = useState(() => readDraft(p.draft));
  const [comp, setComp] = useState<Completion | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const handles = useMemo(() => (p.members || []).map((m) => m.handle), [p.members]);
  const byHandle = useMemo(() => new Map((p.members || []).map((m) => [m.handle, m])), [p.members]);
  const commands = useMemo(() => (p.commands || []).map((c) => c.name), [p.commands]);
  const byCommand = useMemo(() => new Map((p.commands || []).map((c) => [c.name, c])), [p.commands]);
  /** completeAt opens the slash menu or the @ completion at the caret. */
  const completeAt = (v: string, caret: number): Completion | null => (commands.length ? slashAt(v, caret, commands) : null) || (handles.length ? completionAt(v, caret, handles) : null);

  // Another draft key, such as another bridge, reads its own draft.
  useEffect(() => {
    setText(readDraft(p.draft));
    setComp(null);
  }, [p.draft]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.3) + 'px';
  }, [text]);

  // A reply moves the focus to the box.
  useEffect(() => {
    if (p.reply && box.current) box.current.focus();
  }, [p.reply && p.reply.seq]);

  const named = mentionsIn(text, handles);
  const to = named.length ? named : p.reply && p.reply.handle && handles.includes(p.reply.handle) ? [p.reply.handle] : [];

  const update = (v: string, caret: number) => {
    setText(v);
    writeDraft(p.draft, v);
    setComp(completeAt(v, caret));
    setPick(0);
  };

  const choose = (h: string) => {
    if (!comp || !box.current) return;
    const r = applyCompletion(text, comp, h);
    setText(r.text);
    writeDraft(p.draft, r.text);
    setComp(null);
    const el = box.current;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.caret, r.caret);
    });
  };

  const send = async () => {
    const t = text.trim();
    if (!t || busy || p.disabled) return;
    setBusy(true);
    const ok = await p.onSend(t, to);
    setBusy(false);
    if (ok) {
      setText('');
      writeDraft(p.draft, '');
      setComp(null);
      if (box.current) box.current.focus();
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (comp) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPick((pick + 1) % comp.matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPick((pick - 1 + comp.matches.length) % comp.matches.length);
        return;
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault();
        choose(comp.matches[pick]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setComp(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Escape' && p.reply && p.onClearReply) {
      e.preventDefault();
      e.stopPropagation();
      p.onClearReply();
    }
  };

  const listId = 'complete-' + p.draft;
  const hint = p.members ? (to.length ? 'To ' + list(to.map((h) => '@' + h)) : 'To every active member') : '';
  return (
    <form
      class="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div class={'box' + (p.disabled ? ' off' : '')}>
        {p.reply && (
          <div class="replying slidein">
            <span title={p.reply.text}>
              <span class="muted">Replying to</span> {p.reply.who}
              <button type="button" class="chip-x" aria-label="Stop replying" onClick={p.onClearReply}>
                <Glyph name="close" size={12} />
              </button>
            </span>
          </div>
        )}
        {comp && (
          <ul class="complete" id={listId} role="listbox" aria-label={comp.sigil === '/' ? 'Commands' : 'Members'}>
            {comp.matches.map((h, i) => {
              const m = comp.sigil === '/' ? undefined : byHandle.get(h);
              const c = comp.sigil === '/' ? byCommand.get(h) : undefined;
              return (
                <li
                  id={listId + '-' + i}
                  role="option"
                  aria-selected={i === pick}
                  class={i === pick ? 'on' : ''}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(h);
                  }}
                >
                  {m && <Face agent={m.agent} size={20} />}
                  <b>
                    {comp.sigil || '@'}
                    {h}
                  </b>
                  {m && <small>{m.task}</small>}
                  {c && <small>{c.description}</small>}
                </li>
              );
            })}
          </ul>
        )}
        <textarea
          ref={box}
          id="composer"
          rows={1}
          aria-label={p.label}
          placeholder={p.disabled || (p.reply ? 'Message ' + p.reply.who : p.placeholder)}
          disabled={!!p.disabled}
          value={text}
          aria-autocomplete={p.members ? 'list' : undefined}
          aria-controls={comp ? listId : undefined}
          aria-activedescendant={comp ? listId + '-' + pick : undefined}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            update(el.value, el.selectionStart || 0);
          }}
          onKeyDown={onKey}
          onClick={(e) => {
            const el = e.target as HTMLTextAreaElement;
            setComp(completeAt(el.value, el.selectionStart || 0));
          }}
          onBlur={() => setTimeout(() => setComp(null), 120)}
        />
        <div class="tools">
          <span class="hint">{hint}</span>
          <span class="keys" aria-hidden="true">
            {navigator.platform && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Enter
          </span>
          <Button type="submit" kind="primary" class="send" disabled={busy || !text.trim() || !!p.disabled}>
            Send
          </Button>
        </div>
      </div>
    </form>
  );
}
