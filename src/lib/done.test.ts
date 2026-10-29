import { describe, expect, it } from 'vitest';
import { answerCheck, answerError, answerWords, atLimitWords, checkName, limitWords, passWords, readsOnly, resultWords, splitWords, weakCheck, weakWords, WEAK_ANSWER_WORDS, WEAK_WORDS } from './done';

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

describe('a check of the answer (fw.DoneAnswer)', () => {
  it('is strong with contains or lacks, also for a run that changed nothing, and weak with neither', () => {
    expect(weakCheck({ tool: 'answer', contains: ['READY'] })).toBe(false);
    expect(weakCheck({ tool: 'answer', lacks: ['I could not'] })).toBe(false);
    expect(weakCheck({ tool: ' answer ', contains: ['READY'], lacks: ['TODO'] })).toBe(false);
    expect(weakCheck({ tool: 'answer' })).toBe(true);
    expect(weakCheck({ tool: 'answer', contains: [''], lacks: [] })).toBe(true);
    // A check of the answer makes no call, so it never reads a file.
    expect(readsOnly({ tool: 'answer' })).toBe(false);
  });

  it('is named The answer, says what the answer must hold, and warns in its own words', () => {
    expect(checkName({ tool: 'answer' })).toBe('The answer');
    expect(checkName({ name: 'the review names a verdict', tool: 'answer' })).toBe('the review names a verdict');
    expect(answerWords({ tool: 'answer', contains: ['READY'] })).toBe('Must hold “READY”.');
    expect(answerWords({ tool: 'answer', contains: ['READY', 'v2'], lacks: ['TODO'] })).toBe('Must hold “READY” and “v2”, and must not hold “TODO”.');
    expect(answerWords({ tool: 'answer', lacks: ['TODO'] })).toBe('Must not hold “TODO”.');
    expect(answerWords({ tool: 'answer' })).toBe('');
    expect(answerWords({ tool: 'files', contains: ['READY'] })).toBe('');
    expect(weakWords({ tool: 'answer' })).toBe(WEAK_ANSWER_WORDS);
    expect(weakWords({ tool: 'files', input: '{"command":"view","path":"x"}' })).toBe(WEAK_WORDS);
  });

  it('is built from what a person typed, one phrase per line or comma, within the bounds of the kernel', () => {
    expect(splitWords(' READY ,\n\nv2\n')).toEqual(['READY', 'v2']);
    expect(answerCheck([], [])).toBeNull();
    expect(answerCheck(['READY'], [])).toEqual({ name: 'The answer', tool: 'answer', contains: ['READY'] });
    expect(answerCheck([], ['TODO'])).toEqual({ name: 'The answer', tool: 'answer', lacks: ['TODO'] });
    expect(answerError(['a'], ['b'])).toBe('');
    expect(answerError(Array.from({ length: 17 }, (_, i) => 'w' + i), [])).toMatch(/at most 16/);
    expect(answerError(['x'.repeat(4097)], [])).toMatch(/4096 bytes/);
  });
});

describe('a pass of the checks', () => {
  it('names each limit of the budget as the workbench does', () => {
    expect(limitWords('maxTurns')).toBe('its limit of steps');
    expect(limitWords('maxToolCalls')).toBe('its limit of tool calls');
    expect(limitWords('maxCallsPerTurn')).toBe('its limit of tool calls in one step');
    expect(limitWords('maxTokens')).toBe('its limit of tokens');
    expect(limitWords('maxCostUSD')).toBe('its limit of cost');
    expect(limitWords('somethingNew')).toBe('a limit of its budget');
    expect(atLimitWords('maxToolCalls')).toBe('Checked after its limit of tool calls');
  });

  it('says the state of a pass, and each check of it', () => {
    expect(passWords({ state: 'checked' })).toBe('Its checks passed');
    expect(passWords({ state: 'checked', weak: true })).toBe('Its checks passed, but they show nothing about this run');
    expect(passWords({ state: 'fixing', checks: [{ tool: 'bash', passed: false }] })).toBe('A check failed, and it fixes its work');
    expect(passWords({ state: 'failed', checks: [{ tool: 'bash', passed: false }, { tool: 'answer', passed: true }] })).toBe('Not done: 1 of 2 checks failed');
    expect(resultWords({ tool: 'bash', passed: true })).toBe('passed');
    expect(resultWords({ tool: 'bash', passed: false, why: 'exit code 1' })).toBe('failed: exit code 1');
    expect(resultWords({ tool: 'memory', passed: true, skipped: 'this is a comparison run' })).toBe('skipped: this is a comparison run');
  });
});
