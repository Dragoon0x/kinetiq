"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Pin, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CohortMetric = "users" | "revenue";
export type CohortCascade = "diagonal" | "rows" | "columns";
export type CohortCurve = "area" | "line" | "off";
export type CohortStatus = "ready" | "loading" | "error";

export type Cohort = {
  id: string;
  /** The first day of the cohort's week, YYYY-MM-DD. */
  start: string;
  /** People who joined that week. */
  size: number;
  /** People active in week 0, 1, 2 … The last entry may be the week still under way. */
  users: number[];
  /** Revenue in week 0, 1, 2 …, in your currency. */
  revenue: number[];
};

export type CohortGridProps = {
  /** The order the cells fill in, and recolour in: along the diagonals, row by row, or week by week. Changing it replays the fill. @default "diagonal" */
  cascade?: CohortCascade;
  /** Controlled metric: users retained, or revenue as a share of week 0. */
  metric?: CohortMetric;
  /** Initial metric when uncontrolled. @default "users" */
  defaultMetric?: CohortMetric;
  /** Fires from the switch or key that changed the metric. */
  onMetricChange?: (metric: CohortMetric) => void;
  /** The summary curve over the grid: filled, a line, or none. @default "area" */
  curve?: CohortCurve;
  /** One per week of sign-ups, oldest first. @default defaultCohorts */
  cohorts?: Cohort[];
  /** Week columns shown. @default the longest cohort, at most 12 */
  weeks?: number;
  /** Today (Date or ms): the week each cohort is living through is marked in progress. @default defaultCohortNow */
  now?: number | Date;
  /** Controlled pinned cohort id, or null. The curve and the side panel hold it. */
  selected?: string | null;
  /** Initial pinned cohort when uncontrolled. @default null */
  defaultSelected?: string | null;
  /** Fires from the click or key that pinned or unpinned a cohort. */
  onSelectedChange?: (id: string | null) => void;
  /** Enter on a cell, or a click on it, with the cohort id and the week. */
  onCellSelect?: (cohortId: string, week: number) => void;
  /** The crosshair moved (pointer or keys) to a cell, or left the grid (null). */
  onCrosshairChange?: (cell: { cohortId: string; week: number } | null) => void;
  /** A cell's value (a share: 0.31 is 31%) as text. @default whole percent */
  format?: (value: number, metric: CohortMetric) => string;
  /** Money in readouts. @default US dollars, en-US */
  formatMoney?: (amount: number) => string;
  /** Cohort labels from YYYY-MM-DD. @default "Aug 3" */
  formatDate?: (iso: string) => string;
  /** Whether the cohorts have arrived. @default "ready" */
  status?: CohortStatus;
  /** "Try again" was pressed after the cohorts failed to load. */
  onRetry?: () => void;
  /** The grid's heading. @default "Retention" */
  title?: string;
  /** The grid's accessible name. @default the title */
  label?: string;
  /** A tick for each cell you step to or click, pitched by its value, and for a metric switch. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: cells still read out; nothing pins and the metric is fixed. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and scrolls inside itself. */
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const DAY_MS = 86_400_000;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const grouped = new Intl.NumberFormat("en-US");
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const msOf = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const shortDate = (iso: string) => {
  const d = new Date(msOf(iso));
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const percent = (v: number) => `${Math.round(v * 100)}%`;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------ default data ------------------------------ */

/** Wednesday 30 September 2026: the Sep 21 cohort is in its second week. */
export const defaultCohortNow = Date.UTC(2026, 8, 30, 12, 0);

/**
 * Ten weekly cohorts of Fieldline sign-ups from 20 July. Retention falls
 * fast and then flattens; a better onboarding from 17 August lifts every
 * cohort after it. Revenue dips as free users leave, then climbs back as the
 * people who stay start paying — the later weeks of the best cohorts earn
 * more than their first.
 */
export const defaultCohorts: Cohort[] = (() => {
  const rand = mulberry32(1316);
  const first = Date.UTC(2026, 6, 20);
  return Array.from({ length: 10 }, (_, k) => {
    const startMs = first + k * 7 * DAY_MS;
    const elapsed = (defaultCohortNow - startMs) / DAY_MS;
    const weeks = Math.min(10, Math.floor(elapsed / 7) + 1);
    const partial = elapsed / 7 - Math.floor(elapsed / 7);
    const lift = k >= 4 ? 1.12 : 1;
    const size = Math.round(1080 + rand() * 520);
    const users: number[] = [];
    const revenue: number[] = [];
    for (let w = 0; w < weeks; w += 1) {
      const live = w === weeks - 1 && Math.floor(elapsed / 7) === w;
      const keep =
        w === 0
          ? 1
          : Math.min(
              1,
              (0.21 + 0.24 * Math.exp(-(w - 1) / 2.8)) * lift +
                (rand() - 0.5) * 0.03,
            );
      const share = live ? 0.55 + 0.45 * partial : 1;
      const active = Math.round(size * keep * share);
      const paying = Math.min(0.7, 0.18 + 0.05 * w) * (k >= 4 ? 1.06 : 1);
      const spend = 3.1 * Math.pow(1.02, w) * (0.97 + rand() * 0.06);
      users.push(active);
      revenue.push(Math.round(active * paying * spend * 100) / 100);
    }
    return {
      id: `c${k + 1}`,
      start: new Date(startMs).toISOString().slice(0, 10),
      size,
      users,
      revenue,
    };
  });
})();

/* --------------------------------- tokens --------------------------------- */

/** Cells are pigment: the token's hue at a fixed lightness, mixed into the card. */
const PIGMENT: Record<CohortMetric, string> = {
  users: "oklch(from var(--accent-bright) 0.58 0.17 h)",
  revenue: "oklch(from var(--signal) 0.6 0.13 h)",
};
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";
const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const CURVE_H = 84;
const CURVE_PAD = 6;

type Geometry = {
  /** First week column's left edge and width, the column gap. */
  x0: number;
  cw: number;
  gx: number;
  /** First cohort row's top and height, the row gap. */
  y0: number;
  rh: number;
  gy: number;
  width: number;
};

type Cross = { r: number; w: number; via: "pointer" | "key" };

/* ------------------------------ rolling digits ----------------------------- */

function Digit({ d, motionSafe }: { d: number; motionSafe: boolean }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-clip">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-d * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block h-[1em] text-center leading-none">
            {i}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** Digits keyed from the right roll to their places; the rest stays put. */
function Roll({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex leading-none tabular-nums">
      {chars.map((ch, i) => {
        const k = chars.length - 1 - i;
        return /\d/.test(ch) ? (
          <Digit key={`d${k}`} d={Number(ch)} motionSafe={motionSafe} />
        ) : (
          <span key={`s${k}`} className="inline-block h-[1em] leading-none">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/* ---------------------------------- grid ---------------------------------- */

/**
 * A cohort retention triangle. Each row is a week of sign-ups, each column a
 * week since; cells fill in (scale and fade on `snap`) along the diagonals,
 * the rows or the columns — whichever `cascade` names — the whole sweep inside
 * 600ms. A metric switch slides its thumb on `snap` and recolours the grid in
 * the same order, each cell's colour a tween delayed by its place.
 *
 * Pointing at a cell (or the arrow keys) lays a row band and a column band
 * through it that ride between cells on `snap`; the curve above, which shares
 * the grid's week columns, morphs from the size-weighted average to that
 * cohort on `glide`, every point a spring from where it was, and carries on
 * as a dashed projection past the weeks the cohort has lived. Enter pins a
 * cohort, Escape lets it go. Under reduced motion the cells appear together,
 * recolour at once, and the bands and the curve jump — values, the
 * crosshair and the pinned cohort all still change.
 */
export function CohortGrid({
  cascade = "diagonal",
  metric,
  defaultMetric = "users",
  onMetricChange,
  curve = "area",
  cohorts = defaultCohorts,
  weeks,
  now = defaultCohortNow,
  selected,
  defaultSelected = null,
  onSelectedChange,
  onCellSelect,
  onCrosshairChange,
  format = (v: number) => percent(v),
  formatMoney = (n: number) => dollars.format(n),
  formatDate = shortDate,
  status = "ready",
  onRetry,
  title = "Retention",
  label,
  sound = false,
  disabled = false,
  className,
}: CohortGridProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const nowMs = typeof now === "number" ? now : now.getTime();

  const [ownMetric, setOwnMetric] = React.useState(defaultMetric);
  const shown: CohortMetric = metric ?? ownMetric;
  const [ownPin, setOwnPin] = React.useState(defaultSelected);
  const pinned = selected !== undefined ? selected : ownPin;
  const [cross, setCrossState] = React.useState<Cross | null>(null);
  const [active, setActive] = React.useState({ r: 0, w: 0 });
  const [geo, setGeo] = React.useState<Geometry | null>(null);
  const [table, setTable] = React.useState<HTMLDivElement | null>(null);
  const [curveBox, setCurveBox] = React.useState<HTMLDivElement | null>(null);
  const [curveW, setCurveW] = React.useState(480);
  const [edges, setEdges] = React.useState({ start: true, end: true });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const cells = React.useRef(new Map<string, HTMLDivElement>());
  const metricRefs = React.useRef(new Map<CohortMetric, HTMLButtonElement>());

  const W = clamp(
    Math.round(weeks ?? Math.max(1, ...cohorts.map((c) => c.users.length))),
    1,
    12,
  );
  const R = cohorts.length;

  /* -------------------------------- values -------------------------------- */

  const valueOf = (c: Cohort, w: number, m: CohortMetric): number | null => {
    if (m === "users") {
      const v = c.users[w];
      return v === undefined || c.size <= 0 ? null : v / c.size;
    }
    const v = c.revenue[w];
    const base = c.revenue[0];
    return v === undefined || !base ? null : v / base;
  };

  /** Whether a cohort's week is the one under way at `now`. */
  const liveWeek = (c: Cohort, w: number) => {
    const days = (nowMs - msOf(c.start)) / DAY_MS;
    return days >= 0 && Math.floor(days / 7) === w && days % 7 > 0;
  };

  const lengthOf = (c: Cohort | undefined) =>
    c ? Math.min(W, c.users.length) : 0;

  const stats = React.useMemo(() => {
    const avg = (m: CohortMetric) =>
      Array.from({ length: W }, (_, w) => {
        let num = 0;
        let den = 0;
        for (const c of cohorts) {
          const v = valueOf(c, w, m);
          // A week still under way would drag the average down.
          if (v === null || liveWeek(c, w)) continue;
          num += v * c.size;
          den += c.size;
        }
        return den ? num / den : null;
      });
    const peak = (m: CohortMetric) => {
      let p = 0;
      for (const c of cohorts) {
        for (let w = 1; w < W; w += 1) {
          const v = valueOf(c, w, m);
          if (v !== null) p = Math.max(p, v);
        }
      }
      return p || 1;
    };
    return {
      users: { avg: avg("users"), peak: peak("users") },
      revenue: { avg: avg("revenue"), peak: peak("revenue") },
    };
    // valueOf and liveWeek read only these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohorts, W, nowMs]);

  const peak = stats[shown].peak;
  const average = stats[shown].avg;
  const shade = (v: number) => Math.round(12 + 78 * clamp(v / peak, 0, 1));

  /* --------------------------------- curve -------------------------------- */

  const crossCohort = cross ? cohorts[cross.r] : undefined;
  const focusCohort =
    crossCohort ?? cohorts.find((c) => c.id === pinned) ?? undefined;

  // Values the curve is drawn from: the cohort where it has lived, then the
  // average's shape scaled from its last real week (the projection). The
  // domain rides along as the last entry, so a metric switch rescales in
  // the same morph.
  const curveTarget = (c: Cohort | undefined): number[] => {
    const avgFilled = average.map((v, w) => v ?? (w === 0 ? 1 : 0));
    const top = Math.max(1, peak) * 1.08;
    if (!c) return [...avgFilled, top];
    const len = lengthOf(c);
    const out: number[] = [];
    let last = 1;
    let lastW = 0;
    for (let w = 0; w < W; w += 1) {
      const v = w < len && !liveWeek(c, w) ? valueOf(c, w, shown) : null;
      if (v !== null) {
        out.push(v);
        last = v;
        lastW = w;
      } else {
        const ratio =
          (avgFilled[w] ?? 0) / Math.max(1e-6, avgFilled[lastW] ?? 1);
        out.push(last * ratio);
      }
    }
    return [...out, top];
  };
  const realWeeks = (c: Cohort | undefined) => {
    if (!c) return W;
    let n = 0;
    for (let w = 0; w < lengthOf(c); w += 1) {
      if (!liveWeek(c, w)) n = w + 1;
    }
    return Math.max(1, n);
  };

  const targetKey = `${shown}|${focusCohort?.id ?? "avg"}|${W}|${R}`;
  const target = curveTarget(focusCohort);
  const [morph, setMorph] = React.useState(() => ({
    key: targetKey,
    from: target,
    to: target,
    real: realWeeks(focusCohort),
  }));
  const mix = useMotionValue(1);
  if (morph.key !== targetKey) {
    // Retargeted mid-flight: the new morph starts from wherever the curve
    // is now, so a quick sweep across rows never snaps.
    const t = mix.get();
    setMorph({
      key: targetKey,
      from: morph.to.map((v, i) => lerp(morph.from[i] ?? v, v, t)),
      to: target,
      real: realWeeks(focusCohort),
    });
  }
  React.useEffect(() => {
    if (!motionSafe) {
      mix.jump(1);
      return;
    }
    // jump, not set: an instant reset must not read as velocity, or the
    // spring would start with a throw and fling the curve off the chart.
    mix.jump(0);
    const c = animate(mix, 1, { ...springs.glide, velocity: 0 });
    return () => c.stop();
  }, [morph.key, motionSafe, mix]);

  const cwCurve = geo ? geo.cw : (curveW - (W - 1) * 2) / W;
  const gxCurve = geo ? geo.gx : 2;
  const xAt = (w: number) => r2(w * (cwCurve + gxCurve) + cwCurve / 2);
  const crossW = useMotionValue(0);
  const crossR = useMotionValue(0);
  const crossOn = useMotionValue(0);

  const shape = useTransform(mix, (t) => {
    const pts = morph.to.map((v, i) => lerp(morph.from[i] ?? v, v, t));
    const top = pts[W] ?? 1.08;
    const y = (v: number) =>
      r2(CURVE_PAD + (1 - clamp(v / top, 0, 1.2)) * (CURVE_H - 2 * CURVE_PAD));
    const xy = pts.slice(0, W).map((v, w) => [xAt(w), y(v)] as const);
    const solidN = Math.min(W, morph.real);
    const solid = xy.slice(0, solidN);
    const dashed = xy.slice(Math.max(0, solidN - 1));
    const toPath = (list: readonly (readonly [number, number])[]) =>
      list.length ? `M ${list.map(([a, b]) => `${a} ${b}`).join(" L ")}` : "";
    const first = xy[0];
    const lastSolid = solid[solid.length - 1];
    return {
      solid: toPath(solid),
      dashed: dashed.length > 1 ? toPath(dashed) : "",
      area:
        solid.length && first && lastSolid
          ? `${toPath(solid)} L ${lastSolid[0]} ${CURVE_H} L ${first[0]} ${CURVE_H} Z`
          : "",
      avg: toPath(
        average.map((v, w) => [xAt(w), y(v ?? (w === 0 ? 1 : 0))] as const),
      ),
      ys: xy.map(([, b]) => b),
      full: y(1),
    };
  });
  const solidPath = useTransform(shape, (s) => s.solid);
  const dashedPath = useTransform(shape, (s) => s.dashed);
  const areaPath = useTransform(shape, (s) => s.area);
  const avgPath = useTransform(shape, (s) => s.avg);
  const fullY = useTransform(shape, (s) => s.full);
  const fullLabel = useTransform(shape, (s) => r2(s.full - 6));
  const dotX = useTransform(crossW, (w) => xAt(w));
  const dotY = useTransform(() => {
    const ys = shape.get().ys;
    return ys[clamp(Math.round(crossW.get()), 0, ys.length - 1)] ?? CURVE_H / 2;
  });
  const bandY = useTransform(crossR, (i) =>
    r2((geo?.y0 ?? 0) + i * ((geo?.rh ?? 0) + (geo?.gy ?? 0))),
  );
  const bandX = useTransform(crossW, (i) =>
    r2((geo?.x0 ?? 0) + i * ((geo?.cw ?? 0) + (geo?.gx ?? 0))),
  );

  /* -------------------------------- effects ------------------------------- */

  React.useEffect(() => {
    if (!table) return;
    const measure = () => {
      const cell = table.querySelector<HTMLElement>("[data-cg-cell='0-0']");
      const next = table.querySelector<HTMLElement>("[data-cg-cell='0-1']");
      const below = table.querySelector<HTMLElement>("[data-cg-cell='1-0']");
      if (!cell) return;
      const style = getComputedStyle(table);
      const gx = next
        ? next.offsetLeft - cell.offsetLeft - cell.offsetWidth
        : parseFloat(style.columnGap) || 0;
      const gy = below
        ? below.offsetTop - cell.offsetTop - cell.offsetHeight
        : parseFloat(style.rowGap) || 0;
      setGeo({
        x0: r2(cell.offsetLeft),
        cw: r2(cell.offsetWidth),
        gx: r2(gx),
        y0: r2(cell.offsetTop),
        rh: r2(cell.offsetHeight),
        gy: r2(gy),
        width: r2(table.scrollWidth),
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(table);
    return () => ro.disconnect();
  }, [table, W, R]);

  React.useEffect(() => {
    if (!curveBox) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setCurveW(r2(w));
    });
    ro.observe(curveBox);
    return () => ro.disconnect();
  }, [curveBox]);

  // The bands ride to the crosshair; the first sight of them is a jump.
  const crossKey = cross ? `${cross.r}:${cross.w}` : "";
  const bandsShown = React.useRef(false);
  React.useEffect(() => {
    if (!cross) {
      bandsShown.current = false;
      const fade = animate(crossOn, 0, {
        duration: durations.fast,
        ease: easings.exit,
      });
      return () => fade.stop();
    }
    const runs: AnimationPlaybackControls[] = [];
    if (!bandsShown.current || !motionSafe) {
      crossW.jump(cross.w);
      crossR.jump(cross.r);
    } else {
      runs.push(animate(crossW, cross.w, springs.snap));
      runs.push(animate(crossR, cross.r, springs.snap));
    }
    bandsShown.current = true;
    runs.push(
      animate(crossOn, 1, { duration: durations.fast, ease: easings.enter }),
    );
    return () => {
      for (const c of runs) c.stop();
    };
    // Moved once per cell; the cell is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossKey, motionSafe]);

  /* ------------------------------- handlers ------------------------------- */

  /** Moves the crosshair and tells the host, from the gesture that moved it. */
  const setCross = (next: Cross | null) => {
    setCrossState(next);
    if (next?.r === cross?.r && next?.w === cross?.w) return;
    const c = next ? cohorts[next.r] : undefined;
    onCrosshairChange?.(c && next ? { cohortId: c.id, week: next.w } : null);
  };

  const tick = (v: number | null, base = 0) =>
    audio.play("tick", {
      pitch: r2(semitones(base - 5 + 12 * clamp((v ?? 0) / peak, 0, 1))),
      gain: 0.35,
    });

  const chooseMetric = (m: CohortMetric) => {
    if (disabled || m === shown) return;
    if (metric === undefined) setOwnMetric(m);
    onMetricChange?.(m);
    audio.play("tick", { pitch: m === "revenue" ? 1.4 : 1.2, gain: 0.4 });
    say(
      m === "users" ? "Showing users retained." : "Showing revenue retained.",
    );
  };

  const pin = (id: string | null) => {
    if (disabled || id === pinned) return;
    if (selected === undefined) setOwnPin(id);
    onSelectedChange?.(id);
    const c = cohorts.find((x) => x.id === id);
    say(c ? `Pinned the ${formatDate(c.start)} cohort.` : "Unpinned.");
  };

  const moveTo = (r: number, w: number, via: Cross["via"]) => {
    const c = cohorts[r];
    if (!c) return;
    const ww = clamp(w, 0, lengthOf(c) - 1);
    if (ww < 0) return;
    const moved = r !== active.r || ww !== active.w;
    setActive({ r, w: ww });
    setCross({ r, w: ww, via });
    if (via === "key") {
      cells.current.get(`${r}-${ww}`)?.focus();
      // A key that hits the edge of the triangle stays silent.
      if (moved) tick(valueOf(c, ww, shown));
    }
  };

  const select = (r: number, w: number) => {
    const c = cohorts[r];
    if (!c || disabled) return;
    onCellSelect?.(c.id, w);
    tick(valueOf(c, w, shown), 2);
    pin(pinned === c.id ? null : c.id);
  };

  const onCellKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { r, w } = active;
    let to: [number, number] | null = null;
    const ctrl = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "ArrowRight":
        to = [r, w + 1];
        break;
      case "ArrowLeft":
        to = [r, w - 1];
        break;
      case "ArrowDown":
        to = [r + 1, w];
        break;
      case "ArrowUp":
        to = [r - 1, w];
        break;
      case "PageDown":
        to = [r + 5, w];
        break;
      case "PageUp":
        to = [r - 5, w];
        break;
      case "Home":
        to = ctrl ? [0, 0] : [r, 0];
        break;
      case "End":
        to = ctrl
          ? [R - 1, lengthOf(cohorts[R - 1]) - 1]
          : [r, lengthOf(cohorts[r]) - 1];
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(r, w);
        return;
      case "Escape":
        if (pinned) {
          event.preventDefault();
          pin(null);
        } else if (cross) {
          event.preventDefault();
          setCross(null);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    const [nr, nw] = to;
    const row = clamp(nr, 0, R - 1);
    // Stepping into a younger cohort lands on its last week.
    moveTo(row, clamp(nw, 0, lengthOf(cohorts[row]) - 1), "key");
  };

  /* --------------------------------- view --------------------------------- */

  const signature = cohorts.map((c) => `${c.id}:${c.users.length}`).join(",");
  const playKey = `${cascade}|${signature}|${W}`;
  const orderOf = (r: number, w: number) =>
    cascade === "rows" ? r : cascade === "columns" ? w : r + w;
  const span =
    cascade === "rows" ? R - 1 : cascade === "columns" ? W - 1 : R + W - 2;
  const stepS = Math.min(0.06, 0.6 / Math.max(1, span));

  const kpiWeeks = [1, 4, 8].filter((w) => w < W);
  const best = (() => {
    const w = Math.min(4, W - 1);
    let top: Cohort | null = null;
    let topV = -1;
    for (const c of cohorts) {
      const v =
        w < lengthOf(c) && !liveWeek(c, w) ? valueOf(c, w, shown) : null;
      if (v !== null && v > topV) {
        top = c;
        topV = v;
      }
    }
    return top ? { cohort: top, week: w, value: topV } : null;
  })();
  const cohortLabel = (c: Cohort) => formatDate(c.start);
  const firstC = cohorts[0];
  const lastC = cohorts[R - 1];
  const crossValue =
    cross && crossCohort ? valueOf(crossCohort, cross.w, shown) : null;

  // The pigment is one variable on the grid: a metric switch changes it once
  // and every cell's colour transition runs from there, each on its delay.
  const template = {
    ["--cg-weeks" as string]: W,
    ["--cg-pig" as string]: PIGMENT[shown],
  } as React.CSSProperties;
  const columns =
    "[grid-template-columns:3.75rem_repeat(var(--cg-weeks),minmax(2.25rem,1fr))] @min-[40rem]:[grid-template-columns:4.5rem_3.5rem_repeat(var(--cg-weeks),minmax(2.25rem,1fr))]";

  // Edge fades for the phone's scroller. The sticky cohort column stays
  // solid; the fade starts where the weeks slide under it.
  const fade: React.CSSProperties | undefined =
    edges.start && edges.end
      ? undefined
      : (() => {
          const image = `linear-gradient(to right, black 0 3.75rem, ${
            edges.start
              ? "black 3.75rem"
              : "transparent 3.75rem, black calc(3.75rem + 24px)"
          }, ${edges.end ? "black 100%" : "black calc(100% - 28px), transparent 100%"})`;
          return { maskImage: image, WebkitMaskImage: image };
        })();

  const readout = (() => {
    if (cross && crossCohort) {
      const abs =
        shown === "users"
          ? `${grouped.format(crossCohort.users[cross.w] ?? 0)} of ${grouped.format(crossCohort.size)}`
          : formatMoney(crossCohort.revenue[cross.w] ?? 0);
      const avg = average[cross.w];
      return (
        <>
          <span className="font-medium text-foreground">
            {cohortLabel(crossCohort)} · week {cross.w}
          </span>
          <span className="font-mono text-foreground tabular-nums">
            {crossValue === null ? "—" : format(crossValue, shown)}
          </span>
          <span className="truncate">
            {abs}
            {shown === "users" ? (
              <span className="hidden @min-[40rem]:inline"> users</span>
            ) : null}
          </span>
          {avg !== null && avg !== undefined ? (
            <span className="ml-auto hidden shrink-0 text-ink-3 @min-[40rem]:inline">
              avg {format(avg, shown)}
            </span>
          ) : null}
        </>
      );
    }
    return (
      <span className="truncate text-ink-3">
        <span className="@min-[40rem]:hidden">
          Tap a cell to read it and pin its cohort.
        </span>
        <span className="hidden @min-[40rem]:inline">
          Point at a cell, or use the arrow keys. Enter pins a cohort.
        </span>
      </span>
    );
  })();

  const switcher = (
    <span
      role="radiogroup"
      aria-label="Metric"
      className="relative inline-flex h-8 shrink-0 items-center gap-0.5 rounded-2 bg-surface-2 p-0.5"
    >
      {(["users", "revenue"] as const).map((m) => {
        const on = shown === m;
        return (
          <button
            key={m}
            ref={(node) => {
              if (node) metricRefs.current.set(m, node);
              else metricRefs.current.delete(m);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => chooseMetric(m)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                const next = m === "users" ? "revenue" : "users";
                metricRefs.current.get(next)?.focus();
                chooseMetric(next);
              }
            }}
            className={cn(
              "relative inline-flex h-7 items-center rounded-[5px] px-3 text-[12px] transition-colors",
              on
                ? "text-foreground"
                : "text-ink-3 enabled:hover:text-foreground",
              "disabled:cursor-not-allowed",
              RING_IN,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-metric`}
                aria-hidden
                className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">
              {m === "users" ? "Users" : "Revenue"}
            </span>
          </button>
        );
      })}
    </span>
  );

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-1 p-4">
          <p className="sr-only">Loading cohorts.</p>
          {Array.from({ length: 8 }, (_, r) => (
            <div key={r} className="flex gap-1">
              <span className="h-6 w-14 rounded-1 bg-surface-2" />
              {Array.from({ length: 8 - r }, (_, w) => (
                <span key={w} className="h-6 flex-1 rounded-1 bg-surface-2" />
              ))}
              {Array.from({ length: r }, (_, w) => (
                <span key={`e${w}`} className="h-6 flex-1" />
              ))}
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Cohorts did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (R === 0) {
      return (
        <p className="px-6 py-16 text-center text-sm text-ink-3">
          No cohorts yet.
        </p>
      );
    }

    const pinnedCohort = cohorts.find((c) => c.id === pinned) ?? null;
    const card = focusCohort ?? pinnedCohort ?? cohorts[R - 1];

    return (
      <div className="grid gap-3 p-3 @min-[40rem]:gap-4 @min-[40rem]:p-4 @min-[68rem]:grid-cols-[minmax(0,1fr)_17rem] @min-[68rem]:grid-rows-[auto_1fr]">
        {/* KPIs */}
        <dl className="hidden grid-cols-3 gap-3 @min-[40rem]:grid @min-[68rem]:col-start-2 @min-[68rem]:row-start-1 @min-[68rem]:grid-cols-1 @min-[68rem]:gap-2">
          {kpiWeeks.map((w) => {
            const v = average[w];
            return (
              <div
                key={w}
                className="flex items-baseline justify-between gap-2 rounded-3 border border-hairline bg-surface-1 px-3 py-2 @min-[68rem]:py-2.5"
              >
                <dt className="text-[11px] text-ink-3">Week {w} avg</dt>
                <dd className="font-mono text-[18px] leading-none text-foreground">
                  {v === null || v === undefined ? (
                    "—"
                  ) : (
                    <>
                      <Roll text={format(v, shown)} motionSafe={motionSafe} />
                      <span className="sr-only">{format(v, shown)}</span>
                    </>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* Heatmap */}
        <div className="min-w-0 @min-[68rem]:col-start-1 @min-[68rem]:row-span-2 @min-[68rem]:row-start-1">
          <div
            className="relative [scrollbar-width:thin] overflow-x-auto overscroll-x-contain"
            style={fade}
            onScroll={(event) => {
              const el = event.currentTarget;
              const start = el.scrollLeft <= 1;
              const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
              if (start !== edges.start || end !== edges.end) {
                setEdges({ start, end });
              }
            }}
            ref={(el) => {
              if (!el) return;
              const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
              if (end !== edges.end) setEdges((e) => ({ ...e, end }));
            }}
          >
            <div className="min-w-max @min-[40rem]:min-w-0">
              {curve !== "off" ? (
                <div
                  aria-hidden
                  className={cn("grid gap-x-0.5", columns)}
                  style={template}
                >
                  <div className="sticky left-0 z-10 bg-card pr-2 text-right font-mono text-[10px] leading-3 text-ink-3 tabular-nums">
                    <motion.span
                      className="absolute right-2 left-0"
                      style={{ y: fullLabel }}
                    >
                      {format(1, shown)}
                    </motion.span>
                    <span className="absolute right-2 bottom-0 left-0">
                      {format(0, shown)}
                    </span>
                  </div>
                  <div
                    ref={setCurveBox}
                    className="relative col-start-2 -col-end-1 @min-[40rem]:col-start-3"
                  >
                    <svg
                      width="100%"
                      height={CURVE_H}
                      className="block overflow-visible"
                    >
                      <line
                        x1={0}
                        x2="100%"
                        y1={CURVE_H - 0.5}
                        y2={CURVE_H - 0.5}
                        strokeWidth={1}
                        className="stroke-hairline-strong"
                      />
                      <motion.line
                        x1={0}
                        x2="100%"
                        y1={fullY}
                        y2={fullY}
                        strokeWidth={1}
                        strokeDasharray="1 3"
                        className="stroke-ink-3/50"
                      />
                      {focusCohort ? (
                        <motion.path
                          d={avgPath}
                          fill="none"
                          strokeWidth={1}
                          strokeDasharray="2 3"
                          className="stroke-ink-3/70"
                        />
                      ) : null}
                      {curve === "area" ? (
                        <motion.path
                          d={areaPath}
                          style={{
                            fill: `color-mix(in oklab, ${PIGMENT[shown]} 16%, transparent)`,
                          }}
                        />
                      ) : null}
                      <motion.path
                        d={dashedPath}
                        fill="none"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        strokeLinecap="round"
                        style={{ stroke: PIGMENT[shown] }}
                        opacity={0.7}
                      />
                      <motion.path
                        d={solidPath}
                        fill="none"
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        style={{ stroke: PIGMENT[shown] }}
                      />
                      <motion.line
                        x1={dotX}
                        x2={dotX}
                        y1={0}
                        y2={CURVE_H}
                        strokeWidth={1}
                        className="stroke-foreground/25"
                        style={{ opacity: crossOn }}
                      />
                      <motion.circle
                        cx={dotX}
                        cy={dotY}
                        r={3.5}
                        strokeWidth={1.5}
                        className="stroke-card"
                        style={{ fill: PIGMENT[shown], opacity: crossOn }}
                      />
                    </svg>
                  </div>
                </div>
              ) : null}

              <div
                ref={setTable}
                role="grid"
                aria-labelledby={titleId}
                aria-rowcount={R + 1}
                className={cn("relative mt-2 grid gap-0.5", columns)}
                style={template}
                onPointerLeave={(event) => {
                  if (event.pointerType === "mouse" && cross?.via === "pointer")
                    setCross(null);
                }}
              >
                {/* The crosshair: two bands that ride between cells. */}
                {geo ? (
                  <>
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute left-0 z-0 rounded-1 bg-foreground/6"
                      style={{
                        width: geo.width,
                        height: geo.rh,
                        top: 0,
                        y: bandY,
                        opacity: crossOn,
                      }}
                    />
                    <motion.span
                      aria-hidden
                      className="pointer-events-none absolute top-0 z-0 rounded-1 bg-foreground/6"
                      style={{
                        left: 0,
                        width: geo.cw,
                        height: "100%",
                        x: bandX,
                        opacity: crossOn,
                      }}
                    />
                  </>
                ) : null}

                <div role="row" aria-rowindex={1} className="contents">
                  <span
                    role="columnheader"
                    className="sticky left-0 z-10 flex h-6 items-center bg-card text-[11px] text-ink-3"
                  >
                    Cohort
                  </span>
                  <span
                    role="columnheader"
                    className="hidden h-6 items-center justify-end pr-1 text-[11px] text-ink-3 @min-[40rem]:flex"
                  >
                    Size
                  </span>
                  {Array.from({ length: W }, (_, w) => (
                    <span
                      key={w}
                      role="columnheader"
                      aria-label={`Week ${w}`}
                      className={cn(
                        "relative z-[1] flex h-6 items-center justify-center font-mono text-[11px] transition-colors",
                        cross?.w === w ? "text-foreground" : "text-ink-3",
                      )}
                    >
                      W{w}
                    </span>
                  ))}
                </div>

                {cohorts.map((c, r) => {
                  const len = lengthOf(c);
                  const isPinned = pinned === c.id;
                  const inRow = cross?.r === r;
                  return (
                    <div
                      key={c.id}
                      role="row"
                      aria-rowindex={r + 2}
                      className="contents"
                    >
                      <span
                        role="rowheader"
                        className={cn(
                          "sticky left-0 z-10 flex h-6 items-center gap-1 bg-card pr-1 text-[12px] transition-colors @min-[68rem]:h-[26px]",
                          inRow || isPinned ? "text-foreground" : "text-ink-2",
                        )}
                      >
                        <span className="truncate">{cohortLabel(c)}</span>
                        {isPinned ? (
                          <>
                            <Pin
                              aria-hidden
                              className="size-3 shrink-0 text-cobalt-bright"
                            />
                            <span className="sr-only">, pinned</span>
                          </>
                        ) : null}
                      </span>
                      <span
                        role="gridcell"
                        className="relative z-[1] hidden h-6 items-center justify-end pr-1 font-mono text-[11px] text-ink-3 tabular-nums @min-[40rem]:flex @min-[68rem]:h-[26px]"
                      >
                        {grouped.format(c.size)}
                      </span>
                      {Array.from({ length: W }, (_, w) => {
                        if (w >= len) {
                          return (
                            <span
                              key={w}
                              role="gridcell"
                              aria-disabled
                              className="h-6 @min-[68rem]:h-[26px]"
                            />
                          );
                        }
                        const v = valueOf(c, w, shown);
                        const pct = v === null ? 0 : shade(v);
                        const strong = pct >= 58;
                        const live = liveWeek(c, w);
                        const isActive = active.r === r && active.w === w;
                        const lit = !cross || inRow || cross.w === w;
                        const delay = motionSafe ? orderOf(r, w) * stepS : 0;
                        const abs =
                          shown === "users"
                            ? `${grouped.format(c.users[w] ?? 0)} of ${grouped.format(c.size)} users`
                            : formatMoney(c.revenue[w] ?? 0);
                        return (
                          <div
                            key={`${playKey}-${w}`}
                            ref={(el) => {
                              const k = `${r}-${w}`;
                              if (el) cells.current.set(k, el);
                              else cells.current.delete(k);
                            }}
                            data-cg-cell={`${r}-${w}`}
                            role="gridcell"
                            tabIndex={isActive ? 0 : -1}
                            aria-label={`${cohortLabel(c)} cohort, week ${w}: ${v === null ? "no data" : format(v, shown)}, ${abs}${live ? ", week in progress" : ""}`}
                            aria-selected={isPinned || undefined}
                            onPointerMove={(event) => {
                              if (event.pointerType !== "mouse") return;
                              if (cross?.r !== r || cross.w !== w) {
                                moveTo(r, w, "pointer");
                              }
                            }}
                            onClick={() => {
                              setActive({ r, w });
                              setCross({ r, w, via: "pointer" });
                              select(r, w);
                            }}
                            onFocus={() => {
                              if (!cross || cross.r !== r || cross.w !== w) {
                                setActive({ r, w });
                                setCross({ r, w, via: "key" });
                              }
                            }}
                            onBlur={(event) => {
                              const to = event.relatedTarget;
                              if (
                                to instanceof Element &&
                                to.hasAttribute("data-cg-cell")
                              )
                                return;
                              if (cross?.via === "key") setCross(null);
                            }}
                            onKeyDown={onCellKey}
                            className={cn(
                              "relative z-[1] h-6 cursor-pointer rounded-1 transition-opacity duration-150 @min-[68rem]:h-[26px]",
                              lit ? "opacity-100" : "opacity-55",
                              RING_IN,
                            )}
                          >
                            <motion.span
                              aria-hidden
                              className="absolute inset-0 rounded-1 transition-[background-color] duration-240 ease-[cubic-bezier(0.22,1,0.36,1)]"
                              style={{
                                background: `color-mix(in oklab, var(--cg-pig) ${pct}%, var(--card))`,
                                transitionDelay: `${r2(delay)}s`,
                              }}
                              initial={
                                motionSafe
                                  ? { opacity: 0, scale: 0.6 }
                                  : { opacity: 0 }
                              }
                              animate={{ opacity: 1, scale: 1 }}
                              transition={
                                motionSafe
                                  ? {
                                      ...springs.snap,
                                      delay,
                                      opacity: {
                                        duration: durations.fast,
                                        delay,
                                      },
                                    }
                                  : { duration: durations.fast }
                              }
                            />
                            {live ? (
                              <span
                                aria-hidden
                                className="absolute inset-0 rounded-1 bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--card)_55%,transparent)_0_3px,transparent_3px_6px)]"
                              />
                            ) : null}
                            {cross?.r === r && cross.w === w ? (
                              <span
                                aria-hidden
                                className="absolute -inset-px rounded-1 ring-[1.5px] ring-foreground"
                              />
                            ) : null}
                            <span
                              aria-hidden
                              className={cn(
                                "relative flex h-full items-center justify-center font-mono text-[10.5px] tabular-nums transition-colors duration-240",
                                strong
                                  ? "text-primary-foreground"
                                  : "text-foreground",
                              )}
                              style={{ transitionDelay: `${r2(delay)}s` }}
                            >
                              {v === null ? "" : format(v, shown)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <p
            aria-hidden
            className="mt-2 flex h-5 items-center gap-2 overflow-clip text-[12px] whitespace-nowrap text-ink-2"
          >
            {readout}
          </p>
        </div>

        {/* Focused cohort and the key, where a desktop has room */}
        <div className="hidden flex-col gap-3 @min-[68rem]:col-start-2 @min-[68rem]:row-start-2 @min-[68rem]:flex">
          {card ? (
            <section
              aria-label="Cohort"
              className="flex flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3"
            >
              <p className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">
                  {cohortLabel(card)} cohort
                </span>
                {pinned === card.id ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-cobalt-bright">
                    <Pin aria-hidden className="size-3" />
                    Pinned
                  </span>
                ) : null}
              </p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                <dt className="text-ink-3">Joined</dt>
                <dd className="text-right font-mono text-foreground tabular-nums">
                  {grouped.format(card.size)}
                </dd>
                <dt className="text-ink-3">Active now</dt>
                <dd className="text-right font-mono text-foreground tabular-nums">
                  {grouped.format(card.users[lengthOf(card) - 1] ?? 0)}
                </dd>
                <dt className="text-ink-3">Revenue to date</dt>
                <dd className="text-right font-mono text-foreground tabular-nums">
                  {formatMoney(
                    card.revenue
                      .slice(0, lengthOf(card))
                      .reduce((s, x) => s + x, 0),
                  )}
                </dd>
              </dl>
            </section>
          ) : null}
          {best ? (
            <p className="text-[12px] text-ink-2">
              Best at week {best.week}:{" "}
              <span className="text-foreground">
                {cohortLabel(best.cohort)}
              </span>{" "}
              <span className="font-mono tabular-nums">
                {format(best.value, shown)}
              </span>
            </p>
          ) : null}
          <div aria-hidden className="mt-auto flex flex-col gap-1">
            <span
              className="h-2 rounded-full"
              style={{
                background: `linear-gradient(to right, color-mix(in oklab, ${PIGMENT[shown]} 12%, var(--card)), ${PIGMENT[shown]})`,
              }}
            />
            <span className="flex justify-between font-mono text-[10px] text-ink-3">
              <span>{format(0, shown)}</span>
              <span>{format(peak, shown)}</span>
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container max-h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            {R} weekly {R === 1 ? "cohort" : "cohorts"}
            {firstC && lastC
              ? ` · ${cohortLabel(firstC)} to ${cohortLabel(lastC)}`
              : ""}{" "}
            · {shown === "users" ? "users retained" : "revenue retained"}
          </p>
        </div>
        {status === "ready" ? switcher : null}
      </header>
      {body()}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
