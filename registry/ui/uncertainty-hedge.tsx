"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HedgePhrase = {
  id: string;
  /** The phrase the model is guessing at, as it appears in the answer. */
  phrase: string;
  /** Why it is a guess, in one sentence. */
  why: string;
};

export type HedgeSegment = string | HedgePhrase;

export type UncertaintyHedgeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer in order: plain strings and guessed phrases. */
  segments: HedgeSegment[];
  /** Controlled id of the phrase whose reason is showing, or null. */
  open?: string | null;
  /** Initial open id for uncontrolled usage. @default null */
  defaultOpen?: string | null;
  /** Fires from the press or Escape that opened, swapped or folded a reason. */
  onOpenChange?: (id: string | null) => void;
  /** Fires when the phrase under the pointer or focus changes. */
  onHoverChange?: (id: string | null) => void;
  /** Whether the count legend shows above the paragraph. @default true */
  legend?: boolean;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Two bottom-anchored layers: a full-strength line that thickens, over a soft one that stays. */
const FULL = "linear-gradient(var(--color-warn), var(--color-warn))";
const SOFT =
  "linear-gradient(color-mix(in oklab, var(--color-warn) 55%, transparent), color-mix(in oklab, var(--color-warn) 55%, transparent))";

/** A digit column rolls to its value on `snap`; hidden, since the legend text carries the count. */
function Rolling({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span key={face} className="flex h-[1.25em] items-center">
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

type PhraseProps = {
  phrase: HedgePhrase;
  describedBy: string;
  delay: number;
  thick: boolean;
  open: boolean;
  noteId: string;
  motionSafe: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onToggle: () => void;
};

/**
 * One guessed phrase. The underline is a background rather than a border so
 * that `box-decoration-break: clone` gives every wrapped fragment its own
 * line. It draws left to right on `glide` after its cascade delay, then the
 * full-strength layer thickens from nothing to three pixels on `snap`.
 */
function Phrase({
  phrase,
  describedBy,
  delay,
  thick,
  open,
  noteId,
  motionSafe,
  onEnter,
  onLeave,
  onToggle,
}: PhraseProps) {
  const [drawn, setDrawn] = React.useState(false);
  const size = thick ? "100% 3px, 100% 1px" : "100% 0px, 100% 1px";
  return (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-controls={noteId}
      aria-describedby={describedBy}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "cursor-pointer rounded-1 outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <motion.span
        className="box-decoration-clone pb-px"
        style={{
          backgroundImage: `${FULL}, ${SOFT}`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "0 100%, 0 100%",
        }}
        initial={{ backgroundSize: "100% 0px, 0% 1px" }}
        animate={{ backgroundSize: size }}
        transition={
          !motionSafe
            ? { duration: durations.fast, ease: easings.enter }
            : drawn
              ? springs.snap
              : { ...springs.glide, delay }
        }
        onAnimationComplete={() => setDrawn(true)}
      >
        {phrase.phrase}
      </motion.span>
    </span>
  );
}

/**
 * An answer that marks the phrases it is guessing at. Each guessed phrase
 * carries a soft one-pixel warn underline that draws left to right on
 * `glide` in a `cascade()` when the answer mounts; hovering or focusing a
 * phrase thickens it to three pixels on `snap`, and leaving thins it again.
 * A legend above the paragraph shows the count, its digits rolling on `snap`
 * when the answer changes. Pressing a phrase reads why: a note beneath the
 * paragraph glides to its measured height with the phrase and the model's
 * reason, and the thick line holds on the phrase being read. Pressing again,
 * another phrase, or Escape swaps or folds it.
 *
 * The phrases are inline buttons — a real button cannot wrap with the
 * paragraph — with `aria-expanded` and `aria-controls` on the note, which is
 * a region and inert while folded. A polite live region reads the count when
 * the answer changes and the reason once when a note opens. Under reduced
 * motion the lines appear at full length, the thickening is a fast swap, the
 * height changes on a tween, and the digits swap in place.
 */
export function UncertaintyHedge({
  ref,
  segments,
  open: openProp,
  defaultOpen = null,
  onOpenChange,
  onHoverChange,
  legend = true,
  label,
  className,
}: UncertaintyHedgeProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const noteId = `${baseId}-note`;
  const noteLabelId = `${baseId}-note-label`;

  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpen);
  const open = openProp === undefined ? ownOpen : openProp;
  const [hover, setHover] = React.useState<string | null>(null);

  const phrases = segments.filter(
    (segment): segment is HedgePhrase => typeof segment !== "string",
  );
  const count = phrases.length;
  const stagger = cascade(count);
  const openPhrase = phrases.find((phrase) => phrase.id === open) ?? null;

  const setOpen = (next: string | null) => {
    if (next === open) return;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const setHovered = (next: string | null) => {
    if (next === hover) return;
    setHover(next);
    onHoverChange?.(next);
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setMeasured(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  // Each phrase's ordinal is settled before the tree is built, so the map
  // below never mutates a counter mid-render.
  const ordinals: number[] = [];
  let seen = 0;
  for (const segment of segments) {
    ordinals.push(typeof segment === "string" ? -1 : seen);
    if (typeof segment !== "string") seen += 1;
  }

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open !== null) {
          event.preventDefault();
          setOpen(null);
        }
      }}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {legend ? (
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span className="min-w-0 truncate">{label}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span
              aria-hidden
              className="h-px w-3 shrink-0"
              style={{ backgroundImage: SOFT }}
            />
            <span aria-hidden className="flex items-center">
              <Rolling value={String(count)} motionSafe={motionSafe} />
              &nbsp;{count === 1 ? "guess" : "guesses"}
            </span>
          </span>
        </div>
      ) : null}

      <p className="text-sm leading-relaxed text-foreground">
        {segments.map((segment, index) => {
          if (typeof segment === "string") {
            return (
              <React.Fragment key={`text-${index}`}>{segment}</React.Fragment>
            );
          }
          const ordinal = ordinals[index] ?? 0;
          const descId = `${baseId}-phrase-${segment.id}`;
          return (
            <React.Fragment key={`phrase-${segment.id}`}>
              <Phrase
                phrase={segment}
                describedBy={descId}
                delay={ordinal * stagger}
                thick={hover === segment.id || open === segment.id}
                open={open === segment.id}
                noteId={noteId}
                motionSafe={motionSafe}
                onEnter={() => setHovered(segment.id)}
                onLeave={() => setHovered(null)}
                onToggle={() =>
                  setOpen(open === segment.id ? null : segment.id)
                }
              />
              <span id={descId} className="sr-only">
                {`Guessed phrase ${ordinal + 1} of ${count}`}
              </span>
            </React.Fragment>
          );
        })}
      </p>

      <span id={noteLabelId} className="sr-only">
        Why it guessed
      </span>
      <motion.div
        id={noteId}
        role="region"
        aria-labelledby={noteLabelId}
        aria-hidden={openPhrase === null}
        inert={openPhrase === null}
        initial={false}
        animate={{ height: openPhrase ? measured : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="pt-1">
          {openPhrase ? (
            <motion.div
              key={openPhrase.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fade}
              className="flex flex-col gap-1 rounded-2 border border-hairline bg-surface-0 px-3 py-2"
            >
              <span className="font-mono text-[10px] tracking-[0.08em] text-warn uppercase">
                Guessing · {openPhrase.phrase}
              </span>
              <p className="text-xs leading-relaxed text-ink-2">
                {openPhrase.why}
              </p>
            </motion.div>
          ) : null}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {count} guessed {count === 1 ? "phrase" : "phrases"}
      </span>
      <span role="status" className="sr-only">
        {openPhrase ? `Why: ${openPhrase.why}` : ""}
      </span>
    </div>
  );
}
