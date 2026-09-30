"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CoinCurrency = "usd" | "eur" | "inr" | "gbp";

export type CoinAmountProps = {
  /** What the amount is for. The field's visible label. */
  label: string;
  /** Controlled amount, or null for an empty field. */
  value?: number | null;
  /** Initial amount when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the key, paste or clear that changed the amount, with the new amount (null when empty). */
  onValueChange?: (value: number | null) => void;
  /** The currency typed in: its symbol, grouping, notes and conversion pair. @default "usd" */
  currency?: CoinCurrency;
  /** Show the live conversion to a second currency under the field. @default true */
  convert?: boolean;
  /** How loosely the cash piles, 0 to 1: squared-off stacks at 0, a casual heap that lands harder at 1. @default 0.4 */
  stack?: number;
  /** The currency converted to. @default the usual pair: euros for dollars and pounds, dollars for euros and rupees */
  convertTo?: CoinCurrency;
  /** Units of `convertTo` per unit of `currency`. @default an illustrative fixed rate — pass a live one */
  rate?: number;
  /** The locale that groups and formats the figure. @default the currency's own (en-US, en-IE, en-IN, en-GB) */
  locale?: string;
  /** The least amount accepted. Checked, never enforced while typing. */
  min?: number;
  /** The most accepted. Checked, never enforced while typing. */
  max?: number;
  /** The form field name. A hidden input carries the amount with two decimals. */
  name?: string;
  /** @default "0.00" */
  placeholder?: string;
  /** Helper text under the field. */
  hint?: string;
  /** An error from the host. Replaces the hint and marks the field invalid. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Play the coins and notes landing. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

type CurrencyDef = {
  code: string;
  locale: string;
  /** The minor unit's mark on the coin piles. */
  minor: string;
  /** Illustrative units per dollar, for the default conversion only. */
  perDollar: number;
  /** The conversion a transfer in this currency usually needs. */
  pair: CoinCurrency;
  /** The ten and hundred notes' pigments; bundles wear the hundred. */
  notes: readonly [string, string];
  /** How thousands and up are said on the pile labels. */
  big: readonly string[];
};

const THOUSANDS = ["1K", "10K", "100K", "1M", "10M", "100M"] as const;

const CURRENCIES: Record<CoinCurrency, CurrencyDef> = {
  usd: {
    code: "USD",
    locale: "en-US",
    minor: "¢",
    perDollar: 1,
    pair: "eur",
    notes: ["oklch(0.8 0.06 150)", "oklch(0.72 0.075 165)"],
    big: THOUSANDS,
  },
  eur: {
    code: "EUR",
    locale: "en-IE",
    minor: "c",
    perDollar: 0.92,
    pair: "usd",
    notes: ["oklch(0.76 0.085 28)", "oklch(0.78 0.08 145)"],
    big: THOUSANDS,
  },
  inr: {
    code: "INR",
    locale: "en-IN",
    minor: "p",
    perDollar: 83.2,
    pair: "usd",
    notes: ["oklch(0.73 0.075 60)", "oklch(0.76 0.07 305)"],
    big: ["1K", "10K", "1L", "10L", "1Cr", "10Cr"],
  },
  gbp: {
    code: "GBP",
    locale: "en-GB",
    minor: "p",
    perDollar: 0.79,
    pair: "eur",
    notes: ["oklch(0.77 0.085 50)", "oklch(0.72 0.085 15)"],
    big: THOUSANDS,
  },
};

// Metals are pigments, not text colours: the same coin in either theme.
const METALS = {
  copper: {
    face: "oklch(0.7 0.11 50)",
    edge: "oklch(0.5 0.09 45)",
    shine: "oklch(0.86 0.07 62)",
  },
  silver: {
    face: "oklch(0.84 0.012 250)",
    edge: "oklch(0.6 0.014 250)",
    shine: "oklch(0.96 0.005 250)",
  },
  brass: {
    face: "oklch(0.8 0.12 88)",
    edge: "oklch(0.58 0.1 78)",
    shine: "oklch(0.93 0.07 95)",
  },
} as const;

/** The paper bands round a bundle, one hue per power of ten. */
const BANDS = [25, 262, 158, 80, 305, 200] as const;
const PAPER = "oklch(0.95 0.015 90)";

/** At most nine whole digits: a format limit, like maxLength. */
const MAX_WHOLE = 9;
const MINOR_DIGITS = 2;
/** The tray: a pile area and a row of labels under it. */
const PILE_H = 62;
const TRAY_H = 76;
const SLOT_GAP = 4;
/** Where the input's text runs: its padding (pl-9, pr-20) plus its 1px border. */
const TEXT_LEFT = 37;
const TEXT_RIGHT = 81;
/** px/s² — the fall that drops a piece onto its pile. */
const GRAVITY = 2600;
/** Falling accelerates: an ease-in, close to a quadratic. */
const FALL = [0.55, 0.085, 0.68, 0.53] as const;

type ExitMode = "lift" | "sweep";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const isDigit = (ch: string) => ch >= "0" && ch <= "9";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Two seeded numbers in [0, 1) for one piece: its offset and its turn. */
function jitter(key: string): [number, number] {
  const h = hash(key);
  return [(h & 0xffff) / 0x10000, (h >>> 16) / 0x10000];
}

type Formats = {
  /** A whole number's digits, grouped the locale's way, in Latin digits. */
  integer: (digits: string) => string;
  decimal: string;
  group: string;
  symbol: string;
  money: (amount: number) => string;
};

function formatsOf(locale: string, code: string): Formats {
  const latn = { numberingSystem: "latn" } as Intl.NumberFormatOptions;
  const whole = new Intl.NumberFormat(locale, {
    ...latn,
    maximumFractionDigits: 0,
  });
  const parts = new Intl.NumberFormat(locale, latn).formatToParts(1234567.5);
  const money = new Intl.NumberFormat(locale, {
    ...latn,
    style: "currency",
    currency: code,
  });
  const symbol =
    money.formatToParts(1).find((p) => p.type === "currency")?.value ?? code;
  return {
    integer: (digits) => whole.format(Number(digits || "0")),
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    symbol,
    money: (amount) => money.format(amount),
  };
}

/**
 * The raw figure is digits and at most one "." — what the visitor means,
 * without the grouping the field draws. Leading zeros go; a leading point
 * gains its zero.
 */
function sanitize(text: string): string {
  let whole = "";
  let part: string | null = null;
  for (const ch of text) {
    if (isDigit(ch)) {
      if (part === null) whole += ch;
      else part += ch;
    } else if (ch === "." && part === null) {
      part = "";
    }
  }
  whole = whole.replace(/^0+(?=\d)/, "");
  if (part !== null && whole === "") whole = "0";
  whole = whole.slice(0, MAX_WHOLE);
  return part === null ? whole : `${whole}.${part.slice(0, MINOR_DIGITS)}`;
}

/** Whether a figure is within the format limits (not the value limits). */
function fits(text: string): boolean {
  const dot = text.indexOf(".");
  const whole = (dot === -1 ? text : text.slice(0, dot))
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
  const part = dot === -1 ? "" : text.slice(dot + 1).replace(/\D/g, "");
  return whole.length <= MAX_WHOLE && part.length <= MINOR_DIGITS;
}

/**
 * What a typed or pasted string adds. A lone "." or "," typed is the decimal
 * key. In a pasted amount the last "." or "," followed by one or two digits
 * at the end is the decimal point and every other separator groups, so
 * "1.284,35", "1,284.35" and "$1,284.35" all arrive as 1284.35.
 */
function normaliseInsert(data: string, typed: boolean): string {
  const text = data.trim();
  if (typed && text.length === 1) return text === "," ? "." : text;
  const found = /[.,](\d{1,2})\D*$/.exec(text);
  if (!found) return text.replace(/\D/g, "");
  return `${text.slice(0, found.index).replace(/\D/g, "")}.${found[1] ?? ""}`;
}

const amountOf = (raw: string): number | null =>
  raw === "" ? null : Number(raw);

const canonical = (amount: number | null | undefined): string =>
  amount === null || amount === undefined || !Number.isFinite(amount)
    ? ""
    : sanitize(String(Math.abs(Number(amount.toFixed(MINOR_DIGITS)))));

const sameAmount = (a: number | null, b: number | null) =>
  a === b || (a !== null && b !== null && Math.abs(a - b) < 0.005);

type Cell = {
  key: string;
  ch: string;
  digit: number | null;
  kind: "digit" | "group" | "point";
};

/**
 * The figure as the field draws it, cell by cell. Whole digits are keyed by
 * their place from the left and decimals by theirs from the point, so typing
 * at the end adds a cell and an edit in the middle rolls the ones after it.
 */
function cellsOf(raw: string, f: Formats): Cell[] {
  if (raw === "") return [];
  const dot = raw.indexOf(".");
  const whole = dot === -1 ? raw : raw.slice(0, dot);
  const part = dot === -1 ? null : raw.slice(dot + 1);
  const out: Cell[] = [];
  let n = 0;
  for (const ch of f.integer(whole)) {
    if (isDigit(ch)) {
      out.push({ key: `i${n}`, ch, digit: Number(ch), kind: "digit" });
      n += 1;
    } else {
      out.push({ key: `g${n}`, ch, digit: null, kind: "group" });
    }
  }
  if (part !== null) {
    out.push({ key: "p", ch: f.decimal, digit: null, kind: "point" });
    Array.from(part).forEach((ch, i) =>
      out.push({ key: `f${i}`, ch, digit: Number(ch), kind: "digit" }),
    );
  }
  return out;
}

/** Caret position in the drawn text → position in the raw figure. */
const rawAt = (cells: Cell[], at: number) =>
  cells.slice(0, at).filter((c) => c.kind !== "group").length;

/** Position in the raw figure → caret position in the drawn text. */
function drawnAt(cells: Cell[], at: number): number {
  let seen = 0;
  for (let i = 0; i < cells.length; i += 1) {
    if (seen === at) return i;
    if (cells[i]?.kind !== "group") seen += 1;
  }
  return cells.length;
}

type Slot = { e: number; count: number };

/** One pile per place value, from the leading digit down to hundredths. */
function slotsOf(raw: string): Slot[] {
  const dot = raw.indexOf(".");
  const whole = (dot === -1 ? raw : raw.slice(0, dot)).replace(/^0+/, "");
  const part = (dot === -1 ? "" : raw.slice(dot + 1)).padEnd(MINOR_DIGITS, "0");
  const out: Slot[] = [];
  const top = Math.max(1, whole.length) - 1;
  for (let e = top; e >= 0; e -= 1) {
    const ch = whole[whole.length - 1 - e] ?? "0";
    out.push({ e, count: Number(ch) });
  }
  for (let i = 0; i < MINOR_DIGITS; i += 1) {
    out.push({ e: -(i + 1), count: Number(part[i] ?? "0") });
  }
  return out;
}

type Look = {
  kind: "coin" | "note" | "bundle";
  /** Width as a share of the slot. */
  share: number;
  face: string;
  edge: string;
  shine: string;
  band?: string;
};

function lookOf(e: number, def: CurrencyDef): Look {
  if (e <= -2) return { kind: "coin", share: 0.6, ...METALS.copper };
  if (e === -1) return { kind: "coin", share: 0.7, ...METALS.silver };
  if (e === 0) return { kind: "coin", share: 0.86, ...METALS.brass };
  const note = e === 1 ? def.notes[0] : def.notes[1];
  const look = {
    share: 0.96,
    face: note,
    edge: `color-mix(in oklab, ${note} 62%, black)`,
    shine: `color-mix(in oklab, ${note} 55%, white)`,
  };
  if (e <= 2) return { kind: "note", ...look };
  const hue = BANDS[(e - 3) % BANDS.length] ?? 25;
  return { kind: "bundle", ...look, band: `oklch(0.58 0.15 ${hue})` };
}

function labelOf(e: number, def: CurrencyDef): string {
  if (e < 0) return `${10 ** (MINOR_DIGITS + e)}${def.minor}`;
  if (e < 3) return String(10 ** e);
  return def.big[e - 3] ?? `1e${e}`;
}

/** Heights of one piece: its face, its edge, and how far the next sits above it. */
function bodyOf(look: Look, width: number, e: number) {
  if (look.kind === "coin") {
    const edge = e === 0 ? 3 : 2.5;
    return {
      face: Math.max(4, Math.round(width * 0.38)),
      edge,
      step: edge + 0.6,
    };
  }
  if (look.kind === "note") {
    return { face: Math.max(4, Math.round(width * 0.3)), edge: 1.5, step: 2.2 };
  }
  return { face: Math.max(4, Math.round(width * 0.26)), edge: 5, step: 5.6 };
}

/** A wheel of one digit: a strip of blank and 0–9 that rolls to its figure. */
function Wheel({
  digit,
  lh,
  roll,
  motionSafe,
}: {
  digit: number;
  lh: number;
  roll: boolean;
  motionSafe: boolean;
}) {
  const [arrived] = React.useState(() => roll && motionSafe);
  const y = useMotionValue(arrived ? 0 : -(digit + 1) * lh);
  const drawnLh = React.useRef(lh);

  React.useEffect(() => {
    const target = -(digit + 1) * lh;
    // A new size is not a new figure: the wheel moves there at once.
    if (!motionSafe || drawnLh.current !== lh) {
      drawnLh.current = lh;
      y.set(target);
      return;
    }
    if (Math.abs(y.get() - target) < 0.5) return;
    // Rolls from wherever it is, so an interrupted roll finishes.
    const controls = animate(y, target, springs.snap);
    return () => controls.stop();
  }, [digit, lh, motionSafe, y]);

  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ height: lh }}
    >
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center"
        style={{ y }}
      >
        {["", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <span key={d || "blank"} className="block" style={{ height: lh }}>
            {d || " "}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** A figure whose digits roll; keyed from the right, like an odometer. */
function Odometer({
  text,
  lh,
  roll,
  motionSafe,
  className,
}: {
  text: string;
  lh: number;
  roll: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = Array.from(text);
  return (
    <span
      className={cn("inline-flex font-mono tabular-nums", className)}
      style={{ height: lh, lineHeight: `${lh}px` }}
    >
      {chars.map((ch, i) => {
        const place = chars.length - i;
        return isDigit(ch) ? (
          <Wheel
            key={`d${place}`}
            digit={Number(ch)}
            lh={lh}
            roll={roll}
            motionSafe={motionSafe}
          />
        ) : (
          <span key={`c${place}`} className="whitespace-pre">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

type PieceProps = {
  look: Look;
  e: number;
  index: number;
  width: number;
  face: number;
  edge: number;
  left: number;
  bottom: number;
  rotate: number;
  /** How far above its rest it falls from; 0 for a piece already there. */
  fall: number;
  squash: number;
  order: number;
  count: number;
  sweep: number;
  /** The pile's count at its last commit: where this batch of arrivals began. */
  batch: React.RefObject<number>;
  motionSafe: boolean;
  onLand: (look: Look, e: number, node: Element | null) => void;
};

function Piece({
  look,
  e,
  index,
  width,
  face,
  edge,
  left,
  bottom,
  rotate,
  fall,
  squash,
  order,
  count,
  sweep,
  batch,
  motionSafe,
  onLand,
}: PieceProps) {
  const [born] = React.useState(() => ({ fall, safe: motionSafe, count }));
  const y = useMotionValue(born.fall > 0 && born.safe ? -born.fall : 0);
  const opacity = useMotionValue(born.fall > 0 && !born.safe ? 0 : 1);
  const scaleY = useMotionValue(1);
  const node = React.useRef<HTMLDivElement | null>(null);
  const landed = React.useRef(born.fall <= 0);
  const startAt = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (landed.current) {
      // A re-run that caught the landing squash finishes it rather than
      // leaving the piece pressed flat.
      if (scaleY.get() !== 1) scaleY.set(1);
      return;
    }
    // Pieces that arrive together land one after another, queued behind the
    // ones already on the pile. The start is fixed once, as a moment, so a
    // re-run (a development double pass, a tweak) neither re-queues the
    // piece nor starts its fall again from the top.
    if (startAt.current === null) {
      const from = Math.min(index, batch.current ?? 0);
      const wait = (index - from) * cascade(Math.max(1, born.count - from));
      startAt.current = performance.now() + wait * 1000;
    }
    const wait = Math.max(0, (startAt.current - performance.now()) / 1000);
    const running: AnimationPlaybackControls[] = [];
    const land = () => {
      landed.current = true;
      onLand(look, e, node.current);
    };
    if (!motionSafe) {
      y.set(0);
      running.push(
        animate(opacity, 1, {
          duration: durations.fast,
          delay: wait,
          ease: easings.enter,
          onComplete: land,
        }),
      );
    } else {
      opacity.set(1);
      const height = Math.max(0, -y.get());
      running.push(
        animate(y, 0, {
          duration: Math.sqrt((2 * height) / GRAVITY),
          delay: wait,
          ease: FALL,
          onComplete: () => {
            land();
            // The landing: the piece squashes under its own weight and
            // recovers with two small bounces.
            scaleY.set(r2(1 - squash));
            running.push(animate(scaleY, 1, springs.recoil));
          },
        }),
      );
    }
    return () => {
      for (const c of running) c.stop();
    };
  }, [
    batch,
    born,
    e,
    index,
    look,
    motionSafe,
    onLand,
    opacity,
    scaleY,
    squash,
    y,
  ]);

  const round = look.kind === "coin" ? "50%" : "1.5px";
  const faceFill =
    look.kind === "coin"
      ? `radial-gradient(ellipse 62% 70% at 38% 34%, ${look.shine}, ${look.face} 72%)`
      : `radial-gradient(ellipse 15% 40% at 50% 50%, ${look.shine} 0 88%, transparent 100%), linear-gradient(90deg, ${look.face}, color-mix(in oklab, ${look.face} 70%, ${look.shine}) 50%, ${look.face})`;
  const edgeFill =
    look.kind === "bundle"
      ? `repeating-linear-gradient(to bottom, ${look.shine} 0 1px, ${look.edge} 1px 2px)`
      : look.edge;

  return (
    <motion.div
      ref={node}
      data-piece=""
      className="absolute"
      variants={{
        gone: (mode: ExitMode) =>
          !motionSafe
            ? { opacity: 0, transition: { duration: durations.fast } }
            : mode === "sweep"
              ? {
                  x: sweep,
                  rotate: rotate + 14,
                  transition: {
                    duration: durations.slow,
                    ease: easings.exit,
                    delay: order * 0.035 + (count - index) * 0.008,
                  },
                }
              : {
                  y: -distances.step,
                  opacity: 0,
                  transition: exitFor(durations.fast),
                },
      }}
      exit="gone"
      style={{
        left,
        bottom,
        width,
        height: face + edge,
        y,
        opacity,
        rotate,
        scaleY,
        originY: 1,
      }}
    >
      <span
        className="absolute inset-x-0 bottom-0"
        style={{ height: face, borderRadius: round, background: edgeFill }}
      />
      <span
        className="absolute inset-x-0 top-0"
        style={{
          height: face,
          borderRadius: round,
          background: faceFill,
          boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${look.edge} 55%, transparent)`,
        }}
      />
      {look.band ? (
        <span
          className="absolute inset-y-0 left-1/2 w-[28%] -translate-x-1/2 rounded-[1px]"
          style={{
            background: `linear-gradient(to bottom, ${PAPER} 0 38%, ${look.band} 38% 62%, ${PAPER} 62%)`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${look.band} 70%, transparent)`,
          }}
        />
      ) : null}
    </motion.div>
  );
}

type PileProps = {
  slot: Slot;
  def: CurrencyDef;
  width: number;
  order: number;
  live: boolean;
  stack: number;
  sweep: number;
  exitMode: ExitMode;
  motionSafe: boolean;
  onLand: PieceProps["onLand"];
};

function Pile({
  slot,
  def,
  width,
  order,
  live,
  stack,
  sweep,
  exitMode,
  motionSafe,
  onLand,
}: PileProps) {
  const { e, count } = slot;
  // Every piece has its own id, so a piece put back while its predecessor
  // is still lifting off is a new piece, not the old one called back halfway.
  const [pile, setPile] = React.useState(() => ({
    ids: Array.from({ length: count }, (_, i) => i),
    next: count,
  }));
  if (pile.ids.length !== count) {
    const more = count - pile.ids.length;
    setPile(
      more > 0
        ? {
            ids: [
              ...pile.ids,
              ...Array.from({ length: more }, (_, i) => pile.next + i),
            ],
            next: pile.next + more,
          }
        : { ids: pile.ids.slice(0, count), next: pile.next },
    );
  }
  // Pieces present when the pile first rendered are already there; every
  // piece after them falls. A pile that arrives after the field came alive
  // falls in whole.
  const [base] = React.useState(() => (live ? 0 : count));
  const batch = React.useRef(count);
  React.useEffect(() => {
    batch.current = count;
  }, [count]);

  const look = React.useMemo(() => lookOf(e, def), [e, def]);
  const pieceW = Math.max(8, Math.round(width * look.share));
  const body = bodyOf(look, pieceW, e);
  const s = clamp(stack, 0, 1);

  return (
    <motion.div
      data-pile={e}
      className="relative flex shrink-0 flex-col items-center"
      style={{ width }}
      variants={{
        gone: (mode: ExitMode) =>
          !motionSafe
            ? { opacity: 0, transition: { duration: durations.fast } }
            : mode === "sweep"
              ? {
                  x: sweep,
                  transition: {
                    duration: durations.slow,
                    ease: easings.exit,
                    delay: order * 0.035,
                  },
                }
              : { opacity: 0, transition: exitFor(durations.fast) },
      }}
      exit="gone"
    >
      <div className="relative w-full" style={{ height: PILE_H }}>
        <span className="absolute inset-x-[12%] bottom-0 h-1 rounded-full bg-ink-3/15" />
        <AnimatePresence initial={false} custom={exitMode}>
          {pile.ids.map((id, index) => {
            const [a, b] = jitter(`${e}:${index}`);
            const bottom = r2(index * body.step);
            return (
              <Piece
                key={id}
                look={look}
                e={e}
                index={index}
                width={pieceW}
                face={body.face}
                edge={body.edge}
                left={r2(
                  (width - pieceW) / 2 + (a - 0.5) * 2 * s * width * 0.14,
                )}
                bottom={bottom}
                rotate={r2((b - 0.5) * 2 * s * 9)}
                fall={id >= base ? Math.round(PILE_H - bottom + 6 + s * 24) : 0}
                squash={r2(0.16 + 0.2 * s)}
                order={order}
                count={count}
                sweep={sweep}
                batch={batch}
                motionSafe={motionSafe}
                onLand={onLand}
              />
            );
          })}
        </AnimatePresence>
      </div>
      <span className="h-3.5 font-mono text-[9px] leading-[14px] text-ink-3">
        {labelOf(e, def)}
      </span>
    </motion.div>
  );
}

/**
 * A currency amount field that counts out the cash as you type. Beside the
 * figure (under it when narrow) a tray holds one pile per place value —
 * coins for hundredths, tenths and ones, notes for tens and hundreds,
 * strapped bundles from thousands up — and each pile holds exactly as many
 * pieces as its digit. A new digit drops the difference: every new piece
 * falls under gravity from above the tray and lands with a squash on the
 * recoil spring, with a click for coins and a clack for paper. Pieces that
 * are no longer needed lift off; clearing the field sweeps the whole tray
 * off to the right like a rake across a counter.
 *
 * The figure is a real text input whose grouping is placed as you type, the
 * caret keeping its place among the digits; a layer drawn cell for cell over
 * it (monospace, so the native caret and selection sit exactly on it) rolls
 * each new or changed digit into place on snap. Under it, when `convert` is
 * on, an odometer shows the amount in a second currency. Under reduced motion
 * nothing falls, rolls or sweeps: pieces fade onto and off their piles and
 * digits change in place, and the piles and conversion still follow the
 * figure, because they are the information.
 */
export function CoinAmount({
  label,
  value,
  defaultValue = null,
  onValueChange,
  currency = "usd",
  convert = true,
  stack = 0.4,
  convertTo,
  rate,
  locale,
  min,
  max,
  name,
  placeholder = "0.00",
  hint,
  error,
  required = false,
  disabled = false,
  sound = false,
  className,
}: CoinAmountProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const inputId = `${uid}-input`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const convId = `${uid}-convert`;

  const def = CURRENCIES[currency] ?? CURRENCIES.usd;
  const to = CURRENCIES[convertTo ?? def.pair] ?? CURRENCIES.eur;
  const loc = locale ?? def.locale;
  const f = React.useMemo(() => formatsOf(loc, def.code), [loc, def.code]);
  const toFormats = React.useMemo(
    () => formatsOf(to.locale, to.code),
    [to.locale, to.code],
  );
  const perUnit = rate ?? to.perDollar / def.perDollar;

  // The figure being edited. A controlled host's amount wins whenever it
  // differs from what the text means, so a refusal puts the old figure back.
  const [own, setOwn] = React.useState(() => canonical(defaultValue));
  const controlled = value !== undefined;
  const raw =
    controlled && !sameAmount(value, amountOf(own)) ? canonical(value) : own;
  const amount = amountOf(raw);

  // After the first change, new digits roll in and new pieces fall. Whether
  // a change is heard, and whether the tray lifts or sweeps, is decided by
  // who made it: the visitor's edits play; a host's change is silent.
  const [live, setLive] = React.useState(false);
  const [heard, setHeard] = React.useState(false);
  const [exitMode, setExitMode] = React.useState<ExitMode>("lift");
  const [touched, setTouched] = React.useState(false);
  const [echo, setEcho] = React.useState<{
    seen: number | null | undefined;
    reported: number | null | undefined;
  }>({ seen: value, reported: undefined });
  if (value !== echo.seen) {
    const ours =
      echo.reported !== undefined &&
      sameAmount(value ?? null, echo.reported ?? null);
    setEcho({ seen: value, reported: echo.reported });
    if (!ours) {
      setLive(true);
      setHeard(false);
      setExitMode(value === null ? "sweep" : "lift");
    }
  }

  const cells = cellsOf(raw, f);
  const slots = slotsOf(raw);

  // The field's text steps down in size before it would overflow.
  const [boxW, setBoxW] = React.useState(0);
  const [ratio, setRatio] = React.useState(0);
  const [trayW, setTrayW] = React.useState(0);
  const fontPx =
    boxW > 0 && ratio > 0
      ? clamp(Math.floor(boxW / ((cells.length + 1) * ratio)), 16, 28)
      : 28;
  const lh = Math.round(fontPx * 1.25);
  const slotW = clamp(
    trayW > 0
      ? Math.floor((trayW - SLOT_GAP * (slots.length - 1)) / slots.length)
      : 36,
    16,
    44,
  );
  const sweep = Math.round((trayW || 360) + 40);

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const trayRef = React.useRef<HTMLDivElement | null>(null);
  const pendingCaret = React.useRef<number | null>(null);
  const timers = React.useRef<number[]>([]);
  const shift = useMotionValue(0);

  const problem =
    error ??
    (amount !== null && max !== undefined && amount > max + 1e-9
      ? `That is more than ${f.money(max)}.`
      : amount !== null && min !== undefined && amount < min - 1e-9
        ? `The least you can enter is ${f.money(min)}.`
        : required && touched && amount === null
          ? "Enter an amount."
          : null);

  // Announced once each, frozen at the render that changed it.
  const [said, setSaid] = React.useState({ key: problem, n: 0, text: "" });
  if (said.key !== problem) {
    setSaid({ key: problem, n: said.n + 1, text: problem ?? "" });
  }

  const edit = (text: string, caret: number) => {
    if (disabled) return;
    const next = sanitize(text);
    if (next === raw) {
      pendingCaret.current = null;
      return;
    }
    pendingCaret.current = clamp(caret, 0, next.length);
    setOwn(next);
    setLive(true);
    setHeard(true);
    setExitMode(next === "" ? "sweep" : "lift");
    const now = amountOf(next);
    if (!sameAmount(now, amount)) {
      setEcho((e) => ({ ...e, reported: now }));
      onValueChange?.(now);
    }
    if (next === "" && raw !== "") rattle();
  };

  /** The rake's rattle as the tray is swept: a few clacks, fading. */
  const rattle = () => {
    for (const t of timers.current) window.clearTimeout(t);
    const pan = trayRef.current
      ? panFrom(trayRef.current.getBoundingClientRect().right, null)
      : 0;
    timers.current = [0, 70, 150].map((ms, i) =>
      window.setTimeout(
        () =>
          audio.play("clack", {
            pitch: r2(0.8 + i * 0.12),
            gain: r2(0.55 - i * 0.15),
            pan,
          }),
        ms,
      ),
    );
  };

  const beforeInput = (event: InputEvent, input: HTMLInputElement) => {
    if (disabled) return;
    const type = event.inputType;
    // Composition, undo and the like go through; onChange reconciles them.
    if (type === "insertCompositionText" || type.startsWith("history")) return;
    const drawn = input.value;
    const start = input.selectionStart ?? drawn.length;
    const end = input.selectionEnd ?? start;
    const a = rawAt(cells, start);
    const b = rawAt(cells, end);
    let next: string;
    let caret = a;
    if (type.startsWith("insert")) {
      const data =
        event.data ?? event.dataTransfer?.getData("text/plain") ?? "";
      const add = normaliseInsert(data, type === "insertText");
      // A second point typed where it would move the first is ignored.
      if (add === "." && raw.includes(".") && !raw.slice(a, b).includes(".")) {
        event.preventDefault();
        return;
      }
      next = raw.slice(0, a) + add + raw.slice(b);
      caret = a + add.length;
      if (type === "insertText" && !fits(next)) {
        event.preventDefault();
        return;
      }
    } else if (type.startsWith("delete")) {
      if (a !== b) {
        next = raw.slice(0, a) + raw.slice(b);
      } else if (type === "deleteContentBackward") {
        if (a === 0) {
          event.preventDefault();
          return;
        }
        next = raw.slice(0, a - 1) + raw.slice(a);
        caret = a - 1;
      } else if (type === "deleteContentForward") {
        next = raw.slice(0, a) + raw.slice(a + 1);
      } else if (type.includes("Backward")) {
        next = raw.slice(a);
        caret = 0;
      } else {
        next = raw.slice(0, a);
      }
    } else {
      return;
    }
    event.preventDefault();
    edit(next, caret);
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const text = input.value;
    const at = input.selectionStart ?? text.length;
    let plain = "";
    let caret = 0;
    Array.from(text).forEach((ch, i) => {
      let kept = "";
      if (isDigit(ch)) kept = ch;
      else if (ch === f.decimal) kept = ".";
      else if (ch !== f.group && (ch === "." || ch === ",")) kept = ".";
      plain += kept;
      if (i < at) caret += kept.length;
    });
    edit(plain, caret);
  };

  const clear = () => {
    edit("", 0);
    inputRef.current?.focus();
  };

  const onLandNow = (look: Look, e: number, node: Element | null) => {
    if (!heard) return;
    const rect = node?.getBoundingClientRect();
    const pan = rect ? panFrom(rect.left + rect.width / 2, trayRef.current) : 0;
    if (look.kind === "coin") {
      audio.play("click", {
        pitch: e <= -2 ? 1.5 : e === -1 ? 1.25 : 1,
        gain: 0.45,
        pan,
      });
    } else {
      audio.play("clack", {
        pitch: look.kind === "note" ? 1.7 : 0.9,
        gain: look.kind === "note" ? 0.26 : 0.5,
        pan,
      });
    }
  };

  const api = React.useRef({ beforeInput, onLandNow });
  React.useEffect(() => {
    api.current = { beforeInput, onLandNow };
  });
  const onLand = React.useCallback(
    (look: Look, e: number, node: Element | null) =>
      api.current.onLandNow(look, e, node),
    [],
  );

  const bindInput = React.useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (!node) return;
    const handle = (event: Event) =>
      api.current.beforeInput(event as InputEvent, node);
    node.addEventListener("beforeinput", handle);
    return () => node.removeEventListener("beforeinput", handle);
  }, []);

  const bindBox = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(() => setBoxW(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const bindProbe = React.useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    // The face's advance, per pixel of size; re-read when the font arrives.
    const observer = new ResizeObserver(() =>
      setRatio(Number((node.getBoundingClientRect().width / 1000).toFixed(4))),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const bindTray = React.useCallback((node: HTMLDivElement | null) => {
    trayRef.current = node;
    if (!node) return;
    const observer = new ResizeObserver(() => setTrayW(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The caret goes back among the digits after each edit redraws the text.
  React.useLayoutEffect(() => {
    const input = inputRef.current;
    const caret = pendingCaret.current;
    if (!input) return;
    shift.set(-input.scrollLeft);
    if (caret === null) return;
    pendingCaret.current = null;
    if (document.activeElement !== input) return;
    const at = drawnAt(cells, caret);
    input.setSelectionRange(at, at);
    shift.set(-input.scrollLeft);
  });

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
    };
  }, []);

  const converted = r2((amount ?? 0) * perUnit);
  const convertedText = toFormats.money(converted);
  const rateText = String(Number(perUnit.toPrecision(3)));
  const drawn = cells.map((c) => c.ch).join("");
  const describedBy = [
    problem ? errorId : hint ? hintId : "",
    convert ? convId : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cn("@container w-full", disabled && "opacity-50", className)}
    >
      <div className="flex flex-col gap-2 @lg:grid @lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] @lg:items-start @lg:gap-x-6">
        <label
          htmlFor={inputId}
          className="text-sm leading-5 font-medium text-foreground"
        >
          {label}
        </label>

        <div className="relative h-12">
          <input
            ref={bindInput}
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="transaction-amount"
            enterKeyHint="done"
            spellCheck={false}
            placeholder={placeholder}
            value={drawn}
            onChange={onChange}
            onKeyDown={(event) => {
              if (event.key === "Escape" && raw !== "") {
                event.preventDefault();
                clear();
              }
            }}
            onScroll={(event) => shift.set(-event.currentTarget.scrollLeft)}
            onBlur={() => setTouched(true)}
            aria-invalid={problem ? true : undefined}
            aria-describedby={describedBy || undefined}
            required={required}
            disabled={disabled}
            className={cn(
              "absolute inset-0 h-full w-full rounded-2 border bg-surface-1 pr-20 pl-9 font-mono text-transparent caret-foreground transition-colors outline-none selection:bg-cobalt-bright/25 placeholder:text-ink-3",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "disabled:cursor-not-allowed",
              problem
                ? "border-danger"
                : "border-input hover:border-hairline-strong",
            )}
            style={{ fontSize: fontPx }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-lg text-ink-2"
          >
            {f.symbol}
          </span>
          <div
            ref={bindBox}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 overflow-clip"
            style={{ left: TEXT_LEFT, right: TEXT_RIGHT }}
          >
            <span
              ref={bindProbe}
              className="invisible absolute top-0 left-0 font-mono whitespace-pre"
              style={{ fontSize: 100, lineHeight: 1 }}
            >
              0000000000
            </span>
            <motion.div
              className="absolute inset-y-0 left-0 flex items-center font-mono whitespace-pre text-foreground"
              style={{ x: shift, fontSize: fontPx, lineHeight: `${lh}px` }}
            >
              {cells.map((c) =>
                c.digit === null ? (
                  <span key={c.key}>{c.ch}</span>
                ) : (
                  <Wheel
                    key={c.key}
                    digit={c.digit}
                    lh={lh}
                    roll={live}
                    motionSafe={motionSafe}
                  />
                ),
              )}
            </motion.div>
          </div>
          <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
            <span
              aria-hidden
              className="pointer-events-none font-mono text-[11px] tracking-[0.06em] text-ink-3"
            >
              {def.code}
            </span>
            {raw !== "" && !disabled ? (
              <button
                type="button"
                aria-label="Clear amount"
                onClick={clear}
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-surface-2 hover:text-foreground",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                )}
              >
                <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
                  <path
                    d="M4 4 L12 12 M12 4 L4 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : (
              <span aria-hidden className="size-7" />
            )}
          </div>
        </div>

        <div
          ref={bindTray}
          aria-hidden
          className="relative w-full overflow-clip [contain:paint] @lg:col-start-2 @lg:row-span-4 @lg:row-start-1 @lg:self-end"
          style={{ height: TRAY_H }}
        >
          <span
            className="absolute inset-x-0 h-px bg-hairline"
            style={{ top: PILE_H }}
          />
          <div className="absolute inset-0 flex items-start justify-end gap-1">
            <AnimatePresence initial={false} custom={exitMode}>
              {slots.map((slot, i) => (
                <Pile
                  key={slot.e}
                  slot={slot}
                  def={def}
                  width={slotW}
                  order={i}
                  live={live}
                  stack={stack}
                  sweep={sweep}
                  exitMode={exitMode}
                  motionSafe={motionSafe}
                  onLand={onLand}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>

        {convert ? (
          <p
            id={convId}
            className="flex min-w-0 items-baseline gap-1.5 text-sm leading-5 text-ink-2"
          >
            <span className="sr-only">
              {`About ${convertedText}, at 1 ${def.code} to ${rateText} ${to.code}.`}
            </span>
            <span aria-hidden>≈</span>
            <Odometer
              text={convertedText}
              lh={20}
              roll={live}
              motionSafe={motionSafe}
              className={amount === null ? "text-ink-3" : "text-foreground"}
            />
            <span aria-hidden className="min-w-0 truncate text-xs text-ink-3">
              1 {def.code} = {rateText} {to.code}
            </span>
          </p>
        ) : null}

        {hint || problem ? (
          <div className="grid text-xs leading-4">
            {hint ? (
              <p
                id={hintId}
                aria-hidden={problem ? true : undefined}
                className={cn(
                  "col-start-1 row-start-1 text-ink-3 transition-opacity",
                  problem ? "opacity-0" : "opacity-100",
                )}
              >
                {hint}
              </p>
            ) : null}
            <p
              id={errorId}
              className={cn(
                "col-start-1 row-start-1 text-danger transition-opacity",
                problem ? "opacity-100" : "opacity-0",
              )}
            >
              {problem}
            </p>
          </div>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={amount === null ? "" : amount.toFixed(MINOR_DIGITS)}
        />
      ) : null}
    </div>
  );
}
