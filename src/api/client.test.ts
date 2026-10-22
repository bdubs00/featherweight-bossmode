import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  SigninNeeded,
  call,
  clearToken,
  getToken,
  oneSentence,
  problemSentence,
  safeSignin,
  setFetch,
  setToken,
  setUnauthorizedHandler,
  TOKEN_KEY,
  type FetchLike,
} from './client';
import { afterUnauthorized, signinAddress, SIGNIN_AT_KEY, SIGNED_OUT_KEY, LOOP_MS, type Storage } from './auth';

/** failure returns the error of a call that must fail. */
function failure(p: Promise<unknown>): Promise<any> {
  return p.then(
    () => {
      throw new Error('The call did not fail.');
    },
    (e) => e,
  );
}

function json(status: number, body: unknown, type = 'application/json'): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': type } });
}

describe('the token', () => {
  beforeEach(() => sessionStorage.clear());

  it('lives in sessionStorage under fw.token, as on /ui', () => {
    expect(getToken()).toBe('');
    setToken('abc');
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('abc');
    expect(getToken()).toBe('abc');
    clearToken();
    expect(getToken()).toBe('');
  });
});

describe('call', () => {
  let seen: { url: string; init?: RequestInit }[] = [];
  let answer: () => Response;
  let old: FetchLike;

  beforeEach(() => {
    sessionStorage.clear();
    seen = [];
    old = setFetch(async (url, init) => {
      seen.push({ url, init });
      return answer();
    });
  });
  afterEach(() => {
    setFetch(old);
    setUnauthorizedHandler(() => {});
  });

  it('sends the bearer token and JSON', async () => {
    setToken('t0k');
    answer = () => json(200, { ok: true });
    const v = await call<{ ok: boolean }>('/v1/bridges', { method: 'POST', body: { title: 'x' } });
    expect(v.ok).toBe(true);
    const h = seen[0].init!.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer t0k');
    expect(h['Content-Type']).toBe('application/json');
    expect(h.Accept).toBe('application/json');
    expect(seen[0].init!.body).toBe('{"title":"x"}');
  });

  it('sends no Authorization header without a token', async () => {
    answer = () => json(200, {});
    await call('/v1/whoami');
    const h = seen[0].init!.headers as Record<string, string>;
    expect(h.Authorization).toBeUndefined();
  });

  it('refuses an address on another origin', async () => {
    answer = () => json(200, {});
    await expect(call('https://evil.example/v1/whoami')).rejects.toThrow(/own origin/);
    expect(seen).toHaveLength(0);
  });

  it('turns a problem document into one sentence', async () => {
    answer = () => json(409, { type: 'about:blank', title: 'Conflict', status: 409, detail: 'bridges: fw: the seat reviewer is taken. Pick another handle.' }, 'application/problem+json');
    const err = await failure(call('/v1/bridges/x/members', { method: 'POST', body: {} }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe('The seat reviewer is taken.');
    expect(err.problem.title).toBe('Conflict');
  });

  it('falls back to the title, then to the status', async () => {
    answer = () => json(503, { title: 'service unavailable' });
    expect((await failure(call('/v1/fleet'))).message).toBe('Service unavailable.');
    answer = () => new Response('oops', { status: 500, statusText: 'Internal Server Error' });
    expect((await failure(call('/v1/fleet'))).message).toBe('The workbench answered 500 Internal Server Error.');
  });

  it('says so when the network fails', async () => {
    setFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await failure(call('/v1/fleet'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/did not answer/);
  });

  it('throws SigninNeeded on a 401 and calls the handler once', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    answer = () => json(401, { title: 'Unauthorized', status: 401, detail: 'missing bearer token', signin: '/ui/signin' }, 'application/problem+json');
    const err = await failure(call('/v1/whoami'));
    expect(err).toBeInstanceOf(SigninNeeded);
    expect(err.signinUrl).toBe('/ui/signin');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(err);
  });

  it('keeps no sign-in route from a 401 without signin', async () => {
    answer = () => json(401, { title: 'Unauthorized', status: 401 });
    const err = await failure(call('/v1/whoami'));
    expect(err).toBeInstanceOf(SigninNeeded);
    expect(err.signinUrl).toBe('');
  });

  it('answers null for 204', async () => {
    answer = () => new Response(null, { status: 204 });
    expect(await call('/v1/bridges/x/read', { method: 'PUT', body: { seq: 1 } })).toBeNull();
  });
});

describe('the sign-in route', () => {
  it('stays on this origin', () => {
    expect(safeSignin('/ui/signin')).toBe('/ui/signin');
    expect(safeSignin('https://evil.example/signin')).toBe('');
    expect(safeSignin('//evil.example/signin')).toBe('');
    expect(safeSignin('/\\evil.example')).toBe('');
    expect(safeSignin('/ui/signin\n')).toBe('');
    expect(safeSignin(42)).toBe('');
  });

  it('carries the address of the page in next', () => {
    expect(signinAddress('/ui/signin', '/bossmode/#bridge/b1')).toBe('/ui/signin?next=%2Fbossmode%2F%23bridge%2Fb1');
    expect(signinAddress('/ui/signin?hop=1', '/bossmode/')).toBe('/ui/signin?hop=1&next=%2Fbossmode%2F');
    expect(signinAddress('//evil', '/bossmode/')).toBe('');
  });
});

describe('afterUnauthorized', () => {
  const mem = (): Storage & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
  };

  it('goes to the sign-in route with next when the server offers it', () => {
    const store = mem();
    const step = afterUnauthorized({ signinUrl: '/ui/signin', here: '/bossmode/#manager', hadToken: false, now: 1000, store });
    expect(step).toEqual({ kind: 'redirect', url: '/ui/signin?next=%2Fbossmode%2F%23manager' });
    expect(store.m.get(SIGNIN_AT_KEY)).toBe('1000');
  });

  it('shows the token form without a sign-in route', () => {
    const step = afterUnauthorized({ signinUrl: '', here: '/bossmode/', hadToken: false, now: 1000, store: mem() });
    expect(step).toEqual({ kind: 'screen', signinUrl: '', expired: false, returned: false });
  });

  it('does not loop when the sign-in comes back with a token that fails', () => {
    const store = mem();
    store.set(SIGNIN_AT_KEY, '1000');
    const step = afterUnauthorized({ signinUrl: '/ui/signin', here: '/bossmode/', hadToken: true, now: 1000 + LOOP_MS - 1, store });
    expect(step).toEqual({ kind: 'screen', signinUrl: '/ui/signin', expired: true, returned: true });
    const later = afterUnauthorized({ signinUrl: '/ui/signin', here: '/bossmode/', hadToken: true, now: 1000 + LOOP_MS + 1, store });
    expect(later.kind).toBe('redirect');
  });

  it('says that the page came back from a sign-in that did not finish', () => {
    const store = mem();
    store.set(SIGNIN_AT_KEY, '1000');
    const step = afterUnauthorized({ signinUrl: '/ui/signin', here: '/bossmode/', hadToken: false, now: 1000 + 5 * 60_000, store });
    expect(step).toEqual({ kind: 'screen', signinUrl: '/ui/signin', expired: false, returned: true });
  });

  it('stays on the screen after a sign-out', () => {
    const store = mem();
    store.set(SIGNED_OUT_KEY, '1');
    const step = afterUnauthorized({ signinUrl: '/ui/signin', here: '/bossmode/', hadToken: false, now: 5, store });
    expect(step).toEqual({ kind: 'screen', signinUrl: '/ui/signin', expired: false, returned: false });
  });
});

describe('oneSentence', () => {
  it('keeps the first sentence with a capital and a period', () => {
    expect(oneSentence('pages: the page changed since you read it. Read it again.')).toBe('The page changed since you read it.');
    expect(oneSentence('no such bridge')).toBe('No such bridge.');
    expect(oneSentence('')).toBe('');
    expect(problemSentence(null, 404, 'Not Found')).toBe('The workbench answered 404 Not Found.');
  });
});
