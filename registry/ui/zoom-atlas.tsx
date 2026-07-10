"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AtlasRegion = {
  /** Stable id — the zoom target and the onZoom payload. */
  id: string;
  /** Region label, shown on its overview tile and in the breadcrumb. */
  label: string;
  /** Longer copy, revealed once the region fills the frame. */
  detail?: string;
  /** Optional decoration rendered under the label on both overview and focus. */
  node?: React.ReactNode;
};

export type ZoomAtlasProps = {
  /** Regions laid on a near-square grid, row-major. */
  regions: AtlasRegion[];
  /** Grid columns — defaults to a near-square Math.ceil(Math.sqrt(n)). */
  columns?: number;
  /** Fires the focused region's id on zoom-in, null on return. Deduped. */
  onZoom?: (id: string | null) => void;
  /** Frame height, px. */
  height?: number;
  className?: string;
  /** Labels the atlas region. */
  "aria-label"?: string;
};

/**
 * A semantic zoom: the overview is a near-square grid of real buttons, one
 * per region. Clicking region k drives ONE transform on the grid container —
 * `scale(columns)` about that cell's own center, expressed as a
 * `transformOrigin` percentage — so the cell blows up to fill the frame
 * while staying centered; siblings scale out past the frame edges and are
 * clipped by the outer wrapper (`overflow-hidden`, not a 3D parent — this is
 * a flat scale+translate, no perspective). The camera "flies in" on
 * `springs.glide`; a breadcrumb ("ATLAS / {label}") flies it back out on the
 * same spring by resetting scale to 1 (origin no longer matters once flat).
 * Escape returns; ArrowLeft/Right fly to the previous/next region while
 * zoomed. While zoomed, non-focused tiles go `inert` + `aria-hidden` so they
 * can never be tabbed to or read; the focused region's detail becomes the
 * live content. `onZoom` fires the focused id on entry and null on return,
 * deduped against the current state so re-entrant calls (e.g. clicking the
 * already-focused tile) are silent. A mono HUD reads `ZOOM · 1.0x` at
 * overview and `ZOOM · {columns}.0x` zoomed; an sr-only status announces
 * "Zoomed into {label}" / "Atlas overview".
 *
 * Reduced motion: no fly. The overview grid and a single full-frame focused
 * panel swap instantly — click focuses, Escape or the breadcrumb returns —
 * with the same callbacks and announcements.
 */
export function ZoomAtlas({
  regions,
  columns,
  onZoom,
  height = 320,
  className,
  "aria-label": ariaLabel = "Atlas",
}: ZoomAtlasProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const cols = columns ?? Math.max(1, Math.ceil(Math.sqrt(regions.length)));
  const rows = regions.length > 0 ? Math.ceil(regions.length / cols) : 1;

  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("Atlas overview");
  const focusedIdRef = React.useRef<string | null>(null);

  const scale = useMotionValue(1);
  const originX = useMotionValue(50);
  const originY = useMotionValue(50);
  const transformOrigin = useTransform(
    [originX, originY],
    ([x = 50, y = 50]: number[]) => `${x}% ${y}%`,
  );
  const flightRef = React.useRef<ReturnType<typeof animate> | null>(null);

  // Kill any in-flight camera animation on unmount.
  React.useEffect(
    () => () => {
      flightRef.current?.stop();
      flightRef.current = null;
    },
    [],
  );

  /** Single zoom gate: dedupes, announces, notifies — id or null. */
  const commitZoom = (id: string | null, label: string) => {
    if (focusedIdRef.current === id) return;
    focusedIdRef.current = id;
    setFocusedId(id);
    setAnnouncement(id === null ? "Atlas overview" : `Zoomed into ${label}`);
    onZoom?.(id);
  };

  const cellOrigin = (index: number): { x: number; y: number } => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      x: ((col + 0.5) / cols) * 100,
      y: ((row + 0.5) / rows) * 100,
    };
  };

  const zoomIn = (region: AtlasRegion, index: number) => {
    if (!motionSafe) {
      commitZoom(region.id, region.label);
      return;
    }
    const origin = cellOrigin(index);
    flightRef.current?.stop();
    originX.set(origin.x);
    originY.set(origin.y);
    flightRef.current = animate(scale, cols, {
      ...springs.glide,
      onComplete: () => {
        flightRef.current = null;
      },
    });
    commitZoom(region.id, region.label);
  };

  const zoomOut = () => {
    if (focusedIdRef.current === null) return;
    if (!motionSafe) {
      commitZoom(null, "");
      return;
    }
    flightRef.current?.stop();
    flightRef.current = animate(scale, 1, {
      ...springs.glide,
      onComplete: () => {
        flightRef.current = null;
      },
    });
    commitZoom(null, "");
  };

  const flyToNeighbor = (delta: 1 | -1) => {
    const currentIndex = regions.findIndex((r) => r.id === focusedIdRef.current);
    if (currentIndex === -1) return;
    const nextIndex =
      (currentIndex + delta + regions.length) % regions.length;
    const next = regions[nextIndex];
    if (!next) return;
    zoomIn(next, nextIndex);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (focusedIdRef.current === null) return;
    if (event.key === "Escape") {
      event.preventDefault();
      zoomOut();
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      flyToNeighbor(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      flyToNeighbor(-1);
    }
  };

  const focusedRegion =
    focusedId !== null ? (regions.find((r) => r.id === focusedId) ?? null) : null;
  const hudLabel = focusedId !== null ? `ZOOM · ${cols}.0x` : "ZOOM · 1.0x";

  return (
    <div
      className={cn("relative w-full", className)}
      onKeyDown={handleKeyDown}
    >
      {/* Breadcrumb + HUD row. */}
      <div className="mb-2 flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={zoomOut}
            disabled={focusedId === null}
            className={cn(
              "rounded-1 text-label tracking-[0.08em] outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60",
              focusedId === null
                ? "cursor-default text-ink-2"
                : "cursor-pointer text-cobalt-bright hover:underline",
            )}
          >
            ATLAS
          </button>
          {focusedRegion !== null ? (
            <>
              <span aria-hidden className="text-ink-3">
                /
              </span>
              <span className="text-label text-ink-2">
                {focusedRegion.label}
              </span>
            </>
          ) : null}
        </nav>
        <p aria-hidden className="text-label text-ink-3 tabular-nums">
          {hudLabel}
        </p>
      </div>

      {/* Outer wrapper — the ONLY clip boundary; a flat 2D box, no 3D parent. */}
      <div
        role="group"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 relative w-full overflow-hidden rounded-3 border"
      >
        {motionSafe ? (
          <motion.div
            className="grid size-full"
            style={{
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              scale,
              transformOrigin,
            }}
          >
            {regions.map((region, index) => {
              const isFocused = region.id === focusedId;
              const zoomed = focusedId !== null;
              return (
                <AtlasTile
                  key={region.id}
                  region={region}
                  isFocused={isFocused}
                  inert={zoomed && !isFocused}
                  onSelect={() => zoomIn(region, index)}
                  onReturn={zoomOut}
                />
              );
            })}
          </motion.div>
        ) : (
          <RmFrame
            regions={regions}
            focusedRegion={focusedRegion}
            onSelect={(region) => commitZoom(region.id, region.label)}
            onReturn={zoomOut}
          />
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type AtlasTileProps = {
  region: AtlasRegion;
  isFocused: boolean;
  /** True once a sibling is focused — this tile must go dark and untouchable. */
  inert: boolean;
  onSelect: () => void;
  onReturn: () => void;
};

/** One overview cell — a real button, live and readable only while unfocused-siblings are false. */
function AtlasTile({
  region,
  isFocused,
  inert,
  onSelect,
  onReturn,
}: AtlasTileProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={isFocused ? onReturn : onSelect}
      aria-hidden={inert || undefined}
      inert={inert}
      tabIndex={inert ? -1 : 0}
      className={cn(
        "border-hairline relative flex flex-col items-center justify-center gap-1 border p-2 text-center outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
        isFocused ? "cursor-default" : "cursor-pointer hover:bg-surface-1",
      )}
    >
      <span className="text-label text-ink-2 tracking-[0.06em]">
        {region.label}
      </span>
      {region.node}
      {isFocused && region.detail !== undefined ? (
        <span className="text-ink-3 mt-1 max-w-[80%] text-xs text-balance">
          {region.detail}
        </span>
      ) : null}
    </button>
  );
}

type RmFrameProps = {
  regions: AtlasRegion[];
  focusedRegion: AtlasRegion | null;
  onSelect: (region: AtlasRegion) => void;
  onReturn: () => void;
};

/** Reduced-motion fallback: instant swap between the grid and one full-frame panel. */
function RmFrame({
  regions,
  focusedRegion,
  onSelect,
  onReturn,
}: RmFrameProps): React.JSX.Element {
  if (focusedRegion !== null) {
    return (
      <button
        type="button"
        onClick={onReturn}
        className="border-hairline flex size-full flex-col items-center justify-center gap-2 border-0 p-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
      >
        <span className="text-label text-ink-2 tracking-[0.06em]">
          {focusedRegion.label}
        </span>
        {focusedRegion.node}
        {focusedRegion.detail !== undefined ? (
          <span className="text-ink-3 max-w-[80%] text-xs text-balance">
            {focusedRegion.detail}
          </span>
        ) : null}
      </button>
    );
  }

  const cols = Math.max(1, Math.ceil(Math.sqrt(regions.length)));
  return (
    <div
      className="grid size-full"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {regions.map((region) => (
        <button
          key={region.id}
          type="button"
          onClick={() => onSelect(region)}
          className="border-hairline hover:bg-surface-1 flex flex-col items-center justify-center gap-1 border p-2 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
        >
          <span className="text-label text-ink-2 tracking-[0.06em]">
            {region.label}
          </span>
          {region.node}
        </button>
      ))}
    </div>
  );
}
