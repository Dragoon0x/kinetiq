"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PinDepthKind = "note" | "photo" | "swatch" | "ticket" | "sketch";

export type PinDepthCard = {
  id: string;
  title: string;
  /** The longer text, shown when the card is brought close. */
  body?: string;
  /** A short line under the title: a date, a source, a count. */
  meta?: string;
  /** What the card is, which sets its face. @default "note" */
  kind?: PinDepthKind;
  /** The paper's colour, any CSS colour. Defaults by kind. */
  tone?: string;
  /** The pin head's colour, any CSS colour. */
  pin?: string;
  /** How long its pin is, 0 to 1 of `pinLength`. Seeded when omitted. */
  height?: number;
  /** Colour chips, for a swatch card. */
  swatches?: readonly string[];
};

export type PinDepthProps = {
  /** The cards on the board, in reading order. @default defaultPinDepthCards */
  cards?: readonly PinDepthCard[];
  /** Controlled: the id of the card brought close, or null. */
  value?: string | null;
  /** The card brought close at first, when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click, key or close that changed it, with the new id or null. */
  onValueChange?: (id: string | null) => void;
  /** How far the view swings as you move, 0 (flat) to 1.5. @default 1 */
  depth?: number;
  /** How strong and long the shadows are, 0 to 1. @default 0.6 */
  shadow?: number;
  /** The longest pin, in px: the highest a card floats above the cork. @default 36 */
  pinLength?: number;
  /** A fixed number of columns. @default 2 under 520px wide, 3 above */
  columns?: number;
  /** The pointer moves the view. Keys still tilt it when off. @default true */
  tilt?: boolean;
  /** How far cards hang askew, in degrees either way. @default 4 */
  scatter?: number;
  /** The cork's colour, any CSS colour. @default a cork pigment */
  corkColor?: string;
  /** Seeds the scatter and any pin length left unset. @default 5 */
  seed?: number;
  /** Names the board for assistive technology. @default "Pin board" */
  label?: string;
  /** The close button's name in a card brought close. @default "Put back" */
  closeLabel?: string;
  /** The heading level of a card's title when it is brought close. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** Shows the board but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the board. @default "h-[520px] w-full" */
  className?: string;
};

/** A studio's brand refresh, pinned up as a moodboard. */
export const defaultPinDepthCards: readonly PinDepthCard[] = [
  {
    id: "palette",
    kind: "swatch",
    title: "Palette",
    meta: "Four inks",
    body: "Cobalt for links and focus only, signal green for live data, and two warm neutrals for paper and type.",
    swatches: [
      "oklch(0.5 0.21 262)",
      "oklch(0.62 0.13 165)",
      "oklch(0.93 0.02 85)",
      "oklch(0.3 0.02 60)",
    ],
    height: 0.55,
    pin: "oklch(0.6 0.19 25)",
  },
  {
    id: "type",
    kind: "note",
    title: "Type specimen",
    meta: "Sans 64/72 · Mono 11",
    body: "Headlines set tight at 64 on 72. Readouts in mono with tabular figures, never below 11.",
    height: 0.9,
    pin: "oklch(0.83 0.15 92)",
  },
  {
    id: "pier",
    kind: "photo",
    title: "Coldbrook pier",
    meta: "Site visit · 14 March",
    body: "Morning light on the pier boards: the warm grey we want behind every product shot.",
    height: 0.3,
    pin: "oklch(0.58 0.15 255)",
  },
  {
    id: "expo",
    kind: "ticket",
    title: "Basinworks Expo",
    meta: "Hall C · Stand 14",
    body: "The refresh launches at the expo: banners, badges and the stand wall, all in the new palette.",
    height: 1,
    pin: "oklch(0.6 0.13 155)",
  },
  {
    id: "quiet",
    kind: "note",
    title: "Keep it quiet",
    meta: "Note from the studio lead",
    body: "One accent per screen. If everything is blue, nothing is a link.",
    tone: "oklch(0.93 0.09 98)",
    height: 0.62,
    pin: "oklch(0.96 0.01 90)",
  },
  {
    id: "mark",
    kind: "sketch",
    title: "Mark, third pass",
    meta: "Sketch · pencil",
    body: "A field line meeting a horizon: simpler than the second pass, and it still holds at 16px.",
    height: 0.75,
    pin: "oklch(0.32 0.02 260)",
  },
];

/** Papers are pigment: a card is the same card on a light page or a dark one. */
const TONES: Record<PinDepthKind, string> = {
  note: "oklch(0.97 0.015 95)",
  photo: "oklch(0.985 0.004 90)",
  swatch: "oklch(0.98 0.006 90)",
  ticket: "oklch(0.9 0.05 245)",
  sketch: "oklch(0.95 0.012 85)",
};
const ASPECT: Record<PinDepthKind, number> = {
  note: 1.04,
  photo: 1.12,
  swatch: 0.96,
  ticket: 0.62,
  sketch: 1,
};
const CORK = "oklch(0.66 0.07 62)";
const SHAFT = "oklch(0.78 0.01 250)";
const SHADE = "oklch(0.22 0.04 50)";
const SCRIM = "oklch(0.16 0.02 260 / 0.42)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x1b873593) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Placed = {
  card: PinDepthCard;
  kind: PinDepthKind;
  /** Rest rectangle on the cork, board px. */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  /** Height above the cork, px. */
  lift: number;
  /** Where the pin goes into the cork, board px. */
  px: number;
  py: number;
  rank: number;
};

function layout(
  cards: readonly PinDepthCard[],
  bw: number,
  bh: number,
  columns: number | undefined,
  pinLength: number,
  scatter: number,
  seed: number,
): Placed[] {
  const n = cards.length;
  if (n === 0) return [];
  const cols = clamp(Math.round(columns ?? (bw < 520 ? 2 : 3)), 1, 6);
  const rows = Math.ceil(n / cols);
  const pad = bw < 420 ? 12 : 18;
  const cw = (bw - pad * 2) / cols;
  const ch = (bh - pad * 2) / rows;
  const rand = lcg(seed);
  const placed = cards.map((card, i) => {
    const kind = card.kind ?? "note";
    const col = i % cols;
    const row = Math.floor(i / cols);
    const w = Math.min(cw * 0.8, 230);
    const h = Math.min(ch * 0.8, w * ASPECT[kind]);
    const jx = (rand() - 0.5) * cw * 0.1;
    const jy = (rand() - 0.5) * ch * 0.08;
    const rot = (rand() * 2 - 1) * scatter;
    const share = card.height ?? 0.2 + rand() * 0.8;
    const cx = pad + cw * (col + 0.5) + jx;
    const cy = pad + ch * (row + 0.5) + jy;
    // The pin goes through the card 9px below its top edge, turned with it.
    const a = (rot * Math.PI) / 180;
    const ox = Math.sin(-a) * -(h / 2 - 9);
    const oy = Math.cos(a) * -(h / 2 - 9);
    return {
      card,
      kind,
      x: r1(cx - w / 2),
      y: r1(cy - h / 2),
      w: r1(w),
      h: r1(h),
      rot: r1(rot),
      lift: r1(clamp01(share) * pinLength),
      px: r1(cx + ox),
      py: r1(cy + oy),
      rank: 0,
    };
  });
  // Higher cards lie over lower ones.
  [...placed]
    .map((p, i) => ({ i, lift: p.lift }))
    .sort((a, b) => a.lift - b.lift || a.i - b.i)
    .forEach(({ i }, rank) => {
      const p = placed[i];
      if (p) p.rank = rank;
    });
  return placed;
}

/** A pier at morning, drawn: the photo card's picture. */
function PierArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 80"
      preserveAspectRatio="xMidYMid slice"
      className="block h-full w-full"
    >
      <rect width="120" height="44" fill="oklch(0.86 0.04 70)" />
      <circle cx="86" cy="30" r="8" fill="oklch(0.96 0.05 85)" />
      <rect y="44" width="120" height="36" fill="oklch(0.55 0.05 235)" />
      <path d="M0 52 L 70 40 L 74 42 L 6 60 Z" fill="oklch(0.62 0.03 60)" />
      {[10, 26, 42, 58].map((x, k) => (
        <rect
          key={x}
          x={x}
          y={52 - k * 3.6}
          width="2.4"
          height={14 - k * 2}
          fill="oklch(0.35 0.02 60)"
        />
      ))}
      <rect x="0" y="66" width="120" height="1.5" fill="oklch(0.75 0.04 230)" />
    </svg>
  );
}

/** A mark in pencil: a field line meeting a horizon. */
function MarkArt() {
  return (
    <svg aria-hidden viewBox="0 0 60 40" className="block h-full w-full">
      <g
        fill="none"
        stroke="oklch(0.38 0.01 260)"
        strokeLinecap="round"
        strokeWidth="1.4"
      >
        <circle cx="30" cy="18" r="11" />
        <path d="M14 26 L 46 26" />
        <path d="M19 31 C 26 27 34 27 41 31" opacity="0.7" />
        <path d="M30 7 L 30 26" opacity="0.5" />
      </g>
      <path
        d="M10 36 L 50 36"
        stroke="oklch(0.38 0.01 260)"
        strokeWidth="0.6"
        strokeDasharray="1.5 2"
      />
    </svg>
  );
}

/** A card's face: the same on the board and close up, larger when `close`. */
function Face({
  card,
  close,
  heading,
}: {
  card: PinDepthCard;
  close: boolean;
  /** Close up, the title is the dialog's heading. */
  heading?: { id: string; level: 2 | 3 | 4 };
}) {
  const kind = card.kind ?? "note";
  const Title = heading ? (`h${heading.level}` as "h2" | "h3" | "h4") : "p";
  const title = (
    <Title
      id={heading?.id}
      className={cn(
        "font-medium text-foreground",
        close ? "text-base" : "truncate text-[11px] @[150px]:text-xs",
      )}
      title={close ? undefined : card.title}
    >
      {card.title}
    </Title>
  );
  const meta = card.meta ? (
    <p
      className={cn(
        "font-mono tracking-[0.06em] text-ink-3 uppercase",
        close ? "text-[11px]" : "truncate text-[9px]",
      )}
    >
      {card.meta}
    </p>
  ) : null;
  if (kind === "photo") {
    return (
      <div className="flex h-full flex-col gap-1.5">
        <div
          className={cn(
            "overflow-hidden rounded-[2px]",
            close ? "aspect-[3/2]" : "flex-1",
          )}
        >
          <PierArt />
        </div>
        {title}
        {close ? meta : null}
      </div>
    );
  }
  if (kind === "swatch") {
    const chips = card.swatches ?? [];
    return (
      <div className="flex h-full flex-col gap-1.5">
        <div
          className={cn(
            "flex gap-1 overflow-hidden",
            close ? "h-16" : "flex-1",
          )}
        >
          {chips.map((c, i) => (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-[2px]"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {title}
        {meta}
      </div>
    );
  }
  if (kind === "ticket") {
    return (
      <div className="flex h-full items-stretch gap-2">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <p
            className={cn(
              "font-mono leading-none font-semibold tracking-tight text-foreground",
              close ? "text-3xl" : "text-base @[150px]:text-xl",
            )}
          >
            {(card.meta ?? "").split("·")[0]?.trim() || "Entry"}
          </p>
          {title}
          {close ? meta : null}
        </div>
        <span
          aria-hidden
          className="w-0 border-l border-dashed"
          style={{ borderColor: "oklch(0.4 0.04 250 / 0.45)" }}
        />
        <span
          aria-hidden
          className="flex w-4 items-center justify-center font-mono text-[8px] text-ink-3 [writing-mode:vertical-rl]"
        >
          No. 0614
        </span>
      </div>
    );
  }
  if (kind === "sketch") {
    return (
      <div className="flex h-full flex-col gap-1.5">
        <div className={cn("overflow-hidden", close ? "h-24" : "flex-1")}>
          <MarkArt />
        </div>
        {title}
        {meta}
      </div>
    );
  }
  return (
    <div
      className="flex h-full flex-col gap-1"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0 15px, oklch(0.55 0.06 240 / 0.18) 15px 16px)",
        backgroundPosition: "0 6px",
      }}
    >
      {title}
      {card.body ? (
        <p
          className={cn(
            "text-ink-2",
            close
              ? "hidden"
              : "hidden text-[10px] leading-4 @[140px]:line-clamp-3 @[180px]:line-clamp-4",
          )}
        >
          {card.body}
        </p>
      ) : null}
      <span className="flex-1" />
      {meta}
    </div>
  );
}

function PinHead({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        backgroundImage:
          "radial-gradient(circle at 34% 30%, oklch(1 0 0 / 0.85) 0 1.4px, transparent 3px), radial-gradient(circle at 60% 70%, oklch(0 0 0 / 0.18), transparent 70%)",
        boxShadow: "1px 2px 2px oklch(0.2 0.03 50 / 0.4)",
      }}
    />
  );
}

type CardProps = {
  p: Placed;
  tx: MotionValue<number>;
  ty: MotionValue<number>;
  /** px of travel per px of height at a full swing. */
  swing: number;
  shadow: number;
  pinLength: number;
  away: boolean;
  landKey: number;
  motionSafe: boolean;
  disabled: boolean;
  onOpen: (id: string, node: HTMLButtonElement) => void;
  bind: (id: string, node: HTMLButtonElement | null) => void;
};

/**
 * One card on its pin: its shadow on the cork, its shaft, the card and the
 * pin's head, each a sibling in the board's stacking order so a higher card
 * lies over a lower one's pin.
 */
function PinnedCard({
  p,
  tx,
  ty,
  swing,
  shadow,
  pinLength,
  away,
  landKey,
  motionSafe,
  disabled,
  onOpen,
  bind,
}: CardProps) {
  const k = p.lift * swing;
  // The eye model: as the eye moves one way, things nearer to it slide the
  // other way against the cork, the more the higher they float.
  const x = useTransform(tx, (v) => r2(-v * k));
  const y = useTransform(ty, (v) => r2(-v * k));
  const headK = (p.lift + 2) * swing;
  const hx = useTransform(tx, (v) => r2(p.px - 5 - v * headK));
  const hy = useTransform(ty, (v) => r2(p.py - 5 - v * headK));
  const sx = useTransform(tx, (v) => r2(p.px - v * k));
  const sy = useTransform(ty, (v) => r2(p.py - v * k));
  const press = useMotionValue(1);

  const landing = React.useRef(landKey);
  React.useEffect(() => {
    if (landing.current === landKey) return;
    landing.current = landKey;
    if (!motionSafe) return;
    // Dropped back on its pin: a landing, two small bounces.
    press.jump(1.05);
    const c = animate(press, 1, springs.recoil);
    return () => c.stop();
  }, [landKey, motionSafe, press]);

  const s = clamp01(shadow);
  const reach = lerp(0.3, 1.15, s);
  const norm = pinLength > 0 ? p.lift / pinLength : 0;
  const offX = r1(0.45 * p.lift * reach);
  const offY = r1(0.8 * p.lift * reach);
  const blur = r1(1 + p.lift * 0.22 * (0.5 + s));
  const shade = r2((0.16 + 0.34 * s) * lerp(1, 0.62, norm));
  const z = 10 + p.rank * 2;
  const tone = p.card.tone ?? TONES[p.kind];
  const label = p.card.meta ? `${p.card.title}, ${p.card.meta}` : p.card.title;

  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-[3px] transition-opacity duration-200"
        style={{
          left: r1(p.x + offX),
          top: r1(p.y + offY),
          width: p.w,
          height: p.h,
          rotate: `${p.rot}deg`,
          backgroundColor: SHADE,
          filter: `blur(${blur}px)`,
          opacity: away ? 0 : shade,
          zIndex: 1,
        }}
      />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        style={{ zIndex: 2 }}
      >
        <motion.line
          x1={p.px}
          y1={p.py}
          x2={sx}
          y2={sy}
          stroke={SHAFT}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <motion.button
        ref={(node) => bind(p.card.id, node)}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={away}
        aria-label={label}
        disabled={disabled}
        onClick={(event) => onOpen(p.card.id, event.currentTarget)}
        className={cn(
          "light @container absolute flex cursor-pointer flex-col rounded-[3px] p-2 text-left text-foreground",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "transition-opacity duration-150 disabled:cursor-default",
        )}
        style={{
          left: p.x,
          top: p.y,
          width: p.w,
          height: p.h,
          rotate: `${p.rot}deg`,
          x,
          y,
          scale: press,
          zIndex: z,
          opacity: away ? 0 : 1,
          backgroundColor: tone,
          boxShadow: "inset 0 0 0 1px oklch(0.3 0.03 60 / 0.08)",
        }}
      >
        <span className="block h-full w-full overflow-hidden pt-2">
          <Face card={p.card} close={false} />
        </span>
      </motion.button>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0"
        style={{ x: hx, y: hy, zIndex: z + 1 }}
      >
        <PinHead color={p.card.pin ?? "oklch(0.6 0.19 25)"} />
      </motion.span>
    </>
  );
}

type CloseUpProps = {
  p: Placed;
  board: { w: number; h: number };
  tx: MotionValue<number>;
  ty: MotionValue<number>;
  swing: number;
  closing: boolean;
  motionSafe: boolean;
  headingLevel: 2 | 3 | 4;
  closeLabel: string;
  onClose: () => void;
  onClosed: (id: string) => void;
};

/**
 * The card brought close: rendered at its final size, then started from the
 * card's own rectangle (FLIP) — a lift on snap, the flight on glide — and
 * flown back the same way when it closes.
 */
function CloseUp({
  p,
  board,
  tx,
  ty,
  swing,
  closing,
  motionSafe,
  headingLevel,
  closeLabel,
  onClose,
  onClosed,
}: CloseUpProps) {
  const titleId = React.useId();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useMotionValue(1);
  const sy = useMotionValue(1);
  const rot = useMotionValue(0);
  const fade = useMotionValue(motionSafe ? 1 : 0);
  const extra = useMotionValue(motionSafe ? 0 : 1);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const [closer, setCloser] = React.useState<HTMLButtonElement | null>(null);
  const tone = p.card.tone ?? TONES[p.kind];
  const width = Math.round(Math.min(board.w - 32, 340));

  const halt = () => {
    for (const r of running.current) r.stop();
    running.current = [];
  };

  /** The card's rectangle now, as a transform of the close-up about its centre. */
  const fromCard = () => {
    const node = ref.current;
    const rect = node?.getBoundingClientRect();
    const pw = Math.max(1, node?.offsetWidth ?? rect?.width ?? 1);
    const ph = Math.max(1, node?.offsetHeight ?? rect?.height ?? 1);
    const k = p.lift * swing;
    const cx = p.x + p.w / 2 - tx.get() * k;
    const cy = p.y + p.h / 2 - ty.get() * k;
    return {
      x: r1(cx - board.w / 2),
      y: r1(cy - board.h / 2),
      sx: r2(p.w / pw),
      sy: r2(p.h / ph),
      rot: p.rot,
    };
  };

  // Arrival. Measured before paint, so the first frame is already the card.
  React.useLayoutEffect(() => {
    if (!motionSafe) {
      halt();
      running.current = [
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      ];
      return halt;
    }
    const f = fromCard();
    x.jump(f.x);
    y.jump(f.y);
    sx.jump(f.sx);
    sy.jump(f.sy);
    rot.jump(f.rot);
    // Off its pin: a lift on snap first, then the flight on glide.
    running.current = [
      animate(sx, f.sx * 1.06, springs.snap),
      animate(sy, f.sy * 1.06, {
        ...springs.snap,
        onComplete: () => {
          running.current.push(
            animate(x, 0, springs.glide),
            animate(y, 0, springs.glide),
            animate(sx, 1, springs.glide),
            animate(sy, 1, springs.glide),
            animate(rot, 0, springs.glide),
            animate(extra, 1, {
              duration: durations.base,
              ease: easings.enter,
              delay: 0.18,
            }),
          );
        },
      }),
    ];
    return halt;
    // The arrival plays once, for the card it mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving: back to wherever the card is now, then hand over to it. Opened
  // again on the way home, it turns round and comes back.
  const wasClosing = React.useRef(false);
  React.useEffect(() => {
    if (!closing) {
      if (!wasClosing.current) return;
      wasClosing.current = false;
      halt();
      running.current = motionSafe
        ? [
            animate(x, 0, springs.glide),
            animate(y, 0, springs.glide),
            animate(sx, 1, springs.glide),
            animate(sy, 1, springs.glide),
            animate(rot, 0, springs.glide),
            animate(extra, 1, {
              duration: durations.base,
              ease: easings.enter,
            }),
          ]
        : [animate(fade, 1, { duration: durations.base, ease: easings.enter })];
      return halt;
    }
    wasClosing.current = true;
    halt();
    const done = () => onClosed(p.card.id);
    if (!motionSafe) {
      running.current = [
        animate(fade, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: done,
        }),
      ];
      return halt;
    }
    const f = fromCard();
    running.current = [
      animate(extra, 0, { duration: durations.fast, ease: easings.exit }),
      animate(x, f.x, springs.glide),
      animate(y, f.y, springs.glide),
      animate(sx, f.sx, springs.glide),
      animate(rot, f.rot, springs.glide),
      animate(sy, f.sy, { ...springs.glide, onComplete: done }),
    ];
    return halt;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  React.useEffect(() => {
    if (closer && !closing) closer.focus({ preventScroll: true });
  }, [closer, closing]);

  return (
    <motion.div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // Handled here, where focus is, so the page's own Escape never sees it.
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      className="light absolute top-1/2 left-1/2 flex max-h-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-auto overscroll-contain rounded-[4px] p-4 text-foreground"
      style={{
        width,
        x,
        y,
        scaleX: sx,
        scaleY: sy,
        rotate: rot,
        opacity: fade,
        zIndex: 60,
        backgroundColor: tone,
        boxShadow:
          "0 24px 48px -16px oklch(0.15 0.03 50 / 0.5), 0 4px 10px oklch(0.15 0.03 50 / 0.2)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span aria-hidden className="mt-0.5">
          <PinHead color={p.card.pin ?? "oklch(0.6 0.19 25)"} size={8} />
        </span>
        <button
          ref={setCloser}
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors outline-none hover:bg-[oklch(0_0_0/0.06)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <Face
        card={p.card}
        close
        heading={{ id: titleId, level: headingLevel }}
      />
      {p.card.body ? (
        <motion.p
          className="text-sm leading-6 text-ink-2"
          style={{ opacity: extra }}
        >
          {p.card.body}
        </motion.p>
      ) : null}
    </motion.div>
  );
}

/**
 * Cards pinned to a cork board on pins of different lengths, each floating at
 * its own height. The pointer is the viewer's eye: moving it slides every card
 * against the cork by its height — the higher, the further — so they pass one
 * another in parallax, and since a shadow lies on the cork and stays put, the
 * gap between each card and its shadow opens and closes. Pins show their
 * shafts wherever the parallax uncovers them. The view follows on the glide
 * spring and drifts level on the drift spring.
 *
 * Clicking a card pulls it off its pin (a lift on snap, the pin left standing)
 * and flies it to the middle as a close-up on glide; Escape, the close button
 * or the dimmed board flies it back and drops it on its pin on recoil. Arrow
 * keys tilt the view a quarter of the range, Home levels it. Under reduced
 * motion the view moves only by key, at once, and the close-up cross-fades.
 */
export function PinDepth({
  cards = defaultPinDepthCards,
  value,
  defaultValue = null,
  onValueChange,
  depth = 1,
  shadow = 0.6,
  pinLength = 36,
  columns,
  tilt = true,
  scatter = 4,
  corkColor = CORK,
  seed = 5,
  label = "Pin board",
  closeLabel = "Put back",
  headingLevel = 3,
  disabled = false,
  className,
}: PinDepthProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const openId = value !== undefined ? value : own;
  const [closingId, setClosingId] = React.useState<string | null>(null);
  const [lastOpen, setLastOpen] = React.useState(openId);
  const [lands, setLands] = React.useState<Record<string, number>>({});
  const [board, setBoard] = React.useState({ w: 720, h: 520 });
  const [announcement, setAnnouncement] = React.useState("");

  // Whatever closed a card — a click, a key, the host — it flies home.
  if (lastOpen !== openId) {
    setLastOpen(openId);
    if (lastOpen && cards.some((c) => c.id === lastOpen))
      setClosingId(lastOpen);
  }

  const L = clamp(pinLength, 0, 120);
  const swing = r2(clamp(depth, 0, 2) * 0.9);
  const placed = React.useMemo(
    () =>
      layout(cards, board.w, board.h, columns, L, clamp(scatter, 0, 15), seed),
    [cards, board.w, board.h, columns, L, scatter, seed],
  );

  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const held = React.useRef<{ x: number; y: number } | null>(null);
  const hover = React.useRef(false);
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const dragFrom = React.useRef(0);

  const go = React.useCallback(
    (x: number, y: number, spring: (typeof springs)[keyof typeof springs]) => {
      for (const a of anims.current) a.stop();
      anims.current = [animate(tx, r2(x), spring), animate(ty, r2(y), spring)];
    },
    [tx, ty],
  );

  const set = React.useCallback(
    (x: number, y: number) => {
      for (const a of anims.current) a.stop();
      anims.current = [];
      tx.set(r2(x));
      ty.set(r2(y));
    },
    [tx, ty],
  );

  React.useEffect(
    () => () => {
      for (const a of anims.current) a.stop();
    },
    [],
  );

  // Reduced motion: the view does not follow the pointer; it stays where the
  // keys put it.
  React.useEffect(() => {
    if (!motionSafe && !held.current) set(0, 0);
  }, [motionSafe, set]);

  const bindBoard = React.useCallback((node: HTMLDivElement | null) => {
    boardRef.current = node;
    if (!node) return;
    const measure = () => {
      const next = {
        w: Math.max(160, Math.round(node.clientWidth)),
        h: Math.max(160, Math.round(node.clientHeight)),
      };
      setBoard((b) => (b.w === next.w && b.h === next.h ? b : next));
    };
    measure();
    const sizer = new ResizeObserver(measure);
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const bind = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) buttons.current.set(id, node);
      else buttons.current.delete(id);
    },
    [],
  );

  const choose = (next: string | null) => {
    if (next === openId) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    const card = cards.find((c) => c.id === (next ?? openId));
    if (card)
      setAnnouncement(
        next ? `${card.title}, close up` : `${card.title}, back on its pin`,
      );
  };

  const open = (id: string) => {
    if (disabled) return;
    choose(openId === id ? null : id);
  };

  const close = () => {
    const id = openId;
    if (!id) return;
    choose(null);
    // Focus goes home with the card, to its own button on the board.
    const node = buttons.current.get(id);
    if (node?.isConnected) node.focus({ preventScroll: true });
  };

  const onClosed = (id: string) => {
    setClosingId((c) => (c === id ? null : c));
    setLands((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!tilt || disabled || !motionSafe || event.pointerType === "touch")
      return;
    const node = boardRef.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    hover.current = true;
    held.current = null;
    go(
      clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1),
      clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1),
      springs.glide,
    );
  };

  const onPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === "touch" || !hover.current) return;
    hover.current = false;
    if (!held.current) go(0, 0, springs.drift);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: !tilt || disabled || !motionSafe,
    onStart: ({ event }) => {
      if (event.pointerType !== "touch") return;
      for (const a of anims.current) a.stop();
      dragFrom.current = tx.get();
    },
    onMove: ({ event, offset }) => {
      if (event.pointerType !== "touch") return;
      tx.set(r2(clamp(dragFrom.current + offset.x / (board.w / 2), -1, 1)));
    },
    onEnd: ({ event }) => {
      if (event.pointerType === "touch") go(0, 0, springs.drift);
    },
    onCancel: () => go(0, 0, springs.drift),
  });

  const keyTilt = (dx: number, dy: number) => {
    const from = held.current ?? { x: tx.get(), y: ty.get() };
    const next = {
      x: clamp(Math.round((from.x + dx * 0.5) * 2) / 2, -1, 1),
      y: clamp(Math.round((from.y + dy * 0.5) * 2) / 2, -1, 1),
    };
    held.current = next;
    if (motionSafe) go(next.x, next.y, springs.glide);
    else set(next.x, next.y);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("[role='dialog']") && event.key !== "Escape") return;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        keyTilt(-1, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        keyTilt(1, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        keyTilt(0, -1);
        break;
      case "ArrowDown":
        event.preventDefault();
        keyTilt(0, 1);
        break;
      case "Home":
      case "0":
        event.preventDefault();
        held.current = null;
        if (motionSafe) go(0, 0, springs.drift);
        else set(0, 0);
        break;
      case "Escape":
        if (openId) {
          event.preventDefault();
          close();
        }
        break;
      default:
        break;
    }
  };

  const openPlaced = openId
    ? placed.find((p) => p.card.id === openId)
    : undefined;
  const closingPlaced =
    closingId && closingId !== openId
      ? placed.find((p) => p.card.id === closingId)
      : undefined;
  const scrimShown = Boolean(openPlaced);

  return (
    <div
      role="group"
      aria-roledescription="pin board"
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={onKeyDown}
      className={cn(
        "relative overflow-clip rounded-3 border border-hairline-strong",
        className ?? "h-[520px] w-full",
      )}
    >
      <div
        ref={bindBoard}
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          onPointerMove(event);
        }}
        onPointerLeave={onPointerLeave}
        className="absolute inset-0 touch-pan-y"
        style={{
          backgroundColor: corkColor,
          backgroundImage: [
            "radial-gradient(circle at 20% 30%, oklch(0.45 0.07 52 / 0.45) 0 0.9px, transparent 1.5px)",
            "radial-gradient(circle at 70% 60%, oklch(0.8 0.06 72 / 0.45) 0 1px, transparent 1.6px)",
            "radial-gradient(circle at 40% 80%, oklch(0.4 0.06 48 / 0.35) 0 1.2px, transparent 2px)",
            "radial-gradient(ellipse at 50% 40%, transparent 55%, oklch(0.3 0.05 50 / 0.28) 100%)",
          ].join(", "),
          backgroundSize: "7px 9px, 11px 13px, 17px 19px, 100% 100%",
          boxShadow: "inset 0 2px 8px oklch(0.2 0.04 50 / 0.35)",
        }}
      >
        {placed.map((p) => (
          <PinnedCard
            key={p.card.id}
            p={p}
            tx={tx}
            ty={ty}
            swing={swing}
            shadow={shadow}
            pinLength={L}
            away={p.card.id === openId || p.card.id === closingId}
            landKey={lands[p.card.id] ?? 0}
            motionSafe={motionSafe}
            disabled={disabled}
            onOpen={(id) => open(id)}
            bind={bind}
          />
        ))}
        <motion.div
          aria-hidden
          className="absolute inset-0"
          initial={false}
          animate={{ opacity: scrimShown ? 1 : 0 }}
          transition={{
            duration: scrimShown ? durations.base : durations.fast,
            ease: scrimShown ? easings.enter : easings.exit,
          }}
          onClick={close}
          style={{
            backgroundColor: SCRIM,
            zIndex: 50,
            pointerEvents: scrimShown ? "auto" : "none",
          }}
        />
        {[closingPlaced, openPlaced].map((cp) =>
          cp ? (
            <CloseUp
              key={cp.card.id}
              p={cp}
              board={board}
              tx={tx}
              ty={ty}
              swing={swing}
              closing={cp.card.id !== openId}
              motionSafe={motionSafe}
              headingLevel={headingLevel}
              closeLabel={closeLabel}
              onClose={close}
              onClosed={onClosed}
            />
          ) : null,
        )}
      </div>
      <span id={hintId} className="sr-only">
        Enter brings a card close and Escape puts it back. Arrow keys tilt the
        view; Home levels it.
      </span>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
