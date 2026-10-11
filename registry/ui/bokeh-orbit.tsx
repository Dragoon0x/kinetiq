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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BokehOrbitItem = {
  /** An image URL. Without one, a picture is drawn in code. */
  src?: string;
  /** What the picture shows. */
  alt: string;
  /** A short title. */
  caption?: string;
};

export type BokehOrbitProps = {
  /** The pictures on the orbit (up to 16). @default nine drawn pictures */
  items?: BokehOrbitItem[];
  /** How wide the lens is open, 0 to 1: wide open, only the focal plane is sharp. @default 0.6 */
  aperture?: number;
  /** The orbit's size in the box, 0.4 to 1. @default 0.85 */
  radius?: number;
  /** The idle turn, degrees per second; negative turns the other way. @default 6 */
  spin?: number;
  /** The focal plane (controlled), 0 (far) to 1 (near). */
  focus?: number;
  /** The focal plane to begin with. @default 0.5 */
  defaultFocus?: number;
  /** Fires as the pointer, the scale or a key racks the focus. */
  onFocusChange?: (focus: number) => void;
  /** Rack the focus to the pointer's height over the stage. @default true */
  followPointer?: boolean;
  /** How far the orbit tips toward you, degrees: more tilt, more height between near and far. @default 22 */
  tilt?: number;
  /** Strength of the bokeh discs out-of-focus highlights bloom into, 0 to 1. @default 0.7 */
  highlights?: number;
  /** How far a click opens the orbit, 1 to 2 times its radius. @default 1.4 */
  bloom?: number;
  /** A picture's width at the front of the orbit, px. @default fitted to the box */
  pictureSize?: number;
  /** Show the focus distance scale at the left edge. @default true */
  scale?: boolean;
  /** Hold the idle turn. @default false */
  paused?: boolean;
  /** The orbit's accessible name. @default "Orbit of pictures" */
  label?: string;
  /** No racking or spinning by hand. @default false */
  disabled?: boolean;
  /** Sizes the piece; it fills its parent by default (h-full w-full). */
  className?: string;
};

export const defaultBokehOrbitItems: BokehOrbitItem[] = [
  { alt: "A low sun rising over a still harbour", caption: "Harbour at dawn" },
  { alt: "A ferry light on a dark sea under the moon", caption: "Night ferry" },
  { alt: "Warm dunes under a high sun", caption: "Dune sea" },
  { alt: "Green ridges fading into haze", caption: "North ridge" },
  { alt: "Stars over a calm black bay", caption: "Bay at night" },
  { alt: "A pale salt flat under a wide sky", caption: "Salt flats" },
  { alt: "Wet sand and shallow water at low tide", caption: "Low tide" },
  { alt: "Lamps along a quay after dark", caption: "Quay lamps" },
  { alt: "Dark wooded hills around a hollow", caption: "Pine hollow" },
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A pigment from a token's hue at a fixed lightness: the same in both themes. */
const tone = (token: string, l: number, c: number, turn = 0, alpha = 1) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn})${alpha < 1 ? ` / ${alpha}` : ""})`;

/** A light in a picture, in percent of its box: where a bokeh disc blooms. */
type Light = { x: number; y: number; k: number };

const KINDS = [
  "sea",
  "night",
  "dunes",
  "hills",
  "bay",
  "flats",
  "tide",
  "quay",
  "pines",
] as const;

/** A picture in gradients, with the lights in it that turn into bokeh. */
function orbitArt(i: number): { css: string; lights: Light[] } {
  const kind = KINDS[i % KINDS.length] ?? "sea";
  const r = (k: number) => hash(i + 17, 23, k);
  const sx = Math.round(24 + r(1) * 52);
  const sy = Math.round(22 + r(2) * 16);
  const tw = Math.round((r(3) - 0.5) * 24);
  const vignette =
    "radial-gradient(130% 100% at 50% 42%, transparent 58%, color-mix(in oklab, black 24%, transparent) 100%)";
  const sun = (x: number, y: number) =>
    `radial-gradient(circle at ${x}% ${y}%, ${tone("--warn", 0.98, 0.04)} 0 4%, ${tone("--warn", 0.9, 0.09, 0, 0.5)} 5%, transparent 18%)`;
  const dot = (x: number, y: number, l = 0.95) =>
    `radial-gradient(circle at ${x}% ${y}%, ${tone("--warn", l, 0.1)} 0 1%, ${tone("--warn", 0.8, 0.12, 0, 0.5)} 1.6%, transparent 4%)`;
  switch (kind) {
    case "sea":
      return {
        css: [
          vignette,
          `radial-gradient(3% 16% at ${sx}% 76%, ${tone("--warn", 0.93, 0.07, 0, 0.8)}, transparent)`,
          sun(sx, sy + 18),
          `linear-gradient(to bottom, transparent 60%, ${tone("--accent", 0.46, 0.07, tw)} 60%, ${tone("--accent", 0.26, 0.05, tw)} 100%)`,
          `linear-gradient(to bottom, ${tone("--accent", 0.6, 0.08, tw - 30)}, ${tone("--warn", 0.86, 0.08, -10)} 58%, ${tone("--warn", 0.93, 0.06)} 60%)`,
        ].join(", "),
        lights: [
          { x: sx, y: sy + 18, k: 1 },
          { x: sx, y: 72, k: 0.6 },
          { x: sx + 6, y: 84, k: 0.45 },
        ],
      };
    case "night":
    case "bay": {
      const lx = kind === "night" ? sx : 100 - sx;
      const stars = [0, 1, 2].map((k) => ({
        x: Math.round(10 + r(10 + k) * 80),
        y: Math.round(8 + r(20 + k) * 34),
      }));
      return {
        css: [
          vignette,
          `radial-gradient(2% 14% at ${lx}% 78%, ${tone("--warn", 0.85, 0.12, 0, 0.8)}, transparent)`,
          dot(lx, 64),
          ...stars.map((s) => dot(s.x, s.y, 0.97)),
          `radial-gradient(circle at ${100 - lx}% ${sy}%, ${tone("--warn", 0.95, 0.03)} 0 5%, ${tone("--accent", 0.6, 0.05, 0, 0.35)} 6%, transparent 18%)`,
          `linear-gradient(to bottom, transparent 62%, ${tone("--accent", 0.22, 0.05, tw)} 62%, ${tone("--accent", 0.14, 0.04, tw)} 100%)`,
          `linear-gradient(to bottom, ${tone("--accent", 0.16, 0.05, tw)}, ${tone("--accent", 0.32, 0.08, tw)} 62%)`,
        ].join(", "),
        lights: [
          { x: lx, y: 64, k: 1 },
          { x: 100 - lx, y: sy, k: 0.8 },
          ...stars.map((s) => ({ x: s.x, y: s.y, k: 0.4 })),
        ],
      };
    }
    case "quay": {
      const lamps = [0, 1, 2, 3].map((k) => ({
        x: Math.round(14 + k * 22 + r(30 + k) * 6),
        y: Math.round(52 + r(40 + k) * 8),
      }));
      return {
        css: [
          vignette,
          ...lamps.map((l) => dot(l.x, l.y)),
          ...lamps.map(
            (l) =>
              `radial-gradient(1.6% 10% at ${l.x}% 80%, ${tone("--warn", 0.85, 0.12, 0, 0.6)}, transparent)`,
          ),
          `linear-gradient(to bottom, transparent 66%, ${tone("--accent", 0.2, 0.04, tw)} 66%, ${tone("--accent", 0.12, 0.03, tw)} 100%)`,
          `linear-gradient(to bottom, ${tone("--accent", 0.14, 0.04, tw)}, ${tone("--accent", 0.28, 0.06, tw + 20)} 66%)`,
        ].join(", "),
        lights: lamps.map((l, k) => ({ x: l.x, y: l.y, k: k % 2 ? 0.7 : 1 })),
      };
    }
    case "dunes":
      return {
        css: [
          vignette,
          `radial-gradient(70% 30% at 30% 100%, ${tone("--danger", 0.56, 0.1, tw + 30)} 0 98%, transparent 100%)`,
          `radial-gradient(90% 34% at 55% 86%, ${tone("--warn", 0.76, 0.1, tw)} 0 98%, transparent 100%)`,
          sun(sx, sy),
          `linear-gradient(to bottom, ${tone("--accent", 0.72, 0.06, tw)}, ${tone("--warn", 0.9, 0.05, tw)} 75%)`,
        ].join(", "),
        lights: [
          { x: sx, y: sy, k: 1 },
          { x: Math.round(20 + r(5) * 60), y: 78, k: 0.35 },
        ],
      };
    case "hills":
    case "pines":
      return {
        css: [
          vignette,
          `radial-gradient(80% 42% at 28% 100%, ${tone("--success", kind === "pines" ? 0.24 : 0.36, 0.07, tw)} 0 98%, transparent 100%)`,
          `radial-gradient(90% 40% at 60% 84%, ${tone("--success", kind === "pines" ? 0.38 : 0.6, 0.05, tw + 30)} 0 98%, transparent 100%)`,
          sun(sx, sy),
          `linear-gradient(to bottom, ${tone("--accent", 0.74, 0.07, tw)}, ${tone("--success", 0.9, 0.04, tw + 60)} 80%)`,
        ].join(", "),
        lights: [{ x: sx, y: sy, k: 1 }],
      };
    default:
      return {
        css: [
          vignette,
          `linear-gradient(to bottom, transparent 63%, ${tone("--accent", 0.42, 0.03, tw)} 63% 64%, transparent 64%)`,
          sun(sx, sy + 16),
          `linear-gradient(to bottom, transparent 64%, ${tone("--warn", 0.9, 0.03, tw)} 64%, ${tone("--warn", 0.78, 0.04, tw)} 100%)`,
          `linear-gradient(to bottom, ${tone("--accent", 0.76, 0.05, tw)}, ${tone("--accent", 0.94, 0.02, tw)} 64%)`,
        ].join(", "),
        lights: [
          { x: sx, y: sy + 16, k: 1 },
          { x: sx, y: 74, k: 0.4 },
        ],
      };
  }
}

/** Lights for a picture we cannot see into: a seeded few, high in the frame. */
const seededLights = (i: number): Light[] =>
  [0, 1, 2].map((k) => ({
    x: Math.round(18 + hash(i, 3, k) * 64),
    y: Math.round(18 + hash(i, 5, k) * 50),
    k: k === 0 ? 1 : 0.5,
  }));

/** Focus position (0 far, 1 near) to metres: 12 m down to 0.7 m on a log scale. */
const metres = (f: number) => 0.7 * Math.pow(12 / 0.7, 1 - clamp(f, 0, 1));
const distanceText = (f: number) => {
  if (f < 0.04) return "∞";
  const m = metres(f);
  return m >= 10 ? `${Math.round(m)} m` : `${m.toFixed(1)} m`;
};
/** The inverse, for the scale's marks. */
const focusAt = (m: number) => 1 - Math.log(m / 0.7) / Math.log(12 / 0.7);
const MARKS: [string, number][] = [
  ["∞", 0],
  ["5", focusAt(5)],
  ["3", focusAt(3)],
  ["2", focusAt(2)],
  ["1.5", focusAt(1.5)],
  ["1", focusAt(1)],
  ["0.7", 1],
];

type Geo = {
  w: number;
  h: number;
  pw: number;
  ph: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** The most the orbit may open, as a multiple of its rest radius. */
  open: number;
  /** The scale's top and bottom: the far and near ends of the orbit. */
  top: number;
  bottom: number;
};

const NEAR = 1.18;
const FAR = 0.6;
const SCALE_W = 34;

function geometryOf(
  w: number,
  h: number,
  radius: number,
  tilt: number,
  bloom: number,
  pictureSize: number | undefined,
  withScale: boolean,
): Geo {
  // On a narrow box the scale lies over the stage's left edge instead of
  // taking its width; wider boxes give it its own strip.
  const left = withScale && w >= 480 ? SCALE_W : 0;
  const pw = Math.round(
    clamp(pictureSize ?? Math.min((w - left) * 0.22, h * 0.26), 56, 150),
  );
  const ph = Math.round(pw * 0.75);
  const pad = 10;
  const availX = Math.max(0, (w - left) / 2 - (pw / 2) * NEAR - pad);
  const availY = Math.max(0, h / 2 - (ph / 2) * NEAR - pad - 4);
  const b = clamp(bloom, 1, 2);
  // The rest radius leaves part of the room for the click to open into;
  // the rest of the open is allowed to run into the padding.
  const k = clamp(radius, 0.4, 1) / Math.sqrt(1 + (b - 1) * 0.6);
  const rx = availX * k;
  const t = (clamp(tilt, 8, 40) * Math.PI) / 180;
  // A tall box is seen from higher up, so the orbit opens toward a circle
  // rather than leaving the height empty; it never gets taller than wide.
  const steep = Math.max(1, (h / Math.max(1, w - left)) * 0.8);
  const ry = Math.min(
    availY * k * 1.2,
    rx * Math.min(1, Math.sin(t) * 2.2 * steep),
  );
  const open = Math.min(b, rx > 0 ? (availX + pad * 0.6) / rx : b);
  return {
    w,
    h,
    pw,
    ph,
    cx: Math.round(left + (w - left) / 2),
    cy: Math.round(h / 2),
    rx: r2(rx),
    ry: r2(ry),
    open: r3(open),
    top: Math.round(h / 2 - ry),
    bottom: Math.round(h / 2 + ry),
  };
}

/**
 * A bokeh disc: flat, with the slightly brighter rim a real lens draws. It
 * blends with screen straight onto its picture (nothing between them groups
 * it), so it glows where the picture is dark and fades where it is light.
 */
function Disc({
  light,
  size,
  scale,
  strength,
}: {
  light: Light;
  size: number;
  scale: MotionValue<number>;
  strength: MotionValue<number>;
}) {
  const opacity = useTransform(strength, (o) => r3(o * light.k));
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute block rounded-full"
      style={{
        left: `${light.x}%`,
        top: `${light.y}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        scale,
        opacity,
        mixBlendMode: "screen",
        background: `radial-gradient(circle, ${tone("--warn", 0.9, 0.07, 0, 0.62)} 0 52%, ${tone("--warn", 0.98, 0.05)} 62%, ${tone("--warn", 0.9, 0.07, 0, 0.35)} 67%, transparent 71%)`,
      }}
    />
  );
}

type PictureProps = {
  index: number;
  n: number;
  item: BokehOrbitItem;
  geo: Geo;
  phase: MotionValue<number>;
  spread: MotionValue<number>;
  focus: MotionValue<number>;
  aperture: number;
  highlights: number;
};

/** One picture: its place on the orbit, its depth, its blur and its discs. */
function Picture({
  index,
  n,
  item,
  geo,
  phase,
  spread,
  focus,
  aperture,
  highlights,
}: PictureProps) {
  const art = React.useMemo(
    () =>
      item.src
        ? { css: undefined, lights: seededLights(index) }
        : orbitArt(index),
    [item.src, index],
  );
  const angleOf = (p: number) => ((p + (index * 360) / n) * Math.PI) / 180;
  const both = [phase, spread] as MotionValue<number>[];
  const x = useTransform(both, ([p, s]) =>
    r2(Math.cos(angleOf(p as number)) * geo.rx * (s as number)),
  );
  const y = useTransform(both, ([p, s]) =>
    r2(Math.sin(angleOf(p as number)) * geo.ry * (s as number)),
  );
  const depth = useTransform(phase, (p) => (Math.sin(angleOf(p)) + 1) / 2);
  const scale = useTransform(depth, (d) => r3(lerp(FAR, NEAR, d)));
  const zIndex = useTransform(depth, (d) => Math.round(10 + d * 80));
  const coc = useTransform([depth, focus] as MotionValue<number>[], ([d, f]) =>
    clamp(
      clamp(aperture, 0, 1) * Math.abs((d as number) - (f as number)) * 2.2,
      0,
      1,
    ),
  );
  const maxBlur = geo.pw * 0.11;
  const filter = useTransform(coc, (c) => {
    const px = Math.round(c * maxBlur * 4) / 4;
    return px >= 0.25 ? `blur(${px}px)` : "none";
  });
  const opacity = useTransform(coc, (c) => r3(1 - 0.22 * c));
  const discScale = useTransform(coc, (c) => r3(0.4 + c * 5.2));
  const discOpacity = useTransform(coc, (c) =>
    r3(clamp(highlights, 0, 1) * smooth(0.06, 0.45, c)),
  );
  const disc = Math.max(6, Math.round(geo.pw * 0.07));

  return (
    <motion.div
      role="listitem"
      data-pic={index}
      className="absolute top-0 left-0"
      style={{
        width: geo.pw,
        height: geo.ph,
        marginLeft: geo.cx - geo.pw / 2,
        marginTop: geo.cy - geo.ph / 2,
        x,
        y,
        scale,
        zIndex,
      }}
    >
      <motion.div
        role="img"
        aria-label={item.caption ? `${item.caption}: ${item.alt}` : item.alt}
        className="absolute inset-0 overflow-hidden rounded-2"
        style={{
          backgroundImage: art.css,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter,
          opacity,
          boxShadow:
            "0 10px 24px -14px color-mix(in oklab, black 70%, transparent), inset 0 0 0 1px color-mix(in oklab, white 12%, transparent)",
        }}
      >
        {item.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt=""
            draggable={false}
            className="pointer-events-none size-full object-cover"
          />
        ) : null}
      </motion.div>
      {art.lights.map((l, k) => (
        <Disc
          key={k}
          light={l}
          size={disc}
          scale={discScale}
          strength={discOpacity}
        />
      ))}
    </motion.div>
  );
}

/**
 * Pictures on a slow elliptical orbit seen from a little above — the far
 * side high and small, the near side low and large — through a fast lens.
 * The focal plane is a depth; every picture's circle of confusion is
 * `aperture` times its distance from that plane, so a picture at the plane is
 * crisp and the rest melt: blurred, lightened, and their lights (the sun,
 * lamps, stars) bloom into soft-rimmed bokeh discs that grow with the blur
 * and spill past the picture's edge.
 *
 * The pointer's height racks the focus (far at the top, near at the foot) on
 * springs.glide, read off a distance scale down the left edge. A click spins
 * the orbit open — the radius springs out on springs.snap while the phase is
 * kicked forward on springs.drift — then it draws back in on springs.drift.
 * The scale is a real vertical slider: arrows rack the focus, Home and End go
 * to infinity and the near limit, Enter or Space spins it open. Under reduced
 * motion the orbit holds still and the focus jumps instead of racking.
 */
export function BokehOrbit({
  items,
  aperture = 0.6,
  radius = 0.85,
  spin = 6,
  focus,
  defaultFocus = 0.5,
  onFocusChange,
  followPointer = true,
  tilt = 22,
  highlights = 0.7,
  bloom = 1.4,
  pictureSize,
  scale = true,
  paused = false,
  label = "Orbit of pictures",
  disabled = false,
  className,
}: BokehOrbitProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list =
    items && items.length > 0 ? items.slice(0, 16) : defaultBokehOrbitItems;
  const n = list.length;

  const controlled = focus !== undefined;
  const [own, setOwn] = React.useState(() => clamp(defaultFocus, 0, 1));
  const target = clamp(controlled ? focus : own, 0, 1);

  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const geo = geometryOf(
    box.w || 720,
    box.h || 520,
    radius,
    tilt,
    bloom,
    pictureSize,
    scale,
  );

  const phase = useMotionValue(0);
  const kick = useMotionValue(0);
  const spread = useMotionValue(1);
  const focusMv = useMotionValue(target);
  const orbit = useTransform([phase, kick] as MotionValue<number>[], ([p, k]) =>
    r2((p as number) + (k as number)),
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const shown = React.useRef(target);
  const scaleFrom = React.useRef(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const go = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };

  /** Moves the focal plane: racked on glide, or set at once. */
  const rack = (f: number, immediate = false) => {
    const v = clamp(f, 0, 1);
    if (!motionSafe || immediate) {
      runs.current.get("focus")?.stop();
      focusMv.set(r3(v));
      return;
    }
    go("focus", animate(focusMv, v, springs.glide));
  };

  /** A new focal plane asked for by a visitor: reported, then racked. */
  const request = (f: number, immediate = false) => {
    if (disabled) return;
    const v = r3(clamp(f, 0, 1));
    if (Math.abs(v - target) < 0.005) {
      rack(v, immediate);
      return;
    }
    shown.current = v;
    if (!controlled) setOwn(v);
    onFocusChange?.(v);
    rack(v, immediate);
  };

  const focusFromY = (clientY: number) => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    const y = clientY - rect.top;
    if (geo.bottom <= geo.top) return null;
    return clamp((y - geo.top) / (geo.bottom - geo.top), 0, 1);
  };

  /** The signature: the orbit spins open and draws back in. */
  const bloomOpen = () => {
    if (disabled || !motionSafe) return;
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    go("spread", animate(spread, geo.open, springs.snap));
    go(
      "kick",
      animate(kick, kick.get() + 360 / Math.max(3, n) + 50, springs.drift),
    );
    timers.current.push(
      window.setTimeout(() => {
        go("spread", animate(spread, 1, springs.drift));
      }, 260),
    );
    setSaid((s) => ({ n: s.n + 1, text: "The orbit spins open." }));
  };

  /** Reduced motion: a click racks focus to the picture under it instead. */
  const focusPicture = (el: Element | null) => {
    const pic = el?.closest?.("[data-pic]");
    if (!pic) return false;
    const i = Number(pic.getAttribute("data-pic"));
    if (!Number.isFinite(i)) return false;
    const a = ((orbit.get() + (i * 360) / n) * Math.PI) / 180;
    request((Math.sin(a) + 1) / 2, true);
    return true;
  };

  const scaleDrag = useDrag({
    axis: "y",
    threshold: 2,
    disabled,
    onStart: () => {
      scaleFrom.current = focusMv.get();
    },
    onMove: ({ point }) => {
      const f = focusFromY(point.y);
      if (f !== null) request(f, true);
    },
    onTap: (event) => {
      const f = focusFromY(event.clientY);
      if (f !== null) request(f);
    },
  });

  /* -------------------------------- effects ------------------------------ */

  const api = React.useRef({ rack });
  React.useEffect(() => {
    api.current = { rack };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const r = root.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // A host that changes `focus` racks it like a key would.
  React.useEffect(() => {
    if (Math.abs(shown.current - target) < 0.0005) return;
    shown.current = target;
    api.current.rack(target);
  }, [target]);

  // The idle turn: only on screen, in a visible tab, motion-safe, unpaused.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || paused || !motionSafe || spin === 0) return;
    let raf = 0;
    let last = 0;
    let inView = false;
    const loop = (now: number) => {
      raf = 0;
      if (!inView || document.hidden) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      phase.set(r3(phase.get() + spin * dt));
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (raf !== 0 || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) inView = entry.isIntersecting;
      if (inView) wake();
      else if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [paused, motionSafe, spin, phase]);

  React.useEffect(() => {
    const running = runs.current;
    const pending = timers;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending.current) window.clearTimeout(t);
      pending.current = [];
    };
  }, []);

  /* --------------------------------- render ------------------------------ */

  const markerY = useTransform(focusMv, (f) =>
    r2(geo.top + f * (geo.bottom - geo.top)),
  );
  const focusLabel = distanceText(target);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerMove={(event) => {
        if (!followPointer || disabled || event.pointerType === "touch") return;
        if (event.buttons !== 0) return;
        const f = focusFromY(event.clientY);
        if (f !== null && Math.abs(f - target) > 0.01) request(f);
      }}
      onClick={(event) => {
        if (disabled) return;
        const t = event.target as Element | null;
        if (t?.closest?.("[data-scale]")) return;
        if (!motionSafe) {
          focusPicture(t);
          return;
        }
        if (event.detail > 0) {
          const f = focusFromY(event.clientY);
          if (f !== null && followPointer) request(f);
        }
        bloomOpen();
      }}
      className={cn(
        "relative isolate h-full w-full touch-manipulation overflow-clip [contain:paint] select-none",
        disabled ? "opacity-60" : "cursor-crosshair",
        className,
      )}
    >
      <div role="list" aria-label="Pictures" className="absolute inset-0">
        {list.map((item, i) => (
          <Picture
            key={i}
            index={i}
            n={n}
            item={item}
            geo={geo}
            phase={orbit}
            spread={spread}
            focus={focusMv}
            aperture={aperture}
            highlights={highlights}
          />
        ))}
      </div>

      {/* The focal plane, across the stage. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute right-0 h-px"
        style={{
          left: scale ? SCALE_W : 0,
          top: markerY,
          zIndex: 95,
          background:
            "linear-gradient(to right, color-mix(in oklab, var(--foreground) 22%, transparent), transparent 70%)",
        }}
      />

      {scale ? (
        <div
          data-scale=""
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label="Focus distance"
          aria-describedby={hintId}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(target * 100)}
          aria-valuetext={`Focus ${focusLabel === "∞" ? "at infinity" : focusLabel}`}
          aria-disabled={disabled || undefined}
          onKeyDown={(event) => {
            const k = event.key;
            const step = k === "PageUp" || k === "PageDown" ? 0.2 : 0.05;
            if (k === "ArrowUp" || k === "ArrowRight" || k === "PageUp") {
              event.preventDefault();
              request(target - step);
            } else if (
              k === "ArrowDown" ||
              k === "ArrowLeft" ||
              k === "PageDown"
            ) {
              event.preventDefault();
              request(target + step);
            } else if (k === "Home") {
              event.preventDefault();
              request(0);
            } else if (k === "End") {
              event.preventDefault();
              request(1);
            } else if (k === "Enter" || k === " ") {
              event.preventDefault();
              bloomOpen();
            }
          }}
          {...scaleDrag}
          className={cn(
            "absolute top-0 bottom-0 left-0 touch-pan-x rounded-2 outline-none",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-not-allowed" : "cursor-ns-resize",
          )}
          style={{ width: SCALE_W, zIndex: 96 }}
        >
          <span
            aria-hidden
            className="absolute w-px bg-hairline-strong"
            style={{ left: 8, top: geo.top, height: geo.bottom - geo.top }}
          />
          {MARKS.map(([text, f]) => (
            <span
              key={text}
              aria-hidden
              className="absolute flex items-center gap-1 font-mono text-[9px] leading-none text-ink-3 tabular-nums"
              style={{
                left: 6,
                top: Math.round(geo.top + f * (geo.bottom - geo.top) - 4),
              }}
            >
              <span className="h-px w-1.5 bg-ink-3" />
              {text}
            </span>
          ))}
          <motion.span
            aria-hidden
            className="absolute left-0 flex items-center"
            style={{ top: markerY, y: -4 }}
          >
            <span
              className="block size-0 border-y-4 border-l-[6px] border-y-transparent"
              style={{ borderLeftColor: "var(--accent-bright)" }}
            />
          </motion.span>
        </div>
      ) : null}

      <motion.p
        aria-hidden
        className="pointer-events-none absolute right-3 rounded-1 bg-[color-mix(in_oklab,var(--card)_78%,transparent)] px-1 py-0.5 font-mono text-[10px] leading-none tracking-[0.08em] text-ink-2 tabular-nums"
        style={{ top: markerY, y: -14, zIndex: 95 }}
      >
        {focusLabel}
      </motion.p>

      <p id={hintId} className="sr-only">
        Arrow keys rack the focus nearer or farther; Home is infinity and End
        the nearest; Enter spins the orbit open.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
