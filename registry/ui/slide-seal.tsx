"use client";

import * as React from "react";

import { Check, Stamp } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SlideSealColor = "crimson" | "forest" | "cobalt" | "amber";
export type SlideSealSize = "sm" | "md" | "lg";

export type SlideSealProps = {
  /** The track's words and the handle's accessible name. @default "Slide to seal" */
  label?: string;
  /** Shown once sealed, and the handle's name then. @default "Sealed" */
  sealedLabel?: string;
  /** Controlled: whether it is sealed. Setting it back to false breaks the seal. */
  sealed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultSealed?: boolean;
  /** Fires with true from the release or key that sealed it. */
  onSealedChange?: (sealed: boolean) => void;
  /** Called once, when the seal is pressed. */
  onConfirm?: () => void;
  /** Fires while the handle is dragged, with how far along the track it is, 0 to 1 (two decimals). */
  onProgressChange?: (progress: number) => void;
  /** Where a release commits, as a share of the travel, 0.5 to 0.98. @default 0.85 */
  threshold?: number;
  /** The wax: a named pigment or any CSS colour. @default "crimson" */
  seal?: SlideSealColor | (string & {});
  /** One or two letters pressed into the wax; a check when empty. @default "" */
  monogram?: string;
  /** The handle's icon before it is pressed. @default a stamp */
  icon?: React.ReactNode;
  /** How organic the wax's edge is, 0 (a coin) to 1 (a splash). @default 0.5 */
  wobble?: number;
  /** How deep the press squashes the handle and spreads the wax, 0 to 1. @default 0.5 */
  squash?: number;
  /** @default "md" */
  size?: SlideSealSize;
  /** A thock when the seal is pressed. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * Wax pigments at a fixed lightness, from the theme's own hues: sealing wax
 * is the same colour on a light page as on a dark one.
 */
const WAX: Record<SlideSealColor, string> = {
  crimson: "oklch(from var(--danger) 0.5 0.17 h)",
  forest: "oklch(from var(--success) 0.48 0.1 h)",
  cobalt: "oklch(from var(--accent) 0.47 0.15 h)",
  amber: "oklch(from var(--warn) 0.68 0.14 calc(h - 12))",
};

type Geometry = {
  track: number;
  knob: number;
  text: string;
  icon: string;
  mono: number;
  pitch: number;
};

const SIZES: Record<SlideSealSize, Geometry> = {
  sm: {
    track: 48,
    knob: 40,
    text: "text-[13px]",
    icon: "size-4",
    mono: 15,
    pitch: 1.15,
  },
  md: {
    track: 56,
    knob: 48,
    text: "text-sm",
    icon: "size-[18px]",
    mono: 18,
    pitch: 1,
  },
  lg: {
    track: 64,
    knob: 56,
    text: "text-[15px]",
    icon: "size-5",
    mono: 21,
    pitch: 0.9,
  },
};

const INSET = 4;
/** Where the wax starts forming, before the threshold, as a share of travel. */
const FORM = 0.3;
const POINTS = 18;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
/** A stable −1…1 per point (unsigned shifts, so never negative before scaling). */
const NOISE = Array.from({ length: POINTS }, (_, i) => {
  const h = (Math.imul(i + 11, 2654435761) ^ Math.imul(i + 3, 40503)) >>> 0;
  return ((h % 2000) / 1000 - 1) * (i % 3 === 0 ? 1 : 0.6);
});

/** A closed, smooth outline through POINTS radii: Catmull-Rom as cubic Béziers. */
function blobPath(cx: number, cy: number, radius: number, amp: number) {
  if (radius < 0.5) return "";
  const pts = NOISE.map((n, i) => {
    const a = (i / POINTS) * Math.PI * 2 + 0.3;
    const r = radius * (1 + amp * n);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
  const at = (i: number) => pts[(i + POINTS) % POINTS] ?? [cx, cy];
  const f = (v: number) => r2(v);
  let d = `M${f(at(0)[0])} ${f(at(0)[1])}`;
  for (let i = 0; i < POINTS; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

type Wax = { d: string; gx: number; gy: number; grx: number; gry: number };

/**
 * A slide-to-confirm strip whose handle is a seal stamp. The handle follows
 * the finger 1:1 along the track, rubber-banding past either end, and the
 * track's words dissolve letter by letter as it passes. Near the end a wax
 * seal forms on the mark — a molten blob that grows from a dot to just wider
 * than the handle as the handle closes on the threshold, and recedes if it
 * backs off. Released past the threshold, or flicked so the throw would land
 * past it, the handle slams onto the wax on the flick spring with the release
 * velocity and presses it: it squashes, the wax splats out past its rim on the
 * recoil spring, a thock sounds, and the handle's face turns into the seal
 * itself with the monogram pressed into it. Released short, it springs back
 * on the glide spring with the release velocity.
 *
 * The handle is a native button: Enter or Space runs the whole slide and
 * presses the seal, and a tap without a drag nudges it as a hint. Under
 * reduced motion the handle still follows the finger, the wax fades in where
 * it would grow, and the press is a cross-fade with no squash.
 */
export function SlideSeal({
  label = "Slide to seal",
  sealedLabel = "Sealed",
  sealed,
  defaultSealed = false,
  onSealedChange,
  onConfirm,
  onProgressChange,
  threshold = 0.85,
  seal = "crimson",
  monogram = "",
  icon,
  wobble = 0.5,
  squash = 0.5,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: SlideSealProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `seal-hint-${uid}`;
  const glossId = `seal-gloss-${uid}`;
  const g = SIZES[size] ?? SIZES.md;
  const K = g.knob;
  const T = g.track;
  const S = K + 16;
  const thr = Math.min(0.98, Math.max(0.5, threshold));
  const wax = WAX[seal as SlideSealColor] ?? seal;
  const k = clamp01(squash);
  const wob = clamp01(wobble);

  const [done, setDone] = React.useState(() => sealed ?? defaultSealed);
  const [said, setSaid] = React.useState("");
  const [check, setCheck] = React.useState(0);

  const x = useMotionValue(0);
  const width = useMotionValue(0);
  const press = useMotionValue(done ? 1 : 0);
  const squish = useMotionValue(0);
  const face = useMotionValue(done ? 1 : 0);

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const handleRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const st = React.useRef({
    sealed: done,
    sealing: false,
    start: 0,
    reported: -1,
  });
  const api = React.useRef<{
    sealNow: (velocity: number, via: "drag" | "key" | "host") => void;
    breakSeal: () => void;
  } | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const travelOf = (w: number) => Math.max(1, w - K - 2 * INSET);
  const travel = () => travelOf(width.get());

  const report = (p: number) => {
    const v = Math.round(clamp01(p) * 100) / 100;
    if (v === st.current.reported) return;
    st.current.reported = v;
    onProgressChange?.(v);
  };

  const pressSeal = (via: "drag" | "key" | "host") => {
    const s = st.current;
    s.sealing = false;
    s.sealed = true;
    if (via !== "host") {
      const rect = handleRef.current?.getBoundingClientRect();
      audio.play("thock", {
        pitch: g.pitch,
        gain: 0.7,
        pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
      });
    }
    if (motionSafe) {
      run(
        "squish",
        animate(squish, 1, {
          ...springs.flick,
          onComplete: () => run("squish", animate(squish, 0, springs.recoil)),
        }),
      );
      run("press", animate(press, 1, springs.recoil));
    } else {
      halt("press");
      press.jump(1);
    }
    run(
      "face",
      animate(face, 1, {
        duration: durations.base,
        delay: motionSafe ? 0.06 : 0,
        ease: easings.enter,
      }),
    );
    setDone(true);
    setSaid(`${sealedLabel}.`);
    if (via !== "host") {
      report(1);
      onSealedChange?.(true);
      onConfirm?.();
      if (sealed !== undefined) {
        React.startTransition(() => setCheck((c) => c + 1));
      }
    }
  };

  const sealNow = (velocity: number, via: "drag" | "key" | "host") => {
    const s = st.current;
    if (s.sealed || s.sealing || (disabled && via !== "host")) return;
    s.sealing = true;
    const to = travel();
    const finish = () => pressSeal(via);
    if (!motionSafe) {
      run(
        "x",
        animate(x, to, {
          duration: durations.fast,
          ease: easings.enter,
          onComplete: finish,
        }),
      );
    } else if (via === "drag") {
      // The slam: the shortest spring, carrying the throw, no overshoot into
      // the end of the track.
      run(
        "x",
        animate(x, to, { ...springs.flick, velocity, onComplete: finish }),
      );
    } else {
      run(
        "x",
        animate(x, to, {
          duration: 0.36,
          ease: easings.move,
          onComplete: finish,
        }),
      );
    }
  };

  const springBack = (velocity: number) => {
    report(0);
    if (!motionSafe) {
      run(
        "x",
        animate(x, 0, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    run("x", animate(x, 0, { ...springs.glide, velocity }));
  };

  const breakSeal = () => {
    const s = st.current;
    if (!s.sealed && !s.sealing) return;
    s.sealed = false;
    s.sealing = false;
    s.reported = -1;
    run(
      "face",
      animate(face, 0, { duration: durations.base, ease: easings.exit }),
    );
    run(
      "press",
      animate(press, 0, { duration: durations.base, ease: easings.exit }),
    );
    run(
      "x",
      animate(
        x,
        0,
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.enter },
      ),
    );
    setDone(false);
    setSaid("");
  };

  React.useEffect(() => {
    api.current = { sealNow, breakSeal };
  });

  // What the host says. A release acts at once and reports; a host that
  // refuses gets its own state back on the next check.
  React.useEffect(() => {
    if (sealed === undefined) return;
    const s = st.current;
    if (sealed && !s.sealed && !s.sealing) api.current?.sealNow(0, "host");
    if (!sealed && (s.sealed || s.sealing)) api.current?.breakSeal();
  }, [sealed, check]);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const w = track.getBoundingClientRect().width;
      width.set(w);
      // A sealed handle stays on the seal whatever the width.
      if (st.current.sealed && !anims.current.has("x")) x.jump(travelOf(w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    return () => ro.disconnect();
    // travelOf only depends on the knob size, which re-runs this through K.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [K, width, x]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || done,
    onStart: () => {
      halt("x");
      st.current.start = x.get();
    },
    onMove: ({ offset }) => {
      const to = travel();
      const raw = st.current.start + offset.x;
      const v =
        raw < 0
          ? rubberband(raw, K)
          : raw > to
            ? to + rubberband(raw - to, K)
            : raw;
      x.set(r2(v));
      report(v / to);
    },
    onEnd: ({ velocity }) => {
      const to = travel();
      const at = x.get() / to;
      const landing = project(x.get(), velocity.x, 0.99) / to;
      if (Math.max(at, landing) >= thr) sealNow(velocity.x, "drag");
      else springBack(velocity.x);
    },
    onCancel: () => springBack(0),
    onTap: () => {
      if (!motionSafe || st.current.sealed) return;
      // A hint: the handle hops toward the seal and comes back.
      run(
        "x",
        animate(x, 14, {
          ...springs.flick,
          onComplete: () => run("x", animate(x, 0, springs.snap)),
        }),
      );
    },
  });

  const progress = useTransform(
    [x, width] as MotionValue<number>[],
    ([v = 0, w = 0]: number[]) => clamp01(v / travelOf(w)),
  );
  const formed = useTransform(progress, (p) =>
    smooth((p - (thr - FORM)) / FORM),
  );
  const waxShape = useTransform(
    [formed, press, squish] as MotionValue<number>[],
    ([f = 0, pr = 0, sq = 0]: number[]): Wax => {
      const grow = motionSafe ? f : f > 0 || pr > 0 ? 1 : 0;
      const spread = lerp(0.04, 0.16, k);
      const radius =
        (K / 2) *
        Math.max(grow * (0.18 + 0.9 * grow), pr > 0 ? 1.08 : 0) *
        (1 + spread * pr + 0.05 * k * sq);
      const amp = lerp(0.012, 0.07, wob) * (0.7 + 0.8 * Math.min(1, pr));
      // The splat may overhang the track a little, never the component.
      const r = Math.min(radius, (T / 2 + 5) / (1 + amp));
      const c = S / 2;
      return {
        d: blobPath(c, c, r, amp),
        gx: r2(c - r * 0.3),
        gy: r2(c - r * 0.4),
        grx: r2(r * 0.42),
        gry: r2(r * 0.2),
      };
    },
  );
  const waxD = useTransform(waxShape, (w) => w.d);
  const glossX = useTransform(waxShape, (w) => w.gx);
  const glossY = useTransform(waxShape, (w) => w.gy);
  const glossRx = useTransform(waxShape, (w) => w.grx);
  const glossRy = useTransform(waxShape, (w) => w.gry);
  const waxOpacity = useTransform(
    [formed, press] as MotionValue<number>[],
    ([f = 0, pr = 0]: number[]) =>
      motionSafe ? (f > 0.001 || pr > 0.001 ? 1 : 0) : r2(Math.max(f, pr)),
  );
  const markOpacity = useTransform(formed, (f) => r2(1 - f));
  const textMask = useTransform(x, (v) => {
    const a = r2(INSET + v + K - 10);
    return `linear-gradient(90deg, transparent ${a}px, black ${r2(a + 28)}px)`;
  });
  const scaleX = useTransform(squish, (s) => r2(1 - 0.05 * k * s));
  const scaleY = useTransform(squish, (s) => r2(1 - 0.14 * k * s));
  const stampOpacity = useTransform(face, (f) => r2(1 - f));
  const labelOpacity = useTransform(face, (f) => r2(1 - f));

  const shade = "color-mix(in oklab, var(--wax) 68%, black)";
  const light = "color-mix(in oklab, var(--wax) 62%, white)";

  return (
    <div
      className={cn("relative w-full max-w-[432px] p-1.5", className)}
      style={{ ["--wax" as string]: wax } as React.CSSProperties}
    >
      <span id={hintId} className="sr-only">
        Drag the seal to the end of the track, or press Enter.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
      <div
        ref={trackRef}
        className={cn(
          "relative w-full rounded-full bg-surface-2",
          disabled && "opacity-50",
        )}
        style={{ height: T }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border border-hairline"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[5px] h-1.5 w-px bg-ink-3/40"
          style={{
            left: `calc(${INSET + K / 2}px + (100% - ${K + 2 * INSET}px) * ${thr})`,
          }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-dashed border-ink-3/45"
          style={{
            top: INSET,
            right: INSET,
            width: K,
            height: K,
            opacity: markOpacity,
          }}
        />
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center font-medium whitespace-nowrap text-ink-2",
            g.text,
          )}
          style={{
            paddingLeft: K + 2 * INSET,
            paddingRight: K + 2 * INSET,
            opacity: labelOpacity,
            maskImage: textMask,
            WebkitMaskImage: textMask,
          }}
        >
          {label}
        </motion.span>
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center gap-1.5 font-medium whitespace-nowrap text-foreground",
            g.text,
          )}
          style={{ paddingRight: K + 2 * INSET, opacity: face }}
        >
          {sealedLabel}
        </motion.span>

        <svg
          aria-hidden
          width={S}
          height={S}
          viewBox={`0 0 ${S} ${S}`}
          className="pointer-events-none absolute block overflow-visible"
          style={{ right: INSET + K / 2 - S / 2, top: T / 2 - S / 2 }}
        >
          <defs>
            <radialGradient id={glossId}>
              <stop
                offset="0"
                style={{ stopColor: "white", stopOpacity: 0.42 }}
              />
              <stop offset="1" style={{ stopColor: "white", stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <motion.g style={{ opacity: waxOpacity }}>
            <motion.path
              d={waxD}
              strokeWidth={1}
              style={{ fill: "var(--wax)", stroke: shade }}
            />
            <motion.ellipse
              cx={glossX}
              cy={glossY}
              rx={glossRx}
              ry={glossRy}
              fill={`url(#${glossId})`}
            />
          </motion.g>
        </svg>

        <motion.button
          ref={handleRef}
          type="button"
          aria-label={done ? sealedLabel : label}
          aria-describedby={hintId}
          aria-disabled={done || undefined}
          disabled={disabled}
          onClick={(event) => {
            // Pointer presses arrive through the drag's tap; a click with no
            // pointer behind it (Enter, Space, assistive tech) seals.
            if (event.detail === 0) sealNow(0, "key");
          }}
          {...drag}
          className={cn(
            "absolute z-10 rounded-full outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            done
              ? "cursor-default"
              : disabled
                ? "cursor-not-allowed"
                : "cursor-grab touch-pan-y active:cursor-grabbing",
          )}
          style={{
            top: INSET,
            left: INSET,
            width: K,
            height: K,
            x,
            scaleX,
            scaleY,
          }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center rounded-full border border-hairline-strong bg-card text-ink-2 shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent),0_6px_14px_-6px_color-mix(in_oklab,black_28%,transparent)]"
            style={{ opacity: stampOpacity }}
          >
            <span className={cn("inline-flex", g.icon)}>
              {icon ?? <Stamp className="size-full" />}
            </span>
          </motion.span>
          <motion.span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center rounded-full"
            style={{
              opacity: face,
              background: `radial-gradient(circle at 35% 30%, ${light} 0%, var(--wax) 45%, ${shade} 100%)`,
            }}
          >
            <span
              className="absolute inset-[5px] rounded-full border"
              style={{
                borderColor: shade,
                boxShadow: `inset 0 1px 0 ${light}, 0 1px 0 ${light}`,
              }}
            />
            {monogram ? (
              <span
                className="relative font-semibold tracking-tight"
                style={{
                  fontSize: g.mono,
                  lineHeight: 1,
                  color: shade,
                  textShadow: `0 1px 0 ${light}`,
                }}
              >
                {monogram.slice(0, 2)}
              </span>
            ) : (
              <Check
                className={cn("relative", g.icon)}
                strokeWidth={2.5}
                style={{
                  color: shade,
                  filter: `drop-shadow(0 1px 0 ${light})`,
                }}
              />
            )}
          </motion.span>
        </motion.button>
      </div>
    </div>
  );
}
