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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StraightenDialRange = 15 | 45 | "15" | "45";

export type StraightenDialProps = {
  /** Controlled rotation in degrees, clockwise positive, in tenths. */
  value?: number;
  /** Starting rotation when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, key, throw or reset that turned the picture, with the new rotation. */
  onValueChange?: (degrees: number) => void;
  /** The picture to straighten. It fills the frame and turns inside it. */
  children: React.ReactNode;
  /** The frame's width over its height. @default 2 */
  aspect?: number;
  /** The slider's name, shown left of the reading. @default "Straighten" */
  label?: string;
  /** How far it turns either way, in degrees: 15 is a finer ruler, 45 a longer one. @default "45" */
  range?: StraightenDialRange;
  /** Show a thirds grid over the picture while it turns. @default true */
  grid?: boolean;
  /** How wide the sticky zone around zero is, 0 to 3 degrees. 0 makes zero an ordinary degree. @default 1.5 */
  magnet?: number;
  /** Scale the picture to hide the corners a turn opens up. Off, the corners show. @default true */
  crop?: boolean;
  /** Fine ticks per degree and a snap at zero. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Ruler height: ticks, then labels. */
const RULER = 30;
/** Blank ruler past each end, so the end marks sit clear of the fade. */
const PAD = 28;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
/** Tenths, and never a negative zero. */
const tenth = (v: number) => Math.round(v * 10) / 10 || 0;
const minus = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

function reading(v: number): string {
  const t = tenth(v);
  if (t === 0) return "0.0°";
  return `${t > 0 ? "+" : "−"}${Math.abs(t).toFixed(1)}°`;
}

function spoken(v: number): string {
  const t = tenth(v);
  if (t === 0) return "Level";
  const n = Math.abs(t);
  return `${n} ${n === 1 ? "degree" : "degrees"} ${t > 0 ? "clockwise" : "counter-clockwise"}`;
}

/**
 * The least scale at which a frame-sized picture, turned by `deg`, still
 * covers the frame: the turned frame's bounding box over the frame, on the
 * tighter axis. Rounded up, so a rounding error can never open a corner.
 */
function coverScale(deg: number, ratio: number): number {
  if (Math.abs(deg) < 0.005) return 1;
  const a = (Math.abs(deg) * Math.PI) / 180;
  const k = Math.max(ratio, 1 / ratio);
  return Math.ceil((Math.cos(a) + k * Math.sin(a)) * 1000 + 2) / 1000;
}

type Spring = {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
};

// White hairlines with a darker line under each, so the grid reads on a
// bright sky and a dark sea alike. The picture is not themed, so neither is
// the grid.
const GRID_LINE = "color-mix(in oklab, white 72%, transparent)";
const GRID_FINE = "color-mix(in oklab, white 34%, transparent)";
const GRID_SHADE = "color-mix(in oklab, black 22%, transparent)";
const BRACKET = "color-mix(in oklab, white 92%, transparent)";
const CHECKER =
  "repeating-conic-gradient(var(--bg-2) 0% 25%, var(--bg-0) 0% 50%) 50% / 12px 12px";

/**
 * A photo editor's straighten control. A degree ruler under the picture is
 * the dial: drag it and the picture turns about its centre, 1:1 with the
 * finger, while a thirds grid fades in over it for as long as it is turning
 * and the crop scales up just enough to keep the frame's corners covered.
 * Zero is magnetic: near it the ruler holds at exactly 0, then catches up
 * at double rate, so the mapping stays continuous and rejoins the finger.
 * Past either end the ruler rubber-bands; a slow release stays put, and a
 * flick coasts to where it would come to rest on a spring that takes the
 * release speed. A fine tick sounds as each degree passes the needle, a
 * snap as zero does.
 *
 * The ruler is a real slider: arrows turn a degree (Shift a tenth), PageUp
 * and PageDown five, Home and End to the ends, each on the same spring with
 * the same ticks; a Reset button turns back to level. Under reduced motion
 * the ruler and picture still follow the finger, but releases, keys and the
 * reset land at once, and the grid still fades.
 */
export function StraightenDial({
  value,
  defaultValue = 0,
  onValueChange,
  children,
  aspect = 2,
  label = "Straighten",
  range = "45",
  grid = true,
  magnet = 1.5,
  crop = true,
  sound = false,
  disabled = false,
  className,
}: StraightenDialProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();

  const R = Number(range) === 15 ? 15 : 45;
  // The shorter ruler is the finer instrument: the same drag turns less.
  const ppd = R === 15 ? 12 : 6;
  const labelEvery = R === 15 ? 5 : 15;
  const m = clamp(Number.isFinite(magnet) ? magnet : 0, 0, R / 5);
  const ratio = clamp(Number.isFinite(aspect) ? aspect : 2, 0.25, 4);

  const [own, setOwn] = React.useState(() => tenth(clamp(defaultValue, -R, R)));
  const current = tenth(clamp(value ?? own, -R, R));

  const angle = useMotionValue(current);
  const gridOpacity = useMotionValue(0);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const gridRun = React.useRef<AnimationPlaybackControls | null>(null);
  const gridTimer = React.useRef(0);
  /** Where the picture rests, or is heading: keys chain from here. */
  const target = React.useRef(current);
  /** The last value handed to the host. */
  const reported = React.useRef(current);
  const dragging = React.useRef(false);
  /** The ruler position under the finger at the grab, before the magnet. */
  const grabRaw = React.useRef(0);
  const latest = React.useRef({ audio, R });
  React.useEffect(() => {
    latest.current = { audio, R };
  });

  /** The magnet: a hold at zero, then a catch-up at double rate. */
  const magnetize = (raw: number) => {
    if (m <= 0) return raw;
    const a = Math.abs(raw);
    if (a < m) return 0;
    if (a < 2 * m) return Math.sign(raw) * 2 * (a - m);
    return raw;
  };
  /** Where the finger would have to be to show `v`. */
  const unmagnetize = (v: number) => {
    if (m <= 0) return v;
    const a = Math.abs(v);
    if (a === 0) return 0;
    if (a < 2 * m) return Math.sign(v) * (a / 2 + m);
    return v;
  };

  const report = (v: number) => {
    const next = tenth(clamp(v, -R, R));
    if (next === reported.current) return;
    reported.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const showGrid = () => {
    window.clearTimeout(gridTimer.current);
    gridRun.current?.stop();
    gridRun.current = animate(gridOpacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
  };
  const hideGrid = (after: number) => {
    window.clearTimeout(gridTimer.current);
    gridTimer.current = window.setTimeout(() => {
      gridRun.current?.stop();
      gridRun.current = animate(gridOpacity, 0, {
        duration: durations.base,
        ease: easings.exit,
      });
    }, after);
  };

  /** Carries the picture to `to`, then lets the grid go `linger` ms later. */
  const settle = (
    to: number,
    linger: number,
    velocity = 0,
    spring: Spring = springs.glide,
  ) => {
    run.current?.stop();
    target.current = to;
    if (!motionSafe || Math.abs(angle.get() - to) < 0.01) {
      angle.set(to);
      hideGrid(linger);
      return;
    }
    run.current = animate(angle, to, {
      ...spring,
      velocity,
      restDelta: 0.01,
      restSpeed: 0.5,
      onComplete: () => hideGrid(linger),
    });
  };

  /** A key or the reset: the same turn a drag makes, from where the last one aimed. */
  const turnTo = (raw: number) => {
    let next = tenth(clamp(raw, -R, R));
    const from = target.current;
    // Captured only on the way in, so a key can always step back out.
    if (
      m > 0 &&
      from !== 0 &&
      Math.abs(next) < m &&
      (Math.abs(next) < Math.abs(from) || Math.sign(next) !== Math.sign(from))
    ) {
      next = 0;
    }
    if (next === from && Math.abs(angle.get() - next) < 0.01) return;
    report(next);
    if (grid) showGrid();
    settle(next, 700);
  };

  // Every commit carries the host's answer to the last report. If it took
  // the value, nothing moves; if it refused, or set one of its own (or the
  // range shrank under it), the picture turns to where the host says.
  React.useLayoutEffect(() => {
    if (dragging.current) return;
    if (Math.abs(current - target.current) < 0.05) return;
    reported.current = current;
    if (grid) showGrid();
    settle(current, 350);
  });

  // The sounds belong to the ruler's marks passing the needle, whatever
  // turned it, so they land on the frame the mark does. A mark that just
  // sounded has to be left by half a degree before it can sound again, so a
  // spring settling onto zero snaps once.
  React.useEffect(() => {
    let prev = angle.get();
    let armed: number | null = null;
    return angle.on("change", (v) => {
      if (armed !== null && Math.abs(v - armed) >= 0.5) armed = null;
      const up = v > prev;
      const lo = up ? Math.floor(prev) + 1 : Math.ceil(v);
      const hi = up ? Math.floor(v) : Math.ceil(prev) - 1;
      prev = v;
      if (lo > hi) return;
      const zero = lo <= 0 && hi >= 0;
      const mark = zero ? 0 : up ? hi : lo;
      if (mark === armed) return;
      armed = mark;
      const { audio: out, R: span } = latest.current;
      if (zero) {
        out.play("snap", { pitch: 1, gain: 0.5 });
      } else {
        out.play("tick", {
          pitch: r2(0.9 + (0.5 * Math.min(span, Math.abs(mark))) / span),
          gain: 0.22,
          pan: r2(clamp(mark / span, -1, 1) * 0.5),
        });
      }
    });
  }, [angle]);

  // Switched on, the grid shows itself once, so the switch is seen before
  // the next turn. Compared with the last value, so a mount (or StrictMode's
  // second mount) never flashes it.
  const gridWas = React.useRef(grid);
  React.useEffect(() => {
    if (grid && !gridWas.current) {
      gridRun.current?.stop();
      gridRun.current = animate(gridOpacity, [0, 1, 1, 0], {
        duration: 1.2,
        times: [0, 0.12, 0.7, 1],
        ease: "linear",
      });
    }
    gridWas.current = grid;
  }, [grid, gridOpacity]);

  React.useEffect(
    () => () => {
      run.current?.stop();
      gridRun.current?.stop();
      window.clearTimeout(gridTimer.current);
    },
    [],
  );

  const drag = useDrag({
    axis: "x",
    disabled,
    onStart: () => {
      dragging.current = true;
      run.current?.stop();
      grabRaw.current = unmagnetize(angle.get());
      if (grid) showGrid();
    },
    onMove: ({ offset }) => {
      // Dragging the ruler left brings higher numbers under the needle.
      const raw = grabRaw.current - offset.x / ppd;
      const v = magnetize(rubberClamp(raw, -R, R, R / 5));
      angle.set(r3(v));
      report(v);
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const here = angle.get();
      const spin = motionSafe ? -velocity.x / ppd : 0;
      // A slow release stays exactly where it is; only a flick coasts.
      const coasting = Math.abs(spin) > 40;
      let landing = clamp(coasting ? project(here, spin, 0.99) : here, -R, R);
      if (m > 0 && Math.abs(landing) < m) landing = 0;
      landing = tenth(landing);
      report(landing);
      if (coasting) {
        // Critically damped at the throw's own time constant: the coast
        // slows the way the projection assumed, and stops on its landing.
        const tau = -1 / Math.log(0.99) / 1000;
        settle(landing, 350, spin, {
          type: "spring",
          stiffness: 1 / (tau * tau),
          damping: 2 / tau,
          mass: 1,
        });
      } else {
        // A careful release lands where it is; only a ruler pulled past an
        // end (or out of the magnet) carries the hand's speed home.
        settle(landing, 350, Math.abs(here - landing) > 0.1 ? spin : 0);
      }
    },
    onCancel: () => {
      dragging.current = false;
      const v = tenth(clamp(angle.get(), -R, R));
      report(v);
      settle(v, 350);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.metaKey || event.ctrlKey) return;
    const from = target.current;
    const step = event.shiftKey ? 0.1 : 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = from + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = from - step;
        break;
      case "PageUp":
        next = from + 5;
        break;
      case "PageDown":
        next = from - 5;
        break;
      case "Home":
        next = -R;
        break;
      case "End":
        next = R;
        break;
      default:
        return;
    }
    event.preventDefault();
    turnTo(next);
  };

  const rotate = useTransform(angle, r2);
  const scale = useTransform(angle, (a) => (crop ? coverScale(a, ratio) : 1));
  const stripX = useTransform(angle, (a) => r2(-(PAD + (a + R) * ppd)));
  const text = useTransform(angle, reading);
  const tone = useTransform(angle, (a) =>
    tenth(a) === 0 ? "var(--signal)" : "var(--ink)",
  );

  const width = 2 * R * ppd + 2 * PAD;
  const at = (d: number) => PAD + (d + R) * ppd;
  const ticks = React.useMemo(() => {
    let minor = "";
    let major = "";
    for (let d = -R; d <= R; d += 1) {
      const x = PAD + (d + R) * ppd;
      if (d === 0) continue;
      if (d % 5 === 0) major += `M${x} 1V12`;
      else minor += `M${x} 1V7`;
    }
    const labels: number[] = [];
    for (let d = -R; d <= R; d += labelEvery) labels.push(d);
    return { minor, major, labels };
  }, [R, ppd, labelEvery]);

  const atZero = current === 0;
  const lowest = -R;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2",
        disabled && "opacity-50",
        className,
      )}
    >
      <div
        className="relative w-full overflow-clip rounded-3 border border-hairline-strong [contain:paint]"
        style={{ aspectRatio: r3(ratio), background: CHECKER }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0 select-none"
          style={{ rotate, scale, originX: 0.5, originY: 0.5 }}
        >
          {children}
        </motion.div>
        {grid ? (
          <motion.svg
            aria-hidden
            viewBox="0 0 6 6"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 block size-full"
            style={{ opacity: gridOpacity }}
          >
            <path
              d="M1 0V6M3 0V6M5 0V6M0 1H6M0 3H6M0 5H6"
              fill="none"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: GRID_FINE }}
            />
            <path
              d="M2 0V6M4 0V6M0 2H6M0 4H6"
              fill="none"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: GRID_SHADE }}
            />
            <path
              d="M2 0V6M4 0V6M0 2H6M0 4H6"
              fill="none"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              style={{ stroke: GRID_LINE }}
            />
          </motion.svg>
        ) : null}
        {/* Crop brackets: the frame's corners, which the picture must cover. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 left-1.5 size-3 rounded-tl-1 border-t-2 border-l-2"
          style={{ borderColor: BRACKET }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 right-1.5 size-3 rounded-tr-1 border-t-2 border-r-2"
          style={{ borderColor: BRACKET }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-1.5 left-1.5 size-3 rounded-bl-1 border-b-2 border-l-2"
          style={{ borderColor: BRACKET }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-1.5 bottom-1.5 size-3 rounded-br-1 border-r-2 border-b-2"
          style={{ borderColor: BRACKET }}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="grid h-5 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <span
            id={labelId}
            className="truncate text-[11px] leading-none text-ink-3"
            title={label}
          >
            {label}
          </span>
          <motion.span
            aria-hidden
            className="font-mono text-xs leading-none tabular-nums"
            style={{ color: tone }}
          >
            {text}
          </motion.span>
          <button
            type="button"
            aria-label="Reset to 0 degrees"
            aria-disabled={atZero || disabled || undefined}
            disabled={disabled}
            onClick={() => {
              if (!atZero && !disabled) turnTo(0);
            }}
            className={cn(
              "inline-flex h-5 items-center justify-self-end rounded-1 px-1.5 text-[11px] leading-none text-ink-2 transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              atZero || disabled
                ? "cursor-default text-ink-3/60"
                : "cursor-pointer hover:bg-surface-2 hover:text-foreground",
            )}
          >
            Reset
          </button>
        </div>

        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-orientation="horizontal"
          aria-valuemin={lowest}
          aria-valuemax={R}
          aria-valuenow={current}
          aria-valuetext={spoken(current)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          {...drag}
          className={cn(
            "relative w-full touch-pan-y rounded-2 bg-surface-2/50 transition-colors outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled
              ? "cursor-not-allowed"
              : "cursor-grab hover:bg-surface-2 active:cursor-grabbing",
          )}
          style={{ height: RULER }}
        >
          <div className="absolute inset-0 overflow-clip [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)] [contain:paint]">
            <motion.div
              className="absolute top-0 left-1/2"
              style={{ x: stripX, width }}
            >
              <svg
                aria-hidden
                width={width}
                height={RULER}
                viewBox={`0 0 ${width} ${RULER}`}
                className="block"
              >
                {m > 0 ? (
                  <rect
                    x={r3(at(-m))}
                    y={1}
                    width={r3(2 * m * ppd)}
                    height={14}
                    rx={3}
                    className="fill-cobalt-wash"
                  />
                ) : null}
                <path
                  d={ticks.minor}
                  fill="none"
                  strokeWidth={1}
                  className="stroke-ink-3/70"
                />
                <path
                  d={ticks.major}
                  fill="none"
                  strokeWidth={1}
                  className="stroke-ink-2"
                />
                <path
                  d={`M${at(0)} 1V15`}
                  fill="none"
                  strokeWidth={1.5}
                  className={atZero ? "stroke-signal" : "stroke-ink-2"}
                />
                {ticks.labels.map((d) => (
                  <text
                    key={d}
                    x={at(d)}
                    y={26}
                    textAnchor="middle"
                    className={cn(
                      "font-mono text-[9px]",
                      d === 0 && atZero ? "fill-signal" : "fill-ink-3",
                    )}
                  >
                    {minus(d)}
                  </text>
                ))}
              </svg>
            </motion.div>
          </div>
          {/* The needle stays put; the ruler moves under it. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-0 left-1/2 h-[17px] w-0.5 -translate-x-1/2 rounded-full transition-colors",
              atZero ? "bg-signal" : "bg-cobalt-bright",
            )}
          />
        </div>
      </div>
    </div>
  );
}
