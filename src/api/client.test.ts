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
  REFRESH_PATH,
  renewToken,
  resumeRenewal,
  scheduleRenewal,
  stopRenewal,
  tokenExpiry,
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

/** jwt is a token with an exp claim in seconds and a fake signature. */
function jwt(expSeconds: number): string {
  const b64 = (v: string) => btoa(v).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64('{"alg":"RS256"}') + '.' + b64(JSON.stringify({ sub: 'carol', exp: expSeconds })) + '.c2ln';
}

describe('the renewal of the token', () => {
  let seen: { url: string; method: string; auth: string }[] = [];
  let answers: Record<string, () => Response>;
  let old: FetchLike;

  beforeEach(() => {
    sessionStorage.clear();
    seen = [];
    answers = {};
    setUnauthorizedHandler(() => {});
    old = setFetch(async (url, init) => {
      const method = (init && init.method) || 'GET';
      const auth = String(((init && init.headers) as Record<string, string> | undefined)?.Authorization || '');
      seen.push({ url, method, auth });
      const a = answers[method + ' ' + url];
      return a ? a() : json(404, { status: 404 });
    });
  });
  afterEach(() => {
    setFetch(old);
    resumeRenewal();
    vi.useRealTimers();
  });

  it('reads the expiry of a JWT, and nothing from another token', () => {
    expect(tokenExpiry(jwt(1893456000))).toBe(1893456000_000);
    expect(tokenExpiry('opaque')).toBe(0);
    expect(tokenExpiry('a.b.c')).toBe(0);
  });

  it('renews after a 401 and tries the call once more with the new token', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setToken('old');
    let n = 0;
    answers['GET /v1/bridges'] = () => (n++ === 0 ? json(401, { status: 401, signin: '/ui/signin' }) : json(200, { bridges: [] }));
    answers['POST ' + REFRESH_PATH] = () => json(200, { token: 'new', expiresAt: '2030-01-01T00:00:00Z' });
    expect(await call('/v1/bridges')).toEqual({ bridges: [] });
    expect(getToken()).toBe('new');
    expect(seen.map((s) => s.method + ' ' + s.url + ' ' + s.auth)).toEqual(['GET /v1/bridges Bearer old', 'POST /ui/refresh ', 'GET /v1/bridges Bearer new']);
    expect(handler).not.toHaveBeenCalled();
  });

  it('renews once, and a 401 that stays reaches the handler', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    answers['GET /v1/whoami'] = () => json(401, { status: 401, signin: '/ui/signin' });
    answers['POST ' + REFRESH_PATH] = () => json(200, { token: 'new' });
    const err = await failure(call('/v1/whoami'));
    expect(err).toBeInstanceOf(SigninNeeded);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(seen.filter((s) => s.url === REFRESH_PATH)).toHaveLength(1);
  });

  it('sends one renewal for calls at the same time', async () => {
    let n = 0;
    answers['GET /v1/a'] = () => (n++ < 2 ? json(401, { status: 401 }) : json(200, {}));
    answers['POST ' + REFRESH_PATH] = () => json(200, { token: 'new' });
    await Promise.all([call('/v1/a'), call('/v1/a')]);
    expect(seen.filter((s) => s.url === REFRESH_PATH)).toHaveLength(1);
  });

  it('gives up without a sign-in to renew', async () => {
    answers['POST ' + REFRESH_PATH] = () => json(401, { status: 401, signin: '/ui/signin' });
    expect(await renewToken()).toBe(false);
    expect(getToken()).toBe('');
  });

  it('stops after a sign-out and tells the workbench to forget the sign-in', async () => {
    answers['DELETE ' + REFRESH_PATH] = () => new Response(null, { status: 204 });
    answers['POST ' + REFRESH_PATH] = () => json(200, { token: 'new' });
    await stopRenewal();
    expect(await renewToken()).toBe(false);
    expect(seen.map((s) => s.method + ' ' + s.url)).toEqual(['DELETE /ui/refresh']);
  });

  it('renews a minute before the token expires', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    setToken(jwt(Math.floor(now / 1000) + 300));
    answers['POST ' + REFRESH_PATH] = () => json(200, { token: 'renewed' });
    scheduleRenewal(now);
    await vi.advanceTimersByTimeAsync(230_000);
    expect(seen).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(seen.map((s) => s.method + ' ' + s.url)).toEqual(['POST /ui/refresh']);
    expect(getToken()).toBe('renewed');
  });

  it('plans nothing for a token without an expiry', async () => {
    vi.useFakeTimers();
    setToken('opaque');
    scheduleRenewal();
    await vi.advanceTimersByTimeAsync(86_400_000 * 2);
    expect(seen).toHaveLength(0);
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
