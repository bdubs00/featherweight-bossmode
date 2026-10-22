// Add skill: the chooser of the four avenues of a new skill, from a
// marketplace, from an address, a pasted SKILL.md, or uploaded files, and
// the preview that each avenue ends in. The preview shows the front matter,
// the body, the files with their sizes, and every problem that the checks
// found, before Install writes anything. The chooser takes the main pane of
// the Skills place while it is open. Only an admin opens it.

import { useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import { make, type AddSource, type Marketplace, type Preview } from '../api/make';
import { loadSkills } from '../state/actions';
import { go } from '../lib/route';
import { Markdown } from './common';
import { Button, Chip, Field, IconButton, Input, Led, PaneHeader, Tabs, TextArea } from './primitives';

/* ---------- open and closed ---------- */

let open = false;
const listeners = new Set<() => void>();
let watching = false;

function tell(): void {
  for (const f of [...listeners]) f();
}

/** openAddSkill opens the chooser in the main pane of the Skills place. */
export function openAddSkill(): void {
  if (!watching && typeof window !== 'undefined') {
    // A move to another address, such as a pick in the list, closes it.
    window.addEventListener('hashchange', closeAddSkill);
    watching = true;
  }
  open = true;
  tell();
}

export function closeAddSkill(): void {
  if (!open) return;
  open = false;
  tell();
}

/** useAddSkillOpen reports whether the chooser is open, and redraws when it opens or closes. */
export function useAddSkillOpen(): boolean {
  const [v, setV] = useState(open);
  useEffect(() => {
    const f = () => setV(open);
    listeners.add(f);
    f();
    return () => {
      listeners.delete(f);
    };
  }, []);
  return v;
}

/* ---------- words ---------- */

/** sizeText writes a size in bytes for a person. */
export function sizeText(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

export type Avenue = 'marketplace' | 'url' | 'text' | 'files';

export const AVENUES: { id: Avenue; label: string }[] = [
  { id: 'marketplace', label: 'From a marketplace' },
  { id: 'url', label: 'From an address' },
  { id: 'text', label: 'Paste a SKILL.md' },
  { id: 'files', label: 'Upload files' },
];

/** The most files of an upload, as the backend takes them. */
export const MAX_FILES = 64;

/* ---------- the preview ---------- */

type Step = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ready'; src: AddSource; p: Preview } | { kind: 'failed'; text: string };

function PreviewView({ p, busy, conflict, onInstall, onCancel }: { p: Preview; busy: boolean; conflict: string; onInstall: (replace: boolean) => void; onCancel: () => void }) {
  const blocks = p.problems.some((x) => x.blocks);
  const replaces = !!(p.exists && p.exists.replaceable);
  return (
    <section class="preview" aria-labelledby="preview-name">
      <p class="preview-why">An installed skill is instructions for every agent of a profile that allows it.</p>
      <div class="preview-head">
        <h2 id="preview-name" class="t-heading">
          {p.name || 'SKILL.md'}
        </h2>
        {replaces && <Led tone="grey" word={'replaces ' + p.name} />}
      </div>
      {p.description && <p class="preview-lede">{p.description}</p>}
      {p.frontMatter.length > 0 && (
        <ul class="fm" aria-label="Front matter">
          {p.frontMatter.map(([k, v]) => (
            <li>
              <span class="fm-key">{k}</span>
              <span class="fm-value">{v}</span>
            </li>
          ))}
        </ul>
      )}
      {p.problems.length > 0 && (
        <ul class="problems" aria-label="Problems">
          {p.problems.map((x) => (
            <li>
              <Led tone={x.blocks ? 'red' : 'grey'} word={x.blocks ? 'blocks' : 'note'} />
              <span>
                {x.text}
                {x.path && <code>{x.path}</code>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div class="preview-body">
        <Markdown text={p.body} class="article" />
      </div>
      <h3 class="sec-head t-sub">
        Files <Chip>{p.files.length}</Chip>
      </h3>
      <ul class="file-list">
        {p.files.map((f) => (
          <li>
            <code>{f.path}</code>
            <span class="t-meta">{sizeText(f.size)}</span>
          </li>
        ))}
      </ul>
      {conflict && (
        <p class="alert" role="alert">
          {conflict}
        </p>
      )}
      <div class="form-end">
        <Button onClick={onCancel}>Cancel</Button>
        {conflict ? (
          <Button kind="danger" disabled={busy} onClick={() => onInstall(true)}>
            Replace {p.name}
          </Button>
        ) : (
          <Button kind="primary" disabled={busy || blocks || !p.installable} onClick={() => onInstall(replaces)}>
            Install
          </Button>
        )}
      </div>
    </section>
  );
}

/* ---------- the avenues ---------- */

function MarketplaceAvenue({ onPick }: { onPick: (src: AddSource) => void }) {
  const [list, setList] = useState<Marketplace[] | null>(null);
  const [picked, setPicked] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    make
      .marketplaces()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : 'The action failed. Try it again.'));
  }, []);
  if (error)
    return (
      <p class="alert" role="alert">
        {error}
      </p>
    );
  if (!list) return <p class="t-meta">Loading the marketplaces.</p>;
  if (list.length === 0) return <p class="t-meta">No marketplace is set up.</p>;
  return (
    <div class="markets">
      {list.map((m) => (
        <div class="market" role="group" aria-labelledby={'mk-' + m.name}>
          <h3 class="group-head" id={'mk-' + m.name}>
            <span>{m.name}</span>
            <Chip>{m.skills.length}</Chip>
          </h3>
          {m.error && (
            <p class="alert" role="alert">
              {m.error}
            </p>
          )}
          <div class="c-rows">
            {m.skills.map((s) => (
              <button
                type="button"
                class={'srow' + (picked === m.name + '/' + s.name ? ' sel' : '')}
                aria-pressed={picked === m.name + '/' + s.name}
                onClick={() => {
                  setPicked(m.name + '/' + s.name);
                  onPick({ marketplace: m.name, name: s.name });
                }}
              >
                <span class="t-sub clip">{s.name}</span>
                <span class="t-meta clip">{s.description}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddressAvenue({ onPick, busy }: { onPick: (src: AddSource) => void; busy: boolean }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const submit = () => {
    const u = url.trim();
    if (!/^https:\/\/\S+$/.test(u)) {
      setError('Write an https address of a SKILL.md, of the folder of a skill, or of a zip file.');
      return;
    }
    setError('');
    onPick({ url: u });
  };
  return (
    <form
      class="avenue-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Address" error={error}>
        <Input type="url" value={url} invalid={!!error} placeholder="https://example.com/skills/release-notes/SKILL.md" onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
      </Field>
      <div class="form-end">
        <Button type="submit" disabled={busy || !url.trim()}>
          Preview
        </Button>
      </div>
    </form>
  );
}

function PasteAvenue({ onPick, busy }: { onPick: (src: AddSource) => void; busy: boolean }) {
  const [text, setText] = useState('');
  return (
    <form
      class="avenue-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onPick({ text });
      }}
    >
      <Field label="SKILL.md">
        <TextArea class="code-area" rows={12} value={text} placeholder={'---\nname: release-notes\ndescription: Draft release notes from merged changes.\n---\n'} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      </Field>
      <div class="form-end">
        <Button type="submit" disabled={busy || !text.trim()}>
          Preview
        </Button>
      </div>
    </form>
  );
}

/** pathOf is the path of an uploaded file in the folder of the skill. */
function pathOf(f: File): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  const parts = rel.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join('/') : f.name;
}

function UploadAvenue({ onPick, busy }: { onPick: (src: AddSource) => void; busy: boolean }) {
  const [files, setFiles] = useState<{ path: string; text: string; size: number }[]>([]);
  const [error, setError] = useState('');
  const pickFiles = useRef<HTMLInputElement>(null);
  const pickFolder = useRef<HTMLInputElement>(null);
  const take = async (list: FileList | null) => {
    const all = [...(list || [])];
    if (all.length > MAX_FILES) {
      setError(`Pick at most ${MAX_FILES} files.`);
      return;
    }
    setError('');
    setFiles(await Promise.all(all.map(async (f) => ({ path: pathOf(f), text: await f.text(), size: f.size }))));
  };
  return (
    <form
      class="avenue-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (files.length) onPick({ files: files.map(({ path, text }) => ({ path, text })) });
      }}
    >
      <div class="pickers">
        <Button onClick={() => pickFiles.current && pickFiles.current.click()}>Pick files</Button>
        <Button onClick={() => pickFolder.current && pickFolder.current.click()}>Pick a folder</Button>
        <input ref={pickFiles} type="file" multiple hidden onChange={(e) => take((e.target as HTMLInputElement).files)} />
        <input ref={pickFolder} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={(e) => take((e.target as HTMLInputElement).files)} />
      </div>
      {error && (
        <p class="field-error" role="alert">
          {error}
        </p>
      )}
      {files.length > 0 && (
        <ul class="file-list">
          {files.map((f) => (
            <li>
              <code>{f.path}</code>
              <span class="t-meta">{sizeText(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
      <div class="form-end">
        <Button type="submit" disabled={busy || files.length === 0}>
          Preview
        </Button>
      </div>
    </form>
  );
}

/* ---------- the chooser ---------- */

export function AddSkill({ initial = 'marketplace' }: { initial?: Avenue }) {
  const [avenue, setAvenue] = useState<Avenue>(initial);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState('');
  const top = useRef<HTMLDivElement>(null);

  const preview = async (src: AddSource) => {
    setStep({ kind: 'busy' });
    setConflict('');
    try {
      setStep({ kind: 'ready', src, p: await make.preview(src) });
      requestAnimationFrame(() => {
        const el = top.current && top.current.querySelector('.preview');
        if (el && 'scrollIntoView' in el) el.scrollIntoView({ block: 'start' });
      });
    } catch (e) {
      setStep({ kind: 'failed', text: e instanceof Error && e.message ? e.message : 'The action failed. Try it again.' });
    }
  };

  const install = async (replace: boolean) => {
    if (step.kind !== 'ready') return;
    setBusy(true);
    try {
      const r = await make.install(step.src, step.p, replace);
      await loadSkills().catch(() => {});
      closeAddSkill();
      go({ place: 'skills', item: { kind: 'skill', id: r.name } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && !replace) setConflict(e.message);
      else setStep({ kind: 'failed', text: e instanceof Error && e.message ? e.message : 'The action failed. Try it again.' });
    }
    setBusy(false);
  };

  const cancel = () => {
    setStep({ kind: 'idle' });
    setConflict('');
  };

  const pending = step.kind === 'busy';
  return (
    <section
      class="screen add-skill"
      aria-labelledby="add-skill-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !(e.target as HTMLElement).closest('textarea, input')) {
          e.preventDefault();
          closeAddSkill();
        }
      }}
    >
      <PaneHeader id="add-skill-title" title="Add skill" size="title" level={1} actions={<IconButton icon="close" label="Close" onClick={closeAddSkill} />} />
      <div class="avenues">
        <Tabs
          label="Add skill"
          current={avenue}
          controls="avenue-panel"
          items={AVENUES}
          onSelect={(id) => {
            setAvenue(id as Avenue);
            cancel();
          }}
        />
      </div>
      <div class="scroll pad" id="avenue-panel" role="tabpanel" ref={top}>
        {avenue === 'marketplace' && <MarketplaceAvenue onPick={preview} />}
        {avenue === 'url' && <AddressAvenue onPick={preview} busy={pending} />}
        {avenue === 'text' && <PasteAvenue onPick={preview} busy={pending} />}
        {avenue === 'files' && <UploadAvenue onPick={preview} busy={pending} />}
        {pending && (
          <p class="t-meta" role="status">
            Loading the preview.
          </p>
        )}
        {step.kind === 'failed' && (
          <p class="alert" role="alert">
            {step.text}
          </p>
        )}
        {step.kind === 'ready' && <PreviewView p={step.p} busy={busy} conflict={conflict} onInstall={install} onCancel={cancel} />}
      </div>
    </section>
  );
}
