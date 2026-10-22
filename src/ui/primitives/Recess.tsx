// The recessed controls: a thing you type into sits below the surface, on
// the recess ground, with an inset shadow and a line edge. Input, TextArea,
// and Command (a block of a command or code) share the look. Field gives a
// control its label and the reason of a failure.

import type { ComponentChildren, InputHTMLAttributes, TextareaHTMLAttributes } from 'preact';
import { forwardRef } from 'preact/compat';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, class: cls, ...rest }, ref) {
  return <input ref={ref} {...rest} class={'recess input' + (cls ? ' ' + cls : '')} aria-invalid={invalid ? true : undefined} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ invalid, class: cls, ...rest }, ref) {
  return <textarea ref={ref} {...rest} class={'recess textarea' + (cls ? ' ' + cls : '')} aria-invalid={invalid ? true : undefined} />;
});

/** Command shows a command or a block of code, as a person can type it. */
export function Command({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return <pre class={'recess command' + (cls ? ' ' + cls : '')}>{children}</pre>;
}

/**
 * Field is a label with its control. The label names the thing. A limit or
 * a rule shows in error, at the moment the person breaks it, never as a
 * sentence of help under the field.
 */
export function Field({ label, error, children, class: cls, id }: { label: ComponentChildren; error?: string; children: ComponentChildren; class?: string; id?: string }) {
  return (
    <label class={'field' + (error ? ' bad' : '') + (cls ? ' ' + cls : '')}>
      <span class="field-label">{label}</span>
      {children}
      {error && (
        <span class="field-error" id={id ? id + '-error' : undefined} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
