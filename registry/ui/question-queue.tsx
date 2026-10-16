"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Check,
  ChevronUp,
  CornerDownRight,
  MessageCircleQuestion,
  RotateCcw,
  TriangleAlert,
  VenetianMask,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
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

export type QueueAuthor = { name: string; team?: string };

export type QueueAnswer = {
  /** The answer. Empty means it was answered live, out loud. */
  text: string;
  /** Who answered. */
  by: string;
  team?: string;
  /** When it was answered, ms. */
  at: number;
};

export type QueueQuestion = {
  id: string;
  text: string;
  /** Who asked. `null` is an anonymous question, labelled as such. */
  author: QueueAuthor | null;
  votes: number;
  /** Whether the viewer has upvoted it. */
  voted?: boolean;
  /** When it was asked, ms. */
  at: number;
  /** Present once answered: the question moves to the Answered section. */
  answer?: QueueAnswer;
};

export type QueueCardStyle = "soft" | "outline" | "flat";
export type QueueDensity = "compact" | "cozy" | "roomy";
export type QueueStatus = "ready" | "loading" | "error";

export type QuestionQueueProps = {
  /** Card treatment: tinted cards, bordered cards, or ruled rows with no cards. @default "soft" */
  cardStyle?: QueueCardStyle;
  /** Type size, padding and the size of the vote pill. @default "cozy" */
  density?: QueueDensity;
  /** Any CSS colour: your votes, the top question's rule, the climb's shadow and its "▲" chip. @default "var(--accent-bright)" */
  accent?: string;
  /** Controlled questions, open and answered, in any order. */
  questions?: QueueQuestion[];
  /** Initial questions when uncontrolled. @default defaultQueueQuestions */
  defaultQuestions?: QueueQuestion[];
  /** Fires from the vote, ask or answer that changed the list, with the whole new list. */
  onQuestionsChange?: (questions: QueueQuestion[]) => void;
  /** A question was asked from the composer. It is already in the list. */
  onAsk?: (text: string, options: { anonymous: boolean }) => void;
  /** The viewer upvoted (`voted` true) or withdrew a vote. */
  onUpvote?: (question: QueueQuestion, voted: boolean) => void;
  /** The host answered a question; empty text means "answered live". */
  onAnswer?: (question: QueueQuestion, answer: string) => void;
  /** The moment "12 min ago" counts from, ms. Never read from the clock. @default defaultQueueNow */
  now?: number;
  /** The session's name in the header. @default "Coldbrook town hall" */
  title?: string;
  /** One line under the title. @default "Thursday all-hands · Q&A" */
  subtitle?: string;
  /** Who answers are signed by. @default defaultQueueHost */
  host?: QueueAuthor;
  /** Who new questions are asked as, unless asked anonymously. @default defaultQueueAsker */
  asker?: QueueAuthor;
  /** Host view: an Answer action on each open question. @default true */
  canAnswer?: boolean;
  /** Offer the "Anonymous" switch in the composer. @default true */
  allowAnonymous?: boolean;
  /** Longest question, in characters. @default 240 */
  maxLength?: number;
  /** Whether the questions have arrived. @default "ready" */
  status?: QueueStatus;
  /** "Try again" was pressed after the questions failed to load. */
  onRetry?: () => void;
  /** Height of the surface, px; its body scrolls inside. @default 540 */
  height?: number;
  /** The feed's accessible name. @default the title */
  label?: string;
  /** Read only: nothing can be asked, voted or answered. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Thursday 22 October 2026, 16:40 — forty minutes into the session. */
export const defaultQueueNow = Date.UTC(2026, 9, 22, 16, 40);
const N = defaultQueueNow;

export const defaultQueueHost: QueueAuthor = {
  name: "Ruth Achebe",
  team: "Chief of staff",
};

export const defaultQueueAsker: QueueAuthor = {
  name: "Alex Moreno",
  team: "Design",
};

/** A Coldbrook all-hands: nine open questions (two anonymous), two answered. */
export const defaultQueueQuestions: QueueQuestion[] = [
  {
    id: "q-friday",
    text: "Will the Riverside office keep late opening on Fridays after the move?",
    author: { name: "Mara Ilves", team: "Operations" },
    votes: 31,
    at: N - 38 * MIN,
  },
  {
    id: "q-leave",
    text: "Can we get a firm date for the new parental leave policy?",
    author: null,
    votes: 27,
    at: N - 36 * MIN,
  },
  {
    id: "q-rota",
    text: "How will the merged support teams split the weekend rota?",
    author: { name: "Tomás Reyes", team: "Support" },
    votes: 22,
    at: N - 33 * MIN,
  },
  {
    id: "q-hiring",
    text: "Is the hiring pause lifting for engineering in the first quarter?",
    author: null,
    votes: 21,
    at: N - 29 * MIN,
  },
  {
    id: "q-lease",
    text: "What happens to the Harbour Street lease when it ends in March?",
    author: { name: "Priya Shah", team: "Finance" },
    votes: 21,
    at: N - 27 * MIN,
  },
  {
    id: "q-captions",
    text: "Could all-hands recordings get captions by default?",
    author: { name: "Joel Brandt", team: "Design" },
    votes: 21,
    at: N - 22 * MIN,
  },
  {
    id: "q-pilot",
    text: "Are we keeping the four-day week pilot going past December?",
    author: { name: "Sade Okon", team: "People" },
    votes: 14,
    voted: true,
    at: N - 17 * MIN,
  },
  {
    id: "q-expenses",
    text: "When does the new expense tool replace the spreadsheets?",
    author: { name: "Kenji Mori", team: "Sales" },
    votes: 12,
    at: N - 11 * MIN,
  },
  {
    id: "q-bikes",
    text: "Any plans for a second bike room at the Riverside building?",
    author: { name: "Ines Varga", team: "Engineering" },
    votes: 3,
    at: N - 4 * MIN,
  },
  {
    id: "q-canteen",
    text: "Will the canteen stay open during the refit?",
    author: { name: "Lotte Brink", team: "Support" },
    votes: 41,
    at: N - 40 * MIN,
    answer: {
      text: "Yes. It moves to the ground-floor studio from 2 November and keeps the same hours.",
      by: "Ines Calder",
      team: "Facilities",
      at: N - 21 * MIN,
    },
  },
  {
    id: "q-travel",
    text: "Where do we find the new travel policy?",
    author: null,
    votes: 17,
    at: N - 39 * MIN,
    answer: {
      text: "On the People hub under Policies. We will pin it in the general channel after this session.",
      by: "Ruth Achebe",
      team: "Chief of staff",
      at: N - 9 * MIN,
    },
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** The count rolls first; the question takes its new place this long after. */
const CLIMB_DELAY = 160;
/** How long the climbing question stays lifted: the glide's settle. */
const LIFT_MS = 480;
const CHIP_MS = 1400;

type Density = {
  text: string;
  meta: string;
  pad: string;
  gap: string;
  list: string;
  pill: string;
  disc: string;
};

const DENSITY: Record<QueueDensity, Density> = {
  compact: {
    text: "text-[13px] leading-5",
    meta: "text-[11px]",
    pad: "px-2.5 py-2",
    gap: "gap-2.5",
    list: "gap-1.5",
    pill: "w-9 h-11 text-[11px]",
    disc: "size-4 text-[8px]",
  },
  cozy: {
    text: "text-[13px] leading-[1.35rem]",
    meta: "text-[11px]",
    pad: "px-3 py-2.5",
    gap: "gap-3",
    list: "gap-2",
    pill: "w-10 h-12 text-[12px]",
    disc: "size-[18px] text-[8px]",
  },
  roomy: {
    text: "text-sm leading-6",
    meta: "text-[12px]",
    pad: "px-3.5 py-3.5",
    gap: "gap-3.5",
    list: "gap-3",
    pill: "w-11 h-14 text-[13px]",
    disc: "size-5 text-[9px]",
  },
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
};

/** Relative time from a `now` the host owns: the same text on the server and in the browser. */
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
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

/** Hues for the initials discs, picked by a hash of the name. */
const HUES = [262, 205, 162, 80, 30, 320, 235];
function hueOf(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  }
  return HUES[(h >>> 0) % HUES.length] ?? 262;
}

/** Most votes first; a tie goes to whoever asked first, so the order never flickers. */
function sortOpen(list: QueueQuestion[]): QueueQuestion[] {
  return list
    .filter((q) => !q.answer)
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        a.at - b.at ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

function sortAnswered(list: QueueQuestion[]): QueueQuestion[] {
  return list
    .filter((q) => q.answer)
    .sort(
      (a, b) =>
        (b.answer?.at ?? 0) - (a.answer?.at ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/**
 * A number whose digits roll independently toward the way it moved, on
 * snap: up for a vote, down for a withdrawn one. Each digit keeps its place
 * value as its key, so 9 → 10 adds a column instead of rolling every digit.
 */
function Digits({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const [seen, setSeen] = React.useState({ value, dir: 1 });
  let dir = seen.dir;
  if (seen.value !== value) {
    dir = value > seen.value ? 1 : -1;
    setSeen({ value, dir });
  }
  const chars = String(value).split("");
  return (
    <span aria-hidden className={cn("inline-flex tabular-nums", className)}>
      {chars.map((ch, i) => (
        <span
          key={chars.length - i}
          className="relative inline-flex h-[1.3em] w-[1ch] justify-center overflow-clip"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.span
              key={ch}
              custom={dir}
              className="inline-block"
              style={{ lineHeight: "1.3em" }}
              variants={{
                enter: (d: number) => ({
                  opacity: 0,
                  y: motionSafe ? d * 9 : 0,
                }),
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
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

function Disc({
  author,
  className,
}: {
  author: QueueAuthor | null;
  className: string;
}) {
  if (!author) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-dashed border-hairline-strong text-ink-3",
          className,
        )}
      >
        <VenetianMask className="size-[70%]" />
      </span>
    );
  }
  const hue = hueOf(author.name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full leading-none font-semibold",
        className,
      )}
      style={{
        backgroundColor: `oklch(from var(--accent-bright) 0.86 0.07 ${hue})`,
        color: `oklch(from var(--accent-bright) 0.34 0.08 ${hue})`,
      }}
    >
      {initials(author.name)}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The queue                                 */
/* ----------------------------------------------------------------------- */

type Chip = { id: string; delta: number; n: number };
type Said = { n: number; text: string };

/**
 * The Q&A of a live town hall. Questions sit in two sections — Open, sorted
 * by votes, and Answered — inside one feed. A vote fills the pill and rolls
 * its count digit by digit on snap; a beat later the question lifts and
 * climbs past the ones it overtakes as a layout move on glide while their
 * ranks roll down, then settles on flick with a "▲ 2" chip that pops on
 * recoil. Answering opens an editor under the question on glide; publishing
 * moves the card into Answered as a shared-layout move, stamps it on recoil
 * and opens the answer beneath it.
 *
 * The feed has one roving stop: Up and Down walk the questions, Home and End
 * jump, U upvotes, A answers (host view), every change announced politely.
 * Under reduced motion nothing lifts or travels — a moved question takes its
 * place at once under a fading wash — and every count, rank and answer still
 * changes.
 */
export function QuestionQueue({
  cardStyle = "soft",
  density = "cozy",
  accent = "var(--accent-bright)",
  questions,
  defaultQuestions,
  onQuestionsChange,
  onAsk,
  onUpvote,
  onAnswer,
  now = defaultQueueNow,
  title = "Coldbrook town hall",
  subtitle = "Thursday all-hands · Q&A",
  host = defaultQueueHost,
  asker = defaultQueueAsker,
  canAnswer = true,
  allowAnonymous = true,
  maxLength = 240,
  status = "ready",
  onRetry,
  height = 540,
  label,
  disabled = false,
  className,
}: QuestionQueueProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const inputId = `${uid}-input`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const ready = status === "ready";

  const [own, setOwn] = React.useState<QueueQuestion[]>(
    () => defaultQuestions ?? defaultQueueQuestions,
  );
  const list = questions ?? own;

  const open = React.useMemo(() => sortOpen(list), [list]);
  const answered = React.useMemo(() => sortAnswered(list), [list]);
  const byId = React.useMemo(() => new Map(list.map((q) => [q.id, q])), [list]);

  // The order on screen lags the true order by one beat after a vote, so
  // the count is seen landing before the question moves.
  const targetKey = open.map((q) => q.id).join("|");
  const [shownKey, setShownKey] = React.useState(targetKey);
  if (!motionSafe && shownKey !== targetKey) setShownKey(targetKey);
  React.useEffect(() => {
    if (shownKey === targetKey) return;
    const t = window.setTimeout(() => setShownKey(targetKey), CLIMB_DELAY);
    return () => window.clearTimeout(t);
  }, [shownKey, targetKey]);
  const openShown = React.useMemo(() => {
    const live = new Set(open.map((q) => q.id));
    const kept = shownKey.split("|").filter((id) => live.has(id));
    const keptSet = new Set(kept);
    const ids = [
      ...kept,
      ...open.filter((q) => !keptSet.has(q.id)).map((q) => q.id),
    ];
    return ids
      .map((id) => byId.get(id))
      .filter((q): q is QueueQuestion => q !== undefined);
  }, [open, shownKey, byId]);

  const feed = [...openShown, ...answered];
  const totalVotes = list.reduce((sum, q) => sum + q.votes, 0);

  const [active, setActive] = React.useState<string | null>(null);
  const activeId =
    active && feed.some((q) => q.id === active)
      ? active
      : (feed[0]?.id ?? null);
  const [draft, setDraft] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [editing, setEditing] = React.useState<{
    id: string;
    draft: string;
  } | null>(null);
  const [lift, setLift] = React.useState<string | null>(null);
  const [chip, setChip] = React.useState<Chip | null>(null);
  const [wash, setWash] = React.useState<{ id: string; n: number } | null>(
    null,
  );
  const [fresh, setFresh] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const nodes = React.useRef(new Map<string, HTMLElement>());
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const timers = React.useRef(new Set<number>());
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const focusReq = React.useRef<string | null>(null);
  const scrollReq = React.useRef<string | null>(null);
  const counter = React.useRef(0);
  const chipCount = React.useRef(0);

  // One stable callback for every article, keyed by its id attribute: a
  // motion element whose ref changes between renders is unmounted and
  // mounted again each time. A question that changes sections is a new
  // node, and takes the key over as it arrives.
  const bindArticle = React.useCallback((node: HTMLElement | null) => {
    const id = node?.dataset.qqQuestion;
    if (node && id) nodes.current.set(id, node);
  }, []);

  /** A question's node, if it is still on the page. */
  const nodeOf = (id: string) => {
    const node = nodes.current.get(id);
    return node?.isConnected ? node : undefined;
  };

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      scrollAnim.current?.stop();
    };
  }, []);

  const commit = (next: QueueQuestion[]) => {
    if (questions === undefined) setOwn(next);
    onQuestionsChange?.(next);
  };

  /* ------------------------------ scrolling ------------------------------ */

  const reveal = React.useCallback(
    (node: HTMLElement, glide: boolean) => {
      const el = scrollerRef.current;
      if (!el) return;
      const r = node.getBoundingClientRect();
      const s = el.getBoundingClientRect();
      let to = el.scrollTop;
      if (r.top < s.top + 8) to += r.top - s.top - 8;
      else if (r.bottom > s.bottom - 8) to += r.bottom - s.bottom + 8;
      to = Math.round(
        Math.max(0, Math.min(to, el.scrollHeight - el.clientHeight)),
      );
      if (to === el.scrollTop) return;
      scrollAnim.current?.stop();
      if (!glide || !motionSafe) {
        el.scrollTop = to;
        return;
      }
      scrollAnim.current = animate(el.scrollTop, to, {
        ...springs.glide,
        onUpdate: (v) => {
          el.scrollTop = Math.round(v);
        },
      });
    },
    [motionSafe],
  );

  // Focus and scroll requests made by a handler are carried out once the
  // render that put their target on the page has committed — a question
  // that moved sections is a new node.
  React.useEffect(() => {
    const want = focusReq.current;
    if (want) {
      const node = nodeOf(want);
      if (node) {
        focusReq.current = null;
        node.focus({ preventScroll: true });
        reveal(node, false);
      }
    }
    const scroll = scrollReq.current;
    if (scroll) {
      const node = nodeOf(scroll);
      if (node) {
        scrollReq.current = null;
        reveal(node, true);
      }
    }
  });

  // A question that was just asked fades up into its place on glide. Its
  // body is animated, not the article, which carries the layout move.
  React.useLayoutEffect(() => {
    if (!entering) return;
    const body = nodeOf(entering.id)?.querySelector<HTMLElement>(
      "[data-qq-body]",
    );
    if (!body) return;
    const controls = animate(
      body,
      motionSafe
        ? { opacity: [0, 1], y: [distances.step, 0] }
        : { opacity: [0, 1] },
      motionSafe
        ? {
            y: springs.glide,
            opacity: { duration: durations.base, ease: easings.enter },
          }
        : { duration: durations.fast },
    );
    return () => controls.complete();
    // One arrival per ask; the motion preference is read as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entering]);

  /* ------------------------------- actions ------------------------------- */

  const focusQuestion = (id: string) => {
    setActive(id);
    const node = nodeOf(id);
    if (node) {
      node.focus({ preventScroll: true });
      reveal(node, false);
    } else {
      focusReq.current = id;
    }
  };

  const vote = (q: QueueQuestion) => {
    if (disabled || !ready || q.answer) return;
    const voted = !q.voted;
    const updated: QueueQuestion = {
      ...q,
      voted,
      votes: Math.max(0, q.votes + (voted ? 1 : -1)),
    };
    const next = list.map((x) => (x.id === q.id ? updated : x));
    const before = openShown.findIndex((x) => x.id === q.id);
    const nextOpen = sortOpen(next);
    const after = nextOpen.findIndex((x) => x.id === q.id);
    commit(next);
    setActive(q.id);
    onUpvote?.(updated, voted);
    const moved = before - after;
    if (moved !== 0) {
      if (motionSafe) {
        later(() => setLift(q.id), CLIMB_DELAY);
        later(
          () => setLift((l) => (l === q.id ? null : l)),
          CLIMB_DELAY + LIFT_MS,
        );
      } else {
        setWash((w) => ({ id: q.id, n: (w?.n ?? 0) + 1 }));
      }
    }
    if (moved > 0) {
      chipCount.current += 1;
      const n = chipCount.current;
      later(
        () => setChip({ id: q.id, delta: moved, n }),
        motionSafe ? CLIMB_DELAY + LIFT_MS - 120 : 0,
      );
      later(
        () => setChip((c) => (c?.n === n ? null : c)),
        (motionSafe ? CLIMB_DELAY + LIFT_MS : 0) + CHIP_MS,
      );
    }
    const place = ordinal(after + 1);
    say(
      voted
        ? `Upvoted. ${moved > 0 ? `Now ${place}` : `Still ${place}`} of ${nextOpen.length}, ${plural(updated.votes, "vote", "votes")}.`
        : `Vote withdrawn. ${moved < 0 ? `Now ${place}` : `Still ${place}`} of ${nextOpen.length}, ${plural(updated.votes, "vote", "votes")}.`,
    );
  };

  const ask = () => {
    const text = draft.trim().slice(0, maxLength);
    if (!text || disabled || !ready) return;
    const newest = list.reduce((m, q) => Math.max(m, q.at), 0);
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-q${counter.current}`;
    } while (byId.has(id));
    const anon = allowAnonymous && anonymous;
    const question: QueueQuestion = {
      id,
      text,
      author: anon ? null : asker,
      votes: 0,
      at: Math.max(now, newest + 1000),
    };
    const next = [...list, question];
    commit(next);
    setDraft("");
    setEntering((e) => ({ id, n: (e?.n ?? 0) + 1 }));
    setActive(id);
    scrollReq.current = id;
    const rank = sortOpen(next).findIndex((q) => q.id === id) + 1;
    say(
      `${anon ? "Question asked anonymously" : "Question asked"}. It is ${ordinal(rank)} in the queue.`,
    );
    onAsk?.(text, { anonymous: anon });
  };

  const startAnswer = (q: QueueQuestion) => {
    if (!canAnswer || disabled || !ready || q.answer) return;
    setActive(q.id);
    setEditing({ id: q.id, draft: "" });
  };

  const cancelAnswer = () => {
    if (!editing) return;
    focusReq.current = editing.id;
    setEditing(null);
  };

  const publish = () => {
    if (!editing) return;
    const q = byId.get(editing.id);
    if (!q || q.answer) {
      setEditing(null);
      return;
    }
    const text = editing.draft.trim();
    const updated: QueueQuestion = {
      ...q,
      answer: { text, by: host.name, team: host.team, at: now },
    };
    commit(list.map((x) => (x.id === q.id ? updated : x)));
    setEditing(null);
    setFresh(q.id);
    later(() => setFresh((f) => (f === q.id ? null : f)), 1200);
    setActive(q.id);
    focusReq.current = q.id;
    say(`Answered: ${q.text}`);
    onAnswer?.(updated, text);
  };

  const bindEditor = React.useCallback((node: HTMLTextAreaElement | null) => {
    node?.focus({ preventScroll: true });
  }, []);

  /* ------------------------------ keyboard ------------------------------- */

  const onArticleKey = (
    event: React.KeyboardEvent<HTMLElement>,
    q: QueueQuestion,
  ) => {
    const target = event.target as HTMLElement;
    if (target.closest("textarea, input")) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const at = feed.findIndex((x) => x.id === q.id);
    const go = (i: number) => {
      const next = feed[Math.max(0, Math.min(feed.length - 1, i))];
      if (next) focusQuestion(next.id);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(at - 1);
        return;
      case "PageDown":
        event.preventDefault();
        go(at + 5);
        return;
      case "PageUp":
        event.preventDefault();
        go(at - 5);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(feed.length - 1);
        return;
      case "u":
      case "U":
        event.preventDefault();
        vote(q);
        return;
      case "a":
      case "A":
        if (!canAnswer || q.answer) return;
        event.preventDefault();
        startAnswer(q);
        return;
      default:
        return;
    }
  };

  /* -------------------------------- render ------------------------------- */

  const style = cardStyle;
  const rowSurface =
    style === "soft"
      ? "rounded-3 bg-surface-2"
      : style === "outline"
        ? "rounded-3 border border-hairline bg-card"
        : "rounded-none border-b border-hairline last:border-b-0";
  const listGap = style === "flat" ? "gap-0" : d.list;

  const voteDisabled = disabled || !ready;

  const renderQuestion = (q: QueueQuestion, index: number) => {
    const isOpen = !q.answer;
    const rank = isOpen ? index + 1 : 0;
    const top = isOpen && index === 0;
    const isActive = q.id === activeId;
    const lifted = lift === q.id && motionSafe;
    const textId = `${uid}-t-${q.id}`;
    const metaId = `${uid}-m-${q.id}`;
    const pos = feed.findIndex((x) => x.id === q.id) + 1;
    const isEditing = editing?.id === q.id;
    const showChip = chip?.id === q.id;
    const isFresh = fresh === q.id;
    const who = q.author ? q.author.name : "Anonymous";

    return (
      <motion.article
        key={q.id}
        ref={bindArticle}
        data-qq-question={q.id}
        layout={motionSafe ? "position" : false}
        layoutId={motionSafe ? `${uid}-q-${q.id}` : undefined}
        initial={false}
        animate={{ scale: lifted ? 1.02 : 1 }}
        transition={{
          layout: springs.glide,
          scale: lifted ? springs.snap : springs.flick,
        }}
        tabIndex={isActive ? 0 : -1}
        aria-labelledby={textId}
        aria-describedby={`${metaId} ${hintId}`}
        aria-posinset={pos}
        aria-setsize={feed.length}
        onFocus={(event) => {
          if (event.target === event.currentTarget) setActive(q.id);
        }}
        onKeyDown={(event) => onArticleKey(event, q)}
        className={cn(
          "relative flex",
          d.gap,
          d.pad,
          rowSurface,
          "transition-shadow duration-300",
          lifted &&
            "shadow-[0_14px_30px_-12px_color-mix(in_oklab,var(--qq-accent)_55%,transparent)]",
          FOCUS_IN,
        )}
        style={{ zIndex: lifted ? 3 : isEditing ? 2 : 1 }}
      >
        {wash?.id === q.id ? (
          <motion.span
            key={`wash-${wash.n}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-(--qq-accent)"
            initial={{ opacity: 0.18 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: easings.enter }}
          />
        ) : null}
        {top ? (
          <span
            aria-hidden
            className={cn(
              "absolute left-0 w-[3px] rounded-full bg-(--qq-accent)",
              style === "flat" ? "inset-y-2" : "inset-y-3",
            )}
          />
        ) : null}

        {/* The vote pill: a toggle, its count rolling digit by digit. */}
        <div className="relative shrink-0 self-start">
          {isOpen ? (
            <button
              type="button"
              aria-pressed={!!q.voted}
              aria-label={`Upvote, ${plural(q.votes, "vote", "votes")}`}
              aria-disabled={voteDisabled || undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => vote(q)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-2 border font-mono font-medium transition-colors",
                d.pill,
                q.voted
                  ? "border-[color-mix(in_oklab,var(--qq-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--qq-accent)_14%,transparent)] text-(--qq-accent)"
                  : "border-hairline bg-card text-ink-2 hover:border-hairline-strong hover:text-foreground",
                voteDisabled && "cursor-not-allowed opacity-60",
                FOCUS_RING,
              )}
            >
              <motion.span
                aria-hidden
                className="flex"
                initial={false}
                animate={{ y: q.voted && motionSafe ? -2 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <ChevronUp className="size-4" strokeWidth={2.25} />
              </motion.span>
              <Digits value={q.votes} motionSafe={motionSafe} />
            </button>
          ) : (
            <span
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 rounded-2 border border-hairline font-mono text-ink-3",
                d.pill,
              )}
            >
              <ChevronUp aria-hidden className="size-4" />
              <span className="tabular-nums">{q.votes}</span>
              <span className="sr-only"> votes</span>
            </span>
          )}
          <AnimatePresence>
            {showChip && chip ? (
              <motion.span
                key={`chip-${chip.n}`}
                aria-hidden
                className="absolute -top-2 -right-3 z-[2] inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 font-mono text-[10px] font-semibold text-primary-foreground shadow-sm"
                style={{ backgroundColor: "var(--qq-accent)" }}
                initial={{
                  opacity: 0,
                  scale: motionSafe ? 0.5 : 1,
                  y: motionSafe ? distances.nudge : 0,
                }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.recoil,
                        y: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                ▲{chip.delta}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <div data-qq-body="" className="min-w-0 flex-1">
          <div
            className={cn(
              "mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink-3",
              d.meta,
            )}
          >
            {isOpen ? (
              <span className="inline-flex items-center font-mono tabular-nums">
                #<Digits value={rank} motionSafe={motionSafe} />
                <span className="sr-only">{`Rank ${rank}`}</span>
              </span>
            ) : (
              <motion.span
                key={isFresh ? "stamp-fresh" : "stamp"}
                className="inline-flex h-[18px] items-center gap-1 rounded-full px-1.5 font-medium text-success"
                style={{
                  backgroundColor:
                    "color-mix(in oklab, oklch(from var(--success) 0.72 0.14 h) 16%, transparent)",
                }}
                initial={
                  isFresh ? { scale: motionSafe ? 1.3 : 1, opacity: 0 } : false
                }
                animate={{ scale: 1, opacity: 1 }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <Check aria-hidden className="size-3" strokeWidth={2.5} />
                Answered
              </motion.span>
            )}
            {top ? (
              <span className="rounded-full border border-[color-mix(in_oklab,var(--qq-accent)_40%,transparent)] px-1.5 text-[10px] leading-4 font-medium text-(--qq-accent)">
                Top
              </span>
            ) : null}
            {isOpen && canAnswer && !isEditing ? (
              <button
                type="button"
                tabIndex={isActive ? 0 : -1}
                aria-label={`Answer: ${q.text}`}
                aria-disabled={disabled || !ready || undefined}
                onClick={() => startAnswer(q)}
                className={cn(
                  "-my-1 ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-2 px-1.5 text-ink-2 transition-colors hover:bg-surface-1 hover:text-foreground",
                  (disabled || !ready) && "cursor-not-allowed opacity-50",
                  FOCUS_RING,
                )}
              >
                <CornerDownRight aria-hidden className="size-3.5" />
                <span aria-hidden>Answer</span>
              </button>
            ) : null}
          </div>
          <p
            id={textId}
            className={cn(
              "break-words",
              d.text,
              isOpen ? "text-foreground" : "text-ink-2",
            )}
          >
            {q.text}
          </p>
          <div
            id={metaId}
            className={cn(
              "mt-1.5 flex min-w-0 items-center gap-1.5 text-ink-3",
              d.meta,
            )}
          >
            <Disc author={q.author} className={d.disc} />
            <span
              title={q.author?.team ? `${who} · ${q.author.team}` : who}
              className={cn(
                "min-w-0 shrink truncate",
                q.author ? "text-ink-2" : "text-ink-3 italic",
              )}
            >
              {q.author?.team ? `${who} · ${q.author.team}` : who}
            </span>
            <span aria-hidden className="shrink-0">
              ·
            </span>
            <span className="shrink-0">{ago(q.at, now)}</span>
          </div>

          <AnimatePresence initial={false}>
            {isEditing && editing ? (
              <motion.div
                key="editor"
                initial={{ height: motionSafe ? 0 : "auto", opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{
                  height: motionSafe ? 0 : "auto",
                  opacity: 0,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? {
                        height: springs.glide,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                style={{ overflow: "clip", overflowClipMargin: 6 }}
              >
                <div className="pt-2">
                  <div className="rounded-2 border border-hairline-strong bg-card p-1.5">
                    <div className="grid">
                      <textarea
                        ref={bindEditor}
                        aria-label={`Answer: ${q.text}`}
                        rows={2}
                        value={editing.draft}
                        placeholder="Write the answer, or leave it empty if it was answered live"
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setEditing((e) => (e ? { ...e, draft: value } : e));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            cancelAnswer();
                          } else if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            publish();
                          }
                        }}
                        className={cn(
                          "max-h-32 resize-none overflow-y-auto rounded-1 bg-transparent px-1.5 py-1 text-[13px] leading-5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
                          FOCUS_IN,
                        )}
                      />
                      <span
                        aria-hidden
                        className="invisible max-h-32 overflow-hidden px-1.5 py-1 text-[13px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
                      >
                        {`${editing.draft} `}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={cancelAnswer}
                        className={cn(
                          "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={publish}
                        className={cn(
                          "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
                          FOCUS_RING,
                        )}
                        style={{ backgroundColor: "var(--qq-accent)" }}
                      >
                        {editing.draft.trim()
                          ? "Publish answer"
                          : "Mark answered live"}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {q.answer ? (
            <motion.div
              initial={
                isFresh
                  ? { height: motionSafe ? 0 : "auto", opacity: 0 }
                  : false
              }
              animate={{ height: "auto", opacity: 1 }}
              transition={
                motionSafe
                  ? {
                      height: { ...springs.glide, delay: 0.12 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: 0.16,
                      },
                    }
                  : { duration: durations.fast }
              }
              style={{ overflow: "clip" }}
            >
              <blockquote className="mt-2 border-l-2 border-[color-mix(in_oklab,var(--success)_45%,transparent)] pl-2.5">
                <p
                  className={cn(
                    "mb-0.5 flex min-w-0 items-center gap-1.5 text-ink-3",
                    d.meta,
                  )}
                >
                  <span
                    title={
                      q.answer.team
                        ? `${q.answer.by} · ${q.answer.team}`
                        : q.answer.by
                    }
                    className="min-w-0 shrink truncate"
                  >
                    <span className="font-medium text-ink-2">
                      {q.answer.by}
                    </span>
                    {q.answer.team ? ` · ${q.answer.team}` : ""}
                  </span>
                  <span aria-hidden className="shrink-0">
                    ·
                  </span>
                  <span className="shrink-0">{ago(q.answer.at, now)}</span>
                </p>
                <p className={cn("break-words text-foreground", d.text)}>
                  {q.answer.text || (
                    <span className="text-ink-2 italic">
                      Answered live on stage.
                    </span>
                  )}
                </p>
              </blockquote>
            </motion.div>
          ) : null}
        </div>
      </motion.article>
    );
  };

  const heading = (text: string, count: number) => (
    <motion.h3
      layout={motionSafe ? "position" : false}
      transition={{ layout: springs.glide }}
      className="mb-2 flex items-center gap-2 px-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
    >
      <span>{text}</span>
      <span className="tabular-nums">{count}</span>
      <span aria-hidden className="h-px flex-1 bg-hairline" />
    </motion.h3>
  );

  const skeleton = (
    <div aria-hidden className={cn("flex flex-col", listGap)}>
      {[0.82, 0.64, 0.9, 0.56, 0.74].map((w, i) => (
        <div key={i} className={cn("flex", d.gap, d.pad, rowSurface)}>
          <span
            className={cn(
              "shrink-0 rounded-2 bg-surface-1 motion-safe:animate-pulse",
              d.pill,
            )}
          />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <span
              className="h-2.5 rounded-full bg-surface-1 motion-safe:animate-pulse"
              style={{ width: `${Math.round(w * 100)}%` }}
            />
            <span
              className="h-2.5 rounded-full bg-surface-1 motion-safe:animate-pulse"
              style={{ width: `${Math.round(w * 60)}%` }}
            />
            <span className="h-2 w-24 rounded-full bg-surface-1 motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );

  const empty = (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--qq-accent)_12%,transparent)] text-(--qq-accent)"
      >
        <MessageCircleQuestion className="size-5" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">No questions yet</p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          Ask the first one and it starts at the top.
        </p>
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        aria-disabled={disabled || undefined}
        className={cn(
          "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        Ask the first question
      </button>
    </div>
  );

  const left = maxLength - draft.length;
  const anonOn = allowAnonymous && anonymous;
  const canAsk = !!draft.trim() && !disabled && ready;

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container grid w-full grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--qq-accent" as string]: accent }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {ready
              ? `${subtitle} · ${plural(totalVotes, "vote", "votes")}`
              : subtitle}
          </p>
        </div>
        <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
          <span aria-hidden className="size-1.5 rounded-full bg-signal" />
          Live
        </span>
      </header>

      <form
        className="flex flex-col gap-2 border-b border-hairline px-4 py-3 @min-[44rem]:flex-row @min-[44rem]:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <label htmlFor={inputId} className="sr-only">
            Ask a question
          </label>
          <input
            ref={inputRef}
            id={inputId}
            value={draft}
            maxLength={maxLength}
            disabled={disabled || !ready}
            autoComplete="off"
            placeholder="Ask the room a question"
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDraft(value);
            }}
            className={cn(
              "h-9 w-full rounded-2 border border-input bg-surface-1 pr-12 pl-3 text-[13px] text-foreground placeholder:text-ink-3 disabled:cursor-not-allowed",
              FOCUS_RING,
            )}
          />
          {left <= 40 ? (
            <span
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[10px] tabular-nums",
                left <= 10 ? "text-warn" : "text-ink-3",
              )}
            >
              {left}
              <span className="sr-only"> characters left</span>
            </span>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2">
          {allowAnonymous ? (
            <button
              type="button"
              role="switch"
              aria-checked={anonOn}
              disabled={disabled || !ready}
              onClick={() => setAnonymous((a) => !a)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-2 px-1.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                anonOn ? "text-foreground" : "text-ink-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "relative h-4 w-7 shrink-0 rounded-full border transition-colors",
                  anonOn
                    ? "border-transparent bg-(--qq-accent)"
                    : "border-hairline-strong bg-surface-2",
                )}
              >
                <motion.span
                  className={cn(
                    "absolute top-[2px] left-[2px] size-2.5 rounded-full",
                    anonOn ? "bg-primary-foreground" : "bg-ink-3",
                  )}
                  initial={false}
                  animate={{ x: anonOn ? 12 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </span>
              <VenetianMask aria-hidden className="size-3.5 shrink-0" />
              Anonymous
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            aria-disabled={!canAsk || undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-2 px-4 text-[13px] font-medium text-primary-foreground transition-opacity",
              canAsk ? "hover:opacity-90" : "cursor-not-allowed opacity-50",
              FOCUS_RING,
            )}
            style={{ backgroundColor: "var(--qq-accent)" }}
          >
            Ask
          </button>
        </div>
      </form>

      <p id={hintId} className="sr-only">
        {canAnswer
          ? "Up and Down move between questions. U upvotes. A answers."
          : "Up and Down move between questions. U upvotes."}
      </p>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Questions did not load.</p>
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
        <motion.div
          ref={scrollerRef}
          layoutScroll
          className="[scrollbar-width:thin] overflow-y-auto overscroll-contain px-3 pt-3 pb-4"
        >
          {status === "loading" ? (
            <div aria-busy="true">
              <p className="sr-only">Loading questions.</p>
              {skeleton}
            </div>
          ) : feed.length === 0 ? (
            empty
          ) : (
            <LayoutGroup id={uid}>
              <div
                role="feed"
                aria-labelledby={label ? undefined : titleId}
                aria-label={label}
                className="grid grid-cols-1 gap-5 @min-[44rem]:grid-cols-2 @min-[44rem]:items-start"
              >
                <div className="min-w-0">
                  {heading("Open", openShown.length)}
                  {openShown.length === 0 ? (
                    <p className="px-1 pb-2 text-[13px] text-ink-3">
                      Every question has an answer. Ask the next one.
                    </p>
                  ) : (
                    <div className={cn("flex flex-col", listGap)}>
                      {openShown.map((q, i) => renderQuestion(q, i))}
                    </div>
                  )}
                </div>
                {answered.length > 0 ? (
                  <div className="min-w-0">
                    {heading("Answered", answered.length)}
                    <div className={cn("flex flex-col", listGap)}>
                      {answered.map((q, i) => renderQuestion(q, i))}
                    </div>
                  </div>
                ) : null}
              </div>
            </LayoutGroup>
          )}
        </motion.div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
