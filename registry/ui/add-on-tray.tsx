"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Archive,
  ArrowRight,
  Check,
  Globe,
  HardDrive,
  KeyRound,
  LifeBuoy,
  RotateCcw,
  ScrollText,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type AddOnIcon =
  "storage" | "audit" | "support" | "sso" | "residency" | "backup" | "guests";

export type AddOn = {
  id: string;
  name: string;
  /** One line on what it does. */
  description: string;
  /** Monthly price. */
  price: number;
  /** @default a spark */
  icon?: AddOnIcon;
  /** Add-ons that cannot run beside this one, by id (list it on both). */
  conflicts?: string[];
  /** A plan this add-on needs, when the current plan cannot take it. */
  requires?: string;
  /** Why it conflicts, said after "Can't run with …". */
  note?: string;
};

export type AddOnTrayBase = { name: string; price: number };
export type AddOnTrayCardStyle = "outline" | "tile" | "row";
export type AddOnTrayPosition = "bottom" | "side" | "float";
export type AddOnTrayAccent = "cobalt" | "signal" | "amber" | "graphite";
export type AddOnTrayStatus = "ready" | "loading" | "error";

export type AddOnTrayProps = {
  /** The add-ons offered, in order. @default defaultAddOns (six) */
  addons?: AddOn[];
  /** Controlled: the ids turned on. */
  value?: string[];
  /** Initial ids when uncontrolled. @default ["storage"] */
  defaultValue?: string[];
  /** Fires from the press or key that changed the selection, with every id on. */
  onValueChange?: (ids: string[]) => void;
  /** One add-on was turned on or off. */
  onToggle?: (id: string, on: boolean) => void;
  /** An add-on that cannot be added was pressed, with the reason it shows. */
  onBlocked?: (id: string, reason: string) => void;
  /** Checkout was pressed, with the ids and the monthly total. */
  onCheckout?: (order: { ids: string[]; total: number }) => void;
  /** The plan the add-ons sit on. @default { name: "Team plan", price: 96 } */
  base?: AddOnTrayBase;
  /** Prices are still on their way: shimmering bars, checkout held. @default false */
  pricesLoading?: boolean;
  /** The cards: bordered, filled tiles, or compact rows. @default "outline" */
  cardStyle?: AddOnTrayCardStyle;
  /** The tray: a panel under the cards, a receipt column beside them, or a floating bar. Narrow containers always dock it at the bottom. @default "bottom" */
  trayPosition?: AddOnTrayPosition;
  /** Checks, chips, the flight and the chosen cards: a named accent or any CSS colour. @default "cobalt" */
  accent?: AddOnTrayAccent | (string & {});
  /** Formats a price. @default US dollars, cents only when there are some */
  formatPrice?: (amount: number) => string;
  /** What the prices are per. @default "mo" */
  period?: string;
  /** The heading. @default "Add-ons" */
  title?: string;
  /** The checkout button's word. @default "Checkout" */
  checkoutLabel?: string;
  /** Whether the add-ons have arrived. @default "ready" */
  status?: AddOnTrayStatus;
  /** "Try again" was pressed after the add-ons failed to load. */
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                  Defaults                                */
/* ----------------------------------------------------------------------- */

/** Six extras for a Fieldline Team workspace. */
export const defaultAddOns: AddOn[] = [
  {
    id: "storage",
    name: "Extra storage",
    description: "500 GB more for files, recordings and exports.",
    price: 8,
    icon: "storage",
  },
  {
    id: "audit",
    name: "Audit log",
    description: "Every change kept for a year, ready to export.",
    price: 12,
    icon: "audit",
  },
  {
    id: "support",
    name: "Priority support",
    description: "Answers within four working hours, by chat or call.",
    price: 19,
    icon: "support",
  },
  {
    id: "residency",
    name: "EU data residency",
    description: "Projects and files stored in EU regions only.",
    price: 15,
    icon: "residency",
    conflicts: ["backup"],
    note: "data stays in one region",
  },
  {
    id: "backup",
    name: "US archive backups",
    description: "Nightly copies kept in a US archive for 90 days.",
    price: 6,
    icon: "backup",
    conflicts: ["residency"],
    note: "data stays in one region",
  },
  {
    id: "sso",
    name: "Single sign-on",
    description: "Sign in through your company's own directory.",
    price: 10,
    icon: "sso",
    requires: "Business",
  },
];

export const defaultAddOnBase: AddOnTrayBase = { name: "Team plan", price: 96 };

const DEFAULT_VALUE = ["storage"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<AddOnTrayAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const ICONS: Record<AddOnIcon, typeof HardDrive> = {
  storage: HardDrive,
  audit: ScrollText,
  support: LifeBuoy,
  sso: KeyRound,
  residency: Globe,
  backup: Archive,
  guests: Users,
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const whole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});
const dollars = (n: number) =>
  Number.isInteger(n) ? whole.format(n) : cents.format(n);

const r2 = (v: number) => Math.round(v * 100) / 100;
const f3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Flight = { key: number; id: string; dir: "in" | "out" };
type Box = { x: number; y: number; w: number; h: number };

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** One odometer wheel: higher wheels turn only as the one below rolls over. */
function Wheel({
  value,
  place,
}: {
  value: MotionValue<number>;
  place: number;
}) {
  const unit = 10 ** place;
  const y = useTransform(value, (v) => {
    const n = Math.max(0, v);
    let pos: number;
    if (place === 0) pos = n % 10;
    else {
      const base = Math.floor(n / unit);
      pos = (base % 10) + clamp01(n - base * unit - (unit - 1));
    }
    return `${f3((-pos / 11) * 100)}%`;
  });
  const opacity = useTransform(value, (v) =>
    place === 0 || v >= unit - 0.5 ? 1 : 0,
  );
  return (
    <span
      className="relative inline-block overflow-clip"
      style={{ width: "1ch", height: "1em", lineHeight: 1 }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y, opacity }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          <span key={i} style={{ height: "1em", lineHeight: 1 }}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/** A soft highlight that sweeps across a bar while prices load. */
function Shimmer({ className, live }: { className?: string; live: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block overflow-hidden rounded-full bg-surface-2",
        className,
      )}
    >
      {live ? (
        <motion.span
          className="absolute inset-y-0 w-2/3 bg-linear-to-r from-transparent via-[color-mix(in_oklab,var(--card)_70%,transparent)] to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "160%" }}
          transition={{ duration: 1.2, ease: easings.move, repeat: Infinity }}
        />
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The tray                                */
/* ----------------------------------------------------------------------- */

/**
 * An add-on picker: toggle cards above (or beside) a running total tray.
 * Turning a card on drops its chip into the tray on a small arc — one
 * progress value on glide carries it from the card's price to its place in
 * the tray, x straight and y lifted, and it lands with two small bounces on
 * recoil as the monthly total rolls on snap to its new value on odometer
 * wheels. Turning it off lifts the chip back out toward its card while the
 * tray closes up on glide and the total rolls down.
 *
 * Cards are real `role="checkbox"` buttons with arrow-key travel in two
 * dimensions. An add-on that cannot run beside another, or needs another
 * plan, stays focusable but `aria-disabled` and says why; pressing it brings
 * the reason forward. While prices load they shimmer and checkout is held.
 * Narrow containers dock the tray at the bottom. Under reduced motion chips
 * fade in and out of the tray and the total swaps.
 */
export function AddOnTray({
  addons = defaultAddOns,
  value,
  defaultValue = DEFAULT_VALUE,
  onValueChange,
  onToggle,
  onBlocked,
  onCheckout,
  base = defaultAddOnBase,
  pricesLoading = false,
  cardStyle = "outline",
  trayPosition = "bottom",
  accent = "cobalt",
  formatPrice = dollars,
  period = "mo",
  title = "Add-ons",
  checkoutLabel = "Checkout",
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: AddOnTrayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const color =
    accent in ACCENTS ? ACCENTS[accent as AddOnTrayAccent] : (accent as string);
  const ready = status === "ready";

  const [own, setOwn] = React.useState<string[]>(() => defaultValue);
  const chosen = value ?? own;
  const chosenSet = new Set(chosen);
  const [flyingIn, setFlyingIn] = React.useState<string | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [nudged, setNudged] = React.useState({ id: "", n: 0 });
  const [roving, setRoving] = React.useState("");
  const [inView, setInView] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLElement>());
  const priceNodes = React.useRef(new Map<string, HTMLElement>());
  const chipNodes = React.useRef(new Map<string, HTMLElement>());
  const outFrom = React.useRef<Box | null>(null);
  const flightKey = React.useRef(0);
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fo = useMotionValue(0);
  const fs = useMotionValue(1);

  const byId = (id: string) => addons.find((a) => a.id === id);
  const sumOf = (ids: string[]) =>
    ids.reduce((t, id) => t + (byId(id)?.price ?? 0), 0);
  // The tray counts a chip once it has landed in it.
  const landedIds = chosen.filter((id) => id !== flyingIn);
  const total = base.price + sumOf(chosen);
  const shownTotal = base.price + sumOf(landedIds);
  const maxTotal = base.price + addons.reduce((t, a) => t + a.price, 0);
  const wheels = String(Math.round(maxTotal)).length;
  const sample = formatPrice(0);
  const zeroAt = sample.indexOf("0");
  const prefix = zeroAt >= 0 ? sample.slice(0, zeroAt) : "";
  const suffix =
    zeroAt >= 0 ? sample.slice(zeroAt + 1).replace(/^[.,]0+/, "") : "";

  const blockedBy = (a: AddOn): string | null => {
    if (a.requires) return `Needs the ${a.requires} plan`;
    const clash = (a.conflicts ?? []).find((id) => chosenSet.has(id));
    if (clash) {
      const other = byId(clash);
      return `Can't run with ${other?.name ?? clash}${a.note ? `: ${a.note}` : ""}`;
    }
    return null;
  };

  /* ----------------------------- the total ----------------------------- */

  const totalMv = useMotionValue(shownTotal);
  React.useEffect(() => {
    if (!motionSafe) {
      totalMv.jump(shownTotal);
      return;
    }
    const c = animate(totalMv.get(), shownTotal, {
      ...springs.snap,
      onUpdate: (v: number) => totalMv.set(r2(v)),
    });
    return () => c.stop();
  }, [shownTotal, motionSafe, totalMv]);

  /* ----------------------------- the flight ----------------------------- */

  const rectIn = (node: HTMLElement | undefined): Box | null => {
    const root = rootRef.current;
    if (!root || !node) return null;
    const r = root.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height };
  };

  const land = (key: number) => {
    setFlight((f) => (f && f.key === key ? null : f));
    setFlyingIn(null);
  };

  React.useLayoutEffect(() => {
    if (!flight) return;
    const id = flight.id;
    const from =
      flight.dir === "in"
        ? rectIn(priceNodes.current.get(id))
        : outFrom.current;
    const to =
      flight.dir === "in"
        ? rectIn(chipNodes.current.get(id))
        : rectIn(priceNodes.current.get(id));
    if (!from || !to) {
      // Nothing to fly between (a card scrolled away): land it in place.
      const t = window.setTimeout(() => land(flight.key), 0);
      return () => window.clearTimeout(t);
    }
    const x0 = from.x + from.w / 2;
    const y0 = from.y + from.h / 2;
    const x1 = to.x + to.w / 2;
    const y1 = to.y + to.h / 2;
    const lift = Math.min(64, 22 + Math.hypot(x1 - x0, y1 - y0) * 0.12);
    fx.jump(r2(x0));
    fy.jump(r2(y0));
    fo.jump(1);
    fs.jump(flight.dir === "in" ? 0.92 : 1);
    const c: AnimationPlaybackControls = animate(0, 1, {
      ...springs.glide,
      onUpdate: (t: number) => {
        const k = Math.min(1, t);
        fx.set(r2(x0 + (x1 - x0) * t));
        fy.set(r2(y0 + (y1 - y0) * t - lift * Math.sin(Math.PI * k)));
        if (flight.dir === "out") {
          fo.set(r2(clamp01(1 - k * 1.1)));
          fs.set(r2(1 - 0.18 * k));
        } else {
          fs.set(r2(0.92 + 0.08 * k));
        }
      },
      onComplete: () => land(flight.key),
    });
    return () => c.stop();
    // A flight is planned by the handler that caused it; it reads its rects
    // once, as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  // Prices shimmer only while they load and the tray is on screen.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node || !pricesLoading || typeof IntersectionObserver === "undefined")
      return;
    const io = new IntersectionObserver((entries) => {
      setInView(entries.some((e) => e.isIntersecting));
    });
    io.observe(node);
    return () => io.disconnect();
  }, [pricesLoading]);

  /* ------------------------------ toggling ------------------------------ */

  const commit = (next: string[]) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const toggle = (a: AddOn) => {
    if (disabled || !ready) return;
    const on = chosenSet.has(a.id);
    const reason = on ? null : blockedBy(a);
    if (reason) {
      setNudged((n) => ({ id: a.id, n: n.n + 1 }));
      say(`${a.name} is not available. ${reason}.`);
      onBlocked?.(a.id, reason);
      return;
    }
    // A flight still in the air lands where it was going.
    if (flight) {
      setFlight(null);
      setFlyingIn(null);
    }
    const next = on
      ? chosen.filter((id) => id !== a.id)
      : addons
          .filter((x) => x.id === a.id || chosenSet.has(x.id))
          .map((x) => x.id);
    if (on) outFrom.current = rectIn(chipNodes.current.get(a.id));
    commit(next);
    onToggle?.(a.id, !on);
    const after = base.price + sumOf(next);
    say(
      `${a.name} ${on ? "removed" : "added"}. Total ${formatPrice(after)} a month.`,
    );
    if (motionSafe) {
      flightKey.current += 1;
      setFlight({ key: flightKey.current, id: a.id, dir: on ? "out" : "in" });
      if (!on) setFlyingIn(a.id);
    }
  };

  const onCardKey = (event: React.KeyboardEvent, id: string) => {
    const ids = addons.map((a) => a.id);
    const index = ids.indexOf(id);
    const nodes = ids.map((i) => cardNodes.current.get(i));
    const tops = nodes.map((n) => n?.getBoundingClientRect().top ?? 0);
    const first = tops[0] ?? 0;
    const cols = Math.max(
      1,
      tops.filter((t) => Math.abs(t - first) < 4).length,
    );
    let next = index;
    switch (event.key) {
      case "ArrowRight":
        next = index + 1;
        break;
      case "ArrowLeft":
        next = index - 1;
        break;
      case "ArrowDown":
        next = index + cols;
        break;
      case "ArrowUp":
        next = index - cols;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = ids.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const to = ids[Math.min(ids.length - 1, Math.max(0, next))];
    if (to === undefined) return;
    setRoving(to);
    cardNodes.current.get(to)?.focus();
  };

  const registerCard = React.useCallback(
    (id: string, node: HTMLElement | null) => {
      if (node) cardNodes.current.set(id, node);
      else cardNodes.current.delete(id);
    },
    [],
  );
  const registerPrice = React.useCallback(
    (id: string, node: HTMLElement | null) => {
      if (node) priceNodes.current.set(id, node);
      else priceNodes.current.delete(id);
    },
    [],
  );
  const registerChip = React.useCallback(
    (id: string, node: HTMLElement | null) => {
      if (node) chipNodes.current.set(id, node);
      else chipNodes.current.delete(id);
    },
    [],
  );

  /* ------------------------------- render ------------------------------- */

  const rovingId = addons.some((a) => a.id === roving)
    ? roving
    : (addons[0]?.id ?? "");
  const shimmer = pricesLoading && motionSafe && inView;
  const card = (a: AddOn) => {
    const on = chosenSet.has(a.id);
    const reason = on ? null : blockedBy(a);
    const blocked = reason !== null;
    const Icon = a.icon ? ICONS[a.icon] : Sparkles;
    const nameId = `${uid}-${a.id}-name`;
    const descId = `${uid}-${a.id}-desc`;
    const priceId = `${uid}-${a.id}-price`;
    const row = cardStyle === "row";
    const tile = cardStyle === "tile";
    const fresh = nudged.id === a.id && nudged.n > 0;
    const check = (
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center border transition-colors duration-150",
          row ? "rounded-1" : "rounded-full",
          on
            ? "border-(--at-accent) bg-(--at-pigment) text-primary-foreground"
            : "border-hairline-strong bg-card text-transparent",
          blocked && "opacity-50",
        )}
      >
        <svg viewBox="0 0 16 16" className="size-3">
          <motion.path
            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
            transition={
              motionSafe ? springs.flick : { duration: durations.blink }
            }
          />
        </svg>
      </span>
    );
    const icon = (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center transition-colors duration-150",
          tile ? "size-10 rounded-3" : "size-8 rounded-2",
          on
            ? "bg-[color-mix(in_oklab,var(--at-pigment)_18%,var(--card))] text-(--at-accent)"
            : "bg-surface-2 text-ink-2",
          blocked && "opacity-50",
        )}
      >
        <Icon className={tile ? "size-5" : "size-4"} />
      </span>
    );
    // A blocked add-on says why in place of what it does, so a card never
    // grows when its neighbour is toggled.
    const text = (
      <span className={cn("min-w-0", row ? "flex-1" : "block w-full")}>
        <span
          id={nameId}
          className={cn(
            "block truncate text-[13px] font-semibold",
            blocked && "text-ink-2",
          )}
        >
          {a.name}
        </span>
        <span
          id={descId}
          title={row ? (reason ?? a.description) : undefined}
          className={cn(
            "relative text-[12px] leading-snug",
            row ? "block truncate" : "line-clamp-2",
            blocked ? "text-foreground" : "text-ink-2",
          )}
        >
          {blocked && fresh ? (
            <motion.span
              key={nudged.n}
              aria-hidden
              className="absolute -inset-x-1 inset-y-0 rounded-1 bg-[color-mix(in_oklab,var(--at-pigment)_24%,transparent)]"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: easings.enter }}
            />
          ) : null}
          <motion.span
            key={`t${fresh ? nudged.n : 0}`}
            className="relative"
            initial={
              blocked && fresh && motionSafe ? { x: -distances.nudge } : false
            }
            animate={{ x: 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {reason ?? a.description}
          </motion.span>
        </span>
      </span>
    );
    return (
      <li key={a.id} className="relative flex flex-col">
        <button
          ref={(node) => registerCard(a.id, node)}
          type="button"
          role="checkbox"
          aria-checked={on}
          aria-disabled={blocked || disabled || undefined}
          aria-labelledby={nameId}
          aria-describedby={`${descId} ${priceId}`}
          tabIndex={rovingId === a.id ? 0 : -1}
          data-at-card={a.id}
          onFocus={() => setRoving(a.id)}
          onKeyDown={(e) => onCardKey(e, a.id)}
          onClick={() => toggle(a)}
          className={cn(
            "relative flex w-full flex-1 text-left transition-colors duration-150",
            row
              ? "items-center gap-3 rounded-3 border px-3 py-2.5"
              : "flex-col gap-2 rounded-3 border p-3.5",
            tile &&
              "border-transparent bg-[color-mix(in_oklab,var(--color-surface-2)_75%,var(--card))]",
            !tile && !on && "border-hairline bg-card",
            on &&
              (tile
                ? "border-transparent bg-[color-mix(in_oklab,var(--at-pigment)_12%,var(--card))]"
                : "border-[color-mix(in_oklab,var(--at-accent)_55%,transparent)] bg-[color-mix(in_oklab,var(--at-pigment)_6%,var(--card))]"),
            blocked &&
              !tile &&
              "border-dashed bg-[color-mix(in_oklab,var(--card)_60%,var(--color-surface-1))]",
            blocked || disabled
              ? "cursor-not-allowed"
              : "cursor-pointer hover:border-hairline-strong",
            FOCUS_RING,
          )}
        >
          {row ? (
            <>
              {icon}
              {text}
            </>
          ) : (
            <>
              <span className="flex w-full items-start justify-between gap-3">
                {icon}
                {check}
              </span>
              {text}
            </>
          )}
          <span
            className={cn(
              "flex items-center gap-2 text-[12px] font-medium",
              row ? "shrink-0" : "mt-auto",
              blocked && "opacity-50",
            )}
          >
            <span
              id={priceId}
              ref={(node) => registerPrice(a.id, node)}
              className={cn(
                "inline-flex items-center",
                tile &&
                  !pricesLoading &&
                  "h-6 rounded-full bg-card px-2 shadow-[inset_0_0_0_1px_var(--hairline)]",
              )}
            >
              {pricesLoading ? (
                <>
                  <span className="sr-only">Price loading</span>
                  <Shimmer live={shimmer} className="h-3 w-12" />
                </>
              ) : (
                <span className="tabular-nums">
                  +{formatPrice(a.price)}
                  <span className="text-ink-3">/{period}</span>
                </span>
              )}
            </span>
          </span>
          {row ? check : null}
        </button>
      </li>
    );
  };

  const side = trayPosition === "side";
  const float = trayPosition === "float";

  const chips = (
    <ul
      aria-label="Add-ons in your order"
      className={cn(
        "flex min-w-0 gap-1.5",
        side
          ? "flex-wrap @min-[40rem]:flex-col @min-[40rem]:flex-nowrap"
          : "[scrollbar-width:none] overflow-x-auto @min-[30rem]:flex-wrap @min-[30rem]:overflow-visible",
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {landedIds.length === 0 && flyingIn === null ? (
          <motion.li
            key="none"
            className="text-[12px] text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: durations.blink } }}
          >
            Nothing added yet.
          </motion.li>
        ) : null}
        {chosen.map((id) => {
          const a = byId(id);
          if (!a) return null;
          const Icon = a.icon ? ICONS[a.icon] : Sparkles;
          const waiting = flyingIn === id;
          return (
            <motion.li
              key={id}
              ref={(node: HTMLLIElement | null) => registerChip(id, node)}
              layout={motionSafe ? "position" : false}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--at-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--at-pigment)_10%,var(--card))] pr-2.5 pl-2 text-[12px] whitespace-nowrap",
                side && "@min-[40rem]:justify-between @min-[40rem]:rounded-2",
              )}
              initial={{ opacity: 0, scale: motionSafe ? 0.85 : 1 }}
              animate={{
                opacity: waiting ? 0 : 1,
                scale: waiting ? 0.85 : 1,
              }}
              exit={{
                opacity: 0,
                transition: motionSafe
                  ? { duration: 0 }
                  : exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      scale: springs.recoil,
                      opacity: { duration: durations.blink },
                      layout: springs.glide,
                    }
                  : { duration: durations.fast }
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon
                  aria-hidden
                  className="size-3.5 shrink-0 text-(--at-accent)"
                />
                {a.name}
              </span>
              <span className="text-ink-3 tabular-nums">
                {pricesLoading ? "…" : `+${formatPrice(a.price)}`}
              </span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );

  const totalView = (
    <div className="flex items-baseline gap-1 text-xl font-semibold tracking-tight">
      {pricesLoading ? (
        <Shimmer live={shimmer} className="h-5 w-20" />
      ) : (
        <>
          <span className="sr-only">{`Total ${formatPrice(total)} a month`}</span>
          <span aria-hidden className="inline-flex items-baseline tabular-nums">
            {prefix}
            <span className="inline-flex">
              {Array.from({ length: wheels }, (_, i) => (
                <Wheel
                  key={wheels - 1 - i}
                  value={totalMv}
                  place={wheels - 1 - i}
                />
              ))}
            </span>
            {suffix}
          </span>
          <span aria-hidden className="text-[12px] font-normal text-ink-3">
            /{period}
          </span>
        </>
      )}
    </div>
  );

  const checkout = (
    <button
      type="button"
      onClick={() => {
        if (!disabled && !pricesLoading)
          onCheckout?.({ ids: [...chosen], total });
      }}
      aria-disabled={disabled || pricesLoading || undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-50",
        FOCUS_RING,
      )}
    >
      {checkoutLabel}
      <ArrowRight aria-hidden className="size-3.5 shrink-0" />
    </button>
  );

  const tray = (
    <section
      aria-label="Order summary"
      className={cn(
        "z-10 flex shrink-0 flex-col gap-3 bg-card",
        float
          ? "absolute inset-x-3 bottom-3 rounded-3 border border-hairline-strong p-3 shadow-[0_12px_32px_color-mix(in_oklab,black_16%,transparent)] @min-[30rem]:inset-x-4 @min-[30rem]:bottom-4 @min-[30rem]:p-3.5"
          : "border-t border-hairline px-4 py-3",
        side &&
          "@min-[40rem]:w-64 @min-[40rem]:border-t-0 @min-[40rem]:border-l @min-[40rem]:bg-surface-1 @min-[40rem]:py-4",
        !side && !float && "@min-[30rem]:py-3.5",
      )}
    >
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Monthly total
        </span>
        <span className="truncate text-ink-2 tabular-nums">
          {base.name} · {pricesLoading ? "…" : formatPrice(base.price)}
        </span>
      </div>
      <div
        className={cn(
          "flex gap-3",
          side
            ? "flex-col @min-[40rem]:flex-1"
            : "flex-col @min-[30rem]:flex-row @min-[30rem]:items-end @min-[30rem]:justify-between",
        )}
      >
        <div
          className={cn(
            "min-w-0",
            side ? "@min-[40rem]:flex-1" : "@min-[30rem]:flex-1",
          )}
        >
          {chips}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-between gap-3",
            side &&
              "@min-[40rem]:mt-auto @min-[40rem]:flex-col @min-[40rem]:items-stretch",
          )}
        >
          {totalView}
          {checkout}
        </div>
      </div>
    </section>
  );

  const gridCols =
    cardStyle === "row"
      ? side
        ? "grid-cols-1"
        : "grid-cols-1 @min-[40rem]:grid-cols-2"
      : side
        ? "grid-cols-1 @min-[30rem]:grid-cols-2"
        : "grid-cols-1 @min-[30rem]:grid-cols-2 @min-[44rem]:grid-cols-3";

  const body = () => {
    if (status === "error") {
      return (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The add-ons did not load.</p>
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
      );
    }
    return (
      <div
        className={cn(
          "relative flex flex-1 flex-col overflow-hidden",
          side && "@min-[40rem]:flex-row",
        )}
      >
        <div
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain p-3 @min-[30rem]:p-4",
            float && "pb-40 @min-[30rem]:pb-32",
          )}
        >
          {ready ? (
            <ul
              role="group"
              aria-labelledby={titleId}
              className={cn("grid gap-2.5 @min-[30rem]:gap-3", gridCols)}
            >
              {addons.map((a) => card(a))}
            </ul>
          ) : (
            <ul
              aria-busy="true"
              className={cn("grid gap-2.5 @min-[30rem]:gap-3", gridCols)}
            >
              <li className="sr-only">Loading the add-ons.</li>
              {Array.from({ length: 6 }, (_, i) => (
                <li
                  key={i}
                  aria-hidden
                  className="flex h-24 flex-col gap-2 rounded-3 border border-hairline p-3.5"
                >
                  <span className="size-8 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                  <span className="h-2.5 w-2/3 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                </li>
              ))}
            </ul>
          )}
        </div>
        {ready ? tray : null}
      </div>
    );
  };

  const flier = flight ? byId(flight.id) : undefined;
  const FlierIcon = flier?.icon ? ICONS[flier.icon] : Sparkles;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--at-accent": color,
          "--at-pigment": `oklch(from ${color} 0.66 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            Fieldline · {base.name}, billed monthly
          </p>
        </div>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] text-ink-2 tabular-nums">
          <Check aria-hidden className="size-3 text-(--at-accent)" />
          {chosen.length} {chosen.length === 1 ? "add-on" : "add-ons"} on
        </span>
      </header>

      {body()}

      {flight && flier ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-30 inline-flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--at-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--at-pigment)_14%,var(--card))] px-2.5 text-[12px] whitespace-nowrap shadow-[0_8px_20px_color-mix(in_oklab,black_16%,transparent)]"
          style={{ x: fx, y: fy, opacity: fo, scale: fs }}
        >
          <FlierIcon className="size-3.5 shrink-0 text-(--at-accent)" />
          {flier.name}
        </motion.span>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
