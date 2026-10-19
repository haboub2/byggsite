"use client";

import { useState, useTransition } from "react";
import { deletePhoto, saveNote, savePhoto, saveSummary, type DocResult } from "@/app/admin/documentation-actions";
import { fileHref } from "@/lib/portal/files-href";

/**
 * The pieces of the admin "Dokumentation" page. Every field saves by itself
 * (on leaving a text field, at once for switches and moves) and says so,
 * so there is no "Spara" to forget. When the documentation is locked they
 * render read-only.
 */

type PhaseOption = { id: string; name: string };

function useSave() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const save = (work: () => Promise<DocResult>, onDone?: () => void) =>
    start(async () => {
      const r = await work();
      if (r.error) {
        setError(r.error);
        setState("error");
      } else {
        setState("saved");
        onDone?.();
      }
    });
  const status = pending ? "Sparar…" : state === "saved" ? "Sparat" : "";
  return { save, pending, status, error: state === "error" ? error : "" };
}

function Status({ status, error }: { status: string; error: string }) {
  if (error) return <span className="doc-status doc-status--error" role="alert">{error}</span>;
  return <span className="doc-status" aria-live="polite">{status}</span>;
}

/** A phase's summary (phase given) or the "Slutdokumentation" (phase null). */
export function SummaryField({
  project,
  phase,
  initial,
  label,
  placeholder,
  locked,
}: {
  project: string;
  phase: string | null;
  initial: string;
  label: string;
  placeholder: string;
  locked: boolean;
}) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const { save, status, error } = useSave();
  if (locked) return initial.trim() ? <p className="doc-summary-locked">{initial}</p> : null;
  const commit = () => {
    if (text === saved) return;
    const value = text;
    save(() => saveSummary({ project, phase, text: value }), () => setSaved(value));
  };
  return (
    <div className="efield doc-summary">
      <label>
        {label} <Status status={status} error={error} />
      </label>
      <textarea value={text} rows={phase ? 2 : 5} maxLength={6000} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
    </div>
  );
}

/** The day's note: text, phase and day. */
export function NoteCard({
  project,
  note,
  phases,
  today,
  locked,
}: {
  project: string;
  note: { id: string; body: string; phase_id: string | null; day: string };
  phases: PhaseOption[];
  today: string;
  locked: boolean;
}) {
  const [body, setBody] = useState(note.body);
  const { save, status, error } = useSave();
  if (locked) return <p className="doc-note">{note.body}</p>;
  const commit = (patch: Partial<{ body: string; phase_id: string | null; day: string }>) => {
    const next = { body, phase_id: note.phase_id, day: note.day, ...patch };
    save(() => saveNote({ project, update: note.id, ...next }));
  };
  return (
    <div className="doc-note-edit">
      <textarea value={body} rows={2} maxLength={3000} aria-label="Dagens anteckning" onChange={(e) => setBody(e.target.value)} onBlur={() => body !== note.body && commit({ body })} />
      <div className="doc-move">
        <select value={note.phase_id ?? ""} aria-label="Anteckningens fas" onChange={(e) => commit({ phase_id: e.target.value || null })}>
          <option value="">Ingen fas</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" value={note.day} max={today} aria-label="Anteckningens dag" onChange={(e) => e.target.value && commit({ day: e.target.value })} />
        <Status status={status} error={error} />
      </div>
    </div>
  );
}

/** One photo: caption, "Med i rapporten", and moving it to another phase or day. */
export function PhotoCard({
  project,
  photo,
  phases,
  today,
  locked,
}: {
  project: string;
  photo: { id: string; path: string; caption: string; in_report: boolean; phase_id: string | null; day: string };
  phases: PhaseOption[];
  today: string;
  locked: boolean;
}) {
  const [caption, setCaption] = useState(photo.caption);
  const [inReport, setInReport] = useState(photo.in_report);
  const [moving, setMoving] = useState(false);
  const { save, pending, status, error } = useSave();
  const src = fileHref(photo.path);
  const commit = (patch: Partial<{ caption: string; in_report: boolean; phase_id: string | null; day: string }>) =>
    save(() => savePhoto({ project, photo: photo.id, caption, in_report: inReport, phase_id: photo.phase_id, day: photo.day, ...patch }));

  return (
    <li className="doc-photo" data-out={inReport ? undefined : "1"}>
      <a href={src} target="_blank" rel="noreferrer" className="doc-photo-img">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={photo.caption} loading="lazy" />
        {!inReport && <span className="doc-photo-out">Inte i rapporten</span>}
      </a>
      {locked ? (
        photo.caption && <p className="doc-photo-caption">{photo.caption}</p>
      ) : (
        <>
          <input
            className="doc-caption"
            value={caption}
            maxLength={300}
            placeholder="Bildtext (valfri)"
            aria-label="Bildtext"
            onChange={(e) => setCaption(e.target.value)}
            onBlur={() => caption !== photo.caption && commit({ caption })}
          />
          <label className="doc-check">
            <input
              type="checkbox"
              checked={inReport}
              onChange={(e) => {
                setInReport(e.target.checked);
                commit({ in_report: e.target.checked });
              }}
            />
            <span>Med i rapporten</span>
          </label>
          {moving ? (
            <div className="doc-move">
              <select value={photo.phase_id ?? ""} aria-label="Flytta till fas" onChange={(e) => commit({ phase_id: e.target.value || null })} disabled={pending}>
                <option value="">Ingen fas</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input type="date" value={photo.day} max={today} aria-label="Flytta till dag" onChange={(e) => e.target.value && commit({ day: e.target.value })} disabled={pending} />
            </div>
          ) : null}
          <div className="doc-photo-bar">
            <button type="button" className="link-quiet" onClick={() => setMoving((m) => !m)}>
              {moving ? "Klar" : "Flytta"}
            </button>
            <Status status={status} error={error} />
            <button
              type="button"
              className="link-quiet doc-remove"
              onClick={() => window.confirm("Ta bort fotot? Det går inte att ångra.") && save(() => deletePhoto({ project, photo: photo.id }))}
            >
              Ta bort
            </button>
          </div>
        </>
      )}
    </li>
  );
}
