import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { Composer, OFFLINE_WHY, addressWords, keyWords } from './Composer';
import { forgetReach, noteAnswer } from '../state/reach';
import { MAX_FILES, MAX_FILE_BYTES } from '../lib/attachments';
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
    const el = mount(<Composer draft="c1" label="Message the team" placeholder="Message the team" members={members} onSend={async () => true} />);
    expect(el.querySelector('.address')!.textContent).toBe('To everyone');
    type(el, 'Hello @reviewer and @migrator-1');
    expect(el.querySelector('.address')!.textContent).toBe('To reviewer and migrator-1');
  });

  it('names the key that sends, and names none on a touch screen', () => {
    expect(keyWords('MacIntel')).toBe('⌘+Enter');
    expect(keyWords('macOS')).toBe('⌘+Enter');
    expect(keyWords('Linux x86_64')).toBe('Ctrl+Enter');
    expect(keyWords('Windows')).toBe('Ctrl+Enter');
    const el = mount(<Composer draft="c3" label="Message the team" placeholder="Message the team" onSend={async () => true} />);
    expect(el.querySelector('.tools .keys')!.textContent).toMatch(/\+Enter$/);
    // A touch screen has no such key.
    const was = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    try {
      const touch = mount(<Composer draft="c4" label="Message the team" placeholder="Message the team" onSend={async () => true} />);
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
    const el = mount(<Composer draft="c3" label="Message the team" placeholder="Message the team" members={members} reply={{ seq: 7, who: 'reviewer', text: 'Will do.', handle: 'reviewer' }} onClearReply={clear} onSend={async () => true} />);
    const chip = el.querySelector('.replying.slidein .reply-to')!;
    expect(chip.textContent).toBe('Replying to reviewer');
    expect(el.querySelector('textarea')!.getAttribute('placeholder')).toBe('Message reviewer');
    expect(el.querySelector('.address')!.textContent).toBe('To reviewer');
    act(() => (chip.querySelector('button[aria-label="Stop replying"]') as HTMLButtonElement).click());
    expect(clear).toHaveBeenCalledOnce();
  });

  it('sends the reply to the addressees that the text names', async () => {
    const send = vi.fn(async () => true);
    const el = mount(<Composer draft="c4" label="Message the team" placeholder="Message the team" members={members} reply={{ seq: 7, who: 'Alice', text: 'Check it.' }} onSend={send} />);
    expect(el.querySelector('.address')!.textContent).toBe('To everyone');
    type(el, '@migrator-1 take it');
    await act(async () => {
      (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(send).toHaveBeenCalledWith('@migrator-1 take it', ['migrator-1'], []);
  });

  it('says why a closed bridge takes no message', () => {
    const el = mount(<Composer draft="c5" label="Message the team" placeholder="Message the team" members={members} disabled="Closed. Reopen it to send." onSend={async () => true} />);
    const box = el.querySelector('textarea')!;
    expect(box.disabled).toBe(true);
    expect(box.getAttribute('placeholder')).toBe('Closed. Reopen it to send.');
  });
});

describe('a composer while the page reaches no server', () => {
  it('turns off Send and Attach files with the reason, and keeps taking words for the draft', async () => {
    const send = vi.fn(async () => true);
    const el = mount(<Composer draft="c-off" label="Message the team" placeholder="Message the team" members={members} attach onSend={send} />);
    type(el, 'Keep 14.');
    act(() => noteAnswer(0));
    const key = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Send') as HTMLButtonElement;
    expect(key.disabled).toBe(true);
    expect((el.querySelector('button[aria-label="Attach files"]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('.address')!.textContent).toBe(OFFLINE_WHY);
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
    // Ctrl+Enter sends nothing either.
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    });
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(send).not.toHaveBeenCalled();
    act(() => noteAnswer(200));
    expect(key.disabled).toBe(false);
    expect(el.querySelector('.address')!.textContent).toBe('To everyone');
    act(() => forgetReach());
  });
});

describe('the files of a message', () => {
  const pick = (el: HTMLElement, files: File[]) => {
    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const submit = async (el: HTMLElement) => {
    await act(async () => {
      (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };
  const sendKey = (el: HTMLElement) => el.querySelector('.tools .send') as HTMLButtonElement;
  const chips = (el: HTMLElement) => [...el.querySelectorAll('.attached li')].map((li) => li.textContent);

  it('has the key Attach files only where the composer takes files', () => {
    const plain = mount(<Composer draft="f0" label="Message" placeholder="Write" onSend={async () => true} />);
    expect(plain.querySelector('button[aria-label="Attach files"]')).toBeNull();
    expect(plain.querySelector('input[type=file]')).toBeNull();
    const el = mount(<Composer draft="f1" label="Message" placeholder="Write" attach onSend={async () => true} />);
    expect(el.querySelector('button[aria-label="Attach files"]')).not.toBeNull();
  });

  it('sends files alone with their exact bytes, and clears the draft', async () => {
    const send = vi.fn(async () => true);
    const el = mount(<Composer draft="f2" label="Message" placeholder="Write" attach onSend={send} />);
    expect(sendKey(el).disabled).toBe(true);
    pick(el, [new File([new Uint8Array([0, 255, 128, 10])], 'bytes.bin')]);
    expect(chips(el)).toEqual(['bytes.bin4 B']);
    expect(el.querySelector('.attached button')!.getAttribute('aria-label')).toBe('Remove bytes.bin');
    expect(sendKey(el).disabled).toBe(false);
    await submit(el);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('', [], [{ name: 'bytes.bin', data: 'AP+ACg==' }]));
    await vi.waitFor(() => expect(el.querySelector('.attached')).toBeNull());
  });

  it('keeps the text, the addressees, and the files when the send fails, and sends them again', async () => {
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const el = mount(<Composer draft="f3" label="Message" placeholder="Write" members={members} attach reply={{ seq: 3, who: 'reviewer', text: 'Which one?', handle: 'reviewer' }} onSend={send} />);
    type(el, 'This one');
    pick(el, [new File(['hello'], 'note.txt')]);
    await submit(el);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(sendKey(el).disabled).toBe(false));
    expect(el.querySelector('textarea')!.value).toBe('This one');
    expect(chips(el)).toEqual(['note.txt5 B']);
    await submit(el);
    await vi.waitFor(() => expect(send).toHaveBeenLastCalledWith('This one', ['reviewer'], [{ name: 'note.txt', data: 'aGVsbG8=' }]));
    await vi.waitFor(() => expect(el.querySelector('.attached')).toBeNull());
    expect(el.querySelector('textarea')!.value).toBe('');
  });

  it('refuses a pick past a limit with what to do, and removes a file on its key', () => {
    const el = mount(<Composer draft="f4" label="Message" placeholder="Write" attach onSend={async () => true} />);
    pick(el, [new File(['a'], 'keep.txt')]);
    pick(el, [new File([], 'empty.txt')]);
    expect(el.querySelector('.attach-problem')!.textContent).toBe('empty.txt is empty. Pick another file.');
    const large = new File(['a'], 'large.bin');
    Object.defineProperty(large, 'size', { value: MAX_FILE_BYTES });
    pick(el, [large]);
    expect(el.querySelector('.attach-problem')!.textContent).toBe('The files of a message hold at most 32 MB together. Pick smaller files.');
    pick(el, Array.from({ length: MAX_FILES }, (_, i) => new File(['a'], i + '.txt')));
    expect(el.querySelector('.attach-problem')!.textContent).toBe('A message holds at most 20 files. Pick fewer.');
    expect(chips(el)).toEqual(['keep.txt1 B']);
    act(() => (el.querySelector('button[aria-label="Remove keep.txt"]') as HTMLButtonElement).click());
    expect(el.querySelector('.attached')).toBeNull();
    expect(el.querySelector('.attach-problem')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('textarea'));
    expect(sendKey(el).disabled).toBe(true);
  });

  it('takes files from a drop and from a paste', async () => {
    const send = vi.fn(async () => true);
    const el = mount(<Composer draft="f5" label="Message" placeholder="Write" attach onSend={send} />);
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['Files'], files: [] } });
    act(() => {
      el.querySelector('form')!.dispatchEvent(over);
    });
    expect(over.defaultPrevented).toBe(true);
    expect(el.querySelector('.box.drop')).not.toBeNull();
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { types: ['Files'], files: [new File(['drop'], 'drop.txt')] } });
    act(() => {
      el.querySelector('form')!.dispatchEvent(drop);
    });
    expect(drop.defaultPrevented).toBe(true);
    expect(el.querySelector('.box.drop')).toBeNull();
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [new File(['paste'], 'paste.png')] } });
    act(() => {
      el.querySelector('textarea')!.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(true);
    await submit(el);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith('', [], [{ name: 'drop.txt', data: 'ZHJvcA==' }, { name: 'paste.png', data: 'cGFzdGU=' }]));
  });

  it('keeps the files of each draft apart, and keeps them across a move to another screen', () => {
    const el = mount(<Composer draft="f6" label="Message" placeholder="Write" attach onSend={async () => true} />);
    pick(el, [new File(['a'], 'first.txt')]);
    unmountAll();
    const other = mount(<Composer draft="f7" label="Message" placeholder="Write" attach onSend={async () => true} />);
    expect(other.querySelector('.attached')).toBeNull();
    pick(other, [new File(['b'], 'second.txt')]);
    unmountAll();
    const back = mount(<Composer draft="f6" label="Message" placeholder="Write" attach onSend={async () => true} />);
    expect(chips(back)).toEqual(['first.txt1 B']);
  });

  it('says which file the page cannot read, keeps it, and sends nothing', async () => {
    const spy = vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new Event('error'));
    });
    try {
      const send = vi.fn(async () => true);
      const el = mount(<Composer draft="f8" label="Message" placeholder="Write" attach onSend={send} />);
      pick(el, [new File(['a'], 'unreadable.txt')]);
      await submit(el);
      await vi.waitFor(() => expect(el.querySelector('.attach-problem')!.textContent).toBe('The page cannot read unreadable.txt. Pick it again.'));
      expect(send).not.toHaveBeenCalled();
      expect(sendKey(el).disabled).toBe(false);
      expect(chips(el)).toEqual(['unreadable.txt1 B']);
    } finally {
      spy.mockRestore();
    }
  });
});
