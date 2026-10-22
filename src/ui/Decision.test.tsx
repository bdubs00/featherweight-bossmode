import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import type { Decision } from '../api/types';
import { DecisionCard, canAlways } from './Decision';
import { fakeFetch, mount, settle, unmountAll } from './testkit-a';
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

  it('opens Details with the tool, the reason, and the input', () => {
    const el = mount(<DecisionCard d={push} who="migrator-2" />);
    const key = el.querySelector('.details-key') as HTMLButtonElement;
    expect(el.querySelector('.details')).toBeNull();
    act(() => key.click());
    expect(key.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.details')!.textContent).toContain('Tool: bash');
    expect(el.querySelector('.details')!.textContent).toContain('Reason: rule: ask bash: git push*');
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
