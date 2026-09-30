"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SeatMapProps = {
  /** Rows of seats, 1 to 12, lettered from the stage back (I and O are skipped). @default 5 */
  rows?: number;
  /** Seats in each row, 4 to 16, numbered from the left. @default 12 */
  columns?: number;
  /** Aisles splitting each row, 0 to 3. @default 2 */
  aisles?: number;
  /** Price the rows in three bands — front, centre, rear — each with its own tint. @default true */
  tiers?: boolean;
  /** The most seats one booking may hold, 1 to 12. @default 4 */
  maxPicks?: number;
  /** Seats already sold, by id: row letter and seat number, as `"C7"`. @default [] */
  taken?: readonly string[];
  /** Controlled: the chosen seats' ids, in the order they were chosen. */
  value?: string[];
  /** Initial choice when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires from the press or key that chose or released a seat. */
  onValueChange?: (seats: string[]) => void;
  /** Every seat's price when `tiers` is off. @default 36 */
  price?: number;
  /** Front, centre and rear prices when `tiers` is on. @default [48, 36, 24] */
  tierPrices?: readonly [number, number, number];
  /** How an amount is printed. @default US dollars */
  format?: (amount: number) => string;
  /** The grid's accessible name. @default "Seats" */
  label?: string;
  /** Printed under the curve at the top. @default "Stage" */
  stageLabel?: string;
  /** Play the seats' clacks and the total's tick. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Tier = 0 | 1 | 2;
type SeatInfo = {
  id: string;
  r: number;
  c: number;
  /** The seat's number in its row, from 1. */
  n: number;
  letter: string;
  block: number;
  tier: Tier;
  price: number;
};
type Index = { r: number; c: number };

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LABEL_W = 12;
const AISLE_W = 8;
const GAP = 3;
const ROW_GAP = 4;
const MAX_SEAT = 22;
/** The seats' share of the map's height: more rows make smaller seats, not a taller map. */
const GRID_BUDGET = 172;
/** A strip of rolling digits, one line tall. */
const LINE = 20;
const TIER_NAMES = ["Front", "Centre", "Rear"] as const;
const TINTS = [
  "color-mix(in oklab, var(--warn) 24%, var(--bg-2))",
  "color-mix(in oklab, var(--accent-bright) 18%, var(--bg-2))",
  "var(--bg-2)",
] as const;
const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--ink-3) 55%, transparent) 0 1.5px, transparent 1.5px 4.5px)";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const defaultFormat = (amount: number) => dollars.format(amount);

const clampInt = (v: number, lo: number, hi: number) =>
  Math.round(Math.min(hi, Math.max(lo, v)));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Seats per block. Two aisles make the classic short-long-short; otherwise the split is even, with any spare seats in the middle. */
function blocksOf(columns: number, aisles: number): number[] {
  const n = Math.max(1, Math.min(aisles + 1, columns));
  if (n === 3) {
    const side = Math.max(1, Math.round(columns / 4));
    return [side, columns - side * 2, side];
  }
  const base = Math.floor(columns / n);
  const sizes = Array.from({ length: n }, () => base);
  const order = sizes
    .map((_, i) => i)
    .sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2));
  for (let k = 0; k < columns - base * n; k += 1) {
    const i = order[k % n] ?? 0;
    sizes[i] = (sizes[i] ?? 0) + 1;
  }
  return sizes;
}

function tierOf(r: number, rows: number): Tier {
  const band = Math.floor(rows / 3);
  if (band === 0) return 1;
  if (r < band) return 0;
  if (r >= rows - band) return 2;
  return 1;
}

/** The id the map gives a seat: its row's letter (I and O skipped) and its number, as `"C7"`. */
export const seatMapId = (rowIndex: number, seatNumber: number): string =>
  `${LETTERS[rowIndex] ?? `R${rowIndex + 1}`}${seatNumber}`;

const pitchOf = (step: number) => r3(Math.pow(2, step / 12));
const seatsWord = (n: number) => (n === 1 ? "seat" : "seats");

/**
 * A seating chart for one booking. Seats are tiles in lettered rows, split by
 * aisles and priced by band; a taken seat is hatched. Pressing a free seat
 * flips it over on its centre line to its chosen face on the snap spring,
 * with a clack as it lands flat, and the row makes room: the neighbours in
 * its block are kicked aside by a velocity whose target is their own place,
 * so each sways away and back, strongest beside it. Pressing it again flips
 * it back.
 *
 * While picks remain, the free seats beside your chosen ones (in the same
 * block, never across an aisle) light as suggestions, so a party stays
 * together; at `maxPicks` the rest dim and refuse with a shrug. The total
 * rolls digit by digit on the glide spring with a tick, and the footer reads
 * out the seat under the pointer or focus.
 *
 * It is a `role="grid"` with multi-selection: one seat is the tab stop,
 * arrows move a seat at a time (stepping over aisles), Home/End go to the
 * row's ends, Ctrl+Home/End to the corners, PageUp/PageDown to the first and
 * last rows, and Space or Enter picks — with the same flip and sounds. Under
 * reduced motion seats cross-fade instead of flipping, nothing sways, and the
 * total swaps in place.
 */
export function SeatMap({
  rows = 5,
  columns = 12,
  aisles = 2,
  tiers = true,
  maxPicks = 4,
  taken = [],
  value,
  defaultValue = [],
  onValueChange,
  price = 36,
  tierPrices = [48, 36, 24],
  format = defaultFormat,
  label = "Seats",
  stageLabel = "Stage",
  sound = false,
  disabled = false,
  className,
}: SeatMapProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const nRows = clampInt(rows, 1, 12);
  const nCols = clampInt(columns, 4, 16);
  const blocks = blocksOf(nCols, clampInt(aisles, 0, 3));
  const most = clampInt(maxPicks, 1, 12);
  const seatPx = Math.min(
    MAX_SEAT,
    Math.floor((GRID_BUDGET - (nRows - 1) * ROW_GAP) / nRows),
  );

  // The map, rebuilt from its shape: seat ids, blocks, bands and prices.
  const grid: SeatInfo[][] = [];
  const byId = new Map<string, SeatInfo>();
  for (let r = 0; r < nRows; r += 1) {
    const letter = seatMapId(r, 0).slice(0, -1);
    const tier = tiers ? tierOf(r, nRows) : 1;
    const seatPrice = tiers ? (tierPrices[tier] ?? price) : price;
    const row: SeatInfo[] = [];
    let c = 0;
    blocks.forEach((size, block) => {
      for (let k = 0; k < size; k += 1) {
        const seat: SeatInfo = {
          id: seatMapId(r, c + 1),
          r,
          c,
          n: c + 1,
          letter,
          block,
          tier,
          price: seatPrice,
        };
        row.push(seat);
        byId.set(seat.id, seat);
        c += 1;
      }
    });
    grid.push(row);
  }
  const sold = new Set(taken);

  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const raw = value ?? own;
  const picked = raw.filter(
    (id, i) => byId.has(id) && !sold.has(id) && raw.indexOf(id) === i,
  );
  const pickedSet = new Set(picked);
  const total = picked.reduce((sum, id) => sum + (byId.get(id)?.price ?? 0), 0);
  const full = picked.length >= most;

  // Free seats beside a chosen one, in the same block: where the party can grow.
  const suggested = new Set<string>();
  if (picked.length > 0 && !full) {
    for (const id of picked) {
      const s = byId.get(id);
      if (!s) continue;
      for (const d of [-1, 1]) {
        const next = grid[s.r]?.[s.c + d];
        if (
          next &&
          next.block === s.block &&
          !sold.has(next.id) &&
          !pickedSet.has(next.id)
        ) {
          suggested.add(next.id);
        }
      }
    }
  }

  const [stop, setStop] = React.useState<Index>({ r: 0, c: 0 });
  const tabR = Math.min(stop.r, nRows - 1);
  const tabC = Math.min(stop.c, nCols - 1);
  const [pointed, setPointed] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);

  const cells = React.useRef(new Map<string, HTMLDivElement>());
  const handles = React.useRef(new Map<string, (velocity: number) => void>());
  const tickArmed = React.useRef(false);

  // What a seat's landing needs, current on every render.
  const latest = React.useRef({ audio, count: picked.length, nCols, most });
  React.useEffect(() => {
    latest.current = { audio, count: picked.length, nCols, most };
  });

  // The spoken line is frozen from the value that is actually shown, so a
  // host that refuses a pick is never announced as having taken it.
  const valueKey = picked.join(" ");
  const summary = (n: number, amount: number) =>
    n === 0
      ? "No seats chosen."
      : `${n} of ${most} ${seatsWord(most)}, ${format(amount)}.`;
  const [said, setSaid] = React.useState({ key: valueKey, text: "", n: 0 });
  if (said.key !== valueKey) {
    const before = new Set(said.key ? said.key.split(" ") : []);
    const added = picked.find((id) => !before.has(id));
    const removed = [...before].find((id) => !pickedSet.has(id));
    const lead = added
      ? `${added} chosen. `
      : removed
        ? `${removed} released. `
        : "";
    setSaid({
      key: valueKey,
      text: `${lead}${summary(picked.length, total)}`,
      n: said.n + 1,
    });
  }
  const say = (text: string) =>
    setSaid((s) => ({ key: s.key, text, n: s.n + 1 }));

  // The tick belongs to the total starting to roll, and only a pick or a
  // release starts it: a host's own change of value rolls silently.
  const top = most * Math.max(price, ...tierPrices);
  React.useEffect(() => {
    if (!tickArmed.current) return;
    tickArmed.current = false;
    latest.current.audio.play("tick", {
      pitch: r3(0.8 + 0.6 * Math.min(1, top > 0 ? total / top : 0)),
      gain: 0.45,
    });
  }, [total, top]);

  const panOf = (c: number) => r3(((c + 0.5) / nCols) * 1.2 - 0.6);

  const toggle = (seat: SeatInfo) => {
    if (disabled) return;
    if (sold.has(seat.id)) {
      audio.play("shrug", { gain: 0.3, pan: panOf(seat.c) });
      say(`${seat.id} is taken.`);
      return;
    }
    const has = pickedSet.has(seat.id);
    if (!has && full) {
      audio.play("shrug", { gain: 0.3, pan: panOf(seat.c) });
      say(
        `${picked.length} of ${most} ${seatsWord(most)} chosen. Release one to pick another.`,
      );
      return;
    }
    const next = has
      ? picked.filter((id) => id !== seat.id)
      : [...picked, seat.id];
    tickArmed.current = true;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  // The row makes room when a seat flips up: each neighbour in the block is
  // given a push away from it and springs back to its own place.
  const makeRoom = (id: string) => {
    if (!motionSafe) return;
    const seat = byId.get(id);
    if (!seat) return;
    for (let d = 1; d <= 3; d += 1) {
      for (const side of [-1, 1]) {
        const other = grid[seat.r]?.[seat.c + side * d];
        if (!other || other.block !== seat.block) continue;
        handles.current.get(other.id)?.(side * (150 / d));
      }
    }
  };

  const onLand = (id: string, up: boolean) => {
    const now = latest.current;
    const seat = byId.get(id);
    const pan = seat ? r3(((seat.c + 0.5) / now.nCols) * 1.2 - 0.6) : 0;
    if (up) {
      now.audio.play("clack", {
        pitch: pitchOf(Math.max(0, now.count - 1) * 2),
        gain: 0.6,
        pan,
      });
    } else {
      now.audio.play("clack", { pitch: 0.72, gain: 0.32, pan });
    }
  };

  const focusSeat = (r: number, c: number) => {
    const rr = Math.min(nRows - 1, Math.max(0, r));
    const cc = Math.min(nCols - 1, Math.max(0, c));
    const seat = grid[rr]?.[cc];
    if (seat) cells.current.get(seat.id)?.focus();
  };

  const onKey = (event: React.KeyboardEvent, seat: SeatInfo) => {
    const { r, c } = seat;
    const corner = event.ctrlKey || event.metaKey;
    const moves: Record<string, Index | undefined> = {
      ArrowLeft: { r, c: c - 1 },
      ArrowRight: { r, c: c + 1 },
      ArrowUp: { r: r - 1, c },
      ArrowDown: { r: r + 1, c },
      Home: corner ? { r: 0, c: 0 } : { r, c: 0 },
      End: corner ? { r: nRows - 1, c: nCols - 1 } : { r, c: nCols - 1 },
      PageUp: { r: 0, c },
      PageDown: { r: nRows - 1, c },
    };
    const to = moves[event.key];
    if (to) {
      event.preventDefault();
      focusSeat(to.r, to.c);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!event.repeat) toggle(seat);
    }
  };

  const template = blocks
    .map((size) => `repeat(${size}, minmax(0, 1fr))`)
    .join(` ${AISLE_W}px `);
  const columnsCss = `${LABEL_W}px ${template} ${LABEL_W}px`;
  const maxWidth =
    LABEL_W * 2 +
    (blocks.length - 1) * AISLE_W +
    nCols * seatPx +
    (nCols + blocks.length) * GAP;

  const shownId = pointed ?? focused;
  const shownSeat = shownId ? byId.get(shownId) : undefined;
  const priceText = (s: SeatInfo) =>
    tiers ? `${TIER_NAMES[s.tier]} · ${format(s.price)}` : format(s.price);
  const readout = shownSeat
    ? sold.has(shownSeat.id)
      ? `${shownSeat.id} · Taken`
      : pickedSet.has(shownSeat.id)
        ? `${shownSeat.id} · Yours · ${priceText(shownSeat)}`
        : `${shownSeat.id} · ${priceText(shownSeat)}`
    : picked.length === 0
      ? `Pick up to ${most} ${seatsWord(most)}`
      : full
        ? `${picked.length === most ? `All ${most}` : picked.length} chosen · ${picked.join(", ")}`
        : suggested.size > 0
          ? `Together: ${[...suggested].join(", ")}`
          : picked.join(", ");

  return (
    <div
      className={cn(
        "relative flex w-full flex-col",
        disabled && "opacity-50",
        className,
      )}
      style={{ maxWidth }}
    >
      <div aria-hidden className="relative h-4 shrink-0">
        <svg
          viewBox="0 0 100 16"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          fill="none"
        >
          <path
            d="M3 9Q50 -3 97 9"
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-hairline-strong"
          />
        </svg>
        <span className="absolute inset-x-0 bottom-0 text-center font-mono text-[9px] leading-[9px] tracking-[0.2em] text-ink-3 uppercase">
          {stageLabel}
        </span>
      </div>

      <div
        role="grid"
        aria-label={label}
        aria-multiselectable="true"
        aria-disabled={disabled || undefined}
        className="mt-1.5 flex flex-col"
        style={{ rowGap: ROW_GAP }}
        onPointerLeave={() => setPointed(null)}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next))
            return;
          setFocused(null);
        }}
      >
        {grid.map((row, r) => (
          <div
            key={row[0]?.letter ?? r}
            role="row"
            className="grid items-center"
            style={{ gridTemplateColumns: columnsCss, columnGap: GAP }}
          >
            <span
              role="rowheader"
              className="text-center font-mono text-[10px] leading-none text-ink-3"
              style={{ gridColumn: 1 }}
            >
              {row[0]?.letter}
            </span>
            {row.map((seat) => (
              <Seat
                key={seat.id}
                seat={seat}
                column={2 + seat.c + seat.block}
                selected={pickedSet.has(seat.id)}
                taken={sold.has(seat.id)}
                suggested={suggested.has(seat.id)}
                dim={full && !pickedSet.has(seat.id) && !sold.has(seat.id)}
                tint={TINTS[seat.tier]}
                name={[
                  `Row ${seat.letter}, seat ${seat.n}`,
                  sold.has(seat.id)
                    ? "taken"
                    : tiers
                      ? `${TIER_NAMES[seat.tier].toLowerCase()}, ${format(seat.price)}`
                      : format(seat.price),
                  suggested.has(seat.id) ? "suggested" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                focusable={!disabled && seat.r === tabR && seat.c === tabC}
                motionSafe={motionSafe}
                disabled={disabled}
                register={(id, node, nudge) => {
                  if (node) cells.current.set(id, node);
                  else cells.current.delete(id);
                  if (nudge) handles.current.set(id, nudge);
                  else handles.current.delete(id);
                }}
                onPress={() => toggle(seat)}
                onKey={(event) => onKey(event, seat)}
                onFocus={() => {
                  setStop({ r: seat.r, c: seat.c });
                  setFocused(seat.id);
                }}
                onPoint={(on) =>
                  setPointed((p) => (on ? seat.id : p === seat.id ? null : p))
                }
                onFlipUp={() => makeRoom(seat.id)}
                onLand={(up) => onLand(seat.id, up)}
              />
            ))}
            <span
              aria-hidden
              className="text-center font-mono text-[10px] leading-none text-ink-3"
              style={{ gridColumn: 2 + nCols + blocks.length - 1 }}
            >
              {row[0]?.letter}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex h-8 shrink-0 items-center gap-3 border-t border-hairline">
        <p
          className="min-w-0 flex-1 truncate text-xs text-ink-2"
          title={readout}
        >
          {readout}
        </p>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {picked.length} {seatsWord(picked.length)}
        </span>
        <span className="shrink-0 text-sm font-medium text-foreground">
          <Rolling text={format(total)} motionSafe={motionSafe} />
          <span className="sr-only">{format(total)}</span>
        </span>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

type SeatProps = {
  seat: SeatInfo;
  column: number;
  selected: boolean;
  taken: boolean;
  suggested: boolean;
  dim: boolean;
  tint: string;
  name: string;
  focusable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  register: (
    id: string,
    node: HTMLDivElement | null,
    nudge: ((velocity: number) => void) | null,
  ) => void;
  onPress: () => void;
  onKey: (event: React.KeyboardEvent) => void;
  onFocus: () => void;
  onPoint: (on: boolean) => void;
  onFlipUp: () => void;
  onLand: (up: boolean) => void;
};

/** One seat: a tile with two faces, flipped by `turn` (0 free, 180 chosen). */
function Seat(props: SeatProps) {
  const { seat, selected, taken, motionSafe } = props;
  const turn = useMotionValue(selected ? 180 : 0);
  const sway = useMotionValue(0);
  const flip = React.useRef<AnimationPlaybackControls | null>(null);
  const push = React.useRef<AnimationPlaybackControls | null>(null);
  const was = React.useRef(selected);

  const latest = React.useRef(props);
  React.useEffect(() => {
    latest.current = props;
  });

  // The seat follows what is shown: a pick flips it, a release flips it back.
  // An effect re-run that finds it already there does nothing.
  React.useEffect(() => {
    const to = selected ? 180 : 0;
    const rising = selected && !was.current;
    was.current = selected;
    if (turn.get() === to) return;
    flip.current?.stop();
    flip.current = latest.current.motionSafe
      ? animate(turn, to, springs.snap)
      : animate(turn, to, { duration: durations.fast, ease: easings.enter });
    if (rising) latest.current.onFlipUp();
  }, [selected, turn]);

  // The clack is the tile slapping flat: heard on the frame it gets there.
  React.useEffect(() => {
    let prev = turn.get();
    const off = turn.on("change", (v) => {
      if (prev < 160 && v >= 160) latest.current.onLand(true);
      else if (prev > 20 && v <= 20) latest.current.onLand(false);
      prev = v;
    });
    return off;
  }, [turn]);

  React.useEffect(
    () => () => {
      flip.current?.stop();
      push.current?.stop();
    },
    [],
  );

  const front = useTransform(turn, (t) => (motionSafe ? r2(t) : 0));
  const back = useTransform(turn, (t) => (motionSafe ? r2(t - 180) : 0));
  const frontOpacity = useTransform(turn, (t) =>
    motionSafe ? 1 : r3(1 - Math.min(1, Math.max(0, t / 180))),
  );
  const backOpacity = useTransform(turn, (t) =>
    motionSafe ? 1 : r3(Math.min(1, Math.max(0, t / 180))),
  );
  const x = useTransform(sway, (v) => r2(v));

  const { id } = seat;
  const register = props.register;
  const setNode = React.useCallback(
    (node: HTMLDivElement | null) => {
      register(
        id,
        node,
        node
          ? (velocity: number) => {
              push.current?.stop();
              push.current = animate(sway, 0, { ...springs.snap, velocity });
            }
          : null,
      );
    },
    // The registry is the parent's; only the seat and its sway identify the node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, sway],
  );

  return (
    <div
      ref={setNode}
      role="gridcell"
      aria-selected={selected}
      aria-disabled={taken || props.disabled || undefined}
      aria-label={props.name}
      tabIndex={props.focusable ? 0 : -1}
      onClick={props.onPress}
      onKeyDown={props.onKey}
      onFocus={props.onFocus}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") props.onPoint(true);
      }}
      onPointerLeave={() => props.onPoint(false)}
      className={cn(
        "group/seat-map relative aspect-square w-full touch-manipulation rounded-[5px] transition-opacity duration-200 select-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
        taken || props.disabled ? "cursor-not-allowed" : "cursor-pointer",
        props.dim && "opacity-45",
      )}
      style={{ gridColumn: props.column, perspective: 90 }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{ x }}
      >
        <motion.span
          className={cn(
            "absolute inset-0 rounded-[5px] border [backface-visibility:hidden]",
            taken
              ? "border-hairline bg-surface-1"
              : "border-hairline-strong transition-colors duration-150 group-hover/seat-map:border-ink-3",
          )}
          style={{
            rotateX: front,
            opacity: frontOpacity,
            backgroundColor: taken ? undefined : props.tint,
            backgroundImage: taken ? HATCH : undefined,
          }}
        >
          {taken ? null : (
            <span className="absolute inset-x-[3px] bottom-[2px] h-[2px] rounded-full bg-ink-3/45" />
          )}
        </motion.span>
        <motion.span
          className="absolute inset-0 flex items-center justify-center rounded-[5px] bg-primary font-mono text-[9px] leading-none font-medium text-primary-foreground tabular-nums [backface-visibility:hidden]"
          style={{ rotateX: back, opacity: backOpacity }}
        >
          {seat.n}
        </motion.span>
      </motion.span>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-[2px] rounded-[6px] border border-dashed border-cobalt-bright transition-opacity duration-200",
          props.suggested ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

/** A figure whose digits roll: each digit is a strip of 0–9 behind a one-line window. */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex font-mono tabular-nums">
      {chars.map((ch, i) => {
        // Keyed from the right, so a new leading digit never re-rolls the rest.
        const place = chars.length - i;
        return /\d/.test(ch) ? (
          <Digit key={`d${place}`} value={Number(ch)} motionSafe={motionSafe} />
        ) : (
          <span key={`c${place}${ch}`} className="leading-5">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const at = useMotionValue(value);
  React.useEffect(() => {
    if (at.get() === value) return;
    if (!motionSafe) {
      at.set(value);
      return;
    }
    // A newer value takes over from wherever this roll has got to.
    const run = animate(at, value, springs.glide);
    return () => run.stop();
  }, [at, motionSafe, value]);
  const y = useTransform(at, (v) => r2(-v * LINE));
  return (
    <span className="relative inline-block h-5 overflow-clip">
      <motion.span className="flex flex-col" style={{ y }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span key={d} className="h-5 leading-5">
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}
