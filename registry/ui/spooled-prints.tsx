"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SpooledPrintsItem = {
  /** A picture to show. Without one, a drawn scene stands in. */
  src?: string;
  /** What the picture shows, for assistive technology. */
  alt: string;
  /** A short title, shown in the viewer and named on the print. */
  caption?: string;
};

export type SpooledPrintsProps = {
  /** The pictures, in order; every roll carries them all, each starting at its own place. @default defaultSpooledPrintsItems */
  items?: readonly SpooledPrintsItem[];
  /** How far the rolls lean, in degrees, 0 (flat strips) to 24 (steep, crossing ribbons). @default 12 */
  tilt?: number;
  /** How fast the rolls wind, 0 to 2 ×: their pace at rest and how far a scroll carries them. @default 1 */
  speed?: number;
  /** How many rolls run down the piece, 2 to 4. @default 3 */
  spools?: number;
  /** How big the spools are, 0 (slim bobbins) to 1 (fat reels). @default 0.5 */
  spoolSize?: number;
  /** How briskly the rolls wind on their own at rest, 0 (still) to 1. @default 0.25 */
  drift?: number;
  /** How much a hovered roll slows, 0 (not at all) to 1 (it stops). @default 0.8 */
  hoverSlow?: number;
  /** How far the print under the pointer lifts toward you, 0 to 1. @default 0.6 */
  lift?: number;
  /** Controlled: the index of the print open in the viewer, or null. */
  value?: number | null;
  /** The print open at first, when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that opened, stepped or closed the viewer. */
  onValueChange?: (index: number | null) => void;
  /** The ribbons' paper, any CSS colour. @default a warm cream pigment */
  paperColor?: string;
  /** Names the gallery for assistive technology. @default "Prints" */
  label?: string;
  /** Seeds each roll's lean, pace and where it starts. @default 1 */
  seed?: number;
  /** Shows the rolls and takes no input. @default false */
  disabled?: boolean;
  /** Sizes the piece. @default "h-[34rem] w-full" */
  className?: string;
};

/** Eight drawn prints from the coasts, glasshouses and fields of an invented country. */
export const defaultSpooledPrintsItems: readonly SpooledPrintsItem[] = [
  {
    alt: "A harbour at dawn: a low sun over still water, a jetty and a moored boat.",
    caption: "Coldbrook harbour, dawn",
  },
  {
    alt: "Inside a glasshouse: tall arched panes over ferns.",
    caption: "Fernworks glasshouse",
  },
  {
    alt: "Salt flats mirroring blue mountains under a pink sky.",
    caption: "Basinworks salt flats",
  },
  {
    alt: "A lighthouse on dark rocks at dusk, its beam across the sea.",
    caption: "Waylight point, dusk",
  },
  {
    alt: "Rows of round orchard trees under a golden evening.",
    caption: "Fieldline orchard",
  },
  {
    alt: "Paper lanterns strung over a night market.",
    caption: "Gauge market, night",
  },
  {
    alt: "A snow ridge under a pale winter sky, one hut below it.",
    caption: "Coldbrook ridge",
  },
  {
    alt: "Reeds at the edge of a still pool, a heron standing in them.",
    caption: "Basin reeds",
  },
];

const PAPER = "oklch(0.965 0.018 85)";
const INK = "oklch(0.42 0.02 60)";
const MAX_TILT = 24;

/** Scenes are pigment: the same in either theme. Each is composed in a 120 × 90 box. */
const SCENES: ((id: string) => React.ReactNode)[] = [
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.05 250)" />
          <stop offset="1" stopColor="oklch(0.9 0.07 55)" />
        </linearGradient>
      </defs>
      <rect width="120" height="56" fill={`url(#${id}-a)`} />
      <circle cx="78" cy="50" r="9" fill="oklch(0.94 0.08 75)" />
      <rect y="56" width="120" height="34" fill="oklch(0.62 0.06 235)" />
      <rect
        x="70"
        y="58"
        width="22"
        height="2"
        fill="oklch(0.86 0.07 70)"
        opacity="0.7"
      />
      <rect x="10" y="52" width="46" height="4" fill="oklch(0.36 0.03 60)" />
      <rect x="14" y="56" width="2" height="12" fill="oklch(0.36 0.03 60)" />
      <rect x="40" y="56" width="2" height="12" fill="oklch(0.36 0.03 60)" />
      <path d="M 66 70 L 92 70 L 88 76 L 70 76 Z" fill="oklch(0.4 0.04 30)" />
      <rect x="78" y="58" width="1.5" height="12" fill="oklch(0.4 0.04 30)" />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.93 0.03 160)" />
          <stop offset="1" stopColor="oklch(0.84 0.06 150)" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${id}-a)`} />
      {[10, 40, 70, 100].map((x) => (
        <path
          key={x}
          d={`M ${x - 14} 90 L ${x - 14} 34 Q ${x} 8 ${x + 14} 34 L ${x + 14} 90`}
          fill="none"
          stroke="oklch(0.5 0.03 160)"
          strokeWidth="1.4"
        />
      ))}
      {[18, 46, 74, 100].map((x, i) => (
        <path
          key={x}
          d={`M ${x} 90 Q ${x - 16} ${66 - i * 3} ${x - 22} ${58 - i * 2} M ${x} 90 Q ${x + 14} ${64 - i * 2} ${x + 22} ${60 - i}`}
          fill="none"
          stroke="oklch(0.52 0.12 145)"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.86 0.05 10)" />
          <stop offset="1" stopColor="oklch(0.93 0.03 60)" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${id}-a)`} />
      <path
        d="M 0 45 L 22 26 L 38 38 L 60 18 L 84 40 L 100 30 L 120 45 Z"
        fill="oklch(0.56 0.07 255)"
      />
      <path
        d="M 0 45 L 22 64 L 38 52 L 60 72 L 84 50 L 100 60 L 120 45 Z"
        fill="oklch(0.66 0.06 255)"
        opacity="0.7"
      />
      <rect y="44.5" width="120" height="1" fill="oklch(0.97 0.02 60)" />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.38 0.07 280)" />
          <stop offset="1" stopColor="oklch(0.66 0.1 30)" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${id}-a)`} />
      <path
        d="M 40 30 L 96 18 L 96 30 Z"
        fill="oklch(0.95 0.07 90)"
        opacity="0.5"
      />
      <path d="M 36 66 L 38 26 L 46 26 L 48 66 Z" fill="oklch(0.95 0.01 90)" />
      <rect x="37" y="34" width="10" height="3" fill="oklch(0.55 0.15 25)" />
      <rect x="37" y="46" width="11" height="3" fill="oklch(0.55 0.15 25)" />
      <rect x="38" y="20" width="8" height="6" fill="oklch(0.95 0.1 90)" />
      <path
        d="M 0 90 L 0 68 Q 30 58 60 66 Q 90 60 120 70 L 120 90 Z"
        fill="oklch(0.24 0.03 280)"
      />
      <rect y="78" width="120" height="12" fill="oklch(0.32 0.05 260)" />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.9 0.07 85)" />
          <stop offset="1" stopColor="oklch(0.82 0.11 70)" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${id}-a)`} />
      <rect y="44" width="120" height="46" fill="oklch(0.7 0.1 120)" />
      {[0, 1, 2].map((row) =>
        Array.from({ length: 6 + row * 2 }, (_, i) => {
          const n = 6 + row * 2;
          const x = r2(((i + 0.5) / n) * 120);
          const y = 50 + row * 13;
          const r = r2(4 + row * 2.2);
          return (
            <g key={`${row}-${i}`}>
              <ellipse
                cx={r2(x + r * 0.5)}
                cy={r2(y + r * 0.9)}
                rx={r}
                ry={r2(r * 0.35)}
                fill="oklch(0.5 0.08 125)"
              />
              <circle cx={x} cy={y} r={r} fill="oklch(0.48 0.1 135)" />
            </g>
          );
        }),
      )}
    </>
  ),
  (id) => (
    <>
      <defs>
        <radialGradient id={`${id}-a`} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="oklch(0.34 0.06 300)" />
          <stop offset="1" stopColor="oklch(0.2 0.04 280)" />
        </radialGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${id}-a)`} />
      <path
        d="M 0 22 Q 60 42 120 20"
        fill="none"
        stroke="oklch(0.5 0.02 280)"
        strokeWidth="0.8"
      />
      <path
        d="M 0 40 Q 60 58 120 38"
        fill="none"
        stroke="oklch(0.5 0.02 280)"
        strokeWidth="0.8"
      />
      {[10, 26, 44, 62, 80, 98, 112].map((x, i) => {
        const y = 22 + 18 * (1 - Math.pow((x - 60) / 60, 2)) * 0.6 + 3;
        return (
          <ellipse
            key={x}
            cx={x}
            cy={Math.round(y * 10) / 10}
            rx="5"
            ry="6"
            fill={i % 2 ? "oklch(0.8 0.15 60)" : "oklch(0.72 0.17 30)"}
          />
        );
      })}
      {[18, 38, 58, 78, 98].map((x) => (
        <ellipse
          key={x}
          cx={x}
          cy={52}
          rx="4.5"
          ry="5.5"
          fill="oklch(0.84 0.13 85)"
        />
      ))}
      <rect y="70" width="120" height="20" fill="oklch(0.16 0.03 280)" />
      {[8, 30, 54, 76, 100].map((x) => (
        <rect
          key={x}
          x={x}
          y="64"
          width="14"
          height="10"
          rx="1.5"
          fill="oklch(0.5 0.08 40)"
        />
      ))}
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.86 0.03 230)" />
          <stop offset="1" stopColor="oklch(0.95 0.01 230)" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${id}-a)`} />
      <path
        d="M 0 60 L 30 30 L 46 42 L 70 20 L 120 58 L 120 90 L 0 90 Z"
        fill="oklch(0.97 0.006 230)"
      />
      <path
        d="M 30 30 L 38 46 L 46 42 M 70 20 L 64 44 L 82 36"
        fill="none"
        stroke="oklch(0.78 0.03 240)"
        strokeWidth="1.2"
      />
      <path
        d="M 0 74 Q 60 66 120 76 L 120 90 L 0 90 Z"
        fill="oklch(0.92 0.012 230)"
      />
      <rect x="54" y="66" width="12" height="8" fill="oklch(0.5 0.06 40)" />
      <path d="M 52 66 L 60 60 L 68 66 Z" fill="oklch(0.36 0.03 40)" />
    </>
  ),
  (id) => (
    <>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.9 0.04 200)" />
          <stop offset="1" stopColor="oklch(0.74 0.05 210)" />
        </linearGradient>
      </defs>
      <rect width="120" height="90" fill={`url(#${id}-a)`} />
      <rect y="56" width="120" height="34" fill="oklch(0.66 0.05 215)" />
      {Array.from({ length: 22 }, (_, i) => {
        const x = r2(4 + i * 5.4);
        const top = 30 + ((i * 37) % 17);
        return (
          <path
            key={i}
            d={`M ${x} 90 Q ${x + 2} ${top + 10} ${x + (i % 2 ? 4 : -3)} ${top}`}
            fill="none"
            stroke="oklch(0.62 0.09 95)"
            strokeWidth="1.4"
          />
        );
      })}
      <path
        d="M 78 58 L 78 40 Q 80 34 86 36 L 84 40 L 82 40 L 82 58"
        fill="none"
        stroke="oklch(0.42 0.02 240)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <ellipse cx="80" cy="50" rx="5" ry="8" fill="oklch(0.62 0.02 240)" />
    </>
  ),
];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

type Roll = {
  /** Centre of the roll in the box, px. */
  cx: number;
  cy: number;
  /** Lean, degrees. */
  angle: number;
  /** Spool centre to spool centre plus the spools, px. */
  length: number;
  /** The paper's height and the whole roll's (with flanges). */
  ribbon: number;
  height: number;
  /** The wound barrel's width (its diameter). */
  barrel: number;
  flange: number;
  printW: number;
  printH: number;
  pitch: number;
  slots: number;
  /** +1 or −1: which way the roll winds as the page scrolls down. */
  dir: number;
  pace: number;
  /** Which picture the first slot carries. */
  start: number;
};

/** Lays the rolls down the box: each leaning its own way, sized to fit inside it whatever the lean. */
function layoutFor(
  w: number,
  h: number,
  count: number,
  tilt: number,
  spoolSize: number,
  items: number,
  seed: number,
): Roll[] {
  const n = clamp(Math.round(count), 2, 4);
  const s = Math.round(seed);
  const band = h / n;
  const out: Roll[] = [];
  for (let i = 0; i < n; i += 1) {
    const sign = i % 2 === 0 ? -1 : 1;
    const angle = r2(
      sign * clamp(tilt, 0, MAX_TILT) * (0.65 + 0.35 * hash(s, i * 7 + 1)),
    );
    const rad = (Math.abs(angle) * Math.PI) / 180;
    const ribbon = r2(clamp(band * 0.46, 50, 96));
    const flange = r2(Math.max(5, ribbon * 0.12));
    const height = ribbon + flange * 2;
    const barrel = r2(ribbon * (0.28 + 0.44 * clamp(spoolSize, 0, 1)));
    const cy = band * (i + 0.5);
    // The rotated roll's box must stay inside the piece and mostly inside its band.
    const room = Math.min(band * 1.3, 2 * Math.min(cy, h - cy) - 8);
    const byWidth = (w - 16 - height * Math.sin(rad)) / Math.cos(rad);
    const byHeight =
      rad > 0.001 ? (room - height * Math.cos(rad)) / Math.sin(rad) : Infinity;
    const length = r2(Math.max(barrel * 3, Math.min(byWidth, byHeight)));
    const printH = r2(ribbon - 18);
    const printW = r2(printH * 1.3);
    const pitch = r2(printW + 12);
    const visible = length - barrel;
    const need = Math.ceil((visible + pitch * 2) / pitch);
    const slots = Math.max(items, items * Math.ceil(need / Math.max(1, items)));
    out.push({
      cx: r2(w / 2),
      cy: r2(cy),
      angle,
      length,
      ribbon,
      height: r2(height),
      barrel,
      flange,
      printW,
      printH,
      pitch,
      slots,
      dir: i % 2 === 0 ? 1 : -1,
      pace: r2(0.7 + 0.6 * hash(s, i * 7 + 2)),
      // Each roll opens on its own stretch of the set.
      start: (i * 3 + Math.floor(hash(s, 5) * items)) % Math.max(1, items),
    });
  }
  return out;
}

/** A slot's place along the ribbon for a roll position: wrapped so it re-enters under a spool. */
const slotX = (k: number, pos: number, roll: Roll) => {
  const ring = roll.slots * roll.pitch;
  const raw = k * roll.pitch - pos;
  return ((((raw + ring / 2) % ring) + ring) % ring) - ring / 2;
};

type Lifted = { roll: number; slot: number } | null;

/** One print on a ribbon: its place rides the roll's position motion value. */
function Print({
  roll,
  rollIndex,
  slot,
  pos,
  item,
  itemIndex,
  total,
  art,
  canonical,
  focusable,
  lifted,
  lift,
  motionSafe,
  disabled,
  bind,
  onOpen,
  onHover,
  onFocusPrint,
  onBlurPrint,
}: {
  roll: Roll;
  rollIndex: number;
  slot: number;
  pos: MotionValue<number>;
  item: SpooledPrintsItem;
  itemIndex: number;
  total: number;
  art: React.ReactNode;
  canonical: boolean;
  focusable: boolean;
  lifted: boolean;
  lift: number;
  motionSafe: boolean;
  disabled: boolean;
  bind: (node: HTMLButtonElement | null) => void;
  onOpen: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onHover: (on: boolean) => void;
  onFocusPrint: () => void;
  onBlurPrint: () => void;
}) {
  const centre = (roll.length - roll.barrel) / 2;
  const x = useTransform(pos, (p) =>
    r2(centre + slotX(slot, p, roll) - roll.printW / 2),
  );
  const up = clamp(lift, 0, 1);
  return (
    <motion.button
      ref={bind}
      type="button"
      tabIndex={canonical && focusable ? 0 : -1}
      aria-hidden={canonical ? undefined : true}
      aria-label={`Open ${item.caption ?? item.alt}, ${itemIndex + 1} of ${total}`}
      aria-disabled={disabled || undefined}
      data-roll={rollIndex}
      data-slot={slot}
      onClick={onOpen}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onHover(true);
      }}
      onPointerLeave={() => onHover(false)}
      onFocus={onFocusPrint}
      onBlur={onBlurPrint}
      initial={false}
      animate={
        motionSafe
          ? { scale: lifted ? 1 + 0.08 * up : 1, y: lifted ? -6 * up : 0 }
          : { scale: 1, y: 0 }
      }
      transition={motionSafe ? springs.snap : { duration: durations.fast }}
      className={cn(
        "absolute top-0 left-0 rounded-[2px] outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-default" : "cursor-pointer",
        lifted &&
          "z-10 shadow-[0_8px_18px_color-mix(in_oklab,black_28%,transparent)]",
      )}
      style={{
        x,
        top: r2(roll.flange + 5),
        width: roll.printW,
        height: roll.printH,
      }}
    >
      <span
        className={cn(
          "block size-full overflow-clip rounded-[2px] ring-1 ring-[color-mix(in_oklab,black_10%,transparent)]",
          !motionSafe && lifted && "ring-2 ring-ring",
        )}
      >
        {art}
      </span>
      <span
        aria-hidden
        className="absolute inset-x-0 -bottom-3 text-center font-mono text-[8px] leading-none tracking-[0.08em]"
        style={{ color: INK }}
      >
        {String(itemIndex + 1).padStart(2, "0")}
      </span>
    </motion.button>
  );
}

/** A mark printed on the wound paper: it travels round the barrel as the spool turns. */
function Mark({
  turn,
  phase,
  radius,
}: {
  turn: MotionValue<number>;
  phase: number;
  radius: number;
}) {
  const x = useTransform(turn, (t) => r2(radius * Math.sin(t + phase)));
  const opacity = useTransform(turn, (t) =>
    r2(Math.max(0, Math.cos(t + phase)) * 0.55),
  );
  const scaleX = useTransform(turn, (t) =>
    r2(Math.max(0.15, Math.cos(t + phase))),
  );
  return (
    <motion.span
      aria-hidden
      className="absolute inset-y-0 left-1/2 -ml-px w-0.5"
      style={{ x, opacity, scaleX, backgroundColor: INK }}
    />
  );
}

/** A spool: a wound barrel between two flanges, its marks turning with the ribbon. */
function Spool({
  roll,
  side,
  pos,
  paper,
}: {
  roll: Roll;
  side: "start" | "end";
  pos: MotionValue<number>;
  paper: string;
}) {
  const turn = useTransform(pos, (p) => p / (roll.barrel / 2));
  const flangeW = r2(roll.barrel + 10);
  return (
    <div
      aria-hidden
      className="absolute top-0"
      style={{
        left:
          side === "start"
            ? r2((roll.barrel - flangeW) / 2)
            : r2(roll.length - roll.barrel - (flangeW - roll.barrel) / 2),
        width: flangeW,
        height: roll.height,
      }}
    >
      <span
        className="absolute inset-x-0 top-0 rounded-[3px]"
        style={{
          height: roll.flange,
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--ink) 55%, var(--background)), color-mix(in oklab, var(--ink) 30%, var(--background)) 45%, color-mix(in oklab, var(--ink) 60%, var(--background)))",
        }}
      />
      <span
        className="absolute overflow-clip"
        style={{
          left: 5,
          right: 5,
          top: roll.flange,
          bottom: roll.flange,
          backgroundImage: `linear-gradient(to right, oklch(from ${paper} calc(l - 0.2) c h), ${paper} 38%, oklch(from ${paper} calc(l + 0.02) c h) 50%, oklch(from ${paper} calc(l - 0.24) c h))`,
        }}
      >
        {Array.from({ length: 7 }, (_, j) => (
          <Mark
            key={j}
            turn={turn}
            phase={(j / 7) * Math.PI * 2}
            radius={r2(roll.barrel / 2 - 2)}
          />
        ))}
      </span>
      <span
        className="absolute inset-x-0 bottom-0 rounded-[3px]"
        style={{
          height: roll.flange,
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklab, var(--ink) 55%, var(--background)), color-mix(in oklab, var(--ink) 30%, var(--background)) 45%, color-mix(in oklab, var(--ink) 60%, var(--background)))",
        }}
      />
    </div>
  );
}

type RollState = {
  v: number;
  slow: number;
  slowAim: number;
  held: boolean;
  dragging: boolean;
  spring: AnimationPlaybackControls | null;
};

/**
 * Paper ribbons of printed pictures run between pairs of spools, each roll
 * leaning its own way down the piece. Scrolling the page winds them — every
 * roll at its own pace and in its own direction, the velocity coasting down
 * so the ribbons glide on and settle while the spools' wound paper turns with
 * them — and a slow drift keeps them winding at rest.
 *
 * A ribbon can be dragged 1:1 along its length and flicked; hovering one slows
 * it and lifts the print under the pointer on springs.snap. Clicking a print
 * opens it in a viewer inside the piece, the print straightening from the
 * roll's lean on springs.glide. It is a carousel: one tab stop, Left and Right
 * step along a roll (winding it so the print comes to the middle), Up and Down
 * change rolls, Home and End jump to the first and last print, Enter opens.
 * Under reduced motion the rolls hold still and steps jump.
 */
export function SpooledPrints({
  items = defaultSpooledPrintsItems,
  tilt = 12,
  speed = 1,
  spools = 3,
  spoolSize = 0.5,
  drift = 0.25,
  hoverSlow = 0.8,
  lift = 0.6,
  value,
  defaultValue = null,
  onValueChange,
  paperColor = PAPER,
  label = "Prints",
  seed = 1,
  disabled = false,
  className,
}: SpooledPrintsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const total = Math.max(1, items.length);
  const [box, setBox] = React.useState({ w: 320, h: 548 });
  const rolls = layoutFor(box.w, box.h, spools, tilt, spoolSize, total, seed);

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const open = value === undefined ? own : value;
  const [chosen, setActive] = React.useState({ roll: 0, item: 0 });
  // Fewer rolls or pictures than before: the tab stop moves onto one that exists.
  const active = {
    roll: clamp(chosen.roll, 0, rolls.length - 1),
    item: clamp(chosen.item, 0, total - 1),
  };
  const [lifted, setLifted] = React.useState<Lifted>(null);
  const [closeNode, setCloseNode] = React.useState<HTMLButtonElement | null>(
    null,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const prints = React.useRef(new Map<string, HTMLButtonElement>());
  const opener = React.useRef<HTMLButtonElement | null>(null);
  const visible = React.useRef(false);
  const dragged = React.useRef(false);

  // Four position values, one per possible roll, made once for the piece's
  // life; the physics behind them lives in a ref the frame loop owns.
  const p0 = useMotionValue(0);
  const p1 = useMotionValue(0);
  const p2 = useMotionValue(0);
  const p3 = useMotionValue(0);
  const positions = [p0, p1, p2, p3];
  const states = React.useRef<RollState[]>(
    Array.from({ length: 4 }, () => ({
      v: 0,
      slow: 1,
      slowAim: 1,
      held: false,
      dragging: false,
      spring: null,
    })),
  );
  const posRef = React.useRef(positions);

  const latest = React.useRef({ rolls, speed, drift, motionSafe, hoverSlow });
  React.useEffect(() => {
    latest.current = { rolls, speed, drift, motionSafe, hoverSlow };
    posRef.current = [p0, p1, p2, p3];
  });

  // The frame loop lives in one effect: it winds every roll toward its own
  // pace, coasts scroll pushes down, and stops itself once nothing moves.
  const loop = React.useRef<{ kick: () => void } | null>(null);
  React.useEffect(() => {
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = 0;
      if (!visible.current || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let busy = false;
      const L = latest.current;
      L.rolls.forEach((r, i) => {
        const st = states.current[i];
        const pos = posRef.current[i];
        if (!st || !pos) return;
        // Hover slows a roll on drift-like constants, never abruptly.
        st.slow += (st.slowAim - st.slow) * (1 - Math.exp(-dt * 3));
        if (Math.abs(st.slow - st.slowAim) > 0.002) busy = true;
        else st.slow = st.slowAim;
        if (st.dragging || st.spring) {
          busy = true;
          return;
        }
        const aim = L.motionSafe
          ? r.dir *
            r.pace *
            clamp(L.drift, 0, 1) *
            28 *
            clamp(L.speed, 0, 2) *
            st.slow *
            (st.held ? 0 : 1)
          : 0;
        // A scroll's push coasts back to the roll's own pace.
        st.v += (aim - st.v) * (1 - Math.exp(-dt * 2.2));
        if (Math.abs(st.v - aim) < 0.3) st.v = aim;
        if (Math.abs(st.v) > 0.01) {
          pos.set(r2(pos.get() + st.v * dt));
          busy = true;
        }
      });
      if (busy) frame = window.requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (frame || !visible.current || document.hidden) return;
      frame = window.requestAnimationFrame(tick);
    };
    loop.current = { kick };
    kick();
    const list = states.current;
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      loop.current = null;
      for (const st of list) st.spring?.stop();
    };
  }, []);

  const kick = React.useCallback(() => loop.current?.kick(), []);

  React.useEffect(() => {
    kick();
  });

  // Scrolling anything that scrolls this piece winds the rolls by the delta.
  React.useEffect(() => {
    const seen = new WeakMap<object, number>();
    const where = (target: EventTarget | null) => {
      if (!target || target === document) return window.scrollY;
      const el = target as HTMLElement;
      return typeof el.scrollTop === "number" ? el.scrollTop : 0;
    };
    const onScroll = (event: Event) => {
      const target =
        event.target === document ? window : (event.target ?? window);
      const now = where(event.target);
      const before = seen.get(target);
      seen.set(target, now);
      if (before === undefined || !visible.current) return;
      const root = rootRef.current;
      const el = event.target as Node | null;
      if (el && el !== document && root && !el.contains(root)) return;
      const delta = now - before;
      const L = latest.current;
      if (!L.motionSafe || delta === 0) return;
      L.rolls.forEach((r, i) => {
        const st = states.current[i];
        if (!st || st.dragging || st.spring) return;
        st.v = clamp(
          st.v + r.dir * r.pace * clamp(L.speed, 0, 2) * delta * 3.6,
          -2400,
          2400,
        );
      });
      kick();
    };
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true });
  }, [kick]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [kick]);

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const w = Math.round(node.clientWidth);
        const h = Math.round(node.clientHeight);
        if (w > 0 && h > 0)
          setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
      });
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (visible.current) kick();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        visible.current = false;
      };
    },
    [kick],
  );

  const itemAt = (roll: Roll, slot: number) => (slot + roll.start) % total;
  /** The slot that carries a picture's own (focusable) print on a roll. */
  const slotOf = (roll: Roll, item: number) =>
    (((item - roll.start) % total) + total) % total;

  /** Winds a roll so a slot sits in the middle, the short way round. */
  const centre = (rollIndex: number, slot: number) => {
    const roll = rolls[rollIndex];
    const st = states.current[rollIndex];
    const pos = positions[rollIndex];
    if (!roll || !st || !pos) return;
    const ring = roll.slots * roll.pitch;
    const now = pos.get();
    let target = slot * roll.pitch;
    target += Math.round((now - target) / ring) * ring;
    st.spring?.stop();
    st.v = 0;
    if (!motionSafe) {
      pos.jump(r2(target));
      st.spring = null;
      return;
    }
    const c = animate(pos, r2(target), springs.glide);
    st.spring = c;
    void c.then(() => {
      if (st.spring === c) st.spring = null;
    });
    kick();
  };

  const focusPrint = (rollIndex: number, item: number) => {
    const roll = rolls[rollIndex];
    if (!roll) return;
    setActive({ roll: rollIndex, item });
    prints.current.get(`${rollIndex}:${slotOf(roll, item)}`)?.focus();
    centre(rollIndex, slotOf(roll, item));
  };

  const setOpen = (next: number | null) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const close = () => {
    setOpen(null);
    const node = opener.current;
    window.setTimeout(() => {
      if (node?.isConnected) node.focus();
    }, 0);
  };

  React.useEffect(() => {
    closeNode?.focus();
  }, [closeNode]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || open !== null) return;
    const { roll, item } = active;
    let next: { roll: number; item: number } | null = null;
    if (event.key === "ArrowRight") next = { roll, item: (item + 1) % total };
    else if (event.key === "ArrowLeft")
      next = { roll, item: (item - 1 + total) % total };
    else if (event.key === "ArrowDown")
      next = { roll: Math.min(rolls.length - 1, roll + 1), item };
    else if (event.key === "ArrowUp")
      next = { roll: Math.max(0, roll - 1), item };
    else if (event.key === "Home") next = { roll, item: 0 };
    else if (event.key === "End") next = { roll, item: total - 1 };
    if (!next) return;
    event.preventDefault();
    focusPrint(next.roll, next.item);
  };

  const dialogKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (open === null) return;
      const step = event.key === "ArrowRight" ? 1 : -1;
      setOpen((open + step + total) % total);
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("button"),
    );
    const first = focusables[0];
    const lastEl = focusables[focusables.length - 1];
    if (!first || !lastEl) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastEl.focus();
    } else if (!event.shiftKey && document.activeElement === lastEl) {
      event.preventDefault();
      first.focus();
    }
  };

  const shownItem = open !== null ? items[open] : undefined;
  const openRoll = rolls[active.roll] ?? rolls[0];
  const captionId = `${uid}-caption`;

  const artFor = (index: number, slotKey: string) => {
    const item = items[index];
    if (!item) return null;
    if (item.src) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src}
          alt=""
          draggable={false}
          className="block size-full object-cover"
        />
      );
    }
    const scene = SCENES[index % SCENES.length];
    return (
      <svg
        viewBox="0 0 120 90"
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
      >
        {scene?.(`${uid}-${slotKey}`)}
      </svg>
    );
  };

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "group/spooled-prints relative isolate overflow-clip select-none",
        className ?? "h-[34rem] w-full",
      )}
    >
      {rolls.map((roll, ri) => (
        <RollView
          key={ri}
          roll={roll}
          index={ri}
          count={rolls.length}
          pos={positions[ri] ?? p0}
          runtime={() => states.current[ri]}
          paper={paperColor}
          disabled={disabled}
          motionSafe={motionSafe}
          onDragState={(on) => {
            if (on) dragged.current = true;
            else window.setTimeout(() => (dragged.current = false), 0);
            kick();
          }}
          onHoverRoll={(on) => {
            const st = states.current[ri];
            if (!st) return;
            st.slowAim = on ? 1 - clamp(hoverSlow, 0, 1) : 1;
            kick();
          }}
        >
          {Array.from({ length: roll.slots }, (_, k) => {
            const itemIndex = itemAt(roll, k);
            const item = items[itemIndex];
            if (!item) return null;
            const canonical = k < total;
            const key = `${ri}:${k}`;
            return (
              <Print
                key={k}
                roll={roll}
                rollIndex={ri}
                slot={k}
                pos={positions[ri] ?? p0}
                item={item}
                itemIndex={itemIndex}
                total={total}
                art={artFor(itemIndex, key)}
                canonical={canonical}
                focusable={active.roll === ri && active.item === itemIndex}
                lifted={lifted?.roll === ri && lifted.slot === k}
                lift={lift}
                motionSafe={motionSafe}
                disabled={disabled}
                bind={(node) => {
                  if (node) prints.current.set(key, node);
                  else prints.current.delete(key);
                }}
                onOpen={(event) => {
                  if (disabled || dragged.current) return;
                  opener.current = canonical
                    ? event.currentTarget
                    : (prints.current.get(`${ri}:${slotOf(roll, itemIndex)}`) ??
                      null);
                  setActive({ roll: ri, item: itemIndex });
                  setOpen(itemIndex);
                }}
                onHover={(on) =>
                  setLifted((cur) =>
                    on
                      ? { roll: ri, slot: k }
                      : cur?.roll === ri && cur.slot === k
                        ? null
                        : cur,
                  )
                }
                onFocusPrint={() => {
                  setActive({ roll: ri, item: itemIndex });
                  // A focused print holds its roll still, so it stays put to be read.
                  const st = states.current[ri];
                  if (st) st.held = true;
                }}
                onBlurPrint={() => {
                  const st = states.current[ri];
                  if (st) st.held = false;
                  kick();
                }}
              />
            );
          })}
        </RollView>
      ))}
      <AnimatePresence>
        {shownItem && open !== null ? (
          <motion.div
            key="viewer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={captionId}
            onKeyDown={dialogKeys}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="absolute inset-0 z-30 flex flex-col items-center-safe justify-center-safe gap-3 overflow-auto bg-[color-mix(in_oklab,var(--background)_78%,transparent)] p-4 backdrop-blur-sm"
          >
            <motion.figure
              initial={
                motionSafe
                  ? { scale: 0.9, rotate: openRoll?.angle ?? 0, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.enter }
              }
              className="flex w-full max-w-80 flex-col gap-2 rounded-2 p-2 shadow-[0_18px_40px_color-mix(in_oklab,black_30%,transparent)]"
              style={{ backgroundColor: paperColor }}
            >
              <span className="block aspect-[4/3] w-full overflow-clip rounded-[2px]">
                {artFor(open, "viewer")}
              </span>
              <figcaption
                id={captionId}
                className="flex items-baseline justify-between gap-3 px-0.5 pb-0.5 text-sm font-medium"
                style={{ color: INK }}
              >
                <span className="min-w-0 truncate">
                  {shownItem.caption ?? shownItem.alt}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums">
                  {open + 1} / {total}
                </span>
              </figcaption>
              <span className="sr-only">{shownItem.alt}</span>
            </motion.figure>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous print"
                onClick={() => setOpen((open - 1 + total) % total)}
                className="inline-flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <ChevronLeft aria-hidden className="size-4 shrink-0" />
              </button>
              <button
                ref={setCloseNode}
                type="button"
                onClick={close}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <X aria-hidden className="size-3.5 shrink-0" />
                Close
              </button>
              <button
                type="button"
                aria-label="Next print"
                onClick={() => setOpen((open + 1) % total)}
                className="inline-flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-card text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <ChevronRight aria-hidden className="size-4 shrink-0" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** One leaning roll: the paper ribbon, its prints and the two spools. */
function RollView({
  roll,
  index,
  count,
  pos,
  runtime,
  paper,
  disabled,
  motionSafe,
  onDragState,
  onHoverRoll,
  children,
}: {
  roll: Roll;
  index: number;
  count: number;
  pos: MotionValue<number>;
  runtime: () => RollState | undefined;
  paper: string;
  disabled: boolean;
  motionSafe: boolean;
  onDragState: (on: boolean) => void;
  onHoverRoll: (on: boolean) => void;
  children: React.ReactNode;
}) {
  const startPos = React.useRef(0);
  const rad = (roll.angle * Math.PI) / 180;
  const axis = { x: Math.cos(rad), y: Math.sin(rad) };

  const drag = useDrag({
    threshold: 5,
    disabled,
    onStart: () => {
      const state = runtime();
      if (!state) return;
      state.spring?.stop();
      state.spring = null;
      state.dragging = true;
      state.v = 0;
      startPos.current = pos.get();
      onDragState(true);
    },
    onMove: ({ offset }) => {
      // 1:1 along the ribbon: the finger's travel projected on the roll's axis.
      const along = offset.x * axis.x + offset.y * axis.y;
      pos.set(r2(startPos.current - along));
    },
    onEnd: ({ velocity }) => {
      const state = runtime();
      if (!state) return;
      state.dragging = false;
      const along = velocity.x * axis.x + velocity.y * axis.y;
      state.v = motionSafe ? clamp(-along, -2400, 2400) : 0;
      onDragState(false);
    },
    onCancel: () => {
      const state = runtime();
      if (!state) return;
      state.dragging = false;
      onDragState(false);
    },
  });

  return (
    <div
      role="group"
      aria-roledescription="roll"
      aria-label={`Roll ${index + 1} of ${count}`}
      {...drag}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") onHoverRoll(true);
      }}
      onPointerLeave={() => onHoverRoll(false)}
      className="absolute touch-pan-y"
      style={{
        left: r2(roll.cx - roll.length / 2),
        top: r2(roll.cy - roll.height / 2),
        width: roll.length,
        height: roll.height,
        transform: `rotate(${roll.angle}deg)`,
      }}
    >
      <div
        aria-hidden
        className="absolute shadow-[0_2px_6px_color-mix(in_oklab,black_16%,transparent)]"
        style={{
          left: r2(roll.barrel / 2),
          right: r2(roll.barrel / 2),
          top: roll.flange,
          height: roll.ribbon,
          backgroundColor: paper,
        }}
      />
      <div
        className="absolute overflow-clip"
        style={{
          left: r2(roll.barrel / 2),
          right: r2(roll.barrel / 2),
          top: -10,
          bottom: -10,
        }}
      >
        <div className="relative size-full" style={{ top: 10 }}>
          {children}
        </div>
      </div>
      <Spool roll={roll} side="start" pos={pos} paper={paper} />
      <Spool roll={roll} side="end" pos={pos} paper={paper} />
    </div>
  );
}
