// The Library: the wiki, the files that the channels wrote, and the skills
// that agents can load. Its head holds the three tabs, across the whole
// middle. Each tab has the layout of the wiki: a list at the start of the
// middle, and the reader beside it. The wiki (#pages) and Skills (#skills)
// keep their own panes. Files (#library) lists the pages that each channel
// wrote, a group per channel, and the pages that agents wrote outside any
// channel, and opens one in the reader of the wiki (#library/<path>).

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { BridgePage, PageMeta } from '../../api/types';
import { useSelect } from '../../state/store';
import { loadBridgePages, loadPages } from '../../state/actions';
import { attempt } from '../notice';
import { useRoving } from '../keys';
import { PageRow, PageView, Since } from '../Pages';
import { EmptyPane } from '../Shell';
import { Glyph } from '../icons';
import { Chip, Find, PaneHeader, Tabs } from '../primitives';
import { matches } from './TopBar';
import { chatHref } from './route';

export type LibraryTab = 'wiki' | 'files' | 'skills';

/** LibraryHead is the head of the Library, with its tabs, across the whole middle. */
export function LibraryHead({ tab }: { tab: LibraryTab }) {
  return (
    <header class="cf-head cf-library-head">
      <a class="cf-back" href="#" aria-label="Back">
        <Glyph name="back" size={20} />
      </a>
      <h1 class="cf-title">Library</h1>
      <Tabs
        label="Library"
        current={tab}
        items={[
          { id: 'wiki', label: 'Wiki', href: '#pages' },
          { id: 'files', label: 'Files', href: chatHref({ view: 'files' }) },
          { id: 'skills', label: 'Skills', href: '#skills' },
        ]}
      />
    </header>
  );
}

/** A group of the files: the pages of one channel, or the pages that agents wrote outside any channel. */
export interface FileGroup {
  key: string;
  title: string;
  /** The channel of the group, or "" for the pages outside any channel. */
  channel: string;
  pages: PageMeta[];
}

/** The title of the group of the pages that agents wrote outside any channel. */
export const OUTSIDE = 'Outside any channel';

const newest = (pages: PageMeta[]): string => pages.reduce((m, p) => (p.at > m ? p.at : m), '');

/**
 * fileGroups groups the files: one group per channel that wrote a page, by
 * its title, newest first, then the pages that a run of an agent wrote
 * outside any channel. A page shows once, in the first channel that names it.
 */
export function fileGroups(channels: { id: string; title: string; pages: PageMeta[] }[], wiki: PageMeta[]): FileGroup[] {
  const seen = new Set<string>();
  const out: FileGroup[] = [];
  for (const c of channels) {
    const pages = c.pages.filter((p) => !seen.has(p.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
    for (const p of pages) seen.add(p.path);
    if (pages.length) out.push({ key: 'c:' + c.id, title: c.title, channel: c.id, pages });
  }
  out.sort((a, b) => (newest(b.pages) > newest(a.pages) ? 1 : -1));
  const outside = wiki.filter((p) => !!p.run && !seen.has(p.path)).sort((a, b) => (a.path < b.path ? -1 : 1));
  if (outside.length) out.push({ key: 'outside', title: OUTSIDE, channel: '', pages: outside });
  return out;
}

/**
 * folderWords names the folder of a file in words: the title of the channel
 * for the folder of a channel, never its id, else the folder as it is, or
 * the wiki for a page at its top.
 */
export function folderWords(path: string, titles: Record<string, string>): string {
  const i = path.lastIndexOf('/');
  const dir = i < 0 ? '' : path.slice(0, i);
  if (!dir) return 'wiki';
  const m = /^bridges\/([^/]+)(\/.*)?$/.exec(dir);
  if (m) return (titles[m[1]] ? titles[m[1]] : 'a channel that is gone') + (m[2] || '');
  return dir;
}

/** fileName is the name of a file as its title: the last part of its path. */
export const fileName = (path: string): string => path.split('/').pop() || path;

/** useFileGroups reads the pages of each channel and of the wiki, and groups them. */
function useFileGroups(): { groups: FileGroup[]; loaded: boolean; titles: Record<string, string> } {
  const bridges = useSelect((s) => s.bridges);
  const held = useSelect((s) => s.bridgePages);
  const wiki = useSelect((s) => s.pages);
  const ids = bridges.order.join(',');
  // The page reads the pages of each channel once, three at a time, and the stream keeps them.
  useEffect(() => {
    if (!wiki.loaded) attempt(loadPages);
    let live = true;
    const want = bridges.order.filter((id) => !held[id]);
    const next = async () => {
      while (live && want.length) {
        const id = want.shift()!;
        await loadBridgePages(id).catch(() => {});
      }
    };
    void Promise.all([next(), next(), next()]);
    return () => {
      live = false;
    };
  }, [ids]);
  const titles = useMemo(() => Object.fromEntries(Object.values(bridges.byId).map((b) => [b.id, b.title])), [bridges]);
  const groups = useMemo(() => {
    const channels = bridges.order.map((id) => ({ id, title: titles[id] || id, pages: held[id] ? (Object.values(held[id].byPath) as BridgePage[]) : [] }));
    return fileGroups(channels, Object.values(wiki.byPath));
  }, [bridges, held, wiki, titles]);
  const loaded = bridges.loaded && wiki.loaded && bridges.order.every((id) => !!held[id]);
  return { groups, loaded, titles };
}

/** FilesList is the list pane of Files: its count, a search box, and the groups, which fold. */
function FilesList({ current }: { current?: string }) {
  const { groups, loaded, titles } = useFileGroups();
  const [q, setQ] = useState('');
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const list = useRoving<HTMLDivElement>();
  const count = groups.reduce((n, g) => n + g.pages.length, 0);
  const t = q.trim();
  const shown = t
    ? groups.map((g) => ({ ...g, pages: g.pages.filter((p) => matches([p.path, p.title, g.title, folderWords(p.path, titles)].join(' '), t)) })).filter((g) => g.pages.length)
    : groups;
  return (
    <section class="screen pagetree cf-files-list" aria-labelledby="files-title">
      <PaneHeader id="files-title" title="Files" count={loaded ? count : undefined} countLabel={count === 1 ? '1 file' : count + ' files'} />
      <div class="scroll" ref={list}>
        <form class="list-find" role="search" onSubmit={(e) => e.preventDefault()}>
          <Find label="Find a file" value={q} onInput={setQ} />
        </form>
        {!loaded && count === 0 && <p class="empty">Loading the files.</p>}
        {loaded && count === 0 && <p class="empty">No channel has written a file yet.</p>}
        {t && shown.length === 0 && <p class="empty">No file has those words in its name.</p>}
        {shown.map((g) => {
          const open = t ? true : !shut[g.key];
          const id = 'files-' + g.key;
          return (
            <div class="group" role="group" aria-labelledby={id}>
              <button type="button" class="group-head" id={id} aria-expanded={open} onClick={() => setShut({ ...shut, [g.key]: open })}>
                <Glyph name="back" size={14} />
                <span class="clip">{g.title}</span>
                <Chip>{g.pages.length}</Chip>
              </button>
              {open && (
                <div class="c-rows" role="list">
                  {g.pages.map((p) => (
                    <PageRow
                      p={p}
                      current={current}
                      href={chatHref({ view: 'files', path: p.path })}
                      title={fileName(p.path)}
                      meta={
                        <>
                          <span class="clip">{folderWords(p.path, titles)}</span>
                          {p.version ? <span>v{p.version}</span> : null}
                          <Since at={p.at} />
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** FileReader reads one file with the reader of the wiki, with a line to the channel that wrote it. */
function FileReader({ path }: { path: string }) {
  const { groups } = useFileGroups();
  const group = groups.find((g) => g.pages.some((p) => p.path === path));
  const lead =
    group && group.channel ? (
      <p class="note-line cf-file-from">
        <span>Written in the channel</span>
        <a href={chatHref({ view: 'channel', id: group.channel, tab: 'posts' })}># {group.title}</a>
      </p>
    ) : null;
  return <PageView path={path} back={{ href: chatHref({ view: 'files' }), label: 'Files', to: 'list' }} lead={lead} />;
}

/** FilesView is the tab Files of the Library: the list, and the reader of the file that it opens. */
export function FilesView({ path }: { path?: string }) {
  return (
    <section class="cf-view cf-old-view cf-files-view" aria-label="Files">
      <LibraryHead tab="files" />
      <div class="cf-old" data-show={path ? 'main' : 'list'} data-list="1">
        <section class="pane pane-list">
          <FilesList current={path} />
        </section>
        <div class="pane pane-main">
          {path ? (
            <FileReader path={path} />
          ) : (
            <EmptyPane back={{ href: '#', label: 'the channels' }}>
              <p>Pick a file in the list, or find one by its name.</p>
            </EmptyPane>
          )}
        </div>
      </div>
    </section>
  );
}

