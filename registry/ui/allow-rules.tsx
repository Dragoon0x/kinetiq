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
  Ban,
  Check,
  ChevronDown,
  FileText,
  Pencil,
  RotateCcw,
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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type AllowChipStyle = "pill" | "tag" | "code";
export type AllowListDensity = "compact" | "cozy" | "roomy";
export type AllowAccentName = "cobalt" | "plum" | "mint" | "ink";
export type AllowStatus = "ready" | "loading" | "empty" | "error";
export type AllowVerb = "read" | "write" | "edit" | "delete";

export type AllowRequest = {
  id: string;
  /** Who asks: "Basinworks file agent". */
  agent: string;
  verb: AllowVerb;
  /** The file, as a path from the workspace root. */
  path: string;
  /** Its size, as written: "12 KB". */
  size?: string;
  /** What the action costs, in dollars. */
  cost: number;
  /** The agent's reason, one sentence. */
  reason: string;
  /** When it asked, in ms. */
  at: number;
};

export type AllowPattern = {
  verbs: AllowVerb[];
  /** An exact path, a folder ending in "/" (and everything under it), or "" for any file. */
  path: string;
  /** Most one action may cost, or null for any cost. */
  maxCost: number | null;
};

export type AllowRule = {
  id: string;
  effect: "allow" | "deny";
  pattern: AllowPattern;
  /** Times it has fired. */
  fires: number;
  /** Fires per day over the last 14 days, oldest first. */
  daily?: number[];
  /** When it last fired, in ms. */
  lastFiredAt?: number;
};

export type AllowHistoryItem = {
  verb: AllowVerb;
  path: string;
  cost: number;
};

export type AllowOption<T> = { id: string; label: string; value: T };

export type AllowTemplates = {
  /** What the rule lets it do, narrowest first. */
  verbs: AllowOption<AllowVerb[]>[];
  /** Where, narrowest first. */
  scopes: AllowOption<string>[];
  /** Up to what cost. */
  costs: AllowOption<number | null>[];
};

export type AllowRulesProps = {
  /** The permission being asked for now, or null when nothing waits. @default defaultAllowRequest */
  request?: AllowRequest | null;
  /** Requests waiting behind it, in order. @default defaultAllowWaiting */
  waiting?: AllowRequest[];
  /** The options of the pattern builder. @default derived from the request */
  templates?: AllowTemplates;
  /** Controlled standing rules. */
  rules?: AllowRule[];
  /** Initial rules when uncontrolled. @default defaultAllowRules */
  defaultRules?: AllowRule[];
  /** Fires with the whole list after a rule is created or revoked. */
  onRulesChange?: (rules: AllowRule[]) => void;
  /** Recent requests, newest first: the reach strip lights the ones a rule would have covered. @default defaultAllowHistory */
  history?: AllowHistoryItem[];
  /** Allow once was pressed. */
  onAllowOnce?: (request: AllowRequest) => void;
  /** Deny was pressed. */
  onDeny?: (request: AllowRequest) => void;
  /** A rule was created from the request (it fires once for it). */
  onCreateRule?: (rule: AllowRule, request: AllowRequest) => void;
  /** Enter on a rule, or "Edit that rule" on a conflict. */
  onEditRule?: (rule: AllowRule) => void;
  /** A rule was revoked after its confirm. */
  onRevokeRule?: (rule: AllowRule) => void;
  /** Whether the permissions have loaded. @default "ready" */
  status?: AllowStatus;
  /** Try again was pressed after a failure to load. */
  onRetry?: () => void;
  /** The moment ages are counted from, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** How a rule is drawn: a pill, a notched tag, or a mono pattern. @default "pill" */
  chipStyle?: AllowChipStyle;
  /** Row height of the rules list. @default "cozy" */
  listDensity?: AllowListDensity;
  /** Allow rules, the builder and Create: a named pigment or any CSS colour. @default "cobalt" */
  accent?: AllowAccentName | (string & {});
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Tallest the surface grows before its panes scroll, in px. @default 560 */
  height?: number;
  /** Read only. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14, 0);
const AGENT = "Basinworks file agent";

export const defaultAllowRequest: AllowRequest = {
  id: "req-381",
  agent: AGENT,
  verb: "write",
  path: "reports/2026/q3/basin-levels.csv",
  size: "12 KB",
  cost: 0.02,
  reason: "Saving the merged gauge readings for the Q3 basin report.",
  at: DEFAULT_NOW - 2 * MIN,
};

export const defaultAllowWaiting: AllowRequest[] = [
  {
    id: "req-382",
    agent: AGENT,
    verb: "write",
    path: "reports/2026/q3/basin-summary.md",
    size: "3 KB",
    cost: 0.01,
    reason: "Writing the summary that goes with the readings.",
    at: DEFAULT_NOW - MIN,
  },
  {
    id: "req-383",
    agent: AGENT,
    verb: "delete",
    path: "scratch/merge-0917.parquet",
    size: "48 MB",
    cost: 0,
    reason: "Cleaning up the intermediate merge file.",
    at: DEFAULT_NOW,
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

const days = (seed: number, scale: number) => {
  const rand = mulberry32(seed);
  return Array.from({ length: 14 }, (_, i) =>
    Math.round(scale * (0.4 + rand() * 0.9) * (i > 9 ? 1.25 : 1)),
  );
};

export const defaultAllowRules: AllowRule[] = [
  {
    id: "rule-read-any",
    effect: "allow",
    pattern: { verbs: ["read"], path: "", maxCost: null },
    fires: 1284,
    daily: days(11, 90),
    lastFiredAt: DEFAULT_NOW - 4 * MIN,
  },
  {
    id: "rule-q2",
    effect: "allow",
    pattern: { verbs: ["write"], path: "reports/2026/q2/", maxCost: 0.1 },
    fires: 212,
    daily: days(12, 14),
    lastFiredAt: DEFAULT_NOW - 26 * HOUR,
  },
  {
    id: "rule-drafts",
    effect: "allow",
    pattern: { verbs: ["write", "edit"], path: "drafts/", maxCost: null },
    fires: 96,
    daily: days(13, 6),
    lastFiredAt: DEFAULT_NOW - 2 * HOUR,
  },
  {
    id: "rule-archive",
    effect: "deny",
    pattern: { verbs: ["delete", "edit"], path: "archive/", maxCost: null },
    fires: 3,
    daily: [0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    lastFiredAt: DEFAULT_NOW - 3 * 24 * HOUR,
  },
  {
    id: "rule-scratch",
    effect: "allow",
    pattern: { verbs: ["read", "write"], path: "scratch/", maxCost: 1 },
    fires: 41,
    daily: days(15, 3),
    lastFiredAt: DEFAULT_NOW - 50 * MIN,
  },
];

/** The agent's last forty requests, newest first. */
export const defaultAllowHistory: AllowHistoryItem[] = (() => {
  const rand = mulberry32(2083);
  const places: [string, AllowVerb[], number][] = [
    ["reports/2026/q3/", ["write", "write", "read"], 0.06],
    ["reports/2026/q2/", ["write", "read"], 0.05],
    ["reports/2025/", ["read"], 0.02],
    ["drafts/", ["write", "edit"], 0.03],
    ["scratch/", ["write", "delete"], 0.3],
    ["archive/", ["read", "delete"], 0.01],
  ];
  const weights = [0.34, 0.2, 0.1, 0.14, 0.14, 0.08];
  return Array.from({ length: 40 }, (_, i) => {
    let r = rand();
    let k = 0;
    while (k < weights.length - 1 && r > (weights[k] ?? 0)) {
      r -= weights[k] ?? 0;
      k += 1;
    }
    const [folder, verbs, costScale] = places[k] ?? [
      "reports/2026/q3/",
      ["write"] as AllowVerb[],
      0.06,
    ];
    const verb = verbs[Math.floor(rand() * verbs.length)] ?? "read";
    const cost =
      Math.round(rand() * costScale * 100 * (rand() < 0.1 ? 4 : 1)) / 100;
    return { verb, path: `${folder}file-${i}.csv`, cost };
  });
})();

/* ----------------------------------------------------------------------- */
/*                                 Patterns                                 */
/* ----------------------------------------------------------------------- */

const ALL_VERBS: AllowVerb[] = ["read", "write", "edit", "delete"];

const folderOf = (path: string) => {
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(0, cut + 1) : "";
};
const lastPart = (folder: string) => {
  const parts = folder.split("/").filter(Boolean);
  return parts.length ? `${parts[parts.length - 1]}/` : "";
};

/** Builder options for a request: its own action outward, its own file outward. */
export function templatesFor(
  request: AllowRequest,
  formatMoney: (n: number) => string = defaultMoney,
): AllowTemplates {
  const folder = folderOf(request.path);
  const parent = folderOf(folder.slice(0, -1));
  const file = request.path.slice(folder.length);
  const scopes: AllowOption<string>[] = [
    { id: "file", label: `${file} only`, value: request.path },
  ];
  if (folder) {
    scopes.push({
      id: "folder",
      label: `anything in ${lastPart(folder)}`,
      value: folder,
    });
  }
  if (parent) {
    scopes.push({
      id: "parent",
      label: `anything in ${lastPart(parent)}`,
      value: parent,
    });
  }
  scopes.push({ id: "any", label: "any file", value: "" });
  const verbs: AllowOption<AllowVerb[]>[] = [
    { id: "same", label: request.verb, value: [request.verb] },
  ];
  if (request.verb === "write" || request.verb === "edit") {
    verbs.push({
      id: "pair",
      label: "write or edit",
      value: ["write", "edit"],
    });
  }
  verbs.push({ id: "any", label: "use any file action", value: ALL_VERBS });
  const low = request.cost <= 0.1 ? 0.1 : 1;
  return {
    verbs,
    scopes,
    costs: [
      { id: "low", label: `under ${formatMoney(low)}`, value: low },
      { id: "high", label: `under ${formatMoney(low * 10)}`, value: low * 10 },
      { id: "any", label: "at any cost", value: null },
    ],
  };
}

const pathCovers = (outer: string, inner: string) =>
  outer === "" ||
  (outer.endsWith("/") ? inner.startsWith(outer) : outer === inner);

const matches = (p: AllowPattern, item: AllowHistoryItem) =>
  p.verbs.includes(item.verb) &&
  pathCovers(p.path, item.path) &&
  (p.maxCost === null || item.cost <= p.maxCost);

/** Two patterns overlap when some request would match both. */
const overlaps = (a: AllowPattern, b: AllowPattern) =>
  a.verbs.some((v) => b.verbs.includes(v)) &&
  (pathCovers(a.path, b.path) || pathCovers(b.path, a.path));

/** An allow pattern that already lets through everything `b` would. */
const covers = (a: AllowPattern, b: AllowPattern) =>
  b.verbs.every((v) => a.verbs.includes(v)) &&
  pathCovers(a.path, b.path) &&
  (a.maxCost === null || (b.maxCost !== null && b.maxCost <= a.maxCost));

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

function defaultMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
/** Thousands by hand: compact number formats differ between Node and browsers. */
const count = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString("en-US");

function ago(at: number | undefined, now: number) {
  if (at === undefined) return "never";
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const verbWords = (verbs: AllowVerb[]) =>
  verbs.length >= ALL_VERBS.length
    ? "any action"
    : verbs.length === 2
      ? `${verbs[0]} or ${verbs[1]}`
      : verbs.join(", ");

const pathWords = (path: string) =>
  path === "" ? "any file" : path.endsWith("/") ? `in ${path}` : path;

const costWords = (max: number | null, money: (n: number) => string) =>
  max === null ? "" : `under ${money(max)}`;

const ruleWords = (r: AllowRule, money: (n: number) => string) => {
  const head = r.effect === "deny" ? "Never" : "Allow";
  const cost = costWords(r.pattern.maxCost, money);
  return `${head} ${verbWords(r.pattern.verbs)} ${pathWords(r.pattern.path)}${cost ? ` ${cost}` : ""}`;
};

const ACCENTS: Record<AllowAccentName, Record<string, string>> = {
  cobalt: {
    "--ar-accent": "var(--accent-bright)",
    "--ar-pigment": "oklch(from var(--accent-bright) 0.62 c h)",
    "--ar-button": "var(--primary)",
    "--ar-on": "var(--primary-foreground)",
  },
  plum: {
    "--ar-accent": "oklch(from var(--accent-bright) l c 320)",
    "--ar-pigment": "oklch(from var(--accent-bright) 0.6 c 320)",
    "--ar-button": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--ar-on": "var(--primary-foreground)",
  },
  mint: {
    "--ar-accent": "var(--success)",
    "--ar-pigment": "oklch(from var(--success) 0.7 c h)",
    "--ar-button": "oklch(from var(--success) 0.68 c h)",
    "--ar-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--ar-accent": "var(--ink-2)",
    "--ar-pigment": "oklch(from var(--ink-2) 0.5 0.02 h)",
    "--ar-button": "var(--foreground)",
    "--ar-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    ...(ACCENTS[accent as AllowAccentName] ?? {
      "--ar-accent": accent,
      "--ar-pigment": accent,
      "--ar-button": accent,
      "--ar-on": "var(--primary-foreground)",
    }),
    "--ar-wash": "color-mix(in oklab, var(--ar-accent) 12%, transparent)",
    "--ar-deny": "oklch(from var(--danger) 0.64 0.18 h)",
  }) as React.CSSProperties;

const DENSITY: Record<AllowListDensity, { row: string; meta: boolean }> = {
  compact: { row: "py-1.5", meta: false },
  cozy: { row: "py-2.5", meta: true },
  roomy: { row: "py-3.5", meta: true },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function RuleChip({
  effect,
  pattern,
  chipStyle,
  money,
  className,
}: {
  effect: AllowRule["effect"];
  pattern: AllowPattern;
  chipStyle: AllowChipStyle;
  money: (n: number) => string;
  className?: string;
}) {
  const deny = effect === "deny";
  const cost = pattern.maxCost === null ? "" : `≤ ${money(pattern.maxCost)}`;
  if (chipStyle === "code") {
    const glob =
      pattern.path === ""
        ? "**"
        : pattern.path.endsWith("/")
          ? `${pattern.path}**`
          : pattern.path;
    return (
      <span
        className={cn(
          "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-1 bg-surface-2 px-2 font-mono text-[11px] whitespace-nowrap",
          className,
        )}
      >
        <span className={deny ? "text-danger" : "text-(--ar-accent)"}>
          {deny ? "deny" : "allow"}
        </span>
        <span className="text-ink-2">{pattern.verbs.join("|")}</span>
        <span className="min-w-0 truncate text-foreground">{glob}</span>
        {cost ? <span className="shrink-0 text-ink-3">{cost}</span> : null}
      </span>
    );
  }
  const where =
    pattern.path === ""
      ? "any file"
      : pattern.path.endsWith("/")
        ? lastPart(pattern.path)
        : pattern.path.slice(pattern.path.lastIndexOf("/") + 1);
  const label = [verbWords(pattern.verbs), where, cost]
    .filter(Boolean)
    .join(" · ");
  if (chipStyle === "tag") {
    return (
      <span
        className={cn(
          "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-r-1 py-0 pr-2 pl-3 text-[12px] whitespace-nowrap [clip-path:polygon(7px_0,100%_0,100%_100%,7px_100%,0_50%)]",
          deny
            ? "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-foreground"
            : "bg-(--ar-wash) text-foreground",
          className,
        )}
      >
        {deny ? (
          <Ban aria-hidden className="size-3 shrink-0 text-danger" />
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] whitespace-nowrap",
        deny
          ? "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] text-foreground"
          : "border-[color-mix(in_oklab,var(--ar-accent)_40%,transparent)] bg-(--ar-wash) text-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          deny ? "bg-(--ar-deny)" : "bg-(--ar-pigment)",
        )}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

/** Fourteen days of fires as one crisp path: no hairline smear between bars. */
function FireStrip({ daily, deny }: { daily: number[]; deny: boolean }) {
  const list = daily.slice(-14);
  const top = Math.max(1, ...list);
  const w = 4;
  const h = 16;
  let d = "";
  list.forEach((v, i) => {
    const bh = v === 0 ? 1 : Math.max(2, Math.round((v / top) * h));
    d += `M${i * w} ${h - bh}h3v${bh}h-3z`;
  });
  return (
    <svg
      aria-hidden
      width={list.length * w - 1}
      height={h}
      viewBox={`0 0 ${list.length * w - 1} ${h}`}
      shapeRendering="crispEdges"
      className="shrink-0"
    >
      <path
        d={d}
        className={
          deny
            ? "fill-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
            : "fill-[color-mix(in_oklab,var(--ar-accent)_60%,transparent)]"
        }
      />
    </svg>
  );
}

function Roll({ value, motionSafe }: { value: string; motionSafe: boolean }) {
  return (
    <span className="relative inline-flex overflow-clip align-bottom tabular-nums">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
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
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type SlotProps<T> = {
  id: string;
  label: string;
  options: AllowOption<T>[];
  value: number;
  onChange: (index: number) => void;
  onMove: (dir: -1 | 1) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alignEnd?: boolean;
  disabled: boolean;
  slotRef: (node: HTMLButtonElement | null) => void;
  /** The toolbar's one tab stop. */
  current: boolean;
  onFocusSlot: () => void;
  motionSafe: boolean;
};

/**
 * One select of the pattern sentence: a select-only combobox. Closed, Up and
 * Down change it in place and Left and Right move along the sentence; Enter,
 * Space or Alt+Down open its listbox.
 */
function Slot<T>({
  id,
  label,
  options,
  value,
  onChange,
  onMove,
  open,
  onOpenChange,
  alignEnd,
  disabled,
  slotRef,
  current: isStop,
  onFocusSlot,
  motionSafe,
}: SlotProps<T>) {
  const [hi, setHi] = React.useState(value);
  const listId = `${id}-list`;
  const current = options[value];
  const step = (dir: number) => clamp(value + dir, 0, options.length - 1);

  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (event.key === "ArrowDown" && event.altKey) {
        event.preventDefault();
        setHi(value);
        onOpenChange(true);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        onChange(step(event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        onMove(event.key === "ArrowRight" ? 1 : -1);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setHi(value);
        onOpenChange(true);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        onChange(event.key === "Home" ? 0 : options.length - 1);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHi((h) =>
        clamp(h + (event.key === "ArrowDown" ? 1 : -1), 0, options.length - 1),
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setHi(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChange(hi);
      onOpenChange(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
    } else if (event.key === "Tab") {
      onOpenChange(false);
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        ref={slotRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${hi}` : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={isStop ? 0 : -1}
        onFocus={onFocusSlot}
        onClick={() => {
          if (disabled) return;
          setHi(value);
          onOpenChange(!open);
        }}
        onKeyDown={onKey}
        onBlur={() => onOpenChange(false)}
        className={cn(
          "inline-flex h-8 max-w-full items-center gap-1 rounded-2 border border-[color-mix(in_oklab,var(--ar-accent)_35%,transparent)] bg-(--ar-wash) pr-1.5 pl-2.5 text-[13px] font-medium text-foreground transition-colors hover:border-(--ar-accent)",
          FOCUS,
        )}
      >
        <span className="relative inline-flex overflow-clip">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={current?.id ?? "none"}
              className="inline-block truncate"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {current?.label ?? "—"}
            </motion.span>
          </AnimatePresence>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-ink-3 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            key="list"
            id={listId}
            role="listbox"
            aria-label={label}
            className={cn(
              "absolute top-full z-20 mt-1 flex w-max max-w-[15rem] min-w-full flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_18%,transparent)]",
              alignEnd ? "right-0" : "left-0",
            )}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {options.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === value}
                onPointerDown={(event) => event.preventDefault()}
                onPointerEnter={() => setHi(i)}
                onClick={() => {
                  onChange(i);
                  onOpenChange(false);
                }}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2 text-[12px] whitespace-nowrap",
                  i === hi ? "bg-surface-2 text-foreground" : "text-ink-2",
                )}
              >
                <Check
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 text-(--ar-accent)",
                    i === value ? "opacity-100" : "opacity-0",
                  )}
                />
                {o.label}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Rect = { x: number; y: number; w: number; h: number };
type Flight = {
  n: number;
  stage: "fold" | "fly";
  rule: AllowRule;
  card: Rect;
  chip: Rect;
};

/**
 * A permission prompt that can become a standing rule. The request card asks
 * — Deny, Allow once, Always allow — and Always allow opens a sentence of
 * selects that widens the yes into a pattern: the action, the files and a
 * cost ceiling. A live chip shows the rule as the list will, a reach strip
 * lights the recent requests it would have covered in a cascade, and a rule
 * that collides with a deny rule (or is already covered) says which, rings
 * that rule in the list and holds Create.
 *
 * The signature is fold and fly. Create folds the request card on
 * `springs.glide` into its rule chip while the list opens a slot at the top
 * on the same spring, then the chip flies into that slot on glide; the row's
 * fire count rolls from 0 to 1 on `springs.snap` because the rule fires for
 * this request, and the next waiting request rises in. Every rule shows how
 * often it has fired, with fourteen days of fires as a strip.
 *
 * The builder is a toolbar of select-only comboboxes (Left and Right move,
 * Up and Down change, Enter opens). Rules are a list of roving stops: Enter
 * edits, R asks to revoke and the confirm focuses Keep. Below 30rem the two
 * panes sit behind tabs and the chip flies to the Rules tab. Under reduced
 * motion the card fades, the new row fades in already counted, and reach
 * dots light at once.
 */
export function AllowRules({
  request: requestProp = defaultAllowRequest,
  waiting = defaultAllowWaiting,
  templates: templatesProp,
  rules: rulesProp,
  defaultRules = defaultAllowRules,
  onRulesChange,
  history = defaultAllowHistory,
  onAllowOnce,
  onDeny,
  onCreateRule,
  onEditRule,
  onRevokeRule,
  status = "ready",
  onRetry,
  now = DEFAULT_NOW,
  chipStyle = "pill",
  listDensity = "cozy",
  accent = "cobalt",
  formatMoney = defaultMoney,
  height = 560,
  disabled = false,
  className,
}: AllowRulesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const rulesTitleId = `${uid}-rules`;
  const style: AllowChipStyle =
    chipStyle === "tag" || chipStyle === "code" ? chipStyle : "pill";
  const density = DENSITY[listDensity] ?? DENSITY.cozy;

  /* -------------------------------- state -------------------------------- */

  const [ownRules, setOwnRules] = React.useState<AllowRule[]>(
    () => defaultRules,
  );
  const rules = rulesProp ?? ownRules;

  // The queue is the request and those behind it; a decision takes the head.
  const startQueue = React.useCallback(
    () => (requestProp ? [requestProp, ...waiting] : [...waiting]),
    [requestProp, waiting],
  );
  const [queue, setQueue] = React.useState<AllowRequest[]>(startQueue);
  const [seenHead, setSeenHead] = React.useState(requestProp?.id ?? null);
  if ((requestProp?.id ?? null) !== seenHead) {
    setSeenHead(requestProp?.id ?? null);
    setQueue(requestProp ? [requestProp, ...waiting] : [...waiting]);
  }
  const request = queue[0] ?? null;
  const behind = Math.max(0, queue.length - 1);

  const templates = React.useMemo(
    () =>
      templatesProp ?? (request ? templatesFor(request, formatMoney) : null),
    [templatesProp, request, formatMoney],
  );

  const [building, setBuilding] = React.useState(false);
  const [pick, setPick] = React.useState({ verb: 0, scope: 1, cost: 0 });
  const [openSlot, setOpenSlot] = React.useState<number | null>(null);
  const [slotStop, setSlotStop] = React.useState(0);
  const [tab, setTab] = React.useState<"request" | "rules">("request");
  const [activeRule, setActiveRule] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<string | null>(null);
  const [landing, setLanding] = React.useState<string | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [leaving, setLeaving] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  // A new head of the queue starts at the narrowest useful pattern.
  const [seenRequest, setSeenRequest] = React.useState(request?.id ?? null);
  if ((request?.id ?? null) !== seenRequest) {
    setSeenRequest(request?.id ?? null);
    setBuilding(false);
    setOpenSlot(null);
    setPick({
      verb: 0,
      scope: templates && templates.scopes.length > 2 ? 1 : 0,
      cost: 0,
    });
  }

  const ready = status === "ready";
  const busy = flight !== null || leaving;
  const locked = disabled || !ready || busy;

  const pattern: AllowPattern | null = templates
    ? {
        verbs: templates.verbs[pick.verb]?.value ?? [],
        path: templates.scopes[pick.scope]?.value ?? "",
        maxCost: templates.costs[pick.cost]?.value ?? null,
      }
    : null;

  const reach = pattern ? history.map((h) => matches(pattern, h)) : [];
  const reachCount = reach.filter(Boolean).length;
  const denyHit = pattern
    ? rules.find((r) => r.effect === "deny" && overlaps(r.pattern, pattern))
    : undefined;
  const coveredBy =
    pattern && !denyHit
      ? rules.find((r) => r.effect === "allow" && covers(r.pattern, pattern))
      : undefined;
  const conflict = building && !busy ? (denyHit ?? coveredBy ?? null) : null;

  const writeRules = (next: AllowRule[]) => {
    if (rulesProp === undefined) setOwnRules(next);
    onRulesChange?.(next);
  };

  /* ------------------------------ measuring ------------------------------ */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const previewRef = React.useRef<HTMLSpanElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rulesTabRef = React.useRef<HTMLButtonElement | null>(null);
  const chipRefs = React.useRef(new Map<string, HTMLSpanElement>());
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const slotRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const alwaysRef = React.useRef<HTMLButtonElement | null>(null);

  const rectOf = (node: Element | null | undefined): Rect | null => {
    const root = rootRef.current;
    if (!node || !root) return null;
    const a = node.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    if (a.width === 0 && a.height === 0) return null;
    return {
      x: r2(a.left - b.left),
      y: r2(a.top - b.top),
      w: r2(a.width),
      h: r2(a.height),
    };
  };

  /* ------------------------------- decisions ----------------------------- */

  const run = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  // A decision removes the button that made it; focus waits on the region
  // rather than falling to the page.
  const parkFocus = () => {
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };

  const advance = () => {
    setQueue((q) => q.slice(1));
    setLeaving(false);
  };

  const decideOnce = (allow: boolean) => {
    if (locked || !request) return;
    if (allow) onAllowOnce?.(request);
    else onDeny?.(request);
    say(
      `${allow ? "Allowed once" : "Denied"}: ${request.verb} ${request.path}.${behind ? ` ${plural(behind, "request")} waiting.` : ""}`,
    );
    parkFocus();
    setLeaving(true);
    timers.current.push(
      window.setTimeout(advance, motionSafe ? 260 : durations.fast * 1000),
    );
  };

  const createRule = () => {
    if (locked || !request || !pattern) return;
    if (conflict) {
      say(
        denyHit
          ? `Can’t create it: ${ruleWords(denyHit, formatMoney)} wins over this rule.`
          : `Already covered by ${ruleWords(conflict, formatMoney)}.`,
      );
      return;
    }
    const n = ++run.current;
    const rule: AllowRule = {
      id: `${request.id}-rule`,
      effect: "allow",
      pattern,
      fires: 1,
      daily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      lastFiredAt: now,
    };
    const next = [rule, ...rules.filter((r) => r.id !== rule.id)];
    writeRules(next);
    onCreateRule?.(rule, request);
    say(
      `Rule created: ${ruleWords(rule, formatMoney)}. It fired once for this request.`,
    );
    listRef.current?.scrollTo({ top: 0 });
    parkFocus();
    const card = rectOf(cardRef.current);
    const chip = rectOf(previewRef.current);
    setOpenSlot(null);
    if (!motionSafe || !card || !chip) {
      setLanding(null);
      setLeaving(true);
      timers.current.push(window.setTimeout(advance, durations.base * 1000));
      return;
    }
    setLanding(rule.id);
    setFlight({ n, stage: "fold", rule, card, chip });
  };

  /* -------------------------------- flight ------------------------------- */

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fw = useMotionValue(0);
  const fh = useMotionValue(0);
  const fInk = useMotionValue(1);
  const cx = useMotionValue(0);
  const cy = useMotionValue(0);
  const cScale = useMotionValue(1);

  // Each beat starts from an effect once its ghosts exist, from its own
  // first frame, so StrictMode's second run replays rather than freezes it.
  React.useEffect(() => {
    if (!flight) return;
    const running: AnimationPlaybackControls[] = [];
    const n = flight.n;
    if (flight.stage === "fold") {
      fx.jump(flight.card.x);
      fy.jump(flight.card.y);
      fw.jump(flight.card.w);
      fh.jump(flight.card.h);
      fInk.jump(1);
      cx.jump(0);
      cy.jump(0);
      cScale.jump(1);
      const pad = 6;
      running.push(
        animate(fx, flight.chip.x - pad, springs.glide),
        animate(fy, flight.chip.y - pad, springs.glide),
        animate(fw, flight.chip.w + pad * 2, springs.glide),
        animate(fh, flight.chip.h + pad * 2, {
          ...springs.glide,
          onComplete: () => {
            if (run.current === n) {
              setFlight((f) => (f && f.n === n ? { ...f, stage: "fly" } : f));
            }
          },
        }),
        animate(fInk, 0, { duration: durations.base, ease: easings.exit }),
      );
    } else {
      const dest =
        rectOf(chipRefs.current.get(flight.rule.id)) ??
        rectOf(rulesTabRef.current) ??
        rectOf(listRef.current);
      const done = () => {
        if (run.current !== n) return;
        setFlight(null);
        setLanding(null);
        advance();
      };
      if (!dest) {
        done();
      } else {
        cx.jump(0);
        cy.jump(0);
        cScale.jump(1);
        // A tab is smaller than a chip: the chip shrinks into it.
        const into = dest.w < flight.chip.w * 0.8;
        running.push(
          animate(
            cx,
            r2(
              dest.x -
                flight.chip.x +
                (into ? (dest.w - flight.chip.w) / 2 : 0),
            ),
            springs.glide,
          ),
          animate(
            cy,
            r2(
              dest.y -
                flight.chip.y +
                (into ? (dest.h - flight.chip.h) / 2 : 0),
            ),
            {
              ...springs.glide,
              onComplete: done,
            },
          ),
          animate(fInk, 0, { duration: durations.fast }),
        );
        if (into) running.push(animate(cScale, 0.4, springs.glide));
      }
    }
    return () => {
      for (const c of running) c.stop();
    };
    // The motion values are stable; a beat is chosen by the flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  /* --------------------------------- rules ------------------------------- */

  const shownRuleId =
    activeRule && rules.some((r) => r.id === activeRule)
      ? activeRule
      : rules[0]?.id;

  const focusRule = (id: string | undefined) => {
    if (!id) return;
    setActiveRule(id);
    rowRefs.current.get(id)?.focus({ preventScroll: false });
  };

  const revoke = (rule: AllowRule) => {
    if (disabled || !ready) return;
    const at = rules.findIndex((r) => r.id === rule.id);
    const next = rules.filter((r) => r.id !== rule.id);
    writeRules(next);
    onRevokeRule?.(rule);
    setConfirm(null);
    say(`Revoked: ${ruleWords(rule, formatMoney)}. The agent will ask again.`);
    const neighbour = next[Math.min(at, next.length - 1)];
    if (neighbour) {
      setActiveRule(neighbour.id);
      focusReq.current = neighbour.id;
    }
  };

  const focusReq = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = focusReq.current;
    if (!id) return;
    const node = rowRefs.current.get(id);
    if (!node) return;
    focusReq.current = null;
    node.focus({ preventScroll: true });
  });

  const onRuleKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    rule: AllowRule,
  ) => {
    const at = rules.findIndex((r) => r.id === rule.id);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRule(rules[clamp(at + 1, 0, rules.length - 1)]?.id);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusRule(rules[clamp(at - 1, 0, rules.length - 1)]?.id);
        return;
      case "Home":
        event.preventDefault();
        focusRule(rules[0]?.id);
        return;
      case "End":
        event.preventDefault();
        focusRule(rules[rules.length - 1]?.id);
        return;
      case "r":
      case "R":
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        event.preventDefault();
        if (!disabled && ready) setConfirm(rule.id);
        return;
      default:
    }
  };

  const focusOnArrive = React.useCallback((node: HTMLElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  /* -------------------------------- render ------------------------------- */

  const button = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]",
    FOCUS,
  );
  const quiet = cn(
    button,
    "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );
  const step = cascade(history.length);

  const slots =
    templates && pattern
      ? ([
          { key: "verb", label: "Action", options: templates.verbs },
          { key: "scope", label: "Files", options: templates.scopes },
          { key: "cost", label: "Cost", options: templates.costs },
        ] as const)
      : null;

  const builder =
    request && slots && pattern ? (
      <div className="flex flex-col gap-3 border-t border-hairline pt-3">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Make it a rule
        </p>
        <div
          role="toolbar"
          aria-label="Rule pattern"
          className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px] leading-8 text-ink-2"
        >
          <span>Allow</span>
          <span className="font-medium text-foreground">{request.agent}</span>
          <span>to</span>
          {slots.map((slot, i) => (
            <Slot
              key={slot.key}
              id={`${uid}-${slot.key}`}
              label={slot.label}
              options={slot.options as AllowOption<unknown>[]}
              value={pick[slot.key]}
              onChange={(index) => {
                setPick((p) => ({ ...p, [slot.key]: index }));
                const o = slot.options[index];
                if (o) say(`${slot.label}: ${o.label}.`);
              }}
              onMove={(dir) => {
                const to = clamp(i + dir, 0, slots.length - 1);
                slotRefs.current[to]?.focus();
              }}
              open={openSlot === i}
              onOpenChange={(o) => setOpenSlot(o ? i : null)}
              alignEnd={i === slots.length - 1}
              disabled={locked}
              slotRef={(node) => {
                slotRefs.current[i] = node;
              }}
              current={slotStop === i}
              onFocusSlot={() => setSlotStop(i)}
              motionSafe={motionSafe}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-ink-3">Rule</span>
          <span
            ref={previewRef}
            className={cn(
              "inline-flex max-w-full min-w-0",
              flight && "opacity-0",
            )}
          >
            <RuleChip
              effect="allow"
              pattern={pattern}
              chipStyle={style}
              money={formatMoney}
            />
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <div aria-hidden className="flex flex-wrap gap-[3px]">
            {reach.map((hit, i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full transition-colors duration-200",
                  hit
                    ? "bg-(--ar-pigment)"
                    : "bg-[color-mix(in_oklab,var(--foreground)_12%,transparent)]",
                )}
                style={
                  motionSafe
                    ? { transitionDelay: `${Math.round(i * step * 1000)}ms` }
                    : { transitionDuration: "0ms" }
                }
              />
            ))}
          </div>
          <p className="text-[11px] text-ink-3">
            Would have covered{" "}
            <span className="font-mono text-ink-2 tabular-nums">
              <Roll value={String(reachCount)} motionSafe={motionSafe} />
            </span>{" "}
            of the last {history.length} requests.
          </p>
        </div>

        <AnimatePresence initial={false}>
          {conflict ? (
            <motion.div
              key="conflict"
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: 0 }
              }
            >
              <div
                role="alert"
                className={cn(
                  "flex flex-wrap items-start gap-x-2 gap-y-2 rounded-2 border px-2.5 py-2",
                  denyHit
                    ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,transparent)]"
                    : "border-hairline bg-surface-2",
                )}
              >
                {denyHit ? (
                  <TriangleAlert
                    aria-hidden
                    className="mt-0.5 size-3.5 shrink-0 text-danger"
                  />
                ) : (
                  <Check
                    aria-hidden
                    className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                  />
                )}
                <p className="min-w-0 flex-1 basis-40 text-[12px] leading-4 text-foreground">
                  {denyHit
                    ? `“${ruleWords(denyHit, formatMoney)}” overlaps this rule and wins. Narrow the rule, or change that one.`
                    : `“${ruleWords(conflict, formatMoney)}” already allows this.`}
                </p>
                {denyHit && onEditRule ? (
                  <button
                    type="button"
                    onClick={() => onEditRule(denyHit)}
                    className={cn(quiet, "h-7 px-2.5 text-[11px]")}
                  >
                    <Pencil aria-hidden className="size-3" />
                    Edit that rule
                  </button>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-disabled={locked || undefined}
            onClick={() => {
              setBuilding(false);
              setOpenSlot(null);
              const t = alwaysRef.current;
              if (t?.isConnected) t.focus({ preventScroll: true });
            }}
            className={quiet}
          >
            Back
          </button>
          <button
            type="button"
            onClick={createRule}
            aria-disabled={locked || !!conflict || undefined}
            className={cn(
              button,
              "ml-auto bg-(--ar-button) text-(--ar-on)",
              locked || conflict
                ? "cursor-not-allowed opacity-50"
                : "hover:opacity-90",
            )}
          >
            Create rule
          </button>
        </div>
      </div>
    ) : null;

  const crumbs = request ? request.path.split("/") : [];

  const card = request ? (
    <motion.div
      key={request.id}
      ref={cardRef}
      className={cn(
        "flex flex-col gap-3 rounded-3 border border-hairline bg-card p-3.5 shadow-[0_1px_2px_color-mix(in_oklab,black_6%,transparent)]",
        flight && "invisible",
      )}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={
        leaving
          ? { opacity: 0, y: motionSafe ? -distances.step : 0 }
          : { opacity: 1, y: 0 }
      }
      transition={
        leaving
          ? { duration: durations.base * 0.6, ease: easings.exit }
          : motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.base }
      }
    >
      <div className="flex flex-wrap items-start gap-x-2.5 gap-y-1">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--ar-wash) text-[12px] font-semibold text-(--ar-accent)"
        >
          {request.agent.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-1 basis-44 flex-col">
          <h3 id={titleId} className="text-[13px] leading-5 font-medium">
            {request.agent} wants to {request.verb} a file
          </h3>
          <p className="text-[11px] text-ink-3">
            {ago(request.at, now)}
            {behind ? ` · ${behind} more waiting` : ""}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-2 bg-surface-2 px-2.5 py-2">
        <FileText aria-hidden className="size-3.5 shrink-0 text-ink-3" />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 font-mono text-[11px] text-ink-3">
          {crumbs.map((c, i) => (
            <React.Fragment key={`${c}-${i}`}>
              {i > 0 ? <span aria-hidden>/</span> : null}
              <span
                className={cn(
                  "break-all",
                  i === crumbs.length - 1 && "font-medium text-foreground",
                )}
              >
                {c}
              </span>
            </React.Fragment>
          ))}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
          {request.size ? `${request.size} · ` : ""}
          {formatMoney(request.cost)}
        </span>
      </div>
      <p className="text-[12px] leading-[1.5] text-ink-2">“{request.reason}”</p>

      <AnimatePresence initial={false} mode="popLayout">
        {building ? (
          <motion.div
            key="builder"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
            style={{ overflow: "clip", overflowClipMargin: 8 }}
          >
            {builder}
          </motion.div>
        ) : (
          <motion.div
            key="choices"
            className="flex flex-wrap items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base }}
          >
            <button
              type="button"
              aria-disabled={locked || undefined}
              onClick={() => decideOnce(false)}
              className={cn(quiet, "hover:text-danger")}
            >
              Deny
            </button>
            <button
              type="button"
              aria-disabled={locked || undefined}
              onClick={() => decideOnce(true)}
              className={quiet}
            >
              Allow once
            </button>
            <button
              ref={alwaysRef}
              type="button"
              aria-expanded={building}
              aria-disabled={locked || undefined}
              onClick={() => {
                if (locked) return;
                setBuilding(true);
                say(
                  "Building a rule. Left and Right move between the choices, Up and Down change them.",
                );
              }}
              className={cn(
                button,
                "ml-auto bg-(--ar-button) text-(--ar-on)",
                locked ? "cursor-not-allowed opacity-50" : "hover:opacity-90",
              )}
            >
              Always allow…
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  ) : null;

  const requestPane = (
    <section
      aria-label="Permission request"
      className={cn(
        "flex flex-col overflow-hidden",
        tab === "rules" && "@max-[30rem]:hidden",
      )}
    >
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain p-3">
        {!ready ? null : card ? (
          <AnimatePresence mode="popLayout" initial={false}>
            {card}
          </AnimatePresence>
        ) : (
          <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <Check aria-hidden className="mb-1 size-5 text-success" />
            <p className="text-[13px] text-ink-2">Nothing waiting.</p>
            <p className="text-[12px] text-ink-3">
              The agent will ask here when it needs permission.
            </p>
          </div>
        )}
      </div>
    </section>
  );

  const ruleRows = rules.map((rule) => {
    const isLanding = landing === rule.id;
    const isConflict = conflict?.id === rule.id;
    const isActive = rule.id === shownRuleId;
    const fires = isLanding ? rule.fires - 1 : rule.fires;
    const words = ruleWords(rule, formatMoney);
    return (
      <motion.li
        key={rule.id}
        className="overflow-hidden"
        initial={isLanding ? { height: 0, opacity: 0 } : false}
        animate={{ height: "auto", opacity: 1 }}
        exit={{
          height: 0,
          opacity: 0,
          transition: motionSafe
            ? { height: springs.glide, opacity: exitFor(durations.base) }
            : { duration: durations.base },
        }}
        transition={
          motionSafe
            ? { height: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.base }
        }
      >
        <div
          className={cn(
            "group/allow-rules-row relative flex items-center gap-2 border-b border-hairline px-3 transition-colors",
            density.row,
            isConflict &&
              "bg-[color-mix(in_oklab,var(--danger)_6%,transparent)]",
          )}
        >
          {isConflict ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0.5 rounded-2 shadow-[inset_0_0_0_1.5px_var(--ar-deny)]"
              initial={{ opacity: 0, scale: motionSafe ? 1.02 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                motionSafe
                  ? {
                      scale: springs.snap,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            />
          ) : null}
          <AnimatePresence>
            {isLanding ? (
              <motion.span
                key="wash"
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-(--ar-wash)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  transition: { duration: 0.9, ease: easings.enter },
                }}
                transition={{ duration: durations.base }}
              />
            ) : null}
          </AnimatePresence>
          <button
            ref={(node) => {
              if (node) rowRefs.current.set(rule.id, node);
              else rowRefs.current.delete(rule.id);
            }}
            type="button"
            tabIndex={isActive ? 0 : -1}
            aria-label={`${words}. Fired ${plural(rule.fires, "time")}, last ${ago(rule.lastFiredAt, now)}.`}
            aria-describedby={`${uid}-rules-hint`}
            onFocus={() => setActiveRule(rule.id)}
            onClick={() => onEditRule?.(rule)}
            onKeyDown={(event) => onRuleKey(event, rule)}
            className={cn(
              "relative flex min-w-0 flex-1 flex-col items-start gap-1 rounded-2 text-left",
              FOCUS,
            )}
          >
            <span
              ref={(node) => {
                if (node) chipRefs.current.set(rule.id, node);
                else chipRefs.current.delete(rule.id);
              }}
              className={cn(
                "inline-flex max-w-full min-w-0",
                isLanding && flight ? "opacity-0" : "opacity-100",
              )}
            >
              <RuleChip
                effect={rule.effect}
                pattern={rule.pattern}
                chipStyle={style}
                money={formatMoney}
              />
            </span>
            {density.meta ? (
              <span className="text-[11px] text-ink-3">
                {rule.effect === "deny" ? "Blocked" : "Fired"}{" "}
                {ago(rule.lastFiredAt, now)}
              </span>
            ) : null}
          </button>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="flex items-center gap-2">
              {rule.daily ? (
                <span className="hidden @min-[26rem]:inline-flex">
                  <FireStrip daily={rule.daily} deny={rule.effect === "deny"} />
                </span>
              ) : null}
              <span className="min-w-9 text-right font-mono text-[12px] text-foreground tabular-nums">
                <Roll value={count(fires)} motionSafe={motionSafe} />
                <span className="text-ink-3">×</span>
              </span>
            </span>
          </span>
          <span
            aria-hidden
            title="Revoke"
            onClick={() => {
              if (!disabled && ready) setConfirm(rule.id);
            }}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-2 text-ink-3 opacity-60 transition-opacity group-hover/allow-rules-row:opacity-100 hover:bg-surface-2 hover:text-danger"
          >
            <X className="size-3.5" />
          </span>
        </div>
        <AnimatePresence initial={false}>
          {confirm === rule.id ? (
            <motion.div
              key="confirm"
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: 0 }
              }
            >
              <div
                role="group"
                aria-label={`Revoke ${words}`}
                className="flex flex-wrap items-center gap-2 border-b border-hairline bg-surface-2 px-3 py-2"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setConfirm(null);
                    focusReq.current = rule.id;
                  }
                }}
              >
                <p className="min-w-0 flex-1 basis-40 text-[12px] leading-4 text-foreground">
                  Revoke it? The agent will ask again for these files.
                </p>
                <button
                  type="button"
                  onClick={() => revoke(rule)}
                  className={cn(
                    button,
                    "h-7 bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-2.5 text-[11px] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_20%,transparent)]",
                  )}
                >
                  Revoke
                </button>
                <button
                  ref={focusOnArrive}
                  type="button"
                  onClick={() => {
                    setConfirm(null);
                    focusReq.current = rule.id;
                  }}
                  className={cn(quiet, "h-7 px-2.5 text-[11px]")}
                >
                  Keep
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.li>
    );
  });

  const rulesPane = (
    <section
      aria-labelledby={rulesTitleId}
      className={cn(
        "flex flex-col overflow-hidden border-hairline @min-[30rem]:border-l",
        tab === "request" && "@max-[30rem]:hidden",
      )}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3">
        <h3 id={rulesTitleId} className="text-[12px] font-medium">
          Standing rules
        </h3>
        <span className="font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          14 days · fires
        </span>
      </div>
      <div
        ref={listRef}
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {rules.length === 0 ? (
          <p className="px-4 py-8 text-center text-[12px] text-ink-3">
            No standing rules. Each request asks.
          </p>
        ) : (
          <ul aria-labelledby={rulesTitleId} className="flex flex-col">
            <AnimatePresence initial={false}>{ruleRows}</AnimatePresence>
          </ul>
        )}
      </div>
      <p id={`${uid}-rules-hint`} className="sr-only">
        Up and Down move between rules. Enter edits a rule, R revokes it after a
        confirm.
      </p>
    </section>
  );

  const tabs = (
    <div
      role="tablist"
      aria-label="Permissions"
      className="flex shrink-0 gap-1 border-b border-hairline px-3 py-2 @min-[30rem]:hidden"
    >
      {(["request", "rules"] as const).map((t) => {
        const on = tab === t;
        return (
          <button
            key={t}
            ref={t === "rules" ? rulesTabRef : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                const other = t === "request" ? "rules" : "request";
                setTab(other);
                (
                  event.currentTarget.parentElement?.querySelector(
                    `[data-ar-tab="${other}"]`,
                  ) as HTMLElement | null
                )?.focus();
              }
            }}
            data-ar-tab={t}
            className={cn(
              "relative inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-2 text-[12px] transition-colors",
              on ? "text-foreground" : "text-ink-3 hover:text-ink-2",
              FOCUS,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-tab`}
                aria-hidden
                className="absolute inset-0 rounded-2 bg-surface-2"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">
              {t === "request" ? "Request" : "Rules"}
            </span>
            <span className="relative font-mono text-[11px] text-ink-3 tabular-nums">
              <Roll
                value={String(
                  t === "request"
                    ? queue.length
                    : rules.length - (landing ? 1 : 0),
                )}
                motionSafe={motionSafe}
              />
            </span>
          </button>
        );
      })}
    </div>
  );

  const stateView =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        <p className="sr-only">Loading permissions.</p>
        {[60, 86, 40, 92, 74].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="h-3 rounded-full bg-surface-2 motion-safe:animate-pulse"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px]">Permissions did not load.</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={quiet}>
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
        <p className="text-[13px] text-ink-2">
          No agent has asked for anything.
        </p>
      </div>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      tabIndex={-1}
      aria-label={`Permissions for ${request?.agent ?? AGENT}`}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-surface-1 text-foreground outline-none",
        disabled && "opacity-80",
        className,
      )}
      style={{ maxHeight: height, ...accentVars(accent) }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline bg-card px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">
          Permissions
        </p>
        <p className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {plural(rules.length, "rule")} ·{" "}
          {queue.length === 0 ? "none waiting" : `${queue.length} waiting`}
        </p>
      </header>
      {ready ? (
        <>
          {tabs}
          <div className="grid flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden @min-[30rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {requestPane}
            {rulesPane}
          </div>
        </>
      ) : (
        stateView
      )}

      {flight ? (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
          <motion.div
            className="absolute top-0 left-0 rounded-3 border border-hairline-strong bg-card shadow-[0_10px_28px_color-mix(in_oklab,black_16%,transparent)]"
            style={{ x: fx, y: fy, width: fw, height: fh, opacity: fInk }}
          />
          <motion.span
            className="absolute inline-flex"
            style={{
              left: flight.chip.x,
              top: flight.chip.y,
              width: flight.chip.w,
              height: flight.chip.h,
              x: cx,
              y: cy,
              scale: cScale,
            }}
          >
            <RuleChip
              effect="allow"
              pattern={flight.rule.pattern}
              chipStyle={style}
              money={formatMoney}
              className="shadow-[0_6px_16px_color-mix(in_oklab,black_16%,transparent)]"
            />
          </motion.span>
        </div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
