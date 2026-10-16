"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  ImageUp,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** A box on the receipt image, as fractions (0–1) of its width and height. */
export type ReceiptRegion = { x: number; y: number; w: number; h: number };

export type ReceiptFieldKey = "merchant" | "date" | "amount" | "category";

export type ReceiptReading = {
  /** The value as it should land in the field (dates as YYYY-MM-DD, amounts as 18.40). */
  value: string;
  /** Where on the image it was read. */
  region: ReceiptRegion;
  /** 0–1: how sure the reader was. */
  confidence: number;
  /** Where it came from, in words: "total line". */
  source?: string;
};

export type ReceiptDoc = {
  /** Image URL. Leave it out to show the receipt drawn in code (the sample). */
  src?: string;
  alt: string;
  /** Width over height. */
  aspect: number;
  fields: Partial<Record<ReceiptFieldKey, ReceiptReading>>;
};

export type ReceiptClaim = {
  merchant: string;
  date: string;
  amount: string;
  category: string;
  note: string;
};

export type ReceiptOutlineStyle = "box" | "corners" | "marker";
export type ReceiptLayout = "side" | "stack" | "flip";

export type ReceiptReaderProps = {
  /** Controlled receipt on show, already read; null shows the drop zone. */
  receipt?: ReceiptDoc | null;
  /** Initial receipt when uncontrolled. Shown already read. @default null */
  defaultReceipt?: ReceiptDoc | null;
  /** Fires when a receipt is dropped, read, or cleared. */
  onReceiptChange?: (receipt: ReceiptDoc | null) => void;
  /** Offered as Use sample: read through the same path as a dropped file. Null hides the button. @default defaultReceiptSample */
  sample?: ReceiptDoc | null;
  /** Your reader: gets the dropped file, resolves with what it read. Without one a dropped file falls back to a blank claim. */
  parse?: (file: File) => Promise<ReceiptDoc>;
  /** A receipt was read, before its values travel into the claim. */
  onParse?: (receipt: ReceiptDoc) => void;
  /** Controlled claim. */
  values?: ReceiptClaim;
  /** Initial claim when uncontrolled. @default blank */
  defaultValues?: Partial<ReceiptClaim>;
  /** Fires from every change to the claim, typed or read, with all of it. */
  onValuesChange?: (values: ReceiptClaim) => void;
  /** Fires when you edit a field, with the field, its value and the claim. */
  onChange?: (
    field: keyof ReceiptClaim,
    value: string,
    values: ReceiptClaim,
  ) => void;
  /** Submit with every required field valid. A promise shows progress; a rejection keeps the claim. */
  onSubmit?: (claim: ReceiptClaim) => void | Promise<void>;
  /** How read regions are marked: rounded boxes, corner brackets, or a highlighter band. @default "box" */
  outlineStyle?: ReceiptOutlineStyle;
  /** Receipt beside the claim, above it, or on its right. Below 30rem it is always above. @default "side" */
  layout?: ReceiptLayout;
  /** Outlines, the scan line, the travelling values and the field wash, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Readings below this confidence land flagged for a check. @default 0.8 */
  confidenceThreshold?: number;
  /** Category choices. @default ["Meals", "Travel", "Lodging", "Supplies", "Other"] */
  categories?: string[];
  /** ISO 4217 code for the amount's symbol and the total. @default "EUR" */
  currency?: string;
  /** How long the sample takes to read, in ms. @default 1400 */
  scanMs?: number;
  /** The form's heading and accessible name. @default "Expense claim" */
  title?: string;
  /** A quiet line under the heading. @default "Claim 0142 · Gaugeworks travel" */
  subtitle?: string;
  /** Panel height in px. @default 520 */
  height?: number;
  /** Nothing can be dropped, edited or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- data --------------------------------- */

/** Lunch at the Coldbrook Canteen, drawn in code; the category is a guess. */
export const defaultReceiptSample: ReceiptDoc = {
  alt: "Receipt from Coldbrook Canteen, 9 October 2026, total 18.40 euros",
  aspect: 240 / 330,
  fields: {
    merchant: {
      value: "Coldbrook Canteen",
      region: { x: 0.058, y: 0.058, w: 0.883, h: 0.07 },
      confidence: 0.97,
      source: "header",
    },
    date: {
      value: "2026-10-09",
      region: { x: 0.058, y: 0.248, w: 0.883, h: 0.052 },
      confidence: 0.93,
      source: "date line",
    },
    category: {
      value: "Meals",
      region: { x: 0.058, y: 0.342, w: 0.883, h: 0.252 },
      confidence: 0.62,
      source: "item lines",
    },
    amount: {
      value: "18.40",
      region: { x: 0.058, y: 0.692, w: 0.883, h: 0.066 },
      confidence: 0.99,
      source: "total line",
    },
  },
};

const DEFAULT_CATEGORIES = ["Meals", "Travel", "Lodging", "Supplies", "Other"];
const BLANK: ReceiptClaim = {
  merchant: "",
  date: "",
  amount: "",
  category: "",
  note: "",
};
const ORDER: ReceiptFieldKey[] = ["merchant", "date", "amount", "category"];
const LABEL: Record<keyof ReceiptClaim, string> = {
  merchant: "Merchant",
  date: "Date",
  amount: "Amount",
  category: "Category",
  note: "Note",
};

/* ------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => `${Number((v * 100).toFixed(3))}%`;

function symbolOf(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

function money(amount: string, currency: string) {
  const n = Number(amount);
  if (!amount.trim() || !Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      Math.round(n * 100) / 100,
    );
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function checkField(key: keyof ReceiptClaim, value: string): string | null {
  const v = value.trim();
  if (key === "note") return null;
  if (!v) return key === "category" ? "Choose one" : "Fill this in";
  if (key === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Use YYYY-MM-DD";
  if (key === "amount") {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "Use an amount like 18.40";
  }
  return null;
}

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const CONTROL_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1";

/* ------------------------------ receipt art ------------------------------ */

const PAPER = "oklch(0.975 0.008 85)";
const INK = "oklch(0.32 0.012 260)";
const RULE = "oklch(0.74 0.01 260)";

/** The torn edge: teeth 12 units wide along the bottom. */
const TORN = (() => {
  const teeth: string[] = [];
  for (let x = 240; x > 0; x -= 12)
    teeth.push(`L ${x - 6} 328 L ${x - 12} 318`);
  return `M 0 0 H 240 V 318 ${teeth.join(" ")} Z`;
})();

const ITEMS: [string, string][] = [
  ["Flat white", "3.20"],
  ["Lentil soup", "6.40"],
  ["Sourdough, butter", "2.80"],
  ["Sparkling water", "2.60"],
  ["Lemon tart", "3.40"],
];

/** The sample receipt, drawn: fixed paper and ink in either theme, like paper. */
function SampleArt() {
  const mono = { fontFamily: "var(--font-mono), ui-monospace, monospace" };
  const rule = (y: number) => (
    <line x1={14} x2={226} y1={y} y2={y} stroke={RULE} strokeDasharray="3 3" />
  );
  return (
    <svg viewBox="0 0 240 330" className="block h-auto w-full" aria-hidden>
      <path d={TORN} fill={PAPER} />
      <g fill={INK} style={mono}>
        <text
          x={120}
          y={36}
          textAnchor="middle"
          fontSize={14}
          fontWeight={700}
          letterSpacing={0.5}
        >
          COLDBROOK CANTEEN
        </text>
        <text x={120} y={52} textAnchor="middle" fontSize={8}>
          12 Fernworks Row · Coldbrook
        </text>
        <text x={120} y={64} textAnchor="middle" fontSize={8}>
          Table 6 · Server Mae
        </text>
        {rule(76)}
        <text x={20} y={95} fontSize={10}>
          2026-10-09
        </text>
        <text x={220} y={95} fontSize={10} textAnchor="end">
          12:41
        </text>
        {rule(106)}
        {ITEMS.map(([name, price], i) => (
          <g key={name}>
            <text x={20} y={126 + i * 16} fontSize={9}>
              {name}
            </text>
            <text x={220} y={126 + i * 16} fontSize={9} textAnchor="end">
              {price}
            </text>
          </g>
        ))}
        {rule(204)}
        <text x={20} y={222} fontSize={9}>
          Subtotal
        </text>
        <text x={220} y={222} fontSize={9} textAnchor="end">
          18.40
        </text>
        <text x={20} y={245} fontSize={12} fontWeight={700}>
          TOTAL EUR
        </text>
        <text x={220} y={245} fontSize={12} fontWeight={700} textAnchor="end">
          18.40
        </text>
        <text x={20} y={262} fontSize={8}>
          Card ending 4417
        </text>
        {rule(276)}
        <text x={120} y={296} textAnchor="middle" fontSize={8.5}>
          Thank you · see you soon
        </text>
      </g>
    </svg>
  );
}

/* -------------------------------- outlines ------------------------------- */

function Outline({
  reading,
  style,
  index,
  step,
  state,
  uncertain,
  motionSafe,
  animateIn,
}: {
  reading: ReceiptReading;
  style: ReceiptOutlineStyle;
  index: number;
  step: number;
  state: "idle" | "active" | "dim";
  uncertain: boolean;
  motionSafe: boolean;
  animateIn: boolean;
}) {
  const { region } = reading;
  const tone = uncertain ? "var(--warn)" : "var(--rr-accent)";
  const strong = state === "active";
  // The box reaches 8px past the region on every side, so a stroke drawn
  // just outside the region survives the reveal's clip.
  const pad = (v: number) => `calc(${pct(v)} - 8px)`;
  const grow = (v: number) => `calc(${pct(v)} + 16px)`;
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: pad(region.x),
        top: pad(region.y),
        width: grow(region.w),
        height: grow(region.h),
      }}
      initial={
        animateIn
          ? motionSafe
            ? { clipPath: "inset(0% 100% 100% 0%)", opacity: 1 }
            : { opacity: 0 }
          : false
      }
      animate={{
        clipPath: "inset(0% 0% 0% 0%)",
        opacity: state === "dim" ? 0.3 : 1,
      }}
      transition={{
        clipPath: {
          duration: durations.base,
          ease: easings.enter,
          delay: index * step,
        },
        opacity: {
          duration: durations.fast,
          delay: animateIn ? index * step : 0,
        },
      }}
    >
      {/* A plain span carries the colour, so a flag cleared by an edit
          repaints at once rather than waiting on motion. */}
      <span className="absolute inset-0" style={{ color: tone }}>
        {style === "box" ? (
          <span
            className={cn(
              "absolute inset-1.5 rounded-1 border-[1.5px] border-current transition-shadow",
              uncertain && "border-dashed",
            )}
            style={{
              backgroundColor: `color-mix(in oklab, ${tone} ${strong ? 14 : 7}%, transparent)`,
              boxShadow: strong
                ? `0 0 0 3px color-mix(in oklab, ${tone} 22%, transparent)`
                : "none",
            }}
          />
        ) : style === "corners" ? (
          <span className="absolute inset-1">
            {(["tl", "tr", "bl", "br"] as const).map((c) => (
              <span
                key={c}
                className={cn(
                  "absolute border-current transition-[width,height]",
                  strong ? "size-3.5" : "size-2.5",
                  c === "tl" &&
                    "top-0 left-0 rounded-tl-1 border-t-2 border-l-2",
                  c === "tr" &&
                    "top-0 right-0 rounded-tr-1 border-t-2 border-r-2",
                  c === "bl" &&
                    "bottom-0 left-0 rounded-bl-1 border-b-2 border-l-2",
                  c === "br" &&
                    "right-0 bottom-0 rounded-br-1 border-r-2 border-b-2",
                )}
              />
            ))}
          </span>
        ) : (
          <span
            className="absolute inset-x-1 inset-y-1.5 rounded-[3px] mix-blend-multiply"
            style={{
              backgroundColor: `color-mix(in oklab, ${tone} ${strong ? 48 : 30}%, transparent)`,
            }}
          />
        )}
        {uncertain ? (
          <span className="absolute top-0 right-0 inline-flex size-4 items-center justify-center rounded-full bg-[oklch(from_var(--warn)_0.8_c_h)] font-mono text-[9px] font-bold text-[oklch(0.25_0.03_80)]">
            ?
          </span>
        ) : null}
      </span>
    </motion.span>
  );
}

/* --------------------------------- chips --------------------------------- */

type Flight = {
  key: string;
  field: ReceiptFieldKey;
  text: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  uncertain: boolean;
};

/**
 * A value in flight from its region to its field. x rides `springs.glide`
 * and y `springs.snap`, so y arrives first with its overshoot and the path
 * bows. Plain numbers are animated and written into the motion values: the
 * chip has only just mounted, and motion would otherwise wait on it.
 */
function Chip({ flight, onLand }: { flight: Flight; onLand: () => void }) {
  const x = useMotionValue(flight.from.x);
  const y = useMotionValue(flight.from.y);
  const land = React.useRef(onLand);
  React.useEffect(() => {
    land.current = onLand;
  });
  React.useEffect(() => {
    x.jump(flight.from.x);
    y.jump(flight.from.y);
    let landed = false;
    const done = () => {
      if (landed) return;
      landed = true;
      land.current();
    };
    const runs: AnimationPlaybackControls[] = [
      animate(flight.from.x, flight.to.x, {
        ...springs.glide,
        delay: flight.delay,
        onUpdate: (v) => x.set(v),
      }),
      animate(flight.from.y, flight.to.y, {
        ...springs.snap,
        delay: flight.delay,
        onUpdate: (v) => y.set(v),
        onComplete: done,
      }),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
  }, [flight, x, y]);
  return (
    <motion.span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 inline-flex h-7 max-w-48 items-center truncate rounded-2 px-2 font-mono text-[12px] text-background shadow-[0_6px_16px_-6px_color-mix(in_oklab,black_40%,transparent)]",
        flight.uncertain
          ? "bg-[oklch(from_var(--warn)_0.62_c_h)]"
          : "bg-(--rr-accent)",
      )}
      style={{ x, y }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: { duration: durations.fast, delay: flight.delay },
        scale: { ...springs.flick, delay: flight.delay },
      }}
    >
      {flight.text}
    </motion.span>
  );
}

/* --------------------------------- form --------------------------------- */

type Phase = "empty" | "reading" | "landing" | "read" | "failed";
type Send = "idle" | "sending" | "sent" | "failed";

/**
 * An expense claim that fills itself from a receipt. Drop an image (or choose
 * one, or try the sample) and a scanning line sweeps the receipt while your
 * reader works; when it answers, each place it read is outlined on the
 * receipt in a `cascade()` and its value lifts out as a small chip that
 * travels into its field — x on `springs.glide`, y on `springs.snap`, so the
 * path bows — landing with an accent wash. Readings the reader was unsure of
 * land flagged for a check. Focusing or hovering a field later lights its
 * region again while the others dim, panning the receipt to it if it is out
 * of view.
 *
 * Every value stays editable, and an edit clears the flag. Tab moves field to
 * field; the drop zone's Choose file is a real file input, so nothing needs a
 * drag. Reading, success and failure are announced; a failed read keeps the
 * image and falls back to a blank claim with focus on Merchant. Below 30rem
 * the receipt sits above the fields. Under reduced motion the scan line is a
 * still band, outlines appear whole and values cross-fade into their fields.
 */
export function ReceiptReader({
  receipt,
  defaultReceipt = null,
  onReceiptChange,
  sample = defaultReceiptSample,
  parse,
  onParse,
  values,
  defaultValues,
  onValuesChange,
  onChange,
  onSubmit,
  outlineStyle = "box",
  layout = "side",
  accent = "var(--accent-bright)",
  confidenceThreshold = 0.8,
  categories = DEFAULT_CATEGORIES,
  currency = "EUR",
  scanMs = 1400,
  title = "Expense claim",
  subtitle = "Claim 0142 · Gaugeworks travel",
  height = 520,
  disabled = false,
  className,
}: ReceiptReaderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const fileId = `${uid}-file`;

  const [ownDoc, setOwnDoc] = React.useState<ReceiptDoc | null>(defaultReceipt);
  const doc = receipt !== undefined ? receipt : ownDoc;
  const [ownValues, setOwnValues] = React.useState<ReceiptClaim>(() => ({
    ...BLANK,
    ...defaultValues,
  }));
  const claim = values ?? ownValues;

  const [phase, setPhase] = React.useState<Phase>(doc ? "read" : "empty");
  const [landed, setLanded] = React.useState<Set<ReceiptFieldKey>>(
    () => new Set(doc ? ORDER.filter((k) => doc.fields[k]) : []),
  );
  const [checked, setChecked] = React.useState<Set<ReceiptFieldKey>>(
    () => new Set(),
  );
  const [fresh, setFresh] = React.useState(false);
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [washes, setWashes] = React.useState<Record<string, number>>({});
  const [active, setActive] = React.useState<keyof ReceiptClaim | null>(null);
  const [hot, setHot] = React.useState(false);
  const [send, setSend] = React.useState<Send>("idle");
  const [showErrors, setShowErrors] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [url, setUrl] = React.useState<string | null>(null);
  const [visible, setVisible] = React.useState(true);
  const [runId, setRunId] = React.useState(0);
  const [natural, setNatural] = React.useState<number | null>(null);
  const landedCount = React.useRef(0);
  const expected = React.useRef(0);

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const artRef = React.useRef<HTMLDivElement | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const inputs = React.useRef(new Map<keyof ReceiptClaim, HTMLElement>());
  const claimRef = React.useRef(claim);
  React.useEffect(() => {
    claimRef.current = claim;
  });
  const timers = React.useRef<number[]>([]);
  const pan = React.useRef<AnimationPlaybackControls | null>(null);
  const token = React.useRef(0);
  const alive = React.useRef(false);

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const t of pending) window.clearTimeout(t);
      pan.current?.stop();
    };
  }, []);

  // A dropped file's preview URL lives exactly as long as it is on show.
  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  // The scan loop runs only while reading, on screen and with the page shown.
  React.useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const io = new IntersectionObserver(([entry]) => {
      inView = !!entry?.isIntersecting;
      update();
    });
    io.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const writeClaim = (next: ReceiptClaim) => {
    claimRef.current = next;
    if (values === undefined) setOwnValues(next);
    onValuesChange?.(next);
  };

  const changeDoc = (next: ReceiptDoc | null) => {
    if (receipt === undefined) setOwnDoc(next);
    onReceiptChange?.(next);
  };

  /* ------------------------------ landing ------------------------------ */

  const rectIn = (el: Element | null | undefined) => {
    const panel = panelRef.current;
    if (!el || !panel) return null;
    const p = panel.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height };
  };

  const settleFields = (read: ReceiptDoc, n: number) => {
    const unsure = ORDER.filter(
      (k) => (read.fields[k]?.confidence ?? 1) < confidenceThreshold,
    ).length;
    setPhase("read");
    setAnnouncement(
      `Read ${n} ${n === 1 ? "field" : "fields"} from the receipt.${
        unsure ? ` ${unsure} ${unsure === 1 ? "needs" : "need"} a check.` : ""
      }`,
    );
  };

  const land = (key: ReceiptFieldKey, value: string) => {
    if (!alive.current) return;
    writeClaim({ ...claimRef.current, [key]: value });
    setLanded((prev) => new Set(prev).add(key));
    setWashes((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  };

  /** The readings arrive: outlines draw, then each value flies to its field. */
  const arrive = (parsed: ReceiptDoc, run: number) => {
    const keys = ORDER.filter((k) => parsed.fields[k]);
    onParse?.(parsed);
    setPhase("landing");
    landedCount.current = 0;
    setFresh(true);
    setChecked(new Set());
    setLanded(new Set());
    const step = cascade(keys.length);
    if (!motionSafe) {
      let next = { ...claimRef.current };
      for (const k of keys)
        next = { ...next, [k]: parsed.fields[k]?.value ?? "" };
      writeClaim(next);
      setLanded(new Set(keys));
      setWashes((prev) => {
        const out = { ...prev };
        for (const k of keys) out[k] = (out[k] ?? 0) + 1;
        return out;
      });
      settleFields(parsed, keys.length);
      return;
    }
    // Outlines first; the values leave once every outline is drawn.
    later(
      () => {
        if (token.current !== run || !alive.current) return;
        const art = artRef.current;
        const view = viewRef.current;
        const a = rectIn(art);
        const v = rectIn(view);
        const out: Flight[] = [];
        keys.forEach((k, i) => {
          const reading = parsed.fields[k];
          const field = rectIn(inputs.current.get(k));
          if (!reading || !a || !field || !v) return;
          const ry = a.y + (reading.region.y + reading.region.h / 2) * a.h - 14;
          out.push({
            key: `${run}-${k}`,
            field: k,
            text:
              k === "amount"
                ? money(reading.value, currency) || reading.value
                : reading.value,
            from: {
              x: r2(a.x + reading.region.x * a.w + 4),
              y: r2(Math.min(Math.max(ry, v.y - 6), v.y + v.h - 22)),
            },
            to: { x: r2(field.x + 8), y: r2(field.y + field.h / 2 - 14) },
            delay: r2(i * 0.12),
            uncertain: reading.confidence < confidenceThreshold,
          });
        });
        expected.current = out.length;
        setFlights(out);
        if (out.length === 0) {
          keys.forEach((k) => land(k, parsed.fields[k]?.value ?? ""));
          settleFields(parsed, keys.length);
        }
      },
      Math.round((keys.length * step + durations.base) * 1000),
    );
  };

  const read = (next: ReceiptDoc, work: Promise<ReceiptDoc>) => {
    token.current += 1;
    const run = token.current;
    setRunId(run);
    setNatural(null);
    setFlights([]);
    setPhase("reading");
    setSend("idle");
    setShowErrors(false);
    changeDoc(next);
    setAnnouncement("Reading the receipt.");
    work.then(
      (doc2) => {
        if (!alive.current || token.current !== run) return;
        const parsed = { ...doc2, src: doc2.src ?? next.src };
        changeDoc(parsed);
        arrive(parsed, run);
      },
      () => {
        if (!alive.current || token.current !== run) return;
        setPhase("failed");
        setFresh(false);
        setLanded(new Set());
        writeClaim({ ...BLANK, note: claimRef.current.note });
        setAnnouncement(
          "Couldn't read this receipt. Fill the claim in yourself.",
        );
        later(
          () => inputs.current.get("merchant")?.focus({ preventScroll: true }),
          30,
        );
      },
    );
  };

  const readSample = () => {
    if (!sample || disabled) return;
    setUrl(null);
    read(
      { ...sample, fields: {} },
      new Promise<ReceiptDoc>((resolve) =>
        later(() => resolve(sample), scanMs),
      ),
    );
  };

  const takeFile = (file: File | undefined) => {
    if (!file || disabled) return;
    if (!file.type.startsWith("image/")) {
      setAnnouncement(
        "That isn't an image. Drop a photo or scan of the receipt.",
      );
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    const shown: ReceiptDoc = {
      src: next,
      alt: `Your receipt, ${file.name}`,
      aspect: 0.72,
      fields: {},
    };
    read(
      shown,
      parse ? parse(file) : Promise.reject(new Error("No reader connected")),
    );
  };

  const clear = () => {
    token.current += 1;
    setRunId(token.current);
    setFlights([]);
    setUrl(null);
    changeDoc(null);
    setPhase("empty");
    setFresh(false);
    // Values the reader put there go with the receipt; your own edits stay.
    const kept = { ...claimRef.current };
    for (const k of landed) if (!checked.has(k)) kept[k] = "";
    writeClaim(kept);
    setLanded(new Set());
    setChecked(new Set());
    setAnnouncement("Receipt removed.");
  };

  /* -------------------------------- edits -------------------------------- */

  const edit = (key: keyof ReceiptClaim, value: string) => {
    const next = { ...claim, [key]: value };
    writeClaim(next);
    onChange?.(key, value, next);
    if (key !== "note" && landed.has(key) && !checked.has(key)) {
      setChecked((prev) => new Set(prev).add(key));
    }
    if (send !== "idle" && send !== "sending") setSend("idle");
  };

  // Focusing a field lights its region and pans the receipt to it.
  const focusField = (key: keyof ReceiptClaim) => {
    setActive(key);
    const reading = key === "note" ? undefined : doc?.fields[key];
    const view = viewRef.current;
    const art = artRef.current;
    if (!reading || !view || !art) return;
    const top = art.offsetTop + reading.region.y * art.offsetHeight;
    const bottom = top + reading.region.h * art.offsetHeight;
    if (
      top >= view.scrollTop + 8 &&
      bottom <= view.scrollTop + view.clientHeight - 8
    )
      return;
    const to = Math.round(
      Math.min(
        Math.max(0, (top + bottom) / 2 - view.clientHeight / 2),
        view.scrollHeight - view.clientHeight,
      ),
    );
    pan.current?.stop();
    if (!motionSafe) {
      view.scrollTop = to;
      return;
    }
    pan.current = animate(view.scrollTop, to, {
      ...springs.glide,
      onUpdate: (v) => {
        view.scrollTop = v;
      },
    });
  };

  /* -------------------------------- submit ------------------------------- */

  const errors = Object.fromEntries(
    (Object.keys(LABEL) as (keyof ReceiptClaim)[]).map((k) => [
      k,
      showErrors ? checkField(k, claim[k]) : null,
    ]),
  ) as Record<keyof ReceiptClaim, string | null>;

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (disabled || send === "sending") return;
    setShowErrors(true);
    const bad = (Object.keys(LABEL) as (keyof ReceiptClaim)[]).filter(
      (k) => checkField(k, claim[k]) !== null,
    );
    if (bad.length > 0) {
      const first = bad[0];
      if (first) inputs.current.get(first)?.focus();
      setAnnouncement(
        `${bad.length === 1 ? "1 field needs" : `${bad.length} fields need`} attention: ${bad
          .map((k) => LABEL[k])
          .join(", ")}.`,
      );
      return;
    }
    const snapshot = { ...claim };
    setSend("sending");
    setAnnouncement("Sending the claim.");
    let result: void | Promise<void> = undefined;
    try {
      result = onSubmit?.(snapshot);
    } catch {
      setSend("failed");
      setAnnouncement("Couldn't send the claim. Nothing was lost.");
      return;
    }
    Promise.resolve(result).then(
      () => {
        if (!alive.current) return;
        setSend("sent");
        setAnnouncement(`Claim sent for ${money(snapshot.amount, currency)}.`);
      },
      () => {
        if (!alive.current) return;
        setSend("failed");
        setAnnouncement("Couldn't send the claim. Nothing was lost.");
      },
    );
  };

  const fill = useMotionValue(0);
  React.useEffect(() => {
    if (send === "sending") {
      fill.jump(0);
      const r = animate(fill, 0.85, {
        duration: motionSafe ? 3 : 1.5,
        ease: [0.12, 0.7, 0.3, 1],
      });
      return () => r.stop();
    }
    const r =
      send === "sent"
        ? animate(fill, 1, { duration: durations.base, ease: easings.enter })
        : animate(fill, 0, exitFor(durations.slow));
    return () => r.stop();
  }, [fill, motionSafe, send]);

  /* -------------------------------- render ------------------------------- */

  const symbol = symbolOf(currency);
  const keys = doc ? ORDER.filter((k) => doc.fields[k]) : [];
  const unsure = keys.filter(
    (k) =>
      (doc?.fields[k]?.confidence ?? 1) < confidenceThreshold &&
      !checked.has(k),
  );
  const step = cascade(keys.length);
  const scanning = phase === "reading" && visible && motionSafe;
  const shownOutlines = phase === "read" || phase === "landing";
  const flip = layout === "flip";
  const stack = layout === "stack";

  const headline =
    phase === "empty"
      ? "Waiting for a receipt"
      : phase === "reading"
        ? "Reading…"
        : phase === "failed"
          ? "Read failed"
          : unsure.length
            ? `${keys.length} read · ${unsure.length} to check`
            : `${keys.length} fields read`;

  const field = (key: keyof ReceiptClaim) => {
    const id = `${uid}-${key}`;
    const reading = key === "note" ? undefined : doc?.fields[key];
    const hasReading = !!reading && landed.has(key as ReceiptFieldKey);
    const isUnsure =
      hasReading &&
      reading.confidence < confidenceThreshold &&
      !checked.has(key as ReceiptFieldKey);
    const metaId = `${id}-meta`;
    const errId = `${id}-error`;
    const err = errors[key];
    const describedBy =
      [hasReading ? metaId : null, err ? errId : null]
        .filter(Boolean)
        .join(" ") || undefined;
    const box = cn(
      "relative w-full rounded-2 border bg-background text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
      CONTROL_RING,
      err
        ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
        : isUnsure
          ? "border-[color-mix(in_oklab,var(--warn)_60%,transparent)]"
          : active === key && hasReading
            ? "border-[color-mix(in_oklab,var(--rr-accent)_60%,transparent)]"
            : "border-input hover:border-hairline-strong",
    );
    const shared = {
      id,
      disabled,
      "aria-describedby": describedBy,
      "aria-invalid": err ? true : undefined,
      "aria-required": key !== "note" ? true : undefined,
      onFocus: () => focusField(key),
      onBlur: () => setActive((a) => (a === key ? null : a)),
    };
    return (
      <div
        key={key}
        className={cn(
          "flex min-w-0 flex-col gap-1",
          key === "note" && "@min-[30rem]:col-span-2",
        )}
        onPointerEnter={() => {
          if (doc?.fields[key as ReceiptFieldKey]) setActive(key);
        }}
        onPointerLeave={() => {
          const focused = inputs.current.get(key) === document.activeElement;
          if (!focused) setActive((a) => (a === key ? null : a));
        }}
      >
        <div className="flex items-center gap-2">
          <label
            htmlFor={id}
            className="text-[12.5px] font-medium text-foreground"
          >
            {LABEL[key]}
            {key === "note" ? (
              <span className="ml-1.5 font-normal text-ink-3">optional</span>
            ) : null}
          </label>
          {isUnsure ? (
            <span className="inline-flex h-4.5 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] px-1.5 text-[10.5px] font-medium text-warn">
              <TriangleAlert aria-hidden className="size-3" />
              Check
            </span>
          ) : null}
        </div>
        <div className="relative">
          {key === "category" ? (
            <span className="relative block">
              <select
                {...shared}
                ref={(node) => {
                  if (node) inputs.current.set(key, node);
                }}
                value={claim.category}
                onChange={(e) => edit("category", e.currentTarget.value)}
                className={cn(box, "h-9 appearance-none pr-8 pl-3")}
              >
                <option value="">Choose…</option>
                {[
                  ...new Set([
                    ...categories,
                    ...(claim.category ? [claim.category] : []),
                  ]),
                ].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
              />
            </span>
          ) : key === "note" ? (
            <textarea
              {...shared}
              ref={(node) => {
                if (node) inputs.current.set(key, node);
              }}
              rows={2}
              value={claim.note}
              placeholder="Client lunch with the Basinworks team"
              onChange={(e) => edit("note", e.currentTarget.value)}
              className={cn(box, "block resize-y px-3 py-2 leading-5")}
            />
          ) : (
            <span className="relative block">
              {key === "amount" ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 z-[1] -translate-y-1/2 font-mono text-[13px] text-ink-3"
                >
                  {symbol}
                </span>
              ) : null}
              <input
                {...shared}
                ref={(node) => {
                  if (node) inputs.current.set(key, node);
                }}
                type="text"
                inputMode={
                  key === "amount"
                    ? "decimal"
                    : key === "date"
                      ? "numeric"
                      : undefined
                }
                autoComplete="off"
                value={claim[key]}
                placeholder={
                  key === "date"
                    ? "YYYY-MM-DD"
                    : key === "amount"
                      ? "0.00"
                      : "Who was paid"
                }
                onChange={(e) => edit(key, e.currentTarget.value)}
                onBlur={(e) => {
                  shared.onBlur();
                  if (key === "amount") {
                    const n = Number(e.currentTarget.value);
                    if (
                      e.currentTarget.value.trim() &&
                      Number.isFinite(n) &&
                      n > 0
                    ) {
                      const tidy = n.toFixed(2);
                      if (tidy !== claim.amount) edit("amount", tidy);
                    }
                  }
                }}
                className={cn(
                  box,
                  "h-9 pr-3",
                  key === "amount" ? "pl-7 font-mono tabular-nums" : "pl-3",
                  key === "date" && "font-mono tabular-nums",
                )}
              />
            </span>
          )}
          <AnimatePresence>
            {washes[key] ? (
              <motion.span
                key={washes[key]}
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--rr-accent)_16%,transparent)]"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: easings.linear }}
              />
            ) : null}
          </AnimatePresence>
        </div>
        {hasReading ? (
          <p
            id={metaId}
            className={cn(
              "text-[11px] leading-4",
              checked.has(key as ReceiptFieldKey)
                ? "text-success"
                : isUnsure
                  ? "text-warn"
                  : "text-ink-3",
            )}
          >
            {checked.has(key as ReceiptFieldKey)
              ? "Checked by you"
              : isUnsure
                ? `Read at ${Math.round(reading.confidence * 100)}% confidence from the ${reading.source ?? "receipt"}; check it`
                : `Read from the ${reading.source ?? "receipt"} · ${Math.round(reading.confidence * 100)}%`}
          </p>
        ) : null}
        {err ? (
          <p
            id={errId}
            className="flex items-start gap-1.5 text-[11.5px] leading-4 text-danger"
          >
            <CircleAlert aria-hidden className="mt-px size-3 shrink-0" />
            {err}
          </p>
        ) : null}
      </div>
    );
  };

  const receiptColumn = (
    <div
      className={cn(
        "relative flex min-w-0 flex-1 flex-col gap-2 overflow-hidden border-b border-hairline p-3",
        !stack && "@min-[30rem]:border-b-0",
        flip ? "@min-[30rem]:border-l" : !stack && "@min-[30rem]:border-r",
      )}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setHot(true);
      }}
      onDragLeave={(e) => {
        // Moving between the column's own children is not leaving it.
        const into = e.relatedTarget;
        if (!(into instanceof Node) || !e.currentTarget.contains(into))
          setHot(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setHot(false);
        takeFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileRef}
        id={fileId}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden
        className="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          takeFile(file);
        }}
      />
      {doc ? (
        <div
          className={cn(
            "relative flex flex-col overflow-hidden",
            !stack && "@min-[30rem]:flex-1",
          )}
        >
          <div
            ref={viewRef}
            className={cn(
              "relative overflow-x-hidden overflow-y-auto overscroll-contain rounded-3 bg-surface-2 p-3",
              "max-h-[168px]",
              stack
                ? "@min-[30rem]:max-h-[168px]"
                : "@min-[30rem]:max-h-none @min-[30rem]:flex-1",
              hot &&
                "outline-2 outline-offset-2 outline-(--rr-accent) outline-dashed",
            )}
          >
            <div
              ref={artRef}
              className={cn(
                "relative mx-auto w-full",
                stack ? "max-w-[300px]" : "max-w-[260px]",
              )}
              style={{ aspectRatio: String(r2(natural ?? doc.aspect)) }}
            >
              {doc.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={doc.src}
                  alt={doc.alt}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      setNatural(img.naturalWidth / img.naturalHeight);
                    }
                  }}
                  className="block size-full rounded-1 object-contain"
                />
              ) : (
                <div role="img" aria-label={doc.alt}>
                  <SampleArt />
                </div>
              )}
              {shownOutlines
                ? keys.map((k, i) => {
                    const reading = doc.fields[k];
                    if (!reading) return null;
                    return (
                      <Outline
                        key={`${k}-${runId}`}
                        reading={reading}
                        style={outlineStyle}
                        index={i}
                        step={step}
                        state={
                          active === null
                            ? "idle"
                            : active === k
                              ? "active"
                              : "dim"
                        }
                        uncertain={
                          reading.confidence < confidenceThreshold &&
                          !checked.has(k)
                        }
                        motionSafe={motionSafe}
                        animateIn={fresh}
                      />
                    );
                  })
                : null}
              {phase === "reading" ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                >
                  <motion.span
                    className="absolute inset-x-0 h-12"
                    style={{
                      backgroundImage:
                        "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--rr-accent) 22%, transparent) 70%, color-mix(in oklab, var(--rr-accent) 90%, transparent) 96%, transparent)",
                    }}
                    initial={{ top: "-12%" }}
                    animate={
                      scanning ? { top: ["-12%", "100%"] } : { top: "-12%" }
                    }
                    transition={
                      scanning
                        ? {
                            duration: 1.3,
                            ease: easings.linear,
                            repeat: Infinity,
                          }
                        : { duration: 0 }
                    }
                  />
                  {!motionSafe ? (
                    <span className="absolute inset-x-0 top-0 flex h-7 items-center justify-center bg-[color-mix(in_oklab,var(--rr-accent)_85%,transparent)] text-[11px] font-medium text-background">
                      Reading…
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            aria-label="Use another receipt"
            title="Use another receipt"
            className={cn(
              "absolute top-1.5 right-1.5 z-10 inline-flex size-7 items-center justify-center rounded-full border border-hairline bg-card text-ink-2 shadow-[0_1px_3px_color-mix(in_oklab,black_12%,transparent)] transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
              RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ) : (
        <div
          role="group"
          aria-label="Add a receipt"
          className={cn(
            "flex flex-1 flex-col items-center-safe justify-center-safe gap-3 rounded-3 border border-dashed p-4 text-center transition-colors",
            stack && "@min-[30rem]:flex-row @min-[30rem]:text-left",
            hot
              ? "border-(--rr-accent) bg-[color-mix(in_oklab,var(--rr-accent)_7%,transparent)]"
              : "border-hairline-strong bg-surface-0",
          )}
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
            <ImageUp aria-hidden className="size-5" />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">
              Drop a receipt here
            </span>
            <span className="text-[11.5px] text-ink-3">
              A photo or scan, PNG or JPG
            </span>
          </span>
          <span className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              className={cn(
                "inline-flex h-8 items-center rounded-2 border border-hairline-strong bg-card px-3 text-[12.5px] font-medium transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
                RING,
              )}
            >
              Choose file
            </button>
            {sample ? (
              <button
                type="button"
                disabled={disabled}
                onClick={readSample}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 px-3 text-[12.5px] font-medium text-(--rr-accent) transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
                  RING,
                )}
              >
                Use sample
              </button>
            ) : null}
          </span>
        </div>
      )}
    </div>
  );

  const claimColumn = (
    <div className="flex min-w-0 flex-col overflow-y-auto overscroll-contain p-4">
      <AnimatePresence initial={false}>
        {phase === "failed" || send === "failed" || send === "sent" ? (
          <motion.div
            key={
              send === "sent"
                ? "sent"
                : send === "failed"
                  ? "send-failed"
                  : "read-failed"
            }
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
            className={cn(
              "mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-3 border px-3 py-2.5 text-[12.5px]",
              send === "sent"
                ? "border-[color-mix(in_oklab,var(--rr-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--rr-accent)_7%,var(--card))]"
                : "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))]",
            )}
          >
            {send === "sent" ? (
              <>
                <Check
                  aria-hidden
                  strokeWidth={2.5}
                  className="size-4 shrink-0 text-(--rr-accent)"
                />
                <span className="min-w-0 flex-1">
                  Claim sent for {money(claim.amount, currency)}. Finance pays
                  out on Friday.
                </span>
              </>
            ) : send === "failed" ? (
              <>
                <CircleAlert
                  aria-hidden
                  className="size-4 shrink-0 text-danger"
                />
                <span className="min-w-0 flex-1">
                  Couldn&apos;t send the claim. Nothing was lost.
                </span>
                <button
                  type="button"
                  onClick={() => submit()}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-[12px] font-medium transition-colors hover:bg-surface-2",
                    RING,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              </>
            ) : (
              <>
                <CircleAlert
                  aria-hidden
                  className="size-4 shrink-0 text-danger"
                />
                <span className="min-w-0 flex-1">
                  Couldn&apos;t read this receipt. Fill the claim in yourself.
                </span>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 @min-[30rem]:grid-cols-2">
        {(["merchant", "date", "amount", "category", "note"] as const).map(
          field,
        )}
      </div>
    </div>
  );

  return (
    <div className={cn("@container w-full", className)}>
      <div
        ref={panelRef}
        className="relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
        style={{ height, "--rr-accent": accent } as React.CSSProperties}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] leading-5 font-semibold">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-[12px] leading-4 text-ink-3">{subtitle}</p>
            ) : null}
          </div>
          <span
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px]",
              phase === "failed"
                ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] text-danger"
                : unsure.length && phase === "read"
                  ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] text-warn"
                  : "border-hairline bg-surface-0 text-ink-2",
            )}
          >
            {phase === "reading" ? (
              <ScanLine aria-hidden className="size-3 text-(--rr-accent)" />
            ) : null}
            {headline}
          </span>
        </header>

        <form
          noValidate
          aria-labelledby={titleId}
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div
            className={cn(
              "grid flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden",
              stack
                ? ""
                : flip
                  ? "@min-[30rem]:grid-cols-[minmax(0,1fr)_minmax(0,40%)] @min-[30rem]:grid-rows-1"
                  : "@min-[30rem]:grid-cols-[minmax(0,40%)_minmax(0,1fr)] @min-[30rem]:grid-rows-1",
            )}
          >
            {flip ? (
              <>
                <div className="order-2 flex min-w-0 flex-col overflow-hidden @min-[30rem]:order-1">
                  {claimColumn}
                </div>
                <div className="order-1 flex min-w-0 flex-col overflow-hidden @min-[30rem]:order-2">
                  {receiptColumn}
                </div>
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-col overflow-hidden">
                  {receiptColumn}
                </div>
                <div className="flex min-w-0 flex-col overflow-hidden">
                  {claimColumn}
                </div>
              </>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
            <span className="mr-auto font-mono text-[12px] text-ink-2 tabular-nums">
              {money(claim.amount, currency) || `${symbol} —`}
            </span>
            <button
              type="submit"
              disabled={disabled}
              aria-disabled={send === "sending" || undefined}
              aria-busy={send === "sending" || undefined}
              className={cn(
                "relative inline-flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-2 bg-foreground px-4 text-[13px] font-medium text-background disabled:cursor-not-allowed disabled:opacity-50",
                RING,
                send === "sending" && "cursor-progress",
              )}
            >
              <motion.span
                aria-hidden
                className="absolute inset-0 bg-[color-mix(in_oklab,var(--rr-accent)_70%,transparent)]"
                style={{ scaleX: fill, originX: 0 }}
              />
              <span className="relative inline-flex items-center gap-1.5">
                {send === "sending" ? (
                  <LoaderCircle
                    aria-hidden
                    className={cn("size-3.5", motionSafe && "animate-spin")}
                  />
                ) : send === "sent" ? (
                  <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
                ) : null}
                {send === "sending"
                  ? "Sending…"
                  : send === "sent"
                    ? "Sent"
                    : "Submit claim"}
              </span>
            </button>
          </footer>
        </form>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
        >
          <AnimatePresence>
            {flights.map((flight) => (
              <Chip
                key={flight.key}
                flight={flight}
                onLand={() => {
                  const reading = doc?.fields[flight.field];
                  land(flight.field, reading?.value ?? flight.text);
                  setFlights((prev) =>
                    prev.filter((f) => f.key !== flight.key),
                  );
                  landedCount.current += 1;
                  if (landedCount.current === expected.current && doc) {
                    settleFields(doc, expected.current);
                  }
                }}
              />
            ))}
          </AnimatePresence>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </div>
  );
}
