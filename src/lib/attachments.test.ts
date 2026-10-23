import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { describeFiles, filesProblem, filesWords, refusalOf, MAX_FILE_BYTES, MAX_FILES } from './attachments';

describe('the files of a message', () => {
  it('takes a selection up to the limits of the front', () => {
    expect(filesProblem([])).toBe('');
    expect(filesProblem(Array.from({ length: MAX_FILES }, (_, i) => new File(['a'], i + '.txt')))).toBe('');
    const half = new File(['a'], 'half.bin');
    Object.defineProperty(half, 'size', { value: MAX_FILE_BYTES / 2 });
    expect(filesProblem([half, half])).toBe('');
    expect(filesProblem([half, half, new File(['a'], 'one.txt')])).toBe('The files of a message hold at most 32 MB together. Pick smaller files.');
  });

  it('names the sizes of the files of a send from their base64', () => {
    expect(describeFiles([{ name: 'a', data: 'AP+ACg==' }, { name: 'b', data: 'aGk=' }, { name: 'c', data: 'aGVsbG8h' }])).toEqual([
      { name: 'a', size: 4 },
      { name: 'b', size: 2 },
      { name: 'c', size: 6 },
    ]);
    expect(filesWords([{ name: 'team.csv', size: 1 }, { name: 'plan.pdf', size: 2 }])).toBe('team.csv and plan.pdf');
  });

  it('words a body that is too large, and keeps the sentence of the backend for any other refusal', () => {
    const big = new ApiError(413, null, 'Payload Too Large');
    expect((refusalOf(big, 1) as Error).message).toBe('The files are too large to send. Remove some, and send again.');
    expect(refusalOf(big, 0)).toBe(big);
    const conflict = new ApiError(409, { detail: 'files go only to a member with a run, and reviewer has none yet: send them once it works, or address another member' });
    expect(refusalOf(conflict, 1)).toBe(conflict);
    expect(conflict.message).toBe('Files go only to a member with a run, and reviewer has none yet: send them once it works, or address another member.');
  });
});
