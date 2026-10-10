"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SquashSwitchTone = "mint" | "cobalt" | "amber" | "rose";
export type SquashSwitchSize = "sm" | "md" | "lg";

export type SquashSwitchProps = {
  /** Controlled on/off state. */
  checked?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultChecked?: boolean;
  /** Fires from the press, drag or key that changed it, with the new state. */
  onCheckedChange?: (checked: boolean) => void;
  /** What the switch controls: its accessible name, shown before it unless `hideLabel`. */
  label: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** A word after the switch while on; the longer of the two words' width is kept. */
  onText?: string;
  /** A word after the switch while off. */
  offText?: string;
  /** How soft the thumb is, 0 to 1: how far it stretches in flight, how flat it squashes on the wall, and how long it wobbles. @default 0.6 */
  softness?: number;
  /** How quickly the thumb crosses, 0 to 1: the travel spring's stiffness. @default 0.5 */
  speed?: number;
  /** Send a ripple through the track when the thumb lands. @default true */
  ripple?: boolean;
  /** The track's colour while on: a named pigment, or any CSS colour. @default "mint" */
  color?: SquashSwitchTone | (string & {});
  /** The thumb's colour; any CSS colour. @default "oklch(0.99 0.004 258)" */
  thumbColor?: string;
  /** Track 44×24, 56×32 or 72×40px. @default "md" */
  size?: SquashSwitchSize;
  /** Play a thock as the thumb lands. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  w: number;
  h: number;
  /** The thumb's diameter at rest. */
  d: number;
  pad: number;
  text: string;
};

const GEOMETRY: Record<SquashSwitchSize, Geometry> = {
  sm: { w: 44, h: 24, d: 18, pad: 3, text: "text-xs" },
  md: { w: 56, h: 32, d: 24, pad: 4, text: "text-sm" },
  lg: { w: 72, h: 40, d: 30, pad: 5, text: "text-base" },
};

/** Pigments: the on track reads the same on a light page as on a dark one. */
const TONES: Record<SquashSwitchTone, string> = {
  mint: "oklch(from var(--success) 0.7 0.14 h)",
  cobalt: "oklch(from var(--accent-bright) 0.6 0.19 h)",
  amber: "oklch(from var(--warn) 0.76 0.15 h)",
  rose: "oklch(from var(--danger) 0.64 0.2 h)",
};

const KAPPA = 0.5523;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/**
 * An ellipse from four cubic arcs, with each side's handles pushed out by
 * `flatL` / `flatR` (0 to 1): a soft body pressed on a wall goes flat where
 * it touches, not round.
 */
function blob(
  cx: number,
  cy: number,
  w: number,
  h: number,
  flatL: number,
  flatR: number,
): string {
  const rx = w / 2;
  const ry = h / 2;
  const kR = KAPPA + 0.42 * flatR;
  const kL = KAPPA + 0.42 * flatL;
  const p = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
  return [
    `M ${p(cx, cy - ry)}`,
    `C ${p(cx + kR * rx, cy - ry)} ${p(cx + rx, cy - kR * ry)} ${p(cx + rx, cy)}`,
    `C ${p(cx + rx, cy + kR * ry)} ${p(cx + kR * rx, cy + ry)} ${p(cx, cy + ry)}`,
    `C ${p(cx - kL * rx, cy + ry)} ${p(cx - rx, cy + kL * ry)} ${p(cx - rx, cy)}`,
    `C ${p(cx - rx, cy - kL * ry)} ${p(cx - kL * rx, cy - ry)} ${p(cx, cy - ry)}`,
    "Z",
  ].join(" ");
}

/**
 * The track's outline with a pulse travelling through it: the top and bottom
 * edges bulge out under a Gaussian whose centre runs from the struck end to
 * the far one, and the struck cap swells while the pulse is young.
 */
function trackPath(
  w: number,
  h: number,
  at: number,
  amp: number,
  side: 1 | -1,
): string {
  const r = h / 2;
  const left = r;
  const right = w - r;
  const sigma = h * 0.55;
  // The pulse leaves the struck end and crosses the whole track.
  const c = side > 0 ? right - (right - left) * at : left + (right - left) * at;
  const bump = (x: number) =>
    amp * Math.exp(-((x - c) * (x - c)) / (2 * sigma * sigma));
  const capR = r + (side > 0 ? amp * 0.8 * (1 - at) : 0);
  const capL = r + (side < 0 ? amp * 0.8 * (1 - at) : 0);
  const pts: string[] = [];
  const P = (x: number, y: number) => `${r2(x)} ${r2(y)}`;
  const n = 14;
  for (let i = 0; i <= n; i += 1) {
    const x = left + ((right - left) * i) / n;
    pts.push(P(x, -bump(x)));
  }
  for (let i = 1; i < 8; i += 1) {
    const a = -Math.PI / 2 + (Math.PI * i) / 8;
    pts.push(P(right + capR * Math.cos(a), r + capR * Math.sin(a)));
  }
  for (let i = n; i >= 0; i -= 1) {
    const x = left + ((right - left) * i) / n;
    pts.push(P(x, h + bump(x)));
  }
  for (let i = 1; i < 8; i += 1) {
    const a = Math.PI / 2 + (Math.PI * i) / 8;
    pts.push(P(left + capL * Math.cos(a), r + capL * Math.sin(a)));
  }
  return `M ${pts.join(" L ")} Z`;
}

/**
 * A switch whose thumb is a soft body. It crosses on a spring whose
 * stiffness is `speed`, stretching along its travel with its speed and
 * thinning to keep its area; when the underdamped spring carries it past its
 * rest, the leading edge stays on the wall and the body flattens against it —
 * narrower, taller, flat where it touches — then rebounds and settles, for as
 * long as `softness` lets it wobble. The impact sends a ripple through the
 * track: a pulse in its outline that runs from the struck end to the far one.
 *
 * The thumb can be dragged 1:1, rubber-banding (and squashing) past either
 * end, and a release commits to the side the throw was heading for, the
 * spring taking the release velocity. It is a real `role="switch"` button:
 * Space and Enter toggle it, Right turns it on and Left off. Under reduced
 * motion the thumb moves in one piece on a short tween with no stretch,
 * squash or ripple, and the colour still changes.
 */
export function SquashSwitch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  hideLabel = false,
  onText,
  offText,
  softness = 0.6,
  speed = 0.5,
  ripple = true,
  color = "mint",
  thumbColor = "oklch(0.99 0.004 258)",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: SquashSwitchProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const cy = g.h / 2;
  const off = g.pad + g.d / 2;
  const on = g.w - g.pad - g.d / 2;
  const travel = on - off;
  const soft = clamp01(softness);
  const quick = clamp01(speed);
  // The tallest the thumb may get: a little past the track, and the root
  // keeps that much room above and below so it never draws outside its box.
  const bulge = Math.round(g.d * 0.18);
  const tallest = g.h + bulge * 2;
  const narrowest = (g.d * g.d) / tallest;
  const tone = TONES[color as SquashSwitchTone] ?? color;

  const [own, setOwn] = React.useState(defaultChecked);
  const isOn = checked ?? own;

  const x = useMotionValue(isOn ? on : off);
  const vx = useVelocity(x);
  const wave = useMotionValue(1);
  const waveAmp = useMotionValue(0);
  const waveSide = useMotionValue(1);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const dragging = React.useRef(false);
  const dragFrom = React.useRef(0);
  const shown = React.useRef(isOn);
  /** The thumb is on its way to a wall: the first touch is the landing. */
  const flight = React.useRef<{ to: number; armed: boolean } | null>(null);
  /** A controlled change the visitor asked for: its landing may sound. */
  const asked = React.useRef(false);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
  };

  const settle = (to: boolean, velocity = 0, armed = false) => {
    anims.current.get("x")?.stop();
    const target = to ? on : off;
    if (!motionSafe) {
      flight.current = null;
      run(
        "x",
        animate(x, target, { duration: durations.fast, ease: easings.enter }),
      );
      return;
    }
    flight.current = { to: target, armed };
    run(
      "x",
      animate(x, target, {
        ...spring(lerp(220, 900, quick), lerp(0.74, 0.38, soft)),
        velocity,
      }),
    );
  };

  /** The thumb met the wall: the track takes the blow. */
  const land = (speedAt: number, side: 1 | -1, armed: boolean) => {
    const strength = clamp01(Math.abs(speedAt) / 420);
    if (ripple && motionSafe) {
      waveSide.set(side);
      waveAmp.set(r2(lerp(0.5, 2.2, strength) * lerp(0.6, 1.1, soft)));
      wave.jump(0);
      run("wave", animate(wave, 1, { duration: 0.6, ease: easings.linear }));
    }
    if (armed) {
      const rect = buttonRef.current?.getBoundingClientRect();
      audio.play("thock", {
        pitch: r2(
          lerp(1.2, 0.82, soft) *
            (size === "sm" ? 1.15 : size === "lg" ? 0.88 : 1),
        ),
        gain: r2(lerp(0.3, 0.7, strength)),
        pan: rect ? panFrom(rect.left + (side > 0 ? rect.width : 0), null) : 0,
      });
    }
  };

  // A host that changes `checked` gets the same flight a press would, and
  // the landing sounds if the visitor asked for it.
  React.useEffect(() => {
    if (shown.current === isOn) return;
    shown.current = isOn;
    const armed = asked.current;
    asked.current = false;
    if (!dragging.current) settle(isOn, 0, armed);
    // `settle` reads refs and props that change with the render that flips it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOn]);

  // A new size moves the rest positions; the thumb goes straight there.
  React.useEffect(() => {
    halt();
    flight.current = null;
    x.jump(shown.current ? on : off);
    wave.jump(1);
  }, [on, off, x, wave]);

  // The listener outlives renders; it reaches the latest `land` — and with
  // it the latest sound, softness and ripple settings — through a ref.
  const landRef = React.useRef(land);
  React.useEffect(() => {
    landRef.current = land;
  });

  // The first touch of the wall on a flight is its landing.
  React.useEffect(
    () =>
      x.on("change", (v) => {
        const f = flight.current;
        if (!f) return;
        const past = f.to === on ? v - on : off - v;
        if (past > 0.05) {
          flight.current = null;
          landRef.current(x.getVelocity(), f.to === on ? 1 : -1, f.armed);
        }
      }),
    [x, on, off],
  );

  React.useEffect(() => halt, []);

  const commit = (next: boolean, velocity = 0) => {
    if (next === isOn) {
      settle(next, velocity, false);
      return;
    }
    if (checked === undefined) {
      setOwn(next);
      shown.current = next;
      settle(next, velocity, true);
    } else {
      // Controlled: go back to where the host says it is, and let the
      // effect carry the thumb across once the host answers.
      asked.current = true;
      // A host that refuses never re-renders: the request lapses after
      // its turn, so a later outside change lands silently.
      window.requestAnimationFrame(() => {
        asked.current = false;
      });
      settle(isOn, velocity, false);
    }
    onCheckedChange?.(next);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      dragFrom.current = x.get();
      flight.current = null;
      anims.current.get("x")?.stop();
    },
    onMove: ({ offset }) => {
      // 1:1 under the finger; past either end it gives less, and the thumb
      // squashes against the wall it is pushed into.
      x.set(r2(rubberClamp(dragFrom.current + offset.x, off, on, travel)));
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(x.get(), velocity.x, 0.99);
      commit(landing > off + travel / 2, velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      settle(isOn);
    },
    onTap: () => commit(!isOn),
  });

  // The thumb's body, every frame: stretched by speed, squashed by the wall,
  // its area kept.
  const body = useTransform(
    [x, vx] as MotionValue<number>[],
    ([cx0 = off, v = 0]: number[]) => {
      if (!motionSafe) {
        return blob(clamp(cx0, off, on), cy, g.d, g.d, 0, 0);
      }
      const stretch =
        1 + Math.min(0.12 + 0.3 * soft, Math.abs(v) * 0.0011 * (0.4 + soft));
      const free = g.d * stretch;
      const wallR = g.w - g.pad;
      const wallL = g.pad;
      const pastR = cx0 + free / 2 - wallR;
      const pastL = wallL - (cx0 - free / 2);
      const gain = lerp(0.7, 2.1, soft);
      const press = Math.max(0, pastR, pastL);
      const wNow = clamp(free - press * gain, narrowest, free);
      const hNow = Math.min(tallest, (g.d * g.d) / wNow);
      let cx = cx0;
      if (cx + wNow / 2 > wallR) cx = wallR - wNow / 2;
      if (cx - wNow / 2 < wallL) cx = wallL + wNow / 2;
      const flatR = clamp01(pastR / (g.d * 0.25));
      const flatL = clamp01(pastL / (g.d * 0.25));
      return blob(cx, cy, wNow, hNow, flatL, flatR);
    },
  );
  const track = useTransform(
    [wave, waveAmp, waveSide] as MotionValue<number>[],
    ([t = 1, a = 0, s = 1]: number[]) =>
      trackPath(
        g.w,
        g.h,
        clamp01(t),
        t >= 1 ? 0 : a * Math.pow(1 - clamp01(t), 1.4),
        s > 0 ? 1 : -1,
      ),
  );
  const tint = useTransform(x, (v) => r2(clamp01((v - off) / travel)));

  const hasText = Boolean(onText || offText);

  return (
    <div
      className={cn("inline-flex items-center gap-3", className)}
      style={
        {
          "--squash-switch-color": tone,
          "--squash-switch-thumb": thumbColor,
        } as React.CSSProperties
      }
    >
      <span
        id={labelId}
        onClick={() => {
          if (!disabled) commit(!isOn);
        }}
        className={cn(
          "text-foreground select-none",
          g.text,
          hideLabel ? "sr-only" : "cursor-pointer",
          disabled && "cursor-not-allowed text-ink-3",
        )}
      >
        {label}
      </span>
      <span className="inline-flex shrink-0" style={{ paddingBlock: bulge }}>
        <button
          ref={buttonRef}
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-labelledby={labelId}
          disabled={disabled}
          onClick={(event) => {
            // Pointer presses arrive through the drag's tap; a click with no
            // pointer behind it — Space, Enter, assistive technology — is a
            // press too.
            if (event.detail === 0) commit(!isOn);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" && !isOn) {
              event.preventDefault();
              commit(true);
            } else if (event.key === "ArrowLeft" && isOn) {
              event.preventDefault();
              commit(false);
            }
          }}
          {...drag}
          className={cn(
            "relative shrink-0 cursor-pointer touch-pan-y rounded-full outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          style={{ width: g.w, height: g.h }}
        >
          <svg
            aria-hidden
            width={g.w}
            height={g.h}
            viewBox={`0 0 ${g.w} ${g.h}`}
            className="pointer-events-none absolute inset-0 block overflow-visible"
          >
            <motion.path
              d={track}
              className="fill-surface-2 stroke-hairline-strong"
              strokeWidth={1}
            />
            <motion.path
              d={track}
              className="fill-[var(--squash-switch-color)]"
              style={{ opacity: tint }}
            />
            <motion.path d={body} className="fill-black/20" style={{ y: 1 }} />
            <motion.path
              d={body}
              className="fill-[var(--squash-switch-thumb)]"
            />
          </svg>
        </button>
      </span>
      {hasText ? (
        <span
          aria-hidden
          className={cn("grid font-mono text-ink-2 tabular-nums", g.text)}
        >
          {[onText ?? "", offText ?? ""].map((word, i) => (
            <span
              key={i}
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-150",
                (i === 0) === isOn ? "opacity-100" : "opacity-0",
              )}
            >
              {word}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}
