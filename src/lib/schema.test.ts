import { describe, expect, it } from 'vitest';
import { answerText, formOf } from './schema';

describe('formOf', () => {
  it('keeps a text box for a free answer and a schema that nests', () => {
    expect(formOf(undefined)).toEqual({ kind: 'text' });
    expect(formOf({ type: 'object', properties: { answer: { type: 'string' } } })).toEqual({ kind: 'text' });
    expect(formOf({ type: 'object', properties: { a: { type: 'object', properties: {} } } })).toEqual({ kind: 'text' });
  });

  it('shows one button per value of one enum or one boolean', () => {
    const f = formOf({ type: 'object', properties: { env: { type: 'string', enum: ['staging', 'production'] } }, required: ['env'] });
    expect(f.kind).toBe('choices');
    if (f.kind === 'choices') expect(f.field.labels).toEqual(['staging', 'production']);
    const b = formOf(JSON.stringify({ type: 'object', properties: { ok: { type: 'boolean', title: 'Go on?' } } }));
    expect(b.kind).toBe('choices');
    if (b.kind === 'choices') {
      expect(b.field.choices).toEqual([true, false]);
      expect(b.field.labels).toEqual(['Yes', 'No']);
    }
  });

  it('makes a small form for a flat schema', () => {
    const f = formOf({ type: 'object', properties: { name: { type: 'string' }, count: { type: 'integer' }, mode: { enum: ['a', 'b'] } }, required: ['name'] });
    expect(f.kind).toBe('fields');
    if (f.kind === 'fields') {
      expect(f.fields.map((x) => [x.key, x.type, x.required])).toEqual([
        ['name', 'string', true],
        ['count', 'integer', false],
        ['mode', '', false],
      ]);
    }
  });

  it('words an answer', () => {
    expect(answerText({ ok: true })).toBe('Yes');
    expect(answerText('{"env":"staging"}')).toBe('staging');
    expect(answerText({ name: 'x', count: 2 })).toBe('Name: x\nCount: 2');
    expect(answerText('plain words')).toBe('plain words');
  });
});
