"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionStyle,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StackExtrudeTrigger = "mount" | "inView" | "hover" | "manual";
export type StackExtrudeElement = "h1" | "h2" | "h3" | "p" | "span" | "div";

export type StackExtrudeProps = {
  /** The words, each set as its own extruded block. */
  text: string;
  /** The element rendered. @default "p" */
  as?: StackExtrudeElement;
  /** Copies in each word's stack, 2 to 32: few read as stepped slabs, many as a solid. @default 12 */
  layers?: number;
  /** How deep the extrusion runs, em. @default 0.3 */
  depth?: number;
  /** How far the pointer turns the blocks, degrees. @default 12 */
  tilt?: number;
  /** The resting angle [rotateX, rotateY], degrees; held still under reduced motion. @default [12, -18] */
  angle?: [number, number];
  /** Face colour, any CSS colour. @default "var(--foreground)" */
  face?: string;
  /** The sides' pigment, any CSS colour. @default "oklch(from var(--accent) 0.56 c h)" */
  side?: string;
  /** How much the sides darken toward the back, 0 to 1. @default 0.6 */
  shade?: number;
  /** Strength of the soft shadow on the page, 0 to 1. @default 0.5 */
  shadow?: number;
  /** The gap between block and page at rest, em. @default 0.14 */
  lift?: number;
  /** How far a press pushes the blocks into the page, 0 to 1. @default 0.7 */
  press?: number;
  /** What lifts the words off the page. @default "inView" */
  trigger?: StackExtrudeTrigger;
  /** Lift once; false lays the words flat again when it leaves view or the hover ends. @default true */
  once?: boolean;
  /** Manual trigger: true lifts, false lays flat. */
  play?: boolean;
  /** Wait before the first word lifts, ms. @default 0 */
  delay?: number;
  /** Gap between words lifting, ms. @default 90 */
  stagger?: number;
  /** Time scale of the lift springs, ms; their damping ratios are kept. @default 700 */
  duration?: number;
  /** Pointer tilt, press, and keyboard turning. @default true */
  interactive?: boolean;
  /** A press began (true) or ended (false). */
  onPressChange?: (pressed: boolean) => void;
  /** The lift has settled. */
  onComplete?: () => void;
  className?: string;
};

/** The duration the calibration springs were tuned at, ms. */
const BASE = 700;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (v: number) => Math.round(clamp01(v) * 100);

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

/** A calibration spring run `f` times slower, with its damping ratio kept. */
const timed = (s: Spring, f: number): Spring => ({
  ...s,
  stiffness: s.stiffness / (f * f),
  damping: s.damping / f,
});

/** A stagger span, ms, linear to half a second and then easing to a ceiling. */
const soften = (ms: number) =>
  ms <= 500 ? ms : 500 + (450 * (ms - 500)) / (ms - 500 + 450);

/** A CSS custom property carried by a motion value. */
const cssVar = (name: `--${string}`, value: MotionValue<string>) =>
  ({ [name]: value }) as MotionStyle;

type Cell = { h: MotionValue<number>; s: MotionValue<number> };

type WordProps = {
  word: string;
  cell: Cell;
  rx: MotionValue<number>;
  ry: MotionValue<number>;
  zs: string[];
  colours: string[];
  origin: string;
  face: string;
  bind: (node: HTMLSpanElement | null) => void;
};

/**
 * One word as a block: its side copies stacked back from the face, each at a
 * static calc() depth read from the word's height and spread variables, so a
 * frame writes two numbers per word and the browser does the rest.
 */
function Word({
  word,
  cell,
  rx,
  ry,
  zs,
  colours,
  origin,
  face,
  bind,
}: WordProps) {
  const h = useTransform(cell.h, (v) => v.toFixed(3));
  const s = useTransform(cell.s, (v) => v.toFixed(3));
  return (
    <motion.span
      ref={bind}
      className="relative inline-block whitespace-nowrap [transform-style:preserve-3d]"
      style={{
        rotateX: rx,
        rotateY: ry,
        transformOrigin: origin,
        ...cssVar("--se-h", h),
        ...cssVar("--se-s", s),
      }}
    >
      {colours.map((colour, i) => (
        <span
          key={i}
          className="pointer-events-none absolute inset-0 select-none"
          style={{
            transform: `translateZ(${zs[i + 1]})`,
            color: colour,
            opacity: "var(--se-o)",
          }}
        >
          {word}
        </span>
      ))}
      <span
        className="relative block"
        style={{
          transform: `translateZ(${zs[0]})`,
          color: `color-mix(in oklab, ${face}, black calc(var(--se-p) * 22%))`,
        }}
      >
        {word}
      </span>
    </motion.span>
  );
}

/** The word's shadow on the page: tight and dark flat, wide and pale lifted. */
function Shadow({
  word,
  cell,
  strength,
  lift,
}: {
  word: string;
  cell: Cell;
  strength: number;
  lift: number;
}) {
  const shadow = useTransform(cell.h, (v) => {
    const h = clamp(v, 0, 1.4);
    const reach = h * lift;
    const alpha = strength * (0.62 - 0.3 * clamp01(h));
    if (alpha <= 0.005) return "none";
    return `${r3(reach * 0.35)}em ${r3(0.02 + reach * 0.55)}em ${r3(0.02 + reach * 0.9)}em color-mix(in oklab, black ${pct(alpha)}%, transparent)`;
  });
  return (
    <motion.span
      className="inline-block whitespace-nowrap text-transparent"
      style={{ textShadow: shadow }}
    >
      {word}
    </motion.span>
  );
}

/* The page's visibility, read without a render-time `document`. */
type Api = {
  sync: () => void;
  halt: () => void;
};

/**
 * Type with real depth. Every word is a small block: a stack of copies set
 * back at true 3D depths under one em-based perspective, the face crisp at
 * the front, the sides in a pigment that darkens toward the back, and a soft
 * shadow on the page beneath. On arrival the words lie printed flat on the
 * page, then peel up off it one after another — each word's height on the
 * recoil spring, its stack spreading on glide a beat later — while their
 * shadows widen and pale with the height.
 *
 * The blocks turn to face the pointer on glide and drift home when it leaves;
 * a press pushes them back into the page on flick, nearest first, and they
 * pop up again on recoil in a ripple outward from the press. Arrow keys turn
 * them, Space or Enter presses, Home or Escape squares them up. Under reduced
 * motion the blocks hold their resting angle, the sides fade in, and a press
 * darkens rather than moves.
 */
export function StackExtrude(props: StackExtrudeProps) {
  return <Stack key={props.text} {...props} />;
}

function Stack({
  text,
  as = "p",
  layers = 12,
  depth = 0.3,
  tilt = 12,
  angle = [12, -18],
  face = "var(--foreground)",
  side = "oklch(from var(--accent) 0.56 c h)",
  shade = 0.6,
  shadow = 0.5,
  lift = 0.14,
  press = 0.7,
  trigger = "inView",
  once = true,
  play,
  delay = 0,
  stagger = 90,
  duration = BASE,
  interactive = true,
  onPressChange,
  onComplete,
  className,
}: StackExtrudeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const n = Math.round(clamp(layers, 2, 32));
  const d = clamp(depth, 0, 1.5);
  const gap = clamp(lift, 0, 1);
  const reach = clamp(tilt, 0, 40);
  const [restX, restY] = angle;
  const f = clamp(duration, 150, 3000) / BASE;

  const [seen, setSeen] = React.useState(false);
  const target =
    trigger === "manual" ? Boolean(play) : trigger === "mount" ? true : seen;

  const words = React.useMemo(
    () => text.split(/\s+/).filter((w) => w.length > 0),
    [text],
  );
  const cells = React.useMemo<Cell[]>(
    () => words.map(() => ({ h: motionValue(0), s: motionValue(0) })),
    [words],
  );
  const rx = useMotionValue(restX);
  const ry = useMotionValue(restY);
  const sides = useMotionValue(1);
  const pressed = useMotionValue(0);
  const sidesVar = useTransform(sides, (v) => v.toFixed(3));
  const pressedVar = useTransform(pressed, (v) => v.toFixed(3));

  // Static geometry: each copy's depth as calc() over the two variables.
  const zs = React.useMemo(
    () =>
      Array.from({ length: n + 1 }, (_, k) => {
        const spread = r3(d * (1 - k / n));
        return `calc((var(--se-h) * ${r3(gap)} + var(--se-s) * ${spread} - ${r3(d + gap)}) * 1em)`;
      }),
    [n, d, gap],
  );
  const colours = React.useMemo(
    () =>
      Array.from({ length: n }, (_, i) => {
        // Back to front, so the face's nearest slice paints last.
        const k = n - i;
        const dark = pct(clamp01(shade) * 0.82 * (k / n));
        return `color-mix(in oklab, ${side}, black ${dark}%)`;
      }),
    [n, shade, side],
  );
  const zsBackToFront = React.useMemo(
    () => [
      zs[0] as string,
      ...Array.from({ length: n }, (_, i) => zs[n - i] as string),
    ],
    [zs, n],
  );
  const origin = `50% 50% ${r3(-d / 2)}em`;

  const rootRef = React.useRef<HTMLElement | null>(null);
  const wordNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const lifts = React.useRef<AnimationPlaybackControls[]>([]);
  const turns = React.useRef<AnimationPlaybackControls[]>([]);
  const tints = React.useRef<AnimationPlaybackControls[]>([]);
  const state = React.useRef<"flat" | "up" | "lifting" | "laying">("flat");
  const held = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ onPressChange, onComplete, trigger, once });

  const stopLifts = () => {
    for (const c of lifts.current) c.stop();
    lifts.current = [];
  };
  const stopTurns = () => {
    for (const c of turns.current) c.stop();
    turns.current = [];
  };
  /** The press tint: one tween per value, replaced rather than stacked. */
  const tint = (...runs: AnimationPlaybackControls[]) => {
    for (const c of tints.current) c.stop();
    tints.current = runs;
  };

  /** The words peel up off the page, one after another. */
  const raise = () => {
    stopLifts();
    state.current = "lifting";
    const count = cells.length;
    if (!count) return;
    const done = () => {
      state.current = "up";
      latest.current.onComplete?.();
    };
    if (!motionSafe) {
      // Still blocks: the sides fade in behind faces that never move.
      sides.jump(0);
      for (const c of cells) {
        c.h.jump(1);
        c.s.jump(1);
      }
      lifts.current = [
        animate(sides, 1, {
          duration: durations.slow,
          ease: easings.enter,
          delay: delay / 1000,
          onComplete: done,
        }),
      ];
      return;
    }
    sides.jump(1);
    const span = soften(stagger * (count - 1)) / 1000;
    const up = timed(springs.recoil, f);
    const spread = timed(springs.glide, f);
    cells.forEach((c, i) => {
      const at = delay / 1000 + (count > 1 ? (span * i) / (count - 1) : 0);
      lifts.current.push(
        animate(c.h, 1, {
          ...up,
          delay: at,
          onComplete: i === count - 1 ? done : undefined,
        }),
        animate(c.s, 1, { ...spread, delay: at + 0.06 * f }),
      );
    });
  };

  /** Back down flat on the page, last word first; exits never spring. */
  const lower = () => {
    stopLifts();
    state.current = "laying";
    const count = cells.length;
    const out = { duration: durations.base, ease: easings.exit };
    if (!motionSafe) {
      lifts.current = [
        animate(sides, 0, {
          ...out,
          onComplete: () => {
            state.current = "flat";
          },
        }),
      ];
      return;
    }
    const span = soften(stagger * (count - 1)) / 1000 / 2;
    cells.forEach((c, i) => {
      const at = count > 1 ? (span * (count - 1 - i)) / (count - 1) : 0;
      lifts.current.push(
        animate(c.h, 0, {
          ...out,
          delay: at,
          onComplete:
            i === 0
              ? () => {
                  state.current = "flat";
                }
              : undefined,
        }),
        animate(c.s, 0, { ...out, delay: at }),
      );
    });
  };

  const sync = () => {
    const st = state.current;
    if (target) {
      // A lift a re-run interrupted is finished, not frozen.
      if (st === "flat" || st === "laying") raise();
      else if (st === "lifting" && !lifts.current.length) raise();
    } else if (st === "up" || st === "lifting") {
      lower();
    } else if (st === "laying" && !lifts.current.length) {
      lower();
    }
  };

  const halt = () => {
    stopLifts();
    stopTurns();
    tint();
  };

  /** Turns the blocks toward a pointer at (px, py), each -1 to 1. */
  const aim = (px: number, py: number) => {
    if (!interactive || !motionSafe || reach <= 0) return;
    stopTurns();
    turns.current = [
      animate(rx, r2(restX - py * reach * 0.75), springs.glide),
      animate(ry, r2(restY + px * reach), springs.glide),
    ];
  };

  const home = () => {
    stopTurns();
    if (!motionSafe) {
      rx.jump(restX);
      ry.jump(restY);
      return;
    }
    turns.current = [
      animate(rx, restX, springs.drift),
      animate(ry, restY, springs.drift),
    ];
  };

  /** Each word's distance from a point, as a delay: the press ripples out. */
  const ripple = (clientX: number) => {
    const root = rootRef.current;
    return cells.map((_, i) => {
      const node = wordNodes.current.get(i);
      if (!root || !node) return 0;
      const r = node.getBoundingClientRect();
      return Math.min(0.14, Math.abs(r.left + r.width / 2 - clientX) / 2600);
    });
  };

  const pressIn = (clientX: number) => {
    if (!interactive || held.current) return;
    held.current = true;
    latest.current.onPressChange?.(true);
    if (!motionSafe) {
      tint(
        animate(pressed, 1, { duration: durations.fast, ease: easings.enter }),
        animate(sides, 0.5, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    if (state.current !== "up" && state.current !== "lifting") return;
    stopLifts();
    const depthIn = clamp01(press);
    const waits = ripple(clientX);
    cells.forEach((c, i) => {
      const wait = waits[i] ?? 0;
      lifts.current.push(
        animate(c.h, r3(1 - depthIn), { ...springs.flick, delay: wait }),
        animate(c.s, r3(1 - depthIn * 0.6), { ...springs.flick, delay: wait }),
      );
    });
    tint(
      animate(pressed, clamp01(press) * 0.6, {
        duration: durations.fast,
        ease: easings.enter,
      }),
    );
  };

  const release = (clientX?: number) => {
    if (!held.current) return;
    held.current = false;
    latest.current.onPressChange?.(false);
    const lighten = animate(pressed, 0, {
      duration: durations.base,
      ease: easings.enter,
    });
    if (!motionSafe) {
      tint(
        lighten,
        animate(sides, 1, { duration: durations.base, ease: easings.enter }),
      );
      return;
    }
    tint(lighten);
    if (!target) return;
    stopLifts();
    state.current = "lifting";
    const root = rootRef.current;
    const x =
      clientX ??
      (root ? root.getBoundingClientRect().left + root.clientWidth / 2 : 0);
    const waits = ripple(x);
    cells.forEach((c, i) => {
      const wait = waits[i] ?? 0;
      lifts.current.push(
        animate(c.h, 1, {
          ...springs.recoil,
          delay: wait,
          onComplete:
            i === cells.length - 1
              ? () => {
                  state.current = "up";
                }
              : undefined,
        }),
        animate(c.s, 1, { ...springs.recoil, delay: wait + 0.03 }),
      );
    });
  };

  const centre = () => {
    const root = rootRef.current;
    if (!root) return 0;
    const r = root.getBoundingClientRect();
    return r.left + r.width / 2;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!interactive) return;
    const step = reach / 3;
    const nudge = (dx: number, dy: number) => {
      if (!motionSafe || reach <= 0) return;
      stopTurns();
      turns.current = [
        animate(
          rx,
          r2(clamp(rx.get() + dy, restX - reach * 0.75, restX + reach * 0.75)),
          springs.glide,
        ),
        animate(
          ry,
          r2(clamp(ry.get() + dx, restY - reach, restY + reach)),
          springs.glide,
        ),
      ];
    };
    switch (event.key) {
      case "ArrowLeft":
        nudge(-step, 0);
        break;
      case "ArrowRight":
        nudge(step, 0);
        break;
      case "ArrowUp":
        nudge(0, step);
        break;
      case "ArrowDown":
        nudge(0, -step);
        break;
      case "Home":
      case "Escape":
        home();
        break;
      case " ":
      case "Enter":
        if (!event.repeat) pressIn(centre());
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  React.useLayoutEffect(() => {
    api.current = { sync, halt };
    latest.current = { onPressChange, onComplete, trigger, once };
  });

  React.useEffect(() => {
    api.current?.sync();
  }, [target, motionSafe]);

  // A new resting angle, or reduced motion switching on, squares the blocks.
  React.useEffect(() => {
    rx.jump(restX);
    ry.jump(restY);
  }, [restX, restY, motionSafe, rx, ry]);

  React.useEffect(() => () => api.current?.halt(), []);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const visible = Boolean(entry?.isIntersecting);
      if (latest.current.trigger === "inView") {
        setSeen((was) => (visible ? true : latest.current.once ? was : false));
      }
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindWord = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) wordNodes.current.set(i, node);
    else wordNodes.current.delete(i);
  };

  const hover = (on: boolean) => {
    if (trigger !== "hover") return;
    setSeen((was) => (on ? true : once ? was : false));
  };

  const Tag: React.ElementType = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onPointerEnter={() => hover(true)}
        onPointerMove={(event: React.PointerEvent) => {
          const r = event.currentTarget.getBoundingClientRect();
          if (!r.width || !r.height) return;
          aim(
            clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1),
            clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1),
          );
        }}
        onPointerLeave={(event: React.PointerEvent) => {
          hover(false);
          release(event.clientX);
          home();
        }}
        onPointerDown={(event: React.PointerEvent) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          pressIn(event.clientX);
        }}
        onPointerUp={(event: React.PointerEvent) => release(event.clientX)}
        onPointerCancel={() => {
          release();
          home();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event: React.KeyboardEvent) => {
          if (event.key === " " || event.key === "Enter") release();
        }}
        onFocus={() => hover(true)}
        onBlur={() => {
          hover(false);
          release();
          home();
        }}
        className={cn(
          as === "span" ? "inline-block" : "block",
          "relative",
          interactive &&
            "touch-pan-y rounded-2 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span className="sr-only select-none">{text}</span>
        {/* The box keeps room for what stands out of it: the sides fall
            down and right of the faces, the shadow further. */}
        <motion.span
          aria-hidden
          className="relative block pt-[0.06em] pr-[0.12em] pb-[0.3em] [perspective:14em]"
          style={{
            ...cssVar("--se-o", sidesVar),
            ...cssVar("--se-p", pressedVar),
          }}
        >
          <span className="relative block [transform-style:preserve-3d]">
            <span className="pointer-events-none absolute inset-0 select-none">
              {words.map((word, i) => (
                <React.Fragment key={i}>
                  {i > 0 ? " " : null}
                  <Shadow
                    word={word}
                    cell={cells[i] as Cell}
                    strength={clamp01(shadow)}
                    lift={gap + d}
                  />
                </React.Fragment>
              ))}
            </span>
            <span className="relative block [transform-style:preserve-3d]">
              {words.map((word, i) => (
                <React.Fragment key={i}>
                  {i > 0 ? " " : null}
                  <Word
                    word={word}
                    cell={cells[i] as Cell}
                    rx={rx}
                    ry={ry}
                    zs={zsBackToFront}
                    colours={colours}
                    origin={origin}
                    face={face}
                    bind={bindWord(i)}
                  />
                </React.Fragment>
              ))}
            </span>
          </span>
        </motion.span>
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Arrow keys turn the words; hold Space to press them into the page.
        </span>
      ) : null}
    </>
  );
}
