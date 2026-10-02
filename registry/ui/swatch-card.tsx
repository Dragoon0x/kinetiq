"use client";

import * as React from "react";

import { Minus, Plus, Trash2 } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ProductSwatch = {
  id: string;
  /** The colour's name, spoken and shown beside "Colour". */
  label: string;
  /** Any CSS colour: the dye the product takes. */
  color: string;
  /** The price in this colour, before any size difference. */
  price: number;
  /** Size ids this colour comes in. @default every size */
  sizes?: string[];
};

export type ProductSize = {
  id: string;
  label: string;
  /** A short note after the label, e.g. a capacity. */
  note?: string;
  /** How big the drawing is in this size, 1 being the middle size. @default 1 */
  scale?: number;
  /** Added to the colour's price in this size. @default 0 */
  price?: number;
};

export type SwatchCardProps = {
  /** The colours on offer. @default defaultSwatches */
  swatches?: ProductSwatch[];
  /** Controlled chosen colour id. */
  value?: string;
  /** Initially chosen colour id when uncontrolled. @default the first swatch */
  defaultValue?: string;
  /** Fires from the swatch press or arrow key that chose a colour. */
  onValueChange?: (id: string) => void;
  /** The sizes on offer, smallest first. @default defaultSizes */
  sizes?: ProductSize[];
  /** Controlled chosen size id. */
  selectedSize?: string;
  /** Initially chosen size id when uncontrolled. @default the middle size */
  defaultSelectedSize?: string;
  /** Fires from the size press, or from a colour that does not come in the chosen size. */
  onSelectedSizeChange?: (id: string) => void;
  /** Controlled quantity in the bag; 0 shows Add to bag. */
  quantity?: number;
  /** Initial quantity when uncontrolled. @default 0 */
  defaultQuantity?: number;
  /** Fires from Add to bag, the stepper, or remove, with the new quantity. */
  onQuantityChange?: (quantity: number) => void;
  /** The most the stepper allows. @default 9 */
  maxQuantity?: number;
  /** The maker, above the name. @default "Fernworks" */
  brand?: string;
  /** The product's name: the card's heading. @default "Harbour tote" */
  name?: string;
  /** A line under the name. @default "Waxed canvas · leather patch" */
  detail?: string;
  /** How a price is printed. @default whole pounds, en-GB */
  format?: (price: number) => string;
  /** How liquid the dye front is, 0 to 1: a clean circle, or an edge that sloshes as it floods. @default 0.5 */
  wipe?: number;
  /** How long the dye takes to flood the product, in ms. @default 560 */
  wipeDuration?: number;
  /** How much the drawing is modelled, 0 to 1: flat colour, or deep folds and highlights. @default 0.6 */
  shade?: number;
  /** Adding morphs into a quantity stepper; off, it becomes an In bag toggle. @default true */
  stepper?: boolean;
  /** The add button's text. @default "Add to bag" */
  addLabel?: string;
  /** After the quantity in the stepper, and the toggle's pressed text. @default "in bag" */
  inBagLabel?: string;
  /** The heading's level. @default 3 */
  headingLevel?: 2 | 3 | 4;
  /** A plip for each colour, a pop for each change to the bag. Off unless asked for. @default false */
  sound?: boolean;
  /** @default false */
  disabled?: boolean;
  className?: string;
};

/** Product colours are pigment: a token's hue at a fixed lightness, the same in both themes. */
export const defaultSwatches: ProductSwatch[] = [
  {
    id: "moss",
    label: "Moss",
    color: "oklch(from var(--success) 0.52 0.07 h)",
    price: 48,
  },
  {
    id: "ink",
    label: "Ink",
    color: "oklch(from var(--accent) 0.34 0.07 h)",
    price: 48,
  },
  {
    id: "clay",
    label: "Clay",
    color: "oklch(from var(--danger) 0.6 0.11 calc(h + 18))",
    price: 54,
    sizes: ["daily", "weekender"],
  },
  {
    id: "saffron",
    label: "Saffron",
    color: "oklch(from var(--warn) 0.79 0.14 h)",
    price: 54,
    sizes: ["mini", "daily"],
  },
  {
    id: "undyed",
    label: "Undyed",
    color: "oklch(from var(--warn) 0.9 0.035 h)",
    price: 42,
  },
];

export const defaultSizes: ProductSize[] = [
  { id: "mini", label: "Mini", note: "6 l", scale: 0.84, price: -6 },
  { id: "daily", label: "Daily", note: "14 l", scale: 1 },
  { id: "weekender", label: "Weekender", note: "24 l", scale: 1.1, price: 14 },
];

const defaultFormat = (n: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);

/** The drawing's own box. Every size of the bag, and every dye, stays inside it. */
const VB_W = 240;
const VB_H = 180;
/** The bag's base, the point it grows from. */
const BASE_X = 120;
const BASE_Y = 168;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Paths of the bag, drawn once. */
const BAG = {
  body: "M 70 74 L 170 74 L 178 162 Q 178.6 168 172 168 L 68 168 Q 61.4 168 62 162 Z",
  back: "M 73 69 L 167 69 L 170 74 L 70 74 Z",
  strapFront: "M 92 76 C 90 22 150 22 148 76",
  strapBack: "M 98 72 C 97 30 143 30 142 72",
  hem: "M 71.5 80.5 L 168.5 80.5",
  seamL: "M 72.2 86 L 65.6 160",
  seamR: "M 167.8 86 L 174.4 160",
  fold: "M 82 90 Q 80 130 77 164",
};

/** A blob growing from (ox, oy): a circle carrying two travelling waves. */
function blobPath(
  ox: number,
  oy: number,
  radius: number,
  amp: number,
  phase: number,
): string {
  if (radius <= 0.5) return "M 0 0 Z";
  const n = 44;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const r =
      radius +
      amp *
        (0.6 * Math.sin(5 * a + phase) + 0.4 * Math.sin(9 * a - phase * 0.7));
    pts.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
  }
  // Smoothed through the midpoints, so the edge reads as liquid, not facets.
  const mid = (p: [number, number], q: [number, number]) =>
    `${r2((p[0] + q[0]) / 2)} ${r2((p[1] + q[1]) / 2)}`;
  const first = pts[0] as [number, number];
  const last = pts[n - 1] as [number, number];
  let d = `M ${mid(last, first)}`;
  for (let i = 0; i < n; i += 1) {
    const p = pts[i] as [number, number];
    const q = pts[(i + 1) % n] as [number, number];
    d += ` Q ${r2(p[0])} ${r2(p[1])} ${mid(p, q)}`;
  }
  return `${d} Z`;
}

/** The parts of the bag that take the dye. */
function Dyed({ color }: { color: string }) {
  const deep = `color-mix(in oklab, ${color} 70%, black)`;
  const seam = `color-mix(in oklab, ${color} 58%, black)`;
  return (
    <g>
      <path
        d={BAG.strapBack}
        fill="none"
        strokeWidth={7}
        strokeLinecap="round"
        style={{ stroke: deep }}
      />
      <path d={BAG.back} style={{ fill: deep }} />
      <path d={BAG.body} style={{ fill: color }} />
      <path
        d={BAG.strapFront}
        fill="none"
        strokeWidth={7.5}
        strokeLinecap="round"
        style={{ stroke: color }}
      />
      <rect
        x={88}
        y={74}
        width={8}
        height={11}
        rx={1}
        style={{ fill: color }}
      />
      <rect
        x={144}
        y={74}
        width={8}
        height={11}
        rx={1}
        style={{ fill: color }}
      />
      <g
        fill="none"
        strokeWidth={0.9}
        strokeDasharray="2.6 2"
        style={{ stroke: seam }}
      >
        <path d={BAG.hem} />
        <path d={BAG.seamL} />
        <path d={BAG.seamR} />
        <rect x={89.5} y={75.5} width={5} height={8} />
        <rect x={145.5} y={75.5} width={5} height={8} />
      </g>
    </g>
  );
}

/**
 * Digit columns that roll to each new character; anything else stands still.
 * Each column keeps an invisible copy of its digit in flow: its width, and a
 * baseline, so it sits on the line with the text around it.
 */
function Rolling({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span aria-hidden className={cn("inline-flex tabular-nums", className)}>
      {chars.map((ch, i) => {
        // Keyed from the right, so a price that gains a digit keeps its
        // columns and the new one arrives at the front.
        const key = chars.length - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`c${key}`} className="inline-block whitespace-pre">
              {ch}
            </span>
          );
        }
        return (
          <span
            key={`d${key}`}
            className="relative inline-block overflow-clip leading-[1.25em]"
          >
            <span className="invisible">{ch}</span>
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${-Number(ch) * 1.25}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} className="block h-[1.25em] leading-[1.25em]">
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

type Dye = {
  /** The swatch the drawing is settled in. */
  base: string;
  /** The swatch flooding over it, and where the flood starts (drawing x). */
  top: { id: string; x: number } | null;
  /** The swatch this dye was made for. */
  id: string;
  key: number;
};

type Said = { key: string; qty: number; words: string };

/**
 * A product card whose drawing takes the colour you choose. Choosing a swatch
 * floods the tote with the new dye from where that swatch sits — a liquid
 * front that grows from under the bag at the swatch's position, its edge
 * sloshing by `wipe` mid-flood and landing clean — while one ring slides to
 * the swatch on snap and the swatch dips and lands on recoil. The price rolls
 * its digits on snap when the colour or size costs more or less; sizes a
 * colour does not come in shrink to struck chips while the others glide wider,
 * and the drawing grows or shrinks to the chosen size about its base.
 *
 * Add to bag morphs into a quantity stepper in the same pill — the label lifts
 * away, − and + slide in from the middle, the count rolls in — and back again
 * when the last one is removed; with `stepper` off it becomes an In bag
 * toggle. Colours and sizes are radio groups with a roving tabindex; focus
 * follows the morph. Under reduced motion the dye fades over the old colour,
 * and the price, sizes and stepper change in place.
 */
export function SwatchCard({
  swatches = defaultSwatches,
  value,
  defaultValue,
  onValueChange,
  sizes = defaultSizes,
  selectedSize,
  defaultSelectedSize,
  onSelectedSizeChange,
  quantity,
  defaultQuantity = 0,
  onQuantityChange,
  maxQuantity = 9,
  brand = "Fernworks",
  name = "Harbour tote",
  detail = "Waxed canvas · leather patch",
  format = defaultFormat,
  wipe = 0.5,
  wipeDuration = 560,
  shade = 0.6,
  stepper = true,
  addLabel = "Add to bag",
  inBagLabel = "in bag",
  headingLevel = 3,
  sound = false,
  disabled = false,
  className,
}: SwatchCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `swatch-${safeId}-clip`;
  const sideId = `swatch-${safeId}-side`;
  const floorId = `swatch-${safeId}-floor`;
  const titleId = `${uid}-title`;
  const colourId = `${uid}-colour`;
  const sizeLabelId = `${uid}-size`;
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const sh = clamp01(shade);
  const ceiling = Math.max(1, Math.round(maxQuantity));

  const [ownSwatch, setOwnSwatch] = React.useState(
    defaultValue ?? swatches[0]?.id ?? "",
  );
  const swatchId = value ?? ownSwatch;
  const swatchIndex = Math.max(
    0,
    swatches.findIndex((s) => s.id === swatchId),
  );
  const swatch = swatches[swatchIndex];

  const middle = sizes[Math.floor((sizes.length - 1) / 2)]?.id ?? "";
  const [ownSize, setOwnSize] = React.useState(defaultSelectedSize ?? middle);
  const sizeWanted = selectedSize ?? ownSize;
  const offered = (s: ProductSwatch | undefined, id: string) =>
    !s?.sizes || s.sizes.includes(id);
  /** The nearest size this colour comes in, from a wanted one. */
  const nearest = (s: ProductSwatch | undefined, wanted: string) => {
    if (offered(s, wanted)) return wanted;
    const at = Math.max(
      0,
      sizes.findIndex((z) => z.id === wanted),
    );
    let best = wanted;
    let gap = Infinity;
    sizes.forEach((z, i) => {
      if (!offered(s, z.id)) return;
      const g = Math.abs(i - at) + (i > at ? 0.1 : 0);
      if (g < gap) {
        gap = g;
        best = z.id;
      }
    });
    return best;
  };
  const sizeId = nearest(swatch, sizeWanted);
  const size = sizes.find((z) => z.id === sizeId);
  const price = (swatch?.price ?? 0) + (size?.price ?? 0);
  const priceText = format(price);

  const [ownQty, setOwnQty] = React.useState(
    Math.max(0, Math.round(defaultQuantity)),
  );
  const qty = Math.min(ceiling, Math.max(0, Math.round(quantity ?? ownQty)));

  // Where the last press came from, in the drawing's x, so the flood starts
  // under the swatch that was pressed. A host's own change floods from where
  // its swatch sits in the row.
  const [origin, setOrigin] = React.useState<{ id: string; x: number } | null>(
    null,
  );
  const fallbackX = (i: number) =>
    r2(VB_W * 0.2 + (VB_W * 0.6 * (i + 0.5)) / Math.max(1, swatches.length));

  const [dye, setDye] = React.useState<Dye>({
    base: swatchId,
    top: null,
    id: swatchId,
    key: 0,
  });
  if (dye.id !== swatchId) {
    setDye({
      // A choice mid-flood settles the flood it interrupts first.
      base: dye.top ? dye.top.id : dye.base,
      top: {
        id: swatchId,
        x: origin?.id === swatchId ? origin.x : fallbackX(swatchIndex),
      },
      id: swatchId,
      key: dye.key + 1,
    });
  }
  const colorOf = (id: string) =>
    swatches.find((s) => s.id === id)?.color ?? swatch?.color ?? "currentColor";

  // The live sentence, frozen in the render where the change lands, and only
  // for changes the visitor asked for.
  const [asked, setAsked] = React.useState<"swatch" | "qty" | null>(null);
  const [said, setSaid] = React.useState<Said>({
    key: `${swatchId}:${qty}`,
    qty,
    words: "",
  });
  const sayKey = `${swatchId}:${qty}`;
  if (said.key !== sayKey) {
    let words = said.words;
    if (asked === "swatch") words = `${swatch?.label ?? ""}, ${priceText}`;
    else if (asked === "qty")
      words =
        qty === 0
          ? "Removed from bag"
          : said.qty === 0 || !stepper
            ? "Added to bag"
            : `${qty} ${inBagLabel}`;
    setSaid({ key: sayKey, qty, words });
    if (asked !== null) setAsked(null);
  }

  const progress = useMotionValue(1);
  const lift = useMotionValue(0);
  const [hovered, setHovered] = React.useState(false);
  const [within, setWithin] = React.useState(false);

  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const swatchNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const sizeNodes = React.useRef(new Map<string, HTMLButtonElement>());

  // The flood: one progress value from 0 to 1 on a tween — a clip is not a
  // spring — and when it lands the new dye becomes the settled one.
  const dyeKey = dye.key;
  const flooding = dye.top !== null;
  React.useEffect(() => {
    if (!flooding) return;
    progress.jump(0);
    const run = animate(progress, 1, {
      duration: Math.max(0.12, wipeDuration / 1000) * (motionSafe ? 1 : 0.5),
      ease: motionSafe ? easings.move : "linear",
      onComplete: () =>
        setDye((d) =>
          d.key === dyeKey && d.top ? { ...d, base: d.top.id, top: null } : d,
        ),
    });
    return () => {
      // A re-run finishes the flood rather than freezing it half-way.
      run.stop();
      progress.jump(1);
    };
  }, [dyeKey, flooding, motionSafe, progress, wipeDuration]);

  const bagScale = size?.scale ?? 1;
  const ox = dye.top?.x ?? BASE_X;
  /** The flood starts under the drawing, at the pressed swatch's x. */
  const oy = VB_H + 14;
  // Far enough to cover the bag's furthest corner, strap tops included,
  // and no further, so the whole flood is spent where it shows.
  const reach = Math.max(
    Math.hypot(ox - 58, oy - 28),
    Math.hypot(ox - 182, oy - 28),
  );
  const liquid = clamp01(wipe);
  const clip = useTransform(progress, (t) => {
    if (!motionSafe) return `M 0 0 H ${VB_W} V ${VB_H} H 0 Z`;
    const amp = liquid * 9 * Math.sin(Math.PI * clamp01(t));
    return blobPath(ox, oy, reach * t + amp, amp, t * 7);
  });
  const topOpacity = useTransform(progress, (t) =>
    motionSafe ? 1 : r2(clamp01(t)),
  );
  const shadowScale = useTransform(lift, (l) => r2(1 - l * 0.04));

  // The bag lifts a little while the card is hovered or keyboard-focused.
  const raised = (hovered || within) && !disabled && motionSafe;
  React.useEffect(() => {
    const run = animate(lift, raised ? 1 : 0, springs.glide);
    return () => run.stop();
  }, [lift, raised]);
  const bagY = useTransform(lift, (l) => r2(-3 * l));

  const pressSwatch = (s: ProductSwatch, index: number, node: Element) => {
    if (disabled || s.id === swatchId) return;
    const svg = svgRef.current?.getBoundingClientRect();
    const at = node.getBoundingClientRect();
    if (svg && svg.width > 0) {
      // From page to drawing, then out of the bag's own scale about its base.
      const x = ((at.left + at.width / 2 - svg.left) / svg.width) * VB_W;
      setOrigin({ id: s.id, x: r2(BASE_X + (x - BASE_X) / bagScale) });
    }
    if (motionSafe) {
      animate(node, { scale: [0.86, 1] }, springs.recoil);
    }
    audio.play("plip", {
      pitch: r2(0.86 + index * (0.5 / Math.max(1, swatches.length - 1))),
      gain: 0.5,
    });
    setAsked("swatch");
    if (value === undefined) setOwnSwatch(s.id);
    onValueChange?.(s.id);
    // A colour that does not come in the chosen size moves the size too,
    // reported from this press.
    const next = nearest(s, sizeWanted);
    if (next !== sizeWanted) {
      if (selectedSize === undefined) setOwnSize(next);
      onSelectedSizeChange?.(next);
    }
  };

  const pressSize = (z: ProductSize) => {
    if (disabled || !offered(swatch, z.id) || z.id === sizeId) return;
    audio.play("plip", { pitch: r2(0.8 * (1 / (z.scale ?? 1))), gain: 0.32 });
    if (selectedSize === undefined) setOwnSize(z.id);
    onSelectedSizeChange?.(z.id);
  };

  const radioKeys = <T extends { id: string }>(
    event: React.KeyboardEvent,
    list: T[],
    currentId: string,
    usable: (t: T) => boolean,
    nodes: Map<string, HTMLButtonElement>,
    choose: (t: T, i: number, node: HTMLButtonElement) => void,
  ) => {
    const pool = list.map((t, i) => ({ t, i })).filter(({ t }) => usable(t));
    if (pool.length === 0) return;
    const at = Math.max(
      0,
      pool.findIndex(({ t }) => t.id === currentId),
    );
    let to = -1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = (at + 1) % pool.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = (at - 1 + pool.length) % pool.length;
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = pool.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const pick = pool[to];
    if (!pick) return;
    const node = nodes.get(pick.t.id);
    if (!node) return;
    node.focus();
    choose(pick.t, pick.i, node);
  };

  // Focus follows the morph: bound to the control when it arrives.
  const handoff = React.useRef<"plus" | "add" | null>(null);
  const [plusNode, setPlusNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [addNode, setAddNode] = React.useState<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (handoff.current === "plus" && plusNode) {
      handoff.current = null;
      plusNode.focus({ preventScroll: true });
    }
  }, [plusNode]);
  React.useEffect(() => {
    if (handoff.current === "add" && addNode) {
      handoff.current = null;
      addNode.focus({ preventScroll: true });
    }
  }, [addNode]);

  const setQty = (next: number, from?: Element | null) => {
    if (disabled) return;
    const n = Math.min(ceiling, Math.max(0, next));
    if (n === qty) return;
    const focused =
      !!from &&
      typeof document !== "undefined" &&
      document.activeElement === from;
    if (stepper && focused) {
      if (qty === 0 && n > 0) handoff.current = "plus";
      if (qty > 0 && n === 0) handoff.current = "add";
    }
    audio.play("pop", {
      pitch:
        n === 0
          ? 0.62
          : n > qty
            ? r2(1 + n * 0.05)
            : r2(0.92 - (qty - n) * 0.04),
      gain: n === 0 ? 0.35 : 0.5,
    });
    setAsked("qty");
    if (quantity === undefined) setOwnQty(n);
    onQuantityChange?.(n);
  };

  const sizeNote = size
    ? `${size.label}${size.note ? ` · ${size.note}` : ""}`
    : "";
  const drawn = `${name} in ${swatch?.label ?? ""}${size ? `, ${size.label} size` : ""}`;
  const inBag = qty > 0;
  const fadeLeave = exitFor(durations.fast);

  return (
    <article
      aria-labelledby={titleId}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setWithin(true);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setWithin(false);
      }}
      className={cn(
        "w-full max-w-[22rem] overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="border-b border-hairline bg-surface-2">
        <svg
          ref={svgRef}
          role="img"
          aria-label={drawn}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="block h-auto w-full"
        >
          <defs>
            <clipPath id={clipId}>
              <motion.path d={clip} />
            </clipPath>
            <linearGradient id={sideId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="black" stopOpacity={r2(0.32 * sh)} />
              <stop offset="0.3" stopColor="black" stopOpacity={0} />
              <stop
                offset="0.62"
                stopColor="white"
                stopOpacity={r2(0.1 * sh)}
              />
              <stop offset="1" stopColor="black" stopOpacity={r2(0.26 * sh)} />
            </linearGradient>
            <linearGradient id={floorId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="black" stopOpacity={r2(0.22 * sh)} />
              <stop offset="0.16" stopColor="black" stopOpacity={0} />
              <stop offset="0.8" stopColor="black" stopOpacity={0} />
              <stop offset="1" stopColor="black" stopOpacity={r2(0.24 * sh)} />
            </linearGradient>
          </defs>

          <motion.ellipse
            cx={BASE_X}
            cy={BASE_Y + 2}
            ry={4}
            fill="black"
            fillOpacity={0.22}
            initial={false}
            animate={{ rx: r2(60 * bagScale) }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            style={{ scaleX: shadowScale, originX: 0.5, originY: 0.5 }}
          />

          <motion.g style={{ y: bagY }}>
            <motion.g
              initial={false}
              animate={{ scale: bagScale }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              style={{ originX: 0.5, originY: 1 }}
            >
              <Dyed color={colorOf(dye.base)} />
              {dye.top ? (
                <motion.g
                  clipPath={`url(#${clipId})`}
                  style={{ opacity: topOpacity }}
                >
                  <Dyed color={colorOf(dye.top.id)} />
                </motion.g>
              ) : null}

              {/* Modelling sits over every dye, so a new colour is lit the
                  same way the moment it arrives. */}
              <g pointerEvents="none">
                <path d={BAG.body} fill={`url(#${sideId})`} />
                <path d={BAG.body} fill={`url(#${floorId})`} />
                <path
                  d={BAG.fold}
                  fill="none"
                  strokeWidth={3}
                  strokeLinecap="round"
                  stroke="black"
                  strokeOpacity={r2(0.1 * sh)}
                />
                <path
                  d="M 72 86 L 168 86"
                  fill="none"
                  strokeWidth={6}
                  stroke="black"
                  strokeOpacity={r2(0.12 * sh)}
                />
                <path
                  d={BAG.strapFront}
                  fill="none"
                  strokeWidth={2}
                  strokeLinecap="round"
                  stroke="white"
                  strokeOpacity={r2(0.16 * sh)}
                  transform="translate(-1.6 -1.2)"
                />
              </g>

              <g>
                <rect
                  x={106}
                  y={120}
                  width={28}
                  height={17}
                  rx={2.5}
                  style={{
                    fill: "oklch(from var(--warn) 0.58 0.08 calc(h - 22))",
                  }}
                />
                <rect
                  x={108}
                  y={122}
                  width={24}
                  height={13}
                  rx={1.5}
                  fill="none"
                  strokeWidth={0.7}
                  strokeDasharray="1.6 1.2"
                  style={{
                    stroke: "oklch(from var(--warn) 0.82 0.05 calc(h - 22))",
                  }}
                />
                <path
                  d="M 120 125 L 120 133 M 120 129 L 117 126.5 M 120 129 L 123 126.5 M 120 131.5 L 117.5 129.5 M 120 131.5 L 122.5 129.5"
                  fill="none"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  style={{
                    stroke: "oklch(from var(--warn) 0.86 0.05 calc(h - 22))",
                  }}
                />
              </g>
            </motion.g>
          </motion.g>
        </svg>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs leading-4 text-ink-3">{brand}</p>
            <Heading
              id={titleId}
              className="truncate text-base leading-6 font-medium text-foreground"
              title={name}
            >
              {name}
            </Heading>
            <p className="truncate text-xs leading-4 text-ink-3" title={detail}>
              {detail}
            </p>
          </div>
          <p className="shrink-0 text-lg leading-6 font-medium text-foreground">
            <Rolling text={priceText} motionSafe={motionSafe} />
            <span className="sr-only">{priceText}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p
            id={colourId}
            className="flex items-center gap-1.5 text-xs leading-4"
          >
            <span className="text-ink-3">Colour</span>
            <span className="text-foreground">{swatch?.label}</span>
          </p>
          <div
            role="radiogroup"
            aria-labelledby={colourId}
            className="flex flex-wrap items-center gap-2.5"
            onKeyDown={(event) =>
              radioKeys(
                event,
                swatches,
                swatchId,
                () => true,
                swatchNodes.current,
                (s, i, node) => pressSwatch(s, i, node),
              )
            }
          >
            {swatches.map((s, i) => {
              const checked = s.id === swatchId;
              return (
                <button
                  key={s.id}
                  ref={(node) => {
                    if (node) swatchNodes.current.set(s.id, node);
                    else swatchNodes.current.delete(s.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={`${s.label}, ${format(s.price + (size?.price ?? 0))}`}
                  tabIndex={checked && !disabled ? 0 : -1}
                  disabled={disabled}
                  onClick={(event) => pressSwatch(s, i, event.currentTarget)}
                  className={cn(
                    "relative grid size-8 place-items-center rounded-full outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
                    "enabled:cursor-pointer disabled:cursor-not-allowed",
                  )}
                >
                  {checked ? (
                    <motion.span
                      aria-hidden
                      layoutId={`${uid}-ring`}
                      className="absolute inset-0 rounded-full border-2 border-foreground"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="block size-6 rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
                    style={{ backgroundColor: s.color }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p
            id={sizeLabelId}
            className="flex items-center gap-1.5 text-xs leading-4"
          >
            <span className="text-ink-3">Size</span>
            <span className="text-foreground">{sizeNote}</span>
          </p>
          <div
            role="radiogroup"
            aria-labelledby={sizeLabelId}
            className="flex gap-2"
            onKeyDown={(event) =>
              radioKeys(
                event,
                sizes,
                sizeId,
                (z) => offered(swatch, z.id),
                sizeNodes.current,
                (z) => pressSize(z),
              )
            }
          >
            {sizes.map((z) => {
              const ok = offered(swatch, z.id);
              const checked = z.id === sizeId;
              return (
                <motion.button
                  key={z.id}
                  ref={(node: HTMLButtonElement | null) => {
                    if (node) sizeNodes.current.set(z.id, node);
                    else sizeNodes.current.delete(z.id);
                  }}
                  layout={motionSafe}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-disabled={!ok || undefined}
                  aria-label={
                    ok
                      ? `${z.label}${z.note ? `, ${z.note}` : ""}`
                      : `${z.label}, not made in ${swatch?.label ?? "this colour"}`
                  }
                  tabIndex={checked && !disabled ? 0 : -1}
                  disabled={disabled}
                  onClick={() => pressSize(z)}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                  className={cn(
                    "relative flex h-8 min-w-0 items-center justify-center rounded-2 border px-2 text-xs transition-[color,background-color,border-color] duration-200 outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    ok
                      ? "flex-1 enabled:cursor-pointer"
                      : "flex-none cursor-not-allowed border-dashed border-hairline text-ink-3 line-through",
                    ok &&
                      (checked
                        ? "border-foreground bg-surface-2 font-medium text-foreground"
                        : "border-hairline-strong text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-foreground"),
                    "disabled:cursor-not-allowed",
                  )}
                >
                  {/* Its own layout box, so the chip's resize never stretches the word. */}
                  <motion.span
                    layout={motionSafe ? "position" : false}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                    className="block truncate"
                  >
                    {z.label}
                  </motion.span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="relative h-10 w-full">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-3 bg-primary"
            initial={false}
            animate={{ opacity: inBag ? 0 : 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-3 border border-hairline-strong bg-cobalt-wash"
            initial={false}
            animate={{ opacity: inBag ? 1 : 0 }}
            transition={{ duration: durations.base, ease: easings.enter }}
          />

          {stepper ? (
            <AnimatePresence initial={false}>
              {!inBag ? (
                <motion.button
                  key="add"
                  ref={setAddNode}
                  type="button"
                  disabled={disabled}
                  onClick={(event) => setQty(1, event.currentTarget)}
                  className={cn(
                    "absolute inset-0 inline-flex items-center justify-center gap-2 rounded-3 text-sm font-medium text-primary-foreground outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "enabled:cursor-pointer disabled:cursor-not-allowed",
                  )}
                  initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? -distances.step : 0,
                    transition: fadeLeave,
                  }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  whileTap={
                    motionSafe && !disabled ? { scale: 0.98 } : undefined
                  }
                >
                  {addLabel}
                </motion.button>
              ) : (
                <motion.div
                  key="stepper"
                  role="group"
                  aria-label={`Quantity ${inBagLabel}`}
                  className="absolute inset-0 flex items-center justify-between"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: fadeLeave }}
                  transition={{ duration: durations.fast }}
                >
                  <motion.button
                    type="button"
                    disabled={disabled}
                    aria-label={qty === 1 ? "Remove from bag" : "Remove one"}
                    onClick={(event) => setQty(qty - 1, event.currentTarget)}
                    className={cn(
                      "inline-flex size-10 shrink-0 items-center justify-center rounded-3 text-foreground transition-colors outline-none",
                      "hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      "enabled:cursor-pointer disabled:cursor-not-allowed",
                    )}
                    initial={{
                      x: motionSafe ? distances.shift : 0,
                      opacity: 0,
                    }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            x: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    whileTap={
                      motionSafe && !disabled ? { scale: 0.92 } : undefined
                    }
                  >
                    <span className="grid size-4 place-items-center">
                      <AnimatePresence initial={false}>
                        <motion.span
                          key={qty === 1 ? "bin" : "minus"}
                          className="col-start-1 row-start-1"
                          initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, transition: fadeLeave }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.flick,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: durations.fast }
                          }
                        >
                          {qty === 1 ? (
                            <Trash2 aria-hidden className="size-4" />
                          ) : (
                            <Minus aria-hidden className="size-4" />
                          )}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </motion.button>
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                    <Rolling text={String(qty)} motionSafe={motionSafe} />
                    <span className="text-ink-2">{inBagLabel}</span>
                    <span className="sr-only">{`${qty} ${inBagLabel}`}</span>
                  </p>
                  <motion.button
                    ref={setPlusNode}
                    type="button"
                    disabled={disabled || qty >= ceiling}
                    aria-label="Add one"
                    onClick={(event) => setQty(qty + 1, event.currentTarget)}
                    className={cn(
                      "inline-flex size-10 shrink-0 items-center justify-center rounded-3 text-foreground transition-colors outline-none",
                      "hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                      "enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
                    )}
                    initial={{
                      x: motionSafe ? -distances.shift : 0,
                      opacity: 0,
                    }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            x: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                    whileTap={
                      motionSafe && !disabled ? { scale: 0.92 } : undefined
                    }
                  >
                    <Plus aria-hidden className="size-4" />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <motion.button
              type="button"
              aria-pressed={inBag}
              disabled={disabled}
              onClick={(event) => setQty(inBag ? 0 : 1, event.currentTarget)}
              whileTap={motionSafe && !disabled ? { scale: 0.98 } : undefined}
              transition={springs.flick}
              className={cn(
                "absolute inset-0 inline-flex items-center justify-center rounded-3 text-sm font-medium outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                "enabled:cursor-pointer disabled:cursor-not-allowed",
                inBag ? "text-foreground" : "text-primary-foreground",
              )}
            >
              <span className="grid">
                {[false, true].map((state) => {
                  const active = state === inBag;
                  return (
                    <motion.span
                      key={String(state)}
                      aria-hidden={active ? undefined : true}
                      className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2"
                      initial={false}
                      animate={
                        active
                          ? {
                              opacity: 1,
                              y: motionSafe ? [distances.nudge, 0] : 0,
                            }
                          : { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
                      }
                      transition={
                        active
                          ? {
                              opacity: {
                                duration: durations.fast,
                                ease: easings.enter,
                              },
                              y: springs.snap,
                            }
                          : exitFor(durations.blink)
                      }
                    >
                      {state ? (
                        <>
                          <svg
                            aria-hidden
                            viewBox="0 0 16 16"
                            className="size-4 shrink-0"
                          >
                            <motion.path
                              d="M 3.5 8.5 L 6.8 11.5 L 12.5 4.8"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={false}
                              animate={{ pathLength: inBag ? 1 : 0 }}
                              transition={
                                motionSafe ? springs.flick : { duration: 0 }
                              }
                            />
                          </svg>
                          <span className="first-letter:uppercase">
                            {inBagLabel}
                          </span>
                        </>
                      ) : (
                        addLabel
                      )}
                    </motion.span>
                  );
                })}
              </span>
            </motion.button>
          )}
        </div>
      </div>

      <span aria-live="polite" aria-atomic className="sr-only">
        {said.words}
      </span>
    </article>
  );
}
