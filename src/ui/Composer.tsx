// The composer: a text box with @ completion over the roster, a slash menu
// of commands in a one-on-one conversation, a reply chip that slides in,
// the address line, and Cmd or Ctrl+Enter to send, with the name of that
// key beside Send, except on a touch screen. The argument hint of a
// command has a slot of its own: in the menu beside the name, and in the
// address line while the person types the arguments. A draft stays in
// sessionStorage, so a move to another screen, a reload, or a sign-in keeps
// it. A composer with attach takes files too, from the key Attach files, a
// drop, or a paste, and shows each one with its size and the key Remove.
// The files of a draft stay in the memory of the tab, so a move to another
// screen keeps them and a reload drops them.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Attachment } from '../api/types';
import { encodeFiles, filesProblem } from '../lib/attachments';
import { applyCompletion, completionAt, mentionsIn, slashAt, type Completion } from '../lib/mention';
import { list, sizeText } from '../lib/words';
import { Glyph } from './icons';
import { Button, IconButton, Mark } from './primitives';

const draftKey = (k: string) => 'fw.bossmode.draft.' + k;

/** The files of each draft, by its key. sessionStorage keeps no bytes. */
const fileDrafts = new Map<string, File[]>();

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
  /** attach lets the person add files to the message. */
  attach?: boolean;
  /**
   * onSend sends the text and the files, as base64. It resolves true when
   * the message went out, and the composer then clears the draft. On
   * false, the text and the files stay for another try.
   */
  onSend: (text: string, to: string[], files: Attachment[]) => Promise<boolean>;
  /**
   * The slash commands of a one-on-one conversation, such as the skills of
   * the agent, each with the hint of its arguments, such as <module>. A /
   * at the start of the text opens the menu.
   */
  commands?: ComposerCommand[];
}

/** A slash command of the composer. */
export interface ComposerCommand {
  name: string;
  description: string;
  /** The argument hint of the front matter of the skill, such as <module>. */
  hint?: string;
}

/** argHintOf is the command whose arguments the person types now: the text is the command and nothing more yet. */
export function argHintOf(text: string, commands: Map<string, ComposerCommand>): ComposerCommand | null {
  const m = /^\/([A-Za-z0-9._/-]+)\s*$/.exec(text);
  const c = m ? commands.get(m[1]) : undefined;
  return c && c.hint ? c : null;
}

/** addressWords is the address line of a bridge composer: "To everyone", or "To a and b". */
export function addressWords(to: string[]): string {
  return to.length ? 'To ' + list(to) : 'To everyone';
}

/** platformName is the platform of the browser: the hint of its user agent where it gives one, such as macOS, else navigator.platform. */
function platformName(): string {
  if (typeof navigator === 'undefined') return '';
  const hint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return (hint && hint.platform) || navigator.platform || '';
}

/** keyWords names the key that sends: ⌘+Enter on a Mac, Ctrl+Enter elsewhere. */
export function keyWords(platform = platformName()): string {
  return (/Mac|iPhone|iPad|iPod/i.test(platform || '') ? '⌘' : 'Ctrl') + '+Enter';
}

const COARSE = '(pointer: coarse)';

/** coarseNow reports whether the main pointer of the device is coarse, as a finger on a touch screen is. */
function coarseNow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(COARSE).matches;
}

/** useCoarse follows whether the main pointer is coarse. A touch screen has no Ctrl or Cmd key, so the composer names no key there. */
export function useCoarse(): boolean {
  const [coarse, setCoarse] = useState(coarseNow);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const q = window.matchMedia(COARSE);
    const on = () => setCoarse(q.matches);
    on();
    if (typeof q.addEventListener !== 'function') return;
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return coarse;
}

export function Composer(p: ComposerProps) {
  const [text, setText] = useState(() => readDraft(p.draft));
  const [files, setFiles] = useState<File[]>(() => fileDrafts.get(p.draft) || []);
  const [problem, setProblem] = useState('');
  const [drop, setDrop] = useState(false);
  const [comp, setComp] = useState<Completion | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const draft = useRef(p.draft);
  draft.current = p.draft;
  const coarse = useCoarse();
  const handles = useMemo(() => (p.members || []).map((m) => m.handle), [p.members]);
  const byHandle = useMemo(() => new Map((p.members || []).map((m) => [m.handle, m])), [p.members]);
  const commands = useMemo(() => (p.commands || []).map((c) => c.name), [p.commands]);
  const byCommand = useMemo(() => new Map((p.commands || []).map((c) => [c.name, c])), [p.commands]);
  /** completeAt opens the slash menu or the @ completion at the caret. */
  const completeAt = (v: string, caret: number): Completion | null => (commands.length ? slashAt(v, caret, commands) : null) || (handles.length ? completionAt(v, caret, handles) : null);

  // Another draft key, such as another bridge, reads its own draft.
  useEffect(() => {
    setText(readDraft(p.draft));
    setFiles(fileDrafts.get(p.draft) || []);
    setProblem('');
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

  /** keepFiles sets the files of the draft key. */
  const keepFiles = (key: string, next: File[]) => {
    if (next.length) fileDrafts.set(key, next);
    else fileDrafts.delete(key);
    if (draft.current === key) setFiles(next);
  };

  /** addFiles takes picked, dropped, or pasted files, unless the message would pass a limit. */
  const addFiles = (picked: File[]) => {
    if (!p.attach || busy || p.disabled || !picked.length) return;
    const next = [...files, ...picked];
    const why = filesProblem(next);
    setProblem(why);
    if (!why) keepFiles(p.draft, next);
  };

  const send = async () => {
    const t = text.trim();
    if ((!t && !files.length) || busy || p.disabled) return;
    const key = p.draft;
    setBusy(true);
    setProblem('');
    let ok = false;
    try {
      ok = await p.onSend(t, to, files.length ? await encodeFiles(files) : []);
    } catch (e) {
      setProblem(e instanceof Error && e.message ? e.message : 'The page cannot read the files. Pick them again.');
    }
    setBusy(false);
    if (ok) {
      writeDraft(key, '');
      keepFiles(key, []);
      if (draft.current === key) {
        setText('');
        setComp(null);
        if (box.current) box.current.focus();
      }
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
  const hint = p.members ? addressWords(to) : '';
  const typing = argHintOf(text, byCommand);
  // A drag of files over the composer shows where they land.
  const dragFiles = (e: DragEvent) => !!p.attach && !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  return (
    <form
      class="composer"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      onDragOver={(e) => {
        if (!dragFiles(e)) return;
        e.preventDefault();
        setDrop(!busy && !p.disabled);
      }}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDrop(false);
      }}
      onDrop={(e) => {
        if (!p.attach) return;
        e.preventDefault();
        setDrop(false);
        addFiles(Array.from((e.dataTransfer && e.dataTransfer.files) || []));
      }}
    >
      <div class={'box' + (p.disabled ? ' off' : '') + (drop ? ' drop' : '')}>
        {p.reply && (
          <div class="replying slidein" key={p.reply.seq}>
            <span class="reply-to" title={p.reply.text}>
              <span class="muted">Replying to</span> {p.reply.who}
              <button type="button" class="chip-x" aria-label="Stop replying" title="Stop replying" onClick={p.onClearReply}>
                <Glyph name="close" size={12} />
              </button>
            </span>
          </div>
        )}
        {files.length > 0 && (
          <ul class="attached" aria-label="Files to send">
            {files.map((f, i) => (
              <li>
                <span class="attached-name" title={f.name}>
                  {f.name}
                </span>
                <span class="attached-size">{sizeText(f.size)}</span>
                <button
                  type="button"
                  class="chip-x"
                  aria-label={'Remove ' + f.name}
                  title={'Remove ' + f.name}
                  disabled={busy}
                  onClick={() => {
                    setProblem('');
                    keepFiles(p.draft, files.filter((_, n) => n !== i));
                  }}
                >
                  <Glyph name="close" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {problem && (
          <p class="field-error attach-problem" role="alert">
            {problem}
          </p>
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
                  {m && <Mark agent={m.agent} size={20} />}
                  <b>
                    {comp.sigil || '@'}
                    {h}
                  </b>
                  {c && c.hint && <code class="arg-hint">{c.hint}</code>}
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
          onPaste={(e) => {
            const pasted = Array.from((e.clipboardData && e.clipboardData.files) || []);
            if (!p.attach || !pasted.length) return;
            e.preventDefault();
            addFiles(pasted);
          }}
          onClick={(e) => {
            const el = e.target as HTMLTextAreaElement;
            setComp(completeAt(el.value, el.selectionStart || 0));
          }}
          onBlur={() => setTimeout(() => setComp(null), 120)}
        />
        <div class="tools">
          {p.attach && (
            <>
              <IconButton icon="clip" label="Attach files" class="attach" disabled={busy || !!p.disabled} onClick={() => picker.current && picker.current.click()} />
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const el = e.target as HTMLInputElement;
                  addFiles(Array.from(el.files || []));
                  el.value = '';
                }}
              />
            </>
          )}
          <span class="address">{typing ? <code class="arg-hint">{'/' + typing.name + ' ' + typing.hint}</code> : hint}</span>
          {!coarse && (
            <span class="keys" aria-hidden="true">
              {keyWords()}
            </span>
          )}
          <Button type="submit" kind="primary" class="send" disabled={busy || (!text.trim() && !files.length) || !!p.disabled}>
            Send
          </Button>
        </div>
      </div>
    </form>
  );
}
