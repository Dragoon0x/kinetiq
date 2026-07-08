"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { CodeCells } from "@/registry/ui/code-cells";
import { PressureButton } from "@/registry/ui/pressure-button";

const DEMO_CODE = "314159";
/** Long enough to read the nudge before the rejected code clears. */
const CLEAR_DELAY_MS = 550;

export function CodeCellsDemo() {
  const motionSafe = useMotionSafe();
  const codeRef = React.useRef<HTMLInputElement | null>(null);
  const clearTimer = React.useRef(0);
  const [code, setCode] = React.useState("");
  const [rejected, setRejected] = React.useState(false);
  const [paired, setPaired] = React.useState(false);

  React.useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const verify = (entered: string) => {
    if (entered === DEMO_CODE) {
      setRejected(false);
      setPaired(true);
      return;
    }
    setRejected(true);
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => {
      setCode("");
      // The forwarded ref reaches the hidden input — refocus after clearing.
      codeRef.current?.focus({ preventScroll: true });
    }, CLEAR_DELAY_MS);
  };

  const reset = () => {
    window.clearTimeout(clearTimer.current);
    setPaired(false);
    setRejected(false);
    setCode("");
    requestAnimationFrame(() =>
      codeRef.current?.focus({ preventScroll: true }),
    );
  };

  const swapTransition = motionSafe
    ? {
        y: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }
    : { duration: durations.fast };

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <p className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
        Pair field unit
      </p>

      <div className="flex min-h-32 items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          {paired ? (
            <motion.div
              key="paired"
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={swapTransition}
              className="flex flex-col items-center gap-2.5"
            >
              <span className="border-primary/40 bg-primary/10 flex size-11 items-center justify-center rounded-full border">
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
                  {motionSafe ? (
                    <motion.path
                      d="M5 12.5 10 17.5 19 7"
                      fill="none"
                      stroke="var(--signal, var(--primary))"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ ...springs.flick, delay: 0.15 }}
                    />
                  ) : (
                    <path
                      d="M5 12.5 10 17.5 19 7"
                      fill="none"
                      stroke="var(--signal, var(--primary))"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </svg>
              </span>
              <p
                role="status"
                className="font-mono text-xs font-semibold tracking-[0.15em] uppercase"
              >
                Unit paired
              </p>
              <PressureButton size="sm" variant="outline" onClick={reset}>
                Reset
              </PressureButton>
            </motion.div>
          ) : (
            <motion.div
              key="entry"
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={swapTransition}
            >
              <CodeCells
                ref={codeRef}
                label="6-digit pairing code"
                length={6}
                groups={[3, 3]}
                value={code}
                onValueChange={(next) => {
                  setCode(next);
                  if (rejected) setRejected(false);
                }}
                onComplete={verify}
                error={rejected}
                errorMessage="Code rejected"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase">
        Demo code · 314159
      </p>
    </div>
  );
}
