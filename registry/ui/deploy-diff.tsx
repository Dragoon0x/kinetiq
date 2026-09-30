"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DeployCommit = {
  id: string;
  /** Short hash, printed in mono. */
  hash: string;
  subject: string;
  author: string;
};

export type ServiceChange = {
  id: string;
  name: string;
  added: number;
  removed: number;
};

export type DeployStatus = "ready" | "deploying" | "deployed" | "blocked";

export type DeployDiffProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The build being deployed; printed in the head. */
  release: string;
  /** The environments this deploy runs between. */
  from: string;
  to: string;
  /** Newest first; the count rolls. @default [] */
  commits?: DeployCommit[];
  /** One chip each. @default [] */
  services?: ServiceChange[];
  /** Comes from the host — the card never advances it on its own. @default "ready" */
  status?: DeployStatus;
  /** Why the deploy is held; printed and spoken when the status is blocked. */
  blockedNote?: string;
  /** Controlled unfolded state of the body. */
  open?: boolean;
  /** Initial unfolded state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the press or key that folded or unfolded the body. */
  onOpenChange?: (open: boolean) => void;
  /** Fires once, from the gesture that carried the knob to the end. */
  onDeploy?: () => void;
  /** How far the knob has travelled, 0–1 — a reading, so it also fires on the
   *  first commit. */
  onArmChange?: (share: number) => void;
  /** Names the slide control. @default "Slide to deploy" */
  slideLabel?: string;
  /** Names the card. @default "Deploy" */
  label?: string;
  className?: string;
};

const NO_COMMITS: DeployCommit[] = [];
const NO_SERVICES: ServiceChange[] = [];

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Travel before a press becomes a drag: below this a plain click still lands. */
const SLOP = 4;
/** Knob width and the track's inset, in px — the travel is what is left. */
const KNOB = 48;
const PAD = 4;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** Host copy read back as a sentence: capitalised even when the log line was
 *  lowercase, and given one full stop rather than the two it would carry if it
 *  already ended in one. */
const sentenceOf = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
};

/**
 * A count whose digits roll to their new value on `snap` — one crisp overshoot,
 * the same physics as any other indicator changing position. The column is ten
 * digits tall, so a `y` percentage of its own height moves exactly one digit.
 * It is hidden from assistive technology because the head already carries the
 * count in a sentence.
 */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(Math.max(0, Math.round(value)));
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // number gains a digit, and only the new column mounts.
        const key = text.length - index;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-clip [contain:paint]"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * The card you read before you ship. The head carries the route, the release
 * and the commit count as digits that roll on `snap` in a fixed-width column,
 * so a count crossing ten never shifts the row. Pressing it unfolds the body to
 * a ResizeObserver-measured height on `glide` — never a reserved one — and the
 * service chips and commits inside cascade from `distances.nudge` off the same
 * open, so folding costs nothing while the card is shut.
 *
 * The deploy control is a slide track: the knob is dragged (the pointer is
 * captured only after 4px of travel, inside try/catch, so a plain click is
 * never swallowed) or driven from the keyboard as a real `role="slider"`, and
 * only a full sweep fires `onDeploy`. A short sweep springs home on `snap`.
 *
 * The card never claims the deploy happened: `status` comes from the host, so
 * the strip that replaces the track arrives only when the parent answers. When
 * it arrives it takes focus — bound to the node through a ref callback and
 * moved in an effect keyed on that node, never on a guessed frame — but only
 * after this card's own confirm, so a host flipping the status elsewhere never
 * steals the keyboard. Under reduced motion the knob still tracks the pointer
 * and the keys, but returns home instantly and the digits swap in place.
 */
export function DeployDiff({
  ref,
  release,
  from,
  to,
  commits = NO_COMMITS,
  services = NO_SERVICES,
  status = "ready",
  blockedNote,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onDeploy,
  onArmChange,
  slideLabel = "Slide to deploy",
  label = "Deploy",
  className,
}: DeployDiffProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-body`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;

  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  // The knob's travel is latched against the status: a host that resets the
  // card to ready gets the knob back at zero, and this render already reads the
  // new share rather than the one it replaces.
  const [arm, setArm] = React.useState({ status, share: 0 });
  let share = arm.share;
  if (arm.status !== status) {
    share = status === "ready" ? 0 : 1;
    setArm({ status, share });
  }
  const setShare = (next: number) => setArm({ status, share: clamp01(next) });

  const armRef = React.useRef(onArmChange);
  React.useEffect(() => {
    armRef.current = onArmChange;
  });
  // How far the knob has travelled is a reading, not an event: it reports from
  // the first commit so a host's own readout starts in step with the card.
  React.useEffect(() => {
    armRef.current?.(Number(share.toFixed(6)));
  }, [share]);

  const [bodyNode, setBodyNode] = React.useState<HTMLDivElement | null>(null);
  const [bodyHeight, setBodyHeight] = React.useState(0);
  React.useEffect(() => {
    if (!bodyNode) return;
    // Fires once on observe, so the first height lands without reading layout
    // during render, and again for every commit the host adds while it is open.
    const observer = new ResizeObserver(() =>
      setBodyHeight(bodyNode.offsetHeight),
    );
    observer.observe(bodyNode);
    return () => observer.disconnect();
  }, [bodyNode]);

  const [trackNode, setTrackNode] = React.useState<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = React.useState(0);
  React.useEffect(() => {
    if (!trackNode) return;
    const observer = new ResizeObserver(() =>
      setTrackWidth(trackNode.clientWidth),
    );
    observer.observe(trackNode);
    return () => observer.disconnect();
  }, [trackNode]);
  const travel = Math.max(0, trackWidth - KNOB - PAD * 2);

  // The strip is focused as it ARRIVES: the node is held in state by a ref
  // callback and the focus runs in an effect keyed on that node, because a
  // focus call on a guessed frame lands on an element that does not exist yet.
  const [stripNode, setStripNode] = React.useState<HTMLDivElement | null>(null);
  const [claim, setClaim] = React.useState(0);
  const claimed = React.useRef(0);
  React.useEffect(() => {
    if (!stripNode || claim === 0 || claimed.current === claim) return;
    claimed.current = claim;
    stripNode.focus();
  }, [stripNode, claim]);

  const confirm = () => {
    if (status !== "ready") return;
    setArm({ status, share: 1 });
    setClaim((stamp) => stamp + 1);
    onDeploy?.();
  };

  const gesture = React.useRef<{
    id: number;
    startX: number;
    from: number;
    dragging: boolean;
  } | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || status !== "ready" || gesture.current) return;
    // Only the knob starts a gesture: a press on the track may never jump a
    // control whose whole job is refusing to fire by accident.
    if (!(event.target as HTMLElement).closest("[role=slider]")) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      from: share,
      dragging: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId || travel <= 0) return;
    const dx = event.clientX - active.startX;
    if (!active.dragging) {
      if (Math.abs(dx) < SLOP) return;
      active.dragging = true;
      setDragging(true);
      try {
        // Captured only once the press has become a drag, and never letting a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    setShare(active.from + dx / travel);
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
    if (!active.dragging) return;
    if (share >= 0.995) confirm();
    else setShare(0);
  };

  const onKnobKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (status !== "ready") return;
    const steps: Record<string, number> = {
      ArrowRight: 0.1,
      ArrowUp: 0.1,
      ArrowLeft: -0.1,
      ArrowDown: -0.1,
      PageUp: 0.25,
      PageDown: -0.25,
    };
    const step = steps[event.key];
    if (step !== undefined) {
      event.preventDefault();
      const next = clamp01(share + step);
      if (next >= 1) confirm();
      else setShare(next);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setShare(0);
    } else if (event.key === "End") {
      event.preventDefault();
      confirm();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (share >= 1) confirm();
    }
  };

  // A status change is a settled event, so the first commit speaks nothing.
  const [spoken, setSpoken] = React.useState({ key: status, sentence: "" });
  if (spoken.key !== status) {
    setSpoken({
      key: status,
      sentence:
        status === "deploying"
          ? `Deploy running to ${to}.`
          : status === "deployed"
            ? `Deployed to ${to}: ${countPhrase(commits.length, "commit")} across ${countPhrase(services.length, "service")}.`
            : status === "blocked"
              ? `Deploy blocked.${blockedNote ? ` ${sentenceOf(blockedNote)}` : ""}`
              : `Ready to deploy ${release} to ${to}.`,
    });
  }

  const percent = Math.round(share * 100);
  const stagger = cascade(Math.max(commits.length + 1, 2));
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const knobSpring = motionSafe ? springs.snap : { duration: 0 };

  const stripLine =
    status === "deploying"
      ? `Deploying to ${to}`
      : status === "deployed"
        ? `Deployed to ${to}`
        : (blockedNote ?? "Deploy blocked");

  const rowIn = (index: number) => ({
    opacity: open ? 1 : 0,
    y: open || !motionSafe ? 0 : distances.nudge,
    transition: motionSafe
      ? { ...springs.glide, delay: open ? index * stagger : 0 }
      : fade,
  });

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(
          "-m-1 flex items-center gap-2 rounded-2 p-1 text-left transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <span className="sr-only">
          {`${release}, ${from} to ${to}, ${countPhrase(commits.length, "commit")} across ${countPhrase(services.length, "service")}.`}
        </span>
        <span aria-hidden className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px] text-ink">
            {release}
          </span>
          <span className="block truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {from} → {to}
          </span>
        </span>
        <span
          aria-hidden
          className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink"
        >
          <RollingCount value={commits.length} motionSafe={motionSafe} />
          <span className="text-ink-3">
            {commits.length === 1 ? "commit" : "commits"}
          </span>
        </span>
        <motion.span
          aria-hidden
          className="shrink-0 text-ink-3"
          initial={false}
          animate={{ rotate: open ? 180 : 0 }}
          transition={knobSpring}
        >
          <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
            <path
              d="M4 6.5 8 10.5 12 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </motion.span>
      </button>

      <motion.div
        id={panelId}
        role="region"
        aria-label={`${release} changes`}
        aria-hidden={!open}
        inert={!open}
        initial={false}
        animate={{ height: open ? bodyHeight : 0 }}
        transition={settle}
        // The negative margin cancels what is left of the column's gap once
        // the head's own -m-1 has eaten 4px of it, so a folded card reserves no
        // room at all for what it is hiding.
        className="-mt-1 overflow-clip [contain:paint]"
      >
        <div ref={setBodyNode} className="flex flex-col gap-2 pt-2">
          {/* An empty list would still take the column's gap, so it is not
              rendered at all rather than left to hold room for nothing. */}
          {services.length > 0 ? (
            <ul role="list" className="flex flex-wrap gap-1.5">
              {services.map((service, index) => (
                <motion.li
                  key={service.id}
                  className="flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px]"
                  initial={false}
                  animate={rowIn(index)}
                >
                  <span className="max-w-28 truncate text-ink">
                    {service.name}
                  </span>
                  <span className="text-success tabular-nums">
                    +{service.added}
                  </span>
                  <span className="text-danger tabular-nums">
                    −{service.removed}
                  </span>
                </motion.li>
              ))}
            </ul>
          ) : null}

          {commits.length > 0 ? (
            <ol role="list" className="flex flex-col gap-1">
              {commits.map((commit, index) => (
                <motion.li
                  key={commit.id}
                  className="flex items-baseline gap-2 text-[11px]"
                  initial={false}
                  animate={rowIn(index + services.length)}
                >
                  <span className="shrink-0 font-mono text-ink-3">
                    {commit.hash}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {commit.subject}
                  </span>
                  <span className="max-w-16 shrink-0 truncate text-ink-3">
                    {commit.author}
                  </span>
                </motion.li>
              ))}
            </ol>
          ) : null}
        </div>
      </motion.div>

      {/* One slot, two occupants, stacked in a single grid cell: the track and
          the strip cross-fade without mode="wait" and without a height jump. */}
      <div className="grid h-10">
        <AnimatePresence initial={false}>
          {status === "ready" ? (
            <motion.div
              key="track"
              ref={setTrackNode}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endGesture}
              onPointerCancel={endGesture}
              className="relative col-start-1 row-start-1 h-10 w-full touch-none overflow-clip rounded-2 border border-hairline-strong bg-surface-2 [contain:paint] select-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              <motion.span
                aria-hidden
                className="absolute inset-0 w-full origin-left bg-cobalt-wash"
                initial={false}
                animate={{ scaleX: Number(share.toFixed(6)) }}
                transition={dragging ? { duration: 0 } : knobSpring}
              />
              <motion.span
                aria-hidden
                className="absolute inset-0 grid place-items-center font-mono text-[11px] text-ink-2"
                initial={false}
                animate={{
                  opacity: Number(Math.max(0, 1 - share * 1.8).toFixed(3)),
                }}
                transition={dragging ? { duration: 0 } : fade}
              >
                {slideLabel}
              </motion.span>
              <motion.div
                role="slider"
                tabIndex={0}
                aria-label={slideLabel}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-valuetext={`${slideLabel}, ${percent} percent of the way.`}
                onKeyDown={onKnobKeyDown}
                className={cn(
                  "absolute top-1 left-1 grid h-8 w-12 cursor-grab place-items-center rounded-2 bg-cobalt-bright text-background active:cursor-grabbing",
                  focusRing,
                )}
                initial={false}
                animate={{ x: Number((share * travel).toFixed(3)) }}
                transition={dragging ? { duration: 0 } : knobSpring}
              >
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                  <path
                    d="M6 3.5 10.5 8 6 12.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="strip"
              ref={setStripNode}
              tabIndex={-1}
              className={cn(
                "col-start-1 row-start-1 flex h-10 items-center gap-2 rounded-2 border px-3 outline-none",
                status === "blocked"
                  ? "border-danger/40 bg-danger/10"
                  : status === "deployed"
                    ? "border-success/40 bg-success/10"
                    : "border-hairline-strong bg-surface-2",
                focusRing,
              )}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step }
                  : { opacity: 0, y: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={motionSafe ? springs.snap : fade}
            >
              <motion.span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  status === "blocked"
                    ? "bg-danger"
                    : status === "deployed"
                      ? "bg-success"
                      : "bg-cobalt-bright",
                )}
                initial={false}
                // Two keyframes, mirrored: only a deploy still in flight
                // breathes; a landed or blocked one holds still.
                animate={{
                  opacity: status === "deploying" && motionSafe ? 0.35 : 1,
                }}
                transition={
                  status === "deploying" && motionSafe
                    ? {
                        duration: durations.page,
                        ease: easings.move,
                        repeat: Infinity,
                        repeatType: "mirror",
                      }
                    : fade
                }
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-ink">
                {stripLine}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
