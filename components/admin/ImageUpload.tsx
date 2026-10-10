"use client";

import { useId, useRef, useState } from "react";
import { publicUrl } from "@/lib/storage-url";

export type StoredImage = { path: string; alt: string };
type Folder = "projects" | "team";

const MAX_SIDE = 2400;

/** Resize to at most 2400 px on the long side and re-encode, so a 5 MB phone
 *  photo becomes a few hundred kB before it leaves the browser. Safari can't
 *  encode WebP from a canvas (it silently returns PNG), so fall back to JPEG. */
async function compress(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.82));
  let blob = await encode("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
  if (!blob) throw new Error("Kunde inte läsa bilden.");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `photo.${ext}`, { type: blob.type });
}

export async function uploadPhoto(file: File, folder: Folder): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Välj en bildfil.");
  const small = await compress(file);
  const body = new FormData();
  body.append("file", small);
  body.append("folder", folder);
  const res = await fetch("/admin/upload", { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !json.path) throw new Error(json.error ?? "Uppladdningen misslyckades.");
  return json.path;
}

/** One photo with its description: drop or pick, preview, replace, remove. */
export default function ImageUpload({
  label,
  folder,
  value,
  onChange,
  error,
  altError,
  ratio = "4 / 3",
  altPlaceholder = "Nytt kök med köksö i villa i Söndrum",
}: {
  label: string;
  folder: Folder;
  value: StoredImage | null;
  onChange: (v: StoredImage | null) => void;
  error?: string;
  altError?: string;
  ratio?: string;
  altPlaceholder?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const url = publicUrl(value?.path);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const path = await uploadPhoto(file, folder);
      onChange({ path, alt: value?.alt ?? "" });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Uppladdningen misslyckades.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={`upload${error ? " has-error" : ""}`}>
      <span className="upload-label" id={`${id}-l`}>
        {label}
      </span>
      <label
        htmlFor={id}
        className={`upload-drop${over ? " is-over" : ""}${url ? " has-image" : ""}`}
        style={{ aspectRatio: ratio }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files[0]);
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" />
        ) : (
          <span>{busy ? "Laddar upp…" : "Dra hit en bild eller klicka för att välja"}</span>
        )}
        {busy && url && <span className="upload-busy">Laddar upp…</span>}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-labelledby={`${id}-l`}
        onChange={(e) => take(e.target.files?.[0])}
      />
      {value && (
        <>
          <div className={`efield${altError ? " has-error" : ""}`}>
            <label htmlFor={`${id}-alt`}>Beskriv bilden (för Google och skärmläsare)</label>
            <input
              id={`${id}-alt`}
              value={value.alt}
              placeholder={altPlaceholder}
              onChange={(e) => onChange({ ...value, alt: e.target.value })}
            />
            {altError && <span className="efield-error">{altError}</span>}
          </div>
          <div className="upload-actions">
            <button type="button" className="link-quiet" onClick={() => input.current?.click()} disabled={busy}>
              Byt bild
            </button>
            <button type="button" className="link-quiet" onClick={() => onChange(null)} disabled={busy}>
              Ta bort
            </button>
          </div>
        </>
      )}
      {(problem || error) && <span className="efield-error">{problem ?? error}</span>}
    </div>
  );
}
