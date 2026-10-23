import { describe, expect, it } from 'vitest';
import { briefOf, planOf, valueLine, verbOf } from './decision';

const open = {
  tool: 'front.bridge_open',
  input: {
    title: 'Runbooks for the new roles',
    goal: 'Write a runbook for each role.',
    members: [
      { handle: 'writer', agent: 'writer', task: 'Write runbooks/cron.md' },
      { handle: 'writer-2', agent: 'writer', task: 'Write runbooks/logrotate.md\nfrom the role' },
      { handle: 'checker', agent: 'reviewer', task: 'Review each runbook' },
    ],
  },
};

describe('planOf', () => {
  it('says what bridge_open opens: the title, the goal, and each seat, with its agent only where the handle does not name it', () => {
    expect(planOf(open)).toEqual({
      kind: 'bridge',
      title: 'Runbooks for the new roles',
      goal: 'Write a runbook for each role.',
      spawn: false,
      seats: [
        { handle: 'writer', agent: '', task: 'Write runbooks/cron.md' },
        { handle: 'writer-2', agent: '', task: 'Write runbooks/logrotate.md from the role' },
        { handle: 'checker', agent: 'reviewer', task: 'Review each runbook' },
      ],
    });
    expect(planOf({ tool: 'mcp__front__bridge_open', input: JSON.stringify({ title: 'T', members: [], placement: 'spawn' }) })).toMatchObject({ kind: 'bridge', title: 'T', spawn: true, seats: [] });
  });

  it('says where pages_write writes, with the first lines of the text after its front matter', () => {
    const plan = planOf({ tool: 'front.pages_write', input: { path: 'releases/freeze.md', summary: 'The plan', text: '---\ntitle: Freeze\n---\n# Freeze\n\nOne.\n\nTwo.\nThree.\nFour.\nFive.' } });
    expect(plan).toEqual({ kind: 'page', path: 'releases/freeze.md', summary: 'The plan', lines: ['# Freeze', 'One.', 'Two.', 'Three.'], more: true });
  });

  it('says to whom spawn_task hands a task, and the task', () => {
    expect(planOf({ tool: 'spawn_task', input: { agent: 'tester', input: 'Time the run.' } })).toEqual({ kind: 'handoff', agent: 'tester', task: 'Time the run.' });
  });

  it('shows the command of a shell call, and nothing more for the files tool, whose sentence says the change', () => {
    expect(planOf({ tool: 'bash', input: { command: 'git push' } })).toEqual({ kind: 'command', command: 'git push' });
    expect(planOf({ tool: 'files', input: { command: 'create', path: 'a.yml', file_text: 'x' } })).toEqual({ kind: 'none' });
  });

  it('shows the top-level fields of any other call, each cut to one line, and counts the rest', () => {
    const plan = planOf({ tool: 'github.create_issue', input: { repo: 'a/b', title: 'Flaky\ncheck', labels: ['x', 'y'], milestone: { title: '2.4' }, draft: false, a: 1, b: 2 } });
    expect(plan).toEqual({
      kind: 'fields',
      fields: [
        { key: 'repo', value: 'a/b' },
        { key: 'title', value: 'Flaky check' },
        { key: 'labels', value: '2 items' },
        { key: 'milestone', value: '1 field' },
        { key: 'draft', value: 'false' },
        { key: 'a', value: '1' },
      ],
      more: 1,
    });
    expect(planOf({ tool: 'clock', input: {} })).toEqual({ kind: 'none' });
    expect(planOf({ tool: 'clock' })).toEqual({ kind: 'none' });
  });
});

describe('valueLine', () => {
  it('cuts a value to one line, and gives the size of a list or an object', () => {
    expect(valueLine(['a'])).toBe('1 item');
    expect(valueLine({})).toBe('0 fields');
    expect(valueLine(null)).toBe('none');
    expect(valueLine('  ')).toBe('empty');
    expect(valueLine('x'.repeat(200))).toHaveLength(120);
  });
});

describe('verbOf', () => {
  it('names the action in a verb, and Allow only as the fallback', () => {
    expect(verbOf({ tool: 'front.bridge_open', label: 'Allow' })).toBe('Open bridge');
    expect(verbOf({ tool: 'front.pages_write', label: 'Allow' })).toBe('Write page');
    expect(verbOf({ tool: 'spawn_task', label: 'Allow' })).toBe('Hand off');
    expect(verbOf({ tool: 'bash', label: 'Run command' })).toBe('Run command');
    expect(verbOf({ tool: 'github.create_issue', label: 'Allow' })).toBe('Allow');
    expect(verbOf({ tool: 'x', label: '' })).toBe('Allow');
  });
});

describe('briefOf', () => {
  it('gives the one line of a plan in a list', () => {
    expect(briefOf(planOf({ tool: 'bash', input: { command: 'ls' } }))).toEqual({ text: 'ls', code: true });
    expect(briefOf(planOf(open))).toEqual({ text: 'Runbooks for the new roles', code: false });
    expect(briefOf(planOf({ tool: 'front.pages_write', input: { path: 'a.md', text: '' } }))).toEqual({ text: 'a.md', code: true });
    expect(briefOf(planOf({ tool: 'x', input: { a: 1 } }))).toBeNull();
  });
});
