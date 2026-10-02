"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useIsPresent,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Banknote,
  Building2,
  ChartColumn,
  Check,
  ChevronRight,
  CircleCheckBig,
  CircleDashed,
  CircleDot,
  ClockAlert,
  CornerDownLeft,
  Download,
  FilePlus,
  FileText,
  Link,
  LoaderCircle,
  Monitor,
  Moon,
  Receipt,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sun,
  SunMoon,
  UserPlus,
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
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type CommandNesting = "slide" | "stack" | "flat";
export type CommandCenterStatus = "ready" | "loading" | "error";

export type CommandPreview = {
  /** The pane's heading. @default the command's label */
  title?: string;
  /** Label and value pairs, set as a short definition list: ["Amount", "$4,200.00"]. */
  meta?: [string, string][];
  /** A sentence or two under the facts. */
  body?: string;
};

export type CommandItem = {
  id: string;
  /** What the row says. Also what search matches first. */
  label: string;
  /** The section it lists under when nothing is typed. @default "Commands" */
  group?: string;
  /** 16px, in currentColor. */
  icon?: React.ReactNode;
  /** More words that find it: synonyms, ids, people. */
  keywords?: string[];
  /** Keys shown at the row's end, one chip each: ["G", "I"]. Display only. */
  shortcut?: string[];
  /** A quiet note at the row's end when it has no shortcut: "Customer", "Page". */
  hint?: string;
  /** What the preview pane shows while the row is highlighted. */
  preview?: CommandPreview;
  /** The field's placeholder on this command's own page. @default its label */
  placeholder?: string;
  /** A destructive command is drawn in the danger colour. @default "default" */
  tone?: "default" | "danger";
  /** Running it leaves the palette open with a check beside it, as a choice among its siblings. */
  keepOpen?: boolean;
  /** Shown as the current choice among `keepOpen` siblings. */
  checked?: boolean;
  /** Listed, but cannot be run. */
  disabled?: boolean;
  /** Sub-commands: choosing this opens them as a page of their own. */
  children?: CommandItem[];
};

export type CommandCenterProps = {
  /** The command tree. @default defaultCommands */
  commands?: CommandItem[];
  /** Controlled: the palette is open. */
  open?: boolean;
  /** Initial state when uncontrolled. Opening this way never takes focus. @default false */
  defaultOpen?: boolean;
  /** Fires from the shortcut, trigger, Escape, backdrop or run that opened or closed it. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled: ids of recently run commands, newest first. */
  recent?: string[];
  /** Initial recents when uncontrolled. @default defaultCommandRecent */
  defaultRecent?: string[];
  /** Fires with the new list whenever a run changes it. */
  onRecentChange?: (ids: string[]) => void;
  /** A command was run, with the pages it was reached through. */
  onRun?: (command: CommandItem, path: CommandItem[]) => void;
  /** How a command with sub-commands opens them: a page sliding in from the side, a sheet rising over its parent, or no pages at all (everything inline). @default "slide" */
  nesting?: CommandNesting;
  /** A pane beside the list that previews the highlighted command, where the frame is 640px or wider. @default true */
  preview?: boolean;
  /** Letters match in order anywhere (chst finds Change status) and light up; off, the query must appear as typed. @default true */
  fuzzy?: boolean;
  /** The field's placeholder on the first page. @default "Search or run a command…" */
  placeholder?: string;
  /** Cmd+K or Ctrl+K, pressed while focus is anywhere in the frame, opens and closes it. @default true */
  shortcut?: boolean;
  /** Show the search trigger along the top of the frame. @default true */
  trigger?: boolean;
  /** The trigger's text. @default "Search or run a command" */
  triggerLabel?: string;
  /** How many recents are kept. @default 5 */
  maxRecent?: number;
  /** The commands' state: still arriving (skeleton rows) or failed (a line with Retry). @default "ready" */
  status?: CommandCenterStatus;
  /** The error state's Retry button. */
  onRetry?: () => void;
  /** The palette's accessible name. @default "Command menu" */
  label?: string;
  /** The app behind the palette. @default a Basinworks invoices screen */
  children?: React.ReactNode;
  /** Ticks as the highlight moves, a swish as pages and the palette open and close. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

type Invoice = {
  id: string;
  number: string;
  customer: string;
  amount: string;
  status: "Draft" | "Sent" | "Paid" | "Overdue";
  due: string;
};

const INVOICES: Invoice[] = [
  {
    id: "inv-2041",
    number: "INV-2041",
    customer: "Fernworks",
    amount: "$4,200.00",
    status: "Overdue",
    due: "Due 28 Sep",
  },
  {
    id: "inv-2039",
    number: "INV-2039",
    customer: "Gaugeworks",
    amount: "$1,180.50",
    status: "Paid",
    due: "Paid 30 Sep",
  },
  {
    id: "inv-2036",
    number: "INV-2036",
    customer: "Coldbrook Bank",
    amount: "$12,940.00",
    status: "Sent",
    due: "Due 14 Oct",
  },
  {
    id: "inv-2033",
    number: "INV-2033",
    customer: "Waylight Pay",
    amount: "$860.00",
    status: "Draft",
    due: "Not sent",
  },
];

const CUSTOMERS = [
  { id: "fernworks", name: "Fernworks", open: "$4,200.00", invoices: 6 },
  { id: "gaugeworks", name: "Gaugeworks", open: "$0.00", invoices: 11 },
  { id: "coldbrook", name: "Coldbrook Bank", open: "$12,940.00", invoices: 3 },
  { id: "waylight", name: "Waylight Pay", open: "$860.00", invoices: 2 },
];

const PEOPLE = ["Juno Vale", "Ines Park", "Tomas Reyes"];

const STATUS_TONE: Record<Invoice["status"], string> = {
  Draft: "text-ink-2",
  Sent: "text-cobalt-bright",
  Paid: "text-success",
  Overdue: "text-warn",
};

const icon = (node: React.ReactNode) => node;

export const defaultCommands: CommandItem[] = [
  {
    id: "go-invoices",
    label: "Invoices",
    group: "Go to",
    icon: icon(<FileText className="size-4" />),
    shortcut: ["G", "I"],
    keywords: ["billing", "bills"],
    preview: {
      title: "Invoices",
      meta: [
        ["Open", "3 invoices"],
        ["Outstanding", "$18,000.00"],
      ],
      body: "Every invoice, newest first, with the overdue ones pinned to the top.",
    },
  },
  {
    id: "go-customers",
    label: "Customers",
    group: "Go to",
    icon: icon(<Users className="size-4" />),
    shortcut: ["G", "C"],
    keywords: ["clients", "accounts"],
    preview: {
      title: "Customers",
      meta: [["Active", "4 customers"]],
      body: "Balances, contacts and payment terms for everyone you bill.",
    },
  },
  {
    id: "go-payouts",
    label: "Payouts",
    group: "Go to",
    icon: icon(<Banknote className="size-4" />),
    shortcut: ["G", "P"],
    keywords: ["transfers", "bank"],
    preview: {
      title: "Payouts",
      meta: [["Next payout", "Fri 3 Oct · $6,410.20"]],
      body: "Money on its way from Waylight Pay to the Coldbrook Bank account.",
    },
  },
  {
    id: "go-reports",
    label: "Reports",
    group: "Go to",
    icon: icon(<ChartColumn className="size-4" />),
    shortcut: ["G", "R"],
    keywords: ["revenue", "charts", "analytics"],
    preview: {
      title: "Reports",
      meta: [["September", "$48,230.00 billed"]],
      body: "Revenue, ageing and collection time by month.",
    },
  },
  {
    id: "create-invoice",
    label: "Create invoice…",
    group: "Actions",
    icon: icon(<FilePlus className="size-4" />),
    keywords: ["new", "bill", "add"],
    placeholder: "Who is it for?",
    children: CUSTOMERS.map((c) => ({
      id: `create-for-${c.id}`,
      label: c.name,
      icon: icon(<Building2 className="size-4" />),
      hint: "Customer",
      preview: {
        title: `New invoice for ${c.name}`,
        meta: [
          ["Open balance", c.open],
          ["Invoices so far", String(c.invoices)],
        ],
        body: "Starts a draft with their terms and last line items filled in.",
      },
    })),
  },
  {
    id: "change-status",
    label: "Change status…",
    group: "Actions",
    icon: icon(<CircleDot className="size-4" />),
    keywords: ["mark", "paid", "sent", "state"],
    placeholder: "Set INV-2041 to…",
    children: [
      {
        id: "status-draft",
        label: "Draft",
        icon: icon(<CircleDashed className="size-4" />),
        preview: {
          body: "Back to an editable draft. The customer's link stops working.",
        },
      },
      {
        id: "status-sent",
        label: "Sent",
        icon: icon(<Send className="size-4" />),
        preview: { body: "Marks it sent without emailing it again." },
      },
      {
        id: "status-paid",
        label: "Paid",
        icon: icon(<CircleCheckBig className="size-4" />),
        keywords: ["settled", "received"],
        preview: {
          meta: [["Amount", "$4,200.00"]],
          body: "Records a payment in full today and closes the invoice.",
        },
      },
      {
        id: "status-overdue",
        label: "Overdue",
        icon: icon(<ClockAlert className="size-4" />),
        preview: {
          body: "Flags it and queues the first reminder for tomorrow 09:00.",
        },
      },
    ],
  },
  {
    id: "assign",
    label: "Assign to…",
    group: "Actions",
    icon: icon(<UserPlus className="size-4" />),
    keywords: ["owner", "person"],
    placeholder: "Assign INV-2041 to…",
    children: PEOPLE.map((name, i) => ({
      id: `assign-${i}`,
      label: name,
      hint: i === 0 ? "You" : "Finance",
      preview: {
        title: name,
        meta: [["Open invoices", String(4 - i)]],
      },
    })),
  },
  {
    id: "copy-link",
    label: "Copy invoice link",
    group: "Actions",
    icon: icon(<Link className="size-4" />),
    shortcut: ["⌘", "L"],
    keywords: ["share", "url"],
    preview: {
      body: "basinworks.app/pay/inv-2041 — the page your customer pays from.",
    },
  },
  {
    id: "download-pdf",
    label: "Download PDF",
    group: "Actions",
    icon: icon(<Download className="size-4" />),
    keywords: ["export", "print"],
    preview: { body: "INV-2041.pdf, 2 pages, with your letterhead." },
  },
  {
    id: "archive",
    label: "Archive invoice",
    group: "Actions",
    icon: icon(<Archive className="size-4" />),
    tone: "danger",
    keywords: ["delete", "remove", "hide"],
    preview: {
      body: "Hides INV-2041 from every list. It can be restored from Archive for 30 days.",
    },
  },
  {
    id: "theme",
    label: "Theme…",
    group: "Preferences",
    icon: icon(<SunMoon className="size-4" />),
    keywords: ["dark", "light", "appearance", "mode"],
    placeholder: "Choose a theme…",
    children: [
      {
        id: "theme-light",
        label: "Light",
        icon: icon(<Sun className="size-4" />),
        keepOpen: true,
      },
      {
        id: "theme-dark",
        label: "Dark",
        icon: icon(<Moon className="size-4" />),
        keepOpen: true,
      },
      {
        id: "theme-system",
        label: "Match the system",
        icon: icon(<Monitor className="size-4" />),
        keepOpen: true,
        checked: true,
      },
    ],
  },
  {
    id: "settings",
    label: "Billing settings",
    group: "Preferences",
    icon: icon(<Settings className="size-4" />),
    keywords: ["tax", "terms", "currency"],
    preview: {
      meta: [
        ["Terms", "Net 14"],
        ["Currency", "USD"],
      ],
    },
  },
  ...INVOICES.map((inv): CommandItem => ({
    id: inv.id,
    label: `${inv.number} · ${inv.customer}`,
    group: "Invoices",
    icon: icon(<Receipt className="size-4" />),
    hint: inv.amount,
    keywords: [inv.status, inv.amount],
    preview: {
      title: inv.number,
      meta: [
        ["Customer", inv.customer],
        ["Amount", inv.amount],
        ["Status", inv.status],
        ["When", inv.due],
      ],
    },
  })),
];

export const defaultCommandRecent: string[] = ["inv-2041", "status-paid"];

/** The app behind the palette: Basinworks Billing's invoices. */
function InvoicesScreen() {
  return (
    <div className="flex flex-col gap-4 p-4 @min-[640px]:p-6">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold tracking-tight">Invoices</h2>
        <p className="text-[13px] text-ink-3">
          Basinworks Billing · 3 open · $18,000.00 outstanding
        </p>
      </div>
      <ul
        role="list"
        className="flex flex-col overflow-clip rounded-3 border border-hairline bg-card"
      >
        {INVOICES.map((inv, i) => (
          <li
            key={inv.id}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 text-[13px]",
              i > 0 && "border-t border-hairline",
            )}
          >
            <Receipt aria-hidden className="size-4 shrink-0 text-ink-3" />
            <span className="flex min-w-0 flex-1 flex-col @min-[640px]:flex-row @min-[640px]:items-center @min-[640px]:gap-3">
              <span className="font-mono text-xs text-ink-2 tabular-nums">
                {inv.number}
              </span>
              <span className="truncate">{inv.customer}</span>
            </span>
            <span className="hidden text-xs text-ink-3 @min-[640px]:block">
              {inv.due}
            </span>
            <span className="font-mono text-xs tabular-nums">{inv.amount}</span>
            <span
              className={cn(
                "w-14 shrink-0 text-right text-xs",
                STATUS_TONE[inv.status],
              )}
            >
              {inv.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------- matching -------------------------------- */

type Match = { score: number; hits: number[] };

const SEP = /[\s\-_/.›:#·]/;
const bare = (label: string) => label.replace(/…$/, "");

/**
 * Letters in order, anywhere, scored the way a reader scans: a letter that
 * starts a word is worth more, a run of letters more again, and gaps cost a
 * little. The best alignment wins (a small dynamic programme, never more than
 * a few thousand steps for a label), and its letters are the ones lit.
 */
function fuzzyMatch(text: string, query: string): Match | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, "").slice(0, 24);
  const n = t.length;
  const m = q.length;
  if (m === 0) return { score: 0, hits: [] };
  if (m > n) return null;
  let k = 0;
  for (let i = 0; i < n && k < m; i += 1) if (t[i] === q[k]) k += 1;
  if (k < m) return null;
  const NONE = -1e9;
  let prev: number[] = [];
  const back: number[][] = [];
  for (let j = 0; j < m; j += 1) {
    const cur = new Array<number>(n).fill(NONE);
    const from = new Array<number>(n).fill(-1);
    for (let i = j; i < n; i += 1) {
      if (t[i] !== q[j]) continue;
      const start = i === 0 || SEP.test(t[i - 1] ?? "");
      const bonus = (start ? 12 : 0) + (i === 0 ? 4 : 0);
      if (j === 0) {
        cur[i] = 10 + bonus - Math.min(i, 10) * 0.6;
        continue;
      }
      for (let p = j - 1; p < i; p += 1) {
        const base = prev[p] ?? NONE;
        if (base <= NONE) continue;
        const s =
          base + 10 + bonus + (p === i - 1 ? 9 : -Math.min(i - p - 1, 8) * 0.7);
        if (s > (cur[i] ?? NONE)) {
          cur[i] = s;
          from[i] = p;
        }
      }
    }
    back.push(from);
    prev = cur;
  }
  let best = NONE;
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    const s = prev[i] ?? NONE;
    if (s > best) {
      best = s;
      at = i;
    }
  }
  if (at < 0) return null;
  const hits: number[] = [];
  for (let j = m - 1; j >= 0; j -= 1) {
    if (at < 0) return null;
    hits.unshift(at);
    at = back[j]?.[at] ?? -1;
  }
  return { score: best - (n - m) * 0.05, hits };
}

/** The query as written (case aside), preferring a hit that starts a word. */
function exactMatch(text: string, query: string): Match | null {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return { score: 0, hits: [] };
  const first = t.indexOf(q);
  if (first === -1) return null;
  let at = first;
  for (let i = first; i !== -1; i = t.indexOf(q, i + 1)) {
    if (i === 0 || SEP.test(t[i - 1] ?? "")) {
      at = i;
      break;
    }
  }
  const start = at === 0 || SEP.test(t[at - 1] ?? "");
  return {
    score: 100 + (start ? 20 : 0) + (at === 0 ? 10 : 0) - at * 0.5,
    hits: Array.from({ length: q.length }, (_, i) => at + i),
  };
}

type Found = {
  score: number;
  hits: number[];
  /** Lit letters in the path shown before the label. */
  pathHits: number[];
  via?: string;
};

/** The path as a row shows it before the label: "Change status › ". */
const trailOf = (path: CommandItem[]) =>
  path.map((p) => `${bare(p.label)} › `).join("");

function matchItem(
  item: CommandItem,
  path: CommandItem[],
  query: string,
  fuzzy: boolean,
): Found | null {
  const fn = fuzzy ? fuzzyMatch : exactMatch;
  let best: Found | null = null;
  const own = fn(bare(item.label), query);
  if (own) best = { score: own.score + 4, hits: own.hits, pathHits: [] };
  if (path.length) {
    const prefix = trailOf(path);
    const r = fn(prefix + bare(item.label), query);
    if (r && (!best || r.score > best.score)) {
      best = {
        score: r.score,
        hits: r.hits
          .filter((h) => h >= prefix.length)
          .map((h) => h - prefix.length),
        pathHits: r.hits.filter((h) => h < prefix.length),
      };
    }
  }
  for (const word of item.keywords ?? []) {
    const r = fn(word, query);
    if (r && (!best || r.score * 0.8 > best.score)) {
      best = { score: r.score * 0.8, hits: [], pathHits: [], via: word };
    }
  }
  return best;
}

/* --------------------------------- model --------------------------------- */

type Entry = { item: CommandItem; path: CommandItem[] };

type Row = {
  key: string;
  item: CommandItem;
  /** Every page above it, from the top of the tree. */
  path: CommandItem[];
  /** The part of the path below the page it is listed on: shown before the label. */
  rel: CommandItem[];
  hits: number[];
  pathHits: number[];
  via?: string;
};

type Section = { id: string; heading?: string; rows: Row[] };

function indexTree(items: CommandItem[]): Map<string, Entry> {
  const map = new Map<string, Entry>();
  const walk = (list: CommandItem[], path: CommandItem[]) => {
    for (const item of list) {
      map.set(item.id, { item, path });
      if (item.children?.length) walk(item.children, [...path, item]);
    }
  };
  walk(items, []);
  return map;
}

function descendants(items: CommandItem[], path: CommandItem[]): Entry[] {
  const out: Entry[] = [];
  for (const item of items) {
    out.push({ item, path });
    if (item.children?.length) {
      out.push(...descendants(item.children, [...path, item]));
    }
  }
  return out;
}

function buildSections({
  items,
  base,
  query,
  fuzzy,
  flat,
  recent,
  layer,
}: {
  items: CommandItem[];
  base: CommandItem[];
  query: string;
  fuzzy: boolean;
  flat: boolean;
  recent: Entry[];
  layer: string;
}): Section[] {
  const q = query.trim();
  if (q) {
    const found: (Row & { score: number; order: number })[] = [];
    descendants(items, base).forEach(({ item, path }, order) => {
      // Without pages a command that only holds others is not a result.
      if (flat && item.children?.length) return;
      const rel = path.slice(base.length);
      const m = matchItem(item, rel, q, fuzzy);
      if (!m) return;
      found.push({
        key: `${layer}/r/${item.id}`,
        item,
        path,
        rel,
        hits: m.hits,
        pathHits: m.pathHits,
        via: m.via,
        score: m.score,
        order,
      });
    });
    found.sort((a, b) => b.score - a.score || a.order - b.order);
    return [
      { id: "results", heading: "Best matches", rows: found.slice(0, 30) },
    ];
  }
  const sections: Section[] = [];
  if (recent.length) {
    sections.push({
      id: "recent",
      heading: "Recent",
      rows: recent.map(({ item, path }) => ({
        key: `${layer}/recent/${item.id}`,
        item,
        path,
        rel: path,
        hits: [],
        pathHits: [],
      })),
    });
  }
  const groups = new Map<string, Section>();
  const add = (heading: string, row: Row) => {
    let section = groups.get(heading);
    if (!section) {
      section = {
        id: `g-${heading || "page"}`,
        heading: heading || undefined,
        rows: [],
      };
      groups.set(heading, section);
      sections.push(section);
    }
    section.rows.push(row);
  };
  for (const item of items) {
    // On a page of its own, the chip in the field already names the page.
    const heading = item.group ?? (base.length ? "" : "Commands");
    if (flat && item.children?.length) {
      for (const child of item.children) {
        add(bare(item.label), {
          key: `${layer}/${child.id}`,
          item: child,
          path: [...base, item],
          rel: [],
          hits: [],
          pathHits: [],
        });
      }
      continue;
    }
    add(heading, {
      key: `${layer}/${item.id}`,
      item,
      path: base,
      rel: [],
      hits: [],
      pathHits: [],
    });
  }
  return sections;
}

/* ---------------------------------- view ---------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** The list's ceiling, px: about seven rows, then it scrolls. */
const MAX_LIST = 296;
const ROW = 40;

const r2 = (v: number) => Math.round(v * 100) / 100;

const noop = () => () => {};
const isMac = () =>
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

function Lit({ text, hits }: { text: string; hits: number[] }) {
  if (hits.length === 0) return <>{text}</>;
  const lit = new Set(hits);
  const parts: { s: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const on = lit.has(i);
    const last = parts[parts.length - 1];
    if (last && last.on === on) last.s += text[i];
    else parts.push({ s: text[i] ?? "", on });
  }
  return (
    <>
      {parts.map((p, i) =>
        p.on ? (
          <mark
            key={i}
            className="bg-transparent font-semibold text-cobalt-bright"
          >
            {p.s}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.s}</React.Fragment>
        ),
      )}
    </>
  );
}

/** A command with no icon of its own (a person, a plain choice) shows its initial. */
function Glyph({
  item,
  small = false,
}: {
  item: CommandItem;
  small?: boolean;
}) {
  if (item.icon) return <>{item.icon}</>;
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-surface-2 font-medium text-ink-2",
        small ? "size-3.5 text-[8px]" : "size-4 text-[9px]",
      )}
    >
      {bare(item.label).charAt(0).toUpperCase()}
    </span>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center gap-1">
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-1 border border-hairline bg-surface-1 px-1 font-mono text-[10px] text-ink-3"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

type PageProps = {
  layerKey: string;
  top: boolean;
  sections: Section[];
  rows: Row[];
  activeKey: string | null;
  checkedOf: (row: Row) => boolean;
  flash: string | null;
  uid: string;
  listId: string;
  label: string;
  motionSafe: boolean;
  status: CommandCenterStatus;
  query: string;
  onRetry?: () => void;
  onHeight: (h: number) => void;
  onHover: (key: string) => void;
  onChoose: (row: Row) => void;
};

/**
 * One page of the palette: its sections, its rows, and the pill that marks
 * the highlighted row. The pill travels on snap when the highlight moves and
 * jumps when typing changes the list under it, so it never slides across
 * rows that are not there any more.
 */
function PageView({
  layerKey,
  top,
  sections,
  rows,
  activeKey,
  checkedOf,
  flash,
  uid,
  listId,
  label,
  motionSafe,
  status,
  query,
  onRetry,
  onHeight,
  onHover,
  onChoose,
}: PageProps) {
  const present = useIsPresent();
  // A page on its way out keeps its last props: it is never the listbox.
  const isTop = top && present;
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const pillY = useMotionValue(0);
  const pillOpacity = useMotionValue(0);
  const pillAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const shownSig = React.useRef<string | null>(null);
  const pointer = React.useRef({ x: -1, y: -1 });
  const live = React.useRef({ top, present, onHeight });
  React.useEffect(() => {
    live.current = { top, present, onHeight };
  });

  // Only the page on top, and not one on its way out, sizes the viewport.
  React.useEffect(() => {
    if (!inner) return;
    const report = () => {
      const now = live.current;
      if (now.top && now.present) now.onHeight(inner.offsetHeight);
    };
    const ro = new ResizeObserver(report);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [inner]);
  React.useEffect(() => {
    if (top && present && inner) onHeight(inner.offsetHeight);
    // A page that comes back to the top re-reports its own height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, present, inner]);

  const sig = rows.map((r) => r.key).join("|");
  const active = rows.find((r) => r.key === activeKey) ?? rows[0];
  const activeRowKey = active?.key ?? null;

  React.useLayoutEffect(() => {
    const node = activeRowKey ? rowNodes.current.get(activeRowKey) : undefined;
    pillAnim.current?.stop();
    if (!node) {
      pillOpacity.set(0);
      return;
    }
    const y = node.offsetTop;
    const changed = shownSig.current !== sig;
    shownSig.current = sig;
    if (changed || !motionSafe || pillOpacity.get() < 0.5) pillY.jump(y);
    else if (Math.abs(pillY.get() - y) > 0.5) {
      pillAnim.current = animate(pillY, y, springs.snap);
    }
    pillOpacity.set(1);
    // Keep it in view by scrolling this list only, never the page.
    const box = scrollRef.current;
    if (box) {
      const pad = 4;
      if (y < box.scrollTop + pad) box.scrollTop = Math.max(0, y - pad);
      else if (y + ROW > box.scrollTop + box.clientHeight - pad) {
        box.scrollTop = y + ROW - box.clientHeight + pad;
      }
    }
  }, [activeRowKey, sig, motionSafe, pillY, pillOpacity]);

  React.useEffect(() => () => pillAnim.current?.stop(), []);

  const optionId = (key: string) => `${uid}-opt-${key.replace(/[^\w-]/g, "_")}`;

  return (
    <div
      ref={scrollRef}
      inert={!isTop || undefined}
      aria-hidden={!isTop || undefined}
      className="[scrollbar-width:thin] overflow-y-auto overscroll-contain bg-popover"
      style={{ maxHeight: MAX_LIST }}
    >
      <div
        ref={setInner}
        id={isTop ? listId : undefined}
        role={isTop ? "listbox" : undefined}
        aria-label={isTop ? label : undefined}
        aria-busy={isTop && status === "loading" ? true : undefined}
        className="relative px-1.5 py-1.5"
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-x-1.5 top-0 overflow-clip rounded-2",
            active?.item.tone === "danger" ? "bg-danger/12" : "bg-cobalt-wash",
          )}
          style={{ y: pillY, height: ROW, opacity: pillOpacity }}
        >
          {/* A run flicks the pill bright before the palette goes. */}
          <motion.span
            className="absolute inset-0 bg-cobalt-bright/25"
            initial={false}
            animate={{ opacity: flash && flash === activeRowKey ? 1 : 0 }}
            transition={{ duration: durations.blink, ease: easings.enter }}
          />
        </motion.span>
        {status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex h-10 items-center gap-3 px-3">
                <span
                  className={cn(
                    "size-4 rounded-1 bg-surface-2",
                    motionSafe && "animate-pulse",
                  )}
                />
                <span
                  className={cn(
                    "h-3 rounded-1 bg-surface-2",
                    motionSafe && "animate-pulse",
                  )}
                  style={{ width: `${40 + ((i * 23) % 40)}%` }}
                />
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-start gap-2 px-3 py-4">
            <p className="text-[13px] font-medium">Commands did not load</p>
            <p className="text-xs text-ink-3">
              The list could not be fetched. Recent commands still work once it
              is back.
            </p>
            <button
              type="button"
              onClick={() => onRetry?.()}
              className={cn(
                "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
            <p className="text-[13px] text-ink-2">
              No commands match “{query.trim()}”.
            </p>
            <p className="text-xs text-ink-3">
              Try fewer letters, or Backspace to go back.
            </p>
          </div>
        ) : (
          sections.map((section) => {
            const headingId = `${uid}-${layerKey.replace(/[^\w-]/g, "_")}-${section.id.replace(/[^\w-]/g, "_")}`;
            return (
              <div
                key={section.id}
                role={isTop && section.heading ? "group" : undefined}
                aria-labelledby={
                  isTop && section.heading ? headingId : undefined
                }
              >
                {section.heading ? (
                  <div
                    id={headingId}
                    className="px-3 pt-2 pb-1 text-[11px] font-medium text-ink-3"
                  >
                    {section.heading}
                  </div>
                ) : null}
                {section.rows.map((row) => {
                  const on = row.key === activeRowKey;
                  const kids = row.item.children?.length ?? 0;
                  const checked = checkedOf(row);
                  const name =
                    (row.rel.length
                      ? `${row.rel.map((p) => bare(p.label)).join(", ")}, `
                      : "") +
                    bare(row.item.label) +
                    (kids
                      ? `, ${kids} ${kids === 1 ? "choice" : "choices"}`
                      : "") +
                    (checked ? ", current" : "");
                  return (
                    <div
                      key={row.key}
                      ref={(node) => {
                        if (node) rowNodes.current.set(row.key, node);
                        else rowNodes.current.delete(row.key);
                      }}
                      id={isTop ? optionId(row.key) : undefined}
                      role={isTop ? "option" : undefined}
                      aria-selected={isTop ? on : undefined}
                      aria-disabled={
                        isTop && row.item.disabled ? true : undefined
                      }
                      aria-label={isTop ? name : undefined}
                      onPointerMove={(event) => {
                        const p = pointer.current;
                        // A list scrolling under a still pointer is not a
                        // hover: only a pointer that moved picks a row.
                        if (p.x === event.clientX && p.y === event.clientY) {
                          return;
                        }
                        pointer.current = {
                          x: event.clientX,
                          y: event.clientY,
                        };
                        if (!on) onHover(row.key);
                      }}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => onChoose(row)}
                      className={cn(
                        "relative z-10 flex h-10 cursor-pointer items-center gap-3 rounded-2 px-3 text-[13px] select-none",
                        row.item.tone === "danger"
                          ? "text-danger"
                          : on
                            ? "text-foreground"
                            : "text-ink-2",
                        row.item.disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center",
                          row.item.tone === "danger"
                            ? "text-danger"
                            : on
                              ? "text-cobalt-bright"
                              : "text-ink-3",
                        )}
                      >
                        <Glyph item={row.item} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {row.rel.length ? (
                          <span className="text-ink-3">
                            <Lit text={trailOf(row.rel)} hits={row.pathHits} />
                          </span>
                        ) : null}
                        <Lit text={row.item.label} hits={row.hits} />
                        {row.via ? (
                          <span className="ml-2 text-xs text-ink-3">
                            {row.via}
                          </span>
                        ) : null}
                      </span>
                      <AnimatePresence initial={false}>
                        {checked ? (
                          <motion.span
                            key="check"
                            aria-hidden
                            className="flex size-4 shrink-0 items-center justify-center text-cobalt-bright"
                            initial={
                              motionSafe
                                ? { opacity: 0, scale: 0.5 }
                                : { opacity: 0 }
                            }
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={{
                              scale: motionSafe
                                ? springs.snap
                                : { duration: 0 },
                              opacity: { duration: durations.fast },
                            }}
                          >
                            <Check className="size-4" />
                          </motion.span>
                        ) : null}
                      </AnimatePresence>
                      {kids ? (
                        <span
                          aria-hidden
                          className="flex shrink-0 items-center gap-1 text-xs text-ink-3"
                        >
                          {kids}
                          <ChevronRight className="size-3.5" />
                        </span>
                      ) : row.item.shortcut?.length ? (
                        <span className="hidden @min-[480px]:flex">
                          <Keys keys={row.item.shortcut} />
                        </span>
                      ) : row.item.hint ? (
                        <span
                          aria-hidden
                          className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
                        >
                          {row.item.hint}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PreviewPane({ row }: { row: Row | undefined }) {
  if (!row) return null;
  const { item } = row;
  const p = item.preview;
  const kids = item.children ?? [];
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-2 bg-surface-2",
            item.tone === "danger" ? "text-danger" : "text-cobalt-bright",
          )}
        >
          <Glyph item={item} />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {p?.title ?? bare(item.label)}
          </span>
          <span className="block truncate text-[11px] text-ink-3">
            {row.path.length
              ? row.path.map((x) => bare(x.label)).join(" › ")
              : (item.group ?? "Command")}
          </span>
        </span>
      </div>
      {p?.meta?.length ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
          {p.meta.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-ink-3">{k}</dt>
              <dd className="truncate text-right font-mono text-ink-2 tabular-nums">
                {v}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
      {p?.body ? (
        <p className="text-xs leading-5 text-ink-2">{p.body}</p>
      ) : null}
      {kids.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-ink-3">
            Opens {kids.length} {kids.length === 1 ? "choice" : "choices"}
          </p>
          <ul role="list" className="flex flex-col gap-1">
            {kids.slice(0, 5).map((k) => (
              <li
                key={k.id}
                className="flex items-center gap-2 text-xs text-ink-2"
              >
                <span
                  aria-hidden
                  className="flex size-3.5 items-center justify-center text-ink-3 [&>svg]:size-3.5"
                >
                  <Glyph item={k} small />
                </span>
                <span className="truncate">{bare(k.label)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {!p && !kids.length && item.shortcut?.length ? (
        <div className="flex items-center gap-2 text-xs text-ink-3">
          Shortcut <Keys keys={item.shortcut} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A command palette inside its frame. Cmd+K or Ctrl+K — while focus is in the
 * frame — opens it: the scrim fades in and the palette lands from 8px above
 * on snap, one crisp overshoot, and it leaves on the exit ease.
 *
 * Commands are a tree. Choosing one with sub-commands opens its page: with
 * `nesting="slide"` the page slides in from the right on glide while its
 * parent slides out left, a chip with the parent's name pops into the field
 * on snap and the list's measured height glides to the new page's; Backspace
 * in an empty field slides back. `stack` raises the page over its parent like
 * a sheet while the parent recedes; `flat` lists every sub-command inline.
 *
 * Typing matches letters in order anywhere (or the query as written, with
 * `fuzzy` off) across the whole tree, lights the matched letters and lists the
 * best first, each deep result with its path so it runs directly. With
 * nothing typed, Recent leads. A pane beside the list previews the
 * highlighted command from 640px. The field is a combobox over a listbox:
 * arrows move a pill on snap, Enter runs or opens, Tab and ArrowRight open,
 * Escape clears, then goes back, then closes. Under reduced motion every
 * change is a cross-fade and the height jumps.
 */
export function CommandCenter({
  commands = defaultCommands,
  open,
  defaultOpen = false,
  onOpenChange,
  recent,
  defaultRecent = defaultCommandRecent,
  onRecentChange,
  onRun,
  nesting = "slide",
  preview = true,
  fuzzy = true,
  placeholder = "Search or run a command…",
  shortcut = true,
  trigger = true,
  triggerLabel = "Search or run a command",
  maxRecent = 5,
  status = "ready",
  onRetry,
  label = "Command menu",
  children,
  sound = false,
  className,
}: CommandCenterProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const listId = `${uid}-list`;
  const flat = nesting === "flat";
  const mac = React.useSyncExternalStore(noop, isMac, () => true);

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [stack, setStack] = React.useState<string[]>([]);
  const [query, setQuery] = React.useState("");
  const [activeKey, setActiveKey] = React.useState<string | null>(null);
  const [dir, setDir] = React.useState(1);
  const [ownRecent, setOwnRecent] = React.useState(defaultRecent);
  const recentIds = recent ?? ownRecent;
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const [flash, setFlash] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [focusAsk, setFocusAsk] = React.useState(0);

  const index = React.useMemo(() => indexTree(commands), [commands]);

  // A palette the host closes forgets where it was.
  const [seenOpen, setSeenOpen] = React.useState(isOpen);
  if (seenOpen !== isOpen) {
    setSeenOpen(isOpen);
    if (!isOpen) {
      setStack([]);
      setQuery("");
      setActiveKey(null);
      setFlash(null);
    }
  }

  // Pages only exist for commands that still have sub-commands.
  const path = (flat ? [] : stack)
    .map((id) => index.get(id)?.item)
    .filter((x): x is CommandItem => !!x?.children?.length);
  const recentEntries = recentIds
    .map((id) => index.get(id))
    .filter((e): e is Entry => !!e && !e.item.children?.length)
    .slice(0, maxRecent);

  const layers = path.length
    ? nesting === "stack"
      ? [null, ...path]
      : [path[path.length - 1] ?? null]
    : [null];

  const sectionsFor = (parent: CommandItem | null, top: boolean) => {
    const depth = parent ? path.indexOf(parent) + 1 : 0;
    const base = path.slice(0, depth);
    return buildSections({
      items: parent ? (parent.children ?? []) : commands,
      base,
      query: top ? query : "",
      fuzzy,
      flat,
      recent: parent ? [] : recentEntries,
      layer: parent ? parent.id : "root",
    });
  };

  const topParent = path[path.length - 1] ?? null;
  const topSections = sectionsFor(topParent, true);
  const rows = status === "ready" ? topSections.flatMap((s) => s.rows) : [];
  const activeRow = rows.find((r) => r.key === activeKey) ?? rows[0];

  /* ------------------------------- height -------------------------------- */

  const listH = useMotionValue(MAX_LIST);
  const heightAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const heightPlaced = React.useRef(false);
  const onHeight = React.useCallback(
    (h: number) => {
      const to = Math.min(MAX_LIST, Math.round(h));
      heightAnim.current?.stop();
      if (!heightPlaced.current || !motionSafe) {
        heightPlaced.current = true;
        listH.jump(to);
        return;
      }
      if (Math.abs(listH.get() - to) < 0.5) return;
      heightAnim.current = animate(listH, to, springs.glide);
    },
    [listH, motionSafe],
  );
  React.useEffect(() => {
    if (!isOpen) heightPlaced.current = false;
  }, [isOpen]);
  React.useEffect(() => () => heightAnim.current?.stop(), []);

  /* -------------------------------- focus -------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const restore = React.useRef<HTMLElement | null>(null);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    if (focusAsk === 0) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [focusAsk]);

  React.useEffect(() => {
    if (isOpen || !restore.current) return;
    restore.current.focus({ preventScroll: true });
    restore.current = null;
  }, [isOpen]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
    };
  }, []);

  // Results are announced once typing pauses, never per letter.
  React.useEffect(() => {
    if (!isOpen || !query.trim()) return;
    const n = rows.length;
    const text =
      n === 0
        ? `No commands match ${query.trim()}.`
        : `${n} ${n === 1 ? "result" : "results"}.`;
    const t = window.setTimeout(
      () => setSaid((s) => ({ n: s.n + 1, text })),
      600,
    );
    return () => window.clearTimeout(t);
  }, [isOpen, query, rows.length]);

  const openNow = React.useRef(isOpen);
  React.useEffect(() => {
    openNow.current = isOpen;
  });

  /* ------------------------------- actions ------------------------------- */

  const setOpenTo = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const openPalette = () => {
    if (isOpen) {
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    const at = document.activeElement;
    returnTo.current =
      at instanceof HTMLElement && at !== document.body ? at : null;
    audio.play("swish", { pitch: 1.1, gain: 0.4 });
    setFocusAsk((n) => n + 1);
    openNow.current = true;
    setOpenTo(true);
  };

  const closePalette = () => {
    if (!openNow.current) return;
    openNow.current = false;
    const root = rootRef.current;
    const at = document.activeElement;
    const inside = !!root && !!at && root.contains(at);
    audio.play("swish", { pitch: 0.85, gain: 0.35 });
    // Focus goes back once the palette (and the inert backdrop) has gone.
    restore.current =
      inside || !at || at === document.body
        ? returnTo.current && returnTo.current.isConnected
          ? returnTo.current
          : (triggerRef.current ?? root)
        : null;
    returnTo.current = null;
    setOpenTo(false);
  };

  const push = (item: CommandItem) => {
    setDir(1);
    setStack([...path.map((p) => p.id), item.id]);
    setQuery("");
    setActiveKey(null);
    audio.play("swish", { pitch: 1.15, gain: 0.35 });
    const n = item.children?.length ?? 0;
    say(`${bare(item.label)}. ${n} ${n === 1 ? "choice" : "choices"}.`);
  };

  const popTo = (depth: number) => {
    if (depth >= path.length) return;
    setDir(-1);
    const next = path.slice(0, depth);
    setStack(next.map((p) => p.id));
    setQuery("");
    setActiveKey(null);
    audio.play("swish", { pitch: 0.9, gain: 0.3 });
    const now = next[next.length - 1];
    say(now ? `${bare(now.label)}.` : "All commands.");
  };

  const move = (to: number) => {
    const n = rows.length;
    if (n === 0) return;
    const i = ((to % n) + n) % n;
    const row = rows[i];
    if (!row || row.key === activeRow?.key) return;
    setActiveKey(row.key);
    audio.play("tick", {
      pitch: r2(1.3 - (0.45 * i) / Math.max(1, n - 1)),
      gain: 0.32,
    });
  };

  const run = (row: Row) => {
    const { item } = row;
    if (item.disabled) return;
    if (item.children?.length && !flat) {
      push(item);
      return;
    }
    const trail = [...row.path.map((p) => bare(p.label)), bare(item.label)];
    const next = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(
      0,
      maxRecent,
    );
    if (recent === undefined) setOwnRecent(next);
    onRecentChange?.(next);
    onRun?.(item, row.path);
    say(`Ran ${trail.join(", ")}.`);
    setActiveKey(row.key);
    setFlash(row.key);
    if (item.keepOpen) {
      const parent = row.path[row.path.length - 1];
      setPicked((p) => ({ ...p, [parent?.id ?? "root"]: item.id }));
      timers.current.push(window.setTimeout(() => setFlash(null), 160));
      return;
    }
    // The row flicks bright, then the palette goes.
    timers.current.push(window.setTimeout(() => closePalette(), 140));
  };

  const checkedOf = (row: Row) => {
    if (!row.item.keepOpen) return false;
    const parent = row.path[row.path.length - 1];
    const choice = picked[parent?.id ?? "root"];
    return choice ? choice === row.item.id : !!row.item.checked;
  };

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const i = activeRow ? rows.indexOf(activeRow) : -1;
    const opens = !!activeRow?.item.children?.length && !flat;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        move(i - 1);
        return;
      case "PageDown":
        event.preventDefault();
        move(Math.min(rows.length - 1, i + 5));
        return;
      case "PageUp":
        event.preventDefault();
        move(Math.max(0, i - 5));
        return;
      case "Enter":
        event.preventDefault();
        if (activeRow) run(activeRow);
        return;
      case "Tab":
        if (opens && !event.shiftKey && activeRow) {
          event.preventDefault();
          push(activeRow.item);
        }
        return;
      case "ArrowRight": {
        const el = event.currentTarget;
        if (opens && activeRow && el.selectionStart === el.value.length) {
          event.preventDefault();
          push(activeRow.item);
        }
        return;
      }
      case "ArrowLeft":
      case "Backspace":
        if (query === "" && path.length) {
          event.preventDefault();
          popTo(path.length - 1);
        }
        return;
      case "Escape":
        // Handled here, where focus is: clear, then back, then close.
        event.preventDefault();
        if (query) {
          setQuery("");
          setActiveKey(null);
        } else if (path.length) popTo(path.length - 1);
        else closePalette();
        return;
    }
  };

  /* ------------------------------- derived ------------------------------- */

  const fieldPlaceholder = topParent
    ? (topParent.placeholder ?? `${bare(topParent.label)}…`)
    : placeholder;
  const activeOption =
    activeRow && status === "ready"
      ? `${uid}-opt-${activeRow.key.replace(/[^\w-]/g, "_")}`
      : undefined;

  const pageVariants = {
    enter: (d: number) =>
      !motionSafe
        ? { opacity: 0 }
        : nesting === "stack"
          ? { opacity: 0, y: d > 0 ? 12 : 0, x: 0, scale: 1 }
          : { opacity: 0, x: distances.shift * d, y: 0, scale: 1 },
    center: { opacity: 1, x: 0, y: 0, scale: 1 },
    behind: motionSafe
      ? { opacity: 0.35, x: 0, y: -4, scale: 0.96 }
      : { opacity: 0, x: 0, y: 0, scale: 1 },
    exit: (d: number) =>
      !motionSafe
        ? { opacity: 0, transition: exitFor(durations.fast) }
        : nesting === "stack"
          ? { opacity: 0, y: 12, transition: exitFor(durations.base) }
          : {
              opacity: 0,
              x: -distances.shift * d,
              transition: exitFor(durations.base),
            },
  };

  const kbd = mac ? "⌘K" : "Ctrl K";

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        if (
          shortcut &&
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "k"
        ) {
          // Consumed here, so the page around the frame never sees it.
          event.preventDefault();
          event.stopPropagation();
          if (isOpen) closePalette();
          else openPalette();
        }
      }}
      className={cn(
        "@container relative isolate flex h-[560px] w-full flex-col overflow-clip rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
    >
      <div
        inert={isOpen || undefined}
        tabIndex={-1}
        className="flex flex-1 flex-col overflow-clip outline-none"
      >
        {trigger ? (
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-hairline px-3 @min-[640px]:px-4">
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+K Control+K"
              onClick={openPalette}
              className={cn(
                "flex h-8 w-full max-w-[380px] items-center gap-2 rounded-2 border border-hairline bg-surface-1 px-2.5 text-[13px] text-ink-3 transition-colors hover:border-hairline-strong hover:text-ink-2",
                FOCUS,
              )}
            >
              <Search aria-hidden className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">
                {triggerLabel}
              </span>
              <kbd className="inline-flex h-5 shrink-0 items-center rounded-1 border border-hairline px-1.5 font-mono text-[10px]">
                {kbd}
              </kbd>
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children ?? <InvoicesScreen />}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="scrim"
            aria-hidden
            onPointerDown={(event) => {
              event.preventDefault();
              closePalette();
            }}
            className="absolute inset-0 z-10 bg-[color-mix(in_oklab,var(--background)_55%,transparent)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            key="palette"
            // A dialog over its own app frame, not over the page: it traps Tab
            // and takes Escape itself, but never tells assistive technology
            // that the rest of the page has gone inert.
            role="dialog"
            aria-label={label}
            onKeyDown={(event) => {
              if (event.defaultPrevented) return;
              if (event.key === "Escape") {
                // Escape from anywhere in the palette (Retry, a chip).
                event.preventDefault();
                closePalette();
                return;
              }
              if (event.key !== "Tab") return;
              const nodes = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  "input, button",
                ),
              ).filter((n) => n.tabIndex >= 0 && !n.hasAttribute("disabled"));
              const first = nodes[0];
              const last = nodes[nodes.length - 1];
              if (!first || !last) return;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
            className={cn(
              "absolute top-2 left-1/2 z-20 flex w-[calc(100%-16px)] -translate-x-1/2 flex-col overflow-clip rounded-3 border border-hairline-strong bg-popover text-foreground shadow-[0_16px_48px_color-mix(in_oklab,black_28%,transparent)] @min-[640px]:top-[10%]",
              preview
                ? "@min-[640px]:w-[min(680px,calc(100%-48px))]"
                : "@min-[640px]:w-[min(560px,calc(100%-48px))]",
            )}
            initial={
              motionSafe
                ? { opacity: 0, y: -distances.step, scale: 0.97 }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{
              opacity: 0,
              scale: motionSafe ? 0.98 : 1,
              transition: exitFor(durations.base),
            }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              scale: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast, ease: easings.enter },
            }}
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3">
              <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
              <div className="flex max-w-[45%] min-w-0 shrink-0 items-center gap-1 empty:hidden">
                <AnimatePresence initial={false}>
                  {path.map((p, i) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      tabIndex={-1}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => popTo(i + 1 === path.length ? i : i + 1)}
                      aria-label={`Back to ${i === 0 ? "all commands" : bare(path[i - 1]?.label ?? "")}`}
                      className="inline-flex h-6 min-w-0 shrink items-center rounded-1 bg-cobalt-wash px-1.5 text-xs text-cobalt-bright"
                      initial={
                        motionSafe ? { opacity: 0, scale: 0.9 } : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        scale: motionSafe ? springs.snap : { duration: 0 },
                        opacity: { duration: durations.fast },
                      }}
                    >
                      <span className="truncate">{bare(p.label)}</span>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeOption}
                aria-label={topParent ? bare(topParent.label) : label}
                placeholder={fieldPlaceholder}
                value={query}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setActiveKey(null);
                }}
                onKeyDown={onFieldKeyDown}
                className="h-8 min-w-0 flex-1 rounded-2 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring/45 focus-visible:outline-solid"
              />
              {status === "loading" ? (
                <LoaderCircle
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0 text-ink-3",
                    motionSafe && "animate-spin",
                  )}
                />
              ) : (
                <kbd
                  aria-hidden
                  className="hidden h-5 shrink-0 items-center rounded-1 border border-hairline px-1.5 font-mono text-[10px] text-ink-3 @min-[480px]:inline-flex"
                >
                  esc
                </kbd>
              )}
            </div>

            <div className="flex">
              <motion.div
                className="relative min-w-0 flex-1 overflow-clip"
                style={{ height: listH }}
              >
                <AnimatePresence initial={false} custom={dir}>
                  {layers.map((parent, i) => {
                    const top = i === layers.length - 1;
                    const key = parent ? parent.id : "root";
                    const sections = top
                      ? topSections
                      : sectionsFor(parent, false);
                    return (
                      <motion.div
                        key={key}
                        custom={dir}
                        variants={pageVariants}
                        initial="enter"
                        animate={top ? "center" : "behind"}
                        exit="exit"
                        transition={{
                          x: motionSafe ? springs.glide : { duration: 0 },
                          y: motionSafe ? springs.glide : { duration: 0 },
                          scale: motionSafe ? springs.glide : { duration: 0 },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                        }}
                        className="absolute inset-x-0 top-0 origin-top"
                        style={{ zIndex: i }}
                      >
                        <PageView
                          layerKey={key}
                          top={top}
                          sections={sections}
                          rows={top ? rows : sections.flatMap((s) => s.rows)}
                          activeKey={top ? (activeRow?.key ?? null) : null}
                          checkedOf={checkedOf}
                          flash={top ? flash : null}
                          uid={uid}
                          listId={listId}
                          label={topParent ? bare(topParent.label) : label}
                          motionSafe={motionSafe}
                          status={status}
                          query={top ? query : ""}
                          onRetry={onRetry}
                          onHeight={onHeight}
                          onHover={(k) => {
                            const at = rows.findIndex((r) => r.key === k);
                            if (at !== -1) move(at);
                          }}
                          onChoose={run}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              {preview ? (
                <aside
                  aria-label="Preview"
                  className="relative hidden w-[248px] shrink-0 overflow-clip border-l border-hairline bg-surface-1 @min-[640px]:block"
                >
                  <AnimatePresence initial={false}>
                    <motion.div
                      key={activeRow?.key ?? "none"}
                      className="absolute inset-0"
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.nudge }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        y: motionSafe ? springs.snap : { duration: 0 },
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
                      }}
                    >
                      <PreviewPane
                        row={status === "ready" ? activeRow : undefined}
                      />
                    </motion.div>
                  </AnimatePresence>
                </aside>
              ) : null}
            </div>

            <div className="flex h-9 shrink-0 items-center gap-3 border-t border-hairline px-3 text-[11px] text-ink-3">
              <span className="inline-flex items-center gap-1">
                <ArrowUp aria-hidden className="size-3" />
                <ArrowDown aria-hidden className="size-3" />
                move
              </span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft aria-hidden className="size-3" />
                {activeRow?.item.children?.length && !flat ? "open" : "run"}
              </span>
              <span className="hidden items-center gap-1 @min-[480px]:inline-flex">
                <kbd className="font-mono text-[10px]">⌫</kbd>
                back
              </span>
              <span className="hidden items-center gap-1 @min-[640px]:inline-flex">
                <kbd className="font-mono text-[10px]">esc</kbd>
                close
              </span>
              <span className="ml-auto font-mono text-[10px] tabular-nums">
                {status === "ready"
                  ? `${rows.length} ${rows.length === 1 ? "command" : "commands"}`
                  : status === "loading"
                    ? "loading"
                    : "offline"}
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
