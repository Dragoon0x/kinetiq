"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type EyedropperFormat = "hex" | "rgb" | "hsl";

export type EyedropperProps = {
  /** The shelf of picked colours, newest first, as `#rrggbb` (controlled). */
  value?: string[];
  /** The shelf when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the pick that changed the shelf, with the new shelf. */
  onValueChange?: (colors: string[]) => void;
  /** How many colours the shelf keeps; the oldest drops off. @default 6 */
  max?: number;
  /** The picture's accessible name. @default "Picture" */
  label?: string;
  /** How many times larger a pixel is in the loupe, 4 to 16. @default 8 */
  zoom?: number;
  /** Lines between the magnified pixels. @default true */
  grid?: boolean;
  /** The loupe's side, in px, 80 to 160. @default 112 */
  loupe?: number;
  /** How a colour is written: on the tag, the shelf, copies and announcements. @default "hex" */
  format?: EyedropperFormat;
  /** Play the pip of each new pixel and the drop of each pick. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type RGB = readonly [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const byte = (v: number) => clamp(Math.round(v), 0, 255);
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** A 32-bit hash of a pixel, for grain. Unsigned shifts throughout. */
const hash = (i: number, j: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
};

// "Coldbrook at dusk" — fixed art, the picture's own colours, the same in
// light and dark. Channels in sRGB.
const SKY: readonly (readonly [number, RGB])[] = [
  [0, [30, 34, 86]],
  [0.2, [62, 52, 124]],
  [0.36, [138, 80, 142]],
  [0.48, [222, 116, 118]],
  [0.58, [250, 170, 110]],
  [0.72, [252, 204, 140]],
];
const SUN: RGB = [255, 232, 176];
const GLOW: RGB = [255, 196, 128];
const FAR: readonly [RGB, RGB] = [
  [176, 104, 136],
  [138, 86, 128],
];
const MID: readonly [RGB, RGB] = [
  [96, 64, 118],
  [70, 50, 100],
];
const NEAR: readonly [RGB, RGB] = [
  [42, 54, 78],
  [22, 32, 50],
];
const DEEP: RGB = [16, 24, 48];
const SUN_U = 0.7;
const SUN_V = 0.5;
const SUN_R = 0.07;
const WATER = 0.78;

const ridgeFar = (u: number) =>
  0.565 + 0.03 * Math.sin(u * 6.3 + 0.8) + 0.012 * Math.sin(u * 19.7 + 2.1);
const ridgeMid = (u: number) =>
  0.625 + 0.04 * Math.sin(u * 4.2 + 2.4) + 0.014 * Math.sin(u * 13.1 + 0.6);
const ridgeNear = (u: number) =>
  0.655 + 0.12 * smooth(0.3, 0.8, u) + 0.016 * Math.sin(u * 9.4 + 1.7);

function sky(v: number): RGB {
  let prev = SKY[0];
  for (const stop of SKY) {
    if (!prev) break;
    if (v <= stop[0]) {
      const span = stop[0] - prev[0];
      return mix(prev[1], stop[1], span > 0 ? (v - prev[0]) / span : 0);
    }
    prev = stop;
  }
  return prev ? prev[1] : [0, 0, 0];
}

type Scene = {
  width: number;
  height: number;
  at: (i: number, j: number) => RGB;
};

/**
 * The picture as a function of pixel: per-column ridge lines are worked out
 * once for a size, and every pixel — the drawn one and the sampled one — comes
 * from the same `at`, so the loupe and the readout can never disagree.
 */
function createScene(width: number, height: number): Scene {
  const aspect = width / height;
  const far = new Float64Array(width);
  const mid = new Float64Array(width);
  const near = new Float64Array(width);
  for (let i = 0; i < width; i += 1) {
    const u = (i + 0.5) / width;
    far[i] = ridgeFar(u);
    mid[i] = ridgeMid(u);
    near[i] = ridgeNear(u);
  }
  const ridges = [
    [far, FAR, 0.06],
    [mid, MID, 0.08],
    [near, NEAR, 0.1],
  ] as const;
  const land = (i: number, u: number, v: number): RGB => {
    const d = Math.hypot((u - SUN_U) * aspect, v - SUN_V);
    let c = mix(sky(v), GLOW, Math.exp(-d * 7) * 0.45);
    // One pixel of anti-aliasing on the sun's rim and on every ridge line,
    // so the picture reads smooth and the loupe finds real blended edges.
    const disc = clamp01((SUN_R - d) * height + 0.5);
    if (disc > 0) c = mix(c, SUN, disc);
    // Back to front: each ridge over whatever is behind it.
    for (const [line, [top, low], depth] of ridges) {
      const edge = line[i] ?? 1;
      const cover = clamp01((v - edge) * height + 0.5);
      if (cover > 0) {
        c = mix(c, mix(top, low, clamp01((v - edge) / depth)), cover);
      }
    }
    return c;
  };
  const at = (i: number, j: number): RGB => {
    const u = (i + 0.5) / width;
    const v = (j + 0.5) / height;
    let c: RGB;
    if (v < WATER) {
      c = land(i, u, v);
    } else {
      const k = (v - WATER) / (1 - WATER);
      c = mix(land(i, u, WATER - (v - WATER) * 1.5), DEEP, 0.3 + 0.45 * k);
      const ripple = Math.sin(j * 1.9 + Math.sin(i * 0.05 + j * 0.37) * 1.4);
      const lift = 1 + 0.09 * ripple;
      c = [c[0] * lift, c[1] * lift, c[2] * lift];
      const lane = Math.abs(u - SUN_U) * aspect;
      const wide = 0.025 + k * 0.07;
      if (lane < wide && ripple > 0.45)
        c = mix(c, SUN, 0.55 * (1 - lane / wide));
    }
    const grain = (hash(i, j) & 7) - 3.5;
    return [byte(c[0] + grain), byte(c[1] + grain), byte(c[2] + grain)];
  };
  return { width, height, at };
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const toHex = (c: RGB) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`;
const fromHex = (hex: string): RGB | null => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return [
    parseInt(m[1] ?? "0", 16),
    parseInt(m[2] ?? "0", 16),
    parseInt(m[3] ?? "0", 16),
  ];
};

/** Hue in degrees, saturation and lightness in percent, all whole numbers. */
function toHsl(c: RGB): [number, number, number] {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const l = (hi + lo) / 2;
  const d = hi - lo;
  if (d === 0) return [0, 0, Math.round(l * 100)];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h =
    hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [Math.round(h) % 360, Math.round(s * 100), Math.round(l * 100)];
}

function formatColor(c: RGB, format: EyedropperFormat): string {
  if (format === "rgb") return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  if (format === "hsl") {
    const [h, s, l] = toHsl(c);
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  return toHex(c).toUpperCase();
}

/**
 * Writes a `#rrggbb` colour the way the eyedropper does — `#D98A52`,
 * `rgb(217, 138, 82)` or `hsl(25, 64%, 59%)` — for hosts that show the shelf.
 */
export function formatSwatch(
  hex: string,
  format: EyedropperFormat = "hex",
): string {
  const c = fromHex(hex);
  return c ? formatColor(c, format) : hex;
}

const HUES: readonly [number, string][] = [
  [15, "red"],
  [40, "orange"],
  [55, "amber"],
  [70, "yellow"],
  [95, "lime"],
  [150, "green"],
  [180, "teal"],
  [200, "cyan"],
  [235, "blue"],
  [260, "indigo"],
  [285, "violet"],
  [320, "purple"],
  [345, "pink"],
  [360, "red"],
];

/** A spoken name for a colour, so a screen reader hears more than digits. */
function describe(c: RGB): string {
  const [h, s, l] = toHsl(c);
  if (l < 8) return "near black";
  if (l > 94) return "near white";
  if (s < 12) return l < 35 ? "dark grey" : l > 70 ? "light grey" : "grey";
  const hue = HUES.find(([edge]) => h < edge)?.[1] ?? "red";
  const shade = l < 30 ? "deep " : l > 72 ? "pale " : s < 35 ? "muted " : "";
  return `${shade}${hue}`;
}

const userActivated = (): boolean =>
  typeof navigator !== "undefined" &&
  (navigator.userActivation?.hasBeenActive ?? true);

/** Height of the value tag, px. */
const TAG = 24;
/** Side of a shelf slot, px. */
const SLOT = 32;
/** Room kept for the loupe's frame ring inside the component's box, px. */
const RING = 2;

function Check({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/**
 * A drop of the picked colour, falling from the loupe to the shelf: across on
 * the symmetric move curve, down on the exit curve (it accelerates, as a
 * falling thing does), both ending together, so it lands in the slot.
 */
function Droplet({
  from,
  to,
  color,
  onLand,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  onLand: () => void;
}) {
  const x = useMotionValue(from.x);
  const y = useMotionValue(from.y);
  const landed = React.useRef(onLand);
  React.useEffect(() => {
    landed.current = onLand;
  });
  React.useEffect(() => {
    const distance = Math.hypot(to.x - x.get(), to.y - y.get());
    const duration = 0.3 + distance * 0.0006;
    const across = animate(x, to.x, { duration, ease: easings.move });
    const down = animate(y, to.y, {
      duration,
      ease: easings.exit,
      onComplete: () => landed.current(),
    });
    return () => {
      across.stop();
      down.stop();
    };
  }, [to.x, to.y, x, y]);
  const left = useTransform(x, (v) => r2(v - 7));
  const top = useTransform(y, (v) => r2(v - 7));
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 size-3.5 rounded-full ring-2 ring-card"
      style={{ x: left, y: top, backgroundColor: color }}
    />
  );
}

/**
 * An eyedropper over a picture drawn in code. Point anywhere and a loupe shows
 * the pixels under the pointer as a magnified grid, the one being read framed
 * at its centre and its value on a tag pinned to the loupe; click and the
 * colour drops out of the loupe onto a shelf of swatches.
 *
 * The picture is painted once per size, one image pixel per CSS pixel, and
 * scaled onto the canvas with smoothing off — pixels as a screen shows them.
 * Nothing themed is ever painted on a canvas (the picture's colours are its
 * own), so a theme flip needs no redraw; nothing is drawn while the picture is
 * off screen or the page is hidden, and no loop runs. The loupe follows the
 * pointer 1:1; arrow keys move it one pixel (Shift, ten) and Enter picks; on
 * touch, a tap places it, dragging it moves it, and a tap on it picks. Under
 * reduced motion the drop does not fly: the swatch fades into its slot.
 */
export function Eyedropper({
  value,
  defaultValue = [],
  onValueChange,
  max = 6,
  label = "Picture",
  zoom = 8,
  grid = true,
  loupe = 112,
  format = "hex",
  sound = false,
  disabled = false,
  className,
}: EyedropperProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const readingId = React.useId();

  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const shelf = value ?? own;
  const cap = Math.max(1, Math.round(max));
  const size = Math.round(clamp(loupe, 48, 240));
  const cell = Math.max(2, Math.round(zoom));

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = React.useState<HTMLButtonElement | null>(null);
  const [tag, setTag] = React.useState<HTMLDivElement | null>(null);
  const [ready, setReady] = React.useState(false);

  const [drops, setDrops] = React.useState<
    {
      n: number;
      hex: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
    }[]
  >([]);
  const [landed, setLanded] = React.useState<{ hex: string; n: number } | null>(
    null,
  );
  const [copied, setCopied] = React.useState<string | null>(null);
  const [spoken, setSpoken] = React.useState("");
  const [asked, setAsked] = React.useState<string | null>(null);
  const [seen, setSeen] = React.useState((shelf[0] ?? "").toLowerCase());

  const shelfRef = React.useRef<HTMLOListElement | null>(null);
  // The two canvases are drawn on imperatively, so they live in refs.
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const lensRef = React.useRef<HTMLCanvasElement | null>(null);
  const scene = React.useRef<Scene | null>(null);
  const buffer = React.useRef<Uint8ClampedArray<ArrayBuffer> | null>(null);
  const offscreen = React.useRef<HTMLCanvasElement | null>(null);
  const dirty = React.useRef({ picture: true, lens: true });
  const visible = React.useRef(false);
  const frameId = React.useRef(0);
  const origin = React.useRef({ x: 0, y: 0 });
  const sample = React.useRef<{ i: number; j: number } | null>(null);
  const point = React.useRef({ x: 0, y: 0 });
  const lastPip = React.useRef<{ t: number; c: RGB }>({
    t: -Infinity,
    c: [0, 0, 0],
  });
  const lastPointer = React.useRef("mouse");
  const speakTimer = React.useRef<number | null>(null);
  const dropCount = React.useRef(0);
  const latest = React.useRef({ format, size, cell, grid, audio, motionSafe });
  React.useEffect(() => {
    latest.current = { format, size, cell, grid, audio, motionSafe };
  });

  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const rootW = useMotionValue(0);
  const rootH = useMotionValue(0);
  const tagW = useMotionValue(0);
  const readout = useMotionValue("");
  const swatch = useMotionValue("transparent");

  // The value moved: a pick the host took gets its sentence now, frozen
  // from the new shelf.
  const head = (shelf[0] ?? "").toLowerCase();
  if (head !== seen) {
    setSeen(head);
    if (asked && asked === head) {
      const rgb = fromHex(head);
      if (rgb) {
        setSpoken(
          `Picked ${describe(rgb)}, ${formatColor(rgb, format)}. ${shelf.length} on the shelf.`,
        );
      }
      setAsked(null);
    }
  }

  /** Draws whatever is out of date, if anyone can see it. */
  const flush = React.useCallback(() => {
    if (!visible.current || document.visibilityState === "hidden") return;
    const s = scene.current;
    if (!s || s.width < 1 || s.height < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = canvasRef.current;
    const lens = lensRef.current;
    if (dirty.current.picture && canvas) {
      dirty.current.picture = false;
      const data = new Uint8ClampedArray(s.width * s.height * 4);
      for (let j = 0; j < s.height; j += 1) {
        for (let i = 0; i < s.width; i += 1) {
          const c = s.at(i, j);
          const o = (j * s.width + i) * 4;
          data[o] = c[0];
          data[o + 1] = c[1];
          data[o + 2] = c[2];
          data[o + 3] = 255;
        }
      }
      buffer.current = data;
      const off = offscreen.current ?? document.createElement("canvas");
      offscreen.current = off;
      off.width = s.width;
      off.height = s.height;
      off
        .getContext("2d")
        ?.putImageData(new ImageData(data, s.width, s.height), 0, 0);
      canvas.width = Math.round(s.width * dpr);
      canvas.height = Math.round(s.height * dpr);
      canvas.style.width = `${s.width}px`;
      canvas.style.height = `${s.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      }
      dirty.current.lens = true;
    }
    const at = sample.current;
    const data = buffer.current;
    if (dirty.current.lens && lens && at && data) {
      dirty.current.lens = false;
      const { size: side, cell: z } = latest.current;
      const px = Math.round(side * dpr);
      if (lens.width !== px) lens.width = px;
      if (lens.height !== px) lens.height = px;
      const ctx = lens.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, side, side);
        const c0 = Math.floor(side / 2 - z / 2);
        const reach = Math.ceil(c0 / z);
        for (let dj = -reach; dj <= reach; dj += 1) {
          const j = at.j + dj;
          if (j < 0 || j >= s.height) continue;
          for (let di = -reach; di <= reach; di += 1) {
            const i = at.i + di;
            if (i < 0 || i >= s.width) continue;
            const o = (j * s.width + i) * 4;
            ctx.fillStyle = `rgb(${data[o] ?? 0} ${data[o + 1] ?? 0} ${data[o + 2] ?? 0})`;
            ctx.fillRect(c0 + di * z, c0 + dj * z, z, z);
          }
        }
      }
    }
  }, []);

  const schedule = React.useCallback(() => {
    if (frameId.current) return;
    frameId.current = window.requestAnimationFrame(() => {
      frameId.current = 0;
      flush();
    });
  }, [flush]);

  /** Writes the tag, the swatch and the reading for the pixel under the loupe. */
  const refresh = React.useCallback(() => {
    const s = scene.current;
    const at = sample.current;
    if (!s || !at) return null;
    const c = s.at(at.i, at.j);
    readout.set(formatColor(c, latest.current.format));
    swatch.set(`rgb(${c[0]} ${c[1]} ${c[2]})`);
    return c;
  }, [readout, swatch]);

  /**
   * Puts the loupe over a point of the picture (its own pixels). The loupe's
   * centre goes exactly there, held inside the component's box; the sample is
   * the pixel the point falls in.
   */
  const moveTo = React.useCallback(
    (x: number, y: number, source: "pointer" | "key" | "park") => {
      const s = scene.current;
      if (!s) return;
      const px = clamp(x, 0, s.width - 0.01);
      const py = clamp(y, 0, s.height - 0.01);
      point.current = { x: px, y: py };
      const half = latest.current.size / 2 + RING;
      const w = rootW.get();
      const h = rootH.get();
      const lx = origin.current.x + px;
      const ly = origin.current.y + py;
      cx.set(r2(w > half * 2 ? clamp(lx, half, w - half) : w / 2));
      cy.set(r2(h > half * 2 ? clamp(ly, half, h - half) : h / 2));
      const i = Math.floor(px);
      const j = Math.floor(py);
      const prev = sample.current;
      if (prev && prev.i === i && prev.j === j && source !== "park") return;
      sample.current = { i, j };
      dirty.current.lens = true;
      schedule();
      const c = refresh();
      if (!c || source === "park") return;
      // The pip: pitch by lightness, pan by place. A pointer sweep only pips
      // when the colour really moves, and at most every 60ms; keys always do.
      const now = performance.now();
      const last = lastPip.current;
      const moved =
        Math.abs(c[0] - last.c[0]) +
        Math.abs(c[1] - last.c[1]) +
        Math.abs(c[2] - last.c[2]);
      // Grain alone moves a pixel by up to 21 levels; only a real change pips.
      if (source === "pointer" && (now - last.t < 60 || moved < 24)) return;
      if (source === "pointer" && !userActivated()) return;
      lastPip.current = { t: now, c };
      const rect = root?.getBoundingClientRect();
      const scale =
        root && root.offsetWidth ? (rect?.width ?? 0) / root.offsetWidth : 1;
      latest.current.audio.play("tick", {
        gain: 0.26,
        pitch: 0.6 + (toHsl(c)[2] / 100) * 0.9,
        pan: rect ? panFrom(rect.left + cx.get() * scale, null) : 0,
      });
    },
    [cx, cy, refresh, root, rootH, rootW, schedule],
  );

  // Measure the component and the picture whenever either changes size. The
  // picture is re-made at its new size (drawn when visible), and the loupe
  // keeps its place in proportion.
  React.useEffect(() => {
    if (!root || !frame) return;
    const measure = () => {
      const box = frame.getBoundingClientRect();
      const scale = frame.offsetWidth > 0 ? box.width / frame.offsetWidth : 1;
      if (!scale) return;
      rootW.set(root.clientWidth);
      rootH.set(root.clientHeight);
      const r = root.getBoundingClientRect();
      origin.current = {
        x: r2((box.left - r.left) / scale + frame.clientLeft),
        y: r2((box.top - r.top) / scale + frame.clientTop),
      };
      const width = Math.floor(frame.clientWidth);
      const height = Math.floor(frame.clientHeight);
      if (width < 1 || height < 1) return;
      const prev = scene.current;
      if (!prev || prev.width !== width || prev.height !== height) {
        scene.current = createScene(width, height);
        dirty.current.picture = true;
        if (prev && sample.current) {
          moveTo(
            (point.current.x / prev.width) * width,
            (point.current.y / prev.height) * height,
            "park",
          );
        } else {
          // First light: park on the far ridge line, where sky meets hill.
          const u = 0.22;
          const top = Math.min(ridgeFar(u), ridgeMid(u));
          moveTo(u * width, Math.max(0, top * height - 1), "park");
        }
        setReady(true);
      } else {
        moveTo(point.current.x, point.current.y, "park");
      }
      schedule();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame, moveTo, root, rootH, rootW, schedule]);

  // Off screen, nothing is drawn; coming back, whatever changed is drawn once.
  React.useEffect(() => {
    if (!frame) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) schedule();
    });
    io.observe(frame);
    const onVisibility = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      visible.current = false;
    };
  }, [frame, schedule]);

  React.useEffect(
    () => () => {
      if (frameId.current) window.cancelAnimationFrame(frameId.current);
      frameId.current = 0;
      if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    },
    [],
  );

  // A canvas that has just arrived has nothing on it yet.
  const bindCanvas = React.useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasRef.current = node;
      if (!node) return;
      dirty.current.picture = true;
      schedule();
    },
    [schedule],
  );
  const bindLens = React.useCallback(
    (node: HTMLCanvasElement | null) => {
      lensRef.current = node;
      if (!node) return;
      dirty.current.lens = true;
      schedule();
    },
    [schedule],
  );

  // Zoom and size redraw the loupe and re-seat it; format rewrites the tag.
  React.useEffect(() => {
    dirty.current.lens = true;
    moveTo(point.current.x, point.current.y, "park");
  }, [cell, moveTo, size]);

  React.useEffect(() => {
    refresh();
  }, [format, refresh]);

  React.useEffect(() => {
    if (!tag) return;
    const observer = new ResizeObserver(() => tagW.set(tag.offsetWidth));
    observer.observe(tag);
    return () => observer.disconnect();
  }, [tag, tagW]);

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  const speakSoon = () => {
    if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    speakTimer.current = window.setTimeout(() => {
      speakTimer.current = null;
      const s = scene.current;
      const at = sample.current;
      if (!s || !at) return;
      const c = s.at(at.i, at.j);
      setSpoken(
        `${describe(c)}, ${formatColor(c, latest.current.format)}, at ${at.i}, ${at.j}.`,
      );
    }, 250);
  };

  /** Client coordinates to the picture's own pixels (scale divided out). */
  const local = (clientX: number, clientY: number) => {
    if (!frame) return null;
    const box = frame.getBoundingClientRect();
    const scale = frame.offsetWidth > 0 ? box.width / frame.offsetWidth : 1;
    if (!scale) return null;
    return {
      x: (clientX - box.left) / scale - frame.clientLeft,
      y: (clientY - box.top) / scale - frame.clientTop,
    };
  };

  const pick = () => {
    const s = scene.current;
    const at = sample.current;
    if (disabled || !s || !at) return;
    const c = s.at(at.i, at.j);
    const hex = toHex(c);
    const next = [hex, ...shelf.filter((h) => h.toLowerCase() !== hex)].slice(
      0,
      cap,
    );
    if (shelf[0]?.toLowerCase() === hex) {
      // Already at the front: the shelf does not change, so there is nothing
      // to report and nothing for the host to answer. Say so now, in words
      // that differ from the last pick's, so it is heard again.
      setSpoken(`Picked ${describe(c)}, ${formatColor(c, format)}, again.`);
    } else {
      setAsked(hex);
      if (value === undefined) setOwn(next);
      onValueChange?.(next);
    }
    const pitch = 0.7 + (toHsl(c)[2] / 100) * 0.8;
    if (!motionSafe || !root || !shelfRef.current) {
      setLanded({ hex, n: (dropCount.current += 1) });
      audio.play("plip", { gain: 0.55, pitch });
      return;
    }
    // The drop falls to the first slot, which the shelf opens for it now.
    const r = root.getBoundingClientRect();
    const scale = root.offsetWidth > 0 ? r.width / root.offsetWidth : 1;
    const o = shelfRef.current.getBoundingClientRect();
    const n = (dropCount.current += 1);
    setDrops((list) => [
      ...list,
      {
        n,
        hex,
        from: { x: cx.get(), y: cy.get() },
        to: {
          x: r2((o.left - r.left) / scale + SLOT / 2),
          y: r2((o.top - r.top) / scale + SLOT / 2),
        },
      },
    ]);
  };

  const land = (n: number, hex: string) => {
    setDrops((list) => list.filter((d) => d.n !== n));
    setLanded({ hex, n });
    const c = fromHex(hex);
    audio.play("plip", {
      gain: 0.55,
      pitch: c ? 0.7 + (toHsl(c)[2] / 100) * 0.8 : 1,
    });
  };

  const copy = (hex: string) => {
    const c = fromHex(hex);
    if (!c || typeof navigator === "undefined" || !navigator.clipboard) return;
    const text = formatColor(c, format);
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(hex);
        setSpoken(`Copied ${text}.`);
      },
      () => {},
    );
  };

  const dragFrom = React.useRef({ x: 0, y: 0 });
  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      // Touch moves the loupe by the finger's travel, so the finger never
      // has to sit on the pixel it is reading.
      dragFrom.current = { ...point.current };
    },
    onMove: ({ offset, event }) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") return;
      moveTo(
        dragFrom.current.x + offset.x,
        dragFrom.current.y + offset.y,
        "pointer",
      );
    },
    onEnd: ({ event }) => {
      if (event.pointerType === "mouse" || event.pointerType === "pen") pick();
    },
    onTap: () => pick(),
  });

  const loupeX = useTransform(cx, (v) => r2(v - size / 2));
  const loupeY = useTransform(cy, (v) => r2(v - size / 2));
  const tagX = useTransform(() => {
    const w = tagW.get();
    return r2(
      clamp(cx.get() - w / 2, RING, Math.max(RING, rootW.get() - w - RING)),
    );
  });
  // The tag straddles the loupe's bottom edge, or its top edge when there is
  // no room below.
  const tagY = useTransform(() => {
    const c = cy.get();
    const below = c + size / 2 - TAG / 2;
    if (below + TAG <= rootH.get()) return r2(below);
    return r2(Math.max(0, c - size / 2 - TAG / 2));
  });

  const c0 = Math.floor(size / 2 - cell / 2);
  const gridOffset = ((c0 % cell) + cell) % cell;
  const flying = new Set(drops.map((d) => d.hex));

  return (
    <div
      ref={setRoot}
      onPointerMove={(event) => {
        if (disabled || event.pointerType === "touch") return;
        const p = local(event.clientX, event.clientY);
        const s = scene.current;
        if (!p || !s) return;
        if (p.x < 0 || p.y < 0 || p.x >= s.width || p.y >= s.height) return;
        moveTo(p.x, p.y, "pointer");
      }}
      className={cn(
        "relative flex w-full flex-col gap-2 select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <button
        ref={setFrame}
        type="button"
        aria-label={label}
        aria-describedby={`${hintId} ${readingId}`}
        disabled={disabled}
        onPointerDown={(event) => {
          lastPointer.current = event.pointerType;
        }}
        onClick={(event) => {
          // Enter and Space arrive as clicks with no pointer behind them.
          if (event.detail === 0) {
            pick();
            return;
          }
          const p = local(event.clientX, event.clientY);
          if (!p) return;
          if (lastPointer.current !== "touch") {
            moveTo(p.x, p.y, "pointer");
            pick();
            return;
          }
          // Touch has no hover: a tap on the loupe picks what it reads, a tap
          // anywhere else sends the loupe there first. Measured, not hit-tested,
          // so it holds where the loupe lets touches through.
          const half = size / 2;
          const onLoupe =
            Math.abs(origin.current.x + p.x - cx.get()) <= half &&
            Math.abs(origin.current.y + p.y - cy.get()) <= half;
          if (onLoupe) pick();
          else moveTo(p.x, p.y, "pointer");
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const at = sample.current;
          if (!at) return;
          let di = 0;
          let dj = 0;
          if (event.key === "ArrowLeft") di = -step;
          else if (event.key === "ArrowRight") di = step;
          else if (event.key === "ArrowUp") dj = -step;
          else if (event.key === "ArrowDown") dj = step;
          else return;
          event.preventDefault();
          moveTo(at.i + di + 0.5, at.j + dj + 0.5, "key");
          speakSoon();
        }}
        className="relative block aspect-[2/1] w-full cursor-crosshair overflow-clip rounded-3 border border-hairline bg-surface-2 [contain:paint] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed"
      >
        <canvas
          ref={bindCanvas}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 block"
        />
      </button>
      <span id={hintId} className="sr-only">
        Arrow keys move the loupe one pixel, Shift moves ten. Enter picks the
        colour.
      </span>
      <motion.span id={readingId} className="sr-only">
        {readout}
      </motion.span>
      <p role="status" className="sr-only">
        {spoken}
      </p>

      <div className="flex h-8 items-center gap-2">
        <ol
          ref={shelfRef}
          aria-label="Picked colours"
          className="flex items-center gap-1.5"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {shelf.map((hex) => {
              const c = fromHex(hex);
              if (!c) return null;
              const key = hex.toLowerCase();
              const waiting = flying.has(key);
              const text = formatColor(c, format);
              return (
                <motion.li
                  key={key}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    scale: motionSafe ? 0.6 : 1,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          layout: springs.glide,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className="shrink-0"
                >
                  <button
                    type="button"
                    aria-label={`Copy ${text}`}
                    title={text}
                    disabled={waiting}
                    onClick={() => copy(key)}
                    className="relative flex size-8 items-center justify-center rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                  >
                    {waiting ? (
                      <span
                        aria-hidden
                        className="size-6 rounded-full border border-dashed border-hairline-strong"
                      />
                    ) : (
                      <motion.span
                        key={landed?.hex === key ? landed.n : 0}
                        aria-hidden
                        className="size-6 rounded-full ring-1 ring-hairline-strong ring-inset"
                        style={{
                          backgroundColor: `rgb(${c[0]} ${c[1]} ${c[2]})`,
                        }}
                        initial={
                          landed?.hex === key && motionSafe
                            ? { scale: 0.55 }
                            : false
                        }
                        animate={{ scale: 1 }}
                        transition={springs.recoil}
                      />
                    )}
                    {copied === key ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <span className="flex size-4 items-center justify-center rounded-full bg-background text-foreground">
                          <Check className="size-3" />
                        </span>
                      </span>
                    ) : null}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
        {shelf.length === 0 ? (
          <span className="text-xs text-ink-3">Picks land here</span>
        ) : null}
      </div>

      {ready ? (
        <>
          <motion.div
            aria-hidden
            {...drag}
            // A mouse clicks straight through to the picture's button; a
            // finger can take hold of the loupe and drag it.
            className="absolute top-0 left-0 cursor-crosshair touch-none overflow-clip rounded-3 bg-surface-2 shadow-[var(--shadow-raised)] ring-2 ring-card pointer-fine:pointer-events-none"
            style={{ width: size, height: size, x: loupeX, y: loupeY }}
          >
            <canvas
              ref={bindLens}
              className="pointer-events-none absolute inset-0 block size-full"
            />
            {grid ? (
              <span
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, var(--hairline-strong) 1px, transparent 1px), linear-gradient(to bottom, var(--hairline-strong) 1px, transparent 1px)",
                  backgroundSize: `${cell}px ${cell}px`,
                  backgroundPosition: `${gridOffset}px ${gridOffset}px`,
                }}
              />
            ) : null}
            <span
              className="pointer-events-none absolute rounded-[2px] border border-background ring-1 ring-foreground"
              style={{
                left: c0 - 1,
                top: c0 - 1,
                width: cell + 2,
                height: cell + 2,
              }}
            />
            <span className="pointer-events-none absolute inset-0 rounded-3 border border-hairline-strong" />
          </motion.div>
          <motion.div
            ref={setTag}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 flex h-6 items-center gap-1.5 rounded-full border border-hairline-strong bg-popover pr-2.5 pl-1.5 font-mono text-[11px] whitespace-nowrap text-foreground tabular-nums"
            style={{ x: tagX, y: tagY }}
          >
            <motion.span
              className="size-3 shrink-0 rounded-full ring-1 ring-hairline-strong ring-inset"
              style={{ backgroundColor: swatch }}
            />
            <motion.span>{readout}</motion.span>
          </motion.div>
        </>
      ) : null}

      {drops.map((d) => {
        const c = fromHex(d.hex);
        return (
          <Droplet
            key={d.n}
            from={d.from}
            to={d.to}
            color={c ? `rgb(${c[0]} ${c[1]} ${c[2]})` : "transparent"}
            onLand={() => land(d.n, d.hex)}
          />
        );
      })}
    </div>
  );
}
