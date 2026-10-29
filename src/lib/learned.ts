// The page agents/<agent>/learned.md, which the server writes: one entry
// per heart that a person put on a result of the agent, newest first. The
// server words the heading of an entry with the channel, its id, the
// handle, and the run, as in
//
//   ## 2026-10-28, channel "Release notes" (01K...), writer, run 01K...
//
// An older server wrote bridge in place of channel, and its pages keep
// that word. The wiki shows the page in the words of the page: the date,
// the handle, and the channel by its title, with no id, and the words
// that the server wrote before the first entry say channel. The text of
// an entry, what people and agents wrote, stays as it is.

/** isLearnedPath reports whether a page path is the page of the hearts of an agent. */
export const isLearnedPath = (path: string): boolean => /^agents\/[^/]+\/learned\.md$/.test(path || '');

/** HEAD matches the heading of an entry in either form: the date, the word, the quoted title, the id, the handle, and the run. */
const HEAD = /^## (\d{4}-\d{2}-\d{2}), (?:bridge|channel) "(.*)" \(([^()\s]+)\), ([^,\s]+)(?:, run \S+)?\s*$/;

/** headWords gives the heading of an entry in the words of the page, such as 2026-10-28, writer in the channel “Release notes”. */
export function headWords(line: string): string {
  const m = HEAD.exec(line);
  // The server quotes the title as Go does, so a quote or a backslash in it has a backslash before it.
  if (m) return `## ${m[1]}, ${m[4]} in the channel “${m[2].replace(/\\(["\\])/g, '$1')}”`;
  // An older heading without the quotes, such as 2026-10-21, bridge b, migrator-2, keeps its parts and says channel.
  return line.replace(/\bbridge\b/g, 'channel');
}

/** introWords gives the words that the server wrote before the first entry with channel and server in place of bridge and front. */
const introWords = (s: string): string =>
  s
    .replace(/\bbridges\b/g, 'channels')
    .replace(/\bbridge\b/g, 'channel')
    .replace(/\bThe front\b/g, 'The server')
    .replace(/\bthe front\b/g, 'the server');

/** learnedPageText gives the text of the page of the hearts of an agent in the words of the page. */
export function learnedPageText(text: string): string {
  const lines = String(text || '').split('\n');
  const first = lines.findIndex((l) => l.startsWith('## '));
  return lines
    .map((l, i) => {
      if (first < 0 || i < first) return introWords(l);
      // A heading of an entry starts a line at the left; an indented line belongs to an answer.
      return l.startsWith('## ') ? headWords(l) : l;
    })
    .join('\n');
}
