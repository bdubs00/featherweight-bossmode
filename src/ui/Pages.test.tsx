import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Bridge, PageMeta } from '../api/types';
import { PageEditor, PageTree, PageView, foldersOf } from './Pages';
import { act } from 'preact/test-utils';
import { store } from '../state/store';
import { parseRoute } from '../lib/route';
import { click, fakeApi, fieldOf, keyNamed, mount, problem, settle, typeIn, unmountAll } from './testkit-c';

const meta = (path: string, at = '2026-10-22T00:00:00Z'): PageMeta => ({ path, title: '', hash: 'h-' + path, size: 1, by: 'agent:writer', at });
const page = (text: string, hash: string, by = 'alice@example.com') => ({ path: 'runbooks/deploy.md', title: 'Deploy', text, hash, version: 3, size: text.length, by, at: '2026-10-22T00:00:00Z' });

let api: ReturnType<typeof fakeApi>;
beforeEach(() => {
  sessionStorage.clear();
  location.hash = '#edit/runbooks/deploy.md';
});
afterEach(() => {
  unmountAll();
  if (api) api.restore();
});

describe('the tree of the wiki', () => {
  it('groups the pages by folder: the root, the folders of people, then the work of bridges and agents', () => {
    const f = foldersOf(
      [meta('runbooks/b.md'), meta('index.md'), meta('agents/migrator/learned.md'), meta('bridges/01m5h96ejx8yh5fqkg/plan.md'), meta('k3s/runbooks/upgrade.md'), meta('runbooks/a.md'), meta('homelab.md'), meta('bridges/br-old/notes.md')],
      { '01m5h96ejx8yh5fqkg': 'Harden the lab hosts' },
    );
    expect(f.map((x) => [x.path, x.pages.map((p) => p.path)])).toEqual([
      ['', ['homelab.md', 'index.md']],
      ['k3s/runbooks', ['k3s/runbooks/upgrade.md']],
      ['runbooks', ['runbooks/a.md', 'runbooks/b.md']],
      ['bridges/br-old', ['bridges/br-old/notes.md']],
      ['bridges/01m5h96ejx8yh5fqkg', ['bridges/01m5h96ejx8yh5fqkg/plan.md']],
      ['agents/migrator', ['agents/migrator/learned.md']],
    ]);
    // A bridge is named by its title, an agent by its name, and a bridge that the page does not know keeps its path.
    expect(f.map((x) => x.title)).toEqual(['', 'k3s/runbooks', 'runbooks', 'bridges/br-old', 'Harden the lab hosts', 'migrator']);
  });

  it('shows each name without .md, and the time as a short meta', async () => {
    api = fakeApi({ 'GET /v1/pages': { pages: [meta('runbooks/deploy.md', new Date(Date.now() - 14 * 60000).toISOString())] } });
    const el = mount(<PageTree />);
    await settle();
    expect(el.querySelector('.group-head')!.textContent).toBe('runbooks1');
    expect(el.querySelector('.wrow .meta')!.textContent).toBe('deploy14 min');
    expect(el.textContent).not.toContain('.md');
  });
  it('names the folder of a bridge by its title and keeps the path in the tooltip', async () => {
    api = fakeApi({});
    act(() => store.dispatch({ type: 'pages', pages: [meta('bridges/01m5h96ejx8yh5fqkg/plan.md'), meta('agents/docs-scribe/learned.md')] }));
    act(() => store.dispatch({ type: 'bridges', bridges: [{ id: '01m5h96ejx8yh5fqkg', title: 'Harden the lab hosts', goal: '', operator: '', state: 'closed', placement: 'queue', createdAt: '', updatedAt: '', lastSeq: 0, read: 0, unread: 0, memberCount: 0, needsYou: 0 } as unknown as Bridge] }));
    const el = mount(<PageTree />);
    await settle();
    const heads = [...el.querySelectorAll('button.group-head')];
    expect(heads.map((h) => h.querySelector('.clip')!.textContent)).toEqual(['Harden the lab hosts', 'docs-scribe']);
    expect(heads.map((h) => h.getAttribute('title'))).toEqual(['bridges/01m5h96ejx8yh5fqkg', 'agents/docs-scribe']);
  });
});

describe('a page', () => {
  it('offers no Edit on _index.md, which the wiki writes', async () => {
    api = fakeApi({ 'GET /v1/pages/_index.md': { ...page('# Every page', 'h1', 'bossmode'), path: '_index.md', title: 'Every page' } });
    const el = mount(<PageView path="_index.md" />);
    await settle();
    expect(keyNamed(el, 'History')).toBeTruthy();
    expect(keyNamed(el, 'Edit')).toBeUndefined();
    expect(el.querySelector('.parts')!.textContent).toContain('bossmode');
  });
});

describe('the links of a page', () => {
  it('resolve a relative link against the folder of the page and open the page of the wiki, and keep a path outside the wiki as text', async () => {
    const text = 'Follow [the house style](../../runbooks/ansible-style.md), [the notes](notes.md), and [the site](https://example.com/style). [The root](../../../outside.md) and [a file](../../roles/cron/tasks/main.yml) are not pages.';
    api = fakeApi({ 'GET /v1/pages/bridges/br-1/plan.md': { ...page(text, 'hp'), path: 'bridges/br-1/plan.md', title: 'Plan' } });
    const el = mount(<PageView path="bridges/br-1/plan.md" />);
    await settle();
    const links = [...el.querySelectorAll('.article a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['the house style', '#pages/runbooks/ansible-style.md'],
      ['the notes', '#pages/bridges/br-1/notes.md'],
      ['the site', 'https://example.com/style'],
      ['The root', null],
      ['a file', null],
    ]);
    expect(parseRoute('#pages/runbooks/ansible-style.md')).toEqual({ place: 'pages', path: 'runbooks/ansible-style.md', mode: 'read' });
  });
});

describe('the editor', () => {
  it('names the page by its title, and opens the text at its top with the caret at its start', async () => {
    const long = 'line\n'.repeat(400);
    api = fakeApi({ 'GET /v1/pages/runbooks/deploy.md': { ...page(long, 'h1'), title: 'Upgrade k3s on jucs-k3s' }, 'GET /v1/pages': { pages: [] } });
    const el = mount(<PageEditor path="runbooks/deploy.md" />);
    await settle();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(el.querySelector('#edit-title')!.textContent).toBe('Edit Upgrade k3s on jucs-k3s');
    const box = fieldOf(el, 'Text') as unknown as HTMLTextAreaElement;
    expect(document.activeElement).toBe(box);
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe(0);
    expect(box.scrollTop).toBe(0);
  });

  it('meets a 412 with the conflict and keeps the text of the person', async () => {
    let reads = 0;
    api = fakeApi({
      'GET /v1/pages/runbooks/deploy.md': () => (++reads === 1 ? { body: page('base', 'h1') } : { body: page('their text', 'h2', 'agent:reviewer') }),
      'PUT /v1/pages/runbooks/deploy.md': (c) => (c.headers['If-Match'] === '"h1"' ? { ...problem(412, 'the page changed'), body: { detail: 'the page changed', hash: 'h2' } } : { body: page('my text', 'h3') }),
      'GET /v1/pages': { pages: [] },
    });
    const el = mount(<PageEditor path="runbooks/deploy.md" />);
    await settle();
    typeIn(fieldOf(el, 'Text'), 'my text');
    click(keyNamed(el, 'Save'));
    await settle();
    const card = el.querySelector('.conflict')!;
    expect(card.querySelector('h3')!.textContent).toBe('reviewer saved this page while you edited it.');
    expect(card.textContent).toContain('Your text is still here.');
    expect(card.querySelector('pre')!.textContent).toBe('their text');
    expect((fieldOf(el, 'Text') as unknown as HTMLTextAreaElement).value).toBe('my text');
    click(keyNamed(card, 'Keep mine'));
    await settle();
    const puts = api.calls.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => c.headers['If-Match'])).toEqual(['"h1"', '"h2"']);
    expect((puts[1].body as { text: string }).text).toBe('my text');
    expect(location.hash).toBe('#pages/runbooks/deploy.md');
  });

  it('takes their version when the person asks', async () => {
    let reads = 0;
    api = fakeApi({
      'GET /v1/pages/runbooks/deploy.md': () => (++reads === 1 ? { body: page('base', 'h1') } : { body: page('their text', 'h2', 'agent:reviewer') }),
      'PUT /v1/pages/runbooks/deploy.md': () => ({ ...problem(412, 'the page changed'), body: { detail: 'the page changed', hash: 'h2' } }),
    });
    const el = mount(<PageEditor path="runbooks/deploy.md" />);
    await settle();
    typeIn(fieldOf(el, 'Text'), 'my text');
    click(keyNamed(el, 'Save'));
    await settle();
    click(keyNamed(el, 'Take theirs'));
    expect((fieldOf(el, 'Text') as unknown as HTMLTextAreaElement).value).toBe('their text');
    expect(el.querySelector('.conflict')).toBeNull();
  });

  it('adds .md to a new page and creates it only when no page has the path', async () => {
    location.hash = '#create';
    api = fakeApi({ 'PUT /v1/pages/runbooks/rollback.md': () => ({ status: 201, body: { ...page('x', 'h9'), path: 'runbooks/rollback.md' } }), 'GET /v1/pages': { pages: [] } });
    const el = mount(<PageEditor create />);
    typeIn(fieldOf(el, 'Path'), 'runbooks/rollback');
    expect(el.textContent).toContain('The page will be runbooks/rollback.md.');
    typeIn(fieldOf(el, 'Text'), '# Rollback');
    click(keyNamed(el, 'Create page'));
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/v1/pages/runbooks/rollback.md');
    expect(put.headers['If-None-Match']).toBe('*');
  });
});
