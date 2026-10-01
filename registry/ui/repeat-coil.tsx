"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RepeatMode = "off" | "all" | "one";
export type RepeatCoilSize = "sm" | "md" | "lg";

export type RepeatCoilProps = {
  /** Controlled mode: off, repeat the whole queue, or repeat this one item. */
  value?: RepeatMode;
  /** Initial mode when uncontrolled. @default "off" */
  defaultValue?: RepeatMode;
  /** Fires from the press or the key that changed it, with the new mode. */
  onValueChange?: (mode: RepeatMode) => void;
  /** Text for each mode: shown on the button and used as its accessible name. @default Repeat off / Repeat all / Repeat one */
  labels?: Partial<Record<RepeatMode, string>>;
  /** Offer repeat-one. Off: the button cycles off and all only. @default true */
  allowOne?: boolean;
  /** Icon only: a round button whose accessible name is still the mode's label. @default false */
  compact?: boolean;
  /** How far and how deep the third turn winds in repeat-one, 0 to 1. @default 0.6 */
  coil?: number;
  /** Pop a "1" badge out of the loop in repeat-one. @default true */
  pip?: boolean;
  /** How much the two loose arrows sag when repeat is off, 0 to 1. @default 0.5 */
  slack?: number;
  /** How long after the coil starts winding the "1" pops out, in ms. @default 90 */
  pipDelay?: number;
  /** Button height 32, 40 or 48 px, with the glyph scaled to match. @default "md" */
  size?: RepeatCoilSize;
  /** The loop's colour, the pip, and the pressed tint. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The loose arrows' colour while repeat is off. Any CSS colour. @default "var(--ink-3)" */
  idleColor?: string;
  /** Click on every press and pop as the pip lands. Off unless asked for. @default false */
  sound?: boolean;
  /** @default false */
  disabled?: boolean;
  className?: string;
};

type Pt = readonly [number, number];

/**
 * The glyph's own box, tight round the loop so the label sits close. The pip
 * rests on the loop's top-right corner and its recoil carries it a little past
 * this box, into the button's own padding — never outside the button.
 */
const W = 34;
const H = 24;
/** The loop: a rounded rectangle about (CX, CY). */
const CX = 17;
const CY = 12;
const A = 11.5;
const B = 7.5;
const R = 4.5;
/** Where the "1" badge rests: over the corner the coil leaves empty. */
const PIP = { x: 28.5, y: 5, r: 4.8 } as const;
/** Samples per strand: enough that the corners stay round at any bend. */
const N = 30;
/** Share of the loop left open in front of each arrowhead. */
const GAP = 0.075;
const HEAD = 3.1;

const ORDER: readonly RepeatMode[] = ["off", "all", "one"];
const LABELS: Record<RepeatMode, string> = {
  off: "Repeat off",
  all: "Repeat all",
  one: "Repeat one",
};
const PITCH: Record<RepeatMode, number> = { off: 0.86, all: 1.04, one: 1.2 };

const SIZES: Record<
  RepeatCoilSize,
  { glyph: number; box: string; square: string }
> = {
  sm: { glyph: 22, box: "h-8 gap-2 px-3 text-xs", square: "size-8" },
  md: { glyph: 28, box: "h-10 gap-2.5 px-3.5 text-sm", square: "size-10" },
  lg: { glyph: 34, box: "h-12 gap-3 px-4 text-[15px]", square: "size-12" },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

/**
 * A point on the loop's track, `f` of the way round it clockwise from the
 * middle of the left side, on a track pulled `inset` units in from the loop.
 * Measured by arc length, so a strand's samples stay evenly spaced through
 * the corners instead of bunching there.
 */
function track(f: number, inset: number): Pt {
  const a = A - inset;
  const b = B - inset;
  const r = Math.max(0.8, Math.min(R - inset * 0.8, b));
  const sx = 2 * (a - r);
  const sy = 2 * (b - r);
  const q = (Math.PI * r) / 2;
  const total = 2 * sx + 2 * sy + 4 * q;
  let s = (((f % 1) + 1) % 1) * total;
  const arc = (ox: number, oy: number, from: number, t: number): Pt => {
    const th = from + (t / q) * (Math.PI / 2);
    return [ox + r * Math.cos(th), oy + r * Math.sin(th)];
  };
  if (s <= sy / 2) return [-a, -s];
  s -= sy / 2;
  if (s <= q) return arc(-a + r, -b + r, Math.PI, s);
  s -= q;
  if (s <= sx) return [-a + r + s, -b];
  s -= sx;
  if (s <= q) return arc(a - r, -b + r, 1.5 * Math.PI, s);
  s -= q;
  if (s <= sy) return [a, -b + r + s];
  s -= sy;
  if (s <= q) return arc(a - r, b - r, 0, s);
  s -= q;
  if (s <= sx) return [a - r - s, b];
  s -= sx;
  if (s <= q) return arc(-a + r, b - r, 0.5 * Math.PI, s);
  s -= q;
  return [-a, b - r - Math.min(s, sy / 2)];
}

/**
 * One of the two strands. Loose, it is a straight arrow hanging slack across
 * the glyph; bent, it lies on half of the loop; wound, its head keeps going
 * round an inner track, which is the third turn. Every sample blends between
 * the loose line and the loop, so the bend is one value and never a swap.
 */
function strand(
  k: 0 | 1,
  bend: number,
  wind: number,
  coil: number,
  sag: number,
): Pt[] {
  const start = k * 0.5;
  const reach = 0.5 - GAP + wind * lerp(0.08, 0.3, coil);
  const depth = lerp(3.4, 4.6, coil);
  const sign = k === 0 ? 1 : -1;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i += 1) {
    const u = i / N;
    const p = u * reach;
    // The head leaves the outer track before it reaches the other strand's
    // tail, so the two never cross: the coil runs inside the loop.
    const inset = wind * depth * smooth((p - 0.28) / 0.16);
    const [lx, ly] = track(start + p, inset);
    const sx = sign * lerp(-A - 0.5, A + 0.5, u);
    const sy = sign * -3.6 + sag * Math.sin(Math.PI * u);
    pts.push([CX + lerp(sx, lx, bend), CY + lerp(sy, ly, bend)]);
  }
  return pts;
}

/** A strand as a polyline with an open arrowhead laid along its last stretch. */
function strandPath(pts: Pt[]): string {
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 3];
  if (!end || !prev) return "";
  const dx = end[0] - prev[0];
  const dy = end[1] - prev[1];
  const len = Math.hypot(dx, dy) || 1;
  const tx = dx / len;
  const ty = dy / len;
  const w = HEAD * 0.85;
  const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
  const left: Pt = [end[0] - tx * HEAD - ty * w, end[1] - ty * HEAD + tx * w];
  const right: Pt = [end[0] - tx * HEAD + ty * w, end[1] - ty * HEAD - tx * w];
  return `M ${pts.map(f).join(" L ")} M ${f(left)} L ${f(end)} L ${f(right)}`;
}

type Intent = { to: RepeatMode; until: number; pan: number };

/**
 * A three-way repeat control for a playback bar. Off, its glyph is two loose
 * arrows hanging slack in the muted colour. The first press bends them into
 * one closed loop on the glide spring, the arrowheads chasing each other
 * round it as the colour warms. The second winds a third turn: both heads
 * keep travelling round an inner track, a coil, and a "1" pip pops out of
 * the loop's eye onto the corner the coil left empty on the recoil spring.
 * The third press drops the pip back into the eye, unwinds the coil and lets
 * the loop fall slack again.
 *
 * It is one `<button>` whose `aria-pressed` reads false, true and "mixed";
 * Space and Enter cycle it, arrow keys step either way and Home and End jump
 * to the ends, and a polite live region speaks the new mode. Under reduced
 * motion the glyph swaps to each state at once, the colour still
 * cross-fades and the pip fades in where it sits.
 */
export function RepeatCoil({
  value,
  defaultValue = "off",
  onValueChange,
  labels,
  allowOne = true,
  compact = false,
  coil = 0.6,
  pip = true,
  slack = 0.5,
  pipDelay = 90,
  size = "md",
  accent = "var(--accent-bright)",
  idleColor = "var(--ink-3)",
  sound = false,
  disabled = false,
  className,
}: RepeatCoilProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const maskId = `repeat-coil-${uid}`;
  const s = SIZES[size] ?? SIZES.md;
  const cycle = allowOne ? ORDER : ORDER.slice(0, 2);
  const text = { ...LABELS, ...labels };
  const c = clamp01(coil);
  const sag = lerp(0.2, 2.6, clamp01(slack));

  const [own, setOwn] = React.useState<RepeatMode>(defaultValue);
  const raw = value ?? own;
  const mode: RepeatMode = !allowOne && raw === "one" ? "all" : raw;
  const label = text[mode];

  // What the live region says is frozen in the render that flips the mode,
  // and only for a change the visitor asked for and the host accepted.
  const [asked, setAsked] = React.useState<RepeatMode | null>(null);
  const [heard, setHeard] = React.useState({ mode, words: "" });
  if (heard.mode !== mode) {
    setHeard({ mode, words: asked === mode ? label : heard.words });
    if (asked !== null) setAsked(null);
  }

  const shownPip = mode === "one" && pip;
  const bend = useMotionValue(mode === "off" ? 0 : 1);
  const heat = useMotionValue(mode === "off" ? 0 : 1);
  const wind = useMotionValue(mode === "one" ? 1 : 0);
  const pipX = useMotionValue<number>(shownPip ? PIP.x : CX);
  const pipY = useMotionValue<number>(shownPip ? PIP.y : CY);
  const pipScale = useMotionValue(shownPip ? 1 : 0.3);
  const pipOpacity = useMotionValue(shownPip ? 1 : 0);

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const intent = React.useRef<Intent | null>(null);
  const shown = React.useRef(mode);
  const pipShown = React.useRef(shownPip);

  const halt = React.useCallback(() => {
    for (const a of running.current) a.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const run = (...controls: AnimationPlaybackControls[]) => {
    running.current.push(...controls);
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.max(0, Math.round(ms))));
  };

  const pipOut = (fast: boolean) => {
    pipShown.current = false;
    if (!motionSafe || fast) {
      run(animate(pipOpacity, 0, exitFor(durations.fast)));
      return;
    }
    // The badge goes back into the loop's eye: an exit, so a tween.
    const t = exitFor(durations.fast);
    run(
      animate(pipX, CX, t),
      animate(pipY, CY, t),
      animate(pipScale, 0.3, t),
      animate(pipOpacity, 0, t),
    );
  };

  const pipIn = (delay: number, pan: number | null) => {
    pipShown.current = true;
    if (!motionSafe) {
      pipX.jump(PIP.x);
      pipY.jump(PIP.y);
      pipScale.jump(1);
      run(
        animate(pipOpacity, 1, {
          duration: durations.base,
          ease: easings.enter,
        }),
      );
      return;
    }
    later(delay, () => {
      // Hidden again before it popped (the pip switched off): stay hidden.
      if (!pipShown.current) return;
      pipX.jump(CX);
      pipY.jump(CY);
      pipScale.jump(0.3);
      run(
        animate(pipX, PIP.x, springs.recoil),
        animate(pipY, PIP.y, springs.recoil),
        animate(pipScale, 1, springs.recoil),
        animate(pipOpacity, 1, {
          duration: durations.fast,
          ease: easings.enter,
        }),
      );
      // Heard where the recoil first carries the pip onto its corner.
      if (pan !== null) {
        later(100, () => audio.play("pop", { pitch: 1.12, gain: 0.5, pan }));
      }
    });
  };

  /** Carries the glyph from whatever it shows now to `to`. */
  const perform = (to: RepeatMode, pan: number | null) => {
    halt();
    const bt = to === "off" ? 0 : 1;
    const wt = to === "one" ? 1 : 0;
    const wantPip = to === "one" && pip;
    if (!motionSafe) {
      bend.jump(bt);
      wind.jump(wt);
      run(animate(heat, bt, { duration: durations.base, ease: easings.enter }));
      if (wantPip && !pipShown.current) pipIn(0, null);
      else if (!wantPip && pipShown.current) pipOut(true);
      return;
    }
    if (!wantPip && pipShown.current) pipOut(false);
    // Unwinding comes first; the loop falls slack a beat after it.
    const relaxing = bt < bend.get() && wind.get() > 0.01;
    // Coming straight from loose, the loop closes before the coil winds.
    const windDelay = wt > wind.get() && bend.get() < 0.5 ? 0.08 : 0;
    run(
      animate(wind, wt, { ...springs.glide, delay: windDelay }),
      animate(bend, bt, { ...springs.glide, delay: relaxing ? 0.06 : 0 }),
      animate(heat, bt, { ...springs.glide, delay: relaxing ? 0.06 : 0 }),
    );
    if (wantPip && !pipShown.current) {
      pipIn(Math.max(0, pipDelay) + windDelay * 1000, pan);
    }
  };

  // Every change of mode — a press, a key, or the host — runs the same
  // choreography; only a change the visitor asked for is heard.
  React.useEffect(() => {
    if (shown.current === mode) return;
    shown.current = mode;
    const it = intent.current;
    const audible = !!it && it.to === mode && performance.now() < it.until;
    if (audible) intent.current = null;
    perform(mode, audible && it ? it.pan : null);
    // Runs on a change of mode only; perform reads the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Turning the pip on or off while repeating one shows or hides it in place.
  React.useEffect(() => {
    if (shown.current !== "one") return;
    if (pip && !pipShown.current) pipIn(0, null);
    else if (!pip && pipShown.current) pipOut(false);
    // Only the pip switch itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pip]);

  React.useEffect(() => halt, [halt]);

  const commit = (next: RepeatMode, at: number, clientX: number | null) => {
    if (disabled || next === mode) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    const x = clientX ?? (rect ? rect.left + rect.width / 2 : 0);
    const pan = panFrom(x, null);
    audio.play("click", { pitch: PITCH[next], gain: 0.55, pan });
    // The event's own timestamp is on the same clock as performance.now().
    intent.current = { to: next, until: at + 1500, pan };
    setAsked(next);
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const step = (by: number) => {
    const i = Math.max(0, cycle.indexOf(mode));
    return cycle[(i + by + cycle.length) % cycle.length] ?? "off";
  };

  const d = useTransform(
    [bend, wind] as MotionValue<number>[],
    ([b = 0, w = 0]: number[]) =>
      `${strandPath(strand(0, b, w, c, sag))} ${strandPath(strand(1, b, w, c, sag))}`,
  );
  const tint = useTransform(
    heat,
    (h) =>
      `color-mix(in oklab, ${accent} ${Math.round(clamp01(h) * 100)}%, ${idleColor})`,
  );
  // The loop is cut away under the badge, so it reads on any background.
  const holeR = useTransform(pipScale, (k) => r2((PIP.r + 1.6) * k));

  const pressed = mode === "off" ? false : mode === "all" ? true : "mixed";
  const on = mode !== "off";

  return (
    <span className={cn("inline-flex", className)}>
      <motion.button
        ref={buttonRef}
        type="button"
        aria-pressed={pressed}
        aria-label={compact ? label : undefined}
        disabled={disabled}
        onClick={(event) => {
          // A click with no pointer behind it is Space, Enter or assistive
          // technology: it pans from the button's middle.
          commit(
            step(1),
            event.timeStamp,
            event.detail === 0 ? null : event.clientX,
          );
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          let next: RepeatMode | null = null;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            next = step(1);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            next = step(-1);
          } else if (event.key === "Home") {
            next = cycle[0] ?? "off";
          } else if (event.key === "End") {
            next = cycle[cycle.length - 1] ?? "off";
          }
          if (next === null) return;
          event.preventDefault();
          commit(next, event.timeStamp, null);
        }}
        whileTap={motionSafe && !disabled ? { scale: 0.97 } : undefined}
        transition={springs.flick}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center rounded-full border font-medium whitespace-nowrap transition-colors outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          compact ? s.square : s.box,
          on
            ? "text-foreground"
            : "border-hairline-strong bg-surface-1 text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground",
        )}
        style={
          on
            ? {
                borderColor: `color-mix(in oklab, ${accent} 45%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
              }
            : undefined
        }
      >
        <svg
          aria-hidden
          width={s.glyph}
          height={r2((s.glyph * H) / W)}
          viewBox={`0 0 ${W} ${H}`}
          className="block shrink-0 overflow-visible"
        >
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={W}
              height={H}
            >
              <rect width={W} height={H} fill="white" />
              <motion.circle
                cx={pipX}
                cy={pipY}
                r={holeR}
                fill="black"
                style={{ opacity: pipOpacity }}
              />
            </mask>
          </defs>
          <motion.path
            d={d}
            mask={`url(#${maskId})`}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: tint }}
          />
          <motion.g
            style={{
              x: pipX,
              y: pipY,
              scale: pipScale,
              opacity: pipOpacity,
              originX: 0.5,
              originY: 0.5,
            }}
          >
            <circle cx={0} cy={0} r={PIP.r} style={{ fill: accent }} />
            <path
              d="M -1.5 -1.6 L 0.4 -3 L 0.4 3"
              fill="none"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-background"
            />
          </motion.g>
        </svg>
        {compact ? null : (
          <span className="grid text-left">
            {cycle.map((m) => {
              const active = m === mode;
              return (
                <motion.span
                  key={m}
                  aria-hidden={active ? undefined : true}
                  className="col-start-1 row-start-1"
                  initial={false}
                  animate={
                    active
                      ? {
                          opacity: 1,
                          y: motionSafe ? [distances.nudge, 0] : 0,
                        }
                      : { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
                  }
                  transition={
                    active
                      ? {
                          opacity: {
                            duration: durations.fast,
                            delay: 0.03,
                            ease: easings.enter,
                          },
                          y: springs.snap,
                        }
                      : exitFor(durations.blink)
                  }
                >
                  {text[m]}
                </motion.span>
              );
            })}
          </span>
        )}
      </motion.button>
      <span aria-live="polite" aria-atomic className="sr-only">
        {heard.words}
      </span>
    </span>
  );
}
