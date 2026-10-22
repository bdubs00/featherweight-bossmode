import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { BossConfig, SkillsList } from '../api/types';
import { DEFAULT_COMPACTION, NewAgent, emptyForm, formErrors, requestOf } from './NewAgent';
import { click, fakeApi, fieldOf, keyNamed, mount, settle, typeIn, unmountAll } from './testkit-c';

const BASE: BossConfig = { manager: null, placement: 'queue', maxMembers: 16 };
const TWO = [
  { name: 'standard', default: false },
  { name: 'large', default: true },
];
const SKILLS: SkillsList = {
  skills: [
    { name: 'ansible-style', description: 'Write roles.', origin: 'imported' },
    { name: 'docs/search', description: 'Search the docs.', origin: 'mcp', server: 'docs' },
  ],
  tools: [{ id: 'bash', name: 'bash', description: 'Run a command.', origin: 'builtin' }],
};

let api: ReturnType<typeof fakeApi>;
const config = (templates?: { name: string; default: boolean }[]) => act(() => store.dispatch({ type: 'config', config: { ...BASE, ...(templates ? { templates } : {}) } as BossConfig }));

beforeEach(() => {
  act(() => {
    store.dispatch({ type: 'agents', agents: [{ name: 'migrator', role: 'owner' }] });
    store.dispatch({ type: 'skills', skills: SKILLS });
  });
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

const saved = (name: string) => ({
  status: 201,
  body: { name, description: 'Lints roles.', role: 'owner', pool: { name, atespace: 'default', agent: name, intake: 'fw.jobs.' + name, wanted: 2, actual: 2, ready: 0, hash: '', tasks: [{ name: name + '-0', phase: 'Pending', current: true }, { name: name + '-1', phase: 'Pending', current: true }], checkedAt: '' } },
});

describe('NewAgent', () => {
  it('asks the name first, and two can work at once by default', () => {
    config();
    api = fakeApi({});
    const el = mount(<NewAgent />);
    const labels = [...el.querySelectorAll('.field-label')].map((x) => x.textContent);
    expect(labels.slice(0, 3)).toEqual(['Name', 'What it handles', 'How many can work at once?']);
    expect(fieldOf(el, 'How many can work at once?')!.value).toBe('2');
    expect(document.activeElement).toBe(fieldOf(el, 'Name'));
  });

  it('shows no template with one template, and preselects the default of several', () => {
    config([{ name: 'standard', default: true }]);
    api = fakeApi({});
    let el = mount(<NewAgent />);
    expect(fieldOf(el, 'Template')).toBeNull();
    unmountAll();
    config(TWO);
    el = mount(<NewAgent />);
    const sel = fieldOf(el, 'Template') as unknown as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['standard', 'large']);
    expect(sel.value).toBe('large');
  });

  it('holds the compaction point in Advanced, at 262144 tokens by default', () => {
    config();
    api = fakeApi({});
    const el = mount(<NewAgent />);
    const adv = el.querySelector('details.advanced')!;
    expect(adv.querySelector('summary')!.textContent).toBe('Advanced');
    expect(fieldOf(adv, 'Compact at, in tokens')!.value).toBe(String(DEFAULT_COMPACTION));
    expect(['Model', 'Effort', 'Turns', 'Tokens', 'Cost in dollars', 'Compaction model', 'Ask before', 'Never run', 'Time zone'].every((l) => fieldOf(adv, l))).toBe(true);
  });

  it('sends the profile and the workers to PUT /v1/agents/{name}, and shows the workers', async () => {
    config(TWO);
    api = fakeApi({ 'PUT /v1/agents/linter': () => saved('linter'), 'GET /v1/agents': { agents: [] }, 'GET /v1/faces': { faces: [] }, 'GET /v1/fleet': { name: 'f', members: [] } });
    const el = mount(<NewAgent />);
    typeIn(fieldOf(el, 'Name'), 'linter');
    typeIn(fieldOf(el, 'What it handles'), 'Lints roles.\nFix every warning.');
    typeIn(fieldOf(el, 'How many can work at once?'), '3');
    click([...el.querySelectorAll('.sp-head input')].find((i) => i.closest('label')!.textContent!.startsWith('docs')));
    const adv = el.querySelector('details.advanced')!;
    typeIn(fieldOf(adv, 'Compact at, in tokens'), '131072');
    typeIn(fieldOf(adv, 'Ask before'), 'bash: git push*, destructive');
    click(keyNamed(el, 'Create agent'));
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/v1/agents/linter');
    expect(put.body).toEqual({
      name: 'linter',
      description: 'Lints roles.',
      instructions: ['Lints roles.\nFix every warning.'],
      skills: ['docs/*'],
      policy: { ask: ['bash: git push*', 'destructive'] },
      compaction: { at: 131072 },
      workers: { replicas: 3, template: 'large' },
    });
    expect(el.querySelector('#workers-out')!.textContent).toContain('Workers');
    expect(el.textContent).not.toMatch(/pool/i);
    expect([...el.querySelectorAll('.worker-rows li')].map((li) => li.textContent)).toEqual(['linter-0starting', 'linter-1starting']);
  });

  it('previews with dryRun and saves nothing', async () => {
    config();
    api = fakeApi({ 'PUT /v1/agents/linter?dryRun=true': { name: 'linter', exists: false, pool: { name: 'linter', wanted: 2, tasks: [] } } });
    const el = mount(<NewAgent />);
    typeIn(fieldOf(el, 'Name'), 'linter');
    click(keyNamed(el, 'Preview'));
    await settle();
    expect(api.calls.map((c) => c.method + ' ' + c.path)).toContain('PUT /v1/agents/linter?dryRun=true');
    expect((api.calls.find((c) => c.method === 'PUT')!.body as { workers: unknown }).workers).toEqual({ replicas: 2 });
    expect(el.textContent).toContain('2 workers start when you create the agent.');
  });

  it('refuses a name that an agent holds, and a bad number of workers', () => {
    const f = { ...emptyForm([]), name: 'migrator', workers: '0' };
    const e = formErrors(f, ['migrator']);
    expect(e.name).toBe('An agent named migrator exists. Pick another name.');
    expect(e.workers).toBe('Pick a number from 1 to 32.');
    expect(formErrors({ ...emptyForm([]), name: '.x' }, []).name).toBeTruthy();
  });

  it('leaves out what the person left empty, and the template of a single template', () => {
    const r = requestOf({ ...emptyForm([{ name: 'only', default: true }]), name: 'a' }, [{ name: 'only', default: true }]);
    expect(r).toEqual({ profile: { skills: [] }, workers: { replicas: 2 } });
    const m = requestOf({ ...emptyForm([]), name: 'a', compactModel: 'small', effort: 'high', cost: '2.5' }, []);
    expect(m.profile.compaction).toEqual({ at: DEFAULT_COMPACTION, model: 'small' });
    expect(m.profile.effort).toBe('high');
    expect(m.profile.budget).toEqual({ maxCostUSD: 2.5 });
  });
});
