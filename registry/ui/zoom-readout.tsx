"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ChevronDown,
  Frame,
  Hand,
  MessageSquare,
  MousePointer2,
  PenLine,
  Square,
  StickyNote,
  Type,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type ZoomReadoutIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

export type ZoomReadoutTool = {
  id: string;
  label: string;
  icon: ZoomReadoutIcon;
  /** Single-letter shortcut, e.g. "v". Number keys 1–9 always pick by position. */
  key?: string;
};

export type ZoomReadoutItemKind =
  "frame" | "sticky" | "shape" | "ellipse" | "text";

export type ZoomReadoutTone = "amber" | "mint" | "sky" | "rose" | "ink";

export type ZoomReadoutItem = {
  id: string;
  kind: ZoomReadoutItemKind;
  /** Board coordinates, in board pixels (100% zoom). */
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  note?: string;
  tone?: ZoomReadoutTone;
};

export type ZoomReadoutFit = {
  target: "selection" | "all";
  zoom: number;
  ids: string[];
};

export type ZoomReadoutHandle = {
  /** Fits the selection (default) or the whole board, exactly as Shift+1 / Shift+0 do. */
  fit: (target?: "selection" | "all") => void;
  /** Zooms to a percentage on the step spring. */
  zoomTo: (zoom: number) => void;
};

export type ZoomReadoutAccentName = "cobalt" | "plum" | "mint" | "ink";
export type ZoomReadoutReadoutStyle = "roll" | "tiles" | "meter";
export type ZoomReadoutStatus = "ready" | "loading" | "error";

export type ZoomReadoutProps = {
  /** Imperative handle: `fit()` and `zoomTo()` for hosts that drive the board. */
  ref?: React.Ref<ZoomReadoutHandle>;
  /** The tools in the strip, in order; 1–9 pick by position. @default defaultZoomReadoutTools */
  tools?: ZoomReadoutTool[];
  /** Controlled active tool id. */
  tool?: string;
  /** Initial tool when uncontrolled. @default "select" */
  defaultTool?: string;
  /** Fires from the press or key that picked a tool. */
  onToolChange?: (tool: string) => void;
  /** Controlled zoom, in percent. */
  zoom?: number;
  /** Initial zoom when uncontrolled, in percent. @default 50 */
  defaultZoom?: number;
  /** Fires with the new zoom (a whole percent) from the step, pinch or fit that changed it. */
  onZoomChange?: (zoom: number) => void;
  /** Lowest zoom, percent. @default 10 */
  minZoom?: number;
  /** Highest zoom, percent. @default 800 */
  maxZoom?: number;
  /** The stops Zoom in and Zoom out step through, and the menu's presets. @default [10, 25, 50, 75, 100, 150, 200, 400, 800] */
  presets?: number[];
  /** What is on the board. @default defaultZoomReadoutItems */
  items?: ZoomReadoutItem[];
  /** Controlled selection (item ids). */
  selection?: string[];
  /** Initial selection when uncontrolled. @default ["pricing"] */
  defaultSelection?: string[];
  /** Fires from the click or key that changed the selection. */
  onSelectionChange?: (ids: string[]) => void;
  /** Fires when a fit runs, with what was fitted and the zoom it landed on. */
  onFit?: (fit: ZoomReadoutFit) => void;
  /** Room left around a fitted selection, in screen pixels. @default 20 */
  fitPadding?: number;
  /** Tool and zoom button size in px; the strip is 12 px taller. @default 32 */
  toolSize?: number;
  /** How the zoom readout is drawn: bare rolling digits, digits on tiles, or digits over a level meter. @default "roll" */
  readoutStyle?: ZoomReadoutReadoutStyle;
  /** Tool marker, selection and fit brackets: a named accent or any CSS colour. @default "cobalt" */
  accent?: ZoomReadoutAccentName | (string & {});
  /** The board's name. @default "Q4 launch board" */
  title?: string;
  /** The workspace it belongs to. @default "Fernworks" */
  workspace?: string;
  /** Height of the board viewport under the strip, px. @default 164 */
  viewportHeight?: number;
  /** Listen for V/H/1–9, Cmd or Ctrl with = − 0, Shift+1 and Shift+0 while focus is inside. @default true */
  shortcuts?: boolean;
  /** Board state: loading shows a skeleton, error a retry. @default "ready" */
  status?: ZoomReadoutStatus;
  /** Called by the error state's Retry. */
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultZoomReadoutTools: ZoomReadoutTool[] = [
  { id: "select", label: "Select", icon: MousePointer2, key: "v" },
  { id: "hand", label: "Hand", icon: Hand, key: "h" },
  { id: "frame", label: "Frame", icon: Frame, key: "f" },
  { id: "sticky", label: "Sticky note", icon: StickyNote, key: "s" },
  { id: "shape", label: "Shape", icon: Square, key: "r" },
  { id: "pen", label: "Pen", icon: PenLine, key: "p" },
  { id: "text", label: "Text", icon: Type, key: "t" },
  { id: "comment", label: "Comment", icon: MessageSquare, key: "c" },
];

export const defaultZoomReadoutPresets: number[] = [
  10, 25, 50, 75, 100, 150, 200, 400, 800,
];

export const defaultZoomReadoutItems: ZoomReadoutItem[] = [
  {
    id: "launch",
    kind: "frame",
    x: 0,
    y: 0,
    w: 1000,
    h: 420,
    label: "Launch week",
  },
  {
    id: "pricing",
    kind: "sticky",
    x: 40,
    y: 64,
    w: 200,
    h: 150,
    label: "Pricing page copy",
    note: "Lead with the free tier",
    tone: "amber",
  },
  {
    id: "beta",
    kind: "sticky",
    x: 270,
    y: 64,
    w: 200,
    h: 150,
    label: "Beta invite list",
    note: "312 accepted",
    tone: "mint",
  },
  {
    id: "press",
    kind: "sticky",
    x: 500,
    y: 64,
    w: 200,
    h: 150,
    label: "Press kit",
    note: "Lockups and three shots",
    tone: "sky",
  },
  {
    id: "checklist",
    kind: "sticky",
    x: 730,
    y: 64,
    w: 230,
    h: 150,
    label: "Launch checklist",
    note: "Owner: Ines",
    tone: "rose",
  },
  {
    id: "ship",
    kind: "shape",
    x: 40,
    y: 262,
    w: 300,
    h: 110,
    label: "Ship v1.4",
  },
  {
    id: "gonogo",
    kind: "ellipse",
    x: 400,
    y: 252,
    w: 200,
    h: 130,
    label: "Go / no-go",
  },
  {
    id: "retro-title",
    kind: "text",
    x: 1080,
    y: 24,
    w: 400,
    h: 64,
    label: "Retro notes",
  },
  {
    id: "slowed",
    kind: "sticky",
    x: 1080,
    y: 120,
    w: 190,
    h: 150,
    label: "What slowed us",
    note: "The review queue",
    tone: "amber",
  },
  {
    id: "keep",
    kind: "sticky",
    x: 1290,
    y: 120,
    w: 190,
    h: 150,
    label: "Keep doing",
    note: "The daily demo",
    tone: "mint",
  },
];

const DEFAULT_SELECTION: string[] = ["pricing"];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const r5 = (v: number) => Number(v.toFixed(5));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod10 = (v: number) => ((v % 10) + 10) % 10;

type Box = { x: number; y: number; w: number; h: number };

const boundsOf = (list: ZoomReadoutItem[]): Box | null => {
  if (list.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const item of list) {
    x0 = Math.min(x0, item.x);
    y0 = Math.min(y0, item.y);
    x1 = Math.max(x1, item.x + item.w);
    y1 = Math.max(y1, item.y + item.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

const ACCENTS: Record<ZoomReadoutAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--zr-accent": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as ZoomReadoutAccentName]
      : accent,
    "--zr-wash": "color-mix(in oklab, var(--zr-accent) 14%, transparent)",
    "--zr-soft": "color-mix(in oklab, var(--zr-accent) 36%, transparent)",
    "--zr-dot": "color-mix(in oklab, var(--ink-3) 42%, transparent)",
  }) as React.CSSProperties;

/**
 * Sticky notes are pigment, not text: a fixed lightness taken from the
 * status tokens' hue so a note reads as the same yellow in both themes, with
 * its own dark ink that never inverts.
 */
const TONES: Record<
  Exclude<ZoomReadoutTone, "ink">,
  { paper: string; ink: string }
> = {
  amber: {
    paper: "oklch(from var(--warn) 0.9 0.085 h)",
    ink: "oklch(from var(--warn) 0.33 0.06 h)",
  },
  mint: {
    paper: "oklch(from var(--success) 0.9 0.07 h)",
    ink: "oklch(from var(--success) 0.32 0.06 h)",
  },
  sky: {
    paper: "oklch(from var(--accent-bright) 0.9 0.05 h)",
    ink: "oklch(from var(--accent-bright) 0.32 0.09 h)",
  },
  rose: {
    paper: "oklch(from var(--danger) 0.9 0.05 h)",
    ink: "oklch(from var(--danger) 0.34 0.09 h)",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** One digit face is this many em tall; the strip carries eleven of them. */
const FACE = 1.25;
const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
/** The viewport the server lays out for: the wide card's inner width. */
const SERVER_VIEWPORT_W = 718;
/** Board pixels between grid dots at 100%. */
const GRID = 24;

type RollKind = "snap" | "glide";

/* ----------------------------------------------------------------------- */
/*                                 Odometer                                 */
/* ----------------------------------------------------------------------- */

/**
 * One digit column. Its position is a motion value counted in faces, and
 * the strip shows `position mod 10`, so a wheel can keep turning the same
 * way forever: 9 → 0 going up is one face forward onto the strip's trailing
 * zero, never a spin back through 8…1.
 */
function Wheel({
  digit,
  active,
  dir,
  kind,
  motionSafe,
  tile,
}: {
  digit: number;
  active: boolean;
  dir: number;
  kind: RollKind;
  motionSafe: boolean;
  tile: boolean;
}) {
  const pos = useMotionValue(digit);
  const y = useTransform(pos, (p) => `${-r3(mod10(p) * FACE)}em`);

  React.useEffect(() => {
    // Measured from where the wheel actually is, so an interrupted roll (or
    // StrictMode's rehearsal stopping one) picks up from the face showing.
    const base = mod10(pos.get());
    const gap = mod10(digit - base);
    if (gap < 1e-3 || gap > 10 - 1e-3) return;
    pos.jump(base);
    const target = dir >= 0 ? base + gap : base - (10 - gap);
    if (!motionSafe) {
      pos.jump(target);
      return;
    }
    const controls = animate(
      pos,
      target,
      kind === "glide" ? springs.glide : springs.snap,
    );
    return () => controls.stop();
  }, [digit, dir, kind, motionSafe, pos]);

  return (
    <motion.span
      className={cn(
        "relative inline-block shrink-0 overflow-hidden",
        tile &&
          "rounded-1 bg-surface-2 shadow-[inset_0_0_0_1px_var(--hairline-strong)]",
      )}
      style={{ height: `${FACE}em` }}
      initial={false}
      animate={{
        width: active ? (tile ? "1.45ch" : "1ch") : "0ch",
        marginRight: active && tile ? 2 : 0,
        opacity: active ? 1 : 0,
      }}
      transition={
        motionSafe
          ? kind === "glide"
            ? springs.glide
            : springs.snap
          : { duration: 0 }
      }
    >
      {tile ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 z-10 h-px bg-hairline-strong"
        />
      ) : null}
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y }}
      >
        {FACES.map((face, i) => (
          <span
            key={i}
            className="block text-center"
            style={{ height: `${FACE}em`, lineHeight: `${FACE}em` }}
          >
            {face}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

function Readout({
  value,
  places,
  dir,
  kind,
  motionSafe,
  style,
  level,
}: {
  value: number;
  places: number;
  dir: number;
  kind: RollKind;
  motionSafe: boolean;
  style: ZoomReadoutReadoutStyle;
  level: number;
}) {
  const fill = useMotionValue(level);
  React.useEffect(() => {
    if (Math.abs(fill.get() - level) < 1e-4) return;
    if (!motionSafe) {
      fill.jump(level);
      return;
    }
    const controls = animate(
      fill,
      level,
      kind === "glide" ? springs.glide : springs.snap,
    );
    return () => controls.stop();
  }, [fill, kind, level, motionSafe]);
  const scaleX = useTransform(fill, (v) => r3(Math.max(0, Math.min(1, v))));

  const digits = (
    <span
      aria-hidden
      className="inline-flex items-start tabular-nums"
      style={{ height: `${FACE}em`, lineHeight: `${FACE}em` }}
    >
      {Array.from({ length: places }, (_, i) => places - 1 - i).map((place) => (
        <Wheel
          key={place}
          digit={Math.floor(value / 10 ** place) % 10}
          active={place === 0 || value >= 10 ** place}
          dir={dir}
          kind={kind}
          motionSafe={motionSafe}
          tile={style === "tiles"}
        />
      ))}
      <span className="text-ink-3">%</span>
    </span>
  );

  if (style !== "meter") return digits;
  return (
    <span aria-hidden className="flex flex-col items-center gap-[3px]">
      {digits}
      <span className="relative block h-[2px] w-full overflow-hidden rounded-full bg-hairline-strong">
        <motion.span
          className="absolute inset-0 block origin-left rounded-full bg-[var(--zr-accent)]"
          style={{ scaleX }}
        />
      </span>
    </span>
  );
}

/** The fit icon: four corner brackets that close on a centre dot as `t` goes 0 → 1. */
function FitGlyph({ t, size }: { t: MotionValue<number>; size: number }) {
  const d = useTransform(t, (v) => {
    const i = r2(lerp(1.6, 4.2, v));
    const a = r2(lerp(4.4, 3.2, v));
    const e = r2(16 - i);
    return [
      `M ${i} ${r2(i + a)} V ${i} H ${r2(i + a)}`,
      `M ${r2(e - a)} ${i} H ${e} V ${r2(i + a)}`,
      `M ${e} ${r2(e - a)} V ${e} H ${r2(e - a)}`,
      `M ${r2(i + a)} ${e} H ${i} V ${r2(e - a)}`,
    ].join(" ");
  });
  const r = useTransform(t, (v) => r2(lerp(0.9, 1.7, v)));
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className="shrink-0"
      fill="none"
    >
      <motion.path
        d={d}
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <motion.circle cx={8} cy={8} r={r} fill="currentColor" />
    </svg>
  );
}

/**
 * One corner of the fit brackets, travelling from the viewport's corner to
 * the matching corner of the fitted rectangle as `t` goes 0 → 1. A zero-size
 * anchor carries the position; the visible L hangs off it on the inside.
 */
function Bracket({
  side,
  t,
  vw,
  vh,
  rect,
}: {
  side: "tl" | "tr" | "bl" | "br";
  t: MotionValue<number>;
  vw: MotionValue<number>;
  vh: MotionValue<number>;
  rect: Box | null;
}) {
  const left = side === "tl" || side === "bl";
  const top = side === "tl" || side === "tr";
  const x = useTransform([t, vw] as MotionValue<number>[], ([p, w]) => {
    const W = w as number;
    const to = rect ?? { x: 6, w: W - 12 };
    return r2(lerp(left ? 6 : W - 6, left ? to.x : to.x + to.w, p as number));
  });
  const y = useTransform([t, vh] as MotionValue<number>[], ([p, h]) => {
    const H = h as number;
    const to = rect ?? { y: 6, h: H - 12 };
    return r2(lerp(top ? 6 : H - 6, top ? to.y : to.y + to.h, p as number));
  });
  return (
    <motion.span
      className="absolute top-0 left-0 block size-0"
      style={{ x, y }}
    >
      <span
        className={cn(
          "absolute block size-3.5 border-[var(--zr-accent)]",
          side === "tl" &&
            "top-0 left-0 rounded-tl-[4px] border-t-2 border-l-2",
          side === "tr" &&
            "top-0 right-0 rounded-tr-[4px] border-t-2 border-r-2",
          side === "bl" &&
            "bottom-0 left-0 rounded-bl-[4px] border-b-2 border-l-2",
          side === "br" &&
            "right-0 bottom-0 rounded-br-[4px] border-r-2 border-b-2",
        )}
      />
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Menu                                   */
/* ----------------------------------------------------------------------- */

type MenuEntry = {
  id: string;
  label: string;
  role: "menuitem" | "menuitemradio";
  checked?: boolean;
  disabled?: boolean;
  hint?: string;
  icon?: ZoomReadoutIcon;
  /** Entries in the same `row` sit side by side as compact chips. */
  row?: string;
  onSelect: () => void;
};

function ZrMenu({
  label,
  entries,
  align,
  top,
  maxHeight,
  columns,
  motionSafe,
  onClose,
}: {
  label: string;
  entries: MenuEntry[];
  align: "left" | "right";
  top: number;
  maxHeight: number;
  columns?: number;
  motionSafe: boolean;
  onClose: (refocus: boolean) => void;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const firstIndex = Math.max(
    0,
    entries.findIndex((e) => e.checked && !e.disabled),
  );
  const [active, setActive] = React.useState(firstIndex);
  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());

  // Focus lands on the menu when its node arrives, not on a guessed frame.
  React.useEffect(() => {
    if (!node) return;
    const entry = entries[firstIndex];
    if (entry) refs.current.get(entry.id)?.focus();
    // Only on arrival: later renders keep wherever focus has moved to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);

  React.useEffect(() => {
    if (!node) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && node.contains(target)) return;
      const trigger = (target as Element | null)?.closest?.(
        "[data-zr-trigger]",
      );
      if (trigger) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [node, onClose]);

  const move = (to: number) => {
    const n = entries.length;
    if (n === 0) return;
    const index = ((to % n) + n) % n;
    setActive(index);
    const entry = entries[index];
    if (entry) refs.current.get(entry.id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // The menu owns its keys: none of them reach the board's shortcuts.
    event.stopPropagation();
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        move(active + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        move(active - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(entries.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        onClose(true);
        break;
      case "Tab":
        onClose(false);
        break;
      default:
        break;
    }
  };

  const rows: { key: string; list: { entry: MenuEntry; index: number }[] }[] =
    [];
  entries.forEach((entry, index) => {
    const key = entry.row ?? `solo-${entry.id}`;
    const last = rows[rows.length - 1];
    if (last && entry.row && last.key === key) last.list.push({ entry, index });
    else rows.push({ key, list: [{ entry, index }] });
  });

  return (
    <motion.div
      ref={setNode}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      initial={
        motionSafe
          ? { opacity: 0, y: -distances.nudge, scale: 0.98 }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        motionSafe
          ? { opacity: 0, y: -distances.nudge, transition: exitFor() }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={motionSafe ? springs.snap : { duration: durations.fast }}
      className={cn(
        "absolute z-20 flex [scrollbar-width:thin] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-popover p-1 text-popover-foreground shadow-lg",
        align === "right"
          ? "right-2 origin-top-right"
          : "left-2 origin-top-left",
      )}
      style={{ top, maxHeight }}
    >
      {rows.map((row, ri) => {
        const isRow = row.list.length > 1;
        const prev = rows[ri - 1];
        const divider = ri > 0 && (isRow || (prev && prev.list.length > 1));
        return (
          <React.Fragment key={row.key}>
            {divider ? (
              <div role="separator" className="mx-1 my-0.5 h-px bg-hairline" />
            ) : null}
            <div
              role={isRow ? "group" : undefined}
              aria-label={isRow ? "Presets" : undefined}
              className={cn(isRow ? "grid gap-0.5" : "contents")}
              style={
                isRow
                  ? {
                      gridTemplateColumns: `repeat(${columns ?? 5}, minmax(0, 1fr))`,
                    }
                  : undefined
              }
            >
              {row.list.map(({ entry, index }) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.id}
                    ref={(el) => {
                      refs.current.set(entry.id, el);
                    }}
                    type="button"
                    role={entry.role}
                    aria-checked={
                      entry.role === "menuitemradio"
                        ? !!entry.checked
                        : undefined
                    }
                    aria-disabled={entry.disabled || undefined}
                    tabIndex={index === active ? 0 : -1}
                    onFocus={() => setActive(index)}
                    onClick={() => {
                      if (entry.disabled) return;
                      entry.onSelect();
                      onClose(true);
                    }}
                    className={cn(
                      "flex h-7 shrink-0 items-center gap-2 rounded-2 text-[12px] whitespace-nowrap transition-colors",
                      FOCUS,
                      isRow
                        ? "justify-center px-1.5 font-mono tabular-nums"
                        : "px-2",
                      entry.disabled
                        ? "cursor-not-allowed text-ink-3"
                        : "text-foreground hover:bg-surface-2",
                      entry.checked &&
                        "bg-[var(--zr-wash)] text-[var(--zr-accent)]",
                    )}
                  >
                    {Icon ? (
                      <span aria-hidden className="inline-flex shrink-0">
                        <Icon className="size-3.5" />
                      </span>
                    ) : null}
                    <span className={cn(!isRow && "flex-1 text-left")}>
                      {entry.label}
                    </span>
                    {entry.hint ? (
                      <kbd
                        aria-hidden
                        className="font-mono text-[10px] text-ink-3"
                      >
                        {entry.hint}
                      </kbd>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </React.Fragment>
        );
      })}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * The strip along the top of a whiteboard — the board's name, its tools and
 * its zoom — over the board itself. The active tool sits on a marker that
 * slides from tool to tool on snap. The zoom readout is an odometer: every
 * digit is its own wheel, and a step (the − and + buttons, Cmd or Ctrl with
 * = and −, a preset) turns only the wheels whose digit changed, the short way
 * in the direction the zoom moved, on snap — a sliver of the next face
 * shows in the overshoot before the digit seats. Fit to selection turns the
 * same wheels on glide, in the same frame as the fit icon's brackets close
 * on its centre and four brackets on the board converge onto the rectangle
 * the selection is gliding into.
 *
 * The camera is three motion values: steps scale about the viewport centre on
 * snap, a trackpad pinch (Ctrl or Cmd + wheel) follows the fingers 1:1 about
 * the pointer, and the hand tool drags the board 1:1 and coasts to its
 * projected rest on glide with the release velocity. Under reduced motion the
 * digits swap, the camera jumps and the brackets fade in place; the numbers,
 * the selection and the tool still change, because they are the information.
 */
export function ZoomReadout({
  ref,
  tools = defaultZoomReadoutTools,
  tool,
  defaultTool = "select",
  onToolChange,
  zoom,
  defaultZoom = 50,
  onZoomChange,
  minZoom = 10,
  maxZoom = 800,
  presets = defaultZoomReadoutPresets,
  items = defaultZoomReadoutItems,
  selection,
  defaultSelection = DEFAULT_SELECTION,
  onSelectionChange,
  onFit,
  fitPadding = 20,
  toolSize = 32,
  readoutStyle = "roll",
  accent = "cobalt",
  title = "Q4 launch board",
  workspace = "Fernworks",
  viewportHeight = 164,
  shortcuts = true,
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: ZoomReadoutProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const lo = Math.max(1, Math.min(minZoom, maxZoom));
  const hi = Math.max(lo, maxZoom);
  const clampZoom = React.useCallback(
    (z: number) => Math.round(Math.min(hi, Math.max(lo, z))),
    [hi, lo],
  );
  const stops = React.useMemo(
    () =>
      [...new Set(presets.map((p) => Math.round(p)))]
        .filter((p) => p >= lo && p <= hi)
        .sort((a, b) => a - b),
    [hi, lo, presets],
  );
  const places = Math.max(1, String(hi).length);
  const size = Math.round(Math.min(48, Math.max(24, toolSize)));
  const iconSize = Math.round(size * 0.5);
  const barHeight = size + 12;

  /* ---------------------------- state ---------------------------------- */

  const [ownTool, setOwnTool] = React.useState(defaultTool);
  const activeTool = tool ?? ownTool;
  const active = tools.find((t) => t.id === activeTool) ?? tools[0];

  const [ownZoom, setOwnZoom] = React.useState(() => clampZoom(defaultZoom));
  const shownZoom = clampZoom(zoom ?? ownZoom);

  const [ownSelection, setOwnSelection] = React.useState(defaultSelection);
  const sel = selection ?? ownSelection;
  const selected = React.useMemo(
    () => items.filter((item) => sel.includes(item.id)),
    [items, sel],
  );

  const [roll, setRoll] = React.useState<RollKind>("snap");
  const [trail, setTrail] = React.useState({ zoom: shownZoom, dir: 1 });
  if (trail.zoom !== shownZoom) {
    setTrail({ zoom: shownZoom, dir: shownZoom > trail.zoom ? 1 : -1 });
  }

  const [fitted, setFitted] = React.useState<"selection" | "all" | null>(null);
  const [fitPulse, setFitPulse] = React.useState(0);
  const [fitRect, setFitRect] = React.useState<Box | null>(null);
  const [menu, setMenu] = React.useState<"zoom" | "tools" | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [toolFocus, setToolFocus] = React.useState(() =>
    Math.max(
      0,
      tools.findIndex((t) => t.id === activeTool),
    ),
  );
  const [itemFocus, setItemFocus] = React.useState<string | null>(null);
  const [panning, setPanning] = React.useState(false);

  /* ---------------------------- camera --------------------------------- */

  const board = React.useMemo(() => boundsOf(items), [items]);
  const [startCam] = React.useState(() => {
    const b = boundsOf(items);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 };
  });
  const camX = useMotionValue(startCam.x);
  const camY = useMotionValue(startCam.y);
  const scale = useMotionValue(shownZoom / 100);
  const vw = useMotionValue(SERVER_VIEWPORT_W);
  const vh = useMotionValue(viewportHeight);
  React.useEffect(() => {
    vh.set(viewportHeight);
  }, [vh, viewportHeight]);

  const tx = useTransform(
    [camX, scale, vw] as MotionValue<number>[],
    ([c, s, w]) => r2((w as number) / 2 - (c as number) * (s as number)),
  );
  const ty = useTransform(
    [camY, scale, vh] as MotionValue<number>[],
    ([c, s, h]) => r2((h as number) / 2 - (c as number) * (s as number)),
  );
  const roundedScale = useTransform(scale, (s) => r5(s));
  const inverse = useTransform(scale, (s) => r3(1 / Math.max(0.01, s)));
  // The paper zooms with the board: dot spacing follows the scale, coarsening
  // by fours when the dots would crowd into a grey wash.
  const gridSize = useTransform(scale, (s) => {
    let step = GRID * s;
    while (step < 10) step *= 4;
    return `${r2(step)}px ${r2(step)}px`;
  });
  const gridPos = useTransform(
    [tx, ty, scale] as MotionValue<number>[],
    ([x, y, s]) => {
      let step = GRID * (s as number);
      while (step < 10) step *= 4;
      const wrap = (v: number) => r2(((v % step) + step) % step);
      return `${wrap(x as number)}px ${wrap(y as number)}px`;
    },
  );

  const selBox = React.useMemo(() => boundsOf(selected), [selected]);
  const selX = useTransform([tx, scale] as MotionValue<number>[], ([x, s]) =>
    selBox ? r2((x as number) + selBox.x * (s as number)) : 0,
  );
  const selY = useTransform([ty, scale] as MotionValue<number>[], ([y, s]) =>
    selBox ? r2((y as number) + selBox.y * (s as number)) : 0,
  );
  const selW = useTransform(scale, (s) => (selBox ? r2(selBox.w * s) : 0));
  const selH = useTransform(scale, (s) => (selBox ? r2(selBox.h * s) : 0));

  // The fit brackets: four corners travelling from the viewport's corners to
  // the rectangle the fitted selection will occupy, all on one 0 → 1 value.
  const bracket = useMotionValue(0);
  const bracketOpacity = useMotionValue(0);
  const iconT = useMotionValue(0);
  React.useEffect(() => {
    const target = fitted === "selection" ? 1 : 0;
    if (!motionSafe) {
      const c = animate(iconT, target, { duration: durations.fast });
      return () => c.stop();
    }
    const c = animate(iconT, target, target ? springs.glide : springs.snap);
    return () => c.stop();
  }, [fitted, iconT, motionSafe]);

  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);
  React.useEffect(() => halt, [halt]);

  const flyTo = React.useCallback(
    (z: number, cam: { x: number; y: number } | null, kind: RollKind) => {
      halt();
      const s = z / 100;
      if (!motionSafe) {
        scale.jump(s);
        if (cam) {
          camX.jump(cam.x);
          camY.jump(cam.y);
        }
        return;
      }
      const spring = kind === "glide" ? springs.glide : springs.snap;
      running.current = [
        animate(scale, s, spring),
        ...(cam
          ? [animate(camX, cam.x, spring), animate(camY, cam.y, spring)]
          : []),
      ];
    },
    [camX, camY, halt, motionSafe, scale],
  );

  /**
   * Where the camera is heading. A change of zoom is asked for here and
   * flown by the effect below once the zoom (own or the host's) says so —
   * a host that refuses a zoom never sees the board fly to it anyway.
   */
  const aimed = React.useRef(shownZoom);
  const intent = React.useRef<{
    zoom: number;
    cam: { x: number; y: number } | null;
    kind: RollKind;
  } | null>(null);
  React.useEffect(() => {
    if (aimed.current === shownZoom) return;
    aimed.current = shownZoom;
    const plan = intent.current;
    intent.current = null;
    if (plan && plan.zoom === shownZoom) flyTo(shownZoom, plan.cam, plan.kind);
    else flyTo(shownZoom, null, "snap");
  }, [flyTo, shownZoom]);

  // The bracket pulse starts in the same commit as the camera and the wheels.
  React.useEffect(() => {
    if (fitPulse === 0) return;
    bracket.jump(0);
    let fade: AnimationPlaybackControls | undefined;
    if (!motionSafe) {
      bracket.jump(1);
      bracketOpacity.jump(1);
      const timer = window.setTimeout(() => {
        fade = animate(bracketOpacity, 0, { duration: durations.base });
      }, 400);
      return () => {
        window.clearTimeout(timer);
        fade?.stop();
        bracketOpacity.jump(0);
      };
    }
    const travel = animate(bracket, 1, springs.glide);
    const show = animate(bracketOpacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
    const timer = window.setTimeout(() => {
      fade = animate(bracketOpacity, 0, exitFor(durations.slow));
    }, 560);
    return () => {
      travel.stop();
      show.stop();
      fade?.stop();
      window.clearTimeout(timer);
      // Finish rather than freeze: an interrupted pulse leaves no brackets.
      bracketOpacity.jump(0);
    };
  }, [bracket, bracketOpacity, fitPulse, motionSafe]);

  /* --------------------------- actions --------------------------------- */

  const say = (text: string) => setAnnouncement(text);

  const setSelection = (ids: string[]) => {
    if (selection === undefined) setOwnSelection(ids);
    if (fitted === "selection") setFitted(null);
    onSelectionChange?.(ids);
  };

  const requestZoom = (
    z: number,
    cam: { x: number; y: number } | null,
    kind: RollKind,
  ) => {
    const next = clampZoom(z);
    setRoll(kind);
    if (next === shownZoom) {
      // Nothing for the readout to do; the camera may still need to move.
      aimed.current = next;
      flyTo(next, cam, kind);
      return next;
    }
    intent.current = { zoom: next, cam, kind };
    if (zoom === undefined) setOwnZoom(next);
    onZoomChange?.(next);
    return next;
  };

  const zoomTo = (z: number) => {
    if (disabled) return;
    const next = requestZoom(z, null, "snap");
    setFitted(null);
    say(`Zoom ${next}%.`);
  };

  const step = (direction: 1 | -1) => {
    if (disabled) return;
    const next =
      direction > 0
        ? (stops.find((p) => p > shownZoom) ?? hi)
        : ([...stops].reverse().find((p) => p < shownZoom) ?? lo);
    if (next === shownZoom) {
      say(
        `Zoom is at the ${direction > 0 ? "highest" : "lowest"} setting, ${shownZoom}%.`,
      );
      return;
    }
    zoomTo(next);
  };

  const fit = (target: "selection" | "all") => {
    if (disabled || status !== "ready") return;
    const list = target === "selection" ? selected : items;
    const b = boundsOf(list);
    if (!b) {
      say(
        target === "selection"
          ? "Select something on the board to fit it."
          : "The board is empty.",
      );
      return;
    }
    const W = vw.get();
    const H = vh.get();
    const pad = Math.max(0, fitPadding);
    const z = clampZoom(
      Math.floor(
        Math.min(
          (W - pad * 2) / Math.max(1, b.w),
          (H - pad * 2) / Math.max(1, b.h),
        ) * 100,
      ),
    );
    const s = z / 100;
    setFitRect({
      x: r2(W / 2 - (b.w * s) / 2),
      y: r2(H / 2 - (b.h * s) / 2),
      w: r2(b.w * s),
      h: r2(b.h * s),
    });
    setFitPulse((n) => n + 1);
    setFitted(target);
    requestZoom(z, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, "glide");
    onFit?.({ target, zoom: z, ids: list.map((item) => item.id) });
    say(
      `Fitted ${
        target === "selection"
          ? list.length === 1
            ? (list[0]?.label ?? "the selection")
            : `${list.length} items`
          : "the whole board"
      } at ${z}%.`,
    );
  };

  const pickTool = (id: string) => {
    if (disabled) return;
    const next = tools.find((t) => t.id === id);
    if (!next) return;
    const index = tools.indexOf(next);
    setToolFocus(index);
    if (id !== activeTool) {
      if (tool === undefined) setOwnTool(id);
      onToolChange?.(id);
    }
    say(`${next.label} tool.`);
  };

  // The handle and the native wheel listener read the latest closures.
  const latest = React.useRef({ fit, zoomTo, shownZoom });
  React.useEffect(() => {
    latest.current = { fit, zoomTo, shownZoom };
  });
  React.useImperativeHandle(
    ref,
    () => ({
      fit: (target = "selection") => latest.current.fit(target),
      zoomTo: (z: number) => latest.current.zoomTo(z),
    }),
    [],
  );

  /* ------------------------- viewport input ---------------------------- */

  const [viewport, setViewport] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) vw.set(Math.round(entry.contentRect.width));
    });
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [viewport, vw]);

  const pinch = React.useRef({
    disabled,
    controlled: zoom !== undefined,
    onZoomChange,
  });
  React.useEffect(() => {
    pinch.current = { disabled, controlled: zoom !== undefined, onZoomChange };
  });

  // A trackpad pinch arrives as Ctrl + wheel. It is followed 1:1 about the
  // pointer — no spring between the fingers and the board — and only the
  // whole-percent reading goes to state, so the wheels roll per percent.
  React.useEffect(() => {
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || pinch.current.disabled) return;
      event.preventDefault();
      halt();
      const rect = viewport.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const s0 = scale.get();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const raw = s0 * 100 * Math.exp(-event.deltaY * unit * 0.008);
      const z = Math.min(hi, Math.max(lo, raw));
      const s1 = z / 100;
      const W = vw.get();
      const H = vh.get();
      const wx = camX.get() + (px - W / 2) / s0;
      const wy = camY.get() + (py - H / 2) / s0;
      scale.jump(r5(s1));
      camX.jump(r2(wx - (px - W / 2) / s1));
      camY.jump(r2(wy - (py - H / 2) / s1));
      const whole = Math.round(z);
      aimed.current = whole;
      setFitted(null);
      setRoll("snap");
      if (whole !== latest.current.shownZoom) {
        if (!pinch.current.controlled) setOwnZoom(whole);
        pinch.current.onZoomChange?.(whole);
        setAnnouncement(`Zoom ${whole}%.`);
      }
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [camX, camY, halt, hi, lo, scale, viewport, vh, vw]);

  const panFrom = React.useRef({ x: 0, y: 0 });
  const isHand = active?.id === "hand";
  const drag = useDrag({
    threshold: 4,
    disabled: disabled || status !== "ready",
    onStart: () => {
      halt();
      panFrom.current = { x: camX.get(), y: camY.get() };
      setPanning(true);
      setFitted(null);
    },
    onMove: ({ offset }) => {
      const s = scale.get();
      const W = vw.get() / s;
      const H = vh.get() / s;
      const x = panFrom.current.x - offset.x / s;
      const y = panFrom.current.y - offset.y / s;
      camX.set(r2(board ? rubberClamp(x, board.x, board.x + board.w, W) : x));
      camY.set(r2(board ? rubberClamp(y, board.y, board.y + board.h, H) : y));
    },
    onEnd: ({ velocity }) => {
      setPanning(false);
      const s = scale.get();
      const vx = -velocity.x / s;
      const vy = -velocity.y / s;
      const clampTo = (v: number, a: number, b: number) =>
        Math.min(b, Math.max(a, v));
      const restX = board
        ? clampTo(
            project(camX.get(), motionSafe ? vx : 0, 0.995),
            board.x,
            board.x + board.w,
          )
        : camX.get();
      const restY = board
        ? clampTo(
            project(camY.get(), motionSafe ? vy : 0, 0.995),
            board.y,
            board.y + board.h,
          )
        : camY.get();
      if (!motionSafe) {
        camX.jump(restX);
        camY.jump(restY);
        return;
      }
      running.current = [
        animate(camX, restX, { ...springs.glide, velocity: vx }),
        animate(camY, restY, { ...springs.glide, velocity: vy }),
      ];
    },
    onCancel: () => setPanning(false),
    onTap: (event) => {
      if ((event.target as Element).closest("[data-zr-item]")) return;
      if (active?.id === "select" && sel.length > 0) {
        setSelection([]);
        say("Selection cleared.");
      }
    },
  });

  const reveal = (item: ZoomReadoutItem) => {
    const s = scale.get();
    const W = vw.get();
    const H = vh.get();
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    const sx = W / 2 + (cx - camX.get()) * s;
    const sy = H / 2 + (cy - camY.get()) * s;
    if (sx > 0 && sx < W && sy > 0 && sy < H) return;
    halt();
    setFitted(null);
    if (!motionSafe) {
      camX.jump(cx);
      camY.jump(cy);
      return;
    }
    running.current = [
      animate(camX, cx, springs.glide),
      animate(camY, cy, springs.glide),
    ];
  };

  const pickItem = (item: ZoomReadoutItem, add: boolean) => {
    if (disabled) return;
    const on = sel.includes(item.id);
    const next = add
      ? on
        ? sel.filter((id) => id !== item.id)
        : [...sel, item.id]
      : [item.id];
    setSelection(next);
    say(
      next.length === 0
        ? "Selection cleared."
        : next.length === 1
          ? `${item.label} selected.`
          : `${next.length} items selected.`,
    );
  };

  const itemRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const focusItemAt = (index: number) => {
    const n = items.length;
    if (n === 0) return;
    const target = items[((index % n) + n) % n];
    if (!target) return;
    setItemFocus(target.id);
    itemRefs.current.get(target.id)?.focus();
  };

  const onItemKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    item: ZoomReadoutItem,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusItemAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusItemAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItemAt(0);
        break;
      case "End":
        event.preventDefault();
        focusItemAt(items.length - 1);
        break;
      case " ":
        // Shift+Space adds to the selection; a plain press arrives as the
        // button's own click, so assistive technology gets the same path.
        if (event.shiftKey) {
          event.preventDefault();
          pickItem(item, true);
        }
        break;
      default:
        break;
    }
  };

  /* ---------------------------- keyboard ------------------------------- */

  const onToolbarKey = (event: React.KeyboardEvent) => {
    const n = tools.length;
    if (n === 0) return;
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      to = toolFocus + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      to = toolFocus - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to === -1) return;
    event.preventDefault();
    const index = ((to % n) + n) % n;
    setToolFocus(index);
    const t = tools[index];
    if (t)
      (event.currentTarget as HTMLElement)
        .querySelector<HTMLElement>(`[data-zr-tool="${CSS.escape(t.id)}"]`)
        ?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!shortcuts || disabled || menu) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']"))
      return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.altKey) {
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        step(1);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "0") {
        event.preventDefault();
        zoomTo(100);
      }
      return;
    }
    if (event.altKey || mod) return;
    if (event.shiftKey && event.code === "Digit1") {
      event.preventDefault();
      fit("selection");
      return;
    }
    if (event.shiftKey && event.code === "Digit0") {
      event.preventDefault();
      fit("all");
      return;
    }
    if (event.shiftKey) return;
    if (event.key === "Escape") {
      if (sel.length > 0) {
        event.preventDefault();
        setSelection([]);
        say("Selection cleared.");
      }
      return;
    }
    const digit = /^Digit([1-9])$/.exec(event.code);
    if (digit) {
      const t = tools[Number(digit[1]) - 1];
      if (t) {
        event.preventDefault();
        pickTool(t.id);
      }
      return;
    }
    const letter = event.key.length === 1 ? event.key.toLowerCase() : "";
    const t = letter
      ? tools.find((x) => x.key?.toLowerCase() === letter)
      : undefined;
    if (t) {
      event.preventDefault();
      pickTool(t.id);
    }
  };

  /* ----------------------------- menus --------------------------------- */

  const zoomButton = React.useRef<HTMLButtonElement | null>(null);
  const toolsButton = React.useRef<HTMLButtonElement | null>(null);
  const openMenu = React.useRef(menu);
  React.useEffect(() => {
    openMenu.current = menu;
  });
  const closeMenu = React.useCallback((refocus: boolean) => {
    const node =
      openMenu.current === "zoom" ? zoomButton.current : toolsButton.current;
    setMenu(null);
    // A previous opening's node can be gone; never focus a dead target.
    if (refocus && node?.isConnected) node.focus();
  }, []);

  const canFitSelection = status === "ready" && selected.length > 0;
  const zoomEntries: MenuEntry[] = [
    {
      id: "actual",
      label: "Zoom to 100%",
      role: "menuitem",
      hint: "⌘0",
      onSelect: () => zoomTo(100),
    },
    {
      id: "fit-selection",
      label: "Fit selection",
      role: "menuitem",
      hint: "⇧1",
      disabled: !canFitSelection,
      onSelect: () => fit("selection"),
    },
    {
      id: "fit-all",
      label: "Fit all",
      role: "menuitem",
      hint: "⇧0",
      disabled: status !== "ready" || items.length === 0,
      onSelect: () => fit("all"),
    },
    ...stops.map((p): MenuEntry => ({
      id: `preset-${p}`,
      label: `${p}%`,
      role: "menuitemradio",
      checked: p === shownZoom,
      row: "presets",
      onSelect: () => zoomTo(p),
    })),
  ];
  const toolEntries: MenuEntry[] = tools.map((t, i) => ({
    id: `tool-${t.id}`,
    label: t.label,
    role: "menuitemradio",
    checked: t.id === activeTool,
    icon: t.icon,
    hint: t.key ? t.key.toUpperCase() : String(i + 1),
    onSelect: () => pickTool(t.id),
  }));

  /* ----------------------------- render -------------------------------- */

  const name = `${workspace} · ${title}`;
  const ActiveIcon = active?.icon;
  const dip = motionSafe && !disabled ? { scale: 0.92 } : undefined;
  const levelOf = (z: number) =>
    hi === lo ? 1 : r3(Math.log(z / lo) / Math.log(hi / lo));
  const readoutWidth =
    readoutStyle === "tiles"
      ? `calc(${places * 1.45 + 1}ch + ${places * 2 + 14}px)`
      : `calc(${places + 1}ch + 14px)`;
  const cursor = isHand
    ? panning
      ? "cursor-grabbing"
      : "cursor-grab"
    : active?.id === "select"
      ? "cursor-default"
      : "cursor-crosshair";
  const fitName = canFitSelection
    ? `Fit selection${selected.length > 1 ? `, ${selected.length} items` : ""}`
    : "Fit selection, nothing selected";

  const iconButton = cn(
    "relative inline-flex shrink-0 items-center justify-center rounded-2 transition-colors",
    FOCUS,
    "disabled:cursor-not-allowed disabled:opacity-50",
  );

  return (
    <section
      aria-label={name}
      onKeyDown={onKeyDown}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={accentVars(accent)}
    >
      {/* ------------------------------ strip ------------------------------ */}
      <div
        className="relative z-10 flex shrink-0 items-center gap-1 border-b border-hairline bg-card px-1.5"
        style={{ height: barHeight }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 pl-0.5 @max-[40rem]:hidden">
          <span
            aria-hidden
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-2 bg-[var(--zr-wash)] font-mono text-[11px] font-semibold text-[var(--zr-accent)]"
          >
            {workspace.charAt(0).toUpperCase()}
          </span>
          <p
            className="min-w-0 truncate text-[13px] leading-tight"
            title={`${workspace} / ${title}`}
          >
            <span className="text-ink-3">{`${workspace} / `}</span>
            <span className="font-medium">{title}</span>
          </p>
        </div>

        <div
          role="toolbar"
          aria-label="Tools"
          onKeyDown={onToolbarKey}
          className="flex shrink-0 items-center gap-0.5 @max-[36rem]:hidden"
        >
          {tools.map((t, i) => {
            const on = t.id === activeTool;
            const Icon = t.icon;
            const keys = [t.key?.toUpperCase(), i < 9 ? String(i + 1) : null]
              .filter(Boolean)
              .join(" ");
            return (
              <motion.button
                key={t.id}
                data-zr-tool={t.id}
                type="button"
                aria-pressed={on}
                aria-label={t.label}
                aria-keyshortcuts={keys || undefined}
                title={`${t.label}${t.key ? ` · ${t.key.toUpperCase()}` : ""}`}
                tabIndex={i === toolFocus ? 0 : -1}
                disabled={disabled}
                onFocus={() => setToolFocus(i)}
                onClick={() => pickTool(t.id)}
                whileTap={dip}
                transition={springs.flick}
                className={cn(
                  iconButton,
                  on
                    ? "text-[var(--zr-accent)]"
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                )}
                style={{ width: size, height: size }}
              >
                {on ? (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-tool`}
                    className="absolute inset-0 rounded-2 bg-[var(--zr-wash)] shadow-[inset_0_0_0_1px_var(--zr-soft)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span aria-hidden className="relative inline-flex">
                  <Icon style={{ width: iconSize, height: iconSize }} />
                </span>
              </motion.button>
            );
          })}
        </div>

        <button
          ref={toolsButton}
          type="button"
          data-zr-trigger=""
          aria-haspopup="menu"
          aria-expanded={menu === "tools"}
          aria-label={`${active?.label ?? "Tool"} tool, change tool`}
          disabled={disabled}
          onClick={() => setMenu((m) => (m === "tools" ? null : "tools"))}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setMenu("tools");
            }
          }}
          className={cn(
            iconButton,
            "gap-0.5 bg-[var(--zr-wash)] pr-1 pl-1.5 text-[var(--zr-accent)] @[36rem]:hidden",
          )}
          style={{ height: size }}
        >
          {ActiveIcon ? (
            <span aria-hidden className="inline-flex">
              <ActiveIcon style={{ width: iconSize, height: iconSize }} />
            </span>
          ) : null}
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-70" />
        </button>

        <span
          aria-hidden
          className="mx-1 h-5 w-px shrink-0 bg-hairline @max-[36rem]:hidden"
        />
        <span aria-hidden className="flex-1 @[40rem]:hidden" />

        <div
          role="group"
          aria-label="Zoom"
          className="flex shrink-0 items-center gap-0.5"
        >
          <motion.button
            type="button"
            aria-label="Zoom out"
            aria-keyshortcuts="Control+- Meta+-"
            title="Zoom out · ⌘−"
            disabled={disabled}
            onClick={() => step(-1)}
            whileTap={dip}
            transition={springs.flick}
            className={cn(
              iconButton,
              "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
            style={{ width: size, height: size }}
          >
            <MinusGlyph size={iconSize} />
          </motion.button>
          <button
            ref={zoomButton}
            type="button"
            data-zr-trigger=""
            aria-haspopup="menu"
            aria-expanded={menu === "zoom"}
            aria-label={`Zoom ${shownZoom}%, zoom options`}
            disabled={disabled}
            onClick={() => setMenu((m) => (m === "zoom" ? null : "zoom"))}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setMenu("zoom");
              }
            }}
            className={cn(
              iconButton,
              "font-mono text-foreground hover:bg-surface-2",
              menu === "zoom" && "bg-surface-2",
            )}
            style={{
              height: size,
              width: readoutWidth,
              fontSize: Math.min(14, Math.max(11, Math.round(size * 0.72) / 2)),
            }}
          >
            <Readout
              value={shownZoom}
              places={places}
              dir={trail.dir}
              kind={roll}
              motionSafe={motionSafe}
              style={readoutStyle}
              level={levelOf(shownZoom)}
            />
          </button>
          <motion.button
            type="button"
            aria-label="Zoom in"
            aria-keyshortcuts="Control+= Meta+="
            title="Zoom in · ⌘="
            disabled={disabled}
            onClick={() => step(1)}
            whileTap={dip}
            transition={springs.flick}
            className={cn(
              iconButton,
              "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
            style={{ width: size, height: size }}
          >
            <PlusGlyph size={iconSize} />
          </motion.button>
          <motion.button
            type="button"
            aria-label={fitName}
            aria-disabled={!canFitSelection || undefined}
            aria-keyshortcuts="Shift+1"
            title={
              canFitSelection
                ? "Fit selection · ⇧1"
                : "Select something to fit it"
            }
            disabled={disabled}
            onClick={() => fit("selection")}
            whileTap={canFitSelection ? dip : undefined}
            transition={springs.flick}
            className={cn(
              iconButton,
              canFitSelection
                ? fitted === "selection"
                  ? "text-[var(--zr-accent)] hover:bg-surface-2"
                  : "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-not-allowed text-ink-3 opacity-60",
            )}
            style={{ width: size, height: size }}
          >
            <FitGlyph t={iconT} size={iconSize} />
          </motion.button>
        </div>
      </div>

      {/* ----------------------------- board ------------------------------- */}
      <div
        ref={setViewport}
        {...drag}
        className={cn(
          "relative shrink-0 overflow-hidden bg-background select-none",
          isHand ? "touch-none" : "touch-pan-y",
          cursor,
        )}
        style={{ height: viewportHeight }}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--zr-dot) 1px, transparent 1.4px)",
            backgroundSize: gridSize,
            backgroundPosition: gridPos,
          }}
        />

        {status === "ready" && items.length > 0 ? (
          <motion.div
            role="group"
            aria-label={`Board, ${items.length} items`}
            className="absolute top-0 left-0"
            style={
              {
                x: tx,
                y: ty,
                scale: roundedScale,
                originX: 0,
                originY: 0,
                width: board ? board.x + board.w : 0,
                height: board ? board.y + board.h : 0,
                "--zr-inv": inverse,
              } as React.ComponentProps<typeof motion.div>["style"]
            }
          >
            {items.map((item, index) => {
              const on = sel.includes(item.id);
              const tone =
                item.tone && item.tone !== "ink" ? TONES[item.tone] : null;
              const focusable = (itemFocus ?? items[0]?.id) === item.id;
              return (
                <button
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current.set(item.id, el);
                  }}
                  type="button"
                  data-zr-item=""
                  aria-pressed={on}
                  aria-label={`${item.label}${item.note ? `, ${item.note}` : ""}`}
                  tabIndex={focusable ? 0 : -1}
                  disabled={disabled}
                  onFocus={(event) => {
                    setItemFocus(item.id);
                    if (event.currentTarget.matches(":focus-visible"))
                      reveal(item);
                  }}
                  onClick={(event) =>
                    pickItem(item, event.shiftKey || event.metaKey)
                  }
                  onKeyDown={(event) => onItemKey(event, item, index)}
                  className={cn(
                    "absolute overflow-hidden text-left",
                    "outline-none focus-visible:[outline-width:calc(2px*var(--zr-inv))] focus-visible:[outline-offset:calc(3px*var(--zr-inv))] focus-visible:outline-ring focus-visible:outline-solid",
                    isHand && "pointer-events-none",
                    item.kind === "frame" &&
                      "flex flex-col items-start justify-start rounded-[10px] border-2 border-dashed border-hairline-strong bg-transparent p-4",
                    item.kind === "sticky" &&
                      "flex flex-col gap-2 rounded-[6px] p-4 shadow-[0_3px_0_color-mix(in_oklab,black_14%,transparent)]",
                    item.kind === "shape" &&
                      "flex items-center justify-center rounded-[14px] border-2 border-hairline-strong bg-surface-1 text-center",
                    item.kind === "ellipse" &&
                      "flex items-center justify-center rounded-full border-2 border-hairline-strong bg-surface-1 text-center",
                    item.kind === "text" && "bg-transparent",
                  )}
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.w,
                    height: item.h,
                    ...(tone
                      ? { backgroundColor: tone.paper, color: tone.ink }
                      : null),
                  }}
                >
                  {item.kind === "frame" ? (
                    <span className="block text-[18px] font-medium text-ink-3">
                      {item.label}
                    </span>
                  ) : item.kind === "text" ? (
                    <span className="block text-[40px] leading-none font-semibold tracking-tight">
                      {item.label}
                    </span>
                  ) : item.kind === "sticky" ? (
                    <>
                      <span className="block text-[20px] leading-tight font-semibold">
                        {item.label}
                      </span>
                      {item.note ? (
                        <span className="block text-[15px] leading-snug opacity-80">
                          {item.note}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="block text-[22px] font-semibold">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </motion.div>
        ) : null}

        {/* Selection, drawn in screen space so its line is 1.5 px at any zoom. */}
        {status === "ready" && selBox ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 rounded-[3px] shadow-[0_0_0_1.5px_var(--zr-accent)]"
            style={{ x: selX, y: selY, width: selW, height: selH }}
          >
            {(
              [
                "-top-[3px] -left-[3px]",
                "-top-[3px] -right-[3px]",
                "-bottom-[3px] -left-[3px]",
                "-bottom-[3px] -right-[3px]",
              ] as const
            ).map((spot) => (
              <span
                key={spot}
                className={cn(
                  "absolute size-[6px] rounded-[1.5px] border-[1.5px] border-[var(--zr-accent)] bg-card",
                  spot,
                )}
              />
            ))}
          </motion.div>
        ) : null}

        {/* The fit brackets: on the same glide as the readout and the icon. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ opacity: bracketOpacity }}
        >
          {(["tl", "tr", "bl", "br"] as const).map((side) => (
            <Bracket
              key={side}
              side={side}
              t={bracket}
              vw={vw}
              vh={vh}
              rect={fitRect}
            />
          ))}
        </motion.div>

        {status === "loading" ? (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center gap-3 p-6"
          >
            {[0.9, 0.7, 0.9].map((o, i) => (
              <span
                key={i}
                className="h-16 flex-1 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ opacity: o, maxWidth: 120 }}
              />
            ))}
          </div>
        ) : null}
        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-[13px] text-foreground">
              Couldn’t open this board.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {status === "ready" && items.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-[12px] text-ink-3">
            This board is empty. Pick Sticky note (S) to add the first one.
          </p>
        ) : null}
      </div>

      <AnimatePresence>
        {menu === "zoom" ? (
          <ZrMenu
            key="zoom"
            label="Zoom options"
            entries={zoomEntries}
            align="right"
            top={barHeight + 4}
            maxHeight={viewportHeight - 8}
            columns={Math.min(5, Math.max(1, stops.length))}
            motionSafe={motionSafe}
            onClose={closeMenu}
          />
        ) : null}
        {menu === "tools" ? (
          <ZrMenu
            key="tools"
            label="Tools"
            entries={toolEntries}
            align="left"
            top={barHeight + 4}
            maxHeight={viewportHeight - 8}
            motionSafe={motionSafe}
            onClose={closeMenu}
          />
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/* Hairline glyphs drawn to the same 16-unit grid as the fit icon, so the
   three zoom controls share one stroke weight at every tool size. */
function MinusGlyph({ size }: { size: number }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={size} height={size} fill="none">
      <path
        d="M 3.5 8 H 12.5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusGlyph({ size }: { size: number }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width={size} height={size} fill="none">
      <path
        d="M 3.5 8 H 12.5 M 8 3.5 V 12.5"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </svg>
  );
}
