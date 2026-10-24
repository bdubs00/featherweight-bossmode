// globMatch follows Match of the package path of Go, which the front uses
// to say which hosts a secret may go to. * matches any run of characters
// but a slash, so it matches dots: *.example.com matches a.b.example.com,
// and not example.com. ? matches one character but a slash. [...] matches
// one character of a class: single characters and ranges such as a-z,
// with ^ first for a class that negates. A backslash makes the next
// character plain. A pattern that Go calls bad matches nothing.
//
// The code keeps the steps of the code of Go, so the two agree on each
// pattern: a pattern is a list of chunks, each after a run of stars.

/** A pattern that Go would refuse. */
class BadPattern extends Error {}

/** scanChunk cuts the next chunk off a pattern: whether stars come before it, the chunk, and the rest. */
function scanChunk(p: string[]): { star: boolean; chunk: string[]; rest: string[] } {
  let i = 0;
  let star = false;
  while (i < p.length && p[i] === '*') {
    i++;
    star = true;
  }
  const pat = p.slice(i);
  let inRange = false;
  let j = 0;
  for (; j < pat.length; j++) {
    const c = pat[j];
    if (c === '\\') {
      if (j + 1 < pat.length) j++;
    } else if (c === '[') inRange = true;
    else if (c === ']') inRange = false;
    else if (c === '*' && !inRange) break;
  }
  return { star, chunk: pat.slice(0, j), rest: pat.slice(j) };
}

/** getEsc reads one character of a class, with its escape. */
function getEsc(chunk: string[]): { r: string; rest: string[] } {
  if (chunk.length === 0 || chunk[0] === '-' || chunk[0] === ']') throw new BadPattern();
  let c = chunk;
  if (c[0] === '\\') {
    c = c.slice(1);
    if (c.length === 0) throw new BadPattern();
  }
  const rest = c.slice(1);
  if (rest.length === 0) throw new BadPattern();
  return { r: c[0], rest };
}

/** matchChunk matches a chunk at the start of a name: the rest of the name, or null. It reads the whole chunk, so a bad chunk throws also after a failed match. */
function matchChunk(chunkIn: string[], sIn: string[]): string[] | null {
  let chunk = chunkIn;
  let s = sIn;
  let failed = false;
  while (chunk.length > 0) {
    if (!failed && s.length === 0) failed = true;
    const c = chunk[0];
    if (c === '[') {
      let r = '';
      if (!failed) {
        r = s[0];
        s = s.slice(1);
      }
      chunk = chunk.slice(1);
      let negated = false;
      if (chunk.length > 0 && chunk[0] === '^') {
        negated = true;
        chunk = chunk.slice(1);
      }
      let match = false;
      let nrange = 0;
      for (;;) {
        if (chunk.length > 0 && chunk[0] === ']' && nrange > 0) {
          chunk = chunk.slice(1);
          break;
        }
        const lo = getEsc(chunk);
        chunk = lo.rest;
        let hi = lo.r;
        if (chunk[0] === '-') {
          const h = getEsc(chunk.slice(1));
          chunk = h.rest;
          hi = h.r;
        }
        if (!failed && lo.r <= r && r <= hi) match = true;
        nrange++;
      }
      if (match === negated) failed = true;
    } else if (c === '?') {
      if (!failed) {
        if (s[0] === '/') failed = true;
        s = s.slice(1);
      }
      chunk = chunk.slice(1);
    } else {
      if (c === '\\') {
        chunk = chunk.slice(1);
        if (chunk.length === 0) throw new BadPattern();
      }
      if (!failed) {
        if (chunk[0] !== s[0]) failed = true;
        s = s.slice(1);
      }
      chunk = chunk.slice(1);
    }
  }
  return failed ? null : s;
}

function match(patternIn: string[], nameIn: string[]): boolean {
  let pattern = patternIn;
  let name = nameIn;
  outer: while (pattern.length > 0) {
    const { star, chunk, rest } = scanChunk(pattern);
    pattern = rest;
    // A star at the end matches the rest of the name, unless it holds a slash.
    if (star && chunk.length === 0) return !name.includes('/');
    const t = matchChunk(chunk, name);
    // The last chunk must use the whole name, else a star before it may still match.
    if (t !== null && (t.length === 0 || pattern.length > 0)) {
      name = t;
      continue;
    }
    if (star) {
      // The star takes one more character each time, but never a slash.
      for (let i = 0; i < name.length && name[i] !== '/'; i++) {
        const u = matchChunk(chunk, name.slice(i + 1));
        if (u !== null) {
          if (pattern.length === 0 && u.length > 0) continue;
          name = u;
          continue outer;
        }
      }
    }
    // No match. The rest of the pattern must still be good, as Go checks.
    while (pattern.length > 0) {
      const next = scanChunk(pattern);
      pattern = next.rest;
      matchChunk(next.chunk, []);
    }
    return false;
  }
  return name.length === 0;
}

/** globMatch reports whether a name matches a pattern, as Match of the package path of Go does. A bad pattern matches nothing. */
export function globMatch(pattern: string, name: string): boolean {
  try {
    return match(Array.from(pattern), Array.from(name));
  } catch (e) {
    if (e instanceof BadPattern) return false;
    throw e;
  }
}
