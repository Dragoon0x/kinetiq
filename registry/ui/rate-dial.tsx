"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RateZone = "calm" | "busy" | "over";

export type RateDialProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The current rate; the host owns it, so the dial never reads a clock. */
  value: number;
  /** Full scale of the arc. @default 600 */
  max?: number;
  /** Value at or above which the dial reads busy. @default 0.75 × max */
  warnAt?: number;
  /** Peak the dial mounts with, so a host with history shows it at once. @default 0 */
  defaultPeak?: number;
  /** The held high — a reading, so it also fires on the first commit. */
  onPeakChange?: (peak: number) => void;
  /** The band the needle is in; also fires on the first commit. */
  onZoneChange?: (zone: RateZone) => void;
  /** Printed under the figure. @default "rps" */
  unit?: string;
  /** The same unit, spoken in full. @default "requests per second" */
  unitLong?: string;
  /** Renders the figure and every spoken number. @default rounded integer */
  format?: (value: number) => string;
  /** Names the dial. @default "Rate" */
  label?: string;
  className?: string;
};

const VIEW_W = 200;
const VIEW_H = 150;
const CX = 100;
const CY = 100;
const R = 76;
const SWEEP = 240;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Trig is not correctly rounded and its last digits differ between Node and
 *  Chromium, so every coordinate is rounded before it reaches an attribute. */
const round3 = (value: number): number => Number(value.toFixed(3));

const angleFor = (fraction: number): number =>
  round3(-SWEEP / 2 + Math.min(1, Math.max(0, fraction)) * SWEEP);

const polar = (radius: number, fraction: number) => {
  const radians = (angleFor(fraction) * Math.PI) / 180;
  return {
    x: round3(CX + radius * Math.sin(radians)),
    y: round3(CY - radius * Math.cos(radians)),
  };
};

const arcPath = (radius: number, from: number, to: number): string => {
  const start = polar(radius, from);
  const end = polar(radius, to);
  const large = (to - from) * SWEEP > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
};

/** The hub sits this far up the box; the overlay parts hang from the same spot. */
const HUB_BOTTOM = `${round3(((VIEW_H - CY) / VIEW_H) * 100)}%`;
const NEEDLE_HEIGHT = `${round3((66 / VIEW_H) * 100)}%`;
const MARKER_HEIGHT = `${round3((R / VIEW_H) * 100)}%`;

const ZONE_WORD: Record<RateZone, string> = {
  calm: "Calm",
  busy: "Busy",
  over: "Over scale",
};

/**
 * A number read as a position. Each digit column rides a ten-face strip and
 * rolls to its new face on `snap`, keyed from the right so the units column
 * keeps its identity when the figure gains or loses a digit. It is hidden from
 * assistive technology because the dial already carries the reading in
 * `aria-valuetext`, and nobody should have to wade through ten faces a column.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.15em] w-[1ch] overflow-clip [contain:paint]"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.15em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Requests per second, read as a position. The needle swings to the rate on
 * `snap` — an indicator taking a new place, one crisp overshoot and done —
 * around a 240° arc whose every coordinate is rounded to three decimals before
 * it reaches an attribute, because `Math.sin` differs in its last digits
 * between Node and the browser and a raw coordinate is a hydration error rather
 * than a rounding one.
 *
 * The figure under the hub rolls its digits on the same spring, and a peak
 * marker holds the highest rate seen: it only ever moves outward, gliding on
 * `snap` and flaring once on a three-keyframe tween when it is beaten — a
 * tween, because a spring drops the middle keyframe. `Reset peak` drops it back
 * to the current reading.
 *
 * The dial is a `role="meter"` carrying `tabIndex={0}`, so a keyboard reader can
 * land on the reading itself; its `aria-valuetext` is a sentence, the zone word
 * is printed beside the figure rather than left to colour, and a polite region
 * speaks a new peak from a sentence frozen at the moment it moved. Under
 * reduced motion the needle takes its angle instantly and the digits swap in
 * place, but the peak still moves and still holds, because a held high is
 * information.
 */
export function RateDial({
  ref,
  value,
  max = 600,
  warnAt,
  defaultPeak = 0,
  onPeakChange,
  onZoneChange,
  unit = "rps",
  unitLong = "requests per second",
  format,
  label = "Rate",
  className,
}: RateDialProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const scale = max > 0 ? max : 1;
  const warn = warnAt ?? scale * 0.75;
  const reading = Math.max(0, value);
  const fraction = Math.min(1, reading / scale);

  const print = React.useCallback(
    (input: number) => (format ? format(input) : String(Math.round(input))),
    [format],
  );

  // The mount peak already includes the incoming value, so a dial that arrives
  // at its high does not announce a peak nobody watched happen.
  const [peak, setPeak] = React.useState(() => ({
    value: Math.max(0, defaultPeak, reading),
    sentence: "",
  }));
  const [flare, setFlare] = React.useState(0);
  if (reading > peak.value) {
    setPeak({
      value: reading,
      sentence: `New peak, ${print(reading)} ${unitLong}.`,
    });
    setFlare((count) => count + 1);
  }

  const zone: RateZone =
    reading > scale ? "over" : reading >= warn ? "busy" : "calm";
  const hot = zone !== "calm";

  const callbacks = React.useRef({ onPeakChange, onZoneChange });
  React.useEffect(() => {
    callbacks.current = { onPeakChange, onZoneChange };
  });
  // Both are readings, not events: they report from the first commit too, so a
  // host that mounts with history is never a frame behind the dial.
  React.useEffect(() => {
    callbacks.current.onPeakChange?.(peak.value);
  }, [peak.value]);
  React.useEffect(() => {
    callbacks.current.onZoneChange?.(zone);
  }, [zone]);

  const resetPeak = () => {
    setPeak({
      value: reading,
      sentence: `Peak reset to ${print(reading)} ${unitLong}.`,
    });
  };

  const peakFraction = Math.min(1, peak.value / scale);
  const warnFraction = Math.min(1, Math.max(0, warn / scale));

  const valueText = `${print(reading)} ${unitLong}, ${ZONE_WORD[zone].toLowerCase()}${
    zone === "busy" ? `, above the ${print(warn)} mark` : ""
  }. Peak ${print(peak.value)} ${unitLong}.`;

  const swing = motionSafe ? springs.snap : { duration: 0 };
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          id={labelId}
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
          peak {print(peak.value)} {unit}
        </span>
      </div>

      <div
        role="meter"
        tabIndex={0}
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={Math.min(scale, reading)}
        aria-valuetext={valueText}
        className="relative mx-auto w-full max-w-[264px] rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="absolute inset-0 h-full w-full"
        >
          <path
            d={arcPath(R, 0, 1)}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className="stroke-hairline-strong"
          />
          <path
            d={arcPath(R, warnFraction, 1)}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeOpacity={0.35}
            className="stroke-warn"
          />
          {ticks.map((tick) => {
            const inner = polar(R - 13, tick);
            const outer = polar(R - 6, tick);
            return (
              <line
                key={tick}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                strokeWidth="1.5"
                strokeLinecap="round"
                className="stroke-ink-3"
              />
            );
          })}
          <circle cx={CX} cy={CY} r="5" className="fill-ink" />
        </svg>

        {/* The needle is an HTML element pinned to the hub: origin keys are the
            only transform-origin motion respects, and 50% / 100% puts the pivot
            exactly on the hub the SVG drew. */}
        <motion.span
          aria-hidden
          className={cn(
            "absolute w-[2px] rounded-full transition-colors",
            hot ? "bg-warn" : "bg-ink",
          )}
          style={{
            left: "calc(50% - 1px)",
            bottom: HUB_BOTTOM,
            height: NEEDLE_HEIGHT,
            originX: 0.5,
            originY: 1,
          }}
          initial={false}
          animate={{ rotate: angleFor(fraction) }}
          transition={swing}
        />

        <motion.span
          aria-hidden
          className="absolute w-[2px]"
          style={{
            left: "calc(50% - 1px)",
            bottom: HUB_BOTTOM,
            height: MARKER_HEIGHT,
            originX: 0.5,
            originY: 1,
          }}
          initial={false}
          animate={{ rotate: angleFor(peakFraction) }}
          transition={swing}
        >
          <span className="absolute inset-x-[-1px] top-0 h-2.5 rounded-full bg-signal" />
          {/* Three keyframes, so a tween: a spring would silently drop the
              middle one and the flare would never reach full. */}
          {flare > 0 && motionSafe ? (
            <motion.span
              key={flare}
              className="absolute inset-x-[-3px] top-[-2px] h-4 rounded-full bg-signal"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0] }}
              transition={{
                duration: durations.page,
                times: [0, 0.15, 1],
                ease: easings.exit,
              }}
            />
          ) : null}
        </motion.span>

        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5"
        >
          <span
            className={cn(
              "flex items-center font-mono text-[26px] leading-none font-medium transition-colors",
              hot ? "text-warn" : "text-ink",
            )}
          >
            <RollingNumber value={print(reading)} motionSafe={motionSafe} />
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {unit}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "flex h-8 min-w-0 items-center text-[11px] font-medium transition-colors",
            zone === "over"
              ? "text-danger"
              : zone === "busy"
                ? "text-warn"
                : "text-ink-2",
          )}
        >
          {ZONE_WORD[zone]}
        </span>
        <button
          type="button"
          disabled={peak.value <= reading}
          aria-label={`Reset peak, currently ${print(peak.value)} ${unitLong}.`}
          onClick={resetPeak}
          className="flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 font-mono text-[10px] font-medium text-ink transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Reset peak
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {peak.sentence}
      </span>
    </div>
  );
}
