"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FilterMaskProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The message. Caught words are matched inside it. */
  text: string;
  /** The words the room filter catches, matched whole-word and case-insensitively. */
  terms?: string[];
  /** The sender, shown above the bubble. @default "Ines Rocha" */
  author?: string;
  /** A plain string: the component never reads a clock. @default "14:02" */
  time?: string;
  /** Who masked the words; named in the header sentence. @default "Coldbrook filter" */
  filterName?: string;
  /** Controlled reveal-all state. */
  revealed?: boolean;
  /** Initial reveal-all state for uncontrolled use. @default false */
  defaultRevealed?: boolean;
  onRevealedChange?: (revealed: boolean) => void;
  /** Fires when a single block is uncovered. */
  onWordReveal?: (word: string, index: number) => void;
  /** Fires from an effect whenever the masked count changes. */
  onMaskedCountChange?: (masked: number, total: number) => void;
  /** Holds the toggle and every block. @default false */
  disabled?: boolean;
  className?: string;
};

const DEFAULT_TERMS = ["soaked", "useless", "clueless", "rubbish"];

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const escapeTerm = (term: string) =>
  term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Run =
  | { kind: "text"; key: string; value: string }
  | { kind: "mask"; key: string; value: string; index: number };

/**
 * Splits the message into plain runs and caught runs. Pure and deterministic,
 * so the server and the client build the same paragraph.
 */
const runsFor = (text: string, terms: string[]): Run[] => {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return [{ kind: "text", key: "run-0", value: text }];
  }
  const pattern = new RegExp(
    `\\b(?:${cleaned.map(escapeTerm).join("|")})\\b`,
    "gi",
  );
  const runs: Run[] = [];
  let at = 0;
  let masked = 0;
  for (
    let match = pattern.exec(text);
    match !== null;
    match = pattern.exec(text)
  ) {
    const found = match[0] ?? "";
    if (found.length === 0) {
      pattern.lastIndex += 1;
      continue;
    }
    if (match.index > at) {
      runs.push({
        kind: "text",
        key: `run-${runs.length}`,
        value: text.slice(at, match.index),
      });
    }
    runs.push({
      kind: "mask",
      key: `run-${runs.length}`,
      value: found,
      index: masked,
    });
    masked += 1;
    at = match.index + found.length;
  }
  if (at < text.length) {
    runs.push({
      kind: "text",
      key: `run-${runs.length}`,
      value: text.slice(at),
    });
  }
  return runs;
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** "All 1 word is shown" is not a sentence anybody says. */
const allShownLine = (total: number) =>
  total === 1 ? "The masked word is shown." : `All ${total} words are shown.`;

/**
 * Words, masked. Each word the room filter caught keeps its place in the line —
 * the text is still there, at full width, under an opaque hatched block — so
 * uncovering one never reflows the sentence around it. The block is a
 * `motion.span` with its origin on the right whose `scaleX` runs 1 → 0 on
 * `snap`: the cover retreats rightward and the word appears from the left, in
 * reading order. Revealing everything runs the same wipe across the blocks in a
 * `cascade()` so a long message uncovers inside the choreography budget;
 * masking again grows the covers back on `glide`, because covering is a settle
 * rather than a switch.
 *
 * Every block is a real button, so one word can be uncovered without uncovering
 * the rest, and each carries a whole-sentence `aria-label` — the masked ones
 * naming nothing, the shown ones naming the word — so a screen reader hears
 * exactly what the sighted reader sees and no more. The count above the bubble
 * reads as a sentence, pluralised, and the two readings share one grid cell and
 * cross-fade rather than swapping. Under reduced motion the covers fade instead
 * of wiping and the cascade collapses, but what is hidden still reads, because
 * that is information rather than flourish.
 */
export function FilterMask({
  ref,
  text,
  terms = DEFAULT_TERMS,
  author = "Ines Rocha",
  time = "14:02",
  filterName = "Coldbrook filter",
  revealed,
  defaultRevealed = false,
  onRevealedChange,
  onWordReveal,
  onMaskedCountChange,
  disabled = false,
  className,
}: FilterMaskProps) {
  const motionSafe = useMotionSafe();
  const runs = React.useMemo(() => runsFor(text, terms), [text, terms]);
  const total = runs.reduce(
    (sum, run) => sum + (run.kind === "mask" ? 1 : 0),
    0,
  );

  const [uncontrolled, setUncontrolled] = React.useState(defaultRevealed);
  const isControlled = revealed !== undefined;
  const allRevealed = isControlled ? revealed : uncontrolled;

  // Per-word choices layer on top of the all-or-none baseline and clear the
  // moment that baseline flips, so one control never leaves the other stale.
  const [picked, setPicked] = React.useState<{ base: boolean; set: number[] }>({
    base: allRevealed,
    set: [],
  });
  if (picked.base !== allRevealed) setPicked({ base: allRevealed, set: [] });

  const isShown = (index: number) => allRevealed !== picked.set.includes(index);
  const shownCount = runs.reduce(
    (sum, run) => sum + (run.kind === "mask" && isShown(run.index) ? 1 : 0),
    0,
  );
  const masked = total - shownCount;

  const [spoken, setSpoken] = React.useState("");

  const countRef = React.useRef(onMaskedCountChange);
  React.useEffect(() => {
    countRef.current = onMaskedCountChange;
  });
  React.useEffect(() => {
    countRef.current?.(masked, total);
  }, [masked, total]);

  const toggleAll = () => {
    const next = !allRevealed;
    if (!isControlled) setUncontrolled(next);
    onRevealedChange?.(next);
    setSpoken(
      next
        ? allShownLine(total)
        : `${plural(total, "word", "words")} masked again.`,
    );
  };

  const toggleWord = (index: number, word: string) => {
    const nextShown = !isShown(index);
    setPicked((prev) => ({
      base: prev.base,
      set: prev.set.includes(index)
        ? prev.set.filter((item) => item !== index)
        : [...prev.set, index],
    }));
    setSpoken(
      nextShown
        ? `The word under the block is ${word}.`
        : "That word is masked again.",
    );
    // Never from inside the updater: the host hears about it beside the change,
    // not during it.
    if (nextShown) onWordReveal?.(word, index);
  };

  const headline =
    total === 0
      ? `Nothing masked by the ${filterName}.`
      : masked === 0
        ? allShownLine(total)
        : `${masked} of ${plural(total, "word", "words")} masked by the ${filterName}.`;

  const stagger = cascade(Math.max(total, 1));

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-start justify-between gap-2">
        {/* Both readings share one grid cell and cross-fade, so the sentence
            never swaps through an empty frame. */}
        <span className="grid min-w-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.span
              key={headline}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={FADE}
              className="col-start-1 row-start-1 text-[11px] leading-snug text-ink-2"
            >
              {headline}
            </motion.span>
          </AnimatePresence>
        </span>

        <button
          type="button"
          disabled={disabled || total === 0}
          aria-pressed={allRevealed}
          aria-label={
            allRevealed
              ? `Mask all ${plural(total, "word", "words")} again`
              : `Reveal all ${plural(total, "masked word", "masked words")}`
          }
          onClick={toggleAll}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50",
          )}
        >
          {allRevealed ? "Mask all" : "Reveal all"}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] leading-snug text-ink-3">
          {`${author} · ${time}`}
        </span>
        <p className="rounded-3 rounded-tl-1 border border-hairline bg-surface-2 px-3 py-2 text-sm leading-relaxed">
          {runs.map((run) => {
            if (run.kind === "text")
              return <span key={run.key}>{run.value}</span>;
            const shown = isShown(run.index);
            return (
              <button
                key={run.key}
                type="button"
                disabled={disabled}
                aria-pressed={shown}
                aria-label={
                  shown
                    ? `${run.value}, shown. Mask it again.`
                    : `Masked word ${run.index + 1} of ${total}. Reveal it.`
                }
                onClick={() => toggleWord(run.index, run.value)}
                className={cn(
                  "relative inline-block rounded-1 align-baseline outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
                )}
              >
                <span aria-hidden>{run.value}</span>
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={
                    motionSafe
                      ? { scaleX: shown ? 0 : 1 }
                      : { opacity: shown ? 0 : 1 }
                  }
                  transition={
                    motionSafe
                      ? {
                          ...(shown ? springs.snap : springs.glide),
                          delay: shown && allRevealed ? run.index * stagger : 0,
                        }
                      : {
                          ...FADE,
                          delay: shown && allRevealed ? run.index * stagger : 0,
                        }
                  }
                  className={cn(
                    "pointer-events-none absolute -inset-x-0.5 -inset-y-px origin-right rounded-1 bg-ink-3",
                    "[background-image:repeating-linear-gradient(45deg,transparent_0_3px,var(--bg-2)_3px_4px)]",
                  )}
                />
              </button>
            );
          })}
        </p>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
