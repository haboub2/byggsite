"use client";

import { useState } from "react";
import { EditorForm, TextField, useFieldError, type LastSaved } from "./EditorForm";
import ImageUpload from "../ImageUpload";
import type { Team, TeamMember } from "@/lib/content/schema";

function Member({
  i,
  m,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  i: number;
  m: TeamMember;
  count: number;
  onChange: (m: TeamMember) => void;
  onMove: (d: number) => void;
  onRemove: () => void;
}) {
  const altError = useFieldError(`members.${i}.photo.alt`);
  return (
    <fieldset className="efieldset member-edit">
      <legend>{m.name || "Ny person"}</legend>
      <div className="member-grid">
        <ImageUpload
          label="Porträtt"
          folder="team"
          ratio="4 / 5"
          value={m.photo}
          onChange={(photo) => onChange({ ...m, photo: photo && { ...photo, alt: photo.alt || m.name } })}
          altError={altError}
          altPlaceholder={m.name || "Namn Efternamn"}
        />
        <div className="member-fields">
          <TextField label="Namn" path={`members.${i}.name`} value={m.name} onChange={(v) => onChange({ ...m, name: v })} />
          <TextField label="Roll" path={`members.${i}.role`} value={m.role} onChange={(v) => onChange({ ...m, role: v })} placeholder="Byggingenjör" />
          <div className="efield">
            <label htmlFor={`side-${i}`}>Verksamhet</label>
            <select id={`side-${i}`} value={m.side} onChange={(e) => onChange({ ...m, side: e.target.value as TeamMember["side"] })}>
              <option value="bygg">Bygg</option>
              <option value="software">Software</option>
            </select>
          </div>
          <div className="member-tools">
            <button type="button" className="link-quiet" onClick={() => onMove(-1)} disabled={i === 0}>
              Flytta upp
            </button>
            <button type="button" className="link-quiet" onClick={() => onMove(1)} disabled={i === count - 1}>
              Flytta ner
            </button>
            <button type="button" className="link-quiet" onClick={onRemove}>
              Ta bort
            </button>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

export default function TeamEditor({ initial, lastSaved }: { initial: Team; lastSaved?: LastSaved }) {
  const [team, setTeam] = useState(initial);
  const members = team.members;
  const setMembers = (next: TeamMember[]) => setTeam({ members: next });

  return (
    <EditorForm lastSaved={lastSaved} contentKey="team" value={team} initial={initial}>
      {members.map((m, i) => (
        <Member
          key={i}
          i={i}
          m={m}
          count={members.length}
          onChange={(nm) => setMembers(members.map((x, j) => (j === i ? nm : x)))}
          onMove={(d) => {
            const j = i + d;
            if (j < 0 || j >= members.length) return;
            const next = [...members];
            [next[i], next[j]] = [next[j], next[i]];
            setMembers(next);
          }}
          onRemove={() => setMembers(members.filter((_, j) => j !== i))}
        />
      ))}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setMembers([...members, { name: "", role: "", side: "bygg", photo: null }])}
      >
        Lägg till person
      </button>
    </EditorForm>
  );
}
