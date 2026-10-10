"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type LogoParadeItem = {
  /** A stable key for the mark. */
  id: string;
  /** The mark's name, read by assistive technology instead of the drawing. */
  name: string;
  /**
   * The mark: an SVG or any inline element. It paints with `currentColor`
   * (muted ink at rest, the foreground when looked at) and may use
   * `var(--mark-color)` for an accent that turns to `color` when looked at.
   */
  mark: React.ReactNode;
  /** The accent the mark takes when it is looked at. @default "var(--foreground)" */
  color?: string;
  /** Where the mark links to; without it (and without `onSelect`) the mark is an image. */
  href?: string;
};

export type LogoParadeSize = "sm" | "md" | "lg";

export type LogoParadeProps = {
  /** The marks, each shown once per set; the first row is the accessible list. */
  items: readonly LogoParadeItem[];
  /** Cruising speed in px per second. @default 40 */
  speed?: number;
  /** Space between marks in px. @default 48 */
  gap?: number;
  /** How many rows, 1 to 3; each further row runs the other way, half a set along. @default 2 */
  rows?: number;
  /** Which way the first row travels. @default "left" */
  direction?: "left" | "right";
  /** The share of the cruising speed a row keeps under the pointer, 0 to 1: 0 brakes it to a stop. @default 0 */
  hoverSpeed?: number;
  /** How far the looked-at mark lifts, in px. @default 4 */
  lift?: number;
  /** How grey and faint the marks at rest are, 0 to 1. @default 0.6 */
  muted?: number;
  /** Width of the edge fades in px, never more than a fifth of the row. @default 56 */
  fade?: number;
  /** How far a fast row leans into its travel, 0 to 1. @default 0.5 */
  skew?: number;
  /** Row height and mark size. @default "md" */
  size?: LogoParadeSize;
  /** Let rows be dragged and flicked. @default true */
  draggable?: boolean;
  /** Stop the conveyor; marks still answer the pointer and keys. @default false */
  paused?: boolean;
  /** The accessible name of the list of marks. @default "Logos" */
  label?: string;
  /** Called when a mark without an `href` is pressed or activated with Enter. */
  onSelect?: (item: LogoParadeItem) => void;
  /** Called when the mark being looked at (hovered or focused) changes, with null when none is. */
  onLook?: (item: LogoParadeItem | null) => void;
  /** Classes for the wall. */
  className?: string;
};

type Geometry = { height: number; mark: number };

const SIZES: Record<LogoParadeSize, Geometry> = {
  sm: { height: 40, mark: 20 },
  md: { height: 48, mark: 24 },
  lg: { height: 56, mark: 30 },
};

/** Room for this many marks per copy in a looked-at key. */
const SLOT = 1000;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const wrap = (v: number, lo: number, hi: number) => {
  const span = hi - lo;
  if (span <= 0) return lo;
  return lo + ((((v - lo) % span) + span) % span);
};

/**
 * One step of a damped spring with the house constants: the new velocity,
 * semi-implicit, so the caller moves by it. Returning a number, not a pair,
 * keeps the frame loop free of allocations.
 */
function springStep(
  pos: number,
  vel: number,
  target: number,
  spring: { stiffness: number; damping: number; mass: number },
  dt: number,
): number {
  return (
    vel +
    ((spring.stiffness * (target - pos) - spring.damping * vel) / spring.mass) *
      dt
  );
}

/**
 * Where copy `j` of the set sits: copies ride a ring `total` wide and each
 * wraps on its own once it is wholly off the left edge, so the row can run
 * either way forever and any offset is a valid one.
 */
const placeCopy = (x: number, j: number, unit: number, total: number) =>
  unit <= 0
    ? j === 0
      ? 0
      : j * 4000
    : r2(wrap(x + j * unit, -unit, total - unit));

type RowProps = {
  items: readonly LogoParadeItem[];
  index: number;
  accessible: boolean;
  dir: 1 | -1;
  speed: number;
  gap: number;
  hoverSpeed: number;
  lift: number;
  muted: number;
  fade: number;
  skew: number;
  geometry: Geometry;
  draggable: boolean;
  paused: boolean;
  label: string;
  onSelect?: (item: LogoParadeItem) => void;
  onLook?: (item: LogoParadeItem | null) => void;
};

type Layout = {
  width: number;
  unit: number;
  starts: number[];
  widths: number[];
};

function Mark({
  item,
  hot,
  muted,
  lift,
  geometry,
  motionSafe,
  focusable,
  hidden,
  interactive,
  onSelect,
  setRef,
  onFocus,
}: {
  item: LogoParadeItem;
  hot: boolean;
  muted: number;
  lift: number;
  geometry: Geometry;
  motionSafe: boolean;
  focusable: boolean;
  hidden: boolean;
  interactive: boolean;
  onSelect?: (item: LogoParadeItem) => void;
  setRef?: (node: HTMLElement | null) => void;
  onFocus?: () => void;
}) {
  const m = clamp(muted, 0, 1);
  const look: React.CSSProperties & Record<"--mark-color", string> = {
    height: geometry.mark,
    fontSize: Math.round(geometry.mark * 0.62),
    color: hot
      ? "var(--foreground)"
      : `color-mix(in oklab, var(--ink-3) ${Math.round(m * 100)}%, var(--foreground))`,
    opacity: hot ? 1 : r2(1 - m * 0.45),
    filter: hot ? "none" : `grayscale(${r2(m)})`,
    "--mark-color": hot ? (item.color ?? "var(--foreground)") : "currentColor",
    transitionDuration: `${Math.round(durations.base * 1000)}ms`,
  };
  const body = (
    <motion.span
      className="flex items-center"
      initial={false}
      animate={{ y: hot && motionSafe ? -lift : 0 }}
      transition={motionSafe ? springs.snap : { duration: 0 }}
    >
      <span
        aria-hidden
        className="inline-flex items-center whitespace-nowrap transition-[color,opacity,filter] [&>svg]:h-full [&>svg]:w-auto"
        style={look}
      >
        {item.mark}
      </span>
    </motion.span>
  );
  const ring =
    "rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
  if (item.href) {
    return (
      <a
        ref={setRef}
        href={item.href}
        aria-label={item.name}
        tabIndex={hidden ? -1 : focusable ? 0 : -1}
        draggable={false}
        onFocus={onFocus}
        className={cn("flex items-center", ring)}
      >
        {body}
      </a>
    );
  }
  if (interactive) {
    return (
      <button
        ref={setRef}
        type="button"
        aria-label={item.name}
        tabIndex={hidden ? -1 : focusable ? 0 : -1}
        onFocus={onFocus}
        onClick={() => onSelect?.(item)}
        className={cn("flex cursor-pointer items-center", ring)}
      >
        {body}
      </button>
    );
  }
  return (
    <span role="img" aria-label={item.name} className="flex items-center">
      {body}
    </span>
  );
}

function Copy({
  j,
  x,
  lean,
  unit,
  total,
  accessible,
  label,
  hintId,
  listRef,
  onKeyDown,
  children,
}: {
  j: number;
  x: MotionValue<number>;
  lean: MotionValue<number>;
  unit: MotionValue<number>;
  total: MotionValue<number>;
  accessible: boolean;
  label: string;
  hintId: string;
  listRef?: React.Ref<HTMLUListElement>;
  onKeyDown?: (event: React.KeyboardEvent) => void;
  children: React.ReactNode;
}) {
  const pos = useMotionValue(j === 0 ? 0 : j * 4000);
  // Placed from this copy's own subscription rather than a combined
  // transform: StrictMode's rehearsal remount cancels a combined value's
  // pending update, and re-measuring an unchanged set never re-sends it.
  React.useEffect(() => {
    const place = () => pos.set(placeCopy(x.get(), j, unit.get(), total.get()));
    place();
    const off = [x, unit, total].map((v) => v.on("change", place));
    return () => {
      for (const unsubscribe of off) unsubscribe();
    };
  }, [j, pos, total, unit, x]);
  const className = "absolute top-0 left-0 flex h-full w-max items-center";
  if (j === 0) {
    return (
      <motion.ul
        ref={listRef}
        role="list"
        aria-label={accessible ? label : undefined}
        aria-describedby={accessible ? hintId : undefined}
        aria-hidden={accessible ? undefined : true}
        onKeyDown={onKeyDown}
        className={className}
        style={{ x: pos, skewX: lean }}
      >
        {children}
      </motion.ul>
    );
  }
  return (
    <motion.ul
      aria-hidden
      className={className}
      style={{ x: pos, skewX: lean }}
    >
      {children}
    </motion.ul>
  );
}

function Row({
  items,
  index,
  accessible,
  dir,
  speed,
  gap,
  hoverSpeed,
  lift,
  muted,
  fade,
  skew,
  geometry,
  draggable,
  paused,
  label,
  onSelect,
  onLook,
}: RowProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const markRefs = React.useRef(new Map<string, HTMLElement>());
  const x = useMotionValue(0);
  const lean = useMotionValue(0);
  const unit = useMotionValue(0);
  const total = useMotionValue(0);
  const [copies, setCopies] = React.useState(2);
  // The looked-at mark as one number, copy × SLOT + index, or -1 for none:
  // the loop can compare it every frame without building a key.
  const [hot, setHot] = React.useState(-1);
  const [active, setActive] = React.useState(0);

  const interactive = items.some((item) => item.href) || Boolean(onSelect);
  const layout = React.useRef<Layout>({
    width: 0,
    unit: 0,
    starts: [],
    widths: [],
  });
  const state = React.useRef({
    v: 0,
    dv: 0,
    hovered: false,
    focused: false,
    dragging: false,
    steering: null as AnimationPlaybackControls | null,
    pointer: -1,
    placed: false,
    latch: false,
    moved: 0,
  });
  const params = React.useRef({
    cruise: dir * speed,
    hoverSpeed,
    skew,
    paused,
    motionSafe,
    items,
    onLook,
  });
  React.useEffect(() => {
    params.current = {
      cruise: dir * Math.max(0, speed),
      hoverSpeed,
      skew,
      paused,
      motionSafe,
      items,
      onLook,
    };
  });
  const api = React.useRef<{ wake: () => void } | null>(null);
  const hotRef = React.useRef(-1);

  // The mark under the pointer comes from the pointer and the row's offset,
  // not from hover events: a row moving under a still pointer changes it.
  const lookAt = React.useCallback((key: number) => {
    if (hotRef.current === key) return;
    hotRef.current = key;
    setHot(key);
    params.current.onLook?.(
      key < 0 ? null : (params.current.items[key % SLOT] ?? null),
    );
  }, []);

  const markUnder = React.useCallback(() => {
    const s = state.current;
    const l = layout.current;
    if (s.pointer < 0 || l.unit <= 0) return -1;
    const ring = total.get();
    const copiesOnRing = Math.round(ring / l.unit);
    for (let j = 0; j < copiesOnRing; j += 1) {
      const pos = placeCopy(x.get(), j, l.unit, ring);
      const local = s.pointer - pos;
      if (local < 0 || local >= l.unit) continue;
      for (let i = 0; i < l.starts.length; i += 1) {
        const start = l.starts[i] ?? 0;
        if (local >= start && local < start + (l.widths[i] ?? 0)) {
          return j * SLOT + i;
        }
      }
      return -1;
    }
    return -1;
  }, [total, x]);

  // Measure the set, place the copies and run the conveyor.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    const list = listRef.current;
    if (!viewport || !list) return;
    let raf = 0;
    let last = 0;
    let inView = true;
    const s = state.current;

    const measure = () => {
      const lis = Array.from(list.children) as HTMLElement[];
      const unitWidth = list.offsetWidth;
      const width = viewport.clientWidth;
      if (unitWidth <= 0 || width <= 0) return;
      layout.current = {
        width,
        unit: unitWidth,
        starts: lis.map((li) => li.offsetLeft),
        widths: lis.map(
          (li) =>
            (li.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0,
        ),
      };
      const need = Math.max(2, Math.ceil(width / unitWidth) + 1);
      setCopies(need);
      unit.set(unitWidth);
      total.set(need * unitWidth);
      if (!s.placed) {
        // Further rows start half a set along, so no two marks stack.
        s.placed = true;
        x.jump(-unitWidth * 0.5 * index);
      }
    };

    const canRun = () =>
      inView && !document.hidden && params.current.motionSafe;

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const p = params.current;
      const looking = s.hovered || s.focused;
      const target = p.paused
        ? 0
        : looking
          ? p.cruise * clamp(p.hoverSpeed, 0, 1)
          : p.cruise;
      // The conveyor brakes and picks up on springs.drift's constants: the
      // velocity is the spring, so it eases to a halt rather than stopping.
      // While dragged, the velocity is the hand's, measured in onMove.
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < steps && !s.dragging; i += 1) {
        s.dv = springStep(s.v, s.dv, target, springs.drift, dt / steps);
        s.v += (s.dv * dt) / steps;
      }
      if (!s.dragging && !s.steering) {
        let next = x.get() + s.v * dt;
        const ring = total.get();
        if (ring > 0 && Math.abs(next) > ring * 4) next = wrap(next, 0, ring);
        x.set(r2(next));
      }
      lean.set(r2(clamp(-s.v * clamp(p.skew, 0, 1) * 0.006, -8, 8)));
      if (s.hovered) lookAt(markUnder());
      const settled =
        Math.abs(s.v - target) < 0.4 && Math.abs(s.dv) < 0.4 && target === 0;
      if (settled && !s.dragging) {
        s.v = 0;
        s.dv = 0;
        lean.set(0);
        return;
      }
      if (canRun()) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf || !canRun()) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const sizer = new ResizeObserver(() => {
      measure();
      wake();
    });
    sizer.observe(viewport);
    sizer.observe(list);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(viewport);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    measure();
    if (s.v === 0 && params.current.motionSafe && !params.current.paused) {
      s.v = params.current.cruise;
    }
    wake();
    api.current = { wake };

    return () => {
      halt();
      s.steering?.stop();
      s.steering = null;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, [index, lean, lookAt, markUnder, total, unit, x]);

  React.useEffect(() => {
    if (!motionSafe) {
      state.current.v = 0;
      state.current.dv = 0;
      lean.set(0);
    }
    api.current?.wake();
  }, [speed, dir, hoverSpeed, paused, motionSafe, skew, lean]);

  /** Glide the row so mark `i` of the accessible copy sits in the middle. */
  const steerTo = (i: number) => {
    const s = state.current;
    const l = layout.current;
    const start = l.starts[i];
    const width = l.widths[i];
    if (start === undefined || width === undefined || l.unit <= 0) return;
    const ring = total.get();
    const pos = placeCopy(x.get(), 0, l.unit, ring);
    let delta = l.width / 2 - (start + width / 2) - pos;
    delta = wrap(delta, -ring / 2, ring / 2);
    s.steering?.stop();
    if (!motionSafe) {
      x.set(r2(x.get() + delta));
      s.steering = null;
      return;
    }
    const velocity = s.v;
    s.v = 0;
    s.dv = 0;
    s.steering = animate(x, r2(x.get() + delta), {
      ...springs.glide,
      velocity,
    });
  };

  const focusMark = (i: number) => {
    const n = items.length;
    if (n === 0) return;
    const next = ((i % n) + n) % n;
    setActive(next);
    const item = items[next];
    if (interactive && item) {
      markRefs.current.get(item.id)?.focus({ preventScroll: true });
    } else {
      state.current.focused = true;
      lookAt(next);
      steerTo(next);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: items.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    focusMark(next);
  };

  const onFocusMark = (i: number) => {
    const s = state.current;
    s.focused = true;
    setActive(i);
    lookAt(i);
    steerTo(i);
  };

  const onBlurRow = (event: React.FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && viewportRef.current?.contains(next)) return;
    const s = state.current;
    s.focused = false;
    s.steering?.stop();
    s.steering = null;
    if (!s.hovered) lookAt(-1);
    api.current?.wake();
  };

  const pointAt = (clientX: number) => {
    const box = viewportRef.current?.getBoundingClientRect();
    state.current.pointer = box ? clientX - box.left : -1;
  };

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled: !draggable,
    onStart: ({ event }) => {
      const s = state.current;
      s.dragging = true;
      s.moved = event.timeStamp;
      s.steering?.stop();
      s.steering = null;
      s.latch = true;
      api.current?.wake();
    },
    onMove: ({ delta, point, event }) => {
      const s = state.current;
      // A smoothed reading of the hand's speed keeps the lean honest while
      // the row is held; the release velocity takes over on letting go.
      const dt = Math.max(0.008, (event.timeStamp - s.moved) / 1000);
      s.moved = event.timeStamp;
      s.v += (delta.x / dt - s.v) * 0.35;
      s.dv = 0;
      x.set(r2(x.get() + delta.x));
      pointAt(point.x);
      lookAt(markUnder());
    },
    onEnd: ({ velocity }) => {
      const s = state.current;
      s.dragging = false;
      // The conveyor takes the throw's velocity and glides back to its
      // cruising speed (or to a stop under the pointer) from there.
      s.v = motionSafe ? clamp(velocity.x, -4000, 4000) : 0;
      s.dv = 0;
      api.current?.wake();
      window.setTimeout(() => {
        s.latch = false;
      }, 0);
    },
    onCancel: () => {
      const s = state.current;
      s.dragging = false;
      s.latch = false;
      api.current?.wake();
    },
  });

  const edge = `min(${Math.max(0, fade)}px, 20%)`;
  const mask = `linear-gradient(to right, transparent 0, black ${edge}, black calc(100% - ${edge}), transparent 100%)`;

  const set = (j: number) =>
    items.map((item, i) => (
      <li
        key={`${j}-${item.id}`}
        className="flex h-full shrink-0 items-center"
        style={{ paddingRight: Math.max(0, gap) }}
      >
        <Mark
          item={item}
          hot={hot === j * SLOT + i}
          muted={muted}
          lift={lift}
          geometry={geometry}
          motionSafe={motionSafe}
          focusable={accessible && j === 0 && i === active}
          hidden={!accessible || j !== 0}
          interactive={interactive}
          onSelect={onSelect}
          setRef={
            accessible && j === 0
              ? (node) => {
                  if (node) markRefs.current.set(item.id, node);
                  else markRefs.current.delete(item.id);
                }
              : undefined
          }
          onFocus={accessible && j === 0 ? () => onFocusMark(i) : undefined}
        />
      </li>
    ));

  return (
    <div
      ref={viewportRef}
      aria-hidden={accessible ? undefined : true}
      tabIndex={accessible && !interactive ? 0 : undefined}
      role={accessible && !interactive ? "group" : undefined}
      aria-label={accessible && !interactive ? label : undefined}
      aria-describedby={accessible && !interactive ? hintId : undefined}
      onKeyDown={accessible && !interactive ? onKeyDown : undefined}
      onFocus={
        accessible && !interactive
          ? (event) => {
              if (event.target === event.currentTarget) focusMark(active);
            }
          : undefined
      }
      onBlur={accessible ? onBlurRow : undefined}
      onPointerEnter={(event) => {
        state.current.hovered = true;
        pointAt(event.clientX);
        lookAt(markUnder());
        api.current?.wake();
      }}
      onPointerLeave={() => {
        const s = state.current;
        s.hovered = false;
        s.pointer = -1;
        lookAt(s.focused ? active : -1);
        api.current?.wake();
      }}
      {...drag}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        pointAt(event.clientX);
        lookAt(markUnder());
      }}
      onClickCapture={(event) => {
        // A release at the end of a drag is not a press on the mark under it.
        if (state.current.latch) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDragStart={(event) => event.preventDefault()}
      className={cn(
        "relative w-full overflow-clip rounded-2 [contain:paint] select-none",
        draggable && "cursor-grab touch-pan-y active:cursor-grabbing",
        accessible &&
          !interactive &&
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
      style={{
        height: geometry.height,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      {Array.from({ length: copies }, (_, j) => (
        <Copy
          key={j}
          j={j}
          x={x}
          lean={lean}
          unit={unit}
          total={total}
          accessible={accessible}
          label={label}
          hintId={hintId}
          listRef={j === 0 ? listRef : undefined}
          onKeyDown={
            accessible && interactive && j === 0 ? onKeyDown : undefined
          }
        >
          {set(j)}
        </Copy>
      ))}
      {accessible ? (
        <span id={hintId} className="sr-only">
          {interactive
            ? "Left and Right move between marks; Home and End jump to the ends."
            : "Left and Right move the row a mark at a time."}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A conveyor of marks that slows to look. Each row is an endless DOM marquee
 * with edge fades; its speed is a spring on springs.drift's constants, so
 * under the pointer it brakes smoothly to a stop and picks back up when the
 * pointer leaves. The mark under the pointer lifts on springs.snap and takes
 * its colour on a tween while the rest stay muted. Rows drag 1:1 and a flick
 * hands its velocity to the same spring, so the conveyor spins away, leans
 * into the throw and glides back to its cruising speed. A second and third
 * row run the other way.
 *
 * The first row is a real list holding each mark once (echo copies and extra
 * rows are hidden from assistive technology). Linked or selectable marks sit
 * on a roving tabindex: Left and Right move between them and the row glides
 * on springs.glide to centre the focused one; plain marks make the row itself
 * the focus stop and the arrows step it a mark at a time. Under reduced motion
 * the row is still, a drag moves it without momentum and the arrows jump it.
 */
export function LogoParade({
  items,
  speed = 40,
  gap = 48,
  rows = 2,
  direction = "left",
  hoverSpeed = 0,
  lift = 4,
  muted = 0.6,
  fade = 56,
  skew = 0.5,
  size = "md",
  draggable = true,
  paused = false,
  label = "Logos",
  onSelect,
  onLook,
  className,
}: LogoParadeProps) {
  const geometry = SIZES[size] ?? SIZES.md;
  const count = clamp(Math.round(rows), 1, 3);
  const first = direction === "right" ? 1 : -1;
  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {Array.from({ length: count }, (_, index) => (
        <Row
          key={index}
          index={index}
          items={items}
          accessible={index === 0}
          dir={(index % 2 === 0 ? first : -first) as 1 | -1}
          speed={speed}
          gap={gap}
          hoverSpeed={hoverSpeed}
          lift={lift}
          muted={muted}
          fade={fade}
          skew={skew}
          geometry={geometry}
          draggable={draggable}
          paused={paused}
          label={label}
          onSelect={onSelect}
          onLook={onLook}
        />
      ))}
    </div>
  );
}
