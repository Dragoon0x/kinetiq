"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type IsoBlock = {
  id: string;
  label: string;
  /** Storeys, 1–3. @default 1 */
  storeys?: 1 | 2 | 3;
  /** Base hue, degrees oklch. @default indexed */
  hue?: number;
};

export type IsoBlocksProps = {
  /** Four to twelve blocks, laid on a near-square grid. */
  blocks: IsoBlock[];
  onInspect?: (id: string) => void;
  /** Grid cell width in px. @default 64 */
  cell?: number;
  className?: string;
  "aria-label"?: string;
};

/** Per-storey height in px. */
const STOREY = 16;
/** Hover/focus lift in px. */
const LIFT = 10;

/** The three iso faces, as clip-path polygons of a w × (w/2 + depth) box. */
const isoFaces = (w: number, depth: number) => {
  const half = w / 2;
  const rim = half / 2; // top rhombus half-height
  return {
    box: { width: w, height: half + depth },
    top: `polygon(${half}px 0, ${w}px ${rim}px, ${half}px ${rim * 2}px, 0 ${rim}px)`,
    left: `polygon(0 ${rim}px, ${half}px ${rim * 2}px, ${half}px ${rim * 2 + depth}px, 0 ${rim + depth}px)`,
    right: `polygon(${half}px ${rim * 2}px, ${w}px ${rim}px, ${w}px ${rim + depth}px, ${half}px ${rim * 2 + depth}px)`,
  };
};

/**
 * An isometric block city drawn entirely in flat 2D — every cuboid is three
 * clip-path faces shaded from one hue, so no 3D transform ever runs and the
 * projection is Safari-proof by construction. Hovering or focusing a block
 * raises it on the snap spring and lights its roof; pressing inspects it.
 * Under reduced motion the city reads top-down as a flat tile survey.
 */
export function IsoBlocks({
  blocks,
  onInspect,
  cell = 64,
  className,
  "aria-label": ariaLabel = "Block city",
}: IsoBlocksProps) {
  const motionSafe = useMotionSafe();
  const list = blocks.slice(0, 12);
  const cols = Math.ceil(Math.sqrt(list.length));

  if (!motionSafe) {
    // Flat top-down survey: same buttons, no projection.
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        className={cn("grid gap-2", className)}
      >
        {list.map((block, i) => {
          const hue = block.hue ?? (i * 137.5 + 40) % 360;
          return (
            <button
              key={block.id}
              type="button"
              onClick={() => onInspect?.(block.id)}
              className="border-hairline hover:border-hairline-strong focus-visible:ring-cobalt-bright/50 rounded-2 border p-2 text-left transition-colors outline-none focus-visible:ring-2"
              style={{ background: `oklch(0.32 0.05 ${hue} / 0.5)` }}
            >
              <span className="text-ink block truncate font-mono text-[10px]">
                {block.label}
              </span>
              <span className="text-ink-3 block font-mono text-[9px]">
                {block.storeys ?? 1} STOREY
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Iso layout: cell (col,row) → screen (x, y); later rows paint in front.
  const w = cell;
  const rows = Math.ceil(list.length / cols);
  const stageW = ((cols + rows) * w) / 2 + w / 2;
  const stageH = ((cols + rows) * w) / 4 + STOREY * 3 + LIFT + w / 2;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("relative mx-auto", className)}
      style={{ width: stageW, height: stageH, maxWidth: "100%" }}
    >
      {list.map((block, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const depth = (block.storeys ?? 1) * STOREY;
        const faces = isoFaces(w, depth);
        const x = ((col - row) * w) / 2 + ((rows - 1) * w) / 2;
        const y = ((col + row) * w) / 4 + LIFT + STOREY * 3 - depth;
        const hue = block.hue ?? (i * 137.5 + 40) % 360;
        return (
          <BlockButton
            key={block.id}
            block={block}
            faces={faces}
            x={x}
            y={y}
            z={col + row}
            hue={hue}
            onInspect={onInspect}
          />
        );
      })}
    </div>
  );
}

function BlockButton({
  block,
  faces,
  x,
  y,
  z,
  hue,
  onInspect,
}: {
  block: IsoBlock;
  faces: ReturnType<typeof isoFaces>;
  x: number;
  y: number;
  z: number;
  hue: number;
  onInspect?: (id: string) => void;
}) {
  const [lit, setLit] = React.useState(false);

  return (
    <motion.button
      type="button"
      aria-label={`Inspect ${block.label}`}
      onClick={() => onInspect?.(block.id)}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
      initial={false}
      animate={{ y: lit ? y - LIFT : y }}
      transition={springs.snap}
      className="focus-visible:ring-cobalt-bright/60 absolute rounded-1 outline-none focus-visible:ring-2"
      style={{
        left: x,
        top: 0,
        width: faces.box.width,
        height: faces.box.height,
        zIndex: z,
      }}
    >
      {/* roof */}
      <motion.span
        aria-hidden
        className="absolute inset-0"
        initial={false}
        animate={{
          background: lit
            ? `oklch(0.72 0.13 ${hue})`
            : `oklch(0.45 0.07 ${hue})`,
        }}
        transition={{ duration: durations.fast }}
        style={{ clipPath: faces.top }}
      />
      {/* west face */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ clipPath: faces.left, background: `oklch(0.3 0.05 ${hue})` }}
      />
      {/* south face */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ clipPath: faces.right, background: `oklch(0.22 0.04 ${hue})` }}
      />
      {/* label plate floats over the roof while lit */}
      <motion.span
        aria-hidden
        initial={false}
        animate={{ opacity: lit ? 1 : 0, y: lit ? -6 : 0 }}
        transition={{ duration: durations.fast }}
        className="border-hairline bg-surface-0/90 absolute -top-5 left-1/2 -translate-x-1/2 rounded-1 border px-1.5 py-0.5 font-mono text-[9px] whitespace-nowrap backdrop-blur-sm"
      >
        {block.label}
      </motion.span>
    </motion.button>
  );
}
