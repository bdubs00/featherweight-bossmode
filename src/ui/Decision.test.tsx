import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Decision, Run } from '../api/types';
import { store } from '../state/store';
import { DecisionCard, canAlways, mayDecide } from './Decision';
import { bridgeOf, fakeFetch, mount, settle, unmountAll } from './testkit-a';
import { clearNotice, currentNotice } from './notice';

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

  it('offers Always allow by the rule of the page when the backend does not say', () => {
    expect(canAlways({ ...push, always: undefined })).toBe(true);
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
