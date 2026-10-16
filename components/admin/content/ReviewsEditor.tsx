"use client";

import { useState } from "react";
import { EditorForm, TextArea, TextField, useFieldError, type LastSaved } from "./EditorForm";
import { parseTrustBox, type Reviews, type ReviewPlatform, type ReviewQuote } from "@/lib/content/schema";

const PLATFORMS = ["Trustpilot", "Google", "Reco"];

/** "4,8" → 4.8, "" → null. Keeps what the user typed until it parses. */
const toNumber = (v: string): number | null => {
  const n = Number(v.replace(",", ".").replace(/[^\d.]/g, ""));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

function Platform({
  i,
  p,
  onChange,
  onRemove,
}: {
  i: number;
  p: ReviewPlatform;
  onChange: (p: ReviewPlatform) => void;
  onRemove: () => void;
}) {
  const [rating, setRating] = useState(p.rating === null ? "" : String(p.rating).replace(".", ","));
  const [count, setCount] = useState(p.count === null ? "" : String(p.count));
  const updatedError = useFieldError(`platforms.${i}.updated`);
  const ratingError = useFieldError(`platforms.${i}.rating`);
  const countError = useFieldError(`platforms.${i}.count`);
  return (
    <fieldset className="efieldset">
      <legend>{p.name || "Ny plattform"}</legend>
      <div className="egrid">
        <TextField
          label="Plattform"
          path={`platforms.${i}.name`}
          value={p.name}
          placeholder="Trustpilot"
          onChange={(v) => onChange({ ...p, name: v })}
          hint="Trustpilot, Google eller Reco."
        />
        <TextField
          label="Länk till er sida på plattformen"
          path={`platforms.${i}.url`}
          value={p.url}
          placeholder="https://se.trustpilot.com/review/binaafy.se"
          onChange={(v) => onChange({ ...p, url: v })}
        />
        <TextField
          label="Länk för att skriva ett omdöme (valfritt)"
          path={`platforms.${i}.reviewUrl`}
          value={p.reviewUrl}
          placeholder="https://se.trustpilot.com/evaluate/binaafy.se"
          onChange={(v) => onChange({ ...p, reviewUrl: v })}
        />
        <div className={`efield${ratingError ? " has-error" : ""}`}>
          <label htmlFor={`r-rating-${i}`}>Betyg (1–5)</label>
          <input
            id={`r-rating-${i}`}
            inputMode="decimal"
            value={rating}
            placeholder="4,8"
            onChange={(e) => {
              setRating(e.target.value);
              onChange({ ...p, rating: toNumber(e.target.value) });
            }}
          />
          <span className={ratingError ? "efield-error" : "efield-hint"}>
            {ratingError ?? "Skriv av betyget exakt som plattformen visar det. Lämna tomt om ni inte har några omdömen än."}
          </span>
        </div>
        <div className={`efield${countError ? " has-error" : ""}`}>
          <label htmlFor={`r-count-${i}`}>Antal omdömen</label>
          <input
            id={`r-count-${i}`}
            inputMode="numeric"
            value={count}
            placeholder="12"
            onChange={(e) => {
              setCount(e.target.value);
              onChange({ ...p, count: toNumber(e.target.value) });
            }}
          />
          {countError && <span className="efield-error">{countError}</span>}
        </div>
        <div className={`efield${updatedError ? " has-error" : ""}`}>
          <label htmlFor={`r-updated-${i}`}>Siffrorna avlästa</label>
          <input id={`r-updated-${i}`} type="date" value={p.updated} onChange={(e) => onChange({ ...p, updated: e.target.value })} />
          <span className={updatedError ? "efield-error" : "efield-hint"}>
            {updatedError ?? "Visas som ”uppdaterat …” så att besökaren ser hur färska siffrorna är."}
          </span>
        </div>
      </div>
      <button type="button" className="link-quiet" onClick={onRemove}>
        Ta bort plattformen
      </button>
    </fieldset>
  );
}

function Quote({
  i,
  q,
  onChange,
  onRemove,
}: {
  i: number;
  q: ReviewQuote;
  onChange: (q: ReviewQuote) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="efieldset">
      <legend>{q.author || "Nytt citat"}</legend>
      <div className="egrid">
        <TextArea
          label="Citat"
          path={`quotes.${i}.quote`}
          value={q.quote}
          onChange={(v) => onChange({ ...q, quote: v })}
          hint="Kopiera ordagrant från omdömet. Korta gärna, men ändra inga ord."
        />
        <TextField label="Namn" path={`quotes.${i}.author`} value={q.author} onChange={(v) => onChange({ ...q, author: v })} placeholder="Anna S." />
        <TextField
          label="Plattform"
          path={`quotes.${i}.platform`}
          value={q.platform}
          onChange={(v) => onChange({ ...q, platform: v })}
          placeholder="Trustpilot"
        />
        <div className="efield">
          <label htmlFor={`q-rating-${i}`}>Stjärnor</label>
          <select
            id={`q-rating-${i}`}
            value={q.rating ?? ""}
            onChange={(e) => onChange({ ...q, rating: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Visa inte</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" className="link-quiet" onClick={onRemove}>
        Ta bort citatet
      </button>
    </fieldset>
  );
}

/** Paste the TrustBox snippet; only the two ids are kept. Renders inside the form for its errors. */
function TrustBoxField({ value, onChange }: { value: Reviews["trustbox"]; onChange: (v: Reviews["trustbox"]) => void }) {
  const [snippet, setSnippet] = useState("");
  const parsed = snippet.trim() ? parseTrustBox(snippet) : null;
  const buError = useFieldError("trustbox.businessUnitId");
  const tplError = useFieldError("trustbox.templateId");
  const tbError = buError ?? tplError;
  return (
    <fieldset className="efieldset">
      <legend>Trustpilots widget (valfritt)</legend>
      <p className="efield-hint">
        I Trustpilot Business: Integrationer → TrustBox-bibliotek → välj t.ex. ”Mini” → kopiera koden och klistra in
        den här. Widgeten visas på Omdömen-sidan för besökare som godkänt cookies; övriga ser betyget ni skrivit in ovan.
      </p>
      <div className="egrid">
        <div className={`efield efield--wide${tbError ? " has-error" : ""}`}>
          <label htmlFor="tb-snippet">TrustBox-kod</label>
          <textarea
            id="tb-snippet"
            rows={4}
            value={snippet}
            placeholder='<div class="trustpilot-widget" data-template-id="…" data-businessunit-id="…">'
            onChange={(e) => {
              setSnippet(e.target.value);
              const ids = parseTrustBox(e.target.value);
              if (ids) onChange(ids);
            }}
          />
          <span className={tbError ? "efield-error" : "efield-hint"}>
            {tbError ??
              (snippet.trim()
                ? parsed
                  ? "Koden känns igen. Spara för att använda den."
                  : "Hittar inga id:n i koden. Kopiera hela TrustBox-koden från Trustpilot."
                : value.businessUnitId
                  ? `Widget kopplad (konto ${value.businessUnitId.slice(0, 6)}…).`
                  : "Ingen widget kopplad.")}
          </span>
        </div>
      </div>
      {value.businessUnitId && (
        <button
          type="button"
          className="link-quiet"
          onClick={() => {
            setSnippet("");
            onChange({ businessUnitId: "", templateId: "" });
          }}
        >
          Koppla bort widgeten
        </button>
      )}
    </fieldset>
  );
}

export default function ReviewsEditor({ initial, lastSaved }: { initial: Reviews; lastSaved?: LastSaved }) {
  const [r, setR] = useState(initial);
  const setPlatforms = (platforms: ReviewPlatform[]) => setR((prev) => ({ ...prev, platforms }));
  const setQuotes = (quotes: ReviewQuote[]) => setR((prev) => ({ ...prev, quotes }));
  const missing = PLATFORMS.filter((n) => !r.platforms.some((p) => p.name.toLowerCase() === n.toLowerCase()));

  return (
    <EditorForm lastSaved={lastSaved} contentKey="reviews" value={r} initial={initial}>
      <h2 className="lead-h2">Plattformar</h2>
      {r.platforms.map((p, i) => (
        <Platform
          key={i}
          i={i}
          p={p}
          onChange={(np) => setPlatforms(r.platforms.map((x, j) => (j === i ? np : x)))}
          onRemove={() => setPlatforms(r.platforms.filter((_, j) => j !== i))}
        />
      ))}
      {r.platforms.length < 4 && (
        <div className="member-tools">
          {missing.map((name) => (
            <button
              key={name}
              type="button"
              className="btn btn-ghost"
              onClick={() => setPlatforms([...r.platforms, { name, url: "", reviewUrl: "", rating: null, count: null, updated: "" }])}
            >
              Lägg till {name}
            </button>
          ))}
        </div>
      )}

      <TrustBoxField value={r.trustbox} onChange={(trustbox) => setR((prev) => ({ ...prev, trustbox }))} />

      <h2 className="lead-h2">Utvalda citat</h2>
      <p className="efield-hint">Bara riktiga omdömen, ordagrant och med kundens namn som det står på plattformen.</p>
      {r.quotes.map((q, i) => (
        <Quote
          key={i}
          i={i}
          q={q}
          onChange={(nq) => setQuotes(r.quotes.map((x, j) => (j === i ? nq : x)))}
          onRemove={() => setQuotes(r.quotes.filter((_, j) => j !== i))}
        />
      ))}
      {r.quotes.length < 12 && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setQuotes([...r.quotes, { quote: "", author: "", platform: "", rating: null }])}
        >
          Lägg till citat
        </button>
      )}
    </EditorForm>
  );
}
