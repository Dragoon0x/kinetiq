"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type KettleSteamBody = "steel" | "enamel" | "copper";

export type KettleSteamProps = {
  /** What is on the boil: the loader's accessible name, shown beside the kettle unless `hideLabel`. @default "Loading" */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px. Detail is simplified below 24 and below 44. @default 24 */
  size?: number;
  /** How fast the water churns and the steam curls, 0.5 to 2. @default 1 */
  speed?: number;
  /** How close to the boil, 0 to 1. Omitted, the kettle simmers. At 1 the whistle flips open and the steam jets. */
  progress?: number;
  /** How much steam, 0 (a faint thread) to 1 (a dense plume). @default 0.6 */
  steam?: number;
  /** The kettle's finish. @default "steel" */
  body?: KettleSteamBody;
  /** Hum while the kettle is held, whistle when it is pressed at the boil. Off unless asked for. @default false */
  sound?: boolean;
  /** The kettle keeps boiling but takes no presses. @default false */
  disabled?: boolean;
  className?: string;
};

type Pt = [number, number];
type Tier = 0 | 1 | 2;

type Pigment = {
  light: string;
  base: string;
  shade: string;
  edge: string;
  handle: string;
};

// Pigments, not text colours: a kettle is an object, so it keeps one
// lightness in both themes instead of following the ink.
const BODIES: Record<KettleSteamBody, Pigment> = {
  steel: {
    light: "oklch(0.94 0.006 250)",
    base: "oklch(0.79 0.012 250)",
    shade: "oklch(0.6 0.016 250)",
    edge: "oklch(0.42 0.018 250)",
    handle: "oklch(0.3 0.012 250)",
  },
  enamel: {
    light: "oklch(0.87 0.06 190)",
    base: "oklch(0.72 0.1 192)",
    shade: "oklch(0.57 0.09 196)",
    edge: "oklch(0.38 0.06 200)",
    handle: "oklch(0.28 0.015 250)",
  },
  copper: {
    light: "oklch(0.84 0.08 62)",
    base: "oklch(0.68 0.13 48)",
    shade: "oklch(0.53 0.12 42)",
    edge: "oklch(0.37 0.08 40)",
    handle: "oklch(0.3 0.035 50)",
  },
};

// Mid grey on a light page, pale on a dark one: steam reads on both.
const STEAM = "color-mix(in oklab, var(--ink-2) 70%, white)";
const WATER_COOL = "oklch(0.66 0.1 238)";
const WATER_HOT = "oklch(0.82 0.07 200)";
const GLASS = "oklch(0.52 0.03 235)";
const BUBBLE = "oklch(0.96 0.02 220)";
const HEAT = "oklch(0.7 0.16 42)";

/* The drawing, in a 64-unit box. The kettle sits left so the steam has room
   to lean either way above the spout without leaving the box. */
const BODY_PATH =
  "M 8.5 58 C 5.8 58 5 56 5.4 53.8 L 9 39 C 10.4 33 15.8 29.6 22 29.6 C 28.2 29.6 33.6 33 35 39 L 38.6 53.8 C 39 56 38.2 58 35.5 58 Z";
const LID_PATH = "M 16.2 30.5 C 17.1 27.2 26.9 27.2 27.8 30.5 Z";
const HANDLE_PATH = "M 10.6 35.5 C 9.2 18.5 34.8 18.5 33.4 35.5";
const GRIP_PATH = "M 16.4 23.6 C 19.6 22.3 24.4 22.3 27.6 23.6";
const SPOUT_PATH =
  "M 35.5 46 C 40.5 44.6 43 40 44.6 33.6 L 47.8 31.6 L 48.4 34.8 C 46.6 42.6 43.4 51 37.6 53.8 Z";
const SHEEN_PATH = "M 9.6 51.5 C 9.4 46 10.4 41 12.8 37.2";
const MOUTH: Pt = [46.4, 31.6];
const PORT = { x: 17.5, y: 46.5, r: 5.6, bezel: 6.7 };
const SURFACE = 45.6;
const FLOOR = 51.4;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Seeded bubbles: the same sight glass on the server and in the browser. */
const BUBBLES = (() => {
  const rand = lcg(0x6b3a91);
  return Array.from({ length: 7 }, (_, i) => ({
    x: r2(14 + rand() * 7),
    rate: r2(0.55 + rand() * 0.5),
    off: r2((i / 7 + rand() * 0.1) % 1),
    r: r2(0.55 + rand() * 0.45),
  }));
})();

const WISPS = [
  { len: 1, phase: 0, freq: 0.55, amp: 1, dx: 0, alpha: 0.9 },
  { len: 0.8, phase: 2.1, freq: 0.68, amp: 0.8, dx: -0.9, alpha: 0.62 },
  { len: 0.9, phase: 4.2, freq: 0.46, amp: 0.9, dx: 0.8, alpha: 0.5 },
] as const;

/** A smooth open path through the points (Catmull-Rom as cubic Béziers). */
function through(pts: readonly Pt[]): string {
  let d = "";
  const n = pts.length;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)] as Pt;
    const p1 = pts[i] as Pt;
    const p2 = pts[i + 1] as Pt;
    const p3 = pts[Math.min(n - 1, i + 2)] as Pt;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return d;
}

/** A filled ribbon of the given widths along a centreline. */
function ribbon(center: readonly Pt[], widths: readonly number[]): string {
  const n = center.length;
  if (n < 2) return "";
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = center[Math.max(0, i - 1)] as Pt;
    const b = center[Math.min(n - 1, i + 1)] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tx = (b[0] - a[0]) / len;
    const ty = (b[1] - a[1]) / len;
    const h = (widths[i] ?? 0) / 2;
    const c = center[i] as Pt;
    left.push([c[0] - ty * h, c[1] + tx * h]);
    right.push([c[0] + ty * h, c[1] - tx * h]);
  }
  right.reverse();
  return `M ${f(left[0] as Pt)}${through(left)} L ${f(right[0] as Pt)}${through(right)} Z`;
}

/** A clockwise arc from twelve o'clock round the given share of a circle. */
function arc(cx: number, cy: number, r: number, share: number): string {
  if (share <= 0.004) return "";
  if (share >= 0.996) {
    return `M ${cx} ${r2(cy - r)} A ${r} ${r} 0 1 1 ${cx} ${r2(cy + r)} A ${r} ${r} 0 1 1 ${cx} ${r2(cy - r)}`;
  }
  const a = share * Math.PI * 2;
  const x = r2(cx + r * Math.sin(a));
  const y = r2(cy - r * Math.cos(a));
  return `M ${cx} ${r2(cy - r)} A ${r} ${r} 0 ${share > 0.5 ? 1 : 0} 1 ${x} ${y}`;
}

type Scene = {
  /** The kettle's own clock, in seconds of churn. */
  t: number;
  /** How hot, 0 to 1, before the hand's boost. */
  heat: number;
  phases: readonly number[];
  steam: number;
  boost: number;
  bend: number;
  jet: number;
  calm: number;
  /** Determinate share for the bezel, or null while simmering. */
  shown: number | null;
  tier: Tier;
  /** viewBox units per screen pixel. */
  unit: number;
  moving: boolean;
  breath: number;
};

type Painted = {
  wisps: [string, string, string];
  alphas: [number, number, number];
  plume: string;
  bubbles: string;
  water: string;
  tint: number;
  bezel: string;
  lid: number;
};

/** One wisp's centreline and widths: a curl that travels up it, a lean from the pointer, a jet it straightens into. */
function wisp(s: Scene, i: number, amount: number, still: boolean) {
  const w = WISPS[i] ?? WISPS[0];
  const t = still ? 0.35 : s.t;
  const bend = still ? 0 : s.bend;
  const jet = still ? 0 : s.jet;
  const height = (9 + 19 * Math.min(1, amount)) * w.len;
  const jetHeight = 28.5 * Math.sqrt(w.len);
  const thick = 0.5 + 0.7 * Math.min(1, amount);
  const least = 0.9 * s.unit;
  const pts: Pt[] = [];
  const widths: number[] = [];
  const n = 14;
  for (let k = 0; k < n; k += 1) {
    const u = k / (n - 1);
    const curl =
      (0.5 + 3.2 * u) *
      w.amp *
      (1 - 0.85 * jet) *
      Math.sin(Math.PI * 2 * (1.15 * u - w.freq * t) + w.phase);
    const xw =
      MOUTH[0] +
      w.dx * u +
      2.2 * Math.sqrt(u) +
      curl +
      bend * 11 * Math.pow(u, 1.5);
    const yw = MOUTH[1] - height * u;
    const xj = MOUTH[0] + 0.26 * jetHeight * u + curl * 0.3;
    const yj = MOUTH[1] - jetHeight * u;
    const width = Math.max(
      least,
      thick * (0.7 + 3.8 * u) * (1 + 0.9 * jet * u),
    );
    const x = xw + (xj - xw) * jet;
    pts.push([
      clamp(x, width / 2 + 0.5, 63.5 - width / 2),
      yw + (yj - yw) * jet,
    ]);
    widths.push(width);
  }
  return ribbon(pts, widths);
}

function paint(s: Scene): Painted {
  const hot = clamp01(s.heat + 0.4 * s.boost);
  const lift = smooth(0.12, 0.8, hot);
  const amount =
    (0.14 + 0.86 * clamp01(s.steam)) * lift * (1 - 0.55 * s.calm) + 0.6 * s.jet;
  const count =
    s.tier === 0
      ? 1
      : Math.min(
          s.tier === 1 ? 2 : 3,
          s.steam >= 0.66 ? 3 : s.steam >= 0.33 ? 2 : 1,
        );
  const breath = s.moving ? 1 : 0.72 + 0.28 * s.breath;
  const wisps: [string, string, string] = ["", "", ""];
  const alphas: [number, number, number] = [0, 0, 0];
  if (amount > 0.02) {
    for (let i = 0; i < count; i += 1) {
      wisps[i] = wisp(s, i, amount, !s.moving);
      alphas[i] = r2(
        Math.min(1, 0.3 + 0.7 * amount) * (WISPS[i]?.alpha ?? 0.5) * breath,
      );
    }
  }
  // Under reduced motion the jet is its own still plume that fades in and
  // out; with motion the wisps themselves straighten into it.
  const plume = s.moving
    ? ""
    : wisp({ ...s, jet: 1, bend: 0, t: 0.35, moving: true }, 0, 1.2, false);

  let bubbles = "";
  if (s.tier > 0) {
    const shown = s.tier === 2 ? 7 : 4;
    const active = (0.2 + 0.8 * hot) * shown;
    for (let i = 0; i < shown; i += 1) {
      const b = BUBBLES[i];
      const phase = s.phases[i] ?? 0;
      if (!b || i >= Math.ceil(active)) continue;
      const scale = Math.min(1, active - i) * (s.tier === 1 ? 1.5 : 1);
      const pop = phase > 0.9 ? (1 - phase) / 0.1 : 1;
      const r = r2(b.r * (0.6 + 0.5 * phase) * scale * pop);
      if (r < 0.15) continue;
      const x = r2(b.x + 0.5 * Math.sin(phase * 9 + i));
      const y = r2(FLOOR - phase * (FLOOR - SURFACE - 0.6));
      bubbles += `M ${r2(x - r)} ${y} a ${r} ${r} 0 1 0 ${r2(2 * r)} 0 a ${r} ${r} 0 1 0 ${r2(-2 * r)} 0 `;
    }
  }

  const wave = s.moving ? 0.18 + 0.42 * hot : 0.12;
  const top: Pt[] = [];
  for (let k = 0; k <= 6; k += 1) {
    const x = 11.5 + k * 2;
    top.push([
      x,
      SURFACE -
        0.3 * hot +
        wave * Math.sin(0.95 * x + (s.moving ? 5.5 * s.t : 0.6)),
    ]);
  }
  const water = `M ${f(top[0] as Pt)}${through(top)} L 23.5 53.5 L 11.5 53.5 Z`;

  const rattle = s.moving
    ? -0.9 *
      Math.max(0, Math.sin(s.t * 34)) *
      smooth(0.86, 1, hot) *
      (1 - s.calm)
    : 0;

  return {
    wisps,
    alphas,
    plume,
    bubbles: bubbles.trim(),
    water,
    tint: Math.round(hot * 100),
    bezel:
      s.shown === null || s.tier === 0
        ? ""
        : arc(PORT.x, PORT.y, PORT.bezel, s.shown),
    lid: r2(rattle),
  };
}

/**
 * An inline loader drawn as a stovetop kettle coming to the boil. Bubbles
 * rise in its round sight glass, faster and more of them as it heats, and
 * steam curls from the spout: filled ribbons whose curl travels up them,
 * widening and fading as they climb, leaning away from the pointer on the
 * drift spring. Given `progress`, heat is the progress — the bezel round the
 * glass fills like a dial, the lid starts to rattle near the top — and at 1
 * the whistle flips open on the recoil spring and the steam jets, then
 * settles into a still wisp and every frame stops. Without it, it simmers.
 *
 * The kettle is a real button: held (pointer, Space or Enter) it turns up
 * the flame — the water churns, the steam thickens — and at the boil a press
 * blows the whistle. The label sits in a `role="progressbar"` (or
 * `role="status"`) beside it. Under reduced motion nothing travels: the
 * steam is a still ribbon that breathes, the bubbles are still, the bezel
 * still fills and the jet fades in as a still plume.
 */
export function KettleSteam({
  label = "Loading",
  hideLabel = false,
  size = 24,
  speed = 1,
  progress,
  steam = 0.6,
  body = "steel",
  sound = false,
  disabled = false,
  className,
}: KettleSteamProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const portId = `${uid}-port`;
  const steamId = `${uid}-steam`;
  const shineId = `${uid}-shine`;

  const px = Math.max(12, Math.round(size));
  const tier: Tier = px < 24 ? 0 : px < 44 ? 1 : 2;
  const unit = 64 / px;
  const sp = clamp(speed, 0.5, 2);
  const determinate = typeof progress === "number" && Number.isFinite(progress);
  const share = determinate ? clamp01(progress) : null;
  const done = share !== null && share >= 1;
  const pigment = BODIES[body] ?? BODIES.steel;

  const [first] = React.useState(() => {
    const heat = share ?? 0.56;
    const scene: Scene = {
      t: 0,
      heat,
      phases: BUBBLES.map((b) => b.off),
      steam,
      boost: 0,
      bend: 0,
      jet: 0,
      calm: done ? 1 : 0,
      shown: share,
      tier,
      unit,
      moving: true,
      breath: 0,
    };
    return { scene, painted: paint(scene) };
  });

  const wisp0 = useMotionValue(first.painted.wisps[0]);
  const wisp1 = useMotionValue(first.painted.wisps[1]);
  const wisp2 = useMotionValue(first.painted.wisps[2]);
  const alpha0 = useMotionValue(first.painted.alphas[0]);
  const alpha1 = useMotionValue(first.painted.alphas[1]);
  const alpha2 = useMotionValue(first.painted.alphas[2]);
  const plume = useMotionValue(first.painted.plume);
  const bubbles = useMotionValue(first.painted.bubbles);
  const water = useMotionValue(first.painted.water);
  const bezel = useMotionValue(first.painted.bezel);
  const lid = useMotionValue(first.painted.lid);
  const tint = useMotionValue(first.painted.tint);
  const boost = useMotionValue(0);
  const bend = useMotionValue(0);
  const jet = useMotionValue(0);
  const calm = useMotionValue(done ? 1 : 0);
  const flap = useMotionValue(done ? 1 : 0);
  const squash = useMotionValue(1);

  const waterFill = useTransform(
    tint,
    (p) => `color-mix(in oklch, ${WATER_HOT} ${p}%, ${WATER_COOL})`,
  );
  const plumeAlpha = useTransform(jet, (j) => r2(0.8 * j));
  const flapTurn = useTransform(flap, (v) => r2(-80 * v));
  const squashX = useTransform(squash, (s) => r2(1 + (1 - s) * 0.6));

  const glyphRef = React.useRef<HTMLButtonElement | null>(null);
  const sim = React.useRef({
    t: first.scene.t,
    heat: first.scene.heat,
    phases: [...first.scene.phases],
    breath: 0,
    /** The breath's own clock: under reduced motion the kettle's clock stands still. */
    lung: 0,
  });
  const loop = React.useRef({ raf: 0, last: 0, seen: false });
  const step = React.useRef<(dt: number) => boolean>(() => false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const hum = React.useRef<{ loop: LoopHandle; pitch: number } | null>(null);
  const held = React.useRef<"pointer" | "key" | null>(null);
  const detach = React.useRef<(() => void) | null>(null);
  const keyAt = React.useRef(0);
  const leaning = React.useRef(0);
  const tapTimer = React.useRef(0);

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

  // The frame loop runs only while the kettle is on screen in a visible
  // page, and ends itself once nothing is moving (the boiled, still kettle).
  const wake = React.useCallback(() => {
    const l = loop.current;
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 0;
      l.last = now;
      if (!l.seen || document.hidden) {
        l.raf = 0;
        return;
      }
      l.raf = 0;
      if (step.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  }, []);

  const stopHum = React.useCallback(() => {
    hum.current?.loop.stop();
    hum.current = null;
  }, []);

  React.useEffect(() => {
    step.current = (dt: number) => {
      const s = sim.current;
      const target =
        share === null
          ? 0.56 + (motionSafe ? 0.06 * Math.sin(0.45 * s.t) : 0)
          : share;
      const jetting = jet.isAnimating();
      const frozen =
        done && !jetting && calm.get() > 0.995 && !calm.isAnimating();
      if (motionSafe) {
        if (!frozen) {
          s.t += dt * sp;
          const hot = clamp01(s.heat + 0.4 * boost.get());
          s.phases = s.phases.map((p, i) => {
            const next =
              p + dt * sp * (BUBBLES[i]?.rate ?? 0.7) * (0.3 + 1.2 * hot);
            return next >= 1 ? next - 1 : next;
          });
        }
        s.heat += (target - s.heat) * (1 - Math.exp(-dt * 3.2));
        if (Math.abs(target - s.heat) < 0.0005) s.heat = target;
      } else {
        // Still: only a slow breath of the steam's opacity says it is working.
        s.heat = target;
        s.lung += dt;
        s.breath = done ? 0 : Math.sin(s.lung * 2.6);
      }
      const painted = paint({
        t: s.t,
        heat: s.heat,
        phases: s.phases,
        steam,
        boost: boost.get(),
        bend: bend.get(),
        jet: jet.get(),
        calm: calm.get(),
        shown: share === null ? null : s.heat,
        tier,
        unit,
        moving: motionSafe,
        breath: s.breath,
      });
      wisp0.set(painted.wisps[0]);
      wisp1.set(painted.wisps[1]);
      wisp2.set(painted.wisps[2]);
      alpha0.set(painted.alphas[0]);
      alpha1.set(painted.alphas[1]);
      alpha2.set(painted.alphas[2]);
      plume.set(painted.plume);
      bubbles.set(painted.bubbles);
      water.set(painted.water);
      bezel.set(painted.bezel);
      lid.set(painted.lid);
      tint.set(painted.tint);
      const h = hum.current;
      const pitch = r2(0.8 + 0.6 * clamp01(s.heat + 0.4 * boost.get()));
      if (h && Math.abs(h.pitch - pitch) > 0.02) {
        h.loop.set({ pitch });
        h.pitch = pitch;
      }
      if (!motionSafe) return !done;
      const busy =
        !frozen ||
        boost.isAnimating() ||
        boost.get() > 0.001 ||
        bend.isAnimating() ||
        s.heat !== target;
      return busy;
    };
  });

  const panOfSpout = () => {
    const rect = glyphRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + (rect.width * MOUTH[0]) / 64, null) : 0;
  };

  /** The whistle flips open and the steam jets, then settles. */
  const blow = (withSound: boolean) => {
    if (withSound) {
      audio.play("whistle", {
        pitch: r2(0.94 + 0.06 * sp),
        gain: 0.6,
        pan: panOfSpout(),
      });
    }
    calm.set(0);
    const settle = () => {
      if (!done) return;
      run(
        "calm",
        motionSafe
          ? animate(calm, 1, { ...springs.drift, onComplete: wake })
          : animate(calm, 1, { duration: durations.base, onComplete: wake }),
      );
      wake();
    };
    run(
      "jet",
      animate(jet, [jet.get(), 1, 1, 0], {
        duration: (motionSafe ? 1.9 : 1.6) / sp,
        times: [0, 0.1, 0.55, 1],
        ease: [easings.enter, easings.linear, easings.exit],
        onComplete: settle,
      }),
    );
    if (motionSafe) run("flap", animate(flap, 1, springs.recoil));
    else flap.set(1);
    wake();
  };

  const api = React.useRef<{
    blow: (withSound: boolean) => void;
    release: (source: "pointer" | "key") => void;
  }>({ blow, release: () => {} });
  React.useEffect(() => {
    api.current = { blow, release };
  });

  // Reaching the boil jets the steam, silently: nothing sounds on its own.
  // Leaving it (a new run) closes the whistle.
  const shownDone = React.useRef(done);
  React.useEffect(() => {
    if (shownDone.current === done) return;
    shownDone.current = done;
    if (done) {
      api.current.blow(false);
      return;
    }
    anims.current.get("jet")?.stop();
    anims.current.get("calm")?.stop();
    jet.set(0);
    calm.set(0);
    if (motionSafe) run("flap", animate(flap, 0, springs.snap));
    else flap.set(0);
  }, [done, motionSafe, jet, calm, flap, run]);

  // Any change of what is drawn repaints once and wakes the loop.
  React.useEffect(() => {
    step.current(0);
    wake();
  }, [share, sp, steam, tier, unit, motionSafe, body, wake]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        sleep();
        api.current.release(held.current ?? "key");
      } else {
        wake();
      }
    };
    const onBlur = () => api.current.release(held.current ?? "key");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [sleep, wake]);

  React.useEffect(() => {
    const running = anims.current;
    const timer = tapTimer;
    return () => {
      sleep();
      window.clearTimeout(timer.current);
      detach.current?.();
      detach.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
      hum.current?.loop.stop();
      hum.current = null;
    };
  }, [sleep]);

  React.useEffect(() => {
    if (disabled) release(held.current ?? "key");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const bindGlyph = React.useCallback(
    (node: HTMLButtonElement | null) => {
      glyphRef.current = node;
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

  const press = (source: "pointer" | "key") => {
    if (disabled || held.current) return;
    held.current = source;
    if (motionSafe) {
      squash.jump(0.955);
      run("squash", animate(squash, 1, springs.flick));
    }
    if (done) {
      blow(true);
      return;
    }
    run(
      "boost",
      animate(
        boost,
        1,
        motionSafe ? springs.snap : { duration: durations.fast },
      ),
    );
    if (!hum.current) {
      const pitch = r2(0.8 + 0.6 * clamp01(sim.current.heat + 0.4));
      const handle = audio.start("hum", {
        pitch,
        gain: 0.55,
        pan: panOfSpout(),
      });
      hum.current = { loop: handle, pitch };
    }
    wake();
  };

  function release(source: "pointer" | "key") {
    if (held.current !== source) return;
    held.current = null;
    detach.current?.();
    detach.current = null;
    stopHum();
    if (boost.get() > 0 || boost.isAnimating()) {
      run(
        "boost",
        animate(
          boost,
          0,
          motionSafe ? springs.drift : { duration: durations.base },
        ),
      );
      wake();
    }
  }

  const tap = () => {
    press("key");
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(() => release("key"), 160);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    detach.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      release("pointer");
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    press("pointer");
    detach.current = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  };

  /** The steam leans away from the pointer, lazily. */
  const lean = (target: number) => {
    if (!motionSafe) return;
    if (Math.abs(target - leaning.current) < 0.03) return;
    leaning.current = target;
    run("bend", animate(bend, target, springs.drift));
    wake();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 64;
    const y = ((event.clientY - rect.top) / rect.height) * 64;
    const near = y < 36 ? 1 : 0.7;
    lean(r2(clamp((MOUTH[0] + 3 - x) / 14, -1, 1) * near));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    keyAt.current = event.timeStamp;
    if (!event.repeat) press("key");
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    keyAt.current = event.timeStamp;
    release("key");
  };

  const stroke = r2(Math.max(0.9, 1.1 * unit));
  const fine = r2(Math.max(0.6, 0.8 * unit));
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
        aria-label={done ? "Blow the whistle" : "Turn up the heat"}
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => lean(0)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => release("key")}
        onClick={(event) => {
          // Pointer presses arrive through pointerdown and keys through
          // keydown. A click with neither behind it — assistive technology
          // activating the button — is a tap.
          if (event.detail !== 0) return;
          if (event.timeStamp - keyAt.current < 400) return;
          tap();
        }}
        onContextMenu={(event) => event.preventDefault()}
        className={cn(
          "relative shrink-0 touch-manipulation rounded-2 outline-none select-none [-webkit-touch-callout:none]",
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
            <linearGradient
              id={steamId}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={MOUTH[1]}
              x2={0}
              y2={2}
            >
              <stop offset="0" style={{ stopColor: STEAM, stopOpacity: 0 }} />
              <stop
                offset="0.18"
                style={{ stopColor: STEAM, stopOpacity: 0.8 }}
              />
              <stop
                offset="0.5"
                style={{ stopColor: STEAM, stopOpacity: 0.55 }}
              />
              <stop offset="1" style={{ stopColor: STEAM, stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id={shineId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" style={{ stopColor: pigment.light }} />
              <stop offset="0.38" style={{ stopColor: pigment.base }} />
              <stop offset="1" style={{ stopColor: pigment.shade }} />
            </linearGradient>
            <clipPath id={portId}>
              <circle cx={PORT.x} cy={PORT.y} r={PORT.r} />
            </clipPath>
          </defs>

          <ellipse
            cx={22}
            cy={59.8}
            rx={15}
            ry={1.6}
            className="fill-ink-3/20"
          />

          <motion.g
            style={{
              scaleY: squash,
              scaleX: squashX,
              originX: 0.5,
              originY: 1,
            }}
          >
            <path
              d={HANDLE_PATH}
              fill="none"
              strokeWidth={r2(Math.max(1.5, 1.2 * unit))}
              strokeLinecap="round"
              style={{ stroke: pigment.edge }}
            />
            {tier > 0 ? (
              <path
                d={GRIP_PATH}
                fill="none"
                strokeWidth={3}
                strokeLinecap="round"
                style={{ stroke: pigment.handle }}
              />
            ) : null}
            <path
              d={SPOUT_PATH}
              strokeWidth={stroke}
              strokeLinejoin="round"
              style={{ fill: `url(#${shineId})`, stroke: pigment.edge }}
            />
            {tier === 2 ? (
              <g transform="rotate(-32 44.6 33.4)">
                <motion.rect
                  x={44.6}
                  y={31.4}
                  width={4}
                  height={2}
                  rx={0.8}
                  style={{
                    fill: pigment.handle,
                    rotate: flapTurn,
                    originX: 0,
                    originY: 1,
                  }}
                />
              </g>
            ) : null}
            <path
              d={BODY_PATH}
              strokeWidth={stroke}
              strokeLinejoin="round"
              style={{ fill: `url(#${shineId})`, stroke: pigment.edge }}
            />
            {tier === 2 ? (
              <path
                d={SHEEN_PATH}
                fill="none"
                strokeWidth={1.4}
                strokeLinecap="round"
                opacity={0.7}
                style={{ stroke: pigment.light }}
              />
            ) : null}
            <motion.g style={{ y: lid }}>
              <path
                d={LID_PATH}
                strokeWidth={fine}
                strokeLinejoin="round"
                style={{ fill: pigment.base, stroke: pigment.edge }}
              />
              {tier > 0 ? (
                <circle
                  cx={22}
                  cy={26.4}
                  r={2}
                  style={{ fill: pigment.handle }}
                />
              ) : null}
            </motion.g>

            {tier > 0 ? (
              <g>
                <circle
                  cx={PORT.x}
                  cy={PORT.y}
                  r={PORT.r}
                  style={{ fill: GLASS }}
                />
                <g clipPath={`url(#${portId})`}>
                  <motion.path d={water} style={{ fill: waterFill }} />
                  <motion.path
                    d={bubbles}
                    opacity={0.85}
                    style={{ fill: BUBBLE }}
                  />
                </g>
                {tier === 2 ? (
                  <path
                    d="M 13.6 44 A 4.2 4.2 0 0 1 16.4 41.4"
                    fill="none"
                    strokeWidth={0.9}
                    strokeLinecap="round"
                    opacity={0.75}
                    style={{ stroke: BUBBLE }}
                  />
                ) : null}
                <circle
                  cx={PORT.x}
                  cy={PORT.y}
                  r={PORT.bezel}
                  fill="none"
                  strokeWidth={r2(Math.max(1.2, 0.9 * unit))}
                  style={{ stroke: pigment.edge }}
                />
                <motion.path
                  d={bezel}
                  fill="none"
                  strokeWidth={r2(Math.max(1.2, 0.9 * unit))}
                  strokeLinecap="round"
                  style={{ stroke: HEAT }}
                />
              </g>
            ) : null}
          </motion.g>

          <motion.path
            d={wisp0}
            style={{ fill: `url(#${steamId})`, opacity: alpha0 }}
          />
          <motion.path
            d={wisp1}
            style={{ fill: `url(#${steamId})`, opacity: alpha1 }}
          />
          <motion.path
            d={wisp2}
            style={{ fill: `url(#${steamId})`, opacity: alpha2 }}
          />
          <motion.path
            d={plume}
            style={{ fill: `url(#${steamId})`, opacity: plumeAlpha }}
          />
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
        {done
          ? "It has boiled: press to blow the whistle."
          : "Hold to turn up the heat."}
      </span>
    </span>
  );
}
