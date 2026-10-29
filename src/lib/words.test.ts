import { describe, expect, it } from 'vitest';
import type { Decision } from '../api/types';
import { commandOf, decisionTitle, errorReason, personName, plainText, senderName, since, spanWords, unreadText, whyWords } from './words';

describe('personName', () => {
  it('names the static token Admin token, also as a writer of Know-how, person:token', () => {
    expect(personName('token')).toBe('Admin token');
    expect(personName('person:token')).toBe('Admin token');
    expect(personName('person:alice@example.com')).toBe('alice');
    expect(personName('alice@example.com')).toBe('alice');
  });
});

describe('spanWords', () => {
  it('says a span in its largest whole unit', () => {
    expect([86400, 172800, 21600, 3600, 1800, 90, 5400].map(spanWords)).toEqual(['1 day', '2 days', '6 hours', '1 hour', '30 minutes', '2 minutes', '90 minutes']);
  });
});

describe('since', () => {
  const now = Date.parse('2026-10-21T20:00:00Z');
  it('writes a short meta for a list', () => {
    expect(since('2026-10-21T19:59:40Z', now)).toBe('now');
    expect(since('2026-10-21T19:46:00Z', now)).toBe('14 min');
    expect(since('2026-10-21T17:00:00Z', now)).toBe('3 h');
    expect(since('2026-10-19T20:00:00Z', now)).toBe('2 d');
    expect(since('2026-10-01T20:00:00Z', now)).not.toMatch(/ago|min|h$|d$/);
    expect(since('nonsense', now)).toBe('');
  });
});

describe('whyWords', () => {
  it('names the rule that holds a call as a short label', () => {
    expect(whyWords('rule: ask bash: git push*')).toBe('Rule: ask before git push');
    expect(whyWords('rule: ask destructive')).toBe('Rule: ask before a tool that changes things');
    expect(whyWords('rule: ask github')).toBe('Rule: ask before github');
    expect(whyWords('default')).toBe('Rule: ask first');
    expect(whyWords('')).toBe('');
    expect(whyWords('the budget is low')).toBe('The budget is low');
  });

  it('names a tool of the front without its prefix, also a pattern of tools', () => {
    expect(whyWords('rule: ask front.bridge_open')).toBe('Rule: ask before bridge_open');
    expect(whyWords('rule: ask front.pages_*')).toBe('Rule: ask before pages_*');
  });
});

describe('decisionTitle', () => {
  const d = (tool: string | undefined, input?: unknown, label = 'Allow'): Decision => ({ run: 'r', id: 'a', tool, input, label, state: 'pending' });
  it('says what the call does, without a tool name where the page knows the tool', () => {
    expect(decisionTitle('manager', d('front.bridge_open', { title: 'T' }))).toBe('manager wants to open a bridge');
    expect(decisionTitle('manager', d('front.pages_write', { path: 'a.md', text: '' }))).toBe('manager wants to write a page');
    expect(decisionTitle('manager', d('spawn_task', { agent: 'tester', input: 'x' }))).toBe('manager wants to hand off a task to tester');
    expect(decisionTitle('manager', d('spawn_task', { input: 'x' }))).toBe('manager wants to hand off a task');
    expect(decisionTitle('m', d('files', { command: 'create', path: 'a.yml' }))).toBe('m wants to create a.yml');
    expect(decisionTitle('m', d('bash', { command: 'ls' }, 'Run command'))).toBe('m wants to run a command');
    expect(decisionTitle('m', d('github.create_issue', { title: 'x' }))).toBe('m wants to use github.create_issue');
    expect(decisionTitle('m', d(undefined))).toBe('m asks for your decision');
  });

  it('says the package of a call of env in plain words, with a label of the backend or not', () => {
    expect(decisionTitle('proxmox-admin', d('env', { command: 'add', manager: 'python', package: 'ansible-lint' }))).toBe('proxmox-admin wants the Python package ansible-lint');
    expect(decisionTitle('m', d('env', { command: 'add', manager: 'tools', package: 'nodejs>=22' }, 'Manage packages'))).toBe('m wants the program nodejs>=22');
    expect(decisionTitle('m', d('env', { command: 'remove', manager: 'tools', package: 'jq' }))).toBe('m wants to remove the program jq');
    expect(decisionTitle('m', d('env', JSON.stringify({ command: 'add', manager: 'python' })))).toBe('m wants a Python package');
    expect(decisionTitle('m', d('env', { command: 'list' }))).toBe('m wants to list its packages');
  });

  it('reads no shell command in the input of the files tool, which names its operation in command', () => {
    expect(commandOf({ command: 'str_replace', path: 'a.yml' })).toBe('');
    expect(commandOf({ command: 'ls -la' })).toBe('ls -la');
  });
});

describe('plainText', () => {
  it('drops the marks of Markdown and keeps an underscore inside a word', () => {
    expect(plainText('my toolset has no bridge_read or bridge_post')).toBe('my toolset has no bridge_read or bridge_post');
    expect(plainText('**Bold**, _em_, and `__init__.py`')).toBe('Bold, em, and __init__.py');
    expect(plainText('# Head\n\n- one\n- **two**\n\n> quote')).toBe('Head one two quote');
    expect(plainText('See [the page](a.md) and ![a map](x.png).')).toBe('See the page and a map.');
    expect(plainText('| a | b |\n|---|---|\n| 1 | 2 |')).toBe('a b 1 2');
    expect(plainText('snake_case_name and 2*3*4')).toBe('snake_case_name and 2*3*4');
  });
});

describe('unreadText', () => {
  it('writes the count, 99+ above 99, and 2000+ at the bound of the backend', () => {
    expect(unreadText({ unread: 2 })).toBe('2');
    expect(unreadText({ unread: 150 })).toBe('99+');
    expect(unreadText({ unread: 2000, unreadMore: true })).toBe('2000+');
  });
});

describe('errorReason', () => {
  it('says where a run stopped at a limit', () => {
    expect(errorReason({ state: 'failed', error: 'The run reached its limit of 40 turns.' })).toBe('Stopped at 40 turns');
    expect(errorReason({ state: 'failed', error: 'budget: the run reached its limit of 2.00 USD. Raise it to go on.' })).toBe('Stopped at 2.00 USD');
  });

  it('gives the first sentence of another error, and nothing without one', () => {
    expect(errorReason({ state: 'failed', error: 'The worker stopped. It can start again.' })).toBe('The worker stopped');
    expect(errorReason({ state: 'completed' })).toBe('');
    expect(errorReason(undefined)).toBe('');
  });
});

describe('senderName', () => {
  it('names the Manager with a capital, an agent by its handle, and a person by name', () => {
    expect(senderName({ kind: 'agent', handle: 'manager', run: 'r1' })).toBe('Manager');
    expect(senderName({ kind: 'agent', handle: 'scribe', run: 'r2' })).toBe('scribe');
    expect(senderName({ kind: 'system' })).toBe('bossmode');
  });
});
