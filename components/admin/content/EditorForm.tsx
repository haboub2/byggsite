"use client";

import { createContext, useActionState, useContext, useEffect, useId, useState } from "react";
import { saveContentBlock, type ContentActionState } from "@/app/admin/content-actions";
import type { ContentKey } from "@/lib/content/schema";
import { formatWhen } from "@/lib/admin-format";

export type LastSaved = { at: string; by: string | null } | undefined;

const ErrorsContext = createContext<Record<string, string>>({});

/** Wraps an editor: posts the whole block as JSON, shows field errors and a
 *  sticky save bar that knows whether there are unsaved changes. */
export function EditorForm<T>({
  contentKey,
  value,
  initial,
  lastSaved,
  children,
}: {
  contentKey: ContentKey;
  value: T;
  initial: T;
  /** Latest saved version, so the bar can say when (it survives the remount after a save). */
  lastSaved?: LastSaved;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<ContentActionState, FormData>(saveContentBlock, {});
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const json = JSON.stringify(value);
  const dirty = json !== savedJson;

  // After a successful save, the saved version is the new baseline.
  const [lastSavedAt, setLastSavedAt] = useState<string | undefined>();
  if (state.ok && state.savedAt && state.savedAt !== lastSavedAt) {
    setLastSavedAt(state.savedAt);
    setSavedJson(json);
  }

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <ErrorsContext.Provider value={state.fieldErrors ?? {}}>
      <form action={action} className="editor" noValidate>
        <input type="hidden" name="key" value={contentKey} />
        <input type="hidden" name="payload" value={json} />
        {children}
        <div className="editor-bar" role="status" aria-live="polite">
          <span className={`editor-state${state.error ? " is-error" : ""}`}>
            {pending
              ? "Sparar…"
              : state.error
                ? state.error
                : dirty
                  ? "Osparade ändringar"
                  : lastSavedAt
                    ? "Sparat. Sajten är uppdaterad."
                    : lastSaved
                      ? `Senast sparat ${formatWhen(lastSaved.at)}${lastSaved.by ? ` av ${lastSaved.by}` : ""}. Sajten är uppdaterad.`
                      : "Inga ändringar sedan start"}
          </span>
          <button type="submit" className="btn btn-primary" disabled={pending || !dirty}>
            {pending ? "Sparar…" : "Spara och publicera"}
          </button>
        </div>
      </form>
    </ErrorsContext.Provider>
  );
}

export function useFieldError(path: string): string | undefined {
  return useContext(ErrorsContext)[path];
}

export function TextField({
  label,
  hint,
  path,
  value,
  onChange,
  placeholder,
  wide = false,
  inputMode,
}: {
  label: string;
  hint?: string;
  path: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
  inputMode?: "text" | "numeric" | "email" | "tel";
}) {
  const id = useId();
  const error = useFieldError(path);
  return (
    <div className={`efield${wide ? " efield--wide" : ""}${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={hint || error ? `${id}-d` : undefined}
      />
      {(error || hint) && (
        <span id={`${id}-d`} className={error ? "efield-error" : "efield-hint"}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

/** Whole kronor, typed with or without spaces. */
export function MoneyField({
  label,
  path,
  value,
  onChange,
}: {
  label: string;
  path: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <TextField
      label={label}
      path={path}
      inputMode="numeric"
      value={value ? value.toLocaleString("sv-SE") : ""}
      placeholder="0"
      onChange={(v) => onChange(Number(v.replace(/[^\d]/g, "")) || 0)}
    />
  );
}
