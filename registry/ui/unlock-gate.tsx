"use client";

import * as React from "react";

import { Lock, LockOpen } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";
import { durations, easings, springs } from "@/registry/lib/motion";
import { Readout } from "@/registry/ui/readout";

/** How long the transient "still locked" caption holds before it clears. */
const CAPTION_MS = 1400;
/** Fixed spark count and spread for the unlock burst — never random. */
const SPARK_COUNT = 8;
const SPARK_SPREAD = 26;
const TAU = Math.PI * 2;

function sparkVectors(spread: number): { dx: number; dy: number }[] {
  return Array.from({ length: SPARK_COUNT }, (_, i) => {
    const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
    return { dx: Math.cos(angle) * spread, dy: Math.sin(angle) * spread };
  });
}

const SPARKS = sparkVectors(SPARK_SPREAD);

type GateStage = "locked" | "revealing" | "unlocked";

type LockPlateProps = {
  title: string;
  requirement: number;
  progress: number;
  motionSafe: boolean;
  fillPct: MotionValue<number>;
  shakeX: MotionValue<number>;
  padlockRattle: MotionValue<number>;
  liftT: MotionValue<number>;
  fallT: MotionValue<number>;
  splitT: MotionValue<number>;
  lockOpenSwapped: boolean;
  flashKey: number;
  disabled: boolean;
  onAdvance: () => void;
};

/** The heavy plate covering the feature: padlock, title, requirement meter,
 * and the Advance control. Owns the derived transforms for its own lift,
 * fall, and split so the parent gate never touches CSS directly. */
function LockPlate({
  title,
  requirement,
  progress,
  motionSafe,
  fillPct,
  shakeX,
  padlockRattle,
  liftT,
  fallT,
  splitT,
  lockOpenSwapped,
  flashKey,
  disabled,
  onAdvance,
}: LockPlateProps): React.JSX.Element {
  const fillWidth = useTransform(
    fillPct,
    (p) => `${Math.min(1, Math.max(0, p)) * 100}%`,
  );
  const liftY = useTransform(liftT, (t) => -t * 10);
  const liftRotate = useTransform(liftT, (t) => -t * 34);
  const fallY = useTransform(fallT, (t) => t * 26);
  const fallOpacity = useTransform(fallT, (t) => 1 - t);
  const leftX = useTransform(splitT, (t) => -t * 70);
  const rightX = useTransform(splitT, (t) => t * 70);
  const plateOpacity = useTransform(splitT, (t) => 1 - t);

  return (
    <motion.div
      className="absolute inset-0 z-10"
      style={{ x: shakeX }}
      initial={motionSafe ? { opacity: 0, scale: 0.97 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1/2 rounded-l-4 border border-hairline-strong bg-surface-2 shadow-raised"
        style={{ x: leftX, opacity: plateOpacity }}
      />
      <motion.span
        aria-hidden
        className="absolute inset-y-0 right-0 w-1/2 rounded-r-4 border border-hairline-strong bg-surface-2 shadow-raised"
        style={{ x: rightX, opacity: plateOpacity }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline-strong"
      />

      <motion.div
        className="relative z-10 flex h-full flex-col items-center justify-center gap-2.5 p-5 text-center"
        style={{ opacity: plateOpacity }}
      >
        <motion.span style={{ y: fallY, opacity: fallOpacity }}>
          <motion.span
            className="flex items-center justify-center"
            style={{ y: liftY, rotate: liftRotate }}
          >
            <motion.span
              className="flex items-center justify-center"
              style={{ rotate: padlockRattle }}
            >
              {lockOpenSwapped ? (
                <LockOpen aria-hidden className="size-6 text-ink-2" />
              ) : (
                <Lock aria-hidden className="size-6 text-ink-2" />
              )}
            </motion.span>
          </motion.span>
        </motion.span>

        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-label text-ink-3">reach level {requirement}</span>

        <div className="relative mt-1 h-2 w-40 overflow-hidden rounded-2 border border-hairline bg-surface-1">
          <motion.div
            className="h-full rounded-[inherit] bg-primary"
            style={{ width: fillWidth }}
          />
          {motionSafe && flashKey > 0 && (
            <motion.span
              key={flashKey}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.6), transparent)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 0.5,
                times: [0, 0.4, 1],
                ease: easings.move,
              }}
            />
          )}
        </div>

        <span className="flex items-baseline gap-1 font-mono text-xs text-ink-2 tabular-nums">
          <Readout value={progress} size="sm" />
          <span>/ {requirement}</span>
        </span>

        <button
          type="button"
          aria-label="Advance progress"
          onClick={onAdvance}
          disabled={disabled}
          className={cn(
            "mt-1 rounded-2 bg-primary px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          advance
        </button>
      </motion.div>
    </motion.div>
  );
}

type FeaturePanelProps = {
  title: string;
  interactive: boolean;
  runCount: number;
  onRun: () => void;
};

/** The genuine payoff behind the plate — a titled card with real stats and a
 * button that only works once the gate has actually opened. */
function FeaturePanel({
  title,
  interactive,
  runCount,
  onRun,
}: FeaturePanelProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2.5 bg-surface-0 p-4">
      <span className="text-sm font-semibold text-ink">{title}</span>
      <div className="flex items-center justify-between font-mono text-xs text-ink-2">
        <span>confidence</span>
        <span className="tabular-nums">98%</span>
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-ink-2">
        <span>runs</span>
        <Readout value={runCount} size="sm" />
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={!interactive}
        className={cn(
          "mt-1 rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-ink uppercase transition-colors",
          "hover:bg-surface-1",
          "disabled:pointer-events-none disabled:opacity-50",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
      >
        run analysis
      </button>
    </div>
  );
}

export type UnlockGateProps = {
  /** Steps needed to clear the gate. @default 8 */
  requirement?: number;
  /** Name of the feature behind the plate. @default "Deep Analysis" */
  title?: string;
  /** Fires once, the instant the requirement is met. */
  onUnlock?: () => void;
  className?: string;
};

/**
 * A locked feature panel that opens once its requirement is met, its
 * padlock and requirement meter sitting over a genuinely interactive
 * feature card underneath. Advance steps the meter on `springs.glide` and
 * rolls the count through `Readout`; every step short of the threshold
 * earns a deliberate refusal — a shake, a padlock rattle, and a mono "still
 * locked" — because a gate that never says no teaches nothing. Reaching the
 * threshold runs the set piece: the meter flashes, the shackle lifts and
 * rotates open before the lock falls away, the plate splits and slides
 * apart, the feature's blur lifts as it brightens, and a sweep with eight
 * sparks lands on an "unlocked" caption while the feature's own button,
 * disabled until that moment, goes genuinely live. Reset slides the plate
 * back, re-seats the lock, and drains the meter so the loop runs again.
 * Reduced motion: no shake, lift, split, sweep, or sparks — the plate is
 * removed in one step, the blur drops instantly, captions still update, and
 * the refusal below threshold reads as a caption rather than a shake.
 */
export function UnlockGate({
  requirement = 8,
  title = "Deep Analysis",
  onUnlock,
  className,
}: UnlockGateProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const req = Math.max(1, Math.round(requirement));

  const [progress, setProgress] = React.useState(0);
  const [stage, setStage] = React.useState<GateStage>("locked");
  const [lockOpenSwapped, setLockOpenSwapped] = React.useState(false);
  const [flashKey, setFlashKey] = React.useState(0);
  const [sweepKey, setSweepKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [captionText, setCaptionText] = React.useState("");
  const [announce, setAnnounce] = React.useState("");
  const [runCount, setRunCount] = React.useState(0);
  const [unlockToken, setUnlockToken] = React.useState(0);

  const fillPct = useMotionValue<number>(0);
  const shakeX = useMotionValue<number>(0);
  const padlockRattle = useMotionValue<number>(0);
  const liftT = useMotionValue<number>(0);
  const fallT = useMotionValue<number>(0);
  const splitT = useMotionValue<number>(0);

  const idCounter = React.useRef(0);
  const captionTimer = React.useRef<number | null>(null);
  const fillAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shakeAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const rattleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const liftAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const fallAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const splitAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const stopAllAnims = () => {
    fillAnim.current?.stop();
    shakeAnim.current?.stop();
    rattleAnim.current?.stop();
    liftAnim.current?.stop();
    fallAnim.current?.stop();
    splitAnim.current?.stop();
  };

  React.useEffect(() => {
    return () => {
      fillAnim.current?.stop();
      shakeAnim.current?.stop();
      rattleAnim.current?.stop();
      liftAnim.current?.stop();
      fallAnim.current?.stop();
      splitAnim.current?.stop();
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
    };
  }, []);

  const driveFill = (target: number) => {
    fillAnim.current?.stop();
    if (!motionSafe) {
      fillPct.set(target);
      return;
    }
    fillAnim.current = animate(fillPct, target, springs.glide);
  };

  const triggerRefusal = () => {
    setCaptionText("still locked");
    setAnnounce("Still locked.");
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setCaptionText((c) => (c === "still locked" ? "" : c));
    }, CAPTION_MS);

    if (!motionSafe) return;

    shakeAnim.current?.stop();
    shakeX.set(0);
    shakeAnim.current = animate(shakeX, [0, -6, 6, -4, 3, 0], {
      duration: 0.4,
      times: [0, 0.15, 0.38, 0.6, 0.8, 1],
      ease: easings.move,
    });

    rattleAnim.current?.stop();
    padlockRattle.set(0);
    rattleAnim.current = animate(padlockRattle, [0, -8, 8, -5, 0], {
      duration: 0.36,
      times: [0, 0.25, 0.55, 0.8, 1],
      ease: easings.move,
    });
  };

  const commitUnlockInstant = () => {
    fillPct.set(1);
    setLockOpenSwapped(true);
    setStage("unlocked");
    setCaptionText("unlocked");
    setAnnounce(`Unlocked ${title}.`);
  };

  // The unlock chain: shackle lifts and rotates open, the lock falls away,
  // then the plate splits and slides apart. Each stage only starts from the
  // previous stage's onComplete, so stopping whichever is current (in
  // stopAllAnims, called on reset and unmount) cancels the whole chain.
  React.useEffect(() => {
    if (unlockToken === 0 || !motionSafe) return;

    liftAnim.current?.stop();
    liftT.set(0);
    liftAnim.current = animate(liftT, 1, {
      duration: durations.base,
      ease: easings.enter,
      onComplete: () => {
        setLockOpenSwapped(true);
        fallAnim.current?.stop();
        fallT.set(0);
        fallAnim.current = animate(fallT, 1, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            splitAnim.current?.stop();
            splitT.set(0);
            splitAnim.current = animate(splitT, 1, {
              duration: durations.slow,
              ease: easings.exit,
              onComplete: () => {
                setStage("unlocked");
                setSweepKey((k) => k + 1);
                setSparkKey((k) => k + 1);
                setCaptionText("unlocked");
                setAnnounce(`Unlocked ${title}.`);
              },
            });
          },
        });
      },
    });
  }, [unlockToken, motionSafe, liftT, fallT, splitT, title]);

  const handleAdvance = () => {
    if (stage !== "locked") return;
    const next = Math.min(progress + 1, req);
    if (next === progress) return;

    setProgress(next);
    driveFill(next / req);

    if (next >= req) {
      onUnlock?.();
      if (!motionSafe) {
        commitUnlockInstant();
        return;
      }
      setStage("revealing");
      setFlashKey((k) => k + 1);
      idCounter.current += 1;
      setUnlockToken(idCounter.current);
    } else {
      setAnnounce(`${next} of ${req}.`);
      triggerRefusal();
    }
  };

  const handleReset = () => {
    if (progress === 0 && stage === "locked") return;

    stopAllAnims();
    if (captionTimer.current !== null) {
      window.clearTimeout(captionTimer.current);
      captionTimer.current = null;
    }

    fillPct.set(0);
    shakeX.set(0);
    padlockRattle.set(0);
    liftT.set(0);
    fallT.set(0);
    splitT.set(0);

    setProgress(0);
    setStage("locked");
    setLockOpenSwapped(false);
    setCaptionText("");
    setAnnounce("Reset. Locked again.");
  };

  const resetDisabled = progress === 0 && stage === "locked";

  return (
    <div
      className={cn(
        "w-full max-w-xs rounded-4 border border-hairline bg-surface-1 p-5 shadow-raised",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-3 border border-hairline-strong">
        <div
          className={cn(
            "transition-[filter] ease-out",
            motionSafe ? "duration-700" : "duration-0",
            stage === "unlocked"
              ? "blur-none brightness-100"
              : "blur-sm brightness-75",
          )}
        >
          <FeaturePanel
            title={title}
            interactive={stage === "unlocked"}
            runCount={runCount}
            onRun={() => setRunCount((c) => c + 1)}
          />
        </div>

        {motionSafe && sweepKey > 0 && (
          <motion.span
            key={sweepKey}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-1/3"
            style={{
              skewX: -14,
              background: "var(--primary-foreground)",
              opacity: 0.1,
            }}
            initial={{ x: "-160%" }}
            animate={{ x: "360%" }}
            transition={{ duration: 0.6, ease: easings.linear }}
          />
        )}

        {motionSafe && sparkKey > 0 && (
          <span
            key={sparkKey}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute size-1 rounded-full bg-primary"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}

        {stage !== "unlocked" && (
          <LockPlate
            key="plate"
            title={title}
            requirement={req}
            progress={progress}
            motionSafe={motionSafe}
            fillPct={fillPct}
            shakeX={shakeX}
            padlockRattle={padlockRattle}
            liftT={liftT}
            fallT={fallT}
            splitT={splitT}
            lockOpenSwapped={lockOpenSwapped}
            flashKey={flashKey}
            disabled={stage !== "locked"}
            onAdvance={handleAdvance}
          />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3"
        >
          <AnimatePresence mode="wait" initial={false}>
            {captionText && (
              <motion.span
                key={captionText}
                initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        y: -4,
                        transition: {
                          duration: durations.fast,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={
                  motionSafe
                    ? { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
                className="tracking-[0.06em] uppercase"
              >
                {captionText}
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <button
          type="button"
          onClick={handleReset}
          disabled={resetDisabled}
          className="text-label text-ink-3 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-40"
        >
          reset
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
