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
  Archive,
  ClipboardList,
  GripVertical,
  Inbox,
  Mail,
  MessagesSquare,
  Phone,
  Plus,
  Star,
  Tag,
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
import { useDrag, type DragInfo } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type FeedbackSource = "email" | "call" | "survey" | "chat" | "review";
export type FeedbackSentiment = "positive" | "neutral" | "negative";

export type FeedbackItem = {
  id: string;
  quote: string;
  customer: string;
  company: string;
  source: FeedbackSource;
  plan: string;
  sentiment: FeedbackSentiment;
  /** When it arrived, in ms since the epoch. */
  at: number;
  /** The theme it was sorted into; untagged items wait in the inbox. */
  themeId?: string | null;
  archived?: boolean;
};

export type FeedbackTheme = { id: string; name: string };

export type ThemeSorterBucketStyle = "tray" | "jar" | "row";
export type ThemeSorterDensity = "compact" | "regular" | "roomy";
export type ThemeSorterSentimentPalette = "signal" | "duo" | "mono";
export type ThemeSorterStatus = "ready" | "loading" | "error";

export type ThemeSorterProps = {
  /** Controlled feedback items. Tags and archives come back through `onItemsChange`. */
  items?: FeedbackItem[];
  /** Initial items when uncontrolled. @default defaultThemeSorterItems (22, nine to sort) */
  defaultItems?: FeedbackItem[];
  /** Fires with every item after a tag, an archive or a failed tag's revert. */
  onItemsChange?: (items: FeedbackItem[]) => void;
  /** Controlled themes. */
  themes?: FeedbackTheme[];
  /** Initial themes when uncontrolled. @default defaultThemeSorterThemes (5) */
  defaultThemes?: FeedbackTheme[];
  /** Fires with every theme after one is created. */
  onThemesChange?: (themes: FeedbackTheme[]) => void;
  /** An item was tagged. Return a promise; a rejection puts the item back in the inbox. */
  onTag?: (itemId: string, themeId: string) => void | Promise<unknown>;
  /** A theme was created from the theme menu. */
  onCreateTheme?: (theme: FeedbackTheme) => void;
  /** An item was archived without a theme. */
  onArchive?: (itemId: string) => void;
  /** How a theme looks: a tray with a share bar and sentiment mix, a jar that fills, or a compact row. Chips at narrow widths keep a hint of each. @default "tray" */
  bucketStyle?: ThemeSorterBucketStyle;
  /** Card padding, quote size and gaps. @default "regular" */
  density?: ThemeSorterDensity;
  /** Sentiment colours: green, amber and red; cobalt and amber; or ink, told apart by the mark's shape. @default "signal" */
  sentimentPalette?: ThemeSorterSentimentPalette;
  /** The moment ages count from (Date or ms). @default defaultThemeSorterNow */
  now?: number | Date;
  /** Whether the items have arrived. @default "ready" */
  status?: ThemeSorterStatus;
  /** "Try again" was pressed after the items failed to load. */
  onRetry?: () => void;
  /** The inbox's heading and accessible name. @default "Feedback inbox" */
  title?: string;
  /** Tallest the surface grows before its columns scroll, px. @default 540 */
  maxHeight?: number;
  /** Nothing can be dragged, tagged, created or archived. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A fixed morning, so ages render the same everywhere. */
export const defaultThemeSorterNow = Date.UTC(2026, 9, 16, 10, 0);
const N = defaultThemeSorterNow;

export const defaultThemeSorterThemes: FeedbackTheme[] = [
  { id: "pricing", name: "Pricing" },
  { id: "onboarding", name: "Onboarding" },
  { id: "exports", name: "Exports" },
  { id: "mobile", name: "Mobile app" },
  { id: "permissions", name: "Permissions" },
];

type Seed = [
  string,
  string,
  string,
  FeedbackSource,
  string,
  FeedbackSentiment,
  number,
  string | null,
];

const SEEDS: Seed[] = [
  [
    "The jump from Team to Business is too steep for a crew of twelve.",
    "Ana Ruiz",
    "Coldbrook",
    "email",
    "Team",
    "negative",
    3 * HOUR,
    null,
  ],
  [
    "Setting up our first workspace took ten minutes. Lovely.",
    "Theo Park",
    "Basinworks",
    "survey",
    "Starter",
    "positive",
    5 * HOUR,
    null,
  ],
  [
    "I export the same report every Monday by hand. Can it just arrive?",
    "Mira Holt",
    "Coldbrook",
    "chat",
    "Business",
    "neutral",
    9 * HOUR,
    null,
  ],
  [
    "The app logs me out every time I switch to the camera.",
    "Jonah Reyes",
    "Basinworks",
    "review",
    "Team",
    "negative",
    14 * HOUR,
    null,
  ],
  [
    "We need viewers who can comment but not edit.",
    "Priya Shah",
    "Coldbrook",
    "call",
    "Enterprise",
    "neutral",
    1 * DAY,
    null,
  ],
  [
    "Annual billing saved us a lot. Thanks for adding it.",
    "Sam Okoro",
    "Basinworks",
    "email",
    "Business",
    "positive",
    1 * DAY + 4 * HOUR,
    null,
  ],
  [
    "Invite emails landed in spam for half the team.",
    "Lena Fox",
    "Coldbrook",
    "chat",
    "Team",
    "negative",
    2 * DAY,
    null,
  ],
  [
    "CSV exports drop the leading zeros from our part numbers.",
    "Ravi Menon",
    "Basinworks",
    "email",
    "Team",
    "negative",
    2 * DAY + 6 * HOUR,
    null,
  ],
  [
    "Dark mode on the phone at night would be great.",
    "Elif Kaya",
    "Coldbrook",
    "survey",
    "Starter",
    "neutral",
    3 * DAY,
    null,
  ],
  [
    "Seat price is fine but the storage add-on is not.",
    "Noah Bell",
    "Coldbrook",
    "call",
    "Business",
    "negative",
    4 * DAY,
    "pricing",
  ],
  [
    "Happy to pay more for the audit log.",
    "Ines Marlow",
    "Basinworks",
    "survey",
    "Enterprise",
    "positive",
    5 * DAY,
    "pricing",
  ],
  [
    "Hard to tell what the Starter plan leaves out.",
    "Kenji Ito",
    "Coldbrook",
    "chat",
    "Starter",
    "neutral",
    6 * DAY,
    "pricing",
  ],
  [
    "The checklist on day one was exactly right.",
    "Ada Quinn",
    "Basinworks",
    "survey",
    "Team",
    "positive",
    4 * DAY,
    "onboarding",
  ],
  [
    "We could not find where to import old records.",
    "Omar Diaz",
    "Coldbrook",
    "email",
    "Business",
    "negative",
    5 * DAY,
    "onboarding",
  ],
  [
    "Sample data made the first demo easy.",
    "Tara Lund",
    "Basinworks",
    "review",
    "Starter",
    "positive",
    6 * DAY,
    "onboarding",
  ],
  [
    "Took us three tries to connect single sign-on.",
    "Felix Grau",
    "Coldbrook",
    "call",
    "Enterprise",
    "negative",
    7 * DAY,
    "onboarding",
  ],
  [
    "Exports time out on our biggest workspace.",
    "Rosa Lind",
    "Basinworks",
    "email",
    "Enterprise",
    "negative",
    5 * DAY,
    "exports",
  ],
  [
    "Love that exports keep the column order.",
    "Hugo Brandt",
    "Coldbrook",
    "survey",
    "Team",
    "positive",
    8 * DAY,
    "exports",
  ],
  [
    "Photos upload twice when the signal drops.",
    "Maya Chen",
    "Basinworks",
    "review",
    "Team",
    "negative",
    6 * DAY,
    "mobile",
  ],
  [
    "Contractors see more than they should.",
    "Leo Novak",
    "Coldbrook",
    "call",
    "Business",
    "negative",
    3 * DAY,
    "permissions",
  ],
  [
    "Role templates would save us an afternoon a month.",
    "Zara Ali",
    "Basinworks",
    "chat",
    "Enterprise",
    "neutral",
    5 * DAY,
    "permissions",
  ],
  [
    "Guest access is simple and safe. Nice work.",
    "Ben Ortiz",
    "Coldbrook",
    "survey",
    "Team",
    "positive",
    9 * DAY,
    "permissions",
  ],
];

/** Twenty-two quotes from Coldbrook and Basinworks customers; nine wait to be sorted. */
export const defaultThemeSorterItems: FeedbackItem[] = SEEDS.map(
  ([quote, customer, company, source, plan, sentiment, age, themeId], i) => ({
    id: `fb-${101 + i}`,
    quote,
    customer,
    company,
    source,
    plan,
    sentiment,
    at: N - age,
    themeId,
  }),
);

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const SOURCE: Record<
  FeedbackSource,
  { icon: React.ComponentType<{ className?: string }>; word: string }
> = {
  email: { icon: Mail, word: "Email" },
  call: { icon: Phone, word: "Call" },
  survey: { icon: ClipboardList, word: "Survey" },
  chat: { icon: MessagesSquare, word: "Chat" },
  review: { icon: Star, word: "Review" },
};

const SENTIMENTS: FeedbackSentiment[] = ["positive", "neutral", "negative"];

const PALETTE: Record<
  ThemeSorterSentimentPalette,
  Record<FeedbackSentiment, string>
> = {
  signal: {
    positive: "var(--success)",
    neutral: "var(--ink-3)",
    negative: "var(--danger)",
  },
  duo: {
    positive: "var(--accent-bright)",
    neutral: "var(--ink-3)",
    negative: "var(--warn)",
  },
  mono: {
    positive: "var(--ink-2)",
    neutral: "var(--ink-3)",
    negative: "var(--ink-2)",
  },
};

const DENSITY: Record<
  ThemeSorterDensity,
  { card: string; quote: string; gap: string; pad: string }
> = {
  compact: {
    card: "py-2 pr-2.5 pl-2",
    quote: "text-[12.5px] leading-[18px]",
    gap: "gap-1.5",
    pad: "p-3",
  },
  regular: {
    card: "py-2.5 pr-3 pl-2.5",
    quote: "text-[13px] leading-5",
    gap: "gap-2",
    pad: "p-4",
  },
  roomy: {
    card: "py-3.5 pr-3.5 pl-3",
    quote: "text-[13.5px] leading-[22px]",
    gap: "gap-3",
    pad: "p-5",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

function ago(at: number, now: number) {
  const h = Math.max(0, Math.round((now - at) / HOUR));
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "theme";

/** Themes by count, most first; ties by name so the order is stable. */
const rank = (themes: FeedbackTheme[], counts: Map<string, number>) =>
  [...themes]
    .sort(
      (a, b) =>
        (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )
    .map((t) => t.id);

/** The sentiment mark: a dot, a ring and a diamond, so ink alone still reads. */
function SentimentMark({
  sentiment,
  color,
}: {
  sentiment: FeedbackSentiment;
  color: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 shrink-0">
      {sentiment === "positive" ? (
        <circle cx="5" cy="5" r="3.6" style={{ fill: color }} />
      ) : sentiment === "neutral" ? (
        <circle
          cx="5"
          cy="5"
          r="3.1"
          fill="none"
          strokeWidth="1.4"
          style={{ stroke: color }}
        />
      ) : (
        <path d="M5 1 L9 5 L5 9 L1 5 Z" style={{ fill: color }} />
      )}
    </svg>
  );
}

/** A count whose digits roll toward the way it moved, on snap. */
function Rolling({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const text = String(value);
  const [shown, setShown] = React.useState({ value, dir: 1 });
  if (shown.value !== value) {
    setShown({ value, dir: value > shown.value ? 1 : -1 });
  }
  const dir = shown.dir;
  return (
    <span
      className={cn(
        "relative inline-flex h-4 justify-center overflow-clip leading-4 tabular-nums",
        className,
      )}
      style={{ width: `${text.length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block leading-[inherit]"
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 9 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 9 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** What a card shows; drawn again, inert, for the copy that follows the hand. */
function CardBody({
  item,
  color,
  nowMs,
  quoteClass,
  failed,
}: {
  item: FeedbackItem;
  color: string;
  nowMs: number;
  quoteClass: string;
  failed: boolean;
}) {
  const Source = SOURCE[item.source].icon;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <p
        title={item.quote}
        className={cn("line-clamp-2 text-foreground", quoteClass)}
      >
        “{item.quote}”
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Source className="size-3 shrink-0" />
          <span className="truncate">
            {item.customer} · {item.company}
          </span>
        </span>
        <span className="inline-flex h-4 shrink-0 items-center rounded-full border border-hairline-strong px-1.5 text-[10px] leading-none text-ink-2">
          {item.plan}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1">
          <SentimentMark sentiment={item.sentiment} color={color} />
          <span className="hidden @min-[30rem]/theme-sorter:inline">
            {item.sentiment}
          </span>
        </span>
        <span className="shrink-0">{ago(item.at, nowMs)}</span>
      </div>
      {failed ? (
        <p className="flex items-center gap-1 text-[11px] text-danger">
          <TriangleAlert className="size-3 shrink-0" />
          Could not tag. Try again.
        </p>
      ) : null}
    </div>
  );
}

/** One inbox card. Its own component: it owns a drag. */
function Card({
  item,
  index,
  active,
  hidden,
  failed,
  disabled,
  motionSafe,
  color,
  nowMs,
  d,
  register,
  onFocusCard,
  onKey,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  onTagPress,
  onArchivePress,
  menu,
  step,
}: {
  item: FeedbackItem;
  index: number;
  active: boolean;
  hidden: boolean;
  failed: boolean;
  disabled: boolean;
  motionSafe: boolean;
  color: string;
  nowMs: number;
  d: (typeof DENSITY)[ThemeSorterDensity];
  register: (id: string, node: HTMLDivElement | null) => void;
  onFocusCard: (id: string) => void;
  onKey: (
    event: React.KeyboardEvent<HTMLDivElement>,
    item: FeedbackItem,
  ) => void;
  onDragStart: (item: FeedbackItem, node: HTMLElement) => void;
  onDragMove: (info: DragInfo) => void;
  onDragEnd: (info: DragInfo) => void;
  onDragCancel: () => void;
  onTagPress: (item: FeedbackItem) => void;
  onArchivePress: (item: FeedbackItem) => void;
  menu: React.ReactNode;
  step: number;
}) {
  const node = React.useRef<HTMLDivElement | null>(null);
  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      if (node.current) onDragStart(item, node.current);
    },
    onMove: onDragMove,
    onEnd: onDragEnd,
    onCancel: onDragCancel,
    onTap: () => node.current?.focus(),
  });
  const name = `${item.quote} ${item.customer}, ${item.company}, ${item.plan} plan, ${item.sentiment}, ${SOURCE[item.source].word.toLowerCase()}, ${ago(item.at, nowMs)}.${failed ? " Could not tag." : ""}`;
  return (
    <motion.li
      layout={motionSafe ? "position" : false}
      initial={
        failed && motionSafe
          ? { opacity: 0, scale: 0.88 }
          : motionSafe
            ? { opacity: 0, y: distances.step }
            : { opacity: 0 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      // A leaving card cannot be given new props, so how it leaves arrives
      // through the presence's `custom`: archived cards slide out, tagged
      // ones vanish under the copy that is being squeezed.
      variants={{
        leave: (kinds: Record<string, "archive" | "tag"> | undefined) =>
          kinds?.[item.id] === "archive"
            ? {
                opacity: 0,
                x: motionSafe ? distances.shift : 0,
                transition: exitFor(durations.base),
              }
            : { opacity: 0, transition: { duration: 0 } },
      }}
      exit="leave"
      transition={{
        layout: springs.glide,
        scale: motionSafe ? springs.recoil : { duration: 0 },
        y: motionSafe
          ? { ...springs.glide, delay: index * step }
          : { duration: 0 },
        opacity: {
          duration: motionSafe ? durations.base : durations.fast,
          ease: easings.enter,
          delay: motionSafe && !failed ? index * step : 0,
        },
      }}
      className="relative"
    >
      <div
        ref={(n) => {
          node.current = n;
          register(item.id, n);
        }}
        role="group"
        aria-label={name}
        aria-keyshortcuts="T A"
        tabIndex={active ? 0 : -1}
        onFocus={(event) => {
          if (event.target === event.currentTarget) onFocusCard(item.id);
        }}
        onKeyDown={(event) => onKey(event, item)}
        {...drag}
        onPointerDown={(event) => {
          // On touch the grip is the handle, so the list still scrolls
          // under a finger anywhere else on the card.
          if (
            event.pointerType === "touch" &&
            !(event.target as Element).closest("[data-ts-grip]")
          ) {
            return;
          }
          drag.onPointerDown(event);
        }}
        className={cn(
          "group/theme-sorter relative flex touch-pan-y rounded-3 border bg-card transition-[border-color,opacity] duration-150 select-none",
          d.card,
          d.gap,
          hidden
            ? "border-transparent bg-transparent"
            : failed
              ? "border-danger/50"
              : "border-hairline",
          disabled ? "cursor-default" : "cursor-grab",
          FOCUS_RING,
        )}
        style={{
          borderLeftColor: hidden ? "transparent" : color,
          borderLeftWidth: 3,
        }}
      >
        <span
          data-ts-grip=""
          aria-hidden
          className={cn(
            "-ml-1 flex w-4 shrink-0 touch-none items-start justify-center pt-0.5 text-ink-3",
            hidden && "invisible",
          )}
        >
          <GripVertical className="size-3.5" />
        </span>
        <div
          className={cn("flex min-w-0 flex-1 flex-col", hidden && "invisible")}
        >
          <CardBody
            item={item}
            color={color}
            nowMs={nowMs}
            quoteClass={d.quote}
            failed={failed}
          />
          {menu}
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-focus-within/theme-sorter:opacity-100 group-hover/theme-sorter:opacity-100",
            hidden && "invisible",
          )}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Tag the quote from ${item.customer}`}
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onTagPress(item)}
            className="inline-flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Tag aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Archive the quote from ${item.customer}`}
            disabled={disabled}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onArchivePress(item)}
            className="inline-flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Archive aria-hidden className="size-3.5" />
          </button>
        </div>
        {hidden ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3 border border-dashed border-hairline-strong bg-surface-0/60"
          />
        ) : null}
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The component                              */
/* ----------------------------------------------------------------------- */

type Ghost = {
  id: string;
  w: number;
  h: number;
  home: { x: number; y: number };
};
type MenuState = { id: string; creating: boolean; name: string };

/**
 * A feedback inbox you sort by hand. A card lifts once the pointer has moved
 * 4px and follows it 1:1 as a copy above both columns, leaning with its
 * speed, while the theme under it swells on snap. Dropped on a theme it is
 * squeezed in — narrowing on `springs.glide`, then flattening 60ms behind on
 * the same spring, toward the theme's centre — and the theme gulps on
 * `springs.recoil` as its tally rolls up on snap. Once it is in, the themes
 * re-rank by count with a layout glide. Dropped anywhere else it springs home
 * with the release velocity.
 *
 * The inbox is one tab stop with roving focus: Up and Down move, Home and
 * End jump, T or Enter opens a theme menu on the card (arrows, type-ahead,
 * "New theme…"), A or Delete archives. A failed tag springs the card back
 * out of the theme into its slot with a note. Below 40rem the themes become
 * chips above the inbox. Under reduced motion nothing lifts, leans or
 * squeezes: a tagged card fades out, counts and order still change.
 */
export function ThemeSorter({
  items,
  defaultItems,
  onItemsChange,
  themes,
  defaultThemes,
  onThemesChange,
  onTag,
  onCreateTheme,
  onArchive,
  bucketStyle = "tray",
  density = "regular",
  sentimentPalette = "signal",
  now = defaultThemeSorterNow,
  status = "ready",
  onRetry,
  title = "Feedback inbox",
  maxHeight = 540,
  disabled = false,
  className,
}: ThemeSorterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const nowMs = toMs(now);
  const ready = status === "ready";
  const colors = PALETTE[sentimentPalette] ?? PALETTE.signal;

  /* -------------------------------- state -------------------------------- */

  const [ownItems, setOwnItems] = React.useState<FeedbackItem[]>(
    () => defaultItems ?? defaultThemeSorterItems,
  );
  const list = items ?? ownItems;
  const [ownThemes, setOwnThemes] = React.useState<FeedbackTheme[]>(
    () => defaultThemes ?? defaultThemeSorterThemes,
  );
  const themeList = themes ?? ownThemes;

  const counts = new Map<string, number>();
  const mix = new Map<string, Record<FeedbackSentiment, number>>();
  for (const item of list) {
    if (!item.themeId) continue;
    counts.set(item.themeId, (counts.get(item.themeId) ?? 0) + 1);
    const m = mix.get(item.themeId) ?? { positive: 0, neutral: 0, negative: 0 };
    m[item.sentiment] += 1;
    mix.set(item.themeId, m);
  }
  const tagged = [...counts.values()].reduce((a, b) => a + b, 0);
  const most = Math.max(1, ...counts.values());
  const inbox = ready ? list.filter((i) => !i.themeId && !i.archived) : [];

  // The order the themes are shown in: re-ranked when a tag has landed, not
  // the moment it is made, so the theme a card is flying into stays put.
  const [order, setOrder] = React.useState<string[]>(() =>
    rank(themeList, counts),
  );
  const shownOrder = [
    ...order.filter((id) => themeList.some((t) => t.id === id)),
    ...rank(
      themeList.filter((t) => !order.includes(t.id)),
      counts,
    ),
  ];
  const ordered = shownOrder
    .map((id) => themeList.find((t) => t.id === id))
    .filter((t): t is FeedbackTheme => t !== undefined);

  const [active, setActive] = React.useState<string | null>(null);
  const activeId =
    active && inbox.some((i) => i.id === active)
      ? active
      : (inbox[0]?.id ?? null);
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [ghost, setGhost] = React.useState<Ghost | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [leaving, setLeaving] = React.useState<
    Record<string, "archive" | "tag">
  >({});
  const [gulp, setGulp] = React.useState<{ id: string; n: number }>({
    id: "",
    n: 0,
  });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  const bucketNodes = React.useRef(new Map<string, HTMLElement>());
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const timers = React.useRef(new Set<number>());
  const focusAsk = React.useRef<string | null>(null);
  const latest = React.useRef({ list, themeList });
  const orderRef = React.useRef(order);
  React.useEffect(() => {
    latest.current = { list, themeList };
    orderRef.current = order;
  });
  React.useEffect(() => {
    const anims = running;
    const pending = timers;
    return () => {
      for (const c of anims.current) c.stop();
      for (const t of pending.current) window.clearTimeout(t);
    };
  }, []);
  const later = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /* ---------------------------- the ghost card --------------------------- */

  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gr = useMotionValue(0);
  const gsx = useMotionValue(1);
  const gsy = useMotionValue(1);
  const go = useMotionValue(1);
  const grab = React.useRef<{ x: number; y: number } | null>(null);

  const halt = () => {
    for (const c of running.current) c.stop();
    running.current = [];
  };

  const relRect = (node: Element) => {
    const root = rootRef.current?.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return {
      x: r.left - (root?.left ?? 0),
      y: r.top - (root?.top ?? 0),
      w: r.width,
      h: r.height,
    };
  };

  /** Puts the copy over a card, ready to move: before it is ever painted. */
  const lift = (item: FeedbackItem, node: HTMLElement) => {
    halt();
    const r = relRect(node);
    gx.jump(r2(r.x));
    gy.jump(r2(r.y));
    gr.jump(0);
    gsx.jump(1);
    gsy.jump(1);
    go.jump(1);
    setGhost({ id: item.id, w: r2(r.w), h: r2(r.h), home: { x: r.x, y: r.y } });
    setMenu(null);
    return r;
  };

  /** The theme's bucket that is on screen: the chip or the column's tray. */
  const bucketNode = (id: string) => {
    for (const kind of ["col", "chip"]) {
      const node = bucketNodes.current.get(`${kind}:${id}`);
      if (node && node.getBoundingClientRect().width > 0) return node;
    }
    return undefined;
  };

  const bucketAt = (x: number, y: number) => {
    for (const [key, node] of bucketNodes.current) {
      const r = node.getBoundingClientRect();
      if (r.width === 0) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return key.slice(key.indexOf(":") + 1);
      }
    }
    return null;
  };

  /* ------------------------------- tagging ------------------------------- */

  const writeItems = (next: FeedbackItem[]) => {
    if (items === undefined) setOwnItems(next);
    onItemsChange?.(next);
  };

  const rerank = () => {
    const now = latest.current;
    const c = new Map<string, number>();
    for (const i of now.list) {
      if (i.themeId) c.set(i.themeId, (c.get(i.themeId) ?? 0) + 1);
    }
    const next = rank(now.themeList, c);
    const prev = orderRef.current;
    if (prev[0] !== next[0] && next[0]) {
      const t = now.themeList.find((x) => x.id === next[0]);
      if (t) say(`${t.name} now leads with ${c.get(t.id) ?? 0}.`);
    }
    setOrder(next);
  };

  /** The next card to hold focus once `id` leaves the inbox. */
  const neighbourOf = (id: string) => {
    const at = inbox.findIndex((i) => i.id === id);
    return inbox[at + 1]?.id ?? inbox[at - 1]?.id ?? null;
  };

  const commitTag = (item: FeedbackItem, themeId: string) => {
    const theme = themeList.find((t) => t.id === themeId);
    if (!theme) return;
    const hadFocus =
      document.activeElement === cardNodes.current.get(item.id) ||
      Boolean(cardNodes.current.get(item.id)?.contains(document.activeElement));
    const next = neighbourOf(item.id);
    setLeaving((l) => ({ ...l, [item.id]: "tag" }));
    if (failed.has(item.id)) {
      setFailed((f) => {
        const n = new Set(f);
        n.delete(item.id);
        return n;
      });
    }
    writeItems(list.map((i) => (i.id === item.id ? { ...i, themeId } : i)));
    setActive(next);
    if (hadFocus) {
      if (next) focusAsk.current = next;
      else rootRef.current?.focus({ preventScroll: true });
    }
    const tally = `${theme.name}, ${(counts.get(themeId) ?? 0) + 1}`;
    const result = onTag?.(item.id, themeId);
    const pending =
      result !== undefined &&
      typeof (result as Promise<unknown>).then === "function";
    // A host that answers later is heard first: "Tagging" now, "Tagged"
    // only once it agrees.
    say(pending ? `Tagging ${theme.name}.` : `Tagged ${tally}.`);
    if (pending) {
      (result as Promise<unknown>).then(
        () => say(`Tagged ${tally}.`),
        () => {
          // The host refused: the card comes back, if nothing has moved it.
          const now = latest.current.list;
          writeItems(
            now.map((i) =>
              i.id === item.id && i.themeId === themeId
                ? { ...i, themeId: null }
                : i,
            ),
          );
          setLeaving((l) => {
            const n = { ...l };
            delete n[item.id];
            return n;
          });
          setFailed((f) => new Set(f).add(item.id));
          say(
            `Could not tag the quote from ${item.customer}. It is back in the inbox.`,
          );
          later(motionSafe ? 450 : 0, rerank);
        },
      );
    }
  };

  /**
   * The squeeze: the copy narrows toward the theme's centre on glide, then
   * flattens 60ms behind it on the same spring while it fades, and the theme
   * gulps as it arrives.
   */
  const squeeze = (
    item: FeedbackItem,
    themeId: string,
    w: number,
    h: number,
  ) => {
    const node = bucketNode(themeId);
    commitTag(item, themeId);
    if (!motionSafe || !node) {
      setGhost(null);
      setGulp((g) => ({ id: themeId, n: g.n + 1 }));
      later(0, rerank);
      return;
    }
    const b = relRect(node);
    const fromX = gx.get();
    const fromY = gy.get();
    const fromR = gr.get();
    const toX = b.x + b.w / 2 - w / 2;
    const toY = b.y + b.h / 2 - h / 2;
    halt();
    running.current.push(
      animate(0, 1, {
        ...springs.glide,
        onUpdate: (p) => {
          gx.set(r2(lerp(fromX, toX, p)));
          gy.set(r2(lerp(fromY, toY, p)));
          gr.set(r2(lerp(fromR, 0, p)));
          gsx.set(Number(lerp(1, 0.14, p).toFixed(4)));
        },
      }),
      animate(0, 1, {
        ...springs.glide,
        delay: 0.06,
        onUpdate: (q) => gsy.set(Number(lerp(1, 0.3, q).toFixed(4))),
      }),
      animate(1, 0, {
        duration: durations.slow,
        ease: easings.exit,
        delay: 0.1,
        onUpdate: (o) => go.set(r2(o)),
      }),
    );
    later(260, () => setGulp((g) => ({ id: themeId, n: g.n + 1 })));
    later(480, () => {
      setGhost(null);
      rerank();
    });
  };

  const sendHome = (vx: number, vy: number) => {
    const g = ghost;
    if (!g) return;
    halt();
    if (!motionSafe) {
      setGhost(null);
      return;
    }
    let done = 0;
    const finish = () => {
      done += 1;
      if (done === 2) setGhost(null);
    };
    running.current.push(
      animate(gx, g.home.x, {
        ...springs.snap,
        velocity: vx,
        onComplete: finish,
      }),
      animate(gy, g.home.y, {
        ...springs.snap,
        velocity: vy,
        onComplete: finish,
      }),
      animate(gr, 0, springs.snap),
    );
  };

  /* ------------------------------ drag events ---------------------------- */

  const onDragStart = (item: FeedbackItem, node: HTMLElement) => {
    if (disabled) return;
    const r = lift(item, node);
    grab.current = { x: r.x, y: r.y };
  };

  const onDragMove = ({ offset, delta, point }: DragInfo) => {
    const g = grab.current;
    if (!g) return;
    gx.set(r2(g.x + offset.x));
    gy.set(r2(g.y + offset.y));
    if (motionSafe) {
      // The copy leans into its speed and straightens as it slows.
      const lean = Math.max(-5, Math.min(5, delta.x * 0.7));
      gr.set(r2(lerp(gr.get(), lean, 0.3)));
    }
    const hit = bucketAt(point.x, point.y);
    if (hit !== over) setOver(hit);
  };

  const onDragEnd = ({ point, velocity }: DragInfo) => {
    grab.current = null;
    const hit = bucketAt(point.x, point.y);
    setOver(null);
    const g = ghost;
    const item = g ? list.find((i) => i.id === g.id) : undefined;
    if (hit && item && g) squeeze(item, hit, g.w, g.h);
    else sendHome(velocity.x, velocity.y);
  };

  const onDragCancel = () => {
    grab.current = null;
    setOver(null);
    sendHome(0, 0);
  };

  /* ------------------------------- keyboard ------------------------------ */

  const focusCard = (id: string | null) => {
    if (!id) return;
    setActive(id);
    cardNodes.current.get(id)?.focus();
  };

  const tagByKey = (item: FeedbackItem, themeId: string) => {
    const node = cardNodes.current.get(item.id);
    if (!node || !motionSafe) {
      commitTag(item, themeId);
      setGulp((g) => ({ id: themeId, n: g.n + 1 }));
      later(0, rerank);
      return;
    }
    const r = lift(item, node);
    squeeze(item, themeId, r.w, r.h);
  };

  const archive = (item: FeedbackItem) => {
    if (disabled) return;
    const next = neighbourOf(item.id);
    const hadFocus = Boolean(
      cardNodes.current.get(item.id)?.contains(document.activeElement),
    );
    setLeaving((l) => ({ ...l, [item.id]: "archive" }));
    writeItems(
      list.map((i) => (i.id === item.id ? { ...i, archived: true } : i)),
    );
    onArchive?.(item.id);
    setMenu(null);
    setActive(next);
    if (hadFocus) {
      // The last card leaving hands focus to the inbox itself, never the page.
      if (next) focusAsk.current = next;
      else rootRef.current?.focus({ preventScroll: true });
    }
    say(`Archived the quote from ${item.customer}.`);
  };

  const openMenu = (item: FeedbackItem) => {
    if (disabled) return;
    setMenu({ id: item.id, creating: false, name: "" });
    setActive(item.id);
    focusAsk.current = `menu:${item.id}`;
  };

  const closeMenu = (item: FeedbackItem) => {
    setMenu(null);
    focusCard(item.id);
  };

  const onCardKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    item: FeedbackItem,
  ) => {
    if (event.target !== event.currentTarget) return;
    const at = inbox.findIndex((i) => i.id === item.id);
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      focusCard(inbox[at + (key === "ArrowDown" ? 1 : -1)]?.id ?? null);
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      focusCard(
        (key === "Home" ? inbox[0] : inbox[inbox.length - 1])?.id ?? null,
      );
    } else if (key === "t" || key === "T" || key === "Enter") {
      event.preventDefault();
      openMenu(item);
    } else if (
      key === "a" ||
      key === "A" ||
      key === "Delete" ||
      key === "Backspace"
    ) {
      event.preventDefault();
      archive(item);
    }
  };

  /**
   * A theme chosen from the menu. Focus goes back to the card before the menu
   * closes (so it never falls to the page), and the card is measured once the
   * menu has gone, so the copy is the card's own size.
   */
  const choose = (item: FeedbackItem, themeId: string) => {
    focusCard(item.id);
    setMenu(null);
    later(20, () => {
      const fresh = latest.current.list.find((i) => i.id === item.id);
      if (fresh && !fresh.themeId) tagByKey(fresh, themeId);
    });
  };

  const createTheme = (item: FeedbackItem, raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!name) return;
    const existing = themeList.find(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      choose(item, existing.id);
      return;
    }
    let id = slug(name);
    while (themeList.some((t) => t.id === id)) id = `${id}-2`;
    const theme = { id, name };
    const next = [...themeList, theme];
    if (themes === undefined) setOwnThemes(next);
    onThemesChange?.(next);
    onCreateTheme?.(theme);
    setOrder((o) => [...o, id]);
    say(`Created ${name}.`);
    // The new theme's bucket exists by the time the chosen card flies.
    choose(item, id);
  };

  /* ------------------------------- render -------------------------------- */

  const claimFocus = (key: string) => (node: HTMLElement | null) => {
    if (node && focusAsk.current === key) {
      focusAsk.current = null;
      node.focus({ preventScroll: false });
    }
  };

  const menuFor = (item: FeedbackItem) => {
    if (menu?.id !== item.id) return null;
    const entries = ordered;
    const focusEntry = (i: number) => {
      const n = entries.length + 1;
      const target = ((i % n) + n) % n;
      document.getElementById(`${uid}-mi-${item.id}-${target}`)?.focus();
    };
    return (
      <motion.div
        role="menu"
        aria-label={`Tag the quote from ${item.customer}`}
        initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            closeMenu(item);
          }
        }}
        className="mt-2 flex flex-wrap gap-1.5 border-t border-hairline pt-2"
      >
        {menu.creating ? (
          <form
            className="flex w-full items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              createTheme(item, menu.name);
            }}
          >
            <label htmlFor={`${uid}-new-${item.id}`} className="sr-only">
              Theme name
            </label>
            <input
              ref={claimFocus(`new:${item.id}`)}
              id={`${uid}-new-${item.id}`}
              value={menu.name}
              maxLength={32}
              placeholder="Theme name"
              onChange={(event) => {
                const text = event.currentTarget.value;
                setMenu((m) => (m ? { ...m, name: text } : m));
              }}
              className={cn(
                "h-7 min-w-0 flex-1 rounded-2 border border-hairline-strong bg-surface-0 px-2 text-[12px] text-foreground placeholder:text-ink-3",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            />
            <button
              type="submit"
              className={cn(
                "inline-flex h-7 shrink-0 items-center rounded-2 bg-primary px-2.5 text-[12px] font-medium text-primary-foreground",
                FOCUS_RING,
              )}
            >
              Create
            </button>
          </form>
        ) : (
          <>
            {entries.map((theme, i) => (
              <button
                key={theme.id}
                ref={i === 0 ? claimFocus(`menu:${item.id}`) : undefined}
                id={`${uid}-mi-${item.id}-${i}`}
                type="button"
                role="menuitem"
                onClick={() => choose(item, theme.id)}
                onKeyDown={(event) => {
                  const k = event.key;
                  if (k === "ArrowRight" || k === "ArrowDown") {
                    event.preventDefault();
                    focusEntry(i + 1);
                  } else if (k === "ArrowLeft" || k === "ArrowUp") {
                    event.preventDefault();
                    focusEntry(i - 1);
                  } else if (k === "Home" || k === "End") {
                    event.preventDefault();
                    focusEntry(k === "Home" ? 0 : entries.length);
                  } else if (k.length === 1 && /\S/.test(k)) {
                    const j = entries.findIndex((t) =>
                      t.name.toLowerCase().startsWith(k.toLowerCase()),
                    );
                    if (j !== -1) {
                      event.preventDefault();
                      focusEntry(j);
                    }
                  }
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                {theme.name}
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {counts.get(theme.id) ?? 0}
                </span>
              </button>
            ))}
            <button
              id={`${uid}-mi-${item.id}-${entries.length}`}
              type="button"
              role="menuitem"
              onClick={() => {
                focusAsk.current = `new:${item.id}`;
                setMenu({ id: item.id, creating: true, name: "" });
              }}
              onKeyDown={(event) => {
                const k = event.key;
                if (k === "ArrowRight" || k === "ArrowDown") {
                  event.preventDefault();
                  focusEntry(entries.length + 1);
                } else if (k === "ArrowLeft" || k === "ArrowUp") {
                  event.preventDefault();
                  focusEntry(entries.length - 1);
                } else if (k === "Home") {
                  event.preventDefault();
                  focusEntry(0);
                }
              }}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-hairline-strong px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-3" />
              New theme…
            </button>
          </>
        )}
      </motion.div>
    );
  };

  const ghostItem = ghost ? list.find((i) => i.id === ghost.id) : undefined;
  const step = cascade(Math.max(1, inbox.length));

  const bucket = (theme: FeedbackTheme, chip: boolean) => {
    const n = counts.get(theme.id) ?? 0;
    const share = tagged ? n / tagged : 0;
    const level = n / most;
    const m = mix.get(theme.id) ?? { positive: 0, neutral: 0, negative: 0 };
    const hot = over === theme.id;
    const gulping = gulp.id === theme.id ? gulp.n : 0;
    return (
      <motion.li
        key={theme.id}
        layout={motionSafe ? "position" : false}
        transition={{ layout: springs.glide }}
        className={cn("list-none", bucketStyle === "jar" && !chip && "min-w-0")}
      >
        <motion.div
          ref={(node: HTMLDivElement | null) => {
            const key = `${chip ? "chip" : "col"}:${theme.id}`;
            if (node) bucketNodes.current.set(key, node);
            else bucketNodes.current.delete(key);
          }}
          initial={false}
          animate={{ scale: hot && motionSafe ? 1.04 : 1 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          style={{ originX: 0.5, originY: 0.5 }}
        >
          <motion.div
            key={`g-${gulping}`}
            initial={gulping && motionSafe ? { scale: 1.07 } : false}
            animate={{ scale: 1 }}
            transition={springs.recoil}
            style={{ originX: 0.5, originY: 0.5 }}
            className={cn(
              "relative transition-colors duration-150",
              // A jar is a vessel and a caption; the vessel takes the edge.
              bucketStyle === "jar" && !chip
                ? "flex flex-col gap-1.5"
                : cn(
                    "overflow-clip border",
                    hot
                      ? "border-cobalt-bright bg-cobalt-wash"
                      : "border-hairline bg-surface-0",
                  ),
              chip
                ? "flex h-8 items-center gap-1.5 rounded-full pr-2.5 pl-3 text-[12px]"
                : bucketStyle === "row"
                  ? "flex h-9 items-center gap-2 rounded-2 px-2.5 text-[12.5px]"
                  : bucketStyle === "jar"
                    ? "text-[12px]"
                    : "flex flex-col gap-1.5 rounded-3 px-3 py-2.5 text-[12.5px]",
            )}
          >
            {chip && bucketStyle === "tray" ? (
              // A tray's chip keeps its share as a wash along the chip.
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0 w-full origin-left bg-cobalt-bright/15"
                initial={false}
                animate={{ scaleX: r2(share) }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            ) : null}
            {chip ? (
              <>
                {bucketStyle === "jar" ? (
                  // A jar's chip carries a tiny jar, filled to its level.
                  <span
                    aria-hidden
                    className="relative h-3.5 w-2.5 shrink-0 overflow-clip rounded-t-[2px] rounded-b-[4px] border border-hairline-strong"
                  >
                    <motion.span
                      className="absolute inset-x-0 bottom-0 bg-cobalt-bright"
                      initial={false}
                      animate={{ height: `${r2(level * 100)}%` }}
                      transition={motionSafe ? springs.glide : { duration: 0 }}
                    />
                  </span>
                ) : null}
                <span className="relative truncate text-foreground">
                  {theme.name}
                </span>
                <Rolling
                  value={n}
                  motionSafe={motionSafe}
                  className="relative font-mono text-[11px] text-ink-2"
                />
              </>
            ) : bucketStyle === "jar" ? (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "relative h-16 overflow-clip rounded-t-2 rounded-b-4 border transition-colors duration-150",
                    hot
                      ? "border-cobalt-bright bg-cobalt-wash"
                      : "border-hairline-strong bg-surface-0",
                  )}
                >
                  {/* The level: a body of colour with a brighter surface,
                      rising on glide. Height, not scale, so the surface line
                      stays one pixel at any level. */}
                  <motion.span
                    className="absolute inset-x-0 bottom-0 border-t border-cobalt-bright/70"
                    initial={false}
                    animate={{ height: `${r2(level * 88)}%` }}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                    style={{
                      backgroundColor:
                        "color-mix(in oklab, var(--accent-bright) 24%, transparent)",
                    }}
                  />
                </span>
                <span className="flex items-center gap-1.5 px-0.5">
                  <span
                    title={theme.name}
                    className="min-w-0 flex-1 truncate text-ink-2"
                  >
                    {theme.name}
                  </span>
                  <Rolling
                    value={n}
                    motionSafe={motionSafe}
                    className="font-mono text-[12px] font-semibold text-foreground"
                  />
                </span>
              </>
            ) : bucketStyle === "row" ? (
              <>
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
                  style={{ opacity: r2(0.35 + level * 0.65) }}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {theme.name}
                </span>
                <Rolling
                  value={n}
                  motionSafe={motionSafe}
                  className="font-mono text-[12px] text-ink-2"
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {theme.name}
                  </span>
                  <Rolling
                    value={n}
                    motionSafe={motionSafe}
                    className="font-mono text-[12px] text-foreground"
                  />
                </div>
                <div className="flex h-1.5 overflow-clip rounded-full bg-hairline">
                  {SENTIMENTS.map((s) => (
                    <motion.span
                      key={s}
                      className="h-full"
                      initial={false}
                      animate={{
                        width: `${r2(n ? (m[s] / n) * Math.max(8, share * 100) : 0)}%`,
                      }}
                      transition={motionSafe ? springs.glide : { duration: 0 }}
                      style={{ backgroundColor: colors[s] }}
                    />
                  ))}
                </div>
                <span className="text-[10.5px] text-ink-3 tabular-nums">
                  {Math.round(share * 100)}% of sorted
                </span>
              </>
            )}
          </motion.div>
        </motion.div>
      </motion.li>
    );
  };

  const inboxBody = () => {
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The inbox did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <ul aria-busy className={cn("flex flex-col", d.gap)}>
          {[78, 64, 88, 70].map((w, i) => (
            <li
              key={i}
              aria-hidden
              className={cn(
                "flex flex-col gap-2 rounded-3 border border-hairline",
                d.card,
              )}
            >
              <span
                className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${w}%` }}
              />
              <span className="h-2 w-1/3 rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </li>
          ))}
          <li className="sr-only">Loading feedback</li>
        </ul>
      );
    }
    if (inbox.length === 0) {
      return (
        <motion.div
          className="flex flex-col items-center gap-2 px-6 py-12 text-center"
          initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { y: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-cobalt-wash text-cobalt-bright">
            <Inbox aria-hidden className="size-4" />
          </span>
          <p className="text-sm font-medium text-foreground">Inbox zero</p>
          <p className="text-[12px] text-ink-3">Every quote has a theme.</p>
        </motion.div>
      );
    }
    return (
      <ul
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className={cn("flex flex-col", d.gap)}
      >
        <AnimatePresence initial={false} custom={leaving}>
          {inbox.map((item, i) => (
            <Card
              key={item.id}
              item={item}
              index={i}
              active={item.id === activeId}
              hidden={ghost?.id === item.id}
              failed={failed.has(item.id)}
              disabled={disabled}
              motionSafe={motionSafe}
              color={colors[item.sentiment]}
              nowMs={nowMs}
              d={d}
              step={step}
              register={(id, node) => {
                if (node) {
                  cardNodes.current.set(id, node);
                  if (focusAsk.current === id) {
                    focusAsk.current = null;
                    node.focus({ preventScroll: false });
                  }
                } else cardNodes.current.delete(id);
              }}
              onFocusCard={(id) => {
                setActive(id);
                if (failed.has(id)) {
                  setFailed((f) => {
                    const n = new Set(f);
                    n.delete(id);
                    return n;
                  });
                }
              }}
              onKey={onCardKey}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
              onTagPress={openMenu}
              onArchivePress={archive}
              menu={menuFor(item)}
            />
          ))}
        </AnimatePresence>
      </ul>
    );
  };

  const themesBlock = (chip: boolean) =>
    status === "loading" ? (
      <ul
        aria-hidden
        className={cn("flex", chip ? "flex-wrap gap-1.5" : "flex-col gap-2")}
      >
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className={cn(
              "bg-surface-2 motion-safe:animate-pulse",
              chip ? "h-8 w-20 rounded-full" : "h-14 rounded-3",
            )}
          />
        ))}
      </ul>
    ) : (
      <ul
        aria-label="Themes, most first"
        className={cn(
          chip
            ? "flex flex-wrap gap-1.5"
            : bucketStyle === "jar"
              ? "grid grid-cols-2 gap-2"
              : "flex flex-col gap-2",
        )}
      >
        {ordered.map((t) => bucket(t, chip))}
      </ul>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn(
        "@container/theme-sorter relative isolate flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground outline-none",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-cobalt-wash text-cobalt-bright"
        >
          <Inbox className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {ready
              ? `${inbox.length} to sort · ${plural(themeList.length, "theme", "themes")}`
              : status === "loading"
                ? "Loading feedback"
                : "Not loaded"}
          </p>
        </div>
        <div
          aria-hidden
          className="hidden items-center gap-3 text-[11px] text-ink-3 @min-[34rem]/theme-sorter:flex"
        >
          {SENTIMENTS.map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <SentimentMark sentiment={s} color={colors[s]} />
              {s}
            </span>
          ))}
        </div>
      </header>

      <div className="shrink-0 border-b border-hairline px-4 py-2.5 @min-[40rem]/theme-sorter:hidden">
        {themesBlock(true)}
      </div>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden @min-[40rem]/theme-sorter:grid-cols-[minmax(0,1fr)_14rem] @min-[60rem]/theme-sorter:grid-cols-[minmax(0,1fr)_16rem]">
        <motion.div
          layoutScroll
          className={cn(
            "[scrollbar-width:thin] overflow-y-auto overscroll-contain",
            d.pad,
          )}
        >
          {inboxBody()}
        </motion.div>
        <motion.aside
          layoutScroll
          aria-label="Themes"
          className="hidden [scrollbar-width:thin] overflow-y-auto overscroll-contain border-l border-hairline bg-surface-0/50 p-3 @min-[40rem]/theme-sorter:flex @min-[40rem]/theme-sorter:flex-col @min-[40rem]/theme-sorter:gap-3"
        >
          <p className="text-[11px] font-medium text-ink-2">
            Themes{" "}
            <span className="font-normal text-ink-3">· drop a card here</span>
          </p>
          {themesBlock(false)}
          {ready && inbox[0] ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const item = inbox.find((i) => i.id === activeId) ?? inbox[0];
                if (!item) return;
                focusAsk.current = `new:${item.id}`;
                setMenu({ id: item.id, creating: true, name: "" });
                setActive(item.id);
              }}
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border border-dashed border-hairline-strong text-[12px] text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <Plus aria-hidden className="size-3.5" />
              New theme
            </button>
          ) : null}
        </motion.aside>
      </div>

      {ghost && ghostItem ? (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-30 flex rounded-3 border border-hairline-strong bg-card shadow-[0_18px_40px_-14px_color-mix(in_oklab,black_50%,transparent)]",
            d.card,
            d.gap,
          )}
          style={{
            width: ghost.w,
            height: ghost.h,
            x: gx,
            y: gy,
            rotate: gr,
            scaleX: gsx,
            scaleY: gsy,
            opacity: go,
            originX: 0.5,
            originY: 0.5,
            borderLeftColor: colors[ghostItem.sentiment],
            borderLeftWidth: 3,
          }}
        >
          <span className="-ml-1 flex w-4 shrink-0 items-start justify-center pt-0.5 text-ink-3">
            <GripVertical className="size-3.5" />
          </span>
          <CardBody
            item={ghostItem}
            color={colors[ghostItem.sentiment]}
            nowMs={nowMs}
            quoteClass={d.quote}
            failed={false}
          />
        </motion.div>
      ) : null}

      <p id={hintId} className="sr-only">
        Up and Down move between quotes. T or Enter chooses a theme, A or Delete
        archives. Cards can also be dragged onto a theme.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
