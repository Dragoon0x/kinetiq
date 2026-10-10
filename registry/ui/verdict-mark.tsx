"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type VerdictMarkState = "pending" | "success" | "warning" | "error";
export type VerdictMarkSize = "sm" | "md" | "lg" | "xl";

export type VerdictMarkProps = {
  /** What the mark says: spinning while pending, then the outcome. @default "pending" */
  state?: VerdictMarkState;
  /** Fires once an outcome has finished settling (after the flick, the drop or the shake). */
  onSettle?: (state: Exclude<VerdictMarkState, "pending">) => void;
  /** 20, 32, 48 or 72px, or any number of px. @default "md" */
  size?: VerdictMarkSize | number;
  /** The stroke's weight, in units of the mark's 48-unit box. @default 3.5 */
  stroke?: number;
  /** The word for each state: the spoken status, and the label when shown. @default Working, Done, Needs attention, Failed */
  labels?: Partial<Record<VerdictMarkState, string>>;
  /** Show the label beside the mark; it rolls to each new word. @default false */
  showLabel?: boolean;
  /** The colour for each state, mixed in oklab as it changes. Any CSS colours. @default accent, success, warn, danger */
  colors?: Partial<Record<VerdictMarkState, string>>;
  /** How fast the pending arc turns, in turns per second. @default 1.1 */
  speed?: number;
  /** Draw the ring: a hairline track while pending, a tinted disc once settled. @default true */
  ring?: boolean;
  /** How far an error shakes, in units of the 48-unit box. @default 3 */
  shake?: number;
  /** The least time the spinner shows, in ms, so a quick result never flashes past it. @default 400 */
  minPending?: number;
  /** Speak each new state politely. Off: the mark is an image named by its label. @default true */
  announce?: boolean;
  /** A tick when it settles well, a buzz when it fails. Off unless asked for; never before the page has had a press or a key. @default false */
  sound?: boolean;
  className?: string;
};

type Pt = readonly [number, number];
type Shape = [Pt[], Pt[]];

const N = 18;
const C = 24;
const R = 19;
const LABELS: Record<VerdictMarkState, string> = {
  pending: "Working",
  success: "Done",
  warning: "Needs attention",
  error: "Failed",
};
const COLORS: Record<VerdictMarkState, string> = {
  pending: "var(--accent-bright)",
  success: "var(--success)",
  warning: "var(--warn)",
  error: "var(--danger)",
};
const PX: Record<VerdictMarkSize, number> = { sm: 20, md: 32, lg: 48, xl: 72 };
const TEXT: Record<VerdictMarkSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};
const ORDER: VerdictMarkState[] = ["pending", "success", "warning", "error"];
/** How far behind the head of the stroke its tail arrives, as a share of the morph. */
const STAGGER = 0.35;
const REST_SPAN = 115;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const line = (a: Pt, b: Pt): Pt[] =>
  Array.from({ length: N }, (_, i): Pt => {
    const t = i / (N - 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });

/** An arc on the ring, in degrees, split into its two halves. */
function arc(rho: number, span: number): Shape {
  const half = (from: number, to: number) =>
    Array.from({ length: N }, (_, i): Pt => {
      const a = ((from + ((to - from) * i) / (N - 1)) * Math.PI) / 180;
      return [C + R * Math.cos(a), C + R * Math.sin(a)];
    });
  const a0 = rho - span / 2;
  return [half(a0, rho), half(rho, rho + span / 2)];
}

/** The outcomes, each as the two strokes it is drawn with. */
const GLYPHS: Record<Exclude<VerdictMarkState, "pending">, Shape> = {
  success: [line([15.4, 24.6], [21.3, 30.5]), line([21.3, 30.5], [32.8, 18])],
  // The dot is one spot drawn as a round cap; a hair of length keeps every
  // renderer drawing it.
  warning: [line([24, 13.8], [24, 26.8]), line([24, 33.4], [24, 33.42])],
  error: [line([17, 17], [31, 31]), line([31, 17], [17, 31])],
};

const shapeOf = (s: VerdictMarkState, rho = -90, span = REST_SPAN): Shape =>
  s === "pending" ? arc(rho, span) : GLYPHS[s];

const pathOf = (pts: readonly Pt[], dy = 0) =>
  `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y + dy)}`).join(" L ")}`;

/**
 * The two strokes partway from one shape to another, head first. A stroke
 * that ends as a single spot (the exclamation's dot) shrinks into it all at
 * once instead of trailing a tail.
 */
function between(from: Shape, to: Shape, t: number, spot = false): Shape {
  const out: Shape = [[], []];
  for (let s = 0; s < 2; s++) {
    const a = from[s] ?? [];
    const b = to[s] ?? [];
    const into = out[s] ?? [];
    for (let i = 0; i < N; i++) {
      const u = spot && s === 1 ? 0.6 : (s * N + i) / (2 * N - 1);
      const k = Math.max(0, (t - u * STAGGER) / (1 - STAGGER));
      const p = a[i] ?? [C, C];
      const q = b[i] ?? [C, C];
      into.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
    }
  }
  return out;
}

const heard = () =>
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation?.hasBeenActive === true;

/**
 * A status mark that settles on the outcome. While pending, an arc spins on
 * the ring with its length breathing; when the state changes, that arc —
 * still turning as it goes — flows point by point into the outcome, the
 * head of the stroke leading and its tail following, so the stroke draws
 * itself into a check, an exclamation or a cross. Each outcome settles its
 * own way: the check draws on springs.flick, the exclamation's dot drops in
 * on springs.recoil, the cross shakes once. The colour moves with it, mixed
 * in oklab, and the ring turns from a hairline track into a tinted disc.
 *
 * It is a polite status: each new state is said once, and `minPending`
 * keeps a quick result from flashing past the spinner. Under reduced motion
 * the arc holds still and breathes in opacity, and outcomes cross-fade.
 */
export function VerdictMark({
  state = "pending",
  onSettle,
  size = "md",
  stroke = 3.5,
  labels,
  showLabel = false,
  colors,
  speed = 1.1,
  ring = true,
  shake = 3,
  minPending = 400,
  announce = true,
  sound = false,
  className,
}: VerdictMarkProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const L = { ...LABELS, ...labels };
  const palette = { ...COLORS, ...colors };
  const px = typeof size === "number" ? Math.max(12, size) : (PX[size] ?? 32);
  const text =
    typeof size === "number"
      ? px < 26
        ? "text-xs"
        : px < 44
          ? "text-sm"
          : px < 64
            ? "text-base"
            : "text-lg"
      : (TEXT[size] ?? "text-sm");
  const weight = Math.min(8, Math.max(1, stroke));

  const [shown, setShown] = React.useState(state);
  const [last, setLast] = React.useState<VerdictMarkState | null>(null);
  const [inView, setInView] = React.useState(true);
  const [hidden, setHidden] = React.useState(false);

  const initial = shapeOf(state);
  const dA = useMotionValue(pathOf(initial[0]));
  const dB = useMotionValue(pathOf(initial[1]));
  const tint = useMotionValue(palette[state]);
  const settled = useMotionValue(state === "pending" ? 0 : 1);
  const shakeX = useMotionValue(0);
  const glyphOpacity = useMotionValue(1);
  /** The reduced-motion cross-fade, apart from the pending breath. */
  const swap = useMotionValue(1);
  // The track fades as the tinted disc arrives, but never quite away.
  const track = useTransform(settled, (v) => r2(1 - v * 0.7));

  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  /** What the strokes are drawing right now, so a change starts from there. */
  const drawn = React.useRef<Shape>(initial);
  const spin = React.useRef({ rho: -90, span: REST_SPAN, raf: 0, t0: 0 });
  const pendingSince = React.useRef(0);
  const morphing = React.useRef(false);
  const colorTo = React.useRef(palette[state]);
  const latest = React.useRef({ speed, onSettle, palette });
  const spinAllowed = React.useRef(false);
  const startSpinRef = React.useRef<() => void>(() => {});
  const recolorRef = React.useRef<(to: string) => void>(() => {});
  /** The exclamation's dot, dropping in: its offset, and whether the flow still draws it. */
  const dot = React.useRef({ y: 0, flowing: false });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const draw = (shape: Shape, dy = 0) => {
    drawn.current = shape;
    dA.set(pathOf(shape[0]));
    dB.set(pathOf(shape[1], dy));
  };

  const recolor = (to: string) => {
    const from = colorTo.current;
    colorTo.current = to;
    if (from === to) return;
    run(
      "tint",
      animate(0, 100, {
        duration: durations.slow,
        ease: easings.enter,
        onUpdate: (m) =>
          tint.set(`color-mix(in oklab, ${to} ${Math.round(m)}%, ${from})`),
      }),
    );
  };

  /** Settled: the callback, and the sound, if the page has been pressed. */
  const done = (s: VerdictMarkState) => {
    morphing.current = false;
    if (s === "pending") return;
    latest.current.onSettle?.(s);
  };

  const stopSpin = () => {
    const sp = spin.current;
    if (sp.raf) cancelAnimationFrame(sp.raf);
    sp.raf = 0;
  };

  /** The pending arc's turn and breath, one frame at a time. */
  const startSpin = () => {
    stopSpin();
    const sp = spin.current;
    let prev = performance.now();
    let phase = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      phase += dt;
      sp.rho = (sp.rho + latest.current.speed * 360 * dt) % 360;
      sp.span = REST_SPAN + 45 * Math.sin(phase * 2 * Math.PI * 0.55);
      draw(arc(sp.rho, sp.span));
      sp.raf = requestAnimationFrame(frame);
    };
    sp.raf = requestAnimationFrame(frame);
  };
  /** The flow from what is drawn to the next state, and its settle. */
  const morph = (next: VerdictMarkState) => {
    const from = drawn.current;
    const wasSpinning = spin.current.raf !== 0;
    stopSpin();
    morphing.current = true;
    recolor(latest.current.palette[next]);
    run(
      "settled",
      animate(settled, next === "pending" ? 0 : 1, {
        duration: durations.slow,
        ease: easings.enter,
      }),
    );
    if (!motionSafe) {
      run(
        "fade",
        animate(swap, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            draw(shapeOf(next));
            run(
              "fade",
              animate(swap, 1, {
                duration: durations.fast,
                ease: easings.enter,
                onComplete: () => {
                  if (next === "success" && heard()) {
                    audio.play("tick", { pitch: 1.4, gain: 0.5 });
                  }
                  if (next === "error" && heard()) {
                    audio.play("buzz", { gain: 0.4 });
                  }
                  done(next);
                  if (next === "pending") startSpinRef.current();
                },
              }),
            );
          },
        }),
      );
      return;
    }
    swap.set(1);
    // A shake still running from a failure goes home first.
    if (shakeX.get() !== 0) {
      run("shake", animate(shakeX, 0, { duration: durations.fast }));
    }
    // The arc keeps turning a little as it gathers, so the flow carries
    // the spin's momentum into the glyph.
    const sp = spin.current;
    const carry = wasSpinning ? latest.current.speed * 360 * 0.22 : 0;
    const toPending = next === "pending";
    const target: Shape = toPending
      ? arc(sp.rho + 50, REST_SPAN)
      : GLYPHS[next];
    if (toPending) {
      sp.rho += 50;
      sp.span = REST_SPAN;
    }
    const transition =
      next === "success"
        ? springs.flick
        : next === "error"
          ? springs.snap
          : springs.glide;
    // The warning's dot gathers above its place and drops in, bouncing,
    // while the bar is still flowing; the two settle together.
    let open = next === "warning" ? 2 : 1;
    const finish = () => {
      open -= 1;
      if (open > 0) return;
      draw(target);
      done(next);
    };
    dot.current = { y: next === "warning" ? -7 : 0, flowing: true };
    if (next === "warning") {
      run(
        "dot",
        animate(-7, 0, {
          ...springs.recoil,
          delay: 0.18,
          onUpdate: (v) => {
            dot.current.y = v;
            if (!dot.current.flowing) dB.set(pathOf(GLYPHS.warning[1], v));
          },
          onComplete: finish,
        }),
      );
    } else {
      anims.current.get("dot")?.stop();
    }
    run(
      "morph",
      animate(0, 1, {
        ...transition,
        onUpdate: (t) => {
          const src = carry
            ? arc(sp.rho + carry * (1 - (1 - clamp01(t)) ** 2), sp.span)
            : from;
          draw(between(src, target, t, next === "warning"), dot.current.y);
        },
        onComplete: () => {
          dot.current.flowing = false;
          if (next === "pending") {
            draw(target);
            done(next);
            startSpinRef.current();
            return;
          }
          if (next === "success") {
            if (heard()) audio.play("tick", { pitch: 1.4, gain: 0.5 });
            finish();
            return;
          }
          if (next === "warning") {
            if (heard()) audio.play("tick", { pitch: 0.8, gain: 0.45 });
            finish();
            return;
          }
          draw(target);
          if (heard()) audio.play("buzz", { gain: 0.4 });
          const a = Math.max(0, shake);
          run(
            "shake",
            animate(shakeX, [0, -a, a * 0.8, -a * 0.5, a * 0.25, 0], {
              duration: 0.36,
              ease: easings.move,
              onComplete: finish,
            }),
          );
        },
      }),
    );
  };

  React.useEffect(() => {
    latest.current = { speed, onSettle, palette };
    startSpinRef.current = () => {
      if (spinAllowed.current) startSpin();
    };
    recolorRef.current = recolor;
  });

  // A new colour for the state on show glides in like any other change.
  const shownColor = palette[shown];
  React.useEffect(() => {
    if (!morphing.current) recolorRef.current(shownColor);
  }, [shownColor]);

  // The state the mark shows: an outcome waits until the spinner has had
  // its `minPending`.
  React.useEffect(() => {
    if (state === shown) return;
    const wait =
      shown === "pending"
        ? Math.max(0, minPending - (performance.now() - pendingSince.current))
        : 0;
    const id = window.setTimeout(() => {
      setLast(shown);
      setShown(state);
    }, wait);
    return () => window.clearTimeout(id);
  }, [state, shown, minPending]);

  // Each shown state is drawn once, from whatever was drawn before it.
  const drawnState = React.useRef(shown);
  React.useEffect(() => {
    if (drawnState.current === shown) return;
    drawnState.current = shown;
    if (shown === "pending") pendingSince.current = performance.now();
    morph(shown);
    // Answers the shown state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // The spin runs only while pending, on screen, visible and allowed.
  const spinning = shown === "pending" && motionSafe && inView && !hidden;
  React.useEffect(() => {
    spinAllowed.current = spinning;
    if (!spinning) {
      stopSpin();
      return;
    }
    if (!morphing.current) startSpin();
    return () => stopSpin();
    // Starts and stops with the conditions only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  // Reduced motion: a still arc that breathes, only while it is seen.
  const breathing = shown === "pending" && !motionSafe && inView && !hidden;
  React.useEffect(() => {
    if (!breathing) {
      anims.current.get("breath")?.stop();
      glyphOpacity.set(1);
      return;
    }
    run(
      "breath",
      animate(glyphOpacity, [1, 0.45, 1], {
        duration: 1.8,
        ease: easings.move,
        repeat: Infinity,
      }),
    );
    // Starts and stops with the conditions only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breathing]);

  React.useEffect(() => {
    if (!pendingSince.current) pendingSince.current = performance.now();
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) setInView(e.isIntersecting);
    });
    io.observe(root);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    const sp = spin.current;
    return () => {
      if (sp.raf) cancelAnimationFrame(sp.raf);
      sp.raf = 0;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const word = L[shown];
  const a11y = announce
    ? { role: "status" as const, "aria-live": "polite" as const }
    : { role: "img" as const, "aria-label": word };

  return (
    <span
      ref={rootRef}
      {...a11y}
      className={cn(
        "inline-flex items-center gap-2.5 align-middle",
        text,
        className,
      )}
    >
      <motion.svg
        aria-hidden
        width={px}
        height={px}
        viewBox="0 0 48 48"
        className="block shrink-0"
        style={{ color: tint }}
      >
        {ring ? (
          <>
            <motion.circle
              cx={C}
              cy={C}
              r={R}
              fill="none"
              strokeWidth={r2(Math.max(1.5, weight * 0.55))}
              className="stroke-hairline-strong"
              style={{ opacity: track }}
            />
            <motion.circle
              cx={C}
              cy={C}
              r={R}
              fill="currentColor"
              fillOpacity={0.1}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeWidth={r2(Math.max(1.5, weight * 0.55))}
              style={{ opacity: settled }}
            />
          </>
        ) : null}
        <motion.g style={{ x: shakeX, opacity: glyphOpacity }}>
          <motion.g style={{ opacity: swap }}>
            <motion.path
              d={dA}
              fill="none"
              stroke="currentColor"
              strokeWidth={weight}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <motion.path
              d={dB}
              fill="none"
              stroke="currentColor"
              strokeWidth={weight}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.g>
        </motion.g>
      </motion.svg>
      {announce ? <span className="sr-only">{word}</span> : null}
      {showLabel ? (
        <span aria-hidden className="grid overflow-clip leading-tight">
          {ORDER.map((s) => {
            const current = s === shown;
            const leaving = s === last && !current;
            return (
              <motion.span
                key={s}
                className={cn(
                  "col-start-1 row-start-1 whitespace-nowrap",
                  current ? "text-foreground" : "text-ink-3",
                )}
                initial={false}
                animate={{
                  y: current ? "0%" : leaving ? "-70%" : "70%",
                  opacity: current ? 1 : 0,
                }}
                transition={
                  !motionSafe
                    ? { duration: durations.fast }
                    : current
                      ? springs.snap
                      : leaving
                        ? { duration: durations.fast, ease: easings.exit }
                        : { duration: 0 }
                }
              >
                {L[s]}
              </motion.span>
            );
          })}
        </span>
      ) : null}
    </span>
  );
}
