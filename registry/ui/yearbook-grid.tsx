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

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type YearbookPerson = {
  /** The name printed under the portrait. */
  name: string;
  /** Their role, printed under the name. */
  role: string;
  /** A portrait. Without one, `art` or a drawn portrait is used. */
  src?: string;
  /** Describes the portrait. Defaults to "Portrait of Name". */
  alt?: string;
  /** Your own portrait art (cropped to the cell, top kept). */
  art?: React.ReactNode;
};

export type YearbookGridProps = {
  /** The people, in reading order. @default defaultYearbookPeople */
  people?: YearbookPerson[];
  /** Controlled: the pinned person, whose row and column stay open when the pointer leaves; null for none. */
  value?: number | null;
  /** Initial pinned person when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that pinned or unpinned someone. */
  onValueChange?: (index: number | null) => void;
  /** Fires as the face in focus changes (pointer or keyboard), or null when the grid rests. */
  onFocusChange?: (index: number | null) => void;
  /** How far the focused column widens and its row deepens, as a multiple of a track, 1.2 to 3. @default 2.2 */
  zoom?: number;
  /** The gutter between portraits, px. @default 4 */
  gap?: number;
  /** Paper grain and halftone over the portraits, 0 to 1; the face in focus prints cleaner. @default 0.4 */
  grain?: number;
  /** A fixed number of columns. By default it is chosen from the width so the grid fits `maxHeight`. */
  columns?: number;
  /** Portrait width over height. @default 0.8 */
  ratio?: number;
  /** The tallest the grid may be, px; more columns are used to stay under it. @default 520 */
  maxHeight?: number;
  /** The dark ink of the print: backdrops and halftone. @default "var(--foreground)" */
  ink?: string;
  /** The paper the page is printed on. @default "var(--card)" */
  paper?: string;
  /** Room the deepened row makes for the name and role, px. @default 34 */
  captionHeight?: number;
  /** The grid's accessible name. @default "Team" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

const GRAIN_TILE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 1.5 -0.25'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/* --------------------------------- portrait ------------------------------ */

const SKIN = [
  pig("--warn", 0.88, 0.035, -22),
  pig("--warn", 0.8, 0.055, -24),
  pig("--warn", 0.71, 0.07, -26),
  pig("--warn", 0.6, 0.075, -28),
  pig("--warn", 0.5, 0.065, -30),
  pig("--warn", 0.4, 0.05, -32),
];
const HAIR = [
  pig("--warn", 0.2, 0.015, -40),
  pig("--warn", 0.3, 0.04, -35),
  pig("--warn", 0.42, 0.07, -38),
  pig("--warn", 0.72, 0.09, -8),
  pig("--accent", 0.8, 0.005),
  pig("--warn", 0.26, 0.02, -30),
];
const CLOTH = [
  pig("--accent", 0.36, 0.07),
  pig("--success", 0.45, 0.05),
  pig("--danger", 0.5, 0.1, 10),
  pig("--accent", 0.62, 0.02),
  pig("--warn", 0.86, 0.03),
  pig("--accent", 0.25, 0.02),
];

/**
 * A studio portrait drawn from a seed: shoulders and collar, neck, head,
 * hair in one of six cuts, sometimes glasses, a soft key light from the
 * left. Features are only suggested, as in a small printed photograph.
 */
function Portrait({ seed }: { seed: number }) {
  const pick = <T,>(list: T[], k: number): T =>
    list[(seed >>> k) % list.length]!;
  const skin = pick(SKIN, 0);
  const hair = pick(HAIR, 3);
  const cloth = pick(CLOTH, 6);
  const cut = (seed >>> 9) % 6;
  const glasses = (seed >>> 12) % 4 === 0;
  const collar = (seed >>> 14) % 3;
  const tilt = ((seed >>> 16) % 5) - 2;
  const shade = "color-mix(in oklab, black 22%, transparent)";
  return (
    <svg
      viewBox="5 12 70 88"
      // Anchored at the foot and never cropped: a widened cell shows more
      // shoulder and backdrop, a deepened one more room above the head, as
      // a wider or taller crop of the same photograph would.
      preserveAspectRatio="xMidYMax meet"
      overflow="visible"
      className="block size-full"
      aria-hidden
    >
      {cut === 3 ? (
        <path
          d="M22 44 C18 70 20 86 26 98 H54 C60 86 62 70 58 44 Z"
          style={{ fill: hair }}
        />
      ) : null}
      <path
        d="M-70 100 C-40 92 -6 84 8 80 C18 75 28 72 40 72 C52 72 62 75 72 80 C86 84 120 92 150 100 Z"
        style={{ fill: cloth }}
      />
      {collar === 0 ? (
        <path
          d="M32 73 L40 86 L48 73"
          fill="none"
          style={{ stroke: pig("--warn", 0.95, 0.01) }}
          strokeWidth="2.2"
        />
      ) : collar === 1 ? (
        <path
          d="M30 74 Q40 82 50 74"
          fill="none"
          style={{ stroke: shade }}
          strokeWidth="2"
        />
      ) : (
        <path
          d="M33 72 L40 80 L47 72 L44 100 H36 Z"
          style={{ fill: pig("--warn", 0.94, 0.01) }}
        />
      )}
      <rect
        x="34.5"
        y="58"
        width="11"
        height="16"
        rx="4"
        style={{ fill: skin }}
      />
      <rect
        x="34.5"
        y="62"
        width="11"
        height="6"
        style={{ fill: shade }}
        opacity={0.5}
      />
      <g transform={`rotate(${tilt} 40 44)`}>
        <ellipse cx="25.6" cy="45" rx="2.6" ry="4" style={{ fill: skin }} />
        <ellipse cx="54.4" cy="45" rx="2.6" ry="4" style={{ fill: skin }} />
        <ellipse cx="40" cy="43" rx="14.5" ry="18" style={{ fill: skin }} />
        <path
          d="M46 28 C56 34 56 56 44 61 C50 52 52 38 46 28 Z"
          style={{ fill: shade }}
          opacity={0.55}
        />
        <ellipse
          cx="34.5"
          cy="44"
          rx="1.3"
          ry="0.9"
          style={{ fill: pig("--warn", 0.22, 0.02, -30) }}
          opacity={0.7}
        />
        <ellipse
          cx="45.5"
          cy="44"
          rx="1.3"
          ry="0.9"
          style={{ fill: pig("--warn", 0.22, 0.02, -30) }}
          opacity={0.7}
        />
        <path
          d="M36.5 53.5 Q40 55.2 43.5 53.5"
          fill="none"
          style={{ stroke: pig("--danger", 0.45, 0.06) }}
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity={0.6}
        />
        {glasses ? (
          <g
            fill="none"
            style={{ stroke: pig("--warn", 0.25, 0.02, -30) }}
            strokeWidth="0.9"
          >
            <circle cx="34.5" cy="44" r="4.4" />
            <circle cx="45.5" cy="44" r="4.4" />
            <path d="M38.9 44 H41.1" />
          </g>
        ) : null}
        {cut === 0 ? (
          <path
            d="M25 40 C24 24 34 20 41 21 C50 21 57 27 55 41 C52 32 46 29 40 29 C33 29 28 33 25 40 Z"
            style={{ fill: hair }}
          />
        ) : cut === 1 ? (
          <path
            d="M23 50 C20 26 32 19 41 20 C51 20 61 27 57 50 C56 40 52 31 44 30 C38 34 30 34 26 38 Z"
            style={{ fill: hair }}
          />
        ) : cut === 2 ? (
          <>
            <circle cx="40" cy="18" r="6.5" style={{ fill: hair }} />
            <path
              d="M25 40 C25 26 33 22 40 22 C48 22 55 27 55 40 C51 31 46 28 40 28 C34 28 29 32 25 40 Z"
              style={{ fill: hair }}
            />
          </>
        ) : cut === 3 ? (
          <path
            d="M24 46 C21 24 33 19 41 20 C50 20 60 26 56 46 C54 34 48 28 40 30 C34 31 28 36 24 46 Z"
            style={{ fill: hair }}
          />
        ) : cut === 4 ? (
          <g style={{ fill: hair }}>
            {[
              [28, 30],
              [34, 25],
              [41, 23],
              [48, 25],
              [53, 31],
              [26, 37],
              [55, 38],
            ].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="6" />
            ))}
          </g>
        ) : (
          <path
            d="M26 38 C27 25 36 22 42 23 C49 24 54 28 55 36 C50 31 42 33 36 30 C33 33 29 35 26 38 Z"
            style={{ fill: hair }}
          />
        )}
      </g>
    </svg>
  );
}

export const defaultYearbookPeople: YearbookPerson[] = [
  { name: "Ines Varga", role: "Field engineer" },
  { name: "Tomas Ekwueme", role: "Survey lead" },
  { name: "Maren Holt", role: "Product design" },
  { name: "Kofi Lindqvist", role: "Data platform" },
  { name: "Priya Castell", role: "Calibration" },
  { name: "Juno Abara", role: "Hardware" },
  { name: "Elio Brandt", role: "Support" },
  { name: "Sana Iwata", role: "Research" },
  { name: "Rafa Monteiro", role: "Field engineer" },
  { name: "Leda Novak", role: "Operations" },
  { name: "Osei Fairweather", role: "Firmware" },
  { name: "Mina Kowal", role: "Product design" },
  { name: "Teo Sandoval", role: "Sales" },
  { name: "Hana Lindgren", role: "Data platform" },
  { name: "Wren Okoye", role: "Survey lead" },
  { name: "Dario Pell", role: "Hardware" },
  { name: "Yuki Marsh", role: "Research" },
  { name: "Amara Quist", role: "People" },
  { name: "Felix Oduya", role: "Firmware" },
  { name: "Noor Haddad", role: "Calibration" },
  { name: "Bea Lunde", role: "Support" },
  { name: "Cass Moreau", role: "Finance" },
  { name: "Idris Vale", role: "Field engineer" },
  { name: "Lotte Kaur", role: "Design ops" },
];

/* ---------------------------------- layout ------------------------------- */

type Layout = {
  w: number;
  cols: number;
  rows: number;
  h: number;
};

function layoutOf(
  width: number,
  count: number,
  ratio: number,
  gap: number,
  maxHeight: number,
  columns?: number,
): Layout {
  const w = Math.max(200, Math.round(width));
  const g = clamp(gap, 0, 16);
  const rat = clamp(ratio, 0.5, 1.5);
  const tall = (cols: number) => {
    const rows = Math.ceil(count / cols);
    const cell = (w - (cols - 1) * g) / cols;
    return rows * (cell / rat) + (rows - 1) * g;
  };
  let cols = columns ? clamp(Math.round(columns), 2, 12) : 0;
  if (!cols) {
    // Near the width's natural count, the fewest empty places that still
    // fit the height; more columns if nothing fits.
    const base = clamp(Math.round(w / 110), 3, 8);
    let best = -1;
    let score = Infinity;
    for (let c = base; c <= base + 3; c += 1) {
      if (tall(c) > maxHeight) continue;
      const empty = Math.ceil(count / c) * c - count;
      const sc = empty * 1.5 + (c - base) * 2;
      if (sc < score) {
        score = sc;
        best = c;
      }
    }
    cols = best;
    if (cols < 0) {
      cols = base;
      while (tall(cols) > maxHeight && cols < 12) cols += 1;
    }
  }
  const rows = Math.max(1, Math.ceil(count / cols));
  return {
    w,
    cols,
    rows,
    h: Math.round(Math.min(tall(cols), Math.max(maxHeight, 120))),
  };
}

/** Track weights for a focus at `f` (fractional between tracks) opened by `open`. */
function tracks(count: number, f: number, open: number, zoom: number): string {
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const near = Math.max(0, 1 - Math.abs(i - f));
    const weight = 1 + (zoom - 1) * open * near;
    out += `${i ? " " : ""}minmax(0,${r3(weight)}fr)`;
  }
  return out;
}

/* ----------------------------------- cell -------------------------------- */

type CellProps = {
  index: number;
  col: number;
  row: number;
  person: YearbookPerson | undefined;
  fx: MotionValue<number>;
  fy: MotionValue<number>;
  open: MotionValue<number>;
  grain: number;
  ink: string;
  paper: string;
  captionHeight: number;
  focusable: boolean;
  pinned: boolean;
  motionSafe: boolean;
  bind: (node: HTMLDivElement | null) => void;
  onEnter: () => void;
  onFocusCell: () => void;
  onPress: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

/**
 * One portrait. Its share of the opening is how near the focus is in both
 * its column and its row, so the caption prints in only where they cross,
 * and moves smoothly as the focus glides from cell to cell.
 */
function Cell({
  index,
  col,
  row,
  person,
  fx,
  fy,
  open,
  grain,
  ink,
  paper,
  captionHeight,
  focusable,
  pinned,
  motionSafe,
  bind,
  onEnter,
  onFocusCell,
  onPress,
  onKeyDown,
}: CellProps) {
  const reveal = useTransform(
    [fx, fy, open] as MotionValue<number>[],
    ([x, y, o]) =>
      r3(
        clamp01(o as number) *
          Math.max(0, 1 - Math.abs(col - (x as number))) *
          Math.max(0, 1 - Math.abs(row - (y as number))),
      ),
  );
  const band = useTransform(reveal, (k) => r2(captionHeight * k));
  // The name prints left to right like a print head as the cell opens.
  const wipe = useTransform(reveal, (k) =>
    motionSafe
      ? `inset(0px ${r2((1 - clamp01((k - 0.45) / 0.55)) * 100)}% 0px 0px)`
      : "inset(0px 0px 0px 0px)",
  );
  const words = useTransform(reveal, (k) =>
    motionSafe ? 1 : r3(clamp01((k - 0.5) / 0.5)),
  );
  const rule = useTransform(reveal, (k) => r3(clamp01((k - 0.3) / 0.7)));
  const print = useTransform(reveal, (k) =>
    r3(clamp01(grain) * (1 - 0.65 * k)),
  );

  if (!person) {
    return (
      <div
        role="gridcell"
        aria-label="Not pictured"
        className="flex items-center justify-center overflow-hidden rounded-1 border border-dashed border-hairline-strong"
      >
        <span className="px-1 text-center font-mono text-[9px] leading-tight tracking-[0.08em] text-ink-3 uppercase">
          Not pictured
        </span>
      </div>
    );
  }

  const seed = hash(`${person.name}-${index}`);
  return (
    <div
      ref={bind}
      role="gridcell"
      tabIndex={focusable ? 0 : -1}
      aria-label={`${person.name}, ${person.role}`}
      aria-selected={pinned}
      data-cell={index}
      onPointerEnter={onEnter}
      onFocus={onFocusCell}
      onClick={onPress}
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex cursor-pointer flex-col overflow-hidden rounded-1 outline-none",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
      style={{ background: paper }}
    >
      <div
        className="relative flex-1 overflow-hidden"
        style={{
          background: `radial-gradient(80% 70% at 42% 34%, color-mix(in oklab, ${ink} 6%, ${paper}), color-mix(in oklab, ${ink} 24%, ${paper}))`,
        }}
      >
        {person.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.src}
            alt=""
            draggable={false}
            className="block size-full object-cover object-[50%_25%]"
          />
        ) : (
          (person.art ?? <Portrait seed={seed} />)
        )}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 mix-blend-multiply"
          style={{
            opacity: print,
            backgroundImage: `${GRAIN_TILE}, radial-gradient(circle, color-mix(in oklab, ${ink} 30%, transparent) 0.6px, transparent 0.9px)`,
            backgroundSize: "120px 120px, 3px 3px",
          }}
        />
        {pinned ? (
          <span
            aria-hidden
            className="absolute top-1 right-1 size-1.5 rounded-full bg-signal"
          />
        ) : null}
      </div>
      <motion.div
        className="relative shrink-0 overflow-hidden"
        style={{ height: band }}
      >
        <motion.div
          className="absolute inset-x-1.5 top-1 flex flex-col"
          style={{ clipPath: wipe, opacity: words }}
        >
          <span className="truncate text-[11px] leading-[14px] font-semibold text-foreground">
            {person.name}
          </span>
          <span className="truncate font-mono text-[9px] leading-[12px] tracking-[0.06em] text-ink-3 uppercase">
            {person.role}
          </span>
        </motion.div>
        <motion.span
          aria-hidden
          className="absolute inset-x-1.5 bottom-0 h-px origin-left bg-hairline-strong"
          style={{ scaleX: rule }}
        />
      </motion.div>
    </div>
  );
}

/* ----------------------------------- grid -------------------------------- */

/**
 * A yearbook page of portraits. The face under the pointer — or keyboard
 * focus — grows by widening its whole column and deepening its whole row:
 * the grid's tracks are fractions driven by where the focus is (two motion
 * values that glide from cell to cell on `springs.glide`) and how open it is,
 * so the page flexes like a table, the neighbours compress and every line
 * stays in register, instead of one picture bulging like a lens. Portraits
 * crop rather than stretch, so a widened column shows more shoulder and a
 * deepened row more height. Where the open row and column cross, the name and
 * role print in beneath the portrait, wiped in left to right with a rule
 * drawn under them. Empty places read "Not pictured". A click, Enter or
 * Space pins someone so the grid stays open on them when the pointer leaves.
 *
 * It is a real grid: one cell is in the tab order, the arrow keys move cell
 * by cell, Home and End go to the row's ends and Ctrl with them to the first
 * and last. Under reduced motion the tracks change at once and the caption
 * fades in without the wipe — the open cell still opens, because which one
 * is open is information.
 */
export function YearbookGrid({
  people = defaultYearbookPeople,
  value,
  defaultValue = null,
  onValueChange,
  onFocusChange,
  zoom = 2.2,
  gap = 4,
  grain = 0.4,
  columns,
  ratio = 0.8,
  maxHeight = 520,
  ink = "var(--foreground)",
  paper = "var(--card)",
  captionHeight = 34,
  label = "Team",
  disabled = false,
  className,
}: YearbookGridProps) {
  const motionSafe = useMotionSafe();
  const list = people.length > 0 ? people : defaultYearbookPeople;
  const n = list.length;
  const z = clamp(zoom, 1.2, 3);

  const [width, setWidth] = React.useState(720);
  const lay = React.useMemo(
    () => layoutOf(width, n, ratio, gap, maxHeight, columns),
    [width, n, ratio, gap, maxHeight, columns],
  );
  const cells = lay.cols * lay.rows;

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const raw = value === undefined ? own : value;
  const pinned = raw === null ? null : clamp(Math.round(raw), 0, n - 1);
  const [tab, setTab] = React.useState(pinned ?? 0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const start = pinned ?? 0;
  const fx = useMotionValue(start % lay.cols);
  const fy = useMotionValue(Math.floor(start / lay.cols));
  const open = useMotionValue(pinned === null ? 0 : 1);
  const columnsTpl = useTransform(
    [fx, open] as MotionValue<number>[],
    ([x, o]) => tracks(lay.cols, x as number, o as number, z),
  );
  const rowsTpl = useTransform([fy, open] as MotionValue<number>[], ([y, o]) =>
    tracks(lay.rows, y as number, o as number, z),
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const nodes = React.useRef(new Map<number, HTMLDivElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const aimed = React.useRef<number | null>(pinned);
  const keyboardIn = React.useRef(false);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const run = (key: string, mv: MotionValue<number>, to: number) => {
    anims.current.get(key)?.stop();
    if (!motionSafe) {
      mv.jump(to);
      return;
    }
    anims.current.set(key, animate(mv, to, springs.glide));
  };

  /** Opens the grid on cell `i`, or lets it rest (null). */
  const aim = (i: number | null) => {
    if (aimed.current === i) return;
    aimed.current = i;
    onFocusChange?.(i);
    if (i === null) {
      run("open", open, 0);
      return;
    }
    // From rest the focus jumps to the cell and the tracks open from flat;
    // between cells it glides.
    if (open.get() < 0.02) {
      anims.current.get("x")?.stop();
      anims.current.get("y")?.stop();
      fx.jump(i % lay.cols);
      fy.jump(Math.floor(i / lay.cols));
    } else {
      run("x", fx, i % lay.cols);
      run("y", fy, Math.floor(i / lay.cols));
    }
    run("open", open, 1);
  };

  const rest = () => aim(pinned);

  const pin = (i: number) => {
    if (disabled) return;
    const next = pinned === i ? null : i;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    const p = list[i];
    say(
      next === null
        ? `${p?.name ?? "Portrait"} unpinned.`
        : `${p?.name ?? "Portrait"}, ${p?.role ?? ""}, pinned.`,
    );
  };

  // A host that pins someone opens the grid on them.
  React.useEffect(() => {
    if (pinned !== null) aim(pinned);
    // aim closes over motion values and the layout only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned]);

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0) setWidth(Math.round(box.width));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // A new column count re-seats the focus on its cell.
  React.useEffect(() => {
    const i = aimed.current;
    if (i === null) return;
    fx.jump(i % lay.cols);
    fy.jump(Math.floor(i / lay.cols));
  }, [lay.cols, fx, fy]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const a of running.values()) a.stop();
      running.clear();
    };
  }, []);

  const moveTo = (i: number) => {
    const to = clamp(i, 0, n - 1);
    setTab(to);
    nodes.current.get(to)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    if (disabled) return;
    const col = i % lay.cols;
    const rowStart = i - col;
    const keys: Record<string, () => void> = {
      ArrowRight: () => moveTo(Math.min(i + 1, n - 1)),
      ArrowLeft: () => moveTo(Math.max(i - 1, 0)),
      ArrowDown: () => {
        if (i + lay.cols < n) moveTo(i + lay.cols);
      },
      ArrowUp: () => {
        if (i - lay.cols >= 0) moveTo(i - lay.cols);
      },
      Home: () => moveTo(event.ctrlKey ? 0 : rowStart),
      End: () =>
        moveTo(
          event.ctrlKey ? n - 1 : Math.min(rowStart + lay.cols - 1, n - 1),
        ),
      Enter: () => pin(i),
      " ": () => pin(i),
    };
    const act = keys[event.key];
    if (!act) return;
    event.preventDefault();
    act();
  };

  const rowsOf = Array.from({ length: lay.rows }, (_, r) => r);

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full", disabled && "opacity-60", className)}
      onPointerLeave={() => {
        if (!keyboardIn.current) rest();
      }}
      onFocus={(event) => {
        keyboardIn.current = event.target.matches(":focus-visible");
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        keyboardIn.current = false;
        rest();
      }}
    >
      <motion.div
        role="grid"
        aria-label={label}
        aria-rowcount={lay.rows}
        aria-colcount={lay.cols}
        aria-disabled={disabled || undefined}
        className="grid w-full overflow-clip [contain:layout_paint]"
        style={{
          height: lay.h,
          gap: clamp(gap, 0, 16),
          gridTemplateColumns: columnsTpl,
          gridTemplateRows: rowsTpl,
        }}
      >
        {rowsOf.map((r) => (
          <div key={r} role="row" aria-rowindex={r + 1} className="contents">
            {Array.from({ length: lay.cols }, (_, c) => {
              const i = r * lay.cols + c;
              if (i >= cells) return null;
              return (
                <Cell
                  key={i}
                  index={i}
                  col={c}
                  row={r}
                  person={list[i]}
                  fx={fx}
                  fy={fy}
                  open={open}
                  grain={grain}
                  ink={ink}
                  paper={paper}
                  captionHeight={captionHeight}
                  focusable={i === tab}
                  pinned={pinned === i}
                  motionSafe={motionSafe}
                  bind={(node) => {
                    if (node) nodes.current.set(i, node);
                    else nodes.current.delete(i);
                  }}
                  onEnter={() => {
                    if (!disabled && !keyboardIn.current) aim(i);
                  }}
                  onFocusCell={() => {
                    setTab(i);
                    if (!disabled) aim(i);
                  }}
                  onPress={() => pin(i)}
                  onKeyDown={(event) => onKeyDown(event, i)}
                />
              );
            })}
          </div>
        ))}
      </motion.div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
