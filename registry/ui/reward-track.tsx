"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Progress units between adjacent nodes — also the pixel spacing along the
 * track, since 1 progress unit maps to 1px. */
const NODE_SPACING = 100;
/** Room left of the first node and right of the last, so the head and the
 * reward chips never clip the stage edge. */
const TRACK_PAD_X = 40;
/** Node footprint (px); milestones step up to the larger size. */
const NODE_SIZE = 36;
const MILESTONE_SIZE = 48;
/** The bright marker riding the fill. */
const HEAD_SIZE = 14;
/** Distance from the track's centre line to a reward chip's centre. */
const GLYPH_OFFSET = 46;
const CHIP_W = 58;
const CHIP_H = 22;
const STAGE_H = 150;
const TRACK_Y = 75;

/** Slow breathing loop for a `ready` node's outline. */
const PULSE_S = 2.2;
/** How far a claimed chip flies further in the direction it was already
 * leaning, before it fades out. */
const FLY_DISTANCE = 30;
const FLY_DURATION_S = 0.55;
const FLY_DURATION_MS = Math.round(FLY_DURATION_S * 1000);
const BURST_DURATION_S = 0.5;
const BURST_DURATION_MS = Math.round(BURST_DURATION_S * 1000);
const MILESTONE_BURST_DURATION_S = 0.6;
const MILESTONE_BURST_DURATION_MS = Math.round(
  MILESTONE_BURST_DURATION_S * 1000,
);
const MILESTONE_RING_SIZE = 64;
/** How long a milestone's naming caption holds before it clears. */
const CAPTION_FLASH_MS = 1300;

const TAU = Math.PI * 2;
const BURST_SPARK_COUNT = 5;
const BURST_SPREAD = 20;
/** Five fixed spark vectors thrown from a claimed node — deterministic, no
 * Math.random. */
const BURST_SPARKS = Array.from({ length: BURST_SPARK_COUNT }, (_, i) => {
  const angle = (i / BURST_SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * BURST_SPREAD,
    dy: Math.sin(angle) * BURST_SPREAD,
  };
});
const MILESTONE_SPARK_COUNT = 8;
const MILESTONE_SPREAD = 34;
/** Eight fixed spark vectors for the bigger milestone reaction. */
const MILESTONE_SPARKS = Array.from(
  { length: MILESTONE_SPARK_COUNT },
  (_, i) => {
    const angle = (i / MILESTONE_SPARK_COUNT) * TAU - TAU / 4;
    return {
      dx: Math.cos(angle) * MILESTONE_SPREAD,
      dy: Math.sin(angle) * MILESTONE_SPREAD,
    };
  },
);

const MILESTONE_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 70%, var(--primary))";
const MILESTONE_RING_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 62%, transparent)";
const MILESTONE_SPARK_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 80%, var(--primary-foreground))";
const SPARK_COLOR =
  "color-mix(in oklab, var(--primary) 75%, var(--primary-foreground))";

export type TrackNode = {
  id: string;
  label: string;
  /** Forces (or suppresses) the milestone treatment. Unset falls back to
   * "every 5th node". */
  milestone?: boolean;
};

const DEFAULT_NODES: readonly TrackNode[] = [
  { id: "n1", label: "+50" },
  { id: "n2", label: "+50" },
  { id: "n3", label: "SKIN" },
  { id: "n4", label: "+75" },
  { id: "n5", label: "CRATE" },
  { id: "n6", label: "+50" },
  { id: "n7", label: "x2" },
  { id: "n8", label: "+100" },
  { id: "n9", label: "SKIN" },
  { id: "n10", label: "CRATE" },
] as const;

type NodeStatus = "locked" | "ready" | "claimed";

const isMilestoneNode = (node: TrackNode, index: number): boolean =>
  node.milestone ?? (index + 1) % 5 === 0;

/** Small four-point sparkle — the generic reward glyph every chip carries. */
function GlyphIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 10 10" width={9} height={9} aria-hidden focusable="false">
      <path
        d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Per-status enter recipe for a node's button — a pure lookup, never a
 * hook, safe to call from inside the node map. */
function nodeMotionFor(
  status: NodeStatus,
  motionSafe: boolean,
  cascadeDelay: number,
) {
  if (status === "locked") {
    return {
      initial: motionSafe ? { opacity: 0, y: distances.nudge } : false,
      animate: { opacity: 1, y: 0 },
      transition: motionSafe
        ? { duration: durations.base, ease: easings.enter, delay: cascadeDelay }
        : { duration: 0 },
    };
  }
  return {
    initial: motionSafe ? { scale: 0.55, opacity: 0.6 } : false,
    animate: { scale: 1, opacity: 1 },
    transition: motionSafe ? springs.flick : { duration: 0 },
  };
}

type RewardNodeProps = {
  node: TrackNode;
  index: number;
  status: NodeStatus;
  milestone: boolean;
  x: number;
  motionSafe: boolean;
  flyToken: number | null;
  burstToken: number | null;
  cascadeDelay: number;
  onClaim: (index: number) => void;
};

function RewardNode({
  node,
  index,
  status,
  milestone,
  x,
  motionSafe,
  flyToken,
  burstToken,
  cascadeDelay,
  onClaim,
}: RewardNodeProps): React.JSX.Element {
  const size = milestone ? MILESTONE_SIZE : NODE_SIZE;
  const above = index % 2 === 0;
  const glyphY = above ? TRACK_Y - GLYPH_OFFSET : TRACK_Y + GLYPH_OFFSET;
  const isClaimable = status === "ready";
  const isFlying = flyToken !== null;
  const { initial, animate, transition } = nodeMotionFor(
    status,
    motionSafe,
    cascadeDelay,
  );

  const ariaLabel = isClaimable
    ? `Claim ${node.label}`
    : status === "claimed"
      ? `${node.label}, claimed`
      : `${node.label}, locked`;

  return (
    <React.Fragment>
      {(status !== "claimed" || isFlying) && (
        <motion.span
          aria-hidden
          className={cn(
            "absolute flex items-center justify-center gap-1 rounded-full border font-mono text-[10px] font-semibold whitespace-nowrap",
            milestone
              ? "border-warn/50 bg-warn/15 text-warn"
              : "border-hairline-strong bg-surface-2 text-ink-2",
          )}
          style={{
            left: x,
            top: glyphY,
            width: CHIP_W,
            height: CHIP_H,
            marginLeft: -CHIP_W / 2,
            marginTop: -CHIP_H / 2,
          }}
          initial={false}
          animate={
            isFlying
              ? { y: above ? -FLY_DISTANCE : FLY_DISTANCE, opacity: 0 }
              : { y: 0, opacity: status === "locked" ? 0.45 : 1 }
          }
          transition={
            isFlying
              ? motionSafe
                ? { duration: FLY_DURATION_S, ease: easings.exit }
                : { duration: 0 }
              : { duration: durations.fast, ease: easings.enter }
          }
        >
          <GlyphIcon />
          <span>{node.label}</span>
        </motion.span>
      )}

      <motion.button
        key={status}
        type="button"
        aria-label={ariaLabel}
        disabled={!isClaimable}
        tabIndex={isClaimable ? 0 : -1}
        onClick={isClaimable ? () => onClaim(index) : undefined}
        whileTap={isClaimable && motionSafe ? { scale: 0.92 } : undefined}
        whileHover={isClaimable && motionSafe ? { scale: 1.05 } : undefined}
        initial={initial}
        animate={animate}
        transition={transition}
        className={cn(
          "absolute flex items-center justify-center rounded-full border font-mono text-[10px] font-semibold outline-none",
          status === "locked" &&
            "border-hairline-strong bg-surface-1 text-ink-3 opacity-60",
          status === "ready" &&
            "border-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          status === "ready" &&
            (milestone
              ? "border-warn bg-surface-2 text-warn"
              : "border-primary bg-surface-2 text-primary"),
          status === "claimed" && "border-transparent text-primary-foreground",
          status === "claimed" && !milestone && "bg-primary",
        )}
        style={{
          left: x,
          top: TRACK_Y,
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          ...(status === "claimed" && milestone
            ? { background: MILESTONE_FILL }
            : null),
        }}
      >
        {status === "ready" && motionSafe && (
          <motion.span
            aria-hidden
            className={cn(
              "absolute -inset-1.5 rounded-full border-2",
              milestone ? "border-warn" : "border-primary",
            )}
            animate={{ opacity: [0.25, 0.8, 0.25], scale: [1, 1.08, 1] }}
            transition={{
              duration: PULSE_S,
              ease: easings.move,
              repeat: Infinity,
            }}
          />
        )}

        {status === "claimed" ? (
          <motion.svg
            viewBox="0 0 12 12"
            className="size-3.5"
            fill="none"
            aria-hidden
            initial={motionSafe ? { scale: 0, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe ? { ...springs.flick, delay: 0.1 } : { duration: 0 }
            }
          >
            <path
              d="M2.5 6.4 L4.9 8.8 L9.5 3.4"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        ) : (
          <span aria-hidden>{index + 1}</span>
        )}
      </motion.button>

      {motionSafe && burstToken !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: x, top: TRACK_Y }}
        >
          {milestone && (
            <motion.span
              className="absolute rounded-full"
              style={{
                width: MILESTONE_RING_SIZE,
                height: MILESTONE_RING_SIZE,
                left: -MILESTONE_RING_SIZE / 2,
                top: -MILESTONE_RING_SIZE / 2,
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: MILESTONE_RING_COLOR,
              }}
              initial={{ scale: 0.5, opacity: 0.9 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{
                duration: MILESTONE_BURST_DURATION_S,
                ease: easings.exit,
              }}
            />
          )}
          {(milestone ? MILESTONE_SPARKS : BURST_SPARKS).map((spark, i) => (
            <motion.span
              key={i}
              className="absolute size-1 rounded-full"
              style={{
                background: milestone ? MILESTONE_SPARK_COLOR : SPARK_COLOR,
              }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: spark.dx, y: spark.dy, opacity: 0 }}
              transition={{
                duration: milestone
                  ? MILESTONE_BURST_DURATION_S
                  : BURST_DURATION_S,
                ease: easings.exit,
              }}
            />
          ))}
        </span>
      )}
    </React.Fragment>
  );
}

export type RewardTrackProps = {
  /** The nodes strung along the track. @default 10 built-in nodes */
  nodes?: TrackNode[];
  /** Progress units added per "Earn progress" click; each node sits 100
   * apart. @default 34 */
  perClick?: number;
  /** Fires with a node's id the moment it is claimed. */
  onClaim?: (id: string) => void;
  className?: string;
};

/**
 * A horizontal reward track — the season-pass shape: nodes strung along a
 * line, each carrying a reward chip that alternates above and below so the
 * whole thing reads as a ribbon of prizes. "Earn progress" advances the fill
 * and its bright head on `glide`; any node the head clears pops into `ready`
 * on `flick` and starts a slow pulse, while a mono "N to claim" count keeps
 * the unclaimed total in view — the nag is the mechanic. Claiming a node
 * (each `ready` node is its own button) stamps a check, throws a small
 * burst, and sends its reward chip flying further the way it was already
 * leaning before it fades; "claim all" clears every ready node in one
 * `cascade()` stagger. Every fifth node is a milestone by default — bigger,
 * gold-tinted, and its claim rings out a wider burst plus a caption naming
 * what was won. Reaching the last node flips the caption to "track
 * complete" and swaps the earn button for "next season", which resets
 * progress and fades every node back through its own `cascade()` re-entry.
 * Reduced motion: the head jumps straight to its position with no pulse,
 * and claiming is an instant state swap — no flight, no burst, no ring —
 * while the unclaimed count and captions still update.
 */
export function RewardTrack({
  nodes: nodesProp,
  perClick = 34,
  onClaim,
  className,
}: RewardTrackProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const nodes = nodesProp ?? DEFAULT_NODES;
  const nodeCount = nodes.length;
  const trackMax = Math.max(0, (nodeCount - 1) * NODE_SPACING);
  const step = Math.max(1, Math.round(perClick));
  const cascadeStep = cascade(nodeCount);

  const [progress, setProgress] = React.useState(0);
  const [claimed, setClaimed] = React.useState<boolean[]>(() =>
    nodes.map(() => false),
  );
  const [flyTokens, setFlyTokens] = React.useState<Array<number | null>>(() =>
    nodes.map(() => null),
  );
  const [burstTokens, setBurstTokens] = React.useState<Array<number | null>>(
    () => nodes.map(() => null),
  );
  const [flareCaption, setFlareCaption] = React.useState<string | null>(null);
  const [season, setSeason] = React.useState(1);
  const [announce, setAnnounce] = React.useState("");

  const progressRef = React.useRef(0);
  const claimedRef = React.useRef<boolean[]>(nodes.map(() => false));
  const motionSafeRef = React.useRef(motionSafe);
  const onClaimRef = React.useRef(onClaim);
  const idCounter = React.useRef(0);

  const flyTimers = React.useRef<Array<number | null>>(nodes.map(() => null));
  const burstTimers = React.useRef<Array<number | null>>(nodes.map(() => null));
  const claimAllTimers = React.useRef<number[]>([]);
  const flareCaptionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  React.useEffect(() => {
    onClaimRef.current = onClaim;
  }, [onClaim]);

  React.useEffect(() => {
    const flyT = flyTimers.current;
    const burstT = burstTimers.current;
    const claimAllT = claimAllTimers.current;
    return () => {
      for (const t of flyT) if (t !== null) window.clearTimeout(t);
      for (const t of burstT) if (t !== null) window.clearTimeout(t);
      for (const t of claimAllT) window.clearTimeout(t);
      if (flareCaptionTimer.current !== null)
        window.clearTimeout(flareCaptionTimer.current);
    };
  }, []);

  const nodeStatuses: NodeStatus[] = nodes.map((_, i) => {
    if (claimed[i]) return "claimed";
    return progress >= i * NODE_SPACING ? "ready" : "locked";
  });
  const unclaimedCount = nodeStatuses.filter((s) => s === "ready").length;
  const trackComplete = trackMax > 0 && progress >= trackMax;

  const claimNode = (index: number) => {
    const node = nodes[index];
    if (!node) return;
    if (claimedRef.current[index]) return;
    if (progressRef.current < index * NODE_SPACING) return;

    claimedRef.current = claimedRef.current.map((v, i) =>
      i === index ? true : v,
    );
    setClaimed([...claimedRef.current]);
    onClaimRef.current?.(node.id);
    setAnnounce(`${node.label} claimed.`);

    const milestone = isMilestoneNode(node, index);

    if (motionSafeRef.current) {
      idCounter.current += 1;
      const token = idCounter.current;

      setFlyTokens((prev) => prev.map((v, i) => (i === index ? token : v)));
      const existingFly = flyTimers.current[index];
      if (existingFly !== null && existingFly !== undefined)
        window.clearTimeout(existingFly);
      flyTimers.current[index] = window.setTimeout(() => {
        flyTimers.current[index] = null;
        setFlyTokens((prev) => prev.map((v, i) => (i === index ? null : v)));
      }, FLY_DURATION_MS);

      setBurstTokens((prev) => prev.map((v, i) => (i === index ? token : v)));
      const existingBurst = burstTimers.current[index];
      if (existingBurst !== null && existingBurst !== undefined)
        window.clearTimeout(existingBurst);
      burstTimers.current[index] = window.setTimeout(
        () => {
          burstTimers.current[index] = null;
          setBurstTokens((prev) =>
            prev.map((v, i) => (i === index ? null : v)),
          );
        },
        milestone ? MILESTONE_BURST_DURATION_MS : BURST_DURATION_MS,
      );
    }

    if (milestone) {
      setFlareCaption(`${node.label} claimed!`);
      if (flareCaptionTimer.current !== null)
        window.clearTimeout(flareCaptionTimer.current);
      flareCaptionTimer.current = window.setTimeout(() => {
        flareCaptionTimer.current = null;
        setFlareCaption(null);
      }, CAPTION_FLASH_MS);
    }
  };

  const handleEarn = () => {
    if (progressRef.current >= trackMax) return;
    const next = Math.min(trackMax, progressRef.current + step);
    progressRef.current = next;
    setProgress(next);
    setAnnounce(`Progress advanced to ${next} of ${trackMax}.`);
  };

  const handleClaimAll = () => {
    const readyIndices: number[] = [];
    nodes.forEach((_, i) => {
      if (!claimedRef.current[i] && progressRef.current >= i * NODE_SPACING) {
        readyIndices.push(i);
      }
    });
    if (readyIndices.length === 0) return;

    for (const t of claimAllTimers.current) window.clearTimeout(t);
    claimAllTimers.current.length = 0;

    if (!motionSafeRef.current) {
      for (const idx of readyIndices) claimNode(idx);
      return;
    }

    const claimStep = cascade(readyIndices.length);
    readyIndices.forEach((idx, order) => {
      const t = window.setTimeout(
        () => claimNode(idx),
        order * claimStep * 1000,
      );
      claimAllTimers.current.push(t);
    });
  };

  const handleNextSeason = () => {
    for (const t of claimAllTimers.current) window.clearTimeout(t);
    claimAllTimers.current.length = 0;
    for (let i = 0; i < flyTimers.current.length; i += 1) {
      const t = flyTimers.current[i];
      if (t !== null && t !== undefined) window.clearTimeout(t);
      flyTimers.current[i] = null;
    }
    for (let i = 0; i < burstTimers.current.length; i += 1) {
      const t = burstTimers.current[i];
      if (t !== null && t !== undefined) window.clearTimeout(t);
      burstTimers.current[i] = null;
    }
    if (flareCaptionTimer.current !== null) {
      window.clearTimeout(flareCaptionTimer.current);
      flareCaptionTimer.current = null;
    }

    progressRef.current = 0;
    claimedRef.current = nodes.map(() => false);
    setProgress(0);
    setClaimed([...claimedRef.current]);
    setFlyTokens(nodes.map(() => null));
    setBurstTokens(nodes.map(() => null));
    setFlareCaption(null);
    setSeason((s) => s + 1);
    setAnnounce("New season. Track reset.");
  };

  const stageWidth = trackMax + TRACK_PAD_X * 2;
  const captionText = flareCaption ?? (trackComplete ? "track complete" : "");

  return (
    <div
      className={cn(
        "w-full max-w-3xl rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-label text-ink-3">reward track</span>
          {season > 1 && (
            <span className="w-fit rounded-full border border-warn/50 bg-warn/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warn">
              season {season}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-label text-ink-3">unclaimed</span>
          {unclaimedCount > 0 ? (
            <Readout
              value={unclaimedCount}
              format={(v) => `${v} to claim`}
              size="sm"
            />
          ) : (
            <span className="font-mono text-xs text-ink-3">all claimed</span>
          )}
        </div>
      </div>

      <div className="relative mt-5 overflow-x-auto">
        <div
          className="relative"
          style={{ width: stageWidth, height: STAGE_H }}
        >
          <span
            aria-hidden
            className="absolute h-0.5 rounded-full bg-hairline-strong"
            style={{ left: TRACK_PAD_X, top: TRACK_Y, width: trackMax }}
          />
          <motion.span
            aria-hidden
            className="absolute h-0.5 origin-left rounded-full bg-primary"
            style={{ left: TRACK_PAD_X, top: TRACK_Y, width: trackMax }}
            initial={false}
            animate={{ scaleX: trackMax > 0 ? progress / trackMax : 0 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
          <motion.span
            aria-hidden
            className="absolute rounded-full border-2 border-primary-foreground bg-primary shadow-raised"
            style={{
              top: TRACK_Y,
              width: HEAD_SIZE,
              height: HEAD_SIZE,
              marginTop: -HEAD_SIZE / 2,
              marginLeft: -HEAD_SIZE / 2,
            }}
            initial={false}
            animate={{ left: TRACK_PAD_X + progress }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />

          {nodes.map((node, index) => {
            const status = nodeStatuses[index] ?? "locked";
            return (
              <RewardNode
                key={node.id}
                node={node}
                index={index}
                status={status}
                milestone={isMilestoneNode(node, index)}
                x={TRACK_PAD_X + index * NODE_SPACING}
                motionSafe={motionSafe}
                flyToken={flyTokens[index] ?? null}
                burstToken={burstTokens[index] ?? null}
                cascadeDelay={index * cascadeStep}
                onClaim={claimNode}
              />
            );
          })}
        </div>
      </div>

      <div
        aria-hidden
        className="mt-2 flex h-4 items-center justify-center overflow-hidden font-mono text-[11px] text-ink-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          {captionText && (
            <motion.span
              key={captionText}
              initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: -4,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
              className="tracking-[0.06em] uppercase"
            >
              {captionText}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleClaimAll}
          disabled={unclaimedCount === 0}
          className={cn(
            "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
            "hover:text-ink-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            unclaimedCount === 0 && "pointer-events-none opacity-40",
          )}
        >
          claim all
        </button>

        {trackComplete ? (
          <motion.button
            type="button"
            onClick={handleNextSeason}
            whileTap={motionSafe ? { scale: 0.95 } : undefined}
            transition={springs.flick}
            className={cn(
              "rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors outline-none",
              "hover:text-ink",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            next season
          </motion.button>
        ) : (
          <motion.button
            type="button"
            aria-label="Earn progress"
            onClick={handleEarn}
            whileTap={motionSafe ? { scale: 0.94 } : undefined}
            transition={springs.flick}
            className={cn(
              "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            earn
          </motion.button>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
