"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type PopPiece = {
  /** Stable id — keys the cutout across renders. */
  id: string;
  /** The cutout's face — rendered on an instrument plate. */
  node: React.ReactNode;
  /** Rank on the fold: 0 = back rank, 2 = front. Defaults stagger by index. */
  row?: 0 | 1 | 2;
};

export type PopBookProps = {
  /** The hinged cutouts standing on the fold. 3–6. */
  pieces: PopPiece[];
  /** Scroll-stage height in px. @default 280 */
  height?: number;
  /** Fires as the spread opens — 0..1, deduped to 0.05 steps. */
  onOpenChange?: (openness: number) => void;
  className?: string;
  /** Label for the focusable scroll region. @default "Pop-up spread" */
  "aria-label"?: string;
};

/** Extra scroll track beyond the stage, px — sets the scrub gearing. */
const TRAVEL = 320;
/** The center fold, % from the top of the stage. */
const FOLD = 55;
/** Each page half's layout height, % of the stage. */
const PAGE_HEIGHT = 38;
/** Near page tilt, deg — toward the viewer at rest, relaxing open. */
const NEAR_PAGE = { rest: 62, open: 38 } as const;
/** Far page tilt, deg — lying back at rest, relaxing open. */
const FAR_PAGE = { rest: -58, open: -30 } as const;
/** A piece starts lying flat against the far page. */
const PIECE_REST_DEG = 88;
/** Rise-band starts by rank — the back rank rises first. */
const BAND_START = [0.08, 0.24, 0.4] as const;
/** Every band spans this much progress, so all ranks stand by P = 0.9. */
const BAND_SPAN = 0.5;
/** Piece scale by rank — the front rank reads nearest. */
const RANK_SCALE = [0.85, 1, 1.1] as const;
/** Base lift off the fold by rank, px — the back rank stands deeper. */
const RANK_BASE = [10, 3, -3] as const;
/** Deterministic fold slots by index, % — spread across the middle 70%. */
const SLOTS = [15, 85, 35, 65, 50, 25] as const;
/** onOpenChange granularity. */
const STEP = 0.05;

/**
 * A pop-up spread — hinged cutouts rise from the center fold as you scroll.
 * Inside an internal scroll region a sticky stage holds two page halves
 * meeting at a horizontal fold under `perspective(perspectives.far)`, each
 * half its own flat transform: the near page tilts toward the viewer at 62°,
 * the far page lies back at −58°, and scroll progress P relaxes both toward
 * open (38° / −30°) while the cutouts stand. Each piece hinges on the fold
 * with origin bottom, its rotateX mapped 88°→0° over its rank's slice of the
 * travel — back rank first, front last, everyone standing by P = 0.9 — with
 * scale, z-order, base depth, and a base fold-shadow keyed to the same rise.
 * Everything is a useTransform off scroll progress: scrubbed 1:1, springless,
 * reversible, nothing free-running. `onOpenChange` reports openness on a
 * 0.05 lattice via useMotionValueEvent; screen readers get the cutouts whole
 * as an sr-only list (the paper staging is decorative), the region is
 * focusable and natively key-scrollable, and a mono SPREAD · NN% readout
 * stamps the corner. Reduced motion: the spread renders fully open and
 * static, scroll does nothing visual, and the readout pins to 100%.
 */
export function PopBook({
  pieces,
  height = 280,
  onOpenChange,
  className,
  "aria-label": ariaLabel = "Pop-up spread",
}: PopBookProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const progress = useMotionValue(0);
  const [openStep, setOpenStep] = React.useState(0);
  const steppedRef = React.useRef(0);

  const list = pieces.slice(0, 6);

  const nearRot = useTransform(progress, (p) =>
    mapRange(p, 0, 1, NEAR_PAGE.rest, NEAR_PAGE.open),
  );
  const farRot = useTransform(progress, (p) =>
    mapRange(p, 0, 1, FAR_PAGE.rest, FAR_PAGE.open),
  );

  // Re-sync progress if the browser restored a scroll position (or the
  // reduced-motion pathway flipped). Motion-value writes only — any change
  // notification lands through the subscription below.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? el.scrollTop / max : 0);
  }, [progress, motionSafe, height]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? el.scrollTop / max : 0);
  };

  // Openness reports on a 0.05 lattice: state and the callback move only
  // when the stepped value crosses to a new notch.
  useMotionValueEvent(progress, "change", (p) => {
    const stepped = Math.round(clamp(p, 0, 1) / STEP) * STEP;
    if (stepped === steppedRef.current) return;
    steppedRef.current = stepped;
    setOpenStep(stepped);
    onOpenChange?.(stepped);
  });

  const shownOpenness = motionSafe ? openStep : 1;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-3 border outline-none focus-visible:ring-2"
      >
        {/* AT reads the cutouts whole; the paper staging below is decorative. */}
        <ol className="sr-only">
          {list.map((piece) => (
            <li key={piece.id}>{piece.node}</li>
          ))}
        </ol>

        <div
          aria-hidden
          style={{ height: motionSafe ? height + TRAVEL : height }}
          className="pointer-events-none select-none"
        >
          <div
            className="sticky top-0 overflow-hidden"
            style={{ height, perspective: perspectives.far }}
          >
            {/* Far page — lying back past the fold, a shade dimmer. */}
            <motion.div
              className="border-hairline bg-surface-1 absolute inset-x-4 rounded-t-2 border"
              style={{
                top: `${FOLD - PAGE_HEIGHT}%`,
                height: `${PAGE_HEIGHT}%`,
                rotateX: motionSafe ? farRot : FAR_PAGE.open,
                transformOrigin: "50% 100%",
                willChange: "transform",
              }}
            >
              <span className="absolute inset-0 rounded-t-2 bg-black/5" />
            </motion.div>

            {/* Near page — tilted toward the viewer. */}
            <motion.div
              className="border-hairline bg-surface-1 absolute inset-x-4 rounded-b-2 border"
              style={{
                top: `${FOLD}%`,
                height: `${PAGE_HEIGHT}%`,
                rotateX: motionSafe ? nearRot : NEAR_PAGE.open,
                transformOrigin: "50% 0%",
                willChange: "transform",
              }}
            />

            {/* The center fold. */}
            <span
              className="bg-hairline-strong absolute inset-x-4 h-px"
              style={{ top: `${FOLD}%` }}
            />

            {list.map((piece, i) => (
              <PopPlate
                key={piece.id}
                piece={piece}
                index={i}
                motionSafe={motionSafe}
                progress={progress}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mono readout — openness on the same 5% lattice the callback reports. */}
      <p className="text-label text-ink-3 pointer-events-none absolute bottom-2 left-3 tabular-nums">
        SPREAD &middot;{" "}
        {String(Math.round(shownOpenness * 100)).padStart(2, "0")}%
      </p>
    </div>
  );
}

type PopPlateProps = {
  piece: PopPiece;
  index: number;
  motionSafe: boolean;
  progress: MotionValue<number>;
};

/**
 * One hinged cutout standing on the fold. Its rank picks the rise band —
 * rotateX runs 88° (flat against the far page) to 0° (upright) across that
 * slice of scroll, origin at its base — plus the depth dressing: back ranks
 * sit higher on the fold, smaller, and stack behind. The fold-shadow at the
 * base gathers as the piece stands, keyed to the same rise.
 */
function PopPlate({ piece, index, motionSafe, progress }: PopPlateProps) {
  const rank: 0 | 1 | 2 = piece.row ?? ((index % 3) as 0 | 1 | 2);
  const start = BAND_START[rank];
  const rotateX = useTransform(progress, (p) =>
    mapRange(p, start, start + BAND_SPAN, PIECE_REST_DEG, 0),
  );
  const shadow = useTransform(progress, (p) =>
    mapRange(p, start, start + BAND_SPAN, 0, 0.35),
  );

  return (
    <div
      className="absolute w-max"
      style={{
        left: `${SLOTS[index] ?? 50}%`,
        bottom: `calc(${100 - FOLD}% + ${RANK_BASE[rank]}px)`,
        zIndex: rank + 1,
      }}
    >
      <motion.div
        className="border-hairline bg-surface-2 relative rounded-2 border px-3 py-2"
        style={{
          x: "-50%",
          scale: RANK_SCALE[rank],
          rotateX: motionSafe ? rotateX : 0,
          transformOrigin: "50% 100%",
          willChange: "transform",
        }}
      >
        {piece.node}
        {/* Fold shadow — gathers at the base as the piece stands. */}
        <motion.span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3 rounded-b-2 bg-gradient-to-t from-black/40 to-transparent"
          style={{ opacity: motionSafe ? shadow : 0.35 }}
        />
      </motion.div>
    </div>
  );
}
