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
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TurnoverCardAxis = "y" | "x";
export type TurnoverCardSize = "sm" | "md" | "lg";

export type TurnoverCardProps = {
  /** The face that shows first. Keep it free of controls: the card itself is the button. */
  front: React.ReactNode;
  /** The face on the other side. */
  back: React.ReactNode;
  /** The card's accessible name. @default "Flip card" */
  label?: string;
  /** Controlled: whether the back is showing. */
  flipped?: boolean;
  /** Initial side when uncontrolled. @default false */
  defaultFlipped?: boolean;
  /** Fires from the drag, press or key that turned it over, with the side now showing. */
  onFlippedChange?: (flipped: boolean) => void;
  /** Turn about the vertical axis (drag sideways) or the horizontal one (drag up and down). @default "y" */
  axis?: TurnoverCardAxis;
  /** The flip spring's stiffness: a lazy turn to a snap. @default 360 */
  stiffness?: number;
  /** How deep the perspective is, and how far the card lifts and its shadow spreads mid-turn, 0 to 1. @default 0.5 */
  depth?: number;
  /** How much the card wobbles about its face when a flip lands, 0 to 1. @default 0.5 */
  wobble?: number;
  /** Share of a half turn past which a release commits the flip (the throw is projected first). @default 0.5 */
  threshold?: number;
  /** How strongly the turning face darkens and catches the light, 0 to 1. @default 0.5 */
  shading?: number;
  /** A mouse over the card tilts it a few degrees toward the pointer. @default true */
  tilt?: boolean;
  /** Corner radius of the card, px. @default 16 */
  radius?: number;
  /** @default "md" */
  size?: TurnoverCardSize;
  /** Play a swish on every committed turn. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const MAX: Record<TurnoverCardSize, number> = { sm: 260, md: 300, lg: 340 };
/** The card's share of the box's width: the rest is room for the lift and the perspective. */
const CARD = 0.86;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const rad = (deg: number) => (deg * Math.PI) / 180;
/** Whether an angle rests with the back toward you. */
const parity = (a: number) => ((Math.round(a / 180) % 2) + 2) % 2 === 1;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

type FaceProps = {
  side: "front" | "back";
  axis: TurnoverCardAxis;
  angle: MotionValue<number>;
  fade: MotionValue<number>;
  shading: number;
  radius: number;
  hidden: boolean;
  motionSafe: boolean;
  id: string;
  children: React.ReactNode;
};

/**
 * One side of the card: its content, a shade on whichever half is turning
 * away from you, and a band of light that sweeps across mid-turn.
 */
function Face({
  side,
  axis,
  angle,
  fade,
  shading,
  radius,
  hidden,
  motionSafe,
  id,
  children,
}: FaceProps) {
  const sign = side === "front" ? 1 : -1;
  const k = clamp(shading, 0, 1);
  const nearA = useTransform(angle, (a) =>
    r3(Math.max(0, sign * Math.sin(rad(a))) * k * 0.55),
  );
  const nearB = useTransform(angle, (a) =>
    r3(Math.max(0, -sign * Math.sin(rad(a))) * k * 0.55),
  );
  const sheen = useTransform(angle, (a) =>
    r3(Math.abs(Math.sin(rad(a))) * k * 0.7),
  );
  const sweep = useTransform(
    angle,
    (a) => `${r2(50 - Math.sin(rad(a)) * 70 * sign)}% 50%`,
  );
  const opacity = useTransform(fade, (f) => r3(side === "front" ? 1 - f : f));
  const flip = axis === "y" ? "rotateY(180deg)" : "rotateX(180deg)";
  // The half that recedes: the right (or top) edge for a positive turn.
  const receding =
    axis === "y" ? ["to left", "to right"] : ["to bottom", "to top"];

  return (
    <motion.div
      id={id}
      aria-hidden={hidden || undefined}
      inert={hidden}
      className="absolute inset-0 overflow-hidden border border-hairline-strong bg-card text-foreground backface-hidden"
      style={{
        borderRadius: radius,
        transform: side === "back" && motionSafe ? flip : undefined,
        opacity: motionSafe ? undefined : opacity,
      }}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: nearA,
          background: `linear-gradient(${receding[0]}, color-mix(in oklab, black 70%, transparent), transparent 75%)`,
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: nearB,
          background: `linear-gradient(${receding[1]}, color-mix(in oklab, black 70%, transparent), transparent 75%)`,
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 mix-blend-soft-light"
        style={{
          opacity: sheen,
          backgroundImage:
            "linear-gradient(105deg, transparent 30%, oklch(1 0 0 / 0.75) 50%, transparent 70%)",
          backgroundSize: "220% 100%",
          backgroundPosition: sweep,
        }}
      />
    </motion.div>
  );
}

/**
 * A two-sided card you turn over by hand. Dragged, it rotates about its axis
 * 1:1 with the finger — a card's width of travel is half a turn — in a
 * perspective whose strength is `depth`, lifting toward you as it turns
 * while its shadow spreads, the half turning away darkening and a band of
 * light sweeping across. Let go and the throw is projected: past halfway the
 * card completes the flip, otherwise it springs back, both on a spring of
 * `stiffness` that takes the release velocity and lands with a wobble whose
 * size is `wobble`; a hard flick can carry it a full turn.
 *
 * The card is a toggle button (pressed = back showing): Space or Enter
 * flips it, arrow keys flip it in their direction, and the hidden face is
 * inert. Under reduced motion the faces crossfade instead of turning.
 */
export function TurnoverCard({
  front,
  back,
  label = "Flip card",
  flipped,
  defaultFlipped = false,
  onFlippedChange,
  axis = "y",
  stiffness = 360,
  depth = 0.5,
  wobble = 0.5,
  threshold = 0.5,
  shading = 0.5,
  tilt = true,
  radius = 16,
  size = "md",
  sound = false,
  disabled = false,
  className,
}: TurnoverCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const frontId = `${uid}-front`;
  const backId = `${uid}-back`;

  const [own, setOwn] = React.useState(defaultFlipped);
  const isFlipped = flipped ?? own;
  const d = clamp(depth, 0, 1);

  const angle = useMotionValue(isFlipped ? 180 : 0);
  const fade = useMotionValue(isFlipped ? 1 : 0);
  const tiltA = useMotionValue(0);
  const tiltB = useMotionValue(0);
  const press = useMotionValue(1);

  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const fading = React.useRef<AnimationPlaybackControls | null>(null);
  const others = React.useRef<AnimationPlaybackControls[]>([]);
  const startAngle = React.useRef(0);
  /** Where the card is heading: keys flip from there, not from mid-turn. */
  const heading = React.useRef(isFlipped ? 180 : 0);
  /** Bumped by every new settle: a stopped spring's late finish is ignored. */
  const settles = React.useRef(0);
  const dragging = React.useRef(false);
  const shown = React.useRef(isFlipped);

  const turn = useTransform([angle, tiltA] as MotionValue<number>[], ([a, t]) =>
    r2((a as number) + (t as number)),
  );
  const lift = useTransform([angle, press] as MotionValue<number>[], ([a, p]) =>
    r3((1 + Math.abs(Math.sin(rad(a as number))) * d * 0.04) * (p as number)),
  );
  const shadowOpacity = useTransform(angle, (a) =>
    r3(0.16 + Math.abs(Math.sin(rad(a))) * d * 0.18),
  );
  const shadowScale = useTransform(angle, (a) =>
    r3(1 - Math.abs(Math.sin(rad(a))) * 0.18 + d * 0.04),
  );
  const shadowBlur = useTransform(
    angle,
    (a) => `blur(${r2(10 + Math.abs(Math.sin(rad(a))) * d * 10)}px)`,
  );

  const settleTo = React.useCallback(
    (target: number, velocity: number) => {
      running.current?.stop();
      heading.current = target;
      const mine = ++settles.current;
      if (!motionSafe) {
        angle.jump(parity(target) ? 180 : 0);
        fading.current?.stop();
        fading.current = animate(fade, parity(target) ? 1 : 0, {
          duration: durations.base,
          ease: easings.move,
        });
        return;
      }
      const w = clamp(wobble, 0, 1);
      running.current = animate(angle, target, {
        ...spring(clamp(stiffness, 60, 2000), lerp(0.9, 0.55, w)),
        velocity,
        restDelta: 0.05,
        onComplete: () => {
          if (settles.current !== mine) return;
          // Keep the angle small, so a long session never drifts far.
          const rest = parity(angle.get()) ? 180 : 0;
          heading.current = rest;
          angle.jump(rest);
        },
      });
    },
    [angle, fade, motionSafe, stiffness, wobble],
  );

  const commit = (target: number, velocity: number) => {
    const next = parity(target);
    if (next !== isFlipped) {
      const node = cardRef.current;
      const box = node?.getBoundingClientRect();
      audio.play("swish", {
        pitch: r2(clamp(0.85 + Math.abs(velocity) / 2400, 0.85, 1.5)),
        gain: 0.5,
        pan: box ? panFrom(box.left + box.width / 2, null) : 0,
      });
    }
    if (next === isFlipped || flipped === undefined) {
      if (next !== isFlipped) {
        setOwn(next);
        shown.current = next;
      }
      settleTo(target, velocity);
    } else {
      // Controlled: go back to what the host says until it answers.
      const back = Math.round(angle.get() / 180) * 180;
      settleTo(parity(back) === isFlipped ? back : back + 180, velocity);
    }
    if (next !== isFlipped) onFlippedChange?.(next);
  };

  const flipBy = (dir: 1 | -1) => {
    if (disabled) return;
    commit(heading.current + dir * 180, 0);
  };

  // A host that changes `flipped` turns the card the short way round.
  React.useEffect(() => {
    if (shown.current === isFlipped) return;
    shown.current = isFlipped;
    if (dragging.current) return;
    const base = Math.round(angle.get() / 180) * 180;
    settleTo(parity(base) === isFlipped ? base : base + 180, 0);
  }, [isFlipped, angle, settleTo]);

  // Reduced motion switched: the card takes the plain pose of its side.
  React.useEffect(() => {
    running.current?.stop();
    fading.current?.stop();
    angle.jump(shown.current ? 180 : 0);
    fade.jump(shown.current ? 1 : 0);
    tiltA.jump(0);
    tiltB.jump(0);
  }, [motionSafe, axis, angle, fade, tiltA, tiltB]);

  React.useEffect(
    () => () => {
      running.current?.stop();
      fading.current?.stop();
      for (const a of others.current) a.stop();
    },
    [],
  );

  const span = () => {
    const box = cardRef.current?.getBoundingClientRect();
    return Math.max(
      80,
      axis === "y" ? (box?.width ?? 240) : (box?.height ?? 150),
    );
  };

  const drag = useDrag({
    axis: axis === "y" ? "x" : "y",
    threshold: 4,
    disabled,
    onStart: () => {
      dragging.current = true;
      running.current?.stop();
      startAngle.current = angle.get();
      others.current.push(animate(tiltA, 0, springs.glide));
      others.current.push(animate(tiltB, 0, springs.glide));
    },
    onMove: ({ offset }) => {
      const travel = axis === "y" ? offset.x : -offset.y;
      // Reduced motion: the drag is read, not drawn; the release decides.
      if (!motionSafe) return;
      angle.set(r2(startAngle.current + (travel / span()) * 180));
    },
    onEnd: ({ offset, velocity }) => {
      dragging.current = false;
      const v = ((axis === "y" ? velocity.x : -velocity.y) / span()) * 180;
      const travel = axis === "y" ? offset.x : -offset.y;
      const from = startAngle.current;
      const now = motionSafe ? angle.get() : from + (travel / span()) * 180;
      const landing = motionSafe ? project(now, v, 0.993) : now;
      const t = clamp(threshold, 0.05, 0.95);
      const turns = (landing - from) / 180;
      // Past the threshold of a half turn commits it; a hard throw may turn
      // it all the way round, never further.
      const whole =
        Math.sign(turns) * Math.min(2, Math.floor(Math.abs(turns) + (1 - t)));
      commit(from + whole * 180, motionSafe ? v : 0);
    },
    onCancel: () => {
      dragging.current = false;
      settleTo(startAngle.current, 0);
    },
    onTap: () => flipBy(1),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const k = event.key;
    if (k === "Enter") {
      event.preventDefault();
      if (!event.repeat) flipBy(1);
    } else if (k === " ") {
      // Space acts on release, as a native button does; stop the scroll.
      event.preventDefault();
    } else if (
      (axis === "y" && (k === "ArrowRight" || k === "ArrowLeft")) ||
      (axis === "x" && (k === "ArrowUp" || k === "ArrowDown"))
    ) {
      event.preventDefault();
      flipBy(k === "ArrowRight" || k === "ArrowUp" ? 1 : -1);
    }
  };
  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === " " && !disabled) {
      event.preventDefault();
      flipBy(1);
    }
  };

  const onHover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!tilt || !motionSafe || dragging.current) return;
    if (event.pointerType !== "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width - 0.5;
    const py = (event.clientY - box.top) / box.height - 0.5;
    for (const a of others.current) a.stop();
    const along = axis === "y" ? px : -py;
    const across = axis === "y" ? -py : px;
    others.current = [
      animate(tiltA, r2(along * 8), springs.glide),
      animate(tiltB, r2(across * 8), springs.glide),
    ];
  };
  const onLeave = () => {
    for (const a of others.current) a.stop();
    others.current = [
      animate(tiltA, 0, springs.glide),
      animate(tiltB, 0, springs.glide),
    ];
  };

  const perspective = Math.round(lerp(2400, 900, d));
  const maxWidth = MAX[size] ?? MAX.md;
  const rot = motionSafe
    ? axis === "y"
      ? { rotateY: turn, rotateX: tiltB }
      : { rotateX: turn, rotateY: tiltB }
    : {};

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ maxWidth, aspectRatio: "1 / 0.677" }}
    >
      <div
        className="absolute"
        style={{
          left: `${r2(((1 - CARD) / 2) * 100)}%`,
          right: `${r2(((1 - CARD) / 2) * 100)}%`,
          top: "50%",
          aspectRatio: "8 / 5",
          transform: "translateY(-50%)",
          perspective,
        }}
      >
        {/* The shadow on the surface under the card. */}
        <motion.div
          aria-hidden
          className="absolute inset-x-[8%] -bottom-1 h-1/3 rounded-full bg-[color-mix(in_oklab,black_80%,transparent)]"
          style={{
            opacity: motionSafe ? shadowOpacity : 0.16,
            scaleX: motionSafe ? shadowScale : 1,
            filter: motionSafe ? shadowBlur : "blur(10px)",
          }}
        />
        <motion.div
          ref={cardRef}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-pressed={isFlipped}
          aria-label={label}
          aria-describedby={isFlipped ? backId : frontId}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onPointerLeave={onLeave}
          {...drag}
          onPointerMove={(event) => {
            drag.onPointerMove(event);
            onHover(event);
          }}
          onPointerDown={(event) => {
            drag.onPointerDown(event);
            if (disabled || !motionSafe) return;
            others.current.push(animate(press, 0.98, springs.flick));
          }}
          onPointerUp={(event) => {
            drag.onPointerUp(event);
            others.current.push(animate(press, 1, springs.flick));
          }}
          onPointerCancel={(event) => {
            drag.onPointerCancel(event);
            others.current.push(animate(press, 1, springs.flick));
          }}
          className={cn(
            "absolute inset-0 outline-none select-none transform-3d",
            "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
            axis === "y" ? "touch-pan-y" : "touch-pan-x",
            disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-grab active:cursor-grabbing",
          )}
          style={{
            borderRadius: radius,
            scale: motionSafe ? lift : 1,
            ...rot,
          }}
        >
          <Face
            side="front"
            axis={axis}
            angle={angle}
            fade={fade}
            shading={shading}
            radius={radius}
            hidden={isFlipped}
            motionSafe={motionSafe}
            id={frontId}
          >
            {front}
          </Face>
          <Face
            side="back"
            axis={axis}
            angle={angle}
            fade={fade}
            shading={shading}
            radius={radius}
            hidden={!isFlipped}
            motionSafe={motionSafe}
            id={backId}
          >
            {back}
          </Face>
        </motion.div>
      </div>
    </div>
  );
}
