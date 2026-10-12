"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Ban, Inbox, Plus, RotateCcw, TriangleAlert, X } from "lucide-react";

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

export type VetoState = "ignored" | "kept" | "vetoed";

export type VetoGroup = {
  id: string;
  /** The group's name, e.g. "Crew". */
  label: string;
  values: { id: string; label: string }[];
};

/** One work order; `fields` maps a group id to the value id it carries. */
export type VetoRecord = {
  id: string;
  /** Reference, e.g. "WO-1182". */
  ref: string;
  title: string;
  fields: Record<string, string>;
};

/** `group:value` keys kept (any of them, per group) and ruled out. */
export type VetoValue = { include: string[]; exclude: string[] };

export type VetoChange = { key: string; from: VetoState; to: VetoState };
export type VetoChipStyle = "soft" | "outline" | "solid";
export type VetoFlipAxis = "x" | "y" | "none";
export type VetoTone = "danger" | "warn" | "ink";
export type VetoStatus = "ready" | "loading" | "error";

export type VetoChipsProps = {
  /** Chip finish: tinted fills, hairline outlines, or solid kept chips. @default "soft" */
  chipStyle?: VetoChipStyle;
  /** How a chip turns over to its vetoed face: tumbling about its horizontal axis, turning about its vertical one, or a cross-fade. @default "x" */
  flipAxis?: VetoFlipAxis;
  /** The vetoed face's colour, muted: red, amber or ink. @default "danger" */
  tone?: VetoTone;
  /** The groups of values, in bar order. @default defaultVetoGroups */
  groups?: VetoGroup[];
  /** The records filtered and listed. @default defaultVetoRecords */
  records?: VetoRecord[];
  /** Controlled include and exclude sets. */
  value?: VetoValue;
  /** Initial sets when uncontrolled. @default defaultVetoValue */
  defaultValue?: VetoValue;
  /** Fires from the press or key that changed a chip, with both sets. */
  onChange?: (value: VetoValue, change: VetoChange) => void;
  /** A record row was opened. */
  onOpenRecord?: (record: VetoRecord) => void;
  /** Show each value's number of records in its chip. @default true */
  showCounts?: boolean;
  /** Most rows the list shows before "and N more". @default 24 */
  listLimit?: number;
  /** Whether the filters and records have arrived. @default "ready" */
  status?: VetoStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Work orders" */
  title?: string;
  /** What one record is called. @default { one: "work order", other: "work orders" } */
  noun?: { one: string; other: string };
  /** The second row's label. @default "Excluding" */
  excludeLabel?: string;
  /** Its short form, used when the rows stack: "Not PVC". @default "Not" */
  excludeShortLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultVetoGroups: VetoGroup[] = [
  {
    id: "crew",
    label: "Crew",
    values: [
      { id: "coldbrook", label: "Coldbrook" },
      { id: "basinworks", label: "Basinworks" },
      { id: "fernmoor", label: "Fernmoor" },
      { id: "night", label: "Night shift" },
    ],
  },
  {
    id: "material",
    label: "Material",
    values: [
      { id: "copper", label: "Copper" },
      { id: "pvc", label: "PVC" },
      { id: "steel", label: "Steel" },
      { id: "cable", label: "Cable" },
      { id: "concrete", label: "Concrete" },
    ],
  },
  {
    id: "priority",
    label: "Priority",
    values: [
      { id: "urgent", label: "Urgent" },
      { id: "high", label: "High" },
      { id: "routine", label: "Routine" },
    ],
  },
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORK = [
  "Replace meter bank",
  "Valve chamber survey",
  "Cable joint repair",
  "Riser swap",
  "Pump house wiring",
  "Trench backfill",
  "Hydrant service",
  "Duct clearance",
  "Main tie-in",
  "Leak repair",
  "Pole inspection",
  "Kiosk clean-out",
];

/** 48 seeded Fieldline work orders. */
export const defaultVetoRecords: VetoRecord[] = (() => {
  const rand = mulberry32(1640);
  const pick = <T,>(list: T[], weights: number[]): T => {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rand() * total;
    for (let i = 0; i < list.length; i += 1) {
      x -= weights[i] ?? 0;
      if (x <= 0) return list[i] as T;
    }
    return list[list.length - 1] as T;
  };
  return Array.from({ length: 48 }, (_, i) => ({
    id: `wo-${1180 + i * 3}`,
    ref: `WO-${1180 + i * 3}`,
    title: WORK[Math.floor(rand() * WORK.length)] ?? "Site visit",
    fields: {
      crew: pick(
        ["coldbrook", "basinworks", "fernmoor", "night"],
        [4, 3, 3, 2],
      ),
      material: pick(
        ["copper", "pvc", "steel", "cable", "concrete"],
        [3, 3, 2, 3, 1],
      ),
      priority: pick(["urgent", "high", "routine"], [1, 2, 3]),
    },
  }));
})();

export const defaultVetoValue: VetoValue = {
  include: ["crew:coldbrook"],
  exclude: ["material:pvc"],
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const TONES: Record<VetoTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  ink: "var(--ink-2)",
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const GAP = 6;
const GROUP_GAP = 8;
const FLIP_MS = 230;
const FADE_MS = 150;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Chip = {
  key: string;
  groupId: string;
  group: string;
  label: string;
  count: number;
};

const stateOf = (key: string, value: VetoValue): VetoState =>
  value.exclude.includes(key)
    ? "vetoed"
    : value.include.includes(key)
      ? "kept"
      : "ignored";

const passes = (record: VetoRecord, value: VetoValue, groups: VetoGroup[]) => {
  for (const group of groups) {
    const field = record.fields[group.id];
    const key = `${group.id}:${field ?? ""}`;
    if (field !== undefined && value.exclude.includes(key)) return false;
    const kept = value.include.filter((k) => k.startsWith(`${group.id}:`));
    if (kept.length > 0 && !kept.includes(key)) return false;
  }
  return true;
};

/** Counts the records a value passes, for hosts that show a total elsewhere. */
export const countVeto = (
  records: VetoRecord[],
  groups: VetoGroup[],
  value: VetoValue,
) => records.filter((r) => passes(r, value, groups)).length;

const noopSubscribe = () => () => {};

const nextIn = (state: VetoState): VetoState =>
  state === "ignored" ? "kept" : state === "kept" ? "vetoed" : "ignored";

const STATE_WORD: Record<VetoState, string> = {
  ignored: "not filtered",
  kept: "kept",
  vetoed: "excluded",
};

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      {/* Gives the row a text baseline, so a noun beside it lines up. */}
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Chip                                   */
/* ----------------------------------------------------------------------- */

const faceClass = (state: VetoState, style: VetoChipStyle) => {
  if (state === "kept") {
    return style === "solid"
      ? "border-transparent bg-primary text-primary-foreground"
      : style === "outline"
        ? "border-cobalt-bright bg-transparent text-cobalt-bright"
        : "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright";
  }
  if (state === "vetoed") {
    return style === "outline"
      ? "border-dashed border-[color-mix(in_oklab,var(--vc-veto)_55%,transparent)] bg-transparent text-(--vc-muted)"
      : style === "solid"
        ? "border-transparent bg-[color-mix(in_oklab,var(--vc-veto)_22%,var(--bg-1))] text-(--vc-muted)"
        : "border-[color-mix(in_oklab,var(--vc-veto)_30%,transparent)] bg-[color-mix(in_oklab,var(--vc-veto)_11%,transparent)] text-(--vc-muted)";
  }
  return style === "outline"
    ? "border-hairline-strong bg-transparent text-ink-2"
    : "border-transparent bg-surface-2 text-ink-2";
};

function Face({
  chip,
  state,
  style,
  showCounts,
  strike,
  motionSafe,
  className,
}: {
  chip: Chip;
  state: VetoState;
  style: VetoChipStyle;
  showCounts: boolean;
  strike: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-7 items-center gap-1 rounded-full border pr-2 pl-1.5 text-xs font-medium whitespace-nowrap transition-colors duration-200",
        faceClass(state, style),
        className,
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        {state === "kept" ? (
          <svg aria-hidden viewBox="0 0 14 14" className="size-3">
            <motion.path
              d="M3 7.4 5.8 10 11 4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        ) : state === "vetoed" ? (
          <Ban aria-hidden className="size-3" />
        ) : (
          <Plus aria-hidden className="size-3 text-ink-3" />
        )}
      </span>
      <span className="relative">
        {chip.label}
        {strike ? (
          <motion.span
            aria-hidden
            className="absolute inset-x-[-2px] top-1/2 h-px bg-current"
            style={{ originX: 0 }}
            initial={motionSafe ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={
              motionSafe
                ? { ...springs.flick, delay: durations.blink }
                : { duration: 0 }
            }
          />
        ) : null}
      </span>
      {showCounts ? (
        <span className="pl-0.5 font-mono text-[10px] tabular-nums opacity-70">
          {chip.count}
        </span>
      ) : null}
    </span>
  );
}

type ChipButtonProps = {
  chip: Chip;
  state: VetoState;
  turningTo: VetoState | null;
  chipStyle: VetoChipStyle;
  axis: VetoFlipAxis;
  showCounts: boolean;
  motionSafe: boolean;
  layoutKey: string | undefined;
  /** Fades in when it mounts: a chip revealed from +N, not one landing. */
  enter: boolean;
  tabIndex: number;
  first: boolean;
  disabled: boolean;
  hintId: string;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onPress: (shift: boolean) => void;
  onClear: () => void;
  onVeto: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function ChipButton({
  chip,
  state,
  turningTo,
  chipStyle,
  axis,
  showCounts,
  motionSafe,
  layoutKey,
  enter,
  tabIndex,
  first,
  disabled,
  hintId,
  nodeRef,
  onPress,
  onClear,
  onVeto,
  onFocus,
  onNav,
}: ChipButtonProps) {
  const turned = turningTo !== null;
  const back = turningTo ?? (state === "vetoed" ? "ignored" : "vetoed");
  const rotate = axis === "y" ? "rotateY" : "rotateX";
  const flipping = axis !== "none" && motionSafe;
  return (
    <motion.button
      ref={nodeRef}
      layoutId={layoutKey}
      initial={enter ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      layout={motionSafe ? "position" : false}
      type="button"
      tabIndex={tabIndex}
      aria-label={`${chip.label}, ${chip.group.toLowerCase()}, ${STATE_WORD[state]}`}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      onFocus={onFocus}
      onClick={(event) => onPress(event.shiftKey)}
      onKeyDown={(event) => {
        if (event.key === " " && event.shiftKey) {
          // Shift+Space vetoes; preventing the keydown also stops the
          // button's own click, so the chip is not cycled as well.
          event.preventDefault();
          onVeto();
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onClear();
          return;
        }
        onNav(event);
      }}
      transition={{
        layout: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "relative shrink-0 rounded-full [perspective:420px]",
        first && "ml-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        className="relative block [transform-style:preserve-3d]"
        initial={false}
        animate={flipping ? { [rotate]: turned ? 180 : 0 } : { [rotate]: 0 }}
        transition={flipping ? springs.snap : { duration: 0 }}
      >
        <span
          className={cn(
            "block transition-opacity duration-150 [backface-visibility:hidden]",
            !flipping && turned && "opacity-0",
          )}
        >
          <Face
            chip={chip}
            state={state}
            style={chipStyle}
            showCounts={showCounts}
            strike={state === "vetoed"}
            motionSafe={motionSafe}
          />
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 block transition-opacity duration-150 [backface-visibility:hidden]",
            !flipping && !turned && "opacity-0",
          )}
          style={{ transform: flipping ? `${rotate}(180deg)` : undefined }}
        >
          <Face
            chip={chip}
            state={back}
            style={chipStyle}
            showCounts={showCounts}
            strike={false}
            motionSafe={false}
          />
        </span>
      </motion.span>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Fit = {
  widths: Record<string, number>;
  plus: number;
  bar: number;
  excl: number;
};

type Pop = {
  row: "bar" | "excl";
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
};

/**
 * A filter row where every value can be kept, ignored or ruled out. The first
 * press keeps a chip — it fills and a check draws on `springs.flick`. The
 * second turns it over: a quick flip on `springs.snap` to its vetoed face,
 * muted and struck through, and then it slides out of the row into the
 * Excluding row on `springs.glide`, the gap it left closing on the same
 * spring, while the result count rolls and the list below re-flows. A third
 * press turns it back face up and it glides home.
 *
 * Each row measures its chips once (every state has the same width, so the
 * row never re-measures on a press) and gathers what does not fit into a `+N`
 * button whose popover holds the rest with the same three states; a dot on
 * `+N` says a kept value is hiding inside.
 *
 * The chips are one toolbar: Left/Right move, Space or Enter cycles,
 * Shift+Space vetoes directly, Delete clears, and focus follows a chip to the
 * row it lands in. Under reduced motion nothing flips or travels — the face
 * changes in place and the chip appears in its new row.
 */
export function VetoChips({
  chipStyle = "soft",
  flipAxis = "x",
  tone = "danger",
  groups = defaultVetoGroups,
  records = defaultVetoRecords,
  value,
  defaultValue = defaultVetoValue,
  onChange,
  onOpenRecord,
  showCounts = true,
  listLimit = 24,
  status = "ready",
  onRetry,
  title = "Work orders",
  noun = { one: "work order", other: "work orders" },
  excludeLabel = "Excluding",
  excludeShortLabel = "Not",
  label,
  disabled = false,
  className,
}: VetoChipsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const popId = `${uid}-pop`;

  const [own, setOwn] = React.useState<VetoValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [turning, setTurning] = React.useState<{
    key: string;
    to: VetoState;
  } | null>(null);
  const [fit, setFit] = React.useState<Fit | null>(null);
  const [landed, setLanded] = React.useState<string | null>(null);
  // False for the server render and hydration, so chips already on the page
  // never fade in; true for chips that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [pop, setPop] = React.useState<Pop | null>(null);
  const [activeNav, setActiveNav] = React.useState<string | null>(null);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    key: string;
    row: "bar" | "excl";
    seq: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const [layer, setLayer] = React.useState<HTMLDivElement | null>(null);
  const [barEl, setBarEl] = React.useState<HTMLDivElement | null>(null);
  const [exclEl, setExclEl] = React.useState<HTMLDivElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const popRef = React.useRef<HTMLDivElement | null>(null);
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const moreNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const rowNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const timer = React.useRef<number | null>(null);
  const pending = React.useRef<{ key: string; to: VetoState } | null>(null);

  /* -------------------------------- data ------------------------------- */

  const chips: Chip[] = groups.flatMap((group) =>
    group.values.map((v) => ({
      key: `${group.id}:${v.id}`,
      groupId: group.id,
      group: group.label,
      label: v.label,
      count: records.filter((r) => r.fields[group.id] === v.id).length,
    })),
  );
  const byKey = new Map(chips.map((c) => [c.key, c]));
  const matching = records.filter((r) => passes(r, current, groups));
  const total = records.length;
  const kept = current.include.filter((k) => byKey.has(k));
  const vetoed = current.exclude.filter((k) => byKey.has(k));

  const barKeys = chips
    .filter((c) => !current.exclude.includes(c.key))
    .map((c) => c.key);
  const exclKeys = vetoed;

  /** How many of a row's chips fit before the rest gather into +N. */
  const fitCount = (keys: string[], avail: number | undefined) => {
    if (!fit || avail === undefined || avail <= 0) return keys.length;
    const extra = (i: number) =>
      i > 0 &&
      byKey.get(keys[i] ?? "")?.groupId !==
        byKey.get(keys[i - 1] ?? "")?.groupId
        ? GROUP_GAP
        : 0;
    let all = 0;
    keys.forEach((k, i) => {
      all += (fit.widths[k] ?? 88) + (i ? GAP : 0) + extra(i);
    });
    if (all <= avail) return keys.length;
    let used = 0;
    let n = 0;
    for (let i = 0; i < keys.length; i += 1) {
      const w = (fit.widths[keys[i] ?? ""] ?? 88) + (i ? GAP : 0) + extra(i);
      if (used + w + GAP + fit.plus > avail) break;
      used += w;
      n += 1;
    }
    // A row always shows at least its first chip, so a landing is seen.
    return Math.max(1, n);
  };

  const barShown = barKeys.slice(0, fitCount(barKeys, fit?.bar));
  const barHidden = barKeys.slice(barShown.length);
  // The newest vetoes stay in view — the one that just landed is never the
  // one gathered away; older ones fold into a +N at the row's start.
  const exclFit = fitCount([...exclKeys].reverse(), fit?.excl);
  const exclShown = exclKeys.slice(exclKeys.length - exclFit);
  const exclHidden = exclKeys.slice(0, exclKeys.length - exclFit);

  /* ----------------------------- measuring ----------------------------- */

  React.useEffect(() => {
    if (!layer || !barEl || !exclEl || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => {
      const widths: Record<string, number> = {};
      let plus = 44;
      for (const node of layer.children) {
        const el = node as HTMLElement;
        const key = el.dataset.key;
        if (key === "__plus") plus = Math.ceil(el.offsetWidth);
        else if (key) widths[key] = Math.ceil(el.offsetWidth);
      }
      const next: Fit = {
        widths,
        plus,
        bar: Math.floor(barEl.clientWidth - 6),
        excl: Math.floor(exclEl.clientWidth - 6),
      };
      setFit((prev) =>
        prev &&
        prev.bar === next.bar &&
        prev.excl === next.excl &&
        prev.plus === next.plus &&
        Object.keys(next.widths).every((k) => prev.widths[k] === next.widths[k])
          ? prev
          : next,
      );
    };
    const ro = new ResizeObserver(measure);
    ro.observe(layer);
    ro.observe(barEl);
    ro.observe(exclEl);
    return () => ro.disconnect();
  }, [layer, barEl, exclEl]);

  /* ------------------------------- changes ----------------------------- */

  const apply = (key: string, to: VetoState, base: VetoValue) => {
    const from = stateOf(key, base);
    if (from === to) return base;
    const next: VetoValue = {
      include: base.include.filter((k) => k !== key),
      exclude: base.exclude.filter((k) => k !== key),
    };
    if (to === "kept") next.include.push(key);
    if (to === "vetoed") next.exclude.push(key);
    if (value === undefined) setOwn(next);
    onChange?.(next, { key, from, to });
    if ((from === "vetoed") !== (to === "vetoed")) setLanded(key);
    const chip = byKey.get(key);
    const n = countVeto(records, groups, next);
    setAnnouncement(
      `${chip?.label ?? key} ${STATE_WORD[to]}. ${n} of ${total} ${n === 1 ? noun.one : noun.other}.`,
    );
    return next;
  };

  /** Lands a pending flip now: a second press never waits for the first. */
  const flush = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    setTurning(null);
    if (!p) return current;
    return apply(p.key, p.to, current);
  };

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  // Focus follows a chip to the row it landed in — bound after the DOM moved.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      chipNodes.current.get(focusReq.key) ??
      moreNodes.current.get(focusReq.row);
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  const change = (key: string, to: VetoState) => {
    if (inert) return;
    const base = pending.current ? flush() : current;
    const from = stateOf(key, base);
    if (from === to) return;
    const crosses = (from === "vetoed") !== (to === "vetoed");
    const row = to === "vetoed" ? "excl" : "bar";
    const land = () => {
      apply(key, to, base);
      // The popover keeps only what still belongs to its row.
      setPop((p) => (p && p.row !== row ? null : p));
      setFocusReq((f) => ({ key, row, seq: (f?.seq ?? 0) + 1 }));
    };
    const hasFocus =
      typeof document !== "undefined" &&
      document.activeElement === chipNodes.current.get(key);
    if (!crosses || !motionSafe) {
      apply(key, to, base);
      if (crosses && hasFocus)
        setFocusReq((f) => ({ key, row, seq: (f?.seq ?? 0) + 1 }));
      return;
    }
    pending.current = { key, to };
    setTurning({ key, to });
    timer.current = window.setTimeout(
      () => {
        timer.current = null;
        pending.current = null;
        setTurning(null);
        if (hasFocus) land();
        else {
          apply(key, to, base);
          setPop((p) => (p && p.row !== row ? null : p));
        }
      },
      flipAxis === "none" ? FADE_MS : FLIP_MS,
    );
  };

  const clearAll = () => {
    if (inert) return;
    flush();
    if (kept.length === 0 && vetoed.length === 0) return;
    const next: VetoValue = { include: [], exclude: [] };
    if (value === undefined) setOwn(next);
    onChange?.(next, { key: "*", from: "kept", to: "ignored" });
    setAnnouncement(
      `Filters cleared. ${total} ${total === 1 ? noun.one : noun.other}.`,
    );
    setPop(null);
  };

  /* ------------------------------- popover ----------------------------- */

  const openPop = (row: "bar" | "excl") => {
    const root = rootRef.current;
    const btn = moreNodes.current.get(row);
    if (!root || !btn) return;
    if (pop?.row === row) {
      setPop(null);
      return;
    }
    const rr = root.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const width = Math.round(Math.min(300, rr.width - 16));
    const left = Math.round(
      clamp(br.right - rr.left - width, 8, rr.width - width - 8),
    );
    const firstHidden = (row === "bar" ? barHidden : exclHidden)[0];
    if (firstHidden) {
      setFocusReq((f) => ({ key: firstHidden, row, seq: (f?.seq ?? 0) + 1 }));
    }
    const below = rr.bottom - br.bottom - 8;
    const above = br.top - rr.top - 8;
    if (below >= 110 || below >= above) {
      setPop({
        row,
        left,
        width,
        top: Math.round(br.bottom - rr.top + 6),
        maxHeight: Math.round(Math.max(64, below - 4)),
      });
    } else {
      setPop({
        row,
        left,
        width,
        bottom: Math.round(rr.bottom - br.top + 6),
        maxHeight: Math.round(Math.max(64, above - 4)),
      });
    }
  };

  const closePop = (returnFocus: boolean) => {
    const row = pop?.row;
    setPop(null);
    if (returnFocus && row) moreNodes.current.get(row)?.focus();
  };

  const popOpenFor = pop?.row ?? null;
  React.useEffect(() => {
    if (!popOpenFor) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target)) return;
      if (moreNodes.current.get(popOpenFor)?.contains(target)) return;
      setPop(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [popOpenFor]);

  /* ------------------------------ keyboard ----------------------------- */

  const navKeys = [
    ...barShown,
    ...(barHidden.length ? ["more:bar"] : []),
    ...(exclHidden.length ? ["more:excl"] : []),
    ...exclShown,
  ];
  const activeKey =
    activeNav && navKeys.includes(activeNav) ? activeNav : (navKeys[0] ?? null);

  const nodeOf = (key: string) =>
    key.startsWith("more:")
      ? moreNodes.current.get(key.slice(5))
      : chipNodes.current.get(key);

  const onNav = (event: React.KeyboardEvent, key: string, keys: string[]) => {
    const i = keys.indexOf(key);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = keys.length - 1;
    else if (event.key === "Escape" && pop) {
      event.preventDefault();
      closePop(true);
      return;
    } else return;
    event.preventDefault();
    const target = keys[clamp(to, 0, keys.length - 1)];
    if (target) nodeOf(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const turningKey = turning?.key ?? null;
  const step = cascade(Math.min(matching.length, 10));
  const listed = matching.slice(0, Math.max(1, listLimit));
  const more = matching.length - listed.length;
  const activeRecord =
    activeRow && listed.some((r) => r.id === activeRow)
      ? activeRow
      : (listed[0]?.id ?? null);

  const renderChip = (
    key: string,
    i: number,
    keys: string[],
    where: "bar" | "excl" | "pop",
  ) => {
    const chip = byKey.get(key);
    if (!chip) return null;
    const state = stateOf(key, current);
    const prev = keys[i - 1];
    const first =
      where === "bar" &&
      i > 0 &&
      byKey.get(prev ?? "")?.groupId !== chip.groupId;
    return (
      <ChipButton
        key={key}
        chip={chip}
        state={state}
        turningTo={turningKey === key ? (turning?.to ?? null) : null}
        chipStyle={chipStyle}
        axis={flipAxis}
        showCounts={showCounts}
        motionSafe={motionSafe}
        layoutKey={motionSafe ? `${uid}-chip-${key}` : undefined}
        enter={live && where !== "pop" && key !== landed}
        tabIndex={
          where === "pop" ? (i === 0 ? 0 : -1) : activeKey === key ? 0 : -1
        }
        first={first}
        disabled={inert}
        hintId={hintId}
        nodeRef={(node) => {
          if (node) chipNodes.current.set(key, node);
          else chipNodes.current.delete(key);
        }}
        onPress={(shift) =>
          change(
            key,
            shift ? (state === "vetoed" ? "ignored" : "vetoed") : nextIn(state),
          )
        }
        onVeto={() => change(key, state === "vetoed" ? "ignored" : "vetoed")}
        onClear={() => change(key, "ignored")}
        onFocus={() => {
          if (where !== "pop") setActiveNav(key);
        }}
        onNav={(event) => onNav(event, key, where === "pop" ? keys : navKeys)}
      />
    );
  };

  const moreButton = (row: "bar" | "excl", hidden: string[]) => {
    if (hidden.length === 0) return null;
    const keptInside = hidden.some((k) => current.include.includes(k));
    const navKey = `more:${row}`;
    return (
      <button
        ref={(node) => {
          if (node) moreNodes.current.set(row, node);
          else moreNodes.current.delete(row);
        }}
        type="button"
        tabIndex={activeKey === navKey ? 0 : -1}
        aria-expanded={pop?.row === row}
        aria-controls={pop?.row === row ? popId : undefined}
        aria-label={`${hidden.length} more ${row === "excl" ? "excluded values" : "values"}${keptInside ? ", some kept" : ""}`}
        onFocus={() => setActiveNav(navKey)}
        onClick={() => openPop(row)}
        onKeyDown={(event) => onNav(event, navKey, navKeys)}
        className={cn(
          "relative inline-flex h-7 shrink-0 items-center rounded-full border border-hairline-strong px-2.5 font-mono text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          pop?.row === row && "bg-surface-2 text-foreground",
          FOCUS_RING,
        )}
      >
        +{hidden.length}
        {keptInside ? (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-card bg-cobalt-bright"
          />
        ) : null}
      </button>
    );
  };

  const veto = TONES[tone] ?? TONES.danger;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        ["--vc-veto" as string]: veto,
        ["--vc-muted" as string]: `color-mix(in oklab, ${veto} 72%, var(--ink-2))`,
      }}
    >
      <p id={hintId} className="sr-only">
        Space cycles ignore, keep and exclude. Shift and Space excludes. Delete
        clears.
      </p>

      {/* Every chip at its one width (all three faces are the same size), so
          the rows can decide what fits without measuring on each press. */}
      <div
        ref={setLayer}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 flex w-max gap-1.5"
      >
        {chips.map((chip) => (
          <span key={chip.key} data-key={chip.key} className="block">
            <Face
              chip={chip}
              state="ignored"
              style={chipStyle}
              showCounts={showCounts}
              strike={false}
              motionSafe={false}
            />
          </span>
        ))}
        <span
          data-key="__plus"
          className="inline-flex h-7 items-center rounded-full border px-2.5 font-mono text-[11px]"
        >
          +{chips.length}
        </span>
      </div>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          {ready ? (
            <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
              <span className="sr-only">
                {matching.length} of {total} {noun.other}
              </span>
              <Roll
                value={matching.length}
                motionSafe={motionSafe}
                className="font-mono text-[13px] text-foreground"
              />
              <span aria-hidden>of {total}</span>
              <span aria-hidden className="hidden @min-[24rem]:inline">
                {noun.other}
              </span>
            </p>
          ) : null}
          <button
            type="button"
            onClick={clearAll}
            aria-disabled={
              inert || (kept.length === 0 && vetoed.length === 0) || undefined
            }
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
              !inert && (kept.length > 0 || vetoed.length > 0)
                ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            Clear
          </button>
        </div>
      </header>

      {status === "loading" ? (
        <div aria-hidden className="flex flex-wrap gap-1.5 px-4 pb-3">
          {Array.from({ length: 9 }, (_, i) => (
            <span
              key={i}
              className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
              style={{
                width: 56 + ((i * 23) % 40),
                animationDelay: `${i * 70}ms`,
              }}
            />
          ))}
        </div>
      ) : status === "error" ? null : (
        <LayoutGroup id={uid}>
          <div
            role="toolbar"
            aria-label="Filter values"
            className="flex shrink-0 flex-col gap-2 px-4 pb-3 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:gap-3"
          >
            <div
              ref={setBarEl}
              role="group"
              aria-label="Values"
              className={cn(
                "-m-[3px] flex min-w-0 flex-1 items-center gap-1.5 p-[3px]",
                // Clipped only until the row has measured what fits; after
                // that nothing overflows, and a chip travelling to the other
                // row must not be cut off on its way.
                !fit && "overflow-hidden",
              )}
            >
              {barShown.map((key, i) => renderChip(key, i, barShown, "bar"))}
              {moreButton("bar", barHidden)}
            </div>
            <span
              aria-hidden
              className="hidden h-6 w-px shrink-0 bg-hairline @min-[40rem]:block"
            />
            <div className="flex min-w-0 items-center gap-2 @min-[40rem]:w-[38%] @min-[40rem]:shrink-0">
              <span
                aria-hidden
                className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:inline"
              >
                {excludeLabel}
              </span>
              <span
                aria-hidden
                title={excludeLabel}
                className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:hidden"
              >
                {excludeShortLabel}
              </span>
              <div
                ref={setExclEl}
                role="group"
                aria-label={excludeLabel}
                className={cn(
                  "-m-[3px] flex min-w-0 flex-1 items-center gap-1.5 p-[3px]",
                  !fit && "overflow-hidden",
                )}
              >
                {moreButton("excl", exclHidden)}
                {exclShown.map((key, i) =>
                  renderChip(key, i, exclShown, "excl"),
                )}
                {exclKeys.length === 0 ? (
                  <span className="min-w-0 truncate text-[11px] text-ink-3">
                    Nothing yet · press a kept value again
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <AnimatePresence>
            {pop ? (
              <motion.div
                key={pop.row}
                ref={popRef}
                id={popId}
                role="group"
                aria-label={
                  pop.row === "bar" ? "More values" : "More excluded values"
                }
                onBlur={(event) => {
                  const next = event.relatedTarget as Node | null;
                  if (
                    next &&
                    !event.currentTarget.contains(next) &&
                    next !== moreNodes.current.get(pop.row)
                  ) {
                    setPop(null);
                  }
                }}
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
                style={{
                  left: pop.left,
                  width: pop.width,
                  top: pop.top,
                  bottom: pop.bottom,
                  maxHeight: pop.maxHeight,
                }}
                className="absolute z-20 flex flex-col gap-2 overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-2.5 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
              >
                {pop.row === "bar" ? (
                  groups
                    .map((g) => ({
                      g,
                      keys: barHidden.filter(
                        (k) => byKey.get(k)?.groupId === g.id,
                      ),
                    }))
                    .filter((x) => x.keys.length > 0)
                    .map(({ g, keys }) => (
                      <div key={g.id} className="flex flex-col gap-1.5">
                        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          {g.label}
                        </span>
                        <div className="flex flex-wrap gap-1.5 p-[3px]">
                          {keys.map((key) =>
                            renderChip(
                              key,
                              barHidden.indexOf(key),
                              barHidden,
                              "pop",
                            ),
                          )}
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="flex flex-wrap gap-1.5 p-[3px]">
                    {exclHidden.map((key, i) =>
                      renderChip(key, i, exclHidden, "pop"),
                    )}
                  </div>
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </LayoutGroup>
      )}

      <div className="relative flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The filters didn&apos;t load.
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
          <div aria-hidden className="flex flex-col gap-1 px-2 py-2">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="mx-2 h-6 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 110}ms` }}
              />
            ))}
          </div>
        ) : matching.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-6 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">Every {noun.one} is ruled out.</p>
          </div>
        ) : (
          <ul
            role="list"
            aria-label={`${title}, filtered`}
            className="relative flex flex-col px-2 py-1.5"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {listed.map((record, i) => {
                const lead = groups[0];
                const tags = groups
                  .slice(1)
                  .map(
                    (g) =>
                      byKey.get(`${g.id}:${record.fields[g.id] ?? ""}`)?.label,
                  )
                  .filter(Boolean)
                  .join(" · ");
                const crewLabel = lead
                  ? byKey.get(`${lead.id}:${record.fields[lead.id] ?? ""}`)
                      ?.label
                  : undefined;
                return (
                  <motion.li
                    key={record.id}
                    layout={motionSafe ? "position" : false}
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      layout: springs.glide,
                      y: motionSafe
                        ? {
                            ...springs.glide,
                            delay: r3(Math.min(i, 10) * step),
                          }
                        : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                  >
                    <button
                      ref={(node) => {
                        if (node) rowNodes.current.set(record.id, node);
                        else rowNodes.current.delete(record.id);
                      }}
                      type="button"
                      tabIndex={record.id === activeRecord ? 0 : -1}
                      onFocus={() => setActiveRow(record.id)}
                      onClick={() => {
                        if (!disabled) onOpenRecord?.(record);
                      }}
                      onKeyDown={(event) => {
                        const to =
                          event.key === "ArrowDown"
                            ? i + 1
                            : event.key === "ArrowUp"
                              ? i - 1
                              : event.key === "Home"
                                ? 0
                                : event.key === "End"
                                  ? listed.length - 1
                                  : null;
                        if (to === null) return;
                        event.preventDefault();
                        const target = listed[clamp(to, 0, listed.length - 1)];
                        if (target) rowNodes.current.get(target.id)?.focus();
                      }}
                      aria-label={`${record.ref}, ${record.title}, ${[crewLabel, tags].filter(Boolean).join(", ")}`}
                      className={cn(
                        "grid h-8 w-full grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-2 text-left transition-colors hover:bg-surface-2",
                        FOCUS_RING,
                      )}
                    >
                      <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                        {record.ref}
                      </span>
                      <span className="truncate text-[13px]">
                        {record.title}
                      </span>
                      <span className="truncate text-right text-[11px] text-ink-3">
                        <span className="hidden @min-[30rem]:inline">
                          {crewLabel} ·{" "}
                        </span>
                        {tags}
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {more > 0 ? (
              <li className="px-2 py-1.5 text-[11px] text-ink-3">
                and {more} more
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
