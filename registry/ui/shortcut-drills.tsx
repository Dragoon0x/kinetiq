"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import type { AnimationPlaybackControls } from "motion/react";
import {
  Eye,
  ListRestart,
  RotateCcw,
  SkipForward,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

/** One shortcut to practise. */
export type ShortcutDrill = {
  id: string;
  /** What the shortcut does, said as an instruction: "Open the command bar". */
  action: string;
  /** One line on where or why, under the action. */
  detail?: string;
  /**
   * The chord: any of the modifiers "Mod" (⌘ or Ctrl, either is accepted),
   * "Shift", "Alt", "Control", "Meta", plus one key as a KeyboardEvent.code
   * ("KeyK", "Enter", "Slash"). Tab and Escape are left to the page.
   */
  keys: string[];
};

/** First try, after a miss or a hint, or skipped. */
export type ShortcutResult = "clean" | "hinted" | "skipped";
export type ShortcutResults = Record<string, ShortcutResult>;

export type ShortcutDrillsSummary = {
  total: number;
  clean: number;
  hinted: number;
  skipped: number;
  results: ShortcutResults;
};

export type ShortcutAttempt = {
  drill: ShortcutDrill;
  /** What was pressed, in the same vocabulary as `ShortcutDrill.keys`. */
  keys: string[];
  correct: boolean;
};

export type ShortcutKeyboardLayout = "command" | "control" | "split";
export type ShortcutKeycapStyle = "sculpted" | "flat" | "outline";
export type ShortcutAccent = "cobalt" | "signal" | "amber" | "graphite";
export type ShortcutDrillsStatus = "ready" | "loading" | "error";

export type ShortcutDrillsProps = {
  /** The shortcuts to practise, in order. @default defaultShortcutDrills (six Fieldline shortcuts) */
  drills?: ShortcutDrill[];
  /** Controlled results by drill id; a returning visitor's beads. */
  results?: ShortcutResults;
  /** Initial results when uncontrolled. @default {} */
  defaultResults?: ShortcutResults;
  /** Fires from the press, tap or skip that changed a result, with every result. */
  onResultsChange?: (results: ShortcutResults) => void;
  /** A run reached the summary (the whole set, or a repeat of some of it). */
  onComplete?: (summary: ShortcutDrillsSummary) => void;
  /** Skip was pressed on a drill. */
  onSkip?: (drill: ShortcutDrill, index: number) => void;
  /** Every chord pressed or tapped while a drill was asked, right or wrong. */
  onAttempt?: (attempt: ShortcutAttempt) => void;
  /** The board: ⌘ ⌥ ⌃ legends, Ctrl and Alt legends, or the ⌘ board split in two halves. @default "command" */
  keyboardLayout?: ShortcutKeyboardLayout;
  /** Tall caps with a skirt and travel, low chiclets, or line drawings. @default "sculpted" */
  keycapStyle?: ShortcutKeycapStyle;
  /** The lit caps, the beads and the hint ring: a named accent or any CSS colour. @default "cobalt" */
  accent?: ShortcutAccent | (string & {});
  /** Show the chord after a miss, or from the start (learn mode). @default "miss" */
  reveal?: "miss" | "always";
  /** Milliseconds between a correct press and the next drill. @default 650 */
  advanceDelay?: number;
  /** The caps answer taps: modifiers latch, a key commits the chord. @default true */
  tapThrough?: boolean;
  /** The heading. @default "Fieldline shortcuts" */
  title?: string;
  /** Whether the drills have arrived. @default "ready" */
  status?: ShortcutDrillsStatus;
  /** "Try again" was pressed after the drills failed to load. */
  onRetry?: () => void;
  /** Tick on every press. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                  Defaults                                */
/* ----------------------------------------------------------------------- */

/** The six shortcuts a new Fieldline member uses in the first hour. */
export const defaultShortcutDrills: ShortcutDrill[] = [
  {
    id: "command-bar",
    action: "Open the command bar",
    detail: "Jump to any project, person or setting.",
    keys: ["Mod", "KeyK"],
  },
  {
    id: "new-task",
    action: "Create a task",
    detail: "Starts a task in the list you are looking at.",
    keys: ["KeyC"],
  },
  {
    id: "assign-me",
    action: "Assign it to yourself",
    detail: "Puts your name on the task under the cursor.",
    keys: ["KeyI"],
  },
  {
    id: "due-date",
    action: "Set a due date",
    detail: "Opens the date field without leaving the keys.",
    keys: ["Shift", "KeyD"],
  },
  {
    id: "mark-done",
    action: "Mark it done",
    detail: "Closes the task and moves on to the next one.",
    keys: ["Mod", "Enter"],
  },
  {
    id: "all-shortcuts",
    action: "Show every shortcut",
    detail: "The full list, grouped by where you are.",
    keys: ["Shift", "Slash"],
  },
];

const NO_RESULTS: ShortcutResults = {};

/* ----------------------------------------------------------------------- */
/*                                 The board                                */
/* ----------------------------------------------------------------------- */

type ModName = "shift" | "meta" | "ctrl" | "alt";

type Cap = {
  id: string;
  /** The KeyboardEvent.code it mirrors. */
  code: string;
  label: string;
  /** Its accessible name. */
  name: string;
  /** Position and size in key units. */
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  mod?: ModName | "fn";
  /** A word legend, set smaller than a glyph. */
  word?: boolean;
};

type Spec = Omit<Cap, "id" | "x" | "y" | "w" | "h" | "row"> & {
  id?: string;
  w?: number;
};

type Board = { caps: Cap[]; rows: Cap[][]; width: number; height: number };

const letters = (s: string): Spec[] =>
  s.split("").map((c) => ({ code: `Key${c}`, label: c, name: c }));

function upperRows(control: boolean): Spec[][] {
  const shift = (code: string, w: number): Spec => ({
    code,
    label: control ? "Shift" : "⇧",
    name: "Shift",
    w,
    mod: "shift",
    word: control,
  });
  return [
    [
      { code: "Backquote", label: "`", name: "Backquote" },
      ..."1234567890"
        .split("")
        .map((d): Spec => ({ code: `Digit${d}`, label: d, name: d })),
      { code: "Minus", label: "-", name: "Minus" },
      { code: "Equal", label: "=", name: "Equals" },
      {
        code: "Backspace",
        label: "⌫",
        name: control ? "Backspace" : "Delete",
        w: 2,
      },
    ],
    [
      {
        code: "Tab",
        label: control ? "Tab" : "⇥",
        name: "Tab",
        w: 1.5,
        word: control,
      },
      ...letters("QWERTYUIOP"),
      { code: "BracketLeft", label: "[", name: "Left bracket" },
      { code: "BracketRight", label: "]", name: "Right bracket" },
      { code: "Backslash", label: "\\", name: "Backslash", w: 1.5 },
    ],
    [
      {
        code: "CapsLock",
        label: control ? "Caps" : "⇪",
        name: "Caps Lock",
        w: 1.75,
        word: control,
      },
      ...letters("ASDFGHJKL"),
      { code: "Semicolon", label: ";", name: "Semicolon" },
      { code: "Quote", label: "'", name: "Quote" },
      {
        code: "Enter",
        label: control ? "Enter" : "return",
        name: control ? "Enter" : "Return",
        w: 2.25,
        word: true,
      },
    ],
    [
      shift("ShiftLeft", 2.25),
      ...letters("ZXCVBNM"),
      { code: "Comma", label: ",", name: "Comma" },
      { code: "Period", label: ".", name: "Period" },
      { code: "Slash", label: "/", name: "Slash" },
      shift("ShiftRight", 2.75),
    ],
  ];
}

const GAP = "Gap";

const COMMAND_BOTTOM: Spec[] = [
  { code: "Fn", label: "fn", name: "Function", mod: "fn", word: true },
  { code: "ControlLeft", label: "⌃", name: "Control", mod: "ctrl" },
  { code: "AltLeft", label: "⌥", name: "Option", mod: "alt" },
  { code: "MetaLeft", label: "⌘", name: "Command", w: 1.25, mod: "meta" },
  { code: "Space", label: "", name: "Space", w: 5.5 },
  { code: "MetaRight", label: "⌘", name: "Command", w: 1.25, mod: "meta" },
  { code: "AltRight", label: "⌥", name: "Option", mod: "alt" },
];

const CONTROL_BOTTOM: Spec[] = [
  {
    code: "ControlLeft",
    label: "Ctrl",
    name: "Control",
    w: 1.25,
    mod: "ctrl",
    word: true,
  },
  { code: "MetaLeft", label: "◇", name: "Super", w: 1.25, mod: "meta" },
  {
    code: "AltLeft",
    label: "Alt",
    name: "Alt",
    w: 1.25,
    mod: "alt",
    word: true,
  },
  { code: "Space", label: "", name: "Space", w: 5.75 },
  {
    code: "AltRight",
    label: "Alt",
    name: "Alt",
    w: 1.25,
    mod: "alt",
    word: true,
  },
  {
    code: "ControlRight",
    label: "Ctrl",
    name: "Control",
    w: 1.25,
    mod: "ctrl",
    word: true,
  },
];

const SPLIT_BOTTOM: Spec[] = [
  { code: "Fn", label: "fn", name: "Function", mod: "fn", word: true },
  { code: "ControlLeft", label: "⌃", name: "Control", mod: "ctrl" },
  { code: "AltLeft", label: "⌥", name: "Option", mod: "alt" },
  { code: "MetaLeft", label: "⌘", name: "Command", w: 1.25, mod: "meta" },
  { id: "Space-l", code: "Space", label: "", name: "Space", w: 2.75 },
  { code: GAP, label: "", name: "", w: 1 },
  { id: "Space-r", code: "Space", label: "", name: "Space", w: 2.75 },
  { code: "MetaRight", label: "⌘", name: "Command", w: 1.25, mod: "meta" },
  { code: "AltRight", label: "⌥", name: "Option", mod: "alt" },
];

/**
 * The keyboard in key units: 15 wide (16 split) by 5 rows. Positions are
 * percentages of the board, so it scales to any width with no measuring and
 * renders identically on the server.
 */
function buildBoard(layout: ShortcutKeyboardLayout): Board {
  const control = layout === "control";
  const split = layout === "split";
  const caps: Cap[] = [];
  const add = (s: Spec, row: number, x: number, y = row, h = 1) => {
    caps.push({
      id: s.id ?? s.code,
      code: s.code,
      label: s.label,
      name: s.name,
      x,
      y,
      w: s.w ?? 1,
      h,
      row,
      mod: s.mod,
      word: s.word,
    });
  };
  upperRows(control).forEach((specs, row) => {
    let x = 0;
    for (const s of specs) {
      const w = s.w ?? 1;
      // The split falls between 6/7, T/Y, G/H and B/N, as on split boards.
      add(s, row, x + (split && x + w / 2 > 6.8 ? 1 : 0));
      x += w;
    }
  });
  let x = 0;
  for (const s of control
    ? CONTROL_BOTTOM
    : split
      ? SPLIT_BOTTOM
      : COMMAND_BOTTOM) {
    if (s.code !== GAP) add(s, 4, x);
    x += s.w ?? 1;
  }
  add({ code: "ArrowLeft", label: "←", name: "Left arrow" }, 4, x);
  add({ code: "ArrowUp", label: "↑", name: "Up arrow" }, 4, x + 1, 4, 0.5);
  add(
    { code: "ArrowDown", label: "↓", name: "Down arrow" },
    4,
    x + 1,
    4.5,
    0.5,
  );
  add({ code: "ArrowRight", label: "→", name: "Right arrow" }, 4, x + 2);
  const rows = [0, 1, 2, 3, 4].map((r) =>
    caps.filter((c) => c.row === r).sort((a, b) => a.x - b.x || a.y - b.y),
  );
  return { caps, rows, width: split ? 16 : 15, height: 5 };
}

const BOARDS: Record<ShortcutKeyboardLayout, Board> = {
  command: buildBoard("command"),
  control: buildBoard("control"),
  split: buildBoard("split"),
};

/* ----------------------------------------------------------------------- */
/*                                   Chords                                 */
/* ----------------------------------------------------------------------- */

const MODIFIERS = new Set(["Mod", "Shift", "Alt", "Control", "Meta"]);
const MOD_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
  "CapsLock",
  "Fn",
]);

type Got = {
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  code: string;
  key: string;
};

const mainOf = (keys: string[]) => keys.find((k) => !MODIFIERS.has(k));

function matches(keys: string[], got: Got): boolean {
  const main = mainOf(keys);
  if (!main) return false;
  // A letter is matched by what it types as well as where it sits, so a
  // board in another letter layout still answers by the legend it shows.
  const letter = /^Key([A-Z])$/.exec(main)?.[1];
  const same =
    got.code === main ||
    (letter !== undefined &&
      got.key.length === 1 &&
      got.key.toUpperCase() === letter);
  if (!same) return false;
  if (got.shift !== keys.includes("Shift")) return false;
  if (got.alt !== keys.includes("Alt")) return false;
  if (keys.includes("Mod")) return got.meta || got.ctrl;
  return (
    got.meta === keys.includes("Meta") && got.ctrl === keys.includes("Control")
  );
}

const gotKeys = (got: Got): string[] => [
  ...(got.ctrl ? ["Control"] : []),
  ...(got.alt ? ["Alt"] : []),
  ...(got.shift ? ["Shift"] : []),
  ...(got.meta ? ["Meta"] : []),
  got.code,
];

/** Codes for keys that report none (some on-screen keyboards). */
function codeOf(event: React.KeyboardEvent): string {
  if (event.code) return event.code;
  const k = event.key;
  if (/^[a-z]$/i.test(k)) return `Key${k.toUpperCase()}`;
  if (/^[0-9]$/.test(k)) return `Digit${k}`;
  if (k === "/" || k === "?") return "Slash";
  if (k === " ") return "Space";
  return k;
}

function legendOf(key: string, board: Board, control: boolean): string {
  switch (key) {
    case "Mod":
      return control ? "Ctrl" : "⌘";
    case "Shift":
      return control ? "Shift" : "⇧";
    case "Alt":
      return control ? "Alt" : "⌥";
    case "Control":
      return control ? "Ctrl" : "⌃";
    case "Meta":
      return control ? "◇" : "⌘";
    default: {
      const cap = board.caps.find((c) => c.code === key);
      if (cap) return cap.label || cap.name;
      return key.replace(/^(Key|Digit)/, "");
    }
  }
}

function spokenOf(key: string, board: Board, control: boolean): string {
  switch (key) {
    case "Mod":
      return control ? "Control" : "Command";
    case "Alt":
      return control ? "Alt" : "Option";
    case "Meta":
      return control ? "Super" : "Command";
    case "Shift":
    case "Control":
      return key;
    default:
      return (
        board.caps.find((c) => c.code === key)?.name ??
        key.replace(/^(Key|Digit)/, "")
      );
  }
}

const MOD_CAP: Record<string, ModName> = {
  Shift: "shift",
  Alt: "alt",
  Control: "ctrl",
  Meta: "meta",
};

/** The caps a chord lights: the left of each modifier, and its key. */
function capsFor(keys: string[], board: Board, control: boolean): string[] {
  const ids: string[] = [];
  const main = mainOf(keys);
  if (main) {
    for (const c of board.caps) if (c.code === main) ids.push(c.id);
  }
  // Modifiers last, so the rise can run from the key back to them.
  for (const k of [...keys].reverse()) {
    if (!MODIFIERS.has(k)) continue;
    const mod = k === "Mod" ? (control ? "ctrl" : "meta") : MOD_CAP[k];
    const cap = board.caps.find((c) => c.mod === mod);
    if (cap) ids.push(cap.id);
  }
  return ids;
}

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<ShortcutAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => `${Number(v.toFixed(3))}%`;

const summaryOf = (
  drills: ShortcutDrill[],
  results: ShortcutResults,
): ShortcutDrillsSummary => {
  let clean = 0;
  let hinted = 0;
  let skipped = 0;
  for (const d of drills) {
    const r = results[d.id];
    if (r === "clean") clean += 1;
    else if (r === "hinted") hinted += 1;
    else if (r === "skipped") skipped += 1;
  }
  return { total: drills.length, clean, hinted, skipped, results };
};

const countLine = (s: ShortcutDrillsSummary) =>
  [
    `${s.clean} first try`,
    s.hinted > 0 ? `${s.hinted} after a hint` : null,
    s.skipped > 0 ? `${s.skipped} skipped` : null,
  ]
    .filter(Boolean)
    .join(" · ");

/** A touch's pointerdown is not yet a user activation: stay silent until one. */
const activated = () =>
  typeof navigator === "undefined" ||
  (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation?.hasBeenActive !== false;

const subscribeCoarse = (onChange: () => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  const list = window.matchMedia("(pointer: coarse)");
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};
const coarseNow = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const coarseServer = () => false;

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

const TRAVEL: Record<ShortcutKeycapStyle, string> = {
  sculpted: "13%",
  flat: "6%",
  outline: "0%",
};

type CapState = {
  down: boolean;
  lit: boolean;
  hint: boolean;
  latched: boolean;
  rise: number;
};

function Keycap({
  cap,
  board,
  look,
  state,
  hintKey,
  motionSafe,
  interactive,
  tabbable,
  register,
  onTap,
  onKeyDown,
  onPress,
  onRelease,
  onFocusCap,
}: {
  cap: Cap;
  board: Board;
  look: ShortcutKeycapStyle;
  state: CapState;
  hintKey: number;
  motionSafe: boolean;
  interactive: boolean;
  tabbable: boolean;
  register: (id: string, node: HTMLElement | null) => void;
  onTap: (cap: Cap, event: React.MouseEvent) => void;
  onKeyDown: (cap: Cap, event: React.KeyboardEvent) => void;
  onPress: (cap: Cap) => void;
  onRelease: () => void;
  onFocusCap: (id: string) => void;
}) {
  const { down, lit, hint, latched } = state;
  const glow = lit || latched;
  const face = cn(
    "absolute flex items-center justify-center leading-none font-medium transition-colors duration-150",
    look === "sculpted" &&
      "inset-x-[0.45cqw] top-[0.25cqw] bottom-[1.05cqw] rounded-[0.8cqw] border border-hairline bg-linear-to-b from-card to-[color-mix(in_oklab,var(--card)_92%,var(--ink))]",
    look === "flat" &&
      "inset-x-0 top-0 bottom-[0.4cqw] rounded-[0.7cqw] border border-hairline-strong bg-surface-2",
    look === "outline" &&
      "inset-0 rounded-[0.8cqw] border border-hairline-strong bg-transparent",
    glow &&
      look !== "outline" &&
      "border-[color-mix(in_oklab,var(--sd-accent)_55%,transparent)] from-[color-mix(in_oklab,var(--sd-pigment)_26%,var(--card))] to-[color-mix(in_oklab,var(--sd-pigment)_34%,var(--card))] bg-[color-mix(in_oklab,var(--sd-pigment)_26%,var(--card))]",
    glow &&
      look === "outline" &&
      "border-(--sd-accent) bg-[color-mix(in_oklab,var(--sd-pigment)_12%,transparent)]",
    glow || hint
      ? "text-(--sd-accent)"
      : down
        ? "text-foreground"
        : "text-ink-2",
  );
  const travel = TRAVEL[look];
  const boxStyle: React.CSSProperties = {
    left: pct((cap.x / board.width) * 100),
    top: pct((cap.y / board.height) * 100),
    width: pct((cap.w / board.width) * 100),
    height: pct((cap.h / board.height) * 100),
  };
  const content = (
    <span className="relative block size-full">
      {look === "sculpted" ? (
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-[0.9cqw] transition-colors duration-150",
            glow
              ? "bg-[color-mix(in_oklab,var(--sd-pigment)_42%,var(--ink-3))]"
              : "bg-[color-mix(in_oklab,var(--ink)_15%,var(--card))]",
          )}
        />
      ) : look === "flat" ? (
        <motion.span
          aria-hidden
          className="absolute inset-x-[0.2cqw] top-[0.6cqw] bottom-0 rounded-[0.7cqw] bg-[color-mix(in_oklab,var(--ink)_12%,transparent)]"
          initial={false}
          animate={{ opacity: down ? 0.35 : 1 }}
          transition={{ duration: durations.blink }}
        />
      ) : null}
      <motion.span
        aria-hidden
        className={face}
        initial={false}
        animate={{
          y: motionSafe && down ? travel : "0%",
          scale: motionSafe && down && look === "outline" ? 0.9 : 1,
        }}
        transition={
          !motionSafe
            ? { duration: 0 }
            : down
              ? springs.flick
              : { ...springs.snap, delay: state.rise }
        }
        style={{
          fontSize: cap.word
            ? "clamp(6px, 1.45cqw, 10px)"
            : "clamp(7px, 2.35cqw, 13px)",
        }}
      >
        {cap.label}
        {hint ? (
          <motion.span
            key={hintKey}
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-[inherit] ring-[1.5px] ring-(--sd-accent)"
            initial={{ opacity: motionSafe ? 0 : 0.85 }}
            animate={
              motionSafe ? { opacity: [0, 1, 0.35, 1, 0.8] } : { opacity: 0.85 }
            }
            transition={
              motionSafe
                ? { duration: 1.3, ease: easings.move }
                : { duration: 0 }
            }
          />
        ) : null}
      </motion.span>
    </span>
  );
  if (!interactive) {
    return (
      <span
        aria-hidden
        data-sd-cap={cap.id}
        className="absolute block p-[0.3cqw] select-none"
        style={boxStyle}
      >
        {content}
      </span>
    );
  }
  return (
    <button
      ref={(node) => register(cap.id, node)}
      type="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={cap.name}
      aria-pressed={cap.mod && cap.mod !== "fn" ? latched : undefined}
      data-sd-cap={cap.id}
      onClick={(event) => onTap(cap, event)}
      onKeyDown={(event) => onKeyDown(cap, event)}
      onFocus={() => onFocusCap(cap.id)}
      onPointerDown={(event) => {
        if (event.pointerType !== "mouse" || event.button === 0) onPress(cap);
      }}
      onPointerUp={onRelease}
      onPointerLeave={onRelease}
      onPointerCancel={onRelease}
      className={cn(
        "absolute block cursor-pointer touch-manipulation p-[0.3cqw] select-none",
        FOCUS_RING,
        "focus-visible:outline-offset-0",
      )}
      style={boxStyle}
    >
      {content}
    </button>
  );
}

function Kbd({ children, lit }: { children: React.ReactNode; lit?: boolean }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 shrink-0 items-center justify-center rounded-1 border px-1.5 font-mono text-[11px] leading-none font-medium",
        lit
          ? "border-[color-mix(in_oklab,var(--sd-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--sd-pigment)_14%,var(--card))] text-(--sd-accent)"
          : "border-hairline-strong bg-surface-2 text-ink-2",
      )}
    >
      {children}
    </kbd>
  );
}

/** A number whose digits roll up or down on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(value);
  return (
    <span
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${Math.max(1, text.length)}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="inline-block"
          style={{ lineHeight: "16px" }}
          initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -distances.step : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Bead({
  result,
  current,
  pending,
  landKey,
  motionSafe,
}: {
  result: ShortcutResult | undefined;
  current: boolean;
  pending: boolean;
  landKey: string;
  motionSafe: boolean;
}) {
  const shown = pending ? undefined : result;
  return (
    <span
      className={cn(
        "relative flex size-3.5 items-center justify-center rounded-full transition-shadow",
        current &&
          "shadow-[0_0_0_1.5px_color-mix(in_oklab,var(--sd-accent)_45%,transparent)]",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={`${shown ?? "none"}-${landKey}`}
          className="absolute inset-0 flex items-center justify-center"
          initial={
            motionSafe && shown ? { scale: 0.3, opacity: 0 } : { opacity: 0 }
          }
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe && shown
              ? { scale: springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {shown === "clean" ? (
            <span className="size-2.5 rounded-full bg-(--sd-pigment)" />
          ) : shown === "hinted" ? (
            <span className="flex size-2.5 items-center justify-center rounded-full border-[1.5px] border-(--sd-pigment)">
              <span className="size-1 rounded-full bg-(--sd-pigment)" />
            </span>
          ) : shown === "skipped" ? (
            <span className="h-[2px] w-2.5 rounded-full bg-ink-3" />
          ) : (
            <span className="size-2.5 rounded-full border border-hairline-strong" />
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

type Run =
  | { kind: "summary" }
  | { kind: "full" | "repeat"; order: number[]; at: number };

type Ask = {
  n: number;
  /** The chord text of the last wrong press, or null. */
  missed: string | null;
  misses: number;
  shown: boolean;
  phase: "ask" | "sunk" | "risen";
};

const freshAsk = (n: number): Ask => ({
  n,
  missed: null,
  misses: 0,
  shown: false,
  phase: "ask",
});

function firstRun(drills: ShortcutDrill[], results: ShortcutResults): Run {
  if (drills.length === 0) return { kind: "summary" };
  const open = drills.findIndex((d) => !results[d.id]);
  if (open === -1) return { kind: "summary" };
  return { kind: "full", order: drills.map((_, i) => i), at: open };
}

/**
 * A keyboard practice. The screen names an action; you press its shortcut and
 * the matching caps go down on a small keyboard drawn beside it — every real
 * key you press is mirrored, falling on flick and coming back on snap with one
 * crisp overshoot. A correct chord bottoms out together and lights, the caps
 * rise again key first and modifiers after, and a bead lifts off the key and
 * flies on an arc into the streak rail on glide, landing on recoil. A wrong one
 * shakes nothing: the right chord's caps take a breathing ring and a caption
 * says what was pressed and what to press. Every drill can be skipped, and the
 * set ends on a summary where any drill can be repeated.
 *
 * The prompt is a focusable practice pad (`role="application"`, so a screen
 * reader passes keys through): Tab and Escape still leave, everything else is
 * an attempt. The board is a roving group of real buttons for touch and
 * pointer: modifiers latch, a key commits the chord. Under reduced motion caps
 * change colour instead of travelling, the bead fades into its slot, and every
 * result, count and caption still updates.
 */
export function ShortcutDrills({
  drills = defaultShortcutDrills,
  results,
  defaultResults,
  onResultsChange,
  onComplete,
  onSkip,
  onAttempt,
  keyboardLayout = "command",
  keycapStyle = "sculpted",
  accent = "cobalt",
  reveal = "miss",
  advanceDelay = 650,
  tapThrough = true,
  title = "Fieldline shortcuts",
  status = "ready",
  onRetry,
  sound = false,
  disabled = false,
  className,
}: ShortcutDrillsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const actionId = `${uid}-action`;
  const hintId = `${uid}-hint`;
  const board = BOARDS[keyboardLayout] ?? BOARDS.command;
  const control = keyboardLayout === "control";
  const color =
    accent in ACCENTS ? ACCENTS[accent as ShortcutAccent] : (accent as string);
  const ready = status === "ready";
  const coarse = React.useSyncExternalStore(
    subscribeCoarse,
    coarseNow,
    coarseServer,
  );

  const [own, setOwn] = React.useState<ShortcutResults>(
    () => defaultResults ?? NO_RESULTS,
  );
  const done = results ?? own;

  const drillsKey = drills.map((d) => d.id).join("|");
  const [seenKey, setSeenKey] = React.useState(drillsKey);
  const [run, setRun] = React.useState<Run>(() =>
    firstRun(drills, results ?? defaultResults ?? NO_RESULTS),
  );
  const [ask, setAsk] = React.useState<Ask>(() => freshAsk(0));
  if (seenKey !== drillsKey) {
    // A new set of drills starts over from its first open drill.
    setSeenKey(drillsKey);
    setRun(firstRun(drills, done));
    setAsk(freshAsk(ask.n + 1));
  }

  const [held, setHeld] = React.useState<ReadonlySet<string>>(() => new Set());
  const [latched, setLatched] = React.useState<ReadonlySet<ModName>>(
    () => new Set(),
  );
  const [tapDown, setTapDown] = React.useState<string | null>(null);
  const [streak, setStreak] = React.useState(0);
  const [listening, setListening] = React.useState(false);
  const [roving, setRoving] = React.useState("KeyK");
  const [flying, setFlying] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState({ id: "", n: 0 });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const capNodes = React.useRef(new Map<string, HTMLElement>());
  const slotNodes = React.useRef(new Map<string, HTMLElement>());
  const timers = React.useRef(new Set<number>());
  const flight = React.useRef<AnimationPlaybackControls | null>(null);
  const focusPad = React.useRef(false);
  const focusSummary = React.useRef(false);
  const latest = React.useRef<ShortcutResults>(done);
  const api = React.useRef({ settle: () => {}, advance: () => {} });
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);

  const current =
    run.kind === "summary" ? undefined : drills[run.order[run.at] ?? -1];
  const currentIndex = run.kind === "summary" ? -1 : (run.order[run.at] ?? -1);
  const inSummary = run.kind === "summary" || !current;
  const showChord =
    !!current &&
    ask.phase === "ask" &&
    (reveal === "always" || ask.missed !== null || ask.shown);
  const target = current ? capsFor(current.keys, board, control) : [];
  const chordLegend = current
    ? current.keys.map((k) => legendOf(k, board, control))
    : [];
  const chordSpoken = current
    ? current.keys.map((k) => spokenOf(k, board, control)).join(" ")
    : "";

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current.clear();
  };

  React.useEffect(() => {
    latest.current = done;
  });

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      flight.current?.stop();
      flight.current = null;
    };
  }, []);

  const writeResults = (next: ShortcutResults) => {
    latest.current = next;
    if (results === undefined) setOwn(next);
    onResultsChange?.(next);
  };

  const nextDrill = () => {
    if (run.kind === "summary") return undefined;
    const i = run.order[run.at + 1];
    return i === undefined ? undefined : drills[i];
  };

  const enterSummary = () => {
    const r = latest.current;
    const s = summaryOf(drills, r);
    if (rootRef.current?.contains(document.activeElement)) {
      focusSummary.current = true;
    }
    setRun({ kind: "summary" });
    setAsk(freshAsk(ask.n + 1));
    setHeld(new Set());
    setLatched(new Set());
    say(`Set done. ${countLine(s)}.`);
    onComplete?.(s);
  };

  const advance = () => {
    if (run.kind === "summary") return;
    clearTimers();
    setHeld(new Set());
    setLatched(new Set());
    const at = run.at + 1;
    if (at < run.order.length) {
      setRun({ ...run, at });
      setAsk(freshAsk(ask.n + 1));
    } else {
      enterSummary();
    }
  };

  // The rise after a correct press: the caps let go key first.
  const settle = () =>
    setAsk((a) => (a.phase === "sunk" ? { ...a, phase: "risen" } : a));

  React.useEffect(() => {
    api.current = { settle, advance };
  });

  const launchBead = (drillId: string, fromCap: string | undefined) => {
    if (!motionSafe) return;
    const root = rootRef.current;
    const from = fromCap ? capNodes.current.get(fromCap) : undefined;
    const to = slotNodes.current.get(drillId);
    if (!root || !from || !to) return;
    const rr = root.getBoundingClientRect();
    const fr = from.getBoundingClientRect();
    const tr = to.getBoundingClientRect();
    const x0 = fr.left + fr.width / 2 - rr.left;
    const y0 = fr.top + fr.height / 2 - rr.top;
    const x1 = tr.left + tr.width / 2 - rr.left;
    const y1 = tr.top + tr.height / 2 - rr.top;
    // The arc lifts above the straight line, never above the surface's top.
    const lift = Math.max(0, Math.min(40, Math.min(y0, y1) - 8));
    flight.current?.stop();
    fx.jump(r2(x0));
    fy.jump(r2(y0));
    setFlying(drillId);
    // A plain number drives the flight: a motion value bound to an element
    // that has only just mounted can sit idle when animated directly.
    flight.current = animate(0, 1, {
      ...springs.glide,
      onUpdate: (t) => {
        fx.set(r2(x0 + (x1 - x0) * t));
        fy.set(
          r2(y0 + (y1 - y0) * t - lift * Math.sin(Math.PI * Math.min(1, t))),
        );
      },
      onComplete: () => {
        flight.current = null;
        setFlying(null);
        setLanded((l) => ({ id: drillId, n: l.n + 1 }));
        audio.play("tick", { pitch: 1.8, gain: 0.4 });
      },
    });
  };

  const chordText = (got: Got) =>
    gotKeys(got)
      .map((k) => legendOf(k, board, control))
      .join(" ");
  const chordSpeech = (got: Got) =>
    gotKeys(got)
      .map((k) => spokenOf(k, board, control))
      .join(" ");

  const answer = (got: Got) => {
    if (!current || ask.phase !== "ask" || disabled || !ready) return;
    const ok = matches(current.keys, got);
    onAttempt?.({ drill: current, keys: gotKeys(got), correct: ok });
    if (ok) {
      const result: ShortcutResult =
        ask.misses > 0 || ask.shown ? "hinted" : "clean";
      writeResults({ ...latest.current, [current.id]: result });
      setAsk((a) => ({ ...a, phase: "sunk" }));
      setStreak((s) => (result === "clean" ? s + 1 : 0));
      audio.play("tick", { pitch: 1.5, gain: 0.5 });
      launchBead(current.id, target[0]);
      const following = nextDrill();
      say(
        following
          ? `Correct. Next: ${following.action}.`
          : "Correct. That was the last one.",
      );
      later(() => api.current.settle(), 240);
      later(() => api.current.advance(), Math.max(320, advanceDelay));
    } else {
      setAsk((a) => ({ ...a, missed: chordText(got), misses: a.misses + 1 }));
      setStreak(0);
      audio.play("tick", { pitch: 0.7, gain: 0.4 });
      say(
        `Not quite. You pressed ${chordSpeech(got)}. ${current.action} is ${chordSpoken}.`,
      );
    }
  };

  const skip = () => {
    if (!current || ask.phase !== "ask" || disabled) return;
    writeResults({ ...latest.current, [current.id]: "skipped" });
    setStreak(0);
    onSkip?.(current, currentIndex);
    const following = nextDrill();
    say(following ? `Skipped. Next: ${following.action}.` : "Skipped.");
    advance();
  };

  const showKeys = () => {
    if (!current || ask.phase !== "ask" || disabled) return;
    setAsk((a) => ({ ...a, shown: true }));
    say(`${current.action} is ${chordSpoken}.`);
  };

  const startRun = (order: number[], kind: "full" | "repeat") => {
    if (order.length === 0) return;
    clearTimers();
    focusPad.current = true;
    setRun({ kind, order, at: 0 });
    setAsk(freshAsk(ask.n + 1));
    const first = drills[order[0] ?? 0];
    if (first)
      say(`${kind === "repeat" ? "Again" : "First"}: ${first.action}.`);
  };

  const repeatOne = (index: number) => startRun([index], "repeat");
  const missed = drills
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => done[d.id] === "hinted" || done[d.id] === "skipped")
    .map(({ i }) => i);
  const startOver = () => {
    writeResults({});
    setStreak(0);
    startRun(
      drills.map((_, i) => i),
      "full",
    );
  };

  /* ------------------------------- keys -------------------------------- */

  const capOfCode = (code: string) => board.caps.find((c) => c.code === code);

  const practiseKey = (event: React.KeyboardEvent) => {
    if (event.key === "Tab" || event.key === "Escape") return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (disabled || !ready || !current) return;
    const code = codeOf(event);
    if (!event.repeat) {
      setHeld((h) => new Set(h).add(code));
      audio.play("tick", {
        pitch: r2(1.3 - (capOfCode(code)?.row ?? 2) * 0.08),
        gain: 0.3,
      });
    }
    if (MOD_CODES.has(code) || event.repeat) return;
    answer({
      meta: event.metaKey,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      shift: event.shiftKey,
      code,
      key: event.key,
    });
  };

  const releaseKey = (event: React.KeyboardEvent) => {
    const code = codeOf(event);
    // While ⌘ is held other keys report no keyup: letting go of it lets go
    // of everything.
    if (code === "MetaLeft" || code === "MetaRight" || event.key === "Meta") {
      setHeld(new Set());
      return;
    }
    setHeld((h) => {
      if (!h.has(code)) return h;
      const n = new Set(h);
      n.delete(code);
      return n;
    });
  };

  const tap = (cap: Cap, event: React.MouseEvent) => {
    if (!tapThrough || disabled || !ready || !current) return;
    if (event.detail === 0) {
      // A keyboard click on a cap: show the press for a beat.
      setTapDown(cap.id);
      later(() => setTapDown((d) => (d === cap.id ? null : d)), 140);
      audio.play("tick", { pitch: r2(1.3 - cap.row * 0.08), gain: 0.3 });
    }
    if (cap.mod === "fn" || cap.code === "CapsLock") return;
    if (cap.mod) {
      const mod = cap.mod;
      setLatched((l) => {
        const n = new Set(l);
        if (n.has(mod)) n.delete(mod);
        else n.add(mod);
        return n;
      });
      return;
    }
    const got: Got = {
      meta: latched.has("meta") || event.metaKey,
      ctrl: latched.has("ctrl") || event.ctrlKey,
      alt: latched.has("alt") || event.altKey,
      shift: latched.has("shift") || event.shiftKey,
      code: cap.code,
      key: "",
    };
    setLatched(new Set());
    answer(got);
  };

  const pressCap = (cap: Cap) => {
    if (!tapThrough || disabled || !ready) return;
    setTapDown(cap.id);
    if (activated()) {
      audio.play("tick", { pitch: r2(1.3 - cap.row * 0.08), gain: 0.3 });
    }
  };
  const releaseCap = () => setTapDown(null);

  const capKeyDown = (cap: Cap, event: React.KeyboardEvent) => {
    const row = board.rows[cap.row] ?? [];
    const i = row.indexOf(cap);
    let next: Cap | undefined;
    switch (event.key) {
      case "ArrowLeft":
        next = row[i - 1];
        break;
      case "ArrowRight":
        next = row[i + 1];
        break;
      case "Home":
        next = row[0];
        break;
      case "End":
        next = row[row.length - 1];
        break;
      case "ArrowUp":
      case "ArrowDown": {
        const d = event.key === "ArrowUp" ? -1 : 1;
        const twin = row.find(
          (c) => c !== cap && c.x === cap.x && Math.sign(c.y - cap.y) === d,
        );
        const pool = twin ? [twin] : (board.rows[cap.row + d] ?? []);
        const mid = cap.x + cap.w / 2;
        next = pool.reduce<Cap | undefined>(
          (best, c) =>
            !best ||
            Math.abs(c.x + c.w / 2 - mid) < Math.abs(best.x + best.w / 2 - mid)
              ? c
              : best,
          undefined,
        );
        break;
      }
      case "Enter":
      case " ":
        // The button's own click taps the cap.
        return;
      default:
        practiseKey(event);
        return;
    }
    event.preventDefault();
    if (next) {
      setRoving(next.id);
      capNodes.current.get(next.id)?.focus();
    }
  };

  const registerCap = React.useCallback(
    (id: string, node: HTMLElement | null) => {
      if (node) capNodes.current.set(id, node);
      else capNodes.current.delete(id);
    },
    [],
  );

  const bindPad = React.useCallback((node: HTMLDivElement | null) => {
    if (node && focusPad.current) {
      focusPad.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);
  const bindSummary = React.useCallback((node: HTMLHeadingElement | null) => {
    if (node && focusSummary.current) {
      focusSummary.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);

  /* ------------------------------ render ------------------------------- */

  const heldCaps = new Set<string>();
  for (const c of board.caps) {
    if (held.has(c.code)) heldCaps.add(c.id);
    if (c.mod && c.mod !== "fn" && latched.has(c.mod)) heldCaps.add(c.id);
  }
  const lit = ask.phase !== "ask";
  const rovingId = board.caps.some((c) => c.id === roving)
    ? roving
    : (board.caps[0]?.id ?? "");
  const stateOf = (cap: Cap): CapState => {
    const t = target.indexOf(cap.id);
    const isTarget = t !== -1;
    const isLit = lit && isTarget;
    return {
      down:
        heldCaps.has(cap.id) ||
        tapDown === cap.id ||
        (isLit && ask.phase === "sunk"),
      lit: isLit,
      hint: showChord && isTarget,
      latched: !!cap.mod && cap.mod !== "fn" && latched.has(cap.mod),
      rise: isLit ? r2(Math.max(0, t) * 0.04) : 0,
    };
  };

  const summary = summaryOf(drills, done);
  const answered = drills.filter((d) => done[d.id]).length;
  const position =
    run.kind === "summary" || !current
      ? `Done · ${answered} of ${drills.length}`
      : run.kind === "repeat"
        ? `Again · ${run.at + 1} of ${run.order.length}`
        : `${currentIndex + 1} of ${drills.length}`;

  const caption = (() => {
    if (!current) return { key: "none", body: null as React.ReactNode };
    if (ask.phase !== "ask") {
      return {
        key: `ok-${ask.n}`,
        body: (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-(--sd-accent)">
            Correct
            {chordLegend.map((l, i) => (
              <Kbd key={i} lit>
                {l}
              </Kbd>
            ))}
          </span>
        ),
      };
    }
    if (ask.missed !== null) {
      return {
        key: `miss-${ask.n}-${ask.misses}`,
        body: (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span>
              That was <span className="font-mono">{ask.missed}</span>
            </span>
            <span aria-hidden className="text-ink-3">
              ·
            </span>
            <span>this one is</span>
            {chordLegend.map((l, i) => (
              <Kbd key={i} lit>
                {l}
              </Kbd>
            ))}
          </span>
        ),
      };
    }
    if (showChord) {
      return {
        key: `show-${ask.n}`,
        body: (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            Press
            {chordLegend.map((l, i) => (
              <Kbd key={i} lit>
                {l}
              </Kbd>
            ))}
          </span>
        ),
      };
    }
    return {
      key: `idle-${coarse ? "tap" : "key"}`,
      body: (
        <span className="text-ink-3">
          {coarse
            ? "Tap the keys on the board below."
            : "Press the shortcut, or tap it on the board."}
        </span>
      ),
    };
  })();

  const fade = motionSafe
    ? {
        y: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }
    : { duration: durations.fast };

  const boardView = (
    <div className="@container w-full">
      <div
        role={tapThrough && ready ? "group" : undefined}
        aria-label={
          tapThrough && ready ? "Keyboard, tap a chord to answer" : undefined
        }
        aria-hidden={tapThrough && ready ? undefined : true}
        onKeyUp={releaseKey}
        onBlur={(event) => {
          const to = event.relatedTarget;
          if (!(to instanceof Node && event.currentTarget.contains(to))) {
            setHeld(new Set());
          }
        }}
        className={cn(
          // Taller caps on a phone: the same keys, easier to hit.
          "relative [aspect-ratio:var(--sd-w)/5] w-full @max-[24rem]:[aspect-ratio:var(--sd-w)/6]",
          (!ready || disabled) && "pointer-events-none opacity-45",
        )}
        style={{ ["--sd-w" as string]: board.width }}
      >
        {board.caps.map((cap) => (
          <Keycap
            key={cap.id}
            cap={cap}
            board={board}
            look={keycapStyle}
            state={stateOf(cap)}
            hintKey={ask.misses + (ask.shown ? 100 : 0)}
            motionSafe={motionSafe}
            interactive={tapThrough && ready && !disabled}
            tabbable={cap.id === rovingId}
            register={registerCap}
            onTap={tap}
            onKeyDown={capKeyDown}
            onPress={pressCap}
            onRelease={releaseCap}
            onFocusCap={setRoving}
          />
        ))}
      </div>
    </div>
  );

  const runView = current ? (
    <div className="flex w-full max-w-[35rem] flex-col gap-4">
      <div
        ref={bindPad}
        role="application"
        aria-roledescription="shortcut practice"
        aria-labelledby={actionId}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={0}
        onKeyDown={practiseKey}
        onKeyUp={releaseKey}
        onFocus={() => setListening(true)}
        onBlur={() => {
          setListening(false);
          setHeld(new Set());
        }}
        className={cn(
          "flex flex-col gap-3 rounded-3 border bg-surface-1 px-4 py-3.5 transition-colors",
          listening
            ? "border-[color-mix(in_oklab,var(--sd-accent)_45%,var(--hairline-strong))]"
            : "cursor-pointer border-hairline",
          FOCUS_RING,
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <span className="font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase">
            {run.kind === "repeat" ? "Once more" : "Press the keys for"}
          </span>
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] transition-colors",
              listening
                ? "border-[color-mix(in_oklab,var(--sd-accent)_40%,transparent)] text-(--sd-accent)"
                : "border-hairline text-ink-3",
            )}
          >
            <motion.span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                listening ? "bg-(--sd-pigment)" : "bg-ink-3",
              )}
              initial={false}
              animate={
                listening && motionSafe
                  ? { opacity: [1, 0.35, 1] }
                  : { opacity: 1 }
              }
              transition={
                listening && motionSafe
                  ? { duration: 1.6, ease: easings.move, repeat: Infinity }
                  : { duration: durations.fast }
              }
            />
            {listening ? "Listening" : coarse ? "Tap below" : "Select to start"}
          </span>
        </div>
        <span id={actionId} className="sr-only">
          {current.action}
        </span>
        <div className="grid">
          <AnimatePresence initial={false}>
            <motion.div
              key={`${ask.n}-${current.id}`}
              aria-hidden
              className="[grid-area:1/1]"
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.nudge : 0,
                transition: exitFor(),
              }}
              transition={fade}
            >
              <p className="text-lg leading-snug font-semibold tracking-tight text-balance @min-[30rem]:text-xl">
                {current.action}
              </p>
              {current.detail ? (
                <p className="mt-1 text-[13px] text-ink-2">{current.detail}</p>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="grid text-[13px] text-ink-2">
          <AnimatePresence initial={false}>
            <motion.div
              key={caption.key}
              aria-hidden
              className="flex items-center [grid-area:1/1]"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {caption.body}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {boardView}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={showKeys}
          disabled={disabled}
          aria-disabled={showChord || ask.phase !== "ask" || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
            FOCUS_RING,
          )}
        >
          <Eye aria-hidden className="size-3.5 shrink-0" />
          Show keys
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={disabled}
          aria-disabled={ask.phase !== "ask" || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50 aria-disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          <SkipForward aria-hidden className="size-3.5 shrink-0" />
          Skip
        </button>
        <span className="ml-auto hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[34rem]:inline">
          Tab leaves the pad
        </span>
      </div>
      <p id={hintId} className="sr-only">
        {`${current.detail ?? ""} Press the shortcut while this area has focus${
          reveal === "always" ? `: ${chordSpoken}` : ""
        }. Tab leaves it. The keyboard below can be tapped: modifiers stay down until a key is tapped.`}
      </p>
    </div>
  ) : null;

  const summaryView = (
    <div className="flex w-full max-w-[35rem] flex-col gap-4">
      <div>
        <h3
          ref={bindSummary}
          tabIndex={-1}
          className="text-lg font-semibold tracking-tight outline-none"
        >
          {drills.length === 0 ? "No shortcuts yet" : "Set done"}
        </h3>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {drills.length === 0
            ? "There are no shortcuts to practise here yet."
            : `${countLine(summary)}.`}
        </p>
      </div>
      {drills.length > 0 ? (
        <ul className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-surface-1">
          {drills.map((d, i) => {
            const res = done[d.id];
            return (
              <li key={d.id} className="flex items-center gap-3 px-3 py-2">
                <Bead
                  result={res}
                  current={false}
                  pending={false}
                  landKey="s"
                  motionSafe={motionSafe}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-[13px] font-medium"
                    title={d.action}
                  >
                    {d.action}
                  </span>
                  <span className="block text-[11px] text-ink-3">
                    {res === "clean"
                      ? "First try"
                      : res === "hinted"
                        ? "After a hint"
                        : res === "skipped"
                          ? "Skipped"
                          : "Not tried"}
                  </span>
                </span>
                <span className="hidden shrink-0 items-center gap-1 @min-[24rem]:inline-flex">
                  {d.keys.map((k, j) => (
                    <Kbd key={j}>{legendOf(k, board, control)}</Kbd>
                  ))}
                </span>
                <button
                  type="button"
                  onClick={() => repeatOne(i)}
                  disabled={disabled}
                  aria-label={`Repeat ${d.action}`}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
                    FOCUS_RING,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5 shrink-0" />
                  <span aria-hidden className="hidden @min-[30rem]:inline">
                    Repeat
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {drills.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {missed.length > 0 ? (
            <button
              type="button"
              onClick={() => startRun(missed, "repeat")}
              disabled={disabled}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <ListRestart aria-hidden className="size-3.5 shrink-0" />
              Practise missed ({missed.length})
            </button>
          ) : null}
          <button
            type="button"
            onClick={startOver}
            disabled={disabled}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5 shrink-0" />
            Start over
          </button>
        </div>
      ) : null}
    </div>
  );

  const body = () => {
    if (status === "error") {
      return (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The shortcuts did not load.</p>
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
      );
    }
    if (status === "loading") {
      return (
        <div
          aria-busy="true"
          className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-4 py-4 @min-[30rem]:px-6 @min-[30rem]:py-5"
        >
          <p className="sr-only">Loading the shortcuts.</p>
          <div className="flex w-full max-w-[35rem] flex-col gap-4">
            <div className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 px-4 py-3.5">
              <span className="h-2.5 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-5 w-3/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-3 w-4/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </div>
            {boardView}
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center-safe gap-4 overflow-y-auto px-4 py-4 @min-[30rem]:px-6 @min-[30rem]:py-5">
        {inSummary ? summaryView : runView}
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--sd-accent": color,
          "--sd-pigment": `oklch(from ${color} 0.66 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="text-[11px] text-ink-3 tabular-nums">
            {ready ? position : "Loading"}
          </p>
        </div>
        {ready && drills.length > 0 ? (
          <div className="flex items-center gap-3">
            <ol aria-hidden className="flex flex-wrap items-center gap-1">
              {drills.map((d, i) => (
                <li
                  key={d.id}
                  ref={(node) => {
                    if (node) slotNodes.current.set(d.id, node);
                    else slotNodes.current.delete(d.id);
                  }}
                >
                  <Bead
                    result={done[d.id]}
                    current={!inSummary && i === currentIndex}
                    pending={flying === d.id}
                    landKey={landed.id === d.id ? String(landed.n) : "0"}
                    motionSafe={motionSafe}
                  />
                </li>
              ))}
            </ol>
            <span className="sr-only">{`${answered} of ${drills.length} answered.`}</span>
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-hairline bg-surface-1 px-2 font-mono text-[11px] text-ink-2">
              <span className="text-ink-3">Streak</span>
              <span aria-hidden className="text-(--sd-accent)">
                <Rolling value={streak} motionSafe={motionSafe} />
              </span>
              <span className="sr-only">{streak}</span>
            </span>
          </div>
        ) : null}
      </header>

      {body()}

      {flying ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-20 -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-(--sd-pigment) shadow-[0_0_0_3px_color-mix(in_oklab,var(--sd-pigment)_22%,transparent)]"
          style={{ x: fx, y: fy }}
        />
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
