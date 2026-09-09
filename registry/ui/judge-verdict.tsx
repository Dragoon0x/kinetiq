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
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type JudgeVerdictLabel = "pass" | "fail" | "borderline";

export type JudgeVerdictValue = {
  /** The judge's score, 0 to `max`. */
  score: number;
  label: JudgeVerdictLabel;
  /** How sure the judge is, 0–1. */
  confidence: number;
  /** The judge's reasoning as short points. */
  reasoning: string[];
};

export type JudgeVerdictProps = {
  ref?: React.Ref<HTMLElement>;
  /** The judge model's name; the header caption. */
  judge: string;
  /** What is being judged; prints beside the judge. */
  caseLabel?: string;
  /** The host is waiting on the judge. @default false */
  judging?: boolean;
  /** The verdict once it exists. */
  verdict?: JudgeVerdictValue | null;
  /** The score's ceiling. @default 10 */
  max?: number;
  /** Controlled state of the reasoning disclosure. */
  reasoningOpen?: boolean;
  /** Initial state for uncontrolled usage. @default true */
  defaultReasoningOpen?: boolean;
  /** Fires from the disclosure press. */
  onReasoningOpenChange?: (open: boolean) => void;
  className?: string;
};

const WORDS: Record<JudgeVerdictLabel, { word: string; tone: string }> = {
  pass: { word: "Pass", tone: "bg-success/15 text-success" },
  fail: { word: "Fail", tone: "bg-danger/15 text-danger" },
  borderline: { word: "Borderline", tone: "bg-warn/15 text-warn" },
};

/** Below this the confidence bar turns warn. */
const LOW_CONFIDENCE = 0.5;
/** The beat between the score landing and the reasoning unfolding. */
const UNFOLD_DELAY_S = 0.25;

/**
 * A verdict card from a judge model. While `judging` the score slot reads a
 * dash and a dot breathes beside the word; when `verdict` arrives the score
 * rolls in — a motion value counting from zero on `glide`, rendered straight
 * into the readout so the count costs no re-renders — and the verdict word
 * lands beside it on `snap` with a four-pixel nudge. The confidence bar
 * fills to the judge's confidence on `glide`, tinting warn below one half.
 * Then the reasoning unfolds: a disclosure whose box glides from zero to its
 * measured height (a ResizeObserver, so the fold is a real number), its
 * points arriving in a `cascade` with a nudge. A fail lands on the same
 * spring in danger ink; nothing on the card bounces.
 *
 * The score readout is hidden from assistive technology while it counts and
 * the status line speaks the verdict once; the bar is a `role="meter"`; the
 * disclosure is a real button and the folded list is inert. Under reduced
 * motion the score swaps to its value, the word fades without a nudge, the
 * bar fills on a tween because confidence is information, and the reasoning
 * box tweens open with its points fading in place.
 */
export function JudgeVerdict({
  ref,
  judge,
  caseLabel,
  judging = false,
  verdict = null,
  max = 10,
  reasoningOpen,
  defaultReasoningOpen = true,
  onReasoningOpenChange,
  className,
}: JudgeVerdictProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const judgeId = `${baseId}-judge`;
  const panelId = `${baseId}-reasoning`;
  const confidenceId = `${baseId}-confidence`;

  const [uncontrolledOpen, setUncontrolledOpen] =
    React.useState(defaultReasoningOpen);
  const isControlled = reasoningOpen !== undefined;
  const open = isControlled ? reasoningOpen : uncontrolledOpen;

  const decimals = max <= 10 ? 1 : 0;
  const score = verdict
    ? Math.min(max, Math.max(0, Number(verdict.score.toFixed(decimals))))
    : 0;
  const count = useMotionValue(0);
  const shown = useTransform(count, (value) => value.toFixed(decimals));

  React.useEffect(() => {
    if (!verdict) {
      count.set(0);
      return;
    }
    if (!motionSafe) {
      count.set(score);
      return;
    }
    const controls = animate(count, score, springs.glide);
    return () => controls.stop();
  }, [verdict, score, motionSafe, count]);

  const confidence = verdict
    ? Number(Math.min(1, Math.max(0, verdict.confidence)).toFixed(3))
    : 0;
  const percent = Math.round(confidence * 100);
  const low = verdict !== null && confidence < LOW_CONFIDENCE;
  const settled = verdict ? WORDS[verdict.label] : null;
  const verdictKey = verdict
    ? `${verdict.label}-${score}-${verdict.reasoning.length}`
    : "none";

  // A disclosure press on this verdict opens at once; the unfold that follows
  // a fresh verdict waits a beat for the score to land first.
  const [toggledFor, setToggledFor] = React.useState<string | null>(null);
  const toggle = () => {
    const next = !open;
    if (!isControlled) setUncontrolledOpen(next);
    setToggledFor(verdictKey);
    onReasoningOpenChange?.(next);
  };
  const unfoldDelay = toggledFor === verdictKey ? 0 : UNFOLD_DELAY_S;

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const next = box ? box.blockSize : node.getBoundingClientRect().height;
      setHeight(Math.ceil(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };
  const stagger = cascade(verdict?.reasoning.length ?? 1);

  const announcement =
    verdict && settled
      ? `${settled.word}, ${score.toFixed(decimals)} of ${max}, confidence ${percent} percent`
      : judging
        ? "Judging"
        : "";

  return (
    <article
      ref={ref}
      aria-labelledby={judgeId}
      aria-busy={judging || undefined}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span
          id={judgeId}
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
          title={judge}
        >
          {judge}
        </span>
        {caseLabel ? (
          <span className="shrink-0 text-[11px] text-ink-3">{caseLabel}</span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-baseline gap-1.5 font-mono tabular-nums">
          {/* The count is decoration while it runs; the status line speaks
              the settled figure. */}
          <span aria-hidden className="text-3xl font-medium text-ink">
            {verdict ? <motion.span>{shown}</motion.span> : "–"}
          </span>
          <span className="text-xs text-ink-3">/ {max}</span>
        </span>

        <span className="flex h-7 items-center">
          <AnimatePresence mode="wait" initial={false}>
            {verdict && settled ? (
              <motion.span
                key={verdictKey}
                className={cn(
                  "inline-flex h-7 items-center rounded-full px-2.5 font-mono text-[11px] font-medium tracking-[0.08em] uppercase",
                  settled.tone,
                )}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { ...springs.snap, opacity: fade } : fade
                }
              >
                {settled.word}
              </motion.span>
            ) : (
              <motion.span
                key={judging ? "judging" : "waiting"}
                className="flex items-center gap-2 text-xs text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {judging ? (
                  <motion.span
                    aria-hidden
                    className="size-1.5 rounded-full bg-cobalt-bright"
                    initial={{ opacity: motionSafe ? 0.3 : 0.7 }}
                    animate={{ opacity: motionSafe ? 1 : 0.7 }}
                    transition={
                      motionSafe
                        ? {
                            duration: durations.slow,
                            ease: easings.move,
                            repeat: Infinity,
                            repeatType: "reverse",
                          }
                        : { duration: 0 }
                    }
                  />
                ) : null}
                {judging ? "Judging" : "Awaiting verdict"}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex h-4 items-center justify-between gap-3">
          <span
            id={confidenceId}
            className="text-[11px] font-medium text-ink-2"
          >
            Confidence
          </span>
          <span
            aria-hidden
            className={cn(
              "font-mono text-[11px] tabular-nums transition-colors",
              low ? "text-warn" : "text-ink-3",
            )}
          >
            {verdict ? (
              // The figure reads once the bar has reached it, not before.
              <motion.span
                key={verdictKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  ...fade,
                  delay: motionSafe ? durations.slow : 0,
                }}
              >
                {percent}%
              </motion.span>
            ) : (
              "—"
            )}
          </span>
        </div>
        <div
          role="meter"
          aria-labelledby={confidenceId}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={verdict ? `${percent} percent` : "No verdict yet"}
          className="h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong"
        >
          <motion.span
            className={cn(
              "block h-full origin-left rounded-full transition-colors",
              low ? "bg-warn" : "bg-cobalt-bright",
            )}
            initial={false}
            animate={{ scaleX: confidence }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.enter }
            }
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {verdict ? (
          <motion.div
            key="reasoning"
            className="flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={toggle}
              className={cn(
                "flex h-7 items-center justify-between gap-2 rounded-2 px-1 text-xs font-medium text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <span>Reasoning</span>
              <motion.svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 shrink-0"
                initial={false}
                animate={{ rotate: open ? 180 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <path d="m4 6 4 4 4-4" />
              </motion.svg>
            </button>

            <motion.div
              id={panelId}
              className="overflow-hidden"
              initial={{ height: 0 }}
              animate={{ height: open ? height : 0 }}
              transition={{ ...glide, delay: open ? unfoldDelay : 0 }}
            >
              <div ref={innerRef} inert={!open || undefined}>
                <ol
                  key={verdictKey}
                  className="flex list-none flex-col gap-1.5 px-1 pt-1 pb-0.5"
                >
                  {verdict.reasoning.map((point, index) => (
                    <motion.li
                      key={index}
                      className="flex gap-2 text-xs leading-snug text-foreground"
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.nudge }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              opacity: fade,
                              delay: unfoldDelay + index * stagger,
                            }
                          : { ...fade, delay: index * stagger }
                      }
                    >
                      <span className="shrink-0 font-mono text-[10px] leading-[1.6] text-ink-3 tabular-nums">
                        {index + 1}
                      </span>
                      <span>{point}</span>
                    </motion.li>
                  ))}
                </ol>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </article>
  );
}
