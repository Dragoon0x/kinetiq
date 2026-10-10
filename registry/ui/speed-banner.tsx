"use client";

import * as React from "react";

import { motion, motionValue, type MotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SpeedBannerOutline = "none" | "alternate" | "all";
export type SpeedBannerElement =
  "div" | "section" | "aside" | "header" | "footer";

export type SpeedBannerProps = {
  /** The items repeated along each row; a string is one item. */
  text: string | string[];
  /** The root element. @default "div" */
  as?: SpeedBannerElement;
  /** How many rows, 1 to 4; rows alternate direction. @default 2 */
  rows?: number;
  /** The rows' calm drift, em per second. @default 1.2 */
  speed?: number;
  /** The largest lean at full scroll speed, degrees. @default 10 */
  skew?: number;
  /** The most letter spacing opens at full scroll speed, em. @default 0.06 */
  stretch?: number;
  /** How many times their base speed the rows reach at full scroll speed. @default 5 */
  boost?: number;
  /** The scroll speed that counts as full, px per second. @default 2400 */
  sensitivity?: number;
  /** The first row's direction; the next row runs the other way. @default "left" */
  direction?: "left" | "right";
  /** Scrolling up reverses every row. @default true */
  flip?: boolean;
  /** Which rows are drawn in outline. @default "alternate" */
  outline?: SpeedBannerOutline;
  /** Set between items. @default "·" */
  separator?: string;
  /** Fade the ends of the rows. @default true */
  fade?: boolean;
  /** Space between rows, em. @default 0.1 */
  gap?: number;
  /** The region's name for assistive technology. @default "Banner" */
  label?: string;
  /** Controlled: the banner is held. */
  paused?: boolean;
  /** Held from the start, when uncontrolled. @default false */
  defaultPaused?: boolean;
  /** Fires from the key press that held or released the banner. */
  onPausedChange?: (paused: boolean) => void;
  /** Scrolling flipped the rows: 1 is their own way, -1 reversed. */
  onDirectionChange?: (direction: 1 | -1) => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Splits text into graphemes, so emoji and combining marks stay whole. */
function graphemeCount(text: string): number {
  const Segmenter = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (s: string) => Iterable<unknown> };
    }
  ).Segmenter;
  if (!Segmenter) return Array.from(text).length;
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(text),
  ).length;
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Spring = { stiffness: number; damping: number; mass: number };

/**
 * One step of a damped spring, sub-stepped so a long frame cannot blow it up.
 * The constants are the calibration set's, so the banner settles the way the
 * rest of the library does.
 */
function stepSpring(
  state: { x: number; v: number },
  target: number,
  s: Spring,
  dt: number,
) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const a =
      (-s.stiffness * (state.x - target) - s.damping * state.v) / s.mass;
    state.v += a * h;
    state.x += state.v * h;
  }
}

type Sim = {
  raf: number;
  last: number;
  /** Scroll velocity, px/s, signed (down is positive), and when it was read. */
  scrollV: number;
  scrollAt: number;
  /** Wheel velocity, used only when nothing scrolled under the wheel. */
  wheelV: number;
  wheelAt: number;
  /** A keyboard push, decaying like a scroll that stopped. */
  keyV: number;
  /** The last scroll direction: 1 down, -1 up. */
  sign: 1 | -1;
  /** Boost, lean and stretch all follow this amount, 0 to 1 (glide). */
  amount: { x: number; v: number };
  /** Direction and pause: rows run at `drive` times their speed (drift). */
  drive: { x: number; v: number };
  offsets: number[];
};

/**
 * A marquee that answers the scroll. Rows of repeated display type drift in
 * alternating directions at a calm base speed; scrolling the page feeds its
 * velocity into one amount, carried on the glide spring, that runs the rows
 * faster, leans each one toward its own direction of travel and opens the
 * letter spacing — the stretch anchored at the middle of the row, so the type
 * elongates rather than slides. Scrolling up reverses every row through the
 * drift spring: the rows slow, stop and pull away the other way. When the
 * scrolling stops, everything eases back to the cruise.
 *
 * The banner is a focusable region: Space or Enter holds and releases it (the
 * rows coast to a stop), Left and Right push it like a scroll would, and Up,
 * Down and the page keys scroll the page as usual, which it already answers.
 * The items are read once; every row copy is hidden. Under reduced motion the
 * rows rest at staggered offsets and the scroll leaves them still.
 */
export function SpeedBanner({
  text,
  as = "div",
  rows = 2,
  speed = 1.2,
  skew = 10,
  stretch = 0.06,
  boost = 5,
  sensitivity = 2400,
  direction = "left",
  flip = true,
  outline = "alternate",
  separator = "·",
  fade = true,
  gap = 0.1,
  label = "Banner",
  paused,
  defaultPaused = false,
  onPausedChange,
  onDirectionChange,
  className,
}: SpeedBannerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const [ownPaused, setOwnPaused] = React.useState(defaultPaused);
  const held = paused ?? ownPaused;
  const [said, setSaid] = React.useState("");
  const [copies, setCopies] = React.useState(3);
  const [measured, setMeasured] = React.useState(false);

  const items = React.useMemo(
    () => (Array.isArray(text) ? text : [text]).filter((t) => t.trim() !== ""),
    [text],
  );
  const count = clamp(Math.round(rows), 1, 4);
  const lineCount = React.useMemo(() => {
    // Letter spacing lands after every character, separators included.
    const per = items.reduce((n, item) => n + graphemeCount(item), 0);
    return per + items.length * graphemeCount(separator);
  }, [items, separator]);

  // One x and one lean per row, made once: rows only ever grow to four.
  const [values] = React.useState(() =>
    Array.from({ length: 4 }, () => ({
      x: motionValue(0),
      skewX: motionValue(0),
    })),
  );

  const rootRef = React.useRef<HTMLElement | null>(null);
  const copyRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const geometry = React.useRef({ width: 0, font: 16, periods: [0, 0, 0, 0] });
  const sim = React.useRef<Sim>({
    raf: 0,
    last: 0,
    scrollV: 0,
    scrollAt: -Infinity,
    wheelV: 0,
    wheelAt: -Infinity,
    keyV: 0,
    sign: 1,
    amount: { x: 0, v: 0 },
    drive: { x: 1, v: 0 },
    offsets: [0, 0, 0, 0],
  });
  const api = React.useRef<{
    tick: (now: number) => void;
    measure: () => void;
    rest: () => void;
  } | null>(null);
  const latest = React.useRef({ onDirectionChange, flip, held });

  const dirOf = (row: number) =>
    (row % 2 === 0 ? 1 : -1) * (direction === "left" ? -1 : 1);

  /** Puts every row where the simulation says, stretch anchored mid-row. */
  const place = (extraEm: number, amount: number, drive: number) => {
    const g = geometry.current;
    const extraPx = extraEm * g.font;
    for (let r = 0; r < count; r += 1) {
      const v = values[r];
      const p0 = g.periods[r] ?? 0;
      if (!v || p0 <= 0) continue;
      const o = (((sim.current.offsets[r] ?? 0) % p0) + p0) % p0;
      const s = 1 + (extraPx * lineCount) / p0;
      v.x.set(r2(g.width / 2 - (g.width / 2 + o) * s));
      const travel = dirOf(r) * Math.sign(drive || 1);
      v.skewX.set(r2(-travel * skew * amount));
    }
    rootRef.current?.style.setProperty(
      "--speed-banner-track",
      `${r4(extraEm)}em`,
    );
  };

  const tick = (now: number) => {
    const st = sim.current;
    const dt = Math.min(0.05, Math.max(0, (now - st.last) / 1000));
    st.last = now;
    // Inputs decay once they stop arriving, the way a scroll comes to rest.
    const fade = (age: number) => (age > 60 ? Math.exp(-dt / 0.09) : 1);
    st.scrollV *= fade(now - st.scrollAt);
    st.wheelV *= fade(now - st.wheelAt);
    st.keyV *= Math.exp(-dt / 0.12);
    // A wheel counts only where nothing scrolled under it.
    const recent = now - st.scrollAt < 150;
    const input = Math.max(
      Math.abs(st.scrollV),
      recent ? 0 : Math.abs(st.wheelV),
      Math.abs(st.keyV),
    );
    const target = held ? 0 : Math.sqrt(clamp(input / sensitivity, 0, 1));
    stepSpring(st.amount, target, springs.glide, dt);
    stepSpring(st.drive, held ? 0 : flip ? st.sign : 1, springs.drift, dt);
    const amount = clamp(st.amount.x, 0, 1.2);
    const font = geometry.current.font;
    for (let r = 0; r < count; r += 1) {
      const pace = speed * font * dirOf(r) * st.drive.x * (1 + boost * amount);
      st.offsets[r] = (st.offsets[r] ?? 0) - pace * dt;
    }
    place(stretch * amount, amount, st.drive.x);
    const settled =
      held &&
      Math.abs(st.drive.x) < 0.002 &&
      Math.abs(st.drive.v) < 0.01 &&
      st.amount.x < 0.002;
    st.raf = settled ? 0 : requestAnimationFrame((t) => api.current?.tick(t));
  };

  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const style = getComputedStyle(root);
    const g = geometry.current;
    g.font = parseFloat(style.fontSize) || 16;
    g.width = root.clientWidth;
    const base = parseFloat(style.letterSpacing);
    root.style.setProperty(
      "--speed-banner-base",
      `${Number.isFinite(base) ? r2(base) : 0}px`,
    );
    let shortest = Infinity;
    // The copies may be mid-stretch; the period is their width without it.
    const extraPx =
      stretch * clamp(sim.current.amount.x, 0, 1.2) * g.font * lineCount;
    for (let r = 0; r < count; r += 1) {
      const node = copyRefs.current[r];
      const p = node ? Math.max(0, node.offsetWidth - extraPx) : 0;
      g.periods[r] = p;
      if (p > 0) shortest = Math.min(shortest, p);
    }
    if (Number.isFinite(shortest)) {
      setCopies(Math.max(3, Math.ceil(g.width / shortest) + 2));
      setMeasured(true);
    }
    if (!sim.current.raf) api.current?.rest();
  };

  /** Where the rows sit when nothing is moving them. */
  const rest = () => {
    const st = sim.current;
    if (!motionSafe) {
      // Reduced motion: staggered so the rows never line up.
      for (let r = 0; r < count; r += 1) {
        st.offsets[r] = r * 0.37 * (geometry.current.periods[r] ?? 0);
      }
      place(0, 0, 1);
      return;
    }
    place(stretch * st.amount.x, st.amount.x, st.drive.x);
  };

  React.useLayoutEffect(() => {
    api.current = { tick, measure, rest };
    latest.current = { onDirectionChange, flip, held };
  });

  const running = motionSafe && onScreen && !hidden && measured;

  React.useEffect(() => {
    if (!running) return;
    const st = sim.current;
    st.last = performance.now();
    st.raf = requestAnimationFrame((t) => api.current?.tick(t));
    return () => {
      cancelAnimationFrame(st.raf);
      st.raf = 0;
    };
  }, [running, held]);

  React.useEffect(() => {
    if (!motionSafe) api.current?.rest();
  }, [motionSafe, count, measured]);

  // The page's scrolls, read from whatever scroller holds the banner.
  React.useEffect(() => {
    if (!motionSafe) return;
    const last = new Map<EventTarget, { y: number; t: number }>();
    const onScroll = (event: Event) => {
      const root = rootRef.current;
      const target = event.target;
      if (!root || !target) return;
      let y: number;
      if (target === document || target === window) y = window.scrollY;
      else if (target instanceof Element && target.contains(root)) {
        y = target.scrollTop;
      } else return;
      const now = performance.now();
      const prev = last.get(target);
      last.set(target, { y, t: now });
      if (!prev) return;
      const dy = y - prev.y;
      const dt = now - prev.t;
      if (dy === 0 || dt <= 0 || dt > 250) return;
      const st = sim.current;
      if (latest.current.held) return;
      st.scrollV = st.scrollV * 0.3 + (dy / dt) * 1000 * 0.7;
      st.scrollAt = now;
      const sign = dy > 0 ? 1 : -1;
      if (sign !== st.sign) {
        st.sign = sign;
        if (latest.current.flip) latest.current.onDirectionChange?.(sign);
      }
    };
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      document.removeEventListener("scroll", onScroll, { capture: true });
  }, [motionSafe]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    // Over a banner nothing scrolls under, the wheel stands in for a scroll.
    let wheelT = 0;
    const onWheel = (event: WheelEvent) => {
      const st = sim.current;
      if (latest.current.held) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const dy = event.deltaY * unit;
      if (dy === 0) return;
      const now = performance.now();
      const dt = Math.max(16, Math.min(120, now - wheelT));
      wheelT = now;
      st.wheelV = st.wheelV * 0.3 + (dy / dt) * 1000 * 0.7;
      st.wheelAt = now;
      if (now - st.scrollAt > 150) {
        const sign = dy > 0 ? 1 : -1;
        if (sign !== st.sign) {
          st.sign = sign;
          if (latest.current.flip) latest.current.onDirectionChange?.(sign);
        }
      }
    };
    node.addEventListener("wheel", onWheel, { passive: true });
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      node.removeEventListener("wheel", onWheel);
    };
  }, []);

  const bindCopy = (row: number) => (node: HTMLSpanElement | null) => {
    copyRefs.current[row] = node;
  };

  // A copy resized (font load, item change): measure again.
  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [items, separator, count]);

  const setHeld = (next: boolean) => {
    if (paused === undefined) setOwnPaused(next);
    setSaid(next ? "Banner paused" : "Banner moving");
    onPausedChange?.(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setHeld(!held);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (held || !motionSafe) return;
    const st = sim.current;
    const sign = event.key === "ArrowRight" ? 1 : -1;
    st.keyV = sign * sensitivity * 0.9;
    if (sign !== st.sign) {
      st.sign = sign;
      if (flip) onDirectionChange?.(sign);
    }
  };

  const rowItems = (row: number) =>
    items.map((_, i) => items[(i + row) % items.length] ?? "");

  return React.createElement(
    as,
    {
      ref: bindRoot,
      role: "region",
      "aria-roledescription": "marquee",
      "aria-label": label,
      "aria-describedby": hintId,
      tabIndex: 0,
      onKeyDown,
      className: cn(
        "relative block w-full overflow-clip rounded-2 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      ),
    },
    <span key="text" className="sr-only">
      {items.join(", ")}
    </span>,
    <span key="hint" id={hintId} hidden>
      Space pauses and resumes it. Left and Right push it.
    </span>,
    <span key="said" role="status" className="sr-only">
      {said}
    </span>,
    <div
      key="rows"
      aria-hidden
      className="flex flex-col"
      style={{
        rowGap: `${Math.max(0, gap)}em`,
        maskImage: fade
          ? "linear-gradient(to right, transparent, black 9%, black 91%, transparent)"
          : undefined,
      }}
    >
      {Array.from({ length: count }, (_, r) => {
        const outlined =
          outline === "all" || (outline === "alternate" && r % 2 === 1);
        const row = values[r] as {
          x: MotionValue<number>;
          skewX: MotionValue<number>;
        };
        return (
          <div key={r} className="overflow-clip py-[0.04em]">
            <motion.div
              className="flex w-max whitespace-nowrap"
              style={{ x: row.x, skewX: row.skewX }}
            >
              {Array.from({ length: copies }, (_, c) => (
                <span
                  key={c}
                  ref={c === 0 ? bindCopy(r) : undefined}
                  className="flex shrink-0 items-center leading-[1.12]"
                  style={{
                    letterSpacing:
                      "calc(var(--speed-banner-base, 0px) + var(--speed-banner-track, 0em))",
                  }}
                >
                  {rowItems(r).map((item, i) => (
                    <React.Fragment key={i}>
                      <span
                        className={cn(
                          outlined &&
                            "[-webkit-text-fill-color:transparent] [-webkit-text-stroke:0.03em_currentColor]",
                        )}
                      >
                        {item}
                      </span>
                      <span className="px-[0.45em] text-ink-3">
                        {separator}
                      </span>
                    </React.Fragment>
                  ))}
                </span>
              ))}
            </motion.div>
          </div>
        );
      })}
    </div>,
  );
}
