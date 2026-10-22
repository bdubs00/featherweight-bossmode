// The sign-in screen. With browser sign-in on, Sign in goes to /ui/signin
// with next set to the address of the page, and the person comes back to
// the same screen. The token form stays as a quiet way in for a developer,
// or the only way when sign-in is off, as on /ui.

import { useEffect, useRef, useState } from 'preact/hooks';
import { signinAddress } from '../api/auth';
import { Icon } from './icons';

export function Signin(p: { signinUrl: string; expired: boolean; error: string; onToken: (t: string) => void }) {
  const [token, setToken] = useState('');
  const go = useRef<HTMLAnchorElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const here = location.pathname + location.search + location.hash;
  const url = p.signinUrl ? signinAddress(p.signinUrl, here) : '';
  useEffect(() => {
    if (url && go.current) go.current.focus();
    else if (field.current) field.current.focus();
  }, [url]);
  const form = (
    <form
      class="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (token.trim()) p.onToken(token.trim());
      }}
    >
      <label class="fld">
        <span>Access token</span>
        <input ref={field} type="password" autoComplete="off" required value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
      </label>
      <button type="submit" class={'btn wide' + (url ? '' : ' primary')}>
        Continue
      </button>
    </form>
  );
  return (
    <main class="signin" aria-labelledby="signin-title">
      <span class="brand big">
        <Icon name="feather" />
      </span>
      <h1 id="signin-title">Sign in</h1>
      <p class="lede">{url ? (p.expired ? 'Your sign-in ended. Sign in again to go on. Your drafts stay.' : 'Sign in to run your fleet.') : 'Paste your access token to run your fleet.'}</p>
      {p.error && (
        <p class="alert" role="alert">
          {p.error}
        </p>
      )}
      {url ? (
        <>
          <a ref={go} class="btn primary wide" href={url}>
            Sign in
          </a>
          <details class="token-way" open={!!p.error}>
            <summary>Use an access token</summary>
            {form}
          </details>
        </>
      ) : (
        form
      )}
    </main>
  );
}
