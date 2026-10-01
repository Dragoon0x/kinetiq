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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BokehNightAperture = "round" | "hex";

export type BokehNightProps = {
  /** What sits over the street: a hero, a heading, a call to action. Its text takes a lamp-white that reads on the night. */
  children?: React.ReactNode;
  /** Controlled focus plane: 0 focuses on the nearest lights (2 m), 1 at infinity. */
  value?: number;
  /** Initial focus when uncontrolled. @default 0.75 */
  defaultValue?: number;
  /** Fires from the pointer, tap or key that moved the focus, with the new value. */
  onValueChange?: (value: number) => void;
  /** The lens's aperture: round discs, or six-bladed hexagons. @default "round" */
  aperture?: BokehNightAperture;
  /** How busy the street is, 0 to 1: a quiet side street to a busy avenue. @default 0.5 */
  density?: number;
  /** The share of sodium lamps, tungsten headlights and warm signs, 0 to 1, against LED white and teal. @default 0.5 */
  warmth?: number;
  /** Lays out the street: the same seed always makes the same street. @default 1 */
  seed?: number;
  /** Let the pointer and the keyboard move the focus. Off, the street is decoration only: no tab stop, no pointer handling. @default true */
  interactive?: boolean;
  /** The focus control's accessible name. @default "Focus" */
  label?: string;
  /** Sets the size. @default "h-full w-full" */
  className?: string;
};

/** Lights as pigments: what a lamp looks like is the same on either theme. */
const HUES = {
  sodium: "oklch(0.8 0.15 68)",
  tungsten: "oklch(0.9 0.08 78)",
  led: "oklch(0.93 0.025 250)",
  tail: "oklch(0.62 0.22 25)",
  amber: "oklch(0.8 0.16 60)",
  pink: "oklch(0.7 0.2 350)",
  teal: "oklch(0.8 0.12 195)",
  blue: "oklch(0.68 0.14 255)",
  green: "oklch(0.82 0.17 155)",
  red: "oklch(0.63 0.22 27)",
  farWarm: "oklch(0.88 0.07 75)",
  farCool: "oklch(0.9 0.03 230)",
} as const;
type Hue = keyof typeof HUES;

const GLOW_WARM = "oklch(0.55 0.13 58)";
const GLOW_COOL = "oklch(0.5 0.09 235)";
/** Text that reads on the night. */
const INK = "oklch(0.97 0.012 85)";

/** Where the horizon sits, and the pointer's band: near the edges is the end of the scale. */
const HORIZON = 0.42;
const TOP = 0.08;
const BOTTOM = 0.92;
const DISTANCES = [2, 3, 5, 10, 20, Infinity] as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/** The focus value as a distance in metres: 0 is 2 m, 1 is infinity. */
const metres = (v: number) => (v >= 0.995 ? Infinity : 2 / (1 - clamp01(v)));
/** Where a value sits on the pointer's band, from the top, 0 to 1. */
const bandAt = (v: number) => BOTTOM - (BOTTOM - TOP) * clamp01(v);
const spoken = (v: number) => {
  const d = metres(v);
  if (!Number.isFinite(d) || d > 200) return "infinity";
  return `${d < 10 ? Math.round(d * 2) / 2 : Math.round(d)} m`;
};

function hash(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h = Math.imul(h ^ Math.round(p * 1000), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** A small seeded generator: the same street every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

let probe: CanvasRenderingContext2D | null = null;
/** Any CSS colour the browser can resolve, as sRGB bytes. */
function toRgb(css: string): Rgb {
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "black";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}
const blend = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(lerp(a[0], b[0], t)),
  Math.round(lerp(a[1], b[1], t)),
  Math.round(lerp(a[2], b[2], t)),
];
const rgba = ([r, g, b]: Rgb, a = 1) => `rgb(${r} ${g} ${b} / ${r3(a)})`;

/** One light in the street, in metres: x across, y down from the eye, z away. */
type Light = {
  x: number;
  y: number;
  z: number;
  /** Metres a second along the street; + goes away. */
  speed: number;
  hue: Hue;
  power: number;
  /** Twinkle: how much, how fast, and where in its cycle. */
  flicker: number;
  rate: number;
  phase: number;
  /** Sits on the road, so it shows in the wet tarmac. */
  wet: boolean;
  /** Its place among the far city's windows, or -1: see `crowd` in draw. */
  rank: number;
};

const NEAREST = 3.5;
const FARTHEST = 160;

/** The street, from the seed: lamps, both lanes of traffic, shop fronts, a signal and the far city. */
function layStreet(seed: number, density: number, warmth: number): Light[] {
  const rand = seeded(hash(seed, 13));
  const d = clamp01(density);
  const warm = () => rand() < clamp01(warmth);
  const out: Light[] = [];
  const still = {
    speed: 0,
    flicker: 0,
    rate: 0,
    phase: 0,
    wet: false,
    rank: -1,
  };

  // Street lamps on both kerbs, receding to the vanishing point.
  const lamps = Math.round(lerp(4, 9, d));
  const pitch = 13 + rand() * 4;
  for (const side of [-1, 1]) {
    const start = 5 + rand() * pitch;
    const sodium = warm();
    for (let i = 0; i < lamps; i += 1) {
      out.push({
        ...still,
        x: side * (8.5 + rand() * 1.2),
        y: -4.4 - rand() * 0.4,
        z: start + i * pitch,
        hue: sodium || rand() < 0.15 ? "sodium" : "led",
        power: 1,
      });
    }
  }
  // Headlights coming up the near lane, tail lights going away up the far.
  const cars = Math.round(lerp(1, 4, d));
  for (const lane of [-1, 1]) {
    for (let i = 0; i < cars; i += 1) {
      const z = NEAREST + ((i + rand() * 0.6) / cars) * (FARTHEST - NEAREST);
      const speed = lane * (3 + rand() * 2.5);
      const hue: Hue = lane < 0 ? (warm() ? "tungsten" : "led") : "tail";
      for (const wing of [-0.75, 0.75]) {
        out.push({
          x: lane * 1.9 + wing,
          y: 0.75,
          z,
          speed,
          hue,
          power: lane < 0 ? 1.3 : 0.8,
          flicker: 0,
          rate: 0,
          phase: 0,
          wet: true,
          rank: -1,
        });
      }
    }
  }
  // Shop fronts and signs along the pavement.
  const shops = Math.round(lerp(4, 14, d));
  const warmSigns: Hue[] = ["amber", "pink", "red", "farWarm"];
  const coolSigns: Hue[] = ["teal", "blue", "green", "farCool"];
  for (let i = 0; i < shops; i += 1) {
    const set = warm() ? warmSigns : coolSigns;
    out.push({
      x: (rand() < 0.5 ? -1 : 1) * (10 + rand() * 6),
      y: -0.8 + rand() * 1.5,
      z: 8 + rand() * 80,
      speed: 0,
      hue: set[Math.floor(rand() * set.length)] ?? "amber",
      power: 0.55 + rand() * 0.35,
      flicker: rand() < 0.3 ? 0.12 : 0.03,
      rate: 2 + rand() * 6,
      phase: rand() * Math.PI * 2,
      wet: true,
      rank: -1,
    });
  }
  // A signal or two over the junction.
  const signals: Hue[] = ["green", "red", "amber"];
  for (let i = 0; i < (d > 0.3 ? 2 : 1); i += 1) {
    out.push({
      ...still,
      x: (i % 2 ? 1 : -1) * 6,
      y: -2.6,
      z: 26 + rand() * 14,
      hue: signals[Math.floor(rand() * signals.length)] ?? "green",
      power: 1,
      wet: true,
    });
  }
  // The far city: windows stacked up along the horizon.
  const far = Math.round(lerp(10, 40, d));
  for (let i = 0; i < far; i += 1) {
    out.push({
      x: (rand() - 0.5) * 90,
      y: 1 - rand() * rand() * 25,
      z: 160 + rand() * 260,
      speed: 0,
      hue: warm() ? "farWarm" : "farCool",
      power: 0.2 + rand() * 0.25,
      flicker: 0.18,
      rate: 0.6 + rand() * 1.8,
      phase: rand() * Math.PI * 2,
      wet: false,
      rank: i,
    });
  }
  return out;
}

const wrap = (z: number) => {
  const span = FARTHEST - NEAREST;
  return NEAREST + ((((z - NEAREST) % span) + span) % span);
};

/** A disc as the aperture makes it, in one light's colour: a crisp edge and a faintly brighter rim. */
function discSprite(colour: string, shape: BokehNightAperture) {
  const size = 192;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const r = size / 2 - 3;
  ctx.translate(size / 2, size / 2);
  ctx.beginPath();
  if (shape === "hex") {
    // Six blades, all turned the same way, their corners a little soft.
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i + Math.PI / 12;
      const x = Math.cos(a) * (r - 2);
      const y = Math.sin(a) * (r - 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  }
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  // The rim: real bokeh is a touch brighter at its edge.
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = r * 0.16;
  ctx.save();
  ctx.clip();
  ctx.stroke();
  ctx.restore();
  return c;
}

/** A light in focus: a hot centre and a short glow. */
function pointSprite(colour: string) {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgb(255 255 255 / 1)");
  g.addColorStop(0.12, colour);
  g.addColorStop(0.3, colour);
  g.addColorStop(1, "rgb(0 0 0 / 0)");
  ctx.fillStyle = g;
  ctx.globalAlpha = 1;
  ctx.fillRect(0, 0, size, size);
  // The glow fades in colour, not to black: lift the outer ring's alpha off.
  ctx.globalCompositeOperation = "destination-in";
  const a = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  a.addColorStop(0, "rgb(0 0 0 / 1)");
  a.addColorStop(0.3, "rgb(0 0 0 / 0.55)");
  a.addColorStop(1, "rgb(0 0 0 / 0)");
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, size, size);
  return c;
}

type Sprites = Map<Hue, { disc: HTMLCanvasElement; point: HTMLCanvasElement }>;

type Night = {
  sky: Rgb;
  street: Rgb;
  /** 0 on a light page (blue hour), 1 on a dark one (deep night). */
  dark: number;
};

type Api = {
  resize: () => void;
  restyle: () => void;
  kick: () => void;
};

// The night's colours live on the canvas — the sky as its text colour, the
// street and the room as its (zero-width) border colours — so they resolve
// from the theme the street sits in, and a 1ms colour transition says when
// it changed. Deep night on a dark page; blue hour on a light one.
const INKS: React.CSSProperties = {
  color:
    "color-mix(in oklab, oklch(from var(--accent) 0.18 0.06 h) 82%, var(--background))",
  borderTopColor:
    "color-mix(in oklab, oklch(from var(--accent) 0.1 0.03 h) 85%, var(--background))",
  borderLeftColor: "var(--background)",
};

/**
 * A backdrop of city lights seen through a fast lens. Every light in a
 * seeded night street — lamps down both kerbs, headlights coming, tail
 * lights going, shop signs, a signal, the far city — is drawn as the disc a
 * real lens makes of it: its size is proportional to how far its inverse
 * distance is from the focus plane's, so near lights balloon when the lens
 * is focused far and the far city blooms when it is focused near. Discs at
 * the frame's edge are cut into cat's-eyes, street-level lights shine back
 * from the wet road, and the traffic drifts while the camera sways a little.
 *
 * The pointer's height sets the focus plane (the value): low is near, high is
 * far, and the lens racks there on the glide spring; a tap focuses on touch.
 * It is a real vertical slider under the content, so the keyboard racks it
 * too, and a distance scale appears on the right while it is being focused.
 * Frames run only on screen in a visible page. Under reduced motion nothing
 * drifts: the still street refocuses instantly, one redraw per move.
 */
export function BokehNight({
  children,
  value,
  defaultValue = 0.75,
  onValueChange,
  aperture = "round",
  density = 0.5,
  warmth = 0.5,
  seed = 1,
  interactive = true,
  label = "Focus",
  className,
}: BokehNightProps) {
  const motionSafe = useMotionSafe();
  const [own, setOwn] = React.useState(() => r2(clamp01(defaultValue)));
  const current = r2(clamp01(value ?? own));

  const lens = useMotionValue(current);
  const presence = useMotionValue(0);
  const markerTop = useTransform(lens, (v) => `${r2(bandAt(v) * 100)}%`);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const street = React.useRef<Light[]>([]);
  const sprites = React.useRef<Sprites>(new Map());
  const night = React.useRef<Night | null>(null);
  const backdrop = React.useRef<HTMLCanvasElement | null>(null);
  const box = React.useRef({ w: 0, h: 0, dpr: 1 });
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const clock = React.useRef(0);
  const visible = React.useRef(true);
  const painted = React.useRef(false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const hovering = React.useRef(false);
  const keyed = React.useRef(false);
  const reported = React.useRef(current);
  const restyling = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const latest = React.useRef({ warmth, motionSafe });
  React.useEffect(() => {
    latest.current = { warmth, motionSafe };
  });

  /** Reports a new focus from the move that made it; the lens follows the value. */
  const focusTo = (next: number) => {
    const v = r2(clamp01(next));
    if (v === reported.current) return;
    reported.current = v;
    if (value === undefined) setOwn(v);
    onValueChange?.(v);
  };

  const show = (on: boolean) => {
    if (!motionSafe) {
      halt("presence");
      presence.set(on ? 1 : 0);
      return;
    }
    run(
      "presence",
      animate(
        presence,
        on ? 1 : 0,
        on
          ? { duration: durations.base, ease: easings.enter }
          : { duration: durations.slow, ease: easings.exit },
      ),
    );
  };

  const fromPointer = (clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.height < 1) return current;
    return (BOTTOM - (clientY - r.top) / r.height) / (BOTTOM - TOP);
  };

  // Touch focuses where it taps, like a camera; swipes still scroll the page.
  const drag = useDrag({
    disabled: !interactive,
    onTap: (event) => {
      show(true);
      focusTo(fromPointer(event.clientY));
    },
  });

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const nt = night.current;
    const bg = backdrop.current;
    if (!canvas || !ctx || !nt || !bg) return;
    const { w, h, dpr } = box.current;
    const t = clock.current;
    const focus = 1 - clamp01(lens.get());
    // Street scale, metres to px at 2 m: the street's width follows the
    // box's, so the kerbs open out to the frame's edges on any aspect.
    const ux = w * 0.2;
    const uy = h * 0.34;
    const vx = w / 2;
    const vy = h * HORIZON;
    // Defocus: the blur circle at a full unit of inverse distance.
    const blur = Math.min(h * 0.3, 74);
    const sway = 0.45 * Math.sin((t * Math.PI * 2) / 46);
    const half = Math.hypot(w, h) / 2;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const disc = (
      sprite: HTMLCanvasElement,
      x: number,
      y: number,
      r: number,
      alpha: number,
      stretch = 1,
    ) => {
      if (alpha < 0.004 || r < 0.3) return;
      if (x + r < 0 || x - r > w || y + r * stretch < 0 || y - r * stretch > h)
        return;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(sprite, x - r, y - r * stretch, r * 2, r * 2 * stretch);
    };

    for (const L of street.current) {
      const z = L.speed ? wrap(L.z + L.speed * t) : L.z;
      const p = 2 / z;
      // Placed as a long lens sees the street — perspective compressed, so
      // the lights stack across the frame — while each blur circle keeps the
      // true law in p.
      const q = Math.pow(p, 0.6);
      const x = vx + (L.x - sway) * q * ux;
      const y = vy + L.y * q * uy;
      const coc = blur * Math.abs(p - focus);
      const twinkle = L.flicker
        ? 1 + L.flicker * Math.sin(t * L.rate + L.phase)
        : 1;
      // Traffic fades in out of the distance and out as it passes the lens.
      const arrive = L.speed
        ? smooth((FARTHEST - z) / 20) * smooth((z - NEAREST) / 2.5)
        : 1;
      // The far city's windows overlap once they blur: past a point every
      // other one fades out and the rest take its light, then again, so a
      // near focus does not paint forty faint circles where ten would do.
      let crowd = 1;
      if (L.rank >= 0) {
        const halve = smooth((coc - 14) / 8);
        const quarter = smooth((coc - 28) / 12);
        if (L.rank % 2 === 1) crowd = 1 - halve;
        else if (L.rank % 4 === 2) crowd = (1 + halve) * (1 - quarter);
        else crowd = (1 + halve) * (1 + quarter);
      }
      const power = L.power * twinkle * arrive * crowd;
      const look = sprites.current.get(L.hue);
      if (!look || power <= 0.01) continue;

      // Sharp lights are points with a glow; a widening blur circle hands
      // over to a disc whose light is spread over its area.
      const r = Math.max(coc, 1.2);
      const sharp = 1 - smooth((coc - 1.5) / 3.5);
      if (sharp > 0.01) {
        const glow = 2.5 + 6 * Math.min(1.4, power) * (0.5 + p);
        disc(look.point, x, y, glow, power * sharp);
      }
      if (sharp < 0.99) {
        // A wider circle spreads the same light thinner.
        const alpha = (power * (1 - sharp) * 1.1) / (1 + (r / 10) ** 1.6);
        // Optical vignetting: near the frame's edge the disc is cut by the
        // lens barrel into a cat's-eye, its long side along the edge.
        const ex = x - w / 2;
        const ey = y - h / 2;
        const edge = smooth((Math.hypot(ex, ey) / half - 0.42) / 0.58);
        if (edge > 0.02 && r > 6) {
          const len = Math.hypot(ex, ey) || 1;
          const shift = r * 0.95 * edge;
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            x - (ex / len) * shift,
            y - (ey / len) * shift,
            r * 1.08,
            0,
            Math.PI * 2,
          );
          ctx.clip();
          disc(look.disc, x, y, r, alpha);
          ctx.restore();
        } else {
          disc(look.disc, x, y, r, alpha);
        }
      }
      // Wet tarmac: the light again, mirrored in the road and smeared down it.
      if (L.wet && L.y < 1.35) {
        const ry = vy + (2.8 - L.y) * q * uy;
        const rr = Math.max(r, 2) * 1.15 + 2;
        const shine = (power * 0.16) / (1 + (rr / 14) ** 1.2);
        if (ry < h + rr * 2 && shine > 0.012) {
          disc(look.disc, x, ry, rr, shine, 1.9);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (!painted.current) {
      painted.current = true;
      rootRef.current?.setAttribute("data-painted", "");
    }
  };

  /** One frame; under full motion, the next is asked for while on screen. */
  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const safe = latest.current.motionSafe;
    if (safe) {
      const dt = last.current ? Math.min(0.05, (now - last.current) / 1000) : 0;
      clock.current += dt;
      last.current = now;
    } else {
      last.current = 0;
    }
    draw();
    if (safe) frame.current = window.requestAnimationFrame(tick);
  };

  /** Starts the drift, or under reduced motion draws one still frame. */
  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(tick);
  };

  /** Reads the night off the canvas and paints its sky, with the horizon's glow. */
  const restyle = () => {
    const canvas = canvasRef.current;
    const { w, h, dpr } = box.current;
    if (!canvas || w < 2 || h < 2) return;
    const style = getComputedStyle(canvas);
    const room = toRgb(style.borderLeftColor);
    const lum = (0.2126 * room[0] + 0.7152 * room[1] + 0.0722 * room[2]) / 255;
    const nt: Night = {
      sky: toRgb(style.color),
      street: toRgb(style.borderTopColor),
      dark: clamp01(1 - lum * 1.2),
    };
    night.current = nt;
    const bg = (backdrop.current ??= document.createElement("canvas"));
    bg.width = canvas.width;
    bg.height = canvas.height;
    const ctx = bg.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const glow = blend(
      toRgb(GLOW_COOL),
      toRgb(GLOW_WARM),
      clamp01(latest.current.warmth),
    );
    const vy = h * HORIZON;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgba(blend(nt.sky, nt.street, 0.25)));
    sky.addColorStop(HORIZON * 0.9, rgba(nt.sky));
    sky.addColorStop(HORIZON + 0.06, rgba(blend(nt.street, nt.sky, 0.35)));
    sky.addColorStop(1, rgba(nt.street));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    // The city's glow along the horizon, sodium or LED as the warmth says.
    ctx.save();
    ctx.translate(w / 2, vy);
    ctx.scale(Math.max(w, h * 2) / 2, h * 0.28);
    const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    haze.addColorStop(0, rgba(glow, lerp(0.28, 0.42, nt.dark)));
    haze.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = haze;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    // Everything here is a blur circle or a glow, so a 1x backing store
    // looks the same on a dense screen and costs a quarter of the pixels.
    const dpr = Math.min(1, window.devicePixelRatio || 1);
    if (w < 2 || h < 2) return;
    const b = box.current;
    if (b.w === w && b.h === h && b.dpr === dpr && night.current) return;
    box.current = { w, h, dpr };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    restyle();
    kick();
  };

  const api = React.useRef<Api>({ resize, restyle, kick });
  React.useEffect(() => {
    api.current = { resize, restyle, kick };
  });

  // The street itself: rebuilt only when what is in it changes.
  React.useEffect(() => {
    street.current = layStreet(seed, density, warmth);
    api.current.restyle();
    api.current.kick();
  }, [seed, density, warmth]);

  // Each light's look for this aperture, painted once.
  React.useEffect(() => {
    const next: Sprites = new Map();
    for (const hue of Object.keys(HUES) as Hue[]) {
      next.set(hue, {
        disc: discSprite(HUES[hue], aperture),
        point: pointSprite(HUES[hue]),
      });
    }
    sprites.current = next;
    api.current.kick();
  }, [aperture]);

  // The lens follows the value: a rack on the glide spring, or at once.
  React.useEffect(() => {
    reported.current = current;
    if (!motionSafe) {
      halt("lens");
      lens.set(current);
      return;
    }
    run("lens", animate(lens, current, springs.glide));
    // `lens` and the run map are stable; the value is what moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, motionSafe]);

  // Under reduced motion every change of focus is one redraw.
  React.useEffect(() => {
    const off = lens.on("change", () => api.current.kick());
    return off;
  }, [lens]);

  // Reduced motion switched on mid-drift: the loop ends after its frame.
  React.useEffect(() => {
    api.current.kick();
  }, [motionSafe]);

  React.useEffect(() => {
    if (interactive) return;
    hovering.current = false;
    keyed.current = false;
    halt("presence");
    presence.set(0);
    // Only switching interaction off resets the scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      last.current = 0;
      if (restyling.current) window.cancelAnimationFrame(restyling.current);
      restyling.current = 0;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) api.current.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // A theme change re-colours the canvas's own borders; the 1ms transition
  // says when, and the sky is painted again from them.
  const onColours = () => {
    if (restyling.current) return;
    restyling.current = window.requestAnimationFrame(() => {
      restyling.current = 0;
      api.current.restyle();
      api.current.kick();
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = current;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = current + 0.05;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = current - 0.05;
        break;
      case "PageUp":
        next = current + 0.25;
        break;
      case "PageDown":
        next = current - 0.25;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    focusTo(next);
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (interactive && event.pointerType !== "mouse") {
          drag.onPointerDown(event);
        }
      }}
      onPointerMove={(event) => {
        if (!interactive) return;
        if (event.pointerType !== "mouse") {
          drag.onPointerMove(event);
          return;
        }
        if (!hovering.current) {
          hovering.current = true;
          show(true);
        }
        focusTo(fromPointer(event.clientY));
      }}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (!interactive || event.pointerType !== "mouse") return;
        hovering.current = false;
        if (!keyed.current) show(false);
      }}
      className={cn(
        "group/bokeh-night relative isolate h-full w-full overflow-clip",
        interactive && "touch-manipulation",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/bokeh-night:hidden"
        style={{
          background: `linear-gradient(${INKS.color as string}, ${INKS.borderTopColor as string})`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={INKS}
      />
      {interactive ? (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-2 w-9 font-mono text-[9px] leading-none tabular-nums"
            style={{ opacity: presence, color: INK }}
          >
            <span className="absolute inset-y-[8%] right-0 w-px bg-current opacity-30" />
            {DISTANCES.map((d) => (
              <span
                key={d}
                className="absolute right-0 flex -translate-y-1/2 items-center gap-1 opacity-70"
                style={{
                  top: `${r2(bandAt(Number.isFinite(d) ? 1 - 2 / d : 1) * 100)}%`,
                }}
              >
                {Number.isFinite(d) ? d : "∞"}
                <span className="h-px w-1.5 bg-current" />
              </span>
            ))}
            <motion.span
              className="absolute right-0 h-0.5 w-3 -translate-y-1/2 rounded-full bg-current"
              style={{ top: markerTop }}
            />
          </motion.div>
          <div
            role="slider"
            tabIndex={0}
            aria-label={label}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(current * 100)}
            aria-valuetext={`Focus at ${spoken(current)}`}
            onKeyDown={onKeyDown}
            onFocus={() => {
              keyed.current = true;
              show(true);
            }}
            onBlur={() => {
              keyed.current = false;
              if (!hovering.current) show(false);
            }}
            className="absolute inset-0 rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
        </>
      ) : null}
      <div
        className="relative h-full"
        style={{ color: INK, "--bokeh-ink": INK } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}
