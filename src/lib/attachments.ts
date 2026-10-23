// The files that a person attaches to a message: the limits that the front
// and the kernel share, the words of a selection that does not fit and of
// a post that the backend refused, and the bytes as base64 in the shape of
// the native run API. The page keeps no bytes after a send. The channel
// and the transcript name the files, and the workspace of each run that
// got the message holds them.

import { ApiError } from '../api/client';
import type { AttachedFile, Attachment } from '../api/types';
import { list } from './words';

/** The most files of one message (fw.MaxAttachments). */
export const MAX_FILES = 20;
/** The most bytes of the files of one message together (fw.MaxAttachmentBytes). */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

/**
 * filesProblem says why a selection of files cannot go out, and what to
 * do, or returns '' when it can. The composer checks a selection before it
 * takes the new files, so the words ask for another pick.
 */
export function filesProblem(files: readonly File[]): string {
  if (files.length > MAX_FILES) return `A message holds at most ${MAX_FILES} files. Pick fewer.`;
  const empty = files.find((f) => f.size === 0);
  if (empty) return `${empty.name} is empty. Pick another file.`;
  if (files.reduce((n, f) => n + f.size, 0) > MAX_FILE_BYTES) return 'The files of a message hold at most 32 MB together. Pick smaller files.';
  return '';
}

/** encodeFiles reads each file as base64, without the prefix of a data URL. */
export async function encodeFiles(files: readonly File[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const file of files) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reader.onabort = () => reject(new Error(`The page cannot read ${file.name}. Pick it again.`));
      reader.onload = () => {
        const url = reader.result;
        if (typeof url !== 'string' || url.indexOf(',') < 0) reject(new Error(`The page cannot read ${file.name}. Pick it again.`));
        else resolve(url.slice(url.indexOf(',') + 1));
      };
      reader.readAsDataURL(file);
    });
    out.push({ name: file.name, data });
  }
  return out;
}

/**
 * refusalOf words a failed send of a message with files. A body that a
 * proxy or the front finds too large gets the words of the page, because a
 * proxy sends no sentence. A refusal of the front that names a file, such
 * as a file over the limit of a member, keeps its sentence, and so does any
 * other failure, which says what to do, such as for a member without a run.
 */
export function refusalOf(e: unknown, files: number): unknown {
  if (files > 0 && e instanceof ApiError && e.status === 413 && !/^the file /i.test(e.message)) return new Error('The files are too large to send. Remove some, and send again.');
  return e;
}

/** NO_FILES_WITH_COMMAND says that a slash command goes without the files of the composer. */
export const NO_FILES_WITH_COMMAND = 'A command takes no files. Send the files in a message of their own.';

/** describeFiles names the files of a send with their sizes, as an entry names them. */
export function describeFiles(files: readonly Attachment[]): AttachedFile[] {
  return files.map((f) => ({ name: f.name, size: Math.floor(f.data.length / 4) * 3 - (f.data.endsWith('==') ? 2 : f.data.endsWith('=') ? 1 : 0) }));
}

/** filesWords names the files of a message, such as team.csv and plan.pdf. */
export function filesWords(files: readonly AttachedFile[] | undefined): string {
  return list((files || []).map((f) => f.name));
}
