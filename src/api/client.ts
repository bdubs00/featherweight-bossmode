// The client of the workbench API. Every call goes to the same origin,
// under /v1, with the bearer token that the page at /ui keeps in
// sessionStorage under fw.token. An error is an RFC 9457 problem document,
// and the page shows its detail in one sentence.

/** The key of the one token in sessionStorage. The page at /ui uses it too. */
export const TOKEN_KEY = 'fw.token';

/** getToken returns the token of this tab, or "" when there is none. */
export function getToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

/** setToken keeps a token for this tab. */
export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The browser keeps no storage. The token then lives for no request.
  }
}

/** clearToken forgets the token of this tab. */
export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // No storage, so nothing to forget.
  }
}

/** A problem document of RFC 9457. The workbench adds signin on a 401. */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  signin?: string;
  [key: string]: unknown;
}

/** ApiError is a failed call. Its message is one sentence for a person. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem | null;

  constructor(status: number, problem: Problem | null, statusText = '') {
    super(problemSentence(problem, status, statusText));
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

/**
 * SigninNeeded is the error of a 401. signinUrl is the sign-in route of the
 * problem document when it names a safe path on this origin, else "".
 */
export class SigninNeeded extends ApiError {
  readonly signinUrl: string;
  /** The path of the request that answered 401, or "" when unknown. */
  readonly path: string;

  constructor(problem: Problem | null, path = '') {
    super(401, problem);
    this.name = 'SigninNeeded';
    this.message = 'Your access token did not work.';
    this.signinUrl = safeSignin(problem && problem.signin);
    this.path = path;
  }
}

/**
 * safeSignin keeps a sign-in route only when it is a path on this origin.
 * A full address or a path that starts with two slashes can send the
 * person to another site, so the page ignores it.
 */
export function safeSignin(value: unknown): string {
  if (typeof value !== 'string') return '';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '';
  if (/[\u0000-\u001f\u007f]/.test(value)) return '';
  return value;
}

/**
 * oneSentence turns the detail of a problem into one sentence for a person.
 * A server error names its packages first, such as "bridges: fw: the run is
 * gone". The person reads the last part, with a capital and a period.
 */
export function oneSentence(text: string): string {
  let s = String(text || '').trim();
  s = s.replace(/^.*\bfw: /, '').replace(/^(?:[a-z][a-z0-9]*: )+/, '');
  const end = s.search(/[.!?](\s|$)/);
  if (end >= 0) s = s.slice(0, end + 1);
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s[0].toUpperCase() + s.slice(1);
  if (!/[.!?]$/.test(s)) s += '.';
  return s;
}

/** problemSentence is the sentence that the page shows for a failed call. */
export function problemSentence(problem: Problem | null, status: number, statusText = ''): string {
  const detail = problem && typeof problem.detail === 'string' ? oneSentence(problem.detail) : '';
  if (detail) return detail;
  const title = problem && typeof problem.title === 'string' ? oneSentence(problem.title) : '';
  if (title) return title;
  if (status === 0) return 'The workbench did not answer. Check the connection and try again.';
  return oneSentence(`The workbench answered ${status}${statusText ? ' ' + statusText : ''}`);
}

/** The fetch function. A test replaces it. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (input, init) => fetch(input, init);

/** setFetch replaces the fetch function, for a test. It returns the old one. */
export function setFetch(f: FetchLike): FetchLike {
  const old = fetchImpl;
  fetchImpl = f;
  return old;
}

/** The handler of a 401, which the app sets. */
let onUnauthorized: (e: SigninNeeded) => void = () => {};

/** setUnauthorizedHandler sets what the page does on a 401. */
export function setUnauthorizedHandler(f: (e: SigninNeeded) => void): void {
  onUnauthorized = f;
}

export interface CallOptions {
  method?: string;
  /** A JSON body, or a string or Blob sent as it is. */
  body?: unknown;
  headers?: Record<string, string>;
  accept?: string;
  signal?: AbortSignal;
}

/** authHeaders is the Authorization header of the token, or nothing. */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: 'Bearer ' + t } : {};
}

/** readProblem reads the problem document of an answer, or null. */
async function readProblem(res: Response): Promise<Problem | null> {
  try {
    const raw = await res.text();
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Problem) : null;
  } catch {
    return null;
  }
}

/**
 * send makes one call and returns the answer. A 401 throws SigninNeeded and
 * calls the handler of the app. Any other failure throws ApiError.
 */
export async function send(path: string, opts: CallOptions = {}): Promise<Response> {
  if (!path.startsWith('/')) throw new Error('The page calls only its own origin.');
  const headers: Record<string, string> = { Accept: opts.accept || 'application/json', ...authHeaders(), ...(opts.headers || {}) };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (typeof opts.body === 'string' || opts.body instanceof Blob) {
      body = opts.body as BodyInit;
    } else {
      body = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    }
  }
  let res: Response;
  try {
    res = await fetchImpl(path, { method: opts.method || 'GET', headers, body, signal: opts.signal, credentials: 'same-origin' });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, null);
  }
  if (res.status === 401) {
    const err = new SigninNeeded(await readProblem(res), path);
    onUnauthorized(err);
    throw err;
  }
  if (!res.ok) throw new ApiError(res.status, await readProblem(res), res.statusText);
  return res;
}

/** call makes one call and returns its JSON, or null for an empty answer. */
export async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return null as T;
  const raw = await res.text();
  if (!raw) return null as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(res.status, { detail: 'The workbench answered with something that is not JSON. Reload the page.' });
  }
}

/** enc encodes one part of a path. */
export const enc = (s: string | number): string => encodeURIComponent(String(s));

/** encPath encodes a path of several parts, such as a page path. */
export const encPath = (p: string): string => p.split('/').map(enc).join('/');

/** query builds a query string from the values that are set. */
export function query(params: Record<string, string | number | undefined | null | false>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === false || v === '') continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? '?' + s : '';
}

/**
 * browserZone is the IANA time zone of the browser, such as
 * America/New_York, or UTC where the browser names none. The duties read a
 * time that a person says in this zone.
 */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
