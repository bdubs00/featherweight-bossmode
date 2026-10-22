import { afterEach, describe, expect, it } from 'vitest';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';
import type { Skill } from '../api/types';
import { matches, skillOf, toggleGroup, toggleSkill, skillGroups } from '../lib/catalog';
import { SkillPicker } from './SkillPicker';

let box: HTMLElement | null = null;
afterEach(() => {
  if (!box) return;
  const b = box;
  act(() => render(null, b));
  b.remove();
  box = null;
});
function mount(node: ComponentChildren): HTMLElement {
  const b = document.createElement('div');
  box = b;
  document.body.appendChild(b);
  act(() => render(node, b));
  return b;
}

const SKILLS = [
  { name: 'ansible-style', description: 'Write Ansible roles.', origin: 'imported' },
  { name: 'wiki-writer', description: 'Write a page of the wiki.', origin: 'local' },
  { name: 'docs/search', description: 'Search the docs.', origin: 'mcp', server: 'docs' },
  { name: 'docs/quote', description: 'Quote the docs.', origin: 'mcp', server: 'docs' },
] as Skill[];

/** Harness keeps the value of the picker, as a screen does. */
function Harness({ initial, seen }: { initial: string[]; seen: string[][] }) {
  const [value, setValue] = useState(initial);
  return (
    <SkillPicker
      skills={SKILLS}
      value={value}
      onChange={(v) => {
        seen.push(v);
        setValue(v);
      }}
    />
  );
}

/** pick mounts a picker and returns the box and the value of each change. */
function pick(initial: string[]) {
  const seen: string[][] = [];
  const el = mount(<Harness initial={initial} seen={seen} />);
  return { el, seen, value: () => seen[seen.length - 1] };
}

const boxOf = (el: HTMLElement, text: string) => [...el.querySelectorAll('label')].find((l) => l.textContent!.startsWith(text))!.querySelector('input') as HTMLInputElement;

describe('SkillPicker', () => {
  it('groups the skills by origin with their descriptions', () => {
    const { el } = pick([]);
    const heads = [...el.querySelectorAll('.sp-head .t-caption')].map((x) => x.textContent);
    expect(heads).toEqual(['Imported', 'Local', 'docs']);
    expect(el.querySelector('.sp-row')!.textContent).toContain('Write Ansible roles.');
  });

  it('writes the name of one skill', () => {
    const { el, seen } = pick([]);
    act(() => boxOf(el, 'wiki-writer').click());
    expect(seen.pop()).toEqual(['wiki-writer']);
  });

  it('writes the glob of a server when the whole server goes on', () => {
    const { el, value } = pick(['docs/search']);
    const head = boxOf(el, 'docs');
    expect(head.indeterminate).toBe(true);
    act(() => head.click());
    expect(value()).toEqual(['docs/*']);
    expect(boxOf(el, 'docs/quote').checked).toBe(true);
  });

  it('replaces the glob with the other names when one skill of the server goes off', () => {
    const { el, seen } = pick(['ansible-style', 'docs/*']);
    act(() => boxOf(el, 'docs/search').click());
    expect(seen.pop()).toEqual(['ansible-style', 'docs/quote']);
  });

  it('keeps a name that the catalog does not know', () => {
    const { el, seen } = pick(['old-skill']);
    act(() => boxOf(el, 'ansible-style').click());
    expect(seen.pop()).toEqual(['old-skill', 'ansible-style']);
  });
});

describe('the names of a profile', () => {
  const all = SKILLS.map((s) => skillOf(s as Skill & Record<string, unknown>));
  it('matches a name, the glob of a server, and a glob with a star', () => {
    expect(matches('docs/*', all[2])).toBe(true);
    expect(matches('docs/*', all[0])).toBe(false);
    expect(matches('ansible-*', all[0])).toBe(true);
    expect(matches('wiki-writer', all[1])).toBe(true);
  });
  it('turns a local group on by name and off again', () => {
    const local = skillGroups(all).find((g) => g.key === 'local')!;
    expect(toggleGroup([], local, true)).toEqual(['wiki-writer']);
    expect(toggleGroup(['wiki-writer', 'x'], local, false)).toEqual(['x']);
    expect(toggleSkill(['x'], all[1], true, all)).toEqual(['x', 'wiki-writer']);
  });
});
