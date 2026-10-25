// The decision that a run waits for, as a card shows it. A channel can hold
// the card of the decision already. Else the page builds it from the
// pending call of the run, with the label and the effect of the result of
// the run when the page read it. The plan of a decision says in plain form
// what a click on its key does, so the person never reads JSON to decide.

import type { Decision, Entry, Result, ResultDecision, Run } from '../api/types';
import { commandOf, editOf, envCallOf, excerpt, inputFields, toolBase } from './words';

/**
 * decisionOf builds the decision that a run waits for: the card of the
 * channel when the page holds it and it still waits, else the pending call
 * of the run with the label and the effect of its result. It answers null
 * for a run that waits for nothing.
 */
export function decisionOf(run: Run, res?: Result | null, card?: Entry): Decision | null {
  if (card && card.decision && card.decision.state === 'pending') return card.decision;
  const p = run.pending;
  if (!p) return null;
  const rp = res && res.pending && res.pending.id === p.id ? res.pending : null;
  const question = !!(p.schema || (rp && (rp.question || rp.schema)));
  const d: Decision = {
    run: run.id,
    id: p.id,
    tool: p.tool,
    label: (rp && rp.label) || (question ? 'Answer' : 'Allow'),
    question,
    reason: p.reason || (rp ? rp.reason : undefined),
    effect: rp ? rp.effect : undefined,
    input: p.input !== undefined ? p.input : rp ? rp.input : undefined,
    schema: p.schema !== undefined ? p.schema : rp ? rp.schema : undefined,
    state: 'pending',
  };
  // The card of the channel offers Always allow by the rule of the front,
  // so the decision of the run offers the same keys.
  d.always = alwaysByRule(d, !!run.member && !p.connect);
  return d;
}

/** The flags of a policy, which no rule for one tool can stand for. */
const FLAGS = /^(readonly|read-only|idempotent|destructive|parallel|parallelsafe)$/i;

/**
 * alwaysByRule is the rule of the front for Always allow (alwaysOffered of
 * the workbench), for a decision that does not say: a call of one tool on a
 * worker, held by the default rule or by a rule that names the tool, never
 * by a flag such as destructive and never by a pattern such as
 * "bash: git push*" or "ansible.playbook: check=false". A question is no
 * permission to act. The channel and Activity then offer the same keys.
 */
export function alwaysByRule(d: Pick<Decision, 'tool' | 'reason' | 'question' | 'schema'>, onWorker = true): boolean {
  if (!onWorker || !d.tool || d.question || d.schema) return false;
  // A person approves each package, so env never offers Always allow.
  if (toolBase(d.tool) === 'env') return false;
  const r = d.reason || '';
  if (r === 'default') return true;
  const m = /^rule: ask (.+)$/.exec(r);
  if (!m) return false;
  const entry = m[1].trim();
  return !FLAGS.test(entry) && !/[:*?[]/.test(entry);
}

/** One seat of a bridge that a call opens. agent is "" when the handle already names it. */
export interface PlanSeat {
  handle: string;
  agent: string;
  task: string;
}

/** One top-level field of the input of a call, its value cut to one line. */
export interface PlanField {
  key: string;
  value: string;
}

/** A text of several lines in the input of a call, such as a playbook: the card shows its start, and the rest on Show all. */
export interface PlanText {
  key: string;
  text: string;
}

/** A map of file names to their texts in the input of a call, such as the role files of a playbook: each name opens its text. */
export interface PlanFiles {
  key: string;
  files: { name: string; text: string }[];
}

/** The plan of a call: what a click on the primary key of its card does. */
export type Plan =
  | { kind: 'command'; command: string }
  | { kind: 'bridge'; title: string; goal: string; spawn: boolean; seats: PlanSeat[] }
  | { kind: 'page'; path: string; summary: string; lines: string[]; more: boolean }
  | { kind: 'handoff'; agent: string; task: string }
  | { kind: 'fields'; fields: PlanField[]; texts: PlanText[]; files: PlanFiles[]; more: number }
  | { kind: 'none' };

/** The most fields and lines that a card shows. Details holds the rest. */
export const PLAN_FIELDS = 6;
export const PLAN_LINES = 4;
/** The most characters of a goal and of the task of a hand-off that a card shows, from the start. Details holds the rest. */
export const PLAN_TEXT = 280;
/** The lines of a text of a call that a card shows before Show all. */
export const PLAN_TEXT_LINES = 6;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** sameAgent reports whether a handle already names its agent, as reviewer-2 names reviewer. */
const sameAgent = (handle: string, agent: string): boolean => !agent || handle === agent || handle.replace(/-\d+$/, '') === agent;

/**
 * valueLine cuts the value of a field to one line: a text to its first
 * words, an object or a list to its size.
 */
export function valueLine(v: unknown): string {
  if (Array.isArray(v)) return v.length === 1 ? '1 item' : v.length + ' items';
  if (v && typeof v === 'object') {
    const n = Object.keys(v).length;
    return n === 1 ? '1 field' : n + ' fields';
  }
  if (v === null || v === undefined) return 'none';
  if (typeof v === 'string') return v.trim() ? excerpt(v, 120) : 'empty';
  return String(v);
}

/** isText reports whether a value is a text of several lines that a card shows as a block, such as a playbook, and not on one line. */
export function isText(v: unknown): v is string {
  return typeof v === 'string' && v.includes('\n') && (v.trim().split('\n').length >= 3 || v.length > 120);
}

/** A name that reads as the path of a file, such as roles/sshd/tasks/main.yml or site.yml. */
const pathLike = (name: string): boolean => /[/\\]/.test(name) || /\.[A-Za-z0-9]{1,8}$/.test(name);

/**
 * filesOf reads a map of file names to their texts, such as the files of a
 * playbook call, or null for any other value: an object whose values are
 * all texts, and whose key is files or whose names read as paths.
 */
export function filesOf(key: string, v: unknown): PlanFiles | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length || !entries.every(([, t]) => typeof t === 'string')) return null;
  if (key !== 'files' && !entries.every(([name]) => pathLike(name))) return null;
  return { key, files: entries.map(([name, text]) => ({ name, text: text as string })) };
}

/** textLines gives the lines of the text of a page that hold words, after its front matter. */
function textLines(text: string): string[] {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return body
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
}

/**
 * planOf says what a call does when the person allows it, from its tool and
 * its input. A shell call runs its command. bridge_open opens a bridge with
 * its title, its goal, and its seats. pages_write writes a page at a path.
 * spawn_task hands a task to an agent. Any other call shows the top-level
 * fields of its input: the short ones first, each cut to one line, then a
 * text of several lines as a block, such as a playbook, then a map of
 * files by their names, such as the role files of a playbook. The files
 * tool and the tool env say their change in the sentence of the card, so
 * their plan is none.
 */
export function planOf(d: Pick<Decision, 'tool' | 'input'>): Plan {
  const base = toolBase(d.tool);
  // A call of env says its package in the sentence of the card. Its command, such as add, is no shell command.
  if (envCallOf(d.tool, d.input)) return { kind: 'none' };
  const v = inputFields(d.input);
  const cmd = commandOf(d.input);
  if (cmd) return { kind: 'command', command: cmd };
  if (base === 'bridge_open' && v) {
    const members = Array.isArray(v.members) ? v.members : [];
    const seats = members
      .map((m) => inputFields(m))
      .filter((m): m is Record<string, unknown> => !!m)
      .map((m) => {
        const handle = str(m.handle) || str(m.agent);
        return { handle, agent: sameAgent(handle, str(m.agent)) ? '' : str(m.agent), task: excerpt(str(m.task), 200) };
      });
    // The goal reads from its start and ends in an ellipsis where it is long.
    return { kind: 'bridge', title: str(v.title).trim(), goal: excerpt(str(v.goal), PLAN_TEXT), spawn: v.placement === 'spawn', seats };
  }
  if (base === 'pages_write' && v && str(v.path)) {
    const lines = textLines(str(v.text));
    return { kind: 'page', path: str(v.path), summary: excerpt(str(v.summary), 160), lines: lines.slice(0, PLAN_LINES), more: lines.length > PLAN_LINES };
  }
  if (base === 'spawn_task' && v) return { kind: 'handoff', agent: str(v.agent), task: excerpt(str(v.input), PLAN_TEXT) };
  if ((!d.tool || base === 'files') && editOf(d.input)) return { kind: 'none' };
  if (v) {
    const keys = Object.keys(v);
    if (keys.length) {
      // The short facts come first, such as the hosts, check, and become,
      // then the texts as blocks, such as a playbook, then the maps of files.
      const scalars: PlanField[] = [];
      const texts: PlanText[] = [];
      const files: PlanFiles[] = [];
      for (const key of keys) {
        const f = filesOf(key, v[key]);
        if (f) files.push(f);
        else if (isText(v[key])) texts.push({ key, text: (v[key] as string).replace(/\s+$/, '') });
        else scalars.push({ key, value: valueLine(v[key]) });
      }
      return { kind: 'fields', fields: scalars.slice(0, PLAN_FIELDS), texts, files, more: Math.max(0, scalars.length - PLAN_FIELDS) };
    }
  }
  return { kind: 'none' };
}

/**
 * verbOf is the label of the primary key of a card: the action of the call
 * as a verb. The page names the tools that it knows: Open bridge, Write
 * page, and Hand off, and env keeps Allow. A label of the backend, such as
 * Run command, names any other action, and Allow is the last fallback.
 */
export function verbOf(d: Pick<Decision | ResultDecision, 'tool' | 'label'>): string {
  const base = toolBase(d.tool);
  if (base === 'bridge_open') return 'Open bridge';
  if (base === 'pages_write') return 'Write page';
  if (base === 'spawn_task') return 'Hand off';
  if (base === 'env') return 'Allow';
  return d.label && d.label !== 'Answer' ? d.label : 'Allow';
}

/**
 * briefOf is the one line of a plan in a list, such as a row of the inbox:
 * the command or the path as code, or the title of a bridge or the task of
 * a hand-off as words. A plan with no such line answers null.
 */
export function briefOf(plan: Plan): { text: string; code: boolean } | null {
  if (plan.kind === 'command') return { text: plan.command, code: true };
  if (plan.kind === 'page') return { text: plan.path, code: true };
  if (plan.kind === 'bridge' && plan.title) return { text: plan.title, code: false };
  if (plan.kind === 'handoff' && plan.task) return { text: excerpt(plan.task, 120), code: false };
  return null;
}
