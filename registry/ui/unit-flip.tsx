"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type UnitFlipUnit = {
  /** Shown on the chip, e.g. `°C`. */
  label: string;
  /** Converts the base value into this unit. */
  convert: (value: number) => number;
  /** Decimal places this unit is read to. @default 1 */
  digits?: number;
};

export type UnitFlipProps = {
  /** The measurement, in the first unit. */
  value: number;
  /** The pair, each converting from the base value. */
  units: [UnitFlipUnit, UnitFlipUnit];
  /** Controlled unit index. */
  unit?: 0 | 1;
  /** Initial unit index for uncontrolled usage. */
  defaultUnit?: 0 | 1;
  /** Fires on flip. */
  onUnitChange?: (index: 0 | 1) => void;
  /** What is being measured. */
  label?: React.ReactNode;
  className?: string;
};

/** Deep enough to read as a card turning, shallow enough not to distort. */
const PERSPECTIVE = 600;
const FACE = "absolute inset-0 flex items-center justify-center";
const HIDE_BACK = { backfaceVisibility: "hidden" } as const;

/**
 * A readout whose unit is the control. Pressing the chip turns it over —
 * `rotateX` on `snap`, two faces on one card, one crisp overshoot as it lands —
 * while the digits re-roll to the converted value, each glyph riding out of its
 * own slot in the direction of the flip so the number reads as re-measured
 * rather than replaced. Precision follows the unit: the miles reading keeps two
 * decimals where the kilometres reading keeps one.
 *
 * The chip is a button carrying `aria-pressed`, so Space and Enter flip it, and
 * its accessible name says which unit is showing and which one is a press away.
 * The converted value is announced through a polite status, because the number
 * changing is the whole point of the press. Under reduced motion the card does
 * not turn and the digits swap in place — the reading still changes, since the
 * reading is the information.
 */
export function UnitFlip({
  value,
  units,
  unit,
  defaultUnit,
  onUnitChange,
  label,
  className,
}: UnitFlipProps) {
  const motionSafe = useMotionSafe();
  const [innerUnit, setInnerUnit] = React.useState<0 | 1>(defaultUnit ?? 0);
  const index = unit ?? innerUnit;
  const other: 0 | 1 = index === 0 ? 1 : 0;
  const current = units[index];
  const shown = current.convert(value).toFixed(current.digits ?? 1);

  const flip = () => {
    if (unit === undefined) setInnerUnit(other);
    onUnitChange?.(other);
  };

  // The roll direction is the flip's direction, not the arithmetic's: the
  // digits should read as the card turning, whichever way the number goes.
  const rise = index === 1 ? 1 : -1;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between gap-3",
        className,
      )}
    >
      {label ? (
        <span className="min-w-0 flex-1 truncate text-sm text-ink-2">
          {label}
        </span>
      ) : null}

      <span className="flex shrink-0 items-center gap-2">
        <span className="flex items-stretch font-mono text-xl leading-[1.3] font-medium tabular-nums">
          {motionSafe ? (
            shown.split("").map((char, position) =>
              /\d/.test(char) ? (
                <span
                  key={position}
                  className="relative flex justify-center overflow-hidden"
                >
                  {/* The invisible copy holds the slot's width, so the two
                      rolling glyphs can both be out of flow. */}
                  <span className="invisible">{char}</span>
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={`${index}-${char}`}
                      initial={{ y: `${rise * 100}%` }}
                      animate={{ y: "0%" }}
                      exit={{
                        y: `${rise * -100}%`,
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={springs.snap}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {char}
                    </motion.span>
                  </AnimatePresence>
                </span>
              ) : (
                <span key={position}>{char}</span>
              ),
            )
          ) : (
            <span>{shown}</span>
          )}
        </span>

        <button
          type="button"
          aria-pressed={index === 1}
          aria-label={`Unit ${current.label}, switch to ${units[other].label}`}
          onClick={flip}
          style={{ perspective: PERSPECTIVE }}
          className="relative h-7 w-12 shrink-0 cursor-pointer rounded-2 border border-hairline bg-surface-2 text-xs font-medium text-ink transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {motionSafe ? (
            <motion.span
              aria-hidden
              className="absolute inset-0"
              style={{ transformStyle: "preserve-3d" }}
              animate={{ rotateX: index * -180 }}
              transition={springs.snap}
            >
              <span className={FACE} style={HIDE_BACK}>
                {units[0].label}
              </span>
              <span
                className={FACE}
                style={{ ...HIDE_BACK, transform: "rotateX(180deg)" }}
              >
                {units[1].label}
              </span>
            </motion.span>
          ) : (
            <span aria-hidden className={FACE}>
              {current.label}
            </span>
          )}
        </button>
      </span>

      <span role="status" className="sr-only">
        {shown} {current.label}
      </span>
    </div>
  );
}
