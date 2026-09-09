"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DocScanStatus =
  "idle" | "finding" | "scanning" | "captured" | "blurred";

export type DocScanProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled phase. */
  status?: DocScanStatus;
  /** Initial phase for uncontrolled usage. @default "idle" */
  defaultStatus?: DocScanStatus;
  /** Fires from Capture (to finding), from the brackets landing (to scanning) and from Retry. */
  onStatusChange?: (status: DocScanStatus) => void;
  /** Fires when the scan bar reaches the bottom; the host sets captured or blurred. */
  onScanned?: () => void;
  /** Printed on the procedural card and in the frame's accessible name. @default "Identity document" */
  title?: string;
  /** Name line on the procedural card. @default "A. Fernwork" */
  holder?: string;
  /** Visible heading. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** Percent insets of the card inside the 4:3 frame (the card is 1.6:1). */
const CARD = { x: "14%", y: "20%" };
/** Where the brackets rest before they find an edge. */
const OUT = { x: "5%", y: "6%" };
/** Seconds the bar takes to cross the card: a scan measures, so it is linear. */
const SCAN_S = 1.4;
/** The brackets are given their snap to settle before the scan begins. */
const FIND_MS = 520;
/** A hand holding a card is never quite still; one slow breath per cycle. */
const BREATH_S = 3.2;
/** The bar's target, held by reference so its completion can be told apart
 *  from the exit animation, which reports through the same callback. */
const SCAN_END = { top: "100%" };
/** The nudge: symmetric, no spring, no bounce. */
const SHAKE = [0, -6, 6, -4, 4, 0];

const PROMPT: Record<DocScanStatus, string> = {
  idle: "Hold the card in frame",
  finding: "Finding edges",
  scanning: "Hold still",
  captured: "Captured",
  blurred: "Blurred. Hold the document still",
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

const CORNERS = [
  {
    key: "tl",
    edge: "border-t-2 border-l-2 rounded-tl-[3px]",
    h: "left",
    v: "top",
  },
  {
    key: "tr",
    edge: "border-t-2 border-r-2 rounded-tr-[3px]",
    h: "right",
    v: "top",
  },
  {
    key: "bl",
    edge: "border-b-2 border-l-2 rounded-bl-[3px]",
    h: "left",
    v: "bottom",
  },
  {
    key: "br",
    edge: "border-b-2 border-r-2 rounded-br-[3px]",
    h: "right",
    v: "bottom",
  },
] as const;

/** The card's blocks: [x, y, width, height, radius, fill]. Data, not markup,
 *  so the art stays a few lines and scales with its box. */
const BLOCKS: [number, number, number, number, number, string][] = [
  [20, 42, 72, 92, 6, "fill-surface-2"],
  [108, 80, 172, 7, 3.5, "fill-ink-3/40"],
  [108, 98, 128, 7, 3.5, "fill-ink-3/40"],
  [108, 116, 172, 7, 3.5, "fill-ink-3/40"],
  [108, 146, 44, 26, 4, "fill-cobalt-wash"],
  [164, 152, 120, 14, 3, "fill-ink-3/25"],
];

/** A procedural identity card: no asset, so it scales with its box. */
function CardArt({ title, holder }: { title: string; holder: string }) {
  return (
    <svg viewBox="0 0 320 200" aria-hidden className="block h-full w-full">
      <rect
        x="0.5"
        y="0.5"
        width="319"
        height="199"
        rx="12"
        className="fill-surface-0 stroke-hairline-strong"
      />
      {BLOCKS.map(([x, y, width, height, rx, fill]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={width}
          height={height}
          rx={rx}
          className={fill}
        />
      ))}
      <circle cx="56" cy="76" r="16" className="fill-ink-3/50" />
      <path d="M30 134 C30 106 82 106 82 134 Z" className="fill-ink-3/50" />
      <text
        x="20"
        y="28"
        fontSize="11"
        letterSpacing="1.5"
        className="fill-ink-3 font-mono"
      >
        {title.toUpperCase()}
      </text>
      <text
        x="108"
        y="64"
        fontSize="15"
        fontWeight="600"
        className="fill-ink font-sans"
      >
        {holder}
      </text>
    </svg>
  );
}

/**
 * A viewfinder for a hand-held document. Idle, the procedural card sits off
 * centre and breathes as a hand would; Capture settles it on `glide` while four
 * brackets snap in from the frame's corners onto the card's on `snap`, one
 * crisp overshoot each as they lock on. Then a bar sweeps the card on a linear
 * tween — a scan measures, so it does not ease — and the host reads the
 * capture: captured flashes once and stamps a check on `recoil`; blurred is the
 * nudge, a filter blur, a sideways shake with no spring, and the brackets
 * released, with Retry offered.
 *
 * Brackets are placed in percentages of the frame, so the frame is sized by its
 * container and never measured. Under reduced motion the card sits centred from
 * the start, brackets fade in at the corners, the bar still sweeps and the blur
 * still blurs — both are the verdict — and nothing shakes or bounces.
 */
export function DocScan({
  ref,
  status,
  defaultStatus = "idle",
  onStatusChange,
  onScanned,
  title = "Identity document",
  holder = "A. Fernwork",
  label,
  className,
  "aria-label": ariaLabel,
}: DocScanProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const [uncontrolled, setUncontrolled] = React.useState(defaultStatus);
  const isControlled = status !== undefined;
  const phase = isControlled ? status : uncontrolled;

  const changeRef = React.useRef(onStatusChange);
  const scannedRef = React.useRef(onScanned);
  React.useEffect(() => {
    changeRef.current = onStatusChange;
    scannedRef.current = onScanned;
  }, [onStatusChange, onScanned]);

  const commit = React.useCallback(
    (next: DocScanStatus) => {
      if (!isControlled) setUncontrolled(next);
      changeRef.current?.(next);
    },
    [isControlled],
  );

  // The brackets are given their settle before the scan starts; the timer
  // holds while the tab is hidden so the scan never begins unseen.
  React.useEffect(() => {
    if (phase !== "finding" || !visible) return;
    const timer = window.setTimeout(
      () => commit("scanning"),
      motionSafe ? FIND_MS : durations.base * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [phase, visible, motionSafe, commit]);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (phase !== "blurred" || !motionSafe) return;
    const node = frameRef.current;
    if (!node) return;
    const controls = animate(
      node,
      { x: SHAKE },
      { duration: durations.slow, ease: easings.move },
    );
    return () => controls.stop();
  }, [phase, motionSafe]);

  const locked = phase === "scanning" || phase === "captured";
  const found = locked || phase === "finding";
  const busy = phase === "finding" || phase === "scanning";
  const settled = found || phase === "blurred" || !motionSafe;
  const tone =
    phase === "captured"
      ? "text-success"
      : phase === "blurred"
        ? "text-danger"
        : found
          ? "text-cobalt-bright"
          : "text-ink-3";

  const buttonLabel =
    phase === "blurred"
      ? "Retry"
      : phase === "captured"
        ? "Captured"
        : busy
          ? "Scanning"
          : "Capture";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      {label ? (
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
      ) : null}

      <div
        ref={frameRef}
        role="img"
        aria-label={`${title}, ${PROMPT[phase].toLowerCase()}`}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2 border border-hairline bg-surface-2"
      >
        <div
          aria-hidden
          className="absolute"
          style={{ inset: `${CARD.y} ${CARD.x}` }}
        >
          <motion.div
            className="relative h-full w-full"
            initial={false}
            animate={
              settled
                ? {
                    x: 0,
                    y: 0,
                    rotate: 0,
                    filter: phase === "blurred" ? "blur(3px)" : "blur(0px)",
                  }
                : {
                    x: [6, 9, 6],
                    y: [-4, -1, -4],
                    rotate: [-3, -2, -3],
                    filter: "blur(0px)",
                  }
            }
            transition={
              settled
                ? {
                    ...springs.glide,
                    filter: { duration: durations.base, ease: easings.move },
                  }
                : { duration: BREATH_S, repeat: Infinity, ease: easings.move }
            }
          >
            <CardArt title={title} holder={holder} />
          </motion.div>

          <AnimatePresence>
            {phase === "scanning" ? (
              <motion.span
                key="scan"
                className="pointer-events-none absolute inset-x-0"
                initial={{ top: "0%" }}
                animate={SCAN_END}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: SCAN_S, ease: easings.linear }}
                onAnimationComplete={(definition) => {
                  if (definition === SCAN_END) scannedRef.current?.();
                }}
              >
                {/* The wash trails the bar so the lines it has passed read as lit. */}
                <span className="absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-cobalt-bright/25 to-cobalt-bright/0" />
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-cobalt-bright" />
              </motion.span>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {phase === "captured" ? (
              <React.Fragment key="captured">
                <motion.span
                  className="pointer-events-none absolute inset-0 rounded-[6%] bg-foreground"
                  initial={{ opacity: 0.35 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
                <motion.span
                  className="absolute top-1/2 left-1/2 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-raised"
                  initial={
                    motionSafe
                      ? { x: "-50%", y: "-50%", scale: 1.5, opacity: 0 }
                      : { x: "-50%", y: "-50%", opacity: 0 }
                  }
                  animate={{ x: "-50%", y: "-50%", scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor() }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: { duration: durations.blink },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <svg
                    viewBox="0 0 16 16"
                    className="size-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <motion.path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      pathLength={1}
                      initial={motionSafe ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={
                        motionSafe
                          ? { ...springs.flick, delay: 0.12 }
                          : { duration: 0 }
                      }
                    />
                  </svg>
                </motion.span>
              </React.Fragment>
            ) : null}
          </AnimatePresence>
        </div>

        {CORNERS.map((corner) => (
          <motion.span
            key={corner.key}
            aria-hidden
            className={cn(
              "absolute size-5 border-current transition-colors",
              corner.edge,
              tone,
            )}
            initial={false}
            animate={
              motionSafe
                ? {
                    [corner.h]: found ? CARD.x : OUT.x,
                    [corner.v]: found ? CARD.y : OUT.y,
                    opacity: 1,
                  }
                : {
                    [corner.h]: CARD.x,
                    [corner.v]: CARD.y,
                    opacity: found ? 1 : 0,
                  }
            }
            transition={
              motionSafe
                ? springs.snap
                : { duration: durations.fast, ease: easings.enter }
            }
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={phase}
            role={phase === "blurred" ? "alert" : undefined}
            className={cn(
              "min-w-0 text-xs",
              phase === "blurred" ? "font-medium text-danger" : "text-ink-2",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {PROMPT[phase]}
          </motion.span>
        </AnimatePresence>
        <button
          type="button"
          aria-busy={busy || undefined}
          aria-disabled={busy || phase === "captured" || undefined}
          onClick={() => {
            if (phase === "idle" || phase === "blurred") commit("finding");
          }}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-2 px-4 text-sm font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            busy
              ? "cursor-default bg-cobalt-wash text-foreground"
              : phase === "captured"
                ? "cursor-default border border-hairline-strong bg-transparent text-ink-3"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {busy ? (
            <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.25"
                strokeWidth="2"
              />
              <motion.circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray="0.28 0.72"
                style={{ originX: 0.5, originY: 0.5 }}
                animate={{ rotate: motionSafe ? 360 : 0 }}
                transition={
                  motionSafe
                    ? { duration: 1, ease: easings.linear, repeat: Infinity }
                    : { duration: 0 }
                }
              />
            </svg>
          ) : null}
          {buttonLabel}
        </button>
      </div>

      <span role="status" className="sr-only">
        {phase === "blurred" ? "" : PROMPT[phase]}
      </span>
    </div>
  );
}
