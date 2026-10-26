import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Decision, Run } from '../api/types';
import { store } from '../state/store';
import { AskCard, DecisionCard, canAlways, mayDecide } from './Decision';
import { bridgeOf, fakeFetch, mount, settle, unmountAll } from './testkit-a';
import { clearNotice, currentNotice } from './notice';
import { setFetch } from '../api/client';
import { NO_SETTLE } from '../state/actions';

afterEach(unmountAll);

const push: Decision = {
  run: 'run-m2',
  id: 'ap-1',
  tool: 'bash',
  label: 'Run command',
  reason: 'rule: ask bash: git push*',
  effect: 'Runs "git push origin migrate/nginx".',
  input: { command: 'git push origin migrate/nginx' },
  state: 'pending',
  always: true,
};
const keys = (el: HTMLElement) => [...el.querySelectorAll('.card-actions button')].map((b) => b.textContent);

describe('the card that waits', () => {
  it('has the title, the breathing light, the sentence, the command, the rule, Details, the Note, and the three keys', () => {
    const el = mount(<DecisionCard d={push} who="migrator-2" />);
    const card = el.querySelector('section.card')!;
    expect(card.classList.contains('quiet')).toBe(false);
    expect(card.querySelector('.card-title h3')!.textContent).toBe('Needs your decision');
    expect(card.querySelector('.card-title .led-amber.breathe')).not.toBeNull();
    expect(card.textContent).toContain('migrator-2 wants to run a command.');
    expect(card.querySelector('pre.command')!.textContent).toBe('git push origin migrate/nginx');
    expect(card.querySelector('.rule')!.textContent).toBe('Rule: ask before git push');
    expect(card.querySelector('.rule code')!.textContent).toBe('git push');
    expect(card.querySelector('.details-key')!.textContent).toBe('Details');
    expect((card.querySelector('input[placeholder="Optional"]') as HTMLInputElement).closest('label')!.textContent).toContain('Note');
    expect(keys(el)).toEqual(['Deny', 'Always allow', 'Run command']);
    expect(card.querySelector('.key-primary')!.textContent).toBe('Run command');
    expect([...card.querySelectorAll('button')].find((b) => b.textContent === 'Always allow')!.getAttribute('title')).toBe('Allow bash for migrator-2 from now on');
  });

  it('opens Details with the tool and the input, and never the rule id of the backend', () => {
    const el = mount(<DecisionCard d={push} who="migrator-2" />);
    const key = el.querySelector('.details-key') as HTMLButtonElement;
    expect(el.querySelector('.details')).toBeNull();
    act(() => key.click());
    expect(key.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.details')!.textContent).toContain('Tool: bash');
    expect(el.querySelector('.details')!.textContent).toContain('"command": "git push origin migrate/nginx"');
    expect(el.textContent).not.toContain('rule: ask');
  });

  it('allows with the note, and denies', async () => {
    const f = fakeFetch([['POST', /\/approvals\//, () => ({})]]);
    try {
      const el = mount(<DecisionCard d={push} who="migrator-2" />);
      const note = el.querySelector('input') as HTMLInputElement;
      act(() => {
        note.value = 'Go ahead';
        note.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => (el.querySelector('.key-primary') as HTMLButtonElement).click());
      await settle();
      expect(f.seen[0]).toEqual({ method: 'POST', path: '/v1/runs/run-m2/approvals/ap-1', body: { decision: 'allow', note: 'Go ahead' } });
      act(() => ([...el.querySelectorAll('button')].find((b) => b.textContent === 'Deny') as HTMLButtonElement).click());
      await settle();
      expect(f.seen[1].body).toEqual({ decision: 'deny', note: 'Go ahead' });
    } finally {
      f.restore();
    }
  });

  it('offers Always allow by the rule of the front when the backend does not say, so every surface offers the same keys', () => {
    expect(canAlways({ ...push, always: undefined, reason: 'rule: ask bash' })).toBe(true);
    expect(canAlways({ ...push, always: undefined, reason: 'default' })).toBe(true);
    // A pattern, such as git push* or check=false, is no rule for the whole tool.
    expect(canAlways({ ...push, always: undefined })).toBe(false);
    expect(canAlways({ ...push, always: undefined, tool: 'ansible.playbook', reason: 'rule: ask ansible.playbook: check=false' })).toBe(false);
    expect(canAlways({ ...push, always: undefined, reason: 'rule: ask destructive' })).toBe(false);
    expect(canAlways({ ...push, always: false })).toBe(false);
  });

  it('settles once when it arrives, and a decided card never settles', () => {
    expect(mount(<DecisionCard d={push} who="migrator-2" settle />).querySelector('.card.settle')).not.toBeNull();
    expect(mount(<DecisionCard d={push} who="migrator-2" />).querySelector('.card.settle')).toBeNull();
    expect(mount(<DecisionCard d={{ ...push, state: 'allow', decidedBy: 'alice@example.com' }} who="migrator-2" settle />).querySelector('.card.settle')).toBeNull();
  });
});

describe('the plan of a call that is not a shell command', () => {
  const open: Decision = {
    run: 'run-mgr',
    id: 'ap-open',
    tool: 'front.bridge_open',
    label: 'Allow',
    reason: 'rule: ask destructive',
    input: {
      title: 'Runbooks for the new roles',
      goal: 'Write a runbook for each role.',
      members: [
        { handle: 'writer-3', agent: 'writer', task: 'Write runbooks/cron.md and runbooks/nginx.md' },
        { handle: 'checker', agent: 'reviewer', task: 'Review each runbook' },
      ],
    },
    state: 'pending',
  };

  it('reads the goal of Open bridge from its start, and links the bridges and the pages that it names', () => {
    act(() => {
      store.dispatch({ type: 'bridges', bridges: [bridgeOf('br-px', { title: 'Proxmox automation' })] });
      store.dispatch({ type: 'pages', pages: [{ path: 'k3s/proxmox/facts.md', title: 'Facts', hash: 'h', size: 1, by: 'token', at: '' }] });
    });
    const goal = 'Collect every fact that the runbooks need, in k3s/proxmox/facts.md. Builds on the open bridge "Proxmox automation" (br-px), which wrote the pages.';
    const el = mount(<DecisionCard d={{ ...open, input: { ...(open.input as object), goal } }} who="manager" />);
    const g = el.querySelector('.plan-goal')!;
    expect(g.textContent!.trim()).toBe('Collect every fact that the runbooks need, in k3s/proxmox/facts.md. Builds on the open bridge "Proxmox automation", which wrote the pages.');
    expect([...g.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['#pages/k3s/proxmox/facts.md', '#bridge/br-px']);
  });

  it('says what Open bridge opens before Details: the title, the goal, and each seat, and never the rule id', () => {
    const el = mount(<DecisionCard d={open} who="manager" />);
    const card = el.querySelector('section.card')!;
    expect(card.textContent).toContain('manager wants to open a bridge.');
    expect(card.querySelector('.plan-title')!.textContent).toBe('Runbooks for the new roles');
    expect(card.querySelector('.plan-goal')!.textContent!.trim()).toBe('Write a runbook for each role.');
    const seats = [...card.querySelectorAll('.plan-seats li')].map((li) => [li.querySelector('.plan-handle')!.textContent, li.querySelector('.plan-agent')?.textContent || '', li.querySelector('.plan-task')!.textContent]);
    expect(seats).toEqual([
      ['writer-3', '', 'Write runbooks/cron.md and runbooks/nginx.md'],
      ['checker', 'reviewer', 'Review each runbook'],
    ]);
    expect(keys(el)).toEqual(['Deny', 'Open bridge']);
    expect(card.querySelector('.rule')!.textContent).toBe('Rule: ask before a tool that changes things');
    expect(card.textContent).not.toContain('rule: ask');
    expect(card.querySelector('pre')).toBeNull();
    act(() => (el.querySelector('.details-key') as HTMLButtonElement).click());
    expect(el.querySelector('.details')!.textContent).toContain('Tool: front.bridge_open');
    expect(el.querySelector('.details pre')!.textContent).toContain('"title": "Runbooks for the new roles"');
    expect(el.querySelector('.details')!.textContent).not.toContain('Reason');
  });

  it('shows the path and the first lines of a page that Write page writes', () => {
    const el = mount(<DecisionCard d={{ ...open, tool: 'front.pages_write', reason: 'rule: ask front.pages_write', input: { path: 'releases/freeze.md', text: '# Freeze\n\nFriday at noon.' } }} who="manager" />);
    expect(el.textContent).toContain('manager wants to write a page.');
    expect(el.querySelector('.plan-path code')!.textContent).toBe('releases/freeze.md');
    expect(el.querySelector('pre.plan-text')!.textContent).toBe('# Freeze\nFriday at noon.');
    expect(el.querySelector('.rule')!.textContent).toBe('Rule: ask before pages_write');
    expect(keys(el)).toEqual(['Deny', 'Always allow', 'Write page']);
  });

  it('says to whom Hand off hands the task, and the task', () => {
    const el = mount(<DecisionCard d={{ ...open, tool: 'spawn_task', input: { agent: 'tester', input: 'Time the molecule run.' } }} who="manager" />);
    expect(el.textContent).toContain('manager wants to hand off a task to tester.');
    expect(el.querySelector('.plan-handoff')!.textContent!.trim()).toBe('Time the molecule run.');
    expect(keys(el)).toEqual(['Deny', 'Hand off']);
  });

  it('lists the top-level fields of any other call, each on one line, and keeps Allow', () => {
    const el = mount(<DecisionCard d={{ ...open, tool: 'github.create_issue', input: { repo: 'a/b', labels: ['x', 'y'], body: { text: 'x' } } }} who="manager" />);
    expect(el.textContent).toContain('manager wants to use github.create_issue.');
    expect([...el.querySelectorAll('.plan-field')].map((f) => f.querySelector('dt')!.textContent + '=' + f.querySelector('dd')!.textContent)).toEqual(['repo=a/b', 'labels=2 items', 'body=1 field']);
    expect(el.querySelector('pre')).toBeNull();
    expect(keys(el)).toEqual(['Deny', 'Allow']);
  });
});

describe('the decided card', () => {
  it('turns quiet, keeps no key, and says who allowed it, with the note on a line of its own', () => {
    const el = mount(<DecisionCard d={{ ...push, state: 'allow', decidedBy: 'alice@example.com', decidedAt: '2026-10-21T20:00:00Z', note: 'Push it.' }} who="migrator-2" />);
    const card = el.querySelector('section.card')!;
    expect(card.classList.contains('quiet')).toBe(true);
    expect(card.querySelector('.breathe')).toBeNull();
    expect(keys(el)).toEqual([]);
    expect(card.querySelector('.card-title h3')!.textContent).toBe('migrator-2 wants to run a command');
    expect(card.querySelector('.decided p')!.textContent).toMatch(/^alice allowed this/);
    expect(card.querySelector('.decided .note')!.textContent).toBe('Push it.');
    expect(card.querySelector('.decided .led-green')).not.toBeNull();
  });

  it('says who denied it', () => {
    const el = mount(<DecisionCard d={{ ...push, state: 'deny', decidedBy: 'bob@example.com' }} who="migrator-2" />);
    expect(el.querySelector('.decided p')!.textContent).toBe('bob denied this');
    expect(el.querySelector('.decided .led-red')).not.toBeNull();
  });

  it('says No decision with the note when the run stopped waiting', () => {
    const el = mount(<DecisionCard d={{ ...push, state: 'deny', note: 'the seat was fired, so the run stopped waiting.' }} who="migrator-2" />);
    expect(el.querySelector('.decided p')!.textContent).toBe('No decision: the seat was fired, so the run stopped waiting.');
  });
});

describe('the card in the state unknown', () => {
  it('shows the note and no key, and changes in place when the state lands', () => {
    const unknown: Decision = { ...push, state: 'unknown', note: 'The run stopped before the decision reached it.' };
    const el = mount(<DecisionCard d={unknown} who="tester" />);
    const card = el.querySelector('section.card')!;
    expect(card.classList.contains('quiet')).toBe(true);
    expect(el.querySelectorAll('button').length).toBe(0);
    expect(card.querySelector('.card-title h3')!.textContent).toBe('tester wants to run a command');
    expect(card.querySelector('.decided')!.textContent).toBe('The run stopped before the decision reached it.');
    unmountAll();
    const later = mount(<DecisionCard d={{ ...unknown, state: 'allow', decidedBy: 'alice@example.com' }} who="tester" />);
    expect(later.querySelector('.decided p')!.textContent).toBe('alice allowed this');
  });
});

describe('the question', () => {
  const q: Decision = {
    run: 'run-scribe',
    id: 'q-1',
    tool: 'ask_user',
    label: 'Answer',
    question: true,
    reason: 'Who reads these notes first?',
    schema: { type: 'object', properties: { audience: { type: 'string', title: 'Audience', enum: ['operators', 'developers'], enumNames: ['Operators', 'Developers'] } }, required: ['audience'] },
    state: 'pending',
  };

  it('asks with the amber light and offers each choice and Decline', () => {
    const el = mount(<DecisionCard d={q} who="scribe" />);
    expect(el.querySelector('.card-title h3')!.textContent).toBe('Needs your answer');
    expect(el.textContent).toContain('scribe asks: Who reads these notes first?');
    expect([...el.querySelectorAll('.pick button')].map((b) => b.textContent)).toEqual(['Operators', 'Developers']);
    expect([...el.querySelectorAll('button')].some((b) => b.textContent === 'Decline')).toBe(true);
  });

  it('says the answer once decided', () => {
    const el = mount(<DecisionCard d={{ ...q, state: 'allow', decidedBy: 'alice@example.com', answer: 'Operators' }} who="scribe" />);
    expect(el.querySelector('.decided p')!.textContent).toBe('alice answered: Operators');
  });
});

describe('Always allow for a person who does not own the agent', () => {
  it('words the refusal of the backend instead of showing its sentence with the subject', async () => {
    clearNotice();
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ title: 'Forbidden', status: 403, detail: 'fd1e8a14-ac12: agent.edit needs an owner entry on the agent chat' }), {
        status: 403,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    ) as typeof fetch;
    try {
      const el = mount(<DecisionCard d={push} who="migrator-2" />);
      const key = [...el.querySelectorAll('.card-actions button')].find((b) => b.textContent === 'Always allow') as HTMLButtonElement;
      await act(async () => {
        key.click();
        await settle();
      });
      expect(currentNotice()).toBe('Always allow needs an owner of the agent. Allow once instead.');
      expect(el.querySelector('.card-title h3')!.textContent).toBe('Needs your decision');
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe('a card that the person may not decide', () => {
  const runOf = (operate: boolean): Run => ({ id: 'run-m2', agent: 'migrator', state: 'input-required', seq: 4, createdAt: '', updatedAt: '', can: { view: true, operate } });

  it('decides by the field can of the run, and offers the keys while the page does not know', () => {
    expect(mayDecide(undefined)).toBe(true);
    expect(mayDecide({})).toBe(true);
    expect(mayDecide({ can: { view: true, operate: true } })).toBe(true);
    expect(mayDecide({ can: { view: true, operate: false } })).toBe(false);
  });

  it('shows the request quietly, with no key and no note, and says who decides', () => {
    act(() => store.dispatch({ type: 'run', run: runOf(false) }));
    const el = mount(<DecisionCard d={push} who="migrator-2" />);
    const card = el.querySelector('section.card')!;
    expect(card.classList.contains('quiet')).toBe(true);
    expect(card.querySelector('.card-title h3')!.textContent).toBe('Waits for a decision');
    expect(card.querySelector('.card-title .led-amber')).not.toBeNull();
    expect(card.querySelector('.breathe')).toBeNull();
    expect(card.textContent).toContain('migrator-2 wants to run a command.');
    expect(card.querySelector('pre.command')!.textContent).toBe('git push origin migrate/nginx');
    expect(card.querySelector('.note')!.textContent).toBe('An operator of migrator decides it.');
    expect(keys(el)).toEqual([]);
    expect(card.querySelector('input')).toBeNull();
  });

  it('offers the keys once the front says that the person may operate the run', () => {
    act(() => store.dispatch({ type: 'run', run: runOf(true) }));
    const el = mount(<DecisionCard d={push} who="migrator-2" />);
    expect(keys(el)).toEqual(['Deny', 'Always allow', 'Run command']);
  });
});

describe('the card of a large call', () => {
  const tasks = Array.from({ length: 10 }, (_, i) => '- name: step ' + (i + 1)).join('\n');
  const call: Decision = {
    run: 'run-na',
    id: 'ap-9',
    tool: 'ansible.playbook',
    label: 'Allow',
    reason: 'rule: ask ansible.playbook: check=false',
    input: { playbook: '- hosts: lab\n' + tasks, hosts: 'lab', check: false, become: true, files: { 'roles/sshd/tasks/main.yml': 'sshd tasks\nline 2', 'roles/ntp/tasks/main.yml': 'ntp tasks' } },
    state: 'pending',
    always: false,
  };

  it('shows hosts, check, and become first, the playbook as a short block of code, and the role files by name, with no JSON', () => {
    const el = mount(<DecisionCard d={call} who="net-auditor" />);
    expect(el.textContent).toContain('net-auditor wants to use ansible.playbook.');
    expect([...el.querySelectorAll('.plan-field')].map((f) => f.querySelector('dt')!.textContent + '=' + f.querySelector('dd')!.textContent)).toEqual(['hosts=lab', 'check=false', 'become=true']);
    const block = el.querySelector('.plan-block')!;
    expect(block.querySelector('.plan-key')!.textContent).toBe('playbook');
    const code = block.querySelector('pre.plan-text')!;
    expect(code.textContent!.split('\n')).toHaveLength(7);
    expect(code.textContent).toContain('…');
    expect([...el.querySelectorAll('.plan-file code')].map((c) => c.textContent)).toEqual(['roles/sshd/tasks/main.yml', 'roles/ntp/tasks/main.yml']);
    expect(el.querySelector('.plan-files pre')).toBeNull();
    expect(el.querySelector('.details')).toBeNull();
    expect(el.textContent).not.toContain('{');
    expect(keys(el)).toEqual(['Deny', 'Allow']);
  });

  it('opens the whole playbook with Show all, and a file with its name', () => {
    const el = mount(<DecisionCard d={call} who="net-auditor" />);
    const toggle = el.querySelector('.plan-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toBe('Show all');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Show less');
    expect(el.querySelector('.plan-block pre.plan-text')!.textContent).toBe('- hosts: lab\n' + tasks);
    const file = el.querySelector('.plan-file') as HTMLButtonElement;
    act(() => file.click());
    expect(file.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.plan-files pre')!.textContent).toBe('sshd tasks\nline 2');
    act(() => file.click());
    expect(el.querySelector('.plan-files pre')).toBeNull();
  });
});

describe('the card of a question of a seat', () => {
  const q = { seq: 12, at: '2026-10-23T04:24:00Z', from: { kind: 'agent' as const, handle: 'reviewer', run: 'run-rev' }, to: ['operator'], text: 'Restart sshd on both hosts?', ask: { choices: ['Yes', 'No'] } };

  it('shows the words of the seat, a key per choice, and Your answer, with the one orange key Answer', () => {
    const el = mount(<AskCard bridge="b1" e={q} who="reviewer" body={<p>{q.text}</p>} />);
    const card = el.querySelector('section.card')!;
    expect(card.querySelector('.card-title h3')!.textContent).toBe('Needs your answer');
    expect(card.querySelector('.card-title .led-amber.breathe')).not.toBeNull();
    expect(card.querySelector('.ask-text')!.textContent).toBe('Restart sshd on both hosts?');
    expect([...card.querySelectorAll('.pick button')].map((b) => b.textContent)).toEqual(['Yes', 'No']);
    expect(card.querySelector('textarea')!.getAttribute('placeholder')).toBe('Your answer');
    expect([...card.querySelectorAll('.key-primary')].map((b) => b.textContent)).toEqual(['Answer']);
  });

  it('answers with a key or in words: a message to the seat in reply to its question', async () => {
    const f = fakeFetch([['POST', /\/v1\/bridges\/b1\/messages$/, (b) => ({ seq: 13, at: '2026-10-23T04:25:00Z', from: { kind: 'person', name: 'alice' }, ...(b as object) })]]);
    try {
      const el = mount(<AskCard bridge="b1" e={q} who="reviewer" body={<p>{q.text}</p>} />);
      act(() => ([...el.querySelectorAll('.pick button')][0] as HTMLButtonElement).click());
      await settle();
      expect(f.seen[0]).toEqual({ method: 'POST', path: '/v1/bridges/b1/messages', body: { text: 'Yes', to: ['reviewer'], replyTo: 12 } });
      const box = el.querySelector('textarea') as HTMLTextAreaElement;
      act(() => {
        box.value = 'lab-1 first, then lab-2.';
        box.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => {
        (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await settle();
      expect(f.seen[1].body).toEqual({ text: 'lab-1 first, then lab-2.', to: ['reviewer'], replyTo: 12 });
    } finally {
      f.restore();
    }
  });
});

describe('No answer needed on the card of a question of a seat', () => {
  const q = { seq: 12, at: '2026-10-23T04:24:00Z', from: { kind: 'agent' as const, handle: 'reviewer', run: 'run-rev' }, to: ['operator'], text: 'Shall I go on with nginx?', ask: {} };
  const seat = (question: number) => ({ handle: 'reviewer', agent: 'reviewer', task: 'Review', runs: ['run-rev'], fired: false, muted: false, presence: 'needs-you' as const, activity: null, question });
  const question = () => store.get().rosters['b-ask'].byHandle.reviewer.question;
  const noAnswer = (el: HTMLElement) => [...el.querySelectorAll('.card-actions button')].find((b) => b.textContent === 'No answer needed') as HTMLButtonElement;

  it('ends the question without an answer, so the seat does not wake and the card leaves', async () => {
    act(() => store.dispatch({ type: 'bridge', bridge: { ...bridgeOf('b-ask'), members: [seat(12)] } }));
    const f = fakeFetch([['POST', /\/v1\/bridges\/b-ask\/questions\/12\/settle$/, () => null]]);
    try {
      const el = mount(<AskCard bridge="b-ask" e={q} who="reviewer" body={<p>{q.text}</p>} />);
      // A quiet key beside Answer: the orange key stays Answer.
      expect(keys(el)).toEqual(['No answer needed', 'Answer']);
      act(() => noAnswer(el).click());
      await settle();
      expect(f.seen.map((x) => [x.method, x.path])).toEqual([['POST', '/v1/bridges/b-ask/questions/12/settle']]);
      expect(question()).toBe(0);
      expect(currentNotice()).toBe('');
    } finally {
      f.restore();
    }
  });

  it('says in words when the server has no way to end a question yet, and the question stays', async () => {
    clearNotice();
    act(() => store.dispatch({ type: 'bridge', bridge: { ...bridgeOf('b-ask'), members: [seat(12)] } }));
    const old = setFetch(async () => new Response('404 page not found', { status: 404, headers: { 'Content-Type': 'text/plain' } }));
    try {
      const el = mount(<AskCard bridge="b-ask" e={q} who="reviewer" body={<p>{q.text}</p>} />);
      act(() => noAnswer(el).click());
      await settle();
      expect(currentNotice()).toBe(NO_SETTLE);
      expect(question()).toBe(12);
    } finally {
      setFetch(old);
      clearNotice();
    }
  });
});

describe('the card of a package', () => {
  const env = (input: Record<string, string>, extra: Partial<Decision> = {}): Decision => ({
    run: 'run-p1',
    id: 'ap-env',
    tool: 'env',
    label: 'Allow',
    reason: 'rule: ask env: command=add',
    effect: 'Runs uv add ansible-lint.',
    input,
    state: 'pending',
    always: true,
    ...extra,
  });

  it('says the Python package in plain words, what Allow does, and offers Deny and Allow only', () => {
    const el = mount(<DecisionCard d={env({ command: 'add', manager: 'python', package: 'ansible-lint' })} who="proxmox-admin" />);
    const card = el.querySelector('section.card')!;
    expect(card.querySelector('.card-title h3')!.textContent).toBe('Needs your decision');
    expect(card.textContent).toContain('proxmox-admin wants the Python package ansible-lint.');
    expect(card.querySelector('.effect')!.textContent).toBe('Allow installs it now and keeps it for every worker of this agent.');
    expect(keys(el)).toEqual(['Deny', 'Allow']);
    expect(card.querySelector('.key-primary')!.textContent).toBe('Allow');
    // No rule, no raw input, no command, and no word of the tools that install it.
    expect(card.querySelector('.rule-row')).toBeNull();
    expect(card.querySelector('.details-key')).toBeNull();
    expect(card.querySelector('pre.command')).toBeNull();
    expect(card.textContent!.toLowerCase()).not.toMatch(/\buv\b|pixi|conda|pypi|command=/);
  });

  it('says the program, and a remove', () => {
    const add = mount(<DecisionCard d={env({ command: 'add', manager: 'tools', package: 'iproute2' })} who="reviewer" />);
    expect(add.textContent).toContain('reviewer wants the program iproute2.');
    const rm = mount(<DecisionCard d={env({ command: 'remove', manager: 'tools', package: 'jq' }, { reason: 'rule: ask env: command=remove' })} who="reviewer" />);
    expect(rm.textContent).toContain('reviewer wants to remove the program jq.');
    expect(rm.querySelector('.effect')!.textContent).toBe('Allow removes it now and from every worker of this agent.');
    const py = mount(<DecisionCard d={env({ command: 'remove', manager: 'python', package: 'six' })} who="reviewer" />);
    expect(py.textContent).toContain('reviewer wants to remove the Python package six.');
    expect(keys(rm)).toEqual(['Deny', 'Allow']);
  });

  it('never offers Always allow for a package, whatever the front says', () => {
    expect(canAlways(env({ command: 'add', manager: 'python', package: 'six' }))).toBe(false);
    expect(canAlways(env({ command: 'add', manager: 'python', package: 'six' }, { always: undefined, reason: 'default' }))).toBe(false);
  });

  it('allows and denies the call as any card does', async () => {
    const f = fakeFetch([['POST', /\/approvals\//, () => ({})]]);
    try {
      const el = mount(<DecisionCard d={env({ command: 'add', manager: 'python', package: 'ansible-lint' })} who="proxmox-admin" />);
      act(() => (el.querySelector('.key-primary') as HTMLButtonElement).click());
      await settle();
      expect(f.seen[0]).toEqual({ method: 'POST', path: '/v1/runs/run-p1/approvals/ap-env', body: { decision: 'allow' } });
      act(() => ([...el.querySelectorAll('button')].find((b) => b.textContent === 'Deny') as HTMLButtonElement).click());
      await settle();
      expect(f.seen[1].body).toEqual({ decision: 'deny' });
    } finally {
      f.restore();
    }
  });

  it('turns quiet once decided, with the words of the package as its title and no line of what Allow does', () => {
    const el = mount(<DecisionCard d={env({ command: 'add', manager: 'python', package: 'ansible-lint' }, { state: 'allow', decidedBy: 'alice@example.com', decidedAt: '2026-10-25T10:00:00Z' })} who="proxmox-admin" />);
    expect(el.querySelector('.card-title h3')!.textContent).toBe('proxmox-admin wants the Python package ansible-lint');
    expect(el.querySelector('.effect')).toBeNull();
    expect(el.querySelector('.decided')!.textContent).toContain('allowed this');
  });
});
