"use client";

import * as React from "react";

import {
  animate,
  cubicBezier,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TideMaskTrigger = "mount" | "inView" | "hover" | "manual";
export type TideMaskAlign = "start" | "center";
export type TideMaskElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "div";

export type TideMaskProps = {
  /** The heading's lines: an array, or a string split on "\n". A line too long for its box wraps and rises as one block. */
  text: string | readonly string[];
  /** The element rendered. @default "h2" */
  as?: TideMaskElement;
  /** Wave height, 0 to 1 (0 is a straight rising edge; 1 is about a fifth of a line). @default 0.5 */
  amplitude?: number;
  /** Wave crests across every 10em of line. @default 2.2 */
  frequency?: number;
  /** How fast the water rises and the waves travel, 0.5 to 2. @default 1 */
  speed?: number;
  /** Delay between one line's rise and the next, ms. @default 140 */
  stagger?: number;
  /** The waterline, the wet glyphs just under it and the underline. @default "var(--accent-bright)" */
  color?: string;
  /** How strongly the glyphs just under the waterline are tinted while wet, 0 to 1. @default 0.6 */
  wet?: number;
  /** The final line's last ripple settles into a fine underline. @default true */
  underline?: boolean;
  /** How long the underline keeps rippling once it settles, and again after each hover, ms. 0 is still; Infinity ripples while on screen. @default 3200 */
  rippleFor?: number;
  /** Line alignment. @default "start" */
  align?: TideMaskAlign;
  /** When the water rises: on mount, when scrolled into view, on hover or keyboard focus, or when `active` turns true. @default "inView" */
  trigger?: TideMaskTrigger;
  /** Rise only the first time it is seen or hovered. False lowers the water when it leaves view and raises it again. @default true */
  once?: boolean;
  /** Wait before the first line starts to rise, ms. @default 100 */
  delay?: number;
  /** For `trigger="manual"`: true raises the heading, false lowers the water back over it. */
  active?: boolean;
  /** Fires when the last line has risen. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const riseEase = cubicBezier(...easings.move);

/** One line's rise at speed 1, s. */
const RISE = 0.88;
/** How deep the wet band under the waterline runs, em. */
const BAND = 0.32;
/** Points across a line's edge. */
const POINTS = 32;
/** The settled underline's ripple, px. */
const FINE = 0.6;
/** The hidden state, before the water rises: nothing below an edge past the bottom. */
const SUNK = "inset(100% 0 0 0)";

type Line = {
  text: string;
  clip: MotionValue<string>;
  wetClip: MotionValue<string>;
  wetOpacity: MotionValue<number>;
  edge: MotionValue<string>;
  edgeOpacity: MotionValue<number>;
  rise: MotionValue<number>;
  /** Reduced motion's crossfade. */
  shown: MotionValue<number>;
};

const linesOf = (text: string | readonly string[]): Line[] =>
  (typeof text === "string" ? text.split("\n") : [...text]).map((t) => ({
    text: t,
    clip: motionValue(SUNK),
    wetClip: motionValue(SUNK),
    wetOpacity: motionValue(0),
    edge: motionValue(""),
    edgeOpacity: motionValue(0),
    rise: motionValue<number>(distances.step),
    shown: motionValue(1),
  }));

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Box = { w: number; h: number; em: number };
type Under = { left: number; right: number; y: number };

type Run = {
  phase: "sunk" | "rising" | "risen";
  /** Seconds since the rise began, advanced only while the loop runs. */
  t: number;
  /** The wave's own clock, s. */
  wave: number;
  last: number;
  frame: number;
  timer: number | null;
  played: boolean;
  /** Until when the underline ripples, in wave-clock seconds. */
  rippleUntil: number;
  underBorn: boolean;
  risen: boolean[];
  lifted: boolean[];
};

type Api = {
  play: () => void;
  begin: () => void;
  lower: () => void;
  wake: () => void;
  frame: (now: number) => void;
  stir: () => void;
  measure: () => void;
};

/**
 * A multi-line heading the water lets go of, line by line. Each line sits
 * behind its own clip path whose top edge is a travelling wave — a swell and
 * a counter-running chop — and the water level runs from under the line to
 * over it on a tween, lines a stagger apart, revealing the type as it passes
 * while the letters themselves rise a step onto their line on the glide
 * spring. A thin waterline rides the edge, and the glyphs just under it are
 * wet — tinted, drying as the water moves on. The final line's last ripple is
 * left behind as a fine underline: born at the wave's height, it narrows to
 * the line's text and calms on the drift spring, ripples for `rippleFor`, and
 * stirs again when the heading is hovered or focused.
 *
 * The lines are real text, read in order and selectable; every painted layer
 * is aria-hidden. One rAF loop drives all the edges while anything moves, on
 * screen, in a visible page, and stops when the heading settles; settled
 * lines drop their clip altogether. Under reduced motion the lines crossfade
 * in with a straight edge and the underline fades in flat.
 */
export function TideMask({
  text,
  as = "h2",
  amplitude = 0.5,
  frequency = 2.2,
  speed = 1,
  stagger = 140,
  color = "var(--accent-bright)",
  wet = 0.6,
  underline = true,
  rippleFor = 3200,
  align = "start",
  trigger = "inView",
  once = true,
  delay = 100,
  active,
  onComplete,
  className,
}: TideMaskProps) {
  const motionSafe = useMotionSafe();
  const rate = clamp(speed, 0.25, 4);
  const amp = clamp01(amplitude);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const key = typeof text === "string" ? text : text.join("\n");
  const lines = React.useMemo(() => linesOf(key), [key]);

  const underPath = useMotionValue("");
  const underOpacity = useMotionValue(0);
  const underAmp = useMotionValue(0);

  const boxes = React.useRef<Box[]>([]);
  const under = React.useRef<Under>({ left: 0, right: 0, y: 0 });
  const nodes = React.useRef(new Map<number, HTMLSpanElement>());
  const texts = React.useRef(new Map<number, HTMLSpanElement>());
  const edges = React.useRef(new Map<number, SVGSVGElement>());
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const run = React.useRef<Run>({
    phase: "sunk",
    t: 0,
    wave: 0,
    last: 0,
    frame: 0,
    timer: null,
    played: false,
    rippleUntil: 0,
    underBorn: false,
    risen: [],
    lifted: [],
  });
  const api = React.useRef<Api | null>(null);
  const done = React.useRef(onComplete);
  const pump = React.useCallback((now: number) => {
    run.current.frame = 0;
    api.current?.frame(now);
  }, []);

  const riseS = RISE / rate;
  const gapS = Math.max(0, stagger) / 1000;

  /** The water's surface across a line at height `level`, px from the box top. */
  const surface = (
    box: Box,
    level: number,
    a: number,
    wave: number,
    phase: number,
  ) => {
    const lambda = (10 * box.em) / Math.max(0.2, frequency);
    const omega = 2.4 * rate;
    const pts: [number, number][] = [];
    for (let i = 0; i <= POINTS; i += 1) {
      const x = (box.w * i) / POINTS;
      const k = (2 * Math.PI * x) / lambda;
      const y =
        level +
        (a *
          (Math.sin(k - omega * wave + phase) +
            0.28 * Math.sin(2.3 * k + 1.7 * omega * wave + 1.3 + phase))) /
          1.28;
      pts.push([r2(x), r2(y)]);
    }
    return pts;
  };

  const ampFor = (box: Box) => amp * 0.22 * box.em;

  const halt = () => {
    for (const c of anims.current) c.stop();
    anims.current = [];
  };

  const stopLoop = () => {
    const r = run.current;
    if (r.frame) window.cancelAnimationFrame(r.frame);
    r.frame = 0;
    r.last = 0;
  };

  /** Every line under water, the underline gone. */
  const sink = () => {
    const r = run.current;
    stopLoop();
    halt();
    r.phase = "sunk";
    r.t = 0;
    r.underBorn = false;
    r.rippleUntil = 0;
    r.risen = lines.map(() => false);
    r.lifted = lines.map(() => false);
    for (const line of lines) {
      line.clip.set(SUNK);
      line.wetClip.set(SUNK);
      line.wetOpacity.set(0);
      line.edgeOpacity.set(0);
      line.rise.jump(motionSafe ? distances.step : 0);
      line.shown.jump(motionSafe ? 1 : 0);
    }
    underOpacity.jump(0);
    underAmp.jump(0);
  };

  const drawUnder = () => {
    const last = boxes.current[lines.length - 1];
    if (!last) return;
    const u = under.current;
    const left = u.left;
    const width = Math.max(1, u.right - u.left);
    const a = underAmp.get();
    const lambda = (10 * last.em) / Math.max(0.2, frequency) / 2;
    const omega = 2.4 * rate;
    const wave = run.current.wave;
    let d = "";
    const n = 24;
    for (let i = 0; i <= n; i += 1) {
      const x = left + (width * i) / n;
      const k = (2 * Math.PI * x) / lambda;
      // The ends are held still, so the line is drawn rather than flapping.
      const hold = Math.sin((Math.PI * i) / n) ** 0.5;
      const y =
        u.y +
        a *
          hold *
          (Math.sin(k - omega * wave) + 0.3 * Math.sin(2.1 * k + omega * wave));
      d += `${i === 0 ? "M" : "L"}${r2(x)} ${r2(y)}`;
    }
    underPath.set(d);
  };

  const frame = (now: number) => {
    const r = run.current;
    const dt = r.last ? Math.min(0.05, (now - r.last) / 1000) : 0;
    r.last = now;
    r.wave += dt;
    let busy = false;
    if (r.phase === "rising") {
      r.t += dt;
      busy = true;
      let all = true;
      lines.forEach((line, i) => {
        const box = boxes.current[i];
        if (!box || r.risen[i]) return;
        const p = clamp01((r.t - i * gapS) / riseS);
        if (p >= 1) {
          r.risen[i] = true;
          line.clip.set("none");
          line.wetClip.set(SUNK);
          line.edgeOpacity.set(0);
          return;
        }
        all = false;
        if (p <= 0) return;
        const eased = riseEase(p);
        const a = ampFor(box) * (0.35 + 0.65 * Math.sin(Math.PI * p));
        const level = lerp(box.h + a, -a, eased);
        const pts = surface(box, level, a, r.wave, i * 1.9);
        const top = pts.map(([x, y]) => `${x}px ${y}px`).join(", ");
        line.clip.set(
          `polygon(${top}, ${r2(box.w)}px ${r2(box.h + 1)}px, 0px ${r2(box.h + 1)}px)`,
        );
        const band = BAND * box.em;
        const under_ = [...pts]
          .reverse()
          .map(([x, y]) => `${x}px ${r2(y + band)}px`)
          .join(", ");
        line.wetClip.set(`polygon(${top}, ${under_})`);
        line.wetOpacity.set(r3(clamp01(wet) * Math.sin(Math.PI * p) ** 0.6));
        line.edge.set(
          pts.map(([x, y], j) => `${j === 0 ? "M" : "L"}${x} ${y}`).join(""),
        );
        line.edgeOpacity.set(r3(Math.sin(Math.PI * p) ** 0.7));
        // The type floats up once the water is a quarter of the way.
        if (!r.lifted[i] && p > 0.25) {
          r.lifted[i] = true;
          anims.current.push(animate(line.rise, 0, springs.glide));
        }
        // The final line leaves its last ripple behind as the underline,
        // born where the water crosses the underline's height.
        if (
          underline &&
          i === lines.length - 1 &&
          !r.underBorn &&
          level < under.current.y
        ) {
          r.underBorn = true;
          r.rippleUntil = r.wave + 0.6 + rippleFor / 1000;
          underAmp.jump(a);
          anims.current.push(
            animate(underOpacity, 1, {
              duration: durations.fast,
              ease: easings.enter,
            }),
            animate(underAmp, FINE, springs.drift),
          );
        }
      });
      if (all) {
        r.phase = "risen";
        for (const line of lines) line.rise.jump(0);
        done.current?.();
      }
    }
    if (underline && r.underBorn) {
      drawUnder();
      if (r.wave < r.rippleUntil || underAmp.isAnimating()) busy = true;
    }
    if (busy) r.frame = window.requestAnimationFrame(pump);
    else r.last = 0;
  };

  const wake = () => {
    const r = run.current;
    if (r.frame || !running || !motionSafe) return;
    const rippling =
      underline &&
      r.underBorn &&
      (r.wave < r.rippleUntil || underAmp.isAnimating());
    if (r.phase !== "rising" && !rippling) return;
    r.last = 0;
    r.frame = window.requestAnimationFrame(pump);
  };

  const begin = () => {
    const r = run.current;
    r.timer = null;
    if (!motionSafe) {
      // Reduced motion: a straight edge crossfade, line by line.
      r.phase = "risen";
      lines.forEach((line, i) => {
        r.risen[i] = true;
        line.clip.set("none");
        line.rise.jump(0);
        anims.current.push(
          animate(line.shown, 1, {
            duration: durations.slow,
            delay: i * gapS,
            ease: easings.enter,
          }),
        );
      });
      if (underline) {
        r.underBorn = true;
        underAmp.jump(0);
        drawUnder();
      }
      anims.current.push(
        animate(underOpacity, underline ? 1 : 0, {
          duration: durations.slow,
          delay: lines.length * gapS,
          onComplete: () => done.current?.(),
        }),
      );
      return;
    }
    r.phase = "rising";
    r.t = 0;
    wake();
  };

  const play = () => {
    const r = run.current;
    if (r.timer !== null) window.clearTimeout(r.timer);
    r.timer = null;
    r.played = true;
    sink();
    if (delay > 0) {
      r.timer = window.setTimeout(() => api.current?.begin(), delay);
    } else {
      begin();
    }
  };

  const lower = () => {
    const r = run.current;
    if (r.timer !== null) window.clearTimeout(r.timer);
    r.timer = null;
    sink();
  };

  /** A hand on the heading stirs the settled underline. */
  const stir = () => {
    const r = run.current;
    if (!underline || !r.underBorn || !motionSafe || r.phase !== "risen") {
      return;
    }
    r.rippleUntil = Math.max(r.rippleUntil, r.wave + 0.4 + rippleFor / 1000);
    const box = boxes.current[lines.length - 1];
    const kick = box ? Math.max(FINE * 2.5, ampFor(box) * 0.35) : 2;
    if (underAmp.get() < kick * 0.8) {
      underAmp.jump(kick);
      anims.current.push(animate(underAmp, FINE, springs.drift));
    }
    wake();
  };

  const measure = () => {
    boxes.current = lines.map((_, i) => {
      const node = nodes.current.get(i);
      if (!node) return { w: 0, h: 0, em: 16 };
      const em = parseFloat(getComputedStyle(node).fontSize) || 16;
      return { w: r2(node.offsetWidth), h: r2(node.offsetHeight), em };
    });
    lines.forEach((_, i) => {
      const box = nodes.current.get(i);
      const span = texts.current.get(i);
      const edge = edges.current.get(i);
      if (!box || !span) return;
      const b = box.getBoundingClientRect();
      const s = span.getBoundingClientRect();
      const em = boxes.current[i]?.em ?? 16;
      const left = r2(s.left - b.left);
      const right = r2(s.right - b.left);
      // The waterline is the water's surface, but it is drawn where the
      // words are: past them it thins out over an em and a bit.
      if (edge) {
        const fade = r2(1.2 * em);
        const mask = `linear-gradient(to right, transparent ${r2(left - fade)}px, black ${left}px, black ${right}px, transparent ${r2(right + fade)}px)`;
        edge.style.maskImage = mask;
        edge.style.setProperty("-webkit-mask-image", mask);
      }
      if (i === lines.length - 1) {
        under.current = {
          left,
          right,
          // Just under the baseline: the text's content box ends at the
          // descender, a little below where an underline sits.
          y: r2(s.bottom - b.top - 0.12 * em),
        };
      }
    });
    if (run.current.underBorn) drawUnder();
  };

  React.useLayoutEffect(() => {
    api.current = { play, begin, lower, wake, frame, stir, measure };
    done.current = onComplete;
  });

  React.useLayoutEffect(() => {
    const r = run.current;
    r.risen = lines.map(() => false);
    r.lifted = lines.map(() => false);
    api.current?.measure();
    if (r.played) api.current?.play();
    const anims_ = anims.current;
    return () => {
      for (const c of anims_) c.stop();
    };
  }, [lines]);

  const firstSafe = React.useRef(motionSafe);
  React.useEffect(() => {
    if (firstSafe.current === motionSafe) return;
    firstSafe.current = motionSafe;
    if (run.current.played) api.current?.play();
  }, [motionSafe]);

  React.useEffect(() => {
    if (trigger === "mount") api.current?.play();
  }, [trigger]);

  React.useEffect(() => {
    if (trigger !== "manual" || active === undefined) return;
    if (active) api.current?.play();
    else api.current?.lower();
  }, [trigger, active]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    const r = run.current;
    return () => {
      if (r.frame) window.cancelAnimationFrame(r.frame);
      r.frame = 0;
      r.last = 0;
    };
  }, [running, motionSafe]);

  React.useEffect(() => {
    const r = run.current;
    const anims_ = anims;
    return () => {
      if (r.timer !== null) window.clearTimeout(r.timer);
      r.timer = null;
      for (const c of anims_.current) c.stop();
      anims_.current = [];
    };
  }, []);

  const latestTrigger = React.useRef({ trigger, once });
  React.useEffect(() => {
    latestTrigger.current = { trigger, once };
  });

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        setOnScreen(entry.isIntersecting);
        const { trigger: t, once: o } = latestTrigger.current;
        if (t !== "inView") return;
        const r = run.current;
        if (entry.intersectionRatio >= 0.4 && (!r.played || !o)) {
          if (r.phase === "sunk") api.current?.play();
        } else if (!entry.isIntersecting && !o && r.played) {
          api.current?.lower();
        }
      },
      { threshold: [0, 0.4] },
    );
    watcher.observe(node);
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      watcher.disconnect();
      sizer.disconnect();
    };
  }, []);

  const bindLine = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) nodes.current.set(i, node);
    else nodes.current.delete(i);
  };
  const bindText = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) texts.current.set(i, node);
    else texts.current.delete(i);
  };
  const bindEdge = (i: number) => (node: SVGSVGElement | null) => {
    if (node) edges.current.set(i, node);
    else edges.current.delete(i);
  };

  const onEnter = () => {
    const r = run.current;
    if (trigger === "hover" && (!r.played || !once) && r.phase !== "rising") {
      play();
      return;
    }
    stir();
  };

  const Tag = as as "h2";
  const focusable = trigger === "hover";

  return (
    <Tag
      ref={bindRoot}
      tabIndex={focusable ? 0 : undefined}
      onPointerEnter={(event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType !== "touch") onEnter();
      }}
      onFocus={onEnter}
      className={cn(
        "relative py-[0.12em]",
        underline && "pb-[0.2em]",
        align === "center" && "text-center",
        focusable &&
          "rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {lines.map((line, i) => (
        <span key={i} className="relative block">
          <motion.span
            ref={bindLine(i)}
            className="-my-[0.12em] block py-[0.12em]"
            style={{ clipPath: line.clip, opacity: line.shown }}
          >
            <motion.span className="block" style={{ y: line.rise }}>
              <span ref={bindText(i)}>{line.text}</span>
            </motion.span>
          </motion.span>
          {motionSafe ? (
            <>
              {/* The wet copy: the same box and wrap as the line, clipped to
                  the band just under the waterline. Colour sits on a plain
                  wrapper so a new colour always lands. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 block select-none"
                style={{ color }}
              >
                <motion.span
                  className="-my-[0.12em] block py-[0.12em]"
                  style={{ clipPath: line.wetClip, opacity: line.wetOpacity }}
                >
                  <motion.span className="block" style={{ y: line.rise }}>
                    {line.text}
                  </motion.span>
                </motion.span>
              </span>
              <svg
                ref={bindEdge(i)}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -top-[0.12em] h-[calc(100%+0.24em)] w-full overflow-hidden"
                style={{ color }}
              >
                <motion.path
                  d={line.edge}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ opacity: line.edgeOpacity }}
                />
              </svg>
            </>
          ) : null}
          {underline && i === lines.length - 1 ? (
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-[0.12em] h-[calc(100%+0.32em)] w-full overflow-hidden"
              style={{ color }}
            >
              <motion.path
                d={underPath}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                strokeLinecap="round"
                style={{ opacity: underOpacity }}
              />
            </svg>
          ) : null}
        </span>
      ))}
    </Tag>
  );
}
