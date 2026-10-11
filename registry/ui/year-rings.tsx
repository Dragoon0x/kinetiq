"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type YearRingsItem = {
  /** An image URL. Without one, a picture is drawn in code. */
  src?: string;
  /** What the picture shows. */
  alt: string;
  /** A short title, shown when the picture is brought forward. */
  caption?: string;
  /** The year it belongs to: its ring. */
  year: number;
};

export type YearRingsWood = "oak" | "cedar" | "ash" | "walnut";

export type YearRingsProps = {
  /** The archive, any order: grouped into one ring per year, the oldest at the core. @default 48 drawn pictures, 2020 to 2025 */
  items?: YearRingsItem[];
  /** The picture brought forward (controlled), by index into `items`, or null. */
  value?: number | null;
  /** The picture brought forward to begin with. @default null */
  defaultValue?: number | null;
  /** Fires from the press or key that brought a picture forward or sent it back. */
  onValueChange?: (index: number | null) => void;
  /** Space between rings, in picture widths (1.1 to 2). @default 1.4 */
  ringGap?: number;
  /** How fast the rings turn, 0 (still) to 2. @default 1 */
  speed?: number;
  /** How much of the timber is drawn, 0 (a clean diagram) to 1 (rays, a check and every growth line). @default 0.7 */
  grain?: number;
  /** Neighbouring rings turn opposite ways. @default true */
  alternate?: boolean;
  /** Hovering or focusing a ring stops it. @default true */
  brake?: boolean;
  /** The timber. @default "oak" */
  wood?: YearRingsWood;
  /** Show the year label above the slice. @default true */
  captions?: boolean;
  /** Hold every ring still. @default false */
  paused?: boolean;
  /** The archive's accessible name. @default "Archive by year" */
  label?: string;
  /** No hovering, pressing or keys. @default false */
  disabled?: boolean;
  /** Sizes the archive; it fills a 544px-tall box by default. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Seeded data and art                                                  */
/* ------------------------------------------------------------------ */

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Field notes by the kind of picture they are: stones, banks, low light, growth, weather. */
const NOTES: [number, string][] = [
  [0, "River stones"],
  [1, "Salt marsh"],
  [3, "Lichen wall"],
  [4, "Fog bank"],
  [2, "Heron at dawn"],
  [4, "Birch bark"],
  [0, "Tide pools"],
  [3, "Fern spiral"],
  [3, "Seed heads"],
  [2, "Low sun"],
  [4, "Frost on reeds"],
  [0, "Quarry pond"],
  [3, "Moss bank"],
  [0, "Shingle"],
  [4, "Rain front"],
  [1, "Alder carr"],
  [1, "Dune grass"],
  [2, "Evening field"],
];

const COUNTS = [3, 5, 7, 9, 11, 13];

/** Six years of field notes: more pictures every year, the oldest first. */
export const defaultYearRingsItems: YearRingsItem[] = COUNTS.flatMap(
  (count, y) =>
    Array.from({ length: count }, (_, j) => {
      const note =
        NOTES[Math.floor(hash(y + 3, j + 7) * NOTES.length)]?.[1] ?? "Field";
      return {
        year: 2020 + y,
        caption: note,
        alt: `${note}, ${2020 + y}`,
      };
    }),
);

/** The kind of picture a caption is, so the drawing matches its words. */
const kindOf = (caption: string | undefined, seed: number) => {
  const known = NOTES.find(([, name]) => name === caption);
  return known ? known[0] : Math.floor(hash(seed + 41, 1, 5) * 5);
};

const tone = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

/** A small photograph in gradients; a year leans warmer as the archive goes on. */
function sceneOf(seed: number, yearIndex: number, kind: number): string {
  const r = (n: number) => hash(seed + 41, n, 5);
  const warm = yearIndex * 8;
  const sx = Math.round(20 + r(2) * 60);
  const sy = Math.round(18 + r(3) * 30);
  switch (kind) {
    case 0:
      return [
        `radial-gradient(circle at ${sx}% 70%, ${tone("--ink-3", 0.62, 0.02, warm)} 0 14%, transparent 15%)`,
        `radial-gradient(circle at ${100 - sx}% 78%, ${tone("--ink-3", 0.5, 0.02, warm)} 0 18%, transparent 19%)`,
        `linear-gradient(to bottom, ${tone("--signal", 0.62, 0.05, warm)}, ${tone("--signal", 0.4, 0.05, warm)})`,
      ].join(", ");
    case 1:
      return [
        `linear-gradient(to bottom, transparent 54%, ${tone("--success", 0.5, 0.07, warm - 30)} 54% 70%, ${tone("--signal", 0.56, 0.06, warm)} 70%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.82, 0.05, warm)}, ${tone("--warn", 0.86, 0.05, warm)})`,
      ].join(", ");
    case 2:
      return [
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.94, 0.08)} 0 9%, transparent 22%)`,
        `linear-gradient(to bottom, transparent 66%, ${tone("--ink-3", 0.3, 0.02, warm)} 66%)`,
        `linear-gradient(to bottom, ${tone("--warn", 0.7, 0.1, warm - 40)}, ${tone("--danger", 0.72, 0.08, warm + 20)})`,
      ].join(", ");
    case 3:
      return [
        `radial-gradient(circle at 30% 40%, ${tone("--success", 0.7, 0.09, warm)} 0 8%, transparent 9%)`,
        `radial-gradient(circle at 64% 62%, ${tone("--warn", 0.78, 0.08, warm)} 0 10%, transparent 11%)`,
        `radial-gradient(circle at 72% 28%, ${tone("--success", 0.62, 0.08, warm)} 0 7%, transparent 8%)`,
        `linear-gradient(135deg, ${tone("--ink-3", 0.56, 0.02, warm)}, ${tone("--ink-3", 0.42, 0.02, warm)})`,
      ].join(", ");
    default:
      return [
        `linear-gradient(to bottom, transparent 40%, ${tone("--accent", 0.86, 0.02, warm)} 58%, transparent 74%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.74, 0.03, warm)}, ${tone("--success", 0.46, 0.04, warm)})`,
      ].join(", ");
  }
}

/** A photograph's soft vignette over its scene. */
const noteArt = (seed: number, yearIndex: number, kind: number) =>
  `radial-gradient(circle at 50% 45%, transparent 56%, color-mix(in oklab, black 24%, transparent)), ${sceneOf(seed, yearIndex, kind)}`;

type Timber = {
  heart: string;
  sap: string;
  late: string;
  bark: string;
  barkHi: string;
};

const WOODS: Record<YearRingsWood, Timber> = {
  oak: {
    heart: tone("--warn", 0.6, 0.075, -22),
    sap: tone("--warn", 0.82, 0.055, -8),
    late: tone("--warn", 0.42, 0.07, -26),
    bark: tone("--warn", 0.28, 0.03, -30),
    barkHi: tone("--warn", 0.4, 0.035, -30),
  },
  cedar: {
    heart: tone("--danger", 0.55, 0.09, 22),
    sap: tone("--warn", 0.84, 0.05, -14),
    late: tone("--danger", 0.38, 0.08, 20),
    bark: tone("--danger", 0.3, 0.04, 30),
    barkHi: tone("--danger", 0.42, 0.04, 30),
  },
  ash: {
    heart: tone("--warn", 0.74, 0.045, -6),
    sap: tone("--warn", 0.89, 0.03, -4),
    late: tone("--warn", 0.55, 0.05, -12),
    bark: tone("--ink-3", 0.38, 0.015),
    barkHi: tone("--ink-3", 0.5, 0.015),
  },
  walnut: {
    heart: tone("--warn", 0.4, 0.05, -34),
    sap: tone("--warn", 0.7, 0.05, -18),
    late: tone("--warn", 0.27, 0.04, -36),
    bark: tone("--ink-3", 0.22, 0.012),
    barkHi: tone("--ink-3", 0.34, 0.012),
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const mod = (v: number, n: number) => ((v % n) + n) % n;

/** The slice is drawn in a 1000-unit box. */
const BOX = 1000;
const C = BOX / 2;

/** A closed, gently wobbling circle: a growth line. */
function wobble(radius: number, seed: number, amount: number): string {
  const pts: string[] = [];
  const steps = 72;
  const a1 = hash(seed, 1) * Math.PI * 2;
  const a2 = hash(seed, 2) * Math.PI * 2;
  const a3 = hash(seed, 3) * Math.PI * 2;
  for (let i = 0; i < steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const k =
      1 +
      amount *
        (0.5 * Math.sin(2 * t + a1) +
          0.3 * Math.sin(3 * t + a2) +
          0.2 * Math.sin(7 * t + a3));
    const rr = radius * k;
    pts.push(`${r2(C + rr * Math.cos(t))} ${r2(C + rr * Math.sin(t))}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

type Layout = {
  years: number[];
  /** Item indices per ring, in ring order. */
  rings: number[][];
  /** Ring radius per ring, in picture widths. */
  rho: number[];
  /** Picture size per ring, in picture widths (shrunk only if a ring is crowded). */
  size: number[];
  /** Radius of the whole slice, in picture widths. */
  R: number;
};

function layoutOf(items: YearRingsItem[], gap: number): Layout {
  const years = [...new Set(items.map((it) => Math.round(it.year)))].sort(
    (a, b) => a - b,
  );
  const rings = years.map((y) =>
    items.flatMap((it, i) => (Math.round(it.year) === y ? [i] : [])),
  );
  const r0 = 1.25;
  const rho = years.map((_, k) => r0 + k * gap);
  const size = rings.map((ring, k) =>
    Math.min(
      1,
      ((2 * Math.PI * (rho[k] ?? 1)) / Math.max(1, ring.length)) * 0.86,
    ),
  );
  const outer = rho[rho.length - 1] ?? r0;
  return { years, rings, rho, size, R: outer + 0.5 + 0.74 };
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type Cursor = { ring: number; slot: number };
type Flight = { x: number; y: number; scale: number };

/**
 * An archive as a cross-section of a tree: items are grouped by year into
 * concentric rings, the oldest at the core and the newest under the bark, each
 * in its own growth band. The timber is drawn from a seed — heartwood darkening
 * to the core, wobbling latewood lines, fine earlywood lines between them,
 * medullary rays, a drying check and a rough bark — and `grain` scales all of
 * it, from a clean diagram to full timber.
 *
 * Every ring turns at its own slow pace (neighbours in opposite directions when
 * `alternate`), the pictures riding it upright while its growth line turns
 * with it. Hovering a ring brakes it to a stop over a few hundred ms, its band
 * brightens and its year reads above the slice; leaving lets it spin back up.
 * A click brings a picture forward: it lifts out of its ring from its own
 * rectangle on the glide spring to a framed view over the centre while the
 * rings pause, and Escape, the close button or the scrim send it back.
 *
 * Pictures are buttons in one roving tab stop: Left and Right move along a
 * ring, Up out to newer years and Down in to older (to the picture nearest in
 * angle), Home the core and End the bark; Enter brings forward. Under reduced
 * motion the rings stand still and the forward view cross-fades.
 */
export function YearRings({
  items = defaultYearRingsItems,
  value,
  defaultValue = null,
  onValueChange,
  ringGap = 1.4,
  speed = 1,
  grain = 0.7,
  alternate = true,
  brake = true,
  wood = "oak",
  captions = true,
  paused = false,
  label = "Archive by year",
  disabled = false,
  className,
}: YearRingsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gap = clamp(ringGap, 1.1, 2);
  const g = clamp(grain, 0, 1);
  const timber = WOODS[wood] ?? WOODS.oak;
  const L = React.useMemo(() => layoutOf(items, gap), [items, gap]);
  const N = L.years.length;
  const unit = 100 / (2 * L.R);
  const s = C / L.R;

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const forward = value === undefined ? own : value;
  const open = forward !== null && forward >= 0 && forward < items.length;

  const [hoverRing, setHoverRing] = React.useState<number | null>(null);
  const [focusRing, setFocusRing] = React.useState<number | null>(null);
  const [cursor, setCursor] = React.useState<Cursor>(() => ({
    ring: Math.max(0, N - 1),
    slot: 0,
  }));
  const activeRing = focusRing ?? hoverRing;
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((x) => ({ n: x.n + 1, text }));

  // Each ring's resting angle and its own pace, from the seed.
  const offsets = React.useMemo(
    () => L.years.map((y) => Math.round(hash(y, 17) * 360)),
    [L.years],
  );
  const paces = React.useMemo(
    () =>
      L.years.map((y, k) => {
        const base = (9 * (0.6 + 0.8 * hash(y, 29))) / (0.6 + 0.28 * k);
        return alternate && k % 2 === 1 ? -base : base;
      }),
    [L.years, alternate],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sliceRef = React.useRef<HTMLDivElement | null>(null);
  const ringEls = React.useRef(new Map<number, HTMLDivElement>());
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const angles = React.useRef<number[]>([]);
  const rates = React.useRef<number[]>([]);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  // Assumed on screen until the observer's first report, so the first frame
  // is drawn (and an off-screen mount stops after it).
  const visible = React.useRef(true);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const returnTo = React.useRef<number | null>(null);

  const latest = React.useRef({
    paces,
    speed,
    paused,
    motionSafe,
    brake,
    activeRing,
    open,
    N,
  });
  React.useEffect(() => {
    latest.current = {
      paces,
      speed,
      paused,
      motionSafe,
      brake,
      activeRing,
      open,
      N,
    };
  });

  /* ------------------------------ the turn ------------------------------- */

  const write = (k: number) => {
    const el = ringEls.current.get(k);
    const a = angles.current[k] ?? 0;
    if (el) el.style.setProperty("--a", `${r2(mod(a, 360))}deg`);
  };

  const tick = (now: number) => {
    frame.current = 0;
    const S = latest.current;
    const dt = last.current
      ? Math.min(1 / 20, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    let moving = false;
    for (let k = 0; k < S.N; k += 1) {
      const want = S.open || (S.brake && S.activeRing === k) ? 0 : 1;
      const rate = rates.current[k] ?? 1;
      // A hand on the ring is constant friction: the turn falls off linearly
      // and stops in about 0.4 s. Let go, and it winds back up like a motor.
      const next =
        want < rate
          ? Math.max(want, rate - dt / 0.4)
          : rate + (want - rate) * (1 - Math.exp(-dt / 0.45));
      rates.current[k] = Math.abs(next - want) < 0.004 ? want : next;
      const w = (S.paces[k] ?? 0) * S.speed * (rates.current[k] ?? 0);
      if (Math.abs(w) > 0.001) {
        angles.current[k] = (angles.current[k] ?? 0) + w * dt;
        write(k);
        moving = true;
      }
      if (rates.current[k] !== want) moving = true;
    }
    if (moving && shouldRun())
      frame.current = window.requestAnimationFrame(tick);
    else last.current = 0;
  };

  const shouldRun = () => {
    const S = latest.current;
    return (
      visible.current &&
      !document.hidden &&
      !S.paused &&
      S.motionSafe &&
      S.speed > 0
    );
  };

  const run = () => {
    if (!shouldRun()) {
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      last.current = 0;
      return;
    }
    if (!frame.current) frame.current = window.requestAnimationFrame(tick);
  };

  const api = React.useRef({ run });
  React.useEffect(() => {
    api.current = { run };
  });

  // Rings start at their seeded angles; under reduced motion they stay there.
  React.useEffect(() => {
    angles.current = offsets.slice();
    rates.current = offsets.map(() => 1);
    for (let k = 0; k < offsets.length; k += 1) write(k);
    api.current.run();
  }, [offsets, motionSafe]);

  React.useEffect(() => {
    api.current.run();
  }, [speed, paused, activeRing, open, brake, paces]);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      api.current.run();
    });
    io.observe(node);
    const onVisibility = () => api.current.run();
    document.addEventListener("visibilitychange", onVisibility);
    const raf = frame;
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf.current) window.cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, []);

  /* ------------------------------ forward -------------------------------- */

  /** Where a picture sits now, relative to the forward view's own box. */
  const flightFrom = (index: number) => {
    const slice = sliceRef.current;
    const node = nodes.current.get(index);
    if (!slice || !node) return null;
    const a = slice.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    const size = a.width * 0.5;
    return {
      x: r2(b.left + b.width / 2 - (a.left + a.width / 2)),
      y: r2(b.top + b.height / 2 - (a.top + a.height * 0.47)),
      scale: r3(Math.max(0.05, b.width / size)),
    };
  };

  const bringForward = (index: number) => {
    if (disabled) return;
    setFlight(flightFrom(index));
    returnTo.current = index;
    if (value === undefined) setOwn(index);
    onValueChange?.(index);
    const it = items[index];
    if (it)
      say(`${it.caption ?? it.alt}, ${Math.round(it.year)}, brought forward.`);
  };

  const sendBack = () => {
    if (forward === null) return;
    setFlight(flightFrom(forward));
    if (value === undefined) setOwn(null);
    onValueChange?.(null);
    say("Back in its ring.");
  };

  // Focus comes home to the picture once the forward view has gone.
  React.useEffect(() => {
    if (open) return;
    const i = returnTo.current;
    if (i === null) return;
    returnTo.current = null;
    const node = nodes.current.get(i);
    const at = document.activeElement;
    if (
      node &&
      (!at || at === document.body || rootRef.current?.contains(at))
    ) {
      node.focus({ preventScroll: true });
    }
  }, [open]);

  /* ------------------------------ the hand ------------------------------- */

  const ringAt = (clientX: number, clientY: number): number | null => {
    const slice = sliceRef.current;
    if (!slice) return null;
    const rect = slice.getBoundingClientRect();
    const scale = rect.width / (2 * L.R);
    const d =
      Math.hypot(
        clientX - (rect.left + rect.width / 2),
        clientY - (rect.top + rect.height / 2),
      ) / scale;
    for (let k = 0; k < N; k += 1) {
      if (Math.abs(d - (L.rho[k] ?? 0)) <= gap / 2) return k;
    }
    return null;
  };

  /** The slot in ring `k` nearest, on screen, to the angle `deg`. */
  const nearestSlot = (k: number, deg: number) => {
    const ring = L.rings[k] ?? [];
    const a = angles.current[k] ?? offsets[k] ?? 0;
    let best = 0;
    let bestD = Infinity;
    ring.forEach((_, j) => {
      const at = a + (j * 360) / ring.length;
      const d = Math.abs(mod(at - deg + 180, 360) - 180);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    return best;
  };

  const focusSlot = (c: Cursor) => {
    const k = clamp(c.ring, 0, N - 1);
    const ring = L.rings[k] ?? [];
    const slot = mod(c.slot, Math.max(1, ring.length));
    setCursor({ ring: k, slot });
    const index = ring[slot];
    if (index !== undefined)
      nodes.current.get(index)?.focus({ preventScroll: true });
  };

  const onItemKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    k: number,
    j: number,
  ) => {
    if (disabled) return;
    const ring = L.rings[k] ?? [];
    const here =
      (angles.current[k] ?? offsets[k] ?? 0) +
      (j * 360) / Math.max(1, ring.length);
    let next: Cursor | null = null;
    if (event.key === "ArrowRight") next = { ring: k, slot: j + 1 };
    else if (event.key === "ArrowLeft") next = { ring: k, slot: j - 1 };
    else if (event.key === "ArrowUp" && k < N - 1)
      next = { ring: k + 1, slot: nearestSlot(k + 1, here) };
    else if (event.key === "ArrowDown" && k > 0)
      next = { ring: k - 1, slot: nearestSlot(k - 1, here) };
    else if (event.key === "Home")
      next = { ring: 0, slot: nearestSlot(0, here) };
    else if (event.key === "End")
      next = { ring: N - 1, slot: nearestSlot(N - 1, here) };
    if (
      event.key.startsWith("Arrow") ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
    }
    if (next) focusSlot(next);
  };

  const onViewKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      sendBack();
    } else if (event.key === "Tab") {
      // One control in the view: focus stays on it.
      event.preventDefault();
    }
  };

  /* ------------------------------ drawing -------------------------------- */

  const outer = L.R * s;
  const barkIn = (L.R - 0.36) * s;
  const sapIn = (L.R - 0.74) * s;
  const lineAmt = 0.006 + 0.012 * g;
  const fineLines = Math.round(1 + 3 * g);
  // With little grain the heartwood fades toward the sapwood: a clean diagram.
  const heart = `color-mix(in oklab, ${timber.heart} ${Math.round(25 + 75 * g)}%, ${timber.sap})`;

  const timberSvg = (
    <svg
      aria-hidden
      viewBox={`0 0 ${BOX} ${BOX}`}
      className="absolute inset-0 size-full"
    >
      <defs>
        <radialGradient id={`${uid}-wood`}>
          <stop
            offset="0"
            style={{
              stopColor: `color-mix(in oklab, ${heart} 85%, ${timber.late})`,
            }}
          />
          <stop
            offset={r3((sapIn / barkIn) * 0.9)}
            style={{ stopColor: heart }}
          />
          <stop
            offset={r3(sapIn / barkIn)}
            style={{
              stopColor: `color-mix(in oklab, ${heart} 40%, ${timber.sap})`,
            }}
          />
          <stop offset="1" style={{ stopColor: timber.sap }} />
        </radialGradient>
      </defs>
      <path
        d={wobble(outer, 7, 0.004 + 0.008 * g)}
        style={{ fill: timber.bark }}
      />
      {/* Fissures across the bark, and its pale inner edge. */}
      {g > 0.1
        ? Array.from({ length: Math.round(40 + 100 * g) }, (_, i) => {
            const a =
              (i / Math.round(40 + 100 * g)) * Math.PI * 2 + hash(i, 61) * 0.04;
            const r1 = barkIn + 2;
            const r2v = outer - 2 - hash(i, 62) * 6;
            return (
              <line
                key={`bark${i}`}
                x1={r2(C + r1 * Math.cos(a))}
                y1={r2(C + r1 * Math.sin(a))}
                x2={r2(C + r2v * Math.cos(a))}
                y2={r2(C + r2v * Math.sin(a))}
                style={{ stroke: timber.barkHi }}
                strokeWidth={r2(1 + 1.6 * hash(i, 63))}
                opacity={r2(0.35 + 0.4 * g)}
              />
            );
          })
        : null}
      <circle
        cx={C}
        cy={C}
        r={r2(barkIn + 1.5)}
        fill="none"
        style={{ stroke: timber.barkHi }}
        strokeWidth={3}
      />
      <circle cx={C} cy={C} r={r2(barkIn)} fill={`url(#${uid}-wood)`} />
      {/* Fine earlywood lines between the years. */}
      {L.rho.flatMap((rr, k) =>
        Array.from({ length: fineLines }, (_, m) => {
          const at = (rr - gap / 2 + ((m + 1) / (fineLines + 1)) * gap) * s;
          if (at <= 6 || at >= barkIn - 2) return null;
          return (
            <path
              key={`f${k}-${m}`}
              d={wobble(at, 100 + k * 7 + m, lineAmt)}
              fill="none"
              style={{ stroke: timber.late }}
              strokeWidth={1.2}
              opacity={r2(0.12 + 0.22 * g)}
            />
          );
        }),
      )}
      {/* Medullary rays and the drying check. */}
      {g > 0.05
        ? Array.from({ length: Math.round(24 + 60 * g) }, (_, i) => {
            const a = hash(i, 51) * Math.PI * 2;
            const r1 = (0.15 + hash(i, 52) * 0.6) * barkIn;
            const r2v = Math.min(
              barkIn - 4,
              r1 + (0.05 + hash(i, 53) * 0.2) * barkIn,
            );
            return (
              <line
                key={`ray${i}`}
                x1={r2(C + r1 * Math.cos(a))}
                y1={r2(C + r1 * Math.sin(a))}
                x2={r2(C + r2v * Math.cos(a))}
                y2={r2(C + r2v * Math.sin(a))}
                style={{ stroke: timber.sap }}
                strokeWidth={1.6}
                opacity={r2(0.25 * g)}
              />
            );
          })
        : null}
      {g > 0.3 ? (
        <path
          d={(() => {
            const a = 0.6;
            const w = 0.03 * g;
            const tip = barkIn * (0.9 - 0.45 * g);
            const p = (rr: number, t: number) =>
              `${r2(C + rr * Math.cos(t))} ${r2(C + rr * Math.sin(t))}`;
            return `M ${p(outer, a - w)} L ${p(tip, a)} L ${p(outer, a + w)} Z`;
          })()}
          style={{ fill: `color-mix(in oklab, ${timber.bark} 80%, black)` }}
          opacity={r2(0.4 + 0.5 * g)}
        />
      ) : null}
      <circle
        cx={C}
        cy={C}
        r={r2(0.22 * s)}
        style={{ fill: timber.late }}
        opacity={0.75}
      />
    </svg>
  );

  // The view flies from the picture's own rectangle and back to it; the way
  // back is an exit, so it is a tween, not a spring.
  const viewMotion = {
    from: (f: Flight | null) =>
      motionSafe && f ? { ...f, opacity: 0.6 } : { opacity: 0 },
    shown: {
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      transition: motionSafe
        ? { ...springs.glide, opacity: { duration: durations.fast } }
        : { duration: durations.base, ease: easings.enter },
    },
    gone: (f: Flight | null) =>
      motionSafe && f
        ? {
            ...f,
            opacity: 0,
            transition: { duration: durations.slow, ease: easings.move },
          }
        : { opacity: 0, transition: { duration: durations.fast } },
  };
  const focusClose = React.useCallback((node: HTMLButtonElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  const forwardItem = open && forward !== null ? items[forward] : undefined;
  const forwardYear = forwardItem
    ? L.years.indexOf(Math.round(forwardItem.year))
    : -1;
  const span = N > 0 ? `${L.years[0]}–${L.years[N - 1]}` : "";

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      className={cn("flex h-136 w-full flex-col gap-3 select-none", className)}
    >
      {captions ? (
        <div aria-hidden className="grid shrink-0 px-1">
          {[null, ...L.years.map((_, k) => k)].map((k) => {
            const on = k === activeRing;
            const year = k === null ? span : String(L.years[k]);
            const count = k === null ? items.length : (L.rings[k]?.length ?? 0);
            const tail =
              k === null
                ? `${count} pictures in ${N} ring${N === 1 ? "" : "s"}`
                : `${count} picture${count === 1 ? "" : "s"}`;
            return (
              <motion.p
                key={k ?? "all"}
                className="col-start-1 row-start-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"
                initial={false}
                animate={{ opacity: on ? 1 : 0 }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                <span className="font-mono text-xl leading-none whitespace-nowrap text-foreground tabular-nums">
                  {year}
                </span>
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {tail}
                </span>
              </motion.p>
            );
          })}
        </div>
      ) : null}
      <div className="[container-type:size] relative flex-1 basis-0 overflow-hidden">
        <div
          ref={sliceRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "min(100cqw, 100cqh)",
            height: "min(100cqw, 100cqh)",
          }}
          onPointerMove={(event) => {
            if (disabled || event.pointerType === "touch") return;
            const k = ringAt(event.clientX, event.clientY);
            if (k !== hoverRing) setHoverRing(k);
          }}
          onPointerLeave={() => setHoverRing(null)}
        >
          <div className="absolute inset-0 rounded-full shadow-[0_10px_30px_color-mix(in_oklab,black_22%,transparent)]" />
          {timberSvg}
          <div className="absolute inset-0" inert={open || undefined}>
            {L.rings.map((ring, k) => {
              const rr = L.rho[k] ?? 0;
              const year = L.years[k] ?? 0;
              const size = (L.size[k] ?? 1) * unit;
              const on = activeRing === k;
              return (
                <div
                  key={year}
                  ref={(node) => {
                    if (node) ringEls.current.set(k, node);
                    else ringEls.current.delete(k);
                  }}
                  role="group"
                  aria-label={`${year}, ${ring.length} picture${ring.length === 1 ? "" : "s"}`}
                  className="pointer-events-none absolute inset-0"
                  style={
                    {
                      "--a": `${offsets[k] ?? 0}deg`,
                      transform: "rotate(var(--a))",
                    } as React.CSSProperties
                  }
                >
                  <svg
                    aria-hidden
                    viewBox={`0 0 ${BOX} ${BOX}`}
                    className="absolute inset-0 size-full overflow-visible"
                  >
                    <circle
                      cx={C}
                      cy={C}
                      r={r2(rr * s)}
                      fill="none"
                      className="transition-opacity duration-200"
                      style={{
                        stroke: "color-mix(in oklab, white 70%, transparent)",
                      }}
                      strokeWidth={r2(gap * s * 0.86)}
                      opacity={on ? 0.16 : 0}
                    />
                    {k < N - 1 ? (
                      <path
                        d={wobble(
                          (rr + gap / 2) * s,
                          300 + year,
                          lineAmt * 1.4,
                        )}
                        fill="none"
                        className="transition-[stroke-width,opacity] duration-200"
                        style={{ stroke: timber.late }}
                        strokeWidth={on ? 4.5 : 2.6}
                        opacity={r2(on ? 0.95 : 0.55 + 0.35 * g)}
                      />
                    ) : null}
                  </svg>
                  {ring.map((index, j) => {
                    const it = items[index];
                    if (!it) return null;
                    const a = (j / ring.length) * Math.PI * 2;
                    const x = r3(50 + rr * Math.cos(a) * unit);
                    const y = r3(50 + rr * Math.sin(a) * unit);
                    const tab = cursor.ring === k && cursor.slot === j;
                    const name = it.caption ?? it.alt;
                    return (
                      <button
                        key={index}
                        ref={(node) => {
                          if (node) nodes.current.set(index, node);
                          else nodes.current.delete(index);
                        }}
                        type="button"
                        aria-label={`${name}, ${year}, ${j + 1} of ${ring.length}`}
                        tabIndex={tab ? 0 : -1}
                        disabled={disabled}
                        onFocus={() => {
                          setFocusRing(k);
                          if (!tab) setCursor({ ring: k, slot: j });
                        }}
                        onBlur={(event) => {
                          if (
                            !rootRef.current?.contains(
                              event.relatedTarget as Node | null,
                            )
                          ) {
                            setFocusRing(null);
                          }
                        }}
                        onKeyDown={(event) => onItemKey(event, k, j)}
                        onClick={() => bringForward(index)}
                        className={cn(
                          "pointer-events-auto absolute overflow-hidden rounded-[30%] shadow-[0_1px_3px_color-mix(in_oklab,black_35%,transparent),0_0_0_1px_color-mix(in_oklab,white_35%,transparent)] transition-[scale] duration-150",
                          "hover:scale-125 focus-visible:scale-125",
                          FOCUS_RING,
                          disabled ? "cursor-not-allowed" : "cursor-zoom-in",
                        )}
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          width: `${r3(size)}%`,
                          height: `${r3(size)}%`,
                          transform:
                            "translate(-50%, -50%) rotate(calc(var(--a) * -1))",
                        }}
                      >
                        {it.src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.src}
                            alt=""
                            draggable={false}
                            className="size-full object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="block size-full"
                            style={{
                              backgroundImage: noteArt(
                                index,
                                k,
                                kindOf(it.caption, index),
                              ),
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <AnimatePresence custom={flight}>
            {open && forwardItem && forward !== null ? (
              <motion.div
                key="scrim"
                aria-hidden
                className="absolute inset-0 rounded-full bg-[color-mix(in_oklab,black_42%,transparent)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={{ duration: durations.base, ease: easings.enter }}
                onClick={sendBack}
              />
            ) : null}
            {open && forwardItem && forward !== null ? (
              <motion.div
                key={`view-${forward}`}
                role="dialog"
                aria-modal="false"
                aria-label={`${forwardItem.caption ?? forwardItem.alt}, ${Math.round(forwardItem.year)}`}
                onKeyDown={onViewKey}
                className="absolute top-[47%] left-1/2 flex w-1/2 -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-3 border border-hairline-strong bg-popover p-2 text-popover-foreground shadow-[0_18px_40px_color-mix(in_oklab,black_35%,transparent)]"
                custom={flight}
                variants={viewMotion}
                initial="from"
                animate="shown"
                exit="gone"
              >
                <span className="relative block aspect-square w-full overflow-hidden rounded-2">
                  {forwardItem.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={forwardItem.src}
                      alt={forwardItem.alt}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span
                      role="img"
                      aria-label={forwardItem.alt}
                      className="block size-full"
                      style={{
                        backgroundImage: noteArt(
                          forward,
                          Math.max(0, forwardYear),
                          kindOf(forwardItem.caption, forward),
                        ),
                      }}
                    />
                  )}
                </span>
                <span className="flex items-center justify-between gap-2 px-1">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-foreground">
                      {forwardItem.caption ?? forwardItem.alt}
                    </span>
                    <span className="block font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
                      {Math.round(forwardItem.year)}
                    </span>
                  </span>
                  <button
                    ref={focusClose}
                    type="button"
                    aria-label="Send back to its ring"
                    onClick={sendBack}
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                    >
                      <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                    </svg>
                  </button>
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <p id={`${uid}-hint`} className="sr-only">
        Pictures are grouped by year, the oldest at the core. Left and right
        move along a ring, up and down between years; Enter brings a picture
        forward and Escape sends it back.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
