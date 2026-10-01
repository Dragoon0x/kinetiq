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
import { distances, durations, easings } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FilmBurnLeak = "amber" | "rose" | "teal";

export type FilmBurnProps = {
  /** What the picture shows. Always its accessible name. */
  alt: string;
  /** The picture's address. Without it, `children` is the picture. */
  src?: string;
  /** The finished picture when there is no `src`: an inline SVG or an image. */
  children?: React.ReactNode;
  /** Controlled: the picture may show. Uncontrolled, it is ready once it exists and the burn has had its run. */
  ready?: boolean;
  /** 0 to 1: how far the burn may come while not ready. */
  progress?: number;
  /** Fires once the frame has cleared and the picture is whole. */
  onReady?: () => void;
  /** How fast the light burns in and clears, 0.5 to 2. @default 1 */
  speed?: number;
  /** The colour of the light leak drifting across the frame. @default "amber" */
  leak?: FilmBurnLeak;
  /** Film grain over the film and the burned picture, 0 to 1. @default 0.5 */
  grain?: number;
  /** Play the burn catching and holding when it is pressed. Off unless asked for. @default false */
  sound?: boolean;
  /** The film still burns; it cannot be held. */
  disabled?: boolean;
  /** Sizes the box. @default "aspect-[21/9] w-full" */
  className?: string;
};

/** Fixed pigments: film is film in either theme. */
const LEAKS: Record<FilmBurnLeak, string> = {
  amber: "oklch(0.8 0.16 62)",
  rose: "oklch(0.72 0.18 8)",
  teal: "oklch(0.78 0.12 195)",
};
const FILM = "oklch(0.17 0.018 45)";
const HOLE = "oklch(0.09 0.01 45)";
const LIGHT = "oklch(0.93 0.09 80)";
const BLOOM = "oklch(0.9 0.1 70)";

/** Bytes for the canvas: the film base, the ember ahead of the front, and the flame. */
const FILM_RGB = [27, 18, 13] as const;
const EMBER_RGB = [128, 38, 10] as const;
const AMBER_RGB = [255, 158, 54] as const;
const HOT_RGB = [255, 247, 224] as const;

/** The burn's grid, in CSS px: the canvas scales it up with smoothing. */
const CELL = 3;
/** How deep the burning band is, as a share of the field. */
const BAND = 0.09;
/** Clock seconds (at speed 1): light through the holes, then the burn. */
const BURN_AT = 0.45;
const BURN = 2.6;
/** While not ready the burn waits at this share, the heart of the frame still dark. */
const HOLD = 0.86;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/** An integer hash as a fraction in [0, 1). Unsigned shifts throughout. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Smooth value noise on an integer lattice, 0 to 1. */
function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const at = (a: number, b: number) =>
    hash01((Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ seed) >>> 0);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
  const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
  return top + (bottom - top) * sy;
}

/** Noise in time, 0 to 1: the flame's unsteadiness. */
const flicker = (t: number, seed: number) => {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  return hash01(i + seed) + (hash01(i + 1 + seed) - hash01(i + seed)) * s;
};

type Field = { gw: number; gh: number; f: Float32Array; mottle: Float32Array };

/**
 * Where the burn reaches first: a rounded rectangle's depth from the edge,
 * broken by fractal noise and pulled out under the perforations, where the
 * light got in first. Normalised so 0 burns first and 1 last.
 */
function buildField(w: number, h: number, seed: number): Field {
  const gw = Math.max(8, Math.ceil(w / CELL));
  const gh = Math.max(6, Math.ceil(h / CELL));
  const f = new Float32Array(gw * gh);
  const mottle = new Float32Array(gw * gh);
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let j = 0; j < gh; j += 1) {
    for (let i = 0; i < gw; i += 1) {
      const x = (i + 0.5) * CELL;
      const y = (j + 0.5) * CELL;
      const u = (x / w) * 2 - 1;
      const v = (y / h) * 2 - 1;
      const depth = Math.max(
        0,
        1 - Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25),
      );
      const nx = (x / h) * 2.6;
      const ny = (y / h) * 2.6;
      const n =
        noise2(nx, ny, seed) * 0.57 +
        noise2(nx * 2.1, ny * 2.1, seed ^ 0x51ed) * 0.29 +
        noise2(nx * 4.3, ny * 4.3, seed ^ 0x2b7e) * 0.14;
      // Where the perforations leaked more, the burn is pulled in from the
      // top and bottom: soft tongues, never columns.
      const along = noise2(x / 34, 0.5, seed ^ 0x77a1);
      const edge = Math.min(y, h - y) / h;
      const spot = smooth(0.5, 0.85, along) * Math.exp(-((edge / 0.2) ** 2));
      const value = depth * 0.92 + (n - 0.5) * 0.42 - spot * 0.16;
      f[j * gw + i] = value;
      mottle[j * gw + i] = n;
      lo = Math.min(lo, value);
      hi = Math.max(hi, value);
    }
  }
  const span = Math.max(1e-3, hi - lo);
  for (let k = 0; k < f.length; k += 1) f[k] = (f[k]! - lo) / span;
  return { gw, gh, f, mottle };
}

/** Three seeded tiles of grain, light and dark specks on nothing. */
function grainTiles(seed: number): HTMLCanvasElement[] {
  return [0, 1, 2].map((t) => {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 96;
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    const image = ctx.createImageData(96, 96);
    const d = image.data;
    for (let p = 0; p < 96 * 96; p += 1) {
      const v = hash01(p * 7 + t * 104729 + seed);
      const light = v > 0.5;
      const strength = Math.abs(v - 0.5) * 2;
      const k = light ? 255 : 0;
      d[p * 4] = k;
      d[p * 4 + 1] = light ? 236 : 0;
      d[p * 4 + 2] = light ? 205 : 0;
      d[p * 4 + 3] = Math.round(Math.pow(strength, 2.6) * 120);
    }
    ctx.putImageData(image, 0, 0);
    return c;
  });
}

type Api = {
  kick: () => void;
  readyChanged: (ready: boolean) => void;
  resize: () => void;
};

/**
 * An image placeholder that is a frame of unexposed film. Light gets in
 * through the perforations first, then burns in from every edge on a
 * flickering, ragged front — white-hot at the edge, amber behind, ember
 * ahead — while a light leak drifts across, and the picture it uncovers is
 * blown out and warm. When the burn has taken the frame and the picture is
 * ready, the frame clears: the overexposure, leak and grain fall away and
 * the perforations leave.
 *
 * Hovering holds the burn where it is; a press latches the hold, and the
 * frame is a real toggle button for it, so Space or Enter holds it too.
 * Under reduced motion the front advances in still steps with no flicker, the
 * leak glows in place, the grain is still, and the clear is a fade; the burn
 * still shows how far the load has got.
 */
export function FilmBurn({
  alt,
  src,
  children,
  ready,
  progress,
  onReady,
  speed = 1,
  leak = "amber",
  grain = 0.5,
  sound = false,
  disabled = false,
  className,
}: FilmBurnProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const patternId = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-holes`;
  const seed = hashText(uid);
  const fromLeft = (seed & 1) === 0;
  const spd = Math.max(0.25, Math.min(4, speed));
  const grit = clamp01(grain);
  const leakColour = LEAKS[leak] ?? LEAKS.amber;

  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null);
  const loaded = src === undefined || loadedSrc === src;
  const [ownReady, setOwnReady] = React.useState(false);
  const controlled = ready !== undefined;
  const isReady = controlled ? ready : ownReady && loaded;
  const [latched, setLatched] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const lit = useMotionValue(0);
  const clearT = useMotionValue(0);
  const holeLight = useMotionValue(0);
  const leakIn = useMotionValue(0);
  const leakX = useMotionValue(fromLeft ? -60 : 85);
  const grainOn = useMotionValue(0);
  const shift = useMotionValue(0);

  const filter = useTransform(
    [lit, clearT] as MotionValue<number>[],
    ([a = 0, c = 0]: number[]) => {
      const e = a * (1 - c);
      if (e < 0.005) return "none";
      return `brightness(${r2(1 + 0.75 * e)}) saturate(${r2(1 - 0.4 * e)}) sepia(${r2(0.32 * e)}) contrast(${r2(1 - 0.12 * e)})`;
    },
  );
  const bloomOpacity = useTransform(
    [lit, clearT] as MotionValue<number>[],
    ([a = 0, c = 0]: number[]) => r2(0.55 * a * (1 - c)),
  );
  const leakOpacity = useTransform(
    [leakIn, clearT] as MotionValue<number>[],
    ([a = 0, c = 0]: number[]) => r2(a * (1 - c)),
  );
  const leakLeft = useTransform(leakX, (v) => `${r2(v)}%`);
  const grainOpacity = useTransform(
    [grainOn, clearT] as MotionValue<number>[],
    ([a = 0, c = 0]: number[]) => r2(a * (1 - c)),
  );
  const stripOpacity = useTransform(clearT, (c) => r2(1 - c));
  const stripUp = useTransform(shift, (c) => r2(-distances.nudge * c));
  const stripDown = useTransform(shift, (c) => r2(distances.nudge * c));
  const holeOpacity = useTransform(holeLight, (v) => r2(v));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const pictureRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const filmRef = React.useRef<HTMLCanvasElement | null>(null);
  const grainRef = React.useRef<HTMLCanvasElement | null>(null);
  const field = React.useRef<Field | null>(null);
  const image = React.useRef<ImageData | null>(null);
  const tiles = React.useRef<HTMLCanvasElement[] | null>(null);
  const box = React.useRef({ w: 0, h: 0, dpr: 1 });
  const frame = React.useRef(0);
  const visible = React.useRef(true);
  const hover = React.useRef(false);
  const shownStep = React.useRef(-1);
  const clearAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const state = React.useRef({
    clock: 0,
    last: 0,
    burn: 0,
    leakT: 0,
    ownReady: false,
    clearing: false,
    frames: 0,
  });
  const latest = React.useRef({
    isReady,
    controlled,
    progress,
    spd,
    motionSafe,
    grit,
    latched,
    disabled,
    onReady,
  });
  React.useEffect(() => {
    latest.current = {
      isReady,
      controlled,
      progress,
      spd,
      motionSafe,
      grit,
      latched,
      disabled,
      onReady,
    };
  });

  /** The film as it stands at `level`, written cell by cell. */
  const drawFilm = (level: number, glow: number) => {
    const fd = field.current;
    const canvas = filmRef.current;
    const ctx = canvas?.getContext("2d");
    if (!fd || !canvas || !ctx) return;
    if (canvas.width !== fd.gw) canvas.width = fd.gw;
    if (canvas.height !== fd.gh) canvas.height = fd.gh;
    if (
      !image.current ||
      image.current.width !== fd.gw ||
      image.current.height !== fd.gh
    ) {
      image.current = ctx.createImageData(fd.gw, fd.gh);
    }
    const d = image.current.data;
    // One continuous ramp through the front, so the coarse grid scales up
    // into a soft edge: film, ember ahead, white-hot where it catches, then
    // amber, then nothing.
    const g = 0.84 + 0.16 * glow;
    for (let k = 0; k < fd.f.length; k += 1) {
      const u = (level - fd.f[k]!) / BAND;
      const o = k * 4;
      if (u >= 1) {
        d[o + 3] = 0;
        continue;
      }
      let r: number;
      let gr: number;
      let b: number;
      if (u <= 0) {
        const m = 0.9 + 0.2 * fd.mottle[k]!;
        const heat = u > -1 ? Math.pow(1 + u, 2.4) * (0.7 + 0.3 * glow) : 0;
        r = mix(FILM_RGB[0] * m, EMBER_RGB[0], heat);
        gr = mix(FILM_RGB[1] * m, EMBER_RGB[1], heat);
        b = mix(FILM_RGB[2] * m, EMBER_RGB[2], heat);
      } else if (u < 0.14) {
        const t = smooth(0, 0.14, u);
        r = mix(EMBER_RGB[0], HOT_RGB[0], t) * g;
        gr = mix(EMBER_RGB[1], HOT_RGB[1], t) * g;
        b = mix(EMBER_RGB[2], HOT_RGB[2], t) * g;
      } else if (u < 0.5) {
        const t = (u - 0.14) / 0.36;
        r = mix(HOT_RGB[0], AMBER_RGB[0], t) * g;
        gr = mix(HOT_RGB[1], AMBER_RGB[1], t) * g;
        b = mix(HOT_RGB[2], AMBER_RGB[2], t) * g;
      } else {
        const t = (u - 0.5) / 0.5;
        r = mix(AMBER_RGB[0], EMBER_RGB[0], t) * g;
        gr = mix(AMBER_RGB[1], EMBER_RGB[1], t) * g;
        b = mix(AMBER_RGB[2], EMBER_RGB[2], t) * g;
      }
      d[o] = r;
      d[o + 1] = gr;
      d[o + 2] = b;
      d[o + 3] = Math.round(255 * (1 - smooth(0.3, 1, u)));
    }
    ctx.putImageData(image.current, 0, 0);
    rootRef.current?.setAttribute("data-painted", "");
  };

  const drawGrain = (n: number) => {
    const canvas = grainRef.current;
    const ctx = canvas?.getContext("2d");
    const { w, h, dpr } = box.current;
    if (!canvas || !ctx || w < 1 || h < 1) return;
    // Grain is drawn at the device's own pixels: film grain is fine.
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    if (!tiles.current) tiles.current = grainTiles(seed);
    const tile = tiles.current[n % 3];
    if (!tile) return;
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const ox = Math.round(hash01(n * 2 + seed) * 96);
    const oy = Math.round(hash01(n * 2 + 1 + seed) * 96);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, cw + 96, ch + 96);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const startClear = () => {
    const s = state.current;
    if (s.clearing) return;
    s.clearing = true;
    setClearing(true);
    if (buttonRef.current && document.activeElement === buttonRef.current) {
      pictureRef.current?.focus({ preventScroll: true });
    }
    const L = latest.current;
    clearAnim.current?.stop();
    // The perforations leave outward, where motion is welcome.
    if (L.motionSafe) {
      animate(shift, 1, { duration: durations.slow, ease: easings.exit });
    }
    clearAnim.current = animate(clearT, 1, {
      duration: L.motionSafe ? 0.9 / Math.sqrt(L.spd) : durations.base,
      ease: easings.enter,
      onComplete: () => {
        setDone(true);
        latest.current.onReady?.();
      },
    });
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = state.current;
    if (s.clearing || !field.current) return;
    if (!visible.current || document.hidden) {
      s.last = 0;
      return;
    }
    const L = latest.current;
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 0;
    s.last = now;
    const held = !L.disabled && (hover.current || L.latched);
    s.clock += dt * L.spd;
    const target = L.isReady
      ? 1
      : L.progress !== undefined
        ? clamp01(L.progress) * HOLD
        : HOLD;
    let moving = false;
    if (!held && s.clock > BURN_AT && s.burn < target) {
      // A host that says ready early gets the rest burned through quickly.
      const rate = L.isReady && L.controlled ? 3 : 1;
      s.burn = Math.min(target, s.burn + (dt * L.spd * rate) / BURN);
      moving = true;
    }
    if (!held && s.clock > BURN_AT * 0.6) {
      s.leakT = Math.min(1, s.leakT + (dt * L.spd) / (BURN + 1.6));
    }
    if (!L.controlled && !s.ownReady && s.burn >= HOLD - 1e-4) {
      s.ownReady = true;
      setOwnReady(true);
    }

    const level = -BAND + s.burn * (1 + 2 * BAND);
    if (L.motionSafe) {
      const wave = flicker(s.clock * 9, seed) - 0.5;
      const surge =
        Math.max(0, flicker(s.clock * 1.7, seed ^ 0x9e37) - 0.72) * 0.08;
      const glow = flicker(s.clock * 13, seed ^ 0x5bd1);
      drawFilm(
        level + (s.burn > 0 && s.burn < 1 ? wave * 0.024 + surge : 0),
        glow,
      );
      holeLight.set(
        r3(
          smooth(0, 0.5, s.clock) *
            (0.55 + 0.45 * flicker(s.clock * 17, seed ^ 0x1234)),
        ),
      );
      leakIn.set(r3(smooth(0.25, 1.1, s.clock) * 0.85));
      leakX.set(r2(fromLeft ? -60 + 145 * s.leakT : 85 - 145 * s.leakT));
      if (L.grit > 0 && s.frames % 2 === 0) drawGrain(s.frames >> 1);
    } else {
      // Still steps: the front moves only when the load has moved a sixth.
      const step = Math.min(6, Math.floor(s.burn * 6 + 1e-6));
      if (step !== shownStep.current || s.frames === 0) {
        shownStep.current = step;
        drawFilm(-BAND + (step / 6) * (1 + 2 * BAND), 0.5);
        if (s.frames === 0) drawGrain(0);
      }
      holeLight.set(0.7);
      leakIn.set(0.6);
      leakX.set(fromLeft ? -32 : 57);
    }
    lit.set(r3(smooth(0, 0.12, s.burn)));
    grainOn.set(r3(L.grit * 0.9));
    s.frames += 1;

    if (s.burn >= 1 && L.isReady) {
      drawFilm(2, 0);
      startClear();
      return;
    }
    // Under reduced motion nothing lives on its own: the loop runs only
    // while the burn is moving.
    if (L.motionSafe || moving || s.clock <= BURN_AT) {
      frame.current = window.requestAnimationFrame(tick);
    } else {
      s.last = 0;
    }
  };

  const kick = () => {
    if (frame.current || state.current.clearing || !field.current) return;
    if (!visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const root = rootRef.current;
    if (!root) return;
    const w = Math.round(root.clientWidth);
    const h = Math.round(root.clientHeight);
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (
      field.current &&
      w === box.current.w &&
      h === box.current.h &&
      dpr === box.current.dpr
    ) {
      return;
    }
    box.current = { w, h, dpr };
    field.current = buildField(w, h, seed);
    image.current = null;
    const s = state.current;
    if (!s.clearing) {
      const level = -BAND + s.burn * (1 + 2 * BAND);
      drawFilm(level, 0.5);
      drawGrain(s.frames);
    }
    kick();
  };

  const readyChanged = (now: boolean) => {
    const s = state.current;
    if (now) {
      kick();
      return;
    }
    if (!s.clearing || !latest.current.controlled) return;
    // Sent back to loading: fresh film.
    clearAnim.current?.stop();
    Object.assign(s, {
      clock: 0,
      last: 0,
      burn: 0,
      leakT: 0,
      ownReady: false,
      clearing: false,
      frames: 0,
    });
    clearT.set(0);
    shift.set(0);
    lit.set(0);
    holeLight.set(0);
    leakIn.set(0);
    leakX.set(fromLeft ? -60 : 85);
    shownStep.current = -1;
    setClearing(false);
    setDone(false);
    setOwnReady(false);
    drawFilm(-1, 0);
    kick();
  };

  // Set at the first render too: the size observer can report before any
  // effect has run, and that first size must not be lost.
  const api = React.useRef<Api>({ kick, readyChanged, resize });
  React.useEffect(() => {
    api.current = { kick, readyChanged, resize };
  });

  const shownReady = React.useRef(isReady);
  React.useEffect(() => {
    if (shownReady.current === isReady) return;
    shownReady.current = isReady;
    api.current.readyChanged(isReady);
  }, [isReady]);

  React.useEffect(() => {
    api.current.kick();
  }, [progress, latched, motionSafe, loaded]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    const clearing = clearAnim;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      clearing.current?.stop();
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

  const bindImage = React.useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && src) {
        const loadedNow = src;
        queueMicrotask(() => setLoadedSrc(loadedNow));
      }
    },
    [src],
  );

  const toggle = (clientX: number | null) => {
    if (disabled || clearing) return;
    const next = !latched;
    const rect = rootRef.current?.getBoundingClientRect();
    const pan =
      clientX !== null
        ? panFrom(clientX, rootRef.current)
        : rect
          ? panFrom(rect.left + rect.width / 2, rootRef.current)
          : 0;
    audio.play(
      "whoosh",
      next ? { pitch: 0.6, gain: 0.26, pan } : { pitch: 1.12, gain: 0.48, pan },
    );
    setLatched(next);
  };

  const strip =
    "pointer-events-none absolute inset-x-0 h-[var(--strip)] w-full";

  return (
    <div
      ref={bindRoot}
      aria-busy={!done}
      className={cn(
        "group/film-burn relative isolate aspect-[21/9] w-full overflow-clip rounded-3 [--strip:clamp(7px,6%,12px)]",
        className,
      )}
      style={{ backgroundColor: FILM }}
    >
      <motion.div
        ref={pictureRef}
        role={src === undefined ? "img" : undefined}
        aria-label={src === undefined ? alt : undefined}
        tabIndex={-1}
        className="absolute inset-0 outline-none [&>img]:size-full [&>svg]:block [&>svg]:size-full"
        style={{ filter }}
      >
        {src !== undefined ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={bindImage}
            src={src}
            alt={alt}
            draggable={false}
            onLoad={() => setLoadedSrc(src)}
            onError={() => setLoadedSrc(src)}
            className="size-full object-cover"
          />
        ) : (
          children
        )}
      </motion.div>

      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", done && "hidden")}
      >
        <motion.div
          className="absolute inset-0 mix-blend-screen"
          style={{
            opacity: bloomOpacity,
            background: `radial-gradient(ellipse at 50% 50%, transparent 35%, ${BLOOM} 120%)`,
          }}
        />
        <div
          className="absolute inset-0 group-data-painted/film-burn:hidden"
          style={{ backgroundColor: FILM }}
        />
        <canvas ref={filmRef} className="absolute inset-0 size-full" />
        <motion.div
          className="absolute -top-2/5 h-[180%] w-3/4 mix-blend-screen"
          style={{
            left: leakLeft,
            opacity: leakOpacity,
            background: `radial-gradient(closest-side, color-mix(in oklab, ${leakColour} 88%, transparent), color-mix(in oklab, ${leakColour} 34%, transparent) 55%, transparent)`,
          }}
        />
        <motion.canvas
          ref={grainRef}
          className="absolute inset-0 size-full"
          style={{ opacity: grainOpacity }}
        />
        {(["top", "bottom"] as const).map((edge) => (
          <motion.svg
            key={edge}
            className={cn(strip, edge === "top" ? "top-0" : "bottom-0")}
            style={{
              opacity: stripOpacity,
              y: edge === "top" ? stripUp : stripDown,
            }}
          >
            <defs>
              {(["dark", "lit"] as const).map((kind) => (
                <pattern
                  key={kind}
                  id={`${patternId}-${edge}-${kind}`}
                  width="14"
                  height="100%"
                  patternUnits="userSpaceOnUse"
                >
                  <rect
                    x="3.5"
                    y="24%"
                    width="7"
                    height="52%"
                    rx="1.6"
                    style={{ fill: kind === "dark" ? HOLE : LIGHT }}
                  />
                </pattern>
              ))}
            </defs>
            <rect width="100%" height="100%" style={{ fill: FILM }} />
            <rect
              width="100%"
              height="100%"
              fill={`url(#${patternId}-${edge}-dark)`}
            />
            <motion.rect
              width="100%"
              height="100%"
              fill={`url(#${patternId}-${edge}-lit)`}
              style={{ opacity: holeOpacity }}
            />
          </motion.svg>
        ))}
      </div>

      {done ? null : (
        <button
          ref={buttonRef}
          type="button"
          aria-pressed={latched}
          aria-label="Hold the burn"
          aria-describedby={hintId}
          disabled={disabled || clearing}
          onPointerEnter={(event) => {
            if (event.pointerType !== "mouse") return;
            hover.current = true;
          }}
          onPointerLeave={() => {
            hover.current = false;
            api.current.kick();
          }}
          onClick={(event) => toggle(event.detail === 0 ? null : event.clientX)}
          className={cn(
            "absolute inset-0 size-full rounded-[inherit] outline-none select-none",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "enabled:cursor-pointer disabled:cursor-default",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "absolute top-[calc(var(--strip)+6px)] right-2 flex size-6 items-center justify-center gap-[3px] rounded-full bg-black/45 transition-opacity duration-150",
              latched ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="h-2.5 w-[3px] rounded-full bg-white/90" />
            <span className="h-2.5 w-[3px] rounded-full bg-white/90" />
          </span>
        </button>
      )}

      <p id={hintId} className="sr-only">
        Hover to hold the burn where it is, or press to hold it until you press
        again.
      </p>
    </div>
  );
}
