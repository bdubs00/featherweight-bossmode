// The files of a sent message: each one by its name and its size. The
// workspace of each run that got the message holds the bytes, and the page
// has none, so a file opens nothing here.

import type { AttachedFile } from '../api/types';
import { sizeText } from '../lib/words';

export function AttachedFiles({ files }: { files?: AttachedFile[] }) {
  if (!files || !files.length) return null;
  return (
    <ul class="attached sent" aria-label="Attached files">
      {files.map((f) => (
        <li>
          <span class="attached-name" title={f.name}>
            {f.name}
          </span>
          <span class="attached-size">{sizeText(f.size)}</span>
        </li>
      ))}
    </ul>
  );
}
