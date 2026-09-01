"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

/** Health percent under which the fill goes to warning tint and pulses. */
const LOW_HEALTH_PCT = 30;
/** Health damage at or above this share of max counts as a "big" hit —
 * bigger number, a shake, and flecks. */
const BIG_HIT_PCT = 15;

/** Fixed heal amount per press — separate from `hit`, which only governs
 * damage, so a consumer can tune offence and recovery independently. */
const HEAL_AMOUNT = 24;
/** Fixed shield top-up per press. */
const SHIELD_ADD_AMOUNT = 15;

/** How long the chip-damage ghost holds at the old value before it drains
 * (or, reduced motion, before it simply disappears). */
const CHIP_HOLD_MS = 450;
const CHIP_DRAIN_S = 0.5;
/** How long a reduced-motion damage number stays up before clearing. */
const POP_STATIC_MS = 650;

const SHARD_COUNT = 5;
const SHARD_SPREAD = 22;
/** Five fixed shard vectors thrown full-circle from the break point —
 * deterministic, so every shatter looks identical. No Math.random. */
const SHIELD_SHARDS = Array.from({ length: SHARD_COUNT }, (_, i) => {
  const angle = (i / SHARD_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SHARD_SPREAD,
    dy: Math.sin(angle) * SHARD_SPREAD * 0.7,
  };
});

const FLECK_COUNT = 6;
const FLECK_SPREAD = 18;
/** Six fixed fleck vectors thrown from the damage number on a big hit. */
const BIG_HIT_FLECKS = Array.from({ length: FLECK_COUNT }, (_, i) => {
  const angle = (i / FLECK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * FLECK_SPREAD,
    dy: Math.sin(angle) * FLECK_SPREAD,
  };
});

/** Three-keyframe shake tween for a big hit — a single jolt and back. */
const SHAKE_KEYFRAMES = [0, -8, 0] as const;
const SHAKE_TIMES = [0, 0.35, 1] as const;

const SHIELD_TINT = "color-mix(in oklab, var(--primary) 50%, transparent)";
const CRACK_COLOR =
  "color-mix(in oklab, var(--primary) 65%, var(--primary-foreground))";
const SHARD_COLOR =
  "color-mix(in oklab, var(--primary) 78%, var(--primary-foreground))";
const FLASH_COLOR =
  "color-mix(in oklab, var(--primary-foreground) 92%, transparent)";
const GHOST_COLOR =
  "color-mix(in oklab, var(--primary-foreground) 90%, transparent)";
const FLECK_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 75%, var(--primary-foreground))";
const RING_COLOR =
  "color-mix(in oklab, var(--success, #047857) 60%, transparent)";

const healthFillColor = (low: boolean): string =>
  low
    ? "color-mix(in oklab, var(--warning, #b45309) 82%, var(--card))"
    : "color-mix(in oklab, var(--success, #047857) 82%, var(--card))";

type PopKind = "shield" | "health";
type Pop = { key: number; amount: number; kind: PopKind; big: boolean };
type Crack = { key: number; atPct: number };
type Shatter = { key: number; atPct: number };

export type HealthShieldProps = {
  /** Health pool ceiling. @default 100 */
  max?: number;
  /** Starting health. @default 78 */
  start?: number;
  /** Starting (and maximum) shield pool — absorbs damage before health. @default 30 */
  shield?: number;
  /** Damage applied per "Take damage" press. @default 22 */
  hit?: number;
  /** Fires whenever a damage press lands, regardless of what it hits. */
  onDown?: () => void;
  className?: string;
};

/**
 * A health bar that fights back. Damage lands on the shield first — it
 * shrinks on `flick` with a crack flash along its edge, and once it is spent
 * the layer shatters into five shards before the remainder carries into
 * health. Every point of health lost leaves a white chip-damage ghost
 * sitting at the old value while the true fill springs down beneath it —
 * the single clearest read of how much a hit just cost — and the ghost
 * drains away a beat later. Below 30% the fill shifts to a warning tint and
 * the whole bar takes on a slow pulse, big hits shake the bar and throw
 * flecks, and hitting zero empties the bar, desaturates the panel, and
 * swaps in a "down" caption until "revive" springs half the health back
 * with a ring. Heal fills on `glide` with a soft upward shimmer and refuses
 * to overheal past max with a small bounce.
 * Reduced motion: bars snap straight to their targets, the chip ghost
 * appears then disappears on a timer instead of draining, damage numbers
 * appear static for a beat, and the shatter, flecks, shake, and low-health
 * pulse are all skipped.
 */
export function HealthShield({
  max = 100,
  start = 78,
  shield = 30,
  hit = 22,
  onDown,
  className,
}: HealthShieldProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const pctFor = (value: number): number => clamp((value / max) * 100, 0, 100);

  const [health, setHealth] = React.useState(() => clamp(start, 0, max));
  const [shieldPoints, setShieldPoints] = React.useState(() =>
    Math.max(0, shield),
  );
  const [chipActive, setChipActive] = React.useState(false);
  const [pop, setPop] = React.useState<Pop | null>(null);
  const [crack, setCrack] = React.useState<Crack | null>(null);
  const [shatter, setShatter] = React.useState<Shatter | null>(null);
  const [healShimmerKey, setHealShimmerKey] = React.useState(0);
  const [reviveRingKey, setReviveRingKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const isDead = health <= 0;
  const lowHealth = !isDead && health / max < LOW_HEALTH_PCT / 100;

  // Refs are the source of truth inside handlers and timers, so a rapid
  // click chain or a delayed callback never acts on a stale closure.
  const healthRef = React.useRef(health);
  const shieldRef = React.useRef(shieldPoints);
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onDownRef = React.useRef(onDown);
  React.useEffect(() => {
    onDownRef.current = onDown;
  }, [onDown]);

  const popSeqRef = React.useRef(0);
  const crackSeqRef = React.useRef(0);
  const shatterSeqRef = React.useRef(0);

  const healthPercent = useMotionValue<number>(pctFor(start));
  const shieldPercent = useMotionValue<number>(pctFor(shield));
  const ghostPercent = useMotionValue<number>(pctFor(start));
  const shakeX = useMotionValue<number>(0);
  const capBounceX = useMotionValue<number>(1);

  const healthWidth = useTransform(healthPercent, (v) => `${v}%`);
  const shieldWidth = useTransform(shieldPercent, (v) => `${v}%`);
  const ghostWidth = useTransform(ghostPercent, (v) => `${v}%`);

  const healthAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shieldAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const ghostAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shakeAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const capBounceAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const chipTimer = React.useRef<number | null>(null);
  const popTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (chipTimer.current !== null) window.clearTimeout(chipTimer.current);
      if (popTimer.current !== null) window.clearTimeout(popTimer.current);
      healthAnim.current?.stop();
      shieldAnim.current?.stop();
      ghostAnim.current?.stop();
      shakeAnim.current?.stop();
      capBounceAnim.current?.stop();
    };
  }, []);

  const firePop = (data: Omit<Pop, "key">) => {
    popSeqRef.current += 1;
    if (popTimer.current !== null) {
      window.clearTimeout(popTimer.current);
      popTimer.current = null;
    }
    setPop({ ...data, key: popSeqRef.current });
    if (!motionSafeRef.current) {
      popTimer.current = window.setTimeout(() => {
        popTimer.current = null;
        setPop(null);
      }, POP_STATIC_MS);
    }
  };

  const triggerShake = () => {
    shakeAnim.current?.stop();
    shakeAnim.current = animate(shakeX, [...SHAKE_KEYFRAMES], {
      duration: durations.base,
      ease: easings.move,
      times: [...SHAKE_TIMES],
    });
  };

  /** Applies damage to health: chip ghost, spring drop, floating number,
   * and — over threshold — a shake and flecks. */
  const applyHealthDamage = (amount: number) => {
    const oldHealth = healthRef.current;
    const newHealth = Math.max(0, oldHealth - amount);
    healthRef.current = newHealth;
    setHealth(newHealth);

    const oldPct = pctFor(oldHealth);
    const newPct = pctFor(newHealth);

    if (chipTimer.current !== null) {
      window.clearTimeout(chipTimer.current);
      chipTimer.current = null;
    }
    ghostAnim.current?.stop();
    healthAnim.current?.stop();

    if (motionSafeRef.current) {
      ghostPercent.jump(oldPct);
      setChipActive(true);
      healthAnim.current = animate(healthPercent, newPct, springs.flick);
      chipTimer.current = window.setTimeout(() => {
        chipTimer.current = null;
        ghostAnim.current = animate(ghostPercent, newPct, {
          duration: CHIP_DRAIN_S,
          ease: easings.exit,
          onComplete: () => setChipActive(false),
        });
      }, CHIP_HOLD_MS);
    } else {
      healthPercent.jump(newPct);
      ghostPercent.jump(oldPct);
      setChipActive(true);
      chipTimer.current = window.setTimeout(() => {
        chipTimer.current = null;
        setChipActive(false);
      }, CHIP_HOLD_MS);
    }

    const big = amount >= (BIG_HIT_PCT / 100) * max;
    firePop({ amount, kind: "health", big });
    if (motionSafeRef.current && big) triggerShake();

    setAnnounce(
      newHealth <= 0
        ? `Took ${amount} damage. Down.`
        : `Took ${amount} damage. Health ${newHealth} of ${max}.`,
    );
  };

  const handleDamage = () => {
    if (isDead) return;
    onDownRef.current?.();

    const amount = hit;
    const currentShield = shieldRef.current;

    if (currentShield <= 0) {
      applyHealthDamage(amount);
      return;
    }

    if (currentShield >= amount) {
      const nextShield = currentShield - amount;
      shieldRef.current = nextShield;
      setShieldPoints(nextShield);
      const nextPct = pctFor(nextShield);

      shieldAnim.current?.stop();
      if (motionSafeRef.current) {
        shieldAnim.current = animate(shieldPercent, nextPct, springs.flick);
        crackSeqRef.current += 1;
        setCrack({ key: crackSeqRef.current, atPct: nextPct });
      } else {
        shieldPercent.jump(nextPct);
      }
      firePop({ amount, kind: "shield", big: false });
      setAnnounce(
        `Shield absorbed ${amount}. Shield ${nextShield} of ${shield}.`,
      );
      return;
    }

    const remainder = amount - currentShield;
    const brokenAtPct = pctFor(currentShield);
    shieldRef.current = 0;
    setShieldPoints(0);

    shieldAnim.current?.stop();
    if (motionSafeRef.current) {
      shieldAnim.current = animate(shieldPercent, 0, {
        duration: durations.fast,
        ease: easings.exit,
      });
      shatterSeqRef.current += 1;
      setShatter({ key: shatterSeqRef.current, atPct: brokenAtPct });
    } else {
      shieldPercent.jump(0);
    }

    applyHealthDamage(remainder);
  };

  const handleHeal = () => {
    if (isDead) return;
    const oldHealth = healthRef.current;

    if (oldHealth >= max) {
      if (motionSafeRef.current) {
        capBounceAnim.current?.stop();
        capBounceX.jump(1.015);
        capBounceAnim.current = animate(capBounceX, 1, springs.recoil);
      }
      setAnnounce("Health already full.");
      return;
    }

    const newHealth = Math.min(max, oldHealth + HEAL_AMOUNT);
    healthRef.current = newHealth;
    setHealth(newHealth);
    const newPct = pctFor(newHealth);

    if (chipTimer.current !== null) {
      window.clearTimeout(chipTimer.current);
      chipTimer.current = null;
    }
    ghostAnim.current?.stop();
    setChipActive(false);
    ghostPercent.jump(newPct);

    healthAnim.current?.stop();
    if (motionSafeRef.current) {
      healthAnim.current = animate(healthPercent, newPct, springs.glide);
      setHealShimmerKey((k) => k + 1);
    } else {
      healthPercent.jump(newPct);
    }

    setAnnounce(`Healed. Health ${newHealth} of ${max}.`);
  };

  const handleAddShield = () => {
    if (isDead) return;
    const oldShield = shieldRef.current;

    if (oldShield >= shield) {
      if (motionSafeRef.current) {
        capBounceAnim.current?.stop();
        capBounceX.jump(1.015);
        capBounceAnim.current = animate(capBounceX, 1, springs.recoil);
      }
      setAnnounce("Shield already full.");
      return;
    }

    const newShield = Math.min(shield, oldShield + SHIELD_ADD_AMOUNT);
    shieldRef.current = newShield;
    setShieldPoints(newShield);
    const newPct = pctFor(newShield);

    shieldAnim.current?.stop();
    if (motionSafeRef.current) {
      shieldAnim.current = animate(shieldPercent, newPct, springs.flick);
    } else {
      shieldPercent.jump(newPct);
    }

    setAnnounce(`Shield added. Shield ${newShield} of ${shield}.`);
  };

  const handleRevive = () => {
    if (!isDead) return;
    const newHealth = Math.max(1, Math.round(max / 2));
    healthRef.current = newHealth;
    setHealth(newHealth);
    const newPct = pctFor(newHealth);

    if (chipTimer.current !== null) {
      window.clearTimeout(chipTimer.current);
      chipTimer.current = null;
    }
    ghostAnim.current?.stop();
    setChipActive(false);
    ghostPercent.jump(newPct);

    healthAnim.current?.stop();
    if (motionSafeRef.current) {
      healthAnim.current = animate(healthPercent, newPct, springs.glide);
      setReviveRingKey((k) => k + 1);
    } else {
      healthPercent.jump(newPct);
    }

    setAnnounce(`Revived. Health ${newHealth} of ${max}.`);
  };

  const disabled = isDead;
  const shieldLabel =
    shieldPoints > 0 ? `shield ${shieldPoints}/${shield}` : null;

  return (
    <div
      role="group"
      aria-label="Health shield"
      className={cn(
        "w-80 rounded-4 border border-hairline p-5 transition-[filter] duration-300",
        className,
      )}
      style={{ filter: isDead ? "grayscale(1)" : "grayscale(0)" }}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 font-mono text-[11px] font-semibold text-ink-2"
        >
          HS
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
              unit
            </span>
            <Readout
              value={health}
              format={(v) => `${Math.round(v)}/${max}`}
              size="sm"
            />
          </div>

          <motion.div
            className="relative mt-1.5 h-4 w-full origin-left overflow-hidden rounded-2 bg-surface-2"
            style={{ x: shakeX, scaleX: capBounceX }}
          >
            {chipActive && (
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0"
                style={{ width: ghostWidth, backgroundColor: GHOST_COLOR }}
              />
            )}

            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-0 transition-colors duration-300"
              style={{
                width: healthWidth,
                backgroundColor: healthFillColor(lowHealth),
              }}
              animate={
                motionSafe && lowHealth
                  ? {
                      opacity: [1, 0.6, 1],
                      transition: {
                        duration: durations.page,
                        ease: easings.move,
                        times: [0, 0.5, 1],
                        repeat: Infinity,
                      },
                    }
                  : { opacity: 1 }
              }
            />

            {motionSafe && healShimmerKey > 0 && (
              <motion.span
                key={healShimmerKey}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-full"
                style={{
                  background:
                    "linear-gradient(0deg, transparent, color-mix(in oklab, var(--primary-foreground) 55%, transparent), transparent)",
                }}
                initial={{ y: "0%", opacity: 0 }}
                animate={{ y: "-100%", opacity: [0, 1, 0] }}
                transition={{
                  duration: durations.page,
                  ease: easings.move,
                  times: [0, 0.5, 1],
                }}
              />
            )}

            <motion.span
              aria-hidden
              className="absolute inset-y-0 left-0"
              style={{ width: shieldWidth, backgroundColor: SHIELD_TINT }}
            />

            {motionSafe && crack && (
              <motion.span
                key={crack.key}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-0.5"
                style={{
                  left: `${crack.atPct}%`,
                  marginLeft: -1,
                  backgroundColor: CRACK_COLOR,
                }}
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: durations.fast, ease: easings.exit }}
              />
            )}

            {motionSafe && shatter && (
              <span key={shatter.key} aria-hidden className="absolute inset-0">
                <motion.span
                  className="pointer-events-none absolute inset-y-0"
                  style={{
                    left: 0,
                    width: `${shatter.atPct}%`,
                    backgroundColor: FLASH_COLOR,
                  }}
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: durations.blink, ease: easings.exit }}
                />
                <span
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2"
                  style={{ left: `${shatter.atPct}%`, marginLeft: -1 }}
                >
                  {SHIELD_SHARDS.map((v, i) => (
                    <motion.span
                      key={i}
                      className="absolute size-[3px] rounded-full"
                      style={{ background: SHARD_COLOR }}
                      initial={{ x: 0, y: 0, opacity: 1 }}
                      animate={{ x: v.dx, y: v.dy, opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  ))}
                </span>
              </span>
            )}

            {pop && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                {motionSafe ? (
                  <motion.span
                    key={pop.key}
                    className={cn(
                      "block font-mono font-semibold whitespace-nowrap",
                      pop.big ? "text-sm" : "text-[11px]",
                      pop.kind === "shield" ? "text-ink" : "text-ink-2",
                    )}
                    style={
                      pop.kind === "shield" ? { color: CRACK_COLOR } : undefined
                    }
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 0, y: -24 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  >
                    -{pop.amount}
                  </motion.span>
                ) : (
                  <span
                    className={cn(
                      "block font-mono font-semibold whitespace-nowrap",
                      pop.big ? "text-sm" : "text-[11px]",
                      pop.kind === "shield" ? "text-ink" : "text-ink-2",
                    )}
                    style={
                      pop.kind === "shield" ? { color: CRACK_COLOR } : undefined
                    }
                  >
                    -{pop.amount}
                  </span>
                )}
                {motionSafe && pop.big && (
                  <span
                    key={`${pop.key}-flecks`}
                    className="pointer-events-none absolute top-0 left-0"
                  >
                    {BIG_HIT_FLECKS.map((v, i) => (
                      <motion.span
                        key={i}
                        className="absolute size-[3px] rounded-full"
                        style={{ background: FLECK_COLOR }}
                        initial={{ x: 0, y: 0, opacity: 1 }}
                        animate={{ x: v.dx, y: v.dy, opacity: 0 }}
                        transition={{
                          duration: durations.slow,
                          ease: easings.exit,
                        }}
                      />
                    ))}
                  </span>
                )}
              </span>
            )}
          </motion.div>

          <div className="mt-1 flex h-3.5 items-center justify-between gap-2">
            <span className="flex h-3.5 items-center overflow-hidden font-mono text-[10px] text-ink-3">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isDead ? "down" : (shieldLabel ?? "idle")}
                  initial={motionSafe ? { opacity: 0, y: 3 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    motionSafe
                      ? {
                          opacity: 0,
                          y: -3,
                          transition: {
                            duration: durations.fast,
                            ease: easings.exit,
                          },
                        }
                      : { opacity: 0, transition: { duration: 0 } }
                  }
                  transition={
                    motionSafe
                      ? { duration: durations.base, ease: easings.enter }
                      : { duration: 0 }
                  }
                  className={cn(isDead && "font-semibold text-ink-2 uppercase")}
                >
                  {isDead ? "down" : (shieldLabel ?? " ")}
                </motion.span>
              </AnimatePresence>
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Take damage"
          onClick={handleDamage}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-2 py-1.5 text-xs font-semibold shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--warning, #b45309) 88%, var(--card))",
            color: "var(--primary-foreground)",
          }}
        >
          Damage
        </button>
        <button
          type="button"
          aria-label="Heal"
          onClick={handleHeal}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-2 py-1.5 text-xs font-semibold shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--success, #047857) 88%, var(--card))",
            color: "var(--primary-foreground)",
          }}
        >
          Heal
        </button>
        <button
          type="button"
          aria-label="Add shield"
          onClick={handleAddShield}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-2 py-1.5 text-xs font-semibold shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
          style={{
            backgroundColor:
              "color-mix(in oklab, var(--primary) 88%, var(--card))",
            color: "var(--primary-foreground)",
          }}
        >
          Shield
        </button>
      </div>

      {isDead && (
        <span className="relative mt-3 inline-flex self-start">
          <button
            type="button"
            onClick={handleRevive}
            className="hover:text-ink-1 font-mono text-xs font-medium text-ink-2 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
          >
            revive
          </button>
          {motionSafe && reviveRingKey > 0 && (
            <motion.span
              key={reviveRingKey}
              aria-hidden
              className="pointer-events-none absolute inset-0 -m-1 rounded-full border-2"
              style={{ borderColor: RING_COLOR }}
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 2.2, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}
        </span>
      )}

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
