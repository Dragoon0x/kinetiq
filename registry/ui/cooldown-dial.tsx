"use client";

import * as React from "react";

import { Flame, Shield, Snowflake, Zap } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Ability button footprint, px — a square, per the spec. */
const BUTTON_SIZE = 64;
/** Sweep ring geometry. */
const STROKE_WIDTH = 3;
const RADIUS = 27;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The shared countdown clock's resolution. Every remaining-second readout
 * and every reduced-motion arc step is counted off this interval — never
 * Date.now().
 */
const TICK_MS = 100;

/** Shared lockout after any cast, seconds — the standard anti-mash convention. */
const GLOBAL_LOCK_S = 0.6;

/**
 * Pop targets: springs jump-then-settle, so these are the "from" scale a
 * fresh remount starts at before springing to 1 — never a multi-keyframe animate.
 */
const CAST_POP_SCALE = 1.22;
const READY_POP_FROM = 0.9;

/** How long the mono "ready" flash holds before fading. */
const READY_TEXT_S = 0.9;

export type Ability = {
  id: string;
  name: string;
  hotkey: string;
  seconds: number;
};

const DEFAULT_ABILITIES = [
  { id: "surge", name: "Surge", hotkey: "Q", seconds: 2.5 },
  { id: "cinder", name: "Cinder", hotkey: "W", seconds: 4 },
  { id: "aegis", name: "Aegis", hotkey: "E", seconds: 6 },
  { id: "rime", name: "Rime", hotkey: "R", seconds: 10 },
] as const satisfies readonly Ability[];

export type CooldownDialProps = {
  /** The row's abilities. @default four elemental abilities on Q/W/E/R */
  abilities?: Ability[];
  /** Fires with the ability id the instant a cast is accepted. */
  onCast?: (id: string) => void;
  className?: string;
};

/** A fixed four-glyph rotation, cycled by index — Ability carries no icon
 * field, so every button's glyph is picked this way, never assigned to a
 * variable and rendered as a component reference. */
function abilityGlyph(index: number, className: string): React.ReactNode {
  switch (index % 4) {
    case 0:
      return <Zap aria-hidden className={className} />;
    case 1:
      return <Flame aria-hidden className={className} />;
    case 2:
      return <Shield aria-hidden className={className} />;
    default:
      return <Snowflake aria-hidden className={className} />;
  }
}

/**
 * A row of ability buttons, each carrying its own cooldown duration, so the
 * row settles into a natural polyrhythm as differently-timed sweeps drift in
 * and out of phase with one another. Casting a ready ability instantly fills
 * its radial sweep, then unwinds it on a linear tween keyed to that
 * ability's own duration while the glyph pops on `flick`; every cast also
 * throws the whole row into a brief shared lockout — the standard anti-mash
 * convention — shown as a thin sweep across the group. Completion is its own
 * small event: the button springs back to full brightness on `snap`, a soft
 * ring pulses once, and a mono "ready" flash confirms it. All timing is
 * counted off one shared interval tick, never `Date.now()`, so the remaining
 * seconds and the ready count stay exact regardless of tab throttling; Q, W,
 * E, and R are bound on the group itself, so the keyboard plays exactly like
 * the buttons do.
 * Reduced motion: the unwinding sweep is replaced by a stepped countdown —
 * the arc jumps in coarse increments as the tick advances rather than
 * tweening smoothly — and casts and completions play no pop, ring, or flash.
 */
export function CooldownDial({
  abilities = [...DEFAULT_ABILITIES],
  onCast,
  className,
}: CooldownDialProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement>(null);

  const [remaining, setRemaining] = React.useState<Record<string, number>>({});
  const [castGen, setCastGen] = React.useState<Record<string, number>>({});
  const [readyGen, setReadyGen] = React.useState<Record<string, number>>({});
  const [globalLocked, setGlobalLocked] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const globalSweep = useMotionValue(0);

  // Ledger refs — the source of truth for the tick loop and the cast
  // handler; the state above is only a rendered mirror.
  const tickRef = React.useRef(0);
  const endTicksRef = React.useRef<Map<string, number>>(new Map());
  const globalEndTickRef = React.useRef(0);

  const abilitiesRef = React.useRef(abilities);
  React.useEffect(() => {
    abilitiesRef.current = abilities;
  });
  const onCastRef = React.useRef(onCast);
  React.useEffect(() => {
    onCastRef.current = onCast;
  });

  /** One shared tick: recomputes every ability's remaining seconds off its
   * end-tick ledger, fires the ready transition once per cooldown, and
   * clears the global lockout when its own end tick arrives. */
  const runTick = () => {
    tickRef.current += 1;
    const now = tickRef.current;
    const list = abilitiesRef.current;

    const next: Record<string, number> = {};
    for (const ability of list) {
      const endTick = endTicksRef.current.get(ability.id);
      if (endTick === undefined) {
        next[ability.id] = 0;
        continue;
      }
      const msLeft = Math.max(0, (endTick - now) * TICK_MS);
      const sec = Math.ceil(msLeft / 1000);
      next[ability.id] = sec;
      if (sec <= 0) {
        endTicksRef.current.delete(ability.id);
        setReadyGen((prev) => ({
          ...prev,
          [ability.id]: (prev[ability.id] ?? 0) + 1,
        }));
        setAnnounce(`${ability.name} ready.`);
      }
    }

    setRemaining((prev) => {
      for (const ability of list) {
        if ((prev[ability.id] ?? 0) !== (next[ability.id] ?? 0)) return next;
      }
      return prev;
    });

    if (globalEndTickRef.current > 0 && now >= globalEndTickRef.current) {
      globalEndTickRef.current = 0;
      setGlobalLocked(false);
    }
  };

  // Latest-ref mirror (see cooldown-dial's siblings drum-pads / rhythm-tap):
  // the interval always calls the freshest tick, never a stale closure.
  const runTickRef = React.useRef(runTick);
  React.useEffect(() => {
    runTickRef.current = runTick;
  });

  const anyOnCooldown = Object.values(remaining).some((sec) => sec > 0);
  const anyActive = anyOnCooldown || globalLocked;

  // The clock only runs while something is actually counting down.
  React.useEffect(() => {
    if (!anyActive) return;
    const id = window.setInterval(() => runTickRef.current(), TICK_MS);
    return () => window.clearInterval(id);
  }, [anyActive]);

  /** Accepts a cast: books the cooldown end tick, throws the shared
   * lockout, and reports out. Guards read the ref ledgers directly, never
   * the (possibly one tick stale) rendered state. */
  const cast = (index: number) => {
    const ability = abilitiesRef.current[index];
    if (!ability) return;
    if (endTicksRef.current.has(ability.id)) return;
    if (globalEndTickRef.current > tickRef.current) return;

    const durationTicks = Math.max(
      1,
      Math.round((ability.seconds * 1000) / TICK_MS),
    );
    endTicksRef.current.set(ability.id, tickRef.current + durationTicks);
    const wholeSeconds = Math.max(1, Math.ceil(ability.seconds));
    setRemaining((prev) => ({ ...prev, [ability.id]: wholeSeconds }));
    setCastGen((prev) => ({
      ...prev,
      [ability.id]: (prev[ability.id] ?? 0) + 1,
    }));

    const lockTicks = Math.max(1, Math.round((GLOBAL_LOCK_S * 1000) / TICK_MS));
    globalEndTickRef.current = tickRef.current + lockTicks;
    setGlobalLocked(true);
    if (motionSafe) {
      globalSweep.set(1);
      animate(globalSweep, 0, {
        duration: GLOBAL_LOCK_S,
        ease: easings.linear,
      });
    }

    setAnnounce(`Cast ${ability.name}. Cooling down ${wholeSeconds}s.`);
    onCastRef.current?.(ability.id);
  };

  const castRef = React.useRef(cast);
  React.useEffect(() => {
    castRef.current = cast;
  });

  // The keyboard shortcuts: a listener on the group's own root, so it only
  // ever fires while focus lives inside it (bubbling gives "focus-within"
  // for free) — mounted once, always dispatching through the latest cast.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const key = event.key.toUpperCase();
      const index = abilitiesRef.current.findIndex(
        (a) => a.hotkey.toUpperCase() === key,
      );
      if (index === -1) return;
      event.preventDefault();
      castRef.current(index);
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, []);

  const readyCount = abilities.reduce(
    (n, ability) => n + ((remaining[ability.id] ?? 0) > 0 ? 0 : 1),
    0,
  );

  return (
    <div
      ref={rootRef}
      className={cn("flex flex-col items-center gap-3", className)}
    >
      <div
        role="group"
        aria-label="Abilities"
        className="relative flex gap-2.5 overflow-hidden rounded-3 border border-hairline bg-surface-1 p-2.5"
      >
        {motionSafe && globalLocked && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-2.5 top-1 h-0.5 origin-left rounded-full bg-primary/70"
            style={{ scaleX: globalSweep }}
          />
        )}

        {abilities.map((ability, index) => (
          <AbilityButton
            key={ability.id}
            ability={ability}
            index={index}
            secondsRemaining={remaining[ability.id] ?? 0}
            locked={(remaining[ability.id] ?? 0) > 0 || globalLocked}
            motionSafe={motionSafe}
            castSignal={castGen[ability.id] ?? 0}
            readySignal={readyGen[ability.id] ?? 0}
            onCast={() => cast(index)}
          />
        ))}
      </div>

      <p className="font-mono text-xs text-ink-3 tabular-nums">
        {readyCount} of {abilities.length} ready
      </p>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type AbilityButtonProps = {
  ability: Ability;
  index: number;
  secondsRemaining: number;
  locked: boolean;
  motionSafe: boolean;
  /** Bumped by the parent on every accepted cast for this ability. */
  castSignal: number;
  /** Bumped by the parent the tick its cooldown reaches zero. */
  readySignal: number;
  onCast: () => void;
};

/**
 * One ability button. Owns the single motion value that drives its sweep's
 * `strokeDashoffset` — a hook call fixed to this component instance, so the
 * row above never calls a hook inside its `.map`. A fresh `castSignal` fills
 * the sweep and, motion-safe, unwinds it on a real linear tween over the
 * ability's own duration; reduced motion instead steps the offset directly
 * off the parent's tick-derived `secondsRemaining`, coarse and un-eased.
 */
function AbilityButton({
  ability,
  index,
  secondsRemaining,
  locked,
  motionSafe,
  castSignal,
  readySignal,
  onCast,
}: AbilityButtonProps): React.JSX.Element {
  const dash = useMotionValue(CIRCUMFERENCE);
  const onCooldown = secondsRemaining > 0;

  // Read via a ref inside the cast-tween effect below so a live OS-level
  // motion-preference toggle mid-cooldown can never re-fire it and snap the
  // sweep back to full — only a genuine new cast does that.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  });

  React.useEffect(() => {
    if (castSignal === 0) return;
    dash.set(0);
    if (!motionSafeRef.current) return;
    const controls = animate(dash, CIRCUMFERENCE, {
      duration: ability.seconds,
      ease: easings.linear,
    });
    return () => controls.stop();
  }, [castSignal, ability.seconds, dash]);

  React.useEffect(() => {
    if (motionSafe) return;
    if (secondsRemaining <= 0) {
      dash.set(CIRCUMFERENCE);
      return;
    }
    const totalMs = ability.seconds * 1000;
    const elapsedMs = Math.max(0, totalMs - secondsRemaining * 1000);
    const frac = totalMs > 0 ? Math.min(1, elapsedMs / totalMs) : 1;
    dash.set(frac * CIRCUMFERENCE);
  }, [secondsRemaining, motionSafe, ability.seconds, dash]);

  return (
    <motion.button
      type="button"
      aria-label={`Cast ${ability.name}`}
      disabled={locked}
      onClick={onCast}
      whileTap={motionSafe && !locked ? { scale: 0.94 } : undefined}
      transition={springs.flick}
      className={cn(
        "relative flex touch-manipulation flex-col items-center justify-center overflow-hidden rounded-3 border transition-opacity duration-200 outline-none select-none",
        "disabled:cursor-not-allowed",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        locked
          ? "border-hairline bg-surface-2 opacity-45"
          : "border-hairline-strong bg-surface-2 opacity-100",
      )}
      style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}
    >
      {/* Radial sweep — rotated via a plain HTML wrapper, never via
          transformOrigin on the motion SVG child itself. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -rotate-90"
      >
        <svg
          width={BUTTON_SIZE}
          height={BUTTON_SIZE}
          viewBox={`0 0 ${BUTTON_SIZE} ${BUTTON_SIZE}`}
        >
          <circle
            cx={BUTTON_SIZE / 2}
            cy={BUTTON_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--hairline)"
            strokeWidth={STROKE_WIDTH}
          />
          <motion.circle
            cx={BUTTON_SIZE / 2}
            cy={BUTTON_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{ strokeDashoffset: dash, opacity: 0.85 }}
          />
        </svg>
      </div>

      {motionSafe && readySignal > 0 && (
        <motion.span
          key={`ring-${readySignal}`}
          aria-hidden
          className="pointer-events-none absolute inset-1 rounded-2 border border-hairline-strong"
          initial={{ scale: 0.85, opacity: 0.6 }}
          animate={{ scale: 1.35, opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        />
      )}

      {motionSafe && castSignal > 0 && (
        <motion.span
          key={`flash-${castSignal}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-primary-foreground/20"
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.base, ease: easings.exit }}
        />
      )}

      <motion.div
        key={motionSafe ? `pop-${readySignal}` : "static-pop"}
        initial={
          motionSafe && readySignal > 0 ? { scale: READY_POP_FROM } : false
        }
        animate={{ scale: 1 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        className="relative flex flex-col items-center justify-center gap-0.5"
      >
        <motion.div
          key={motionSafe ? `glyph-${castSignal}` : "static-glyph"}
          initial={
            motionSafe && castSignal > 0 ? { scale: CAST_POP_SCALE } : false
          }
          animate={{ scale: 1 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        >
          {abilityGlyph(
            index,
            cn("size-5", locked ? "text-ink-3" : "text-ink"),
          )}
        </motion.div>
        <span className="text-label text-ink-3">{ability.hotkey}</span>
      </motion.div>

      <AnimatePresence>
        {onCooldown && (
          <motion.span
            key="countdown"
            aria-hidden
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="rounded-2 bg-surface-2/90 px-1.5 py-0.5 font-mono text-sm font-semibold text-ink tabular-nums">
              {secondsRemaining}
            </span>
          </motion.span>
        )}
      </AnimatePresence>

      {motionSafe && readySignal > 0 && (
        <motion.span
          key={`readytext-${readySignal}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold tracking-[0.1em] text-success uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          transition={{
            duration: READY_TEXT_S,
            times: [0, 0.12, 0.7, 1],
            ease: easings.exit,
          }}
        >
          ready
        </motion.span>
      )}
    </motion.button>
  );
}
