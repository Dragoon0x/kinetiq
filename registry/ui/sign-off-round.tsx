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
  Bell,
  Check,
  FileText,
  MessageSquareWarning,
  RotateCcw,
  TriangleAlert,
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

export type SignOffVerdict = "pending" | "approved" | "changes";

export type SignOffReviewer = {
  id: string;
  name: string;
  /** What they sign for: "Finance", "Legal". */
  role: string;
  verdict: SignOffVerdict;
  /** Required when changes are requested: what has to change. */
  comment?: string;
  /** When the verdict was given, in ms since the epoch. */
  at?: number;
};

export type SignOffDocument = {
  title: string;
  version: string;
  owner: string;
  /** Last edit, in ms since the epoch. */
  updated: number;
  sections: { heading: string; body: string }[];
};

export type SignOffStampStyle = "round" | "rect" | "initial";
export type SignOffDensity = "compact" | "regular" | "roomy";
export type SignOffStatus = "ready" | "loading" | "error";

export type SignOffRoundProps = {
  /** The document being signed off. @default defaultSignOffDocument */
  document?: SignOffDocument;
  /** Controlled reviewers, in tab order. */
  reviewers?: SignOffReviewer[];
  /** Initial reviewers when uncontrolled. @default defaultSignOffReviewers */
  defaultReviewers?: SignOffReviewer[];
  /** Fires with every reviewer after a verdict is recorded here. */
  onReviewersChange?: (reviewers: SignOffReviewer[]) => void;
  /** The reviewer the visitor is: only they get Approve and Request changes, the rest get Remind. `null` lets the visitor record a verdict for anyone. @default "noor" */
  viewer?: string | null;
  /** A reviewer approved. */
  onApprove?: (reviewerId: string) => void;
  /** A reviewer requested changes, with the required comment. */
  onRequestChanges?: (reviewerId: string, comment: string) => void;
  /** Remind was pressed for a reviewer who has not answered. */
  onRemind?: (reviewerId: string) => void;
  /** The last verdict landed: everyone approved, or someone asked for changes. */
  onComplete?: (outcome: "approved" | "changes") => void;
  /** A round seal with the verdict on an arc, a rectangular rubber stamp, or a circled monogram with a badge. @default "round" */
  stampStyle?: SignOffStampStyle;
  /** Stamp size (52/60/68px), row padding and type. @default "regular" */
  density?: SignOffDensity;
  /** Approval ink, the rail and buttons — any CSS colour. Changes requested stays muted red. @default "var(--success)" */
  accent?: string;
  /** How long Remind rests after a press, in ms. @default 4000 */
  remindCooldownMs?: number;
  /** The moment relative times count from (Date or ms). @default defaultSignOffNow */
  now?: number | Date;
  /** Whether the round has loaded. @default "ready" */
  status?: SignOffStatus;
  /** "Try again" was pressed after the round failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the document and reviewers scroll inside it. @default 540 */
  height?: number;
  /** Play the thock of a stamp landing. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: verdicts show, nothing can be stamped or reminded. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** A fixed afternoon, so dates render the same everywhere. */
export const defaultSignOffNow = Date.UTC(2026, 9, 14, 14, 30);
const N = defaultSignOffNow;

export const defaultSignOffDocument: SignOffDocument = {
  title: "Basin plan pricing change",
  version: "v3",
  owner: "Kenji Ito",
  updated: N - 2 * 60 * MIN,
  sections: [
    {
      heading: "Summary",
      body: "Move the Basin plan from $18 to $22 per seat for new workspaces from 1 December. Existing workspaces keep $18 for twelve months.",
    },
    {
      heading: "Why now",
      body: "A Basin seat costs 31% more to serve since the storage change. At $22 the plan's margin returns to where it was a year ago.",
    },
    {
      heading: "What changes",
      body: "New sign-ups see $22 on the pricing page. Annual plans keep two months free. Invoices for existing workspaces do not change.",
    },
    {
      heading: "Risks",
      body: "Trial conversion may dip for a quarter, and support will hear from teams close to renewal. The renewal email carries the twelve-month promise.",
    },
  ],
};

export const defaultSignOffReviewers: SignOffReviewer[] = [
  {
    id: "ines",
    name: "Ines Marlow",
    role: "Finance",
    verdict: "approved",
    at: N - 50 * MIN,
  },
  { id: "noor", name: "Noor Haddad", role: "Product", verdict: "pending" },
  { id: "tomas", name: "Tomas Brandt", role: "Support", verdict: "pending" },
  { id: "priya", name: "Priya Raman", role: "Legal", verdict: "pending" },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  SignOffDensity,
  { stamp: string; pad: string; text: string; gap: string }
> = {
  compact: {
    stamp: "[--so-stamp:52px] @max-[30rem]/sign-off-round:[--so-stamp:46px]",
    pad: "px-3 py-2.5",
    text: "text-[12px] leading-[18px]",
    gap: "gap-1.5",
  },
  regular: {
    stamp: "[--so-stamp:60px] @max-[30rem]/sign-off-round:[--so-stamp:50px]",
    pad: "px-3 py-3",
    text: "text-[13px] leading-5",
    gap: "gap-2",
  },
  roomy: {
    stamp: "[--so-stamp:68px] @max-[30rem]/sign-off-round:[--so-stamp:56px]",
    pad: "px-3.5 py-3.5",
    text: "text-[13px] leading-[22px]",
    gap: "gap-2.5",
  },
};

/** Muted red, whatever the accent: changes requested is not a celebration. */
const CHANGES_INK = "oklch(from var(--danger) 0.55 0.13 h)";
const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");

const r2 = (v: number) => Math.round(v * 100) / 100;
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

/** "14 OCT", from UTC, so the server and the browser print the same date. */
const stampDate = (at: number) => {
  const d = new Date(at);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** A small string hash, unsigned, for seeding a stamp's tilt and ink. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Bare patches in the ink, seeded per reviewer: a rubber stamp never inks evenly. */
function speckles(seed: number, w: number, h: number) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: 34 }, () => ({
    x: r2(rand() * w),
    y: r2(rand() * h),
    r: r2(0.35 + rand() * 1.1),
    o: r2(0.45 + rand() * 0.55),
  }));
}

const listWords = (words: string[]) =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/* ----------------------------------------------------------------------- */
/*                                  Stamps                                  */
/* ----------------------------------------------------------------------- */

/** The stamp's face: drawn in a 100×100 box (round, initial) or 145×66 (rect). */
function StampFace({
  reviewer,
  stampStyle,
  idBase,
}: {
  reviewer: SignOffReviewer;
  stampStyle: SignOffStampStyle;
  idBase: string;
}) {
  const changes = reviewer.verdict === "changes";
  const word = changes ? "CHANGES" : "APPROVED";
  const ink = changes ? CHANGES_INK : "var(--so-ink)";
  const mask = `${idBase}-ink-${reviewer.id}`;
  const arc = `${idBase}-arc-${reviewer.id}`;
  const date = reviewer.at ? stampDate(reviewer.at) : "";
  const rect = stampStyle === "rect";
  const w = rect ? 145 : 100;
  const h = rect ? 66 : 100;
  const dots = speckles(hash(reviewer.id), w, h);

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${w} ${h}`}
      className="block size-full overflow-visible"
    >
      <defs>
        <mask
          id={mask}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={w}
          height={h}
        >
          <rect width={w} height={h} fill="white" />
          {dots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill="black"
              opacity={d.o}
            />
          ))}
        </mask>
        {stampStyle === "round" ? (
          <path id={arc} d="M 20 50 A 30 30 0 0 1 80 50" fill="none" />
        ) : null}
      </defs>
      <g mask={`url(#${mask})`} style={{ color: ink }}>
        {stampStyle === "round" ? (
          <>
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
            />
            <circle
              cx="50"
              cy="50"
              r="38.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <text
              fontSize="11"
              fontWeight="800"
              letterSpacing="1.4"
              fill="currentColor"
            >
              <textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">
                {word}
              </textPath>
            </text>
            <text
              x="50"
              y="62"
              textAnchor="middle"
              fontSize="21"
              fontWeight="800"
              fill="currentColor"
            >
              {initials(reviewer.name)}
            </text>
            <text
              x="50"
              y="78"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="700"
              letterSpacing="1"
              fill="currentColor"
            >
              {date}
            </text>
          </>
        ) : rect ? (
          <>
            <rect
              x="2"
              y="2"
              width="141"
              height="62"
              rx="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.5"
            />
            <rect
              x="8"
              y="8"
              width="129"
              height="50"
              rx="3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <text
              x="72.5"
              y="34"
              textAnchor="middle"
              fontSize={changes ? 17 : 16}
              fontWeight="800"
              letterSpacing="2"
              fill="currentColor"
            >
              {word}
            </text>
            <text
              x="72.5"
              y="49"
              textAnchor="middle"
              fontSize="8.5"
              fontWeight="700"
              letterSpacing="1.2"
              fill="currentColor"
            >
              {`${initials(reviewer.name)} · ${date}`}
            </text>
          </>
        ) : (
          <>
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
            />
            <text
              x="50"
              y="59"
              textAnchor="middle"
              fontSize="27"
              fontWeight="800"
              fill="currentColor"
            >
              {initials(reviewer.name)}
            </text>
            <circle cx="80" cy="80" r="15" fill="currentColor" />
            {changes ? (
              <path
                d="M80 72 V 82 M80 87 v 0.5"
                stroke="var(--card)"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M73 80 l5 5 l9 -10"
                fill="none"
                stroke="var(--card)"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * One stamp. A verdict that lands here (rather than arriving with the page)
 * drops from 1.4× and 8° further turned onto its resting tilt on recoil —
 * the two small bounces of a hand stamp — while its ink settles to 84% and a
 * ring of ink spreads under it from the moment it touches.
 */
function Stamp({
  reviewer,
  stampStyle,
  landing,
  motionSafe,
  idBase,
  onShowComment,
}: {
  reviewer: SignOffReviewer;
  stampStyle: SignOffStampStyle;
  landing: number;
  motionSafe: boolean;
  idBase: string;
  onShowComment: (id: string) => void;
}) {
  const tilt = (hash(`${reviewer.id}:tilt`) % 13) - 6;
  const scale = useMotionValue(1);
  const rotate = useMotionValue(tilt);
  const ink = useMotionValue(0.84);
  const ringScale = useMotionValue(1);
  const ringOpacity = useMotionValue(0);

  React.useEffect(() => {
    rotate.jump(tilt);
  }, [tilt, rotate]);

  React.useEffect(() => {
    if (!landing) return;
    const runs: AnimationPlaybackControls[] = [];
    if (!motionSafe) {
      scale.jump(1);
      rotate.jump(tilt);
      ink.jump(0);
      runs.push(
        animate(ink, 0.84, { duration: durations.base, ease: easings.enter }),
      );
      return () => {
        for (const c of runs) c.stop();
      };
    }
    scale.jump(1.4);
    rotate.jump(tilt + 8);
    ink.jump(0);
    ringScale.jump(0.85);
    ringOpacity.jump(0);
    runs.push(
      animate(scale, 1, springs.recoil),
      animate(rotate, tilt, springs.recoil),
      animate(ink, 0.92, {
        duration: durations.blink,
        ease: easings.enter,
        onComplete: () => {
          runs.push(
            animate(ink, 0.84, {
              duration: durations.slow,
              ease: easings.enter,
              delay: 0.2,
            }),
          );
        },
      }),
      animate(ringOpacity, [0, 0.34, 0], {
        duration: 0.62,
        times: [0, 0.2, 1],
        ease: "easeOut",
        delay: 0.09,
      }),
      animate(ringScale, 1.3, {
        duration: 0.62,
        ease: easings.enter,
        delay: 0.09,
      }),
    );
    return () => {
      for (const c of runs) c.stop();
    };
  }, [landing, motionSafe, tilt, scale, rotate, ink, ringScale, ringOpacity]);

  const changes = reviewer.verdict === "changes";
  const label = `${changes ? "Changes requested" : "Approved"} by ${reviewer.name}${reviewer.at ? `, ${stampDate(reviewer.at).toLowerCase()}` : ""}`;
  const rect = stampStyle === "rect";
  const body = (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-[-4px] rounded-full border-2"
        style={{
          borderColor: changes ? CHANGES_INK : "var(--so-ink)",
          scale: ringScale,
          opacity: ringOpacity,
          borderRadius: rect ? 10 : 9999,
        }}
      />
      <motion.span
        className="block size-full"
        style={{ scale, rotate, opacity: ink, originX: 0.5, originY: 0.5 }}
      >
        <StampFace
          reviewer={reviewer}
          stampStyle={stampStyle}
          idBase={idBase}
        />
      </motion.span>
      {changes ? (
        <span
          aria-hidden
          className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full border border-card text-white"
          style={{ backgroundColor: CHANGES_INK }}
        >
          <MessageSquareWarning className="size-2.5" />
        </span>
      ) : null}
    </>
  );
  const box = cn(
    "relative block shrink-0",
    rect
      ? "h-[calc(var(--so-stamp)*0.66)] w-[calc(var(--so-stamp)*1.45)]"
      : "size-(--so-stamp)",
  );
  if (changes) {
    return (
      <button
        type="button"
        data-so-stamp={reviewer.id}
        aria-label={`${label}, show comment`}
        onClick={() => onShowComment(reviewer.id)}
        className={cn(box, "cursor-pointer rounded-2", FOCUS_RING)}
      >
        {body}
      </button>
    );
  }
  return (
    <span
      role="img"
      aria-label={label}
      data-so-stamp={reviewer.id}
      className={box}
    >
      {body}
    </span>
  );
}

/** Where a stamp will land: the reviewer's initials, faint, in a dashed ring. */
function Slot({
  reviewer,
  rect,
}: {
  reviewer: SignOffReviewer;
  rect: boolean;
}) {
  return (
    <span
      aria-hidden
      data-so-slot={reviewer.id}
      className={cn(
        "flex shrink-0 items-center justify-center border-[1.5px] border-dashed border-hairline-strong text-[11px] font-semibold text-ink-3/70",
        rect
          ? "h-[calc(var(--so-stamp)*0.66)] w-[calc(var(--so-stamp)*1.45)] rounded-2"
          : "size-(--so-stamp) rounded-full",
      )}
    >
      {initials(reviewer.name)}
    </span>
  );
}

/** A number whose digits roll toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  return (
    <span
      aria-hidden
      className="relative inline-flex h-4 justify-center overflow-clip tabular-nums"
      style={{ width: `${String(value).length}ch` }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="inline-block leading-4"
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 8 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 8 : 0,
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
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The round                                 */
/* ----------------------------------------------------------------------- */

/**
 * An approval round on a document. Every reviewer's verdict lands as a stamp
 * in its slot on the document's header: it drops from 1.4× and a little more
 * turned onto its resting tilt on recoil — two small bounces, the weight of
 * a hand stamp — and at touch-down the header sinks 1.5px and springs back
 * on snap, a ring of ink spreads under the stamp and the thock is heard.
 * Changes requested stamps in muted red whatever the accent, with a badge;
 * the stamp is a button that brings its comment into view.
 *
 * The reviewers are a list in tab order. The viewer's row offers Approve and
 * Request changes (which needs a comment: a field opens with its measured
 * height on glide and Send says why it waits); every other pending row
 * offers Remind, which rests for `remindCooldownMs`. The progress rail fills
 * one segment per verdict on glide, and when the last stamp lands the round
 * completes: the rail takes the outcome's colour and the chip rolls from "3
 * of 4 signed" to "Signed off" or "Changes requested". Under reduced motion
 * stamps fade in at rest and the rail fills at once; every verdict and the
 * outcome still show.
 */
export function SignOffRound({
  document: doc = defaultSignOffDocument,
  reviewers,
  defaultReviewers,
  onReviewersChange,
  viewer = "noor",
  onApprove,
  onRequestChanges,
  onRemind,
  onComplete,
  stampStyle = "round",
  density = "regular",
  accent = "var(--success)",
  remindCooldownMs = 4000,
  now = defaultSignOffNow,
  status = "ready",
  onRetry,
  height = 540,
  sound = false,
  disabled = false,
  className,
}: SignOffRoundProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const nowMs = toMs(now);
  const ready = status === "ready";
  const locked = disabled || !ready;
  const dens = DENSITY[density] ?? DENSITY.regular;

  const [own, setOwn] = React.useState<SignOffReviewer[]>(
    () => defaultReviewers ?? defaultSignOffReviewers,
  );
  const list = reviewers ?? own;
  const signed = list.filter((r) => r.verdict !== "pending").length;
  const total = list.length;
  const complete = total > 0 && signed === total;
  const outcome: "approved" | "changes" = list.some(
    (r) => r.verdict === "changes",
  )
    ? "changes"
    : "approved";

  const [writing, setWriting] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [tried, setTried] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [reminded, setReminded] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [flash, setFlash] = React.useState<{ id: string; n: number } | null>(
    null,
  );
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Verdicts that arrive after the first paint land; the ones the page
  // opened with are already pressed in. Decided in render from the new list.
  const verdictKey = list.map((r) => `${r.id}:${r.verdict}`).join("|");
  const [seen, setSeen] = React.useState(verdictKey);
  const [landing, setLanding] = React.useState<Record<string, number>>({});
  const [completion, setCompletion] = React.useState<{
    n: number;
    outcome: "approved" | "changes";
    fromHost: boolean;
  } | null>(null);
  const [selfKey, setSelfKey] = React.useState("");
  if (seen !== verdictKey) {
    const before = new Map(
      seen.split("|").map((part) => {
        const cut = part.lastIndexOf(":");
        return [part.slice(0, cut), part.slice(cut + 1)] as const;
      }),
    );
    const landed = list.filter(
      (r) => r.verdict !== "pending" && before.get(r.id) !== r.verdict,
    );
    if (landed.length > 0) {
      setLanding((l) => {
        const next = { ...l };
        for (const r of landed) next[r.id] = (next[r.id] ?? 0) + 1;
        return next;
      });
    }
    const wasComplete =
      seen !== "" && seen.split("|").every((p) => !p.endsWith(":pending"));
    if (complete && !wasComplete && landed.length > 0) {
      setCompletion((c) => ({
        n: (c?.n ?? 0) + 1,
        outcome,
        fromHost: selfKey !== verdictKey,
      }));
    }
    setSeen(verdictKey);
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef(new Set<number>());
  const sink = useMotionValue(0);
  const sinkRuns = React.useRef<AnimationPlaybackControls[]>([]);
  const completedFor = React.useRef(0);
  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  React.useEffect(() => {
    const pending = timers.current;
    const runs = sinkRuns;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
      for (const c of runs.current) c.stop();
      scrollRun.current?.stop();
    };
  }, []);

  // The header takes the stamp's weight: down 1.5px at touch-down, back on snap.
  const landingKey = Object.entries(landing)
    .map(([id, n]) => `${id}${n}`)
    .join("|");
  React.useEffect(() => {
    if (!landingKey || !motionSafe) return;
    const runs = sinkRuns.current;
    const t = window.setTimeout(() => {
      for (const c of runs) c.stop();
      runs.length = 0;
      runs.push(
        animate(sink, 1.5, {
          ...springs.flick,
          onComplete: () => {
            runs.push(animate(sink, 0, springs.snap));
          },
        }),
      );
    }, 100);
    return () => {
      window.clearTimeout(t);
      sink.jump(0);
    };
  }, [landingKey, motionSafe, sink]);

  // A round completed by the host's update is reported once, after the
  // commit that shows it; one completed here is reported by the press.
  React.useEffect(() => {
    if (!completion || !completion.fromHost) return;
    if (completedFor.current >= completion.n) return;
    completedFor.current = completion.n;
    onComplete?.(completion.outcome);
  }, [completion, onComplete]);

  React.useEffect(() => {
    if (!focusAsk) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-so-focus="${CSS.escape(focusAsk.key)}"]`,
    );
    if (!node) return;
    node.focus({ preventScroll: true });
    const scroller = node.closest<HTMLElement>("[data-so-scroll]");
    if (!scroller) return;
    const sr = scroller.getBoundingClientRect();
    const nr = node.getBoundingClientRect();
    let top = scroller.scrollTop;
    if (nr.top < sr.top + 8) top -= sr.top + 8 - nr.top;
    else if (nr.bottom > sr.bottom - 8) top += nr.bottom - (sr.bottom - 8);
    top = Math.max(0, Math.round(top));
    if (top === scroller.scrollTop) return;
    scrollRun.current?.stop();
    if (!motionSafe) {
      scroller.scrollTop = top;
      return;
    }
    scrollRun.current = animate(scroller.scrollTop, top, {
      ...springs.glide,
      onUpdate: (v) => {
        scroller.scrollTop = Math.round(v);
      },
    });
  }, [focusAsk, motionSafe]);

  /* ------------------------------- actions ------------------------------ */

  const canDecide = (r: SignOffReviewer) =>
    !locked && r.verdict === "pending" && (viewer === null || viewer === r.id);

  const record = (
    r: SignOffReviewer,
    verdict: "approved" | "changes",
    comment?: string,
  ) => {
    const next = list.map((x) =>
      x.id === r.id ? { ...x, verdict, comment, at: nowMs } : x,
    );
    setSelfKey(next.map((x) => `${x.id}:${x.verdict}`).join("|"));
    if (reviewers === undefined) setOwn(next);
    onReviewersChange?.(next);
    // Heard as it touches the paper, not as it is pressed.
    later(
      () =>
        audio.play("thock", {
          pitch: verdict === "changes" ? 0.86 : 1,
          gain: 0.6,
        }),
      motionSafe ? 100 : 0,
    );
    const nowSigned = next.filter((x) => x.verdict !== "pending").length;
    const done = nowSigned === next.length;
    const result = next.some((x) => x.verdict === "changes")
      ? "changes"
      : "approved";
    say(
      `${verdict === "changes" ? "Changes requested" : "Approved"} by ${r.name}. ${
        done
          ? `Round complete: ${result === "changes" ? "changes requested" : "signed off"}.`
          : `${nowSigned} of ${next.length} signed.`
      }`,
    );
    if (verdict === "changes") onRequestChanges?.(r.id, comment ?? "");
    else onApprove?.(r.id);
    if (done) onComplete?.(result);
  };

  const approve = (r: SignOffReviewer) => {
    if (!canDecide(r)) return;
    setWriting(null);
    record(r, "approved");
    ask(`row:${r.id}`);
  };

  const openChanges = (r: SignOffReviewer) => {
    if (!canDecide(r)) return;
    setWriting(r.id);
    ask(`comment:${r.id}`);
  };

  const sendChanges = (r: SignOffReviewer) => {
    const text = (drafts[r.id] ?? "").trim();
    if (!text) {
      setTried((t) => new Set(t).add(r.id));
      say("Say what needs to change.");
      ask(`comment:${r.id}`);
      return;
    }
    setWriting(null);
    record(r, "changes", text);
    ask(`row:${r.id}`);
  };

  const remind = (r: SignOffReviewer) => {
    if (locked || r.verdict !== "pending" || reminded.has(r.id)) return;
    setReminded((s) => new Set(s).add(r.id));
    later(() => {
      setReminded((s) => {
        const n = new Set(s);
        n.delete(r.id);
        return n;
      });
    }, remindCooldownMs);
    say(`Reminder sent to ${r.name}.`);
    onRemind?.(r.id);
  };

  const showComment = (id: string) => {
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    ask(`note:${id}`);
  };

  /* -------------------------------- render ------------------------------ */

  const waiting = list
    .filter((r) => r.verdict === "pending")
    .map((r) => r.name.split(" ")[0] ?? r.name);
  const rect = stampStyle === "rect";
  const chip = complete
    ? outcome === "changes"
      ? "changes"
      : "signed"
    : "progress";

  const btn = cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors",
    FOCUS_RING,
  );

  const reviewerRow = (r: SignOffReviewer) => {
    const mine = canDecide(r);
    const isWriting = writing === r.id && mine;
    const draft = drafts[r.id] ?? "";
    const errorId = `${uid}-err-${r.id}`;
    const showError = tried.has(r.id) && !draft.trim();
    const flashing = flash?.id === r.id;
    return (
      <li
        key={r.id}
        className={cn(
          "flex flex-col rounded-3 border border-hairline bg-card",
          dens.pad,
          dens.gap,
        )}
      >
        <div
          data-so-focus={`row:${r.id}`}
          tabIndex={-1}
          className={cn("flex items-center gap-2.5 rounded-2", FOCUS_RING)}
        >
          <span
            aria-hidden
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 transition-colors",
              r.verdict === "approved"
                ? "bg-[color-mix(in_oklab,var(--so-ink)_14%,transparent)] text-foreground ring-[color-mix(in_oklab,var(--so-ink)_55%,transparent)]"
                : r.verdict === "changes"
                  ? "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-foreground ring-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
                  : "bg-surface-2 text-ink-2 ring-transparent",
            )}
          >
            {initials(r.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-baseline gap-1.5">
              <span
                title={r.name}
                className="truncate text-[13px] font-medium text-foreground"
              >
                {r.name}
              </span>
              <span className="shrink-0 text-[11px] text-ink-3">
                {viewer === r.id ? `${r.role} · you` : r.role}
              </span>
            </p>
            <p className="grid text-[11px]">
              <AnimatePresence initial={false}>
                <motion.span
                  key={r.verdict}
                  className={cn(
                    "inline-flex min-w-0 items-center gap-1 [grid-area:1/1]",
                    r.verdict === "approved"
                      ? "text-(--so-text)"
                      : r.verdict === "changes"
                        ? "text-danger"
                        : "text-ink-3",
                  )}
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {r.verdict === "approved" ? (
                    <Check aria-hidden className="size-3 shrink-0" />
                  ) : r.verdict === "changes" ? (
                    <MessageSquareWarning
                      aria-hidden
                      className="size-3 shrink-0"
                    />
                  ) : null}
                  <span className="truncate">
                    {r.verdict === "approved"
                      ? "Approved"
                      : r.verdict === "changes"
                        ? "Changes requested"
                        : "Waiting"}
                    {r.at && r.verdict !== "pending"
                      ? ` · ${ago(r.at, nowMs)}`
                      : ""}
                  </span>
                </motion.span>
              </AnimatePresence>
            </p>
          </div>
        </div>

        {r.verdict === "changes" && r.comment ? (
          <blockquote
            data-so-focus={`note:${r.id}`}
            tabIndex={-1}
            className={cn(
              "relative overflow-hidden rounded-2 border-l-2 border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[color-mix(in_oklab,var(--danger)_5%,transparent)] px-2.5 py-1.5 text-[12px] leading-[18px] text-ink-2",
              FOCUS_RING,
            )}
          >
            {flashing ? (
              <motion.span
                key={`flash-${flash?.n}`}
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--danger)_16%,transparent)]"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: easings.enter }}
              />
            ) : null}
            <span className="relative">{r.comment}</span>
          </blockquote>
        ) : null}

        {mine && !isWriting ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-so-focus={`approve:${r.id}`}
              onClick={() => approve(r)}
              className={cn(
                btn,
                "bg-(--so-button) text-white hover:opacity-90",
              )}
            >
              <Check aria-hidden className="size-3.5 shrink-0" />
              Approve
            </button>
            <button
              type="button"
              data-so-focus={`changes:${r.id}`}
              onClick={() => openChanges(r)}
              className={cn(
                btn,
                "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              Request changes
            </button>
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {isWriting ? (
            <motion.div
              key="changes"
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: durations.fast }
              }
            >
              <div className="flex flex-col gap-1.5 pt-0.5">
                <label
                  htmlFor={`${uid}-c-${r.id}`}
                  className="text-[11px] font-medium text-ink-2"
                >
                  What needs to change
                </label>
                <div className="grid rounded-2 border border-hairline-strong bg-surface-1">
                  <textarea
                    id={`${uid}-c-${r.id}`}
                    data-so-focus={`comment:${r.id}`}
                    rows={2}
                    value={draft}
                    aria-invalid={showError || undefined}
                    aria-describedby={showError ? errorId : undefined}
                    placeholder="Required"
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      setDrafts((d) => ({ ...d, [r.id]: text }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        // Ours: the field closes, and nothing behind it.
                        event.preventDefault();
                        event.stopPropagation();
                        setWriting(null);
                        ask(`changes:${r.id}`);
                      } else if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault();
                        sendChanges(r);
                      }
                    }}
                    className={cn(
                      "max-h-28 resize-none overflow-y-auto rounded-2 bg-transparent px-2.5 py-1.5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
                      dens.text,
                      FOCUS_RING,
                    )}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "invisible max-h-28 overflow-hidden px-2.5 py-1.5 break-words whitespace-pre-wrap [grid-area:1/1]",
                      dens.text,
                    )}
                  >
                    {`${draft} `}
                  </span>
                </div>
                {showError ? (
                  <p
                    id={errorId}
                    className="flex items-center gap-1.5 text-[11px] text-danger"
                  >
                    <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                    Say what needs to change.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setWriting(null);
                      ask(`changes:${r.id}`);
                    }}
                    className={cn(
                      btn,
                      "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    aria-disabled={!draft.trim() || undefined}
                    onClick={() => sendChanges(r)}
                    className={cn(btn, "text-white aria-disabled:opacity-50")}
                    style={{ backgroundColor: CHANGES_INK }}
                  >
                    Send
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!mine && r.verdict === "pending" && !locked ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-so-focus={`remind:${r.id}`}
              aria-disabled={reminded.has(r.id) || undefined}
              onClick={() => remind(r)}
              className={cn(
                btn,
                "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-60 aria-disabled:hover:bg-transparent",
              )}
            >
              <Bell aria-hidden className="size-3.5 shrink-0" />
              <span className="grid">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={reminded.has(r.id) ? "done" : "remind"}
                    className="[grid-area:1/1]"
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      y: motionSafe ? -distances.nudge : 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe
                        ? {
                            y: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    {reminded.has(r.id) ? "Reminded" : "Remind"}
                  </motion.span>
                </AnimatePresence>
                <span aria-hidden className="invisible [grid-area:1/1]">
                  Reminded
                </span>
              </span>
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/sign-off-round flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={{
        height,
        ["--so-ink" as string]: `oklch(from ${accent} 0.56 0.13 h)`,
        ["--so-changes" as string]: CHANGES_INK,
        ["--so-button" as string]: `oklch(from ${accent} 0.5 c h)`,
        ["--so-text" as string]: `color-mix(in oklab, oklch(from ${accent} 0.56 0.13 h) 72%, var(--foreground))`,
      }}
    >
      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            This round didn&apos;t load.
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
      ) : (
        <div
          ref={scrollRef}
          data-so-scroll=""
          className="flex flex-1 [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain @min-[40rem]/sign-off-round:overflow-hidden"
        >
          <motion.header
            className={cn(
              "shrink-0 border-b border-hairline bg-card px-4 pt-3.5 pb-3",
              dens.stamp,
            )}
            style={{ y: sink }}
          >
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2"
              >
                <FileText className="size-4" />
              </span>
              <div className="min-w-[9rem] flex-1">
                <p
                  id={titleId}
                  className="flex items-center gap-2 text-sm font-semibold"
                >
                  <span title={doc.title} className="truncate">
                    {doc.title}
                  </span>
                  <span className="shrink-0 rounded-1 bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] leading-4 font-normal text-ink-2">
                    {doc.version}
                  </span>
                </p>
                <p className="truncate text-[11px] text-ink-3">
                  {ready
                    ? `${doc.owner} · updated ${ago(doc.updated, nowMs)}`
                    : status === "loading"
                      ? "Loading the round"
                      : ""}
                </p>
              </div>
              {ready ? (
                <span className="grid shrink-0">
                  <AnimatePresence initial={false}>
                    <motion.span
                      key={chip}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium [grid-area:1/1]",
                        chip === "signed"
                          ? "border-[color-mix(in_oklab,var(--so-ink)_45%,transparent)] bg-[color-mix(in_oklab,var(--so-ink)_12%,transparent)] text-(--so-text)"
                          : chip === "changes"
                            ? "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
                            : "border-hairline text-ink-2",
                      )}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        y: motionSafe ? -distances.step : 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              y: springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {chip === "signed" ? (
                        <>
                          <Check aria-hidden className="size-3.5 shrink-0" />
                          Signed off
                        </>
                      ) : chip === "changes" ? (
                        <>
                          <MessageSquareWarning
                            aria-hidden
                            className="size-3.5 shrink-0"
                          />
                          Changes requested
                        </>
                      ) : (
                        <>
                          <Rolling value={signed} motionSafe={motionSafe} />
                          <span aria-hidden>of {total} signed</span>
                          <span className="sr-only">{`${signed} of ${total} signed`}</span>
                        </>
                      )}
                    </motion.span>
                  </AnimatePresence>
                </span>
              ) : null}
            </div>

            <div
              role="progressbar"
              aria-label="Sign-off progress"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={signed}
              aria-valuetext={`${signed} of ${plural(total, "reviewer", "reviewers")} signed`}
              className="mt-3 flex h-1.5 gap-1"
            >
              {list.map((r) => (
                <span
                  key={r.id}
                  className="relative flex-1 overflow-hidden rounded-full bg-surface-2"
                >
                  <motion.span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-colors duration-300",
                      r.verdict === "changes"
                        ? "bg-(--so-changes)"
                        : complete && outcome === "changes"
                          ? "bg-[color-mix(in_oklab,var(--so-ink)_50%,var(--ink-3))]"
                          : "bg-(--so-ink)",
                    )}
                    initial={false}
                    animate={{ width: r.verdict === "pending" ? "0%" : "100%" }}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  />
                </span>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {status === "loading"
                ? [0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="size-(--so-stamp) shrink-0 rounded-full bg-surface-2 motion-safe:animate-pulse"
                    />
                  ))
                : list.map((r) =>
                    r.verdict === "pending" ? (
                      <Slot key={r.id} reviewer={r} rect={rect} />
                    ) : (
                      <Stamp
                        key={`${r.id}:${r.verdict}`}
                        reviewer={r}
                        stampStyle={stampStyle}
                        landing={landing[r.id] ?? 0}
                        motionSafe={motionSafe}
                        idBase={idBase}
                        onShowComment={showComment}
                      />
                    ),
                  )}
              {ready && !complete && waiting.length > 0 ? (
                <span className="min-w-0 text-[11px] text-ink-3">
                  Waiting on {listWords(waiting)}
                </span>
              ) : null}
            </div>
          </motion.header>

          <div className="flex flex-col @min-[40rem]/sign-off-round:flex-1 @min-[40rem]/sign-off-round:flex-row-reverse @min-[40rem]/sign-off-round:overflow-hidden">
            <section
              aria-label="Reviewers"
              data-so-scroll=""
              className="shrink-0 border-b border-hairline bg-surface-0/50 p-3 @min-[40rem]/sign-off-round:w-62 @min-[40rem]/sign-off-round:overflow-y-auto @min-[40rem]/sign-off-round:overscroll-contain @min-[40rem]/sign-off-round:border-b-0 @min-[40rem]/sign-off-round:border-l @min-[70rem]/sign-off-round:w-75"
            >
              <p className="mb-2 px-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Reviewers · {signed}/{total}
              </p>
              {status === "loading" ? (
                <div aria-hidden className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-3 border border-hairline p-3"
                    >
                      <span className="size-8 rounded-full bg-surface-2" />
                      <span className="h-2.5 flex-1 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : list.length === 0 ? (
                <p className="px-1 py-6 text-center text-[13px] text-ink-2">
                  Nobody has been asked to sign yet.
                </p>
              ) : (
                <ol role="list" className="flex flex-col gap-2">
                  {list.map((r) => reviewerRow(r))}
                </ol>
              )}
            </section>
            <article
              aria-label={`${doc.title}, ${doc.version}`}
              data-so-scroll=""
              className="flex-1 px-4 py-3.5 @min-[40rem]/sign-off-round:overflow-y-auto @min-[40rem]/sign-off-round:overscroll-contain"
            >
              {status === "loading" ? (
                <div aria-hidden className="flex flex-col gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <span className="h-3 w-28 rounded-full bg-surface-2" />
                      <span className="h-2.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
                      <span className="h-2.5 w-4/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex max-w-prose flex-col gap-4">
                  {doc.sections.map((s) => (
                    <div key={s.heading} className="flex flex-col gap-1">
                      <h3 className="text-[13px] font-semibold text-foreground">
                        {s.heading}
                      </h3>
                      <p className={cn("text-ink-2", dens.text)}>{s.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
