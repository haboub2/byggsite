"use client";

import { useId } from "react";
import { useFieldError } from "../content/EditorForm";

/** Fields the HR forms need beyond EditorForm's text fields, with the same look and error handling. */

export function SelectField<T extends string>({
  label,
  path,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  path: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const id = useId();
  const error = useFieldError(path);
  return (
    <div className={`efield${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} aria-invalid={Boolean(error)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {(error || hint) && <span className={error ? "efield-error" : "efield-hint"}>{error ?? hint}</span>}
    </div>
  );
}

export function DateField({ label, path, value, onChange, hint }: { label: string; path: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const id = useId();
  const error = useFieldError(path);
  return (
    <div className={`efield${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} />
      {(error || hint) && <span className={error ? "efield-error" : "efield-hint"}>{error ?? hint}</span>}
    </div>
  );
}

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  return (
    <div className="efield hr-check">
      <label htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>
      {hint && <span className="efield-hint">{hint}</span>}
    </div>
  );
}

/** A row of buttons for one choice (the customer form's look). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="calc-seg hr-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
