import { afterEach, describe, expect, it } from 'vitest';
import { BUILD_META, dismissBuild, newBuild, ownBuild, resetBuild, sawBuild } from './build';

/** runs puts the element of a build into the head, as the build of the page does. */
function runs(build: string): void {
  const m = document.createElement('meta');
  m.name = BUILD_META;
  m.content = build;
  document.head.appendChild(m);
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="' + BUILD_META + '"]').forEach((m) => m.remove());
  resetBuild();
});

describe('the build of the page', () => {
  it('reads the build that runs from the head, and none in development', () => {
    expect(ownBuild()).toBe('');
    runs('bf5ebeab9889130a');
    expect(ownBuild()).toBe('bf5ebeab9889130a');
  });

  it('offers the build of the front only when it differs from the build of the tab', () => {
    runs('old1');
    expect(newBuild()).toBe('');
    sawBuild('old1');
    expect(newBuild()).toBe('');
    sawBuild('new2');
    expect(newBuild()).toBe('new2');
    // A replica of the old build during a roll ends the offer, and a
    // front that names no build too.
    sawBuild('old1');
    expect(newBuild()).toBe('');
    sawBuild('new2');
    sawBuild('');
    expect(newBuild()).toBe('');
  });

  it('keeps a dismissed build hidden, and offers a later one', () => {
    runs('old1');
    sawBuild('new2');
    dismissBuild();
    expect(newBuild()).toBe('');
    sawBuild('new2');
    expect(newBuild()).toBe('');
    sawBuild('new3');
    expect(newBuild()).toBe('new3');
  });

  it('offers nothing in a tab without a build, as in development', () => {
    sawBuild('new2');
    expect(newBuild()).toBe('');
  });
});
