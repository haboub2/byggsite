"use client";

import { deleteInterestAction } from "@/app/admin/interest-actions";

export default function DeleteInterest({ id, company }: { id: string; company: string }) {
  return (
    <form
      action={deleteInterestAction}
      onSubmit={(e) => {
        if (!window.confirm(`Ta bort anmälan från ”${company}”? Det går inte att ångra.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-ghost interest-delete">
        Ta bort
      </button>
    </form>
  );
}
