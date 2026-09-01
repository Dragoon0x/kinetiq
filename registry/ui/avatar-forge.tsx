"use client";

import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { SwatchLock, type Swatch } from "@/registry/ui/swatch-lock";

/** Fixed portrait coordinate space — every shape below is drawn in this box,
 * so a mini roster bust can reuse the exact same geometry at a smaller size
 * just by shrinking the rendered `<svg>` around the same viewBox. */
const VIEW_W = 160;
const VIEW_H = 180;
const CX = 80;
/** Bottom edge of the head / top of the neck — the one anchor every head
 * shape sits on, so a taller or wider head never drifts off its neck. */
const HEAD_BOTTOM = 100;
const SHOULDER_BOTTOM = 172;

/** Shoulders never change with any slot — the fixed body the character sits
 * on, so every customization reads against the same silhouette. */
const SHOULDERS_D = `M54 ${HEAD_BOTTOM} Q46 ${HEAD_BOTTOM + 10} 38 ${HEAD_BOTTOM + 22} Q24 ${HEAD_BOTTOM + 38} 22 ${SHOULDER_BOTTOM} L138 ${SHOULDER_BOTTOM} Q136 ${HEAD_BOTTOM + 38} 122 ${HEAD_BOTTOM + 22} Q114 ${HEAD_BOTTOM + 10} 106 ${HEAD_BOTTOM} Z`;

type HeadShape = { name: string; w: number; h: number; rx: number };

const HEAD_ROUND: HeadShape = { name: "round", w: 76, h: 76, rx: 38 };
const HEAD_SHAPES: readonly HeadShape[] = [
  HEAD_ROUND,
  { name: "square", w: 70, h: 70, rx: 12 },
  { name: "tall", w: 60, h: 92, rx: 26 },
  { name: "wide", w: 92, h: 62, rx: 26 },
];
const shapeForHead = (idx: number): HeadShape => HEAD_SHAPES[idx] ?? HEAD_ROUND;

const EYES_NAMES: readonly string[] = ["dot", "wide", "sleepy", "visor"];
const CREST_NAMES: readonly string[] = ["none", "tuft", "horns", "halo"];
const MARK_NAMES: readonly string[] = ["none", "scar", "freckles", "stripe"];

const EYE_GAP = 14;

/** Tint helpers — every fill is a `color-mix()` off the picked swatch, never
 * a raw hex, so the head, its shade, and the marks all read as one family. */
const headFill = (color: string): string =>
  `color-mix(in oklab, ${color} 78%, var(--card))`;
const shoulderFill = (color: string): string =>
  `color-mix(in oklab, ${color} 50%, var(--card))`;
const crestFill = (color: string): string =>
  `color-mix(in oklab, ${color} 88%, var(--ink))`;
const markFill = (color: string): string =>
  `color-mix(in oklab, ${color} 82%, var(--ink))`;

/** The five fixed swatches the whole palette cycles through — three signal
 * tokens, the muted ink, and a mixed neutral. Never a raw hex. */
const COLOR_SWATCHES: readonly Swatch[] = [
  { id: "primary", label: "Primary blue", color: "var(--primary)" },
  { id: "success", label: "Signal green", color: "var(--success, #047857)" },
  { id: "warning", label: "Warning amber", color: "var(--warning, #b45309)" },
  { id: "ink", label: "Slate ink", color: "var(--ink-2)" },
  {
    id: "neutral",
    label: "Mixed neutral",
    color: "color-mix(in oklab, var(--ink-2) 45%, var(--surface-2))",
  },
];
const DEFAULT_SWATCH = COLOR_SWATCHES[0] ?? {
  id: "primary",
  label: "Primary blue",
  color: "var(--primary)",
};
const colorFor = (id: string): string =>
  COLOR_SWATCHES.find((s) => s.id === id)?.color ?? DEFAULT_SWATCH.color;
const labelFor = (id: string): string =>
  COLOR_SWATCHES.find((s) => s.id === id)?.label ?? DEFAULT_SWATCH.label;

/** "surprise me" steps every slot forward by this fixed table — never
 * `Math.random()`, because a roll nobody can reproduce makes a bug report
 * impossible to act on. Every offset is coprime with the 4-option ladder,
 * which is what makes a roll change all four slots AND lets repeated rolls
 * still reach every option: an offset of 2 would alternate between two
 * shapes forever and quietly strand the other half of the table. */
const RANDOM_OFFSETS = { head: 1, eyes: 3, crest: 3, mark: 1 } as const;

const cycleIndex = (current: number, dir: 1 | -1): number =>
  (current + dir + 4) % 4;

/** The handle table — a fixed adjective and noun set the four slot indices
 * hash into, so the same combination always names itself the same way. */
const ADJECTIVES: readonly string[] = [
  "quiet",
  "brass",
  "iron",
  "pale",
  "swift",
  "dusk",
  "amber",
  "stone",
];
const NOUNS: readonly string[] = [
  "anchor",
  "tide",
  "ridge",
  "ember",
  "harbor",
  "drift",
  "cairn",
  "reef",
];
const DEFAULT_ADJECTIVE = "quiet";
const DEFAULT_NOUN = "anchor";

/** Deterministic handle from the four slot indices, mixed into the two word
 * tables — e.g. "quiet-anchor", "brass-tide".
 *
 * The weights are chosen, not positional. A plain base-4 pack
 * (head * 64 + eyes * 16 + ...) reads as obviously correct and is silently
 * broken: 64 and 16 are both multiples of the eight-word table length, so
 * those slots cancel out entirely and cycling a head renames nothing. Every
 * slot is weighted by a value coprime with 8 instead, which guarantees that
 * changing any one slot moves at least one of the two words. */
function handleFor(
  headIdx: number,
  eyesIdx: number,
  crestIdx: number,
  markIdx: number,
): string {
  const adjIdx = headIdx * 5 + eyesIdx * 3 + crestIdx * 7 + markIdx;
  const nounIdx = headIdx * 3 + eyesIdx * 7 + crestIdx + markIdx * 5;
  const adjective = ADJECTIVES[adjIdx % ADJECTIVES.length] ?? DEFAULT_ADJECTIVE;
  const noun = NOUNS[nounIdx % NOUNS.length] ?? DEFAULT_NOUN;
  return `${adjective}-${noun}`;
}

/** Eyes — a pure lookup returning shapes, never a component reference, so it
 * stays safe to call during render. */
function renderEyes(idx: number, cx: number, cy: number): React.JSX.Element {
  switch (idx) {
    case 1:
      return (
        <>
          <ellipse
            cx={cx - EYE_GAP}
            cy={cy}
            rx={7.5}
            ry={4.2}
            fill="var(--ink)"
          />
          <ellipse
            cx={cx + EYE_GAP}
            cy={cy}
            rx={7.5}
            ry={4.2}
            fill="var(--ink)"
          />
        </>
      );
    case 2:
      return (
        <>
          <path
            d={`M${cx - EYE_GAP - 6} ${cy} q6 5 12 0`}
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M${cx + EYE_GAP - 6} ${cy} q6 5 12 0`}
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        </>
      );
    case 3:
      return (
        <rect
          x={cx - 24}
          y={cy - 5}
          width={48}
          height={10}
          rx={5}
          fill="var(--ink)"
          opacity={0.85}
        />
      );
    default:
      return (
        <>
          <circle cx={cx - EYE_GAP} cy={cy} r={3.4} fill="var(--ink)" />
          <circle cx={cx + EYE_GAP} cy={cy} r={3.4} fill="var(--ink)" />
        </>
      );
  }
}

/** Crest — sits above the head's own top edge, so a taller head still wears
 * it in the right place. */
function renderCrest(
  idx: number,
  cx: number,
  topY: number,
  color: string,
): React.JSX.Element | null {
  switch (idx) {
    case 1:
      return (
        <path
          d={`M${cx} ${topY - 18} Q${cx - 7} ${topY - 4} ${cx} ${topY + 3} Q${cx + 7} ${topY - 4} ${cx} ${topY - 18} Z`}
          fill={color}
        />
      );
    case 2:
      return (
        <>
          <path
            d={`M${cx - 20} ${topY + 4} L${cx - 11} ${topY - 16} L${cx - 4} ${topY + 2} Z`}
            fill={color}
          />
          <path
            d={`M${cx + 20} ${topY + 4} L${cx + 11} ${topY - 16} L${cx + 4} ${topY + 2} Z`}
            fill={color}
          />
        </>
      );
    case 3:
      return (
        <ellipse
          cx={cx}
          cy={topY - 16}
          rx={24}
          ry={7}
          fill="none"
          stroke={color}
          strokeWidth={3}
        />
      );
    default:
      return null;
  }
}

/** Mark — a small overlay on the face, anchored off the head's own centre. */
function renderMark(
  idx: number,
  cx: number,
  cy: number,
  color: string,
): React.JSX.Element | null {
  switch (idx) {
    case 1:
      return (
        <line
          x1={cx + 14}
          y1={cy - 14}
          x2={cx + 20}
          y2={cy + 8}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
        />
      );
    case 2:
      return (
        <>
          {[
            [-20, 4],
            [-14, 8],
            [-22, 10],
            [-16, 14],
          ].map(([dx, dy], i) => (
            <circle
              key={i}
              cx={cx + (dx ?? 0)}
              cy={cy + (dy ?? 0)}
              r={1.3}
              fill={color}
            />
          ))}
        </>
      );
    case 3:
      return (
        <rect
          x={cx - 6}
          y={cy - 24}
          width={12}
          height={48}
          rx={5}
          fill={color}
          opacity={0.55}
          transform={`rotate(20 ${cx} ${cy})`}
        />
      );
    default:
      return null;
  }
}

type PartLayerProps = {
  idx: number;
  delay: number;
  motionSafe: boolean;
  children: React.ReactNode;
};

/** Wraps one part layer's shapes so it can pop on its own, independent of
 * every other layer. Owns its own scale motion value — content swaps
 * instantly underneath (a plain state-driven re-render), and only the pop
 * that draws the eye to it is animated, set-then-sprung on `springs.flick`.
 * Never pops on mount, and never pops for a slot it is not. */
function PartLayer({
  idx,
  delay,
  motionSafe,
  children,
}: PartLayerProps): React.JSX.Element {
  const scale = useMotionValue<number>(1);
  const mounted = React.useRef(false);
  const anim = React.useRef<ReturnType<typeof animate> | null>(null);

  // Latest-ref mirrors, refreshed after every render — idx is the only
  // thing that should retrigger the pop below; motionSafe and delay just
  // steer whatever pop is already firing, read fresh at that moment.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const delayRef = React.useRef(delay);
  React.useEffect(() => {
    delayRef.current = delay;
  }, [delay]);

  React.useEffect(() => {
    return () => {
      anim.current?.stop();
    };
  }, []);

  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (!motionSafeRef.current) return;
    anim.current?.stop();
    scale.set(0.55);
    anim.current = animate(scale, 1, {
      ...springs.flick,
      delay: delayRef.current,
    });
  }, [idx, scale]);

  return (
    <motion.g
      style={{ scale, transformBox: "fill-box", transformOrigin: "center" }}
    >
      {children}
    </motion.g>
  );
}

type BustProps = {
  headIdx: number;
  eyesIdx: number;
  crestIdx: number;
  markIdx: number;
  color: string;
  size: number;
};

/** A static, unanimated render of the same geometry at roster-thumbnail
 * size — no motion values, nothing to pop, just a small honest snapshot. */
function Bust({
  headIdx,
  eyesIdx,
  crestIdx,
  markIdx,
  color,
  size,
}: BustProps): React.JSX.Element {
  const head = shapeForHead(headIdx);
  const cy = HEAD_BOTTOM - head.h / 2;
  const top = HEAD_BOTTOM - head.h;
  const height = Math.round((size * VIEW_H) / VIEW_W);

  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden
      className="block"
    >
      <path d={SHOULDERS_D} fill={shoulderFill(color)} />
      <rect
        x={CX - head.w / 2}
        y={cy - head.h / 2}
        width={head.w}
        height={head.h}
        rx={head.rx}
        fill={headFill(color)}
      />
      {renderCrest(crestIdx, CX, top, crestFill(color))}
      {renderEyes(eyesIdx, CX, cy - 2)}
      {renderMark(markIdx, CX, cy, markFill(color))}
    </svg>
  );
}

type SlotRowProps = {
  label: string;
  value: string;
  prevLabel: string;
  nextLabel: string;
  motionSafe: boolean;
  onPrev: () => void;
  onNext: () => void;
};

/** One PART SLOT row — a label, a left/right cycler, and the current option
 * name in mono. No motion values of its own; the pop lives on the preview
 * layer, not the picker. */
function SlotRow({
  label,
  value,
  prevLabel,
  nextLabel,
  motionSafe,
  onPrev,
  onNext,
}: SlotRowProps): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={`${label} shape`}
      className="flex items-center gap-2 rounded-2 border border-hairline bg-surface-2 px-2.5 py-1.5"
    >
      <span className="w-12 shrink-0 text-label text-ink-3 uppercase">
        {label}
      </span>
      <div className="flex flex-1 items-center justify-between gap-2">
        <motion.button
          type="button"
          aria-label={prevLabel}
          onClick={onPrev}
          whileTap={motionSafe ? { scale: 0.88 } : undefined}
          transition={springs.flick}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-1 border border-hairline-strong bg-surface-1 text-ink-2 transition-colors outline-none",
            "hover:text-ink",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
          )}
        >
          <ChevronLeft aria-hidden className="size-3.5" />
        </motion.button>

        <span className="min-w-0 flex-1 truncate text-center font-mono text-xs text-ink">
          {value}
        </span>

        <motion.button
          type="button"
          aria-label={nextLabel}
          onClick={onNext}
          whileTap={motionSafe ? { scale: 0.88 } : undefined}
          transition={springs.flick}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-1 border border-hairline-strong bg-surface-1 text-ink-2 transition-colors outline-none",
            "hover:text-ink",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
          )}
        >
          <ChevronRight aria-hidden className="size-3.5" />
        </motion.button>
      </div>
    </div>
  );
}

type SavedAvatar = {
  id: number;
  handle: string;
  headIdx: number;
  eyesIdx: number;
  crestIdx: number;
  markIdx: number;
  colorId: string;
};

const SWEEP_S = 0.5;
const SAVE_FLASH_S = 0.5;
const SAVE_FLASH_TIMES = [0, 0.35, 1] as const;
const SAVE_RING_S = 0.6;
const SAVE_RING_SIZE = 108;
const SAVE_CAPTION_MS = 1300;
const PREVIEW_W = 208;
const PREVIEW_H = Math.round((PREVIEW_W * VIEW_H) / VIEW_W);

export type AvatarForgeProps = {
  /** Fires with the generated handle each time a character is saved. */
  onSave?: (handle: string) => void;
  className?: string;
};

/**
 * A character maker: a large layered portrait on the left, four cycling
 * PART SLOTS and a fixed COLOUR row on the right. Every layer — head, crest,
 * eyes, mark — is its own group that pops on `springs.flick`, set-then-
 * animated, the instant its own slot changes; the rest of the bust holds
 * perfectly still, so a brief sweep across the preview always draws the eye
 * to the one thing that actually moved. "surprise me" steps every slot
 * forward by a fixed offset table in a staggered cascade — never
 * `Math.random()`, so the same starting combination always rolls the same
 * result and a reported bug can be reproduced. A mono handle is hashed
 * deterministically from the four slot indices and updates live as parts
 * change; SAVE flashes the preview, pulses a ring, stamps the handle, and
 * adds a tiny bust to a running roster of the last three saves.
 * Reduced motion: no pops, sweeps, cascades, or ring — parts swap instantly,
 * the handle still updates, and saving becomes a plain state change carried
 * by the mono caption alone.
 */
export function AvatarForge({
  onSave,
  className,
}: AvatarForgeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [headIdx, setHeadIdx] = React.useState(0);
  const [eyesIdx, setEyesIdx] = React.useState(0);
  const [crestIdx, setCrestIdx] = React.useState(0);
  const [markIdx, setMarkIdx] = React.useState(0);
  const [colorId, setColorId] = React.useState(DEFAULT_SWATCH.id);

  const [headDelay, setHeadDelay] = React.useState(0);
  const [eyesDelay, setEyesDelay] = React.useState(0);
  const [crestDelay, setCrestDelay] = React.useState(0);
  const [markDelay, setMarkDelay] = React.useState(0);

  const [sweepKey, setSweepKey] = React.useState(0);
  const [saveKey, setSaveKey] = React.useState(0);
  const [saveCaption, setSaveCaption] = React.useState<string | null>(null);
  const [savedAvatars, setSavedAvatars] = React.useState<SavedAvatar[]>([]);
  const [announce, setAnnounce] = React.useState("");

  const saveIdRef = React.useRef(0);
  const captionTimer = React.useRef<number | null>(null);
  const handleScale = useMotionValue<number>(1);
  const handleAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      handleAnim.current?.stop();
    };
  }, []);

  const handle = handleFor(headIdx, eyesIdx, crestIdx, markIdx);
  const color = colorFor(colorId);
  const head = shapeForHead(headIdx);
  const headCy = HEAD_BOTTOM - head.h / 2;
  const headTop = HEAD_BOTTOM - head.h;

  const cycleHead = (dir: 1 | -1) => {
    const next = cycleIndex(headIdx, dir);
    setHeadDelay(0);
    setHeadIdx(next);
    setSweepKey((k) => k + 1);
    setAnnounce(`Head: ${shapeForHead(next).name}.`);
  };
  const cycleEyes = (dir: 1 | -1) => {
    const next = cycleIndex(eyesIdx, dir);
    setEyesDelay(0);
    setEyesIdx(next);
    setSweepKey((k) => k + 1);
    setAnnounce(`Eyes: ${EYES_NAMES[next] ?? "dot"}.`);
  };
  const cycleCrest = (dir: 1 | -1) => {
    const next = cycleIndex(crestIdx, dir);
    setCrestDelay(0);
    setCrestIdx(next);
    setSweepKey((k) => k + 1);
    setAnnounce(`Crest: ${CREST_NAMES[next] ?? "none"}.`);
  };
  const cycleMark = (dir: 1 | -1) => {
    const next = cycleIndex(markIdx, dir);
    setMarkDelay(0);
    setMarkIdx(next);
    setSweepKey((k) => k + 1);
    setAnnounce(`Mark: ${MARK_NAMES[next] ?? "none"}.`);
  };

  const handleRandomize = () => {
    const nextHead = (headIdx + RANDOM_OFFSETS.head) % 4;
    const nextEyes = (eyesIdx + RANDOM_OFFSETS.eyes) % 4;
    const nextCrest = (crestIdx + RANDOM_OFFSETS.crest) % 4;
    const nextMark = (markIdx + RANDOM_OFFSETS.mark) % 4;
    const step = cascade(4);

    setHeadDelay(0 * step);
    setEyesDelay(1 * step);
    setCrestDelay(2 * step);
    setMarkDelay(3 * step);

    setHeadIdx(nextHead);
    setEyesIdx(nextEyes);
    setCrestIdx(nextCrest);
    setMarkIdx(nextMark);
    setSweepKey((k) => k + 1);
    setAnnounce(
      `Surprise me. Now ${shapeForHead(nextHead).name} head, ${EYES_NAMES[nextEyes] ?? "dot"} eyes, ${CREST_NAMES[nextCrest] ?? "none"} crest, ${MARK_NAMES[nextMark] ?? "none"} mark.`,
    );
  };

  const handleSave = () => {
    const snapshot: SavedAvatar = {
      id: saveIdRef.current,
      handle,
      headIdx,
      eyesIdx,
      crestIdx,
      markIdx,
      colorId,
    };
    saveIdRef.current += 1;
    setSavedAvatars((prev) => [snapshot, ...prev].slice(0, 3));
    onSave?.(handle);

    setSaveCaption(`saved as ${handle}`);
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setSaveCaption(null);
    }, SAVE_CAPTION_MS);
    setAnnounce(`Saved as ${handle}.`);

    if (motionSafe) {
      setSaveKey((k) => k + 1);
      handleAnim.current?.stop();
      handleScale.set(0.85);
      handleAnim.current = animate(handleScale, 1, springs.recoil);
    }
  };

  return (
    <div
      className={cn(
        "flex w-full max-w-2xl flex-col gap-5 rounded-4 border border-hairline bg-surface-1 p-5 sm:flex-row",
        className,
      )}
    >
      <div className="flex flex-1 flex-col items-center gap-3">
        <div
          className="relative overflow-hidden rounded-3 bg-surface-2"
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
        >
          <svg
            width={PREVIEW_W}
            height={PREVIEW_H}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            aria-hidden
            className="block"
          >
            <path
              d={SHOULDERS_D}
              style={{
                fill: shoulderFill(color),
                transition: "fill 200ms ease",
              }}
              stroke="var(--hairline-strong)"
              strokeWidth={1}
            />

            <PartLayer idx={headIdx} delay={headDelay} motionSafe={motionSafe}>
              <rect
                x={CX - head.w / 2}
                y={headCy - head.h / 2}
                width={head.w}
                height={head.h}
                rx={head.rx}
                style={{ fill: headFill(color), transition: "fill 200ms ease" }}
                stroke="var(--hairline-strong)"
                strokeWidth={1}
              />
            </PartLayer>

            <PartLayer
              idx={crestIdx}
              delay={crestDelay}
              motionSafe={motionSafe}
            >
              {renderCrest(crestIdx, CX, headTop, crestFill(color))}
            </PartLayer>

            <PartLayer idx={eyesIdx} delay={eyesDelay} motionSafe={motionSafe}>
              {renderEyes(eyesIdx, CX, headCy - 2)}
            </PartLayer>

            <PartLayer idx={markIdx} delay={markDelay} motionSafe={motionSafe}>
              {renderMark(markIdx, CX, headCy, markFill(color))}
            </PartLayer>
          </svg>

          {motionSafe && sweepKey > 0 && (
            <motion.span
              key={sweepKey}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-primary-foreground/10"
              style={{ skewX: -14 }}
              initial={{ x: "-160%" }}
              animate={{ x: "360%" }}
              transition={{ duration: SWEEP_S, ease: easings.linear }}
            />
          )}

          {motionSafe && saveKey > 0 && (
            <motion.span
              key={`flash-${saveKey}`}
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-primary-foreground/15"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: SAVE_FLASH_S,
                times: [...SAVE_FLASH_TIMES],
                ease: easings.move,
              }}
            />
          )}

          {motionSafe && saveKey > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              <motion.span
                key={`ring-${saveKey}`}
                className="absolute rounded-full"
                style={{
                  width: SAVE_RING_SIZE,
                  height: SAVE_RING_SIZE,
                  left: -SAVE_RING_SIZE / 2,
                  top: -SAVE_RING_SIZE / 2,
                  borderWidth: 2,
                  borderStyle: "solid",
                  borderColor: "var(--primary)",
                }}
                initial={{ scale: 0.6, opacity: 0.9 }}
                animate={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: SAVE_RING_S, ease: easings.exit }}
              />
            </span>
          )}
        </div>

        <motion.div
          style={{ scale: handleScale }}
          className="font-mono text-sm font-semibold text-ink"
        >
          {handle}
        </motion.div>

        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3"
        >
          <AnimatePresence mode="wait" initial={false}>
            {saveCaption && (
              <motion.span
                key={saveCaption}
                initial={motionSafe ? { opacity: 0, y: 4 } : false}
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
                {saveCaption}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <SlotRow
          label="head"
          value={head.name}
          prevLabel="Previous head shape"
          nextLabel="Next head shape"
          motionSafe={motionSafe}
          onPrev={() => cycleHead(-1)}
          onNext={() => cycleHead(1)}
        />
        <SlotRow
          label="eyes"
          value={EYES_NAMES[eyesIdx] ?? "dot"}
          prevLabel="Previous eyes shape"
          nextLabel="Next eyes shape"
          motionSafe={motionSafe}
          onPrev={() => cycleEyes(-1)}
          onNext={() => cycleEyes(1)}
        />
        <SlotRow
          label="crest"
          value={CREST_NAMES[crestIdx] ?? "none"}
          prevLabel="Previous crest shape"
          nextLabel="Next crest shape"
          motionSafe={motionSafe}
          onPrev={() => cycleCrest(-1)}
          onNext={() => cycleCrest(1)}
        />
        <SlotRow
          label="mark"
          value={MARK_NAMES[markIdx] ?? "none"}
          prevLabel="Previous mark shape"
          nextLabel="Next mark shape"
          motionSafe={motionSafe}
          onPrev={() => cycleMark(-1)}
          onNext={() => cycleMark(1)}
        />

        <div className="flex flex-col gap-1.5 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-label text-ink-3 uppercase">colour</span>
            <span className="font-mono text-[11px] text-ink-3">
              {labelFor(colorId)}
            </span>
          </div>
          <SwatchLock
            swatches={[...COLOR_SWATCHES]}
            value={colorId}
            onValueChange={setColorId}
            columns={5}
            aria-label="Colour"
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 border-t border-hairline pt-3">
          <button
            type="button"
            onClick={handleRandomize}
            className="text-xs font-medium text-ink-2 underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-ink"
          >
            surprise me
          </button>

          <motion.button
            type="button"
            onClick={handleSave}
            whileTap={motionSafe ? { scale: 0.94 } : undefined}
            transition={springs.flick}
            className={cn(
              "rounded-2 bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            Save
          </motion.button>
        </div>

        {savedAvatars.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
            <span className="text-label text-ink-3 uppercase">saved</span>
            <div className="flex items-center gap-3">
              {savedAvatars.map((a) => (
                <motion.div
                  key={a.id}
                  initial={motionSafe ? { opacity: 0, scale: 0.5 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={motionSafe ? springs.recoil : { duration: 0 }}
                  className="flex flex-col items-center gap-1"
                >
                  <div className="overflow-hidden rounded-2 border border-hairline-strong bg-surface-2">
                    <Bust
                      headIdx={a.headIdx}
                      eyesIdx={a.eyesIdx}
                      crestIdx={a.crestIdx}
                      markIdx={a.markIdx}
                      color={colorFor(a.colorId)}
                      size={36}
                    />
                  </div>
                  <span className="max-w-[64px] truncate text-label text-ink-3">
                    {a.handle}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
