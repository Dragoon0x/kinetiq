"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WorkroomCategory = {
  id: string;
  label: string;
  /** A CSS color for the event's edge mark. */
  color: string;
};

export type WorkroomEvent = {
  id: string;
  /** Day of the anchor month, 1-based. */
  day: number;
  title: string;
  categoryId: string;
  /** Pre-formatted time range, e.g. "06:40 – 08:00". */
  time?: string;
  note?: string;
};

export type CalendarWorkroomProps = {
  /** The month shown, fixed so the grid is deterministic. */
  anchor?: { year: number; month: number };
  monthLabel?: string;
  categories?: WorkroomCategory[];
  events?: WorkroomEvent[];
  /** Day the week face centres on. @default 12 */
  weekAnchorDay?: number;
  className?: string;
};

const DEFAULT_CATEGORIES: WorkroomCategory[] = [
  { id: "crews", label: "Crews", color: "var(--primary)" },
  { id: "gear", label: "Gear", color: "var(--warning, #b45309)" },
  { id: "arrivals", label: "Arrivals", color: "var(--success, #047857)" },
];

const DEFAULT_EVENTS: WorkroomEvent[] = [
  {
    id: "w1",
    day: 4,
    title: "Crew A rest window",
    categoryId: "crews",
    time: "06:00 – 14:00",
  },
  {
    id: "w2",
    day: 6,
    title: "Crane 2 inspection",
    categoryId: "gear",
    time: "09:00 – 11:30",
    note: "Yard 3 holds until it clears.",
  },
  {
    id: "w3",
    day: 11,
    title: "Fieldline berth",
    categoryId: "arrivals",
    time: "05:20",
  },
  {
    id: "w4",
    day: 12,
    title: "Handover drill",
    categoryId: "crews",
    time: "07:00 – 07:40",
  },
  {
    id: "w5",
    day: 13,
    title: "Reach stacker service",
    categoryId: "gear",
    time: "13:00 – 16:00",
  },
  {
    id: "w6",
    day: 14,
    title: "Basinworks berth",
    categoryId: "arrivals",
    time: "04:50",
    note: "Two gangs, tide permitting.",
  },
  {
    id: "w7",
    day: 19,
    title: "Crew B onboarding",
    categoryId: "crews",
    time: "08:00 – 12:00",
  },
  {
    id: "w8",
    day: 24,
    title: "Gate camera swap",
    categoryId: "gear",
    time: "10:00",
  },
  {
    id: "w9",
    day: 26,
    title: "Gaugeworks berth",
    categoryId: "arrivals",
    time: "06:10",
  },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Days in a month, leap-aware, without touching the wall clock. */
function daysIn(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Monday-first column (0..6) of the month's first day. */
function firstColumn(year: number, month: number) {
  return (new Date(year, month - 1, 1).getDay() + 6) % 7;
}

/**
 * The production calendar as a workroom, not a widget: a month face for
 * shape and a week face for the coming days, category chips whose counts
 * are derived from the events they filter, a peek panel for any event, and
 * inline create on the selected day. The anchor month is a prop — the grid
 * is computed, never read from the clock, so the same calendar renders on
 * the server and every visit.
 */
export function CalendarWorkroom({
  anchor = { year: 2026, month: 5 },
  monthLabel = "May 2026",
  categories = DEFAULT_CATEGORIES,
  events: eventsProp = DEFAULT_EVENTS,
  weekAnchorDay = 12,
  className,
}: CalendarWorkroomProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  const [face, setFace] = React.useState<"month" | "week">("month");
  const [activeCats, setActiveCats] = React.useState<string[]>([]);
  const [added, setAdded] = React.useState<WorkroomEvent[]>([]);
  const [peekId, setPeekId] = React.useState<string | null>(null);
  const [composeDay, setComposeDay] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState("");

  const events = React.useMemo(() => [...eventsProp, ...added], [
    eventsProp,
    added,
  ]);

  const counts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of categories) map[c.id] = 0;
    for (const e of events) map[e.categoryId] = (map[e.categoryId] ?? 0) + 1;
    return map;
  }, [categories, events]);

  const shown = React.useMemo(
    () =>
      activeCats.length === 0
        ? events
        : events.filter((e) => activeCats.includes(e.categoryId)),
    [events, activeCats],
  );

  const total = daysIn(anchor.year, anchor.month);
  const lead = firstColumn(anchor.year, anchor.month);
  const cells = Array.from({ length: lead + total }, (_, i) =>
    i < lead ? null : i - lead + 1,
  );

  // The week face holds the Monday-aligned run containing the anchor day.
  const weekStart =
    weekAnchorDay - ((firstColumn(anchor.year, anchor.month) + weekAnchorDay - 1) % 7);
  const weekDays = Array.from({ length: 7 }, (_, i) => weekStart + i).filter(
    (d) => d >= 1 && d <= total,
  );

  const byDay = (day: number) => shown.filter((e) => e.day === day);
  const catOf = (id: string) => categories.find((c) => c.id === id);
  const peek = events.find((e) => e.id === peekId) ?? null;

  const toggleCat = (id: string) =>
    setActiveCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const create = () => {
    const title = draft.trim();
    if (!title || composeDay == null) return;
    setAdded((prev) => [
      ...prev,
      {
        id: `new-${prev.length + 1}`,
        day: composeDay,
        title,
        categoryId: categories[0]?.id ?? "crews",
      },
    ]);
    setDraft("");
    setComposeDay(null);
  };

  const eventRow = (event: WorkroomEvent, dense: boolean) => {
    const cat = catOf(event.categoryId);
    return (
      <motion.button
        key={event.id}
        type="button"
        layout={motionSafe}
        initial={
          motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 1, scale: 1 }
        }
        animate={{ opacity: 1, scale: 1 }}
        exit={
          motionSafe
            ? {
                opacity: 0,
                scale: 0.95,
                transition: { duration: durations.fast, ease: easings.exit },
              }
            : { opacity: 0, transition: { duration: 0 } }
        }
        transition={motionSafe ? springs.snap : { duration: 0 }}
        onClick={() => setPeekId(event.id)}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-2 border border-hairline bg-surface-0 text-left",
          "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
          dense ? "px-1.5 py-0.5" : "px-2 py-1.5",
        )}
      >
        <span
          aria-hidden
          className="h-3 w-0.5 shrink-0 rounded-full"
          style={{ backgroundColor: cat?.color }}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-ink",
            dense ? "text-[10px]" : "text-xs",
          )}
        >
          {event.title}
        </span>
      </motion.button>
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
        <div className="rounded-4 border border-hairline bg-surface-1 shadow-raised">
          {/* Toolbar: the month, the faces, the chips. */}
          <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3">
            <h2
              id={headingId}
              className="mr-1 text-sm font-semibold tracking-tight text-ink"
            >
              {monthLabel}
            </h2>
            <span
              aria-hidden
              className="hidden items-center gap-0.5 text-ink-3 sm:flex"
            >
              <ChevronLeft className="size-3.5" />
              <ChevronRight className="size-3.5" />
            </span>

            <div
              role="tablist"
              aria-label="Calendar face"
              className="relative ml-auto flex rounded-3 border border-hairline bg-surface-0 p-0.5"
            >
              {(["month", "week"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={face === f}
                  onClick={() => setFace(f)}
                  className={cn(
                    "relative rounded-2 px-3 py-1 text-xs capitalize transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                    face === f ? "text-ink" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {face === f && (
                    <motion.span
                      layoutId="workroom-face"
                      aria-hidden
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                      className="absolute inset-0 rounded-2 border border-hairline bg-surface-2"
                    />
                  )}
                  <span className="relative">{f}</span>
                </button>
              ))}
            </div>

            <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
              {categories.map((cat) => {
                const on = activeCats.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCat(cat.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                      on
                        ? "border-hairline-strong bg-surface-2 text-ink"
                        : "border-hairline text-ink-3 hover:text-ink-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.label}
                    <span className="font-mono text-[10px] text-ink-3">
                      <Readout value={counts[cat.id] ?? 0} size="sm" />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* The face. Crossfade — month and week are the same room. */}
          <div className="relative p-3 sm:p-4">
            <AnimatePresence mode="wait" initial={false}>
              {face === "month" ? (
                <motion.div
                  key="month"
                  initial={motionSafe ? { opacity: 0 } : { opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: motionSafe ? durations.fast : 0,
                      ease: easings.exit,
                    },
                  }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  <div className="grid grid-cols-7 gap-px text-center text-label text-ink-3">
                    {WEEKDAYS.map((d) => (
                      <span key={d} className="py-1.5">
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-px overflow-hidden rounded-3 border border-hairline bg-hairline">
                    {cells.map((day, i) =>
                      day == null ? (
                        <span key={`lead-${i}`} className="bg-surface-1" />
                      ) : (
                        <div
                          key={day}
                          className={cn(
                            "group relative flex min-h-[76px] flex-col gap-1 bg-surface-0 p-1.5",
                            composeDay === day && "bg-surface-2",
                          )}
                        >
                          <span className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-ink-3">
                              {day}
                            </span>
                            <button
                              type="button"
                              aria-label={`Add an event on day ${day}`}
                              onClick={() => {
                                setComposeDay(day);
                                setPeekId(null);
                              }}
                              className={cn(
                                "rounded-1 p-0.5 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100",
                                "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:opacity-100 focus-visible:outline-none",
                              )}
                            >
                              <Plus className="size-3" aria-hidden />
                            </button>
                          </span>
                          <AnimatePresence initial={false}>
                            {byDay(day).map((e) => eventRow(e, true))}
                          </AnimatePresence>
                        </div>
                      ),
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="week"
                  initial={motionSafe ? { opacity: 0 } : { opacity: 1 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: motionSafe ? durations.fast : 0,
                      ease: easings.exit,
                    },
                  }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                  className="grid grid-cols-2 gap-px overflow-hidden rounded-3 border border-hairline bg-hairline sm:grid-cols-7"
                >
                  {weekDays.map((day, i) => (
                    <div
                      key={day}
                      className="flex min-h-[150px] flex-col gap-1.5 bg-surface-0 p-2"
                    >
                      <p className="text-label text-ink-3">
                        {WEEKDAYS[i % 7]}{" "}
                        <span className="font-mono">{day}</span>
                      </p>
                      <AnimatePresence initial={false}>
                        {byDay(day).map((e) => eventRow(e, false))}
                      </AnimatePresence>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* The desk drawer: peek or compose, one at a time, below the grid. */}
          <AnimatePresence initial={false}>
            {(peek || composeDay != null) && (
              <motion.div
                key={peek ? `peek-${peek.id}` : `compose-${composeDay}`}
                initial={
                  motionSafe ? { opacity: 0, y: 8 } : { opacity: 1, y: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: motionSafe ? durations.fast : 0,
                    ease: easings.exit,
                  },
                }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                className="border-t border-hairline px-4 py-3"
              >
                {peek ? (
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-1 h-8 w-0.5 shrink-0 rounded-full"
                      style={{ backgroundColor: catOf(peek.categoryId)?.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {peek.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-3">
                        Day {peek.day}
                        {peek.time ? ` · ${peek.time}` : ""} ·{" "}
                        {catOf(peek.categoryId)?.label}
                      </p>
                      {peek.note && (
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                          {peek.note}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Close event details"
                      onClick={() => setPeekId(null)}
                      className="rounded-2 p-1 text-ink-3 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      create();
                    }}
                  >
                    <span className="font-mono text-[11px] text-ink-3">
                      Day {composeDay}
                    </span>
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setComposeDay(null);
                      }}
                      placeholder="Name the event…"
                      aria-label={`New event on day ${composeDay}`}
                      className={cn(
                        "min-w-0 flex-1 rounded-2 border border-hairline bg-surface-0 px-2.5 py-1.5 text-sm text-ink",
                        "placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                      )}
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim()}
                      className={cn(
                        "rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink transition-colors",
                        "hover:bg-surface-0 disabled:cursor-not-allowed disabled:opacity-50",
                        "focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none",
                      )}
                    >
                      Put it on the board
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposeDay(null)}
                      className="text-xs text-ink-3 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--focus,var(--primary))] focus-visible:outline-none"
                    >
                      Never mind
                    </button>
                  </form>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
