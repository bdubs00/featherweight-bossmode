// The build of the page. The build writes it into the head of index.html
// (vite.config.ts), and the front names the build that it serves on the
// answer of each stream (docs/CONTRACT.md, section 10). When the two
// differ, a deploy put out a new page while this tab ran the old one, so
// the page offers a reload. The person decides when.

import { useEffect, useState } from 'preact/hooks';

/** The name of the element that holds the build in the head of index.html. */
export const BUILD_META = 'bossmode-build';

/** ownBuild is the build that runs in this tab, or "" when the page has none, as in development. */
export function ownBuild(): string {
  const m = document.querySelector('meta[name="' + BUILD_META + '"]');
  return (m && m.getAttribute('content')) || '';
}

/** served is the build that the front named last, "" when it named none. */
let served = '';
/** setAside is the build that the person dismissed, so its offer does not come back. */
let setAside = '';
const listeners = new Set<() => void>();

const tell = () => {
  for (const f of [...listeners]) f();
};

/**
 * sawBuild takes the build that the front names on the answer of a stream.
 * A front that names none, such as an older one, ends the offer, because
 * the page then cannot tell.
 */
export function sawBuild(build: string): void {
  if (build === served) return;
  served = build;
  tell();
}

/** newBuild is the build to offer: the build of the front when it is not the build of this tab and the person did not dismiss it, else "". */
export function newBuild(): string {
  const own = ownBuild();
  return served && own && served !== own && served !== setAside ? served : '';
}

/** dismissBuild hides the offer of the build that the front names now. A later build offers again. */
export function dismissBuild(): void {
  setAside = served;
  tell();
}

/** useNewBuild is newBuild, drawn again when it changes. */
export function useNewBuild(): string {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return newBuild();
}

/** resetBuild forgets what the front named and what the person dismissed, for a test. */
export function resetBuild(): void {
  served = '';
  setAside = '';
}
