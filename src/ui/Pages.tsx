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
import { INDEX_PATH, byPagePath, pageName, pageReason, withSuffix } from '../lib/pagepath';
import { personName, since } from '../lib/words';
import { go, hrefOf } from '../lib/route';
import { useRoving } from './keys';
import { attempt, showError, showSaid } from './notice';
import { Confirm, Markdown, Menu } from './common';
import { keyWords, useCoarse } from './Composer';
import { Glyph } from './icons';
import { Button, Card, Chip, Command, Field, Find, Input, PaneHeader, TextArea } from './primitives';

/** byName names the writer of a page: a person, an agent, a run, the fleet token, or bossmode. */
export function byName(by: string): string {
  if (by.startsWith('agent:')) return by.slice(6);
  if (by.startsWith('run:')) return 'run ' + by.slice(4);
  if (by === 'token') return 'the fleet token';
  if (by === 'bossmode') return 'bossmode';
  return personName(by);
}

/**
 * One folder of the wiki: its path, its name for a person, and the pages
 * right in it. The root has the path "". A folder of the work of a bridge,
 * bridges/<id>, is named by the title of the bridge, and a folder of an
 * agent, agents/<agent>, by the name of the agent.
 */
export interface Folder {
  path: string;
  kind: 'root' | 'people' | 'bridge' | 'agent';
  title: string;
  pages: PageMeta[];
}

/** The headings over the work folders of the bridges and of the agents in the tree. */
const KIND_HEADS: Record<string, string> = { bridge: 'Bridges', agent: 'Agents' };

/** The order of the kinds of folders: the pages that people keep first, the work folders of bridges and agents last. */
const KIND_ORDER: Folder['kind'][] = ['root', 'people', 'bridge', 'agent'];

/** folderOf names a folder by its path, with the titles of the bridges that the page knows. */
export function folderOf(path: string, bridgeTitles: Record<string, string>): Omit<Folder, 'pages'> {
  if (!path) return { path, kind: 'root', title: '' };
  const [head, id, ...rest] = path.split('/');
  const tail = rest.length ? '/' + rest.join('/') : '';
  if (head === 'bridges' && id) return { path, kind: 'bridge', title: bridgeTitles[id] ? bridgeTitles[id] + tail : path };
  if (head === 'agents' && id) return { path, kind: 'agent', title: id + tail };
  return { path, kind: 'people', title: path };
}

/**
 * foldersOf groups the pages by folder, in the order that a person looks
 * for them: the pages at the root, then the folders that people and agents
 * keep for the work of the place, such as runbooks or homelab, by path,
 * then the work folders of the bridges by title, then the folders of the
 * agents by name.
 */
export function foldersOf(pages: PageMeta[], bridgeTitles: Record<string, string> = {}): Folder[] {
  const by = new Map<string, PageMeta[]>();
  for (const p of pages) {
    const i = p.path.lastIndexOf('/');
    const dir = i < 0 ? '' : p.path.slice(0, i);
    if (!by.has(dir)) by.set(dir, []);
    by.get(dir)!.push(p);
  }
  const key = (f: Omit<Folder, 'pages'>) => (f.kind === 'people' ? f.path : f.title).toLocaleLowerCase();
  return [...by.keys()]
    .map((path) => ({ ...folderOf(path, bridgeTitles), pages: by.get(path)!.sort(byPagePath) }))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.path < b.path ? -1 : 1));
}

/**
 * newPath makes the path of a new page from what a person typed: each
 * space between words becomes a hyphen, so walk/walk page 1 gives
 * walk/walk-page-1.md, and .md comes last when the person leaves it out.
 */
export function newPath(typed: string): string {
  const p = typed
    .trim()
    .split('/')
    .map((part) => part.trim().replace(/\s+/g, '-'))
    .join('/');
  return withSuffix(p);
}

/**
 * withoutTitle drops the first heading of the text of a page when it says
 * the title that the head of the page shows, so the title shows once and
 * the screen has one h1.
 */
export function withoutTitle(body: string, title: string): string {
  const m = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(\r?\n|$)/.exec(body);
  if (!m || m[1].trim().toLowerCase() !== title.trim().toLowerCase()) return body;
  return body.slice(m[0].length).replace(/^\s*\n/, '');
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
  // The list of bridges holds the closed ones too, so a folder of a bridge is named by its title.
  const bridges = useSelect((s) => s.bridges.byId);
  const titles = useMemo(() => Object.fromEntries(Object.values(bridges).map((b) => [b.id, b.title])), [bridges]);
  const folders = useMemo(() => foldersOf(Object.values(byPath), titles), [byPath, titles]);
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
        <form class="list-find" role="search" onSubmit={(e) => e.preventDefault()}>
          <Find label="Search the wiki" value={q} onInput={setQ} />
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
            {folders.map((f, i) => {
              const open = !shut[f.path];
              const id = 'folder-' + (f.path || 'root');
              // The work folders of the bridges and of the agents each start under a heading of their own.
              const kindHead = (f.kind === 'bridge' || f.kind === 'agent') && (i === 0 || folders[i - 1].kind !== f.kind) ? KIND_HEADS[f.kind] : '';
              return (
                <>
                  {kindHead && <h2 class="group-title t-heading">{kindHead}</h2>}
                  <div class="group" role="group" aria-labelledby={f.path ? id : undefined} aria-label={f.path ? undefined : 'Pages'}>
                    {f.path && (
                      <button type="button" class="group-head" id={id} aria-expanded={open} title={f.title !== f.path ? f.path : undefined} onClick={() => setShut({ ...shut, [f.path]: open })}>
                        <Glyph name="back" size={14} />
                        <span class="clip">{f.title}</span>
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
                </>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * pageNumbers counts the versions of one page from 1, the oldest first, so
 * a page with three versions has versions 1, 2, and 3. The store numbers
 * the versions of the whole wiki, so its number of a version, such as 183,
 * is the key of the map. A removal has no number.
 */
export function pageNumbers(versions: PageVersion[]): Map<number, number> {
  const out = new Map<number, number>();
  const kept = versions.filter((v) => !v.deleted).sort((a, b) => a.version - b.version);
  kept.forEach((v, i) => out.set(v.version, i + 1));
  return out;
}

/** usePageHistory reads the history of a page, again when the page changes, or holds null while it reads or when the read fails. */
function usePageHistory(path: string, hash: string): PageVersion[] | null {
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  useEffect(() => {
    let live = true;
    setVersions(null);
    api
      .history(path)
      .then((v) => live && setVersions(v))
      .catch(() => live && setVersions(null));
    return () => {
      live = false;
    };
  }, [path, hash]);
  return versions;
}

/** Parts is the meta of a page: its version, its writer, its time, its summary, and its tags. brief leaves out the first three, which the line of an old version says. n is the number of the version in the page, when the page knows its history. */
function Parts({ page, tags, brief, n }: { page: Page; tags: string[]; brief?: boolean; n?: number }) {
  if (brief && !page.summary && tags.length === 0) return null;
  return (
    <p class="parts">
      {!brief && n !== undefined && <span>Version {n}</span>}
      {!brief && <span class="by">{byName(page.by)}</span>}
      {!brief && <Since at={page.at} />}
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
        // A path such as a.md/history meets another route of the front, whose
        // answer is no page; the page is not here.
        if (!p || typeof p.text !== 'string') {
          setMissing(true);
          return;
        }
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
  // The history numbers the versions of the page from 1, and names the newest one, which Restore replaces.
  const versions = usePageHistory(path, hash || (page ? page.hash : '') || (missing ? 'missing' : ''));
  const numbers = useMemo(() => pageNumbers(versions || []), [versions]);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const back = { href: '#pages', label: 'Wiki', to: 'list' as const };
  const removedNow = !!versions && versions.length > 0 && !!versions[0].deleted;
  if (missing) {
    return (
      <section class="screen pageview" aria-labelledby="page-title">
        <PaneHeader id="page-title" title={pageName(path)} size="title" level={1} back={back} />
        <div class="empty">
          {removedNow ? (
            <>
              <p>This page was removed. Its history keeps its versions, and Restore brings one back.</p>
              <Button href={hrefOf({ place: 'pages', path, mode: 'history' })}>History</Button>
            </>
          ) : (
            <>
              <p>No page {path} is here.</p>
              <Button href={hrefOf({ place: 'pages', path, mode: 'create' })}>Create {path}</Button>
            </>
          )}
        </div>
      </section>
    );
  }
  const fm = page ? stripFrontMatter(page.text) : null;
  const title = (page && (page.title || fm!.title)) || pageName(path);
  const n = page ? numbers.get(page.version) : undefined;
  const remove = async () => {
    if (!page) return;
    setBusy(true);
    const ok = await attempt(async () => {
      try {
        await api.removePage(path, page.hash);
      } catch (e) {
        if (e instanceof ApiError && e.status === 412) throw new Error('Someone saved a newer version of this page. Read it, then remove it again.');
        throw e;
      }
      await loadPages();
    });
    setBusy(false);
    setAsking(false);
    if (ok) {
      showSaid('Removed ' + title + '. Its history keeps it.');
      go('#pages');
    }
  };
  // Restore saves an old version as the newest one: over the newest version, or as the page again when it was removed.
  const restore = async () => {
    if (!page || !versions) return;
    const newest = versions[0];
    setBusy(true);
    const ok = await attempt(async () => {
      try {
        await api.putPage(path, page.text, newest && !newest.deleted ? newest.hash : '*', 'Restored version ' + (n || page.version));
      } catch (e) {
        if (e instanceof ApiError && e.status === 412) throw new Error('Someone saved a newer version of this page. Open the history again.');
        throw e;
      }
      await loadPages();
    });
    setBusy(false);
    if (ok) {
      showSaid('Restored version ' + (n || page.version) + ' as the newest version.');
      go({ place: 'pages', path, mode: 'read' });
    }
  };
  return (
    <section class="screen pageview" aria-labelledby="page-title">
      <PaneHeader
        id="page-title"
        title={title}
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
            {!version && page && path !== INDEX_PATH && <Menu label={'More for ' + title} kind="secondary" items={[{ label: 'Remove page', danger: true, onSelect: () => setAsking(true) }]} />}
          </>
        }
      />
      {asking && (
        <Confirm title={'Remove ' + title + '?'} confirm="Remove page" danger busy={busy} onCancel={() => setAsking(false)} onConfirm={remove}>
          <p>The page leaves the wiki. Its history keeps every version, and Restore of a version brings the page back.</p>
        </Confirm>
      )}
      <div class="scroll pad">
        {version && page && (
          <p class="note-line">
            <span>
              {n !== undefined ? 'Version ' + n + ', by ' : 'An old version, by '}
              {byName(page.by)}, <Since at={page.at} />.
            </span>
            <a href={hrefOf({ place: 'pages', path, mode: 'read' })}>{removedNow ? 'History' : 'Current page'}</a>
            {versions && path !== INDEX_PATH && (
              <Button size="s" disabled={busy} onClick={restore}>
                Restore this version
              </Button>
            )}
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
            <Parts page={page} tags={fm!.tags} brief={!!version} n={n} />
            <Markdown text={withoutTitle(fm!.body, title)} base={path} class="article" />
          </>
        )}
      </div>
    </section>
  );
}

export function PageHistory({ path }: { path: string }) {
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const meta = useSelect((s) => s.pages.byPath[path]);
  // The title that the tree and the page show, else the name of the file.
  const name = (meta && meta.title) || pageName(path);
  const list = useRoving<HTMLOListElement>();
  useEffect(() => {
    setVersions(null);
    api.history(path).then(setVersions).catch(showError);
  }, [path, meta && meta.hash]);
  const numbers = useMemo(() => pageNumbers(versions || []), [versions]);
  return (
    <section class="screen pagehistory" aria-labelledby="history-title">
      <PaneHeader id="history-title" title={'History of ' + name} size="title" level={1} back={{ href: hrefOf({ place: 'pages', path, mode: 'read' }), label: name, to: 'here' }} />
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
                      <span class="t-sub">Version {numbers.get(v.version) || v.version}</span>
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

/** The refusal of a new page whose path a page holds already. */
export const TAKEN = 'A page with this name exists already. Pick another name, or edit that page.';

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
  // The refusal of a new path, under the field that holds it.
  const [taken, setTaken] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const pathField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (create && pathField.current) pathField.current.focus();
  }, [create]);
  // A touch screen has no Ctrl or Cmd key, so the editor names the key that saves only where one exists, as the composer does.
  const coarse = useCoarse();
  // The heading names the page by its title, as the tree and the page do, and by its name only without one.
  const listed = useSelect((s) => (initial ? s.pages.byPath[initial] : undefined));
  const [title, setTitle] = useState('');
  const name = title || (listed && listed.title) || pageName(initial || '');

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
        if (p.title) setTitle(p.title);
        setReady(true);
        // The text opens at its top, with the caret at its start: a person reads a page from the top.
        requestAnimationFrame(() => {
          const t = box.current;
          if (!t) return;
          t.focus({ preventScroll: true });
          t.setSelectionRange(0, 0);
          t.scrollTop = 0;
        });
      })
      .catch(showError);
  }, [initial, create]);

  const keep = (t: string, s: string) => {
    if (!create && initial) writeDraft(initial, { text: t, summary: s, base });
  };

  const save = async (over?: string) => {
    // A new path gets .md when the person leaves it out, and the page checks
    // the rule of the store before it sends anything.
    const target = create ? newPath(path) : initial || '';
    const why = pageReason(target);
    if (why) {
      if (create) {
        setTaken(why);
        if (pathField.current) pathField.current.focus();
      } else showError(new Error(why));
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
          // The refusal sits under the field that it asks to change, and the page that holds the name is a link.
          setTaken(TAKEN);
          if (pathField.current) pathField.current.focus();
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

  const target = create ? newPath(path) : initial || '';
  const why = create && path.trim() ? pageReason(target) || taken : '';
  const cancelHref = create ? '#pages' : hrefOf({ place: 'pages', path: initial || '', mode: 'read' });
  return (
    <section class="screen pageedit" aria-labelledby="edit-title">
      <PaneHeader id="edit-title" title={create ? 'New page' : 'Edit ' + name} size="title" level={1} back={{ href: cancelHref, label: create ? 'Wiki' : name, to: 'here' }} />
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
          <Field label="Name" error={why}>
            <Input
              ref={pathField}
              value={path}
              required
              invalid={!!why}
              placeholder="runbooks/deploy"
              spellcheck={false}
              onInput={(e) => {
                setPath((e.target as HTMLInputElement).value);
                setTaken('');
              }}
            />
            {!why && target && <span class="t-meta">The page will be {target}.</span>}
          </Field>
        )}
        {create && taken === TAKEN && (
          <p class="t-meta taken-link">
            <a href={hrefOf({ place: 'pages', path: target, mode: 'edit' })}>Edit {target}</a>
          </p>
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
          {!coarse && (
            <span class="kbd" aria-hidden="true">
              {keyWords()}
            </span>
          )}
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
