import type { AttachedFile } from '../api/types';
import { fileSize } from '../lib/attachments';
import { Icon } from './icons';

export function AttachedFiles({ files }: { files?: AttachedFile[] }) {
  if (!files?.length) return null;
  return <ul class="attachments" aria-label="Attached files">
    {files.map((file, i) => <li key={i}><Icon name="file" /><span class="filename">{file.name}</span><small>{fileSize(file.size)}</small></li>)}
  </ul>;
}
