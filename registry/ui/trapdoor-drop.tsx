"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type TrapdoorDropProps = {
  /** The item standing on the doors. */
  children: React.ReactNode;
  /** Change this when repopulating — the new item lowers onto the doors. */
  itemKey?: string;
  /** Fires once when the item has fallen through. */
  onDrop?: () => void;
  armLabel?: string;
  dropLabel?: string;
  disarmLabel?: string;
  /** Stage height in px. @default 240 */
  height?: number;
  className?: string;
};

type Stage = "ready" | "armed" | "dropping" | "empty";

/**
 * A two-stage disposal platform — arming slides the bolts aside and the item
 * wobbles uneasily; confirming swings both door leaves down from their outer
 * hinges and the item accelerates into the well on a gravity tween while the
 * depth rings blink past. The leaves clap shut on the snap spring and the
 * frame takes the recoil. A changed itemKey lowers the next item onto the
 * doors. Under reduced motion the drop is an instant fade with the same
 * two-stage semantics.
 */
export function TrapdoorDrop({
  children,
  itemKey,
  onDrop,
  armLabel = "Dismiss",
  dropLabel = "Confirm drop",
  disarmLabel = "Keep it",
  height = 240,
  className,
}: TrapdoorDropProps) {
  const motionSafe = useMotionSafe();
  const [stage, setStage] = React.useState<Stage>("ready");
  const [status, setStatus] = React.useState("Ready");
  const droppedRef = React.useRef(false);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const leftLeaf = useMotionValue(0);
  const rightLeaf = useMotionValue(0);
  const itemY = useMotionValue(0);
  const itemScale = useMotionValue(1);
  const itemOpacity = useMotionValue(1);
  const itemWobble = useMotionValue(0);
  const frameY = useMotionValue(0);
  const boltSlide = useMotionValue(0);
  const boltSlideNeg = useTransform(boltSlide, (v) => -v);

  const stopAll = () => {
    for (const c of controlsRef.current) c.stop();
    controlsRef.current = [];
  };
  React.useEffect(() => stopAll, []);

  // A changed itemKey repopulates the platform. State adjusts during render
  // (the sanctioned adjust-on-change idiom); all side effects — motion-value
  // resets and the lower-in glide — run in the keyed effect below.
  const [prevKey, setPrevKey] = React.useState(itemKey);
  if (itemKey !== prevKey) {
    setPrevKey(itemKey);
    if (stage !== "ready") {
      setStage("ready");
      setStatus("Ready");
    }
  }

  React.useEffect(() => {
    // Reset the rig for the (re)populated item; on mount this seats it.
    droppedRef.current = false;
    stopAll();
    leftLeaf.set(0);
    rightLeaf.set(0);
    boltSlide.set(0);
    itemWobble.set(0);
    itemScale.set(1);
    itemOpacity.set(1);
    if (motionSafe) {
      itemY.set(-height * 0.4);
      controlsRef.current.push(animate(itemY, 0, springs.glide));
    } else {
      itemY.set(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevKey]);

  const arm = () => {
    if (stage !== "ready") return;
    setStage("armed");
    setStatus("Armed");
    if (motionSafe) {
      stopAll();
      controlsRef.current.push(animate(boltSlide, 14, springs.snap));
      itemWobble.set(1.5);
      controlsRef.current.push(animate(itemWobble, 0, springs.recoil));
    } else {
      boltSlide.set(14);
    }
  };

  const disarm = () => {
    if (stage !== "armed") return;
    setStage("ready");
    setStatus("Ready");
    if (motionSafe) {
      stopAll();
      controlsRef.current.push(animate(boltSlide, 0, springs.snap));
    } else {
      boltSlide.set(0);
    }
  };

  const finishDrop = () => {
    if (droppedRef.current) return; // single-fire guard
    droppedRef.current = true;
    setStage("empty");
    setStatus("Dropped");
    onDrop?.();
  };

  const drop = () => {
    if (stage !== "armed") return;
    setStage("dropping");
    if (!motionSafe) {
      itemOpacity.set(0);
      finishDrop();
      return;
    }
    stopAll();
    // Leaves swing down-open from their outer hinges, slightly staggered.
    controlsRef.current.push(
      animate(leftLeaf, 78, { duration: durations.base, ease: easings.exit }),
      animate(rightLeaf, 78, {
        duration: durations.base,
        ease: easings.exit,
        delay: 0.04,
      }),
      // The item takes the long way down.
      animate(itemY, height * 0.9, {
        duration: durations.slow,
        ease: easings.exit,
        delay: 0.05,
      }),
      animate(itemScale, 0.55, {
        duration: durations.slow,
        ease: easings.exit,
        delay: 0.05,
      }),
      animate(itemOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
        delay: 0.12,
        onComplete: () => {
          // Doors clap shut; the frame takes the hit.
          const shutLeft = animate(leftLeaf, 0, springs.snap);
          const shutRight = animate(rightLeaf, 0, {
            ...springs.snap,
            onComplete: () => {
              frameY.set(2);
              controlsRef.current.push(animate(frameY, 0, springs.recoil));
              const home = animate(boltSlide, 0, springs.snap);
              controlsRef.current.push(home);
              finishDrop();
            },
          });
          controlsRef.current.push(shutLeft, shutRight);
        },
      }),
    );
  };

  const empty = stage === "empty";

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex gap-1.5">
        {stage === "armed" || stage === "dropping" ? (
          <>
            <button
              type="button"
              disabled={stage === "dropping"}
              onClick={drop}
              className="border-hairline-strong bg-cobalt-wash text-cobalt-bright focus-visible:ring-cobalt-bright/50 rounded-2 border px-3 py-1 font-mono text-[10px] tracking-wide outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              {dropLabel}
            </button>
            <button
              type="button"
              disabled={stage === "dropping"}
              onClick={disarm}
              onKeyDown={(e) => {
                if (e.key === "Escape") disarm();
              }}
              className="border-hairline text-ink-3 hover:text-ink focus-visible:ring-cobalt-bright/50 rounded-2 border px-3 py-1 font-mono text-[10px] tracking-wide outline-none focus-visible:ring-2 disabled:opacity-40"
            >
              {disarmLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={empty}
            onClick={arm}
            className="border-hairline bg-surface-2 text-ink-2 hover:text-ink focus-visible:ring-cobalt-bright/50 rounded-2 border px-3 py-1 font-mono text-[10px] tracking-wide outline-none focus-visible:ring-2 disabled:opacity-40"
          >
            {armLabel}
          </button>
        )}
      </div>

      <div
        onKeyDown={(e) => {
          if (e.key === "Escape" && stage === "armed") disarm();
        }}
        style={{ height, perspective: perspectives.base }}
        className="border-hairline bg-surface-0 relative overflow-hidden rounded-3 border"
      >
        {/* the depth well */}
        <div
          aria-hidden
          className="absolute inset-x-8 top-1/2 bottom-3"
          style={{
            background:
              "linear-gradient(to bottom, transparent, oklch(0.08 0.01 258 / 0.85) 70%)",
          }}
        >
          {[0.25, 0.5, 0.78].map((t, i) => (
            <WellRing key={t} t={t} index={i} active={stage === "dropping"} motionSafe={motionSafe} />
          ))}
        </div>

        <motion.div style={{ y: frameY }} className="absolute inset-0">
          {/* door leaves at mid-height */}
          <div aria-hidden className="absolute inset-x-8 top-1/2 h-3 -translate-y-1/2">
            <motion.span
              className="border-hairline bg-surface-2 absolute top-0 left-0 h-full w-1/2 rounded-l-1 border"
              style={{
                rotateX: leftLeaf,
                transformOrigin: "0% 50%",
                transformPerspective: perspectives.base,
              }}
            />
            <motion.span
              className="border-hairline bg-surface-2 absolute top-0 right-0 h-full w-1/2 rounded-r-1 border"
              style={{
                rotateX: rightLeaf,
                transformOrigin: "100% 50%",
                transformPerspective: perspectives.base,
              }}
            />
            {/* bolts */}
            <motion.span
              aria-hidden
              className="bg-hairline-strong absolute top-1/2 left-[46%] h-0.5 w-3 -translate-y-1/2"
              style={{ x: boltSlide }}
            />
            <motion.span
              aria-hidden
              className="bg-hairline-strong absolute top-1/2 right-[46%] h-0.5 w-3 -translate-y-1/2"
              style={{ x: boltSlideNeg }}
            />
          </div>

          {/* the item on its pallet */}
          {!empty ? (
            <motion.div
              style={{
                y: itemY,
                scale: itemScale,
                opacity: itemOpacity,
                rotateZ: itemWobble,
              }}
              className="absolute inset-x-0 top-1/2 flex -translate-y-full justify-center pb-2"
            >
              <div className="border-hairline bg-surface-1 rounded-2 border px-4 py-3">
                {children}
              </div>
            </motion.div>
          ) : (
            <div className="text-ink-3 absolute inset-x-0 top-1/2 -translate-y-full pb-3 text-center font-mono text-[10px]">
              PLATFORM EMPTY
            </div>
          )}
        </motion.div>
      </div>

      <span className="sr-only" aria-live="polite" role="status">
        {status}
      </span>
    </div>
  );
}

function WellRing({
  t,
  index,
  active,
  motionSafe,
}: {
  t: number;
  index: number;
  active: boolean;
  motionSafe: boolean;
}) {
  return (
    <motion.span
      aria-hidden
      initial={false}
      animate={
        active && motionSafe
          ? { opacity: 0.7 }
          : { opacity: 0.18 }
      }
      transition={{
        duration: durations.fast,
        delay: active && motionSafe ? index * cascade(3) * 3 : 0,
      }}
      className="border-hairline-strong absolute rounded-[50%] border"
      style={{
        left: `${12 + index * 10}%`,
        right: `${12 + index * 10}%`,
        top: `${t * 100}%`,
        height: 8 - index * 2,
      }}
    />
  );
}
