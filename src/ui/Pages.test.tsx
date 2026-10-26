import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Bridge, PageMeta } from '../api/types';
import { PageEditor, PageHistory, PageTree, PageView, foldersOf, newPath, pageNumbers, withoutTitle } from './Pages';
import { clearSaid, currentNotice, currentSaid, undoSaid } from './notice';
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
    // The work folders of the bridges and of the agents each start under a heading.
    expect([...el.querySelectorAll('h2.group-title')].map((h) => h.textContent)).toEqual(['Bridges', 'Agents']);
  });
});

describe('the removed pages', () => {
  const REMOVED = [{ path: 'walk/walk-page-6.md', title: 'Walk page 6', version: 41, removedAt: new Date(Date.now() - 3 * 3600_000).toISOString() }];

  it('fold at the end of the tree, closed, and restore a page, which then opens', async () => {
    api = fakeApi({
      'GET /v1/pages': { pages: [meta('runbooks/deploy.md')] },
      'GET /v1/pages/removed': { removed: REMOVED },
      'GET /v1/pages/walk/walk-page-6.md?version=41': { ...page('# Walk page 6\n\nText.', 'h41'), path: 'walk/walk-page-6.md', version: 41 },
      'PUT /v1/pages/walk/walk-page-6.md': { ...page('# Walk page 6\n\nText.', 'h42'), path: 'walk/walk-page-6.md', version: 42 },
    });
    act(() => store.dispatch({ type: 'pages', pages: [meta('runbooks/deploy.md')] }));
    const el = mount(<PageTree />);
    await settle();
    const head = el.querySelector('#folder-removed') as HTMLButtonElement;
    expect(head.textContent).toBe('Removed pages1');
    expect(head.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.removed-row')).toBeNull();
    click(head);
    const row = el.querySelector('.removed-row')!;
    expect(row.querySelector('.t-sub')!.textContent).toBe('Walk page 6');
    expect(row.querySelector('time')!.textContent).toBe('removed 3 hours ago');
    click(keyNamed(row as HTMLElement, 'Restore'));
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/v1/pages/walk/walk-page-6.md');
    expect(put.headers['If-None-Match']).toBe('*');
    expect(put.body).toEqual({ text: '# Walk page 6\n\nText.', summary: 'Put back after a removal' });
    expect(currentSaid()).toBe('Put back Walk page 6.');
    expect(location.hash).toBe('#pages/walk/walk-page-6.md');
    clearSaid();
  });

  it('do not show while the list is empty, nor on a server without the list', async () => {
    api = fakeApi({ 'GET /v1/pages': { pages: [meta('runbooks/deploy.md')] }, 'GET /v1/pages/removed': { removed: [] } });
    act(() => store.dispatch({ type: 'pages', pages: [meta('runbooks/deploy.md')] }));
    const empty = mount(<PageTree />);
    await settle();
    expect(empty.querySelector('#folder-removed')).toBeNull();
    api.restore();
    // A server without the route answers 404.
    api = fakeApi({ 'GET /v1/pages': { pages: [meta('runbooks/deploy.md')] } });
    const old = mount(<PageTree />);
    await settle();
    expect(api.calls.some((c) => c.path === '/v1/pages/removed')).toBe(true);
    expect(old.querySelector('#folder-removed')).toBeNull();
    expect(currentNotice()).toBe('');
  });
});

describe('the history of a page', () => {
  it('names the page by its title, and by its file without one', async () => {
    api = fakeApi({ 'GET /v1/pages/homelab/proxmox/blanks.md/history': { versions: [] }, 'GET /v1/pages/runbooks/deploy.md/history': { versions: [] } });
    act(() => store.dispatch({ type: 'pages', pages: [{ ...meta('homelab/proxmox/blanks.md'), title: 'Blanks of the Proxmox pages' }, meta('runbooks/deploy.md')] }));
    const titled = mount(<PageHistory path="homelab/proxmox/blanks.md" />);
    const plain = mount(<PageHistory path="runbooks/deploy.md" />);
    await settle();
    expect(titled.querySelector('#history-title')!.textContent).toBe('History of Blanks of the Proxmox pages');
    expect(plain.querySelector('#history-title')!.textContent).toBe('History of deploy');
  });
});

describe('a path that meets another route', () => {
  it('says the page is not here when the answer holds no page', async () => {
    api = fakeApi({ 'GET /v1/pages/runbooks/deploy.md/history': { path: 'runbooks/deploy.md', versions: [] } });
    const el = mount(<PageView path="runbooks/deploy.md/history" />);
    await settle();
    expect(el.textContent).toContain('No page runbooks/deploy.md/history is here.');
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
    // The name takes the focus when the form opens.
    expect(document.activeElement).toBe(fieldOf(el, 'Name'));
    typeIn(fieldOf(el, 'Name'), 'runbooks/rollback');
    expect(el.textContent).toContain('The page will be runbooks/rollback.md.');
    typeIn(fieldOf(el, 'Text'), '# Rollback');
    click(keyNamed(el, 'Create page'));
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/v1/pages/runbooks/rollback.md');
    expect(put.headers['If-None-Match']).toBe('*');
  });

  it('makes the path of a new page from words, and says under the name when a page holds it, with a link to that page', async () => {
    location.hash = '#create';
    api = fakeApi({ 'PUT /v1/pages/walk/walk-page-1.md': () => ({ ...problem(412, 'exists'), body: { detail: 'exists' } }), 'GET /v1/pages': { pages: [] } });
    const el = mount(<PageEditor create />);
    typeIn(fieldOf(el, 'Name'), 'walk/walk page 1');
    expect(el.textContent).toContain('The page will be walk/walk-page-1.md.');
    typeIn(fieldOf(el, 'Text'), '# Walk');
    click(keyNamed(el, 'Create page'));
    await settle();
    expect(api.calls.find((c) => c.method === 'PUT')!.path).toBe('/v1/pages/walk/walk-page-1.md');
    expect(el.querySelector('.field-error')!.textContent).toBe('A page with this name exists already. Pick another name, or edit that page.');
    expect(el.querySelector('.taken-link a')!.getAttribute('href')).toBe('#edit/walk/walk-page-1.md');
    expect(currentNotice()).toBe('');
    expect(document.activeElement).toBe(fieldOf(el, 'Name'));
  });

  it('shows the title of a page once: the first heading of the text goes when it says the title', () => {
    expect(withoutTitle('# Homelab inventory\n\nThe hosts.', 'Homelab inventory')).toBe('The hosts.');
    expect(withoutTitle('\n# Homelab inventory ##\nThe hosts.', 'homelab inventory')).toBe('The hosts.');
    expect(withoutTitle('# Another title\n\nThe hosts.', 'Homelab inventory')).toBe('# Another title\n\nThe hosts.');
    expect(withoutTitle('Text first.\n# Homelab inventory', 'Homelab inventory')).toBe('Text first.\n# Homelab inventory');
    expect(newPath(' runbooks / deploy the  site ')).toBe('runbooks/deploy-the-site.md');
  });

  it('shows one h1 on a page whose text starts with its title, and the meta of an old version once', async () => {
    api = fakeApi({ 'GET /v1/pages/runbooks/deploy.md': page('# Deploy\n\nRun the playbook.', 'h1'), 'GET /v1/pages/runbooks/deploy.md?version=2': { ...page('# Deploy\n\nOld.', 'h0'), version: 2 } });
    const el = mount(<PageView path="runbooks/deploy.md" />);
    await settle();
    expect([...el.querySelectorAll('h1')].map((h) => h.textContent)).toEqual(['Deploy']);
    expect(el.querySelector('.article')!.textContent!.trim()).toBe('Run the playbook.');
    const old = mount(<PageView path="runbooks/deploy.md" version={2} />);
    await settle();
    expect(old.textContent!.match(/An old version, by/g)!.length).toBe(1);
  });

  it('numbers the versions of a page from 1, the oldest first, and a removal has no number', async () => {
    const v = (version: number, extra = {}) => ({ version, hash: 'h' + version, by: 'alice@example.com', at: '2026-10-22T00:00:00Z', size: 1, ...extra });
    expect([...pageNumbers([v(183), v(120), v(90, { deleted: true }), v(42)]).entries()]).toEqual([
      [42, 1],
      [120, 2],
      [183, 3],
    ]);
    api = fakeApi({ 'GET /v1/pages/runbooks/deploy.md/history': { versions: [v(183), v(120), v(90, { deleted: true, hash: '' }), v(42)] } });
    const el = mount(<PageHistory path="runbooks/deploy.md" />);
    await settle();
    expect([...el.querySelectorAll('.vrow .head')].map((x) => x.textContent)).toEqual(['Version 3current', 'Version 2', 'Removed', 'Version 1']);
  });

  it('restores an old version as the newest one, over the newest version', async () => {
    const v = (version: number) => ({ version, hash: 'h' + version, by: 'alice@example.com', at: '2026-10-22T00:00:00Z', size: 1 });
    api = fakeApi({
      'GET /v1/pages/runbooks/deploy.md?version=120': { ...page('Old text.', 'h120'), version: 120 },
      'GET /v1/pages/runbooks/deploy.md/history': { versions: [v(183), v(120), v(42)] },
      'PUT /v1/pages/runbooks/deploy.md': { ...page('Old text.', 'h184'), version: 184 },
      'GET /v1/pages': { pages: [] },
    });
    const el = mount(<PageView path="runbooks/deploy.md" version={120} />);
    await settle();
    expect(el.querySelector('.note-line')!.textContent).toContain('Version 2, by');
    click(keyNamed(el, 'Restore this version'));
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toEqual({ text: 'Old text.', summary: 'Restored version 2' });
    expect(put.headers['If-Match']).toBe('"h183"');
    expect(currentSaid()).toBe('Restored version 2 as the newest version.');
    expect(location.hash).toBe('#pages/runbooks/deploy.md');
    clearSaid();
  });

  it('removes a page after a confirmation that says the history keeps it, and says a removed page can come back', async () => {
    api = fakeApi({
      'GET /v1/pages/runbooks/deploy.md': { ...page('# Deploy\n\nRun it.', 'h7'), version: 7 },
      'GET /v1/pages/runbooks/deploy.md/history': { versions: [{ version: 7, hash: 'h7', by: 'alice@example.com', at: '', size: 1 }] },
      'DELETE /v1/pages/runbooks/deploy.md': () => ({ status: 204 }),
      'GET /v1/pages': { pages: [] },
    });
    const el = mount(<PageView path="runbooks/deploy.md" />);
    await settle();
    expect(el.querySelector('.parts')!.textContent).toContain('Version 1');
    click(el.querySelector('button[aria-label="More for Deploy"]'));
    click([...el.querySelectorAll('[role="menu"] button')].find((b) => b.textContent === 'Remove page'));
    const dialog = document.querySelector('dialog.confirm')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Remove Deploy?');
    expect(dialog.textContent).toContain('The page leaves the wiki. Its history keeps every version, and Restore of a version brings the page back.');
    click([...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Remove page'));
    await settle();
    const del = api.calls.find((c) => c.method === 'DELETE')!;
    expect(del.headers['If-Match']).toBe('"h7"');
    expect(currentSaid()).toBe('Removed Deploy.');
    expect(location.hash).toBe('#pages');
    // Undo puts the text back as the page.
    api.restore();
    api = fakeApi({ 'PUT /v1/pages/runbooks/deploy.md': { ...page('# Deploy\n\nRun it.', 'h7'), version: 9 }, 'GET /v1/pages': { pages: [] } });
    act(() => undoSaid());
    await settle();
    const put = api.calls.find((c) => c.method === 'PUT')!;
    expect(put.headers['If-None-Match']).toBe('*');
    expect(put.body).toEqual({ text: '# Deploy\n\nRun it.', summary: 'Put back after a removal' });
    expect(currentSaid()).toBe('Put back Deploy.');
    expect(location.hash).toBe('#pages/runbooks/deploy.md');
    clearSaid();
    api.restore();
    api = fakeApi({ 'GET /v1/pages/runbooks/deploy.md/history': { versions: [{ version: 8, hash: '', by: '', at: '', size: 0, deleted: true }, { version: 7, hash: 'h7', by: 'alice@example.com', at: '', size: 1 }] } });
    const gone = mount(<PageView path="runbooks/deploy.md" />);
    await settle();
    expect(gone.textContent).toContain('This page was removed. Its history keeps its versions, and Restore brings one back.');
    expect(keyNamed(gone, 'History')!.getAttribute('href')).toBe('#history/runbooks/deploy.md');
  });

  it('names the key that saves beside the keys, and names none on a touch screen', () => {
    api = fakeApi({ 'GET /v1/pages': { pages: [] } });
    const el = mount(<PageEditor create />);
    expect(el.querySelector('.form-end .kbd')!.textContent).toMatch(/^(⌘|Ctrl)\+Enter$/);
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const touch = mount(<PageEditor create />);
      expect(touch.querySelector('.form-end .kbd')).toBeNull();
    } finally {
      window.matchMedia = was;
    }
  });
});
