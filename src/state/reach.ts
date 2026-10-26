// Whether the page reaches its server. Three signs say that it does not:
// the browser says that it is offline, the last call got no answer (or the
// answer of a proxy whose server is gone), or the stream has been lost for
// REACH_GRACE_MS while no call got an answer. The first connect of the
// stream is no sign. Any answer, and a stream that is live again, says
// that the page reaches the server again.
//
// While the page reaches no server, it tries again: it reads GET
// /v1/whoami each PROBE_MS, and at once when the browser comes online. The
// stream also connects again on its own. The shell shows the bar Offline.
// Trying again., and the figures of the page show as stale.

import { useEffect, useState } from 'preact/hooks';
import { store } from './store';

/** How long the stream may be lost before it counts as a sign, in milliseconds. A quick reconnect of the stream is no news. */
export const REACH_GRACE_MS = 10_000;

/** How often the page tries again while it reaches no server, in milliseconds. */
export const PROBE_MS = 10_000;

/** The answers of a proxy whose server does not answer. */
const GONE = [502, 503, 504];

let browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
let failed = false;
let lastAnswer = 0;
let downSince = 0;
let now = () => Date.now();
const listeners = new Set<() => void>();
let shown = false;

/** tell redraws the views when the answer of isOffline changed since they last read it. */
const tell = () => {
  const v = isOffline();
  if (v === shown) return;
  shown = v;
  for (const f of [...listeners]) f();
};

/**
 * noteAnswer notes the end of one call: status is the HTTP status of its
 * answer, or 0 for a call that got none. The client calls it for each call.
 */
export function noteAnswer(status: number): void {
  if (status === 0 || GONE.includes(status)) failed = true;
  else {
    failed = false;
    lastAnswer = now();
  }
  tell();
}

/** noteStream notes the status of the stream: live, connecting, lost, or closed. Only a lost stream is a sign: a stream that the page closed, or that connects for the first time, is none. */
export function noteStream(status: string): void {
  if (status === 'live') {
    downSince = 0;
    failed = false;
    lastAnswer = now();
  } else if (status === 'closed') downSince = 0;
  else if (status === 'lost' && !downSince) downSince = now();
  tell();
}

/** noteBrowser notes what the browser says of its network: online or not. */
export function noteBrowser(online: boolean): void {
  browserOffline = !online;
  tell();
}

/** isOffline reports whether the page reaches no server now. */
export function isOffline(at = now()): boolean {
  if (browserOffline || failed) return true;
  return downSince > 0 && at - downSince >= REACH_GRACE_MS && lastAnswer <= downSince;
}

/** forgetReach starts the state again, with a clock of its own, for the tests. */
export function forgetReach(clock: () => number = () => Date.now()): void {
  browserOffline = false;
  failed = false;
  lastAnswer = 0;
  downSince = 0;
  now = clock;
  tell();
}

/** checkReach reads the clock again, so a stream that has been down for long turns into the sign. The watch calls it each second. */
export function checkReach(): void {
  tell();
}

/**
 * watchReach follows the stream of the store and the network of the
 * browser, and tries again with probe while the page reaches no server. It
 * returns the end of the watch.
 */
export function watchReach(probe: () => Promise<unknown>): () => void {
  let last = store.get().stream.status;
  noteStream(last);
  const off = store.subscribe(() => {
    const s = store.get().stream.status;
    if (s === last) return;
    last = s;
    noteStream(s);
  });
  const tryAgain = () => {
    probe().catch(() => {});
  };
  const online = () => {
    noteBrowser(true);
    tryAgain();
  };
  const offline = () => noteBrowser(false);
  addEventListener('online', online);
  addEventListener('offline', offline);
  const timer = setInterval(() => {
    if (isOffline()) tryAgain();
  }, PROBE_MS);
  // No event marks the moment when a stream has been down for long, so the watch reads the clock each second.
  const grace = setInterval(checkReach, 1000);
  return () => {
    off();
    removeEventListener('online', online);
    removeEventListener('offline', offline);
    clearInterval(timer);
    clearInterval(grace);
  };
}

/** useOffline reports whether the page reaches no server, and redraws when that changes. */
export function useOffline(): boolean {
  const [v, setV] = useState(isOffline);
  useEffect(() => {
    const f = () => setV(shown);
    listeners.add(f);
    tell();
    setV(isOffline());
    return () => {
      listeners.delete(f);
    };
  }, []);
  return v;
}
