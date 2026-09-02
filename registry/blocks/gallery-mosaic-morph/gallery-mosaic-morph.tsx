"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MosaicPlate = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  figure: string;
};

export type GalleryMosaicMorphProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  plates?: MosaicPlate[];
  defaultActiveId?: string;
  className?: string;
};

const WIDE_QUERY = "(min-width: 640px)";
const subscribeWide = (onChange: () => void) => {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};
const getWideSnapshot = () => window.matchMedia(WIDE_QUERY).matches;
// The server has no viewport; assume the wide layout and let the client
// correct it after hydration, which is the cheaper mismatch on a phone.
const getWideServerSnapshot = () => true;
function useWide(): boolean {
  return React.useSyncExternalStore(
    subscribeWide,
    getWideSnapshot,
    getWideServerSnapshot,
  );
}

const DEFAULT_PLATES: MosaicPlate[] = [
  {
    id: "gate",
    kicker: "MORNING GATE",
    title: "The 05:55 board, cut clean",
    body: "Overnight changes are folded in before the first truck queues, and the reason for each swap is printed right beside it.",
    figure: "4 CREWS · 9 SLOTS",
  },
  {
    id: "tide",
    kicker: "TIDE WINDOW",
    title: "Six berths on one clock",
    body: "Draft, swell, and the harbour authority line share a single board, so a window never has to close twice.",
    figure: "6 BERTHS · LIVE",
  },
  {
    id: "crane",
    kicker: "CRANE HOLDS",
    title: "A hold that actually holds",
    body: "Lock a crane to one job and every other plan on the yard reroutes around it on its own, no phone call needed.",
    figure: "3 CRANES · 0 CLASHES",
  },
  {
    id: "cold",
    kicker: "COLD STORE",
    title: "The chain, unbroken",
    body: "Temperature logs travel with the container from quay to gate, so a claim gets settled by a chart, not by memory.",
    figure: "−18°C · LOGGED",
  },
  {
    id: "night",
    kicker: "NIGHT GANG",
    title: "A handover with no gap",
    body: "The evening shift leaves the board exactly where the night gang needs to pick it up, with nothing retold on the way out.",
    figure: "22:00 · HANDOVER",
  },
];

const FALLBACK_PLATE: MosaicPlate = {
  id: "fallback",
  kicker: "BASINWORKS",
  title: "Untitled plate",
  body: "",
  figure: "",
};

/** Distinct color-mix washes, one per plate slot (0–4) — identity, not state. */
const WASHES = [
  "linear-gradient(160deg, color-mix(in oklch, var(--primary) 16%, var(--bg-1)), var(--bg-0))",
  "linear-gradient(200deg, color-mix(in oklch, var(--signal) 14%, var(--bg-1)), var(--bg-0))",
  "linear-gradient(140deg, color-mix(in oklch, var(--primary) 9%, var(--bg-2)), var(--bg-1))",
  "linear-gradient(225deg, color-mix(in oklch, var(--warn) 11%, var(--bg-1)), var(--bg-0))",
  "linear-gradient(180deg, color-mix(in oklch, var(--primary) 24%, var(--bg-2)), var(--bg-0))",
] as const;

const FALLBACK_WASH = WASHES[0];

type PlatePlacement = { column: string; row: string };

const FALLBACK_PLACEMENT: PlatePlacement = {
  column: "1 / span 1",
  row: "1 / span 1",
};

/**
 * Five hand-authored layouts for the 4×2 grid, indexed by which plate slot
 * (0–4) is active. The active slot always gets the 2×2 span; the other four
 * take the four leftover 1×1 cells. Every row below was checked by hand —
 * each covers all eight cells exactly once, no gaps, no overlaps — because a
 * grid left to auto-place a mid-flow 2×2 item can run out of explicit rows
 * and spill a tile into an implicit one.
 */
const LAYOUTS: readonly (readonly PlatePlacement[])[] = [
  // slot 0 active — 2×2 at columns 1–2
  [
    { column: "1 / span 2", row: "1 / span 2" },
    { column: "3 / span 1", row: "1 / span 1" },
    { column: "4 / span 1", row: "1 / span 1" },
    { column: "3 / span 1", row: "2 / span 1" },
    { column: "4 / span 1", row: "2 / span 1" },
  ],
  // slot 1 active — 2×2 at columns 2–3
  [
    { column: "1 / span 1", row: "1 / span 1" },
    { column: "2 / span 2", row: "1 / span 2" },
    { column: "4 / span 1", row: "1 / span 1" },
    { column: "1 / span 1", row: "2 / span 1" },
    { column: "4 / span 1", row: "2 / span 1" },
  ],
  // slot 2 active — 2×2 at columns 3–4
  [
    { column: "1 / span 1", row: "1 / span 1" },
    { column: "2 / span 1", row: "1 / span 1" },
    { column: "3 / span 2", row: "1 / span 2" },
    { column: "1 / span 1", row: "2 / span 1" },
    { column: "2 / span 1", row: "2 / span 1" },
  ],
  // slot 3 active — 2×2 at columns 2–3
  [
    { column: "1 / span 1", row: "1 / span 1" },
    { column: "4 / span 1", row: "1 / span 1" },
    { column: "1 / span 1", row: "2 / span 1" },
    { column: "2 / span 2", row: "1 / span 2" },
    { column: "4 / span 1", row: "2 / span 1" },
  ],
  // slot 4 active — 2×2 at columns 1–2
  [
    { column: "3 / span 1", row: "1 / span 1" },
    { column: "4 / span 1", row: "1 / span 1" },
    { column: "3 / span 1", row: "2 / span 1" },
    { column: "4 / span 1", row: "2 / span 1" },
    { column: "1 / span 2", row: "1 / span 2" },
  ],
] as const;

/**
 * `plates` is written for exactly five slots — the layout table above has no
 * entry for any other count. A short list pads from the defaults; a long one
 * is cut to its first five.
 */
function normalizePlates(plates: MosaicPlate[]): MosaicPlate[] {
  if (plates.length === 5) return plates;
  const padded = plates.slice(0, 5);
  for (let i = padded.length; i < 5; i++) {
    padded.push(DEFAULT_PLATES[i] ?? FALLBACK_PLATE);
  }
  return padded;
}

/**
 * Five plates on a fixed four-by-two grid, and the active one claims a
 * two-by-two block while the other four repack the remaining eight cells —
 * every plate moves on `layout`, so this is a true morph of position and
 * footprint together, not a card scaling on top of a static frame. Which
 * cell each plate lands in comes from a hand-authored table keyed on the
 * active plate: five layouts, checked by hand so the grid always resolves to
 * exactly eight cells, nothing left uncovered and nothing doubled up.
 * Selection stays deliberate: click, Enter, Space, and the arrow keys move
 * it, while hover is left alone, since a mosaic that reflows under a cursor
 * passing through is not one anyone could actually read.
 * Reduced motion: the morph and the detail crossfade both resolve without
 * animation — plates land in their new cells at once and the body copy
 * simply appears.
 */
export function GalleryMosaicMorph({
  eyebrow = "Basinworks · the harbour, five ways",
  headline = "One frame grows. The rest make room.",
  deck = "A basin morning runs five stories at once: berths, tides, cranes, cold store, and the handover between shifts. Open one and the mosaic remembers what that means, so the rest step back and let it be read properly.",
  plates,
  defaultActiveId,
  className,
}: GalleryMosaicMorphProps) {
  const baseId = React.useId();
  const headingId = `${baseId}-heading`;
  const motionSafe = useMotionSafe();

  const normalized = normalizePlates(plates ?? DEFAULT_PLATES);
  const firstId = normalized[0]?.id ?? "";

  const [activeId, setActiveId] = React.useState(() =>
    defaultActiveId && normalized.some((plate) => plate.id === defaultActiveId)
      ? defaultActiveId
      : firstId,
  );

  // Self-healing: if the active id ever fails to match a current plate (a
  // caller swapping `plates` at runtime, say), fall back to the first slot
  // for this render rather than rendering a mosaic with no active tile.
  const effectiveActiveId = normalized.some((plate) => plate.id === activeId)
    ? activeId
    : firstId;
  const activeIndex = Math.max(
    0,
    normalized.findIndex((plate) => plate.id === effectiveActiveId),
  );
  const layout = LAYOUTS[activeIndex] ?? [];
  // Below the small breakpoint the four-column table cannot hold a title,
  // so the mosaic becomes two columns: the active plate spans both and the
  // rest flow beneath it. The layout morph still runs; only the target
  // arrangement changes.
  const wide = useWide();

  const plateButtonId = (id: string) => `${baseId}-plate-${id}`;

  // Arrow keys step the active plate through the array order (not the grid's
  // spatial order) and carry focus with it — the same roving-tabindex shape
  // as the kit's other single-select rows, clamped rather than wrapping.
  const handleArrowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextIndex =
      event.key === "ArrowRight"
        ? Math.min(normalized.length - 1, index + 1)
        : Math.max(0, index - 1);
    const next = normalized[nextIndex];
    if (!next || next.id === effectiveActiveId) return;
    setActiveId(next.id);
    document.getElementById(plateButtonId(next.id))?.focus();
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{deck}</p>
        </div>

        {/* Hover is never wired to selection here — on purpose. A mosaic
            that reflows every tile's position and footprint under a cursor
            just passing through would make the whole grid unusable; only a
            committed action (click, Enter, Space, or an arrow key) may move
            the active plate. */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-4 sm:grid-rows-[repeat(2,11rem)] sm:gap-4">
          {normalized.map((plate, index) => {
            const isActive = plate.id === effectiveActiveId;
            return (
              <MosaicTile
                key={plate.id}
                wide={wide}
                buttonId={plateButtonId(plate.id)}
                plate={plate}
                placement={layout[index] ?? FALLBACK_PLACEMENT}
                wash={WASHES[index] ?? FALLBACK_WASH}
                isActive={isActive}
                tabIndex={isActive ? 0 : -1}
                motionSafe={motionSafe}
                onSelect={() => setActiveId(plate.id)}
                onKeyDown={(event) => handleArrowKey(event, index)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

type MosaicTileProps = {
  wide: boolean;
  buttonId: string;
  plate: MosaicPlate;
  placement: PlatePlacement;
  wash: string;
  isActive: boolean;
  tabIndex: 0 | -1;
  motionSafe: boolean;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * One plate. `layout` tracks the button's own box — position and size both —
 * across a grid-placement change, while the kicker/title stay on
 * `layout="position"` so the FLIP scale correction never stretches a
 * letterform, and their `min-w-0` wrapper keeps that same correction from
 * fighting the grid track. The two-line body and the mono figure exist only
 * while this plate is active, mounting and unmounting as a direct
 * `AnimatePresence` child rather than being hidden and reflowed in place.
 */
function MosaicTile({
  buttonId,
  plate,
  placement,
  wash,
  isActive,
  tabIndex,
  motionSafe,
  onSelect,
  onKeyDown,
  wide,
}: MosaicTileProps) {
  return (
    <motion.button
      type="button"
      id={buttonId}
      layout
      transition={motionSafe ? springs.glide : { duration: 0 }}
      aria-pressed={isActive}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      style={{
        gridColumn: wide ? placement.column : isActive ? "1 / span 2" : "auto",
        gridRow: wide ? placement.row : "auto",
        background: wash,
      }}
      className={cn(
        "relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-3 border border-hairline p-4 text-left select-none sm:p-5",
        isActive ? "min-h-[13rem] sm:min-h-0" : "min-h-[7.5rem] sm:min-h-0",
        "transition-colors hover:border-hairline-strong",
        isActive && "border-hairline-strong",
      )}
    >
      <motion.span layout="position" className="block min-w-0">
        <span className="block text-label text-ink-3">{plate.kicker}</span>
        <span className="mt-2 block font-semibold tracking-tight text-balance text-ink">
          {plate.title}
        </span>
      </motion.span>

      <AnimatePresence initial={false}>
        {isActive && (
          <motion.span
            key="detail"
            layout="position"
            initial={{ opacity: motionSafe ? 0 : 1 }}
            animate={{ opacity: 1 }}
            exit={{
              opacity: motionSafe ? 0 : 1,
              transition: { duration: motionSafe ? durations.fast : 0 },
            }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
            className="mt-4 block min-w-0"
          >
            <span className="line-clamp-2 text-sm leading-relaxed text-ink-2">
              {plate.body}
            </span>
            <span className="mt-3 block font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
              {plate.figure}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
