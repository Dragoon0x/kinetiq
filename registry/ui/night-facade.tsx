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
import { springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type NightFacadeProps = {
  /** Controlled: the hour, 18 (6 pm) to 28 (4 am); 24 is midnight. */
  hour?: number;
  /** Initial hour when uncontrolled. @default 21 */
  defaultHour?: number;
  /** Fires from the drag or key that moved the night, with the new hour (on the step). */
  onHourChange?: (hour: number) => void;
  /** Floors of windows, 4 to 18. @default 10 */
  floors?: number;
  /** Windows across; by default as many as the width takes at the floor height. */
  columns?: number;
  /** Lamp colour, 0 (cool white) to 1 (deep tungsten amber). @default 0.6 */
  warmth?: number;
  /** Minutes the rail snaps to. @default 15 */
  step?: number;
  /** Figures pass behind a few lit windows now and then. @default true */
  silhouettes?: boolean;
  /** Screens flicker blue and the stairwell tube stutters. @default true */
  flicker?: boolean;
  /** The red light on the antenna blinks. @default true */
  beacon?: boolean;
  /** Show the hour rail down the right side. @default true */
  rail?: boolean;
  /** Hold the building still: no flicker, no figures, no rooms changing. @default false */
  paused?: boolean;
  /** Seeds who lives where and their hours. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The picture's accessible name; the hour and lit count are added to it. @default "Apartment building at night" */
  label?: string;
  /** The rail does not move. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-[520px] w-full" */
  className?: string;
};

/* -------------------------------- constants ------------------------------- */

const FIRST = 18;
const LAST = 28;
/** The rail's own width, px, and the padding at its ends. */
const RAIL = 46;
const RAIL_PAD = 18;
/** Before the box is measured, a nominal one. */
const NOMINAL = { w: 320, h: 520 };

/** The night, in fixed pigments: the scene is the same night in either theme. */
const ART = {
  duskTop: "oklch(0.36 0.07 268)",
  duskLow: "oklch(0.52 0.07 35)",
  nightTop: "oklch(0.16 0.03 265)",
  nightLow: "oklch(0.24 0.04 255)",
  far: "oklch(0.2 0.025 260)",
  farWindow: "oklch(0.55 0.06 75)",
  wall: "oklch(0.27 0.02 35)",
  wallShade: "oklch(0.22 0.018 35)",
  brick: "oklch(0.19 0.015 30)",
  cornice: "oklch(0.33 0.02 40)",
  pane: "oklch(0.15 0.02 255)",
  paneSheen: "oklch(0.3 0.03 250)",
  frame: "oklch(0.36 0.015 40)",
  sill: "oklch(0.4 0.018 45)",
  roof: "oklch(0.17 0.015 260)",
  street: "oklch(0.2 0.015 260)",
  kerb: "oklch(0.3 0.01 260)",
  lobby: "oklch(0.86 0.1 75)",
  moon: "oklch(0.96 0.025 95)",
  star: "oklch(0.95 0.02 230)",
  beacon: "oklch(0.64 0.21 27)",
  screen: "oklch(0.72 0.11 248)",
  kitchen: "oklch(0.91 0.045 100)",
  tube: "oklch(0.94 0.025 200)",
  figure: "oklch(0.2 0.02 40)",
} as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A lamp at this warmth: from a cool LED to a deep tungsten. */
const lampColour = (warmth: number) => {
  const k = clamp(warmth, 0, 1);
  return `oklch(${r3(0.93 - 0.11 * k)} ${r3(0.025 + 0.12 * k)} ${r2(98 - 34 * k)})`;
};

/** 18 → "18:00", 24.25 → "00:15". Fixed 24-hour clock, the same everywhere. */
export const clockOf = (hour: number) => {
  const minutes = Math.round(hour * 60) % (24 * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** A small seeded generator. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x2545f491) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------------------------- plan ---------------------------------- */

type Kind = "empty" | "lamp" | "screen" | "both" | "kitchen" | "stair";

type Plan = {
  kind: Kind;
  /** Hours the lights come on and go off. */
  on: number;
  off: number;
  /** For a lamp-and-screen flat: when the lamp goes off and the screen stays. */
  lampOff: number;
  /** Seconds this window takes to answer a change of hour. */
  delay: number;
  /** Blinds, a curtain left or right, or bare. */
  deco: 0 | 1 | 2 | 3;
  /** Away from the room for a while: [period, duration, phase] in seconds. */
  away: [number, number, number] | null;
  /** A figure crosses: [period, duration, phase, direction]. */
  figure: [number, number, number, number] | null;
  /** Flicker phase and brightness of its own. */
  phase: number;
  tone: number;
};

/** Who lives where and their hours, the same for the same seed everywhere. */
function planWindows(floors: number, cols: number, seed: number): Plan[] {
  const rand = lcg(seed * 977 + floors * 31 + cols);
  const stairCol = cols >= 4 ? Math.floor(cols / 2 + (rand() - 0.5) * 2) : -1;
  const plans: Plan[] = [];
  for (let f = 0; f < floors; f += 1) {
    for (let c = 0; c < cols; c += 1) {
      const r = rand();
      const stair = c === stairCol;
      const kind: Kind = stair
        ? "stair"
        : r < 0.09
          ? "empty"
          : r < 0.43
            ? "lamp"
            : r < 0.62
              ? "screen"
              : r < 0.9
                ? "both"
                : "kitchen";
      const u = rand();
      const on = stair || rand() < 0.74 ? 17 : 18 + rand() * 2.6;
      const off = stair
        ? 29
        : u < 0.42
          ? 21.3 + rand() * 2.7
          : u < 0.77
            ? 24 + rand() * 2
            : u < 0.94
              ? 26 + rand() * 2.2
              : 29;
      const d = rand();
      plans.push({
        kind,
        on,
        off,
        lampOff: Math.min(off, 21.8 + rand() * 2.4),
        delay: rand() * 0.34,
        deco: d < 0.3 ? 1 : d < 0.48 ? 2 : d < 0.6 ? 3 : 0,
        away:
          !stair && rand() < 0.4
            ? [26 + rand() * 44, 3 + rand() * 7, rand() * 60]
            : null,
        figure:
          (kind === "lamp" || kind === "both" || kind === "kitchen") &&
          rand() < 0.32
            ? [
                13 + rand() * 30,
                2.6 + rand() * 2.2,
                rand() * 40,
                rand() < 0.5 ? 1 : -1,
              ]
            : null,
        phase: rand() * 100,
        tone: (rand() - 0.5) * 0.16,
      });
    }
  }
  return plans;
}

/** Whether the schedule has a window lit at an hour (lamp or screen). */
const litAt = (p: Plan, hour: number) =>
  p.kind !== "empty" && hour >= p.on && hour < p.off;

/* -------------------------------- geometry -------------------------------- */

type Win = { x: number; y: number; s: number; cx: number; cy: number };

type Geo = {
  w: number;
  h: number;
  fw: number;
  sky: number;
  streetTop: number;
  bx0: number;
  bx1: number;
  roof: number;
  floors: number;
  cols: number;
  floorH: number;
  windows: Win[];
  mast: { x: number; top: number; base: number };
  tank: { x: number; y: number; w: number; h: number };
  door: { x: number; y: number; w: number; h: number };
};

function geometry(
  w: number,
  h: number,
  floorsIn: number,
  columns: number | undefined,
  rail: boolean,
): Geo {
  const fw = w - (rail ? RAIL : 0);
  const sky = Math.round(clamp(h * 0.12, 40, 84));
  const street = Math.round(clamp(h * 0.085, 28, 52));
  const streetTop = h - street;
  const side = Math.round(clamp(fw * 0.07, 10, 44));
  const bx0 = side;
  const bx1 = Math.max(bx0 + 60, fw - side);
  const roof = sky;
  const floors = clamp(Math.round(floorsIn), 4, 18);
  const top = roof + 10;
  const floorH = (streetTop - 6 - top) / floors;
  const inset = 8;
  const bw = bx1 - bx0 - inset * 2;
  const cols =
    columns !== undefined
      ? clamp(Math.round(columns), 2, 12)
      : clamp(Math.round(bw / (floorH * 1.18)), 3, 9);
  const colW = bw / cols;
  const s = Math.max(4, Math.min(floorH * 0.56, colW * 0.6));
  const windows: Win[] = [];
  for (let f = 0; f < floors; f += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = bx0 + inset + (c + 0.5) * colW;
      const cy = top + (f + 0.46) * floorH;
      windows.push({
        x: r2(cx - s / 2),
        y: r2(cy - s / 2),
        s: r2(s),
        cx: r2(cx),
        cy: r2(cy),
      });
    }
  }
  // The tank stands left of centre, where the moon is high when it passes.
  const tankW = clamp((bx1 - bx0) * 0.12, 14, 30);
  return {
    w,
    h,
    fw,
    sky,
    streetTop,
    bx0,
    bx1,
    roof,
    floors,
    cols,
    floorH,
    windows,
    mast: { x: r2(bx0 + (bx1 - bx0) * 0.2), top: r2(roof * 0.3), base: roof },
    tank: {
      x: r2(bx0 + (bx1 - bx0) * 0.52),
      y: r2(roof - tankW * 0.82),
      w: r2(tankW),
      h: r2(tankW * 0.55),
    },
    door: {
      x: r2((bx0 + bx1) / 2 - clamp(colW * 0.45, 12, 26)),
      y: r2(streetTop - 6 + street * 0.18),
      w: r2(clamp(colW * 0.9, 24, 52)),
      h: r2(street * 0.62),
    },
  };
}

/* --------------------------------- engine -------------------------------- */

type Config = {
  geo: Geo;
  plans: Plan[];
  warmth: number;
  silhouettes: boolean;
  flicker: boolean;
  beacon: boolean;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
};

type Live = {
  want: number;
  state: number;
  at: number;
  switched: number;
  lamp: number;
  screen: number;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  wake: () => void;
  dispose: () => void;
};

/** Smooth value noise in one dimension, for a screen's flicker. */
const noise1 = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const k = f * f * (3 - 2 * f);
  return h(i) * (1 - k) + h(i + 1) * k;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  hour: MotionValue<number>,
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let live: Live[] = [];
  let frame = 0;
  let last = 0;
  let lastDraw = 0;
  let clock = 0;
  let disposed = false;
  let sprites: Record<
    | "lamp"
    | "screen"
    | "kitchen"
    | "tube"
    | "glowLamp"
    | "glowScreen"
    | "glowCool"
    | "figure"
    | "beacon",
    HTMLCanvasElement
  > | null = null;
  let spriteKey = "";
  let hasAway = false;

  const sprite = (draw: (c: CanvasRenderingContext2D) => void) => {
    const el = document.createElement("canvas");
    el.width = 48;
    el.height = 48;
    const c = el.getContext("2d");
    if (c) draw(c);
    return el;
  };

  /** Every light's look, drawn once per warmth: interiors, glows, a figure. */
  const makeSprites = (warmth: number) => {
    const lamp = lampColour(warmth);
    const interior = (base: string, hot: string, from: "low" | "high") =>
      sprite((c) => {
        c.fillStyle = base;
        c.fillRect(0, 0, 48, 48);
        const g = c.createRadialGradient(
          24,
          from === "low" ? 40 : 6,
          2,
          24,
          from === "low" ? 40 : 6,
          44,
        );
        g.addColorStop(0, hot);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 48, 48);
        // A ceiling or a floor falls away from the light.
        const fall = c.createLinearGradient(0, 0, 0, 48);
        fall.addColorStop(from === "low" ? 0 : 1, "rgba(10, 8, 12, 0.42)");
        fall.addColorStop(0.55, "rgba(10, 8, 12, 0)");
        c.fillStyle = fall;
        c.fillRect(0, 0, 48, 48);
      });
    const glow = (colour: string) =>
      sprite((c) => {
        const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
        g.addColorStop(0, colour);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        c.fillStyle = g;
        c.globalAlpha = 0.9;
        c.fillRect(0, 0, 48, 48);
      });
    sprites = {
      lamp: interior(lamp, "oklch(0.98 0.04 90)", "low"),
      screen: sprite((c) => {
        c.fillStyle = "oklch(0.24 0.04 255)";
        c.fillRect(0, 0, 48, 48);
        const g = c.createRadialGradient(14, 40, 1, 14, 40, 46);
        g.addColorStop(0, ART.screen);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 48, 48);
      }),
      kitchen: interior(ART.kitchen, "oklch(0.99 0.01 120)", "high"),
      tube: interior(ART.tube, "oklch(0.99 0.01 200)", "high"),
      glowLamp: glow(lamp),
      glowScreen: glow(ART.screen),
      glowCool: glow(ART.tube),
      figure: sprite((c) => {
        // Head and shoulders behind a curtain: soft, never crisp.
        c.shadowColor = ART.figure;
        c.shadowBlur = 3;
        c.shadowOffsetX = 100;
        c.fillStyle = ART.figure;
        c.beginPath();
        c.arc(24 - 100, 15, 7, 0, Math.PI * 2);
        c.moveTo(6 - 100, 48);
        c.quadraticCurveTo(8 - 100, 25, 24 - 100, 25);
        c.quadraticCurveTo(40 - 100, 25, 42 - 100, 48);
        c.closePath();
        c.fill();
      }),
      beacon: glow(ART.beacon),
    };
  };

  const size = () => {
    const c = cfg;
    if (!c || !ctx) return false;
    const { w, h } = c.geo;
    if (w < 1 || h < 1) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    return true;
  };

  /** Moves every window toward what its schedule wants now. Returns whether any still changes. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const H = hour.get();
    const alive = c.motionSafe && !c.paused;
    let changing = false;
    for (let i = 0; i < c.plans.length; i += 1) {
      const p = c.plans[i];
      const st = live[i];
      if (!p || !st) continue;
      const lit = litAt(p, H);
      let lampOn =
        lit &&
        (p.kind === "lamp" ||
          p.kind === "kitchen" ||
          p.kind === "stair" ||
          (p.kind === "both" && H < p.lampOff));
      let screenOn = lit && (p.kind === "screen" || p.kind === "both");
      if (alive && p.away && lit) {
        const [period, dur, phase] = p.away;
        if ((clock + phase) % period < dur) {
          lampOn = false;
          screenOn = false;
        }
      }
      const want = (lampOn ? 1 : 0) | (screenOn ? 2 : 0);
      if (want !== st.want) {
        st.want = want;
        st.at = clock + (c.motionSafe ? p.delay : 0);
      }
      if (st.state !== st.want && clock >= st.at) {
        st.state = st.want;
        st.switched = clock;
      }
      const lampT = st.state & 1 ? 1 : 0;
      const screenT = st.state & 2 ? 1 : 0;
      if (!c.motionSafe) {
        // A short cross-fade, no flicker on the way.
        const k = 1 - Math.exp(-dt / 0.08);
        st.lamp += (lampT - st.lamp) * k;
        st.screen += (screenT - st.screen) * k;
      } else {
        const tube = p.kind === "kitchen" || p.kind === "stair";
        const since = clock - st.switched;
        if (tube && lampT === 1 && since < 0.32) {
          // A tube blinks twice before it holds.
          st.lamp =
            since < 0.05 || (since > 0.12 && since < 0.17) ? 0.85 : 0.08;
        } else {
          const tau = lampT > st.lamp ? 0.06 : 0.17;
          st.lamp += (lampT - st.lamp) * (1 - Math.exp(-dt / tau));
        }
        st.screen += (screenT - st.screen) * (1 - Math.exp(-dt / 0.03));
      }
      if (Math.abs(st.lamp - lampT) < 0.002) st.lamp = lampT;
      if (Math.abs(st.screen - screenT) < 0.002) st.screen = screenT;
      if (st.lamp !== lampT || st.screen !== screenT || st.state !== st.want) {
        changing = true;
      }
    }
    return changing;
  };

  const draw = () => {
    const c = cfg;
    const sp = sprites;
    if (!c || !ctx || !sp || !visible.current) return;
    const { geo } = c;
    const sx = canvas.width / geo.w;
    const sy = canvas.height / geo.h;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    const alive = c.motionSafe && !c.paused;

    // Light spilling onto the wall first, under the panes.
    for (let i = 0; i < geo.windows.length; i += 1) {
      const wn = geo.windows[i];
      const p = c.plans[i];
      const st = live[i];
      if (!wn || !p || !st) continue;
      const lamp = st.lamp;
      const screen = st.screen;
      if (lamp < 0.01 && screen < 0.01) continue;
      const reach = wn.s * 1.45;
      if (lamp > 0.01) {
        ctx.globalAlpha = lamp * 0.3;
        ctx.drawImage(
          p.kind === "kitchen" || p.kind === "stair"
            ? sp.glowCool
            : sp.glowLamp,
          wn.cx - reach,
          wn.cy - reach,
          reach * 2,
          reach * 2,
        );
      }
      if (screen > 0.01) {
        ctx.globalAlpha = screen * 0.2;
        ctx.drawImage(
          sp.glowScreen,
          wn.cx - reach,
          wn.cy - reach,
          reach * 2,
          reach * 2,
        );
      }
    }

    for (let i = 0; i < geo.windows.length; i += 1) {
      const wn = geo.windows[i];
      const p = c.plans[i];
      const st = live[i];
      if (!wn || !p || !st) continue;
      let lamp = st.lamp;
      let screen = st.screen;
      if (lamp < 0.01 && screen < 0.01) continue;
      if (alive && c.flicker) {
        if (screen > 0) {
          screen *= 0.6 + 0.4 * noise1(clock * 7 + p.phase);
        }
        if (p.kind === "stair") {
          // Now and then the old tube stutters.
          const t = (clock + p.phase) % 23;
          if (t < 0.42) lamp *= Math.sin(t * 60) > 0.2 ? 1 : 0.15;
        }
      }
      const { x, y, s } = wn;
      if (lamp > 0.01) {
        ctx.globalAlpha = clamp(lamp * (0.92 + p.tone), 0, 1);
        const look =
          p.kind === "kitchen"
            ? sp.kitchen
            : p.kind === "stair"
              ? sp.tube
              : sp.lamp;
        ctx.drawImage(look, x, y, s, s);
      }
      if (screen > 0.01) {
        if (p.kind === "both" && lamp > 0.05) {
          // A lit room with the television on: the lamp's warmth, and the
          // screen's blue in the corner where it stands.
          ctx.globalAlpha = clamp(screen * 0.7, 0, 1);
          ctx.drawImage(
            sp.glowScreen,
            x + s * 0.04,
            y + s * 0.36,
            s * 0.6,
            s * 0.6,
          );
        } else {
          ctx.globalAlpha = clamp(screen, 0, 1);
          ctx.drawImage(sp.screen, x, y, s, s);
        }
      }
      const shown = Math.max(lamp, screen);
      // Someone crossing the room.
      if (alive && c.silhouettes && p.figure && lamp > 0.3) {
        const [period, dur, phase, dir] = p.figure;
        const t = (clock + phase) % period;
        if (t < dur) {
          const u = t / dur;
          const across = dir > 0 ? u : 1 - u;
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, s, s);
          ctx.clip();
          ctx.globalAlpha = 0.72 * lamp;
          ctx.drawImage(
            sp.figure,
            x - s * 0.5 + across * s * 1.1,
            y + s * 0.18,
            s * 0.92,
            s * 0.92,
          );
          ctx.restore();
        }
      }
      // Blinds or a curtain, seen against the light.
      if (p.deco === 1) {
        ctx.globalAlpha = 0.22 * shown;
        ctx.fillStyle = ART.figure;
        const slats = s > 14 ? 4 : 3;
        for (let k = 1; k <= slats; k += 1) {
          ctx.fillRect(
            x,
            y + (k * s) / (slats + 1),
            s,
            Math.max(0.6, s * 0.035),
          );
        }
      } else if (p.deco === 2 || p.deco === 3) {
        ctx.globalAlpha = 0.34 * shown;
        ctx.fillStyle = ART.figure;
        ctx.fillRect(p.deco === 2 ? x : x + s * 0.7, y, s * 0.3, s);
      }
    }

    // The antenna's beacon.
    if (c.beacon) {
      const on = alive ? clock % 1.7 < 0.2 : true;
      const { x, top } = geo.mast;
      if (on) {
        ctx.globalAlpha = 0.9;
        ctx.drawImage(sp.beacon, x - 9, top - 9, 18, 18);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ART.beacon;
        ctx.beginPath();
        ctx.arc(x, top, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    const changing = step(dt);
    const ambient =
      c.motionSafe &&
      !c.paused &&
      (c.flicker || c.silhouettes || c.beacon || hasAway);
    // Ambient life is slow by nature: 24 frames a second is plenty for it.
    if (changing || !ambient || now - lastDraw > 40) {
      draw();
      lastDraw = now;
    }
    if (changing || ambient) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !cfg)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const unsubscribe = hour.on("change", () => kick());

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.plans !== next.plans) {
        hasAway = next.plans.some((p) => p.away !== null);
        // A new building: every window starts where its schedule says.
        const H = hour.get();
        live = next.plans.map((p) => {
          const lit = litAt(p, H);
          const lampOn =
            lit &&
            (p.kind === "lamp" ||
              p.kind === "kitchen" ||
              p.kind === "stair" ||
              (p.kind === "both" && H < p.lampOff));
          const screenOn = lit && (p.kind === "screen" || p.kind === "both");
          const state = (lampOn ? 1 : 0) | (screenOn ? 2 : 0);
          return {
            want: state,
            state,
            at: 0,
            switched: -1,
            lamp: lampOn ? 1 : 0,
            screen: screenOn ? 1 : 0,
          };
        });
      }
      const key = `${next.warmth}`;
      if (key !== spriteKey) {
        spriteKey = key;
        makeSprites(next.warmth);
      }
      size();
      draw();
      kick();
    },
    resize() {
      if (size()) draw();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/* -------------------------------- component ------------------------------ */

/**
 * A tall apartment block at night. Every small square window keeps its own
 * seeded schedule — a warm lamp, a blue screen, both, a kitchen's tube, an
 * empty flat, the stairwell's fluorescent — with its own hours: the lights
 * came on as people got home and go off at their own bedtimes, so the facade
 * runs from a busy early evening to a handful of night owls. While the hour
 * stands still the building still lives: rooms go dark and light again,
 * screens flicker, the stairwell tube stutters, figures pass behind a few
 * lit windows, and the antenna's red beacon blinks.
 *
 * The hour is a rail down the right side, a real vertical slider. Drag it and
 * the moon moves along its arc, the sky deepens and the stars come out, and
 * the windows answer one after another, each after its own short delay, so a
 * change runs across the facade as a cascade; on release the thumb settles on
 * the step on springs.snap. Up and Down move a step, Page Up and Page Down an
 * hour, Home and End go to 18:00 and 04:00. The architecture is SVG and is
 * server-rendered with the windows lit for the first hour; the light is a
 * Canvas 2D layer between the walls and the window frames, drawn only while
 * something changes and at a calm 24 frames a second for ambient life. Under
 * reduced motion nothing flickers or passes, and lights change by short
 * cross-fades.
 */
export function NightFacade({
  hour,
  defaultHour = 21,
  onHourChange,
  floors = 10,
  columns,
  warmth = 0.6,
  step = 15,
  silhouettes = true,
  flicker = true,
  beacon = true,
  rail = true,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Apartment building at night",
  disabled = false,
  className,
}: NightFacadeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const stepH = clamp(step, 1, 120) / 60;
  const snap = React.useCallback(
    (v: number) =>
      clamp(Math.round((v - FIRST) / stepH) * stepH + FIRST, FIRST, LAST),
    [stepH],
  );

  const [own, setOwn] = React.useState(() => snap(defaultHour));
  const committed = snap(hour ?? own);
  const shown = useMotionValue(committed);
  const [box, setBox] = React.useState(NOMINAL);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const dragging = React.useRef(false);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const reported = React.useRef(committed);

  const geo = React.useMemo(
    () => geometry(box.w, box.h, floors, columns, rail),
    [box.w, box.h, floors, columns, rail],
  );
  const plans = React.useMemo(
    () => planWindows(geo.floors, geo.cols, seed),
    [geo.floors, geo.cols, seed],
  );
  const litCount = plans.reduce((n, p) => n + (litAt(p, committed) ? 1 : 0), 0);

  const config: Config = {
    geo,
    plans,
    warmth,
    silhouettes,
    flicker,
    beacon,
    paused,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const e = createEngine(root, canvas, shown, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [shown]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      running.current?.stop();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      if (w > 0 && h > 0) {
        setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
      }
      engine.current?.resize();
    });
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

  /** Glide the shown hour to a value: on the snap spring, or at once. */
  const settle = React.useCallback(
    (to: number, velocity = 0) => {
      running.current?.stop();
      if (!motionSafe) {
        shown.jump(to);
        return;
      }
      running.current = animate(shown, to, { ...springs.snap, velocity });
    },
    [motionSafe, shown],
  );

  // A host that changes `hour` moves the night the same way a key does.
  React.useEffect(() => {
    reported.current = committed;
    if (!dragging.current && Math.abs(shown.get() - committed) > 1e-6) {
      settle(committed);
    }
  }, [committed, settle, shown]);

  const commit = (next: number) => {
    const v = snap(next);
    if (v === reported.current) return;
    reported.current = v;
    if (hour === undefined) setOwn(v);
    onHourChange?.(v);
  };

  const hourAt = (clientY: number) => {
    const el = railRef.current;
    if (!el) return committed;
    const r = el.getBoundingClientRect();
    const span = Math.max(1, r.height - RAIL_PAD * 2);
    return FIRST + ((clientY - r.top - RAIL_PAD) / span) * (LAST - FIRST);
  };

  const drag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      running.current?.stop();
    },
    onMove: ({ point }) => {
      const raw = hourAt(point.y);
      shown.set(r3(rubberClamp(raw, FIRST, LAST, 1.2)));
      commit(raw);
    },
    onEnd: ({ point, velocity }) => {
      dragging.current = false;
      const el = railRef.current;
      const span = el ? Math.max(1, el.clientHeight - RAIL_PAD * 2) : 400;
      const raw = hourAt(point.y);
      commit(raw);
      settle(snap(raw), (velocity.y / span) * (LAST - FIRST));
    },
    onCancel: () => {
      dragging.current = false;
      settle(reported.current);
    },
    onTap: (event) => {
      const v = snap(hourAt(event.clientY));
      commit(v);
      settle(v);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const base = reported.current;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = base + stepH;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = base - stepH;
    else if (event.key === "PageDown") next = base + 1;
    else if (event.key === "PageUp") next = base - 1;
    else if (event.key === "Home") next = FIRST;
    else if (event.key === "End") next = LAST;
    if (next === null) return;
    event.preventDefault();
    const v = snap(next);
    commit(v);
    settle(v);
  };

  // Sky, moon, stars and the thumb all follow the shown hour.
  const night = useTransform(shown, (v) => r3(smooth(18.2, 21.5, v)));
  const stars = useTransform(shown, (v) => r3(smooth(20, 22.5, v) * 0.9));
  // The moon rises on the left, peaks after midnight and sinks to the right,
  // all within the strip of sky above the roof.
  const moonR = r2(clamp(geo.sky * 0.1, 4, 8));
  const moonX = useTransform(shown, (v) =>
    r2(geo.fw * (0.1 + 0.8 * clamp((v - FIRST) / (LAST - FIRST), 0, 1))),
  );
  const moonY = useTransform(shown, (v) =>
    r2(
      geo.sky * 0.82 -
        Math.sin(clamp((v - FIRST) / (LAST - FIRST), 0, 1) * Math.PI) *
          geo.sky *
          0.52,
    ),
  );
  const thumbTop = useTransform(
    shown,
    (v) =>
      `calc(${RAIL_PAD}px + ${r3(clamp((v - FIRST) / (LAST - FIRST), -0.1, 1.1))} * (100% - ${RAIL_PAD * 2}px))`,
  );
  const thumbText = useTransform(shown, (v) => clockOf(snap(v)));

  const total = plans.filter((p) => p.kind !== "empty").length;
  const valueText = `${clockOf(committed)}, ${litCount} of ${total} windows lit`;
  const ssrHour = committed;

  const g = geo;
  const vb = `0 0 ${g.w} ${g.h}`;
  const frames = g.windows
    .map(
      (wn) =>
        `M${wn.x} ${wn.y}h${wn.s}v${wn.s}h${-wn.s}Z M${r2(wn.x + wn.s / 2)} ${wn.y}v${wn.s} M${wn.x} ${r2(wn.y + wn.s * 0.38)}h${wn.s}`,
    )
    .join(" ");
  const sills = g.windows
    .map(
      (wn) =>
        `M${r2(wn.x - 1.5)} ${r2(wn.y + wn.s)}h${r2(wn.s + 3)}v${r2(Math.max(1.2, wn.s * 0.09))}h${r2(-wn.s - 3)}Z`,
    )
    .join(" ");
  const starDots = React.useMemo(() => {
    const rand = lcg(seed * 13 + 5);
    return Array.from({ length: 26 }, (_, i) => ({
      i,
      x: r2(rand() * 100),
      y: r2(rand() * 90),
      r: r2(0.4 + rand() * 0.6),
      o: r2(0.4 + rand() * 0.6),
    }));
  }, [seed]);
  const neighbours = React.useMemo(() => {
    const rand = lcg(seed * 3 + 11);
    const left = Array.from({ length: 6 }, () => rand());
    const right = Array.from({ length: 6 }, () => rand());
    return { left, right };
  }, [seed]);

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/night-facade relative isolate h-[520px] w-full overflow-clip rounded-3 select-none",
        className,
      )}
      style={{ backgroundColor: ART.nightTop }}
    >
      <svg
        role="img"
        aria-label={`${label}, ${valueText}`}
        viewBox={vb}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id={`${uid}-dusk`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ART.duskTop} />
            <stop offset="1" stopColor={ART.duskLow} />
          </linearGradient>
          <linearGradient id={`${uid}-night`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ART.nightTop} />
            <stop offset="1" stopColor={ART.nightLow} />
          </linearGradient>
          <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={ART.wallShade} />
            <stop offset="0.5" stopColor={ART.wall} />
            <stop offset="1" stopColor={ART.wallShade} />
          </linearGradient>
          <pattern
            id={`${uid}-brick`}
            width="12"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 4.6h12M3 0v2.3M9 2.3v2.3"
              stroke={ART.brick}
              strokeWidth="0.6"
              fill="none"
            />
          </pattern>
          <radialGradient id={`${uid}-glow`}>
            <stop offset="0" stopColor={ART.lobby} stopOpacity="0.55" />
            <stop offset="1" stopColor={ART.lobby} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-moon`}>
            <stop offset="0" stopColor={ART.moon} stopOpacity="0.35" />
            <stop offset="1" stopColor={ART.moon} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Sky: dusk underneath, the night drawn over it as the hour goes on. */}
        <rect width={g.w} height={g.streetTop} fill={`url(#${uid}-dusk)`} />
        <motion.rect
          width={g.w}
          height={g.streetTop}
          fill={`url(#${uid}-night)`}
          style={{ opacity: night }}
        />
        <motion.g style={{ opacity: stars }}>
          {starDots.map((st) => (
            <circle
              key={st.i}
              cx={r2((st.x / 100) * g.fw)}
              cy={r2((st.y / 100) * g.sky * 0.92)}
              r={st.r}
              fill={ART.star}
              opacity={st.o}
            />
          ))}
        </motion.g>
        <motion.circle
          cx={moonX}
          cy={moonY}
          r={r2(moonR * 3)}
          fill={`url(#${uid}-moon)`}
        />
        <motion.circle cx={moonX} cy={moonY} r={moonR} fill={ART.moon} />

        {/* Lower blocks either side, further off. */}
        {[0, 1].map((side) => {
          const x0 = side === 0 ? 0 : g.bx1;
          const x1 = side === 0 ? g.bx0 : g.fw;
          const width = Math.max(0, x1 - x0);
          const top = r2(g.roof + (g.streetTop - g.roof) * 0.18);
          const lights = side === 0 ? neighbours.left : neighbours.right;
          return (
            <g key={side}>
              <rect
                x={x0}
                y={top}
                width={width}
                height={r2(g.streetTop - top)}
                fill={ART.far}
              />
              {width > 8
                ? lights.map((v, k) =>
                    v > 0.62 ? (
                      <rect
                        key={k}
                        x={r2(x0 + width * (0.25 + 0.4 * ((k * 0.37) % 1)))}
                        y={r2(top + 10 + k * ((g.streetTop - top - 20) / 6))}
                        width={r2(Math.min(5, width * 0.22))}
                        height={r2(Math.min(5, width * 0.22))}
                        fill={ART.farWindow}
                        opacity={0.55}
                      />
                    ) : null,
                  )
                : null}
            </g>
          );
        })}

        {/* The block. */}
        <rect
          x={g.bx0}
          y={g.roof}
          width={r2(g.bx1 - g.bx0)}
          height={r2(g.streetTop - g.roof)}
          fill={`url(#${uid}-wall)`}
        />
        <rect
          x={g.bx0}
          y={g.roof}
          width={r2(g.bx1 - g.bx0)}
          height={r2(g.streetTop - g.roof)}
          fill={`url(#${uid}-brick)`}
          opacity={0.7}
        />
        <rect
          x={r2(g.bx0 - 3)}
          y={r2(g.roof - 4)}
          width={r2(g.bx1 - g.bx0 + 6)}
          height="7"
          fill={ART.cornice}
        />
        {Array.from({ length: g.floors - 1 }, (_, f) => (
          <rect
            key={f}
            x={g.bx0}
            y={r2(g.roof + 10 + (f + 1) * g.floorH - 1)}
            width={r2(g.bx1 - g.bx0)}
            height="1"
            fill={ART.cornice}
            opacity={0.5}
          />
        ))}
        {g.windows.map((wn, i) => (
          <rect
            key={i}
            x={wn.x}
            y={wn.y}
            width={wn.s}
            height={wn.s}
            fill={ART.pane}
          />
        ))}
        {/* The first paint: windows lit for the first hour, until the light layer takes over. */}
        <g className="transition-opacity duration-300 group-data-live/night-facade:opacity-0">
          {g.windows.map((wn, i) => {
            const p = plans[i];
            if (!p || !litAt(p, ssrHour)) return null;
            const screenOnly =
              p.kind === "screen" ||
              (p.kind === "both" && ssrHour >= p.lampOff);
            const fill = screenOnly
              ? ART.screen
              : p.kind === "kitchen"
                ? ART.kitchen
                : p.kind === "stair"
                  ? ART.tube
                  : lampColour(warmth);
            return (
              <rect
                key={i}
                x={wn.x}
                y={wn.y}
                width={wn.s}
                height={wn.s}
                fill={fill}
                opacity={screenOnly ? 0.7 : 0.92}
              />
            );
          })}
        </g>

        {/* Roof: the mast and the water tank. */}
        <path
          d={`M${g.mast.x} ${g.mast.base}V${g.mast.top}M${r2(g.mast.x - 4)} ${r2(g.mast.top + 6)}h8M${r2(g.mast.x - 6)} ${r2(g.mast.top + 12)}h12`}
          stroke={ART.frame}
          strokeWidth="1"
          fill="none"
        />
        <path
          d={`M${r2(g.tank.x + g.tank.w * 0.15)} ${r2(g.tank.y + g.tank.h)}V${r2(g.roof - 4)}M${r2(g.tank.x + g.tank.w * 0.85)} ${r2(g.tank.y + g.tank.h)}V${r2(g.roof - 4)}`}
          stroke={ART.roof}
          strokeWidth="1.4"
        />
        <rect
          x={g.tank.x}
          y={g.tank.y}
          width={g.tank.w}
          height={g.tank.h}
          rx="2"
          fill={ART.roof}
        />
        <path
          d={`M${r2(g.tank.x - 1)} ${g.tank.y}L${r2(g.tank.x + g.tank.w / 2)} ${r2(g.tank.y - g.tank.w * 0.3)}L${r2(g.tank.x + g.tank.w + 1)} ${g.tank.y}Z`}
          fill={ART.roof}
        />

        {/* Street level: the lobby stays lit all night. */}
        <rect
          x="0"
          y={g.streetTop}
          width={g.w}
          height={r2(g.h - g.streetTop)}
          fill={ART.street}
        />
        <rect x="0" y={g.streetTop} width={g.w} height="1.5" fill={ART.kerb} />
        <ellipse
          cx={r2(g.door.x + g.door.w / 2)}
          cy={r2(g.door.y + g.door.h)}
          rx={r2(g.door.w * 1.6)}
          ry={r2(g.door.h * 0.9)}
          fill={`url(#${uid}-glow)`}
        />
        <rect
          x={g.door.x}
          y={g.door.y}
          width={g.door.w}
          height={g.door.h}
          fill={ART.lobby}
          opacity={0.85}
        />
        <path
          d={`M${r2(g.door.x + g.door.w / 2)} ${g.door.y}v${g.door.h}M${r2(g.door.x - 4)} ${r2(g.door.y - 2)}h${r2(g.door.w + 8)}`}
          stroke={ART.frame}
          strokeWidth="1.4"
        />
      </svg>

      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/night-facade:opacity-100"
      />

      <svg
        aria-hidden
        viewBox={vb}
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <path d={frames} fill="none" stroke={ART.frame} strokeWidth="1" />
        <path d={sills} fill={ART.sill} />
      </svg>

      {rail ? (
        <div
          ref={railRef}
          {...drag}
          className={cn(
            "absolute inset-y-0 right-0 touch-pan-x",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-ns-resize",
          )}
          style={{
            width: RAIL,
            backgroundImage:
              "linear-gradient(to right, transparent, oklch(0.1 0.02 260 / 0.5))",
          }}
        >
          <span
            aria-hidden
            className="absolute right-[18px] w-px rounded-full"
            style={{
              top: RAIL_PAD,
              bottom: RAIL_PAD,
              backgroundColor: "oklch(0.95 0.01 250 / 0.28)",
            }}
          />
          {Array.from({ length: 11 }, (_, k) => (
            <span
              key={k}
              aria-hidden
              className="absolute right-[14px] h-px"
              style={{
                width: k % 2 === 0 ? 9 : 5,
                right: k % 2 === 0 ? 14 : 16,
                top: `calc(${RAIL_PAD}px + ${k / 10} * (100% - ${RAIL_PAD * 2}px))`,
                backgroundColor: "oklch(0.95 0.01 250 / 0.42)",
              }}
            />
          ))}
          {[0, 2, 4, 6, 8, 10].map((k) => (
            <span
              key={k}
              aria-hidden
              className="absolute left-1 -translate-y-1/2 font-mono text-[9px] leading-none tabular-nums"
              style={{
                top: `calc(${RAIL_PAD}px + ${k / 10} * (100% - ${RAIL_PAD * 2}px))`,
                color: "oklch(0.92 0.01 250 / 0.55)",
              }}
            >
              {String((FIRST + k) % 24).padStart(2, "0")}
            </span>
          ))}
          <motion.div
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label="Hour"
            aria-orientation="vertical"
            aria-valuemin={FIRST}
            aria-valuemax={LAST}
            aria-valuenow={r2(committed)}
            aria-valuetext={valueText}
            aria-describedby={hintId}
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            className="absolute right-1 flex h-5 -translate-y-1/2 items-center justify-center rounded-full px-1.5 font-mono text-[10px] leading-none font-medium tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            style={{
              top: thumbTop,
              backgroundColor: "oklch(0.95 0.015 90)",
              color: "oklch(0.22 0.02 260)",
              boxShadow: "0 1px 3px oklch(0.05 0.02 260 / 0.6)",
            }}
          >
            <motion.span>{thumbText}</motion.span>
          </motion.div>
        </div>
      ) : null}

      <p id={hintId} className="sr-only">
        Drag down the rail to move the night on. Down and Up move{" "}
        {Math.round(stepH * 60)} minutes, Page Down and Page Up an hour, Home
        and End go to 18:00 and 04:00.
      </p>
    </div>
  );
}
