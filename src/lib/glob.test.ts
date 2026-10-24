import { describe, expect, it } from 'vitest';
import { globMatch } from './glob';

describe('globMatch, as Match of the package path of Go', () => {
  it('lets a star match any run of characters, dots too, and never a slash', () => {
    expect(globMatch('*.example.com', 'a.b.example.com')).toBe(true);
    expect(globMatch('*.example.com', 'q.example.com')).toBe(true);
    expect(globMatch('*.example.com', 'example.com')).toBe(false);
    expect(globMatch('*.example.com', 'q.example.com.evil.org')).toBe(false);
    expect(globMatch('*', 'anything.at.all')).toBe(true);
    expect(globMatch('*', 'a/b')).toBe(false);
    expect(globMatch('api.*.lab', 'api.eu.west.lab')).toBe(true);
    expect(globMatch('example.com', 'example.com')).toBe(true);
    expect(globMatch('example.com', 'www.example.com')).toBe(false);
  });

  it('lets a question mark match one character', () => {
    expect(globMatch('api?.lab', 'api1.lab')).toBe(true);
    expect(globMatch('api?.lab', 'api12.lab')).toBe(false);
    expect(globMatch('api?.lab', 'api.lab')).toBe(false);
  });

  it('matches one character of a class, a range, or a class that negates', () => {
    expect(globMatch('[ab]pi.lab', 'api.lab')).toBe(true);
    expect(globMatch('[ab]pi.lab', 'cpi.lab')).toBe(false);
    expect(globMatch('node[0-9].lab', 'node7.lab')).toBe(true);
    expect(globMatch('node[0-9].lab', 'nodex.lab')).toBe(false);
    expect(globMatch('[^ab]pi.lab', 'cpi.lab')).toBe(true);
    expect(globMatch('[^ab]pi.lab', 'api.lab')).toBe(false);
    expect(globMatch('[\\]]x', ']x')).toBe(true);
  });

  it('takes a character after a backslash as it is', () => {
    expect(globMatch('\\*.lab', '*.lab')).toBe(true);
    expect(globMatch('\\*.lab', 'a.lab')).toBe(false);
  });

  it('matches nothing with a pattern that Go calls bad', () => {
    expect(globMatch('[', 'a')).toBe(false);
    expect(globMatch('[]a]', ']')).toBe(false);
    expect(globMatch('a\\', 'a')).toBe(false);
    expect(globMatch('[a-', 'a')).toBe(false);
    // Go checks the rest of a pattern after a failed match too.
    expect(globMatch('x*[', 'yz')).toBe(false);
  });
});
