"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { BandType } from "@/registry/ui/band-type";
import { CipherText } from "@/registry/ui/cipher-text";
import { EchoType } from "@/registry/ui/echo-type";
import { ElasticType } from "@/registry/ui/elastic-type";
import { PressureButton } from "@/registry/ui/pressure-button";
import { VoronoiShatter } from "@/registry/ui/voronoi-shatter";

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
  return () => document.removeEventListener("visibilitychange", onStoreChange);
};
const getVisibility = (): boolean => document.visibilityState === "visible";
const getServerVisibility = (): boolean => true;

export type NotFoundFace =
  "radar" | "shatter" | "elastic" | "echo" | "bands" | "spotlight";

/**
 * The radar face's own rendered height: the 200px circle (`size-50`), the
 * 32px gap above the numeral (`mt-8`), and one `text-6xl` line (60px at
 * line-height 1). The other faces reserve this same span so switching faces
 * never reflows the message and buttons beneath the stage.
 */
const STAGE_HEIGHT = 200 + 32 + 60;

/** Cursor-following spotlight radius for the numeral, in px. */
const SPOTLIGHT_RADIUS = 48;

export type NotFoundProps = {
  /** Where "Return to base" points. */
  homeHref?: string;
  /** Renders the ghost "Open command deck" action when provided. */
  onCommandDeck?: () => void;
  /** The big cipher numeral. */
  code?: string;
  message?: string;
  /** Which treatment renders the numeral stage. @default "radar" */
  face?: NotFoundFace;
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
 *
 * The numeral stage also answers to `face`: `radar` (the default, described
 * above), `shatter`, `elastic`, `echo`, `bands`, and `spotlight` each swap
 * only that stage, leaving the copy, suggestions, and exits untouched.
 */
export function NotFound({
  homeHref = "/",
  onCommandDeck,
  code = "404",
  message = "This sector scanned clean — the specimen you're after isn't filed here.",
  face = "radar",
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

  // Chosen with a switch that returns elements — never a `faces[face]`
  // lookup — so no component identity ever depends on `face`. The radar
  // branch is the original markup, untouched, so its output stays identical
  // to before `face` existed.
  const renderStage = (): React.ReactNode => {
    switch (face) {
      case "shatter":
        return (
          <Stage>
            <div aria-hidden className="relative w-full max-w-[240px]">
              <VoronoiShatter cells={24} height={220} />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-bold tracking-tight text-ink">
                {code}
              </span>
            </div>
            <h1 className="sr-only">
              {code}
              <span> — page not found</span>
            </h1>
          </Stage>
        );
      case "elastic":
        return (
          <Stage>
            <h1 className="text-6xl font-bold tracking-tight">
              <ElasticType text={code} as="span" />
              <span className="sr-only"> — page not found</span>
            </h1>
          </Stage>
        );
      case "echo":
        return (
          <Stage>
            <h1 className="text-6xl font-bold tracking-tight">
              <EchoType text={code} echoes={6} as="span" />
              <span className="sr-only"> — page not found</span>
            </h1>
          </Stage>
        );
      case "bands":
        return (
          <Stage>
            <h1 className="text-6xl font-bold tracking-tight">
              <BandType text={code} bands={9} as="span" />
              <span className="sr-only"> — page not found</span>
            </h1>
          </Stage>
        );
      case "spotlight":
        return (
          <Stage>
            <h1 className="text-6xl font-bold tracking-tight">
              <SpotlightNumeral code={code} radius={SPOTLIGHT_RADIUS} />
              <span className="sr-only"> — page not found</span>
            </h1>
          </Stage>
        );
      default:
        // "radar" — identical to the block's original, single-face markup.
        return (
          <>
            <div
              aria-hidden
              className="relative mx-auto mt-6 size-50 overflow-hidden rounded-full border border-border"
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
                <circle
                  cx="100"
                  cy="100"
                  r="2"
                  fill="var(--muted-foreground)"
                />
              </svg>

              {/* sweep: trailing wedge + leading 1px hairline */}
              <motion.div
                className="absolute inset-0"
                initial={false}
                animate={sweeping ? { rotate: [0, 360] } : { rotate: 45 }}
                transition={
                  sweeping
                    ? {
                        duration: SWEEP_SECONDS,
                        ease: "linear",
                        repeat: Infinity,
                      }
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
          </>
        );
    }
  };

  return (
    <section
      role="region"
      aria-label="Page not found"
      className={cn("w-full py-12 text-center", className)}
    >
      <p className="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        Sweep complete · Sector empty
      </p>

      {renderStage()}

      <motion.p
        className="mx-auto mt-3 max-w-sm text-sm text-balance text-muted-foreground"
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
          className="relative inline-flex h-9 items-center justify-center gap-2 rounded-2 bg-primary px-4 text-sm font-medium whitespace-nowrap text-primary-foreground select-none hover:bg-primary/90 active:bg-primary/95"
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

/**
 * Shared shell for every non-radar face: centers the face's numeral inside a
 * box reserving `STAGE_HEIGHT` (the radar's own circle-plus-numeral span), so
 * swapping faces never shifts the message or buttons below it.
 */
function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center justify-center"
      style={{ minHeight: STAGE_HEIGHT }}
    >
      {children}
    </div>
  );
}

type SpotlightNumeralProps = {
  code: string;
  radius?: number;
};

/**
 * The `spotlight` face's numeral: footer-spotlight-mark's cursor-following
 * idiom reimplemented locally at numeral scale — a hollow, stroked-only base
 * layer under a solid copy clipped to a `circle()` that chases the pointer.
 * The centre retargets on `snap` per pointer move; the radius opens on
 * `glide` at entry and recoils shut on leave via `recoil`. All three hooks
 * live here, in their own component, so the block's own hook order never
 * changes when `face` changes. Reduced motion: the clip and pointer handling
 * both no-op and the solid layer renders at a flat low opacity, unclipped —
 * identical on server and first client render, matching the mark row this
 * is drawn from.
 */
function SpotlightNumeral({
  code,
  radius = SPOTLIGHT_RADIUS,
}: SpotlightNumeralProps) {
  const motionSafe = useMotionSafe();
  const wrapperRef = React.useRef<HTMLSpanElement>(null);

  const x = useMotionValue<number>(0);
  const y = useMotionValue<number>(0);
  const r = useMotionValue<number>(0);

  const clip = useTransform(
    [x, y, r],
    ([cx, cy, cr]: number[]) => `circle(${cr}px at ${cx}px ${cy}px)`,
  );

  const focus = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!motionSafe) return;
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    animate(x, event.clientX - rect.left, springs.snap);
    animate(y, event.clientY - rect.top, springs.snap);
  };

  const open = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!motionSafe) return;
    focus(event);
    animate(r, radius, springs.glide);
  };

  const close = () => {
    if (!motionSafe) return;
    animate(r, 0, springs.recoil);
  };

  return (
    <span
      ref={wrapperRef}
      aria-label={code}
      onPointerEnter={open}
      onPointerMove={focus}
      onPointerLeave={close}
      onPointerDown={open}
      onPointerUp={close}
      className="relative inline-block touch-none select-none"
    >
      <span
        aria-hidden
        style={{ color: "transparent", WebkitTextStroke: "1px var(--ink-3)" }}
        className="block"
      >
        {code}
      </span>
      <motion.span
        aria-hidden
        style={{
          clipPath: motionSafe ? clip : "none",
          opacity: motionSafe ? 1 : 0.18,
        }}
        className="pointer-events-none absolute inset-0 block text-ink"
      >
        {code}
      </motion.span>
    </span>
  );
}
