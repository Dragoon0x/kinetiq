"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { PressureButton } from "@/registry/ui/pressure-button";

export type FieldReportSubmission = {
  /** Selected calibration notch, 1–5. */
  rating: number;
  note: string;
};

export type FieldReportProps = {
  onSubmit?: (submission: FieldReportSubmission) => void;
  /** Question above the rating rail. */
  prompt?: string;
  /** Labels under the rail ends, low to high. */
  endLabels?: [string, string];
  /** When set, a fresh form fades back in this long after filing. */
  resetAfterMs?: number;
  className?: string;
};

const NOTCH_COUNT = 5;
/** Immediate neighbors lean this far toward the selected indicator. */
const LEAN_DEG = 10;
/** One textarea row: 20px line height + 16px vertical padding. */
const NOTE_ROW_PX = 36;
/** Four rows — the focused height floor. */
const NOTE_GROWN_PX = 96;

const NOTCHES = Array.from({ length: NOTCH_COUNT }, (_, i) => i);

type Phase = "form" | "filing" | "logged";

const formatReportId = (serial: number): string =>
  `OBS-${String(serial).padStart(4, "0")}`;

/**
 * Feedback that files itself. Rating is five machined notches: the selected
 * indicator is a shared-layout bar that GLIDES between notches while
 * immediate neighbors lean ±10° toward it on `flick`. The note field grows
 * from one to four rows on `glide` with an underline that draws itself on
 * focus. A valid submit collapses the form scaleY→0.02 toward a hairline
 * slot at `exitFor(slow)`, the slot flashes the signal accent for a blink,
 * and a LOGGED stamp lands on `recoil` with the report id. An empty-rating
 * submit nudges the rail sideways and raises a mono alert. Reduced motion
 * teleports the indicator, drops the lean, and swaps filing for a fade.
 */
export function FieldReport({
  onSubmit,
  prompt = "How did it feel?",
  endLabels = ["Rough", "Dialed"],
  resetAfterMs,
  className,
}: FieldReportProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const promptId = `${baseId}-prompt`;
  const noteId = `${baseId}-note`;
  const indicatorId = `${baseId}-indicator`;

  const [phase, setPhase] = React.useState<Phase>("form");
  const [rating, setRating] = React.useState<number | null>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [serial, setSerial] = React.useState(42);
  const [flashKey, setFlashKey] = React.useState(0);

  const [noteFocused, setNoteFocused] = React.useState(false);
  const [noteContentPx, setNoteContentPx] = React.useState(0);

  const notchRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const nudgeX = useMotionValue(0);
  const nudgeControls = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(() => () => nudgeControls.current?.stop(), []);

  // Fresh form after filing; the timer resets if the phase changes under it.
  React.useEffect(() => {
    if (phase !== "logged" || resetAfterMs === undefined) return;
    const timer = window.setTimeout(() => {
      setPhase("form");
      setRating(null);
      setNote("");
      setNoteContentPx(0);
      setError(false);
      setStatus("");
      setSerial((s) => s + 1);
    }, resetAfterMs);
    return () => window.clearTimeout(timer);
  }, [phase, resetAfterMs]);

  const selectedIndex = rating === null ? null : rating - 1;

  const select = (index: number) => {
    setRating(index + 1);
    setError(false);
  };

  const moveTo = (index: number) => {
    const wrapped = (index + NOTCH_COUNT) % NOTCH_COUNT;
    select(wrapped);
    notchRefs.current[wrapped]?.focus();
  };

  const handleNotchKeyDown =
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      switch (event.key) {
        case "ArrowRight":
        case "ArrowUp":
          event.preventDefault();
          moveTo(index + 1);
          break;
        case "ArrowLeft":
        case "ArrowDown":
          event.preventDefault();
          moveTo(index - 1);
          break;
        case "Home":
          event.preventDefault();
          moveTo(0);
          break;
        case "End":
          event.preventDefault();
          moveTo(NOTCH_COUNT - 1);
          break;
        default:
          break;
      }
    };

  const notchLabel = (index: number): string => {
    const position = `${index + 1} of ${NOTCH_COUNT}`;
    if (index === 0) return `${position} — ${endLabels[0]}`;
    if (index === NOTCH_COUNT - 1) return `${position} — ${endLabels[1]}`;
    return position;
  };

  const handleSubmit = () => {
    if (rating === null) {
      setError(true);
      if (motionSafe) {
        nudgeControls.current?.stop();
        nudgeControls.current = animate(nudgeX, [0, -2, 2, -1, 0], {
          duration: durations.base,
          ease: easings.move,
        });
      }
      return;
    }
    onSubmit?.({ rating, note });
    setPhase("filing");
  };

  // The form finished collapsing into the slot: flash it, land the stamp.
  const handleExitComplete = () => {
    if (phase !== "filing") return;
    setFlashKey((k) => k + 1);
    setPhase("logged");
    setStatus("Report logged");
  };

  const measureNote = (el: HTMLTextAreaElement) =>
    setNoteContentPx(el.scrollHeight);

  const noteGrown = noteFocused || note.length > 0;
  const noteHeight = noteGrown
    ? Math.max(NOTE_GROWN_PX, noteContentPx)
    : NOTE_ROW_PX;

  return (
    <motion.div
      layout={motionSafe}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      style={{ borderRadius: 10 }}
      className={cn(
        "w-full max-w-sm border border-border bg-card p-5",
        className,
      )}
    >
      <AnimatePresence
        initial={false}
        mode="wait"
        onExitComplete={handleExitComplete}
      >
        {phase === "form" && (
          <motion.div
            key="form"
            style={{ transformOrigin: "bottom" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              motionSafe
                ? {
                    scaleY: 0.02,
                    y: distances.shift,
                    opacity: 0,
                    transition: exitFor(durations.slow),
                  }
                : { opacity: 0, transition: { duration: durations.fast } }
            }
            transition={{ duration: durations.base, ease: easings.enter }}
          >
            <p id={promptId} className="text-sm font-medium">
              {prompt}
            </p>

            <motion.div style={{ x: nudgeX }} className="mt-4">
              <div
                role="radiogroup"
                aria-labelledby={promptId}
                className="relative flex items-center justify-between px-1"
              >
                <span
                  aria-hidden
                  className="absolute inset-x-2 top-1/2 h-px bg-input"
                />
                {NOTCHES.map((index) => {
                  const selected = selectedIndex === index;
                  const lean =
                    motionSafe &&
                    selectedIndex !== null &&
                    Math.abs(index - selectedIndex) === 1
                      ? Math.sign(selectedIndex - index) * LEAN_DEG
                      : 0;
                  return (
                    <button
                      key={index}
                      ref={(node) => {
                        notchRefs.current[index] = node;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={notchLabel(index)}
                      tabIndex={
                        (selectedIndex === null ? index === 0 : selected)
                          ? 0
                          : -1
                      }
                      onClick={() => select(index)}
                      onKeyDown={handleNotchKeyDown(index)}
                      className="relative flex h-10 w-8 items-center justify-center rounded-2"
                    >
                      {selected ? (
                        <motion.span
                          layoutId={motionSafe ? indicatorId : undefined}
                          transition={springs.glide}
                          className="h-6 w-[3px] rounded-full bg-primary"
                        />
                      ) : (
                        <motion.span
                          aria-hidden
                          initial={false}
                          animate={{ rotate: lean }}
                          transition={
                            motionSafe ? springs.flick : { duration: 0 }
                          }
                          className="h-4 w-0.5 rounded-full bg-muted-foreground/40"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <div
                aria-hidden
                className="mt-1 flex items-center justify-between px-1 font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
              >
                <span>{endLabels[0]}</span>
                <span>{endLabels[1]}</span>
              </div>
            </motion.div>

            <AnimatePresence initial={false}>
              {error && (
                <motion.p
                  key="alert"
                  role="alert"
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? { duration: durations.base, ease: easings.enter }
                      : { duration: durations.fast }
                  }
                  className="mt-2 font-mono text-[10px] font-medium tracking-[0.08em] text-destructive uppercase"
                >
                  Select a rating
                </motion.p>
              )}
            </AnimatePresence>

            <div className="mt-4">
              <label
                htmlFor={noteId}
                className="font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
              >
                Field note (optional)
              </label>
              <div className="relative mt-1">
                <motion.div
                  initial={false}
                  animate={{ height: noteHeight }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                  className="overflow-hidden"
                >
                  <textarea
                    id={noteId}
                    value={note}
                    placeholder="What did you notice?"
                    onChange={(event) => {
                      setNote(event.target.value);
                      measureNote(event.currentTarget);
                    }}
                    onFocus={(event) => {
                      setNoteFocused(true);
                      measureNote(event.currentTarget);
                    }}
                    onBlur={() => setNoteFocused(false)}
                    className="h-full w-full resize-none bg-transparent py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground/60"
                  />
                </motion.div>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-px bg-input"
                />
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ scaleX: noteFocused ? 1 : 0 }}
                  transition={
                    noteFocused
                      ? motionSafe
                        ? { duration: durations.base, ease: easings.enter }
                        : { duration: durations.fast }
                      : exitFor(motionSafe ? durations.base : durations.fast)
                  }
                  className="absolute inset-x-0 bottom-0 h-px origin-left bg-primary"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <PressureButton size="sm" onClick={handleSubmit}>
                File report
              </PressureButton>
            </div>
          </motion.div>
        )}

        {phase === "logged" && (
          <motion.div
            key="logged"
            initial={
              motionSafe
                ? { opacity: 0, scale: 1.4, rotate: -14 }
                : { opacity: 0 }
            }
            animate={
              motionSafe ? { opacity: 1, scale: 1, rotate: -8 } : { opacity: 1 }
            }
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.recoil : { duration: durations.fast }
            }
            className="flex min-h-[248px] items-center justify-center"
          >
            <span className="flex flex-col items-center rounded-1 border-2 border-primary px-5 py-2 text-primary">
              <span className="font-mono text-lg font-bold tracking-[0.2em] uppercase">
                Logged
              </span>
              <span className="font-mono text-[10px] tracking-[0.15em] tabular-nums">
                {formatReportId(serial)}
              </span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The filing slot: a hairline the form disappears into. */}
      <div aria-hidden className="relative mt-5 h-0.5">
        <span className="absolute inset-0 rounded-full bg-input" />
        {flashKey > 0 && (
          <motion.span
            key={flashKey}
            style={{ backgroundColor: "var(--signal, var(--primary))" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: durations.blink * 2, ease: easings.linear }}
            className="absolute inset-0 rounded-full"
          />
        )}
      </div>

      <span role="status" className="sr-only">
        {status}
      </span>
    </motion.div>
  );
}
