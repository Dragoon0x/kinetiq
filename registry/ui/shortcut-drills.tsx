"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion, useAnimate } from "motion/react";
import {
  Check,
  Inbox,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  TriangleAlert,
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

/** `mod` is Command on a Mac and Control on Windows; `ctrl` is Control on both. */
export type DrillModifier = "ctrl" | "alt" | "shift" | "mod";

/** One shortcut: the modifiers held and the key pressed with them. */
export type DrillChord = {
  mods: DrillModifier[];
  /** A canonical key: "D", "5", "]", "Space", "Tab", "ArrowUp", "Enter". */
  key: string;
};

export type DrillShortcut = {
  id: string;
  /** What the card asks for, e.g. "Duplicate the layer". */
  action: string;
  chord: DrillChord;
  /** A one-line nudge shown under the card when hints are on. */
  hint?: string;
};

/** A drill set: one area of the product, in card order. */
export type DrillSet = {
  id: string;
  /** The radio's label, e.g. "Editing". */
  label: string;
  shortcuts: DrillShortcut[];
};

/** How one card went. */
export type DrillResult = {
  id: string;
  action: string;
  chord: DrillChord;
  /** From the card appearing to the right chord, pauses excluded, in ms. */
  ms: number;
  /** Chords pressed before the right one landed, counting it. */
  attempts: number;
  /** The first chord pressed was the right one. */
  firstTry: boolean;
  /** Missed, or slower than `slowAfter`: marked for another round. */
  slow: boolean;
};

export type DrillSummary = {
  total: number;
  firstTry: number;
  slow: number;
  medianMs: number;
  bestStreak: number;
};

export type DrillCapStyle = "raised" | "flat";
export type DrillPlatform = "mac" | "windows";
export type DrillStatus = "ready" | "loading" | "error";
export type DrillPhase = "idle" | "running" | "paused" | "results";

export type ShortcutDrillsProps = {
  /** How a keycap is drawn: a raised cap with a front wall, or a flat tinted cap. @default "raised" */
  capStyle?: DrillCapStyle;
  /** Which glyphs the caps show and which modifier `mod` listens for: Command on a Mac, Control on Windows. @default "mac" */
  platform?: DrillPlatform;
  /** The drill sets, in radio order. @default defaultDrillSets */
  sets?: DrillSet[];
  /** Controlled set id. */
  value?: string;
  /** Initial set id when uncontrolled. @default the first set */
  defaultValue?: string;
  /** Fires from the press or arrow that chose a set. */
  onChange?: (setId: string) => void;
  /** Controlled hint switch. */
  hints?: boolean;
  /** Initial hint switch when uncontrolled. @default false */
  defaultHints?: boolean;
  /** The hint switch was pressed. */
  onHintsChange?: (hints: boolean) => void;
  /** A card was answered, right after its chord landed. */
  onAnswer?: (result: DrillResult) => void;
  /** The last card landed: every result and the round's summary. */
  onComplete?: (results: DrillResult[], summary: DrillSummary) => void;
  /** A card slower than this many ms is marked slow, even when it was right first try. @default 2500 */
  slowAfter?: number;
  /** Whether the sets have arrived. @default "ready" */
  status?: DrillStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Shortcut drills" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the results sheet scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can start, pause or change. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const c = (key: string, ...mods: DrillModifier[]): DrillChord => ({
  mods,
  key,
});

/** Gaugeworks Studio's shortcuts in three areas: Editing, Navigation, Tools. */
export const defaultDrillSets: DrillSet[] = [
  {
    id: "editing",
    label: "Editing",
    shortcuts: [
      {
        id: "edit.duplicate",
        action: "Duplicate the layer",
        chord: c("D", "mod"),
        hint: "D for duplicate",
      },
      {
        id: "edit.group",
        action: "Group the selection",
        chord: c("G", "mod"),
        hint: "G for group",
      },
      {
        id: "edit.ungroup",
        action: "Ungroup the selection",
        chord: c("G", "mod", "shift"),
        hint: "Group, with Shift to undo it",
      },
      {
        id: "edit.forward",
        action: "Bring the layer forward",
        chord: c("]", "mod"),
        hint: "Right bracket climbs the stack",
      },
      {
        id: "edit.backward",
        action: "Send the layer backward",
        chord: c("[", "mod"),
        hint: "Left bracket sinks",
      },
      {
        id: "edit.lock",
        action: "Lock the layer",
        chord: c("L", "mod", "shift"),
        hint: "L for lock, Shift because it bites",
      },
      {
        id: "edit.rename",
        action: "Rename the layer",
        chord: c("R", "mod"),
        hint: "R for rename",
      },
      {
        id: "edit.copyStyle",
        action: "Copy the style",
        chord: c("C", "mod", "alt"),
        hint: "Copy, with the option of style",
      },
      {
        id: "edit.pasteStyle",
        action: "Paste the style",
        chord: c("V", "mod", "alt"),
        hint: "Paste, with the option of style",
      },
      {
        id: "edit.flip",
        action: "Flip horizontally",
        chord: c("H", "shift"),
        hint: "H for horizontal",
      },
    ],
  },
  {
    id: "navigation",
    label: "Navigation",
    shortcuts: [
      {
        id: "nav.fit",
        action: "Zoom to fit",
        chord: c("1", "shift"),
        hint: "One canvas",
      },
      {
        id: "nav.selection",
        action: "Zoom to the selection",
        chord: c("2", "shift"),
        hint: "Two: what you picked",
      },
      {
        id: "nav.hundred",
        action: "Zoom to 100%",
        chord: c("0", "shift"),
        hint: "Zero resets",
      },
      {
        id: "nav.nextTab",
        action: "Go to the next gauge",
        chord: c("ArrowRight", "mod", "alt"),
        hint: "Right, with both",
      },
      {
        id: "nav.prevTab",
        action: "Go to the previous gauge",
        chord: c("ArrowLeft", "mod", "alt"),
        hint: "Left, with both",
      },
      {
        id: "nav.layers",
        action: "Show the layers panel",
        chord: c("1", "mod", "alt"),
        hint: "Panel one",
      },
      {
        id: "nav.inspector",
        action: "Show the inspector",
        chord: c("3", "mod", "alt"),
        hint: "Panel three",
      },
      {
        id: "nav.find",
        action: "Find a gauge",
        chord: c("P", "mod"),
        hint: "P for palette",
      },
      {
        id: "nav.parent",
        action: "Select the parent frame",
        chord: c("Enter", "shift"),
        hint: "Enter goes in; Shift Enter goes out",
      },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    shortcuts: [
      { id: "tool.select", action: "Select tool", chord: c("V"), hint: "V" },
      { id: "tool.frame", action: "Frame tool", chord: c("F"), hint: "F" },
      { id: "tool.rect", action: "Rectangle tool", chord: c("R"), hint: "R" },
      { id: "tool.ellipse", action: "Ellipse tool", chord: c("O"), hint: "O" },
      { id: "tool.pen", action: "Pen tool", chord: c("P"), hint: "P" },
      { id: "tool.text", action: "Text tool", chord: c("T"), hint: "T" },
      { id: "tool.hand", action: "Hand tool", chord: c("H"), hint: "H" },
      { id: "tool.needle", action: "Needle tool", chord: c("N"), hint: "N" },
      { id: "tool.dial", action: "Dial tool", chord: c("D"), hint: "D" },
      {
        id: "tool.measure",
        action: "Measure tool",
        chord: c("M", "shift"),
        hint: "M, held with Shift",
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const MOD_ORDER: DrillModifier[] = ["ctrl", "alt", "shift", "mod"];

const MOD_GLYPH: Record<DrillPlatform, Record<DrillModifier, string>> = {
  mac: { ctrl: "⌃", alt: "⌥", shift: "⇧", mod: "⌘" },
  windows: { ctrl: "Ctrl", alt: "Alt", shift: "Shift", mod: "Ctrl" },
};

const MOD_WORD: Record<DrillPlatform, Record<DrillModifier, string>> = {
  mac: { ctrl: "Control", alt: "Option", shift: "Shift", mod: "Command" },
  windows: { ctrl: "Control", alt: "Alt", shift: "Shift", mod: "Control" },
};

/** The caps the strip shows, in keyboard order. */
const STRIP_MODS: Record<DrillPlatform, DrillModifier[]> = {
  mac: ["ctrl", "alt", "shift", "mod"],
  windows: ["mod", "alt", "shift"],
};

const KEY_GLYPH: Record<DrillPlatform, Record<string, string>> = {
  mac: {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Backspace: "⌫",
    Delete: "⌦",
    Tab: "⇥",
    Enter: "↩",
    Space: "Space",
    PageUp: "PgUp",
    PageDown: "PgDn",
  },
  windows: {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Backspace: "Bksp",
    Delete: "Del",
    Tab: "Tab",
    Enter: "Enter",
    Space: "Space",
    PageUp: "PgUp",
    PageDown: "PgDn",
  },
};

const KEY_WORD: Record<string, string> = {
  ArrowUp: "Up arrow",
  ArrowDown: "Down arrow",
  ArrowLeft: "Left arrow",
  ArrowRight: "Right arrow",
  "/": "slash",
  "\\": "backslash",
  "-": "minus",
  "=": "equals",
  "[": "left bracket",
  "]": "right bracket",
  ";": "semicolon",
  "'": "quote",
  ",": "comma",
  ".": "period",
  "`": "backtick",
};

const CODE_KEYS: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Slash: "/",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Backquote: "`",
  Space: "Space",
  Enter: "Enter",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
};

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph"]);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
/** How long the tick stays stamped before the next card slides in. */
const STAMP_MS = 520;
/** How long a pressed key stays lit when its keyup never arrives. */
const KEY_LIT_MS = 240;
/** How long a revealed cap stays lit after a press. */
const FLASH_MS = 200;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const sortMods = (mods: DrillModifier[]): DrillModifier[] =>
  MOD_ORDER.filter((m) => mods.includes(m));

/** On Windows `ctrl` and `mod` are one key, so a chord is read with one of them. */
const normalise = (chord: DrillChord, platform: DrillPlatform): DrillChord => {
  const mods =
    platform === "windows"
      ? chord.mods.map((m) => (m === "ctrl" ? "mod" : m))
      : chord.mods;
  return { mods: sortMods([...new Set(mods)]), key: chord.key };
};

/** A chord's identity, so two chords can be compared. */
export const drillChordId = (chord: DrillChord): string =>
  [...sortMods(chord.mods), chord.key].join("+");

const capLabel = (key: string, platform: DrillPlatform): string =>
  KEY_GLYPH[platform][key] ?? key;

/** The caps a chord draws, in order, with a stable key for each. */
const capsOf = (
  chord: DrillChord,
  platform: DrillPlatform,
): { id: string; text: string; word: string }[] => {
  const n = normalise(chord, platform);
  return [
    ...n.mods.map((m) => ({
      id: `mod:${m}`,
      text: MOD_GLYPH[platform][m],
      word: MOD_WORD[platform][m],
    })),
    {
      id: `key:${n.key}`,
      text: capLabel(n.key, platform),
      word: KEY_WORD[n.key] ?? n.key,
    },
  ];
};

/** The chord in words, for announcements and labels: "Command Shift G". */
export const drillChordWords = (
  chord: DrillChord,
  platform: DrillPlatform,
): string =>
  capsOf(chord, platform)
    .map((cap) => cap.word)
    .join(" ");

const modsFromEvent = (
  event: React.KeyboardEvent,
  platform: DrillPlatform,
): DrillModifier[] => {
  const mods: DrillModifier[] = [];
  if (platform === "mac") {
    if (event.ctrlKey) mods.push("ctrl");
    if (event.metaKey) mods.push("mod");
  } else if (event.ctrlKey) {
    mods.push("mod");
  }
  if (event.altKey) mods.push("alt");
  if (event.shiftKey) mods.push("shift");
  return sortMods(mods);
};

/** The canonical key a keydown carries, or null for a modifier on its own. */
const keyFromEvent = (event: React.KeyboardEvent): string | null => {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  const mapped = CODE_KEYS[code];
  if (mapped) return mapped;
  if (event.key === " ") return "Space";
  if (event.key.length === 1) return event.key.toUpperCase();
  if (event.key === "Dead" || event.key === "Unidentified") return null;
  return event.key;
};

const sameMods = (a: DrillModifier[], b: DrillModifier[]) =>
  a.length === b.length && a.every((m, i) => m === b[i]);

const fmtMs = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

/** Totals a round: first-try count, slow count, median time and best streak. */
export const summariseDrill = (results: DrillResult[]): DrillSummary => {
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const medianMs =
    times.length === 0
      ? 0
      : times.length % 2 === 1
        ? (times[mid] ?? 0)
        : Math.round(((times[mid - 1] ?? 0) + (times[mid] ?? 0)) / 2);
  let streak = 0;
  let best = 0;
  for (const r of results) {
    streak = r.firstTry ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  return {
    total: results.length,
    firstTry: results.filter((r) => r.firstTry).length,
    slow: results.filter((r) => r.slow).length,
    medianMs,
    bestStreak: best,
  };
};

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Keycaps                                 */
/* ----------------------------------------------------------------------- */

type CapSize = "lg" | "md" | "sm";

const CAP_SIZE: Record<CapSize, string> = {
  lg: "h-9 min-w-9 px-2 text-[13px]",
  md: "h-7 min-w-7 px-1.5 text-[11px]",
  sm: "h-5 min-w-5 px-1 text-[10px]",
};

const capFace = (style: DrillCapStyle, lit: boolean, wanted: boolean) =>
  cn(
    style === "raised"
      ? "border border-b-2 bg-surface-1 shadow-[inset_0_1px_0_color-mix(in_oklab,white_18%,transparent)]"
      : "border border-transparent bg-surface-2",
    lit
      ? "border-[color-mix(in_oklab,var(--accent-bright)_55%,var(--hairline-strong))] bg-cobalt-wash text-cobalt-bright"
      : wanted
        ? "border-[color-mix(in_oklab,var(--accent-bright)_45%,var(--hairline-strong))] text-ink"
        : style === "raised"
          ? "border-hairline-strong text-ink"
          : "text-ink",
    style === "raised" && lit && "border-b",
  );

function Cap({
  text,
  style,
  size,
  lit = false,
  wanted = false,
  dim = false,
  motionSafe,
  className,
}: {
  text: string;
  style: DrillCapStyle;
  size: CapSize;
  /** The key is down: the cap presses in on snap. */
  lit?: boolean;
  /** A hint: this cap is part of the answer. */
  wanted?: boolean;
  /** A ghost: the answer's key, shown faintly. */
  dim?: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  const wide = text.length > 1 && /^[A-Za-z]/.test(text);
  return (
    <motion.kbd
      initial={false}
      animate={{ y: lit ? 2 : 0, scale: lit ? 0.97 : 1 }}
      transition={motionSafe ? springs.snap : { duration: 0 }}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-2 font-mono leading-none whitespace-nowrap transition-colors duration-150",
        wide && "tracking-[0.02em]",
        CAP_SIZE[size],
        capFace(style, lit, wanted),
        dim && !lit && "text-ink-3",
        className,
      )}
    >
      {text}
      {wanted && !lit ? (
        <span
          aria-hidden
          className="absolute -top-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-cobalt-bright"
        />
      ) : null}
    </motion.kbd>
  );
}

/** A still run of caps for a chord: the hint row, the results and the reveal. */
function ChordCaps({
  chord,
  platform,
  style,
  size,
  motionSafe,
  dim = false,
  className,
}: {
  chord: DrillChord;
  platform: DrillPlatform;
  style: DrillCapStyle;
  size: CapSize;
  motionSafe: boolean;
  dim?: boolean;
  className?: string;
}) {
  const sep = platform === "windows";
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {capsOf(chord, platform).map((cap, i) => (
        <React.Fragment key={cap.id}>
          {sep && i > 0 ? (
            <span aria-hidden className="font-mono text-[10px] text-ink-3">
              +
            </span>
          ) : null}
          <Cap
            text={cap.text}
            style={style}
            size={size}
            dim={dim}
            motionSafe={motionSafe}
          />
        </React.Fragment>
      ))}
    </span>
  );
}

/**
 * The answer, revealed: each cap is a button that presses in on snap when it
 * is pressed, so the chord can be felt out before it is typed.
 */
function RevealCaps({
  chord,
  platform,
  style,
  motionSafe,
  disabled,
}: {
  chord: DrillChord;
  platform: DrillPlatform;
  style: DrillCapStyle;
  motionSafe: boolean;
  disabled: boolean;
}) {
  const [lit, setLit] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const flash = (id: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setLit(id);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setLit(null);
    }, FLASH_MS);
  };
  const sep = platform === "windows";
  return (
    <span
      role="group"
      aria-label="The chord, cap by cap"
      className="inline-flex items-center gap-1"
    >
      {capsOf(chord, platform).map((cap, i) => (
        <React.Fragment key={cap.id}>
          {sep && i > 0 ? (
            <span aria-hidden className="font-mono text-[10px] text-ink-3">
              +
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`${cap.word} key`}
            aria-disabled={disabled || undefined}
            onPointerDown={(event) => {
              if (disabled) return;
              event.preventDefault();
              setLit(cap.id);
            }}
            onPointerUp={() => flash(cap.id)}
            onPointerCancel={() => setLit(null)}
            onPointerLeave={() => {
              if (lit === cap.id && timer.current === null) setLit(null);
            }}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                if (!disabled) flash(cap.id);
              }
            }}
            className={cn(
              "touch-none rounded-2",
              disabled ? "cursor-default" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            <Cap
              text={cap.text}
              style={style}
              size="md"
              lit={lit === cap.id}
              motionSafe={motionSafe}
            />
          </button>
        </React.Fragment>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Controls                                 */
/* ----------------------------------------------------------------------- */

function SetRadios({
  sets,
  value,
  uid,
  motionSafe,
  disabled,
  onChange,
}: {
  sets: DrillSet[];
  value: string;
  uid: string;
  motionSafe: boolean;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const index = Math.max(
    0,
    sets.findIndex((s) => s.id === value),
  );
  return (
    <div
      role="radiogroup"
      aria-label="Drill set"
      className="relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-3 border border-hairline bg-surface-1 p-0.5"
    >
      {sets.map((set, i) => {
        const checked = i === index;
        return (
          <button
            key={set.id}
            ref={(node) => {
              if (node) nodes.current.set(set.id, node);
              else nodes.current.delete(set.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => {
              if (!disabled) onChange(set.id);
            }}
            onKeyDown={(event) => {
              let to = -1;
              if (event.key === "ArrowRight" || event.key === "ArrowDown")
                to = i + 1;
              else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                to = i - 1;
              else if (event.key === "Home") to = 0;
              else if (event.key === "End") to = sets.length - 1;
              else return;
              event.preventDefault();
              const target = sets[(to + sets.length) % sets.length];
              if (!target) return;
              nodes.current.get(target.id)?.focus();
              if (!disabled) onChange(target.id);
            }}
            className={cn(
              "relative h-6 shrink-0 rounded-2 px-2 text-[11px] font-medium whitespace-nowrap transition-colors",
              checked ? "text-foreground" : "text-ink-2 hover:text-foreground",
              disabled ? "cursor-default" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {checked ? (
              motionSafe ? (
                <motion.span
                  layoutId={`${uid}-set-pill`}
                  aria-hidden
                  className="absolute inset-0 rounded-2 border border-hairline bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent)]"
                  transition={springs.snap}
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-2 border border-hairline bg-card"
                />
              )
            ) : null}
            <span className="relative">{set.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function HintSwitch({
  on,
  motionSafe,
  disabled,
  onChange,
}: {
  on: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onChange(!on);
      }}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-2 px-1 text-[11px] text-ink-2 transition-colors hover:text-foreground",
        disabled ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative inline-block h-4 w-7 shrink-0 rounded-full border transition-colors duration-150",
          on
            ? "border-transparent bg-primary"
            : "border-hairline-strong bg-surface-2",
        )}
      >
        <motion.span
          className={cn(
            "absolute top-0.5 left-0.5 size-[11px] rounded-full",
            on ? "bg-primary-foreground" : "bg-ink-3",
          )}
          initial={false}
          animate={{ x: on ? 12 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </span>
      Show hint
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Held = { mods: DrillModifier[]; key: string | null };

const NO_HELD: Held = { mods: [], key: null };

type Round = { setId: string; ids: string[] | null };

/**
 * A keyboard-shortcut practice drill. A card asks for an action — "Duplicate
 * the layer" — and the drill listens: a strip of modifier caps and a key slot
 * light as keys go down, each cap pressing in on `springs.snap`. The right
 * chord stamps a tick on the card on `springs.recoil` and the next card
 * slides in on `springs.glide` as the old one leaves on the exit ease; a
 * wrong one shakes the card a little, zeroes the streak and reveals the
 * answer as caps that can be pressed to feel the chord before it is typed.
 * A streak rolls in the header, a rail fills on glide, and when the last
 * card lands a results sheet lists every shortcut with its time, marking the
 * slow and the missed for another round.
 *
 * While the drill is focused it is an application region: every chord is
 * captured and never reaches the page, Escape pauses (and resumes), and
 * plain Tab still leaves. The sets are a radio group, the hint switch a
 * switch, and the results sheet a multi-select listbox whose selected rows
 * seed the next round. Under reduced motion nothing travels or shakes —
 * cards cross-fade, caps change colour in place, the rail and the streak
 * jump — and every state is still reached and announced.
 */
export function ShortcutDrills({
  capStyle = "raised",
  platform = "mac",
  sets = defaultDrillSets,
  value,
  defaultValue,
  onChange,
  hints,
  defaultHints = false,
  onHintsChange,
  onAnswer,
  onComplete,
  slowAfter = 2500,
  status = "ready",
  onRetry,
  title = "Shortcut drills",
  label,
  height = 540,
  disabled = false,
  className,
}: ShortcutDrillsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const cardId = `${uid}-card`;

  const [ownSet, setOwnSet] = React.useState<string>(
    defaultValue ?? sets[0]?.id ?? "",
  );
  const activeSetId = value ?? ownSet;
  const activeSet = sets.find((s) => s.id === activeSetId) ?? sets[0] ?? null;
  const setId = activeSet?.id ?? "";

  const [ownHints, setOwnHints] = React.useState(defaultHints);
  const hintsOn = hints ?? ownHints;

  const ready = status === "ready";
  const inert = disabled || !ready;

  // The run belongs to the set it started on; choosing another set, even
  // from outside, reads as idle without an effect having to reset anything.
  const [run, setRun] = React.useState<{
    setId: string;
    phase: DrillPhase;
  }>({ setId, phase: "idle" });
  const phase: DrillPhase = run.setId === setId ? run.phase : "idle";
  const [round, setRound] = React.useState<Round>({ setId, ids: null });
  const [index, setIndex] = React.useState(0);
  const [results, setResults] = React.useState<DrillResult[]>([]);
  const [streak, setStreak] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const [held, setHeld] = React.useState<Held>(NO_HELD);
  const [reveal, setReveal] = React.useState(false);
  const [stamp, setStamp] = React.useState(false);
  // A miss shakes the card imperatively, so a second miss shakes it again
  // without the card remounting and losing the reveal row.
  const [shakeScope, animateShake] = useAnimate<HTMLDivElement>();
  // Focus reaches the stage after it has rendered: from the results sheet it
  // is not mounted until the next paint.
  const [focusSeq, setFocusSeq] = React.useState(0);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const resumeRef = React.useRef<HTMLButtonElement | null>(null);
  const againRef = React.useRef<HTMLButtonElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const resultsRef = React.useRef<DrillResult[]>([]);
  const startRef = React.useRef(0);
  const pausedAtRef = React.useRef(0);
  const pausedTotalRef = React.useRef(0);
  const missesRef = React.useRef(0);
  const stampTimer = React.useRef<number | null>(null);
  const keyTimer = React.useRef<number | null>(null);

  const shortcuts = React.useMemo(
    () => activeSet?.shortcuts ?? [],
    [activeSet],
  );
  const cards = React.useMemo(() => {
    if (round.setId !== setId || round.ids === null) return shortcuts;
    const ids = round.ids;
    return shortcuts.filter((s) => ids.includes(s.id));
  }, [round, setId, shortcuts]);
  const total = cards.length;
  const card = cards[index] ?? null;
  const target = card ? normalise(card.chord, platform) : null;
  const done = Math.min(results.length, total);

  /* ------------------------------- timers ------------------------------ */

  React.useEffect(
    () => () => {
      if (stampTimer.current !== null) window.clearTimeout(stampTimer.current);
      if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
    },
    [],
  );

  const armKeyClear = () => {
    if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(() => {
      keyTimer.current = null;
      setHeld((h) => (h.key === null ? h : { ...h, key: null }));
    }, KEY_LIT_MS);
  };

  /* ------------------------------- phases ------------------------------ */

  const announce = (text: string) => setAnnouncement(text);

  const start = (ids: string[] | null) => {
    const list =
      ids === null ? shortcuts : shortcuts.filter((s) => ids.includes(s.id));
    if (inert || list.length === 0) return;
    if (stampTimer.current !== null) window.clearTimeout(stampTimer.current);
    stampTimer.current = null;
    resultsRef.current = [];
    setResults([]);
    setRound({ setId, ids });
    setIndex(0);
    setStreak(0);
    setBest(0);
    setReveal(false);
    setStamp(false);
    setHeld(NO_HELD);
    missesRef.current = 0;
    pausedTotalRef.current = 0;
    startRef.current = now();
    setRun({ setId, phase: "running" });
    const first = list[0];
    announce(
      `Drill started: ${list.length} ${list.length === 1 ? "shortcut" : "shortcuts"}. 1 of ${list.length}: ${first?.action ?? ""}.`,
    );
    setFocusSeq((n) => n + 1);
  };

  const pause = React.useCallback(() => {
    pausedAtRef.current = now();
    setHeld(NO_HELD);
    setRun((r) => (r.phase === "running" ? { ...r, phase: "paused" } : r));
    setAnnouncement("Paused. Escape or Resume continues.");
  }, []);

  const resume = () => {
    if (inert) return;
    pausedTotalRef.current += now() - pausedAtRef.current;
    setRun((r) => (r.phase === "paused" ? { ...r, phase: "running" } : r));
    announce(`Resumed. ${index + 1} of ${total}: ${card?.action ?? ""}.`);
    setFocusSeq((n) => n + 1);
  };

  const finish = (all: DrillResult[]) => {
    const summary = summariseDrill(all);
    setPicked(all.filter((r) => r.slow).map((r) => r.id));
    setActiveRow(all[0]?.id ?? null);
    setRun({ setId, phase: "results" });
    onComplete?.(all, summary);
    announce(
      `Drill complete. ${summary.firstTry} of ${summary.total} first try, ${summary.slow} marked slow, median ${fmtMs(summary.medianMs)}.`,
    );
  };

  const advance = () => {
    const next = index + 1;
    missesRef.current = 0;
    setReveal(false);
    setHeld(NO_HELD);
    if (next >= total) {
      finish(resultsRef.current);
      return;
    }
    setIndex(next);
    pausedTotalRef.current = 0;
    startRef.current = now();
    announce(`${next + 1} of ${total}: ${cards[next]?.action ?? ""}.`);
  };

  const skip = () => {
    if (inert || !card || stamp) return;
    const ms = Math.round(now() - startRef.current - pausedTotalRef.current);
    const result: DrillResult = {
      id: card.id,
      action: card.action,
      chord: card.chord,
      ms,
      attempts: missesRef.current + 1,
      firstTry: false,
      slow: true,
    };
    resultsRef.current = [...resultsRef.current, result];
    setResults(resultsRef.current);
    onAnswer?.(result);
    setStreak(0);
    advance();
    setFocusSeq((n) => n + 1);
  };

  const evaluate = (chord: DrillChord) => {
    if (!card || !target || stamp) return;
    const ok = drillChordId(chord) === drillChordId(target);
    const words = drillChordWords(chord, platform);
    if (!ok) {
      missesRef.current += 1;
      setStreak(0);
      setReveal(true);
      if (motionSafe && shakeScope.current) {
        animateShake(
          shakeScope.current,
          { x: [0, -6, 6, -4, 2, 0] },
          { duration: durations.slow, ease: easings.move },
        );
      }
      announce(
        `Not ${words}. ${card.action} is ${drillChordWords(target, platform)}. Press it to move on.`,
      );
      return;
    }
    const ms = Math.round(now() - startRef.current - pausedTotalRef.current);
    const attempts = missesRef.current + 1;
    const result: DrillResult = {
      id: card.id,
      action: card.action,
      chord: card.chord,
      ms,
      attempts,
      firstTry: attempts === 1,
      slow: attempts > 1 || ms > slowAfter,
    };
    resultsRef.current = [...resultsRef.current, result];
    setResults(resultsRef.current);
    onAnswer?.(result);
    const nextStreak = result.firstTry ? streak + 1 : 0;
    setStreak(nextStreak);
    setBest((b) => Math.max(b, nextStreak));
    setStamp(true);
    announce(
      `Correct, ${words}, ${fmtMs(ms)}${result.slow ? ", marked slow" : ""}. Streak ${nextStreak}. ${index + 1} of ${total} done.`,
    );
    if (stampTimer.current !== null) window.clearTimeout(stampTimer.current);
    stampTimer.current = window.setTimeout(
      () => {
        stampTimer.current = null;
        setStamp(false);
        advance();
      },
      motionSafe ? STAMP_MS : durations.fast * 1000 + 80,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const own = event.target === event.currentTarget;
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    if (phase === "idle") {
      if (own && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        start(null);
      }
      return;
    }
    if (phase === "paused") {
      if (event.key === "Escape") {
        event.preventDefault();
        resume();
      }
      return;
    }
    if (phase !== "running") return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      pause();
      return;
    }
    // Plain Tab leaves the drill; a button inside keeps its own Space/Enter.
    if (event.key === "Tab" && plain) return;
    if (!own && plain && (event.key === "Enter" || event.key === " ")) return;
    event.preventDefault();
    event.stopPropagation();
    if (inert) return;
    const mods = modsFromEvent(event, platform);
    const key = keyFromEvent(event);
    if (key === null) {
      setHeld((h) => (sameMods(h.mods, mods) ? h : { ...h, mods }));
      return;
    }
    if (event.repeat) return;
    setHeld({ mods, key });
    armKeyClear();
    evaluate({ mods, key });
  };

  const onStageKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (phase !== "running") return;
    if (
      event.key === "Tab" &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    )
      return;
    event.preventDefault();
    const mods = modsFromEvent(event, platform);
    const modifier = MODIFIER_KEYS.has(event.key);
    setHeld((h) => ({ mods, key: modifier ? h.key : null }));
  };

  /* ------------------------------- effects ----------------------------- */

  // A hidden tab pauses the clock, so a drill left open is never charged
  // for the time away.
  React.useEffect(() => {
    if (phase !== "running" || typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [phase, pause]);

  React.useEffect(() => {
    if (phase === "paused") resumeRef.current?.focus({ preventScroll: true });
    else if (phase === "results")
      againRef.current?.focus({ preventScroll: true });
  }, [phase]);

  React.useLayoutEffect(() => {
    if (focusSeq > 0) stageRef.current?.focus({ preventScroll: true });
  }, [focusSeq]);

  /* ------------------------------- changes ----------------------------- */

  const chooseSet = (id: string) => {
    if (id === activeSetId) return;
    if (value === undefined) setOwnSet(id);
    onChange?.(id);
    setRun({ setId: id, phase: "idle" });
    setRound({ setId: id, ids: null });
    setHeld(NO_HELD);
    const set = sets.find((s) => s.id === id);
    announce(
      `${set?.label ?? id} set: ${set?.shortcuts.length ?? 0} shortcuts.`,
    );
  };

  const changeHints = (on: boolean) => {
    if (hints === undefined) setOwnHints(on);
    onHintsChange?.(on);
    announce(on ? "Hints shown." : "Hints hidden.");
  };

  const togglePick = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  /* ------------------------------- render ------------------------------ */

  const stripMods = STRIP_MODS[platform];
  const wantedMods = hintsOn && target ? target.mods : [];
  const keyText = held.key
    ? capLabel(held.key, platform)
    : hintsOn && target
      ? capLabel(target.key, platform)
      : "?";
  const keyDim = !held.key;
  const progress = total === 0 ? 0 : done / total;
  const summary = phase === "results" ? summariseDrill(results) : null;
  const step = cascade(Math.min(results.length, 10));
  const activeResult =
    activeRow && results.some((r) => r.id === activeRow)
      ? activeRow
      : (results[0]?.id ?? null);

  const stageLabel =
    phase === "running"
      ? `Drill, ${index + 1} of ${total}: ${card?.action ?? ""}`
      : phase === "paused"
        ? "Drill, paused"
        : `Drill, ${activeSet?.label ?? ""} set, ${total} ${total === 1 ? "shortcut" : "shortcuts"}`;

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Press the chord for each action. Keys are captured while the drill is
        focused. Escape pauses. Tab leaves.
      </p>

      <LayoutGroup id={uid}>
        <header className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2.5">
          <div className="flex items-center justify-between gap-3">
            <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
              {title}
            </p>
            {ready ? (
              <p className="flex shrink-0 items-baseline gap-1.5 text-[12px] text-ink-2">
                <span className="sr-only">
                  Streak {streak}, best {best}
                </span>
                <span
                  aria-hidden
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  Streak
                </span>
                <Roll
                  value={streak}
                  motionSafe={motionSafe}
                  className="font-mono text-[13px] text-foreground"
                />
                <span
                  aria-hidden
                  className="hidden font-mono text-[11px] text-ink-3 @min-[24rem]:inline"
                >
                  best {best}
                </span>
              </p>
            ) : null}
          </div>
          {ready ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <SetRadios
                sets={sets}
                value={setId}
                uid={uid}
                motionSafe={motionSafe}
                disabled={inert}
                onChange={chooseSet}
              />
              <HintSwitch
                on={hintsOn}
                motionSafe={motionSafe}
                disabled={inert}
                onChange={changeHints}
              />
            </div>
          ) : (
            <div aria-hidden className="flex items-center gap-2">
              <span className="h-7 w-44 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
              <span
                className="h-6 w-20 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: "90ms" }}
              />
            </div>
          )}
        </header>

        {/* The rail: fills on glide; a mark lands per card. */}
        <div className="shrink-0 px-4 pb-2">
          <div
            role="progressbar"
            aria-label="Cards done"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, total)}
            aria-valuenow={done}
            aria-valuetext={`${done} of ${total}`}
            className="relative h-1.5 overflow-hidden rounded-full bg-surface-2"
          >
            <motion.div
              aria-hidden
              className="absolute inset-y-0 left-0 w-full rounded-full bg-primary"
              style={{ originX: 0 }}
              initial={false}
              animate={{ scaleX: ready ? progress : 0 }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </div>
          <div aria-hidden className="mt-1 flex h-1 gap-px">
            {ready
              ? cards.map((s, i) => {
                  const r = results[i];
                  return (
                    <motion.span
                      key={s.id}
                      className={cn(
                        "flex-1 rounded-full",
                        r
                          ? r.firstTry && !r.slow
                            ? "bg-success"
                            : r.firstTry
                              ? "bg-warn"
                              : "bg-danger"
                          : "bg-transparent",
                      )}
                      initial={false}
                      animate={{ scaleY: r ? 1 : 0.4, opacity: r ? 1 : 0.35 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  );
                })
              : null}
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col border-t border-hairline">
          {status === "error" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The drill sets didn&apos;t load.
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
          ) : status === "loading" ? (
            <div
              aria-hidden
              className="flex flex-1 flex-col items-center justify-center gap-4 px-6"
            >
              <div className="flex w-full max-w-sm flex-col gap-3 rounded-3 border border-hairline p-5">
                <span className="h-2.5 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className="h-5 w-3/4 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: "80ms" }}
                />
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className="size-9 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 70}ms` }}
                  />
                ))}
              </div>
            </div>
          ) : !activeSet || shortcuts.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6 text-center">
              <Inbox aria-hidden className="size-5 text-ink-3" />
              <p className="text-sm text-ink-2">
                No shortcuts in {activeSet ? `the ${activeSet.label}` : "this"}{" "}
                set yet.
              </p>
              <p className="text-[11px] text-ink-3">
                Pick another set above to start a drill.
              </p>
            </div>
          ) : phase === "results" && summary ? (
            <ResultsSheet
              results={results}
              summary={summary}
              platform={platform}
              capStyle={capStyle}
              motionSafe={motionSafe}
              disabled={inert}
              picked={picked}
              activeId={activeResult}
              step={step}
              rowNodes={rowNodes}
              againRef={againRef}
              onFocusRow={setActiveRow}
              onToggle={togglePick}
              onDrillPicked={() => start(picked)}
              onDrillAll={() => start(null)}
            />
          ) : (
            <div
              ref={stageRef}
              role="application"
              aria-label={stageLabel}
              aria-describedby={hintId}
              tabIndex={0}
              onKeyDown={onStageKeyDown}
              onKeyUp={onStageKeyUp}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setHeld(NO_HELD);
              }}
              className={cn(
                "relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-4 py-4 outline-none @min-[40rem]:gap-5",
                "focus-visible:[&>[data-card]]:outline-2 focus-visible:[&>[data-card]]:outline-offset-2 focus-visible:[&>[data-card]]:outline-ring focus-visible:[&>[data-card]]:outline-solid",
              )}
            >
              {/* The card */}
              <div
                data-card
                className="relative w-full max-w-md rounded-3 [perspective:600px]"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={phase === "idle" ? "idle" : (card?.id ?? "none")}
                    id={cardId}
                    initial={{
                      opacity: 0,
                      x: motionSafe ? distances.shift : 0,
                    }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{
                      opacity: 0,
                      x: motionSafe ? -distances.shift : 0,
                      transition: exitFor(durations.base),
                    }}
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
                    className="w-full"
                  >
                    <div
                      ref={shakeScope}
                      className={cn(
                        "relative flex flex-col gap-2 rounded-3 border bg-surface-0 px-5 py-5 transition-colors duration-200 @min-[40rem]:px-6 @min-[40rem]:py-6",
                        reveal
                          ? "border-[color-mix(in_oklab,var(--danger)_45%,var(--hairline-strong))]"
                          : "border-hairline-strong",
                      )}
                    >
                      {phase === "idle" ? (
                        <>
                          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                            {activeSet.label} · {total}{" "}
                            {total === 1 ? "shortcut" : "shortcuts"}
                            {round.setId === setId && round.ids !== null
                              ? " · slow ones"
                              : ""}
                          </span>
                          <p className="text-lg font-semibold @min-[40rem]:text-xl">
                            Press the chord for each action.
                          </p>
                          <p className="text-[12px] text-ink-2">
                            Keys are captured while the drill is focused. Escape
                            pauses.
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                start(round.setId === setId ? round.ids : null)
                              }
                              aria-disabled={inert || undefined}
                              className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity",
                                inert
                                  ? "cursor-default opacity-60"
                                  : "hover:opacity-90",
                                FOCUS_RING,
                              )}
                            >
                              <Play aria-hidden className="size-3.5" />
                              Start
                            </button>
                            {round.setId === setId && round.ids !== null ? (
                              <button
                                type="button"
                                onClick={() => start(null)}
                                aria-disabled={inert || undefined}
                                className={cn(
                                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                                  FOCUS_RING,
                                )}
                              >
                                Whole set
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : card ? (
                        <>
                          <span className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                            <span>Press the chord for</span>
                            <span className="tabular-nums">
                              {index + 1} / {total}
                            </span>
                          </span>
                          <p className="pr-10 text-lg font-semibold @min-[40rem]:text-xl">
                            {card.action}
                          </p>
                          <AnimatePresence initial={false}>
                            {reveal && target ? (
                              <motion.div
                                key="reveal"
                                initial={{
                                  opacity: 0,
                                  y: motionSafe ? -distances.nudge : 0,
                                }}
                                animate={{ opacity: 1, y: 0 }}
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
                                className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2"
                              >
                                <span className="text-[12px] text-ink-2">
                                  The chord is
                                </span>
                                <RevealCaps
                                  chord={target}
                                  platform={platform}
                                  style={capStyle}
                                  motionSafe={motionSafe}
                                  disabled={inert}
                                />
                                <span className="text-[11px] text-ink-3">
                                  Press it to move on
                                </span>
                                <button
                                  type="button"
                                  onClick={skip}
                                  className={cn(
                                    "ml-auto inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                                    FOCUS_RING,
                                  )}
                                >
                                  <SkipForward aria-hidden className="size-3" />
                                  Skip
                                </button>
                              </motion.div>
                            ) : hintsOn && card.hint ? (
                              <motion.p
                                key="hint"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{
                                  opacity: 0,
                                  transition: exitFor(durations.fast),
                                }}
                                transition={{ duration: durations.fast }}
                                className="text-[12px] text-ink-2"
                              >
                                Hint: {card.hint}
                              </motion.p>
                            ) : null}
                          </AnimatePresence>
                        </>
                      ) : null}

                      {/* The stamp: lands on recoil, a tick drawing on flick inside it. */}
                      <AnimatePresence>
                        {stamp ? (
                          <motion.span
                            key="stamp"
                            aria-hidden
                            className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-success text-primary-foreground shadow-[0_6px_16px_-6px_color-mix(in_oklab,var(--success)_60%,transparent)]"
                            initial={
                              motionSafe
                                ? { opacity: 0, scale: 1.7, rotate: -10 }
                                : { opacity: 0 }
                            }
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={
                              motionSafe
                                ? {
                                    ...springs.recoil,
                                    opacity: { duration: durations.blink },
                                  }
                                : { duration: durations.fast }
                            }
                          >
                            <svg viewBox="0 0 20 20" className="size-5">
                              <motion.path
                                d="M4.5 10.5 8.3 14.2 15.5 6.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2.2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                initial={motionSafe ? { pathLength: 0 } : false}
                                animate={{ pathLength: 1 }}
                                transition={
                                  motionSafe
                                    ? {
                                        ...springs.flick,
                                        delay: durations.blink,
                                      }
                                    : { duration: 0 }
                                }
                              />
                            </svg>
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* The strip: every modifier on this platform, then the key slot. */}
              <div
                aria-hidden
                className={cn(
                  "flex items-center gap-1.5 transition-opacity duration-200",
                  phase === "idle" && "opacity-50",
                )}
              >
                {stripMods.map((m) => (
                  <Cap
                    key={m}
                    text={MOD_GLYPH[platform][m]}
                    style={capStyle}
                    size="lg"
                    lit={held.mods.includes(m)}
                    wanted={wantedMods.includes(m)}
                    motionSafe={motionSafe}
                  />
                ))}
                <span className="mx-0.5 h-5 w-px bg-hairline" />
                <span className="relative inline-flex h-9 min-w-11 items-center justify-center">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={`${keyText}-${keyDim ? "dim" : "lit"}`}
                      initial={
                        motionSafe
                          ? { opacity: 0, scale: keyDim ? 1 : 0.6 }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              opacity: { duration: durations.blink },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <Cap
                        text={keyText}
                        style={capStyle}
                        size="lg"
                        lit={held.key !== null}
                        wanted={keyDim && hintsOn && target !== null}
                        dim={keyDim}
                        motionSafe={motionSafe}
                        className={cn(keyDim && !hintsOn && "border-dashed")}
                      />
                    </motion.span>
                  </AnimatePresence>
                </span>
              </div>

              {phase === "running" ? (
                <p
                  aria-hidden
                  className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  Esc pauses
                </p>
              ) : null}

              {/* Paused: an overlay with Resume and Restart. */}
              <AnimatePresence>
                {phase === "paused" ? (
                  <motion.div
                    key="paused"
                    role="dialog"
                    aria-label="Paused"
                    aria-modal="false"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[color-mix(in_oklab,var(--bg-0)_82%,transparent)] px-6 text-center backdrop-blur-[2px]"
                  >
                    <Pause aria-hidden className="size-5 text-ink-3" />
                    <p className="text-sm font-semibold">Paused</p>
                    <p className="text-[12px] text-ink-2">
                      {index + 1} of {total} · streak {streak}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        ref={resumeRef}
                        type="button"
                        onClick={resume}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                          FOCUS_RING,
                        )}
                      >
                        <Play aria-hidden className="size-3.5" />
                        Resume
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          start(round.setId === setId ? round.ids : null)
                        }
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        <RotateCcw aria-hidden className="size-3.5" />
                        Restart
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )}
        </div>
      </LayoutGroup>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Results                                 */
/* ----------------------------------------------------------------------- */

function ResultsSheet({
  results,
  summary,
  platform,
  capStyle,
  motionSafe,
  disabled,
  picked,
  activeId,
  step,
  rowNodes,
  againRef,
  onFocusRow,
  onToggle,
  onDrillPicked,
  onDrillAll,
}: {
  results: DrillResult[];
  summary: DrillSummary;
  platform: DrillPlatform;
  capStyle: DrillCapStyle;
  motionSafe: boolean;
  disabled: boolean;
  picked: string[];
  activeId: string | null;
  step: number;
  rowNodes: React.RefObject<Map<string, HTMLButtonElement>>;
  againRef: React.RefObject<HTMLButtonElement | null>;
  onFocusRow: (id: string) => void;
  onToggle: (id: string) => void;
  onDrillPicked: () => void;
  onDrillAll: () => void;
}) {
  const uid = React.useId();
  const n = picked.length;
  const tiles: { label: string; value: string }[] = [
    { label: "First try", value: `${summary.firstTry}/${summary.total}` },
    { label: "Median", value: fmtMs(summary.medianMs) },
    { label: "Slow", value: String(summary.slow) },
    { label: "Best streak", value: String(summary.bestStreak) },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.base }
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3 pb-2">
        <div className="flex flex-col">
          <p className="text-sm font-semibold">Round over</p>
          <p className="text-[11px] text-ink-3">
            Selected rows go in the next round.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            ref={againRef}
            type="button"
            onClick={() => {
              if (!disabled && n > 0) onDrillPicked();
            }}
            aria-disabled={disabled || n === 0 || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity",
              disabled || n === 0
                ? "cursor-default opacity-60"
                : "hover:opacity-90",
              FOCUS_RING,
            )}
          >
            <Play aria-hidden className="size-3.5" />
            Drill {n} again
          </button>
          <button
            type="button"
            onClick={() => {
              if (!disabled) onDrillAll();
            }}
            aria-disabled={disabled || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span className="hidden @min-[30rem]:inline">Whole set</span>
            <span className="@min-[30rem]:hidden">All</span>
          </button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-4 gap-1.5 px-4 pb-2">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.label}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { ...springs.glide, delay: r3(i * step) }
                : { duration: durations.fast }
            }
            className="flex min-w-0 flex-col gap-0.5 rounded-2 border border-hairline bg-surface-0 px-2 py-1.5"
          >
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {tile.label}
            </span>
            <span className="truncate font-mono text-[13px] text-foreground tabular-nums">
              {tile.value}
            </span>
          </motion.div>
        ))}
      </div>

      <ul
        role="listbox"
        aria-multiselectable
        aria-label="Results; selected rows go in the next round"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain border-t border-hairline px-2 py-1.5"
      >
        {results.map((r, i) => {
          const selected = picked.includes(r.id);
          const mark = !r.firstTry ? "missed" : r.slow ? "slow" : "right";
          return (
            <motion.li
              key={`${uid}-${r.id}`}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? {
                      ...springs.glide,
                      delay: r3(Math.min(i, 10) * step),
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
              role="none"
            >
              <button
                ref={(node) => {
                  if (node) rowNodes.current.set(r.id, node);
                  else rowNodes.current.delete(r.id);
                }}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={`${r.action}, ${drillChordWords(r.chord, platform)}, ${fmtMs(r.ms)}, ${
                  mark === "missed"
                    ? `missed, ${r.attempts} attempts`
                    : mark === "slow"
                      ? "slow"
                      : "right first try"
                }${selected ? ", in the next round" : ""}`}
                tabIndex={r.id === activeId ? 0 : -1}
                onFocus={() => onFocusRow(r.id)}
                onClick={() => {
                  if (!disabled) onToggle(r.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    if (!disabled) onToggle(r.id);
                    return;
                  }
                  const to =
                    event.key === "ArrowDown"
                      ? i + 1
                      : event.key === "ArrowUp"
                        ? i - 1
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? results.length - 1
                            : null;
                  if (to === null) return;
                  event.preventDefault();
                  const t = results[clamp(to, 0, results.length - 1)];
                  if (t) rowNodes.current.get(t.id)?.focus();
                }}
                className={cn(
                  "grid h-9 w-full grid-cols-[1rem_minmax(0,1fr)_auto_3.5rem] items-center gap-x-2 rounded-2 px-2 text-left transition-colors hover:bg-surface-2 @min-[40rem]:grid-cols-[1rem_minmax(0,1fr)_auto_4rem_1.25rem]",
                  selected && "bg-cobalt-wash",
                  FOCUS_RING,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-3.5 items-center justify-center rounded-1 border transition-colors",
                    selected
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-hairline-strong bg-transparent",
                  )}
                >
                  {selected ? (
                    <svg viewBox="0 0 14 14" className="size-2.5">
                      <motion.path
                        d="M3 7.4 5.8 10 11 4.2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={motionSafe ? { pathLength: 0 } : false}
                        animate={{ pathLength: 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  ) : null}
                </span>
                <span className="truncate text-[13px]">{r.action}</span>
                <ChordCaps
                  chord={r.chord}
                  platform={platform}
                  style={capStyle}
                  size="sm"
                  motionSafe={false}
                />
                <span
                  className={cn(
                    "text-right font-mono text-[11px] tabular-nums",
                    mark === "right"
                      ? "text-ink-3"
                      : mark === "slow"
                        ? "text-warn"
                        : "text-danger",
                  )}
                >
                  {fmtMs(r.ms)}
                </span>
                <span
                  aria-hidden
                  className="hidden items-center justify-center @min-[40rem]:flex"
                >
                  {mark === "right" ? (
                    <Check className="size-3.5 text-success" />
                  ) : mark === "slow" ? (
                    <span className="font-mono text-[10px] tracking-[0.08em] text-warn uppercase">
                      slow
                    </span>
                  ) : (
                    <X className="size-3.5 text-danger" />
                  )}
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
}
