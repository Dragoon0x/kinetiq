"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, Search, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

/**
 * One command and its shortcut. Bindings are platform-neutral strings:
 * modifiers `Mod` (Command on a Mac, Control elsewhere), `Ctrl` (Control on a
 * Mac), `Alt`, `Shift`, then one key — `"Mod+Shift+K"`, `"Mod+Backslash"`.
 */
export type ChordCommand = {
  id: string;
  label: string;
  /** The group it is listed under. */
  area: string;
  /** Its shortcut, or null for none. */
  binding: string | null;
  /** What Reset goes back to. @default the starting binding */
  defaultBinding?: string | null;
  /** A short line under the label. */
  description?: string;
};

export type ChordBindings = Record<string, string | null>;
export type ChordPlatform = "auto" | "mac" | "other";
export type ChordStatus = "ready" | "loading" | "error";
export type ChordKeycapStyle = "raised" | "flat" | "outline";
export type ChordDensity = "compact" | "regular" | "roomy";
export type ChordAccent = "cobalt" | "signal" | "amber" | "graphite";

export type ChordRecorderProps = {
  /** The commands, in the order they are listed within their areas. @default defaultChordCommands */
  commands?: ChordCommand[];
  /** Controlled bindings, command id to binding (or null). */
  value?: ChordBindings;
  /** Initial bindings when uncontrolled. @default each command's `binding` */
  defaultValue?: ChordBindings;
  /** Fires with every binding after a record, clear, swap or reset. */
  onValueChange?: (bindings: ChordBindings) => void;
  /** A command got a new shortcut, or lost it (null). */
  onBind?: (id: string, binding: string | null) => void;
  /** A clash was settled by swapping: `id` took `binding`, `otherId` took what `id` had. */
  onSwap?: (id: string, otherId: string, binding: string) => void;
  /** Reset was pressed for one command, or Reset all (null). */
  onReset?: (id: string | null) => void;
  /** Which modifier labels to draw. "auto" reads the platform after mount. @default "auto" */
  platform?: ChordPlatform;
  /** Text in the search field at first. @default "" */
  defaultQuery?: string;
  /** A chord needs Command, Control or Option (Alt) unless it is a function key. @default true */
  requireModifier?: boolean;
  /** Whether the shortcuts have loaded. @default "ready" */
  status?: ChordStatus;
  /** "Try again" was pressed after the shortcuts failed to load. */
  onRetry?: () => void;
  /** Keycap look: a raised key with a lip, a flat tile, or a hairline outline. @default "raised" */
  keycapStyle?: ChordKeycapStyle;
  /** Row height and type size. @default "regular" */
  density?: ChordDensity;
  /** Lit keys, the recording well and search marks: a named token or any CSS colour. @default "cobalt" */
  accent?: ChordAccent | (string & {});
  /** Play a click as each key lands. Off unless asked for. @default false */
  sound?: boolean;
  /** The heading. @default "Keyboard shortcuts" */
  title?: string;
  /** Height of the editor, px; the list scrolls inside. @default 520 */
  height?: number;
  /** Bindings cannot be recorded, cleared or reset; the editor dims. @default false */
  disabled?: boolean;
  /** Classes for the outer editor. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultChordCommands: ChordCommand[] = [
  {
    id: "palette",
    label: "Open command menu",
    area: "General",
    binding: "Mod+K",
  },
  {
    id: "search",
    label: "Search everywhere",
    area: "General",
    binding: "Mod+Shift+F",
    description: "Pages, people and comments",
  },
  { id: "new", label: "New page", area: "General", binding: "Mod+N" },
  {
    id: "settings",
    label: "Open settings",
    area: "General",
    binding: "Mod+Comma",
  },
  {
    id: "back",
    label: "Go back",
    area: "Navigation",
    binding: "Mod+BracketLeft",
  },
  {
    id: "forward",
    label: "Go forward",
    area: "Navigation",
    binding: "Mod+BracketRight",
  },
  {
    id: "inbox",
    label: "Jump to inbox",
    area: "Navigation",
    binding: "Mod+1",
  },
  {
    id: "recent",
    label: "Recent pages",
    area: "Navigation",
    binding: "Mod+P",
  },
  {
    id: "bold",
    label: "Bold",
    area: "Editing",
    binding: "Mod+B",
    description: "The selection, or what you type next",
  },
  { id: "italic", label: "Italic", area: "Editing", binding: "Mod+I" },
  {
    id: "link",
    label: "Insert link",
    area: "Editing",
    binding: "Mod+Shift+K",
  },
  {
    id: "comment",
    label: "Add comment",
    area: "Editing",
    binding: "Mod+Alt+M",
  },
  {
    id: "block",
    label: "Copy link to block",
    area: "Editing",
    binding: null,
  },
  {
    id: "sidebar",
    label: "Toggle sidebar",
    area: "View",
    binding: "Mod+Backslash",
  },
  {
    id: "focus",
    label: "Focus mode",
    area: "View",
    binding: "Mod+Shift+Enter",
    description: "Hides everything but the page",
  },
  { id: "zoomIn", label: "Zoom in", area: "View", binding: "Mod+Equal" },
  { id: "zoomOut", label: "Zoom out", area: "View", binding: "Mod+Minus" },
];

/* ----------------------------------------------------------------------- */
/*                               Key vocabulary                             */
/* ----------------------------------------------------------------------- */

const MODS = ["Mod", "Ctrl", "Alt", "Shift"] as const;
type Mod = (typeof MODS)[number];
const isMod = (part: string): part is Mod =>
  (MODS as readonly string[]).includes(part);

/** Keys named by their physical code, so Option or a layout never changes them. */
const PUNCT: Record<string, { glyph: string; word: string }> = {
  Comma: { glyph: ",", word: "Comma" },
  Period: { glyph: ".", word: "Period" },
  Slash: { glyph: "/", word: "Slash" },
  Backslash: { glyph: "\\", word: "Backslash" },
  BracketLeft: { glyph: "[", word: "Left bracket" },
  BracketRight: { glyph: "]", word: "Right bracket" },
  Semicolon: { glyph: ";", word: "Semicolon" },
  Quote: { glyph: "'", word: "Quote" },
  Backquote: { glyph: "`", word: "Backtick" },
  Minus: { glyph: "−", word: "Minus" },
  Equal: { glyph: "=", word: "Equals" },
};

const NAMED: Record<string, { mac: string; other: string; word: string }> = {
  Enter: { mac: "↵", other: "Enter", word: "Return" },
  Space: { mac: "Space", other: "Space", word: "Space" },
  Backspace: { mac: "⌫", other: "Backspace", word: "Backspace" },
  Delete: { mac: "⌦", other: "Del", word: "Delete" },
  Escape: { mac: "Esc", other: "Esc", word: "Escape" },
  ArrowUp: { mac: "↑", other: "↑", word: "Up arrow" },
  ArrowDown: { mac: "↓", other: "↓", word: "Down arrow" },
  ArrowLeft: { mac: "←", other: "←", word: "Left arrow" },
  ArrowRight: { mac: "→", other: "→", word: "Right arrow" },
  Home: { mac: "Home", other: "Home", word: "Home" },
  End: { mac: "End", other: "End", word: "End" },
  PageUp: { mac: "PgUp", other: "PgUp", word: "Page up" },
  PageDown: { mac: "PgDn", other: "PgDn", word: "Page down" },
};

const MOD_LABEL: Record<
  Mod,
  { mac: string; other: string; macWord: string; word: string }
> = {
  Mod: { mac: "⌘", other: "Ctrl", macWord: "Command", word: "Control" },
  Ctrl: { mac: "⌃", other: "Ctrl", macWord: "Control", word: "Control" },
  Alt: { mac: "⌥", other: "Alt", macWord: "Option", word: "Alt" },
  Shift: { mac: "⇧", other: "Shift", macWord: "Shift", word: "Shift" },
};

/** A Mac reads modifiers Control, Option, Shift, Command; elsewhere Ctrl, Alt, Shift. */
const MAC_ORDER: Mod[] = ["Ctrl", "Alt", "Shift", "Mod"];
const OTHER_ORDER: Mod[] = ["Mod", "Ctrl", "Alt", "Shift"];

const splitBinding = (binding: string): { mods: Mod[]; key: string } => {
  const parts = binding.split("+").filter(Boolean);
  const mods = parts.filter(isMod);
  const key = parts.filter((p) => !isMod(p)).pop() ?? "";
  return { mods, key };
};

/** The display order for one platform. */
const partsOf = (binding: string, mac: boolean): string[] => {
  const { mods, key } = splitBinding(binding);
  const order = mac ? MAC_ORDER : OTHER_ORDER;
  return [...order.filter((m) => mods.includes(m)), ...(key ? [key] : [])];
};

const capText = (part: string, mac: boolean): string => {
  if (isMod(part)) return mac ? MOD_LABEL[part].mac : MOD_LABEL[part].other;
  const punct = PUNCT[part];
  if (punct) return punct.glyph;
  const named = NAMED[part];
  if (named) return mac ? named.mac : named.other;
  return part;
};

const partWord = (part: string, mac: boolean): string => {
  if (isMod(part)) return mac ? MOD_LABEL[part].macWord : MOD_LABEL[part].word;
  return PUNCT[part]?.word ?? NAMED[part]?.word ?? part;
};

/** "Command Shift K" — one string, for names and announcements. */
const spoken = (binding: string | null, mac: boolean): string =>
  binding
    ? partsOf(binding, mac)
        .map((p) => partWord(p, mac))
        .join(" ")
    : "no shortcut";

/** "⌘⇧K" on a Mac, "Ctrl+Shift+K" elsewhere — for prose, the status line. */
export const formatChord = (binding: string | null, mac: boolean): string =>
  binding
    ? partsOf(binding, mac)
        .map((p) => capText(p, mac))
        .join(mac ? "" : "+")
    : "none";

const modifierOf = (key: string, mac: boolean): Mod | null => {
  if (key === "Shift") return "Shift";
  if (key === "Alt" || key === "AltGraph") return "Alt";
  if (key === "Meta" || key === "OS") return mac ? "Mod" : null;
  if (key === "Control") return mac ? "Ctrl" : "Mod";
  return null;
};

const heldMods = (event: React.KeyboardEvent, mac: boolean): Mod[] => {
  const out: Mod[] = [];
  if (mac ? event.metaKey : event.ctrlKey) out.push("Mod");
  if (mac && event.ctrlKey) out.push("Ctrl");
  if (event.altKey) out.push("Alt");
  if (event.shiftKey) out.push("Shift");
  return out;
};

const keyOf = (event: React.KeyboardEvent): string | null => {
  const code = event.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (PUNCT[code]) return code;
  if (event.key === " ") return "Space";
  if (NAMED[event.key]) return event.key;
  // A synthetic key with no code still names a letter or digit.
  if (/^[a-z0-9]$/i.test(event.key)) return event.key.toUpperCase();
  return null;
};

const ACCENTS: Record<ChordAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const DENSITY: Record<
  ChordDensity,
  { row: string; label: string; cap: string; well: string; head: string }
> = {
  compact: {
    row: "py-1.5",
    label: "text-[12.5px]",
    cap: "h-5 min-w-5 px-1 text-[11px]",
    well: "h-7",
    head: "py-1",
  },
  regular: {
    row: "py-2.5",
    label: "text-[13px]",
    cap: "h-6 min-w-6 px-1.5 text-[12px]",
    well: "h-8",
    head: "py-1.5",
  },
  roomy: {
    row: "py-3.5",
    label: "text-[14px]",
    cap: "h-7 min-w-7 px-2 text-[13px]",
    well: "h-9",
    head: "py-2",
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const noop = () => () => {};

/* ----------------------------------------------------------------------- */
/*                                  Keycap                                  */
/* ----------------------------------------------------------------------- */

type CapTone = "rest" | "lit" | "warn" | "muted";

function Keycap({
  text,
  style,
  density,
  tone = "rest",
  pressed = false,
}: {
  text: string;
  style: ChordKeycapStyle;
  density: ChordDensity;
  tone?: CapTone;
  pressed?: boolean;
}) {
  const lit = tone === "lit";
  const warn = tone === "warn";
  return (
    <kbd
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[5px] font-sans leading-none font-medium tabular-nums transition-[transform,box-shadow,background-color,border-color,color] duration-100",
        DENSITY[density].cap,
        style === "raised" &&
          "border border-hairline-strong bg-surface-1 text-ink-2 shadow-[0_1.5px_0_0_var(--hairline-strong)]",
        style === "flat" && "border border-transparent bg-surface-2 text-ink-2",
        style === "outline" &&
          "border border-hairline-strong bg-transparent text-ink-2",
        lit &&
          "border-(--cr-accent) bg-[color-mix(in_oklab,var(--cr-accent)_14%,var(--card))] text-foreground",
        warn &&
          "border-[color-mix(in_oklab,var(--warn)_70%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,var(--card))] text-foreground",
        tone === "muted" && "opacity-60",
        pressed &&
          "translate-y-[1.5px] shadow-[0_0_0_0_var(--hairline-strong)]",
      )}
    >
      {text}
    </kbd>
  );
}

/** A binding at rest. Keyed by its binding, so a new one drops in afresh. */
function Keys({
  binding,
  mac,
  style,
  density,
  drop,
  tone,
  motionSafe,
}: {
  binding: string | null;
  mac: boolean;
  style: ChordKeycapStyle;
  density: ChordDensity;
  drop: boolean;
  tone: CapTone;
  motionSafe: boolean;
}) {
  if (!binding) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-[5px] border border-dashed border-hairline-strong px-2 text-[11.5px] text-ink-3",
          DENSITY[density].cap,
          "min-w-0",
        )}
      >
        Not set
      </span>
    );
  }
  const parts = partsOf(binding, mac);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {parts.map((part, i) => (
        <motion.span
          key={`${part}-${i}`}
          className="inline-flex"
          initial={
            drop
              ? { y: motionSafe ? -distances.shift + 2 : 0, opacity: 0 }
              : false
          }
          animate={{ y: 0, opacity: 1 }}
          transition={{
            y: motionSafe
              ? { ...springs.snap, delay: i * 0.04 }
              : { duration: 0 },
            opacity: { duration: durations.fast, delay: i * 0.04 },
          }}
        >
          <Keycap
            text={capText(part, mac)}
            style={style}
            density={density}
            tone={tone}
          />
        </motion.span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Recording = {
  id: string;
  /** Keys in the well, in the order they were pressed. */
  caps: { part: string; n: number }[];
  /** Keys still held down. */
  held: string[];
  /** The completed chord, waiting to land or to be settled. */
  pending: string | null;
  /** The command that already owns `pending`. */
  clash: string | null;
  /** Why the last chord was refused. */
  note: string | null;
};

/**
 * A keyboard shortcut editor. Enter on a binding turns it into a recording
 * well: every key pressed drops in as a keycap from above the rim on `snap`,
 * lit while it is held, and the first key that is not a modifier completes the
 * chord. A free chord lands and fires `onBind`; one that is taken tints the
 * well, nudges the row that owns it sideways on `snap` and offers Swap, which
 * trades the two bindings and drops both rows' keys in afresh.
 *
 * Escape cancels, Backspace clears, Up and Down walk the bindings. Modifier
 * labels follow the platform, read after mount so the server and the first
 * client render agree. Groups are listed under sticky headings and the list
 * can be searched by label, area or the keys themselves.
 */
export function ChordRecorder({
  commands = defaultChordCommands,
  value,
  defaultValue,
  onValueChange,
  onBind,
  onSwap,
  onReset,
  platform = "auto",
  defaultQuery = "",
  requireModifier = true,
  status = "ready",
  onRetry,
  keycapStyle = "raised",
  density = "regular",
  accent = "cobalt",
  sound = false,
  title = "Keyboard shortcuts",
  height = 520,
  disabled = false,
  className,
}: ChordRecorderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const searchId = `${uid}-search`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const color =
    accent in ACCENTS ? ACCENTS[accent as ChordAccent] : (accent as string);

  // Read after mount: the server and the hydrating render both say "other".
  const detectedMac = React.useSyncExternalStore(
    noop,
    () =>
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent),
    () => false,
  );
  const mac = platform === "auto" ? detectedMac : platform === "mac";

  const defaults = React.useMemo(() => {
    const out: ChordBindings = {};
    for (const c of commands) out[c.id] = c.binding;
    return out;
  }, [commands]);
  const resets = React.useMemo(() => {
    const out: ChordBindings = {};
    for (const c of commands)
      out[c.id] = c.defaultBinding !== undefined ? c.defaultBinding : c.binding;
    return out;
  }, [commands]);

  const [own, setOwn] = React.useState<ChordBindings>(
    () => defaultValue ?? defaults,
  );
  const bindings = value ?? own;
  const bindingOf = (id: string) =>
    bindings[id] !== undefined
      ? (bindings[id] ?? null)
      : (defaults[id] ?? null);

  const [query, setQuery] = React.useState(defaultQuery);
  const [rec, setRec] = React.useState<Recording | null>(null);
  const [drop, setDrop] = React.useState<string[]>([]);
  const [announcement, setAnnouncement] = React.useState("");
  const [notice, setNotice] = React.useState<HTMLButtonElement | null>(null);

  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const rows = React.useRef(new Map<string, HTMLLIElement>());
  const scroller = React.useRef<HTMLDivElement | null>(null);
  const landing = React.useRef<number | null>(null);
  const dropTimer = React.useRef<number | null>(null);
  const capCount = React.useRef(0);

  React.useEffect(
    () => () => {
      if (landing.current !== null) window.clearTimeout(landing.current);
      if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
    },
    [],
  );

  /** Rows whose keys drop in afresh — only for the moment they change. */
  const dropIn = (ids: string[]) => {
    setDrop(ids);
    if (dropTimer.current !== null) window.clearTimeout(dropTimer.current);
    dropTimer.current = window.setTimeout(() => {
      dropTimer.current = null;
      setDrop([]);
    }, 900);
  };

  // Focus moves to Swap when the clash notice arrives, never on a guessed
  // frame; then the list shows both rows if they fit, the notice if not.
  React.useEffect(() => {
    if (!notice) return;
    notice.focus({ preventScroll: true });
    const box = scroller.current;
    const row = notice.closest("li");
    const other = rec?.clash ? rows.current.get(rec.clash) : null;
    if (!box || !row) return;
    const noteRoom = 52;
    const mineTop = row.offsetTop - 36;
    const mineEnd = row.offsetTop + row.offsetHeight + noteRoom;
    let top = mineTop;
    let end = mineEnd;
    if (other) {
      top = Math.min(top, other.offsetTop - 36);
      end = Math.max(end, other.offsetTop + other.offsetHeight);
    }
    if (end - top > box.clientHeight) {
      top = mineTop;
      end = mineEnd;
    }
    let next = box.scrollTop;
    if (end > next + box.clientHeight) next = end - box.clientHeight;
    if (top < next) next = Math.max(0, top);
    if (Math.abs(next - box.scrollTop) > 1)
      box.scrollTo({ top: next, behavior: motionSafe ? "smooth" : "auto" });
    // Only the arrival of a notice moves the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  const nameOf = (id: string) => commands.find((c) => c.id === id)?.label ?? id;

  const commit = (next: ChordBindings) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  /** Scrolls the list (never the page) so a row is in view. */
  const bringIntoView = (id: string) => {
    const box = scroller.current;
    const row = rows.current.get(id);
    if (!box || !row) return;
    const top = row.offsetTop - 36;
    const bottom = row.offsetTop + row.offsetHeight + 8;
    if (top < box.scrollTop)
      box.scrollTo({ top, behavior: motionSafe ? "smooth" : "auto" });
    else if (bottom > box.scrollTop + box.clientHeight)
      box.scrollTo({
        top: bottom - box.clientHeight,
        behavior: motionSafe ? "smooth" : "auto",
      });
  };

  const stopRecording = (focusId?: string) => {
    if (landing.current !== null) window.clearTimeout(landing.current);
    landing.current = null;
    setRec(null);
    setNotice(null);
    if (focusId) buttons.current.get(focusId)?.focus({ preventScroll: true });
  };

  const startRecording = (id: string) => {
    if (disabled || status !== "ready") return;
    if (landing.current !== null) window.clearTimeout(landing.current);
    landing.current = null;
    setRec({ id, caps: [], held: [], pending: null, clash: null, note: null });
    setAnnouncement(
      `Recording a shortcut for ${nameOf(id)}. Press the keys. Escape cancels, Backspace clears.`,
    );
  };

  const cancel = (id: string, refocus = true) => {
    stopRecording(refocus ? id : undefined);
    setAnnouncement(
      `Cancelled. ${nameOf(id)} keeps ${spoken(bindingOf(id), mac)}.`,
    );
  };

  const clear = (id: string) => {
    stopRecording(id);
    if (bindingOf(id) === null) return;
    commit({ ...bindings, [id]: null });
    onBind?.(id, null);
    setAnnouncement(`${nameOf(id)} has no shortcut now.`);
  };

  const owner = (binding: string, except: string) =>
    commands.find((c) => c.id !== except && bindingOf(c.id) === binding)?.id ??
    null;

  /** A completed chord: land it, or stop and show who owns it. */
  const complete = (id: string, binding: string, caps: Recording["caps"]) => {
    const other = owner(binding, id);
    if (other) {
      audio.play("click", { pitch: 0.62, gain: 0.45 });
      setRec({
        id,
        caps,
        held: [],
        pending: binding,
        clash: other,
        note: null,
      });
      setAnnouncement(
        `${spoken(binding, mac)} is already used by ${nameOf(other)}. Swap, or cancel.`,
      );
      return;
    }
    setRec({ id, caps, held: [], pending: binding, clash: null, note: null });
    // The chord holds in the well for a beat, so the last key is seen landing.
    landing.current = window.setTimeout(() => {
      landing.current = null;
      setRec(null);
      if (binding !== bindingOf(id)) {
        commit({ ...bindings, [id]: binding });
        onBind?.(id, binding);
      }
      audio.play("click", { pitch: 0.82, gain: 0.5 });
      setAnnouncement(`${nameOf(id)} is now ${spoken(binding, mac)}.`);
    }, 280);
  };

  const swap = () => {
    if (!rec?.pending || !rec.clash) return;
    const { id, clash: other, pending: binding } = rec;
    const mine = bindingOf(id);
    commit({ ...bindings, [id]: binding, [other]: mine });
    onSwap?.(id, other, binding);
    dropIn([id, other]);
    audio.play("click", { pitch: 1.12, gain: 0.55 });
    stopRecording(id);
    setAnnouncement(
      `Swapped. ${nameOf(id)} is now ${spoken(binding, mac)}; ${nameOf(other)} is now ${spoken(mine, mac)}.`,
    );
  };

  const reset = (id: string) => {
    if (disabled) return;
    const target = resets[id] ?? null;
    onReset?.(id);
    if (target && owner(target, id)) {
      // The default is someone else's now: settle it like a recorded clash.
      complete(
        id,
        target,
        partsOf(target, mac).map((part) => ({
          part,
          n: (capCount.current += 1),
        })),
      );
      return;
    }
    commit({ ...bindings, [id]: target });
    dropIn([id]);
    setAnnouncement(`${nameOf(id)} is back to ${spoken(target, mac)}.`);
  };

  const resetAll = () => {
    if (disabled) return;
    const changed = commands
      .filter((c) => bindingOf(c.id) !== (resets[c.id] ?? null))
      .map((c) => c.id);
    stopRecording();
    commit({ ...resets });
    onReset?.(null);
    dropIn(changed);
    setAnnouncement(
      changed.length
        ? `Reset ${changed.length} ${changed.length === 1 ? "shortcut" : "shortcuts"} to their defaults.`
        : "Every shortcut is already its default.",
    );
  };

  const onRecordKey = (event: React.KeyboardEvent, id: string) => {
    if (!rec || rec.id !== id) return;
    if (event.key === "Tab") return; // focus leaves; blur cancels
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || rec.pending) return;

    const mod = modifierOf(event.key, mac);
    if (mod) {
      const caps = rec.caps.some((c) => c.part === mod)
        ? rec.caps
        : [...rec.caps, { part: mod, n: (capCount.current += 1) }];
      if (caps !== rec.caps)
        audio.play("click", {
          pitch: semitones(caps.length * 2),
          gain: 0.45,
        });
      setRec({
        ...rec,
        caps,
        held: rec.held.includes(mod) ? rec.held : [...rec.held, mod],
        note: null,
      });
      return;
    }
    if (event.key === "Meta" || event.key === "OS") return;

    const mods = heldMods(event, mac);
    if (mods.length === 0 && event.key === "Escape") {
      cancel(id);
      return;
    }
    if (
      mods.length === 0 &&
      (event.key === "Backspace" || event.key === "Delete")
    ) {
      clear(id);
      return;
    }
    if (mods.length === 0 && event.key === "Enter") return;

    const key = keyOf(event);
    if (!key) return;
    const fn = /^F\d+$/.test(key);
    if (requireModifier && !fn && !mods.some((m) => m !== "Shift")) {
      setRec({
        ...rec,
        caps: rec.caps.filter((c) => isMod(c.part)),
        note: mac
          ? `Add ⌘, ⌥ or ⌃ to ${capText(key, mac)}: a key alone types.`
          : `Add Ctrl or Alt to ${capText(key, mac)}: a key alone types.`,
      });
      setAnnouncement(
        `${partWord(key, mac)} alone types a character. Hold ${mac ? "Command, Option or Control" : "Control or Alt"} with it.`,
      );
      return;
    }
    const binding = [...OTHER_ORDER.filter((m) => mods.includes(m)), key].join(
      "+",
    );
    // Modifiers held before recording began never fired a keydown here.
    let caps = rec.caps.filter((c) => !isMod(c.part) || mods.includes(c.part));
    for (const m of mods)
      if (!caps.some((c) => c.part === m))
        caps = [...caps, { part: m, n: (capCount.current += 1) }];
    caps = [...caps, { part: key, n: (capCount.current += 1) }];
    audio.play("click", { pitch: semitones(caps.length * 2), gain: 0.55 });
    complete(id, binding, caps);
  };

  const onRecordKeyUp = (event: React.KeyboardEvent, id: string) => {
    if (!rec || rec.id !== id) return;
    event.preventDefault();
    const mod = modifierOf(event.key, mac);
    // A Mac swallows key-ups while Command is down, so letting Command go
    // lets everything go.
    const held =
      mac && mod === "Mod"
        ? []
        : rec.held.filter((p) => p !== (mod ?? keyOf(event)));
    if (rec.pending) {
      setRec({ ...rec, held });
      return;
    }
    // Modifiers let go without a key: they lift back out of the well.
    const caps = held.length === 0 ? [] : rec.caps;
    setRec({ ...rec, held, caps });
  };

  /* --- search */
  const q = query.trim().toLowerCase();
  const visible = commands.filter((c) => {
    if (!q) return true;
    const b = bindingOf(c.id);
    const hay = [
      c.label,
      c.area,
      c.description ?? "",
      spoken(b, mac),
      formatChord(b, mac),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  const areas: { area: string; items: ChordCommand[] }[] = [];
  for (const c of visible) {
    const group = areas.find((a) => a.area === c.area);
    if (group) group.items.push(c);
    else areas.push({ area: c.area, items: [c] });
  }
  const order = visible.map((c) => c.id);

  const mark = (text: string) => {
    if (!q) return text;
    const at = text.toLowerCase().indexOf(q);
    if (at < 0) return text;
    return (
      <>
        {text.slice(0, at)}
        <mark className="rounded-[3px] bg-[color-mix(in_oklab,var(--cr-accent)_22%,transparent)] text-foreground">
          {text.slice(at, at + q.length)}
        </mark>
        {text.slice(at + q.length)}
      </>
    );
  };

  const moveFocus = (from: string, to: "prev" | "next" | "first" | "last") => {
    const i = order.indexOf(from);
    const j =
      to === "first"
        ? 0
        : to === "last"
          ? order.length - 1
          : Math.min(
              order.length - 1,
              Math.max(0, i + (to === "next" ? 1 : -1)),
            );
    const id = order[j];
    if (id) {
      buttons.current.get(id)?.focus({ preventScroll: true });
      bringIntoView(id);
    }
  };

  const changedCount = commands.filter(
    (c) => bindingOf(c.id) !== (resets[c.id] ?? null),
  ).length;

  const body = () => {
    if (status === "loading") {
      return (
        <ul
          aria-busy="true"
          aria-label="Loading shortcuts"
          className="px-4 py-2"
        >
          {Array.from({ length: 7 }, (_, i) => (
            <li
              key={i}
              aria-hidden
              className={cn(
                "flex items-center justify-between gap-4 border-b border-hairline",
                d.row,
              )}
            >
              <span
                className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${34 + ((i * 17) % 30)}%` }}
              />
              <span className="flex gap-1">
                <span className={cn("rounded-[5px] bg-surface-2", d.cap)} />
                <span className={cn("rounded-[5px] bg-surface-2", d.cap)} />
              </span>
            </li>
          ))}
        </ul>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">Shortcuts did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
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
    if (visible.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <p className="text-sm text-ink-2">
            No shortcut matches “{query.trim()}”.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            Clear search
          </button>
        </div>
      );
    }
    return areas.map(({ area, items }) => {
      const headId = `${uid}-area-${area.replace(/\W+/g, "-")}`;
      return (
        <section key={area} aria-labelledby={headId}>
          <h3
            id={headId}
            className={cn(
              "sticky top-0 z-10 border-b border-hairline bg-card/95 px-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase backdrop-blur-sm",
              d.head,
            )}
          >
            <span
              aria-hidden
              className="mr-2 inline-block h-2 w-[3px] rounded-full bg-(--cr-accent) align-[-0.5px]"
            />
            {area}
            <span className="ml-2 text-ink-3/70">{items.length}</span>
          </h3>
          <ul role="list">
            {items.map((c) => {
              const binding = bindingOf(c.id);
              const recording = rec?.id === c.id ? rec : null;
              const clashed = rec?.clash === c.id;
              const changed = binding !== (resets[c.id] ?? null);
              const shownPending = recording?.pending ?? null;
              return (
                <li
                  key={c.id}
                  ref={(node) => {
                    if (node) rows.current.set(c.id, node);
                    else rows.current.delete(c.id);
                  }}
                  onBlur={(event) => {
                    // Leaving the row ends a recording — but a chord already
                    // landing is let finish.
                    if (!recording || (recording.pending && !recording.clash))
                      return;
                    const to = event.relatedTarget as Node | null;
                    if (to && event.currentTarget.contains(to)) return;
                    cancel(c.id, false);
                  }}
                  className={cn(
                    "relative border-b border-hairline bg-card transition-colors last:border-b-0",
                    clashed &&
                      "bg-[color-mix(in_oklab,var(--warn)_7%,var(--card))]",
                  )}
                >
                  <motion.div
                    initial={false}
                    animate={{ x: clashed && motionSafe ? distances.step : 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  >
                    <div
                      className={cn(
                        "flex flex-col items-stretch gap-2 px-4 @min-[30rem]:flex-row @min-[30rem]:items-center @min-[30rem]:gap-4",
                        d.row,
                      )}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span
                          className={cn(
                            "leading-snug font-medium text-foreground",
                            d.label,
                          )}
                        >
                          {mark(c.label)}
                        </span>
                        {c.description ? (
                          <span className="text-[11.5px] leading-snug text-ink-3">
                            {mark(c.description)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-2 @min-[30rem]:justify-end">
                        <button
                          ref={(node) => {
                            if (node) buttons.current.set(c.id, node);
                            else buttons.current.delete(c.id);
                          }}
                          type="button"
                          aria-label={
                            recording
                              ? `Recording a shortcut for ${c.label}`
                              : `${c.label}, ${spoken(binding, mac)}. Press Enter to change.`
                          }
                          aria-describedby={recording ? hintId : undefined}
                          aria-disabled={disabled || undefined}
                          onClick={() => {
                            if (recording) return;
                            startRecording(c.id);
                          }}
                          onKeyDown={(event) => {
                            if (recording) {
                              onRecordKey(event, c.id);
                              return;
                            }
                            if (
                              event.key === "ArrowDown" ||
                              event.key === "ArrowUp"
                            ) {
                              event.preventDefault();
                              moveFocus(
                                c.id,
                                event.key === "ArrowDown" ? "next" : "prev",
                              );
                            } else if (
                              event.key === "Home" ||
                              event.key === "End"
                            ) {
                              event.preventDefault();
                              moveFocus(
                                c.id,
                                event.key === "Home" ? "first" : "last",
                              );
                            } else if (
                              event.key === "Backspace" ||
                              event.key === "Delete"
                            ) {
                              event.preventDefault();
                              if (!disabled) clear(c.id);
                            }
                          }}
                          onKeyUp={(event) => {
                            if (recording) onRecordKeyUp(event, c.id);
                          }}
                          className={cn(
                            "relative inline-flex items-center justify-end rounded-2 px-1.5 transition-colors",
                            d.well,
                            recording
                              ? "min-w-36 justify-start border border-dashed border-(--cr-accent) bg-surface-2 shadow-[inset_0_1px_3px_color-mix(in_oklab,black_22%,transparent)]"
                              : "border border-transparent hover:bg-surface-2",
                            recording?.clash &&
                              "border-[color-mix(in_oklab,var(--warn)_80%,transparent)]",
                            disabled && "cursor-not-allowed",
                            FOCUS_RING,
                          )}
                        >
                          {recording ? (
                            <span className="inline-flex items-center gap-1">
                              <AnimatePresence initial={false}>
                                {recording.caps.map((cap) => (
                                  <motion.span
                                    key={cap.n}
                                    className="inline-flex"
                                    initial={{
                                      y: motionSafe ? -distances.shift + 2 : 0,
                                      opacity: 0,
                                    }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{
                                      y: motionSafe ? -distances.step : 0,
                                      opacity: 0,
                                      transition: exitFor(durations.fast),
                                    }}
                                    transition={{
                                      y: motionSafe
                                        ? springs.snap
                                        : { duration: 0 },
                                      opacity: { duration: durations.blink },
                                    }}
                                  >
                                    <Keycap
                                      text={capText(cap.part, mac)}
                                      style={keycapStyle}
                                      density={density}
                                      tone={
                                        recording.clash
                                          ? "warn"
                                          : recording.held.includes(cap.part) ||
                                              shownPending
                                            ? "lit"
                                            : "rest"
                                      }
                                      pressed={recording.held.includes(
                                        cap.part,
                                      )}
                                    />
                                  </motion.span>
                                ))}
                              </AnimatePresence>
                              {recording.caps.length === 0 ? (
                                <span className="inline-flex items-center gap-1.5 pl-1 text-[12px] text-ink-3">
                                  <span
                                    aria-hidden
                                    className="size-1.5 rounded-full bg-(--cr-accent) motion-safe:animate-pulse"
                                  />
                                  Press keys
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <Keys
                              key={binding ?? "none"}
                              binding={binding}
                              mac={mac}
                              style={keycapStyle}
                              density={density}
                              drop={drop.includes(c.id)}
                              tone={clashed ? "warn" : "rest"}
                              motionSafe={motionSafe}
                            />
                          )}
                        </button>
                        {changed && !recording ? (
                          <button
                            type="button"
                            onClick={() => reset(c.id)}
                            aria-label={`Reset ${c.label} to ${spoken(resets[c.id] ?? null, mac)}`}
                            title={`Reset to ${formatChord(resets[c.id] ?? null, mac)}`}
                            className={cn(
                              "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                              FOCUS_RING,
                            )}
                          >
                            <RotateCcw aria-hidden className="size-3.5" />
                          </button>
                        ) : (
                          <span
                            aria-hidden
                            className="hidden size-7 shrink-0 @min-[30rem]:block"
                          />
                        )}
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {recording && (recording.clash || recording.note) ? (
                        <motion.div
                          key={`notice-${recording.caps[recording.caps.length - 1]?.n ?? 0}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{
                            height: 0,
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            height: motionSafe
                              ? springs.glide
                              : { duration: 0 },
                            opacity: { duration: durations.fast },
                          }}
                          className="overflow-hidden"
                        >
                          {recording.clash && recording.pending ? (
                            <div
                              role="group"
                              aria-label="Shortcut clash"
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  cancel(c.id);
                                }
                              }}
                              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3"
                            >
                              <p className="min-w-0 flex-1 basis-44 text-[12px] leading-snug text-ink-2">
                                <span className="font-mono text-foreground">
                                  {formatChord(recording.pending, mac)}
                                </span>{" "}
                                is used by{" "}
                                <span className="font-medium text-foreground">
                                  {nameOf(recording.clash)}
                                </span>
                                .{" "}
                                {binding
                                  ? `Swap gives it ${formatChord(binding, mac)}.`
                                  : "Swap leaves it without one."}
                              </p>
                              <span className="flex shrink-0 gap-1.5">
                                <button
                                  ref={setNotice}
                                  type="button"
                                  onClick={swap}
                                  className={cn(
                                    "inline-flex h-7 items-center rounded-2 bg-(--cr-accent) px-3 text-[12px] font-medium text-background transition-opacity hover:opacity-90",
                                    FOCUS_RING,
                                  )}
                                >
                                  Swap
                                </button>
                                <button
                                  type="button"
                                  onClick={() => cancel(c.id)}
                                  className={cn(
                                    "inline-flex h-7 items-center rounded-2 border border-hairline-strong px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                                    FOCUS_RING,
                                  )}
                                >
                                  Cancel
                                </button>
                              </span>
                            </div>
                          ) : (
                            <p className="px-4 pb-3 text-[12px] text-ink-3">
                              {recording.note}
                            </p>
                          )}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                </li>
              );
            })}
          </ul>
        </section>
      );
    });
  };

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--cr-accent" as string]: color }}
    >
      <header className="flex flex-col gap-2.5 border-b border-hairline px-4 pt-3.5 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 items-baseline gap-2">
            <h2 id={titleId} className="truncate text-sm font-semibold">
              {title}
            </h2>
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {q ? `${visible.length} of ${commands.length}` : commands.length}
            </span>
          </div>
          <button
            type="button"
            onClick={resetAll}
            aria-disabled={changedCount === 0 || disabled || undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-2 text-[12px] transition-colors",
              changedCount === 0
                ? "cursor-default text-ink-3"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset all
            {changedCount > 0 ? (
              <span className="font-mono text-[10.5px] text-(--cr-accent) tabular-nums">
                {changedCount}
              </span>
            ) : null}
          </button>
        </div>
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Search shortcuts
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setQuery(next);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              } else if (event.key === "ArrowDown" && order[0]) {
                event.preventDefault();
                buttons.current.get(order[0])?.focus();
              }
            }}
            placeholder="Search by name or keys"
            autoComplete="off"
            className={cn(
              "h-8 w-full rounded-2 border border-input bg-surface-1 pr-3 pl-8 text-[12.5px] text-foreground placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden",
              FOCUS_IN,
              "focus-visible:border-(--cr-accent)",
            )}
          />
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Press the new shortcut. Escape cancels, Backspace clears.
      </p>

      <div
        ref={scroller}
        className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {body()}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
