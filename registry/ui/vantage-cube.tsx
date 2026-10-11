"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type VantageCubeWord = {
  /** The word, read from its vantage. Up to 8 letters read best. */
  text: string;
  /** The vantage's turn about the vertical axis, in degrees. */
  yaw: number;
  /** The vantage's tip about the horizontal axis, in degrees. */
  pitch: number;
};

export type VantageCubeProps = {
  /** The words hidden in the cube and the angles they read from. @default FIELD, LINE, DRIFT, NORTH */
  words?: VantageCubeWord[];
  /** The word the cube shows (controlled), by index. */
  value?: number;
  /** The word to begin on. @default 0 */
  defaultValue?: number;
  /** Fires when a word locks — from the pointer, a drag or a key — with its index. */
  onValueChange?: (index: number) => void;
  /** How many loose letters fill the cube besides the words, 0 to 1. @default 0.5 */
  density?: number;
  /** How far the letters are spread in depth, 0 (nearly flat) to 1 (the whole cube). @default 0.6 */
  depth?: number;
  /** How lazily the cube follows the pointer, 0 (at once) to 1 (slow and heavy). @default 0.45 */
  lag?: number;
  /** How close to a vantage, in degrees, the cube snaps to it and locks. @default 7 */
  snap?: number;
  /** How far the cube turns toward the pointer at the box's edge, in degrees. @default 50 */
  range?: number;
  /** Viewing distance in cube widths: low is a strong wide-angle look. @default 3.2 */
  perspective?: number;
  /** Sweep a glint across a word when it locks. @default true */
  glint?: boolean;
  /** Draw the cube's edges. @default true */
  edges?: boolean;
  /** Seeds where the letters float. @default 3 */
  seed?: number;
  /** Fires each time a word locks, with its index (also on a return to the same word). */
  onLock?: (index: number) => void;
  /** The cube's accessible name. @default "Word cube" */
  label?: string;
  /** No following, dragging or keys. @default false */
  disabled?: boolean;
  /** Sizes the cube's box; give it a height. @default "h-52 w-full" */
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const RAD = Math.PI / 180;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type V3 = [number, number, number];

/** CSS's rotateX(a) applied to a point (y down, z toward the viewer). */
const rotX = ([x, y, z]: V3, a: number): V3 => {
  const c = Math.cos(a * RAD);
  const s = Math.sin(a * RAD);
  return [x, c * y - s * z, s * y + c * z];
};
/** CSS's rotateY(a) applied to a point. */
const rotY = ([x, y, z]: V3, a: number): V3 => {
  const c = Math.cos(a * RAD);
  const s = Math.sin(a * RAD);
  return [c * x + s * z, y, -s * x + c * z];
};
/** Cube space to view space for the cube turned to (yaw, pitch): rotateX(pitch) rotateY(yaw). */
const toView = (q: V3, yaw: number, pitch: number) => rotX(rotY(q, yaw), pitch);
/** View space back to cube space. */
const toCube = (v: V3, yaw: number, pitch: number) =>
  rotY(rotX(v, -pitch), -yaw);

const angle = (ay: number, ap: number, by: number, bp: number) =>
  Math.hypot(ay - by, ap - bp);

export const defaultVantageCubeWords: VantageCubeWord[] = [
  { text: "FIELD", yaw: -30, pitch: 12 },
  { text: "LINE", yaw: 28, pitch: -14 },
  { text: "DRIFT", yaw: -8, pitch: -26 },
  { text: "NORTH", yaw: 18, pitch: 24 },
];

const ALPHABET = "ABCDEFGHIJKLMNOPRSTUVWY";

type Glyph = {
  char: string;
  /** The word it belongs to, or -1 for a loose letter. */
  word: number;
  /** Position in the word, for the glint's order. */
  at: number;
  transform: string;
  size: number;
};

type Rule = { word: number; transform: string; width: number };

const S = (v: number) => `calc(var(--vc-s) * ${r3(v)})`;

/**
 * Where every letter floats. A word's letters are placed by working back
 * from its vantage: in view space each stands on one baseline at its own
 * depth, pushed out and scaled by (P − z)/P so the perspective brings them
 * back to one size and one row; turned into cube space they look scattered
 * from anywhere else. Loose letters are rejected wherever they would land
 * on a word's row at its vantage, so every word reads clean. All positions
 * are in units of the cube's half-size, rounded, and identical on the server.
 */
function layout(
  words: VantageCubeWord[],
  seed: number,
  density: number,
  depth: number,
  perspective: number,
) {
  const rnd = lcg(seed * 977 + 31);
  const P = Math.max(1.6, perspective) * 2;
  const longest = Math.max(3, ...words.map((w) => w.text.length));
  const advance = Math.min(0.42, 1.9 / longest);
  const size = r3(advance * 1.32);
  const D = (0.12 + 0.83 * clamp(depth, 0, 1)) * 0.95;
  const rows = words.map((w) => ({
    half: (w.text.length * advance) / 2 + advance * 0.3,
    yaw: w.yaw,
    pitch: w.pitch,
  }));
  /** Does cube point q land on another word's row, seen from that word's vantage? */
  /**
   * How far cube point q lands inside another word's row, seen from that
   * word's vantage: 0 when it is clear of every row.
   */
  const blocks = (q: V3, except: number) => {
    let worst = 0;
    for (let w = 0; w < rows.length; w += 1) {
      if (w === except) continue;
      const row = rows[w];
      if (!row) continue;
      const v = toView(q, row.yaw, row.pitch);
      const k = P / Math.max(0.3, P - v[2]);
      const ox = row.half + size * 0.3 - Math.abs(v[0] * k);
      const oy = size * 1.05 - Math.abs(v[1] * k);
      if (ox > 0 && oy > 0) worst = Math.max(worst, Math.min(ox, oy));
    }
    return worst;
  };

  const glyphs: Glyph[] = [];
  const rules: Rule[] = [];
  words.forEach((w, wi) => {
    const chars = Array.from(w.text.toUpperCase());
    const n = chars.length;
    chars.forEach((char, i) => {
      const X = (i - (n - 1) / 2) * advance;
      // The depth that keeps this letter furthest out of the other rows.
      let best: V3 | null = null;
      let bestK = 1;
      let bestHit = Infinity;
      for (let tries = 0; tries < 24; tries += 1) {
        const z = (rnd() * 2 - 1) * D;
        const k = (P - z) / P;
        const q = toCube([X * k, 0, z], w.yaw, w.pitch);
        const hit = blocks(q, wi);
        if (hit < bestHit) {
          best = q;
          bestK = k;
          bestHit = hit;
        }
        if (hit === 0) break;
      }
      if (!best) return;
      glyphs.push({
        char,
        word: wi,
        at: i,
        size,
        transform: `translate3d(${S(best[0])}, ${S(best[1])}, ${S(best[2])}) rotateY(${r2(-w.yaw)}deg) rotateX(${r2(-w.pitch)}deg) scale(${r3(bestK)}) translate(-50%, -50%)`,
      });
    });
    // The rule that draws under a word as it locks, at its own depth zero.
    const below = toCube([0, size * 0.72, 0], w.yaw, w.pitch);
    rules.push({
      word: wi,
      width: r3(n * advance * 0.9),
      transform: `translate3d(${S(below[0])}, ${S(below[1])}, ${S(below[2])}) rotateY(${r2(-w.yaw)}deg) rotateX(${r2(-w.pitch)}deg) translate(-50%, -50%) scaleX(var(--vc-a${wi}))`,
    });
  });

  const loose = Math.round(clamp(density, 0, 1) * 48);
  for (let f = 0; f < loose; f += 1) {
    let q: V3 = [0, 0, 0];
    for (let tries = 0; tries < 10; tries += 1) {
      q = [
        (rnd() * 2 - 1) * 0.92,
        (rnd() * 2 - 1) * 0.92,
        (rnd() * 2 - 1) * 0.92,
      ];
      if (blocks(q, -1) === 0) break;
    }
    const char = ALPHABET[Math.floor(rnd() * ALPHABET.length)] ?? "A";
    const ay = r2((rnd() * 2 - 1) * 70);
    const ax = r2((rnd() * 2 - 1) * 60);
    const sc = r3(0.62 + rnd() * 0.4);
    glyphs.push({
      char,
      word: -1,
      at: 0,
      size,
      transform: `translate3d(${S(q[0])}, ${S(q[1])}, ${S(q[2])}) rotateY(${ay}deg) rotateX(${ax}deg) scale(${sc}) translate(-50%, -50%)`,
    });
  }
  return { glyphs, rules, P };
}

/** The twelve edges of the cube as hairlines, in units of its half-size. */
const EDGES: string[] = (() => {
  const out: string[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      out.push(`translate3d(${S(-1)}, ${S(a)}, ${S(b)})`);
      out.push(`translate3d(${S(a)}, ${S(-1)}, ${S(b)}) rotateZ(90deg)`);
      out.push(`translate3d(${S(a)}, ${S(b)}, ${S(1)}) rotateY(90deg)`);
    }
  }
  return out;
})();

/* ------------------------------- the follower ------------------------------ */

type Mode = "follow" | "lock" | "key" | "home" | "drag";

type SpringK = { k: number; c: number; m: number };

const asSpring = (s: { stiffness: number; damping: number; mass: number }) => ({
  k: s.stiffness,
  c: s.damping,
  m: s.mass,
});
const SNAP = asSpring(springs.snap);
const GLIDE = asSpring(springs.glide);
const DRIFT = asSpring(springs.drift);

/** The follow spring from `lag`: from flick-quick to drift-slow, ζ 0.9. */
const followSpring = (lag: number): SpringK => {
  const k = 380 + (26 - 380) * clamp(lag, 0, 1);
  return { k, c: 2 * 0.9 * Math.sqrt(k), m: 1 };
};

/* -------------------------------- component -------------------------------- */

/**
 * A cube of loose letters floating at different depths. It turns to follow
 * the pointer on a spring whose laziness is `lag`; from most angles it is a
 * scatter, but each word has a vantage from which its letters line up in
 * perspective, one size on one baseline. Near a vantage the cube is drawn
 * toward it, and inside `snap` degrees it locks: it lands exactly on the
 * snap spring, the word brightens, a rule draws under it and a glint
 * sweeps across it. Leave the box and the cube drifts back to the current
 * word and locks again, so at rest it always reads.
 *
 * Only the cube's own turn changes per frame — every letter's place is a
 * static 3D transform worked out once — so it costs one composited layer. It
 * is a slider over the words: Left and Right (or Up and Down) step between
 * them, turning the cube on the glide spring, Home and End jump. Touch and pen
 * drag it round 1:1 and a release projects the throw and locks where it
 * lands. Under reduced motion the cube holds still at the word's vantage and
 * keys swap words with a cross-fade.
 */
export function VantageCube({
  words,
  value,
  defaultValue = 0,
  onValueChange,
  density = 0.5,
  depth = 0.6,
  lag = 0.45,
  snap = 7,
  range = 50,
  perspective = 3.2,
  glint = true,
  edges = true,
  seed = 3,
  onLock,
  label = "Word cube",
  disabled = false,
  className,
}: VantageCubeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const list = words && words.length > 0 ? words : defaultVantageCubeWords;
  const n = list.length;
  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, n - 1),
  );
  const current = clamp(Math.round(value ?? own), 0, n - 1);
  const word = list[current] ?? list[0] ?? { text: "", yaw: 0, pitch: 0 };

  const { glyphs, rules, P } = React.useMemo(
    () => layout(list, seed, density, depth, perspective),
    [list, seed, density, depth, perspective],
  );

  // The first frame reads: the cube starts at its word's vantage, locked.
  const [initial] = React.useState(() => {
    const w = list[current];
    const vars: Record<string, string> = { "--vc-max": "1" };
    list.forEach((_, i) => {
      vars[`--vc-a${i}`] = i === current ? "1" : "0";
    });
    return { yaw: w?.yaw ?? 0, pitch: w?.pitch ?? 0, vars };
  });
  const yaw = useMotionValue(initial.yaw);
  const pitch = useMotionValue(initial.pitch);
  const fade = useMotionValue(1);

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const varsRef = React.useRef<HTMLDivElement | null>(null);
  const letterNodes = React.useRef(new Map<string, HTMLSpanElement>());
  const sim = React.useRef({
    y: initial.yaw,
    p: initial.pitch,
    vy: 0,
    vp: 0,
    ty: initial.yaw,
    tp: initial.pitch,
    rawY: initial.yaw,
    rawP: initial.pitch,
    mode: "lock" as Mode,
    locked: current,
    glinted: true,
    spring: SNAP,
    frame: 0,
    last: 0,
    visible: false,
    dragFrom: { y: 0, p: 0, w: 1 },
  });

  const latest = React.useRef({
    list,
    current,
    lag,
    snap,
    range,
    motionSafe,
    glint,
    disabled,
    value,
    onValueChange,
    onLock,
  });
  React.useEffect(() => {
    latest.current = {
      list,
      current,
      lag,
      snap,
      range,
      motionSafe,
      glint,
      disabled,
      value,
      onValueChange,
      onLock,
    };
  });

  /** Light sweeps across a word's letters, left to right: a tween, three frames. */
  const sweep = React.useCallback((w: number) => {
    if (!latest.current.glint || !latest.current.motionSafe) return;
    const nodes = [...letterNodes.current.entries()]
      .filter(([key]) => key.startsWith(`${w}:`))
      .sort((a, b) => Number(a[0].split(":")[1]) - Number(b[0].split(":")[1]));
    nodes.forEach(([, el], i) => {
      el.animate(
        [
          { textShadow: "0 0 0 transparent", color: "var(--foreground)" },
          {
            textShadow:
              "0 0 0.35em color-mix(in oklab, var(--accent-bright) 70%, transparent)",
            color: "var(--accent-bright)",
          },
          { textShadow: "0 0 0 transparent", color: "var(--foreground)" },
        ],
        {
          duration: 420,
          delay: i * 46,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    });
  }, []);

  /** A word has locked: report it, say it once, and glint when the turn lands. */
  const lockTo = React.useCallback((w: number, announce: boolean) => {
    const s = sim.current;
    const L = latest.current;
    const vw = L.list[w];
    if (!vw) return;
    s.locked = w;
    s.glinted = false;
    s.ty = vw.yaw;
    s.tp = vw.pitch;
    L.onLock?.(w);
    if (w !== L.current) {
      if (L.value === undefined) setOwn(w);
      L.onValueChange?.(w);
    }
    if (announce) {
      setSaid((x) => ({
        n: x.n + 1,
        text: `${vw.text}, word ${w + 1} of ${L.list.length}.`,
      }));
    }
  }, []);

  const writeVars = React.useCallback(() => {
    const el = varsRef.current;
    const s = sim.current;
    const L = latest.current;
    if (!el) return;
    let max = 0;
    L.list.forEach((w, i) => {
      const a = smooth(18, 1.5, angle(s.y, s.p, w.yaw, w.pitch));
      max = Math.max(max, a);
      el.style.setProperty(`--vc-a${i}`, String(r3(a)));
    });
    el.style.setProperty("--vc-max", String(r3(max)));
  }, []);

  // The frame loop lives in a ref written after each render, so it always
  // reads the latest springs and words without restarting.
  const tickRef = React.useRef<(now: number) => void>(() => {});
  React.useEffect(() => {
    tickRef.current = (now: number) => {
      const s = sim.current;
      s.frame = 0;
      if (!s.visible || document.hidden) {
        s.last = 0;
        return;
      }
      const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
      s.last = now;
      const L = latest.current;
      if (s.mode !== "drag") {
        // Two half steps keep the stiff snap spring stable at low frame rates.
        const { k, c, m } = s.spring;
        for (let i = 0; i < 2; i += 1) {
          const h = dt / 2;
          s.vy += ((-k * (s.y - s.ty) - c * s.vy) / m) * h;
          s.vp += ((-k * (s.p - s.tp) - c * s.vp) / m) * h;
          s.y += s.vy * h;
          s.p += s.vp * h;
        }
      }
      yaw.set(r2(s.y));
      pitch.set(r2(s.p));
      writeVars();
      const settled =
        Math.abs(s.y - s.ty) < 0.05 &&
        Math.abs(s.p - s.tp) < 0.05 &&
        Math.abs(s.vy) < 0.1 &&
        Math.abs(s.vp) < 0.1;
      if (
        s.locked >= 0 &&
        !s.glinted &&
        Math.abs(s.y - s.ty) + Math.abs(s.p - s.tp) < 1
      ) {
        s.glinted = true;
        sweep(s.locked);
      }
      if (s.mode !== "drag" && settled) {
        s.y = s.ty;
        s.p = s.tp;
        s.vy = 0;
        s.vp = 0;
        yaw.set(r2(s.y));
        pitch.set(r2(s.p));
        writeVars();
        if (s.mode === "home" || s.mode === "key") s.mode = "lock";
        s.last = 0;
        if (s.locked >= 0 && !s.glinted) {
          s.glinted = true;
          sweep(s.locked);
        }
        return;
      }
      if (L.disabled && s.mode === "drag") s.mode = "lock";
      s.frame = window.requestAnimationFrame(tickRef.current);
    };
  });

  const kick = React.useCallback(() => {
    const s = sim.current;
    if (s.frame || !s.visible || document.hidden) return;
    s.frame = window.requestAnimationFrame(tickRef.current);
  }, []);

  /** The pointer's angles, pulled toward a nearby vantage, with lock and release. */
  const aim = React.useCallback(
    (rawY: number, rawP: number) => {
      const s = sim.current;
      const L = latest.current;
      s.rawY = rawY;
      s.rawP = rawP;
      const sn = Math.max(1, L.snap);
      if (s.locked >= 0) {
        const lw = L.list[s.locked];
        if (lw && angle(rawY, rawP, lw.yaw, lw.pitch) <= sn * 2) {
          s.ty = lw.yaw;
          s.tp = lw.pitch;
          return;
        }
        s.locked = -1;
      }
      let ty = rawY;
      let tp = rawP;
      let near = -1;
      let nearD = Infinity;
      L.list.forEach((w, i) => {
        const d = angle(rawY, rawP, w.yaw, w.pitch);
        if (d < nearD) {
          nearD = d;
          near = i;
        }
      });
      const nw = L.list[near];
      if (nw && nearD < sn) {
        s.mode = "lock";
        s.spring = SNAP;
        lockTo(near, true);
        return;
      }
      if (nw) {
        // A magnet: the closer a vantage, the more the aim leans into it.
        const pull = smooth(sn * 2.6, sn, nearD) * 0.6;
        ty += (nw.yaw - ty) * pull;
        tp += (nw.pitch - tp) * pull;
      }
      s.mode = "follow";
      s.spring = followSpring(L.lag);
      s.ty = ty;
      s.tp = tp;
    },
    [lockTo],
  );

  /** Turns to a word on purpose (a key, the host): glide there and lock. */
  const turnTo = React.useCallback(
    (w: number, announce: boolean) => {
      const s = sim.current;
      const L = latest.current;
      const vw = L.list[w];
      if (!vw) return;
      if (!L.motionSafe) {
        // Reduced motion: no travel. The letters fade, the cube jumps, they return.
        animate(fade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            s.y = vw.yaw;
            s.p = vw.pitch;
            s.vy = 0;
            s.vp = 0;
            yaw.set(r2(s.y));
            pitch.set(r2(s.p));
            writeVars();
            animate(fade, 1, { duration: durations.base, ease: easings.enter });
          },
        });
        s.mode = "lock";
        lockTo(w, announce);
        s.glinted = true;
        return;
      }
      s.mode = "key";
      s.spring = GLIDE;
      lockTo(w, announce);
      kick();
    },
    [fade, kick, lockTo, pitch, writeVars, yaw],
  );

  // A host that moves `value` turns the cube there.
  React.useEffect(() => {
    if (sim.current.locked === current) return;
    turnTo(current, false);
  }, [current, turnTo]);

  // A new layout (words, depth…) keeps the turn; the variables are re-read.
  React.useEffect(() => {
    writeVars();
  }, [glyphs, writeVars]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const s = sim.current;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      s.visible = Boolean(entry?.isIntersecting);
      if (s.visible) kick();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (s.frame) window.cancelAnimationFrame(s.frame);
      s.frame = 0;
      s.last = 0;
      s.visible = false;
    };
  }, [kick]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (event.pointerType !== "mouse" || disabled || !motionSafe) return;
    const r = event.currentTarget.getBoundingClientRect();
    const px = clamp((event.clientX - r.left) / Math.max(1, r.width), 0, 1);
    const py = clamp((event.clientY - r.top) / Math.max(1, r.height), 0, 1);
    const reach = clamp(range, 5, 85);
    aim((px - 0.5) * 2 * reach, -(py - 0.5) * 2 * reach * 0.7);
    kick();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || disabled || !motionSafe) return;
    const s = sim.current;
    const vw = list[current];
    if (!vw) return;
    // Back to the word on the drift spring, and it locks again on arrival.
    s.mode = "home";
    s.spring = DRIFT;
    s.locked = current;
    s.glinted = s.locked === current && angle(s.y, s.p, vw.yaw, vw.pitch) < 1;
    s.ty = vw.yaw;
    s.tp = vw.pitch;
    kick();
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || !motionSafe,
    onStart: ({ event }) => {
      const s = sim.current;
      if (event.pointerType === "mouse") return;
      s.mode = "drag";
      s.locked = -1;
      s.dragFrom = {
        y: s.y,
        p: s.p,
        w: Math.max(1, rootRef.current?.clientWidth ?? 1),
      };
      kick();
    },
    onMove: ({ offset, event }) => {
      const s = sim.current;
      if (event.pointerType === "mouse" || s.mode !== "drag") return;
      // 1:1: the box's width of travel is the whole range, both ways.
      const per = (2 * clamp(range, 5, 85)) / s.dragFrom.w;
      s.y = clamp(s.dragFrom.y + offset.x * per, -85, 85);
      s.p = clamp(s.dragFrom.p - offset.y * per, -60, 60);
      s.ty = s.y;
      s.tp = s.p;
      kick();
    },
    onEnd: ({ velocity, event }) => {
      const s = sim.current;
      if (event.pointerType === "mouse" || s.mode !== "drag") return;
      const per = (2 * clamp(range, 5, 85)) / s.dragFrom.w;
      s.vy = velocity.x * per;
      s.vp = -velocity.y * per;
      const landY = project(s.y, s.vy, 0.992);
      const landP = project(s.p, s.vp, 0.992);
      let near = -1;
      let nearD = Infinity;
      list.forEach((w, i) => {
        const d = angle(landY, landP, w.yaw, w.pitch);
        if (d < nearD) {
          nearD = d;
          near = i;
        }
      });
      if (near >= 0 && nearD < Math.max(1, snap) * 3) {
        s.mode = "lock";
        s.spring = SNAP;
        lockTo(near, true);
      } else {
        s.mode = "follow";
        s.spring = DRIFT;
        s.ty = clamp(landY, -85, 85);
        s.tp = clamp(landP, -60, 60);
      }
      kick();
    },
    onCancel: () => {
      const s = sim.current;
      if (s.mode !== "drag") return;
      s.mode = "home";
      s.spring = DRIFT;
      s.locked = current;
      s.ty = word.yaw;
      s.tp = word.pitch;
      kick();
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = (current + 1) % n;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = (current - 1 + n) % n;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = n - 1;
    if (next === null) return;
    event.preventDefault();
    turnTo(next, true);
  };

  const P_css = r3(P);

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={current + 1}
      aria-valuetext={`${word.text}, word ${current + 1} of ${n}`}
      aria-describedby={`${uid}-hint`}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn(
        "[container-type:size] relative isolate h-52 w-full touch-none overflow-clip rounded-3 select-none",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [--vc-s:calc(min(100cqw,100cqh)*0.33)]"
        style={{ perspective: `calc(var(--vc-s) * ${P_css})` }}
      >
        <motion.div
          className="absolute top-1/2 left-1/2 [transform-style:preserve-3d]"
          style={{ rotateX: pitch, rotateY: yaw, opacity: fade }}
        >
          <div
            ref={varsRef}
            className="absolute top-0 left-0 [transform-style:preserve-3d]"
            style={initial.vars as React.CSSProperties}
          >
            {edges
              ? EDGES.map((t, i) => (
                  <span
                    key={`e${i}`}
                    className="absolute top-0 left-0 h-px origin-[0_0] bg-[color-mix(in_oklab,var(--foreground)_22%,transparent)]"
                    style={{ width: "calc(var(--vc-s) * 2)", transform: t }}
                  />
                ))
              : null}
            {rules.map((r) => (
              <span
                key={`r${r.word}`}
                className="absolute top-0 left-0 h-[2px] origin-[0_0] rounded-full bg-cobalt-bright"
                style={{
                  width: `calc(var(--vc-s) * ${r.width})`,
                  transform: r.transform,
                  opacity: `var(--vc-a${r.word})`,
                }}
              />
            ))}
            {glyphs.map((g, i) => (
              <span
                key={g.word >= 0 ? `w${g.word}-${g.at}` : `f${i}`}
                ref={
                  g.word >= 0
                    ? (node) => {
                        const key = `${g.word}:${g.at}`;
                        if (node) letterNodes.current.set(key, node);
                        else letterNodes.current.delete(key);
                      }
                    : undefined
                }
                className="absolute top-0 left-0 origin-[0_0] leading-none font-semibold tracking-normal whitespace-pre [backface-visibility:hidden]"
                style={
                  g.word >= 0
                    ? {
                        fontSize: `calc(var(--vc-s) * ${g.size})`,
                        transform: g.transform,
                        color: `color-mix(in oklab, var(--foreground) calc(var(--vc-a${g.word}) * 100%), var(--ink-3))`,
                        opacity: `calc(0.4 + 0.6 * var(--vc-a${g.word}) - 0.16 * var(--vc-max) * (1 - var(--vc-a${g.word})))`,
                      }
                    : {
                        fontSize: `calc(var(--vc-s) * ${g.size})`,
                        transform: g.transform,
                        color: "var(--ink-3)",
                        opacity: "calc(0.4 - 0.2 * var(--vc-max))",
                      }
                }
              >
                {g.char}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
      <span id={`${uid}-hint`} className="sr-only">
        Move the pointer over the cube to turn it until a word reads. Arrow keys
        step between the words.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
