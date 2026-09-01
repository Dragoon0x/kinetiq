"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Crack width on the third knock — panel scaleX shrinks toward its left hinge. */
const OPEN_SCALE = 0.58;
/** How long the door stays cracked open before it slams. ~1.4s per spec. */
const SLAM_DELAY_MS = 1400;
/** Rattle keyframes — a faint x-jitter, ~180ms. */
const RATTLE_X = [0, -2.5, 2.5, -1.5, 0] as const;
const RATTLE_TIMES = [0, 0.25, 0.55, 0.8, 1] as const;
/** Delay from creak-start to the resident appearing — roughly the creak's settle. */
const REVEAL_DELAY = 0.35;
/** Dust flecks — fixed offsets from the doorframe's top center, and how far they fall. */
const DUST = [
  { key: "a", x: -6, fall: 15 },
  { key: "b", x: 5, fall: 11 },
] as const;

/** Caption steps for the first two knocks; the third knock and the slam set their own. */
const KNOCK_CAPTIONS = ["knock", "…", "someone is coming"] as const;
/** Shared no-op transition for the reduced-motion instant swaps. */
const NO_TRANSITION = { duration: 0 };

export type LittleDoorProps = {
  /** What answers the door on the third knock. @default "eyes" */
  resident?: "eyes" | "flower";
  /** Fires once per cycle, the instant the door creaks open. */
  onOpen?: () => void;
  className?: string;
};

/**
 * A tiny door set into a baseboard, and whoever lives behind it. Knocking —
 * click, Enter, or Space — gives the door a faint x-jitter rattle and steps a
 * caption through "knock" to "…" to "someone is coming"; the third knock
 * creaks the door open a crack on `springs.glide`, a scaleX toward its left
 * hinge rather than any 3D, revealing a dark gap where two eyes blink once —
 * or, with `resident="flower"`, a tiny flower nods once on its stem. About
 * 1.4s later the door SLAMS shut on `springs.flick`, the caption flips to
 * "rude.", a couple of dust flecks shake loose from the doorframe and fall,
 * and the knock count resets so the whole bit can replay. Reduced motion: no
 * rattle and no creak — the third knock swaps the door instantly between its
 * closed and open-with-resident stills, holds, then swaps back, with the
 * caption still cycling and no dust.
 */
export function LittleDoor({
  resident = "eyes",
  onOpen,
  className,
}: LittleDoorProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [knocks, setKnocks] = React.useState<0 | 1 | 2>(0);
  const [stage, setStage] = React.useState<"closed" | "open">("closed");
  const [openId, setOpenId] = React.useState(0);
  const [dustBurst, setDustBurst] = React.useState(0);
  const [caption, setCaption] = React.useState<string>(KNOCK_CAPTIONS[0]);
  const [announce, setAnnounce] = React.useState("");

  const rattleX = useMotionValue(0);
  const rattleControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const slamTimer = React.useRef<number | null>(null);

  const open = stage === "open";

  React.useEffect(() => {
    return () => {
      if (slamTimer.current !== null) window.clearTimeout(slamTimer.current);
      rattleControls.current?.stop();
    };
  }, []);

  const rattle = () => {
    rattleControls.current?.stop();
    rattleControls.current = animate(rattleX, [...RATTLE_X], {
      duration: 0.18,
      ease: easings.move,
      times: [...RATTLE_TIMES],
    });
  };

  const handleKnock = () => {
    if (stage === "open") return;

    if (knocks === 2) {
      // Third knock: the door creaks open instead of rattling.
      setKnocks(0);
      setStage("open");
      setOpenId((id) => id + 1);
      setCaption("…hello?");
      setAnnounce("Door creaks open.");
      onOpen?.();
      if (slamTimer.current !== null) window.clearTimeout(slamTimer.current);
      slamTimer.current = window.setTimeout(() => {
        setStage("closed");
        setCaption("rude.");
        setAnnounce("Door slams shut.");
        if (motionSafe) setDustBurst((id) => id + 1);
      }, SLAM_DELAY_MS);
      return;
    }

    const next = knocks === 0 ? 1 : 2;
    setKnocks(next);
    setCaption(KNOCK_CAPTIONS[next]);
    setAnnounce(next === 1 ? "Knock." : "Knock again.");
    if (motionSafe) rattle();
  };

  const panelTransition = !motionSafe
    ? NO_TRANSITION
    : open
      ? springs.glide
      : springs.flick;

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className="relative h-[170px] w-[240px] overflow-hidden rounded-3 border border-hairline bg-surface-1 shadow-raised">
        {/* Baseboard along the bottom. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-6 border-t border-hairline bg-surface-2"
        />

        <button
          type="button"
          aria-label="Knock on the little door"
          onClick={handleKnock}
          className="absolute bottom-3.5 left-1/2 -translate-x-1/2 rounded-t-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
        >
          <motion.div style={{ x: rattleX }}>
            <div className="relative h-[60px] w-[42px]">
              {/* Dark gap behind the panel — always present, only ever seen
                  through the crack the panel leaves as it swings open. */}
              <div
                aria-hidden
                className="absolute inset-0 overflow-hidden rounded-t-full rounded-b-1"
                style={{
                  background:
                    "color-mix(in oklab, var(--ink-3) 40%, var(--color-surface-0))",
                }}
              >
                {open &&
                  (resident === "flower" ? (
                    <FlowerResident key={openId} motionSafe={motionSafe} />
                  ) : (
                    <EyesResident key={openId} motionSafe={motionSafe} />
                  ))}
              </div>

              {/* The door panel — swings open on its left hinge. */}
              <motion.div
                className="absolute inset-0 origin-left rounded-t-full rounded-b-1 border border-hairline bg-surface-2"
                initial={false}
                animate={{ scaleX: open ? OPEN_SCALE : 1 }}
                transition={panelTransition}
              >
                <span
                  aria-hidden
                  className="absolute top-1/2 right-[5px] h-1 w-1 -translate-y-1/2 rounded-full bg-ink-3"
                />
              </motion.div>

              {/* Dust flecks shaken loose from the doorframe on the slam. */}
              {motionSafe && dustBurst > 0 && (
                <div
                  key={dustBurst}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0"
                >
                  {DUST.map((fleck) => (
                    <motion.span
                      key={fleck.key}
                      className="absolute top-0 left-1/2 h-[3px] w-[3px] rounded-full bg-ink-3"
                      style={{ marginLeft: fleck.x }}
                      initial={{ opacity: 1, y: 0 }}
                      animate={{ opacity: 0, y: fleck.fall }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Threshold hairline beneath the door. */}
            <div
              aria-hidden
              className="mx-auto mt-0.5 h-px w-[34px] bg-hairline-strong"
            />
          </motion.div>
        </button>
      </div>

      <div aria-hidden className="flex h-4 items-center">
        <motion.span
          key={caption}
          className="text-label text-ink-3 normal-case"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : NO_TRANSITION
          }
        >
          {caption}
        </motion.span>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

/** Two eyes in the gap; they fade in, then blink once, and hold. */
function EyesResident({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.div
      className="absolute top-[27px] left-[29px] flex gap-1.5 text-ink"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: motionSafe ? durations.fast : 0,
        ease: easings.enter,
        delay: motionSafe ? REVEAL_DELAY : 0,
      }}
    >
      {[0, 1].map((eye) => (
        <motion.span
          key={eye}
          className="block h-[3px] w-[3px] rounded-full bg-current"
          style={{ originX: "50%", originY: "50%" }}
          initial={{ scaleY: 1 }}
          animate={motionSafe ? { scaleY: [1, 0.15, 1] } : { scaleY: 1 }}
          transition={
            motionSafe
              ? {
                  duration: 0.3,
                  ease: easings.move,
                  times: [0, 0.5, 1],
                  delay: REVEAL_DELAY + 0.3,
                }
              : NO_TRANSITION
          }
        />
      ))}
    </motion.div>
  );
}

/** A tiny flower on a stem, poking out of the gap and nodding once. */
function FlowerResident({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.div
      className="absolute bottom-0 left-[30px] flex flex-col items-center"
      style={{ originX: "50%", originY: "100%" }}
      initial={{ scaleY: 0 }}
      animate={{ scaleY: 1 }}
      transition={
        motionSafe ? { ...springs.glide, delay: REVEAL_DELAY } : NO_TRANSITION
      }
    >
      <motion.span
        className="relative block h-2 w-2 rounded-full bg-ink-2"
        style={{ originX: "50%", originY: "100%" }}
        initial={{ rotate: 0 }}
        animate={motionSafe ? { rotate: [0, -10, 7, -3, 0] } : { rotate: 0 }}
        transition={
          motionSafe
            ? {
                duration: 0.4,
                ease: easings.move,
                times: [0, 0.25, 0.55, 0.8, 1],
                delay: REVEAL_DELAY + 0.5,
              }
            : NO_TRANSITION
        }
      >
        <span className="absolute top-1/2 left-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
      </motion.span>
      <span className="h-3 w-px bg-ink-3" />
    </motion.div>
  );
}
