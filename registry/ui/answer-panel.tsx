"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowDown,
  Brain,
  Check,
  ChevronDown,
  Copy,
  CornerDownRight,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
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
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AnswerSource = {
  id: string;
  /** The page's title, as its card shows it. */
  title: string;
  /** Where it lives, without a protocol: "coldbrook.app/help/cut-offs". */
  site: string;
  /** A sentence or two from the page, shown on the card. */
  snippet?: string;
  /** A quiet line under the snippet: where it is from, when it changed. */
  meta?: string;
};

export type AnswerThought = {
  id: string;
  /** What the assistant did, in a few words. */
  text: string;
  /** How long it took, ms. Printed when done, and paced by `speed` while thinking. */
  ms: number;
};

export type AnswerStatus = "thinking" | "streaming" | "done" | "error";
export type AnswerCitations = "pill" | "number" | "none";
export type AnswerFollowups = "list" | "chips" | "none";
export type AnswerFeedback = "up" | "down" | null;

export type AnswerPanelProps = {
  /** What was asked. Names the panel. */
  question?: string;
  /** The answer. Blank lines split paragraphs, "- " starts a bullet, and [n] cites sources[n - 1]. */
  answer?: string;
  /** The sources the answer can cite, in citation order. */
  sources?: AnswerSource[];
  /** The steps the assistant took before writing, shown in the Thinking block. */
  thoughts?: AnswerThought[];
  /** Follow-up questions offered once the answer is done. */
  suggestions?: string[];
  /** The model that wrote it, printed in the action row. @default "Fernworks Model 3" */
  model?: string;
  /** Controlled lifecycle. The panel asks for the next status through onStatusChange and waits. */
  status?: AnswerStatus;
  /** Initial lifecycle when uncontrolled. @default "thinking" */
  defaultStatus?: AnswerStatus;
  /** Fires when the panel moves on by itself (thinking finished, text finished, Regenerate). */
  onStatusChange?: (status: AnswerStatus) => void;
  /** Tokens per second the answer is written at; thoughts hold for longer when it is slow. @default 32 */
  speed?: number;
  /** Citation markers as numbered pills, as bare superscript numbers, or not at all. @default "pill" */
  citations?: AnswerCitations;
  /** Follow-ups as full-width rows, as wrapping chips, or not at all. @default "list" */
  followups?: AnswerFollowups;
  /** Controlled rating of the answer. */
  feedback?: AnswerFeedback;
  /** Initial rating when uncontrolled. @default null */
  defaultFeedback?: AnswerFeedback;
  /** Fires from the thumb that changed it, and with null when Regenerate clears it. */
  onFeedbackChange?: (feedback: AnswerFeedback) => void;
  /** The reason picked after Not helpful. */
  onFeedbackReason?: (reason: string) => void;
  /** Reasons offered after Not helpful. @default ["Inaccurate", "Out of date", "Missed the question", "Too long"] */
  reasons?: string[];
  /** Regenerate (or Retry) was pressed. Swap `answer` here: the old text rewinds first. */
  onRegenerate?: () => void;
  /** A follow-up was chosen. */
  onFollowup?: (text: string) => void;
  /** A citation or a listed source was opened. */
  onSourceOpen?: (source: AnswerSource) => void;
  /** Copy was pressed, with the plain text that went to the clipboard. */
  onCopy?: (text: string) => void;
  /** What the error line says. @default "The answer stopped partway." */
  errorMessage?: string;
  /** Play the thumbs, the copy and the rewind. Off unless asked for. @default false */
  sound?: boolean;
  /** Disables the actions, the feedback and the follow-ups; the answer still reads. */
  disabled?: boolean;
  className?: string;
};

export const defaultQuestion = "Why did the 14 March payout land a day late?";

export const defaultAnswer = `Payouts submitted after the 16:00 cut-off wait for the next settlement window [1]. The 14 March batch went in at 16:12, so it settled on the 15th instead of the same day [2].

Two changes keep it from happening again:
- Schedule batches before 15:30, which leaves room for a review hold [1].
- Turn on early settlement for payouts under 5,000. They clear the same day for a flat 0.2% fee [3].

Nothing was lost. The funds were in transit for one business day and arrived in full [2].`;

export const defaultSources: AnswerSource[] = [
  {
    id: "cut-offs",
    title: "Settlement windows and cut-off times",
    site: "coldbrook.app/help/cut-offs",
    snippet:
      "Batches received after 16:00 are queued for the next business day's first window. A review hold can add up to 30 minutes.",
    meta: "Help centre · updated 2 Sep",
  },
  {
    id: "batch-0314",
    title: "Batch B-0314 activity log",
    site: "coldbrook.app/activity/b-0314",
    snippet:
      "Submitted 16:12 by finance-ops. Settled 15 Mar at 09:02. 14 payouts, 18,240.00 in total, none returned.",
    meta: "Your account · 15 Mar",
  },
  {
    id: "early",
    title: "Early settlement pricing",
    site: "coldbrook.app/pricing/early-settlement",
    snippet:
      "Payouts under 5,000 can settle the same day for a flat 0.2% fee, capped at 10.00 per payout.",
    meta: "Pricing · updated 28 Aug",
  },
  {
    id: "terms",
    title: "Business account terms, section 7",
    site: "coldbrook.app/legal/business-terms",
    snippet:
      "Settlement times are targets rather than guarantees and depend on the receiving bank's hours.",
    meta: "Legal · effective 1 Jul",
  },
];

export const defaultThoughts: AnswerThought[] = [
  { id: "log", text: "Reading the 14 March batch log", ms: 1200 },
  { id: "cut", text: "Checking settlement cut-off times", ms: 900 },
  { id: "fee", text: "Comparing early settlement pricing", ms: 1100 },
];

export const defaultSuggestions = [
  "How do I turn on early settlement?",
  "Show every late batch this quarter",
  "What triggers a review hold?",
];

const DEFAULT_REASONS = [
  "Inaccurate",
  "Out of date",
  "Missed the question",
  "Too long",
];

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const r2 = (v: number) => Math.round(v * 100) / 100;
const secs = (ms: number) => `${(Math.max(0, ms) / 1000).toFixed(1)} s`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/* ------------------------------- the text ------------------------------- */

type Tok = { i: number; text: string; cite?: number };
type Block = { kind: "p" | "li"; toks: Tok[]; first: number };
type Parsed = {
  blocks: Block[];
  total: number;
  /** The token index at which each source number is first cited. */
  firstCite: Map<number, number>;
};

/** A word with the space after it, a lone run of space, or a citation. */
const TOKEN = /\[(\d+)\]|[^\s[]+\s*|\[|\s+/g;

function parseAnswer(text: string): Parsed {
  const blocks: Block[] = [];
  const firstCite = new Map<number, number>();
  let i = 0;
  const push = (kind: Block["kind"], raw: string) => {
    const line = raw.trim();
    if (!line) return;
    const toks: Tok[] = [];
    const first = i;
    for (const m of line.matchAll(TOKEN)) {
      if (m[1] !== undefined) {
        const n = Number(m[1]);
        if (!firstCite.has(n)) firstCite.set(n, i);
        toks.push({ i, text: "", cite: n });
      } else {
        toks.push({ i, text: m[0] });
      }
      i += 1;
    }
    blocks.push({ kind, toks, first });
  };
  for (const chunk of text.split(/\n\s*\n/)) {
    let para: string[] = [];
    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (line.startsWith("- ")) {
        push("p", para.join(" "));
        para = [];
        push("li", line.slice(2));
      } else if (line) {
        para.push(line);
      }
    }
    push("p", para.join(" "));
  }
  return { blocks, total: i, firstCite };
}

/** The answer as the clipboard gets it: markers out, sources listed after. */
function plainText(parsed: Parsed, sources: AnswerSource[]): string {
  const lines = parsed.blocks.map((b) => {
    const text = b.toks
      .map((t, k) => {
        if (t.cite !== undefined) return "";
        const next = b.toks[k + 1];
        return next?.cite !== undefined ? t.text.trimEnd() : t.text;
      })
      .join("")
      .replace(/\s+([.,;:!?)])/g, "$1")
      .trim();
    return b.kind === "li" ? `- ${text}` : text;
  });
  const cited = [...parsed.firstCite.keys()]
    .filter((n) => sources[n - 1])
    .sort((a, b) => a - b);
  const refs = cited.map((n) => {
    const s = sources[n - 1];
    return s ? `[${n}] ${s.title}, ${s.site}` : "";
  });
  return [...lines, ...(refs.length ? ["", "Sources:", ...refs] : [])].join(
    "\n",
  );
}

/* --------------------------- shared small parts -------------------------- */

const subscribeVisible = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const visibleNow = () => document.visibilityState !== "hidden";
const visibleOnServer = () => true;

/** Opens to its content's measured height on glide; stays mounted, inert while shut. */
function Fold({
  open,
  motionSafe,
  id,
  className,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [height, setHeight] = React.useState<number | null>(null);
  // Bound when the node arrives, so a remounted body is measured again.
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry?.borderBoxSize?.[0]?.blockSize ?? node.offsetHeight;
      setHeight(r2(h));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      id={id}
      inert={!open}
      initial={false}
      animate={{
        height: open ? (height ?? "auto") : 0,
        opacity: open ? 1 : 0,
      }}
      transition={{
        height: motionSafe ? springs.glide : { duration: 0 },
        opacity: open
          ? { duration: durations.base, ease: easings.enter }
          : exitFor(durations.fast),
      }}
      className="overflow-hidden"
    >
      <div ref={measure} className={className}>
        {children}
      </div>
    </motion.div>
  );
}

function SourceCard({
  id,
  n,
  source,
  anchorKey,
  getAnchor,
  getRoot,
  motionSafe,
  onPointerEnter,
  onPointerLeave,
}: {
  id: string;
  n: number;
  source: AnswerSource;
  anchorKey: number;
  getAnchor: () => HTMLElement | null;
  getRoot: () => HTMLElement | null;
  motionSafe: boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const left = useMotionValue(0);
  const top = useMotionValue(0);
  const y = useMotionValue(0);

  // Placed before paint, above its pill when there is room and below it
  // otherwise, and always inside the panel. A StrictMode re-run places it
  // again and starts the rise again, so it never freezes part-way.
  React.useLayoutEffect(() => {
    const card = ref.current;
    const anchor = getAnchor();
    const root = getRoot();
    if (!card || !anchor || !root) return;
    const rr = root.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const ax = ar.left - rr.left;
    const ay = ar.top - rr.top;
    const x = Math.min(
      Math.max(8, ax + ar.width / 2 - cw / 2),
      Math.max(8, rr.width - cw - 8),
    );
    const above = ay - ch - 8 >= 8;
    const t = Math.max(
      8,
      Math.min(above ? ay - ch - 8 : ay + ar.height + 8, rr.height - ch - 8),
    );
    left.set(r2(x));
    top.set(r2(t));
    if (!motionSafe) return;
    y.jump(above ? distances.nudge + 2 : -(distances.nudge + 2));
    const rise = animate(y, 0, springs.snap);
    return () => rise.stop();
  }, [anchorKey, getAnchor, getRoot, motionSafe, left, top, y]);

  return (
    <motion.div
      ref={ref}
      id={id}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.fast, ease: easings.enter }}
      style={{ left, top, y }}
      className="absolute z-30 w-[min(18rem,calc(100%-1rem))] rounded-3 border border-hairline-strong bg-popover p-3 text-popover-foreground shadow-[0_10px_28px_color-mix(in_oklab,black_20%,transparent)]"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-1 bg-cobalt-wash font-mono text-[10px] text-cobalt-bright tabular-nums">
          {n}
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-ink-3">
          {source.site}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 font-medium text-foreground">
        {source.title}
      </p>
      {source.snippet ? (
        <p className="mt-1 line-clamp-3 text-xs leading-[18px] text-ink-2">
          {source.snippet}
        </p>
      ) : null}
      {source.meta ? (
        <p className="mt-2 text-[11px] text-ink-3">{source.meta}</p>
      ) : null}
    </motion.div>
  );
}

function Thumb({
  kind,
  chosen,
  dim,
  disabled,
  motionSafe,
  onPress,
}: {
  kind: "up" | "down";
  chosen: boolean;
  dim: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onPress: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const rotate = useMotionValue(0);
  const scale = useMotionValue(1);
  const was = React.useRef<boolean | null>(null);

  // The kick is the press landing: a thumb thrown a little past upright that
  // settles on recoil. Only a change kicks, so StrictMode's second mount and
  // a panel that starts rated stay still.
  React.useEffect(() => {
    const before = was.current;
    was.current = chosen;
    if (before === null || before === chosen || !chosen || !motionSafe) return;
    rotate.jump(kind === "up" ? -18 : 18);
    scale.jump(1.2);
    const a = animate(rotate, 0, springs.recoil);
    const b = animate(scale, 1, springs.recoil);
    return () => {
      a.stop();
      b.stop();
      rotate.set(0);
      scale.set(1);
    };
  }, [chosen, kind, motionSafe, rotate, scale]);

  const Icon = kind === "up" ? ThumbsUp : ThumbsDown;
  const label = kind === "up" ? "Helpful" : "Not helpful";

  return (
    <button
      type="button"
      aria-pressed={chosen}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-2 px-2 text-[13px] transition-[color,background-color,opacity] hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-50",
        chosen ? "text-cobalt-bright" : "text-ink-2 hover:text-foreground",
        dim && "opacity-60",
        FOCUS,
      )}
    >
      <motion.span
        aria-hidden
        className="grid size-4 place-items-center"
        style={{ rotate, scale }}
      >
        <Icon
          className={cn(
            "col-start-1 row-start-1 size-4 transition-opacity",
            chosen ? "opacity-0" : "opacity-100",
          )}
        />
        <Icon
          fill="currentColor"
          className={cn(
            "col-start-1 row-start-1 size-4 transition-opacity",
            chosen ? "opacity-100" : "opacity-0",
          )}
        />
      </motion.span>
      <motion.span
        aria-hidden
        initial={false}
        animate={{
          width: chosen ? "auto" : 0,
          opacity: chosen ? 1 : 0,
          marginLeft: chosen ? 6 : 0,
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden whitespace-nowrap"
      >
        {label}
      </motion.span>
    </button>
  );
}

/* -------------------------------- the panel ------------------------------ */

type Card = { i: number; n: number };
type Said = { n: number; text: string };

/**
 * An answer you can read while it is still being written. The Thinking block
 * lists what the assistant did, one step at a time, under a label with a
 * travelling sheen; then the answer streams in, a token at a time behind a
 * caret, at `speed` tokens a second, and each citation arrives in place as a
 * numbered pill that scales up on snap. Hovering or focusing a pill lifts its
 * source's card on snap, placed above or below it and kept inside the panel.
 * The body follows the caret only while the reader is at the bottom: scroll
 * up to read and it stays put, with a pill to jump back down.
 *
 * When the text is done the Thinking block collapses on glide into a single
 * line ("Thought for 3.2 s · read 4 sources"), the caret fades, and the
 * actions and follow-ups slide up underneath in a cascade. Thumbs are toggles
 * whose pressed state lands on recoil. Regenerate rewinds before it rewrites:
 * the text runs backward on the move ease, thinning at the tape head, and then
 * the panel thinks and writes again.
 *
 * The stream is paced by a rAF loop that runs only while the panel is on
 * screen and the page is visible; it is silent. Under reduced motion the
 * tokens still arrive, without fades, rises or the rewind.
 */
export function AnswerPanel({
  question = defaultQuestion,
  answer = defaultAnswer,
  sources = defaultSources,
  thoughts = defaultThoughts,
  suggestions = defaultSuggestions,
  model = "Fernworks Model 3",
  status: statusProp,
  defaultStatus = "thinking",
  onStatusChange,
  speed = 32,
  citations = "pill",
  followups = "list",
  feedback: feedbackProp,
  defaultFeedback = null,
  onFeedbackChange,
  onFeedbackReason,
  reasons = DEFAULT_REASONS,
  onRegenerate,
  onFollowup,
  onSourceOpen,
  onCopy,
  errorMessage = "The answer stopped partway.",
  sound = false,
  disabled = false,
  className,
}: AnswerPanelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const questionId = `${uid}-q`;
  const foldId = `${uid}-thinking`;
  const cardId = `${uid}-card`;
  const pace = Math.min(240, Math.max(1, speed));

  const rootRef = React.useRef<HTMLElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { amount: 0 });
  const visible = React.useSyncExternalStore(
    subscribeVisible,
    visibleNow,
    visibleOnServer,
  );
  const active = inView && visible;

  const [ownStatus, setOwnStatus] = React.useState<AnswerStatus>(defaultStatus);
  const controlled = statusProp !== undefined;
  const status = statusProp ?? ownStatus;

  // While the text rewinds it is the old text, whatever the host now says.
  const [frozen, setFrozen] = React.useState<string | null>(null);
  const text = frozen ?? answer;
  const parsed = React.useMemo(() => parseAnswer(text), [text]);
  const total = parsed.total;

  // A panel that starts done (or stopped) shows its text whole, as the
  // server sent it; one that starts thinking or streaming starts empty.
  const [count, setCount] = React.useState(() => {
    const first = statusProp ?? defaultStatus;
    return first === "done" || first === "error"
      ? parseAnswer(answer).total
      : 0;
  });
  const shown = Math.min(count, total);
  // Tokens from this index on were written here, so they fade in; the ones
  // the server sent were already there.
  const [freshFrom, setFreshFrom] = React.useState(count);
  const [step, setStep] = React.useState(() =>
    (statusProp ?? defaultStatus) === "thinking" ? 0 : thoughts.length,
  );
  const [rewinding, setRewinding] = React.useState(false);
  const [expanded, setExpanded] = React.useState<boolean | null>(null);
  const [card, setCard] = React.useState<Card | null>(null);
  const [hot, setHot] = React.useState<number | null>(null);
  const [jump, setJump] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [reasonSent, setReasonSent] = React.useState<string | null>(null);
  const [ownFeedback, setOwnFeedback] =
    React.useState<AnswerFeedback>(defaultFeedback);
  const feedback = feedbackProp !== undefined ? feedbackProp : ownFeedback;
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });

  const countRef = React.useRef(count);
  const pinned = React.useRef(true);
  const pills = React.useRef(new Map<number, HTMLButtonElement>());
  const hover = React.useRef({ open: 0, close: 0 });
  const pointerKind = React.useRef("mouse");
  const scrub = React.useRef<AnimationPlaybackControls | null>(null);
  const spinning = React.useRef<AnimationPlaybackControls | null>(null);
  const copyTimer = React.useRef(0);
  const lastTick = React.useRef(0);
  const spin = useMotionValue(0);

  const thoughtTotal = thoughts.reduce((sum, t) => sum + t.ms, 0);
  const citedCount = [...parsed.firstCite.keys()].filter(
    (n) => sources[n - 1],
  ).length;

  const sentence = (s: AnswerStatus) =>
    s === "thinking"
      ? "Thinking."
      : s === "streaming"
        ? "Writing the answer."
        : s === "done"
          ? citedCount > 0
            ? `Answer ready, ${plural(citedCount, "source")} cited.`
            : "Answer ready."
          : errorMessage;
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  // A status the host (or the panel) moved to is spoken once, in the render
  // that flips it. A host that sends the panel back to thinking gets a fresh
  // answer: nothing revealed, no steps done.
  const [seen, setSeen] = React.useState(status);
  if (seen !== status) {
    setSeen(status);
    setSaid((s) => ({ n: s.n + 1, text: sentence(status) }));
    if (status === "thinking") {
      setCount(0);
      setStep(0);
      setFreshFrom(0);
      setExpanded(null);
    }
  }

  React.useEffect(() => {
    countRef.current = count;
  });

  const request = (next: AnswerStatus) => {
    if (next === status) return;
    if (!controlled) setOwnStatus(next);
    onStatusChange?.(next);
  };
  const latest = React.useRef({ request });
  React.useEffect(() => {
    latest.current = { request };
  });

  /* ------------------------------ pacing ------------------------------ */

  const thoughtsLen = thoughts.length;
  const thoughtMs = thoughts[step]?.ms ?? 0;
  // One thought at a time, each for its own time scaled to the pace; the
  // last one done, the panel asks to write. Timers stop off screen and in a
  // hidden tab, and start the current step over when it comes back.
  React.useEffect(() => {
    if (status !== "thinking" || rewinding || !active) return;
    const scale = Math.min(2.5, Math.max(0.4, 32 / pace));
    const done = step >= thoughtsLen;
    const id = window.setTimeout(
      () => {
        if (done) latest.current.request("streaming");
        else setStep((s) => Math.min(thoughtsLen, s + 1));
      },
      Math.round((done ? 260 : thoughtMs) * scale),
    );
    return () => window.clearTimeout(id);
  }, [status, rewinding, active, step, thoughtsLen, thoughtMs, pace]);

  // The writing itself: whole tokens at `speed` a second on rAF. A host that
  // says done early has the rest flushed at six times the pace.
  React.useEffect(() => {
    const flowing =
      (status === "streaming" || status === "done") && !rewinding && active;
    if (!flowing) return;
    const rate = status === "done" ? pace * 6 : pace;
    let c = Math.min(countRef.current, total);
    let last = -1;
    let carry = 0;
    let raf = 0;
    const frame = (ts: number) => {
      if (last < 0) last = ts;
      carry += ((ts - last) / 1000) * rate;
      last = ts;
      const add = Math.floor(carry);
      if (add > 0 && c < total) {
        carry -= add;
        c = Math.min(total, c + add);
        setCount(c);
      }
      if (c >= total) {
        if (status === "streaming") latest.current.request("done");
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [status, rewinding, active, pace, total]);

  // Follow the caret, but only a reader who is already at the bottom.
  const writing =
    status === "streaming" || (status === "done" && shown < total);
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !writing || !pinned.current) return;
    el.scrollTop = el.scrollHeight;
  }, [shown, writing]);

  /* ------------------------------ the card ------------------------------ */

  const clearHover = () => {
    window.clearTimeout(hover.current.open);
    window.clearTimeout(hover.current.close);
  };
  const openCard = (i: number, n: number, delay: number) => {
    clearHover();
    if (delay <= 0) {
      setCard({ i, n });
      setHot(n);
      return;
    }
    hover.current.open = window.setTimeout(() => {
      setCard({ i, n });
      setHot(n);
    }, delay);
  };
  const closeCard = (delay: number) => {
    clearHover();
    if (delay <= 0) {
      setCard(null);
      setHot(null);
      return;
    }
    hover.current.close = window.setTimeout(() => {
      setCard(null);
      setHot(null);
    }, delay);
  };
  const getRoot = React.useCallback(() => rootRef.current, []);
  const cardIndex = card?.i ?? -1;
  const getAnchor = React.useCallback(
    () => pills.current.get(cardIndex) ?? null,
    [cardIndex],
  );

  // A press anywhere outside the panel puts the card away (touch has no leave).
  const cardOpen = card !== null;
  React.useEffect(() => {
    if (!cardOpen) return;
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && root.contains(event.target))
        return;
      setCard(null);
      setHot(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [cardOpen]);

  React.useEffect(() => {
    const timers = hover.current;
    return () => {
      window.clearTimeout(timers.open);
      window.clearTimeout(timers.close);
      window.clearTimeout(copyTimer.current);
      scrub.current?.stop();
      spinning.current?.stop();
    };
  }, []);

  /* ------------------------------ actions ------------------------------ */

  const panOf = (el: Element | null) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const setFeedback = (next: AnswerFeedback) => {
    if (feedbackProp === undefined) setOwnFeedback(next);
    setReasonSent(null);
    onFeedbackChange?.(next);
  };

  const pressThumb = (
    kind: "up" | "down",
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    const next = feedback === kind ? null : kind;
    if (next) {
      audio.play("pop", {
        pitch: kind === "up" ? 1.15 : 0.82,
        gain: 0.5,
        pan: panOf(event.currentTarget),
      });
    }
    setFeedback(next);
    say(
      next === "up"
        ? "Marked helpful."
        : next === "down"
          ? "Marked not helpful. Pick a reason if you like."
          : "Rating cleared.",
    );
  };

  const copy = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const plain = plainText(parsed, sources);
    void navigator.clipboard?.writeText(plain).catch(() => {});
    audio.play("tick", {
      pitch: 1.2,
      gain: 0.45,
      pan: panOf(event.currentTarget),
    });
    onCopy?.(plain);
    setCopied(true);
    say("Copied the answer.");
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  const finishRewind = () => {
    scrub.current = null;
    setRewinding(false);
    setFrozen(null);
    setCount(0);
    setStep(0);
    setFreshFrom(0);
    latest.current.request("thinking");
  };

  const regenerate = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || rewinding) return;
    const from = Math.min(countRef.current, total);
    const pan = panOf(event.currentTarget);
    setFrozen(text);
    setRewinding(true);
    setExpanded(null);
    setCard(null);
    setHot(null);
    if (feedback !== null) setFeedback(null);
    setReasonSent(null);
    say("Regenerating.");
    onRegenerate?.();
    audio.play("tick", { pitch: 1.3, gain: 0.5, pan });
    scrub.current?.stop();
    if (!motionSafe || from === 0) {
      finishRewind();
      return;
    }
    // A tape run backward: slow off the mark, fast through the middle, easing
    // into the start. Long answers take a little longer, never past 0.7 s.
    const duration = Math.min(0.7, Math.max(0.35, 0.25 + from * 0.004));
    lastTick.current = from;
    spinning.current?.stop();
    spinning.current = animate(spin, spin.get() - 360, {
      duration,
      ease: easings.move,
    });
    scrub.current = animate(from, 0, {
      duration,
      ease: easings.move,
      onUpdate: (v) => {
        const n = Math.ceil(v);
        setCount(n);
        if (lastTick.current - n >= 4) {
          lastTick.current = n;
          audio.play("tick", {
            pitch: r2(0.8 + 0.5 * (n / Math.max(1, from))),
            gain: 0.3,
            pan,
          });
        }
      },
      onComplete: finishRewind,
    });
  };

  const pickFollowup = (
    s: string,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    audio.play("pop", {
      pitch: 1,
      gain: 0.45,
      pan: panOf(event.currentTarget),
    });
    onFollowup?.(s);
  };

  /* ------------------------------ derived ------------------------------ */

  const done = status === "done" && shown >= total && !rewinding;
  const autoOpen = !(done || status === "error");
  const open = expanded ?? autoOpen;
  const quiet = !open && (done || status === "error");
  const stepsDone = status === "thinking" ? step : thoughts.length;
  const listed =
    status === "thinking"
      ? thoughts.slice(0, Math.min(thoughts.length, step + 1))
      : thoughts;
  const sheen =
    motionSafe && active && !rewinding && (status === "thinking" || writing);
  const showCaret =
    rewinding ||
    (status !== "error" &&
      (status === "streaming" || shown < total) &&
      status !== "thinking");
  const stalled = status === "streaming" && shown >= total && !rewinding;

  const label: "thinking" | "writing" | "rewinding" | "summary" = rewinding
    ? "rewinding"
    : status === "thinking"
      ? "thinking"
      : writing
        ? "writing"
        : "summary";
  const summary = `Thought for ${secs(thoughtTotal)} · read ${plural(sources.length, "source")}`;
  const labels: Record<typeof label, string> = {
    thinking: "Thinking",
    writing: "Writing the answer",
    rewinding: "Rewinding",
    summary,
  };

  const lit = (n: number) => {
    const at = parsed.firstCite.get(n);
    return at !== undefined && at < shown;
  };

  const tail = (i: number) =>
    rewinding ? Math.min(1, Math.max(0.12, (shown - i) / 8)) : 1;

  const renderTok = (
    b: Block,
    t: Tok,
    k: number,
    glued: boolean,
  ): React.ReactNode => {
    if (t.i >= shown) return null;
    if (t.cite !== undefined) {
      if (citations === "none") return null;
      const src = sources[t.cite - 1];
      if (!src) return null;
      const n = t.cite;
      return (
        <CitePill
          key={t.i}
          i={t.i}
          n={n}
          source={src}
          style={citations}
          fresh={t.i >= freshFrom && motionSafe}
          lift={motionSafe}
          open={card?.i === t.i}
          hot={hot === n}
          opacity={tail(t.i)}
          cardId={cardId}
          bind={(node) => {
            if (node) pills.current.set(t.i, node);
            else pills.current.delete(t.i);
          }}
          onPointerDown={(event) => {
            pointerKind.current = event.pointerType;
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") openCard(t.i, n, 80);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") closeCard(140);
          }}
          onFocus={() => openCard(t.i, n, 0)}
          onBlur={() => closeCard(140)}
          onClick={(event) => {
            // A first tap on a touch screen shows the card; the next opens it.
            if (
              event.detail > 0 &&
              pointerKind.current !== "mouse" &&
              card?.i !== t.i
            ) {
              openCard(t.i, n, 0);
              return;
            }
            onSourceOpen?.(src);
          }}
        />
      );
    }
    let word = glued ? t.text.trimEnd() : t.text;
    if (citations === "none") {
      // Without markers, a space that only led to one goes too.
      let j = k + 1;
      while (b.toks[j]?.cite !== undefined) j += 1;
      const after = b.toks[j];
      if (j > k + 1 && (!after || /^[.,;:!?)]/.test(after.text)))
        word = word.trimEnd();
    }
    const fresh = t.i >= freshFrom;
    return (
      <span key={t.i} style={rewinding ? { opacity: tail(t.i) } : undefined}>
        {fresh ? (
          <motion.span
            initial={motionSafe ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {word}
          </motion.span>
        ) : (
          word
        )}
      </span>
    );
  };

  const renderToks = (b: Block) => {
    const out: React.ReactNode[] = [];
    let k = 0;
    while (k < b.toks.length) {
      const t = b.toks[k];
      if (!t || t.i >= shown) break;
      // A citation never starts a line: the word before it, its markers and
      // the punctuation after them wrap as one.
      if (
        citations !== "none" &&
        t.cite === undefined &&
        b.toks[k + 1]?.cite !== undefined
      ) {
        let j = k + 1;
        while (b.toks[j]?.cite !== undefined) j += 1;
        const after = b.toks[j];
        const end = after && /^[.,;:!?)]/.test(after.text) ? j + 1 : j;
        const parts: React.ReactNode[] = [];
        for (let m = k; m < end; m += 1) {
          const tok = b.toks[m];
          if (tok) parts.push(renderTok(b, tok, m, m === k));
        }
        out.push(
          <span key={`g${t.i}`} className="whitespace-nowrap">
            {parts}
          </span>,
        );
        k = end;
        continue;
      }
      out.push(renderTok(b, t, k, false));
      k += 1;
    }
    return out;
  };

  const lastBlock = (() => {
    let at = -1;
    parsed.blocks.forEach((b, k) => {
      if (b.first < shown) at = k;
    });
    return at;
  })();

  const caret = (
    <AnimatePresence initial={false}>
      {showCaret ? (
        <motion.span
          key="caret"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, width: rewinding && motionSafe ? 6 : 2 }}
          exit={{ opacity: 0, transition: exitFor(durations.base) }}
          transition={{
            opacity: { duration: durations.fast },
            width: motionSafe ? springs.snap : { duration: 0 },
          }}
          className={cn(
            "ml-px inline-block h-[1.1em] rounded-full align-[-0.2em]",
            rewinding ? "bg-cobalt-bright/70" : "bg-cobalt-bright",
            stalled && motionSafe && active && "animate-pulse",
          )}
        />
      ) : null}
    </AnimatePresence>
  );

  // Paragraphs and runs of bullets, as far as the stream has reached.
  const groups: React.ReactNode[] = [];
  for (let k = 0; k < parsed.blocks.length; k += 1) {
    const b = parsed.blocks[k];
    if (!b || b.first >= shown) continue;
    if (b.kind === "p") {
      groups.push(
        <p key={`p${b.first}`}>
          {renderToks(b)}
          {k === lastBlock ? caret : null}
        </p>,
      );
      continue;
    }
    const items: React.ReactNode[] = [];
    let j = k;
    while (j < parsed.blocks.length) {
      const li = parsed.blocks[j];
      if (!li || li.kind !== "li" || li.first >= shown) break;
      items.push(
        <li key={`li${li.first}`} className="pl-0.5">
          {renderToks(li)}
          {j === lastBlock ? caret : null}
        </li>,
      );
      j += 1;
    }
    groups.push(
      <ul
        key={`ul${b.first}`}
        className="flex list-disc flex-col gap-1 pl-5 marker:text-ink-3"
      >
        {items}
      </ul>,
    );
    k = j - 1;
  }
  if (groups.length === 0 && showCaret) groups.push(<p key="empty">{caret}</p>);

  const openSource = card ? sources[card.n - 1] : undefined;
  const fu = followups !== "none" && suggestions.length > 0;
  const iconButton = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-2 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
    FOCUS,
  );
  const stagger = cascade(suggestions.length);

  return (
    <article
      ref={rootRef}
      aria-labelledby={questionId}
      onKeyDown={(event) => {
        // Escape is the card's, wherever focus is inside the panel.
        if (event.key === "Escape" && card) {
          event.preventDefault();
          closeCard(0);
        }
      }}
      className={cn(
        "@container relative isolate flex flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium text-ink-2"
        >
          Q
        </span>
        <p
          id={questionId}
          title={question}
          className="line-clamp-2 min-w-0 flex-1 text-sm leading-5 font-medium"
        >
          {question}
        </p>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <div
          ref={scrollerRef}
          onScroll={() => {
            const el = scrollerRef.current;
            if (!el) return;
            const atBottom =
              el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            pinned.current = atBottom;
            setJump(!atBottom);
            if (card) closeCard(0);
          }}
          className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-4 pt-3 pb-4"
        >
          <div
            className={cn(
              "-mx-3 rounded-3 border transition-colors duration-300",
              quiet
                ? "border-transparent bg-transparent"
                : "border-hairline bg-surface-1",
            )}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={foldId}
              onClick={(event) => {
                setExpanded(!open);
                audio.play("tick", {
                  pitch: open ? 0.9 : 1.1,
                  gain: 0.35,
                  pan: panOf(event.currentTarget),
                });
              }}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-3 px-3 text-left text-[13px]",
                FOCUS_IN,
              )}
            >
              <Brain aria-hidden className="size-4 shrink-0 text-ink-3" />
              <span className="grid min-w-0 flex-1">
                {(Object.keys(labels) as (typeof label)[]).map((key) => {
                  const on = key === label;
                  const shimmer =
                    on && sheen && (key === "thinking" || key === "writing");
                  return (
                    <motion.span
                      key={key}
                      aria-hidden={!on}
                      initial={false}
                      animate={{
                        opacity: on ? 1 : 0,
                        y: on || !motionSafe ? 0 : -distances.nudge,
                      }}
                      // The old label clears out before the new one
                      // arrives, so the two never read on top of each other.
                      transition={
                        on
                          ? {
                              duration: durations.base,
                              ease: easings.enter,
                              delay: durations.blink,
                            }
                          : exitFor(durations.fast)
                      }
                      title={key === "summary" ? summary : undefined}
                      className={cn(
                        "col-start-1 row-start-1 truncate",
                        key === "summary"
                          ? "text-ink-2"
                          : "font-medium text-foreground",
                      )}
                    >
                      {shimmer ? (
                        <motion.span
                          className="bg-[linear-gradient(90deg,var(--ink-3)_0%,var(--ink-3)_35%,var(--foreground)_50%,var(--ink-3)_65%,var(--ink-3)_100%)] bg-[length:250%_100%] bg-clip-text text-transparent"
                          initial={{ backgroundPosition: "100% 0%" }}
                          animate={{ backgroundPosition: ["100% 0%", "0% 0%"] }}
                          transition={{
                            duration: 1.6,
                            ease: "linear",
                            repeat: Infinity,
                          }}
                        >
                          {labels[key]}
                        </motion.span>
                      ) : (
                        labels[key]
                      )}
                    </motion.span>
                  );
                })}
              </span>
              {status === "thinking" && !rewinding && thoughts.length > 0 ? (
                <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                  {Math.min(thoughts.length, step + 1)} / {thoughts.length}
                </span>
              ) : null}
              <motion.span
                aria-hidden
                initial={false}
                animate={{ rotate: open ? 180 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className="flex shrink-0 text-ink-3"
              >
                <ChevronDown className="size-4" />
              </motion.span>
            </button>

            <Fold open={open} motionSafe={motionSafe} id={foldId}>
              <ol className="flex flex-col gap-1.5 px-3 pt-0.5 pb-3">
                {listed.map((t, k) => {
                  const finished = k < stepsDone;
                  return (
                    <motion.li
                      key={t.id}
                      initial={
                        status === "thinking" && motionSafe
                          ? { opacity: 0, y: distances.nudge }
                          : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={springs.snap}
                      className="flex items-center gap-2.5 text-[13px]"
                    >
                      <span
                        aria-hidden
                        className="relative flex size-4 shrink-0 items-center justify-center"
                      >
                        {finished ? (
                          <svg
                            viewBox="0 0 16 16"
                            className="size-4 text-success"
                          >
                            <motion.path
                              d="M4 8.4 6.8 11 12 5.2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={
                                status === "thinking" && motionSafe
                                  ? { pathLength: 0 }
                                  : false
                              }
                              animate={{ pathLength: 1 }}
                              transition={springs.flick}
                            />
                          </svg>
                        ) : (
                          <span
                            className={cn(
                              "size-3 rounded-full border-[1.5px] border-cobalt-bright/25 border-t-cobalt-bright",
                              motionSafe && active && "animate-spin",
                            )}
                          />
                        )}
                      </span>
                      <span
                        title={t.text}
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          finished ? "text-ink-2" : "text-foreground",
                        )}
                      >
                        {t.text}
                      </span>
                      {finished ? (
                        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                          {secs(t.ms)}
                        </span>
                      ) : null}
                    </motion.li>
                  );
                })}
              </ol>
              {(done || status === "error") && sources.length > 0 ? (
                <div className="border-t border-hairline px-3 pt-2 pb-3 @min-[60rem]:hidden">
                  <p className="pb-1 text-[11px] text-ink-3">
                    Read {plural(sources.length, "source")}
                  </p>
                  <ol className="flex flex-col">
                    {sources.map((s, k) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => onSourceOpen?.(s)}
                          className={cn(
                            "flex h-8 w-full items-center gap-2 rounded-2 text-left text-[13px] text-ink-2 transition-colors hover:text-foreground",
                            FOCUS_IN,
                          )}
                        >
                          <span className="flex size-5 shrink-0 items-center justify-center rounded-1 border border-hairline-strong font-mono text-[10px] text-ink-3 tabular-nums">
                            {k + 1}
                          </span>
                          <span
                            className="min-w-0 flex-1 truncate"
                            title={s.title}
                          >
                            {s.title}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </Fold>
          </div>

          <div
            aria-busy={writing || rewinding}
            className={cn(
              "flex flex-col gap-3 text-sm leading-6 text-foreground",
              groups.length > 0 && "mt-3",
            )}
          >
            {groups}
          </div>

          <Fold open={status === "error" && !rewinding} motionSafe={motionSafe}>
            <div className="pt-3">
              <div className="flex items-center gap-2.5 rounded-3 border border-danger/30 bg-danger/8 py-1.5 pr-1.5 pl-3 text-[13px]">
                <TriangleAlert
                  aria-hidden
                  className="size-4 shrink-0 text-danger"
                />
                <span className="min-w-0 flex-1 text-foreground">
                  {errorMessage}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={regenerate}
                  className={cn(
                    iconButton,
                    "border border-hairline-strong bg-card text-foreground",
                  )}
                >
                  <RotateCcw aria-hidden className="size-4" />
                  Retry
                </button>
              </div>
            </div>
          </Fold>

          <Fold open={done} motionSafe={motionSafe}>
            <div className="flex flex-col gap-3 pt-3">
              <motion.div
                initial={false}
                animate={
                  done
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                }
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
                className="-ml-2 flex flex-wrap items-center gap-0.5"
              >
                <button
                  type="button"
                  aria-label={copied ? "Copied" : "Copy answer"}
                  disabled={disabled}
                  onClick={copy}
                  className={iconButton}
                >
                  <span aria-hidden className="grid size-4 place-items-center">
                    <motion.span
                      initial={false}
                      animate={{
                        opacity: copied ? 0 : 1,
                        scale: copied && motionSafe ? 0.6 : 1,
                      }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                      className="col-start-1 row-start-1 flex"
                    >
                      <Copy className="size-4" />
                    </motion.span>
                    <motion.span
                      initial={false}
                      animate={{
                        opacity: copied ? 1 : 0,
                        scale: copied || !motionSafe ? 1 : 0.6,
                      }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                      className="col-start-1 row-start-1 flex text-success"
                    >
                      <Check className="size-4" />
                    </motion.span>
                  </span>
                </button>
                <div
                  role="group"
                  aria-label="Rate this answer"
                  className="flex items-center"
                >
                  <Thumb
                    kind="up"
                    chosen={feedback === "up"}
                    dim={feedback === "down"}
                    disabled={disabled}
                    motionSafe={motionSafe}
                    onPress={(event) => pressThumb("up", event)}
                  />
                  <Thumb
                    kind="down"
                    chosen={feedback === "down"}
                    dim={feedback === "up"}
                    disabled={disabled}
                    motionSafe={motionSafe}
                    onPress={(event) => pressThumb("down", event)}
                  />
                </div>
                <button
                  type="button"
                  aria-label="Regenerate"
                  disabled={disabled}
                  onClick={regenerate}
                  className={iconButton}
                >
                  <motion.span
                    aria-hidden
                    className="flex"
                    style={{ rotate: spin }}
                  >
                    <RotateCcw className="size-4" />
                  </motion.span>
                  <span aria-hidden className="hidden @min-[30rem]:inline">
                    Regenerate
                  </span>
                </button>
                <span className="ml-auto hidden truncate pl-3 text-[11px] text-ink-3 @min-[30rem]:block">
                  {model}
                </span>
              </motion.div>

              <Fold open={feedback === "down"} motionSafe={motionSafe}>
                {reasonSent ? (
                  <p className="flex h-7 items-center gap-2 text-[13px] text-ink-2">
                    <Check
                      aria-hidden
                      className="size-4 shrink-0 text-success"
                    />
                    Thanks, noted.
                  </p>
                ) : (
                  <div
                    role="group"
                    aria-label="What was wrong with it?"
                    className="flex flex-wrap gap-1.5"
                  >
                    {reasons.map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={disabled}
                        onClick={(event) => {
                          audio.play("tick", {
                            pitch: 1,
                            gain: 0.4,
                            pan: panOf(event.currentTarget),
                          });
                          setReasonSent(r);
                          say("Thanks, noted.");
                          onFeedbackReason?.(r);
                        }}
                        className={cn(
                          "inline-flex h-7 items-center rounded-full border border-hairline px-3 text-xs text-ink-2 transition-colors hover:border-hairline-strong hover:text-foreground disabled:opacity-50",
                          FOCUS,
                        )}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </Fold>

              {fu ? (
                <div>
                  <p className="pb-1.5 text-[11px] text-ink-3">Ask next</p>
                  <ul
                    className={cn(
                      followups === "chips"
                        ? "flex flex-wrap gap-1.5"
                        : "flex flex-col border-b border-hairline",
                    )}
                  >
                    {suggestions.map((s, k) => (
                      <motion.li
                        key={s}
                        initial={false}
                        animate={
                          done
                            ? { opacity: 1, y: 0 }
                            : { opacity: 0, y: motionSafe ? distances.step : 0 }
                        }
                        transition={
                          motionSafe
                            ? {
                                ...springs.snap,
                                delay: done ? 0.05 + k * stagger : 0,
                              }
                            : { duration: durations.fast }
                        }
                        className={
                          followups === "chips" ? "max-w-full" : undefined
                        }
                      >
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={(event) => pickFollowup(s, event)}
                          className={cn(
                            followups === "chips"
                              ? "inline-flex h-8 max-w-full items-center rounded-full border border-hairline bg-surface-1 px-3 text-[13px] text-ink-2 transition-colors hover:border-hairline-strong hover:text-foreground"
                              : "group/answer-panel flex w-full items-center gap-2.5 border-t border-hairline py-2 pr-1 text-left text-[13px] text-ink-2 transition-colors hover:text-foreground",
                            "disabled:pointer-events-none disabled:opacity-50",
                            FOCUS_IN,
                          )}
                        >
                          {followups === "chips" ? (
                            <span className="truncate">{s}</span>
                          ) : (
                            <>
                              <CornerDownRight
                                aria-hidden
                                className="size-3.5 shrink-0 text-ink-3 transition-transform group-hover/answer-panel:translate-x-0.5"
                              />
                              <span className="min-w-0 flex-1">{s}</span>
                            </>
                          )}
                        </button>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Fold>
        </div>

        <aside
          aria-label="Sources"
          className="hidden w-64 shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-hairline @min-[60rem]:flex"
        >
          <p className="px-4 pt-3.5 pb-2 text-[11px] text-ink-3">
            Sources · {sources.length}
          </p>
          <ol className="flex flex-col gap-0.5 px-2 pb-3">
            {sources.map((s, k) => {
              const n = k + 1;
              const on = lit(n);
              const cited = parsed.firstCite.has(n);
              const pop =
                on && (parsed.firstCite.get(n) ?? 0) >= freshFrom && motionSafe;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onPointerEnter={() => setHot(n)}
                    onPointerLeave={() => setHot(null)}
                    onFocus={() => setHot(n)}
                    onBlur={() => setHot(null)}
                    onClick={() => onSourceOpen?.(s)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-2 px-2 py-2 text-left transition-colors",
                      hot === n ? "bg-surface-2" : "hover:bg-surface-2",
                      FOCUS_IN,
                    )}
                  >
                    <motion.span
                      key={on ? "lit" : "dim"}
                      initial={pop ? { scale: 0.6 } : false}
                      animate={{ scale: 1 }}
                      transition={springs.snap}
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-1 font-mono text-[10px] tabular-nums",
                        on
                          ? "bg-cobalt-wash text-cobalt-bright"
                          : "border border-hairline-strong text-ink-3",
                      )}
                    >
                      {n}
                    </motion.span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[13px] leading-5 text-foreground">
                        {s.title}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-ink-3">
                        {s.site}
                      </span>
                      {!cited ? (
                        <span className="block text-[11px] text-ink-3">
                          Read, not cited
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center @min-[60rem]:right-64">
          <AnimatePresence>
            {jump && writing ? (
              <motion.button
                key="jump"
                type="button"
                onClick={() => {
                  const el = scrollerRef.current;
                  if (!el) return;
                  pinned.current = true;
                  setJump(false);
                  el.scrollTo({
                    top: el.scrollHeight,
                    behavior: motionSafe ? "smooth" : "auto",
                  });
                }}
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
                className={cn(
                  "pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong bg-popover px-3 text-xs text-foreground shadow-[0_6px_18px_color-mix(in_oklab,black_16%,transparent)]",
                  FOCUS,
                )}
              >
                <ArrowDown aria-hidden className="size-3.5" />
                Jump to latest
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {card && openSource ? (
          <SourceCard
            key={card.i}
            id={cardId}
            n={card.n}
            source={openSource}
            anchorKey={card.i}
            getAnchor={getAnchor}
            getRoot={getRoot}
            motionSafe={motionSafe}
            onPointerEnter={clearHover}
            onPointerLeave={() => closeCard(140)}
          />
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </article>
  );
}

function CitePill({
  i,
  n,
  source,
  style,
  fresh,
  lift,
  open,
  hot,
  opacity,
  cardId,
  bind,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onFocus,
  onBlur,
  onClick,
}: {
  i: number;
  n: number;
  source: AnswerSource;
  style: Exclude<AnswerCitations, "none">;
  fresh: boolean;
  lift: boolean;
  open: boolean;
  hot: boolean;
  opacity: number;
  cardId: string;
  bind: (node: HTMLButtonElement | null) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerEnter: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerLeave: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  // The rewind's tape head thins the pill as it would a word: a plain style
  // on a wrapper, so the arrival spring is never asked to chase it.
  return (
    <span style={opacity < 1 ? { opacity } : undefined}>
      <motion.button
        ref={bind}
        type="button"
        data-cite={i}
        aria-label={`Source ${n}, ${source.title}`}
        aria-describedby={open ? cardId : undefined}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        initial={fresh ? { scale: 0.5, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1, y: open && lift ? -1 : 0 }}
        transition={
          lift
            ? springs.snap
            : { duration: durations.fast, ease: easings.enter }
        }
        className={cn(
          "relative font-mono tabular-nums transition-colors",
          style === "pill"
            ? "mr-0.5 ml-1 inline-flex h-[18px] items-center rounded-full border px-1.5 align-[0.12em] text-[10px] leading-none"
            : "ml-px inline-flex h-4 items-center rounded-1 px-0.5 align-[0.5em] text-[10px] leading-none font-medium",
          style === "pill"
            ? open || hot
              ? "border-cobalt-bright/60 bg-cobalt-wash text-cobalt-bright"
              : "border-hairline-strong bg-surface-2 text-ink-2 hover:border-cobalt-bright/60 hover:text-cobalt-bright"
            : open || hot
              ? "bg-cobalt-wash text-cobalt-bright"
              : "text-cobalt-bright hover:bg-cobalt-wash",
          FOCUS,
        )}
      >
        {n}
      </motion.button>
    </span>
  );
}
