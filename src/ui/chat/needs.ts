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
import type { Decision, InboxAction, InboxItem, WorkCard } from '../../api/types';
import type { InboxRow } from '../../state/inbox';
import { needsPerson } from '../../state/inbox';
import { briefOf, planOf, verbOf } from '../../lib/decision';
import { envCallOf, excerpt, plainText } from '../../lib/words';
import { costText } from '../../lib/cost';
import { chatHref } from './route';
import { pageWords } from './channels';

export type NeedKind = 'asks' | 'question' | 'check' | 'stopped' | 'failed' | 'limit' | 'paused' | 'suggestion';

export interface NeedRow {
  key: string;
  kind: NeedKind;
  /** The agent whose face the row shows, or "" for none. */
  agent: string;
  /** The first line, in bold: what it is about, such as the first line of the result, the question, or the call. */
  head: string;
  /** The second line: what it wants, where, which agent, and what it cost, with no name twice. */
  line: string;
  /** When the wait started. */
  at: string;
  /** The place where the person answers it. */
  href: string;
  /** What the row is about, so an answer on the page takes it off at once. */
  run?: string;
  bridge?: string;
  approval?: string;
  duty?: string;
  /** The task of the board that the row stands for. */
  card?: string;
  /** The ways out of the row, as the front names them on its item. An older front names none. */
  actions?: InboxAction[];
  /** The question of an agent in its channel, by its seq, and the handle that asks. */
  question?: number;
  handle?: string;
  /** The waiting change of a note. */
  note?: string;
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
  /** The answer of a run that the page holds, for the first line of a result. */
  answerOf?: (run: string) => string;
  /** The newest post of an agent in a channel that the page read, for the first line of the result of a channel. */
  lastPostOf?: (bridge: string) => string;
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

/** oneLine is the first line of a text that says something, plain, in the words of the page: a heading counts only when no other line is there. */
export const oneLine = (s: string): string => {
  const lines = String(s || '')
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^#+$/.test(l) && !/^[-*_=`]{3,}$/.test(l));
  const first = lines.find((l) => !/^#/.test(l)) || lines[0] || '';
  return pageWords(excerpt(plainText(first).replace(/^[-*+]\s+/, '').replace(/\s+/g, ' ').trim(), 120));
};

const ms = (iso: string | undefined): number => {
  const t = new Date(iso || '').getTime();
  return isNaN(t) ? 0 : t;
};

/** The word of each kind of row, at the start of its second line. */
const ACTION: Record<NeedKind, string> = {
  asks: 'Asks first',
  question: 'Asks you',
  check: 'Sign off',
  stopped: 'Stopped',
  failed: 'Failed',
  limit: 'At its limit',
  paused: 'Paused',
  suggestion: 'Keep this note?',
};

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * lineOf joins the second line of a row: the action, then each part that
 * the title and the parts before it do not name already. A part counts as
 * named when the title is that part, starts with it, or holds a long name
 * whole, such as the name of a channel. A short name inside the title, such
 * as the agent backup in Restore the backup, still shows.
 */
export function lineOf(head: string, parts: string[]): string {
  const out: string[] = [];
  const h = head.trim().toLowerCase();
  for (const p of parts) {
    const t = (p || '').trim();
    if (!t) continue;
    const l = t.toLowerCase();
    if (out.some((x) => same(x, t))) continue;
    if (out.length > 0 && (h === l || h.startsWith(l + ' ') || h.startsWith(l + ':') || (l.length >= 12 && h.includes(l)))) continue;
    out.push(t);
  }
  return out.join(' · ');
}

/** reasonWords drops the name of the job from the front of a reason, since the line names the job. */
const reasonWords = (s: string): string => oneLine(String(s || '').replace(/^The job \S+(?: paused itself)?:\s*/, ''));

/** costWords is the cost of a task in a row, or "" while it cost nothing that the server priced. */
const costWords = (c: WorkCard | undefined): string => (c && c.costUSD > 0 ? costText(c.costUSD) : '');

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

/** resultHead is the first line of a result: the summary of the server, else the answer of its run, else the newest post of its channel, else the title. */
function resultHead(i: NeedsInput, c: WorkCard | undefined, run: string, bridge: string, fallback: string): string {
  if (c && c.summary) return oneLine(c.summary);
  const answer = run && i.answerOf ? i.answerOf(run) : '';
  if (answer) return oneLine(answer);
  const post = bridge && i.lastPostOf ? i.lastPostOf(bridge) : '';
  if (post) return oneLine(post);
  return fallback;
}

/** rowOf turns a row of the inbox into a row of Needs you, with the task of the board that it stands for. */
function rowOf(i: NeedsInput, r: InboxRow, c?: WorkCard): NeedRow {
  const who = r.handle || (r.agent ? i.agentName(r.agent) : '');
  const where = r.bridge ? i.channelTitle(r.bridge) : r.duty ? i.jobTitle(r.duty) : '';
  const base = { key: r.key, agent: r.agent || '', at: r.at, href: hrefOfRow(r), run: r.run || (c && c.links.run) || undefined, bridge: r.bridge || undefined, approval: (r.decision && r.decision.id) || (c && c.links.approval) || undefined, duty: r.duty || undefined, card: c ? c.id : undefined };
  const cost = costWords(c);
  const make = (kind: NeedKind, head: string, parts: string[] = [where, who, cost]): NeedRow => ({ ...base, kind, head, line: lineOf(head, [ACTION[kind], ...parts]) });
  const summary = c && c.summary ? oneLine(c.summary) : '';
  switch (r.kind) {
    case 'decision': {
      // A decision whose call the page has not read says only its verb, such as Allow?; the title of its task says more.
      const asked = r.decision ? askWords(r.decision) : '';
      const bare = !asked || /^[A-Z][a-z]*( [a-z]+)?\?$/.test(asked);
      return make('asks', summary || (bare && c ? c.title : asked) || oneLine(r.reason || '') || 'It asks before it acts.');
    }
    case 'question':
      return make('question', summary || (r.decision ? askWords(r.decision) : oneLine(r.reason || '')) || 'It has a question for you.');
    case 'asked':
      return make('question', summary || (r.entry ? oneLine(r.entry.text || '') : '') || 'It has a question for you.');
    case 'result':
      return make('check', resultHead(i, c, r.run || '', r.bridge || '', where || 'A result to check'));
    case 'limit':
      return make('limit', (who || 'An agent') + ' stopped at its limit', [where, 'Continue gives it more room']);
    case 'duty-paused':
      return make('paused', reasonWords(r.reason || '') || 'The job paused itself.', [where]);
    case 'duty-failed':
      return make('failed', reasonWords(r.reason || '') || 'The job failed.', [where]);
    case 'duty-waits':
      return make('question', summary || oneLine(r.reason || '') || 'The job waits for you.');
    case 'note':
      return { ...make('suggestion', oneLine(r.reason || '') || 'A note waits for you.', [r.handle ? i.agentName(r.handle) : '']), href: r.handle ? chatHref({ view: 'agent', name: r.handle }) : base.href };
    default:
      return make(r.kind === 'stopped' ? 'stopped' : 'failed', oneLine(r.reason || '') || (r.kind === 'stopped' ? 'It stopped.' : 'It failed.'));
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
  const where = c.links.bridge ? i.channelTitle(c.links.bridge) : c.links.duty ? i.jobTitle(c.links.duty) : '';
  const base = { key: 'card:' + c.id, agent, at: c.since, href: hrefOfCard(c), run: c.links.run || undefined, bridge: c.links.bridge || undefined, approval: c.links.approval || undefined, duty: c.links.duty || undefined, card: c.id };
  const who = agent ? i.agentName(agent) : '';
  const parts = [where, who, costWords(c)];
  const make = (kind: NeedKind, head: string): NeedRow => ({ ...base, kind, head, line: lineOf(head, [ACTION[kind], ...parts]) });
  if (c.stage === 'review') return make('check', resultHead(i, c, c.links.run || '', c.links.bridge || '', c.title));
  if (c.stage === 'stopped') return make('stopped', c.summary ? oneLine(c.summary) : c.title);
  return make('question', c.summary ? oneLine(c.summary) : oneLine(c.reason || c.title));
}

/** suggestionRow is the row of a note that waits for Keep or Not now. */
function suggestionRow(i: NeedsInput, w: WaitingChange): NeedRow {
  const head = oneLine(w.text || w.why || '') || 'A note waits for you.';
  const what = w.what === 'updated' ? 'Keep this change?' : 'Keep this note?';
  return { key: 'k:' + w.id, kind: 'suggestion', agent: w.agent, head, line: lineOf(head, [what, i.agentName(w.agent)]), at: w.at, href: chatHref({ view: 'agent', name: w.agent }) };
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
  const take = (r: InboxRow, c?: WorkCard) => {
    used.add(r.key);
    out.push(rowOf(i, r, c));
  };
  for (const c of i.cards || []) {
    if (c.next !== 'you' || c.stage === 'done' || c.stage === 'waiting' || c.stage === 'working') continue;
    const run = c.links.run || '';
    const byKey = rows.find((r) => !used.has(r.key) && ((c.links.approval && r.key === 'd:' + run + '/' + c.links.approval) || (c.stage === 'review' && r.key === 'v:' + run)));
    if (byKey) {
      take(byKey, c);
      continue;
    }
    const inChannel = c.links.bridge ? rows.filter((r) => !used.has(r.key) && r.bridge === c.links.bridge) : [];
    if (inChannel.length && c.stage !== 'review') {
      inChannel.forEach((r) => take(r, c));
      continue;
    }
    const ofJob = !c.links.bridge && c.links.duty ? rows.filter((r) => !used.has(r.key) && r.duty === c.links.duty && !r.bridge && (c.stage !== 'stopped' || r.kind === 'duty-failed' || r.kind === 'duty-paused')) : [];
    if (ofJob.length) {
      ofJob.forEach((r) => take(r, c));
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
      out.push(rowOf(i, match, c));
    } else out.push(cardRow(i, c));
  }
  for (const r of rows) if (r.kind === 'note') out.push(rowOf(i, r));
  return out.sort((a, b) => ms(b.at) - ms(a.at));
}

/** The kind of a row for the kind of an item of the inbox. */
const ITEM_KIND: Record<string, NeedKind> = { result: 'check', question: 'question', approval: 'asks', note: 'suggestion', failure: 'failed' };

/** The ways out of a failed job, while the server names none: Run again and Pause. */
export const FAILED_ACTIONS: InboxAction[] = ['run-again', 'pause'];

/** countsFailure reports whether the one count of the server counts a failure: such a failure names its ways out. A failure with none is a row that the page adds to the count. */
export const countsFailure = (it: Pick<InboxItem, 'kind' | 'actions'>): boolean => it.kind === 'failure' && !!it.actions && it.actions.length > 0;

/** itemHref is where the person takes a way out of an item: the sign-off at the top of a channel or a task, the cards of a channel, a task, or the agent of a note. */
function itemHref(it: InboxItem): string {
  if (it.kind === 'note') return it.agent ? chatHref({ view: 'agent', name: it.agent }) : '#';
  // A decision or a question of a channel waits on the tab Decisions of the channel, which holds every card that waits.
  if (it.bridge && (it.kind === 'question' || it.kind === 'approval')) return chatHref({ view: 'channel', id: it.bridge, tab: 'decisions' });
  if (it.bridge && it.kind === 'result') return chatHref({ view: 'channel', id: it.bridge, tab: 'posts' });
  if (it.run) return chatHref({ view: 'run', id: it.run });
  if (it.bridge) return chatHref({ view: 'channel', id: it.bridge, tab: 'decisions' });
  if (it.duty) return chatHref({ view: 'job', name: it.duty });
  return '#';
}

/** itemHead is the first line of a row of an item: its summary, else the answer or the newest post of its result, else its text without the title in front. */
function itemHead(i: NeedsInput, it: InboxItem): string {
  if (it.summary) return oneLine(it.summary);
  if (it.kind === 'result') {
    const answer = it.run && i.answerOf ? i.answerOf(it.run) : '';
    if (answer) return oneLine(answer);
    const post = it.bridge && i.lastPostOf ? i.lastPostOf(it.bridge) : '';
    if (post) return oneLine(post);
  }
  return oneLine(it.text || '') || (it.kind === 'note' ? 'A note waits for you.' : 'It waits for you.');
}

/**
 * needsOfItems builds the rows of Needs you from the items of the inbox of
 * the front: one row per item that the one count counts, the item of a task
 * of the board (card) and each note that waits, newest first. So the rows
 * equal the count. Each row keeps the ways out of its item (actions) and
 * what it is about, so an answer on the page takes it off at once. A failure
 * and a paused job wait for no move, so they are no row.
 */
export function needsOfItems(i: NeedsInput, items: InboxItem[]): NeedRow[] {
  const out: NeedRow[] = [];
  for (const it of items) {
    // A failed job waits for the person too: Run again or Pause.
    const failed = it.kind === 'failure' && !!it.duty;
    if (!it.card && it.kind !== 'note' && !failed) continue;
    const kind = ITEM_KIND[it.kind] || 'question';
    const why = failed ? oneLine(String(it.summary || it.text || '').replace(/^The job \S+:\s*/, '').replace(/^The run failed:\s*/i, '')) : '';
    const head = failed ? (why ? why.charAt(0).toUpperCase() + why.slice(1) : 'Its last run failed.') : itemHead(i, it);
    const where = it.channel || (it.bridge ? i.channelTitle(it.bridge) : it.duty ? i.jobTitle(it.duty) : '');
    const who = it.handle || (it.agent ? i.agentName(it.agent) : '');
    const cost = it.costUSD && it.costUSD > 0 ? costText(it.costUSD) : '';
    const parts = kind === 'suggestion' ? [who] : [where, who, cost];
    out.push({
      key: it.card ? 'card:' + it.card : failed ? 'f:' + it.duty : 'n:' + (it.note || it.since || ''),
      kind,
      agent: it.agent || '',
      head,
      line: lineOf(head, [ACTION[kind], ...parts]),
      at: it.since || '',
      href: failed ? chatHref({ view: 'job', name: it.duty! }) : itemHref(it),
      run: it.run || undefined,
      bridge: it.bridge || undefined,
      approval: it.approval || undefined,
      duty: it.duty || undefined,
      card: it.card || undefined,
      actions: it.actions && it.actions.length ? it.actions : failed ? FAILED_ACTIONS : [],
      question: it.question || undefined,
      handle: it.handle || undefined,
      note: it.note || undefined,
    });
  }
  return out.sort((a, b) => ms(b.at) - ms(a.at));
}

/** fromItems reports whether the items of the inbox come from a front that names the task of each item and its ways out, so Needs you reads them as they are. */
export const fromItems = (items: InboxItem[] | null | undefined): boolean => !!items && items.some((it) => !!it.card || !!(it.actions && it.actions.length));
