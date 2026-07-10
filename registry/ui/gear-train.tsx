"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { angleDelta, clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Total drive-gear travel for value 0 → 100: 2.5 full turns. */
const DRIVE_TRAVEL_DEG = 900;
const DEG_PER_VALUE = DRIVE_TRAVEL_DEG / 100;
/** The idler sits this far below the drive/output line (line-of-centers angle). */
const MESH_DROP_DEG = 14;
/** Tooth extents in modules — one module is a pixel of pitch diameter per tooth. */
const ADDENDUM = 0.9;
const DEDENDUM = 1.1;
/** Trapezoid flank half-widths, as fractions of one angular tooth pitch. */
const HALF_ROOT = 0.3;
const HALF_TIP = 0.17;
/** Quarter dial: sweep angles (screen degrees, −90 is straight up). */
const ARC_START = -110;
const ARC_END = -20;
/** Gauge arc clearance beyond the output rim, in modules. */
const GAUGE_CLEAR = 3;
/** End numerals sit this many degrees outside the sweep, on the arc circle. */
const LABEL_SWING = 8;
const GAUGE_TICKS = [0, 25, 50, 75, 100] as const;
/** Release momentum: projection window (s) and carry cap (drive degrees). */
const MOMENTUM_WINDOW = 0.25;
const MAX_CARRY_DEG = 225;
/** Overdrag past a rail approaches this many drive degrees, asymptotically. */
const OVERDRAG_DEG = 36;
/** Pointer samples this close to a hub are dropped — atan2 flips too fast. */
const DEAD_ZONE_PX = 10;
/** Keyboard steps, in value units. */
const KEY_STEP = 2;
const KEY_PAGE = 10;
/** Frame paddings and the tooth-count label row, px. */
const PAD = 10;
const LABEL_H = 16;
const RIGHT_PAD = 20;
const MIN_HEIGHT = 120;
/** The jewel rests at this opacity between tooth ticks. */
const JEWEL_IDLE = 0.3;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const px = (n: number): number => Number(n.toFixed(2));
const wrap01 = (n: number): number => ((n % 1) + 1) % 1;
const clampTeeth = (n: number): number => clamp(Math.round(n), 6, 60);

type Point = { x: number; y: number };

/** Point at `deg` on a circle around `c` — screen coords, +deg is clockwise. */
const polar = (c: Point, r: number, deg: number): Point => ({
  x: px(c.x + Math.cos(rad(deg)) * r),
  y: px(c.y + Math.sin(rad(deg)) * r),
});

/** Root-circle radius for a gear — where the tooth gaps bottom out. */
const rootRadius = (teeth: number, pitchRadius: number): number =>
  Math.max(2, pitchRadius - DEDENDUM * ((2 * pitchRadius) / teeth));

/** Asymptotic end-stop: the overshoot approaches OVERDRAG_DEG, never reaches it. */
const resist = (over: number): number =>
  (OVERDRAG_DEG * over) / (over + OVERDRAG_DEG);

/**
 * Rest phase for gear B so its teeth interleave with meshed gear A.
 *
 * Measure what A presents at the mesh point as a fraction of one tooth pitch:
 * fA = ((φ − ψA) / pitchA) mod 1, where φ is the world angle of the line of
 * centers from A to B — 0 means a tooth center faces the mesh, 0.5 a gap
 * center. B faces the same point from φ + 180°, and interleaving demands the
 * complement, fB = (0.5 − fA) mod 1: B's tooth fills A's gap (the half-tooth
 * offset, generalized to any mesh angle). Solving
 * ((φ + 180 − ψB) / pitchB) mod 1 = fB for ψB gives the return value.
 *
 * The lock survives motion by construction: gear i turns kᵢ degrees per drive
 * degree and adjacent gears satisfy kA·teethA = −kB·teethB, so
 * d(fA)/da = −kA/pitchA and d(fB)/da = −kB/pitchB cancel — fA + fB holds 0.5
 * for every drive angle, and the teeth stay interleaved while the train runs.
 */
const meshPhase = (
  phaseA: number,
  teethA: number,
  teethB: number,
  meshDeg: number,
): number => {
  const fA = wrap01((meshDeg - phaseA) / (360 / teethA));
  const fB = wrap01(0.5 - fA);
  return meshDeg + 180 - fB * (360 / teethB);
};

/**
 * Silhouette of a spur gear as one closed path: `teeth` trapezoidal teeth on
 * a ring between the root and tip circles. Addendum and dedendum scale with
 * the module, so gears cut at the same module mesh with compatible teeth.
 * Tooth 0 is centered on local +x — the reference `meshPhase` solves against.
 * Flanks taper from ±0.30 of a pitch at the root to ±0.17 at the tip; arcs
 * walk the tip land and the gap floor. Pure trig, deterministic to 2 decimals.
 */
const gearPath = (teeth: number, pitchRadius: number): string => {
  const mod = (2 * pitchRadius) / teeth;
  const tip = pitchRadius + ADDENDUM * mod;
  const root = rootRadius(teeth, pitchRadius);
  const pitch = 360 / teeth;
  const pt = (r: number, deg: number): string =>
    `${px(Math.cos(rad(deg)) * r)} ${px(Math.sin(rad(deg)) * r)}`;
  const tipArc = `A ${px(tip)} ${px(tip)} 0 0 1`;
  const rootArc = `A ${px(root)} ${px(root)} 0 0 1`;
  const start = pt(root, -pitch * HALF_ROOT);
  const parts = [`M ${start}`];
  for (let k = 0; k < teeth; k += 1) {
    const c = k * pitch;
    if (k > 0) parts.push(`${rootArc} ${pt(root, c - pitch * HALF_ROOT)}`);
    parts.push(
      `L ${pt(tip, c - pitch * HALF_TIP)}`,
      `${tipArc} ${pt(tip, c + pitch * HALF_TIP)}`,
      `L ${pt(root, c + pitch * HALF_ROOT)}`,
    );
  }
  parts.push(`${rootArc} ${start}`, "Z");
  return parts.join(" ");
};

type TrainLayout = {
  /** Shared module, px — meshing gears must agree on it. */
  m: number;
  centers: [Point, Point, Point];
  pitchR: [number, number, number];
  outerR: [number, number, number];
  /** Rest phases from `meshPhase`, so teeth interleave at value 0. */
  phases: [number, number, number];
  /** Rotation per drive degree: 1, −t0/t1 (counter), +t0/t2 (counter-counter). */
  ratios: [number, number, number];
  width: number;
  labelY: number;
  gaugeR: number;
  needleLen: number;
};

/**
 * Solve the bench in module units first — pitch radius is teeth/2 modules, so
 * radius is proportional to tooth count — then scale one module to fill the
 * box height. Pitch circles are tangent: each center sits exactly the sum of
 * pitch radii from the last, the idler dropped by MESH_DROP_DEG and the
 * output raised back, so the train reads as a mounted mechanism rather than a
 * row. The quarter dial shares the output axle, its arc GAUGE_CLEAR modules
 * past the output rim.
 */
const layoutTrain = (
  teeth: [number, number, number],
  height: number,
): TrainLayout => {
  const [t0, t1, t2] = teeth;
  const rho: [number, number, number] = [t0 / 2, t1 / 2, t2 / 2];
  const out: [number, number, number] = [
    rho[0] + ADDENDUM,
    rho[1] + ADDENDUM,
    rho[2] + ADDENDUM,
  ];
  const drop = rad(MESH_DROP_DEG);
  const u0: Point = { x: 0, y: 0 };
  const u1: Point = {
    x: (rho[0] + rho[1]) * Math.cos(drop),
    y: (rho[0] + rho[1]) * Math.sin(drop),
  };
  const u2: Point = {
    x: u1.x + (rho[1] + rho[2]) * Math.cos(drop),
    y: u1.y - (rho[1] + rho[2]) * Math.sin(drop),
  };
  const gaugeU = out[2] + GAUGE_CLEAR;
  const top = Math.min(u0.y - out[0], u1.y - out[1], u2.y - gaugeU);
  const bottom = Math.max(u0.y + out[0], u1.y + out[1], u2.y + out[2]);
  const left = u0.x - out[0];
  const right = Math.max(
    u2.x + out[2],
    u2.x + gaugeU * Math.cos(rad(ARC_END + LABEL_SWING)),
  );
  const m = Math.max(1.5, (height - PAD * 2 - LABEL_H) / (bottom - top));
  const ox = PAD - left * m;
  const oy = PAD - top * m;
  const place = (u: Point): Point => ({ x: px(ox + u.x * m), y: px(oy + u.y * m) });
  const psi1 = meshPhase(0, t0, t1, MESH_DROP_DEG);
  const psi2 = meshPhase(psi1, t1, t2, -MESH_DROP_DEG);
  return {
    m,
    centers: [place(u0), place(u1), place(u2)],
    pitchR: [px(rho[0] * m), px(rho[1] * m), px(rho[2] * m)],
    outerR: [px(out[0] * m), px(out[1] * m), px(out[2] * m)],
    phases: [0, psi1, psi2],
    ratios: [1, -(t0 / t1), t0 / t2],
    width: Math.ceil(ox + right * m + RIGHT_PAD),
    labelY: px(oy + bottom * m + 3),
    gaugeR: px(gaugeU * m),
    needleLen: px(gaugeU * m - 8),
  };
};

type DragState = {
  pointerId: number;
  /** The grabbed gear's rotation per drive degree — its inverse maps back. */
  ratio: number;
  /** Last pointer bearing from the grabbed gear's center, deg. */
  lastAngle: number;
  /** Unresisted accumulated drive angle — the end-stops map from this. */
  raw: number;
};

export type GearTrainProps = {
  /** Controlled needle value, 0–100. */
  value?: number;
  /** Initial value when uncontrolled. */
  defaultValue?: number;
  /** Fires once per settle — never per pixel of drag. */
  onValueChange?: (value: number) => void;
  /** Tooth counts, drive → idler → output; radius scales with teeth. */
  teeth?: [number, number, number];
  /** Component height, px; width follows from the tooth geometry. */
  height?: number;
  className?: string;
  /** Accessible name for the slider. */
  "aria-label"?: string;
};

/**
 * A bench gear train: three meshed spur gears — drive, idler, output — cut as
 * deterministic SVG (trapezoidal teeth from `gearPath`, radius proportional
 * to tooth count) transmit one master drive angle through honest ratios. The
 * drive angle is the only source of truth: the idler counter-rotates at
 * −t0/t1 and the output at +t0/t2, both `useTransform` derivations, and the
 * rest phases from `meshPhase` keep the teeth visually interleaved at every
 * angle — verified by construction in that helper's comment. The output shaft
 * carries a needle over a quarter dial: needle angle is a `mapRange` of the
 * output rotation across its working span (2.5 drive turns end to end), and
 * the clamped needle position is the value, 0–100.
 *
 * Drag any wheel: the pointer's angle delta around that gear's center is that
 * gear's own rotation, mapped back to the drive through its inverse ratio —
 * cranking the drive is direct, cranking the big output wheel carries the
 * ratio, the idler drags backward. The rails resist overdrag asymptotically.
 * Release projects flick velocity ~250ms ahead (carry capped) and lands the
 * drive on the nearest whole value with one velocity-seeded `drift` glide —
 * two keyframes, clamped into range — and `onValueChange` fires on settle,
 * deduped. The frame is a slider: arrows step ±2, PageUp/Down ±10, Home/End
 * run the rails, each landing on a `glide` spring that also reports on
 * settle. Every drive tooth crossing top-dead-center blinks the hub jewel
 * (opacity pulse, `durations.blink`), derived from the angle value — no
 * timers, no rAF loops. Reduced motion keeps 1:1 drags and the jewel blink
 * but drops momentum; keys and controlled updates land instantly.
 */
export function GearTrain({
  value,
  defaultValue,
  onValueChange,
  teeth = [12, 18, 24],
  height = 240,
  className,
  "aria-label": ariaLabel = "Gear train",
}: GearTrainProps) {
  const motionSafe = useMotionSafe();
  const isControlled = value !== undefined;

  const counts: [number, number, number] = [
    clampTeeth(teeth[0]),
    clampTeeth(teeth[1]),
    clampTeeth(teeth[2]),
  ];
  const heightSafe = Math.max(MIN_HEIGHT, Math.round(height));
  const geo = layoutTrain(counts, heightSafe);
  const [c0, c1, c2] = geo.centers;
  /** Drive tooth pitch — one jewel tick per this many drive degrees. */
  const drivePitch = 360 / counts[0];

  const [initial] = React.useState<number>(() =>
    Math.round(clamp(value ?? defaultValue ?? 0, 0, 100)),
  );

  /** The master angle: the drive gear's rotation, deg. Everything derives. */
  const driveMv = useMotionValue(initial * DEG_PER_VALUE);
  const idlerSpin = useTransform(
    driveMv,
    (deg) => geo.phases[1] + deg * geo.ratios[1],
  );
  const outputSpin = useTransform(
    driveMv,
    (deg) => geo.phases[2] + deg * geo.ratios[2],
  );
  /**
   * Needle angle: the output's rotation (phase removed) remapped over its
   * working span onto the dial sweep; +90 converts to the rotor's up-is-zero
   * frame. mapRange clamps, so overdrag presses the needle against an end.
   */
  const needleRotate = useTransform(
    outputSpin,
    (deg) =>
      mapRange(
        deg - geo.phases[2],
        0,
        DRIVE_TRAVEL_DEG * geo.ratios[2],
        ARC_START,
        ARC_END,
      ) + 90,
  );
  const jewelOpacity = useMotionValue(JEWEL_IDLE);

  const [committedValue, setCommittedValue] = React.useState(initial);
  /** The value last settled on (or being steered to). */
  const targetValueRef = React.useRef(initial);
  const lastNotifiedRef = React.useRef(initial);
  const dragRef = React.useRef<DragState | null>(null);
  /** Which tooth-crossing bucket the drive currently occupies. */
  const toothRef = React.useRef(
    Math.floor((initial * DEG_PER_VALUE + 90) / drivePitch),
  );
  const controlsRef = React.useRef<{
    settle: ReturnType<typeof animate> | null;
    blink: ReturnType<typeof animate> | null;
  }>({ settle: null, blink: null });

  const onValueChangeRef = React.useRef(onValueChange);
  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
  });

  // Nothing in flight may outlive the component.
  React.useEffect(() => {
    const controls = controlsRef.current;
    return () => {
      controls.settle?.stop();
      controls.blink?.stop();
    };
  }, []);

  // Tooth tick: a drive tooth passes top-dead-center (−90° on screen)
  // whenever floor((deg + 90) / pitch) moves a bucket — blink the hub jewel
  // once per tooth. Derived from the angle value; no timers, and the
  // opacity-only cue survives reduced motion.
  useMotionValueEvent(driveMv, "change", (deg) => {
    const crossing = Math.floor((deg + 90) / drivePitch);
    if (crossing === toothRef.current) return;
    toothRef.current = crossing;
    controlsRef.current.blink?.stop();
    jewelOpacity.set(1);
    controlsRef.current.blink = animate(jewelOpacity, JEWEL_IDLE, {
      duration: durations.blink,
      ease: easings.enter,
    });
  });

  /** Announce a settle once — drags that wander home stay silent. */
  const notify = (settled: number) => {
    if (lastNotifiedRef.current === settled) return;
    lastNotifiedRef.current = settled;
    onValueChangeRef.current?.(settled);
  };

  /**
   * Land the train on a whole value: aria commits now, the callback fires on
   * settle. Rich motion glides the drive there on one 2-keyframe spring;
   * reduced motion lands instantly.
   */
  const settleTo = (nextValue: number, velocity: number, transition: Transition) => {
    targetValueRef.current = nextValue;
    if (!isControlled) setCommittedValue(nextValue);
    controlsRef.current.settle?.stop();
    if (motionSafe) {
      controlsRef.current.settle = animate(
        driveMv,
        nextValue * DEG_PER_VALUE,
        { ...transition, velocity, onComplete: () => notify(nextValue) },
      );
    } else {
      driveMv.set(nextValue * DEG_PER_VALUE);
      notify(nextValue);
    }
  };

  // Controlled updates steer the train without re-announcing them.
  React.useEffect(() => {
    if (value === undefined) return;
    const next = Math.round(clamp(value, 0, 100));
    if (targetValueRef.current === next) return;
    targetValueRef.current = next;
    lastNotifiedRef.current = next;
    controlsRef.current.settle?.stop();
    if (motionSafe) {
      controlsRef.current.settle = animate(
        driveMv,
        next * DEG_PER_VALUE,
        springs.glide,
      );
    } else {
      driveMv.set(next * DEG_PER_VALUE);
    }
  }, [value, motionSafe, driveMv]);

  const handlePointerDown =
    (ratio: number) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (dragRef.current) return;
      controlsRef.current.settle?.stop();
      const rect = event.currentTarget.getBoundingClientRect();
      const angle =
        Math.atan2(
          event.clientY - (rect.top + rect.height / 2),
          event.clientX - (rect.left + rect.width / 2),
        ) *
        (180 / Math.PI);
      dragRef.current = {
        pointerId: event.pointerId,
        ratio,
        lastAngle: angle,
        raw: clamp(driveMv.get(), 0, DRIVE_TRAVEL_DEG),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (dx * dx + dy * dy < DEAD_ZONE_PX * DEAD_ZONE_PX) return;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const delta = angleDelta(drag.lastAngle, angle);
    drag.lastAngle = angle;
    // The hand sticks to the grabbed wheel: its angle delta IS that gear's
    // rotation, so the drive turns by delta / ratio — the honest transmission
    // feel (direct on the drive, geared through the ratio on the others).
    drag.raw = clamp(
      drag.raw + delta / drag.ratio,
      -OVERDRAG_DEG * 3,
      DRIVE_TRAVEL_DEG + OVERDRAG_DEG * 3,
    );
    let display: number;
    if (drag.raw > DRIVE_TRAVEL_DEG) {
      display = DRIVE_TRAVEL_DEG + resist(drag.raw - DRIVE_TRAVEL_DEG);
    } else if (drag.raw < 0) {
      display = -resist(-drag.raw);
    } else {
      display = drag.raw;
    }
    driveMv.set(display);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (motionSafe) {
      // Momentum: project the flick MOMENTUM_WINDOW ahead (carry capped),
      // clamp into range, and glide there on drift seeded with the velocity.
      const maxV = MAX_CARRY_DEG / MOMENTUM_WINDOW;
      const velocity = clamp(driveMv.getVelocity(), -maxV, maxV);
      const projected = clamp(
        driveMv.get() + velocity * MOMENTUM_WINDOW,
        0,
        DRIVE_TRAVEL_DEG,
      );
      settleTo(Math.round(projected / DEG_PER_VALUE), velocity, springs.drift);
    } else {
      const held = clamp(driveMv.get(), 0, DRIVE_TRAVEL_DEG);
      settleTo(Math.round(held / DEG_PER_VALUE), 0, springs.drift);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = targetValueRef.current;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = clamp(current + KEY_STEP, 0, 100);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = clamp(current - KEY_STEP, 0, 100);
        break;
      case "PageUp":
        next = clamp(current + KEY_PAGE, 0, 100);
        break;
      case "PageDown":
        next = clamp(current - KEY_PAGE, 0, 100);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
      default:
        return;
    }
    event.preventDefault();
    settleTo(next, 0, springs.glide);
  };

  const committed = isControlled
    ? Math.round(clamp(value, 0, 100))
    : committedValue;

  const gears = [
    {
      center: c0,
      outer: geo.outerR[0],
      pitch: geo.pitchR[0],
      count: counts[0],
      spin: driveMv,
      ratio: geo.ratios[0],
      isDrive: true,
    },
    {
      center: c1,
      outer: geo.outerR[1],
      pitch: geo.pitchR[1],
      count: counts[1],
      spin: idlerSpin,
      ratio: geo.ratios[1],
      isDrive: false,
    },
    {
      center: c2,
      outer: geo.outerR[2],
      pitch: geo.pitchR[2],
      count: counts[2],
      spin: outputSpin,
      ratio: geo.ratios[2],
      isDrive: false,
    },
  ];

  const arcStart = polar(c2, geo.gaugeR, ARC_START);
  const arcEnd = polar(c2, geo.gaugeR, ARC_END);
  const zeroLabel = polar(c2, geo.gaugeR, ARC_START - LABEL_SWING);
  const fullLabel = polar(c2, geo.gaugeR, ARC_END + LABEL_SWING);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={committed}
      aria-valuetext={`${committed}%`}
      onKeyDown={handleKeyDown}
      className={cn("relative select-none rounded-2", className)}
      style={{ width: geo.width, height: heightSafe }}
    >
      {/* Bench plate: the carrier bar linking the axles, and the quarter dial. */}
      <svg
        aria-hidden
        width={geo.width}
        height={heightSafe}
        viewBox={`0 0 ${geo.width} ${heightSafe}`}
        className="pointer-events-none absolute inset-0"
      >
        <path
          d={`M ${c0.x} ${c0.y} L ${c1.x} ${c1.y} L ${c2.x} ${c2.y}`}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={px(geo.m * 1.5)}
          strokeLinecap="round"
        />
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${geo.gaugeR} ${geo.gaugeR} 0 0 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={1}
        />
        {GAUGE_TICKS.map((tick) => {
          const a = mapRange(tick, 0, 100, ARC_START, ARC_END);
          const inner = polar(c2, geo.gaugeR - 4, a);
          const outer = polar(c2, geo.gaugeR + 4, a);
          return (
            <line
              key={tick}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--hairline-strong)"
              strokeWidth={1}
            />
          );
        })}
        <text
          x={zeroLabel.x}
          y={zeroLabel.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fill="var(--ink-3)"
          className="font-mono"
        >
          0
        </text>
        <text
          x={fullLabel.x}
          y={fullLabel.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={8}
          fill="var(--ink-3)"
          className="font-mono"
        >
          100
        </text>
      </svg>

      {/* The rotors. Each gear is drawn centered in its own square, so the
          div's default 50%/50% origin rotates it exactly about its axle. */}
      {gears.map((gear, i) => {
        const box = gear.outer + 2;
        const root = rootRadius(gear.count, gear.pitch);
        const webR = px(root * 0.74);
        const hubR = px(Math.max(4, root * 0.32));
        const spokeW = Math.max(1.5, geo.m * 0.5);
        return (
          <motion.div
            key={i}
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: gear.center.x - box,
              top: gear.center.y - box,
              width: box * 2,
              height: box * 2,
              rotate: gear.spin,
            }}
          >
            <svg
              viewBox={`${-box} ${-box} ${box * 2} ${box * 2}`}
              className="block size-full"
            >
              <path
                d={gearPath(gear.count, gear.pitch)}
                fill="var(--muted)"
                stroke={
                  gear.isDrive ? "var(--accent-bright)" : "var(--hairline-strong)"
                }
                strokeWidth={gear.isDrive ? 1.5 : 1}
                strokeLinejoin="round"
              />
              <circle r={webR} fill="none" stroke="var(--hairline-strong)" />
              {[45, 135, 225, 315].map((a) => (
                <line
                  key={a}
                  x1={px(Math.cos(rad(a)) * hubR)}
                  y1={px(Math.sin(rad(a)) * hubR)}
                  x2={px(Math.cos(rad(a)) * webR)}
                  y2={px(Math.sin(rad(a)) * webR)}
                  stroke="var(--hairline-strong)"
                  strokeWidth={spokeW}
                  strokeLinecap="round"
                />
              ))}
              <circle r={hubR} fill="var(--card)" stroke="var(--hairline-strong)" />
              <circle r={Math.max(1.2, px(geo.m * 0.24))} fill="var(--ink-3)" />
            </svg>
          </motion.div>
        );
      })}

      {/* Output-shaft needle over the quarter dial, pivoting at the axle. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          left: c2.x - 1,
          top: c2.y - geo.needleLen,
          width: 2,
          height: geo.needleLen,
          transformOrigin: "50% 100%",
          rotate: needleRotate,
          background: "var(--accent-bright)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-full border border-hairline-strong bg-card"
        style={{ left: c2.x - 5, top: c2.y - 5, width: 10, height: 10 }}
      />

      {/* The tooth-tick jewel on the drive axle. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute rounded-full"
        style={{
          left: c0.x - 2.5,
          top: c0.y - 2.5,
          width: 5,
          height: 5,
          background: "var(--accent-bright)",
          opacity: jewelOpacity,
        }}
      />

      {/* Tooth-count plates, one beside each wheel on the bench row. */}
      {gears.map((gear, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute -translate-x-1/2 font-mono text-[9px] tracking-[0.12em] text-ink-3 tabular-nums"
          style={{ left: gear.center.x, top: geo.labelY }}
        >
          {gear.count}T
        </span>
      ))}

      {/* Hit discs — circular drag on any gear, pointer-captured. */}
      {gears.map((gear, i) => (
        <div
          key={i}
          aria-hidden
          className="absolute cursor-grab touch-none rounded-full active:cursor-grabbing"
          style={{
            left: gear.center.x - gear.outer,
            top: gear.center.y - gear.outer,
            width: gear.outer * 2,
            height: gear.outer * 2,
          }}
          onPointerDown={handlePointerDown(gear.ratio)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />
      ))}
    </div>
  );
}
