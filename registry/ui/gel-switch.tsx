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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GelSwitchSize = "sm" | "md" | "lg";

export type GelSwitchProps = {
  /** Controlled on/off state. */
  checked?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultChecked?: boolean;
  /** Fires from the press or the drag that changed it, with the new state. */
  onCheckedChange?: (checked: boolean) => void;
  /** What the switch controls. Its accessible name, and shown beside it unless `hideLabel`. */
  label: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** How thick the gel is, 0 to 1: runny gel is quick and splashy, thick gel slow and composed. @default 0.5 */
  viscosity?: number;
  /** How far the droplet reaches toward its new side before the rest of it follows, 0 to 1. @default 0.6 */
  stretch?: number;
  /** How much the droplet jiggles when it lands, 0 to 1. @default 0.5 */
  wobble?: number;
  /** Fill the track with liquid behind the droplet while on. @default true */
  fill?: boolean;
  /** @default "md" */
  size?: GelSwitchSize;
  /** Play the droplet's sounds. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Geometry = {
  width: number;
  height: number;
  radius: number;
  off: number;
  on: number;
};

const GEOMETRY: Record<GelSwitchSize, Geometry> = {
  sm: { width: 44, height: 24, radius: 8, off: 12, on: 32 },
  md: { width: 58, height: 32, radius: 11, off: 16, on: 42 },
  lg: { width: 72, height: 40, radius: 14, off: 20, on: 52 },
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The bridge between two circles, as a closed path: the classic metaball
 * construction (tangent points spread along each circle, joined by curves
 * whose handles shorten as the circles part). Drawn with the two circles, it
 * reads as one droplet with a neck, crisp at any size and cheap to rebuild each
 * frame — no blur filter, no threshold, no soft edge.
 */
function bridgePath(
  x1: number,
  x2: number,
  cy: number,
  ra: number,
  rb: number,
): string {
  const d = Math.abs(x2 - x1);
  const maxDistance = (ra + rb) * 1.6;
  if (d < 0.5 || d > maxDistance || d <= Math.abs(ra - rb)) return "";
  const dir = x2 >= x1 ? 0 : Math.PI;
  const u1 =
    d < ra + rb
      ? Math.acos(Math.min(1, (ra * ra + d * d - rb * rb) / (2 * ra * d)))
      : 0;
  const u2 =
    d < ra + rb
      ? Math.acos(Math.min(1, (rb * rb + d * d - ra * ra) / (2 * rb * d)))
      : 0;
  const spread = 0.5;
  const maxSpread = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / d)));
  const a1 = dir + u1 + (maxSpread - u1) * spread;
  const b1 = dir - u1 - (maxSpread - u1) * spread;
  const a2 = dir + Math.PI - u2 - (Math.PI - u2 - maxSpread) * spread;
  const b2 = dir - Math.PI + u2 + (Math.PI - u2 - maxSpread) * spread;
  const p = (x: number, r: number, a: number) =>
    [x + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const p1a = p(x1, ra, a1);
  const p1b = p(x1, ra, b1);
  const p2a = p(x2, rb, a2);
  const p2b = p(x2, rb, b2);
  const handle =
    Math.min(
      spread * 2.4,
      Math.hypot(p1a[0] - p2a[0], p1a[1] - p2a[1]) / (ra + rb),
    ) * Math.min(1, (d * 2) / (ra + rb));
  const h = (pt: readonly [number, number], r: number, a: number) =>
    [
      pt[0] + r * handle * Math.cos(a),
      pt[1] + r * handle * Math.sin(a),
    ] as const;
  const h1 = h(p1a, ra, a1 - Math.PI / 2);
  const h2 = h(p2a, rb, a2 + Math.PI / 2);
  const h3 = h(p2b, rb, b2 - Math.PI / 2);
  const h4 = h(p1b, ra, b1 + Math.PI / 2);
  const f = (pt: readonly [number, number]) => `${r2(pt[0])} ${r2(pt[1])}`;
  return [
    `M ${f(p1a)}`,
    `C ${f(h1)} ${f(h2)} ${f(p2a)}`,
    `A ${r2(rb)} ${r2(rb)} 0 0 0 ${f(p2b)}`,
    `C ${f(h3)} ${f(h4)} ${f(p1b)}`,
    `A ${r2(ra)} ${r2(ra)} 0 0 0 ${f(p1a)}`,
    "Z",
  ].join(" ");
}

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/**
 * A switch whose knob is a drop of gel. Pressed, the droplet reaches toward
 * its new side while the rest of it holds back, a neck forms between the two
 * and pinches as it goes, then the tail lets go and catches up; the leading
 * edge squashes against the end with a jiggle whose size is `wobble`, and the
 * track fills with liquid behind it. The droplet can also be dragged: it
 * follows the finger 1:1, rubber-bands past either end, and a release commits
 * to the side the throw was heading for.
 *
 * The droplet is two circles and the bridge between them, rebuilt each frame
 * from two springs — no filter, so the edge stays crisp. It is a real
 * `role="switch"` button: Space and Enter toggle it, its state is announced,
 * and a disabled switch says so. Under reduced motion the droplet moves in one
 * piece on a short tween with no neck and no jiggle, and the colour still
 * changes, because on and off are information.
 */
export function GelSwitch({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  hideLabel = false,
  viscosity = 0.5,
  stretch = 0.6,
  wobble = 0.5,
  fill = true,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: GelSwitchProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const labelId = React.useId();
  const g = GEOMETRY[size] ?? GEOMETRY.md;
  const cy = g.height / 2;
  const travel = g.on - g.off;

  const [own, setOwn] = React.useState(defaultChecked);
  const isOn = checked ?? own;

  const head = useMotionValue(isOn ? g.on : g.off);
  const tail = useMotionValue(isOn ? g.on : g.off);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef<number[]>([]);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const dragging = React.useRef(false);
  const dragStart = React.useRef(0);

  const v = clamp01(viscosity);
  const s = clamp01(stretch);
  const w = clamp01(wobble);

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }, []);

  const settle = React.useCallback(
    (to: boolean, velocity = 0) => {
      halt();
      const target = to ? g.on : g.off;
      if (!motionSafe) {
        const tween = { duration: durations.fast, ease: easings.enter };
        running.current = [
          animate(head, target, tween),
          animate(tail, target, tween),
        ];
        return;
      }
      const stiffness = lerp(900, 340, v);
      const headSpring = spring(stiffness, lerp(0.95, 0.42, w));
      const tailSpring = spring(stiffness * lerp(0.9, 0.34, s), 0.96);
      // The detach is heard where the neck is thinnest: when the tail lets go.
      const tailDelay = 0.015 + s * 0.09;
      const pan = buttonRef.current
        ? panFrom(buttonRef.current.getBoundingClientRect().left + target, null)
        : 0;
      const register = size === "sm" ? 1.25 : size === "lg" ? 0.85 : 1;
      running.current = [
        animate(head, target, { ...headSpring, velocity }),
        animate(tail, target, { ...tailSpring, delay: tailDelay }),
      ];
      timers.current = [
        window.setTimeout(
          () => audio.play("blup", { pitch: register, pan, gain: 0.7 }),
          Math.round(tailDelay * 1000),
        ),
        window.setTimeout(
          () =>
            audio.play("plip", {
              pitch: register * (to ? 1.12 : 0.9),
              pan,
              gain: 0.55,
            }),
          Math.round(1000 * (0.09 + v * 0.09)),
        ),
      ];
    },
    [audio, g.off, g.on, halt, head, motionSafe, s, size, tail, v, w],
  );

  // A host that changes `checked` gets the same droplet a press would.
  const shown = React.useRef(isOn);
  React.useEffect(() => {
    if (shown.current === isOn) return;
    shown.current = isOn;
    if (!dragging.current) settle(isOn);
  }, [isOn, settle]);

  // A size change moves the rest positions; the droplet goes straight there.
  React.useEffect(() => {
    halt();
    head.set(shown.current ? g.on : g.off);
    tail.set(shown.current ? g.on : g.off);
  }, [g.on, g.off, halt, head, tail]);

  React.useEffect(() => halt, [halt]);

  const commit = (next: boolean, velocity = 0) => {
    if (next === isOn) {
      settle(next, velocity);
      return;
    }
    if (checked === undefined) {
      setOwn(next);
      shown.current = next;
      settle(next, velocity);
    } else {
      // Controlled: go back to where the host says it is. If the host takes
      // the change, the effect above carries the droplet across once it
      // answers; if it refuses, the switch never shows a false toggle.
      settle(isOn, velocity);
    }
    onCheckedChange?.(next);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      dragStart.current = head.get();
      halt();
    },
    onMove: ({ offset }) => {
      const raw = dragStart.current + offset.x;
      const x =
        raw < g.off
          ? g.off + rubberband(raw - g.off, travel)
          : raw > g.on
            ? g.on + rubberband(raw - g.on, travel)
            : raw;
      head.set(r2(x));
      // The tail trails the finger on a short spring so the neck shows.
      running.current = [
        animate(
          tail,
          r2(Math.min(g.on, Math.max(g.off, x))),
          spring(lerp(700, 260, s), 0.9),
        ),
      ];
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const landing = project(head.get(), velocity.x, 0.99);
      commit(landing > g.off + travel / 2, velocity.x);
    },
    onCancel: () => {
      dragging.current = false;
      settle(isOn);
    },
    onTap: () => commit(!isOn),
  });

  // Colour follows the droplet's middle, not its leading edge, so the change
  // travels with the gel instead of arriving ahead of it.
  const progress = useTransform(
    [head, tail] as MotionValue<number>[],
    ([h, t]) =>
      clamp01(((h as number) + (t as number) - 2 * g.off) / (2 * travel)),
  );
  const tint = useTransform(
    progress,
    (p) =>
      `color-mix(in oklch, var(--accent-bright) ${Math.round(p * 100)}%, var(--ink-3))`,
  );

  // Volume is kept, roughly: the further the two halves part, the thinner
  // the tail runs.
  const tailRadius = useTransform(
    [head, tail] as MotionValue<number>[],
    ([h, t]) =>
      r2(
        g.radius *
          lerp(
            1,
            0.7,
            clamp01(Math.abs((h as number) - (t as number)) / travel),
          ),
      ),
  );
  const neck = useTransform(
    [head, tail, tailRadius] as MotionValue<number>[],
    ([h, t, rt]) =>
      bridgePath(t as number, h as number, cy, rt as number, g.radius),
  );

  // Squash follows speed: a fast droplet is long, a landing one bulges, and
  // an underdamped head spring turns that into the jiggle.
  const headVelocity = useVelocity(head);
  const velocityScale = useTransform(headVelocity, (vx) =>
    r2(Math.min(0.08 + w * 0.2, Math.abs(vx) / (travel * 40))),
  );
  const squashX = useTransform(velocityScale, (k) => r2(1 + k));
  const squashY = useTransform(velocityScale, (k) => r2(1 - k * 0.8));
  // Motion writes an SVG element's transform as CSS, so the squash is carried
  // by its own transform values scaled about the head: the origin is where the
  // head sits inside the droplet's box, as a fraction of that box.
  const squashOrigin = useTransform(
    [head, tail] as MotionValue<number>[],
    ([h, t]) => {
      const left = Math.min(h as number, t as number) - g.radius;
      const width = Math.abs((h as number) - (t as number)) + 2 * g.radius;
      return Number((((h as number) - left) / width).toFixed(3));
    },
  );

  const fillWidth = useTransform(tail, (t) =>
    r2(Math.max(0, t - (g.off - g.radius))),
  );
  const fillOpacity = useTransform(progress, (p) => (fill ? r2(p * 0.34) : 0));
  const shineX = useTransform(head, (h) => r2(h - g.radius * 0.32));

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <span
        id={labelId}
        onClick={() => {
          if (!disabled) commit(!isOn);
        }}
        className={cn(
          "text-sm text-foreground select-none",
          hideLabel ? "sr-only" : "cursor-pointer",
          disabled && "cursor-not-allowed text-ink-3",
        )}
      >
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        role="switch"
        aria-checked={isOn}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap. A click with no
          // pointer behind it — Space or Enter, assistive technology — is a
          // press too, and goes through the same path, sound and all.
          if (event.detail === 0) commit(!isOn);
        }}
        {...drag}
        className={cn(
          "relative shrink-0 cursor-pointer touch-pan-y rounded-full outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
        style={{ width: g.width, height: g.height }}
      >
        <svg
          aria-hidden
          width={g.width}
          height={g.height}
          viewBox={`0 0 ${g.width} ${g.height}`}
          className="block overflow-visible"
        >
          <rect
            x={0.5}
            y={0.5}
            width={g.width - 1}
            height={g.height - 1}
            rx={(g.height - 1) / 2}
            className="fill-surface-2 stroke-hairline-strong"
          />
          <motion.g style={{ color: tint }}>
            <motion.rect
              x={g.off - g.radius}
              y={cy - g.radius}
              height={g.radius * 2}
              rx={g.radius}
              width={fillWidth}
              fill="currentColor"
              style={{ opacity: fillOpacity }}
            />
            <motion.g
              style={{
                scaleX: squashX,
                scaleY: squashY,
                originX: squashOrigin,
                originY: 0.5,
              }}
            >
              <motion.path d={neck} fill="currentColor" />
              <motion.circle
                cx={tail}
                cy={cy}
                r={tailRadius}
                fill="currentColor"
              />
              <motion.circle
                cx={head}
                cy={cy}
                r={g.radius}
                fill="currentColor"
              />
              <motion.ellipse
                cx={shineX}
                cy={cy - g.radius * 0.36}
                rx={g.radius * 0.34}
                ry={g.radius * 0.2}
                fill="white"
                opacity={0.5}
              />
            </motion.g>
          </motion.g>
        </svg>
      </button>
    </div>
  );
}
