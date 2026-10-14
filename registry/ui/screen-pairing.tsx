"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  LoaderCircle,
  Monitor,
  MonitorOff,
  Pencil,
  RotateCcw,
  TriangleAlert,
  Tv,
  X,
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
import { cn } from "@/registry/lib/utils";

export type ScreenStyle = "tv" | "kiosk" | "plain";
export type ScreenDensity = "compact" | "cozy" | "roomy";
export type ScreenAccent = "cobalt" | "signal" | "success";
export type ScreenPairingStatus = "ready" | "loading" | "error";

/** A screen already signed in to the account. */
export type PairedScreen = {
  id: string;
  /** What the screen is called, e.g. "Lobby wall". */
  name: string;
  /** Where it hangs, e.g. "Lobby". */
  location?: string;
  /** When it was paired, in ms. */
  pairedAt: number;
  /** When it last checked in, in ms; null if it never has. */
  lastSeenAt: number | null;
};

/** Handed to `pair`: what was typed, the code the screen is showing, the attempt and a signal that fires on unmount. */
export type ScreenPairContext = {
  entered: string;
  code: string;
  attempt: number;
  signal: AbortSignal;
};

/** What a successful pairing comes back with: the screen's name and, if known, where it is. */
export type ScreenPairResult = { name: string; location?: string };

export type ScreenPair = (
  context: ScreenPairContext,
) => Promise<ScreenPairResult>;

export type ScreenChange =
  | { type: "paired"; screen: PairedScreen }
  | { type: "renamed"; screen: PairedScreen; from: string }
  | { type: "unpaired"; screen: PairedScreen };

export type ScreenPairingProps = {
  /** How the screen is drawn: a wide set on a stand, an upright kiosk on a base, or a plain dark face. @default "tv" */
  screenStyle?: ScreenStyle;
  /** Glyph size, cell size, row heights and padding. @default "cozy" */
  density?: ScreenDensity;
  /** The colour the ring, the dot and the welcome take: cobalt, the signal tone or green. @default "cobalt" */
  accent?: ScreenAccent;
  /** The code the screen shows first; later ones are generated. @default defaultScreenCode */
  code?: string;
  /** When the first code expires, in ms. @default defaultScreenExpiresAt */
  expiresAt?: number;
  /** How long each generated code lives, in seconds. @default 90 */
  codeSeconds?: number;
  /** The moment the clock starts from, in ms; it runs on from there after mount. @default defaultScreenNow */
  now?: number;
  /** Controlled list of paired screens. */
  screens?: PairedScreen[];
  /** Initial list when uncontrolled. @default defaultPairedScreens */
  defaultScreens?: PairedScreen[];
  /** Fires with the whole list after a screen is paired, renamed or unpaired. */
  onChange?: (screens: PairedScreen[], change: ScreenChange) => void;
  /** Controlled selection in the paired list, by id. */
  selected?: string | null;
  /** Initial selection when uncontrolled. @default null */
  defaultSelected?: string | null;
  /** A row was chosen in the paired list. */
  onSelect?: (id: string | null, screen: PairedScreen | null) => void;
  /** Checks a code. Resolves with the screen's name to pair it; rejects with the message to show. @default defaultScreenPair */
  pair?: ScreenPair;
  /** A screen was paired. It is already in the list. */
  onPaired?: (screen: PairedScreen) => void;
  /** A screen was renamed, from the field after pairing. */
  onRename?: (screen: PairedScreen, from: string) => void;
  /** A screen was unpaired, after the second press. */
  onUnpair?: (screen: PairedScreen) => void;
  /** The screen is showing a new code, after the old one expired or another pairing began. */
  onCodeChange?: (code: string, expiresAt: number) => void;
  /** The product named on the screen. @default "Basinworks Screens" */
  product?: string;
  /** The address the screen tells people to go to. @default "basinworks.app/screen" */
  pairUrl?: string;
  /** Whether the code and the paired list have arrived. @default "ready" */
  status?: ScreenPairingStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Pair a screen" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the panes scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be entered, renamed or unpaired. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultScreenNow = Date.UTC(2026, 9, 12, 9, 30);

/** No 0, O, 1 or I: nothing a glance across a lobby could confuse. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A six-character pairing code from a seed, the same every time. */
export const makeScreenCode = (seed: number): string => {
  const rand = mulberry32(seed);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += ALPHABET[Math.floor(rand() * ALPHABET.length)] ?? "A";
  }
  return out;
};

export const defaultScreenCode = makeScreenCode(1718);

/** Sixty-four seconds after the clock starts. */
export const defaultScreenExpiresAt = defaultScreenNow + 64 * SEC;

/** Three Basinworks screens already signed in. */
export const defaultPairedScreens: PairedScreen[] = [
  {
    id: "scr-lobby",
    name: "Lobby wall",
    location: "Lobby",
    pairedAt: defaultScreenNow - 41 * DAY,
    lastSeenAt: defaultScreenNow - 2 * MIN,
  },
  {
    id: "scr-cafe",
    name: "Kitchen menu",
    location: "Cafe",
    pairedAt: defaultScreenNow - 12 * DAY,
    lastSeenAt: defaultScreenNow - HOUR,
  },
  {
    id: "scr-dock",
    name: "Warehouse board",
    location: "Dock 3",
    pairedAt: defaultScreenNow - 3 * DAY,
    lastSeenAt: null,
  },
];

const abortError = () =>
  new DOMException("The pairing was cancelled.", "AbortError");

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** The default check: under a second, then the front desk's screen — or a mismatch. */
export const defaultScreenPair: ScreenPair = async ({
  entered,
  code,
  signal,
}) => {
  await wait(900, signal);
  if (entered !== code) throw new Error("That code didn't match the screen.");
  return { name: "Front desk", location: "Reception" };
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const ACCENTS: Record<ScreenAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const DENSITY: Record<
  ScreenDensity,
  {
    pad: string;
    gap: string;
    glyph: string;
    glyphGap: string;
    cell: string;
    row: string;
    field: string;
  }
> = {
  compact: {
    pad: "p-3",
    gap: "gap-3",
    glyph: "text-[26px] @min-[40rem]:text-[32px]",
    glyphGap: "gap-1.5",
    cell: "h-9 w-8 text-base",
    row: "min-h-9",
    field: "h-8",
  },
  cozy: {
    pad: "p-4",
    gap: "gap-4",
    glyph: "text-[32px] @min-[40rem]:text-[40px]",
    glyphGap: "gap-2",
    cell: "h-11 w-9 text-lg",
    row: "min-h-11",
    field: "h-9",
  },
  roomy: {
    pad: "p-5",
    gap: "gap-5",
    glyph: "text-[38px] @min-[40rem]:text-[48px]",
    glyphGap: "gap-2.5",
    cell: "h-12 w-10 text-xl",
    row: "min-h-12",
    field: "h-10",
  },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const noopSubscribe = () => () => {};

/** Uppercase letters and digits only, at most `max` of them. */
const sanitize = (raw: string, max: number) =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, max);

const seedOf = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
};

/** "just now", "2 min ago", "1 h ago", "3 d ago". */
const ago = (at: number, now: number) => {
  const d = Math.max(0, now - at);
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)} min ago`;
  if (d < DAY) return `${Math.floor(d / HOUR)} h ago`;
  return `${Math.floor(d / DAY)} d ago`;
};

/** "K Q 7 M 4 X", so a reader hears each glyph. */
const spell = (code: string) => code.split("").join(" ");

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/* ----------------------------------------------------------------------- */
/*                                 The ring                                 */
/* ----------------------------------------------------------------------- */

const RING_SIZE = 26;
const RING_R = 10;
const RING_C = 2 * Math.PI * RING_R;

function CodeRing({
  fraction,
  seconds,
  tone,
  blink,
  onBlinkDone,
  motionSafe,
}: {
  fraction: number;
  seconds: number;
  tone: "accent" | "warn" | "danger" | "success";
  blink: boolean;
  onBlinkDone: () => void;
  motionSafe: boolean;
}) {
  const colour =
    tone === "warn"
      ? "var(--warn)"
      : tone === "danger"
        ? "var(--danger)"
        : tone === "success"
          ? "var(--success)"
          : "var(--sp-accent)";
  return (
    <span
      role="timer"
      aria-label="Code expires"
      aria-live="off"
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <span className="sr-only">
        {tone === "success"
          ? "Paired"
          : `${plural(seconds, "second", "seconds")} left`}
      </span>
      <svg
        aria-hidden
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          fill="none"
          stroke="white"
          strokeOpacity={0.14}
          strokeWidth={2}
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_R}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={r3(RING_C * (1 - clamp(fraction, 0, 1)))}
          style={{
            // Linear between one-second ticks, so the ring drains rather
            // than steps; a countdown is a scroll-linked value, not a move.
            transition: motionSafe
              ? "stroke-dashoffset 1s linear, stroke 0.24s"
              : "stroke 0.24s",
          }}
        />
      </svg>
      <motion.span
        aria-hidden
        className="relative block size-2 rounded-full"
        style={{
          backgroundColor: colour,
          boxShadow: `0 0 8px 1px color-mix(in oklab, ${colour} 70%, transparent)`,
          transition: "background-color 0.24s, box-shadow 0.24s",
        }}
        initial={false}
        animate={
          blink && motionSafe ? { opacity: [1, 0.05, 1] } : { opacity: 1 }
        }
        transition={{ duration: durations.slow, ease: easings.move }}
        onAnimationComplete={() => {
          if (blink) onBlinkDone();
        }}
      />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The glyphs                                */
/* ----------------------------------------------------------------------- */

function Glyphs({
  code,
  land,
  motionSafe,
  className,
  gap,
}: {
  code: string;
  /** Whether glyphs that mount now travel in. False for the server render. */
  land: boolean;
  motionSafe: boolean;
  className: string;
  gap: string;
}) {
  const step = cascade(CODE_LENGTH);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex font-mono font-semibold tracking-[0.04em]",
        gap,
        className,
      )}
    >
      {code.split("").map((glyph, i) => (
        <span
          key={i}
          className="relative inline-flex h-[1.2em] w-[0.72em] items-center justify-center overflow-hidden"
        >
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={`${glyph}-${i}-${code}`}
              className="absolute inset-0 flex items-center justify-center"
              initial={
                land ? { y: motionSafe ? "-1.1em" : 0, opacity: 0 } : false
              }
              animate={{ y: 0, opacity: 1 }}
              exit={{
                y: motionSafe ? "1.1em" : 0,
                opacity: 0,
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      delay: r3(i * step),
                      opacity: {
                        duration: durations.fast,
                        delay: r3(i * step),
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              {glyph}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The cells                                */
/* ----------------------------------------------------------------------- */

type CellsProps = {
  value: string;
  onValue: (next: string) => void;
  onSubmit: () => void;
  shaking: boolean;
  onShakeDone: () => void;
  invalid: boolean;
  locked: boolean;
  cellClass: string;
  labelId: string;
  describedBy?: string;
  motionSafe: boolean;
  focusReq: number;
};

function Cells({
  value,
  onValue,
  onSubmit,
  shaking,
  onShakeDone,
  invalid,
  locked,
  cellClass,
  labelId,
  describedBy,
  motionSafe,
  focusReq,
}: CellsProps) {
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);
  const anchor = Math.min(value.length, CODE_LENGTH - 1);

  const focusCell = (i: number) => {
    const at = clamp(i, 0, Math.min(value.length, CODE_LENGTH - 1));
    inputs.current[at]?.focus({ preventScroll: true });
  };

  // After a failed check the cells are emptied and the first one takes focus
  // again, so the next try starts where the last one did.
  React.useLayoutEffect(() => {
    if (focusReq === 0) return;
    inputs.current[0]?.focus({ preventScroll: true });
  }, [focusReq]);

  const write = (i: number, chars: string) => {
    const next = (value.slice(0, i) + chars).slice(0, CODE_LENGTH);
    onValue(next);
    // Focus moves to the next empty cell, or stays on the last one.
    const to = Math.min(next.length, CODE_LENGTH - 1);
    window.requestAnimationFrame(() => {
      inputs.current[to]?.focus({ preventScroll: true });
    });
  };

  const handleChange = (i: number, raw: string) => {
    if (locked) return;
    const old = value[i] ?? "";
    const typed = sanitize(raw, CODE_LENGTH);
    const chars = typed.length > 1 && old ? typed.replace(old, "") : typed;
    if (chars) write(i, chars);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    switch (event.key) {
      case "Backspace": {
        event.preventDefault();
        if (locked) return;
        const at = Math.max(0, i < value.length ? i : i - 1);
        onValue(value.slice(0, at) + value.slice(at + 1));
        window.requestAnimationFrame(() => {
          inputs.current[at]?.focus({ preventScroll: true });
        });
        break;
      }
      case "Delete":
        event.preventDefault();
        if (!locked) onValue(value.slice(0, i) + value.slice(i + 1));
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusCell(i - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        focusCell(i + 1);
        break;
      case "Home":
        event.preventDefault();
        focusCell(0);
        break;
      case "End":
        event.preventDefault();
        focusCell(CODE_LENGTH - 1);
        break;
      case "Enter":
        event.preventDefault();
        onSubmit();
        break;
      default:
        break;
    }
  };

  const handlePaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    i: number,
  ) => {
    event.preventDefault();
    if (locked) return;
    const chars = sanitize(event.clipboardData.getData("text"), CODE_LENGTH);
    if (chars) write(i, chars);
  };

  return (
    <motion.div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-busy={locked || undefined}
      className="flex items-center gap-1.5 @min-[24rem]:gap-2"
      initial={false}
      animate={shaking && motionSafe ? { x: [0, -6, 6, -4, 2, 0] } : { x: 0 }}
      transition={{ duration: durations.slow, ease: easings.move }}
      onAnimationComplete={() => {
        if (shaking) onShakeDone();
      }}
    >
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const glyph = value[i] ?? "";
        const filled = glyph !== "";
        return (
          <span
            key={i}
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded-2 border font-mono transition-colors duration-200",
              cellClass,
              invalid
                ? "border-danger bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]"
                : filled
                  ? "border-hairline-strong bg-surface-0"
                  : "border-hairline bg-surface-0",
              locked && "opacity-70",
            )}
          >
            <AnimatePresence initial={false}>
              {filled ? (
                <motion.span
                  key={`${glyph}-${i}`}
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center text-foreground"
                  initial={
                    motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {glyph}
                </motion.span>
              ) : (
                <span
                  key="dot"
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center text-ink-3"
                >
                  <span className="block size-1 rounded-full bg-current opacity-60" />
                </span>
              )}
            </AnimatePresence>
            <input
              ref={(node) => {
                inputs.current[i] = node;
              }}
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Character ${i + 1} of ${CODE_LENGTH}`}
              aria-invalid={invalid || undefined}
              value={glyph}
              readOnly={locked}
              tabIndex={i === anchor ? 0 : -1}
              onChange={(event) => handleChange(i, event.target.value)}
              onKeyDown={(event) => handleKeyDown(event, i)}
              onPaste={(event) => handlePaste(event, i)}
              onFocus={(event) => {
                // A press on a cell past the next empty one lands on that
                // empty one, so the code is always filled from the left.
                if (i > value.length) {
                  focusCell(value.length);
                  return;
                }
                event.target.select();
              }}
              // The input keeps the real value for the caret and assistive
              // technology; the visible glyph is the animated span above it.
              className={cn(
                "absolute inset-0 size-full rounded-2 bg-transparent text-center font-mono text-transparent caret-transparent selection:bg-transparent",
                FOCUS_RING,
              )}
            />
          </span>
        );
      })}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Skeletons                                 */
/* ----------------------------------------------------------------------- */

function Skeleton({
  className,
  delay,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-2 bg-surface-2 motion-safe:animate-pulse",
        className,
      )}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Phase = "enter" | "checking" | "paired";

type Stamped<T> = { forProp: T; value: number; from: number };

/**
 * Signing a TV or a kiosk in with a short code. On the left, the screen: a
 * dark face showing six mono glyphs that land on `springs.snap`, one after
 * the other on `cascade`, under a status dot inside a ring that drains as the
 * code runs out. On the right, the phone or laptop: six cells that fill from
 * the left, each glyph popping in on `springs.snap`, and a Pair button.
 *
 * A code that matches dissolves the glyphs on an exit tween while a welcome
 * card rises on the screen on `springs.glide`, the dot turns green, the
 * phone side turns into a "Screen paired" card with a Rename field, and the
 * new screen lands in the paired list below on `springs.recoil`. A wrong one
 * shakes the cells, blinks the screen's dot once and empties the cells for
 * another try. When the ring runs out a new code rolls in from above as the
 * old one drops out, and the clock starts again.
 *
 * The cells are one group: typing advances, Backspace steps back, arrows,
 * Home and End move, paste fills, Enter submits. The paired list is a listbox
 * where arrows move, Enter chooses, and Delete arms an Unpair that a second
 * Delete confirms and Escape cancels. Under reduced motion nothing travels,
 * shakes or rolls: glyphs, cards and rows cross-fade in place, the dot turns
 * red instead of blinking, and every change is still announced.
 */
export function ScreenPairing({
  screenStyle = "tv",
  density = "cozy",
  accent = "cobalt",
  code: codeProp = defaultScreenCode,
  expiresAt = defaultScreenExpiresAt,
  codeSeconds = 90,
  now = defaultScreenNow,
  screens,
  defaultScreens = defaultPairedScreens,
  onChange,
  selected,
  defaultSelected = null,
  onSelect,
  pair = defaultScreenPair,
  onPaired,
  onRename,
  onUnpair,
  onCodeChange,
  product = "Basinworks Screens",
  pairUrl = "basinworks.app/screen",
  status = "ready",
  onRetry,
  title = "Pair a screen",
  label,
  height = 540,
  disabled = false,
  className,
}: ScreenPairingProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const cellsLabelId = `${uid}-cells`;
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;
  const listId = `${uid}-list`;
  const renameId = `${uid}-rename`;

  const ready = status === "ready";
  const inert = disabled || !ready;
  const d = DENSITY[density];

  // False for the server render and hydration, so glyphs already on the page
  // never travel in; true for a code that mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  /* ------------------------------- state ------------------------------- */

  const [ownScreens, setOwnScreens] =
    React.useState<PairedScreen[]>(defaultScreens);
  const list = screens ?? ownScreens;
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected,
  );
  const currentSelected = selected === undefined ? ownSelected : selected;

  // The code and its deadline the piece generated itself, stamped with the
  // prop they replaced: a new prop from the host wins again.
  const [ownCode, setOwnCode] = React.useState<{
    forProp: string;
    value: string;
  } | null>(null);
  const [ownDeadline, setOwnDeadline] = React.useState<Stamped<number> | null>(
    null,
  );
  const code =
    ownCode && ownCode.forProp === codeProp ? ownCode.value : codeProp;
  const deadline =
    ownDeadline && ownDeadline.forProp === expiresAt
      ? ownDeadline.value
      : expiresAt;
  const codeFrom =
    ownDeadline && ownDeadline.forProp === expiresAt ? ownDeadline.from : now;

  const [clock, setClock] = React.useState(now);
  const [phase, setPhase] = React.useState<Phase>("enter");
  const [entered, setEntered] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [shaking, setShaking] = React.useState(false);
  const [blink, setBlink] = React.useState(false);
  const [focusReq, setFocusReq] = React.useState(0);
  const [justPaired, setJustPaired] = React.useState<PairedScreen | null>(null);
  const [rename, setRename] = React.useState("");
  const [arming, setArming] = React.useState<string | null>(null);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [onScreen, setOnScreen] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const unpairNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const renameRef = React.useRef<HTMLInputElement | null>(null);
  const base = React.useRef<{ real: number; virtual: number } | null>(null);
  const gen = React.useRef(0);
  const controller = React.useRef<AbortController | null>(null);
  const disarmTimer = React.useRef<number | null>(null);
  const latest = React.useRef<{ expire: () => void }>({ expire: () => {} });

  const virtualNow = React.useCallback(() => {
    const b = base.current;
    return b ? b.virtual + (Date.now() - b.real) : now;
  }, [now]);

  /* -------------------------------- clock ------------------------------ */

  // The clock runs on from `now` after mount — never read during render, so
  // the server and the client draw the same ring.
  React.useEffect(() => {
    base.current = { real: Date.now(), virtual: now };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClock(now);
  }, [now]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    watcher.observe(root);
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // One tick a second, only while a code is counting down on a visible page.
  const ticking = ready && phase !== "paired" && onScreen && pageShown;
  React.useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => setClock(virtualNow()), 1000);
    return () => window.clearInterval(id);
  }, [ticking, virtualNow]);

  // One timeout for the moment the code runs out.
  React.useEffect(() => {
    if (!ready || phase !== "enter") return;
    const remaining = Math.max(0, deadline - virtualNow());
    const id = window.setTimeout(() => latest.current.expire(), remaining);
    return () => window.clearTimeout(id);
  }, [deadline, ready, phase, virtualNow]);

  React.useEffect(
    () => () => {
      controller.current?.abort();
      if (disarmTimer.current !== null)
        window.clearTimeout(disarmTimer.current);
    },
    [],
  );

  /* ------------------------------- changes ----------------------------- */

  const announce = (text: string) => setAnnouncement(text);

  const commit = (next: PairedScreen[], change: ScreenChange) => {
    if (screens === undefined) setOwnScreens(next);
    onChange?.(next, change);
  };

  const select = (id: string | null) => {
    if (selected === undefined) setOwnSelected(id);
    onSelect?.(id, list.find((s) => s.id === id) ?? null);
  };

  const regenerate = (reason: "expired" | "another") => {
    gen.current += 1;
    const next = makeScreenCode(seedOf(codeProp) + gen.current);
    const at = virtualNow();
    setOwnCode({ forProp: codeProp, value: next });
    setOwnDeadline({
      forProp: expiresAt,
      value: at + codeSeconds * SEC,
      from: at,
    });
    setClock(at);
    setEntered("");
    setError(null);
    setPhase("enter");
    onCodeChange?.(next, at + codeSeconds * SEC);
    announce(
      `${reason === "expired" ? "The code expired. " : ""}New code ${spell(next)}, ${plural(codeSeconds, "second", "seconds")} to enter it.`,
    );
  };

  React.useEffect(() => {
    latest.current = { expire: () => regenerate("expired") };
  });

  const submit = async () => {
    if (inert || phase !== "enter") return;
    if (entered.length < CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} characters.`);
      setShaking(true);
      announce(`Enter all ${CODE_LENGTH} characters.`);
      return;
    }
    const n = attempt + 1;
    setAttempt(n);
    setError(null);
    setPhase("checking");
    announce("Checking the code.");
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    try {
      const result = await pair({
        entered,
        code,
        attempt: n,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      const at = virtualNow();
      const screen: PairedScreen = {
        id: `scr-${at.toString(36)}-${entered.toLowerCase()}`,
        name: result.name,
        location: result.location,
        pairedAt: at,
        lastSeenAt: at,
      };
      setJustPaired(screen);
      setRename(screen.name);
      setLanded(screen.id);
      setPhase("paired");
      setClock(at);
      commit([...list, screen], { type: "paired", screen });
      onPaired?.(screen);
      announce(
        `Screen paired: ${screen.name}. ${plural(list.length + 1, "screen", "screens")} paired.`,
      );
    } catch (err) {
      if (ac.signal.aborted) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : "That code didn't match.";
      setPhase("enter");
      setEntered("");
      setError(message);
      setShaking(true);
      setBlink(true);
      setFocusReq((f) => f + 1);
      announce(`${message} ${plural(n, "try", "tries")} so far.`);
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  };

  const saveRename = () => {
    if (inert || !justPaired) return;
    const name = rename.trim();
    if (!name || name === justPaired.name) return;
    const from = justPaired.name;
    const renamed = { ...justPaired, name };
    setJustPaired(renamed);
    commit(
      list.map((s) => (s.id === renamed.id ? renamed : s)),
      { type: "renamed", screen: renamed, from },
    );
    onRename?.(renamed, from);
    announce(`Renamed to ${name}.`);
  };

  const pairAnother = () => {
    if (inert) return;
    setJustPaired(null);
    setAttempt(0);
    regenerate("another");
  };

  const disarm = () => {
    if (disarmTimer.current !== null) window.clearTimeout(disarmTimer.current);
    disarmTimer.current = null;
    setArming(null);
  };

  const arm = (screen: PairedScreen) => {
    if (inert) return;
    if (disarmTimer.current !== null) window.clearTimeout(disarmTimer.current);
    setArming(screen.id);
    announce(
      `Unpair ${screen.name}? Press Delete again or Unpair to confirm, Escape to keep it.`,
    );
    // An armed row stands down on its own, so a forgotten first press never
    // turns the next one into an unpair.
    disarmTimer.current = window.setTimeout(() => {
      disarmTimer.current = null;
      setArming(null);
    }, 6000);
  };

  const unpair = (screen: PairedScreen) => {
    if (inert) return;
    disarm();
    const i = list.findIndex((s) => s.id === screen.id);
    const next = list.filter((s) => s.id !== screen.id);
    commit(next, { type: "unpaired", screen });
    onUnpair?.(screen);
    if (currentSelected === screen.id) select(null);
    if (justPaired?.id === screen.id) {
      setJustPaired(null);
      regenerate("another");
    }
    announce(
      `${screen.name} unpaired. ${plural(next.length, "screen", "screens")} left.`,
    );
    const neighbour = next[Math.min(i, next.length - 1)];
    if (neighbour) {
      setActiveRow(neighbour.id);
      window.requestAnimationFrame(() => {
        rowNodes.current.get(neighbour.id)?.focus({ preventScroll: true });
      });
    }
  };

  const pressUnpair = (screen: PairedScreen) => {
    if (arming === screen.id) unpair(screen);
    else arm(screen);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const ids = list.map((s) => s.id);
  const activeId =
    activeRow && ids.includes(activeRow)
      ? activeRow
      : currentSelected && ids.includes(currentSelected)
        ? currentSelected
        : (ids[0] ?? null);

  const onRowKey = (
    event: React.KeyboardEvent,
    screen: PairedScreen,
    i: number,
  ) => {
    let to: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        to = i + 1;
        break;
      case "ArrowUp":
        to = i - 1;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = ids.length - 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(screen.id);
        announce(`${screen.name} chosen.`);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        pressUnpair(screen);
        return;
      case "Escape":
        if (arming) {
          event.preventDefault();
          disarm();
          announce(`${screen.name} kept.`);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) rowNodes.current.get(target)?.focus();
  };

  /* ------------------------------- derived ----------------------------- */

  const remainingMs = Math.max(0, deadline - clock);
  const seconds = Math.ceil(remainingMs / SEC);
  const span = Math.max(SEC, deadline - codeFrom);
  const fraction = clamp(remainingMs / span, 0, 1);
  const paired = phase === "paired";
  const ringTone: "accent" | "warn" | "danger" | "success" = paired
    ? "success"
    : blink || (!motionSafe && error)
      ? "danger"
      : seconds <= 10
        ? "warn"
        : "accent";
  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const rowStep = cascade(Math.min(list.length, 8));

  /* -------------------------------- render ----------------------------- */

  const face =
    screenStyle === "kiosk"
      ? "aspect-[4/3] @min-[40rem]:aspect-[5/4]"
      : "aspect-video";

  const screenPane = (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "relative w-full",
          screenStyle === "tv" &&
            "rounded-3 bg-[color-mix(in_oklab,black_72%,var(--bg-2))] p-[6px] shadow-[0_18px_40px_-24px_color-mix(in_oklab,black_60%,transparent)]",
          screenStyle === "kiosk" &&
            "rounded-4 bg-[color-mix(in_oklab,black_72%,var(--bg-2))] p-3 pb-5 shadow-[0_18px_40px_-24px_color-mix(in_oklab,black_60%,transparent)]",
        )}
      >
        <div
          className={cn(
            "relative flex w-full flex-col overflow-hidden rounded-2 bg-(--sp-face) text-(--sp-glyph)",
            face,
            screenStyle === "plain" && "rounded-3",
          )}
        >
          {status === "loading" ? (
            <div
              aria-hidden
              className="flex flex-1 flex-col justify-between p-4"
            >
              <span className="block h-2.5 w-24 rounded-1 bg-white/10 motion-safe:animate-pulse" />
              <span className="flex justify-center gap-2">
                {Array.from({ length: CODE_LENGTH }, (_, i) => (
                  <span
                    key={i}
                    className="block h-10 w-7 rounded-1 bg-white/10 motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 70}ms` }}
                  />
                ))}
              </span>
              <span className="block h-2.5 w-40 rounded-1 bg-white/10 motion-safe:animate-pulse" />
            </div>
          ) : status === "error" ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <MonitorOff aria-hidden className="size-6 opacity-50" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-4 pt-3">
                <span className="truncate font-mono text-[10px] tracking-[0.08em] text-(--sp-dim) uppercase">
                  {product}
                </span>
                <CodeRing
                  fraction={paired ? 1 : fraction}
                  seconds={seconds}
                  tone={ringTone}
                  blink={blink}
                  onBlinkDone={() => setBlink(false)}
                  motionSafe={motionSafe}
                />
              </div>
              <div className="relative flex flex-1 items-center justify-center px-4">
                <AnimatePresence initial={false} mode="wait">
                  {paired && justPaired ? (
                    <motion.div
                      key="welcome"
                      className="flex max-w-full flex-col items-center gap-1.5 text-center"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.shift : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.base) }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.glide,
                              opacity: {
                                duration: durations.base,
                                ease: easings.enter,
                              },
                            }
                          : { duration: durations.base }
                      }
                    >
                      <span
                        className="flex size-8 items-center justify-center rounded-full"
                        style={{
                          backgroundColor:
                            "color-mix(in oklab, var(--success) 28%, transparent)",
                        }}
                      >
                        <svg
                          aria-hidden
                          viewBox="0 0 16 16"
                          className="size-4 text-success"
                        >
                          <motion.path
                            d="M3.5 8.5 6.5 11.5 12.5 4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={motionSafe ? { pathLength: 0 } : false}
                            animate={{ pathLength: 1 }}
                            transition={
                              motionSafe
                                ? { ...springs.flick, delay: durations.fast }
                                : { duration: 0 }
                            }
                          />
                        </svg>
                      </span>
                      <span className="truncate text-lg font-semibold @min-[40rem]:text-xl">
                        Welcome, {justPaired.name}
                      </span>
                      <span className="text-[11px] text-(--sp-dim)">
                        This screen is signed in.
                      </span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`code-${code}`}
                      className="flex flex-col items-center"
                      initial={false}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={{
                        opacity: 0,
                        scale: motionSafe ? 1.04 : 1,
                        filter: motionSafe ? "blur(6px)" : "blur(0px)",
                        transition: exitFor(durations.slow),
                      }}
                    >
                      <span className="sr-only">Code {spell(code)}</span>
                      <Glyphs
                        code={code}
                        land={live}
                        motionSafe={motionSafe}
                        className={d.glyph}
                        gap={d.glyphGap}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-4 pb-3 text-center">
                <span className="text-[11px] text-(--sp-dim) @min-[40rem]:text-xs">
                  {paired ? "Pairing finished on your phone." : "Go to"}{" "}
                  {paired ? null : (
                    <span className="font-mono font-medium text-(--sp-glyph)">
                      {pairUrl}
                    </span>
                  )}
                </span>
                {paired ? null : (
                  <span className="text-[11px] text-(--sp-dim)">
                    and enter this code
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {screenStyle === "tv" ? (
        <span aria-hidden className="flex flex-col items-center">
          <span className="block h-3 w-2 bg-[color-mix(in_oklab,black_60%,var(--bg-2))]" />
          <span className="block h-1.5 w-20 rounded-full bg-[color-mix(in_oklab,black_60%,var(--bg-2))]" />
        </span>
      ) : screenStyle === "kiosk" ? (
        <span
          aria-hidden
          className="block h-2 w-[55%] rounded-b-3 bg-[color-mix(in_oklab,black_55%,var(--bg-2))]"
        />
      ) : null}
    </div>
  );

  const phonePane = (
    <div
      className={cn(
        "flex flex-col rounded-3 border border-hairline bg-surface-1",
        d.pad,
        d.gap,
      )}
    >
      {status === "loading" ? (
        <div aria-hidden className="flex flex-col gap-3">
          <Skeleton className="h-3 w-32" />
          <span className="flex gap-2">
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <Skeleton
                key={i}
                className={cn("w-9", d.cell.split(" ")[0])}
                delay={i * 60}
              />
            ))}
          </span>
          <Skeleton className="h-9 w-28" delay={200} />
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-2 text-sm text-foreground">
            <TriangleAlert aria-hidden className="size-4 text-danger" />
            The pairing code didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <AnimatePresence initial={false} mode="wait">
          {paired && justPaired ? (
            <motion.div
              key="paired"
              className="flex flex-col gap-3"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.base }
              }
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success">
                  <Check aria-hidden className="size-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Screen paired</p>
                  <p className="truncate text-xs text-ink-2">
                    {justPaired.name}
                    {justPaired.location ? ` · ${justPaired.location}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={renameId} className={LABEL}>
                  Rename
                </label>
                <div className="flex items-center gap-2">
                  <span className="relative min-w-0 flex-1">
                    <Pencil
                      aria-hidden
                      className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
                    />
                    <input
                      ref={renameRef}
                      id={renameId}
                      type="text"
                      value={rename}
                      readOnly={inert}
                      onChange={(event) => setRename(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          saveRename();
                        }
                      }}
                      onBlur={saveRename}
                      className={cn(
                        "w-full rounded-2 border border-hairline bg-surface-0 pr-2.5 pl-8 text-sm text-foreground",
                        d.field,
                        FOCUS_RING,
                      )}
                    />
                  </span>
                  <button
                    type="button"
                    onClick={saveRename}
                    aria-disabled={
                      inert ||
                      !rename.trim() ||
                      rename.trim() === justPaired.name ||
                      undefined
                    }
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-2 border border-hairline px-3 text-xs transition-colors",
                      d.field,
                      !inert &&
                        rename.trim() &&
                        rename.trim() !== justPaired.name
                        ? "text-foreground hover:bg-surface-2"
                        : "cursor-default text-ink-3",
                      FOCUS_RING,
                    )}
                  >
                    Save
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={pairAnother}
                aria-disabled={inert || undefined}
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                  d.field,
                  inert && "cursor-not-allowed opacity-60",
                  FOCUS_RING,
                )}
              >
                <Monitor aria-hidden className="size-3.5" />
                Pair another screen
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="enter"
              className="flex flex-col gap-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <div className="flex flex-col gap-0.5">
                <p id={cellsLabelId} className="text-sm font-semibold">
                  On your phone or laptop
                </p>
                <p className="text-xs text-ink-2">
                  Enter the code shown on the screen.
                </p>
              </div>
              <Cells
                value={entered}
                onValue={(next) => {
                  setEntered(next);
                  if (error) setError(null);
                }}
                onSubmit={() => void submit()}
                shaking={shaking}
                onShakeDone={() => setShaking(false)}
                invalid={error !== null}
                locked={inert || phase === "checking"}
                cellClass={d.cell}
                labelId={cellsLabelId}
                describedBy={error ? `${hintId} ${errorId}` : hintId}
                motionSafe={motionSafe}
                focusReq={focusReq}
              />
              <div className="flex min-h-5 items-center">
                <AnimatePresence initial={false} mode="wait">
                  {error ? (
                    <motion.p
                      key={error}
                      id={errorId}
                      className="flex items-center gap-1.5 text-xs text-danger"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{ duration: durations.fast }}
                    >
                      <TriangleAlert
                        aria-hidden
                        className="size-3.5 shrink-0"
                      />
                      <span>
                        {error}
                        {attempt > 0 ? (
                          <span className="text-ink-3">
                            {" "}
                            · {plural(attempt, "try", "tries")}
                          </span>
                        ) : null}
                      </span>
                    </motion.p>
                  ) : (
                    <motion.p
                      key="hint"
                      className="text-[11px] text-ink-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{ duration: durations.fast }}
                    >
                      {seconds > 0
                        ? `The code changes in ${plural(seconds, "second", "seconds")}.`
                        : "A new code is on its way."}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <motion.button
                type="button"
                onClick={() => void submit()}
                aria-disabled={inert || phase === "checking" || undefined}
                whileTap={!inert && motionSafe ? { scale: 0.97 } : undefined}
                transition={springs.flick}
                className={cn(
                  "inline-flex w-fit items-center gap-2 rounded-2 bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                  d.field,
                  (inert || phase === "checking") &&
                    "cursor-default opacity-70",
                  FOCUS_RING,
                )}
              >
                {phase === "checking" ? (
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 motion-safe:animate-spin"
                  />
                ) : (
                  <Tv aria-hidden className="size-3.5" />
                )}
                {phase === "checking" ? "Checking" : "Pair screen"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );

  const pairedList = (
    <section aria-labelledby={listId} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={listId} className={LABEL}>
          Paired screens
        </h3>
        {ready ? (
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {list.length}
          </span>
        ) : null}
      </div>
      {status === "loading" ? (
        <div aria-hidden className="flex flex-col gap-1.5">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className={cn("w-full", d.row)} delay={i * 110} />
          ))}
        </div>
      ) : status === "error" ? (
        <p className="text-xs text-ink-3">
          The paired screens didn&apos;t load either.
        </p>
      ) : list.length === 0 ? (
        <motion.div
          className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-4 py-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          <Monitor aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No screens paired yet.</p>
          <p className="text-[11px] text-ink-3">
            Enter the code on the screen and the first one will appear here.
          </p>
        </motion.div>
      ) : (
        <ul
          role="listbox"
          aria-labelledby={listId}
          aria-describedby={hintId}
          className="flex flex-col gap-1"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((screen, i) => {
              const armed = arming === screen.id;
              const isSelected = currentSelected === screen.id;
              const fresh = landed === screen.id;
              return (
                <motion.li
                  key={screen.id}
                  layout={motionSafe ? "position" : false}
                  initial={
                    live
                      ? fresh && motionSafe
                        ? { opacity: 0, scale: 0.94, y: -distances.step }
                        : { opacity: 0 }
                      : false
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    layout: springs.glide,
                    scale: fresh ? springs.recoil : springs.glide,
                    y: fresh
                      ? springs.recoil
                      : motionSafe
                        ? {
                            ...springs.glide,
                            delay: r3(Math.min(i, 8) * rowStep),
                          }
                        : { duration: 0 },
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                  onAnimationComplete={() => {
                    if (fresh) setLanded(null);
                  }}
                  className={cn(
                    "relative flex items-stretch gap-1 rounded-2 transition-colors",
                    isSelected &&
                      "bg-[color-mix(in_oklab,var(--sp-accent)_10%,transparent)]",
                    armed &&
                      "bg-[color-mix(in_oklab,var(--danger)_8%,transparent)]",
                  )}
                >
                  <button
                    ref={(node) => {
                      if (node) rowNodes.current.set(screen.id, node);
                      else rowNodes.current.delete(screen.id);
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={activeId === screen.id ? 0 : -1}
                    onFocus={() => setActiveRow(screen.id)}
                    onClick={() => {
                      if (inert) return;
                      select(screen.id);
                    }}
                    onKeyDown={(event) => onRowKey(event, screen, i)}
                    aria-label={`${screen.name}${screen.location ? `, ${screen.location}` : ""}, paired ${ago(screen.pairedAt, clock)}, ${screen.lastSeenAt === null ? "never checked in" : `seen ${ago(screen.lastSeenAt, clock)}`}${isSelected ? ", chosen" : ""}`}
                    className={cn(
                      "grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 rounded-2 px-2 text-left transition-colors hover:bg-surface-2",
                      d.row,
                      FOCUS_RING,
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-2 border border-hairline bg-surface-0",
                        screen.lastSeenAt === null
                          ? "text-ink-3"
                          : "text-ink-2",
                      )}
                    >
                      <Tv aria-hidden className="size-3.5" />
                    </span>
                    <span className="flex min-w-0 flex-col @min-[30rem]:flex-row @min-[30rem]:items-baseline @min-[30rem]:gap-2">
                      <span className="truncate text-[13px] font-medium">
                        {screen.name}
                      </span>
                      <span className="truncate text-[11px] text-ink-3">
                        {screen.location ? `${screen.location} · ` : ""}
                        {screen.lastSeenAt === null ? (
                          <span className="text-warn">never checked in</span>
                        ) : (
                          `seen ${ago(screen.lastSeenAt, clock)}`
                        )}
                        <span className="hidden @min-[40rem]:inline">
                          {" "}
                          · paired {ago(screen.pairedAt, clock)}
                        </span>
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 pr-1">
                    <AnimatePresence initial={false} mode="wait">
                      {armed ? (
                        <motion.div
                          key="confirm"
                          className="flex items-center gap-1"
                          initial={{
                            opacity: 0,
                            x: motionSafe ? distances.step : 0,
                          }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.snap,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: durations.fast }
                          }
                        >
                          <span className="hidden text-[11px] text-danger @min-[30rem]:inline">
                            Unpair?
                          </span>
                          <button
                            ref={(node) => {
                              if (node)
                                unpairNodes.current.set(screen.id, node);
                              else unpairNodes.current.delete(screen.id);
                            }}
                            type="button"
                            tabIndex={activeId === screen.id ? 0 : -1}
                            onClick={() => unpair(screen)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                disarm();
                                rowNodes.current.get(screen.id)?.focus();
                              }
                            }}
                            aria-label={`Confirm, unpair ${screen.name}`}
                            className={cn(
                              "inline-flex h-7 items-center gap-1 rounded-2 bg-danger px-2 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
                              FOCUS_RING,
                            )}
                          >
                            <Check aria-hidden className="size-3" />
                            Unpair
                          </button>
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => {
                              disarm();
                              rowNodes.current.get(screen.id)?.focus();
                            }}
                            aria-label={`Keep ${screen.name}`}
                            className={cn(
                              "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                              FOCUS_RING,
                            )}
                          >
                            <X aria-hidden className="size-3.5" />
                          </button>
                        </motion.div>
                      ) : (
                        <motion.button
                          key="unpair"
                          ref={(node) => {
                            if (node) unpairNodes.current.set(screen.id, node);
                            else unpairNodes.current.delete(screen.id);
                          }}
                          type="button"
                          tabIndex={activeId === screen.id ? 0 : -1}
                          aria-disabled={inert || undefined}
                          aria-label={`Unpair ${screen.name}`}
                          onClick={() => pressUnpair(screen)}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{ duration: durations.fast }}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-[11px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger",
                            inert && "cursor-not-allowed",
                            FOCUS_RING,
                          )}
                        >
                          <MonitorOff aria-hidden className="size-3.5" />
                          <span className="hidden @min-[24rem]:inline">
                            Unpair
                          </span>
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--sp-accent" as string]: accentVar,
        ["--sp-face" as string]: `color-mix(in oklab, ${accentVar} 9%, black)`,
        ["--sp-glyph" as string]: `color-mix(in oklab, ${accentVar} 14%, white)`,
        ["--sp-dim" as string]: "color-mix(in oklab, white 55%, transparent)",
      }}
    >
      <p id={hintId} className="sr-only">
        Type the six characters; Enter pairs. In the paired list, arrows move,
        Enter chooses, Delete unpairs after a second Delete, Escape keeps.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Tv aria-hidden className="size-4 shrink-0 text-ink-2" />
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        {ready ? (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {paired
              ? "Paired"
              : phase === "checking"
                ? "Checking"
                : `Code ${code}`}
          </span>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className={cn("flex flex-col", d.pad, d.gap)}>
          <div
            className={cn(
              "grid grid-cols-1 items-start @min-[40rem]:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]",
              d.gap,
            )}
          >
            {screenPane}
            {phonePane}
          </div>
          {pairedList}
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
