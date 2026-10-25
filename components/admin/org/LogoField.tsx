"use client";

import { useId, useState } from "react";
import { LOGO_MAX_LENGTH } from "@/lib/core/org/settings";
import { useFieldError } from "../content/EditorForm";

const MAX_W = 600;
const MAX_H = 200;

/**
 * Shrink a logo to at most 600×200 and encode it as a data URI: PNG keeps a
 * transparent background; a PNG that is still too large becomes a JPEG on
 * white. The PDF renderer takes the data URI as it is.
 */
async function toLogoDataUri(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error("Välj en PNG-, JPEG- eller SVG-bild.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Kunde inte läsa bilden."));
      el.src = url;
    });
    const w = img.naturalWidth || MAX_W;
    const h = img.naturalHeight || MAX_H;
    const scale = Math.min(1, MAX_W / w, MAX_H / h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/png");
    if (data.length > LOGO_MAX_LENGTH) {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      data = canvas.toDataURL("image/jpeg", 0.85);
    }
    if (data.length > LOGO_MAX_LENGTH) throw new Error("Bilden blev för stor även förminskad. Prova en enklare logotyp.");
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The organisation's logo on invoices and quotes (org_settings.branding.logo). Saved with the rest of the settings. */
export default function LogoField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = useId();
  const error = useFieldError("branding.logo");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="efield efield--wide">
      <label htmlFor={id}>Logotyp</label>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- a data URI, nothing for next/image to optimise
        <img src={value} alt="Logotypen" className="logo-preview" />
      ) : (
        <span className="efield-hint">Ingen logotyp: företagsnamnet skrivs överst på fakturan i stället.</span>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setProblem(null);
            try {
              onChange(await toLogoDataUri(file));
            } catch (err) {
              setProblem(err instanceof Error ? err.message : "Kunde inte läsa bilden.");
            } finally {
              setBusy(false);
            }
          }}
        />
        {value && (
          <button type="button" className="link-quiet" onClick={() => onChange("")}>
            Ta bort logotypen
          </button>
        )}
      </div>
      <span className="efield-hint">PNG med genomskinlig bakgrund blir finast. Förminskas till högst 600 × 200 pixlar. Spara inställningarna efteråt.</span>
      {(problem || error) && <span className="efield-error">{problem || error}</span>}
    </div>
  );
}
