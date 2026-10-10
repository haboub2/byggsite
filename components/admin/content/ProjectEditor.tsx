"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField, useAllFieldErrors, useFieldError } from "./EditorForm";
import ImageUpload, { uploadPhoto, type StoredImage } from "../ImageUpload";
import { saveProject } from "@/app/admin/project-actions";
import { publicUrl } from "@/lib/storage-url";
import { slugify, type Project } from "@/lib/project-schema";

function ServiceSelect({
  value,
  onChange,
  services,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  services: { slug: string; title: string }[];
}) {
  const error = useFieldError("service");
  return (
    <div className={`efield${error ? " has-error" : ""}`}>
      <label htmlFor="p-service">Tjänst</label>
      <select id="p-service" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Ingen</option>
        {services.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.title}
          </option>
        ))}
      </select>
      <span className={error ? "efield-error" : "efield-hint"}>
        {error ?? "Projektet visas då också på tjänstens sida."}
      </span>
    </div>
  );
}

function ScopeList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div className="efield efield--wide">
      <label htmlFor="p-scope">Det här gjorde vi</label>
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
          id="p-scope"
          value={draft}
          placeholder="Två våtrum med tätskikt och golvvärme"
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
      <span className="efield-hint">En rad per punkt. Visas som en lista på projektsidan.</span>
    </div>
  );
}

function Gallery({ value, onChange }: { value: StoredImage[]; onChange: (v: StoredImage[]) => void }) {
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
        added.push({ path: await uploadPhoto(f, "projects"), alt: "" });
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

function MainPhotos({
  p,
  set,
}: {
  p: Project;
  set: <K extends keyof Project>(k: K) => (v: Project[K]) => void;
}) {
  // Errors come from the EditorForm context, so read them inside it.
  const coverError = useFieldError("cover");
  const coverAlt = useFieldError("cover.alt");
  const beforeAlt = useFieldError("before.alt");
  const afterAlt = useFieldError("after.alt");
  return (
    <div className="egrid egrid--three">
      <ImageUpload
        label="Omslagsbild (krävs för att publicera)"
        folder="projects"
        value={p.cover}
        onChange={set("cover")}
        error={coverError}
        altError={coverAlt}
      />
      <ImageUpload
        label="Före"
        folder="projects"
        value={p.before}
        onChange={set("before")}
        altError={beforeAlt}
        altPlaceholder="Badrummet före renoveringen"
      />
      <ImageUpload
        label="Efter"
        folder="projects"
        value={p.after}
        onChange={set("after")}
        altError={afterAlt}
        altPlaceholder="Samma badrum efter renoveringen"
      />
    </div>
  );
}

/** Field errors under a path prefix, e.g. "gallery" → { "0.alt": "…" }. */
function useFieldErrorsFor(prefix: string): Record<string, string> {
  const all = useAllFieldErrors();
  return Object.fromEntries(
    Object.entries(all)
      .filter(([k]) => k.startsWith(`${prefix}.`))
      .map(([k, v]) => [k.slice(prefix.length + 1), v])
  );
}


export default function ProjectEditor({
  initial,
  original,
  services,
}: {
  initial: Project;
  /** Slug of the saved project, or null when creating a new one. */
  original: string | null;
  services: { slug: string; title: string }[];
}) {
  const [p, setP] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(original));
  const set = <K extends keyof Project>(k: K) => (v: Project[K]) => setP((prev) => ({ ...prev, [k]: v }));

  return (
    <EditorForm
      action={saveProject}
      hidden={{ original: original ?? "" }}
      submitLabel={original ? "Spara" : "Skapa projekt"}
      value={p}
      initial={initial}
    >
      <fieldset className="efieldset">
        <legend>Projektet</legend>
        <div className="egrid">
          <TextField
            label="Titel"
            path="title"
            value={p.title}
            placeholder="Villa i Söndrum"
            onChange={(v) => setP((prev) => ({ ...prev, title: v, slug: slugTouched ? prev.slug : slugify(v) }))}
          />
          <TextField
            label="Adress på sajten"
            path="slug"
            value={p.slug}
            hint={`binaafy.se/bygg/projekt/${p.slug || "…"}`}
            onChange={(v) => {
              setSlugTouched(true);
              set("slug")(v.toLowerCase());
            }}
          />
          <ServiceSelect value={p.service} onChange={set("service")} services={services} />
          <TextField label="Ort" path="location" value={p.location} onChange={set("location")} placeholder="Söndrum, Halmstad" />
          <TextField
            label="År"
            path="year"
            inputMode="numeric"
            value={p.year ? String(p.year) : ""}
            onChange={(v) => set("year")(v ? Number(v.replace(/[^\d]/g, "")) || null : null)}
          />
          <TextField label="Byggtid" path="duration" value={p.duration} onChange={set("duration")} placeholder="11 veckor" />
          <TextArea
            label="Kort beskrivning"
            path="summary"
            value={p.summary}
            onChange={set("summary")}
            placeholder="Genomgående renovering av 1970-talsvilla — nytt kök, två badrum och öppen planlösning."
            hint="Visas på projektkortet, överst på projektsidan och i Google."
          />
          <ScopeList value={p.scope} onChange={set("scope")} />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Bilder</legend>
        <p className="efield-hint">
          Ta bilderna i dagsljus med raka linjer. Före- och efterbilden blir bäst tagna från samma plats.
        </p>
        <MainPhotos p={p} set={set} />
        <Gallery value={p.gallery} onChange={set("gallery")} />
      </fieldset>

      <fieldset className="efieldset">
        <legend>Kundens ord (valfritt)</legend>
        <div className="egrid">
          <TextArea
            label="Citat"
            path="testimonial.quote"
            value={p.testimonial?.quote ?? ""}
            onChange={(v) => set("testimonial")({ quote: v, author: p.testimonial?.author ?? "" })}
            placeholder="Allt blev klart i tid och de höll oss informerade varje vecka."
            hint="Använd bara kundens egna ord, och fråga om lov först."
          />
          <TextField
            label="Vem sa det"
            path="testimonial.author"
            value={p.testimonial?.author ?? ""}
            onChange={(v) => set("testimonial")({ quote: p.testimonial?.quote ?? "", author: v })}
            placeholder="Anna, Söndrum"
          />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Visning</legend>
        <label className="etoggle">
          <input type="checkbox" checked={p.published} onChange={(e) => set("published")(e.target.checked)} />
          <span>Publicerad — syns på sajten</span>
        </label>
        <label className="etoggle">
          <input type="checkbox" checked={p.featured} onChange={(e) => set("featured")(e.target.checked)} />
          <span>Utvald — visas på startsidan (de tre första utvalda)</span>
        </label>
      </fieldset>
    </EditorForm>
  );
}
