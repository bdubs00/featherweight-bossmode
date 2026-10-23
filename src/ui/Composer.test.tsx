import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { Composer, addressWords, keyWords } from './Composer';
import { mount, unmountAll } from './testkit-a';

afterEach(() => {
  unmountAll();
  sessionStorage.clear();
});

const members = [
  { handle: 'reviewer', agent: 'reviewer', task: 'Review' },
  { handle: 'migrator-1', agent: 'migrator', task: 'Migrate' },
];

function type(el: HTMLElement, text: string) {
  const box = el.querySelector('textarea') as HTMLTextAreaElement;
  act(() => {
    box.value = text;
    box.selectionStart = box.selectionEnd = text.length;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('the address line', () => {
  it('says To everyone, or the addressees in words', () => {
    expect(addressWords([])).toBe('To everyone');
    expect(addressWords(['reviewer'])).toBe('To reviewer');
    expect(addressWords(['a', 'b'])).toBe('To a and b');
    const el = mount(<Composer draft="c1" label="Message the bridge" placeholder="Message the bridge" members={members} onSend={async () => true} />);
    expect(el.querySelector('.address')!.textContent).toBe('To everyone');
    type(el, 'Hello @reviewer and @migrator-1');
    expect(el.querySelector('.address')!.textContent).toBe('To reviewer and migrator-1');
  });

  it('names the key that sends, and names none on a touch screen', () => {
    expect(keyWords('MacIntel')).toBe('⌘+Enter');
    expect(keyWords('macOS')).toBe('⌘+Enter');
    expect(keyWords('Linux x86_64')).toBe('Ctrl+Enter');
    expect(keyWords('Windows')).toBe('Ctrl+Enter');
    const el = mount(<Composer draft="c3" label="Message the bridge" placeholder="Message the bridge" onSend={async () => true} />);
    expect(el.querySelector('.tools .keys')!.textContent).toMatch(/\+Enter$/);
    // A touch screen has no such key.
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const touch = mount(<Composer draft="c4" label="Message the bridge" placeholder="Message the bridge" onSend={async () => true} />);
      expect(touch.querySelector('.tools .keys')).toBeNull();
      expect(touch.querySelector('.tools .send')).not.toBeNull();
    } finally {
      window.matchMedia = was;
    }
  });

  it('shows no address line where no member takes the message', () => {
    const el = mount(<Composer draft="c2" label="Message to the manager" placeholder="Ask the manager" onSend={async () => true} />);
    expect(el.querySelector('.address')!.textContent).toBe('');
  });
});

describe('the reply chip', () => {
  it('says Replying to, addresses the agent, and stops on its key', () => {
    const clear = vi.fn();
    const el = mount(<Composer draft="c3" label="Message the bridge" placeholder="Message the bridge" members={members} reply={{ seq: 7, who: 'reviewer', text: 'Will do.', handle: 'reviewer' }} onClearReply={clear} onSend={async () => true} />);
    const chip = el.querySelector('.replying.slidein .reply-to')!;
    expect(chip.textContent).toBe('Replying to reviewer');
    expect(el.querySelector('textarea')!.getAttribute('placeholder')).toBe('Message reviewer');
    expect(el.querySelector('.address')!.textContent).toBe('To reviewer');
    act(() => (chip.querySelector('button[aria-label="Stop replying"]') as HTMLButtonElement).click());
    expect(clear).toHaveBeenCalledOnce();
  });

  it('sends the reply to the addressees that the text names', async () => {
    const send = vi.fn(async () => true);
    const el = mount(<Composer draft="c4" label="Message the bridge" placeholder="Message the bridge" members={members} reply={{ seq: 7, who: 'Alice', text: 'Check it.' }} onSend={send} />);
    expect(el.querySelector('.address')!.textContent).toBe('To everyone');
    type(el, '@migrator-1 take it');
    await act(async () => {
      (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(send).toHaveBeenCalledWith('@migrator-1 take it', ['migrator-1']);
  });

  it('says why a closed bridge takes no message', () => {
    const el = mount(<Composer draft="c5" label="Message the bridge" placeholder="Message the bridge" members={members} disabled="Closed. Reopen it to send." onSend={async () => true} />);
    const box = el.querySelector('textarea')!;
    expect(box.disabled).toBe(true);
    expect(box.getAttribute('placeholder')).toBe('Closed. Reopen it to send.');
  });
});
