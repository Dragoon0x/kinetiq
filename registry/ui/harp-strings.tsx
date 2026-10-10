"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type HarpStringsColor = "cobalt" | "signal" | "brass" | "rose";
export type HarpStringsScale = "pentatonic" | "major" | "minor" | "chromatic";
export type HarpStringsPluck = {
  /** Which string, counted from the top, from 0. */
  string: number;
  /** Its note, e.g. "G5". */
  note: string;
  /** How hard it was plucked, 0 to 1. */
  strength: number;
};

export type HarpStringsProps = {
  /** The content on top of the strings: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many strings span the frame, 6 to 48. @default 24 */
  strings?: number;
  /** How quickly a plucked string falls quiet, 0 (rings about four seconds) to 1 (a muted third of a second). @default 0.35 */
  damping?: number;
  /** A ringing string's colour: a named token or any CSS colour. @default "cobalt" */
  color?: HarpStringsColor | (string & {});
  /** How tight the strings are, 0 (slack, slow and wide) to 1 (tight, a fast shiver). @default 0.5 */
  tension?: number;
  /** The notes the strings are tuned to, around C5 in the middle. @default "pentatonic" */
  scale?: HarpStringsScale;
  /** How much an idle breeze sets the strings shimmering, 0 to 1. @default 0.35 */
  breeze?: number;
  /** How hard a passing hand plucks, 0 to 1. @default 0.6 */
  pluck?: number;
  /** A string's line weight, px; bass strings are drawn a little heavier. @default 1.2 */
  weight?: number;
  /** How far in from each side the strings are fixed, px. @default 20 */
  inset?: number;
  /** A passing pointer, a press, a drag and keyboard focus inside pluck the strings. @default true */
  interactive?: boolean;
  /** No breeze; plucked strings still ring. @default false */
  paused?: boolean;
  /** Seeds the breeze. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Each pluck plays its string's note. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires on every pluck, with the string, its note and how hard. */
  onPluck?: (pluck: HarpStringsPluck) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Line colours from tokens, so a string keeps its contrast on a light page and a dark one. */
const COLORS: Record<HarpStringsColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  brass: "var(--warn)",
  rose: "oklch(from var(--danger) l calc(c * 0.75) calc(h - 10))",
};

const GROUND = "var(--background)";
const REST = "color-mix(in oklab, var(--foreground) 24%, var(--background))";
const BRIDGE = "color-mix(in oklab, var(--foreground) 13%, var(--background))";

const SCALES: Record<HarpStringsScale, readonly number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Standing waves per string, and the highest a mode may swing before it would alias, Hz. */
const MODES = 8;
const MAX_HZ = 26;
/** Below this many px of swing a string is still. */
const QUIET = 0.08;
/** Below this much energy a string shows no colour. */
const GLOW_FLOOR = 1.1;
/** Reduced motion: a pluck's colour fades this many times faster than the string would ring. */
const STILL_FADE = 4;
/** Keyboard strums run top to bottom, this far apart, ms. */
const STRUM_GAP = 28;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** Whether the page has had a click, tap or key yet: sound waits for one. */
const activated = () =>
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation?.hasBeenActive === true;

/** A string's note, from C5 = 0 semitones. */
const noteName = (semis: number) =>
  `${NAMES[((semis % 12) + 12) % 12] ?? "C"}${5 + Math.floor(semis / 12)}`;

type Config = {
  strings: number;
  damping: number;
  colorKey: string;
  tension: number;
  scale: HarpStringsScale;
  breeze: number;
  pluck: number;
  weight: number;
  inset: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onPluck: (pluck: HarpStringsPluck, x: number, semis: number) => void;
};

type Harp = {
  w: number;
  h: number;
  dpr: number;
  n: number;
  spacing: number;
  x0: number;
  x1: number;
  /** Sample points along every string. */
  k: number;
  xs: Float32Array;
  /** sin(nπx/L) at every sample, per mode. */
  shape: Float32Array;
  /** Rest height, note and how many modes each string keeps. */
  ys: Float32Array;
  semis: Int16Array;
  modes: Uint8Array;
  /** Each mode's rotation per second and decay rate. */
  omega: Float32Array;
  gamma: Float32Array;
  /** Each mode's complex amplitude, px. */
  zr: Float32Array;
  zi: Float32Array;
  energy: Float32Array;
  /** Scratch for one string's shape and envelope. */
  line: Float32Array;
  env: Float32Array;
};

type Hold = {
  /** The string under the hand, or −1. */
  i: number;
  /** Where along it, 0 to 1. */
  u: number;
  /** How far it is pulled, px, and which way the hand is pushing. */
  h: number;
  dir: number;
  grabbed: boolean;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  move: (x: number, y: number, vy: number) => void;
  leave: () => void;
  grab: (x: number, y: number) => boolean;
  drag: (y: number) => void;
  release: (vy: number) => void;
  /** The gesture was taken away (a scroll, a lost pointer): let go without a pluck. */
  drop: () => void;
  tap: (x: number, y: number) => void;
  strum: (x: number, top: number, bottom: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let harp: Harp | null = null;
  const ctx = canvas.getContext("2d", { alpha: false });
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let clock = 0;
  let rand = lcg(1);
  const strumTimers: number[] = [];
  const hold: Hold = { i: -1, u: 0.5, h: 0, dir: 1, grabbed: false };
  const pointer = { x: 0, y: 0, present: false };
  const paint = {
    ground: "black",
    rest: "gray",
    bridge: "gray",
    ring: "white",
  };

  const tune = () => {
    const g = harp;
    const c = cfg;
    if (!g || !c) return;
    const steps = SCALES[c.scale] ?? SCALES.pentatonic;
    const len = steps.length;
    const mid = Math.floor(g.n / 2);
    const tau = 4 - 3.7 * clamp(c.damping, 0, 1);
    const tight = 0.55 + 1.05 * clamp(c.tension, 0, 1);
    for (let i = 0; i < g.n; i += 1) {
      // The bottom string is the lowest; the middle one is C5.
      const d = g.n - 1 - i - mid;
      const octave = Math.floor(d / len);
      let semis = 12 * octave + (steps[d - octave * len] ?? 0);
      while (semis > 24) semis -= 12;
      while (semis < -24) semis += 12;
      g.semis[i] = semis;
      const f = (1.5 + 4.5 * ((semis + 24) / 48)) * tight;
      const m = clamp(Math.floor(MAX_HZ / f), 1, MODES);
      g.modes[i] = m;
      for (let n = 0; n < MODES; n += 1) {
        g.omega[i * MODES + n] = 2 * Math.PI * f * (n + 1);
        g.gamma[i * MODES + n] = (1 / tau) * (1 + 0.4 * n);
        if (n >= m) {
          g.zr[i * MODES + n] = 0;
          g.zi[i * MODES + n] = 0;
        }
      }
    }
  };

  const layout = (): boolean => {
    const c = cfg;
    if (!c) return false;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const n = clamp(Math.round(c.strings), 6, 48);
    const inset = clamp(c.inset, 4, w * 0.25);
    const x0 = inset;
    const x1 = w - inset;
    const L = Math.max(8, x1 - x0);
    const k = clamp(Math.round(L / 8), 24, 120);
    const xs = new Float32Array(k);
    const shape = new Float32Array(MODES * k);
    for (let s = 0; s < k; s += 1) {
      const u = s / (k - 1);
      xs[s] = x0 + u * L;
      for (let m = 0; m < MODES; m += 1) {
        shape[m * k + s] = Math.sin((m + 1) * Math.PI * u);
      }
    }
    const spacing = h / (n + 1);
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i += 1) ys[i] = (i + 1) * spacing;
    harp = {
      w,
      h,
      dpr,
      n,
      spacing,
      x0,
      x1,
      k,
      xs,
      shape,
      ys,
      semis: new Int16Array(n),
      modes: new Uint8Array(n),
      omega: new Float32Array(n * MODES),
      gamma: new Float32Array(n * MODES),
      zr: new Float32Array(n * MODES),
      zi: new Float32Array(n * MODES),
      energy: new Float32Array(n),
      line: new Float32Array(k),
      env: new Float32Array(k),
    };
    hold.i = -1;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    tune();
    return true;
  };

  /** The reach of a hand's catch: how far a string goes with it before it slips. */
  const catchOf = () => {
    const g = harp;
    const c = cfg;
    if (!g || !c) return 4;
    return Math.min(g.spacing * 0.6, 9) * (0.4 + 0.9 * clamp(c.pluck, 0, 1));
  };

  /** Lets string i go from a triangle h px high at u, moving at v px/s. */
  const pluckAt = (i: number, u: number, h: number, v: number, x: number) => {
    const g = harp;
    const c = cfg;
    if (!g || !c || i < 0 || i >= g.n) return;
    const uu = clamp(u, 0.04, 0.96);
    const m = g.modes[i] ?? 1;
    const base = i * MODES;
    const k = 2 / (Math.PI * Math.PI * uu * (1 - uu));
    for (let n = 0; n < m; n += 1) {
      const nn = n + 1;
      const share = (k / (nn * nn)) * Math.sin(nn * Math.PI * uu);
      g.zr[base + n] = (g.zr[base + n] ?? 0) + share * h;
      g.zi[base + n] =
        (g.zi[base + n] ?? 0) - (share * v) / (g.omega[base + n] ?? 1);
    }
    // A string never swings so wide it would cross its neighbours.
    let sum = 0;
    for (let n = 0; n < m; n += 1) {
      sum += Math.hypot(g.zr[base + n] ?? 0, g.zi[base + n] ?? 0);
    }
    const most = g.spacing * 0.95;
    if (sum > most) {
      const f = most / sum;
      for (let n = 0; n < m; n += 1) {
        g.zr[base + n] = (g.zr[base + n] ?? 0) * f;
        g.zi[base + n] = (g.zi[base + n] ?? 0) * f;
      }
    }
    const strength = clamp(
      (Math.abs(h) + Math.abs(v) * 0.01) / (g.spacing * 0.7),
      0.1,
      1,
    );
    g.energy[i] = Math.max(g.energy[i] ?? 0, Math.min(sum, most));
    const semis = g.semis[i] ?? 0;
    c.onPluck(
      {
        string: i,
        note: noteName(semis),
        strength: Number(strength.toFixed(2)),
      },
      x,
      semis,
    );
    kick();
  };

  /** The tent a held string makes, at sample s. */
  const tent = (g: Harp, s: number) => {
    if (hold.i < 0) return 0;
    const u = s / (g.k - 1);
    return hold.h * (u < hold.u ? u / hold.u : (1 - u) / (1 - hold.u));
  };

  const draw = () => {
    const g = harp;
    const c = cfg;
    if (!g || !c || !ctx || !visible.current) return;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.fillStyle = paint.ground;
    ctx.fillRect(0, 0, g.w, g.h);
    const top = (g.ys[0] ?? 0) - g.spacing * 0.6;
    const bottom = (g.ys[g.n - 1] ?? g.h) + g.spacing * 0.6;
    // The bridges: where the strings are fixed, with a pin for each.
    ctx.strokeStyle = paint.bridge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g.x0 - 3.5, top);
    ctx.lineTo(g.x0 - 3.5, bottom);
    ctx.moveTo(g.x1 + 3.5, top);
    ctx.lineTo(g.x1 + 3.5, bottom);
    ctx.stroke();
    ctx.fillStyle = paint.rest;
    ctx.beginPath();
    for (let i = 0; i < g.n; i += 1) {
      const y = g.ys[i] ?? 0;
      ctx.moveTo(g.x0 + 1.4, y);
      ctx.arc(g.x0, y, 1.4, 0, Math.PI * 2);
      ctx.moveTo(g.x1 + 1.4, y);
      ctx.arc(g.x1, y, 1.4, 0, Math.PI * 2);
    }
    ctx.fill();
    const still = !c.motionSafe;
    const weight = clamp(c.weight, 0.5, 4);
    for (let i = 0; i < g.n; i += 1) {
      const y0 = g.ys[i] ?? 0;
      const lw = weight * (0.8 + (0.55 * i) / Math.max(1, g.n - 1));
      const e = g.energy[i] ?? 0;
      const held = hold.i === i;
      // Colour means a pluck: the breeze's shimmer stays in the rest tone,
      // and only energy above it lights the string.
      const glow = clamp((e - GLOW_FLOOR) / (g.spacing * 0.45), 0, 1);
      if ((e < QUIET && !held) || (still && !held)) {
        // A still string, or reduced motion: straight, its colour carrying
        // how hard it is ringing.
        ctx.lineWidth = lw;
        ctx.strokeStyle = paint.rest;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(g.x0, y0);
        ctx.lineTo(g.x1, y0);
        ctx.stroke();
        if (glow > 0.01) {
          ctx.strokeStyle = paint.ring;
          ctx.globalAlpha = glow;
          ctx.stroke();
          ctx.lineWidth = lw + 3;
          ctx.globalAlpha = glow * 0.16;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        continue;
      }
      const m = g.modes[i] ?? 1;
      const base = i * MODES;
      for (let s = 0; s < g.k; s += 1) {
        let y = 0;
        let env = 0;
        for (let n = 0; n < m; n += 1) {
          const sh = g.shape[n * g.k + s] ?? 0;
          y += (g.zr[base + n] ?? 0) * sh;
          env +=
            Math.hypot(g.zr[base + n] ?? 0, g.zi[base + n] ?? 0) * Math.abs(sh);
        }
        g.line[s] = y0 + y + (held ? tent(g, s) : 0);
        g.env[s] = env;
      }
      // The blur a vibrating string leaves: its envelope, faintly filled.
      if (glow > 0.02) {
        ctx.globalAlpha = 0.12 * glow;
        ctx.fillStyle = paint.ring;
        ctx.beginPath();
        for (let s = 0; s < g.k; s += 1) {
          const x = g.xs[s] ?? 0;
          const y = y0 + (g.env[s] ?? 0);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let s = g.k - 1; s >= 0; s -= 1) {
          ctx.lineTo(g.xs[s] ?? 0, y0 - (g.env[s] ?? 0));
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      for (let s = 0; s < g.k; s += 1) {
        const x = g.xs[s] ?? 0;
        if (s === 0) ctx.moveTo(x, g.line[s] ?? y0);
        else ctx.lineTo(x, g.line[s] ?? y0);
      }
      ctx.lineJoin = "round";
      ctx.lineWidth = lw;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = paint.rest;
      ctx.stroke();
      ctx.strokeStyle = paint.ring;
      ctx.globalAlpha = Math.max(glow, held ? 0.55 : 0);
      ctx.stroke();
      ctx.lineWidth = lw + 3;
      ctx.globalAlpha = 0.16 * glow;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Rotates and decays every mode, and lets the breeze touch them. */
  const step = (dt: number): boolean => {
    const g = harp;
    const c = cfg;
    if (!g || !c) return false;
    clock += dt;
    const blowing = c.motionSafe && !c.paused && c.breeze > 0;
    let loud = false;
    for (let i = 0; i < g.n; i += 1) {
      const m = g.modes[i] ?? 1;
      const base = i * MODES;
      let sum = 0;
      // The gust that is passing this string now: it travels down the harp.
      const gust = blowing
        ? Math.max(0, Math.sin(clock * 0.35 - i * 0.22 + 1.3)) ** 2 *
          (0.45 + 0.55 * Math.sin(clock * 0.13 + i * 0.05) ** 2)
        : 0;
      for (let n = 0; n < m; n += 1) {
        const at = base + n;
        const om = (g.omega[at] ?? 0) * dt;
        const gm = (g.gamma[at] ?? 1) * (c.motionSafe ? 1 : STILL_FADE);
        const decay = Math.exp(-gm * dt);
        const cs = Math.cos(om);
        const sn = Math.sin(om);
        let zr = g.zr[at] ?? 0;
        let zi = g.zi[at] ?? 0;
        const nr = decay * (cs * zr - sn * zi);
        zi = decay * (sn * zr + cs * zi);
        zr = nr;
        if (gust > 0 && n < 2) {
          // Random knocks sized so the shimmer settles near the breeze's
          // own height whatever the damping.
          const knock =
            c.breeze *
            0.55 *
            gust *
            Math.sqrt(2 * gm * dt) *
            1.73 *
            (n ? 0.5 : 1);
          zr += (rand() * 2 - 1) * knock;
          zi += (rand() * 2 - 1) * knock;
        }
        g.zr[at] = zr;
        g.zi[at] = zi;
        sum += Math.abs(zr) + Math.abs(zi);
      }
      // A string that has fallen still is zeroed; under reduced motion that
      // is as soon as its colour has gone.
      if (
        (sum < QUIET * 0.5 && !blowing) ||
        (!c.motionSafe && sum < GLOW_FLOOR)
      ) {
        for (let n = 0; n < m; n += 1) {
          g.zr[base + n] = 0;
          g.zi[base + n] = 0;
        }
        sum = 0;
      }
      g.energy[i] = sum;
      if (sum > 0.35) loud = true;
    }
    return loud;
  };

  function tick(now: number) {
    frame = 0;
    const g = harp;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !g || !c) {
      last = 0;
      return;
    }
    const blowing = c.motionSafe && !c.paused && c.breeze > 0;
    const busy = hold.i >= 0 || anyLoud();
    // Only the breeze: thirty frames a second is plenty for a shimmer.
    if (!busy && blowing && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    step(dt);
    draw();
    let ringing = false;
    for (let i = 0; i < g.n; i += 1) {
      if ((g.energy[i] ?? 0) > 0) {
        ringing = true;
        break;
      }
    }
    if (ringing || blowing || hold.i >= 0) {
      frame = window.requestAnimationFrame(tick);
    } else last = 0;
  }

  const anyLoud = () => {
    const g = harp;
    if (!g) return false;
    for (let i = 0; i < g.n; i += 1) {
      if ((g.energy[i] ?? 0) > 0.35) return true;
    }
    return false;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!harp || !ctx) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const css = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "gray";
    };
    paint.ground = css(0);
    paint.rest = css(1);
    paint.bridge = css(2);
    paint.ring = css(3);
  };

  /** The string nearest a height, and how far from it. */
  const nearest = (y: number) => {
    const g = harp;
    if (!g) return { i: -1, d: Infinity };
    const i = clamp(Math.round(y / g.spacing) - 1, 0, g.n - 1);
    return { i, d: y - (g.ys[i] ?? 0) };
  };

  const letGo = (vy: number, pluck: boolean) => {
    const g = harp;
    if (!g || hold.i < 0) return;
    const i = hold.i;
    const h = hold.h;
    hold.i = -1;
    hold.grabbed = false;
    hold.h = 0;
    if (pluck && Math.abs(h) > 0.3) {
      pluckAt(i, hold.u, h, vy * 0.35, g.x0 + hold.u * (g.x1 - g.x0));
    }
    kick();
  };

  // A 2D canvas the browser dropped under memory pressure comes back
  // blank: paint it again.
  const onRestored = () => {
    draw();
  };
  canvas.addEventListener("contextrestored", onRestored);

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        rand = lcg(next.seed * 23 + 5);
        readColours();
        if (layout()) draw();
        kick();
        return;
      }
      if (was.seed !== next.seed) rand = lcg(next.seed * 23 + 5);
      if (was.colorKey !== next.colorKey) readColours();
      if (
        was.strings !== next.strings ||
        was.inset !== next.inset ||
        was.dpr !== next.dpr
      ) {
        layout();
      } else if (
        was.damping !== next.damping ||
        was.tension !== next.tension ||
        was.scale !== next.scale
      ) {
        tune();
      }
      if (!next.interactive && hold.i >= 0) letGo(0, false);
      draw();
      kick();
    },
    resize() {
      const c = cfg;
      if (!c || !ctx) return;
      const g = harp;
      const w = root.clientWidth;
      const h = root.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (g && g.w === w && g.h === h && g.dpr === dpr) return;
      if (layout()) {
        draw();
        kick();
      }
    },
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    move(x, y, vy) {
      const g = harp;
      const c = cfg;
      if (!g || !c || !c.interactive) return;
      const was = pointer.present ? pointer.y : y;
      pointer.x = x;
      pointer.y = y;
      pointer.present = true;
      if (hold.grabbed) return;
      const u = (x - g.x0) / (g.x1 - g.x0);
      const along = u > 0 && u < 1;
      const reach = catchOf();
      const still = !c.motionSafe;
      // The string already under the hand goes with it until it slips.
      if (hold.i >= 0) {
        const pushed = (y - (g.ys[hold.i] ?? 0)) * hold.dir;
        if (!along || pushed <= 0) letGo(0, false);
        else if (pushed > reach) {
          hold.h = reach * hold.dir;
          letGo(vy, true);
        } else {
          hold.h = pushed * hold.dir;
          hold.u = clamp(u, 0.04, 0.96);
          kick();
        }
      }
      if (!along || y === was) return;
      // Every string the hand crossed since the last move: the last one is
      // caught, the rest were swept clean through and ring at once.
      const dir = y > was ? 1 : -1;
      const lo = Math.min(was, y);
      const hi = Math.max(was, y);
      const first = clamp(Math.ceil(lo / g.spacing) - 1, 0, g.n - 1);
      const lastI = clamp(Math.floor(hi / g.spacing) - 1, 0, g.n - 1);
      const speed = Math.abs(vy);
      for (
        let i = dir > 0 ? first : lastI;
        dir > 0 ? i <= lastI : i >= first;
        i += dir
      ) {
        const ry = g.ys[i] ?? 0;
        if (ry <= lo || ry > hi || i === hold.i) continue;
        const past = (y - ry) * dir;
        if (!still && past <= reach && hold.i < 0) {
          hold.i = i;
          hold.dir = dir;
          hold.u = clamp(u, 0.04, 0.96);
          hold.h = past * dir;
          hold.grabbed = false;
          continue;
        }
        const hard = Math.min(g.spacing * 0.9, reach * (0.7 + speed / 1500));
        pluckAt(i, u, hard * dir, vy * 0.2, x);
      }
      kick();
    },
    leave() {
      pointer.present = false;
      if (!hold.grabbed) letGo(0, false);
    },
    grab(x, y) {
      const g = harp;
      const c = cfg;
      if (!g || !c || !c.interactive) return false;
      const u = (x - g.x0) / (g.x1 - g.x0);
      const { i, d } = nearest(y);
      if (i < 0 || u <= 0 || u >= 1 || Math.abs(d) > g.spacing * 0.5 + 0.5) {
        return false;
      }
      letGo(0, false);
      if (!c.motionSafe) return true;
      hold.i = i;
      hold.u = clamp(u, 0.04, 0.96);
      hold.h = d;
      hold.dir = d >= 0 ? 1 : -1;
      hold.grabbed = true;
      kick();
      return true;
    },
    drag(y) {
      const g = harp;
      if (!g || hold.i < 0 || !hold.grabbed) return;
      const raw = y - (g.ys[hold.i] ?? 0);
      const most = g.spacing * 1.6;
      const over = Math.abs(raw) - most;
      // Past a spacing and a half it gives less and less, and past more
      // than twice that it slips off the finger and rings.
      if (over > g.spacing * 2.2) {
        hold.h =
          Math.sign(raw) * (most + rubberband(g.spacing * 2.2, g.spacing * 2));
        letGo(0, true);
        return;
      }
      hold.h =
        over > 0
          ? Math.sign(raw) * (most + rubberband(over, g.spacing * 2))
          : raw;
      kick();
    },
    release(vy) {
      if (hold.grabbed) letGo(vy, true);
    },
    drop() {
      if (hold.grabbed) letGo(0, false);
    },
    tap(x, y) {
      const g = harp;
      const c = cfg;
      if (!g || !c || !c.interactive) return;
      const u = (x - g.x0) / (g.x1 - g.x0);
      if (u <= 0 || u >= 1) return;
      const { i, d } = nearest(y);
      if (hold.grabbed) letGo(0, false);
      pluckAt(i, u, (d >= 0 ? 1 : -1) * g.spacing * 0.45, 0, x);
    },
    strum(x, top, bottom) {
      const g = harp;
      const c = cfg;
      if (!g || !c || !c.interactive) return;
      for (const t of strumTimers) window.clearTimeout(t);
      strumTimers.length = 0;
      const u = clamp((x - g.x0) / (g.x1 - g.x0), 0.1, 0.9);
      let from = clamp(
        Math.ceil((top - g.spacing) / g.spacing) - 1,
        0,
        g.n - 1,
      );
      let to = clamp(
        Math.floor((bottom + g.spacing) / g.spacing) - 1,
        0,
        g.n - 1,
      );
      if (to < from) {
        const near = nearest((top + bottom) / 2).i;
        from = near;
        to = near;
      }
      for (let i = from; i <= to; i += 1) {
        strumTimers.push(
          window.setTimeout(
            () => pluckAt(i, u, catchOf() * 0.8, 0, x),
            (i - from) * STRUM_GAP,
          ),
        );
      }
    },
    dispose() {
      disposed = true;
      canvas.removeEventListener("contextrestored", onRestored);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      for (const t of strumTimers) window.clearTimeout(t);
      strumTimers.length = 0;
    },
  };
}

/**
 * A background of strings that ring, with the content on top in its own
 * layer. Dozens of horizontal strings span the frame between two hairline
 * bridges; each is a real fixed–fixed string solved by its standing waves —
 * up to eight modes, each a complex amplitude that turns at its own
 * frequency and fades at its own rate, the higher ones faster — so any pluck
 * is exact superposition and dies away the way a string does. Treble strings
 * shiver faster than bass ones; a ringing string brightens toward its colour
 * and leaves a faint envelope, the blur of its own swing.
 *
 * A passing hand plucks: the string nearest the pointer is caught and bends
 * round it 1:1 until the hand has pushed through, then lets go and rings, so
 * a slow pass drags each string before it twangs and a fast strum sweeps
 * every string it crosses. A press grabs a string — the drag pulls it 1:1,
 * rubber-banded, slipping off if pulled too far — and the release plucks it
 * with its shape and the hand's speed; a tap plucks the string under it.
 * Keyboard focus on a control inside strums the strings behind it. Idle, a
 * slow breeze travels down the harp and sets the strings shimmering. With
 * `sound`, every pluck plays its string's note. Canvas 2D; the loop stops
 * when the strings are still and there is no breeze, and nothing runs off
 * screen. Under reduced motion the strings stay straight and a pluck shows
 * as colour that fades as the string would have rung.
 */
export function HarpStrings({
  children,
  strings = 24,
  damping = 0.35,
  color = "cobalt",
  tension = 0.5,
  scale = "pentatonic",
  breeze = 0.35,
  pluck = 0.6,
  weight = 1.2,
  inset = 20,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  sound = false,
  onPluck,
  className,
}: HarpStringsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const ring = COLORS[color as HarpStringsColor] ?? color;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onPluck);
  const voice = React.useRef(audio);
  const lastMove = React.useRef({ y: 0, t: 0, vy: 0 });
  /** Where the press began: a string is taken only once the press becomes a drag. */
  const pressAt = React.useRef<{ x: number; y: number } | null>(null);
  /** Stops listening for the end of the current press. */
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    strings,
    damping,
    colorKey: ring,
    tension,
    scale,
    breeze,
    pluck,
    weight,
    inset,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onPluck: (p, x, semis) => {
      report.current?.(p);
      // A note answers the visitor only, once the page has been clicked,
      // tapped or keyed: a hover never makes the first sound on a page.
      if (!activated()) return;
      const root = rootRef.current;
      const rect = root?.getBoundingClientRect();
      voice.current.play("note", {
        pitch: semitones(semis),
        gain: Number((0.12 + 0.45 * p.strength).toFixed(3)),
        pan: rect ? panFrom(rect.left + x, root) : 0,
      });
    },
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onPluck;
    voice.current = audio;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const listening = unlisten;
    return () => listening.current?.();
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Size and sighting, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** The hand's vertical speed, px/s, smoothed over the last few moves. */
  const speedOf = (y: number, t: number) => {
    const m = lastMove.current;
    const dt = Math.max(1, t - m.t) / 1000;
    const vy = m.t ? (y - m.y) / dt : 0;
    m.vy += (vy - m.vy) * Math.min(1, dt / 0.04);
    m.y = y;
    m.t = t;
    return m.vy;
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled: !interactive,
    onStart: () => {
      const from = pressAt.current;
      if (from) engine.current?.grab(from.x, from.y);
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      engine.current?.drag(at.y);
    },
    onEnd: ({ velocity }) => engine.current?.release(velocity.y),
    // A swipe the page took for a scroll was never a pluck.
    onCancel: () => engine.current?.drop(),
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      engine.current?.tap(at.x, at.y);
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; only the strings answer.
    if (hit && rootRef.current?.contains(hit)) return;
    const at = local(event.clientX, event.clientY);
    lastMove.current = { y: at.y, t: event.timeStamp, vy: 0 };
    pressAt.current = at;
    // Text above the strings stays selectable, except while a press that
    // may become a pull is under way.
    const root = rootRef.current;
    root?.setAttribute("data-pressing", "");
    unlisten.current?.();
    const id = event.pointerId;
    const done = (e: PointerEvent) => {
      if (e.pointerId === id) unlisten.current?.();
    };
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    unlisten.current = () => {
      root?.removeAttribute("data-pressing");
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      unlisten.current = null;
    };
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!interactive) return;
    // A finger only strums while it is down; a mouse plucks as it passes.
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    const vy = speedOf(at.y, event.timeStamp);
    engine.current?.move(at.x, at.y, vy);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    lastMove.current = { y: 0, t: 0, vy: 0 };
    if (event.pointerType !== "touch") engine.current?.leave();
  };

  // Keyboard focus on a control inside strums the strings behind it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const a = local(r.left + r.width / 2, r.top);
    const b = local(r.left, r.bottom);
    engine.current?.strum(a.x, a.y, b.y);
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      className={cn(
        // Strings run across, so a finger strums them by moving sideways and
        // down; an upright swipe is left to the page.
        "group/harp-strings relative isolate h-full w-full touch-pan-y overflow-clip data-pressing:select-none",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/harp-strings:opacity-0"
        style={standIn(strings, inset)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[GROUND, REST, BRIDGE, ring].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * strings at rest, evenly spaced, inside their bridges.
 */
function standIn(strings: number, inset: number): React.CSSProperties {
  const n = clamp(Math.round(strings), 6, 48);
  const pitch = Math.round((100 / (n + 1)) * 1000) / 1000;
  const pad = Math.round(clamp(inset, 4, 80));
  return {
    backgroundColor: GROUND,
    backgroundImage: `repeating-linear-gradient(180deg, transparent 0 calc(${pitch}% - 1px), ${REST} calc(${pitch}% - 1px) ${pitch}%)`,
    backgroundSize: `calc(100% - ${pad * 2}px) calc(100% - ${pitch}%)`,
    backgroundPosition: `${pad}px 0`,
    backgroundRepeat: "no-repeat",
  };
}
