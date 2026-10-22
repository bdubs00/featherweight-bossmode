import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import { setFetch, type FetchLike } from '../../api/client';
import { store } from '../../state/store';
import { markOf, markPath } from '../../lib/mark';
import { forgetFaces } from '../../lib/faces';
import { Avatar, Button, Card, Chip, Command, Field, GrooveBand, Help, IconButton, Input, Led, LogoWell, Mark, PaneHeader, ReactionChip, Tabs, countText, glyphPx, initialsOf } from './index';

let box: HTMLElement;

function mount(node: ComponentChildren): HTMLElement {
  box = document.createElement('div');
  document.body.appendChild(box);
  act(() => {
    render(node, box);
  });
  return box;
}

afterEach(() => {
  if (box) {
    act(() => render(null, box));
    box.remove();
  }
});

describe('Led', () => {
  it('shows the word beside the light in the color of its tone', () => {
    const el = mount(<Led tone="green" word="working" />);
    expect(el.textContent).toBe('working');
    expect(el.querySelector('.status')!.classList.contains('tone-green')).toBe(true);
    expect(el.querySelector('.led')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('breathes only for amber', () => {
    for (const tone of ['green', 'red', 'grey'] as const) {
      const el = mount(<Led tone={tone} word="x" />);
      expect(el.querySelector('.breathe')).toBeNull();
      act(() => render(null, el));
    }
    expect(mount(<Led tone="amber" word="needs you" />).querySelector('.led.breathe')).not.toBeNull();
  });

  it('keeps a quiet word for a screen reader and a tooltip', () => {
    const el = mount(<Led tone="grey" word="asleep" quiet />);
    expect(el.querySelector('.sr')!.textContent).toBe('asleep');
    expect(el.querySelector('.status')!.getAttribute('title')).toBe('asleep');
  });

  it('strikes the word of a fired seat', () => {
    expect(mount(<Led tone="grey" word="fired" struck />).querySelector('.status.struck')).not.toBeNull();
  });
});

describe('Mark', () => {
  beforeAll(() => {
    if (!URL.createObjectURL) (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:face';
    if (!URL.revokeObjectURL) (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  });

  it('draws the glyph of the name in the hue of the name', () => {
    const el = mount(<Mark agent="migrator" size={32} />);
    const svg = el.querySelector('svg.mark-glyph')!;
    const g = markOf('migrator');
    expect(svg.classList.contains('hue-' + g.hue)).toBe(true);
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(markPath(g.cells));
    expect(svg.getAttribute('width')).toBe(String(glyphPx(32)));
    expect(el.querySelector('.mark')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives the manager ink', () => {
    act(() => store.dispatch({ type: 'config', config: { manager: { agent: 'boss', member: 'm', run: '' }, placement: 'queue', maxMembers: 16 } }));
    expect(mount(<Mark agent="boss" />).querySelector('svg.hue-ink')).not.toBeNull();
    act(() => store.dispatch({ type: 'config', config: null }));
  });

  it('shows a halo with the word in the tooltip and the accessible name', () => {
    const mark = mount(<Mark agent="migrator" size={36} halo={{ tone: 'green', word: 'working' }} label="migrator-1" />).querySelector('.mark')!;
    expect(mark.classList.contains('halo-green')).toBe(true);
    expect(mark.getAttribute('role')).toBe('img');
    expect(mark.getAttribute('aria-label')).toBe('migrator-1, working');
    expect(mark.getAttribute('title')).toBe('working');
  });

  it('reads a custom face as a blob behind the token, and only a custom one', async () => {
    const seen: string[] = [];
    const old: FetchLike = setFetch(async (input) => {
      seen.push(String(input));
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    });
    try {
      act(() => store.dispatch({ type: 'faces', faces: [{ agent: 'fox', displayName: 'Fox', tagline: '', hash: 'h1', custom: true }, { agent: 'plain', displayName: 'Plain', tagline: '', hash: 'h2', custom: false }] }));
      const el = mount(
        <>
          <Mark agent="fox" />
          <Mark agent="plain" />
        </>,
      );
      await vi.waitFor(() => expect(el.querySelector('img')).not.toBeNull());
      expect(seen).toEqual(['/v1/faces/fox']);
      expect(el.querySelectorAll('svg.mark-glyph').length).toBe(1);
    } finally {
      setFetch(old);
      forgetFaces();
    }
  });
});

describe('Avatar', () => {
  it('shows the initials of a person on ink', () => {
    expect(initialsOf('alice')).toBe('AL');
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('')).toBe('?');
    const el = mount(<Avatar subject="bob@example.com" />);
    expect(el.textContent).toBe('BO');
    expect(el.querySelector('.avatar')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Chip', () => {
  it('writes 99+ above 99 and names the count for a screen reader', () => {
    expect(countText(99)).toBe('99');
    expect(countText(100)).toBe('99+');
    const el = mount(<Chip tone="ink" label="3 unread">3</Chip>);
    expect(el.querySelector('.chip-ink')).not.toBeNull();
    expect(el.querySelector('.sr')!.textContent).toBe('3 unread');
  });
});

describe('Button', () => {
  it('draws the three kinds of key, and a link with href', () => {
    const el = mount(
      <>
        <Button kind="primary">Send</Button>
        <Button>Deny</Button>
        <Button kind="quiet" size="s">
          Dismiss
        </Button>
        <Button href="#new">New</Button>
      </>,
    );
    const keys = el.querySelectorAll('.key');
    expect(keys[0].className).toContain('key-primary');
    expect(keys[0].getAttribute('type')).toBe('button');
    expect(keys[1].className).toContain('key-secondary');
    expect(keys[2].className).toContain('key-quiet');
    expect(keys[2].className).toContain('key-s');
    expect(keys[3].tagName).toBe('A');
    expect(keys[3].getAttribute('href')).toBe('#new');
  });

  it('names an icon key for a screen reader', () => {
    const b = mount(<IconButton icon="more" label="More for migrator-1" />).querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe('More for migrator-1');
    expect(b.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Recess', () => {
  it('marks an invalid input and shows the reason as an alert', () => {
    const el = mount(
      <Field label="Handle" error="A handle has at most 32 characters.">
        <Input value="x" invalid />
      </Field>,
    );
    expect(el.querySelector('input.recess')!.getAttribute('aria-invalid')).toBe('true');
    expect(el.querySelector('[role="alert"]')!.textContent).toBe('A handle has at most 32 characters.');
  });

  it('shows a command in a recessed block', () => {
    expect(mount(<Command>git push</Command>).querySelector('pre.recess.command')!.textContent).toBe('git push');
  });
});

describe('GrooveBand and PaneHeader', () => {
  it('draws the band as decoration', () => {
    expect(mount(<GrooveBand />).querySelector('.groove')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('puts the count on the heading line, and a back link to the column before', () => {
    const el = mount(<PaneHeader title="Bridges" count={3} countLabel="3 open bridges" back={{ href: '#', label: 'Bridges', to: 'list' }} actions={<Button size="s">New</Button>} />);
    const head = el.querySelector('header.pane-head')!;
    expect(head.querySelector('h2')!.textContent).toBe('Bridges');
    expect(head.querySelector('.chip .sr')!.textContent).toBe('3 open bridges');
    expect(head.querySelector('a.back.to-list')!.getAttribute('aria-label')).toBe('Back to Bridges');
    expect(el.querySelector('header + .groove')).not.toBeNull();
  });
});

describe('Card', () => {
  it('has the groove band, a title with a breathing light, and actions', () => {
    const el = mount(
      <Card title="Needs your decision" tone="amber" settle actions={<Button kind="primary">Run command</Button>}>
        <p>migrator-2 wants to run a command.</p>
      </Card>,
    );
    const card = el.querySelector('section.card')!;
    expect(card.classList.contains('settle')).toBe(true);
    expect(card.querySelector('.groove-card')).not.toBeNull();
    expect(card.querySelector('.card-title .led.breathe')).not.toBeNull();
    expect(card.querySelector('.card-actions .key-primary')!.textContent).toBe('Run command');
  });

  it('stops breathing and drops its edge when nothing waits', () => {
    const card = mount(<Card title="Decided" tone="amber" quiet />).querySelector('.card')!;
    expect(card.classList.contains('quiet')).toBe(true);
    expect(card.querySelector('.breathe')).toBeNull();
  });
});

describe('Tabs', () => {
  it('marks the current link tab', () => {
    const el = mount(<Tabs label="Bridge" current="posts" items={[{ id: 'posts', label: 'Posts', href: '#b' }, { id: 'decisions', label: 'Decisions', href: '#b/decisions', count: 1, countTone: 'amber', countLabel: '1 decision waits' }]} />);
    const tabs = el.querySelectorAll('a.tab');
    expect(tabs[0].getAttribute('aria-current')).toBe('page');
    expect(tabs[1].getAttribute('aria-current')).toBeNull();
    expect(tabs[1].querySelector('.chip-amber .sr')!.textContent).toBe('1 decision waits');
  });

  it('moves between the tabs of a tablist with the arrows', () => {
    const picked: string[] = [];
    const el = mount(<Tabs label="Member" current="chat" onSelect={(id) => picked.push(id)} items={[{ id: 'chat', label: 'Chat' }, { id: 'run', label: 'Run' }, { id: 'files', label: 'Files' }]} />);
    const list = el.querySelector('[role="tablist"]')!;
    const first = el.querySelector('[role="tab"]')!;
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('tabindex')).toBe('0');
    act(() => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(picked).toEqual(['run', 'files']);
  });
});

describe('ReactionChip', () => {
  it('shows the count and names it for a screen reader', () => {
    const el = mount(<ReactionChip kind="heart" count={2} mine />);
    expect(el.querySelector('.rchip.mine')).not.toBeNull();
    expect(el.querySelector('svg.heart')).not.toBeNull();
    expect(el.querySelector('.sr')!.textContent).toBe('2 hearts, yours among them');
  });

  it('is a key that reports its state with onClick', () => {
    const fn = vi.fn();
    const b = mount(<ReactionChip kind="up" count={1} onClick={fn} />).querySelector('button')!;
    expect(b.getAttribute('aria-pressed')).toBe('false');
    act(() => b.click());
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('LogoWell', () => {
  it('shows the empty well until a logo arrives', () => {
    let el = mount(<LogoWell />);
    expect(el.querySelector('.well.has-logo')).toBeNull();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('a')!.getAttribute('aria-label')).toBe('bossmode, home');
    act(() => render(null, el));
    el = mount(<LogoWell src="blob:logo" name="Example Org" />);
    expect(el.querySelector('.well.has-logo img')!.getAttribute('src')).toBe('blob:logo');
    expect(el.querySelector('a')!.getAttribute('aria-label')).toBe('Example Org, home');
  });
});

describe('Help', () => {
  it('opens its definition on the key and closes it on Escape', () => {
    const el = mount(<Help label="What is a worker">A worker runs the work of one agent.</Help>);
    const key = el.querySelector('button')!;
    expect(el.querySelector('[role="note"]')).toBeNull();
    act(() => key.click());
    expect(el.querySelector('[role="note"]')!.textContent).toBe('A worker runs the work of one agent.');
    expect(key.getAttribute('aria-expanded')).toBe('true');
    act(() => {
      key.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(el.querySelector('[role="note"]')).toBeNull();
  });
});
