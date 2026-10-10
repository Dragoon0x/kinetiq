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
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TickSpringChecked = boolean | "indeterminate";
export type TickSpringSize = "sm" | "md" | "lg";
export type TickSpringAppearance = "fill" | "ink";

export type TickSpringProps = {
  /** Controlled state: ticked, clear, or "indeterminate" (a dash). */
  checked?: TickSpringChecked;
  /** Initial state when uncontrolled. @default false */
  defaultChecked?: TickSpringChecked;
  /** Fires from the press or key that changed it. A press on a dash always ticks. */
  onCheckedChange?: (checked: boolean) => void;
  /** The text beside the box; clicking it toggles the box. */
  label: React.ReactNode;
  /** A quieter second line under the label, linked as the box's description. */
  description?: React.ReactNode;
  /** The pen's width in px. @default 2.25 */
  stroke?: number;
  /** The pen's spring stiffness: higher draws faster and settles sooner. @default 520 */
  stiffness?: number;
  /** How far the pen overshoots the end of the tick before it settles, 0 to 1. @default 0.5 */
  bounce?: number;
  /** Strike the label through, line by line, once the tick lands. @default false */
  strike?: boolean;
  /** "fill" floods the box behind a light tick; "ink" keeps it outlined and draws the tick in colour, past the box's corner. @default "fill" */
  appearance?: TickSpringAppearance;
  /** The fill (or the ink) colour; any CSS colour. @default "var(--accent-bright)" */
  color?: string;
  /** Box 16, 20 or 24px, with the label's line to match. @default "md" */
  size?: TickSpringSize;
  /** Form field name, submitted while ticked. */
  name?: string;
  /** The value submitted under `name`. @default "on" */
  value?: string;
  required?: boolean;
  /** The box's id; the label points at it. @default generated */
  id?: string;
  /** Play the pen's tick. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = readonly [number, number];
type Shape = readonly [Pt, Pt, Pt];

type Geometry = { box: number; radius: number; text: string; gap: string };

const GEOMETRY: Record<TickSpringSize, Geometry> = {
  sm: { box: 16, radius: 4, text: "text-xs leading-4", gap: "gap-2" },
  md: { box: 20, radius: 5, text: "text-sm leading-5", gap: "gap-2.5" },
  lg: { box: 24, radius: 6, text: "text-base leading-6", gap: "gap-3" },
};

/** The tick and the dash, as shares of the box: start, corner, end. */
const TICK_IN: Shape = [
  [0.26, 0.53],
  [0.43, 0.7],
  [0.76, 0.32],
];
/** A hand-ticked form: the long arm swings out past the box's corner. */
const TICK_INK: Shape = [
  [0.2, 0.5],
  [0.42, 0.78],
  [1.08, -0.08],
];
const DASH: Shape = [
  [0.28, 0.5],
  [0.5, 0.5],
  [0.72, 0.5],
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** The shape between the dash (0) and the tick (1); past 1 it overshoots. */
function shapeAt(tick: Shape, m: number, box: number, sag: number): Shape {
  const at = (i: 0 | 1 | 2): Pt => {
    const a = DASH[i];
    const b = tick[i];
    return [lerp(a[0], b[0], m) * box, lerp(a[1], b[1], m) * box];
  };
  const c = at(1);
  return [at(0), [c[0], c[1] + sag], at(2)];
}

const lengthOf = (s: Shape) =>
  Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) +
  Math.hypot(s[2][0] - s[1][0], s[2][1] - s[1][1]);

/**
 * The stroke as far as the pen has got. Past 1 the pen carries on along the
 * long arm's own direction: that is the overshoot, and the spring pulls it
 * back. Rebuilt per frame, so the stroke can run past its end — which a
 * dash offset cannot.
 */
function strokeOf(s: Shape, draw: number): string {
  const l1 = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
  const l2 = Math.hypot(s[2][0] - s[1][0], s[2][1] - s[1][1]);
  const d = draw * (l1 + l2);
  if (d < 0.05 || l1 + l2 <= 0) return "";
  const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
  if (d <= l1 || l2 <= 0) {
    const t = l1 > 0 ? Math.min(d, l1) / l1 : 0;
    return `M ${f(s[0])} L ${f([
      s[0][0] + (s[1][0] - s[0][0]) * t,
      s[0][1] + (s[1][1] - s[0][1]) * t,
    ])}`;
  }
  const t = (d - l1) / l2;
  return `M ${f(s[0])} L ${f(s[1])} L ${f([
    s[1][0] + (s[2][0] - s[1][0]) * t,
    s[1][1] + (s[2][1] - s[1][1]) * t,
  ])}`;
}

type Look = "off" | "on" | "mixed";
const lookOf = (c: TickSpringChecked): Look =>
  c === "indeterminate" ? "mixed" : c ? "on" : "off";

/**
 * A checkbox whose tick is drawn by an elastic pen. A press squashes the box
 * on its base; checking draws the tick on a spring of `stiffness` and
 * `bounce` that runs past 1, so the pen overshoots the end of the long arm
 * and springs back, and the corner dips under the pen as it turns. With
 * `appearance="fill"` the box floods with colour from its centre on snap; with
 * "ink" it stays outlined and the tick swings out past its corner like a
 * hand-ticked form. An indeterminate dash is not erased by the next press:
 * its three points spring into the tick's three points on the same spring.
 * With `strike`, a line sweeps through the label once the tick lands, line
 * by line when it wraps.
 *
 * It is a native checkbox — the focused element is the box itself — so Tab
 * reaches it, Space toggles it, a form submits it and indeterminate reads as
 * mixed. Under reduced motion nothing squashes or overshoots: the tick and
 * dash fade in whole and the strike appears at once.
 */
export function TickSpring({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  stroke = 2.25,
  stiffness = 520,
  bounce = 0.5,
  strike = false,
  appearance = "fill",
  color = "var(--accent-bright)",
  size = "md",
  name,
  value,
  required,
  id,
  sound = false,
  disabled = false,
  className,
}: TickSpringProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const autoId = React.useId();
  const boxId = id ?? `tick-spring-${autoId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const descId = `${boxId}-description`;
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const ink = appearance === "ink";
  const tick = ink ? TICK_INK : TICK_IN;
  // The pen carries a little less than the raw stiffness, so a tick at the
  // default reads as a stroke and not a blink.
  const k = clamp(stiffness, 60, 2000) * 0.7;
  // Bounce is the damping ratio turned round: 0 lands dead, 1 overshoots
  // far and rings twice.
  const ratio = lerp(0.9, 0.25, clamp(bounce, 0, 1));
  const width = clamp(stroke, 0.5, 6);

  const [own, setOwn] = React.useState<TickSpringChecked>(defaultChecked);
  const state = checked ?? own;
  const look = lookOf(state);
  const isOn = state === true;

  const draw = useMotionValue(look === "off" ? 0 : 1);
  const morph = useMotionValue(look === "mixed" ? 0 : 1);
  const sag = useMotionValue(0);
  const fill = useMotionValue(look === "off" ? 0 : 1);
  const fade = useMotionValue(1);
  const sweep = useMotionValue(isOn && strike ? 100 : 0);
  const squashX = useMotionValue(1);
  const squashY = useMotionValue(1);

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const shown = React.useRef<Look>(look);
  /** The visitor caused the change in flight: its pen may make a sound. */
  const armed = React.useRef(false);
  /** The pen has landed on this stroke: the tick sounded, the strike began. */
  const landed = React.useRef(look === "on");
  const pressedDown = React.useRef(false);
  const latest = React.useRef({ strike, motionSafe, look });
  React.useEffect(() => {
    latest.current = { strike, motionSafe, look };
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const pan = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const register = size === "sm" ? 1.2 : size === "lg" ? 0.85 : 1;

  const startStrike = () => {
    if (!latest.current.strike) return;
    if (!latest.current.motionSafe) {
      anims.current.get("sweep")?.stop();
      sweep.jump(100);
      return;
    }
    run("sweep", animate(sweep, 100, springs.glide));
  };

  /** The pen reached the end of its stroke for the first time. */
  const land = () => {
    if (landed.current) return;
    landed.current = true;
    if (armed.current) {
      audio.play("tick", { pitch: register, gain: 0.6, pan: pan() });
    }
    armed.current = false;
    startStrike();
  };

  const springTo = (
    mv: MotionValue<number>,
    key: string,
    target: number,
    onDone?: () => void,
  ) =>
    run(
      key,
      animate(mv, target, {
        ...spring(k, ratio),
        onComplete: onDone,
      }),
    );

  const transition = (from: Look, to: Look) => {
    // A new stroke has not landed yet; a cleared box has nothing to land.
    landed.current = false;
    if (!motionSafe) {
      for (const key of ["draw", "morph", "sag"])
        anims.current.get(key)?.stop();
      sag.jump(0);
      if (to === "off") {
        if (armed.current) {
          audio.play("tick", { pitch: register * 0.7, gain: 0.35, pan: pan() });
        }
        armed.current = false;
        run(
          "fade",
          animate(fade, 0, {
            duration: durations.fast,
            ease: easings.exit,
            onComplete: () => {
              draw.jump(0);
              fade.jump(1);
            },
          }),
        );
      } else {
        draw.jump(1);
        morph.jump(to === "mixed" ? 0 : 1);
        if (from === "off") {
          fade.jump(0);
          run(
            "fade",
            animate(fade, 1, { duration: durations.fast, ease: easings.enter }),
          );
        }
        if (to === "on") land();
        else armed.current = false;
      }
      run(
        "fill",
        animate(fill, to === "off" ? 0 : 1, { duration: durations.fast }),
      );
      if (to !== "on") {
        anims.current.get("sweep")?.stop();
        sweep.jump(0);
      }
      return;
    }

    fade.jump(1);
    if (to === "off") {
      // Taking a tick back never celebrates: the pen retracts, no overshoot.
      run(
        "draw",
        animate(draw, 0, { duration: durations.fast, ease: easings.exit }),
      );
      run(
        "fill",
        animate(fill, 0, { duration: durations.fast, ease: easings.exit }),
      );
      run(
        "sweep",
        animate(sweep, 0, { duration: durations.fast, ease: easings.exit }),
      );
      if (armed.current) {
        audio.play("tick", { pitch: register * 0.7, gain: 0.35, pan: pan() });
      }
      armed.current = false;
      return;
    }

    run("fill", animate(fill, 1, springs.snap));
    if (from === "off") {
      // A fresh stroke: the pen starts at the beginning of the shape.
      morph.jump(to === "mixed" ? 0 : 1);
      draw.jump(0);
      springTo(draw, "draw", 1);
      if (to === "mixed") armed.current = false;
    } else if (from === "mixed" && to === "on") {
      // The dash is not erased: it bends into the tick.
      if (draw.get() < 0.999) springTo(draw, "draw", 1);
      springTo(morph, "morph", 1);
    } else if (from === "on" && to === "mixed") {
      run(
        "sweep",
        animate(sweep, 0, { duration: durations.fast, ease: easings.exit }),
      );
      run("morph", animate(morph, 0, springs.glide));
      armed.current = false;
    }
  };

  // Every change of state — a press here, or the host's word — gets the pen.
  React.useEffect(() => {
    if (shown.current === look) return;
    const from = shown.current;
    shown.current = look;
    transition(from, look);
    // `transition` reads only refs and motion values that never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look]);

  // The listeners below outlive renders; they reach the latest `land` (and
  // with it the latest sound setting) through a ref.
  const landRef = React.useRef(land);
  React.useEffect(() => {
    landRef.current = land;
  });

  // The pen lands when its stroke (or its bend into a tick) first reaches the
  // end; the corner dips as the pen turns it.
  React.useEffect(() => {
    const corner = () => {
      const s = shapeAt(tick, morph.get(), g.box, 0);
      const l1 = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
      return l1 / Math.max(1e-6, lengthOf(s));
    };
    const offDraw = draw.on("change", (v) => {
      const prev = draw.getPrevious() ?? v;
      if (!latest.current.motionSafe) return;
      const c = corner();
      if (prev < c && v >= c && morph.get() > 0.99) {
        run(
          "sag",
          animate(sag, 0, {
            ...spring(700, 0.35),
            velocity: 30 * (g.box / 20),
          }),
        );
      }
      if (v >= 0.985 && shown.current === "on" && morph.get() > 0.99) {
        landRef.current();
      }
    });
    const offMorph = morph.on("change", (v) => {
      if (v >= 0.985 && shown.current === "on" && draw.get() > 0.98) {
        landRef.current();
      }
    });
    return () => {
      offDraw();
      offMorph();
    };
    // The listeners are rebound when the geometry they measure changes.
  }, [draw, morph, sag, tick, g.box]);

  // Turning the strike on or off while ticked sweeps it in or out.
  React.useEffect(() => {
    if (shown.current !== "on" || !landed.current) return;
    if (strike) {
      if (!motionSafe) sweep.jump(100);
      else run("sweep", animate(sweep, 100, springs.glide));
    } else {
      run(
        "sweep",
        animate(sweep, 0, { duration: durations.fast, ease: easings.exit }),
      );
    }
  }, [strike, motionSafe, sweep]);

  // The native node carries indeterminate; React has no attribute for it.
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = look === "mixed";
  }, [look]);

  // A click clears the node's indeterminate itself. If the host keeps the
  // dash (refuses the change), nothing re-renders, so put it back after the
  // host has had its turn.
  const resync = () =>
    window.requestAnimationFrame(() => {
      const node = inputRef.current;
      if (node) node.indeterminate = latest.current.look === "mixed";
    });

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const press = () => {
    if (disabled || !motionSafe || pressedDown.current) return;
    pressedDown.current = true;
    run("sx", animate(squashX, 1.1, springs.flick));
    run("sy", animate(squashY, 0.86, springs.flick));
  };
  const letGo = () => {
    if (!pressedDown.current) return;
    pressedDown.current = false;
    run("sx", animate(squashX, 1, springs.recoil));
    run("sy", animate(squashY, 1, springs.recoil));
  };

  const onChange = () => {
    if (disabled) return;
    // A press on a dash always ticks, as the native box does.
    const next = state === "indeterminate" ? true : !isOn;
    armed.current = true;
    if (checked === undefined) setOwn(next);
    onCheckedChange?.(next);
    if (state === "indeterminate") resync();
  };

  const path = useTransform(
    [draw, morph, sag] as MotionValue<number>[],
    ([d = 0, m = 1, s = 0]: number[]) =>
      strokeOf(shapeAt(tick, m, g.box, s), d),
  );
  const strikeSize = useTransform(
    sweep,
    (s) => `${r2(clamp(s, 0, 100))}% max(1px, 0.075em)`,
  );
  const fillScale = useTransform(fill, (f) => r2(Math.max(0, f)));
  const fillOpacity = useTransform(fill, (f) => (f > 0.01 ? 1 : 0));
  const struck = isOn && strike;

  return (
    <div
      className={cn(
        "inline-flex items-start",
        g.gap,
        disabled && "opacity-50",
        className,
      )}
      style={{ "--tick-spring-color": color } as React.CSSProperties}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        press();
      }}
      onPointerUp={letGo}
      onPointerLeave={letGo}
      onPointerCancel={letGo}
    >
      <motion.span
        className="relative inline-grid shrink-0 place-items-center"
        style={{
          width: g.box,
          height: g.box,
          scaleX: squashX,
          scaleY: squashY,
          originX: 0.5,
          originY: 0.85,
        }}
      >
        <input
          ref={inputRef}
          id={boxId}
          type="checkbox"
          name={name}
          value={value}
          required={required}
          checked={isOn}
          disabled={disabled}
          aria-describedby={description ? descId : undefined}
          onChange={onChange}
          onKeyDown={(event) => {
            if (event.key === " " && !event.repeat) press();
          }}
          onKeyUp={(event) => {
            if (event.key === " ") letGo();
          }}
          onBlur={letGo}
          className={cn(
            "absolute inset-0 m-0 size-full cursor-pointer appearance-none border bg-card transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
            look === "off"
              ? "border-input hover:border-ink-3"
              : ink
                ? "border-[var(--tick-spring-color)]"
                : "border-transparent",
          )}
          style={{ borderRadius: g.radius }}
        />
        {ink ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ borderRadius: g.radius }}
          >
            <motion.span
              className="absolute inset-0 bg-[var(--tick-spring-color)]"
              style={{
                scale: fillScale,
                opacity: fillOpacity,
                borderRadius: g.radius,
              }}
            />
          </span>
        )}
        <svg
          aria-hidden
          width={g.box}
          height={g.box}
          viewBox={`0 0 ${g.box} ${g.box}`}
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          <motion.path
            d={path}
            fill="none"
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={
              ink
                ? "stroke-[var(--tick-spring-color)]"
                : "stroke-[var(--primary-foreground)]"
            }
            style={{ opacity: fade }}
          />
        </svg>
      </motion.span>
      <label
        htmlFor={boxId}
        className={cn(
          "min-w-0 select-none",
          g.text,
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <motion.span
          className={cn(
            "bg-no-repeat transition-colors duration-200",
            struck ? "text-ink-3" : "text-foreground",
          )}
          style={{
            backgroundImage: "linear-gradient(currentColor, currentColor)",
            backgroundPosition: "0 58%",
            backgroundSize: strikeSize,
          }}
        >
          {label}
        </motion.span>
        {description ? (
          <span id={descId} className="mt-0.5 block text-xs text-ink-3">
            {description}
          </span>
        ) : null}
      </label>
    </div>
  );
}
