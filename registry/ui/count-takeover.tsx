"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useTransform,
  type Variants,
} from "motion/react";
import {
  CheckCheck,
  Download,
  Ellipsis,
  Funnel,
  Plus,
  Printer,
  Trash2,
  Truck,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type CountTakeoverState =
  "draft" | "ready" | "transit" | "delivered" | "held";

export type CountTakeoverItem = {
  id: string;
  /** The shipment reference, shown in mono. */
  ref: string;
  destination: string;
  customer: string;
  carrier: string;
  state: CountTakeoverState;
  /** Due date, already formatted ("Oct 19"). */
  due: string;
};

export type CountTakeoverIcon = React.ComponentType<{
  className?: string;
  style?: React.CSSProperties;
}>;

export type CountTakeoverAction = {
  id: string;
  label: string;
  icon: CountTakeoverIcon;
  /** `danger` actions take the danger ink; they never celebrate. @default "default" */
  tone?: "default" | "danger";
  /** Secondary actions are the first to fold into More on narrow widths. @default "primary" */
  priority?: "primary" | "secondary";
  /**
   * Why this action cannot apply to the current selection, as a sentence —
   * or null when it can. A mixed selection answers here.
   */
  reason?: (selected: CountTakeoverItem[]) => string | null;
};

export type CountTakeoverAccentName = "cobalt" | "plum" | "mint" | "ink";
export type CountTakeoverSwapStyle = "rise" | "push" | "fold";
export type CountTakeoverDensity = "compact" | "regular" | "roomy";
export type CountTakeoverStatus = "ready" | "loading" | "error";

export type CountTakeoverProps = {
  /** The rows. @default defaultCountTakeoverItems */
  items?: CountTakeoverItem[];
  /** Controlled selection (item ids). */
  selection?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultSelection?: string[];
  /** Fires from the click, key or action that changed the selection. */
  onSelectionChange?: (ids: string[]) => void;
  /** What the header offers for a selection. @default defaultCountTakeoverActions */
  actions?: CountTakeoverAction[];
  /** What the header offers with nothing selected. @default defaultCountTakeoverIdleActions */
  idleActions?: CountTakeoverAction[];
  /** Fires when an action is taken, with the ids it applies to (empty for idle actions). */
  onAction?: (actionId: string, ids: string[]) => void;
  /** Fires when everything is selected by the header checkbox or Cmd/Ctrl+A. */
  onSelectAll?: (ids: string[]) => void;
  /** Fires when the selection is cleared by Escape, Clear or the header checkbox. */
  onClear?: () => void;
  /** Drop the selection once an action has been taken. @default true */
  clearOnAction?: boolean;
  /** The list's title. @default "Shipments" */
  title?: string;
  /** The line under the title. @default "48 in transit · updated 4 min ago" */
  meta?: string;
  /** What one row is called, for the count. @default { one: "shipment", many: "shipments" } */
  noun?: { one: string; many: string };
  /** Height of the scrolling list, px. @default 168 */
  listHeight?: number;
  /** How the header changes role: vertical rise, a sideways push, or a fold about its axis. @default "rise" */
  swapStyle?: CountTakeoverSwapStyle;
  /** Header and row height: 44/32, 48/40 or 52/48 px. @default "regular" */
  density?: CountTakeoverDensity;
  /** Checkboxes, selection wash, count and primary action: a named accent or any CSS colour. @default "cobalt" */
  accent?: CountTakeoverAccentName | (string & {});
  /** List state: loading shows skeleton rows, error a retry. @default "ready" */
  status?: CountTakeoverStatus;
  /** Called by the error state's Retry. */
  onRetry?: () => void;
  /** Shown when there are no rows. @default "No shipments match this view." */
  emptyText?: string;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultCountTakeoverItems: CountTakeoverItem[] = [
  {
    id: "s1",
    ref: "BSN-20418",
    destination: "Tacoma, WA",
    customer: "Coldbrook Roasters",
    carrier: "Fieldline Freight",
    state: "transit",
    due: "Oct 19",
  },
  {
    id: "s2",
    ref: "BSN-20421",
    destination: "Reno, NV",
    customer: "Gaugeworks Supply",
    carrier: "Waylight Cargo",
    state: "transit",
    due: "Oct 20",
  },
  {
    id: "s3",
    ref: "BSN-20402",
    destination: "Boise, ID",
    customer: "Fernworks Studio",
    carrier: "Fieldline Freight",
    state: "delivered",
    due: "Oct 16",
  },
  {
    id: "s4",
    ref: "BSN-20426",
    destination: "Fresno, CA",
    customer: "Coldbrook Roasters",
    carrier: "Waylight Cargo",
    state: "ready",
    due: "Oct 21",
  },
  {
    id: "s5",
    ref: "BSN-20427",
    destination: "Eugene, OR",
    customer: "Basin Outfitters",
    carrier: "Fieldline Freight",
    state: "draft",
    due: "Oct 22",
  },
  {
    id: "s6",
    ref: "BSN-20411",
    destination: "Spokane, WA",
    customer: "Gaugeworks Supply",
    carrier: "Waylight Cargo",
    state: "held",
    due: "Oct 18",
  },
  {
    id: "s7",
    ref: "BSN-20398",
    destination: "Sacramento, CA",
    customer: "Fernworks Studio",
    carrier: "Fieldline Freight",
    state: "delivered",
    due: "Oct 15",
  },
  {
    id: "s8",
    ref: "BSN-20429",
    destination: "Bend, OR",
    customer: "Basin Outfitters",
    carrier: "Waylight Cargo",
    state: "ready",
    due: "Oct 22",
  },
  {
    id: "s9",
    ref: "BSN-20423",
    destination: "Provo, UT",
    customer: "Coldbrook Roasters",
    carrier: "Fieldline Freight",
    state: "transit",
    due: "Oct 20",
  },
  {
    id: "s10",
    ref: "BSN-20430",
    destination: "Yakima, WA",
    customer: "Gaugeworks Supply",
    carrier: "Waylight Cargo",
    state: "draft",
    due: "Oct 23",
  },
];

const count = (list: CountTakeoverItem[], states: CountTakeoverState[]) =>
  list.filter((item) => states.includes(item.state)).length;

const ofThem = (n: number, total: number, verb: string) =>
  total === 1
    ? `it ${verb}`
    : n === total
      ? `all ${total} ${verb.replace(/^is\b/, "are").replace(/^has\b/, "have")}`
      : `${n} of ${total} ${n === 1 ? verb : verb.replace(/^is\b/, "are").replace(/^has\b/, "have")}`;

export const defaultCountTakeoverActions: CountTakeoverAction[] = [
  {
    id: "deliver",
    label: "Mark delivered",
    icon: CheckCheck,
    reason: (selected) => {
      const done = count(selected, ["delivered"]);
      if (done > 0)
        return `${ofThem(done, selected.length, "is already delivered")}.`;
      const unlabelled = count(selected, ["draft"]);
      if (unlabelled > 0)
        return `${ofThem(unlabelled, selected.length, "has no label yet")}.`;
      return null;
    },
  },
  {
    id: "reassign",
    label: "Reassign",
    icon: Truck,
    reason: (selected) => {
      const done = count(selected, ["delivered"]);
      return done > 0
        ? `delivered shipments keep their carrier, and ${ofThem(done, selected.length, "is delivered")}.`
        : null;
    },
  },
  {
    id: "labels",
    label: "Print labels",
    icon: Printer,
    priority: "secondary",
    reason: (selected) => {
      const done = count(selected, ["delivered"]);
      return done > 0
        ? `${ofThem(done, selected.length, "is already delivered")}, so needs no label.`
        : null;
    },
  },
  {
    id: "export",
    label: "Export CSV",
    icon: Download,
    priority: "secondary",
  },
  {
    id: "cancel",
    label: "Cancel shipment",
    icon: Trash2,
    tone: "danger",
    priority: "secondary",
    reason: (selected) => {
      const gone = count(selected, ["transit", "delivered", "held"]);
      return gone > 0
        ? `only shipments not yet picked up can be cancelled, and ${ofThem(gone, selected.length, "is already moving")}.`
        : null;
    },
  },
];

export const defaultCountTakeoverIdleActions: CountTakeoverAction[] = [
  { id: "filter", label: "Filter", icon: Funnel, priority: "secondary" },
  { id: "new", label: "New shipment", icon: Plus },
];

const NO_SELECTION: string[] = [];
const DEFAULT_NOUN = { one: "shipment", many: "shipments" };

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Number(v.toFixed(3));
const mod10 = (v: number) => ((v % 10) + 10) % 10;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ACCENTS: Record<CountTakeoverAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--ct-accent": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as CountTakeoverAccentName]
      : accent,
    "--ct-wash": "color-mix(in oklab, var(--ct-accent) 9%, transparent)",
    "--ct-soft": "color-mix(in oklab, var(--ct-accent) 32%, transparent)",
    // Ink on the accent flips with the accent's own lightness: light text on
    // a deep accent, deep text on a light one (mint in the dark theme).
    "--ct-on":
      "oklch(from var(--ct-accent) clamp(0.2, (0.7 - l) * 100, 0.99) 0.02 h)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const STATES: Record<
  CountTakeoverState,
  { label: string; chip: string; dot: string }
> = {
  draft: {
    label: "Draft",
    chip: "border-hairline text-ink-3",
    dot: "bg-ink-3",
  },
  ready: {
    label: "Awaiting pickup",
    chip: "border-hairline text-ink-2",
    dot: "bg-ink-2",
  },
  transit: {
    label: "In transit",
    chip: "border-transparent bg-cobalt-wash text-cobalt-bright",
    dot: "bg-cobalt-bright",
  },
  delivered: {
    label: "Delivered",
    chip: "border-transparent bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-success",
    dot: "bg-success",
  },
  held: {
    label: "Held at depot",
    chip: "border-transparent bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-warn",
    dot: "bg-warn",
  },
};

const DENSITY: Record<
  CountTakeoverDensity,
  { header: number; row: number; text: string }
> = {
  compact: { header: 44, row: 32, text: "text-[12.5px]" },
  regular: { header: 48, row: 40, text: "text-[13px]" },
  roomy: { header: 52, row: 48, text: "text-[13.5px]" },
};

/** Layout tiers by the piece's own width, so the toolbar renders exactly what is visible. */
type Tier = "wide" | "mid" | "narrow" | "tiny";
const tierOf = (width: number): Tier =>
  width >= 832
    ? "wide"
    : width >= 544
      ? "mid"
      : width >= 384
        ? "narrow"
        : "tiny";

/* ----------------------------------------------------------------------- */
/*                                 Odometer                                 */
/* ----------------------------------------------------------------------- */

const FACE = 1.2;
const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/**
 * One digit of the count: a strip of eleven faces positioned in "faces" by
 * a motion value and shown mod 10, so it can roll the short way in the
 * direction the count moved without ever spinning back through the others.
 */
function Wheel({
  digit,
  active,
  dir,
  motionSafe,
}: {
  digit: number;
  active: boolean;
  dir: number;
  motionSafe: boolean;
}) {
  const pos = useMotionValue(digit);
  const y = useTransform(pos, (p) => `${-r3(mod10(p) * FACE)}em`);
  React.useEffect(() => {
    const base = mod10(pos.get());
    const gap = mod10(digit - base);
    if (gap < 1e-3 || gap > 10 - 1e-3) return;
    pos.jump(base);
    const target = dir >= 0 ? base + gap : base - (10 - gap);
    if (!motionSafe) {
      pos.jump(target);
      return;
    }
    const controls = animate(pos, target, springs.snap);
    return () => controls.stop();
  }, [digit, dir, motionSafe, pos]);
  return (
    <motion.span
      className="relative inline-block shrink-0 overflow-hidden"
      style={{ height: `${FACE}em` }}
      initial={false}
      animate={{ width: active ? "1ch" : "0ch", opacity: active ? 1 : 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y }}
      >
        {FACES.map((face, i) => (
          <span
            key={i}
            className="block text-center"
            style={{ height: `${FACE}em`, lineHeight: `${FACE}em` }}
          >
            {face}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

function Count({
  value,
  places,
  motionSafe,
}: {
  value: number;
  places: number;
  motionSafe: boolean;
}) {
  const [trail, setTrail] = React.useState({ value, dir: 1 });
  if (trail.value !== value) {
    setTrail({ value, dir: value > trail.value ? 1 : -1 });
  }
  return (
    <span
      aria-hidden
      className="inline-flex items-start font-mono tabular-nums"
      style={{ height: `${FACE}em`, lineHeight: `${FACE}em` }}
    >
      {Array.from({ length: places }, (_, i) => places - 1 - i).map((place) => (
        <Wheel
          key={place}
          digit={Math.floor(value / 10 ** place) % 10}
          active={place === 0 || value >= 10 ** place}
          dir={trail.dir}
          motionSafe={motionSafe}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Checkbox                                  */
/* ----------------------------------------------------------------------- */

/**
 * The box fills on snap from a smaller square, and its tick draws on flick —
 * the fill is the decision landing, the tick the confirmation of it.
 */
function Box({
  state,
  motionSafe,
}: {
  state: boolean | "mixed";
  motionSafe: boolean;
}) {
  const on = state !== false;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors",
        on ? "border-[var(--ct-accent)]" : "border-hairline-strong bg-card",
      )}
      style={{ transitionDuration: `${durations.fast * 1000}ms` }}
    >
      <motion.span
        className="absolute inset-[-1.5px] rounded-[4px] bg-[var(--ct-accent)]"
        initial={false}
        animate={{ scale: on ? 1 : 0.55, opacity: on ? 1 : 0 }}
        transition={
          motionSafe
            ? { scale: springs.snap, opacity: { duration: durations.blink } }
            : { duration: 0 }
        }
      />
      <svg viewBox="0 0 16 16" className="relative size-4" fill="none">
        <motion.path
          d="M 4 8.4 L 6.8 11 L 12 5.2"
          stroke="var(--ct-on)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{
            pathLength: state === true ? 1 : 0,
            opacity: state === true ? 1 : 0,
          }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
        <motion.path
          d="M 4.5 8 H 11.5"
          stroke="var(--ct-on)"
          strokeWidth={2}
          strokeLinecap="round"
          initial={false}
          animate={{
            scaleX: state === "mixed" ? 1 : 0,
            opacity: state === "mixed" ? 1 : 0,
          }}
          style={{ originX: 0.5, originY: 0.5 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      </svg>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Swap layers                                */
/* ----------------------------------------------------------------------- */

type Side = "idle" | "picked";

/**
 * Where a header layer comes from and goes to. The idle layer always lives
 * "before" (above, or to the left) and the selection layer "after", so the
 * reversal is the same path run backwards with no `custom` to thread through.
 */
const travel = (
  style: CountTakeoverSwapStyle,
  side: Side,
  motionSafe: boolean,
) => {
  if (!motionSafe) return { opacity: 0 };
  const sign = side === "idle" ? -1 : 1;
  if (style === "push") return { opacity: 0, x: sign * distances.shift };
  if (style === "fold")
    return { opacity: 0, rotateX: sign * -72, y: sign * distances.nudge };
  return { opacity: 0, y: sign * 12 };
};

function Layer({
  side,
  swapStyle,
  motionSafe,
  className,
  children,
}: {
  side: Side;
  swapStyle: CountTakeoverSwapStyle;
  motionSafe: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const present = useIsPresent();
  const away = travel(swapStyle, side, motionSafe);
  return (
    <motion.div
      // The leaving layer is still painted while it goes, but nothing in it
      // can take focus or a click.
      inert={!present}
      aria-hidden={!present || undefined}
      className={cn("col-start-1 row-start-1", className)}
      style={{
        originY: side === "idle" ? 1 : 0,
      }}
      initial={away}
      animate={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
      exit={{ ...away, transition: exitFor(durations.base) }}
      transition={
        motionSafe
          ? {
              ...springs.snap,
              opacity: { duration: durations.fast, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
    >
      {children}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A list header that changes role when rows are picked. At rest it is the
 * list's title with its own actions; with a selection it becomes that
 * selection's toolbar. The title leaves upward on the exit ease while the
 * count rises in from below on snap, and the actions for the selection rise
 * in a short cascade (`cascade()` per action, snap); clearing runs the same
 * path backwards — the actions sink in reverse order, the count drops away
 * and the title comes back down. While the selection changes, each digit of
 * the count is its own wheel and rolls on snap the way the count moved.
 *
 * Every action can answer a mixed selection with a reason: it stays focusable
 * but `aria-disabled`, and hovering or focusing it slides the sentence in
 * under the header. The list is a multi-select `listbox` (Space toggles,
 * Shift with arrows extends, Shift+click ranges); Cmd or Ctrl+A selects all
 * and Escape clears from anywhere inside. Under reduced motion the header
 * layers cross-fade and the digits swap — the count and the reasons still
 * change, because they are the information.
 */
export function CountTakeover({
  items = defaultCountTakeoverItems,
  selection,
  defaultSelection = NO_SELECTION,
  onSelectionChange,
  actions = defaultCountTakeoverActions,
  idleActions = defaultCountTakeoverIdleActions,
  onAction,
  onSelectAll,
  onClear,
  clearOnAction = true,
  title = "Shipments",
  meta = "48 in transit · updated 4 min ago",
  noun = DEFAULT_NOUN,
  listHeight = 168,
  swapStyle = "rise",
  density = "regular",
  accent = "cobalt",
  status = "ready",
  onRetry,
  emptyText = "No shipments match this view.",
  disabled = false,
  className,
}: CountTakeoverProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;

  const [own, setOwn] = React.useState(defaultSelection);
  const raw = selection ?? own;
  // Ids whose rows have gone are not shown as selected or counted.
  const sel = React.useMemo(
    () => raw.filter((id) => items.some((item) => item.id === id)),
    [items, raw],
  );
  const picked = React.useMemo(
    () => items.filter((item) => sel.includes(item.id)),
    [items, sel],
  );
  const n = picked.length;
  const allIds = React.useMemo(() => items.map((item) => item.id), [items]);
  const headerState: boolean | "mixed" =
    n === 0 ? false : n === items.length ? true : "mixed";

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const [reasonFor, setReasonFor] = React.useState<string | null>(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [tier, setTier] = React.useState<Tier>("mid");

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setTier(tierOf(entry.contentRect.width));
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);

  const optionRefs = React.useRef(new Map<string, HTMLDivElement | null>());
  const headerBox = React.useRef<HTMLButtonElement | null>(null);

  const word = (k: number) => (k === 1 ? noun.one : noun.many);

  const commit = (next: string[], spoken?: string) => {
    if (disabled) return;
    if (selection === undefined) setOwn(next);
    onSelectionChange?.(next);
    if (next.length === 0) {
      setReasonFor(null);
      setMoreOpen(false);
    }
    setAnnouncement(
      spoken ??
        (next.length === 0
          ? "Selection cleared."
          : `${next.length} ${word(next.length)} selected.`),
    );
  };

  const clear = (refocus: boolean) => {
    if (sel.length === 0) return;
    // The selection toolbar is about to leave; focus goes somewhere that stays.
    if (refocus) headerBox.current?.focus();
    commit([]);
    onClear?.();
  };

  const selectAll = () => {
    if (allIds.length === 0) return;
    commit(allIds, `All ${allIds.length} ${word(allIds.length)} selected.`);
    onSelectAll?.(allIds);
  };

  const toggle = (id: string) => {
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    setAnchor(id);
    commit(next);
  };

  const range = (to: string, from = anchor ?? to) => {
    const a = allIds.indexOf(from);
    const b = allIds.indexOf(to);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const span = allIds.slice(lo, hi + 1);
    commit([...new Set([...sel, ...span])]);
  };

  const run = (action: CountTakeoverAction, ids: string[]) => {
    if (disabled) return;
    const why = ids.length > 0 && action.reason ? action.reason(picked) : null;
    if (why) {
      setReasonFor(action.id);
      setAnnouncement(`${action.label} is off: ${why}`);
      return;
    }
    onAction?.(action.id, ids);
    if (ids.length > 0 && clearOnAction) {
      headerBox.current?.focus();
      if (selection === undefined) setOwn([]);
      onSelectionChange?.([]);
      setReasonFor(null);
      setMoreOpen(false);
      setAnnouncement(`${action.label}: ${ids.length} ${word(ids.length)}.`);
    } else if (ids.length > 0) {
      setAnnouncement(`${action.label}: ${ids.length} ${word(ids.length)}.`);
    }
  };

  /* ---------------------------- keyboard ------------------------------- */

  const onRootKey = (event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']"))
      return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      selectAll();
      return;
    }
    if (event.key === "Escape" && sel.length > 0) {
      event.preventDefault();
      const inList = !!target.closest("[role=listbox]");
      clear(!inList);
    }
  };

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    optionRefs.current.get(id)?.focus();
  };

  const onListKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = focusId ?? allIds[0];
    if (!current) return;
    const index = allIds.indexOf(current);
    let to: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        to = allIds[Math.min(allIds.length - 1, index + 1)];
        break;
      case "ArrowUp":
        to = allIds[Math.max(0, index - 1)];
        break;
      case "Home":
        to = allIds[0];
        break;
      case "End":
        to = allIds[allIds.length - 1];
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        toggle(current);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (!to) return;
    focusRow(to);
    if (event.shiftKey) {
      if (!anchor) setAnchor(current);
      range(to, anchor ?? current);
    }
  };

  /* ---------------------------- actions -------------------------------- */

  const folded = tier === "narrow" || tier === "tiny";
  const shown = folded
    ? actions.filter((a) => (a.priority ?? "primary") === "primary")
    : actions;
  const tucked = folded
    ? actions.filter((a) => (a.priority ?? "primary") !== "primary")
    : [];
  const labelled = (a: CountTakeoverAction) =>
    tier === "wide" ||
    ((tier === "mid" || tier === "narrow") &&
      (a.priority ?? "primary") === "primary");

  const toolIds = [
    ...shown.map((a) => a.id),
    ...(tucked.length ? ["__more"] : []),
    "__clear",
  ];
  const [toolFocus, setToolFocus] = React.useState("");
  const rovingTool = toolIds.includes(toolFocus) ? toolFocus : toolIds[0];
  const onToolKey = (event: React.KeyboardEvent) => {
    const i = toolIds.indexOf(rovingTool ?? "");
    let to = -1;
    if (event.key === "ArrowRight") to = Math.min(toolIds.length - 1, i + 1);
    else if (event.key === "ArrowLeft") to = Math.max(0, i - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = toolIds.length - 1;
    if (to < 0) return;
    event.preventDefault();
    const id = toolIds[to];
    if (!id) return;
    setToolFocus(id);
    root
      ?.querySelector<HTMLElement>(`[data-ct-tool="${CSS.escape(id)}"]`)
      ?.focus();
  };

  const reasons = React.useMemo(() => {
    const out = new Map<string, string>();
    if (picked.length === 0) return out;
    for (const a of actions) {
      const why = a.reason?.(picked);
      if (why) out.set(a.id, why);
    }
    return out;
  }, [actions, picked]);

  const reasonAction = reasonFor
    ? actions.find((a) => a.id === reasonFor)
    : undefined;
  const reasonText =
    reasonAction && reasons.get(reasonAction.id)
      ? `${reasonAction.label} is off: ${reasons.get(reasonAction.id)}`
      : null;

  const step = cascade(shown.length + 2);
  const actionVariants: Variants = {
    away: travel(
      swapStyle === "fold" ? "rise" : swapStyle,
      "picked",
      motionSafe,
    ),
    here: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: motionSafe
        ? { ...springs.snap, opacity: { duration: durations.fast } }
        : { duration: durations.fast },
    },
    gone: {
      ...travel(
        swapStyle === "fold" ? "rise" : swapStyle,
        "picked",
        motionSafe,
      ),
      transition: exitFor(durations.fast),
    },
  };
  const groupVariants: Variants = {
    away: {},
    here: {
      transition: motionSafe
        ? { staggerChildren: step, delayChildren: 0.03 }
        : {},
    },
    gone: {
      transition: motionSafe
        ? {
            staggerChildren: step * 0.6,
            staggerDirection: -1,
            when: "afterChildren",
          }
        : {},
    },
  };

  const actionButton = (a: CountTakeoverAction) => {
    const why = reasons.get(a.id);
    const Icon = a.icon;
    const withLabel = labelled(a);
    const primary = a.id === shown[0]?.id;
    return (
      <motion.button
        key={a.id}
        variants={actionVariants}
        data-ct-tool={a.id}
        type="button"
        tabIndex={rovingTool === a.id ? 0 : -1}
        aria-disabled={why ? true : undefined}
        aria-label={withLabel ? undefined : a.label}
        aria-describedby={why ? `${uid}-why-${a.id}` : undefined}
        title={withLabel ? undefined : a.label}
        disabled={disabled}
        onFocus={() => {
          setToolFocus(a.id);
          setReasonFor(why ? a.id : null);
        }}
        onBlur={() => setReasonFor(null)}
        onPointerEnter={() => why && setReasonFor(a.id)}
        onPointerLeave={() => setReasonFor(null)}
        onClick={() => run(a, sel)}
        className={cn(
          "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 text-[12.5px] font-medium transition-colors",
          FOCUS,
          withLabel ? "px-2.5" : "w-8",
          why
            ? "cursor-not-allowed text-ink-3 opacity-60"
            : a.tone === "danger"
              ? "text-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]"
              : primary
                ? "bg-[var(--ct-accent)] text-[var(--ct-on)] hover:bg-[color-mix(in_oklab,var(--ct-accent)_88%,black)]"
                : "text-foreground hover:bg-surface-2",
        )}
      >
        <span aria-hidden className="inline-flex">
          <Icon className="size-4" />
        </span>
        {withLabel ? (
          <span className="whitespace-nowrap">{a.label}</span>
        ) : null}
        {why ? (
          <span id={`${uid}-why-${a.id}`} className="sr-only">
            {why}
          </span>
        ) : null}
      </motion.button>
    );
  };

  /* ----------------------------- render -------------------------------- */

  const on = n > 0;
  const places = Math.max(1, String(Math.max(items.length, 1)).length);

  return (
    <section
      ref={setRoot}
      aria-label={title}
      onKeyDown={onRootKey}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={accentVars(accent)}
    >
      {/* ------------------------------ header ----------------------------- */}
      <div
        className={cn(
          "relative z-10 flex shrink-0 items-center gap-3 border-b px-3 transition-colors @max-[24rem]:gap-2",
          on
            ? "border-[var(--ct-soft)] bg-[var(--ct-wash)]"
            : "border-hairline bg-card",
        )}
        style={{
          height: d.header,
          transitionDuration: `${durations.base * 1000}ms`,
        }}
      >
        <button
          ref={headerBox}
          type="button"
          role="checkbox"
          aria-checked={headerState}
          aria-label={
            headerState === true
              ? `Clear all ${items.length} ${word(items.length)}`
              : `Select all ${items.length} ${word(items.length)}`
          }
          // Off by aria-disabled, not disabled: an action that removes every
          // row lands focus here, and a disabled button would drop it.
          disabled={disabled}
          aria-disabled={
            status !== "ready" || items.length === 0 ? true : undefined
          }
          onClick={() => {
            if (status !== "ready" || items.length === 0) return;
            if (headerState === true) clear(false);
            else selectAll();
          }}
          className={cn(
            "-m-1.5 inline-flex shrink-0 items-center justify-center rounded-2 p-1.5",
            FOCUS,
            "disabled:cursor-not-allowed disabled:opacity-50",
            (status !== "ready" || items.length === 0) &&
              "cursor-not-allowed opacity-50",
          )}
        >
          <Box state={headerState} motionSafe={motionSafe} />
        </button>

        <div
          className="grid min-w-0 flex-1 items-center"
          style={{ perspective: 480 }}
        >
          <AnimatePresence initial={false}>
            {on ? (
              <Layer
                key="picked"
                side="picked"
                swapStyle={swapStyle}
                motionSafe={motionSafe}
                className="min-w-0"
              >
                <p className="flex min-w-0 items-baseline gap-1.5 text-[14px] leading-tight font-semibold">
                  <span className="text-[var(--ct-accent)]">
                    <Count value={n} places={places} motionSafe={motionSafe} />
                  </span>
                  <span aria-hidden className="truncate">
                    {tier === "tiny" ? "selected" : `${word(n)} selected`}
                  </span>
                  <span className="sr-only">{`${n} ${word(n)} selected`}</span>
                </p>
                <p className="truncate text-[11px] leading-tight text-ink-3">
                  {`of ${items.length}`}
                  {reasons.size > 0
                    ? ` · ${reasons.size} ${reasons.size === 1 ? "action" : "actions"} off`
                    : ""}
                </p>
              </Layer>
            ) : (
              <Layer
                key="idle"
                side="idle"
                swapStyle={swapStyle}
                motionSafe={motionSafe}
                className="min-w-0"
              >
                <h3 className="truncate text-[14px] leading-tight font-semibold">
                  {title}
                </h3>
                <p
                  className="truncate text-[11px] leading-tight text-ink-3"
                  title={meta}
                >
                  {meta}
                </p>
              </Layer>
            )}
          </AnimatePresence>
        </div>

        <div
          className="grid shrink-0 items-center justify-items-end"
          style={{ perspective: 480 }}
        >
          <AnimatePresence initial={false}>
            {on ? (
              <motion.div
                key="picked"
                role="toolbar"
                aria-label={`Actions for ${n} ${word(n)}`}
                onKeyDown={onToolKey}
                className={cn(
                  "col-start-1 row-start-1 flex items-center",
                  tier === "tiny" ? "gap-0.5" : "gap-1",
                )}
                variants={groupVariants}
                initial="away"
                animate="here"
                exit="gone"
              >
                {shown.map(actionButton)}
                {tucked.length > 0 ? (
                  <motion.button
                    key="__more"
                    variants={actionVariants}
                    data-ct-tool="__more"
                    type="button"
                    data-ct-trigger=""
                    tabIndex={rovingTool === "__more" ? 0 : -1}
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                    aria-label={`More actions, ${tucked.length}`}
                    disabled={disabled}
                    onFocus={() => setToolFocus("__more")}
                    onClick={() => setMoreOpen((o) => !o)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setMoreOpen(true);
                      }
                    }}
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-foreground hover:bg-surface-2",
                      FOCUS,
                      moreOpen && "bg-surface-2",
                    )}
                  >
                    <Ellipsis aria-hidden className="size-4" />
                  </motion.button>
                ) : null}
                <motion.span
                  key="__rule"
                  variants={actionVariants}
                  aria-hidden
                  className={cn(
                    "mx-0.5 h-5 w-px bg-hairline-strong",
                    tier === "tiny" && "hidden",
                  )}
                />
                <motion.button
                  key="__clear"
                  variants={actionVariants}
                  data-ct-tool="__clear"
                  type="button"
                  tabIndex={rovingTool === "__clear" ? 0 : -1}
                  aria-label="Clear selection"
                  aria-keyshortcuts="Escape"
                  title="Clear selection · Esc"
                  disabled={disabled}
                  onFocus={() => setToolFocus("__clear")}
                  onClick={() => clear(true)}
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </motion.button>
              </motion.div>
            ) : (
              <Layer
                key="idle"
                side="idle"
                swapStyle={swapStyle}
                motionSafe={motionSafe}
                className="flex items-center gap-1"
              >
                {idleActions.map((a, i) => {
                  const Icon = a.icon;
                  const last = i === idleActions.length - 1;
                  const withLabel =
                    tier === "wide" ||
                    tier === "mid" ||
                    (tier === "narrow" && last);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-label={withLabel ? undefined : a.label}
                      title={withLabel ? undefined : a.label}
                      disabled={disabled}
                      onClick={() => run(a, [])}
                      className={cn(
                        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 text-[12.5px] font-medium transition-colors",
                        FOCUS,
                        withLabel ? "px-2.5" : "w-8",
                        last
                          ? "bg-[var(--ct-accent)] text-[var(--ct-on)] hover:bg-[color-mix(in_oklab,var(--ct-accent)_88%,black)]"
                          : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      )}
                    >
                      <span aria-hidden className="inline-flex">
                        <Icon className="size-4" />
                      </span>
                      {withLabel ? (
                        <span className="whitespace-nowrap">{a.label}</span>
                      ) : null}
                    </button>
                  );
                })}
              </Layer>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* --------------------------- reason strip -------------------------- */}
      <AnimatePresence>
        {on && reasonText ? (
          <motion.p
            key="why"
            aria-hidden
            className="absolute inset-x-0 z-[5] flex items-center gap-2 border-b border-hairline bg-card px-3 py-1.5 text-[12px] leading-snug text-ink-2"
            style={{ top: d.header }}
            initial={
              motionSafe ? { opacity: 0, y: -distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-warn"
            />
            <span className="min-w-0">{cap(reasonText)}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* ------------------------------- list ------------------------------ */}
      <div
        className="relative [scrollbar-width:thin] overflow-y-auto overscroll-contain"
        style={{ maxHeight: listHeight }}
      >
        {status === "ready" && items.length > 0 ? (
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={title}
            aria-disabled={disabled || undefined}
            onKeyDown={onListKey}
          >
            {items.map((item) => {
              const isOn = sel.includes(item.id);
              const s = STATES[item.state];
              const focusable =
                (focusId && allIds.includes(focusId) ? focusId : allIds[0]) ===
                item.id;
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    optionRefs.current.set(item.id, el);
                  }}
                  role="option"
                  aria-selected={isOn}
                  aria-label={`${item.ref}, ${item.destination} for ${item.customer}, ${s.label.toLowerCase()}, due ${item.due}`}
                  tabIndex={disabled ? -1 : focusable ? 0 : -1}
                  onFocus={() => setFocusId(item.id)}
                  onClick={(event) => {
                    if (disabled) return;
                    setFocusId(item.id);
                    if (event.shiftKey && anchor) range(item.id);
                    else toggle(item.id);
                  }}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-3 border-b border-hairline px-3 select-none last:border-b-0",
                    "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    d.text,
                    isOn ? "bg-[var(--ct-wash)]" : "hover:bg-surface-2/60",
                  )}
                  style={{ height: d.row }}
                >
                  <Box state={isOn} motionSafe={motionSafe} />
                  <span className="w-[5.6rem] shrink-0 font-mono text-[11.5px] text-ink-2 tabular-nums @max-[24rem]:w-[4.9rem] @max-[24rem]:text-[11px]">
                    {item.ref}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    title={`${item.destination} · ${item.customer}`}
                  >
                    <span className="font-medium">{item.destination}</span>
                    <span className="text-ink-3 @max-[30rem]:hidden">{` · ${item.customer}`}</span>
                  </span>
                  <span className="w-32 shrink-0 truncate text-[12px] text-ink-2 @max-[44rem]:hidden">
                    {item.carrier}
                  </span>
                  {/* A fixed slot, so the carrier column lines up whatever the state. */}
                  <span className="flex w-[7.5rem] shrink-0 @max-[30rem]:w-auto">
                    <span
                      title={s.label}
                      className={cn(
                        "inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
                        s.chip,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("size-1.5 shrink-0 rounded-full", s.dot)}
                      />
                      <span className="@max-[22rem]:sr-only">{s.label}</span>
                    </span>
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums @max-[30rem]:hidden">
                    {item.due}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {status === "loading" ? (
          <div aria-busy="true" aria-label="Loading shipments">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 border-b border-hairline px-3 last:border-b-0"
                style={{ height: d.row }}
              >
                <span className="size-4 rounded-[4px] bg-surface-2" />
                <span className="h-2.5 w-20 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className="h-2.5 flex-1 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ maxWidth: 220 - i * 30 }}
                />
              </div>
            ))}
          </div>
        ) : null}
        {status === "error" ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
            <p className="text-[13px]">Couldn’t load shipments.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : null}
        {status === "ready" && items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">
            {emptyText}
          </p>
        ) : null}
      </div>

      {/* ------------------------------ more ------------------------------- */}
      <AnimatePresence>
        {on && moreOpen && tucked.length > 0 ? (
          <MoreMenu
            key="more"
            top={d.header + 4}
            maxHeight={listHeight - 8}
            entries={tucked.map((a) => ({
              action: a,
              why: reasons.get(a.id) ?? null,
            }))}
            motionSafe={motionSafe}
            onPick={(a) => run(a, sel)}
            onClose={(refocus) => {
              setMoreOpen(false);
              const node = root?.querySelector<HTMLElement>(
                '[data-ct-tool="__more"]',
              );
              if (refocus && node?.isConnected) node.focus();
            }}
          />
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function MoreMenu({
  top,
  maxHeight,
  entries,
  motionSafe,
  onPick,
  onClose,
}: {
  top: number;
  maxHeight: number;
  entries: { action: CountTakeoverAction; why: string | null }[];
  motionSafe: boolean;
  onPick: (action: CountTakeoverAction) => void;
  onClose: (refocus: boolean) => void;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [active, setActive] = React.useState(0);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  React.useEffect(() => {
    if (!node) return;
    refs.current[0]?.focus();
  }, [node]);

  const close = React.useRef(onClose);
  React.useEffect(() => {
    close.current = onClose;
  });
  React.useEffect(() => {
    if (!node) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (
        !target ||
        node.contains(target) ||
        target.closest("[data-ct-trigger]")
      )
        return;
      close.current(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [node]);

  const move = (to: number) => {
    const k = entries.length;
    const i = ((to % k) + k) % k;
    setActive(i);
    refs.current[i]?.focus();
  };

  return (
    <motion.div
      ref={setNode}
      role="menu"
      aria-label="More actions"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(active + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(active - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(0);
        } else if (event.key === "End") {
          event.preventDefault();
          move(entries.length - 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          close.current(true);
        } else if (event.key === "Tab") {
          close.current(false);
        }
      }}
      initial={
        motionSafe
          ? { opacity: 0, y: -distances.nudge, scale: 0.98 }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        motionSafe
          ? { opacity: 0, y: -distances.nudge, transition: exitFor() }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={motionSafe ? springs.snap : { duration: durations.fast }}
      className="absolute right-2 z-20 flex w-60 max-w-[calc(100%-1rem)] origin-top-right [scrollbar-width:thin] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-popover p-1 shadow-lg"
      style={{ top, maxHeight }}
    >
      {entries.map(({ action, why }, i) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={i === active ? 0 : -1}
            aria-disabled={why ? true : undefined}
            onFocus={() => setActive(i)}
            onClick={() => {
              if (why) return;
              onPick(action);
              close.current(false);
            }}
            className={cn(
              "flex shrink-0 items-start gap-2 rounded-2 px-2 py-1.5 text-left text-[12.5px]",
              FOCUS,
              why
                ? "cursor-not-allowed text-ink-3"
                : action.tone === "danger"
                  ? "text-danger hover:bg-surface-2"
                  : "text-foreground hover:bg-surface-2",
            )}
          >
            <span aria-hidden className="mt-px inline-flex">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{action.label}</span>
              {why ? (
                <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">
                  {cap(why)}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </motion.div>
  );
}
