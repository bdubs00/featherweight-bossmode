// The pages of the work of a bridge, for the tab Wiki of the channel and the
// foot of the members. The list holds the pages under bridges/<id>/ and
// every page whose newest version a run of the bridge wrote, anywhere in
// the wiki, each with the seat that wrote it. The page events keep it
// current (src/state/reducer.ts), and a list that an event left stale is
// read again while a screen shows it.

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { BridgePage } from '../api/types';
import { loadBridgePages } from './actions';
import { seatOfRun } from './reducer';
import { useSelect } from './store';

/** byPath sorts pages by their path, as the route sorts them. */
const byPath = (a: BridgePage, b: BridgePage) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * useBridgePages gives the pages of the work of a bridge, and reads them
 * when the page holds no list, or a stale one. failed is the sentence of a
 * read that failed, which the screen says in place.
 */
export function useBridgePages(id: string): { pages: BridgePage[]; loaded: boolean; failed: string } {
  const held = useSelect((s) => s.bridgePages[id]);
  const missing = !!held && held.missing;
  // A workbench without the route: the pages under bridges/<id>/ of the wiki, with the seat of their run.
  const wiki = useSelect((s) => (missing ? s.pages : null));
  const roster = useSelect((s) => (missing ? s.rosters[id] : undefined));
  const [failed, setFailed] = useState('');
  const want = !held || held.stale;
  useEffect(() => {
    if (!want) return;
    let live = true;
    loadBridgePages(id).then(
      () => live && setFailed(''),
      (e: unknown) => live && setFailed(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [id, want]);
  const pages = useMemo(() => {
    if (!held) return [];
    if (!missing) return Object.values(held.byPath).sort(byPath);
    if (!wiki) return [];
    const head = 'bridges/' + id + '/';
    return Object.values(wiki.byPath)
      .filter((p) => p.path.startsWith(head))
      .map((p) => {
        const seat = seatOfRun(roster, p.run || '');
        return seat ? { ...p, seat } : p;
      })
      .sort(byPath);
  }, [held, wiki, roster, id, missing]);
  return { pages, loaded: !!held && (!missing || !!(wiki && wiki.loaded)), failed };
}
