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
    expect(stepWords('front.bridge_post', { text: 'Done.' })).toBe('Posted to the bridge');
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
    expect(stepWords('front.bridge_open', { title: 'Release notes' })).toBe('Opened the bridge Release notes');
    expect(stepWords('spawn_task', { agent: 'tester' })).toBe('Handed off a task to tester');
    expect(stepWords(undefined)).toBe('Used a tool');
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
