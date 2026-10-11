"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField, useFieldError } from "./EditorForm";
import ImageUpload from "../ImageUpload";
import { Gallery, ListField } from "./fields";
import { saveProject } from "@/app/admin/project-actions";
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
            placeholder="Villa i Kungsbacka"
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
          <TextField label="Ort" path="location" value={p.location} onChange={set("location")} placeholder="Kungsbacka" />
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
          <ListField
            id="p-scope"
            label="Det här gjorde vi"
            placeholder="Två våtrum med tätskikt och golvvärme"
            hint="En rad per punkt. Visas som en lista på projektsidan."
            value={p.scope}
            onChange={set("scope")}
          />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Bilder</legend>
        <p className="efield-hint">
          Ta bilderna i dagsljus med raka linjer. Före- och efterbilden blir bäst tagna från samma plats.
        </p>
        <MainPhotos p={p} set={set} />
        <Gallery folder="projects" value={p.gallery} onChange={set("gallery")} />
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
            placeholder="Anna, Kungsbacka"
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
