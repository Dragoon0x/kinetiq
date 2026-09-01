"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import {
  Angry,
  Frown,
  Hand,
  Heart,
  Laugh,
  Music,
  PartyPopper,
  Smile,
  ThumbsUp,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage card footprint, px. */
const STAGE_SIZE = 280;
/** Central trigger diameter, px. */
const TRIGGER_SIZE = 72;
/** One wedge's footprint, px. */
const WEDGE_SIZE = 56;
/** Distance from the stage centre to each wedge's centre, px — index math, never measured. */
const WEDGE_RADIUS = 96;
/** Pointer distance from centre, px, inside which a release cancels instead of selecting. */
const DEAD_ZONE_R = 42;

/** The hub ring — the decorative ring that draws in around the centre on open. */
const HUB_RING_R = TRIGGER_SIZE / 2 + 10;
const HUB_STROKE = 2;

/** The cooldown sweep ring, drawn on the trigger itself. */
const SWEEP_STROKE = 3;
const SWEEP_RADIUS = TRIGGER_SIZE / 2 - 6;
const SWEEP_CIRCUMFERENCE = 2 * Math.PI * SWEEP_RADIUS;

/** How far a played emote flies outward before arcing up, px. */
const FLIGHT_OUT = 54;
/** How far a played emote rises before it fades, px. */
const FLIGHT_RISE = 92;
const FLIGHT_DURATION_S = 0.8;
/** Reduced motion: how long the played emote holds at its landing spot, ms. */
const FLIGHT_REDUCED_MS = 550;
/** Half the flight glyph's own footprint, px — baked into its offsets so it never
 * relies on a Tailwind translate class fighting the motion transform. */
const FLIGHT_ICON_OFFSET = 12;

/** How long the played/cancelled caption holds before clearing, ms. */
const CAPTION_MS = 1300;
/** The cooldown clock's resolution — every remaining-second readout is counted
 * off this interval, never Date.now(). */
const TICK_MS = 100;
/** Recent strip capacity. */
const RECENT_MAX = 3;

export type Emote = {
  /** Stable identity — the value passed to `onEmote`. */
  id: string;
  /** Short label shown on the wedge and echoed in the caption. */
  label: string;
};

export type EmoteWheelProps = {
  /** Wedges arranged around the wheel. @default eight curated emotes */
  emotes?: Emote[];
  /** Lockout after a play, ms. @default 2500 */
  cooldownMs?: number;
  /** Fires with the emote id the instant a play is accepted. */
  onEmote?: (id: string) => void;
  className?: string;
};

/** A curated eight, in the exact order the fixed glyph table below expects. */
const DEFAULT_EMOTES = [
  { id: "wave", label: "Wave" },
  { id: "dance", label: "Dance" },
  { id: "lol", label: "LOL" },
  { id: "love", label: "Love" },
  { id: "nice", label: "Nice" },
  { id: "angry", label: "Angry" },
  { id: "sad", label: "Sad" },
  { id: "party", label: "Party" },
] as const satisfies readonly Emote[];

/** One in-flight played emote. `key` is the identity; `angle` is the wedge's
 * own base angle at play time, so the flight launches toward where it came
 * from before arcing up. */
type Flight = { key: number; glyphIndex: number; angle: number };

/** One entry in the recent strip, captured at play time so a later change to
 * the `emotes` prop can never retroactively change what already played. */
type RecentEntry = {
  key: number;
  id: string;
  label: string;
  glyphIndex: number;
};

/** A fixed eight-glyph rotation, cycled by index — Emote carries no icon
 * field, so every wedge's glyph is picked this way, never assigned to a
 * variable and rendered as a component reference. */
function glyphFor(index: number, className: string): React.ReactNode {
  switch (((index % 8) + 8) % 8) {
    case 0:
      return <Hand aria-hidden className={className} />;
    case 1:
      return <Music aria-hidden className={className} />;
    case 2:
      return <Laugh aria-hidden className={className} />;
    case 3:
      return <Heart aria-hidden className={className} />;
    case 4:
      return <ThumbsUp aria-hidden className={className} />;
    case 5:
      return <Angry aria-hidden className={className} />;
    case 6:
      return <Frown aria-hidden className={className} />;
    default:
      return <PartyPopper aria-hidden className={className} />;
  }
}

/**
 * A hold-to-open radial emote picker — the two seconds of personality a
 * game gets in the middle of everything else. Press and hold the trigger,
 * pointer or Space/Enter, and eight wedges bloom outward on `glide`,
 * staggered by index, while a hub ring draws in around the centre. Moving
 * the pointer (or arrow keys, or a direct 1-8 digit) highlights a wedge,
 * growing it and brightening its label; releasing plays it, and it flies
 * out and up on an authored arc before landing in the recent strip.
 * Releasing back near the dead centre cancels with no emote instead — an
 * escape hatch that is deliberate, not a gap, because a wheel with no way
 * out is a trap. A play locks the trigger for `cooldownMs`, sweeping the
 * ring down to nothing; that pause is deliberate too, the thing that keeps
 * the wheel an expression instead of a spam button.
 * Reduced motion: the wheel opens already fanned out with no bloom,
 * highlighting is a plain state swap, a play appears briefly at its
 * landing spot with no flight, and the cooldown shows only a stepped mono
 * numeral with no sweep.
 */
export function EmoteWheel({
  emotes = [...DEFAULT_EMOTES],
  cooldownMs = 2500,
  onEmote,
  className,
}: EmoteWheelProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const count = emotes.length;
  const step = count > 0 ? 360 / count : 360;
  const interval = cascade(count);

  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState<number | null>(
    null,
  );
  const [recent, setRecent] = React.useState<RecentEntry[]>([]);
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [resultCaption, setResultCaption] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [cooldownActive, setCooldownActive] = React.useState(false);
  const [remainingSec, setRemainingSec] = React.useState(0);

  const sweepDash = useMotionValue<number>(SWEEP_CIRCUMFERENCE);

  const stageRef = React.useRef<HTMLDivElement | null>(null);

  const heldRef = React.useRef(false);
  const holdSourceRef = React.useRef<"pointer" | "keyboard" | null>(null);
  const holdKeyRef = React.useRef<string | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);
  const highlightIndexRef = React.useRef<number | null>(null);

  const flightIdRef = React.useRef(0);
  const recentIdRef = React.useRef(0);
  const flightTimers = React.useRef<Set<number>>(new Set());
  const captionTimerRef = React.useRef<number | null>(null);

  const tickRef = React.useRef(0);
  const cooldownEndTickRef = React.useRef(0);
  const sweepAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);

  const onEmoteRef = React.useRef(onEmote);
  React.useEffect(() => {
    onEmoteRef.current = onEmote;
  });

  /** Sets highlight state and its ref mirror together, so handlers reading
   * the ref (pointerup, keyup, blur) always see the value the very same
   * gesture just chose, never a render behind. */
  const setHighlightIndexBoth = (value: number | null) => {
    highlightIndexRef.current = value;
    setHighlightIndex(value);
  };

  const scheduleCaptionClear = () => {
    if (captionTimerRef.current !== null)
      window.clearTimeout(captionTimerRef.current);
    captionTimerRef.current = window.setTimeout(() => {
      captionTimerRef.current = null;
      setResultCaption(null);
    }, CAPTION_MS);
  };

  /** Books the cooldown's end tick and, motion-safe, unwinds the sweep ring
   * from full to empty on a real linear tween over `ms`; reduced motion
   * skips the ring entirely and leaves the numeral to the tick loop. */
  const startCooldown = (ms: number) => {
    const durationTicks = Math.max(1, Math.round(ms / TICK_MS));
    cooldownEndTickRef.current = tickRef.current + durationTicks;
    setRemainingSec(Math.max(1, Math.ceil(ms / 1000)));
    setCooldownActive(true);
    sweepAnimRef.current?.stop();
    if (motionSafe) {
      sweepDash.set(0);
      sweepAnimRef.current = animate(sweepDash, SWEEP_CIRCUMFERENCE, {
        duration: ms / 1000,
        ease: easings.linear,
      });
    }
  };

  /** One shared tick: recomputes the remaining cooldown seconds off the
   * end-tick ledger and clears the lock once it arrives. */
  const runTick = () => {
    tickRef.current += 1;
    const now = tickRef.current;
    const endTick = cooldownEndTickRef.current;
    if (endTick <= 0) return;
    const msLeft = Math.max(0, (endTick - now) * TICK_MS);
    const sec = Math.ceil(msLeft / 1000);
    setRemainingSec((prev) => (prev === sec ? prev : sec));
    if (msLeft <= 0) {
      cooldownEndTickRef.current = 0;
      setCooldownActive(false);
    }
  };

  // Latest-ref mirror so the interval below always calls the freshest tick.
  const runTickRef = React.useRef(runTick);
  React.useEffect(() => {
    runTickRef.current = runTick;
  });

  // The clock only runs while a cooldown is actually counting down.
  React.useEffect(() => {
    if (!cooldownActive) return;
    const id = window.setInterval(() => runTickRef.current(), TICK_MS);
    return () => window.clearInterval(id);
  }, [cooldownActive]);

  /** Launches the fly-item, drops it in the recent strip, reports out, and
   * starts the cooldown. */
  const play = (emote: Emote, index: number) => {
    const key = flightIdRef.current;
    flightIdRef.current += 1;
    setFlights((cur) => [
      ...cur,
      { key, glyphIndex: index, angle: index * step },
    ]);
    const flightMs = motionSafe ? FLIGHT_DURATION_S * 1000 : FLIGHT_REDUCED_MS;
    const flightTimer = window.setTimeout(() => {
      flightTimers.current.delete(flightTimer);
      setFlights((cur) => cur.filter((f) => f.key !== key));
    }, flightMs + 150);
    flightTimers.current.add(flightTimer);

    const recentKey = recentIdRef.current;
    recentIdRef.current += 1;
    setRecent((cur) =>
      [
        { key: recentKey, id: emote.id, label: emote.label, glyphIndex: index },
        ...cur,
      ].slice(0, RECENT_MAX),
    );

    setResultCaption(`played: ${emote.label}`);
    setAnnounce(`Played ${emote.label}.`);
    scheduleCaptionClear();

    onEmoteRef.current?.(emote.id);
    startCooldown(cooldownMs);
  };

  const cancel = () => {
    setResultCaption("cancelled");
    setAnnounce("Cancelled.");
    scheduleCaptionClear();
  };

  /** Resolves the held gesture: plays the highlighted wedge, or cancels
   * when nothing (or the dead centre) was highlighted. Guarded against
   * double-fire so a late pointerup after an early keyboard commit is a
   * no-op, and vice versa. */
  const commit = (index: number | null) => {
    if (!open) return;
    setOpen(false);
    heldRef.current = false;
    holdSourceRef.current = null;
    holdKeyRef.current = null;
    pointerIdRef.current = null;
    setHighlightIndexBoth(null);

    if (index === null) {
      cancel();
      return;
    }
    const emote = emotes[index];
    if (!emote) {
      cancel();
      return;
    }
    play(emote, index);
  };

  const pressStart = (source: "pointer" | "keyboard") => {
    if (heldRef.current || cooldownActive || count === 0) return;
    heldRef.current = true;
    holdSourceRef.current = source;
    setHighlightIndexBoth(null);
    setResultCaption(null);
    if (captionTimerRef.current !== null) {
      window.clearTimeout(captionTimerRef.current);
      captionTimerRef.current = null;
    }
    setOpen(true);
  };

  /** Pointer position, as an offset from the stage centre. */
  const updateHighlightFromClient = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage || count === 0) return;
    const rect = stage.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < DEAD_ZONE_R) {
      setHighlightIndexBoth(null);
      return;
    }
    // atan2(dx, -dy): 0° points up, growing clockwise — matches wedge placement.
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const idx = ((Math.round(angle / step) % count) + count) % count;
    setHighlightIndexBoth(idx);
  };

  const moveHighlight = (delta: number) => {
    if (count === 0) return;
    const current = highlightIndexRef.current;
    const start = current ?? (delta > 0 ? -1 : 0);
    const next = (((start + delta) % count) + count) % count;
    setHighlightIndexBoth(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (cooldownActive || count === 0 || heldRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    pressStart("pointer");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!heldRef.current || holdSourceRef.current !== "pointer") return;
    if (e.pointerId !== pointerIdRef.current) return;
    updateHighlightFromClient(e.clientX, e.clientY);
  };

  // A release must always land, even if the pointer strayed off the
  // trigger — pointer capture keeps these events targeted here regardless.
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== pointerIdRef.current) return;
    commit(highlightIndexRef.current);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const key = e.key;
    if (!open) {
      if ((key === " " || key === "Spacebar" || key === "Enter") && !e.repeat) {
        e.preventDefault();
        holdKeyRef.current = key;
        pressStart("keyboard");
      }
      return;
    }

    switch (key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        moveHighlight(1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        moveHighlight(-1);
        return;
      case "Escape":
        e.preventDefault();
        commit(null);
        return;
      case "Enter":
        if (e.repeat) return;
        e.preventDefault();
        commit(highlightIndexRef.current);
        return;
      default:
        break;
    }

    if (key.length === 1 && key >= "1" && key <= "8") {
      const idx = Number(key) - 1;
      if (idx < count) {
        e.preventDefault();
        setHighlightIndexBoth(idx);
        commit(idx);
      }
    }
  };

  const onKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (holdSourceRef.current !== "keyboard") return;
    if (e.key !== holdKeyRef.current) return;
    commit(highlightIndexRef.current);
  };

  const onBlur = () => {
    if (heldRef.current) commit(highlightIndexRef.current);
  };

  // Unmount teardown: every pending timer cleared, the sweep tween stopped.
  React.useEffect(() => {
    const pendingFlightTimers = flightTimers.current;
    return () => {
      pendingFlightTimers.forEach((timer) => window.clearTimeout(timer));
      pendingFlightTimers.clear();
      if (captionTimerRef.current !== null)
        window.clearTimeout(captionTimerRef.current);
      sweepAnimRef.current?.stop();
    };
  }, []);

  const captionText = cooldownActive
    ? `cooling down ${remainingSec}s`
    : open
      ? highlightIndex !== null
        ? (emotes[highlightIndex]?.label ?? "")
        : "release to cancel"
      : (resultCaption ?? "hold to emote");

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div
        ref={stageRef}
        className="relative rounded-4 border border-hairline bg-surface-1"
        style={{ width: STAGE_SIZE, height: STAGE_SIZE }}
      >
        {/* Hub ring — draws in around the centre on open. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2"
          width={HUB_RING_R * 2}
          height={HUB_RING_R * 2}
          viewBox={`0 0 ${HUB_RING_R * 2} ${HUB_RING_R * 2}`}
        >
          <motion.circle
            cx={HUB_RING_R}
            cy={HUB_RING_R}
            r={HUB_RING_R - HUB_STROKE}
            fill="none"
            stroke="var(--accent-bright)"
            strokeWidth={HUB_STROKE}
            strokeLinecap="round"
            strokeDasharray="1 1"
            initial={motionSafe ? { pathLength: 0, opacity: 0 } : false}
            animate={{ pathLength: open ? 1 : 0, opacity: open ? 0.8 : 0 }}
            transition={
              motionSafe
                ? { duration: durations.slow, ease: easings.enter }
                : { duration: 0 }
            }
          />
        </svg>

        {/* Wedges — positions from index math, staggered in on `glide`. */}
        <AnimatePresence>
          {open &&
            emotes.map((emote, i) => {
              const rad = (i * step * Math.PI) / 180;
              const x = WEDGE_RADIUS * Math.sin(rad);
              const y = -WEDGE_RADIUS * Math.cos(rad);
              return (
                <EmoteWedge
                  key={emote.id}
                  emote={emote}
                  index={i}
                  x={x}
                  y={y}
                  highlighted={highlightIndex === i}
                  motionSafe={motionSafe}
                  delay={motionSafe ? i * interval : 0}
                />
              );
            })}
        </AnimatePresence>

        {/* Fly-items — launch from centre, arc out and up, then fade. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
        >
          <AnimatePresence>
            {flights.map((flight) => {
              const rad = (flight.angle * Math.PI) / 180;
              const dirX = Math.sin(rad);
              const dirY = -Math.cos(rad);
              const midX = dirX * FLIGHT_OUT;
              const midY = dirY * FLIGHT_OUT - 10;
              const endX = dirX * FLIGHT_OUT * 0.5;
              const endY = -FLIGHT_RISE;
              return (
                <motion.span
                  key={flight.key}
                  className="absolute top-0 left-0 text-cobalt-bright [&>svg]:drop-shadow-[0_1px_6px_var(--accent-wash)]"
                  initial={
                    motionSafe
                      ? {
                          x: -FLIGHT_ICON_OFFSET,
                          y: -FLIGHT_ICON_OFFSET,
                          scale: 0.5,
                          opacity: 0,
                        }
                      : {
                          x: endX - FLIGHT_ICON_OFFSET,
                          y: endY - FLIGHT_ICON_OFFSET,
                          scale: 1,
                          opacity: 1,
                        }
                  }
                  animate={
                    motionSafe
                      ? {
                          x: [
                            -FLIGHT_ICON_OFFSET,
                            midX - FLIGHT_ICON_OFFSET,
                            endX - FLIGHT_ICON_OFFSET,
                          ],
                          y: [
                            -FLIGHT_ICON_OFFSET,
                            midY - FLIGHT_ICON_OFFSET,
                            endY - FLIGHT_ICON_OFFSET,
                          ],
                          scale: [0.5, 1.3, 0.9],
                          opacity: [0, 1, 0],
                          transition: {
                            duration: FLIGHT_DURATION_S,
                            ease: easings.exit,
                            times: [0, 0.4, 1],
                          },
                        }
                      : {
                          opacity: [1, 1, 0],
                          transition: {
                            duration: FLIGHT_REDUCED_MS / 1000,
                            ease: easings.exit,
                            times: [0, 0.6, 1],
                          },
                        }
                  }
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                >
                  {glyphFor(flight.glyphIndex, "size-6")}
                </motion.span>
              );
            })}
          </AnimatePresence>
        </span>

        {/* Trigger — hold to open; also carries the cooldown sweep. */}
        <button
          type="button"
          aria-label="Hold to open the emote wheel"
          aria-expanded={open}
          disabled={cooldownActive}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onBlur={onBlur}
          className={cn(
            "absolute top-1/2 left-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full border outline-none select-none",
            "bg-surface-2 transition-colors duration-200",
            "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            "disabled:cursor-not-allowed disabled:opacity-60",
            open ? "border-[var(--accent-bright)]" : "border-hairline-strong",
          )}
          style={{
            width: TRIGGER_SIZE,
            height: TRIGGER_SIZE,
            touchAction: "none",
          }}
        >
          {motionSafe && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 -rotate-90"
            >
              <svg
                width={TRIGGER_SIZE}
                height={TRIGGER_SIZE}
                viewBox={`0 0 ${TRIGGER_SIZE} ${TRIGGER_SIZE}`}
              >
                <circle
                  cx={TRIGGER_SIZE / 2}
                  cy={TRIGGER_SIZE / 2}
                  r={SWEEP_RADIUS}
                  fill="none"
                  stroke="var(--hairline)"
                  strokeWidth={SWEEP_STROKE}
                />
                <motion.circle
                  cx={TRIGGER_SIZE / 2}
                  cy={TRIGGER_SIZE / 2}
                  r={SWEEP_RADIUS}
                  fill="none"
                  stroke="var(--accent-bright)"
                  strokeWidth={SWEEP_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={SWEEP_CIRCUMFERENCE}
                  style={{ strokeDashoffset: sweepDash, opacity: 0.9 }}
                />
              </svg>
            </div>
          )}

          <Smile
            aria-hidden
            className={cn(
              "relative size-6 transition-opacity duration-200",
              open ? "text-cobalt-bright" : "text-ink-2",
              cooldownActive && "opacity-30",
            )}
          />

          <AnimatePresence>
            {cooldownActive && (
              <motion.span
                key="countdown"
                aria-hidden
                initial={motionSafe ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: {
                    duration: motionSafe ? durations.fast : 0,
                    ease: easings.exit,
                  },
                }}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <span className="rounded-2 bg-surface-2/90 px-1.5 py-0.5 font-mono text-sm font-semibold text-ink tabular-nums">
                  {remainingSec}
                </span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      <p
        className={cn(
          "min-h-[1em] font-mono text-xs tabular-nums",
          open && highlightIndex !== null ? "text-ink" : "text-ink-3",
        )}
      >
        {captionText}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-label text-ink-3">Recent</span>
        <div className="flex items-center gap-1.5">
          {recent.length === 0 ? (
            <span className="text-xs text-ink-3">—</span>
          ) : (
            recent.map((entry) => (
              <span
                key={entry.key}
                title={entry.label}
                aria-hidden
                className="flex size-6 items-center justify-center rounded-full border border-hairline bg-surface-2 text-ink-2"
              >
                {glyphFor(entry.glyphIndex, "size-3.5")}
              </span>
            ))
          )}
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type EmoteWedgeProps = {
  emote: Emote;
  index: number;
  /** This wedge's fixed offset from the stage centre, px — index math. */
  x: number;
  y: number;
  highlighted: boolean;
  motionSafe: boolean;
  /** Cascade delay for this wedge's bloom-in, seconds. */
  delay: number;
};

/**
 * One wedge on the wheel. Blooms from the centre out to its fixed polar
 * position on `glide`, staggered by `delay`; highlighting grows it and
 * brightens its border/label on `snap`. Reduced motion renders directly at
 * the final position with no bloom, and highlighting is an instant swap.
 */
function EmoteWedge({
  emote,
  index,
  x,
  y,
  highlighted,
  motionSafe,
  delay,
}: EmoteWedgeProps) {
  return (
    <motion.div
      className={cn(
        "absolute top-1/2 left-1/2 flex flex-col items-center justify-center gap-0.5 rounded-full border text-center",
        "transition-colors",
        motionSafe ? "duration-200" : "duration-0",
        highlighted
          ? "border-[var(--accent-bright)] bg-[var(--accent-wash)] text-cobalt-bright"
          : "border-hairline bg-surface-2 text-ink-2",
      )}
      style={{ width: WEDGE_SIZE, height: WEDGE_SIZE }}
      initial={
        motionSafe
          ? { x: -WEDGE_SIZE / 2, y: -WEDGE_SIZE / 2, scale: 0.3, opacity: 0 }
          : false
      }
      animate={{
        x: x - WEDGE_SIZE / 2,
        y: y - WEDGE_SIZE / 2,
        scale: highlighted ? 1.16 : 1,
        opacity: 1,
        transition: motionSafe
          ? {
              x: { ...springs.glide, delay },
              y: { ...springs.glide, delay },
              scale: { ...springs.snap, delay },
              opacity: { duration: durations.base, delay },
            }
          : { duration: 0 },
      }}
      exit={
        motionSafe
          ? {
              x: -WEDGE_SIZE / 2,
              y: -WEDGE_SIZE / 2,
              scale: 0.3,
              opacity: 0,
              transition: exitFor(durations.base),
            }
          : { opacity: 0, transition: { duration: 0 } }
      }
    >
      <span aria-hidden className="flex items-center justify-center">
        {glyphFor(index, "size-4")}
      </span>
      <span className="max-w-full truncate px-1 text-[10px] leading-none font-medium">
        {emote.label}
      </span>
    </motion.div>
  );
}
