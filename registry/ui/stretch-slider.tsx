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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StretchSliderProps = {
  /** Controlled value, `min` to `max`. */
  value?: number;
  /** Initial value when uncontrolled. @default min */
  defaultValue?: number;
  /** Fires from the drag or key that changed it, with the new value. */
  onValueChange?: (value: number) => void;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** The value's resolution and one arrow key's move. @default 1 */
  step?: number;
  /** What the slider sets. Its accessible name, shown over the band. */
  label: string;
  /** The reading over the band, the captions and the spoken value. @default String(value) */
  format?: (value: number) => string;
  /**
   * How rubbery the band is, 0 to 1: how far it gives for the same pull, and
   * how long it rings when let go. @default 0.5
   */
  elasticity?: number;
  /** The furthest the band stretches past a peg, in px. @default 40 */
  maxStretch?: number;
  /**
   * Equal divisions that carry magnetic detents, 0 to 10. 0: none, a plain
   * precise slider. @default 3
   */
  snapPoints?: number;
  /** The band's thickness at rest, in px. @default 8 */
  thickness?: number;
  /** The creak of a stretch and the twang of a release. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const THUMB_R = 11;
const GRAB_R = 12.5;
/** The band's own strip: room for the thumb and its focus ring. */
const BAND_H = 44;
const CY = BAND_H / 2;
/** The strip plus a row of captions. */
const SVG_H = 60;
/** A width to draw with before the real one is measured: server and client agree on it. */
const GUESS = 320;
/**
 * How much of a stretch goes into the neck by the pulled end, at full
 * stretch. The profile is 1 + neck × (1/5 − w⁴) along the band, whose mean is
 * 1, so the area holds while the thinning gathers near the finger.
 */
const NECK = 0.9;
/** How close, in px, a snap point pulls the thumb onto itself. */
const MAGNET = 6;
/** Release speed the thumb keeps to itself before it counts as a throw, px/s. */
const DEAD_ZONE = 500;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r6 = (v: number) => Number(v.toFixed(6));

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type Geo = {
  /** Where the left peg sits. */
  xL: number;
  /** Peg to peg: the band's rest length. */
  L: number;
  /** Rest thickness. */
  T: number;
  /** The furthest the band may stretch past a peg. */
  reach: number;
};

/**
 * The band, as one closed path, for a thumb at `f` (0 to 1 between the pegs,
 * past them when stretched). Stretched, it runs from the far peg to the thumb
 * and keeps its area: the average thickness is the rest thickness times the
 * rest length over the stretched one. A band held by a finger thins first
 * near the finger, so the thinning is shaped into a neck at the pulled end;
 * the profile's mean is kept, so the area still holds, and the anchored end
 * never swells past its rest thickness.
 */
function bandPath(f: number, g: Geo): string {
  const x = g.xL + clamp(f * g.L, -g.reach, g.L + g.reach);
  const right = x > g.xL + g.L;
  const left = x < g.xL;
  const a = left ? x : g.xL;
  const b = right ? x : g.xL + g.L;
  const len = Math.max(1, b - a);
  const s = Math.max(0, len - g.L);
  const avg = (g.T * g.L) / len;
  // The neck is capped so the anchored end is never thicker than at rest.
  const neck = Math.min(
    NECK * (g.reach > 0 ? Math.min(1, s / g.reach) : 0),
    (5 * s) / g.L,
  );
  const th = (p: number) => {
    const w = right ? p : left ? 1 - p : 0;
    return avg * (1 + neck * (0.2 - w ** 4));
  };
  const steps = 12;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = i / steps;
    const px = r2(a + p * len);
    const h = th(p) / 2;
    top.push(`${px} ${r2(CY - h)}`);
    bottom.unshift(`${px} ${r2(CY + h)}`);
  }
  const rl = r2(th(0) / 2);
  const rr = r2(th(1) / 2);
  return `M${top.join("L")}A${rr} ${rr} 0 0 1 ${bottom[0]}L${bottom.join("L")}A${rl} ${rl} 0 0 1 ${top[0]}Z`;
}

type Held = {
  rect: DOMRect;
  /** Where on the thumb it was grabbed, so it never jumps under the finger. */
  grab: number;
  /** The value when the drag began, for Escape. */
  from: number;
  /** The snap point the thumb is stuck to, or -1. */
  mark: number;
};

type Api = {
  sync: () => void;
  abort: () => void;
  caught: (stretch: number) => void;
  stretchOf: (f: number) => number;
  interrupt: () => void;
};

/**
 * A slider whose track is a rubber band. In range it is a precise slider:
 * the thumb is 1:1 under the finger, grabbed where it was touched so it never
 * jumps, and snap points catch it within a few pixels with a quiet detent.
 * Pull past either end and the thumb lifts the band off that peg and
 * stretches it — longer and thinner, keeping its area, necking where the
 * finger pulls — with less give the further it goes, and a creak that rises
 * with the tension. Let go and it snaps back on a spring that takes the
 * release velocity and rings as long as `elasticity` says, with a twang
 * pitched by how far it was pulled. A flick throws the thumb; a throw that
 * runs into an end is caught by the band and twangs back.
 *
 * The band is one path rebuilt each frame from the thumb's motion value; the
 * value fill is the same band in accent through a clip whose width follows
 * the thumb. It is a real `role="slider"`: arrows step, Page keys jump between
 * snap points, Home and End go to the ends, and a key that would go past an
 * end plucks the band — the same end state, the same twang. Under reduced
 * motion the band still stretches under the finger but never rings.
 */
export function StretchSlider({
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  format,
  elasticity = 0.5,
  maxStretch = 40,
  snapPoints = 3,
  thickness = 8,
  sound = false,
  disabled = false,
  className,
}: StretchSliderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const labelId = `stretch-label-${uid}`;
  const clipId = `stretch-fill-${uid}`;

  const lo = Math.min(min, max);
  const hi = Math.max(min, max, lo + 1e-6);
  const span = hi - lo;
  const unit = step > 0 ? step : 1;
  const e = clamp01(elasticity);
  const reach = clamp(maxStretch, 0, 160);
  const T = clamp(thickness, 2, 24);
  const divisions = clamp(Math.round(snapPoints), 0, 50);
  const say = format ?? ((v: number) => String(v));

  const quant = (v: number) =>
    r6(clamp(lo + Math.round((v - lo) / unit) * unit, lo, hi));
  const frac = (v: number) => (clamp(v, lo, hi) - lo) / span;
  const valueAt = (f: number) => quant(lo + clamp01(f) * span);

  const [width, setWidth] = React.useState(GUESS);
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width ?? 0;
      if (w > 0) setWidth(Math.round(w));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  const gutter = reach + THUMB_R + 5;
  const L = Math.max(24, width - 2 * gutter);
  const xL = gutter;
  const geo: Geo = { xL, L, T, reach };

  const [own, setOwn] = React.useState(() => quant(defaultValue ?? lo));
  const current = quant(value ?? own);
  const [check, setCheck] = React.useState(0);

  // Snap points sit on values the slider can hold, so the magnet and the
  // value never disagree by a step.
  const markValues =
    divisions > 0
      ? [
          ...new Set(
            Array.from({ length: divisions + 1 }, (_, k) =>
              quant(lo + (k / divisions) * span),
            ),
          ),
        ]
      : [];
  const marks = markValues.map(frac);

  const u = useMotionValue(frac(current));
  const grab = useMotionValue(0);
  const pulse = useMotionValue(0);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const growing = React.useRef<AnimationPlaybackControls | null>(null);
  const pulsing = React.useRef<AnimationPlaybackControls | null>(null);
  const loop = React.useRef<LoopHandle | null>(null);
  const held = React.useRef<Held | null>(null);
  const catching = React.useRef(false);
  const goal = React.useRef(current);
  const restF = React.useRef(frac(current));
  const reported = React.useRef(current);
  const detach = React.useRef<(() => void) | null>(null);
  const api = React.useRef<Api | null>(null);

  const ring = spring(lerp(700, 260, e), lerp(0.75, 0.22, e));
  const give = lerp(0.25, 1.3, e);
  const omega = Math.sqrt(ring.stiffness);
  // A throw is capped so the ring's first swing stays inside the reach.
  const cap = (vx: number) =>
    clamp(vx, -reach * omega * 1.1, reach * omega * 1.1);

  const stretchOf = (f: number) => (f > 1 ? (f - 1) * L : f < 0 ? -f * L : 0);

  const stop = () => {
    running.current?.stop();
    running.current = null;
  };

  /** Moves the thumb to rest at `f`. `vx` is px/s, as the pointer measured it. */
  const moveTo = (
    f: number,
    kind: "flick" | "glide" | "snap" | "ring",
    vx?: number,
  ) => {
    stop();
    if (!motionSafe) {
      if (kind === "ring") {
        running.current = animate(u, f, {
          duration: durations.fast,
          ease: easings.enter,
        });
      } else {
        u.set(f);
      }
      return;
    }
    if (vx === undefined && Math.abs(u.get() - f) < 1e-6) {
      u.set(f);
      return;
    }
    running.current = animate(u, f, {
      ...(kind === "ring" ? ring : springs[kind]),
      velocity: vx !== undefined ? vx / L : u.getVelocity(),
    });
  };

  const grow = (to: number) => {
    growing.current?.stop();
    if (!motionSafe) {
      grab.set(0);
      return;
    }
    growing.current = animate(grab, to, springs.flick);
  };

  const panAt = (f: number) =>
    node ? panFrom(node.getBoundingClientRect().left + xL + f * L, node) : 0;

  const twang = (k: number, f: number) => {
    const t = clamp01(k);
    audio.play("twang", {
      pitch: r2(0.8 + 0.8 * t),
      gain: r2(0.35 + 0.35 * t),
      pan: panAt(f),
    });
  };

  const creak = (k: number, f: number) => {
    const t = clamp01(k);
    const tone = { pitch: r2(0.7 + 0.9 * t), gain: r2(0.3 + 0.4 * t) };
    if (loop.current) loop.current.set(tone);
    else loop.current = audio.start("creak", { ...tone, pan: panAt(f) });
  };

  const quiet = () => {
    loop.current?.stop();
    loop.current = null;
  };

  const detent = (f: number) => {
    audio.play("detent", {
      pitch: r2(0.9 + 0.3 * clamp01(f)),
      gain: 0.3,
      pan: panAt(f),
    });
  };

  /** The nearest snap point within the magnet's reach, or none. */
  const magnet = (f: number) => {
    let best = -1;
    let dist = MAGNET / L;
    marks.forEach((m, i) => {
      const d = Math.abs(m - f);
      if (d <= dist) {
        dist = d;
        best = i;
      }
    });
    return { f: best >= 0 ? (marks[best] ?? f) : f, mark: best };
  };

  const report = (v: number) => {
    if (v === reported.current) return;
    reported.current = v;
    if (value === undefined) setOwn(v);
    onValueChange?.(v);
  };

  const commit = (v: number) => {
    goal.current = v;
    restF.current = frac(v);
    report(v);
    // A controlled host answers in this same batch; the sync after it
    // leaves a taken value alone and glides a refused one back.
    setCheck((c) => c + 1);
  };

  const flash = () => {
    pulsing.current?.stop();
    pulse.set(1);
    pulsing.current = animate(pulse, 0, {
      duration: durations.slow,
      ease: easings.enter,
    });
  };

  /** A key that would go past an end: the band is plucked instead. */
  const pluck = (end: 0 | 1) => {
    twang(0.5, end);
    if (!motionSafe) {
      flash();
      return;
    }
    catching.current = false;
    moveTo(end, "ring", (end === 1 ? 1 : -1) * 0.6 * reach * omega);
  };

  const finish = () => {
    held.current = null;
    detach.current?.();
    detach.current = null;
    quiet();
    grow(0);
  };

  const settle = (vx: number) => {
    const f = u.get();
    const s = stretchOf(f);
    if (s > 0.5) {
      const end = f > 1 ? 1 : 0;
      twang(reach > 0 ? s / reach : 0, f);
      moveTo(end, "ring", cap(vx));
      commit(end === 1 ? hi : lo);
      return;
    }
    // A slow release lands where the finger lifted; only speed past the dead
    // zone is a throw, carried on a heavy surface.
    const thrown = Math.sign(vx) * Math.max(0, Math.abs(vx) - DEAD_ZONE);
    const dest = f + project(0, thrown, 0.99) / L;
    if (dest > 1 || dest < 0) {
      const end = dest > 1 ? 1 : 0;
      if (motionSafe) {
        catching.current = true;
        moveTo(end, "ring", cap(vx));
      } else {
        u.set(end);
        twang(0.5, end);
      }
      commit(end === 1 ? hi : lo);
      return;
    }
    const m = magnet(dest);
    const v = valueAt(m.f);
    moveTo(
      frac(v),
      thrown !== 0 ? "glide" : "flick",
      thrown !== 0 ? vx : undefined,
    );
    commit(v);
  };

  const abort = () => {
    const h = held.current;
    if (!h) return;
    finish();
    moveTo(frac(h.from), "glide");
    commit(h.from);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const sx = point.x - offset.x - rect.left;
      const thumbX = xL + u.get() * L;
      const onThumb = Math.abs(sx - thumbX) <= THUMB_R + 6;
      stop();
      catching.current = false;
      held.current = {
        rect,
        grab: onThumb ? sx - thumbX : 0,
        from: goal.current,
        mark: -1,
      };
      grow(1);
      // Escape puts the thumb back; it is claimed so the stage stays open.
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !held.current) return;
        event.preventDefault();
        api.current?.abort();
      };
      document.addEventListener("keydown", onKey);
      detach.current = () => document.removeEventListener("keydown", onKey);
    },
    onMove: ({ point }) => {
      const h = held.current;
      if (!h) return;
      const raw = (point.x - h.rect.left - h.grab - xL) / L;
      if (raw > 1 || raw < 0) {
        const s = rubberband((raw > 1 ? raw - 1 : raw) * L, reach, give);
        const f = raw > 1 ? 1 + s / L : s / L;
        u.set(r6(f));
        h.mark = -1;
        creak(reach > 0 ? Math.abs(s) / reach : 0, f);
        report(raw > 1 ? hi : lo);
        return;
      }
      quiet();
      const m = magnet(raw);
      if (m.mark >= 0 && m.mark !== h.mark) detent(m.f);
      h.mark = m.mark;
      u.set(r6(m.f));
      report(valueAt(m.f));
    },
    onEnd: ({ velocity }) => {
      if (!held.current) return;
      finish();
      settle(velocity.x);
    },
    onCancel: () => {
      if (!held.current) return;
      finish();
      settle(0);
    },
    onTap: (event) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const m = magnet(clamp01((event.clientX - rect.left - xL) / L));
      const v = valueAt(m.f);
      if (m.mark >= 0) detent(m.f);
      catching.current = false;
      moveTo(frac(v), "snap");
      commit(v);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || held.current) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const v = goal.current;
    const tenth = Math.max(unit, quant(lo + span / 10) - lo);
    let dest: number;
    let up = false;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        dest = v + unit;
        up = true;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        dest = v - unit;
        break;
      case "PageUp":
        up = true;
        dest = markValues.length
          ? (markValues.find((m) => m > v + 1e-9) ?? hi)
          : v + tenth;
        break;
      case "PageDown":
        dest = markValues.length
          ? ([...markValues].reverse().find((m) => m < v - 1e-9) ?? lo)
          : v - tenth;
        break;
      case "Home":
        dest = lo;
        break;
      case "End":
        dest = hi;
        up = true;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (up ? v >= hi : v <= lo) {
      pluck(up ? 1 : 0);
      return;
    }
    const q = quant(dest);
    if (q === v) return;
    catching.current = false;
    if (markValues.includes(q)) detent(frac(q));
    moveTo(frac(q), Math.abs(frac(q) - frac(v)) > 0.12 ? "glide" : "flick");
    commit(q);
  };

  React.useEffect(() => {
    api.current = {
      // The host's value is where the thumb rests; a drag is never
      // interrupted by the echo of its own reports.
      sync: () => {
        if (held.current) return;
        reported.current = current;
        const want = frac(current);
        if (goal.current === current && restF.current === want) return;
        goal.current = current;
        restF.current = want;
        catching.current = false;
        moveTo(want, "glide");
      },
      abort,
      caught: (s) => twang(reach > 0 ? s / reach : 0, u.get()),
      stretchOf,
      interrupt: () => {
        quiet();
        if (held.current) {
          finish();
          settle(0);
        }
      },
    };
  });

  React.useEffect(() => {
    api.current?.sync();
  }, [current, check, lo, hi]);

  // A thrown thumb that runs into an end is caught by the band: the twang
  // lands on the frame the stretch peaks and turns back.
  React.useEffect(() => {
    let prev = 0;
    return u.on("change", (f) => {
      const s = api.current?.stretchOf(f) ?? 0;
      if (catching.current && s < prev && prev > 1.5) {
        catching.current = false;
        api.current?.caught(prev);
      }
      prev = s;
    });
  }, [u]);

  React.useEffect(() => {
    const interrupted = () => api.current?.interrupt();
    const onVisibility = () => {
      if (document.hidden) interrupted();
    };
    window.addEventListener("blur", interrupted);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", interrupted);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (disabled) api.current?.interrupt();
  }, [disabled]);

  React.useEffect(
    () => () => {
      detach.current?.();
      detach.current = null;
      // Finished, not frozen: a re-run in development must not leave the
      // thumb stopped halfway back to its peg.
      running.current?.complete();
      growing.current?.complete();
      pulsing.current?.complete();
      loop.current?.stop();
      loop.current = null;
    },
    [],
  );

  const band = useTransform(u, (f) => bandPath(f, geo));
  const thumbX = useTransform(u, (f) =>
    r2(xL + clamp(f * L, -reach, L + reach)),
  );
  const thumbR = useTransform(grab, (g) =>
    r2(THUMB_R + (GRAB_R - THUMB_R) * g),
  );
  const reading = useTransform(u, (f) => say(valueAt(f)));

  const xR = xL + L;
  const guideFrom = T / 2 + 4;
  const markY = CY + Math.max(T / 2, THUMB_R) + 3;
  const captioned =
    markValues.length > 1 &&
    markValues.length <= 7 &&
    L / (markValues.length - 1) >= 36
      ? markValues
      : [lo, hi];
  const spoken =
    current >= hi
      ? `${say(current)}, the most it goes`
      : current <= lo
        ? `${say(current)}, the least it goes`
        : `${say(current)} of ${say(hi)}`;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="truncate text-sm text-foreground">
          {label}
        </span>
        <motion.span
          aria-hidden
          className="shrink-0 font-mono text-sm text-foreground tabular-nums"
        >
          {reading}
        </motion.span>
      </div>
      <div
        ref={setNode}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-orientation="horizontal"
        aria-valuemin={lo}
        aria-valuemax={hi}
        aria-valuenow={current}
        aria-valuetext={spoken}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onContextMenu={(event) => event.preventDefault()}
        {...drag}
        className={cn(
          "group/stretch-slider relative block w-full touch-pan-y outline-none select-none [-webkit-touch-callout:none]",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <svg
          aria-hidden
          width="100%"
          height={SVG_H}
          viewBox={`0 0 ${width} ${SVG_H}`}
          className="block"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.rect x={0} y={0} height={BAND_H} width={thumbX} />
            </clipPath>
          </defs>

          {reach > guideFrom + 2 ? (
            <g className="stroke-ink-3/40" strokeWidth={1} fill="none">
              <path
                d={`M${r2(xR + guideFrom)} ${CY}H${r2(xR + reach)}M${r2(xR + reach)} ${CY - 4}V${CY + 4}`}
                strokeDasharray="2 3"
              />
              <path
                d={`M${r2(xL - guideFrom)} ${CY}H${r2(xL - reach)}M${r2(xL - reach)} ${CY - 4}V${CY + 4}`}
                strokeDasharray="2 3"
              />
            </g>
          ) : null}

          {marks.length ? (
            <g className="stroke-ink-3/60" strokeWidth={1}>
              {marks.map((m) => (
                <path key={m} d={`M${r2(xL + m * L)} ${markY}V${markY + 4}`} />
              ))}
            </g>
          ) : null}

          <motion.path d={band} className="fill-ink-3/30" />
          <motion.path
            d={band}
            clipPath={`url(#${clipId})`}
            className="fill-cobalt-bright"
          />
          {[xL, xR].map((x) => (
            <circle
              key={x}
              cx={r2(x)}
              cy={CY}
              r={2}
              className="fill-card stroke-ink-3/70"
              strokeWidth={1}
            />
          ))}

          <motion.circle
            cx={thumbX}
            cy={CY + 1.5}
            r={thumbR}
            className="fill-ink/10"
          />
          <motion.circle
            cx={thumbX}
            cy={CY}
            r={thumbR}
            strokeWidth={1}
            className="fill-card stroke-hairline-strong transition-[stroke] group-hover/stretch-slider:stroke-ink-3"
          />
          <motion.circle
            cx={thumbX}
            cy={CY}
            r={3.5}
            className="fill-cobalt-bright"
          />
          <motion.circle
            cx={thumbX}
            cy={CY}
            r={THUMB_R + 2}
            fill="none"
            strokeWidth={2}
            className="stroke-cobalt-bright"
            style={{ opacity: pulse }}
          />
          <motion.circle
            cx={thumbX}
            cy={CY}
            r={THUMB_R + 4}
            fill="none"
            strokeWidth={2}
            className="stroke-ring opacity-0 group-focus-visible/stretch-slider:opacity-100"
          />

          {captioned.map((v) => (
            <text
              key={v}
              x={r2(xL + frac(v) * L)}
              y={SVG_H - 3}
              textAnchor="middle"
              className="fill-ink-3 font-mono text-[10px] tabular-nums"
            >
              {say(v)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
