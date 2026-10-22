// The wiki: the tree of pages with a search, a page rendered through the
// sanitizer, its history, and an editor. A save is a compare-and-swap with
// If-Match, and a 412 shows a conflict message that keeps the text of the
// person.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ApiError } from '../api/client';
import { api } from '../api/routes';
import type { Page, PageMeta, PageVersion, SearchHit } from '../api/types';
import { useSelect } from '../state/store';
import { loadPages } from '../state/actions';
import { stripFrontMatter } from '../lib/markdown';
import { INDEX_PATH, pageName, pageReason, withSuffix } from '../lib/pagepath';
import { ago, personName } from '../lib/words';
import { go, hrefOf } from '../lib/route';
import { useRoving } from './keys';
import { attempt, showError } from './notice';
import { Back, Empty, Markdown, When } from './common';
import { Icon } from './icons';

/** byName names the writer of a page: a person, an agent, a run, the fleet token, or bossmode. */
export function byName(by: string): string {
  if (by.startsWith('agent:')) return by.slice(6);
  if (by.startsWith('run:')) return 'run ' + by.slice(4);
  if (by === 'token') return 'the fleet token';
  if (by === 'bossmode') return 'bossmode';
  return personName(by);
}

interface Folder {
  name: string;
  path: string;
  folders: Folder[];
  pages: PageMeta[];
}

/** treeOf builds the folders of the wiki from the paths of its pages. */
export function treeOf(pages: PageMeta[]): Folder {
  const root: Folder = { name: '', path: '', folders: [], pages: [] };
  for (const p of [...pages].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const parts = p.path.split('/');
    let f = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = f.folders.find((x) => x.name === parts[i]);
      if (!next) {
        next = { name: parts[i], path: parts.slice(0, i + 1).join('/'), folders: [], pages: [] };
        f.folders.push(next);
      }
      f = next;
    }
    f.pages.push(p);
  }
  return root;
}

function FolderView({ f, current }: { f: Folder; current?: string }) {
  return (
    <>
      {f.pages.map((p) => (
        <li>
          <a class={'prow' + (p.path === current ? ' sel' : '')} href={hrefOf({ place: 'pages', path: p.path, mode: 'read' })} data-item aria-current={p.path === current ? 'page' : undefined}>
            <Icon name="page" />
            <span class="main">
              <span class="t">{p.title || pageName(p.path)}</span>
              <span class="s">
                {pageName(p.path)} {'·'} {ago(p.at)}
              </span>
            </span>
          </a>
        </li>
      ))}
      {f.folders.map((sub) => (
        <li>
          <details open>
            <summary>
              <Icon name="chev" />
              {sub.name}
            </summary>
            <ul>
              <FolderView f={sub} current={current} />
            </ul>
          </details>
        </li>
      ))}
    </>
  );
}

export function PageTree({ current }: { current?: string }) {
  const byPath = useSelect((s) => s.pages.byPath);
  const loaded = useSelect((s) => s.pages.loaded);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [cut, setCut] = useState(false);
  const tree = useMemo(() => treeOf(Object.values(byPath)), [byPath]);
  const list = useRoving<HTMLUListElement>();
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
      <header class="bar">
        <Back narrow label="Bridges" href="#" />
        <div class="title">
          <h2 id="pages-title">Pages</h2>
          <p class="goal">The wiki of the fleet. Agents write it, and people read it.</p>
        </div>
        <div class="end">
          <a class="btn small" href="#create">
            <Icon name="plus" /> New
          </a>
        </div>
      </header>
      <div class="scroll">
        <form class="search" role="search" onSubmit={(e) => e.preventDefault()}>
          <Icon name="search" />
          <input type="search" placeholder="Search the wiki" aria-label="Search the wiki" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </form>
        {hits ? (
          <ul class="tree hits" ref={list}>
            {hits.map((h) => (
              <li>
                <a class="prow" href={hrefOf({ place: 'pages', path: h.path, mode: 'read' })} data-item>
                  <Icon name="page" />
                  <span class="main">
                    <span class="t">{h.title || h.path}</span>
                    <span class="s">{h.snippet}</span>
                  </span>
                </a>
              </li>
            ))}
            {hits.length === 0 && <Empty>No page holds those words.</Empty>}
            {cut && <p class="hint">The search read part of the wiki. Use more words to find the rest.</p>}
          </ul>
        ) : (
          <ul class="tree" ref={list}>
            <FolderView f={tree} current={current} />
            {loaded && Object.keys(byPath).length === 0 && <Empty>The wiki has no page.</Empty>}
            {!loaded && <Empty>Loading the pages.</Empty>}
          </ul>
        )}
      </div>
    </section>
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
  if (missing) {
    return (
      <section class="screen pageview">
        <header class="bar">
          <Back label="Pages" href="#pages" />
        </header>
        <div class="scroll pad">
          <Empty>No page {path} is here.</Empty>
          <a class="btn" href={hrefOf({ place: 'pages', path, mode: 'create' })}>
            Create {path}
          </a>
        </div>
      </section>
    );
  }
  const fm = page ? stripFrontMatter(page.text) : null;
  return (
    <section class="screen pageview" aria-labelledby="page-title">
      <header class="bar">
        <Back narrow label="Pages" href="#pages" />
        <div class="title">
          <h1 id="page-title" tabIndex={-1} ref={heading}>
            {(page && (page.title || fm!.title)) || pageName(path)}
          </h1>
          <p class="goal">{path}</p>
        </div>
        <div class="end">
          <a class="btn small" href={hrefOf({ place: 'pages', path, mode: 'history' })}>
            <Icon name="history" /> History
          </a>
          {!version && path !== INDEX_PATH && (
            <a class="btn small" href={hrefOf({ place: 'pages', path, mode: 'edit' })}>
              <Icon name="edit" /> Edit
            </a>
          )}
        </div>
      </header>
      <div class="scroll pad">
        {version && page && (
          <p class="banner">
            This is version {page.version}, by {byName(page.by)}, <When at={page.at} />. <a href={hrefOf({ place: 'pages', path, mode: 'read' })}>Read the current page</a>.
          </p>
        )}
        {changed && !version && (
          <p class="banner" role="status">
            {page ? byName(page.by) : 'Someone'} saved a newer version. The page shows it.
          </p>
        )}
        {!page ? (
          <Empty>Loading the page.</Empty>
        ) : (
          <>
            <p class="meta-line">
              Version {page.version} by {byName(page.by)}, {ago(page.at)}
              {page.summary ? ': ' + page.summary : ''}
              {fm && fm.tags.length > 0 && <span class="tags">{fm.tags.map((t) => <span class="tag">{t}</span>)}</span>}
            </p>
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
      <header class="bar">
        <Back label="Page" href={hrefOf({ place: 'pages', path, mode: 'read' })} />
        <div class="title">
          <h1 id="history-title">History</h1>
          <p class="goal">{path}</p>
        </div>
      </header>
      <div class="scroll pad">
        {!versions && <Empty>Loading the history.</Empty>}
        <ol class="versions" ref={list}>
          {versions &&
            versions.map((v, i) =>
              v.deleted ? (
                <li>
                  <p class="vrow gone" data-item>
                    <b>Removed</b>
                    <span class="s">
                      <When at={v.at} />
                    </span>
                  </p>
                </li>
              ) : (
                <li>
                  <a class="vrow" data-item href={i === 0 ? hrefOf({ place: 'pages', path, mode: 'read' }) : hrefOf({ place: 'pages', path, mode: 'read', version: v.version })}>
                    <b>
                      Version {v.version}
                      {i === 0 ? ', the current one' : ''}
                      {v.title ? ': ' + v.title : ''}
                    </b>
                    <span class="s">
                      {byName(v.by)}, <When at={v.at} />
                      {v.summary ? ': ' + v.summary : ''}
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
  return (
    <section class="screen pageedit" aria-labelledby="edit-title">
      <header class="bar">
        <Back label={create ? 'Pages' : 'Page'} href={create ? '#pages' : hrefOf({ place: 'pages', path: initial || '', mode: 'read' })} />
        <div class="title">
          <h1 id="edit-title">{create ? 'New page' : 'Edit'}</h1>
          <p class="goal">{target}</p>
        </div>
      </header>
      <form
        class="scroll pad form editor"
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
          <div class="conflict" role="alert">
            <p>
              <b>{byName(conflict.by)} saved this page while you edited it</b>, <When at={conflict.at} />. Your text is still here, and nothing is lost.
            </p>
            <details>
              <summary>See their version</summary>
              <pre class="code">{conflict.text}</pre>
            </details>
            <div class="do">
              <button
                type="button"
                class="btn"
                onClick={() => {
                  setText(conflict.text);
                  setBase(conflict.hash);
                  setConflict(null);
                  writeDraft(initial || '', null);
                }}
              >
                Drop my text and take theirs
              </button>
              <button
                type="button"
                class="btn danger"
                disabled={busy}
                onClick={() => {
                  setBase(conflict.hash);
                  save(conflict.hash);
                }}
              >
                Save mine over theirs
              </button>
            </div>
          </div>
        )}
        {create && (
          <label class="fld">
            <span>Path, such as runbooks/deploy.md. The page adds .md when you leave it out.</span>
            <input value={path} required aria-invalid={!!why} aria-describedby="path-why" onInput={(e) => setPath((e.target as HTMLInputElement).value)} />
            <span id="path-why" class={why ? 'field-why bad' : 'field-why'}>
              {why || (target ? 'The page will be ' + target + '.' : '')}
            </span>
          </label>
        )}
        <label class="fld grow">
          <span>Markdown</span>
          <textarea
            ref={box}
            class="mono"
            value={text}
            disabled={!ready}
            onInput={(e) => {
              const v = (e.target as HTMLTextAreaElement).value;
              setText(v);
              keep(v, summary);
            }}
          />
        </label>
        <label class="fld">
          <span>What changed, in a few words</span>
          <input
            value={summary}
            maxLength={200}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              setSummary(v);
              keep(text, v);
            }}
          />
        </label>
        <div class="do end">
          <a class="btn" href={create ? '#pages' : hrefOf({ place: 'pages', path: initial || '', mode: 'read' })} onClick={() => !create && writeDraft(initial || '', null)}>
            Cancel
          </a>
          <button type="submit" class="btn primary" disabled={busy || !ready}>
            {create ? 'Create the page' : 'Save'}
          </button>
        </div>
        <p class="why">Cmd or Ctrl+Enter saves. A save that meets a newer version stops and asks you.</p>
      </form>
    </section>
  );
}
