// The words of a system line of a channel. The backend writes a sentence
// for each line, such as "migrator-2 went to sleep. A message wakes its
// Task." The page shows its own short words for the event of the line,
// with the handle and the person that the sentence names, and keeps the
// sentence of the backend for a tooltip. The functions here are pure, so
// the tests read them without a page.

import type { Entry, Principal } from '../api/types';
import { cap, personName } from './words';

/** The person who reads the page, as GET /v1/whoami names them. */
export type Me = Pick<Principal, 'subject' | 'name' | 'kind'> | null | undefined;

/** The words that the backend uses for the token of the fleet in a line. */
const TOKEN_WORDS = 'the token of the fleet';

/**
 * isMe reports whether a person that an entry names is the person who
 * reads the page: the subject or the name of /v1/whoami, the part of the
 * subject before an @, or the words of the backend for the token of the
 * fleet when the person signed in with it.
 */
export function isMe(who: string | undefined, me: Me): boolean {
  if (!who || !me || !me.subject) return false;
  const w = who.trim().toLowerCase();
  if (!w) return false;
  const subject = me.subject.toLowerCase();
  if (w === subject || w === personName(me.subject).toLowerCase()) return true;
  if (me.name && w === me.name.trim().toLowerCase()) return true;
  return w === TOKEN_WORDS && (subject === 'token' || me.kind === 'token');
}

/** whoName names a person on a message or in a line: You for the person who reads the page, else the short name. */
export function whoName(who: string | undefined, me: Me, display?: string): string {
  if (isMe(who, me)) return 'You';
  const w = (who || '').trim();
  if (w.toLowerCase() === TOKEN_WORDS) return 'token';
  if (w.toLowerCase() === 'somebody' || !w) return 'Someone';
  // A name that the backend writes as words, such as the front, starts the line with a capital.
  if (/^the /i.test(w)) return cap(w);
  return personName(w, display);
}

export interface LineWords {
  /** The words of the page for the line. */
  text: string;
  /** The sentence of the backend, for a tooltip, when the words leave part of it out. */
  title?: string;
  /** A page of the wiki that the line names, such as the report of a bridge. */
  page?: string;
  /** True for a line of an event that the page has no words for: the text is the sentence of the backend, as Markdown. */
  raw?: boolean;
}

/** handleOf trims the end mark from a handle that a sentence names. */
const handleOf = (h: string): string => h.replace(/[.,:;]+$/, '');

/** firstWord is the first word of a sentence, as the handle of a line whose shape the page does not know. */
const firstWord = (t: string): string => handleOf((t.trim().split(/\s+/)[0] || '').trim());

/** reportOf finds the path of a report of the wiki in a line. */
function reportOf(text: string, page?: string): string {
  if (page && /report\.md$/i.test(page)) return page;
  const m = /(bridges\/[^\s)\]]+?\/report\.md)/i.exec(text);
  return m ? m[1] : '';
}

const SAME = (a: string, b: string) => a.replace(/[.\s]+$/, '').trim().toLowerCase() === b.replace(/[.\s]+$/, '').trim().toLowerCase();

/**
 * lineWords words a system line from its event, with the words of the page.
 * A line of an event that the page does not know keeps the sentence of the
 * backend, because the page has no words for it.
 */
export function lineWords(e: Pick<Entry, 'event' | 'text' | 'page'>, me: Me): LineWords {
  const t = String(e.text || '').replace(/\s+/g, ' ').trim();
  const by = (who: string) => whoName(who, me);
  const out = (text: string, tip = true, page?: string): LineWords => {
    const w: LineWords = { text };
    if (tip && t && !SAME(t, text)) w.title = t;
    if (page) w.page = page;
    return w;
  };
  let m: RegExpExecArray | null;
  switch (e.event) {
    case 'started':
      // A seat whose worker wakes again. Any other start takes the seat, and the task stays out.
      if ((m = /^(\S+) woke up\.?$/.exec(t))) return out(handleOf(m[1]) + ' woke up', false);
      if (/^the manager started\b/i.test(t)) return out('manager took the seat', false);
      if ((m = /^(\S+) started\b/.exec(t))) return out(handleOf(m[1]) + ' took the seat', false);
      return out(firstWord(t) + ' took the seat', false);
    case 'asleep':
      if ((m = /^(\S+) went to sleep\b/.exec(t))) return out(handleOf(m[1]) + ' went to sleep', false);
      return out(firstWord(t) + ' went to sleep', false);
    case 'decided':
      // The note of a decision stays on its card.
      if ((m = /^(.+?) (allowed|denied) the call of (\S+?)(?:, with the note: .*)?\.?$/.exec(t))) return out(`${by(m[1])} ${m[2]} ${handleOf(m[3])}'s command`, false);
      if ((m = /^(.+?) answered the question of (\S+?):/.exec(t))) return out(`${by(m[1])} answered ${handleOf(m[2])}`, false);
      if ((m = /^(.+?) declined the question of (\S+?)(?:, with the note: .*)?\.?$/.exec(t))) return out(`${by(m[1])} declined ${handleOf(m[2])}'s question`, false);
      return out(by(firstWord(t)) + ' decided', false);
    case 'opened':
      if ((m = /^(.+?) opened the bridge\b/.exec(t))) return out(by(m[1]) + ' opened the bridge');
      return out('The bridge opened');
    case 'closed':
      if ((m = /^(.+?) closed the bridge\b/.exec(t))) return out(by(m[1]) + ' closed the bridge');
      return out('The bridge closed');
    case 'reopened':
      if ((m = /^(.+?) opened the bridge again\b/.exec(t))) return out(by(m[1]) + ' reopened the bridge');
      return out('The bridge opened again');
    case 'joined':
      if ((m = /^(.+?) added (\S+?):/.exec(t)) || (m = /^(.+?) added (\S+?)\.?$/.exec(t))) return out(`${by(m[1])} seated ${handleOf(m[2])}`);
      return out(firstWord(t) + ' took the seat');
    case 'fired':
      if ((m = /^(.+?) fired (\S+?)(?:\.|$)/.exec(t))) return out(`${by(m[1])} fired ${handleOf(m[2])}`);
      return out(firstWord(t) + ' is fired');
    case 'muted':
      if ((m = /^(.+?) (muted|unmuted) (\S+?)\.?$/.exec(t))) return out(`${by(m[1])} ${m[2]} ${handleOf(m[3])}`);
      return out('A member is muted');
    case 'task':
      if ((m = /^(.+?) seated (\S+) again\b/.exec(t))) return out(`${by(m[1])} seated ${handleOf(m[2])} again`);
      if ((m = /^(\S+) has a new task\b/.exec(t))) return out(handleOf(m[1]) + ' has a new task');
      return out(firstWord(t) + ' has a new task');
    case 'changed': {
      const report = reportOf(t, e.page);
      if (report) return out('The report is in the wiki', true, report);
      if ((m = /^(.+?) changed the settings\b/.exec(t))) return out(by(m[1]) + ' changed the settings');
      if (/^nobody writes a report\b/i.test(t)) return out('No report');
      if (e.page && (m = /^(\S+) changed\b/.exec(t))) return out(by(m[1]) + ' changed a page', true, e.page);
      return out('The bridge changed', true, e.page || undefined);
    }
    case 'finished':
      if ((m = /^(\S+) finished\b/.exec(t))) return out(handleOf(m[1]) + ' finished');
      return out(firstWord(t) + ' finished');
    case 'canceled':
      if ((m = /^(.+?) stopped the run of (\S+?)\.?$/.exec(t))) return out(`${by(m[1])} stopped ${handleOf(m[2])}`);
      if ((m = /\brun of (\S+?) was canceled\b/.exec(t))) return out(handleOf(m[1]) + ' stopped');
      return out(firstWord(t) + ' stopped');
    case 'needs-you':
      return out(firstWord(t) + ' needs you');
    case 'asked':
      return out(firstWord(t) + ' asks you');
    case 'failed':
      if ((m = /failed to seat (\S+?)(?: again)?:/.exec(t)) || (m = /did not get the seat (\S+?):/.exec(t))) return out(handleOf(m[1]) + ' did not take the seat');
      if ((m = /^(\S+) did not get message\b/.exec(t)) || (m = /^(\S+) got no message\b/.exec(t))) return out(handleOf(m[1]) + ' did not get a message');
      if ((m = /^The run \S+ of (\S+?) did not stop\b/.exec(t))) return out(handleOf(m[1]) + ' did not stop');
      if ((m = /failed to put the job of (\S+?) on\b/.exec(t))) return out(handleOf(m[1]) + ' did not start');
      if ((m = /^(\S+) no longer waits for its decision\b/.exec(t))) return out(handleOf(m[1]) + ' stopped waiting for its decision');
      if (/\breport\b/i.test(t)) return out('The report failed');
      if ((m = /^(\S+) failed\b/.exec(t))) return out(handleOf(m[1]) + ' failed');
      return out('Failed');
    case 'cap':
      if ((m = /^The bridge reached its cap of (\d+) messages\b/.exec(t))) return out(`The bridge reached its cap of ${m[1]} messages`);
      if ((m = /^The bridge reached its cap of (\d+) deliveries a minute\b/.exec(t))) return out(`The bridge reached its cap of ${m[1]} a minute`);
      if ((m = /^(\S+) cannot take messages: its run stopped at a limit\b/.exec(t))) return out(handleOf(m[1]) + ' stopped at a limit');
      if ((m = /^(\S+) cannot take messages\b/.exec(t))) return out(handleOf(m[1]) + ' cannot take messages');
      if ((m = /^(\S+) and (\S+) exchanged \d+ messages\b/.exec(t))) return out(`${handleOf(m[1])} and ${handleOf(m[2])} reached their cap`);
      return out('The bridge reached a cap');
  }
  // An event that the page does not know keeps the sentence of the backend.
  return { text: t, raw: true };
}

/** decidedRuns names the runs whose decision a card of the entries shows: a card that waits for nothing now. */
export function decidedRuns(entries: Iterable<Pick<Entry, 'decision'>>): Set<string> {
  const out = new Set<string>();
  for (const e of entries) if (e.decision && e.decision.run && e.decision.state !== 'pending') out.add(e.decision.run);
  return out;
}

/** hiddenLine reports whether a line says a decision that a card of the same view already shows. */
export function hiddenLine(e: Pick<Entry, 'from' | 'event' | 'mirrors' | 'decision'>, decided: Set<string>): boolean {
  return e.from.kind === 'system' && !e.decision && e.event === 'decided' && !!e.mirrors && decided.has(e.mirrors.run);
}
