"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField, useFieldError } from "./EditorForm";
import ImageUpload from "../ImageUpload";
import { Gallery, ListField, useFieldErrorsFor } from "./fields";
import { saveCase } from "@/app/admin/case-actions";
import { CASE_AREAS, CASE_PLATFORMS, CASE_STATUSES, slugify, type Case } from "@/lib/case-schema";

function AreaSelect({ value, onChange }: { value: Case["area"]; onChange: (v: Case["area"]) => void }) {
  return (
    <div className="efield">
      <label htmlFor="c-area">Område</label>
      <select id="c-area" value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Case["area"])}>
        <option value="">Inget</option>
        {CASE_AREAS.map((a) => (
          <option key={a.slug} value={a.slug}>
            {a.title}
          </option>
        ))}
      </select>
      <span className="efield-hint">Visas som etikett på kortet.</span>
    </div>
  );
}

function Choice<T extends string>({
  id,
  label,
  hint,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: T;
  options: readonly { slug: T; title: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="efield">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.title}
          </option>
        ))}
      </select>
      <span className="efield-hint">{hint}</span>
    </div>
  );
}

function Metrics({ value, onChange }: { value: Case["metrics"]; onChange: (v: Case["metrics"]) => void }) {
  const errors = useFieldErrorsFor("metrics");
  const listError = useFieldError("metrics");
  const update = (i: number, patch: Partial<Case["metrics"][number]>) =>
    onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div className="efield efield--wide">
      <span className="upload-label">Resultat (valfritt, högst fyra)</span>
      {value.map((m, i) => (
        <div className="egrid metric-edit" key={i}>
          <div className={`efield${errors[`${i}.value`] ? " has-error" : ""}`}>
            <label htmlFor={`m-v-${i}`}>Siffra</label>
            <input id={`m-v-${i}`} value={m.value} placeholder="−6 h" onChange={(e) => update(i, { value: e.target.value })} />
            {errors[`${i}.value`] && <span className="efield-error">{errors[`${i}.value`]}</span>}
          </div>
          <div className={`efield${errors[`${i}.label`] ? " has-error" : ""}`}>
            <label htmlFor={`m-l-${i}`}>Vad siffran betyder</label>
            <input
              id={`m-l-${i}`}
              value={m.label}
              placeholder="manuellt arbete per vecka"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            {errors[`${i}.label`] && <span className="efield-error">{errors[`${i}.label`]}</span>}
          </div>
          <button type="button" className="link-quiet" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Ta bort
          </button>
        </div>
      ))}
      {value.length < 4 && (
        <button type="button" className="btn btn-ghost" onClick={() => onChange([...value, { value: "", label: "" }])}>
          Lägg till resultat
        </button>
      )}
      <span className={listError ? "efield-error" : "efield-hint"}>
        {listError ?? "Bara siffror ni kan stå för. De visas överst på casesidan."}
      </span>
    </div>
  );
}

/** Reads its error from the EditorForm context, so it must render inside the form. */
function CoverPhoto({ value, onChange }: { value: Case["cover"]; onChange: (v: Case["cover"]) => void }) {
  const altError = useFieldError("cover.alt");
  return (
    <ImageUpload
      label="Omslagsbild (valfritt)"
      folder="cases"
      value={value}
      onChange={onChange}
      altError={altError}
      altPlaceholder="Startsidan i kundportalen"
    />
  );
}

export default function CaseEditor({ initial, original }: { initial: Case; original: string | null }) {
  const [c, setC] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(original));
  const set = <K extends keyof Case>(k: K) => (v: Case[K]) => setC((prev) => ({ ...prev, [k]: v }));

  return (
    <EditorForm
      action={saveCase}
      hidden={{ original: original ?? "" }}
      submitLabel={original ? "Spara" : "Skapa case"}
      value={c}
      initial={initial}
    >
      <fieldset className="efieldset">
        <legend>Caset</legend>
        <div className="egrid">
          <TextField
            label="Titel"
            path="title"
            value={c.title}
            placeholder="Kundportal för Autobazar"
            onChange={(v) => setC((prev) => ({ ...prev, title: v, slug: slugTouched ? prev.slug : slugify(v) }))}
          />
          <TextField
            label="Adress på sajten"
            path="slug"
            value={c.slug}
            hint={`binaafy.se/mjukvara/case/${c.slug || "…"}`}
            onChange={(v) => {
              setSlugTouched(true);
              set("slug")(v.toLowerCase());
            }}
          />
          <TextField label="Kund" path="client" value={c.client} onChange={set("client")} placeholder="Autobazar" />
          <AreaSelect value={c.area} onChange={set("area")} />
          <Choice
            id="c-platform"
            label="Typ av produkt"
            hint="Visas på casesidan."
            value={c.platform}
            options={CASE_PLATFORMS}
            onChange={set("platform")}
          />
          <Choice
            id="c-status"
            label="Status"
            hint="”Under utveckling” visas som en etikett på kortet."
            value={c.status}
            options={CASE_STATUSES}
            onChange={set("status")}
          />
          <TextField label="Land (valfritt)" path="country" value={c.country} onChange={set("country")} placeholder="Sverige" />
          <TextField
            label="År (valfritt)"
            path="year"
            value={c.year === null ? "" : String(c.year)}
            inputMode="numeric"
            placeholder="2026"
            onChange={(v) => {
              const digits = v.replace(/\D/g, "").slice(0, 4);
              set("year")(digits ? Number(digits) : null);
            }}
          />
          <TextField
            label="Länk (valfritt)"
            path="url"
            value={c.url}
            onChange={set("url")}
            placeholder="https://www.exempel.se"
            hint="Till sajten eller tjänsten, om den är publik."
          />
          <TextField
            label="App Store (valfritt)"
            path="appStore"
            value={c.appStore}
            onChange={set("appStore")}
            placeholder="https://apps.apple.com/…"
          />
          <TextField
            label="Google Play (valfritt)"
            path="playStore"
            value={c.playStore}
            onChange={set("playStore")}
            placeholder="https://play.google.com/…"
          />
          <TextArea
            label="Kort beskrivning"
            path="summary"
            value={c.summary}
            onChange={set("summary")}
            placeholder="En kundportal där bilhandlarens kunder följer sin order och laddar ner dokument själva."
            hint="Visas på kortet, överst på casesidan och i Google."
          />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Berättelsen</legend>
        <div className="egrid">
          <TextArea
            label="Situationen innan"
            path="situation"
            value={c.situation}
            onChange={set("situation")}
            rows={5}
            placeholder="Vad var problemet? Vad kostade det i tid eller pengar?"
          />
          <TextArea
            label="Vad vi byggde"
            path="solution"
            value={c.solution}
            onChange={set("solution")}
            rows={6}
            placeholder="Hur löste ni det, och hur gick projektet till?"
            hint="Krävs för att publicera."
          />
          <ListField
            id="c-features"
            label="Det här byggde vi (valfritt)"
            placeholder="Chatt i realtid mellan köpare och säljare"
            hint="En funktion per rad, högst tio. Visas som en lista under ”Vad vi byggde”."
            value={c.features}
            onChange={set("features")}
          />
          <Metrics value={c.metrics} onChange={set("metrics")} />
          <ListField
            id="c-stack"
            label="Teknik"
            placeholder="Next.js"
            hint="En teknik per rad, t.ex. Next.js, Supabase, Vercel."
            value={c.stack}
            onChange={set("stack")}
          />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Bilder</legend>
        <p className="efield-hint">Skärmdumpar fungerar bra. Dölj kunduppgifter och annat som inte ska visas.</p>
        <div className="egrid">
          <CoverPhoto value={c.cover} onChange={set("cover")} />
        </div>
        <Gallery folder="cases" value={c.gallery} onChange={set("gallery")} />
      </fieldset>

      <fieldset className="efieldset">
        <legend>Kundens ord (valfritt)</legend>
        <div className="egrid">
          <TextArea
            label="Citat"
            path="testimonial.quote"
            value={c.testimonial?.quote ?? ""}
            onChange={(v) => set("testimonial")({ quote: v, author: c.testimonial?.author ?? "" })}
            placeholder="Vi sparar flera timmar i veckan och kunderna ringer mindre."
            hint="Använd bara kundens egna ord, och fråga om lov först."
          />
          <TextField
            label="Vem sa det"
            path="testimonial.author"
            value={c.testimonial?.author ?? ""}
            onChange={(v) => set("testimonial")({ quote: c.testimonial?.quote ?? "", author: v })}
            placeholder="Namn, roll, företag"
          />
        </div>
      </fieldset>

      <fieldset className="efieldset">
        <legend>Visning</legend>
        <label className="etoggle">
          <input type="checkbox" checked={c.published} onChange={(e) => set("published")(e.target.checked)} />
          <span>Publicerad — syns på sajten</span>
        </label>
        <label className="etoggle">
          <input type="checkbox" checked={c.featured} onChange={(e) => set("featured")(e.target.checked)} />
          <span>Utvald — visas på Software-startsidan</span>
        </label>
      </fieldset>
    </EditorForm>
  );
}
