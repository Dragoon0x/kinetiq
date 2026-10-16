"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  Grid3x3,
  QrCode,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Speech,
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

export type SafetyContact = {
  name: string;
  /** A handle or number shown under the name. */
  handle?: string;
  /** Which of their devices this number belongs to. */
  device?: string;
};

export type SafetyGroupStyle = "cells" | "chips" | "digits";
export type SafetyDensity = "compact" | "regular" | "roomy";
export type SafetyStatus = "ready" | "loading" | "error";
export type SafetyCompareResult = "same" | "different";

export type SafetyNumbersProps = {
  /** The safety number this device computed: digits, any spacing. @default defaultYourCode */
  yourCode?: string;
  /** The number on the contact's device, as read or scanned. @default defaultTheirCode */
  theirCode?: string;
  /** Who is being verified. @default defaultSafetyContact */
  contact?: SafetyContact;
  /** How this side is named over its grid. @default "Your phone" */
  youName?: string;
  /** Controlled verified state. */
  verified?: boolean;
  /** Initial verified state when uncontrolled. @default false */
  defaultVerified?: boolean;
  /** "Mark as verified" was pressed (every group matches). */
  onVerify?: () => void;
  /** "Clear verification" was pressed. */
  onReset?: () => void;
  /** "Scan code" was pressed: scan the contact's code with the camera. */
  onScan?: () => void;
  /** A group was compared aloud: its index and whether the contact read the same. */
  onCompare?: (index: number, result: SafetyCompareResult) => void;
  /** The contact's number changed since you last verified: a warning shows first. @default false */
  changed?: boolean;
  /** The number before the change; groups that differ from it carry a dot. */
  previousCode?: string;
  /** "Compare the new number" was pressed on the warning. */
  onAcknowledgeChange?: () => void;
  /** When the chat was verified, in ms since the epoch. */
  verifiedAt?: number;
  /** The moment relative times count from, in ms (never read from the clock). @default defaultSafetyNow */
  now?: number;
  /** Digits per group. @default 5 */
  groupSize?: number;
  /** Groups per row. @default 3 */
  columns?: number;
  /** Groups as hairline cells, filled chips, or one box per digit. @default "cells" */
  groupStyle?: SafetyGroupStyle;
  /** Digit size, grid gaps and padding. @default "regular" */
  density?: SafetyDensity;
  /** Compare outline, connector, ticks and seal — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Draw your number as a scannable code yourself. @default a seeded picture of the digits */
  renderCode?: (code: string) => React.ReactNode;
  /** Whether the numbers have loaded. @default "ready" */
  status?: SafetyStatus;
  /** "Try again" was pressed after the numbers failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the body scrolls inside it. @default 540 */
  height?: number;
  /** Read only: the numbers show, nothing can be marked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** A seeded 60-digit number: the same on the server and in the browser. */
const seededDigits = (seed: number, count = 60) => {
  let s = seed >>> 0;
  let out = "";
  for (let i = 0; i < count; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out += String(s % 10);
  }
  return out;
};

export const defaultYourCode = seededDigits(1781);
export const defaultTheirCode = defaultYourCode;
export const defaultSafetyContact: SafetyContact = {
  name: "Rafi Okafor",
  handle: "@rafi · Waylight",
  device: "Rafi's phone",
};
/** A fixed afternoon, so relative times render the same everywhere. */
export const defaultSafetyNow = Date.UTC(2026, 9, 15, 16, 30);

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  SafetyDensity,
  { digit: string; cell: string; gap: string; pad: string; box: string }
> = {
  compact: {
    digit: "text-[13px] @max-[24rem]/safety-numbers:text-[12px]",
    cell: "h-8",
    gap: "gap-1.5",
    pad: "p-2.5",
    box: "max-w-[13px]",
  },
  regular: {
    digit: "text-[15px] @max-[24rem]/safety-numbers:text-[13px]",
    cell: "h-9 @min-[40rem]/safety-numbers:h-10",
    gap: "gap-2",
    pad: "p-3",
    box: "max-w-[15px]",
  },
  roomy: {
    digit: "text-[17px] @max-[24rem]/safety-numbers:text-[14px]",
    cell: "h-10 @min-[40rem]/safety-numbers:h-12",
    gap: "gap-2.5",
    pad: "p-3.5",
    box: "max-w-[17px]",
  },
};

const r1 = (v: number) => Math.round(v * 10) / 10;

const groupsOf = (code: string, size: number) => {
  const digits = code.replace(/\D/g, "");
  const out: string[] = [];
  for (let i = 0; i < digits.length; i += Math.max(1, size)) {
    out.push(digits.slice(i, i + Math.max(1, size)));
  }
  return out;
};

const spaced = (group: string) => group.split("").join(" ");

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** FNV-1a, unsigned. */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/**
 * A scannable-looking code for the digits: three finder squares and a
 * seeded field, drawn as one crisp path. It is a picture of the number, not a
 * standard encoding.
 */
function qrPath(code: string, size = 25) {
  let s = hash(code) || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
  const ring = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - ox;
    const dy = y - oy;
    const edge = dx === 0 || dy === 0 || dx === 6 || dy === 6;
    const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
    return edge || core;
  };
  let d = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let on: boolean;
      if (finder(x, y)) {
        const ox = x < 7 ? 0 : size - 7;
        const oy = y < 7 ? 0 : size - 7;
        on = ring(x, y, ox, oy);
      } else if (
        (x === 7 && y < 8) ||
        (y === 7 && x < 8) ||
        (x === size - 8 && y < 8) ||
        (y === 7 && x >= size - 8) ||
        (x === 7 && y >= size - 8) ||
        (y === size - 8 && x < 8)
      ) {
        on = false;
      } else if (y === 6 || x === 6) {
        on = (x + y) % 2 === 0;
      } else {
        on = rand() > 0.52;
      }
      if (on) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    }
  }
  return d;
}

/* ----------------------------------------------------------------------- */
/*                                The groups                                */
/* ----------------------------------------------------------------------- */

type CellState = {
  match: boolean;
  compared?: SafetyCompareResult;
  fresh: boolean;
};

function GroupFace({
  group,
  style,
  d,
  muted,
}: {
  group: string;
  style: SafetyGroupStyle;
  d: (typeof DENSITY)[SafetyDensity];
  muted?: boolean;
}) {
  if (style === "digits") {
    return (
      <span className="flex w-full items-center justify-center gap-[2px] px-0.5">
        {group.split("").map((digit, i) => (
          <span
            key={i}
            className={cn(
              "flex h-[1.5em] min-w-0 flex-1 items-center justify-center rounded-1 border border-hairline bg-surface-1 font-mono tabular-nums",
              d.box,
              muted ? "text-ink-3" : "text-foreground",
            )}
          >
            {digit}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-mono tracking-[0.14em] tabular-nums @max-[24rem]/safety-numbers:tracking-[0.06em]",
        muted ? "text-ink-3" : "text-foreground",
      )}
      style={{ marginRight: "-0.14em" }}
    >
      {group}
    </span>
  );
}

function GroupCell({
  id,
  group,
  index,
  state,
  side,
  verified,
  order,
  total,
  style,
  d,
  tabbable,
  linked,
  cursor,
  layoutId,
  motionSafe,
  onFocusCell,
  onHover,
  onKey,
  register,
}: {
  id: string;
  group: string;
  index: number;
  state: CellState;
  side: "yours" | "theirs";
  verified: boolean;
  order: number;
  total: number;
  style: SafetyGroupStyle;
  d: (typeof DENSITY)[SafetyDensity];
  tabbable: boolean;
  linked: boolean;
  cursor: boolean;
  layoutId: string;
  motionSafe: boolean;
  onFocusCell: (index: number | null) => void;
  onHover: (index: number | null) => void;
  onKey: (event: React.KeyboardEvent, index: number) => void;
  register: (
    side: "yours" | "theirs",
    index: number,
    node: HTMLElement | null,
  ) => void;
}) {
  const flipped = verified && state.match;
  const step = cascade(total);
  const delay = flipped ? order * step : (total - 1 - order) * step * 0.5;
  const wrong =
    state.compared === "different" || (state.compared && !state.match);
  const label = `Group ${index + 1}: ${spaced(group)}${
    flipped
      ? ", verified"
      : wrong
        ? ", does not match"
        : state.compared === "same"
          ? ", read the same"
          : ""
  }${state.fresh ? ", new since the change" : ""}`;
  const ref = React.useCallback(
    (node: HTMLElement | null) => register(side, index, node),
    [register, side, index],
  );
  const shell = cn(
    "absolute inset-0 flex items-center justify-center [backface-visibility:hidden]",
    style === "chips" ? "rounded-full" : "rounded-2",
  );
  const front = cn(
    shell,
    style === "cells" && "border border-hairline bg-surface-1",
    style === "chips" && "bg-surface-2",
    style === "digits" && "bg-transparent",
    linked &&
      !cursor &&
      "bg-[color-mix(in_oklab,var(--sn-accent)_9%,var(--card))]",
    wrong &&
      "border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,var(--card))]",
  );

  return (
    <div
      ref={ref}
      role="gridcell"
      id={id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      onFocus={() => onFocusCell(index)}
      onBlur={() => onFocusCell(null)}
      onPointerEnter={() => onHover(index)}
      onPointerLeave={() => onHover(null)}
      onKeyDown={(event) => onKey(event, index)}
      className={cn(
        "relative [perspective:640px]",
        d.cell,
        style === "chips" ? "rounded-full" : "rounded-2",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
    >
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        initial={false}
        animate={motionSafe ? { rotateX: flipped ? 180 : 0 } : { rotateX: 0 }}
        transition={
          motionSafe
            ? { ...springs.glide, delay: Math.round(delay * 100) / 100 }
            : { duration: 0 }
        }
      >
        <div
          className={cn(front, motionSafe ? "" : "transition-opacity")}
          style={
            !motionSafe
              ? {
                  opacity: flipped ? 0 : 1,
                  transitionDelay: `${Math.round(delay * 500)}ms`,
                }
              : undefined
          }
        >
          <GroupFace group={group} style={style} d={d} />
          {wrong ? (
            <span
              aria-hidden
              className="absolute inset-x-2 top-1/2 h-px bg-[color-mix(in_oklab,var(--danger)_70%,transparent)]"
            />
          ) : null}
          {state.compared === "same" && state.match ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 size-1.5 rounded-full bg-[var(--sn-accent)]"
            />
          ) : null}
          {state.fresh ? (
            <span
              aria-hidden
              className="absolute top-1 left-1 size-1.5 rounded-full bg-[oklch(from_var(--warn)_0.7_c_h)]"
            />
          ) : null}
        </div>
        <div
          aria-hidden
          className={cn(
            shell,
            "gap-1.5 bg-[color-mix(in_oklab,var(--sn-accent)_13%,var(--card))]",
            style === "cells" &&
              "border border-[color-mix(in_oklab,var(--sn-accent)_35%,transparent)]",
            motionSafe ? "[transform:rotateX(180deg)]" : "transition-opacity",
          )}
          style={
            !motionSafe
              ? {
                  opacity: flipped ? 1 : 0,
                  transitionDelay: `${Math.round(delay * 500)}ms`,
                }
              : undefined
          }
        >
          <Check
            className="size-3.5 shrink-0 text-[var(--sn-ink)]"
            strokeWidth={2.6}
          />
          <span
            className={cn(
              "font-mono tracking-[0.1em] text-ink-2 tabular-nums",
              "text-[0.8em]",
            )}
          >
            {group}
          </span>
        </div>
      </motion.div>
      {cursor ? (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-[3px] border-2 border-[var(--sn-accent)]",
            style === "chips" ? "rounded-full" : "rounded-[9px]",
          )}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * Verify an end-to-end encrypted chat by comparing numbers. Both safety
 * numbers sit side by side as grids of five-digit groups; pointing at or
 * focusing a group lights its partner and draws a hairline between them. The
 * compare-aloud stepper walks the pairs one at a time with an outline that
 * travels cell to cell on `springs.snap`, and every group is a grid cell whose
 * name spells its digits so a screen reader reads them one by one.
 *
 * Marking the chat verified flips each matched pair over — a real 3D turn on
 * `springs.glide`, both grids together, staggered in reading order by
 * `cascade()` — to a calm tick, and once the last one lands a seal settles on
 * the contact on `springs.snap` with a single ring breathing out. A changed
 * number shows its warning first. Under reduced motion the ticks cross-fade
 * in the same order and the seal fades in place.
 */
export function SafetyNumbers({
  yourCode = defaultYourCode,
  theirCode = defaultTheirCode,
  contact = defaultSafetyContact,
  youName = "Your phone",
  verified,
  defaultVerified = false,
  onVerify,
  onReset,
  onScan,
  onCompare,
  changed = false,
  previousCode,
  onAcknowledgeChange,
  verifiedAt,
  now = defaultSafetyNow,
  groupSize = 5,
  columns = 3,
  groupStyle = "cells",
  density = "regular",
  accent = "var(--accent-bright)",
  renderCode,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: SafetyNumbersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density];
  const cols = Math.max(1, Math.round(columns));

  const yours = React.useMemo(
    () => groupsOf(yourCode, groupSize),
    [yourCode, groupSize],
  );
  const theirs = React.useMemo(
    () => groupsOf(theirCode, groupSize),
    [theirCode, groupSize],
  );
  const before = React.useMemo(
    () => (previousCode ? groupsOf(previousCode, groupSize) : []),
    [previousCode, groupSize],
  );
  const count = Math.max(yours.length, theirs.length);
  const match = React.useMemo(
    () => Array.from({ length: count }, (_, i) => yours[i] === theirs[i]),
    [count, yours, theirs],
  );
  const mismatches = match.filter((m) => !m).length;

  const [ownVerified, setOwnVerified] = React.useState(defaultVerified);
  const isVerified = (verified ?? ownVerified) && mismatches === 0;
  const [ack, setAck] = React.useState(false);
  const warning = changed && !ack;

  const [compared, setCompared] = React.useState<
    (SafetyCompareResult | undefined)[]
  >([]);
  const [comparing, setComparing] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [view, setView] = React.useState<"digits" | "qr">("digits");
  const [focusCell, setFocusCell] = React.useState({ yours: 0, theirs: 0 });
  const [hover, setHover] = React.useState<number | null>(null);
  const [focused, setFocused] = React.useState<number | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  // Each verify replays the seal; each reset lets it leave.
  const [sealKey, setSealKey] = React.useState(0);

  const sameCount = compared.filter((c, i) => c === "same" && match[i]).length;
  const firstWrong = compared.findIndex(
    (c, i) => c === "different" || (c === "same" && !match[i]),
  );
  const allSame = sameCount === count;
  const linked = comparing ? cursor : (focused ?? hover);

  /* ------------------------------ connector ------------------------------ */

  const gridsRef = React.useRef<HTMLDivElement | null>(null);
  const cells = React.useRef({
    yours: new Map<number, HTMLElement>(),
    theirs: new Map<number, HTMLElement>(),
  });
  const register = React.useCallback(
    (side: "yours" | "theirs", index: number, node: HTMLElement | null) => {
      if (node) cells.current[side].set(index, node);
      else cells.current[side].delete(index);
    },
    [],
  );
  const [line, setLine] = React.useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [gridsWidth, setGridsWidth] = React.useState(0);

  React.useEffect(() => {
    const node = gridsRef.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setGridsWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [status, warning]);

  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const box = gridsRef.current?.getBoundingClientRect();
      const a = linked === null ? undefined : cells.current.yours.get(linked);
      const b = linked === null ? undefined : cells.current.theirs.get(linked);
      if (!box || !a || !b || view !== "digits") {
        setLine(null);
        return;
      }
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      // Side by side only: stacked grids carry the pairing in the outline.
      if (rb.left < ra.right) {
        setLine(null);
        return;
      }
      setLine({
        x1: r1(ra.right - box.left + 3),
        y1: r1(ra.top + ra.height / 2 - box.top),
        x2: r1(rb.left - box.left - 3),
        y2: r1(rb.top + rb.height / 2 - box.top),
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [linked, gridsWidth, view, density, groupStyle]);

  /* ------------------------------- actions ------------------------------- */

  const verify = () => {
    if (disabled || mismatches > 0 || isVerified) return;
    if (verified === undefined) setOwnVerified(true);
    setComparing(false);
    setSealKey((k) => k + 1);
    onVerify?.();
    say(`Verified. Your chat with ${contact.name} is end-to-end encrypted.`);
  };

  const reset = () => {
    if (disabled) return;
    if (verified === undefined) setOwnVerified(false);
    setCompared([]);
    setCursor(0);
    onReset?.();
    say("Verification cleared.");
  };

  const startCompare = () => {
    setComparing(true);
    setCompared([]);
    setCursor(0);
    say(
      `Group 1 of ${count}: ${spaced(yours[0] ?? "")}. Does ${contact.name.split(" ")[0]} read the same?`,
    );
  };

  const answer = (result: SafetyCompareResult) => {
    const i = cursor;
    const next = [...compared];
    next[i] = result;
    setCompared(next);
    onCompare?.(i, result);
    const bad = result === "different" || !match[i];
    if (bad) {
      say(`Group ${i + 1} doesn't match. Don't verify.`);
      return;
    }
    if (i + 1 < count) {
      setCursor(i + 1);
      say(`Group ${i + 2} of ${count}: ${spaced(yours[i + 1] ?? "")}.`);
    } else {
      say(`All ${count} groups match.`);
    }
  };

  /* ------------------------------ keyboard ------------------------------- */

  const onCellKey =
    (side: "yours" | "theirs") =>
    (event: React.KeyboardEvent, index: number) => {
      let next = -1;
      const row = Math.floor(index / cols);
      switch (event.key) {
        case "ArrowRight":
          next = Math.min(count - 1, index + 1);
          break;
        case "ArrowLeft":
          next = Math.max(0, index - 1);
          break;
        case "ArrowDown":
          next = Math.min(count - 1, index + cols);
          break;
        case "ArrowUp":
          next = Math.max(0, index - cols);
          break;
        case "Home":
          next = event.ctrlKey ? 0 : row * cols;
          break;
        case "End":
          next = event.ctrlKey
            ? count - 1
            : Math.min(count - 1, row * cols + cols - 1);
          break;
        default:
          return;
      }
      event.preventDefault();
      setFocusCell((f) => ({ ...f, [side]: next }));
      cells.current[side].get(next)?.focus();
    };

  /* -------------------------------- render ------------------------------- */

  const first = contact.name.split(" ")[0] ?? contact.name;
  const hue = hash(contact.name) % 360;
  const step = cascade(count);
  const sealDelay = motionSafe ? r1((count * step + 0.35) * 10) / 10 : 0;

  const statusChip = isVerified
    ? { text: "Verified", tone: "text-[var(--sn-ink)]", Icon: ShieldCheck }
    : warning
      ? { text: "Number changed", tone: "text-warn", Icon: ShieldAlert }
      : comparing
        ? {
            text: `Comparing · ${Math.min(cursor + 1, count)} of ${count}`,
            tone: "text-ink-2",
            Icon: Speech,
          }
        : { text: "Not verified", tone: "text-ink-3", Icon: ShieldAlert };

  const header = (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
      <div className="relative shrink-0">
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full font-mono text-[13px] font-semibold"
          style={{
            backgroundColor: `color-mix(in oklab, oklch(0.7 0.11 ${hue}) 28%, var(--card))`,
            color: `color-mix(in oklab, oklch(0.6 0.13 ${hue}) 75%, var(--foreground))`,
          }}
        >
          {initials(contact.name)}
        </span>
        <AnimatePresence>
          {isVerified ? (
            <motion.span
              key={`seal-${sealKey}`}
              aria-hidden
              className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-card bg-[var(--sn-button)] text-white"
              initial={
                motionSafe
                  ? { scale: 1.3, rotate: -18, opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{
                opacity: 0,
                scale: 0.8,
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? {
                      ...springs.snap,
                      delay: sealDelay,
                      opacity: { duration: durations.fast, delay: sealDelay },
                    }
                  : { duration: durations.base }
              }
            >
              <ShieldCheck className="size-3" strokeWidth={2.4} />
              {motionSafe ? (
                <motion.span
                  className="absolute inset-0 rounded-full border border-[var(--sn-accent)]"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 2.2, opacity: 0 }}
                  transition={{
                    duration: 0.9,
                    delay: sealDelay + 0.1,
                    ease: easings.enter,
                  }}
                />
              ) : null}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="min-w-0 flex-1 basis-36">
        <p id={titleId} className="truncate text-sm font-semibold">
          Verify {contact.name}
        </p>
        <p className="truncate text-[11px] text-ink-3">
          {contact.handle ?? "Safety number"}
          {isVerified && verifiedAt
            ? ` · verified ${ago(verifiedAt, now)}`
            : ""}
        </p>
      </div>
      <span
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors",
          statusChip.tone,
        )}
      >
        <statusChip.Icon aria-hidden className="size-3" />
        {statusChip.text}
      </span>
    </header>
  );

  const card = (side: "yours" | "theirs") => {
    const groups = side === "yours" ? yours : theirs;
    const label =
      side === "yours" ? youName : (contact.device ?? `${first}'s phone`);
    const showQr = side === "yours" && view === "qr";
    return (
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-card",
          d.pad,
        )}
      >
        <div className="flex h-7 items-center justify-between gap-2">
          <p
            id={`${uid}-${side}-label`}
            className="truncate text-[12px] font-medium text-foreground"
          >
            {label}
          </p>
          {side === "yours" ? (
            <div
              role="radiogroup"
              aria-label="Show your number as"
              className="flex shrink-0 rounded-2 border border-hairline"
            >
              {(["digits", "qr"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  aria-label={v === "digits" ? "Digits" : "Code to scan"}
                  tabIndex={view === v ? 0 : -1}
                  onClick={() => setView(v)}
                  onKeyDown={(event) => {
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      const nextView = view === "digits" ? "qr" : "digits";
                      setView(nextView);
                      (
                        event.currentTarget.parentElement?.querySelector(
                          `[aria-label="${nextView === "digits" ? "Digits" : "Code to scan"}"]`,
                        ) as HTMLElement | null
                      )?.focus();
                    }
                  }}
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-1 transition-colors",
                    view === v
                      ? "bg-surface-2 text-foreground"
                      : "text-ink-3 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  {v === "digits" ? (
                    <Grid3x3 aria-hidden className="size-3.5" />
                  ) : (
                    <QrCode aria-hidden className="size-3.5" />
                  )}
                </button>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              As read
            </span>
          )}
        </div>
        <div className="grid">
          <AnimatePresence initial={false}>
            {showQr ? (
              <motion.div
                key="qr"
                className="col-start-1 row-start-1 flex items-center justify-center"
                initial={
                  motionSafe ? { opacity: 0, scale: 0.97 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                {renderCode ? (
                  renderCode(yourCode)
                ) : (
                  <svg
                    role="img"
                    aria-label={`Code for ${first} to scan`}
                    viewBox="0 0 29 29"
                    shapeRendering="crispEdges"
                    className="aspect-square w-full max-w-40 rounded-2 bg-white p-1"
                  >
                    <path d={qrPath(yourCode)} fill="oklch(0.2 0.02 258)" />
                  </svg>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="digits"
                role="grid"
                aria-labelledby={`${uid}-${side}-label`}
                aria-describedby={`${uid}-grid-hint`}
                className={cn("col-start-1 row-start-1 flex flex-col", d.gap)}
                initial={motionSafe ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base }}
              >
                {Array.from({ length: Math.ceil(count / cols) }, (_, r) => (
                  <div
                    key={r}
                    role="row"
                    className={cn("grid", d.gap, d.digit)}
                    style={{
                      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: cols }, (_, c) => {
                      const i = r * cols + c;
                      const group = groups[i];
                      if (group === undefined)
                        return <span key={c} role="gridcell" aria-hidden />;
                      return (
                        <GroupCell
                          key={i}
                          id={`${uid}-${side}-${i}`}
                          group={group}
                          index={i}
                          state={{
                            match: match[i] ?? false,
                            compared: compared[i],
                            fresh:
                              before.length > 0 &&
                              before[i] !== yours[i] &&
                              !warning,
                          }}
                          side={side}
                          verified={isVerified}
                          order={i}
                          total={count}
                          style={groupStyle}
                          d={d}
                          tabbable={focusCell[side] === i}
                          linked={linked === i}
                          cursor={comparing && cursor === i}
                          layoutId={`${uid}-cursor-${side}`}
                          motionSafe={motionSafe}
                          onFocusCell={(index) => {
                            setFocused(index);
                            if (index !== null)
                              setFocusCell((f) => ({ ...f, [side]: index }));
                          }}
                          onHover={setHover}
                          onKey={onCellKey(side)}
                          register={register}
                        />
                      );
                    })}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const comparePanel = (
    <AnimatePresence initial={false}>
      {comparing && !isVerified ? (
        <motion.div
          key="compare"
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
          <div
            role="group"
            aria-labelledby={`${uid}-cmp-title`}
            className="mt-3 flex flex-col gap-3 rounded-3 border border-[color-mix(in_oklab,var(--sn-accent)_30%,var(--hairline))] bg-[color-mix(in_oklab,var(--sn-accent)_5%,var(--card))] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                id={`${uid}-cmp-title`}
                className="text-[12px] font-medium text-foreground"
              >
                {firstWrong >= 0
                  ? `Group ${firstWrong + 1} doesn't match`
                  : allSame
                    ? `All ${count} groups match`
                    : `Read group ${cursor + 1} of ${count} aloud`}
              </p>
              <ol aria-hidden className="flex flex-wrap gap-1">
                {Array.from({ length: count }, (_, i) => (
                  <li
                    key={i}
                    className={cn(
                      "size-1.5 rounded-full transition-colors",
                      compared[i] === "same" && match[i]
                        ? "bg-[var(--sn-accent)]"
                        : compared[i]
                          ? "bg-[oklch(from_var(--danger)_0.62_c_h)]"
                          : i === cursor
                            ? "bg-ink-2"
                            : "bg-hairline-strong",
                    )}
                  />
                ))}
              </ol>
            </div>
            {firstWrong >= 0 ? (
              <p className="text-[12px] text-ink-2">
                Don&apos;t mark this chat verified. Ask {first} to open your
                chat and compare again; if it still differs, someone may be
                between you.
              </p>
            ) : allSame ? (
              <p className="text-[12px] text-ink-2">
                Every group {first} read matches yours.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="grid">
                  <AnimatePresence initial={false}>
                    <motion.p
                      key={cursor}
                      className="col-start-1 row-start-1 font-mono text-[22px] leading-none tracking-[0.3em] text-foreground tabular-nums"
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.step }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        y: motionSafe ? -distances.step : 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              y: springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {yours[cursor]}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <p className="min-w-0 flex-1 basis-40 text-[12px] text-ink-2">
                  Does {first} read the same five digits?
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {firstWrong >= 0 || allSame ? (
                <>
                  {allSame && firstWrong < 0 ? (
                    <button
                      type="button"
                      onClick={verify}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-2 bg-[var(--sn-button)] px-3 text-[12px] font-medium text-white",
                        FOCUS_RING,
                      )}
                    >
                      <ShieldCheck aria-hidden className="size-3.5" />
                      Mark as verified
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={startCompare}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Start over
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => answer("same")}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 bg-[var(--sn-button)] px-3 text-[12px] font-medium text-white",
                      FOCUS_RING,
                    )}
                  >
                    <Check aria-hidden className="size-3.5" />
                    Same
                  </button>
                  <button
                    type="button"
                    onClick={() => answer("different")}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                    Different
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setComparing(false);
                  say("Stopped comparing.");
                }}
                className={cn(
                  "ml-auto inline-flex h-8 items-center rounded-2 px-2.5 text-[12px] text-ink-3 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                Stop
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const warningPanel = (
    <section
      aria-labelledby={`${uid}-warn-title`}
      className="flex flex-col gap-3 rounded-3 border border-[color-mix(in_oklab,var(--warn)_45%,var(--hairline))] bg-[color-mix(in_oklab,var(--warn)_8%,var(--card))] p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--warn)_18%,var(--card))] text-warn"
        >
          <ShieldAlert className="size-4" />
        </span>
        <div className="min-w-0">
          <p
            id={`${uid}-warn-title`}
            className="text-sm font-semibold text-foreground"
          >
            {first}&apos;s safety number changed
          </p>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">
            This happens when {first} reinstalls Waylight or moves to a new
            phone. It can also mean someone is between you. Compare the new
            number before you send anything sensitive.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setAck(true);
          onAcknowledgeChange?.();
          say("Showing the new number.");
        }}
        className={cn(
          "inline-flex h-8 w-fit items-center gap-1.5 rounded-2 bg-[oklch(from_var(--warn)_0.5_c_h)] px-3 text-[12px] font-medium text-white",
          FOCUS_RING,
        )}
      >
        Compare the new number
      </button>
    </section>
  );

  const body = (
    <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-4 py-3">
      <p id={`${uid}-grid-hint`} className="sr-only">
        Arrow keys move between groups; each group reads its five digits.
      </p>
      {warning ? (
        warningPanel
      ) : (
        <>
          <p className="mb-3 text-[13px] leading-5 text-ink-2">
            {isVerified
              ? `You and ${first} compared these numbers. Messages in this chat are end-to-end encrypted.`
              : `Compare these numbers with ${first}, in person or on a call. If every group matches, your messages are end-to-end encrypted.`}
          </p>
          {changed && ack ? (
            <p className="mb-3 flex items-center gap-1.5 rounded-2 bg-[color-mix(in_oklab,var(--warn)_10%,var(--card))] px-2.5 py-1.5 text-[12px] text-ink-2">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-[oklch(from_var(--warn)_0.7_c_h)]"
              />
              New number. Dotted groups changed; compare before you trust it.
            </p>
          ) : null}
          {mismatches > 0 ? (
            <p
              role="note"
              className="mb-3 flex items-center gap-1.5 text-[12px] text-danger"
            >
              <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
              {mismatches === 1
                ? `Group ${match.indexOf(false) + 1} doesn't match.`
                : `Groups ${match
                    .map((m, i) => (m ? 0 : i + 1))
                    .filter(Boolean)
                    .join(", ")} don't match.`}{" "}
              Don&apos;t verify.
            </p>
          ) : null}
          <div ref={gridsRef} className="relative">
            <div className="grid grid-cols-1 gap-3 @min-[40rem]/safety-numbers:grid-cols-2 @min-[40rem]/safety-numbers:gap-8">
              {card("yours")}
              {card("theirs")}
            </div>
            {line ? (
              <svg
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
              >
                <motion.path
                  d={`M${line.x1} ${line.y1} C${r1((line.x1 + line.x2) / 2)} ${line.y1} ${r1((line.x1 + line.x2) / 2)} ${line.y2} ${line.x2} ${line.y2}`}
                  fill="none"
                  stroke="var(--sn-accent)"
                  strokeWidth="1.25"
                  initial={motionSafe ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: durations.fast }}
                />
                <circle
                  cx={line.x1}
                  cy={line.y1}
                  r="2.5"
                  fill="var(--sn-accent)"
                />
                <circle
                  cx={line.x2}
                  cy={line.y2}
                  r="2.5"
                  fill="var(--sn-accent)"
                />
              </svg>
            ) : null}
          </div>
          {comparePanel}
          <AnimatePresence initial={false}>
            {isVerified ? (
              <motion.div
                key="verified"
                className="mt-3 flex items-start gap-2.5 rounded-3 border border-[color-mix(in_oklab,var(--sn-accent)_25%,var(--hairline))] bg-[color-mix(in_oklab,var(--sn-accent)_5%,var(--card))] px-3 py-2.5"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        y: { ...springs.glide, delay: sealDelay },
                        opacity: { duration: durations.base, delay: sealDelay },
                      }
                    : { duration: durations.base }
                }
              >
                <ShieldCheck
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-[var(--sn-ink)]"
                />
                <p className="text-[12px] leading-5 text-ink-2">
                  <span className="font-medium text-foreground">
                    Verified{verifiedAt ? ` ${ago(verifiedAt, now)}` : ""}.
                  </span>{" "}
                  If {first}&apos;s safety number changes, you&apos;ll see a
                  warning here before you send anything.
                </p>
              </motion.div>
            ) : !comparing && mismatches === 0 ? (
              <motion.p
                key="hint"
                className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base }}
              >
                <Speech aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                Read the groups to each other on a call, or scan {first}
                &apos;s code when you&apos;re together.
              </motion.p>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </div>
  );

  const actions =
    disabled || warning ? null : (
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        <button
          type="button"
          onClick={() => {
            onScan?.();
            say(`Scanning ${first}'s code.`);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <ScanLine aria-hidden className="size-3.5" />
          <span className="@max-[30rem]/safety-numbers:hidden">Scan code</span>
          <span className="@max-[22rem]/safety-numbers:sr-only @min-[30rem]/safety-numbers:hidden">
            Scan
          </span>
        </button>
        {!isVerified ? (
          <button
            type="button"
            aria-pressed={comparing}
            onClick={() => (comparing ? setComparing(false) : startCompare())}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-[12px] transition-colors",
              comparing
                ? "border-[color-mix(in_oklab,var(--sn-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--sn-accent)_10%,var(--card))] text-[var(--sn-ink)]"
                : "border-hairline text-foreground hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <Speech aria-hidden className="size-3.5" />
            <span className="@max-[30rem]/safety-numbers:hidden">
              Compare aloud
            </span>
            <span className="@min-[30rem]/safety-numbers:hidden">Compare</span>
          </button>
        ) : null}
        <span className="ml-auto" />
        {isVerified ? (
          <button
            type="button"
            onClick={reset}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span className="@max-[30rem]/safety-numbers:hidden">
              Clear verification
            </span>
            <span className="@min-[30rem]/safety-numbers:hidden">Clear</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={verify}
            aria-disabled={mismatches > 0 || undefined}
            aria-describedby={mismatches > 0 ? `${uid}-why` : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors",
              mismatches > 0
                ? "bg-surface-2 text-ink-3"
                : "bg-[var(--sn-button)] text-white",
              FOCUS_RING,
            )}
          >
            <ShieldCheck aria-hidden className="size-3.5" />
            <span className="@max-[30rem]/safety-numbers:hidden">
              Mark as verified
            </span>
            <span className="@min-[30rem]/safety-numbers:hidden">Verify</span>
          </button>
        )}
        {mismatches > 0 ? (
          <span id={`${uid}-why`} className="sr-only">
            The numbers don&apos;t match.
          </span>
        ) : null}
      </div>
    );

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/safety-numbers flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{
        height,
        ["--sn-accent" as string]: `oklch(from ${accent} 0.62 c h)`,
        ["--sn-button" as string]: `oklch(from ${accent} 0.54 c h)`,
        ["--sn-ink" as string]:
          "color-mix(in oklab, var(--sn-accent) 72%, var(--foreground))",
      }}
    >
      {header}
      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The safety numbers didn&apos;t load.
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
      ) : status === "loading" ? (
        <div
          aria-hidden
          className="grid flex-1 grid-cols-1 gap-3 p-4 @min-[40rem]/safety-numbers:grid-cols-2"
        >
          {[0, 1].map((k) => (
            <div
              key={k}
              className="grid h-fit grid-cols-3 gap-2 rounded-3 border border-hairline p-3"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-9 rounded-2 bg-surface-2",
                    motionSafe && "animate-pulse",
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <>
          {body}
          {actions}
        </>
      )}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
