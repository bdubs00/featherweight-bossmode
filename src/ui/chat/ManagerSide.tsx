// The pane at the right of the Manager: what it does, the channels it
// opened for the person, and its conversations, newest first, with New.

import { useEffect, useMemo } from 'preact/hooks';
import { useSelect } from '../../state/store';
import { loadManagerChats } from '../../state/actions';
import { managerRunOf } from '../../state/reducer';
import { chatTitle } from '../../lib/chat';
import { Glyph } from '../icons';
import { Button } from '../primitives';
import { chatHref } from './route';
import { shortTime } from './channels';

export function ManagerSide() {
  useEffect(() => {
    loadManagerChats().catch(() => {});
  }, []);
  const face = useSelect((s) => (s.config && s.config.manager ? s.faces[s.config.manager.agent] : undefined));
  const ids = useSelect((s) => s.managerChats.ids);
  const runs = useSelect((s) => s.runs);
  const current = useSelect(managerRunOf);
  const list = useMemo(
    () =>
      ids
        .map((id) => runs[id])
        .filter((r) => r && !r.hidden)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [ids, runs],
  );
  const bridges = useSelect((s) => s.bridges);
  const opened = bridges.order.map((id) => bridges.byId[id]).filter((b) => b.manager && b.state === 'open');
  return (
    <section class="cf-members" aria-labelledby="cf-mgr-h">
      <header class="cf-head cf-head-right">
        <a class="cf-back" href={chatHref({ view: 'manager' })} aria-label="Back to the Manager">
          <Glyph name="back" size={20} />
        </a>
        <h2 class="cf-title cf-title-s" id="cf-mgr-h">
          Manager
        </h2>
        <Button size="s" href={chatHref({ view: 'manager', fresh: true })}>
          New
        </Button>
      </header>
      <div class="cf-members-scroll">
        <section class="cf-msec">
          <p class="cf-mrow-line">{(face && face.tagline) || 'Ask it for work. It opens a channel and puts agents on it.'}</p>
        </section>
        {opened.length > 0 && (
          <section class="cf-msec" aria-labelledby="cf-mgr-opened">
            <h3 class="cf-msec-head" id="cf-mgr-opened">
              <span>Channels it runs</span>
              <span class="cf-sec-n">{opened.length}</span>
            </h3>
            <ul class="cf-files">
              {opened.map((b) => (
                <li>
                  <a href={chatHref({ view: 'channel', id: b.id, tab: 'posts' })}># {b.title}</a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section class="cf-msec" aria-labelledby="cf-mgr-convs">
          <h3 class="cf-msec-head" id="cf-mgr-convs">
            <span>Conversations</span>
            <span class="cf-sec-n">{list.length}</span>
          </h3>
          <ul class="cf-convs">
            {list.map((r) => (
              <li>
                <a href={chatHref({ view: 'manager', run: r.id })} aria-current={r.id === current ? 'page' : undefined} class={r.id === current ? 'on' : ''}>
                  <span class="cf-conv-title">{chatTitle(r)}</span>
                  <span class="cf-row-time">{shortTime(r.updatedAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
