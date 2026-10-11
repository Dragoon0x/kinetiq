"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PaceBoardFrom = "right" | "left" | "auto";
export type PaceBoardSwap = "word" | "chars";
export type PaceBoardTrigger = "mount" | "inView" | "manual";

export type PaceBoardProps = {
  /** Words to cycle through, one at a time. */
  values?: readonly string[];
  /** A live value: every change swaps it in. Numbers go through `format`. Wins over `values`. */
  value?: string | number;
  /** Formats a number `value`. @default grouped thousands, e.g. "1,284" */
  format?: (value: number) => string;
  /** The shown entry of `values`, controlled. */
  index?: number;
  /** The first entry shown when uncontrolled. @default 0 */
  defaultIndex?: number;
  /** Fires from the timer, key or click that moved it, with the new index. */
  onIndexChange?: (index: number) => void;
  /** Time each entry of `values` holds before the next swaps in, ms. @default 2400 */
  interval?: number;
  /** Motion-blur strength, 0 (none) to 1 (a heavy smear at speed). @default 0.6 */
  blur?: number;
  /** How far a new value runs past its rest before it locks, and how hard it judders, 0 to 1. @default 0.5 */
  overshoot?: number;
  /** Spring speed, 0.5 (unhurried) to 2 (snappy). @default 1 */
  speed?: number;
  /** How far a new value comes from, in widths of its window. @default 0.9 */
  travel?: number;
  /** The side new values arrive from; "auto" brings rising numbers from the right and falling ones from the left. Stepping back reverses it. @default "right" */
  from?: PaceBoardFrom;
  /** Swap the whole value, or only the characters that changed, each in its own window. @default "word" */
  swap?: PaceBoardSwap;
  /** Time between characters in `chars` mode, ms. @default 28 */
  stagger?: number;
  /** When `values` start cycling: at mount, the first time it is seen, or never (keys, clicks and `index` only). @default "inView" */
  trigger?: PaceBoardTrigger;
  /** Stop cycling. Live values still swap. @default false */
  paused?: boolean;
  /** Fires when Space pauses or resumes the cycle. */
  onPausedChange?: (paused: boolean) => void;
  /** Draw a hairline under the value that fills until the next swap. @default false */
  progress?: boolean;
  /** A sample whose width is always kept, e.g. "88,888", so a growing number never shifts the layout. */
  reserve?: string;
  /** Where the value sits in its kept width. @default "start" */
  align?: "start" | "center" | "end";
  /** The element to render. @default "span" */
  as?: React.ElementType;
  /** Read before the value by assistive technology, e.g. "Built for". */
  label?: string;
  /** Announce each new value politely. Off by default, so a cycling board never chatters. @default "off" */
  live?: "off" | "polite";
  /** Fires as a swap starts, with the new text. */
  onSwap?: (text: string) => void;
  /** Font size, weight and colour inherit; style it like text. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (n: number, m: number) => ((n % m) + m) % m;

const GROUPED = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const defaultFormat = (n: number) => GROUPED.format(n);

/** Graphemes, so an emoji or an accent never splits across two windows. */
function graphemes(text: string): string[] {
  const Seg = (
    Intl as unknown as {
      Segmenter?: new (
        locale?: string,
        options?: { granularity: "grapheme" },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/**
 * The slide's spring from `overshoot`, between three of the calibrated set:
 * flick (ζ 0.99, no overshoot) at 0, snap (ζ 0.83, one) at 0.15 and recoil
 * (ζ 0.53, two) at 1, eased so the middle of the range already overshoots
 * visibly (ζ ≈ 0.65 at 0.5).
 */
function springOf(overshoot: number, speed: number) {
  const o = clamp01(overshoot);
  const [a, b, t] =
    o < 0.15
      ? [springs.flick, springs.snap, o / 0.15]
      : [springs.snap, springs.recoil, Math.pow((o - 0.15) / 0.85, 0.6)];
  const ratio = (s: { stiffness: number; damping: number; mass: number }) =>
    s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  const zeta = lerp(ratio(a), ratio(b), t);
  const k = lerp(a.stiffness / a.mass, b.stiffness / b.mass, t) * speed * speed;
  return {
    type: "spring" as const,
    stiffness: k,
    damping: 2 * zeta * Math.sqrt(k),
    mass: 1,
    restDelta: 0.3,
    restSpeed: 8,
  };
}

type Physics = {
  motionSafe: boolean;
  overshoot: number;
  blur: number;
  speed: number;
  travel: number;
};

type LayerInfo = {
  key: number;
  text: string;
  role: "in" | "out";
  /** Where it starts, px from rest. */
  from: number;
  /** +1: moving leftward (arrived from the right); -1: moving rightward. */
  dir: 1 | -1;
  delay: number;
  /** False for the value already there at mount: it simply sits. */
  animate: boolean;
};

/** px of blur per px/s of speed at `blur` 1, and the most a smear may take. */
const BLUR_PER_SPEED = 0.008;
const MAX_BLUR = 18;
/** How long the old value has to start leaving before the new one sets off, s. */
const LEAD = 0.035;

function Layer({
  layer,
  physics,
  travelPx,
  filterId,
  onGone,
}: {
  layer: LayerInfo;
  physics: Physics;
  travelPx: number;
  filterId: string;
  onGone: (key: number) => void;
}) {
  const moving = layer.animate && physics.motionSafe;
  const x = useMotionValue(moving ? layer.from : 0);
  const jolt = useMotionValue(0);
  const opacity = useMotionValue(layer.animate && !physics.motionSafe ? 0 : 1);
  const stretch = useMotionValue(1);
  const caught = React.useRef(!layer.animate);
  const exitTo = React.useRef<number | null>(null);
  const gone = React.useRef(false);
  const blurNode = React.useRef<Element | null>(null);

  const pos = useTransform([x, jolt] as MotionValue<number>[], ([a, b]) =>
    r2((a as number) + (b as number)),
  );
  const speed = useVelocity(pos);
  const amount = (v: number) =>
    Math.min(MAX_BLUR, Math.abs(v) * BLUR_PER_SPEED * clamp01(physics.blur));
  // The blur is a real filter only while it shows: at rest the text is pin sharp.
  const filter = useTransform(speed, (v) =>
    amount(v) > 0.25 ? `url(#${filterId})` : "none",
  );
  const smear = useTransform(speed, (v) =>
    r3(1 + Math.min(0.12, Math.abs(v) * 0.00004 * clamp01(physics.blur))),
  );
  const scaleX = useTransform(
    [stretch, smear] as MotionValue<number>[],
    ([a, b]) => r3((a as number) * (b as number)),
  );
  useMotionValueEvent(speed, "change", (v) => {
    if (!blurNode.current)
      blurNode.current = document.getElementById(`${filterId}-g`);
    blurNode.current?.setAttribute("stdDeviation", `${r2(amount(v))} 0`);
  });

  const finish = React.useCallback(() => {
    if (gone.current) return;
    gone.current = true;
    onGone(layer.key);
  }, [layer.key, onGone]);

  // Arriving: the spring runs it in past its rest; on the way back the
  // detent catches it — the spring is stopped, the value locked at zero, and
  // a short judder plays as the catch rings out.
  React.useEffect(() => {
    if (layer.role !== "in" || !layer.animate) return;
    if (!physics.motionSafe) {
      const c = animate(opacity, 1, {
        duration: durations.fast,
        ease: easings.enter,
        delay: layer.delay,
      });
      return () => c.stop();
    }
    if (caught.current) return;
    const toward = -Math.sign(layer.from) || -1;
    let peak = 0;
    let controls: AnimationPlaybackControls | null = null;
    const lock = () => {
      if (caught.current) return;
      caught.current = true;
      controls?.stop();
      x.jump(0);
      const amp =
        Math.sqrt(clamp01(physics.overshoot)) *
        clamp(0.6 + Math.abs(peak) * 0.35, 0.6, 5);
      if (amp < 0.15) return;
      const a = toward * amp;
      animate(jolt, [0, a, -0.62 * a, 0.3 * a, -0.1 * a, 0], {
        duration: 0.12,
        ease: "linear",
      });
    };
    controls = animate(x, 0, {
      ...springOf(physics.overshoot, physics.speed),
      delay: layer.delay,
      onUpdate: (v) => {
        const past = v * toward;
        if (past > 0.5) peak = Math.max(peak, past);
        else if (peak > 0 && past < 0.35) lock();
      },
      onComplete: lock,
    });
    return () => controls?.stop();
  }, [
    layer.role,
    layer.animate,
    layer.delay,
    layer.from,
    physics,
    opacity,
    x,
    jolt,
  ]);

  // What the exit reads when it starts: a width that changes as the layers
  // come and go must not restart a leave that is already under way.
  const exitWith = React.useRef({ physics, travelPx, finish });
  React.useEffect(() => {
    exitWith.current = { physics, travelPx, finish };
  });

  // Leaving: it accelerates away the way the new one is going, stretching
  // from its trailing edge and fading — never a spring on the way out.
  React.useEffect(() => {
    if (layer.role !== "out") return;
    const { physics: p, travelPx: span, finish: done } = exitWith.current;
    if (!p.motionSafe) {
      const c = animate(opacity, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: done,
      });
      return () => c.stop();
    }
    exitTo.current ??= x.get() - layer.dir * span * 1.1;
    // A re-run (StrictMode) that finds it already gone just finishes it.
    if (Math.abs(x.get() - exitTo.current) < 0.5 && opacity.get() < 0.02) {
      done();
      return;
    }
    const d = 0.2 / clamp(p.speed, 0.5, 2);
    const moves = [
      animate(x, exitTo.current, {
        duration: d,
        ease: easings.exit,
        onComplete: done,
      }),
      animate(opacity, 0, { duration: d * 0.8, ease: easings.linear }),
      animate(stretch, 1.14, { duration: d, ease: easings.exit }),
      animate(jolt, 0, { duration: durations.blink }),
    ];
    return () => {
      for (const m of moves) m.stop();
    };
  }, [layer.role, layer.dir, opacity, stretch, x, jolt]);

  return (
    <motion.span
      className="col-start-1 row-start-1 whitespace-pre"
      style={{
        x: pos,
        opacity,
        scaleX,
        originX: layer.dir > 0 ? 1 : 0,
        filter,
      }}
    >
      {layer.text}
    </motion.span>
  );
}

/** One window: the layers that swap through it, clipped at its sides. */
function Slot({
  text,
  dir,
  delay,
  appear,
  physics,
  reserve,
  align,
}: {
  text: string;
  dir: 1 | -1;
  delay: number;
  appear: boolean;
  physics: Physics;
  reserve: readonly string[];
  align: "start" | "center" | "end";
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [width, setWidth] = React.useState(0);
  const [layers, setLayers] = React.useState<LayerInfo[]>(() => [
    {
      key: 0,
      text,
      role: "in",
      from: 0,
      dir,
      delay: 0,
      animate: appear,
    },
  ]);
  const [shown, setShown] = React.useState(text);
  if (shown !== text) {
    // A new value: the one there leaves the way the new one travels, and the
    // new one is pushed on from `travel` window-widths out.
    setShown(text);
    const from = physics.motionSafe
      ? Math.round(dir * physics.travel * Math.max(width, 8))
      : 0;
    setLayers((list) => {
      const next = list.reduce((m, l) => Math.max(m, l.key), 0) + 1;
      const kept = list
        .map((l) => (l.role === "in" ? { ...l, role: "out" as const, dir } : l))
        .slice(-2);
      // The arrival waits a beat, so the old value has started to clear.
      return [
        ...kept,
        {
          key: next,
          text,
          role: "in",
          from,
          dir,
          delay: delay + (physics.motionSafe ? LEAD : 0),
          animate: true,
        },
      ];
    });
  }

  const onGone = React.useCallback((key: number) => {
    setLayers((list) => list.filter((l) => l.key !== key));
  }, []);

  const bind = React.useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(() => setWidth(Math.round(node.offsetWidth)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  return (
    <span
      ref={bind}
      className={cn(
        "relative inline-grid overflow-x-clip",
        align === "center"
          ? "justify-items-center"
          : align === "end"
            ? "justify-items-end"
            : "justify-items-start",
      )}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <defs>
          {layers.map((l) => (
            <filter
              key={l.key}
              id={`${uid}-${l.key}`}
              x="-60%"
              y="-10%"
              width="220%"
              height="120%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur id={`${uid}-${l.key}-g`} stdDeviation="0 0" />
            </filter>
          ))}
        </defs>
      </svg>
      {reserve.map((r, i) => (
        <span
          key={`r${i}`}
          aria-hidden
          className="invisible col-start-1 row-start-1 whitespace-pre"
        >
          {r}
        </span>
      ))}
      {layers.map((l) => (
        <Layer
          key={l.key}
          layer={l}
          physics={physics}
          travelPx={Math.max(width, 8) * physics.travel}
          filterId={`${uid}-${l.key}`}
          onGone={onGone}
        />
      ))}
    </span>
  );
}

/**
 * A display that swaps one value for the next with real motion. The new
 * value arrives fast from the side on a spring between flick and recoil set
 * by `overshoot`, runs past its rest, and on the way back is caught like a
 * detent — locked, with a short judder — while the old one accelerates away,
 * stretching from its trailing edge. Both carry a horizontal motion blur in
 * proportion to their own speed (an SVG blur in x only, off at rest), so the
 * faster it moves, the more it smears.
 *
 * Values come from a list that cycles while in view, or from a live value;
 * with `swap="chars"` only the characters that changed swap, staggered, so a
 * ticking count moves only its changed digits. A cycling board can be
 * paused: hover pauses it, and with keyboard focus Space pauses and resumes
 * it while Left and Right step through it. Under reduced motion values
 * cross-fade in place. The current value is always readable once by
 * assistive technology; the moving layers are hidden from it.
 */
export function PaceBoard({
  values,
  value,
  format = defaultFormat,
  index,
  defaultIndex = 0,
  onIndexChange,
  interval = 2400,
  blur = 0.6,
  overshoot = 0.5,
  speed = 1,
  travel = 0.9,
  from = "right",
  swap = "word",
  stagger = 28,
  trigger = "inView",
  paused = false,
  onPausedChange,
  progress = false,
  reserve,
  align = "start",
  as,
  label,
  live = "off",
  onSwap,
  className,
}: PaceBoardProps) {
  const Comp: React.ElementType = as ?? "span";
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const list = React.useMemo(() => values ?? [], [values]);
  const isLive = value !== undefined;
  const cycling = !isLive && list.length > 1;

  const [own, setOwn] = React.useState(() =>
    mod(Math.round(defaultIndex), Math.max(1, list.length)),
  );
  const idx = mod(Math.round(index ?? own), Math.max(1, list.length));
  const text = isLive
    ? typeof value === "number"
      ? format(value)
      : String(value)
    : (list[idx] ?? "");
  const numeric = typeof value === "number" ? value : null;

  // The last action's direction: a step back arrives from the other side.
  const [step, setStep] = React.useState<1 | -1>(1);
  const [prev, setPrev] = React.useState({
    text,
    num: numeric,
    dir: 1 as 1 | -1,
    swaps: 0,
    old: text,
  });
  let dir = prev.dir;
  let swaps = prev.swaps;
  let old = prev.old;
  if (prev.text !== text) {
    const sense: 1 | -1 =
      from === "auto" && numeric !== null && prev.num !== null
        ? numeric >= prev.num
          ? 1
          : -1
        : step;
    dir = from === "left" ? (-sense as 1 | -1) : sense;
    swaps = prev.swaps + 1;
    old = prev.text;
    setPrev({ text, num: numeric, dir, swaps, old });
  }

  const physics = React.useMemo<Physics>(
    () => ({
      motionSafe,
      overshoot: clamp01(overshoot),
      blur: clamp01(blur),
      speed: clamp(speed, 0.5, 2),
      travel: clamp(travel, 0.2, 2),
    }),
    [motionSafe, overshoot, blur, speed, travel],
  );

  /* ------------------------------- cycling ------------------------------- */

  const [held, setHeld] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [seen, setSeen] = React.useState(trigger === "mount");
  const [inView, setInView] = React.useState(false);
  const [shownPage, setShownPage] = React.useState(true);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const fill = useMotionValue(0);

  const report = React.useRef({ onIndexChange, onSwap, onPausedChange });
  React.useEffect(() => {
    report.current = { onIndexChange, onSwap, onPausedChange };
  });

  const go = React.useCallback(
    (delta: number, absolute?: number) => {
      if (list.length < 2) return;
      const next =
        absolute !== undefined
          ? mod(absolute, list.length)
          : mod(idx + delta, list.length);
      if (next === idx) return;
      setStep(delta < 0 || (absolute !== undefined && next < idx) ? -1 : 1);
      fill.jump(0);
      if (index === undefined) setOwn(next);
      report.current.onIndexChange?.(next);
    },
    [fill, idx, index, list.length],
  );

  const running =
    cycling &&
    trigger !== "manual" &&
    seen &&
    inView &&
    shownPage &&
    !paused &&
    !held &&
    !hover;

  // What is left of the current wait, ms; null for a fresh one.
  const waitLeft = React.useRef<number | null>(null);

  // A new index (from a step, the timer or the host) starts its wait afresh.
  React.useEffect(() => {
    fill.jump(0);
    waitLeft.current = null;
  }, [idx, fill]);

  // The wait keeps what is left of it across a pause. With the hairline it is
  // a motion value filling to 1 (it is drawn every frame); without it, a plain
  // timer, so a board nobody watches the progress of costs no frames at all.
  React.useEffect(() => {
    if (!running) return;
    const total = clamp(interval, 400, 60000);
    if (progress) {
      const left = Math.max(0, 1 - fill.get());
      const c = animate(fill, 1, {
        duration: (left * total) / 1000,
        ease: "linear",
        onComplete: () => go(1),
      });
      return () => c.stop();
    }
    const left = waitLeft.current ?? total;
    const started = performance.now();
    const t = window.setTimeout(() => {
      waitLeft.current = null;
      go(1);
    }, left);
    return () => {
      window.clearTimeout(t);
      waitLeft.current = Math.max(0, left - (performance.now() - started));
    };
  }, [running, idx, interval, fill, go, progress]);

  // Tell the host about each swap as it starts (not at mount).
  const swapped = React.useRef(text);
  React.useEffect(() => {
    if (swapped.current === text) return;
    swapped.current = text;
    report.current.onSwap?.(text);
  }, [text]);

  const bindRoot = React.useCallback(
    (node: HTMLElement | null) => {
      if (!node) return;
      const io = new IntersectionObserver((entries) => {
        const on = Boolean(entries[entries.length - 1]?.isIntersecting);
        setInView(on);
        if (on && trigger === "inView") setSeen(true);
      });
      io.observe(node);
      const onVisibility = () => setShownPage(!document.hidden);
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        io.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    },
    [trigger],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!cycling || event.target !== event.currentTarget) return;
    switch (event.key) {
      case " ": {
        event.preventDefault();
        const next = !held;
        setHeld(next);
        setSaid((s) => ({ n: s.n + 1, text: next ? "Paused." : "Playing." }));
        report.current.onPausedChange?.(next);
        break;
      }
      case "Enter":
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        go(1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        go(-1);
        break;
      case "Home":
        event.preventDefault();
        go(-1, 0);
        break;
      case "End":
        event.preventDefault();
        go(1, list.length - 1);
        break;
      default:
        break;
    }
  };

  /* -------------------------------- render ------------------------------- */

  const appear = swaps > 0;
  let board: React.ReactNode;
  if (swap === "chars") {
    const chars = graphemes(text);
    const before = graphemes(old);
    // Numbers line up from the right, words from the left.
    const fromEnd = align === "end" || numeric !== null;
    const n = chars.length;
    const keyAt = (i: number, len: number) =>
      fromEnd ? `e${len - 1 - i}` : `s${i}`;
    const oldBy = new Map(before.map((c, i) => [keyAt(i, before.length), c]));
    const changed = chars
      .map((c, i) => ({ i, key: keyAt(i, n), c }))
      .filter((cell) => oldBy.get(cell.key) !== cell.c);
    // The stagger starts on the side the motion comes from.
    const order = new Map(
      (dir > 0 ? [...changed].reverse() : changed).map((cell, k) => [
        cell.key,
        k,
      ]),
    );
    const gap = clamp(stagger, 0, 120) / 1000;
    board = (
      <span className="relative inline-grid">
        {reserve ? (
          <span
            aria-hidden
            className="invisible col-start-1 row-start-1 whitespace-pre"
          >
            {reserve}
          </span>
        ) : null}
        <span
          className={cn(
            "col-start-1 row-start-1 inline-flex",
            fromEnd
              ? "justify-self-end"
              : align === "center"
                ? "justify-self-center"
                : "justify-self-start",
          )}
        >
          {chars.map((c, i) => {
            const key = keyAt(i, n);
            return (
              <Slot
                key={key}
                text={c}
                dir={dir}
                delay={(order.get(key) ?? 0) * gap}
                appear={appear}
                physics={physics}
                reserve={[]}
                align="center"
              />
            );
          })}
        </span>
      </span>
    );
  } else {
    const keep = isLive
      ? [reserve ?? "", text]
      : list.length
        ? [...list]
        : [text];
    board = (
      <Slot
        text={text}
        dir={dir}
        delay={0}
        appear={appear}
        physics={physics}
        reserve={keep}
        align={align}
      />
    );
  }

  return (
    <Comp
      ref={bindRoot}
      role={cycling ? "group" : undefined}
      aria-roledescription={cycling ? "rotating text" : undefined}
      aria-label={cycling ? (label ?? "Rotating text") : undefined}
      aria-describedby={cycling ? `${uid}-hint` : undefined}
      tabIndex={cycling ? 0 : undefined}
      onKeyDown={onKeyDown}
      onClick={(event: React.MouseEvent) => {
        if (cycling && event.detail > 0) go(1);
      }}
      onPointerEnter={(event: React.PointerEvent) => {
        if (event.pointerType === "mouse") setHover(true);
      }}
      onPointerLeave={() => setHover(false)}
      className={cn(
        "relative inline-flex max-w-full align-baseline",
        cycling &&
          "cursor-pointer rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <span
        className="sr-only"
        aria-live={live === "polite" ? "polite" : undefined}
      >
        {label && !cycling ? `${label} ` : ""}
        {text}
      </span>
      <span aria-hidden className="relative inline-flex">
        {board}
        {progress && cycling ? (
          <motion.span
            className="pointer-events-none absolute inset-x-0 -bottom-[0.14em] h-px origin-left bg-current opacity-35"
            style={{ scaleX: fill }}
          />
        ) : null}
      </span>
      {cycling ? (
        <>
          <span id={`${uid}-hint`} className="sr-only">
            Space pauses or resumes; Left and Right step through.
          </span>
          <span role="status" className="sr-only">
            <span key={said.n}>{said.text}</span>
          </span>
        </>
      ) : null}
    </Comp>
  );
}
