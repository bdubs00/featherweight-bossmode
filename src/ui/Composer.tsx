// The composer: a text box with @ completion over the roster, a reply chip,
// and Cmd or Ctrl+Enter to send. A draft stays in sessionStorage, so a move
// to another screen, a reload, or a sign-in keeps it.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Attachment } from '../api/types';
import { checkFiles, encodeFiles, fileSize } from '../lib/attachments';
import { applyCompletion, completionAt, mentionsIn, type Completion } from '../lib/mention';
import { excerpt, list } from '../lib/words';
import { Face } from './common';
import { Icon } from './icons';

const draftKey = (k: string) => 'fw.bossmode.draft.' + k;
// Files stay in this tab until sent or removed. A reload releases them.
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
  /** onSend resolves true when the message and its files went out. */
  onSend: (text: string, to: string[], files: Attachment[]) => Promise<boolean>;
}

export function Composer(p: ComposerProps) {
  return <DraftComposer key={p.draft} {...p} />;
}

function DraftComposer(p: ComposerProps) {
  const [text, setText] = useState(() => readDraft(p.draft));
  const [files, setFiles] = useState<File[]>(() => fileDrafts.get(p.draft) || []);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [comp, setComp] = useState<Completion | null>(null);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const handles = useMemo(() => (p.members || []).map((m) => m.handle), [p.members]);
  const byHandle = useMemo(() => new Map((p.members || []).map((m) => [m.handle, m])), [p.members]);

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
    const c = handles.length ? completionAt(v, caret, handles) : null;
    setComp(c);
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
    if ((!t && files.length === 0) || sending.current || p.disabled) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const ok = await p.onSend(t, to, await encodeFiles(files));
      if (ok) {
        setText('');
        writeDraft(p.draft, '');
        setFiles([]);
        fileDrafts.delete(p.draft);
        setComp(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The message did not send. Try again.');
    } finally {
      sending.current = false;
      setBusy(false);
      requestAnimationFrame(() => box.current?.focus());
    }
  };

  const addFiles = (picked: File[]) => {
    if (sending.current || p.disabled || !picked.length) return;
    try {
      const next = [...files, ...picked];
      checkFiles(next);
      setFiles(next);
      fileDrafts.set(p.draft, next);
      setError('');
    } catch (e) {
      setError((e as Error).message);
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
      class={'composer' + (dragging ? ' dragging' : '')}
      aria-busy={busy}
      onDragOver={(e) => {
        if (!e.dataTransfer?.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = busy || p.disabled ? 'none' : 'copy';
        setDragging(!busy && !p.disabled);
      }}
      onDragLeave={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer?.files || []));
      }}
      onPaste={(e) => {
        const pasted = Array.from(e.clipboardData?.files || []);
        if (pasted.length) {
          e.preventDefault();
          addFiles(pasted);
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {p.reply && (
        <div class="replying">
          <Icon name="reply" />
          <span>
            Reply to <b>{p.reply.who}</b>: {excerpt(p.reply.text, 80)}
          </span>
          <button type="button" class="icon-btn" aria-label="Cancel the reply" disabled={busy} onClick={p.onClearReply}>
            <Icon name="close" />
          </button>
        </div>
      )}
      <div class={'box' + (p.disabled ? ' off' : '')}>
        <input ref={picker} type="file" multiple hidden disabled={busy || !!p.disabled} aria-label="Choose files" onChange={(e) => {
          addFiles(Array.from(e.currentTarget.files || []));
          e.currentTarget.value = '';
        }} />
        {files.length > 0 && <ul class="attachments" aria-label="Files to send">
          {files.map((file, i) => <li key={i}>
            <Icon name="file" /><span class="filename">{file.name}</span><small>{fileSize(file.size)}</small>
            <button type="button" class="icon-btn" aria-label={'Remove ' + file.name} disabled={busy} onClick={() => {
              const next = files.filter((_, n) => n !== i);
              setFiles(next);
              if (next.length) fileDrafts.set(p.draft, next);
              else fileDrafts.delete(p.draft);
              setError('');
            }}><Icon name="close" /></button>
          </li>)}
        </ul>}
        {comp && (
          <ul class="complete" id={listId} role="listbox" aria-label="Members">
            {comp.matches.map((h, i) => {
              const m = byHandle.get(h);
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
                  <b>@{h}</b>
                  {m && <small>{m.task}</small>}
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
          placeholder={p.disabled || p.placeholder}
          disabled={busy || !!p.disabled}
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
            setComp(handles.length ? completionAt(el.value, el.selectionStart || 0, handles) : null);
          }}
          onBlur={() => setTimeout(() => setComp(null), 120)}
        />
        <div class="tools">
          <button type="button" class="btn small attach" disabled={busy || !!p.disabled} onClick={() => picker.current?.click()}>
            <Icon name="file" /><span>Attach files</span>
          </button>
          <span class="hint">{hint}</span>
          <span class="keys" aria-hidden="true">
            {navigator.platform && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'}+Enter
          </span>
          <button type="submit" class="btn primary send" disabled={busy || (!text.trim() && !files.length) || !!p.disabled} aria-label="Send">
            <Icon name="send" />
            <span>{busy ? 'Sending…' : 'Send'}</span>
          </button>
        </div>
        <p class="attachment-hint">Drop or paste files here · 20 files, 32 MiB total. Agent workspace limits also apply.{files.length > 0 ? ' Files stay in this tab until sent; a reload clears them.' : ''}</p>
        {error && <p class="err" role="alert">{error}</p>}
      </div>
    </form>
  );
}
