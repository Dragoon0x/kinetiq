"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  Circle,
  CircleCheck,
  CornerDownLeft,
  RotateCcw,
  TriangleAlert,
  UserRoundPen,
  WifiOff,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type StandupAgent = {
  id: string;
  name: string;
  /** What the agent handles, in a word or two. */
  role: string;
  /** Offline agents are drawn dashed and dimmed, with when they were last seen. @default true */
  online?: boolean;
  /** When an offline agent was last seen, in ms. */
  lastSeen?: number;
};

export type StandupItemKind = "done" | "next" | "blocked";

export type StandupItem = {
  id: string;
  /** The agent's id. */
  agent: string;
  kind: StandupItemKind;
  text: string;
  /** For a blocker: the owner it needs an answer from. */
  owner?: string;
};

export type StandupOwner = {
  id: string;
  name: string;
  /** Their team, after the name. */
  team?: string;
};

export type StandupResolution = {
  /** The blocked item's id. */
  item: string;
  answer: string;
  /** When it was answered, in ms. */
  at: number;
};

export type StandupDealStyle = "deck" | "drop" | "slide";
export type StandupDensity = "compact" | "cozy" | "roomy";
export type StandupStatus = "ready" | "loading" | "error";

export type StandupCardsProps = {
  /** The agents at the standup, one card each, in dealing order. @default defaultStandupAgents (4) */
  agents?: StandupAgent[];
  /** Every agent's done, next and blocked items. @default defaultStandupItems */
  items?: StandupItem[];
  /** People a blocker can need, and be reassigned to. @default defaultStandupOwners (4) */
  owners?: StandupOwner[];
  /** Controlled answered blockers, newest first. */
  resolved?: StandupResolution[];
  /** Initial answered blockers when uncontrolled. @default [] */
  defaultResolved?: StandupResolution[];
  /** Fires with the whole list when a blocker is answered. */
  onResolvedChange?: (resolved: StandupResolution[]) => void;
  /** A blocker was answered, with the answer. */
  onAnswerBlocker?: (item: StandupItem, answer: string) => void;
  /** A blocker was reassigned to another owner. */
  onReassign?: (item: StandupItem, owner: StandupOwner) => void;
  /** An item (or a resolved chip) was pressed. */
  onOpenItem?: (item: StandupItem) => void;
  /** The moment of the standup, in ms: stamps answers and dates the header. @default Thu 15 Oct 2026, 09:30 */
  now?: number;
  /** Minutes added to UTC before a time is printed. @default 0 */
  utcOffset?: number;
  /** The standup's name. @default "Thursday standup" */
  title?: string;
  /** Whose agents, after the title. @default "Gaugeworks support" */
  team?: string;
  /** How the cards arrive: dealt from a deck at the top with a seeded tilt, dropped into place, or slid in from the left. @default "deck" */
  dealStyle?: StandupDealStyle;
  /** Type size, padding and gaps of the cards. @default "cozy" */
  density?: StandupDensity;
  /** The deal's highlight, Send, the tray and focus accents — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** When the cards are dealt: as soon as they mount, or when the table scrolls into view. @default "inView" */
  trigger?: "mount" | "inView";
  /** The surface's height, px; the table scrolls inside it. @default 560 */
  height?: number;
  /** Whether the standup has loaded. @default "ready" */
  status?: StandupStatus;
  /** Try again was pressed after the standup failed to load. */
  onReload?: () => void;
  /** Read only: nothing can be answered or reassigned. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const STANDUP = Date.UTC(2026, 9, 15, 9, 30);

export const defaultStandupAgents: StandupAgent[] = [
  { id: "pike", name: "Pike", role: "Triage" },
  { id: "wren", name: "Wren", role: "Refunds" },
  { id: "moss", name: "Moss", role: "Escalations" },
  {
    id: "lark",
    name: "Lark",
    role: "Help center",
    online: false,
    lastSeen: Date.UTC(2026, 9, 15, 6, 40),
  },
];

export const defaultStandupOwners: StandupOwner[] = [
  { id: "dana", name: "Dana Reyes", team: "On-call" },
  { id: "priya", name: "Priya Nair", team: "Billing" },
  { id: "sam", name: "Sam Osei", team: "Design" },
  { id: "tomas", name: "Tomas Lind", team: "Support lead" },
];

/** Gaugeworks support's agents, the morning after the login outage. */
export const defaultStandupItems: StandupItem[] = [
  {
    id: "p1",
    agent: "pike",
    kind: "done",
    text: "Tagged 214 overnight tickets",
  },
  {
    id: "p2",
    agent: "pike",
    kind: "done",
    text: "Merged 9 duplicates about the login outage",
  },
  {
    id: "p3",
    agent: "pike",
    kind: "next",
    text: "Route the Spanish queue to Wren",
  },
  {
    id: "p4",
    agent: "pike",
    kind: "blocked",
    text: "Is the outage ticket the parent for all 41 login reports?",
    owner: "dana",
  },
  {
    id: "w1",
    agent: "wren",
    kind: "done",
    text: "Issued 18 refunds under $50",
  },
  {
    id: "w2",
    agent: "wren",
    kind: "done",
    text: "Closed 6 chargeback disputes",
  },
  {
    id: "w3",
    agent: "wren",
    kind: "next",
    text: "Review 3 refunds over the limit",
  },
  {
    id: "w4",
    agent: "wren",
    kind: "blocked",
    text: "Need approval for a $640 refund on order 1182.",
    owner: "priya",
  },
  {
    id: "m1",
    agent: "moss",
    kind: "done",
    text: "Paged on-call for the export bug",
  },
  {
    id: "m2",
    agent: "moss",
    kind: "done",
    text: "Drafted the status page update",
  },
  {
    id: "m3",
    agent: "moss",
    kind: "next",
    text: "Follow up with 12 affected accounts",
  },
  {
    id: "l1",
    agent: "lark",
    kind: "done",
    text: "Updated 4 articles for the new export",
  },
  {
    id: "l2",
    agent: "lark",
    kind: "next",
    text: "Rewrite the two-step sign-in guide",
  },
  {
    id: "l3",
    agent: "lark",
    kind: "blocked",
    text: "Which screenshots can we publish before the redesign ships?",
    owner: "sam",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;

const clock = (ms: number, offset: number) => {
  const d = new Date(ms + offset * MIN);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const hashOf = (id: string) => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

type Density = {
  card: string;
  gap: string;
  text: string;
  item: string;
  head: string;
};

const DENSITY: Record<StandupDensity, Density> = {
  compact: {
    card: "p-3",
    gap: "gap-2",
    text: "text-[12px] leading-[18px]",
    item: "py-px",
    head: "gap-2",
  },
  cozy: {
    card: "p-3.5",
    gap: "gap-2.5",
    text: "text-[12.5px] leading-5",
    item: "py-0.5",
    head: "gap-2.5",
  },
  roomy: {
    card: "p-4",
    gap: "gap-3.5",
    text: "text-[13px] leading-[22px]",
    item: "py-1",
    head: "gap-3",
  },
};

/** A box whose height follows its content on glide, measured. */
function Measured({
  glide,
  children,
}: {
  glide: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && height !== null ? height : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 8 }}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

type DealProps = {
  index: number;
  count: number;
  id: string;
  dealStyle: StandupDealStyle;
  /** The deal may run (the data has arrived). */
  armed: boolean;
  /** Start dealing now. */
  go: boolean;
  /** Front-to-back depth in the phone stack; 0 elsewhere. */
  depth: number;
  stacked: boolean;
  /** Whether this card is the stack's front card. */
  front: boolean;
  /** The front card was thrown off the stack; it goes to the back. */
  onThrow: () => void;
  motionSafe: boolean;
  disabled: boolean;
  children: React.ReactNode;
};

/**
 * One agent's card on the table. The outer layer carries the deal — from the
 * deck's corner, from above, or from the left — on `springs.snap` in turn;
 * the inner layer carries the phone stack: its depth on glide, and on the
 * front card a swipe that follows the finger 1:1 with a slight lean and, on a
 * projected throw, leaves on the exit ease to the back of the stack.
 */
function DealtCard({
  index,
  count,
  id,
  dealStyle,
  armed,
  go,
  depth,
  stacked,
  front,
  onThrow,
  motionSafe,
  disabled,
  children,
}: DealProps) {
  const outer = React.useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  const sx = useMotionValue(0);
  const srot = useMotionValue(0);
  const runs = React.useRef<AnimationPlaybackControls[]>([]);

  const startPose = React.useCallback(() => {
    const el = outer.current;
    const table = el?.parentElement;
    if (!el || !table) return { x: 0, y: -16, rotate: 0, scale: 1, opacity: 0 };
    // Reduced motion: no travel, the cards only fade in, in turn.
    if (!motionSafe) return { x: 0, y: 0, rotate: 0, scale: 1, opacity: 0 };
    if (dealStyle === "deck") {
      const tilt = ((hashOf(id) % 1000) / 1000 - 0.5) * 14;
      return {
        x: r2(table.clientWidth / 2 - el.offsetWidth / 2 - el.offsetLeft),
        y: r2(-el.offsetTop + 4 + (count - index) * 2),
        rotate: r2(tilt),
        scale: 0.86,
        opacity: 1,
      };
    }
    if (dealStyle === "slide")
      return { x: -24, y: 0, rotate: 0, scale: 1, opacity: 0 };
    return { x: 0, y: -distances.shift, rotate: 0, scale: 1.04, opacity: 0 };
  }, [count, dealStyle, id, index, motionSafe]);

  const pose = React.useCallback(
    (p: {
      x: number;
      y: number;
      rotate: number;
      scale: number;
      opacity: number;
    }) => {
      x.jump(p.x);
      y.jump(p.y);
      rotate.jump(p.rotate);
      scale.jump(p.scale);
      opacity.jump(p.opacity);
    },
    [opacity, rotate, scale, x, y],
  );
  const rest = React.useCallback(
    () => pose({ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }),
    [pose],
  );

  // Armed cards wait at their starting pose (the deck shows; the others hide)
  // until the deal begins; nothing is armed when motion is reduced.
  React.useLayoutEffect(() => {
    if (!armed) rest();
    else if (!go) pose(startPose());
  }, [armed, go, pose, rest, startPose]);

  React.useEffect(() => {
    if (!armed || !go) return;
    pose(startPose());
    const step = Math.min(0.14, 0.6 / Math.max(1, count - 1));
    const delay = index * step;
    if (!motionSafe) {
      runs.current = [
        animate(opacity, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay,
        }),
      ];
      return () => {
        for (const c of runs.current) c.stop();
        runs.current = [];
        rest();
      };
    }
    runs.current = [
      animate(x, 0, { ...springs.snap, delay }),
      animate(y, 0, { ...springs.snap, delay }),
      animate(rotate, 0, { ...springs.snap, delay }),
      animate(scale, 1, { ...springs.snap, delay }),
      animate(opacity, 1, {
        duration: durations.fast,
        ease: easings.enter,
        delay,
      }),
    ];
    return () => {
      // A rehearsal or a re-deal lands the card; it never freezes mid-air.
      for (const c of runs.current) c.stop();
      runs.current = [];
      rest();
    };
  }, [
    armed,
    go,
    count,
    index,
    motionSafe,
    opacity,
    pose,
    rest,
    rotate,
    scale,
    startPose,
    x,
    y,
  ]);

  const width = React.useRef(300);
  const throwRun = React.useRef<AnimationPlaybackControls[]>([]);
  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: disabled || !stacked || !front,
    onStart: () => {
      for (const c of throwRun.current) c.stop();
      width.current = outer.current?.offsetWidth ?? 300;
    },
    onMove: ({ offset }) => {
      sx.set(r2(offset.x));
      srot.set(r2(offset.x * 0.035));
    },
    onEnd: ({ velocity }) => {
      const rest2 = project(sx.get(), velocity.x, 0.99);
      if (Math.abs(rest2) > width.current * 0.35) {
        const dir = rest2 > 0 ? 1 : -1;
        throwRun.current = [
          animate(sx, dir * (width.current + 40), {
            duration: durations.base,
            ease: easings.exit,
            onComplete: () => {
              sx.jump(0);
              srot.jump(0);
              onThrow();
            },
          }),
          animate(srot, dir * 9, {
            duration: durations.base,
            ease: easings.exit,
          }),
        ];
      } else {
        throwRun.current = [
          animate(sx, 0, { ...springs.snap, velocity: velocity.x }),
          animate(srot, 0, springs.snap),
        ];
      }
    },
    onCancel: () => {
      animate(sx, 0, springs.snap);
      animate(srot, 0, springs.snap);
    },
  });

  React.useEffect(
    () => () => {
      for (const c of throwRun.current) c.stop();
    },
    [],
  );

  return (
    <motion.div
      ref={outer}
      data-sc-card={id}
      className="relative min-w-0 @max-[30rem]/standup-cards:[grid-area:1/1]"
      style={{ x, y, rotate, scale, opacity, zIndex: count - depth }}
    >
      <motion.div
        {...(stacked && front ? drag : {})}
        className={cn(
          "h-full",
          stacked && front && "cursor-grab touch-pan-y active:cursor-grabbing",
        )}
        style={{ x: sx, rotate: srot, originY: 1 }}
        initial={false}
        animate={{
          y: stacked ? Math.min(depth, 3) * 8 : 0,
          scale: stacked ? 1 - Math.min(depth, 3) * 0.045 : 1,
          opacity: stacked && depth > 2 ? 0 : 1,
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Flight = {
  id: string;
  text: string;
  agent: string;
  from: { x: number; y: number; w: number };
};

/**
 * A daily standup for a team of agents: one card each with what it did,
 * what it does next and what it is stuck on. When the table comes into view
 * the cards are dealt onto it in turn on `springs.snap`. An unanswered
 * blocker glows in the warn colour until someone answers it; answering slides
 * the item off its card — a chip lifts from the row and glides to the
 * resolved tray, landing there on `springs.recoil` while the card closes the
 * gap on glide. Reassigning swaps the owner it needs on snap.
 *
 * Tab moves card to card (stopping on a blocker's buttons); Down and Up walk
 * a card's items; B jumps to the next unanswered blocker. Two columns from
 * 36rem of container, one below, and under 30rem a swipeable stack: the
 * front card follows the finger, a flick sends it to the back, and Left and
 * Right do the same. Under reduced motion cards fade in, the glow is still,
 * and answers cross-fade into the tray.
 */
export function StandupCards({
  agents = defaultStandupAgents,
  items = defaultStandupItems,
  owners = defaultStandupOwners,
  resolved,
  defaultResolved,
  onResolvedChange,
  onAnswerBlocker,
  onReassign,
  onOpenItem,
  now = STANDUP,
  utcOffset = 0,
  title = "Thursday standup",
  team = "Gaugeworks support",
  dealStyle = "deck",
  density = "cozy",
  accent = "var(--accent-bright)",
  trigger = "inView",
  height = 560,
  status = "ready",
  onReload,
  disabled = false,
  className,
}: StandupCardsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownResolved, setOwnResolved] = React.useState<StandupResolution[]>(
    () => defaultResolved ?? [],
  );
  const done = resolved ?? ownResolved;
  const doneIds = new Set(done.map((r) => r.item));
  const [ownerOver, setOwnerOver] = React.useState<Record<string, string>>({});
  const [answering, setAnswering] = React.useState<{
    id: string;
    draft: string;
  } | null>(null);
  const [picking, setPicking] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");
  const [flight, setFlight] = React.useState<Flight | null>(null);

  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const ownerOf = (item: StandupItem) =>
    ownerById.get(ownerOver[item.id] ?? item.owner ?? "");
  const open = (item: StandupItem) =>
    item.kind !== "blocked" || !doneIds.has(item.id);
  const blockers = agents.flatMap((a) =>
    items.filter(
      (i) => i.agent === a.id && i.kind === "blocked" && !doneIds.has(i.id),
    ),
  );

  /* ------------------------------ the table ------------------------------ */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [tableNode, setTableNode] = React.useState<HTMLDivElement | null>(null);
  const [stacked, setStacked] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const n = agents.length;
  const front = ((active % Math.max(1, n)) + Math.max(1, n)) % Math.max(1, n);

  React.useEffect(() => {
    if (!tableNode) return;
    const ro = new ResizeObserver(() => {
      const w = tableNode.clientWidth;
      if (w > 0) setStacked(w < 448);
    });
    ro.observe(tableNode);
    return () => ro.disconnect();
  }, [tableNode]);

  // The deal waits for the table to be seen; the glow breathes only then.
  const [go, setGo] = React.useState(trigger === "mount");
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let inView = false;
    const sync = () => setLive(inView && !document.hidden);
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? false;
        if (inView) setGo(true);
        sync();
      },
      { threshold: 0.2 },
    );
    io.observe(node);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  /* ------------------------------- focusing ------------------------------ */

  const pendingFocus = React.useRef<string | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  React.useLayoutEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-sc-focus="${CSS.escape(want)}"]`,
    );
    if (!node) return;
    pendingFocus.current = null;
    node.focus({ preventScroll: false });
  }, [focusTick, front, answering, picking, done.length]);
  const focusLater = (key: string) => {
    pendingFocus.current = key;
    setFocusTick((t) => t + 1);
  };

  const jumpToBlocker = (from?: string) => {
    if (blockers.length === 0) {
      setSaid("Nothing is blocked.");
      return;
    }
    const at = from ? blockers.findIndex((b) => b.id === from) : -1;
    const next = blockers[(at + 1) % blockers.length] ?? blockers[0];
    if (!next) return;
    const idx = agents.findIndex((a) => a.id === next.agent);
    if (stacked && idx >= 0) setActive(idx);
    setSaid(
      `${agentById.get(next.agent)?.name ?? ""} is blocked: ${next.text}`,
    );
    focusLater(`answer:${next.id}`);
  };

  const onRootKey = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("textarea, input")) return;
    if (
      (event.key === "b" || event.key === "B") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const here =
        target.closest<HTMLElement>("[data-sc-item]")?.dataset.scItem;
      jumpToBlocker(here);
    }
  };

  /* -------------------------------- answers ------------------------------ */

  const send = (item: StandupItem, raw: string) => {
    const answer = raw.trim();
    if (!answer || disabled) return;
    const root = rootRef.current;
    const row = root?.querySelector<HTMLElement>(
      `[data-sc-item="${CSS.escape(item.id)}"]`,
    );
    if (root && row && motionSafe) {
      const r = root.getBoundingClientRect();
      const b = row.getBoundingClientRect();
      setFlight({
        id: item.id,
        text: item.text,
        agent: item.agent,
        from: {
          x: r2(b.left - r.left),
          y: r2(b.top - r.top),
          w: r2(Math.min(b.width, 280)),
        },
      });
    }
    const entry: StandupResolution = { item: item.id, answer, at: now };
    const next = [entry, ...done];
    if (resolved === undefined) setOwnResolved(next);
    setAnswering(null);
    const left = blockers.filter((b) => b.id !== item.id).length;
    setSaid(
      left === 0
        ? `Answered ${agentById.get(item.agent)?.name ?? ""}. Nothing is blocked now.`
        : `Answered ${agentById.get(item.agent)?.name ?? ""}. ${left} still blocked.`,
    );
    onResolvedChange?.(next);
    onAnswerBlocker?.(item, answer);
    // Focus goes on to the next blocker, or the card the answer came from.
    const after = blockers.filter((b) => b.id !== item.id);
    const nextBlock = after.find((b) => b.agent === item.agent) ?? after[0];
    focusLater(nextBlock ? `answer:${nextBlock.id}` : `card:${item.agent}`);
  };

  const reassign = (item: StandupItem, owner: StandupOwner) => {
    if (disabled) return;
    setOwnerOver((m) => ({ ...m, [item.id]: owner.id }));
    setPicking(null);
    setSaid(`Reassigned to ${owner.name}.`);
    onReassign?.(item, owner);
    focusLater(`reassign:${item.id}`);
  };

  /* ------------------------------- the flight ----------------------------- */

  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fw = useMotionValue(200);
  React.useLayoutEffect(() => {
    if (!flight) return;
    const root = rootRef.current;
    const chip = root?.querySelector<HTMLElement>(
      `[data-sc-chip="${CSS.escape(flight.id)}"]`,
    );
    if (!root || !chip) {
      const id = window.setTimeout(() => setFlight(null), 0);
      return () => window.clearTimeout(id);
    }
    const r = root.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    fx.jump(flight.from.x);
    fy.jump(flight.from.y);
    fw.jump(flight.from.w);
    const runs = [
      animate(fx, r2(c.left - r.left), springs.glide),
      animate(fy, r2(c.top - r.top), springs.glide),
      animate(fw, r2(c.width), {
        ...springs.glide,
        onComplete: () => setFlight(null),
      }),
    ];
    return () => {
      // An interrupted flight lands: the chip shows and the overlay goes.
      for (const c2 of runs) c2.stop();
    };
    // A flight starts once, from the render that committed the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight]);

  /* ------------------------------ item rows ------------------------------ */

  const itemKey = (event: React.KeyboardEvent, agentId: string) => {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Escape"
    )
      return;
    const card = rootRef.current?.querySelector<HTMLElement>(
      `[data-sc-focus="card:${CSS.escape(agentId)}"]`,
    );
    if (!card) return;
    const rows = [...card.querySelectorAll<HTMLElement>("[data-sc-row]")];
    const here = rows.indexOf(event.target as HTMLElement);
    event.preventDefault();
    if (event.key === "Escape") {
      card.focus();
      return;
    }
    const next =
      here === -1
        ? event.key === "ArrowDown"
          ? 0
          : rows.length - 1
        : Math.max(
            0,
            Math.min(
              rows.length - 1,
              here + (event.key === "ArrowDown" ? 1 : -1),
            ),
          );
    rows[next]?.focus();
  };

  const kindIcon = (kind: StandupItemKind) =>
    kind === "done" ? (
      <Check aria-hidden className="mt-[3px] size-3.5 shrink-0 text-success" />
    ) : kind === "next" ? (
      <Circle aria-hidden className="mt-[3px] size-3.5 shrink-0 text-ink-3" />
    ) : (
      <TriangleAlert
        aria-hidden
        className="mt-[3px] size-3.5 shrink-0 text-warn"
      />
    );

  const rowButton = (item: StandupItem) => (
    <button
      type="button"
      data-sc-row=""
      tabIndex={-1}
      onClick={() => onOpenItem?.(item)}
      onKeyDown={(event) => itemKey(event, item.agent)}
      className={cn(
        "flex w-full min-w-0 items-start gap-2 rounded-1 text-left text-foreground transition-colors hover:text-(--sc-accent)",
        d.item,
        FOCUS_IN,
      )}
    >
      {kindIcon(item.kind)}
      <span className="min-w-0">{item.text}</span>
    </button>
  );

  const blockerBox = (item: StandupItem) => {
    const owner = ownerOf(item);
    const isAnswering = answering?.id === item.id;
    const isPicking = picking === item.id;
    const fieldId = `${uid}-answer-${item.id}`;
    return (
      <div
        data-sc-item={item.id}
        className="relative rounded-2 border border-[color-mix(in_oklab,var(--warn)_42%,transparent)] bg-[color-mix(in_oklab,var(--warn)_7%,var(--card))] p-2.5"
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2 shadow-[0_0_0_3px_color-mix(in_oklab,var(--warn)_16%,transparent),0_0_18px_color-mix(in_oklab,var(--warn)_30%,transparent)]"
          initial={false}
          animate={
            live && motionSafe ? { opacity: [0.35, 1, 0.35] } : { opacity: 0.6 }
          }
          transition={
            live && motionSafe
              ? { duration: 2.6, repeat: Infinity, ease: easings.move }
              : { duration: durations.base }
          }
        />
        <button
          type="button"
          data-sc-row=""
          tabIndex={-1}
          onClick={() => onOpenItem?.(item)}
          onKeyDown={(event) => itemKey(event, item.agent)}
          className={cn(
            "relative flex w-full items-start gap-2 rounded-1 text-left font-medium text-foreground",
            FOCUS_IN,
          )}
        >
          {kindIcon("blocked")}
          <span className="min-w-0">{item.text}</span>
        </button>
        <div className="relative mt-2 flex flex-wrap items-center gap-1.5">
          <span className="min-w-36 flex-1 truncate text-[11px] text-ink-2">
            Needs{" "}
            <motion.span
              key={owner?.id ?? "none"}
              className="inline-block font-medium text-foreground"
              initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {owner?.name ?? "an owner"}
            </motion.span>
            {owner?.team ? ` · ${owner.team}` : ""}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-sc-focus={`reassign:${item.id}`}
              aria-expanded={isPicking}
              aria-haspopup="menu"
              aria-label="Reassign"
              title="Reassign"
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (disabled) return;
                setAnswering(null);
                setPicking(isPicking ? null : item.id);
                if (!isPicking)
                  focusLater(
                    `owner:${item.id}:${ownerOf(item)?.id ?? owners[0]?.id ?? ""}`,
                  );
              }}
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-2 border border-hairline-strong text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <UserRoundPen aria-hidden className="size-3.5" />
            </button>
            <button
              type="button"
              data-sc-focus={`answer:${item.id}`}
              aria-expanded={isAnswering}
              aria-controls={isAnswering ? fieldId : undefined}
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (disabled) return;
                setPicking(null);
                setAnswering(isAnswering ? null : { id: item.id, draft: "" });
                if (!isAnswering) focusLater(`field:${item.id}`);
              }}
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-2 bg-(--sc-accent) px-2.5 text-[12px] font-medium text-[oklch(0.99_0_0)] transition-opacity hover:opacity-90",
                FOCUS,
              )}
            >
              Answer
            </button>
          </span>
        </div>
        {isPicking ? (
          <motion.div
            role="menu"
            aria-label={`Reassign to`}
            className="relative mt-2 flex flex-wrap gap-1.5"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            onKeyDown={(event) => {
              const menu = event.currentTarget;
              const list = [
                ...menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
              ];
              const here = list.indexOf(event.target as HTMLElement);
              if (event.key === "Escape") {
                event.preventDefault();
                setPicking(null);
                focusLater(`reassign:${item.id}`);
              } else if (
                ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                const dir =
                  event.key === "ArrowRight" || event.key === "ArrowDown"
                    ? 1
                    : -1;
                list[(here + dir + list.length) % list.length]?.focus();
              }
            }}
          >
            {owners.map((o) => {
              const on = (ownerOf(item)?.id ?? "") === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  data-sc-focus={`owner:${item.id}:${o.id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => reassign(item, o)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
                    on
                      ? "border-(--sc-accent) bg-(--sc-wash) text-foreground"
                      : "border-hairline text-ink-2 hover:bg-surface-2",
                    FOCUS,
                  )}
                >
                  {on ? <Check aria-hidden className="size-3" /> : null}
                  {o.name}
                  {o.team ? (
                    <span className="text-ink-3">· {o.team}</span>
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
        {isAnswering ? (
          <motion.form
            className="relative mt-2 flex flex-col gap-1.5"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            onSubmit={(event) => {
              event.preventDefault();
              send(item, answering?.draft ?? "");
            }}
          >
            <label htmlFor={fieldId} className="sr-only">
              {`Answer for ${agentById.get(item.agent)?.name ?? ""}`}
            </label>
            <textarea
              id={fieldId}
              data-sc-focus={`field:${item.id}`}
              rows={2}
              value={answering?.draft ?? ""}
              placeholder={`Answer ${agentById.get(item.agent)?.name ?? ""}…`}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setAnswering({ id: item.id, draft: value });
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setAnswering(null);
                  focusLater(`answer:${item.id}`);
                } else if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(item, event.currentTarget.value);
                }
              }}
              className={cn(
                "w-full resize-none rounded-2 border border-input bg-card px-2.5 py-1.5 text-[12.5px] leading-5 text-foreground placeholder:text-ink-3 focus-visible:border-(--sc-accent)",
                FOCUS_IN,
              )}
            />
            <div className="flex items-center justify-end gap-1.5">
              <span className="mr-auto hidden items-center gap-1 text-[11px] text-ink-3 @min-[22rem]/standup-cards:inline-flex">
                <CornerDownLeft aria-hidden className="size-3" />
                to send
              </span>
              <button
                type="button"
                onClick={() => {
                  setAnswering(null);
                  focusLater(`answer:${item.id}`);
                }}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                Cancel
              </button>
              <button
                type="submit"
                aria-disabled={!answering?.draft.trim() || undefined}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 bg-(--sc-accent) px-3 text-[12px] font-medium text-[oklch(0.99_0_0)] transition-opacity",
                  !answering?.draft.trim() && "opacity-50",
                  FOCUS,
                )}
              >
                Send
              </button>
            </div>
          </motion.form>
        ) : null}
      </div>
    );
  };

  /* -------------------------------- cards -------------------------------- */

  /** A list per kind; its icon says which, its name is for assistive tech. */
  const section = (label: string, list: StandupItem[]) =>
    list.length === 0 ? null : (
      <ul aria-label={`${label}, ${list.length}`} className="flex flex-col">
        {list.map((item) => (
          <li key={item.id}>
            {item.kind === "blocked" ? blockerBox(item) : rowButton(item)}
          </li>
        ))}
      </ul>
    );

  const card = (agent: StandupAgent, index: number) => {
    const mine = items.filter((i) => i.agent === agent.id && open(i));
    const doneList = mine.filter((i) => i.kind === "done");
    const nextList = mine.filter((i) => i.kind === "next");
    const blockedList = mine.filter((i) => i.kind === "blocked");
    const online = agent.online !== false;
    const depth = stacked ? (index - front + n) % n : 0;
    const isFront = depth === 0;
    const hidden = stacked && !isFront;
    const nameId = `${uid}-agent-${agent.id}`;
    return (
      <DealtCard
        key={agent.id}
        id={agent.id}
        index={index}
        count={n}
        dealStyle={dealStyle}
        armed={ready}
        go={go}
        depth={depth}
        stacked={stacked}
        front={isFront}
        motionSafe={motionSafe}
        disabled={disabled}
        onThrow={() => setActive((a) => a + 1)}
      >
        <article
          data-sc-focus={`card:${agent.id}`}
          aria-labelledby={nameId}
          aria-describedby={hintId}
          aria-hidden={hidden || undefined}
          inert={hidden || undefined}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              itemKey(event, agent.id);
            } else if (
              stacked &&
              (event.key === "ArrowRight" || event.key === "ArrowLeft")
            ) {
              event.preventDefault();
              const step = event.key === "ArrowRight" ? 1 : -1;
              setActive((a) => a + step);
              const nextAgent = agents[(((front + step) % n) + n) % n];
              if (nextAgent) focusLater(`card:${nextAgent.id}`);
            }
          }}
          className={cn(
            "flex h-full flex-col rounded-3 border bg-card text-foreground shadow-[0_1px_2px_color-mix(in_oklab,black_6%,transparent),0_10px_26px_-12px_color-mix(in_oklab,black_28%,transparent)]",
            online
              ? "border-hairline-strong"
              : "border-dashed border-hairline-strong",
            d.card,
            d.text,
            FOCUS,
          )}
        >
          <Measured glide={motionSafe}>
            <div className={cn("flex flex-col", d.gap)}>
              <div className={cn("flex items-center", d.head)}>
                <span
                  aria-hidden
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold",
                    online
                      ? "bg-(--sc-wash) text-(--sc-accent)"
                      : "bg-surface-2 text-ink-3",
                  )}
                >
                  {agent.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    id={nameId}
                    className="truncate text-[13px] leading-4 font-semibold"
                  >
                    {agent.name}
                    <span className="font-normal text-ink-3">
                      {" "}
                      · {agent.role}
                    </span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] leading-4 text-ink-3">
                    {online ? (
                      <>
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full bg-success"
                        />
                        Online
                      </>
                    ) : (
                      <>
                        <WifiOff aria-hidden className="size-3" />
                        {agent.lastSeen !== undefined
                          ? `Offline since ${clock(agent.lastSeen, utcOffset)}`
                          : "Offline"}
                      </>
                    )}
                  </p>
                </div>
                {blockedList.length > 0 ? (
                  <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] px-1.5 text-[10px] font-medium text-warn">
                    <TriangleAlert aria-hidden className="size-3" />
                    Blocked
                  </span>
                ) : null}
              </div>
              <div
                className={cn("flex flex-col", d.gap, !online && "opacity-80")}
              >
                {section("Done", doneList)}
                {section("Next", nextList)}
                {section("Blocked", blockedList)}
                {blockedList.length === 0 ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
                    <CircleCheck
                      aria-hidden
                      className="size-3.5 text-success"
                    />
                    Nothing blocked
                  </p>
                ) : null}
              </div>
            </div>
          </Measured>
        </article>
      </DealtCard>
    );
  };

  /* -------------------------------- chrome ------------------------------- */

  const date = new Date(now + utcOffset * MIN);
  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
      <div className="min-w-0 flex-1 basis-32">
        <p id={titleId} className="truncate text-sm font-semibold">
          {title}
        </p>
        <p className="text-[12px] leading-4 text-ink-3 tabular-nums">
          {`${team} · ${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} · ${n} ${n === 1 ? "agent" : "agents"}`}
        </p>
      </div>
      {ready ? (
        blockers.length > 0 ? (
          <button
            type="button"
            aria-keyshortcuts="B"
            onClick={() => jumpToBlocker()}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--warn)_13%,transparent)] px-2.5 text-[12px] font-medium text-warn transition-colors hover:bg-[color-mix(in_oklab,var(--warn)_20%,transparent)]",
              FOCUS,
            )}
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            <span className="tabular-nums">{blockers.length} blocked</span>
            <kbd className="hidden rounded-1 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] px-1 font-mono text-[10px] leading-4 @min-[30rem]/standup-cards:inline">
              B
            </kbd>
          </button>
        ) : (
          <p className="inline-flex h-7 shrink-0 items-center gap-1.5 text-[12px] text-success">
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
              <motion.path
                d="M3.5 8.5 6.6 11.4 12.5 4.8"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: motionSafe ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
            Nothing blocked. Everyone can keep going.
          </p>
        )
      ) : null}
    </div>
  );

  const tray = (
    <div className="flex items-center gap-3 border-t border-hairline px-4 py-2.5">
      <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
        Resolved · {done.length}
      </span>
      {done.length === 0 ? (
        <span className="truncate text-[12px] text-ink-3">
          Answered blockers land here.
        </span>
      ) : (
        <ul
          aria-label="Resolved blockers"
          className="flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] py-1 pr-6"
        >
          {done.map((r) => {
            const item = itemById.get(r.item);
            if (!item) return null;
            const agent = agentById.get(item.agent);
            const hidden = flight?.id === r.item;
            return (
              <li key={r.item} className="shrink-0">
                <motion.button
                  type="button"
                  data-sc-chip={r.item}
                  title={`${item.text} — ${r.answer}`}
                  onClick={() => onOpenItem?.(item)}
                  initial={false}
                  animate={
                    hidden
                      ? { opacity: 0, scale: 0.92, y: -4 }
                      : { opacity: 1, scale: 1, y: 0 }
                  }
                  transition={
                    motionSafe
                      ? {
                          scale: springs.recoil,
                          y: springs.recoil,
                          opacity: { duration: durations.blink },
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "inline-flex h-7 max-w-60 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 pr-2.5 pl-1 text-[12px] text-ink-2 transition-colors hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <span
                    aria-hidden
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-(--sc-wash) text-[10px] font-semibold text-(--sc-accent)"
                  >
                    {agent?.name.charAt(0) ?? "?"}
                  </span>
                  <span className="truncate">{item.text}</span>
                  <Check aria-hidden className="size-3 shrink-0 text-success" />
                </motion.button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const pager =
    stacked && n > 1 ? (
      <div
        className="flex items-center justify-center gap-1.5 pt-3"
        role="group"
        aria-label="Cards"
      >
        {agents.map((a, i) => (
          <button
            key={a.id}
            type="button"
            aria-label={`${a.name}, card ${i + 1} of ${n}`}
            aria-current={i === front || undefined}
            onClick={() => setActive(i)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full",
              FOCUS,
            )}
          >
            <span
              className={cn(
                "block h-1.5 rounded-full transition-all duration-200",
                i === front ? "w-4 bg-(--sc-accent)" : "w-1.5 bg-ink-3/50",
              )}
            />
          </button>
        ))}
      </div>
    ) : null;

  const body =
    status === "loading" ? (
      <div
        className="flex flex-1 flex-col gap-3 overflow-hidden p-4"
        aria-busy="true"
      >
        <p className="text-[12px] text-ink-3">Gathering the standup…</p>
        <div className="grid grid-cols-1 gap-3 @min-[36rem]/standup-cards:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "h-36 rounded-3 bg-surface-2",
                i > 0 && "hidden @min-[36rem]/standup-cards:block",
              )}
              style={{ opacity: 1 - i * 0.15 }}
            />
          ))}
        </div>
      </div>
    ) : status === "error" ? (
      <div className="m-4 flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
        <p className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          The standup could not be loaded.
        </p>
        <button
          type="button"
          onClick={onReload}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    ) : (
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-4 pt-4 pb-4">
        {n === 0 ? (
          <p className="py-8 text-center text-[13px] text-ink-3">
            No agents reported today.
          </p>
        ) : (
          <>
            <div
              ref={setTableNode}
              aria-roledescription={stacked ? "stack" : undefined}
              className="relative grid grid-cols-1 items-start gap-3 @max-[30rem]/standup-cards:items-stretch @min-[36rem]/standup-cards:grid-cols-2"
            >
              {agents.map(card)}
            </div>
            {pager}
          </>
        )}
      </div>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      onKeyDown={onRootKey}
      className={cn(
        "@container/standup-cards relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-surface-1 text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={
        {
          height,
          "--sc-accent": accent,
          "--sc-wash": `color-mix(in oklab, ${accent} 13%, transparent)`,
        } as React.CSSProperties
      }
    >
      {header}
      {body}
      {ready ? tray : null}
      {flight ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-50 inline-flex h-7 items-center gap-1.5 overflow-hidden rounded-full border border-(--sc-accent) bg-card pr-2.5 pl-1 text-[12px] text-foreground shadow-[0_8px_24px_-6px_color-mix(in_oklab,black_35%,transparent)]"
          style={{ x: fx, y: fy, width: fw }}
        >
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-(--sc-wash) text-[10px] font-semibold text-(--sc-accent)">
            {agentById.get(flight.agent)?.name.charAt(0) ?? "?"}
          </span>
          <span className="truncate">{flight.text}</span>
        </motion.div>
      ) : null}
      <p id={hintId} className="sr-only">
        Tab moves between cards. Down and Up walk a card’s items. B jumps to the
        next blocker.
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
