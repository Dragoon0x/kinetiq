"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type PeelLayer = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export type LayerPeelProps = {
  /** Two to six layers, top first. */
  layers: PeelLayer[];
  /** Fires when a layer is peeled away, before the next is revealed. */
  onPeel?: (id: string) => void;
  /** Cycle back to the first layer after the last. @default true */
  loop?: boolean;
  /** Stage height in px. @default 230 */
  height?: number;
  className?: string;
};

/** Peel angle (deg) at which a release commits. */
const COMMIT_ANGLE = 72;
/** Peak drag angle. */
const MAX_ANGLE = 128;

/**
 * Grab the corner grip and drag left — the top layer peels back on its left
 * hinge, the sheet beneath scaling up to meet you. Release past the commit
 * detent and the layer tears away (a tween exit — exits never spring); release
 * early and it recoils shut. A peel button gives the keyboard the same tear.
 * Under reduced motion peeling is an instant advance.
 */
export function LayerPeel({
  layers,
  onPeel,
  loop = true,
  height = 230,
  className,
}: LayerPeelProps) {
  const motionSafe = useMotionSafe();
  const list = layers.slice(0, 6);
  const count = list.length;
  const [top, setTop] = React.useState(0);
  const [peeling, setPeeling] = React.useState(false);
  const angle = useMotionValue(0);
  const dragStartX = React.useRef(0);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);

  const stop = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  };
  React.useEffect(() => stop, []);

  const topLayer = list[top % Math.max(count, 1)];
  const nextIndex = count > 0 ? (top + 1) % count : 0;
  const nextLayer = list[nextIndex];
  const atEnd = !loop && top >= count - 1;

  const advance = (peeledId: string) => {
    onPeel?.(peeledId);
    setPeeling(false);
    setTop((t) => (loop ? (t + 1) % count : Math.min(t + 1, count - 1)));
    angle.set(0);
  };

  const commit = (peeledId: string) => {
    stop();
    setPeeling(true);
    controlsRef.current = animate(angle, -MAX_ANGLE - 30, {
      duration: durations.base,
      ease: easings.exit,
      onComplete: () => advance(peeledId),
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!motionSafe || peeling || atEnd) return;
    stop();
    dragStartX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!motionSafe || peeling || atEnd) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = dragStartX.current - event.clientX; // dragging left = positive
    angle.set(-clamp(dx * 0.55, 0, MAX_ANGLE));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!motionSafe || peeling || atEnd) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const current = angle.get();
    if (topLayer && Math.abs(current) >= COMMIT_ANGLE) {
      commit(topLayer.id);
    } else {
      stop();
      controlsRef.current = animate(angle, 0, springs.recoil);
    }
  };

  const peelByButton = () => {
    if (!topLayer || peeling || atEnd) return;
    if (motionSafe) commit(topLayer.id);
    else advance(topLayer.id);
  };

  // Underlayer rises to meet the peel; peel shadow deepens with the angle.
  const underScale = useTransform(angle, [-MAX_ANGLE, 0], [1, 0.96]);
  const underOpacity = useTransform(angle, [-MAX_ANGLE, 0], [1, 0.7]);
  const peelShade = useTransform(angle, [-MAX_ANGLE, 0], [0.45, 0]);

  return (
    <div className={cn("w-full", className)}>
      <div
        className="relative"
        style={{ height, perspective: perspectives.base }}
      >
        {/* the sheet beneath */}
        {nextLayer && (peeling || nextIndex !== top) ? (
          <motion.div
            style={motionSafe ? { scale: underScale, opacity: underOpacity } : undefined}
            className="border-hairline bg-surface-1 absolute inset-0 rounded-3 border p-4"
            aria-hidden
          >
            <p className="text-label text-ink-3">{nextLayer.label}</p>
            <div className="mt-2">{nextLayer.content}</div>
          </motion.div>
        ) : null}

        {/* the top layer, hinged on its left edge */}
        {topLayer ? (
          <motion.div
            key={topLayer.id}
            style={
              motionSafe
                ? {
                    rotateY: angle,
                    transformOrigin: "0% 50%",
                    transformPerspective: perspectives.base,
                  }
                : undefined
            }
            className="border-hairline bg-surface-2 absolute inset-0 rounded-3 border p-4"
          >
            <p className="text-label text-ink-3">{topLayer.label}</p>
            <div className="mt-2">{topLayer.content}</div>
            {/* peel shading — deepens as the sheet lifts */}
            {motionSafe ? (
              <motion.div
                aria-hidden
                style={{ opacity: peelShade }}
                className="pointer-events-none absolute inset-0 rounded-3 bg-gradient-to-l from-black/40 to-transparent"
              />
            ) : null}
            {/* corner grip */}
            <button
              type="button"
              aria-label={atEnd ? "Stack exhausted" : `Peel ${topLayer.label}`}
              disabled={atEnd}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onClick={(e) => {
                // A plain click (no meaningful drag) peels via the button path.
                if (Math.abs(angle.get()) < 2) {
                  e.preventDefault();
                  peelByButton();
                }
              }}
              className="border-hairline-strong bg-surface-1 text-ink-3 hover:text-ink focus-visible:ring-cobalt-bright/50 absolute right-2 bottom-2 flex h-7 cursor-grab touch-none items-center gap-1 rounded-2 border px-2 font-mono text-[10px] outline-none focus-visible:ring-2 active:cursor-grabbing disabled:opacity-40"
            >
              <span aria-hidden>⌐</span> PEEL
            </button>
          </motion.div>
        ) : null}
      </div>

      <span aria-live="polite" className="sr-only" role="status">
        {atEnd
          ? "Stack exhausted"
          : `${topLayer?.label ?? ""} on top, ${count} layers`}
      </span>
    </div>
  );
}
