import { afterEach, describe, expect, it } from 'vitest';
import { Signin } from './Signin';
import { mount, unmountAll } from './testkit-b';

afterEach(unmountAll);

const show = (returned: boolean, error = '') =>
  mount(<Signin signinUrl="/ui/signin" expired={false} returned={returned} error={error} here="/bossmode/" onToken={() => {}} />);

describe('the sign-in screen', () => {
  it('offers the sign-in first and folds the token way on a first visit', () => {
    const root = show(false);
    expect(root.querySelector('a[href^="/ui/signin"]')?.textContent?.trim()).toBe('Sign in');
    expect(root.querySelector('.lede')?.textContent).toBe('Sign in to run your fleet.');
    expect((root.querySelector('details.token-way') as HTMLDetailsElement).open).toBe(false);
  });

  it('opens the token way after a sign-in that did not finish', () => {
    const root = show(true);
    expect(root.querySelector('.lede')?.textContent).toBe('The sign-in did not finish. Sign in again, or use an access token.');
    expect((root.querySelector('details.token-way') as HTMLDetailsElement).open).toBe(true);
    expect(root.querySelector('input[type=password]')).not.toBeNull();
  });

  it('opens the token way with the error of a token that did not work', () => {
    const root = show(false, 'That access token did not work. Check it, or sign in.');
    expect(root.querySelector('[role=alert]')?.textContent).toContain('did not work');
    expect((root.querySelector('details.token-way') as HTMLDetailsElement).open).toBe(true);
  });
});
