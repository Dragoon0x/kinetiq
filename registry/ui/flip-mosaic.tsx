"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type FlipMosaicSide = "a" | "b";

export type FlipMosaicTile = {
  /** Face shown while the board rests on side A. */
  a: React.ReactNode;
  /** Face shown once the board has flipped to side B. */
  b: React.ReactNode;
};

type FlipMosaicBaseProps = {
  /** One entry per plate — each carries both boards' content for that cell. */
  tiles: FlipMosaicTile[];
  /** Grid columns; rows derive from the tile count. @default 4 */
  columns?: number;
  /** Controlled side. */
  side?: FlipMosaicSide;
  /** Uncontrolled initial side. @default "a" */
  defaultSide?: FlipMosaicSide;
  onSideChange?: (side: FlipMosaicSide) => void;
  /** Where the cascade wave begins. @default "start" */
  origin?: "start" | "end" | "center";
  /** Tile width / height. @default 1 */
  tileAspect?: number;
  /** Gutter between plates, px. @default 8 */
  gap?: number;
  className?: string;
};

export type FlipMosaicProps = FlipMosaicBaseProps &
  (
    | {
        /** The mosaic itself is a switch: press, Space, or Enter flips it. @default true */
        interactive?: true;
        /** Required when interactive — names the switch and its two boards. */
        "aria-label": string;
      }
    | {
        /** A display board driven entirely by `side`. */
        interactive: false;
        "aria-label"?: string;
      }
  );

/**
 * A grid of plates that flips in cascade to swap between two boards — A and B
 * content interleaved on the same tiles. Each tile is two faces back to back
 * (backface hidden, B pre-rotated 180°) inside a preserve-3d cell, while the
 * grid supplies `perspectives.base`, so plates near the edges flip slightly
 * off-axis like one physical panel viewed from its center. A→B rolls every
 * tile to 180° on `springs.snap`, staggered by its euclidean distance from
 * the wave `origin` × `cascade(count)` — grid distance never exceeds the tile
 * count, so the whole sweep stays inside the 600ms choreography budget. B→A
 * animates back to 0°, always the reverse direction, so tile edges read
 * consistently. Mid-flight side changes stop each tile where it is and
 * retarget it with its wave delay intact; unmount stops everything.
 *
 * Semantics: when `interactive` (the default) the board is one real
 * `<button role="switch" aria-checked>` — Space and Enter toggle natively,
 * focus-visible draws a ring on the frame, the tiles are `aria-hidden`
 * decoration, and the required `aria-label` plus a visually-hidden
 * "Board A/B" text carry state. An sr-only polite region announces the
 * landing once the last plate settles. When not interactive, the mosaic is a
 * plain group driven by the `side` prop.
 *
 * Reduced motion: no 3D, no cascade — the whole board crossfades between
 * faces at `durations.fast` with identical semantics and announcements.
 */
export function FlipMosaic({
  tiles,
  columns = 4,
  side,
  defaultSide = "a",
  onSideChange,
  origin = "start",
  tileAspect = 1,
  gap = 8,
  interactive = true,
  className,
  "aria-label": ariaLabel,
}: FlipMosaicProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledSide, setUncontrolledSide] = React.useState(defaultSide);
  const currentSide = side ?? uncontrolledSide;
  const isB = currentSide === "b";

  const cols = Math.max(1, Math.floor(columns));
  const count = tiles.length;
  const rows = Math.max(1, Math.ceil(count / cols));

  // The wave: each plate waits its distance from the origin × the cascade
  // interval. Pure geometry — index in, delay out — so every flip replays
  // identically.
  const step = cascade(count);
  const originRow = origin === "end" ? rows - 1 : origin === "center" ? (rows - 1) / 2 : 0;
  const originCol = origin === "end" ? cols - 1 : origin === "center" ? (cols - 1) / 2 : 0;
  const delayFor = (index: number): number =>
    Math.hypot(Math.floor(index / cols) - originRow, (index % cols) - originCol) * step;
  const maxDelay = tiles.reduce((max, _, index) => Math.max(max, delayFor(index)), 0);

  // Settle announcer: a throwaway 0→1 animation mirrors the farthest plate's
  // timing (same spring, same delay), so the polite region speaks only once
  // the board has landed. Retargeting a mid-flight flip restarts it too.
  const [announced, setAnnounced] = React.useState<FlipMosaicSide>(currentSide);
  const settleControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevSideRef = React.useRef(isB);

  React.useEffect(() => {
    if (prevSideRef.current === isB) return;
    prevSideRef.current = isB;
    const landed: FlipMosaicSide = isB ? "b" : "a";
    settleControls.current?.stop();
    settleControls.current = animate(0, 1, {
      ...(motionSafe
        ? { ...springs.snap, delay: maxDelay }
        : { duration: durations.fast }),
      onComplete: () => {
        settleControls.current = null;
        setAnnounced(landed);
      },
    });
  }, [isB, motionSafe, maxDelay]);

  React.useEffect(
    () => () => {
      settleControls.current?.stop();
      settleControls.current = null;
    },
    [],
  );

  const handleToggle = () => {
    const next: FlipMosaicSide = isB ? "a" : "b";
    if (side === undefined) setUncontrolledSide(next);
    onSideChange?.(next);
  };

  const boardLabel = isB ? "Board B" : "Board A";

  const board = (
    // The grid owns the vanishing point; nothing on this branch may clip or
    // filter, or Safari flattens the preserve-3d cells — faces clip
    // themselves. Spans throughout, so the button stays valid phrasing
    // content; the grid display blockifies every cell anyway.
    <span
      aria-hidden={interactive || undefined}
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap,
        perspective: motionSafe ? `${perspectives.base}px` : undefined,
      }}
    >
      {tiles.map((tile, index) => (
        <MosaicTile
          key={index}
          faceA={tile.a}
          faceB={tile.b}
          isB={isB}
          delay={delayFor(index)}
          motionSafe={motionSafe}
          tileAspect={tileAspect}
        />
      ))}
    </span>
  );

  const status = (
    <span aria-live="polite" role="status" className="sr-only">
      {announced === "b" ? "Board B" : "Board A"}
    </span>
  );

  if (!interactive) {
    return (
      <>
        <div
          role="group"
          aria-label={ariaLabel}
          data-side={currentSide}
          className={cn("relative block w-full rounded-3", className)}
        >
          {board}
        </div>
        {status}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={isB}
        aria-label={ariaLabel}
        data-side={currentSide}
        onClick={handleToggle}
        className={cn(
          "relative block w-full cursor-pointer rounded-3 text-left outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          className,
        )}
      >
        {board}
        <span className="sr-only">{boardLabel}</span>
      </button>
      {status}
    </>
  );
}

type MosaicTileProps = {
  faceA: React.ReactNode;
  faceB: React.ReactNode;
  /** True once this plate should rest on its B face. */
  isB: boolean;
  /** This plate's slice of the wave, seconds. */
  delay: number;
  motionSafe: boolean;
  tileAspect: number;
};

/**
 * One plate. A per-tile rotateY motion value drives the preserve-3d cell:
 * 0° rests on A, 180° on B, and every retarget stops the in-flight spring and
 * animates from the current angle — a mid-wave reversal peels back from
 * wherever it got to. Under reduced motion the value just parks on the
 * resting angle (self-healing if the preference flips mid-flight) and the
 * faces crossfade instead.
 */
function MosaicTile({ faceA, faceB, isB, delay, motionSafe, tileAspect }: MosaicTileProps) {
  const rotateY = useMotionValue(isB ? 180 : 0);
  const controls = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevBRef = React.useRef(isB);

  React.useEffect(() => {
    const target = isB ? 180 : 0;
    if (!motionSafe) {
      controls.current?.stop();
      controls.current = null;
      prevBRef.current = isB;
      rotateY.set(target);
      return;
    }
    if (prevBRef.current === isB) return;
    prevBRef.current = isB;
    controls.current?.stop();
    controls.current = animate(rotateY, target, {
      ...springs.snap,
      delay,
      onComplete: () => {
        controls.current = null;
      },
    });
  }, [isB, motionSafe, delay, rotateY]);

  React.useEffect(
    () => () => {
      controls.current?.stop();
      controls.current = null;
    },
    [],
  );

  return (
    <motion.span
      className="relative block"
      style={{
        aspectRatio: tileAspect,
        ...(motionSafe
          ? { rotateY, transformStyle: "preserve-3d" as const }
          : null),
      }}
    >
      <Face motionSafe={motionSafe} visible={!isB}>
        {faceA}
      </Face>
      <Face motionSafe={motionSafe} visible={isB} back>
        {faceB}
      </Face>
    </motion.span>
  );
}

type FaceProps = {
  motionSafe: boolean;
  /** Whether this face is the board's current one — crossfade target under reduced motion. */
  visible: boolean;
  /** Pre-rotated 180° so it shows once the plate has turned; carries the accent wash. */
  back?: boolean;
  children: React.ReactNode;
};

/**
 * One face of a plate. With rich motion both faces stay opaque and
 * backface-visibility decides which shows; under reduced motion the 3D rig is
 * detached and the faces crossfade at `durations.fast`. Clipping lives here —
 * never on the 3D nodes above. The B face layers a faint accent wash over the
 * same plate so the sweep stays legible in both themes.
 */
function Face({ motionSafe, visible, back = false, children }: FaceProps) {
  return (
    <motion.span
      aria-hidden={visible ? undefined : true}
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2 border border-hairline bg-surface-2 px-1"
      initial={false}
      animate={{ opacity: motionSafe || visible ? 1 : 0 }}
      transition={{ duration: durations.fast }}
      style={{
        pointerEvents: visible ? undefined : "none",
        backgroundImage: back
          ? "linear-gradient(var(--accent-wash), var(--accent-wash))"
          : undefined,
        ...(motionSafe
          ? {
              backfaceVisibility: "hidden" as const,
              transform: back ? "rotateY(180deg)" : undefined,
            }
          : null),
      }}
    >
      {children}
    </motion.span>
  );
}
