"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { MetronomeLoader } from "@/registry/ui/metronome-loader";

const VARIANTS = ["pendulum", "bearing", "sweep"] as const;

export function MetronomeLoaderDemo() {
  const motionSafe = useMotionSafe();
  const [value, setValue] = React.useState<number | undefined>(undefined);
  const intervalRef = React.useRef<number | null>(null);

  const stop = React.useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  React.useEffect(() => stop, [stop]);

  React.useEffect(() => {
    if (value === 100) stop();
  }, [value, stop]);

  const calibrate = () => {
    stop();
    setValue(0);
    intervalRef.current = window.setInterval(() => {
      setValue((current) =>
        Math.min(100, (current ?? 0) + 2 + Math.random() * 3.5),
      );
    }, 110);
  };

  const running = typeof value === "number" && value < 100;
  const done = value === 100;

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
        Calibration bay
      </span>

      <div className="grid w-full grid-cols-3 gap-2">
        {VARIANTS.map((variant) => (
          <div
            key={variant}
            className="border-border bg-card flex flex-col items-center gap-2 rounded-2 border px-2 py-3"
          >
            <MetronomeLoader variant={variant} size="md" label={`${variant} loader`} />
            <span className="text-muted-foreground font-mono text-[10px] uppercase">
              {variant}
            </span>
          </div>
        ))}
      </div>

      <div className="border-border bg-card flex w-full flex-col items-center gap-3 rounded-2 border px-4 py-4">
        <div className="flex h-20 items-center justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {done ? (
              <motion.div
                key="check"
                className="flex flex-col items-center gap-1.5"
                initial={motionSafe ? { opacity: 0, scale: 0.85 } : { opacity: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.flick,
                        opacity: { duration: durations.fast, ease: easings.enter },
                      }
                    : { duration: durations.fast }
                }
              >
                <svg viewBox="0 0 40 40" fill="none" className="size-14" aria-hidden>
                  <circle
                    cx="20"
                    cy="20"
                    r="16.5"
                    stroke="var(--primary)"
                    strokeOpacity="0.3"
                    strokeWidth="3"
                  />
                  <motion.path
                    d="M12.5 20.5l5.5 5.5 10-11.5"
                    stroke="var(--primary)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </svg>
                <span className="text-primary font-mono text-[10px] tracking-[0.16em] uppercase">
                  Calibrated
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="gauge"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <MetronomeLoader
                  variant="sweep"
                  size="lg"
                  value={value}
                  label="Calibration progress"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={calibrate}
            disabled={running}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 rounded-2 px-3 text-xs font-medium disabled:pointer-events-none disabled:opacity-50"
          >
            {done ? "Recalibrate" : "Calibrate"}
          </button>
          {done && (
            <button
              type="button"
              onClick={() => {
                stop();
                setValue(undefined);
              }}
              className="border-input hover:bg-accent h-8 rounded-2 border px-3 text-xs font-medium"
            >
              Reset
            </button>
          )}
        </div>

        <span role="status" className="sr-only">
          {done ? "Calibration complete." : ""}
        </span>
      </div>
    </div>
  );
}
