// The wiki: the tree of pages with its folders as groups and a search, a
// page rendered through the sanitizer with its meta as parts, its history,
// and the editor. A save is a compare-and-swap with If-Match, and a 412
// shows a conflict that keeps the text of the person. The tree shows names
// without .md, a new page gets .md when the person leaves it out, and
// _index.md, which the wiki writes on its own, has no Edit.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import { api } from '../api/routes';
import type { Page, PageMeta, PageVersion, SearchHit } from '../api/types';
import { useSelect } from '../state/store';
import { loadPages } from '../state/actions';
import { stripFrontMatter } from '../lib/markdown';
import { INDEX_PATH, pageName, pageReason, withSuffix } from '../lib/pagepath';
import { personName, since } from '../lib/words';
import { go, hrefOf } from '../lib/route';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Markdown } from './common';
import { Glyph } from './icons';
import { Button, Card, Chip, Command, Field, Input, PaneHeader, TextArea } from './primitives';

/** byName names the writer of a page: a person, an agent, a run, the fleet token, or bossmode. */
export function byName(by: string): string {
  if (by.startsWith('agent:')) return by.slice(6);
  if (by.startsWith('run:')) return 'run ' + by.slice(4);
  if (by === 'token') return 'the fleet token';
  if (by === 'bossmode') return 'bossmode';
  return personName(by);
}

/** One folder of the wiki: its path, and the pages right in it. The root has the path "". */
export interface Folder {
  path: string;
  pages: PageMeta[];
}

/** foldersOf groups the pages by folder: the pages at the root first, then each folder by its path. */
export function foldersOf(pages: PageMeta[]): Folder[] {
  const by = new Map<string, PageMeta[]>();
  for (const p of pages) {
    const i = p.path.lastIndexOf('/');
    const dir = i < 0 ? '' : p.path.slice(0, i);
    if (!by.has(dir)) by.set(dir, []);
    by.get(dir)!.push(p);
  }
  return [...by.keys()]
    .sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a < b ? -1 : a > b ? 1 : 0))
    .map((path) => ({ path, pages: by.get(path)!.sort((a, b) => (a.path < b.path ? -1 : 1)) }));
}

/** Since is a short meta of a moment, with the full time in a tooltip. */
function Since({ at }: { at: string }) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return null;
  return (
    <time dateTime={at} title={d.toLocaleString()}>
      {since(at)}
    </time>
  );
}

function PageRow({ p, current }: { p: PageMeta; current?: string }) {
  const on = p.path === current;
  const name = pageName(p.path);
  return (
    <div role="listitem">
      <a class={'wrow' + (on ? ' sel' : '')} href={hrefOf({ place: 'pages', path: p.path, mode: 'read' })} data-item aria-current={on ? 'page' : undefined}>
        <span class="t-sub clip">{p.title || name}</span>
        <span class="meta">
          <span>{name}</span>
          <Since at={p.at} />
        </span>
      </a>
    </div>
  );
}

export function PageTree({ current }: { current?: string }) {
  const byPath = useSelect((s) => s.pages.byPath);
  const loaded = useSelect((s) => s.pages.loaded);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [cut, setCut] = useState(false);
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const folders = useMemo(() => foldersOf(Object.values(byPath)), [byPath]);
  const list = useRoving<HTMLDivElement>();
  const count = Object.keys(byPath).length;
  useEffect(() => {
    if (!loaded) attempt(loadPages);
  }, []);
  useEffect(() => {
    const words = q.trim();
    if (!words) {
      setHits(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api
        .search(words, ctl.signal)
        .then((r) => {
          setHits(r.results || []);
          setCut(!!r.cut);
        })
        .catch(showError);
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  return (
    <section class="screen pagetree" aria-labelledby="pages-title">
      <PaneHeader
        id="pages-title"
        title="Wiki"
        count={loaded ? count : undefined}
        countLabel={count === 1 ? '1 page' : count + ' pages'}
        actions={
          <Button href="#create" size="s">
            New
          </Button>
        }
      />
      <div class="scroll" ref={list}>
        <form class="find recess" role="search" onSubmit={(e) => e.preventDefault()}>
          <Glyph name="search" size={16} />
          <input type="search" placeholder="Search the wiki" aria-label="Search the wiki" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </form>
        {hits ? (
          <div class="c-rows hits" role="list" aria-label="Pages that hold the words">
            {hits.map((h) => (
              <div role="listitem">
                <a class={'wrow' + (h.path === current ? ' sel' : '')} href={hrefOf({ place: 'pages', path: h.path, mode: 'read' })} data-item>
                  <span class="t-sub clip">{h.title || pageName(h.path)}</span>
                  <span class="snippet">{h.snippet}</span>
                </a>
              </div>
            ))}
            {hits.length === 0 && <p class="empty">No page holds those words. Try fewer words.</p>}
            {cut && <p class="tree-foot">Partial: more words find the rest.</p>}
          </div>
        ) : (
          <>
            {!loaded && <p class="empty">Loading the pages.</p>}
            {loaded && count === 0 && (
              <div class="empty">
                <p>The wiki is empty.</p>
                <Button href="#create">New page</Button>
              </div>
            )}
            {folders.map((f) => {
              const open = !shut[f.path];
              const id = 'folder-' + (f.path || 'root');
              return (
                <div class="group" role="group" aria-labelledby={f.path ? id : undefined} aria-label={f.path ? undefined : 'Pages'}>
                  {f.path && (
                    <button type="button" class="group-head" id={id} aria-expanded={open} onClick={() => setShut({ ...shut, [f.path]: open })}>
                      <Glyph name="back" size={14} />
                      <span class="clip">{f.path}</span>
                      <Chip>{f.pages.length}</Chip>
                    </button>
                  )}
                  {open && (
                    <div class="c-rows" role="list">
                      {f.pages.map((p) => (
                        <PageRow p={p} current={current} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}

/** Parts is the meta of a page: its version, its writer, its time, its summary, and its tags. */
function Parts({ page, tags }: { page: Page; tags: string[] }) {
  return (
    <p class="parts">
      <span>Version {page.version}</span>
      <span class="by">{byName(page.by)}</span>
      <Since at={page.at} />
      {page.summary && <span>{page.summary}</span>}
      {tags.length > 0 && (
        <span class="tags">
          {tags.map((t) => (
            <Chip>{t}</Chip>
          ))}
        </span>
      )}
    </p>
  );
}

export function PageView({ path, version }: { path: string; version?: number }) {
  const meta = useSelect((s) => s.pages.byPath[path]);
  const [page, setPage] = useState<Page | null>(null);
  const [missing, setMissing] = useState(false);
  const [changed, setChanged] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const read = () =>
    api
      .page(path, version)
      .then((p) => {
        setPage(p);
        setMissing(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else showError(e);
      });
  useEffect(() => {
    setPage(null);
    setChanged(false);
    read();
  }, [path, version]);
  // A newer version on the stream shows at once on the current page.
  const hash = meta ? meta.hash : '';
  useEffect(() => {
    if (!page || version || !hash || hash === page.hash) return;
    setChanged(true);
    read();
  }, [hash]);
  useEffect(() => {
    if (page && heading.current) heading.current.focus();
  }, [page && page.path]);
  const back = { href: '#pages', label: 'Wiki', to: 'list' as const };
  if (missing) {
    return (
      <section class="screen pageview" aria-labelledby="page-title">
        <PaneHeader id="page-title" title={pageName(path)} size="title" level={1} back={back} />
        <div class="empty">
          <p>No page {path} is here.</p>
          <Button href={hrefOf({ place: 'pages', path, mode: 'create' })}>Create {path}</Button>
        </div>
      </section>
    );
  }
  const fm = page ? stripFrontMatter(page.text) : null;
  return (
    <section class="screen pageview" aria-labelledby="page-title">
      <PaneHeader
        id="page-title"
        title={(page && (page.title || fm!.title)) || pageName(path)}
        size="title"
        level={1}
        headingRef={heading}
        focusable
        back={back}
        actions={
          <>
            <Button href={hrefOf({ place: 'pages', path, mode: 'history' })} size="s">
              History
            </Button>
            {!version && path !== INDEX_PATH && (
              <Button href={hrefOf({ place: 'pages', path, mode: 'edit' })} size="s">
                Edit
              </Button>
            )}
          </>
        }
      />
      <div class="scroll pad">
        {version && page && (
          <p class="note-line">
            <span>
              Version {page.version}, by {byName(page.by)}, <Since at={page.at} />.
            </span>
            <a href={hrefOf({ place: 'pages', path, mode: 'read' })}>Current page</a>
          </p>
        )}
        {changed && !version && page && (
          <p class="note-line" role="status">
            {byName(page.by)} saved a newer version.
          </p>
        )}
        {!page ? (
          <p class="t-meta">Loading the page.</p>
        ) : (
          <>
            <Parts page={page} tags={fm!.tags} />
            <Markdown text={fm!.body} base={path} class="article" />
          </>
        )}
      </div>
    </section>
  );
}

export function PageHistory({ path }: { path: string }) {
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const meta = useSelect((s) => s.pages.byPath[path]);
  const list = useRoving<HTMLOListElement>();
  useEffect(() => {
    setVersions(null);
    api.history(path).then(setVersions).catch(showError);
  }, [path, meta && meta.hash]);
  return (
    <section class="screen pagehistory" aria-labelledby="history-title">
      <PaneHeader id="history-title" title={'History of ' + pageName(path)} size="title" level={1} back={{ href: hrefOf({ place: 'pages', path, mode: 'read' }), label: pageName(path), to: 'here' }} />
      <div class="scroll pad">
        {!versions && <p class="t-meta">Loading the history.</p>}
        <ol class="versions" ref={list}>
          {versions &&
            versions.map((v, i) =>
              v.deleted ? (
                <li>
                  <p class="vrow gone" data-item tabIndex={-1}>
                    <span class="head t-sub">Removed</span>
                    <span class="meta">
                      <Since at={v.at} />
                    </span>
                  </p>
                </li>
              ) : (
                <li>
                  <a class="vrow" data-item href={i === 0 ? hrefOf({ place: 'pages', path, mode: 'read' }) : hrefOf({ place: 'pages', path, mode: 'read', version: v.version })}>
                    <span class="head">
                      <span class="t-sub">Version {v.version}</span>
                      {i === 0 && <Chip>current</Chip>}
                    </span>
                    <span class="meta">
                      <span>{byName(v.by)}</span>
                      <Since at={v.at} />
                      {v.summary && <span>{v.summary}</span>}
                    </span>
                  </a>
                </li>
              ),
            )}
        </ol>
      </div>
    </section>
  );
}

const draftKey = (p: string) => 'fw.bossmode.page.' + p;

interface Draft {
  text: string;
  summary: string;
  base: string;
}

function readDraft(p: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(draftKey(p));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(p: string, d: Draft | null): void {
  try {
    if (d) sessionStorage.setItem(draftKey(p), JSON.stringify(d));
    else sessionStorage.removeItem(draftKey(p));
  } catch {
    // No storage: the draft lives in memory only.
  }
}

const SAVE_KEY = typeof navigator !== 'undefined' && navigator.platform && /Mac/.test(navigator.platform) ? '⌘+Enter' : 'Ctrl+Enter';

/** PageEditor edits a page, or creates one when create is set. */
export function PageEditor({ path: initial, create }: { path?: string; create?: boolean }) {
  const [path, setPath] = useState(initial || '');
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [base, setBase] = useState('');
  const [ready, setReady] = useState(!!create);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Page | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (create || !initial) return;
    const d = readDraft(initial);
    api
      .page(initial)
      .then((p) => {
        if (d && d.base) {
          setText(d.text);
          setSummary(d.summary);
          setBase(d.base);
          if (d.base !== p.hash) setConflict(p);
        } else {
          setText(p.text);
          setBase(p.hash);
        }
        setReady(true);
        requestAnimationFrame(() => box.current && box.current.focus());
      })
      .catch(showError);
  }, [initial, create]);

  const keep = (t: string, s: string) => {
    if (!create && initial) writeDraft(initial, { text: t, summary: s, base });
  };

  const save = async (over?: string) => {
    // A new path gets .md when the person leaves it out, and the page checks
    // the rule of the store before it sends anything.
    const target = create ? withSuffix(path) : initial || '';
    const why = pageReason(target);
    if (why) {
      showError(new Error(why));
      return;
    }
    if (create && target !== path) setPath(target);
    setBusy(true);
    try {
      const p = await api.putPage(target, text, create ? '*' : over || base, summary.trim() || undefined);
      writeDraft(target, null);
      setConflict(null);
      await loadPages();
      go({ place: 'pages', path: p.path || target, mode: 'read' });
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        if (create) {
          showError(new Error('A page with this path exists already. Pick another path, or edit that page.'));
        } else {
          try {
            setConflict(await api.page(target));
          } catch (e2) {
            showError(e2);
          }
        }
      } else showError(e);
    }
    setBusy(false);
  };

  const target = create ? withSuffix(path) : initial || '';
  const why = create && path.trim() ? pageReason(target) : '';
  const cancelHref = create ? '#pages' : hrefOf({ place: 'pages', path: initial || '', mode: 'read' });
  return (
    <section class="screen pageedit" aria-labelledby="edit-title">
      <PaneHeader id="edit-title" title={create ? 'New page' : 'Edit ' + pageName(initial || '')} size="title" level={1} back={{ href: cancelHref, label: create ? 'Wiki' : pageName(initial || ''), to: 'here' }} />
      <form
        class="scroll pad editor"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      >
        {conflict && (
          <Card
            class="conflict"
            tone="amber"
            title={byName(conflict.by) + ' saved this page while you edited it.'}
            actions={
              <>
                <Button
                  onClick={() => {
                    setText(conflict.text);
                    setBase(conflict.hash);
                    setConflict(null);
                    writeDraft(initial || '', null);
                  }}
                >
                  Take theirs
                </Button>
                <Button
                  kind="primary"
                  disabled={busy}
                  onClick={() => {
                    setBase(conflict.hash);
                    save(conflict.hash);
                  }}
                >
                  Keep mine
                </Button>
              </>
            }
          >
            <p>Your text is still here.</p>
            <details>
              <summary>See their version</summary>
              <Command>{conflict.text}</Command>
            </details>
          </Card>
        )}
        {create && (
          <Field label="Path" error={why}>
            <Input value={path} required invalid={!!why} placeholder="runbooks/deploy.md" spellcheck={false} onInput={(e) => setPath((e.target as HTMLInputElement).value)} />
            {!why && target && <span class="t-meta">The page will be {target}.</span>}
          </Field>
        )}
        <Field label="Text" class="text-grow">
          <TextArea
            ref={box}
            class="code-area"
            value={text}
            disabled={!ready}
            onInput={(e) => {
              const v = (e.target as HTMLTextAreaElement).value;
              setText(v);
              keep(v, summary);
            }}
          />
        </Field>
        <Field label="What changed">
          <Input
            value={summary}
            maxLength={200}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              setSummary(v);
              keep(text, v);
            }}
          />
        </Field>
        <div class="form-end">
          <span class="kbd" aria-hidden="true">
            {SAVE_KEY}
          </span>
          <Button href={cancelHref} onClick={() => !create && writeDraft(initial || '', null)}>
            Cancel
          </Button>
          <Button type="submit" kind="primary" disabled={busy || !ready}>
            {create ? 'Create page' : 'Save'}
          </Button>
        </div>
      </form>
    </section>
  );
}
