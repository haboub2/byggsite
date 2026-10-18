"use client";

import { useActionState, useId, useRef, useState } from "react";
import { addDocumentAction, postUpdate } from "@/app/admin/portal-actions";
import type { ContentActionState } from "@/app/admin/content-actions";
import { compressImage } from "@/components/admin/ImageUpload";
import { fileHref } from "@/lib/portal/files-href";
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABEL } from "@/lib/portal/schema";

/** Upload one file to the portal bucket; photos are shrunk in the browser first. */
async function uploadToPortal(project: string, kind: "image" | "document", file: File): Promise<string> {
  const body = new FormData();
  body.append("file", kind === "image" ? await compressImage(file) : file);
  body.append("project", project);
  body.append("kind", kind);
  const res = await fetch("/admin/upload", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !json.path) throw new Error(json.error ?? "Uppladdningen misslyckades.");
  return json.path;
}

/** "Ny uppdatering": a short text and any number of photos, straight from the phone camera. */
export function UpdateComposer({ project }: { project: string }) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ContentActionState, FormData>(postUpdate, {});

  // A successful post clears the composer (the form remounts via its key);
  // the page re-renders the list.
  const [doneAt, setDoneAt] = useState<string | undefined>();
  if (state.ok && state.savedAt && state.savedAt !== doneAt) {
    setDoneAt(state.savedAt);
    setPhotos([]);
  }

  async function take(files: FileList | null) {
    if (!files?.length) return;
    setProblem(null);
    for (const file of Array.from(files)) {
      setBusy((n) => n + 1);
      try {
        const path = await uploadToPortal(project, "image", file);
        setPhotos((p) => [...p, path]);
      } catch (err) {
        setProblem(err instanceof Error ? err.message : "Uppladdningen misslyckades.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (input.current) input.current.value = "";
  }

  return (
    <form key={doneAt ?? "new"} ref={form} action={action} className="portal-compose" noValidate>
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />
      <div className={`efield${state.fieldErrors?.body ? " has-error" : ""}`}>
        <label htmlFor={`${id}-body`}>Vad har hänt?</label>
        <textarea id={`${id}-body`} name="body" rows={3} maxLength={3000} placeholder="Tätskiktet är klart i duschzonen. Torktid till torsdag." />
        {state.fieldErrors?.body && <span className="efield-error">{state.fieldErrors.body}</span>}
      </div>
      {photos.length > 0 && (
        <ul className="portal-thumbs">
          {photos.map((p) => (
            <li key={p}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileHref(p)} alt="" />
              <button type="button" aria-label="Ta bort fotot" onClick={() => setPhotos((x) => x.filter((y) => y !== p))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="portal-compose-bar">
        <input ref={input} id={`${id}-photos`} type="file" accept="image/*" multiple capture="environment" className="sr-only" onChange={(e) => take(e.target.files)} />
        <label htmlFor={`${id}-photos`} className="btn btn-ghost">
          {busy ? `Laddar upp (${busy})…` : "Lägg till foton"}
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending || busy > 0}>
          {pending ? "Publicerar…" : "Publicera"}
        </button>
      </div>
      {(problem || state.error) && (
        <p className="form-feedback error" role="alert">
          {problem ?? state.error}
        </p>
      )}
    </form>
  );
}

/** "Lägg till dokument": a PDF with a type and a title. */
export function DocumentUploader({ project }: { project: string }) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [path, setPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ContentActionState, FormData>(addDocumentAction, {});

  const [doneAt, setDoneAt] = useState<string | undefined>();
  if (state.ok && state.savedAt && state.savedAt !== doneAt) {
    setDoneAt(state.savedAt);
    setPath("");
    setFileName("");
  }

  async function take(file: File | undefined) {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      setPath(await uploadToPortal(project, "document", file));
      setFileName(file.name);
      // Suggest the file name as title if none typed yet.
      const title = form.current?.elements.namedItem("title") as HTMLInputElement | null;
      if (title && !title.value) title.value = file.name.replace(/\.pdf$/i, "");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Uppladdningen misslyckades.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={doneAt ?? "new"} ref={form} action={action} className="portal-compose" noValidate>
      <input type="hidden" name="project" value={project} />
      <input type="hidden" name="path" value={path} />
      <div className="egrid egrid--three">
        <div className={`efield${state.fieldErrors?.kind ? " has-error" : ""}`}>
          <label htmlFor={`${id}-kind`}>Typ</label>
          <select id={`${id}-kind`} name="kind" defaultValue="other">
            {DOCUMENT_KINDS.filter((k) => k !== "quote").map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className={`efield${state.fieldErrors?.title ? " has-error" : ""}`}>
          <label htmlFor={`${id}-title`}>Rubrik</label>
          <input id={`${id}-title`} name="title" maxLength={120} placeholder="Faktura 1 — förskott" />
          {state.fieldErrors?.title && <span className="efield-error">{state.fieldErrors.title}</span>}
        </div>
        <div className={`efield${state.fieldErrors?.path ? " has-error" : ""}`}>
          <label htmlFor={`${id}-file`}>PDF (högst 4 MB)</label>
          <input id={`${id}-file`} type="file" accept="application/pdf" onChange={(e) => take(e.target.files?.[0])} />
          <span className={state.fieldErrors?.path ? "efield-error" : "efield-hint"}>
            {state.fieldErrors?.path ?? (busy ? "Laddar upp…" : fileName || "Välj en fil.")}
          </span>
        </div>
      </div>
      <div className="portal-compose-bar">
        <span />
        <button type="submit" className="btn btn-primary" disabled={pending || busy || !path}>
          {pending ? "Sparar…" : "Lägg till dokument"}
        </button>
      </div>
      {(problem || state.error) && (
        <p className="form-feedback error" role="alert">
          {problem ?? state.error}
        </p>
      )}
    </form>
  );
}
