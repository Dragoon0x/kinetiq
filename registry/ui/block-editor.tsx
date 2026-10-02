"use client";

import * as React from "react";

import {
  Bold,
  CircleAlert,
  Code,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Italic,
  Link,
  Pilcrow,
  Plus,
  Quote,
  SquareCheck,
  Strikethrough,
  Trash2,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileTone,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type EditorBlockType =
  "paragraph" | "heading" | "subheading" | "todo" | "quote";

export type EditorBlock = {
  id: string;
  type: EditorBlockType;
  /** Plain text. `**bold**`, `_italic_`, `` `code` ``, `~~strike~~` and `[link](url)` render formatted while the block rests. */
  text: string;
  /** A to-do's tick. */
  checked?: boolean;
};

export type EditorHandles = "hover" | "always" | "off";
export type EditorSlash = "list" | "grid" | "off";
export type EditorBubble = "full" | "compact" | "off";
export type EditorStatus = "ready" | "loading" | "error";

export type BlockEditorProps = {
  /** Controlled blocks. */
  blocks?: EditorBlock[];
  /** Initial blocks when uncontrolled. @default defaultEditorBlocks */
  defaultBlocks?: EditorBlock[];
  /** Fires from the keystroke, drag, menu pick or tick that changed the document, with every block. */
  onBlocksChange?: (blocks: EditorBlock[]) => void;
  /** The document's name: the heading of the surface and its accessible name. @default "Field notes · North basin survey" */
  title?: string;
  /** One quiet line under the title. */
  meta?: string;
  /** What an empty block says while you are in it. @default "Type “/” for blocks" */
  placeholder?: string;
  /** Drag handles in the gutter: on hover and focus, always, or none (Alt+Up and Alt+Down still move blocks). @default "hover" */
  handles?: EditorHandles;
  /** The block menu that `/` opens: a list with hints, a grid of tiles, or none (`/` is just a character). @default "list" */
  slash?: EditorSlash;
  /** The toolbar over a selection: five marks, three, or none (the shortcuts still work). @default "full" */
  bubble?: EditorBubble;
  /** Loading draws placeholder lines; error offers Retry. @default "ready" */
  status?: EditorStatus;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** Fires with the block being written in, or null when focus leaves the document. */
  onFocusChange?: (blockId: string | null) => void;
  /** Reads, without writing, moving or ticking. @default false */
  readOnly?: boolean;
  /** The region's accessible name. @default the title */
  label?: string;
  /** Play the ticks and clicks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults -------------------------------- */

export const defaultEditorBlocks: EditorBlock[] = [
  { id: "b1", type: "heading", text: "North basin survey, day 2" },
  {
    id: "b2",
    type: "paragraph",
    text: "Flow at gauge N4 read **1.8 m³/s** at 09:40, up from 1.2 yesterday after the overnight rain. _Turbidity_ stayed under 40 NTU all morning.",
  },
  {
    id: "b3",
    type: "paragraph",
    text: "The left bank below the weir has slumped about a metre since July. Photos are in `survey/n4/09-29`.",
  },
  { id: "b4", type: "subheading", text: "Before we leave" },
  {
    id: "b5",
    type: "todo",
    text: "Photograph each gauge from the same post",
    checked: true,
  },
  {
    id: "b6",
    type: "todo",
    text: "Calibrate the flow meter against the staff gauge",
  },
  {
    id: "b7",
    type: "todo",
    text: "Log the slump with a [GPS fix](https://fieldline.app/fix)",
  },
  {
    id: "b8",
    type: "quote",
    text: "Measure twice at the weir, once everywhere else.",
  },
  {
    id: "b9",
    type: "paragraph",
    text: "Next visit Thursday, if the ford is passable.",
  },
];

/* -------------------------------- helpers -------------------------------- */

const PHONE = 600;
const DESKTOP = 1040;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Ends a sentence once, even when the words it quotes already end in a full stop. */
const sentence = (text: string) =>
  /[.!?…]["”’)]?$/.test(text.trim()) ? text : `${text}.`;

/** Each block type's type, shared by the replica, the rendered text and the textarea. */
const TEXT: Record<EditorBlockType, string> = {
  paragraph: "text-sm leading-6",
  heading: "text-xl leading-8 font-semibold tracking-[-0.01em]",
  subheading: "text-base leading-7 font-semibold",
  todo: "text-sm leading-6",
  quote: "text-sm leading-6 italic",
};
/** A first line's height, for lining the gutter up with it. */
const LINE: Record<EditorBlockType, number> = {
  paragraph: 24,
  heading: 32,
  subheading: 28,
  todo: 24,
  quote: 24,
};
/** Space above a block: titles stand off what comes before them. */
const ABOVE: Record<EditorBlockType, number> = {
  paragraph: 4,
  heading: 18,
  subheading: 14,
  todo: 2,
  quote: 6,
};

type Mark = "bold" | "italic" | "code" | "strike" | "link";

const MARKS: Record<Mark, { open: string; close: string; label: string }> = {
  bold: { open: "**", close: "**", label: "Bold" },
  italic: { open: "_", close: "_", label: "Italic" },
  code: { open: "`", close: "`", label: "Code" },
  strike: { open: "~~", close: "~~", label: "Strikethrough" },
  link: { open: "[", close: "](https://)", label: "Link" },
};

const MARK_ICONS: Record<Mark, typeof Bold> = {
  bold: Bold,
  italic: Italic,
  code: Code,
  strike: Strikethrough,
  link: Link,
};

type Run = { text: string; raw: number; marks: Mark[] };

const PATTERNS: { mark: Mark; re: RegExp; open: number }[] = [
  { mark: "code", re: /^`([^`\n]+)`/, open: 1 },
  { mark: "bold", re: /^\*\*([^*\n](?:[^\n]*?[^*\n])?)\*\*/, open: 2 },
  { mark: "strike", re: /^~~([^~\n](?:[^\n]*?[^~\n])?)~~/, open: 2 },
  { mark: "link", re: /^\[([^\]\n]+)\]\(([^)\s]*)\)/, open: 1 },
  {
    mark: "italic",
    re: /^_([^_\n](?:[^\n]*?[^_\n])?)_(?![A-Za-z0-9])/,
    open: 1,
  },
];

/**
 * The marks in a block's text as runs of plain text, each remembering where
 * it starts in the raw text, so a click on the rendered words can put the
 * caret on the same character of the raw ones.
 */
function parseInline(text: string, base = 0, marks: Mark[] = []): Run[] {
  const out: Run[] = [];
  let plain = "";
  let plainAt = 0;
  let i = 0;
  const flush = () => {
    if (plain) out.push({ text: plain, raw: base + plainAt, marks });
    plain = "";
  };
  while (i < text.length) {
    const prev = i > 0 ? text.charAt(i - 1) : "";
    let hit: { mark: Mark; m: RegExpExecArray; open: number } | null = null;
    for (const p of PATTERNS) {
      if (marks.includes(p.mark)) continue;
      if (p.mark === "italic" && /[A-Za-z0-9]/.test(prev)) continue;
      const m = p.re.exec(text.slice(i));
      if (m) {
        hit = { mark: p.mark, m, open: p.open };
        break;
      }
    }
    if (!hit) {
      if (!plain) plainAt = i;
      plain += text.charAt(i);
      i += 1;
      continue;
    }
    flush();
    const inner = hit.m[1] ?? "";
    const at = base + i + hit.open;
    if (hit.mark === "code") {
      out.push({ text: inner, raw: at, marks: [...marks, "code"] });
    } else {
      out.push(...parseInline(inner, at, [...marks, hit.mark]));
    }
    i += hit.m[0].length;
  }
  flush();
  return out;
}

const plainOf = (text: string) =>
  parseInline(text)
    .map((r) => r.text)
    .join("");

const wordsIn = (blocks: readonly EditorBlock[]) =>
  blocks.reduce(
    (n, b) => n + (plainOf(b.text).match(/[^\s]+/g)?.length ?? 0),
    0,
  );

/** Whether the selection already carries a mark, inside or just outside it. */
function isMarked(text: string, s: number, e: number, mark: Mark): boolean {
  const { open, close } = MARKS[mark];
  if (mark === "link") {
    return text.slice(s - 1, s) === "[" && text.slice(e, e + 2) === "](";
  }
  if (
    text.slice(s - open.length, s) === open &&
    text.slice(e, e + close.length) === close
  )
    return true;
  const sel = text.slice(s, e);
  return (
    sel.length > open.length + close.length &&
    sel.startsWith(open) &&
    sel.endsWith(close)
  );
}

/** Wraps or unwraps a selection; returns the new text and the selection to keep. */
function toggleMark(text: string, s: number, e: number, mark: Mark) {
  const { open, close } = MARKS[mark];
  if (mark === "link") {
    if (isMarked(text, s, e, "link")) {
      const end = text.indexOf(")", e);
      const cut = end === -1 ? e + 2 : end + 1;
      return {
        text: text.slice(0, s - 1) + text.slice(s, e) + text.slice(cut),
        s: s - 1,
        e: e - 1,
      };
    }
    const next = `${text.slice(0, s)}[${text.slice(s, e)}](https://)${text.slice(e)}`;
    // The address is left selected, ready to be typed over.
    return { text: next, s: e + 3, e: e + 11 };
  }
  if (
    text.slice(s - open.length, s) === open &&
    text.slice(e, e + close.length) === close
  ) {
    return {
      text:
        text.slice(0, s - open.length) +
        text.slice(s, e) +
        text.slice(e + close.length),
      s: s - open.length,
      e: e - open.length,
    };
  }
  const sel = text.slice(s, e);
  if (
    sel.length > open.length + close.length &&
    sel.startsWith(open) &&
    sel.endsWith(close)
  ) {
    const inner = sel.slice(open.length, sel.length - close.length);
    return {
      text: text.slice(0, s) + inner + text.slice(e),
      s,
      e: s + inner.length,
    };
  }
  return {
    text: text.slice(0, s) + open + sel + close + text.slice(e),
    s: s + open.length,
    e: e + open.length,
  };
}

const TYPES: {
  type: EditorBlockType;
  name: string;
  hint: string;
  icon: typeof Bold;
  keys: string;
}[] = [
  {
    type: "paragraph",
    name: "Text",
    hint: "Plain writing",
    icon: Pilcrow,
    keys: "text paragraph plain",
  },
  {
    type: "heading",
    name: "Heading",
    hint: "A section title",
    icon: Heading1,
    keys: "heading title h1",
  },
  {
    type: "subheading",
    name: "Subheading",
    hint: "A smaller title",
    icon: Heading2,
    keys: "subheading h2 small",
  },
  {
    type: "todo",
    name: "To-do",
    hint: "A box to tick",
    icon: SquareCheck,
    keys: "todo task check box",
  },
  {
    type: "quote",
    name: "Quote",
    hint: "Set a passage apart",
    icon: Quote,
    keys: "quote callout",
  },
];

const typeName = (type: EditorBlockType) =>
  TYPES.find((t) => t.type === type)?.name ?? "Text";

/** Markdown openings that turn a text block into another type. */
const SHORTCUTS: { prefix: string; type: EditorBlockType }[] = [
  { prefix: "## ", type: "subheading" },
  { prefix: "# ", type: "heading" },
  { prefix: "[] ", type: "todo" },
  { prefix: "[ ] ", type: "todo" },
  { prefix: "> ", type: "quote" },
];

type Play = (tone: TactileTone, pitch: number, el?: Element | null) => void;

type Slot = {
  y: MotionValue<number>;
  node: () => HTMLLIElement | null;
};

type Sel = { start: number; end: number };

type MenuState =
  | {
      kind: "slash";
      blockId: string;
      start: number;
      query: string;
      active: number;
    }
  | { kind: "insert"; blockId: string; active: number }
  | { kind: "block"; blockId: string; active: number };

type MenuItem = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Bold;
  checked?: boolean;
  danger?: boolean;
};

/* ---------------------------------- menu --------------------------------- */

type MenuProps = {
  id: string;
  role: "listbox" | "menu";
  layout: "list" | "grid";
  cols: number;
  label: string;
  items: MenuItem[];
  active: number;
  setActive: (i: number) => void;
  onPick: (item: MenuItem) => void;
  onClose: (refocus: boolean) => void;
  pos: { x: number; y: number; w?: number; maxH: number } | null;
  motionSafe: boolean;
  nodeRef: React.RefObject<HTMLDivElement | null>;
  play: Play;
};

/**
 * The block menu. Opened by `/` it is a listbox the textarea drives (focus
 * stays in the text); opened by a gutter button it is a menu that holds
 * focus itself and hands it back on Escape.
 */
function BlockMenu({
  id,
  role,
  layout,
  cols,
  label,
  items,
  active,
  setActive,
  onPick,
  onClose,
  pos,
  motionSafe,
  nodeRef,
  play,
}: MenuProps) {
  const itemRefs = React.useRef(new Map<number, HTMLDivElement>());
  const grid = layout === "grid";

  // A menu takes focus once it is placed (hidden, it could not take it); a
  // listbox leaves focus in the text.
  const placed = pos !== null;
  React.useEffect(() => {
    if (role !== "menu" || !placed) return;
    itemRefs.current.get(active)?.focus({ preventScroll: true });
  }, [role, active, placed]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (role !== "menu") return;
    const n = items.length;
    const step = (d: number) => {
      const next = (active + d + n) % n;
      setActive(next);
      play("tick", d > 0 ? 1.3 : 1.2, itemRefs.current.get(next));
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        step(grid ? cols : 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        step(grid ? -cols : -1);
        return;
      case "ArrowRight":
        if (!grid) return;
        event.preventDefault();
        step(1);
        return;
      case "ArrowLeft":
        if (!grid) return;
        event.preventDefault();
        step(-1);
        return;
      case "Home":
        event.preventDefault();
        setActive(0);
        return;
      case "End":
        event.preventDefault();
        setActive(n - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        {
          const item = items[active];
          if (item) onPick(item);
        }
        return;
      case "Escape":
        // Handled here, where focus is; the stage must not also see it.
        event.preventDefault();
        onClose(true);
        return;
      case "Tab":
        onClose(false);
        return;
    }
  };

  return (
    <motion.div
      ref={nodeRef}
      id={id}
      role={role}
      aria-label={label}
      tabIndex={role === "menu" ? -1 : undefined}
      data-editor-popover=""
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: { duration: durations.fast, ease: easings.enter },
        y: motionSafe ? springs.snap : { duration: 0 },
      }}
      className={cn(
        "absolute top-0 left-0 z-40 [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_12px_32px_color-mix(in_oklab,black_18%,transparent)] outline-none",
        grid ? "grid gap-1" : "flex flex-col",
        pos ? "" : "invisible",
      )}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        width: pos?.w ?? (grid ? cols * 84 + (cols - 1) * 4 + 10 : 236),
        maxHeight: pos?.maxH,
        gridTemplateColumns: grid
          ? `repeat(${cols}, minmax(0, 1fr))`
          : undefined,
      }}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        const on = i === active;
        return (
          <div
            key={item.id}
            ref={(node) => {
              if (node) itemRefs.current.set(i, node);
              else itemRefs.current.delete(i);
            }}
            id={`${id}-${i}`}
            role={
              role === "listbox"
                ? "option"
                : item.checked !== undefined
                  ? "menuitemradio"
                  : "menuitem"
            }
            aria-selected={role === "listbox" ? on : undefined}
            aria-checked={
              role === "menu" && item.checked !== undefined
                ? item.checked
                : undefined
            }
            tabIndex={role === "menu" ? (on ? 0 : -1) : undefined}
            // Keeps the caret where it was; the click below picks.
            onPointerDown={(event) => event.preventDefault()}
            onPointerMove={() => {
              if (!on) setActive(i);
            }}
            onClick={() => onPick(item)}
            className={cn(
              "relative flex cursor-pointer rounded-2 text-left select-none",
              grid
                ? "h-16 flex-col items-center justify-center gap-1.5 px-1 text-[11px]"
                : "h-9 items-center gap-2.5 px-2 text-[13px]",
              on ? "bg-cobalt-wash" : "",
              item.danger ? "text-danger" : "text-foreground",
              FOCUS_RING_IN,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-1 border border-hairline bg-card",
                grid ? "size-7" : "size-6",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span
              className={cn("min-w-0", grid ? "max-w-full truncate" : "flex-1")}
            >
              <span className="block truncate">{item.label}</span>
              {!grid && item.hint ? (
                <span className="block truncate text-[11px] text-ink-3">
                  {item.hint}
                </span>
              ) : null}
            </span>
            {!grid && item.checked ? (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
              />
            ) : null}
          </div>
        );
      })}
    </motion.div>
  );
}

/* --------------------------------- bubble -------------------------------- */

type BubbleProps = {
  marks: Mark[];
  pressed: (mark: Mark) => boolean;
  onApply: (mark: Mark) => void;
  onEscape: () => void;
  pos: { x: number; y: number; below: boolean } | null;
  motionSafe: boolean;
  nodeRef: React.RefObject<HTMLDivElement | null>;
};

function Bubble({
  marks,
  pressed,
  onApply,
  onEscape,
  pos,
  motionSafe,
  nodeRef,
}: BubbleProps) {
  const [active, setActive] = React.useState(0);
  const refs = React.useRef(new Map<number, HTMLButtonElement>());
  return (
    <motion.div
      ref={nodeRef}
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      data-editor-popover=""
      initial={{
        opacity: 0,
        y: motionSafe ? (pos?.below ? -distances.step : distances.step) : 0,
        scale: motionSafe ? 0.96 : 1,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: { duration: durations.fast, ease: easings.enter },
        y: motionSafe ? springs.snap : { duration: 0 },
        scale: motionSafe ? springs.snap : { duration: 0 },
      }}
      onKeyDown={(event) => {
        const n = marks.length;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          const next = (active + (event.key === "ArrowRight" ? 1 : -1) + n) % n;
          setActive(next);
          refs.current.get(next)?.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onEscape();
        }
      }}
      className={cn(
        "absolute top-0 left-0 z-40 flex items-center gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_20%,transparent)]",
        pos ? "" : "invisible",
      )}
      style={{
        left: pos?.x ?? 0,
        top: pos?.y ?? 0,
        originY: pos?.below ? 0 : 1,
      }}
    >
      {marks.map((mark, i) => {
        const Icon = MARK_ICONS[mark];
        const on = pressed(mark);
        return (
          <button
            key={mark}
            ref={(node) => {
              if (node) refs.current.set(i, node);
              else refs.current.delete(i);
            }}
            type="button"
            aria-label={MARKS[mark].label}
            aria-pressed={on}
            tabIndex={i === active ? 0 : -1}
            title={MARKS[mark].label}
            onPointerDown={(event) => event.preventDefault()}
            onFocus={() => setActive(i)}
            onClick={() => onApply(mark)}
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-2 transition-colors",
              on
                ? "bg-cobalt-wash text-cobalt-bright"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING_IN,
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </motion.div>
  );
}

/* ---------------------------------- block -------------------------------- */

type BlockProps = {
  block: EditorBlock;
  index: number;
  total: number;
  editing: boolean;
  sel: Sel | null;
  handles: EditorHandles;
  plus: boolean;
  phone: boolean;
  dragging: boolean;
  menuFor: "insert" | "block" | null;
  /** The slash listbox this block's text drives, while it is open. */
  listbox: { id: string; active: number } | null;
  motionSafe: boolean;
  disabled: boolean;
  readOnly: boolean;
  placeholder: string;
  hintId: string;
  isLive: () => boolean;
  register: (id: string, slot: Slot) => () => void;
  bindArea: (
    id: string,
    node: HTMLTextAreaElement | null,
  ) => (() => void) | undefined;
  onFocus: (id: string) => void;
  onBlur: (id: string, event: React.FocusEvent<HTMLTextAreaElement>) => void;
  onChange: (id: string, value: string, caret: number) => void;
  onSelect: (id: string, start: number, end: number) => void;
  onKeyDown: (
    id: string,
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => void;
  onToggle: (id: string) => void;
  onPlus: (id: string) => void;
  onGrip: (id: string) => void;
  onRestPress: (id: string, caret: number) => void;
  drag: {
    start: (id: string) => void;
    move: (id: string, dy: number) => void;
    end: (id: string, vy: number) => void;
    cancel: (id: string) => void;
  };
};

function EditorBlockRow({
  block,
  index,
  total,
  editing,
  sel,
  handles,
  plus,
  phone,
  dragging,
  menuFor,
  listbox,
  motionSafe,
  disabled,
  readOnly,
  placeholder,
  hintId,
  isLive,
  register,
  bindArea,
  onFocus,
  onBlur,
  onChange,
  onSelect,
  onKeyDown,
  onToggle,
  onPlus,
  onGrip,
  onRestPress,
  drag,
}: BlockProps) {
  const y = useMotionValue(0);
  const lift = useMotionValue(0);
  const fade = useMotionValue(1);
  const liRef = React.useRef<HTMLLIElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const node = React.useCallback(() => liRef.current, []);

  React.useLayoutEffect(
    () => register(block.id, { y, node }),
    [register, block.id, y, node],
  );

  // A block that arrives after the first paint fades in where the layout put
  // it; the blocks it displaced glide (the surface's FLIP pass moves them).
  // Once it has arrived it never fades again: a re-run of this effect (a moved
  // block's effects re-run in development) finds the fade already finished by
  // the cleanup below.
  const arrived = React.useRef(false);
  React.useLayoutEffect(() => {
    const running = anims.current;
    if (arrived.current || !isLive()) {
      arrived.current = true;
      return;
    }
    arrived.current = true;
    fade.jump(0);
    running.set(
      "fade",
      animate(fade, 1, { duration: durations.base, ease: easings.enter }),
    );
    return () => {
      running.get("fade")?.stop();
      fade.jump(1);
    };
  }, [fade, isLive]);

  React.useEffect(() => {
    const running = anims.current;
    const target = dragging && motionSafe ? 1 : 0;
    running.get("lift")?.stop();
    running.set("lift", animate(lift, target, springs.flick));
  }, [dragging, motionSafe, lift]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const grip = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || readOnly,
    onStart: () => drag.start(block.id),
    onMove: ({ offset }) => drag.move(block.id, offset.y),
    onEnd: ({ velocity }) => drag.end(block.id, velocity.y),
    onCancel: () => drag.cancel(block.id),
    onTap: () => onGrip(block.id),
  });

  const scale = useTransform(lift, (l) => r2(1 + 0.015 * l));
  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(10 * l)}px ${r2(28 * l)}px color-mix(in oklab, black ${Math.round(18 * l)}%, transparent)`,
  );

  const type = block.type;
  const text = block.text;
  const showHandles = handles !== "off" && !readOnly;
  const label = `${typeName(type)} ${index + 1} of ${total}${type === "todo" ? (block.checked ? ", done" : ", not done") : ""}`;
  const handleTop = ABOVE[type] + 2 + (LINE[type] - 24) / 2;
  const s = sel ? Math.min(sel.start, text.length) : 0;
  const e = sel ? Math.min(Math.max(sel.end, s), text.length) : 0;
  const done = type === "todo" && !!block.checked;
  const shade = cn(
    TEXT[type],
    "py-0.5 break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
    done && "text-ink-3 line-through decoration-ink-3/60",
    type === "quote" && !done && "text-ink-2",
  );

  return (
    <motion.li
      ref={liRef}
      data-editor-block={block.id}
      className={cn(
        "group/block-editor-block relative flex gap-1.5 rounded-2",
        dragging ? "z-30 bg-card" : "z-0",
      )}
      style={{
        y,
        scale,
        boxShadow: shadow,
        opacity: fade,
        paddingTop: ABOVE[type],
      }}
    >
      {showHandles ? (
        <div
          className={cn(
            "flex shrink-0 items-start justify-end gap-0.5 transition-opacity",
            phone ? "w-6" : "w-12",
            handles === "hover" && !dragging && !menuFor
              ? // A phone has no hover: its grips stay faintly in sight.
                phone
                ? "opacity-40 group-focus-within/block-editor-block:opacity-100"
                : "opacity-0 group-focus-within/block-editor-block:opacity-100 group-hover/block-editor-block:opacity-100"
              : "opacity-100",
          )}
          style={{ paddingTop: handleTop - ABOVE[type] }}
        >
          {plus && !phone ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Insert a block after ${typeName(type)} ${index + 1}`}
              data-editor-anchor={`insert-${block.id}`}
              disabled={disabled}
              onClick={() => onPlus(block.id)}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Move or change ${typeName(type)} ${index + 1}: ${plainOf(text).slice(0, 40) || "empty"}`}
            aria-haspopup="menu"
            aria-expanded={menuFor === "block"}
            aria-describedby={hintId}
            data-editor-anchor={`block-${block.id}`}
            disabled={disabled}
            {...grip}
            onClick={(event) => {
              if (event.detail === 0) onGrip(block.id);
            }}
            className={cn(
              "inline-flex size-6 touch-pan-x items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
              dragging
                ? "cursor-grabbing bg-surface-2 text-foreground"
                : "cursor-grab",
              FOCUS_RING,
            )}
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "relative flex min-w-0 flex-1 items-start gap-2.5",
          type === "quote" && "border-l-2 border-hairline-strong pl-3",
        )}
      >
        {type === "todo" ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!block.checked}
            aria-label={`Done: ${plainOf(text) || "empty to-do"}`}
            disabled={disabled || readOnly}
            onClick={() => onToggle(block.id)}
            className={cn(
              "mt-[6px] inline-flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors disabled:cursor-not-allowed",
              block.checked
                ? "border-cobalt-bright bg-cobalt-bright text-primary-foreground"
                : "border-hairline-strong bg-card hover:border-ink-3",
              FOCUS_RING,
            )}
          >
            <svg aria-hidden viewBox="0 0 16 16" className="size-3">
              <motion.path
                d="M3.5 8.4 6.6 11.4 12.6 4.8"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={false}
                animate={{
                  pathLength: block.checked ? 1 : 0,
                  opacity: block.checked ? 1 : 0,
                }}
                transition={
                  motionSafe && block.checked ? springs.flick : { duration: 0 }
                }
              />
            </svg>
          </button>
        ) : null}

        <div className="grid min-w-0 flex-1">
          {/* The replica: the raw text while editing (it sizes the cell and
              tells where the selection is), the formatted text at rest. */}
          <div
            aria-hidden
            data-editor-shade=""
            onPointerDown={(event) => {
              if (editing || disabled || readOnly) return;
              if (event.pointerType === "mouse" && event.button !== 0) return;
              event.preventDefault();
              const pos = caretFromPoint(
                event.clientX,
                event.clientY,
                text.length,
              );
              onRestPress(block.id, pos);
            }}
            className={cn(
              "relative col-start-1 row-start-1 min-w-0",
              shade,
              editing ? "invisible" : readOnly ? "" : "cursor-text",
            )}
          >
            {editing ? (
              <>
                {text.slice(0, s)}
                <span data-editor-sel="">{e > s ? text.slice(s, e) : "⁠"}</span>
                {text.slice(e)}
                {"​"}
              </>
            ) : text ? (
              <Formatted text={text} />
            ) : (
              "​"
            )}
          </div>
          <textarea
            ref={(n) => bindArea(block.id, n)}
            rows={1}
            value={text}
            readOnly={readOnly}
            // A read-only document stays formatted: its raw text is not a
            // stop on the way through the page.
            tabIndex={readOnly ? -1 : undefined}
            disabled={disabled}
            spellCheck={editing}
            placeholder={editing ? placeholder : undefined}
            aria-label={label}
            aria-describedby={hintId}
            aria-autocomplete="list"
            aria-controls={listbox ? listbox.id : undefined}
            aria-activedescendant={
              listbox ? `${listbox.id}-${listbox.active}` : undefined
            }
            onFocus={() => onFocus(block.id)}
            onBlur={(event) => onBlur(block.id, event)}
            onChange={(event) =>
              onChange(
                block.id,
                event.currentTarget.value,
                event.currentTarget.selectionStart,
              )
            }
            onSelect={(event) =>
              onSelect(
                block.id,
                event.currentTarget.selectionStart,
                event.currentTarget.selectionEnd,
              )
            }
            onKeyDown={(event) => onKeyDown(block.id, event)}
            className={cn(
              "col-start-1 row-start-1 w-full min-w-0 resize-none overflow-hidden rounded-1 bg-transparent text-foreground placeholder:text-ink-3 disabled:cursor-not-allowed",
              shade,
              "outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring/40 focus-visible:outline-solid",
              editing ? "" : "pointer-events-none opacity-0",
            )}
          />
        </div>
      </div>
    </motion.li>
  );
}

function Formatted({ text }: { text: string }) {
  const runs = parseInline(text);
  return (
    <>
      {runs.map((r, i) => (
        <span
          key={i}
          data-raw={r.raw}
          className={cn(
            r.marks.includes("bold") && "font-semibold",
            r.marks.includes("italic") && "italic",
            r.marks.includes("strike") && "line-through",
            r.marks.includes("code") &&
              "rounded-1 bg-surface-2 px-1 font-mono text-[0.88em] not-italic",
            r.marks.includes("link") &&
              "text-cobalt-bright underline decoration-cobalt-bright/40 underline-offset-2",
          )}
        >
          {r.text}
        </span>
      ))}
    </>
  );
}

/** The raw offset under a point on a resting block's rendered text. */
function caretFromPoint(x: number, y: number, fallback: number): number {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
  };
  let node: Node | null = null;
  let offset = 0;
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) {
    node = pos.offsetNode;
    offset = pos.offset;
  } else {
    const range = doc.caretRangeFromPoint?.(x, y);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }
  const host =
    node instanceof Element
      ? node.closest("[data-raw]")
      : node?.parentElement?.closest("[data-raw]");
  if (!host || !node || node.nodeType !== Node.TEXT_NODE) return fallback;
  return Number(host.getAttribute("data-raw") ?? 0) + offset;
}

/* -------------------------------- surface -------------------------------- */

type Mode = "phone" | "tablet" | "desktop";

type DragState = {
  id: string;
  from: number;
  to: number;
  ids: string[];
  tops: number[];
  heights: number[];
  min: number;
  max: number;
};

/**
 * A document of blocks — text, headings, to-dos and quotes — each a plain
 * textarea underneath. A block's grip drags it: it lifts, follows the pointer
 * and its neighbours slide out of its way, then it settles into its new place
 * with the speed it was let go at. Alt+Up and Alt+Down do the same from the
 * keyboard. `/` opens a block menu at the caret, a selection raises a
 * formatting bubble over it, and the marks it writes are plain text that
 * renders formatted when the block rests.
 *
 * Under reduced motion blocks swap places at once and menus fade without
 * rising; every edit, tick and move still happens and is announced.
 */
export function BlockEditor({
  blocks: blocksProp,
  defaultBlocks,
  onBlocksChange,
  title = "Field notes · North basin survey",
  meta = "Fieldline · shared with the survey team",
  placeholder = "Type “/” for blocks",
  handles = "hover",
  slash = "list",
  bubble = "full",
  status = "ready",
  onRetry,
  onFocusChange,
  readOnly = false,
  label,
  sound = false,
  disabled = false,
  className,
}: BlockEditorProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const menuId = `${uid}-menu`;

  const [own, setOwn] = React.useState<EditorBlock[]>(
    () => defaultBlocks ?? defaultEditorBlocks,
  );
  const blocks = blocksProp ?? own;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<Sel | null>(null);
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  const [bubblePos, setBubblePos] = React.useState<{
    x: number;
    y: number;
    below: boolean;
  } | null>(null);
  const [menuPos, setMenuPos] = React.useState<{
    x: number;
    y: number;
    w?: number;
    maxH: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const mode: Mode =
    width === null
      ? "tablet"
      : width < PHONE
        ? "phone"
        : width < DESKTOP
          ? "tablet"
          : "desktop";
  const phone = mode === "phone";
  const editable = !readOnly && !disabled;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  const areas = React.useRef(new Map<string, HTMLTextAreaElement>());
  const slots = React.useRef(new Map<string, Slot>());
  const glides = React.useRef(new Map<string, AnimationPlaybackControls>());
  const dragRef = React.useRef<DragState | null>(null);
  const flipFrom = React.useRef<Map<string, number> | null>(null);
  const flipVelocity = React.useRef<{ id: string; v: number } | null>(null);
  const focusNext = React.useRef<{
    id: string;
    start: number;
    end: number;
  } | null>(null);
  const menuReturn = React.useRef<HTMLElement | null>(null);
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const liveRef = React.useRef(false);
  const seq = React.useRef(0);

  const isLive = React.useCallback(() => liveRef.current, []);
  React.useLayoutEffect(() => {
    liveRef.current = true;
  }, []);

  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    setWidth(Math.round(node.offsetWidth));
    const ro = new ResizeObserver(() => setWidth(Math.round(node.offsetWidth)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const play: Play = React.useCallback(
    (tone, pitch, el) => {
      const rect = el?.getBoundingClientRect();
      audio.play(tone, {
        pitch,
        gain: tone === "tick" ? 0.35 : 0.5,
        pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
      });
    },
    [audio],
  );

  const register = React.useCallback((id: string, slot: Slot) => {
    slots.current.set(id, slot);
    // A moved block's effects re-run in development: the glide it is in the
    // middle of keeps running across the re-registration rather than freezing.
    return () => {
      if (slots.current.get(id) === slot) slots.current.delete(id);
    };
  }, []);

  const bindArea = React.useCallback(
    (id: string, node: HTMLTextAreaElement | null) => {
      if (!node) return;
      const map = areas.current;
      map.set(id, node);
      return () => {
        if (map.get(id) === node) map.delete(id);
      };
    },
    [],
  );

  /* ------------------------------- document ------------------------------- */

  const commit = (next: EditorBlock[], moved = false) => {
    if (moved) {
      // Where every block is drawn now, so the next layout can glide from it.
      const from = new Map<string, number>();
      for (const [id, slot] of slots.current) {
        const node = slot.node();
        if (node) from.set(id, node.offsetTop + slot.y.get());
      }
      flipFrom.current = from;
    }
    if (blocksProp === undefined) setOwn(next);
    onBlocksChange?.(next);
  };

  const newId = () => {
    const taken = new Set(blocks.map((b) => b.id));
    let id = "";
    do {
      seq.current += 1;
      id = `block-${seq.current}`;
    } while (taken.has(id));
    return id;
  };

  const focusAt = (id: string, start: number, end = start) => {
    focusNext.current = { id, start, end };
  };

  const glideTo = (top: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(
      0,
      Math.min(el.scrollHeight - el.clientHeight, Math.round(top)),
    );
    scrollAnim.current?.stop();
    if (!motionSafe || Math.abs(el.scrollTop - target) < 2) {
      el.scrollTop = target;
      return;
    }
    scrollAnim.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = Math.round(v);
      },
    });
  };

  /** Scrolls just enough to show a block, on glide. */
  const keepInView = (node: Element | null | undefined) => {
    const box = scrollerRef.current;
    if (!node || !box) return;
    const r = node.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const k = box.offsetHeight > 0 ? b.height / box.offsetHeight : 1;
    if (r.top < b.top + 8)
      glideTo(box.scrollTop - (b.top + 8 - r.top) / (k || 1));
    else if (r.bottom > b.bottom - 8)
      glideTo(box.scrollTop + (r.bottom - b.bottom + 8) / (k || 1));
  };

  const view = React.useRef<{
    keepInView: (node: Element | null) => void;
  } | null>(null);
  React.useLayoutEffect(() => {
    view.current = { keepInView };
  });

  // A structural edit names the block and selection that should hold focus
  // once the new layout is in; it is honoured here, after that commit.
  React.useLayoutEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    const area = areas.current.get(want.id);
    if (!area) return;
    focusNext.current = null;
    if (document.activeElement !== area) area.focus({ preventScroll: true });
    area.setSelectionRange(want.start, want.end);
    setSel({ start: want.start, end: want.end });
    view.current?.keepInView(area.closest("li"));
  }, [blocks, focusId]);

  // Every block glides from where it was drawn to where the new order puts it.
  const orderKey = blocks.map((b) => b.id).join("|");
  React.useLayoutEffect(() => {
    const from = flipFrom.current;
    if (!from) return;
    flipFrom.current = null;
    const fling = flipVelocity.current;
    flipVelocity.current = null;
    const running = glides.current;
    for (const [id, slot] of slots.current) {
      const node = slot.node();
      const was = from.get(id);
      running.get(id)?.stop();
      running.delete(id);
      if (!node || was === undefined) {
        slot.y.jump(0);
        continue;
      }
      const delta = r2(was - node.offsetTop);
      if (Math.abs(delta) < 0.5 || !motionSafe) {
        slot.y.jump(0);
        continue;
      }
      slot.y.jump(delta);
      running.set(
        id,
        animate(slot.y, 0, {
          ...springs.glide,
          velocity: fling?.id === id ? fling.v : 0,
        }),
      );
    }
  }, [orderKey, motionSafe]);

  // A press outside an open gutter menu closes it, leaving focus alone.
  const gutterMenu = menu && menu.kind !== "slash";
  React.useEffect(() => {
    if (!gutterMenu) return;
    const onDown = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest("[data-editor-popover]") ||
        t.closest("[data-editor-anchor]")
      )
        return;
      menuReturn.current = null;
      setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [gutterMenu]);

  React.useEffect(() => {
    const running = glides.current;
    const onVisibility = () => {
      if (document.hidden) scrollAnim.current?.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      scrollAnim.current?.stop();
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /** Moves a block's offset to a value, on glide or at once. */
  const glideY = (id: string, to: number, velocity = 0) => {
    const slot = slots.current.get(id);
    if (!slot) return;
    glides.current.get(id)?.stop();
    glides.current.delete(id);
    if (!motionSafe) {
      slot.y.jump(to);
      return;
    }
    glides.current.set(id, animate(slot.y, to, { ...springs.glide, velocity }));
  };

  const update = (id: string, patch: Partial<EditorBlock>) =>
    commit(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const insertAfter = (id: string, block: EditorBlock) => {
    const i = blocks.findIndex((b) => b.id === id);
    const next = [...blocks];
    next.splice(i + 1, 0, block);
    commit(next, true);
  };

  const remove = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i === -1 || blocks.length < 2) return;
    const prev = blocks[i - 1] ?? blocks[i + 1];
    commit(
      blocks.filter((b) => b.id !== id),
      true,
    );
    if (prev) focusAt(prev.id, prev.text.length);
    say("Deleted the block.");
  };

  const move = (id: string, to: number, velocity = 0) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i === -1 || to === i || to < 0 || to >= blocks.length) return false;
    const next = [...blocks];
    const [b] = next.splice(i, 1);
    if (!b) return false;
    next.splice(to, 0, b);
    flipVelocity.current = { id, v: velocity };
    commit(next, true);
    say(
      `Moved “${plainOf(b.text).slice(0, 40) || typeName(b.type)}” to position ${to + 1} of ${blocks.length}.`,
    );
    return true;
  };

  /* --------------------------------- drag --------------------------------- */

  const dragApi = {
    start: (id: string) => {
      if (!editable) return;
      const ids = blocks.map((b) => b.id);
      const i = ids.indexOf(id);
      if (i === -1) return;
      const nodes = ids.map((x) => slots.current.get(x)?.node() ?? null);
      const tops = nodes.map((n) => n?.offsetTop ?? 0);
      const heights = nodes.map((n) => n?.offsetHeight ?? 0);
      const last = ids.length - 1;
      dragRef.current = {
        id,
        from: i,
        to: i,
        ids,
        tops,
        heights,
        min: (tops[0] ?? 0) - (tops[i] ?? 0),
        max:
          (tops[last] ?? 0) +
          (heights[last] ?? 0) -
          ((tops[i] ?? 0) + (heights[i] ?? 0)),
      };
      setMenu(null);
      setDragId(id);
    },
    move: (id: string, dy: number) => {
      const d = dragRef.current;
      if (!d || d.id !== id) return;
      const slot = slots.current.get(id);
      const h = d.heights[d.from] ?? 0;
      const y = rubberClamp(dy, d.min, d.max, Math.max(h, 40));
      slot?.y.set(r2(y));
      const center = (d.tops[d.from] ?? 0) + h / 2 + y;
      let to = d.from;
      for (let j = d.from + 1; j < d.ids.length; j += 1) {
        if (center > (d.tops[j] ?? 0) + (d.heights[j] ?? 0) / 2) to = j;
      }
      for (let j = d.from - 1; j >= 0; j -= 1) {
        if (center < (d.tops[j] ?? 0) + (d.heights[j] ?? 0) / 2) to = j;
      }
      if (to === d.to) return;
      const was = d.to;
      d.to = to;
      play("tick", to > was ? 1.25 : 1.1, slot?.node());
      // Neighbours make room by the dragged block's height.
      d.ids.forEach((other, j) => {
        if (j === d.from) return;
        const s = slots.current.get(other);
        if (!s) return;
        const shift =
          d.from < j && j <= to ? -h : to <= j && j < d.from ? h : 0;
        if (Math.abs(s.y.get() - shift) < 0.5) return;
        glideY(other, shift);
      });
    },
    end: (id: string, vy: number) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragId(null);
      if (!d || d.id !== id) return;
      const slot = slots.current.get(id);
      if (d.to === d.from) {
        glideY(id, 0, vy);
        return;
      }
      play("click", 1, slot?.node());
      move(id, d.to, vy);
    },
    cancel: (id: string) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragId(null);
      if (!d || d.id !== id) return;
      for (const other of d.ids) glideY(other, 0);
    },
  };

  /* --------------------------------- menus -------------------------------- */

  const closeMenu = (refocus: boolean) => {
    const back = menuReturn.current;
    menuReturn.current = null;
    setMenu(null);
    if (refocus && back) back.focus();
  };

  const convert = (id: string, type: EditorBlockType, text?: string) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    commit(
      blocks.map((x) =>
        x.id === id
          ? {
              ...x,
              type,
              text: text ?? x.text,
              checked: type === "todo" ? !!x.checked : undefined,
            }
          : x,
      ),
    );
    say(`Turned into ${typeName(type).toLowerCase()}.`);
  };

  const pickType = (m: MenuState, type: EditorBlockType) => {
    const b = blocks.find((x) => x.id === m.blockId);
    if (!b) return;
    const area = areas.current.get(b.id);
    play("click", 1.15, area);
    if (m.kind === "slash") {
      const caret = area?.selectionStart ?? m.start + m.query.length + 1;
      const rest = b.text.slice(0, m.start) + b.text.slice(caret);
      setMenu(null);
      if (rest.trim() === "") {
        convert(b.id, type, "");
        focusAt(b.id, 0);
      } else {
        const id = newId();
        const next = blocks.map((x) =>
          x.id === b.id ? { ...x, text: rest } : x,
        );
        const at = next.findIndex((x) => x.id === b.id);
        next.splice(at + 1, 0, { id, type, text: "" });
        commit(next, true);
        focusAt(id, 0);
        say(`Added ${typeName(type).toLowerCase()}.`);
      }
      return;
    }
    menuReturn.current = null;
    setMenu(null);
    if (m.kind === "insert") {
      const id = newId();
      insertAfter(b.id, { id, type, text: "" });
      focusAt(id, 0);
      say(`Added ${typeName(type).toLowerCase()}.`);
      return;
    }
    convert(b.id, type);
    focusAt(b.id, b.text.length);
  };

  const menuItems = (m: MenuState): MenuItem[] => {
    const block = blocks.find((b) => b.id === m.blockId);
    const q = m.kind === "slash" ? m.query.toLowerCase() : "";
    const types = TYPES.filter(
      (t) =>
        q === "" ||
        t.name.toLowerCase().startsWith(q) ||
        t.keys.split(" ").some((k) => k.startsWith(q)),
    );
    const items: MenuItem[] = types.map((t) => ({
      id: t.type,
      label: m.kind === "block" ? `Turn into ${t.name.toLowerCase()}` : t.name,
      hint: m.kind === "block" ? undefined : t.hint,
      icon: t.icon,
      checked: m.kind === "block" ? block?.type === t.type : undefined,
    }));
    if (m.kind === "block" && block) {
      items.push(
        {
          id: "duplicate",
          label: "Duplicate",
          icon: Copy,
        },
        {
          id: "delete",
          label: "Delete",
          icon: Trash2,
          danger: true,
        },
      );
    }
    return items;
  };

  const pick = (m: MenuState, item: MenuItem) => {
    const block = blocks.find((b) => b.id === m.blockId);
    if (!block) return;
    const type = TYPES.find((t) => t.type === item.id)?.type;
    if (type) {
      pickType(m, type);
      return;
    }
    menuReturn.current = null;
    setMenu(null);
    if (item.id === "duplicate") {
      const id = newId();
      insertAfter(block.id, { ...block, id });
      focusAt(id, block.text.length);
      play("click", 1.1, areas.current.get(block.id));
      say("Duplicated the block.");
    } else if (item.id === "delete") {
      play("click", 0.8, areas.current.get(block.id));
      remove(block.id);
    }
  };

  const openMenu = (kind: "insert" | "block", id: string) => {
    if (!editable) return;
    if (menu && menu.kind === kind && menu.blockId === id) {
      closeMenu(true);
      return;
    }
    const block = blocks.find((b) => b.id === id);
    const anchor = contentRef.current?.querySelector<HTMLElement>(
      `[data-editor-anchor="${kind}-${id}"]`,
    );
    menuReturn.current = anchor ?? areas.current.get(id) ?? null;
    const active =
      kind === "block"
        ? Math.max(
            0,
            TYPES.findIndex((t) => t.type === block?.type),
          )
        : 0;
    setMenu({ kind, blockId: id, active });
    play("tick", 1.2, anchor);
  };

  /* --------------------------------- typing -------------------------------- */

  const detectSlash = (id: string, value: string, caret: number) => {
    if (slash === "off" || !editable) return;
    const m = /(^|\s)\/([^\s/]{0,16})$/.exec(value.slice(0, caret));
    if (!m) {
      if (menu?.kind === "slash" && menu.blockId === id) setMenu(null);
      return;
    }
    const query = m[2] ?? "";
    const start = caret - query.length - 1;
    if (
      menu?.kind === "slash" &&
      menu.blockId === id &&
      menu.query === query &&
      menu.start === start
    )
      return;
    const next: MenuState = {
      kind: "slash",
      blockId: id,
      start,
      query,
      active: 0,
    };
    const n = menuItems(next).length;
    if (n === 0) {
      setMenu(null);
      return;
    }
    if (!(menu?.kind === "slash" && menu.blockId === id)) {
      menuReturn.current = null;
      say(
        `${plural(n, "block type", "block types")}. Up and Down to choose, Enter to pick.`,
      );
    }
    setMenu(next);
  };

  const onChange = (id: string, value: string, caret: number) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || !editable) return;
    if (b.type === "paragraph") {
      const hit = SHORTCUTS.find(
        (sc) => value.startsWith(sc.prefix) && caret === sc.prefix.length,
      );
      if (hit) {
        commit(
          blocks.map((x) =>
            x.id === id
              ? { ...x, type: hit.type, text: value.slice(hit.prefix.length) }
              : x,
          ),
        );
        focusAt(id, 0);
        setMenu(null);
        play("click", 1.1, areas.current.get(id));
        say(`Turned into ${typeName(hit.type).toLowerCase()}.`);
        return;
      }
    }
    update(id, { text: value });
    setSel({ start: caret, end: caret });
    detectSlash(id, value, caret);
  };

  const onSelect = (id: string, start: number, end: number) => {
    if (focusId !== id) return;
    setSel((was) =>
      was && was.start === start && was.end === end ? was : { start, end },
    );
    const b = blocks.find((x) => x.id === id);
    if (b && start === end) detectSlash(id, b.text, start);
    else if (menu?.kind === "slash") setMenu(null);
  };

  const applyMark = (id: string, mark: Mark) => {
    const b = blocks.find((x) => x.id === id);
    const area = areas.current.get(id);
    if (!b || !area || !editable) return;
    const s = area.selectionStart;
    const e = area.selectionEnd;
    if (s === e && mark !== "link") return;
    const was = isMarked(b.text, s, e, mark);
    const out = toggleMark(b.text, s, e, mark);
    update(id, { text: out.text });
    focusAt(id, out.s, out.e);
    play("click", was ? 0.95 : 1.2, area);
    say(`${MARKS[mark].label} ${was ? "off" : "on"}.`);
  };

  /** Whether the caret sits on the first or the last visual line of its block. */
  const onEdgeLine = (id: string, edge: "first" | "last") => {
    const li = slots.current.get(id)?.node();
    const shade = li?.querySelector<HTMLElement>("[data-editor-shade]");
    const mark = shade?.querySelector<HTMLElement>("[data-editor-sel]");
    if (!shade || !mark) return true;
    const line = parseFloat(getComputedStyle(shade).lineHeight) || 24;
    const top = mark.offsetTop;
    return edge === "first"
      ? top < line * 0.75
      : top + line * 1.25 >= shade.offsetHeight;
  };

  const onKeyDown = (
    id: string,
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    const b = blocks.find((x) => x.id === id);
    const i = blocks.findIndex((x) => x.id === id);
    if (!b) return;
    const area = event.currentTarget;
    const s = area.selectionStart;
    const e = area.selectionEnd;
    const mod = event.metaKey || event.ctrlKey;

    if (menu?.kind === "slash" && menu.blockId === id) {
      const items = menuItems(menu);
      const n = items.length;
      const grid = slash === "grid";
      const cols = phone ? 2 : 3;
      const step = (d: number) => {
        setMenu({ ...menu, active: (menu.active + d + n) % n });
        play("tick", d > 0 ? 1.3 : 1.2, area);
      };
      if (event.key === "ArrowDown") {
        event.preventDefault();
        step(grid ? cols : 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        step(grid ? -cols : -1);
        return;
      }
      if (grid && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
        event.preventDefault();
        step(event.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const item = items[Math.min(menu.active, n - 1)];
        if (item) pick(menu, item);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        return;
      }
    }

    if (readOnly || disabled) return;

    if (mod && !event.altKey) {
      const key = event.key.toLowerCase();
      const mark: Mark | null =
        key === "b"
          ? "bold"
          : key === "i"
            ? "italic"
            : key === "e"
              ? "code"
              : key === "k"
                ? "link"
                : key === "x" && event.shiftKey
                  ? "strike"
                  : null;
      if (mark) {
        event.preventDefault();
        applyMark(id, mark);
        return;
      }
      if (event.key === "Enter" && b.type === "todo") {
        event.preventDefault();
        toggle(id);
        return;
      }
    }

    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const to = i + (event.key === "ArrowUp" ? -1 : 1);
      if (move(id, to)) {
        play("tick", event.key === "ArrowUp" ? 1.2 : 1.05, area);
        focusAt(id, s, e);
      }
      return;
    }

    if (event.altKey && event.key === "F10") {
      const first =
        bubbleRef.current?.querySelector<HTMLButtonElement>("button");
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey && !mod) {
      event.preventDefault();
      if (b.type === "todo" && b.text.trim() === "") {
        convert(id, "paragraph", "");
        focusAt(id, 0);
        return;
      }
      const before = b.text.slice(0, s);
      const after = b.text.slice(e);
      const nid = newId();
      const type: EditorBlockType = b.type === "todo" ? "todo" : "paragraph";
      const next = blocks.map((x) =>
        x.id === id ? { ...x, text: before } : x,
      );
      next.splice(i + 1, 0, { id: nid, type, text: after });
      commit(next, true);
      focusAt(nid, 0);
      return;
    }

    if (event.key === "Backspace" && s === 0 && e === 0) {
      if (b.type !== "paragraph") {
        event.preventDefault();
        convert(id, "paragraph");
        focusAt(id, 0);
        return;
      }
      const prev = blocks[i - 1];
      if (!prev) return;
      event.preventDefault();
      const joined = prev.text + b.text;
      commit(
        blocks
          .filter((x) => x.id !== id)
          .map((x) => (x.id === prev.id ? { ...x, text: joined } : x)),
        true,
      );
      focusAt(prev.id, prev.text.length);
      return;
    }

    if (event.key === "Delete" && s === b.text.length && e === s) {
      const nextBlock = blocks[i + 1];
      if (!nextBlock) return;
      event.preventDefault();
      commit(
        blocks
          .filter((x) => x.id !== nextBlock.id)
          .map((x) =>
            x.id === id ? { ...x, text: b.text + nextBlock.text } : x,
          ),
        true,
      );
      focusAt(id, s);
      return;
    }

    if (
      event.key === "ArrowUp" &&
      s === e &&
      !event.shiftKey &&
      onEdgeLine(id, "first")
    ) {
      const prev = blocks[i - 1];
      if (!prev) return;
      event.preventDefault();
      focusAt(prev.id, prev.text.length);
      setSel(null);
      setFocusId(prev.id);
      return;
    }

    if (
      event.key === "ArrowDown" &&
      s === e &&
      !event.shiftKey &&
      onEdgeLine(id, "last")
    ) {
      const nextBlock = blocks[i + 1];
      if (!nextBlock) return;
      event.preventDefault();
      focusAt(nextBlock.id, 0);
      setSel(null);
      setFocusId(nextBlock.id);
    }
  };

  const toggle = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    if (!b || !editable) return;
    update(id, { checked: !b.checked });
    play("click", b.checked ? 0.9 : 1.2, areas.current.get(id));
    say(sentence(`${b.checked ? "Not done" : "Done"}: ${plainOf(b.text)}`));
  };

  const onFocus = (id: string) => {
    if (focusId !== id) {
      setFocusId(id);
      onFocusChange?.(id);
    }
    const area = areas.current.get(id);
    if (area) setSel({ start: area.selectionStart, end: area.selectionEnd });
  };

  const onBlur = (id: string, event: React.FocusEvent<HTMLTextAreaElement>) => {
    const next = event.relatedTarget;
    // Into the bubble or the menu: still writing in this block.
    if (next instanceof Element && next.closest("[data-editor-popover]"))
      return;
    if (menu?.kind === "slash" && menu.blockId === id) setMenu(null);
    if (focusId === id) {
      setFocusId(null);
      setSel(null);
      // Moving to another block reports that block from its own focus.
      const stays =
        next instanceof HTMLTextAreaElement &&
        !!rootRef.current?.contains(next);
      if (!stays) onFocusChange?.(null);
    }
  };

  const onRestPress = (id: string, caret: number) => {
    if (disabled) return;
    focusAt(id, caret);
    const area = areas.current.get(id);
    area?.focus({ preventScroll: true });
    area?.setSelectionRange(caret, caret);
  };

  /* ------------------------------- positions ------------------------------ */

  const editingBlock = blocks.find((b) => b.id === focusId);
  const showBubble =
    bubble !== "off" &&
    editable &&
    !!editingBlock &&
    !!sel &&
    sel.end > sel.start &&
    !dragId &&
    !menu;
  const bubbleMarks: Mark[] =
    bubble === "compact"
      ? ["bold", "italic", "code"]
      : ["bold", "italic", "code", "strike", "link"];

  // Popovers sit inside the scrolled page, measured from what they point at;
  // a second pass knows their own size and keeps them inside the page.
  React.useLayoutEffect(() => {
    const content = contentRef.current;
    const scroller = scrollerRef.current;
    if (!content || !scroller) return;
    const base = content.getBoundingClientRect();
    const k =
      content.offsetWidth > 0 ? base.width / content.offsetWidth || 1 : 1;
    const cw = content.offsetWidth;
    const viewTop = scroller.scrollTop;
    const viewBottom = viewTop + scroller.clientHeight;

    let nextBubble: { x: number; y: number; below: boolean } | null = null;
    if (showBubble) {
      const mark = content.querySelector<HTMLElement>("[data-editor-sel]");
      const rects = mark
        ? [...mark.getClientRects()].filter((r) => r.width > 0)
        : [];
      const a = rects[0];
      const z = rects[rects.length - 1];
      if (a && z) {
        const top = (a.top - base.top) / k;
        const bottom = (z.bottom - base.top) / k;
        const left = (a.left - base.left) / k;
        const right = ((rects.length > 1 ? a.right : z.right) - base.left) / k;
        const bw =
          bubbleRef.current?.offsetWidth ?? bubbleMarks.length * 30 + 8;
        const bh = bubbleRef.current?.offsetHeight ?? 38;
        const below = top - bh - 8 < viewTop + 4;
        nextBubble = {
          x: Math.round(
            Math.min(Math.max(8, (left + right) / 2 - bw / 2), cw - bw - 8),
          ),
          y: Math.round(below ? bottom + 8 : top - bh - 8),
          below,
        };
      }
    }
    setBubblePos((was) =>
      JSON.stringify(was) === JSON.stringify(nextBubble) ? was : nextBubble,
    );

    let nextMenu: { x: number; y: number; w?: number; maxH: number } | null =
      null;
    if (menu) {
      let ax = 0;
      let top = 0;
      let bottom = 0;
      if (menu.kind === "slash") {
        const mark = content.querySelector<HTMLElement>("[data-editor-sel]");
        const r = mark?.getBoundingClientRect();
        if (r) {
          ax = (r.left - base.left) / k;
          top = (r.top - base.top) / k;
          bottom = (r.bottom - base.top) / k;
        }
      } else {
        const anchor = content.querySelector<HTMLElement>(
          `[data-editor-anchor="${menu.kind}-${menu.blockId}"]`,
        );
        const r = anchor?.getBoundingClientRect();
        if (r) {
          ax = (r.left - base.left) / k;
          top = (r.top - base.top) / k;
          bottom = (r.bottom - base.top) / k;
        }
      }
      const mw = phone ? cw - 16 : (menuRef.current?.offsetWidth ?? 240);
      // Its full height, even while it is capped and scrolling.
      const natural = menuRef.current?.scrollHeight ?? 220;
      const roomBelow = viewBottom - 8 - (bottom + 6);
      const roomAbove = top - 6 - (viewTop + 8);
      const below = natural <= roomBelow || roomBelow >= roomAbove;
      const maxH = Math.max(120, Math.floor(below ? roomBelow : roomAbove));
      const h = Math.min(natural, maxH);
      nextMenu = {
        x: Math.round(phone ? 8 : Math.min(Math.max(8, ax - 8), cw - mw - 8)),
        y: Math.round(below ? bottom + 6 : top - 6 - h),
        w: phone ? Math.round(mw) : undefined,
        maxH,
      };
    }
    setMenuPos((was) =>
      JSON.stringify(was) === JSON.stringify(nextMenu) ? was : nextMenu,
    );
    // Re-measured when what they point at moves, and once more after their
    // own first render (the positions are deps), which settles their size.
  }, [
    showBubble,
    menu,
    sel,
    blocks,
    phone,
    width,
    bubbleMarks.length,
    bubblePos,
    menuPos,
  ]);

  /* -------------------------------- render -------------------------------- */

  const words = wordsIn(blocks);
  const headings = blocks.filter(
    (b) => b.type === "heading" || b.type === "subheading",
  );
  const menuBlock = menu
    ? blocks.find((b) => b.id === menu.blockId)
    : undefined;
  const items = menu ? menuItems(menu) : [];

  const page =
    status === "loading" ? (
      <div aria-hidden className="flex flex-col gap-3 px-6 py-6">
        {[40, 100, 92, 70, 0, 30, 84, 76].map((w, i) =>
          w === 0 ? (
            <span key={i} className="h-2" />
          ) : (
            <span
              key={i}
              className={cn(
                "rounded-1 bg-surface-2 motion-safe:animate-pulse",
                i === 0 ? "h-5" : "h-3",
              )}
              style={{ width: `${w}%` }}
            />
          ),
        )}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <CircleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          The document could not be opened.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Retry
          </button>
        ) : null}
      </div>
    ) : (
      <div
        ref={scrollerRef}
        onWheel={() => scrollAnim.current?.stop()}
        onTouchStart={() => scrollAnim.current?.stop()}
        className="[scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain"
      >
        <div
          ref={contentRef}
          className={cn(
            "relative mx-auto w-full pt-3 pb-24",
            phone ? "pr-4 pl-2" : "max-w-[44rem] pr-8 pl-3",
            handles === "off" || readOnly ? (phone ? "pl-4" : "pl-8") : "",
          )}
        >
          {blocks.length === 0 ? (
            <button
              type="button"
              disabled={!editable}
              onClick={() => {
                const id = newId();
                commit([{ id, type: "paragraph", text: "" }], true);
                focusAt(id, 0);
              }}
              className={cn(
                "mx-auto mt-10 flex h-9 items-center gap-2 rounded-2 border border-dashed border-hairline-strong px-4 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-4" />
              Start writing
            </button>
          ) : null}
          <ol
            role="list"
            aria-label="Blocks"
            className="relative flex flex-col"
          >
            {blocks.map((b, i) => (
              <EditorBlockRow
                key={b.id}
                block={b}
                index={i}
                total={blocks.length}
                editing={focusId === b.id && !readOnly}
                sel={focusId === b.id ? sel : null}
                handles={handles}
                plus={slash !== "off"}
                phone={phone}
                dragging={dragId === b.id}
                menuFor={
                  menu && menu.blockId === b.id && menu.kind !== "slash"
                    ? menu.kind
                    : null
                }
                listbox={
                  menu &&
                  menu.kind === "slash" &&
                  menu.blockId === b.id &&
                  items.length
                    ? {
                        id: menuId,
                        active: Math.min(menu.active, items.length - 1),
                      }
                    : null
                }
                motionSafe={motionSafe}
                disabled={disabled}
                readOnly={readOnly}
                placeholder={placeholder}
                hintId={hintId}
                isLive={isLive}
                register={register}
                bindArea={bindArea}
                onFocus={onFocus}
                onBlur={onBlur}
                onChange={onChange}
                onSelect={onSelect}
                onKeyDown={onKeyDown}
                onToggle={toggle}
                onPlus={(id) => openMenu("insert", id)}
                onGrip={(id) => openMenu("block", id)}
                onRestPress={onRestPress}
                drag={dragApi}
              />
            ))}
          </ol>

          <AnimatePresence>
            {showBubble && focusId ? (
              <Bubble
                key="bubble"
                marks={bubbleMarks}
                pressed={(mark) =>
                  !!editingBlock &&
                  !!sel &&
                  isMarked(editingBlock.text, sel.start, sel.end, mark)
                }
                onApply={(mark) => applyMark(focusId, mark)}
                onEscape={() => {
                  const area = areas.current.get(focusId);
                  if (!area || !sel) return;
                  area.focus({ preventScroll: true });
                  area.setSelectionRange(sel.start, sel.end);
                }}
                pos={bubblePos}
                motionSafe={motionSafe}
                nodeRef={bubbleRef}
              />
            ) : null}
            {menu && menuBlock && items.length ? (
              <BlockMenu
                key={`${menu.kind}-${menu.blockId}`}
                id={menuId}
                role={menu.kind === "slash" ? "listbox" : "menu"}
                layout={
                  menu.kind === "block" || slash === "list" ? "list" : "grid"
                }
                cols={phone ? 2 : 3}
                label={
                  menu.kind === "slash"
                    ? "Block types"
                    : menu.kind === "insert"
                      ? "Insert a block"
                      : `${typeName(menuBlock.type)} ${blocks.indexOf(menuBlock) + 1}`
                }
                items={items}
                active={Math.min(menu.active, items.length - 1)}
                setActive={(a) => setMenu((m) => (m ? { ...m, active: a } : m))}
                onPick={(item) => pick(menu, item)}
                onClose={closeMenu}
                pos={menuPos}
                motionSafe={motionSafe}
                nodeRef={menuRef}
                play={play}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      onKeyDown={(event) => {
        // A gutter menu is closed by Escape wherever focus went inside it.
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          menu &&
          menu.kind !== "slash"
        ) {
          event.preventDefault();
          closeMenu(true);
        }
      }}
      className={cn(
        "@container grid h-[560px] w-full grid-rows-[auto_minmax(0,1fr)] overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          {meta ? (
            <p className="truncate text-xs text-ink-3" title={meta}>
              {meta}
            </p>
          ) : null}
        </div>
        {status === "ready" ? (
          <p className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {plural(blocks.length, "block", "blocks")} ·{" "}
            {plural(words, "word", "words")}
          </p>
        ) : null}
      </header>

      <div
        className={cn(
          "grid grid-rows-[minmax(0,1fr)]",
          mode === "desktop" &&
            status === "ready" &&
            "grid-cols-[12rem_minmax(0,1fr)]",
        )}
      >
        {mode === "desktop" && status === "ready" ? (
          <nav
            aria-label="Outline"
            className="[scrollbar-width:thin] overflow-y-auto overscroll-contain border-r border-hairline bg-surface-0 p-3"
          >
            <p className="mb-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Outline
            </p>
            {headings.length ? (
              <ol className="flex flex-col gap-0.5">
                {headings.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => {
                        const area = areas.current.get(h.id);
                        if (!area) return;
                        area.focus({ preventScroll: true });
                        area.setSelectionRange(h.text.length, h.text.length);
                        const li = area.closest("li");
                        const box = scrollerRef.current;
                        if (li && box) glideTo(li.offsetTop - 16);
                      }}
                      className={cn(
                        "flex h-8 w-full items-center rounded-2 px-2 text-left text-[12px] transition-colors hover:bg-surface-2 hover:text-foreground",
                        h.type === "subheading"
                          ? "pl-5 text-ink-3"
                          : "text-ink-2",
                        focusId === h.id && "bg-surface-2 text-foreground",
                        FOCUS_RING_IN,
                      )}
                    >
                      <span className="truncate">
                        {plainOf(h.text) || "Untitled"}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-2 text-[12px] text-ink-3">No headings yet.</p>
            )}
          </nav>
        ) : null}
        {page}
      </div>

      <p id={hintId} className="sr-only">
        Alt+Up or Alt+Down moves the block. Type / for block types. Select text
        for formatting, or press Alt+F10 to reach it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
