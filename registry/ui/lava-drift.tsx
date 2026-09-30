"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LavaDriftWax = "amber" | "rose" | "teal";

export type LavaDriftProps = {
  /** What is warming up: the loader's accessible name, shown beside the lamp unless `hideLabel`. @default "Loading" */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px. Detail is simplified below 24 and below 44. @default 24 */
  size?: number;
  /** How fast the wax heats, rises, cools and sinks, 0.5 to 2. @default 1 */
  speed?: number;
  /** The share of the wax that has risen, 0 to 1. Omitted, the blobs rise and fall on their own. */
  progress?: number;
  /** The wax and the liquid it floats in. @default "amber" */
  wax?: LavaDriftWax;
  /** How many blobs rise and fall (in flight at once, with `progress`), 2 to 6. @default 4 */
  blobs?: number;
  /** How much the lamp glows, 0 to 1: the halo, the bulb's light up the liquid, the shine on the wax. @default 0.6 */
  glow?: number;
  /** The lamp keeps flowing but cannot be warmed by hand. @default false */
  disabled?: boolean;
  className?: string;
};

type Tier = 0 | 1 | 2;

type Blob = {
  y: number;
  vy: number;
  /** Temperature: above 0.5 it floats. */
  T: number;
  r: number;
  /** How readily it takes and loses heat: no two blobs keep time. */
  k: number;
  phase: number;
  drift: number;
};

/** A blob carrying wax from the pool to the cap while the lamp fills. */
type Rider = { y: number; vy: number; r: number; phase: number };

type WaxLook = {
  wax: string;
  hot: string;
  top: string;
  bottom: string;
  halo: string;
};

// Pigments: wax and liquid are things, so they keep one lightness in both
// themes. Warm wax floats in a darker liquid of a neighbouring hue.
const WAXES: Record<LavaDriftWax, WaxLook> = {
  amber: {
    wax: "oklch(0.8 0.15 68)",
    hot: "oklch(0.91 0.12 88)",
    top: "oklch(0.34 0.1 22)",
    bottom: "oklch(0.52 0.16 32)",
    halo: "oklch(0.78 0.16 55)",
  },
  rose: {
    wax: "oklch(0.75 0.16 355)",
    hot: "oklch(0.88 0.1 350)",
    top: "oklch(0.3 0.08 300)",
    bottom: "oklch(0.47 0.13 310)",
    halo: "oklch(0.73 0.16 340)",
  },
  teal: {
    wax: "oklch(0.8 0.12 172)",
    hot: "oklch(0.91 0.08 168)",
    top: "oklch(0.3 0.07 250)",
    bottom: "oklch(0.47 0.12 238)",
    halo: "oklch(0.77 0.12 185)",
  },
};

const METAL = {
  light: "oklch(0.9 0.008 250)",
  base: "oklch(0.72 0.012 250)",
  shade: "oklch(0.5 0.015 250)",
  edge: "oklch(0.36 0.015 250)",
};

/* The lamp, in a 64-unit box, centred: cap, tapered glass, base. */
const CX = 32;
const GLASS_PATH =
  "M 26 11 C 23.5 22 20 32 20.5 38 C 21 43 22.5 46 23.5 47 L 40.5 47 C 41.5 46 43 43 43.5 38 C 44 32 40.5 22 38 11 Z";
const CAP_PATH =
  "M 28.6 3 L 35.4 3 Q 36.2 3 36.4 3.8 L 38.4 11 L 25.6 11 L 27.6 3.8 Q 27.8 3 28.6 3 Z";
const BASE_PATH =
  "M 23.5 47 L 40.5 47 L 44.6 59.8 Q 45 61 43.8 61 L 20.2 61 Q 19 61 19.4 59.8 Z";
/** The glass's inner half-width every 2 units from y = 11 to 47, sampled from its outline. */
const HALF = [
  6, 6.47, 6.96, 7.46, 7.98, 8.5, 9.02, 9.53, 10.02, 10.48, 10.89, 11.23, 11.47,
  11.54, 11.38, 11.04, 10.53, 9.77, 8.5,
];
const TOP = 12.5;
const FLOOR = 49;
/** Wax below this line sits on the bulb and takes its heat. */
const HOT_ZONE = 44;
const POOL = 7.5;
const CAP = 9;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const halfAt = (y: number) => {
  const i = clamp((y - 11) / 2, 0, HALF.length - 1);
  const lo = Math.floor(i);
  const a = HALF[lo] ?? 6;
  const b = HALF[Math.min(HALF.length - 1, lo + 1)] ?? a;
  return a + (b - a) * (i - lo);
};

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Blob `i`, seeded: the same lamp on the server and in the browser. */
function makeBlob(i: number, of: number, fresh: boolean): Blob {
  const rand = lcg(0x51a7e + i * 977);
  const y = fresh ? FLOOR - 1 : 16 + ((i + 0.5) / of) * 30;
  return {
    y: r2(y),
    vy: 0,
    T: fresh ? 0.45 : r2(0.3 + rand() * 0.5),
    r: r2(2.6 + rand() * 1.7),
    k: r2(0.8 + rand() * 0.45),
    phase: r2(rand() * Math.PI * 2),
    drift: r2(0.18 + rand() * 0.14),
  };
}

const xOf = (y: number, r: number, phase: number) =>
  CX + Math.sin(phase) * 0.55 * Math.max(0, halfAt(y) - r - 0.6);

const circle = (x: number, y: number, r: number) => {
  const rr = r2(r);
  return `M ${r2(x - rr)} ${r2(y)} a ${rr} ${rr} 0 1 0 ${r2(2 * rr)} 0 a ${rr} ${rr} 0 1 0 ${r2(-2 * rr)} 0 `;
};

/**
 * The neck between two circles as a closed path: tangent points spread
 * round each circle, joined by curves whose handles shorten as the circles
 * part — the metaball construction, turned to any angle. Drawn with the
 * circles in the same colour it reads as one mass with a neck, crisp at any
 * size, no blur filter.
 */
function bridge(
  ax: number,
  ay: number,
  ra: number,
  bx: number,
  by: number,
  rb: number,
): string {
  const d = Math.hypot(bx - ax, by - ay);
  if (d < 0.5 || d > (ra + rb) * 1.45 || d <= Math.abs(ra - rb)) return "";
  const dir = Math.atan2(by - ay, bx - ax);
  const u1 =
    d < ra + rb
      ? Math.acos(Math.min(1, (ra * ra + d * d - rb * rb) / (2 * ra * d)))
      : 0;
  const u2 =
    d < ra + rb
      ? Math.acos(Math.min(1, (rb * rb + d * d - ra * ra) / (2 * rb * d)))
      : 0;
  const spread = 0.5;
  const most = Math.acos(clamp((ra - rb) / d, -1, 1));
  const a1 = dir + u1 + (most - u1) * spread;
  const b1 = dir - u1 - (most - u1) * spread;
  const a2 = dir + Math.PI - u2 - (Math.PI - u2 - most) * spread;
  const b2 = dir - Math.PI + u2 + (Math.PI - u2 - most) * spread;
  const at = (x: number, y: number, r: number, a: number) =>
    [x + r * Math.cos(a), y + r * Math.sin(a)] as const;
  const p1a = at(ax, ay, ra, a1);
  const p1b = at(ax, ay, ra, b1);
  const p2a = at(bx, by, rb, a2);
  const p2b = at(bx, by, rb, b2);
  const handle =
    Math.min(
      spread * 2.4,
      Math.hypot(p1a[0] - p2a[0], p1a[1] - p2a[1]) / (ra + rb),
    ) * Math.min(1, (d * 2) / (ra + rb));
  const h = (p: readonly [number, number], r: number, a: number) =>
    [p[0] + r * handle * Math.cos(a), p[1] + r * handle * Math.sin(a)] as const;
  const h1 = h(p1a, ra, a1 - Math.PI / 2);
  const h2 = h(p2a, rb, a2 + Math.PI / 2);
  const h3 = h(p2b, rb, b2 - Math.PI / 2);
  const h4 = h(p1b, ra, b1 + Math.PI / 2);
  const f = (p: readonly [number, number]) => `${r2(p[0])} ${r2(p[1])}`;
  return `M ${f(p1a)} C ${f(h1)} ${f(h2)} ${f(p2a)} A ${r2(rb)} ${r2(rb)} 0 0 0 ${f(p2b)} C ${f(h3)} ${f(h4)} ${f(p1b)} A ${r2(ra)} ${r2(ra)} 0 0 0 ${f(p1a)} Z `;
}

type Ball = { x: number; y: number; r: number };

/** The wax as two paths: every circle, and every neck between close pairs. */
function waxPaths(balls: readonly Ball[], tier: Tier) {
  let bodies = "";
  let necks = "";
  let shine = "";
  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];
    if (!a || a.r < 0.2) continue;
    bodies += circle(a.x, a.y, a.r);
    if (tier === 2 && a.r < 6) {
      shine += circle(a.x - a.r * 0.36, a.y - a.r * 0.38, a.r * 0.26);
    }
    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      if (!b || b.r < 0.2) continue;
      necks += bridge(a.x, a.y, a.r, b.x, b.y, b.r);
    }
  }
  return { bodies: bodies.trim(), necks: necks.trim(), shine: shine.trim() };
}

/** The pool on the bulb and the cap under the top, from the share risen. */
const pool = (risen: number): Ball => {
  const r = POOL * Math.sqrt(Math.max(0, 1 - risen));
  return { x: CX, y: 47 + 0.3 * r, r };
};
const cap = (risen: number): Ball => {
  const r = CAP * Math.sqrt(clamp01(risen));
  return { x: CX, y: 10 + 0.15 * r, r };
};

/**
 * An inline loader drawn as a small lava lamp. Each blob of wax carries a
 * temperature: on the bulb it heats, above half-warm it floats, and it loses
 * heat as it climbs — faster near the cool cap — so it rises, lingers at the
 * top, cools and sinks back into the pool to heat again, every blob on its
 * own time. Blobs that touch pull their speed and heat together and travel as
 * one mass through a neck until their heat parts them. The wax is circles and
 * the analytic necks between them, so it merges and splits with a crisp
 * edge and no blur.
 *
 * The pointer is a warm hand: the blob nearest it heats and speeds up, and
 * the glass glows under it. The lamp is a real button, and Space or Enter
 * warms the blob nearest the bulb the same way. Given `progress`, it is the
 * share of wax that has risen: the pool drains, a cap of wax gathers under
 * the top, and blobs ride up from one to the other until the last arrives
 * and the lamp goes still. Under reduced motion the wax does not travel; the
 * glow breathes, and the pool and cap still follow the progress.
 */
export function LavaDrift({
  label = "Loading",
  hideLabel = false,
  size = 24,
  speed = 1,
  progress,
  wax = "amber",
  blobs = 4,
  glow = 0.6,
  disabled = false,
  className,
}: LavaDriftProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const glassId = `${uid}-glass`;
  const liquidId = `${uid}-liquid`;
  const waxId = `${uid}-wax`;
  const haloId = `${uid}-halo`;
  const bulbId = `${uid}-bulb`;
  const metalId = `${uid}-metal`;

  const px = Math.max(12, Math.round(size));
  const tier: Tier = px < 24 ? 0 : px < 44 ? 1 : 2;
  const unit = 64 / px;
  const sp = clamp(speed, 0.5, 2);
  const count = clamp(Math.round(blobs), 2, 6);
  const shown = tier === 0 ? Math.min(3, count) : count;
  const scale = tier === 0 ? 1.15 : 1;
  const g = clamp01(glow);
  const determinate = typeof progress === "number" && Number.isFinite(progress);
  const share = determinate ? clamp01(progress) : null;
  const look = WAXES[wax] ?? WAXES.amber;

  const [first] = React.useState(() => {
    const list = Array.from({ length: shown }, (_, i) =>
      makeBlob(i, shown, false),
    );
    const balls: Ball[] =
      share === null
        ? [
            pool(0),
            ...list.map((b) => ({
              x: xOf(b.y, b.r * scale, b.phase),
              y: b.y,
              r: b.r * scale,
            })),
          ]
        : [pool(share), cap(share)];
    return { list, paths: waxPaths(balls, tier) };
  });

  const bodies = useMotionValue(first.paths.bodies);
  const necks = useMotionValue(first.paths.necks);
  const shine = useMotionValue(first.paths.shine);
  const risen = useMotionValue(share ?? 0);
  const warmth = useMotionValue(0);
  const breath = useMotionValue(0);
  const haloAlpha = useTransform(
    [warmth, breath] as MotionValue<number>[],
    ([w = 0, b = 0]: number[]) =>
      r2((0.1 + 0.55 * g) * (0.75 + 0.25 * b + 0.5 * w)),
  );
  const bulbAlpha = useTransform(
    [warmth, breath] as MotionValue<number>[],
    ([w = 0, b = 0]: number[]) =>
      r2(Math.min(1, (0.25 + 0.6 * g) * (0.8 + 0.2 * b + 0.45 * w))),
  );

  const sim = React.useRef({
    blobs: first.list,
    riders: [] as Rider[],
    spawned: 0,
    since: 0,
    t: 0,
    hand: null as { x: number; y: number } | null,
  });
  const loop = React.useRef({ raf: 0, last: 0, seen: false });
  const step = React.useRef<(dt: number) => boolean>(() => false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());

  const run = React.useCallback(
    (key: string, controls: AnimationPlaybackControls) => {
      anims.current.get(key)?.stop();
      anims.current.set(key, controls);
    },
    [],
  );

  const sleep = React.useCallback(() => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  }, []);

  // The frame loop runs only while the lamp is on screen in a visible page,
  // and ends itself once the filled lamp is still.
  const wake = React.useCallback(() => {
    const l = loop.current;
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 0;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (step.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  }, []);

  React.useEffect(() => {
    step.current = (dt: number) => {
      const s = sim.current;
      const lt = dt * sp;
      s.t += dt;
      const hand = s.hand;
      const r = risen.get();
      if (!motionSafe) {
        // Still wax; a slow breath of the glow says the lamp is on.
        const on = share === null || share < 1;
        breath.set(on ? r2(Math.sin(s.t * 2.2)) : 0);
        const balls: Ball[] =
          share === null
            ? [
                pool(0),
                ...s.blobs.map((b) => ({
                  x: xOf(b.y, b.r * scale, b.phase),
                  y: b.y,
                  r: b.r * scale,
                })),
              ]
            : [pool(r), cap(r)];
        const paths = waxPaths(balls, tier);
        bodies.set(paths.bodies);
        necks.set(paths.necks);
        shine.set(paths.shine);
        return on;
      }

      const balls: Ball[] = [];
      if (share === null) {
        const list = s.blobs;
        for (const b of list) {
          if (b.y > HOT_ZONE) b.T += (1.25 - b.T) * 1.8 * b.k * lt;
          const cool = (0.2 + 0.3 * clamp01((28 - b.y) / 14)) / b.k;
          b.T -= b.T * cool * lt;
          if (hand) {
            const x = xOf(b.y, b.r * scale, b.phase);
            const near = Math.hypot(hand.x - x, hand.y - b.y);
            const nearest = list.every(
              (o) =>
                o === b ||
                Math.hypot(
                  hand.x - xOf(o.y, o.r * scale, o.phase),
                  hand.y - o.y,
                ) >= near,
            );
            if (nearest) b.T = Math.min(1.5, b.T + 1.6 * lt);
          }
        }
        // Blobs that touch travel together until their heat parts them.
        for (let i = 0; i < list.length; i += 1) {
          for (let j = i + 1; j < list.length; j += 1) {
            const a = list[i];
            const b = list[j];
            if (!a || !b) continue;
            const d = Math.hypot(
              xOf(a.y, a.r, a.phase) - xOf(b.y, b.r, b.phase),
              a.y - b.y,
            );
            if (d > (a.r + b.r) * 0.9) continue;
            const pull = Math.min(1, 1.5 * lt);
            const dv = (b.vy - a.vy) * pull * 0.5;
            a.vy += dv;
            b.vy -= dv;
            const dT = (b.T - a.T) * Math.min(1, 0.4 * lt) * 0.5;
            a.T += dT;
            b.T -= dT;
          }
        }
        for (const b of list) {
          b.vy += (-90 * (b.T - 0.5) - 2.6 * b.vy) * lt;
          b.y += b.vy * lt;
          const top = TOP + b.r * scale * 0.75;
          if (b.y < top) {
            b.y = top;
            b.vy = Math.max(0, b.vy);
          }
          if (b.y > FLOOR) {
            b.y = FLOOR;
            b.vy = Math.min(0, b.vy);
          }
          b.phase += b.drift * lt;
          balls.push({
            x: xOf(b.y, b.r * scale, b.phase),
            y: b.y,
            r: b.r * scale,
          });
        }
        balls.unshift(pool(0));
      } else {
        // Filling: riders bud from the pool and rise into the cap.
        const bottom = pool(r);
        const top = cap(r);
        const filling = share < 1 || r < 0.999;
        s.since += lt;
        const every = 3.2 / count;
        if (filling && bottom.r > 1.2 && s.since >= every) {
          s.since = 0;
          const rand = lcg(0x9e3779b1 ^ (s.spawned * 2654435761));
          s.spawned += 1;
          const rr = Math.min(bottom.r * 0.7, 2.1 + rand() * 1.3) * scale;
          s.riders.push({
            y: bottom.y - bottom.r + rr * 0.6,
            vy: 0,
            r: rr,
            phase: rand() * Math.PI * 2,
          });
        }
        const arrive = top.y + top.r;
        s.riders = s.riders.filter((q) => {
          let lift = 8;
          if (hand) {
            const near = Math.hypot(
              hand.x - xOf(q.y, q.r, q.phase),
              hand.y - q.y,
            );
            if (near < 10) lift = 18;
          }
          q.vy += (-lift * 1.4 - 1.4 * q.vy) * lt;
          q.y += q.vy * lt;
          q.phase += 0.3 * lt;
          const gap = q.y - q.r * 0.2 - Math.max(TOP, arrive);
          if (gap <= 0) return false;
          // The last few units it gives itself to the cap (or, before there
          // is one, to the top of the glass) rather than vanishing whole.
          const size = q.r * (0.15 + 0.85 * clamp01(gap / 5));
          balls.push({ x: xOf(q.y, q.r, q.phase), y: q.y, r: size });
          return true;
        });
        balls.unshift(bottom, top);
      }
      const paths = waxPaths(balls, tier);
      bodies.set(paths.bodies);
      necks.set(paths.necks);
      shine.set(paths.shine);
      if (share === null) return true;
      return (
        s.riders.length > 0 ||
        risen.isAnimating() ||
        Math.abs(r - share) > 0.001 ||
        share < 1
      );
    };
  });

  // A blob count or a size tier that changes keeps the blobs it has and
  // seeds the rest on the bulb.
  React.useEffect(() => {
    const s = sim.current;
    if (s.blobs.length > shown) s.blobs = s.blobs.slice(0, shown);
    for (let i = s.blobs.length; i < shown; i += 1) {
      s.blobs.push(makeBlob(i, shown, true));
    }
  }, [shown]);

  // The share of wax risen follows the host on the glide spring.
  React.useEffect(() => {
    if (share === null) {
      sim.current.riders = [];
      risen.set(0);
      return;
    }
    if (!motionSafe) {
      anims.current.get("risen")?.stop();
      risen.set(share);
      return;
    }
    run("risen", animate(risen, share, springs.glide));
  }, [share, motionSafe, risen, run]);

  // Any change of what is drawn repaints once and wakes the loop.
  React.useEffect(() => {
    step.current(0);
    wake();
  }, [share, sp, shown, tier, motionSafe, wax, g, wake]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) sleep();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sleep, wake]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      sleep();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, [sleep]);

  const bindGlyph = React.useCallback(
    (node: HTMLButtonElement | null) => {
      if (!node) return;
      const l = loop.current;
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        l.seen = Boolean(entry?.isIntersecting);
        if (l.seen) wake();
        else sleep();
      });
      watcher.observe(node);
      return () => {
        watcher.disconnect();
        l.seen = false;
        sleep();
      };
    },
    [wake, sleep],
  );

  /** A warm hand at a point in the drawing, or gone. */
  const touch = (at: { x: number; y: number } | null) => {
    const s = sim.current;
    const was = s.hand !== null;
    s.hand = at;
    if (was === (at !== null)) return;
    run(
      "warmth",
      animate(
        warmth,
        at ? 1 : 0,
        motionSafe
          ? springs.drift
          : { duration: durations.base, ease: easings.enter },
      ),
    );
    wake();
  };

  /** Space, Enter or a tap: the blob nearest the bulb gets a pulse of heat. */
  const warm = () => {
    if (disabled) return;
    const s = sim.current;
    if (share === null) {
      const low = s.blobs.reduce<Blob | null>(
        (best, b) => (!best || b.y > best.y ? b : best),
        null,
      );
      if (low) {
        low.T = Math.min(1.5, low.T + 0.9);
        low.vy -= 6;
      }
    } else {
      const low = s.riders.reduce<Rider | null>(
        (best, q) => (!best || q.y > best.y ? q : best),
        null,
      );
      if (low) low.vy -= 10;
      else s.since = 99;
    }
    warmth.set(Math.max(warmth.get(), 0.001));
    run(
      "warmth",
      animate(warmth, [warmth.get(), 1, s.hand ? 1 : 0], {
        duration: 1.1,
        times: [0, 0.25, 1],
        ease: [easings.enter, easings.exit],
      }),
    );
    wake();
  };

  const local = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * 64,
      y: ((event.clientY - rect.top) / rect.height) * 64,
    };
  };

  const fine = r2(Math.max(0.6, 0.75 * unit));
  const role = share === null ? "status" : "progressbar";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 align-middle",
        className,
      )}
    >
      <button
        ref={bindGlyph}
        type="button"
        disabled={disabled}
        aria-label="Lava lamp"
        aria-describedby={hintId}
        onPointerMove={(event) => {
          if (!disabled) touch(local(event));
        }}
        onPointerLeave={() => touch(null)}
        onPointerCancel={() => touch(null)}
        onClick={() => warm()}
        className={cn(
          "relative shrink-0 touch-manipulation rounded-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-pointer",
        )}
        style={{ width: px, height: px }}
      >
        <svg
          aria-hidden
          width={px}
          height={px}
          viewBox="0 0 64 64"
          className="block overflow-hidden"
        >
          <defs>
            <clipPath id={glassId}>
              <path d={GLASS_PATH} />
            </clipPath>
            <linearGradient id={liquidId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: look.top }} />
              <stop offset="1" style={{ stopColor: look.bottom }} />
            </linearGradient>
            <linearGradient
              id={waxId}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={14}
              x2={0}
              y2={50}
            >
              <stop offset="0" style={{ stopColor: look.wax }} />
              <stop offset="0.7" style={{ stopColor: look.wax }} />
              <stop offset="1" style={{ stopColor: look.hot }} />
            </linearGradient>
            <radialGradient id={haloId}>
              <stop
                offset="0"
                style={{ stopColor: look.halo, stopOpacity: 0.9 }}
              />
              <stop
                offset="0.55"
                style={{ stopColor: look.halo, stopOpacity: 0.3 }}
              />
              <stop
                offset="1"
                style={{ stopColor: look.halo, stopOpacity: 0 }}
              />
            </radialGradient>
            <radialGradient id={bulbId}>
              <stop
                offset="0"
                style={{ stopColor: look.hot, stopOpacity: 0.95 }}
              />
              <stop
                offset="1"
                style={{ stopColor: look.hot, stopOpacity: 0 }}
              />
            </radialGradient>
            <linearGradient id={metalId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: METAL.light }} />
              <stop offset="0.4" style={{ stopColor: METAL.base }} />
              <stop offset="1" style={{ stopColor: METAL.shade }} />
            </linearGradient>
          </defs>

          {tier > 0 ? (
            <motion.ellipse
              cx={CX}
              cy={34}
              rx={27}
              ry={28}
              style={{ fill: `url(#${haloId})`, opacity: haloAlpha }}
            />
          ) : null}

          <path d={GLASS_PATH} style={{ fill: `url(#${liquidId})` }} />
          <g clipPath={`url(#${glassId})`}>
            <motion.ellipse
              cx={CX}
              cy={48}
              rx={13}
              ry={11}
              style={{ fill: `url(#${bulbId})`, opacity: bulbAlpha }}
            />
            <motion.path d={necks} style={{ fill: `url(#${waxId})` }} />
            <motion.path d={bodies} style={{ fill: `url(#${waxId})` }} />
            {tier === 2 ? (
              <motion.path
                d={shine}
                style={{ fill: look.hot, opacity: r2(0.25 + 0.45 * g) }}
              />
            ) : null}
          </g>
          {tier === 2 ? (
            <path
              d="M 24.8 15.5 C 23.2 23.5 21.9 31 22.1 37"
              fill="none"
              strokeWidth={1}
              strokeLinecap="round"
              opacity={0.4}
              style={{ stroke: METAL.light }}
            />
          ) : null}
          <path
            d={GLASS_PATH}
            fill="none"
            strokeWidth={fine}
            strokeLinejoin="round"
            style={{
              stroke: "color-mix(in oklab, var(--ink-2) 55%, transparent)",
            }}
          />

          <path
            d={CAP_PATH}
            strokeWidth={fine}
            strokeLinejoin="round"
            style={{ fill: `url(#${metalId})`, stroke: METAL.edge }}
          />
          <path
            d={BASE_PATH}
            strokeWidth={fine}
            strokeLinejoin="round"
            style={{ fill: `url(#${metalId})`, stroke: METAL.edge }}
          />
          {tier === 2 ? (
            <path
              d="M 21.5 53.8 L 42.5 53.8"
              strokeWidth={0.8}
              style={{ stroke: METAL.edge }}
            />
          ) : null}
        </svg>
      </button>
      <span
        role={role}
        aria-label={label}
        aria-valuemin={share === null ? undefined : 0}
        aria-valuemax={share === null ? undefined : 100}
        aria-valuenow={share === null ? undefined : Math.round(share * 100)}
        className={
          hideLabel ? "sr-only" : "min-w-0 text-sm leading-snug text-foreground"
        }
      >
        {label}
      </span>
      <span id={hintId} className="sr-only">
        Press to warm the wax on the bulb; the pointer warms the blob nearest
        it.
      </span>
    </span>
  );
}
