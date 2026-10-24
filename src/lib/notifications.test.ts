import { describe, expect, it } from 'vitest';
import { notifyBodyOf, notifyErrors, notifyFormOf, notifyProblems } from './notifications';

const READ = {
  ntfy: { server: '', topic: 'alice-duties', token: 'set' },
  send: { questions: true, failures: false, digest: true },
  quietHours: { from: '22:30', to: '06:45', timeZone: 'Europe/Berlin' },
  serverDefault: 'https://ntfy.example.org',
};

describe('the notification settings', () => {
  it('read into the form and back, and keep a stored token as set', () => {
    const f = notifyFormOf(READ, 'UTC');
    expect(f).toMatchObject({ server: '', topic: 'alice-duties', token: '', saved: true, questions: true, failures: false, digest: true, quiet: true, from: '22:30', to: '06:45', timeZone: 'Europe/Berlin' });
    expect(notifyBodyOf(f)).toEqual({ ntfy: { server: '', topic: 'alice-duties', token: 'set' }, send: { questions: true, failures: false, digest: true }, quietHours: { from: '22:30', to: '06:45', timeZone: 'Europe/Berlin' } });
  });

  it('clear the token on Remove, replace it with a new one, and send quiet hours that are off as two empty times', () => {
    const f = notifyFormOf(READ, 'UTC');
    expect(notifyBodyOf({ ...f, saved: false }).ntfy.token).toBe('');
    expect(notifyBodyOf({ ...f, token: ' tk_new ' }).ntfy.token).toBe('tk_new');
    expect(notifyBodyOf({ ...f, quiet: false }).quietHours).toEqual({ from: '', to: '', timeZone: 'Europe/Berlin' });
    // A person with no settings yet starts with questions and failures on, and quiet hours in the zone of the browser.
    expect(notifyFormOf(null, 'America/New_York')).toMatchObject({ questions: true, failures: true, digest: false, quiet: false, from: '22:00', to: '07:00', timeZone: 'America/New_York', saved: false });
  });

  it('say what the form lacks, and sort the problems of the front by field', () => {
    const f = notifyFormOf(null, 'UTC');
    expect(notifyErrors(f)).toEqual({ topic: 'Write the topic that your phone follows.' });
    expect(notifyErrors({ ...f, questions: false, failures: false })).toEqual({});
    expect(notifyErrors({ ...f, topic: 'my topic', server: 'ntfy.sh' })).toEqual({ server: 'Write the address of the server, such as https://ntfy.sh.', topic: 'A topic holds no space and no slash.' });
    expect(notifyErrors({ ...f, topic: 'x', quiet: true, from: '' })).toEqual({ quiet: 'Pick both times.' });
    expect(notifyProblems(['ntfy.topic: That topic is taken.', 'quietHours.timeZone: Not a time zone.', 'send.digest: The front writes no digest.', 'The store is busy.'])).toEqual({
      topic: ['That topic is taken.'],
      quiet: ['Not a time zone.'],
      send: ['The front writes no digest.'],
      top: ['The store is busy.'],
    });
  });
});
