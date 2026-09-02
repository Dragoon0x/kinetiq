"use client";

import * as React from "react";

import {
  Anchor,
  Compass,
  Fish,
  Flag,
  LifeBuoy,
  MapPin,
  Navigation,
  Sailboat,
  Shell,
  Ship,
  Stamp,
  Waves,
  Wind,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/** Grid geometry, px — three columns always; rows grow with the slot count. */
const COLS = 3;
const SLOT_SIZE = 70;
const GAP = 8;
const PANEL_PAD = 12;

/** The collect flight: how long a sticker takes to arrive, and how "big" it
 * rides in before the press-down settles it to rest. */
const FLY_DURATION_S = 0.6;
const FLY_DURATION_MS = 600;
const PEAK_SCALE = 1.18;
/** Rough settle time of springs.recoil (see registry/lib/motion.ts) — used
 * only to time when the completion celebration may safely begin. */
const LAND_SETTLE_MS = 700;

/** Authored fly-in vectors, not measured DOM — the sticker converges toward
 * center-bottom (roughly where the collect button sits) as it arrives. */
const FLY_DROP = 150;
const FLY_ROW_STEP = 30;
const FLY_CONVERGE = 46;
const CENTER_COL = (COLS - 1) / 2;

function flyOffsetFor(index: number): { dx: number; dy: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    dx: (CENTER_COL - col) * FLY_CONVERGE,
    dy: FLY_DROP - row * FLY_ROW_STEP,
  };
}

function slotPosition(index: number): { left: number; top: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return {
    left: PANEL_PAD + col * (SLOT_SIZE + GAP),
    top: PANEL_PAD + row * (SLOT_SIZE + GAP),
  };
}

/** Five fixed adhesive-dust vectors thrown at landing — deterministic, no
 * Math.random. */
const PUFF_VECTORS = [
  { dx: -11, dy: -7 },
  { dx: 9, dy: -10 },
  { dx: -7, dy: 9 },
  { dx: 10, dy: 6 },
  { dx: 0, dy: -13 },
] as const;

/** A duplicate's flight: fly in (0–T1), hover over its slot (T1–T2), slide
 * off to the tray (T2–1). */
const DUP_HOVER_S = 0.3;
const DUP_SLIDE_S = 0.45;
const DUP_TOTAL_S = FLY_DURATION_S + DUP_HOVER_S + DUP_SLIDE_S;
const DUP_TOTAL_MS = Math.round(DUP_TOTAL_S * 1000);
const DUP_T1 = FLY_DURATION_S / DUP_TOTAL_S;
const DUP_T2 = (FLY_DURATION_S + DUP_HOVER_S) / DUP_TOTAL_S;
const DUP_EXIT_DY = 160;

/** The completion cascade pop. */
const POP_PEAK = 1.15;
const POP_DURATION_S = 0.4;

/** How long the "SET COMPLETE" caption and the spare-tray flash hold. */
const CAPTION_FLASH_MS = 1800;
const SPARE_FLASH_MS = 900;

/** Fixed hand-assembled rotations, one per slot — never randomized. */
const ROTATIONS = [-4, 3, -6, 5, -2, 4, -5, 2, -3, 6, -4, 3] as const;
const rotationAt = (index: number): number => ROTATIONS[index] ?? ROTATIONS[0];

/** The four tints every sticker cycles through, via color-mix at the use site. */
const TINT_BASE = [
  "var(--primary)",
  "var(--success, #047857)",
  "var(--warning, #b45309)",
  "var(--ink-2)",
] as const;
const tintAt = (index: number): string =>
  TINT_BASE[index % TINT_BASE.length] ?? TINT_BASE[0];

/** The fixed harbour set — a slot's identity never changes, only whether it
 * is filled. `stickerAt` guards every variable-indexed read; the literal
 * index 0 fallback is always defined because `as const` makes this a tuple. */
const STICKER_SLOTS = [
  { name: "Anchor", Icon: Anchor },
  { name: "Compass Rose", Icon: Compass },
  { name: "Trawler", Icon: Ship },
  { name: "Sailboat", Icon: Sailboat },
  { name: "Tideline", Icon: Waves },
  { name: "Catch", Icon: Fish },
  { name: "Lifebuoy", Icon: LifeBuoy },
  { name: "Signal Flag", Icon: Flag },
  { name: "Squall", Icon: Wind },
  { name: "Bearing", Icon: Navigation },
  { name: "Harbour Mark", Icon: MapPin },
  { name: "Shell", Icon: Shell },
] as const;

type StickerDef = (typeof STICKER_SLOTS)[number];

const stickerAt = (index: number): StickerDef =>
  STICKER_SLOTS[index] ?? STICKER_SLOTS[0];

const PAGE_SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

type DuplicateFlight = {
  token: number;
  targetIndex: number;
  sticker: StickerDef;
  tint: string;
};

type AlbumStickerProps = {
  index: number;
  sticker: StickerDef;
  tint: string;
  rotation: number;
  motionSafe: boolean;
  celebrateToken: number | null;
  cascadeDelay: number;
};

/** One landed (or landing) sticker. Owns the fly-in → press-down → rest
 * sequence and the puff it throws on arrival — the sanctioned "own child
 * component" for per-slot motion values the hooks rule asks for. */
function AlbumSticker({
  index,
  sticker,
  tint,
  rotation,
  motionSafe,
  celebrateToken,
  cascadeDelay,
}: AlbumStickerProps): React.JSX.Element {
  const [stage, setStage] = React.useState<"flying" | "landed">(
    motionSafe ? "flying" : "landed",
  );
  const landTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!motionSafe) return;
    landTimer.current = window.setTimeout(() => {
      landTimer.current = null;
      setStage("landed");
    }, FLY_DURATION_MS);
    return () => {
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    };
  }, [motionSafe]);

  const flyOffset = flyOffsetFor(index);
  const landed = stage === "landed";

  return (
    <motion.div
      aria-hidden
      className="absolute inset-0"
      style={{ transformOrigin: "50% 50%" }}
      initial={
        motionSafe
          ? {
              x: flyOffset.dx,
              y: flyOffset.dy,
              opacity: 0,
              scale: PEAK_SCALE,
              rotate: 0,
            }
          : false
      }
      animate={
        motionSafe
          ? {
              x: 0,
              y: 0,
              opacity: 1,
              scale: landed ? 1 : PEAK_SCALE,
              rotate: landed ? rotation : 0,
            }
          : { x: 0, y: 0, opacity: 1, scale: 1, rotate: rotation }
      }
      transition={
        motionSafe
          ? {
              x: { duration: FLY_DURATION_S, ease: easings.enter },
              y: { duration: FLY_DURATION_S, ease: easings.enter },
              opacity: { duration: durations.fast, ease: easings.enter },
              scale: landed ? springs.recoil : { duration: 0 },
              rotate: landed ? springs.recoil : { duration: 0 },
            }
          : { duration: 0 }
      }
      exit={
        motionSafe
          ? {
              opacity: 0,
              scale: 0.85,
              transition: {
                duration: durations.base,
                ease: easings.exit,
                delay: cascadeDelay,
              },
            }
          : { opacity: 0, transition: { duration: 0 } }
      }
    >
      <motion.div
        key={celebrateToken ?? "static"}
        initial={false}
        animate={
          celebrateToken !== null && motionSafe
            ? { scale: [1, POP_PEAK, 1] }
            : { scale: 1 }
        }
        transition={
          celebrateToken !== null && motionSafe
            ? {
                duration: POP_DURATION_S,
                times: [0, 0.45, 1],
                ease: easings.move,
                delay: cascadeDelay,
              }
            : { duration: 0 }
        }
        className="relative flex size-full flex-col items-center justify-center gap-1 rounded-2 border"
        style={{
          background: `color-mix(in oklab, ${tint} 16%, var(--color-surface-2))`,
          borderColor: `color-mix(in oklab, ${tint} 42%, transparent)`,
        }}
      >
        <sticker.Icon aria-hidden className="size-4" style={{ color: tint }} />
        <span className="px-1 text-center text-[8px] leading-tight font-medium text-ink">
          {sticker.name}
        </span>
      </motion.div>

      {landed && motionSafe && (
        <span
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: "50%", top: "50%" }}
        >
          {PUFF_VECTORS.map((v, i) => (
            <motion.span
              key={i}
              className="absolute size-1 rounded-full"
              style={{
                background:
                  "color-mix(in oklab, var(--ink-2) 65%, transparent)",
              }}
              initial={{ x: 0, y: 0, opacity: 0.9 }}
              animate={{ x: v.dx, y: v.dy, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          ))}
        </span>
      )}
    </motion.div>
  );
}

type AlbumSlotProps = {
  index: number;
  filled: boolean;
  motionSafe: boolean;
  celebrateToken: number | null;
  cascadeDelay: number;
};

/** One grid cell — the dashed/faint placeholder cross-fades to a solid frame
 * the moment its slot fills, then hosts the sticker itself. */
function AlbumSlot({
  index,
  filled,
  motionSafe,
  celebrateToken,
  cascadeDelay,
}: AlbumSlotProps): React.JSX.Element {
  const { left, top } = slotPosition(index);
  const sticker = stickerAt(index);
  const tint = tintAt(index);
  const rotation = rotationAt(index);

  return (
    <div
      className="absolute"
      style={{ left, top, width: SLOT_SIZE, height: SLOT_SIZE }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2 border border-dashed border-hairline"
        initial={false}
        animate={{ opacity: filled ? 0 : 1 }}
        transition={{
          duration: durations.base,
          ease: easings.enter,
          delay: filled && motionSafe ? FLY_DURATION_S : 0,
        }}
      >
        <sticker.Icon aria-hidden className="size-4 text-ink-3 opacity-30" />
        <span className="absolute top-1 left-1.5 font-mono text-[8px] text-ink-3">
          {String(index + 1).padStart(2, "0")}
        </span>
      </motion.div>

      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-2 border border-hairline-strong"
        initial={false}
        animate={{ opacity: filled ? 1 : 0 }}
        transition={{
          duration: durations.base,
          ease: easings.enter,
          delay: filled && motionSafe ? FLY_DURATION_S : 0,
        }}
      />

      <AnimatePresence>
        {filled && (
          <AlbumSticker
            key="sticker"
            index={index}
            sticker={sticker}
            tint={tint}
            rotation={rotation}
            motionSafe={motionSafe}
            celebrateToken={celebrateToken}
            cascadeDelay={cascadeDelay}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** A duplicate pull: flies to the slot it repeats, hovers, then slides off
 * toward the spares tray. Tween-only (no press-down, no spring) — a
 * duplicate never lands, it just passes through. */
function DuplicateSticker({
  flight,
}: {
  flight: DuplicateFlight;
}): React.JSX.Element {
  const { left, top } = slotPosition(flight.targetIndex);
  const { dx, dy } = flyOffsetFor(flight.targetIndex);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute flex flex-col items-center justify-center gap-1 rounded-2 border"
      style={{
        left,
        top,
        width: SLOT_SIZE,
        height: SLOT_SIZE,
        background: `color-mix(in oklab, ${flight.tint} 20%, var(--color-surface-2))`,
        borderColor: `color-mix(in oklab, ${flight.tint} 55%, transparent)`,
      }}
      initial={{ x: dx, y: dy, opacity: 0 }}
      animate={{
        x: [dx, 0, 0, 0],
        y: [dy, 0, 0, DUP_EXIT_DY],
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: DUP_TOTAL_S,
        times: [0, DUP_T1, DUP_T2, 1],
        ease: easings.move,
      }}
    >
      <flight.sticker.Icon
        aria-hidden
        className="size-4"
        style={{ color: flight.tint }}
      />
      <span className="px-1 text-center text-[8px] leading-tight font-medium text-ink">
        {flight.sticker.name}
      </span>
    </motion.div>
  );
}

export type StickerAlbumProps = {
  /** Slots on the page, clamped 6–12. @default 9 */
  slots?: number;
  /** Fires each time the page fills — including again after a later page
   * also completes. */
  onComplete?: () => void;
  className?: string;
};

/**
 * An album page of collection slots that fill in a fixed order — never
 * random — because a set you cannot name in advance before opening the pack
 * is a lottery, not a collection. "Open a sticker pack" flies the next
 * sticker in from the button, presses it down with a `recoil` bounce into
 * its fixed rotation, puffs a dab of adhesive dust, and turns that slot's
 * dashed outline solid while the mono count ticks up. Every fourth pull is a
 * duplicate instead: it flies in, hovers over the slot it already fills,
 * then slides down to a spares tray that counts up — the honest part of
 * collecting is that a set finished without ever pulling a duplicate is a
 * checklist, not a collection. Filling the last slot sweeps the page, pops
 * every sticker in a `cascade()` stagger, draws a foil border, and flashes
 * "SET COMPLETE · harbour"; "New page" fades the set back out in the same
 * cascade while the spare count carries forward. Reduced motion: collecting
 * places the sticker (or routes the duplicate straight to the tray)
 * instantly, with no flight, puff, sweep, or cascade — only the progress
 * count, the caption, and the completed state still update.
 */
export function StickerAlbum({
  slots = 9,
  onComplete,
  className,
}: StickerAlbumProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const clampedSlots = clamp(Math.round(slots), 6, 12);
  const rows = Math.ceil(clampedSlots / COLS);
  const pageWidth = PANEL_PAD * 2 + COLS * SLOT_SIZE + (COLS - 1) * GAP;
  const pageHeight = PANEL_PAD * 2 + rows * SLOT_SIZE + (rows - 1) * GAP;
  const cascadeStep = cascade(clampedSlots);

  const [filled, setFilled] = React.useState<boolean[]>(() =>
    Array.from({ length: clampedSlots }, () => false),
  );
  const [spareCount, setSpareCount] = React.useState(0);
  const [duplicateFlight, setDuplicateFlight] =
    React.useState<DuplicateFlight | null>(null);
  const [spareFlashToken, setSpareFlashToken] = React.useState<number | null>(
    null,
  );
  const [celebrateToken, setCelebrateToken] = React.useState<number | null>(
    null,
  );
  const [flareCaption, setFlareCaption] = React.useState<string | null>(null);
  const [pageNumber, setPageNumber] = React.useState(1);
  const [announce, setAnnounce] = React.useState("");

  const filledRef = React.useRef<boolean[]>(
    Array.from({ length: clampedSlots }, () => false),
  );
  const pullIndexRef = React.useRef(0);
  const dupCursorRef = React.useRef(0);
  const idCounterRef = React.useRef(0);
  const onCompleteRef = React.useRef(onComplete);

  const dupFlightTimer = React.useRef<number | null>(null);
  const spareFlashTimer = React.useRef<number | null>(null);
  const celebrateTimer = React.useRef<number | null>(null);
  const flareCaptionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useEffect(() => {
    return () => {
      if (dupFlightTimer.current !== null)
        window.clearTimeout(dupFlightTimer.current);
      if (spareFlashTimer.current !== null)
        window.clearTimeout(spareFlashTimer.current);
      if (celebrateTimer.current !== null)
        window.clearTimeout(celebrateTimer.current);
      if (flareCaptionTimer.current !== null)
        window.clearTimeout(flareCaptionTimer.current);
    };
  }, []);

  const filledCount = filled.filter(Boolean).length;
  const isComplete = filledCount === clampedSlots;

  const handleCollect = () => {
    pullIndexRef.current += 1;
    const pull = pullIndexRef.current;
    const filledCountNow = filledRef.current.filter(Boolean).length;
    const isDuplicate = filledCountNow >= clampedSlots || pull % 4 === 0;

    idCounterRef.current += 1;
    const token = idCounterRef.current;

    if (isDuplicate) {
      if (filledCountNow === 0) return;
      const targetIndex = dupCursorRef.current % filledCountNow;
      dupCursorRef.current += 1;
      const sticker = stickerAt(targetIndex);
      const tint = tintAt(targetIndex);

      setSpareCount((c) => c + 1);
      setAnnounce(
        `${sticker.name}, spare. ${filledCountNow} of ${clampedSlots} collected.`,
      );

      if (motionSafe) {
        setDuplicateFlight({ token, targetIndex, sticker, tint });
        if (dupFlightTimer.current !== null)
          window.clearTimeout(dupFlightTimer.current);
        dupFlightTimer.current = window.setTimeout(() => {
          dupFlightTimer.current = null;
          setDuplicateFlight(null);
        }, DUP_TOTAL_MS);
      }

      setSpareFlashToken(token);
      if (spareFlashTimer.current !== null)
        window.clearTimeout(spareFlashTimer.current);
      spareFlashTimer.current = window.setTimeout(
        () => {
          spareFlashTimer.current = null;
          setSpareFlashToken(null);
        },
        motionSafe ? DUP_TOTAL_MS + 250 : SPARE_FLASH_MS,
      );
      return;
    }

    const nextIndex = filledCountNow;
    if (nextIndex >= clampedSlots) return;
    filledRef.current = filledRef.current.map((v, i) =>
      i === nextIndex ? true : v,
    );
    setFilled([...filledRef.current]);
    const sticker = stickerAt(nextIndex);
    const newCount = nextIndex + 1;
    setAnnounce(`${sticker.name} collected. ${newCount} of ${clampedSlots}.`);

    if (newCount === clampedSlots) {
      const delayMs = motionSafe ? FLY_DURATION_MS + LAND_SETTLE_MS : 0;
      if (celebrateTimer.current !== null)
        window.clearTimeout(celebrateTimer.current);
      celebrateTimer.current = window.setTimeout(() => {
        celebrateTimer.current = null;
        idCounterRef.current += 1;
        setCelebrateToken(idCounterRef.current);
        setFlareCaption("SET COMPLETE · harbour");
        setAnnounce("Set complete, harbour.");
        onCompleteRef.current?.();
        if (flareCaptionTimer.current !== null)
          window.clearTimeout(flareCaptionTimer.current);
        flareCaptionTimer.current = window.setTimeout(() => {
          flareCaptionTimer.current = null;
          setFlareCaption(null);
        }, CAPTION_FLASH_MS);
      }, delayMs);
    }
  };

  const handleNewPage = () => {
    if (dupFlightTimer.current !== null)
      window.clearTimeout(dupFlightTimer.current);
    if (spareFlashTimer.current !== null)
      window.clearTimeout(spareFlashTimer.current);
    if (celebrateTimer.current !== null)
      window.clearTimeout(celebrateTimer.current);
    if (flareCaptionTimer.current !== null)
      window.clearTimeout(flareCaptionTimer.current);
    dupFlightTimer.current = null;
    spareFlashTimer.current = null;
    celebrateTimer.current = null;
    flareCaptionTimer.current = null;

    pullIndexRef.current = 0;
    dupCursorRef.current = 0;
    filledRef.current = Array.from({ length: clampedSlots }, () => false);
    setFilled([...filledRef.current]);
    setDuplicateFlight(null);
    setSpareFlashToken(null);
    setCelebrateToken(null);
    setFlareCaption(null);
    setPageNumber((p) => p + 1);
    setAnnounce("New page. Spares carried over.");
    // spareCount is intentionally left untouched — spares persist across pages.
  };

  return (
    <div
      role="group"
      aria-label="Sticker album, harbour set"
      className={cn(
        "inline-flex flex-col items-center rounded-4 border border-hairline bg-surface-1 p-5 shadow-raised select-none",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-label text-ink-3">
        <span>PAGE {pageNumber} · HARBOUR SET</span>
        {isComplete && (
          <Stamp
            aria-hidden
            className="size-3.5"
            style={{ color: "var(--warning, #b45309)" }}
          />
        )}
      </div>

      <div
        className="relative mt-3 overflow-hidden rounded-3 border border-hairline bg-surface-0"
        style={{ width: pageWidth, height: pageHeight }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, color-mix(in oklab, var(--ink-3) 14%, transparent) 0px, color-mix(in oklab, var(--ink-3) 14%, transparent) 1px, transparent 1px, transparent ${SLOT_SIZE + GAP}px), repeating-linear-gradient(90deg, color-mix(in oklab, var(--ink-3) 14%, transparent) 0px, color-mix(in oklab, var(--ink-3) 14%, transparent) 1px, transparent 1px, transparent ${SLOT_SIZE + GAP}px)`,
            backgroundPosition: `${PANEL_PAD}px ${PANEL_PAD}px`,
          }}
        />

        {Array.from({ length: clampedSlots }, (_, index) => (
          <AlbumSlot
            key={index}
            index={index}
            filled={filled[index] ?? false}
            motionSafe={motionSafe}
            celebrateToken={celebrateToken}
            cascadeDelay={index * cascadeStep}
          />
        ))}

        {motionSafe && duplicateFlight && (
          <DuplicateSticker flight={duplicateFlight} />
        )}

        {isComplete && (
          <svg
            aria-hidden
            viewBox={`0 0 ${pageWidth} ${pageHeight}`}
            className="pointer-events-none absolute inset-0"
            fill="none"
          >
            <motion.rect
              x={1.5}
              y={1.5}
              width={pageWidth - 3}
              height={pageHeight - 3}
              rx={10}
              stroke="color-mix(in oklab, var(--warning, #b45309) 65%, var(--primary))"
              strokeWidth={2}
              strokeLinecap="round"
              initial={{ pathLength: motionSafe ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={
                motionSafe
                  ? { duration: 0.9, ease: easings.enter }
                  : { duration: 0 }
              }
            />
          </svg>
        )}

        {motionSafe && celebrateToken !== null && (
          <motion.span
            key={celebrateToken}
            aria-hidden
            className="pointer-events-none absolute inset-y-0"
            style={{
              width: pageWidth * 0.45,
              transform: "skewX(-20deg)",
              background: PAGE_SHEEN,
            }}
            initial={{ left: -(pageWidth * 0.45 + 24) }}
            animate={{ left: pageWidth + 24 }}
            transition={{ duration: 0.6, ease: easings.move }}
          />
        )}
      </div>

      <div
        aria-hidden
        className="mt-3 flex h-4 items-center justify-center overflow-hidden font-mono text-[11px] text-ink-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          {flareCaption ? (
            <motion.span
              key="flare"
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
              className="tracking-[0.06em]"
              style={{ color: "var(--warning, #b45309)" }}
            >
              {flareCaption}
            </motion.span>
          ) : (
            <motion.span
              key="progress"
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
            >
              {filledCount} of {clampedSlots}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        <motion.button
          type="button"
          aria-label="Open a sticker pack"
          onClick={handleCollect}
          whileTap={motionSafe ? { scale: 0.95 } : undefined}
          transition={springs.flick}
          className={cn(
            "rounded-2 bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Open a sticker pack
        </motion.button>

        <button
          type="button"
          onClick={handleNewPage}
          disabled={filledCount === 0}
          className={cn(
            "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
            "hover:text-ink-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            filledCount === 0 && "pointer-events-none opacity-40",
          )}
        >
          New page
        </button>
      </div>

      <div
        className="mt-4 flex w-full items-center justify-between gap-3 border-t border-hairline pt-3"
        style={{ minWidth: pageWidth }}
      >
        <span className="text-label text-ink-3">spares</span>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {spareFlashToken !== null && (
              <motion.span
                key={spareFlashToken}
                aria-hidden
                initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
                transition={
                  motionSafe
                    ? { duration: durations.fast, ease: easings.enter }
                    : { duration: 0 }
                }
                className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
              >
                spare
              </motion.span>
            )}
          </AnimatePresence>
          <Readout value={spareCount} size="sm" />
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
