"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  RotateCcw,
  TriangleAlert,
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
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type ChargebackBarStyle = "solid" | "soft" | "outline";
export type ChargebackDensity = "compact" | "cozy" | "roomy";
export type ChargebackPalette = "basin" | "ember" | "spectrum" | "mono";
export type ChargebackStatus = "ready" | "loading" | "error";

export type ChargebackCost = {
  id: string;
  /** The resource, e.g. "search-cluster". Matched by rules on the key "resource". */
  label: string;
  /** Compute, Storage, Database, Network, Observability… */
  service: string;
  amount: number;
  /** The same resource's amount last month. */
  previous: number;
  tags: Record<string, string>;
};

export type ChargebackTeam = {
  id: string;
  name: string;
  owner: string;
  /** Shown under the owner in roomy rows. */
  role?: string;
};

export type ChargebackRule =
  | {
      id: string;
      kind: "tag";
      /** A tag key, or "resource" to match a cost's label. */
      key: string;
      value: string;
      team: string;
      enabled: boolean;
    }
  | {
      id: string;
      kind: "split";
      /** Costs whose tag `key` equals `value` are shared across every team. */
      key: string;
      value: string;
      method: "usage" | "even";
      enabled: boolean;
    };

export type ChargebackMonth = { id: string; label: string; long: string };

export type ChargebackRow = {
  team: ChargebackTeam;
  amount: number;
  previous: number;
  share: number;
  change: number | null;
  services: { service: string; amount: number }[];
  rules: string[];
};

export type TeamChargebackProps = {
  /** How team bars are drawn: pigment fills, a tint with a lead edge, or outlines that fill on focus. @default "soft" */
  barStyle?: ChargebackBarStyle;
  /** Row height: 40, 52 or 64 px; roomy rows also show the owner's role. @default "cozy" */
  density?: ChargebackDensity;
  /** The team colours: cool blues and teals, warm, spread hues, or ink steps. @default "basin" */
  palette?: ChargebackPalette;
  /** Costs per month id. @default defaultChargebackCosts */
  costs?: Record<string, ChargebackCost[]>;
  /** The months, oldest first, as tabs. @default defaultChargebackMonths */
  months?: ChargebackMonth[];
  /** Controlled month id. */
  month?: string;
  /** Initial month when uncontrolled. @default "2026-10" */
  defaultMonth?: string;
  /** A month tab was chosen. */
  onMonthChange?: (month: string) => void;
  /** The teams costs are charged back to. @default defaultChargebackTeams */
  teams?: ChargebackTeam[];
  /** Controlled allocation rules. */
  rules?: ChargebackRule[];
  /** Initial rules when uncontrolled. @default defaultChargebackRules */
  defaultRules?: ChargebackRule[];
  /** A rule was switched, re-methoded or added, with every rule. */
  onRuleChange?: (rule: ChargebackRule, rules: ChargebackRule[]) => void;
  /** An unallocated cost was assigned to a team (uncontrolled, a resource rule is added). */
  onAllocate?: (costId: string, teamId: string) => void;
  /** Export was pressed: the allocation as CSV, and as rows. */
  onExport?: (csv: string, rows: ChargebackRow[]) => void;
  /** Controlled split state: the total bar split into team rows. */
  split?: boolean;
  /** Initial split state when uncontrolled. @default false */
  defaultSplit?: boolean;
  /** The total bar was pressed. */
  onSplitChange?: (split: boolean) => void;
  /** Formats an amount. @default US dollars, no cents */
  format?: (amount: number) => string;
  /** Whether the costs have arrived. @default "ready" */
  status?: ChargebackStatus;
  /** "Try again" was pressed after the costs failed to load. */
  onRetry?: () => void;
  /** The account, in the heading. @default "Basinworks" */
  account?: string;
  /** Height of the surface, px; its body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be split, switched or assigned. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultChargebackTeams: ChargebackTeam[] = [
  { id: "search", name: "Search", owner: "Priya Shah", role: "Eng manager" },
  { id: "payments", name: "Payments", owner: "Joel Brandt", role: "Tech lead" },
  {
    id: "data",
    name: "Data platform",
    owner: "Mara Ilves",
    role: "Head of data",
  },
  { id: "mobile", name: "Mobile", owner: "Kenji Mori", role: "Eng manager" },
  { id: "growth", name: "Growth", owner: "Ines Varga", role: "PM" },
];

export const defaultChargebackMonths: ChargebackMonth[] = [
  { id: "2026-08", label: "Aug", long: "August" },
  { id: "2026-09", label: "Sep", long: "September" },
  { id: "2026-10", label: "Oct", long: "October" },
  { id: "2026-11", label: "Nov", long: "November" },
];

const OCTOBER: ChargebackCost[] = [
  {
    id: "c1",
    label: "search-cluster",
    service: "Compute",
    amount: 9840,
    previous: 9120,
    tags: { team: "search" },
  },
  {
    id: "c2",
    label: "search-index",
    service: "Storage",
    amount: 2310,
    previous: 2280,
    tags: { team: "search" },
  },
  {
    id: "c3",
    label: "payments-api",
    service: "Compute",
    amount: 7420,
    previous: 7610,
    tags: { team: "payments" },
  },
  {
    id: "c4",
    label: "ledger-db",
    service: "Database",
    amount: 5180,
    previous: 4960,
    tags: { team: "payments" },
  },
  {
    id: "c5",
    label: "warehouse",
    service: "Database",
    amount: 8960,
    previous: 7240,
    tags: { team: "data" },
  },
  {
    id: "c6",
    label: "etl-workers",
    service: "Compute",
    amount: 3740,
    previous: 3590,
    tags: { team: "data" },
  },
  {
    id: "c7",
    label: "mobile-backend",
    service: "Compute",
    amount: 2860,
    previous: 2410,
    tags: { team: "mobile" },
  },
  {
    id: "c8",
    label: "push-gateway",
    service: "Network",
    amount: 640,
    previous: 610,
    tags: { team: "mobile" },
  },
  {
    id: "c9",
    label: "experiments",
    service: "Compute",
    amount: 1920,
    previous: 2130,
    tags: { team: "growth" },
  },
  {
    id: "c10",
    label: "shared-vpc",
    service: "Network",
    amount: 2450,
    previous: 2380,
    tags: { shared: "yes" },
  },
  {
    id: "c11",
    label: "observability",
    service: "Observability",
    amount: 1860,
    previous: 1790,
    tags: { shared: "yes" },
  },
  {
    id: "c12",
    label: "landing-cdn",
    service: "Network",
    amount: 980,
    previous: 1040,
    tags: { project: "website" },
  },
  {
    id: "c13",
    label: "log-archive",
    service: "Storage",
    amount: 1140,
    previous: 990,
    tags: {},
  },
  {
    id: "c14",
    label: "ci-runners",
    service: "Compute",
    amount: 1020,
    previous: 940,
    tags: { env: "ci" },
  },
];

const back = (list: ChargebackCost[], k: number): ChargebackCost[] =>
  list.map((c) => ({
    ...c,
    amount: c.previous,
    previous: Math.round(c.previous * k),
  }));

/** August to October for Basinworks; November has not been billed yet. */
export const defaultChargebackCosts: Record<string, ChargebackCost[]> = {
  "2026-08": back(back(OCTOBER, 0.95), 0.94),
  "2026-09": back(OCTOBER, 0.95),
  "2026-10": OCTOBER,
  "2026-11": [],
};

export const defaultChargebackRules: ChargebackRule[] = [
  {
    id: "r1",
    kind: "tag",
    key: "team",
    value: "search",
    team: "search",
    enabled: true,
  },
  {
    id: "r2",
    kind: "tag",
    key: "team",
    value: "payments",
    team: "payments",
    enabled: true,
  },
  {
    id: "r3",
    kind: "tag",
    key: "team",
    value: "data",
    team: "data",
    enabled: true,
  },
  {
    id: "r4",
    kind: "tag",
    key: "team",
    value: "mobile",
    team: "mobile",
    enabled: true,
  },
  {
    id: "r5",
    kind: "tag",
    key: "team",
    value: "growth",
    team: "growth",
    enabled: true,
  },
  {
    id: "r6",
    kind: "split",
    key: "shared",
    value: "yes",
    method: "usage",
    enabled: true,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const defaultFormat = (amount: number) => USD.format(Math.round(amount));

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const PALETTE: Record<ChargebackPalette, (i: number) => string> = {
  basin: (i) =>
    `oklch(${[0.62, 0.76, 0.68, 0.58, 0.8, 0.7][i % 6]} 0.11 ${[255, 205, 168, 288, 228, 185][i % 6]})`,
  ember: (i) =>
    `oklch(${[0.66, 0.78, 0.6, 0.72, 0.84, 0.7][i % 6]} 0.13 ${[48, 75, 25, 8, 90, 35][i % 6]})`,
  spectrum: (i) => `oklch(0.68 0.13 ${[258, 160, 72, 330, 24, 200][i % 6]})`,
  mono: (i) => `oklch(${[0.45, 0.55, 0.64, 0.72, 0.79, 0.5][i % 6]} 0.012 258)`,
};

const DENSITY: Record<ChargebackDensity, { row: string; bar: number }> = {
  compact: { row: "py-1.5", bar: 8 },
  cozy: { row: "py-2.5", bar: 10 },
  roomy: { row: "py-3.5", bar: 12 },
};

const HATCH =
  "repeating-linear-gradient(135deg, var(--hairline-strong) 0 1.5px, transparent 1.5px 5px)";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

const matches = (cost: ChargebackCost, key: string, value: string): boolean =>
  key === "resource" ? cost.label === value : cost.tags[key] === value;

type Allocation = {
  total: number;
  previousTotal: number;
  rows: ChargebackRow[];
  unallocated: ChargebackCost[];
  unallocatedAmount: number;
};

function allocate(
  costs: ChargebackCost[],
  teams: ChargebackTeam[],
  rules: ChargebackRule[],
): Allocation {
  const acc = new Map<
    string,
    {
      amount: number;
      previous: number;
      services: Map<string, number>;
      rules: Set<string>;
    }
  >();
  for (const t of teams)
    acc.set(t.id, {
      amount: 0,
      previous: 0,
      services: new Map(),
      rules: new Set(),
    });
  const unallocated: ChargebackCost[] = [];
  const shared: { cost: ChargebackCost; rule: ChargebackRule }[] = [];
  for (const cost of costs) {
    const split = rules.find(
      (r) => r.kind === "split" && r.enabled && matches(cost, r.key, r.value),
    );
    if (split) {
      shared.push({ cost, rule: split });
      continue;
    }
    const rule = rules.find(
      (r) =>
        r.kind === "tag" &&
        r.enabled &&
        acc.has(r.team) &&
        matches(cost, r.key, r.value),
    );
    const slot = rule && rule.kind === "tag" ? acc.get(rule.team) : undefined;
    if (!rule || !slot) {
      unallocated.push(cost);
      continue;
    }
    slot.amount += cost.amount;
    slot.previous += cost.previous;
    slot.services.set(
      cost.service,
      (slot.services.get(cost.service) ?? 0) + cost.amount,
    );
    slot.rules.add(rule.id);
  }
  const direct = [...acc.values()].reduce((s, a) => s + a.amount, 0);
  for (const { cost, rule } of shared) {
    if (rule.kind !== "split") continue;
    const n = acc.size;
    for (const slot of acc.values()) {
      const k =
        rule.method === "even" || direct === 0 ? 1 / n : slot.amount / direct;
      slot.amount += cost.amount * k;
      slot.previous += cost.previous * k;
      slot.services.set(
        cost.service,
        (slot.services.get(cost.service) ?? 0) + cost.amount * k,
      );
      slot.rules.add(rule.id);
    }
  }
  const total = costs.reduce((s, c) => s + c.amount, 0);
  const previousTotal = costs.reduce((s, c) => s + c.previous, 0);
  const rows: ChargebackRow[] = teams
    .map((team) => {
      const a = acc.get(team.id);
      const amount = r2(a?.amount ?? 0);
      const previous = r2(a?.previous ?? 0);
      return {
        team,
        amount,
        previous,
        share: total > 0 ? r3(amount / total) : 0,
        change: previous > 0 ? r3((amount - previous) / previous) : null,
        services: [...(a?.services ?? new Map<string, number>()).entries()]
          .map(([service, v]) => ({ service, amount: r2(v) }))
          .sort((x, y) => y.amount - x.amount),
        rules: [...(a?.rules ?? new Set<string>())],
      };
    })
    .sort((x, y) => y.amount - x.amount);
  return {
    total: r2(total),
    previousTotal: r2(previousTotal),
    rows,
    unallocated,
    unallocatedAmount: r2(unallocated.reduce((s, c) => s + c.amount, 0)),
  };
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

function Trend({ change }: { change: number | null }) {
  if (change === null)
    return <span className="text-[11px] text-ink-3">new</span>;
  const pct = Math.round(change * 100);
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? ArrowRight : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums",
        pct > 10 ? "text-warn" : pct < 0 ? "text-success" : "text-ink-3",
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {flat ? "0%" : `${up ? "+" : "−"}${Math.abs(pct)}%`}
    </span>
  );
}

const trendWords = (change: number | null) => {
  if (change === null) return "new this month";
  const pct = Math.round(change * 100);
  return pct === 0
    ? "flat on last month"
    : `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on last month`;
};

/** A team's bar, as a fill inside a track, drawn in the chosen style. */
function barSurface(style: ChargebackBarStyle) {
  return style === "solid"
    ? "bg-(--tc-c)"
    : style === "soft"
      ? "border-l-[3px] border-(--tc-c) bg-[color-mix(in_oklab,var(--tc-c)_32%,transparent)]"
      : "border-[1.5px] border-(--tc-c) bg-transparent group-hover/team-chargeback-row:bg-[color-mix(in_oklab,var(--tc-c)_22%,transparent)] group-focus-within/team-chargeback-row:bg-[color-mix(in_oklab,var(--tc-c)_22%,transparent)]";
}

/** Measures its content so an open row glides to its real height. */
function Reveal({
  open,
  motionSafe,
  id,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  id: string;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [h, setH] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() =>
      setH(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      id={id}
      className="overflow-hidden"
      initial={false}
      animate={{ height: open ? h : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.fast } }
          : { duration: 0 }
      }
      aria-hidden={!open}
      inert={!open}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The view                                  */
/* ----------------------------------------------------------------------- */

type Phase = "joined" | "parted" | "split";
type Said = { n: number; text: string };

/**
 * A cost-allocation view for a cloud account. The month's total is one long
 * bar, already divided into its teams with what no rule claims hatched at its
 * end. Pressing it splits it: the segments part on springs.snap, then each
 * one slides down into its own row of a ranked list on springs.glide in one
 * cascade, while its share, trend and owner arrive beside it; the
 * unallocated remainder stays behind in the bar. Pressing again folds the
 * rows back up.
 *
 * Allocation is computed from the rules: a cost goes to the first enabled tag
 * rule that matches it, shared costs are split by usage or evenly, and the
 * rest stays unallocated, where each item can be assigned to a team. Rows
 * open with Enter to their spend by service and the rules that claimed it;
 * arrows walk the rows. A month without costs says so, and a narrow
 * container shortens the bars to percentages.
 */
export function TeamChargeback({
  barStyle = "soft",
  density = "cozy",
  palette = "basin",
  costs = defaultChargebackCosts,
  months = defaultChargebackMonths,
  month,
  defaultMonth = "2026-10",
  onMonthChange,
  teams = defaultChargebackTeams,
  rules,
  defaultRules,
  onRuleChange,
  onAllocate,
  onExport,
  split,
  defaultSplit = false,
  onSplitChange,
  format,
  status = "ready",
  onRetry,
  account = "Basinworks",
  height = 540,
  disabled = false,
  className,
}: TeamChargebackProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const fmt = format ?? defaultFormat;
  const colourOf = PALETTE[palette] ?? PALETTE.basin;
  const dens = DENSITY[density] ?? DENSITY.cozy;
  const ready = status === "ready";

  /* ------------------------------ state --------------------------------- */

  const [ownMonth, setOwnMonth] = React.useState(defaultMonth);
  const monthId = month ?? ownMonth;
  const monthMeta = months.find((m) => m.id === monthId) ?? months[0];
  const [ownRules, setOwnRules] = React.useState<ChargebackRule[]>(
    () => defaultRules ?? defaultChargebackRules,
  );
  const ruleList = rules ?? ownRules;
  const writeRule = (rule: ChargebackRule, next: ChargebackRule[]) => {
    if (rules === undefined) setOwnRules(next);
    onRuleChange?.(rule, next);
  };

  const [ownSplit, setOwnSplit] = React.useState(defaultSplit);
  const isSplit = split ?? ownSplit;

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const monthCosts = React.useMemo(
    () => costs[monthId] ?? [],
    [costs, monthId],
  );
  const alloc = React.useMemo(
    () => allocate(monthCosts, teams, ruleList),
    [monthCosts, teams, ruleList],
  );
  const empty = ready && monthCosts.length === 0;
  // Every billed month, allocated by today's rules, for the folded view.
  const history = React.useMemo(
    () =>
      months
        .filter((m) => (costs[m.id] ?? []).length > 0)
        .map((m) => {
          const a = allocate(costs[m.id] ?? [], teams, ruleList);
          return {
            id: m.id,
            label: m.label,
            long: m.long,
            total: a.total,
            rows: a.rows,
            unallocated: a.unallocatedAmount,
          };
        }),
    [months, costs, teams, ruleList],
  );
  const historyMax = Math.max(1, ...history.map((h) => h.total));

  const chooseMonth = (id: string) => {
    if (month === undefined) setOwnMonth(id);
    setOrder(null);
    onMonthChange?.(id);
  };

  // The ranking is read fresh at each split. While rows are being edited it
  // holds still, so a rule change never pulls the row you are working in
  // out from under the focus; the next split ranks again.
  const [order, setOrder] = React.useState<string[] | null>(null);
  const holdOrder = () => {
    if (!order) setOrder(alloc.rows.map((r) => r.team.id));
  };

  const max = Math.max(1, ...alloc.rows.map((r) => r.amount));
  const unallocShare =
    alloc.total > 0 ? alloc.unallocatedAmount / alloc.total : 0;
  const colourIndex = new Map(teams.map((t, i) => [t.id, i]));
  const colour = (teamId: string) => colourOf(colourIndex.get(teamId) ?? 0);

  /* ------------------------------ phases -------------------------------- */

  // The split is two beats: the segments part, then they travel. The phase
  // follows the split state through a short timer, and a host that flips
  // `split` gets the same choreography a press does.
  const [phase, setPhase] = React.useState<Phase>(isSplit ? "split" : "joined");
  React.useEffect(() => {
    const target: Phase = isSplit ? "split" : "joined";
    if (phase === target) return;
    const delay = motionSafe ? (phase === "parted" ? 130 : 0) : 0;
    const t = window.setTimeout(
      () =>
        setPhase((p) =>
          p === target ? p : p === "parted" || !motionSafe ? target : "parted",
        ),
      delay,
    );
    return () => window.clearTimeout(t);
  }, [isSplit, phase, motionSafe]);

  const toggleSplit = () => {
    if (disabled || !ready || empty) return;
    const next = !isSplit;
    if (split === undefined) setOwnSplit(next);
    setOrder(null);
    onSplitChange?.(next);
    const top = alloc.rows[0];
    say(
      next
        ? `Split by team: ${alloc.rows.length} teams${top ? `, ${top.team.name} largest at ${Math.round(top.share * 100)}%` : ""}. ${fmt(alloc.unallocatedAmount)} unallocated.`
        : "Folded back into the total.",
    );
  };

  /* ------------------------------ expand -------------------------------- */

  const [open, setOpen] = React.useState<Set<string>>(() => new Set());
  const toggleRow = (key: string, name: string) => {
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
    say(`${name} ${open.has(key) ? "closed" : "opened"}.`);
  };

  const ranked = order
    ? [
        ...order
          .map((id) => alloc.rows.find((r) => r.team.id === id))
          .filter((r): r is ChargebackRow => !!r),
        ...alloc.rows.filter((r) => !order.includes(r.team.id)),
      ]
    : alloc.rows;
  const rowKeys = [
    ...ranked.map((r) => r.team.id),
    ...(alloc.unallocated.length ? ["unallocated"] : []),
  ];
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const active =
    activeKey && rowKeys.includes(activeKey) ? activeKey : (rowKeys[0] ?? null);
  const rowButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const onRowKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: string,
  ) => {
    const i = rowKeys.indexOf(key);
    let next: string | undefined;
    if (event.key === "ArrowDown")
      next = rowKeys[Math.min(rowKeys.length - 1, i + 1)];
    else if (event.key === "ArrowUp") next = rowKeys[Math.max(0, i - 1)];
    else if (event.key === "Home") next = rowKeys[0];
    else if (event.key === "End") next = rowKeys[rowKeys.length - 1];
    else return;
    event.preventDefault();
    if (next) {
      setActiveKey(next);
      rowButtons.current.get(next)?.focus();
    }
  };

  /* ------------------------------ actions ------------------------------- */

  const switchRule = (rule: ChargebackRule) => {
    if (disabled) return;
    const changed = { ...rule, enabled: !rule.enabled } as ChargebackRule;
    holdOrder();
    writeRule(
      changed,
      ruleList.map((r) => (r.id === rule.id ? changed : r)),
    );
    say(
      `${rule.kind === "tag" ? `Rule ${rule.key} = ${rule.value}` : "Shared cost split"} ${changed.enabled ? "on" : "off"}.`,
    );
  };
  const methodRule = (rule: ChargebackRule, method: "usage" | "even") => {
    if (disabled || rule.kind !== "split" || rule.method === method) return;
    const changed: ChargebackRule = { ...rule, method };
    holdOrder();
    writeRule(
      changed,
      ruleList.map((r) => (r.id === rule.id ? changed : r)),
    );
    say(`Shared costs now split ${method === "even" ? "evenly" : "by usage"}.`);
  };
  const counter = React.useRef(0);
  const assign = (cost: ChargebackCost, teamId: string) => {
    if (disabled || !teamId) return;
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    counter.current += 1;
    const rule: ChargebackRule = {
      id: `${idBase}-r${counter.current}`,
      kind: "tag",
      key: "resource",
      value: cost.label,
      team: teamId,
      enabled: true,
    };
    holdOrder();
    writeRule(rule, [...ruleList, rule]);
    onAllocate?.(cost.id, teamId);
    say(`${cost.label}, ${fmt(cost.amount)}, assigned to ${team.name}.`);
  };

  const [exported, setExported] = React.useState(false);
  const exportTimer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(exportTimer.current), []);
  const doExport = () => {
    if (!ready || empty) return;
    const lines = [
      ["team", "owner", "amount", "share", "previous", "change"].join(","),
      ...alloc.rows.map((r) =>
        [
          csvCell(r.team.name),
          csvCell(r.team.owner),
          r.amount.toFixed(2),
          (r.share * 100).toFixed(1),
          r.previous.toFixed(2),
          r.change === null ? "" : (r.change * 100).toFixed(1),
        ].join(","),
      ),
      [
        "Unallocated",
        "",
        alloc.unallocatedAmount.toFixed(2),
        (unallocShare * 100).toFixed(1),
        "",
        "",
      ].join(","),
    ];
    onExport?.(lines.join("\n"), alloc.rows);
    setExported(true);
    window.clearTimeout(exportTimer.current);
    exportTimer.current = window.setTimeout(() => setExported(false), 1600);
    say(`Exported ${monthMeta?.long ?? "the month"} as CSV.`);
  };

  /* ------------------------------- tabs --------------------------------- */

  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = months.findIndex((m) => m.id === monthId);
    let j = i;
    if (event.key === "ArrowRight") j = (i + 1) % months.length;
    else if (event.key === "ArrowLeft")
      j = (i - 1 + months.length) % months.length;
    else if (event.key === "Home") j = 0;
    else if (event.key === "End") j = months.length - 1;
    else return;
    event.preventDefault();
    const m = months[j];
    if (!m) return;
    chooseMonth(m.id);
    tabRefs.current.get(m.id)?.focus();
  };

  /* -------------------------------- render ------------------------------ */

  const showRows = phase === "split" && ready && !empty;
  const segId = (teamId: string) => `${uid}-seg-${teamId}`;
  const stagger = cascade(alloc.rows.length);
  const totalLabel = `${monthMeta?.long ?? ""} total`;
  const totalChange =
    alloc.previousTotal > 0
      ? (alloc.total - alloc.previousTotal) / alloc.previousTotal
      : null;

  const segment = (r: ChargebackRow, i: number, where: "bar" | "row") => (
    <motion.span
      key={`${where}-${r.team.id}`}
      layoutId={motionSafe ? segId(r.team.id) : undefined}
      layout={motionSafe}
      layoutDependency={`${phase}:${r.amount}:${where}`}
      aria-hidden
      className={cn(
        "block h-full",
        barSurface(barStyle),
        where === "row" ? "absolute inset-y-0 left-0" : "",
      )}
      style={{
        ["--tc-c" as string]: colour(r.team.id),
        borderRadius: 3,
        ...(where === "bar"
          ? { flex: `${Math.max(0.0001, r.share)} 1 0px` }
          : { width: `${r3((r.amount / max) * 100)}%` }),
      }}
      transition={
        motionSafe
          ? {
              layout: {
                ...springs.glide,
                delay:
                  where === "row"
                    ? i * stagger
                    : (alloc.rows.length - 1 - i) * stagger * 0.6,
              },
            }
          : { duration: 0 }
      }
    />
  );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs transition-colors",
    FOCUS_RING,
  );

  const totalBar = (
    <button
      type="button"
      aria-expanded={isSplit}
      aria-controls={listId}
      aria-describedby={hintId}
      onClick={toggleSplit}
      aria-disabled={disabled || !ready || empty || undefined}
      className={cn(
        "group/team-chargeback-total w-full rounded-3 border border-hairline bg-surface-1 px-3.5 py-3 text-left transition-colors",
        !disabled &&
          ready &&
          !empty &&
          "hover:border-hairline-strong hover:bg-surface-2/60",
        (disabled || !ready || empty) && "cursor-default",
        FOCUS_RING,
      )}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[12px] text-ink-2">{totalLabel}</span>
        <span className="flex items-baseline gap-2">
          {ready && !empty ? <Trend change={totalChange} /> : null}
          <span className="font-mono text-[17px] font-medium tabular-nums">
            {ready ? (empty ? fmt(0) : fmt(alloc.total)) : "—"}
          </span>
        </span>
      </span>
      <span className="relative mt-2.5 block" style={{ height: dens.bar + 10 }}>
        <span
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-[5px]",
            empty || status === "error"
              ? "border border-dashed border-hairline-strong"
              : "bg-surface-2",
            status === "loading" && "motion-safe:animate-pulse",
          )}
        />
        {ready && !empty ? (
          <span
            className="absolute inset-[3px] flex"
            style={{ gap: phase === "joined" ? 0 : 3 }}
          >
            {phase !== "split" ? (
              alloc.rows.map((r, i) => segment(r, i, "bar"))
            ) : (
              <motion.span
                key="allocated"
                aria-hidden
                className="flex flex-1 items-center pl-1 font-mono text-[10px] text-ink-3 tabular-nums"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  duration: durations.base,
                  delay: motionSafe ? 0.25 : 0,
                }}
              >
                <span className="truncate">
                  {fmt(alloc.total - alloc.unallocatedAmount)} allocated below
                </span>
              </motion.span>
            )}
            {alloc.unallocatedAmount > 0 ? (
              <span
                aria-hidden
                className="block h-full shrink-0 rounded-[3px] border border-hairline-strong"
                style={{
                  width: `${r3(unallocShare * 100)}%`,
                  backgroundImage: HATCH,
                }}
              />
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px]">
        <span className="text-ink-3">
          {status === "loading"
            ? "Loading costs"
            : status === "error"
              ? "Costs did not load"
              : empty
                ? `No costs recorded for ${monthMeta?.long ?? "this month"} yet`
                : isSplit
                  ? "Press to fold the teams back"
                  : "Press to split by team"}
        </span>
        {ready && !empty && alloc.unallocatedAmount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-ink-2 tabular-nums">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-[2px] border border-hairline-strong"
              style={{ backgroundImage: HATCH }}
            />
            {fmt(alloc.unallocatedAmount)} unallocated ·{" "}
            {Math.round(unallocShare * 1000) / 10}%
          </span>
        ) : null}
      </span>
    </button>
  );

  const legend = (
    <motion.div
      key="legend"
      className="flex flex-col gap-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base }}
    >
      <ul
        aria-label="Teams in the total"
        className="flex flex-wrap gap-x-4 gap-y-1.5 px-1"
      >
        {alloc.rows.map((r) => (
          <li
            key={r.team.id}
            className="inline-flex items-center gap-1.5 text-[12px]"
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colour(r.team.id) }}
            />
            <span className="text-foreground">{r.team.name}</span>
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {Math.round(r.share * 100)}%
            </span>
          </li>
        ))}
      </ul>
      {history.length > 1 ? (
        <div className="rounded-3 border border-hairline px-3.5 py-3">
          <p className="mb-2.5 text-[11px] font-medium text-ink-2">
            Month by month
          </p>
          <ul className="flex flex-col gap-2">
            {history.map((h) => {
              const on = h.id === monthId;
              return (
                <li
                  key={h.id}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3"
                >
                  <span
                    className={cn(
                      "text-[12px]",
                      on ? "font-medium text-foreground" : "text-ink-3",
                    )}
                  >
                    {h.label}
                  </span>
                  <span
                    aria-hidden
                    className="flex h-2 gap-px"
                    style={{ width: `${r3((h.total / historyMax) * 100)}%` }}
                  >
                    {h.rows.map((r) => (
                      <span
                        key={r.team.id}
                        className={cn(
                          "h-full rounded-[2px]",
                          on ? "opacity-100" : "opacity-55",
                        )}
                        style={{
                          flex: `${Math.max(0.0001, r.amount)} 1 0px`,
                          backgroundColor: colour(r.team.id),
                        }}
                      />
                    ))}
                    {h.unallocated > 0 ? (
                      <span
                        className="h-full rounded-[2px] border border-hairline-strong"
                        style={{
                          flex: `${h.unallocated} 1 0px`,
                          backgroundImage: HATCH,
                        }}
                      />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[11px] tabular-nums",
                      on ? "text-foreground" : "text-ink-3",
                    )}
                  >
                    {fmt(h.total)}
                    <span className="sr-only">
                      {` in ${h.long}${h.unallocated > 0 ? `, ${fmt(h.unallocated)} unallocated` : ""}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </motion.div>
  );

  const ruleText = (r: ChargebackRule) =>
    r.kind === "tag"
      ? `${r.key} = ${r.value}`
      : `${r.key} = ${r.value} · shared`;

  const rowBody = (r: ChargebackRow) => {
    const top = Math.max(1, ...r.services.map((s) => s.amount));
    // In rule order, on or off, so switching one never reshuffles the list.
    const own = ruleList.filter(
      (x) =>
        (x.kind === "tag" && x.team === r.team.id) ||
        (x.kind === "split" && (r.rules.includes(x.id) || !x.enabled)),
    );
    return (
      <div className="grid gap-4 pt-1 pr-1 pb-3 pl-7 @min-[34rem]:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-2">
            By service
          </p>
          <ul className="flex flex-col gap-1.5">
            {r.services.map((s) => (
              <li
                key={s.service}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 text-[12px]"
              >
                <span className="truncate text-ink-2">{s.service}</span>
                <span className="relative h-1.5 rounded-full bg-surface-2">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${r3((s.amount / top) * 100)}%`,
                      backgroundColor: colour(r.team.id),
                    }}
                  />
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {fmt(s.amount)}
                </span>
              </li>
            ))}
            {r.services.length === 0 ? (
              <li className="text-[12px] text-ink-3">
                Nothing charged this month.
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-ink-2">Rules</p>
          <ul className="flex flex-col gap-1.5">
            {own.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5"
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.enabled}
                  aria-label={`Rule ${ruleText(rule)}`}
                  aria-disabled={disabled || undefined}
                  onClick={() => switchRule(rule)}
                  className={cn(
                    "relative inline-flex h-5 w-8 shrink-0 items-center rounded-full border transition-colors",
                    rule.enabled
                      ? "border-transparent bg-(--tc-c)"
                      : "border-hairline-strong bg-surface-2",
                    FOCUS_RING,
                  )}
                  style={{ ["--tc-c" as string]: colour(r.team.id) }}
                >
                  <motion.span
                    aria-hidden
                    className="absolute top-[2px] left-[2px] size-3.5 rounded-full bg-card shadow-sm"
                    animate={{ x: rule.enabled ? 12 : 0 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                </button>
                <code className="truncate font-mono text-[11px] text-foreground">
                  {ruleText(rule)}
                </code>
                {rule.kind === "split" ? (
                  <span
                    role="radiogroup"
                    aria-label="Split shared costs"
                    className="inline-flex rounded-full border border-hairline p-0.5"
                    onKeyDown={(e) => {
                      if (
                        [
                          "ArrowLeft",
                          "ArrowRight",
                          "ArrowUp",
                          "ArrowDown",
                        ].includes(e.key)
                      ) {
                        e.preventDefault();
                        methodRule(
                          rule,
                          rule.method === "usage" ? "even" : "usage",
                        );
                        const next =
                          e.currentTarget.querySelector<HTMLButtonElement>(
                            `[data-tc-method="${rule.method === "usage" ? "even" : "usage"}"]`,
                          );
                        next?.focus();
                      }
                    }}
                  >
                    {(["usage", "even"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        data-tc-method={m}
                        aria-checked={rule.method === m}
                        tabIndex={rule.method === m ? 0 : -1}
                        onClick={() => methodRule(rule, m)}
                        className={cn(
                          "h-5 rounded-full px-2 text-[11px] transition-colors",
                          rule.method === m
                            ? "bg-surface-2 text-foreground"
                            : "text-ink-3 hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        {m === "usage" ? "By usage" : "Evenly"}
                      </button>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const unallocBody = (
    <div className="pt-1 pr-1 pb-3 pl-7">
      <ul className="flex flex-col gap-1.5">
        {alloc.unallocated.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]"
          >
            <code className="min-w-0 flex-1 basis-28 truncate font-mono text-[11px]">
              {c.label}
              <span className="ml-1.5 font-sans text-ink-3">{c.service}</span>
            </code>
            <span className="font-mono text-[11px] tabular-nums">
              {fmt(c.amount)}
            </span>
            <label className="sr-only" htmlFor={`${uid}-assign-${c.id}`}>
              Assign {c.label} to a team
            </label>
            <select
              id={`${uid}-assign-${c.id}`}
              value=""
              disabled={disabled}
              onChange={(e) => {
                const value = e.currentTarget.value;
                assign(c, value);
              }}
              className={cn(
                "h-7 rounded-2 border border-hairline bg-card px-2 text-[11px] text-ink-2",
                FOCUS_RING,
              )}
            >
              <option value="">Assign to…</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );

  const rowHeader = (
    key: string,
    content: React.ReactNode,
    label: string,
    bodyId: string,
  ) => (
    <button
      ref={(node) => {
        if (node) rowButtons.current.set(key, node);
        else rowButtons.current.delete(key);
      }}
      type="button"
      aria-expanded={open.has(key)}
      aria-controls={bodyId}
      aria-label={label}
      tabIndex={active === key ? 0 : -1}
      onFocus={() => setActiveKey(key)}
      onKeyDown={(e) => onRowKey(e, key)}
      onClick={() =>
        toggleRow(
          key,
          key === "unallocated"
            ? "Unallocated"
            : (alloc.rows.find((r) => r.team.id === key)?.team.name ?? key),
        )
      }
      className={cn(
        "grid w-full items-center gap-x-3 rounded-2 px-1 text-left transition-colors hover:bg-surface-1",
        // A phone puts the share under the name; from 34rem it is a column.
        "grid-cols-[1rem_minmax(0,1fr)_auto] gap-y-1.5 @min-[34rem]:grid-cols-[1.25rem_minmax(0,1.15fr)_minmax(0,2fr)_5.5rem_3.75rem]",
        "[&>*:nth-child(3)]:col-start-2 [&>*:nth-child(3)]:row-start-2 [&>*:nth-child(4)]:col-start-3 [&>*:nth-child(4)]:row-start-1",
        "@min-[34rem]:[&>*:nth-child(3)]:col-start-auto @min-[34rem]:[&>*:nth-child(3)]:row-start-auto @min-[34rem]:[&>*:nth-child(4)]:col-start-auto @min-[34rem]:[&>*:nth-child(4)]:row-start-auto",
        dens.row,
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
    >
      {content}
    </button>
  );

  const list = (
    <ol
      id={listId}
      aria-label={`${monthMeta?.long ?? ""} cost by team`}
      className="flex flex-col"
    >
      {ranked.map((r, i) => {
        const bodyId = `${uid}-body-${r.team.id}`;
        const pct = Math.round(r.share * 1000) / 10;
        return (
          <motion.li
            key={r.team.id}
            className="group/team-chargeback-row border-b border-hairline last:border-b-0"
            initial={
              motionSafe ? { opacity: 0, y: -distances.step } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? {
                    y: { ...springs.glide, delay: i * stagger },
                    opacity: {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: i * stagger,
                    },
                  }
                : { duration: durations.base }
            }
          >
            {rowHeader(
              r.team.id,
              <>
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  {i + 1}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colour(r.team.id) }}
                    />
                    <span className="truncate text-[13px] font-medium">
                      {r.team.name}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0 text-ink-3 transition-transform duration-200",
                        open.has(r.team.id) && "rotate-180",
                      )}
                    />
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
                    <span
                      aria-hidden
                      className="hidden size-4 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[8px] font-medium text-ink-2 @min-[34rem]:inline-flex"
                    >
                      {initials(r.team.owner)}
                    </span>
                    <span className="truncate">
                      {r.team.owner}
                      {density === "roomy" && r.team.role
                        ? ` · ${r.team.role}`
                        : ""}
                    </span>
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-10 shrink-0 font-mono text-[11px] tabular-nums @min-[34rem]:hidden">
                    {pct}%
                  </span>
                  <span
                    className="relative block min-w-0 flex-1 rounded-full bg-surface-2"
                    style={{ height: dens.bar }}
                  >
                    {segment(r, i, "row")}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-0.5 @min-[34rem]:items-end">
                  <span className="font-mono text-[12px] tabular-nums">
                    {fmt(r.amount)}
                  </span>
                  <span className="@min-[34rem]:hidden">
                    <Trend change={r.change} />
                  </span>
                  <span className="hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[34rem]:block">
                    {pct}%
                  </span>
                </span>
                <span className="hidden flex-col items-end gap-0.5 @min-[34rem]:flex">
                  <Trend change={r.change} />
                </span>
              </>,
              `${i + 1}. ${r.team.name}, ${fmt(r.amount)}, ${pct}% of the total, ${trendWords(r.change)}. Owner ${r.team.owner}.`,
              bodyId,
            )}
            <Reveal
              open={open.has(r.team.id)}
              motionSafe={motionSafe}
              id={bodyId}
            >
              {rowBody(r)}
            </Reveal>
          </motion.li>
        );
      })}
      {alloc.unallocated.length ? (
        <motion.li
          key="unallocated"
          className="group/team-chargeback-row"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{
            duration: durations.base,
            delay: motionSafe ? alloc.rows.length * stagger : 0,
          }}
        >
          {rowHeader(
            "unallocated",
            <>
              <span aria-hidden className="text-[11px] text-ink-3">
                –
              </span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px] border border-hairline-strong"
                  style={{ backgroundImage: HATCH }}
                />
                <span className="truncate text-[13px] font-medium text-ink-2">
                  Unallocated
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 text-ink-3 transition-transform duration-200",
                    open.has("unallocated") && "rotate-180",
                  )}
                />
              </span>
              <span className="text-[11px] text-ink-3">
                {alloc.unallocated.length}{" "}
                {alloc.unallocated.length === 1 ? "item" : "items"}
              </span>
              <span className="flex flex-col items-end">
                <span className="font-mono text-[12px] text-ink-2 tabular-nums">
                  {fmt(alloc.unallocatedAmount)}
                </span>
              </span>
              <span className="hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[34rem]:block @min-[34rem]:text-right">
                {Math.round(unallocShare * 1000) / 10}%
              </span>
            </>,
            `Unallocated, ${fmt(alloc.unallocatedAmount)} in ${alloc.unallocated.length} ${alloc.unallocated.length === 1 ? "item" : "items"}. Open to assign them.`,
            `${uid}-body-unallocated`,
          )}
          <Reveal
            open={open.has("unallocated")}
            motionSafe={motionSafe}
            id={`${uid}-body-unallocated`}
          >
            {unallocBody}
          </Reveal>
        </motion.li>
      ) : null}
    </ol>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container grid w-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-36">
          <p id={titleId} className="truncate text-sm font-semibold">
            {account} · cost by team
          </p>
          <p className="truncate text-[11px] text-ink-3">
            Chargeback for {monthMeta?.long ?? ""} · {teams.length} teams
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            role="tablist"
            aria-label="Month"
            className="inline-flex rounded-2 border border-hairline bg-surface-1 p-0.5"
          >
            {months.map((m) => {
              const on = m.id === monthId;
              return (
                <button
                  key={m.id}
                  ref={(node) => {
                    if (node) tabRefs.current.set(m.id, node);
                    else tabRefs.current.delete(m.id);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={m.long}
                  tabIndex={on ? 0 : -1}
                  onKeyDown={onTabKey}
                  onClick={() => chooseMonth(m.id)}
                  className={cn(
                    "relative h-7 rounded-[6px] px-2 text-[12px] transition-colors",
                    on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  {on ? (
                    <motion.span
                      layoutId={motionSafe ? `${uid}-tab` : undefined}
                      aria-hidden
                      className="absolute inset-0 rounded-[6px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent)]"
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  ) : null}
                  <span className="relative">{m.label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={doExport}
            aria-label={
              exported ? "Exported" : `Export ${monthMeta?.long ?? ""} as CSV`
            }
            aria-disabled={!ready || empty || undefined}
            className={cn(
              button,
              "h-8 border border-hairline px-2 text-ink-2 hover:bg-surface-2 hover:text-foreground @min-[30rem]:px-3",
              (!ready || empty) && "cursor-not-allowed opacity-50",
            )}
          >
            <Download aria-hidden className="size-3.5" />
            <span className="hidden @min-[30rem]:inline">
              {exported ? "Exported" : "Export"}
            </span>
          </button>
        </div>
      </header>

      <motion.div
        layoutScroll
        className="[scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        <div className="flex flex-col gap-3 p-4">
          <p id={hintId} className="sr-only">
            Press the total to split it into a ranked list of teams. Arrow keys
            walk the rows; Enter opens one.
          </p>
          {status === "error" ? (
            <div className="flex flex-wrap items-center gap-3 rounded-3 border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))] px-3 py-2.5 text-[12px]">
              <TriangleAlert
                aria-hidden
                className="size-4 shrink-0 text-danger"
              />
              <p className="min-w-0 flex-1 basis-40 text-ink-2">
                Costs did not load for {monthMeta?.long ?? "this month"}.
              </p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(
                    button,
                    "border border-hairline text-foreground hover:bg-surface-2",
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Try again
                </button>
              ) : null}
            </div>
          ) : null}

          {totalBar}

          {status === "loading" ? (
            <div aria-busy="true" className="flex flex-col gap-2.5 pt-1">
              <p className="sr-only">Loading costs.</p>
              {[0.9, 0.7, 0.55, 0.4, 0.3].map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="h-2.5 w-20 rounded-full bg-surface-2" />
                  <span
                    className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                    style={{ width: `${w * 60}%` }}
                  />
                </div>
              ))}
            </div>
          ) : empty ? (
            <p className="rounded-3 border border-dashed border-hairline-strong px-3 py-3 text-[12px] text-ink-2">
              Nothing to split yet. Costs for {monthMeta?.long ?? "this month"}{" "}
              arrive after the first billing run.
            </p>
          ) : ready ? (
            <AnimatePresence mode="popLayout" initial={false}>
              {showRows ? (
                <motion.div
                  key="rows"
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                >
                  {list}
                </motion.div>
              ) : (
                legend
              )}
            </AnimatePresence>
          ) : null}
        </div>
      </motion.div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
