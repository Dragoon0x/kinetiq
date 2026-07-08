"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { CipherText } from "@/registry/ui/cipher-text";
import { PressureButton } from "@/registry/ui/pressure-button";

/** One full sweep every 1.8s; blips key their flashes off the same period. */
const SWEEP_SECONDS = 1.8;
const BLIP_FLASH_SECONDS = 0.6;

/** djb2 — deterministic per blip, so SSR and client agree on every position. */
const djb2 = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(hash, 33) + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
};

type Blip = {
  /** % offsets inside the radar square. */
  left: number;
  top: number;
  /** Seconds until the sweep hairline first passes this angle. */
  delay: number;
};

// Hash-derived polar positions, one blip per 120° sector so the sweep meets
// them evenly. Angle 0 is straight up, matching the hairline's start. The
// index leads the hash input so it avalanches through every bit.
const BLIPS: Blip[] = [0, 1, 2].map((index) => {
  const hash = djb2(`${index}:kinetiq-radar-blip`);
  const angle = index * 120 + (hash % 90);
  const reach = 0.3 + ((hash >>> 8) % 32) / 100; // 0.30–0.61 of the radius
  const radians = (angle * Math.PI) / 180;
  return {
    left: 50 + Math.sin(radians) * reach * 50,
    top: 50 - Math.cos(radians) * reach * 50,
    delay: (angle / 360) * SWEEP_SECONDS,
  };
});

// 8 spokes = 4 diameters at 45° steps (viewBox 0 0 200 200, r ≈ 100).
const SPOKES = [
  { x1: 100, y1: 0, x2: 100, y2: 200 },
  { x1: 0, y1: 100, x2: 200, y2: 100 },
  { x1: 29.29, y1: 29.29, x2: 170.71, y2: 170.71 },
  { x1: 170.71, y1: 29.29, x2: 29.29, y2: 170.71 },
] as const;

const subscribeToVisibility = (onStoreChange: () => void): (() => void) => {
  document.addEventListener("visibilitychange", onStoreChange);
  return () =>
    document.removeEventListener("visibilitychange", onStoreChange);
};
const getVisibility = (): boolean => document.visibilityState === "visible";
const getServerVisibility = (): boolean => true;

export type NotFoundProps = {
  /** Where "Return to base" points. */
  homeHref?: string;
  /** Renders the ghost "Open command deck" action when provided. */
  onCommandDeck?: () => void;
  /** The big cipher numeral. */
  code?: string;
  message?: string;
  className?: string;
};

/**
 * "Sweep complete. Sector empty." A 404 staged as a clean radar scan: a
 * 200px sector (3 rings + 8 spokes at `--border`) under a signal-tinted
 * conic sweep that rotates every 1.8s — paused while the tab is hidden —
 * with three hash-placed blips that flash exactly as the hairline passes,
 * phase-locked by delay rather than polling. The code deciphers in via
 * `CipherText` (mount, random order) and the message rises on `glide` about
 * 0.4s later, once the numeral locks. Screen readers get one clean h1
 * ("404 — page not found"); the radar is scenery and stays aria-hidden.
 * Reduced motion freezes the sweep at 45°, parks the blips at low opacity,
 * and shows the message immediately.
 */
export function NotFound({
  homeHref = "/",
  onCommandDeck,
  code = "404",
  message = "This sector scanned clean — the specimen you're after isn't filed here.",
  className,
}: NotFoundProps) {
  const motionSafe = useMotionSafe();
  const pageVisible = React.useSyncExternalStore(
    subscribeToVisibility,
    getVisibility,
    getServerVisibility,
  );
  // House rule for loops: the sweep parks while the document is hidden.
  // Blips and sweep restart from t=0 together, so they stay phase-locked.
  const sweeping = motionSafe && pageVisible;

  return (
    <section
      role="region"
      aria-label="Page not found"
      className={cn("w-full py-12 text-center", className)}
    >
      <p className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
        Sweep complete · Sector empty
      </p>

      <div
        aria-hidden
        className="border-border relative mx-auto mt-6 size-50 overflow-hidden rounded-full border"
      >
        {/* graticule: 3 concentric rings + 8 spokes */}
        <svg
          viewBox="0 0 200 200"
          fill="none"
          className="absolute inset-0 size-full"
        >
          <circle cx="100" cy="100" r="33" stroke="var(--border)" />
          <circle cx="100" cy="100" r="66" stroke="var(--border)" />
          <circle cx="100" cy="100" r="98" stroke="var(--border)" />
          {SPOKES.map((spoke, index) => (
            <line key={index} {...spoke} stroke="var(--border)" />
          ))}
          <circle cx="100" cy="100" r="2" fill="var(--muted-foreground)" />
        </svg>

        {/* sweep: trailing wedge + leading 1px hairline */}
        <motion.div
          className="absolute inset-0"
          initial={false}
          animate={sweeping ? { rotate: [0, 360] } : { rotate: 45 }}
          transition={
            sweeping
              ? { duration: SWEEP_SECONDS, ease: "linear", repeat: Infinity }
              : { duration: 0 }
          }
        >
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, color-mix(in oklab, var(--signal, var(--primary)) 25%, transparent) 360deg)",
            }}
          />
          <span
            className="absolute top-0 left-1/2 h-1/2 w-px -translate-x-1/2"
            style={{ backgroundColor: "var(--signal, var(--primary))" }}
          />
        </motion.div>

        {/* blips flash as the hairline passes — same 1.8s period, offset by angle */}
        {BLIPS.map((blip, index) => (
          <motion.span
            key={index}
            className="absolute size-1.5 rounded-full"
            style={{
              left: `${blip.left}%`,
              top: `${blip.top}%`,
              x: "-50%",
              y: "-50%",
              backgroundColor: "var(--signal, var(--primary))",
            }}
            initial={{ opacity: 0.15, scale: 1 }}
            animate={
              sweeping
                ? { opacity: [1, 0.15], scale: [1.4, 1] }
                : { opacity: 0.35, scale: 1 }
            }
            transition={
              sweeping
                ? {
                    duration: BLIP_FLASH_SECONDS,
                    delay: blip.delay,
                    repeat: Infinity,
                    repeatDelay: SWEEP_SECONDS - BLIP_FLASH_SECONDS,
                    ease: "easeOut",
                  }
                : { duration: 0 }
            }
          />
        ))}
      </div>

      <h1 className="mt-8 text-6xl font-bold tracking-tight">
        <CipherText trigger="mount" order="random">
          {code}
        </CipherText>
        <span className="sr-only"> — page not found</span>
      </h1>

      <motion.p
        className="text-muted-foreground mx-auto mt-3 max-w-sm text-sm text-balance"
        initial={motionSafe ? { opacity: 0, y: distances.step } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? {
                y: { ...springs.glide, delay: 0.4 },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: 0.4,
                },
              }
            : { duration: 0 }
        }
      >
        {message}
      </motion.p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {/* Plain <a> wearing PressureButton's solid/md clothes — links must
            not be hacked into buttons. */}
        <a
          href={homeHref}
          className="bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95 relative inline-flex h-9 items-center justify-center gap-2 rounded-2 px-4 text-sm font-medium whitespace-nowrap select-none"
        >
          Return to base
        </a>
        {onCommandDeck && (
          <PressureButton variant="ghost" onClick={onCommandDeck}>
            Open command deck
          </PressureButton>
        )}
      </div>
    </section>
  );
}
