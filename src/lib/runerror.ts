// Plain words for the error of a run. The kernel gives the error of a
// failed run as it got it, such as the error chain of a model call with
// the address, the request id, and the JSON answer of the provider inside.
// plainError gives one line that a person understands, such as "The model
// refused the request". providerMessage gives the message of the provider
// from that JSON, for a tooltip and for the run. The whole error stays for
// Details.

/** The answer of a provider inside an error: its message and its type. */
interface Answer {
  at: number;
  message: string;
  type: string;
  code: number;
}

/** answerOf finds the first JSON object inside an error and reads its message and type. */
function answerOf(s: string): Answer | null {
  const end = s.lastIndexOf('}');
  for (let i = s.indexOf('{'); i >= 0 && i < end; i = s.indexOf('{', i + 1)) {
    let v: unknown;
    try {
      v = JSON.parse(s.slice(i, end + 1));
    } catch {
      continue;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const e = o.error && typeof o.error === 'object' ? (o.error as Record<string, unknown>) : null;
    const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
    const message = (e && str(e.message)) || str(o.message) || str(o.error) || str(o.detail);
    const type = (e && (str(e.type) || str(e.status) || str(e.code))) || (str(o.type) !== 'error' ? str(o.type) : '');
    const code = e && typeof e.code === 'number' ? e.code : typeof o.status === 'number' ? o.status : 0;
    return { at: i, message, type, code };
  }
  return null;
}

const REASONS = 'Bad Request|Unauthorized|Payment Required|Forbidden|Not Found|Request Timeout|Conflict|Payload Too Large|Request Entity Too Large|Unprocessable Entity|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout';

/** statusOf reads the HTTP status of an error: `"<address>": 400`, `status code 429`, or `503 Service Unavailable`. */
function statusOf(head: string): number {
  const m = /"\s*:\s*([1-5]\d\d)\b/.exec(head) || /\bstatus(?: code)?[:= ]+([1-5]\d\d)\b/i.exec(head) || new RegExp('\\b([45]\\d\\d) (?:' + REASONS + ')\\b').exec(head);
  return m ? Number(m[1]) : 0;
}

/** The words of a limit of the budget, by the name that the kernel gives it. */
const LIMITS: Record<string, string> = {
  maxTurns: 'Stopped at its turn limit',
  maxTokens: 'Stopped at its token limit',
  maxCostUSD: 'Stopped at its cost limit',
  deadline: 'Stopped at its time limit',
  maxToolCalls: 'Stopped at its tool call limit',
  maxCallsPerTurn: 'Stopped at its tool call limit',
  maxRepeats: 'Stopped: it kept repeating one step',
};

/** budgetLine words a limit of the budget that the kernel names, or gives "" for an error that names none. */
function budgetLine(s: string): string {
  const named = /\bbudget exceeded:?\s*([A-Za-z]+)/i.exec(s);
  if (named) return LIMITS[named[1]] || 'Stopped at its budget';
  if (/\bbudget exceeded\b/i.test(s)) return 'Stopped at its budget';
  if (/\bworking time reached the deadline\b/i.test(s)) return LIMITS.deadline;
  return '';
}

/**
 * limitOfLine keeps the number of the older words of a limit: "The run
 * reached its limit of 40 turns." and "Stopped at the limit of 40 turns."
 * give "Stopped at 40 turns", and a limit of 2.00 USD keeps its decimals.
 */
function limitOfLine(s: string): string {
  const of = /\b(?:reached its|at the|at its) limit of (\$?\d[\d,.]*(?: [A-Za-z]+){0,3})/i.exec(s);
  return of ? 'Stopped at ' + of[1].replace(/[.,]+$/, '').trim() : '';
}

/** isModel tells an error of a model call from the error of another service. */
const isModel = (s: string): boolean => /^\s*model:|\b(anthropic|openai|bedrock|vertex|gemini|claude|gpt-)|\/v1\/messages|\/chat\/completions/i.test(s);

/** firstSentence is the first sentence of an error without its addresses, request ids, JSON, package names, or end mark. */
function firstSentence(s: string, json: Answer | null): string {
  let t = json ? s.slice(0, json.at) : s;
  t = t
    .replace(/\((?:request|workspace)[- _]id:[^)]*\)/gi, ' ')
    .replace(/\b(?:request[-_ ]?id|trace[-_ ]?id)\s*[:=]\s*[^\s),;]+/gi, ' ')
    .replace(/\breq_[A-Za-z0-9]+/g, ' ')
    // A long id, such as the id of a run or a bridge, or a UUID, says nothing to a person.
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\b(?:run-)?[0-9a-hjkmnp-tv-z]{26}\b/gi, ' ')
    .replace(/"?\b(?:https?|wss?):\/\/[^\s"]*"?/g, ' ')
    .replace(/\b(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s+(?=:|$)/g, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*:)+(?=\s*:|\s*$)/g, '')
    .replace(/\s+([:,])/g, '$1')
    .trim();
  // The package names in front, such as "harness: " or "fw: ", say nothing to a person.
  t = t.replace(/^(?:[a-z][a-z0-9_-]*: )+/, '');
  const end = t.search(/[.!?](?:\s|$)/);
  if (end >= 0) t = t.slice(0, end);
  t = t.replace(/[\s:;,]+$/, '').trim();
  if (!t) return '';
  if (t.length > 100) t = t.slice(0, 99).trimEnd() + '…';
  return t[0].toUpperCase() + t.slice(1);
}

/**
 * plainError turns the error of a run into one plain line without an end
 * mark, for a row, a status line, and the head of the run. It knows a
 * refusal of the provider (a 4xx), a busy provider (a 429, or overloaded),
 * a failure of the provider (a 5xx), a timeout, a limit of the budget, a
 * stop, and a lost worker. Any other error gives its first sentence,
 * without addresses, request ids, or JSON.
 */
export function plainError(error: string | undefined): string {
  const s = String(error || '').trim();
  if (!s) return '';
  const json = answerOf(s);
  // The words of the kernel come before the answer of a provider, so a limit inside that answer never reads as a budget.
  const head = json ? s.slice(0, json.at) : s;
  const budget = budgetLine(head);
  if (budget) return budget;
  const status = statusOf(head) || (json && json.code >= 400 && json.code < 600 ? json.code : 0);
  const type = json ? json.type.toLowerCase() : '';
  const model = isModel(s);
  const who = model ? 'The model' : 'A service';
  const provider = model ? 'The model provider' : 'A service';
  const said = json ? json.message : '';
  if (status === 429 || status === 529 || /rate_limit|overloaded|resource_exhausted/.test(type) || /\boverloaded\b/i.test(s)) return who + ' was busy';
  if (status === 408 || status === 504) return model ? 'The model did not answer in time' : 'A step did not finish in time';
  if (status === 401 || /authentication/.test(type)) return provider + ' refused the key';
  if (status === 403 || /permission/.test(type)) return provider + ' refused access';
  if (status >= 500 || /api_error|internal|unavailable/.test(type)) return provider + ' had an error';
  if (model && (status === 404 || /not_found/.test(type))) return 'The model provider does not know this model';
  if (model && /\b(?:prompt|context|input) is too long\b|context[_ ]length|maximum context/i.test(said || s)) return 'The conversation is too long for the model';
  if (status >= 400 || /invalid_request/.test(type)) return who + ' refused the request';
  const limit = limitOfLine(head);
  if (limit) return limit;
  if (/\bdeadline exceeded\b|\btimed? ?out\b|\btimeout\b/i.test(head)) return model ? 'The model did not answer in time' : 'A step did not finish in time';
  if (/\bcancel+ed\b/i.test(head)) return 'Stopped before it finished';
  if (/\blost\b|\bno worker\b.*\bholds it\b/i.test(head)) return 'Lost its worker';
  return firstSentence(s, json) || 'The run failed';
}

/** providerMessage is the message that the provider wrote inside an error, such as the message of its JSON answer, or "". */
export function providerMessage(error: string | undefined): string {
  const json = answerOf(String(error || ''));
  return json ? json.message : '';
}
