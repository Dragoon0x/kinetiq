"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, mapRange, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type DollyFrameProps = {
  /** The held foreground plate — pinned at center while the vista rushes. */
  subject: React.ReactNode;
  /**
   * The vista behind the subject. Defaults to the built-in corridor:
   * receding arch frames, a converging floor fan, and seeded wall sconces.
   */
  backdrop?: React.ReactNode;
  /** Stage height in px. @default 280 */
  height?: number;
  /** Fires with dolly progress 0..1, deduped to steps of 0.05. */
  onDolly?: (progress: number) => void;
  className?: string;
  "aria-label"?: string;
};

/** The scroll track is this many stages tall — two stages of dolly travel. */
const TRACK_FACTOR = 3;
/** Reduced motion pins the visual dolly mid-push. */
const REST_P = 0.5;

/* Pure dolly curves, shared by the live transforms and the reduced-motion frame. */
const backdropScaleAt = (p: number): number => 1 + p * 0.55;
const backdropYAt = (p: number): string => `${p * -4}%`;
const subjectScaleAt = (p: number): number => 1 + p * 0.04;
const vignetteAt = (p: number): number => mapRange(p, 0, 1, 0.15, 0.5);
const barHeightAt = (p: number): string => `${4 + p * 3}%`;
const focalAt = (p: number): number => Math.round(mapRange(p, 0, 1, 24, 85));
const archScaleAt = (p: number, base: number, depth: number): number =>
  base * (1 + p * (0.25 + depth * 0.18));

/**
 * Corridor arches, outermost to deepest. Deeper arches ride a faster scale
 * multiplier — that differential is what sells the vertigo.
 */
const ARCHES = [
  { base: 1, depth: 0, stroke: "oklch(0.74 0.025 262 / 0.55)" },
  { base: 0.85, depth: 1, stroke: "oklch(0.74 0.025 262 / 0.4)" },
  { base: 0.7, depth: 2, stroke: "oklch(0.74 0.025 262 / 0.28)" },
  { base: 0.55, depth: 3, stroke: "oklch(0.74 0.025 262 / 0.18)" },
] as const;

type Arch = (typeof ARCHES)[number];

/** One-point floor fan — hairlines converging from the bottom corners inward. */
const FLOOR_LINES = [
  { left: "0%", rotate: 52, opacity: 0.3 },
  { left: "0%", rotate: 27, opacity: 0.22 },
  { left: "50%", rotate: 0, opacity: 0.15 },
  { left: "100%", rotate: -27, opacity: 0.22 },
  { left: "100%", rotate: -52, opacity: 0.3 },
] as const;

/** Wall sconces, two per side — seeded so every render draws the same wall. */
const sconceRand = seeded(djb2("kinetiq:dolly-frame:sconces"));
const SCONCES = Array.from({ length: 4 }, (_, k) => {
  const onLeft = k < 2;
  return {
    id: k,
    left: onLeft ? 7 + sconceRand() * 5 : 88 + sconceRand() * 5,
    top: 26 + sconceRand() * 10 + (k % 2) * 24,
    size: 2.5 + sconceRand() * 1.5,
    glow: 0.4 + sconceRand() * 0.3,
  };
});

/**
 * A dolly-zoom hero. Scroll scrubs the push: the backdrop rushes wide (with a
 * slight upward drift and a closing vignette) while the subject grows barely
 * at all and holds dead center — the vertigo effect, 1:1 with scroll through
 * transforms only. In the default corridor, each arch layer scales faster the
 * deeper it sits, stretching the tunnel past the held plate. Film chrome
 * frames the shot: letterbox bars tighten with the push and a mono focal
 * readout walks 24mm to 85mm. Under reduced motion the stage renders a static
 * mid-dolly frame — scrolling still drives the textual readout and onDolly.
 */
export function DollyFrame({
  subject,
  backdrop,
  height = 280,
  onDolly,
  className,
  "aria-label": ariaLabel = "Dolly frame",
}: DollyFrameProps) {
  const motionSafe = useMotionSafe();
  const progress = useMotionValue(0);
  const [focal, setFocal] = React.useState(focalAt(0));
  const dollyStepRef = React.useRef(0);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const range = el.scrollHeight - el.clientHeight;
    progress.set(range <= 0 ? 0 : el.scrollTop / range);
  };

  useMotionValueEvent(progress, "change", (p) => {
    setFocal(focalAt(p));
    const step = Math.round(p * 20) / 20;
    if (step !== dollyStepRef.current) {
      dollyStepRef.current = step;
      onDolly?.(step);
    }
  });

  const backdropScale = useTransform(progress, backdropScaleAt);
  const backdropY = useTransform(progress, backdropYAt);
  const subjectScale = useTransform(progress, subjectScaleAt);
  const vignetteOpacity = useTransform(progress, vignetteAt);
  const barHeight = useTransform(progress, barHeightAt);

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      onScroll={handleScroll}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-1 focus-visible:ring-cobalt-bright/40 relative overflow-y-auto overscroll-contain rounded-4 border outline-none focus-visible:ring-2",
        className,
      )}
    >
      <p className="sr-only">
        A dolly zoom shot: scrolling pushes the backdrop wider while the
        subject holds its size at the center of frame. Focal length now reads{" "}
        {focal} millimeters.
      </p>

      {/* The track supplies the scroll travel; the stage stays pinned as it passes. */}
      <div aria-hidden style={{ height: height * TRACK_FACTOR }}>
        <div className="sticky top-0 overflow-hidden" style={{ height }}>
          {/* Backdrop — the field of view rushing wider */}
          <motion.div
            className="absolute inset-0"
            style={
              motionSafe
                ? { scale: backdropScale, y: backdropY }
                : { scale: backdropScaleAt(REST_P), y: backdropYAt(REST_P) }
            }
          >
            {backdrop ?? (
              <CorridorVista progress={progress} motionSafe={motionSafe} />
            )}
          </motion.div>

          {/* Vignette — the tunnel closing in */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 120% at 50% 50%, transparent 46%, oklch(0.07 0.01 262 / 0.9) 100%)",
              opacity: motionSafe ? vignetteOpacity : vignetteAt(REST_P),
            }}
          />

          {/* Subject — holds its size at center */}
          <div className="absolute inset-0 grid place-items-center">
            <motion.div
              style={{
                scale: motionSafe ? subjectScale : subjectScaleAt(REST_P),
              }}
            >
              {subject}
            </motion.div>
          </div>

          {/* Letterbox bars — tightening slightly with the push */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{
              height: motionSafe ? barHeight : barHeightAt(REST_P),
              background: "oklch(0.11 0.008 262)",
            }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{
              height: motionSafe ? barHeight : barHeightAt(REST_P),
              background: "oklch(0.11 0.008 262)",
            }}
          />

          {/* Focal readout chip */}
          <span className="border-hairline bg-surface-2 text-ink-2 pointer-events-none absolute right-3 bottom-[10%] rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wide tabular-nums">
            FOCAL &middot; {focal}mm
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The built-in corridor: a deep gradient, an end-of-hall bloom, four receding
 * arches on differential scale, a converging floor fan, and seeded sconces.
 */
function CorridorVista({
  progress,
  motionSafe,
}: {
  progress: MotionValue<number>;
  motionSafe: boolean;
}) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background:
          "linear-gradient(180deg, oklch(0.3 0.025 262) 0%, oklch(0.2 0.02 262) 58%, oklch(0.14 0.015 262) 100%)",
      }}
    >
      {/* Light bloom at the end of the corridor */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(34% 30% at 50% 46%, oklch(0.82 0.04 250 / 0.16), transparent 70%)",
        }}
      />

      {/* Converging floor-line fan */}
      {FLOOR_LINES.map((line) => (
        <div
          key={`${line.left}:${line.rotate}`}
          className="absolute bottom-0 w-px origin-bottom"
          style={{
            left: line.left,
            height: "56%",
            opacity: line.opacity,
            transform: `rotate(${line.rotate}deg)`,
            background: "oklch(0.72 0.02 262)",
          }}
        />
      ))}

      {/* Receding arch frames */}
      {ARCHES.map((arch) => (
        <ArchLayer
          key={arch.depth}
          arch={arch}
          progress={progress}
          motionSafe={motionSafe}
        />
      ))}

      {/* Wall sconces */}
      {SCONCES.map((sconce) => (
        <span
          key={sconce.id}
          className="absolute rounded-full"
          style={{
            left: `${sconce.left}%`,
            top: `${sconce.top}%`,
            width: sconce.size,
            height: sconce.size,
            background: "oklch(0.9 0.07 84)",
            opacity: sconce.glow,
            boxShadow: `0 0 ${sconce.size * 3}px oklch(0.85 0.1 84 / 0.8)`,
          }}
        />
      ))}
    </div>
  );
}

/** One arch outline; deeper layers scale faster than the group around them. */
function ArchLayer({
  arch,
  progress,
  motionSafe,
}: {
  arch: Arch;
  progress: MotionValue<number>;
  motionSafe: boolean;
}) {
  const scale = useTransform(progress, (p) =>
    archScaleAt(p, arch.base, arch.depth),
  );

  return (
    <motion.div
      className="absolute inset-0 m-auto border"
      style={{
        width: "72%",
        height: "84%",
        borderColor: arch.stroke,
        borderRadius: "999px 999px 14px 14px",
        scale: motionSafe ? scale : archScaleAt(REST_P, arch.base, arch.depth),
      }}
    />
  );
}
