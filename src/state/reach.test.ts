import { afterEach, describe, expect, it } from 'vitest';
import { REACH_GRACE_MS, forgetReach, isOffline, noteAnswer, noteBrowser, noteStream } from './reach';

let t = 1_000_000;
const clock = () => t;

afterEach(() => forgetReach());

describe('whether the page reaches its server', () => {
  it('says offline after a call that got no answer, or the answer of a proxy whose server is gone, until the next answer', () => {
    forgetReach(clock);
    expect(isOffline()).toBe(false);
    noteAnswer(0);
    expect(isOffline()).toBe(true);
    noteAnswer(404);
    expect(isOffline()).toBe(false);
    noteAnswer(502);
    expect(isOffline()).toBe(true);
    noteAnswer(200);
    expect(isOffline()).toBe(false);
  });

  it('says offline while the browser says so', () => {
    forgetReach(clock);
    noteBrowser(false);
    expect(isOffline()).toBe(true);
    noteBrowser(true);
    expect(isOffline()).toBe(false);
  });

  it('takes a stream that stays lost past the grace, with no answer since, as offline, and a live stream as back', () => {
    forgetReach(clock);
    // The first connect of the stream is no sign, however long it takes.
    noteStream('connecting');
    t += REACH_GRACE_MS * 2;
    expect(isOffline()).toBe(false);
    noteStream('lost');
    expect(isOffline()).toBe(false);
    t += REACH_GRACE_MS;
    expect(isOffline()).toBe(true);
    // A call that gets an answer shows that the server is there, whatever the stream does.
    noteAnswer(200);
    expect(isOffline()).toBe(false);
    noteStream('live');
    noteStream('lost');
    t += REACH_GRACE_MS * 2;
    expect(isOffline()).toBe(true);
    noteStream('live');
    expect(isOffline()).toBe(false);
    // A stream that the page closed, as after a sign-out, is no sign.
    noteStream('closed');
    t += REACH_GRACE_MS * 2;
    expect(isOffline()).toBe(false);
  });
});
