"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type DrawbridgeProps = {
  /** The near island's content — always reachable. */
  near: React.ReactNode;
  /** The far island's content — reachable only while bridged. */
  far: React.ReactNode;
  bridged?: boolean;
  defaultBridged?: boolean;
  onBridgedChange?: (bridged: boolean) => void;
  lowerLabel?: string;
  raiseLabel?: string;
  /** Stage height in px. @default 250 */
  height?: number;
  className?: string;
};

/** Deck angle when raised, degrees off the horizon. */
const RAISED_DEG = 72;

/**
 * A drawbridge between two content islands — lowering pays the chains out
 * from the gantry as the deck swings down on the glide spring, thumping the
 * far abutment on the recoil when it lands; a traveler crosses once to prove
 * the span. Raising winds it back and the far island dims out of reach. The
 * chains' sag is drawn from the same angle value that drives the deck, so
 * the rig never disagrees with itself. Under reduced motion the deck fades
 * between states with the same semantics.
 */
export function Drawbridge({
  near,
  far,
  bridged: bridgedProp,
  defaultBridged = false,
  onBridgedChange,
  lowerLabel = "Lower the bridge",
  raiseLabel = "Raise the bridge",
  height = 250,
  className,
}: DrawbridgeProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultBridged);
  const bridged = bridgedProp ?? uncontrolled;
  const [landed, setLanded] = React.useState(bridged);
  const angle = useMotionValue(bridged ? 0 : RAISED_DEG);
  const traveler = useMotionValue(0);
  const thump = useMotionValue(0);
  const controlsRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const stopAll = () => {
    for (const c of controlsRef.current) c.stop();
    controlsRef.current = [];
  };
  React.useEffect(() => stopAll, []);

  // Drive the deck whenever the bridged state changes (user or controlled).
  const [prevBridged, setPrevBridged] = React.useState(bridged);
  if (bridged !== prevBridged) {
    setPrevBridged(bridged);
    if (!bridged) setLanded(false);
  }
  React.useEffect(() => {
    stopAll();
    if (!motionSafe) {
      // No animation — `showLanded` derives straight from `bridged` below.
      angle.set(bridged ? 0 : RAISED_DEG);
      return;
    }
    if (bridged) {
      controlsRef.current.push(
        animate(angle, 0, {
          ...springs.glide,
          onComplete: () => {
            // The deck lands on the far abutment.
            thump.set(3);
            controlsRef.current.push(animate(thump, 0, springs.recoil));
            setLanded(true);
            traveler.set(0);
            controlsRef.current.push(
              animate(traveler, 1, {
                duration: durations.page,
                ease: [0.65, 0, 0.35, 1],
              }),
            );
          },
        }),
      );
    } else {
      controlsRef.current.push(animate(angle, RAISED_DEG, springs.glide));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridged, motionSafe]);

  const toggle = () => {
    const next = !bridged;
    if (bridgedProp === undefined) setUncontrolled(next);
    onBridgedChange?.(next);
  };

  // Chain geometry — both fall from the gantry tip to the deck's far edge.
  // With the deck hinged at the gap's near side, its far corner traces
  // (cos a, -sin a) × span; the chain sags more as the deck lies flatter.
  const chainPath = useTransform(angle, (a) => {
    const span = 34; // % of stage width the deck covers
    const rad = (a * Math.PI) / 180;
    const tipX = 33 + Math.cos(rad) * span;
    const tipY = 58 - Math.sin(rad) * span * 0.9;
    const sag = mapRange(a, 0, RAISED_DEG, 10, 1);
    const midX = (33 + tipX) / 2 + 2;
    const midY = (16 + tipY) / 2 + sag;
    return `M 33 16 Q ${midX} ${midY} ${tipX} ${tipY}`;
  });
  const travelerX = useTransform(traveler, (t) => `${36 + t * 28}%`);
  const travelerOpacity = useTransform(traveler, (t) =>
    t <= 0 || t >= 1 ? 0 : 1,
  );
  const deckRotate = useTransform(angle, (a) => -a);
  // Rich motion lands via the animation's completion; reduced motion is
  // instantaneous, so the landing state derives directly from `bridged`.
  const showLanded = motionSafe ? landed : bridged;

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        aria-expanded={bridged}
        onClick={toggle}
        className="border-hairline bg-surface-2 text-ink-2 hover:text-ink focus-visible:ring-cobalt-bright/50 mb-2 rounded-2 border px-3 py-1 font-mono text-[10px] tracking-wide outline-none focus-visible:ring-2"
      >
        {bridged ? raiseLabel : lowerLabel}
      </button>

      <motion.div
        style={{ height, y: thump, perspective: perspectives.base }}
        className="border-hairline bg-surface-0 relative overflow-hidden rounded-3 border"
      >
        {/* the moat */}
        <div
          aria-hidden
          className="absolute inset-x-[33%] top-[58%] bottom-0"
          style={{
            background:
              "linear-gradient(to bottom, oklch(0.3 0.05 258 / 0.25), oklch(0.14 0.04 258 / 0.5))",
          }}
        />

        {/* near island */}
        <div className="border-hairline bg-surface-1 absolute top-[38%] bottom-0 left-0 w-[33%] rounded-tr-2 border p-3">
          <p className="text-label text-ink-3 mb-1.5">NEAR BANK</p>
          {near}
        </div>

        {/* far island — reachable only when bridged */}
        <div
          aria-hidden={!showLanded}
          className={cn(
            "border-hairline bg-surface-1 absolute top-[38%] right-0 bottom-0 w-[33%] rounded-tl-2 border p-3 transition-opacity duration-200",
            showLanded ? "opacity-100" : "pointer-events-none opacity-40",
          )}
        >
          <p className="text-label text-ink-3 mb-1.5">FAR BANK</p>
          {far}
        </div>

        {/* gantry tower + chain */}
        <div
          aria-hidden
          className="bg-hairline-strong absolute top-[8%] left-[32.6%] h-[30%] w-1 rounded-t-sm"
        />
        <svg
          aria-hidden
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <motion.path
            d={chainPath}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth={0.7}
            strokeDasharray="1.6 1.2"
          />
        </svg>

        {/* the deck, hinged at the near edge of the gap */}
        <motion.div
          aria-hidden
          className="border-hairline bg-surface-2 absolute top-[56%] left-[33%] h-2.5 w-[34%] rounded-r-1 border"
          style={{
            rotateZ: deckRotate,
            transformOrigin: "0% 50%",
          }}
        >
          {/* deck planks */}
          <span className="bg-hairline absolute inset-y-0 left-1/4 w-px" />
          <span className="bg-hairline absolute inset-y-0 left-2/4 w-px" />
          <span className="bg-hairline absolute inset-y-0 left-3/4 w-px" />
        </motion.div>

        {/* the traveler that proves the span */}
        <motion.span
          aria-hidden
          className="bg-cobalt-bright absolute top-[54.4%] size-1.5 rounded-full"
          style={{ left: travelerX, opacity: travelerOpacity }}
        />
      </motion.div>

      <span className="sr-only" aria-live="polite" role="status">
        {showLanded ? "Bridged" : "Raised"}
      </span>
    </div>
  );
}
