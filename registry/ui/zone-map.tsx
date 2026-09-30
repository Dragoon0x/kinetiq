"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ZoneMapPalette = "tide" | "ember" | "moss" | "ink";

export type ZoneMapProps = {
  /** The map's accessible name. */
  label: string;
  /** Region names in map order (top-left first); they are also the ids in `value`. */
  names?: string[];
  /** Controlled selection: the selected region names, in the order picked. */
  value?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the click, key or remove button that changed the selection. */
  onValueChange?: (value: string[]) => void;
  /** How many regions the island is cut into. @default 7 */
  regions?: number;
  /** How far hover lifts a region, in map units (the map is 200 wide). @default 4 */
  lift?: number;
  /** The fill floods out from the click point; off, it fades in whole. @default true */
  flood?: boolean;
  /** The two colours each selected region's shade is mixed from. @default "tide" */
  palette?: ZoneMapPalette;
  /** Another map for the same count. @default 3 */
  seed?: number;
  /** The heading over the list beside the map. @default "Covered" */
  listLabel?: string;
  /** A tock per region and a swish with the flood. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = { x: number; y: number };
type Zone = {
  name: string;
  index: number;
  points: Pt[];
  d: string;
  centre: Pt;
  shade: string;
  tint: string;
};

const W = 200;
const H = 160;
const CX = 100;
const CY = 80;
const RX = 86;
const RY = 60;

const NAMES = [
  "Velmoor",
  "Quillon",
  "Ashgrave",
  "Tolmarch",
  "Sorrel Reach",
  "Brannoc",
  "Oskarra",
  "Lindwe",
  "Pellmere",
];

/**
 * Sixteen unit directions, as constants: the coast is built from these with
 * nothing but arithmetic, because trigonometry may differ in its last digits
 * between the server and the browser, and every coordinate here reaches an
 * attribute.
 */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.92388, 0.38268],
  [0.70711, 0.70711],
  [0.38268, 0.92388],
  [0, 1],
  [-0.38268, 0.92388],
  [-0.70711, 0.70711],
  [-0.92388, 0.38268],
  [-1, 0],
  [-0.92388, -0.38268],
  [-0.70711, -0.70711],
  [-0.38268, -0.92388],
  [0, -1],
  [0.38268, -0.92388],
  [0.70711, -0.70711],
  [0.92388, -0.38268],
];

const PALETTES: Record<
  ZoneMapPalette,
  { a: string; b: string; space: "oklch" | "oklab" }
> = {
  tide: { a: "var(--accent-bright)", b: "var(--signal)", space: "oklch" },
  ember: { a: "var(--warn)", b: "var(--danger)", space: "oklch" },
  moss: { a: "var(--success)", b: "var(--warn)", space: "oklch" },
  // Near-greys have no hue to keep, so they mix in oklab.
  ink: { a: "var(--ink)", b: "var(--ink-3)", space: "oklab" },
};

// Land leans toward the ink and water toward the accent, so the two part
// in either theme: lighter land on a dark page, a blue sea on a light one.
const LAND = "color-mix(in oklab, var(--ink) 9%, var(--bg-1))";
const WATER = "color-mix(in oklab, var(--accent) 12%, var(--bg-0))";
const SHORE = "color-mix(in oklab, var(--accent) 26%, var(--bg-0))";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const at = <T,>(list: readonly T[], i: number): T =>
  list[((i % list.length) + list.length) % list.length] as T;
const keyOf = (ids: string[]) => ids.join("\u0000");
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** A seeded generator on 32-bit integer steps: the same map everywhere. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One pass of corner cutting: every corner becomes two, a quarter in. */
const soften = (pts: Pt[]) =>
  pts.flatMap((p, i) => {
    const q = at(pts, i + 1);
    return [
      { x: 0.75 * p.x + 0.25 * q.x, y: 0.75 * p.y + 0.25 * q.y },
      { x: 0.25 * p.x + 0.75 * q.x, y: 0.25 * p.y + 0.75 * q.y },
    ];
  });

/** Thirty-two directions: each pair of neighbours above, bisected. */
const DIRS32: readonly (readonly [number, number])[] = DIRS.flatMap((d, i) => {
  const e = at(DIRS, i + 1);
  const mx = d[0] + e[0];
  const my = d[1] + e[1];
  const len = Math.sqrt(mx * mx + my * my);
  return [d, [mx / len, my / len] as const];
});

/**
 * The coast: eight broad lobes eased between (the island's bays and capes)
 * plus finer jitter at every one of 32 directions, corner-cut once, then
 * scaled to fill the map with a margin whatever the seed did to it.
 */
function coast(seed: number): Pt[] {
  const rand = rng(Math.imul(seed, 7919) + 13);
  const lobes = Array.from({ length: 8 }, () => rand() * 2 - 1);
  const fine = DIRS32.map(() => rand() * 2 - 1);
  const pts = soften(
    DIRS32.map(([dx, dy], i) => {
      const u = i / 4;
      const j = Math.floor(u);
      const f = u - j;
      const ease = f * f * (3 - 2 * f);
      const broad = at(lobes, j) * (1 - ease) + at(lobes, j + 1) * ease;
      const detail =
        0.5 * at(fine, i) + 0.25 * at(fine, i - 1) + 0.25 * at(fine, i + 1);
      const k = 1 + 0.24 * broad + 0.12 * detail;
      return { x: CX + RX * k * dx, y: CY + RY * k * dy };
    }),
  );
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const s = Math.min((W - 16) / (x1 - x0), (H - 30) / (y1 - y0));
  const ox = (W - (x1 - x0) * s) / 2 - x0 * s;
  const oy = 16 + (H - 30 - (y1 - y0) * s) / 2 - y0 * s;
  return pts.map((p) => ({ x: r2(p.x * s + ox), y: r2(p.y * s + oy) }));
}

function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = at(poly, i);
    const b = at(poly, j);
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      hit = !hit;
    }
  }
  return hit;
}

function area(poly: Pt[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = at(poly, i);
    const b = at(poly, i + 1);
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

function centroid(poly: Pt[]): Pt {
  let cx = 0;
  let cy = 0;
  let s = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const a = at(poly, i);
    const b = at(poly, i + 1);
    const c = a.x * b.y - b.x * a.y;
    s += c;
    cx += (a.x + b.x) * c;
    cy += (a.y + b.y) * c;
  }
  if (Math.abs(s) < 1e-9) return poly[0] ?? { x: CX, y: CY };
  return { x: cx / (3 * s), y: cy / (3 * s) };
}

/** The part of `poly` nearer `a` than `b`: one bisector of a Voronoi cell. */
function clipHalf(poly: Pt[], a: Pt, b: Pt): Pt[] {
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const side = (p: Pt) => (p.x - mx) * nx + (p.y - my) * ny;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = at(poly, i);
    const q = at(poly, i + 1);
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if (sp <= 0 !== sq <= 0) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/** Each site's Voronoi cell, cut from the island itself. */
const cellsOf = (sites: Pt[], island: Pt[]) =>
  sites.map((s, i) =>
    sites.reduce(
      (poly, o, j) =>
        j === i || poly.length < 3 ? poly : clipHalf(poly, s, o),
      island,
    ),
  );

function scatter(n: number, seed: number, island: Pt[]): Pt[] {
  const rand = rng(Math.imul(seed, 104729) + Math.imul(n, 31) + 7);
  let spacing = Math.sqrt(Math.abs(area(island)) / n) * 0.8;
  const out: Pt[] = [];
  for (let tries = 1; out.length < n && tries < 4000; tries += 1) {
    if (tries % 250 === 0) spacing *= 0.85;
    const p = { x: CX + (rand() * 2 - 1) * RX, y: CY + (rand() * 2 - 1) * RY };
    if (!inside(p, island)) continue;
    const near = out.some(
      (q) =>
        (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y) <
        spacing * spacing,
    );
    if (!near) out.push(p);
  }
  return out;
}

/**
 * The map: a coast, sites scattered inside it and relaxed three times toward
 * their cells' centroids (so no region is a sliver), and the cells in reading
 * order. Deterministic for a count and a seed, to the last digit.
 */
function chart(n: number, seed: number) {
  const island = coast(seed);
  let sites = scatter(n, seed, island);
  for (let k = 0; k < 3; k += 1) {
    sites = cellsOf(sites, island).map((c, i) =>
      c.length >= 3 ? centroid(c) : at(sites, i),
    );
  }
  const polys = cellsOf(sites, island)
    .filter((c) => c.length >= 3)
    .map((c) => {
      const points = c.map((p) => ({ x: r2(p.x), y: r2(p.y) }));
      const m = centroid(points);
      return { points, centre: { x: r2(m.x), y: r2(m.y) } };
    })
    .sort(
      (a, b) =>
        Math.round(a.centre.y / 45) - Math.round(b.centre.y / 45) ||
        a.centre.x - b.centre.x,
    );
  return { island, polys };
}

const pathOf = (pts: Pt[], close = true) =>
  pts.length === 0
    ? ""
    : `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}${close ? " Z" : ""}`;

/** The outline as two strokes that leave the vertex nearest `from` in opposite directions. */
function ringFrom(pts: Pt[], from: Pt): [string, string] {
  let k = 0;
  let best = Infinity;
  pts.forEach((p, i) => {
    const d = (p.x - from.x) * (p.x - from.x) + (p.y - from.y) * (p.y - from.y);
    if (d < best) {
      best = d;
      k = i;
    }
  });
  const forward = pts.map((_, i) => at(pts, k + i));
  const back = pts.map((_, i) => at(pts, k - i));
  return [
    pathOf([...forward, at(pts, k)], false),
    pathOf([...back, at(pts, k)], false),
  ];
}

/** How far a flood from `from` has to run to reach the whole region. */
const reach = (pts: Pt[], from: Pt) =>
  r2(
    Math.sqrt(
      pts.reduce(
        (m, p) =>
          Math.max(
            m,
            (p.x - from.x) * (p.x - from.x) + (p.y - from.y) * (p.y - from.y),
          ),
        0,
      ),
    ) + 1,
  );

type ZoneShapeProps = {
  zone: Zone;
  count: number;
  selected: boolean;
  raised: boolean;
  /** Keyboard focus is here: the ring traces the region itself. */
  ringed: boolean;
  origin: Pt;
  lift: number;
  flood: boolean;
  motionSafe: boolean;
  focusable: boolean;
  clipId: string;
  visualId: string;
  register: (name: string, node: SVGGElement | null) => void;
  onFocusZone: (name: string, keyboard: boolean) => void;
};

/**
 * One region. It lifts on the snap spring and leaves a flat shadow on the
 * ground below — the same shape, dark, fading with the lift, no blur. Its
 * fill is a circle clipped to the region and centred where the click
 * landed, so it floods outward to the coast; its outline is two strokes that
 * run both ways round from the vertex nearest the click and meet opposite.
 */
function ZoneShape({
  zone,
  count,
  selected,
  raised,
  ringed,
  origin,
  lift,
  flood,
  motionSafe,
  focusable,
  clipId,
  visualId,
  register,
  onFocusZone,
}: ZoneShapeProps) {
  const rise = useMotionValue(0);
  const radius = useMotionValue(selected ? reach(zone.points, origin) : 0);
  const alpha = useMotionValue(selected ? 1 : 0);
  const trace = useMotionValue(selected ? 0.5 : 0);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const shown = React.useRef(selected);

  const y = useTransform(rise, (v) => r3(-v * lift));
  const shadow = useTransform(rise, (v) => r3(v * 0.22));
  const r = useTransform(radius, (v) => Math.max(0, r2(v)));
  const [ringA, ringB] = React.useMemo(
    () => ringFrom(zone.points, origin),
    [origin, zone.points],
  );

  React.useEffect(() => {
    if (!motionSafe) {
      rise.set(0);
      return;
    }
    const run = animate(rise, raised ? 1 : 0, springs.snap);
    return () => run.stop();
  }, [motionSafe, raised, rise]);

  React.useEffect(() => {
    if (shown.current === selected) {
      // Same state on new ground (another count, another seed): settle on
      // it, so a selected region is always wholly filled and outlined.
      if (!selected) return;
      for (const c of runs.current) c.stop();
      runs.current = [];
      radius.set(reach(zone.points, origin));
      alpha.set(1);
      trace.set(0.5);
      return;
    }
    shown.current = selected;
    for (const c of runs.current) c.stop();
    runs.current = [];
    const full = reach(zone.points, origin);
    if (!motionSafe) {
      radius.set(full);
      trace.set(0.5);
      runs.current.push(
        animate(
          alpha,
          selected ? 1 : 0,
          selected
            ? { duration: durations.base, ease: easings.enter }
            : exitFor(durations.base),
        ),
      );
      return;
    }
    // Liquid takes longer to reach a far coast: the flood's time follows
    // its reach, inside the house's slow-tween band.
    const time = r3(clamp(0.3 + full / 260, 0.32, 0.56));
    if (selected) {
      alpha.set(flood ? 1 : 0);
      radius.set(flood ? 0 : full);
      trace.set(0);
      runs.current.push(
        flood
          ? animate(radius, full, { duration: time, ease: easings.enter })
          : animate(alpha, 1, {
              duration: durations.base,
              ease: easings.enter,
            }),
        animate(trace, 0.5, { duration: durations.slow, ease: easings.enter }),
      );
      return;
    }
    radius.set(full);
    runs.current.push(
      flood
        ? animate(radius, 0, { duration: r3(time * 0.7), ease: easings.exit })
        : animate(alpha, 0, exitFor(durations.base)),
      animate(trace, 0, exitFor(durations.slow)),
    );
  }, [alpha, flood, motionSafe, origin, radius, selected, trace, zone.points]);

  React.useEffect(
    () => () => {
      for (const c of runs.current) c.stop();
    },
    [],
  );

  return (
    <g
      ref={(node) => register(zone.name, node)}
      role="option"
      aria-selected={selected}
      aria-label={zone.name}
      aria-posinset={zone.index + 1}
      aria-setsize={count}
      tabIndex={focusable ? 0 : -1}
      data-zone={zone.name}
      onFocus={(event) => {
        let keyboard = false;
        try {
          keyboard = event.currentTarget.matches(":focus-visible");
        } catch {
          keyboard = false;
        }
        onFocusZone(zone.name, keyboard);
      }}
      // An outline would box the flood circle's whole extent, not the
      // region, and be painted under its neighbours; the ring is drawn as
      // the region's own edge instead (see `ringed`).
      className="cursor-pointer outline-none"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={zone.d} />
        </clipPath>
      </defs>
      <g id={visualId}>
        <motion.path d={zone.d} fill="black" style={{ opacity: shadow }} />
        <motion.g style={{ y }}>
          <path
            d={zone.d}
            stroke="var(--hairline-strong)"
            strokeWidth={0.8}
            strokeLinejoin="round"
            className="transition-colors duration-150"
            style={{ fill: raised ? zone.tint : LAND }}
          />
          <motion.circle
            cx={origin.x}
            cy={origin.y}
            r={r}
            fill={zone.shade}
            fillOpacity={0.58}
            clipPath={`url(#${clipId})`}
            style={{ opacity: alpha }}
          />
          <motion.g
            fill="none"
            stroke={zone.shade}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: alpha }}
          >
            <motion.path d={ringA} style={{ pathLength: trace }} />
            <motion.path d={ringB} style={{ pathLength: trace }} />
          </motion.g>
          {ringed ? (
            <g fill="none" strokeLinejoin="round">
              <path d={zone.d} stroke="var(--bg-0)" strokeWidth={3.6} />
              <path d={zone.d} stroke="var(--ring)" strokeWidth={2} />
            </g>
          ) : null}
        </motion.g>
      </g>
    </g>
  );
}

/**
 * A stylised map of invented regions, with a list beside it that keeps the
 * selection in words. The island is drawn procedurally — a jittered,
 * corner-cut coast cut into Voronoi regions — and is the same for a given
 * `regions` and `seed` on every render, server and browser alike.
 *
 * Hover (or keyboard focus) lifts a region on the snap spring above a flat
 * shadow. Clicking selects it: a fill floods out from the click point to
 * the coast, and an outline draws both ways round from the nearest vertex,
 * meeting on the far side; clicking again drains the fill back into the
 * point you tapped. The list names what is selected in the order it was
 * picked, each row with the region's shade and a remove button, and rows
 * glide to make room.
 *
 * The map is a multi-select `role="listbox"` of regions: arrow keys move to
 * the nearest region in that direction, Home and End to the first and last,
 * Space or Enter toggles with the same flood (from the region's centre) and
 * the same tock. Under reduced motion nothing lifts, floods or draws: the
 * raised region is tinted, and fills and outlines fade in whole.
 */
export function ZoneMap({
  label,
  names = NAMES,
  value,
  defaultValue,
  onValueChange,
  regions = 7,
  lift = 4,
  flood = true,
  palette = "tide",
  seed = 3,
  listLabel = "Covered",
  sound = false,
  disabled = false,
  className,
}: ZoneMapProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = React.useId();
  const count = clamp(Math.round(regions), 2, 12);
  const height = clamp(lift, 0, 10);
  const colours = PALETTES[palette] ?? PALETTES.tide;

  const geo = React.useMemo(() => chart(count, seed), [count, seed]);
  const namesKey = keyOf(names);
  const zones = React.useMemo<Zone[]>(() => {
    const list = namesKey.split("\u0000");
    const n = geo.polys.length;
    let stride = Math.floor(n / 2) + 1;
    while (n > 1 && gcd(stride, n) !== 1) stride += 1;
    return geo.polys.map((p, i) => {
      // Shades step through the palette by a stride coprime with the count,
      // so regions picked one after another rarely share a shade.
      const t = n > 1 ? ((i * stride) % n) / (n - 1) : 0;
      const mix = Math.round(100 - t * 80);
      return {
        name: list[i] || `Region ${i + 1}`,
        index: i,
        points: p.points,
        d: pathOf(p.points),
        centre: p.centre,
        shade: `color-mix(in ${colours.space}, ${colours.a} ${mix}%, ${colours.b})`,
        tint: `color-mix(in oklab, ${colours.a} 14%, ${LAND})`,
      };
    });
  }, [colours, geo, namesKey]);
  const coastPath = React.useMemo(() => pathOf(geo.island), [geo]);

  const [own, setOwn] = React.useState<string[]>(() => defaultValue ?? []);
  const raw = value ?? own;
  const selected = React.useMemo(
    () => raw.filter((n) => zones.some((z) => z.name === n)),
    [raw, zones],
  );
  const selectedKey = keyOf(selected);

  // Where each region was last clicked, for this map only: another count
  // or seed moves every coast, and an old point may no longer be inside.
  const geoKey = `${count}:${seed}`;
  const [clicks, setClicks] = React.useState<{
    key: string;
    at: Record<string, Pt>;
  }>({ key: geoKey, at: {} });
  const origins = clicks.key === geoKey ? clicks.at : {};
  const [hover, setHover] = React.useState<string | null>(null);
  const [keyFocus, setKeyFocus] = React.useState<string | null>(null);
  const [focusName, setFocusName] = React.useState<string | null>(null);
  const [stack, setStack] = React.useState<string[]>([]);
  const raisedName = disabled ? null : (hover ?? keyFocus);
  const raisedZone = zones.find((z) => z.name === raisedName);

  const [said, setSaid] = React.useState<{ key: string; text: string } | null>(
    null,
  );
  const spoken = said && said.key === selectedKey ? said.text : "";

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const zoneEls = React.useRef(new Map<string, SVGGElement>());
  const removeEls = React.useRef(new Map<string, HTMLButtonElement>());
  const [listEl, setListEl] = React.useState<HTMLUListElement | null>(null);
  const [edges, setEdges] = React.useState({ top: false, bottom: false });

  const stop =
    zones.find((z) => z.name === focusName)?.name ??
    selected[0] ??
    zones[0]?.name;

  const register = React.useCallback(
    (name: string, node: SVGGElement | null) => {
      if (node) zoneEls.current.set(name, node);
      else zoneEls.current.delete(name);
    },
    [],
  );

  const raise = (name: string | null) => {
    if (!name) return;
    setStack((s) =>
      s[s.length - 1] === name
        ? s
        : [...s.filter((x) => x !== name), name].slice(-3),
    );
  };

  const hoverZone = (name: string | null) => {
    if (name === hover) return;
    setHover(name);
    raise(name);
  };

  const onFocusZone = React.useCallback((name: string, keyboard: boolean) => {
    setFocusName(name);
    setKeyFocus(keyboard ? name : null);
    if (keyboard) {
      setStack((s) =>
        s[s.length - 1] === name
          ? s
          : [...s.filter((x) => x !== name), name].slice(-3),
      );
    }
  }, []);

  const panAt = (x: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const box = svg.getBoundingClientRect();
    return panFrom(box.left + (x / W) * box.width, svg);
  };

  const toggle = (zone: Zone, from: Pt) => {
    if (disabled) return;
    const on = !selected.includes(zone.name);
    const next = on
      ? [...selected, zone.name]
      : selected.filter((n) => n !== zone.name);
    setClicks((c) => ({
      key: geoKey,
      at: { ...(c.key === geoKey ? c.at : {}), [zone.name]: from },
    }));
    const pan = panAt(zone.centre.x);
    audio.play(
      "thock",
      on ? { pitch: 1.1, gain: 0.55, pan } : { pitch: 0.82, gain: 0.34, pan },
    );
    if (on && flood) {
      const size = reach(zone.points, from);
      audio.play("swish", {
        pitch: r3(clamp(1.35 - size / 110, 0.7, 1.3)),
        gain: 0.4,
        pan,
      });
    }
    const left = next.length;
    setSaid({
      key: keyOf(next),
      text: `${zone.name} ${on ? "added" : "removed"}, ${left} ${left === 1 ? "region" : "regions"}`,
    });
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const zoneAt = (target: EventTarget | null): Zone | undefined => {
    const el = target instanceof Element ? target.closest("[data-zone]") : null;
    const name = el?.getAttribute("data-zone");
    return zones.find((z) => z.name === name);
  };

  /** A pointer in map units, lifted back down onto the region's own ground. */
  const mapPoint = (event: React.MouseEvent, zone: Zone): Pt => {
    const svg = svgRef.current;
    if (!svg || event.detail === 0) return zone.centre;
    const box = svg.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return zone.centre;
    const lifted = motionSafe && raisedName === zone.name ? height : 0;
    return {
      x: r2(((event.clientX - box.left) / box.width) * W),
      y: r2(((event.clientY - box.top) / box.height) * H + lifted),
    };
  };

  const focusZone = (name: string) => {
    setFocusName(name);
    zoneEls.current.get(name)?.focus();
  };

  /** The nearest region whose centre lies that way, sideways distance weighted double. */
  const toward = (from: Zone, key: string): Zone | undefined => {
    let best: Zone | undefined;
    let score = Infinity;
    for (const z of zones) {
      if (z === from) continue;
      const dx = z.centre.x - from.centre.x;
      const dy = z.centre.y - from.centre.y;
      const along =
        key === "ArrowRight"
          ? dx
          : key === "ArrowLeft"
            ? -dx
            : key === "ArrowDown"
              ? dy
              : -dy;
      const across = key === "ArrowRight" || key === "ArrowLeft" ? dy : dx;
      if (along <= 2) continue;
      const s = along + 2 * Math.abs(across);
      if (s < score) {
        score = s;
        best = z;
      }
    }
    return best;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const zone = zoneAt(event.target);
    if (!zone || event.defaultPrevented) return;
    const { key } = event;
    if (key === " " || key === "Enter") {
      event.preventDefault();
      if (!event.repeat) toggle(zone, zone.centre);
      return;
    }
    let to: Zone | undefined;
    if (key.startsWith("Arrow")) to = toward(zone, key);
    else if (key === "Home") to = zones[0];
    else if (key === "End") to = zones[zones.length - 1];
    else return;
    event.preventDefault();
    if (to) focusZone(to.name);
  };

  const remove = (name: string) => {
    const zone = zones.find((z) => z.name === name);
    if (!zone) return;
    const i = selected.indexOf(name);
    const next = selected[i + 1] ?? selected[i - 1];
    toggle(zone, zone.centre);
    // The row is leaving: focus goes to the row that takes its place, or,
    // when it was the last, back to the region on the map.
    if (next) removeEls.current.get(next)?.focus();
    else focusZone(name);
  };

  // The list scrolls inside the map's height; a fade marks whichever edge
  // has more beyond it.
  const measureEdges = React.useCallback(() => {
    if (!listEl) return;
    const top = listEl.scrollTop > 1;
    const bottom =
      listEl.scrollTop + listEl.clientHeight < listEl.scrollHeight - 1;
    setEdges((e) =>
      e.top === top && e.bottom === bottom ? e : { top, bottom },
    );
  }, [listEl]);

  React.useEffect(() => {
    if (!listEl || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureEdges());
    observer.observe(listEl);
    const frame = window.requestAnimationFrame(() => measureEdges());
    // Rows glide in and out; look again once they have landed.
    const later = window.setTimeout(() => measureEdges(), 500);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.clearTimeout(later);
    };
  }, [listEl, measureEdges, selectedKey]);

  const fade = `linear-gradient(to bottom, ${edges.top ? "transparent" : "black"} 0, black 14px, black calc(100% - 14px), ${edges.bottom ? "transparent" : "black"} 100%)`;

  // Regions stay in one order in the document, so focus is never moved out
  // from under the keyboard; the ones lifted most recently are drawn again
  // on top of their neighbours as live copies.
  const lifted = stack.flatMap((n) => zones.filter((z) => z.name === n));

  return (
    <div className={cn("flex w-full gap-3", className)}>
      <div
        className={cn(
          "relative aspect-[5/4] min-w-0 flex-1 overflow-clip rounded-3 border border-hairline",
          disabled && "opacity-60",
        )}
        style={{ background: WATER }}
      >
        <svg
          ref={svgRef}
          role="listbox"
          aria-multiselectable="true"
          aria-label={label}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          viewBox={`0 0 ${W} ${H}`}
          className="block size-full touch-manipulation select-none"
          onPointerMove={(event) => {
            if (event.pointerType === "touch") return;
            hoverZone(zoneAt(event.target)?.name ?? null);
          }}
          onPointerLeave={() => hoverZone(null)}
          onClick={(event) => {
            const zone = zoneAt(event.target);
            if (zone) toggle(zone, mapPoint(event, zone));
          }}
          onKeyDown={onKeyDown}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && svgRef.current?.contains(next)) return;
            setKeyFocus(null);
          }}
        >
          <path
            d={coastPath}
            fill="none"
            stroke={SHORE}
            strokeWidth={5}
            strokeLinejoin="round"
          />
          {zones.map((z) => (
            <ZoneShape
              key={z.name}
              zone={z}
              count={zones.length}
              selected={selected.includes(z.name)}
              raised={z.name === raisedName}
              ringed={!disabled && z.name === keyFocus}
              origin={origins[z.name] ?? z.centre}
              lift={height}
              flood={flood}
              motionSafe={motionSafe}
              focusable={z.name === stop}
              clipId={`${uid}-clip-${z.index}`}
              visualId={`${uid}-zone-${z.index}`}
              register={register}
              onFocusZone={onFocusZone}
            />
          ))}
          {lifted.map((z) => (
            <use
              key={z.name}
              aria-hidden
              href={`#${uid}-zone-${z.index}`}
              data-zone={z.name}
              className="cursor-pointer"
            />
          ))}
        </svg>
        <AnimatePresence>
          {raisedZone ? (
            <motion.span
              key="caption"
              aria-hidden
              className="pointer-events-none absolute top-1.5 left-1.5 rounded-1 bg-card/85 px-1.5 py-0.5 font-mono text-[10px] leading-4 tracking-[0.08em] whitespace-nowrap text-ink-2 uppercase"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {raisedZone.name}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="relative w-30 shrink-0">
        <p className="flex h-4 items-center justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span className="truncate">{listLabel}</span>
          <span className="tabular-nums">{selected.length}</span>
        </p>
        <ul
          ref={setListEl}
          onScroll={measureEdges}
          aria-label={listLabel}
          className="absolute inset-x-0 top-5.5 bottom-0 overflow-x-clip overflow-y-auto overscroll-contain"
          style={{ maskImage: fade, WebkitMaskImage: fade }}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {selected.map((name) => {
              const zone = zones.find((z) => z.name === name);
              if (!zone) return null;
              return (
                <motion.li
                  key={name}
                  layout={motionSafe ? "position" : false}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.nudge }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.glide,
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                        }
                      : { duration: durations.fast }
                  }
                  onPointerEnter={(event) => {
                    if (event.pointerType !== "touch") hoverZone(name);
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType !== "touch") hoverZone(null);
                  }}
                  className={cn(
                    "flex h-6 items-center gap-1.5 rounded-1 pl-1 transition-colors duration-150",
                    raisedName === name && "bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: zone.shade }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-foreground"
                    title={name}
                  >
                    {name}
                  </span>
                  <button
                    ref={(node) => {
                      if (node) removeEls.current.set(name, node);
                      else removeEls.current.delete(name);
                    }}
                    type="button"
                    aria-label={`Remove ${name}`}
                    disabled={disabled}
                    onClick={() => remove(name)}
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-1 text-ink-3 transition-colors duration-150 outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed"
                  >
                    <svg aria-hidden viewBox="0 0 12 12" className="size-3">
                      <path
                        d="M3 3l6 6M9 3l-6 6"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {selected.length === 0 ? (
            <li className="pt-0.5 text-xs leading-4 text-ink-3">
              Tap a region to add it.
            </li>
          ) : null}
        </ul>
      </div>

      <span id={hintId} className="sr-only">
        Arrow keys move between regions, Space or Enter adds or removes one.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
