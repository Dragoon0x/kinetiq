"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BandCompareItem = {
  /** The version's name, shown at the top of its band. */
  label: string;
  /** This version's picture. Without one, the shared `src` or the drawn picture is used. */
  src?: string;
  /** Describes this version. Defaults to the shared `alt` and the label. */
  alt?: string;
  /** A CSS filter that makes this version from the shared picture. */
  filter?: string;
  /** Your own art for this version, filling the frame. */
  art?: React.ReactNode;
};

export type BandCompareSeamStyle = "line" | "handle" | "gap" | "fold";
export type BandCompareLabels = "chip" | "rule" | "none";

export type BandCompareProps = {
  /** The versions; the first `bands` of them are shown. @default defaultBandCompareItems */
  items?: BandCompareItem[];
  /** The picture every version shares, unless a version brings its own. Defaults to a drawn harbour. */
  src?: string;
  /** Describes the shared picture. @default "A harbour at evening with boats and a lighthouse" */
  alt?: string;
  /** How many versions share the frame, 2 to 6. @default 4 */
  bands?: number;
  /** How the seams are drawn. @default "handle" */
  seamStyle?: BandCompareSeamStyle;
  /** How the bands are labelled; "none" keeps the labels for keyboard focus only. @default "chip" */
  labels?: BandCompareLabels;
  /** Controlled: the seam positions, left to right, as fractions of the frame. */
  value?: number[];
  /** Initial seam positions when uncontrolled. @default equal shares */
  defaultValue?: number[];
  /** Fires from the drag or key that moved a seam, with every seam. */
  onValueChange?: (seams: number[]) => void;
  /** Controlled: the band widened to fill the frame, or null. */
  expanded?: number | null;
  /** Initial widened band when uncontrolled. @default null */
  defaultExpanded?: number | null;
  /** Fires from the double-click, label or key that widened a band or shared it back. */
  onExpandedChange?: (index: number | null) => void;
  /** The narrowest a band can be pushed, px. @default 28 */
  minBand?: number;
  /** How far an arrow key moves a seam, as a fraction of the frame; Shift moves five times as far. @default 0.02 */
  step?: number;
  /** The frame's accessible name. @default "Versions" */
  label?: string;
  disabled?: boolean;
  /** Sizes the frame. @default "h-56 w-full" */
  className?: string;
};

const MAX = 6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number) => `${r3(v * 100)}%`;
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

export const defaultBandCompareItems: BandCompareItem[] = [
  { label: "Raw", filter: "saturate(0.72) contrast(0.9) brightness(1.02)" },
  {
    label: "Graded",
    filter: "saturate(1.3) contrast(1.06) sepia(0.12) brightness(1.02)",
  },
  { label: "Mono", filter: "grayscale(1) contrast(1.15)" },
  {
    label: "Dusk",
    filter: "sepia(0.3) hue-rotate(-24deg) saturate(1.35) brightness(0.8)",
  },
  { label: "Print", filter: "contrast(1.5) saturate(0.55) brightness(1.05)" },
  { label: "Cool", filter: "hue-rotate(14deg) saturate(0.9) brightness(1.04)" },
];

const equalShares = (n: number) =>
  Array.from({ length: n - 1 }, (_, k) => r3((k + 1) / n));

/** The default picture: a harbour at evening, rich enough to compare edits on. */
function HarbourArt() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      viewBox="0 0 320 120"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: pig("--accent", 0.72, 0.09) }} />
          <stop
            offset="0.6"
            style={{ stopColor: pig("--danger", 0.82, 0.07, 30) }}
          />
          <stop offset="1" style={{ stopColor: pig("--warn", 0.88, 0.1) }} />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: pig("--accent", 0.5, 0.09) }} />
          <stop offset="1" style={{ stopColor: pig("--accent", 0.28, 0.06) }} />
        </linearGradient>
      </defs>
      <rect width="320" height="70" fill={`url(#${id}-sky)`} />
      <circle
        cx="226"
        cy="58"
        r="13"
        style={{ fill: pig("--warn", 0.92, 0.12) }}
      />
      <path
        d="M0 70 L30 52 L58 60 L92 42 L130 58 L160 50 L200 64 L236 54 L270 62 L320 48 V70 Z"
        style={{ fill: pig("--accent", 0.42, 0.06, 10) }}
      />
      <rect y="68" width="320" height="52" fill={`url(#${id}-sea)`} />
      {[76, 82, 90, 100, 112].map((y, k) => (
        <path
          key={y}
          d={`M${206 - k * 6} ${y} h${40 + k * 12}`}
          style={{ stroke: pig("--warn", 0.9, 0.1) }}
          strokeWidth={r3(1 + k * 0.3)}
          opacity={r3(0.75 - k * 0.1)}
        />
      ))}
      <path
        d="M0 92 H120 V97 H0 Z"
        style={{ fill: pig("--warn", 0.35, 0.04, -20) }}
      />
      {[10, 34, 58, 82, 106].map((x) => (
        <rect
          key={x}
          x={x}
          y="96"
          width="3"
          height="20"
          style={{ fill: pig("--warn", 0.28, 0.03, -20) }}
        />
      ))}
      <path
        d="M38 89 h30 l-5 6 h-20 Z"
        style={{ fill: pig("--danger", 0.5, 0.15) }}
      />
      <path
        d="M52 89 V66 l12 21 Z"
        style={{ fill: pig("--accent", 0.97, 0.01) }}
      />
      <path
        d="M150 86 h40 l-6 7 h-28 Z"
        style={{ fill: pig("--accent", 0.22, 0.03) }}
      />
      <path
        d="M166 86 V60 l14 24 Z"
        style={{ fill: pig("--warn", 0.95, 0.03) }}
      />
      <path
        d="M280 70 l2 -34 h8 l2 34 Z"
        style={{ fill: pig("--accent", 0.96, 0.01) }}
      />
      <rect
        x="281"
        y="46"
        width="10"
        height="5"
        style={{ fill: pig("--danger", 0.55, 0.18) }}
      />
      <path
        d="M282 36 h8 v-6 h-8 Z"
        style={{ fill: pig("--warn", 0.88, 0.15) }}
      />
      <path
        d="M262 70 C276 64 300 62 320 66 V70 Z"
        style={{ fill: pig("--success", 0.32, 0.05) }}
      />
    </svg>
  );
}

/* ---------------------------------- band --------------------------------- */

type BandProps = {
  id: string;
  index: number;
  item: BandCompareItem;
  src?: string;
  alt: string;
  left: MotionValue<number>;
  right: MotionValue<number>;
  width: MotionValue<number>;
  seamStyle: BandCompareSeamStyle;
  labels: BandCompareLabels;
  first: boolean;
  last: boolean;
  pressed: boolean;
  hidden: boolean;
  onToggle: () => void;
};

/**
 * One version, drawn over the whole frame and clipped to its strip, so a seam
 * that moves reveals more of one version without anything shifting.
 */
function Band({
  id,
  index,
  item,
  src,
  alt,
  left,
  right,
  width,
  seamStyle,
  labels,
  first,
  last,
  pressed,
  hidden,
  onToggle,
}: BandProps) {
  const gap = seamStyle === "gap";
  const clip = useTransform(
    [left, right] as MotionValue<number>[],
    ([l, r]) => {
      const a = l as number;
      const b = r as number;
      const inL = gap && !first ? " + 3px" : "";
      const inR = gap && !last ? " + 3px" : "";
      return `inset(0 calc(${pct(1 - b)}${inR}) 0 calc(${pct(a)}${inL})${gap ? " round 6px" : ""})`;
    },
  );
  const centre = useTransform(
    [left, right] as MotionValue<number>[],
    ([l, r]) => pct(((l as number) + (r as number)) / 2),
  );
  const start = useTransform(left, (l) => pct(l));
  const span = useTransform([left, right] as MotionValue<number>[], ([l, r]) =>
    pct((r as number) - (l as number)),
  );
  const px = useTransform(
    [left, right, width] as MotionValue<number>[],
    ([l, r, w]) => ((r as number) - (l as number)) * (w as number),
  );
  const labelShow = useTransform(px, (p) => r3(clamp((p - 34) / 22, 0, 1)));
  const labelMax = useTransform(
    px,
    (p) => `${Math.max(0, Math.round(p - 14))}px`,
  );
  const src2 = item.src ?? src;
  const name = item.alt ?? `${alt}, ${item.label}`;

  return (
    <motion.div
      id={id}
      data-band={index}
      className="absolute inset-0"
      style={{ clipPath: clip }}
    >
      <div
        role="img"
        aria-label={name}
        className="absolute inset-0"
        style={{ filter: item.filter }}
      >
        {src2 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src2}
            alt=""
            draggable={false}
            className="block size-full object-cover"
          />
        ) : item.art ? (
          item.art
        ) : (
          <HarbourArt />
        )}
      </div>
      {seamStyle === "fold" ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0"
          style={{
            left: start,
            width: span,
            backgroundImage:
              "linear-gradient(90deg, oklch(1 0 0 / 0.16), transparent 18%, transparent 72%, oklch(0 0 0 / 0.2))",
          }}
        />
      ) : null}
      <motion.button
        type="button"
        aria-pressed={pressed}
        tabIndex={hidden ? -1 : 0}
        aria-hidden={hidden || undefined}
        onClick={onToggle}
        onDoubleClick={(event) => event.stopPropagation()}
        className={cn(
          "absolute top-2 flex h-6 min-w-0 items-center outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          labels === "rule"
            ? "flex-col items-start gap-1 pt-0.5 font-mono text-[10px] tracking-[0.08em] text-foreground uppercase"
            : "-translate-x-1/2 justify-center rounded-full border border-hairline bg-background/85 px-2.5 text-[11px] font-medium text-foreground shadow-sm",
          labels === "none" && "opacity-0 focus-visible:opacity-100",
        )}
        style={{
          left: labels === "rule" ? start : centre,
          marginLeft: labels === "rule" ? 10 : undefined,
          maxWidth: labelMax,
          opacity: labels === "none" ? undefined : labelShow,
        }}
      >
        <span className="block truncate">{item.label}</span>
        {labels === "rule" ? (
          <span aria-hidden className="block h-px w-4 bg-foreground/70" />
        ) : null}
        <span className="sr-only">
          {pressed ? ", shown full frame" : ", widen"}
        </span>
      </motion.button>
    </motion.div>
  );
}

/* ---------------------------------- seam --------------------------------- */

type SeamProps = {
  index: number;
  at: MotionValue<number>;
  seamStyle: BandCompareSeamStyle;
  hidden: boolean;
  disabled: boolean;
  committed: number;
  lo: number;
  hi: number;
  text: string;
  controls: string;
  motionSafe: boolean;
  onGrab: () => number;
  onMove: (fraction: number) => void;
  onRelease: (velocity: number) => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

/** A seam: a focusable separator whose grip follows the finger 1:1. */
function Seam({
  index,
  at,
  seamStyle,
  hidden,
  disabled,
  committed,
  lo,
  hi,
  text,
  controls,
  motionSafe,
  onGrab,
  onMove,
  onRelease,
  onKey,
}: SeamProps) {
  const [active, setActive] = React.useState(false);
  const left = useTransform(at, (v) => pct(v));
  const width = React.useRef(1);
  const drag = useDrag({
    axis: "x",
    threshold: 2,
    disabled: disabled || hidden,
    onStart: () => {
      width.current = onGrab();
      setActive(true);
    },
    onMove: ({ offset }) => onMove(offset.x / Math.max(1, width.current)),
    onEnd: ({ velocity }) => {
      setActive(false);
      onRelease(velocity.x / Math.max(1, width.current));
    },
    onCancel: () => {
      setActive(false);
      onRelease(0);
    },
  });

  return (
    <motion.div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Seam ${index + 1}`}
      aria-valuenow={Math.round(committed * 100)}
      aria-valuemin={Math.round(lo * 100)}
      aria-valuemax={Math.round(hi * 100)}
      aria-valuetext={text}
      aria-controls={controls}
      aria-hidden={hidden || undefined}
      tabIndex={hidden || disabled ? -1 : 0}
      onKeyDown={onKey}
      {...drag}
      className={cn(
        "group/band-seam absolute inset-y-0 z-10 flex w-6 -translate-x-1/2 touch-pan-y items-center justify-center outline-none",
        !disabled && "cursor-col-resize",
        "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
      )}
      style={{ left, opacity: hidden ? 0 : 1 }}
    >
      {seamStyle === "gap" ? (
        <motion.span
          aria-hidden
          data-active={active || undefined}
          className="h-8 w-1 rounded-full bg-foreground/60 opacity-0 transition-opacity group-hover/band-seam:opacity-100 group-focus-visible/band-seam:opacity-100 data-[active]:opacity-100"
          animate={{ scaleY: active ? 1.4 : 1 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      ) : (
        <>
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-1/2 -translate-x-1/2 shadow-[0_0_0_1px_var(--hairline-strong)]",
              seamStyle === "handle" ? "w-0.5 bg-card" : "w-px bg-card/90",
              seamStyle === "fold" && "bg-foreground/25 shadow-none",
            )}
          />
          {seamStyle === "handle" ? (
            <motion.span
              aria-hidden
              className="relative flex size-7 items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground shadow-sm"
              animate={{ scale: active ? 1.14 : 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            >
              <ChevronLeft className="size-3 shrink-0" />
              <ChevronRight className="-ml-0.5 size-3 shrink-0" />
            </motion.span>
          ) : null}
        </>
      )}
    </motion.div>
  );
}

/* ------------------------------- component ------------------------------- */

/**
 * Several versions of one picture side by side as bands across one frame, in
 * register, each labelled at its top. Drag any seam and it follows 1:1 while
 * only the two bands either side give way — pushed against a neighbour it
 * rubber-bands, and a throw lands on springs.glide with the release velocity.
 * Double-click a band (or press its label) and it widens to fill the frame:
 * the seams sweep outward on glide, nearest first, and the same again sweeps
 * them back to the shares they had. Seams are separators: Tab moves between
 * them and the arrows move them; number keys widen a band and Escape shares it
 * back. Under reduced motion seams jump and a widened band fades in.
 */
export function BandCompare({
  items = defaultBandCompareItems,
  src,
  alt = "A harbour at evening with boats and a lighthouse",
  bands = 4,
  seamStyle = "handle",
  labels = "chip",
  value,
  defaultValue,
  onValueChange,
  expanded,
  defaultExpanded = null,
  onExpandedChange,
  minBand = 28,
  step = 0.02,
  label = "Versions",
  disabled = false,
  className,
}: BandCompareProps) {
  const motionSafe = useMotionSafe();
  const list = (items.length > 0 ? items : defaultBandCompareItems).slice(
    0,
    MAX,
  );
  const n = clamp(Math.round(bands), 2, Math.max(2, list.length));
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;
  const bandId = (i: number) => `${baseId}-band-${i}`;

  const valid = (v: number[] | undefined) =>
    v !== undefined &&
    v.length === n - 1 &&
    v.every((x, k) => x > 0 && x < 1 && (k === 0 || x > (v[k - 1] ?? 0)));
  const [own, setOwn] = React.useState<{ n: number; seams: number[] }>(() => ({
    n,
    seams: valid(defaultValue) ? (defaultValue as number[]) : equalShares(n),
  }));
  const ownSeams = own.n === n ? own.seams : equalShares(n);
  const seams = valid(value) ? (value as number[]) : ownSeams;
  const [ownExpanded, setOwnExpanded] = React.useState<number | null>(
    defaultExpanded,
  );
  const rawExpanded = expanded === undefined ? ownExpanded : expanded;
  const open =
    rawExpanded !== null && rawExpanded >= 0 && rawExpanded < n
      ? rawExpanded
      : null;
  const [said, setSaid] = React.useState("");

  /** Where every edge should be: its share, or swept aside for a widened band. */
  const targets = React.useMemo(() => {
    const out = [0, ...seams, 1];
    return open === null ? out : out.map((_, k) => (k <= open ? 0 : 1));
  }, [open, seams]);
  const init = (k: number) => (k <= n ? (targets[k] ?? 1) : 1);

  // Motion values for every possible edge, so the hook count never changes;
  // each starts where the first render puts it, so the server frame is right.
  const m0 = useMotionValue(init(0));
  const m1 = useMotionValue(init(1));
  const m2 = useMotionValue(init(2));
  const m3 = useMotionValue(init(3));
  const m4 = useMotionValue(init(4));
  const m5 = useMotionValue(init(5));
  const m6 = useMotionValue(init(6));
  const edges = React.useMemo(
    () => [m0, m1, m2, m3, m4, m5, m6],
    [m0, m1, m2, m3, m4, m5, m6],
  );
  const width = useMotionValue(720);
  const [frameW, setFrameW] = React.useState(720);
  const dim = useMotionValue(1);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef<(AnimationPlaybackControls | null)[]>([]);
  const aimed = React.useRef<number[]>([]);
  const grab = React.useRef(0);

  const moveEdge = React.useCallback(
    (k: number, to: number, velocity = 0, delay = 0) => {
      const mv = edges[k];
      if (!mv) return;
      anims.current[k]?.stop();
      aimed.current[k] = to;
      if (!motionSafe) {
        mv.jump(to);
        return;
      }
      anims.current[k] = animate(mv, to, { ...springs.glide, velocity, delay });
    },
    [edges, motionSafe],
  );

  // Every edge follows its target; a sweep runs nearest the widened band first.
  const first = React.useRef(true);
  const lastOpen = React.useRef(open);
  React.useEffect(() => {
    const was = lastOpen.current;
    lastOpen.current = open;
    const pivot = open ?? was;
    const sweeping = was !== open;
    if (sweeping && !motionSafe) {
      animate(dim, [0.55, 1], {
        duration: durations.base,
        ease: easings.enter,
      });
    }
    for (let k = 0; k < MAX + 1; k += 1) {
      const to = k <= n ? (targets[k] ?? 1) : 1;
      if (first.current) {
        edges[k]?.jump(to);
        aimed.current[k] = to;
        continue;
      }
      if (aimed.current[k] === to) continue;
      const dist =
        pivot === null ? 0 : k <= pivot ? pivot - k : k - (pivot + 1);
      moveEdge(k, to, 0, sweeping ? Math.max(0, dist) * cascade(n) : 0);
    }
    first.current = false;
  }, [dim, edges, moveEdge, motionSafe, n, open, targets]);

  React.useEffect(
    () => () => {
      for (const a of anims.current) a?.stop();
    },
    [],
  );

  const bindFrame = React.useCallback(
    (node: HTMLDivElement | null) => {
      frameRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        width.set(node.clientWidth);
        setFrameW(node.clientWidth);
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [width],
  );

  const minFrac = () => clamp(minBand, 0, 200) / Math.max(1, frameW);

  const commitSeams = (next: number[]) => {
    const rounded = next.map(r3);
    if (rounded.every((v, k) => v === seams[k])) return;
    if (!valid(value)) setOwn({ n, seams: rounded });
    onValueChange?.(rounded);
  };

  const commitOpen = (next: number | null) => {
    setSaid(
      next === null
        ? "Versions shared again."
        : `${list[next]?.label ?? ""} fills the frame.`,
    );
    if (next === open) return;
    if (expanded === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
  };

  // A seam that hides while it has focus hands focus to the widened label.
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const focusLabel = React.useRef<number | null>(null);
  const toggle = (i: number) => {
    if (disabled) return;
    const next = open === i ? null : i;
    const active = document.activeElement;
    if (
      next !== null &&
      active?.getAttribute("role") === "separator" &&
      rootRef.current?.contains(active)
    ) {
      focusLabel.current = next;
    }
    commitOpen(next);
  };
  React.useEffect(() => {
    const i = focusLabel.current;
    if (i === null || open !== i) return;
    focusLabel.current = null;
    rootRef.current
      ?.querySelector<HTMLButtonElement>(`[data-band="${i}"] button`)
      ?.focus();
  }, [open]);

  const limits = (k: number) => {
    const all = [0, ...seams, 1];
    const m = minFrac();
    return { lo: (all[k - 1] ?? 0) + m, hi: (all[k + 1] ?? 1) - m };
  };

  const shareText = (all: number[]) =>
    list
      .slice(0, n)
      .map(
        (it, i) =>
          `${it.label} ${Math.round(((all[i + 1] ?? 1) - (all[i] ?? 0)) * 100)}%`,
      )
      .join(", ");

  const keyFor =
    (k: number) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled || open !== null) return;
      const { lo, hi } = limits(k);
      const now = seams[k - 1] ?? 0.5;
      const by = step * (event.shiftKey ? 5 : 1);
      let to: number | null = null;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = now - by;
      else if (event.key === "ArrowRight" || event.key === "ArrowUp")
        to = now + by;
      else if (event.key === "Home") to = lo;
      else if (event.key === "End") to = hi;
      if (to === null) return;
      event.preventDefault();
      const next = [...seams];
      next[k - 1] = r3(clamp(to, lo, hi));
      moveEdge(k, next[k - 1] ?? 0);
      commitSeams(next);
    };

  const onRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key === "Escape" && open !== null) {
      event.preventDefault();
      commitOpen(null);
      return;
    }
    const digit = Number(event.key);
    if (Number.isInteger(digit) && digit >= 1 && digit <= n) {
      event.preventDefault();
      toggle(digit - 1);
    }
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    for (let i = 0; i < n; i += 1) {
      const a = edges[i]?.get() ?? 0;
      const b = edges[i + 1]?.get() ?? 1;
      if (x >= a && x <= b && b - a > 0.001) {
        toggle(i);
        return;
      }
    }
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={onRootKey}
      className={cn(
        "relative h-56 w-full overflow-clip rounded-3 bg-surface-2 select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <motion.div
        ref={bindFrame}
        onDoubleClick={onDoubleClick}
        className="absolute inset-0"
        style={{ opacity: dim }}
      >
        {list.slice(0, n).map((item, i) => {
          const l = edges[i] ?? m0;
          const r = edges[i + 1] ?? m6;
          return (
            <Band
              key={i}
              id={bandId(i)}
              index={i}
              item={item}
              src={src}
              alt={alt}
              left={l}
              right={r}
              width={width}
              seamStyle={seamStyle}
              labels={labels}
              first={i === 0}
              last={i === n - 1}
              pressed={open === i}
              hidden={open !== null && open !== i}
              onToggle={() => toggle(i)}
            />
          );
        })}
      </motion.div>
      {Array.from({ length: n - 1 }, (_, s) => {
        const k = s + 1;
        const { lo, hi } = limits(k);
        const all = [0, ...seams, 1];
        return (
          <Seam
            key={k}
            index={s}
            at={edges[k] ?? m1}
            seamStyle={seamStyle}
            hidden={open !== null}
            disabled={disabled}
            committed={seams[s] ?? 0}
            lo={lo}
            hi={hi}
            text={`${list[s]?.label ?? ""} ${Math.round(((all[k] ?? 0) - (all[k - 1] ?? 0)) * 100)}%, ${list[s + 1]?.label ?? ""} ${Math.round(((all[k + 1] ?? 1) - (all[k] ?? 0)) * 100)}%`}
            controls={`${bandId(s)} ${bandId(s + 1)}`}
            motionSafe={motionSafe}
            onGrab={() => {
              anims.current[k]?.stop();
              aimed.current[k] = Number.NaN;
              grab.current = edges[k]?.get() ?? 0;
              return frameRef.current?.clientWidth ?? 720;
            }}
            onMove={(dx) => {
              const { lo: a, hi: b } = limits(k);
              // Past a neighbour it gives less and less, never more than a tenth.
              edges[k]?.set(rubberClamp(grab.current + dx, a, b, 0.1));
            }}
            onRelease={(v) => {
              const { lo: a, hi: b } = limits(k);
              const here = edges[k]?.get() ?? 0;
              const to = clamp(project(here, v, 0.99), a, b);
              moveEdge(k, to, v);
              const next = [...seams];
              next[s] = r3(to);
              commitSeams(next);
              setSaid(shareText([0, ...next, 1]));
            }}
            onKey={keyFor(k)}
          />
        );
      })}
      <span id={hintId} className="sr-only">
        Drag a seam, or Tab to it and use the arrow keys; Shift moves further.
        Double-click a band, press its label or a number key to widen it to the
        frame; Escape shares it back.
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
