// The sign-in screen. With browser sign-in on, Sign in goes to /ui/signin
// with next set to the address of the page, and the person comes back to
// the same screen. The token form stays as a way in for a developer, or the
// only way when sign-in is off. After a sign-in that did not finish, the
// token form is open, so a person whose issuer is down still gets in.

import { useEffect, useRef, useState } from 'preact/hooks';
import { signinAddress } from '../api/auth';
import { useSelect } from '../state/store';
import { themeOf } from '../lib/theme';
import { Button, Card, Field, Input, buttonClass } from './primitives';

export function Signin(p: { signinUrl: string; expired: boolean; returned: boolean; error: string; here: string; onToken: (t: string) => void }) {
  const [token, setToken] = useState('');
  const go = useRef<HTMLAnchorElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const name = themeOf(useSelect((s) => s.config)).name;
  const url = p.signinUrl ? signinAddress(p.signinUrl, p.here) : '';
  useEffect(() => {
    if (url && go.current) go.current.focus();
    else if (field.current) field.current.focus();
  }, [url]);
  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (token.trim()) p.onToken(token.trim());
      }}
    >
      <Field label="Access token">
        <Input ref={field} type="password" autoComplete="off" required value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
      </Field>
      <Button type="submit" kind={url ? 'secondary' : 'primary'}>
        Continue
      </Button>
    </form>
  );
  return (
    <main class="signin" aria-labelledby="signin-title">
      <Card label="Sign in">
        <h1 id="signin-title" class="t-title">
          {name ? 'Sign in to ' + name : 'Sign in'}
        </h1>
        <p class="lede">
          {p.expired
            ? 'Your sign-in ended. Sign in again, and your drafts stay.'
            : p.returned
              ? 'The sign-in did not finish. Sign in again, or use an access token.'
              : url
                ? 'Sign in to run your fleet.'
                : 'Paste your access token to run your fleet.'}
        </p>
        {p.error && (
          <p class="alert" role="alert">
            {p.error}
          </p>
        )}
        {url ? (
          <>
            <a ref={go} class={buttonClass('primary')} href={url}>
              Sign in
            </a>
            <details class="token-way" open={!!p.error || p.returned}>
              <summary>Use an access token</summary>
              {form}
            </details>
          </>
        ) : (
          form
        )}
      </Card>
    </main>
  );
}
