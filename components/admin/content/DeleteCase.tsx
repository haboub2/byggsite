"use client";

import { deleteCase } from "@/app/admin/case-actions";

export default function DeleteCase({ slug, title }: { slug: string; title: string }) {
  return (
    <form
      action={deleteCase}
      className="danger-zone"
      onSubmit={(e) => {
        if (!window.confirm(`Ta bort ”${title}” för gott? Det går inte att ångra.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <div>
        <strong>Ta bort caset</strong>
        <span className="efield-hint">Caset försvinner från sajten och från listan. Vill du bara dölja det, ta bort bocken för Publicerad.</span>
      </div>
      <button type="submit" className="btn btn-ghost">
        Ta bort
      </button>
    </form>
  );
}
