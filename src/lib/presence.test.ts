import { describe, expect, it } from 'vitest';
import { PRESENCE, derivePresence, phaseOf, presenceOf, runStatus } from './presence';

describe('presence', () => {
  it('maps each presence of the plan to a light, a word, and an icon', () => {
    expect(presenceOf('working')).toMatchObject({ word: 'working', tone: 'ok', icon: 'play' });
    expect(presenceOf('needs-you')).toMatchObject({ word: 'needs you', tone: 'need', icon: 'hand' });
    expect(presenceOf('idle')).toMatchObject({ word: 'idle', tone: 'quiet', icon: 'ring' });
    expect(presenceOf('asleep')).toMatchObject({ word: 'asleep', tone: 'quiet', icon: 'moon' });
    expect(presenceOf('error')).toMatchObject({ word: 'error', tone: 'bad', icon: 'cross' });
    expect(presenceOf('fired')).toMatchObject({ word: 'fired', tone: 'quiet', icon: 'slash', struck: true });
  });

  it('never leans on color alone: two presences of one tone differ in word and icon', () => {
    const all = Object.values(PRESENCE);
    expect(new Set(all.map((l) => l.word)).size).toBe(all.length);
    expect(new Set(all.map((l) => l.icon)).size).toBe(all.length);
    for (const l of all) expect(l.label).toMatch(/\.$/);
  });

  it('shows an unknown word as it is, with no color of its own', () => {
    expect(presenceOf('on-break')).toMatchObject({ word: 'on break', tone: 'quiet', icon: 'dot' });
    expect(presenceOf(undefined).word).toBe('unknown');
    expect(presenceOf('constructor').word).toBe('constructor');
  });

  it('derives the presence with the table of section 6.5', () => {
    expect(derivePresence({ fired: true, run: { state: 'running' } })).toBe('fired');
    expect(derivePresence({ run: { state: 'queued' }, taskPhase: 'Running' })).toBe('working');
    expect(derivePresence({ run: { state: 'running' }, taskPhase: 'Running' })).toBe('working');
    expect(derivePresence({ run: { state: 'input-required' }, taskPhase: 'Running' })).toBe('needs-you');
    expect(derivePresence({ run: { state: 'input-required' }, taskPhase: 'Suspended' })).toBe('needs-you');
    expect(derivePresence({ run: { state: 'completed' }, taskPhase: 'Running' })).toBe('idle');
    expect(derivePresence({ run: { state: 'completed' }, taskPhase: 'Suspended' })).toBe('asleep');
    expect(derivePresence({ run: { state: 'failed' }, taskPhase: 'Running' })).toBe('error');
    expect(derivePresence({ run: { state: 'completed' }, taskPhase: 'Failed' })).toBe('error');
    expect(derivePresence({ run: { state: 'completed' }, blocked: true })).toBe('error');
  });

  it('words the phases of a Task and the status of a run', () => {
    expect(phaseOf('Suspended')).toMatchObject({ word: 'asleep', icon: 'moon' });
    expect(phaseOf('Failed').tone).toBe('bad');
    expect(phaseOf('Odd').word).toBe('odd');
    expect(runStatus({ state: 'completed', output: 'done' }).word).toBe('ready');
    expect(runStatus({ state: 'completed', output: '' }).word).toBe('ended');
    expect(runStatus({ state: 'input-required' }).word).toBe('needs you');
  });
});
