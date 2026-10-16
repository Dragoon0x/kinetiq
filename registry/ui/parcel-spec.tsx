"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Plus, RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ParcelSpecPackage = {
  id: string;
  /** What is inside, shown on the tab's name for assistive technology. */
  contents?: string;
  /** Centimetres. */
  length: number;
  /** Centimetres. */
  width: number;
  /** Centimetres. */
  height: number;
  /** Kilograms. */
  weight: number;
};

export type ParcelSpecService = {
  id: string;
  name: string;
  /** How long it takes, as the customer reads it. */
  eta: string;
  /** Heaviest parcel it takes, kg. */
  maxWeight: number;
  /** Longest side it takes, cm. */
  maxLength: number;
  /** Price per parcel before weight. */
  base: number;
  /** Price per chargeable kilogram. */
  perKg: number;
};

export type ParcelSpecUnits = "metric" | "imperial";
export type ParcelSpecBoxStyle = "kraft" | "wire" | "tint";
export type ParcelSpecStatus = "ready" | "loading" | "error";
export type ParcelSpecQuotes = Record<string, number | null>;

export type ParcelSpecProps = {
  /** Controlled parcels, in cm and kg. Every edit is reported through `onChange`. */
  packages?: ParcelSpecPackage[];
  /** Initial parcels when uncontrolled. @default defaultParcelSpecPackages */
  defaultPackages?: ParcelSpecPackage[];
  /** Fires from the keystroke, nudge or button that changed a parcel, with every parcel. */
  onChange?: (packages: ParcelSpecPackage[]) => void;
  /** Fires when a tab, a new parcel or a removal changes the parcel being drawn. */
  onActivePackageChange?: (packageId: string) => void;
  /** The services offered. @default defaultParcelSpecServices */
  services?: ParcelSpecService[];
  /** Controlled service id. */
  service?: string;
  /** Initial service when uncontrolled. @default "standard" */
  defaultService?: string;
  /** Fires from the click or arrow key that picked a service. */
  onServiceChange?: (serviceId: string) => void;
  /** Prices the parcels for every service (null where it can't take them). Return a promise and the prices shimmer until it settles. Omit it and prices come from each service's rates. */
  onQuote?: (
    packages: ParcelSpecPackage[],
  ) => ParcelSpecQuotes | Promise<ParcelSpecQuotes>;
  /** The units fields, callouts and limits are shown in; typed units always convert. @default "metric" */
  unitSystem?: ParcelSpecUnits;
  /** The box: cardboard faces with a tape strip, edges only with hidden edges dashed, or accent-tinted glass. @default "kraft" */
  boxStyle?: ParcelSpecBoxStyle;
  /** The chosen service, the needle, callouts and focus — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Most parcels in one shipment. @default 4 */
  maxPackages?: number;
  /** Volumetric weight is L × W × H (cm) over this, in kg. @default 5000 */
  volumetricDivisor?: number;
  /** @default "Ship to Halden Street" */
  heading?: string;
  /** @default "USD" */
  currency?: string;
  /** @default "en-US" */
  locale?: string;
  /** Whether the shipment has loaded. @default "ready" */
  status?: ParcelSpecStatus;
  /** "Try again" was pressed after the shipment failed to load. */
  onRetry?: () => void;
  /** The panel's height in px. @default 540 */
  height?: number;
  /** Nothing can be edited. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Two Basinworks parcels for one café: filter cartridges and a test kit. */
export const defaultParcelSpecPackages: ParcelSpecPackage[] = [
  {
    id: "p1",
    contents: "Filter cartridges",
    length: 40,
    width: 30,
    height: 20,
    weight: 6.5,
  },
  {
    id: "p2",
    contents: "Water test kit",
    length: 25,
    width: 18,
    height: 12,
    weight: 1.2,
  },
];

export const defaultParcelSpecServices: ParcelSpecService[] = [
  {
    id: "letterpost",
    name: "Letterpost",
    eta: "2–4 days",
    maxWeight: 2,
    maxLength: 35,
    base: 3.2,
    perKg: 1.1,
  },
  {
    id: "standard",
    name: "Standard",
    eta: "3–5 days",
    maxWeight: 20,
    maxLength: 120,
    base: 6.5,
    perKg: 0.85,
  },
  {
    id: "nextday",
    name: "Next day",
    eta: "Tomorrow by 1pm",
    maxWeight: 15,
    maxLength: 100,
    base: 11.9,
    perKg: 1.4,
  },
  {
    id: "freight",
    name: "Freight",
    eta: "2–4 days on a pallet",
    maxWeight: 70,
    maxLength: 200,
    base: 24,
    perKg: 0.4,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Units                                   */
/* ----------------------------------------------------------------------- */

type Dim = "length" | "width" | "height" | "weight";
const DIMS: Dim[] = ["length", "width", "height", "weight"];
const DIM_LABEL: Record<Dim, string> = {
  length: "Length",
  width: "Width",
  height: "Height",
  weight: "Weight",
};

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;
const MAX_CM = 300;
const MAX_KG = 100;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const unitOf = (dim: Dim, sys: ParcelSpecUnits) =>
  dim === "weight"
    ? sys === "metric"
      ? "kg"
      : "lb"
    : sys === "metric"
      ? "cm"
      : "in";

const unitWord = (dim: Dim, sys: ParcelSpecUnits) =>
  dim === "weight"
    ? sys === "metric"
      ? "kilograms"
      : "pounds"
    : sys === "metric"
      ? "centimetres"
      : "inches";

/** Canonical (cm, kg) → the number shown in the field, trimmed. */
const toShown = (dim: Dim, v: number, sys: ParcelSpecUnits) => {
  const n =
    dim === "weight"
      ? sys === "metric"
        ? v
        : v / KG_PER_LB
      : sys === "metric"
        ? v
        : v / CM_PER_IN;
  const places = dim === "weight" ? 2 : 1;
  return String(Number(n.toFixed(places)));
};

const fromShown = (dim: Dim, n: number, sys: ParcelSpecUnits) =>
  dim === "weight"
    ? sys === "metric"
      ? n
      : n * KG_PER_LB
    : sys === "metric"
      ? n
      : n * CM_PER_IN;

const NUM = "(\\d+(?:\\.\\d+)?|\\.\\d+)";

/**
 * Reads what was typed into a canonical value: "40", "12 in", "1.2m",
 * "1'6\"", "500 g", "2 lb 4 oz". A bare number is in the field's own unit.
 * Returns null for an empty field and NaN for anything unreadable.
 */
function parseDim(
  text: string,
  dim: Dim,
  sys: ParcelSpecUnits,
): { value: number | null; unit: string | null } {
  const t = text.trim().toLowerCase().replace(/,/g, ".");
  if (t === "") return { value: null, unit: null };
  if (dim === "weight") {
    const lbOz = new RegExp(`^${NUM}\\s*(?:lb|lbs)\\s*${NUM}\\s*oz$`).exec(t);
    if (lbOz) {
      return {
        value: Number(lbOz[1]) * KG_PER_LB + (Number(lbOz[2]) * KG_PER_LB) / 16,
        unit: "lb",
      };
    }
    const m = new RegExp(`^${NUM}\\s*(kg|kgs|g|lb|lbs|oz)?$`).exec(t);
    if (!m) return { value: NaN, unit: null };
    const n = Number(m[1]);
    const u = m[2] ?? (sys === "metric" ? "kg" : "lb");
    const kg =
      u === "g"
        ? n / 1000
        : u === "lb" || u === "lbs"
          ? n * KG_PER_LB
          : u === "oz"
            ? (n * KG_PER_LB) / 16
            : n;
    return { value: kg, unit: u.replace(/s$/, "") };
  }
  const ftIn = new RegExp(
    `^${NUM}\\s*(?:'|ft|feet)\\s*(?:${NUM}\\s*(?:"|in|inch|inches)?)?$`,
  ).exec(t);
  if (ftIn) {
    return {
      value:
        Number(ftIn[1]) * 12 * CM_PER_IN + Number(ftIn[2] ?? 0) * CM_PER_IN,
      unit: "ft",
    };
  }
  const m = new RegExp(`^${NUM}\\s*(mm|cm|m|in|inch|inches|")?$`).exec(t);
  if (!m) return { value: NaN, unit: null };
  const n = Number(m[1]);
  const u = m[2] ?? (sys === "metric" ? "cm" : "in");
  const cm =
    u === "mm"
      ? n / 10
      : u === "m"
        ? n * 100
        : u === "in" || u === "inch" || u === "inches" || u === '"'
          ? n * CM_PER_IN
          : n;
  return {
    value: cm,
    unit: u === '"' || u === "inch" || u === "inches" ? "in" : u,
  };
}

/* ----------------------------------------------------------------------- */
/*                                The drawing                               */
/* ----------------------------------------------------------------------- */

/** The stage's drawing space; the SVG scales it to whatever box it gets. */
const VW = 320;
const VH = 236;
const FLOOR = 206;
/** px per cm before a big box makes the drawing zoom out. */
const S_MAX = 2.8;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;

type Pt = readonly [number, number];

const fitScale = (l: number, w: number, h: number) =>
  Math.min(
    S_MAX,
    250 / Math.max(1, (l + w) * COS),
    168 / Math.max(1, (l + w) * SIN + h),
  );

/** A grid step that keeps the floor squares 9px or more apart. */
/**
 * The floor's square, in cm: 10, 25 or 50 cm in metric, 4, 12 or 24 inches
 * in imperial — whichever first keeps the squares 9px or more apart.
 */
const gridStep = (s: number, sys: ParcelSpecUnits) => {
  const steps =
    sys === "metric" ? [10, 25, 50] : [4, 12, 24].map((i) => i * CM_PER_IN);
  return steps.find((g) => s * g >= 9) ?? steps[steps.length - 1] ?? 50;
};

type Geometry = {
  top: string;
  left: string;
  right: string;
  edges: string;
  hidden: string;
  tape: string;
  shadow: string;
  grid: string;
  len: Pt;
  wid: Pt;
  hei: Pt;
};

/**
 * The box in isometric view, its front-bottom corner on the floor at the
 * stage's centre line: length runs up to the right, width up to the left,
 * height straight up. Every coordinate is rounded, so the server's frame
 * and the browser's agree.
 */
function geometry(
  l: number,
  w: number,
  h: number,
  s: number,
  sys: ParcelSpecUnits,
): Geometry {
  const ox = VW / 2 - ((l - w) * COS * s) / 2;
  const p = (x: number, z: number, y: number): Pt => [
    r1(ox + (x - z) * COS * s),
    r1(FLOOR - (x + z) * SIN * s - y * s),
  ];
  const poly = (...pts: Pt[]) =>
    `M ${pts.map((q) => `${q[0]} ${q[1]}`).join(" L ")} Z`;
  const line = (a: Pt, b: Pt) => `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
  const o = p(0, 0, 0);
  const lx = p(l, 0, 0);
  const wz = p(0, w, 0);
  const back = p(l, w, 0);
  const oh = p(0, 0, h);
  const lh = p(l, 0, h);
  const wh = p(0, w, h);
  const bh = p(l, w, h);
  const t = Math.min(3, w * 0.16);
  const drop = Math.min(h * 0.4, 8);
  const step = gridStep(s, sys);
  const reach = Math.ceil(200 / (s * step)) * step;
  const grid: string[] = [];
  for (let g = -reach; g <= reach; g += step) {
    grid.push(line(p(g, -reach, 0), p(g, reach, 0)));
    grid.push(line(p(-reach, g, 0), p(reach, g, 0)));
  }
  const n = (v: Pt, dx: number, dy: number): Pt => [
    r1(v[0] + dx),
    r1(v[1] + dy),
  ];
  const mid = (a: Pt, b: Pt): Pt => [
    r1((a[0] + b[0]) / 2),
    r1((a[1] + b[1]) / 2),
  ];
  return {
    top: poly(oh, lh, bh, wh),
    right: poly(o, lx, lh, oh),
    left: poly(o, wz, wh, oh),
    edges: [
      line(o, lx),
      line(o, wz),
      line(o, oh),
      line(lx, lh),
      line(wz, wh),
      line(oh, lh),
      line(oh, wh),
      line(lh, bh),
      line(wh, bh),
    ].join(" "),
    hidden: [line(back, lx), line(back, wz), line(back, bh)].join(" "),
    tape: [
      poly(
        p(0, w / 2 - t, h),
        p(l, w / 2 - t, h),
        p(l, w / 2 + t, h),
        p(0, w / 2 + t, h),
      ),
      poly(
        p(0, w / 2 - t, h),
        p(0, w / 2 + t, h),
        p(0, w / 2 + t, h - drop),
        p(0, w / 2 - t, h - drop),
      ),
    ].join(" "),
    shadow: poly(n(o, 7, 2), n(lx, 9, 0), n(back, 7, -2), n(wz, 5, 2)),
    grid: grid.join(" "),
    len: n(mid(o, lx), 13 * SIN + 2, 13 * COS + 4),
    wid: n(mid(o, wz), -13 * SIN - 2, 13 * COS + 4),
    hei: n(mid(lx, lh), 10, 4),
  };
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** Characters that roll in their slots on snap, keyed from the right. */
function Rolling({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = Array.from(text);
  return (
    <span aria-hidden className="inline-flex">
      {chars.map((ch, i) => (
        <span
          key={chars.length - i}
          className="relative inline-flex overflow-clip"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              className="inline-block whitespace-pre"
              initial={{ opacity: 0, y: motionSafe ? "70%" : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? "-70%" : 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/**
 * A balance in a service row: the beam tips toward the parcel's pan on
 * recoil when the parcels are too heavy for the service, and levels on
 * glide when they are not. The pans hang from the beam's ends, so they are
 * rebuilt from the angle each frame.
 */
function Balance({ over, motionSafe }: { over: boolean; motionSafe: boolean }) {
  const angle = useMotionValue(over ? -14 : 0);
  React.useEffect(() => {
    const c = animate(
      angle,
      over ? -14 : 0,
      !motionSafe ? { duration: 0 } : over ? springs.recoil : springs.glide,
    );
    return () => c.stop();
  }, [over, motionSafe, angle]);
  const rad = (a: number) => (a * Math.PI) / 180;
  const lx = useTransform(angle, (a) => r2(14 - 10 * Math.cos(rad(a))));
  const ly = useTransform(angle, (a) => r2(7 - 10 * Math.sin(rad(a))));
  const rx = useTransform(angle, (a) => r2(14 + 10 * Math.cos(rad(a))));
  const ry = useTransform(angle, (a) => r2(7 + 10 * Math.sin(rad(a))));
  const beam = useTransform(
    [lx, ly, rx, ry] as MotionValue<number>[],
    ([a = 0, b = 0, c = 0, d = 0]: number[]) => `M ${a} ${b} L ${c} ${d}`,
  );
  const panAt = (x: number, y: number) =>
    `M ${x} ${y} L ${x} ${r2(y + 4)} M ${r2(x - 3.5)} ${r2(y + 4)} Q ${x} ${r2(y + 7)} ${r2(x + 3.5)} ${r2(y + 4)}`;
  const leftPan = useTransform(
    [lx, ly] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) => panAt(x, y),
  );
  const rightPan = useTransform(
    [rx, ry] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) => panAt(x, y),
  );
  const crate = useTransform(
    [lx, ly] as MotionValue<number>[],
    ([x = 0, y = 0]: number[]) =>
      `M ${r2(x - 2.5)} ${r2(y + 3.6)} L ${r2(x - 2.5)} ${r2(y + 0.6)} L ${r2(x + 2.5)} ${r2(y + 0.6)} L ${r2(x + 2.5)} ${r2(y + 3.6)} Z`,
  );
  return (
    <svg aria-hidden viewBox="0 0 28 22" className="h-[22px] w-7 shrink-0">
      <path d="M 14 8 L 10.5 19 L 17.5 19 Z" className="fill-ink-3/40" />
      <path d="M 9 19.5 L 19 19.5" strokeWidth="1.2" className="stroke-ink-3" />
      <motion.path
        d={beam}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        className={over ? "stroke-danger" : "stroke-ink-2"}
      />
      <motion.path
        d={leftPan}
        strokeWidth="0.9"
        fill="none"
        className="stroke-ink-3"
      />
      <motion.path
        d={rightPan}
        strokeWidth="0.9"
        fill="none"
        className="stroke-ink-3"
      />
      <motion.path
        d={crate}
        className={over ? "fill-danger" : "fill-ink-3/70"}
      />
      <circle cx="14" cy="7" r="1.3" className="fill-ink-2" />
    </svg>
  );
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FIELD_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-ring";

const FACES: Record<
  ParcelSpecBoxStyle,
  { top: string; left: string; right: string; edge: string }
> = {
  kraft: {
    top: "oklch(0.81 0.07 72)",
    left: "oklch(0.71 0.08 66)",
    right: "oklch(0.63 0.08 62)",
    edge: "oklch(0.46 0.06 58)",
  },
  wire: {
    top: "transparent",
    left: "transparent",
    right: "transparent",
    edge: "var(--ink-2)",
  },
  tint: {
    top: "color-mix(in oklab, var(--ps-accent) 30%, transparent)",
    left: "color-mix(in oklab, var(--ps-accent) 20%, transparent)",
    right: "color-mix(in oklab, var(--ps-accent) 12%, transparent)",
    edge: "color-mix(in oklab, var(--ps-accent) 80%, var(--foreground))",
  },
};

type Quote = {
  state: "idle" | "pending" | "ready" | "failed";
  prices: ParcelSpecQuotes;
  n: number;
};

/* ----------------------------------------------------------------------- */
/*                                 The form                                 */
/* ----------------------------------------------------------------------- */

/**
 * A shipping form whose parcel is drawn as it is typed: an isometric box,
 * to scale on a floor of 10 cm squares, whose length, width and height are
 * springs — typing a dimension stretches that edge on snap, with one crisp
 * overshoot, and switching parcels glides the whole box to the other
 * parcel's shape. A box that would outgrow the stage zooms the drawing out
 * on glide, and the floor's squares grow to say so. The dial weighs the
 * parcel against the chosen service; each service's balance tips on recoil
 * when a parcel is too heavy for it, and the service greys out with the
 * reason.
 *
 * Fields take any unit ("12 in", "1'6\"", "500 g") and settle into the
 * shown unit; Up and Down nudge by one (Shift ten, Alt a tenth), Page keys
 * by ten. Parcels are a tablist (Delete removes one), services a
 * radiogroup. Quotes from `onQuote` shimmer while they load and roll in on
 * snap. Under reduced motion the box redraws at its new size at once,
 * balances show tipped or level without travel and the shimmer is still.
 */
export function ParcelSpec({
  packages,
  defaultPackages,
  onChange,
  onActivePackageChange,
  services = defaultParcelSpecServices,
  service,
  defaultService = "standard",
  onServiceChange,
  onQuote,
  unitSystem = "metric",
  boxStyle = "kraft",
  accent = "var(--accent-bright)",
  maxPackages = 4,
  volumetricDivisor = 5000,
  heading = "Ship to Halden Street",
  currency = "USD",
  locale = "en-US",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: ParcelSpecProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const headingId = `${uid}-heading`;
  const ready = status === "ready";
  const locked = disabled || !ready;
  const sys = unitSystem;

  const money = React.useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency }),
    [locale, currency],
  );

  const [own, setOwn] = React.useState<ParcelSpecPackage[]>(
    () => defaultPackages ?? defaultParcelSpecPackages,
  );
  const list = packages ?? own;
  const [activeId, setActiveIdState] = React.useState(list[0]?.id ?? "");
  const setActiveId = (id: string) => {
    if (id === activeId) return;
    setActiveIdState(id);
    onActivePackageChange?.(id);
  };
  const active = list.find((p) => p.id === activeId) ?? list[0];
  const activeIndex = Math.max(
    0,
    list.findIndex((p) => p.id === active?.id),
  );

  const [ownService, setOwnService] = React.useState(defaultService);
  const chosen = service ?? ownService;

  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [quote, setQuote] = React.useState<Quote>(() => ({
    state: onQuote ? "pending" : "idle",
    prices: {},
    n: 0,
  }));
  const [inView, setInView] = React.useState(true);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ derived ------------------------------- */

  const chargeable = (p: ParcelSpecPackage) =>
    Math.max(p.weight, (p.length * p.width * p.height) / volumetricDivisor);
  const longest = (p: ParcelSpecPackage) =>
    Math.max(p.length, p.width, p.height);
  const reasonFor = (svc: ParcelSpecService): string | null => {
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      if (!p) continue;
      const name = list.length > 1 ? `Parcel ${i + 1}` : "The parcel";
      if (p.weight > svc.maxWeight) {
        return `${name} is over ${toShown("weight", svc.maxWeight, sys)} ${unitOf("weight", sys)}`;
      }
      if (longest(p) > svc.maxLength) {
        return `${name} is longer than ${toShown("length", svc.maxLength, sys)} ${unitOf("length", sys)}`;
      }
    }
    return null;
  };
  const heavyFor = (svc: ParcelSpecService) =>
    list.some((p) => p.weight > svc.maxWeight);
  const localPrice = (svc: ParcelSpecService) =>
    reasonFor(svc)
      ? null
      : r2(list.reduce((t, p) => t + svc.base + svc.perKg * chargeable(p), 0));
  const priceOf = (svc: ParcelSpecService): number | null | undefined => {
    if (!onQuote) return localPrice(svc);
    if (quote.state !== "ready") return undefined;
    const v = quote.prices[svc.id];
    return v === undefined ? localPrice(svc) : v;
  };
  const chosenSvc = services.find((s) => s.id === chosen);
  const totalKg = list.reduce((t, p) => t + p.weight, 0);
  const heaviest = Math.max(0, ...services.map((s) => s.maxWeight));
  const shapeKey = list
    .map((p) => `${p.id}:${p.length}x${p.width}x${p.height}@${p.weight}`)
    .join("|");

  /* ----------------------------- the drawing ---------------------------- */

  const L = useMotionValue(active?.length ?? 30);
  const W = useMotionValue(active?.width ?? 20);
  const H = useMotionValue(active?.height ?? 15);
  const S = useMotionValue(
    fitScale(active?.length ?? 30, active?.width ?? 20, active?.height ?? 15),
  );
  const geo = useTransform(
    [L, W, H, S] as MotionValue<number>[],
    ([l = 1, w = 1, h = 1, s = 1]: number[]) =>
      geometry(Math.max(0.5, l), Math.max(0.5, w), Math.max(0.5, h), s, sys),
  );
  const dTop = useTransform(geo, (g) => g.top);
  const dLeft = useTransform(geo, (g) => g.left);
  const dRight = useTransform(geo, (g) => g.right);
  const dEdges = useTransform(geo, (g) => g.edges);
  const dHidden = useTransform(geo, (g) => g.hidden);
  const dTape = useTransform(geo, (g) => g.tape);
  const dShadow = useTransform(geo, (g) => g.shadow);
  const dGrid = useTransform(geo, (g) => g.grid);
  const lenX = useTransform(geo, (g) => g.len[0]);
  const lenY = useTransform(geo, (g) => g.len[1]);
  const widX = useTransform(geo, (g) => g.wid[0]);
  const widY = useTransform(geo, (g) => g.wid[1]);
  const heiX = useTransform(geo, (g) => g.hei[0]);
  const heiY = useTransform(geo, (g) => g.hei[1]);

  const lastActive = React.useRef(active?.id);
  React.useEffect(() => {
    if (!active) return;
    const switched = lastActive.current !== active.id;
    lastActive.current = active.id;
    const spring = switched ? springs.glide : springs.snap;
    const target = fitScale(active.length, active.width, active.height);
    if (!motionSafe) {
      L.jump(active.length);
      W.jump(active.width);
      H.jump(active.height);
      S.jump(target);
      return;
    }
    const runs = [
      animate(L, active.length, spring),
      animate(W, active.width, spring),
      animate(H, active.height, spring),
      animate(S, target, springs.glide),
    ];
    return () => {
      for (const c of runs) c.stop();
    };
  }, [active, motionSafe, L, W, H, S]);

  // The needle weighs the parcel against the chosen service's limit.
  const dialMax = chosenSvc?.maxWeight ?? heaviest;
  const needleTarget = active
    ? -120 + 240 * Math.min(1.08, active.weight / Math.max(0.1, dialMax))
    : -120;
  const needle = useMotionValue(needleTarget);
  React.useEffect(() => {
    const c = animate(
      needle,
      needleTarget,
      !motionSafe
        ? { duration: 0 }
        : needleTarget > 120
          ? springs.recoil
          : springs.snap,
    );
    return () => c.stop();
  }, [needleTarget, motionSafe, needle]);
  const needleX = useTransform(needle, (a) =>
    r2(22 + 15 * Math.sin((a * Math.PI) / 180)),
  );
  const needleY = useTransform(needle, (a) =>
    r2(24 - 15 * Math.cos((a * Math.PI) / 180)),
  );

  /* ------------------------------ quoting ------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const alive = React.useRef(false);
  const quoteN = React.useRef(0);
  const latest = React.useRef({ list, onQuote });
  React.useEffect(() => {
    latest.current = { list, onQuote };
  });
  const quoting = !!onQuote;

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A new shape is quoted once typing pauses; a stale answer is dropped.
  React.useEffect(() => {
    if (!quoting || !ready) return;
    const t = window.setTimeout(() => {
      const ask = latest.current.onQuote;
      if (!ask) return;
      const n = (quoteN.current += 1);
      setQuote((q) => ({ ...q, state: "pending", n }));
      let result: ParcelSpecQuotes | Promise<ParcelSpecQuotes>;
      try {
        result = ask(latest.current.list);
      } catch {
        setQuote((q) => ({ ...q, state: "failed" }));
        return;
      }
      Promise.resolve(result).then(
        (prices) => {
          if (!alive.current || n !== quoteN.current) return;
          setQuote({ state: "ready", prices, n });
          setSaid((s) => ({ n: s.n + 1, text: "Quotes updated." }));
        },
        () => {
          if (!alive.current || n !== quoteN.current) return;
          setQuote((q) => ({ ...q, state: "failed" }));
          setSaid((s) => ({ n: s.n + 1, text: "Quotes didn't load." }));
        },
      );
    }, 380);
    return () => window.clearTimeout(t);
  }, [shapeKey, quoting, ready]);

  // The shimmer only runs while the form is on screen.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(([e]) =>
      setInView(e?.isIntersecting ?? true),
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  /* ------------------------------ actions ------------------------------- */

  const write = (next: ParcelSpecPackage[]) => {
    if (locked) return;
    if (packages === undefined) setOwn(next);
    onChange?.(next);
    if (onQuote) setQuote((q) => ({ ...q, state: "pending" }));
  };

  const setDim = (dim: Dim, v: number) => {
    if (!active) return;
    const value =
      dim === "weight" ? clamp(r2(v), 0.01, MAX_KG) : clamp(r1(v), 0.5, MAX_CM);
    if (active[dim] === value) return;
    write(list.map((p) => (p.id === active.id ? { ...p, [dim]: value } : p)));
  };

  const key = (dim: Dim) => `${active?.id ?? ""}:${dim}`;

  const validate = (dim: Dim, text: string): string | null => {
    const { value } = parseDim(text, dim, sys);
    const label = DIM_LABEL[dim];
    if (value === null)
      return `${label}: enter a ${dim === "weight" ? "weight" : "size"}`;
    if (Number.isNaN(value)) {
      return dim === "weight"
        ? `${label}: enter a weight like ${sys === "metric" ? "2.5 kg" : "5 lb"}`
        : `${label}: enter a size like ${sys === "metric" ? "30 cm" : "12 in"}`;
    }
    if (value <= 0) return `${label} must be more than 0`;
    if (dim === "weight" && value > MAX_KG) {
      return `${label}: ${toShown("weight", MAX_KG, sys)} ${unitOf("weight", sys)} is the most we weigh`;
    }
    if (dim !== "weight" && value > MAX_CM) {
      return `${label}: ${toShown("length", MAX_CM, sys)} ${unitOf("length", sys)} is the most we measure`;
    }
    return null;
  };

  const onType = (dim: Dim, text: string) => {
    const k = key(dim);
    setDrafts((d) => ({ ...d, [k]: text }));
    const err = validate(dim, text);
    const { value } = parseDim(text, dim, sys);
    if (!err && value !== null) {
      setErrors((e) => {
        if (!e[k]) return e;
        const rest = { ...e };
        delete rest[k];
        return rest;
      });
      setDim(dim, value);
    }
  };

  const settle = (dim: Dim) => {
    const k = key(dim);
    const text = drafts[k];
    if (text === undefined) return;
    const err = validate(dim, text);
    if (err) {
      setErrors((e) => ({ ...e, [k]: err }));
      say(err);
      return;
    }
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[k];
      return rest;
    });
  };

  const nudge = (dim: Dim, by: number) => {
    if (!active || locked) return;
    const shown = Number(toShown(dim, active[dim], sys));
    const places = dim === "weight" ? 2 : 1;
    const next = Number((shown + by).toFixed(places));
    const floor = dim === "weight" ? 0.01 : 0.5;
    setDim(
      dim,
      Math.max(fromShown(dim, floor, sys), fromShown(dim, next, sys)),
    );
    const k = key(dim);
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[k];
      return rest;
    });
    setErrors((e) => {
      if (!e[k]) return e;
      const rest = { ...e };
      delete rest[k];
      return rest;
    });
  };

  const pickService = (svc: ParcelSpecService) => {
    if (locked) return;
    if (reasonFor(svc)) {
      say(`${svc.name} can't take this shipment: ${reasonFor(svc)}.`);
      return;
    }
    if (service === undefined) setOwnService(svc.id);
    onServiceChange?.(svc.id);
    const price = priceOf(svc);
    say(
      `${svc.name}, ${svc.eta}${typeof price === "number" ? `, ${money.format(price)}` : ""}.`,
    );
  };

  const focusSel = (selector: string) =>
    window.requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLElement>(selector)?.focus(),
    );

  const addParcel = () => {
    if (locked || list.length >= maxPackages) return;
    const base = active ?? list[list.length - 1];
    let n = list.length + 1;
    while (list.some((p) => p.id === `${uid}-p${n}`)) n += 1;
    const next: ParcelSpecPackage = {
      id: `${uid}-p${n}`,
      length: base?.length ?? 30,
      width: base?.width ?? 20,
      height: base?.height ?? 15,
      weight: 1,
    };
    write([...list, next]);
    setActiveId(next.id);
    say(`Parcel ${list.length + 1} added, the same size as the last.`);
    focusSel(`[data-ps-tab="${CSS.escape(next.id)}"]`);
  };

  const removeParcel = (id: string) => {
    if (locked || list.length <= 1) return;
    const at = list.findIndex((p) => p.id === id);
    const next = list.filter((p) => p.id !== id);
    write(next);
    const to = next[Math.min(at, next.length - 1)];
    if (to) {
      setActiveId(to.id);
      focusSel(`[data-ps-tab="${CSS.escape(to.id)}"]`);
    }
    say(`Parcel ${at + 1} removed. ${next.length} left.`);
  };

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const keys: Record<string, number> = {
      ArrowRight: i + 1,
      ArrowLeft: i - 1,
      Home: 0,
      End: list.length - 1,
    };
    const to = keys[e.key];
    if (to !== undefined) {
      e.preventDefault();
      const p = list[(to + list.length) % list.length];
      if (p) {
        setActiveId(p.id);
        focusSel(`[data-ps-tab="${CSS.escape(p.id)}"]`);
      }
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const p = list[i];
      if (p) removeParcel(p.id);
    }
  };

  const onServiceKey = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const open = services
      .map((svc, at) => (reasonFor(svc) ? -1 : at))
      .filter((at) => at !== -1);
    if (open.length === 0) return;
    const after = open.find((at) => at > i) ?? open[0];
    const before =
      [...open].reverse().find((at) => at < i) ?? open[open.length - 1];
    const to =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? after
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? before
          : e.key === "Home"
            ? open[0]
            : e.key === "End"
              ? open[open.length - 1]
              : undefined;
    if (to === undefined) return;
    e.preventDefault();
    const svc = services[to];
    if (!svc) return;
    pickService(svc);
    focusSel(`[data-ps-service="${CSS.escape(svc.id)}"]`);
  };

  /* ------------------------------- render ------------------------------- */

  const faces = FACES[boxStyle] ?? FACES.kraft;
  const shown = (dim: Dim) =>
    active ? `${toShown(dim, active[dim], sys)} ${unitOf(dim, sys)}` : "";
  const over = (dim: Dim) =>
    !!active &&
    !!chosenSvc &&
    (dim === "weight"
      ? active.weight > chosenSvc.maxWeight
      : active[dim] > chosenSvc.maxLength);
  const errFor = (dim: Dim) => errors[key(dim)];
  const step = gridStep(
    fitScale(active?.length ?? 30, active?.width ?? 20, active?.height ?? 15),
    sys,
  );
  const vol = active
    ? (active.length * active.width * active.height) / volumetricDivisor
    : 0;

  const stage = (
    <figure
      aria-label={
        active
          ? `Parcel ${activeIndex + 1}, ${toShown("length", active.length, sys)} by ${toShown("width", active.width, sys)} by ${toShown("height", active.height, sys)} ${unitWord("length", sys)}, ${toShown("weight", active.weight, sys)} ${unitWord("weight", sys)}`
          : "No parcel"
      }
      className="relative m-0 flex h-full overflow-hidden"
    >
      <div className="relative order-2 h-full min-w-0 flex-1">
        <svg
          aria-hidden
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="xMidYMax meet"
          className="absolute inset-0 size-full"
          style={{
            maskImage:
              "radial-gradient(ellipse 60% 55% at 50% 72%, black 35%, transparent 80%)",
          }}
        >
          <motion.path
            d={dGrid}
            fill="none"
            strokeWidth={0.6}
            className="stroke-hairline-strong"
          />
        </svg>
        <svg
          aria-hidden
          viewBox={`0 0 ${VW} ${VH}`}
          preserveAspectRatio="xMidYMax meet"
          className="absolute inset-0 size-full overflow-visible"
        >
          {boxStyle !== "wire" ? (
            <motion.path d={dShadow} fill="black" opacity={0.1} />
          ) : null}
          {boxStyle === "wire" ? (
            <motion.path
              d={dHidden}
              fill="none"
              strokeWidth={1}
              strokeDasharray="3 3"
              className="stroke-ink-3"
            />
          ) : null}
          <motion.path d={dLeft} fill={faces.left} />
          <motion.path d={dRight} fill={faces.right} />
          <motion.path d={dTop} fill={faces.top} />
          {boxStyle === "kraft" ? (
            <motion.path d={dTape} fill="oklch(0.88 0.04 82)" opacity={0.9} />
          ) : null}
          <motion.path
            d={dEdges}
            fill="none"
            stroke={faces.edge}
            strokeWidth={boxStyle === "wire" ? 1.3 : 1}
            strokeLinejoin="round"
          />
          {(["length", "width", "height"] as const).map((dim) => {
            const x = dim === "length" ? lenX : dim === "width" ? widX : heiX;
            const y = dim === "length" ? lenY : dim === "width" ? widY : heiY;
            const bad = !!errFor(dim) || over(dim);
            return (
              <motion.text
                key={dim}
                x={x}
                y={y}
                textAnchor={dim === "height" ? "start" : "middle"}
                className={cn(
                  "font-mono text-[9px] font-medium",
                  bad ? "fill-danger" : "fill-(--ps-accent)",
                )}
                style={{
                  paintOrder: "stroke",
                  stroke: "var(--bg-1)",
                  strokeWidth: 3,
                  strokeLinejoin: "round",
                }}
              >
                {errFor(dim) ? "?" : shown(dim)}
              </motion.text>
            );
          })}
        </svg>
      </div>

      {/* The dial: a column beside the drawing on a phone, a chip over the
          stage's corner when there is room. */}
      <div className="pointer-events-none order-1 m-2 flex shrink-0 flex-col items-center gap-0.5 self-start rounded-3 border border-hairline bg-card/85 px-1.5 py-1 backdrop-blur-sm @min-[40rem]/parcel-spec:absolute @min-[40rem]/parcel-spec:top-2 @min-[40rem]/parcel-spec:left-2 @min-[40rem]/parcel-spec:m-0 @min-[40rem]/parcel-spec:flex-row @min-[40rem]/parcel-spec:gap-2 @min-[40rem]/parcel-spec:pr-2.5 @min-[40rem]/parcel-spec:pl-1">
        <svg aria-hidden viewBox="0 0 44 30" className="h-[30px] w-11">
          <path
            d="M 7 24 A 15 15 0 0 1 37 24"
            fill="none"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="stroke-hairline-strong"
          />
          {Array.from({ length: 9 }, (_, i) => {
            const a = ((-120 + i * 30) * Math.PI) / 180;
            return (
              <path
                key={i}
                d={`M ${r2(22 + 12 * Math.sin(a))} ${r2(24 - 12 * Math.cos(a))} L ${r2(22 + 15 * Math.sin(a))} ${r2(24 - 15 * Math.cos(a))}`}
                strokeWidth={i === 8 ? 1.4 : 0.8}
                className={i === 8 ? "stroke-danger" : "stroke-ink-3"}
              />
            );
          })}
          <motion.line
            x1={22}
            y1={24}
            x2={needleX}
            y2={needleY}
            strokeWidth={1.6}
            strokeLinecap="round"
            className={
              over("weight") ? "stroke-danger" : "stroke-(--ps-accent)"
            }
          />
          <circle cx="22" cy="24" r="2" className="fill-ink-2" />
        </svg>
        <span className="flex flex-col items-center leading-tight @min-[40rem]/parcel-spec:items-start">
          <span
            className={cn(
              "font-mono text-[11px] font-medium whitespace-nowrap tabular-nums @min-[40rem]/parcel-spec:text-[12px]",
              over("weight") ? "text-danger" : "text-foreground",
            )}
          >
            {shown("weight")}
          </span>
          <span className="hidden text-[10px] text-ink-3 @min-[40rem]/parcel-spec:inline">
            {chosenSvc
              ? `${chosenSvc.name} takes ${toShown("weight", chosenSvc.maxWeight, sys)} ${unitOf("weight", sys)}`
              : "No service"}
          </span>
        </span>
      </div>
      {active ? (
        <div className="pointer-events-none absolute inset-x-3 top-16 hidden flex-col gap-0.5 @min-[40rem]/parcel-spec:flex">
          <span className="truncate text-[11px] text-ink-3">
            {active.contents ?? `Parcel ${activeIndex + 1}`}
          </span>
          <span className="font-mono text-[15px] font-medium text-foreground tabular-nums">
            {toShown("length", active.length, sys)} ×{" "}
            {toShown("width", active.width, sys)} ×{" "}
            {toShown("height", active.height, sys)} {unitOf("length", sys)}
          </span>
        </div>
      ) : null}
      <span className="pointer-events-none absolute top-2 right-2 font-mono text-[10px] text-ink-3 @min-[40rem]/parcel-spec:top-auto @min-[40rem]/parcel-spec:bottom-2">
        Squares{" "}
        {sys === "metric" ? `${step} cm` : `${Math.round(step / CM_PER_IN)} in`}
      </span>
    </figure>
  );

  const field = (dim: Dim) => {
    const k = key(dim);
    const draft = drafts[k];
    const value = draft ?? (active ? toShown(dim, active[dim], sys) : "");
    const err = errFor(dim);
    const id = `${uid}-${dim}`;
    const parsed = draft !== undefined ? parseDim(draft, dim, sys) : null;
    const converts =
      parsed &&
      parsed.value !== null &&
      !Number.isNaN(parsed.value) &&
      parsed.unit !== null &&
      parsed.unit !== unitOf(dim, sys);
    const heavy = dim === "weight" && active && active.weight > heaviest;
    return (
      <div key={dim} className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className="text-[12px] font-medium text-foreground">
          {DIM_LABEL[dim]}
        </label>
        <div className="relative">
          <input
            id={id}
            role="spinbutton"
            data-ps-field={dim}
            value={value}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            disabled={locked}
            aria-valuenow={
              active ? Number(toShown(dim, active[dim], sys)) : undefined
            }
            aria-valuemin={Number(
              toShown(dim, dim === "weight" ? 0.01 : 0.5, sys),
            )}
            aria-valuemax={Number(
              toShown(dim, dim === "weight" ? MAX_KG : MAX_CM, sys),
            )}
            aria-valuetext={
              active
                ? `${toShown(dim, active[dim], sys)} ${unitWord(dim, sys)}`
                : undefined
            }
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? `${id}-error` : undefined}
            onChange={(e) => onType(dim, e.currentTarget.value)}
            onBlur={() => settle(dim)}
            onKeyDown={(e) => {
              const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                nudge(dim, (e.key === "ArrowUp" ? 1 : -1) * mult);
              } else if (e.key === "PageUp" || e.key === "PageDown") {
                e.preventDefault();
                nudge(dim, e.key === "PageUp" ? 10 : -10);
              } else if (e.key === "Enter") {
                e.preventDefault();
                settle(dim);
              }
            }}
            className={cn(
              "h-9 w-full rounded-2 border bg-surface-1 pr-9 pl-3 font-mono text-[13px] text-foreground tabular-nums transition-colors disabled:opacity-60",
              err || over(dim) ? "border-danger/70" : "border-hairline-strong",
              FIELD_RING,
            )}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-ink-3"
          >
            {unitOf(dim, sys)}
          </span>
        </div>
        {err ? (
          <p
            id={`${id}-error`}
            className="flex items-start gap-1 text-[11px] leading-4 text-danger"
          >
            <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
            {err}
          </p>
        ) : converts && parsed?.value ? (
          <p className="font-mono text-[11px] text-ink-3">
            = {toShown(dim, parsed.value, sys)} {unitOf(dim, sys)}
          </p>
        ) : heavy ? (
          <p className="text-[11px] leading-4 text-danger">
            Over every service&apos;s limit
          </p>
        ) : null}
      </div>
    );
  };

  const chosenOpen = !!chosenSvc && !reasonFor(chosenSvc);
  const firstOpen = services.findIndex((s) => !reasonFor(s));
  const serviceRow = (svc: ParcelSpecService, i: number) => {
    const reason = reasonFor(svc);
    const on = svc.id === chosen;
    const price = priceOf(svc);
    const pending = onQuote && quote.state !== "ready" && !reason;
    const tabbable = chosenOpen ? on : i === firstOpen;
    return (
      <button
        key={svc.id}
        type="button"
        role="radio"
        data-ps-service={svc.id}
        aria-checked={on}
        aria-disabled={!!reason || locked || undefined}
        aria-label={`${svc.name}, ${reason ? `unavailable: ${reason}` : `${svc.eta}${typeof price === "number" ? `, ${money.format(price)}` : pending ? ", quoting" : ""}`}`}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => pickService(svc)}
        onKeyDown={(e) => onServiceKey(e, i)}
        className={cn(
          "relative flex w-full items-center gap-3 rounded-3 border px-3 py-2 text-left transition-colors",
          on && !reason
            ? "border-(--ps-line) bg-(--ps-wash)"
            : "border-hairline hover:bg-surface-1",
          reason && "cursor-not-allowed",
          FOCUS_RING,
        )}
      >
        <span aria-hidden className={cn("flex", reason && "opacity-80")}>
          <Balance over={heavyFor(svc)} motionSafe={motionSafe} />
        </span>
        <span
          aria-hidden
          className={cn("flex min-w-0 flex-1 flex-col", reason && "opacity-50")}
        >
          <span className="truncate text-[13px] font-medium text-foreground">
            {svc.name}
          </span>
          <span
            className={cn(
              "truncate text-[11px]",
              reason ? "text-danger" : "text-ink-3",
            )}
          >
            {reason ?? svc.eta}
          </span>
        </span>
        <span
          aria-hidden
          className="flex shrink-0 items-center justify-end font-mono text-[13px] font-medium text-foreground tabular-nums"
        >
          {reason ? (
            <span className="text-ink-3">—</span>
          ) : pending ? (
            <span className="relative block h-3 w-14 overflow-hidden rounded-full bg-surface-2">
              {motionSafe && inView ? (
                <motion.span
                  className="absolute inset-y-0 w-1/2 bg-linear-to-r from-transparent via-[color-mix(in_oklab,var(--foreground)_10%,transparent)] to-transparent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "220%" }}
                  transition={{
                    duration: 1.1,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                />
              ) : null}
            </span>
          ) : typeof price === "number" ? (
            <Rolling text={money.format(price)} motionSafe={motionSafe} />
          ) : (
            <span className="text-ink-3">—</span>
          )}
        </span>
      </button>
    );
  };

  const chosenPrice = chosenSvc ? priceOf(chosenSvc) : null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={headingId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/parcel-spec relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--ps-accent" as string]: accent,
        ["--ps-wash" as string]: `color-mix(in oklab, ${accent} 9%, transparent)`,
        ["--ps-line" as string]: `color-mix(in oklab, ${accent} 55%, transparent)`,
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="min-w-[8rem] flex-1">
          <h2 id={headingId} className="truncate text-sm font-semibold">
            {heading}
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            {list.length} {list.length === 1 ? "parcel" : "parcels"} ·{" "}
            {toShown("weight", totalKg, sys)} {unitOf("weight", sys)}
          </p>
        </div>
        {ready && chosenSvc ? (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 text-[11px] text-ink-2">
            {chosenSvc.name}
            <span className="font-mono font-medium text-foreground tabular-nums">
              {typeof chosenPrice === "number"
                ? money.format(chosenPrice)
                : chosenPrice === undefined
                  ? "…"
                  : "—"}
            </span>
          </span>
        ) : null}
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            This shipment didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden @min-[40rem]/parcel-spec:grid @min-[40rem]/parcel-spec:grid-cols-[44%_minmax(0,1fr)] @min-[60rem]/parcel-spec:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="h-[150px] shrink-0 border-b border-hairline bg-surface-1 @min-[40rem]/parcel-spec:h-full @min-[40rem]/parcel-spec:border-r @min-[40rem]/parcel-spec:border-b-0">
            {status === "loading" ? (
              <div
                aria-hidden
                className="flex h-full items-center justify-center"
              >
                <span className="size-24 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
              </div>
            ) : (
              stage
            )}
          </div>
          <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
            <div className="flex flex-col gap-4 px-4 py-4">
              {status === "loading" ? (
                <div aria-hidden className="grid grid-cols-2 gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="h-14 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div
                      role="tablist"
                      aria-label="Parcels"
                      className="flex flex-wrap items-center gap-1"
                    >
                      {list.map((p, i) => {
                        const on = p.id === active?.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            role="tab"
                            data-ps-tab={p.id}
                            aria-selected={on}
                            aria-controls={`${uid}-panel`}
                            aria-label={`Parcel ${i + 1}${p.contents ? `, ${p.contents}` : ""}, ${toShown("weight", p.weight, sys)} ${unitWord("weight", sys)}`}
                            tabIndex={on ? 0 : -1}
                            onClick={() => setActiveId(p.id)}
                            onKeyDown={(e) => onTabKey(e, i)}
                            className={cn(
                              "relative inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-[12px] transition-colors",
                              on
                                ? "text-foreground"
                                : "text-ink-2 hover:bg-surface-1 hover:text-foreground",
                              FOCUS_RING,
                            )}
                          >
                            {on ? (
                              <motion.span
                                layoutId={`${uid}-tab`}
                                aria-hidden
                                className="absolute inset-0 rounded-2 border border-(--ps-line) bg-(--ps-wash)"
                                transition={
                                  motionSafe ? springs.snap : { duration: 0 }
                                }
                              />
                            ) : null}
                            <span className="relative font-medium">
                              Parcel {i + 1}
                            </span>
                            <span
                              aria-hidden
                              className="relative hidden font-mono text-[10px] text-ink-3 tabular-nums @min-[24rem]/parcel-spec:inline"
                            >
                              {toShown("weight", p.weight, sys)}{" "}
                              {unitOf("weight", sys)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {list.length < maxPackages ? (
                      <button
                        type="button"
                        onClick={addParcel}
                        aria-disabled={locked || undefined}
                        className={cn(
                          "inline-flex h-8 items-center gap-1 rounded-2 border border-dashed border-hairline-strong px-2.5 text-[12px] text-ink-2 transition-colors hover:border-(--ps-line) hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        <Plus aria-hidden className="size-3.5" />
                        Add
                        <span className="sr-only"> parcel</span>
                      </button>
                    ) : null}
                  </div>

                  <div
                    id={`${uid}-panel`}
                    role="tabpanel"
                    aria-label={`Parcel ${activeIndex + 1}`}
                    className="flex flex-col gap-2"
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={active?.id}
                        className="grid grid-cols-2 gap-x-3 gap-y-3"
                        initial={{
                          opacity: 0,
                          x: motionSafe ? distances.step : 0,
                        }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                x: springs.glide,
                                opacity: {
                                  duration: durations.base,
                                  ease: easings.enter,
                                },
                              }
                            : { duration: durations.fast }
                        }
                      >
                        {DIMS.map(field)}
                      </motion.div>
                    </AnimatePresence>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <p className="text-[11px] text-ink-3">
                        Volumetric {toShown("weight", vol, sys)}{" "}
                        {unitOf("weight", sys)} · charged on{" "}
                        {active
                          ? toShown("weight", chargeable(active), sys)
                          : "0"}{" "}
                        {unitOf("weight", sys)}
                      </p>
                      {list.length > 1 && active ? (
                        <button
                          type="button"
                          onClick={() => removeParcel(active.id)}
                          aria-disabled={locked || undefined}
                          className={cn(
                            "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-1 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          <X aria-hidden className="size-3.5" />
                          Remove parcel {activeIndex + 1}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Services
                      {onQuote && quote.state === "failed" ? (
                        <span className="ml-2 text-danger normal-case">
                          Quotes didn&apos;t load
                        </span>
                      ) : null}
                    </p>
                    <div
                      role="radiogroup"
                      aria-label="Delivery service"
                      aria-busy={
                        (onQuote && quote.state === "pending") || undefined
                      }
                      className="flex flex-col gap-1.5"
                    >
                      {services.map(serviceRow)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
