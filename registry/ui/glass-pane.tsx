"use client";

import * as React from "react";

import { motion, useMotionTemplate, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  usePointerFine,
  usePointerTilt,
} from "@/registry/hooks/use-pointer-tilt";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GlassSheet = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export type GlassPaneProps = {
  /** Two to four sheets, rear first. */
  sheets: GlassSheet[];
  /** Peak separation per sheet step, in px. @default 12 */
  separation?: number;
  /** Stage height in px. @default 230 */
  height?: number;
  className?: string;
};

/**
 * Stacked translucent sheets that separate in depth when your hand arrives —
 * each sheet slides out along its own diagonal on the glide spring while a
 * specular highlight tracks the pointer across the top glass. Keyboard focus
 * inside any sheet separates the stack the same way. Under reduced motion the
 * sheets rest slightly fanned with a fixed highlight.
 */
export function GlassPane({
  sheets,
  separation = 12,
  height = 230,
  className,
}: GlassPaneProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const live = motionSafe && pointerFine;
  const [engaged, setEngaged] = React.useState(false);
  const tilt = usePointerTilt({ maxTilt: 0, disabled: !live });

  const list = sheets.slice(0, 4);
  const rear = list.length - 1;

  // Specular highlight riding the unsprung pointer across the top sheet.
  const glareX = useTransform(tilt.pointerX, (v) => `${v}%`);
  const glareY = useTransform(tilt.pointerY, (v) => `${v}%`);
  const glare = useMotionTemplate`radial-gradient(200px circle at ${glareX} ${glareY}, rgb(255 255 255 / 0.14), transparent 70%)`;

  const open = engaged || !motionSafe;

  return (
    <div
      {...(live ? tilt.handlers : {})}
      onPointerEnter={(e) => {
        if (live) {
          tilt.handlers.onPointerEnter(e);
          setEngaged(true);
        }
      }}
      onPointerLeave={() => {
        if (live) {
          tilt.handlers.onPointerLeave();
          setEngaged(false);
        }
      }}
      onFocus={() => setEngaged(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setEngaged(false);
        }
      }}
      style={{ height }}
      className={cn("relative w-full", className)}
    >
      {list.map((sheet, i) => {
        // Rear sheets slide up-left, front sheets down-right.
        const step = rear === 0 ? 0 : i - rear / 2;
        const openX = step * separation * 0.7;
        const openY = step * separation;
        const restX = motionSafe ? 0 : openX * 0.5;
        const restY = motionSafe ? 0 : openY * 0.5;
        const isTop = i === rear;
        return (
          <motion.div
            key={sheet.id}
            initial={false}
            animate={
              open
                ? { x: openX, y: openY, opacity: 1 }
                : { x: restX, y: restY, opacity: 0.92 }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
            style={{ zIndex: i }}
            className={cn(
              "border-hairline absolute inset-0 rounded-3 border p-4 backdrop-blur-sm",
              "bg-surface-2/55",
              isTop && "bg-surface-2/70",
            )}
          >
            <p className="text-label text-ink-3">{sheet.label}</p>
            <div className="mt-2">{sheet.content}</div>
            {isTop && motionSafe ? (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3"
                style={{ background: glare, opacity: engaged ? 1 : 0 }}
              />
            ) : null}
          </motion.div>
        );
      })}
    </div>
  );
}
