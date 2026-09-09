"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ForgetItem = {
  id: string;
  /** The remembered fact, one line. */
  text: string;
  /** Where it was learned; printed in mono beneath the fact. */
  source?: string;
};

export type ForgetSweepProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The remembered facts in list order; the host owns the list. */
  items: ForgetItem[];
  /** Milliseconds the undo chip stays before the forget commits. @default 4000 */
  undoWindow?: number;
  /** Fires when Forget is pressed and the undo window opens. */
  onForgetStart?: (id: string) => void;
  /** Fires when the window runs out without an undo; remove the item here. */
  onForget?: (id: string) => void;
  /** Fires from the Undo button. */
  onUndo?: (id: string) => void;
  /** Names the list. */
  label: string;
  className?: string;
};

type Phase = "kept" | "wiping" | "gone" | "restoring" | "expired";
type Notice = { text: string; n: number };

/** Keeps callbacks out of effect dependencies so a re-render never restarts the ring. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const FULL = "inset(0% 0% 0% 0%)";
/** The left inset grows, so the text is erased from the left edge rightward. */
const WIPED = "inset(0% 0% 0% 100%)";
/** A restore starts tucked behind the right edge, so the text returns from the left. */
const RESTORE = ["inset(0% 100% 0% 0%)", FULL];

/**
 * When a window closes on a focused chip, focus goes to the next row's Forget
 * button that is still live, else the previous one, else the list itself.
 */
function focusNeighbour(row: HTMLLIElement) {
  const list = row.closest("ul");
  if (!list) return;
  const live = Array.from(
    list.querySelectorAll<HTMLButtonElement>("button[data-forget]"),
  ).filter((button) => button.tabIndex === 0);
  const follows = (node: Node) =>
    (row.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !==
    0;
  const after = live.find(follows);
  const before = [...live].reverse().find((button) => !follows(button));
  (after ?? before ?? list).focus();
}

const isFocusVisible = (node: Element) => {
  try {
    return node.matches(":focus-visible");
  } catch {
    return true;
  }
};

type RowProps = {
  item: ForgetItem;
  undoWindow: number;
  motionSafe: boolean;
  hidden: boolean;
  onStart: (id: string) => void;
  onExpire: (id: string) => void;
  onUndo: (id: string) => void;
  onNotice: (text: string) => void;
};

function ForgetRow({
  item,
  undoWindow,
  motionSafe,
  hidden,
  onStart,
  onExpire,
  onUndo,
  onNotice,
}: RowProps) {
  const [phase, setPhase] = React.useState<Phase>("kept");
  const [held, setHeld] = React.useState(false);
  const rowRef = React.useRef<HTMLLIElement | null>(null);
  const forgetRef = React.useRef<HTMLButtonElement | null>(null);
  const undoRef = React.useRef<HTMLButtonElement | null>(null);
  const latest = useLatest({ onExpire, onNotice });

  // 1 → 0 across the window. A motion value, not state, so pausing is free:
  // stop the animation, resume from what is left, nothing re-renders between.
  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);

  const paused = held || hidden;
  React.useEffect(() => {
    if (phase !== "gone" || paused) return;
    const controls = animate(remaining, 0, {
      // The countdown is information, so it drains at the same linear rate
      // under reduced motion.
      duration: (undoWindow / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => {
        const row = rowRef.current;
        if (row && row.contains(document.activeElement)) focusNeighbour(row);
        setPhase("expired");
        latest.current.onNotice(`${item.text} gone`);
        latest.current.onExpire(item.id);
      },
    });
    return () => controls.stop();
  }, [phase, paused, undoWindow, remaining, item.id, item.text, latest]);

  // The chip takes focus once it mounts and the Forget button hands it back
  // after a restore — but only while focus is still on this row or nowhere,
  // so a viewer who moved on mid-wipe is never pulled back.
  React.useEffect(() => {
    if (phase !== "gone" && phase !== "restoring") return;
    const active = document.activeElement;
    const row = rowRef.current;
    if (active && active !== document.body && !row?.contains(active)) return;
    (phase === "gone" ? undoRef : forgetRef).current?.focus();
  }, [phase]);

  const forget = () => {
    if (phase !== "kept") return;
    remaining.set(1);
    setPhase("wiping");
    onStart(item.id);
  };

  const undo = () => {
    if (phase !== "gone") return;
    setPhase("restoring");
    onUndo(item.id);
  };

  const wiped = phase === "wiping" || phase === "gone" || phase === "expired";
  const chipOpen = phase === "gone" || phase === "expired";
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <motion.li
      ref={rowRef}
      layout={motionSafe ? "position" : false}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={{ layout: springs.glide }}
      className="relative rounded-2 border border-hairline bg-surface-2"
    >
      <motion.div
        initial={false}
        animate={
          motionSafe
            ? { clipPath: wiped ? WIPED : RESTORE, opacity: 1 }
            : { clipPath: FULL, opacity: wiped ? 0 : 1 }
        }
        // A wipe is a clip, so it tweens; the destructive direction leaves on
        // the exit ease and the restore arrives on the enter ease.
        transition={
          motionSafe
            ? wiped
              ? { duration: durations.slow, ease: easings.exit }
              : { duration: durations.base, ease: easings.enter }
            : fade
        }
        onAnimationComplete={() => {
          if (phase === "wiping") {
            setPhase("gone");
            onNotice(
              `Forgot ${item.text}. Undo for ${Math.round(undoWindow / 1000)} seconds`,
            );
          } else if (phase === "restoring") {
            setPhase("kept");
            onNotice(`Restored ${item.text}`);
          }
        }}
        aria-hidden={wiped || undefined}
        className="flex items-center gap-2.5 py-2 pr-2 pl-3"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-4 shrink-0 text-ink-3"
        >
          <path d="M8 2.5a4 4 0 0 1 4 4c0 2.2-1.2 3-1.2 4.5H5.2C5.2 9.5 4 8.7 4 6.5a4 4 0 0 1 4-4zM6.5 13.5h3" />
        </svg>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm text-foreground" title={item.text}>
            {item.text}
          </span>
          {item.source ? (
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {item.source}
            </span>
          ) : null}
        </span>
        <button
          ref={forgetRef}
          type="button"
          data-forget=""
          aria-label={`Forget: ${item.text}`}
          tabIndex={wiped ? -1 : 0}
          onClick={forget}
          className={cn(
            "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          Forget
        </button>
      </motion.div>

      {/* The eraser head rides the wipe's leading edge on the same tween. It
          sweeps inside a 1px inset so it never pokes past the row. */}
      <AnimatePresence>
        {motionSafe && phase === "wiping" ? (
          <span
            key="eraser"
            aria-hidden
            className="pointer-events-none absolute inset-y-1 right-px left-px"
          >
            <motion.span
              initial={{ left: "0%" }}
              animate={{ left: "100%" }}
              exit={{ opacity: 0, transition: { duration: durations.blink } }}
              transition={{ duration: durations.slow, ease: easings.exit }}
              className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-ink-3"
            />
          </span>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {chipOpen ? (
          <motion.div
            key="chip"
            initial={
              motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: phase === "expired" ? 0.5 : 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={motionSafe ? { ...springs.snap, opacity: fade } : fade}
            // A hover or a keyboard focus holds the ring; focus that arrived
            // from a pointer press does not, or the window would never close.
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={() => setHeld(false)}
            onFocus={(event) => {
              if (isFocusVisible(event.target)) setHeld(true);
            }}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (!next || !event.currentTarget.contains(next)) setHeld(false);
            }}
            onKeyDown={(event) => {
              // Escape commits nothing; it only lets the ring keep draining.
              if (event.key === "Escape") setHeld(false);
            }}
            className="absolute inset-0 flex items-center gap-2.5 py-2 pr-2 pl-3"
          >
            <span className="grid size-4 shrink-0 place-items-center">
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                className="size-4 -rotate-90"
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.2"
                  strokeWidth="2"
                />
                <motion.circle
                  cx="8"
                  cy="8"
                  r="6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  className="text-cobalt-bright"
                  style={{ strokeDashoffset: ringOffset }}
                />
              </svg>
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-sm">
              <span className="shrink-0 font-medium text-foreground">
                {phase === "expired" ? "Gone" : "Forgot"}
              </span>
              <span className="truncate text-ink-3">{item.text}</span>
            </span>
            {phase === "gone" ? (
              <button
                ref={undoRef}
                type="button"
                aria-label={`Undo forgetting ${item.text}`}
                onClick={undo}
                className={cn(
                  "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong bg-surface-0 px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                Undo
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/**
 * Forgetting with a window to take it back. Pressing Forget wipes the fact
 * away left to right on a clip tween — a wipe is a clip, and a destructive act
 * never bounces — with an eraser head riding the edge. When the wipe lands an
 * undo chip rises into the same row from `distances.nudge` on `snap`, so the
 * row keeps its height and nothing beneath shifts, and a ring beside it drains
 * linearly across `undoWindow`. Hovering or focusing the chip holds the ring;
 * a hidden document pauses it; Undo wipes the fact back in from the left on
 * the enter ease. When the ring runs out `onForget` fires, the row fades on
 * the exit ease, its siblings travel up on `glide`, and the list's measured
 * height follows.
 *
 * Every control is a real button: Forget hands focus to Undo once the chip
 * mounts, and a window that closes on a focused chip moves focus to the next
 * live row, or the list. A status line announces the forget, the restore and
 * the expiry once each, on settle. Under reduced motion the wipe is a fade and
 * the chip appears in place; the ring still drains, because the countdown is
 * information.
 */
export function ForgetSweep({
  ref,
  items,
  undoWindow = 4000,
  onForgetStart,
  onForget,
  onUndo,
  label,
  className,
}: ForgetSweepProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  // The notice carries a counter so the same sentence twice in a row still
  // mutates the live region and is read again.
  const [notice, setNotice] = React.useState<Notice>({ text: "", n: 0 });
  const announce = React.useCallback(
    (text: string) => setNotice((prev) => ({ text, n: prev.n + 1 })),
    [],
  );

  // A hidden tab must not burn the undo window while nobody can see the ring.
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    const sync = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      setHeight(
        Math.round(
          box ? box.blockSize : entry.target.getBoundingClientRect().height,
        ),
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="px-3 pb-3">
          {items.length === 0 ? (
            <p className="flex h-9 items-center text-xs text-ink-3">
              Nothing remembered
            </p>
          ) : null}
          <ul
            tabIndex={-1}
            aria-labelledby={labelId}
            className={cn(
              "flex flex-col gap-1.5 rounded-2 outline-none empty:hidden",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <ForgetRow
                  key={item.id}
                  item={item}
                  undoWindow={undoWindow}
                  motionSafe={motionSafe}
                  hidden={hidden}
                  onStart={(id) => onForgetStart?.(id)}
                  onExpire={(id) => onForget?.(id)}
                  onUndo={(id) => onUndo?.(id)}
                  onNotice={announce}
                />
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        <span key={notice.n}>{notice.text}</span>
      </span>
    </div>
  );
}
