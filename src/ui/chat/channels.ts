// The channels of the sidebar and the members of a channel, in the words of
// the chat-first page. A channel is a bridge of the API, and an agent of a
// channel is a member of the bridge. The page says what an agent does, never
// where it runs: an agent is working, needs you, idle, or asleep. A
// scheduler places the work, and the person never sees it.

import type { Bridge, Duty, Member, Run } from '../../api/types';
import type { Tone } from '../../lib/presence';
import { seatPresence, type Facts } from '../../lib/status';
import { personName } from '../../lib/words';
import { newestRun } from '../../state/people';

export interface Status {
  word: string;
  tone: Tone;
  /** True for the amber of a wait that is no question of the person, so the light holds still. */
  still?: boolean;
}

/** The words of an agent, by the presence of its member. */
const AGENT: Record<string, Status> = {
  working: { word: 'working', tone: 'green' },
  'needs-you': { word: 'needs you', tone: 'amber' },
  idle: { word: 'idle', tone: 'grey' },
  asleep: { word: 'asleep', tone: 'grey' },
  // The run waits for its turn. The scheduler starts it, so the person reads only that it starts.
  waiting: { word: 'starting', tone: 'grey' },
  'not-started': { word: 'not started', tone: 'grey' },
  limit: { word: 'at its limit', tone: 'grey' },
  error: { word: 'stopped', tone: 'red' },
  fired: { word: 'removed', tone: 'grey' },
};

/** agentStatus is the status of an agent of a channel. */
export function agentStatus(f: Facts, m: Pick<Member, 'fired' | 'presence' | 'runs' | 'question'>): Status {
  const p = seatPresence(f, m);
  return AGENT[p] || { word: String(p || 'idle').replace(/-/g, ' '), tone: 'grey' };
}

/** nowWords says in one line what an agent of a channel does now: the step of its run while it works, else its task. */
export function nowWords(m: Pick<Member, 'task' | 'activity'>, run: Pick<Run, 'activity' | 'state'> | undefined): string {
  const working = !!run && run.state === 'running';
  const a = working ? run.activity || m.activity : null;
  return oneLine(m.task || (a && a.phrase) || '');
}

const oneLine = (s: string): string => String(s || '').replace(/\s+/g, ' ').trim();

/** The order of attention of the status of a channel. */
const RANK = ['needs you', 'stopped', 'working', 'starting', 'at its limit', 'idle', 'not started', 'asleep'];

export interface ChannelRow {
  id: string;
  title: string;
  open: boolean;
  /** The status of the channel: the most urgent status of its agents, or closed. */
  status: Status;
  /** The agents of the channel, not removed, in the order of the members. */
  agents: { handle: string; agent: string; status: Status; now: string }[];
  /** The people of the channel in a few words, such as Dana, you. */
  people: string;
  /** The time of its newest entry. */
  at: string;
  unread: number;
  /** True when a repeating job posts in it. */
  repeats: boolean;
  /** The agent whose face stands for the channel: the first agent. */
  face: string;
}

/** peopleWords names the people of a channel: the person who opened it, and you. */
export function peopleWords(operator: string, me: string, display?: string): string {
  if (!operator || operator === me) return 'you';
  return (display || personName(operator)).split(/\s+/)[0] + ', you';
}

/**
 * peopleOf lists the people of a channel: the person who opened it, the
 * people who posted in the part of the channel that the page read, and you,
 * each once, with the name that a post gave.
 */
export function peopleOf(operator: string, me: string, entries: { from: { kind: string; name?: string; display?: string } }[]): { subject: string; display?: string }[] {
  const out: { subject: string; display?: string }[] = [];
  const add = (subject: string | undefined, display?: string) => {
    if (!subject) return;
    const had = out.find((p) => p.subject === subject);
    if (had) {
      if (!had.display && display) had.display = display;
      return;
    }
    out.push({ subject, display });
  };
  add(operator);
  for (const e of entries) if (e.from.kind === 'person') add(e.from.name, e.from.display);
  add(me);
  return out;
}

/** jobsOf lists the repeating jobs of a channel: the duties that post in it. */
export function jobsOf(id: string, duties: Duty[] | null | undefined): Duty[] {
  return (duties || []).filter((d) => d.do && d.do.post && d.do.post.bridge === id);
}

/**
 * channelRow builds the row of a channel for the sidebar. members is the
 * roster when the page read it, else none: the row then says only its
 * status from the count of the agents that need you.
 */
export function channelRow(b: Bridge, members: Member[] | null, f: Facts, me: string, duties: Duty[] | null | undefined): ChannelRow {
  const agents = (members || [])
    .filter((m) => !m.fired)
    .map((m) => ({ handle: m.handle, agent: m.agent, status: agentStatus(f, m), now: nowWords(m, f.runs[newestRun(m)]) }));
  let status: Status;
  if (b.state === 'closed') status = { word: 'closed', tone: 'grey' };
  else if (agents.length) status = agents.map((a) => a.status).sort((x, y) => rank(x.word) - rank(y.word))[0];
  else if (b.needsYou) status = { word: 'needs you', tone: 'amber' };
  else status = { word: 'idle', tone: 'grey' };
  return {
    id: b.id,
    title: b.title,
    open: b.state === 'open',
    status,
    agents,
    people: peopleWords(b.operator, me),
    at: b.lastAt || b.closedAt || b.createdAt,
    unread: b.unread || 0,
    repeats: jobsOf(b.id, duties).length > 0,
    face: agents[0] ? agents[0].agent : '',
  };
}

const rank = (w: string): number => {
  const i = RANK.indexOf(w);
  return i < 0 ? RANK.length : i;
};

/** agentCount says the agents of a channel, such as 3 agents. */
export function agentCount(n: number): string {
  return n === 1 ? '1 agent' : n + ' agents';
}

const ms = (iso: string): number => {
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
};

/** sortChannels puts the channels that need you first, then the newest. */
export function sortChannels(rows: ChannelRow[]): ChannelRow[] {
  return [...rows].sort((a, b) => {
    const na = a.status.word === 'needs you' ? 0 : 1;
    const nb = b.status.word === 'needs you' ? 0 : 1;
    return na - nb || ms(b.at) - ms(a.at);
  });
}

/** shortTime is the time of a row: the clock for today, the day of the week within a week, else the date. */
export function shortTime(iso: string, now = new Date()): string {
  const t = new Date(iso);
  if (isNaN(t.getTime())) return '';
  const mins = Math.round((now.getTime() - t.getTime()) / 60000);
  if (mins < 60) return Math.max(1, mins) + 'm';
  if (t.toDateString() === now.toDateString()) return t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (now.getTime() - t.getTime() < 6 * 86400000) return t.toLocaleDateString(undefined, { weekday: 'short' });
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * pageWords puts a sentence of the server in the words of the page: a
 * bridge is a channel, a seat is a place in a channel, and a worker is not
 * named. The server still says bridge in some readbacks and reasons, such
 * as the readback of a job that starts when a channel closes.
 */
export function pageWords(text: string): string {
  return String(text || '')
    .replace(/\bbridges\b/g, 'channels')
    .replace(/\bBridges\b/g, 'Channels')
    .replace(/\bbridge\b/g, 'channel')
    .replace(/\bBridge\b/g, 'Channel')
    .replace(/\btook a seat\b/g, 'joined')
    .replace(/\bseats\b/g, 'agents')
    .replace(/\bseat\b/g, 'agent')
    .replace(/\bwaiting for a worker\b/gi, (m) => (m[0] === 'W' ? 'Waiting to start' : 'waiting to start'))
    .replace(/\bThe duty\b/g, 'The job')
    .replace(/\bthe duty\b/g, 'the job')
    .replace(/\bduties\b/g, 'jobs')
    .replace(/\bDuty\b/g, 'Job')
    .replace(/\bduty\b/g, 'job')
    .replace(/\bits worker\b/g, 'it')
    .replace(/\bworkers\b/g, 'agents')
    .replace(/\bworker\b/g, 'agent');
}

/**
 * lineText puts a system line of a channel in the words of the chat-first
 * page: the older places say team and took the seat.
 */
export function lineText(text: string): string {
  return pageWords(
    String(text || '')
      // The scheduler places the work, so the lines of packages name no worker.
      .replace(/^(Ready|Updating) on \d+ of \d+ workers?\.$/, (_m, w: string) => (w === 'Ready' ? 'Ready.' : 'Updating now.'))
      .replace(/^The change waits for (its worker|\d+ workers) to wake up\.$/, 'The change takes effect at the next run.')
      .replace(/^Workers take a change in about a minute\./, 'A change takes about a minute.')
      .replace(/^The workers of (\S+) lose /, '$1 loses ')
      .replace(/\blost its worker\b/g, 'lost its run')
      .replace(/\btook the seat\b/g, 'joined')
      .replace(/\bseated (\S+) again\b/g, 'started $1 again')
      .replace(/\bseated\b/g, 'added'),
  )
    .replace(/\breopened the team\b/g, 'reopened the channel')
    .replace(/\bthe team\b/g, 'the channel')
    .replace(/\bThe team\b/g, 'The channel')
    .replace(/\bis fired\b/g, 'was taken off')
    .replace(/\bfired\b/g, 'took off');
}

/**
 * openedWords is the words of a fold of system lines that starts with the
 * opening of a channel: Opened channel · 3 members. It counts the agents
 * that started in the fold, else the members that the line names. A fold
 * of any other lines answers undefined.
 */
export function openedWords(entries: (Pick<import('../../api/types').Entry, 'event' | 'text' | 'from'> | undefined)[]): string | undefined {
  const first = entries[0];
  if (!first || first.from.kind !== 'system' || first.event !== 'opened') return undefined;
  const started = entries.filter((e) => !!e && e.from.kind === 'system' && (e.event === 'started' || e.event === 'joined') && !/ woke up\b/.test(e.text || '')).length;
  const m = /with (\d+) members?/.exec(first.text || '');
  const n = started || (m ? Number(m[1]) : 0);
  return n ? 'Opened channel · ' + n + (n === 1 ? ' member' : ' members') : 'Opened channel';
}
