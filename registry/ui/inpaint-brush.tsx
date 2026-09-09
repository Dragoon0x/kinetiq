"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type InpaintStage = "paint" | "sweeping" | "resolved";

export type InpaintBrushProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Where the regeneration stands; the host drives it. @default "paint" */
  stage?: InpaintStage;
  /** 0..1 of the sweep while `stage` is "sweeping". @default 0 */
  progress?: number;
  /** Seeds the variant drawn under the mask; change it per regeneration. @default 1 */
  seed?: number;
  /** Dab radius in picture units (the picture is 160 by 100). @default 12 */
  brushSize?: number;
  /** Fires from the Regenerate control. */
  onRegenerate?: () => void;
  /** Fires when a stroke ends or the mask clears, with coverage as a whole percent. */
  onMaskChange?: (coverage: number) => void;
  /** Names the canvas for assistive technology. */
  label: string;
  /** Copy on the Regenerate control. @default "Regenerate" */
  regenerateLabel?: string;
  /** Copy on the Clear control. @default "Clear" */
  clearLabel?: string;
  className?: string;
};

type Dab = { x: number; y: number; r: number };
type Patch = { key: number; seed: number; dabs: Dab[] };
type Gesture = {
  id: number;
  startX: number;
  startY: number;
  origin: Dab;
  dragging: boolean;
};

const W = 160;
const H = 100;
/** Pixels of travel before a press becomes a stroke. */
const SLOP = 4;

/** SVG ids must survive url(#…) parsing — strip useId's sigil characters. */
const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");
const f1 = (n: number): number => Number(n.toFixed(1));
const f3 = (n: number): number => Number(n.toFixed(3));
const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/** Integer hashing only: no trig, so every engine paints the same scene. */
function hash(seed: number, salt: number): number {
  let x = (Math.imul(seed + 1, 374761393) + Math.imul(salt + 1, 668265263)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

/** A hill as a polygon: nine samples across the width, closed along the bottom. */
function hill(seed: number, salt: number, base: number, amp: number): string {
  const points: string[] = [];
  for (let index = 0; index <= 8; index += 1) {
    const y = f1(base - amp * hash(seed, salt * 31 + index));
    points.push(`${index * 20},${y}`);
  }
  return `0,${H} ${points.join(" ")} ${W},${H}`;
}

/** Back to front: salt, baseline, amplitude, opacity. */
const HILLS: [number, number, number, number][] = [
  [1, 66, 18, 0.35],
  [2, 76, 14, 0.6],
  [3, 86, 10, 1],
];

/** One mask per region: black hides, a white dab reveals. */
function DabMask({ id, dabs }: { id: string; dabs: Dab[] }) {
  return (
    <mask id={id} maskUnits="userSpaceOnUse">
      <rect width={W} height={H} fill="black" />
      {dabs.map((dab, index) => (
        <circle key={index} cx={dab.x} cy={dab.y} r={dab.r} fill="white" />
      ))}
    </mask>
  );
}

/** A gradient stop in a token colour. */
function Stop({
  at,
  color,
  alpha,
}: {
  at: number;
  color: string;
  alpha: number;
}) {
  return (
    <stop offset={at} stopColor={`var(--color-${color})`} stopOpacity={alpha} />
  );
}

/** The picture, drawn from a seed. Seed 0 is the original. */
function Scene({ seed, skyId }: { seed: number; skyId: string }) {
  const sunny = seed === 0 || hash(seed, 1) < 0.55;
  const cx = f1(104 + hash(seed, 2) * 40);
  const cy = f1(16 + hash(seed, 3) * 14);
  const r = f1(7 + hash(seed, 4) * 4);
  const trees = Array.from({ length: 5 }, (_, index) => ({
    key: index,
    x: f1(12 + hash(seed, 50 + index) * 136),
    h: f1(8 + hash(seed, 60 + index) * 8),
  }));
  return (
    <g>
      <rect width={W} height={H} className="fill-surface-2" />
      <rect width={W} height={H} fill={`url(#${skyId})`} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className={sunny ? "fill-warn" : "fill-ink-2"}
        opacity={sunny ? 1 : 0.6}
      />
      {HILLS.map(([salt, base, amp, opacity]) => (
        <polygon
          key={salt}
          points={hill(seed, salt, base, amp)}
          className="fill-success"
          opacity={opacity}
        />
      ))}
      {trees.map((tree) => (
        <polygon
          key={tree.key}
          points={`${tree.x},${f1(H - 6 - tree.h)} ${f1(tree.x - 3)},${H - 6} ${f1(tree.x + 3)},${H - 6}`}
          className="fill-ink-2"
          opacity={0.7}
        />
      ))}
    </g>
  );
}

/** Whole-percent coverage from a 16 by 10 sample grid — cheap, and honest enough for a readout. */
function coverage(dabs: Dab[]): number {
  if (dabs.length === 0) return 0;
  let hit = 0;
  for (let column = 0; column < 16; column += 1) {
    for (let row = 0; row < 10; row += 1) {
      const px = 5 + column * 10;
      const py = 5 + row * 10;
      if (
        dabs.some(
          (dab) => (dab.x - px) ** 2 + (dab.y - py) ** 2 <= dab.r * dab.r,
        )
      )
        hit += 1;
    }
  }
  return Math.round((hit / 160) * 100);
}

const buttonBase =
  "flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-50";

/**
 * Paint the part to redo. A procedural picture with a round brush: dragging
 * lays dabs that render through one SVG mask as a flat cobalt wash, so
 * overlapping dabs never darken; a tap lays one dab, and the pointer is
 * captured only after four pixels of travel so a click is never swallowed.
 * Regenerate hands the host `onRegenerate` and the host drives `stage` and
 * `progress`: a shimmer band travels across the masked region on the linear
 * ease and behind its front a second seeded scene resolves, clipped to the
 * mask. On "resolved" the dabs are committed as a patch, the wash clears, and
 * the next stroke starts a fresh mask on top of what was kept.
 *
 * The brush cursor follows the pointer or the arrow keys on `flick`; the
 * coverage chip arrives on `snap` once there is something to redo. The
 * canvas is a labelled application region with a keyboard path — arrows move,
 * Space paints, Backspace takes back a stroke — and the live region speaks
 * once per stroke and once per stage, never per dab. Under reduced motion the
 * shimmer is dropped and the sweep's edge alone reveals the result, because
 * progress is information and the glint is not.
 */
export function InpaintBrush({
  ref,
  stage = "paint",
  progress = 0,
  seed = 1,
  brushSize = 12,
  onRegenerate,
  onMaskChange,
  label,
  regenerateLabel = "Regenerate",
  clearLabel = "Clear",
  className,
}: InpaintBrushProps) {
  const motionSafe = useMotionSafe();
  const uid = safeId(React.useId());
  const labelId = `${uid}-label`;
  const helpId = `${uid}-help`;
  const skyId = `${uid}-sky`;
  const maskId = `${uid}-mask`;
  const clipId = `${uid}-clip`;
  const shimmerId = `${uid}-shimmer`;
  const svgRef = React.useRef<SVGSVGElement>(null);
  const gesture = React.useRef<Gesture | null>(null);

  const [strokes, setStrokes] = React.useState<Dab[][]>([]);
  const [patches, setPatches] = React.useState<Patch[]>([]);
  const [cursor, setCursor] = React.useState({ x: 80, y: 50 });
  const [cursorShown, setCursorShown] = React.useState(false);
  const [spoken, setSpoken] = React.useState("");

  // The resolve is a prop change, not an event, so the commit happens as
  // derived state: the working mask becomes a kept patch in the same render
  // that first sees "resolved", and no frame ever shows the wash over the
  // finished region.
  const [phase, setPhase] = React.useState(stage);
  if (phase !== stage) {
    setPhase(stage);
    if (stage === "resolved" && strokes.length > 0) {
      setPatches([
        ...patches,
        { key: patches.length, seed, dabs: strokes.flat() },
      ]);
      setStrokes([]);
      setSpoken("");
    }
  }

  const radius = Math.max(2, f1(brushSize));
  const sweeping = stage === "sweeping";
  const paintable = !sweeping;
  const dabs = strokes.flat();
  const covered = coverage(dabs);
  const front = sweeping ? f3(clamp(progress, 0, 1) * W) : 0;

  const toPicture = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: f1(clamp(((clientX - rect.left) / rect.width) * W, 0, W)),
      y: f1(clamp(((clientY - rect.top) / rect.height) * H, 0, H)),
    };
  };

  const finish = (next: Dab[][]) => {
    setStrokes(next);
    const percent = coverage(next.flat());
    setSpoken(percent > 0 ? `Mask covers ${percent} percent` : "Mask cleared");
    onMaskChange?.(percent);
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = toPicture(event.clientX, event.clientY);
    if (!point) return;
    setCursor(point);
    setCursorShown(true);
    if (!paintable) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...point, r: radius },
      dragging: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = toPicture(event.clientX, event.clientY);
    if (!point) return;
    setCursor(point);
    const active = gesture.current;
    if (!active || active.id !== event.pointerId || !paintable) return;
    if (!active.dragging) {
      const travel = Math.hypot(
        event.clientX - active.startX,
        event.clientY - active.startY,
      );
      if (travel < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a stroke, and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
      setStrokes((current) => [...current, [active.origin]]);
    }
    setStrokes((current) => {
      const last = current[current.length - 1];
      const tail = last?.[last.length - 1];
      // Dabs a third of a radius apart read as one continuous stroke while
      // keeping the mask small enough to sample.
      if (
        last &&
        tail &&
        Math.hypot(tail.x - point.x, tail.y - point.y) < radius * 0.35
      )
        return current;
      return [
        ...current.slice(0, -1),
        [...(last ?? []), { ...point, r: radius }],
      ];
    });
  };

  const onPointerEnd = (event: React.PointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
    if (active.dragging) finish(strokes);
    else finish([...strokes, [active.origin]]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = Math.max(4, Math.round(radius / 2));
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setCursorShown(true);
      setCursor({
        x: f1(clamp(cursor.x + move[0], 0, W)),
        y: f1(clamp(cursor.y + move[1], 0, H)),
      });
    } else if (event.key === " " || event.key === "Enter") {
      if (!paintable) return;
      event.preventDefault();
      setCursorShown(true);
      finish([...strokes, [{ ...cursor, r: radius }]]);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      if (!paintable || strokes.length === 0) return;
      event.preventDefault();
      finish(strokes.slice(0, -1));
    } else if (event.key === "Escape") {
      setCursorShown(false);
    }
  };

  const announcement = sweeping
    ? "Regenerating the masked area"
    : stage === "resolved" && strokes.length === 0
      ? "Masked area regenerated"
      : spoken;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <AnimatePresence initial={false}>
          {dabs.length > 0 ? (
            <motion.span
              key="coverage"
              aria-hidden
              className="flex h-6 shrink-0 items-center rounded-full bg-cobalt-wash px-2 font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase tabular-nums"
              initial={
                motionSafe ? { opacity: 0, x: distances.nudge } : { opacity: 0 }
              }
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              Mask {covered}%
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        role="application"
        aria-labelledby={labelId}
        aria-describedby={helpId}
        aria-busy={sweeping || undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setCursorShown(true)}
        onBlur={() => {
          if (!gesture.current) setCursorShown(false);
        }}
        className={cn(
          "relative w-full overflow-hidden rounded-2 border border-hairline bg-surface-2 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          paintable ? "cursor-crosshair" : "cursor-progress",
        )}
      >
        <svg
          ref={svgRef}
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerEnter={() => setCursorShown(true)}
          onPointerLeave={() => {
            if (!gesture.current) setCursorShown(false);
          }}
        >
          <defs>
            <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
              <Stop at={0} color="cobalt-bright" alpha={0.4} />
              <Stop at={1} color="cobalt-bright" alpha={0.04} />
            </linearGradient>
            <linearGradient id={shimmerId} x1="0" y1="0" x2="1" y2="0">
              <Stop at={0} color="cobalt-bright" alpha={0} />
              <Stop at={0.5} color="cobalt-bright" alpha={0.6} />
              <Stop at={1} color="cobalt-bright" alpha={0} />
            </linearGradient>
            {patches.map((patch) => (
              <DabMask
                key={patch.key}
                id={`${uid}-p${patch.key}`}
                dabs={patch.dabs}
              />
            ))}
            <DabMask id={maskId} dabs={dabs} />
            <clipPath id={clipId}>
              <motion.rect
                y={0}
                height={H}
                initial={false}
                animate={{ width: front }}
                transition={{ duration: durations.fast, ease: easings.linear }}
              />
            </clipPath>
          </defs>

          <Scene seed={0} skyId={skyId} />
          {patches.map((patch) => (
            <g key={patch.key} mask={`url(#${uid}-p${patch.key})`}>
              <Scene seed={patch.seed} skyId={skyId} />
            </g>
          ))}

          {/* Everything inside the working mask: the wash, then the variant
              revealed up to the sweep's front, then the glint riding it. */}
          <g mask={`url(#${maskId})`}>
            <motion.rect
              width={W}
              height={H}
              className="fill-cobalt-bright"
              initial={false}
              animate={{ opacity: sweeping ? 0.3 : 0.45 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            />
            {sweeping ? (
              <g clipPath={`url(#${clipId})`}>
                <Scene seed={seed} skyId={skyId} />
              </g>
            ) : null}
            {sweeping && motionSafe ? (
              <motion.rect
                y={0}
                width={28}
                height={H}
                fill={`url(#${shimmerId})`}
                initial={false}
                animate={{ attrX: f3(front - 14) }}
                transition={{ duration: durations.fast, ease: easings.linear }}
              />
            ) : null}
          </g>

          <motion.circle
            r={radius}
            fill="var(--color-cobalt-bright)"
            fillOpacity={0.12}
            stroke="var(--color-cobalt-bright)"
            strokeWidth={0.75}
            strokeDasharray="2 1.5"
            initial={false}
            animate={{
              cx: cursor.x,
              cy: cursor.y,
              opacity: cursorShown && paintable ? 1 : 0,
            }}
            transition={
              motionSafe
                ? { ...springs.flick, opacity: { duration: durations.fast } }
                : { duration: 0, opacity: { duration: durations.fast } }
            }
          />
        </svg>
        <span id={helpId} className="sr-only">
          Arrow keys move the brush, Space paints a dab, Backspace removes the
          last stroke.
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => finish([])}
          disabled={!paintable || strokes.length === 0}
          className={cn(buttonBase, "border-hairline-strong hover:bg-accent")}
        >
          {clearLabel}
        </button>
        <button
          type="button"
          onClick={() => onRegenerate?.()}
          disabled={!paintable || strokes.length === 0}
          aria-busy={sweeping || undefined}
          className={cn(
            buttonBase,
            "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {sweeping ? "Regenerating" : regenerateLabel}
        </button>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
