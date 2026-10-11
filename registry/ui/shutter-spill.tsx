"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberband,
  useDrag,
  type DragInfo,
} from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ShutterSpillItem = {
  /** An image URL. Without one, a print is drawn in code. */
  src?: string;
  /** What the picture shows: read with the frame's name. */
  alt: string;
  /** A short title, printed in the margin when the print is picked up. */
  caption?: string;
};

export type ShutterSpillTrigger = "inView" | "mount" | "manual";

export type ShutterSpillProps = {
  /** The pictures, one print each (up to 24). @default eight drawn prints */
  items?: ShutterSpillItem[];
  /** The burst's rhythm, in frames per second, 3 to 15. @default 8 */
  cadence?: number;
  /** How far across the table the spiral reaches, 0.3 to 1. @default 0.85 */
  spread?: number;
  /** Strength of each shot's flash, 0 (none) to 1. @default 0.6 */
  flash?: number;
  /** How far each print curls round on its way out, in turns, 0 to 1. @default 0.3 */
  swirl?: number;
  /** The largest angle a print comes to rest at, degrees. @default 7 */
  tilt?: number;
  /** The picked-up print (controlled), or null. */
  value?: number | null;
  /** The picked-up print to begin with. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that picked a print up or put it down. */
  onValueChange?: (index: number | null) => void;
  /** Whether the prints are out on the table (controlled). */
  spilled?: boolean;
  /** Start with the prints already on the table. @default false */
  defaultSpilled?: boolean;
  /** Fires from the trigger, camera, double click or key that fired or gathered the set. */
  onSpilledChange?: (spilled: boolean) => void;
  /** What fires the first burst: coming into view, mounting, or only the camera. @default "inView" */
  trigger?: ShutterSpillTrigger;
  /** The table's light, any CSS colour. @default a pale warm light from --warn */
  light?: string;
  /** A print's width on the table, px. @default fitted to the table */
  frameSize?: number;
  /** Print frame numbers in the margins. @default true */
  numbered?: boolean;
  /** Seeds the spiral's jitter and the resting angles. @default 1 */
  seed?: number;
  /** A shutter click for each frame, after a visitor's press. @default false */
  sound?: boolean;
  /** The table's accessible name. @default "Contact prints" */
  label?: string;
  /** No firing, picking or sliding. @default false */
  disabled?: boolean;
  /** Sizes the table; it fills its parent by default (h-full w-full). */
  className?: string;
};

export const defaultShutterSpillItems: ShutterSpillItem[] = [
  { alt: "A low sun rising over a still harbour", caption: "Harbour at dawn" },
  { alt: "A pale salt flat under a wide sky", caption: "Salt flats" },
  { alt: "Green ridges fading into haze", caption: "North ridge" },
  { alt: "Wet sand and shallow water at low tide", caption: "Low tide" },
  { alt: "Dark wooded hills around a hollow", caption: "Pine hollow" },
  { alt: "Warm dunes under a high sun", caption: "Dune sea" },
  { alt: "A ferry light on a dark sea under the moon", caption: "Night ferry" },
  { alt: "A bank of fog over a quiet shore", caption: "Fogbank" },
];

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const MAX_PRINTS = 24;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, n: number) => ((v % n) + n) % n;
/** Words as they sit inside a sentence: no full stop of their own to double. */
const bare = (text: string) => text.trim().replace(/[.!?]+$/, "");
const frames = (count: number) => `${count} frame${count === 1 ? "" : "s"}`;

/** A small integer hash, unsigned all the way, as a fraction of 1. */
function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** A pigment from a token's hue: fixed lightness, so it reads the same in both themes. */
const tone = (token: string, l: number, c: number, turn = 0, alpha = 1) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn})${alpha < 1 ? ` / ${alpha}` : ""})`;

const KINDS = [
  "sea",
  "flats",
  "hills",
  "tide",
  "pines",
  "dunes",
  "night",
  "fog",
] as const;

/** A landscape print drawn in gradients: the same on the server and in the browser. */
function printArt(i: number, seed: number): string {
  const kind = KINDS[i % KINDS.length] ?? "sea";
  const r = (k: number) => hash(i + 31, seed, k);
  const sx = Math.round(24 + r(1) * 52);
  const sy = Math.round(22 + r(2) * 16);
  const tw = Math.round((r(3) - 0.5) * 24);
  const vignette =
    "radial-gradient(130% 100% at 50% 42%, transparent 58%, color-mix(in oklab, black 24%, transparent) 100%)";
  let layers: string[];
  switch (kind) {
    case "sea":
      layers = [
        `radial-gradient(3% 16% at ${sx}% 76%, ${tone("--warn", 0.93, 0.07, 0, 0.8)}, transparent)`,
        `radial-gradient(circle at ${sx}% ${sy + 18}%, ${tone("--warn", 0.98, 0.04)} 0 4%, ${tone("--warn", 0.9, 0.09, 0, 0.5)} 5%, transparent 20%)`,
        `radial-gradient(60% 6% at ${100 - sx}% 60%, ${tone("--accent", 0.3, 0.03, tw)} 0 96%, transparent 100%)`,
        `linear-gradient(to bottom, transparent 60%, ${tone("--accent", 0.46, 0.07, tw)} 60%, ${tone("--accent", 0.26, 0.05, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.6, 0.08, tw - 30)}, ${tone("--warn", 0.86, 0.08, -10)} 58%, ${tone("--warn", 0.93, 0.06)} 60%)`,
      ];
      break;
    case "flats":
      layers = [
        `linear-gradient(to bottom, transparent 63%, ${tone("--accent", 0.42, 0.03, tw)} 63% 64%, transparent 64%)`,
        `radial-gradient(circle at ${sx}% ${sy + 16}%, ${tone("--warn", 0.98, 0.03)} 0 3%, transparent 12%)`,
        `linear-gradient(to bottom, transparent 64%, ${tone("--warn", 0.9, 0.03, tw)} 64%, ${tone("--warn", 0.8, 0.04, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.78, 0.05, tw)}, ${tone("--accent", 0.94, 0.02, tw)} 64%)`,
      ];
      break;
    case "hills":
      layers = [
        `radial-gradient(80% 42% at ${20 + Math.round(r(4) * 20)}% 100%, ${tone("--success", 0.36, 0.07, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(70% 36% at 82% 100%, ${tone("--success", 0.44, 0.07, tw + 10)} 0 98%, transparent 100%)`,
        `radial-gradient(90% 40% at 60% 84%, ${tone("--success", 0.6, 0.05, tw + 30)} 0 98%, transparent 100%)`,
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.97, 0.05)} 0 5%, ${tone("--warn", 0.9, 0.08, 0, 0.4)} 6%, transparent 18%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.74, 0.07, tw)}, ${tone("--success", 0.9, 0.04, tw + 60)} 80%)`,
      ];
      break;
    case "tide":
      layers = [
        `radial-gradient(40% 10% at ${sx}% 80%, ${tone("--warn", 0.92, 0.05, 0, 0.7)}, transparent)`,
        `linear-gradient(to bottom, transparent 54%, ${tone("--accent", 0.55, 0.06, tw)} 54%, ${tone("--accent", 0.64, 0.05, tw)} 68%, ${tone("--warn", 0.74, 0.05, tw)} 70%, ${tone("--warn", 0.58, 0.06, tw - 10)} 100%)`,
        `radial-gradient(circle at ${sx}% ${sy + 10}%, ${tone("--warn", 0.97, 0.04)} 0 4%, transparent 16%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.7, 0.06, tw)}, ${tone("--accent", 0.88, 0.04, tw)} 54%)`,
      ];
      break;
    case "pines":
      layers = [
        `radial-gradient(60% 40% at 20% 100%, ${tone("--success", 0.24, 0.05, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(60% 46% at 85% 100%, ${tone("--success", 0.28, 0.05, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(80% 50% at 50% 100%, ${tone("--success", 0.4, 0.05, tw + 20)} 0 98%, transparent 100%)`,
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.95, 0.05)} 0 4%, transparent 14%)`,
        `linear-gradient(to bottom, ${tone("--warn", 0.82, 0.06, tw - 20)}, ${tone("--success", 0.78, 0.04, tw + 40)} 70%)`,
      ];
      break;
    case "dunes":
      layers = [
        `radial-gradient(70% 30% at 30% 100%, ${tone("--danger", 0.56, 0.1, tw + 30)} 0 98%, transparent 100%)`,
        `radial-gradient(60% 28% at 78% 96%, ${tone("--warn", 0.66, 0.11, tw - 10)} 0 98%, transparent 100%)`,
        `radial-gradient(90% 34% at 55% 86%, ${tone("--warn", 0.76, 0.1, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.98, 0.04)} 0 4%, ${tone("--warn", 0.92, 0.07, 0, 0.5)} 5%, transparent 16%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.72, 0.06, tw)}, ${tone("--warn", 0.9, 0.05, tw)} 75%)`,
      ];
      break;
    case "night": {
      const stars = [0, 1, 2, 3].map((k) => {
        const x = Math.round(8 + r(10 + k) * 84);
        const y = Math.round(6 + r(20 + k) * 40);
        return `radial-gradient(circle at ${x}% ${y}%, ${tone("--accent", 0.95, 0.02)} 0 0.6%, transparent 1.2%)`;
      });
      layers = [
        `radial-gradient(2% 14% at ${sx}% 78%, ${tone("--warn", 0.85, 0.12, 0, 0.8)}, transparent)`,
        `radial-gradient(circle at ${sx}% 64%, ${tone("--warn", 0.94, 0.12)} 0 0.8%, ${tone("--warn", 0.8, 0.14, 0, 0.5)} 1.4%, transparent 4%)`,
        ...stars,
        `radial-gradient(circle at ${100 - sx}% ${sy}%, ${tone("--warn", 0.95, 0.03)} 0 5%, ${tone("--accent", 0.6, 0.05, 0, 0.35)} 6%, transparent 18%)`,
        `linear-gradient(to bottom, transparent 62%, ${tone("--accent", 0.22, 0.05, tw)} 62%, ${tone("--accent", 0.14, 0.04, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.16, 0.05, tw)}, ${tone("--accent", 0.32, 0.08, tw)} 62%)`,
      ];
      break;
    }
    default:
      layers = [
        `radial-gradient(70% 22% at 30% 86%, ${tone("--success", 0.52, 0.02, tw, 0.6)} 0 60%, transparent 100%)`,
        `linear-gradient(to bottom, transparent 46%, ${tone("--accent", 0.84, 0.01, tw, 0.8)} 56%, transparent 70%)`,
        `radial-gradient(80% 30% at 70% 72%, ${tone("--accent", 0.62, 0.02, tw)} 0 50%, transparent 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.86, 0.012, tw)}, ${tone("--accent", 0.78, 0.015, tw)} 100%)`,
      ];
  }
  return [vignette, ...layers].join(", ");
}

const PAPER = tone("--warn", 0.975, 0.008);
const PAPER_INK = tone("--warn", 0.42, 0.02);
const DEVELOPER = tone("--warn", 0.99, 0.01);
const CAMERA_BODY = `linear-gradient(to bottom, ${tone("--accent", 0.3, 0.012)}, ${tone("--accent", 0.2, 0.012)})`;
const LENS_GLASS = `radial-gradient(circle at 36% 32%, ${tone("--accent", 0.7, 0.06)} 0 7%, ${tone("--accent", 0.34, 0.07)} 22%, ${tone("--accent", 0.12, 0.03)} 64%)`;
const LENS_RING = `0 0 0 2px ${tone("--accent", 0.4, 0.01)}, 0 0 0 3px ${tone("--accent", 0.16, 0.01)}`;
const DEFAULT_LIGHT = "oklch(from var(--warn) 0.94 0.04 h)";

type Pose = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  scale: MotionValue<number>;
  opacity: MotionValue<number>;
  /** 0 on the table, 1 held up: shadow and nothing else. */
  lift: MotionValue<number>;
  /** The flash on the paper, developing away. */
  white: MotionValue<number>;
  /** Stepped aside: the print recedes into the table. */
  dim: MotionValue<number>;
  caption: MotionValue<number>;
};

const POSE_KEYS = [
  "x",
  "y",
  "rotate",
  "scale",
  "opacity",
  "lift",
  "white",
  "dim",
  "caption",
] as const;

const makePose = (): Pose => ({
  x: motionValue(0),
  y: motionValue(0),
  rotate: motionValue(0),
  scale: motionValue(0.1),
  opacity: motionValue(0),
  lift: motionValue(0),
  white: motionValue(0),
  dim: motionValue(0),
  caption: motionValue(0),
});

type Home = { x: number; y: number; rot: number; spin: number };

type Layout = {
  w: number;
  h: number;
  /** The print at full size, held up: everything is drawn at this size and scaled down. */
  PW: number;
  PH: number;
  border: number;
  pw: number;
  ph: number;
  margin: number;
  /** A print on the table: its width and the scale that gives it. */
  fw: number;
  fh: number;
  s0: number;
  rx: number;
  ry: number;
  limX: number;
  limY: number;
  cam: number;
  homes: Home[];
  numberSize: number;
  captionSize: number;
};

function layoutOf(
  w: number,
  h: number,
  n: number,
  spread: number,
  tilt: number,
  seed: number,
  frameSize: number | undefined,
): Layout {
  const PW = Math.round(Math.max(80, Math.min(w * 0.56, (h * 0.72) / 0.83)));
  const border = Math.max(3, Math.round(PW * 0.045));
  const pw = PW - 2 * border;
  const ph = Math.round(pw * 0.75);
  const margin = Math.max(12, Math.round(PW * 0.1));
  const PH = border + ph + margin;
  const fw = Math.round(
    clamp(
      frameSize ?? Math.min(w * 0.3, Math.sqrt(w * h) * 0.21, h * 0.3),
      40,
      Math.min(148, PW),
    ),
  );
  const s0 = r3(fw / PW);
  const fh = PH * s0;
  const tr = (clamp(tilt, 0, 25) * Math.PI) / 180;
  const extX = (fw / 2) * Math.cos(tr) + (fh / 2) * Math.sin(tr) + 6;
  const extY = (fh / 2) * Math.cos(tr) + (fw / 2) * Math.sin(tr) + 6;
  const rx = Math.max(0, w / 2 - extX);
  const ry = Math.max(0, h / 2 - extY);
  const cam = Math.round(clamp(fw * 0.42, 34, 54));
  const reach = Math.max(1, Math.min(rx, ry));
  // Prints clear the camera: the innermost ring starts outside its body.
  const clear = Math.min(0.9, (cam * 0.9 + fw * 0.4) / reach);
  const turn = hash(seed, 0, 99) * Math.PI * 2;
  const homes: Home[] = Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    const theta = turn + i * GOLDEN + (hash(seed, i, 1) - 0.5) * 0.4;
    const rho = Math.min(
      1,
      Math.max(
        clear * (0.92 + 0.08 * hash(seed, i, 6)),
        clamp(spread, 0.2, 1) *
          (0.42 + 0.66 * Math.sqrt(t)) *
          (0.94 + 0.06 * hash(seed, i, 2)),
      ),
    );
    // The disc is pushed a little toward the table's corners, so a full
    // spread uses the rectangle rather than only the ellipse inside it.
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const corner = 1 + 0.3 * (1 / Math.max(Math.abs(c), Math.abs(s)) - 1);
    return {
      x: r2(clamp(rx * rho * corner * c, -rx, rx)),
      y: r2(clamp(ry * rho * corner * s, -ry, ry)),
      rot: r2((hash(seed, i, 3) * 2 - 1) * clamp(tilt, 0, 25)),
      spin: r2(
        (hash(seed, i, 4) > 0.5 ? 1 : -1) * (14 + 22 * hash(seed, i, 5)),
      ),
    };
  });
  return {
    w,
    h,
    PW,
    PH,
    border,
    pw,
    ph,
    margin,
    fw,
    fh,
    s0,
    rx,
    ry,
    limX: Math.max(0, w / 2 - fw / 2 - 4),
    limY: Math.max(0, h / 2 - fh / 2 - 4),
    cam,
    homes,
    numberSize: Math.round(clamp(6 / Math.max(0.05, s0), 9, margin * 0.42)),
    captionSize: Math.round(clamp(PW * 0.034, 10, 14)),
  };
}

type PrintProps = {
  index: number;
  n: number;
  item: ShutterSpillItem;
  pose: Pose;
  lay: Layout;
  seed: number;
  z: number;
  picked: boolean;
  tabbable: boolean;
  hidden: boolean;
  disabled: boolean;
  numbered: boolean;
  register: (index: number, node: HTMLButtonElement | null) => void;
  onTap: (index: number, at: number) => void;
  onActivate: (index: number) => void;
  onKeyDown: (index: number, event: React.KeyboardEvent) => void;
  onHover: (index: number, on: boolean) => void;
  onDragStart: (index: number) => boolean;
  onDragMove: (index: number, info: DragInfo) => void;
  onDragEnd: (index: number, info: DragInfo | null) => void;
};

/** One print: paper, the picture, its number, and a caption for when it is held up. */
function Print({
  index,
  n,
  item,
  pose,
  lay,
  seed,
  z,
  picked,
  tabbable,
  hidden,
  disabled,
  numbered,
  register,
  onTap,
  onActivate,
  onKeyDown,
  onHover,
  onDragStart,
  onDragMove,
  onDragEnd,
}: PrintProps) {
  const live = React.useRef(false);
  const ref = React.useCallback(
    (node: HTMLButtonElement | null) => register(index, node),
    [index, register],
  );

  const drag = useDrag({
    threshold: 4,
    // A held print still takes taps (to put it down); the parent refuses
    // to let it be dragged.
    disabled: disabled || hidden,
    onStart: () => {
      live.current = onDragStart(index);
    },
    onMove: (info) => {
      if (live.current) onDragMove(index, info);
    },
    onEnd: (info) => {
      if (!live.current) return;
      live.current = false;
      onDragEnd(index, info);
    },
    onCancel: () => {
      if (!live.current) return;
      live.current = false;
      onDragEnd(index, null);
    },
    onTap: (event) => onTap(index, event.timeStamp),
  });

  // The shadow is drawn on the table, so it is sized in the table's pixels:
  // divided by the print's own scale, it stays the same as the print shrinks.
  const shadow = useTransform(
    [pose.scale, pose.lift] as MotionValue<number>[],
    ([s, l]) => {
      const k = 1 / Math.max(0.05, s as number);
      const lift = l as number;
      return `0 0 0 ${r2(k)}px color-mix(in oklab, black 10%, transparent), 0 ${r2((1.5 + 9 * lift) * k)}px ${r2((4 + 22 * lift) * k)}px color-mix(in oklab, black ${Math.round(20 + 14 * lift)}%, transparent)`;
    },
  );
  const ringWidth = useTransform(
    pose.scale,
    (s) => `${r2(2 / Math.max(0.05, s))}px`,
  );
  const ringOffset = useTransform(
    pose.scale,
    (s) => `${r2(3 / Math.max(0.05, s))}px`,
  );
  const name = item.caption ?? item.alt;
  const number = String(index + 1).padStart(2, "0");

  return (
    <motion.button
      ref={ref}
      type="button"
      data-print={index}
      tabIndex={tabbable ? 0 : -1}
      aria-label={
        item.caption
          ? `Frame ${index + 1} of ${n}, ${item.caption}: ${item.alt}`
          : `Frame ${index + 1} of ${n}: ${item.alt}`
      }
      aria-pressed={picked}
      inert={hidden}
      disabled={disabled}
      onClick={(event) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it (Enter, Space, assistive tech) is a press too.
        if (event.detail === 0) onActivate(index);
      }}
      onKeyDown={(event) => onKeyDown(index, event)}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onHover(index, true);
      }}
      onPointerLeave={() => onHover(index, false)}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) onHover(index, true);
      }}
      onBlur={() => onHover(index, false)}
      {...drag}
      className={cn(
        "absolute top-1/2 left-1/2 flex touch-none flex-col items-stretch rounded-[2px] text-left outline-none select-none",
        "focus-visible:outline-ring focus-visible:outline-solid",
        picked ? "cursor-zoom-out" : "cursor-grab active:cursor-grabbing",
        "disabled:cursor-not-allowed",
      )}
      style={{
        width: lay.PW,
        height: lay.PH,
        marginLeft: -lay.PW / 2,
        marginTop: -lay.PH / 2,
        padding: `${lay.border}px ${lay.border}px 0`,
        background: PAPER,
        x: pose.x,
        y: pose.y,
        rotate: pose.rotate,
        scale: pose.scale,
        opacity: pose.opacity,
        boxShadow: shadow,
        outlineWidth: ringWidth,
        outlineOffset: ringOffset,
        zIndex: z,
      }}
    >
      <span
        aria-hidden
        className="relative block shrink-0 overflow-hidden"
        style={{
          width: lay.pw,
          height: lay.ph,
          backgroundImage: item.src ? undefined : printArt(index, seed),
          backgroundSize: "cover",
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
        <motion.span
          className="absolute inset-0"
          style={{ opacity: pose.white, background: DEVELOPER }}
        />
      </span>
      <span
        aria-hidden
        className="flex min-w-0 items-center justify-between gap-2"
        style={{ height: lay.margin, color: PAPER_INK }}
      >
        <span
          className="shrink-0 font-mono leading-none tabular-nums"
          style={{ fontSize: lay.numberSize, opacity: numbered ? 0.8 : 0 }}
        >
          {number}
        </span>
        <motion.span
          className="min-w-0 truncate leading-none font-medium"
          style={{ fontSize: lay.captionSize, opacity: pose.caption }}
        >
          {name}
        </motion.span>
      </span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[2px]"
        style={{ opacity: pose.dim, background: "var(--shutter-spill-table)" }}
      />
    </motion.button>
  );
}

/**
 * A burst of frames spilling across a light table. The camera at the centre
 * fires `cadence` frames a second: each shot blinks its lens, throws a flash
 * across the table, and sends a print out white — developing to its picture
 * as it goes — along a loose spiral (one progress value on springs.glide, its
 * angle sweeping `swirl` of a turn as its radius grows) to a resting place on
 * a golden-angle spiral, where it settles onto its seeded angle on
 * springs.snap. A click picks a print up into the middle while the others
 * shuffle aside in a cascade; a double click gathers the set back into the
 * lens. Prints slide on the table 1:1 and coast a little when thrown.
 *
 * The prints are buttons in one roving tab stop: arrows step through them
 * (carrying a picked print along), Enter picks up, Escape puts down, Shift
 * with an arrow slides one; the camera is the keyboard path for firing and
 * gathering. Under reduced motion prints fade in at their places one by one
 * at the same cadence and every other change is an instant swap or a fade.
 */
export function ShutterSpill({
  items,
  cadence = 8,
  spread = 0.85,
  flash = 0.6,
  swirl = 0.3,
  tilt = 7,
  value,
  defaultValue = null,
  onValueChange,
  spilled,
  defaultSpilled = false,
  onSpilledChange,
  trigger = "inView",
  light = DEFAULT_LIGHT,
  frameSize,
  numbered = true,
  seed = 1,
  sound = false,
  label = "Contact prints",
  disabled = false,
  className,
}: ShutterSpillProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const list =
    items && items.length > 0
      ? items.slice(0, MAX_PRINTS)
      : defaultShutterSpillItems;
  const n = list.length;

  const [ownPick, setOwnPick] = React.useState<number | null>(defaultValue);
  const pickedRaw = value !== undefined ? value : ownPick;
  const picked =
    pickedRaw === null || pickedRaw === undefined
      ? null
      : clamp(Math.round(pickedRaw), 0, n - 1);
  const [ownSpilled, setOwnSpilled] = React.useState(defaultSpilled);
  const isSpilled = spilled ?? ownSpilled;

  const [geo, setGeo] = React.useState({ w: 0, h: 0 });
  const measured = geo.w > 0 && geo.h > 0;
  const lay = React.useMemo(
    () => layoutOf(geo.w, geo.h, n, spread, tilt, seed, frameSize),
    [geo.w, geo.h, n, spread, tilt, seed, frameSize],
  );

  const poses = React.useMemo(
    () => Array.from({ length: n }, () => makePose()),
    [n],
  );
  // The camera's starting state is read once; later changes animate.
  const [cam] = React.useState(() => ({
    scale: motionValue(defaultSpilled ? 1 : 1.25),
    iris: motionValue(0),
    pop: motionValue(0),
    flash: motionValue(0),
    count: motionValue(defaultSpilled ? 0 : n),
    hint: motionValue(defaultSpilled ? 0 : 1),
  }));
  const countText = useTransform(cam.count, (c) =>
    String(Math.round(c)).padStart(2, "0"),
  );
  const popScale = useTransform(cam.pop, (p) => r3(0.6 + 2 * p));
  const popOpacity = useTransform(cam.pop, (p) =>
    r3((1 - p) * clamp(flash, 0, 1)),
  );

  const [raised, setRaised] = React.useState<number[]>([]);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(() => picked ?? 0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLButtonElement>());
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const busy = React.useRef<"firing" | "gathering" | null>(null);
  const homesMoved = React.useRef(new Map<number, { u: number; v: number }>());
  const dragFrom = React.useRef({ x: 0, y: 0, lean: 0 });
  const lastTap = React.useRef(-1e9);
  const visitor = React.useRef(false);
  const autoFired = React.useRef(false);
  const laidOut = React.useRef(false);
  const shownSpilled = React.useRef(isSpilled);
  const shownPick = React.useRef<number | null>(picked);

  const register = React.useCallback(
    (index: number, node: HTMLButtonElement | null) => {
      if (node) nodes.current.set(index, node);
      else nodes.current.delete(index);
    },
    [],
  );

  const zOf = (i: number) => {
    if (i === picked || i === dragging) return 3 * n + 10;
    const k = raised.lastIndexOf(i);
    return k === -1 ? i + 1 : n + 1 + k;
  };

  /* ------------------------------ animation ------------------------------ */

  const go = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };
  const stopPrint = (i: number) => {
    for (const k of [...POSE_KEYS, "path"]) {
      const key = `${i}:${k}`;
      runs.current.get(key)?.stop();
      runs.current.delete(key);
    }
  };
  const stopAll = () => {
    for (const c of runs.current.values()) c.stop();
    runs.current.clear();
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.round(ms)));
  };

  const homeOf = (i: number): Home => {
    const base = lay.homes[i] ?? { x: 0, y: 0, rot: 0, spin: 0 };
    const moved = homesMoved.current.get(i);
    if (!moved) return base;
    return {
      ...base,
      x: r2(clamp(moved.u * (lay.w / 2), -lay.limX, lay.limX)),
      y: r2(clamp(moved.v * (lay.h / 2), -lay.limY, lay.limY)),
    };
  };
  const setHome = (i: number, x: number, y: number) => {
    homesMoved.current.set(i, {
      u: lay.w > 0 ? x / (lay.w / 2) : 0,
      v: lay.h > 0 ? y / (lay.h / 2) : 0,
    });
  };

  /** Where every print goes while `p` is held up: out of its footprint. */
  const asideOf = (i: number, p: number): { x: number; y: number } => {
    const home = homeOf(i);
    const halfW = lay.PW / 2 + lay.fw * 0.42;
    const halfH = lay.PH / 2 + lay.fh * 0.42;
    let dx = home.x;
    let dy = home.y;
    let d = Math.hypot(dx, dy);
    if (d < 1) {
      const a = (i - p) * GOLDEN;
      dx = Math.cos(a);
      dy = Math.sin(a);
      d = 1;
    }
    const ux = dx / d;
    const uy = dy / d;
    const exit = Math.min(
      Math.abs(ux) > 1e-3 ? halfW / Math.abs(ux) : Infinity,
      Math.abs(uy) > 1e-3 ? halfH / Math.abs(uy) : Infinity,
    );
    const reach = Math.max(d, exit);
    return {
      x: r2(clamp(ux * reach, -lay.limX, lay.limX)),
      y: r2(clamp(uy * reach, -lay.limY, lay.limY)),
    };
  };

  const toCamera = (i: number) => {
    const p = poses[i];
    const home = homeOf(i);
    if (!p) return;
    stopPrint(i);
    p.x.jump(0);
    p.y.jump(0);
    p.rotate.jump(r2(home.rot + home.spin));
    p.scale.jump(r3(lay.s0 * 0.35));
    p.opacity.jump(0);
    p.lift.jump(0);
    p.white.jump(0);
    p.dim.jump(0);
    p.caption.jump(0);
  };

  /** Every print straight to where the current state puts it. */
  /**
   * Every print to where the current state puts it: at once on first
   * layout, gliding there when a size or a tweak moves the places later.
   */
  const settleAll = (glide: boolean) => {
    const to = (key: string, mv: MotionValue<number>, target: number) => {
      if (glide && motionSafe) go(key, animate(mv, target, springs.glide));
      else mv.jump(target);
    };
    for (let i = 0; i < n; i += 1) {
      const p = poses[i];
      if (!p) continue;
      if (!isSpilled) {
        toCamera(i);
        continue;
      }
      stopPrint(i);
      const home = homeOf(i);
      const held = picked === i;
      const spot = picked === null || held ? home : asideOf(i, picked);
      to(`${i}:x`, p.x, held ? 0 : spot.x);
      to(`${i}:y`, p.y, held ? 0 : spot.y);
      to(`${i}:rotate`, p.rotate, held ? 0 : home.rot);
      to(
        `${i}:scale`,
        p.scale,
        held ? 1 : picked === null ? lay.s0 : r3(lay.s0 * 0.92),
      );
      p.opacity.jump(1);
      p.lift.jump(held ? 1 : 0);
      p.white.jump(0);
      p.dim.jump(picked !== null && !held ? 0.42 : 0);
      p.caption.jump(held ? 1 : 0);
    }
    cam.scale.jump(isSpilled ? 1 : 1.25);
    cam.count.jump(isSpilled ? 0 : n);
    cam.hint.jump(isSpilled ? 0 : 1);
  };

  const shoot = (i: number, byVisitor: boolean) => {
    const p = poses[i];
    if (!p) return;
    const home = homeOf(i);
    const strength = clamp(flash, 0, 1);
    cam.count.set(Math.max(0, n - i - 1));
    go(`cam:iris`, animate(cam.iris, [0, 1, 0], { duration: 0.09 }));
    if (strength > 0) {
      cam.flash.jump(strength);
      go(
        `cam:flash`,
        animate(cam.flash, 0, { duration: 0.26, ease: easings.exit }),
      );
      cam.pop.jump(0);
      go(
        `cam:pop`,
        animate(cam.pop, 1, { duration: durations.slow, ease: easings.enter }),
      );
      p.white.jump(clamp(0.45 + strength, 0, 1));
      go(
        `${i}:white`,
        animate(p.white, 0, {
          duration: durations.slow,
          ease: easings.enter,
          delay: 0.04,
        }),
      );
    }
    if (byVisitor) {
      audio.play("click", {
        pitch: r2(0.94 + 0.12 * hash(seed, i, 7)),
        gain: 0.5,
        pan: lay.w > 0 ? r3(clamp(home.x / (lay.w / 2), -1, 1) * 0.6) : 0,
      });
    }
    if (!motionSafe) {
      p.x.jump(home.x);
      p.y.jump(home.y);
      p.rotate.jump(home.rot);
      p.scale.jump(lay.s0);
      go(
        `${i}:opacity`,
        animate(p.opacity, 1, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      return;
    }
    go(`${i}:opacity`, animate(p.opacity, 1, { duration: durations.blink }));
    // The path is polar in the table's own ellipse, so the curl follows
    // the table's shape: the angle runs on ahead while the radius grows.
    const k = lay.rx > 0 ? lay.ry / lay.rx : 1;
    const u = home.x;
    const v = k > 0 ? home.y / k : home.y;
    const rho = Math.hypot(u, v);
    const theta = Math.atan2(v, u);
    const sweep = clamp(swirl, 0, 1) * Math.PI * 2;
    go(
      `${i}:path`,
      animate(0, 1, {
        ...springs.glide,
        onUpdate: (t) => {
          const a = theta - sweep * (1 - t);
          p.x.set(r2(rho * t * Math.cos(a)));
          p.y.set(r2(k * rho * t * Math.sin(a)));
        },
      }),
    );
    go(`${i}:scale`, animate(p.scale, lay.s0, springs.glide));
    go(`${i}:rotate`, animate(p.rotate, home.rot, springs.snap));
  };

  const fire = (byVisitor: boolean) => {
    stopAll();
    busy.current = "firing";
    for (let i = 0; i < n; i += 1) toCamera(i);
    if (motionSafe) go("cam:scale", animate(cam.scale, 1, springs.glide));
    else cam.scale.jump(1);
    go(
      "cam:hint",
      animate(cam.hint, 0, { duration: durations.fast, ease: easings.exit }),
    );
    const gap = 1000 / clamp(cadence, 1, 30);
    for (let i = 0; i < n; i += 1) {
      later(i * gap, () => shoot(i, byVisitor));
    }
    later((n - 1) * gap + 520, () => {
      busy.current = null;
      say(`${frames(n)} on the table.`);
    });
  };

  const gather = (byVisitor: boolean) => {
    stopAll();
    busy.current = "gathering";
    const order = Array.from({ length: n }, (_, i) => i).sort(
      (a, b) => zOf(b) - zOf(a),
    );
    const step = motionSafe ? cascade(n) : 0.03;
    order.forEach((i, k) => {
      const p = poses[i];
      if (!p) return;
      stopPrint(i);
      const delay = k * step;
      if (motionSafe) {
        go(`${i}:x`, animate(p.x, 0, { ...springs.glide, delay }));
        go(`${i}:y`, animate(p.y, 0, { ...springs.glide, delay }));
        go(`${i}:rotate`, animate(p.rotate, 0, { ...springs.glide, delay }));
        go(
          `${i}:scale`,
          animate(p.scale, r3(lay.s0 * 0.3), { ...springs.glide, delay }),
        );
      }
      go(
        `${i}:opacity`,
        animate(p.opacity, 0, {
          duration: motionSafe ? durations.base : durations.fast,
          ease: easings.exit,
          delay: motionSafe ? delay + 0.16 : delay,
        }),
      );
      go(`${i}:lift`, animate(p.lift, 0, { duration: durations.fast }));
      go(`${i}:dim`, animate(p.dim, 0, { duration: durations.fast }));
      go(`${i}:caption`, animate(p.caption, 0, { duration: durations.fast }));
      later((delay + (motionSafe ? 0.3 : 0.1)) * 1000, () =>
        cam.count.set(Math.min(n, k + 1)),
      );
    });
    const end = ((n - 1) * step + (motionSafe ? 0.5 : 0.2)) * 1000;
    later(end, () => {
      busy.current = null;
      for (let i = 0; i < n; i += 1) toCamera(i);
      cam.count.set(n);
      if (motionSafe) go("cam:scale", animate(cam.scale, 1.25, springs.snap));
      else cam.scale.jump(1.25);
      go(
        "cam:hint",
        animate(cam.hint, 1, { duration: durations.base, ease: easings.enter }),
      );
      if (byVisitor) audio.play("click", { pitch: 0.72, gain: 0.45 });
      say(`Gathered ${frames(n)} into the camera.`);
    });
  };

  /** Lays the table out for `p` held up (or none): springs, or swaps under reduced motion. */
  const layoutPick = (p: number | null) => {
    if (!isSpilled || busy.current) return;
    const others = Array.from({ length: n }, (_, i) => i)
      .filter((i) => i !== p)
      .sort(
        (a, b) =>
          Math.hypot(homeOf(a).x, homeOf(a).y) -
          Math.hypot(homeOf(b).x, homeOf(b).y),
      );
    const step = cascade(Math.max(2, n - 1));
    for (let i = 0; i < n; i += 1) {
      const pose = poses[i];
      if (!pose) continue;
      stopPrint(i);
      const home = homeOf(i);
      const held = p === i;
      const spot = p === null || held ? home : asideOf(i, p);
      const target = {
        x: held ? 0 : spot.x,
        y: held ? 0 : spot.y,
        rotate: held ? 0 : home.rot,
        scale: held ? 1 : p === null ? lay.s0 : r3(lay.s0 * 0.92),
        lift: held ? 1 : 0,
        dim: p !== null && !held ? 0.42 : 0,
        caption: held ? 1 : 0,
      };
      pose.white.jump(0);
      pose.opacity.jump(pose.opacity.get() > 0 ? pose.opacity.get() : 1);
      if (!motionSafe) {
        const swap = () => {
          pose.x.jump(target.x);
          pose.y.jump(target.y);
          pose.rotate.jump(target.rotate);
          pose.scale.jump(target.scale);
          pose.lift.jump(target.lift);
          pose.dim.jump(target.dim);
          pose.caption.jump(target.caption);
        };
        // The print that changes place cross-fades out of one and into the other.
        if (held || i === shownPick.current) {
          go(`${i}:opacity`, animate(pose.opacity, 0, { duration: 0.08 }));
          later(80, () => {
            swap();
            go(
              `${i}:opacity`,
              animate(pose.opacity, 1, { duration: durations.fast }),
            );
          });
        } else swap();
        continue;
      }
      const delay = held ? 0 : Math.max(0, others.indexOf(i)) * step;
      go(`${i}:x`, animate(pose.x, target.x, { ...springs.glide, delay }));
      go(`${i}:y`, animate(pose.y, target.y, { ...springs.glide, delay }));
      go(
        `${i}:rotate`,
        animate(pose.rotate, target.rotate, { ...springs.snap, delay }),
      );
      go(
        `${i}:scale`,
        animate(pose.scale, target.scale, { ...springs.glide, delay }),
      );
      go(`${i}:lift`, animate(pose.lift, target.lift, springs.glide));
      go(
        `${i}:dim`,
        animate(pose.dim, target.dim, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      go(
        `${i}:caption`,
        animate(pose.caption, target.caption, {
          duration: durations.base,
          ease: easings.enter,
          delay: held ? 0.12 : 0,
        }),
      );
    }
  };

  /* -------------------------------- intents ------------------------------ */

  const requestSpilled = (next: boolean, byVisitor: boolean) => {
    if (disabled || busy.current || next === isSpilled) return;
    visitor.current = byVisitor;
    if (picked !== null) requestPick(null, false);
    if (spilled === undefined) setOwnSpilled(next);
    onSpilledChange?.(next);
    if (byVisitor) say(next ? `Firing ${frames(n)}.` : "Gathering the frames.");
  };

  const requestPick = (next: number | null, announce = true) => {
    if (disabled) return;
    if (next === picked) return;
    if (value === undefined) setOwnPick(next);
    onValueChange?.(next);
    if (next !== null) {
      setRaised((r) => [...r.filter((x) => x !== next), next]);
      setFocusIndex(next);
      const item = list[next];
      if (announce && item) {
        say(
          `Frame ${next + 1} of ${n} picked up${item.caption ? `: ${bare(item.caption)}` : ""}.`,
        );
      }
    } else if (announce) {
      say("Put down.");
    }
  };

  const togglePick = (i: number) => {
    if (!isSpilled || busy.current) return;
    requestPick(picked === i ? null : i);
  };

  /** A tap's time decides between a pick and a double tap that gathers. */
  const tap = (index: number | null, at: number) => {
    if (disabled) return;
    if (at - lastTap.current < 320) {
      lastTap.current = -1e9;
      if (isSpilled && !busy.current) requestSpilled(false, true);
      return;
    }
    lastTap.current = at;
    if (index === null) {
      if (picked !== null) requestPick(null);
      return;
    }
    togglePick(index);
  };

  const focusPrint = (i: number) => {
    setFocusIndex(i);
    nodes.current.get(i)?.focus();
  };

  const nudge = (i: number, dx: number, dy: number) => {
    const p = poses[i];
    if (!p || picked === i || busy.current) return;
    const home = homeOf(i);
    const x = r2(clamp(home.x + dx, -lay.limX, lay.limX));
    const y = r2(clamp(home.y + dy, -lay.limY, lay.limY));
    setHome(i, x, y);
    setRaised((r) => [...r.filter((v) => v !== i), i]);
    if (picked !== null) {
      layoutPick(picked);
      return;
    }
    if (!motionSafe) {
      p.x.jump(x);
      p.y.jump(y);
      return;
    }
    go(`${i}:x`, animate(p.x, x, springs.snap));
    go(`${i}:y`, animate(p.y, y, springs.snap));
  };

  const onPrintKey = (i: number, event: React.KeyboardEvent) => {
    const k = event.key;
    const arrows: Record<string, [number, number, number]> = {
      ArrowRight: [1, 1, 0],
      ArrowDown: [1, 0, 1],
      ArrowLeft: [-1, -1, 0],
      ArrowUp: [-1, 0, -1],
    };
    const arrow = arrows[k];
    if (arrow) {
      event.preventDefault();
      if (event.shiftKey) {
        nudge(i, arrow[1] * 12, arrow[2] * 12);
        return;
      }
      const next = mod(i + arrow[0], n);
      focusPrint(next);
      if (picked !== null && !busy.current) requestPick(next);
      return;
    }
    if (k === "Home" || k === "End") {
      event.preventDefault();
      const next = k === "Home" ? 0 : n - 1;
      focusPrint(next);
      if (picked !== null && !busy.current) requestPick(next);
    }
  };

  const onHover = (i: number, on: boolean) => {
    const p = poses[i];
    if (!p || picked === i || dragging === i || busy.current || !isSpilled)
      return;
    go(
      `${i}:lift`,
      animate(
        p.lift,
        on ? 0.32 : 0,
        motionSafe ? springs.flick : { duration: 0 },
      ),
    );
  };

  const onDragStart = (i: number) => {
    const p = poses[i];
    if (!p || busy.current || !isSpilled || picked !== null) return false;
    stopPrint(i);
    dragFrom.current = { x: p.x.get(), y: p.y.get(), lean: 0 };
    setDragging(i);
    setRaised((r) => [...r.filter((v) => v !== i), i]);
    go(
      `${i}:lift`,
      animate(p.lift, 1, motionSafe ? springs.flick : { duration: 0 }),
    );
    if (motionSafe) {
      go(`${i}:scale`, animate(p.scale, r3(lay.s0 * 1.04), springs.flick));
    }
    return true;
  };

  const onDragMove = (i: number, info: DragInfo) => {
    const p = poses[i];
    if (!p || busy.current) return;
    const from = dragFrom.current;
    const rawX = from.x + info.offset.x;
    const rawY = from.y + info.offset.y;
    const x =
      Math.abs(rawX) > lay.limX
        ? Math.sign(rawX) * lay.limX +
          rubberband(rawX - Math.sign(rawX) * lay.limX, lay.fw)
        : rawX;
    const y =
      Math.abs(rawY) > lay.limY
        ? Math.sign(rawY) * lay.limY +
          rubberband(rawY - Math.sign(rawY) * lay.limY, lay.fh)
        : rawY;
    p.x.set(r2(x));
    p.y.set(r2(y));
    if (motionSafe) {
      // The paper leans a little into its own speed, the way a print does
      // when it is pushed across glass.
      from.lean = from.lean * 0.8 + info.delta.x * 0.35;
      p.rotate.set(r2(homeOf(i).rot + clamp(from.lean, -6, 6)));
    }
  };

  const onDragEnd = (i: number, info: DragInfo | null) => {
    const p = poses[i];
    setDragging(null);
    // A gather that began mid-drag has the print already.
    if (!p || busy.current || !isSpilled) return;
    const home = homeOf(i);
    const vx = info && motionSafe ? info.velocity.x : 0;
    const vy = info && motionSafe ? info.velocity.y : 0;
    const x = r2(
      clamp(info ? project(p.x.get(), vx, 0.992) : home.x, -lay.limX, lay.limX),
    );
    const y = r2(
      clamp(info ? project(p.y.get(), vy, 0.992) : home.y, -lay.limY, lay.limY),
    );
    if (info) setHome(i, x, y);
    if (!motionSafe) {
      p.x.jump(x);
      p.y.jump(y);
      p.rotate.jump(home.rot);
      p.lift.jump(0);
      p.scale.jump(lay.s0);
      return;
    }
    go(`${i}:x`, animate(p.x, x, { ...springs.glide, velocity: vx }));
    go(`${i}:y`, animate(p.y, y, { ...springs.glide, velocity: vy }));
    go(`${i}:rotate`, animate(p.rotate, home.rot, springs.snap));
    go(`${i}:lift`, animate(p.lift, 0, springs.glide));
    go(`${i}:scale`, animate(p.scale, lay.s0, springs.glide));
  };

  /* -------------------------------- effects ------------------------------ */

  const api = React.useRef({
    settleAll,
    fire,
    gather,
    layoutPick,
    requestSpilled,
  });
  React.useEffect(() => {
    api.current = { settleAll, fire, gather, layoutPick, requestSpilled };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const box = root.getBoundingClientRect();
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      setGeo((g) => (g.w === w && g.h === h ? g : { w, h }));
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // A new layout (size, spread, count) puts every print straight where it
  // belongs; a burst in flight carries on to the new places by itself.
  React.useEffect(() => {
    if (!measured || busy.current) return;
    api.current.settleAll(laidOut.current);
    laidOut.current = true;
  }, [lay, measured]);

  // The held print, from a click, a key or the host.
  React.useEffect(() => {
    if (shownPick.current === picked) return;
    const before = shownPick.current;
    api.current.layoutPick(picked);
    shownPick.current = picked;
    if (before !== null && picked === null) lastTap.current = -1e9;
  }, [picked]);

  // Firing and gathering, from the trigger, the camera, a double click or
  // the host: the same choreography whichever asked.
  React.useEffect(() => {
    if (shownSpilled.current === isSpilled) return;
    shownSpilled.current = isSpilled;
    const byVisitor = visitor.current;
    visitor.current = false;
    if (isSpilled) api.current.fire(byVisitor);
    else api.current.gather(byVisitor);
  }, [isSpilled]);

  React.useEffect(() => {
    if (trigger === "manual" || !measured || disabled) return;
    if (autoFired.current) return;
    if (trigger === "mount") {
      autoFired.current = true;
      api.current.requestSpilled(true, false);
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        autoFired.current = true;
        api.current.requestSpilled(true, false);
      },
      { threshold: 0.35 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [trigger, measured, disabled]);

  React.useEffect(() => {
    const running = runs.current;
    const pending = timers;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending.current) window.clearTimeout(t);
      pending.current = [];
      busy.current = null;
    };
  }, []);

  /* --------------------------------- render ------------------------------ */

  const camW = Math.round(lay.cam * 1.45);
  const camH = lay.cam;
  const lens = Math.round(lay.cam * 0.7);
  const tabbable = clamp(focusIndex, 0, n - 1);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && picked !== null) {
          event.preventDefault();
          requestPick(null);
        }
      }}
      onClick={(event) => {
        const target = event.target as Element | null;
        if (target?.closest?.("[data-print],[data-camera]")) return;
        tap(null, event.timeStamp);
      }}
      className={cn(
        "relative isolate h-full w-full touch-manipulation overflow-clip rounded-3 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          "--shutter-spill-table": `color-mix(in oklab, ${light} 30%, var(--card))`,
          background: `radial-gradient(70% 60% at 50% 50%, color-mix(in oklab, ${light} 52%, var(--card)), color-mix(in oklab, ${light} 24%, var(--card)) 70%, color-mix(in oklab, ${light} 12%, var(--card)) 100%)`,
          boxShadow: `inset 0 0 0 1px var(--hairline), inset 0 0 48px color-mix(in oklab, black 14%, transparent)`,
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--hairline) 1px, transparent 1px), linear-gradient(to bottom, var(--hairline) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          backgroundPosition: "center",
          maskImage:
            "radial-gradient(75% 70% at 50% 50%, black 30%, transparent 100%)",
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: cam.flash,
          background: `radial-gradient(60% 55% at 50% 50%, color-mix(in oklab, ${light} 70%, white), transparent 70%)`,
          mixBlendMode: "screen",
        }}
      />

      {measured
        ? list.map((item, i) => {
            const pose = poses[i];
            if (!pose) return null;
            return (
              <Print
                key={i}
                index={i}
                n={n}
                item={item}
                pose={pose}
                lay={lay}
                seed={seed}
                z={zOf(i)}
                picked={picked === i}
                tabbable={i === tabbable}
                hidden={!isSpilled}
                disabled={disabled}
                numbered={numbered}
                register={register}
                onTap={tap}
                onActivate={togglePick}
                onKeyDown={onPrintKey}
                onHover={onHover}
                onDragStart={onDragStart}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
              />
            );
          })
        : null}

      <motion.button
        type="button"
        data-camera=""
        aria-label={
          isSpilled
            ? `Gather the ${frames(n)} into the camera`
            : `Fire a burst of ${frames(n)}`
        }
        disabled={disabled}
        onClick={() => requestSpilled(!isSpilled, true)}
        className={cn(
          "group/shutter-spill absolute top-1/2 left-1/2 rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{
          width: camW,
          height: camH,
          marginLeft: -camW / 2,
          marginTop: -camH / 2,
          scale: cam.scale,
          zIndex: 2 * n + 5,
        }}
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-3 transition-transform duration-150 group-hover/shutter-spill:-translate-y-px group-active/shutter-spill:scale-95"
          style={{
            background: CAMERA_BODY,
            boxShadow: `inset 0 1px 0 color-mix(in oklab, white 16%, transparent), 0 6px 14px -6px color-mix(in oklab, black 55%, transparent)`,
          }}
        >
          <span
            className="absolute rounded-1"
            style={{
              left: Math.round(camW * 0.12),
              top: -3,
              width: Math.round(camW * 0.2),
              height: 4,
              background: tone("--accent", 0.34, 0.01),
            }}
          />
          <motion.span
            className="absolute font-mono leading-none tabular-nums"
            style={{
              right: Math.round(camW * 0.07),
              top: Math.round(camH * 0.12),
              fontSize: 8,
              color: tone("--warn", 0.86, 0.06),
            }}
          >
            {countText}
          </motion.span>
          <span
            className="absolute top-1/2 left-1/2 overflow-hidden rounded-full"
            style={{
              width: lens,
              height: lens,
              marginLeft: -lens / 2,
              marginTop: -lens / 2,
              background: LENS_GLASS,
              boxShadow: LENS_RING,
            }}
          >
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{
                scale: cam.iris,
                background: tone("--accent", 0.08, 0.01),
              }}
            />
          </span>
          <motion.span
            className="absolute top-1/2 left-1/2 rounded-full"
            style={{
              width: lens,
              height: lens,
              marginLeft: -lens / 2,
              marginTop: -lens / 2,
              scale: popScale,
              opacity: popOpacity,
              background: `radial-gradient(circle, color-mix(in oklab, ${light} 60%, white), transparent 70%)`,
            }}
          />
        </span>
      </motion.button>
      <motion.p
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-ink-2 uppercase"
        style={{
          top: `calc(50% + ${Math.round(camH * 0.62 + 12)}px)`,
          opacity: cam.hint,
          zIndex: 2 * n + 4,
        }}
      >
        {frames(n)} · press to fire
      </motion.p>

      <p id={hintId} className="sr-only">
        The camera fires the frames onto the table or gathers them back. Arrow
        keys step through the frames, Enter picks one up and Escape puts it
        down; Shift with an arrow slides a frame across the table.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
