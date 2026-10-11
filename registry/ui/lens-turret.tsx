"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type LensTurretItem = {
  /** An image URL. Without one, a picture is drawn in code. */
  src?: string;
  /** What the picture shows. */
  alt: string;
  /** A short title for the projection's caption. */
  caption?: string;
};

export type LensTurretFinish = "black" | "chrome" | "brass";

export type LensTurretProps = {
  /** The pictures, one per lens; they repeat when there are fewer than lenses. @default six drawn pictures */
  items?: LensTurretItem[];
  /** How many lenses the turret carries, 3 to 6. @default 4 */
  lensCount?: number;
  /** How much the lenses smear when the turret spins, 0 to 1. @default 0.6 */
  blur?: number;
  /** How notchy the drag feels and how firmly a lens clicks into the gate, 0 to 1. @default 0.6 */
  detentStrength?: number;
  /** The lens in the gate (controlled). */
  value?: number;
  /** The lens in the gate to begin with. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, flick, click or key that brought a new lens to the gate. */
  onValueChange?: (index: number) => void;
  /** How soon a flick runs down, 0 (coasts) to 1 (stops short). @default 0.5 */
  friction?: number;
  /** The turret's metal. @default "black" */
  finish?: LensTurretFinish;
  /** Focal lengths engraved on the barrels, in millimetres. @default ["16", "25", "50", "75", "100", "135"] */
  focalLengths?: string[];
  /** Rack the projection into focus after each landing. @default true */
  focusRack?: boolean;
  /** Show the projected picture's caption. @default true */
  caption?: boolean;
  /** The turret's diameter, px. @default fitted to the box */
  turretSize?: number;
  /** Detent clicks as lenses pass and land, after a visitor's action. @default false */
  sound?: boolean;
  /** The turret's accessible name. @default "Lens turret" */
  label?: string;
  /** No turning. @default false */
  disabled?: boolean;
  /** Sizes the piece; it fills its parent by default (h-full w-full). */
  className?: string;
};

export const defaultLensTurretItems: LensTurretItem[] = [
  { alt: "A pale salt flat under a wide sky", caption: "Salt flats" },
  { alt: "Green ridges fading into haze", caption: "North ridge" },
  { alt: "A low sun rising over a still harbour", caption: "Harbour at dawn" },
  { alt: "Warm dunes under a high sun", caption: "Dune sea" },
  { alt: "A ferry light on a dark sea under the moon", caption: "Night ferry" },
  { alt: "Wet sand and shallow water at low tide", caption: "Low tide" },
];

const DEFAULT_FOCAL = ["16", "25", "50", "75", "100", "135"];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, n: number) => ((v % n) + n) % n;
/** Words as they sit inside a sentence: no full stop of their own to double. */
const bare = (text: string) => text.trim().replace(/[.!?]+$/, "");
/** An angle folded into (-180, 180]. */
const wrap = (deg: number) => mod(deg + 180, 360) - 180;

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

const KINDS = ["flats", "hills", "sea", "dunes", "night", "tide"] as const;

/** A landscape in gradients: the same picture in the glass and on the screen. */
function sceneArt(i: number): string {
  const kind = KINDS[i % KINDS.length] ?? "sea";
  const r = (k: number) => hash(i + 3, 5, k);
  const sx = Math.round(26 + r(1) * 48);
  const sy = Math.round(20 + r(2) * 14);
  const tw = Math.round((r(3) - 0.5) * 24);
  const vignette =
    "radial-gradient(130% 100% at 50% 45%, transparent 56%, color-mix(in oklab, black 26%, transparent) 100%)";
  let layers: string[];
  switch (kind) {
    case "flats":
      layers = [
        `linear-gradient(to bottom, transparent 63%, ${tone("--accent", 0.42, 0.03, tw)} 63% 64%, transparent 64%)`,
        `radial-gradient(circle at ${sx}% ${sy + 18}%, ${tone("--warn", 0.98, 0.03)} 0 3%, transparent 12%)`,
        `linear-gradient(to bottom, transparent 64%, ${tone("--warn", 0.9, 0.03, tw)} 64%, ${tone("--warn", 0.78, 0.04, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.76, 0.05, tw)}, ${tone("--accent", 0.94, 0.02, tw)} 64%)`,
      ];
      break;
    case "hills":
      layers = [
        `radial-gradient(80% 42% at 28% 100%, ${tone("--success", 0.36, 0.07, tw)} 0 98%, transparent 100%)`,
        `radial-gradient(70% 36% at 82% 100%, ${tone("--success", 0.44, 0.07, tw + 10)} 0 98%, transparent 100%)`,
        `radial-gradient(90% 40% at 60% 84%, ${tone("--success", 0.6, 0.05, tw + 30)} 0 98%, transparent 100%)`,
        `radial-gradient(circle at ${sx}% ${sy}%, ${tone("--warn", 0.97, 0.05)} 0 5%, ${tone("--warn", 0.9, 0.08, 0, 0.4)} 6%, transparent 18%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.74, 0.07, tw)}, ${tone("--success", 0.9, 0.04, tw + 60)} 80%)`,
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
    case "night":
      layers = [
        `radial-gradient(2% 14% at ${sx}% 78%, ${tone("--warn", 0.85, 0.12, 0, 0.8)}, transparent)`,
        `radial-gradient(circle at ${sx}% 64%, ${tone("--warn", 0.94, 0.12)} 0 0.8%, ${tone("--warn", 0.8, 0.14, 0, 0.5)} 1.4%, transparent 4%)`,
        `radial-gradient(circle at ${Math.round(10 + r(8) * 80)}% ${Math.round(8 + r(9) * 36)}%, ${tone("--accent", 0.95, 0.02)} 0 0.6%, transparent 1.2%)`,
        `radial-gradient(circle at ${Math.round(10 + r(6) * 80)}% ${Math.round(8 + r(7) * 36)}%, ${tone("--accent", 0.95, 0.02)} 0 0.6%, transparent 1.2%)`,
        `radial-gradient(circle at ${100 - sx}% ${sy}%, ${tone("--warn", 0.95, 0.03)} 0 5%, ${tone("--accent", 0.6, 0.05, 0, 0.35)} 6%, transparent 18%)`,
        `linear-gradient(to bottom, transparent 62%, ${tone("--accent", 0.22, 0.05, tw)} 62%, ${tone("--accent", 0.14, 0.04, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.16, 0.05, tw)}, ${tone("--accent", 0.32, 0.08, tw)} 62%)`,
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
    default:
      layers = [
        `radial-gradient(3% 16% at ${sx}% 76%, ${tone("--warn", 0.93, 0.07, 0, 0.8)}, transparent)`,
        `radial-gradient(circle at ${sx}% ${sy + 18}%, ${tone("--warn", 0.98, 0.04)} 0 4%, ${tone("--warn", 0.9, 0.09, 0, 0.5)} 5%, transparent 20%)`,
        `linear-gradient(to bottom, transparent 60%, ${tone("--accent", 0.46, 0.07, tw)} 60%, ${tone("--accent", 0.26, 0.05, tw)} 100%)`,
        `linear-gradient(to bottom, ${tone("--accent", 0.6, 0.08, tw - 30)}, ${tone("--warn", 0.86, 0.08, -10)} 58%, ${tone("--warn", 0.93, 0.06)} 60%)`,
      ];
  }
  return [vignette, ...layers].join(", ");
}

type Metal = {
  plate: string;
  knurlA: string;
  knurlB: string;
  barrel: string;
  ring: string;
  engrave: string;
  hub: string;
};

const METAL = (finish: LensTurretFinish): Metal => {
  if (finish === "chrome") {
    return {
      plate: `conic-gradient(from 210deg, color-mix(in oklab, white 30%, transparent), transparent 14%, transparent 48%, color-mix(in oklab, white 22%, transparent) 56%, transparent 70%), radial-gradient(circle at 36% 30%, ${tone("--accent", 0.9, 0.008)}, ${tone("--accent", 0.72, 0.01)} 60%, ${tone("--accent", 0.54, 0.012)})`,
      knurlA: tone("--accent", 0.82, 0.008),
      knurlB: tone("--accent", 0.6, 0.01),
      barrel: `conic-gradient(from 200deg, ${tone("--accent", 0.92, 0.008)}, ${tone("--accent", 0.6, 0.01)} 25%, ${tone("--accent", 0.88, 0.008)} 50%, ${tone("--accent", 0.55, 0.01)} 75%, ${tone("--accent", 0.92, 0.008)})`,
      ring: tone("--accent", 0.3, 0.01),
      engrave: tone("--accent", 0.22, 0.01),
      hub: tone("--accent", 0.82, 0.008),
    };
  }
  if (finish === "brass") {
    return {
      plate: `conic-gradient(from 210deg, color-mix(in oklab, white 22%, transparent), transparent 14%, transparent 48%, color-mix(in oklab, white 14%, transparent) 56%, transparent 70%), radial-gradient(circle at 36% 30%, ${tone("--warn", 0.82, 0.08, -8)}, ${tone("--warn", 0.64, 0.09, -10)} 60%, ${tone("--warn", 0.46, 0.08, -12)})`,
      knurlA: tone("--warn", 0.74, 0.08, -8),
      knurlB: tone("--warn", 0.5, 0.08, -12),
      barrel: `conic-gradient(from 200deg, ${tone("--warn", 0.86, 0.07, -8)}, ${tone("--warn", 0.56, 0.08, -12)} 25%, ${tone("--warn", 0.8, 0.07, -8)} 50%, ${tone("--warn", 0.5, 0.08, -12)} 75%, ${tone("--warn", 0.86, 0.07, -8)})`,
      ring: tone("--warn", 0.26, 0.04, -12),
      engrave: tone("--warn", 0.22, 0.04, -12),
      hub: tone("--warn", 0.74, 0.08, -8),
    };
  }
  return {
    plate: `conic-gradient(from 210deg, color-mix(in oklab, white 10%, transparent), transparent 14%, transparent 48%, color-mix(in oklab, white 7%, transparent) 56%, transparent 70%), radial-gradient(circle at 36% 30%, ${tone("--accent", 0.34, 0.012)}, ${tone("--accent", 0.22, 0.012)} 60%, ${tone("--accent", 0.14, 0.01)})`,
    knurlA: tone("--accent", 0.34, 0.01),
    knurlB: tone("--accent", 0.16, 0.01),
    barrel: `conic-gradient(from 200deg, ${tone("--accent", 0.8, 0.008)}, ${tone("--accent", 0.42, 0.01)} 25%, ${tone("--accent", 0.74, 0.008)} 50%, ${tone("--accent", 0.36, 0.01)} 75%, ${tone("--accent", 0.8, 0.008)})`,
    ring: tone("--accent", 0.12, 0.01),
    engrave: tone("--accent", 0.86, 0.01),
    hub: tone("--accent", 0.4, 0.01),
  };
};

const GLASS_SHINE =
  "radial-gradient(70% 45% at 34% 22%, color-mix(in oklab, white 38%, transparent), transparent 70%), radial-gradient(circle at 50% 50%, transparent 58%, color-mix(in oklab, black 45%, transparent) 100%)";

type Geo = {
  w: number;
  h: number;
  D: number;
  cx: number;
  cy: number;
  rho: number;
  lens: number;
};

function geometryOf(
  w: number,
  h: number,
  n: number,
  turretSize: number | undefined,
): Geo {
  const D = Math.round(
    clamp(turretSize ?? Math.min(w * 0.6, h * 0.5), 120, 360),
  );
  const pad = Math.round(clamp(h * 0.04, 10, 24));
  const rho = D * 0.28;
  const lens = Math.round(Math.min(D * 0.36, ((2 * Math.PI * rho) / n) * 0.84));
  return {
    w,
    h,
    D,
    cx: Math.round(w / 2),
    cy: Math.round(h - D / 2 - pad),
    rho: r2(rho),
    lens,
  };
}

/** How squarely lens `i` sits in the gate at turret angle `a`, 0 to 1. */
const gateWeight = (a: number, i: number, slot: number) => {
  const d = Math.abs(wrap(a + i * slot)) / (slot * 0.5);
  const t = clamp(1 - d, 0, 1);
  return t * t * (3 - 2 * t);
};

function ProjectionLayer({
  item,
  index,
  art,
  slot,
  angle,
  reduced,
}: {
  item: LensTurretItem;
  index: number;
  art: number;
  slot: number;
  angle: MotionValue<number>;
  reduced: boolean;
}) {
  const opacity = useTransform(angle, (a) => r3(gateWeight(a, index, slot)));
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0"
      style={{
        opacity,
        backgroundImage: item.src ? undefined : sceneArt(art),
        backgroundSize: "cover",
        backgroundPosition: "center",
        transition: reduced ? "opacity 240ms ease-out" : undefined,
      }}
    >
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt=""
          draggable={false}
          className="size-full object-cover"
        />
      ) : null}
    </motion.div>
  );
}

function CaptionLine({
  text,
  index,
  slot,
  angle,
}: {
  text: string;
  index: number;
  slot: number;
  angle: MotionValue<number>;
}) {
  const opacity = useTransform(angle, (a) =>
    r3(Math.pow(gateWeight(a, index, slot), 2)),
  );
  return (
    <motion.span
      className="col-start-1 row-start-1 truncate"
      style={{ opacity }}
    >
      {text}
    </motion.span>
  );
}

/**
 * A rotating lens turret, the kind an old cine camera carried: a machined
 * plate with `lensCount` lenses, each holding a picture in its glass, and a
 * gate at twelve o'clock. Behind it the lens in the gate is projected large,
 * every picture's layer weighted by how squarely its lens sits in the gate, so
 * a spin flickers through them like a projector and the lamp's bare light
 * shows between lenses.
 *
 * A drag turns the turret 1:1 around its centre through a sine detent field
 * (`detentStrength`), so it feels notched. A flick coasts on an exponential
 * run-down set by `friction` while the lenses smear (two ghost images and a
 * soft glass, by `blur`), then a detent spring — stiffer and less damped as
 * `detentStrength` rises — catches the next lens and clicks it into the gate
 * with the coast's velocity. The projection then racks into focus.
 *
 * It is a slider: arrow keys turn one lens at a time, Home and End the first
 * and last, and a click on a lens turns it in. Under reduced motion the
 * turret jumps lens to lens and the projection cross-fades; a drag still
 * turns it under the finger.
 */
export function LensTurret({
  items,
  lensCount = 4,
  blur = 0.6,
  detentStrength = 0.6,
  value,
  defaultValue = 0,
  onValueChange,
  friction = 0.5,
  finish = "black",
  focalLengths = DEFAULT_FOCAL,
  focusRack = true,
  caption = true,
  turretSize,
  sound = false,
  label = "Lens turret",
  disabled = false,
  className,
}: LensTurretProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = items && items.length > 0 ? items : defaultLensTurretItems;
  const n = Math.round(clamp(lensCount, 3, 6));
  const slot = 360 / n;
  const lenses = React.useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        const item = list[i % list.length] ?? { alt: "" };
        return { item, art: i % list.length };
      }),
    [list, n],
  );
  const focalOf = (i: number) =>
    focalLengths[i % Math.max(1, focalLengths.length)] ?? "50";

  const controlled = value !== undefined;
  const [own, setOwn] = React.useState(() => mod(Math.round(defaultValue), n));
  const current = mod(Math.round(controlled ? value : own), n);

  const angle = useMotionValue(-current * slot);
  const rack = useMotionValue(0);
  const velocity = useVelocity(angle);

  const [geo, setGeo] = React.useState({ w: 0, h: 0 });
  const g = geometryOf(geo.w || 720, geo.h || 520, n, turretSize);
  const metal = METAL(finish);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const turretRef = React.useRef<HTMLDivElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const rackRun = React.useRef<AnimationPlaybackControls | null>(null);
  const coastRaf = React.useRef(0);
  const seat = React.useRef(0);
  const shown = React.useRef(current);
  const lastGate = React.useRef(Math.round(current));
  const grip = React.useRef({ raw: 0, prev: 0, centre: { x: 0, y: 0 } });
  const tracker = React.useRef(createVelocityTracker(90));
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const strength = clamp(detentStrength, 0, 1);
  const stiffness = lerp(160, 900, strength);
  const ratio = lerp(0.92, 0.42, strength);
  const detentSpring = {
    type: "spring" as const,
    stiffness,
    damping: 2 * ratio * Math.sqrt(stiffness),
    mass: 1,
  };

  /** The notched feel: the shown angle is pulled toward each lens position. */
  const field = (raw: number) =>
    raw -
    ((strength * 0.85 * slot) / (2 * Math.PI)) *
      Math.sin((2 * Math.PI * raw) / slot);

  const gateIndexOf = (a: number) => mod(Math.round(-a / slot), n);

  const tick = (a: number, speed: number, byVisitor: boolean) => {
    const gate = Math.round(-a / slot);
    if (gate === lastGate.current) return;
    lastGate.current = gate;
    if (!byVisitor) return;
    const fast = clamp(Math.abs(speed) / 900, 0, 1);
    audio.play("detent", {
      pitch: r2(1 + 0.25 * fast),
      gain: r2(0.55 - 0.25 * fast),
    });
  };

  const stopAll = () => {
    running.current?.stop();
    running.current = null;
    window.clearTimeout(seat.current);
    if (coastRaf.current) cancelAnimationFrame(coastRaf.current);
    coastRaf.current = 0;
  };

  const blurOut = () => {
    if (!motionSafe || !focusRack) return;
    rackRun.current?.stop();
    rackRun.current = animate(rack, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
  };

  const commit = (index: number) => {
    const next = mod(index, n);
    if (next === current) return;
    if (!controlled) setOwn(next);
    shown.current = next;
    onValueChange?.(next);
    const item = lenses[next]?.item;
    setSaid((s) => ({
      n: s.n + 1,
      text: `Lens ${next + 1} of ${n}, ${focalOf(next)} mm${item?.caption ? `, ${bare(item.caption)}` : ""}.`,
    }));
  };

  /** The landing: a detent spring into the gate, then the focus rack. */
  const land = (
    target: number,
    v: number,
    byVisitor: boolean,
    ticks = true,
  ) => {
    stopAll();
    if (!motionSafe) {
      angle.jump(target);
      lastGate.current = Math.round(-target / slot);
      if (byVisitor) audio.play("detent", { pitch: 0.8, gain: 0.7 });
      return;
    }
    const c = animate(angle, target, {
      ...detentSpring,
      velocity: v,
      restDelta: 0.05,
      onUpdate: (a) => {
        if (ticks) tick(a, velocity.get(), byVisitor);
        else lastGate.current = Math.round(-a / slot);
      },
      onComplete: () => {
        if (running.current !== c) return;
        running.current = null;
        if (focusRack) {
          rackRun.current?.stop();
          rackRun.current = animate(rack, 0, {
            duration: 0.36,
            ease: easings.enter,
          });
        }
      },
    });
    running.current = c;
    // The click is heard as the lens seats, a beat into the spring.
    if (byVisitor) {
      seat.current = window.setTimeout(
        () => audio.play("detent", { pitch: 0.8, gain: 0.7 }),
        Math.round(lerp(150, 70, strength)),
      );
    }
  };

  /** A flick: run down on friction, then the detent catches the next lens. */
  const coast = (v0: number) => {
    stopAll();
    blurOut();
    const tau = lerp(0.9, 0.2, clamp(friction, 0, 1));
    const catchAt = lerp(90, 280, strength);
    let v = v0;
    let last = 0;
    const step = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const a = angle.get() + v * dt;
      v *= Math.exp(-dt / tau);
      angle.set(r2(a));
      tick(a, v, true);
      if (Math.abs(v) < catchAt) {
        coastRaf.current = 0;
        const ahead =
          Math.abs(v) < 20
            ? Math.round(a / slot)
            : v > 0
              ? Math.ceil(a / slot - 0.12)
              : Math.floor(a / slot + 0.12);
        const target = ahead * slot;
        commit(gateIndexOf(target));
        land(target, v, true);
        return;
      }
      coastRaf.current = requestAnimationFrame(step);
    };
    coastRaf.current = requestAnimationFrame(step);
  };

  /** Turns lens `index` into the gate the shortest way. */
  const turnTo = (index: number, byVisitor: boolean) => {
    const a = angle.get();
    const target = a + wrap(-index * slot - a);
    if (motionSafe) blurOut();
    commit(index);
    land(r2(target), 0, byVisitor, false);
  };

  /** One lens on from the committed one, in turn order, even mid-spring. */
  const step = (delta: number) => {
    if (disabled) return;
    const a = angle.get();
    const base = a + wrap(-current * slot - a);
    const target = r2(base - delta * slot);
    if (motionSafe) blurOut();
    commit(current + delta);
    land(target, 0, true, false);
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      stopAll();
      blurOut();
      const box = turretRef.current?.getBoundingClientRect();
      const centre = box
        ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
        : { x: point.x, y: point.y + 1 };
      const a0 = angle.get();
      grip.current = {
        raw: a0,
        prev:
          (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI,
        centre,
      };
      tracker.current.reset();
      tracker.current.push(a0, 0, performance.now());
    },
    onMove: ({ point }) => {
      const gr = grip.current;
      const now =
        (Math.atan2(point.y - gr.centre.y, point.x - gr.centre.x) * 180) /
        Math.PI;
      gr.raw += wrap(now - gr.prev);
      gr.prev = now;
      tracker.current.push(gr.raw, 0, performance.now());
      const a = r2(field(gr.raw));
      angle.set(a);
      tick(a, velocity.get(), true);
    },
    onEnd: () => {
      tracker.current.push(grip.current.raw, 0, performance.now());
      const v = tracker.current.velocity().x;
      if (!motionSafe || Math.abs(v) < 120) {
        const target = Math.round(angle.get() / slot) * slot;
        commit(gateIndexOf(target));
        land(target, motionSafe ? v : 0, true);
        return;
      }
      coast(v);
    },
    onCancel: () => {
      const target = Math.round(angle.get() / slot) * slot;
      commit(gateIndexOf(target));
      land(target, 0, false);
    },
    onTap: (event) => {
      const el = (event.target as Element | null)?.closest?.("[data-lens]");
      const index = el ? Number(el.getAttribute("data-lens")) : NaN;
      if (Number.isFinite(index)) turnTo(index, true);
    },
  });

  /* -------------------------------- effects ------------------------------ */

  const api = React.useRef({ turnTo });
  React.useEffect(() => {
    api.current = { turnTo };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const box = root.getBoundingClientRect();
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      setGeo((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // A host that changes `value` gets the same turn a key would, silently.
  React.useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    api.current.turnTo(current, false);
  }, [current]);

  // A new lens count re-seats the turret on the lens in the gate.
  React.useEffect(() => {
    running.current?.stop();
    running.current = null;
    angle.jump(-shown.current * slot);
    lastGate.current = shown.current;
  }, [slot, angle]);

  React.useEffect(
    () => () => {
      running.current?.stop();
      rackRun.current?.stop();
      window.clearTimeout(seat.current);
      if (coastRaf.current) cancelAnimationFrame(coastRaf.current);
    },
    [],
  );

  /* ---------------------------- derived values --------------------------- */

  const speed = useTransform(velocity, (v) => clamp(Math.abs(v) / 700, 0, 1));
  const b = clamp(blur, 0, 1);
  const ghostA = useTransform(
    [angle, velocity] as MotionValue<number>[],
    ([a, v]) => r2((a as number) - (v as number) * 0.02 * b),
  );
  const ghostB = useTransform(
    [angle, velocity] as MotionValue<number>[],
    ([a, v]) => r2((a as number) - (v as number) * 0.04 * b),
  );
  const ghostOpacityA = useTransform(speed, (s) => r3(s * 0.38 * b));
  const ghostOpacityB = useTransform(speed, (s) => r3(s * 0.2 * b));
  const glassBlur = useTransform(speed, (s) => {
    const px = Math.round(s * 3 * b * 4) / 4;
    return px >= 0.25 ? `blur(${px}px)` : "none";
  });
  const smear = useTransform(speed, (s) => r3(s * 0.9));
  const lamp = useTransform(angle, (a) => {
    let best = 0;
    for (let i = 0; i < n; i += 1)
      best = Math.max(best, gateWeight(a, i, slot));
    return r3(1 - best);
  });
  const projectionFilter = useTransform(rack, (k) =>
    k > 0.02 ? `blur(${r2(k * 6)}px)` : "none",
  );
  const projectionScale = useTransform(rack, (k) => r3(1 + k * 0.02));

  const lensNodes = (ghost: boolean) =>
    lenses.map(({ item, art }, i) => {
      const a = (i * slot * Math.PI) / 180;
      const x = r2(g.D / 2 + Math.sin(a) * g.rho - g.lens / 2);
      const y = r2(g.D / 2 - Math.cos(a) * g.rho - g.lens / 2);
      const glass = Math.round(g.lens * 0.66);
      const pathId = `${uid}-barrel-${i}`;
      const tr = r2(g.lens / 2 - 5);
      return (
        <span
          key={i}
          data-lens={ghost ? undefined : i}
          className="absolute block rounded-full"
          style={{
            left: x,
            top: y,
            width: g.lens,
            height: g.lens,
            background: ghost ? undefined : metal.barrel,
            boxShadow: ghost
              ? undefined
              : `0 3px 8px -2px color-mix(in oklab, black 55%, transparent), inset 0 0 0 1px color-mix(in oklab, black 30%, transparent)`,
          }}
        >
          {ghost ? null : (
            <svg
              aria-hidden
              width={g.lens}
              height={g.lens}
              viewBox={`0 0 ${g.lens} ${g.lens}`}
              className="pointer-events-none absolute inset-0"
              style={{ transform: `rotate(${r2(i * slot)}deg)` }}
            >
              <defs>
                <path
                  id={pathId}
                  d={`M ${r2(g.lens / 2 - tr)} ${r2(g.lens / 2)} a ${tr} ${tr} 0 1 1 ${r2(tr * 2)} 0`}
                />
              </defs>
              <text
                fontSize={Math.round(clamp(g.lens * 0.1, 6, 8))}
                fontFamily="var(--font-mono)"
                letterSpacing="0.08em"
                fill={metal.engrave}
              >
                <textPath
                  href={`#${pathId}`}
                  startOffset="50%"
                  textAnchor="middle"
                >
                  {`${focalOf(i)} mm`}
                </textPath>
              </text>
            </svg>
          )}
          <motion.span
            className="absolute top-1/2 left-1/2 block overflow-hidden rounded-full"
            style={{
              width: glass,
              height: glass,
              marginLeft: -glass / 2,
              marginTop: -glass / 2,
              boxShadow: ghost ? undefined : `0 0 0 2px ${metal.ring}`,
              filter: ghost ? undefined : glassBlur,
            }}
          >
            {/* The picture turns with its lens; it is set in the glass so
                that it stands upright when its lens reaches the gate. */}
            <span
              className="absolute inset-0 block"
              style={{
                backgroundImage: item.src
                  ? `url("${item.src}")`
                  : sceneArt(art),
                backgroundSize: "cover",
                backgroundPosition: "center",
                transform: `rotate(${r2(i * slot)}deg)`,
              }}
            />
            {ghost ? null : (
              <span
                className="absolute inset-0 rounded-full"
                style={{ background: GLASS_SHINE }}
              />
            )}
          </motion.span>
        </span>
      );
    });

  const item = lenses[current]?.item;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      className={cn(
        "relative isolate h-full w-full overflow-clip rounded-3 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ background: tone("--accent", 0.16, 0.01) }}
    >
      {/* The projection: every lens's picture, weighted by the gate. */}
      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`${current + 1} of ${n}: ${item?.caption ?? item?.alt ?? ""}`}
        className="absolute inset-0"
      >
        <span role="img" aria-label={item?.alt ?? ""} className="sr-only" />
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={{ filter: projectionFilter, scale: projectionScale }}
        >
          {lenses.map(({ item: it, art }, i) => (
            <ProjectionLayer
              key={i}
              item={it}
              index={i}
              art={art}
              slot={slot}
              angle={angle}
              reduced={!motionSafe}
            />
          ))}
          <motion.div
            className="absolute inset-0"
            style={{
              opacity: lamp,
              background: `radial-gradient(60% 55% at 50% 40%, ${tone("--warn", 0.9, 0.05)}, ${tone("--warn", 0.5, 0.04)} 70%, ${tone("--warn", 0.3, 0.03)})`,
            }}
          />
        </motion.div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in oklab, black 30%, transparent), transparent 26%), radial-gradient(120% 90% at 50% 38%, transparent 55%, color-mix(in oklab, black 34%, transparent) 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: g.D + 40,
            background:
              "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--card) 82%, transparent) 62%, var(--card))",
          }}
        />
      </div>

      {caption ? (
        <p
          aria-hidden
          className="pointer-events-none absolute top-3 right-4 left-4 flex min-w-0 flex-col gap-0.5"
        >
          <span className="grid font-mono text-[10px] tracking-[0.08em] text-primary-foreground/85 uppercase [text-shadow:0_1px_2px_color-mix(in_oklab,black_50%,transparent)]">
            {lenses.map((_, i) => (
              <CaptionLine
                key={i}
                index={i}
                slot={slot}
                angle={angle}
                text={`Lens ${i + 1} · ${focalOf(i)} mm`}
              />
            ))}
          </span>
          <span className="grid text-sm font-medium text-primary-foreground [text-shadow:0_1px_3px_color-mix(in_oklab,black_55%,transparent)]">
            {lenses.map(({ item: it }, i) => (
              <CaptionLine
                key={i}
                index={i}
                slot={slot}
                angle={angle}
                text={it.caption ?? it.alt}
              />
            ))}
          </span>
        </p>
      ) : null}

      {/* The gate: a fixed notch over the turret's twelve o'clock. */}
      <span
        aria-hidden
        className="pointer-events-none absolute block"
        style={{
          left: g.cx - 6,
          top: g.cy - g.D / 2 - 9,
          width: 12,
          height: 8,
          clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          background: tone("--warn", 0.86, 0.1),
          zIndex: 3,
        }}
      />

      <div
        ref={turretRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={current + 1}
        aria-valuetext={`Lens ${current + 1} of ${n}, ${focalOf(current)} mm${item ? `, ${item.caption ?? item.alt}` : ""}`}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          const k = event.key;
          if (k === "ArrowRight" || k === "ArrowUp") {
            event.preventDefault();
            step(1);
          } else if (k === "ArrowLeft" || k === "ArrowDown") {
            event.preventDefault();
            step(-1);
          } else if (k === "Home" || k === "End") {
            event.preventDefault();
            if (!disabled) turnTo(k === "Home" ? 0 : n - 1, true);
          }
        }}
        {...drag}
        className={cn(
          "absolute touch-none rounded-full outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          left: g.cx - g.D / 2,
          top: g.cy - g.D / 2,
          width: g.D,
          height: g.D,
          zIndex: 2,
        }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            rotate: angle,
            background: metal.plate,
            boxShadow:
              "0 14px 30px -12px color-mix(in oklab, black 60%, transparent), inset 0 0 0 1px color-mix(in oklab, white 10%, transparent)",
          }}
        >
          {/* The knurled rim, and its smear at speed. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: `repeating-conic-gradient(${metal.knurlA} 0deg 2deg, ${metal.knurlB} 2deg 4deg)`,
              maskImage:
                "radial-gradient(circle, transparent calc(50% - 7px), black calc(50% - 6px), black calc(50% - 1px), transparent 50%)",
            }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              opacity: smear,
              background: metal.knurlA,
              maskImage:
                "radial-gradient(circle, transparent calc(50% - 7px), black calc(50% - 6px), black calc(50% - 1px), transparent 50%)",
            }}
          />
          {lensNodes(false)}
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 block rounded-full"
            style={{
              width: Math.round(g.D * 0.13),
              height: Math.round(g.D * 0.13),
              marginLeft: -Math.round(g.D * 0.13) / 2,
              marginTop: -Math.round(g.D * 0.13) / 2,
              background: `radial-gradient(circle at 40% 35%, color-mix(in oklab, white 30%, ${metal.hub}), ${metal.hub} 60%, color-mix(in oklab, black 40%, ${metal.hub}))`,
              boxShadow:
                "0 1px 3px color-mix(in oklab, black 50%, transparent)",
            }}
          >
            <span
              className="absolute top-1/2 right-[22%] left-[22%] h-px"
              style={{
                background: "color-mix(in oklab, black 55%, transparent)",
              }}
            />
          </span>
        </motion.div>
        {/* The streak a spin leaves: two ghosts of the glass, trailing. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ rotate: ghostA, opacity: ghostOpacityA }}
        >
          {lensNodes(true)}
        </motion.div>
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ rotate: ghostB, opacity: ghostOpacityB }}
        >
          {lensNodes(true)}
        </motion.div>
        {/* The gate's frame round the lens at twelve o'clock. */}
        <span
          aria-hidden
          className="pointer-events-none absolute block rounded-full"
          style={{
            left: r2(g.D / 2 - g.lens / 2 - 3),
            top: r2(g.D / 2 - g.rho - g.lens / 2 - 3),
            width: g.lens + 6,
            height: g.lens + 6,
            boxShadow: `0 0 0 1.5px ${tone("--warn", 0.86, 0.1, 0, 0.85)}, 0 0 14px ${tone("--warn", 0.8, 0.12, 0, 0.35)}`,
          }}
        />
      </div>

      <p id={hintId} className="sr-only">
        Drag or flick the turret, or use the arrow keys to turn it one lens at a
        time; the lens in the gate is projected behind it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
