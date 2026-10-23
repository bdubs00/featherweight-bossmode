import { describe, expect, it } from 'vitest';
import { linkRefs, quotedTexts, refCandidates, type Refs } from './refs';
import { renderMarkdown } from './markdown';

const REFS: Refs = {
  bridges: { '01m5kpw79kyq9j8nbpnhvtwm95': 'Release notes for 2.4', 'br-notes': 'Notes' },
  page: (p) => p === 'k3s/monitoring/runbook-memory-pressure.md' || p === 'homelab/backups.md' || p === 'index.md',
};

/** html renders a message with the links of the page, and parses it for the test. */
function html(text: string, refs: Refs = REFS): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = renderMarkdown(text, { refs });
  return box;
}

describe('refCandidates', () => {
  it('finds the paths of pages and the words that can be the ids of bridges, and no plain word', () => {
    expect(refCandidates('Read `k3s/a.md`, then homelab/backups.md. The bridge is open: 01m5kpw79kyq9j8nbpnhvtwm95 and br-notes, with words.')).toEqual({
      paths: ['k3s/a.md', 'homelab/backups.md'],
      words: ['01m5kpw79kyq9j8nbpnhvtwm95', 'br-notes'],
    });
    expect(refCandidates('notes.md.bak and .hidden/x.md and ../up.md')).toEqual({ paths: [], words: [] });
  });
});

describe('linkRefs', () => {
  it('turns the id of a known bridge into a link with its title, in a code span and in plain text', () => {
    const box = html('The bridge is open: `01m5kpw79kyq9j8nbpnhvtwm95`. Follow it with bridge_read (bridge 01m5kpw79kyq9j8nbpnhvtwm95).');
    const links = [...box.querySelectorAll('a')];
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Release notes for 2.4', '#bridge/01m5kpw79kyq9j8nbpnhvtwm95'],
      ['Release notes for 2.4', '#bridge/01m5kpw79kyq9j8nbpnhvtwm95'],
    ]);
    expect(box.querySelector('code')).toBeNull();
    expect(box.textContent).toContain('bridge_read');
  });

  it('links the path of a page of the wiki and keeps the code look of a path in a code span', () => {
    const box = html('See `k3s/monitoring/runbook-memory-pressure.md` and "homelab/backups.md".');
    const [a, b] = [...box.querySelectorAll('a')];
    expect(a.getAttribute('href')).toBe('#pages/k3s/monitoring/runbook-memory-pressure.md');
    expect(a.querySelector('code')!.textContent).toBe('k3s/monitoring/runbook-memory-pressure.md');
    expect(b.getAttribute('href')).toBe('#pages/homelab/backups.md');
    expect(b.textContent).toBe('homelab/backups.md');
  });

  it('leaves an unknown id, a path that is no page, a code block, a link, and a longer code span as they are', () => {
    const box = html('`br-other` and docs/migration.md and `index.md is here` and [index.md](https://x.test/index.md)\n\n```\nbr-notes index.md\n```');
    expect([...box.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['https://x.test/index.md']);
    expect(box.querySelector('pre')!.textContent).toBe('br-notes index.md\n');
  });

  it('links the quoted title of a known bridge and keeps the quotes as text, and drops an id that only repeats it', () => {
    const refs: Refs = { ...REFS, titles: { 'Release notes for 2.4': '01m5kpw79kyq9j8nbpnhvtwm95', 'Proxmox blanks table': 'br-px' }, bridges: { ...REFS.bridges, 'br-px': 'Proxmox blanks table' } };
    expect(quotedTexts('Builds on "Proxmox blanks table" and \u201cRelease notes for 2.4\u201d.')).toEqual(['Proxmox blanks table', 'Release notes for 2.4']);
    // A title alone, in straight and in curly quotes.
    let box = html('Builds on the open bridge "Proxmox blanks table", and \u201cRelease notes for 2.4\u201d waits.', refs);
    expect([...box.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Proxmox blanks table', '#bridge/br-px'],
      ['Release notes for 2.4', '#bridge/01m5kpw79kyq9j8nbpnhvtwm95'],
    ]);
    expect(box.textContent!.trim()).toBe('Builds on the open bridge "Proxmox blanks table", and \u201cRelease notes for 2.4\u201d waits.');
    // The id after the title only repeats it, as plain text or in a code span, and so does the title in a parenthesis.
    for (const text of ['Builds on "Proxmox blanks table" (br-px), which wrote it.', 'Builds on "Proxmox blanks table" (`br-px`), which wrote it.', 'Builds on "Proxmox blanks table" (Proxmox blanks table), which wrote it.']) {
      box = html(text, refs);
      expect(box.textContent!.trim()).toBe('Builds on "Proxmox blanks table", which wrote it.');
      expect(box.querySelectorAll('a').length).toBe(1);
    }
    // An id of another bridge stays, and a quote that names no bridge stays text, with its path linked.
    box = html('Builds on "Proxmox blanks table" (br-notes) and "see index.md".', refs);
    expect([...box.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Proxmox blanks table', 'Notes', 'index.md']);
  });

  it('keeps an underscore, a mention, and a word that holds an id', () => {
    const root = document.createElement('div');
    root.innerHTML = 'bridges/br-notes/draft.md and xbr-notes and @br-notes';
    linkRefs(root, REFS);
    expect(root.querySelectorAll('a').length).toBe(0);
  });
});
