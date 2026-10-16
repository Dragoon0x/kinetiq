"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
} from "motion/react";
import { Coins, RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type CreditRefillGaugeStyle = "vial" | "orb" | "bar";
export type CreditRefillDensity = "compact" | "cozy" | "roomy";
export type CreditRefillAccentName = "cobalt" | "mint" | "amber" | "ink";
export type CreditRefillStatus = "ready" | "loading" | "error";

export type CreditRefillPack = {
  id: string;
  /** Credits bought. */
  credits: number;
  /** What it costs, in the currency `formatMoney` writes. */
  price: number;
  /** Extra credits that come with it. */
  bonus?: number;
};

type Async = void | Promise<unknown>;

export type CreditRefillProps = {
  /** Credits left right now. @default 312 */
  balance?: number;
  /** Credits used per hour at the current pace; the runway is balance ÷ rate. @default 144 */
  rate?: number;
  /** The packs on offer, smallest first. @default defaultCreditRefillPacks */
  packs?: CreditRefillPack[];
  /** Controlled chosen pack id. */
  value?: string;
  /** Initial pack when uncontrolled. @default the second pack */
  defaultValue?: string;
  /** Fires from the press or key that chose a pack. */
  onValueChange?: (id: string) => void;
  /** Controlled auto-recharge. */
  autoRecharge?: boolean;
  /** Initial auto-recharge when uncontrolled. @default false */
  defaultAutoRecharge?: boolean;
  /** Fires when auto-recharge is switched, with the threshold it will use. */
  onAutoRechargeChange?: (on: boolean, threshold: number) => void;
  /** Controlled threshold: top up when credits fall below this. */
  threshold?: number;
  /** Initial threshold when uncontrolled. @default 200 */
  defaultThreshold?: number;
  /** Fires as the threshold slider settles on a new step. */
  onThresholdChange?: (threshold: number) => void;
  /** The threshold slider's top end. Steps are 50 credits. @default 1000 */
  thresholdMax?: number;
  /** Buy was pressed. Return a promise to hold the button; a rejection keeps the pack chosen and shows its message. */
  onBuy?: (pack: CreditRefillPack) => Async;
  /** Controlled open state of the sheet. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default true */
  defaultOpen?: boolean;
  /** Fires when the sheet is dismissed or reopened. */
  onOpenChange?: (open: boolean) => void;
  /** The sheet was dismissed (the close button, Escape, or Close after a buy). */
  onDismiss?: () => void;
  /** Where the charge goes, in words. @default "Card ending 4417" */
  paymentMethod?: string;
  /** The moment the runway counts from, in ms; adds "until about 16:40". */
  now?: number;
  /** Whether the packs have arrived. @default "ready" */
  status?: CreditRefillStatus;
  /** "Try again" was pressed after the packs failed to load. */
  onRetry?: () => void;
  /** The work the sheet sits over; it stays usable behind it. */
  children?: React.ReactNode;
  /** The gauge: a tall vial, a round flask, or a wide capsule. @default "vial" */
  gaugeStyle?: CreditRefillGaugeStyle;
  /** Padding, gaps and type size. @default "cozy" */
  density?: CreditRefillDensity;
  /** The liquid, the selection and Buy: a named pigment or any CSS colour. @default "cobalt" */
  accent?: CreditRefillAccentName | (string & {});
  /** How a price is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Buying and auto-recharge are unavailable; the sheet can still be read and dismissed. @default false */
  disabled?: boolean;
  /** Classes for the frame; a height class (h-96) replaces its default 35rem. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultCreditRefillPacks: CreditRefillPack[] = [
  { id: "pack-500", credits: 500, price: 5 },
  { id: "pack-2000", credits: 2000, price: 18, bonus: 100 },
  { id: "pack-5000", credits: 5000, price: 40, bonus: 400 },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const grouping = new Intl.NumberFormat("en-US");
const count = (n: number) => grouping.format(Math.round(n));
const defaultMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const total = (pack: CreditRefillPack) => pack.credits + (pack.bonus ?? 0);
const STEP = 50;

/** "about 2 h 10 min": five-minute steps under ten hours, whole hours past it. */
const runway = (credits: number, rate: number): string => {
  if (rate <= 0) return "with no recent use";
  const minutes = Math.round((credits / rate) * 60);
  if (minutes < 60) return `about ${Math.max(1, minutes)} min`;
  if (minutes >= 600) return `about ${Math.round(minutes / 60)} h`;
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 5) * 5;
  if (m === 0) return `about ${h} h`;
  if (m === 60) return `about ${h + 1} h`;
  return `about ${h} h ${m} min`;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * When the credits run out, on a fixed 24-hour UTC clock (a locale lookup
 * would not survive hydration): "16:40", "07:15 tomorrow", "Fri 09:00".
 */
const until = (from: number, to: number) => {
  const d = new Date(to);
  const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const days = Math.floor(to / 86_400_000) - Math.floor(from / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `${time} tomorrow`;
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${time}`;
};

/** Capacity rounds up to a step that reads: 500s below 5,000, then 1,000s. */
const niceCeil = (v: number) => {
  const step = v <= 5000 ? 500 : 1000;
  return Math.max(step, Math.ceil(v / step) * step);
};

/**
 * Accent as five custom properties. The liquid and the mint and amber fills
 * are pigment — the token's hue and chroma at a fixed lightness — because the
 * status tokens are tuned for text and a filled shape in them goes muddy on a
 * light page. Any other CSS colour is used as given.
 */
const ACCENTS: Record<CreditRefillAccentName, Record<string, string>> = {
  cobalt: {
    "--cr-ink": "var(--accent-bright)",
    "--cr-liquid": "oklch(from var(--accent-bright) 0.64 c h)",
    "--cr-fill": "var(--primary)",
    "--cr-on": "var(--primary-foreground)",
  },
  mint: {
    "--cr-ink": "var(--success)",
    "--cr-liquid": "oklch(from var(--success) 0.74 c h)",
    "--cr-fill": "oklch(from var(--success) 0.74 c h)",
    "--cr-on": "oklch(from var(--success) 0.24 0.05 h)",
  },
  amber: {
    "--cr-ink": "var(--warn)",
    "--cr-liquid": "oklch(from var(--warn) 0.8 c h)",
    "--cr-fill": "oklch(from var(--warn) 0.8 c h)",
    "--cr-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  ink: {
    "--cr-ink": "var(--ink-2)",
    "--cr-liquid": "oklch(from var(--ink-2) 0.62 0.02 h)",
    "--cr-fill": "var(--foreground)",
    "--cr-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties => {
  const named = ACCENTS[accent as CreditRefillAccentName];
  const vars = named ?? {
    "--cr-ink": accent,
    "--cr-liquid": accent,
    "--cr-fill": accent,
    "--cr-on": "var(--primary-foreground)",
  };
  return {
    ...vars,
    "--cr-wash": "color-mix(in oklab, var(--cr-ink) 10%, transparent)",
    "--cr-band": "color-mix(in oklab, var(--cr-liquid) 56%, white)",
    "--cr-shine": "color-mix(in oklab, var(--cr-liquid) 28%, white)",
  } as React.CSSProperties;
};

const DENSITY: Record<
  CreditRefillDensity,
  { pad: string; gap: string; text: string; meta: string; packPad: string }
> = {
  compact: {
    pad: "px-3.5 py-3",
    gap: "gap-3",
    text: "text-[13px] leading-5",
    meta: "text-[11px] leading-4",
    packPad: "px-2 py-1.5",
  },
  cozy: {
    pad: "px-4 py-4",
    gap: "gap-4",
    text: "text-[13px] leading-5",
    meta: "text-[12px] leading-4",
    packPad: "px-2.5 py-2",
  },
  roomy: {
    pad: "px-5 py-5",
    gap: "gap-5",
    text: "text-[14px] leading-5",
    meta: "text-[12px] leading-[18px]",
    packPad: "px-3 py-2.5",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const EYEBROW =
  "font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase";

/* ----------------------------------------------------------------------- */
/*                              Liquid geometry                             */
/* ----------------------------------------------------------------------- */

const GEOM: Record<CreditRefillGaugeStyle, { w: number; h: number }> = {
  vial: { w: 56, h: 120 },
  orb: { w: 112, h: 112 },
  bar: { w: 320, h: 36 },
};
const SAMPLES = 9;
/** The orb's highlight: a short arc inside its upper-left rim, precomputed. */
const ORB_SHINE = "M 12.25 41.79 A 46 46 0 0 1 34.40 15.38";

/** A smooth line through points: quadratic segments through the midpoints. */
const smooth = (pts: number[]): string => {
  // pts holds x0,y0,x1,y1,…
  let d = `${r2(pts[0] ?? 0)} ${r2(pts[1] ?? 0)}`;
  const n = pts.length / 2;
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2] ?? 0;
    const y = pts[i * 2 + 1] ?? 0;
    const mx = (x + (pts[i * 2 + 2] ?? x)) / 2;
    const my = (y + (pts[i * 2 + 3] ?? y)) / 2;
    d += ` Q ${r2(x)} ${r2(y)} ${r2(mx)} ${r2(my)}`;
  }
  d += ` L ${r2(pts[n * 2 - 2] ?? 0)} ${r2(pts[n * 2 - 1] ?? 0)}`;
  return d;
};

const scratch: number[] = new Array<number>(SAMPLES * 2).fill(0);

/**
 * The liquid as a closed path: everything below the surface for the vial
 * and the orb (the surface tilts by `tilt` about the middle and carries a
 * ripple whose size follows the tilt), and everything left of a tilted,
 * rippling front for the bar. Returns the body and the surface line alone.
 */
const liquid = (
  style: CreditRefillGaugeStyle,
  level: number,
  tilt: number,
  phase: number,
): { body: string; surface: string } => {
  const { w, h } = GEOM[style];
  const ripple = Math.min(2.2, Math.abs(tilt) * 7);
  if (style === "bar") {
    const x = clamp(level, 0, 1) * w;
    for (let i = 0; i < SAMPLES; i++) {
      const y = (i / (SAMPLES - 1)) * h;
      const k = (y - h / 2) / (h / 2);
      scratch[i * 2] =
        x === 0
          ? 0
          : clamp(
              x + tilt * k * h * 0.7 + ripple * Math.sin(phase + i * 1.1),
              0,
              w + 6,
            );
      scratch[i * 2 + 1] = y;
    }
    const line = smooth(scratch);
    return { body: `M -2 -2 L ${line} L -2 ${h + 2} Z`, surface: `M ${line}` };
  }
  const y = h - clamp(level, 0, 1) * h;
  for (let i = 0; i < SAMPLES; i++) {
    const x = (i / (SAMPLES - 1)) * w;
    const k = (x - w / 2) / (w / 2);
    scratch[i * 2] = x;
    scratch[i * 2 + 1] =
      level <= 0
        ? h + 2
        : y + tilt * k * w * 0.32 + ripple * Math.sin(phase + i * 0.9);
  }
  const line = smooth(scratch);
  return {
    body: `M -2 ${h + 2} L ${line} L ${w + 2} ${h + 2} Z`,
    surface: `M ${line}`,
  };
};

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** A figure that rolls: the old one leaves upward, the new one rises in. */
function Roll({ value, motionSafe }: { value: string; motionSafe: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-grid overflow-hidden align-bottom tabular-nums"
    >
      <AnimatePresence initial={false}>
        <motion.span
          key={value}
          className="whitespace-nowrap [grid-area:1/1]"
          initial={motionSafe ? { y: "100%", opacity: 0 } : { opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{
            ...(motionSafe ? { y: "-100%" } : {}),
            opacity: 0,
            transition: exitFor(durations.base),
          }}
          transition={
            motionSafe
              ? { y: springs.glide, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A box whose height follows its measured content on glide. */
function Reveal({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: exitFor(durations.base) }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: 0 }
          }
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Phase = "idle" | "buying" | "bought" | "failed";

/**
 * A low-credit sheet that docks over the work it interrupts — no scrim,
 * nothing made inert — and tops up in place. It shows what remains and how
 * long that lasts at the current rate, a radiogroup of packs, auto-recharge
 * and one Buy.
 *
 * The signature is the liquid settle. The balance sits in a gauge of liquid
 * (a vial, a round flask or a wide capsule); choosing a pack pours the level
 * up to the new total on `springs.glide`, and the surface tilts against the
 * pour and ripples, then settles as a lightly damped slosh, so the fill
 * visibly arrives and comes to rest. The share being bought is a lighter
 * band of the same pigment until the charge goes through, when it firms to
 * the full colour. One animation frame loop runs only while the liquid moves
 * and stops the moment it is still, in a hidden tab, or off screen; every
 * coordinate is rounded and written through motion values, never state.
 *
 * Packs move one highlight between them on `springs.snap`; turning
 * auto-recharge on opens a threshold slider at its measured height on glide,
 * whose thumb follows the pointer 1:1, settles on its 50-credit step on snap
 * with the release velocity, and is drawn on the gauge as a dashed line.
 * Arrows, Page keys, Home and End drive it; Escape in the sheet dismisses it.
 * A failed payment keeps the pack chosen and says why. Under reduced motion
 * the level steps on a short tween with a still surface, and the band, the
 * figures and the runway still change.
 */
export function CreditRefill({
  balance = 312,
  rate = 144,
  packs = defaultCreditRefillPacks,
  value: valueProp,
  defaultValue,
  onValueChange,
  autoRecharge: autoProp,
  defaultAutoRecharge = false,
  onAutoRechargeChange,
  threshold: thresholdProp,
  defaultThreshold = 200,
  onThresholdChange,
  thresholdMax = 1000,
  onBuy,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  onDismiss,
  paymentMethod = "Card ending 4417",
  now,
  status = "ready",
  onRetry,
  children,
  gaugeStyle = "vial",
  density = "cozy",
  accent = "cobalt",
  formatMoney = defaultMoney,
  disabled = false,
  className,
}: CreditRefillProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const shape: CreditRefillGaugeStyle = GEOM[gaugeStyle] ? gaugeStyle : "vial";
  const ready = status === "ready";
  const units = (n: number) => (Math.round(n) === 1 ? "credit" : "credits");

  /* -------------------------------- state -------------------------------- */

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const [ownValue, setOwnValue] = React.useState(
    defaultValue ?? packs[1]?.id ?? packs[0]?.id ?? "",
  );
  const chosenId = valueProp ?? ownValue;
  const pack = packs.find((p) => p.id === chosenId) ?? null;
  const [ownAuto, setOwnAuto] = React.useState(defaultAutoRecharge);
  const auto = autoProp ?? ownAuto;
  const [ownThreshold, setOwnThreshold] = React.useState(defaultThreshold);
  const threshold = clamp(thresholdProp ?? ownThreshold, 0, thresholdMax);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [failure, setFailure] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const attempt = React.useRef(0);

  // Credits bought here show at once, but only on top of the balance they
  // were bought against: the moment the host's balance moves (it caught up,
  // or anything else happened), its number is the truth again.
  const [topUp, setTopUp] = React.useState<{
    from: number;
    credits: number;
  } | null>(null);
  const shown =
    topUp && topUp.from === balance ? balance + topUp.credits : balance;
  const biggest = packs.reduce((m, p) => Math.max(m, total(p)), 0);
  const capacity = niceCeil(Math.max(shown + biggest, thresholdMax, 1));
  const projected = phase === "bought" || !pack ? shown : shown + total(pack);

  /* ------------------------------- liquid -------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { amount: 0.1 });
  const level = useMotionValue(projected / capacity);
  const base = useMotionValue(shown / capacity);
  const initial = liquid(shape, projected / capacity, 0, 0);
  const initialBase = liquid(shape, shown / capacity, 0, 0);
  const bandPath = useMotionValue(initial.body);
  const surfacePath = useMotionValue(initial.surface);
  const basePath = useMotionValue(initialBase.body);
  const sim = React.useRef({ tilt: 0, vel: 0, phase: 0, raf: 0, last: 0 });
  const live = React.useRef({ shape, motionSafe, inView });
  // Read by the frame loop, which outlives any one render. Declared first so
  // every later effect in a commit already sees this render's values.
  React.useEffect(() => {
    live.current = { shape, motionSafe, inView };
  });
  const engine = React.useRef<{ draw: () => void; kick: () => void } | null>(
    null,
  );

  // The frame loop lives inside one effect so it can schedule itself, and
  // runs only while something moves: it stops the moment the liquid is
  // still, the tab is hidden or the piece is off screen.
  React.useEffect(() => {
    const s = sim.current;
    const draw = () => {
      const style = live.current.shape;
      const top = liquid(style, level.get(), s.tilt, s.phase);
      bandPath.set(top.body);
      surfacePath.set(top.surface);
      basePath.set(
        liquid(style, base.get(), s.tilt * 0.55, s.phase + 0.6).body,
      );
    };
    function tick(t: number) {
      const dt = Math.min(1 / 30, Math.max(0, (t - s.last) / 1000) || 1 / 60);
      s.last = t;
      const { motionSafe: rich, inView: seen } = live.current;
      // The surface leans against the pour: a damped spring chasing a lean
      // proportional to how fast the level moves, so it swings past upright
      // once or twice after the level stops — a slosh, settling in ~900ms.
      const lean = rich ? clamp(-level.getVelocity() * 0.4, -0.3, 0.3) : 0;
      const w = 2 * Math.PI * 1.6;
      const zeta = 0.17;
      const acc = -w * w * (s.tilt - lean) - 2 * zeta * w * s.vel;
      s.vel += acc * dt;
      s.tilt = rich ? s.tilt + s.vel * dt : 0;
      s.phase += dt * 7;
      draw();
      const moving =
        level.isAnimating() ||
        base.isAnimating() ||
        Math.abs(s.tilt) > 0.002 ||
        Math.abs(s.vel) > 0.02;
      if (moving && seen && !document.hidden) {
        s.raf = window.requestAnimationFrame(tick);
      } else {
        s.raf = 0;
        s.tilt = 0;
        s.vel = 0;
        draw();
      }
    }
    const kick = () => {
      if (s.raf) return;
      s.last = performance.now();
      s.raf = window.requestAnimationFrame(tick);
    };
    engine.current = { draw, kick };
    kick();
    return () => {
      window.cancelAnimationFrame(s.raf);
      s.raf = 0;
      engine.current = null;
    };
  }, [bandPath, base, basePath, level, surfacePath]);
  const kick = React.useCallback(() => engine.current?.kick(), []);

  // The pour: both levels head for their targets, the band on glide and the
  // bought share firming a beat behind it. The loop follows them.
  const levelTarget = r2((projected / capacity) * 10000) / 10000;
  const baseTarget = r2((shown / capacity) * 10000) / 10000;
  React.useEffect(() => {
    const t = motionSafe
      ? springs.glide
      : { duration: durations.base, ease: easings.enter };
    const a = animate(level, levelTarget, t);
    const b = animate(
      base,
      baseTarget,
      motionSafe ? { ...springs.glide, delay: 0.08 } : t,
    );
    kick();
    return () => {
      a.stop();
      b.stop();
    };
  }, [base, baseTarget, kick, level, levelTarget, motionSafe]);

  // A new shape redraws at once; a stopped loop restarts when the piece comes
  // back into view or the tab is shown again with the liquid unsettled.
  React.useEffect(() => {
    engine.current?.draw();
    if (inView) kick();
  }, [inView, kick, shape]);
  React.useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [kick]);

  /* ------------------------------- actions ------------------------------- */

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const focusPill = React.useRef(false);
  const focusSheet = React.useRef(false);
  const dismiss = () => {
    focusPill.current = true;
    setOpen(false);
    onDismiss?.();
    setAnnouncement("Top-up sheet closed.");
  };
  const reopen = () => {
    focusSheet.current = true;
    setOpen(true);
  };

  const choose = (id: string) => {
    if (id === chosenId && phase !== "bought") return;
    if (valueProp === undefined) setOwnValue(id);
    onValueChange?.(id);
    if (phase === "bought" || phase === "failed") setPhase("idle");
    setFailure(null);
    const p = packs.find((x) => x.id === id);
    if (p) {
      const after = shown + total(p);
      setAnnouncement(
        `${count(p.credits)} ${units(p.credits)} for ${formatMoney(p.price)}. ${count(after)} after, ${runway(after, rate)}.`,
      );
    }
  };

  const setAuto = (next: boolean) => {
    if (disabled) return;
    if (autoProp === undefined) setOwnAuto(next);
    onAutoRechargeChange?.(next, threshold);
    setAnnouncement(
      next
        ? `Auto-recharge on below ${count(threshold)} ${units(threshold)}.`
        : "Auto-recharge off.",
    );
  };

  const commitThreshold = (next: number) => {
    const v = clamp(Math.round(next / STEP) * STEP, 0, thresholdMax);
    if (v === threshold) return;
    if (thresholdProp === undefined) setOwnThreshold(v);
    onThresholdChange?.(v);
  };

  const buy = () => {
    if (phase === "bought") {
      dismiss();
      return;
    }
    if (disabled || phase === "buying" || !pack || !ready) return;
    const run = ++attempt.current;
    const chosen = pack;
    const from = balance;
    setPhase("buying");
    setFailure(null);
    setAnnouncement(`Charging ${paymentMethod}.`);
    const land = () => {
      if (attempt.current !== run) return;
      setTopUp((t) => ({
        from,
        credits: (t && t.from === from ? t.credits : 0) + total(chosen),
      }));
      setPhase("bought");
      setAnnouncement(
        `Added ${count(total(chosen))} ${units(total(chosen))}. ${count(shown + total(chosen))} now.`,
      );
    };
    const result = onBuy?.(chosen);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(land, (reason: unknown) => {
        if (attempt.current !== run) return;
        const message =
          reason instanceof Error && reason.message
            ? reason.message
            : "The payment didn't go through.";
        setPhase("failed");
        setFailure(`${message} Your pack is still selected.`);
        setAnnouncement(`Payment failed. ${message}`);
      });
    } else {
      land();
    }
  };

  /* -------------------------------- slider ------------------------------- */

  const thumb = useMotionValue(threshold / thresholdMax);
  const thumbLeft = useTransform(
    thumb,
    (p) => `${Number((clamp(p, 0, 1) * 100).toFixed(3))}%`,
  );
  const dragging = React.useRef(false);
  const releaseVelocity = React.useRef(0);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const trackBox = React.useRef({ left: 0, width: 1 });
  React.useEffect(() => {
    if (dragging.current) return;
    // A release hands its velocity to the settle; a key press starts still.
    const velocity = releaseVelocity.current;
    releaseVelocity.current = 0;
    const c = animate(
      thumb,
      threshold / thresholdMax,
      motionSafe ? { ...springs.snap, velocity } : { duration: 0 },
    );
    return () => c.stop();
  }, [motionSafe, threshold, thresholdMax, thumb]);

  const fromPointer = (clientX: number) => {
    const box = trackBox.current;
    return clamp((clientX - box.left) / Math.max(1, box.width), 0, 1);
  };
  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || !auto,
    onStart: () => {
      dragging.current = true;
      const r = trackRef.current?.getBoundingClientRect();
      if (r) trackBox.current = { left: r.left, width: r.width };
    },
    onMove: ({ point }) => {
      const p = fromPointer(point.x);
      thumb.set(Number(p.toFixed(4)));
      commitThreshold(p * thresholdMax);
    },
    onEnd: ({ point, velocity }) => {
      dragging.current = false;
      const p = fromPointer(point.x);
      const v = clamp(
        Math.round((p * thresholdMax) / STEP) * STEP,
        0,
        thresholdMax,
      );
      const flung = velocity.x / Math.max(1, trackBox.current.width);
      if (v !== threshold) {
        releaseVelocity.current = flung;
        commitThreshold(v);
      } else {
        animate(
          thumb,
          v / thresholdMax,
          motionSafe ? { ...springs.snap, velocity: flung } : { duration: 0 },
        );
      }
    },
    onCancel: () => {
      dragging.current = false;
      animate(
        thumb,
        threshold / thresholdMax,
        motionSafe ? springs.snap : { duration: 0 },
      );
    },
    onTap: (event) => {
      const r = trackRef.current?.getBoundingClientRect();
      if (!r) return;
      trackBox.current = { left: r.left, width: r.width };
      commitThreshold(fromPointer(event.clientX) * thresholdMax);
    },
  });

  const sliderKeys = (event: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowRight: STEP,
      ArrowUp: STEP,
      ArrowLeft: -STEP,
      ArrowDown: -STEP,
      PageUp: STEP * 5,
      PageDown: -STEP * 5,
    };
    if (event.key === "Home") {
      event.preventDefault();
      commitThreshold(0);
    } else if (event.key === "End") {
      event.preventDefault();
      commitThreshold(thresholdMax);
    } else if (map[event.key] !== undefined) {
      event.preventDefault();
      commitThreshold(threshold + (map[event.key] ?? 0));
    }
  };

  /* --------------------------------- packs ------------------------------- */

  const packKeys = (event: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (i + 1) % packs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (i - 1 + packs.length) % packs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = packs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const p = packs[next];
    if (!p) return;
    choose(p.id);
    rootRef.current
      ?.querySelectorAll<HTMLElement>(`[data-cr-pack="${uid}"]`)
      [next]?.focus();
  };

  /* -------------------------------- focus -------------------------------- */

  const bindPill = React.useCallback((node: HTMLButtonElement | null) => {
    if (node && focusPill.current) {
      focusPill.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);
  const [sheetHeading, setSheetHeading] = React.useState<HTMLElement | null>(
    null,
  );
  const bindHeading = React.useCallback((node: HTMLElement | null) => {
    if (node) setSheetHeading(node);
  }, []);
  React.useEffect(() => {
    if (!sheetHeading || !focusSheet.current || !sheetHeading.isConnected)
      return;
    focusSheet.current = false;
    sheetHeading.focus({ preventScroll: true });
  }, [sheetHeading, open]);

  /* -------------------------------- render ------------------------------- */

  const { w: gw, h: gh } = GEOM[shape];
  const thresholdY = r2(gh - (threshold / capacity) * gh);
  const thresholdPct = Number(((threshold / capacity) * 100).toFixed(3));
  const lowSoon = shown <= Math.max(threshold, rate * 3);
  const title =
    phase === "bought"
      ? "Credits topped up"
      : lowSoon
        ? "Credits running low"
        : "Top up credits";
  const runwayNow = runway(shown, rate);
  // Rounded to five minutes so the clock does not claim more than it knows.
  const runsOut =
    now !== undefined && rate > 0
      ? ` · until about ${until(now, Math.round((now + (projected / rate) * 3_600_000) / 300_000) * 300_000)}`
      : "";

  const glass = (
    <>
      {/* The share being bought: a lighter band of the same liquid, under
          the bought share so the full pigment always reads at the bottom. */}
      <motion.path d={bandPath} className="fill-[var(--cr-band)]" />
      <motion.path d={basePath} className="fill-[var(--cr-liquid)]" />
      <motion.path
        d={surfacePath}
        fill="none"
        strokeWidth={1.5}
        strokeLinecap="round"
        className="stroke-[var(--cr-shine)]"
        opacity={0.8}
      />
    </>
  );

  const gauge = (() => {
    const meter = {
      role: "meter" as const,
      "aria-label": "Balance",
      "aria-valuemin": 0,
      "aria-valuemax": capacity,
      "aria-valuenow": Math.round(shown),
      "aria-valuetext": `${count(shown)} ${units(shown)}, ${runwayNow}`,
    };
    if (shape === "bar") {
      return (
        <div
          {...meter}
          className="relative h-9 w-full overflow-hidden rounded-full border border-hairline-strong bg-surface-2"
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${gw} ${gh}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full"
          >
            <motion.path d={bandPath} className="fill-[var(--cr-band)]" />
            <motion.path d={basePath} className="fill-[var(--cr-liquid)]" />
          </svg>
          {auto ? (
            <span
              aria-hidden
              className="absolute inset-y-1 w-0 border-l border-dashed border-foreground/60"
              style={{ left: `${thresholdPct}%` }}
            />
          ) : null}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-1 h-px rounded-full bg-[color-mix(in_oklab,white_45%,transparent)]"
          />
        </div>
      );
    }
    const orb = shape === "orb";
    const clipId = `${uid}-glass`;
    return (
      <div
        {...meter}
        className={cn("relative shrink-0", orb ? "size-28" : "h-[120px] w-14")}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${gw} ${gh}`}
          className="block size-full overflow-visible"
        >
          <defs>
            <clipPath id={clipId}>
              {orb ? (
                <circle cx={gw / 2} cy={gh / 2} r={gw / 2 - 1.5} />
              ) : (
                <rect x={1.5} y={1.5} width={gw - 3} height={gh - 3} rx={14} />
              )}
            </clipPath>
          </defs>
          {orb ? (
            <circle
              cx={gw / 2}
              cy={gh / 2}
              r={gw / 2 - 0.75}
              className="fill-surface-2 stroke-hairline-strong"
              strokeWidth={1.5}
            />
          ) : (
            <rect
              x={0.75}
              y={0.75}
              width={gw - 1.5}
              height={gh - 1.5}
              rx={15}
              className="fill-surface-2 stroke-hairline-strong"
              strokeWidth={1.5}
            />
          )}
          <g clipPath={`url(#${clipId})`}>
            {glass}
            {auto ? (
              <line
                x1={0}
                x2={gw}
                y1={thresholdY}
                y2={thresholdY}
                strokeWidth={1}
                strokeDasharray="3 3"
                className="stroke-foreground/60"
              />
            ) : null}
          </g>
          {/* The glass: a soft highlight down one side, and level ticks. */}
          {orb ? (
            <path
              d={ORB_SHINE}
              fill="none"
              strokeWidth={4}
              strokeLinecap="round"
              className="stroke-[color-mix(in_oklab,white_28%,transparent)]"
            />
          ) : (
            <rect
              x={6}
              y={12}
              width={3}
              height={gh - 32}
              rx={1.5}
              className="fill-[color-mix(in_oklab,white_28%,transparent)]"
            />
          )}
          {orb
            ? null
            : [0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={gw - 12}
                  x2={gw - 5}
                  y1={r2(gh - f * gh)}
                  y2={r2(gh - f * gh)}
                  strokeWidth={1}
                  className="stroke-foreground/25"
                />
              ))}
        </svg>
      </div>
    );
  })();

  const readout = (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className={EYEBROW}>Balance</p>
      <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[26px] leading-8 font-medium text-foreground tabular-nums">
        <Roll value={count(shown)} motionSafe={motionSafe} />
        <AnimatePresence initial={false}>
          {projected !== shown ? (
            <motion.span
              key="after"
              initial={{ opacity: 0, x: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { x: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="text-[15px] leading-5 text-[var(--cr-ink)]"
            >
              → <Roll value={count(projected)} motionSafe={motionSafe} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </p>
      <p className={cn("text-ink-2", d.meta)}>
        <span className="sr-only">
          {count(shown)} {units(shown)}
          {projected !== shown ? `, ${count(projected)} after the top-up` : ""}
          .{" "}
        </span>
        Lasts{" "}
        <span className="font-medium text-foreground">
          {runway(projected, rate)}
        </span>{" "}
        at {count(rate)} an hour{runsOut}
      </p>
    </div>
  );

  const packList = (() => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-2 rounded-3 border border-hairline px-4 py-5 text-center">
          <TriangleAlert aria-hidden className="size-4 text-danger" />
          <p className={cn("text-foreground", d.text)}>
            The packs didn&apos;t load.
          </p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div aria-busy="true" className="grid grid-cols-3 gap-2">
          <span className="sr-only">Loading packs.</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className="h-14 rounded-3 bg-surface-2 motion-safe:animate-pulse"
            />
          ))}
        </div>
      );
    }
    return (
      <div
        role="radiogroup"
        aria-label="Packs"
        className="grid auto-cols-fr grid-flow-col gap-2"
      >
        {packs.map((p, i) => {
          const checked = p.id === chosenId;
          const focusable = pack ? checked : i === 0;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${count(p.credits)} ${units(p.credits)}, ${formatMoney(p.price)}${p.bonus ? `, plus ${count(p.bonus)} free` : ""}`}
              data-cr-pack={uid}
              tabIndex={focusable ? 0 : -1}
              onClick={() => choose(p.id)}
              onKeyDown={(event) => packKeys(event, i)}
              className={cn(
                "relative flex min-w-0 flex-col items-start rounded-3 border text-left transition-colors",
                d.packPad,
                FOCUS,
                checked
                  ? "border-transparent"
                  : "border-hairline hover:border-hairline-strong hover:bg-surface-2",
              )}
            >
              {checked ? (
                <motion.span
                  layoutId={`${uid}-pack`}
                  aria-hidden
                  className="absolute -inset-px rounded-[inherit] border-2 border-[var(--cr-ink)] bg-[var(--cr-wash)]"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span className="relative font-mono text-[15px] leading-5 font-semibold text-foreground tabular-nums">
                {count(p.credits)}
              </span>
              <span className={cn("relative text-ink-2", d.meta)}>
                {formatMoney(p.price)}
              </span>
              {p.bonus ? (
                <span className="relative mt-1 inline-flex h-5 max-w-full items-center truncate rounded-full bg-[var(--cr-wash)] px-1.5 font-mono text-[10px] text-[var(--cr-ink)]">
                  +{count(p.bonus)} free
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  })();

  const switchId = `${uid}-auto`;
  const autoRow = (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span
            id={switchId}
            className={cn("font-medium text-foreground", d.text)}
          >
            Auto-recharge
          </span>
          <span className={cn("text-ink-3", d.meta)}>
            {auto && pack
              ? `Adds ${count(pack.credits)} below ${count(threshold)}`
              : "Never run dry mid-render"}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          aria-labelledby={switchId}
          aria-disabled={disabled || undefined}
          onClick={() => setAuto(!auto)}
          className={cn(
            "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
            FOCUS,
            auto
              ? "bg-[var(--cr-fill)]"
              : "bg-surface-2 ring-1 ring-hairline-strong ring-inset",
            disabled && "opacity-60",
          )}
        >
          <motion.span
            aria-hidden
            className={cn(
              "absolute top-1 left-1 size-4 rounded-full shadow-sm transition-colors",
              auto ? "bg-[var(--cr-on)]" : "bg-ink-3",
            )}
            initial={false}
            animate={{ x: auto ? 16 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        </button>
      </div>
      <Reveal open={auto} motionSafe={motionSafe}>
        <div className="flex flex-col gap-2 px-1 pt-3 pb-1">
          <div
            className={cn("flex items-baseline justify-between gap-2", d.meta)}
          >
            <span id={`${uid}-below`} className="text-ink-2">
              Top up below
            </span>
            <span className="font-mono text-foreground tabular-nums">
              {count(threshold)} {units(threshold)}
            </span>
          </div>
          <div
            ref={trackRef}
            {...drag}
            className="relative flex h-6 cursor-pointer touch-pan-y items-center"
          >
            <span
              aria-hidden
              className="absolute inset-x-0 h-1 rounded-full bg-surface-2"
            />
            <motion.span
              aria-hidden
              className="absolute left-0 h-1 rounded-full bg-[var(--cr-ink)]"
              style={{ width: thumbLeft }}
            />
            <motion.span
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-labelledby={`${uid}-below`}
              aria-valuemin={0}
              aria-valuemax={thresholdMax}
              aria-valuenow={threshold}
              aria-valuetext={`${count(threshold)} ${units(threshold)}`}
              aria-disabled={disabled || undefined}
              onKeyDown={sliderKeys}
              className={cn(
                "absolute top-1/2 -mt-2 -ml-2 size-4 cursor-grab rounded-full border-2 border-[var(--cr-ink)] bg-card shadow-sm active:cursor-grabbing",
                FOCUS,
              )}
              style={{ left: thumbLeft }}
            />
          </div>
          <div
            aria-hidden
            className="flex justify-between font-mono text-[10px] text-ink-3 tabular-nums"
          >
            <span>0</span>
            <span>{count(thresholdMax)}</span>
          </div>
        </div>
      </Reveal>
    </div>
  );

  const buyLabel =
    phase === "bought"
      ? "Close"
      : phase === "buying"
        ? "Charging…"
        : pack
          ? `Buy ${count(pack.credits)} ${units(pack.credits)} · ${formatMoney(pack.price)}`
          : "Choose a pack";

  const sheet = (
    <motion.section
      key="sheet"
      role="region"
      aria-labelledby={`${uid}-title`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          dismiss();
        }
      }}
      initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: motionSafe ? distances.step : 0,
        transition: exitFor(durations.base),
      }}
      transition={
        motionSafe
          ? {
              y: springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 flex max-h-full flex-col overflow-hidden rounded-t-4 border-t border-hairline-strong bg-popover text-popover-foreground shadow-raised",
        "@min-[36rem]:right-4 @min-[36rem]:bottom-4 @min-[36rem]:left-auto @min-[36rem]:max-h-[calc(100%-2rem)] @min-[36rem]:w-[24rem] @min-[36rem]:rounded-4 @min-[36rem]:border",
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--cr-wash)] text-[var(--cr-ink)]"
        >
          <Coins className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2
            ref={bindHeading}
            id={`${uid}-title`}
            tabIndex={-1}
            className="truncate text-[14px] leading-5 font-semibold outline-none"
          >
            {title}
          </h2>
          <p className="truncate text-[11px] leading-4 text-ink-3">
            {count(shown)} left · {runwayNow}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className={cn("flex flex-col", d.pad, d.gap)}>
          {shape === "bar" ? (
            <div className="flex flex-col gap-3">
              {gauge}
              {readout}
            </div>
          ) : (
            <div className="flex items-center gap-4">
              {gauge}
              {readout}
            </div>
          )}
          {packList}
          <div className="border-t border-hairline pt-3">{autoRow}</div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={buy}
              aria-disabled={
                (phase !== "bought" && (disabled || !pack || !ready)) ||
                undefined
              }
              aria-busy={phase === "buying" || undefined}
              className={cn(
                "relative inline-flex h-10 w-full items-center justify-center gap-1.5 overflow-hidden rounded-2 px-4 text-[13px] font-medium whitespace-nowrap transition-[background-color,opacity,translate] active:translate-y-px",
                FOCUS,
                phase === "bought"
                  ? "border border-input bg-surface-1 text-foreground hover:bg-surface-2"
                  : "bg-[var(--cr-fill)] text-[var(--cr-on)] hover:bg-[color-mix(in_oklab,var(--cr-fill)_88%,var(--foreground))]",
                phase !== "bought" &&
                  (disabled || !pack || !ready) &&
                  "opacity-60",
              )}
            >
              {phase === "buying" ? (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1/3 bg-[color-mix(in_oklab,var(--cr-on)_18%,transparent)]"
                  initial={{ x: "-100%" }}
                  animate={motionSafe ? { x: "300%" } : { x: "0%" }}
                  transition={
                    motionSafe
                      ? { duration: 1.1, ease: easings.move, repeat: Infinity }
                      : { duration: 0 }
                  }
                />
              ) : null}
              <span className="relative truncate tabular-nums">{buyLabel}</span>
            </button>
            <p className={cn("text-center text-ink-3", d.meta)}>
              {phase === "bought"
                ? `Charged to ${paymentMethod}.`
                : `${paymentMethod} · one-time, no subscription`}
            </p>
          </div>
          <AnimatePresence initial={false}>
            {failure ? (
              <motion.div
                key="failure"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: 0 }
                }
                className="-mt-1 overflow-hidden"
              >
                <p
                  role="alert"
                  className={cn(
                    "flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-3 py-2 text-danger",
                    d.meta,
                  )}
                >
                  <TriangleAlert
                    aria-hidden
                    className="mt-px size-3.5 shrink-0"
                  />
                  {failure}
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        // The frame is 35rem tall unless a height class says otherwise; the
        // sheet scrolls inside it if it must.
        "@container relative h-[35rem] w-full overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <div className="absolute inset-0 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {children}
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          sheet
        ) : (
          <motion.div
            key="pill"
            className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            <button
              ref={bindPill}
              type="button"
              onClick={reopen}
              className={cn(
                "pointer-events-auto inline-flex h-9 max-w-full items-center gap-2 rounded-full border border-hairline-strong bg-popover px-3.5 text-[12px] text-foreground shadow-raised transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-[var(--cr-liquid)]"
              />
              <span className="truncate font-mono tabular-nums">
                {count(shown)} {units(shown)} left
              </span>
              <span aria-hidden className="text-ink-3">
                ·
              </span>
              <span className="shrink-0 font-medium text-[var(--cr-ink)]">
                Top up
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
