import { describe, expect, it } from 'vitest';
import type { NotifyChannel, NotifyRead } from '../api/types';
import {
  channelErrors,
  channelFormOf,
  channelOf,
  channelWords,
  masked,
  notifyBodyOf,
  notifyFormOf,
  notifyProblems,
  offeredKinds,
  placeLine,
  problemTexts,
  quietError,
  secretOpen,
  secretValue,
  testWords,
} from './notifications';

const PHONE: NotifyChannel = { id: 'phone', kind: 'ntfy', label: 'My phone', send: { questions: true, failures: true, digest: false }, ntfy: { server: '', topic: 'alice-fw-8f3k', token: 'set' } };
const HA: NotifyChannel = { id: 'ha', kind: 'webhook', label: 'Home Assistant', send: { questions: true, failures: true, digest: false }, url: 'set', secret: 'set' };
const SIGNAL: NotifyChannel = { id: 'signal', kind: 'agent', label: 'Signal', send: { questions: true, failures: false, digest: false }, agent: { agent: 'relay', how: 'Send it to me on Signal.', budget: { maxCostUSD: 0.02, maxTurns: 4 } } };
const READ: NotifyRead = {
  channels: [PHONE, HA, SIGNAL, { id: 'ops', kind: 'shared', label: 'Ops room of the team', send: { questions: false, failures: true, digest: false }, shared: 'ops-room' }],
  quietHours: { from: '22:30', to: '06:45', timeZone: 'Europe/Berlin' },
  offered: [
    { kind: 'slack', label: 'Slack' },
    { kind: 'ntfy', label: 'ntfy' },
    { kind: 'shared', label: 'Shared' },
    { kind: 'pager', label: 'Pager' },
  ],
  shared: [{ name: 'ops-room', kind: 'slack', label: 'Ops room' }],
  off: '',
};

describe('the settings of the places', () => {
  it('read into the form and back, keep the write-only fields as set, and leave out what the front adds', () => {
    const f = notifyFormOf(READ, 'UTC');
    expect(f).toMatchObject({ quiet: true, from: '22:30', to: '06:45', timeZone: 'Europe/Berlin' });
    expect(notifyBodyOf(f)).toEqual({ channels: READ.channels, quietHours: { from: '22:30', to: '06:45', timeZone: 'Europe/Berlin' } });
    expect(notifyBodyOf({ ...f, quiet: false }).quietHours).toEqual({ from: '', to: '', timeZone: 'Europe/Berlin' });
    // A person with no settings yet has no place, and quiet hours in the zone of the browser.
    expect(notifyFormOf(null, 'America/New_York')).toEqual({ channels: [], quiet: false, from: '22:00', to: '07:00', timeZone: 'America/New_York' });
    expect(quietError({ ...f, from: '' })).toBe('Pick both times.');
    expect(quietError({ ...f, quiet: false, from: '' })).toBe('');
  });

  it('mask what a write sent, as a read answers it, for a front that answers a write with no settings', () => {
    const sent = { channels: [{ ...HA, url: 'https://ha.example.com/x', secret: '' }, { ...PHONE, ntfy: { server: '', topic: 't', token: 'tk' } }], quietHours: READ.quietHours };
    expect(masked(sent).channels).toEqual([
      { ...HA, url: 'set', secret: '' },
      { ...PHONE, ntfy: { server: '', topic: 't', token: 'set' } },
    ]);
  });

  it('offer only the kinds that the front serves and the page knows, in the order of the page, and shared only with a shared channel', () => {
    expect(offeredKinds(READ)).toEqual(['ntfy', 'slack', 'shared']);
    expect(offeredKinds({ ...READ, shared: [] })).toEqual(['ntfy', 'slack']);
    expect(offeredKinds(null)).toEqual([]);
  });

  it('say where each place reaches in words', () => {
    const agent = (a: string) => (a === 'relay' ? 'Relay' : a);
    expect(READ.channels.map((c) => placeLine(c, READ, agent))).toEqual(['ntfy, topic alice-fw-8f3k', 'Webhook', 'Through Relay', 'Ops room, shared by an admin']);
    expect(placeLine({ kind: 'email', label: 'Work', send: PHONE.send, email: { to: 'alice@example.com' } }, READ)).toBe('Email to alice@example.com');
    expect(placeLine({ kind: 'pager', label: 'Pager', send: PHONE.send }, READ)).toBe('Pager');
    expect(channelWords('Ops room')).toBe('The Ops room channel');
    expect(channelWords('Ops channel')).toBe('The Ops channel');
  });
});

describe('the form of a place', () => {
  it('writes only the fields of its kind, keeps a saved token as set, and keeps the other limits of an agent', () => {
    expect(channelOf(channelFormOf(PHONE), PHONE)).toEqual(PHONE);
    expect(channelOf(channelFormOf(HA), HA)).toEqual(HA);
    expect(channelOf(channelFormOf(SIGNAL), SIGNAL)).toEqual(SIGNAL);
    const f = { ...channelFormOf(PHONE), kind: 'email' as const, to: ' alice@example.com ' };
    expect(channelOf(f)).toEqual({ id: 'phone', kind: 'email', label: 'My phone', send: PHONE.send, email: { to: 'alice@example.com' } });
  });

  it('keeps, clears, or replaces a write-only field', () => {
    const s = channelFormOf(HA).secret;
    expect(secretOpen(s)).toBe(false);
    expect(secretValue(s)).toBe('set');
    expect(secretValue({ ...s, removed: true })).toBe('');
    expect(secretOpen({ ...s, removed: true })).toBe(true);
    expect(secretValue({ ...s, replacing: true })).toBe('set');
    expect(secretValue({ ...s, replacing: true, typed: ' new ' })).toBe('new');
    expect(secretOpen(channelFormOf(null).secret)).toBe(true);
    expect(secretValue(channelFormOf(null).secret)).toBe('');
  });

  it('starts a new place with questions and failures, no digest, and no budget', () => {
    const f = channelFormOf(null);
    expect(f).toMatchObject({ kind: '', label: '', questions: true, failures: true, digest: false, cost: '' });
    expect(channelErrors(f)).toEqual({ kind: 'Pick a kind of place.' });
  });

  it('says what each kind lacks before a save', () => {
    const f = { ...channelFormOf(null), label: 'Mine' };
    expect(channelErrors({ ...f, kind: 'ntfy' })).toEqual({ topic: 'Write the topic that your phone follows.' });
    expect(channelErrors({ ...f, kind: 'ntfy', topic: 'a b', server: 'ntfy.sh' })).toEqual({ server: 'Write the address of the server, such as https://ntfy.sh.', topic: 'A topic holds no space and no slash.' });
    // A front without a server of its own needs one in the place. A front that does not say leaves it to the front.
    expect(channelErrors({ ...f, kind: 'ntfy', topic: 'x' }, '').server).toBe('This workbench has no ntfy server of its own. Write the address of one, such as https://ntfy.sh.');
    expect(channelErrors({ ...f, kind: 'ntfy', topic: 'x' }, 'https://ntfy.example.org')).toEqual({});
    expect(channelErrors({ ...f, kind: 'slack' })).toEqual({ url: 'Paste the address from Slack.' });
    expect(channelErrors({ ...f, kind: 'slack', url: { ...f.url, typed: 'https://example.com/x' } })).toEqual({ url: 'A Slack address starts with https://hooks.slack.com/.' });
    expect(channelErrors({ ...f, kind: 'discord', url: { ...f.url, typed: 'https://discordapp.com/api/webhooks/1/abc' } })).toEqual({});
    expect(channelErrors({ ...f, kind: 'teams', url: { ...f.url, typed: 'http://teams.example.com/x' } })).toEqual({ url: 'The address starts with https://.' });
    expect(channelErrors({ ...f, kind: 'webhook' })).toEqual({ url: 'Paste the address of the app.' });
    // A saved address needs nothing new.
    expect(channelErrors({ ...channelFormOf(HA) })).toEqual({});
    expect(channelErrors({ ...f, kind: 'email', to: 'alice' })).toEqual({ to: 'Write an email address, such as you@example.com.' });
    expect(channelErrors({ ...f, kind: 'shared' })).toEqual({ shared: 'Pick a shared channel.' });
    expect(channelErrors({ ...f, kind: 'agent', label: '' })).toEqual({
      label: 'Give the place a name.',
      agent: 'Pick the agent that reaches you.',
      how: 'Say how the agent should reach you.',
      cost: 'A place through an agent needs a budget. Write the most a message can cost, such as 0.02.',
    });
    expect(channelErrors({ ...f, kind: 'agent', agent: 'relay', how: 'On Signal.', cost: '0' }).cost).toBe('Write an amount above 0, such as 0.02.');
  });
});

describe('the problems of the front', () => {
  it('sort by channel and field, with the quiet hours apart and the rest at the top', () => {
    const p = notifyProblems([
      'channels[1].url: The front cannot reach this address.',
      'channels[1].secret: A secret holds at least 16 characters.',
      'channels[0].ntfy.topic: That topic is taken.',
      'channels[2].agent.budget.maxCostUSD: Write the most a message can cost.',
      'channels[2]: You cannot run relay.',
      'quietHours.timeZone: Not a time zone.',
      'channels: A person keeps at most 10 places.',
      'The store is busy.',
    ]);
    expect(p.top).toEqual(['A person keeps at most 10 places.', 'The store is busy.']);
    expect(p.quiet).toEqual(['Not a time zone.']);
    expect(p.channels[0]).toEqual({ topic: ['That topic is taken.'] });
    expect(p.channels[1]).toEqual({ url: ['The front cannot reach this address.'], secret: ['A secret holds at least 16 characters.'] });
    expect(p.channels[2]).toEqual({ cost: ['Write the most a message can cost.'], row: ['You cannot run relay.'] });
    expect(problemTexts(p.channels[2])).toEqual(['You cannot run relay.', 'Write the most a message can cost.']);
  });
});

describe('a test', () => {
  it('says what it did for one place', () => {
    expect(testWords({ channel: 'phone', sent: true }, 'My phone')).toEqual({ ok: true, words: 'Sent to My phone. Look for it there.' });
    expect(testWords({ channel: 'ha', sent: false, error: 'the address answered 404 not found' }, 'Home Assistant')).toEqual({ ok: false, words: 'Not sent to Home Assistant. The address answered 404 not found.' });
    expect(testWords(undefined, 'My phone')).toEqual({ ok: false, words: 'The front sent nothing to My phone.' });
  });
});
