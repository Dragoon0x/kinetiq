"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  usePresence,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CircleCheck,
  CornerDownLeft,
  Languages,
  Link2,
  LoaderCircle,
  MessageSquare,
  PenLine,
  Scissors,
  Search,
  Share2,
  Sparkles,
  Table2,
  TextQuote,
  Ticket,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type AnchoredAccent = "cobalt" | "plum" | "mint" | "ink";
export type AnchoredQuoteStyle = "bar" | "marks" | "chip";
export type AnchoredSelectionKind = "text" | "items" | "none";
export type AnchoredActionIcon =
  | "rewrite"
  | "shorten"
  | "clarify"
  | "translate"
  | "link"
  | "comment"
  | "quote"
  | "assign"
  | "due"
  | "later"
  | "tickets"
  | "done"
  | "search"
  | "table"
  | "goto"
  | "share";

export type AnchoredSelection =
  | { kind: "text"; block: string; start: number; end: number }
  | { kind: "items"; ids: string[] };

export type AnchoredTask = {
  id: string;
  text: string;
  /** Initials of whoever owns it. */
  owner?: string;
  /** When it is due, written out ("21 Oct"). */
  due?: string;
};

export type AnchoredBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "tasks"; label: string; items: AnchoredTask[] };

export type AnchoredDoc = {
  title: string;
  /** Where it lives, outermost first. */
  path: string[];
  /** When it was last edited, in ms. */
  edited?: number;
  author?: string;
  blocks: AnchoredBlock[];
};

export type AnchoredAction = {
  id: string;
  label: string;
  icon: AnchoredActionIcon;
  /** A quiet note at the row's end ("pt-PT"). */
  hint?: string;
  keywords?: string[];
  /** What the selection would become: shown in place of the quote while highlighted. */
  preview?: (text: string) => string;
};

export type AnchoredActions = Record<AnchoredSelectionKind, AnchoredAction[]>;

export type AnchoredPaletteProps = {
  /** Pixels between the selection and the palette that grows out of it. @default 8 */
  anchorGap?: number;
  /** How the selection is quoted at the palette's top. @default "bar" */
  quoteStyle?: AnchoredQuoteStyle;
  /** The selection mark, the grow tint and the highlight. A name or any CSS colour. @default "cobalt" */
  accent?: AnchoredAccent | (string & {});
  /** The document. @default defaultAnchoredDoc */
  doc?: AnchoredDoc;
  /** Controlled selection: a range of one paragraph, or some tasks. */
  selection?: AnchoredSelection | null;
  /** Initial selection when uncontrolled. @default null */
  defaultSelection?: AnchoredSelection | null;
  /** Fires from the drag, key or click that changed the selection. */
  onSelectionChange?: (selection: AnchoredSelection | null) => void;
  /** The actions that fit each kind of selection; `none` is the full palette. @default defaultAnchoredActions */
  actions?: AnchoredActions;
  /** Action ids listed first under Recent where they fit. @default defaultAnchoredRecent */
  recent?: string[];
  /** Controlled: the palette is open. Opening this way never takes focus. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the shortcut, click, Escape, run or drag that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** Run an action on the selection. A rejected promise shows the action-failed state. */
  onAction?: (
    action: AnchoredAction,
    selection: AnchoredSelection | null,
  ) => void | Promise<void>;
  /** The highlighted action changed (null when the palette closes). */
  onPreview?: (
    action: AnchoredAction | null,
    selection: AnchoredSelection | null,
  ) => void;
  /** The palette was dismissed: Escape, a click outside, or a drag down. */
  onDismiss?: () => void;
  /** Cmd or Ctrl+K, pressed while focus is in the document, opens and closes it. @default true */
  shortcut?: boolean;
  /** Below this frame width the palette opens as a bottom sheet, in px. @default 420 */
  sheetBelow?: number;
  /** The time "edited" is read from, in ms. @default defaultAnchoredNow */
  now?: number;
  /** The field's placeholder. @default "Do something with this…" */
  placeholder?: string;
  /** The palette's accessible name. @default "Selection actions" */
  label?: string;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** Friday 16 October 2026, 13:20 UTC. */
export const defaultAnchoredNow = Date.UTC(2026, 9, 16, 13, 20);
const MIN = 60_000;

export const defaultAnchoredDoc: AnchoredDoc = {
  title: "Offline sync — v3",
  path: ["Waylight", "Specs"],
  edited: defaultAnchoredNow - 12 * MIN,
  author: "Ines Park",
  blocks: [
    {
      id: "retry",
      type: "paragraph",
      text: "The client retries every 30 seconds, backing off to five minutes after three failures, and never drops a queued edit without asking the person who made it.",
    },
    { id: "queue-head", type: "heading", text: "The offline queue" },
    {
      id: "queue",
      type: "paragraph",
      text: "When a device loses its connection, Waylight keeps every edit in a local queue and marks the document as offline for everyone else who has it open.",
    },
    {
      id: "tasks",
      type: "tasks",
      label: "Open tasks",
      items: [
        {
          id: "task-copy",
          text: "Write conflict copy for two editors",
          owner: "IP",
          due: "21 Oct",
        },
        {
          id: "task-queue",
          text: "Measure queue size on low-end phones",
          owner: "TR",
          due: "24 Oct",
        },
        {
          id: "task-metered",
          text: "Decide the retry limit on metered networks",
          owner: "JV",
        },
        { id: "task-migrate", text: "Write the migration note for v2 clients" },
      ],
    },
  ],
};

const shorten = (text: string) => {
  const s = text
    .replace(/\bseconds?\b/g, "s")
    .replace(/\bminutes?\b/g, "min")
    .replace(/\bin order to\b/g, "to")
    .replace(/\s+/g, " ")
    .trim();
  const words = s.split(" ");
  return words.length > 12 ? `${words.slice(0, 12).join(" ")}…` : s;
};

export const defaultAnchoredActions: AnchoredActions = {
  text: [
    {
      id: "rewrite",
      label: "Rewrite",
      icon: "rewrite",
      keywords: ["edit", "improve"],
    },
    { id: "shorten", label: "Shorten", icon: "shorten", preview: shorten },
    {
      id: "clarify",
      label: "Make it clearer",
      icon: "clarify",
      keywords: ["simplify"],
    },
    {
      id: "translate",
      label: "Translate to Portuguese",
      icon: "translate",
      hint: "pt-PT",
    },
    { id: "link", label: "Link to…", icon: "link", keywords: ["url", "page"] },
    { id: "comment", label: "Comment", icon: "comment" },
    {
      id: "quote",
      label: "Copy as quote",
      icon: "quote",
      preview: (t) => `“${t}”`,
    },
  ],
  items: [
    { id: "assign", label: "Assign to…", icon: "assign", keywords: ["owner"] },
    { id: "due", label: "Set due date", icon: "due", keywords: ["deadline"] },
    { id: "later", label: "Move to Later", icon: "later" },
    { id: "tickets", label: "Convert to tickets", icon: "tickets" },
    { id: "done", label: "Mark done", icon: "done" },
    { id: "comment-tasks", label: "Comment", icon: "comment" },
  ],
  none: [
    { id: "find", label: "Find in this spec", icon: "search" },
    { id: "table", label: "Insert table", icon: "table" },
    { id: "goto-queue", label: "Go to The offline queue", icon: "goto" },
    { id: "goto-tasks", label: "Go to Open tasks", icon: "goto" },
    { id: "share", label: "Share spec", icon: "share" },
  ],
};

export const defaultAnchoredRecent = ["shorten", "assign"];

const ICONS: Record<AnchoredActionIcon, LucideIcon> = {
  rewrite: PenLine,
  shorten: Scissors,
  clarify: Sparkles,
  translate: Languages,
  link: Link2,
  comment: MessageSquare,
  quote: TextQuote,
  assign: UserPlus,
  due: CalendarClock,
  later: Archive,
  tickets: Ticket,
  done: CircleCheck,
  search: Search,
  table: Table2,
  goto: ArrowDown,
  share: Share2,
};

const ACCENTS: Record<AnchoredAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const FRAME_H = 520;
const PALETTE_W = 320;
const FALLBACK_W = 420;
const ROW_H = 36;
const MAX_LIST = 216;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const noop = () => () => {};
const isMac = () =>
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
const no = () => false;

/* --------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const WORD = /[\p{L}\p{N}'’-]/u;

/** A range grown to whole words and trimmed of the spaces at its ends. */
const snapWords = (text: string, start: number, end: number) => {
  let a = clamp(Math.min(start, end), 0, text.length);
  let b = clamp(Math.max(start, end), 0, text.length);
  while (a > 0 && WORD.test(text[a - 1] ?? "") && WORD.test(text[a] ?? ""))
    a -= 1;
  while (
    b < text.length &&
    WORD.test(text[b] ?? "") &&
    WORD.test(text[b - 1] ?? "")
  )
    b += 1;
  while (a < b && /[\s,.;:]/.test(text[a] ?? "")) a += 1;
  while (b > a && /[\s,;:]/.test(text[b - 1] ?? "")) b -= 1;
  return { start: a, end: b };
};

/** The end of the word after `from`. */
const nextWordEnd = (text: string, from: number) => {
  let i = from;
  while (i < text.length && !WORD.test(text[i] ?? "")) i += 1;
  while (i < text.length && WORD.test(text[i] ?? "")) i += 1;
  return i;
};

/** The end of the word before the one that ends at `from`. */
const prevWordEnd = (text: string, from: number, floor: number) => {
  let i = from;
  while (i > floor && WORD.test(text[i - 1] ?? "")) i -= 1;
  while (i > floor && !WORD.test(text[i - 1] ?? "")) i -= 1;
  return Math.max(i, floor);
};

/** Characters before (node, offset) inside a paragraph, skipping the inline Actions pill. */
const offsetIn = (root: Element, node: Node, offset: number): number => {
  if (node.nodeType !== Node.TEXT_NODE) {
    const child = node.childNodes[offset];
    if (child) return offsetIn(root, child, 0);
    return (root.textContent ?? "").length;
  }
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("[data-ap-skip]")) continue;
    if (n === node) return total + offset;
    total += n.textContent?.length ?? 0;
  }
  return total;
};

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const ago = (now: number, at: number) => {
  const m = Math.round((now - at) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

type Rect = { x: number; y: number; w: number; h: number };

/** Run tokens: a run that settles after it was superseded or unmounted writes nothing. */
function useRunGuard() {
  const state = React.useRef({ token: 0, alive: true });
  React.useEffect(() => {
    const s = state.current;
    s.alive = true;
    return () => {
      s.alive = false;
    };
  }, []);
  return React.useMemo(
    () => ({
      next: () => {
        state.current.token += 1;
        return state.current.token;
      },
      live: (token: number) =>
        state.current.alive && token === state.current.token,
    }),
    [],
  );
}
type View = { top: number; height: number; width: number };

/* ---------------------------------- shell --------------------------------- */

/**
 * The palette's body. It is placed on the selection's own rectangle before
 * the first paint, grows to its place on the glide spring, and on the way
 * out shrinks back into that rectangle on the exit ease. Its contents are
 * laid out at the final width from the start and clipped by the shell, so
 * nothing reflows while it grows.
 */
function Shell({
  anchor,
  room,
  place,
  width,
  motionSafe,
  label,
  onKeyDown,
  children,
}: {
  anchor: () => Rect;
  /** Space beside the selection, above and below it, inside the visible document. */
  room: () => number;
  place: (height: number) => { x: number; y: number };
  width: number;
  motionSafe: boolean;
  label: string;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const w = useMotionValue(width);
  const h = useMotionValue(0);
  const radius = useMotionValue(4);
  const wash = useMotionValue(1);
  const inner = useMotionValue(0);
  const opacity = useMotionValue(1);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const from = React.useRef<Rect>({ x: 0, y: 0, w: 0, h: 0 });

  const stop = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
  };

  React.useLayoutEffect(() => {
    const a = anchor();
    from.current = a;
    // The list gives up rows before the palette would cover the selection:
    // it is fitted to the larger side's room, never under two rows.
    const node = contentRef.current;
    const list = node?.querySelector<HTMLElement>("[data-ap-list]");
    if (node && list) {
      // Two pixels of border sit outside the measured content.
      const spare = room() - (node.offsetHeight - list.offsetHeight) - 4;
      // Too little room on either side: the full list, and the document
      // scrolls to it instead.
      const fit = Math.round(
        spare >= 2 * ROW_H + 8 ? Math.min(spare, MAX_LIST) : MAX_LIST,
      );
      node.style.setProperty("--ap-list-max", `${fit}px`);
    }
    const height = contentRef.current?.offsetHeight ?? 280;
    const to = place(height);
    if (motionSafe) {
      x.jump(a.x);
      y.jump(a.y);
      w.jump(Math.max(8, a.w));
      h.jump(Math.max(8, a.h));
      radius.jump(4);
      wash.jump(1);
      inner.jump(0);
      opacity.jump(1);
    } else {
      x.jump(to.x);
      y.jump(to.y);
      w.jump(width);
      h.jump(height);
      radius.jump(12);
      wash.jump(0);
      inner.jump(1);
      opacity.jump(0);
    }
    // Mount only: the grow starts from where the selection is right now.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grow, and keep the height (and an above-placement) true to the contents.
  React.useEffect(() => {
    if (!isPresent) return;
    const node = contentRef.current;
    const go = (first: boolean) => {
      const height = node?.offsetHeight ?? 280;
      const to = place(height);
      stop();
      if (!motionSafe) {
        x.jump(to.x);
        y.jump(to.y);
        h.jump(height);
        runs.current = [animate(opacity, 1, { duration: durations.fast })];
        return;
      }
      runs.current = [
        animate(x, to.x, springs.glide),
        animate(y, to.y, springs.glide),
        animate(w, width, springs.glide),
        animate(h, height, springs.glide),
        animate(radius, 12, springs.glide),
        animate(wash, 0, { duration: durations.slow, ease: easings.enter }),
        animate(inner, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay: first ? 0.12 : 0,
        }),
      ];
    };
    go(true);
    if (!node || typeof ResizeObserver === "undefined") return stop;
    let seen = node.offsetHeight;
    const ro = new ResizeObserver(() => {
      if (node.offsetHeight !== seen) {
        seen = node.offsetHeight;
        go(false);
      }
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, width, motionSafe]);

  // Back into the selection: a shrink on the exit ease, never a spring.
  React.useEffect(() => {
    if (isPresent) return;
    stop();
    let gone = false;
    const done = () => {
      if (gone) return;
      gone = true;
      safeToRemove?.();
    };
    const safety = window.setTimeout(done, 600);
    const a = from.current;
    if (!motionSafe) {
      runs.current = [
        animate(opacity, 0, { ...exitFor(durations.fast), onComplete: done }),
      ];
    } else {
      const ease = { duration: 0.28, ease: easings.exit };
      runs.current = [
        animate(inner, 0, { duration: durations.blink }),
        animate(wash, 1, { duration: 0.2 }),
        animate(x, a.x, ease),
        animate(y, a.y, ease),
        animate(w, Math.max(8, a.w), ease),
        animate(h, Math.max(8, a.h), ease),
        animate(radius, 4, { ...ease, onComplete: done }),
      ];
    }
    return () => {
      window.clearTimeout(safety);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  React.useEffect(() => stop, []);

  return (
    <motion.div
      role="dialog"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="absolute top-0 left-0 z-30 overflow-hidden border border-hairline-strong bg-popover text-foreground shadow-[0_16px_44px_color-mix(in_oklab,black_24%,transparent)]"
      style={{ x, y, width: w, height: h, borderRadius: radius, opacity }}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-[color-mix(in_oklab,var(--ap-accent)_26%,var(--popover))]"
        style={{ opacity: wash }}
      />
      <motion.div
        ref={contentRef}
        className="absolute top-0 left-0"
        style={{ width, opacity: inner }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * The palette on a narrow frame: a sheet that rises from the bottom edge on
 * the glide spring. Its grip follows the finger 1:1 (rubber-banded upward), and
 * a projected release past a third of its height dismisses it.
 */
function Sheet({
  motionSafe,
  label,
  onKeyDown,
  onDismiss,
  head,
  children,
}: {
  motionSafe: boolean;
  label: string;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onDismiss: () => void;
  /** The grip and the quote: the part a finger can drag the sheet by. */
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const y = useMotionValue(0);
  const opacity = useMotionValue(motionSafe ? 1 : 0);
  const scrim = useMotionValue(0);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const start = React.useRef(0);
  const stop = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
  };
  const heightOf = () => ref.current?.offsetHeight ?? 320;

  React.useLayoutEffect(() => {
    if (motionSafe) y.jump(heightOf());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!isPresent) return;
    stop();
    runs.current = motionSafe
      ? [
          animate(y, 0, springs.glide),
          animate(scrim, 1, { duration: durations.base }),
        ]
      : [
          animate(opacity, 1, { duration: durations.fast }),
          animate(scrim, 1, { duration: durations.fast }),
        ];
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, motionSafe]);

  React.useEffect(() => {
    if (isPresent) return;
    stop();
    let gone = false;
    const done = () => {
      if (gone) return;
      gone = true;
      safeToRemove?.();
    };
    const safety = window.setTimeout(done, 600);
    const ease = { duration: durations.base, ease: easings.exit };
    runs.current = motionSafe
      ? [
          animate(y, heightOf(), { ...ease, onComplete: done }),
          animate(scrim, 0, ease),
        ]
      : [
          animate(opacity, 0, { ...exitFor(durations.fast), onComplete: done }),
          animate(scrim, 0, exitFor(durations.fast)),
        ];
    return () => {
      window.clearTimeout(safety);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent]);

  React.useEffect(() => stop, []);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    onStart: () => {
      stop();
      start.current = y.get();
    },
    onMove: ({ offset }) => {
      const raw = start.current + offset.y;
      y.set(r2(raw < 0 ? rubberband(raw, heightOf()) : raw));
    },
    onEnd: ({ velocity }) => {
      // A flick commits to where it would come to rest.
      const landing = project(y.get(), velocity.y, 0.99);
      if (landing > heightOf() / 3) {
        onDismiss();
        return;
      }
      runs.current = [
        animate(y, 0, { ...springs.glide, velocity: velocity.y }),
      ];
    },
    onCancel: () => {
      runs.current = [animate(y, 0, springs.glide)];
    },
  });

  return (
    <>
      <motion.div
        aria-hidden
        className="absolute inset-0 z-30 bg-[color-mix(in_oklab,var(--background)_55%,transparent)]"
        style={{ opacity: scrim }}
        onPointerDown={(event) => {
          event.preventDefault();
          onDismiss();
        }}
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="absolute inset-x-0 bottom-0 z-40 overflow-hidden rounded-t-4 border-t border-hairline-strong bg-popover text-foreground shadow-[0_-12px_40px_color-mix(in_oklab,black_22%,transparent)]"
        style={{ y, opacity, maxHeight: "86%" }}
      >
        <div
          {...drag}
          className="cursor-grab touch-pan-x pb-1 select-none active:cursor-grabbing"
        >
          <div className="flex h-5 items-center justify-center">
            <span
              aria-hidden
              className="h-1 w-9 rounded-full bg-hairline-strong"
            />
          </div>
          {head}
        </div>
        {children}
      </motion.div>
    </>
  );
}

/* -------------------------------- component ------------------------------- */

/**
 * A document with a command menu that opens from your selection instead of
 * the middle of the screen. Select a phrase (it snaps to whole words and
 * becomes a tinted mark) or pick some tasks, press Cmd or Ctrl+K, and the
 * palette grows out of the selection's own rectangle on the glide spring to
 * sit just below it (or above, when there is no room), quoting the selection
 * at its top and listing only the actions that fit it. Escape shrinks it back
 * into the selection on the exit ease. With nothing selected it opens the full
 * palette from the middle; on a narrow frame it is a bottom sheet you can drag
 * away.
 *
 * Paragraphs are focusable and Shift+Arrow selects word by word; the task
 * list is a multi-select listbox. The palette is a dialog with a combobox:
 * Up and Down move, Enter runs, Escape closes, and focus goes back where it
 * came from. A rejected run keeps the palette open with the row in danger.
 * Under reduced motion the palette fades in and out in place.
 */
export function AnchoredPalette({
  anchorGap = 8,
  quoteStyle = "bar",
  accent = "cobalt",
  doc = defaultAnchoredDoc,
  selection,
  defaultSelection = null,
  onSelectionChange,
  actions = defaultAnchoredActions,
  recent = defaultAnchoredRecent,
  open,
  defaultOpen = false,
  onOpenChange,
  onAction,
  onPreview,
  onDismiss,
  shortcut = true,
  sheetBelow = 420,
  now = defaultAnchoredNow,
  placeholder = "Do something with this…",
  label = "Selection actions",
  className,
}: AnchoredPaletteProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-list`;
  const mac = React.useSyncExternalStore(noop, isMac, no);

  const [ownSelection, setOwnSelection] =
    React.useState<AnchoredSelection | null>(defaultSelection);
  const sel = selection === undefined ? ownSelection : selection;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;

  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [running, setRunning] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [pulse, setPulse] = React.useState(0);
  const [said, setSaid] = React.useState("");
  const [width, setWidth] = React.useState(0);
  const [focusOnOpen, setFocusOnOpen] = React.useState(false);
  const [inputEl, setInputEl] = React.useState<HTMLInputElement | null>(null);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [frameEl, setFrameEl] = React.useState<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const opener = React.useRef<"button" | "key" | "host">("host");
  const runs = useRunGuard();

  const bindFrame = React.useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node;
    setFrameEl(node);
  }, []);

  React.useEffect(() => {
    if (!frameEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, [frameEl]);

  const sheet = width > 0 && width < sheetBelow;
  const kind: AnchoredSelectionKind = sel ? sel.kind : "none";

  const blockText = (id: string) => {
    const block = doc.blocks.find((b) => b.id === id);
    return block && block.type !== "tasks" ? block.text : "";
  };
  const tasks = doc.blocks.flatMap((b) => (b.type === "tasks" ? b.items : []));
  const selectedText =
    sel?.kind === "text" ? blockText(sel.block).slice(sel.start, sel.end) : "";
  const selectedTasks =
    sel?.kind === "items" ? tasks.filter((t) => sel.ids.includes(t.id)) : [];

  const fits = actions[kind] ?? [];
  const recentFits = recent
    .map((id) => fits.find((a) => a.id === id))
    .filter((a): a is AnchoredAction => Boolean(a));
  const filtered = (list: AnchoredAction[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) =>
      [a.label, ...(a.keywords ?? [])].join(" ").toLowerCase().includes(q),
    );
  };
  const sections = [
    { id: "recent", label: "Recent", rows: filtered(recentFits) },
    {
      id: "fit",
      label:
        kind === "text"
          ? "For this text"
          : kind === "items"
            ? `For ${selectedTasks.length} ${selectedTasks.length === 1 ? "task" : "tasks"}`
            : "Everything",
      rows: filtered(fits.filter((a) => !recentFits.includes(a))),
    },
  ].filter((s) => s.rows.length);
  const rows = sections.flatMap((s) => s.rows);
  const current = Math.min(active, Math.max(0, rows.length - 1));
  const activeAction = rows[current];

  /* ------------------------------- selection ------------------------------- */

  const commitSelection = (next: AnchoredSelection | null) => {
    if (selection === undefined) setOwnSelection(next);
    onSelectionChange?.(next);
  };

  const readNative = () => {
    const native = window.getSelection();
    if (!native || native.isCollapsed || !native.rangeCount) return false;
    const range = native.getRangeAt(0);
    const startBlock = (
      range.startContainer.parentElement ?? null
    )?.closest<HTMLElement>("[data-ap-block]");
    const endBlock = (
      range.endContainer.parentElement ?? null
    )?.closest<HTMLElement>("[data-ap-block]");
    if (!startBlock || startBlock !== endBlock) return false;
    const id = startBlock.dataset.apBlock ?? "";
    const text = blockText(id);
    if (!text) return false;
    const a = offsetIn(startBlock, range.startContainer, range.startOffset);
    const b = offsetIn(startBlock, range.endContainer, range.endOffset);
    const snapped = snapWords(text, a, b);
    if (snapped.end <= snapped.start) return false;
    native.removeAllRanges();
    commitSelection({
      kind: "text",
      block: id,
      start: snapped.start,
      end: snapped.end,
    });
    setSaid(
      `Selected “${text.slice(snapped.start, snapped.end)}”. Press ${mac ? "Command" : "Control"} K for actions.`,
    );
    return true;
  };

  /* -------------------------------- opening -------------------------------- */

  const setOpenState = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const openPalette = (how: "button" | "key") => {
    opener.current = how;
    const activeEl = document.activeElement;
    returnTo.current = activeEl instanceof HTMLElement ? activeEl : null;
    setQuery("");
    setActive(0);
    setFailed(null);
    setFocusOnOpen(true);
    setOpenState(true);
    const first = (sel ? actions[sel.kind] : actions.none)?.[0] ?? null;
    onPreview?.(first, sel);
    setSaid(
      sel?.kind === "text"
        ? `Actions for “${selectedText}”.`
        : sel?.kind === "items"
          ? `Actions for ${selectedTasks.length} tasks.`
          : "All actions. Select text or tasks for actions that fit them.",
    );
  };

  const closePalette = (why: "dismiss" | "ran") => {
    if (!isOpen) return;
    setOpenState(false);
    setFocusOnOpen(false);
    onPreview?.(null, sel);
    if (why === "dismiss") onDismiss?.();
  };

  // Focus goes back where it came from once the palette has closed. A
  // previous opening's node may be gone; only a live one gets it back.
  React.useEffect(() => {
    if (isOpen) return;
    const back = returnTo.current;
    returnTo.current = null;
    if (back && back.isConnected && opener.current !== "host") {
      back.focus({ preventScroll: true });
    }
  }, [isOpen]);

  // Focus is moved when the field arrives, never on a guessed frame.
  React.useEffect(() => {
    if (inputEl && focusOnOpen) inputEl.focus({ preventScroll: true });
  }, [inputEl, focusOnOpen]);

  const onFrameKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      !shortcut ||
      event.altKey ||
      !(event.metaKey || event.ctrlKey) ||
      event.key.toLowerCase() !== "k"
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (isOpen) {
      closePalette("dismiss");
      return;
    }
    // A focused paragraph with nothing selected offers itself whole.
    const focusedBlock = (event.target as HTMLElement).closest?.<HTMLElement>(
      "[data-ap-block]",
    );
    if (!sel && focusedBlock) {
      const id = focusedBlock.dataset.apBlock ?? "";
      const text = blockText(id);
      if (text)
        commitSelection({
          kind: "text",
          block: id,
          start: 0,
          end: text.length,
        });
    }
    openPalette("key");
  };

  /* ------------------------------- geometry ------------------------------- */

  const view = (): View => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    return {
      top: scroller?.scrollTop ?? 0,
      height: scroller?.clientHeight ?? FRAME_H,
      width: content?.clientWidth ?? 600,
    };
  };

  const anchor = (): Rect => {
    const content = contentRef.current;
    const v = view();
    const centre = {
      x: v.width / 2 - 60,
      y: v.top + v.height / 3,
      w: 120,
      h: 24,
    };
    if (!content) return centre;
    const c = content.getBoundingClientRect();
    let rects: DOMRect[] = [];
    if (sel?.kind === "text") {
      const mark = content.querySelector("[data-ap-mark]");
      rects = mark ? Array.from(mark.getClientRects()) : [];
    } else if (sel?.kind === "items") {
      rects = Array.from(
        content.querySelectorAll('[data-ap-task][aria-selected="true"]'),
      ).map((n) => n.getBoundingClientRect());
    } else if (opener.current === "button" && buttonRef.current) {
      rects = [buttonRef.current.getBoundingClientRect()];
    }
    if (!rects.length) return centre;
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return {
      x: r2(left - c.left),
      y: r2(Math.max(v.top - 40, top - c.top)),
      w: r2(right - left),
      h: r2(bottom - top),
    };
  };

  const paletteW = Math.min(
    kind === "none" ? FALLBACK_W : PALETTE_W,
    Math.max(200, (width || 600) - 40),
  );

  const room = () => {
    const v = view();
    if (kind === "none") return v.height - 32;
    const a = anchor();
    const below = v.top + v.height - 12 - (a.y + a.h + anchorGap);
    const above = a.y - anchorGap - (v.top + 12);
    return Math.max(below, above);
  };

  const place = (height: number) => {
    const v = view();
    if (kind === "none") {
      return { x: r2((v.width - paletteW) / 2), y: r2(v.top + 16) };
    }
    const a = anchor();
    const x = r2(clamp(a.x, 12, Math.max(12, v.width - paletteW - 12)));
    const below = a.y + a.h + anchorGap;
    const above = a.y - anchorGap - height;
    const spaceBelow = v.top + v.height - 12 - below;
    const spaceAbove = a.y - anchorGap - (v.top + 12);
    // Below when it fits, above when only that fits, and below again when
    // neither does: the document scrolls to it rather than the palette
    // covering what it acts on.
    const y =
      height <= spaceBelow ? below : height <= spaceAbove ? above : below;
    return { x, y: r2(y) };
  };

  // Once grown, a palette that ended up below the fold is brought into view.
  React.useEffect(() => {
    if (!isOpen || sheet) return;
    const timer = window.setTimeout(() => {
      const scroller = scrollRef.current;
      const shell =
        contentRef.current?.querySelector<HTMLElement>('[role="dialog"]');
      if (!scroller || !shell) return;
      const s = shell.getBoundingClientRect();
      const r = scroller.getBoundingClientRect();
      if (s.bottom > r.bottom - 8) {
        scroller.scrollBy({
          top: s.bottom - r.bottom + 16,
          behavior: motionSafe ? "smooth" : "auto",
        });
      }
    }, 480);
    return () => window.clearTimeout(timer);
  }, [isOpen, sheet, motionSafe]);

  /* -------------------------------- running -------------------------------- */

  const run = (action: AnchoredAction) => {
    if (running) return;
    const token = runs.next();
    setFailed(null);
    const outcome = (() => {
      try {
        return onAction?.(action, sel);
      } catch (error) {
        return Promise.reject(error);
      }
    })();
    const succeed = () => {
      if (!runs.live(token)) return;
      setRunning(null);
      setPulse((n) => n + 1);
      setSaid(`${action.label}: done.`);
      closePalette("ran");
    };
    const fail = () => {
      if (!runs.live(token)) return;
      setRunning(null);
      setFailed(action.id);
      setSaid(`${action.label} failed. Press Enter to try again.`);
    };
    if (outcome && typeof (outcome as Promise<void>).then === "function") {
      setRunning(action.id);
      setSaid(`${action.label}…`);
      (outcome as Promise<void>).then(succeed, fail);
    } else succeed();
  };

  const move = (next: number) => {
    if (!rows.length) return;
    const to = clamp(next, 0, rows.length - 1);
    setActive(to);
    if (to !== current) onPreview?.(rows[to] ?? null, sel);
  };

  const onPaletteKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) setQuery("");
      else closePalette("dismiss");
      return;
    }
    if (event.key === "Tab") {
      // A dialog keeps Tab: its only stop is the field.
      event.preventDefault();
      inputEl?.focus();
    }
  };

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(current - 1);
        break;
      case "Enter":
        event.preventDefault();
        if (activeAction) run(activeAction);
        break;
      default:
        break;
    }
  };

  /* ------------------------------ doc keyboard ----------------------------- */

  const onParagraphKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    id: string,
  ) => {
    const text = blockText(id);
    if (event.key === "Escape" && sel && !isOpen) {
      event.preventDefault();
      commitSelection(null);
      setSaid("Selection cleared.");
      return;
    }
    if (
      !event.shiftKey ||
      (event.key !== "ArrowRight" && event.key !== "ArrowLeft")
    )
      return;
    event.preventDefault();
    const mine = sel?.kind === "text" && sel.block === id ? sel : null;
    const start = mine ? mine.start : 0;
    const end = mine
      ? event.key === "ArrowRight"
        ? nextWordEnd(text, mine.end)
        : prevWordEnd(text, mine.end, nextWordEnd(text, mine.start))
      : nextWordEnd(text, 0);
    const snapped = snapWords(text, start, end);
    commitSelection({
      kind: "text",
      block: id,
      start: snapped.start,
      end: snapped.end,
    });
    setSaid(`Selected “${text.slice(snapped.start, snapped.end)}”.`);
  };

  const [taskActive, setTaskActive] = React.useState(0);
  const toggleTask = (id: string, add: boolean) => {
    const ids = sel?.kind === "items" ? sel.ids : [];
    const on = ids.includes(id);
    const next = add
      ? on
        ? ids.filter((x) => x !== id)
        : [...ids, id]
      : on && ids.length === 1
        ? []
        : [id];
    commitSelection(next.length ? { kind: "items", ids: next } : null);
    setSaid(
      next.length
        ? `${next.length} ${next.length === 1 ? "task" : "tasks"} selected.`
        : "Selection cleared.",
    );
  };

  /* --------------------------------- render -------------------------------- */

  const accentVar = ACCENTS[accent as AnchoredAccent] ?? accent;
  const quoteText =
    kind === "text"
      ? selectedText
      : kind === "items"
        ? selectedTasks.map((t) => t.text).join("; ")
        : "";
  const count =
    kind === "text"
      ? `${words(selectedText)} ${words(selectedText) === 1 ? "word" : "words"}`
      : kind === "items"
        ? `${selectedTasks.length} ${selectedTasks.length === 1 ? "task" : "tasks"}`
        : "";
  const preview =
    kind === "text" && activeAction?.preview
      ? activeAction.preview(selectedText)
      : null;
  const kbd = mac ? "⌘K" : "Ctrl K";
  const dialogName =
    kind === "none"
      ? "All actions"
      : `${label}: ${kind === "text" ? `“${quoteText}”` : count}`;

  // The quote stays put; only its meta line turns into the preview, so the
  // palette never changes height as the highlight moves.
  const meta = (
    <span className="grid min-w-0 [&>*]:[grid-area:1/1]">
      <AnimatePresence initial={false}>
        <motion.span
          key={preview ? `preview-${activeAction?.id ?? ""}` : "count"}
          className={cn(
            "block truncate text-[11px]",
            preview ? "text-[var(--ap-accent)]" : "text-ink-3",
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: durations.blink } }}
          transition={{ duration: durations.fast, ease: easings.enter }}
        >
          {preview ? `→ ${preview}` : count}
        </motion.span>
      </AnimatePresence>
    </span>
  );

  const quote =
    kind === "none" ? (
      <p className="px-3 pt-3 text-xs text-ink-3">
        Select text or tasks to see the actions that fit them.
      </p>
    ) : quoteStyle === "chip" ? (
      <div className="flex flex-col gap-1.5 px-3 pt-3">
        <span className="inline-flex h-6 max-w-full items-center self-start rounded-full bg-[color-mix(in_oklab,var(--ap-accent)_14%,transparent)] px-2.5 font-mono text-[11px] text-[var(--ap-accent)]">
          <span className="truncate">{`“${quoteText}”`}</span>
        </span>
        {meta}
      </div>
    ) : quoteStyle === "marks" ? (
      <div className="relative px-3 pt-3 pl-9">
        <span
          aria-hidden
          className="absolute top-1.5 left-3 text-[28px] leading-none font-semibold text-[var(--ap-accent)]"
        >
          “
        </span>
        <p className="line-clamp-2 text-[13px] leading-snug text-foreground">
          {quoteText}
        </p>
        <span className="mt-1 block">{meta}</span>
      </div>
    ) : (
      <div className="px-3 pt-3">
        <div className="border-l-2 border-[var(--ap-accent)] pl-2.5">
          <p className="line-clamp-2 text-[12.5px] leading-snug text-ink-2 italic">
            {quoteText}
          </p>
          <span className="mt-1 block">{meta}</span>
        </div>
      </div>
    );

  const paletteRest = (
    <div className="flex flex-col">
      <div className="mt-2 flex h-10 items-center gap-2 border-y border-hairline px-3">
        <Search aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        <input
          ref={setInputEl}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeAction ? `${uid}-opt-${activeAction.id}` : undefined
          }
          aria-label={
            kind === "none"
              ? "Search all actions"
              : `Actions for ${kind === "text" ? `“${quoteText}”` : count}`
          }
          placeholder={kind === "none" ? "Search actions…" : placeholder}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setQuery(value);
            setActive(0);
          }}
          onKeyDown={onFieldKeyDown}
          className="h-8 min-w-0 flex-1 rounded-2 bg-transparent px-1 text-[13px] text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/25 focus-visible:outline-solid"
        />
      </div>
      <div
        className="overflow-y-auto overscroll-contain py-1"
        data-ap-list=""
        style={{ maxHeight: `var(--ap-list-max, ${MAX_LIST}px)` }}
      >
        <div id={listId} role="listbox" aria-label="Actions">
          {sections.length ? (
            sections.map((section) => (
              <div
                key={section.id}
                role="group"
                aria-labelledby={`${uid}-g-${section.id}`}
              >
                <p
                  id={`${uid}-g-${section.id}`}
                  className="px-3 pt-1.5 pb-1 text-[10.5px] font-medium tracking-[0.06em] text-ink-3 uppercase"
                >
                  {section.label}
                </p>
                {section.rows.map((action) => {
                  const index = rows.indexOf(action);
                  const on = index === current;
                  const Icon = ICONS[action.icon] ?? PenLine;
                  const busy = running === action.id;
                  const broke = failed === action.id;
                  return (
                    <div
                      key={action.id}
                      id={`${uid}-opt-${action.id}`}
                      role="option"
                      aria-selected={on}
                      aria-busy={busy || undefined}
                      aria-label={
                        broke
                          ? `${action.label}. Failed, press Enter to try again.`
                          : `${action.label}${action.hint ? `, ${action.hint}` : ""}`
                      }
                      onPointerDown={(event) => event.preventDefault()}
                      onPointerMove={() => {
                        if (!on) move(index);
                      }}
                      onClick={() => {
                        setActive(index);
                        run(action);
                      }}
                      className="relative mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-2 px-2 select-none"
                      style={{ height: ROW_H }}
                    >
                      {on ? (
                        <motion.span
                          layoutId={`${uid}-pill`}
                          aria-hidden
                          className={cn(
                            "absolute inset-0 rounded-2",
                            broke
                              ? "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]"
                              : "bg-[color-mix(in_oklab,var(--ap-accent)_13%,transparent)]",
                          )}
                          transition={
                            motionSafe ? springs.snap : { duration: 0 }
                          }
                        />
                      ) : null}
                      <span
                        aria-hidden
                        className={cn(
                          "relative grid size-6 shrink-0 place-items-center rounded-2",
                          broke
                            ? "text-danger"
                            : "bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] text-ink-2",
                        )}
                      >
                        {busy ? (
                          <LoaderCircle
                            className={cn(
                              "size-3.5",
                              motionSafe && "animate-spin",
                            )}
                          />
                        ) : broke ? (
                          <TriangleAlert className="size-3.5" />
                        ) : (
                          <Icon className="size-3.5" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "relative min-w-0 flex-1 truncate text-[13px]",
                          broke
                            ? "text-danger"
                            : on
                              ? "text-foreground"
                              : "text-ink-2",
                        )}
                      >
                        {broke
                          ? `Couldn’t ${action.label.charAt(0).toLowerCase()}${action.label.slice(1).replace(/…$/, "")}`
                          : action.label}
                      </span>
                      <span className="relative shrink-0 text-[11px] text-ink-3">
                        {broke
                          ? "↵ retry"
                          : busy
                            ? "working…"
                            : (action.hint ?? "")}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="px-3 py-3 text-xs text-ink-3">{`No action matches “${query.trim()}”.`}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-hairline px-3 py-1.5 text-[11px] text-ink-3">
        <span className="inline-flex items-center gap-1">
          <ArrowUp aria-hidden className="size-3" />
          <ArrowDown aria-hidden className="size-3" />
        </span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft aria-hidden className="size-3" />
          run
        </span>
        <span className="inline-flex items-center gap-1">
          <kbd className="font-mono text-[10px]">esc</kbd>
          close
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums">{`${rows.length} ${rows.length === 1 ? "action" : "actions"}`}</span>
      </div>
    </div>
  );

  return (
    <div
      className={cn("@container w-full", className)}
      style={{ "--ap-accent": accentVar } as React.CSSProperties}
    >
      <div
        ref={bindFrame}
        onKeyDown={onFrameKeyDown}
        className="relative mx-auto flex w-full max-w-[52rem] flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground"
        style={{ height: FRAME_H }}
      >
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-hairline px-4">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-3">
            {[...doc.path, doc.title].join(" / ")}
          </p>
          {doc.edited !== undefined ? (
            <p className="hidden shrink-0 text-[11px] text-ink-3 @min-[34rem]:block">
              {`Edited ${ago(now, doc.edited)}${doc.author ? ` by ${doc.author}` : ""}`}
            </p>
          ) : null}
          <button
            ref={buttonRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() =>
              isOpen ? closePalette("dismiss") : openPalette("button")
            }
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            Actions
            <kbd className="font-mono text-[10px] text-ink-3">{kbd}</kbd>
          </button>
        </div>

        <div
          ref={scrollRef}
          className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        >
          <div
            ref={contentRef}
            className="relative px-6 pt-5 pb-8 @max-[30rem]:px-4"
            onPointerDown={(event) => {
              if (
                isOpen &&
                !(event.target as HTMLElement).closest('[role="dialog"]')
              )
                closePalette("dismiss");
            }}
            onPointerUp={(event) => {
              if (
                (event.target as HTMLElement).closest(
                  '[role="dialog"], [data-ap-skip], [data-ap-task]',
                )
              )
                return;
              if (readNative()) return;
              // A plain click on the text lets go of a text selection.
              const native = window.getSelection();
              if (
                sel?.kind === "text" &&
                (!native || native.isCollapsed) &&
                (event.target as HTMLElement).closest("[data-ap-block]")
              ) {
                commitSelection(null);
              }
            }}
          >
            <h2 className="text-lg leading-snug font-semibold tracking-[-0.01em] text-foreground">
              {doc.title}
            </h2>
            <p id={`${uid}-doc-hint`} className="sr-only">
              {`Shift and the arrow keys select words. ${mac ? "Command" : "Control"} K opens actions for the selection.`}
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {doc.blocks.map((block) => {
                if (block.type === "heading") {
                  return (
                    <h3
                      key={block.id}
                      className="pt-1 text-[13px] font-semibold text-foreground"
                    >
                      {block.text}
                    </h3>
                  );
                }
                if (block.type === "paragraph") {
                  const mine =
                    sel?.kind === "text" && sel.block === block.id ? sel : null;
                  const text = block.text;
                  return (
                    <p
                      key={block.id}
                      data-ap-block={block.id}
                      tabIndex={0}
                      aria-describedby={`${uid}-doc-hint`}
                      onKeyDown={(event) => onParagraphKeyDown(event, block.id)}
                      className={cn(
                        "-mx-1.5 rounded-2 px-1.5 text-[14px] leading-relaxed text-ink-2 selection:bg-[color-mix(in_oklab,var(--ap-accent)_28%,transparent)]",
                        FOCUS,
                        "focus-visible:outline-offset-1",
                      )}
                    >
                      {mine ? (
                        <>
                          {text.slice(0, mine.start)}
                          <motion.mark
                            key={pulse}
                            data-ap-mark=""
                            className="rounded-[3px] [box-decoration-break:clone] text-foreground"
                            initial={
                              pulse && motionSafe
                                ? {
                                    backgroundColor:
                                      "color-mix(in oklab, var(--ap-accent) 55%, transparent)",
                                  }
                                : false
                            }
                            animate={{
                              backgroundColor:
                                "color-mix(in oklab, var(--ap-accent) 22%, transparent)",
                            }}
                            transition={{
                              duration: durations.slow,
                              ease: easings.enter,
                            }}
                          >
                            {text.slice(mine.start, mine.end)}
                          </motion.mark>
                          {!isOpen ? (
                            <button
                              type="button"
                              data-ap-skip=""
                              tabIndex={-1}
                              aria-hidden
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => openPalette("button")}
                              className={cn(
                                "mx-1 inline-flex h-5 -translate-y-px items-center gap-1 rounded-full border border-hairline bg-popover px-1.5 align-middle text-[10.5px] leading-none text-ink-2 transition-opacity select-none hover:text-foreground",
                              )}
                            >
                              Actions
                              <kbd className="font-mono text-[9.5px] text-ink-3">
                                {kbd}
                              </kbd>
                            </button>
                          ) : null}
                          {text.slice(mine.end)}
                        </>
                      ) : (
                        text
                      )}
                    </p>
                  );
                }
                const ids = sel?.kind === "items" ? sel.ids : [];
                const activeTask = Math.min(taskActive, block.items.length - 1);
                return (
                  <div key={block.id} className="flex flex-col gap-1.5">
                    <h3
                      id={`${uid}-tasks-${block.id}`}
                      className="pt-1 text-[13px] font-semibold text-foreground"
                    >
                      {block.label}
                    </h3>
                    <div
                      role="listbox"
                      aria-multiselectable="true"
                      aria-labelledby={`${uid}-tasks-${block.id}`}
                      aria-activedescendant={`${uid}-task-${block.items[activeTask]?.id ?? ""}`}
                      tabIndex={0}
                      onKeyDown={(event) => {
                        const item = block.items[activeTask];
                        if (
                          event.key === "ArrowDown" ||
                          event.key === "ArrowUp"
                        ) {
                          event.preventDefault();
                          setTaskActive(
                            clamp(
                              activeTask + (event.key === "ArrowDown" ? 1 : -1),
                              0,
                              block.items.length - 1,
                            ),
                          );
                        } else if (
                          (event.key === " " || event.key === "Enter") &&
                          item
                        ) {
                          event.preventDefault();
                          toggleTask(item.id, true);
                        } else if (event.key === "Escape" && sel && !isOpen) {
                          event.preventDefault();
                          commitSelection(null);
                        }
                      }}
                      className={cn(
                        "group/anchored-palette -mx-1.5 flex flex-col rounded-2",
                        FOCUS,
                        "focus-visible:outline-offset-1",
                      )}
                    >
                      {block.items.map((task, i) => {
                        const on = ids.includes(task.id);
                        return (
                          <div
                            key={task.id}
                            id={`${uid}-task-${task.id}`}
                            role="option"
                            aria-selected={on}
                            data-ap-task={task.id}
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              setTaskActive(i);
                              toggleTask(
                                task.id,
                                event.metaKey ||
                                  event.ctrlKey ||
                                  event.shiftKey ||
                                  ids.length > 0,
                              );
                            }}
                            className={cn(
                              "flex h-9 cursor-pointer items-center gap-2.5 rounded-2 px-1.5 transition-colors duration-150 select-none",
                              on
                                ? "bg-[color-mix(in_oklab,var(--ap-accent)_14%,transparent)]"
                                : "hover:bg-surface-2",
                              i === activeTask &&
                                "group-focus-visible/anchored-palette:ring-1 group-focus-visible/anchored-palette:ring-hairline-strong group-focus-visible/anchored-palette:ring-inset",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "size-3.5 shrink-0 rounded-full border-[1.5px]",
                                on
                                  ? "border-[var(--ap-accent)] bg-[var(--ap-accent)]"
                                  : "border-hairline-strong",
                              )}
                            />
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-[13px]",
                                on ? "text-foreground" : "text-ink-2",
                              )}
                              title={task.text}
                            >
                              {task.text}
                            </span>
                            {task.due ? (
                              <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[30rem]:inline">
                                {task.due}
                              </span>
                            ) : null}
                            <span
                              aria-hidden
                              className={cn(
                                "grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold",
                                task.owner
                                  ? "bg-surface-2 text-ink-2"
                                  : "border border-dashed border-hairline-strong",
                              )}
                            >
                              {task.owner ?? ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <AnimatePresence>
              {isOpen && !sheet ? (
                <Shell
                  key={`shell-${kind}`}
                  anchor={anchor}
                  room={room}
                  place={place}
                  width={paletteW}
                  motionSafe={motionSafe}
                  label={dialogName}
                  onKeyDown={onPaletteKeyDown}
                >
                  <div className="flex flex-col">
                    {quote}
                    {paletteRest}
                  </div>
                </Shell>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {isOpen && sheet ? (
            <Sheet
              key="sheet"
              motionSafe={motionSafe}
              label={dialogName}
              onKeyDown={onPaletteKeyDown}
              onDismiss={() => closePalette("dismiss")}
              head={quote}
            >
              {paletteRest}
            </Sheet>
          ) : null}
        </AnimatePresence>
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
