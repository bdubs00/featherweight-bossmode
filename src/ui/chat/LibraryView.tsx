// The Library: the wiki, the files that the channels wrote, and the skills
// that agents can load. Its head holds the three tabs. The wiki (#pages) and
// Skills (#skills) keep their own panes under it; Files lists the pages of
// each channel, newest channel first.

import { useMemo } from 'preact/hooks';
import { useSelect } from '../../state/store';
import { useBridgePages } from '../../state/bridgepages';
import { Glyph } from '../icons';
import { Tabs } from '../primitives';
import { chatHref } from './route';

export type LibraryTab = 'wiki' | 'files' | 'skills';

/** LibraryHead is the head of the Library, with its tabs. */
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

const pageHref = (path: string) => '#pages/' + path.split('/').map(encodeURIComponent).join('/');

function ChannelFiles({ id }: { id: string }) {
  const title = useSelect((s) => (s.bridges.byId[id] ? s.bridges.byId[id].title : id));
  const { pages, loaded, failed } = useBridgePages(id);
  if (loaded && !failed && pages.length === 0) return null;
  return (
    <section class="cf-asec">
      <h2 class="cf-asec-head">
        <a href={chatHref({ view: 'channel', id, tab: 'wiki' })}># {title}</a>
      </h2>
      {!loaded && !failed && <p class="cf-post-quiet">Loading the files.</p>}
      {failed && <p class="cf-post-quiet">{failed}</p>}
      <ul class="cf-files">
        {pages.map((p) => (
          <li>
            <a href={pageHref(p.path)} title={p.path}>
              {p.path}
            </a>
            {p.version ? <span class="cf-file-v"> · v{p.version}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** FilesView lists the files that each channel wrote. */
export function FilesView() {
  const bridges = useSelect((s) => s.bridges);
  const ids = useMemo(
    () =>
      bridges.order
        .map((id) => bridges.byId[id])
        .sort((a, b) => (a.state === b.state ? ((b.lastAt || b.createdAt) > (a.lastAt || a.createdAt) ? 1 : -1) : a.state === 'open' ? -1 : 1))
        .map((b) => b.id),
    [bridges],
  );
  return (
    <section class="cf-view cf-library">
      <LibraryHead tab="files" />
      <div class="scroll cf-stream">
        <div class="cf-stream-in cf-list-in">
          {!bridges.loaded && <p class="cf-post-quiet">Loading the channels.</p>}
          {bridges.loaded && ids.length === 0 && <p class="cf-post-quiet">No channel has written a file yet.</p>}
          {ids.map((id) => (
            <ChannelFiles id={id} />
          ))}
        </div>
      </div>
    </section>
  );
}
