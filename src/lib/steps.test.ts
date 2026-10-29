import { describe, expect, it } from 'vitest';
import { pagesWritten, stepInputs, stepWords } from './steps';

describe('stepWords', () => {
  it('names the calls of the front as a person reads them, with the target where the input names one', () => {
    expect(stepWords('front.pages_write', { path: 'k3s/monitoring/manifests/prometheusrule.md', text: '# Rules' })).toBe('Wrote k3s/monitoring/manifests/prometheusrule.md');
    expect(stepWords('front.pages_write', undefined, 'front.pages_write')).toBe('Wrote a page');
    expect(stepWords('front.pages_read', '{"path":"bridges/b1/plan.md"}')).toBe('Read bridges/b1/plan.md');
    expect(stepWords('front.pages_search', { query: 'prometheus rules' })).toBe('Searched the wiki for "prometheus rules"');
    expect(stepWords('front.pages_list', {})).toBe('Listed the pages');
    expect(stepWords('front.pages_history', { path: 'a.md' })).toBe('Read the history of a.md');
    expect(stepWords('front.bridge_post', { text: 'Done.' })).toBe('Posted to the team');
    expect(stepWords('front.bridge_post', { text: 'Look.', to: ['reviewer', 'tester'] })).toBe('Posted to reviewer and tester');
    expect(stepWords('front.bridge_read', {})).toBe('Read the channel');
    expect(stepWords('front.bridge_add_member', { handle: 'tester-2' })).toBe('Seated tester-2');
    expect(stepWords('front.bridge_remove_member', { handle: 'tester-2' })).toBe('Fired tester-2');
    expect(stepWords('ask_user', {})).toBe('Asked you');
  });

  it('keeps the words of the kernel for another tool, unless they are only the name of the tool', () => {
    expect(stepWords('bash', { command: 'ls' }, 'Ran "ls"')).toBe('Ran "ls"');
    expect(stepWords('files', { command: 'create', path: 'a.yml' }, 'Wrote a.yml')).toBe('Wrote a.yml');
    expect(stepWords('github.create_issue', {}, 'github.create_issue')).toBe('Used github.create_issue');
    expect(stepWords('front.fleet', {})).toBe('Read the fleet');
    expect(stepWords('front.bridge_open', { title: 'Release notes' })).toBe('Opened the team Release notes');
    expect(stepWords('spawn_task', { agent: 'tester' })).toBe('Handed off a task to tester');
    expect(stepWords(undefined)).toBe('Used a tool');
  });

  it('words the tools that the manager uses and the quiet tools of the kernel, never by their code names', () => {
    expect(stepWords('front.agents_list', {})).toBe('Looked at the agents');
    expect(stepWords('front.duties_list', {})).toBe('Read the duties');
    expect(stepWords('front.runs_list', { agent: 'migrator' })).toBe('Looked at the recent work');
    expect(stepWords('front.duty_preview', { name: 'nightly' })).toBe('Checked a duty');
    expect(stepWords('front.agent_get', { name: 'reviewer' })).toBe('Read the profile of reviewer');
    expect(stepWords('front.agent_get', {})).toBe('Read the profile of an agent');
    expect(stepWords('front.duty_put', '{"name":"nightly"}')).toBe('Saved the duty nightly');
    expect(stepWords('front.duty_pause', { name: 'nightly', paused: true })).toBe('Paused the duty nightly');
    expect(stepWords('front.duty_pause', { name: 'nightly', paused: false })).toBe('Resumed the duty nightly');
    expect(stepWords('front.faces_put', { agent: 'tester', svg: '<svg/>' })).toBe('Drew a picture of tester');
    expect(stepWords('front.run', { agent: 'tester', input: 'Go.' })).toBe('Gave work to tester');
    expect(stepWords('memory', { command: 'view', path: '/memories' })).toBe('Read its notes');
    expect(stepWords('memory', { command: 'str_replace', path: '/memories/a.md' })).toBe('Wrote in its notes');
    expect(stepWords('memory', { command: 'delete', path: '/memories/a.md' })).toBe('Tidied its notes');
    expect(stepWords('recall', { query: 'x' })).toBe('Searched its memory');
    expect(stepWords('http', { url: 'https://example.com/a' })).toBe('Fetched https://example.com/a');
    expect(stepWords('skill', { name: 'plan' })).toBe('Read the skill plan');
  });
});

describe('pagesWritten', () => {
  it('lists each page once, in the order of its last write, and leaves out a write that failed', () => {
    const items = [
      { kind: 'tool', tool: 'front.pages_write', callId: 'c1', input: { path: 'notes/a.md' } },
      { kind: 'result', callId: 'c1' },
      { kind: 'tool', tool: 'front.pages_write', callId: 'c2', input: { path: 'notes/b' } },
      { kind: 'result', callId: 'c2', isError: true },
      { kind: 'tool', tool: 'front.bridge_post', callId: 'c3', input: { text: 'hi' } },
      { kind: 'tool', tool: 'front.pages_write', callId: 'c4', input: '{"path":"/notes/c.md"}' },
      { kind: 'tool', tool: 'front.pages_write', callId: 'c5', input: { path: 'notes/a.md' } },
    ];
    expect(pagesWritten(items)).toEqual(['notes/c.md', 'notes/a.md']);
    expect(pagesWritten([])).toEqual([]);
  });
});

describe('stepInputs', () => {
  it('pairs the newest steps of each tool with the newest calls of that tool', () => {
    const items = [
      { kind: 'tool', tool: 'front.pages_write', input: { path: 'old.md' } },
      { kind: 'tool', tool: 'front.bridge_read', input: {} },
      { kind: 'tool', tool: 'front.pages_write', input: { path: 'new.md' } },
      { kind: 'result' },
      { kind: 'tool', tool: 'front.bridge_post', input: { text: 'hi' } },
    ];
    const steps = [{ tool: 'front.bridge_read' }, { tool: 'front.pages_write' }, { tool: 'front.bridge_post' }, { tool: 'front.pages_list' }];
    expect(stepInputs(steps, items)).toEqual([{}, { path: 'new.md' }, { text: 'hi' }, undefined]);
  });
});

describe('the steps of env', () => {
  it('name the package and never read the command add as a shell command', () => {
    expect(stepWords('env', { command: 'add', manager: 'python', package: 'ansible-lint' })).toBe('Added the Python package ansible-lint');
    expect(stepWords('env', { command: 'remove', manager: 'tools', package: 'jq' })).toBe('Removed the program jq');
    expect(stepWords('env', { command: 'list' })).toBe('Listed the packages');
  });
});

describe('the words of a question to the person', () => {
  it('says Asked you and the first line of the question, and names the person you', () => {
    expect(stepWords('bridge_post', { ask: true, text: '@operator May I push?\nIt is the nginx role.', choices: ['Approve', 'Decline'] })).toBe('Asked you: May I push?');
    expect(stepWords('front.bridge_post', { ask: true, text: '' })).toBe('Asked you');
    expect(stepWords('bridge_post', { text: 'Done.', to: ['operator', 'tester'] })).toBe('Posted to you and tester');
    expect(stepWords('ask_user', { question: 'Which host first?' })).toBe('Asked you: Which host first?');
  });
});
