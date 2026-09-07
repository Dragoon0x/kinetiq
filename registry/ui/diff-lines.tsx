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

export type DiffView = "change" | "result";

export type DiffLinesProps = {
  /** The original text; the diff is computed by word. */
  before: string;
  /** The edited text; the diff is computed by word. */
  after: string;
  /** Controlled view. */
  view?: DiffView;
  /** Initial view for uncontrolled usage. @default "change" */
  defaultView?: DiffView;
  onViewChange?: (view: DiffView) => void;
  /** Fires when a hunk is accepted. */
  onAccept?: (index: number) => void;
  /** Fires whenever the accepted set changes, restores included. */
  onAcceptedChange?: (indexes: number[]) => void;
  /** Visible label above the passage. */
  label?: string;
  className?: string;
};

type Hunk = { kind: "hunk"; index: number; removed: string; added: string };
type Piece = { kind: "same"; text: string } | Hunk;

/** Identity travels with the wording, not the position. */
const keyOf = (hunk: Hunk) => `${hunk.removed}|${hunk.added}|${hunk.index}`;

/**
 * Word-level LCS. The guard keeps a pasted essay from building a million-cell
 * table on the main thread — past it the passage reads as one replacement,
 * which is the honest summary anyway.
 */
function diffPieces(before: string, after: string): Piece[] {
  const a = before.match(/\S+/g) ?? [];
  const b = after.match(/\S+/g) ?? [];
  if (a.length * b.length > 40000) {
    return [
      { kind: "hunk", index: 0, removed: a.join(" "), added: b.join(" ") },
    ];
  }

  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  const at = (row: number, col: number) => table[row * width + col] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const same = a[i] === b[j];
      table[i * width + j] = same
        ? at(i + 1, j + 1) + 1
        : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const pieces: Piece[] = [];
  let held: string[] = [];
  let cut: string[] = [];
  let put: string[] = [];
  let index = 0;
  const flush = () => {
    if (held.length) pieces.push({ kind: "same", text: held.join(" ") });
    if (cut.length || put.length)
      pieces.push({
        kind: "hunk",
        index: index++,
        removed: cut.join(" "),
        added: put.join(" "),
      });
    held = [];
    cut = [];
    put = [];
  };

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      if (cut.length || put.length) flush();
      held.push(a[i] ?? "");
      i++;
      j++;
    } else {
      if (held.length) flush();
      const insert =
        j < b.length && (i === a.length || at(i, j + 1) >= at(i + 1, j));
      if (insert) put.push(b[j++] ?? "");
      else cut.push(a[i++] ?? "");
    }
  }
  flush();
  return pieces;
}

const WORD = "relative inline-block align-baseline";

/**
 * One run of changed words. Each word is its own inline-block so the strike is
 * drawn over a box exactly as wide as the word — an inline element that wraps
 * has no single box to draw over. `<wbr>` carries the break opportunity the
 * missing space would have given, so a long run still wraps naturally instead
 * of pushing past the column.
 */
function HunkRun({
  tone,
  text,
  motionSafe,
  delay,
  cooled,
}: {
  tone: "removed" | "added";
  text: string;
  motionSafe: boolean;
  delay: number;
  cooled: boolean;
}) {
  const words = text.split(" ");
  const wipe = tone === "added" && motionSafe;
  return words.map((word, position) => {
    const last = position === words.length - 1;
    const step = delay + position * cascade(words.length + 1);
    return (
      <React.Fragment key={`${position}-${word}`}>
        <motion.span
          className={cn(
            WORD,
            !last && "pr-1",
            // The wash is a temperature, not a state: it lands warm and cools
            // to nothing, so the eye is pulled once and then released.
            tone === "added" && "transition-colors duration-1000",
            tone === "added" && (cooled ? "bg-transparent" : "bg-success/20"),
          )}
          initial={wipe ? { clipPath: "inset(0% 100% 0% 0%)" } : false}
          animate={wipe ? { clipPath: "inset(0% 0% 0% 0%)" } : undefined}
          exit={{ width: 0, paddingRight: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter, delay: step }
              : { duration: 0 }
          }
        >
          {word}
          {tone === "removed" && (
            <Strike motionSafe={motionSafe} delay={step} />
          )}
        </motion.span>
        {!last && <wbr />}
      </React.Fragment>
    );
  });
}

/**
 * Percentage geometry and no viewBox: the strike ends where the word does at
 * any width, and its weight stays 1.4px instead of being scaled by a stretched
 * viewBox. `flick` because a strike is an acknowledgement, not a flourish.
 */
function Strike({ motionSafe, delay }: { motionSafe: boolean; delay: number }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full overflow-visible text-ink-3"
    >
      <motion.line
        x1="0"
        y1="56%"
        x2="100%"
        y2="56%"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        pathLength={1}
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? { ...springs.flick, delay } : { duration: 0 }}
      />
    </svg>
  );
}

/** One hunk: the ghost, the new wording, and the toggle that applies it. */
function HunkPiece({
  hunk,
  accepted,
  view,
  motionSafe,
  delay,
  onToggle,
}: {
  hunk: Hunk;
  accepted: boolean;
  view: DiffView;
  motionSafe: boolean;
  delay: number;
  onToggle: (hunk: Hunk) => void;
}) {
  const ghost = view === "change" && !accepted && hunk.removed.length > 0;

  // The wash lands warm and cools to nothing a beat after the wipe finishes,
  // so the eye is pulled to the new wording once and then let go. The timer is
  // the only trigger — a wash that waits for acceptance would never cool.
  const [cooled, setCooled] = React.useState(false);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setCooled(true), 240 + delay * 1000);
    return () => window.clearTimeout(timer);
  }, [delay]);

  return (
    <>
      <AnimatePresence initial={false}>
        {ghost && (
          <motion.del
            key="ghost"
            className="inline text-ink-3 no-underline"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={exitFor(durations.base)}
          >
            <HunkRun
              tone="removed"
              text={hunk.removed}
              motionSafe={motionSafe}
              delay={delay}
              cooled
            />
          </motion.del>
        )}
      </AnimatePresence>
      {ghost && hunk.added.length > 0 ? " " : null}
      {hunk.added.length > 0 && (
        <ins className="inline text-foreground no-underline">
          <HunkRun
            tone="added"
            text={hunk.added}
            motionSafe={motionSafe}
            delay={delay}
            cooled={cooled || accepted || view === "result"}
          />
        </ins>
      )}
      {view === "change" && (
        <>
          {" "}
          <button
            type="button"
            aria-pressed={accepted}
            onClick={() => onToggle(hunk)}
            className={cn(
              "ml-0.5 inline-flex size-5 items-center justify-center rounded-full border align-middle transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              accepted
                ? "border-success bg-success/20 text-success"
                : "border-input text-ink-3 hover:border-hairline-strong hover:text-foreground",
            )}
          >
            <span className="sr-only">
              {accepted ? "Restore" : "Accept"} change {hunk.index + 1}
            </span>
            <svg viewBox="0 0 16 16" aria-hidden className="size-3">
              <motion.path
                d="M3.4 8.4 6.4 11.4 12.6 4.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                initial={false}
                animate={{ pathLength: accepted ? 1 : 0.001 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
          </button>
        </>
      )}
    </>
  );
}

/**
 * An inline text diff you can read and apply in place. Removed words fade to a
 * ghost while a strike draws through each one with `pathLength` on `flick`;
 * added words wipe in from the left on a clip tween under a success wash that
 * cools to nothing over a second. Unchanged text never moves.
 *
 * Accepting a hunk drops its ghost on the exit ease and leaves the new wording
 * behind. The passage's height is measured rather than reserved, so it glides
 * to its new size instead of holding room for the longer of the two texts.
 *
 * Every accept is a real toggle button: Tab reaches it, Enter or Space applies
 * the change — and applies it again in reverse, because a reviewer who accepts
 * by mistake should not have to reload. Result is a switch whose knob snaps
 * across its track. Under reduced motion the spans swap: the strike is already
 * drawn, the new words are already there.
 */
export function DiffLines({
  before,
  after,
  view,
  defaultView = "change",
  onViewChange,
  onAccept,
  onAcceptedChange,
  label = "Suggested edit",
  className,
}: DiffLinesProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [ownView, setOwnView] = React.useState<DiffView>(defaultView);
  const current = view ?? ownView;
  const showResult = current === "result";

  const pieces = React.useMemo(
    () => diffPieces(before, after),
    [before, after],
  );
  const hunks = React.useMemo(
    () => pieces.filter((piece): piece is Hunk => piece.kind === "hunk"),
    [pieces],
  );

  // Keyed by the hunk's own wording rather than its position, so swapping the
  // texts starts a clean review instead of carrying decisions to new sentences.
  const [accepted, setAccepted] = React.useState<Record<string, true>>({});
  const applied = hunks.filter((hunk) => accepted[keyOf(hunk)]);
  const remaining = hunks.length - applied.length;

  const selectView = (next: DiffView) => {
    if (next === current) return;
    if (view === undefined) setOwnView(next);
    onViewChange?.(next);
  };

  const toggleHunk = (hunk: Hunk) => {
    const key = keyOf(hunk);
    const wasAccepted = Boolean(accepted[key]);
    const next: Record<string, true> = { ...accepted };
    if (wasAccepted) delete next[key];
    else next[key] = true;
    setAccepted(next);
    // Callbacks fire from the handler, never from inside a state updater.
    if (!wasAccepted) onAccept?.(hunk.index);
    onAcceptedChange?.(
      hunks.filter((entry) => next[keyOf(entry)]).map((entry) => entry.index),
    );
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  // The observer's first callback seeds the height, so nothing is measured
  // during render and no state is set synchronously in the effect body.
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            id={labelId}
            title={label}
            className="truncate text-sm font-semibold"
          >
            {label}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
            {remaining}/{hunks.length}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={showResult}
          onClick={() => selectView(showResult ? "change" : "result")}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            showResult
              ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
              : "border-hairline bg-surface-2 text-ink-2 hover:text-foreground",
          )}
        >
          {/* The dot is the knob: it slides the width of the track on snap, the
              same crisp overshoot the rest of the set uses for state changes. */}
          <span
            aria-hidden
            className="relative flex h-1.5 w-5 items-center rounded-full bg-hairline-strong"
          >
            <motion.span
              className="absolute size-1.5 rounded-full bg-current"
              initial={false}
              animate={{ x: showResult ? 14 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
          Result
        </button>
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        // Motion is handed numbers only: until the observer reports, the
        // passage keeps its natural height rather than an "auto" keyframe.
        animate={height === null ? undefined : { height }}
        transition={motionSafe ? springs.glide : { duration: durations.blink }}
      >
        {/* py-1 keeps the focus ring of an inline accept toggle clear of the
            clip that the height animation needs. */}
        <div ref={innerRef} className="py-1">
          <p className="text-sm leading-relaxed text-pretty text-foreground">
            {pieces.map((piece, position) => (
              <React.Fragment
                key={
                  piece.kind === "same"
                    ? `same-${position}`
                    : `hunk-${piece.index}`
                }
              >
                {position > 0 ? " " : null}
                {piece.kind === "same" ? (
                  piece.text
                ) : (
                  <HunkPiece
                    hunk={piece}
                    accepted={Boolean(accepted[keyOf(piece)])}
                    view={current}
                    motionSafe={motionSafe}
                    delay={piece.index * cascade(hunks.length + 1)}
                    onToggle={toggleHunk}
                  />
                )}
              </React.Fragment>
            ))}
          </p>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {current === "result"
          ? "Showing the result"
          : `${remaining} of ${hunks.length} changes left to review`}
      </span>
    </div>
  );
}
