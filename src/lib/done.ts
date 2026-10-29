// The definition of done of an agent, as its profile holds it, and the
// static rule of a weak check (plan 4.4). A check whose tool only reads a
// file, a view or a read of a path, and that names no contains and no
// lacks passes on a run that did nothing, because the file can be there
// from before the run. The kernel marks such a pass weak, so Results, the
// board, and Work do not count the run as checked. The profile of the
// agent warns of each such check, so its owner names what the file must
// hold.
//
// A check of the answer has the tool name answer, which the kernel keeps
// for it (fw.DoneAnswer). It makes no tool call: its contains and lacks
// apply to the final answer of the run. With contains or lacks, it is
// strong, also for a run that changed nothing, because the answer must
// say something. With neither, it is weak, because every answer that is
// not empty passes it.

import type { DoneCheck, DoneResult, RunDone } from '../api/types';

/** ANSWER is the tool name that the kernel keeps for a check of the final answer of a run (fw.DoneAnswer). */
export const ANSWER = 'answer';

/** FILE_TOOLS are the tools that take a command and a path, such as the text editor of the kernel. */
const FILE_TOOLS = ['files', 'memory', 'str_replace_based_edit_tool', 'text_editor'];

/** READ_COMMANDS are the commands of such a tool that only read. */
const READ_COMMANDS = ['view', 'read'];

/** READ_TOOLS are the names of tools that only read a file, also after the prefix of a server, such as fs.read_file. */
const READ_TOOLS = /(^|[._])(read|read_file|view|view_file|cat|get_file|read_text_file)$/;

/** inputOf reads the input of a check, or {} when it does not read as an object. */
function inputOf(c: DoneCheck): Record<string, unknown> {
  try {
    const v = JSON.parse(c.input || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** ofAnswer reports whether a check tests the final answer of the run, not the result of a tool call. */
export const ofAnswer = (c: Pick<DoneCheck, 'tool'>): boolean => (c.tool || '').trim() === ANSWER;

/** readsOnly reports whether the call of a check only reads a file: a view or a read of a path. */
export function readsOnly(c: DoneCheck): boolean {
  const tool = (c.tool || '').trim();
  const base = tool.replace(/^.*[/.]/, '');
  if (FILE_TOOLS.includes(base) || base.startsWith('text_editor')) {
    const cmd = String(inputOf(c).command || '').trim();
    return READ_COMMANDS.includes(cmd);
  }
  return READ_TOOLS.test(tool);
}

/** wordsOf keeps the strings of contains or lacks that are not empty. */
const wordsOf = (l: string[] | null | undefined): string[] => (l || []).map((x) => String(x)).filter((x) => x.length > 0);

/**
 * weakCheck reports whether a check is weak: it names no contains and no
 * lacks, and it only reads a file or checks the answer. A check of the
 * answer with contains or lacks is strong.
 */
export function weakCheck(c: DoneCheck): boolean {
  if (wordsOf(c.contains).length || wordsOf(c.lacks).length) return false;
  return ofAnswer(c) || readsOnly(c);
}

/** checkName names a check for a person: its name, else The answer for a check of the answer, else its tool. */
export const checkName = (c: Pick<DoneCheck, 'name' | 'tool'>): string => (c.name && c.name.trim()) || (ofAnswer(c) ? 'The answer' : c.tool);

/** quoted puts each string in quotes and joins them with and. */
const quoted = (l: string[]): string => l.map((x) => '“' + x + '”').join(' and ');

/**
 * answerWords says what a check of the answer looks for, such as Must hold
 * "READY" and must not hold "TODO". It gives "" for any other check, and
 * for a check of the answer that looks for nothing.
 */
export function answerWords(c: DoneCheck): string {
  if (!ofAnswer(c)) return '';
  const holds = wordsOf(c.contains);
  const lacks = wordsOf(c.lacks);
  const parts: string[] = [];
  if (holds.length) parts.push('must hold ' + quoted(holds));
  if (lacks.length) parts.push('must not hold ' + quoted(lacks));
  if (!parts.length) return '';
  const s = parts.join(', and ');
  return s[0].toUpperCase() + s.slice(1) + '.';
}

/** WEAK_WORDS warn of a weak check on the profile of an agent. */
export const WEAK_WORDS = 'This check only reads a file and looks for nothing in it, so a run that did nothing passes it. Results does not count such a run as checked. Name what the file must hold.';

/** WEAK_ANSWER_WORDS warn of a check of the answer that looks for nothing. */
export const WEAK_ANSWER_WORDS = 'This check reads the answer and looks for nothing in it, so every answer passes it. Results does not count such a run as checked. Name what the answer must hold.';

/** weakWords is the warning of a weak check: of the answer, or of a file. */
export const weakWords = (c: DoneCheck): string => (ofAnswer(c) ? WEAK_ANSWER_WORDS : WEAK_WORDS);

/** The most strings of contains and lacks of one check, as the kernel takes them. */
export const MAX_ANSWER_WORDS = 16;

/** The most bytes of one string of contains or lacks, as the kernel takes it. */
const MAX_WORD_BYTES = 4096;

/** splitWords reads what a person typed as the strings of a check: one per line or per comma, without the empty ones. */
export function splitWords(typed: string): string[] {
  return typed
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * answerError says what is wrong with the strings of a check of the
 * answer, or "" when the kernel takes them: at most 16 in all, each at
 * most 4 KiB.
 */
export function answerError(holds: string[], lacks: string[]): string {
  if (holds.length + lacks.length > MAX_ANSWER_WORDS) return `Name at most ${MAX_ANSWER_WORDS} words or phrases in all.`;
  const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const long = [...holds, ...lacks].some((x) => (enc ? enc.encode(x).length : x.length) > MAX_WORD_BYTES);
  return long ? 'Each word or phrase can hold at most 4096 bytes.' : '';
}

/** answerCheck is the check of the answer that a new agent gets, or null when the person named nothing. */
export function answerCheck(holds: string[], lacks: string[]): DoneCheck | null {
  if (!holds.length && !lacks.length) return null;
  return { name: 'The answer', tool: ANSWER, ...(holds.length ? { contains: holds } : {}), ...(lacks.length ? { lacks } : {}) };
}

/* ---------- a pass of the checks ---------- */

/**
 * LIMIT_WORDS names each limit of the budget at which a run stops, as the
 * workbench words it on a card of Work (work/work.go, limitWords).
 */
const LIMIT_WORDS: Record<string, string> = {
  maxTurns: 'its limit of steps',
  maxToolCalls: 'its limit of tool calls',
  maxCallsPerTurn: 'its limit of tool calls in one step',
  maxTokens: 'its limit of tokens',
  maxCostUSD: 'its limit of cost',
  deadline: 'its time limit',
};

/** limitWords names a limit of the budget for a person, such as its limit of tool calls for maxToolCalls. An unknown limit is a limit of its budget. */
export const limitWords = (limit: string): string => LIMIT_WORDS[(limit || '').trim()] || 'a limit of its budget';

/** atLimitWords says that a pass ran after the run stopped at a limit, such as Checked after its limit of tool calls. */
export const atLimitWords = (limit: string): string => 'Checked after ' + limitWords(limit);

/**
 * passWords says the state of the definition of done of a run in a few
 * words: its checks passed, they passed but show nothing about the run, a
 * check failed and the agent fixes its work, or the run is not done.
 */
export function passWords(d: Pick<RunDone, 'state' | 'weak' | 'checks'>): string {
  const checks = d.checks || [];
  const failed = checks.filter((r) => !r.passed).length;
  switch (d.state) {
    case 'checked':
      return d.weak ? 'Its checks passed, but they show nothing about this run' : 'Its checks passed';
    case 'fixing':
      return failed === 1 ? 'A check failed, and it fixes its work' : failed + ' checks failed, and it fixes its work';
    case 'failed':
      return checks.length ? `Not done: ${failed} of ${checks.length} ${checks.length === 1 ? 'check' : 'checks'} failed` : 'Not done';
  }
  return '';
}

/** resultWords says one check of a pass: passed, failed with why, or skipped with why. */
export function resultWords(r: DoneResult): string {
  if (r.skipped) return 'skipped: ' + r.skipped;
  if (r.passed) return 'passed';
  return r.why ? 'failed: ' + r.why : 'failed';
}
