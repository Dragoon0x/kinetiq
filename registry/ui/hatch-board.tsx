"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type Hatch = {
  /** Stable identity — the currency of `openIds` and `onOpenChange`. */
  id: string;
  /**
   * Accessible name for this hatch — it names both the lid button and the
   * revealed well region. Required because `lid` is free-form; consumers
   * should still put visible text in the lid so sighted users read the same
   * name the label announces.
   */
  label: string;
  /** Face shown on the closed lid; the board adds the latch tab and index. */
  lid: React.ReactNode;
  /** What lies beneath — dimmed and inert until the lid pops. */
  well: React.ReactNode;
};

export type HatchBoardProps = {
  /** The hatches, row-major. Designed for 4–9; entries beyond 9 are ignored. */
  hatches: Hatch[];
  /** Grid columns; rows derive from the hatch count. @default 3 */
  columns?: number;
  /** Controlled open set. */
  openIds?: string[];
  /** Uncontrolled initial open set. @default [] */
  defaultOpenIds?: string[];
  onOpenChange?: (openIds: string[]) => void;
  /** Cell width / height. @default 1.1 */
  cellAspect?: number;
  className?: string;
  /** Names the board group. @default "Hatch board" */
  "aria-label"?: string;
};

/** Resting angle of an open lid — past vertical, leaning back off its hinge. */
const OPEN_ANGLE = -108;

/**
 * The most recent board-level gesture. OPEN ALL and SHUT ALL set it so each
 * cell can derive its slice of the cascade in render; a single lid toggle
 * clears it so lone pops fire immediately.
 */
type Wave = "open" | "shut" | null;

/**
 * A grid of spring-loaded hatches; each pops open in 3D to reveal what lies
 * beneath. Every cell is a recessed well (dimmed and inert while shut) under
 * a lid hinged at its top edge. Popping a lid animates rotateX 0 → −108° on
 * `springs.snap` — the visible kick past −108 and settle is the spring's own
 * overshoot, never keyframes — inside a per-cell `perspectives.base`, so
 * every hatch pops with the same geometry. Latching shut is an exit: a tween
 * back to 0° at `durations.base` on `easings.exit`, and on landing the
 * cell's frame dips to 0.995 and springs back on `springs.flick` — the
 * latch's click. The open lid stays clickable at its resting angle (the
 * browser hit-tests the transformed flap), so the same button opens and
 * shuts. Hatches are independent; OPEN ALL / SHUT ALL sweep the board with a
 * `cascade(count)` stagger from the top-left corner, reversed for shutting.
 *
 * Semantics: each lid is a real `<button aria-expanded aria-controls>` named
 * by the hatch's required `label`; each well is a `role="region"` with the
 * same name, inert until revealed. The board is a labelled group with real
 * OPEN ALL / SHUT ALL buttons, and an sr-only polite status announces
 * "N open" as the set changes.
 *
 * Reduced motion: no hinge, no cascade — lids fade out and in flat at
 * `durations.fast`, all at once, and a slim lid-edge strip stands in as the
 * visible shut control while a lid is faded away. Identical semantics.
 *
 * Every in-flight control is stopped on unmount; retargeting a mid-pop lid
 * stops the spring and continues from wherever it got to.
 */
export function HatchBoard({
  hatches,
  columns = 3,
  openIds: openIdsProp,
  defaultOpenIds,
  onOpenChange,
  cellAspect = 1.1,
  className,
  "aria-label": ariaLabel = "Hatch board",
}: HatchBoardProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState<string[]>(
    defaultOpenIds ?? [],
  );
  const [wave, setWave] = React.useState<Wave>(null);
  const openIds = openIdsProp ?? uncontrolledOpen;

  const list = hatches.slice(0, 9);
  const count = list.length;
  const cols = Math.max(1, Math.floor(columns));
  const openCount = list.filter((hatch) => openIds.includes(hatch.id)).length;

  // The wave: each cell waits its euclidean distance from the top-left cell
  // × the cascade interval — pure geometry, so every sweep replays
  // identically. Shutting runs the same wave backwards. Lone toggles (wave
  // null) and reduced motion fire with no delay at all.
  const step = cascade(count);
  const distFor = (index: number): number =>
    Math.hypot(Math.floor(index / cols), index % cols);
  const maxDist = list.reduce(
    (max, _, index) => Math.max(max, distFor(index)),
    0,
  );
  const delayFor = (index: number): number => {
    if (!motionSafe || wave === null) return 0;
    const dist = distFor(index);
    return (wave === "open" ? dist : maxDist - dist) * step;
  };

  const commit = (next: string[], nextWave: Wave) => {
    setWave(nextWave);
    if (openIdsProp === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const toggleHatch = (id: string) => {
    commit(
      openIds.includes(id)
        ? openIds.filter((openId) => openId !== id)
        : [...openIds, id],
      null,
    );
  };

  return (
    <div role="group" aria-label={ariaLabel} className={cn("w-full", className)}>
      {/* Board controls — real buttons, disabled once they would be no-ops. */}
      <div className="mb-3 flex items-center gap-2">
        <BoardChip
          disabled={openCount === count}
          onClick={() => commit(list.map((hatch) => hatch.id), "open")}
        >
          OPEN ALL
        </BoardChip>
        <BoardChip
          disabled={openCount === 0}
          onClick={() => commit([], "shut")}
        >
          SHUT ALL
        </BoardChip>
      </div>

      {/* Recessed mounting plate. Never clips — open lids swing above it. */}
      <div
        className="rounded-3 border border-hairline bg-surface-0/50 p-3"
        style={{
          boxShadow: "inset 0 1px 4px oklch(0.05 0.02 258 / 0.12)",
        }}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: 10,
          }}
        >
          {list.map((hatch, index) => (
            <HatchCell
              key={hatch.id}
              hatch={hatch}
              index={index}
              open={openIds.includes(hatch.id)}
              delay={delayFor(index)}
              motionSafe={motionSafe}
              cellAspect={cellAspect}
              onToggle={() => toggleHatch(hatch.id)}
            />
          ))}
        </div>
      </div>

      <span role="status" className="sr-only">
        {openCount} open
      </span>
    </div>
  );
}

type HatchCellProps = {
  hatch: Hatch;
  index: number;
  open: boolean;
  /** This cell's slice of a board-level wave, seconds. 0 for lone toggles. */
  delay: number;
  motionSafe: boolean;
  cellAspect: number;
  onToggle: () => void;
};

/**
 * One hatch. A rotateX motion value drives the lid plate — 0° latched,
 * −108° popped — hinged on the cell's top edge inside the button's own
 * perspective. Opens spring on `snap` (overshoot included), closes tween on
 * `easings.exit`, and the close's completion fires the latch click: the
 * frame dips via `frameScale.set(0.995)` then springs home on `flick`.
 * Retargets stop the in-flight control and continue from the current angle;
 * under reduced motion the value parks flat and the lid crossfades instead.
 */
function HatchCell({
  hatch,
  index,
  open,
  delay,
  motionSafe,
  cellAspect,
  onToggle,
}: HatchCellProps) {
  const wellId = React.useId();
  const rotateX = useMotionValue(motionSafe && open ? OPEN_ANGLE : 0);
  const frameScale = useMotionValue(1);
  const lidControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const pulseControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevOpenRef = React.useRef(open);

  React.useEffect(() => {
    if (!motionSafe) {
      // Flat fades only — park the rig and let opacity carry the reveal.
      lidControls.current?.stop();
      lidControls.current = null;
      pulseControls.current?.stop();
      pulseControls.current = null;
      prevOpenRef.current = open;
      rotateX.set(0);
      frameScale.set(1);
      return;
    }
    if (prevOpenRef.current === open) {
      // No transition — just self-heal the resting angle (e.g. the reduced
      // motion preference flipped back) without touching an in-flight pop.
      if (lidControls.current === null) rotateX.set(open ? OPEN_ANGLE : 0);
      return;
    }
    prevOpenRef.current = open;
    lidControls.current?.stop();
    if (open) {
      // The pop: one spring to −108°. Its ζ 0.83 overshoot IS the kick past
      // the resting angle — exactly two keyframes, current → target.
      lidControls.current = animate(rotateX, OPEN_ANGLE, {
        ...springs.snap,
        delay,
        onComplete: () => {
          lidControls.current = null;
        },
      });
    } else {
      // The latch: exits are tweens. On landing, the click — frame dips and
      // springs back on flick.
      lidControls.current = animate(rotateX, 0, {
        duration: durations.base,
        ease: easings.exit,
        delay,
        onComplete: () => {
          lidControls.current = null;
          pulseControls.current?.stop();
          frameScale.set(0.995);
          pulseControls.current = animate(frameScale, 1, {
            ...springs.flick,
            onComplete: () => {
              pulseControls.current = null;
            },
          });
        },
      });
    }
  }, [open, motionSafe, delay, rotateX, frameScale]);

  React.useEffect(
    () => () => {
      lidControls.current?.stop();
      lidControls.current = null;
      pulseControls.current?.stop();
      pulseControls.current = null;
    },
    [],
  );

  const cellIndex = String(index + 1).padStart(2, "0");
  const lidHidden = !motionSafe && open;

  return (
    <motion.div
      data-open={open || undefined}
      className="relative"
      style={{ aspectRatio: cellAspect, scale: frameScale }}
    >
      {/* The well — recessed plate holding the goods, inert until revealed. */}
      <div
        id={wellId}
        role="region"
        aria-label={hatch.label}
        inert={open ? undefined : true}
        className={cn(
          "absolute inset-0 overflow-hidden rounded-2 border bg-surface-0 transition-colors",
          open ? "border-cobalt-bright/45" : "border-hairline",
        )}
        style={{
          boxShadow:
            "inset 0 2px 6px oklch(0.05 0.02 258 / 0.2), inset 0 1px 2px oklch(0.05 0.02 258 / 0.16)",
        }}
      >
        <motion.div
          initial={false}
          animate={{ opacity: open ? 1 : 0.45 }}
          transition={
            motionSafe
              ? {
                  duration: durations.base,
                  ease: open ? easings.enter : easings.exit,
                  delay,
                }
              : { duration: durations.fast }
          }
          className="flex h-full w-full items-center justify-center p-2"
        >
          {hatch.well}
        </motion.div>
      </div>

      {/* The lid. One button opens and shuts: pointer events live on its
          children, so the closed plate is the target, the open flap stays
          clickable at its transformed angle, and clicks elsewhere fall
          through to the revealed well. The button owns the vanishing point —
          nothing on this branch clips or filters, or Safari flattens it. */}
      <motion.button
        type="button"
        aria-expanded={open}
        aria-controls={wellId}
        aria-label={hatch.label}
        onClick={onToggle}
        className={cn(
          "pointer-events-none absolute inset-0 block rounded-2 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
        style={{
          perspective: motionSafe ? perspectives.base : undefined,
        }}
      >
        {/* The rotating plate — hinged on the top edge. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: lidHidden ? 0 : 1 }}
          transition={{ duration: durations.fast }}
          className="absolute inset-0 block cursor-pointer"
          style={{
            rotateX,
            transformOrigin: "50% 0%",
            pointerEvents: lidHidden ? "none" : "auto",
            ...(motionSafe
              ? { transformStyle: "preserve-3d" as const }
              : null),
          }}
        >
          {/* Top face: consumer lid art, mono corner index, latch tab. */}
          <span
            className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-2 border border-hairline bg-surface-2 px-1"
            style={{
              boxShadow: "0 1px 2px oklch(0.05 0.02 258 / 0.18)",
              ...(motionSafe
                ? { backfaceVisibility: "hidden" as const }
                : null),
            }}
          >
            <span className="absolute top-1 left-1.5 font-mono text-[8px] tracking-[0.14em] text-ink-3 tabular-nums">
              {cellIndex}
            </span>
            {hatch.lid}
            {/* The latch tab — turns aside as the lid pops. */}
            <motion.span
              initial={false}
              animate={{ rotate: open ? -52 : 0 }}
              transition={
                motionSafe
                  ? open
                    ? { ...springs.snap, delay }
                    : { duration: durations.base, ease: easings.exit, delay }
                  : { duration: durations.fast }
              }
              className="absolute bottom-1 h-1.5 w-4 rounded-full border border-hairline-strong bg-surface-1"
              style={{ left: "calc(50% - 8px)" }}
            />
          </span>
          {/* Underside — what you see once the lid leans past vertical. */}
          {motionSafe ? (
            <span
              className="absolute inset-0 overflow-hidden rounded-2 border border-hairline bg-surface-1"
              style={{
                transform: "rotateX(180deg)",
                backfaceVisibility: "hidden",
                boxShadow: "0 1px 2px oklch(0.05 0.02 258 / 0.18)",
              }}
            >
              <span className="absolute inset-x-2 top-1 h-px bg-cobalt-bright/40" />
            </span>
          ) : null}
        </motion.span>

        {/* Reduced-motion lid-edge strip: with the lid faded away, this slim
            rail at the hinge stays as the visible shut control. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: lidHidden ? 1 : 0 }}
          transition={{ duration: durations.fast }}
          className="absolute inset-x-0 top-0 flex h-5 cursor-pointer items-center justify-center rounded-t-2 border-b border-hairline bg-surface-2"
          style={{ pointerEvents: lidHidden ? "auto" : "none" }}
        >
          <span className="h-1 w-4 -rotate-45 rounded-full border border-hairline-strong bg-surface-1" />
        </motion.span>
      </motion.button>
    </motion.div>
  );
}

/** OPEN ALL / SHUT ALL chip — mono, hairline, a real button. */
function BoardChip({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-ink-2 transition-colors",
        "hover:border-hairline-strong hover:text-ink",
        "focus-visible:ring-cobalt-bright/50 outline-none focus-visible:ring-2",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}
