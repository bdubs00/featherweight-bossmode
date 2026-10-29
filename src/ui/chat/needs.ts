// Needs you: one row per thing that waits for the person. The front counts
// the work that needs the person once (GET /v1/inbox, waiting): the tasks of
// the board in Needs you and in To check whose next move is the person's,
// and the notes of Know-how that wait to be kept. needsOfCount builds the
// rows of that count: one row per such task of the board (GET /v1/work),
// with the words of its row of the inbox (src/state/inbox.ts), and one row
// per item note of the inbox. The sidebar, the title of the tab, and the
// badge of the older places show that count, so they agree.
//
// An older front answers no count. needsOf then builds the list from the
// four reads that the page makes: the board, the rows of the inbox, the
// notes of Know-how that wait, and the rows of the inbox that no task names,
// such as a paused job, which stand on their own.

import type { WaitingChange } from '../../api/knowhow';
import type { Decision, WorkCard } from '../../api/types';
import type { InboxRow } from '../../state/inbox';
import { needsPerson } from '../../state/inbox';
import { briefOf, planOf, verbOf } from '../../lib/decision';
import { envCallOf, excerpt, plainText } from '../../lib/words';
import { chatHref } from './route';
import { pageWords } from './channels';

export type NeedKind = 'asks' | 'question' | 'check' | 'stopped' | 'failed' | 'limit' | 'paused' | 'suggestion';

export interface NeedRow {
  key: string;
  kind: NeedKind;
  /** The agent whose face the row shows, or "" for none. */
  agent: string;
  /** The first line, in bold: who asks, or what waits. */
  head: string;
  /** The second line: what it wants, and where. */
  line: string;
  /** When the wait started. */
  at: string;
  /** The place where the person answers it. */
  href: string;
}

export interface NeedsInput {
  /** The cards of the board of the person, or null before the first read. */
  cards: WorkCard[] | null;
  /** The rows of the inbox. */
  rows: InboxRow[];
  /** The changes of Know-how that wait for a person. */
  waiting: WaitingChange[];
  /** The name of an agent, as the page shows it. */
  agentName: (agent: string) => string;
  /** The title of a channel, by its id. */
  channelTitle: (id: string) => string;
  /** The title of a job, by its name. */
  jobTitle: (name: string) => string;
}

/** askWords says what a decision asks in one short line, such as Add package jq? or the command it runs. */
export function askWords(d: Decision): string {
  if (d.question || d.schema) return d.reason ? oneLine(d.reason) : 'It has a question for you.';
  const env = envCallOf(d.tool, d.input);
  if (env) {
    if (env.command === 'add') return 'Add package ' + (env.name || '') + '?';
    if (env.command === 'remove') return 'Remove package ' + (env.name || '') + '?';
    return 'List its packages?';
  }
  const plan = planOf(d);
  if (plan.kind === 'bridge') return 'Open a channel: ' + (plan.title || plan.goal) + '?';
  if (plan.kind === 'handoff') return 'Hand off to ' + plan.agent + ': ' + excerpt(plan.task, 80);
  const brief = briefOf(plan);
  const verb = verbOf(d);
  if (brief) return verb + ': ' + brief.text;
  return verb + '?';
}

const oneLine = (s: string): string => pageWords(excerpt(plainText(s).replace(/\s+/g, ' ').trim(), 120));

const ms = (iso: string | undefined): number => {
  const t = new Date(iso || '').getTime();
  return isNaN(t) ? 0 : t;
};

/** where names the place of a row: in a channel, or in a job. */
function whereWords(i: NeedsInput, bridge: string | undefined, duty: string | undefined): string {
  if (bridge) return 'in ' + i.channelTitle(bridge);
  if (duty) return 'job ' + i.jobTitle(duty);
  return '';
}

const joined = (parts: string[]): string => parts.filter(Boolean).join(' · ');

/** hrefOfRow is where a row of the inbox is answered. A decision of a channel opens its tab Decisions, which holds every card that waits. */
function hrefOfRow(r: InboxRow): string {
  if (r.bridge) {
    const decides = r.kind === 'decision' || r.kind === 'question';
    return chatHref({ view: 'channel', id: r.bridge, tab: decides ? 'decisions' : 'posts' });
  }
  if (r.run) return chatHref({ view: 'run', id: r.run });
  if (r.duty) return chatHref({ view: 'job', name: r.duty });
  return '#';
}

/** rowOf turns a row of the inbox into a row of Needs you. */
function rowOf(i: NeedsInput, r: InboxRow): NeedRow {
  const who = r.handle || (r.agent ? i.agentName(r.agent) : '');
  const where = whereWords(i, r.bridge, r.duty);
  const base = { key: r.key, agent: r.agent || '', at: r.at, href: hrefOfRow(r) };
  switch (r.kind) {
    case 'decision':
      return { ...base, kind: 'asks', head: (who || 'An agent') + ' asks first', line: joined([r.decision ? askWords(r.decision) : '', where]) };
    case 'question':
      return { ...base, kind: 'question', head: (who || 'An agent') + ' asks you', line: joined([r.decision ? askWords(r.decision) : oneLine(r.reason || ''), where]) };
    case 'asked':
      return { ...base, kind: 'question', head: (who || 'An agent') + ' asks you', line: joined([r.entry ? oneLine(r.entry.text || '') : '', where]) };
    case 'result':
      return { ...base, kind: 'check', head: r.duty ? 'Job ready to sign off' : 'Ready to sign off', line: joined([oneLine(r.reason || ''), where]) };
    case 'limit':
      return { ...base, kind: 'limit', head: (who || 'An agent') + ' is at its limit', line: joined(['Continue gives it more room', where]) };
    case 'duty-paused':
      return { ...base, kind: 'paused', head: 'Job paused: ' + (r.duty ? i.jobTitle(r.duty) : ''), line: oneLine(r.reason || '') };
    case 'duty-failed':
      return { ...base, kind: 'failed', head: 'Job failed: ' + (r.duty ? i.jobTitle(r.duty) : ''), line: oneLine(r.reason || '') };
    case 'duty-waits':
      return { ...base, kind: 'question', head: (who || 'A job') + ' waits for you', line: joined([oneLine(r.reason || ''), where]) };
    case 'note':
      return { ...base, kind: 'suggestion', head: (r.handle ? i.agentName(r.handle) : 'An agent') + ': Keep this note?', line: oneLine(r.reason || ''), href: r.handle ? chatHref({ view: 'agent', name: r.handle }) : base.href };
    default:
      return { ...base, kind: r.kind === 'stopped' ? 'stopped' : 'failed', head: (who || 'An agent') + (r.kind === 'stopped' ? ' stopped' : ' failed'), line: joined([oneLine(r.reason || ''), where]) };
  }
}

/** hrefOfCard is where a task of the board that needs the person is answered. */
function hrefOfCard(c: WorkCard): string {
  if (c.links.bridge) return chatHref({ view: 'channel', id: c.links.bridge, tab: c.stage === 'needs-you' ? 'decisions' : 'posts' });
  if (c.links.run) return chatHref({ view: 'run', id: c.links.run });
  if (c.links.duty) return chatHref({ view: 'job', name: c.links.duty });
  return '#';
}

/** cardRow is the row of a task that no row of the inbox explains. */
function cardRow(i: NeedsInput, c: WorkCard): NeedRow {
  const agent = c.agents[0] || '';
  const where = whereWords(i, c.links.bridge, c.links.bridge ? '' : c.links.duty);
  const base = { key: 'card:' + c.id, agent, at: c.since, href: hrefOfCard(c) };
  if (c.stage === 'review') return { ...base, kind: 'check', head: c.links.duty ? 'Job ready to sign off' : 'Ready to sign off', line: joined([c.title, c.links.bridge ? '' : where]) };
  if (c.stage === 'stopped') return { ...base, kind: 'stopped', head: 'Stopped: ' + c.title, line: oneLine(c.reason || '') };
  return { ...base, kind: 'question', head: (agent ? i.agentName(agent) : 'An agent') + ' needs you', line: joined([oneLine(c.reason || c.title), where]) };
}

/** suggestionRow is the row of a note that waits for Keep or Not now. */
function suggestionRow(i: NeedsInput, w: WaitingChange): NeedRow {
  const what = w.what === 'updated' ? 'Keep this change to a note?' : 'Keep this note?';
  return { key: 'k:' + w.id, kind: 'suggestion', agent: w.agent, head: i.agentName(w.agent) + ': ' + what, line: oneLine(w.text || w.why || ''), at: w.at, href: chatHref({ view: 'agent', name: w.agent }) };
}

/**
 * needsOf builds the rows of Needs you, newest first. Each task of the board
 * whose next move is the person's gives one row, with the words of its row
 * of the inbox when one matches: by its decision or its result, else by its
 * channel, else by its job. A channel where two agents wait gives two rows.
 * A row of the inbox that no task names gives its own row, and so does each
 * note that waits.
 */
export function needsOf(i: NeedsInput): NeedRow[] {
  // A note that the inbox names and that Know-how lists shows once, as a suggestion.
  const listed = new Set(i.waiting.map((w) => w.id));
  const rows = i.rows.filter((r) => needsPerson(r) && !(r.kind === 'note' && r.note && listed.has(r.note)));
  const used = new Set<string>();
  const out: NeedRow[] = [];
  const take = (r: InboxRow) => {
    used.add(r.key);
    out.push(rowOf(i, r));
  };
  for (const c of i.cards || []) {
    if (c.next !== 'you' || c.stage === 'done' || c.stage === 'waiting' || c.stage === 'working') continue;
    const run = c.links.run || '';
    const byKey = rows.find((r) => !used.has(r.key) && ((c.links.approval && r.key === 'd:' + run + '/' + c.links.approval) || (c.stage === 'review' && r.key === 'v:' + run)));
    if (byKey) {
      take(byKey);
      continue;
    }
    const inChannel = c.links.bridge ? rows.filter((r) => !used.has(r.key) && r.bridge === c.links.bridge) : [];
    if (inChannel.length && c.stage !== 'review') {
      inChannel.forEach(take);
      continue;
    }
    const ofJob = !c.links.bridge && c.links.duty ? rows.filter((r) => !used.has(r.key) && r.duty === c.links.duty && !r.bridge && (c.stage !== 'stopped' || r.kind === 'duty-failed' || r.kind === 'duty-paused')) : [];
    if (ofJob.length) {
      ofJob.forEach(take);
      continue;
    }
    out.push(cardRow(i, c));
  }
  for (const r of rows) if (!used.has(r.key)) take(r);
  for (const w of i.waiting) out.push(suggestionRow(i, w));
  return out.sort((a, b) => ms(b.at) - ms(a.at));
}

/** counted reports whether a task of the board counts in the one count of the front: Needs you or To check, with the next move of the person. */
const counted = (c: WorkCard): boolean => c.next === 'you' && (c.stage === 'needs-you' || c.stage === 'review');

/**
 * needsOfCount builds the rows of the one count of the front: one row per
 * task of the board in Needs you or To check whose next move is the
 * person's, with the words of the first row of the inbox that matches it,
 * by its decision or its result, else by its channel, else by its job, and
 * one row per note of the inbox that waits to be kept. A stopped task lets
 * itself go and counts nowhere, and so does a row of the inbox that no task
 * names. Newest first.
 */
export function needsOfCount(i: NeedsInput): NeedRow[] {
  const rows = i.rows.filter(needsPerson);
  const used = new Set<string>();
  const out: NeedRow[] = [];
  for (const c of i.cards || []) {
    if (!counted(c)) continue;
    const run = c.links.run || '';
    const free = (r: InboxRow) => !used.has(r.key) && r.kind !== 'note';
    const match =
      rows.find((r) => free(r) && ((c.links.approval && r.key === 'd:' + run + '/' + c.links.approval) || (c.stage === 'review' && (r.key === 'v:' + run || (!!c.links.bridge && r.key === 'v:b:' + c.links.bridge))))) ||
      (c.stage !== 'review' && c.links.bridge ? rows.find((r) => free(r) && r.bridge === c.links.bridge) : undefined) ||
      (!c.links.bridge && c.links.duty ? rows.find((r) => free(r) && r.duty === c.links.duty && !r.bridge) : undefined);
    if (match) {
      used.add(match.key);
      out.push(rowOf(i, match));
    } else out.push(cardRow(i, c));
  }
  for (const r of rows) if (r.kind === 'note') out.push(rowOf(i, r));
  return out.sort((a, b) => ms(b.at) - ms(a.at));
}
