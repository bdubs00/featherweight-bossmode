// What the page does on a 401. With browser sign-in on, the problem
// document names /ui/signin, and the page goes there with next set to its
// own address, so the person comes back to the same screen. Without it, a
// small token form is the screen, as on /ui.

import { safeSignin } from './client';

/** The key that remembers the last move to the sign-in route. */
export const SIGNIN_AT_KEY = 'fw.bossmode.signinAt';

/** The key that remembers that the person signed out in this tab. */
export const SIGNED_OUT_KEY = 'fw.bossmode.signedOut';

/**
 * LOOP_MS is how long the page waits before it goes to sign-in again on its
 * own. Without the wait, a sign-in that comes back with a token that fails
 * at once sends the page back and forth. It is ten minutes, so a person who
 * comes back from a sign-in that did not finish sees the screen, also after
 * a pause.
 */
export const LOOP_MS = 600_000;

export interface Storage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** sessionStore is the session storage of the tab, with no error. */
export const sessionStore: Storage = {
  get: (k) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      // No storage.
    }
  },
  remove: (k) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      // No storage.
    }
  },
};

/** signinAddress is the sign-in route with next set to the address here. */
export function signinAddress(signinUrl: string, here: string): string {
  const base = safeSignin(signinUrl);
  if (!base) return '';
  return base + (base.includes('?') ? '&' : '?') + 'next=' + encodeURIComponent(here);
}

/**
 * The next step of the page after a 401. On the screen, returned is true
 * when the page went to the sign-in in this tab and came back without a
 * session, so the screen opens the token way.
 */
export type SigninStep =
  | { kind: 'redirect'; url: string }
  | { kind: 'screen'; signinUrl: string; expired: boolean; returned: boolean };

/**
 * afterUnauthorized decides the next step after a 401. The page goes to the
 * sign-in route on its own unless the person signed out in this tab, or the
 * page went there less than LOOP_MS ago. Then it shows the sign-in screen,
 * with a Sign in link when the server offers sign-in, and the token form.
 */
export function afterUnauthorized(opts: {
  signinUrl: string;
  here: string;
  hadToken: boolean;
  now: number;
  store: Storage;
}): SigninStep {
  const { store, now } = opts;
  const url = signinAddress(opts.signinUrl, opts.here);
  if (!url) return { kind: 'screen', signinUrl: '', expired: opts.hadToken, returned: false };
  const signedOut = store.get(SIGNED_OUT_KEY) === '1';
  const last = Number(store.get(SIGNIN_AT_KEY) || '0');
  const returned = last > 0 && now - last < LOOP_MS;
  if (signedOut || returned) {
    return { kind: 'screen', signinUrl: opts.signinUrl, expired: opts.hadToken, returned: returned && !signedOut };
  }
  store.set(SIGNIN_AT_KEY, String(now));
  return { kind: 'redirect', url };
}

/** markSignedOut remembers that the person signed out, so no move follows. */
export function markSignedOut(store: Storage = sessionStore): void {
  store.set(SIGNED_OUT_KEY, '1');
}

/** clearSigninMarks forgets both marks after a call that worked. */
export function clearSigninMarks(store: Storage = sessionStore): void {
  store.remove(SIGNED_OUT_KEY);
  store.remove(SIGNIN_AT_KEY);
}
