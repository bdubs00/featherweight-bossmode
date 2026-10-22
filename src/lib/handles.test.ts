import { describe, expect, it } from 'vitest';
import { baseOf, handleReason, nextHandle } from './handles';

describe('handleReason', () => {
  it('accepts a good handle', () => {
    expect(handleReason('migrator-3')).toBe('');
    expect(handleReason('9lives')).toBe('');
  });

  it('refuses a reserved, a taken, a long, or a malformed handle', () => {
    expect(handleReason('operator')).toMatch(/reserved/);
    expect(handleReason('manager')).toMatch(/reserved/);
    expect(handleReason('reviewer', ['reviewer'])).toMatch(/has a seat/);
    expect(handleReason('a'.repeat(33))).toMatch(/at most 32/);
    expect(handleReason('-dash')).toMatch(/starts with a letter or a digit/);
    expect(handleReason('Upper')).toMatch(/lower-case/);
    expect(handleReason('')).toMatch(/needs a handle/);
  });
});

describe('nextHandle', () => {
  it('gives the bare name to the first seat of an agent', () => {
    expect(nextHandle('reviewer', ['migrator-1'])).toBe('reviewer');
  });

  it('numbers the next seat after the highest one', () => {
    expect(nextHandle('migrator', ['migrator-1', 'migrator-2', 'reviewer'])).toBe('migrator-3');
    expect(nextHandle('reviewer', ['reviewer'])).toBe('reviewer-2');
    expect(nextHandle('reviewer', ['reviewer', 'reviewer-2'])).toBe('reviewer-3');
  });

  it('never gives a reserved handle', () => {
    expect(nextHandle('manager', [])).toBe('manager-1');
    expect(nextHandle('manager', ['manager-1'])).toBe('manager-2');
    expect(handleReason(nextHandle('operator', []))).toBe('');
  });

  it('cleans the name of an agent into a handle', () => {
    expect(baseOf('Release Notes!')).toBe('release-notes');
    expect(baseOf('--x')).toBe('x');
    expect(baseOf('')).toBe('seat');
    expect(handleReason(nextHandle('A'.repeat(60), []))).toBe('');
  });
});
