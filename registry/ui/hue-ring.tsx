"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HueRingValue = { h: number; l: number };

/** The wheel is the data, so its stops are real hues rather than tokens. */
const SATURATION = 0.82;
const WHEEL_STOPS = Array.from(
  { length: 13 },
  (_, i) => `hsl(${i * 30} 82% 55%) ${(i * 30) / 3.6}%`,
).join(", ");
const WHEEL = `conic-gradient(from 0deg, ${WHEEL_STOPS})`;

const HEX_GLYPHS = "0123456789ABCDEF".split("");
/** Glyph cell height in px — fixed so the roll never needs a measurement pass. */
const CELL = 16;
/** Pointer travel before the ring takes the pointer; below it, taps still land. */
const CAPTURE_PX = 4;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const wrapHue = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

/** Signed delta that never takes the long way round the circle. */
const shortestDelta = (from: number, to: number) => {
  const raw = (((to - from) % 360) + 540) % 360;
  return raw - 180;
};

function HexRoll({ hex, motionSafe }: { hex: string; motionSafe: boolean }) {
  return (
    <span
      className="inline-flex font-mono text-xs tracking-[0.12em] text-foreground tabular-nums"
      aria-hidden
    >
      <span className="h-4 leading-4">#</span>
      {hex
        .slice(1)
        .split("")
        .map((char, index) => (
          <span
            key={index}
            className="relative h-4 w-[1ch] overflow-hidden text-center"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              animate={{ y: -HEX_GLYPHS.indexOf(char) * CELL }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              {HEX_GLYPHS.map((glyph) => (
                <span key={glyph} className="h-4 leading-4">
                  {glyph}
                </span>
              ))}
            </motion.span>
          </span>
        ))}
    </span>
  );
}

export type HueRingProps = {
  /** Controlled reading: hue in degrees, lightness 0–100. */
  value?: HueRingValue;
  /** Initial reading for uncontrolled usage. */
  defaultValue?: HueRingValue;
  /** Both readings on every change. */
  onValueChange?: (value: HueRingValue, hex: string) => void;
  /** Ring diameter in px. */
  size?: number;
  /** Group label. */
  label?: string;
  className?: string;
};

/**
 * A hue wheel with a thumb that chases the pointer on `snap` — always the short
 * way round, so 350° to 10° never spins the wheel backwards — over a lightness
 * bar that shares the chosen hue. The swatch takes the new colour on a tween
 * and the hex readout rolls each character into place on `glide`.
 *
 * Two real sliders: the ring reports degrees with the hex as its value text,
 * the bar reports lightness. Arrows step 1, Shift+Arrow steps 10, Home and End
 * jump to the ends. Reduced motion puts the thumb straight on its angle and
 * swaps the colour and the hex without a roll.
 */
export function HueRing({
  value,
  defaultValue,
  onValueChange,
  size = 180,
  label = "Accent colour",
  className,
}: HueRingProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<HueRingValue>(
    () => defaultValue ?? { h: 210, l: 55 },
  );
  const current = value ?? uncontrolled;
  const hue = wrapHue(current.h);
  const lightness = clamp(Math.round(current.l), 0, 100);
  const hex = hslToHex(hue, SATURATION, lightness / 100);

  const ringRef = React.useRef<HTMLDivElement | null>(null);
  const dragOrigin = React.useRef<{ x: number; y: number } | null>(null);
  const captured = React.useRef(false);
  const barDrag = React.useRef<{ x: number; y: number } | null>(null);
  const barCaptured = React.useRef(false);

  const rotation = useMotionValue(hue);

  // The thumb rides an unwrapped angle: it accumulates the shortest delta
  // rather than resetting to 0 and unwinding a whole turn at the seam.
  React.useEffect(() => {
    const from = rotation.get();
    const target = from + shortestDelta(from, hue);
    if (!motionSafe) {
      rotation.set(target);
      return;
    }
    const controls = animate(rotation, target, springs.snap);
    return () => controls.stop();
  }, [hue, motionSafe, rotation]);

  const commit = (next: HueRingValue) => {
    const settled: HueRingValue = {
      h: wrapHue(next.h),
      l: clamp(Math.round(next.l), 0, 100),
    };
    if (settled.h === hue && settled.l === lightness) return;
    if (value === undefined) setUncontrolled(settled);
    onValueChange?.(settled, hslToHex(settled.h, SATURATION, settled.l / 100));
  };

  const hueFromPointer = (clientX: number, clientY: number) => {
    const rect = ringRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return hue;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    return wrapHue((Math.atan2(dx, -dy) * 180) / Math.PI);
  };

  const ringWidth = Math.max(12, Math.round(size * 0.1));
  const innerStop = (1 - (ringWidth * 2) / size) * 100;
  // The mask paints coverage, not colour, so an opaque keyword is the right
  // value here — the band underneath is where the real hues live.
  const ringMask = `radial-gradient(circle closest-side, transparent ${innerStop}%, black ${innerStop}%)`;
  const swatchInset = ringWidth + 10;

  const step = (event: React.KeyboardEvent, axis: "h" | "l") => {
    const grain = event.shiftKey ? 10 : 1;
    const bounds = axis === "h" ? 359 : 100;
    let next: number | null = null;
    const now = axis === "h" ? hue : lightness;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = now + grain;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = now - grain;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = bounds;
        break;
      default:
        return;
    }
    event.preventDefault();
    // Hue is circular so it wraps; lightness has real ends and clamps.
    commit(
      axis === "h"
        ? { h: next, l: lightness }
        : { h: hue, l: clamp(next, 0, 100) },
    );
  };

  const lightnessFromPointer = (clientX: number, track: HTMLElement) => {
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return lightness;
    return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col items-center gap-3", className)}
      style={{ maxWidth: size }}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <div className="relative" style={{ width: size, height: size }}>
        <div
          ref={ringRef}
          role="slider"
          tabIndex={0}
          aria-label={`${label} hue`}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={hue}
          aria-valuetext={`${hue} degrees, ${hex}`}
          onKeyDown={(event) => step(event, "h")}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            dragOrigin.current = { x: event.clientX, y: event.clientY };
            captured.current = false;
            commit({
              h: hueFromPointer(event.clientX, event.clientY),
              l: lightness,
            });
            event.currentTarget.focus();
          }}
          onPointerMove={(event) => {
            const origin = dragOrigin.current;
            if (!origin) return;
            if (!captured.current) {
              const travel = Math.hypot(
                event.clientX - origin.x,
                event.clientY - origin.y,
              );
              // Capturing on pointerdown swallows plain taps, so the ring
              // only takes the pointer once this is a drag.
              if (travel < CAPTURE_PX) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              captured.current = true;
            }
            commit({
              h: hueFromPointer(event.clientX, event.clientY),
              l: lightness,
            });
          }}
          onPointerUp={(event) => {
            if (
              captured.current &&
              event.currentTarget.hasPointerCapture(event.pointerId)
            ) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            dragOrigin.current = null;
            captured.current = false;
          }}
          onPointerCancel={() => {
            dragOrigin.current = null;
            captured.current = false;
          }}
          className="absolute inset-0 cursor-pointer rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <div
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: WHEEL,
              maskImage: ringMask,
              WebkitMaskImage: ringMask,
            }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{ rotate: rotation }}
          >
            <span
              className="absolute left-1/2 block rounded-full border-2 border-background shadow-sm ring-1 ring-hairline-strong"
              style={{
                width: ringWidth - 4,
                height: ringWidth - 4,
                top: 2,
                marginLeft: -(ringWidth - 4) / 2,
                backgroundColor: hslToHex(hue, SATURATION, 0.55),
              }}
            />
          </motion.div>
        </div>

        <motion.div
          aria-hidden
          className="absolute rounded-full border border-hairline"
          style={{ inset: swatchInset }}
          initial={false}
          animate={{ backgroundColor: hex }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.move }
              : { duration: 0 }
          }
        />
      </div>

      <HexRoll hex={hex} motionSafe={motionSafe} />

      <div
        role="slider"
        tabIndex={0}
        aria-label={`${label} lightness`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lightness}
        aria-valuetext={`${lightness} percent lightness, ${hex}`}
        aria-orientation="horizontal"
        onKeyDown={(event) => step(event, "l")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          barDrag.current = { x: event.clientX, y: event.clientY };
          barCaptured.current = false;
          commit({
            h: hue,
            l: lightnessFromPointer(event.clientX, event.currentTarget),
          });
          event.currentTarget.focus();
        }}
        onPointerMove={(event) => {
          const origin = barDrag.current;
          if (!origin) return;
          if (!barCaptured.current) {
            const travel = Math.hypot(
              event.clientX - origin.x,
              event.clientY - origin.y,
            );
            if (travel < CAPTURE_PX) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            barCaptured.current = true;
          }
          commit({
            h: hue,
            l: lightnessFromPointer(event.clientX, event.currentTarget),
          });
        }}
        onPointerUp={(event) => {
          if (
            barCaptured.current &&
            event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          barDrag.current = null;
          barCaptured.current = false;
        }}
        onPointerCancel={() => {
          barDrag.current = null;
          barCaptured.current = false;
        }}
        className="relative h-6 w-full cursor-pointer rounded-full border border-hairline outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{
          background: `linear-gradient(90deg, hsl(${hue} 82% 0%), hsl(${hue} 82% 50%), hsl(${hue} 82% 100%))`,
        }}
      >
        <motion.span
          aria-hidden
          className="absolute top-1/2 size-4 rounded-full border-2 border-background shadow-sm ring-1 ring-hairline-strong"
          style={{ backgroundColor: hex, marginTop: -8, marginLeft: -8 }}
          initial={false}
          animate={{ left: `${lightness}%` }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </div>
    </div>
  );
}
