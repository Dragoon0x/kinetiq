"use client";

import * as React from "react";

import { ChevronLeft, UsersRound } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ListDetailAvatar = {
  /** One or two letters. */
  initials?: string;
  /** Any CSS colour — a token, never a hex. @default "var(--accent-bright)" */
  tint?: string;
  /** Drawn instead of the initials, in currentColor. */
  icon?: React.ReactNode;
};

export type ListDetailBlock =
  | { kind: "text"; id: string; title?: string; text: string }
  | {
      kind: "fields";
      id: string;
      title?: string;
      fields: { label: string; value: string }[];
    }
  | {
      kind: "list";
      id: string;
      title?: string;
      items: { id: string; label: string; meta?: string }[];
    }
  | {
      kind: "actions";
      id: string;
      actions: { id: string; label: string; primary?: boolean }[];
    };

export type ListDetailItem = {
  id: string;
  /** The row's first line; the detail's heading. */
  title: string;
  /** The row's second line; under the heading. */
  subtitle?: string;
  /** A short note at the row's end; beside the subtitle in the detail. */
  meta?: string;
  avatar?: ListDetailAvatar;
  /** A one-word state shown under the meta and beside the heading. */
  badge?: string;
  /** The detail's body, block by block. */
  blocks?: ListDetailBlock[];
};

export type ListDetailMorph = "glide" | "arc" | "fade";
export type ListDetailSplit = "auto" | "stack" | "rail";
export type ListDetailSize = "sm" | "md" | "lg";
export type ListDetailLayout = "split" | "stack";

export type ListDetailProps = {
  /** The list, in order. @default defaultListDetailItems */
  items?: ListDetailItem[];
  /** Controlled: the chosen item's id, or null for none. */
  value?: string | null;
  /** The item chosen at first when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the press, key or Back that changed the choice. */
  onValueChange?: (id: string | null) => void;
  /** An action button in the detail was pressed. */
  onAction?: (actionId: string, itemId: string) => void;
  /** Fires when the layout moves between stacked and side by side (a resize or `split`), and once when first measured. */
  onLayoutChange?: (layout: ListDetailLayout) => void;
  /** The list's name: its heading, and where Back goes. @default "People" */
  label?: string;
  /** How the row's avatar, title and meta travel to the detail header: straight on glide, on a curve, or not at all. @default "arc" */
  morph?: ListDetailMorph;
  /** The wait between one body block arriving and the next, in ms. 0 brings the body in at once. @default 50 */
  stream?: number;
  /** How list and detail share the box: side by side from 36rem of width (stacked below), always stacked, or always side by side with the list as a rail of avatars. @default "auto" */
  split?: ListDetailSplit;
  /** The list's width when side by side, in px. @default 280 */
  listWidth?: number;
  /** The component's height: px or any CSS length. @default 480 */
  height?: number | string;
  /** What the detail says side by side with nothing chosen. @default "Choose someone to see their details." */
  emptyLabel?: string;
  /** Replaces the block body with your own detail. */
  renderDetail?: (item: ListDetailItem) => React.ReactNode;
  /** Row height 48, 56 or 64px. @default "md" */
  size?: ListDetailSize;
  /** The selection rule and the chosen row's wash: any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play the click of a choice and the swish of the page. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const block = {
  actions: (...labels: string[]): ListDetailBlock => ({
    kind: "actions",
    id: "actions",
    actions: labels.map((label, i) => ({
      id: label.toLowerCase(),
      label,
      primary: i === 0,
    })),
  }),
  about: (text: string): ListDetailBlock => ({
    kind: "text",
    id: "about",
    title: "About",
    text,
  }),
  details: (fields: [string, string][]): ListDetailBlock => ({
    kind: "fields",
    id: "details",
    title: "Details",
    fields: fields.map(([label, value]) => ({ label, value })),
  }),
  work: (items: [string, string][]): ListDetailBlock => ({
    kind: "list",
    id: "work",
    title: "Working on",
    items: items.map(([label, meta], i) => ({ id: `w${i}`, label, meta })),
  }),
};

/** The Fernworks team: seven people, each with a page. */
export const defaultListDetailItems: ListDetailItem[] = [
  {
    id: "ines",
    title: "Ines Okafor",
    subtitle: "Design lead",
    meta: "Lisbon",
    avatar: { initials: "IO", tint: "var(--accent-bright)" },
    blocks: [
      block.actions("Message", "Schedule"),
      block.about(
        "Leads the design systems group. Ask her about the component audit, the spacing scale, or anything that has to look right on a phone.",
      ),
      block.details([
        ["Team", "Design systems"],
        ["Reports to", "Amara Lindqvist"],
        ["Local time", "14:20, UTC+1"],
        ["Joined", "March 2023"],
      ]),
      block.work([
        ["Component audit", "Due Friday"],
        ["Spacing scale v2", "In review"],
        ["Onboarding screens", "Drafting"],
      ]),
    ],
  },
  {
    id: "tomas",
    title: "Tomas Reyes",
    subtitle: "Platform engineer",
    meta: "Mexico City",
    avatar: { initials: "TR", tint: "var(--signal)" },
    blocks: [
      block.actions("Message", "Schedule"),
      block.about(
        "Keeps the build fast and the deploys boring. On call this week for the payments services.",
      ),
      block.details([
        ["Team", "Platform"],
        ["Reports to", "Lucas Ferreira"],
        ["Local time", "07:20, UTC−6"],
        ["Joined", "August 2021"],
      ]),
      block.work([
        ["Build cache", "Shipped"],
        ["Deploy previews", "In progress"],
        ["Payments on-call", "This week"],
      ]),
    ],
  },
  {
    id: "amara",
    title: "Amara Lindqvist",
    subtitle: "Product manager",
    meta: "Stockholm",
    avatar: { initials: "AL", tint: "var(--warn)" },
    blocks: [
      block.actions("Message", "Schedule"),
      block.about(
        "Owns the workspace roadmap. Runs the Thursday review and writes the notes everyone actually reads.",
      ),
      block.details([
        ["Team", "Workspace"],
        ["Reports to", "Hana Kovac"],
        ["Local time", "15:20, UTC+2"],
        ["Joined", "January 2022"],
      ]),
      block.work([
        ["Q4 roadmap", "Final draft"],
        ["Pricing research", "Interviews"],
        ["Thursday review", "Weekly"],
      ]),
    ],
  },
  {
    id: "kenji",
    title: "Kenji Mori",
    subtitle: "Data scientist",
    meta: "Osaka",
    badge: "Away",
    avatar: { initials: "KM", tint: "var(--success)" },
    blocks: [
      block.actions("Message", "Schedule"),
      block.about(
        "Builds the forecasting models behind the usage reports. Away until Monday; Priya covers his requests.",
      ),
      block.details([
        ["Team", "Insights"],
        ["Reports to", "Amara Lindqvist"],
        ["Local time", "22:20, UTC+9"],
        ["Joined", "May 2024"],
      ]),
      block.work([
        ["Usage forecast", "Paused"],
        ["Churn signals", "Exploring"],
        ["Data dictionary", "Ongoing"],
      ]),
    ],
  },
  {
    id: "priya",
    title: "Priya Natarajan",
    subtitle: "Head of support",
    meta: "Pune",
    avatar: { initials: "PN", tint: "var(--danger)" },
    blocks: [
      block.actions("Message", "Schedule"),
      block.about(
        "Runs a team of nine across three time zones. Median first reply this month: 11 minutes.",
      ),
      block.details([
        ["Team", "Support"],
        ["Reports to", "Hana Kovac"],
        ["Local time", "18:50, UTC+5:30"],
        ["Joined", "October 2020"],
      ]),
      block.work([
        ["Help centre rewrite", "40% done"],
        ["Escalation rota", "Live"],
        ["Kenji's requests", "Covering"],
      ]),
    ],
  },
  {
    id: "lucas",
    title: "Lucas Ferreira",
    subtitle: "Security engineer",
    meta: "Porto",
    avatar: { initials: "LF", tint: "var(--accent-bright)" },
    blocks: [
      block.actions("Message", "Schedule"),
      block.about(
        "Reviews every change that touches sign-in or money. Prefers a written threat model to a meeting.",
      ),
      block.details([
        ["Team", "Security"],
        ["Reports to", "Hana Kovac"],
        ["Local time", "14:20, UTC+1"],
        ["Joined", "June 2022"],
      ]),
      block.work([
        ["Key rotation", "Scheduled"],
        ["SSO hardening", "In review"],
        ["Pen test findings", "3 open"],
      ]),
    ],
  },
  {
    id: "hana",
    title: "Hana Kovac",
    subtitle: "Finance partner",
    meta: "Zagreb",
    avatar: { initials: "HK", tint: "var(--signal)" },
    blocks: [
      block.actions("Message", "Schedule"),
      block.about(
        "Partners with every team lead on budgets and headcount. Closes the books on the third working day.",
      ),
      block.details([
        ["Team", "Finance"],
        ["Reports to", "Board"],
        ["Local time", "15:20, UTC+2"],
        ["Joined", "February 2020"],
      ]),
      block.work([
        ["Q3 close", "Done"],
        ["2027 budget", "Collecting"],
        ["Vendor review", "Next week"],
      ]),
    ],
  },
];

const PARTS = ["avatar", "title", "subtitle", "meta"] as const;
type Part = (typeof PARTS)[number];
type Box = { left: number; top: number; width: number; height: number };
type Boxes = Partial<Record<Part, Box & { font: number }>>;

const SPLIT_AT: Record<ListDetailSplit, number> = {
  auto: 576,
  stack: Number.POSITIVE_INFINITY,
  rail: 0,
};

/**
 * The static layout per split mode, as container queries, so the server
 * render is already right at any width. `!` beats the inline opacity the
 * stacked choreography writes: side by side, both panes always show.
 */
const LIST_PANE: Record<ListDetailSplit, string> = {
  auto: "@min-[36rem]/list-detail:relative @min-[36rem]/list-detail:inset-auto @min-[36rem]/list-detail:w-[var(--list-detail-list)] @min-[36rem]/list-detail:shrink-0 @min-[36rem]/list-detail:border-r @min-[36rem]/list-detail:opacity-100!",
  rail: "relative inset-auto w-[4.5rem] shrink-0 border-r opacity-100!",
  stack: "",
};
const DETAIL_PANE: Record<ListDetailSplit, string> = {
  auto: "@min-[36rem]/list-detail:relative @min-[36rem]/list-detail:inset-auto @min-[36rem]/list-detail:min-w-0 @min-[36rem]/list-detail:flex-1 @min-[36rem]/list-detail:opacity-100! @min-[36rem]/list-detail:pointer-events-auto",
  rail: "relative inset-auto min-w-0 flex-1 opacity-100! pointer-events-auto",
  stack: "",
};
const STACK_ONLY: Record<ListDetailSplit, string> = {
  auto: "@min-[36rem]/list-detail:hidden",
  rail: "hidden",
  stack: "",
};
const SPLIT_ONLY: Record<ListDetailSplit, string> = {
  auto: "hidden @min-[36rem]/list-detail:flex",
  rail: "flex",
  stack: "hidden",
};

const ROWS: Record<ListDetailSize, { row: string; avatar: string }> = {
  sm: { row: "h-12", avatar: "size-7 text-[11px]" },
  md: { row: "h-14", avatar: "size-8 text-xs" },
  lg: { row: "h-16", avatar: "size-9 text-[13px]" },
};

/** The header's avatar, a size down in a narrow box; its ghost matches. */
const HEAD_AVATAR =
  "size-14 text-lg @max-[30rem]/list-detail:size-11 @max-[30rem]/list-detail:text-base";

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A layout box inside `root` from the offset chain: transforms are ignored,
 * so a part in mid-flight never corrupts a measurement, and the scroll of
 * every container on the way is taken off.
 */
function boxIn(el: HTMLElement, root: HTMLElement): Box {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (!parent) break;
    if (parent !== root) {
      x += parent.clientLeft - parent.scrollLeft;
      y += parent.clientTop - parent.scrollTop;
    }
    node = parent;
  }
  return { left: x, top: y, width: el.offsetWidth, height: el.offsetHeight };
}

function partsIn(scope: HTMLElement | null | undefined, root: HTMLElement) {
  const out: Boxes = {};
  if (!scope) return out;
  for (const part of PARTS) {
    const el = scope.querySelector<HTMLElement>(`[data-part="${part}"]`);
    // A part that is not laid out (a rail hides all but the avatar) has no
    // box to fly from: its header copy fades in instead.
    if (!el || el.offsetParent === null) continue;
    const font = Number.parseFloat(getComputedStyle(el).fontSize) || 14;
    out[part] = { ...boxIn(el, root), font };
  }
  return out;
}

/** An option's name: the row read as one sentence, even as a rail. */
const nameOf = (item: ListDetailItem) =>
  [item.title, item.subtitle, item.meta, item.badge].filter(Boolean).join(", ");

/** How much smaller the part is at `from` than at `to`. */
const ratio = (
  part: Part,
  from: Box & { font: number },
  to: Box & { font: number },
) =>
  part === "avatar"
    ? from.height / Math.max(1, to.height)
    : from.font / Math.max(1, to.font);

type PartMotion = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  opacity: MotionValue<number>;
};

function usePartMotion(opacity = 1): PartMotion {
  return {
    x: useMotionValue(0),
    y: useMotionValue(0),
    scale: useMotionValue(1),
    opacity: useMotionValue(opacity),
  };
}

function Avatar({
  item,
  className,
}: {
  item: ListDetailItem;
  className?: string;
}) {
  const tint = item.avatar?.tint ?? "var(--accent-bright)";
  const initials =
    item.avatar?.initials ??
    item.title
      .split(/\s+/)
      .map((w) => w.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        className,
      )}
      style={{
        color: tint,
        background: `color-mix(in oklab, ${tint} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tint} 28%, transparent)`,
      }}
    >
      {item.avatar?.icon ?? initials}
    </span>
  );
}

type View = {
  /** The `current` this view was worked out for. */
  target: string | null;
  /** The item in the detail. */
  shown: string | null;
  /** Stacked, going back: this item's page is folding into its row. */
  leaving: string | null;
  /** The item shown before this change. */
  prev: string | null;
  /** The detail was off screen (the list showed) when this change began. */
  fromList: boolean;
  /** Changes since mount: the first render never streams in. */
  seq: number;
  /** What the change says, frozen from the new value as it happened. */
  said: string;
};

/**
 * A master list whose chosen row becomes the page. The row's avatar, title,
 * subtitle and meta lift off and fly to their places in the detail header —
 * measured boxes, transformed from the row's size to the header's — while the
 * body streams in under them a block at a time; Back flies them home.
 *
 * Stacked (a narrow box), the row's own surface grows from its rectangle to
 * fill the box on the glide spring as its colour turns from the row's to the
 * page's, and the list fades away under it; going back runs it in reverse
 * and the row's parts reappear the frame their copies land. Side by side, the
 * chosen row's parts fly across into the detail while the previous header
 * flies back to its own row and fades as it lands, and a rule slides down
 * the list on the snap spring. With `morph="arc"` each part's x runs on snap
 * and its y on glide, so it travels a curve.
 *
 * The list is a listbox: Up and Down move, Home and End jump, Enter or Space
 * chooses. Stacked, focus moves to the detail's heading, and Back, Escape or
 * Alt+Left bring it home to the row. Side by side, Escape in the detail goes
 * back to the chosen row. Under reduced motion nothing flies or grows: the
 * header and body fade in place, in order, and the choice still lands.
 */
export function ListDetail({
  items = defaultListDetailItems,
  value,
  defaultValue = null,
  onValueChange,
  onAction,
  onLayoutChange,
  label = "People",
  morph = "arc",
  stream = 50,
  split = "auto",
  listWidth = 280,
  height = 480,
  emptyLabel = "Choose someone to see their details.",
  renderDetail,
  size = "md",
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: ListDetailProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const titleId = `${uid}-title`;
  const detailId = `${uid}-detail`;
  const row = ROWS[size] ?? ROWS.md;
  const rail = split === "rail";
  const flies = motionSafe && morph !== "fade";

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const asked = value !== undefined ? value : own;
  const current =
    asked !== null && items.some((i) => i.id === asked) ? asked : null;

  const [width, setWidth] = React.useState<number | null>(null);
  const layout: ListDetailLayout | null =
    width === null ? null : width >= SPLIT_AT[split] ? "split" : "stack";
  const stacked = layout !== "split";

  const [view, setView] = React.useState<View>({
    target: current,
    shown: current,
    leaving: null,
    prev: null,
    fromList: false,
    seq: 0,
    said: "",
  });
  if (view.target !== current) {
    const fromList = view.shown === null || view.leaving !== null;
    const next = items.find((i) => i.id === current);
    if (current === null || !next) {
      setView({
        target: null,
        shown: stacked ? view.shown : null,
        leaving: stacked ? view.shown : null,
        prev: view.shown,
        fromList: false,
        seq: view.seq + 1,
        said: `Back to ${label}.`,
      });
    } else {
      setView({
        target: current,
        shown: current,
        leaving: null,
        prev: view.leaving ?? view.shown,
        fromList,
        seq: view.seq + 1,
        said: `Showing ${next.title}${next.subtitle ? `, ${next.subtitle}` : ""}.`,
      });
    }
  }

  const shownItem = items.find((i) => i.id === view.shown) ?? null;
  const prevItem = items.find((i) => i.id === view.prev) ?? null;
  const covered = layout === "stack" && view.shown !== null && !view.leaving;

  const [active, setActive] = React.useState<string | null>(null);
  const roving =
    active !== null && items.some((i) => i.id === active)
      ? active
      : (current ?? items[0]?.id ?? null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const headerRef = React.useRef<HTMLDivElement | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const ghostRef = React.useRef<HTMLDivElement | null>(null);
  const rows = React.useRef(new Map<string, HTMLDivElement>());
  const headerBoxes = React.useRef(new Map<string, Boxes>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const observer = React.useRef<ResizeObserver | null>(null);
  const reported = React.useRef<ListDetailLayout | null>(null);
  const focusAfter = React.useRef<"heading" | "row" | null>(null);
  const api = React.useRef<{
    measure: (w: number) => void;
    land: (seq: number) => void;
  } | null>(null);

  const listOpacity = useMotionValue(view.shown !== null ? 0 : 1);
  const detailOpacity = useMotionValue(view.shown !== null ? 1 : 0);
  const bodyOpacity = useMotionValue(1);
  const extras = useMotionValue(1);
  const surfaceOpacity = useMotionValue(view.shown !== null ? 1 : 0);
  const sTop = useMotionValue(0);
  const sRight = useMotionValue(0);
  const sBottom = useMotionValue(0);
  const sLeft = useMotionValue(0);
  const sRadius = useMotionValue(0);
  const sTone = useMotionValue(1);
  const ruleY = useMotionValue(0);
  const ruleH = useMotionValue(0);
  const ruleOpacity = useMotionValue(0);
  const avatarM = usePartMotion();
  const titleM = usePartMotion();
  const subtitleM = usePartMotion();
  const metaM = usePartMotion();
  const ghostAvatar = usePartMotion(0);
  const ghostTitle = usePartMotion(0);
  const ghostSubtitle = usePartMotion(0);
  const ghostMeta = usePartMotion(0);
  const ghostTitleW = useMotionValue(0);
  const ghostSubtitleW = useMotionValue(0);

  // Derived values are declared before the layout effects that move their
  // sources: each commit re-subscribes them in declaration order.
  const clip = useTransform(
    [sTop, sRight, sBottom, sLeft, sRadius] as MotionValue<number>[],
    ([t = 0, r = 0, b = 0, l = 0, rad = 0]: number[]) =>
      `inset(${r2(t)}px ${r2(r)}px ${r2(b)}px ${r2(l)}px round ${r2(rad)}px)`,
  );
  const surfaceTint = useTransform(
    sTone,
    (k) =>
      `color-mix(in oklab, var(--bg-2) ${Math.round((1 - Math.min(1, Math.max(0, k))) * 100)}%, var(--card))`,
  );

  const heads: Record<Part, PartMotion> = {
    avatar: avatarM,
    title: titleM,
    subtitle: subtitleM,
    meta: metaM,
  };
  const ghosts: Record<Part, PartMotion> = {
    avatar: ghostAvatar,
    title: ghostTitle,
    subtitle: ghostSubtitle,
    meta: ghostMeta,
  };

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const stopAll = () => {
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
  };

  /* ---------------------------- measurement ---------------------------- */

  const measure = (w: number) => {
    setWidth((old) => (old === w ? old : w));
  };

  const bindRoot = (node: HTMLDivElement | null) => {
    if (rootRef.current === node) return;
    observer.current?.disconnect();
    observer.current = null;
    rootRef.current = node;
    if (!node || typeof ResizeObserver === "undefined") return;
    observer.current = new ResizeObserver(() =>
      api.current?.measure(node.clientWidth),
    );
    observer.current.observe(node);
  };

  /* ---------------------------- choreography --------------------------- */

  const tween = (ms: number, delay = 0) => ({
    duration: ms,
    ease: easings.enter,
    delay,
  });

  /** Every value at rest for the view and layout as they are now. */
  const settle = () => {
    stopAll();
    const pane = layout === "stack" && view.shown !== null;
    listOpacity.jump(pane ? 0 : 1);
    detailOpacity.jump(view.shown !== null ? 1 : 0);
    bodyOpacity.jump(1);
    extras.jump(1);
    surfaceOpacity.jump(pane ? 1 : 0);
    for (const mv of [sTop, sRight, sBottom, sLeft, sRadius]) mv.jump(0);
    sTone.jump(1);
    for (const part of PARTS) {
      heads[part].x.jump(0);
      heads[part].y.jump(0);
      heads[part].scale.jump(1);
      heads[part].opacity.jump(1);
      ghosts[part].opacity.jump(0);
    }
  };

  /** The rule beside the chosen row. */
  const placeRule = (id: string | null, animated: boolean) => {
    const node = id ? rows.current.get(id) : undefined;
    if (!node) {
      run("rule", animate(ruleOpacity, 0, { duration: durations.fast }));
      return;
    }
    const y = node.offsetTop + 10;
    const h = Math.max(8, node.offsetHeight - 20);
    if (animated && motionSafe && ruleOpacity.get() > 0.05) {
      run("ruleY", animate(ruleY, y, springs.snap));
      run("ruleH", animate(ruleH, h, springs.snap));
    } else {
      ruleY.jump(y);
      ruleH.jump(h);
    }
    run("rule", animate(ruleOpacity, 1, { duration: durations.fast }));
  };

  /** Springs for one part of a flight, by morph and by order. */
  const flight = (i: number) => {
    const delay = morph === "arc" ? i * 0.03 : 0;
    return {
      x: { ...(morph === "arc" ? springs.snap : springs.glide), delay },
      y: { ...springs.glide, delay },
      scale: { ...springs.glide, delay },
    };
  };

  /** Header parts start on the row's parts and spring home. */
  const flyIn = (from: Boxes, to: Boxes) => {
    // The separator and the badge have no row to come from: they fade in
    // once the parts are nearly home.
    extras.jump(0);
    run(
      "extras",
      animate(extras, 1, tween(durations.base, flies ? 0.22 : 0.08)),
    );
    PARTS.forEach((part, i) => {
      const m = heads[part];
      const a = from[part];
      const b = to[part];
      if (!flies || !a || !b) {
        m.x.jump(0);
        m.y.jump(0);
        m.scale.jump(1);
        m.opacity.jump(0);
        run(
          `${part}-o`,
          animate(m.opacity, 1, tween(durations.base, 0.04 * i)),
        );
        return;
      }
      const s = flight(i);
      m.opacity.jump(1);
      m.x.jump(r2(a.left - b.left));
      m.y.jump(r2(a.top - b.top));
      m.scale.jump(r4(ratio(part, a, b)));
      run(`${part}-x`, animate(m.x, 0, s.x));
      run(`${part}-y`, animate(m.y, 0, s.y));
      run(`${part}-s`, animate(m.scale, 1, s.scale));
    });
  };

  /**
   * Header parts fly from their places to the row's parts; `done` runs once
   * every one of them (and anything else counted in) has landed.
   */
  const flyOut = (from: Boxes, to: Boxes, done: () => void) => {
    run("extras", animate(extras, 0, tween(durations.fast)));
    PARTS.forEach((part, i) => {
      const m = heads[part];
      const a = from[part];
      const b = to[part];
      if (!flies || !a || !b) {
        run(`${part}-o`, animate(m.opacity, 0, tween(durations.fast)));
        return;
      }
      const s = flight(i);
      run(`${part}-x`, animate(m.x, r2(b.left - a.left), s.x));
      run(
        `${part}-y`,
        animate(m.y, r2(b.top - a.top), { ...s.y, onComplete: done }),
      );
      run(`${part}-s`, animate(m.scale, r4(ratio(part, b, a)), s.scale));
    });
  };

  /** Side by side: the previous header flies back to its row as a ghost. */
  const ghostHome = (from: Boxes, to: Boxes) => {
    if (!ghostRef.current || !flies) return;
    PARTS.forEach((part, i) => {
      const m = ghosts[part];
      const a = from[part];
      const b = to[part];
      if (!a || !b) {
        m.opacity.jump(0);
        return;
      }
      // Ghosts sit at the box's origin and carry their whole position in x
      // and y, so they need no layout of their own.
      if (part === "title") ghostTitleW.jump(r2(a.width));
      if (part === "subtitle") ghostSubtitleW.jump(r2(a.width));
      const s = flight(i);
      m.x.jump(r2(a.left));
      m.y.jump(r2(a.top));
      m.scale.jump(1);
      m.opacity.jump(1);
      run(`g-${part}-x`, animate(m.x, r2(b.left), s.x));
      run(`g-${part}-y`, animate(m.y, r2(b.top), s.y));
      run(`g-${part}-s`, animate(m.scale, r4(ratio(part, b, a)), s.scale));
      run(
        `g-${part}-o`,
        animate(m.opacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
          delay: 0.22 + 0.03 * i,
        }),
      );
    });
  };

  /** The page's surface at rest: full and opaque, or gone. */
  const settleSurface = (on: boolean) => {
    for (const mv of [sTop, sRight, sBottom, sLeft, sRadius]) mv.jump(0);
    sTone.jump(1);
    surfaceOpacity.jump(on ? 1 : 0);
  };

  /** The stacked back flight has landed: the detail goes. */
  const land = (seq: number) => {
    if (view.seq !== seq) return;
    // The surface has shrunk onto the row and the parts sit on the row's
    // own: both go in the frame the row's parts come back.
    settleSurface(false);
    detailOpacity.jump(0);
    setView((v) =>
      v.seq === seq && v.leaving !== null
        ? { ...v, shown: null, leaving: null }
        : v,
    );
  };

  const rootBox = () => {
    const root = rootRef.current;
    return root ? { w: root.clientWidth, h: root.clientHeight } : null;
  };

  React.useLayoutEffect(() => {
    api.current = { measure, land };
  });

  // Measured on arrival, before the first paint, so a client render never
  // shows the wrong choreography; observed again after StrictMode's cleanup.
  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    api.current?.measure(node.clientWidth);
    if (!observer.current && typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(() =>
        api.current?.measure(node.clientWidth),
      );
      observer.current.observe(node);
    }
    const running = anims.current;
    return () => {
      observer.current?.disconnect();
      observer.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // The choreography for each change of view. Measured after commit, from
  // layout boxes, so nothing in flight skews where anything lands.
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const seq = view.seq;
    const mode = layout ?? "stack";
    const shownRow = view.shown ? rows.current.get(view.shown) : undefined;
    const header = headerRef.current;

    if (seq === 0) {
      settle();
      placeRule(current, false);
      return;
    }

    if (view.leaving !== null) {
      // Stacked, going back: the page folds into its row.
      stopAll();
      const id = view.leaving;
      const node = rows.current.get(id);
      if (node) node.scrollIntoView({ block: "nearest" });
      const from = partsIn(header, root);
      const to = partsIn(node, root);
      const box = rootBox();
      run(
        "body",
        animate(bodyOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      run("list", animate(listOpacity, 1, tween(durations.base, 0.06)));
      placeRule(null, false);
      // The page goes once the surface and every flying part have landed,
      // so the row's own parts reappear exactly under their copies.
      let waiting =
        1 + (flies && node ? PARTS.filter((p) => from[p] && to[p]).length : 0);
      const done = () => {
        waiting -= 1;
        if (waiting === 0) api.current?.land(seq);
      };
      flyOut(from, to, done);
      if (flies && node && box) {
        const b = boxIn(node, root);
        const edges: [string, MotionValue<number>, number][] = [
          ["sTop", sTop, b.top],
          ["sLeft", sLeft, b.left],
          ["sRight", sRight, box.w - b.left - b.width],
          ["sRadius", sRadius, 6],
        ];
        for (const [key, mv, to] of edges) {
          run(key, animate(mv, r2(to), springs.glide));
        }
        run(
          "sTone",
          animate(sTone, 0, { duration: durations.slow, ease: easings.move }),
        );
        run(
          "sBottom",
          animate(sBottom, r2(box.h - b.top - b.height), {
            ...springs.glide,
            onComplete: done,
          }),
        );
      } else {
        run(
          "surface",
          animate(surfaceOpacity, 0, {
            duration: durations.base,
            ease: easings.exit,
            onComplete: done,
          }),
        );
      }
      if (focusAfter.current === "row") {
        focusAfter.current = null;
        node?.focus({ preventScroll: true });
      }
      return;
    }

    if (view.shown === null) {
      // Side by side, chosen nothing: the old header flies home.
      if (mode === "split" && view.prev) {
        const cached = headerBoxes.current.get(view.prev);
        const node = rows.current.get(view.prev);
        if (cached && node) ghostHome(cached, partsIn(node, root));
      }
      placeRule(null, true);
      settleSurface(false);
      return;
    }

    // Something new is shown.
    stopAll();
    for (const part of PARTS) ghosts[part].opacity.jump(0);
    const to = partsIn(header, root);
    headerBoxes.current.set(view.shown, to);
    placeRule(view.shown, mode === "split");

    if (mode === "stack") {
      detailOpacity.jump(1);
      if (view.fromList && shownRow) {
        const from = partsIn(shownRow, root);
        const b = boxIn(shownRow, root);
        const box = rootBox();
        bodyOpacity.jump(0);
        run("body", animate(bodyOpacity, 1, tween(durations.base, 0.08)));
        run(
          "list",
          animate(listOpacity, 0, {
            duration: durations.base,
            ease: easings.exit,
          }),
        );
        if (flies && box) {
          surfaceOpacity.jump(1);
          sTop.jump(r2(b.top));
          sLeft.jump(r2(b.left));
          sRight.jump(r2(box.w - b.left - b.width));
          sBottom.jump(r2(box.h - b.top - b.height));
          sRadius.jump(6);
          sTone.jump(0);
          const edges: [string, MotionValue<number>][] = [
            ["sTop", sTop],
            ["sRight", sRight],
            ["sBottom", sBottom],
            ["sLeft", sLeft],
            ["sRadius", sRadius],
          ];
          for (const [key, mv] of edges)
            run(key, animate(mv, 0, springs.glide));
          run(
            "sTone",
            animate(sTone, 1, { duration: durations.slow, ease: easings.move }),
          );
        } else {
          for (const mv of [sTop, sRight, sBottom, sLeft, sRadius]) mv.jump(0);
          sTone.jump(1);
          surfaceOpacity.jump(0);
          run("surface", animate(surfaceOpacity, 1, tween(durations.base)));
        }
        flyIn(from, to);
      } else {
        // From one page straight to another: no row to come from.
        settleSurface(true);
        listOpacity.jump(0);
        bodyOpacity.jump(1);
        flyIn({}, to);
      }
      if (focusAfter.current === "heading") {
        focusAfter.current = null;
        headingRef.current?.focus({ preventScroll: true });
      }
      return;
    }

    // Side by side: the chosen row's parts fly across, the previous header
    // flies home.
    settleSurface(false);
    listOpacity.jump(1);
    detailOpacity.jump(1);
    bodyOpacity.jump(1);
    flyIn(shownRow ? partsIn(shownRow, root) : {}, to);
    if (view.prev && view.prev !== view.shown) {
      const cached = headerBoxes.current.get(view.prev);
      const node = rows.current.get(view.prev);
      if (cached && node) ghostHome(cached, partsIn(node, root));
    }
    // One run per change of view; the values it reads are this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.seq]);

  // A change of layout (a resize across the split width) puts everything at
  // rest for the new arrangement.
  React.useLayoutEffect(() => {
    if (layout === null) return;
    settle();
    placeRule(view.leaving ? null : current, false);
    // Reported once per arrangement, whether a resize or the split prop
    // moved it.
    if (reported.current !== layout) {
      reported.current = layout;
      onLayoutChange?.(layout);
    }
    // Only a change of layout re-settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  /* ------------------------------ requests ----------------------------- */

  const choose = (id: string | null, via: "pointer" | "key") => {
    if (disabled) return;
    if (id === current) return;
    const index = id ? items.findIndex((i) => i.id === id) : -1;
    const item = index === -1 ? null : items[index];
    const inside = rootRef.current?.contains(document.activeElement) ?? false;
    if (item) {
      audio.play("click", {
        pitch: r2(1.2 - (0.3 * index) / Math.max(1, items.length - 1)),
        gain: 0.45,
      });
      audio.play("swish", {
        pitch: 1.1,
        gain: layout === "split" ? 0.22 : 0.34,
      });
      if (layout === "stack" && (inside || via === "key")) {
        focusAfter.current = "heading";
      }
    } else {
      audio.play("swish", { pitch: 0.85, gain: 0.26 });
      if (inside) focusAfter.current = "row";
    }
    if (value === undefined) setOwn(id);
    onValueChange?.(id);
  };

  const back = () => {
    if (current === null) return;
    if (layout === "split") {
      rows.current.get(current)?.focus();
      return;
    }
    choose(null, "key");
  };

  const focusRow = (index: number) => {
    const n = items.length;
    if (n === 0) return;
    const item = items[Math.min(n - 1, Math.max(0, index))];
    if (!item) return;
    setActive(item.id);
    rows.current.get(item.id)?.focus();
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    index: number,
    id: string,
  ) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusRow(index - 1);
        return;
      case "Home":
        event.preventDefault();
        focusRow(0);
        return;
      case "End":
        event.preventDefault();
        focusRow(items.length - 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(id, "key");
        return;
    }
  };

  /* -------------------------------- render ----------------------------- */

  const stepS = Math.max(0, stream) / 1000;
  const blocks = shownItem?.blocks ?? [];
  const interval = Math.min(stepS, 0.6 / Math.max(1, blocks.length - 1));
  const streamIn = view.seq > 0;

  const renderBlock = (b: ListDetailBlock, item: ListDetailItem) => {
    const heading = (title?: string) =>
      title ? (
        <h4 className="mb-2 font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase">
          {title}
        </h4>
      ) : null;
    switch (b.kind) {
      case "text":
        return (
          <>
            {heading(b.title)}
            <p className="max-w-prose text-[13px] leading-5 text-ink-2">
              {b.text}
            </p>
          </>
        );
      case "fields":
        return (
          <>
            {heading(b.title)}
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 @min-[26rem]/list-detail-body:grid-cols-2">
              {b.fields.map((f) => (
                <div key={f.label} className="min-w-0">
                  <dt className="text-[11px] leading-4 text-ink-3">
                    {f.label}
                  </dt>
                  <dd
                    title={f.value}
                    className="truncate text-[13px] leading-5 text-foreground"
                  >
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        );
      case "list":
        return (
          <>
            {heading(b.title)}
            <ul
              role="list"
              className="divide-y divide-hairline rounded-2 border border-hairline"
            >
              {b.items.map((it) => (
                <li
                  key={it.id}
                  className="flex h-9 items-center justify-between gap-3 px-3"
                >
                  <span
                    title={it.label}
                    className="truncate text-[13px] text-foreground"
                  >
                    {it.label}
                  </span>
                  {it.meta ? (
                    <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                      {it.meta}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        );
      case "actions":
        return (
          <div className="flex flex-wrap gap-2">
            {b.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                disabled={disabled}
                onClick={() => onAction?.(a.id, item.id)}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center rounded-2 px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  FOCUS,
                  a.primary
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-hairline-strong text-foreground hover:bg-surface-2",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
        );
    }
  };

  return (
    <div
      ref={bindRoot}
      className={cn(
        "@container/list-detail relative isolate flex w-full overflow-clip rounded-3 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          height,
          "--list-detail-list": `${Math.max(200, Math.round(listWidth))}px`,
          "--list-detail-accent": accent,
        } as React.CSSProperties
      }
    >
      {/* The list. */}
      <motion.section
        aria-labelledby={labelId}
        aria-hidden={covered || undefined}
        inert={covered}
        className={cn(
          "absolute inset-0 z-0 flex flex-col border-hairline",
          LIST_PANE[split],
        )}
        style={{ opacity: listOpacity }}
      >
        <div
          className={cn(
            "flex h-11 shrink-0 items-center gap-3 border-b border-hairline",
            rail ? "justify-center px-1" : "justify-between px-4",
          )}
        >
          <h2
            id={labelId}
            className={cn("truncate text-sm font-semibold", rail && "sr-only")}
          >
            {label}
          </h2>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {items.length}
          </span>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-ink-3">Nobody here yet.</p>
        ) : (
          <div className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
            <motion.span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0.5 z-10 w-[3px] rounded-full bg-[var(--list-detail-accent)]"
              style={{ y: ruleY, height: ruleH, opacity: ruleOpacity }}
            />
            <ul
              role="listbox"
              aria-labelledby={labelId}
              aria-disabled={disabled || undefined}
              className="flex flex-col gap-0.5 p-1.5"
            >
              {items.map((item, index) => {
                const chosen = current === item.id;
                const hideParts = view.leaving === item.id;
                return (
                  <li key={item.id} role="presentation">
                    <div
                      ref={(node) => {
                        if (node) rows.current.set(item.id, node);
                        else rows.current.delete(item.id);
                      }}
                      role="option"
                      aria-label={nameOf(item)}
                      title={rail ? item.title : undefined}
                      aria-selected={chosen}
                      aria-controls={chosen ? detailId : undefined}
                      aria-disabled={disabled || undefined}
                      tabIndex={roving === item.id ? 0 : -1}
                      onFocus={() => setActive(item.id)}
                      onClick={() => choose(item.id, "pointer")}
                      onKeyDown={(event) => onRowKeyDown(event, index, item.id)}
                      className={cn(
                        "relative flex items-center gap-3 rounded-2 transition-colors select-none",
                        rail ? "justify-center px-0" : "px-3",
                        row.row,
                        FOCUS_IN,
                        disabled
                          ? "cursor-not-allowed"
                          : "cursor-pointer hover:bg-surface-2",
                        chosen &&
                          "bg-[color-mix(in_oklab,var(--list-detail-accent)_10%,transparent)] hover:bg-[color-mix(in_oklab,var(--list-detail-accent)_14%,transparent)]",
                      )}
                    >
                      <span
                        data-part="avatar"
                        className={cn("flex", hideParts && "opacity-0")}
                      >
                        <Avatar item={item} className={row.avatar} />
                      </span>
                      <span
                        className={cn(
                          "flex min-w-0 flex-1 flex-col",
                          hideParts && "opacity-0",
                          rail && "hidden",
                        )}
                      >
                        <span
                          data-part="title"
                          title={item.title}
                          className="truncate text-sm leading-5 font-medium text-foreground"
                        >
                          {item.title}
                        </span>
                        {item.subtitle ? (
                          <span
                            data-part="subtitle"
                            title={item.subtitle}
                            className="truncate text-xs leading-4 text-ink-3"
                          >
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 flex-col items-end gap-0.5 self-start pt-2",
                          size === "lg" && "pt-3",
                          size === "sm" && "pt-1.5",
                          hideParts && "opacity-0",
                          rail && "hidden",
                        )}
                      >
                        {item.meta ? (
                          <span
                            data-part="meta"
                            className="text-[11px] leading-4 text-ink-3"
                          >
                            {item.meta}
                          </span>
                        ) : null}
                        {item.badge ? (
                          <span className="rounded-full bg-surface-2 px-1.5 text-[10px] leading-4 text-ink-2">
                            {item.badge}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </motion.section>

      {/* The row's surface, grown into the page (stacked only). */}
      <motion.div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-10",
          STACK_ONLY[split],
        )}
        style={{
          opacity: surfaceOpacity,
          clipPath: clip,
          backgroundColor: surfaceTint,
        }}
      />

      {/* The detail. */}
      <motion.div
        className={cn(
          "absolute inset-0 z-20 flex flex-col",
          view.shown === null && "pointer-events-none",
          DETAIL_PANE[split],
        )}
        style={{ opacity: detailOpacity }}
      >
        {shownItem ? (
          <section
            id={detailId}
            role="region"
            aria-labelledby={titleId}
            className="flex h-full flex-col"
            onKeyDown={(event) => {
              const isBack =
                event.key === "Escape" ||
                (event.altKey && event.key === "ArrowLeft");
              if (!isBack || current === null) return;
              // Handled where focus is; the page must not see this Escape.
              event.preventDefault();
              back();
            }}
          >
            <motion.div
              className={cn(
                "flex h-11 shrink-0 items-center border-b border-hairline px-2",
                STACK_ONLY[split],
              )}
              style={{ opacity: extras }}
            >
              <button
                type="button"
                onClick={() => choose(null, "pointer")}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1 rounded-2 pr-2.5 pl-1.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <ChevronLeft aria-hidden className="size-4 shrink-0" />
                {label}
              </button>
            </motion.div>

            <div
              ref={headerRef}
              className="flex shrink-0 items-center gap-4 px-5 pt-5 pb-4 @max-[30rem]/list-detail:gap-3 @max-[30rem]/list-detail:px-4 @max-[30rem]/list-detail:pt-4"
            >
              <motion.span
                data-part="avatar"
                className="flex"
                style={{
                  x: avatarM.x,
                  y: avatarM.y,
                  scale: avatarM.scale,
                  opacity: avatarM.opacity,
                  originX: 0,
                  originY: 0,
                }}
              >
                <Avatar item={shownItem} className={HEAD_AVATAR} />
              </motion.span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h3
                  ref={headingRef}
                  id={titleId}
                  tabIndex={-1}
                  className={cn("min-w-0 rounded-1", FOCUS)}
                >
                  <motion.span
                    data-part="title"
                    title={shownItem.title}
                    className="block truncate text-xl leading-7 font-semibold text-foreground @max-[30rem]/list-detail:text-lg @max-[30rem]/list-detail:leading-6"
                    style={{
                      x: titleM.x,
                      y: titleM.y,
                      scale: titleM.scale,
                      opacity: titleM.opacity,
                      originX: 0,
                      originY: 0,
                    }}
                  >
                    {shownItem.title}
                  </motion.span>
                </h3>
                <div className="flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-ink-2">
                  {shownItem.subtitle ? (
                    <motion.span
                      data-part="subtitle"
                      title={shownItem.subtitle}
                      className="min-w-0 truncate"
                      style={{
                        x: subtitleM.x,
                        y: subtitleM.y,
                        scale: subtitleM.scale,
                        opacity: subtitleM.opacity,
                        originX: 0,
                        originY: 0,
                      }}
                    >
                      {shownItem.subtitle}
                    </motion.span>
                  ) : null}
                  {shownItem.subtitle && shownItem.meta ? (
                    <motion.span
                      aria-hidden
                      className="text-ink-3"
                      style={{ opacity: extras }}
                    >
                      ·
                    </motion.span>
                  ) : null}
                  {shownItem.meta ? (
                    <motion.span
                      data-part="meta"
                      className="shrink-0"
                      style={{
                        x: metaM.x,
                        y: metaM.y,
                        scale: metaM.scale,
                        opacity: metaM.opacity,
                        originX: 0,
                        originY: 0,
                      }}
                    >
                      {shownItem.meta}
                    </motion.span>
                  ) : null}
                  {shownItem.badge ? (
                    <motion.span
                      className="ml-1 shrink-0 rounded-full bg-surface-2 px-2 text-[11px] leading-5 text-ink-2"
                      style={{ opacity: extras }}
                    >
                      {shownItem.badge}
                    </motion.span>
                  ) : null}
                </div>
              </div>
            </div>

            <motion.div
              className="@container/list-detail-body flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-5 pb-5"
              style={{ opacity: bodyOpacity }}
            >
              {renderDetail ? (
                <motion.div
                  key={`${shownItem.id}-custom`}
                  initial={streamIn ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: durations.base,
                    delay: motionSafe ? 0.12 : 0,
                  }}
                >
                  {renderDetail(shownItem)}
                </motion.div>
              ) : (
                <div
                  key={shownItem.id}
                  className="grid grid-cols-1 gap-5 @min-[40rem]/list-detail-body:grid-cols-2"
                >
                  {blocks.map((b, i) => (
                    <motion.div
                      key={b.id}
                      className={cn(
                        "min-w-0",
                        b.kind === "actions" &&
                          "@min-[40rem]/list-detail-body:col-span-2",
                        b.kind === "list" &&
                          "@min-[40rem]/list-detail-body:col-span-2",
                      )}
                      initial={
                        streamIn
                          ? motionSafe
                            ? { opacity: 0, y: distances.step }
                            : { opacity: 0 }
                          : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              y: {
                                ...springs.glide,
                                delay: 0.12 + i * interval,
                              },
                              opacity: {
                                duration: durations.base,
                                ease: easings.enter,
                                delay: 0.12 + i * interval,
                              },
                            }
                          : {
                              duration: durations.fast,
                              delay: i * Math.min(interval, 0.03),
                            }
                      }
                    >
                      {renderBlock(b, shownItem)}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </section>
        ) : (
          <div
            className={cn(
              "h-full flex-col items-center justify-center gap-3 px-6 text-center",
              SPLIT_ONLY[split],
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full border border-hairline text-ink-3">
              <UsersRound aria-hidden className="size-5" />
            </span>
            <p className="max-w-56 text-[13px] leading-5 text-ink-3">
              {emptyLabel}
            </p>
          </div>
        )}
      </motion.div>

      {/* Side by side: the previous header, flying home to its row. */}
      <div
        ref={ghostRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-30"
      >
        {prevItem && layout === "split" ? (
          <>
            <motion.span
              data-ghost="avatar"
              className="absolute top-0 left-0 flex"
              style={{
                x: ghostAvatar.x,
                y: ghostAvatar.y,
                scale: ghostAvatar.scale,
                opacity: ghostAvatar.opacity,
                originX: 0,
                originY: 0,
              }}
            >
              <Avatar item={prevItem} className={HEAD_AVATAR} />
            </motion.span>
            <motion.span
              data-ghost="title"
              className="absolute top-0 left-0 block truncate text-xl leading-7 font-semibold text-foreground @max-[30rem]/list-detail:text-lg @max-[30rem]/list-detail:leading-6"
              style={{
                width: ghostTitleW,
                x: ghostTitle.x,
                y: ghostTitle.y,
                scale: ghostTitle.scale,
                opacity: ghostTitle.opacity,
                originX: 0,
                originY: 0,
              }}
            >
              {prevItem.title}
            </motion.span>
            {prevItem.subtitle ? (
              <motion.span
                data-ghost="subtitle"
                className="absolute top-0 left-0 block truncate text-[13px] leading-5 text-ink-2"
                style={{
                  width: ghostSubtitleW,
                  x: ghostSubtitle.x,
                  y: ghostSubtitle.y,
                  scale: ghostSubtitle.scale,
                  opacity: ghostSubtitle.opacity,
                  originX: 0,
                  originY: 0,
                }}
              >
                {prevItem.subtitle}
              </motion.span>
            ) : null}
            {prevItem.meta ? (
              <motion.span
                data-ghost="meta"
                className="absolute top-0 left-0 text-[13px] leading-5 whitespace-nowrap text-ink-2"
                style={{
                  x: ghostMeta.x,
                  y: ghostMeta.y,
                  scale: ghostMeta.scale,
                  opacity: ghostMeta.opacity,
                  originX: 0,
                  originY: 0,
                }}
              >
                {prevItem.meta}
              </motion.span>
            ) : null}
          </>
        ) : null}
      </div>

      <p role="status" className="sr-only">
        <span key={view.seq}>{view.said}</span>
      </p>
    </div>
  );
}
