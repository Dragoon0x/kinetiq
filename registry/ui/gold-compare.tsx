"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GoldCompareResult = {
  /** Dice similarity of the two word lists, as a whole percent. */
  similarity: number;
  /** Words that differ, counted across both panes. */
  differing: number;
};

export type GoldCompareProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The model's answer. */
  answer: string;
  /** The gold reference it is compared against. */
  reference: string;
  /** Controlled state of the Differences only switch. */
  diffOnly?: boolean;
  /** Initial state for uncontrolled usage. @default false */
  defaultDiffOnly?: boolean;
  /** Fires from the switch press. */
  onDiffOnlyChange?: (diffOnly: boolean) => void;
  /** Fires once a new pair has been diffed. */
  onCompare?: (result: GoldCompareResult) => void;
  /** Pane caption. @default "Answer" */
  answerLabel?: string;
  /** Pane caption. @default "Reference" */
  referenceLabel?: string;
  className?: string;
};

/** Past this many cells the diff reads as one replacement — honest, and cheap. */
const MAX_CELLS = 40_000;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

type Run = { same: boolean; words: string[] };

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);
/** Punctuation and case do not make a word wrong. */
const keyOf = (word: string) =>
  word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Keeps a callback out of an effect's dependencies so a re-render never re-fires it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Word-level longest common subsequence, returned as runs per side so each
 * pane can draw its own words and collapse the shared ones together.
 */
function diffWords(a: string[], b: string[]) {
  const same = new Array<boolean>(a.length).fill(false);
  const sameB = new Array<boolean>(b.length).fill(false);
  let shared = 0;
  if (a.length * b.length <= MAX_CELLS) {
    const cols = b.length + 1;
    const table = new Uint16Array((a.length + 1) * cols);
    const at = (i: number, j: number) => table[i * cols + j] ?? 0;
    for (let i = a.length - 1; i >= 0; i -= 1) {
      for (let j = b.length - 1; j >= 0; j -= 1) {
        table[i * cols + j] =
          keyOf(a[i] ?? "") === keyOf(b[j] ?? "")
            ? at(i + 1, j + 1) + 1
            : Math.max(at(i + 1, j), at(i, j + 1));
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (keyOf(a[i] ?? "") === keyOf(b[j] ?? "")) {
        same[i] = true;
        sameB[j] = true;
        shared += 1;
        i += 1;
        j += 1;
      } else if (at(i + 1, j) >= at(i, j + 1)) i += 1;
      else j += 1;
    }
  }
  const runsOf = (words: string[], marks: boolean[]): Run[] => {
    const runs: Run[] = [];
    words.forEach((word, index) => {
      const flag = marks[index] ?? false;
      const last = runs[runs.length - 1];
      if (last && last.same === flag) last.words.push(word);
      else runs.push({ same: flag, words: [word] });
    });
    return runs;
  };
  return { shared, answer: runsOf(a, same), reference: runsOf(b, sameB) };
}

/** Digits that roll to their value on `snap`; hidden because the status line speaks it. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => (
        // Keyed from the right so the units column keeps its identity when
        // the figure gains or loses a digit.
        <span
          key={value.length - index}
          className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col"
            initial={false}
            animate={{ y: `${Number(char) * -10}%` }}
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
      ))}
    </span>
  );
}

/**
 * One pane measures its own content so a collapse is a real height: the
 * ResizeObserver reports the border box and the outer box glides to it.
 */
function Pane({
  caption,
  runs,
  markWord,
  markClass,
  diffOnly,
  motionSafe,
}: {
  caption: string;
  runs: Run[];
  /** The word said before a differing run, for assistive technology. */
  markWord: string;
  markClass: string;
  diffOnly: boolean;
  motionSafe: boolean;
}) {
  const captionId = React.useId();
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

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

  return (
    <section
      aria-labelledby={captionId}
      className="min-w-0 rounded-2 border border-hairline bg-surface-0"
    >
      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
      >
        <div ref={innerRef}>
          <div className="flex h-6 items-center px-2.5">
            <span
              id={captionId}
              className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {caption}
            </span>
          </div>
          <p className="px-2.5 pb-2.5 text-sm leading-relaxed text-foreground">
            {runs.map((run, index) => {
              const hidden = run.same && diffOnly;
              // The key changes with the mode so a run remounts and fades
              // between its word form and its chip form.
              const key = `${index}-${hidden ? "chip" : "words"}`;
              const lead = index > 0 ? " " : null;
              return (
                <React.Fragment key={key}>
                  {lead}
                  <motion.span
                    className={
                      hidden
                        ? "inline-flex h-5 items-center rounded-full border border-hairline bg-surface-2 px-1.5 align-middle font-mono text-[10px] text-ink-3 tabular-nums"
                        : undefined
                    }
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                  >
                    {hidden ? (
                      <>
                        {run.words.length} same
                        <span className="sr-only"> words</span>
                      </>
                    ) : run.same ? (
                      run.words.join(" ")
                    ) : (
                      <>
                        <span className="sr-only">{markWord}: </span>
                        <span
                          className={cn(
                            "rounded-1 px-0.5 underline decoration-2 underline-offset-2",
                            markClass,
                          )}
                        >
                          {run.words.join(" ")}
                        </span>
                      </>
                    )}
                  </motion.span>
                </React.Fragment>
              );
            })}
          </p>
        </div>
      </motion.div>
    </section>
  );
}

/**
 * An answer beside its gold reference. The two are diffed word by word: in
 * the answer, words the reference lacks take a warn wash and underline; in
 * the reference, words the answer missed take a cobalt wash, so both panes
 * read as one edit. The similarity ring fills to the Dice similarity of the
 * word lists on `glide` — a quantity settling — and the percent beside it
 * rolls its digits on `snap`, because the roll belongs to the fill. The
 * Differences only switch collapses every shared run into a chip that counts
 * what it hides, and each pane glides to its measured height so nothing
 * reserves room for the longer state.
 *
 * The switch is a real `role="switch"`; the marks carry an underline and a
 * spoken word, never colour alone; the status line speaks the similarity once
 * per pair and the mode once per toggle. Under reduced motion the ring still
 * fills on a tween, the digits swap, the knob jumps and the heights tween.
 */
export function GoldCompare({
  ref,
  answer,
  reference,
  diffOnly,
  defaultDiffOnly = false,
  onDiffOnlyChange,
  onCompare,
  answerLabel = "Answer",
  referenceLabel = "Reference",
  className,
}: GoldCompareProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const compareRef = useLatest(onCompare);

  const [uncontrolled, setUncontrolled] = React.useState(defaultDiffOnly);
  const isControlled = diffOnly !== undefined;
  const current = isControlled ? diffOnly : uncontrolled;

  const diff = React.useMemo(() => {
    const a = wordsOf(answer);
    const b = wordsOf(reference);
    const result = diffWords(a, b);
    const total = a.length + b.length;
    return {
      ...result,
      fraction:
        total > 0 ? Number(((2 * result.shared) / total).toFixed(3)) : 0,
      differing: total - 2 * result.shared,
    };
  }, [answer, reference]);
  const percent = Math.round(diff.fraction * 100);

  // Reported per pair, not per figure: two cases that happen to share a
  // score still each announce their own diff.
  React.useEffect(() => {
    compareRef.current?.({ similarity: percent, differing: diff.differing });
  }, [diff, percent, compareRef]);

  // A toggle announcement belongs to the pair it was made on; a new pair
  // returns the live region to the similarity sentence.
  const pairKey = `${answer} ${reference}`;
  const [toggled, setToggled] = React.useState<{
    pairKey: string;
    text: string;
  } | null>(null);

  const setMode = (next: boolean) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    setToggled({ pairKey, text: next ? "Differences only" : "Full text" });
    onDiffOnlyChange?.(next);
  };

  const announcement =
    toggled && toggled.pairKey === pairKey
      ? toggled.text
      : `Similarity ${percent} percent, ${diff.differing} words differ`;

  return (
    <div
      ref={ref}
      role="group"
      aria-label="Answer against reference"
      className={cn(
        "@container flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-8 items-center justify-between gap-3">
        <span
          aria-hidden
          className="flex items-center gap-2 font-mono text-xs tabular-nums"
        >
          <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90">
            <circle
              cx="12"
              cy="12"
              r="9"
              className="fill-none stroke-hairline-strong"
              strokeWidth="3"
            />
            <motion.circle
              cx="12"
              cy="12"
              r="9"
              className="fill-none stroke-cobalt-bright"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: diff.fraction }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.enter }
              }
            />
          </svg>
          <span className="font-medium text-ink">
            <RollingNumber value={String(percent)} motionSafe={motionSafe} />%
          </span>
          <span className="text-ink-3">alike</span>
        </span>

        <span className="flex items-center gap-2">
          <span
            id={`${baseId}-switch`}
            className="text-[11px] font-medium text-ink-2"
          >
            Differences only
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={current}
            aria-labelledby={`${baseId}-switch`}
            onClick={() => setMode(!current)}
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full border transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              current
                ? "border-primary bg-primary"
                : "border-hairline-strong bg-surface-2",
            )}
          >
            <motion.span
              aria-hidden
              className={cn(
                "absolute top-0.5 left-0.5 block size-3.5 rounded-full transition-colors",
                current ? "bg-primary-foreground" : "bg-ink-3",
              )}
              initial={false}
              animate={{ x: current ? 16 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </button>
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-2 @sm:grid-cols-2">
        <Pane
          caption={answerLabel}
          runs={diff.answer}
          markWord="added"
          markClass="bg-warn/15 decoration-warn"
          diffOnly={current}
          motionSafe={motionSafe}
        />
        <Pane
          caption={referenceLabel}
          runs={diff.reference}
          markWord="missing"
          markClass="bg-cobalt-wash decoration-cobalt-bright"
          diffOnly={current}
          motionSafe={motionSafe}
        />
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
