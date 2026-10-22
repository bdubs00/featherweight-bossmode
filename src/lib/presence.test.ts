import { describe, expect, it } from 'vitest';
import { PRESENCE, WAITING, derivePresence, phaseOf, presenceOf, runStatus, seatLight } from './presence';

describe('presence', () => {
  it('maps each presence of the plan to a light and a word', () => {
    expect(presenceOf('working')).toMatchObject({ word: 'working', tone: 'green' });
    expect(presenceOf('needs-you')).toMatchObject({ word: 'needs you', tone: 'amber' });
    expect(presenceOf('idle')).toMatchObject({ word: 'idle', tone: 'grey' });
    expect(presenceOf('asleep')).toMatchObject({ word: 'asleep', tone: 'grey' });
    expect(presenceOf('error')).toMatchObject({ word: 'error', tone: 'red' });
    expect(presenceOf('fired')).toMatchObject({ word: 'fired', tone: 'grey', struck: true });
  });

  it('never leans on color alone: each presence has a word of its own', () => {
    const all = Object.values(PRESENCE);
    expect(new Set(all.map((l) => l.word)).size).toBe(all.length);
    for (const l of all) expect(l.label).toMatch(/\.$/);
  });

  it('never says pool to an operator', () => {
    const all = [...Object.values(PRESENCE), WAITING, ...['Running', 'Suspended', 'Pending', 'Failed', 'Terminating', 'X'].map(phaseOf)];
    for (const l of all) expect(l.word + ' ' + l.label).not.toMatch(/pool/i);
  });

  it('shows an unknown word as it is, in grey', () => {
    expect(presenceOf('on-break')).toMatchObject({ word: 'on break', tone: 'grey' });
    expect(presenceOf(undefined).word).toBe('unknown');
    expect(presenceOf('constructor').word).toBe('constructor');
  });

  it('says waiting for a worker for a working seat whose run is queued', () => {
    expect(seatLight('working', 'queued')).toBe(WAITING);
    expect(seatLight('working', 'running').word).toBe('working');
    expect(seatLight('needs-you', 'queued').word).toBe('needs you');
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
    // A worker that starts does not run yet, so its seat counts as asleep, as the workbench says.
    expect(derivePresence({ run: { state: 'completed' }, taskPhase: 'Pending' })).toBe('asleep');
    expect(derivePresence({ run: { state: 'completed' }, taskPhase: 'Terminating' })).toBe('error');
  });

  it('words the phases of a worker and the status of a run', () => {
    expect(phaseOf('Running')).toMatchObject({ word: 'awake', tone: 'green' });
    expect(phaseOf('Suspended')).toMatchObject({ word: 'asleep', tone: 'grey' });
    expect(phaseOf('Failed').tone).toBe('red');
    expect(phaseOf('Odd').word).toBe('odd');
    expect(runStatus({ state: 'completed', output: 'done' }).word).toBe('ready');
    expect(runStatus({ state: 'completed', output: '' }).word).toBe('ended');
    expect(runStatus({ state: 'input-required' })).toMatchObject({ word: 'needs you', tone: 'amber' });
    expect(runStatus({ state: 'queued' }).word).toBe('waiting for a worker');
  });
});
