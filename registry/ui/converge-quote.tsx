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
import { clamp, djb2, mapRange, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type ConvergeQuoteProps = {
  /** Two to five lines of one quote, in reading order. */
  lines: string[];
  /** Source line, surfaced only once every quote line has landed. */
  attribution?: string;
  /** Scroll-stage height in px. @default 260 */
  height?: number;
  /** Fires crossing 85% assembly, deduped in both directions. */
  onConverge?: (converged: boolean) => void;
  className?: string;
  /** Label for the focusable scroll region. @default "Converging quote" */
  "aria-label"?: string;
};

/** Scroll track allotted per line, px — sets the scrub gearing. */
const LINE_STEP = 120;
/** Assembly fraction the onConverge threshold sits at. */
const CONVERGE_AT = 0.85;
/** Width of each line's assembly band in P. */
const BAND = 0.6;
/** Total P spread between the first and last band start: s = 0.4/(n−1). */
const STAGGER_SPAN = 1 - BAND;
/** Attribution surfaces over this final slice of P. */
const ATTRIBUTION_TAIL = 0.1;

type ScatterPose = {
  /** Horizontal jitter, % of the line's own width. */
  x: number;
  /** Vertical jitter beyond the stacked slot, px. */
  y: number;
  /** Depth scale — near lines above 1, far lines below. */
  scale: number;
  /** Tilt, deg. */
  rotate: number;
  /** Scatter opacity, depth-dimmed for far lines. */
  opacity: number;
};

/**
 * The line's scattered pose, minted deterministically from its index via
 * seeded(djb2) — identical on server, client, and every revisit. Lines
 * alternate near (scale above 1) and far (below 1) so the loose stack reads
 * at staggered depths, and far lines carry an extra depth dim on top of the
 * 0.35 scatter opacity.
 */
const scatterPose = (index: number): ScatterPose => {
  const rng = seeded(djb2(`line:${index}`));
  const near = index % 2 === 1;
  return {
    x: (rng() * 2 - 1) * 14,
    y: (rng() * 2 - 1) * 22,
    scale: near ? 1.02 + rng() * 0.12 : 0.82 + rng() * 0.12,
    rotate: (rng() * 2 - 1) * 4,
    opacity: near ? 0.35 : 0.27,
  };
};

/**
 * A pull-quote whose lines sit scattered at staggered depths — jittered,
 * tilted, dimmed, some near and some far — and converge into one readable
 * plane as the internal stage is scrolled. Every visual channel is the same
 * lerp between a line's deterministic scatter pose and its plain stacked
 * slot, each line assembling over its own band of scroll progress, so early
 * lines have landed while later ones are still afloat and the whole scrub is
 * springless and reversible. A faint accent haze behind the stack drifts
 * against the scroll to sell the depth, and the attribution surfaces under a
 * hairline rule only in the last tenth of the travel. Screen readers get the
 * whole quote as one sr-only blockquote (the staging is aria-hidden), the
 * region is keyboard-scrollable, and onConverge reports the 85% threshold
 * deduped in both directions. Under reduced motion the quote renders
 * assembled and static with the attribution visible, scrolling changes
 * nothing, and the readout pins at 100%.
 */
export function ConvergeQuote({
  lines,
  attribution,
  height = 260,
  onConverge,
  className,
  "aria-label": ariaLabel = "Converging quote",
}: ConvergeQuoteProps) {
  const motionSafe = useMotionSafe();

  // Scroll progress 0..1 as a motion value — every pose lerp, the haze
  // drift and the attribution reveal all derive from it via useTransform.
  const progress = useMotionValue(0);
  const [assemblyPct, setAssemblyPct] = React.useState(0);
  const pctRef = React.useRef(0);
  const convergedRef = React.useRef(false);

  const list = lines.slice(0, 5);
  const count = list.length;

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? clamp(el.scrollTop / max, 0, 1) : 0);
  };

  // Readout and threshold ride one event. Both dedupe through refs — the
  // readout commits per whole percent, onConverge only on an actual crossing
  // of 85%, each direction reported once. Reduced motion pins the readout
  // at 100% instead, so the pipeline stays quiet there.
  useMotionValueEvent(progress, "change", (value) => {
    if (!motionSafe) return;
    const p = clamp(value, 0, 1);
    const pct = Math.round(p * 100);
    if (pct !== pctRef.current) {
      pctRef.current = pct;
      setAssemblyPct(pct);
    }
    const converged = p >= CONVERGE_AT;
    if (converged !== convergedRef.current) {
      convergedRef.current = converged;
      onConverge?.(converged);
    }
  });

  // Depth haze parallax: the backdrop drifts counter to the scroll at ×0.2
  // of the stage height, so the stack reads as converging through depth.
  const hazeY = useTransform(progress, (p) => clamp(p, 0, 1) * height * 0.2);

  // Attribution reveal — only after every line has landed.
  const attributionReveal = useTransform(progress, (p) =>
    mapRange(clamp(p, 0, 1), 1 - ATTRIBUTION_TAIL, 1, 0, 1),
  );
  const attributionY = useTransform(attributionReveal, (r) => (1 - r) * 6);

  const displayPct = motionSafe ? assemblyPct : 100;

  return (
    <div className={cn("relative", className)}>
      <div
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-3 border outline-none focus-visible:ring-2"
      >
        {/* AT reads the quote whole; the scattered staging is decorative. */}
        <blockquote className="sr-only">
          <p>{list.join(" ")}</p>
          {attribution ? <footer>{attribution}</footer> : null}
        </blockquote>

        <div
          aria-hidden
          style={{ height: height + count * LINE_STEP }}
          className="pointer-events-none select-none"
        >
          <div
            className="sticky top-0 flex flex-col items-center justify-center gap-1 overflow-hidden px-5 text-center"
            style={{ height }}
          >
            {/* Depth haze: two blur-free accent-wash blobs behind the
                stack, drifting against the scroll. */}
            <motion.div
              className="absolute inset-0"
              style={motionSafe ? { y: hazeY } : undefined}
            >
              <span
                className="absolute top-[12%] left-[10%] h-32 w-44 rounded-full"
                style={{
                  background:
                    "radial-gradient(closest-side, var(--accent-wash), transparent)",
                }}
              />
              <span
                className="absolute right-[6%] bottom-[10%] h-36 w-52 rounded-full"
                style={{
                  background:
                    "radial-gradient(closest-side, var(--accent-wash), transparent)",
                }}
              />
            </motion.div>

            {motionSafe
              ? list.map((line, i) => (
                  <ConvergeLine
                    key={`${i}-${line}`}
                    line={line}
                    index={i}
                    count={count}
                    progress={progress}
                  />
                ))
              : /* Reduced motion: the quote assembled and static — plain
                   blockquote styling, nothing rides the scroll. */
                list.map((line, i) => (
                  <span
                    key={`${i}-${line}`}
                    className="text-ink relative text-xl font-semibold tracking-tight text-balance sm:text-2xl"
                  >
                    {line}
                  </span>
                ))}

            {attribution ? (
              <motion.div
                className="relative mt-4 flex flex-col items-center gap-2"
                style={
                  motionSafe
                    ? { opacity: attributionReveal, y: attributionY }
                    : undefined
                }
              >
                <span className="bg-hairline-strong h-px w-10" />
                <span className="text-label text-ink-3">{attribution}</span>
              </motion.div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bench readout: assembly mirrored under the stage. */}
      <p className="text-label text-ink-3 mt-2 px-1">
        ASSEMBLY &middot;{" "}
        <span className="text-ink-2 tabular-nums">
          {String(displayPct).padStart(2, "0")}%
        </span>
      </p>
    </div>
  );
}

type ConvergeLineProps = {
  line: string;
  index: number;
  count: number;
  progress: MotionValue<number>;
};

/**
 * One line of the quote. Its assembly e_k(P) maps scroll progress over the
 * line's own band [k·s, k·s + 0.6] with s = 0.4/max(n−1, 1), and every
 * channel — x, y, scale, rotate, opacity — is the lerp between the seeded
 * scatter pose and the plain stacked slot at that assembly. Near lines
 * stack above far ones so overlaps resolve by depth while the stack is
 * still loose.
 */
function ConvergeLine({ line, index, count, progress }: ConvergeLineProps) {
  const pose = scatterPose(index);
  const stagger = STAGGER_SPAN / Math.max(count - 1, 1);
  const start = index * stagger;

  /** e_k(P): this line's assembly, 0 scattered .. 1 landed. */
  const assembly = useTransform(progress, (p) =>
    mapRange(clamp(p, 0, 1), start, start + BAND, 0, 1),
  );

  const x = useTransform(assembly, (e) => `${(1 - e) * pose.x}%`);
  const y = useTransform(assembly, (e) => (1 - e) * pose.y);
  const scale = useTransform(assembly, (e) => pose.scale + (1 - pose.scale) * e);
  const rotate = useTransform(assembly, (e) => (1 - e) * pose.rotate);
  const opacity = useTransform(
    assembly,
    (e) => pose.opacity + (1 - pose.opacity) * e,
  );

  return (
    <motion.span
      className="text-ink relative text-xl font-semibold tracking-tight text-balance sm:text-2xl"
      style={{ x, y, scale, rotate, opacity, zIndex: pose.scale > 1 ? 2 : 1 }}
    >
      {line}
    </motion.span>
  );
}
