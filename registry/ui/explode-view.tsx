"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { liftShadowCss } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** One layer of the assembly, ordered bottom→top. */
export type Part = {
  /** Stable id — keys the part across renders. */
  id: string;
  /** Mono label parked in the leader-line column. */
  label: string;
  /** One-line note under the label. */
  detail?: string;
  /** The part's face. Falls back to an indexed tile when omitted. */
  node?: React.ReactNode;
};

export type ExplodeViewProps = {
  /** The parts, bottom of the assembly first. 2–8. */
  parts: Part[];
  /** Controlled exploded state. */
  exploded?: boolean;
  /** Initial state when uncontrolled. */
  defaultExploded?: boolean;
  /** Fires the new state whenever the toggle changes it. */
  onToggle?: (exploded: boolean) => void;
  /** Stage height in px. */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** Fixed layout width the stage's coordinate space is authored in — the SVG
 *  and every part/label position derive from this, then scale fluidly to
 *  the container via `w-full` (the arc-routes fixed-viewBox technique). */
const VIEW_W = 480;
/** Left inset the parts fan out from. */
const ORIGIN_X = 96;
/** Iso axis unit vector (up-and-right), shared by nest and fan offsets. */
const ISO_X = 1;
const ISO_Y = -0.6;
/** px each assembled part nudges along the iso axis — reads as one object. */
const NEST_STEP = 3;
/** px each exploded part separates along the iso axis, per part index. */
const GAP = 30;
/** Scale shed per part as it fans outward (front parts recede slightly). */
const DEPTH_SCALE = 0.035;
/** Scale applied to a hovered/focused part, on top of its depth scale. */
const HOVER_LIFT = 1.08;
/** Stage padding so the topmost/bottommost label never clips. */
const STAGE_PAD_Y = 20;
/** Width of the parked label column, view-space px. */
const LABEL_COL = 172;
/** Part tile size, px. */
const TILE = 52;

type LaidPart = Part & {
  index: number;
  /** Assembled (nested) offset along the iso axis, from the origin. */
  nestX: number;
  nestY: number;
  /** Exploded (fanned) offset along the iso axis, from the origin. */
  farX: number;
  farY: number;
  /** Depth scale at full explosion. */
  farScale: number;
  /** Label anchor, laddered evenly down the parked column. */
  labelX: number;
  labelY: number;
};

/** Lays out every part's nested/exploded offsets and label slot. Pure math,
 *  all in the fixed VIEW_W coordinate space — SSR-safe, no measurement. */
function layOut(parts: Part[], height: number): LaidPart[] {
  const count = parts.length;
  const last = Math.max(1, count - 1);
  const usableH = Math.max(1, height - STAGE_PAD_Y * 2);
  const laid: LaidPart[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = parts[i];
    if (!part) continue;
    laid.push({
      ...part,
      index: i,
      nestX: i * NEST_STEP * ISO_X,
      nestY: i * NEST_STEP * ISO_Y,
      farX: i * GAP * ISO_X,
      farY: i * GAP * ISO_Y,
      farScale: 1 - i * DEPTH_SCALE,
      labelX: VIEW_W - LABEL_COL,
      labelY: count <= 1 ? height / 2 : STAGE_PAD_Y + (i / last) * usableH,
    });
  }
  return laid;
}

/**
 * A layered object separated along a single iso axis — no canvas, no
 * preserve-3d. The whole stage is laid out in a fixed `VIEW_W` coordinate
 * space (the arc-routes technique) that scales fluidly with the container,
 * so every position is computed from props with no DOM measurement.
 *
 * Assembled, every part sits within a few px of the origin, nudged up-right
 * (`NEST_STEP` per index) with a `liftShadowCss` contact shadow that deepens
 * with index, so the stack reads as one solid object. Exploding fans each
 * part outward along that same axis to `index · GAP`, scaling down slightly
 * with depth, on `springs.glide` under a `cascade` stagger that leads with
 * the front (topmost/highest-index) part first — the lid-off read of a real
 * exploded diagram. An SVG leader line runs from each part's live anchor to
 * its label parked in a fixed right-hand column; leaders and labels fade in
 * with the fan and fade out when the parts re-nest.
 *
 * Hovering or focusing a part (a real button in tab order) lifts it a touch
 * and accents both the part and its leader/label, tying a labeled part back
 * to its physical piece.
 *
 * Reduced motion: no slide — toggling swaps instantly between the nested and
 * fanned layouts, leaders and labels appear/disappear instantly with it.
 * Callbacks, announcements, and the controlled/uncontrolled contract are
 * identical either way.
 */
export function ExplodeView({
  parts,
  exploded: controlledExploded,
  defaultExploded = false,
  onToggle,
  height = 300,
  className,
  "aria-label": ariaLabel,
}: ExplodeViewProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const [uncontrolledExploded, setUncontrolledExploded] =
    React.useState(defaultExploded);
  const isExploded = controlledExploded ?? uncontrolledExploded;

  const [activeId, setActiveId] = React.useState<string | null>(null);

  const count = parts.length;
  const cascadeStep = cascade(count);
  const laidParts = layOut(parts, height);

  const handleToggle = () => {
    const next = !isExploded;
    if (controlledExploded === undefined) setUncontrolledExploded(next);
    onToggle?.(next);
  };

  const announcement =
    count === 0 ? "" : isExploded ? `Exploded, ${count} parts` : "Assembled";
  const hudText = isExploded ? "VIEW · EXPLODED" : "VIEW · ASSEMBLED";

  const pct = (x: number) => `${(x / VIEW_W) * 100}%`;

  return (
    <div className={cn("w-full", className)}>
      <div
        role="group"
        aria-label={ariaLabel ?? "Exploded assembly view"}
        className="relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-0"
        style={{ height }}
      >
        {/* Leader lines: fixed VIEW_W coordinate space, scaled fluidly via
            the enclosing w-full — same technique as every part/label below. */}
        <svg
          viewBox={`0 0 ${VIEW_W} ${height}`}
          preserveAspectRatio="none"
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {laidParts.map((part) => {
            const isActive = part.id === activeId;
            const x1 = ORIGIN_X + (isExploded ? part.farX : part.nestX);
            const y1 = height / 2 + (isExploded ? part.farY : part.nestY);
            return (
              <motion.line
                key={part.id}
                x1={x1}
                y1={y1}
                x2={part.labelX}
                y2={part.labelY}
                stroke={isActive ? "var(--accent-bright)" : "var(--accent)"}
                strokeWidth={isActive ? 1.5 : 1}
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={{ opacity: isExploded ? (isActive ? 0.9 : 0.4) : 0 }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        delay: (count - 1 - part.index) * cascadeStep,
                      }
                    : { duration: 0 }
                }
              />
            );
          })}
        </svg>

        {/* The parts: nest centered on toggle-off, fan along the iso axis on.
            Positioned as percentages of VIEW_W so they track the SVG lines. */}
        {laidParts.map((part) => {
          const isActive = part.id === activeId;
          const depthScale = isExploded ? part.farScale : 1;
          const pose = {
            x: isExploded ? part.farX : part.nestX,
            y: isExploded ? part.farY : part.nestY,
            scale: isActive ? HOVER_LIFT * depthScale : depthScale,
          };
          const shadowAltitude = isExploded
            ? 0.35 + part.index * 0.08
            : 0.06 + part.index * 0.025;

          return (
            <motion.button
              key={part.id}
              type="button"
              aria-label={`${part.label}${part.detail ? `: ${part.detail}` : ""}`}
              aria-describedby={`${uid}-${part.id}-label`}
              onPointerEnter={() => setActiveId(part.id)}
              onPointerLeave={() =>
                setActiveId((cur) => (cur === part.id ? null : cur))
              }
              onFocus={() => setActiveId(part.id)}
              onBlur={() => setActiveId((cur) => (cur === part.id ? null : cur))}
              initial={false}
              animate={pose}
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      delay: (count - 1 - part.index) * cascadeStep,
                    }
                  : { duration: 0 }
              }
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-2 border text-[10px] font-medium tracking-[0.06em] uppercase outline-none",
                "focus-visible:ring-2 focus-visible:ring-cobalt-bright/40",
                isActive
                  ? "border-hairline-strong bg-surface-2 text-cobalt-bright"
                  : "border-hairline bg-surface-1 text-ink-2",
              )}
              style={{
                left: pct(ORIGIN_X),
                top: "50%",
                width: TILE,
                height: TILE,
                zIndex: 10 + part.index,
                boxShadow: liftShadowCss(shadowAltitude),
              }}
            >
              {part.node ?? String(part.index + 1).padStart(2, "0")}
            </motion.button>
          );
        })}

        {/* Labels: parked in the fixed right-hand column, keyed to the
            leaders and positioned at the same percentage coordinates. */}
        {laidParts.map((part) => {
          const isActive = part.id === activeId;
          return (
            <motion.div
              key={part.id}
              id={`${uid}-${part.id}-label`}
              className="pointer-events-none absolute -translate-y-1/2 text-right"
              style={{
                left: pct(part.labelX),
                top: part.labelY,
                width: `${(LABEL_COL / VIEW_W) * 100}%`,
                paddingRight: 12,
              }}
              initial={false}
              animate={{
                opacity: isExploded ? 1 : 0,
                x: isExploded ? 0 : 8,
              }}
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      delay: (count - 1 - part.index) * cascadeStep,
                    }
                  : { duration: 0 }
              }
            >
              <p
                className={cn(
                  "text-label truncate transition-colors",
                  isActive ? "text-cobalt-bright" : "text-ink-2",
                )}
              >
                {part.label}
              </p>
              {part.detail ? (
                <p className="truncate text-[10px] leading-tight text-ink-3">
                  {part.detail}
                </p>
              ) : null}
            </motion.div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-label text-ink-3">{hudText}</p>
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "cursor-pointer rounded-2 border border-cobalt/50 bg-cobalt-wash px-3.5 py-1.5 text-label text-cobalt transition-colors",
            "outline-none hover:border-cobalt focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {isExploded ? "COLLAPSE" : "EXPLODE"}
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
