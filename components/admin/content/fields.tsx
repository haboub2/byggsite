"use client";

import { useState } from "react";
import { useAllFieldErrors } from "./EditorForm";
import { uploadPhoto, type StoredImage } from "../ImageUpload";
import { publicUrl } from "@/lib/storage-url";

/* Fields shared by the project and case editors. */

export function ListField({
  id,
  label,
  placeholder,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  hint: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="efield efield--wide">
      <label htmlFor={id}>{label}</label>
      {value.length > 0 && (
        <ol className="scope-edit">
          {value.map((s, i) => (
            <li key={`${s}-${i}`}>
              <span>{s}</span>
              <button type="button" aria-label={`Ta bort ${s}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="chips-add">
        <input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={add}>
          Lägg till
        </button>
      </div>
      <span className="efield-hint">{hint}</span>
    </div>
  );
}

export function Gallery({
  folder,
  value,
  onChange,
}: {
  folder: "projects" | "cases";
  value: StoredImage[];
  onChange: (v: StoredImage[]) => void;
}) {
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const errors = useFieldErrorsFor("gallery");

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setProblem(null);
    const added: StoredImage[] = [];
    for (const f of Array.from(files)) {
      setBusy((n) => n + 1);
      try {
        added.push({ path: await uploadPhoto(f, folder), alt: "" });
      } catch (err) {
        setProblem(err instanceof Error ? err.message : "Uppladdningen misslyckades.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    onChange([...value, ...added]);
  }

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="efield efield--wide">
      <span className="upload-label">Galleri</span>
      {value.length > 0 && (
        <ul className="gallery-edit">
          {value.map((g, i) => (
            <li key={g.path}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={publicUrl(g.path) ?? ""} alt="" />
              <div className={`efield${errors[`${i}.alt`] ? " has-error" : ""}`}>
                <label htmlFor={`g-${i}`}>Beskriv bilden</label>
                <input
                  id={`g-${i}`}
                  value={g.alt}
                  onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))}
                />
                {errors[`${i}.alt`] && <span className="efield-error">{errors[`${i}.alt`]}</span>}
              </div>
              <div className="gallery-tools">
                <button type="button" aria-label="Flytta upp" onClick={() => move(i, -1)} disabled={i === 0}>
                  ↑
                </button>
                <button type="button" aria-label="Flytta ner" onClick={() => move(i, 1)} disabled={i === value.length - 1}>
                  ↓
                </button>
                <button type="button" aria-label="Ta bort bilden" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <label className="btn btn-ghost gallery-add">
        {busy > 0 ? `Laddar upp ${busy}…` : "Lägg till bilder"}
        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
      </label>
      {problem && <span className="efield-error">{problem}</span>}
    </div>
  );
}

/** Field errors under a path prefix, e.g. "gallery" → { "0.alt": "…" }. */
export function useFieldErrorsFor(prefix: string): Record<string, string> {
  const all = useAllFieldErrors();
  return Object.fromEntries(
    Object.entries(all)
      .filter(([k]) => k.startsWith(`${prefix}.`))
      .map(([k, v]) => [k.slice(prefix.length + 1), v])
  );
}
