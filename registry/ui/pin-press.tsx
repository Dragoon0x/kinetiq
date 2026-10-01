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
import { ArrowUpToLine } from "lucide-react";

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

export type PinPressSize = "sm" | "md" | "lg";

export type PinPressProps = {
  /** Controlled: whether the item is pinned. */
  pressed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultPressed?: boolean;
  /** Fires from the press that pinned or unpinned, with the new state. */
  onPressedChange?: (pressed: boolean) => void;
  /** The word before pinning. @default "Pin" */
  label?: string;
  /** The word once pinned. @default "Pinned" */
  pressedLabel?: string;
  /** Show the small tag that slides out under the pinned word. @default true */
  tag?: boolean;
  /** The tag's words: where a pinned item goes. @default "to top" */
  tagLabel?: string;
  /** The toggle's accessible name, the same in both states. @default the `label` */
  name?: string;
  /** How deep the pin goes in, 0 to 1: the needle hides, the head shrinks away and the shadow tightens. @default 0.6 */
  depth?: number;
  /** How loose the needle is as it comes out, 0 to 1: straight out, or a floppy wobble about its tip. @default 0.5 */
  wobble?: number;
  /** How far a press pushes the pin before it is let go, 0 to 1 of the way home. @default 0.5 */
  anticipation?: number;
  /** How long the dimple ring takes to spread across the cork, in ms. @default 520 */
  ringDuration?: number;
  /** Icon only: the pin and its cork, the words in its accessible name. @default false */
  compact?: boolean;
  /** @default "md" */
  size?: PinPressSize;
  /** The pin's head, any CSS colour; a fixed lightness reads the same in both themes. @default "oklch(from var(--danger) 0.64 0.19 h)" */
  pinColor?: string;
  /** The cork. @default "oklch(from var(--warn) 0.76 0.07 h)" */
  corkColor?: string;
  /** Play the pin going home and coming out. Off unless asked for. @default false */
  sound?: boolean;
  /** Not pressable, and drawn at half strength. @default false */
  disabled?: boolean;
  /** Classes for the button. */
  className?: string;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/*
 * The drawing, in a 32-unit box: a cork slab seen at three-quarters, its top
 * an ellipse centred on E, where the pin goes in. The pin is drawn in its own
 * frame with the needle's tip at the origin and the head up the -y axis, so
 * one translate, one rotation about the tip and one scale place it.
 */
const E = [16, 24.6] as const;
const CORK_RX = 12.5;
const CORK_RY = 4.4;
/** The slab's front edge, two units deep under the top ellipse. */
const CORK_SIDE = (() => {
  const left = r2(E[0] - CORK_RX);
  const right = r2(E[0] + CORK_RX);
  const top = r2(E[1]);
  const bottom = r2(E[1] + 2);
  const arc = `${CORK_RX} ${CORK_RY} 0 0`;
  return `M${left} ${top}V${bottom}A${arc} 0 ${right} ${bottom}V${top}A${arc} 1 ${left} ${top}Z`;
})();
/** How far the tip hovers above the cork when the pin is out. */
const LIFT = 4.5;
/** The pin leans away from the light; its shadow falls to the right. */
const LEAN = -10;
/** A pin that does not move still leaves a hole in the cork for a while. */
const HOLE_FADE = 0.6;

/** Cork speckles, seeded once: the same board on the server and in the browser. */
const SPECKS: readonly (readonly [number, number, number])[] = (() => {
  let seed = 7;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: [number, number, number][] = [];
  while (out.length < 9) {
    const x = 4.5 + next() * 23;
    const y = 21.4 + next() * 6.4;
    const inside = ((x - E[0]) / 12) ** 2 + ((y - E[1]) / 4.2) ** 2 < 0.8;
    const clear = Math.hypot(x - E[0], (y - E[1]) * 2.6) > 4;
    if (inside && clear) out.push([r2(x), r2(y), r2(0.35 + next() * 0.3)]);
  }
  return out;
})();

const shade = (c: string, p: number) =>
  `color-mix(in oklab, ${c} ${p}%, black)`;
const light = (c: string, p: number) =>
  `color-mix(in oklab, ${c} ${p}%, white)`;

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/** The pull: the pin comes up with weight, not with a snap. */
const PULL = spring(260, 0.9);

type SizeSpec = {
  box: string;
  square: string;
  icon: number;
  words: string;
  lift: number;
  tag: string;
  tagTop: number;
};

const SIZES: Record<PinPressSize, SizeSpec> = {
  sm: {
    box: "h-9 gap-1.5 pr-3.5 pl-1.5",
    square: "size-9",
    icon: 26,
    words: "text-xs leading-4",
    lift: 5,
    tag: "text-[9px] leading-3",
    tagTop: 4,
  },
  md: {
    box: "h-10 gap-2 pr-4 pl-2",
    square: "size-10",
    icon: 30,
    words: "text-sm leading-5",
    lift: 6,
    tag: "text-[9px] leading-3",
    tagTop: 5,
  },
  lg: {
    box: "h-12 gap-2.5 pr-5 pl-2.5",
    square: "size-12",
    icon: 36,
    words: "text-[15px] leading-6",
    lift: 7,
    tag: "text-[10px] leading-3.5",
    tagTop: 6,
  },
};

type Api = {
  play: (to: boolean) => void;
  onDepth: (v: number) => void;
  settle: () => void;
};

/**
 * A pin toggle: a push-pin over a small cork patch, seen at three-quarters.
 * Pressing pushes the pin part of the way in on the flick spring — the
 * needle pricks the cork — and letting go drives it home with the press's
 * speed: the head shrinks away from the eye, its shadow tightens under it,
 * the head takes the hit on the recoil spring, a dimple ring spreads across
 * the cork and the needle is gone into it, while a "to top" tag slides out
 * from under the label. Unpinning pulls the pin up with weight while the
 * needle wobbles about its tip on an underdamped spring, and the shadow grows
 * back as it rises.
 *
 * It is a real toggle: a button with `aria-pressed` and a constant name.
 * Space pushes on the way down and commits on the way up, as a press does;
 * Enter commits at once; Escape or blur mid-press lets the pin back out
 * without committing. Under reduced motion the pin swaps poses, the ring
 * fades in place and the words cross-fade — the pinned state always shows.
 */
export function PinPress({
  pressed,
  defaultPressed = false,
  onPressedChange,
  label = "Pin",
  pressedLabel = "Pinned",
  tag = true,
  tagLabel = "to top",
  name,
  depth = 0.6,
  wobble = 0.5,
  anticipation = 0.5,
  ringDuration = 520,
  compact = false,
  size = "md",
  pinColor = "oklch(from var(--danger) 0.64 0.19 h)",
  corkColor = "oklch(from var(--warn) 0.76 0.07 h)",
  sound = false,
  disabled = false,
  className,
}: PinPressProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const corkClip = `pp-cork-${uid}`;
  const aboveClip = `pp-above-${uid}`;
  const descId = `pp-desc-${uid}`;
  const g = SIZES[size] ?? SIZES.md;
  const dp = clamp01(depth);
  const wb = clamp01(wobble);
  const sink = 3 + 4 * dp;
  /** Where along the way home the tip meets the cork. */
  const touch = LIFT / (LIFT + sink);

  const [own, setOwn] = React.useState(defaultPressed);
  const isPressed = pressed ?? own;
  const [hovering, setHovering] = React.useState(false);
  const [holding, setHolding] = React.useState(false);
  const showTag = tag && isPressed && !compact;

  const d = useMotionValue(isPressed ? 1 : 0);
  const tilt = useMotionValue(0);
  const squash = useMotionValue(0);
  const ringSize = useMotionValue(0);
  const ringFade = useMotionValue(0);
  const hole = useMotionValue(0);
  const raise = useMotionValue(showTag ? -g.lift : 0);
  const tagY = useMotionValue(0);
  const tagO = useMotionValue(showTag ? 1 : 0);
  const wordY = [useMotionValue(0), useMotionValue(0)];
  const wordO = [
    useMotionValue(isPressed ? 0 : 1),
    useMotionValue(isPressed ? 1 : 0),
  ];

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const live = React.useRef({
    shown: isPressed,
    tagShown: showTag,
    lift: g.lift,
    lastD: isPressed ? 1 : 0,
    /** Set by the visitor's own press: the landing or the pull may be heard. */
    voice: 0,
    /** Escape during a held Space: the click that follows is not a press. */
    cancelled: false,
    /** A pin or an unpin is travelling; the hand's rest poses wait for it. */
    committing: false,
    /** Where the hand wants the pin while nothing is committing. */
    rest: null as number | null,
    running: new Map<string, AnimationPlaybackControls>(),
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    const map = live.current.running;
    map.get(key)?.stop();
    map.set(key, controls);
  };

  const pan = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };
  const heard = () => performance.now() < live.current.voice;

  /** The pin landing home: the head takes the hit, the cork dimples. */
  const impact = () => {
    if (heard()) {
      audio.play("thock", {
        pitch: r2(lerp(1.15, 0.8, dp)),
        gain: 0.6,
        pan: pan(),
      });
    }
    if (!motionSafe) {
      ringSize.jump(0.75);
      ringFade.jump(0.7);
      run("ringFade", animate(ringFade, 0, { duration: durations.slow }));
      return;
    }
    run(
      "squash",
      animate(squash, 0, { ...springs.recoil, velocity: 7 + 5 * dp }),
    );
    const ring = Math.max(0.1, ringDuration / 1000);
    ringSize.jump(0);
    ringFade.jump(0.9);
    run(
      "ringSize",
      animate(ringSize, 1, { duration: ring, ease: easings.enter }),
    );
    run(
      "ringFade",
      animate(ringFade, 0, { duration: ring, ease: easings.enter }),
    );
  };

  const play = (to: boolean) => {
    const s = live.current;
    if (!motionSafe) {
      s.running.get("d")?.stop();
      s.running.get("tilt")?.stop();
      d.jump(to ? 1 : 0);
      tilt.jump(0);
      if (to) impact();
      else if (heard()) {
        audio.play("pop", {
          pitch: r2(lerp(0.9, 1.3, wb)),
          gain: 0.5,
          pan: pan(),
        });
      }
      hole.jump(to ? 0 : 0.8);
      if (!to)
        run("hole", animate(hole, 0, { duration: HOLE_FADE, delay: 0.3 }));
      return;
    }
    s.committing = true;
    const done = () => {
      s.committing = false;
      api.current?.settle();
    };
    if (to) {
      // A press that already pushed it all the way in lands now.
      if (d.get() >= 0.97) impact();
      // Driven home with whatever speed the press already gave it.
      run(
        "d",
        animate(d, 1, {
          ...springs.flick,
          velocity: d.getVelocity(),
          onComplete: done,
        }),
      );
      return;
    }
    run(
      "d",
      animate(d, 0, { ...PULL, velocity: d.getVelocity(), onComplete: done }),
    );
    // The needle is loose in the hole: a kick about its tip, damped by how
    // stiff the pin is meant to be.
    run(
      "tilt",
      animate(tilt, 0, {
        ...spring(260, lerp(0.9, 0.22, wb)),
        velocity: -lerp(60, 330, wb),
      }),
    );
    hole.jump(0.8);
    run("hole", animate(hole, 0, { duration: HOLE_FADE, delay: 0.3 }));
  };

  const onDepth = (v: number) => {
    const s = live.current;
    const was = s.lastD;
    s.lastD = v;
    if (!motionSafe || !s.committing) return;
    if (s.shown && was < 0.97 && v >= 0.97) impact();
    if (!s.shown && was >= touch && v < touch && heard()) {
      audio.play("pop", {
        pitch: r2(lerp(0.9, 1.3, wb)),
        gain: 0.5,
        pan: pan(),
      });
    }
  };

  /** The pin goes where the hand wants it, or back to its state. */
  const settle = () => {
    const s = live.current;
    if (s.committing) return;
    if (!motionSafe) {
      d.jump(s.shown ? 1 : 0);
      return;
    }
    const target = s.rest ?? (s.shown ? 1 : 0);
    s.running.get("d")?.stop();
    s.running.set(
      "d",
      animate(
        d,
        target,
        s.rest !== null && s.rest > 0.2 ? springs.flick : springs.snap,
      ),
    );
  };

  React.useEffect(() => {
    api.current = { play, onDepth, settle };
  });

  // A press reports first; the pin moves once the state actually changes,
  // so a controlled host that refuses never shows a false landing.
  React.useEffect(() => {
    const s = live.current;
    if (s.shown === isPressed) return;
    s.shown = isPressed;
    api.current?.play(isPressed);
  }, [isPressed]);

  React.useEffect(() => d.on("change", (v) => api.current?.onDepth(v)), [d]);

  // At rest the pin answers the hand: a hover lifts it a hair, a press
  // pushes it part of the way in (or grips a pinned one).
  const rest = holding
    ? isPressed
      ? 0.9
      : clamp01(anticipation)
    : hovering && !isPressed && !disabled
      ? -0.08
      : null;
  React.useEffect(() => {
    const s = live.current;
    if (s.rest === rest) return;
    s.rest = rest;
    api.current?.settle();
  }, [rest]);

  // Let go without a press (left, cancelled, Escape): back to where it was.
  const release = () => setHolding(false);

  // The words, the lift and the tag.
  React.useLayoutEffect(() => {
    const s = live.current;
    const was = s.tagShown;
    s.tagShown = showTag;
    const to = isPressed ? 1 : 0;
    const from = 1 - to;
    const inY = wordY[to];
    const inO = wordO[to];
    const outY = wordY[from];
    const outO = wordO[from];
    if (!inY || !inO || !outY || !outO) return;
    if (inO.get() < 0.99 || outO.get() > 0.01) {
      const dir = to === 1 ? 1 : -1;
      // On pinning the words wait for the landing; on unpinning they go first.
      const delay = to === 1 ? 0.06 : 0;
      run(`o${from}`, animate(outO, 0, { ...exitFor(durations.fast), delay }));
      run(
        `o${to}`,
        animate(inO, 1, {
          duration: durations.fast,
          ease: easings.enter,
          delay: delay + 0.03,
        }),
      );
      if (motionSafe) {
        run(
          `y${from}`,
          animate(outY, -dir * distances.shift, {
            ...exitFor(durations.fast),
            delay,
          }),
        );
        inY.jump(dir * distances.shift);
        run(
          `y${to}`,
          animate(inY, 0, { ...springs.snap, delay: delay + 0.03 }),
        );
      } else {
        outY.jump(0);
        inY.jump(0);
      }
    }
    if (was === showTag) return;
    if (!motionSafe) {
      raise.jump(showTag ? -g.lift : 0);
      tagY.jump(0);
      run("tagO", animate(tagO, showTag ? 1 : 0, { duration: durations.fast }));
      return;
    }
    if (showTag) {
      // The tag slides out from under the word as the word makes room.
      tagY.jump(-distances.step);
      run("raise", animate(raise, -g.lift, { ...springs.snap, delay: 0.06 }));
      run("tagY", animate(tagY, 0, { ...springs.snap, delay: 0.1 }));
      run(
        "tagO",
        animate(tagO, 1, {
          duration: durations.fast,
          ease: easings.enter,
          delay: 0.1,
        }),
      );
    } else {
      run("tagY", animate(tagY, -distances.step, exitFor(durations.fast)));
      run("tagO", animate(tagO, 0, exitFor(durations.fast)));
      run("raise", animate(raise, 0, { ...springs.snap, delay: 0.05 }));
    }
    // Runs on a change of state only; the word values never change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPressed, showTag]);

  // A size change moves the tag's resting lift with it.
  React.useEffect(() => {
    live.current.lift = g.lift;
    raise.jump(live.current.tagShown ? -g.lift : 0);
  }, [g.lift, raise]);

  // Finish, never freeze: whatever is interrupted lands on its state.
  React.useEffect(() => {
    const s = live.current;
    return () => {
      for (const c of s.running.values()) c.stop();
      s.running.clear();
      s.committing = false;
      d.jump(s.shown ? 1 : 0);
      tilt.jump(0);
      squash.jump(0);
      ringFade.jump(0);
      hole.jump(0);
      tagY.jump(0);
      tagO.jump(s.tagShown ? 1 : 0);
      raise.jump(s.tagShown ? -s.lift : 0);
    };
    // Teardown only: the motion values are stable and it reads the latest
    // state from `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    const s = live.current;
    if (s.cancelled) {
      s.cancelled = false;
      return;
    }
    if (disabled) return;
    setHolding(false);
    const next = !isPressed;
    s.voice = performance.now() + 1200;
    if (pressed === undefined) setOwn(next);
    onPressedChange?.(next);
  };

  const pinY = useTransform(d, (v) => r2(E[1] - LIFT + (LIFT + sink) * v));
  const pinScale = useTransform(d, (v) => r3(1 - 0.12 * dp * clamp01(v)));
  const pinRotate = useTransform(tilt, (t) => r2(LEAN + t));
  const headX = useTransform(squash, (q) => r3(1 + 0.1 * q));
  const headY = useTransform(squash, (q) => r3(1 - 0.18 * q));
  const near = (v: number) => Math.min(1, Math.max(-0.2, v));
  const shadowX = useTransform(d, (v) => r2(E[0] + lerp(6.5, 1.8, near(v))));
  const shadowRx = useTransform(d, (v) => r2(lerp(5.5, 3.4, near(v))));
  const shadowRy = useTransform(shadowRx, (rx) => r2(rx * 0.36));
  const shadowO = useTransform(d, (v) => r3(lerp(0.14, 0.34, clamp01(v))));
  const crater = useTransform(d, (v) =>
    r3(0.4 * clamp01((v - touch) / Math.max(0.01, 1 - touch))),
  );
  const ringRx = useTransform(ringSize, (r) => r2(lerp(1.2, 7 + 3 * dp, r)));
  const ringRy = useTransform(ringRx, (rx) => r2(rx * 0.35));
  const holeO = useTransform(
    [hole, d] as MotionValue<number>[],
    ([h = 0, v = 0]: number[]) =>
      r3(h * (1 - clamp01(v / Math.max(0.01, touch)))),
  );

  const corkSide = shade(corkColor, 70);
  const corkDark = shade(corkColor, 58);
  const description =
    isPressed && tag ? `${pressedLabel} ${tagLabel}` : undefined;

  return (
    <motion.button
      ref={buttonRef}
      type="button"
      aria-pressed={isPressed}
      aria-label={name ?? label}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={commit}
      onPointerDown={(event) => {
        if (disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        live.current.cancelled = false;
        setHolding(true);
      }}
      onPointerCancel={release}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovering(true);
      }}
      onPointerLeave={() => {
        setHovering(false);
        if (holding) release();
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === " " && !event.repeat) {
          live.current.cancelled = false;
          setHolding(true);
        }
        if (event.key === "Enter") live.current.cancelled = false;
        if (event.key === "Escape" && holding) {
          // Handled here, where focus is: the press is called off.
          event.preventDefault();
          live.current.cancelled = true;
          release();
        }
      }}
      onKeyUp={(event) => {
        // A Space called off by Escape may still click on its way up; the
        // flag swallows that one click and no other.
        if (event.key === " " && live.current.cancelled) {
          window.setTimeout(() => {
            live.current.cancelled = false;
          }, 0);
        }
      }}
      onBlur={() => {
        if (holding) release();
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "group/pin-press relative inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-full border outline-none select-none [-webkit-touch-callout:none]",
        "transition-[border-color] duration-150",
        isPressed
          ? "border-cobalt-bright/45"
          : "border-hairline-strong hover:border-ink-3/50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        "disabled:cursor-not-allowed disabled:opacity-50",
        compact ? g.square : g.box,
        className,
      )}
      style={{ background: "var(--bg-2)" }}
    >
      <svg
        aria-hidden
        width={g.icon}
        height={g.icon}
        viewBox="0 0 32 32"
        className="block shrink-0"
      >
        <defs>
          <clipPath id={corkClip}>
            <ellipse cx={E[0]} cy={E[1]} rx={CORK_RX} ry={CORK_RY} />
          </clipPath>
          <clipPath id={aboveClip}>
            <rect x={0} y={-20} width={32} height={E[1] + 20} />
          </clipPath>
        </defs>

        <path d={CORK_SIDE} style={{ fill: corkSide }} />
        <ellipse
          cx={E[0]}
          cy={E[1]}
          rx={CORK_RX}
          ry={CORK_RY}
          style={{ fill: corkColor }}
        />
        {SPECKS.map(([x, y, r]) => (
          <ellipse
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            rx={r}
            ry={r2(r * 0.6)}
            style={{ fill: corkDark }}
          />
        ))}
        <g clipPath={`url(#${corkClip})`}>
          <motion.ellipse
            cx={shadowX}
            cy={r2(E[1] + 0.8)}
            rx={shadowRx}
            ry={shadowRy}
            fill="black"
            style={{ opacity: shadowO }}
          />
          <motion.ellipse
            cx={E[0]}
            cy={E[1]}
            rx={ringRx}
            ry={ringRy}
            fill="none"
            strokeWidth={0.9}
            style={{ stroke: shade(corkColor, 45), opacity: ringFade }}
          />
        </g>
        <motion.ellipse
          cx={E[0]}
          cy={E[1]}
          rx={2.2}
          ry={0.8}
          style={{ fill: corkDark, opacity: crater }}
        />
        <motion.ellipse
          cx={E[0]}
          cy={E[1]}
          rx={0.8}
          ry={0.35}
          style={{ fill: shade(corkColor, 35), opacity: holeO }}
        />

        {/* The needle, cut off at the cork's surface: below it, it is in the board. */}
        <g clipPath={`url(#${aboveClip})`}>
          <motion.g
            style={{
              x: E[0],
              y: pinY,
              rotate: pinRotate,
              scale: pinScale,
              originX: 0.5,
              originY: 1,
            }}
          >
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-7.5}
              strokeWidth={1.1}
              strokeLinecap="round"
              style={{ stroke: "var(--ink-2)" }}
            />
          </motion.g>
        </g>
        <motion.g
          style={{
            x: E[0],
            y: pinY,
            rotate: pinRotate,
            scale: pinScale,
            originX: 0.5,
            originY: 1,
          }}
        >
          {/* Unpainted: it reaches the box down to the tip, so the pin turns
              and shrinks about the point that is in the cork. */}
          <line x1={0} y1={0} x2={0} y2={-0.01} stroke="none" />
          <motion.g
            style={{ scaleX: headX, scaleY: headY, originX: 0.5, originY: 1 }}
          >
            <ellipse
              cx={0}
              cy={-7.5}
              rx={3.6}
              ry={1.3}
              style={{ fill: shade(pinColor, 68) }}
            />
            <path
              d="M-1.9 -7.9C-1.4 -9.5 -1.4 -11 -2.2 -12.6H2.2C1.4 -11 1.4 -9.5 1.9 -7.9Z"
              style={{ fill: shade(pinColor, 82) }}
            />
            <path
              d="M-5 -15V-13.4A5 1.9 0 0 0 5 -13.4V-15Z"
              style={{ fill: pinColor }}
            />
            <ellipse
              cx={0}
              cy={-15}
              rx={5}
              ry={1.9}
              style={{ fill: light(pinColor, 78) }}
            />
            <ellipse
              cx={-1.9}
              cy={-15.4}
              rx={1.6}
              ry={0.55}
              fill="white"
              opacity={0.55}
            />
          </motion.g>
        </motion.g>
      </svg>

      {compact ? null : (
        <span aria-hidden className="relative grid items-center self-stretch">
          <span
            className={cn(
              "invisible col-start-1 row-start-1 h-0 overflow-hidden px-1 font-mono tracking-[0.06em] uppercase",
              g.tag,
            )}
          >
            <span className="inline-flex items-center gap-0.5">
              <span className="size-2.5" />
              {tagLabel}
            </span>
          </span>
          <motion.span
            className={cn(
              "col-start-1 row-start-1 grid overflow-clip text-left font-medium",
              g.words,
            )}
            style={{ y: raise }}
          >
            {[label, pressedLabel].map((word, i) => (
              <motion.span
                key={i}
                className="col-start-1 row-start-1 whitespace-nowrap text-foreground"
                style={{ y: wordY[i], opacity: wordO[i] }}
              >
                {word}
              </motion.span>
            ))}
          </motion.span>
          {tag ? (
            <motion.span
              className={cn(
                "absolute top-1/2 left-0 inline-flex items-center gap-0.5 rounded-1 px-1 font-mono tracking-[0.06em] whitespace-nowrap uppercase",
                g.tag,
              )}
              style={{
                marginTop: g.tagTop,
                y: tagY,
                opacity: tagO,
                color: "var(--accent-bright)",
                background:
                  "color-mix(in oklab, var(--accent-bright) 14%, transparent)",
              }}
            >
              <ArrowUpToLine
                aria-hidden
                className="size-2.5 shrink-0"
                strokeWidth={2.5}
              />
              {tagLabel}
            </motion.span>
          ) : null}
        </span>
      )}

      {description ? (
        <span id={descId} className="sr-only">
          {description}
        </span>
      ) : null}
    </motion.button>
  );
}
