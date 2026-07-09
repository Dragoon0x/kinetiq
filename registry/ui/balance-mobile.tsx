"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { clamp, liftShadowCss } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** ζ≈0.64 — the release swings every affected beam past level once (gyro-card constant). */
const REBALANCE = { type: "spring", stiffness: 120, damping: 14 } as const;

/** Torque gain: degrees of beam tilt per unit of load imbalance. */
const TILT_GAIN = 6;
/** Honest-torque clamp — no beam ever tilts past this, in degrees. */
const TILT_MAX = 14;
/** Extra weight added per px of pull. */
const PULL_PER_PX = 1 / 60;
/** Cap on the temporary pull weight. */
const PULL_MAX = 2.5;
/** String stretch soft cap, px — the pull approaches it with resistance. */
const STRETCH_MAX = 48;
/** Keyboard tug: the momentary weight pulse and how long it holds. */
const TUG_WEIGHT = 1.5;
const TUG_HOLD_MS = 250;
/** String dip during a keyboard tug, px. */
const TUG_DIP = 14;
/** Reduced motion pulses this much extra weight: TILT_GAIN × RM_PULSE = 4°. */
const RM_PULSE = 4 / TILT_GAIN;
/** Pointer travel (px) before a press becomes a pull — protects taps/clicks. */
const DRAG_THRESHOLD = 3;

/*
 * Fixed rig geometry, px. Every layout rests its discs on one line:
 * CEIL_Y + MAIN_STRING + BEAM_H + DROP_TOP + BEAM_H + DROP_LEAF.
 */
const CEIL_Y = 10;
const MAIN_STRING = 28;
const BEAM_H = 2;
const TOP_BEAM_W = 176;
const SUB_BEAM_W = 76;
/** Top-beam end → sub-beam bar. */
const DROP_TOP = 26;
/** Sub-beam end → disc. */
const DROP_LEAF = 34;
/** Long string for a piece hung straight off a top-beam end (2/3-item layouts). */
const DROP_LONG = DROP_TOP + BEAM_H + DROP_LEAF;
/** Single-item layout: one plumb string straight off the mount. */
const DROP_SINGLE = MAIN_STRING + BEAM_H + DROP_TOP + DROP_LEAF;
const DISC = 40;

/** Indexed oklch accent chips — deterministic per slot, never random. */
const ACCENTS = [
  "oklch(0.84 0.16 162)",
  "oklch(0.78 0.15 52)",
  "oklch(0.72 0.15 258)",
  "oklch(0.74 0.19 350)",
] as const;

const accentFor = (index: number): string =>
  ACCENTS[index % ACCENTS.length] ?? ACCENTS[0];

/** tilt_target = clamp(k × (rightLoad − leftLoad), ±14°) — honest torque. */
const beamTilt = (leftLoad: number, rightLoad: number): number =>
  clamp(TILT_GAIN * (rightLoad - leftLoad), -TILT_MAX, TILT_MAX);

/** Mono initials for the disc face: first letters of the first two words. */
const initialsOf = (label: string): string => {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1];
  const raw = second
    ? `${first.slice(0, 1)}${second.slice(0, 1)}`
    : first.slice(0, 2);
  return (raw || "·").toUpperCase();
};

export type BalanceMobileItem = {
  id: string;
  label: string;
  /** Relative mass of the piece. @default 1 */
  weight?: number;
};

export type BalanceMobileProps = {
  /** Pieces to hang. Only the first 4 are used; weight defaults to 1. */
  items: readonly BalanceMobileItem[];
  /** Stage height in px. @default 260 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A two-level hanging mobile of weighted arms. A ceiling mount drops a main
 * string to the top beam; what hangs from its ends is a fixed, deterministic
 * layout by item count — 4: a sub-beam per end (pieces 1+2 left, 3+4 right);
 * 3: sub-beam (1+2) left, piece 3 on a long string right, drop matched so all
 * discs rest on one line; 2: both pieces on long strings straight off the
 * beam ends; 1: one plumb string off the mount, no beams.
 *
 * Every beam's tilt is honest torque — clamp(6° × (rightLoad − leftLoad),
 * ±14°) where a side's load is the summed weight of its subtree — computed as
 * a useTransform chain over per-piece extra-weight motion values and chased
 * by a `glide` spring. Children hang from beam ends by DOM nesting, so their
 * positions derive from the parent rotation; each hanger counter-rotates by
 * the beam angle so strings stay plumb.
 *
 * Drag a piece down (setPointerCapture) and the pull adds temporary weight
 * (Δw = px/60, capped +2.5) while its string stretches toward ~48px with
 * tanh resistance; every beam above re-tilts live on the glide spring. On
 * release the extra weight animates to 0 on the underdamped REBALANCE spring
 * (stiffness 120, damping 14), so the whole rig swings past equilibrium once
 * and settles; the string retracts on `glide`. Each piece is a real button:
 * Space/Enter tugs it — the weight pulses to 1.5 (set the peak) and, after
 * ~250ms, animates to 0 with REBALANCE. A polite sr-only region announces
 * "<label> tugged - rebalancing." on release/tug.
 *
 * Reduced motion: the rig renders at its static equilibrium; drags and tugs
 * tween in a small honest tilt (≤4°, duration-fast) that returns just as
 * fast on release — no swings, buttons all still work. No per-frame setState
 * anywhere; all animation controls and timers stop on unmount.
 */
export function BalanceMobile({
  items,
  height = 260,
  className,
  "aria-label": ariaLabel = "Balance mobile",
}: BalanceMobileProps) {
  const motionSafe = useMotionSafe();

  const pieces = items.slice(0, 4);
  const count = pieces.length;
  const item0 = pieces[0];
  const item1 = pieces[1];
  const item2 = pieces[2];
  const item3 = pieces[3];
  const weightOf = (item: BalanceMobileItem | undefined): number =>
    item ? Math.max(0, item.weight ?? 1) : 0;
  const w0 = weightOf(item0);
  const w1 = weightOf(item1);
  const w2 = weightOf(item2);
  const w3 = weightOf(item3);

  // One temporary-weight channel per slot; pulls and tugs write only these.
  const e0 = useMotionValue(0);
  const e1 = useMotionValue(0);
  const e2 = useMotionValue(0);
  const e3 = useMotionValue(0);
  /** Plumb reference for the single-item layout (nothing to counter-rotate). */
  const zeroTilt = useMotionValue(0);

  // Honest torque, live: side load = summed base + extra weight of the subtree.
  const subATarget = useTransform([e0, e1], ([a = 0, b = 0]: number[]) =>
    beamTilt(w0 + a, w1 + b),
  );
  const subBTarget = useTransform([e2, e3], ([c = 0, d = 0]: number[]) =>
    beamTilt(w2 + c, w3 + d),
  );
  const topTarget = useTransform(
    [e0, e1, e2, e3],
    ([a = 0, b = 0, c = 0, d = 0]: number[]) =>
      count >= 3
        ? beamTilt(w0 + a + w1 + b, w2 + c + w3 + d)
        : count === 2
          ? beamTilt(w0 + a, w1 + b)
          : 0,
  );

  // Displayed tilts chase their targets on glide; the REBALANCE release
  // animates the sources, so the overshoot rides through this chain.
  const subASpring = useSpring(subATarget, GLIDE);
  const subBSpring = useSpring(subBTarget, GLIDE);
  const topSpring = useSpring(topTarget, GLIDE);

  // Reduced motion renders the honest static equilibrium straight from the
  // targets — the small RM pulses tween through the same chain, springless.
  const topTilt = motionSafe ? topSpring : topTarget;
  const subATilt = motionSafe ? subASpring : subATarget;
  const subBTilt = motionSafe ? subBSpring : subBTarget;

  const [announce, setAnnounce] = React.useState("");
  const handleTug = React.useCallback((label: string) => {
    setAnnounce(`${label} tugged - rebalancing.`);
  }, []);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "border-hairline bg-surface-1 relative w-full overflow-hidden rounded-4 border",
        className,
      )}
      style={{ height }}
    >
      {/* Ceiling line + mount block — the rig hangs off the plate itself. */}
      <div
        aria-hidden
        className="border-hairline-strong absolute inset-x-3 border-t"
        style={{ top: CEIL_Y }}
      />
      <div
        aria-hidden
        className="bg-hairline-strong absolute left-1/2 -translate-x-1/2 rounded-b-1"
        style={{ top: CEIL_Y, width: 22, height: 5 }}
      />

      {count >= 2 && (
        <>
          <div
            aria-hidden
            className="bg-hairline-strong absolute"
            style={{
              left: "calc(50% - 0.5px)",
              top: CEIL_Y,
              width: 1,
              height: MAIN_STRING,
            }}
          />
          <motion.div
            className="absolute"
            style={{
              left: "50%",
              marginLeft: -TOP_BEAM_W / 2,
              top: CEIL_Y + MAIN_STRING,
              width: TOP_BEAM_W,
              rotate: topTilt,
              transformOrigin: "50% 0px",
            }}
          >
            <Bar />
            <div
              aria-hidden
              className="bg-ink-3 absolute -top-px left-1/2 size-1 -translate-x-1/2 rounded-full"
            />
            {count >= 3
              ? item0 &&
                item1 && (
                  <SubBeam
                    key={`${item0.id}/${item1.id}`}
                    x={0}
                    parentTilt={topTilt}
                    tilt={subATilt}
                    itemA={item0}
                    itemB={item1}
                    indexA={0}
                    indexB={1}
                    extraA={e0}
                    extraB={e1}
                    motionSafe={motionSafe}
                    onTug={handleTug}
                  />
                )
              : item0 && (
                  <Piece
                    key={item0.id}
                    x={0}
                    stringLen={DROP_LONG}
                    parentTilt={topTilt}
                    item={item0}
                    index={0}
                    extra={e0}
                    motionSafe={motionSafe}
                    onTug={handleTug}
                  />
                )}
            {count === 4
              ? item2 &&
                item3 && (
                  <SubBeam
                    key={`${item2.id}/${item3.id}`}
                    x={TOP_BEAM_W}
                    parentTilt={topTilt}
                    tilt={subBTilt}
                    itemA={item2}
                    itemB={item3}
                    indexA={2}
                    indexB={3}
                    extraA={e2}
                    extraB={e3}
                    motionSafe={motionSafe}
                    onTug={handleTug}
                  />
                )
              : count === 3
                ? item2 && (
                    <Piece
                      key={item2.id}
                      x={TOP_BEAM_W}
                      stringLen={DROP_LONG}
                      parentTilt={topTilt}
                      item={item2}
                      index={2}
                      extra={e2}
                      motionSafe={motionSafe}
                      onTug={handleTug}
                    />
                  )
                : item1 && (
                    <Piece
                      key={item1.id}
                      x={TOP_BEAM_W}
                      stringLen={DROP_LONG}
                      parentTilt={topTilt}
                      item={item1}
                      index={1}
                      extra={e1}
                      motionSafe={motionSafe}
                      onTug={handleTug}
                    />
                  )}
          </motion.div>
        </>
      )}

      {count === 1 && item0 && (
        <div
          className="absolute"
          style={{ left: "50%", top: CEIL_Y - BEAM_H }}
        >
          <Piece
            key={item0.id}
            x={0}
            stringLen={DROP_SINGLE}
            parentTilt={zeroTilt}
            item={item0}
            index={0}
            extra={e0}
            motionSafe={motionSafe}
            onTug={handleTug}
          />
        </div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

/** 2px rounded hairline-strong rod with pivot dots at both ends. */
function Bar() {
  return (
    <>
      <div
        aria-hidden
        className="bg-hairline-strong h-0.5 w-full rounded-full"
      />
      <div
        aria-hidden
        className="bg-ink-3 absolute -top-px -left-0.5 size-1 rounded-full"
      />
      <div
        aria-hidden
        className="bg-ink-3 absolute -top-px -right-0.5 size-1 rounded-full"
      />
    </>
  );
}

type SubBeamProps = {
  /** Attach offset along the parent beam, px (0 = left end, width = right). */
  x: number;
  /** Parent beam's displayed tilt — countered so this arm hangs plumb. */
  parentTilt: MotionValue<number>;
  /** This beam's displayed tilt. */
  tilt: MotionValue<number>;
  itemA: BalanceMobileItem;
  itemB: BalanceMobileItem;
  indexA: number;
  indexB: number;
  extraA: MotionValue<number>;
  extraB: MotionValue<number>;
  motionSafe: boolean;
  onTug: (label: string) => void;
};

/**
 * A level-2 arm: counter-rotated hanger at the parent beam's end, a fixed
 * string, then its own beam carrying two pieces. Nesting makes the child
 * positions follow the parent rotation for free.
 */
function SubBeam({
  x,
  parentTilt,
  tilt,
  itemA,
  itemB,
  indexA,
  indexB,
  extraA,
  extraB,
  motionSafe,
  onTug,
}: SubBeamProps) {
  const counter = useTransform(parentTilt, (v) => -v);
  return (
    <motion.div
      className="absolute"
      style={{ left: x, top: BEAM_H, rotate: counter, transformOrigin: "0px 0px" }}
    >
      <div
        aria-hidden
        className="bg-hairline-strong absolute top-0"
        style={{ left: -0.5, width: 1, height: DROP_TOP }}
      />
      <motion.div
        className="absolute"
        style={{
          left: -SUB_BEAM_W / 2,
          top: DROP_TOP,
          width: SUB_BEAM_W,
          rotate: tilt,
          transformOrigin: "50% 0px",
        }}
      >
        <Bar />
        <Piece
          key={itemA.id}
          x={0}
          stringLen={DROP_LEAF}
          parentTilt={tilt}
          item={itemA}
          index={indexA}
          extra={extraA}
          motionSafe={motionSafe}
          onTug={onTug}
        />
        <Piece
          key={itemB.id}
          x={SUB_BEAM_W}
          stringLen={DROP_LEAF}
          parentTilt={tilt}
          item={itemB}
          index={indexB}
          extra={extraB}
          motionSafe={motionSafe}
          onTug={onTug}
        />
      </motion.div>
    </motion.div>
  );
}

type PieceProps = {
  item: BalanceMobileItem;
  index: number;
  /** Attach offset along the parent beam, px. */
  x: number;
  /** Rest string length, px. */
  stringLen: number;
  /** Parent beam's displayed tilt — countered so the string hangs plumb. */
  parentTilt: MotionValue<number>;
  /** This piece's temporary-weight channel (owned by the rig). */
  extra: MotionValue<number>;
  motionSafe: boolean;
  onTug: (label: string) => void;
};

/**
 * One hanging disc: a counter-rotated hanger, a stretchable string (scaleY
 * from its top), and the disc button riding the same sprung stretch value so
 * string tip and disc never separate. The pull writes only motion values.
 */
function Piece({
  item,
  index,
  x,
  stringLen,
  parentTilt,
  extra,
  motionSafe,
  onTug,
}: PieceProps) {
  const counter = useTransform(parentTilt, (v) => -v);

  const stretchTarget = useMotionValue(0);
  const stretch = useSpring(stretchTarget, GLIDE);
  const stringScale = useTransform(
    stretch,
    (s) => (stringLen + s) / stringLen,
  );

  // Lift shadow grows with hover and with how far the piece is pulled.
  const hover = useMotionValue(0);
  const altitude = useTransform([hover, stretch], ([h = 0, s = 0]: number[]) =>
    clamp(0.12 + h * 0.2 + (Math.max(0, s) / STRETCH_MAX) * 0.5, 0, 1),
  );
  const boxShadow = useTransform(altitude, (a) => liftShadowCss(a));

  const press = React.useRef<{
    id: number;
    startY: number;
    engaged: boolean;
  } | null>(null);
  const skipClick = React.useRef(false);
  const controls = React.useRef<ReturnType<typeof animate>[]>([]);
  const timer = React.useRef<number | null>(null);

  const stopControls = React.useCallback(() => {
    for (const c of controls.current) c.stop();
    controls.current = [];
  }, []);
  const clearTimer = React.useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  React.useEffect(
    () => () => {
      stopControls();
      clearTimer();
    },
    [stopControls, clearTimer],
  );

  /** The weight vanishes: REBALANCE swing for the rig, glide string retract. */
  const releaseWeight = React.useCallback(() => {
    stopControls();
    controls.current = motionSafe
      ? [animate(extra, 0, REBALANCE), animate(stretchTarget, 0, springs.glide)]
      : [animate(extra, 0, { duration: durations.fast })];
  }, [motionSafe, extra, stretchTarget, stopControls]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { id: event.pointerId, startY: event.clientY, engaged: false };
    skipClick.current = false;
    clearTimer();
    stopControls();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || event.pointerId !== p.id) return;
    const dy = event.clientY - p.startY;
    if (!p.engaged) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      p.engaged = true;
      if (!motionSafe) {
        // Reduced motion: one small honest tilt tweens in while held.
        stopControls();
        controls.current = [
          animate(extra, RM_PULSE, { duration: durations.fast }),
        ];
      }
    }
    if (motionSafe) {
      const pull = Math.max(0, dy);
      extra.set(Math.min(pull * PULL_PER_PX, PULL_MAX));
      stretchTarget.set(STRETCH_MAX * Math.tanh(pull / STRETCH_MAX));
    }
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || event.pointerId !== p.id) return;
    press.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!p.engaged) return; // a tap — the ensuing click runs the tug
    skipClick.current = true;
    releaseWeight();
    onTug(item.label);
  };

  const tug = () => {
    clearTimer();
    stopControls();
    if (motionSafe) {
      // Springs take exactly two keyframes: set the peak, then animate to 0.
      extra.set(TUG_WEIGHT);
      stretchTarget.set(TUG_DIP);
    } else {
      controls.current = [
        animate(extra, RM_PULSE, { duration: durations.fast }),
      ];
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      releaseWeight();
    }, TUG_HOLD_MS);
    onTug(item.label);
  };

  const handleClick = () => {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    tug();
  };

  return (
    <motion.div
      className="absolute"
      style={{ left: x, top: BEAM_H, rotate: counter, transformOrigin: "0px 0px" }}
    >
      <motion.div
        aria-hidden
        className="bg-hairline-strong absolute top-0 origin-top"
        style={{ left: -0.5, width: 1, height: stringLen, scaleY: stringScale }}
      />
      <div className="absolute" style={{ top: stringLen, left: -DISC / 2 }}>
        <motion.button
          type="button"
          style={{ y: stretch, boxShadow, width: DISC, height: DISC }}
          className={cn(
            "border-hairline bg-surface-2 relative flex touch-none flex-col items-center justify-center gap-1 rounded-full border select-none",
            "cursor-grab active:cursor-grabbing",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerEnter={() => hover.set(1)}
          onPointerLeave={() => hover.set(0)}
          onClick={handleClick}
        >
          <span
            aria-hidden
            className="text-ink font-mono text-[10px] leading-none font-medium"
          >
            {initialsOf(item.label)}
          </span>
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: accentFor(index) }}
          />
          <span className="sr-only">{item.label}</span>
        </motion.button>
      </div>
    </motion.div>
  );
}
