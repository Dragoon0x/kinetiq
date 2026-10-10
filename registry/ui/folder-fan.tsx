"use client";

import * as React from "react";

import { Check } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FolderFanItem = {
  id: string;
  /** The document's name: the option's accessible name. */
  label: string;
  /** A short note at the row's end: a date, a size. */
  meta?: string;
};

export type FolderFanColor = "manila" | "sky" | "sage" | "clay";
export type FolderFanSize = "sm" | "md" | "lg";

export type FolderFanProps = {
  /** The documents in the folder, first on top. */
  items: FolderFanItem[];
  /** Controlled: the chosen document's id. */
  value?: string | null;
  /** Initial choice when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click or key that chose a document. */
  onValueChange?: (id: string) => void;
  /** Controlled: whether the folder is open. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or outside click that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** The folder's name, shown beside it and its accessible name. @default "Documents" */
  label?: string;
  /** How many papers it holds (the first `sheets` items), 1 to 8. @default 4 */
  sheets?: number;
  /** The fan's total spread when the papers lift, in degrees. @default 24 */
  fan?: number;
  /** How far the papers rise out of the folder on hover and focus, in px. @default 18 */
  lift?: number;
  /** The folder's stock: a named pigment, or any CSS colour. @default "manila" */
  color?: FolderFanColor | (string & {});
  /** @default "md" */
  size?: FolderFanSize;
  /** Play the papers sliding out, the choice and the close. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  max: number;
  w: number;
  h: number;
  tab: number;
  flap: number;
  row: number;
  text: string;
};

const SIZES: Record<FolderFanSize, Geometry> = {
  sm: { max: 280, w: 84, h: 64, tab: 9, flap: 46, row: 28, text: "text-xs" },
  md: { max: 320, w: 100, h: 76, tab: 10, flap: 54, row: 30, text: "text-xs" },
  lg: { max: 360, w: 116, h: 88, tab: 11, flap: 62, row: 34, text: "text-sm" },
};

/** Pigments at fixed lightness: the same folder on a light page or a dark one. */
const STOCK: Record<FolderFanColor, string> = {
  manila: "oklch(0.86 0.075 84)",
  sky: "oklch(0.82 0.07 236)",
  sage: "oklch(0.82 0.06 150)",
  clay: "oklch(0.78 0.08 42)",
};

const PAD = 4;
const GAP = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each paper's own lean and wobble: the same on every load. */
function seedsFor(m: number) {
  const rand = rng(1489 + m * 17);
  return Array.from({ length: m }, () => ({
    tilt: (rand() - 0.5) * 3,
    jitter: (rand() - 0.5) * 4,
    nudge: (rand() - 0.5) * 4,
  }));
}

type Pose = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
};

/**
 * A folder that fans its papers out to say hello. Hovering or focusing it
 * lifts the papers out — each rising and tilting about its foot by a seeded
 * share of `fan`, with a soft shadow, nearest first on springs.snap.
 * Opening it swings the front flap down about its hinge in perspective on
 * springs.snap and sends the papers out of the folder into a list beside
 * it: each glides from its fan pose to its row on springs.glide, unrotating
 * and widening into a row with the document's name, in a cascade. Choosing a
 * row folds the list back into the folder in reverse, the flap closes, and
 * the chosen paper stays peeking out of the top.
 *
 * The folder is a button that opens a listbox: Enter, Space or ArrowDown
 * open it, arrows move through the documents, Enter or Space chooses, and
 * Escape closes and returns focus. Under reduced motion the fan is an
 * instant pose and the list crossfades in place of the papers.
 */
export function FolderFan({
  items,
  value,
  defaultValue = null,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  label = "Documents",
  sheets = 4,
  fan = 24,
  lift = 18,
  color = "manila",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: FolderFanProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const g = SIZES[size] ?? SIZES.md;
  const uid = React.useId();
  const listId = `${uid}-list`;
  const optionId = (id: string) => `${uid}-opt-${id}`;

  const [ownValue, setOwnValue] = React.useState<string | null>(defaultValue);
  const chosen = value === undefined ? ownValue : value;
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [awake, setAwake] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [width, setWidth] = React.useState(g.max);
  const [focusList, setFocusList] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);
  const handledFocus = React.useRef(0);

  const m = clamp(Math.round(sheets), 1, Math.min(8, items.length || 1));
  const shown = items.slice(0, m);
  const stock = STOCK[color as FolderFanColor] ?? color;
  const spread = clamp(fan, 0, 90);
  const rise = clamp(lift, 0, 48);
  const reduced = !motionSafe;

  // The root's width, for the open list's rows.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sizer = new ResizeObserver(() => setWidth(root.offsetWidth));
    sizer.observe(root);
    return () => sizer.disconnect();
  }, []);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  React.useEffect(() => clearTimers, []);

  const listLeft = PAD + g.w + 14;
  const listHeight = m * (g.row + GAP) - GAP;
  const closedHeight = g.h + rise + 10;
  const height = isOpen
    ? Math.max(closedHeight, listHeight + PAD * 2)
    : closedHeight;
  const rowWidth = Math.max(80, width - listLeft - PAD);

  const seeds = seedsFor(m);

  const sheetW = g.w - 26;
  const sheetH = g.h - 16;
  const chosenIndex = shown.findIndex((it) => it.id === chosen);

  // Every number a pose hands to motion is rounded: it lands in the markup.
  const poseOf = (i: number): Pose => {
    const p = rawPose(i);
    return {
      left: r2(p.left),
      top: r2(p.top),
      width: r2(p.width),
      height: r2(p.height),
      rotate: r2(p.rotate),
    };
  };
  // Papers are placed from the top of the box at its target height: the box
  // grows downward, so a row never lands above it while it glides.
  const fromBottom = (bottom: number, h: number) => height - bottom - h;
  const rawPose = (i: number): Pose => {
    const s = seeds[i] ?? { tilt: 0, jitter: 0, nudge: 0 };
    // Back to front: the first item is the front paper.
    const depth = m - 1 - i;
    const restLeft = PAD + 13 + depth * 2 + s.nudge * 0.5;
    const restBottom = PAD + 6 + depth * 1.5;
    if (isOpen) {
      return {
        left: listLeft,
        top: PAD + i * (g.row + GAP) + (height - PAD * 2 - listHeight) / 2,
        width: rowWidth,
        height: g.row,
        rotate: 0,
      };
    }
    if (awake && !disabled) {
      const t = m > 1 ? depth / (m - 1) : 0.5;
      const angle = lerp(-spread / 2, spread / 2, t) + s.jitter * (spread / 48);
      return {
        left: restLeft + (t - 0.5) * spread * 0.35,
        top: fromBottom(
          restBottom + rise * (0.75 + 0.25 * (1 - Math.abs(t - 0.5) * 2)),
          sheetH,
        ),
        width: sheetW,
        height: sheetH,
        rotate: r2(angle),
      };
    }
    return {
      left: restLeft,
      top: fromBottom(restBottom + (i === chosenIndex ? 10 : 0), sheetH),
      width: sheetW,
      height: sheetH,
      rotate: r2(s.tilt),
    };
  };

  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const step = cascade(m);

  const openFolder = () => {
    if (disabled || isOpen) return;
    setOpen(true);
    const start = chosenIndex >= 0 ? chosenIndex : 0;
    setActive(start);
    setFocusList((n) => n + 1);
    clearTimers();
    shown.forEach((_, i) => {
      timers.current.push(
        window.setTimeout(
          () => audio.play("paper", { pitch: 0.9 + i * 0.06, gain: 0.32 }),
          Math.round((reduced ? 0 : 0.05 + i * step) * 1000),
        ),
      );
    });
  };

  const closeFolder = (refocus: boolean) => {
    if (!isOpen) return;
    clearTimers();
    setOpen(false);
    audio.play("paper", { pitch: 0.7, gain: 0.25 });
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    const item = shown[index];
    if (!item) return;
    if (value === undefined) setOwnValue(item.id);
    onValueChange?.(item.id);
    audio.play("paper", { pitch: 1.3, gain: 0.45 });
    clearTimers();
    setOpen(false);
    buttonRef.current?.focus();
  };

  // The list has committed open: it takes focus now.
  React.useEffect(() => {
    if (!isOpen || handledFocus.current === focusList) return;
    handledFocus.current = focusList;
    listRef.current?.focus();
  }, [isOpen, focusList]);

  // A press outside closes it without moving focus.
  React.useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (
        root &&
        event.target instanceof Node &&
        !root.contains(event.target)
      ) {
        clearTimers();
        if (open === undefined) setOwnOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [isOpen, open, onOpenChange]);

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const k = event.key;
    if (k === "ArrowDown" || k === "ArrowUp") {
      event.preventDefault();
      setActive((a) => (a + (k === "ArrowDown" ? 1 : -1) + m) % m);
    } else if (k === "Home" || k === "End") {
      event.preventDefault();
      setActive(k === "Home" ? 0 : m - 1);
    } else if (k === "Enter" || k === " ") {
      event.preventDefault();
      choose(active);
    } else if (k === "Escape") {
      event.preventDefault();
      closeFolder(true);
    } else if (k === "Tab") {
      clearTimers();
      setOpen(false);
    }
  };

  const flapSpring = reduced ? { duration: 0 } : springs.snap;
  const chosenItem = chosenIndex >= 0 ? shown[chosenIndex] : undefined;
  const summary = chosenItem
    ? chosenItem.label
    : `${m} ${m === 1 ? "document" : "documents"}`;
  const back = `color-mix(in oklab, ${stock} 84%, black)`;
  const edge = `color-mix(in oklab, ${stock} 70%, black)`;

  return (
    <motion.div
      ref={rootRef}
      className={cn("relative w-full", className)}
      style={{ maxWidth: g.max }}
      initial={false}
      animate={{ height }}
      transition={reduced ? { duration: 0 } : springs.glide}
    >
      {/* The folder's back panel and its tab. */}
      <div
        aria-hidden
        className="absolute"
        style={{ left: PAD, bottom: PAD, width: g.w, height: g.h }}
      >
        <div
          className="absolute top-0 left-0 rounded-t-2"
          style={{
            width: g.w * 0.42,
            height: g.tab + 4,
            background: back,
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 rounded-2 rounded-tl-none"
          style={{ top: g.tab, background: back }}
        />
      </div>

      {/* The folder button: the whole row while closed. */}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label={chosenItem ? `${label}: ${chosenItem.label}` : label}
        disabled={disabled}
        onClick={() => (isOpen ? closeFolder(false) : openFolder())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !isOpen) {
            event.preventDefault();
            openFolder();
          } else if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            closeFolder(false);
          }
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setAwake(true);
        }}
        onPointerLeave={() => setAwake(false)}
        onFocus={() => setAwake(true)}
        onBlur={() => setAwake(false)}
        className={cn(
          "absolute inset-0 z-0 rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      />

      {/* The name beside the folder, while it is closed. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute flex min-w-0 flex-col gap-0.5"
        style={{
          left: listLeft,
          bottom: PAD + g.flap / 2 - 14,
          maxWidth: `calc(100% - ${listLeft + PAD}px)`,
        }}
        initial={false}
        animate={{ opacity: isOpen ? 0 : 1, x: isOpen && !reduced ? 8 : 0 }}
        transition={
          isOpen
            ? { duration: 0.12, ease: easings.exit }
            : {
                duration: durations.base,
                ease: easings.enter,
                delay: reduced ? 0 : 0.15,
              }
        }
      >
        <span className="truncate text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {summary}
        </span>
      </motion.div>

      {/* The papers: in the folder, fanned, or spread into the list. */}
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={label}
        aria-activedescendant={
          isOpen && shown[active] ? optionId(shown[active].id) : undefined
        }
        aria-hidden={!isOpen || undefined}
        tabIndex={isOpen ? 0 : -1}
        inert={!isOpen}
        onKeyDown={onListKeyDown}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (
            isOpen &&
            next instanceof Node &&
            rootRef.current &&
            !rootRef.current.contains(next)
          ) {
            clearTimers();
            setOpen(false);
          }
        }}
        className="pointer-events-none absolute inset-0 z-10 outline-none"
      >
        {shown.map((item, i) => {
          const pose = poseOf(i);
          const depth = m - 1 - i;
          const order = isOpen ? i : m - 1 - i;
          const isActive = isOpen && active === i;
          const isChosen = item.id === chosen;
          const travel = reduced
            ? { duration: 0 }
            : isOpen
              ? { ...springs.glide, delay: order * step }
              : awake
                ? { ...springs.snap, delay: depth * step * 0.5 }
                : { ...springs.glide, delay: order * step * 0.5 };
          return (
            <motion.div
              key={item.id}
              id={optionId(item.id)}
              role="option"
              aria-selected={isChosen}
              onClick={() => isOpen && choose(i)}
              // Only a pointer that moves picks a row: rows gliding out
              // under a resting pointer do not steal the active one.
              onPointerMove={() => {
                if (isOpen && active !== i) setActive(i);
              }}
              initial={false}
              animate={pose}
              transition={travel}
              className={cn(
                "absolute overflow-hidden rounded-2 border bg-card",
                isOpen
                  ? "pointer-events-auto cursor-pointer"
                  : "pointer-events-none",
                isActive
                  ? "border-cobalt-bright ring-2 ring-cobalt-bright/25"
                  : "border-hairline-strong",
              )}
              style={{
                zIndex: m - i,
                originX: 0.5,
                originY: 1,
                boxShadow:
                  "0 4px 10px -6px color-mix(in oklab, black 45%, transparent)",
              }}
            >
              {/* As a paper: a heading and lines of print. */}
              <motion.div
                aria-hidden
                className="absolute inset-x-2 top-2 flex flex-col gap-1"
                initial={false}
                animate={{ opacity: isOpen ? 0 : 1 }}
                transition={{ duration: durations.fast }}
              >
                <span
                  className="h-1 w-1/2 rounded-full"
                  style={{
                    background: isChosen ? edge : "var(--ink-3)",
                    opacity: 0.6,
                  }}
                />
                <span className="h-0.5 w-full rounded-full bg-hairline-strong" />
                <span className="h-0.5 w-5/6 rounded-full bg-hairline-strong" />
                <span className="h-0.5 w-2/3 rounded-full bg-hairline-strong" />
              </motion.div>
              {/* As a row: the document's name. */}
              <motion.div
                className={cn(
                  "absolute inset-0 flex items-center gap-2 px-2.5 whitespace-nowrap",
                  g.text,
                )}
                initial={false}
                animate={{ opacity: isOpen ? 1 : 0 }}
                transition={
                  isOpen
                    ? {
                        duration: durations.fast,
                        delay: reduced ? 0 : order * step + 0.12,
                      }
                    : { duration: 0.08 }
                }
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: stock }}
                />
                <span
                  className="min-w-0 flex-1 truncate font-medium text-foreground"
                  title={item.label}
                >
                  {item.label}
                </span>
                {item.meta ? (
                  <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                    {item.meta}
                  </span>
                ) : null}
                <Check
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 text-cobalt-bright",
                    isChosen ? "opacity-100" : "opacity-0",
                  )}
                />
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* The front flap, over the papers: it swings down when the folder opens. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute z-20 rounded-2"
        style={{
          left: PAD,
          bottom: PAD,
          width: g.w,
          height: g.flap,
          background: `linear-gradient(to bottom, color-mix(in oklab, ${stock} 92%, white), ${stock} 40%)`,
          boxShadow: `inset 0 1px 0 color-mix(in oklab, ${stock} 70%, white), 0 -1px 0 ${edge}`,
          originY: 1,
          transformPerspective: 360,
        }}
        initial={false}
        animate={{ rotateX: isOpen && !reduced ? -52 : 0 }}
        transition={flapSpring}
      />
    </motion.div>
  );
}
