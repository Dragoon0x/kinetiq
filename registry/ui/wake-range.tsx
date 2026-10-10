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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type WakeRangeSize = "sm" | "md" | "lg";

/** Pigments that read the same on a light page and a dark one. */
export type WakeRangeColor = "cobalt" | "signal" | "ember" | "rose";

export type WakeRangeProps = {
  /** Controlled value, `min` to `max`. */
  value?: number;
  /** Initial value when uncontrolled. @default min */
  defaultValue?: number;
  /** Fires from the drag, press or key that changed it, at every step it passes. */
  onValueChange?: (value: number) => void;
  /** Fires once the thumb comes to rest after a gesture or a key: the value to act on. */
  onValueCommit?: (value: number) => void;
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** The resolution when `steps` is 0. @default 1 */
  step?: number;
  /** Stops across the whole range, drawn in the channel; the thumb ticks and settles at each. 0 slides by `step`. @default 6 */
  steps?: number;
  /** How long and wide the wake runs, 0 to 1: a 0.3 s ripple, or a 1.6 s spreading wake. @default 0.6 */
  wake?: number;
  /** Colour the channel from the start to the value, catching up behind the thumb. Off leaves the foam and the wake. @default true */
  fill?: boolean;
  /** How quickly the fill catches up with the thumb, 0 to 1: a lazy tide, or brisk. @default 0.5 */
  catchUp?: number;
  /** The slider's accessible name, shown above it unless `hideLabel`. */
  label: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The reading and the spoken value. @default the value, rounded to the step */
  format?: (value: number) => string;
  /** The fill, foam, wake and thumb dot: a preset or any CSS colour. @default "cobalt" */
  color?: WakeRangeColor | (string & {});
  /** @default "md" */
  size?: WakeRangeSize;
  /** Tick at every step the thumb passes, by hand or key. Off unless asked for. @default false */
  sound?: boolean;
  /** Dims the slider and ignores pointer and keys. @default false */
  disabled?: boolean;
  /** Classes for the outer column. */
  className?: string;
};

const PALETTE: Record<WakeRangeColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "oklch(from var(--warn) 0.74 c h)",
  rose: "oklch(from var(--danger) 0.64 c h)",
};

type Metrics = {
  /** The rail's height: room for the wake above and below the channel. */
  rail: number;
  track: number;
  thumb: number;
  dot: number;
  text: string;
};

const SIZES: Record<WakeRangeSize, Metrics> = {
  sm: { rail: 28, track: 4, thumb: 16, dot: 6, text: "text-xs" },
  md: { rail: 36, track: 6, thumb: 20, dot: 8, text: "text-sm" },
  lg: { rail: 44, track: 8, thumb: 24, dot: 9, text: "text-base" },
};

/** How far past either end the thumb may be pulled, in px. */
const OVERSHOOT = 6;
/** Opacity bands the wake is drawn in, newest first. */
const BANDS = 5;
/** Wake samples kept: more than a 1.6 s wake records at one per frame. */
const RING = 160;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => `${Number((v * 100).toFixed(3))}%`;

type Mode = "drag" | "key" | "host" | null;

/**
 * A range slider seen from above like water: the channel is calm, the thumb
 * is the boat. Every frame the thumb moves it drops a wake sample — where,
 * when and how fast — and each sample's wavefront spreads away from the
 * channel above and below and fades with age, so behind a moving thumb two
 * V-lines open out like the wake behind a hull: long and shallow for a
 * throw, short for a nudge, curling where it turns. When the thumb stops the
 * wake keeps spreading and fading, and settles.
 *
 * The fill catches up on its own critically damped spring, and the stretch
 * of channel between the fill and the thumb shows as foam — always behind
 * the boat, whichever way it goes. The thumb follows a drag 1:1 and rubber-
 * bands past the ends; a press on the channel sends it there on the snap
 * spring and a drag carries on from it; a release is projected and settles on
 * the nearest step with the throw's velocity. It is a real `role="slider"`:
 * arrows step on the snap spring (so keys leave a wake too), Page keys move a
 * tenth, Home and End jump. Under reduced motion there is no wake and no lag:
 * the fill moves with the thumb and keys move it on a short tween.
 */
export function WakeRange({
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  steps = 6,
  wake = 0.6,
  fill = true,
  catchUp = 0.5,
  label,
  hideLabel = false,
  format,
  color = "cobalt",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: WakeRangeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const m = SIZES[size] ?? SIZES.md;
  const paint = (PALETTE as Record<string, string>)[color] ?? color;

  const lo = Math.min(min, max);
  const hi = Math.max(min, max, lo + 1e-6);
  const span = hi - lo;
  const stops = Math.max(0, Math.round(steps));
  const unit = stops > 0 ? span / stops : step > 0 ? step : span / 100;
  const decimals = Math.min(
    6,
    Math.max(0, (String(Number(unit.toFixed(6))).split(".")[1] ?? "").length),
  );
  const say = format ?? ((v: number) => v.toFixed(Math.min(decimals, 2)));

  const clampV = (v: number) => Math.min(hi, Math.max(lo, v));
  const quantize = (v: number) =>
    clampV(Number((lo + Math.round((v - lo) / unit) * unit).toFixed(6)));
  const toFrac = (v: number) => (v - lo) / span;
  const toValue = (f: number) => lo + f * span;

  const [own, setOwn] = React.useState(() => quantize(defaultValue ?? lo));
  const current = clampV(value ?? own);

  const start = Number(toFrac(current).toFixed(6));
  const pos = useMotionValue(start);
  const tide = useMotionValue(start);
  const [bands] = React.useState(() =>
    Array.from({ length: BANDS }, () => motionValue("")),
  );

  const railRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const reported = React.useRef(current);
  const mode = React.useRef<Mode>(null);
  const notch = React.useRef(Math.round((current - lo) / unit));
  const visible = React.useRef(true);
  const grab = React.useRef({ offset: 0, chasing: false });
  const sim = React.useRef({
    life: 900,
    open: 110,
    spread: 10,
    stiffness: 200,
    fill: true,
    motionSafe: true,
    rail: m.rail,
    track: m.track,
    pad: m.thumb / 2 + OVERSHOOT,
  });
  const api = React.useRef<{ moved: (f: number) => void } | null>(null);

  const stop = () => {
    running.current?.stop();
    running.current = null;
  };

  const report = (q: number) => {
    reported.current = q;
    if (value === undefined) setOwn(q);
    onValueChange?.(q);
  };

  const panHere = () => {
    const rect = thumbRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const tick = (v: number) =>
    audio.play("tick", {
      pitch: r2(lerp(0.85, 1.35, toFrac(v))),
      gain: 0.45,
      pan: panHere(),
    });

  /** Every frame the thumb moves: steps are counted, heard and (while dragged) reported. */
  const moved = (f: number) => {
    const v = clampV(toValue(f));
    const k = Math.round((v - lo) / unit);
    if (k === notch.current) return;
    notch.current = k;
    if (mode.current !== "drag") return;
    if (stops > 0) tick(v);
    const q = quantize(v);
    if (q !== reported.current) report(q);
  };

  React.useEffect(() => {
    api.current = { moved };
    sim.current = {
      life: lerp(300, 1600, clamp01(wake)),
      open: lerp(70, 150, clamp01(wake)),
      spread: (m.rail / 2 - m.track / 2 - 2) * lerp(0.55, 1, clamp01(wake)),
      stiffness: lerp(30, 360, clamp01(catchUp)),
      fill,
      motionSafe,
      rail: m.rail,
      track: m.track,
      pad: m.thumb / 2 + OVERSHOOT,
    };
  });

  const finish = () => {
    running.current = null;
    const q = quantize(toValue(clamp01(pos.get())));
    if (q !== reported.current) report(q);
    mode.current = null;
    onValueCommit?.(q);
  };

  /** The thumb springs to a value's place; reduced motion takes a short tween. */
  const settle = (q: number, velocity = 0, by: Mode = "key") => {
    stop();
    mode.current = by;
    const to = Number(toFrac(q).toFixed(6));
    running.current = animate(
      pos,
      to,
      motionSafe
        ? { ...springs.snap, velocity, onComplete: finish }
        : { duration: durations.fast, ease: easings.enter, onComplete: finish },
    );
  };

  // The host's value, when it is not this slider's own report coming back.
  React.useEffect(() => {
    if (current === reported.current) return;
    reported.current = current;
    if (mode.current === "drag") return;
    stop();
    mode.current = "host";
    const to = Number(toFrac(current).toFixed(6));
    running.current = animate(
      pos,
      to,
      motionSafe
        ? {
            ...springs.glide,
            onComplete: () => {
              running.current = null;
              mode.current = null;
            },
          }
        : { duration: durations.fast, ease: easings.enter },
    );
    // The host's value is the only input here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // A new range or step count re-seats the thumb where the value is.
  React.useEffect(() => {
    if (mode.current) return;
    const f = Number(((reported.current - lo) / span).toFixed(6));
    notch.current = Math.round((reported.current - lo) / unit);
    pos.jump(f);
    tide.jump(f);
  }, [lo, span, unit, pos, tide]);

  // The water: the fill's spring and the wake, on one rAF chain that runs
  // only while either is still moving, and never off screen or hidden.
  React.useEffect(() => {
    const xs = new Float64Array(RING);
    const ts = new Float64Array(RING);
    const amps = new Float64Array(RING);
    let head = 0;
    let count = 0;
    let raf = 0;
    let last = 0;
    let lastX = Number.NaN;
    let lastT = 0;
    let tideV = 0;
    let width = 0;
    let swell = 0;

    const measure = () => {
      // Layout px, not screen px: a card scaled by its page keeps its wake
      // on its channel, because the wake layer draws in layout px too.
      width = innerRef.current?.offsetWidth ?? 0;
    };
    measure();
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (railRef.current) ro?.observe(railRef.current);

    const clear = () => {
      count = 0;
      for (const b of bands) b.set("");
    };

    const draw = (now: number) => {
      const s = sim.current;
      const life = s.life;
      const mid = s.rail / 2;
      const edge = s.track / 2 + 1;
      // Wavefronts leave the hull fast and slow down: the V opens within a
      // few dozen px of the thumb and then runs beside the channel, fading.
      const tau = s.open;
      const parts: string[][] = bands.map(() => []);
      let alive = 0;
      let prevBand = -1;
      let prevTop = "";
      let prevBottom = "";
      let prevT = 0;
      // Newest to oldest, so each band's lines run away from the thumb.
      for (let n = 0; n < count; n += 1) {
        const i = (head - 1 - n + RING) % RING;
        const age = now - (ts[i] ?? 0);
        if (age >= life) break;
        alive += 1;
        const spread = s.spread * (amps[i] ?? 0) * (1 - Math.exp(-age / tau));
        const x = r2(s.pad + (xs[i] ?? 0));
        const top = `${x} ${r2(mid - edge - spread)}`;
        const bottom = `${x} ${r2(mid + edge + spread)}`;
        const band = Math.min(BANDS - 1, Math.floor((age / life) * BANDS));
        const list = parts[band];
        if (!list) continue;
        // A pause in the thumb's travel breaks the line: two wakes made apart
        // in time are two wakes, not one joined across the gap.
        const gap = prevT - (ts[i] ?? 0) > 90;
        prevT = ts[i] ?? 0;
        if (gap) {
          prevTop = "";
          prevBottom = "";
          prevBand = -1;
        }
        if (band !== prevBand) {
          // Each band starts where the last one ended, so the line is whole.
          list.push(prevTop ? `M ${prevTop} L ${top}` : `M ${top}`);
          list.push(prevBottom ? `M ${prevBottom} L ${bottom}` : `M ${bottom}`);
          prevBand = band;
        } else {
          const t = list.length - 2;
          list[t] += ` L ${top}`;
          list[t + 1] += ` L ${bottom}`;
        }
        prevTop = top;
        prevBottom = bottom;
      }
      count = alive;
      bands.forEach((b, k) => b.set(parts[k]?.join(" ") ?? ""));
      return alive > 0;
    };

    const frame = (now: number) => {
      raf = 0;
      const s = sim.current;
      const target = clamp01(pos.get());
      if (!visible.current || document.hidden || !s.motionSafe) {
        tide.set(target);
        tideV = 0;
        clear();
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      // A critically damped spring: the tide arrives without sloshing past.
      const k = s.stiffness;
      const c = 2 * Math.sqrt(k);
      let t = tide.get();
      tideV += (k * (target - t) - c * tideV) * dt;
      t += tideV * dt;
      const settled = Math.abs(target - t) < 2e-4 && Math.abs(tideV) < 2e-3;
      tide.set(settled ? target : Number(t.toFixed(5)));
      if (settled) tideV = 0;
      const waking = draw(performance.now());
      if (!settled || waking) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const onPos = (f: number) => {
      api.current?.moved(f);
      const s = sim.current;
      if (!s.motionSafe) {
        tide.set(clamp01(f));
        return;
      }
      const now = performance.now();
      const x = clamp01(f) * width;
      if (Number.isNaN(lastX)) {
        lastX = x;
        lastT = now;
      }
      const dt = now - lastT;
      if (dt >= 12 && Math.abs(x - lastX) >= 0.5) {
        const speed = Math.abs(x - lastX) / (dt / 1000);
        // Smoothed, so pointer jitter does not ripple the wake's edge.
        swell = lerp(swell, clamp01(speed / 600), 0.35);
        xs[head] = x;
        ts[head] = now;
        amps[head] = Math.sqrt(swell);
        head = (head + 1) % RING;
        count = Math.min(RING, count + 1);
        lastX = x;
        lastT = now;
      } else if (dt > 120) {
        lastX = x;
        lastT = now;
        swell = 0;
      }
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const off = pos.on("change", onPos);
    return () => {
      off();
      ro?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      clear();
    };
  }, [pos, tide, bands]);

  React.useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      visible.current = entries.some((e) => e.isIntersecting);
    });
    io.observe(rail);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => () => running.current?.stop(), []);

  const fracAt = (clientX: number) => {
    const inner = innerRef.current;
    if (!inner) return 0;
    const rect = inner.getBoundingClientRect();
    return rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
  };

  const widthNow = () => innerRef.current?.getBoundingClientRect().width || 1;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      // A press on the channel may still be carrying the thumb there: it keeps
      // chasing the finger until it catches it, then follows 1:1.
      grab.current.chasing = running.current !== null && mode.current === "key";
      if (!grab.current.chasing) stop();
      mode.current = "drag";
    },
    onMove: ({ point }) => {
      const f = fracAt(point.x) - grab.current.offset;
      const w = widthNow();
      const px = f * w;
      // Past either end the thumb gives a few px and no more: it never
      // leaves the rail's own box.
      const room = OVERSHOOT * (w / (innerRef.current?.offsetWidth || w));
      const held =
        px < 0
          ? rubberband(px, room)
          : px > w
            ? w + rubberband(px - w, room)
            : px;
      const to = Number((held / w).toFixed(5));
      if (grab.current.chasing) {
        if (Math.abs(pos.get() - to) * w < 1.5) {
          grab.current.chasing = false;
          stop();
          pos.set(to);
          return;
        }
        running.current = animate(pos, to, {
          ...springs.flick,
          velocity: pos.getVelocity(),
        });
        return;
      }
      pos.set(to);
    },
    onEnd: ({ velocity }) => {
      grab.current.chasing = false;
      const vf = velocity.x / widthNow();
      const landing = motionSafe ? project(pos.get(), vf, 0.99) : pos.get();
      // The run to the landing step reports each step it passes, as the
      // drag did; the last one lands in `finish`.
      settle(quantize(toValue(clamp01(landing))), motionSafe ? vf : 0, "drag");
    },
    onCancel: () => {
      grab.current.chasing = false;
      settle(quantize(toValue(clamp01(pos.get()))), 0, "drag");
    },
  });

  const onRailPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // The rail itself cannot take focus: without this the press would hand
    // focus to the page right after the thumb took it.
    event.preventDefault();
    const f = fracAt(event.clientX);
    const w = widthNow();
    const onThumb = Math.abs(f - pos.get()) * w <= m.thumb / 2 + 4;
    grab.current.offset = onThumb ? f - pos.get() : 0;
    // Focus follows the press, as on a native range, without a keyboard ring.
    thumbRef.current?.focus({
      preventScroll: true,
      focusVisible: false,
    } as FocusOptions);
    if (!onThumb) {
      const q = quantize(toValue(clamp01(f)));
      if (q !== reported.current) {
        report(q);
        if (stops > 0) tick(q);
      }
      settle(q, 0, "key");
    }
    drag.onPointerDown(event);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = Math.max(1, Math.round(span / unit / 10));
    const from = reported.current;
    let next: number;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = from + unit;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = from - unit;
        break;
      case "PageUp":
        next = from + big * unit;
        break;
      case "PageDown":
        next = from - big * unit;
        break;
      case "Home":
        next = lo;
        break;
      case "End":
        next = hi;
        break;
      default:
        return;
    }
    event.preventDefault();
    const q = quantize(next);
    if (q === from) return;
    report(q);
    tick(q);
    settle(q, pos.getVelocity(), "key");
  };

  const thumbLeft = useTransform(pos, (f) => pct(f));
  const fillWidth = useTransform(
    [pos, tide] as MotionValue<number>[],
    ([p = 0, t = 0]: number[]) => pct(clamp01(Math.min(p, t))),
  );
  const foamWidth = useTransform(
    [pos, tide] as MotionValue<number>[],
    ([p = 0, t = 0]: number[]) =>
      pct(Math.max(0, clamp01(Math.max(p, t)) - clamp01(Math.min(p, t)))),
  );

  const reading = say(current);
  const longest = [say(lo), say(hi), reading].reduce((a, b) =>
    b.length > a.length ? b : a,
  );
  const dots =
    stops > 1 && stops <= 40
      ? Array.from({ length: stops - 1 }, (_, i) => (i + 1) / stops)
      : [];
  const at = toFrac(current);

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1",
          hideLabel && "justify-end",
        )}
      >
        <span
          id={labelId}
          className={cn(
            "min-w-0 text-ink-2",
            m.text,
            hideLabel ? "sr-only" : "truncate",
          )}
          title={hideLabel ? undefined : label}
        >
          {label}
        </span>
        <span
          aria-hidden
          className={cn(
            "grid font-mono leading-none text-foreground tabular-nums",
            m.text,
          )}
        >
          <span className="col-start-1 row-start-1 text-right">{reading}</span>
          <span className="invisible col-start-1 row-start-1">{longest}</span>
        </span>
      </div>

      <div
        ref={railRef}
        {...drag}
        onPointerDown={onRailPointerDown}
        className={cn(
          "group/wake-range relative touch-pan-y select-none",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
        style={{ height: m.rail, paddingInline: m.thumb / 2 + OVERSHOOT }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          style={{ color: paint }}
        >
          {bands.map((d, k) => (
            <motion.path
              key={k}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={r2(0.62 * (1 - (k + 0.5) / BANDS))}
            />
          ))}
        </svg>

        <div ref={innerRef} className="relative h-full">
          <div
            aria-hidden
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-ink-3/15"
            style={{ height: m.track }}
          >
            <motion.div
              className="absolute inset-y-0"
              style={{
                left: fillWidth,
                width: foamWidth,
                background: `color-mix(in oklab, ${paint} 32%, transparent)`,
              }}
            />
            {fill ? (
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: fillWidth, background: paint }}
              />
            ) : null}
            {dots.map((f) => (
              <span
                key={f}
                className={cn(
                  "absolute top-1/2 size-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  fill && f <= at + 1e-6 ? "bg-white/75" : "bg-ink-3/50",
                )}
                style={{ left: pct(f) }}
              />
            ))}
          </div>

          <motion.div
            ref={thumbRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={labelId}
            aria-valuemin={Number(lo.toFixed(6))}
            aria-valuemax={Number(hi.toFixed(6))}
            aria-valuenow={Number(current.toFixed(6))}
            aria-valuetext={reading}
            aria-orientation="horizontal"
            aria-disabled={disabled || undefined}
            onKeyDown={onKeyDown}
            className={cn(
              "absolute top-1/2 left-0 rounded-full outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            )}
            style={{
              left: thumbLeft,
              x: "-50%",
              y: "-50%",
              width: m.thumb,
              height: m.thumb,
            }}
          >
            <span
              className={cn(
                "flex size-full items-center justify-center rounded-full border border-hairline-strong bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_18%,transparent)] transition-[scale,border-color] duration-150",
                !disabled &&
                  "group-hover/wake-range:border-ink-3 group-active/wake-range:scale-110",
              )}
            >
              <span
                className="rounded-full"
                style={{ width: m.dot, height: m.dot, background: paint }}
              />
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
