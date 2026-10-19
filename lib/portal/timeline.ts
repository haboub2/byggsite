import { formatDays, isIsoDate, nextWorkday, roundHalf, schedule, shiftWorkdays, workdaysBetween, type WorkCalendar } from "../workdays";
import type { ProjectPhase, TimelineShift } from "./schema";

/**
 * Tidplan 2.0 (docs/kundportal-v3.md, 1): the phase dates and the end date
 * computed from the project start, the phase durations and the delays.
 * Pure, so the admin editor can preview on the client what the server will
 * store. ÄTA time is already in the ÄTA's own phase; a delay adds its days
 * to the phase it was reported on, so every later phase moves with it.
 */

type PhaseInput = Pick<ProjectPhase, "id" | "duration_days" | "change_order_id">;
type ShiftInput = Pick<TimelineShift, "kind" | "phase_id" | "days">;

export type TimelineInput = {
  starts_on: string;
  works_saturdays: boolean;
  planned_ends_on: string;
  /** In order. */
  phases: PhaseInput[];
  shifts: ShiftInput[];
};

export type ComputedTimeline = {
  phases: { id: string; starts_on: string | null; ends_on: string | null }[];
  ends_on: string | null;
  planned_ends_on: string | null;
};

/** Delay days reported on each phase. */
export function delayDaysByPhase(shifts: ShiftInput[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of shifts) if (s.kind === "delay" && s.phase_id) out.set(s.phase_id, (out.get(s.phase_id) ?? 0) + roundHalf(s.days));
  return out;
}

/** A phase's length on the calendar: its planned duration plus its delays. */
export function effectiveDurations(phases: PhaseInput[], shifts: ShiftInput[]): number[] {
  const delays = delayDaysByPhase(shifts);
  return phases.map((p) => roundHalf(p.duration_days) + (delays.get(p.id) ?? 0));
}

/**
 * Dates for every phase and the project end. Without a start date nothing
 * has a date. The original end (planned_ends_on) follows the plan while
 * nothing has moved it; from the first delay or ÄTA on it stays put, so the
 * customer sees "Slut: 16 nov (ursprungligen 12 nov)". A project from before
 * Tidplan 2.0 that has shifts but no original end gets the plan without them.
 */
export function computeTimeline(input: TimelineInput): ComputedTimeline {
  const cal: WorkCalendar = { saturdays: input.works_saturdays };
  if (!isIsoDate(input.starts_on)) {
    return { phases: input.phases.map((p) => ({ id: p.id, starts_on: null, ends_on: null })), ends_on: null, planned_ends_on: input.planned_ends_on || null };
  }
  const { spans, ends_on } = schedule(input.starts_on, effectiveDurations(input.phases, input.shifts), cal);
  let planned: string | null = ends_on;
  if (input.shifts.length) {
    if (isIsoDate(input.planned_ends_on)) planned = input.planned_ends_on;
    else {
      const original = input.phases.filter((p) => !p.change_order_id).map((p) => roundHalf(p.duration_days));
      planned = schedule(input.starts_on, original, cal).ends_on;
    }
  }
  return {
    phases: input.phases.map((p, i) => ({ id: p.id, starts_on: spans[i].starts_on, ends_on: spans[i].ends_on })),
    ends_on,
    planned_ends_on: planned,
  };
}

/**
 * The phase a photo taken on `day` most likely belongs to: the one the
 * calendar has running that day; if the team is behind (a phase that should
 * be done isn't ticked) or ahead, the first phase not yet done; if all are
 * done, the last.
 */
export function phaseForDay<P extends Pick<ProjectPhase, "id" | "starts_on" | "ends_on" | "done_at">>(phases: P[], day: string): P | null {
  const open = phases.filter((p) => !p.done_at);
  if (overduePhases(open, day).length) return open[0];
  const running = open.find((p) => p.starts_on && p.ends_on && p.starts_on <= day && day <= p.ends_on);
  return running ?? open[0] ?? phases[phases.length - 1] ?? null;
}

/** Phases that by the calendar should have been done before `today` but aren't ticked. */
export function overduePhases<P extends Pick<ProjectPhase, "ends_on" | "done_at">>(phases: P[], today: string): P[] {
  return phases.filter((p) => !p.done_at && p.ends_on && p.ends_on < today);
}

/** "+2 dagar" / "+0,5 dag". */
export function shiftDaysLabel(days: number): string {
  return `+${formatDays(days)}`;
}

/** The text of a shift line the customer sees: the reason, verbatim. */
export function shiftLine(shift: Pick<TimelineShift, "days" | "reason">): string {
  return shift.reason ? `${shiftDaysLabel(shift.days)}, ${shift.reason}` : shiftDaysLabel(shift.days);
}

/** Name of the phase an ÄTA adds, within the 80 characters a phase name may have. */
export function changeOrderPhaseName(order: { number: number; title: string }): string {
  return `ÄTA ${order.number}: ${order.title}`.slice(0, 80);
}

/** Change orders the customer approved that take time but are not in the timeline yet. */
export function changeOrdersToSchedule<O extends { id: string; status: string; duration_days: number }>(orders: O[], phases: Pick<ProjectPhase, "change_order_id">[]): O[] {
  const placed = new Set(phases.map((p) => p.change_order_id).filter(Boolean));
  return orders.filter((o) => o.status === "approved" && roundHalf(o.duration_days) > 0 && !placed.has(o.id));
}

/**
 * Moving the start date re-plans the whole job, so the original end moves
 * with it by the same number of working days; only delays and ÄTA move the
 * end away from it. Returns the planned end unchanged when either start is
 * missing.
 */
export function movePlannedEnd(planned: string, oldStart: string, newStart: string, cal: WorkCalendar = {}): string {
  if (!isIsoDate(planned) || !isIsoDate(oldStart) || !isIsoDate(newStart) || oldStart === newStart) return planned;
  const moved = workdaysBetween(nextWorkday(oldStart, cal), nextWorkday(newStart, cal), cal);
  return shiftWorkdays(planned, moved, cal);
}
