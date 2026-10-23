// The native API takes file bytes as base64 in the message body.
import type { Attachment } from '../api/types';

export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

export function checkFiles(files: readonly File[]): void {
  if (files.length > MAX_FILES) throw new Error('A message holds at most 20 files.');
  if (files.some((f) => f.size === 0)) throw new Error('Empty files cannot be sent.');
  if (files.reduce((n, f) => n + f.size, 0) > MAX_FILE_BYTES) throw new Error('The files of a message must total 32 MiB or less.');
}

export function fileSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KiB';
  return (n / (1024 * 1024)).toFixed(1) + ' MiB';
}

export async function encodeFiles(files: readonly File[]): Promise<Attachment[]> {
  checkFiles(files);
  const out: Attachment[] = [];
  for (const file of files) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reader.onabort = () => reject(new Error('Cannot read ' + file.name + '. Select it again.'));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string' || !result.includes(',')) reject(new Error('Cannot read ' + file.name + '.'));
        else resolve(result.slice(result.indexOf(',') + 1));
      };
      reader.readAsDataURL(file);
    });
    out.push({ name: file.name, data });
  }
  return out;
}
