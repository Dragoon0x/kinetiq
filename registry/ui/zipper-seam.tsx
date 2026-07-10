"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Pull footprint, px — the slider rides the seam at y = P · (height − PULL_H). */
const PULL_H = 40;
/** Half-width of the V mouth at full open, % of stage width (~52% across). */
const MOUTH_HALF_PCT = 26;
/** The apex tucks this many px under the pull's top edge, inside its body. */
const APEX_TUCK = 12;
/** Teeth stations per parted edge — fixed count, deterministic. */
const TEETH_PER_SIDE = 14;
/** Tooth nub width, px (each tooth is a 3px-tall rect). */
const TOOTH_W = 6;
/** Releasing past these ends snaps the seam fully open / fully shut. */
const SNAP_OPEN = 0.92;
const SNAP_CLOSED = 0.08;
/** Full-open landing jitter, px per half — the fabric shiver. */
const SHIVER_PX = 1.5;

/** Subtle diagonal weave on the cloth; the halves mirror it like cut fabric. */
const WEAVE_LEFT =
  "repeating-linear-gradient(45deg, var(--hairline) 0px, var(--hairline) 1px, transparent 1px, transparent 6px)";
const WEAVE_RIGHT =
  "repeating-linear-gradient(-45deg, var(--hairline) 0px, var(--hairline) 1px, transparent 1px, transparent 6px)";

/** Closed-seam dash column: 3px teeth on an 8px pitch, offset to interlock. */
const SEAM_DASHES =
  "repeating-linear-gradient(to bottom, var(--ink-3) 0px, var(--ink-3) 3px, transparent 3px, transparent 8px)";

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Half-width of the V mouth at the stage top for a given progress, in %. */
const mouthHalf = (p: number): number => p * MOUTH_HALF_PCT;

/**
 * The V apex — where the parted edges meet — in % of stage height. It tracks
 * the pull (top edge P · travel) plus APEX_TUCK, so the wedge vanishes into
 * the slider body rather than at a bare point.
 */
const apexPctFor = (p: number, travel: number, height: number): number =>
  ((p * travel + APEX_TUCK) / height) * 100;

type SeamToothProps = {
  progress: MotionValue<number>;
  /** −1 rides the left half's parted edge, +1 the right half's. */
  side: -1 | 1;
  index: number;
  travel: number;
  height: number;
};

/**
 * One tooth nub parked at a fixed station down its half's parted edge. The
 * edge runs from the mouth point (50 ∓ w)% at the stage top to the apex at
 * (50%, apexY); station f = index/14 walks it, so left and top both derive
 * from P: x = 50 ∓ w·(1−f), y = apex·f. Alternate teeth tuck deeper into the
 * fabric — the staggered bite of a zip. Rendered inside the clipped half, so
 * teeth shear with the cloth (and its shiver) and never float in the opening.
 */
function SeamTooth({ progress, side, index, travel, height }: SeamToothProps) {
  const f = index / TEETH_PER_SIDE;
  const tuck = index % 2 === 0 ? 1 : 3.5;
  const left = useTransform(
    progress,
    (p) => `${r2(50 + side * mouthHalf(p) * (1 - f))}%`,
  );
  const top = useTransform(
    progress,
    (p) => `${r2(apexPctFor(p, travel, height) * f)}%`,
  );
  // Bunched at the closed seam the nubs read as noise — fade them in as the
  // mouth first parts.
  const opacity = useTransform(progress, (p) => mapRange(p, 0.02, 0.1, 0, 1));
  return (
    <motion.span
      aria-hidden
      className="bg-ink-3 absolute h-[3px] w-1.5 rounded-[1px]"
      style={{
        left,
        top,
        opacity,
        marginLeft: side === -1 ? -(TOOTH_W + tuck) : tuck,
      }}
    />
  );
}

type SeamPhase = "closed" | "ajar" | "open";

const phaseOf = (pct: number): SeamPhase =>
  pct >= 100 ? "open" : pct <= 0 ? "closed" : "ajar";

export type ZipperSeamProps = {
  /** What lies in the seam — revealed through the V as the pull descends. */
  children: React.ReactNode;
  /** Controlled progress, 0 (closed) – 100 (open). Steers on change; drags stay live. */
  progress?: number;
  /** Initial progress when uncontrolled. @default 0 */
  defaultProgress?: number;
  /** Fires once per settle — release, snap or glide landing, never per pixel. */
  onProgressChange?: (progress: number) => void;
  /** Stage height in px. @default 260 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A zipped fabric seam over hidden contents. One progress value P (0 closed →
 * 1 open) runs the whole rig. The pull rides the seam at y = P · (height −
 * 40), and above it the two woven halves part in a V: each half is a
 * full-stage plate clipped by a polygon — the left runs its outer corners,
 * along the top to the mouth point at (50 − w)%, cuts diagonally down to the
 * apex at (50%, apexY), then straight down the center to the bottom (the
 * right half mirrors it). w = P · 26, so the mouth spans ~52% of the stage at
 * full open, and apexY tracks the pull (tucked 12px under its top edge) — the
 * wedge tapers to nothing at the slider and everything below it stays shut.
 * Fourteen tooth nubs per side sit at fixed stations down each parted edge,
 * a polyline overlay hairlines the V's interior edges, and below the pull an
 * interlocked dash column draws the closed seam.
 *
 * The pull is a real vertical slider (0–100): pointer-captured drag maps dy
 * to P 1:1; release past 0.92 snaps fully open and under 0.08 snaps shut
 * (both on `snap`), anything between stays put. Arrow keys step ±5, Page keys
 * ±20, Home/End run closed/open — all gliding on `glide` (spatial mapping:
 * ArrowDown moves the pull down, opening the seam). The contents sit beneath
 * the cloth, rising 12px → 0 as the seam opens and dimmed until P clears
 * 0.15. Landing fully open plays the fabric shiver — each half is thrown
 * SHIVER_PX apart (set the jitter, recoil to 0: exactly two keyframes) — and
 * a polite sr-only region announces "Open" / "Closed" at the snapped ends.
 * `onProgressChange` fires once per settle, deduped; the `progress` prop
 * steers on change without echoing back to its owner.
 *
 * Reduced motion: P still tracks the pointer 1:1, but settles are instant
 * clamps (duration-0), keys jump, and the shiver never plays — same slider
 * semantics throughout. All in-flight controls stop on unmount; no rAF loops,
 * no per-frame setState.
 */
export function ZipperSeam({
  children,
  progress: progressProp,
  defaultProgress = 0,
  onProgressChange,
  height = 260,
  className,
  "aria-label": ariaLabel = "Zipper pull",
}: ZipperSeamProps) {
  const motionSafe = useMotionSafe();

  /** The pull's vertical run, px — P maps onto it linearly. */
  const travel = Math.max(height - PULL_H, 1);

  const [initial01] = React.useState<number>(
    () => clamp(progressProp ?? defaultProgress, 0, 100) / 100,
  );

  /** THE progress value. Every clip, tooth, edge and offset derives from P. */
  const progressMv = useMotionValue(initial01);
  /** Full-open shiver offsets — the halves jitter apart and recoil home. */
  const leftX = useMotionValue(0);
  const rightX = useMotionValue(0);

  const pullY = useTransform(progressMv, (p) => p * travel);

  // Each half's fabric is the whole stage minus the wedge. Left half:
  // top-left corner → mouth point (50 − w)% on the top edge → diagonal down
  // to the apex (50%, apexY) — the parted edge — → straight down the seam to
  // the bottom → back around. Below the apex both halves share the 50% line,
  // so the seam beneath the pull stays closed at every P.
  const leftClip = useTransform(progressMv, (p) => {
    const w = r2(mouthHalf(p));
    const ay = r2(apexPctFor(p, travel, height));
    return `polygon(0% 0%, ${50 - w}% 0%, 50% ${ay}%, 50% 100%, 0% 100%)`;
  });
  const rightClip = useTransform(progressMv, (p) => {
    const w = r2(mouthHalf(p));
    const ay = r2(apexPctFor(p, travel, height));
    return `polygon(${50 + w}% 0%, 100% 0%, 100% 100%, 50% 100%, 50% ${ay}%)`;
  });

  // The V's interior edges, hairlined: mouth → apex → mouth, in the same
  // percent space as the clips (viewBox 0–100, non-uniform scale, so the
  // stroke pins to 1px via non-scaling-stroke).
  const edgePoints = useTransform(progressMv, (p) => {
    const w = r2(mouthHalf(p));
    const ay = r2(apexPctFor(p, travel, height));
    return `${50 - w},0 50,${ay} ${50 + w},0`;
  });
  const edgeOpacity = useTransform(progressMv, (p) =>
    mapRange(p, 0.02, 0.08, 0, 1),
  );

  /** Closed-seam column top: just under the pull's skirt. */
  const seamTop = useTransform(progressMv, (p) => p * travel + PULL_H - 6);

  // The contents parallax up into place as the seam opens, dim until the
  // mouth has meaningfully parted.
  const contentY = useTransform(progressMv, (p) => mapRange(p, 0, 1, 12, 0));
  const contentOpacity = useTransform(progressMv, (p) =>
    mapRange(p, 0.15, 0.45, 0.4, 1),
  );

  const [sliderPct, setSliderPct] = React.useState(() =>
    Math.round(initial01 * 100),
  );
  const [phase, setPhase] = React.useState<SeamPhase>(() =>
    phaseOf(Math.round(initial01 * 100)),
  );
  const [announce, setAnnounce] = React.useState("");

  const targetPctRef = React.useRef(Math.round(initial01 * 100));
  const lastNotifiedRef = React.useRef<number>(Math.round(initial01 * 100));
  const prevProgressPropRef = React.useRef(progressProp);
  const dragRef = React.useRef<{ pointerId: number; lastY: number } | null>(
    null,
  );
  const settleControl = React.useRef<ReturnType<typeof animate> | null>(null);
  const shiverLeftControl = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const shiverRightControl = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  const onProgressChangeRef = React.useRef(onProgressChange);
  React.useEffect(() => {
    onProgressChangeRef.current = onProgressChange;
  });

  // Nothing in flight may outlive the component.
  React.useEffect(
    () => () => {
      settleControl.current?.stop();
      shiverLeftControl.current?.stop();
      shiverRightControl.current?.stop();
    },
    [],
  );

  /** The fabric shiver — exactly two keyframes per half: set apart, recoil home. */
  const shiver = () => {
    shiverLeftControl.current?.stop();
    shiverRightControl.current?.stop();
    leftX.set(-SHIVER_PX);
    rightX.set(SHIVER_PX);
    shiverLeftControl.current = animate(leftX, 0, springs.recoil);
    shiverRightControl.current = animate(rightX, 0, springs.recoil);
  };

  /** The one rest point: mirror aria, phase and the polite ends, notify once. */
  const settleAt = (pct: number) => {
    targetPctRef.current = pct;
    setSliderPct(pct);
    const next = phaseOf(pct);
    setPhase(next);
    setAnnounce(next === "open" ? "Open" : next === "closed" ? "Closed" : "");
    if (lastNotifiedRef.current !== pct) {
      lastNotifiedRef.current = pct;
      onProgressChangeRef.current?.(pct);
    }
  };

  /**
   * Animate P home and settle — the single landing path for snaps, key
   * glides and controlled steering. Rich motion springs; reduced motion is a
   * duration-0 clamp through the same pipeline (so landing work stays async
   * and identical). The shiver plays on a genuine arrival at full open;
   * drag-release snaps force it, since the cloth may already sit at 1 when
   * the pointer lets go.
   */
  const glideTo = (
    target01: number,
    spring: Transition,
    opts?: { shiverOnLand?: boolean },
  ) => {
    settleControl.current?.stop();
    const from = progressMv.get();
    const shiverOnLand =
      opts?.shiverOnLand ?? (target01 >= 1 && from < 1);
    const transition: Transition = motionSafe ? spring : { duration: 0 };
    settleControl.current = animate(progressMv, target01, {
      ...transition,
      onComplete: () => {
        if (motionSafe && shiverOnLand && target01 >= 1) shiver();
        settleAt(Math.round(target01 * 100));
      },
    });
  };

  /** Keyboard and steering funnel: aria leads, then the glide lands. */
  const commandTo = (pct: number) => {
    const v = Math.round(clamp(pct, 0, 100));
    targetPctRef.current = v;
    setSliderPct(v);
    glideTo(v / 100, springs.glide);
  };

  // Controlled steering — only on an actual `progress` change, so a drag that
  // settles elsewhere is reported (not fought) until the owner responds.
  // Guarded and idempotent, so it runs dependency-free by design.
  React.useEffect(() => {
    if (
      progressProp === undefined ||
      prevProgressPropRef.current === progressProp
    )
      return;
    prevProgressPropRef.current = progressProp;
    const pct = Math.round(clamp(progressProp, 0, 100));
    if (pct === targetPctRef.current) return;
    targetPctRef.current = pct;
    lastNotifiedRef.current = pct; // no echo back to the owner
    glideTo(pct / 100, springs.glide);
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    settleControl.current?.stop();
    dragRef.current = { pointerId: event.pointerId, lastY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    // Relative mapping: dy over the run, clamped — P tracks the hand 1:1 on
    // both motion pathways.
    const next = clamp(
      progressMv.get() + (event.clientY - drag.lastY) / travel,
      0,
      1,
    );
    drag.lastY = event.clientY;
    progressMv.set(next);
    const pct = Math.round(next * 100);
    targetPctRef.current = pct;
    setSliderPct(pct);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const p = progressMv.get();
    if (p > SNAP_OPEN) {
      glideTo(
        1,
        { ...springs.snap, velocity: progressMv.getVelocity() },
        { shiverOnLand: true },
      );
    } else if (p < SNAP_CLOSED) {
      glideTo(0, { ...springs.snap, velocity: progressMv.getVelocity() });
    } else {
      settleAt(Math.round(p * 100)); // freeform — it rests where it was let go
    }
  };

  // Spatial mapping, like the pull itself: down/right opens (pull descends),
  // up/left closes. Home parks closed at the top, End fully open.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = targetPctRef.current + 5;
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = targetPctRef.current - 5;
        break;
      case "PageDown":
        next = targetPctRef.current + 20;
        break;
      case "PageUp":
        next = targetPctRef.current - 20;
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
    commandTo(next);
  };

  return (
    <div
      className={cn(
        "border-hairline bg-surface-0 relative w-full overflow-hidden rounded-3 border select-none",
        className,
      )}
      style={{ height }}
    >
      {/* The seam contents — beneath the cloth, rising into place as it parts. */}
      <motion.div
        aria-hidden={phase === "closed"}
        className="absolute inset-0"
        style={{ y: contentY, opacity: contentOpacity }}
      >
        {children}
      </motion.div>

      {/* Left fabric half — clipped plate, weave mirrored, teeth riding its edge. */}
      <motion.div
        aria-hidden
        className="bg-surface-2 absolute inset-0"
        style={{ clipPath: leftClip, x: leftX, backgroundImage: WEAVE_LEFT }}
      >
        {/* Teeth are fixed stations down the edge; index keys are stable. */}
        {Array.from({ length: TEETH_PER_SIDE }, (_, i) => (
          <SeamTooth
            key={i}
            progress={progressMv}
            side={-1}
            index={i}
            travel={travel}
            height={height}
          />
        ))}
      </motion.div>

      {/* Right fabric half. */}
      <motion.div
        aria-hidden
        className="bg-surface-2 absolute inset-0"
        style={{ clipPath: rightClip, x: rightX, backgroundImage: WEAVE_RIGHT }}
      >
        {Array.from({ length: TEETH_PER_SIDE }, (_, i) => (
          <SeamTooth
            key={i}
            progress={progressMv}
            side={1}
            index={i}
            travel={travel}
            height={height}
          />
        ))}
      </motion.div>

      {/* The closed seam below the pull — two dash columns, offset half a
          pitch, reading as interlocked teeth down the center line. */}
      <motion.div
        aria-hidden
        className="absolute bottom-0 left-1/2 w-[7px]"
        style={{ x: "-50%", top: seamTop }}
      >
        <span
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: SEAM_DASHES }}
        />
        <span
          className="absolute inset-y-0 right-0 w-[3px]"
          style={{ background: SEAM_DASHES, backgroundPosition: "0 4px" }}
        />
      </motion.div>

      {/* Hairlines down the V's interior edges. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <motion.polyline
          points={edgePoints}
          fill="none"
          stroke="var(--hairline-strong)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          style={{ opacity: edgeOpacity }}
        />
      </svg>

      {/* The pull — a real vertical slider riding the seam. */}
      <motion.div
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={sliderPct}
        aria-valuetext={
          sliderPct >= 100
            ? "Open"
            : sliderPct <= 0
              ? "Closed"
              : `${sliderPct}% open`
        }
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ x: "-50%", y: pullY }}
        className="focus-visible:ring-ring absolute top-0 left-1/2 z-10 flex h-10 w-8 cursor-grab touch-none flex-col items-center rounded-2 outline-none select-none focus-visible:ring-2 active:cursor-grabbing"
      >
        {/* Slider body — the bridge gripping the teeth. */}
        <span
          aria-hidden
          className="border-hairline-strong bg-surface-1 h-3.5 w-4 rounded-t-[5px] rounded-b-[2px] border"
        />
        {/* The tab, hung from the body, pierced by its hole. */}
        <span
          aria-hidden
          className="border-hairline-strong bg-surface-1 -mt-px flex h-[26px] w-[18px] items-end justify-center rounded-[6px] border pb-[5px]"
        >
          <span className="border-hairline-strong size-2 rounded-full border" />
        </span>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
