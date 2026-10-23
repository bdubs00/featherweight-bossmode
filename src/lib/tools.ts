// The tools and the rules of an agent in the words of a person. A profile
// lists its tools by their names, such as files, front.pages_read, or a
// glob such as ansible.*, and its rules as patterns, such as bash: git
// push*. A person needs to know what the agent can do and when it asks
// first. So the page names each tool by the plain phrase of the catalog of
// tools (GET /v1/tools), and the raw names go into a tooltip. The tools of
// the wiki are one ability to a person, and so are the tools of the
// bridges. The functions here are pure, so the tests read them without a
// page.

import type { Tool } from '../api/types';

/** One thing that an agent can do: its plain phrase, the names of its tools, and a short noun for a summary, or "". */
export interface Ability {
  /** A stable key: the name of the tool, or the name of its family, such as wiki. */
  key: string;
  text: string;
  /** The tool names of the profile that give it, for the tooltip and for the picks of a chat. */
  names: string[];
  noun: string;
}

/**
 * The phrases of the built-in tools of the kernel, as its catalog words
 * them. The page uses them only when the catalog of the front does not
 * hold the tool, as for a worker whose tools differ from the tools of the
 * front.
 */
const TITLES: Record<string, string> = {
  bash: 'Run shell commands',
  files: 'Read and change files in the workspace',
  http: 'Fetch web addresses on its allowlist',
  memory: 'Keep notes between runs',
  recall: 'Search its memory',
  skill: 'Read its skills',
  clock: 'Read the time',
  ask_user: 'Ask you questions',
  spawn_task: 'Hand work to other agents',
  await_task: 'Wait for the work that it handed off',
  send: 'Send messages to the message bus',
};

/** The short nouns of the built-in tools, for the one line that sums up what a chat can use. */
const NOUNS: Record<string, string> = {
  bash: 'the shell',
  files: 'files',
  http: 'the web',
  web_fetch: 'the web',
  memory: 'memory',
  recall: 'memory',
  clock: 'the time',
  ask_user: 'questions to you',
  spawn_task: 'other agents',
  await_task: 'other agents',
  send: 'messages',
};

/** baseOf is the name of a tool without its server, such as pages_read for front.pages_read. */
export function baseOf(name: string): string {
  return name.slice(Math.max(name.lastIndexOf('.'), name.lastIndexOf('/')) + 1);
}

/** serverOf is the server part of a tool name, such as front for front.pages_read, or "". */
export function serverOf(name: string): string {
  const i = Math.max(name.lastIndexOf('.'), name.lastIndexOf('/'));
  return i > 0 ? name.slice(0, i) : '';
}

/** firstSentence is the description of a tool up to its first full stop. */
const firstSentence = (d: string | undefined): string => {
  const t = (d || '').trim();
  const i = t.search(/[.\n]/);
  return (i >= 0 ? t.slice(0, i) : t).trim();
};

/** toolNamed finds the tool of the catalog that a name of a profile names. */
export function toolNamed(catalog: Tool[] | null | undefined, name: string): Tool | undefined {
  for (const t of catalog || []) {
    const src = t.source || t.server || '';
    if (t.id === name || t.name === name || (src && src !== 'builtin' && (src + '.' + t.name === name || src + '/' + t.name === name))) return t;
  }
  return undefined;
}

/** phraseOf is the plain phrase of one tool: its phrase in the catalog, else the phrase of the kernel, else its name. */
export function phraseOf(catalog: Tool[] | null | undefined, name: string): string {
  const t = toolNamed(catalog, name);
  const text = t ? ((t.text || '').trim() || firstSentence(t.description)).replace(/\.$/, '') : '';
  return text || TITLES[baseOf(name)] || name;
}

/** wikiText words the tools of the wiki: reading, writing, or both. */
function wikiText(bases: string[]): string {
  const all = bases.some((b) => b.includes('*'));
  const writes = all || bases.some((b) => b === 'pages_write');
  const reads = all || bases.some((b) => b !== 'pages_write');
  if (writes && reads) return 'Read and write the wiki';
  return writes ? 'Write the wiki' : 'Read the wiki';
}

/** bridgeText words the tools of the bridges: reading, posting, or both. */
function bridgeText(bases: string[]): string {
  const all = bases.some((b) => b.includes('*'));
  const posts = all || bases.some((b) => /post|send|open|close|add|remove/.test(b));
  const reads = all || bases.some((b) => /read|list/.test(b));
  if (posts && reads) return 'Read and post in bridges';
  return posts ? 'Post in bridges' : 'Read bridges';
}

/** familyOf names the family of a tool that a person counts as one ability: the wiki or the bridges. */
function familyOf(name: string): 'wiki' | 'bridges' | '' {
  const b = baseOf(name);
  if (b.startsWith('pages_')) return 'wiki';
  if (b.startsWith('bridge_')) return 'bridges';
  return '';
}

/** isServer reports whether a name of a profile names a whole server: a glob such as ansible.*, or the name of a source of the catalog. */
function serverName(catalog: Tool[] | null | undefined, name: string): string {
  if (/[./]\*$/.test(name)) return name.slice(0, -2);
  if (name.includes('.') || name.includes('/') || name.includes('*')) return '';
  if (toolNamed(catalog, name)) return '';
  return (catalog || []).some((t) => (t.source || t.server) === name) ? name : '';
}

/**
 * abilitiesOf words a list of tool names, in the order of the list: one
 * ability per tool, one for the tools of the wiki, one for the tools of
 * the bridges, and one per whole server. Two names with the same phrase
 * make one ability.
 */
export function abilitiesOf(names: string[], catalog: Tool[] | null | undefined): Ability[] {
  const out: Ability[] = [];
  const byKey = new Map<string, Ability>();
  const put = (key: string, name: string, make: () => Omit<Ability, 'names' | 'key'>) => {
    let a = byKey.get(key);
    if (!a) {
      a = { key, ...make(), names: [] };
      const same = a.text ? out.find((x) => x.text === a!.text) : undefined;
      if (same) a = same;
      else out.push(a);
      byKey.set(key, a);
    }
    if (!a.names.includes(name)) a.names.push(name);
  };
  for (const name of names) {
    if (!name) continue;
    if (name === '*') {
      put('*', name, () => ({ text: 'Every tool', noun: 'every tool' }));
      continue;
    }
    const fam = familyOf(name);
    if (fam) {
      put(fam, name, () => ({ text: '', noun: fam === 'wiki' ? 'the wiki' : 'bridges' }));
      continue;
    }
    const server = serverName(catalog, name);
    if (server) {
      put('server:' + server, name, () => ({ text: 'Use the tools of ' + server, noun: server }));
      continue;
    }
    const src = serverOf(name);
    put(name, name, () => ({ text: phraseOf(catalog, name), noun: !src || src === 'builtin' ? NOUNS[baseOf(name)] || '' : '' }));
  }
  // The family of the wiki and the family of the bridges take their words once every name is in.
  for (const a of out) {
    if (a.key === 'wiki') a.text = wikiText(a.names.map(baseOf));
    if (a.key === 'bridges') a.text = bridgeText(a.names.map(baseOf));
  }
  return out;
}

/** joined says words as a person says them: a, b, and c. */
export function joined(words: string[]): string {
  if (words.length <= 1) return words.join('');
  if (words.length === 2) return words[0] + ' and ' + words[1];
  return words.slice(0, -1).join(', ') + ', and ' + words[words.length - 1];
}

/**
 * summaryOf sums up what a chat can use in one line, such as Can use files,
 * memory, the time, the wiki, and 2 skills. An ability with no short noun
 * counts as a further tool.
 */
export function summaryOf(abilities: Ability[], skills: number): string {
  const nouns: string[] = [];
  let other = 0;
  for (const a of abilities) {
    if (a.noun) {
      if (!nouns.includes(a.noun)) nouns.push(a.noun);
    } else if (baseOf(a.names[0] || '') !== 'skill') other++;
  }
  const parts = [...nouns];
  if (other > 0) parts.push(nouns.length ? other + (other === 1 ? ' more tool' : ' more tools') : other === 1 ? '1 tool' : other + ' tools');
  if (skills > 0) parts.push(skills === 1 ? '1 skill' : skills + ' skills');
  return parts.length ? 'Can use ' + joined(parts) : 'Can use no tool';
}

/* ---------- the rules ---------- */

/** One rule that asks first, in the words of a person, with the pattern of the profile. */
export interface RuleWords {
  text: string;
  raw: string[];
}

const capFirst = (s: string): string => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string): string => (s ? s[0].toLocaleLowerCase() + s.slice(1) : s);

/** The values of a field that turn a dry run off, such as check=false for Ansible. */
const DRY_FIELDS = ['check', 'check_mode', 'dry_run', 'dryrun', 'dry-run'];

/**
 * ruleText words one rule of a profile that asks first. The rule is a
 * tool, a class of tools, or a tool and a pattern, as the policy of a
 * profile writes it: bash: git push* gives Asks before git push, and
 * ansible.playbook: check=false gives Asks before a real Ansible run.
 */
export function ruleText(rule: string, catalog: Tool[] | null | undefined): string {
  const r = rule.trim();
  if (!r || r === 'default') return 'Asks first';
  if (/^(destructive|readonly|read-only|idempotent|parallel|parallelsafe)$/i.test(r)) return 'Asks before a tool that changes things';
  const m = /^([^\s:]+):\s*(.+)$/.exec(r);
  if (!m) {
    const a = abilitiesOf([r], catalog)[0];
    return 'Asks first: ' + lowerFirst(a ? a.text : r);
  }
  const [, tool, pattern] = m;
  const p = pattern.trim();
  const eq = /^([a-z0-9_.-]+)\s*=\s*(.+)$/i.exec(p);
  if (eq) {
    const [, field, value] = eq;
    if (DRY_FIELDS.includes(field.toLowerCase()) && /^(false|0|no)$/i.test(value.trim())) {
      const subject = serverOf(tool) || tool;
      return 'Asks before a real ' + capFirst(subject) + ' run';
    }
    return 'Asks first when ' + field.replace(/[_-]/g, ' ') + ' is ' + value.trim();
  }
  const words = p.replace(/\*+$/, '').trim();
  if (baseOf(tool) === 'files') return 'Asks before it touches ' + words;
  return 'Asks before ' + words;
}

/** rulesWords words the rules of a profile, one line per meaning, each with the patterns that give it. */
export function rulesWords(rules: string[], catalog: Tool[] | null | undefined): RuleWords[] {
  const out: RuleWords[] = [];
  for (const raw of rules) {
    const text = ruleText(raw, catalog);
    const same = out.find((x) => x.text === text);
    if (same) {
      if (!same.raw.includes(raw)) same.raw.push(raw);
    } else out.push({ text, raw: [raw] });
  }
  return out;
}
