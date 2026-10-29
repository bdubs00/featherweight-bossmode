import { describe, expect, it } from 'vitest';
import shell from './shell.css?raw';
import fleet from './fleet.css?raw';
import cf from './cf.css?raw';
import channel from './channel.css?raw';

/** rule returns the declarations of the first rule of a sheet whose selector is exactly sel. */
function rule(css: string, sel: string): string {
  const m = new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css);
  expect(m, sel).not.toBeNull();
  return m![2];
}

describe('the panes', () => {
  it('scroll down and never sideways, and wrap a long word', () => {
    const scroll = rule(shell, '.scroll');
    expect(scroll).toMatch(/overflow-x:\s*hidden/);
    expect(scroll).toMatch(/overflow-y:\s*auto/);
    expect(scroll).toMatch(/overflow-wrap:\s*break-word/);
  });

  it('break a long code span of a heart, and a long line of what an agent can do', () => {
    expect(rule(fleet, '.liked-body p')).toMatch(/overflow-wrap:\s*anywhere/);
    expect(rule(fleet, '.abilities')).toMatch(/overflow-wrap:\s*anywhere/);
  });
});

/** group returns the declarations of the first rule whose selector list holds each of sels, in order. */
function group(css: string, sels: string[]): string {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(^|\\n)' + sels.map(esc).join(',\\s*') + '\\s*\\{([^}]*)\\}').exec(css);
  expect(m, sels.join(', ')).not.toBeNull();
  return m![2];
}

describe('the stream of a channel of the chat-first page', () => {
  it('lays out its posts from the top, right under the sign-off card or the head, not pushed down to the composer', () => {
    expect(group(cf, ['.cf-channel .msgs > .start', '.cf-channel .msgs > .entries'])).toMatch(/margin-top:\s*0;/);
    // The column of the stream stacks from the top: nothing pushes it to the end.
    expect(rule(channel, '.msgs')).not.toMatch(/justify-content:\s*flex-end/);
    // The older place keeps its posts at the end of the pane, as before.
    expect(rule(channel, '.entries')).toMatch(/margin-top:\s*auto/);
  });
});
