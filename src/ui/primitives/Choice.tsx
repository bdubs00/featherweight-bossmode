// Choices is a visible choice of two or three, as a group of radio rows:
// the picked one takes the look of a selected row. Advanced is the one
// disclosure that holds the power of a form, behind its name.

import type { ComponentChildren } from 'preact';
import { Glyph } from '../icons';

export interface ChoiceOption<T extends string> {
  id: T;
  label: string;
  /** A short meta under the label. */
  meta?: string;
}

export interface ChoicesProps<T extends string> {
  /** The name of the radio group of the form. */
  name: string;
  /** The question that the choice answers, as the legend. Without it, the group needs label. */
  legend?: ComponentChildren;
  /** The name of the group for a screen reader, when it has no legend. */
  label?: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (id: T) => void;
  /** The reason of a failure, at the moment the person hits it. */
  error?: string;
  class?: string;
}

export function Choices<T extends string>({ name, legend, label, value, options, onChange, error, class: cls }: ChoicesProps<T>) {
  const group = (
    <div class="choices" role="radiogroup" aria-label={legend ? undefined : label}>
      {options.map((o) => (
        <label class={'choice' + (value === o.id ? ' on' : '')}>
          <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span>
            <span class="t-sub">{o.label}</span>
            {o.meta && <span class="t-meta">{o.meta}</span>}
          </span>
        </label>
      ))}
    </div>
  );
  if (!legend) return group;
  return (
    <fieldset class={'choice-set' + (cls ? ' ' + cls : '')}>
      <legend>{legend}</legend>
      {group}
      {error && (
        <span class="field-error" role="alert">
          {error}
        </span>
      )}
    </fieldset>
  );
}

export interface AdvancedProps {
  children: ComponentChildren;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  id?: string;
}

/** Advanced holds the fields that most people never change, behind one disclosure. */
export function Advanced({ children, open, onToggle, id }: AdvancedProps) {
  return (
    <details class="advanced" id={id} open={open} onToggle={onToggle ? (e) => onToggle((e.target as HTMLDetailsElement).open) : undefined}>
      <summary>
        <Glyph name="back" size={16} />
        Advanced
      </summary>
      <div class="advanced-body">{children}</div>
    </details>
  );
}
