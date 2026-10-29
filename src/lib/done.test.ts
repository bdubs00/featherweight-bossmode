import { describe, expect, it } from 'vitest';
import { checkName, readsOnly, weakCheck } from './done';

describe('a weak check of done (plan 4.4)', () => {
  it('is a check that only reads a file and names no contains and no lacks', () => {
    expect(weakCheck({ tool: 'files', input: '{"command":"view","path":"report.txt"}' })).toBe(true);
    expect(weakCheck({ tool: 'text_editor_20250728', input: '{"command":"view","path":"report.txt"}' })).toBe(true);
    expect(weakCheck({ tool: 'fs.read_file', input: '{"path":"report.txt"}' })).toBe(true);
    expect(weakCheck({ tool: 'read', input: '{"path":"report.txt"}', contains: [], lacks: [''] })).toBe(true);
  });

  it('is no weak check when it looks for something in the file, or when its tool does more than read', () => {
    expect(weakCheck({ tool: 'files', input: '{"command":"view","path":"report.txt"}', contains: ['READY'] })).toBe(false);
    expect(weakCheck({ tool: 'files', input: '{"command":"view","path":"report.txt"}', lacks: ['TODO'] })).toBe(false);
    expect(weakCheck({ tool: 'bash', input: '{"command":"go test ./..."}' })).toBe(false);
    expect(weakCheck({ tool: 'files', input: '{"command":"create","path":"x"}' })).toBe(false);
    expect(weakCheck({ tool: 'files', input: 'not json' })).toBe(false);
    expect(weakCheck({ tool: 'thread' })).toBe(false);
    expect(readsOnly({ tool: 'memory', input: '{"command":"view","path":"/memories"}' })).toBe(true);
  });

  it('names a check by its name, else by its tool', () => {
    expect(checkName({ name: ' the report is ready ', tool: 'files' })).toBe('the report is ready');
    expect(checkName({ tool: 'files' })).toBe('files');
  });
});
