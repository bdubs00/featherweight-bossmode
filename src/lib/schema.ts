// The form of a question from ask_user, with the rules of /ui: one button
// per choice when the answer is one enum or one boolean, a small form for a
// flat schema, and a text box for a free answer or a schema that nests.

export interface Field {
  key: string;
  title: string;
  type: string;
  choices: unknown[] | null;
  labels: string[];
  required: boolean;
}

export type Form =
  | { kind: 'text' }
  | { kind: 'choices'; field: Field }
  | { kind: 'fields'; fields: Field[] };

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function obj(v: unknown): Record<string, unknown> | null {
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** MAX_CHOICES is the most buttons that a choice shows. More use a list. */
export const MAX_CHOICES = 6;

/** formOf reads the schema of a question. */
export function formOf(schema: unknown): Form {
  const s = obj(schema);
  const props = s && s.type === 'object' ? obj(s.properties) : null;
  if (!s || !props) return { kind: 'text' };
  const keys = Object.keys(props);
  if (keys.length === 0) return { kind: 'text' };
  const one = (k: string) => obj(props[k]) || {};
  if (keys.length === 1 && keys[0] === 'answer' && one('answer').type === 'string' && !one('answer').enum) return { kind: 'text' };
  const required = Array.isArray(s.required) ? (s.required as string[]) : [];
  const fields: Field[] = keys.map((k) => {
    const p = one(k);
    const type = Array.isArray(p.type) ? String((p.type as string[]).find((t) => t !== 'null') || '') : String(p.type || '');
    const oneOf = Array.isArray(p.oneOf) && p.oneOf.length && (p.oneOf as unknown[]).every((o) => obj(o) && 'const' in (obj(o) as object)) ? (p.oneOf as Record<string, unknown>[]) : null;
    const choices = oneOf ? oneOf.map((o) => o.const) : Array.isArray(p.enum) ? (p.enum as unknown[]) : type === 'boolean' ? [true, false] : null;
    const labels = oneOf
      ? oneOf.map((o) => String(o.title || o.const))
      : Array.isArray(p.enumNames)
        ? (p.enumNames as unknown[]).map(String)
        : type === 'boolean'
          ? ['Yes', 'No']
          : (choices || []).map(String);
    return { key: k, title: typeof p.title === 'string' ? p.title : cap(k.replace(/[_-]+/g, ' ')), type, choices, labels, required: required.includes(k) };
  });
  const flat = fields.every((f) => f.choices || ['string', 'number', 'integer'].includes(f.type));
  if (!flat) return { kind: 'text' };
  if (fields.length === 1 && fields[0].choices && fields[0].choices.length <= MAX_CHOICES) return { kind: 'choices', field: fields[0] };
  return { kind: 'fields', fields };
}

/** answerText words an answer: Yes or No, one value, or each field with its title. */
export function answerText(answer: unknown, fields?: Field[]): string {
  const word = (v: unknown) => (v === true ? 'Yes' : v === false ? 'No' : v && typeof v === 'object' ? JSON.stringify(v) : String(v));
  let o = answer;
  if (typeof o === 'string') {
    try {
      o = JSON.parse(o);
    } catch {
      return o as string;
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return word(o);
  const keys = Object.keys(o as object);
  if (keys.length === 1) return word((o as Record<string, unknown>)[keys[0]]);
  const titles = Object.fromEntries((fields || []).map((f) => [f.key, f.title]));
  return keys.map((k) => (titles[k] || cap(k.replace(/[_-]+/g, ' '))) + ': ' + word((o as Record<string, unknown>)[k])).join('\n');
}
