"use client";

import * as React from "react";

import { MousePointer2 } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type CopresenceHand = {
  id: string;
  name: string;
  /** CSS color for the cursor and its name chip. */
  tone: string;
};

export type VignetteCopresenceProps = {
  /**
   * "canvas" is a headline under selection with a dimension tag;
   * "board" is a work card being walked between two columns.
   */
  scene?: "canvas" | "board";
  hands?: [CopresenceHand, CopresenceHand];
  /** The comment one hand leaves mid-loop. */
  remark?: string;
  /** Seconds for one full loop. @default 12 */
  loopSeconds?: number;
  className?: string;
};

const DEFAULT_HANDS: [CopresenceHand, CopresenceHand] = [
  { id: "h1", name: "Ines", tone: "var(--primary)" },
  { id: "h2", name: "Piet", tone: "var(--success, #047857)" },
];

/**
 * Two hands on the same surface: named cursors gliding their own errands, a
 * live selection with its measurements printed, and a remark that arrives,
 * holds, and clears — the multiplayer moment as a scene rather than a claim.
 * Everything is authored keyframes on one shared clock, so the loop reads as
 * a morning's minute, not a screensaver. Presentational, marked as one image.
 *
 * Reduced motion: the scene holds still mid-errand with the remark shown.
 */
export function VignetteCopresence({
  scene = "canvas",
  hands = DEFAULT_HANDS,
  remark = "Holds until the crane clears.",
  loopSeconds = 12,
  className,
}: VignetteCopresenceProps) {
  const motionSafe = useMotionSafe();
  const [ines, piet] = hands;
  const L = Math.max(6, loopSeconds);
  const run = motionSafe
    ? { duration: L, repeat: Infinity, ease: "easeInOut" as const }
    : { duration: 0 };

  const cursor = (hand: CopresenceHand, flip?: boolean) => (
    <span className="flex items-start" style={{ color: hand.tone }}>
      <MousePointer2
        className={cn("size-3.5", flip && "-scale-x-100")}
        fill="currentColor"
      />
      <span
        className="mt-2.5 -ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white"
        style={{ backgroundColor: hand.tone }}
      >
        {hand.name}
      </span>
    </span>
  );

  return (
    <div
      role="img"
      aria-label={`${ines.name} and ${piet.name} working the same ${
        scene === "canvas" ? "sheet" : "board"
      }; a remark reads: ${remark}`}
      className={cn("w-full max-w-sm", className)}
    >
      <div
        aria-hidden
        className="relative h-[200px] overflow-hidden rounded-4 border border-hairline bg-surface-1"
      >
        {/* Presence roll, top right. */}
        <span className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          <span className="flex -space-x-1">
            {hands.map((hand) => (
              <span
                key={hand.id}
                className="grid size-4 place-items-center rounded-full border border-surface-1 text-[8px] font-semibold text-white"
                style={{ backgroundColor: hand.tone }}
              >
                {hand.name[0]}
              </span>
            ))}
          </span>
          <span className="font-mono text-[9px] tracking-[0.06em] text-ink-3">
            2 here
          </span>
        </span>

        {scene === "canvas" ? (
          <>
            {/* The sheet: a headline under live selection. */}
            <span className="absolute top-[72px] left-1/2 -translate-x-1/2">
              <span className="relative block px-4 py-2.5">
                <span className="block text-center text-base leading-snug font-semibold tracking-tight text-balance text-ink">
                  The morning, on
                  <br />
                  one record.
                </span>
                {/* Selection frame with its measurements printed. */}
                <motion.span
                  animate={motionSafe ? { opacity: [0.7, 1, 0.7] } : undefined}
                  transition={run}
                  className="absolute -inset-0.5 rounded-1 border border-[var(--primary)]"
                >
                  {[
                    "-top-1 -left-1",
                    "-top-1 -right-1",
                    "-bottom-1 -left-1",
                    "-bottom-1 -right-1",
                  ].map((corner) => (
                    <span
                      key={corner}
                      className={cn(
                        "absolute size-1.5 rounded-[2px] border border-[var(--primary)] bg-surface-0",
                        corner,
                      )}
                    />
                  ))}
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-[var(--primary)] px-1.5 py-px font-mono text-[8px] text-white">
                    184 × 44
                  </span>
                </motion.span>
              </span>
            </span>
          </>
        ) : (
          <>
            {/* The board: two thin columns, one card walked across. */}
            {[
              { label: "This tide", left: "12%" },
              { label: "Cleared", left: "58%" },
            ].map((column) => (
              <span
                key={column.label}
                className="absolute top-9 bottom-4 w-[30%] rounded-3 border border-hairline bg-surface-0/60"
                style={{ left: column.left }}
              >
                <span className="block px-2 pt-1.5 text-label text-ink-3">
                  {column.label}
                </span>
              </span>
            ))}
            <motion.span
              animate={
                motionSafe
                  ? {
                      x: [0, 0, 148, 148, 0],
                      opacity: [1, 1, 1, 1, 0],
                    }
                  : undefined
              }
              transition={
                motionSafe
                  ? { ...run, times: [0, 0.25, 0.5, 0.96, 1] }
                  : { duration: 0 }
              }
              className="absolute top-[68px] left-[16%] block w-[22%] rounded-2 border border-hairline bg-surface-2 px-2 py-1.5 shadow-raised"
            >
              <span className="block text-[10px] font-medium text-ink">
                Crane 2 hold
              </span>
              <span className="block font-mono text-[8px] text-ink-3">
                berth 4
              </span>
            </motion.span>
          </>
        )}

        {/* The remark arrives, holds, and clears on the shared clock. */}
        <motion.span
          animate={
            motionSafe
              ? { opacity: [0, 0, 1, 1, 0], scale: [0.92, 0.92, 1, 1, 0.98] }
              : undefined
          }
          transition={
            motionSafe
              ? { ...run, times: [0, 0.42, 0.48, 0.88, 1] }
              : { duration: 0 }
          }
          className="absolute bottom-4 left-4 flex max-w-[70%] items-start gap-1.5"
        >
          <span
            className="grid size-4 shrink-0 place-items-center rounded-full text-[8px] font-semibold text-white"
            style={{ backgroundColor: piet.tone }}
          >
            {piet.name[0]}
          </span>
          <span className="rounded-2 rounded-tl-1 border border-hairline bg-surface-0 px-2 py-1 text-[10px] leading-snug text-ink-2">
            {remark}
          </span>
        </motion.span>

        {/* The hands, each on its own errand over the shared clock. */}
        <motion.span
          className="absolute top-0 left-0"
          animate={
            motionSafe
              ? {
                  x:
                    scene === "canvas"
                      ? [36, 150, 210, 96, 36]
                      : [40, 96, 196, 150, 40],
                  y:
                    scene === "canvas"
                      ? [140, 64, 110, 158, 140]
                      : [70, 120, 84, 150, 70],
                }
              : { x: 46, y: 130 }
          }
          transition={run}
        >
          {cursor(ines)}
        </motion.span>
        <motion.span
          className="absolute top-0 left-0"
          animate={
            motionSafe
              ? {
                  x:
                    scene === "canvas"
                      ? [230, 180, 120, 250, 230]
                      : [220, 170, 110, 236, 220],
                  y:
                    scene === "canvas"
                      ? [60, 150, 90, 120, 60]
                      : [130, 60, 140, 96, 130],
                }
              : { x: 226, y: 84 }
          }
          transition={run}
        >
          {cursor(piet, true)}
        </motion.span>
      </div>
    </div>
  );
}
