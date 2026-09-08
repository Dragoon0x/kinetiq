"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CardFreezeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled frozen state. */
  frozen?: boolean;
  /** Initial state for uncontrolled usage. */
  defaultFrozen?: boolean;
  /** Fires from the release, click or key that committed the throw. */
  onFrozenChange?: (frozen: boolean) => void;
  /** Whole-percent throw position, for a status line that narrates the gesture. */
  onProgressChange?: (percent: number) => void;
  /** Names the switch. @default "Freeze card" */
  label?: string;
  /** Slab face: the network wordmark, the last four digits, and the name. */
  network?: string;
  last4?: string;
  holder?: string;
  /** Seeds the crystal pattern — same seed, same frost. */
  seed?: number;
  /** Locks the track. */
  disabled?: boolean;
  className?: string;
};

const TRACK_H = 40;
const KNOB = 32;
const PAD = 4;
/** Pointer travel before capture: capturing on pointerdown eats plain clicks. */
const CAPTURE_PX = 4;
/** Hole radius, in gradient percent, at which the frost has fully receded. */
const CLEAR = 128;
const SHARDS = 18;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/** Mulberry32 — a seeded generator, so the frost is identical on both renders. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** One crystal: a stem with two pairs of barbs, the shape frost actually grows. */
const FERN = "M0 0V-11M0-3.4l3.2-2.6M0-3.4l-3.2-2.6M0-7l2.4-2M0-7l-2.4-2";

const CARD_ART = [
  "radial-gradient(120% 120% at 4% 0%, color-mix(in oklab, var(--accent) 38%, transparent), transparent 62%)",
  "linear-gradient(152deg, var(--bg-2), var(--bg-1) 68%)",
].join(", ");
const FROST_WASH =
  "linear-gradient(158deg, color-mix(in oklab, var(--accent-bright) 26%, transparent), color-mix(in oklab, var(--accent-bright) 10%, transparent))";
const CAPTION = "font-mono text-[9px] tracking-[0.14em] text-ink-3 uppercase";
const RAIL_LABEL =
  "pointer-events-none absolute inset-y-0 flex items-center font-mono text-[10px] tracking-[0.1em] uppercase";
const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** The flake on the knob; it turns a quarter when the switch is thrown. */
const FLAKE =
  "M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M12 7l2.4-2M12 7l-2.4-2M12 17l2.4 2M12 17l-2.4 2";

/**
 * Frozen in a swipe. The knob throws right to freeze and left to thaw, tracking
 * the pointer 1:1 once the drag has cleared 4px — capture waits for that, or a
 * plain click is swallowed before it can toggle. Past the halfway mark it
 * commits on `snap`; released short it springs home on the same spring, because
 * the refusal has to feel like the thing that carried it.
 *
 * Behind the switch the card frosts. A seeded field of crystals sits under a
 * radial-gradient mask whose hole radius is a motion value: freezing drives it
 * to zero so the frost spreads inward from the edges, thawing drives it back
 * out so it recedes from the centre. Both run on `drift` — ζ1.0, ~800ms, a
 * large surface changing state and never bouncing, because freezing a card is
 * not a celebration.
 *
 * The track is a `role="switch"`: Space and Enter toggle it, Right and End
 * freeze, Left and Home thaw, Escape abandons a throw in progress. Under
 * reduced motion the knob jumps to its end and the veneer cross-fades in place
 * — the frost still arrives, because being frozen is information.
 */
export function CardFreeze({
  ref,
  frozen,
  defaultFrozen = false,
  onFrozenChange,
  onProgressChange,
  label = "Freeze card",
  network = "Waylight",
  last4 = "4417",
  holder = "R. ALDERWICK",
  seed = 19,
  disabled = false,
  className,
}: CardFreezeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultFrozen);
  const isControlled = frozen !== undefined;
  const isFrozen = isControlled ? frozen : uncontrolled;

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const travelRef = React.useRef(0);
  const grab = React.useRef<{ x: number; from: number } | null>(null);
  const captured = React.useRef(false);
  const knobControls = React.useRef<AnimationPlaybackControls | null>(null);

  const [travel, setTravel] = React.useState(0);
  const lastPercent = React.useRef(isFrozen ? 100 : 0);

  const x = useMotionValue(0);
  const fillWidth = useTransform(x, (value) => value + KNOB + PAD * 2);
  const hole = useMotionValue(isFrozen ? 0 : CLEAR);
  // Two stops from one value: a soft ramp so the frost has a growing edge
  // rather than a cut circle.
  const inner = useTransform(hole, (v) => `${Math.max(0, v - 18)}%`);
  const outer = useTransform(hole, (v) => `${Math.max(0.4, v)}%`);
  const frostMask = useMotionTemplate`radial-gradient(circle at 50% 50%, transparent ${inner}, black ${outer})`;

  const crystals = React.useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: SHARDS }, () => ({
      x: 6 + random() * 178,
      y: 8 + random() * 84,
      angle: random() * 360,
      scale: 0.55 + random() * 0.9,
      opacity: 0.3 + random() * 0.45,
    }));
  }, [seed]);

  // Reported from the motion value's own change event, so a throw narrates
  // itself without a re-render per pixel.
  useMotionValueEvent(x, "change", (value) => {
    const next =
      travelRef.current > 0 ? Math.round((value / travelRef.current) * 100) : 0;
    if (lastPercent.current === next) return;
    lastPercent.current = next;
    onProgressChange?.(next);
  });

  React.useEffect(() => {
    const element = trackRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // The observer's own callback carries the measurement, so the width is
    // never read synchronously inside the effect body.
    const observer = new ResizeObserver(() => {
      const next = Math.max(
        0,
        element.getBoundingClientRect().width - PAD * 2 - KNOB,
      );
      travelRef.current = next;
      setTravel(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The knob rests where the state says, whatever moved it — a key, a click, a
  // release, or a resize that moved the far end.
  React.useEffect(() => {
    if (grab.current) return;
    const target = isFrozen ? travel : 0;
    knobControls.current?.stop();
    if (!motionSafe) {
      x.set(target);
      return;
    }
    knobControls.current = animate(x, target, springs.snap);
    return () => knobControls.current?.stop();
  }, [isFrozen, motionSafe, x, travel]);

  React.useEffect(() => {
    const controls = animate(
      hole,
      motionSafe ? (isFrozen ? 0 : CLEAR) : 0,
      motionSafe ? springs.drift : { duration: 0 },
    );
    return () => controls.stop();
  }, [isFrozen, motionSafe, hole]);

  const commit = (next: boolean) => {
    if (disabled) return;
    if (next !== isFrozen) {
      if (!isControlled) setUncontrolled(next);
      onFrozenChange?.(next);
      return;
    }
    // Same state, but the knob may be sitting mid-track after a short throw.
    knobControls.current?.stop();
    const target = next ? travelRef.current : 0;
    if (motionSafe) knobControls.current = animate(x, target, springs.snap);
    else x.set(target);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const { key } = event;
    if (key === " " || key === "Enter") commit(!isFrozen);
    else if (key === "ArrowRight" || key === "ArrowUp" || key === "End")
      commit(true);
    else if (key === "ArrowLeft" || key === "ArrowDown" || key === "Home")
      commit(false);
    else if (key === "Escape") commit(isFrozen);
    else return;
    event.preventDefault();
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        className="relative w-full overflow-hidden rounded-3 border border-hairline-strong"
        style={{ aspectRatio: "1.9", backgroundImage: CARD_ART }}
      >
        <div className="flex h-full flex-col justify-between p-4 text-ink">
          <div className="flex items-start justify-between gap-3">
            <span className="truncate text-sm font-semibold tracking-tight">
              {network}
            </span>
            <span className={cn(CAPTION, "shrink-0")}>Debit</span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[11px] tracking-[0.1em] text-ink-2 uppercase">
              {holder}
            </span>
            <span className="shrink-0 font-mono text-[13px] tracking-[0.08em] tabular-nums">
              <span aria-hidden>•••• </span>
              <span className="sr-only">Card ending </span>
              {last4}
            </span>
          </div>
        </div>

        {/* The veneer blurs whatever is beneath it, so the frost reads as glass
            in either theme without a fixed colour standing in for the card. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: FROST_WASH,
            backdropFilter: "blur(3px) saturate(0.45)",
            WebkitBackdropFilter: "blur(3px) saturate(0.45)",
            maskImage: frostMask,
            WebkitMaskImage: frostMask,
          }}
          initial={false}
          animate={{ opacity: motionSafe || isFrozen ? 1 : 0 }}
          transition={FADE}
        >
          <svg
            viewBox="0 0 190 100"
            preserveAspectRatio="none"
            aria-hidden
            className="h-full w-full text-cobalt-bright"
          >
            <g
              fill="none"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
            >
              {crystals.map((crystal, index) => (
                <path
                  key={index}
                  d={FERN}
                  strokeOpacity={crystal.opacity}
                  transform={`translate(${crystal.x.toFixed(2)} ${crystal.y.toFixed(2)}) rotate(${crystal.angle.toFixed(1)}) scale(${crystal.scale.toFixed(2)})`}
                />
              ))}
            </g>
          </svg>
        </motion.div>
      </div>

      <div
        ref={trackRef}
        role="switch"
        aria-checked={isFrozen}
        aria-label={label}
        aria-disabled={disabled || undefined}
        aria-describedby={hintId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          grab.current = { x: event.clientX, from: x.get() };
          captured.current = false;
          knobControls.current?.stop();
          event.currentTarget.focus();
        }}
        onPointerMove={(event) => {
          const from = grab.current;
          if (!from || disabled) return;
          const dx = event.clientX - from.x;
          if (!captured.current) {
            if (Math.abs(dx) < CAPTURE_PX) return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // A synthetic sweep has no live pointer to capture.
            }
            captured.current = true;
          }
          x.set(clamp(from.from + dx, 0, travelRef.current));
        }}
        onPointerUp={(event) => {
          if (!grab.current) return;
          try {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          } catch {
            // Already released by the browser.
          }
          const dragged = captured.current;
          grab.current = null;
          captured.current = false;
          if (!dragged) commit(!isFrozen);
          else if (travelRef.current > 0)
            commit(x.get() / travelRef.current >= 0.5);
        }}
        onPointerCancel={() => {
          if (!grab.current) return;
          grab.current = null;
          captured.current = false;
          commit(isFrozen);
        }}
        className={cn(
          "relative w-full rounded-full border border-hairline bg-surface-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          disabled ? "opacity-50" : "cursor-pointer",
        )}
        style={{ height: TRACK_H }}
      >
        <motion.span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 rounded-full bg-cobalt-wash"
          style={{ width: fillWidth }}
        />
        {[
          {
            text: "Throw to freeze",
            place: "right-4 text-ink-3",
            on: !isFrozen,
          },
          { text: "Frozen", place: "left-4 text-cobalt-bright", on: isFrozen },
        ].map((rail) => (
          <motion.span
            key={rail.text}
            aria-hidden
            className={cn(RAIL_LABEL, rail.place)}
            initial={false}
            animate={{ opacity: rail.on ? 1 : 0 }}
            transition={FADE}
          >
            {rail.text}
          </motion.span>
        ))}

        <motion.span
          aria-hidden
          className={cn(
            "absolute flex items-center justify-center rounded-full transition-colors",
            isFrozen
              ? "bg-cobalt-bright text-background"
              : "bg-surface-0 text-ink-2 shadow-sm",
          )}
          style={{ x, width: KNOB, height: KNOB, top: PAD, left: PAD }}
        >
          <motion.span
            className="flex items-center justify-center"
            initial={false}
            animate={{ rotate: motionSafe && isFrozen ? 90 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0">
              <path
                d={FLAKE}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </motion.span>
        </motion.span>
      </div>

      <span id={hintId} className="sr-only">
        Space or Enter toggles the switch; Right freezes, Left thaws.
      </span>
      <span role="status" className="sr-only">
        {isFrozen ? "Card frozen" : "Card active"}
      </span>
    </div>
  );
}
