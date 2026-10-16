"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Eye, EyeOff, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type WayfindingPlacement =
  "top-start" | "top-end" | "bottom-start" | "bottom-end" | "center";
export type WayfindingCorner =
  "top-start" | "top-end" | "bottom-start" | "bottom-end";
export type WayfindingDotStyle = "beacon" | "halo" | "ring" | "pip";
/** How a hint stopped being new: its tip's button, Escape, a press elsewhere, the sheet swiped away, using the feature, or Dismiss all. */
export type WayfindingDismissVia =
  "button" | "escape" | "outside" | "sheet" | "use" | "all";

export type WayfindingHint = {
  /** Unique within the hints. */
  id: string;
  /** The feature: matches `data-wayfinding="<target>"` on an element inside the interface. */
  target: string;
  /** The feature's name, the tip's heading. */
  title: string;
  /** One or two sentences on what it does. */
  body: string;
  /** Which part of the feature the dot sits on. @default "top-end" */
  placement?: WayfindingPlacement;
  /** A shortcut for it, drawn as key caps in the tip. */
  keys?: string[];
};

export type WayfindingDotsProps = {
  /** The interface the hints sit on. Mark each feature with `data-wayfinding="<target>"`. */
  children: React.ReactNode;
  /** The hints, in the order they are numbered. @default defaultWayfindingHints */
  hints?: WayfindingHint[];
  /** Controlled: ids of the hints already found. */
  found?: string[];
  /** Initial found ids when uncontrolled. @default [] */
  defaultFound?: string[];
  /** Fires from the close, the use or the Dismiss all that found a hint, with every found id. */
  onFoundChange?: (ids: string[]) => void;
  /** A dot was opened. */
  onOpen?: (hint: WayfindingHint) => void;
  /** A hint was closed and counted as found, and how. */
  onDismiss?: (hint: WayfindingHint, via: WayfindingDismissVia) => void;
  /** Dismiss all was pressed, with the ids it found. */
  onDismissAll?: (ids: string[]) => void;
  /** Controlled: whether the dots are showing. */
  shown?: boolean;
  /** Initial visibility when uncontrolled. @default true */
  defaultShown?: boolean;
  /** Fires from the key or the eye button that showed or hid the dots. */
  onShownChange?: (shown: boolean) => void;
  /** The key that shows and hides every dot while focus is inside (never while typing); null turns it off. @default "h" */
  hotkey?: string | null;
  /** The mark: a ring that leaves the dot, a swelling glow, a breathing hollow ring, or a numbered badge. @default "beacon" */
  dotStyle?: WayfindingDotStyle;
  /** How fast the dots breathe, 0.25 to 2; 1 is one breath every 3.2 s. @default 1 */
  breathSpeed?: number;
  /** The dots, the highlight frame and the counter ring. Any CSS colour; dots take its hue at a fixed lightness. @default "var(--accent-bright)" */
  accent?: string;
  /** Using a feature yourself counts as finding it. @default true */
  discoverOnUse?: boolean;
  /** The corner the discovered counter sits in. @default "bottom-end" */
  counter?: WayfindingCorner;
  /** Below this container width, in px, tips dock as a bottom sheet. @default 420 */
  sheetBelow?: number;
  /** The hint layer's accessible name. @default "Feature hints" */
  label?: string;
  /** The dots stay but cannot be opened, and the counter's buttons are off. @default false */
  disabled?: boolean;
  className?: string;
};

/**
 * Five features of a field-service dispatch board, as the demo marks them:
 * quick find, saved views, the due-today filter, crews and sharing.
 */
export const defaultWayfindingHints: WayfindingHint[] = [
  {
    id: "quick-find",
    target: "search",
    title: "Quick find",
    body: "Jump to any job, crew or address from anywhere on the board.",
    placement: "top-end",
    keys: ["/"],
  },
  {
    id: "saved-views",
    target: "views",
    title: "Saved views",
    body: "Keep a set of filters and come back to it in one press. Views are shared with your crew.",
    placement: "top-end",
  },
  {
    id: "due-today",
    target: "due",
    title: "Due today",
    body: "Only the jobs that must be finished before 18:00, soonest first.",
    placement: "top-end",
  },
  {
    id: "crews",
    target: "crews",
    title: "Crews",
    body: "Drag a job onto a crew to assign it. Their day fills in as you go.",
    placement: "top-end",
  },
  {
    id: "share",
    target: "share",
    title: "Share the board",
    body: "Send a read-only link to a customer or a subcontractor. It updates as jobs move.",
    placement: "top-end",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const EMPTY: string[] = [];
const BREATH_S = 3.2;
const TIP_W = 272;
const EDGE = 8;
const GAP = 12;
const DOT_BOX = 28;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const frac = (v: number) => v - Math.floor(v);

/** A stable 0–1 phase per hint, so the dots never breathe in unison. */
function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 997) / 997;
}

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

/** Dots take the accent's hue at a fixed lightness: pigment, the same in both themes. */
const pigmentOf = (accent: string) => `oklch(from ${accent} 0.64 0.16 h)`;
/** Deeper, for a filled button that carries light text. */
const inkOf = (accent: string) => `oklch(from ${accent} 0.53 0.17 h)`;

type Box = { l: number; t: number; w: number; h: number };
type Item = Box & { x: number; y: number };
type Geo = { w: number; h: number; items: Record<string, Item>; key: string };
type Flight = {
  id: string;
  n: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  delay: number;
};

/**
 * Where an element sits inside the root, in layout pixels: offsets summed up
 * the offsetParent chain, less whatever the ancestors between have scrolled.
 * Read from layout rather than from client rects, so a card that is still
 * scaling in, or any transform above the root, cannot skew the dots.
 */
function boxIn(el: Element, root: HTMLElement): Box | null {
  if (!(el instanceof HTMLElement)) return null;
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent: Element | null = node.offsetParent;
    if (!(parent instanceof HTMLElement)) return null;
    if (parent !== root && !root.contains(parent)) return null;
    node = parent;
  }
  if (node !== root) return null;
  for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
    x -= p.scrollLeft;
    y -= p.scrollTop;
  }
  return {
    l: Math.round(x),
    t: Math.round(y),
    w: Math.round(el.offsetWidth),
    h: Math.round(el.offsetHeight),
  };
}

function dotPoint(box: Box, placement: WayfindingPlacement) {
  // A few pixels in from the corner, like a badge pinned to the feature.
  const inset = 3;
  switch (placement) {
    case "top-start":
      return { x: box.l + inset, y: box.t + inset };
    case "bottom-start":
      return { x: box.l + inset, y: box.t + box.h - inset };
    case "bottom-end":
      return { x: box.l + box.w - inset, y: box.t + box.h - inset };
    case "center":
      return { x: box.l + box.w / 2, y: box.t + box.h / 2 };
    default:
      return { x: box.l + box.w - inset, y: box.t + inset };
  }
}

/**
 * Beside the feature if it fits: to its right, else under it, else to its
 * left, else over it, else clamped wherever it can be. Always inside the
 * root, so the tip never draws outside the component.
 */
function placeTip(
  item: Item,
  w: number,
  h: number,
  W: number,
  H: number,
): { x: number; y: number } {
  const maxX = Math.max(EDGE, W - w - EDGE);
  const maxY = Math.max(EDGE, H - h - EDGE);
  const besideY = clamp(item.y - 18, EDGE, maxY);
  const centredX = clamp(item.x - w / 2, EDGE, maxX);
  if (item.l + item.w + GAP + w <= W - EDGE) {
    return { x: item.l + item.w + GAP, y: besideY };
  }
  if (item.t + item.h + GAP + h <= H - EDGE) {
    return { x: centredX, y: item.t + item.h + GAP };
  }
  if (item.l - GAP - w >= EDGE) return { x: item.l - GAP - w, y: besideY };
  if (item.t - GAP - h >= EDGE) return { x: centredX, y: item.t - GAP - h };
  return { x: centredX, y: maxY };
}

/** In view and the tab showing: the only time the dots may breathe. */
function useLive(node: Element | null): boolean {
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let seen = false;
    let shown = !document.hidden;
    const update = () => setLive(seen && shown);
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) seen = entry.isIntersecting;
      update();
    });
    io.observe(node);
    const onVisibility = () => {
      shown = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [node]);
  return live;
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** A number whose digit rolls up as it grows, on snap. */
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
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="inline-block"
          style={{ lineHeight: "16px" }}
          initial={{ opacity: 0, y: motionSafe ? 8 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -8 : 0,
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

function Keys({ keys }: { keys: string[] }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-3">
      <span>Shortcut</span>
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-1 border border-hairline-strong bg-surface-2 px-1.5 font-mono text-[11px] text-ink-2"
        >
          {k}
        </kbd>
      ))}
    </p>
  );
}

type DotProps = {
  hint: WayfindingHint;
  order: number;
  index: number;
  count: number;
  x: number;
  y: number;
  open: boolean;
  dotStyle: WayfindingDotStyle;
  clock: MotionValue<number>;
  pigment: string;
  motionSafe: boolean;
  disabled: boolean;
  tipId: string;
  exitMode: "hide" | "found";
  bind: (id: string, node: HTMLButtonElement | null) => void;
  onPress: (hint: WayfindingHint) => void;
};

/**
 * One hint's mark. Its breath is read from the layer's shared clock with the
 * hint's own phase, so a page of dots costs one animation, and the dots never
 * pulse in step.
 */
function HintDot({
  hint,
  order,
  index,
  count,
  x,
  y,
  open,
  dotStyle,
  clock,
  pigment,
  motionSafe,
  disabled,
  tipId,
  exitMode,
  bind,
  onPress,
}: DotProps) {
  const offset = phaseOf(hint.id);
  const phase = useTransform(clock, (c) => frac(c + offset));
  // A sawtooth for the beacon (a ring leaves and fades), a sine for the rest.
  const ringScale = useTransform(phase, (p) => {
    if (!motionSafe) {
      return dotStyle === "beacon" ? 1.7 : dotStyle === "halo" ? 1.3 : 1;
    }
    const s = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    if (dotStyle === "beacon") return r3(1 + p * 1.5);
    if (dotStyle === "halo") return r3(1 + s * 0.45);
    if (dotStyle === "ring") return r3(0.84 + s * 0.24);
    return r3(1 + s * 0.06);
  });
  const ringOpacity = useTransform(phase, (p) => {
    if (!motionSafe) {
      return dotStyle === "beacon" ? 0.3 : dotStyle === "halo" ? 0.3 : 1;
    }
    const s = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
    if (dotStyle === "beacon") return r3(0.6 * (1 - p));
    if (dotStyle === "halo") return r3(0.16 + s * 0.24);
    if (dotStyle === "ring") return r3(0.7 + s * 0.3);
    return r3(0.18 + s * 0.22);
  });

  // One stable ref for the dot's whole life: motion binds it once.
  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => bind(hint.id, node),
    [bind, hint.id],
  );

  return (
    <motion.button
      ref={setRef}
      type="button"
      data-wayfinding-dot={hint.id}
      aria-label={`Hint ${order}: ${hint.title}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-controls={open ? `${tipId}-${order}` : undefined}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onPress(hint);
      }}
      custom={exitMode}
      initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit="leave"
      variants={{
        leave: (mode: "hide" | "found") =>
          mode === "hide"
            ? {
                opacity: 0,
                scale: motionSafe ? 0.6 : 1,
                transition: { duration: durations.base, ease: easings.exit },
              }
            : { opacity: 0, transition: { duration: 0 } },
      }}
      transition={{
        opacity: {
          duration: durations.base,
          ease: easings.enter,
          delay: motionSafe ? index * cascade(count) : 0,
        },
        scale: motionSafe
          ? { ...springs.snap, delay: index * cascade(count) }
          : { duration: 0 },
      }}
      style={{ left: x - DOT_BOX / 2, top: y - DOT_BOX / 2 }}
      className={cn(
        "group/wayfinding-dots-dot pointer-events-auto absolute flex size-7 items-center justify-center rounded-full",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        FOCUS,
      )}
    >
      <motion.span
        aria-hidden
        className="relative flex items-center justify-center"
        animate={{ scale: open ? 1.15 : 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        {dotStyle === "pip" ? (
          <>
            {open ? (
              <span
                className="absolute size-[26px] rounded-full opacity-25"
                style={{ backgroundColor: pigment }}
              />
            ) : (
              <motion.span
                className="absolute size-[26px] rounded-full"
                style={{ backgroundColor: pigment, opacity: ringOpacity }}
              />
            )}
            <motion.span
              className="relative flex size-[18px] items-center justify-center rounded-full font-mono text-[10px] font-semibold text-primary-foreground shadow-[0_1px_3px_color-mix(in_oklab,black_22%,transparent)] transition-[scale] duration-150 group-hover/wayfinding-dots-dot:scale-110"
              style={{ backgroundColor: pigment, scale: open ? 1 : ringScale }}
            >
              {order}
            </motion.span>
          </>
        ) : (
          <>
            {open ? (
              // Opened: the breath stops and the mark holds a quiet halo.
              <span
                className={cn(
                  "absolute rounded-full",
                  dotStyle === "ring"
                    ? "size-4 scale-110 border-2"
                    : dotStyle === "halo"
                      ? "size-5 scale-125 opacity-30"
                      : "size-2.5 scale-[1.9] border-[1.5px] opacity-45",
                )}
                style={
                  dotStyle === "halo"
                    ? { backgroundColor: pigment }
                    : { borderColor: pigment }
                }
              />
            ) : dotStyle === "halo" ? (
              <motion.span
                className="absolute size-5 rounded-full"
                style={{
                  backgroundColor: pigment,
                  scale: ringScale,
                  opacity: ringOpacity,
                }}
              />
            ) : (
              <motion.span
                className={cn(
                  "absolute rounded-full",
                  dotStyle === "ring"
                    ? "size-4 border-2"
                    : "size-2.5 border-[1.5px]",
                )}
                style={{
                  borderColor: pigment,
                  scale: ringScale,
                  opacity: ringOpacity,
                }}
              />
            )}
            <span
              className={cn(
                "relative rounded-full transition-[scale] duration-150 group-hover/wayfinding-dots-dot:scale-125",
                dotStyle === "ring"
                  ? "size-1.5"
                  : "size-2.5 shadow-[0_0_0_2px_var(--card)]",
              )}
              style={{ backgroundColor: pigment }}
            />
          </>
        )}
      </motion.span>
    </motion.button>
  );
}

/** A found dot on its way to the counter, along an arc that bows upward. */
function Flyer({
  flight,
  pigment,
  onLanded,
}: {
  flight: Flight;
  pigment: string;
  onLanded: (id: string, n: number) => void;
}) {
  const p = useMotionValue(0);
  const landed = React.useRef(onLanded);
  React.useEffect(() => {
    landed.current = onLanded;
  });
  React.useEffect(() => {
    // A plain number animated into the value: the flyer has only just
    // mounted, and the landing is reported from onComplete, which a stop
    // (StrictMode's rehearsal, an unmount) never calls.
    const controls = animate(p.get(), 1, {
      ...springs.glide,
      delay: flight.delay,
      onUpdate: (v) => p.set(v),
      onComplete: () => landed.current(flight.id, flight.n),
    });
    return () => controls.stop();
  }, [flight, p]);

  const cx = (flight.x + flight.tx) / 2;
  const cy = Math.max(
    EDGE,
    Math.min(flight.y, flight.ty) -
      0.28 * Math.hypot(flight.tx - flight.x, flight.ty - flight.y),
  );
  const at = (a: number, c: number, b: number, t: number) => {
    const k = clamp(t, 0, 1);
    return (1 - k) * (1 - k) * a + 2 * (1 - k) * k * c + k * k * b;
  };
  const x = useTransform(p, (t) => r1(at(flight.x, cx, flight.tx, t) - 5));
  const y = useTransform(p, (t) => r1(at(flight.y, cy, flight.ty, t) - 5));
  const scale = useTransform(p, (t) => r3(1 - 0.65 * clamp(t, 0, 1)));
  const opacity = useTransform(p, (t) => r3(clamp((1 - t) / 0.18, 0, 1)));

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 size-2.5 rounded-full"
      style={{ x, y, scale, opacity, backgroundColor: pigment }}
    />
  );
}

type TipBodyProps = {
  hint: WayfindingHint;
  order: number;
  total: number;
  hasNext: boolean;
  ink: string;
  titleId: string;
  bodyId: string;
  onGotIt: () => void;
  onNext: () => void;
  bindGotIt: (node: HTMLButtonElement | null) => void;
};

function TipBody({
  hint,
  order,
  total,
  hasNext,
  ink,
  titleId,
  bodyId,
  onGotIt,
  onNext,
  bindGotIt,
}: TipBodyProps) {
  return (
    <>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Hint {order} of {total}
      </p>
      <h3
        id={titleId}
        className="mt-1 text-[13px] leading-5 font-semibold text-foreground"
      >
        {hint.title}
      </h3>
      <p id={bodyId} className="mt-0.5 text-[13px] leading-5 text-ink-2">
        {hint.body}
      </p>
      {hint.keys && hint.keys.length > 0 ? <Keys keys={hint.keys} /> : null}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {hasNext ? (
          <button
            type="button"
            onClick={onNext}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            Next hint
          </button>
        ) : null}
        <button
          ref={bindGotIt}
          type="button"
          onClick={onGotIt}
          className={cn(
            "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium text-primary-foreground transition-[filter] hover:brightness-110",
            FOCUS,
          )}
          style={{ backgroundColor: ink }}
        >
          Got it
        </button>
      </div>
    </>
  );
}

/**
 * The tip beside the feature. It unfolds out of the dot: a clip circle grows
 * from the dot's centre to the card's far corner while the card scales up
 * about the same point on snap; closing folds it back into the dot.
 */
function Tip({
  item,
  W,
  H,
  motionSafe,
  tipId,
  titleId,
  bodyId,
  bindNode,
  ...body
}: Omit<TipBodyProps, "bindGotIt"> & {
  item: Item;
  W: number;
  H: number;
  motionSafe: boolean;
  tipId: string;
  bindNode: (node: HTMLDivElement | null) => void;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const setRef = React.useCallback(
    (n: HTMLDivElement | null) => {
      setNode(n);
      bindNode(n);
    },
    [bindNode],
  );
  const [height, setHeight] = React.useState<number | null>(null);
  const [gotIt, setGotIt] = React.useState<HTMLButtonElement | null>(null);
  const w = Math.max(160, Math.min(TIP_W, W - EDGE * 2));
  const place = height === null ? null : placeTip(item, w, height, W, H);
  const ox = place ? Math.round(item.x - place.x) : 0;
  const oy = place ? Math.round(item.y - place.y) : 0;
  const reach =
    place && height !== null
      ? Math.ceil(
          Math.max(
            Math.hypot(ox, oy),
            Math.hypot(w - ox, oy),
            Math.hypot(ox, height - oy),
            Math.hypot(w - ox, height - oy),
          ),
        )
      : 0;
  const clip = useMotionValue<string>(
    motionSafe ? "circle(0px at 0px 0px)" : "none",
  );
  const bloom = React.useRef(motionSafe ? 0 : 1);
  const geometry = React.useRef({ ox, oy, reach });
  React.useLayoutEffect(() => {
    geometry.current = { ox, oy, reach };
  }, [ox, oy, reach]);
  const paint = React.useCallback(
    (b: number) => {
      bloom.current = b;
      const g = geometry.current;
      clip.set(
        b >= 0.999
          ? "none"
          : `circle(${r1(b * g.reach)}px at ${g.ox}px ${g.oy}px)`,
      );
    },
    [clip],
  );

  React.useLayoutEffect(() => {
    if (!node) return;
    const measure = () => setHeight(Math.round(node.offsetHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  // The bloom starts once the tip knows where it stands.
  const placed = place !== null;
  React.useEffect(() => {
    if (!placed || !isPresent) return;
    if (!motionSafe) {
      paint(1);
      return;
    }
    const controls = animate(bloom.current, 1, {
      duration: durations.slow,
      ease: easings.enter,
      onUpdate: paint,
    });
    return () => controls.stop();
  }, [placed, isPresent, motionSafe, paint]);

  React.useEffect(() => {
    if (isPresent) return;
    const controls = animate(bloom.current, 0, {
      duration: motionSafe ? durations.base * 0.6 : durations.fast,
      ease: easings.exit,
      onUpdate: motionSafe ? paint : undefined,
      onComplete: () => safeToRemove?.(),
    });
    return () => controls.stop();
  }, [isPresent, motionSafe, paint, safeToRemove]);

  React.useEffect(() => {
    if (gotIt && placed && isPresent) gotIt.focus({ preventScroll: true });
  }, [gotIt, placed, isPresent]);

  return (
    <motion.div
      ref={setRef}
      id={tipId}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      initial={{ opacity: 0, scale: motionSafe ? 0.92 : 1 }}
      animate={
        !place
          ? { opacity: 0, scale: motionSafe ? 0.92 : 1 }
          : isPresent
            ? { opacity: 1, scale: 1 }
            : { opacity: 0, scale: motionSafe ? 0.96 : 1 }
      }
      transition={
        isPresent
          ? {
              opacity: { duration: durations.fast, ease: easings.enter },
              scale: motionSafe ? springs.snap : { duration: 0 },
            }
          : exitFor(durations.base)
      }
      className="pointer-events-auto absolute top-0 left-0 z-20 rounded-3 border border-hairline-strong bg-popover p-3 text-left shadow-[0_10px_28px_color-mix(in_oklab,black_20%,transparent)]"
      style={{
        width: w,
        x: place ? place.x : 0,
        y: place ? place.y : 0,
        visibility: place ? "visible" : "hidden",
        transformOrigin: `${ox}px ${oy}px`,
        clipPath: clip,
      }}
    >
      <TipBody
        {...body}
        titleId={titleId}
        bodyId={bodyId}
        bindGotIt={setGotIt}
      />
    </motion.div>
  );
}

/**
 * The narrow form of the tip: a sheet docked at the foot of the component.
 * It rises on glide, follows a downward drag 1:1 (rubber-banded upward), and
 * a throw past 40% of its height — or a flick that would carry it there —
 * closes it; anything less springs back with the release velocity.
 */
function Sheet({
  motionSafe,
  tipId,
  titleId,
  bodyId,
  onSwipe,
  bindNode,
  ...body
}: Omit<TipBodyProps, "bindGotIt"> & {
  motionSafe: boolean;
  tipId: string;
  onSwipe: () => void;
  bindNode: (node: HTMLDivElement | null) => void;
}) {
  const [isPresent, safeToRemove] = usePresence();
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const setRef = React.useCallback(
    (n: HTMLDivElement | null) => {
      setNode(n);
      bindNode(n);
    },
    [bindNode],
  );
  const [gotIt, setGotIt] = React.useState<HTMLButtonElement | null>(null);
  const y = useMotionValue(0);
  const opacity = useMotionValue(motionSafe ? 1 : 0);
  const height = React.useRef(0);
  const swiped = React.useRef(false);
  const settle = React.useRef<{ stop: () => void } | null>(null);
  React.useEffect(() => () => settle.current?.stop(), []);

  React.useLayoutEffect(() => {
    if (!node) return;
    height.current = node.offsetHeight;
    if (!motionSafe) {
      y.jump(0);
      return;
    }
    y.jump(height.current);
  }, [node, motionSafe, y]);

  React.useEffect(() => {
    if (!node || !isPresent) return;
    // Plain numbers written into the values: the sheet has just mounted.
    const controls = motionSafe
      ? animate(y.get(), 0, {
          ...springs.glide,
          onUpdate: (v) => y.set(r1(v)),
        })
      : animate(opacity.get(), 1, {
          duration: durations.fast,
          onUpdate: (v) => opacity.set(r3(v)),
        });
    return () => controls.stop();
  }, [node, isPresent, motionSafe, y, opacity]);

  React.useEffect(() => {
    if (isPresent) return;
    const controls = motionSafe
      ? animate(y.get(), Math.max(height.current, 1), {
          duration: durations.base,
          ease: easings.exit,
          onUpdate: (v) => y.set(r1(v)),
          onComplete: () => safeToRemove?.(),
        })
      : animate(opacity.get(), 0, {
          duration: durations.fast,
          onUpdate: (v) => opacity.set(r3(v)),
          onComplete: () => safeToRemove?.(),
        });
    return () => controls.stop();
  }, [isPresent, motionSafe, y, opacity, safeToRemove]);

  React.useEffect(() => {
    if (gotIt && isPresent) gotIt.focus({ preventScroll: true });
  }, [gotIt, isPresent]);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: !isPresent,
    onStart: () => settle.current?.stop(),
    onMove: ({ offset }) => {
      const h = Math.max(1, height.current);
      y.set(r1(offset.y < 0 ? rubberband(offset.y, h) : offset.y));
    },
    onEnd: ({ velocity }) => {
      const h = Math.max(1, height.current);
      const landing = project(y.get(), velocity.y, 0.99);
      if (landing > h * 0.4 && !swiped.current) {
        swiped.current = true;
        onSwipe();
        return;
      }
      settle.current?.stop();
      settle.current = animate(y.get(), 0, {
        ...springs.glide,
        velocity: velocity.y,
        onUpdate: (v) => y.set(r1(v)),
      });
    },
    onCancel: () => {
      settle.current?.stop();
      settle.current = animate(y.get(), 0, {
        ...springs.glide,
        onUpdate: (v) => y.set(r1(v)),
      });
    },
  });

  return (
    <motion.div
      ref={setRef}
      id={tipId}
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      {...drag}
      onPointerDown={(event) => {
        // The whole sheet can be pulled down, but a press on one of its
        // buttons stays a press.
        if (event.target instanceof Element && event.target.closest("button"))
          return;
        drag.onPointerDown(event);
      }}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 max-h-[72%] touch-pan-x overflow-y-auto overscroll-contain rounded-t-4 border-t border-hairline-strong bg-popover px-4 pb-4 text-left shadow-[0_-10px_28px_color-mix(in_oklab,black_18%,transparent)] select-none"
      style={{ y, opacity }}
    >
      <div className="-mx-4 flex h-6 cursor-grab items-center justify-center active:cursor-grabbing">
        <span aria-hidden className="h-1 w-9 rounded-full bg-hairline-strong" />
      </div>
      <button
        type="button"
        aria-label="Close hint"
        onClick={body.onGotIt}
        className={cn(
          "absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
          FOCUS,
        )}
      >
        <X aria-hidden className="size-4" />
      </button>
      <TipBody
        {...body}
        titleId={titleId}
        bodyId={bodyId}
        bindGotIt={setGotIt}
      />
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The layer                                */
/* ----------------------------------------------------------------------- */

const CORNER: Record<WayfindingCorner, string> = {
  "top-start": "top-3 left-3",
  "top-end": "top-3 right-3",
  "bottom-start": "bottom-3 left-3",
  "bottom-end": "bottom-3 right-3",
};

/**
 * Hint dots on the parts of a real interface nobody has opened yet. The
 * interface is the children; any element inside it with
 * `data-wayfinding="<target>"` is a feature, and each hint puts a small dot
 * on its corner. Dots breathe slowly from one shared clock, each with its own
 * phase. Pressing one flicks it up, frames the feature, and unfolds the tip
 * out of the dot — a clip circle growing from the dot's centre while the card
 * scales about it on snap. Closing folds the tip back, and the dot travels on
 * glide along an arc into the corner counter, whose ring fills, digit rolls
 * on snap and pill recoils as it lands. Using a feature yourself counts too.
 *
 * Dots are buttons in reading order; H (never while typing) shows or hides
 * them all, Escape closes a tip where focus is, and focus moves on to the next
 * dot. Under 420px of container the tip becomes a bottom sheet you can swipe
 * away. Once everything is found the counter says so, then fades out. Under
 * reduced motion nothing breathes or travels: tips and dots cross-fade, and
 * the count still updates.
 */
export function WayfindingDots({
  children,
  hints = defaultWayfindingHints,
  found,
  defaultFound = EMPTY,
  onFoundChange,
  onOpen,
  onDismiss,
  onDismissAll,
  shown,
  defaultShown = true,
  onShownChange,
  hotkey = "h",
  dotStyle = "beacon",
  breathSpeed = 1,
  accent = "var(--accent-bright)",
  discoverOnUse = true,
  counter = "bottom-end",
  sheetBelow = 420,
  label = "Feature hints",
  disabled = false,
  className,
}: WayfindingDotsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const tipId = `${uid}-tip`;
  const titleId = `${uid}-tip-title`;
  const bodyId = `${uid}-tip-body`;
  const pigment = pigmentOf(accent);
  const ink = inkOf(accent);

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const live = useLive(root);
  const layerRef = React.useRef<HTMLDivElement | null>(null);
  const ringRef = React.useRef<SVGSVGElement | null>(null);
  const eyeRef = React.useRef<HTMLButtonElement | null>(null);
  const tipNode = React.useRef<HTMLDivElement | null>(null);
  const dotNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const focusReq = React.useRef<string | null>(null);
  const flightN = React.useRef(0);

  const [ownFound, setOwnFound] = React.useState<string[]>(() => [
    ...defaultFound,
  ]);
  const foundList = found ?? ownFound;
  const foundSet = React.useMemo(() => new Set(foundList), [foundList]);
  const [ownShown, setOwnShown] = React.useState(defaultShown);
  const isShown = shown ?? ownShown;
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [flying, setFlying] = React.useState<Flight[]>([]);
  const [geo, setGeo] = React.useState<Geo | null>(null);
  const [exitMode, setExitMode] = React.useState<"hide" | "found">("found");
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ---------------------------- measurement ----------------------------- */

  const hintsKey = hints
    .map((h) => `${h.id}:${h.target}:${h.placement ?? ""}`)
    .join("|");
  const hintsRef = React.useRef(hints);
  React.useEffect(() => {
    hintsRef.current = hints;
  });

  React.useEffect(() => {
    if (!root) return;
    let frame = 0;
    const measure = () => {
      const items: Record<string, Item> = {};
      for (const hint of hintsRef.current) {
        const el = root.querySelector(
          `[data-wayfinding="${CSS.escape(hint.target)}"]`,
        );
        const box = el ? boxIn(el, root) : null;
        if (!box) continue;
        const p = dotPoint(box, hint.placement ?? "top-end");
        items[hint.id] = {
          ...box,
          x: Math.round(clamp(p.x, EDGE, root.clientWidth - EDGE)),
          y: Math.round(clamp(p.y, EDGE, root.clientHeight - EDGE)),
        };
      }
      const w = Math.round(root.clientWidth);
      const h = Math.round(root.clientHeight);
      const key = JSON.stringify([w, h, items]);
      setGeo((prev) => (prev?.key === key ? prev : { w, h, items, key }));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    for (const hint of hintsRef.current) {
      const el = root.querySelector(
        `[data-wayfinding="${CSS.escape(hint.target)}"]`,
      );
      if (el) ro.observe(el);
    }
    schedule();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [root, hintsKey]);

  const narrow = geo !== null && geo.w < sheetBelow;

  /* ------------------------------- counts ------------------------------- */

  const total = hints.length;
  const flyingIds = new Set(flying.map((f) => f.id));
  const foundCount = hints.filter((h) => foundSet.has(h.id)).length;
  const landed = hints.filter(
    (h) => foundSet.has(h.id) && !flyingIds.has(h.id),
  ).length;
  const allFound = total > 0 && foundCount === total;
  const allLanded = allFound && flying.length === 0;

  const [retired, setRetired] = React.useState(false);
  if (retired && !allLanded) setRetired(false);
  React.useEffect(() => {
    if (!allLanded) return;
    const t = window.setTimeout(() => setRetired(true), 1400);
    return () => window.clearTimeout(t);
  }, [allLanded]);

  const unfound = hints.filter((h) => !foundSet.has(h.id));
  const ordered = unfound
    .filter((h) => geo?.items[h.id])
    .sort((a, b) => {
      const ga = geo?.items[a.id];
      const gb = geo?.items[b.id];
      if (!ga || !gb) return 0;
      const ra = Math.round(ga.y / 24);
      const rb = Math.round(gb.y / 24);
      return ra - rb || ga.x - gb.x;
    });
  const openHint = openId
    ? hints.find((h) => h.id === openId && !foundSet.has(h.id))
    : undefined;
  const openItem = openHint ? geo?.items[openHint.id] : undefined;

  /* ------------------------------ breathing ----------------------------- */

  const clock = useMotionValue(0);
  const speed = clamp(breathSpeed, 0.25, 2);
  const breathing =
    live && motionSafe && isShown && !disabled && ordered.length > 0;
  React.useEffect(() => {
    if (!breathing) return;
    const from = clock.get();
    const controls = animate(from, from + 1, {
      duration: BREATH_S / speed,
      ease: "linear",
      repeat: Infinity,
      onUpdate: (v) => clock.set(v),
    });
    return () => controls.stop();
  }, [breathing, speed, clock]);

  /* ------------------------------- counter ------------------------------ */

  const pillScale = useMotionValue(1);
  const seenLanded = React.useRef(landed);
  React.useEffect(() => {
    const grew = landed > seenLanded.current;
    seenLanded.current = landed;
    if (!grew || !motionSafe) return;
    // The landing: the pill swells and settles on recoil, two small bounces.
    pillScale.jump(1.08);
    const controls = animate(1.08, 1, {
      ...springs.recoil,
      onUpdate: (v) => pillScale.set(r3(v)),
    });
    return () => controls.stop();
  }, [landed, motionSafe, pillScale]);

  /* ------------------------------- actions ------------------------------ */

  const writeFound = (next: string[]) => {
    if (found === undefined) setOwnFound(next);
    onFoundChange?.(next);
  };

  const counterPoint = () => {
    const ring = ringRef.current;
    if (!root || !ring) return null;
    const rb = root.getBoundingClientRect();
    const b = ring.getBoundingClientRect();
    const sx = rb.width > 0 ? root.clientWidth / rb.width : 1;
    const sy = rb.height > 0 ? root.clientHeight / rb.height : 1;
    return {
      x: Math.round((b.left + b.width / 2 - rb.left) * sx),
      y: Math.round((b.top + b.height / 2 - rb.top) * sy),
    };
  };

  /** Marks hints found and sends their dots to the counter. */
  const markFound = (
    list: WayfindingHint[],
    via: WayfindingDismissVia,
    delay = 0,
  ) => {
    const fresh = list.filter((h) => !foundSet.has(h.id));
    if (fresh.length === 0) return;
    writeFound([...foundList, ...fresh.map((h) => h.id)]);
    setExitMode("found");
    const to = counterPoint();
    if (motionSafe && isShown && to) {
      const step = cascade(fresh.length);
      const flights: Flight[] = [];
      fresh.forEach((h, i) => {
        const g = geo?.items[h.id];
        if (!g) return;
        flightN.current += 1;
        flights.push({
          id: h.id,
          n: flightN.current,
          x: g.x,
          y: g.y,
          tx: to.x,
          ty: to.y,
          delay: delay + i * step,
        });
      });
      if (flights.length > 0) {
        const ids = new Set(flights.map((f) => f.id));
        setFlying((f) => [...f.filter((x) => !ids.has(x.id)), ...flights]);
      }
    }
    if (via !== "all") {
      for (const h of fresh) onDismiss?.(h, via);
    }
    const count = foundCount + fresh.length;
    say(
      count === total
        ? `${fresh.length === 1 ? `${fresh[0]?.title} found. ` : ""}All ${total} found.`
        : fresh.length === 1
          ? `${fresh[0]?.title} found. ${count} of ${total}.`
          : `${count} of ${total} found.`,
    );
  };

  const nextAfter = (id: string) => {
    if (ordered.length === 0) return undefined;
    const at = ordered.findIndex((h) => h.id === id);
    for (let k = 1; k <= ordered.length; k += 1) {
      const h = ordered[(Math.max(at, 0) + k) % ordered.length];
      if (h && h.id !== id) return h;
    }
    return undefined;
  };

  const openDot = (hint: WayfindingHint) => {
    if (disabled) return;
    setOpenId(hint.id);
    onOpen?.(hint);
  };

  const closeOpen = (
    via: WayfindingDismissVia,
    then: "next" | "focus" | "none",
  ) => {
    if (!openHint) return;
    const after = nextAfter(openHint.id);
    setOpenId(null);
    // The flight leaves once the tip has folded back into the dot.
    markFound([openHint], via, motionSafe ? 0.12 : 0);
    if (then === "next" && after) {
      setOpenId(after.id);
      onOpen?.(after);
    } else if (then === "focus") {
      focusReq.current = after ? after.id : "layer";
    }
  };

  const pressDot = (hint: WayfindingHint) => {
    if (openId === hint.id) closeOpen("button", "focus");
    else openDot(hint);
  };

  const setShownTo = (next: boolean) => {
    if (shown === undefined) setOwnShown(next);
    onShownChange?.(next);
    setExitMode("hide");
    if (!next) {
      setOpenId(null);
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset.wayfindingDot) {
        focusReq.current = "eye";
      }
    }
    say(
      next
        ? `Hints shown. ${total - foundCount} left to find.`
        : `Hints hidden.${hotkey ? ` Press ${hotkey.toUpperCase()} to show them.` : ""}`,
    );
  };

  const dismissAll = () => {
    if (disabled) return;
    const rest = hints.filter((h) => !foundSet.has(h.id));
    if (rest.length === 0) return;
    setOpenId(null);
    const sorted = [
      ...ordered.filter((h) => rest.includes(h)),
      ...rest.filter((h) => !ordered.includes(h)),
    ];
    markFound(sorted, "all");
    onDismissAll?.(rest.map((h) => h.id));
    focusReq.current = "layer";
  };

  const landedOne = React.useCallback((id: string, n: number) => {
    setFlying((f) => f.filter((x) => !(x.id === id && x.n === n)));
  }, []);

  // Flights whose hint is no longer found (a reset) are dropped at once.
  if (flying.some((f) => !foundSet.has(f.id))) {
    setFlying(flying.filter((f) => foundSet.has(f.id)));
  }

  // Focus moves on once the render that removed its old home has committed.
  React.useEffect(() => {
    const want = focusReq.current;
    if (!want) return;
    focusReq.current = null;
    const node =
      want === "eye"
        ? eyeRef.current
        : want === "layer"
          ? layerRef.current
          : (dotNodes.current.get(want) ?? layerRef.current);
    if (node?.isConnected) node.focus({ preventScroll: true });
  });

  // A press anywhere outside the open tip (and its dot) closes it.
  const closeRef = React.useRef(closeOpen);
  React.useEffect(() => {
    closeRef.current = closeOpen;
  });
  React.useEffect(() => {
    if (!openId) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tipNode.current?.contains(target)) return;
      if (dotNodes.current.get(openId)?.contains(target)) return;
      closeRef.current("outside", "none");
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openId]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && openHint) {
      // Ours: the tip closes, and nothing behind it.
      event.preventDefault();
      closeOpen("escape", "focus");
      return;
    }
    if (!hotkey || disabled || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.toLowerCase() !== hotkey.toLowerCase()) return;
    if (isEditable(event.target)) return;
    event.preventDefault();
    setShownTo(!isShown);
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!discoverOnUse || disabled) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (layerRef.current?.contains(target)) return;
    const el = target.closest("[data-wayfinding]");
    if (!el || !root?.contains(el)) return;
    const key = el.getAttribute("data-wayfinding");
    const hint = hints.find((h) => h.target === key && !foundSet.has(h.id));
    if (!hint) return;
    if (openId === hint.id) setOpenId(null);
    markFound([hint], "use");
  };

  const bindDot = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) dotNodes.current.set(id, node);
      else dotNodes.current.delete(id);
    },
    [],
  );
  const bindTip = React.useCallback((node: HTMLDivElement | null) => {
    if (node) tipNode.current = node;
  }, []);

  /* ------------------------------- render ------------------------------- */

  const orderOf = (id: string) => hints.findIndex((h) => h.id === id) + 1;
  const frame =
    openItem && geo
      ? {
          l: Math.max(1, openItem.l - 4),
          t: Math.max(1, openItem.t - 4),
          r: Math.min(geo.w - 1, openItem.l + openItem.w + 4),
          b: Math.min(geo.h - 1, openItem.t + openItem.h + 4),
        }
      : null;
  const openOrder = openHint ? orderOf(openHint.id) : 0;
  const hasNext = openHint ? ordered.some((h) => h.id !== openHint.id) : false;
  const progress = total > 0 ? landed / total : 0;

  return (
    <div
      ref={setRoot}
      onKeyDown={onKeyDown}
      onClickCapture={onClickCapture}
      className={cn("relative isolate w-full overflow-clip", className)}
    >
      {children}

      <div
        ref={layerRef}
        role="group"
        aria-label={`${label}, ${landed} of ${total} found`}
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 z-10 outline-none"
      >
        <AnimatePresence>
          {frame && openHint ? (
            <motion.div
              key={openHint.id}
              aria-hidden
              className="absolute rounded-3"
              initial={{ opacity: 0, scale: motionSafe ? 0.98 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                opacity: { duration: durations.base, ease: easings.enter },
                scale: motionSafe ? springs.snap : { duration: 0 },
              }}
              style={{
                left: frame.l,
                top: frame.t,
                width: frame.r - frame.l,
                height: frame.b - frame.t,
                boxShadow: `0 0 0 2px ${pigment}`,
                backgroundColor: `color-mix(in oklab, ${pigment} 7%, transparent)`,
              }}
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence custom={exitMode}>
          {isShown && geo
            ? ordered.map((hint, index) => {
                const g = geo.items[hint.id];
                if (!g) return null;
                return (
                  <HintDot
                    key={hint.id}
                    hint={hint}
                    order={orderOf(hint.id)}
                    index={index}
                    count={ordered.length}
                    x={g.x}
                    y={g.y}
                    open={openId === hint.id}
                    dotStyle={dotStyle}
                    clock={clock}
                    pigment={pigment}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    tipId={tipId}
                    exitMode={exitMode}
                    bind={bindDot}
                    onPress={pressDot}
                  />
                );
              })
            : null}
        </AnimatePresence>

        {flying.map((f) => (
          <Flyer
            key={`${f.id}-${f.n}`}
            flight={f}
            pigment={pigment}
            onLanded={landedOne}
          />
        ))}

        <AnimatePresence>
          {!retired && total > 0 ? (
            <motion.div
              key="counter"
              className={cn(
                "pointer-events-auto absolute z-10 flex h-8 items-center gap-1 rounded-full border border-hairline-strong bg-popover pr-1 pl-2 text-[11px] text-ink-2 shadow-[0_4px_14px_color-mix(in_oklab,black_14%,transparent)]",
                CORNER[counter] ?? CORNER["bottom-end"],
              )}
              style={{ scale: pillScale }}
              initial={false}
              animate={{ opacity: 1 }}
              exit={{
                opacity: 0,
                transition: { duration: durations.slow, ease: easings.exit },
              }}
            >
              <svg
                ref={ringRef}
                aria-hidden
                viewBox="0 0 16 16"
                className="size-4 shrink-0 -rotate-90"
              >
                <circle
                  cx={8}
                  cy={8}
                  r={6}
                  fill="none"
                  strokeWidth={2}
                  className="stroke-hairline-strong"
                />
                <motion.circle
                  cx={8}
                  cy={8}
                  r={6}
                  fill="none"
                  strokeWidth={2}
                  strokeLinecap="round"
                  style={{ stroke: pigment }}
                  initial={false}
                  animate={{
                    pathLength: r3(progress),
                    opacity: progress > 0 ? 1 : 0,
                  }}
                  transition={
                    motionSafe
                      ? {
                          pathLength: springs.glide,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                />
              </svg>
              {allLanded ? (
                <span className="flex items-center gap-1 pr-2 font-medium text-foreground">
                  <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
                    <motion.path
                      d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                      fill="none"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ stroke: pigment }}
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                  {narrow ? `${total}/${total}` : `All ${total} found`}
                </span>
              ) : (
                <>
                  <span className="flex items-center pr-1 tabular-nums">
                    <span className="font-medium text-foreground">
                      <Rolling value={landed} motionSafe={motionSafe} />
                    </span>
                    <span className={narrow ? undefined : "ml-1"}>
                      {narrow ? `/${total}` : `of ${total} found`}
                    </span>
                  </span>
                  <button
                    ref={eyeRef}
                    type="button"
                    aria-pressed={!isShown}
                    aria-label={
                      hotkey
                        ? `Hide hints (${hotkey.toUpperCase()})`
                        : "Hide hints"
                    }
                    title={isShown ? "Hide hints" : "Show hints"}
                    aria-disabled={disabled || undefined}
                    onClick={() => {
                      if (!disabled) setShownTo(!isShown);
                    }}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40",
                      FOCUS,
                    )}
                  >
                    {isShown ? (
                      <Eye aria-hidden className="size-3.5" />
                    ) : (
                      <EyeOff aria-hidden className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label="Dismiss all hints"
                    title="Dismiss all hints"
                    aria-disabled={disabled || undefined}
                    onClick={dismissAll}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40",
                      FOCUS,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {openHint && openItem && geo && !narrow ? (
            <Tip
              key={`tip-${openHint.id}`}
              hint={openHint}
              order={openOrder}
              total={total}
              hasNext={hasNext}
              ink={ink}
              tipId={`${tipId}-${openOrder}`}
              titleId={`${titleId}-${openOrder}`}
              bodyId={`${bodyId}-${openOrder}`}
              motionSafe={motionSafe}
              bindNode={bindTip}
              onGotIt={() => closeOpen("button", "focus")}
              onNext={() => closeOpen("button", "next")}
              item={openItem}
              W={geo.w}
              H={geo.h}
            />
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {openHint && openItem && narrow ? (
            <Sheet
              key={`sheet-${openHint.id}`}
              hint={openHint}
              order={openOrder}
              total={total}
              hasNext={hasNext}
              ink={ink}
              tipId={`${tipId}-${openOrder}`}
              titleId={`${titleId}-${openOrder}`}
              bodyId={`${bodyId}-${openOrder}`}
              motionSafe={motionSafe}
              bindNode={bindTip}
              onGotIt={() => closeOpen("button", "focus")}
              onNext={() => closeOpen("button", "next")}
              onSwipe={() => closeOpen("sheet", "focus")}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
