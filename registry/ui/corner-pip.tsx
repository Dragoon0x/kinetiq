"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  type Point,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CornerPipCorner =
  "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type CornerPipValue = {
  corner: CornerPipCorner;
  /** Tucked into the side edge of its corner, showing only a tab. */
  tucked: boolean;
};

export type CornerPipSize = "sm" | "md" | "lg";

export type CornerPipProps = {
  /** What plays inside the floating player. */
  player: React.ReactNode;
  /** The screen behind it: whatever the frame shows. */
  children?: React.ReactNode;
  /** The player's name, used for its label, its grip and its tab. */
  label: string;
  /** Controlled place. */
  value?: CornerPipValue;
  /** Starting place when uncontrolled. @default bottom-right, untucked */
  defaultValue?: CornerPipValue;
  /** Fires from the throw or the key that moved it, with the new place. */
  onValueChange?: (value: CornerPipValue) => void;
  /** How quickly a throw dies, 0 to 1: slippery players coast further and overshoot the corner. @default 0.5 */
  friction?: number;
  /** The corner margin in px, 0 to 24. @default 12 */
  inset?: number;
  /** A throw off a side edge tucks the player into a tab. @default true */
  tuck?: boolean;
  /** The player's width: 112, 144 or 176 px, never more than 44% of the frame. @default "md" */
  size?: CornerPipSize;
  /** Swish on a throw, a soft thud on landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const WIDTHS: Record<CornerPipSize, number> = { sm: 112, md: 144, lg: 176 };
/** How much of a tucked player stays in view: its tab. */
const TAB = 22;
const DEFAULT: CornerPipValue = { corner: "bottom-right", tucked: false };
const CLOCKWISE: Record<CornerPipCorner, CornerPipCorner> = {
  "top-left": "top-right",
  "top-right": "bottom-right",
  "bottom-right": "bottom-left",
  "bottom-left": "top-left",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

const rowOf = (c: CornerPipCorner) => (c.startsWith("top") ? "top" : "bottom");
const sideOf = (c: CornerPipCorner) => (c.endsWith("left") ? "left" : "right");
const cornerOf = (row: "top" | "bottom", side: "left" | "right") =>
  `${row}-${side}` as CornerPipCorner;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type Size = { w: number; h: number };

/** Where a place puts the player's top-left corner, in frame px. */
function restOf(
  place: CornerPipValue,
  frame: Size,
  pip: Size,
  inset: number,
): Point {
  const left = sideOf(place.corner) === "left";
  const x = place.tucked
    ? left
      ? TAB - pip.w
      : frame.w - TAB
    : left
      ? inset
      : frame.w - pip.w - inset;
  const y = rowOf(place.corner) === "top" ? inset : frame.h - pip.h - inset;
  return { x, y };
}

const sentence = (label: string, place: CornerPipValue) =>
  place.tucked
    ? `${label} tucked into the ${sideOf(place.corner)} edge.`
    : `${label} in the ${place.corner.replace("-", " ")} corner.`;

/**
 * A floating player you throw into a corner, inside its own frame. It is 1:1
 * under the finger and rubber-bands past the frame's edges; on release its
 * momentum is projected with a deceleration set by `friction`, and the
 * corner whose quadrant the projected centre lands in is where it goes, on
 * a spring that takes the release velocity. With `tuck`, a throw whose
 * projection leaves through a side edge tucks it into that edge, leaving a
 * tab you pull (or press) to bring it back.
 *
 * The resting place is plain CSS, so the markup is right at any width and a
 * resize needs no measuring; the motion is an offset from it, set on the
 * frame the place changes so nothing jumps, then sprung to zero. The grip
 * is a button: arrow keys move the player corner to corner (and into the
 * edge), Enter moves it clockwise, and the tab brings it back — the same
 * flight and the same sounds. Under reduced motion it lands in one step,
 * with a short dip in opacity to mark the move.
 */
export function CornerPip({
  player,
  children,
  label,
  value,
  defaultValue = DEFAULT,
  onValueChange,
  friction = 0.5,
  inset = 12,
  tuck = true,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: CornerPipProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const f = clamp01(friction);
  const margin = clamp(inset, 0, 48);
  const width = WIDTHS[size] ?? WIDTHS.md;

  const [own, setOwn] = React.useState<CornerPipValue>(defaultValue);
  const held = value ?? own;
  const place: CornerPipValue = {
    corner: held.corner,
    tucked: tuck && held.tucked,
  };
  // Spoken only while the place holds it: a move the host refuses is silent.
  const [said, setSaid] = React.useState<{
    text: string;
    place: CornerPipValue;
  } | null>(null);
  // A release that keeps the place still needs a render to fly home from.
  const [, setReleased] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const pipRef = React.useRef<HTMLDivElement | null>(null);
  const gripRef = React.useRef<HTMLButtonElement | null>(null);
  const tabRef = React.useRef<HTMLButtonElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(1);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const shown = React.useRef<CornerPipValue>(place);
  // A throw or a key waiting for its flight: only these make a sound, so a
  // host or a prop that moves the player moves it silently.
  const launch = React.useRef<{ velocity: Point; key: boolean } | null>(null);
  const start = React.useRef<Point>({ x: 0, y: 0 });
  const focusNext = React.useRef<"grip" | "tab" | null>(null);
  const detach = React.useRef<(() => void) | null>(null);

  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
  };

  const sizes = () => {
    const frame = frameRef.current;
    const pip = pipRef.current;
    return {
      frame: { w: frame?.clientWidth ?? 0, h: frame?.clientHeight ?? 0 },
      pip: { w: pip?.offsetWidth ?? 0, h: pip?.offsetHeight ?? 0 },
    };
  };

  const pan = (atX: number) => {
    const frame = frameRef.current;
    if (!frame) return 0;
    const r = frame.getBoundingClientRect();
    return panFrom(r.left + frame.clientLeft + atX, frame);
  };

  /** Says where it is going and reports it; the flight follows the render. */
  const commit = (next: CornerPipValue, velocity: Point, key = false) => {
    launch.current = { velocity, key };
    setReleased((n) => n + 1);
    if (next.corner === place.corner && next.tucked === place.tucked) return;
    if (value === undefined) setOwn(next);
    setSaid({ text: sentence(label, next), place: next });
    onValueChange?.(next);
  };

  // The flight. When the place changes, the resting CSS changes with it, so
  // the offset is first set to where the player is drawn now (nothing moves
  // on this frame), then sprung to zero with the velocity it was thrown
  // with. A release the host did not take flies back the same way. It looks
  // at every commit and acts only when the place moved or a throw is waiting.
  React.useLayoutEffect(() => {
    const prev = shown.current;
    const moved = prev.corner !== place.corner || prev.tucked !== place.tucked;
    const thrown = launch.current;
    launch.current = null;
    shown.current = place;
    if (!moved && !thrown) return;
    const { frame, pip } = sizes();
    if (moved) {
      const was = restOf(prev, frame, pip, margin);
      const now = restOf(place, frame, pip, margin);
      x.set(r2(x.get() + was.x - now.x));
      y.set(r2(y.get() + was.y - now.y));
    }
    halt();
    const distance = Math.hypot(x.get(), y.get());
    const centre = restOf(place, frame, pip, margin).x + pip.w / 2;
    // A key's move is heard leaving once the place has actually changed.
    if (moved && thrown?.key && motionSafe) {
      audio.play("swish", { pitch: 1, gain: 0.4, pan: pan(centre) });
    }
    const thud = () => {
      if (!thrown) return;
      const speed = Math.hypot(x.getVelocity(), y.getVelocity());
      audio.play("thud", {
        pitch: place.tucked ? 1.25 : 1.6,
        gain: r2(clamp(0.22 + speed / 4000, 0.22, 0.55)),
        pan: pan(centre),
      });
    };
    if (!motionSafe) {
      x.set(0);
      y.set(0);
      if (distance > 4) {
        thud();
        opacity.set(0.55);
        running.current = [
          animate(opacity, 1, {
            duration: durations.fast,
            ease: easings.enter,
          }),
        ];
      }
      return;
    }
    // Slippery players overshoot their corner; sticky ones settle flat.
    const landing = spring(380, lerp(0.62, 0.92, f));
    const velocity = thrown?.velocity ?? { x: 0, y: 0 };
    let landed = distance <= 4;
    const check = () => {
      if (landed || Math.hypot(x.get(), y.get()) > 1.5) return;
      landed = true;
      thud();
    };
    running.current = [
      animate(x, 0, { ...landing, velocity: velocity.x, onUpdate: check }),
      animate(y, 0, { ...landing, velocity: velocity.y, onUpdate: check }),
    ];
  });

  // Focus moved by a key follows the control that is left in view.
  React.useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    (target === "tab" ? tabRef : gripRef).current?.focus({
      preventScroll: true,
    });
  });

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current = [];
      detach.current?.();
      detach.current = null;
    },
    [],
  );

  /** A keyboard move: the same flight and sounds as a throw. */
  const keyTo = (next: CornerPipValue, focus: "grip" | "tab") => {
    if (disabled) return;
    if (next.corner === place.corner && next.tucked === place.tucked) return;
    // Focus follows only when it was already on the player: a tap on the
    // tab brings it out without pulling focus along.
    if (pipRef.current?.contains(document.activeElement)) {
      focusNext.current = focus;
    }
    commit(next, { x: 0, y: 0 }, true);
  };

  const onKeyFrom = (event: React.KeyboardEvent, from: "grip" | "tab") => {
    const row = rowOf(place.corner);
    const side = sideOf(place.corner);
    let next: CornerPipValue | null = null;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const to = event.key === "ArrowUp" ? "top" : "bottom";
      next = { corner: cornerOf(to, side), tucked: place.tucked };
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const to = event.key === "ArrowLeft" ? "left" : "right";
      if (place.tucked) {
        // Inward brings it out; outward is already as far as it goes.
        next = to !== side ? { corner: place.corner, tucked: false } : place;
      } else if (to !== side) {
        next = { corner: cornerOf(row, to), tucked: false };
      } else if (tuck) {
        next = { corner: place.corner, tucked: true };
      } else {
        next = place;
      }
    }
    if (!next) return;
    event.preventDefault();
    keyTo(next, next.tucked ? "tab" : from === "tab" ? "grip" : from);
  };

  const drag = useDrag({
    disabled,
    onStart: () => {
      halt();
      start.current = { x: x.get(), y: y.get() };
      setDragging(true);
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cancel();
      };
      document.addEventListener("keydown", onKey);
      detach.current = () => document.removeEventListener("keydown", onKey);
    },
    onMove: ({ offset }) => {
      if (!detach.current) return;
      const { frame, pip } = sizes();
      const rest = restOf(place, frame, pip, margin);
      const minX = tuck ? TAB - pip.w : 0;
      const maxX = tuck ? frame.w - TAB : frame.w - pip.w;
      const px = rest.x + start.current.x + offset.x;
      const py = rest.y + start.current.y + offset.y;
      x.set(r2(rubberClamp(px, minX, maxX, pip.w / 2) - rest.x));
      y.set(r2(rubberClamp(py, 0, frame.h - pip.h, pip.h / 2) - rest.y));
    },
    onEnd: ({ velocity, point }) => {
      if (!detach.current) return;
      detach.current();
      detach.current = null;
      setDragging(false);
      const { frame, pip } = sizes();
      const rest = restOf(place, frame, pip, margin);
      const at = { x: rest.x + x.get(), y: rest.y + y.get() };
      // Heavier surfaces keep less of the throw each millisecond.
      const rate = lerp(0.997, 0.985, f);
      const cx = project(at.x, velocity.x, rate) + pip.w / 2;
      const cy = project(at.y, velocity.y, rate) + pip.h / 2;
      const next: CornerPipValue = {
        corner: cornerOf(
          cy < frame.h / 2 ? "top" : "bottom",
          cx < frame.w / 2 ? "left" : "right",
        ),
        tucked: tuck && (cx < 0 || cx > frame.w),
      };
      const speed = Math.hypot(velocity.x, velocity.y);
      if (motionSafe && speed > 250) {
        audio.play("swish", {
          pitch: r2(lerp(0.8, 1.4, clamp01(speed / 3000))),
          gain: r2(lerp(0.25, 0.6, clamp01(speed / 3000))),
          pan: panFrom(point.x, frameRef.current),
        });
      }
      commit(next, velocity);
    },
    onCancel: () => cancel(),
  });

  function cancel() {
    if (!detach.current) return;
    detach.current();
    detach.current = null;
    setDragging(false);
    launch.current = { velocity: { x: 0, y: 0 }, key: false };
    setReleased((n) => n + 1);
  }

  const left = sideOf(place.corner) === "left";
  const top = rowOf(place.corner) === "top";
  const anchor: React.CSSProperties = place.tucked
    ? left
      ? { right: `calc(100% - ${TAB}px)` }
      : { left: `calc(100% - ${TAB}px)` }
    : left
      ? { left: margin }
      : { right: margin };
  if (top) anchor.top = margin;
  else anchor.bottom = margin;

  return (
    <div
      ref={frameRef}
      role="group"
      aria-label={`${label} on screen`}
      aria-disabled={disabled || undefined}
      className={cn(
        "relative aspect-[2/1] w-full overflow-clip rounded-3 border border-hairline bg-surface-0 [contain:paint]",
        disabled && "opacity-50",
        className,
      )}
    >
      {children}
      <motion.div
        ref={pipRef}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        {...drag}
        className={cn(
          "absolute z-10 touch-none overflow-clip rounded-2 border border-hairline-strong bg-popover shadow-lg select-none",
          disabled
            ? "cursor-default"
            : dragging
              ? "cursor-grabbing"
              : "cursor-grab",
        )}
        style={{
          ...anchor,
          width: `min(${width}px, 44%)`,
          aspectRatio: "16 / 9",
          x,
          y,
          opacity,
        }}
      >
        <div inert={place.tucked} className="size-full">
          {player}
        </div>
        <button
          ref={gripRef}
          type="button"
          inert={place.tucked}
          aria-label={`Move ${label}`}
          aria-describedby={hintId}
          disabled={disabled}
          onKeyDown={(event) => onKeyFrom(event, "grip")}
          onClick={(event) => {
            // A pointer moves it by dragging. A click with no pointer behind
            // it — Enter, Space, assistive technology — goes clockwise.
            if (event.detail !== 0) return;
            keyTo({ corner: CLOCKWISE[place.corner], tucked: false }, "grip");
          }}
          className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-1 text-ink-2 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <svg aria-hidden viewBox="0 0 12 12" className="size-3 fill-current">
            {[3, 6, 9].flatMap((cy) =>
              [4.5, 7.5].map((cx) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} />
              )),
            )}
          </svg>
        </button>
        <button
          ref={tabRef}
          type="button"
          hidden={!place.tucked}
          aria-label={`Show ${label}`}
          aria-describedby={hintId}
          disabled={disabled}
          onKeyDown={(event) => onKeyFrom(event, "tab")}
          onClick={() => keyTo({ corner: place.corner, tucked: false }, "grip")}
          className={cn(
            "absolute inset-y-0 items-center justify-center bg-popover text-ink-2 outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
            place.tucked ? "flex" : "hidden",
            left ? "right-0 border-l" : "left-0 border-r",
            "border-hairline-strong",
          )}
          style={{ width: TAB }}
        >
          <svg
            aria-hidden
            viewBox="0 0 8 12"
            className={cn(
              "h-3 w-2 fill-none stroke-current",
              left && "-scale-x-100",
            )}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 2L2 6l4 4" />
          </svg>
        </button>
      </motion.div>
      <span id={hintId} className="sr-only">
        Drag or throw it into a corner. On the grip, arrow keys move it corner
        to corner{tuck ? " and into the side edge" : ""}, and Enter moves it
        clockwise.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {said &&
        said.place.corner === place.corner &&
        said.place.tucked === place.tucked
          ? said.text
          : ""}
      </span>
    </div>
  );
}
