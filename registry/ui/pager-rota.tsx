"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import {
  ArrowLeftRight,
  BellRing,
  Check,
  RotateCcw,
  TriangleAlert,
  UserRoundPlus,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type RotaPerson = {
  id: string;
  name: string;
  /** The person's wedge colour, any CSS colour. A filled shape: pass a pigment that reads in both themes. */
  color: string;
};

export type RotaShift = {
  id: string;
  person: string;
  /** ms since the epoch */
  start: number;
  /** ms since the epoch, exclusive */
  end: number;
};

export type RotaLayer = { id: string; label: string; shifts: RotaShift[] };

export type RotaOverride = {
  id: string;
  layer: string;
  /** Who covers. */
  person: string;
  start: number;
  end: number;
};

export type Rota = {
  people: RotaPerson[];
  /** Outermost first: the first layer is the one paged first. */
  layers: RotaLayer[];
  overrides: RotaOverride[];
};

export type RotaStatus = "ready" | "loading" | "error";
export type RotaDialStyle = "rings" | "solid" | "line";

/** One stretch of one layer as drawn: a shift, an override over it, or nobody. */
export type RotaSegment = {
  id: string;
  layer: string;
  kind: "shift" | "override" | "gap";
  person: string | null;
  start: number;
  end: number;
  /** The base shift underneath (shifts and overrides), for swaps and "covering for". */
  shift: string | null;
};

export type PagerRotaProps = {
  /** How the week is drawn: separate rings with gaps between shifts, rings that touch, or thin arcs with a dot at each handoff. @default "rings" */
  dialStyle?: RotaDialStyle;
  /** How many layers are shown, outermost first (1–3). @default 3 */
  layerCount?: number;
  /** The now-hand, the selection and Override, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Controlled rota. Changes are reported through `onRotaChange`. */
  rota?: Rota;
  /** Initial rota when uncontrolled. @default defaultRota */
  defaultRota?: Rota;
  /** Fires from the override or swap that changed the rota, with the whole rota. */
  onRotaChange?: (rota: Rota) => void;
  /** An override was added. */
  onOverride?: (override: RotaOverride) => void;
  /** Two shifts traded people: `a` and `b` as they are after the swap. */
  onSwap?: (a: RotaShift, b: RotaShift) => void;
  /** Page was pressed for the person on a segment. */
  onPage?: (person: RotaPerson, segment: RotaSegment) => void;
  /** The current time, ms; the hand points at it. Never read from the clock. @default defaultRotaNow */
  now?: number;
  /** Monday 00:00 of the week drawn, ms. @default defaultRotaWeekStart */
  weekStart?: number;
  /** Controlled selected segment id. */
  selected?: string | null;
  /** Initial selection when uncontrolled. @default the primary layer's segment at `now` */
  defaultSelected?: string | null;
  /** Fires from the key or press that moved the selection. */
  onSelectedChange?: (id: string) => void;
  /** Whether the rota has loaded. Loading draws an empty dial; error adds Retry. @default "ready" */
  status?: RotaStatus;
  /** Retry was pressed after the rota failed to load. */
  onRetry?: () => void;
  /** The team, in the header. @default "Gaugeworks platform" */
  team?: string;
  /** Height of the rota, px; its body scrolls inside it. @default 540 */
  height?: number;
  /** Nothing can be overridden, swapped or paged. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Monday 12 October 2026, 00:00 UTC. */
export const defaultRotaWeekStart = Date.UTC(2026, 9, 12);
/** Wednesday 14 October 2026, 10:00 UTC. */
export const defaultRotaNow = Date.UTC(2026, 9, 14, 10);

const W0 = defaultRotaWeekStart;
const at = (day: number, hour: number) => W0 + day * DAY + hour * HOUR;

export const defaultRota: Rota = {
  people: [
    {
      id: "ines",
      name: "Ines Marlow",
      color: "oklch(from var(--accent-bright) 0.78 0.11 h)",
    },
    {
      id: "tobi",
      name: "Tobi Achter",
      color: "oklch(from var(--signal) 0.8 0.11 h)",
    },
    {
      id: "ravi",
      name: "Ravi Okonjo",
      color: "oklch(from var(--danger) 0.78 0.12 h)",
    },
    {
      id: "mara",
      name: "Mara Lindqvist",
      color: "oklch(from var(--accent-bright) 0.78 0.11 315)",
    },
    {
      id: "noor",
      name: "Noor Haddad",
      color: "oklch(from var(--signal) 0.8 0.09 205)",
    },
    {
      id: "dana",
      name: "Dana Kell",
      color: "oklch(from var(--warn) 0.84 0.07 70)",
    },
    {
      id: "joss",
      name: "Joss Fairweather",
      color: "oklch(from var(--accent-bright) 0.8 0.08 240)",
    },
  ],
  layers: [
    {
      id: "primary",
      label: "Primary",
      shifts: [
        { id: "p0", person: "noor", start: at(0, 0), end: at(0, 9) },
        { id: "p1", person: "ines", start: at(0, 9), end: at(1, 9) },
        { id: "p2", person: "tobi", start: at(1, 9), end: at(2, 9) },
        { id: "p3", person: "ravi", start: at(2, 9), end: at(3, 9) },
        { id: "p4", person: "mara", start: at(3, 9), end: at(4, 9) },
        { id: "p5", person: "noor", start: at(4, 9), end: at(7, 0) },
      ],
    },
    {
      id: "secondary",
      label: "Secondary",
      shifts: [
        { id: "s1", person: "tobi", start: at(0, 0), end: at(3, 12) },
        { id: "s2", person: "mara", start: at(3, 12), end: at(5, 2) },
        { id: "s3", person: "ines", start: at(5, 8), end: at(7, 0) },
      ],
    },
    {
      id: "escalation",
      label: "Escalation",
      shifts: [
        { id: "e1", person: "dana", start: at(0, 0), end: at(3, 18) },
        { id: "e2", person: "joss", start: at(3, 18), end: at(7, 0) },
      ],
    },
  ],
  overrides: [
    {
      id: "ov-1",
      layer: "primary",
      person: "ines",
      start: at(2, 18),
      end: at(3, 0),
    },
  ],
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const ON_PIGMENT = "oklch(0.24 0.02 258)";
const ACCENT_PIGMENT = "oklch(from var(--pr-accent) 0.8 c h)";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");
/** Fixed 24-hour UTC clock: a locale lookup would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const dayName = (ms: number) => WEEKDAYS[new Date(ms).getUTCDay()] ?? "";
const stamp = (ms: number) => `${dayName(ms)} ${clock(ms)}`;
const sameDay = (a: number, b: number) =>
  Math.floor(a / DAY) === Math.floor(b / DAY);
const span = (a: number, b: number) =>
  sameDay(a, b - 1) ? `${stamp(a)}–${clock(b)}` : `${stamp(a)} – ${stamp(b)}`;
const hours = (ms: number) => {
  const h = Math.round(ms / HOUR);
  return h >= 48 && h % 24 === 0 ? `${h / 24} days` : `${h} h`;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Each layer's week as contiguous segments: its shifts clipped to the week,
 * nobody wherever no shift runs, and every override cut in over the top in
 * the order given, so a later override wins.
 */
export function rotaSegments(
  layer: RotaLayer,
  overrides: RotaOverride[],
  weekStart: number,
): RotaSegment[] {
  const weekEnd = weekStart + WEEK;
  const base: RotaSegment[] = [];
  let cursor = weekStart;
  const shifts = [...layer.shifts]
    .map((s) => ({
      ...s,
      start: Math.max(weekStart, s.start),
      end: Math.min(weekEnd, s.end),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const gap = (from: number, to: number) => ({
    id: `gap-${layer.id}-${from}`,
    layer: layer.id,
    kind: "gap" as const,
    person: null,
    start: from,
    end: to,
    shift: null,
  });
  for (const s of shifts) {
    if (s.start > cursor) base.push(gap(cursor, s.start));
    const start = Math.max(cursor, s.start);
    if (s.end > start) {
      base.push({
        id: s.id,
        layer: layer.id,
        kind: "shift",
        person: s.person,
        start,
        end: s.end,
        shift: s.id,
      });
      cursor = s.end;
    }
  }
  if (cursor < weekEnd) base.push(gap(cursor, weekEnd));

  let segs = base;
  for (const o of overrides) {
    if (o.layer !== layer.id) continue;
    const start = Math.max(weekStart, o.start);
    const end = Math.min(weekEnd, o.end);
    if (end <= start) continue;
    const next: RotaSegment[] = [];
    for (const s of segs) {
      if (s.end <= start || s.start >= end) {
        next.push(s);
        continue;
      }
      if (s.start < start) {
        next.push({ ...s, end: start });
      }
      if (s.start < end && s.end > start && !next.some((n) => n.id === o.id)) {
        next.push({
          id: o.id,
          layer: layer.id,
          kind: "override",
          person: o.person,
          start,
          end,
          shift: s.kind === "gap" ? null : s.shift,
        });
      }
      if (s.end > end) {
        next.push({ ...s, id: `${s.id}~${end}`, start: end });
      }
    }
    segs = next;
  }
  return segs;
}

/* ----------------------------------------------------------------------- */
/*                                Geometry                                 */
/* ----------------------------------------------------------------------- */

const VB = 340;
const CX = VB / 2;
const R_OUT = 134;
const R_IN = 62;

const angleOf = (t: number, weekStart: number) =>
  ((t - weekStart) / WEEK) * Math.PI * 2;
const polar = (r: number, a: number) =>
  [r2(CX + r * Math.sin(a)), r2(CX - r * Math.cos(a))] as const;

/** An annular sector, clockwise from a0 to a1 (radians from twelve o'clock). */
function sector(a0: number, a1: number, rOut: number, rIn: number): string {
  const sweep = a1 - a0;
  if (sweep <= 0) return "";
  if (sweep >= Math.PI * 2 - 1e-6) {
    // A full ring is two halves; one arc cannot start and end on one point.
    return (
      sector(a0, a0 + Math.PI, rOut, rIn) +
      sector(a0 + Math.PI, a0 + Math.PI * 2, rOut, rIn)
    );
  }
  const large = sweep > Math.PI ? 1 : 0;
  const [x0, y0] = polar(rOut, a0);
  const [x1, y1] = polar(rOut, a1);
  const [x2, y2] = polar(rIn, a1);
  const [x3, y3] = polar(rIn, a0);
  return `M${x0} ${y0}A${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${rIn} ${rIn} 0 ${large} 0 ${x3} ${y3}Z`;
}

/** A plain arc along one radius, for the line style. */
function arc(a0: number, a1: number, r: number): string {
  const sweep = a1 - a0;
  if (sweep <= 0) return "";
  if (sweep >= Math.PI * 2 - 1e-6) {
    return arc(a0, a0 + Math.PI, r) + arc(a0 + Math.PI, a0 + Math.PI * 2, r);
  }
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

function bands(count: number) {
  const gap = count > 1 ? 6 : 0;
  const band = Math.min(
    34,
    (R_OUT - R_IN - gap * Math.max(0, count - 1)) / Math.max(1, count),
  );
  return Array.from({ length: count }, (_, i) => {
    const outer = R_OUT - i * (band + gap);
    return { outer: r2(outer), inner: r2(outer - band) };
  });
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

type Part = "whole" | "first" | "second";

/**
 * An on-call week drawn as a dial: Monday at twelve o'clock, the week running
 * clockwise, one ring per layer cut into wedges in each engineer's colour,
 * with a now-hand and who is on call now, next and after that beside it.
 *
 * Adding an override (O, or Override on the selected shift) opens a notch in
 * the ring where the cover goes, and the new wedge, in the covering
 * engineer's colour, slides into it from 18px out along its bisector on
 * `springs.snap`, one crisp overshoot as it seats. When `now` moves the hand
 * ticks there on `springs.snap` too, unwrapped so it never runs backwards
 * round the dial, and its tip pulses once. Time nobody covers is hatched
 * and flagged.
 *
 * The dial is a grid, one tab stop: rows are layers and cells are segments.
 * Left and Right walk the week, Up and Down change layer at the same time,
 * Home and End jump, O overrides, S swaps with the next shift, P pages. Under
 * a 480px container the week becomes a linear schedule with the same keys.
 * Under reduced motion nothing travels: the hand jumps, the wedge fades in,
 * and the selection is an outline with no lift.
 */
export function PagerRota({
  dialStyle = "rings",
  layerCount = 3,
  accent = "var(--accent-bright)",
  rota,
  defaultRota: initialRota = defaultRota,
  onRotaChange,
  onOverride,
  onSwap,
  onPage,
  now = defaultRotaNow,
  weekStart = defaultRotaWeekStart,
  selected,
  defaultSelected,
  onSelectedChange,
  status = "ready",
  onRetry,
  team = "Gaugeworks platform",
  height = 540,
  disabled = false,
  className,
}: PagerRotaProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${safeId}-title`;
  const hatchId = `${safeId}-hatch`;

  const [own, setOwn] = React.useState<Rota>(initialRota);
  const current = rota ?? own;
  const ready = status === "ready";
  const visible = Math.max(1, Math.min(3, Math.round(layerCount)));
  const shownLayers = React.useMemo(
    () => current.layers.slice(0, visible),
    [current.layers, visible],
  );
  const ring = bands(shownLayers.length);
  const people = React.useMemo(
    () => new Map(current.people.map((p) => [p.id, p])),
    [current.people],
  );

  const segments = React.useMemo(
    () =>
      shownLayers.map((layer) =>
        rotaSegments(layer, current.overrides, weekStart),
      ),
    [current.overrides, shownLayers, weekStart],
  );
  const all = segments.flat();
  const gaps = all.filter((s) => s.kind === "gap");

  /* ------------------------------ selection ---------------------------- */

  const nowSegment =
    segments[0]?.find((s) => s.start <= now && now < s.end) ??
    segments[0]?.[0] ??
    null;
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected ?? nowSegment?.id ?? null,
  );
  const selectedId = selected === undefined ? ownSelected : selected;
  const sel =
    all.find((s) => s.id === selectedId) ?? nowSegment ?? all[0] ?? null;
  const select = (id: string) => {
    if (selected === undefined) setOwnSelected(id);
    onSelectedChange?.(id);
  };

  /* ------------------------------- rota edits -------------------------- */

  const [announcement, setAnnouncement] = React.useState("");
  const [fresh, setFresh] = React.useState<string | null>(null);
  const freshTimer = React.useRef<number | null>(null);
  const counter = React.useRef(current.overrides.length);
  const commit = (next: Rota) => {
    if (rota === undefined) setOwn(next);
    onRotaChange?.(next);
  };

  const [dialog, setDialog] = React.useState<{
    segment: RotaSegment;
    person: string;
    part: Part;
  } | null>(null);
  const gridRefs = React.useRef(new Map<string, HTMLDivElement>());
  const focusGrid = () => {
    for (const node of gridRefs.current.values()) {
      if (node.isConnected && node.offsetParent !== null) {
        node.focus();
        return;
      }
    }
  };

  const openOverride = (segment: RotaSegment | null) => {
    if (!segment || disabled || !ready) return;
    const first = current.people.find((p) => p.id !== segment.person);
    if (!first) return;
    setDialog({ segment, person: first.id, part: "whole" });
  };

  const addOverride = () => {
    if (!dialog) return;
    const { segment, person, part } = dialog;
    const mid =
      segment.start +
      Math.round((segment.end - segment.start) / 2 / HOUR) * HOUR;
    const start = part === "second" ? mid : segment.start;
    const end = part === "first" ? mid : segment.end;
    if (end <= start) return;
    counter.current += 1;
    const override: RotaOverride = {
      id: `ov-${segment.layer}-${counter.current}`,
      layer: segment.layer,
      person,
      start,
      end,
    };
    commit({ ...current, overrides: [...current.overrides, override] });
    onOverride?.(override);
    setFresh(override.id);
    if (freshTimer.current) window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFresh(null), 1200);
    setDialog(null);
    select(override.id);
    const who = people.get(person)?.name ?? person;
    setAnnouncement(
      `Override added: ${who} covers ${span(start, end)}${
        segment.person ? ` for ${people.get(segment.person)?.name ?? ""}` : ""
      }.`,
    );
    focusGrid();
  };

  const swapTarget = (segment: RotaSegment | null) => {
    if (!segment?.shift || segment.kind !== "shift") return null;
    const layer = current.layers.find((l) => l.id === segment.layer);
    if (!layer) return null;
    const sorted = [...layer.shifts].sort((a, b) => a.start - b.start);
    const i = sorted.findIndex((s) => s.id === segment.shift);
    const a = sorted[i];
    const b = sorted[i + 1];
    return a && b && a.person !== b.person ? { layer, a, b } : null;
  };
  const swap = () => {
    const target = swapTarget(sel);
    if (!target || disabled || !ready) return;
    const { layer, a, b } = target;
    const nextA = { ...a, person: b.person };
    const nextB = { ...b, person: a.person };
    commit({
      ...current,
      layers: current.layers.map((l) =>
        l.id === layer.id
          ? {
              ...l,
              shifts: l.shifts.map((s) =>
                s.id === a.id ? nextA : s.id === b.id ? nextB : s,
              ),
            }
          : l,
      ),
    });
    onSwap?.(nextA, nextB);
    setAnnouncement(
      `Swapped: ${people.get(nextA.person)?.name ?? ""} now has ${span(nextA.start, nextA.end)}, ${people.get(nextB.person)?.name ?? ""} has ${span(nextB.start, nextB.end)}.`,
    );
  };

  const [paged, setPaged] = React.useState<string | null>(null);
  const pagedTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (pagedTimer.current) window.clearTimeout(pagedTimer.current);
      if (freshTimer.current) window.clearTimeout(freshTimer.current);
    },
    [],
  );
  const page = () => {
    if (!sel?.person || disabled || !ready) return;
    const person = people.get(sel.person);
    if (!person) return;
    onPage?.(person, sel);
    setPaged(sel.id);
    setAnnouncement(`Paged ${person.name} at ${clock(now)}.`);
    if (pagedTimer.current) window.clearTimeout(pagedTimer.current);
    pagedTimer.current = window.setTimeout(() => setPaged(null), 2400);
  };

  /* -------------------------------- keys ------------------------------- */

  const onGridKey = (event: React.KeyboardEvent) => {
    if (!sel || !ready) return;
    const row = segments.findIndex((list) => list.some((s) => s.id === sel.id));
    const list = segments[row] ?? [];
    const i = list.findIndex((s) => s.id === sel.id);
    const key = event.key.toLowerCase();
    let next: RotaSegment | undefined;
    if (event.key === "ArrowRight")
      next = list[Math.min(list.length - 1, i + 1)];
    else if (event.key === "ArrowLeft") next = list[Math.max(0, i - 1)];
    else if (event.key === "Home") next = list[0];
    else if (event.key === "End") next = list[list.length - 1];
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const to = segments[row + (event.key === "ArrowUp" ? -1 : 1)];
      if (to) {
        const mid = (sel.start + sel.end) / 2;
        next = to.find((s) => s.start <= mid && mid < s.end) ?? to[0];
      } else {
        event.preventDefault();
        return;
      }
    } else if (key === "o" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      openOverride(sel);
      return;
    } else if (key === "s" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      swap();
      return;
    } else if (key === "p" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      page();
      return;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(sel.id);
      return;
    }
    if (!next) return;
    event.preventDefault();
    select(next.id);
  };

  /* ------------------------------ the hand ------------------------------ */

  const target = angleOf(now, weekStart);
  const hand = useMotionValue(target);
  const shownAngle = React.useRef(target);
  React.useEffect(() => {
    // Unwrapped: the hand always goes forward the short way, never backwards
    // round the whole week when the clock crosses Monday 00:00.
    const prev = shownAngle.current;
    const full = Math.PI * 2;
    let to = prev + ((((target - prev) % full) + full * 1.5) % full) - full / 2;
    if (Math.abs(to - prev) < 1e-9) to = prev;
    shownAngle.current = to;
    if (!motionSafe) {
      hand.jump(to);
      return;
    }
    const controls = animate(hand, to, springs.snap);
    return () => {
      controls.stop();
      hand.jump(to);
    };
  }, [hand, motionSafe, target]);
  const handTipX = useTransform(hand, (a) =>
    r2(CX + (R_OUT + 10) * Math.sin(a)),
  );
  const handTipY = useTransform(hand, (a) =>
    r2(CX - (R_OUT + 10) * Math.cos(a)),
  );
  const handBaseX = useTransform(hand, (a) =>
    r2(CX + (R_IN - 8) * Math.sin(a)),
  );
  const handBaseY = useTransform(hand, (a) =>
    r2(CX - (R_IN - 8) * Math.cos(a)),
  );
  const inWeek = now >= weekStart && now < weekStart + WEEK;
  const [tipX, tipY] = polar(R_OUT + 10, target);

  /* ------------------------------- now list ---------------------------- */

  const primary = segments[0] ?? [];
  const fromNow = primary.findIndex((s) => s.start <= now && now < s.end);
  const upcoming = (fromNow >= 0 ? primary.slice(fromNow) : primary).slice(
    0,
    3,
  );

  /* ------------------------------- drawing ----------------------------- */

  const colorOf = (s: RotaSegment) =>
    s.person ? (people.get(s.person)?.color ?? "var(--ink-3)") : "var(--warn)";
  const nameOf = (s: RotaSegment | null) =>
    s?.person ? (people.get(s.person)?.name ?? s.person) : "Nobody";
  const labelOf = (s: RotaSegment) => {
    const layer = current.layers.find((l) => l.id === s.layer)?.label ?? "";
    const base = s.shift
      ? current.layers
          .find((l) => l.id === s.layer)
          ?.shifts.find((x) => x.id === s.shift)
      : null;
    const covering =
      s.kind === "override" && base && base.person !== s.person
        ? `, covering for ${people.get(base.person)?.name ?? ""}`
        : "";
    const nowText = s.start <= now && now < s.end ? ", on call now" : "";
    return s.kind === "gap"
      ? `${layer}, uncovered, ${span(s.start, s.end)}`
      : `${layer}, ${nameOf(s)}, ${span(s.start, s.end)}${covering}${nowText}`;
  };

  const padPx = dialStyle === "rings" ? 1.6 : 0;
  const dayTicks = Array.from({ length: 7 }, (_, d) => {
    const a = (d / 7) * Math.PI * 2;
    const [x0, y0] = polar(R_OUT + 3, a);
    const [x1, y1] = polar(R_OUT + 9, a);
    const [lx, ly] = polar(R_OUT + 22, a + Math.PI / 7);
    return { d, x0, y0, x1, y1, lx, ly, label: WEEKDAYS[(d + 1) % 7] ?? "" };
  });
  const hourTicks = Array.from({ length: 28 }, (_, k) => k).filter(
    (k) => k % 4 !== 0,
  );

  const lift = (s: RotaSegment) => {
    if (!motionSafe || s.id !== sel?.id) return { x: 0, y: 0 };
    const mid = (angleOf(s.start, weekStart) + angleOf(s.end, weekStart)) / 2;
    return { x: r3(3 * Math.sin(mid)), y: r3(-3 * Math.cos(mid)) };
  };

  const dial = (
    <div
      ref={(node) => {
        if (node) gridRefs.current.set("dial", node);
        else gridRefs.current.delete("dial");
      }}
      role="grid"
      tabIndex={0}
      aria-label={`${team} rota, week of ${dayName(weekStart)} ${new Date(weekStart).getUTCDate()}`}
      aria-activedescendant={ready && sel ? `${safeId}-d-${sel.id}` : undefined}
      aria-describedby={`${safeId}-keys`}
      onKeyDown={onGridKey}
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[21rem] rounded-full",
        FOCUS_RING,
      )}
    >
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              className="stroke-warn"
              strokeWidth="1.4"
            />
          </pattern>
        </defs>

        {dayTicks.map((t) => (
          <g key={t.d} aria-hidden>
            <line
              x1={t.x0}
              y1={t.y0}
              x2={t.x1}
              y2={t.y1}
              className="stroke-hairline-strong"
              strokeWidth={1.25}
            />
            <text
              x={t.lx}
              y={t.ly}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-ink-3 font-mono"
              fontSize={10}
            >
              {t.label}
            </text>
          </g>
        ))}
        {hourTicks.map((k) => {
          const [x0, y0] = polar(R_OUT + 3, (k / 28) * Math.PI * 2);
          const [x1, y1] = polar(R_OUT + 5.5, (k / 28) * Math.PI * 2);
          return (
            <line
              key={k}
              aria-hidden
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              className="stroke-hairline"
              strokeWidth={1}
            />
          );
        })}

        {ring.map((b, li) =>
          dialStyle === "line" && ready ? (
            <circle
              key={`track-${li}`}
              aria-hidden
              cx={CX}
              cy={CX}
              r={r2((b.outer + b.inner) / 2)}
              fill="none"
              className="stroke-hairline-strong"
              strokeWidth={1}
            />
          ) : (
            <path
              key={`track-${li}`}
              aria-hidden
              d={sector(0, Math.PI * 2 - 1e-7, b.outer, b.inner)}
              className={cn(
                "fill-surface-2",
                !ready && "motion-safe:animate-pulse",
              )}
            />
          ),
        )}

        {ready
          ? shownLayers.map((layer, li) => {
              const b = ring[li];
              if (!b) return null;
              const mid = (b.outer + b.inner) / 2;
              return (
                <g key={layer.id} role="row" aria-label={layer.label}>
                  {(segments[li] ?? []).map((s) => {
                    const a0 = angleOf(s.start, weekStart);
                    const a1 = angleOf(s.end, weekStart);
                    const p = padPx / mid;
                    const isSel = s.id === sel?.id;
                    const isFresh = s.id === fresh;
                    const bis = (a0 + a1) / 2;
                    const l = lift(s);
                    const d =
                      dialStyle === "line"
                        ? arc(a0 + 0.012, a1 - 0.012, mid)
                        : sector(a0 + p, a1 - p, b.outer, b.inner);
                    const hit = sector(a0, a1, b.outer, b.inner);
                    // The line style's stroke, and the band the selection
                    // ring hugs: the arc's own width there, the band here.
                    const stroke = r2(Math.min(9, (b.outer - b.inner) * 0.36));
                    const hugOut =
                      dialStyle === "line"
                        ? mid + stroke / 2 + 3
                        : b.outer + 1.5;
                    const hugIn =
                      dialStyle === "line"
                        ? mid - stroke / 2 - 3
                        : b.inner - 1.5;
                    const cellId = `${safeId}-d-${s.id}`;
                    return (
                      <motion.g
                        key={s.id}
                        initial={
                          isFresh
                            ? motionSafe
                              ? {
                                  x: r3(18 * Math.sin(bis)),
                                  y: r3(-18 * Math.cos(bis)),
                                  opacity: 0,
                                }
                              : { x: 0, y: 0, opacity: 0 }
                            : false
                        }
                        animate={{ x: l.x, y: l.y, opacity: 1 }}
                        transition={{
                          x: motionSafe
                            ? { ...springs.snap, delay: isFresh ? 0.12 : 0 }
                            : { duration: 0 },
                          y: motionSafe
                            ? { ...springs.snap, delay: isFresh ? 0.12 : 0 }
                            : { duration: 0 },
                          opacity: {
                            duration: durations.fast,
                            delay: isFresh ? 0.12 : 0,
                          },
                        }}
                        onClick={() => select(s.id)}
                        className="cursor-pointer"
                      >
                        {s.kind === "gap" && dialStyle === "line" ? (
                          <path
                            d={arc(a0 + 0.012, a1 - 0.012, mid)}
                            fill="none"
                            className="stroke-warn"
                            strokeWidth={2.5}
                            strokeDasharray="2 3.5"
                            strokeLinecap="round"
                          />
                        ) : s.kind === "gap" ? (
                          <>
                            <path
                              d={sector(a0 + p, a1 - p, b.outer, b.inner)}
                              className="fill-[color-mix(in_oklab,var(--warn)_12%,transparent)]"
                            />
                            <path
                              d={sector(a0 + p, a1 - p, b.outer, b.inner)}
                              fill={`url(#${hatchId})`}
                              opacity={0.75}
                            />
                          </>
                        ) : dialStyle === "line" ? (
                          <path
                            d={d}
                            fill="none"
                            strokeWidth={stroke}
                            strokeLinecap="round"
                            style={{
                              stroke: colorOf(s),
                              transition: "stroke 320ms ease",
                            }}
                          />
                        ) : (
                          <path
                            d={d}
                            style={{
                              fill: colorOf(s),
                              transition: "fill 320ms ease",
                            }}
                            className={cn(
                              dialStyle === "solid" && "stroke-card",
                              "hover:brightness-105",
                            )}
                            strokeWidth={dialStyle === "solid" ? 1.25 : 0}
                          />
                        )}
                        {s.kind === "override" && dialStyle !== "line" ? (
                          <path
                            d={d}
                            fill="none"
                            className="stroke-card"
                            strokeWidth={1.75}
                            strokeLinejoin="round"
                          />
                        ) : null}
                        {dialStyle === "line" && s.kind !== "gap" ? (
                          <circle
                            cx={polar(mid, a0)[0]}
                            cy={polar(mid, a0)[1]}
                            r={2.5}
                            className="fill-card stroke-ink-3"
                            strokeWidth={1}
                          />
                        ) : null}
                        {s.kind === "gap" ? (
                          <g aria-hidden>
                            <path
                              d={(() => {
                                const [gx, gy] = polar(mid, bis);
                                return `M${gx} ${r2(gy - 6)}L${r2(gx + 6.5)} ${r2(gy + 5)}L${r2(gx - 6.5)} ${r2(gy + 5)}Z`;
                              })()}
                              style={{
                                fill: "oklch(from var(--warn) 0.84 c h)",
                              }}
                              className="stroke-card"
                              strokeWidth={1.5}
                              strokeLinejoin="round"
                            />
                            <path
                              d={(() => {
                                const [gx, gy] = polar(mid, bis);
                                return `M${gx} ${r2(gy - 2)}V${r2(gy + 1.4)}M${gx} ${r2(gy + 3)}V${r2(gy + 3.2)}`;
                              })()}
                              stroke={ON_PIGMENT}
                              strokeWidth={1.3}
                              strokeLinecap="round"
                            />
                          </g>
                        ) : null}
                        <path
                          id={cellId}
                          role="gridcell"
                          aria-selected={isSel}
                          aria-label={labelOf(s)}
                          d={hit}
                          fill="transparent"
                        />
                        {isSel ? (
                          <path
                            aria-hidden
                            d={sector(a0, a1, hugOut, hugIn)}
                            fill="none"
                            className="stroke-(--pr-accent)"
                            strokeWidth={2}
                            strokeLinejoin="round"
                          />
                        ) : null}
                      </motion.g>
                    );
                  })}
                </g>
              );
            })
          : null}

        {ready && inWeek ? (
          <g aria-hidden className="pointer-events-none">
            <motion.line
              x1={handBaseX}
              y1={handBaseY}
              x2={handTipX}
              y2={handTipY}
              className="stroke-card"
              strokeWidth={5}
              strokeLinecap="round"
            />
            <motion.line
              x1={handBaseX}
              y1={handBaseY}
              x2={handTipX}
              y2={handTipY}
              className="stroke-(--pr-accent)"
              strokeWidth={2}
              strokeLinecap="round"
            />
            {motionSafe ? (
              <motion.circle
                key={now}
                cx={tipX}
                cy={tipY}
                className="fill-(--pr-accent)"
                initial={{ r: 3.5, opacity: 0.5 }}
                animate={{ r: 11, opacity: 0 }}
                transition={{
                  duration: durations.page,
                  ease: easings.enter,
                  delay: 0.18,
                }}
              />
            ) : null}
            <motion.circle
              cx={handTipX}
              cy={handTipY}
              r={4}
              className="fill-(--pr-accent) stroke-card"
              strokeWidth={1.5}
            />
          </g>
        ) : null}
      </svg>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="flex w-[34%] flex-col items-center text-center">
          {ready ? (
            <>
              <span className="text-[9.5px] tracking-[0.08em] text-ink-3 uppercase">
                On call now
              </span>
              <span className="mt-0.5 line-clamp-2 text-[12px] leading-tight font-semibold text-foreground">
                {inWeek && nowSegment ? nameOf(nowSegment) : "Not this week"}
              </span>
              {inWeek && nowSegment ? (
                <span className="mt-0.5 font-mono text-[10px] text-ink-3 tabular-nums">
                  until {clock(nowSegment.end)}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[11px] leading-tight text-ink-3">
              {status === "loading" ? "Loading rota" : "Couldn't load the rota"}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  const linear = (
    <div className="flex flex-col gap-2">
      <div aria-hidden className="relative ml-16 h-3">
        {Array.from({ length: 7 }, (_, d) => (
          <span
            key={d}
            className="absolute -translate-x-1/2 font-mono text-[9.5px] leading-none text-ink-3"
            style={{ left: `${r3(((d + 0.5) / 7) * 100)}%` }}
          >
            {(WEEKDAYS[(d + 1) % 7] ?? "").slice(0, 2)}
          </span>
        ))}
      </div>
      <div
        ref={(node) => {
          if (node) gridRefs.current.set("linear", node);
          else gridRefs.current.delete("linear");
        }}
        role="grid"
        tabIndex={0}
        aria-label={`${team} rota, week of ${dayName(weekStart)} ${new Date(weekStart).getUTCDate()}`}
        aria-activedescendant={
          ready && sel ? `${safeId}-l-${sel.id}` : undefined
        }
        aria-describedby={`${safeId}-keys`}
        onKeyDown={onGridKey}
        className={cn("relative flex flex-col gap-1.5 rounded-2", FOCUS_RING)}
      >
        {shownLayers.map((layer, li) => (
          <div
            key={layer.id}
            role="row"
            aria-label={layer.label}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className="w-14 shrink-0 truncate text-[11px] text-ink-3"
            >
              {layer.label}
            </span>
            <div
              className={cn(
                "relative h-7 min-w-0 flex-1 rounded-1",
                dialStyle !== "line" && "bg-surface-2",
              )}
            >
              {dialStyle === "line" ? (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-1/2 h-px bg-hairline-strong"
                />
              ) : null}
              {ready
                ? (segments[li] ?? []).map((s) => {
                    const left = r3(((s.start - weekStart) / WEEK) * 100);
                    const width = r3(((s.end - s.start) / WEEK) * 100);
                    const isSel = s.id === sel?.id;
                    return (
                      <motion.div
                        key={s.id}
                        id={`${safeId}-l-${s.id}`}
                        role="gridcell"
                        aria-selected={isSel}
                        aria-label={labelOf(s)}
                        onClick={() => select(s.id)}
                        initial={
                          s.id === fresh
                            ? {
                                opacity: 0,
                                y: motionSafe ? -distances.step : 0,
                              }
                            : false
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          y: motionSafe
                            ? { ...springs.snap, delay: 0.12 }
                            : { duration: 0 },
                          opacity: { duration: durations.fast, delay: 0.12 },
                        }}
                        className={cn(
                          // The strip draws the week the way the dial does:
                          // rounded wedges with gaps, touching wedges, or a
                          // thin line with a break at each handoff.
                          "absolute inset-y-0 isolate flex cursor-pointer items-center justify-center overflow-hidden text-[9.5px] font-semibold",
                          dialStyle === "rings" &&
                            "rounded-[5px] border-x-2 border-card",
                          dialStyle === "solid" && "border-x border-card",
                          dialStyle !== "line" &&
                            s.kind === "gap" &&
                            "bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--warn)_55%,transparent)_0_1.5px,color-mix(in_oklab,var(--warn)_10%,transparent)_1.5px_5px)]",
                          dialStyle !== "line" &&
                            s.kind === "override" &&
                            "border-y-2 border-dashed border-y-card",
                          isSel && "z-10 ring-2 ring-(--pr-accent)",
                        )}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          color: ON_PIGMENT,
                        }}
                      >
                        {s.kind === "gap" ? (
                          dialStyle === "line" ? (
                            <span
                              aria-hidden
                              className="absolute inset-x-1 top-1/2 -z-10 -translate-y-1/2 border-t-2 border-dashed border-warn"
                            />
                          ) : null
                        ) : (
                          <span
                            aria-hidden
                            className={cn(
                              "absolute -z-10",
                              dialStyle === "line"
                                ? "inset-x-0.5 top-1/2 h-2 -translate-y-1/2 rounded-full"
                                : "inset-0",
                            )}
                            style={{
                              backgroundColor: colorOf(s),
                              transition: "background-color 320ms ease",
                            }}
                          />
                        )}
                        {s.person && width > 6 && dialStyle !== "line"
                          ? initials(nameOf(s))
                          : null}
                        {s.kind === "gap" ? (
                          <TriangleAlert
                            aria-hidden
                            className="size-3 text-warn"
                          />
                        ) : null}
                      </motion.div>
                    );
                  })
                : null}
            </div>
          </div>
        ))}
        {ready && inWeek ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-y-1 w-[2px] rounded-full bg-(--pr-accent)"
            style={{
              left: `calc(4rem + (100% - 4rem) * ${r3((now - weekStart) / WEEK)})`,
              transition: motionSafe
                ? "left 300ms cubic-bezier(0.22,1,0.36,1)"
                : undefined,
            }}
          />
        ) : null}
      </div>
    </div>
  );

  const selPerson = sel?.person ? people.get(sel.person) : null;
  const selBase =
    sel?.shift && sel.kind === "override"
      ? current.layers
          .find((l) => l.id === sel.layer)
          ?.shifts.find((x) => x.id === sel.shift)
      : null;
  const canSwap = !!swapTarget(sel);
  const action = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors",
    FOCUS_RING,
  );

  const panel = (
    <div className="flex min-w-0 flex-col gap-3">
      {status === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)] px-3 py-2"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          <p className="min-w-0 flex-1 text-[12px] text-ink-2">
            The rota didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(action, "h-7")}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {ready && gaps.length ? (
        <button
          type="button"
          onClick={() => {
            const g = gaps[0];
            if (g) select(g.id);
          }}
          className={cn(
            "flex items-start gap-2 rounded-2 border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] px-3 py-2 text-left",
            FOCUS_RING,
          )}
        >
          <TriangleAlert
            aria-hidden
            className="mt-px size-3.5 shrink-0 text-warn"
          />
          <span className="flex min-w-0 flex-col text-[12px]">
            <span className="font-medium text-foreground">
              {gaps.length === 1
                ? "1 gap in cover"
                : `${gaps.length} gaps in cover`}
            </span>
            {gaps.slice(0, 2).map((g) => (
              <span key={g.id} className="text-ink-2">
                {current.layers.find((l) => l.id === g.layer)?.label} uncovered{" "}
                <span className="font-mono text-[11px] tabular-nums">
                  {span(g.start, g.end)}
                </span>
              </span>
            ))}
          </span>
        </button>
      ) : null}

      <div role="group" aria-label="Primary on call" className="flex flex-col">
        <span className="mb-1 text-[11px] font-medium text-ink-3">
          {shownLayers[0]?.label ?? "Primary"} on call
        </span>
        {ready ? (
          <ol className="flex flex-col divide-y divide-hairline rounded-2 border border-hairline">
            {upcoming.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(s.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-surface-1",
                    FOCUS_RING,
                    "focus-visible:outline-offset-0",
                  )}
                >
                  <span className="w-9 shrink-0 text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                    {i === 0 && fromNow >= 0
                      ? "Now"
                      : i === (fromNow >= 0 ? 1 : 0)
                        ? "Next"
                        : "After"}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-[9.5px] font-semibold",
                      !s.person &&
                        "bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--warn)_55%,transparent)_0_1.5px,transparent_1.5px_4px)]",
                    )}
                    style={
                      s.person
                        ? {
                            backgroundColor: colorOf(s),
                            color: ON_PIGMENT,
                            transition: "background-color 320ms ease",
                          }
                        : undefined
                    }
                  >
                    {s.person ? initials(nameOf(s)) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-foreground">
                      {s.person ? nameOf(s) : "Uncovered"}
                      {s.kind === "override" ? (
                        <span className="ml-1.5 text-[11px] text-ink-3">
                          override
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate font-mono text-[10.5px] text-ink-3 tabular-nums">
                      {i === 0 && fromNow >= 0
                        ? `until ${stamp(s.end)}`
                        : span(s.start, s.end)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div aria-hidden className="flex flex-col gap-1.5">
            {[0, 1, 2].map((k) => (
              <span
                key={k}
                className="h-11 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
          </div>
        )}
      </div>

      {ready && sel ? (
        <div
          role="group"
          aria-label="Selected shift"
          className="flex flex-col gap-2.5 rounded-3 bg-surface-1 p-3 ring-1 ring-hairline"
        >
          <div className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                !selPerson &&
                  "bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--warn)_55%,transparent)_0_1.5px,transparent_1.5px_4px)]",
              )}
              style={
                selPerson
                  ? {
                      backgroundColor: selPerson.color,
                      color: ON_PIGMENT,
                      transition: "background-color 320ms ease",
                    }
                  : undefined
              }
            >
              {selPerson ? (
                initials(selPerson.name)
              ) : (
                <TriangleAlert className="size-3.5 text-warn" />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium text-foreground">
                {selPerson ? selPerson.name : "Nobody on call"}
              </span>
              <span className="text-[11px] text-ink-3">
                {current.layers.find((l) => l.id === sel.layer)?.label} ·{" "}
                <span className="font-mono tabular-nums">
                  {span(sel.start, sel.end)}
                </span>{" "}
                · {hours(sel.end - sel.start)}
              </span>
              {selBase && selBase.person !== sel.person ? (
                <span className="text-[11px] text-ink-3">
                  Covering for {people.get(selBase.person)?.name}
                </span>
              ) : null}
            </span>
            {sel.start <= now && now < sel.end ? (
              <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-[color-mix(in_oklab,var(--pr-accent)_14%,transparent)] px-2 text-[10.5px] font-medium text-(--pr-accent)">
                Now
              </span>
            ) : null}
          </div>

          {dialog ? (
            <OverrideForm
              id={safeId}
              people={current.people.filter(
                (p) => p.id !== dialog.segment.person,
              )}
              person={dialog.person}
              part={dialog.part}
              segment={dialog.segment}
              onPerson={(person) =>
                setDialog((d) => (d ? { ...d, person } : d))
              }
              onPart={(part) => setDialog((d) => (d ? { ...d, part } : d))}
              onCancel={() => {
                setDialog(null);
                focusGrid();
              }}
              onConfirm={addOverride}
              motionSafe={motionSafe}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={page}
                aria-disabled={disabled || !selPerson || undefined}
                aria-keyshortcuts="P"
                className={cn(
                  action,
                  disabled || !selPerson
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <span aria-hidden className="relative flex size-3.5">
                  {paged === sel.id ? (
                    <motion.span
                      key="paged"
                      className="absolute inset-0 flex text-success"
                      initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    <BellRing className="size-3.5" />
                  )}
                </span>
                {paged === sel.id ? `Paged ${clock(now)}` : "Page"}
              </button>
              <button
                type="button"
                onClick={() => openOverride(sel)}
                aria-disabled={disabled || undefined}
                aria-keyshortcuts="O"
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-[12px] font-medium transition-[filter]",
                  FOCUS_RING,
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:brightness-105",
                )}
                style={{ backgroundColor: ACCENT_PIGMENT, color: ON_PIGMENT }}
              >
                <UserRoundPlus aria-hidden className="size-3.5" />
                {sel.kind === "gap" ? "Cover gap" : "Override"}
              </button>
              <button
                type="button"
                onClick={swap}
                aria-disabled={disabled || !canSwap || undefined}
                aria-keyshortcuts="S"
                className={cn(
                  action,
                  disabled || !canSwap
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <ArrowLeftRight aria-hidden className="size-3.5" />
                Swap
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--pr-accent" as string]: accent }}
    >
      <div className="flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
          <div className="min-w-0 flex-1 basis-40">
            <p id={titleId} className="truncate text-sm font-semibold">
              {team} on call
            </p>
            <p className="truncate text-[11px] text-ink-3">
              Week of {dayName(weekStart)} {new Date(weekStart).getUTCDate()} ·{" "}
              {shownLayers.length === 1
                ? "1 layer"
                : `${shownLayers.length} layers`}
            </p>
          </div>
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 font-mono text-[11px] text-ink-2 tabular-nums">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-(--pr-accent)"
            />
            {stamp(now)}
          </span>
        </header>
        <p id={`${safeId}-keys`} className="sr-only">
          Left and Right move through the week, Up and Down change layer. O adds
          an override, S swaps with the next shift, P pages.
        </p>
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <div className="grid grid-cols-1 gap-4 p-4 @min-[44rem]:grid-cols-[minmax(0,1fr)_16.5rem] @min-[44rem]:items-start">
            <div className="hidden @min-[30rem]:block">{dial}</div>
            <div className="@min-[30rem]:hidden">{linear}</div>
            {panel}
          </div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Override form                              */
/* ----------------------------------------------------------------------- */

function OverrideForm({
  id,
  people,
  person,
  part,
  segment,
  onPerson,
  onPart,
  onCancel,
  onConfirm,
  motionSafe,
}: {
  id: string;
  people: RotaPerson[];
  person: string;
  part: Part;
  segment: RotaSegment;
  onPerson: (id: string) => void;
  onPart: (part: Part) => void;
  onCancel: () => void;
  onConfirm: () => void;
  motionSafe: boolean;
}) {
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const partRefs = React.useRef(new Map<string, HTMLButtonElement>());
  // Focus lands on the chosen engineer when the form opens, once.
  const opening = React.useRef(person);
  React.useEffect(() => {
    refs.current.get(opening.current)?.focus();
  }, []);
  const parts: { value: Part; label: string }[] = [
    { value: "whole", label: "Whole shift" },
    { value: "first", label: "First half" },
    { value: "second", label: "Second half" },
  ];
  const roving = (
    list: string[],
    current: string,
    key: string,
    set: (v: string) => void,
    map: Map<string, HTMLButtonElement>,
  ) => {
    const i = list.indexOf(current);
    const step =
      key === "ArrowRight" || key === "ArrowDown"
        ? 1
        : key === "ArrowLeft" || key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return false;
    const next = list[(i + step + list.length) % list.length];
    if (next === undefined) return false;
    set(next);
    map.get(next)?.focus();
    return true;
  };
  return (
    <motion.div
      role="dialog"
      aria-labelledby={`${id}-ov-title`}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: motionSafe ? springs.snap : { duration: 0 },
        opacity: { duration: durations.fast },
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      className="flex flex-col gap-2.5 border-t border-hairline pt-2.5"
    >
      <p
        id={`${id}-ov-title`}
        className="text-[12px] font-medium text-foreground"
      >
        {segment.kind === "gap" ? "Who covers the gap?" : "Who covers?"}
      </p>
      <div
        role="radiogroup"
        aria-label="Covering engineer"
        className="flex flex-wrap gap-1.5"
      >
        {people.map((p) => {
          const checked = p.id === person;
          return (
            <button
              key={p.id}
              ref={(node) => {
                if (node) refs.current.set(p.id, node);
                else refs.current.delete(p.id);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onPerson(p.id)}
              onKeyDown={(event) => {
                if (
                  roving(
                    people.map((x) => x.id),
                    person,
                    event.key,
                    onPerson,
                    refs.current,
                  )
                ) {
                  event.preventDefault();
                }
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-1 text-[11.5px] transition-colors",
                FOCUS_RING,
                checked
                  ? "border-(--pr-accent) bg-card text-foreground"
                  : "border-hairline text-ink-2 hover:text-foreground",
              )}
            >
              <span
                aria-hidden
                className="flex size-5 items-center justify-center rounded-full text-[8.5px] font-semibold"
                style={{ backgroundColor: p.color, color: ON_PIGMENT }}
              >
                {initials(p.name)}
              </span>
              {p.name.split(" ")[0]}
            </button>
          );
        })}
      </div>
      <div
        role="radiogroup"
        aria-label="Which part"
        className="grid grid-cols-3 gap-0.5 rounded-2 bg-surface-2 p-0.5"
      >
        {parts.map((o) => {
          const checked = o.value === part;
          return (
            <button
              key={o.value}
              ref={(node) => {
                if (node) partRefs.current.set(o.value, node);
                else partRefs.current.delete(o.value);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onPart(o.value)}
              onKeyDown={(event) => {
                if (
                  roving(
                    parts.map((x) => x.value),
                    part,
                    event.key,
                    (v) => onPart(v as Part),
                    partRefs.current,
                  )
                ) {
                  event.preventDefault();
                }
              }}
              className={cn(
                "relative isolate flex h-7 items-center justify-center rounded-[5px] px-1 text-[11px] whitespace-nowrap transition-colors",
                FOCUS_RING,
                checked
                  ? "font-medium text-foreground"
                  : "text-ink-3 hover:text-ink-2",
              )}
            >
              {checked ? (
                <motion.span
                  layoutId={`${id}-part-pill`}
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-[5px] bg-card ring-1 ring-hairline"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "inline-flex h-8 items-center rounded-2 px-2.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium hover:brightness-105",
            FOCUS_RING,
          )}
          style={{ backgroundColor: ACCENT_PIGMENT, color: ON_PIGMENT }}
        >
          <Check aria-hidden className="size-3.5" />
          Add override
        </button>
      </div>
    </motion.div>
  );
}
