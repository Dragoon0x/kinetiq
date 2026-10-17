"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";
import {
  ArrowLeftRight,
  Bell,
  BookOpen,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  Flame,
  Hourglass,
  Inbox,
  Landmark,
  Lock,
  MessageSquare,
  Palette,
  PenTool,
  Plus,
  Receipt,
  Shapes,
  Smile,
  Users,
  Wallet,
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

export type WorkspaceLiftAccentName = "cobalt" | "plum" | "mint" | "ink";
export type WorkspaceLiftDirection = "auto" | "up" | "down";

export type LiftIcon =
  | "inbox"
  | "flame"
  | "clock"
  | "smile"
  | "users"
  | "calendar"
  | "book"
  | "bank"
  | "wallet"
  | "chart"
  | "receipt"
  | "swap"
  | "palette"
  | "pen"
  | "shapes"
  | "chat"
  | "check"
  | "hourglass";

export type LiftRow = {
  id: string;
  label: string;
  /** Right-hand detail: who, when, how much. */
  meta: string;
  tone?: "warn" | "success" | "danger";
};

export type LiftPage = {
  title: string;
  summary: string;
  rows: LiftRow[];
};

export type LiftNavItem = {
  id: string;
  label: string;
  /** Unread count shown on the row and summed onto the workspace's badge. */
  unread?: number;
  icon?: LiftIcon;
  page: LiftPage;
};

export type LiftNavGroup = {
  id: string;
  label: string;
  items: LiftNavItem[];
};

export type LiftWorkspace = {
  id: string;
  name: string;
  /** Two letters for the strip. */
  initials: string;
  /** Any CSS colour: the workspace's own, tinting the frame while it is open. */
  color: string;
  /** What the workspace is for: "Support". */
  kind?: string;
  nav: LiftNavGroup[];
  /** Open, still loading (drawn as a skeleton), or not open to this person. @default "ready" */
  status?: "ready" | "loading" | "locked";
};

export type WorkspaceLiftProps = {
  /** The workspaces in strip order, top to bottom. @default defaultLiftWorkspaces */
  workspaces?: LiftWorkspace[];
  /** Controlled workspace id. */
  workspace?: string;
  /** Initial workspace when uncontrolled. @default the first */
  defaultWorkspace?: string;
  /** Fires from the strip, the sheet, an arrow key or Cmd/Ctrl+number that chose a workspace. */
  onSwitchWorkspace?: (id: string, workspace: LiftWorkspace) => void;
  /** Controlled page id within the current workspace. */
  page?: string;
  /** Initial page per workspace when uncontrolled. @default each workspace's first page */
  defaultPage?: string;
  /** Fires when a nav item is chosen, with the workspace it belongs to. */
  onNavigate?: (workspaceId: string, pageId: string) => void;
  /** The strip's + button was pressed. Omit it and there is no + button. */
  onAddWorkspace?: () => void;
  /** "Ask for access" was pressed on a locked workspace. */
  onRequestAccess?: (workspaceId: string) => void;
  /** The person signed in, for the header avatar. @default Ines Carvalho */
  user?: { name: string; initials: string };
  /** The frame's accessible name. @default "Workspaces" */
  title?: string;
  /** The frame's height in px. @default 520 */
  frameHeight?: number;
  /** Where a new workspace arrives from: by its place in the strip, always from below, or always from above. @default "auto" */
  liftDirection?: WorkspaceLiftDirection;
  /** The strip's width in px; its icons scale with it. @default 56 */
  stripWidth?: number;
  /** Selection and focus colour; workspace colours stay their own. @default "cobalt" */
  accent?: WorkspaceLiftAccentName | (string & {});
  /** Cmd or Ctrl with 1 to 9 switches workspace while focus is in the frame. @default true */
  shortcuts?: boolean;
  /** Read only: nothing can be switched or opened. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const row = (
  id: string,
  label: string,
  meta: string,
  tone?: LiftRow["tone"],
): LiftRow => ({ id, label, meta, ...(tone ? { tone } : {}) });

export const defaultLiftWorkspaces: LiftWorkspace[] = [
  {
    id: "coldbrook",
    name: "Coldbrook",
    initials: "Cb",
    color: "oklch(0.58 0.1 195)",
    kind: "Support",
    nav: [
      {
        id: "queues",
        label: "Queues",
        items: [
          {
            id: "inbox",
            label: "Inbox",
            unread: 12,
            icon: "inbox",
            page: {
              title: "Inbox",
              summary: "12 open · oldest waiting 38 min",
              rows: [
                row(
                  "c1",
                  "Order 4471 marked delivered, not received",
                  "Ines · 4 min",
                ),
                row(
                  "c2",
                  "Refund for a double charge",
                  "Tomas · 12 min",
                  "warn",
                ),
                row("c3", "Can I change the delivery address?", "Mei · 21 min"),
                row("c4", "Invoice for September", "Arjun · 38 min"),
              ],
            },
          },
          {
            id: "escalations",
            label: "Escalations",
            unread: 3,
            icon: "flame",
            page: {
              title: "Escalations",
              summary: "3 waiting on a lead",
              rows: [
                row(
                  "e1",
                  "Chargeback opened on order 4398",
                  "Due today",
                  "danger",
                ),
                row(
                  "e2",
                  "Courier lost three parcels in Leeds",
                  "Due tomorrow",
                  "warn",
                ),
                row("e3", "Account locked after a password reset", "Due Mon"),
              ],
            },
          },
          {
            id: "waiting",
            label: "Waiting on customer",
            icon: "clock",
            page: {
              title: "Waiting on customer",
              summary: "9 tickets · auto-close after 5 days",
              rows: [
                row("w1", "Photo of the damaged lid", "2 days"),
                row("w2", "Which card was charged", "3 days"),
                row("w3", "Confirm the new address", "4 days", "warn"),
              ],
            },
          },
        ],
      },
      {
        id: "reports",
        label: "Reports",
        items: [
          {
            id: "csat",
            label: "Satisfaction",
            icon: "smile",
            page: {
              title: "Satisfaction",
              summary: "92% this week · up 3 points",
              rows: [
                row("s1", "Replies under an hour", "96%", "success"),
                row("s2", "Solved on first reply", "71%"),
                row("s3", "Reopened within a week", "4%"),
              ],
            },
          },
          {
            id: "shifts",
            label: "Shifts",
            icon: "calendar",
            page: {
              title: "Shifts",
              summary: "Six on today · two after 18:00",
              rows: [
                row("h1", "Morning · Ines, Tomas, Mei", "07:00–15:00"),
                row("h2", "Late · Arjun, Sol", "12:00–20:00"),
                row("h3", "On call · Rae", "20:00–07:00"),
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "basinworks",
    name: "Basinworks",
    initials: "Bw",
    color: "oklch(0.62 0.13 62)",
    kind: "Finance",
    nav: [
      {
        id: "close",
        label: "Month close",
        items: [
          {
            id: "ledger",
            label: "Ledger close",
            unread: 3,
            icon: "bank",
            page: {
              title: "Ledger close",
              summary: "October · 14 of 19 steps done",
              rows: [
                row("l1", "Bank reconciliations", "Done", "success"),
                row("l2", "Accrue the courier invoices", "Due Oct 21", "warn"),
                row("l3", "Review prepaid software", "Due Oct 22"),
                row("l4", "Lock the period", "Due Oct 24"),
              ],
            },
          },
          {
            id: "recs",
            label: "Reconciliations",
            unread: 1,
            icon: "swap",
            page: {
              title: "Reconciliations",
              summary: "2 accounts still out by a total of $412",
              rows: [
                row("r1", "Coldbrook Bank · operating", "Matched", "success"),
                row("r2", "Waylight Pay · payouts", "Out $380", "danger"),
                row("r3", "Petty cash", "Out $32", "warn"),
              ],
            },
          },
        ],
      },
      {
        id: "money",
        label: "Money",
        items: [
          {
            id: "runway",
            label: "Cash runway",
            icon: "wallet",
            page: {
              title: "Cash runway",
              summary: "19 months at September’s burn",
              rows: [
                row("u1", "Cash on hand", "$2.41M"),
                row("u2", "Monthly burn", "$126k"),
                row("u3", "Receivables due in 30 days", "$184k", "success"),
              ],
            },
          },
          {
            id: "spend",
            label: "Spend by team",
            icon: "chart",
            page: {
              title: "Spend by team",
              summary: "October to date · $96.2k",
              rows: [
                row("p1", "Support", "$31.8k"),
                row("p2", "Design", "$22.4k"),
                row("p3", "Platform", "$42.0k", "warn"),
              ],
            },
          },
          {
            id: "bills",
            label: "Bills to approve",
            icon: "receipt",
            page: {
              title: "Bills to approve",
              summary: "4 waiting · $18.6k",
              rows: [
                row("b1", "Gaugeworks · sensors", "$9,200"),
                row("b2", "Fieldline · freight", "$6,140"),
                row("b3", "Office lease · November", "$3,260"),
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "fernworks",
    name: "Fernworks",
    initials: "Fw",
    color: "oklch(0.56 0.14 320)",
    kind: "Design",
    nav: [
      {
        id: "projects",
        label: "Projects",
        items: [
          {
            id: "onboarding",
            label: "Onboarding refresh",
            unread: 5,
            icon: "shapes",
            page: {
              title: "Onboarding refresh",
              summary: "Round 3 · five new comments",
              rows: [
                row("o1", "Welcome screen · two directions", "Rae · 1 h"),
                row("o2", "Empty states for the first week", "Sol · 3 h"),
                row("o3", "Checklist motion study", "Mei · yesterday"),
              ],
            },
          },
          {
            id: "pricing",
            label: "Pricing page",
            icon: "pen",
            page: {
              title: "Pricing page",
              summary: "In review with Basinworks finance",
              rows: [
                row("q1", "Annual toggle copy", "Approved", "success"),
                row("q2", "Plan table on phones", "Changes asked", "warn"),
                row("q3", "FAQ order", "Open"),
              ],
            },
          },
          {
            id: "palette",
            label: "Colour system",
            icon: "palette",
            page: {
              title: "Colour system",
              summary: "v4 tokens · dark theme pass",
              rows: [
                row("v1", "Status colours as pigments", "Done", "success"),
                row("v2", "Chart palette contrast", "In progress"),
                row("v3", "Retire the old greys", "Next"),
              ],
            },
          },
        ],
      },
      {
        id: "crits",
        label: "Critiques",
        items: [
          {
            id: "open-crits",
            label: "Open",
            unread: 2,
            icon: "chat",
            page: {
              title: "Open critiques",
              summary: "Thursday 15:00 · two on the list",
              rows: [
                row("k1", "Navigation for the admin app", "Ines"),
                row("k2", "Receipt emails", "Arjun"),
              ],
            },
          },
          {
            id: "shipped",
            label: "Shipped",
            icon: "check",
            page: {
              title: "Shipped",
              summary: "11 this quarter",
              rows: [
                row("x1", "Search results redesign", "Oct 9", "success"),
                row("x2", "Settings reorganised", "Oct 2", "success"),
                row("x3", "Icon set v2", "Sep 24", "success"),
              ],
            },
          },
        ],
      },
    ],
  },
  {
    id: "waylight",
    name: "Waylight",
    initials: "Wl",
    color: "oklch(0.56 0.12 255)",
    kind: "Platform",
    status: "locked",
    nav: [],
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ICONS: Record<LiftIcon, typeof Inbox> = {
  inbox: Inbox,
  flame: Flame,
  clock: Clock,
  smile: Smile,
  users: Users,
  calendar: CalendarDays,
  book: BookOpen,
  bank: Landmark,
  wallet: Wallet,
  chart: ChartColumn,
  receipt: Receipt,
  swap: ArrowLeftRight,
  palette: Palette,
  pen: PenTool,
  shapes: Shapes,
  chat: MessageSquare,
  check: CircleCheck,
  hourglass: Hourglass,
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const ACCENTS: Record<WorkspaceLiftAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const itemsOf = (ws: LiftWorkspace) => ws.nav.flatMap((g) => g.items);
const unreadOf = (ws: LiftWorkspace) =>
  itemsOf(ws).reduce((s, i) => s + Math.max(0, i.unread ?? 0), 0);
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const TONE: Record<NonNullable<LiftRow["tone"]>, string> = {
  warn: "bg-warn",
  success: "bg-success",
  danger: "bg-danger",
};

/* ----------------------------------------------------------------------- */
/*                                  The car                                 */
/* ----------------------------------------------------------------------- */

type CarProps = {
  ws: LiftWorkspace;
  floor: number;
  floors: number;
  pageId: string;
  onNavigate: (pageId: string) => void;
  onOpenSheet: () => void;
  sheetOpen: boolean;
  sheetTrigger: React.Ref<HTMLButtonElement>;
  onRequestAccess?: (id: string) => void;
  requested: boolean;
  user: { name: string; initials: string };
  uid: string;
  regionId: string;
  live: boolean;
  motionSafe: boolean;
  disabled: boolean;
  dir: number;
};

/** One workspace's whole app: sidebar, header and page, travelling as one. */
function Car({
  ws,
  floor,
  floors,
  pageId,
  onNavigate,
  onOpenSheet,
  sheetOpen,
  sheetTrigger,
  onRequestAccess,
  requested,
  user,
  uid,
  regionId,
  live,
  motionSafe,
  disabled,
  dir,
}: CarProps) {
  const items = itemsOf(ws);
  const page = items.find((i) => i.id === pageId) ?? items[0] ?? null;
  const group = ws.nav.find((g) => g.items.some((i) => i.id === page?.id));
  const status = ws.status ?? "ready";
  // A workspace that finishes loading fades its real pages in over the
  // skeleton; the status it was first drawn with never fades (no blank
  // first frame on the server).
  const [firstStatus] = React.useState(status);
  const settle = status === firstStatus ? false : { opacity: 0 };
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [focusKey, setFocusKey] = React.useState<string>(
    page ? `i:${page.id}` : `g:${ws.nav[0]?.id ?? ""}`,
  );
  const treeEls = React.useRef(new Map<string, HTMLElement>());

  /** The tree's visible order: each group, then its items when open. */
  const visible: { key: string; kind: "g" | "i"; group: LiftNavGroup }[] = [];
  for (const g of ws.nav) {
    visible.push({ key: `g:${g.id}`, kind: "g", group: g });
    if (!collapsed[g.id])
      for (const it of g.items)
        visible.push({ key: `i:${it.id}`, kind: "i", group: g });
  }
  const focusAt = (key: string) => {
    setFocusKey(key);
    treeEls.current.get(key)?.focus();
  };

  const onTreeKey = (
    event: React.KeyboardEvent,
    key: string,
    kind: "g" | "i",
    g: LiftNavGroup,
  ) => {
    const at = visible.findIndex((v) => v.key === key);
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = visible[Math.min(visible.length - 1, at + 1)];
        if (next) focusAt(next.key);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prev = visible[Math.max(0, at - 1)];
        if (prev) focusAt(prev.key);
        break;
      }
      case "Home": {
        event.preventDefault();
        const first = visible[0];
        if (first) focusAt(first.key);
        break;
      }
      case "End": {
        event.preventDefault();
        const end = visible[visible.length - 1];
        if (end) focusAt(end.key);
        break;
      }
      case "ArrowRight":
        event.preventDefault();
        if (kind === "g") {
          if (collapsed[g.id]) setCollapsed((c) => ({ ...c, [g.id]: false }));
          else if (g.items[0]) focusAt(`i:${g.items[0].id}`);
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (kind === "g") setCollapsed((c) => ({ ...c, [g.id]: true }));
        else focusAt(`g:${g.id}`);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (kind === "g") setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }));
        else onNavigate(key.slice(2));
        break;
      default:
        break;
    }
  };

  const sidebar = (
    <nav
      aria-label={`${ws.name} navigation`}
      className="hidden w-[10.5rem] shrink-0 flex-col gap-3 border-r border-hairline bg-surface-1 px-2 py-3 @[34rem]:flex @[60rem]:w-[12rem]"
    >
      <div className="flex items-center gap-2 px-1.5">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: ws.color }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] leading-4 font-semibold">
            {ws.name}
          </span>
          {ws.kind ? (
            <span className="block truncate text-[11px] leading-4 text-ink-3">
              {ws.kind}
            </span>
          ) : null}
        </span>
      </div>
      {status === "ready" ? (
        <ul
          role="tree"
          aria-label={`${ws.name} pages`}
          className="flex flex-col gap-0.5"
        >
          {ws.nav.map((g) => {
            const open = !collapsed[g.id];
            const gKey = `g:${g.id}`;
            return (
              <li
                key={g.id}
                role="treeitem"
                aria-expanded={open}
                aria-selected={false}
                tabIndex={focusKey === gKey ? 0 : -1}
                ref={(el) => {
                  if (el) treeEls.current.set(gKey, el);
                  else treeEls.current.delete(gKey);
                }}
                onFocus={(event) => {
                  if (event.target === event.currentTarget) setFocusKey(gKey);
                }}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget)
                    onTreeKey(event, gKey, "g", g);
                }}
                onClick={(event) => {
                  if (
                    event.target === event.currentTarget ||
                    (event.target as HTMLElement).dataset.wlGroup !== undefined
                  )
                    setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }));
                }}
                className={cn("flex flex-col rounded-2", FOCUS_IN)}
              >
                <span
                  data-wl-group=""
                  className="flex h-7 cursor-pointer items-center gap-1 px-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase select-none"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "pointer-events-none size-3 shrink-0 transition-transform duration-150",
                      open && "rotate-90",
                    )}
                  />
                  <span className="pointer-events-none truncate">
                    {g.label}
                  </span>
                </span>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.ul
                      role="group"
                      className="flex flex-col gap-0.5 overflow-hidden"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{
                        height: 0,
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={motionSafe ? springs.glide : { duration: 0 }}
                    >
                      {g.items.map((it) => {
                        const key = `i:${it.id}`;
                        const current = it.id === page?.id;
                        const Icon = it.icon ? ICONS[it.icon] : null;
                        return (
                          <li
                            key={it.id}
                            role="treeitem"
                            aria-selected={current}
                            aria-current={current ? "page" : undefined}
                            tabIndex={focusKey === key ? 0 : -1}
                            ref={(el) => {
                              if (el) treeEls.current.set(key, el);
                              else treeEls.current.delete(key);
                            }}
                            onFocus={() => setFocusKey(key)}
                            onKeyDown={(event) => onTreeKey(event, key, "i", g)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setFocusKey(key);
                              onNavigate(it.id);
                            }}
                            className={cn(
                              "relative flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2 text-[12.5px] select-none",
                              current
                                ? "text-foreground"
                                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                              disabled && "cursor-default",
                              FOCUS_IN,
                            )}
                          >
                            {current ? (
                              <motion.span
                                layoutId={`${uid}-pill-${ws.id}`}
                                aria-hidden
                                className="absolute inset-0 rounded-2 border border-[var(--wl-soft)] bg-[var(--wl-wash)]"
                                transition={
                                  motionSafe ? springs.snap : { duration: 0 }
                                }
                              />
                            ) : null}
                            {Icon ? (
                              <Icon
                                aria-hidden
                                className="relative size-3.5 shrink-0 text-ink-3"
                              />
                            ) : null}
                            <span className="relative min-w-0 flex-1 truncate">
                              {it.label}
                            </span>
                            {it.unread ? (
                              <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--wl-ink)] px-1 font-mono text-[9.5px] leading-none text-background tabular-nums">
                                {it.unread}
                                <span className="sr-only"> unread</span>
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </motion.ul>
                  ) : null}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      ) : status === "loading" ? (
        <div aria-hidden className="flex flex-col gap-2 px-1.5">
          {[0.8, 0.6, 0.7, 0.5, 0.65].map((w, i) => (
            <span
              key={i}
              className="h-3 rounded-1 bg-surface-2"
              style={{ width: `${w * 100}%` }}
            />
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 px-1.5 text-[12px] text-ink-3">
          <Lock aria-hidden className="size-3.5 shrink-0" />
          No access
        </p>
      )}
    </nav>
  );

  const header = (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3">
      <button
        ref={sheetTrigger}
        type="button"
        onClick={onOpenSheet}
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        disabled={disabled}
        className={cn(
          "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-2 border border-hairline px-2 text-[12.5px] font-semibold @[34rem]:hidden",
          FOCUS,
        )}
      >
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: ws.color }}
        />
        <span className="truncate">{ws.name}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-ink-3" />
      </button>
      <p className="hidden min-w-0 flex-1 items-center gap-1 truncate text-[12.5px] text-ink-3 @[34rem]:flex">
        <span className="truncate">{ws.name}</span>
        {group ? (
          <>
            <ChevronRight aria-hidden className="size-3 shrink-0" />
            <span className="truncate">{group.label}</span>
          </>
        ) : null}
        {page && status === "ready" ? (
          <>
            <ChevronRight aria-hidden className="size-3 shrink-0" />
            <span className="truncate font-medium text-foreground">
              {page.label}
            </span>
          </>
        ) : null}
      </p>
      <span className="min-w-0 flex-1 @[34rem]:hidden" />
      {/* The floor: the workspace's place in the strip, rolling one face the way the car went. */}
      <span
        aria-hidden
        className="hidden h-7 shrink-0 items-center gap-1 rounded-2 border border-hairline bg-surface-1 px-1.5 font-mono text-[11px] text-ink-3 tabular-nums @[22rem]:inline-flex"
      >
        <span className="relative grid h-4 w-[2ch] overflow-hidden text-foreground">
          <AnimatePresence initial={false} custom={dir}>
            <motion.span
              key={floor}
              custom={dir}
              className="col-start-1 row-start-1 leading-4"
              variants={{
                enter: (d: number | undefined) => ({
                  y: motionSafe
                    ? `${(typeof d === "number" ? d : 1) * 100}%`
                    : "0%",
                  opacity: 0,
                }),
                center: { y: "0%", opacity: 1 },
                leave: (d: number | undefined) => ({
                  y: motionSafe
                    ? `${-(typeof d === "number" ? d : 1) * 100}%`
                    : "0%",
                  opacity: 0,
                  transition: exitFor(durations.fast),
                }),
              }}
              initial="enter"
              animate="center"
              exit="leave"
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {String(floor).padStart(2, "0")}
            </motion.span>
          </AnimatePresence>
        </span>
        <span>/{String(floors).padStart(2, "0")}</span>
      </span>
      <span
        role="img"
        aria-label={
          unreadOf(ws) > 0
            ? plural(unreadOf(ws), "unread item", "unread items")
            : "Nothing unread"
        }
        className="relative inline-flex size-8 shrink-0 items-center justify-center text-ink-3"
      >
        <Bell aria-hidden className="size-4" />
        {unreadOf(ws) > 0 ? (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 size-1.5 rounded-full"
            style={{ backgroundColor: ws.color }}
          />
        ) : null}
      </span>
      <span
        title={user.name}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10.5px] font-semibold text-ink-2"
      >
        <span aria-hidden>{user.initials}</span>
        <span className="sr-only">{`Signed in as ${user.name}`}</span>
      </span>
    </header>
  );

  const navRow =
    status === "ready" ? (
      <div className="relative shrink-0 border-b border-hairline @[34rem]:hidden">
        <ul
          aria-label={`${ws.name} pages`}
          className="flex [scrollbar-width:none] gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] px-2 py-1.5"
        >
          {items.map((it) => {
            const current = it.id === page?.id;
            return (
              <li key={it.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={current ? "page" : undefined}
                  onClick={() => onNavigate(it.id)}
                  disabled={disabled}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] whitespace-nowrap",
                    current
                      ? "border-[var(--wl-soft)] bg-[var(--wl-wash)] text-foreground"
                      : "border-hairline text-ink-2",
                    FOCUS_IN,
                  )}
                >
                  {it.label}
                  {it.unread ? (
                    <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                      {it.unread}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  let content: React.ReactNode;
  if (status === "loading") {
    content = (
      <div aria-hidden className="flex flex-col gap-3 p-4">
        <span className="h-5 w-40 rounded-1 bg-surface-2" />
        <span className="h-3 w-56 rounded-1 bg-surface-2" />
        <div className="mt-2 flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="h-10 rounded-2 bg-surface-1" />
          ))}
        </div>
      </div>
    );
  } else if (status === "locked") {
    content = (
      <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <span
          aria-hidden
          className="inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink-3"
        >
          <Lock className="size-4" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-[14px] font-semibold">{`You’re not in ${ws.name} yet`}</p>
          <p className="max-w-64 text-[12.5px] text-ink-3">
            {`Its pages are private to members. An admin can add you${ws.kind ? ` to ${ws.kind}` : ""}.`}
          </p>
        </div>
        {onRequestAccess ? (
          <button
            type="button"
            disabled={disabled}
            aria-disabled={requested || undefined}
            onClick={() => {
              if (!requested) onRequestAccess(ws.id);
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-[12.5px] font-medium transition-colors",
              requested
                ? "border-hairline text-ink-3"
                : "border-[var(--wl-soft)] bg-[var(--wl-wash)] text-foreground hover:bg-[var(--wl-soft)]",
              FOCUS,
            )}
          >
            {requested ? (
              <>
                <CircleCheck aria-hidden className="size-3.5 text-success" />
                Request sent
              </>
            ) : (
              "Ask for access"
            )}
          </button>
        ) : null}
      </div>
    );
  } else if (page) {
    const step = cascade(page.page.rows.length + 1);
    content = (
      <div className="grid flex-1 [scrollbar-width:thin] grid-cols-[minmax(0,1fr)] overflow-y-auto overscroll-contain">
        <AnimatePresence initial={false}>
          <motion.div
            key={page.id}
            className="col-start-1 row-start-1 flex flex-col gap-3 p-4"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: {
                opacity: { duration: durations.base, ease: easings.enter },
                y: motionSafe ? springs.glide : { duration: 0 },
              },
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          >
            <div className="flex flex-col gap-0.5">
              <h3 className="text-[16px] leading-6 font-semibold tracking-tight">
                {page.page.title}
              </h3>
              <p className="text-[12.5px] text-ink-3">{page.page.summary}</p>
            </div>
            <ul className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline bg-card">
              {page.page.rows.map((r, i) => (
                <motion.li
                  key={r.id}
                  className="flex items-center gap-2.5 px-3 py-2.5"
                  initial={
                    motionSafe ? { opacity: 0, y: distances.nudge } : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    opacity: {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: 0.04 + i * step,
                    },
                    y: { ...springs.glide, delay: 0.04 + i * step },
                  }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      r.tone ? TONE[r.tone] : "bg-hairline-strong",
                    )}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[13px]"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {r.meta}
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  } else {
    content = (
      <p className="p-4 text-[13px] text-ink-3">
        This workspace has no pages yet.
      </p>
    );
  }

  return (
    <div
      id={live ? regionId : undefined}
      role="region"
      aria-label={`${ws.name} workspace`}
      aria-hidden={live ? undefined : true}
      inert={!live}
      className="absolute inset-0 flex bg-card"
    >
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <motion.div
          key={status}
          className="flex flex-1 flex-col overflow-hidden"
          initial={settle}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {navRow}
          {content}
        </motion.div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An app frame with a narrow strip of workspace icons at its far left; the
 * rest of the frame — sidebar, header and page — is one car. Choosing
 * another workspace runs the car like an elevator on `glide`: the current
 * car and the next travel together as one shaft, the new one arriving from
 * below when it sits lower in the strip and from above when higher (or
 * always one way, by `liftDirection`), so the seam between two workspaces
 * passes through the frame. The strip's indicator slides on `snap`, the
 * frame takes the new workspace's colour on a short tween, and the header's
 * floor number rolls one face the way the car went.
 *
 * Inside a workspace the nav is a tree whose current row's pill travels on
 * `snap`, and pages cross-fade with a 4px rise. A workspace still loading
 * arrives as a skeleton; one not open to this person arrives with a way to
 * ask for access. The strip is a vertical tablist (Up and Down walk it, and
 * the car rides along), Cmd or Ctrl with 1 to 9 switches from anywhere in
 * the frame, and below a 34rem container the strip becomes a sheet dropping
 * from the header. Under reduced motion the cars cross-fade without travel;
 * the colour, floor and page still change.
 */
export function WorkspaceLift({
  workspaces = defaultLiftWorkspaces,
  workspace: workspaceProp,
  defaultWorkspace,
  onSwitchWorkspace,
  page: pageProp,
  defaultPage,
  onNavigate,
  onAddWorkspace,
  onRequestAccess,
  user = { name: "Ines Carvalho", initials: "IC" },
  title = "Workspaces",
  frameHeight = 520,
  liftDirection = "auto",
  stripWidth = 56,
  accent = "cobalt",
  shortcuts = true,
  disabled = false,
  className,
}: WorkspaceLiftProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const regionId = `${uid}-car`;
  const sheetId = `${uid}-sheet`;

  const [ownWs, setOwnWs] = React.useState(
    defaultWorkspace ?? workspaces[0]?.id ?? "",
  );
  const wsId = workspaceProp ?? ownWs;
  const index = Math.max(
    0,
    workspaces.findIndex((w) => w.id === wsId),
  );
  const ws = workspaces[index] ?? null;

  const [ownPages, setOwnPages] = React.useState<Record<string, string>>(() =>
    defaultPage && ws ? { [ws.id]: defaultPage } : {},
  );
  const pageFor = (w: LiftWorkspace) =>
    (w.id === ws?.id ? pageProp : undefined) ??
    ownPages[w.id] ??
    itemsOf(w)[0]?.id ??
    "";

  const [requested, setRequested] = React.useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = React.useState("");
  const [sheetOpen, setSheetOpen] = React.useState(false);

  /* ------------------------------- the lift ------------------------------ */

  type Transit = { from: string; to: string; dir: number; key: number };
  const [shown, setShown] = React.useState(wsId);
  const [transit, setTransit] = React.useState<Transit | null>(null);
  const [floorDir, setFloorDir] = React.useState(1);
  // Every switch, from the strip or from the host, comes through here: the
  // render that sees a new workspace starts a trip from the one on screen.
  if (shown !== wsId) {
    const from = workspaces.findIndex((w) => w.id === shown);
    const to = index;
    const dir =
      liftDirection === "up"
        ? 1
        : liftDirection === "down"
          ? -1
          : to >= from
            ? 1
            : -1;
    setShown(wsId);
    setFloorDir(dir);
    setTransit({ from: shown, to: wsId, dir, key: (transit?.key ?? 0) + 1 });
  }

  // The two cars' positions are written straight from one spring, so they
  // travel as one shaft: no derived values to go stale between trips.
  const fromY = useMotionValue("0%");
  const toY = useMotionValue("0%");
  const fromO = useMotionValue(1);
  const toO = useMotionValue(1);

  React.useLayoutEffect(() => {
    if (!transit) return;
    const d = transit.dir;
    const place = (v: number) => {
      if (motionSafe) {
        fromY.set(`${Math.round(-d * v * 1000) / 10}%`);
        toY.set(`${Math.round(d * (1 - v) * 1000) / 10}%`);
        fromO.set(1);
        toO.set(1);
      } else {
        fromY.set("0%");
        toY.set("0%");
        fromO.set(Math.round((1 - v) * 100) / 100);
        toO.set(Math.round(v * 100) / 100);
      }
    };
    // Placed before the browser paints, so the arriving car is never seen
    // where it will land before it has travelled there.
    place(0);
    const ctrl = animate(0, 1, {
      ...(motionSafe
        ? springs.glide
        : { duration: durations.fast, ease: easings.move }),
      onUpdate: place,
      onComplete: () => {
        place(1);
        setTransit((t) => (t?.key === transit.key ? null : t));
      },
    });
    // A rehearsal or a second switch lands this trip rather than freezing it.
    return () => {
      ctrl.stop();
      place(1);
    };
  }, [transit, motionSafe, fromY, toY, fromO, toO]);

  /* ---------------------------- interactions ---------------------------- */

  const switchTo = (i: number) => {
    const next = workspaces[clamp(i, 0, workspaces.length - 1)];
    if (disabled || !next || next.id === ws?.id) return;
    if (workspaceProp === undefined) setOwnWs(next.id);
    onSwitchWorkspace?.(next.id, next);
    const p = itemsOf(next).find((it) => it.id === pageFor(next));
    setAnnouncement(
      next.status === "locked"
        ? `${next.name}. You don’t have access yet.`
        : next.status === "loading"
          ? `${next.name}, loading.`
          : `${next.name}${p ? `, ${p.label}` : ""}.`,
    );
  };

  const navigate = (pageId: string) => {
    if (disabled || !ws) return;
    // Each workspace remembers its own page, so a trip back lands where you were.
    setOwnPages((m) => ({ ...m, [ws.id]: pageId }));
    onNavigate?.(ws.id, pageId);
    const p = itemsOf(ws).find((it) => it.id === pageId);
    if (p) setAnnouncement(`${p.label}.`);
  };

  const tabs = React.useRef(new Map<string, HTMLButtonElement>());
  const onStripKey = (event: React.KeyboardEvent) => {
    let next = -1;
    if (event.key === "ArrowDown") next = index + 1;
    else if (event.key === "ArrowUp") next = index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = workspaces.length - 1;
    else return;
    event.preventDefault();
    const target = workspaces[clamp(next, 0, workspaces.length - 1)];
    if (!target) return;
    switchTo(clamp(next, 0, workspaces.length - 1));
    tabs.current.get(target.id)?.focus();
  };

  const onFrameKey = (event: React.KeyboardEvent) => {
    if (!shortcuts || disabled) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
      return;
    const n = Number(event.key);
    if (!Number.isInteger(n) || n < 1 || n > 9) return;
    if (n > workspaces.length) return;
    event.preventDefault();
    switchTo(n - 1);
  };

  /* ------------------------------- the sheet ----------------------------- */

  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const [sheetNode, setSheetNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!sheetNode) return;
    sheetNode
      .querySelector<HTMLElement>('[aria-current="true"], button')
      ?.focus();
  }, [sheetNode]);
  const closeSheet = (restore: boolean) => {
    setSheetOpen(false);
    if (!restore) return;
    // The trigger lives in the car: after a trip the live car has a new one,
    // and the old car's is inert, so look it up in the live car on the next
    // frame rather than trusting a node remembered before the switch.
    window.requestAnimationFrame(() => {
      const live = document
        .getElementById(regionId)
        ?.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]');
      const t = trigger.current;
      (live ?? (t && t.isConnected ? t : null))?.focus();
    });
  };

  /* -------------------------------- render ------------------------------- */

  const accentInk = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as WorkspaceLiftAccentName]
    : accent;
  const tint = ws?.color ?? "var(--hairline)";
  const icon = clamp(stripWidth - 22, 26, 44);
  const slot = icon + 10;

  const carFor = (w: LiftWorkspace, live: boolean) => (
    <Car
      ws={w}
      floor={workspaces.indexOf(w) + 1}
      floors={workspaces.length}
      pageId={pageFor(w)}
      onNavigate={navigate}
      onOpenSheet={() => setSheetOpen(true)}
      sheetOpen={sheetOpen}
      sheetTrigger={live ? trigger : null}
      onRequestAccess={(id) => {
        setRequested((r) => ({ ...r, [id]: true }));
        onRequestAccess?.(id);
        setAnnouncement(`Access requested for ${w.name}.`);
      }}
      requested={!!requested[w.id]}
      user={user}
      uid={uid}
      regionId={regionId}
      live={live}
      motionSafe={motionSafe}
      disabled={disabled}
      dir={floorDir}
    />
  );

  const fromWs = transit
    ? (workspaces.find((w) => w.id === transit.from) ?? null)
    : null;

  return (
    <section
      aria-label={title}
      onKeyDown={onFrameKey}
      className={cn(
        "@container relative flex w-full overflow-hidden rounded-4 border bg-card text-foreground",
        className,
      )}
      style={
        {
          height: frameHeight,
          borderColor: `color-mix(in oklab, ${tint} 38%, var(--hairline))`,
          transition: `border-color ${durations.base}s ease`,
          "--wl-ink": accentInk,
          "--wl-wash": "color-mix(in oklab, var(--wl-ink) 11%, transparent)",
          "--wl-soft": "color-mix(in oklab, var(--wl-ink) 30%, transparent)",
        } as React.CSSProperties
      }
    >
      {/* The strip: every workspace, its unread count, and the one you are in. */}
      <div
        className="relative hidden shrink-0 flex-col items-center gap-2.5 border-r border-hairline py-3 @[34rem]:flex"
        style={{
          width: clamp(stripWidth, 40, 96),
          backgroundColor: `color-mix(in oklab, ${tint} 9%, var(--surface-1))`,
          transition: `background-color ${durations.base}s ease`,
        }}
      >
        <motion.span
          aria-hidden
          className="absolute left-0 w-[3px] rounded-r-full"
          style={{ top: 12, height: icon, backgroundColor: tint }}
          initial={false}
          animate={{ y: index * slot }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
        <div
          role="tablist"
          aria-label="Workspaces"
          aria-orientation="vertical"
          onKeyDown={onStripKey}
          className="flex flex-col items-center gap-2.5"
        >
          {workspaces.map((w, i) => {
            const on = i === index;
            const unread = unreadOf(w);
            return (
              <button
                key={w.id}
                ref={(el) => {
                  if (el) tabs.current.set(w.id, el);
                  else tabs.current.delete(w.id);
                }}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={regionId}
                aria-label={`${w.name}${w.status === "locked" ? ", no access" : unread > 0 ? `, ${unread} unread` : ""}`}
                aria-keyshortcuts={
                  shortcuts && i < 9
                    ? `Meta+${i + 1} Control+${i + 1}`
                    : undefined
                }
                title={`${w.name}${shortcuts && i < 9 ? ` · ⌘${i + 1}` : ""}`}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => switchTo(i)}
                className={cn(
                  "relative inline-flex shrink-0 items-center justify-center rounded-3 font-semibold text-white transition-[filter,transform] duration-150 active:scale-95",
                  !on && "saturate-[0.55] hover:saturate-100",
                  FOCUS,
                )}
                style={{
                  width: icon,
                  height: icon,
                  fontSize: Math.round(icon * 0.36),
                  backgroundColor: w.color,
                }}
              >
                <span aria-hidden>{w.initials}</span>
                {w.status === "locked" ? (
                  <span
                    aria-hidden
                    className="absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full border border-hairline bg-card text-ink-3"
                  >
                    <Lock className="size-2.5" />
                  </span>
                ) : unread > 0 ? (
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-surface-1 bg-foreground px-1 font-mono text-[9px] leading-none text-background tabular-nums"
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {onAddWorkspace ? (
          <button
            type="button"
            aria-label="Add a workspace"
            title="Add a workspace"
            disabled={disabled}
            onClick={() => onAddWorkspace()}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-3 border border-dashed border-hairline-strong text-ink-3 transition-colors hover:border-ink-3 hover:text-foreground",
              FOCUS,
            )}
            style={{ width: icon, height: icon }}
          >
            <Plus aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>

      {/* The shaft. */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 z-[3] h-[2px]"
          style={{
            backgroundColor: tint,
            transition: `background-color ${durations.base}s ease`,
          }}
        />
        {ws ? (
          // Strip order, never swapped: a car keeps its node for the whole
          // trip, and the stacking is z-index, not DOM order.
          workspaces
            .filter(
              (w) =>
                w.id === ws.id ||
                (transit !== null && fromWs !== null && w.id === fromWs.id),
            )
            .map((w) => {
              const live = w.id === ws.id;
              return (
                <motion.div
                  key={`car-${w.id}`}
                  className={cn(
                    "absolute inset-0",
                    // While riding, the arriving car shows its leading edge,
                    // so the seam reads as the top or bottom of a car.
                    live &&
                      transit &&
                      motionSafe &&
                      (transit.dir > 0
                        ? "shadow-[0_-1px_0_var(--hairline-strong),0_-12px_28px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                        : "shadow-[0_1px_0_var(--hairline-strong),0_12px_28px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"),
                  )}
                  style={{
                    y: live ? toY : fromY,
                    opacity: live ? toO : fromO,
                    zIndex: live ? 2 : 1,
                  }}
                >
                  {carFor(w, live)}
                </motion.div>
              );
            })
        ) : (
          <p className="p-6 text-[13px] text-ink-3">No workspaces yet.</p>
        )}

        <AnimatePresence>
          {sheetOpen ? (
            <>
              <motion.div
                key="scrim"
                aria-hidden
                className="absolute inset-0 z-[4] bg-[color-mix(in_oklab,var(--foreground)_18%,transparent)]"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: durations.base, ease: easings.enter },
                }}
                exit={{ opacity: 0, transition: exitFor(durations.base) }}
                onClick={() => closeSheet(true)}
              />
              <motion.div
                key="sheet"
                ref={setSheetNode}
                id={sheetId}
                role="dialog"
                aria-modal="true"
                aria-label="Switch workspace"
                className="absolute inset-x-2 top-12 z-[5] flex flex-col gap-1 rounded-3 border border-hairline bg-popover p-1.5 shadow-[0_12px_32px_color-mix(in_oklab,var(--foreground)_16%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: motionSafe
                    ? springs.snap
                    : { duration: durations.fast },
                }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.nudge : 0,
                  transition: exitFor(durations.base),
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeSheet(true);
                    return;
                  }
                  const buttons = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button:not([disabled])",
                    ),
                  ];
                  const at = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    const n = buttons.length;
                    buttons[
                      (at + (event.key === "ArrowDown" ? 1 : -1) + n) % n
                    ]?.focus();
                  } else if (event.key === "Tab") {
                    // The sheet keeps focus until it is closed.
                    event.preventDefault();
                    const n = buttons.length;
                    buttons[(at + (event.shiftKey ? -1 : 1) + n) % n]?.focus();
                  }
                }}
              >
                <p className="px-2 pt-1 pb-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                  Workspaces
                </p>
                {workspaces.map((w, i) => {
                  const on = i === index;
                  const unread = unreadOf(w);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => {
                        switchTo(i);
                        closeSheet(true);
                      }}
                      className={cn(
                        "flex h-10 items-center gap-2.5 rounded-2 px-2 text-left text-[13px]",
                        on ? "bg-[var(--wl-wash)]" : "hover:bg-surface-2",
                        FOCUS_IN,
                      )}
                    >
                      <span
                        aria-hidden
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: w.color }}
                      >
                        {w.initials}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {w.name}
                      </span>
                      {w.status === "locked" ? (
                        <Lock
                          aria-label="No access"
                          className="size-3.5 shrink-0 text-ink-3"
                        />
                      ) : unread > 0 ? (
                        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                          {unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                {onAddWorkspace ? (
                  <button
                    type="button"
                    onClick={() => {
                      closeSheet(true);
                      onAddWorkspace();
                    }}
                    className={cn(
                      "flex h-9 items-center gap-2.5 rounded-2 px-2 text-left text-[12.5px] text-ink-2 hover:bg-surface-2",
                      FOCUS_IN,
                    )}
                  >
                    <Plus aria-hidden className="size-4 shrink-0" />
                    Add a workspace
                  </button>
                ) : null}
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
