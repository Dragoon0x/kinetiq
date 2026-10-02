"use client";

import * as React from "react";

import {
  Activity,
  AtSign,
  Bell,
  CheckCheck,
  CircleAlert,
  Hammer,
  Inbox,
  Landmark,
  Mail,
  Wallet,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type TactileTone,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type NoticeIcon =
  "build" | "payout" | "bank" | "alert" | "mention" | "mail" | "bell";

export type NoticeSource = {
  id: string;
  /** The product or channel the notices come from. */
  name: string;
  /** @default "bell" */
  icon?: NoticeIcon;
  /** The source's colour, any CSS colour. @default "var(--accent-bright)" */
  tint?: string;
};

export type Notice = {
  id: string;
  /** A source's id. */
  source: string;
  title: string;
  /** One or two sentences; the list shows two lines, the detail pane all of it. */
  body?: string;
  /** When it happened, in ms. Dated against `now`. */
  at: number;
  read?: boolean;
  /** It names you: it counts toward the Mentions tab. */
  mention?: boolean;
  /** Who did it, when a person did. */
  actor?: string;
};

export type NoticeFilter = "all" | "unread" | "mentions";
export type NoticeStack = "deck" | "fan" | "flat";
export type NoticeGroup = "source" | "day" | "off";
export type NoticeStatus = "ready" | "loading" | "error";

export type NoticeCenterProps = {
  /** Controlled notices. */
  notices?: Notice[];
  /** Initial notices when uncontrolled. @default defaultNotices */
  defaultNotices?: Notice[];
  /** Fires from the dismiss, open or sweep that changed the list, with the whole new list. */
  onNoticesChange?: (notices: Notice[]) => void;
  /** Where notices come from. @default defaultNoticeSources */
  sources?: NoticeSource[];
  /** The moment every notice is dated against, as a Date or ms. Days are UTC days. @default defaultNoticeNow */
  now?: Date | number;
  /** Controlled tab. */
  filter?: NoticeFilter;
  /** Initial tab when uncontrolled. @default "all" */
  defaultFilter?: NoticeFilter;
  onFilterChange?: (filter: NoticeFilter) => void;
  /** Controlled open notice (shown in the detail pane from 600px wide). */
  selected?: string | null;
  /** Initially open notice when uncontrolled. @default null */
  defaultSelected?: string | null;
  onSelectedChange?: (id: string | null) => void;
  /** A notice was opened: pressed, or Enter on it. It is marked read first. */
  onOpen?: (id: string) => void;
  /** Notices were dismissed, by swipe, key or button. */
  onDismiss?: (ids: string[]) => void;
  /** Mark all read swept these notices. */
  onMarkAllRead?: (ids: string[]) => void;
  /** One notice was marked read or unread. */
  onReadChange?: (id: string, read: boolean) => void;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** How a collapsed group shows what is under its newest notice: a deck of layers, a fan, or a flat "+3". @default "deck" */
  stack?: NoticeStack;
  /** How long Mark all read's band takes to cross the list, in ms. @default 480 */
  sweep?: number;
  /** Group by source (collapsible stacks), by day (Today, Yesterday, Earlier), or not at all. @default "source" */
  group?: NoticeGroup;
  /** The panel's heading. @default "Notifications" */
  title?: string;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: NoticeStatus;
  /** The region's accessible name. @default the title */
  label?: string;
  /** Play the swishes and pops. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults -------------------------------- */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Tuesday 29 September 2026, 14:30 UTC. */
export const defaultNoticeNow = Date.UTC(2026, 8, 29, 14, 30);
const before = (ms: number) => defaultNoticeNow - ms;

export const defaultNoticeSources: NoticeSource[] = [
  {
    id: "builds",
    name: "Fieldline Builds",
    icon: "build",
    tint: "var(--accent-bright)",
  },
  { id: "pay", name: "Waylight Pay", icon: "payout", tint: "var(--success)" },
  {
    id: "monitor",
    name: "Gaugeworks Monitor",
    icon: "alert",
    tint: "var(--warn)",
  },
  {
    id: "docs",
    name: "Fernworks Docs",
    icon: "mention",
    tint: "color-mix(in oklch, var(--accent-bright) 55%, var(--danger))",
  },
  { id: "bank", name: "Coldbrook Bank", icon: "bank", tint: "var(--signal)" },
];

export const defaultNotices: Notice[] = [
  {
    id: "n1",
    source: "builds",
    title: "Deploy finished",
    body: "web-checkout · main to production in 2m 14s. 3 commits, all checks passed.",
    at: before(4 * MIN),
  },
  {
    id: "n2",
    source: "docs",
    title: "Priya Raman mentioned you",
    body: "“Can you check the refund copy before Friday?” in Checkout copy, v3.",
    at: before(12 * MIN),
    mention: true,
    actor: "Priya Raman",
  },
  {
    id: "n3",
    source: "monitor",
    title: "Latency above 400 ms",
    body: "eu-west ingest p95 held above 400 ms for five minutes. Recovered at 14:06.",
    at: before(26 * MIN),
  },
  {
    id: "n4",
    source: "builds",
    title: "Build failed on preview",
    body: "gauge-ingest · step test:unit exited with code 1 after 48s.",
    at: before(38 * MIN),
  },
  {
    id: "n5",
    source: "pay",
    title: "Payout sent",
    body: "€4,218.60 to Coldbrook Bank ••42, arriving Thursday.",
    at: before(1 * HOUR + 10 * MIN),
  },
  {
    id: "n6",
    source: "builds",
    title: "Deploy finished",
    body: "docs-site · main to production in 58s.",
    at: before(3 * HOUR),
    read: true,
  },
  {
    id: "n7",
    source: "pay",
    title: "Dispute opened",
    body: "Order 10-2291 · €86.00 · the buyer says it never arrived. Respond by 6 October.",
    at: before(5 * HOUR),
  },
  {
    id: "n8",
    source: "monitor",
    title: "Disk 85% full",
    body: "gauge-db-2 /var/lib is trending to full in four days.",
    at: before(6 * HOUR),
  },
  {
    id: "n9",
    source: "builds",
    title: "Preview ready",
    body: "web-checkout · pull request 482, “Show the total before the card check”.",
    at: before(20 * HOUR),
    read: true,
  },
  {
    id: "n10",
    source: "bank",
    title: "Statement ready",
    body: "Your September statement for Operating ••42 is ready to download.",
    at: before(22 * HOUR),
    read: true,
  },
  {
    id: "n11",
    source: "docs",
    title: "Eli Navarro mentioned you",
    body: "“Mira has the interview notes” in Research plan, Q4.",
    at: before(2 * DAY + 3 * HOUR),
    read: true,
    mention: true,
    actor: "Eli Navarro",
  },
  {
    id: "n12",
    source: "bank",
    title: "Low balance",
    body: "Reserve ••17 fell below €2,000 after the 12:00 payout batch.",
    at: before(3 * DAY),
    read: true,
  },
];

/* -------------------------------- helpers -------------------------------- */

const PHONE = 600;
const DESKTOP = 1040;
/** Layers that peek under a collapsed group. */
const LAYERS = 2;
/** How far a release must carry a row, as a share of its width, to dismiss it. */
const DISMISS_AT = 0.4;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const pad2 = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Ends a sentence once, even when the words it quotes already end in a full stop. */
const sentence = (text: string) =>
  /[.!?…]["”’)]?$/.test(text.trim()) ? text : `${text}.`;

const toMs = (now: Date | number | undefined) =>
  now === undefined
    ? defaultNoticeNow
    : typeof now === "number"
      ? now
      : now.getTime();

const dayOf = (ms: number) => Math.floor(ms / DAY);

/** "now", "4m", "2h", "Yesterday", "Mon", "12 Sep" — UTC, so every render agrees. */
function short(at: number, now: number): string {
  const d = Math.max(0, now - at);
  if (d < MIN) return "now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m`;
  const gap = dayOf(now) - dayOf(at);
  if (gap <= 0) return `${Math.floor(d / HOUR)}h`;
  if (gap === 1) return "Yesterday";
  const date = new Date(at);
  if (gap < 7) return (DAYS[date.getUTCDay()] ?? "").slice(0, 3);
  return `${date.getUTCDate()} ${(MONTHS[date.getUTCMonth()] ?? "").slice(0, 3)}`;
}

/** The same moment as a phrase for assistive technology. */
function spoken(at: number, now: number): string {
  const d = Math.max(0, now - at);
  if (d < MIN) return "just now";
  if (d < HOUR)
    return `${plural(Math.floor(d / MIN), "minute", "minutes")} ago`;
  const gap = dayOf(now) - dayOf(at);
  if (gap <= 0) return `${plural(Math.floor(d / HOUR), "hour", "hours")} ago`;
  if (gap === 1) return "yesterday";
  const date = new Date(at);
  if (gap < 7) return `on ${DAYS[date.getUTCDay()] ?? ""}`;
  return `on ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ""}`;
}

/** "Tuesday 29 September, 14:26" in UTC. */
function absolute(at: number): string {
  const d = new Date(at);
  return `${DAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

const ICONS: Record<NoticeIcon, typeof Bell> = {
  build: Hammer,
  payout: Wallet,
  bank: Landmark,
  alert: Activity,
  mention: AtSign,
  mail: Mail,
  bell: Bell,
};

function SourceIcon({
  source,
  size = "md",
}: {
  source: NoticeSource | undefined;
  size?: "sm" | "md";
}) {
  const Icon = ICONS[source?.icon ?? "bell"] ?? Bell;
  const tint = source?.tint ?? "var(--accent-bright)";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "sm" ? "size-5 rounded-1" : "size-8 rounded-2",
      )}
      style={{
        color: tint,
        background: `color-mix(in oklab, ${tint} 16%, transparent)`,
      }}
    >
      <Icon className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  );
}

/** A short text that rolls up when it changes: a time, a count. */
function Roll({
  value,
  motionSafe,
  className,
}: {
  value: string;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex overflow-clip", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className="inline-block whitespace-nowrap"
          initial={{ y: motionSafe ? "100%" : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{
            y: motionSafe ? "-100%" : 0,
            opacity: 0,
            transition: exitFor(durations.fast),
          }}
          transition={{
            y: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast, ease: easings.enter },
          }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type Play = (tone: TactileTone, pitch: number, el?: Element | null) => void;

/* ---------------------------------- row ---------------------------------- */

type RowApi = { throwOut: (dir: number, velocity?: number) => void };

type RowProps = {
  notice: Notice;
  source: NoticeSource | undefined;
  now: number;
  /** Set while this row is the top of a collapsed group. */
  stack?: { count: number; unread: number; kind: NoticeStack };
  /** Set while this row deals out of (or gathers back into) its group's stack. */
  deal?: { index: number; top: () => HTMLElement | null; kind: NoticeStack };
  gathering: boolean;
  /** The newest row of a group that stacks: it stays above the rows it deals. */
  isTop: boolean;
  selected: boolean;
  tabStop: boolean;
  motionSafe: boolean;
  disabled: boolean;
  /** Delay of the read change while Mark all read sweeps, ms. */
  sweepDelay: number;
  isLive: () => boolean;
  bind: (
    id: string,
    node: HTMLButtonElement | null,
  ) => (() => void) | undefined;
  register: (id: string, api: RowApi) => () => void;
  onActivate: (id: string) => void;
  onKey: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onToggleRead: (id: string) => void;
  /** The row has left: commit it. A collapsed group is dismissed whole. */
  onGone: (id: string) => void;
  /** A collapsed group's card is off screen: the group folds its own height. */
  onThrown?: () => void;
  play: Play;
};

/** Where a dealt row sits while it is still part of the stack. */
function layerPose(index: number, kind: NoticeStack) {
  const k = Math.min(index, LAYERS + 1);
  if (kind === "flat") return { y: 0, scale: 1, rotate: 0, opacity: 0 };
  return {
    y: 7 * k,
    scale: r2(1 - 0.045 * k),
    rotate: kind === "fan" ? (k % 2 === 1 ? -2.5 : 2) : 0,
    opacity: k <= LAYERS ? 1 : 0,
  };
}

/**
 * One notice. It follows a sideways drag 1:1 and leaves on the exit ease
 * when thrown; it deals out of its group's stack on mount, gathers back into
 * it, and its read state changes when Mark all read's band reaches it.
 */
function NoticeRow({
  notice,
  source,
  now,
  stack,
  deal,
  gathering,
  isTop,
  selected,
  tabStop,
  motionSafe,
  disabled,
  sweepDelay,
  isLive,
  bind,
  register,
  onActivate,
  onKey,
  onToggleRead,
  onGone,
  onThrown,
  play,
}: RowProps) {
  const unread = !notice.read;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const rotate = useMotionValue(0);
  const fade = useMotionValue(1);
  const under = useMotionValue(1);
  const height = useMotionValue(0);
  const [leaving, setLeaving] = React.useState(false);
  const wrapRef = React.useRef<HTMLLIElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const gone = React.useRef(false);
  const live = React.useRef({ motionSafe, onGone, onThrown, play });

  // Declared before the effects below, so their subscriptions exist when a
  // mount-time deal sets the values they read.
  // Fades with distance against a typical row's width.
  const cardOpacity = useTransform([x, fade], ([vx = 0, f = 1]: number[]) =>
    r2(f * (1 - Math.min(1, Math.abs(vx) / 320) * 0.55)),
  );
  const leftLabel = useTransform(x, (v) =>
    v > 0 ? r2(Math.min(1, v / 64)) : 0,
  );
  const rightLabel = useTransform(x, (v) =>
    v < 0 ? r2(Math.min(1, -v / 64)) : 0,
  );

  React.useLayoutEffect(() => {
    live.current = { motionSafe, onGone, onThrown, play };
  });

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };

  const throwOut = React.useCallback(
    (dir: number, velocity = 0) => {
      if (gone.current) return;
      gone.current = true;
      const { motionSafe: safe, onThrown: thrown, play: sound } = live.current;
      const card = cardRef.current;
      const width = card?.offsetWidth ?? 320;
      sound("swish", dir > 0 ? 1.05 : 0.95, card);
      const collapse = () => {
        // The card is gone; what waited under it goes too.
        run(
          "under",
          animate(under, 0, { duration: durations.fast, ease: easings.exit }),
        );
        if (thrown) {
          thrown();
          return;
        }
        const node = wrapRef.current;
        height.jump(node?.offsetHeight ?? 0);
        setLeaving(true);
        if (!safe) {
          live.current.onGone(notice.id);
          return;
        }
        run(
          "height",
          animate(height, 0, {
            ...springs.glide,
            onComplete: () => live.current.onGone(notice.id),
          }),
        );
      };
      if (!safe) {
        run(
          "fade",
          animate(fade, 0, {
            duration: durations.fast,
            ease: easings.exit,
            onComplete: collapse,
          }),
        );
        return;
      }
      const to = dir * (width + 48);
      const distance = Math.abs(to - x.get());
      const speed = Math.max(Math.abs(velocity), 1400);
      run(
        "x",
        animate(x, to, {
          duration: Math.min(0.28, Math.max(0.14, distance / speed)),
          ease: easings.exit,
          onComplete: collapse,
        }),
      );
    },
    [fade, height, notice.id, under, x],
  );

  React.useLayoutEffect(
    () => register(notice.id, { throwOut }),
    [register, notice.id, throwOut],
  );

  // Dealt out of the stack: it starts where its layer was and glides down to
  // its own place. A row that simply arrives drops in from a nudge above.
  // Measured here, after layout; a StrictMode re-run measures again and
  // finishes the move rather than freezing it.
  React.useLayoutEffect(() => {
    const node = wrapRef.current;
    const running = anims.current;
    if (!node) return;
    if (deal) {
      const top = deal.top();
      if (!motionSafe || !top || top === node) {
        fade.jump(motionSafe ? 1 : 0);
        if (!motionSafe) {
          running.set(
            "fade",
            animate(fade, 1, { duration: durations.base, ease: easings.enter }),
          );
        }
        return;
      }
      const pose = layerPose(deal.index, deal.kind);
      const dy = node.offsetTop - top.offsetTop;
      const delay = deal.index * cascade(deal.index + 2);
      y.jump(r2(-dy + pose.y));
      scale.jump(pose.scale);
      rotate.jump(pose.rotate);
      fade.jump(pose.opacity);
      running.set("y", animate(y, 0, { ...springs.glide, delay }));
      running.set("scale", animate(scale, 1, { ...springs.glide, delay }));
      running.set("rotate", animate(rotate, 0, { ...springs.glide, delay }));
      running.set(
        "fade",
        animate(fade, 1, {
          duration: durations.base,
          ease: easings.enter,
          delay,
        }),
      );
    } else if (isLive()) {
      fade.jump(0);
      if (motionSafe) y.jump(-distances.step);
      running.set(
        "y",
        animate(y, 0, motionSafe ? springs.snap : { duration: 0 }),
      );
      running.set(
        "fade",
        animate(fade, 1, { duration: durations.base, ease: easings.enter }),
      );
    }
    return () => {
      for (const key of ["y", "scale", "rotate", "fade"]) {
        running.get(key)?.stop();
        running.delete(key);
      }
      if (!gone.current) {
        y.jump(0);
        scale.jump(1);
        rotate.jump(0);
        fade.jump(1);
      }
    };
    // Runs on arrival only: a deal is a mount-time move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gathered back: the row slides up under the top card on the exit ease.
  const dealRef = React.useRef(deal);
  React.useLayoutEffect(() => {
    dealRef.current = deal;
  });
  React.useEffect(() => {
    const d = dealRef.current;
    if (!gathering || !d) return;
    const node = wrapRef.current;
    const top = d.top();
    if (!node || !top || !motionSafe) {
      fade.set(0);
      return;
    }
    const pose = layerPose(d.index, d.kind);
    const dy = node.offsetTop - top.offsetTop;
    const t = { duration: durations.base, ease: easings.exit };
    run("y", animate(y, r2(-dy + pose.y), t));
    run("scale", animate(scale, pose.scale, t));
    run("rotate", animate(rotate, pose.rotate, t));
    run("fade", animate(fade, pose.opacity, t));
  }, [gathering, motionSafe, fade, rotate, scale, y]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled: disabled || leaving,
    onStart: () => {
      anims.current.get("x")?.stop();
    },
    onMove: ({ offset }) => x.set(r2(offset.x)),
    onEnd: ({ velocity }) => {
      const width = cardRef.current?.offsetWidth ?? 320;
      const rest = project(x.get(), velocity.x, 0.99);
      if (Math.abs(rest) > width * DISMISS_AT) {
        throwOut(Math.sign(rest) || 1, velocity.x);
      } else {
        run(
          "x",
          animate(
            x,
            0,
            motionSafe
              ? { ...springs.snap, velocity: velocity.x }
              : { duration: durations.fast },
          ),
        );
      }
    },
    onCancel: () =>
      run("x", animate(x, 0, motionSafe ? springs.snap : { duration: 0 })),
    onTap: () => onActivate(notice.id),
  });

  const delay = sweepDelay / 1000;
  const time = short(notice.at, now);
  const who = source?.name ?? "Notice";
  const name = stack
    ? `${who}, ${plural(stack.count, "notification", "notifications")}${stack.unread ? `, ${stack.unread} unread` : ""}. Newest: ${notice.title}, ${spoken(notice.at, now)}. Press to expand.`
    : `${unread ? "Unread. " : ""}${who}: ${notice.title}, ${spoken(notice.at, now)}.`;
  const layers =
    stack && stack.kind !== "flat" ? Math.min(LAYERS, stack.count - 1) : 0;

  return (
    <motion.li
      ref={wrapRef}
      className={cn("relative", leaving && "overflow-clip")}
      style={{
        // The stack's top card covers the rows it deals; each dealt row
        // covers the ones dealt after it.
        zIndex: isTop ? 30 : deal ? 20 - Math.min(19, deal.index) : undefined,
        height: leaving ? height : "auto",
        y,
        scale,
        rotate,
        originY: 1,
      }}
    >
      <div
        className="relative pb-1.5"
        style={{ paddingBottom: layers ? 6 + 7 * layers : undefined }}
      >
        {/* What waits under a swipe. */}
        <motion.div
          aria-hidden
          className="absolute inset-x-0 top-0 bottom-1.5 flex items-center justify-between rounded-3 bg-surface-2 px-4 text-[11px] font-medium text-ink-2"
          style={{
            bottom: layers ? 6 + 7 * layers : undefined,
            opacity: under,
          }}
        >
          <motion.span
            className="inline-flex items-center gap-1.5"
            style={{ opacity: leftLabel }}
          >
            <X className="size-3.5" /> Dismiss
          </motion.span>
          <motion.span
            className="inline-flex items-center gap-1.5"
            style={{ opacity: rightLabel }}
          >
            Dismiss <X className="size-3.5" />
          </motion.span>
        </motion.div>

        <motion.div
          ref={cardRef}
          className="group/notice-center-row relative isolate"
          style={{ x, opacity: cardOpacity }}
        >
          {Array.from({ length: layers }, (_, i) => {
            const pose = layerPose(i + 1, stack?.kind ?? "deck");
            return (
              <motion.span
                key={i}
                aria-hidden
                className="absolute inset-0 rounded-3 border border-hairline-strong bg-surface-2 shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent)]"
                style={{
                  zIndex: LAYERS - i,
                  originY: 1,
                  originX: 0.5,
                  y: pose.y,
                  scale: pose.scale,
                  rotate: pose.rotate,
                }}
                initial={false}
                animate={{ opacity: 1 - i * 0.3 }}
              />
            );
          })}
          <button
            ref={(node) => bind(notice.id, node)}
            type="button"
            aria-label={name}
            aria-expanded={stack ? false : undefined}
            aria-current={selected ? "true" : undefined}
            tabIndex={tabStop ? 0 : -1}
            disabled={disabled}
            {...drag}
            onClick={(event) => {
              // Pointer presses arrive through the drag's tap.
              if (event.detail === 0) onActivate(notice.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                throwOut(1);
                return;
              }
              if (event.key === "u" && !stack) {
                event.preventDefault();
                onToggleRead(notice.id);
                return;
              }
              onKey(notice.id, event);
            }}
            className={cn(
              "relative z-10 flex w-full touch-pan-y items-start gap-3 overflow-clip rounded-3 border bg-card p-2.5 pl-4 text-left transition-colors select-none disabled:cursor-not-allowed",
              selected
                ? "border-hairline-strong bg-surface-2"
                : "border-hairline hover:border-hairline-strong",
              FOCUS_RING_IN,
            )}
          >
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-cobalt-wash"
              initial={false}
              animate={{ opacity: unread ? 1 : 0 }}
              transition={{
                duration: durations.base,
                ease: easings.enter,
                delay: unread ? 0 : delay,
              }}
            />
            <motion.span
              aria-hidden
              className="absolute top-[22px] left-1.5 size-1.5 rounded-full bg-cobalt-bright"
              initial={false}
              animate={{
                scale: unread || !motionSafe ? 1 : 0,
                opacity: unread ? 1 : 0,
              }}
              transition={{
                scale: motionSafe
                  ? { ...springs.flick, delay: unread ? 0 : delay }
                  : { duration: 0 },
                opacity: {
                  duration: durations.fast,
                  delay: unread ? 0 : delay,
                },
              }}
            />
            <SourceIcon source={source} />
            <span className="relative min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-[13px]",
                    unread
                      ? "font-semibold text-foreground"
                      : "font-medium text-ink",
                  )}
                >
                  {notice.title}
                </span>
                <Roll
                  value={time}
                  motionSafe={motionSafe}
                  className="h-4 shrink-0 font-mono text-[11px] leading-4 text-ink-3 tabular-nums transition-opacity group-hover/notice-center-row:opacity-0"
                />
              </span>
              {notice.body ? (
                <span className="mt-0.5 line-clamp-2 text-[12px] leading-[1.45] text-ink-2">
                  {notice.body}
                </span>
              ) : null}
              {stack ? (
                <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
                  {stack.kind === "flat" ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-surface-2 px-1.5 font-mono text-[10px] text-ink-2 tabular-nums">
                      +{stack.count - 1}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate">
                    {stack.kind === "flat"
                      ? `more from ${who}`
                      : `${stack.count - 1} more from ${who}`}
                  </span>
                  {stack.unread > (unread ? 1 : 0) ? (
                    <span className="shrink-0 text-cobalt-bright">
                      · {stack.unread - (unread ? 1 : 0)} unread
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Dismiss ${notice.title}`}
            disabled={disabled}
            onClick={() => throwOut(1)}
            className={cn(
              "absolute top-2 right-2 z-20 inline-flex size-6 items-center justify-center rounded-2 text-ink-3 opacity-0 transition-opacity group-hover/notice-center-row:opacity-100 hover:bg-surface-2 hover:text-foreground disabled:hidden",
              "pointer-events-none group-hover/notice-center-row:pointer-events-auto",
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </motion.div>
      </div>
    </motion.li>
  );
}

/* -------------------------------- section -------------------------------- */

type SectionData = {
  key: string;
  label: string;
  source?: NoticeSource;
  items: Notice[];
  /** A source group of two or more: it can stack. */
  stackable: boolean;
};

type SectionProps = {
  section: SectionData;
  group: NoticeGroup;
  stackKind: NoticeStack;
  expanded: boolean;
  gathering: boolean;
  sources: Map<string, NoticeSource>;
  now: number;
  selected: string | null;
  tabStop: string | null;
  motionSafe: boolean;
  disabled: boolean;
  sweepDelays: Record<string, number>;
  isLive: () => boolean;
  bind: RowProps["bind"];
  register: RowProps["register"];
  onActivate: (id: string) => void;
  onKey: RowProps["onKey"];
  onToggleRead: (id: string) => void;
  onGone: (ids: string[]) => void;
  onCollapse: (key: string) => void;
  play: Play;
};

/**
 * A group: its heading and its rows, inside a box whose height follows its
 * measured content on glide, so the groups under it move as one.
 */
function Section({
  section,
  group,
  stackKind,
  expanded,
  gathering,
  sources,
  now,
  selected,
  tabStop,
  motionSafe,
  disabled,
  sweepDelays,
  isLive,
  bind,
  register,
  onActivate,
  onKey,
  onToggleRead,
  onGone,
  onCollapse,
  play,
}: SectionProps) {
  const uid = React.useId();
  const headId = `${uid}-head`;
  const h = useMotionValue(0);
  const [sized, setSized] = React.useState(false);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const topRef = React.useRef<HTMLDivElement | null>(null);
  const shown = React.useRef<number | null>(null);
  const leaving = React.useRef(false);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const safeRef = React.useRef(motionSafe);

  React.useLayoutEffect(() => {
    safeRef.current = motionSafe;
  });

  React.useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const fit = () => {
      if (leaving.current) return;
      const target = inner.offsetHeight;
      if (shown.current === target) return;
      const first = shown.current === null;
      shown.current = target;
      anim.current?.stop();
      if (first || !safeRef.current) {
        h.jump(target);
        if (first) setSized(true);
      } else {
        anim.current = animate(h, target, springs.glide);
      }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(inner);
    return () => {
      ro.disconnect();
      anim.current?.stop();
      // A re-run measures from scratch and lands where the content is.
      if (shown.current !== null && !leaving.current) h.jump(shown.current);
      shown.current = null;
    };
  }, [h]);

  const ids = section.items.map((n) => n.id);
  const leaveWhole = () => {
    leaving.current = true;
    anim.current?.stop();
    if (!safeRef.current) {
      onGone(ids);
      return;
    }
    anim.current = animate(h, 0, {
      ...springs.glide,
      onComplete: () => onGone(ids),
    });
  };

  const stacked = section.stackable && !expanded;
  const shownItems = stacked ? section.items.slice(0, 1) : section.items;
  const unreadCount = section.items.filter((n) => !n.read).length;
  const top = section.items[0];

  return (
    <motion.li
      aria-labelledby={section.label ? headId : undefined}
      className="overflow-x-visible overflow-y-clip"
      style={{ height: sized ? h : "auto" }}
      exit={{
        opacity: 0,
        height: 0,
        transition: motionSafe
          ? {
              opacity: exitFor(durations.fast),
              height: { duration: durations.slow, ease: easings.move },
            }
          : { duration: 0 },
      }}
    >
      <div ref={innerRef} className="flex flex-col pb-3">
        {section.label ? (
          <div
            className={cn(
              "flex h-7 items-center gap-2 px-1",
              group === "day" && "sticky top-0 z-20 bg-surface-0",
            )}
          >
            {section.source ? (
              <SourceIcon source={section.source} size="sm" />
            ) : null}
            <h3
              id={headId}
              className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              {section.label}
              <span className="text-ink-3/70"> · {section.items.length}</span>
            </h3>
            {section.stackable && expanded ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onCollapse(section.key)}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                  FOCUS_RING,
                )}
              >
                Show less
              </button>
            ) : null}
          </div>
        ) : null}
        <div ref={topRef} className="relative">
          <ul role="list" className="relative flex flex-col">
            {shownItems.map((n, i) => (
              <NoticeRow
                key={n.id}
                notice={n}
                source={sources.get(n.source)}
                now={now}
                stack={
                  stacked
                    ? {
                        count: section.items.length,
                        unread: unreadCount,
                        kind: stackKind,
                      }
                    : undefined
                }
                deal={
                  section.stackable && i > 0
                    ? {
                        index: i,
                        top: () =>
                          (topRef.current?.querySelector(
                            ":scope > ul > li",
                          ) as HTMLElement | null) ?? null,
                        kind: stackKind,
                      }
                    : undefined
                }
                gathering={gathering && i > 0}
                isTop={section.stackable && i === 0}
                selected={selected === n.id}
                tabStop={tabStop === n.id}
                motionSafe={motionSafe}
                disabled={disabled}
                sweepDelay={sweepDelays[n.id] ?? 0}
                isLive={isLive}
                bind={bind}
                register={register}
                onActivate={onActivate}
                onKey={onKey}
                onToggleRead={onToggleRead}
                onGone={(id) => onGone([id])}
                onThrown={stacked && n.id === top?.id ? leaveWhole : undefined}
                play={play}
              />
            ))}
          </ul>
        </div>
      </div>
    </motion.li>
  );
}

/* -------------------------------- surface -------------------------------- */

type Mode = "phone" | "tablet" | "desktop";

const TABS: { id: NoticeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
];

/**
 * A notification center. Notices from one source stack into a deck that
 * deals out when pressed — the hidden rows start where their layers were and
 * glide down to their places — and gather back under the top card. A row (or
 * a whole stack) follows a sideways swipe 1:1 and leaves when thrown, and the
 * rows under it close the gap. Mark all read sends a band down the list that
 * clears each unread row as it passes; the tabs' pill slides between All,
 * Unread and Mentions, and every time rolls over as `now` moves on.
 *
 * Rows are one roving tab stop: arrows move, Enter opens, Right deals a stack
 * and Left gathers it, Delete dismisses, U toggles read. Under reduced motion
 * nothing travels: rows fade in place, the band is skipped and read states
 * cross-fade together, while every count and dot still changes.
 */
export function NoticeCenter({
  notices: noticesProp,
  defaultNotices: initialNotices,
  onNoticesChange,
  sources = defaultNoticeSources,
  now,
  filter: filterProp,
  defaultFilter = "all",
  onFilterChange,
  selected: selectedProp,
  defaultSelected = null,
  onSelectedChange,
  onOpen,
  onDismiss,
  onMarkAllRead,
  onReadChange,
  onRetry,
  stack = "deck",
  sweep = 480,
  group = "source",
  title = "Notifications",
  status = "ready",
  label,
  sound = false,
  disabled = false,
  className,
}: NoticeCenterProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;
  const nowMs = toMs(now);
  const sweepMs = Math.max(0, sweep);

  const [own, setOwn] = React.useState<Notice[]>(
    () => initialNotices ?? defaultNotices,
  );
  const notices = noticesProp ?? own;
  const [ownFilter, setOwnFilter] = React.useState<NoticeFilter>(defaultFilter);
  const filter = filterProp ?? ownFilter;
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected,
  );
  const selected = selectedProp !== undefined ? selectedProp : ownSelected;
  const [width, setWidth] = React.useState<number | null>(null);
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [gathering, setGathering] = React.useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = React.useState<string | null>(null);
  const [rove, setRove] = React.useState<string | null>(null);
  // Rows read while the Unread tab is showing stay in it until the tab
  // changes: a row that vanished as it was opened would take focus with it.
  const [stay, setStay] = React.useState<{
    filter: NoticeFilter;
    ids: string[];
  }>(() => ({ filter: defaultFilter, ids: [] }));
  // A new tab starts clean, whoever changed it; reset here in render rather
  // than in an effect.
  const [seenFilter, setSeenFilter] = React.useState(filter);
  if (seenFilter !== filter) {
    setSeenFilter(filter);
    setStay({ filter, ids: [] });
  }
  const [sweepState, setSweepState] = React.useState<{
    n: number;
    delays: Record<string, number>;
    from: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const mode: Mode =
    width === null
      ? "phone"
      : width < PHONE
        ? "phone"
        : width < DESKTOP
          ? "tablet"
          : "desktop";

  const sourceMap = React.useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );

  /* ----------------------------- derived data ----------------------------- */

  const sorted = [...notices].sort((a, b) => b.at - a.at);
  const unreadCount = notices.filter((n) => !n.read).length;
  const mentionCount = notices.filter((n) => n.mention).length;
  const counts: Record<NoticeFilter, number> = {
    all: notices.length,
    unread: unreadCount,
    mentions: mentionCount,
  };
  const shownUnread = sweepState ? sweepState.from : unreadCount;

  const kept = stay.filter === filter ? stay.ids : [];
  const passes = (n: Notice) =>
    (filter === "all" ||
      (filter === "unread" && (!n.read || kept.includes(n.id))) ||
      (filter === "mentions" && !!n.mention)) &&
    (mode !== "desktop" || sourceFilter === null || n.source === sourceFilter);
  const list = sorted.filter(passes);

  const sections: SectionData[] = [];
  if (group === "source") {
    const by = new Map<string, Notice[]>();
    for (const n of list) {
      const arr = by.get(n.source) ?? [];
      arr.push(n);
      by.set(n.source, arr);
    }
    for (const [key, items] of by) {
      const source = sourceMap.get(key);
      sections.push({
        key,
        label: source?.name ?? key,
        source,
        items,
        stackable: items.length > 1,
      });
    }
  } else if (group === "day") {
    const buckets: [string, string][] = [
      ["today", "Today"],
      ["yesterday", "Yesterday"],
      ["earlier", "Earlier"],
    ];
    for (const [key, name] of buckets) {
      const items = list.filter((n) => {
        const gap = dayOf(nowMs) - dayOf(n.at);
        return key === "today"
          ? gap <= 0
          : key === "yesterday"
            ? gap === 1
            : gap > 1;
      });
      if (items.length)
        sections.push({ key, label: name, items, stackable: false });
    }
  } else if (list.length) {
    sections.push({ key: "all", label: "", items: list, stackable: false });
  }

  const isOpen = (key: string) => expanded.includes(key);
  const order: string[] = [];
  for (const s of sections) {
    if (s.stackable && !isOpen(s.key)) {
      if (s.items[0]) order.push(s.items[0].id);
    } else {
      for (const n of s.items) order.push(n.id);
    }
  }
  const sectionOf = (id: string) =>
    sections.find((s) => s.items.some((n) => n.id === id));
  const tabStop = rove && order.includes(rove) ? rove : (order[0] ?? null);
  const selectedNotice = notices.find((n) => n.id === selected) ?? null;

  /* --------------------------------- refs --------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const rows = React.useRef(new Map<string, HTMLButtonElement>());
  const apis = React.useRef(new Map<string, RowApi>());
  const tabs = React.useRef(new Map<NoticeFilter, HTMLButtonElement>());
  const timers = React.useRef(new Set<number>());
  const liveRef = React.useRef(false);
  const focusWant = React.useRef<string | null>(null);
  const band = useMotionValue(-80);
  const bandAnim = React.useRef<AnimationPlaybackControls | null>(null);

  const isLive = React.useCallback(() => liveRef.current, []);

  React.useLayoutEffect(() => {
    liveRef.current = true;
  }, []);

  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    setWidth(Math.round(node.offsetWidth));
    const ro = new ResizeObserver(() => setWidth(Math.round(node.offsetWidth)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const play: Play = React.useCallback(
    (tone, pitch, el) => {
      const rect = el?.getBoundingClientRect();
      audio.play(tone, {
        pitch,
        gain: tone === "swish" ? 0.45 : 0.5,
        pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
      });
    },
    [audio],
  );

  const bind = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (!node) return;
      const map = rows.current;
      map.set(id, node);
      if (focusWant.current === id) {
        focusWant.current = null;
        node.focus({ preventScroll: false });
      }
      return () => {
        if (map.get(id) === node) map.delete(id);
      };
    },
    [],
  );

  const register = React.useCallback((id: string, api: RowApi) => {
    apis.current.set(id, api);
    return () => {
      if (apis.current.get(id) === api) apis.current.delete(id);
    };
  }, []);

  // Focus that was waiting for a row (after a dismiss or a gather) lands as
  // soon as that row is in the list.
  const orderKey = order.join("|");
  React.useLayoutEffect(() => {
    const id = focusWant.current;
    if (!id) return;
    const node = rows.current.get(id);
    if (!node) return;
    focusWant.current = null;
    node.focus();
  }, [orderKey]);

  React.useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live) window.clearTimeout(t);
      live.clear();
      bandAnim.current?.stop();
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /* ------------------------------- actions -------------------------------- */

  const commit = (next: Notice[]) => {
    if (noticesProp === undefined) setOwn(next);
    onNoticesChange?.(next);
  };

  const select = (id: string | null) => {
    if (id === selected) return;
    if (selectedProp === undefined) setOwnSelected(id);
    onSelectedChange?.(id);
  };

  const setFilter = (f: NoticeFilter) => {
    if (f === filter) return;
    if (filterProp === undefined) setOwnFilter(f);
    onFilterChange?.(f);
  };

  const expand = (key: string) => {
    if (isOpen(key)) return;
    setExpanded((e) => [...e, key]);
    const s = sections.find((x) => x.key === key);
    play("pop", 1.1, rows.current.get(s?.items[0]?.id ?? ""));
    if (s) say(`Showing ${s.items.length} from ${s.label}.`);
  };

  const collapse = (key: string) => {
    if (!isOpen(key) || gathering.includes(key)) return;
    const s = sections.find((x) => x.key === key);
    const topId = s?.items[0]?.id;
    const hadFocus = !!rootRef.current?.contains(document.activeElement);
    play("pop", 0.9, rows.current.get(topId ?? ""));
    if (s) say(`Collapsed ${s.label}.`);
    const done = () => {
      setGathering((g) => g.filter((k) => k !== key));
      setExpanded((e) => e.filter((k) => k !== key));
      if (hadFocus && topId) {
        setRove(topId);
        focusWant.current = topId;
      }
    };
    if (!motionSafe) {
      done();
      return;
    }
    setGathering((g) => [...g, key]);
    if (hadFocus && topId) {
      setRove(topId);
      rows.current.get(topId)?.focus();
    }
    later(done, Math.round(durations.base * 1000));
  };

  const keep = (ids: string[]) =>
    setStay((s) => ({
      filter,
      ids: s.filter === filter ? [...s.ids, ...ids] : ids,
    }));

  const markRead = (id: string, read: boolean) => {
    const n = notices.find((x) => x.id === id);
    if (!n || !!n.read === read) return false;
    if (read) keep([id]);
    commit(notices.map((x) => (x.id === id ? { ...x, read } : x)));
    onReadChange?.(id, read);
    return true;
  };

  const activate = (id: string) => {
    if (disabled) return;
    const s = sectionOf(id);
    setRove(id);
    if (s && s.stackable && !isOpen(s.key) && s.items[0]?.id === id) {
      expand(s.key);
      return;
    }
    const changed = markRead(id, true);
    if (changed) play("pop", 1.2, rows.current.get(id));
    select(id);
    onOpen?.(id);
    const n = notices.find((x) => x.id === id);
    if (n) say(sentence(`Opened ${n.title}`));
  };

  const toggleRead = (id: string) => {
    const n = notices.find((x) => x.id === id);
    if (!n || disabled) return;
    markRead(id, !n.read);
    play("pop", n.read ? 0.9 : 1.2, rows.current.get(id));
    say(`Marked ${n.title} as ${n.read ? "unread" : "read"}.`);
  };

  const gone = (ids: string[]) => {
    const removed = notices.filter((n) => ids.includes(n.id));
    if (!removed.length) return;
    // Focus that was on a leaving row moves to the row after it.
    const at = order.findIndex((id) => ids.includes(id));
    const hadFocus = ids.some(
      (id) => rows.current.get(id) === document.activeElement,
    );
    const rest = order.filter((id) => !ids.includes(id));
    if (hadFocus) {
      const next = rest[Math.min(Math.max(0, at), rest.length - 1)] ?? null;
      focusWant.current = next;
      if (next) setRove(next);
    }
    commit(notices.filter((n) => !ids.includes(n.id)));
    onDismiss?.(ids);
    if (selected && ids.includes(selected)) select(null);
    const first = removed[0];
    say(
      removed.length === 1 && first
        ? sentence(`Dismissed ${first.title}`)
        : `Dismissed ${removed.length} notifications${first ? ` from ${sourceMap.get(first.source)?.name ?? "this source"}` : ""}.`,
    );
  };

  const markAll = () => {
    const ids = notices.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length || disabled) return;
    const box = scrollerRef.current;
    const delays: Record<string, number> = {};
    if (box && motionSafe) {
      const rect = box.getBoundingClientRect();
      for (const id of ids) {
        const node = rows.current.get(id);
        if (!node) continue;
        const r = node.getBoundingClientRect();
        const t = Math.min(
          1,
          Math.max(
            0,
            (r.top + r.height / 2 - rect.top) / Math.max(1, rect.height),
          ),
        );
        delays[id] = Math.round(t * sweepMs);
      }
      bandAnim.current?.stop();
      band.jump(-80);
      bandAnim.current = animate(band, box.offsetHeight + 8, {
        duration: sweepMs / 1000,
        ease: easings.move,
      });
    }
    play("swish", 1.15, box);
    setSweepState((s) => ({ n: (s?.n ?? 0) + 1, delays, from: unreadCount }));
    keep(ids);
    commit(notices.map((n) => (n.read ? n : { ...n, read: true })));
    onMarkAllRead?.(ids);
    say(
      `Marked ${plural(ids.length, "notification", "notifications")} as read.`,
    );
    later(
      () => setSweepState(null),
      motionSafe ? sweepMs + Math.round(durations.base * 1000) : 0,
    );
  };

  const onRowKey = (
    id: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const i = order.indexOf(id);
    const focusAt = (j: number) => {
      const next = order[Math.min(order.length - 1, Math.max(0, j))];
      if (!next || next === id) return;
      setRove(next);
      rows.current.get(next)?.focus();
    };
    const s = sectionOf(id);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(i - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(order.length - 1);
        return;
      case "ArrowRight":
        if (s?.stackable && !isOpen(s.key)) {
          event.preventDefault();
          expand(s.key);
        }
        return;
      case "ArrowLeft":
        if (s?.stackable && isOpen(s.key)) {
          event.preventDefault();
          collapse(s.key);
        }
        return;
    }
  };

  const onTabKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.id === filter);
    let j = -1;
    if (event.key === "ArrowRight") j = (i + 1) % TABS.length;
    else if (event.key === "ArrowLeft") j = (i - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") j = 0;
    else if (event.key === "End") j = TABS.length - 1;
    if (j === -1) return;
    event.preventDefault();
    const t = TABS[j];
    if (!t) return;
    setFilter(t.id);
    tabs.current.get(t.id)?.focus();
  };

  /* -------------------------------- render -------------------------------- */

  const delays = sweepState?.delays ?? {};

  const emptyText =
    filter === "unread"
      ? "No unread notifications."
      : filter === "mentions"
        ? "Nobody has mentioned you."
        : "You’re all caught up.";

  const listView =
    status === "loading" ? (
      <ul aria-hidden className="flex flex-col gap-1.5 p-3">
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className="flex gap-3 rounded-3 border border-hairline bg-card p-2.5 motion-safe:animate-pulse"
          >
            <span className="size-8 shrink-0 rounded-2 bg-surface-2" />
            <span className="flex flex-1 flex-col gap-1.5 py-0.5">
              <span className="h-3 w-2/3 rounded-1 bg-surface-2" />
              <span className="h-2.5 w-full rounded-1 bg-surface-2" />
              <span className="h-2.5 w-4/5 rounded-1 bg-surface-2" />
            </span>
          </li>
        ))}
      </ul>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <CircleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">Notifications could not load.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Retry
          </button>
        ) : null}
      </div>
    ) : sections.length === 0 ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-2 p-6 text-center">
        <Inbox aria-hidden className="size-5 text-ink-3" />
        <p className="text-[13px] text-ink-2">{emptyText}</p>
      </div>
    ) : (
      <ul role="list" className="flex flex-col p-3 pb-0">
        <AnimatePresence initial={false}>
          {sections.map((s) => (
            <Section
              key={`${group}-${s.key}`}
              section={s}
              group={group}
              stackKind={stack}
              expanded={isOpen(s.key)}
              gathering={gathering.includes(s.key)}
              sources={sourceMap}
              now={nowMs}
              selected={mode === "phone" ? null : selected}
              tabStop={tabStop}
              motionSafe={motionSafe}
              disabled={disabled}
              sweepDelays={delays}
              isLive={isLive}
              bind={bind}
              register={register}
              onActivate={activate}
              onKey={onRowKey}
              onToggleRead={toggleRead}
              onGone={gone}
              onCollapse={collapse}
              play={play}
            />
          ))}
        </AnimatePresence>
      </ul>
    );

  const tabsView = (
    <div
      role="tablist"
      aria-label="Filter notifications"
      className="flex shrink-0 items-center gap-1 border-b border-hairline px-3 py-2"
    >
      {TABS.map((t) => {
        const on = t.id === filter;
        const n = t.id === "unread" ? shownUnread : counts[t.id];
        return (
          <button
            key={t.id}
            ref={(node) => {
              if (node) tabs.current.set(t.id, node);
            }}
            type="button"
            role="tab"
            id={`${uid}-tab-${t.id}`}
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            disabled={disabled}
            onClick={() => setFilter(t.id)}
            onKeyDown={onTabKey}
            className={cn(
              "relative inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed",
              on ? "text-foreground" : "text-ink-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${uid}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-full border border-hairline-strong bg-card"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">{t.label}</span>
            {status === "ready" ? (
              <Roll
                value={String(n)}
                motionSafe={motionSafe}
                className={cn(
                  "relative h-4 font-mono text-[10px] leading-4 tabular-nums",
                  t.id === "unread" && n > 0
                    ? "text-cobalt-bright"
                    : "text-ink-3",
                )}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const listColumn = (
    <div className="grid grid-rows-[auto_minmax(0,1fr)]">
      {tabsView}
      <div className="relative grid grid-rows-[minmax(0,1fr)]">
        <div
          ref={scrollerRef}
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${uid}-tab-${filter}`}
          className="[scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain"
        >
          {listView}
        </div>
        {motionSafe && sweepState ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-clip"
          >
            <motion.div
              className="absolute inset-x-0 top-0 flex h-20 items-center bg-linear-to-b from-transparent via-cobalt-wash to-transparent"
              style={{ y: band }}
            >
              <span className="h-px w-full bg-linear-to-r from-transparent via-cobalt-bright/45 to-transparent" />
            </motion.div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const detail =
    mode === "phone" ? null : (
      <section
        aria-label="Notification"
        className="relative [scrollbar-width:thin] overflow-y-auto overscroll-contain border-l border-hairline"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {selectedNotice ? (
            <motion.div
              key={selectedNotice.id}
              className="flex flex-col gap-4 p-5"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                opacity: { duration: durations.base, ease: easings.enter },
                y: motionSafe ? springs.glide : { duration: 0 },
              }}
            >
              <div className="flex items-center gap-2">
                <SourceIcon source={sourceMap.get(selectedNotice.source)} />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-ink-2">
                    {sourceMap.get(selectedNotice.source)?.name ?? "Notice"}
                  </p>
                  <p className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {absolute(selectedNotice.at)} UTC ·{" "}
                    {spoken(selectedNotice.at, nowMs)}
                  </p>
                </div>
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {selectedNotice.title}
              </h3>
              {selectedNotice.body ? (
                <p className="text-[13px] leading-relaxed text-ink-2">
                  {selectedNotice.body}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleRead(selectedNotice.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                    FOCUS_RING,
                  )}
                >
                  <Mail aria-hidden className="size-3.5" />
                  {selectedNotice.read ? "Mark as unread" : "Mark as read"}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const api = apis.current.get(selectedNotice.id);
                    if (api) api.throwOut(1);
                    else gone([selectedNotice.id]);
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                  Dismiss
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="none"
              className="flex h-full flex-col items-center-safe justify-center-safe gap-2 p-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              <Bell aria-hidden className="size-5 text-ink-3" />
              <p className="text-[13px] text-ink-3">
                Select a notification to read it here.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    );

  const rail =
    mode === "desktop" ? (
      <nav
        aria-label="Sources"
        className="[scrollbar-width:thin] overflow-y-auto overscroll-contain border-r border-hairline p-3"
      >
        <p className="mb-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Sources
        </p>
        <ul className="flex flex-col gap-0.5">
          {[null, ...sources.map((s) => s.id)].map((id) => {
            const src = id ? sourceMap.get(id) : undefined;
            const n = notices.filter(
              (x) => !x.read && (id === null || x.source === id),
            ).length;
            const on = sourceFilter === id;
            return (
              <li key={id ?? "all"}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => setSourceFilter(id)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left text-[12px] transition-colors hover:bg-surface-2 disabled:cursor-not-allowed",
                    on ? "bg-surface-2 text-foreground" : "text-ink-2",
                    FOCUS_RING_IN,
                  )}
                >
                  {src ? (
                    <SourceIcon source={src} size="sm" />
                  ) : (
                    <span
                      aria-hidden
                      className="inline-flex size-5 items-center justify-center rounded-1 bg-surface-2 text-ink-2"
                    >
                      <Bell className="size-3" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {src?.name ?? "All sources"}
                  </span>
                  {n > 0 ? (
                    <span className="font-mono text-[10px] text-cobalt-bright tabular-nums">
                      {n}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    ) : null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container grid h-[560px] w-full grid-rows-[auto_minmax(0,1fr)] overflow-clip rounded-4 border border-hairline bg-surface-0 text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        <h2
          id={titleId}
          className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold"
        >
          <span className="truncate">{title}</span>
          {status === "ready" && shownUnread > 0 ? (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-cobalt-wash px-1.5 font-mono text-[10px] font-medium text-cobalt-bright tabular-nums">
              <Roll
                value={String(shownUnread)}
                motionSafe={motionSafe}
                className="h-4 leading-4"
              />
              <span className="sr-only"> unread</span>
            </span>
          ) : null}
        </h2>
        <button
          type="button"
          disabled={disabled || unreadCount === 0 || status !== "ready"}
          onClick={markAll}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-[color,background-color,opacity] hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
            FOCUS_RING,
          )}
        >
          <CheckCheck aria-hidden className="size-3.5" />
          Mark all read
        </button>
      </header>

      <div
        className={cn(
          "grid grid-rows-[minmax(0,1fr)]",
          mode === "tablet" && "grid-cols-[21rem_minmax(0,1fr)]",
          mode === "desktop" && "grid-cols-[13rem_21rem_minmax(0,1fr)]",
        )}
      >
        {rail}
        {listColumn}
        {detail}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
