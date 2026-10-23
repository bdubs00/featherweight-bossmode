// The live updates of GET /v1/bossmode/stream. EventSource cannot send a
// bearer token, so the page reads the server-sent events over fetch and
// parses them here. A lost stream connects again with Last-Event-ID.

import { authHeaders, SigninNeeded, ApiError, type FetchLike, type Problem } from './client';
import type { StreamEvent } from './types';

/** One message of the event stream format, before its data is parsed. */
export interface SseMessage {
  id: string;
  event: string;
  data: string;
}

/**
 * SseParser reads the event stream format of the HTML standard, one chunk at
 * a time. A line can end with LF, CR, or CR LF, and a chunk can end in the
 * middle of a line. A blank line ends a message. A line that starts with a
 * colon is a comment, such as a keep-alive.
 */
export class SseParser {
  private buf = '';
  private data: string[] = [];
  private event = '';
  private sawCR = false;
  /** The last event id, which outlives a message, as the standard says. */
  lastId = '';
  /** The reconnection time that the server asked for, in milliseconds. */
  retry = 0;

  feed(chunk: string): SseMessage[] {
    const out: SseMessage[] = [];
    let text = chunk;
    // A CR at the end of the last chunk ended a line. An LF right after it
    // belongs to the same line end.
    if (this.sawCR && text.startsWith('\n')) text = text.slice(1);
    this.sawCR = false;
    this.buf += text;
    for (;;) {
      const m = /\r\n|\r|\n/.exec(this.buf);
      if (!m) break;
      if (m[0] === '\r' && m.index === this.buf.length - 1) {
        // The CR can be the first half of CR LF. Take the line now and
        // drop an LF that starts the next chunk.
        this.sawCR = true;
      }
      const line = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      const msg = this.line(line);
      if (msg) out.push(msg);
    }
    return out;
  }

  private line(line: string): SseMessage | null {
    if (line === '') {
      if (this.data.length === 0) {
        this.event = '';
        return null;
      }
      const msg = { id: this.lastId, event: this.event || 'message', data: this.data.join('\n') };
      this.data = [];
      this.event = '';
      return msg;
    }
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'data':
        this.data.push(value);
        break;
      case 'event':
        this.event = value;
        break;
      case 'id':
        if (!value.includes('\u0000')) this.lastId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
    }
    return null;
  }
}

/** toEvent parses the data of a message as JSON. Data that is not JSON is dropped. */
export function toEvent(m: SseMessage): StreamEvent | null {
  if (!m.data) return { id: m.id, kind: m.event, data: null };
  try {
    return { id: m.id, kind: m.event, data: JSON.parse(m.data) };
  } catch {
    return null;
  }
}

export type StreamStatus = 'connecting' | 'live' | 'lost' | 'closed';

/** The header of the answer of the stream that names the build of the page that the front serves. */
export const HEADER_PAGE_BUILD = 'Fw-Page-Build';

export interface StreamOptions {
  url?: string;
  /** The id to resume after, from an earlier stream of this tab. */
  lastId?: string;
  onEvent: (e: StreamEvent) => void;
  onStatus?: (s: StreamStatus) => void;
  onUnauthorized?: (e: SigninNeeded) => void;
  /** Gets the build of the page that the front serves, or "", at each start of the stream. */
  onBuild?: (build: string) => void;
  fetch?: FetchLike;
  /** The waits between attempts, in milliseconds. A test sets them short. */
  backoff?: number[];
  sleep?: (ms: number) => Promise<void>;
  /** The clock, in milliseconds. A test sets it. */
  now?: () => number;
}

export interface StreamHandle {
  close(): void;
  /** The last event id that the page saw. */
  lastId(): string;
}

const BACKOFF = [1000, 2000, 4000, 8000, 15000];

/**
 * QUIET_MS is how long a stream must have lived for its clean close to
 * count as a routine close. The front closes each stream after 15 minutes,
 * and the page then connects again at once, with no lost state. A stream
 * that closes sooner waits first, so a server that closes at once never
 * makes a tight loop.
 */
export const QUIET_MS = 5000;

/**
 * openStream reads the stream until close. After an error or an end, it
 * waits and connects again with Last-Event-ID. A 401 stops it.
 */
export function openStream(opts: StreamOptions): StreamHandle {
  const url = opts.url || '/v1/bossmode/stream';
  const doFetch = opts.fetch || ((i, init) => fetch(i, init));
  const backoff = opts.backoff || BACKOFF;
  const sleep = opts.sleep || ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now || (() => Date.now());
  const ctl = new AbortController();
  let lastId = opts.lastId || '';
  let closed = false;
  const status = (s: StreamStatus) => opts.onStatus && opts.onStatus(s);

  async function once(): Promise<boolean> {
    const headers: Record<string, string> = { Accept: 'text/event-stream', ...authHeaders() };
    if (lastId) headers['Last-Event-ID'] = lastId;
    const res = await doFetch(url, { headers, signal: ctl.signal, cache: 'no-store', credentials: 'same-origin' });
    if (res.status === 401) {
      let p: Problem | null = null;
      try {
        p = (await res.json()) as Problem;
      } catch {
        p = null;
      }
      const err = new SigninNeeded(p, '/v1/bossmode/stream');
      if (opts.onUnauthorized) opts.onUnauthorized(err);
      return false;
    }
    if (!res.ok || !res.body) {
      let p: Problem | null = null;
      try {
        p = (await res.json()) as Problem;
      } catch {
        p = null;
      }
      throw new ApiError(res.status, p, res.statusText);
    }
    status('live');
    if (opts.onBuild) opts.onBuild(res.headers.get(HEADER_PAGE_BUILD) || '');
    const parser = new SseParser();
    parser.lastId = lastId;
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const m of parser.feed(value)) {
        const e = toEvent(m);
        if (m.id) lastId = m.id;
        if (e) opts.onEvent(e);
      }
    }
    return true;
  }

  (async () => {
    let attempt = 0;
    let quiet = false;
    while (!closed) {
      // After a routine close the light stays on Live while the page connects again.
      if (!quiet) status(attempt === 0 ? 'connecting' : 'lost');
      let opened = false;
      const start = now();
      try {
        opened = await once();
        if (!opened && !closed) {
          closed = true;
          status('closed');
          return;
        }
      } catch {
        // A lost connection or a failed answer. The loop tries again.
      }
      if (closed) break;
      if (opened && now() - start >= QUIET_MS) {
        attempt = 0;
        quiet = true;
        continue;
      }
      quiet = false;
      status('lost');
      attempt = opened ? 1 : attempt + 1;
      await sleep(backoff[Math.min(attempt - 1, backoff.length - 1)]);
    }
  })();

  return {
    close() {
      closed = true;
      ctl.abort();
      status('closed');
    },
    lastId: () => lastId,
  };
}
