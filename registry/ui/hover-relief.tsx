"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { springs } from "@/registry/lib/motion";
import { liftShadow } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type ReliefTile = {
  id: string;
  label: string;
  glyph?: React.ReactNode;
  hint?: string;
};

export type HoverReliefProps = {
  /** Six to twenty-four tiles. */
  tiles: ReliefTile[];
  /** @default 4 */
  columns?: number;
  /** Peak extrusion in px. @default 16 */
  maxLift?: number;
  /** Gaussian falloff radius, in tile units. @default 1.6 */
  radius?: number;
  onTileClick?: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

type TileChannel = { target: MotionValue<number>; pop: MotionValue<number> };

/**
 * A tile grid that extrudes toward the cursor like a relief map. The pointer's
 * position in tile coordinates feeds a gaussian falloff — every tile's lift
 * target is written on pointermove (motion values only, no re-renders) and a
 * glide spring chases it, so the relief rolls under your hand and settles when
 * you leave. Focus raises a tile to full lift; clicking pops it on the recoil
 * spring. Under reduced motion the relief is a flat hover highlight.
 */
export function HoverRelief({
  tiles,
  columns = 4,
  maxLift = 16,
  radius = 1.6,
  onTileClick,
  className,
  "aria-label": ariaLabel = "Relief grid",
}: HoverReliefProps) {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();
  const live = motionSafe && pointerFine;
  const gridRef = React.useRef<HTMLDivElement>(null);
  const channelsRef = React.useRef(new Map<string, TileChannel>());

  const list = tiles.slice(0, 24);
  const count = list.length;
  const rows = Math.ceil(count / columns);

  const writeRelief = (clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid || count === 0) return;
    const rect = grid.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const colF = ((clientX - rect.left) / rect.width) * columns;
    const rowF = ((clientY - rect.top) / rect.height) * rows;
    list.forEach((tile, i) => {
      const channel = channelsRef.current.get(tile.id);
      if (!channel) return;
      const col = (i % columns) + 0.5;
      const row = Math.floor(i / columns) + 0.5;
      const d = Math.hypot(colF - col, rowF - row);
      channel.target.set(Math.exp(-((d / radius) ** 2)));
    });
  };

  const settleAll = () => {
    for (const channel of channelsRef.current.values()) channel.target.set(0);
  };

  return (
    <div
      ref={gridRef}
      role="group"
      aria-label={ariaLabel}
      onPointerMove={live ? (e) => writeRelief(e.clientX, e.clientY) : undefined}
      onPointerLeave={live ? settleAll : undefined}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      className={cn(
        "border-hairline bg-surface-0 grid gap-2 rounded-3 border p-3 shadow-[inset_0_1px_4px_rgb(0_0_0/0.12)]",
        className,
      )}
    >
      {list.map((tile) => (
        <ReliefTilePlate
          key={tile.id}
          tile={tile}
          live={live}
          motionSafe={motionSafe}
          maxLift={maxLift}
          channelsRef={channelsRef}
          onTileClick={onTileClick}
        />
      ))}
    </div>
  );
}

function ReliefTilePlate({
  tile,
  live,
  motionSafe,
  maxLift,
  channelsRef,
  onTileClick,
}: {
  tile: ReliefTile;
  live: boolean;
  motionSafe: boolean;
  maxLift: number;
  channelsRef: React.RefObject<Map<string, TileChannel>>;
  onTileClick?: (id: string) => void;
}) {
  const target = useMotionValue(0);
  const pop = useMotionValue(0);
  const lift = useSpring(target, GLIDE);
  const popControls = React.useRef<ReturnType<typeof animate> | null>(null);

  // Register this tile's write channel with the grid; unregister on unmount.
  React.useEffect(() => {
    const channels = channelsRef.current;
    channels.set(tile.id, { target, pop });
    return () => {
      channels.delete(tile.id);
      popControls.current?.stop();
    };
  }, [channelsRef, tile.id, target, pop]);

  const y = useTransform(lift, (l) => -l * maxLift);
  const scale = useTransform([lift, pop], (values) => {
    const [l, p] = values as [number, number];
    return 1 + l * 0.04 + p;
  });
  const filter = useTransform(lift, (l) => `brightness(${1 + l * 0.08})`);
  const boxShadow = useTransform(lift, (l) => {
    const s = liftShadow(l);
    return `0 ${s.y}px ${s.blur}px ${s.spread}px rgb(6 10 22 / ${s.opacity})`;
  });

  const handleClick = () => {
    if (motionSafe) {
      popControls.current?.stop();
      pop.set(0.12);
      popControls.current = animate(pop, 0, springs.recoil);
    }
    onTileClick?.(tile.id);
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      onFocus={live ? () => target.set(1) : undefined}
      onBlur={live ? () => target.set(0) : undefined}
      style={motionSafe ? { y, scale, filter, boxShadow } : undefined}
      className={cn(
        "border-hairline bg-surface-2 focus-visible:ring-cobalt-bright/50 flex min-h-16 flex-col items-start justify-between gap-1.5 rounded-2 border p-2.5 text-left outline-none focus-visible:ring-2",
        !motionSafe &&
          "hover:border-hairline-strong hover:bg-surface-1 transition-colors duration-150",
      )}
    >
      <span aria-hidden className="flex size-4 items-center justify-center">
        {tile.glyph}
      </span>
      <span className="min-w-0">
        <span className="text-ink block truncate font-mono text-[11px]">
          {tile.label}
        </span>
        {tile.hint ? (
          <span className="text-ink-3 block truncate text-[10px]">
            {tile.hint}
          </span>
        ) : null}
      </span>
    </motion.button>
  );
}
