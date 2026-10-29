// The words of a system line of a channel. The backend writes a sentence
// for each line, such as "migrator-2 went to sleep. A message wakes its
// Task." A later front writes one fact with no advice and no end mark,
// such as "migrator-2 went to sleep". The page reads both forms. A front
// of the chat-first page says channel and agent, as in "alice took scribe
// off the channel", where an older one said bridge and seat, as in "alice
// fired scribe"; the page reads both words too. It shows
// its own short words for the event of the line, with the handle and the
// person that the sentence names, and keeps the sentence of the backend
// for a tooltip. The functions here are pure, so the tests read them
// without a page.

import type { Entry, Principal } from '../api/types';
import { cap, personName } from './words';
import { plainError, providerMessage } from './runerror';
import { dutyLabel } from './duties';

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
  if (w.toLowerCase() === TOKEN_WORDS) return 'Admin token';
  if (w.toLowerCase() === 'somebody' || !w) return 'Someone';
  // A name that the backend writes as words, such as the front, starts the line with a capital.
  if (/^the /i.test(w)) return cap(w);
  // The principal of the runs of a duty, such as duty:nightly-report, reads as the duty, by its title once the page read it, else by its name as it is.
  if (/^duty:./i.test(w)) return 'The duty ' + dutyLabel(w.slice(5));
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

/** failureTip is the plain line of the error of a run, and the message of its provider when it gives one, for the tooltip of a failed line. */
function failureTip(error: string): string {
  const plain = plainError(error);
  const said = providerMessage(error);
  if (!said || SAME(said, plain)) return plain ? plain + '.' : '';
  return plain + '. ' + said;
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
      // The note of a decision stays on its card. The front names the
      // decider by its subject, and what it decided: a command, a file
      // change, or the call of a tool.
      if ((m = /^(.+?) (allowed|denied) (\S+?)'s (command|file change|call of (\S+?))(?:, with the note: .*)?\.?$/.exec(t))) {
        const what = m[5] ? 'call of ' + m[5].replace(/^front\./, '') : m[4];
        return out(`${by(m[1])} ${m[2]} ${handleOf(m[3])}'s ${what}`, false);
      }
      if ((m = /^(.+?) answered (\S+?)'s question:/.exec(t))) return out(`${by(m[1])} answered ${handleOf(m[2])}`, false);
      if ((m = /^(.+?) declined (\S+?)'s question(?:, with the note: .*)?\.?$/.exec(t))) return out(`${by(m[1])} declined ${handleOf(m[2])}'s question`, false);
      // The sentences of an older front.
      if ((m = /^(.+?) (allowed|denied) the call of (\S+?)(?:, with the note: .*)?\.?$/.exec(t))) return out(`${by(m[1])} ${m[2]} ${handleOf(m[3])}'s command`, false);
      if ((m = /^(.+?) answered the question of (\S+?):/.exec(t))) return out(`${by(m[1])} answered ${handleOf(m[2])}`, false);
      if ((m = /^(.+?) declined the question of (\S+?)(?:, with the note: .*)?\.?$/.exec(t))) return out(`${by(m[1])} declined ${handleOf(m[2])}'s question`, false);
      return out(by(firstWord(t)) + ' decided', false);
    case 'lost':
      // The fleet lost the run of a seat, as after a roll of its workers. The id of the run stays in the tooltip.
      if ((m = /^(\S+) lost its run\b/.exec(t))) return out(handleOf(m[1]) + ' lost its worker');
      return out(firstWord(t) + ' lost its worker');
    case 'opened':
      if ((m = /^(.+?) opened the (?:bridge|channel)\b/.exec(t))) return out(by(m[1]) + ' opened the team');
      return out('The team opened');
    case 'closed':
      if ((m = /^(.+?) closed the (?:bridge|channel)\b/.exec(t))) return out(by(m[1]) + ' closed the team');
      return out('The team closed');
    case 'reopened':
      if ((m = /^(.+?) (?:opened the bridge again|reopened the channel)\b/.exec(t))) return out(by(m[1]) + ' reopened the team');
      return out('The team opened again');
    case 'joined':
      if ((m = /^(.+?) added (\S+?):/.exec(t)) || (m = /^(.+?) added (\S+?)\.?$/.exec(t))) return out(`${by(m[1])} seated ${handleOf(m[2])}`);
      return out(firstWord(t) + ' took the seat');
    case 'fired':
      if ((m = /^(.+?) fired (\S+?)(?:\.|$)/.exec(t)) || (m = /^(.+?) took (\S+?) off the channel\b/.exec(t))) return out(`${by(m[1])} fired ${handleOf(m[2])}`);
      return out(firstWord(t) + ' is fired');
    case 'muted':
      if ((m = /^(.+?) (muted|unmuted) (\S+?)\.?$/.exec(t))) return out(`${by(m[1])} ${m[2]} ${handleOf(m[3])}`);
      return out('A member is muted');
    case 'task':
      if ((m = /^(.+?) (?:seated|started) (\S+) again\b/.exec(t))) return out(`${by(m[1])} seated ${handleOf(m[2])} again`);
      if ((m = /^(.+?) continued (\S+?)\.?$/.exec(t))) return out(`${by(m[1])} continued ${handleOf(m[2])}`);
      if ((m = /^(\S+) has a new task\b/.exec(t))) return out(handleOf(m[1]) + ' has a new task');
      return out(firstWord(t) + ' has a new task');
    case 'changed': {
      const report = reportOf(t, e.page);
      if (report) return out('The report is in the wiki', true, report);
      if ((m = /^(.+?) changed the settings\b/.exec(t))) return out(by(m[1]) + ' changed the settings');
      if (/^nobody writes a report\b/i.test(t)) return out('No report');
      if (e.page && (m = /^(\S+) changed\b/.exec(t))) return out(by(m[1]) + ' changed a page', true, e.page);
      return out('The team changed', true, e.page || undefined);
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
      if ((m = /failed to (?:seat|start) (\S+?)(?: again)?:/.exec(t)) || (m = /did not get the (?:seat|ask to start) (\S+?):/.exec(t))) return out(handleOf(m[1]) + ' did not take the seat');
      if ((m = /^(\S+) did not get message\b/.exec(t)) || (m = /^(\S+) got no message\b/.exec(t))) return out(handleOf(m[1]) + ' did not get a message');
      if ((m = /^The run \S+ of (\S+?) did not stop\b/.exec(t))) return out(handleOf(m[1]) + ' did not stop');
      if ((m = /failed to put the job of (\S+?) on\b/.exec(t)) || (m = /failed to queue the run of (\S+?):/.exec(t))) return out(handleOf(m[1]) + ' did not start');
      if ((m = /^(\S+) no longer waits for its decision\b/.exec(t))) return out(handleOf(m[1]) + ' stopped waiting for its decision');
      if (/\breport\b/i.test(t)) return out('The report failed');
      if ((m = /^(\S+) failed\b:?\s*(.*)$/.exec(t))) {
        // The error of the run comes raw, with the address, the request id, and the JSON of a provider. The tooltip holds its plain line and the message of the provider.
        const w = out(handleOf(m[1]) + ' failed', false);
        const tip = failureTip(m[2]);
        if (tip) w.title = tip;
        return w;
      }
      return out('Failed');
    case 'cap':
      if ((m = /^The (?:bridge|channel) reached its cap of (\d+) messages\b/.exec(t))) return out(`The team reached its cap of ${m[1]} messages`);
      if ((m = /^The (?:bridge|channel) reached its cap of (\d+) turns\b/.exec(t))) return out(`The team reached its cap of ${m[1]} turns`);
      if ((m = /^The (?:bridge|channel) reached its cap of (\d+) deliveries a minute\b/.exec(t))) return out(`The team reached its cap of ${m[1]} a minute`);
      if ((m = /^(\S+) cannot take messages: its run stopped at a limit\b/.exec(t))) return out(handleOf(m[1]) + ' stopped at a limit');
      if ((m = /^(\S+) cannot take messages\b/.exec(t))) return out(handleOf(m[1]) + ' cannot take messages');
      if ((m = /^(\S+) and (\S+) exchanged \d+ messages\b/.exec(t))) return out(`${handleOf(m[1])} and ${handleOf(m[2])} reached their cap`);
      return out('The team reached a cap');
  }
  // An event that the page does not know keeps the sentence of the backend.
  return { text: t, raw: true };
}

/** A line that says that a worker went to sleep or woke up, with the handle of its seat. */
export interface Nap {
  nap: 'sleep' | 'wake';
  handle: string;
}

/**
 * napOf reads a line that says that the worker of a seat went to sleep or
 * woke up, from its event: asleep, or started with the words woke up. The
 * sentence of the backend names the handle first, with or without a second
 * sentence, so the plain facts of a later backend read the same.
 */
export function napOf(e: Pick<Entry, 'from' | 'event' | 'text' | 'decision'>): Nap | null {
  if (e.from.kind !== 'system' || e.decision) return null;
  const t = String(e.text || '').replace(/\s+/g, ' ').trim();
  let m: RegExpExecArray | null;
  if (e.event === 'asleep') {
    const handle = (m = /^(\S+) went to sleep\b/.exec(t)) ? handleOf(m[1]) : firstWord(t);
    return handle ? { nap: 'sleep', handle } : null;
  }
  if (e.event === 'started' && (m = /^(\S+) woke up\b/.exec(t))) return { nap: 'wake', handle: handleOf(m[1]) };
  return null;
}

/**
 * napRuns finds the sleep lines that a wake line of the same handle
 * follows with nothing between them, and the runs of such pairs. Each
 * run is the indexes of its lines, two per pair. A sleep line that no
 * wake line follows stays out, because it says where the worker is now.
 */
export function napRuns(naps: (Nap | null)[], same: (i: number, j: number) => boolean = () => true): number[][] {
  const out: number[][] = [];
  let i = 0;
  while (i < naps.length) {
    const handle = naps[i] ? naps[i]!.handle : '';
    const pair = (k: number) => {
      const a = naps[k];
      const b = naps[k + 1];
      return !!a && !!b && a.nap === 'sleep' && b.nap === 'wake' && a.handle === handle && b.handle === handle && same(k, k + 1);
    };
    if (!handle || !pair(i)) {
      i++;
      continue;
    }
    const run: number[] = [];
    let k = i;
    while (pair(k) && (k === i || same(k - 1, k))) {
      run.push(k, k + 1);
      k += 2;
    }
    out.push(run);
    i = k;
  }
  return out;
}

/** napWords is the one quiet line of a run of pairs: "migrator-1 slept and woke up", or "migrator-1 slept and woke up 4 times". */
export function napWords(handle: string, pairs: number): string {
  return pairs > 1 ? `${handle} slept and woke up ${pairs} times` : `${handle} slept and woke up`;
}

/** lostRunOf names the run of a line of the event lost, whose run the fleet lost, or "" for any other line. */
export function lostRunOf(e: Pick<Entry, 'from' | 'event' | 'text' | 'mirrors'>): string {
  if (e.from.kind !== 'system' || e.event !== 'lost') return '';
  const m = /\blost its run (\S+?):/.exec(String(e.text || ''));
  if (m) return m[1];
  return e.mirrors && e.mirrors.run ? e.mirrors.run : '';
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
