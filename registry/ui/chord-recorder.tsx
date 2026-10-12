"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowLeftRight,
  Circle,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  SearchX,
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
export type ChordModifier = "ctrl" | "alt" | "shift" | "mod";

/** One shortcut: the modifiers held and the key pressed with them. */
export type Chord = {
  mods: ChordModifier[];
  /** A canonical key: "K", "5", "/", "Space", "Tab", "ArrowUp", "F5", "Enter". */
  key: string;
};

export type ChordCommand = {
  id: string;
  /** What the command does, e.g. "Save all". */
  label: string;
  /** The heading it is listed under. */
  group: string;
  /** Shown beside the label from a 40rem container. */
  description?: string;
  /** What Reset all returns it to; null for a command that ships unbound. */
  defaultChord: Chord | null;
};

/** Command id to its chord; null is an unbound command. */
export type ChordMap = Record<string, Chord | null>;

export type ChordChange = {
  kind: "record" | "clear" | "swap" | "keep" | "reset";
  /** The command the press or key was aimed at; "*" for Reset all. */
  id: string;
  from: Chord | null;
  to: Chord | null;
  /** For a swap or a keep: the command that already held the chord. */
  other?: string;
};

export type ChordCapStyle = "raised" | "flat" | "outline";
export type ChordPlatform = "mac" | "windows";
export type ChordDensity = "compact" | "cozy" | "roomy";
export type ChordView = "list" | "sheet";
export type ChordStatus = "ready" | "loading" | "error";

export type ChordRecorderProps = {
  /** How a keycap is drawn: a raised cap with a front wall, a flat tinted cap, or a hairline outline. @default "raised" */
  capStyle?: ChordCapStyle;
  /** Which glyphs the caps show and which modifier `mod` records from: Command on a Mac, Control on Windows. @default "mac" */
  platform?: ChordPlatform;
  /** Row height, cap size and type size. @default "cozy" */
  density?: ChordDensity;
  /** The commands, in list order; consecutive commands with the same group share a heading. @default defaultChordCommands */
  commands?: ChordCommand[];
  /** Controlled chord map. */
  value?: ChordMap;
  /** Initial chord map when uncontrolled. @default the commands' default chords */
  defaultValue?: ChordMap;
  /** Fires from the key or press that changed a chord, with the whole map and the change. */
  onChange?: (value: ChordMap, change: ChordChange) => void;
  /** Controlled view: the list, or the cheat sheet. */
  view?: ChordView;
  /** Initial view when uncontrolled. @default "list" */
  defaultView?: ChordView;
  /** The cheat-sheet toggle was pressed. */
  onViewChange?: (view: ChordView) => void;
  /** Recording started on a command (its id) or ended (null). */
  onRecordingChange?: (id: string | null) => void;
  /** Whether the commands have arrived. @default "ready" */
  status?: ChordStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Keyboard shortcuts" */
  title?: string;
  /** The search field's placeholder. @default "Search commands" */
  searchPlaceholder?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the list scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be recorded, cleared or reset. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const c = (key: string, ...mods: ChordModifier[]): Chord => ({ mods, key });

/** Gaugeworks Studio's command set: 22 commands under five headings. */
export const defaultChordCommands: ChordCommand[] = [
  {
    id: "file.new",
    label: "New gauge",
    group: "File",
    description: "Start an empty gauge in a new tab",
    defaultChord: c("N", "mod"),
  },
  {
    id: "file.open",
    label: "Open",
    group: "File",
    description: "Browse the workspace",
    defaultChord: c("O", "mod"),
  },
  {
    id: "file.save",
    label: "Save",
    group: "File",
    description: "Write the active gauge",
    defaultChord: c("S", "mod"),
  },
  {
    id: "file.saveAll",
    label: "Save all",
    group: "File",
    description: "Write every open gauge",
    defaultChord: c("S", "mod", "shift"),
  },
  {
    id: "file.close",
    label: "Close tab",
    group: "File",
    defaultChord: c("W", "mod"),
  },
  {
    id: "edit.undo",
    label: "Undo",
    group: "Edit",
    defaultChord: c("Z", "mod"),
  },
  {
    id: "edit.redo",
    label: "Redo",
    group: "Edit",
    defaultChord: c("Z", "mod", "shift"),
  },
  {
    id: "edit.find",
    label: "Find",
    group: "Edit",
    description: "Search the active gauge",
    defaultChord: c("F", "mod"),
  },
  {
    id: "edit.replace",
    label: "Replace",
    group: "Edit",
    description: "Find and replace",
    defaultChord: c("F", "mod", "alt"),
  },
  {
    id: "edit.duplicate",
    label: "Duplicate line",
    group: "Edit",
    defaultChord: c("D", "mod", "shift"),
  },
  {
    id: "edit.comment",
    label: "Toggle comment",
    group: "Edit",
    defaultChord: c("/", "mod"),
  },
  {
    id: "view.palette",
    label: "Command palette",
    group: "View",
    description: "Every command, searchable",
    defaultChord: c("P", "mod", "shift"),
  },
  {
    id: "view.sidebar",
    label: "Toggle sidebar",
    group: "View",
    defaultChord: c("B", "mod"),
  },
  {
    id: "view.zoomIn",
    label: "Zoom in",
    group: "View",
    defaultChord: c("=", "mod"),
  },
  {
    id: "view.zoomOut",
    label: "Zoom out",
    group: "View",
    defaultChord: c("-", "mod"),
  },
  {
    id: "view.split",
    label: "Split editor",
    group: "View",
    description: "Open the active gauge beside itself",
    defaultChord: c("\\", "mod"),
  },
  {
    id: "nav.file",
    label: "Go to gauge",
    group: "Navigate",
    description: "Jump to a gauge by name",
    defaultChord: c("P", "mod"),
  },
  {
    id: "nav.line",
    label: "Go to line",
    group: "Navigate",
    defaultChord: c("G", "mod"),
  },
  {
    id: "nav.back",
    label: "Back",
    group: "Navigate",
    description: "Return to the last cursor position",
    defaultChord: c("-", "ctrl"),
  },
  {
    id: "nav.nextTab",
    label: "Next tab",
    group: "Navigate",
    defaultChord: c("Tab", "ctrl"),
  },
  {
    id: "run.start",
    label: "Run gauge",
    group: "Run",
    description: "Evaluate against live data",
    defaultChord: c("F5"),
  },
  {
    id: "run.stop",
    label: "Stop run",
    group: "Run",
    defaultChord: c("F5", "shift"),
  },
  {
    id: "run.inspect",
    label: "Inspect last run",
    group: "Run",
    description: "Open the run's trace",
    defaultChord: null,
  },
];

/** The chord map a command set ships with: every command at its default chord. */
export const chordMapOf = (commands: ChordCommand[]): ChordMap =>
  Object.fromEntries(commands.map((cmd) => [cmd.id, cmd.defaultChord]));

export const defaultChordMap: ChordMap = chordMapOf(defaultChordCommands);

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const MOD_ORDER: ChordModifier[] = ["ctrl", "alt", "shift", "mod"];

const MOD_GLYPH: Record<ChordPlatform, Record<ChordModifier, string>> = {
  mac: { ctrl: "⌃", alt: "⌥", shift: "⇧", mod: "⌘" },
  windows: { ctrl: "Ctrl", alt: "Alt", shift: "Shift", mod: "Ctrl" },
};

const MOD_WORD: Record<ChordPlatform, Record<ChordModifier, string>> = {
  mac: { ctrl: "Control", alt: "Option", shift: "Shift", mod: "Command" },
  windows: { ctrl: "Control", alt: "Alt", shift: "Shift", mod: "Control" },
};

const KEY_GLYPH: Record<ChordPlatform, Record<string, string>> = {
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

const sortMods = (mods: ChordModifier[]): ChordModifier[] =>
  MOD_ORDER.filter((m) => mods.includes(m));

/** A chord's identity, so two commands holding the same one can be found. */
export const chordId = (chord: Chord | null): string | null =>
  chord ? [...sortMods(chord.mods), chord.key].join("+") : null;

const capLabel = (key: string, platform: ChordPlatform): string =>
  KEY_GLYPH[platform][key] ?? key;

/** The caps a chord draws, in order, with a stable key for each. */
const capsOf = (
  chord: Chord,
  platform: ChordPlatform,
): { id: string; text: string }[] => [
  ...sortMods(chord.mods).map((m) => ({
    id: `mod:${m}`,
    text: MOD_GLYPH[platform][m],
  })),
  { id: `key:${chord.key}`, text: capLabel(chord.key, platform) },
];

/** The chord in words, for announcements and labels: "Command Shift S". */
export const chordWords = (
  chord: Chord | null,
  platform: ChordPlatform,
): string =>
  chord
    ? [
        ...sortMods(chord.mods).map((m) => MOD_WORD[platform][m]),
        KEY_WORD[chord.key] ?? chord.key,
      ].join(" ")
    : "unassigned";

/** The chord as searchable text: glyphs and words both match. */
const chordText = (chord: Chord | null, platform: ChordPlatform): string =>
  chord
    ? `${capsOf(chord, platform)
        .map((cap) => cap.text)
        .join(" ")} ${chordWords(chord, platform)}`
    : "";

const modsFromEvent = (
  event: KeyboardEvent | React.KeyboardEvent,
  platform: ChordPlatform,
): ChordModifier[] => {
  const mods: ChordModifier[] = [];
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

const sameChord = (a: Chord | null, b: Chord | null) =>
  chordId(a) === chordId(b);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const r3 = (v: number) => Number(v.toFixed(3));

const ROW_H: Record<ChordDensity, number> = {
  compact: 34,
  cozy: 42,
  roomy: 50,
};

const CAP_CLASS: Record<ChordDensity, string> = {
  compact: "h-5 min-w-5 px-1 text-[10px]",
  cozy: "h-6 min-w-6 px-1.5 text-[11px]",
  roomy: "h-7 min-w-7 px-2 text-xs",
};

const LABEL_CLASS: Record<ChordDensity, string> = {
  compact: "text-[12px]",
  cozy: "text-[13px]",
  roomy: "text-sm",
};

const KICK_MS = 70;

/* ----------------------------------------------------------------------- */
/*                                  Keycaps                                 */
/* ----------------------------------------------------------------------- */

const capFace = (style: ChordCapStyle) =>
  style === "raised"
    ? "border border-hairline-strong border-b-2 bg-surface-1 shadow-[inset_0_1px_0_color-mix(in_oklab,white_18%,transparent)]"
    : style === "flat"
      ? "border border-transparent bg-surface-2"
      : "border border-hairline-strong bg-transparent";

function Keycap({
  text,
  style,
  density,
  motionSafe,
  animate,
}: {
  text: string;
  style: ChordCapStyle;
  density: ChordDensity;
  motionSafe: boolean;
  /** False for the cheat sheet, whose caps never move. */
  animate: boolean;
}) {
  const wide = text.length > 1 && !/^[←-⏿]$/.test(text);
  return (
    <motion.kbd
      layout={animate && motionSafe ? "position" : false}
      initial={
        animate ? { opacity: 0, y: motionSafe ? -distances.nudge : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              ...springs.snap,
              layout: springs.glide,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2 font-mono leading-none whitespace-nowrap text-(--cr-cap-ink) transition-colors duration-200",
        wide ? "tracking-[0.02em]" : "",
        CAP_CLASS[density],
        capFace(style),
        style !== "outline" && "border-(--cr-cap-edge)",
      )}
    >
      {text}
    </motion.kbd>
  );
}

type CapTone = "ink" | "warn" | "accent";

const CAP_INK: Record<CapTone, string> = {
  ink: "var(--ink)",
  warn: "color-mix(in oklab, var(--warn) 78%, var(--ink))",
  accent: "var(--accent-bright)",
};

const CAP_EDGE: Record<CapTone, string> = {
  ink: "var(--hairline-strong)",
  warn: "color-mix(in oklab, var(--warn) 45%, var(--hairline-strong))",
  accent:
    "color-mix(in oklab, var(--accent-bright) 45%, var(--hairline-strong))",
};

type CapRunProps = {
  caps: { id: string; text: string }[];
  platform: ChordPlatform;
  style: ChordCapStyle;
  density: ChordDensity;
  motionSafe: boolean;
  /** False for the cheat sheet and the conflict strip, whose caps never move. */
  animate?: boolean;
  tone?: CapTone;
};

/** A run of caps keyed by what they say, so a cap that stays never re-lands. */
function CapRun({
  caps,
  platform,
  style,
  density,
  motionSafe,
  animate = true,
  tone = "ink",
}: CapRunProps) {
  const sep = platform === "windows";
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        ["--cr-cap-ink" as string]: CAP_INK[tone],
        ["--cr-cap-edge" as string]: CAP_EDGE[tone],
      }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {caps.map((cap, i) => (
          <React.Fragment key={cap.id}>
            {sep && i > 0 ? (
              <motion.span
                aria-hidden
                layout={animate && motionSafe ? "position" : false}
                initial={animate ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                className="font-mono text-[10px] text-ink-3"
              >
                +
              </motion.span>
            ) : null}
            <Keycap
              text={cap.text}
              style={style}
              density={density}
              motionSafe={motionSafe}
              animate={animate}
            />
          </React.Fragment>
        ))}
      </AnimatePresence>
    </span>
  );
}

function ChordCaps({
  chord,
  ...rest
}: Omit<CapRunProps, "caps"> & { chord: Chord }) {
  return <CapRun caps={capsOf(chord, rest.platform)} {...rest} />;
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type Recording = {
  id: string;
  mods: ChordModifier[];
  key: string | null;
};

type Conflict = {
  id: string;
  otherId: string;
  chord: Chord;
};

type RowProps = {
  cmd: ChordCommand;
  chord: Chord | null;
  index: number;
  platform: ChordPlatform;
  capStyle: ChordCapStyle;
  density: ChordDensity;
  motionSafe: boolean;
  active: boolean;
  inert: boolean;
  changed: boolean;
  ambiguous: boolean;
  recording: Recording | null;
  pulsing: boolean;
  conflict: Conflict | null;
  /** This row holds the chord another row just tried to take. */
  contested: boolean;
  kicked: boolean;
  otherLabel: string | null;
  nodeRef: (node: HTMLDivElement | null) => void;
  swapRef: React.RefObject<HTMLButtonElement | null>;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyUp: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onBlur: (event: React.FocusEvent<HTMLDivElement>) => void;
  onRecord: () => void;
  onClear: () => void;
  onSwap: () => void;
  onKeep: () => void;
  onCancel: () => void;
};

function Row({
  cmd,
  chord,
  index,
  platform,
  capStyle,
  density,
  motionSafe,
  active,
  inert,
  changed,
  ambiguous,
  recording,
  pulsing,
  conflict,
  contested,
  kicked,
  otherLabel,
  nodeRef,
  swapRef,
  onFocus,
  onKeyDown,
  onKeyUp,
  onBlur,
  onRecord,
  onClear,
  onSwap,
  onKeep,
  onCancel,
}: RowProps) {
  const isRecording = recording !== null;
  const draft: Chord | null = recording
    ? recording.mods.length > 0 || recording.key
      ? { mods: recording.mods, key: recording.key ?? "" }
      : null
    : null;
  const draftCaps = draft
    ? [
        ...sortMods(draft.mods).map((m) => ({
          id: `mod:${m}`,
          text: MOD_GLYPH[platform][m],
        })),
        ...(draft.key
          ? [{ id: `key:${draft.key}`, text: capLabel(draft.key, platform) }]
          : []),
      ]
    : [];
  const hasConflict = conflict !== null;

  const state = isRecording
    ? "recording"
    : hasConflict
      ? "conflict"
      : contested
        ? "contested"
        : ambiguous
          ? "ambiguous"
          : "idle";

  const description = `${cmd.label}, ${chordWords(chord, platform)}${
    ambiguous ? ", ambiguous" : ""
  }${changed ? ", changed" : ""}`;

  return (
    <motion.div
      layout={motionSafe ? "position" : false}
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        y: motionSafe
          ? { ...springs.glide, delay: r3(Math.min(index, 10) * cascade(12)) }
          : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className="relative"
    >
      <motion.div
        ref={nodeRef}
        role="option"
        aria-selected={active}
        aria-label={description}
        aria-disabled={inert || undefined}
        tabIndex={active ? 0 : -1}
        data-state={state}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
        initial={false}
        animate={{ x: kicked && motionSafe ? -distances.step : 0 }}
        transition={motionSafe ? springs.recoil : { duration: 0 }}
        style={{ minHeight: ROW_H[density] }}
        className={cn(
          "group/row grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded-3 px-2 transition-colors duration-200",
          !inert && "hover:bg-surface-1",
          state === "recording" && "bg-cobalt-wash",
          (state === "conflict" || state === "contested") &&
            "bg-[color-mix(in_oklab,var(--warn)_12%,transparent)]",
          state === "contested" &&
            "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--warn)_55%,transparent)]",
          FOCUS_RING,
        )}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            aria-hidden
            className={cn(
              "flex size-1.5 shrink-0 self-center rounded-full transition-colors",
              changed ? "bg-cobalt-bright" : "bg-transparent",
            )}
          />
          <span className={cn("min-w-0 truncate", LABEL_CLASS[density])}>
            {cmd.label}
          </span>
          {cmd.description ? (
            <span className="hidden min-w-0 truncate text-[11px] text-ink-3 @min-[40rem]:inline">
              {cmd.description}
            </span>
          ) : null}
          {ambiguous && !isRecording ? (
            <span className="hidden shrink-0 rounded-1 border border-[color-mix(in_oklab,var(--warn)_45%,transparent)] px-1 py-px font-mono text-[9px] tracking-[0.08em] text-warn uppercase @min-[30rem]:inline">
              ambiguous
            </span>
          ) : null}
        </div>

        <motion.div
          layout={motionSafe ? "position" : false}
          transition={{ layout: springs.glide }}
          className="relative flex min-w-[4.5rem] items-center justify-end gap-1"
        >
          {isRecording ? (
            <span className="relative inline-flex items-center gap-1">
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 -left-4 size-2.5 -translate-y-1/2 rounded-full"
              >
                <span className="absolute inset-0 rounded-full bg-cobalt-bright" />
                {motionSafe ? (
                  <motion.span
                    className="absolute inset-0 rounded-full border border-cobalt-bright"
                    initial={{ scale: 1, opacity: 0.7 }}
                    animate={
                      pulsing
                        ? { scale: [1, 2.6], opacity: [0.7, 0] }
                        : { scale: 1, opacity: 0 }
                    }
                    transition={
                      pulsing
                        ? {
                            duration: durations.page * 2,
                            ease: easings.enter,
                            repeat: Infinity,
                          }
                        : { duration: durations.fast }
                    }
                  />
                ) : (
                  <span className="absolute -inset-1 rounded-full border border-cobalt-bright opacity-60" />
                )}
              </span>
              {draftCaps.length === 0 ? (
                <span className="font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase">
                  Press keys
                </span>
              ) : null}
              <CapRun
                caps={draftCaps}
                platform={platform}
                style={capStyle}
                density={density}
                motionSafe={motionSafe}
                tone="accent"
              />
            </span>
          ) : chord ? (
            <ChordCaps
              chord={chord}
              platform={platform}
              style={capStyle}
              density={density}
              motionSafe={motionSafe}
              tone={ambiguous || contested ? "warn" : "ink"}
            />
          ) : (
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Unassigned
            </span>
          )}
        </motion.div>

        <div className="flex items-center gap-0.5">
          {isRecording ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Cancel recording ${cmd.label}`}
              onPointerDown={(event) => event.preventDefault()}
              onClick={onCancel}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3" />
              <span className="hidden @min-[30rem]:inline">Esc</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Record ${cmd.label}`}
                aria-disabled={inert || hasConflict || undefined}
                onClick={onRecord}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                  inert || hasConflict
                    ? "cursor-default text-ink-3"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Circle
                  aria-hidden
                  className={cn(
                    "size-2.5",
                    inert ? "text-ink-3" : "fill-danger text-danger",
                  )}
                />
                <span className="hidden @min-[30rem]:inline">Record</span>
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Clear ${cmd.label}`}
                aria-disabled={inert || !chord || hasConflict || undefined}
                onClick={onClear}
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-2 transition-opacity",
                  inert || !chord || hasConflict
                    ? "cursor-default opacity-0"
                    : "text-ink-3 opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3" />
              </button>
            </>
          )}
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {hasConflict && conflict ? (
          <motion.div
            key="conflict"
            role="group"
            aria-label={`${chordWords(conflict.chord, platform)} already belongs to ${otherLabel ?? "another command"}`}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              }
            }}
            className="mx-2 mt-1 mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] px-2.5 py-2"
          >
            <TriangleAlert
              aria-hidden
              className="size-3.5 shrink-0 text-warn"
            />
            <p className="min-w-0 flex-1 text-[12px] text-foreground">
              <span className="inline-flex items-center gap-1 align-middle">
                <ChordCaps
                  chord={conflict.chord}
                  platform={platform}
                  style={capStyle}
                  density="compact"
                  motionSafe={false}
                  animate={false}
                  tone="warn"
                />
              </span>{" "}
              already belongs to{" "}
              <span className="font-medium">{otherLabel}</span>.
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <button
                ref={swapRef}
                type="button"
                onClick={onSwap}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-2 bg-primary px-2.5 text-xs text-primary-foreground transition-opacity hover:opacity-90",
                  FOCUS_RING,
                )}
              >
                <ArrowLeftRight aria-hidden className="size-3" />
                Swap
              </button>
              <button
                type="button"
                onClick={onKeep}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                Keep both
              </button>
              <button
                type="button"
                onClick={onCancel}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Section = { key: string; group: string; commands: ChordCommand[] };

/** Consecutive commands under one heading. A heading's key is its name, so
 *  a search that hides its first command moves the group rather than
 *  remounting it; a name that recurs later gets a numbered key. */
const sectionsOf = (commands: ChordCommand[]): Section[] => {
  const out: Section[] = [];
  const seen = new Map<string, number>();
  for (const cmd of commands) {
    const last = out[out.length - 1];
    if (last && last.group === cmd.group) {
      last.commands.push(cmd);
      continue;
    }
    const n = seen.get(cmd.group) ?? 0;
    seen.set(cmd.group, n + 1);
    out.push({
      key: n === 0 ? cmd.group : `${cmd.group}#${n}`,
      group: cmd.group,
      commands: [cmd],
    });
  }
  return out;
};

/**
 * A shortcut settings surface where every chord is recorded, not typed. Each
 * command's chord is drawn as keycaps; Record (or R on the focused row) turns
 * the row into a listener: the caps clear, a pulse rings beside the slot, and
 * the chord assembles cap by cap as modifiers and a key are held, each cap
 * landing on `springs.snap`. Releasing or Enter commits; Escape or leaving the
 * row cancels. The keys are captured on the row alone and never reach the
 * page.
 *
 * A chord that another command already holds is a conflict: the row kicks
 * sideways and settles on `springs.recoil`, the other row lights amber, and a
 * strip beneath offers Swap, Keep both (both rows then wear an amber
 * "ambiguous" mark until one changes) or Cancel. The search field filters the
 * list with rows and headings reflowing on `springs.glide`; Reset all returns
 * every changed row to its default with the caps landing on `springs.snap`;
 * the cheat-sheet toggle lays every chord out as a grid for printing.
 *
 * The list is one listbox: Up/Down and Home/End move, R or Enter records,
 * Delete clears, Escape cancels, and "/" jumps to the search field. Under
 * reduced motion nothing travels or pulses: caps and rows cross-fade in place,
 * the conflict row is highlighted without the kick, and a still ring marks the
 * listening slot.
 */
export function ChordRecorder({
  capStyle = "raised",
  platform = "mac",
  density = "cozy",
  commands = defaultChordCommands,
  value,
  defaultValue,
  onChange,
  view,
  defaultView = "list",
  onViewChange,
  onRecordingChange,
  status = "ready",
  onRetry,
  title = "Keyboard shortcuts",
  searchPlaceholder = "Search commands",
  label,
  height = 540,
  disabled = false,
  className,
}: ChordRecorderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const listId = `${uid}-list`;
  const searchId = `${uid}-search`;

  const [own, setOwn] = React.useState<ChordMap>(
    () => defaultValue ?? chordMapOf(commands),
  );
  const current = value ?? own;
  const [ownView, setOwnView] = React.useState<ChordView>(defaultView);
  const currentView = view ?? ownView;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [query, setQuery] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [rawRecording, setRecording] = React.useState<Recording | null>(null);
  const [conflict, setConflict] = React.useState<Conflict | null>(null);
  const [kicked, setKicked] = React.useState<string | null>(null);
  const [awake, setAwake] = React.useState(true);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const swapRef = React.useRef<HTMLButtonElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const kickTimer = React.useRef<number | null>(null);
  // Keys seen going down during this recording; a keyup for any other key
  // (the R or Enter that started it) is not a release.
  const seenDown = React.useRef(new Set<string>());

  /* -------------------------------- data ------------------------------- */

  const byId = React.useMemo(
    () => new Map(commands.map((cmd) => [cmd.id, cmd])),
    [commands],
  );
  // Recording ends with its row: a reload or the command set changing cannot
  // leave a listener pointing at a command that is no longer there.
  const recording =
    rawRecording && byId.has(rawRecording.id) ? rawRecording : null;
  const chordOf = (id: string): Chord | null => current[id] ?? null;

  const holders = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const cmd of commands) {
      const key = chordId(current[cmd.id] ?? null);
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(cmd.id);
      else map.set(key, [cmd.id]);
    }
    return map;
  }, [commands, current]);

  const isAmbiguous = (id: string) =>
    (holders.get(chordId(chordOf(id)) ?? "")?.length ?? 0) > 1;

  const changedIds = commands
    .filter((cmd) => !sameChord(chordOf(cmd.id), cmd.defaultChord))
    .map((cmd) => cmd.id);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? commands.filter((cmd) =>
        `${cmd.label} ${cmd.group} ${cmd.description ?? ""} ${chordText(chordOf(cmd.id), platform)}`
          .toLowerCase()
          .includes(needle),
      )
    : commands;
  const sections = sectionsOf(visible);
  const visibleIds = visible.map((cmd) => cmd.id);
  const indexOf = new Map(visibleIds.map((id, i) => [id, i]));
  const activeRow =
    activeId && visibleIds.includes(activeId)
      ? activeId
      : (visibleIds[0] ?? null);

  /* ------------------------------ lifecycle ---------------------------- */

  React.useEffect(
    () => () => {
      if (kickTimer.current !== null) window.clearTimeout(kickTimer.current);
    },
    [],
  );

  // The pulse only runs while someone can see it: a hidden tab or a root
  // scrolled off screen stops it, and it resumes when they come back.
  const isRecording = recording !== null;
  React.useEffect(() => {
    if (!isRecording) return;
    const root = rootRef.current;
    let seen = true;
    let shown = !document.hidden;
    const sync = () => setAwake(seen && shown);
    const onVis = () => {
      shown = !document.hidden;
      sync();
    };
    document.addEventListener("visibilitychange", onVis);
    let io: IntersectionObserver | null = null;
    if (root && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        seen = entries.some((e) => e.isIntersecting);
        sync();
      });
      io.observe(root);
    }
    sync();
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
      setAwake(true);
    };
  }, [isRecording]);

  React.useEffect(() => {
    onRecordingChange?.(recording?.id ?? null);
    // Only the id matters to the host, not each assembled cap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording?.id]);

  // Focus moves to Swap when a conflict opens, so the choice is a keypress
  // away; the other row is brought into view beside it.
  React.useLayoutEffect(() => {
    if (!conflict) return;
    swapRef.current?.focus({ preventScroll: true });
    rowNodes.current
      .get(conflict.otherId)
      ?.scrollIntoView({ block: "nearest" });
  }, [conflict]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: ChordMap, change: ChordChange) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, change);
  };

  const focusRow = (id: string) => {
    rowNodes.current.get(id)?.focus({ preventScroll: true });
  };

  const startRecording = (id: string) => {
    if (inert || conflict) return;
    seenDown.current = new Set();
    setRecording({ id, mods: [], key: null });
    setActiveId(id);
    const cmd = byId.get(id);
    setAnnouncement(`Recording ${cmd?.label ?? id}. Press keys.`);
    // The row owns the keys while it listens.
    focusRow(id);
  };

  const cancelRecording = (announce = true) => {
    const rec = recording;
    if (!rec) return;
    setRecording(null);
    const cmd = byId.get(rec.id);
    if (announce) {
      setAnnouncement(
        `Recording cancelled. ${cmd?.label ?? rec.id} is still ${chordWords(chordOf(rec.id), platform)}.`,
      );
    }
  };

  const kick = (id: string) => {
    if (kickTimer.current !== null) window.clearTimeout(kickTimer.current);
    setKicked(id);
    kickTimer.current = window.setTimeout(() => {
      kickTimer.current = null;
      setKicked(null);
    }, KICK_MS);
  };

  const commitRecording = (chord: Chord) => {
    const rec = recording;
    if (!rec) return;
    const id = rec.id;
    const cmd = byId.get(id);
    setRecording(null);
    const key = chordId(chord) ?? "";
    const otherId = (holders.get(key) ?? []).find((h) => h !== id);
    if (otherId) {
      const other = byId.get(otherId);
      setConflict({ id, otherId, chord });
      kick(id);
      setAnnouncement(
        `Conflict: ${chordWords(chord, platform)} already belongs to ${other?.label ?? otherId}. Swap, keep both, or cancel.`,
      );
      return;
    }
    const from = chordOf(id);
    if (sameChord(from, chord)) {
      setAnnouncement(
        `${cmd?.label ?? id} is still ${chordWords(chord, platform)}.`,
      );
      return;
    }
    commit(
      { ...current, [id]: chord },
      { kind: "record", id, from, to: chord },
    );
    setAnnouncement(
      `${cmd?.label ?? id} set to ${chordWords(chord, platform)}.`,
    );
  };

  const clearChord = (id: string) => {
    if (inert || conflict) return;
    const from = chordOf(id);
    if (!from) return;
    commit({ ...current, [id]: null }, { kind: "clear", id, from, to: null });
    setAnnouncement(`${byId.get(id)?.label ?? id} cleared.`);
  };

  const resolveSwap = () => {
    if (!conflict) return;
    const { id, otherId, chord } = conflict;
    const mine = chordOf(id);
    const next: ChordMap = { ...current, [id]: chord, [otherId]: mine };
    setConflict(null);
    commit(next, { kind: "swap", id, from: mine, to: chord, other: otherId });
    setAnnouncement(
      `Swapped. ${byId.get(id)?.label ?? id} is ${chordWords(chord, platform)}; ${
        byId.get(otherId)?.label ?? otherId
      } is ${chordWords(mine, platform)}.`,
    );
    focusRow(id);
  };

  const resolveKeep = () => {
    if (!conflict) return;
    const { id, otherId, chord } = conflict;
    const mine = chordOf(id);
    setConflict(null);
    commit(
      { ...current, [id]: chord },
      { kind: "keep", id, from: mine, to: chord, other: otherId },
    );
    setAnnouncement(
      `Kept both. ${chordWords(chord, platform)} is ambiguous between ${
        byId.get(id)?.label ?? id
      } and ${byId.get(otherId)?.label ?? otherId}.`,
    );
    focusRow(id);
  };

  const resolveCancel = () => {
    if (!conflict) return;
    const { id } = conflict;
    setConflict(null);
    setAnnouncement(
      `Cancelled. ${byId.get(id)?.label ?? id} is still ${chordWords(chordOf(id), platform)}.`,
    );
    focusRow(id);
  };

  const resetAll = () => {
    if (inert || changedIds.length === 0) return;
    cancelRecording(false);
    setConflict(null);
    const next = chordMapOf(commands);
    commit(next, { kind: "reset", id: "*", from: null, to: null });
    setAnnouncement(
      `Reset ${changedIds.length} ${changedIds.length === 1 ? "shortcut" : "shortcuts"} to defaults.`,
    );
  };

  const setView = (next: ChordView) => {
    if (next === currentView) return;
    cancelRecording(false);
    setConflict(null);
    if (view === undefined) setOwnView(next);
    onViewChange?.(next);
    setAnnouncement(
      next === "sheet" ? "Showing the cheat sheet." : "Showing the list.",
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const moveTo = (index: number) => {
    const target = visibleIds[clamp(index, 0, visibleIds.length - 1)];
    if (target) focusRow(target);
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
    index: number,
  ) => {
    const rec = recording;
    if (rec && rec.id === id) {
      // Listening: nothing leaves the row.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      if (event.key === "Escape") {
        cancelRecording();
        return;
      }
      seenDown.current.add(event.key);
      const mods = modsFromEvent(event, platform);
      if (event.key === "Enter" && mods.length === 0) {
        // Bare Enter commits what has been assembled, or is nothing to commit.
        if (rec.key) commitRecording({ mods: rec.mods, key: rec.key });
        return;
      }
      const key = keyFromEvent(event);
      setRecording({ id, mods, key: key ?? rec.key });
      return;
    }
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveTo(index - 1);
        return;
      case "Home":
        event.preventDefault();
        moveTo(0);
        return;
      case "End":
        event.preventDefault();
        moveTo(visibleIds.length - 1);
        return;
      case "r":
      case "R":
      case "Enter":
      case " ":
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        startRecording(id);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        clearChord(id);
        return;
      case "Escape":
        if (conflict) {
          event.preventDefault();
          resolveCancel();
        }
        return;
      case "/":
        event.preventDefault();
        searchRef.current?.focus();
        return;
      default:
        return;
    }
  };

  const onRowKeyUp = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    const rec = recording;
    if (!rec || rec.id !== id) return;
    event.preventDefault();
    event.stopPropagation();
    if (!seenDown.current.has(event.key)) return;
    if (rec.key) {
      // Any release once a key is in the chord commits it; on a Mac the
      // letter's own keyup never arrives while Command is held, but Command's
      // does.
      commitRecording({ mods: rec.mods, key: rec.key });
      return;
    }
    // Only modifiers so far: a release takes its cap away again.
    setRecording({ id, mods: modsFromEvent(event, platform), key: null });
  };

  const onRowBlur = (event: React.FocusEvent<HTMLDivElement>, id: string) => {
    const rec = recording;
    if (!rec || rec.id !== id) return;
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    cancelRecording();
  };

  /* ------------------------------- render ------------------------------ */

  const total = commands.length;
  const changedCount = changedIds.length;

  const renderSkeleton = () => (
    <div aria-hidden className="flex flex-col gap-1 px-3 py-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 px-2"
          style={{ height: ROW_H[density] }}
        >
          <span
            className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{
              width: `${34 + ((i * 29) % 30)}%`,
              animationDelay: `${i * 70}ms`,
            }}
          />
          <span className="flex gap-1">
            {Array.from({ length: 2 + (i % 2) }, (_, j) => (
              <span
                key={j}
                className="size-6 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 70 + j * 40}ms` }}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );

  const renderError = () => (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <TriangleAlert aria-hidden className="size-5 text-danger" />
      <p className="text-sm text-foreground">The shortcuts didn&apos;t load.</p>
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

  const renderEmpty = () =>
    total === 0 ? (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <List aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-ink-2">No commands to map yet.</p>
        <p className="text-[11px] text-ink-3">
          Commands appear here as the product registers them.
        </p>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <SearchX aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-ink-2">
          No command matches &ldquo;{query.trim()}&rdquo;.
        </p>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
          className={cn(
            "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          Clear search
        </button>
      </div>
    );

  const listView = (
    <LayoutGroup id={uid}>
      <div
        id={listId}
        role="listbox"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className="flex flex-col px-1.5 py-1.5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {sections.map((section) => (
            <motion.div
              key={section.key}
              role="group"
              aria-label={section.group}
              layout={motionSafe ? "position" : false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                layout: springs.glide,
                opacity: { duration: durations.base, ease: easings.enter },
              }}
              className="flex flex-col"
            >
              <div className="flex items-center gap-2 px-2 pt-3 pb-1">
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {section.group}
                </span>
                <span aria-hidden className="h-px flex-1 bg-hairline" />
              </div>
              <AnimatePresence initial={false} mode="popLayout">
                {section.commands.map((cmd) => {
                  const i = indexOf.get(cmd.id) ?? 0;
                  const chord = chordOf(cmd.id);
                  const rowConflict =
                    conflict && conflict.id === cmd.id ? conflict : null;
                  return (
                    <Row
                      key={cmd.id}
                      cmd={cmd}
                      chord={chord}
                      index={i}
                      platform={platform}
                      capStyle={capStyle}
                      density={density}
                      motionSafe={motionSafe}
                      active={activeRow === cmd.id}
                      inert={inert}
                      changed={changedIds.includes(cmd.id)}
                      ambiguous={isAmbiguous(cmd.id)}
                      recording={
                        recording && recording.id === cmd.id ? recording : null
                      }
                      pulsing={awake}
                      conflict={rowConflict}
                      contested={conflict?.otherId === cmd.id}
                      kicked={kicked === cmd.id}
                      otherLabel={
                        rowConflict
                          ? (byId.get(rowConflict.otherId)?.label ?? null)
                          : null
                      }
                      nodeRef={(node) => {
                        if (node) rowNodes.current.set(cmd.id, node);
                        else rowNodes.current.delete(cmd.id);
                      }}
                      swapRef={swapRef}
                      onFocus={() => setActiveId(cmd.id)}
                      onKeyDown={(event) => onRowKeyDown(event, cmd.id, i)}
                      onKeyUp={(event) => onRowKeyUp(event, cmd.id)}
                      onBlur={(event) => onRowBlur(event, cmd.id)}
                      onRecord={() => startRecording(cmd.id)}
                      onClear={() => clearChord(cmd.id)}
                      onSwap={resolveSwap}
                      onKeep={resolveKeep}
                      onCancel={() => {
                        if (recording?.id === cmd.id) {
                          cancelRecording();
                          focusRow(cmd.id);
                        } else resolveCancel();
                      }}
                    />
                  );
                })}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );

  const renderSheet = () => (
    <div
      role="list"
      aria-label={`${title}, cheat sheet`}
      className="grid grid-cols-1 gap-x-4 gap-y-3 px-4 py-3 @min-[40rem]:grid-cols-2 @min-[64rem]:grid-cols-3"
    >
      {sections.map((section, s) => (
        <motion.div
          key={section.key}
          role="listitem"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            y: motionSafe
              ? { ...springs.glide, delay: r3(s * cascade(sections.length)) }
              : { duration: 0 },
            opacity: { duration: durations.base, ease: easings.enter },
          }}
          className="flex flex-col rounded-3 border border-hairline bg-surface-0"
        >
          <p className="border-b border-hairline px-3 py-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {section.group}
          </p>
          <dl className="flex flex-col px-3 py-1.5">
            {section.commands.map((cmd) => {
              const chord = chordOf(cmd.id);
              const amb = isAmbiguous(cmd.id);
              return (
                <div
                  key={cmd.id}
                  className="flex items-center justify-between gap-3 py-1"
                >
                  <dt className="min-w-0 truncate text-[12px] text-foreground">
                    {cmd.label}
                    {amb ? (
                      <span className="ml-1.5 font-mono text-[9px] tracking-[0.08em] text-warn uppercase">
                        ambiguous
                      </span>
                    ) : null}
                  </dt>
                  <dd className="shrink-0">
                    {chord ? (
                      <>
                        <span className="sr-only">
                          {chordWords(chord, platform)}
                        </span>
                        <span aria-hidden>
                          <ChordCaps
                            chord={chord}
                            platform={platform}
                            style={capStyle}
                            density="compact"
                            motionSafe={false}
                            animate={false}
                            tone={amb ? "warn" : "ink"}
                          />
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        none
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </motion.div>
      ))}
    </div>
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
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move between commands. R or Enter records a new shortcut:
        hold the keys, release or press Enter to keep them, Escape to cancel.
        Delete clears a shortcut. Slash jumps to the search field.
      </p>

      <header className="flex shrink-0 flex-col gap-2 px-4 pt-3 pb-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
              {title}
            </p>
            {ready ? (
              <p className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:block">
                {platform === "mac" ? "Mac" : "Windows"}
                {changedCount > 0 ? (
                  <>
                    {" "}
                    &middot;{" "}
                    <span className="text-cobalt-bright">
                      {changedCount}
                    </span>{" "}
                    changed
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div
              role="group"
              aria-label="View"
              className="relative flex h-7 items-center rounded-2 border border-hairline p-0.5"
            >
              {(["list", "sheet"] as const).map((v) => {
                const on = currentView === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    aria-label={v === "list" ? "List" : "Cheat sheet"}
                    onClick={() => setView(v)}
                    className={cn(
                      "relative inline-flex h-full items-center gap-1 rounded-[4px] px-1.5 text-xs transition-colors",
                      on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                      FOCUS_RING,
                    )}
                  >
                    {on ? (
                      <motion.span
                        aria-hidden
                        layoutId={`${uid}-view`}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                        className="absolute inset-0 rounded-[4px] bg-surface-2"
                      />
                    ) : null}
                    <span className="relative flex items-center gap-1">
                      {v === "list" ? (
                        <List aria-hidden className="size-3.5" />
                      ) : (
                        <LayoutGrid aria-hidden className="size-3.5" />
                      )}
                      <span className="hidden @min-[40rem]:inline">
                        {v === "list" ? "List" : "Sheet"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={resetAll}
              aria-disabled={inert || changedCount === 0 || undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
                !inert && changedCount > 0
                  ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                  : "cursor-default text-ink-3",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              <span className="hidden @min-[30rem]:inline">Reset all</span>
            </button>
          </div>
        </div>

        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
          />
          <input
            ref={searchRef}
            id={searchId}
            type="search"
            value={query}
            disabled={!ready}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              if (recording) cancelRecording(false);
              setConflict(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                if (query) setQuery("");
                else if (activeRow) focusRow(activeRow);
              } else if (event.key === "ArrowDown" && activeRow) {
                event.preventDefault();
                focusRow(activeRow);
              }
            }}
            className={cn(
              "h-8 w-full rounded-2 border border-hairline bg-surface-0 pr-8 pl-8 text-[13px] text-foreground placeholder:text-ink-3 disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden",
              FOCUS_RING,
            )}
          />
          <AnimatePresence initial={false}>
            {query ? (
              <motion.button
                key="clear"
                type="button"
                aria-label="Clear search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
                onClick={() => {
                  setQuery("");
                  searchRef.current?.focus();
                }}
                className={cn(
                  "absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3.5" />
              </motion.button>
            ) : null}
          </AnimatePresence>
          {ready && needle ? (
            <p className="sr-only" role="status">
              {visible.length} of {total}{" "}
              {visible.length === 1 ? "command matches" : "commands match"}.
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "error" ? (
          renderError()
        ) : status === "loading" ? (
          renderSkeleton()
        ) : visible.length === 0 ? (
          renderEmpty()
        ) : (
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {currentView === "sheet" ? renderSheet() : listView}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
