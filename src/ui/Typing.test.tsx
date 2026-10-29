import { afterEach, describe, expect, it } from 'vitest';
import { Typing, typingNames, typingPhrase, typingSentence } from './Typing';
import { mount, unmountAll } from './testkit-a';

afterEach(unmountAll);

describe('the typing line', () => {
  it('names one, two, three, and more typists in words', () => {
    expect(typingNames(['manager'])).toBe('manager');
    expect(typingNames(['author', 'reviewer'])).toBe('author and reviewer');
    expect(typingNames(['author', 'reviewer', 'tester'])).toBe('author, reviewer, and tester');
    expect(typingNames(['author', 'reviewer', 'tester', 'scribe'])).toBe('author, reviewer, and 2 more');
  });

  it('says who works, with the phrase of the step and without a second Working', () => {
    expect(typingSentence(['manager'])).toBe('manager is working.');
    expect(typingSentence(['author', 'reviewer'])).toBe('author and reviewer are working.');
    expect(typingSentence(['migrator-1'], 'Thinking')).toBe('migrator-1 is working: Thinking');
    expect(typingSentence(['migrator-1'], 'Working: bash')).toBe('migrator-1 is working: bash');
  });

  it('takes the phrase from the queue, the step of the run, or the tool of the live stream', () => {
    expect(typingPhrase({ state: 'queued', activity: null })).toBe('Waiting for a worker');
    expect(typingPhrase({ state: 'running', activity: { turn: 2, phrase: 'Thinking in turn 2', since: '' } })).toBe('Thinking');
    expect(typingPhrase({ state: 'running', activity: null }, { text: '', tool: 'front.recall', busy: false })).toBe('Working: recall');
    expect(typingPhrase({ state: 'running', activity: null })).toBe('');
    expect(typingPhrase(undefined)).toBe('');
  });

  it('shows at most three faces, the three dots, and nothing for no typist', () => {
    const who = ['author', 'reviewer', 'tester', 'scribe'].map((n) => ({ agent: n, name: n }));
    const el = mount(<Typing who={who} named />);
    expect(el.querySelectorAll('.typing-faces .mark').length).toBe(3);
    expect(el.querySelectorAll('.typing-dots i').length).toBe(3);
    expect(el.querySelector('.typing-words')!.textContent).toBe('author, reviewer, and 2 more are working');
    expect(el.querySelector('.typing-dots')!.getAttribute('aria-hidden')).toBe('true');
    const none = mount(<Typing who={[]} />);
    expect(none.querySelector('.typing')).toBeNull();
  });

  it('shows only the dots in a one-on-one view without a phrase, and the sentence for a screen reader', () => {
    const el = mount(<Typing who={[{ agent: 'manager', name: 'manager' }]} />);
    expect(el.querySelector('.typing-words')).toBeNull();
    expect(el.querySelector('.sr')!.textContent).toBe('manager is working.');
  });
});
