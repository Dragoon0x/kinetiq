"use client";

import * as React from "react";

import { motion, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePointerFine,
  usePointerTilt,
} from "@/registry/hooks/use-pointer-tilt";
import { cn } from "@/registry/lib/utils";

/** Resting overscan of the scene, so counter-shifts never expose its edges. */
const SCENE_SCALE = 1.15;
/** Coarse/reduced-motion rest pose: the vista parks slightly up-left of
 *  center (in fractions of `depth`) so the windows still show a live view. */
const REST_SHIFT_X = -0.35;
const REST_SHIFT_Y = -0.2;
/** The punched word spans this share of the plate width. */
const PUNCH_SPAN = "80%";
/** Golden angle, in degrees — the hue step for the default vista's index. */
const GOLDEN_ANGLE = 137.508;
/** First indexed hue — house cobalt; every sibling steps by the golden angle. */
const VISTA_BASE_HUE = 262;

/** Deterministic indexed hue: base + i golden-angle steps, one decimal. */
const vistaHue = (index: number): number =>
  Math.round(((VISTA_BASE_HUE + index * GOLDEN_ANGLE) % 360) * 10) / 10;

/** SVG ids must survive url(#…) parsing — strip useId's sigil characters. */
const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");

/**
 * TYPE SIZING — documented because nothing measures the box. The plate's
 * height is a prop, so the glyph size derives from it directly: 0.56 × height,
 * eased down past six glyphs so a ten-glyph word still clears the frame. The
 * unknown dimension (width) is the browser's job: textLength="80%" with
 * lengthAdjust="spacingAndGlyphs" pins the run to exactly 80% of the rendered
 * width — no ResizeObserver, no state, and a late webfont swap changes glyph
 * shapes but never the fit. Glyph aspect flexes a little with the frame,
 * which is exactly how a die stretched to its plate behaves.
 */
const punchFontSize = (height: number, chars: number): number =>
  Math.min(height * 0.56, (height * 3.4) / Math.max(chars, 1));

/** Three gradient bands, top to bottom — hues 0..2 on the golden wheel. */
const VISTA_BANDS = [
  { top: "0%", height: "40%", angle: 168, hueIndex: 0 },
  { top: "36%", height: "34%", angle: 173, hueIndex: 1 },
  { top: "66%", height: "34%", angle: 164, hueIndex: 2 },
] as const;

/** Glow discs pinned at fixed stations — hues 3..6 continue the wheel. */
const VISTA_DISCS = [
  { left: "14%", top: "22%", size: "38%", hueIndex: 3 },
  { left: "66%", top: "10%", size: "30%", hueIndex: 4 },
  { left: "52%", top: "58%", size: "34%", hueIndex: 5 },
  { left: "22%", top: "66%", size: "26%", hueIndex: 6 },
] as const;

/**
 * The built-in vista: three banded gradients under four glow discs, every
 * hue indexed on the golden angle from house cobalt, every station a module
 * constant — the same plate renders identically on server, client, and every
 * revisit. Mid-lightness oklch keeps the view legible behind both the navy
 * and the paper surface.
 */
function PunchVista() {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{ background: `oklch(0.26 0.05 ${vistaHue(0)})` }}
    >
      {VISTA_BANDS.map((band) => (
        <div
          key={band.hueIndex}
          className="absolute right-0 left-0"
          style={{
            top: band.top,
            height: band.height,
            background: `linear-gradient(${band.angle}deg, oklch(0.58 0.13 ${vistaHue(band.hueIndex)}) 0%, oklch(0.36 0.1 ${vistaHue(band.hueIndex)}) 100%)`,
          }}
        />
      ))}
      {VISTA_DISCS.map((disc) => (
        <div
          key={disc.hueIndex}
          className="absolute rounded-full"
          style={{
            left: disc.left,
            top: disc.top,
            width: disc.size,
            aspectRatio: "1",
            background: `radial-gradient(closest-side, oklch(0.78 0.15 ${vistaHue(disc.hueIndex)} / 0.9) 0%, oklch(0.78 0.15 ${vistaHue(disc.hueIndex)} / 0) 72%)`,
          }}
        />
      ))}
    </div>
  );
}

export type PunchTypeProps = {
  /** One short word (≤10 characters) — punched through the plate at display size. */
  text: string;
  /** The layer behind the punch. @default the built-in gradient vista */
  scene?: React.ReactNode;
  /** Max scene counter-shift against the pointer, in px. @default 16 */
  depth?: number;
  /** Plate height, in px. @default 200 */
  height?: number;
  className?: string;
  /** Accessible name for the plate. @default the punched text */
  "aria-label"?: string;
};

/**
 * Letters punched through the surface act as windows onto a parallax scene
 * behind. The punch is honest: one SVG surface rect (fill `var(--card)` under
 * a faint top-light gradient) is masked by white-rect-plus-black-text, so the
 * letterforms are genuinely cut out, and a second stroke-only text traces the
 * same geometry as the cutout's return lip. Behind it, the scene rides a
 * motion.div at 1.15 overscan whose x/y counter-shift the pointer via
 * `usePointerTilt` (tiltX/tiltY × −depth, sprung on `glide`) — lean right and
 * the windows sweep left across the vista, the peek-portal illusion worked
 * through type. Pointer tracking runs only for fine pointers with motion
 * allowed; coarse pointers and reduced motion park the scene at a fixed
 * handsome offset with no tracking and no loops — the hook levels itself and
 * self-cleans on unmount. The stage is `role="img"` named by the text (its
 * internals are decoration), an sr-only line beside it notes the interaction,
 * and nothing inside is focusable. Mask and gradient ids come from
 * `React.useId`, unique per instance.
 */
export function PunchType({
  text,
  scene,
  depth = 16,
  height = 200,
  className,
  "aria-label": ariaLabel = text,
}: PunchTypeProps) {
  const motionSafe = useMotionSafe();
  const fine = usePointerFine();
  const active = motionSafe && fine;

  // The house pointer idiom: sprung normalized tilt, disabled when static.
  const tilt = usePointerTilt({ disabled: !active });
  // Scene counter-shifts against the pointer — lean right, see more of the left.
  const sceneX = useTransform(tilt.tiltX, (v) => v * -depth);
  const sceneY = useTransform(tilt.tiltY, (v) => v * -depth);

  const uid = safeId(React.useId());
  const punchId = `${uid}-punch`;
  const lightId = `${uid}-light`;

  const fontSize = punchFontSize(height, text.length);
  const midY = height / 2;

  return (
    <div className={cn("relative w-full", className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        {...tilt.handlers}
        style={{ height }}
        className="border-hairline relative overflow-hidden rounded-3 border"
      >
        {/* THE SCENE — the layer the windows look onto. Overscanned 1.15 so
            full deflection never drags an edge into a letterform. */}
        <motion.div
          aria-hidden
          className="absolute inset-0"
          style={
            active
              ? { scale: SCENE_SCALE, x: sceneX, y: sceneY }
              : {
                  scale: SCENE_SCALE,
                  x: depth * REST_SHIFT_X,
                  y: depth * REST_SHIFT_Y,
                }
          }
        >
          {scene ?? <PunchVista />}
        </motion.div>

        {/* THE SURFACE — the plate with the word cut out. The mask is white
            (keep) everywhere except the black text (punch), so the rect pair
            below covers everything but the letterforms. */}
        <svg aria-hidden className="absolute inset-0 size-full">
          <defs>
            <linearGradient id={lightId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="oklch(1 0 0)" stopOpacity="0.08" />
              <stop offset="0.45" stopColor="oklch(1 0 0)" stopOpacity="0.02" />
              <stop offset="1" stopColor="oklch(0 0 0)" stopOpacity="0.06" />
            </linearGradient>
            <mask id={punchId}>
              <rect width="100%" height="100%" fill="white" />
              <text
                x="50%"
                y={midY}
                textAnchor="middle"
                dominantBaseline="central"
                className="font-mono"
                fontSize={fontSize}
                fontWeight={700}
                textLength={PUNCH_SPAN}
                lengthAdjust="spacingAndGlyphs"
                fill="black"
              >
                {text}
              </text>
            </mask>
          </defs>

          <g mask={`url(#${punchId})`}>
            <rect width="100%" height="100%" fill="var(--card)" />
            {/* Top-light: the faint gradient that makes the surface a plate,
                masked with it so the light never tints the view through. */}
            <rect width="100%" height="100%" fill={`url(#${lightId})`} />
          </g>

          {/* INNER EDGE — the punched edge's return lip: the same text set
              stroke-only on the identical geometry, riding the cutout line. */}
          <text
            x="50%"
            y={midY}
            textAnchor="middle"
            dominantBaseline="central"
            className="font-mono"
            fontSize={fontSize}
            fontWeight={700}
            textLength={PUNCH_SPAN}
            lengthAdjust="spacingAndGlyphs"
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth={1}
          >
            {text}
          </text>
        </svg>
      </div>

      {/* Outside the img role, so assistive tech actually reads it. */}
      <p className="sr-only">
        Decorative stencil plate: moving the pointer slides the scene behind
        the punched letters.
      </p>
    </div>
  );
}
