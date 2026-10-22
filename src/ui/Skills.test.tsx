import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import type { SkillsList, Whoami } from '../api/types';
import { catalogOf, skillGroups, toolGroups } from '../lib/catalog';
import { SkillActions, SkillList, SkillMain, forgetTools } from './Skills';
import { closeAddSkill, openAddSkill } from './AddSkill';
import { click, fakeApi, fieldOf, keyNamed, mount, problem, settle, typeIn, unmountAll } from './testkit';

const CONTRACT: SkillsList = {
  skills: [
    { name: 'release-notes', description: 'Draft release notes.', origin: 'imported', source: 'https://x.test/SKILL.md', agents: ['scribe'], slash: '/release-notes' },
    { name: 'ansible-style', description: 'Write roles.', origin: 'imported', agents: ['migrator', 'reviewer'], slash: '/ansible-style', license: 'MIT' },
    { name: 'wiki-writer', description: 'Write a page.', origin: 'local', agents: [] },
    { name: 'search-docs', description: 'Search the docs.', origin: 'server', server: 'docs', agents: [] },
  ],
  tools: [
    { id: 'bash', name: 'bash', description: 'Run a command.', origin: 'builtin', agents: [] },
    { id: 'github/create_issue', name: 'create_issue', description: 'Open an issue.', origin: 'server', server: 'github', agents: [] },
  ],
};

const ADMIN: Whoami = { principal: { subject: 'alice@example.com' }, roles: {}, admin: true, canCreate: true };

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  forgetTools();
  act(() => {
    store.dispatch({ type: 'me', me: ADMIN });
    store.dispatch({ type: 'skills', skills: CONTRACT });
  });
});
afterEach(() => {
  closeAddSkill();
  unmountAll();
  if (api) api.restore();
});

describe('the catalog', () => {
  it('groups the skills by origin: Imported, Local, then one group per server', () => {
    const c = catalogOf(CONTRACT);
    expect(skillGroups(c.skills).map((g) => [g.title, g.items.map((s) => s.name)])).toEqual([
      ['Imported', ['ansible-style', 'release-notes']],
      ['Local', ['wiki-writer']],
      ['docs', ['search-docs']],
    ]);
    expect(toolGroups(c.tools).map((g) => g.title)).toEqual(['Built in', 'github']);
  });

  it('reads the backend shape: an empty origin is local, and another origin names a server', () => {
    const c = catalogOf({
      skills: [
        { name: 'a', description: '', origin: '', userInvocable: true },
        { name: 'b', description: '', origin: 'imported', userInvocable: false },
        { name: 'github/triage', description: '', origin: 'github' },
        { name: 'docs/quote', description: '', origin: 'mcp', server: 'docs' },
      ] as never,
      tools: [],
    });
    expect(skillGroups(c.skills).map((g) => g.title)).toEqual(['Imported', 'Local', 'docs', 'github']);
    expect(c.skills.find((s) => s.name === 'a')!.slash).toBe('/a');
    expect(c.skills.find((s) => s.name === 'b')!.slash).toBe('');
  });

  it('reads the tools of GET /v1/tools when the catalog holds none', async () => {
    act(() => store.dispatch({ type: 'skills', skills: { skills: CONTRACT.skills, tools: [] } }));
    api = fakeApi({ 'GET /v1/tools': { tools: [{ name: 'bash', description: 'x', text: 'Runs a shell command.', source: 'builtin' }, { name: 'search', description: 'y', text: 'Searches.', source: 'docs' }] } });
    const el = mount(<SkillList />);
    await settle();
    const heads = [...el.querySelectorAll('.group-head span:first-child')].map((x) => x.textContent);
    expect(heads).toEqual(['Imported', 'Local', 'docs', 'Built in', 'docs']);
    expect(el.textContent).toContain('Runs a shell command.');
  });
});

describe('the Skills place', () => {
  it('lists the groups with their counts, and each row with a name and a description', () => {
    api = fakeApi({});
    const el = mount(<SkillList />);
    const groups = [...el.querySelectorAll('.group-head')].map((g) => g.textContent);
    expect(groups).toEqual(['Imported2', 'Local1', 'docs1', 'Built in1', 'github1']);
    expect(el.querySelector('.srow')!.textContent).toBe('ansible-styleWrite roles.');
  });

  it('shows the text of a skill with its front matter and the agents that can load it', async () => {
    api = fakeApi({ 'GET /v1/bossmode/skills/ansible-style': { ...CONTRACT.skills[1], text: '---\nname: ansible-style\ndescription: Write roles.\nlicense: MIT\nallowed-tools: [bash, files]\n---\n\n# Ansible style\n\n<script>bad()</script>Handlers start with a verb.\n', files: [{ path: 'SKILL.md', size: 120 }] } });
    const el = mount(<SkillMain item={{ kind: 'skill', id: 'ansible-style' }} />);
    await settle();
    expect([...el.querySelectorAll('.fm li')].map((x) => x.textContent)).toEqual(['licenseMIT', 'allowed-toolsbash, files']);
    expect(el.querySelector('.skill-text h1')!.textContent).toBe('Ansible style');
    expect(el.querySelector('.skill-text script')).toBeNull();
    expect([...el.querySelectorAll('.loaders li')].map((x) => x.textContent)).toEqual(['migrator', 'reviewer']);
  });

  it('reads the body of the kernel when the bossmode route has none', async () => {
    api = fakeApi({ 'GET /v1/bossmode/skills/ansible-style': () => problem(405, 'method not allowed'), 'GET /v1/skills/ansible-style': { name: 'ansible-style', body: 'From the kernel.', files: ['notes.md'] } });
    const el = mount(<SkillMain item={{ kind: 'skill', id: 'ansible-style' }} />);
    await settle();
    expect(el.querySelector('.skill-text')!.textContent!.trim()).toBe('From the kernel.');
  });

  it('offers Add skill and Remove to an admin only, and Copy to everyone', () => {
    api = fakeApi({});
    let el = mount(<SkillActions item={{ kind: 'skill', id: 'ansible-style' }} />);
    expect(keyNamed(el, 'Add skill')).toBeTruthy();
    expect(keyNamed(el, 'Remove')).toBeTruthy();
    expect(keyNamed(el, 'Copy /ansible-style')).toBeTruthy();
    unmountAll();
    act(() => store.dispatch({ type: 'me', me: { ...ADMIN, admin: false } }));
    el = mount(<SkillActions item={{ kind: 'skill', id: 'ansible-style' }} />);
    expect(keyNamed(el, 'Add skill')).toBeUndefined();
    expect(keyNamed(el, 'Remove')).toBeUndefined();
    expect(keyNamed(el, 'Copy /ansible-style')).toBeTruthy();
  });

  it('removes an imported skill after Confirm', async () => {
    api = fakeApi({ 'DELETE /v1/bossmode/skills/ansible-style': () => ({ status: 204 }), 'GET /v1/bossmode/skills': CONTRACT });
    const el = mount(<SkillActions item={{ kind: 'skill', id: 'ansible-style' }} />);
    click(keyNamed(el, 'Remove'));
    expect(document.querySelector('dialog.confirm h2')!.textContent).toBe('Remove ansible-style?');
    click(keyNamed(document, 'Remove ansible-style'));
    await settle();
    expect(api.calls.map((c) => c.method + ' ' + c.path)).toContain('DELETE /v1/bossmode/skills/ansible-style');
  });
});

describe('Add skill', () => {
  const PREVIEW = {
    name: 'ansible-style',
    description: 'Write roles.',
    frontMatter: { name: 'ansible-style', description: 'Write roles.', license: 'MIT', 'allowed-tools': ['bash', 'files'] },
    body: '# Ansible style\n\nHandlers start with a verb.',
    files: [
      { path: 'SKILL.md', size: 230 },
      { path: 'scripts/lint.sh', size: 2048 },
    ],
    problems: [{ code: 'binary', path: 'logo.png', text: 'The import leaves out a binary file.', blocks: false }],
    exists: { origin: 'imported', replaceable: true },
    installable: true,
  };

  const openChooser = () => {
    act(() => openAddSkill());
    return mount(<SkillMain item={{ kind: 'skill', id: 'ansible-style' }} />);
  };

  it('offers the four avenues', () => {
    api = fakeApi({ 'GET /v1/bossmode/marketplaces': { marketplaces: [] } });
    const el = openChooser();
    expect(el.querySelector('h1')!.textContent).toBe('Add skill');
    expect([...el.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['From a marketplace', 'From an address', 'Paste a SKILL.md', 'Upload files']);
  });

  it('previews a pasted SKILL.md with its front matter, body, files, and problems, and replaces the imported skill of that name', async () => {
    api = fakeApi({
      'POST /v1/bossmode/skills/preview': PREVIEW,
      'POST /v1/bossmode/skills': () => ({ status: 200, body: { skill: { name: 'ansible-style' }, replaced: true } }),
      'GET /v1/bossmode/skills': CONTRACT,
    });
    const el = openChooser();
    click([...el.querySelectorAll('[role="tab"]')][2]);
    typeIn(fieldOf(el, 'SKILL.md'), '---\nname: ansible-style\n---\n');
    click(keyNamed(el, 'Preview'));
    await settle();
    expect(api.calls.find((c) => c.path === '/v1/bossmode/skills/preview')!.body).toEqual({ text: '---\nname: ansible-style\n---\n' });
    const pv = el.querySelector('.preview')!;
    expect(pv.querySelector('.preview-why')!.textContent).toBe('An installed skill is instructions for every agent of a profile that allows it.');
    expect([...pv.querySelectorAll('.fm li')].map((x) => x.textContent)).toEqual(['licenseMIT', 'allowed-toolsbash, files']);
    expect(pv.querySelector('.preview-body h1')!.textContent).toBe('Ansible style');
    expect([...pv.querySelectorAll('.file-list li')].map((x) => x.textContent)).toEqual(['SKILL.md230 B', 'scripts/lint.sh2.0 KB']);
    expect(pv.querySelector('.problems')!.textContent).toContain('The import leaves out a binary file.');
    expect(pv.textContent).toContain('replaces ansible-style');
    click(keyNamed(pv, 'Install'));
    await settle();
    const install = api.calls.find((c) => c.method === 'POST' && c.path === '/v1/bossmode/skills')!;
    expect(install.body).toEqual({ text: '---\nname: ansible-style\n---\n', replace: true });
    expect(location.hash).toBe('#skills/skill/ansible-style');
  });

  it('meets a 409 on install and replaces only when the person asks', async () => {
    let n = 0;
    api = fakeApi({
      'POST /v1/bossmode/skills/preview': { ...PREVIEW, name: 'molecule-ci', exists: null, problems: [] },
      'POST /v1/bossmode/skills': () => (++n === 1 ? problem(409, 'skills: a skill named molecule-ci exists: an imported skill holds the name.') : { status: 200, body: { skill: { name: 'molecule-ci' }, replaced: true } }),
      'GET /v1/bossmode/skills': CONTRACT,
    });
    const el = openChooser();
    click([...el.querySelectorAll('[role="tab"]')][1]);
    typeIn(fieldOf(el, 'Address'), 'https://skills.test/molecule-ci/SKILL.md');
    click(keyNamed(el, 'Preview'));
    await settle();
    click(keyNamed(el, 'Install'));
    await settle();
    const posts = () => api.calls.filter((c) => c.method === 'POST' && c.path === '/v1/bossmode/skills');
    expect(posts()[0].body).toEqual({ url: 'https://skills.test/molecule-ci/SKILL.md' });
    expect(el.querySelector('.preview [role="alert"]')!.textContent).toBe('A skill named molecule-ci exists: an imported skill holds the name.');
    click(keyNamed(el, 'Replace molecule-ci'));
    await settle();
    expect(posts()[1].body).toEqual({ url: 'https://skills.test/molecule-ci/SKILL.md', replace: true });
  });

  it('blocks Install when a problem blocks', async () => {
    api = fakeApi({ 'POST /v1/bossmode/skills/preview': { ...PREVIEW, problems: [{ code: 'name-missing', text: 'The front matter has no name.', blocks: true }], installable: false } });
    const el = openChooser();
    click([...el.querySelectorAll('[role="tab"]')][2]);
    typeIn(fieldOf(el, 'SKILL.md'), 'no front matter');
    click(keyNamed(el, 'Preview'));
    await settle();
    expect((keyNamed(el, 'Install') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('.problems .status')!.textContent).toBe('blocks');
  });

  it('picks a skill of a marketplace and sends the shape of the contract to a server that refuses the shape of the backend', async () => {
    api = fakeApi({
      'GET /v1/bossmode/marketplaces': { marketplaces: [{ name: 'team-skills', url: 'https://x.test', skills: [{ name: 'molecule-ci', description: 'Run molecule.' }] }] },
      'POST /v1/bossmode/skills/preview': (c) => ((c.body as { source?: unknown }).source ? { body: { token: 'pv-1', skill: { name: 'molecule-ci', description: 'Run molecule.' }, text: '---\nname: molecule-ci\ndescription: Run molecule.\n---\n\nBody.', files: [{ path: 'SKILL.md', size: 60 }] } } : problem(400, 'unknown field marketplace')),
      'POST /v1/bossmode/skills/install': () => ({ status: 201, body: { name: 'molecule-ci' } }),
      'GET /v1/bossmode/skills': CONTRACT,
    });
    const el = openChooser();
    await settle();
    click([...el.querySelectorAll('.markets button')].find((b) => b.textContent!.startsWith('molecule-ci')));
    await settle();
    const previews = api.calls.filter((c) => c.path === '/v1/bossmode/skills/preview');
    expect(previews.map((c) => c.body)).toEqual([{ marketplace: 'team-skills', name: 'molecule-ci' }, { source: { kind: 'marketplace', marketplace: 'team-skills', skill: 'molecule-ci' } }]);
    expect(el.querySelector('.preview-body')!.textContent!.trim()).toBe('Body.');
    click(keyNamed(el, 'Install'));
    await settle();
    expect(api.calls.find((c) => c.path === '/v1/bossmode/skills/install')!.body).toEqual({ token: 'pv-1' });
  });
});
