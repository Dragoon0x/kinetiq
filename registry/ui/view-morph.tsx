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

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ViewMorphView = "grid" | "list" | "board";

export type ViewMorphTone =
  "accent" | "signal" | "warn" | "danger" | "success" | "ink";

export type ViewMorphEntry = {
  id: string;
  title: string;
  /** A short second line: a count, a day. Shown in the list and on the board. */
  meta?: string;
  /** The board column this entry sits in, by column id. */
  status?: string;
  /** The cover's colour. @default picked from the id */
  tone?: ViewMorphTone;
};

export type ViewMorphColumn = { id: string; label: string };

export type ViewMorphProps = {
  collection: ViewMorphEntry[];
  /** The board's columns, in order. @default the statuses, in order of appearance */
  columns?: ViewMorphColumn[];
  /** Controlled view. */
  value?: ViewMorphView;
  /** Initial view when uncontrolled. @default "grid" */
  defaultValue?: ViewMorphView;
  /** Fires from the press or key that chose a view, with the new view. */
  onValueChange?: (view: ViewMorphView) => void;
  /** The collection's name: its heading, the list's name and the switcher's. @default "Collection" */
  label?: string;
  /** How far apart the items set off, 0 (all at once) to 1 (a ripple). @default 0.5 */
  stagger?: number;
  /** How many entries of the collection show. @default all */
  items?: number;
  /** Offer grid and list (2), or grid, list and board (3). @default 3 */
  views?: 2 | 3 | "2" | "3";
  /** The most the collection may grow to, in px; past it, it scrolls. */
  maxHeight?: number;
  /** An entry was opened. When given, every entry is a button. */
  onOpen?: (id: string) => void;
  /** Play the switch and the move. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const NAMES: Record<ViewMorphView, string> = {
  grid: "Grid",
  list: "List",
  board: "Board",
};

type Bar = readonly [number, number, number, number];

/*
 * Each glyph is the same six bars in a 16-unit box, in corresponding order,
 * so any glyph can become any other by moving its bars.
 */
const SHAPES: Record<ViewMorphView, readonly Bar[]> = {
  grid: [
    [1.5, 2.5, 3.8, 4.8],
    [6.1, 2.5, 3.8, 4.8],
    [10.7, 2.5, 3.8, 4.8],
    [1.5, 8.7, 3.8, 4.8],
    [6.1, 8.7, 3.8, 4.8],
    [10.7, 8.7, 3.8, 4.8],
  ],
  list: [
    [1.5, 2.5, 2.8, 2.8],
    [5.6, 2.5, 8.9, 2.8],
    [1.5, 6.6, 2.8, 2.8],
    [5.6, 6.6, 8.9, 2.8],
    [1.5, 10.7, 2.8, 2.8],
    [5.6, 10.7, 8.9, 2.8],
  ],
  board: [
    [1.5, 2.5, 3.8, 5.2],
    [6.1, 2.5, 3.8, 3],
    [10.7, 2.5, 3.8, 7.4],
    [1.5, 8.8, 3.8, 3],
    [6.1, 6.6, 3.8, 6.9],
    [10.7, 11, 3.8, 2.5],
  ],
};
const ORDER: ViewMorphView[] = ["grid", "list", "board"];

const PIGMENT: Record<ViewMorphTone, string> = {
  accent: "oklch(from var(--accent) 0.64 0.14 h)",
  signal: "oklch(from var(--signal) 0.74 0.12 h)",
  warn: "oklch(from var(--warn) 0.8 0.12 h)",
  danger: "oklch(from var(--danger) 0.68 0.15 h)",
  success: "oklch(from var(--success) 0.7 0.12 h)",
  ink: "oklch(from var(--ink-3) 0.62 0.02 h)",
};
const TONES = Object.keys(PIGMENT) as ViewMorphTone[];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const barsPath = (from: readonly Bar[], to: readonly Bar[], t: number) =>
  to
    .map((b, i) => {
      const a = from[i] ?? b;
      const x = r2(a[0] + (b[0] - a[0]) * t);
      const y = r2(a[1] + (b[1] - a[1]) * t);
      const w = r2(a[2] + (b[2] - a[2]) * t);
      const h = r2(a[3] + (b[3] - a[3]) * t);
      return `M${x} ${y}h${w}v${h}h${-w}Z`;
    })
    .join("");

/**
 * A view's glyph. When its view is chosen it starts in the shape of the view
 * being left and its bars travel into its own shape on the snap spring, the
 * way the collection's items travel into the new layout.
 */
function Glyph({
  view,
  from,
  arrive,
  motionSafe,
}: {
  view: ViewMorphView;
  from: ViewMorphView | null;
  arrive: number;
  motionSafe: boolean;
}) {
  const t = useMotionValue(1);
  const source = useMotionValue(ORDER.indexOf(view));
  const d = useTransform(
    [t, source] as MotionValue<number>[],
    ([k = 1, s = 0]: number[]) =>
      barsPath(SHAPES[ORDER[s] ?? view], SHAPES[view], clamp01(k)),
  );
  React.useEffect(() => {
    if (!arrive || !from || from === view) return;
    source.set(ORDER.indexOf(from));
    if (!motionSafe) {
      t.set(1);
      return;
    }
    t.set(0);
    const controls = animate(t, 1, springs.snap);
    // Interrupted (a StrictMode re-run, a quick second choice), the glyph
    // still ends in its own shape.
    return () => {
      controls.stop();
      t.set(1);
    };
  }, [arrive, from, view, motionSafe, source, t]);
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0">
      <motion.path
        d={d}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A cover drawn from the entry: its pigment, and a seeded sun and horizon. */
const coverOf = (entry: ViewMorphEntry, strip: boolean) => {
  const h = hash(entry.id);
  const tone = entry.tone ?? TONES[h % TONES.length] ?? "accent";
  const pigment = PIGMENT[tone];
  const sx = 18 + (h % 64);
  const sy = 22 + ((h >>> 8) % 30);
  const horizon = 58 + ((h >>> 16) % 20);
  const body = `linear-gradient(160deg, oklch(from ${pigment} 0.86 0.07 h), ${pigment})`;
  // Thinned to a strip, the picture is only its colour.
  if (strip) return body;
  return `radial-gradient(circle at ${sx}% ${sy}%, oklch(from ${pigment} 0.95 0.04 h) 0 9%, transparent 10%), linear-gradient(to bottom, transparent ${horizon}%, oklch(from ${pigment} 0.5 c h / 0.55) ${horizon}%), ${body}`;
};

const ITEM: Record<ViewMorphView, string> = {
  grid: "flex-col gap-1.5 p-1.5",
  list: "flex-row items-center gap-2.5 p-1.5",
  board: "flex-col gap-1 p-1.5",
};
const COVER: Record<ViewMorphView, string> = {
  grid: "aspect-[2/1] w-full",
  list: "size-7",
  board: "h-1.5 w-full",
};
const GRID: Record<ViewMorphView, string> = {
  grid: "grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2",
  list: "grid-cols-1 gap-1 @min-[34rem]:grid-cols-2 @min-[34rem]:gap-x-2",
  board: "gap-x-2 gap-y-1.5",
};

/**
 * A collection with a switch for how it is laid out. Choosing Grid, List or
 * Board re-lays every entry, and each one travels to its new place on the
 * glide spring instead of being redrawn — every entry is one element in one
 * grid across all three views, carrying motion's shared layout — while its
 * cover grows into a tile, shrinks to a thumbnail or thins to a colour strip,
 * and the details only one view has fade in and out. `stagger` sends the
 * entries across one after another, inside the 600ms budget, and the
 * collection's measured height glides with them.
 *
 * The switch is a real radiogroup whose thumb slides on snap, and the glyph of
 * the view you choose starts as the view you left and morphs into its own
 * shape as the thumb arrives. Arrow keys move and choose, Home and End jump.
 * Under reduced motion the collection cross-fades into the new layout and the
 * glyph swaps, while the choice and the announcement still happen.
 */
export function ViewMorph({
  collection,
  columns,
  value,
  defaultValue = "grid",
  onValueChange,
  label = "Collection",
  stagger = 0.5,
  items,
  views = 3,
  maxHeight,
  onOpen,
  sound = false,
  disabled = false,
  className,
}: ViewMorphProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const offered: ViewMorphView[] =
    Number(views) === 2 ? ["grid", "list"] : ["grid", "list", "board"];

  const [own, setOwn] = React.useState<ViewMorphView>(defaultValue);
  const chosen = value ?? own;
  const view: ViewMorphView = offered.includes(chosen) ? chosen : "grid";

  // The view being left, for the glyph, and a count that says "a view was
  // just chosen" even when it is chosen twice in a row from the same place.
  const [trail, setTrail] = React.useState<{
    view: ViewMorphView;
    from: ViewMorphView | null;
    n: number;
  }>({ view, from: null, n: 0 });
  if (trail.view !== view) {
    setTrail({ view, from: trail.view, n: trail.n + 1 });
  }

  const total = collection.length;
  const limit =
    items === undefined
      ? total
      : Math.max(0, Math.min(total, Math.round(items)));
  const shown = collection.slice(0, limit);
  const count = shown.length;

  const [said, setSaid] = React.useState({ n: 0, key: view, text: "" });
  if (said.key !== view) {
    setSaid({
      n: said.n + 1,
      key: view,
      text: `${NAMES[view]} view, ${count} of ${total}.`,
    });
  }

  const lanes: ViewMorphColumn[] = React.useMemo(() => {
    if (columns && columns.length > 0) return columns;
    const seen: ViewMorphColumn[] = [];
    for (const entry of collection) {
      const id = entry.status ?? "";
      if (!seen.some((c) => c.id === id))
        seen.push({ id, label: id || "Other" });
    }
    return seen.length > 0 ? seen : [{ id: "", label: "All" }];
  }, [columns, collection]);

  // Board placement: each entry's column, and its row within that column.
  const place = new Map<string, { col: number; row: number }>();
  const depth = lanes.map(() => 0);
  for (const entry of shown) {
    const found = lanes.findIndex((c) => c.id === (entry.status ?? ""));
    const col = found === -1 ? 0 : found;
    const row = depth[col] ?? 0;
    depth[col] = row + 1;
    place.set(entry.id, { col, row });
  }

  const gap = cascade(Math.max(2, count)) * clamp01(stagger);
  const layoutOf = (i: number) => ({
    layout: { ...springs.glide, delay: r3(i * gap) },
  });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const height = useMotionValue<number | "auto">("auto");
  const fade = useMotionValue(1);
  const measured = React.useRef(false);
  const heightAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const [overflowing, setOverflowing] = React.useState(false);
  const [atEnd, setAtEnd] = React.useState(false);
  const cap = maxHeight !== undefined && maxHeight > 0 ? maxHeight : undefined;
  const settings = React.useRef({ motionSafe, cap });
  React.useEffect(() => {
    settings.current = { motionSafe, cap };
  });

  // The collection's height, measured on the content when it arrives and
  // every time it changes; the box glides to it and scrolls past the cap.
  const bindContent = React.useCallback(
    (node: HTMLUListElement | null) => {
      if (!node) return;
      const measure = () => {
        const { motionSafe: safe, cap: most } = settings.current;
        const natural = node.offsetHeight;
        const target = most === undefined ? natural : Math.min(natural, most);
        setOverflowing(most !== undefined && natural > most + 0.5);
        heightAnim.current?.stop();
        if (!measured.current || !safe) {
          measured.current = true;
          height.set(target);
          return;
        }
        heightAnim.current = animate(height, target, springs.glide);
      };
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => {
        observer.disconnect();
        heightAnim.current?.stop();
      };
    },
    [height],
  );

  // Under reduced motion the new layout fades up rather than travelling.
  React.useEffect(() => {
    if (motionSafe || trail.n === 0) return;
    fade.set(0.25);
    const controls = animate(fade, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
    return () => {
      controls.stop();
      fade.set(1);
    };
  }, [trail.n, motionSafe, fade]);

  const choose = (next: ViewMorphView, clientX?: number) => {
    if (disabled || next === view) return;
    const index = offered.indexOf(next);
    const pan =
      clientX !== undefined
        ? panFrom(clientX, rootRef.current)
        : r2(((index / Math.max(1, offered.length - 1)) * 2 - 1) * 0.4);
    audio.play("click", { pitch: r2(1.1 + index * 0.12), gain: 0.5, pan });
    if (count > 0) {
      audio.play("swish", {
        pitch: r2(0.85 + (1 - clamp01(stagger)) * 0.35),
        gain: r2(Math.min(0.55, 0.2 + count * 0.035)),
        pan,
      });
    }
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const onGroupKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const at = offered.indexOf(view);
    let next = -1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (at + 1) % offered.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (at - 1 + offered.length) % offered.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = offered.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = offered[next];
    if (!target) return;
    choose(target);
    groupRef.current
      ?.querySelectorAll<HTMLButtonElement>("[role=radio]")
      [next]?.focus();
  };

  const layoutOn = motionSafe;

  return (
    <div
      ref={rootRef}
      className={cn(
        "@container relative flex w-full flex-col gap-2.5",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex h-9 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm leading-5 font-medium text-foreground">
            {label}
          </p>
          <p className="font-mono text-[10px] leading-3.5 tracking-[0.08em] text-ink-3 uppercase tabular-nums">
            {count} of {total}
          </p>
        </div>
        <div
          ref={groupRef}
          role="radiogroup"
          aria-label={`${label} view`}
          aria-disabled={disabled || undefined}
          onKeyDown={onGroupKeyDown}
          className="flex h-9 shrink-0 items-center gap-0.5 rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {offered.map((v) => {
            const checked = v === view;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={NAMES[v]}
                tabIndex={checked ? 0 : -1}
                disabled={disabled}
                onClick={(event) =>
                  choose(v, event.detail === 0 ? undefined : event.clientX)
                }
                className={cn(
                  "relative flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "enabled:cursor-pointer disabled:cursor-not-allowed",
                  checked
                    ? "text-cobalt-bright"
                    : "text-ink-3 enabled:hover:text-foreground",
                )}
              >
                {checked ? (
                  <motion.span
                    layoutId={`${uid}-thumb`}
                    aria-hidden
                    className="absolute inset-0 rounded-full border border-hairline-strong bg-card shadow-[var(--shadow-raised)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative flex items-center gap-1.5">
                  <Glyph
                    view={v}
                    from={checked ? trail.from : null}
                    arrive={checked ? trail.n : 0}
                    motionSafe={motionSafe}
                  />
                  <span className="@max-[26rem]:sr-only">{NAMES[v]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <motion.div
        className="relative overflow-clip"
        style={{ height, maxHeight: cap }}
      >
        <motion.div
          layoutScroll
          onScroll={(event) => {
            const el = event.currentTarget;
            setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
          }}
          className="h-full overflow-y-auto overscroll-contain"
          style={{
            maxHeight: cap,
            maskImage:
              overflowing && !atEnd
                ? "linear-gradient(to bottom, black calc(100% - 28px), transparent)"
                : undefined,
            WebkitMaskImage:
              overflowing && !atEnd
                ? "linear-gradient(to bottom, black calc(100% - 28px), transparent)"
                : undefined,
          }}
        >
          <motion.ul
            ref={bindContent}
            role="list"
            aria-label={label}
            className={cn("grid p-px", GRID[view])}
            style={{
              opacity: fade,
              gridTemplateColumns:
                view === "board"
                  ? `repeat(${lanes.length}, minmax(0, 1fr))`
                  : undefined,
            }}
          >
            <AnimatePresence initial={false}>
              {view === "board"
                ? lanes.map((lane, i) => (
                    <motion.li
                      key={`lane-${lane.id}`}
                      aria-hidden
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                      }}
                      className="flex h-4 min-w-0 items-center justify-between gap-1 px-0.5 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase"
                      style={{ gridColumn: i + 1, gridRow: 1 }}
                    >
                      <span className="truncate">{lane.label}</span>
                      <span className="tabular-nums">{depth[i] ?? 0}</span>
                    </motion.li>
                  ))
                : null}
            </AnimatePresence>
            {shown.map((entry, i) => {
              const spot = place.get(entry.id);
              const transition = layoutOf(i);
              const lane = lanes[spot?.col ?? 0];
              const name = [
                entry.title,
                entry.meta,
                lane?.id ? lane.label : undefined,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <motion.li
                  key={entry.id}
                  layout={layoutOn}
                  transition={transition}
                  className={cn(
                    "relative flex min-w-0 rounded-3 border border-hairline bg-card",
                    ITEM[view],
                  )}
                  style={{
                    borderRadius: view === "grid" ? 10 : 8,
                    gridColumn:
                      view === "board" && spot ? spot.col + 1 : undefined,
                    gridRow:
                      view === "board" && spot ? spot.row + 2 : undefined,
                  }}
                >
                  <motion.span
                    layout={layoutOn}
                    transition={transition}
                    aria-hidden
                    className={cn("block shrink-0", COVER[view])}
                    style={{
                      backgroundImage: coverOf(entry, view === "board"),
                      backgroundSize: "cover",
                      borderRadius: view === "board" ? 999 : 6,
                    }}
                  />
                  <motion.span
                    layout={layoutOn ? "position" : false}
                    transition={transition}
                    className="block min-w-0 flex-1 px-0.5"
                  >
                    <span className="block truncate text-xs leading-4 font-medium text-foreground">
                      {entry.title}
                    </span>
                    <AnimatePresence initial={false}>
                      {view !== "grid" && entry.meta ? (
                        <motion.span
                          key="meta"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            duration: durations.base,
                            delay: motionSafe ? r3(i * gap + 0.28) : 0,
                          }}
                          className="block truncate text-[10px] leading-3.5 text-ink-3"
                        >
                          {entry.meta}
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </motion.span>
                  <AnimatePresence initial={false}>
                    {view === "list" && lane?.id ? (
                      <motion.span
                        key="chip"
                        layout={layoutOn ? "position" : false}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          duration: durations.base,
                          delay: motionSafe ? r3(i * gap + 0.28) : 0,
                        }}
                        className="shrink-0 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-[10px] leading-3.5 text-ink-2"
                      >
                        {lane.label}
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                  {onOpen ? (
                    // The whole card is the button; its ring is drawn inside
                    // so the scrolling box never cuts it off.
                    <button
                      type="button"
                      aria-label={name}
                      disabled={disabled}
                      onClick={() => onOpen(entry.id)}
                      className={cn(
                        "absolute inset-0 rounded-[inherit] outline-none",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        "enabled:cursor-pointer enabled:hover:bg-ink/[0.03] disabled:cursor-not-allowed",
                      )}
                    />
                  ) : null}
                </motion.li>
              );
            })}
          </motion.ul>
        </motion.div>
      </motion.div>

      <p role="status" aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
