"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Eye,
  GraduationCap,
  Lock,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type HintLadderProblem = {
  /** A short name for the exercise. */
  title: string;
  /** The problem as the learner was given it. */
  statement: string;
  /** The known quantities, shown as a small table. */
  givens?: { label: string; value: string }[];
};

export type HintRung = {
  id: string;
  /** What kind of help is on the card, readable while it is face down. */
  teaser: string;
  /** The hint itself, shown only once the card is turned over. */
  text: string;
};

/** A step value the checker knows, and what to say when a line lands on it. */
export type HintLadderCheck = {
  value: number;
  correct: boolean;
  note: string;
  /** How close a line's number must be. @default 0.0005 */
  tolerance?: number;
};

export type HintLadderMark = {
  line: string;
  kind: "right" | "wrong" | "unknown" | "text";
  note: string;
};

export type HintLadderRungStyle = "card" | "index" | "tape";
export type HintLadderStatus = "ready" | "loading" | "error";

export type HintLadderProps = {
  /** The exercise. @default defaultHintLadderProblem (a Fieldline levelling problem) */
  problem?: HintLadderProblem;
  /** The rungs, easiest help first. @default defaultHintLadderHints */
  hints?: HintRung[];
  /** The worked answer, one line per step; the last line is the answer. @default defaultHintLadderSolution */
  solution?: string[];
  /** Step values the checker recognises. @default defaultHintLadderChecks */
  checks?: HintLadderCheck[];
  /** Controlled: how many hints are turned over. */
  value?: number;
  /** Initial count when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the press, key or swipe that turned a hint over, with the new count. */
  onValueChange?: (revealed: number) => void;
  /** A hint was turned over. */
  onRevealHint?: (index: number, hint: HintRung) => void;
  /** Check my work was pressed, with the lines and how each was marked. */
  onAttempt?: (lines: string[], marks: HintLadderMark[]) => void;
  /** The worked answer was revealed. */
  onRevealAnswer?: () => void;
  /** The learner's working when the surface mounts. */
  defaultAttempt?: string;
  /** Raised cards that flip, ruled index cards, or slim rows sealed with tape that peels. @default "card" */
  rungStyle?: HintLadderRungStyle;
  /** How long the answer bar must be held, in ms. @default 900 */
  revealHold?: number;
  /** The rail, turned cards and the hold fill — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Who is tutoring. @default "Fieldline Tutor" */
  tutor?: string;
  /** The surface's heading. @default "Levelling · exercise 4" */
  title?: string;
  /** Whether the exercise has arrived. @default "ready" */
  status?: HintLadderStatus;
  /** "Try again" was pressed after the exercise failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px; the thread scrolls inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be turned, held or checked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultHintLadderProblem: HintLadderProblem = {
  title: "Reduce the level of peg C",
  statement:
    "From one set-up of the level, a backsight on benchmark BM reads 1.385 m and a foresight on peg C reads 2.910 m. BM stands at a reduced level of 41.250 m. What is the reduced level of C?",
  givens: [
    { label: "RL of BM", value: "41.250 m" },
    { label: "Backsight", value: "1.385 m" },
    { label: "Foresight", value: "2.910 m" },
  ],
};

export const defaultHintLadderHints: HintRung[] = [
  {
    id: "start",
    teaser: "Where to start",
    text: "Start from the one height you know for certain: the benchmark's reduced level, 41.250 m.",
  },
  {
    id: "method",
    teaser: "The method",
    text: "The line of sight sits above the benchmark by the backsight. That height is the height of collimation (HPC), and every foresight is taken down from it.",
  },
  {
    id: "nearly",
    teaser: "Nearly there",
    text: "HPC = 41.250 + 1.385 = 42.635 m. Now take the foresight on C away from it.",
  },
];

export const defaultHintLadderSolution: string[] = [
  "HPC = RL(BM) + BS = 41.250 + 1.385 = 42.635 m",
  "RL(C) = HPC − FS = 42.635 − 2.910 = 39.725 m",
  "Check: BS − FS = 1.385 − 2.910 = −1.525 m, and 39.725 − 41.250 = −1.525 m",
  "RL of C = 39.725 m",
];

export const defaultHintLadderChecks: HintLadderCheck[] = [
  { value: 42.635, correct: true, note: "That's the height of collimation." },
  { value: 39.725, correct: true, note: "That's the reduced level of C." },
  { value: -1.525, correct: true, note: "That's the fall from BM to C." },
  {
    value: 45.545,
    correct: false,
    note: "This adds the foresight. A foresight is taken away from the HPC.",
  },
  {
    value: 39.865,
    correct: false,
    note: "This subtracts the backsight. The backsight is added to the benchmark.",
  },
  {
    value: 36.955,
    correct: false,
    note: "Both signs are flipped: add the backsight, then take the foresight away.",
  },
  {
    value: 1.525,
    correct: false,
    note: "Right size, wrong sign: C is below BM, so the change is −1.525 m.",
  },
];

const DEFAULT_ATTEMPT =
  "HPC = 41.250 + 1.385 = 42.635\nRL C = 42.635 + 2.910 = 45.545";

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** The last number on a line, unicode minus included. */
const lastNumber = (line: string): number | null => {
  const found = line.replace(/−/g, "-").match(/-?\d+(?:\.\d+)?/g);
  const last = found?.[found.length - 1];
  return last === undefined ? null : Number(last);
};

export function markLines(
  text: string,
  checks: HintLadderCheck[],
): HintLadderMark[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const n = lastNumber(line);
      if (n === null) return { line, kind: "text", note: "" };
      const hit = checks.find(
        (c) => Math.abs(c.value - n) <= (c.tolerance ?? 0.0005),
      );
      if (!hit)
        return {
          line,
          kind: "unknown",
          note: "I can't match this line to a step. Show the numbers you used.",
        };
      return { line, kind: hit.correct ? "right" : "wrong", note: hit.note };
    });
}

/** A box whose height follows its content on glide, measured. */
function Measured({
  glide,
  children,
  className,
}: {
  glide: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [h, setH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setH(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && h !== null ? h : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 6 }}
      className={className}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/** A tick or a cross that draws itself on flick. */
function Mark({
  kind,
  delay,
  motionSafe,
}: {
  kind: HintLadderMark["kind"];
  delay: number;
  motionSafe: boolean;
}) {
  if (kind === "text") return <span aria-hidden className="size-4 shrink-0" />;
  const tone =
    kind === "right"
      ? "text-success"
      : kind === "wrong"
        ? "text-danger"
        : "text-ink-3";
  const paths =
    kind === "right"
      ? ["M3.5 8.5 L6.5 11.5 L12.5 4.5"]
      : kind === "wrong"
        ? ["M4.5 4.5 L11.5 11.5", "M11.5 4.5 L4.5 11.5"]
        : [];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center",
        tone,
      )}
    >
      {kind === "unknown" ? (
        <motion.span
          className="font-mono text-[12px] leading-none font-semibold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base, delay }}
        >
          ?
        </motion.span>
      ) : (
        <svg viewBox="0 0 16 16" className="size-4" fill="none">
          {paths.map((d, i) => (
            <motion.path
              key={d}
              d={d}
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: motionSafe ? 0 : 1, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{
                pathLength: motionSafe
                  ? { ...springs.flick, delay: delay + i * 0.06 }
                  : { duration: 0 },
                opacity: { duration: durations.blink, delay: delay + i * 0.06 },
              }}
            />
          ))}
        </svg>
      )}
    </span>
  );
}

type Look = {
  style: HintLadderRungStyle;
  motionSafe: boolean;
};

/** A rung's back: its number, its teaser and the seal; nothing of the hint. */
function Back({
  hint,
  index,
  look,
  state,
  action,
}: {
  hint: HintRung;
  index: number;
  look: Look;
  state: "next" | "locked";
  action?: React.ReactNode;
}) {
  const locked = state === "locked";
  if (look.style === "tape") {
    return (
      <div className="flex h-10 items-center gap-2 px-2.5">
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
          {hint.teaser}
        </span>
        {action ??
          (locked ? (
            <Lock aria-hidden className="size-3.5 text-ink-3" />
          ) : null)}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        look.style === "index" && "pl-4",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-mono text-[11px] font-semibold tabular-nums",
          look.style === "index"
            ? "h-6 rounded-1 border border-hairline-strong bg-card px-1.5 text-ink-2"
            : cn(
                "size-6 rounded-full",
                locked
                  ? "bg-surface-2 text-ink-3"
                  : "bg-(--hl-wash) text-(--hl-accent)",
              ),
        )}
      >
        {look.style === "index" ? `№ ${index + 1}` : index + 1}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Hint {index + 1}
        </span>
        <span
          className={cn(
            "truncate text-[13px]",
            locked ? "text-ink-3" : "font-medium text-foreground",
          )}
        >
          {hint.teaser}
        </span>
      </span>
      {action ??
        (locked ? (
          <Lock aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        ) : null)}
    </div>
  );
}

function Front({
  hint,
  index,
  look,
}: {
  hint: HintRung;
  index: number;
  look: Look;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 px-3 py-2.5",
        look.style === "index" && "pl-4",
        look.style === "tape" && "px-2.5 py-2",
      )}
    >
      <span className="font-mono text-[10px] tracking-[0.08em] text-(--hl-accent) uppercase">
        Hint {index + 1} · {hint.teaser}
      </span>
      <span className="text-[13px] leading-5 text-foreground">{hint.text}</span>
    </div>
  );
}

const faceBox = (style: HintLadderRungStyle, up: boolean) =>
  cn(
    "overflow-hidden",
    style === "card" &&
      cn(
        "rounded-3 border shadow-[0_1px_0_color-mix(in_oklab,black_6%,transparent)]",
        up
          ? "border-(--hl-line) bg-card"
          : "border-hairline-strong bg-surface-1",
      ),
    style === "index" &&
      cn(
        "rounded-2 border border-l-2 border-hairline-strong bg-card",
        up ? "border-l-(--hl-accent)" : "border-l-(--hl-line)",
      ),
    style === "tape" &&
      cn("rounded-2 border", up ? "border-(--hl-line)" : "border-hairline"),
  );

/** The paper itself: a hatch for a face-down card, rules for an index card. */
const faceStyle = (
  style: HintLadderRungStyle,
  up: boolean,
): React.CSSProperties | undefined =>
  style === "card" && !up
    ? {
        backgroundImage:
          "repeating-linear-gradient(135deg, var(--hl-hatch) 0 1px, transparent 1px 7px)",
      }
    : style === "index"
      ? {
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 19px, var(--hl-rule) 19px 20px)",
          backgroundPosition: "0 9px",
        }
      : undefined;

/* ----------------------------------------------------------------------- */
/*                                 The rung                                 */
/* ----------------------------------------------------------------------- */

/**
 * One rung, turning over. Card and index styles rotate 180° about the
 * horizontal axis on snap — perspective on the parent, backface hidden — so
 * the hint is on the far side of the same card. Tape peels its seal off to
 * the right on snap. The hint's words only enter the page as it turns.
 */
function Rung({
  hint,
  index,
  look,
  up,
  state,
  action,
}: {
  hint: HintRung;
  index: number;
  look: Look;
  up: boolean;
  state: "next" | "locked";
  action?: React.ReactNode;
}) {
  const { style, motionSafe } = look;
  if (style === "tape") {
    return (
      <div className={cn("relative grid", faceBox(style, up))}>
        <div className="[grid-area:1/1]">
          {up ? (
            <Front hint={hint} index={index} look={look} />
          ) : (
            <div className="h-10" />
          )}
        </div>
        <AnimatePresence initial={false}>
          {up ? null : (
            <motion.div
              key="tape"
              className={cn(
                "absolute inset-0 [grid-area:1/1]",
                state === "locked" ? "bg-surface-2" : "bg-(--hl-tape)",
              )}
              style={{ originX: 1 }}
              exit={
                motionSafe
                  ? {
                      scaleX: 0,
                      rotate: 2,
                      transition: springs.snap,
                    }
                  : { opacity: 0, transition: exitFor(durations.fast) }
              }
            >
              <Back
                hint={hint}
                index={index}
                look={look}
                state={state}
                action={action}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div className="[perspective:900px]">
      <motion.div
        className="grid"
        style={{ transformStyle: "preserve-3d" }}
        initial={false}
        animate={{ rotateX: up && motionSafe ? 180 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        <motion.div
          aria-hidden={up || undefined}
          inert={up || undefined}
          className={cn("[grid-area:1/1]", faceBox(style, false))}
          style={{ backfaceVisibility: "hidden", ...faceStyle(style, false) }}
          initial={false}
          animate={{ opacity: !motionSafe && up ? 0 : 1 }}
          transition={{ duration: durations.base }}
        >
          <Back
            hint={hint}
            index={index}
            look={look}
            state={state}
            action={up ? undefined : action}
          />
        </motion.div>
        {up ? (
          <motion.div
            className={cn("[grid-area:1/1]", faceBox(style, true))}
            style={{
              backfaceVisibility: "hidden",
              transform: motionSafe ? "rotateX(180deg)" : undefined,
              ...faceStyle(style, true),
            }}
            initial={motionSafe ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base }}
          >
            <Front hint={hint} index={index} look={look} />
          </motion.div>
        ) : null}
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Deck (narrow)                              */
/* ----------------------------------------------------------------------- */

/**
 * One card in the narrow deck. It owns its drag offset, so a card thrown off
 * the top keeps going from where the finger left it while the next one rises.
 */
function DeckCard({
  hint,
  index,
  depth,
  up,
  top,
  look,
  canForward,
  canBack,
  label,
  onForward,
  onBack,
  disabled,
}: {
  hint: HintRung;
  index: number;
  depth: number;
  up: boolean;
  top: boolean;
  look: Look;
  canForward: boolean;
  canBack: boolean;
  label: string;
  onForward: () => void;
  onBack: () => void;
  disabled: boolean;
}) {
  const { motionSafe } = look;
  const dragY = useMotionValue(0);
  const settleRef = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => settleRef.current?.stop(), []);

  const settle = (velocity = 0) => {
    settleRef.current?.stop();
    settleRef.current = animate(dragY, 0, { ...springs.snap, velocity });
  };

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || !top,
    onStart: () => settleRef.current?.stop(),
    onMove: ({ offset }) => {
      const y = offset.y;
      // Up follows the finger; down only gives when there is a card to go
      // back to, and rubber-bands either way past what it can do.
      const down = canBack ? y : rubberband(y, 160);
      dragY.set(
        Math.round(
          y < 0
            ? canForward
              ? Math.max(y, -120 + rubberband(y + 120, 160))
              : rubberband(y, 160)
            : down,
        ),
      );
    },
    onEnd: ({ offset, velocity }) => {
      const landing = project(offset.y, velocity.y, 0.99);
      if (landing < -48 && canForward) {
        onForward();
        // A face-down card that turns over stays on top: it comes home.
        if (!up) settle(velocity.y);
      } else if (landing > 48 && canBack) {
        onBack();
        settle(velocity.y);
      } else settle(velocity.y);
    },
    onCancel: () => settle(),
  });

  return (
    <motion.div
      className="self-end [grid-area:1/1]"
      // Bottom-anchored: the cards under the top one peek out below it.
      style={{ zIndex: 10 - depth, originY: 1 }}
      initial={
        motionSafe ? { opacity: 0, y: -distances.shift } : { opacity: 0 }
      }
      animate={{
        opacity: depth > 2 ? 0 : 1,
        y: motionSafe ? depth * 7 : 0,
        scale: motionSafe ? 1 - depth * 0.04 : 1,
      }}
      exit={{
        opacity: 0,
        y: motionSafe ? -48 : 0,
        transition: exitFor(durations.base),
      }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
    >
      <motion.div style={{ y: dragY }}>
        <div
          role={top ? "button" : undefined}
          tabIndex={top && !disabled ? 0 : -1}
          aria-label={top ? label : undefined}
          aria-hidden={top ? undefined : true}
          aria-disabled={(top && disabled) || undefined}
          data-hl-deck={top ? "top" : undefined}
          data-hl-deck-key={hint.id}
          {...(top ? drag : {})}
          onKeyDown={(e) => {
            if (!top || disabled) return;
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowUp") {
              e.preventDefault();
              if (canForward) onForward();
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              if (canBack) onBack();
            }
          }}
          className={cn(
            "rounded-3 select-none",
            top &&
              !disabled &&
              "cursor-grab touch-pan-x active:cursor-grabbing",
            FOCUS,
          )}
        >
          <Rung
            hint={hint}
            index={index}
            look={look}
            up={up}
            state={up || top ? "next" : "locked"}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Attempt = { id: string; marks: HintLadderMark[] };

/**
 * A tutoring thread that answers a problem with a ladder of hints instead of
 * the solution. The rungs are dealt face down — number and teaser only — and
 * a rung turns over only when the learner asks: a 180° flip on `snap`, the
 * hint on the far side of the card, while the ladder's rail fills on `glide`
 * with how much help was used. The worked answer waits behind a bar that must
 * be held: it fills linearly while pressed (or while Space is held on it) and
 * drains back on `snap` if let go early.
 *
 * The learner's working is the composer: Check marks it line by line against
 * the known step values — a tick or a cross drawing itself on `flick`, one
 * line after another, with the note that goes with it. H turns the next hint
 * from anywhere outside a text field. Under 23rem the rungs become one deck
 * you swipe up (or press Enter on). Under reduced motion cards cross-fade
 * instead of turning, the bar drains at once and marks appear without
 * drawing; the rail still fills.
 */
export function HintLadder({
  problem = defaultHintLadderProblem,
  hints = defaultHintLadderHints,
  solution = defaultHintLadderSolution,
  checks = defaultHintLadderChecks,
  value,
  defaultValue = 0,
  onValueChange,
  onRevealHint,
  onAttempt,
  onRevealAnswer,
  defaultAttempt = DEFAULT_ATTEMPT,
  rungStyle = "card",
  revealHold = 900,
  accent = "var(--accent-bright)",
  tutor = "Fieldline Tutor",
  title = "Levelling · exercise 4",
  status = "ready",
  onRetry,
  height = 520,
  disabled = false,
  className,
}: HintLadderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const holdHintId = `${uid}-hold`;
  const workId = `${uid}-work`;
  const look: Look = { style: rungStyle, motionSafe };

  const total = hints.length;
  const [own, setOwn] = React.useState(() =>
    Math.max(0, Math.min(total, defaultValue)),
  );
  const revealed = Math.max(0, Math.min(total, value ?? own));
  const [answerShown, setAnswerShown] = React.useState(false);
  const [attempt, setAttempt] = React.useState(defaultAttempt);
  const [attempts, setAttempts] = React.useState<Attempt[]>([]);
  const [deckView, setDeckView] = React.useState<number | null>(null);
  const [holding, setHolding] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const hold = useMotionValue(0);
  const holdAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const keyHeld = React.useRef(false);
  const attemptCount = React.useRef(0);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);

  const ready = status === "ready";
  const live = ready && !disabled;
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );
  const timers = React.useRef<number[]>([]);
  const focusReq = React.useRef<string | null>(null);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      holdAnim.current?.stop();
      scrollAnim.current?.stop();
      for (const t of list) window.clearTimeout(t);
    };
  }, []);

  // A Turn over button leaves the page as its card turns: focus moves on to
  // the next rung's button (or the hold bar) once that render has landed.
  React.useEffect(() => {
    const want = focusReq.current;
    if (!want) return;
    const root = scrollerRef.current;
    if (want.startsWith("deck:")) {
      focusReq.current = null;
      root
        ?.querySelector<HTMLElement>(
          `[data-hl-deck="top"][data-hl-deck-key="${CSS.escape(want.slice(5))}"]`,
        )
        ?.focus({ preventScroll: true });
      return;
    }
    const node =
      [
        ...(root?.querySelectorAll<HTMLElement>(`[data-hl-focus="${want}"]`) ??
          []),
      ].find((n) => n.offsetWidth > 0) ??
      [
        ...(root?.querySelectorAll<HTMLElement>('[data-hl-focus="hold"]') ??
          []),
      ].find((n) => n.offsetWidth > 0);
    focusReq.current = null;
    node?.focus({ preventScroll: true });
  });

  // A thread opens at its newest message: the ladder, not the problem.
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [status]);

  /** Scrolls the thread, and only the thread, to its floor. */
  const toFloor = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    scrollAnim.current?.stop();
    const target = Math.max(0, el.scrollHeight - el.clientHeight);
    if (!motionSafe) {
      el.scrollTop = target;
      return;
    }
    scrollAnim.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = Math.round(v);
      },
    });
  }, [motionSafe]);

  /* ------------------------------- actions ------------------------------- */

  const setRevealed = (n: number) => {
    if (value === undefined) setOwn(n);
    onValueChange?.(n);
  };

  const revealNext = () => {
    if (!live || revealed >= total) return;
    const hint = hints[revealed];
    if (!hint) return;
    // The Turn over button in focus is about to leave with its card's back.
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest('[data-hl-focus="turn"]')
    )
      focusReq.current = "turn";
    setRevealed(revealed + 1);
    setDeckView(null);
    say(`Hint ${revealed + 1}, ${hint.teaser}: ${hint.text}`);
    onRevealHint?.(revealed, hint);
  };

  const revealAnswer = React.useCallback(() => {
    holdAnim.current?.stop();
    holdAnim.current = null;
    setHolding(false);
    setAnswerShown(true);
    say(`Worked answer: ${solution.join(". ")}`);
    onRevealAnswer?.();
    // The answer unfolds below the fold: bring it up once it has height.
    timers.current.push(window.setTimeout(toFloor, 60));
  }, [onRevealAnswer, solution, toFloor, say]);

  const startHold = () => {
    if (!live || answerShown || holdAnim.current) return;
    setHolding(true);
    const left = Math.max(0, 1 - hold.get());
    // The fill is the timer itself: linear, so its length is the time left.
    holdAnim.current = animate(hold, 1, {
      duration: (Math.max(100, revealHold) / 1000) * left,
      ease: easings.linear,
      onComplete: () => {
        holdAnim.current = null;
        revealAnswer();
      },
    });
  };

  const endHold = () => {
    if (!holdAnim.current) return;
    holdAnim.current.stop();
    holdAnim.current = null;
    setHolding(false);
    if (motionSafe) {
      holdAnim.current = null;
      animate(hold, 0, springs.snap);
    } else hold.jump(0);
  };

  const check = () => {
    if (!live) return;
    const marks = markLines(attempt, checks);
    if (marks.length === 0) return;
    attemptCount.current += 1;
    setAttempts((a) => [
      ...a,
      { id: `${uid}-a${attemptCount.current}`, marks },
    ]);
    const right = marks.filter((m) => m.kind === "right").length;
    const counted = marks.filter((m) => m.kind !== "text").length;
    say(
      `Checked. ${right} of ${counted} ${counted === 1 ? "line" : "lines"} right.`,
    );
    onAttempt?.(
      marks.map((m) => m.line),
      marks,
    );
    timers.current.push(window.setTimeout(toFloor, 60));
  };

  const onRootKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("textarea, input")) return;
    if (
      (e.key === "h" || e.key === "H") &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      revealNext();
    }
  };

  /* ------------------------------- render -------------------------------- */

  const fill = answerShown ? 1 : total === 0 ? 0 : revealed / (total + 1);
  const helpText = answerShown
    ? `All ${total} hints and the worked answer`
    : `${revealed} of ${total} ${total === 1 ? "hint" : "hints"}, answer held back`;

  const turnButton = (
    <button
      type="button"
      aria-disabled={!live || undefined}
      aria-label={`Turn over hint ${revealed + 1}: ${hints[revealed]?.teaser ?? ""}`}
      aria-keyshortcuts="h"
      data-hl-focus="turn"
      onClick={() => {
        focusReq.current = "turn";
        revealNext();
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-(--hl-line) bg-card px-2.5 text-[12px] font-medium text-(--hl-accent) transition-colors hover:bg-(--hl-wash)",
        FOCUS,
      )}
    >
      Turn over
      <kbd className="hidden rounded-1 border border-hairline px-1 font-mono text-[10px] text-ink-3 @min-[30rem]/hint-ladder:inline">
        H
      </kbd>
    </button>
  );

  const rail = (orientation: "vertical" | "horizontal") => (
    <div
      role="meter"
      aria-label="Help used"
      aria-valuemin={0}
      aria-valuemax={total + 1}
      aria-valuenow={answerShown ? total + 1 : revealed}
      aria-valuetext={helpText}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-surface-2",
        orientation === "vertical" ? "w-1.5 self-stretch" : "h-1.5 w-full",
      )}
    >
      <motion.span
        aria-hidden
        className={cn(
          "absolute inset-0 rounded-full transition-colors",
          answerShown ? "bg-(--hl-solid)" : "bg-(--hl-accent)",
        )}
        style={orientation === "vertical" ? { originY: 0 } : { originX: 0 }}
        initial={false}
        animate={
          orientation === "vertical"
            ? { scaleY: Number(fill.toFixed(4)) }
            : { scaleX: Number(fill.toFixed(4)) }
        }
        transition={motionSafe ? springs.glide : { duration: durations.fast }}
      />
    </div>
  );

  const list = (
    <div className="hidden gap-3 @min-[23rem]/hint-ladder:flex">
      {rail("vertical")}
      <ol className="flex min-w-0 flex-1 flex-col gap-2">
        {hints.map((hint, i) => {
          const up = i < revealed;
          const next = i === revealed;
          return (
            <motion.li
              key={hint.id}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step, rotate: -1.5 }
                  : { opacity: 0 }
              }
              animate={{ opacity: next || up ? 1 : 0.7, y: 0, rotate: 0 }}
              transition={
                motionSafe
                  ? {
                      y: { ...springs.snap, delay: i * cascade(total) },
                      rotate: { ...springs.snap, delay: i * cascade(total) },
                      opacity: {
                        duration: durations.base,
                        delay: i * cascade(total),
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              <Measured glide={motionSafe}>
                <Rung
                  hint={hint}
                  index={i}
                  look={look}
                  up={up}
                  state={next ? "next" : "locked"}
                  action={next && live ? turnButton : undefined}
                />
              </Measured>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );

  const deckHasFocus = () =>
    document.activeElement instanceof HTMLElement &&
    !!document.activeElement.closest("[data-hl-deck]");

  // The narrow deck: the card being read on top, the face-down ones under it.
  const view = deckView ?? Math.max(0, revealed - 1);
  const deckTop = revealed === 0 ? 0 : view;
  const deckCards = hints
    .map((hint, i) => ({ hint, i }))
    .filter(({ i }) => i === deckTop || (i >= revealed && i > deckTop))
    .slice(0, 3);
  const deck = (
    <div className="flex flex-col gap-2.5 @min-[23rem]/hint-ladder:hidden">
      {rail("horizontal")}
      <div className="grid pb-4">
        <AnimatePresence initial={false}>
          {deckCards.map(({ hint, i }, depth) => {
            const up = i < revealed;
            const forward = i < revealed - 1 || revealed < total;
            return (
              <DeckCard
                key={hint.id}
                hint={hint}
                index={i}
                depth={depth}
                up={up}
                top={depth === 0}
                look={look}
                disabled={!live}
                canForward={forward}
                canBack={up && i > 0}
                label={
                  up
                    ? `Hint ${i + 1} of ${total}, ${hint.teaser}: ${hint.text}. ${revealed < total || i < revealed - 1 ? "Swipe up or press Enter for the next." : "That is the last hint."}`
                    : `Hint ${i + 1}, ${hint.teaser}, face down. Swipe up or press Enter to turn it over.`
                }
                onForward={() => {
                  const keep = deckHasFocus();
                  if (i < revealed - 1) setDeckView(i + 1);
                  else revealNext();
                  // Focus rides along to the card that comes up on top.
                  const next = hints[revealed === 0 ? 0 : i + 1];
                  if (keep && next) focusReq.current = `deck:${next.id}`;
                }}
                onBack={() => {
                  const keep = deckHasFocus();
                  setDeckView(Math.max(0, i - 1));
                  const prev = hints[Math.max(0, i - 1)];
                  if (keep && prev) focusReq.current = `deck:${prev.id}`;
                }}
              />
            );
          })}
        </AnimatePresence>
      </div>
      {revealed > 0 ? (
        <div
          role="group"
          aria-label="Turned hints"
          className="flex items-center justify-center gap-1.5"
        >
          {hints.slice(0, revealed).map((h, i) => (
            <button
              key={h.id}
              type="button"
              aria-label={`Show hint ${i + 1}`}
              aria-pressed={i === deckTop}
              onClick={() => setDeckView(i)}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-full",
                FOCUS,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === deckTop ? "w-4 bg-(--hl-accent)" : "w-1.5 bg-ink-3/50",
                )}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  const holdBar = (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-label={holding ? "Keep holding" : "Hold to see the worked answer"}
        aria-describedby={holdHintId}
        aria-disabled={!live || undefined}
        data-hl-focus="hold"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          startHold();
        }}
        onPointerUp={endHold}
        onPointerLeave={(e) => {
          // Only a pointer that really left the bar lets go of it.
          const r = e.currentTarget.getBoundingClientRect();
          const inside =
            e.clientX >= r.left &&
            e.clientX <= r.right &&
            e.clientY >= r.top &&
            e.clientY <= r.bottom;
          if (!inside) endHold();
        }}
        onPointerCancel={endHold}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            // The press is the hold: the button's own click must not fire.
            e.preventDefault();
            if (e.repeat) return;
            keyHeld.current = true;
            startHold();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            keyHeld.current = false;
            endHold();
          }
        }}
        onBlur={() => {
          keyHeld.current = false;
          endHold();
        }}
        onClick={(e) => {
          // Assistive technology activates without a pointer or a held key:
          // that is a deliberate request, so it reveals at once.
          if (e.detail === 0 && !keyHeld.current && !holdAnim.current && live)
            revealAnswer();
        }}
        className={cn(
          "relative flex h-11 w-full touch-none items-center gap-2 overflow-hidden rounded-3 border border-dashed border-hairline-strong bg-surface-1 px-3 text-left select-none",
          live ? "cursor-pointer" : "cursor-not-allowed opacity-60",
          FOCUS,
        )}
      >
        <motion.span
          aria-hidden
          className="absolute inset-0 bg-(--hl-wash)"
          style={{ scaleX: hold, originX: 0 }}
        />
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 w-0.5 bg-(--hl-accent)"
          style={{ opacity: hold }}
        />
        <Eye aria-hidden className="relative size-4 shrink-0 text-ink-2" />
        <span className="relative min-w-0 flex-1 truncate text-[13px] text-foreground">
          {/* The same two nodes in every state: swapping nodes under a
              pressed pointer makes the browser report a leave. */}
          <span className="@min-[26rem]/hint-ladder:hidden">
            {holding ? "Keep holding…" : "Hold for the answer"}
          </span>
          <span className="hidden @min-[26rem]/hint-ladder:inline">
            {holding ? "Keep holding…" : "Hold to see the worked answer"}
          </span>
        </span>
        <span className="relative shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
          {(revealHold / 1000).toFixed(1)} s
        </span>
      </button>
      <p id={holdHintId} className="text-[11px] leading-4 text-ink-3">
        Press and hold, or hold Space on the bar. Try the next rung first.
      </p>
    </div>
  );

  const solutionPanel = (
    <motion.div
      key="solution"
      className="flex flex-col gap-1.5 rounded-3 border border-(--hl-line) bg-surface-1 p-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.base }}
    >
      <span className="font-mono text-[10px] tracking-[0.08em] text-(--hl-accent) uppercase">
        Worked answer
      </span>
      <ol className="flex flex-col gap-1">
        {solution.map((line, i) => {
          const last = i === solution.length - 1;
          return (
            <motion.li
              key={i}
              className={cn(
                "font-mono text-[12px] leading-5 break-words",
                last
                  ? "mt-1 rounded-2 border-l-2 border-(--hl-accent) bg-(--hl-wash) px-2 py-1 font-semibold text-foreground"
                  : "text-ink-2",
              )}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                y: motionSafe
                  ? {
                      ...springs.snap,
                      delay: 0.1 + i * cascade(solution.length),
                    }
                  : { duration: 0 },
                opacity: {
                  duration: durations.base,
                  delay: 0.1 + i * cascade(solution.length),
                },
              }}
            >
              {line}
            </motion.li>
          );
        })}
      </ol>
    </motion.div>
  );

  const tutorMark = (
    <span
      aria-hidden
      className="mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-(--hl-wash) text-(--hl-accent)"
    >
      <GraduationCap className="size-3.5" />
    </span>
  );

  const thread =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        <p className="sr-only">Loading the exercise.</p>
        <span
          aria-hidden
          className="h-24 w-4/5 self-end rounded-3 bg-surface-2"
        />
        {[0, 1, 2].map((i) => (
          <span key={i} aria-hidden className="h-12 rounded-3 bg-surface-2" />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The exercise did not load.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <ol
        role="list"
        aria-label="Tutoring thread"
        className="flex flex-col gap-4 px-3 pt-4 pb-6 @min-[30rem]/hint-ladder:px-4"
      >
        <li className="flex flex-col items-end gap-1.5">
          <span className="sr-only">You: </span>
          <p className="rounded-3 rounded-br-1 bg-(--hl-wash) px-3 py-1.5 text-[13px] text-foreground">
            Stuck on this one. Can you help without giving it away?
          </p>
          <div className="w-full max-w-[34rem] rounded-3 border border-hairline bg-surface-1 p-3">
            <p className="text-[13px] font-semibold text-foreground">
              {problem.title}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-ink-2">
              {problem.statement}
            </p>
            {problem.givens?.length ? (
              <dl className="mt-2 flex flex-wrap gap-1.5">
                {problem.givens.map((g) => (
                  <div
                    key={g.label}
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-card px-2 text-[11px]"
                  >
                    <dt className="text-ink-3">{g.label}</dt>
                    <dd className="font-mono text-foreground tabular-nums">
                      {g.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </li>

        <li className="flex flex-col gap-2.5">
          <span className="sr-only">{tutor}: </span>
          <div className="flex items-start gap-2">
            {tutorMark}
            <p className="text-[13px] leading-5 text-foreground">
              Let&rsquo;s climb it one rung at a time. Turn a hint over only
              when you&rsquo;re stuck; the worked answer stays put until you
              hold for it.
            </p>
          </div>
          <div className="flex flex-col gap-3 @min-[30rem]/hint-ladder:pl-8">
            <div className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              <span>Help used</span>
              <span className="tabular-nums">
                {answerShown
                  ? "Answer shown"
                  : `${revealed} of ${total} ${total === 1 ? "hint" : "hints"}`}
              </span>
            </div>
            {list}
            {deck}
            <Measured glide={motionSafe}>
              <AnimatePresence initial={false} mode="popLayout">
                {answerShown ? (
                  solutionPanel
                ) : (
                  <motion.div
                    key="hold"
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  >
                    {holdBar}
                  </motion.div>
                )}
              </AnimatePresence>
            </Measured>
          </div>
        </li>

        {attempts.map((a) => {
          const counted = a.marks.filter((m) => m.kind !== "text");
          const right = counted.filter((m) => m.kind === "right").length;
          const wrong = a.marks.find((m) => m.kind === "wrong");
          const finalValue = lastNumber(solution[solution.length - 1] ?? "");
          const solved =
            finalValue !== null &&
            a.marks.some(
              (m) =>
                m.kind === "right" &&
                Math.abs((lastNumber(m.line) ?? NaN) - finalValue) < 0.0005,
            );
          const step = cascade(a.marks.length) + 0.12;
          const summary =
            counted.length === 0
              ? "I can't see any numbers to check. Write each step with its value."
              : right === counted.length
                ? solved
                  ? `${right} of ${counted.length} right. That's the answer, and you got there yourself.`
                  : `${right} of ${counted.length} right so far. Keep going.`
                : wrong
                  ? `${right} of ${counted.length} right. ${wrong.note}`
                  : `${right} of ${counted.length} right. One line doesn't match a step yet.`;
          return (
            <React.Fragment key={a.id}>
              <li className="flex flex-col items-end gap-1">
                <span className="sr-only">You, your working: </span>
                <div className="w-full max-w-[30rem] rounded-3 rounded-br-1 border border-hairline bg-(--hl-wash) px-3 py-2">
                  <ol className="flex flex-col gap-1.5">
                    {a.marks.map((m, i) => (
                      <li key={i} className="flex flex-col gap-0.5">
                        <span className="flex items-start gap-2">
                          <span className="min-w-0 flex-1 font-mono text-[12px] leading-5 break-words text-foreground">
                            {m.line}
                          </span>
                          <Mark
                            kind={m.kind}
                            delay={0.15 + i * step}
                            motionSafe={motionSafe}
                          />
                          <span className="sr-only">
                            {m.kind === "right"
                              ? `Line ${i + 1}: right. ${m.note}`
                              : m.kind === "wrong"
                                ? `Line ${i + 1}: not right. ${m.note}`
                                : m.kind === "unknown"
                                  ? `Line ${i + 1}: ${m.note}`
                                  : ""}
                          </span>
                        </span>
                        {m.note && m.kind !== "right" ? (
                          <motion.span
                            aria-hidden
                            className={cn(
                              "text-[11px] leading-4",
                              m.kind === "wrong" ? "text-danger" : "text-ink-3",
                            )}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{
                              duration: durations.base,
                              delay: 0.2 + i * step,
                            }}
                          >
                            {m.note}
                          </motion.span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              </li>
              <motion.li
                className="flex items-start gap-2"
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  y: motionSafe
                    ? { ...springs.snap, delay: 0.25 + a.marks.length * step }
                    : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    delay: 0.25 + a.marks.length * step,
                  },
                }}
              >
                <span className="sr-only">{tutor}: </span>
                {tutorMark}
                <p className="text-[13px] leading-5 text-foreground">
                  {summary}
                </p>
              </motion.li>
            </React.Fragment>
          );
        })}
      </ol>
    );

  return (
    <div
      role="region"
      aria-label={title}
      onKeyDown={onRootKey}
      className={cn(
        "@container/hint-ladder relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          height,
          "--hl-accent": accent,
          "--hl-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
          "--hl-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
          "--hl-hatch": `color-mix(in oklab, ${accent} 16%, transparent)`,
          "--hl-rule": `color-mix(in oklab, ${accent} 10%, transparent)`,
          "--hl-tape": `color-mix(in oklab, ${accent} 22%, var(--card))`,
          "--hl-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex items-center gap-3 border-b border-hairline px-3 py-2.5 @min-[30rem]/hint-ladder:px-4">
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--hl-wash) text-(--hl-accent)"
        >
          <GraduationCap className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-ink-3">
            {tutor} · hints before answers
          </p>
        </div>
        <span className="hidden h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.06em] text-ink-2 uppercase tabular-nums @min-[24rem]/hint-ladder:inline-flex">
          {answerShown ? "Answer shown" : `${revealed}/${total} hints`}
        </span>
      </header>

      <div
        ref={scrollerRef}
        className="[scrollbar-width:thin] overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_14px)]"
      >
        {thread}
      </div>

      <form
        className="flex flex-col gap-2 border-t border-hairline p-3"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <label
          htmlFor={workId}
          className="flex items-center justify-between gap-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
        >
          <span>Your working</span>
          <span className="hidden normal-case @min-[26rem]/hint-ladder:inline">
            one step per line · ⌘/Ctrl+Enter checks
          </span>
        </label>
        <div className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 rounded-3 border border-hairline-strong bg-surface-1">
            <textarea
              id={workId}
              rows={2}
              value={attempt}
              readOnly={!live}
              aria-disabled={!live || undefined}
              spellCheck={false}
              placeholder="HPC = …"
              onChange={(e) => {
                const text = e.currentTarget.value;
                setAttempt(text);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  check();
                }
              }}
              className={cn(
                "max-h-16 resize-none overflow-y-auto rounded-3 bg-transparent px-3 py-1.5 font-mono text-[12px] leading-5 text-foreground [grid-area:1/1] placeholder:text-ink-3 @min-[30rem]/hint-ladder:max-h-24",
                FOCUS_IN,
              )}
            />
            <span
              aria-hidden
              className="invisible max-h-16 overflow-hidden px-3 py-1.5 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1] @min-[30rem]/hint-ladder:max-h-24"
            >
              {`${attempt} `}
            </span>
          </div>
          <button
            type="submit"
            aria-disabled={!live || !attempt.trim() || undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-3 bg-(--hl-solid) px-3 text-[12px] font-medium text-primary-foreground transition-opacity aria-disabled:opacity-40",
              FOCUS,
            )}
          >
            Check
            <span className="hidden @min-[24rem]/hint-ladder:inline">
              &nbsp;my work
            </span>
          </button>
        </div>
      </form>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
