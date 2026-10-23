import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Composer, type ComposerProps } from './Composer';
import { MAX_FILE_BYTES } from '../lib/attachments';

let host: HTMLDivElement;
let props: ComposerProps;
let n = 0;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  props = { draft: 'test-' + ++n, label: 'Message', placeholder: 'Write', onSend: vi.fn(async () => true) };
  act(() => render(<Composer {...props} />, host));
});
afterEach(() => { act(() => render(null, host)); host.remove(); vi.restoreAllMocks(); });

function select(files: File[]) {
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
function write(text: string) {
  const box = host.querySelector('textarea')!;
  box.value = text;
  act(() => { box.dispatchEvent(new Event('input', { bubbles: true })); });
}
function submit() { act(() => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }

it('sends file-only messages with exact binary bytes, then clears the selection', async () => {
  select([new File([new Uint8Array([0, 255, 128, 10])], 'bytes.bin')]);
  expect(host.textContent).toContain('bytes.bin');
  expect(host.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(false);
  submit();
  await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledWith('', [], [{ name: 'bytes.bin', data: 'AP+ACg==' }]));
  await vi.waitFor(() => expect(host.querySelector('.attachments')).toBeNull());
});

it('keeps text, recipients, and files on failure and sends them on retry', async () => {
  const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  props = { ...props, onSend, reply: { seq: 3, who: 'Reviewer', text: 'Question', handle: 'reviewer' }, members: [{ handle: 'reviewer', agent: 'reviewer', task: 'Review' }] };
  act(() => render(<Composer {...props} />, host));
  write('Look at this');
  select([new File(['hello'], 'note.txt')]);
  submit();
  await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(false));
  expect(host.querySelector('textarea')!.value).toBe('Look at this');
  expect(host.textContent).toContain('note.txt');
  submit();
  await vi.waitFor(() => expect(onSend).toHaveBeenLastCalledWith('Look at this', ['reviewer'], [{ name: 'note.txt', data: 'aGVsbG8=' }]));
  await vi.waitFor(() => expect(host.querySelector('.attachments')).toBeNull());
});

it('removes selected files and rejects empty, oversized, and excess uploads', () => {
  select([new File(['a'], 'keep.txt')]);
  select([new File([], 'empty.txt')]);
  expect(host.querySelector('[role=alert]')!.textContent).toContain('Empty');
  const large = new File(['a'], 'large.bin');
  Object.defineProperty(large, 'size', { value: MAX_FILE_BYTES });
  select([large]);
  expect(host.querySelector('[role=alert]')!.textContent).toContain('32 MiB');
  select(Array.from({ length: 20 }, (_, i) => new File(['a'], i + '.txt')));
  expect(host.querySelector('[role=alert]')!.textContent).toContain('20 files');
  expect(host.querySelectorAll('.attachments li')).toHaveLength(1);
  act(() => host.querySelector<HTMLButtonElement>('[aria-label="Remove keep.txt"]')!.click());
  expect(host.querySelector('.attachments')).toBeNull();
  expect(host.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(true);
});

it('accepts files from drop and paste', async () => {
  for (const type of ['drop', 'paste']) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, type === 'drop' ? 'dataTransfer' : 'clipboardData', { value: { files: [new File([type], type + '.txt')] } });
    act(() => { host.querySelector('textarea')!.dispatchEvent(e); });
    expect(e.defaultPrevented).toBe(true);
  }
  submit();
  await vi.waitFor(() => expect(props.onSend).toHaveBeenCalledWith('', [], [{ name: 'drop.txt', data: 'ZHJvcA==' }, { name: 'paste.txt', data: 'cGFzdGU=' }]));
});

it('keeps file drafts separate when changing conversations', () => {
  select([new File(['a'], 'first.txt')]);
  act(() => render(<Composer {...props} draft={props.draft + '-other'} />, host));
  expect(host.querySelector('.attachments')).toBeNull();
  select([new File(['b'], 'second.txt')]);
  act(() => render(<Composer {...props} />, host));
  expect(host.textContent).toContain('first.txt');
  expect(host.textContent).not.toContain('second.txt');
});

it('unlocks the composer after a read failure and keeps its file', async () => {
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (this: FileReader) { this.dispatchEvent(new Event('error')); });
  select([new File(['a'], 'unreadable.txt')]);
  submit();
  await vi.waitFor(() => expect(host.querySelector('[role=alert]')?.textContent).toContain('Cannot read unreadable.txt'));
  expect(props.onSend).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLButtonElement>('[type=submit]')!.disabled).toBe(false);
  expect(host.textContent).toContain('unreadable.txt');
});

it('blocks duplicate sends and edits while a message is in flight', async () => {
  let finish!: (ok: boolean) => void;
  const onSend = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  act(() => render(<Composer {...props} onSend={onSend} />, host));
  select([new File(['a'], 'one.txt')]);
  submit(); submit();
  await vi.waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  expect(host.querySelector('textarea')!.disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('input[type=file]')!.disabled).toBe(true);
  await act(async () => finish(true));
});
