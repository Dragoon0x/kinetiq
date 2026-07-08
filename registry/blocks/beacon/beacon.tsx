"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Phone, PhoneOff, Timer as TimerIcon, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

export type BeaconTimerActivity = {
  kind: "timer";
  label: string;
  /** Epoch ms the countdown ends at; the readout clamps at 0:00. */
  endsAt: number;
};

export type BeaconUploadActivity = {
  kind: "upload";
  label: string;
  /** Upload progress from 0 to 1. */
  progress: number;
};

export type BeaconCallActivity = {
  kind: "call";
  name: string;
  onAccept: () => void;
  onDecline: () => void;
};

export type BeaconPlayingActivity = {
  kind: "playing";
  title: string;
  artist: string;
};

export type BeaconActivity =
  | BeaconTimerActivity
  | BeaconUploadActivity
  | BeaconCallActivity
  | BeaconPlayingActivity;

export type BeaconProps = {
  /** The live activity to surface; `null` collapses to a STANDBY pill. */
  activity: BeaconActivity | null;
  /** Controlled expanded state for the detail row. */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Renders a dismiss button in the detail row when provided. */
  onDismiss?: () => void;
  className?: string;
};

/** Activity changes announce once, this long after the last swap settles. */
const ANNOUNCE_DEBOUNCE_MS = 400;

/** Frozen bar heights — the reduced-motion waveform pose. */
const WAVE_IDLE = [0.55, 0.85, 0.45, 0.7, 0.5];
/** Looping height keyframes per bar; each loop closes on its start value. */
const WAVE_LOOPS = [
  [0.45, 0.95, 0.55, 0.8, 0.45],
  [0.7, 0.4, 0.9, 0.5, 0.7],
  [0.5, 0.85, 0.4, 1, 0.5],
  [0.8, 0.5, 0.75, 0.45, 0.8],
  [0.4, 0.7, 0.5, 0.9, 0.4],
];
const WAVE_LOOP_SECONDS = 1.2;
const WAVE_STAGGER_S = 0.12;

const formatCountdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function announcementFor(activity: BeaconActivity | null): string {
  if (activity === null) return "Standby";
  switch (activity.kind) {
    case "timer":
      return `Timer running — ${activity.label}`;
    case "upload":
      return `Uploading ${activity.label}`;
    case "call":
      return `Incoming call from ${activity.name}`;
    case "playing":
      return `Now playing ${activity.title} by ${activity.artist}`;
  }
}

function detailFor(activity: BeaconActivity): { line1: string; line2: string } {
  switch (activity.kind) {
    case "timer":
      return {
        line1: activity.label,
        line2: `Ends ${new Date(activity.endsAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}`,
      };
    case "upload":
      return { line1: activity.label, line2: `${slugify(activity.label)}.zip` };
    case "call":
      return { line1: "Incoming call", line2: activity.name };
    case "playing":
      return { line1: activity.title, line2: activity.artist };
  }
}

/** mm:ss countdown derived from `endsAt` on a 1s interval, clamped at 0:00. */
function TimerView({ endsAt }: { endsAt: number }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000));

  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      <TimerIcon
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
      <Readout size="sm" value={remaining} format={formatCountdown} />
    </span>
  );
}

/** Mini arc gauge: a pathLength circle whose dashoffset glides to progress. */
function UploadView({
  progress,
  motionSafe,
}: {
  progress: number;
  motionSafe: boolean;
}) {
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="size-4 shrink-0 -rotate-90"
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          stroke="var(--signal, var(--primary))"
          strokeOpacity="0.25"
          strokeWidth="2.5"
        />
        <motion.circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          stroke="var(--signal, var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          initial={false}
          animate={{ strokeDashoffset: 1 - clamped }}
          // Reduced motion steps the gauge discretely instead of gliding.
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </svg>
      <span className="font-mono text-xs font-medium tabular-nums">
        {Math.round(clamped * 100)}%
      </span>
    </span>
  );
}

/** Avatar initial with a drift-tempo pulse ring (static mid-opacity when RM). */
function CallAvatar({
  name,
  motionSafe,
}: {
  name: string;
  motionSafe: boolean;
}) {
  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span className="relative flex size-7 shrink-0 items-center justify-center">
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary/40"
        initial={false}
        animate={
          motionSafe
            ? { scale: [1, 1.75], opacity: [0.5, 0] }
            : { scale: 1.4, opacity: 0.25 }
        }
        transition={
          motionSafe
            ? {
                duration: 0.8,
                ease: "easeOut",
                repeat: Infinity,
                repeatDelay: 0.5,
              }
            : { duration: 0 }
        }
      />
      <span className="relative flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {letter}
      </span>
    </span>
  );
}

/** 5-bar waveform loop in the signal accent; bars freeze mid-height when RM. */
function WaveformView({ motionSafe }: { motionSafe: boolean }) {
  return (
    <span aria-hidden className="flex h-4 items-center gap-0.5">
      {WAVE_LOOPS.map((loop, i) => (
        <motion.span
          key={i}
          style={{ backgroundColor: "var(--signal, var(--primary))" }}
          initial={false}
          animate={
            motionSafe ? { scaleY: loop } : { scaleY: WAVE_IDLE[i] ?? 0.6 }
          }
          transition={
            motionSafe
              ? {
                  duration: WAVE_LOOP_SECONDS,
                  ease: "easeInOut",
                  repeat: Infinity,
                  delay: i * WAVE_STAGGER_S,
                }
              : { duration: 0 }
          }
          className="h-full w-0.5 origin-center rounded-full"
        />
      ))}
    </span>
  );
}

/**
 * One capsule, every live activity. A single persistent pill — border radius
 * pinned at 24px so corners never distort — FLIP-morphs its size on `glide`
 * as activities swap: the outgoing view blurs out at `exitFor(fast)`, the
 * incoming blurs in from 4px, and each view renders at its own intrinsic
 * fixed size so the shell has a stable target. Tapping the body lifts a
 * detail row (height on `glide`, content rising `distances.step`). An
 * incoming call keeps real accept/decline buttons reachable while collapsed.
 * Reduced motion resizes instantly and swaps views with a plain crossfade.
 */
export function Beacon({
  activity,
  expanded: controlledExpanded,
  defaultExpanded = false,
  onExpandedChange,
  onDismiss,
  className,
}: BeaconProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    React.useState(defaultExpanded);
  const expanded = controlledExpanded ?? uncontrolledExpanded;
  const [announced, setAnnounced] = React.useState("");

  const setExpanded = (next: boolean) => {
    if (controlledExpanded === undefined) setUncontrolledExpanded(next);
    onExpandedChange?.(next);
  };

  // Announce once per swap — rapid activity changes reset the timer.
  const announcement = announcementFor(activity);
  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setAnnounced(announcement),
      ANNOUNCE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const viewKey = activity?.kind ?? "standby";
  const detail = activity === null ? null : detailFor(activity);
  const showDetail = expanded && detail !== null;

  const main =
    activity === null ? (
      <div className="flex h-9 items-center gap-2 px-4">
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-muted-foreground/60"
        />
        <span className="font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Standby
        </span>
      </div>
    ) : (
      <>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label="Activity details"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex h-12 items-center rounded-full focus-visible:outline-offset-[-2px]",
            activity.kind === "call" ? "pr-1.5 pl-4" : "px-4",
          )}
        >
          {activity.kind === "timer" && <TimerView endsAt={activity.endsAt} />}
          {activity.kind === "upload" && (
            <UploadView progress={activity.progress} motionSafe={motionSafe} />
          )}
          {activity.kind === "call" && (
            <CallAvatar name={activity.name} motionSafe={motionSafe} />
          )}
          {activity.kind === "playing" && (
            <WaveformView motionSafe={motionSafe} />
          )}
        </button>
        {activity.kind === "call" && (
          <span className="flex items-center gap-1.5 pr-2">
            <button
              type="button"
              aria-label="Accept call"
              onClick={activity.onAccept}
              className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success transition-colors hover:bg-success/25 focus-visible:outline-offset-0"
            >
              <Phone aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Decline call"
              onClick={activity.onDecline}
              className="flex size-8 items-center justify-center rounded-full bg-destructive/15 text-destructive transition-colors hover:bg-destructive/25 focus-visible:outline-offset-0"
            >
              <PhoneOff aria-hidden className="size-3.5" />
            </button>
          </span>
        )}
      </>
    );

  return (
    <motion.div
      layout={motionSafe}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      // Fixed radius: motion scale-corrects style radii, so corners never warp.
      style={{ borderRadius: 24 }}
      className={cn(
        "flex w-fit flex-col items-center overflow-hidden border border-border bg-card shadow-md",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={viewKey}
          layout={motionSafe ? "position" : false}
          initial={
            motionSafe ? { opacity: 0, filter: "blur(4px)" } : { opacity: 0 }
          }
          animate={
            motionSafe ? { opacity: 1, filter: "blur(0px)" } : { opacity: 1 }
          }
          exit={
            motionSafe
              ? {
                  opacity: 0,
                  filter: "blur(4px)",
                  transition: exitFor(durations.fast),
                }
              : { opacity: 0, transition: { duration: durations.fast } }
          }
          transition={
            motionSafe
              ? {
                  layout: springs.glide,
                  opacity: { duration: durations.base, ease: easings.enter },
                  filter: { duration: durations.base, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
          className="flex items-center"
        >
          {main}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showDetail && detail && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(motionSafe ? durations.base : durations.fast),
            }}
            transition={{
              height: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
            className="w-full overflow-hidden"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={`detail-${viewKey}`}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step, filter: "blur(4px)" }
                    : { opacity: 0 }
                }
                animate={
                  motionSafe
                    ? { opacity: 1, y: 0, filter: "blur(0px)" }
                    : { opacity: 1 }
                }
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        filter: "blur(4px)",
                        transition: exitFor(durations.fast),
                      }
                    : { opacity: 0, transition: { duration: durations.fast } }
                }
                transition={
                  motionSafe
                    ? {
                        y: springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                        filter: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                className="flex items-start justify-between gap-3 px-4 pb-3"
              >
                <span className="min-w-0">
                  <span className="block max-w-52 truncate text-xs font-medium whitespace-nowrap">
                    {detail.line1}
                  </span>
                  <span className="block max-w-52 truncate font-mono text-[10px] whitespace-nowrap text-muted-foreground tabular-nums">
                    {detail.line2}
                  </span>
                </span>
                {onDismiss && (
                  <button
                    type="button"
                    aria-label="Dismiss activity"
                    onClick={onDismiss}
                    className="-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </motion.div>
  );
}
