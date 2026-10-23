// The error of a run as one plain line. The kernel passes the error of a
// model provider on as it came: the model, the address of the request, the
// status, the id of the request, and the JSON of the answer. A person
// needs only what happened, so the page keeps the message of the provider
// where it gives one, and else words the kind of failure.

/** The message of a JSON answer of a provider: error.message, or message. */
function providerMessage(text: string): string {
  const start = text.indexOf('{');
  if (start < 0) return '';
  for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
    try {
      const v = JSON.parse(text.slice(start, end + 1)) as { error?: { message?: unknown } | string; message?: unknown };
      if (v && typeof v.error === 'object' && v.error && typeof v.error.message === 'string') return v.error.message;
      if (v && typeof v.error === 'string') return v.error;
      if (v && typeof v.message === 'string') return v.message;
      return '';
    } catch {
      // A shorter slice can still be the JSON of the answer.
    }
  }
  return '';
}

/** sentence gives a text a capital first letter and an end mark. */
const sentence = (s: string): string => {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const c = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : c + '.';
};

/** strip removes what a person does not read: JSON, addresses, the ids of requests, and long ids. */
function strip(text: string): string {
  let t = text;
  const brace = t.indexOf('{');
  if (brace >= 0) t = t.slice(0, brace);
  return t
    .replace(/\((?:request[- ]id|req(?:uest)?[_ ]id)[^)]*\)/gi, '')
    .replace(/"?\b(?:https?|wss?):\/\/[^\s"]+"?/g, '')
    .replace(/\b(?:req|msg|run|ap)_[A-Za-z0-9]{8,}\b/g, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\b[0-9a-hjkmnp-tv-z]{26}\b/gi, '')
    .replace(/\s+([:,.])/g, '$1')
    .replace(/(?:[:,]\s*)+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * plainError turns the error of a run into one plain line. The message of
 * a provider that refused a request (a 4xx with error.message in its JSON)
 * shows as it is. A rate limit or an overload, a failure of the provider,
 * a timeout, a spent budget, a limit, and a stop each get words of the
 * page. Any other error gives its first sentence, without addresses, ids,
 * or JSON.
 */
export function plainError(error: string): string {
  const text = String(error || '').trim();
  if (!text) return '';
  const status = /\b([45]\d\d)\b(?:\s+[A-Z][A-Za-z ]+)?/.exec(text.replace(/\{[\s\S]*$/, ''));
  const code = status ? Number(status[1]) : 0;
  if (code === 429 || /\brate[ _-]?limit/i.test(text)) return 'The model provider limits the requests now. Try again later.';
  if (code === 529 || /\boverloaded/i.test(text)) return 'The model provider is overloaded. Try again later.';
  if (code >= 400 && code < 500) {
    const m = providerMessage(text);
    if (m) return sentence(m);
  }
  if (code >= 500) return 'The model provider failed. Try again later.';
  if (/\b(?:timeout|timed out|deadline exceeded)\b/i.test(text)) return 'The model did not answer in time.';
  if (/\bbudget exceeded\b|\bover (?:its|the) budget\b/i.test(text)) return 'The run used up its budget.';
  const limit = /\blimit of (.+?)\.?$/i.exec(text.split(/(?<=\.)\s/)[0]);
  if (limit) return 'Stopped at ' + limit[1].trim();
  if (/^(?:context )?cancel+ed\b|\bwas cancel+ed\b|\bcancel+ed by\b/i.test(text)) return 'The run was stopped.';
  const rest = strip(text);
  const first = (rest.split(/(?<=[.!?])\s/)[0] || rest).trim();
  const line = sentence(first);
  return line.length > 160 ? line.slice(0, 159).trimEnd() + '…' : line || 'The run failed.';
}
