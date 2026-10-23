import { describe, expect, it } from 'vitest';
import type { Run } from '../api/types';
import { PLAN_TEXT, alwaysByRule, briefOf, decisionOf, filesOf, isText, planOf, valueLine, verbOf } from './decision';

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

  it('reads a long goal from its start, on one line, and cuts it at its end', () => {
    const goal = 'Collect every fact that the Proxmox runbooks need.\n\n' + 'Builds on the open bridge "Proxmox automation" (01m5j6032f6c8ct57drs6agkqq), which wrote the pages. '.repeat(5);
    const plan = planOf({ tool: 'front.bridge_open', input: { title: 'T', goal, members: [] } });
    const shown = plan.kind === 'bridge' ? plan.goal : '';
    expect(shown.startsWith('Collect every fact that the Proxmox runbooks need. Builds on')).toBe(true);
    expect(shown.length).toBe(PLAN_TEXT);
    expect(shown.endsWith('…')).toBe(true);
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
      texts: [],
      files: [],
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

/** The call of the homelab: a playbook with check false, its text, and a map of role files, about 8 KB. */
const tasks = '- name: harden sshd\n  ansible.builtin.lineinfile:\n    path: /etc/ssh/sshd_config\n    line: PermitRootLogin no\n'.repeat(4);
const playbook = {
  tool: 'ansible.playbook',
  input: {
    playbook: '- hosts: lab\n  roles: [sshd, ntp]\n' + tasks,
    hosts: 'lab',
    check: false,
    become: true,
    files: { 'roles/sshd/tasks/main.yml': tasks, 'roles/ntp/tasks/main.yml': '- name: ntp\n  ansible.builtin.apt: {name: chrony}\n' },
  },
};

describe('the plan of a large call', () => {
  it('puts the short facts first, a text of several lines as a block, and a map of files by name', () => {
    const plan = planOf(playbook);
    if (plan.kind !== 'fields') throw new Error(plan.kind);
    expect(plan.fields).toEqual([
      { key: 'hosts', value: 'lab' },
      { key: 'check', value: 'false' },
      { key: 'become', value: 'true' },
    ]);
    expect(plan.texts.map((t) => t.key)).toEqual(['playbook']);
    expect(plan.texts[0].text.startsWith('- hosts: lab\n  roles: [sshd, ntp]')).toBe(true);
    expect(plan.files).toEqual([{ key: 'files', files: [{ name: 'roles/sshd/tasks/main.yml', text: tasks }, { name: 'roles/ntp/tasks/main.yml', text: '- name: ntp\n  ansible.builtin.apt: {name: chrony}\n' }] }]);
    expect(plan.more).toBe(0);
  });

  it('keeps a short text of two lines on one line, and a map of words that are no files as a field', () => {
    expect(isText('Flaky\ncheck')).toBe(false);
    expect(isText('a\nb\nc')).toBe(true);
    expect(isText('x'.repeat(130) + '\ny')).toBe(true);
    expect(filesOf('body', { text: 'x' })).toBeNull();
    expect(filesOf('files', { a: 'x' })).toEqual({ key: 'files', files: [{ name: 'a', text: 'x' }] });
    expect(filesOf('templates', { 'motd.j2': 'Hello' })).not.toBeNull();
    expect(filesOf('files', { a: 1 })).toBeNull();
  });
});

describe('Always allow', () => {
  it('follows the rule of the front: one tool on a worker, by the default or a rule that names the tool, never a flag or a pattern', () => {
    expect(alwaysByRule({ tool: 'bash', reason: 'default' })).toBe(true);
    expect(alwaysByRule({ tool: 'bash', reason: 'rule: ask bash' })).toBe(true);
    expect(alwaysByRule({ tool: 'bash', reason: 'rule: ask bash: git push*' })).toBe(false);
    expect(alwaysByRule({ tool: 'ansible.playbook', reason: 'rule: ask ansible.playbook: check=false' })).toBe(false);
    expect(alwaysByRule({ tool: 'files', reason: 'rule: ask destructive' })).toBe(false);
    expect(alwaysByRule({ tool: 'ask_user', reason: 'default', question: true })).toBe(false);
    expect(alwaysByRule({ tool: 'bash', reason: 'default' }, false)).toBe(false);
  });

  it('gives the decision of a run the keys of its card: the channel and Activity offer the same keys', () => {
    const run = (reason: string, member = 'default/crew-0'): Run =>
      ({ id: 'r1', agent: 'net-auditor', state: 'input-required', seq: 4, createdAt: '', updatedAt: '', member, pending: { id: 'ap1', tool: 'ansible.playbook', input: playbook.input, reason } }) as Run;
    expect(decisionOf(run('rule: ask ansible.playbook: check=false'))!.always).toBe(false);
    expect(decisionOf(run('rule: ask ansible.playbook'))!.always).toBe(true);
    expect(decisionOf(run('rule: ask ansible.playbook', ''))!.always).toBe(false);
  });
});
