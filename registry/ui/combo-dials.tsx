"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  angleDelta,
  clamp,
  mapRange,
  perspectives,
  snapAngle,
  wrapAngle,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Angular pitch of one digit face — ten faces close the cylinder. */
const FACE_STEP = 36;
/** Digit face width, px; faces tile the rim edge to edge at 36°. */
const FACE_W = 34;
/** Cylinder radius from the tiling identity: FACE_W = 2·r·tan(FACE_STEP/2). */
const RADIUS = FACE_W / (2 * Math.tan((FACE_STEP * Math.PI) / 360));
/** Band frame width, px — the readable arc plus shaded shoulders. */
const BAND_W = 128;
/** Band frame height, px. */
const BAND_H = 40;
/** Drag ratio in degrees per pixel — keeps the band under the finger. */
const SENSITIVITY = 0.4;
/** Release momentum is projected this many seconds past the finger. */
const MOMENTUM_WINDOW = 0.25;
/** A fling carries at most this many digits past the release point. */
const MAX_CARRY = 3;
/** Faces are fully transparent by this angular distance, deg. */
const FADE_END = 76;
/** Angular horizon: faces beyond this stop painting entirely. */
const CULL = 84;
/** Resting opacity of the housing's side pins between clicks. */
const PIN_REST = 0.3;
/** The ten faces engraved around every dial. */
const FACES = Array.from({ length: 10 }, (_, digit) => digit);
/** Lathe recess: each band reads sunk into the housing plate, not raised. */
const BAND_SHADOW =
  "shadow-[inset_0_1px_3px_oklch(0.05_0.02_258_/_0.3),inset_0_-1px_2px_oklch(0.05_0.02_258_/_0.18)]";

const mod10 = (n: number): number => ((n % 10) + 10) % 10;

/** The digit a detent angle fronts — detents live on multiples of 36°. */
const digitOfDetent = (deg: number): number =>
  mod10(Math.round(wrapAngle(deg) / FACE_STEP));

/** Digits-only parse, zero-filled to `count` — the boot combination. */
const parseDigits = (raw: string | undefined, count: number): number[] => {
  const clean = (raw ?? "").replace(/\D/g, "");
  return Array.from({ length: count }, (_, i) => {
    const ch = clean[i];
    return ch === undefined ? 0 : ch.charCodeAt(0) - 48;
  });
};

type DragState = {
  pointerId: number;
  /** Last pointer x, for per-move deltas. */
  lastX: number;
  /** Last move timestamp (ms), for angular velocity. */
  lastT: number;
  /** Smoothed velocity in deg/s; positive sweeps toward higher digits. */
  velocity: number;
  /** Continuous dial angle under the finger — the drag's source of truth. */
  raw: number;
};

export type ComboDialsProps = {
  /** Dial count, clamped 2–5. @default 3 */
  length?: number;
  /** Controlled digits, e.g. "047"; dials glide there on change. */
  value?: string;
  /** Boot digits when uncontrolled. @default all zeros */
  defaultValue?: string;
  /** Fires per settled digit with the whole composed string. */
  onValueChange?: (value: string) => void;
  /** When set, matching all settled digits springs the latch open. */
  secret?: string;
  /** Fires once per match; re-arms whenever any dial leaves the secret. */
  onUnlock?: () => void;
  className?: string;
  /** Accessible name for the dial group. @default "Combination dials" */
  "aria-label"?: string;
};

/**
 * Stacked rotary dials compose a value with momentum and detents — a
 * combination lock. Each dial is a lathe-turned cylinder seen face-on: ten
 * digit faces tile the rim at 36° and render `rotateY(a) translateZ(r)`
 * inside a preserve-3d stage recessed by `−r`, so the fronted digit lies flat
 * in the reading window while its neighbors curve away over the shoulders
 * (the drum-row projection turned 90°). One rotation motion value per dial is
 * the single source of truth; faces fade with angular distance and stop
 * painting past the horizon, and the band wraps endlessly — 9 rolls into 0.
 *
 * Drag a band horizontally (pointer-captured, 0.4°/px) and the digits sweep
 * under the window; release projects momentum ~250ms ahead (capped at ±3
 * digits) and snaps the nearest detent on `snap`, seeded with the release
 * velocity. Every detent land is a click: the housing's side pins blink once
 * at `durations.blink` and the fronted digit pulses 1.08 → 1 on `flick`.
 *
 * Semantics: each dial is a `role="spinbutton"` ("Dial N", 0–9, live value)
 * in natural tab order. ArrowUp/Right steps +1 and ArrowDown/Left −1 on
 * `snap` (wrapping 9 → 0), Home and End seat 0 and 9, and typing a digit key
 * glides straight to it by the shortest path. A polite region announces each
 * settle ("Dial 2: 4"); `onValueChange` fires per settled digit with the
 * whole string.
 *
 * Lock semantics: with `secret` set, the moment every settled digit matches,
 * `onUnlock` fires once, the latch bolt slides right on `snap`, the housing
 * border flashes accent, and an sr-only region announces "Unlocked". Any
 * dial leaving the match re-arms the lock and shuts the bolt; non-matching
 * settles are announced like any other — proximity never leaks.
 *
 * Reduced motion: the cylinders keep their static curvature but digits swap
 * instantly — drags advance detent by detent, there is no momentum and no
 * scale pulse (the pin blink stays, an opacity cue), and the latch opens with
 * a fast fade. Identical semantics and announcements. No rAF loops or
 * timers; settles report through animation completions, and every in-flight
 * control stops on unmount.
 */
export function ComboDials({
  length = 3,
  value,
  defaultValue,
  onValueChange,
  secret,
  onUnlock,
  className,
  "aria-label": ariaLabel = "Combination dials",
}: ComboDialsProps) {
  const motionSafe = useMotionSafe();

  const count = clamp(Math.round(length), 2, 5);

  const [initialDigits] = React.useState(() =>
    parseDigits(value ?? defaultValue, count),
  );
  /** Settled digits — mirrors the physical dial positions. */
  const [digits, setDigits] = React.useState(initialDigits);
  const [message, setMessage] = React.useState("");

  const digitsRef = React.useRef(initialDigits);
  /** The unlock trigger: armed until a match fires, re-armed on mismatch. */
  const armedRef = React.useRef(true);

  /** Accent flash on the housing border — jumps to 1 on unlock, fades out. */
  const flash = useMotionValue(0);

  const controlledDigits = value === undefined ? null : parseDigits(value, count);

  const cleanSecret = secret === undefined ? null : secret.replace(/\D/g, "");
  const secretCode =
    cleanSecret !== null && cleanSecret.length === count ? cleanSecret : null;

  const composed = Array.from({ length: count }, (_, i) => digits[i] ?? 0).join("");
  const unlocked = secretCode !== null && composed === secretCode;

  /** One dial settled: mirror, announce, emit, and run the lock check. */
  const handleSettle = (index: number, digit: number) => {
    const prev = digitsRef.current;
    if ((prev[index] ?? 0) === digit) return;
    const next = Array.from({ length: count }, (_, i) => prev[i] ?? 0);
    next[index] = digit;
    digitsRef.current = next;
    setDigits(next);
    setMessage(`Dial ${index + 1}: ${digit}`);
    const code = next.join("");
    onValueChange?.(code);
    if (secretCode !== null) {
      if (code === secretCode) {
        // Fires once per arming — holding the match never re-fires.
        if (armedRef.current) {
          armedRef.current = false;
          onUnlock?.();
        }
      } else {
        armedRef.current = true;
      }
    }
  };

  // The border flash: full accent on unlock, gone by durations.slow (fast
  // under reduced motion). Motion-value ops only — no state in effects.
  React.useEffect(() => {
    if (!unlocked) {
      flash.set(0);
      return;
    }
    flash.set(1);
    const controls = animate(flash, 0, {
      duration: motionSafe ? durations.slow : durations.fast,
      ease: easings.exit,
    });
    return () => controls.stop();
  }, [unlocked, motionSafe, flash]);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-unlocked={unlocked ? "" : undefined}
      className={cn(
        "relative w-fit rounded-3 border border-hairline bg-surface-1 p-3 select-none",
        className,
      )}
    >
      {/* THE STACK — one cylinder band per digit, pinned to the plate. */}
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: count }, (_, i) => (
          <Dial
            key={i}
            index={i}
            initialDigit={initialDigits[i] ?? 0}
            controlledDigit={
              controlledDigits === null ? undefined : (controlledDigits[i] ?? 0)
            }
            motionSafe={motionSafe}
            onSettle={handleSettle}
          />
        ))}
      </div>

      {/* THE LATCH — only a keyed housing carries a bolt. */}
      {secret !== undefined && (
        <div aria-hidden className="mt-3 border-t border-hairline pt-3">
          <div className="relative h-2.5 overflow-hidden rounded-full border border-hairline bg-surface-0">
            {motionSafe ? (
              <motion.span
                className="absolute top-1/2 left-0.5 h-1 w-[42%] rounded-full bg-hairline-strong"
                style={{ y: "-50%" }}
                initial={false}
                animate={{ x: unlocked ? "130%" : "0%" }}
                transition={springs.snap}
              />
            ) : (
              // Reduced motion: the bolt appears at its new seat on a fast
              // fade — the remount is the transition.
              <motion.span
                key={unlocked ? "open" : "shut"}
                className="absolute top-1/2 left-0.5 h-1 w-[42%] rounded-full bg-hairline-strong"
                style={{ x: unlocked ? "130%" : "0%", y: "-50%" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.fast }}
              />
            )}
          </div>
        </div>
      )}

      {/* Accent flash over the housing border on unlock. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-3 border-2"
        style={{ borderColor: "var(--accent)", opacity: flash }}
      />

      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {unlocked ? "Unlocked" : ""}
      </span>
    </div>
  );
}

type DialProps = {
  index: number;
  initialDigit: number;
  /** Target digit when the stack is controlled; the dial glides to match. */
  controlledDigit: number | undefined;
  motionSafe: boolean;
  onSettle: (index: number, digit: number) => void;
};

/**
 * One cylinder band. The rotation motion value is continuous and unbounded —
 * faces resolve their display angle through `angleDelta`, so the rim wraps
 * without seams and momentum can cross 9 → 0 freely.
 */
function Dial({
  index,
  initialDigit,
  controlledDigit,
  motionSafe,
  onSettle,
}: DialProps) {
  /** The one source of truth: dial angle in degrees, digit d fronts at d·36. */
  const rotation = useMotionValue(initialDigit * FACE_STEP);
  /** Fronted-digit scale — set to 1.08 on a land, springs home on flick. */
  const pulse = useMotionValue(1);
  /** Side-pin glow — jumps to 1 on a land, tweens back to rest. */
  const pinPulse = useMotionValue(PIN_REST);

  /** Live nearest-detent digit — drives aria-valuenow and face ink. */
  const [active, setActive] = React.useState(initialDigit);
  const [grabbing, setGrabbing] = React.useState(false);

  /** The detent the dial last settled on or is heading to, deg. */
  const targetRef = React.useRef(initialDigit * FACE_STEP);
  /** Which detent index the band currently fronts (unbounded). */
  const nearestRef = React.useRef(initialDigit);
  const dragRef = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const pulseAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const pinAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);

  const onSettleRef = React.useRef(onSettle);
  React.useEffect(() => {
    onSettleRef.current = onSettle;
  });

  // Nothing in flight may outlive the component.
  React.useEffect(
    () => () => {
      controlsRef.current?.stop();
      pulseAnimRef.current?.stop();
      pinAnimRef.current?.stop();
    },
    [],
  );

  // Detent lands derive from rotation: whenever the nearest detent changes —
  // dragging, flinging, or gliding on keys — the pins blink once and the
  // fronted digit pulses. Event callback, never an effect body.
  useMotionValueEvent(rotation, "change", (deg) => {
    const nearest = Math.round(deg / FACE_STEP);
    if (nearest === nearestRef.current) return;
    nearestRef.current = nearest;
    setActive(mod10(nearest));
    pinAnimRef.current?.stop();
    pinPulse.set(1);
    pinAnimRef.current = animate(pinPulse, PIN_REST, {
      duration: durations.blink,
      ease: easings.exit,
    });
    if (motionSafe) {
      pulseAnimRef.current?.stop();
      pulse.set(1.08);
      pulseAnimRef.current = animate(pulse, 1, springs.flick);
    }
  });

  /** Seat a detent: spring there and report the settle on completion. */
  const settleTo = (detent: number, transition: Transition, velocity?: number) => {
    targetRef.current = detent;
    controlsRef.current?.stop();
    if (motionSafe) {
      controlsRef.current = animate(rotation, detent, {
        ...transition,
        ...(velocity === undefined ? null : { velocity }),
        onComplete: () => onSettleRef.current(index, digitOfDetent(detent)),
      });
    } else {
      // Instant swap; called from event handlers, so the settle may report
      // synchronously.
      rotation.jump(detent);
      onSettleRef.current(index, digitOfDetent(detent));
    }
  };

  /** Shortest-path glide to a digit — typed keys, Home and End. */
  const jumpToDigit = (digit: number) => {
    const from = targetRef.current;
    if (digitOfDetent(from) === digit) return;
    settleTo(from + angleDelta(from, digit * FACE_STEP), springs.glide);
  };

  // Controlled digits steer the dial by the shortest path (motion-value ops
  // only). The settle reports through the animation completion — under
  // reduced motion a zero-duration animation keeps that report out of the
  // effect body.
  React.useEffect(() => {
    if (controlledDigit === undefined) return;
    const from = targetRef.current;
    if (digitOfDetent(from) === controlledDigit) return;
    const detent = from + angleDelta(from, controlledDigit * FACE_STEP);
    targetRef.current = detent;
    controlsRef.current?.stop();
    if (motionSafe) {
      controlsRef.current = animate(rotation, detent, {
        ...springs.glide,
        onComplete: () => onSettleRef.current(index, digitOfDetent(detent)),
      });
    } else {
      rotation.jump(detent);
      controlsRef.current = animate(rotation, detent, {
        duration: 0,
        onComplete: () => onSettleRef.current(index, digitOfDetent(detent)),
      });
    }
  }, [controlledDigit, motionSafe, rotation, index]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    controlsRef.current?.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      raw: rotation.get(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setGrabbing(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.lastX;
    // The band follows the finger: drag left sweeps toward higher digits.
    const dDeg = -dx * SENSITIVITY;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous angular velocity so the fling reads intent.
      const instant = dDeg / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    drag.raw += dDeg;
    if (motionSafe) rotation.set(drag.raw);
    // Reduced motion: the band never sweeps — digits swap detent by detent.
    else rotation.jump(snapAngle(drag.raw, FACE_STEP));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setGrabbing(false);
    if (motionSafe) {
      // Momentum capped at ±3 digits: clamp the release velocity so the
      // projection can never carry farther, then snap with that velocity.
      const maxSpin = (MAX_CARRY * FACE_STEP) / MOMENTUM_WINDOW;
      const velocity = clamp(drag.velocity, -maxSpin, maxSpin);
      const projected = drag.raw + velocity * MOMENTUM_WINDOW;
      settleTo(snapAngle(projected, FACE_STEP), springs.snap, velocity);
    } else {
      settleTo(snapAngle(drag.raw, FACE_STEP), springs.snap);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        settleTo(targetRef.current + FACE_STEP, springs.snap);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        settleTo(targetRef.current - FACE_STEP, springs.snap);
        break;
      case "Home":
        jumpToDigit(0);
        break;
      case "End":
        jumpToDigit(9);
        break;
      default: {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key.length === 1 && event.key >= "0" && event.key <= "9") {
          jumpToDigit(event.key.charCodeAt(0) - 48);
          break;
        }
        return;
      }
    }
    event.preventDefault();
  };

  return (
    <div className="flex items-center gap-2">
      {/* Housing side pins — blink once per detent land. */}
      <motion.span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
        style={{ opacity: pinPulse }}
      />

      {/* The band frame is flat (perspective only), so it may clip and carry
          the recess shadow, shoulder shades, and reading window; the
          preserve-3d stage inside never clips or filters. */}
      <div
        role="spinbutton"
        tabIndex={0}
        aria-label={`Dial ${index + 1}`}
        aria-valuemin={0}
        aria-valuemax={9}
        aria-valuenow={active}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "relative touch-none overflow-hidden rounded-2 border border-hairline bg-surface-2",
          BAND_SHADOW,
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{ width: BAND_W, height: BAND_H, perspective: perspectives.near }}
      >
        {/* The stage: recessed by −r so the fronted face sits on the screen
            plane; the only will-change layer. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `translateZ(${-RADIUS}px)`,
            willChange: "transform",
          }}
        >
          {FACES.map((digit) => (
            <DialFace
              key={digit}
              rotation={rotation}
              digit={digit}
              isActive={digit === active}
              pulse={pulse}
              motionSafe={motionSafe}
            />
          ))}
        </div>

        {/* Shoulder shades — painted on the flat frame, never on 3D nodes. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-7 bg-linear-to-r from-surface-2 to-surface-2/0"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-7 bg-linear-to-l from-surface-2 to-surface-2/0"
        />

        {/* The reading window: hairline gate over a faint accent wash. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-1/2 z-10 -translate-x-1/2 border-x border-hairline-strong bg-cobalt-wash"
          style={{ width: FACE_W + 4 }}
        />
      </div>

      <motion.span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
        style={{ opacity: pinPulse }}
      />
    </div>
  );
}

type DialFaceProps = {
  rotation: MotionValue<number>;
  /** This face's fixed spoke on the rim. */
  digit: number;
  isActive: boolean;
  pulse: MotionValue<number>;
  motionSafe: boolean;
};

/**
 * One digit face on the rim. The outer span carries only the 3D placement
 * (rotateY + translateZ from the shared rotation, wrap-resolved through
 * angleDelta); the fade and the land pulse live on a flat inner span, so
 * grouping properties never break the cylinder. Past the horizon the face
 * stops painting entirely.
 */
function DialFace({ rotation, digit, isActive, pulse, motionSafe }: DialFaceProps) {
  const angle = useTransform(rotation, (deg) => angleDelta(deg, digit * FACE_STEP));
  const transform = useTransform(
    angle,
    (a) => `rotateY(${a}deg) translateZ(${RADIUS}px)`,
  );
  const opacity = useTransform(angle, (a) =>
    mapRange(Math.abs(a), 0, FADE_END, 1, 0),
  );
  const visibility = useTransform(angle, (a) =>
    Math.abs(a) <= CULL ? "visible" : "hidden",
  );

  return (
    <motion.span
      className="absolute top-0 left-1/2 flex h-full items-center justify-center"
      style={{
        width: FACE_W,
        marginLeft: -FACE_W / 2,
        transform,
        visibility,
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <motion.span
        style={{ opacity, scale: isActive && motionSafe ? pulse : 1 }}
        className={cn(
          "font-mono text-base leading-none tabular-nums transition-colors",
          isActive ? "text-ink" : "text-ink-3",
        )}
      >
        {digit}
      </motion.span>
    </motion.span>
  );
}
