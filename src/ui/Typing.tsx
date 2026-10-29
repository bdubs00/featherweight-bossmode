// The typing line of a conversation. While an agent works on an answer,
// the foot of the thread shows its face and a bubble of three dots that
// rise in turn, as a chat app shows that someone types. A bridge shows the
// faces of the seats that work, at most three. The line sticks to the foot
// of the scroll box, so it stays in view above the composer while the
// person reads further up. Reduced motion holds the dots still.

import type { Run } from '../api/types';
import { listWords } from '../lib/duties';
import { toolWord, type LiveAnswer } from './Live';
import { Mark } from './primitives/Mark';

/** A typist is an agent that works now: the agent of its face, and the name that the line says. */
export interface Typist {
  agent: string;
  name: string;
}

/** The most faces that the line shows. Further typists count in the words. */
export const TYPING_FACES = 3;

/**
 * typingPhrase says what a run does now: Waiting for a worker while it
 * waits in the queue, else the phrase of its step, such as Thinking, else
 * the tool that the live stream names. It is "" when nothing says more
 * than the dots.
 */
export function typingPhrase(run: Pick<Run, 'state' | 'activity'> | undefined | null, live?: LiveAnswer): string {
  if (run && run.state === 'queued') return 'Waiting for a worker';
  // The turn of the model is a word of the machine: Thinking in turn 2 reads Thinking.
  if (run && run.activity && run.activity.phrase) return run.activity.phrase.replace(/\s+in turn \d+\.?$/i, '');
  if (live && live.tool) return 'Working: ' + toolWord(live.tool);
  return '';
}

/** typingNames says who works: author, author and reviewer, or author, reviewer, and 2 more. */
export function typingNames(names: string[]): string {
  if (names.length <= TYPING_FACES) return listWords(names);
  const more = names.length - (TYPING_FACES - 1);
  return listWords([...names.slice(0, TYPING_FACES - 1), more + ' more']);
}

/** typingSentence is the sentence of the line for a screen reader: manager is working, or author and reviewer are working, with the phrase of the step. */
export function typingSentence(names: string[], phrase?: string): string {
  const who = typingNames(names);
  // The phrase of a tool starts with Working, which the sentence says already.
  const what = phrase ? phrase.replace(/^Working: /, '') : '';
  return who + (names.length === 1 ? ' is working' : ' are working') + (what ? ': ' + what : '.');
}

/**
 * Typing is the typing line. In a one-on-one view, phrase says what the
 * agent does now, such as Thinking. A bridge names its typists on the
 * line, because the faces alone do not say who works.
 */
export function Typing({ who, phrase, named }: { who: Typist[]; phrase?: string; named?: boolean }) {
  if (who.length === 0) return null;
  const names = who.map((w) => w.name);
  const words = named ? typingSentence(names, who.length === 1 ? phrase : undefined).replace(/\.$/, '') : phrase || '';
  return (
    <div class="typing" role="status">
      <span class="typing-faces" aria-hidden="true">
        {who.slice(0, TYPING_FACES).map((w) => (
          <Mark key={w.agent + '/' + w.name} agent={w.agent} size={24} />
        ))}
      </span>
      <span class="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {words && (
        <span class="typing-words clip" aria-hidden="true">
          {words}
        </span>
      )}
      <span class="sr">{typingSentence(names, phrase)}</span>
    </div>
  );
}
