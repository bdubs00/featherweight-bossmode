// The notification settings of the person who is signed in, as the dialog
// Notifications holds them, and back to the body of PUT /v1/notifications.
// The page never reads a token: the front answers "set" or "". A save
// sends "set" to keep the stored token, "" to clear it, or the new token.
// Quiet hours that are off go as two empty times.

import type { NotifyRead, NotifySettings } from '../api/types';
import { problemsBy } from './duties';

/** The form of the dialog. token is what the person typed. saved is true while a stored token stays. */
export interface NotifyForm {
  server: string;
  topic: string;
  token: string;
  saved: boolean;
  questions: boolean;
  failures: boolean;
  digest: boolean;
  quiet: boolean;
  from: string;
  to: string;
  timeZone: string;
}

/** notifyFormOf reads the settings into the form. Quiet hours that are off default to 22:00 to 07:00 in the zone of the browser. */
export function notifyFormOf(r: NotifyRead | null, zone: string): NotifyForm {
  const n = (r && r.ntfy) || { server: '', topic: '', token: '' };
  const send = (r && r.send) || { questions: true, failures: true, digest: false };
  const q = (r && r.quietHours) || { from: '', to: '', timeZone: '' };
  const quiet = !!(q.from && q.to);
  return {
    server: n.server || '',
    topic: n.topic || '',
    token: '',
    saved: n.token === 'set',
    questions: !!send.questions,
    failures: !!send.failures,
    digest: !!send.digest,
    quiet,
    from: quiet ? q.from : '22:00',
    to: quiet ? q.to : '07:00',
    // Quiet hours that are off start in the zone of the browser.
    timeZone: (quiet && q.timeZone) || zone || 'UTC',
  };
}

/** notifyBodyOf writes the body of PUT /v1/notifications. */
export function notifyBodyOf(f: NotifyForm): NotifySettings {
  const typed = f.token.trim();
  return {
    ntfy: { server: f.server.trim(), topic: f.topic.trim(), token: typed ? typed : f.saved ? 'set' : '' },
    send: { questions: f.questions, failures: f.failures, digest: f.digest },
    quietHours: f.quiet ? { from: f.from, to: f.to, timeZone: f.timeZone } : { from: '', to: '', timeZone: f.timeZone },
  };
}

/** The errors of the form before a save, by field. */
export interface NotifyErrors {
  server?: string;
  topic?: string;
  quiet?: string;
}

/** notifyErrors says what is wrong with the form: a server that is no address, no topic while something goes out, or quiet hours without both times. */
export function notifyErrors(f: NotifyForm): NotifyErrors {
  const e: NotifyErrors = {};
  const s = f.server.trim();
  if (s && !/^https?:\/\/[^\s/]+/.test(s)) e.server = 'Write the address of the server, such as https://ntfy.sh.';
  if (!f.topic.trim() && (f.questions || f.failures || f.digest)) e.topic = 'Write the topic that your phone follows.';
  else if (/\s|\//.test(f.topic.trim())) e.topic = 'A topic holds no space and no slash.';
  if (f.quiet && (!f.from || !f.to)) e.quiet = 'Pick both times.';
  return e;
}

/** The places of the dialog that show a problem of the front. */
export type NotifySlot = 'server' | 'topic' | 'token' | 'send' | 'quiet';

/** notifySlot names the place of the dialog for the path of a problem, or top. */
export function notifySlot(path: string): NotifySlot | 'top' {
  const [root, leaf] = path.split('.');
  if (root === 'ntfy') return leaf === 'server' || leaf === 'topic' || leaf === 'token' ? leaf : 'top';
  if (root === 'send') return 'send';
  if (root === 'quietHours') return 'quiet';
  return 'top';
}

/** notifyProblems sorts the problems of a 400 by the place of the dialog that shows them. */
export const notifyProblems = (ps: unknown[] | null | undefined) => problemsBy(ps, notifySlot);
