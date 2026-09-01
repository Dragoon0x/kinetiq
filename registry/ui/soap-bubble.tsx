"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage box, in px — tall enough for a full rise plus the wand. */
const STAGE_W = 176;
const STAGE_H = 280;

/** Wand geometry: ring outer diameter, stick length, and their overlap. */
const RING_D = 44;
const STICK_H = 48;
const STICK_OVERLAP = 6;
const WAND_BOTTOM = 8;

/** Ring center measured from the stage top — every bubble is born here. */
const RING_CENTER_TOP =
  STAGE_H - WAND_BOTTOM - (RING_D + STICK_H - STICK_OVERLAP) + RING_D / 2;

/** Film base diameter (scale 1 fills the ring) and its scale envelope. */
const FILM_D = 36;
const FILM_MIN_SCALE = 0.35;
const FILM_MAX_SCALE = 3.2;
/** Released below this scale, the film wisps out instead of flying. */
const LAUNCH_MIN_SCALE = 1.4;
/** Reduced motion shows (and launches) the film at this fixed mid size. */
const REDUCED_SCALE = 1.8;

/** How high a bubble climbs before it pops, and how long the climb takes. */
const RISE = 148;
const FLIGHT_SECONDS = 2.4;

/** Only this many bubbles may be aloft at once; extra holds do nothing. */
const MAX_FLIGHTS = 2;

/**
 * The authored S-path: x drifts through these offsets (mirrored for
 * odd-numbered bubbles so back-to-back flights read apart) while y rises
 * linearly. Hand-set keyframes, no randomness anywhere in the sky.
 */
const PATH_X = [0, 14, -11, 8, 0];
const PATH_TIMES = [0, 0.3, 0.55, 0.8, 1];

/**
 * Fixed droplet fan for the pop — five flecks, biased upward. Reaches are
 * multiples of the bubble radius so a big bubble throws a wider fan.
 */
const DROPLETS = [
  { angle: -115, reach: 1.3, size: 5 },
  { angle: -62, reach: 1.15, size: 4 },
  { angle: -14, reach: 1.25, size: 5 },
  { angle: 58, reach: 1.1, size: 4 },
  { angle: 152, reach: 1.2, size: 4 },
].map(({ angle, reach, size }) => ({
  ux: Math.cos((angle * Math.PI) / 180) * reach,
  uy: Math.sin((angle * Math.PI) / 180) * reach,
  size,
}));

/** Iridescence: a specular sheen and a slow color swirl, both translucent. */
const FILM_SHEEN =
  "radial-gradient(circle at 32% 30%, color-mix(in oklab, var(--primary) 55%, transparent) 0%, color-mix(in oklab, var(--success, #047857) 32%, transparent) 48%, transparent 72%)";
const FILM_SWIRL =
  "conic-gradient(from 220deg, color-mix(in oklab, var(--primary) 45%, transparent), color-mix(in oklab, var(--success, #047857) 40%, transparent) 40%, color-mix(in oklab, var(--primary) 45%, transparent))";
const FILM_RIM =
  "inset 0 0 0 1px color-mix(in oklab, var(--primary) 45%, transparent)";
const POP_RING =
  "inset 0 0 0 1px color-mix(in oklab, var(--primary) 55%, transparent)";
const DROPLET_COLOR =
  "color-mix(in oklab, var(--primary) 65%, var(--success, #047857))";

type FilmBallProps = {
  size: number;
};

/** The soap skin itself — sheen over swirl inside a hairline rim. */
function FilmBall({ size }: FilmBallProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="relative block rounded-full"
      style={{ width: size, height: size, boxShadow: FILM_RIM }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: FILM_SHEEN, opacity: 0.5 }}
      />
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: FILM_SWIRL, opacity: 0.22 }}
      />
    </span>
  );
}

type FlightEntry = {
  id: number;
  size: number;
  popped: boolean;
};

type BubbleFlightProps = {
  entry: FlightEntry;
  motionSafe: boolean;
  /** The rise is over — swap to the pop. */
  onPopped: (id: number) => void;
  /** The pop debris has faded — remove me. */
  onDone: (id: number) => void;
  /** Reduced-motion fade finished — pop and remove in one beat. */
  onFaded: (id: number) => void;
};

/**
 * One released bubble. The climb is a single authored tween — multi-keyframe
 * x with times, linear-ish y — and its completion flips the entry to the pop
 * phase: a fixed droplet fan plus a thin expanding ring, whose fade-out tells
 * the parent to drop the entry. Reduced motion skips the flight entirely and
 * just fades the bubble at its pop position.
 */
function BubbleFlight({
  entry,
  motionSafe,
  onPopped,
  onDone,
  onFaded,
}: BubbleFlightProps): React.JSX.Element {
  const { id, size, popped } = entry;
  const dir = id % 2 === 0 ? 1 : -1;
  const half = size / 2;
  const seat = {
    left: "50%",
    top: RING_CENTER_TOP,
    width: size,
    height: size,
    marginLeft: -half,
    marginTop: -half,
  } as const;

  if (!motionSafe) {
    return (
      <motion.span
        aria-hidden
        className="pointer-events-none absolute"
        style={{ ...seat, y: -RISE }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0.9, 0] }}
        transition={{
          duration: 1.1,
          times: [0, 0.08, 0.5, 1],
          ease: easings.exit,
        }}
        onAnimationComplete={() => onFaded(id)}
      >
        <FilmBall size={size} />
      </motion.span>
    );
  }

  if (!popped) {
    return (
      <motion.span
        aria-hidden
        className="pointer-events-none absolute"
        style={seat}
        initial={{ x: 0, y: 0 }}
        animate={{ x: PATH_X.map((v) => v * dir), y: -RISE }}
        transition={{
          x: { duration: FLIGHT_SECONDS, times: PATH_TIMES, ease: "easeInOut" },
          // A bubble climbs at constant drift; the pop is the accent.
          y: { duration: FLIGHT_SECONDS, ease: easings.linear },
        }}
        onAnimationComplete={() => onPopped(id)}
      >
        <FilmBall size={size} />
      </motion.span>
    );
  }

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={{ ...seat, transform: `translateY(${-RISE}px)` }}
    >
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ boxShadow: POP_RING }}
        initial={{ scale: 0.8, opacity: 0.55 }}
        animate={{ scale: 1.45, opacity: 0 }}
        transition={{ duration: durations.slow, ease: easings.exit }}
        onAnimationComplete={() => onDone(id)}
      />
      {DROPLETS.map((fleck, i) => (
        <motion.span
          key={i}
          className="absolute top-1/2 left-1/2 rounded-full"
          style={{
            width: fleck.size,
            height: fleck.size,
            marginLeft: -fleck.size / 2,
            marginTop: -fleck.size / 2,
            background: DROPLET_COLOR,
          }}
          initial={{ x: 0, y: 0, scale: 0.6, opacity: 0.9 }}
          animate={{
            x: fleck.ux * half,
            y: fleck.uy * half,
            scale: 1,
            opacity: 0,
          }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        />
      ))}
    </span>
  );
}

export type SoapBubbleProps = {
  /** Fires each time a bubble pops. */
  onPop?: () => void;
  className?: string;
};

/**
 * A bubble wand you blow through by holding. Press and hold the wand —
 * pointer or Space/Enter — and a soap film swells from the ring on `drift`,
 * wobbling gently as it grows; release, and the bubble detaches, climbs a
 * fixed gentle S-path, and pops at the top of its rise into a hand-set fan of
 * droplets and a thin ring. Let go while the film is still small and it just
 * wisps out at the ring. Two bubbles may be aloft at once — beyond that,
 * further holds do nothing until one pops. Everything is authored tables and
 * a monotonic counter, so the same blow always flies the same way. Reduced
 * motion: the film appears at a fixed mid size while held, and a released
 * bubble simply appears at its pop position and fades in place — no flight,
 * no droplets.
 */
export function SoapBubble({
  onPop,
  className,
}: SoapBubbleProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [holding, setHolding] = React.useState(false);
  const [flights, setFlights] = React.useState<FlightEntry[]>([]);
  const [wisp, setWisp] = React.useState<{ id: number; size: number } | null>(
    null,
  );
  const [announcement, setAnnouncement] = React.useState("");

  // The film is driven imperatively so release can read its exact scale.
  const filmScale = useMotionValue(FILM_MIN_SCALE);
  const growRef = React.useRef<ReturnType<typeof animate> | null>(null);

  const idRef = React.useRef(0);
  const blowingRef = React.useRef(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const keyHeldRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);

  React.useEffect(() => {
    return () => {
      growRef.current?.stop();
    };
  }, []);

  const inFlight = flights.reduce((n, f) => (f.popped ? n : n + 1), 0);

  const launch = (size: number) => {
    if (inFlight >= MAX_FLIGHTS) return;
    idRef.current += 1;
    const id = idRef.current;
    setFlights((prev) => [...prev, { id, size, popped: false }]);
    setAnnouncement("bubble away");
  };

  const beginBlow = () => {
    if (blowingRef.current) return;
    if (inFlight >= MAX_FLIGHTS) return; // The sky is full — hold does nothing.
    blowingRef.current = true;
    setHolding(true);
    if (!motionSafe) return; // Film renders at a fixed mid size instead.
    growRef.current?.stop();
    filmScale.set(FILM_MIN_SCALE);
    growRef.current = animate(filmScale, FILM_MAX_SCALE, springs.drift);
  };

  const releaseBlow = () => {
    if (!blowingRef.current) return;
    blowingRef.current = false;
    setHolding(false);
    growRef.current?.stop();
    const scale = motionSafe ? filmScale.get() : REDUCED_SCALE;
    if (motionSafe && scale < LAUNCH_MIN_SCALE) {
      // Too small to hold together — it wisps out at the ring.
      idRef.current += 1;
      setWisp({ id: idRef.current, size: FILM_D * scale });
      return;
    }
    launch(FILM_D * Math.min(scale, FILM_MAX_SCALE));
  };

  const abortBlow = () => {
    if (!blowingRef.current) return;
    blowingRef.current = false;
    setHolding(false);
    growRef.current?.stop();
    if (motionSafe) {
      // A hijacked hold never launches — the film quietly wisps out.
      idRef.current += 1;
      setWisp({ id: idRef.current, size: FILM_D * filmScale.get() });
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = event.pointerId;
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginBlow();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    suppressClickRef.current = true;
    releaseBlow();
  };

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    abortBlow();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      keyHeldRef.current = false;
      abortBlow();
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    // Hold-to-blow owns activation — the native click must not double-fire.
    event.preventDefault();
    if (event.repeat || keyHeldRef.current || pointerIdRef.current !== null)
      return;
    keyHeldRef.current = true;
    beginBlow();
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (!keyHeldRef.current) return;
    keyHeldRef.current = false;
    if (pointerIdRef.current !== null) return; // The pointer owns this blow.
    releaseBlow();
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // Assistive tech sends a bare click with no press to hold — blow and
    // release a mid-size bubble in one beat so the wand still answers.
    if (blowingRef.current) return;
    launch(FILM_D * REDUCED_SCALE);
  };

  const handlePopped = (id: number) => {
    setFlights((prev) =>
      prev.map((f) => (f.id === id ? { ...f, popped: true } : f)),
    );
    setAnnouncement("pop");
    onPop?.();
  };

  const handleDone = (id: number) => {
    setFlights((prev) => prev.filter((f) => f.id !== id));
  };

  const handleFaded = (id: number) => {
    setFlights((prev) => prev.filter((f) => f.id !== id));
    setAnnouncement("pop");
    onPop?.();
  };

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div
        className="relative overflow-hidden rounded-3 border border-hairline bg-surface-1"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* The growing film, pinned to the ring center, behind the rim. */}
        {holding && motionSafe && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: "50%",
              top: RING_CENTER_TOP,
              width: FILM_D,
              height: FILM_D,
              marginLeft: -FILM_D / 2,
              marginTop: -FILM_D / 2,
              scale: filmScale,
            }}
          >
            {/* Tiny counter-oscillation — the film is never quite still. */}
            <motion.span
              className="block"
              animate={{ scaleX: [1, 1.05, 1], scaleY: [1, 0.95, 1] }}
              transition={{
                duration: 1.5,
                times: [0, 0.5, 1],
                ease: "easeInOut",
                repeat: Infinity,
              }}
            >
              <FilmBall size={FILM_D} />
            </motion.span>
          </motion.span>
        )}
        {holding && !motionSafe && (
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: "50%",
              top: RING_CENTER_TOP,
              width: FILM_D * REDUCED_SCALE,
              height: FILM_D * REDUCED_SCALE,
              marginLeft: (-FILM_D * REDUCED_SCALE) / 2,
              marginTop: (-FILM_D * REDUCED_SCALE) / 2,
            }}
          >
            <FilmBall size={FILM_D * REDUCED_SCALE} />
          </span>
        )}

        {/* A too-small release: one quick fade at the ring, then it stays
            invisible until the next wisp replaces it by key. */}
        {motionSafe && wisp && (
          <motion.span
            key={wisp.id}
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: "50%",
              top: RING_CENTER_TOP,
              width: wisp.size,
              height: wisp.size,
              marginLeft: -wisp.size / 2,
              marginTop: -wisp.size / 2,
            }}
            initial={{ opacity: 0.5, scale: 1, y: 0 }}
            animate={{ opacity: 0, scale: 1.12, y: -6 }}
            transition={{ duration: durations.fast, ease: easings.exit }}
          >
            <FilmBall size={wisp.size} />
          </motion.span>
        )}

        {/* The wand: ring on a stick, a real hold-to-blow button. */}
        <button
          type="button"
          aria-label="Blow a bubble"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onClick={handleClick}
          className={cn(
            "absolute bottom-2 left-1/2 -translate-x-1/2 touch-none rounded-3 outline-none select-none",
            "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/60",
            !motionSafe && "active:brightness-95",
          )}
        >
          <span aria-hidden className="flex flex-col items-center">
            <span
              className="block rounded-full border-[3px] border-hairline-strong shadow-raised"
              style={{ width: RING_D, height: RING_D }}
            />
            <span
              className="block rounded-full border border-hairline bg-surface-2"
              style={{
                width: 5,
                height: STICK_H,
                marginTop: -STICK_OVERLAP,
              }}
            />
          </span>
        </button>

        {/* Bubbles aloft float over the rim on their way up. */}
        {flights.map((entry) => (
          <BubbleFlight
            key={entry.id}
            entry={entry}
            motionSafe={motionSafe}
            onPopped={handlePopped}
            onDone={handleDone}
            onFaded={handleFaded}
          />
        ))}
      </div>

      <p className="font-mono text-label text-ink-3 select-none">
        hold to blow
      </p>

      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
