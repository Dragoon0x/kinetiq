"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PaperCreaseTrigger = "mount" | "inView" | "hover" | "manual";
export type PaperCreaseElement = "h1" | "h2" | "h3" | "p" | "div";

export type PaperCreaseProps = {
  /** The headline; each `\n` starts a new line, and each line folds as its own strip. */
  text: string;
  /** The element rendered. @default "p" */
  as?: PaperCreaseElement;
  /** Panels per line, 2 to 4: one fewer creases. @default 3 */
  folds?: number;
  /** How fast the creases open, 0.5 to 2. @default 1 */
  speed?: number;
  /** Depth of the crease shadow, the glare and the paper's shading, 0 to 1. @default 0.5 */
  shade?: number;
  /** How visible the crease lines stay once the letter is open, 0 to 1. @default 0.4 */
  crease?: number;
  /** How far the paper refolds under the pointer or focus, 0 (flat) to 1. @default 0.5 */
  memory?: number;
  /** The colour of the back of the paper. @default "var(--card)" */
  paper?: string;
  /** The text colour. @default "currentColor" */
  ink?: string;
  /** Crinkle as each crease opens, for the visitor's press. Off unless asked for. @default false */
  sound?: boolean;
  /** What unfolds the letter. @default "inView" */
  trigger?: PaperCreaseTrigger;
  /** Unfold once; false folds it up again when it leaves view or the hover ends. @default true */
  once?: boolean;
  /** Manual trigger: true unfolds, false folds. */
  play?: boolean;
  /** Wait before the first crease opens, ms. @default 0 */
  delay?: number;
  /** Gap between creases opening, ms. @default 160 */
  stagger?: number;
  /** Time scale of the hinge spring, ms; its damping ratio is kept. @default 380 */
  duration?: number;
  /** Hover memory, and a press (or Enter or Space) folds it and opens it again. @default true */
  interactive?: boolean;
  /** A fold or an unfold settled: "open" or "folded". */
  onComplete?: (state: "open" | "folded") => void;
  className?: string;
};

/** The duration the snap spring was tuned at, ms. */
const BASE = 300;
/** The hinge's default time, ms: a sheet is slower than a switch. */
const HINGE = 380;
/** The most creases a line can have. */
const MAX_CREASES = 3;
/** Each nesting level sits this much in front of its parent, px, so folded
 *  flaps stack in the right order instead of fighting for the same plane. */
const NEST = [0, 0.6, 0.3, 0.15];

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

const soften = (ms: number) =>
  ms <= 500 ? ms : 500 + (450 * (ms - 500)) / (ms - 500 + 450);

/**
 * How far from facing the reader a panel is, 0 (flat) to 1 (edge-on). The
 * sine, not 1 − cos: a crease bent a few degrees should already catch light.
 */
const turn = (net: number) =>
  clamp01(Math.abs(Math.sin((net * Math.PI) / 180)));

type PanelProps = {
  k: number;
  n: number;
  line: string;
  angles: MotionValue<number>[];
  shade: number;
  crease: number;
  paper: string;
  ink: string;
  motionSafe: boolean;
};

/**
 * Panel k of a line, and inside it every panel below: each hangs from the
 * bottom edge of the one above and turns about its own top edge, so opening a
 * crease carries the rest of the letter with it.
 */
function Panel({
  k,
  n,
  line,
  angles,
  shade,
  crease,
  paper,
  ink,
  motionSafe,
}: PanelProps) {
  const own = angles[k - 1];
  const chain = angles.slice(0, Math.max(0, k));
  const fallback = useMotionValue(0);
  const net = useTransform(chain.length ? chain : [fallback], (list) =>
    (list as number[]).reduce((sum, a) => sum + a, 0),
  );
  // Folded, each level sits a hair in front of its parent so the flaps stack
  // in order; flat, it lies exactly in the sheet so the strips meet cleanly.
  const nest = NEST[k] ?? 0;
  const lean = useTransform(own ?? fallback, (a) =>
    motionSafe && Math.abs(a) > 1 ? nest : 0,
  );
  const band = 100 / n;

  // The face of the panel: a crease shadow at the hinge and a glare band that
  // slides down the panel as it comes flat, both fading as it settles.
  const facePaint = useTransform(net, (a) => {
    const u = turn(a);
    if (!motionSafe || u < 0.002 || shade <= 0) {
      return `linear-gradient(${ink}, ${ink})`;
    }
    const t = (k / n) * 100;
    const dark = `color-mix(in oklab, ${ink}, black ${pct(shade * 0.9 * u)}%)`;
    const glare = `color-mix(in oklab, ${ink}, white ${pct(shade * 0.7 * Math.sin(Math.PI * u))}%)`;
    const g = t + band * clamp01(1 - u);
    return `linear-gradient(to bottom, ${dark} ${r2(t)}%, ${ink} ${r2(t + band * 0.4)}%, ${ink} ${r2(g - band * 0.3)}%, ${glare} ${r2(g)}%, ${ink} ${r2(g + band * 0.3)}%)`;
  });
  // The back of the paper darkens as it turns edge-on to the light.
  const backPaint = useTransform(net, (a) => {
    const u = turn(a);
    return `linear-gradient(to bottom, color-mix(in oklab, black ${pct(shade * 0.35 * u)}%, transparent), color-mix(in oklab, black ${pct(shade * 0.12 + shade * 0.3 * u)}%, transparent))`;
  });

  return (
    <motion.span
      className="absolute inset-x-0 block [transform-style:preserve-3d]"
      style={{
        top: k === 0 ? 0 : "100%",
        height: k === 0 ? `${r3(band)}%` : "100%",
        z: lean,
        rotateX: own && motionSafe ? own : 0,
        originX: 0.5,
        originY: 0,
      }}
    >
      {/* The panel's window onto the line: a flat leaf in the 3D scene that
          clips by overflow. A clip-path here is dropped by the compositor
          once the panel tips back past flat. */}
      <span className="absolute inset-0 block overflow-hidden [backface-visibility:hidden]">
        <motion.span
          className="absolute inset-x-0 block px-[0.12em] whitespace-pre-wrap [-webkit-text-fill-color:transparent]"
          style={{
            top: `${-k * 100}%`,
            height: `${n * 100}%`,
            color: ink,
            backgroundImage: facePaint,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
          }}
        >
          {line}
        </motion.span>
      </span>
      {k > 0 && crease > 0 ? (
        <span
          className="absolute inset-x-[0.12em] top-0 block h-px [backface-visibility:hidden]"
          style={{
            opacity: r2(crease),
            background: `linear-gradient(to right, transparent, color-mix(in oklab, ${ink} 22%, transparent) 12%, color-mix(in oklab, ${ink} 22%, transparent) 88%, transparent)`,
          }}
        />
      ) : null}
      {k > 0 ? (
        // The sheet bleeds a pixel past its panel, so the cut edges of the
        // letters folded under it never show at its rim.
        <motion.span
          className="absolute inset-x-0 -inset-y-px block rounded-1 shadow-[0_0_0_1px_var(--hairline-strong)] [backface-visibility:hidden]"
          style={{
            backgroundColor: paper,
            backgroundImage: backPaint,
            rotateX: 180,
          }}
        />
      ) : null}
      {k + 1 < n ? (
        <Panel
          k={k + 1}
          n={n}
          line={line}
          angles={angles}
          shade={shade}
          crease={crease}
          paper={paper}
          ink={ink}
          motionSafe={motionSafe}
        />
      ) : null}
    </motion.span>
  );
}

type Api = {
  sync: () => void;
  press: () => void;
  memory: (on: boolean) => void;
  halt: () => void;
};

/**
 * A headline that unfolds like a letter. Each line is a strip of paper cut
 * into panels along horizontal creases; the panels are nested hinges, each
 * hanging from the one above, and folded they are rolled toward the reader
 * so all that shows is the blank back of the first flap. Unfolding opens
 * crease after crease on the snap spring — a sheet flopping open and
 * settling — and as each panel turns, its back darkens toward edge-on, its
 * face catches a crease shadow at the hinge and a glare that slides down it,
 * and a faint crease stays in the paper once it is flat.
 *
 * Paper has memory: under the pointer, or with focus, the creases refold a
 * few degrees in a zig-zag and catch the light. A press — or Enter or Space —
 * folds the letter up, last crease first, and opens it again, with a crinkle
 * per crease when `sound` is on. Under reduced motion nothing turns: the
 * folded strip and the open text cross-fade, and the creases stay as lines.
 */
export function PaperCrease({
  text,
  as = "p",
  folds = 3,
  speed = 1,
  shade = 0.5,
  crease = 0.4,
  memory = 0.5,
  paper = "var(--card)",
  ink = "currentColor",
  sound = false,
  trigger = "inView",
  once = true,
  play,
  delay = 0,
  stagger = 160,
  duration = HINGE,
  interactive = true,
  onComplete,
  className,
}: PaperCreaseProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const n = Math.round(clamp(folds, 2, MAX_CREASES + 1));
  const rate = clamp(speed, 0.25, 4);
  const f = clamp(duration, 80, 2000) / BASE / rate;

  const [seen, setSeen] = React.useState(false);
  const target =
    trigger === "manual" ? Boolean(play) : trigger === "mount" ? true : seen;

  const lines = React.useMemo(
    () => text.split("\n").map((l) => l.replace(/\s+/g, " ").trim()),
    [text],
  );
  // Every line keeps a hinge for the most creases it could have, so changing
  // `folds` never resets the ones in use.
  const hinges = React.useMemo(
    () =>
      lines.map(() =>
        Array.from({ length: MAX_CREASES }, () => motionValue(180)),
      ),
    [lines],
  );
  const veil = useMotionValue(1);
  const veilOpacity = useTransform(veil, (v) => r2(v));
  const textOpacity = useTransform(veil, (v) => r2(1 - v));

  const rootRef = React.useRef<HTMLElement | null>(null);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const state = React.useRef<"folded" | "opening" | "open" | "folding">(
    "folded",
  );
  const hovering = React.useRef(false);
  const api = React.useRef<Api | null>(null);
  const latest = React.useRef({ onComplete, trigger, once });

  const halt = () => {
    for (const r of runs.current) r.stop();
    runs.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const used = () => hinges.flatMap((line) => line.slice(0, n - 1));

  const settle = (to: "open" | "folded") => {
    state.current = to;
    latest.current.onComplete?.(to);
    if (to === "open" && hovering.current) memoryFold(true);
  };

  /** Crease after crease, line after line: each flap swings flat on snap. */
  const unfold = (voiced: boolean) => {
    halt();
    state.current = "opening";
    // Creases a smaller `folds` left unused stay open, out of the way.
    hinges.forEach((line) => line.slice(n - 1).forEach((h) => h.jump(0)));
    const steps = used();
    const count = steps.length;
    if (!motionSafe) {
      for (const h of steps) h.jump(0);
      runs.current = [
        animate(veil, 0, {
          duration: durations.slow,
          ease: easings.enter,
          delay: delay / 1000,
          onComplete: () => settle("open"),
        }),
      ];
      return;
    }
    veil.jump(0);
    const span = soften(stagger * (count - 1)) / rate / 1000;
    const hinge = timed(springs.snap, f);
    const root = rootRef.current;
    const box = root?.getBoundingClientRect();
    steps.forEach((h, j) => {
      const at = delay / 1000 + (count > 1 ? (span * j) / (count - 1) : 0);
      runs.current.push(
        animate(h, 0, {
          ...hinge,
          delay: at,
          onComplete: j === count - 1 ? () => settle("open") : undefined,
        }),
      );
      if (voiced && box) {
        const line = Math.floor(j / (n - 1));
        timers.current.push(
          window.setTimeout(
            () =>
              audio.play("paper", {
                pitch: r2(0.85 + (j % (n - 1)) * 0.12 + line * 0.04),
                gain: 0.32,
                pan: panFrom(box.left + box.width * 0.5, root),
              }),
            Math.round(at * 1000),
          ),
        );
      }
    });
  };

  /** Folds back up, last crease first, on the exit ease. */
  const fold = (then?: () => void) => {
    halt();
    state.current = "folding";
    const steps = used().reverse();
    const count = steps.length;
    const out = { duration: durations.base / rate, ease: easings.exit };
    if (!motionSafe) {
      runs.current = [
        animate(veil, 1, {
          ...out,
          onComplete: () => {
            if (then) then();
            else settle("folded");
          },
        }),
      ];
      return;
    }
    const span = soften((stagger / 2) * (count - 1)) / rate / 1000;
    steps.forEach((h, j) => {
      runs.current.push(
        animate(h, 180, {
          ...out,
          delay: count > 1 ? (span * j) / (count - 1) : 0,
          onComplete:
            j === count - 1
              ? () => {
                  if (then) then();
                  else settle("folded");
                }
              : undefined,
        }),
      );
    });
  };

  /** Paper with memory: the creases bend back a little, in a zig-zag. */
  const memoryFold = (on: boolean) => {
    hovering.current = on;
    if (!motionSafe || state.current !== "open") return;
    const a = clamp01(memory) * 30;
    if (a <= 0 && on) return;
    halt();
    hinges.forEach((line) =>
      line.slice(0, n - 1).forEach((h, k) => {
        const to = on
          ? r2((k % 2 === 0 ? 1 : -1) * a * (k === 0 ? 1 : 1.6))
          : 0;
        runs.current.push(animate(h, to, on ? springs.snap : springs.glide));
      }),
    );
  };

  const sync = () => {
    const st = state.current;
    if (target) {
      if (
        st === "folded" ||
        st === "folding" ||
        (st === "opening" && !runs.current.length)
      ) {
        unfold(false);
      } else if (st === "open" && n > 1) {
        // Creases a larger `folds` brought in open with the rest.
        hinges.forEach((line) =>
          line.forEach((h) => {
            if (!h.isAnimating() && Math.abs(h.get()) > 90) h.jump(0);
          }),
        );
      }
    } else if (
      st === "open" ||
      st === "opening" ||
      (st === "folding" && !runs.current.length)
    ) {
      fold();
    }
  };

  /** The visitor's press: fold it up and open it again, voiced. */
  const press = () => {
    if (!interactive || !target) return;
    if (state.current === "folded") {
      unfold(true);
      return;
    }
    fold(() => unfold(true));
  };

  React.useLayoutEffect(() => {
    api.current = { sync, press, memory: memoryFold, halt };
    latest.current = { onComplete, trigger, once };
  });

  React.useEffect(() => {
    api.current?.sync();
  }, [target, motionSafe, n]);

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

  const hover = (on: boolean) => {
    if (trigger === "hover") setSeen((was) => (on ? true : once ? was : false));
    if (interactive) api.current?.memory(on);
  };

  const Tag: React.ElementType = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onPointerEnter={(event: React.PointerEvent) => {
          if (event.pointerType === "mouse") hover(true);
        }}
        onPointerLeave={(event: React.PointerEvent) => {
          if (event.pointerType === "mouse") hover(false);
        }}
        onFocus={() => hover(true)}
        onBlur={() => hover(false)}
        onClick={() => {
          const picked = window.getSelection()?.toString() ?? "";
          if (!picked.trim()) api.current?.press();
        }}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (!interactive) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          if (!event.repeat) api.current?.press();
        }}
        className={cn(
          "relative block",
          interactive &&
            "cursor-pointer rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span className="sr-only select-none">{lines.join(" ")}</span>
        <span aria-hidden className="block">
          {lines.map((line, l) => (
            <span key={l} className="block">
              <span className="relative inline-block max-w-full align-top [perspective:7em]">
                {/* The real words, invisible, holding the box and the selection. */}
                <span className="block px-[0.12em] whitespace-pre-wrap text-transparent">
                  {line}
                </span>
                <motion.span
                  className="pointer-events-none absolute inset-0 block select-none [transform-style:preserve-3d]"
                  style={{ opacity: motionSafe ? 1 : textOpacity }}
                >
                  <Panel
                    k={0}
                    n={n}
                    line={line}
                    angles={hinges[l] as MotionValue<number>[]}
                    shade={clamp01(shade)}
                    crease={clamp01(crease)}
                    paper={paper}
                    ink={ink}
                    motionSafe={motionSafe}
                  />
                </motion.span>
                {motionSafe ? null : (
                  // Reduced motion: the folded strip is drawn still, and fades.
                  <motion.span
                    className="pointer-events-none absolute inset-x-0 top-0 block rounded-1 shadow-[0_0_0_1px_var(--hairline-strong)]"
                    style={{
                      height: `${r3(100 / n)}%`,
                      backgroundColor: paper,
                      opacity: veilOpacity,
                    }}
                  />
                )}
              </span>
            </span>
          ))}
        </span>
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only">
          Press Enter to fold the letter and open it again.
        </span>
      ) : null}
    </>
  );
}
