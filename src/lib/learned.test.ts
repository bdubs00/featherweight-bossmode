import { describe, expect, it } from 'vitest';
import { headWords, isLearnedPath, learnedPageText } from './learned';

// The page of the hearts of an agent with an entry of each form: the
// server writes channel now, and an older page keeps bridge.
const PAGE = [
  '# What people liked from writer',
  '',
  'The server adds an entry for each heart that a person puts on a result of writer in a bridge. The newest entry comes first.',
  '',
  '## 2026-10-28, channel "Release notes for 2.4" (01K8CHANNEL), writer, run 01K8RUN1',
  '',
  '- What alice asked: Draft the notes of the bridge feature.',
  '- What writer did:',
  '',
  '  ## A heading of the answer, bridge and all',
  '',
  '- [Open the run](#run/01K8RUN1)',
  '',
  '## 2026-10-21, bridge "Migrate \\"cron\\"" (b1), writer-2, run 01K8RUN2',
  '',
  '- What bob asked: Keep the names.',
  '',
].join('\n');

describe('the page of the hearts of an agent', () => {
  it('is agents/<agent>/learned.md', () => {
    expect(isLearnedPath('agents/writer/learned.md')).toBe(true);
    expect(isLearnedPath('agents/writer/knowhow/learned.md')).toBe(false);
    expect(isLearnedPath('notes/learned.md')).toBe(false);
  });

  it('words the heading of each form with the channel by its title, the handle, and no id', () => {
    expect(headWords('## 2026-10-28, channel "Release notes for 2.4" (01K8CHANNEL), writer, run 01K8RUN1')).toBe('## 2026-10-28, writer in the channel “Release notes for 2.4”');
    expect(headWords('## 2026-10-21, bridge "Migrate Puppet" (b1), migrator-2, run 01RUN2')).toBe('## 2026-10-21, migrator-2 in the channel “Migrate Puppet”');
    expect(headWords('## 2026-10-21, bridge "Migrate Puppet" (b1), migrator-2')).toBe('## 2026-10-21, migrator-2 in the channel “Migrate Puppet”');
    // An older heading without quotes keeps its parts and says channel.
    expect(headWords('## 2026-10-21, bridge b, migrator-2')).toBe('## 2026-10-21, channel b, migrator-2');
  });

  it('says channel in the words of the server before the first entry and in each heading, and keeps what people and agents wrote', () => {
    const out = learnedPageText(PAGE);
    expect(out).toContain('on a result of writer in a channel.');
    expect(out).toContain('## 2026-10-28, writer in the channel “Release notes for 2.4”\n');
    expect(out).toContain('## 2026-10-21, writer-2 in the channel “Migrate "cron"”\n');
    expect(out).not.toMatch(/01K8CHANNEL|run 01K8RUN/);
    // The text of an entry stays as it is, also an indented heading of an answer.
    expect(out).toContain('- What alice asked: Draft the notes of the bridge feature.');
    expect(out).toContain('  ## A heading of the answer, bridge and all');
    expect(out).toContain('- [Open the run](#run/01K8RUN1)');
  });
});
