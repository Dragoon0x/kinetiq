"use client";

import * as React from "react";

import {
  ArrowUp,
  Check,
  CircleAlert,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
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
import {
  panFrom,
  useTactileSound,
  type TactileTone,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type ReviewBlock = {
  id: string;
  /** A heading or a paragraph of the draft. @default "paragraph" */
  kind?: "heading" | "paragraph";
  text: string;
};

export type ReviewDocument = {
  /** The draft's name: the surface's heading and accessible name. */
  title: string;
  /** One quiet line under the title: the product, the editor, the version. */
  meta?: string;
  blocks: ReviewBlock[];
};

export type ReviewPerson = {
  id: string;
  name: string;
  /** Shown beside the name in the mention list. */
  role?: string;
  /** The avatar's colour, any CSS colour. Defaults to a token picked from the id. */
  tint?: string;
};

export type ReviewComment = {
  id: string;
  /** A person's id. */
  author: string;
  /** When it was written, in ms. Dated against `now`. */
  at: number;
  /** Plain text; `@Full Name` of anyone in `people` renders as a mention. */
  text: string;
};

export type ReviewAnchor = {
  /** The block the passage is in. */
  block: string;
  /** The passage itself, exactly as it appears in the block. Its first occurrence is highlighted. */
  quote: string;
};

export type ReviewThreadData = {
  id: string;
  anchor: ReviewAnchor;
  /** The first comment opens the thread; the rest are replies. */
  comments: ReviewComment[];
  resolved?: boolean;
  /** Who resolved it, a person's id. */
  resolvedBy?: string;
  resolvedAt?: number;
};

export type ReviewLeaders = "curve" | "elbow" | "off";
export type ReviewResolve = "fold" | "tuck" | "off";
export type ReviewDensity = "compact" | "cozy" | "roomy";
export type ReviewStatus = "ready" | "loading" | "error";

export type ReviewThreadProps = {
  /** The draft under review. @default defaultReviewDocument */
  document?: ReviewDocument;
  /** Controlled discussions, each anchored to a passage. */
  threads?: ReviewThreadData[];
  /** Initial discussions when uncontrolled. @default defaultReviewThreads */
  defaultThreads?: ReviewThreadData[];
  /** Fires from the reply or the resolve that changed the list, with the whole new list. */
  onThreadsChange?: (threads: ReviewThreadData[]) => void;
  /** Everyone who can write here: authors and the mention list. @default defaultReviewPeople */
  people?: ReviewPerson[];
  /** The person replying and resolving, by id. @default "mira" */
  me?: string;
  /** The moment every comment is dated against, as a Date or ms. @default defaultReviewNow */
  now?: Date | number;
  /** Controlled open thread, or null for none. */
  active?: string | null;
  /** Initially open thread when uncontrolled. @default null */
  defaultActive?: string | null;
  /** Fires when a press, a key or a resolve opens or closes a thread. */
  onActiveChange?: (id: string | null) => void;
  /** A reply was sent, with the comment as stored. */
  onReply?: (threadId: string, comment: ReviewComment) => void;
  /** A thread was resolved (true) or reopened (false). */
  onResolve?: (threadId: string, resolved: boolean) => void;
  /** A sent reply mentioned someone. */
  onMention?: (personId: string, threadId: string) => void;
  /** The Retry button of the error state. */
  onRetry?: () => void;
  /** The line that joins a lit passage to its card: a curve, two rounded right angles, or none. @default "curve" */
  leaders?: ReviewLeaders;
  /** What resolving does: fold the thread to a one-line check in place, fold it and tuck it out of the rail, or no resolving at all. @default "fold" */
  resolve?: ReviewResolve;
  /** Type size, card padding, avatar size and how much of a closed thread shows. @default "cozy" */
  density?: ReviewDensity;
  /** The passages' highlight, any CSS colour. @default "var(--warn)" */
  highlight?: string;
  /** Loading draws the surface's skeleton; error offers Retry. @default "ready" */
  status?: ReviewStatus;
  /** The reply composer's placeholder. @default "Reply, or @ to mention" */
  placeholder?: string;
  /** The region's accessible name. @default "Review of" and the title */
  label?: string;
  /** Play the ticks and pops. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults -------------------------------- */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Tuesday 30 September 2026, 15:10 UTC. */
export const defaultReviewNow = Date.UTC(2026, 8, 30, 15, 10);
const before = (ms: number) => defaultReviewNow - ms;

export const defaultReviewPeople: ReviewPerson[] = [
  { id: "mira", name: "Mira Okonjo", role: "Content design" },
  { id: "tobias", name: "Tobias Lind", role: "Product" },
  { id: "priya", name: "Priya Raman", role: "Payments engineering" },
  { id: "eli", name: "Eli Navarro", role: "Research" },
  { id: "sanne", name: "Sanne de Wit", role: "Support lead" },
];

export const defaultReviewDocument: ReviewDocument = {
  title: "Checkout copy, v3",
  meta: "Waylight Pay · drafted by Mira Okonjo",
  blocks: [
    {
      id: "intro",
      text: "Paying with Waylight should feel like handing over cash: quick, certain and over before you notice. This draft rewrites every line a buyer reads between the basket and the receipt.",
    },
    { id: "h-pay", kind: "heading", text: "Payment step" },
    {
      id: "pay",
      text: "The button reads Pay now until the card is checked, then shows the exact amount, so nobody presses a button whose total they have not seen. If a card is declined we say why in one sentence and keep everything they typed.",
    },
    {
      id: "cards",
      text: "Saved cards come first, newest on top. A buyer can remove one from the same row without leaving checkout.",
    },
    { id: "h-receipt", kind: "heading", text: "Receipt" },
    {
      id: "receipt",
      text: "The receipt arrives within a minute and names the store the way it appears on the bank statement, so a charge is never a mystery three weeks later.",
    },
  ],
};

export const defaultReviewThreads: ReviewThreadData[] = [
  {
    id: "pay-now",
    anchor: { block: "pay", quote: "Pay now" },
    comments: [
      {
        id: "pay-now-1",
        author: "tobias",
        at: before(3 * HOUR),
        text: "Could this read Pay plus the amount from the start? Pay now with no figure feels like a leap.",
      },
      {
        id: "pay-now-2",
        author: "mira",
        at: before(2 * HOUR + 20 * MIN),
        text: "@Priya Raman can we show the total before the card check without it flickering?",
      },
      {
        id: "pay-now-3",
        author: "priya",
        at: before(48 * MIN),
        text: "Yes, once the basket is final. Tax is the only thing that can still move it.",
      },
    ],
  },
  {
    id: "decline",
    anchor: { block: "pay", quote: "say why in one sentence" },
    comments: [
      {
        id: "decline-1",
        author: "priya",
        at: before(5 * HOUR),
        text: "Decline reasons have to stay generic. “Your bank declined this payment” is as far as we can go.",
      },
    ],
  },
  {
    id: "newest",
    anchor: { block: "cards", quote: "newest on top" },
    resolved: true,
    resolvedBy: "mira",
    resolvedAt: before(26 * MIN),
    comments: [
      {
        id: "newest-1",
        author: "eli",
        at: before(DAY + 2 * HOUR),
        text: "Most-used on top would save most people a tap.",
      },
      {
        id: "newest-2",
        author: "tobias",
        at: before(DAY),
        text: "True, but right after adding a card people look for it at the top. Keeping newest.",
      },
    ],
  },
  {
    id: "minute",
    anchor: { block: "receipt", quote: "within a minute" },
    comments: [
      {
        id: "minute-1",
        author: "sanne",
        at: before(12 * MIN),
        text: "Can we promise a minute? Friday receipts take closer to ninety seconds.",
      },
      {
        id: "minute-2",
        author: "eli",
        at: before(4 * MIN),
        text: "“Within two minutes” is still a promise people remember.",
      },
    ],
  },
];

/* -------------------------------- helpers -------------------------------- */

/** Below this the threads live under their paragraphs; above it, in a rail. */
const PHONE = 600;
/** From here a thread index joins on the left. */
const DESKTOP = 1040;
/** Between cards in the rail, px. */
const GAP = 8;
/** How long a resolved thread lingers in the rail before it is tucked, ms. */
const TUCK_MS = 700;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TINTS = [
  "var(--accent-bright)",
  "var(--signal)",
  "var(--warn)",
  "var(--success)",
  "var(--danger)",
];

const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const toMs = (now: Date | number | undefined) =>
  now === undefined
    ? defaultReviewNow
    : typeof now === "number"
      ? now
      : now.getTime();

/** "just now", "4 min ago", "3 hr ago", "yesterday", "5 days ago". */
function ago(at: number, now: number): string {
  const d = Math.max(0, now - at);
  if (d < 45_000) return "just now";
  if (d < HOUR) return `${Math.max(1, Math.round(d / MIN))} min ago`;
  if (d < DAY) return `${Math.round(d / HOUR)} hr ago`;
  if (d < 2 * DAY) return "yesterday";
  return `${Math.floor(d / DAY)} days ago`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const tintOf = (person: ReviewPerson | undefined, id: string) =>
  person?.tint ?? TINTS[hash(id) % TINTS.length] ?? "var(--accent-bright)";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Ends a sentence once, even when the words it quotes already end in a full stop. */
const sentence = (text: string) =>
  /[.!?…]["”’)]?$/.test(text.trim()) ? text : `${text}.`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Segment = { text: string; thread?: string };

/** A block's text cut around its passages; the first of two overlapping passages keeps the overlap. */
function segmentsOf(
  block: ReviewBlock,
  threads: readonly ReviewThreadData[],
): Segment[] {
  const spans: { start: number; end: number; id: string }[] = [];
  for (const t of threads) {
    if (t.anchor.block !== block.id || !t.anchor.quote) continue;
    const start = block.text.indexOf(t.anchor.quote);
    if (start === -1) continue;
    spans.push({ start, end: start + t.anchor.quote.length, id: t.id });
  }
  spans.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start < at) continue;
    if (s.start > at) out.push({ text: block.text.slice(at, s.start) });
    out.push({ text: block.text.slice(s.start, s.end), thread: s.id });
    at = s.end;
  }
  if (at < block.text.length) out.push({ text: block.text.slice(at) });
  return out;
}

/** The people a typed `@query` could mean, best first. */
function matchPeople(
  people: readonly ReviewPerson[],
  query: string,
  me: string,
): ReviewPerson[] {
  const q = query.toLowerCase();
  return people
    .filter((p) => p.id !== me)
    .filter(
      (p) =>
        q === "" ||
        p.name
          .toLowerCase()
          .split(/\s+/)
          .some((w) => w.startsWith(q)),
    )
    .slice(0, 5);
}

/** The `@query` the caret is in, if any. */
function mentionAt(text: string, caret: number) {
  const m = /(^|\s)@([^\s@]{0,24})$/.exec(text.slice(0, caret));
  if (!m) return null;
  const query = m[2] ?? "";
  return { start: caret - query.length - 1, query };
}

function RichText({
  text,
  people,
}: {
  text: string;
  people: readonly ReviewPerson[];
}) {
  const names = people
    .map((p) => p.name)
    .sort((a, b) => b.length - a.length)
    .map(escapeRe);
  if (names.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(@(?:${names.join("|")}))`, "g"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className="rounded-1 bg-cobalt-wash px-0.5 font-medium text-cobalt-bright"
          >
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

function Avatar({
  person,
  id,
  size,
}: {
  person: ReviewPerson | undefined;
  id: string;
  size: number;
}) {
  const tint = tintOf(person, id);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        color: tint,
        background: `color-mix(in oklab, ${tint} 18%, transparent)`,
      }}
    >
      {initials(person?.name ?? "?")}
    </span>
  );
}

type DensitySpec = {
  doc: string;
  heading: string;
  text: string;
  block: string;
  pad: number;
  avatar: number;
  clamp: string;
};

const DENSITY: Record<ReviewDensity, DensitySpec> = {
  compact: {
    doc: "text-[13px] leading-[1.55]",
    heading: "text-sm mt-4 mb-1.5",
    text: "text-[12px] leading-[1.45]",
    block: "mb-2.5",
    pad: 8,
    avatar: 18,
    clamp: "line-clamp-1",
  },
  cozy: {
    doc: "text-sm leading-[1.65]",
    heading: "text-[15px] mt-5 mb-2",
    text: "text-[13px] leading-normal",
    block: "mb-3.5",
    pad: 12,
    avatar: 22,
    clamp: "line-clamp-2",
  },
  roomy: {
    doc: "text-[15px] leading-[1.75]",
    heading: "text-base mt-6 mb-2.5",
    text: "text-[13px] leading-[1.6]",
    block: "mb-4",
    pad: 14,
    avatar: 26,
    clamp: "line-clamp-3",
  },
};

/** A passage's box, in the scroll content's own px. */
type Anchor = {
  /** The first line's top and height: the card aligns its header on it. */
  top: number;
  lineH: number;
  /** The end of the passage's last line, at its underline. */
  endX: number;
  endY: number;
  /** The middle of the first line, for the phone layout's notch. */
  midX: number;
};

type Geo = {
  railLeft: number;
  railTop: number;
  /** The document column's right edge: the leader runs along the line to here. */
  docRight: number;
  /** Where text starts in the document column. */
  textLeft: number;
};

type Slot = {
  y: MotionValue<number>;
  natural: () => number;
  node: () => HTMLElement | null;
  target?: number;
  anim?: AnimationPlaybackControls;
};

type Play = (tone: TactileTone, pitch: number, el?: Element | null) => void;

/**
 * The leader, in the card's own coordinates (its top-left is 0,0): along the
 * passage's underline to the document's edge, then across the gap into the
 * card's header.
 */
function leaderPath(
  kind: ReviewLeaders,
  sx: number,
  sy: number,
  edge: number,
  ey: number,
): string {
  if (kind === "off") return "";
  const x0 = Math.max(sx, Math.min(edge, -6));
  const run = sx < x0 - 1 ? ` H ${r2(x0)}` : "";
  const head = `M ${r2(sx)} ${r2(sy)}${run}`;
  if (kind === "curve") {
    const k = r2(Math.max(6, -x0 * 0.6));
    return `${head} C ${r2(x0 + k)} ${r2(sy)} ${r2(-k)} ${r2(ey)} 0 ${r2(ey)}`;
  }
  const dy = ey - sy;
  if (Math.abs(dy) < 1) return `${head} H 0`;
  const mx = x0 / 2;
  const r = Math.min(6, Math.abs(dy) / 2, Math.abs(mx - x0), Math.abs(mx));
  const s = Math.sign(dy);
  return `${head} H ${r2(mx - r)} Q ${r2(mx)} ${r2(sy)} ${r2(mx)} ${r2(sy + s * r)} V ${r2(ey - s * r)} Q ${r2(mx)} ${r2(ey)} ${r2(mx + r)} ${r2(ey)} H 0`;
}

/* -------------------------------- composer -------------------------------- */

type ComposerProps = {
  name: string;
  people: readonly ReviewPerson[];
  me: string;
  placeholder: string;
  disabled: boolean;
  motionSafe: boolean;
  textClass: string;
  onSend: (text: string) => void;
  onClose: () => void;
  keepInView: (el: Element | null) => void;
  play: Play;
  say: (text: string) => void;
};

function Composer({
  name,
  people,
  me,
  placeholder,
  disabled,
  motionSafe,
  textClass,
  onSend,
  onClose,
  keepInView,
  play,
  say,
}: ComposerProps) {
  const uid = React.useId();
  const listId = `${uid}-people`;
  const [draft, setDraft] = React.useState("");
  const [mention, setMention] = React.useState<{
    start: number;
    query: string;
  } | null>(null);
  const [pick, setPick] = React.useState(0);
  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const caretNext = React.useRef<number | null>(null);

  const matches = mention ? matchPeople(people, mention.query, me) : [];
  const listOpen = mention !== null && matches.length > 0;
  const chosen = matches[Math.min(pick, matches.length - 1)];
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  // The people list opens under the box: the view follows it down.
  React.useEffect(() => {
    if (listOpen) keepInView(boxRef.current);
  }, [listOpen, keepInView]);

  // The caret goes after an inserted name once the new text is in the box.
  React.useLayoutEffect(() => {
    const at = caretNext.current;
    const area = areaRef.current;
    if (at === null || !area) return;
    caretNext.current = null;
    area.setSelectionRange(at, at);
  });

  const track = (text: string, caret: number) => {
    const next = mentionAt(text, caret);
    if (!next) {
      if (mention) setMention(null);
      return;
    }
    if (mention && mention.query === next.query && mention.start === next.start)
      return;
    setMention(next);
    setPick(0);
    if (!mention) {
      const n = matchPeople(people, next.query, me).length;
      if (n) say(`${plural(n, "person", "people")} match.`);
    }
  };

  const insert = (person: ReviewPerson) => {
    const area = areaRef.current;
    if (!mention || !area) return;
    const caret = area.selectionStart;
    const text = `${draft.slice(0, mention.start)}@${person.name} ${draft.slice(caret)}`;
    caretNext.current = mention.start + person.name.length + 2;
    setDraft(text);
    setMention(null);
    play("tick", 1.5, area);
  };

  const send = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
    setMention(null);
    // The reply lands above the box and pushes it down.
    requestAnimationFrame(() => keepInView(boxRef.current));
  };

  return (
    <div ref={boxRef} className="flex flex-col gap-1.5">
      <div className="flex items-end gap-1.5 rounded-2 border border-hairline bg-surface-0 p-1 transition-colors focus-within:border-hairline-strong">
        <div className="grid min-w-0 flex-1">
          <span
            aria-hidden
            className={cn(
              "invisible col-start-1 row-start-1 max-h-28 overflow-hidden px-1.5 py-1 break-words whitespace-pre-wrap",
              textClass,
            )}
          >
            {`${draft} `}
          </span>
          <textarea
            ref={areaRef}
            rows={1}
            value={draft}
            disabled={disabled}
            placeholder={placeholder}
            aria-label={`Reply to ${name}`}
            aria-autocomplete="list"
            aria-controls={listOpen ? listId : undefined}
            aria-activedescendant={
              listOpen && chosen ? `${listId}-${chosen.id}` : undefined
            }
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              track(
                event.currentTarget.value,
                event.currentTarget.selectionStart,
              );
            }}
            onSelect={(event) =>
              track(
                event.currentTarget.value,
                event.currentTarget.selectionStart,
              )
            }
            onBlur={() => setMention(null)}
            onKeyDown={(event) => {
              if (listOpen) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const d = event.key === "ArrowDown" ? 1 : -1;
                  setPick((p) => (p + d + matches.length) % matches.length);
                  play("tick", d > 0 ? 1.35 : 1.25, event.currentTarget);
                  return;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault();
                  if (chosen) insert(chosen);
                  return;
                }
                if (event.key === "Escape") {
                  // The list is what Escape closes first; the thread stays.
                  event.preventDefault();
                  setMention(null);
                  return;
                }
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
            className={cn(
              "col-start-1 row-start-1 max-h-28 resize-none overflow-y-auto rounded-1 bg-transparent px-1.5 py-1 text-foreground placeholder:text-ink-3 disabled:cursor-not-allowed",
              FOCUS_RING_IN,
              textClass,
            )}
          />
        </div>
        <button
          type="button"
          aria-label="Send reply"
          disabled={disabled || draft.trim() === ""}
          onClick={send}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-2 bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-35",
            FOCUS_RING,
          )}
        >
          <ArrowUp aria-hidden className="size-4" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {listOpen ? (
          <motion.ul
            key="people"
            id={listId}
            role="listbox"
            aria-label="People to mention"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              opacity: { duration: durations.fast, ease: easings.enter },
              y: motionSafe ? springs.snap : { duration: 0 },
            }}
            className="flex flex-col rounded-2 border border-hairline-strong bg-popover p-1"
          >
            {matches.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={p === chosen}
                // Keeps the caret in the box; the click below inserts.
                onPointerDown={(event) => event.preventDefault()}
                onPointerMove={() => setPick(i)}
                onClick={() => insert(p)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-1 px-1.5 text-[12px]",
                  p === chosen ? "bg-cobalt-wash" : "",
                )}
              >
                <Avatar person={p} id={p.id} size={18} />
                <span className="min-w-0 truncate font-medium text-foreground">
                  {p.name}
                </span>
                {p.role ? (
                  <span className="ml-auto shrink-0 truncate text-[11px] text-ink-3">
                    {p.role}
                  </span>
                ) : null}
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------- card ---------------------------------- */

type CardProps = {
  thread: ReviewThreadData;
  people: readonly ReviewPerson[];
  me: string;
  now: number;
  d: DensitySpec;
  resolveMode: ReviewResolve;
  leaders: ReviewLeaders;
  rail: boolean;
  placed: boolean;
  open: boolean;
  lit: boolean;
  tabStop: boolean;
  highlight: string;
  motionSafe: boolean;
  disabled: boolean;
  placeholder: string;
  anchor: Anchor | undefined;
  geo: Geo;
  register: (id: string, slot: Slot) => () => void;
  requestLayout: () => void;
  bindHeader: (
    id: string,
    node: HTMLButtonElement | null,
  ) => (() => void) | undefined;
  onToggle: (id: string) => void;
  onClose: (id: string) => void;
  onNav: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onHover: (id: string, on: boolean) => void;
  onFocusIn: (id: string, on: boolean) => void;
  onReply: (id: string, text: string) => void;
  onResolve: (id: string, resolved: boolean, el: Element | null) => void;
  keepInView: (el: Element | null) => void;
  play: Play;
  say: (text: string) => void;
};

/**
 * One discussion. In the rail it is absolutely placed by the surface's layout
 * pass through its own `y`, and it draws its own leader from that same value,
 * so the line follows the card through every glide.
 */
function ThreadCard({
  thread,
  people,
  me,
  now,
  d,
  resolveMode,
  leaders,
  rail,
  placed,
  open,
  lit,
  tabStop,
  highlight,
  motionSafe,
  disabled,
  placeholder,
  anchor,
  geo,
  register,
  requestLayout,
  bindHeader,
  onToggle,
  onClose,
  onNav,
  onHover,
  onFocusIn,
  onReply,
  onResolve,
  keepInView,
  play,
  say,
}: CardProps) {
  const uid = React.useId();
  const headId = `${uid}-head`;
  const bodyId = `${uid}-body`;
  const resolved = !!thread.resolved;
  // A resolved thread rests folded; opened, it unfolds to be read again.
  const folded = resolved && !open;
  const first = thread.comments[0];
  const starter = people.find((p) => p.id === first?.author);
  const resolver = people.find((p) => p.id === thread.resolvedBy);
  const replies = Math.max(0, thread.comments.length - 1);
  const shownComments = open ? thread.comments : thread.comments.slice(0, 1);

  const y = useMotionValue(0);
  const bodyH = useMotionValue(0);
  const [sized, setSized] = React.useState(false);
  const liRef = React.useRef<HTMLLIElement | null>(null);
  const articleRef = React.useRef<HTMLElement | null>(null);
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const bodyAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const shown = React.useRef<number | null>(null);
  const live = React.useRef({ folded, motionSafe });

  React.useLayoutEffect(() => {
    live.current = { folded, motionSafe };
  });

  /** The card's height once its body has finished opening or folding. */
  const natural = React.useCallback(() => {
    const article = articleRef.current;
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!article || !outer || !inner) return 64;
    const body = live.current.folded ? 0 : inner.offsetHeight;
    return article.offsetHeight - outer.offsetHeight + body;
  }, []);

  /** The body follows its content's measured height; folded, it goes to zero. */
  const fit = React.useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const target = live.current.folded ? 0 : inner.offsetHeight;
    if (shown.current === target) return;
    const firstFit = shown.current === null;
    shown.current = target;
    bodyAnim.current?.stop();
    if (firstFit || !live.current.motionSafe) {
      bodyH.jump(target);
      if (firstFit) setSized(true);
    } else {
      bodyAnim.current = animate(bodyH, target, springs.glide);
    }
  }, [bodyH]);

  React.useLayoutEffect(
    () =>
      register(thread.id, {
        y,
        natural,
        node: () => liRef.current,
      }),
    [register, thread.id, y, natural],
  );

  React.useLayoutEffect(() => {
    const inner = innerRef.current;
    const article = articleRef.current;
    if (!inner || !article) return;
    const ro = new ResizeObserver(() => {
      fit();
      requestLayout();
    });
    ro.observe(inner);
    ro.observe(article);
    return () => ro.disconnect();
  }, [fit, requestLayout]);

  // A fold or an unfold changes the target without changing the content.
  React.useLayoutEffect(() => {
    fit();
    requestLayout();
  }, [folded, fit, requestLayout]);

  // A card that leaves while hovered or focused takes that state with it;
  // no pointerleave or blur arrives from a node that is gone.
  React.useEffect(
    () => () => {
      bodyAnim.current?.stop();
      onHover(thread.id, false);
      onFocusIn(thread.id, false);
    },
    [thread.id, onHover, onFocusIn],
  );

  // The card's top-left is 0,0; the header's middle is where the leader lands.
  const attachY = 1 + d.pad + d.avatar / 2;
  const sx = anchor ? anchor.endX - geo.railLeft : 0;
  const sy = anchor ? anchor.endY - geo.railTop : 0;
  const edge = geo.docRight - geo.railLeft;
  const showLeader = rail && placed && !!anchor && leaders !== "off";
  const leaderD = useTransform(y, (v) =>
    showLeader ? leaderPath(leaders, sx, sy - v, edge, attachY) : "",
  );
  const startY = useTransform(y, (v) => r2(sy - v));

  const tint = `color-mix(in oklab, ${highlight} 70%, transparent)`;
  const notchX = anchor ? r2(anchor.midX - geo.textLeft) : 24;
  const time = first ? ago(first.at, now) : "";
  const count = plural(thread.comments.length, "comment", "comments");
  const headName = resolved
    ? `Resolved thread on “${thread.anchor.quote}”, resolved by ${resolver?.name ?? "someone"}, ${count}`
    : `${starter?.name ?? "Someone"} on “${thread.anchor.quote}”, ${count}`;

  return (
    <motion.li
      ref={liRef}
      className={cn(
        rail && placed ? "absolute inset-x-0 top-0" : "relative",
        lit ? "z-10" : "z-0",
      )}
      style={{ y }}
      exit={{
        opacity: 0,
        x: motionSafe ? distances.step : 0,
        transition: exitFor(durations.base),
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover(thread.id, true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHover(thread.id, false);
      }}
      onFocus={() => onFocusIn(thread.id, true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        onFocusIn(thread.id, false);
      }}
    >
      {showLeader ? (
        <svg
          aria-hidden
          width={1}
          height={1}
          className="pointer-events-none absolute top-0 left-0 overflow-visible"
        >
          <motion.path
            d={leaderD}
            fill="none"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: highlight }}
            initial={false}
            animate={{
              pathLength: lit || !motionSafe ? 1 : 0,
              opacity: lit ? 1 : 0,
            }}
            transition={{
              pathLength: motionSafe
                ? { duration: durations.slow, ease: easings.enter }
                : { duration: 0 },
              opacity: {
                duration: lit ? durations.fast : durations.blink,
                ease: lit ? easings.enter : easings.exit,
              },
            }}
          />
          <motion.circle
            cx={r2(sx)}
            cy={startY}
            r={2.5}
            style={{ fill: highlight }}
            initial={false}
            animate={{ opacity: lit ? 1 : 0 }}
            transition={{ duration: durations.fast }}
          />
          <motion.circle
            cx={0}
            cy={r2(attachY)}
            r={2.5}
            style={{ fill: highlight }}
            initial={false}
            animate={{ opacity: lit ? 1 : 0 }}
            transition={{
              duration: durations.fast,
              delay: lit && motionSafe ? 0.18 : 0,
            }}
          />
        </svg>
      ) : null}

      {!rail && leaders !== "off" && anchor ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -top-[5px] z-10 size-2.5 rotate-45 rounded-[2px] border-t border-l bg-card"
          style={{
            left: `clamp(10px, ${notchX - 5}px, calc(100% - 20px))`,
            borderColor: tint,
          }}
          initial={false}
          animate={{ opacity: lit ? 1 : 0 }}
          transition={{ duration: durations.fast }}
        />
      ) : null}

      <article
        ref={articleRef}
        aria-labelledby={headId}
        className={cn(
          "group/review-thread-card relative overflow-clip rounded-3 border bg-card transition-[border-color,box-shadow] duration-200",
          lit ? "" : "border-hairline",
          open &&
            "shadow-[0_8px_24px_color-mix(in_oklab,black_14%,transparent)]",
        )}
        style={{ padding: d.pad, borderColor: lit ? tint : undefined }}
      >
        {resolveMode !== "off" ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 size-3.5"
            style={{
              originX: 1,
              originY: 0,
              background:
                "linear-gradient(225deg, var(--bg-0) 50%, color-mix(in oklab, var(--foreground) 12%, var(--card)) 50%)",
            }}
            initial={false}
            animate={{
              scale: resolved ? 1 : motionSafe ? 0 : 1,
              opacity: resolved ? 1 : 0,
            }}
            transition={
              motionSafe
                ? { scale: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          />
        ) : null}

        <div className="flex items-center gap-2" style={{ height: d.avatar }}>
          <button
            ref={(node) => bindHeader(thread.id, node)}
            id={headId}
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            aria-label={headName}
            tabIndex={tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onToggle(thread.id)}
            onKeyDown={(event) => onNav(thread.id, event)}
            className={cn(
              "-m-1 flex h-[calc(100%+8px)] min-w-0 flex-1 items-center gap-2 rounded-2 p-1 text-left disabled:cursor-not-allowed",
              FOCUS_RING_IN,
            )}
          >
            <span
              className="relative grid shrink-0 place-items-center"
              style={{ width: d.avatar, height: d.avatar }}
            >
              <motion.span
                className="col-start-1 row-start-1 grid place-items-center"
                initial={false}
                animate={{ opacity: resolved ? 0 : 1 }}
                transition={{ duration: durations.fast }}
              >
                <Avatar
                  person={starter}
                  id={first?.author ?? thread.id}
                  size={d.avatar}
                />
              </motion.span>
              <motion.svg
                aria-hidden
                viewBox="0 0 16 16"
                className="col-start-1 row-start-1 size-full"
                initial={false}
                animate={{ opacity: resolved ? 1 : 0 }}
                transition={{ duration: durations.fast }}
              >
                <circle
                  cx={8}
                  cy={8}
                  r={8}
                  style={{
                    fill: "color-mix(in oklab, var(--success) 18%, transparent)",
                  }}
                />
                <motion.path
                  d="M4.6 8.3 7 10.6l4.4-4.9"
                  fill="none"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ stroke: "var(--success)" }}
                  initial={false}
                  animate={{ pathLength: resolved ? 1 : 0 }}
                  transition={
                    motionSafe && resolved
                      ? { ...springs.flick, delay: 0.12 }
                      : { duration: 0 }
                  }
                />
              </motion.svg>
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-[12px]">
              <span className="truncate font-medium text-foreground">
                {resolved
                  ? `Resolved by ${resolver?.name.split(" ")[0] ?? "someone"}`
                  : (starter?.name ?? "Someone")}
              </span>
              <span className="shrink-0 text-[11px] text-ink-3">
                {resolved && thread.resolvedAt !== undefined
                  ? ago(thread.resolvedAt, now)
                  : time}
              </span>
            </span>
          </button>
          {resolveMode !== "off" ? (
            <button
              type="button"
              aria-label={resolved ? "Reopen thread" : "Resolve thread"}
              title={resolved ? "Reopen" : "Resolve"}
              tabIndex={open ? 0 : -1}
              disabled={disabled}
              onClick={(event) =>
                onResolve(thread.id, !resolved, event.currentTarget)
              }
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-[opacity,background-color,color] hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                open
                  ? "opacity-100"
                  : "pointer-events-none opacity-0 group-hover/review-thread-card:pointer-events-auto group-hover/review-thread-card:opacity-100",
                FOCUS_RING,
              )}
            >
              {resolved ? (
                <RotateCcw aria-hidden className="size-3.5" />
              ) : (
                <Check aria-hidden className="size-4" />
              )}
            </button>
          ) : null}
        </div>

        <p
          className="mt-1.5 truncate border-l-2 pl-2 text-[11px] text-ink-3"
          style={{ borderColor: tint }}
          title={thread.anchor.quote}
        >
          {thread.anchor.quote}
        </p>

        <motion.div
          ref={outerRef}
          id={bodyId}
          className="overflow-clip"
          style={{ height: sized ? bodyH : folded ? 0 : "auto" }}
          onClick={() => {
            if (!open && !resolved && !disabled) onToggle(thread.id);
          }}
        >
          <motion.div
            ref={innerRef}
            className="relative flex flex-col gap-2 pt-2"
            style={{ originY: 0, transformPerspective: 600 }}
            initial={false}
            animate={{
              rotateX: folded && motionSafe ? -70 : 0,
              opacity: folded ? 0 : 1,
            }}
            transition={{
              rotateX: motionSafe ? springs.glide : { duration: 0 },
              opacity: {
                duration: folded ? durations.base : durations.fast,
                ease: folded ? easings.exit : easings.enter,
              },
            }}
          >
            <ol role="list" className="relative flex flex-col gap-2.5">
              <AnimatePresence initial={false} mode="popLayout">
                {shownComments.map((c, i) => {
                  const author = people.find((p) => p.id === c.author);
                  return (
                    <motion.li
                      key={c.id}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? distances.step : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: i * cascade(shownComments.length),
                        },
                        y: motionSafe
                          ? {
                              ...springs.snap,
                              delay: i * cascade(shownComments.length),
                            }
                          : { duration: 0 },
                      }}
                      className={cn("flex gap-2", d.text)}
                    >
                      {i === 0 ? (
                        <p
                          className={cn("min-w-0 text-ink-2", !open && d.clamp)}
                        >
                          <span className="sr-only">
                            {author?.name ?? "Someone"}, {ago(c.at, now)}:{" "}
                          </span>
                          <RichText text={c.text} people={people} />
                        </p>
                      ) : (
                        <>
                          <Avatar
                            person={author}
                            id={c.author}
                            size={Math.max(16, d.avatar - 4)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-baseline gap-1.5 text-[12px]">
                              <span className="truncate font-medium text-foreground">
                                {author?.name ?? "Someone"}
                                {c.author === me ? (
                                  <span className="font-normal text-ink-3">
                                    {" "}
                                    (you)
                                  </span>
                                ) : null}
                              </span>
                              <span className="shrink-0 text-[11px] text-ink-3">
                                {ago(c.at, now)}
                              </span>
                            </p>
                            <p className="text-ink-2">
                              <RichText text={c.text} people={people} />
                            </p>
                          </div>
                        </>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
            {!open && replies > 0 ? (
              <p className="cursor-pointer text-[11px] text-ink-3">
                {plural(replies, "more reply", "more replies")}
              </p>
            ) : null}
            {open && !resolved ? (
              <Composer
                name={starter?.name ?? "the thread"}
                people={people}
                me={me}
                placeholder={placeholder}
                disabled={disabled}
                motionSafe={motionSafe}
                textClass={d.text}
                onSend={(text) => onReply(thread.id, text)}
                onClose={() => onClose(thread.id)}
                keepInView={keepInView}
                play={play}
                say={say}
              />
            ) : null}
          </motion.div>
        </motion.div>
      </article>
    </motion.li>
  );
}

/* ------------------------------- skeletons -------------------------------- */

function Skeleton({ mode }: { mode: Mode }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid gap-8 px-4 py-4",
        mode === "phone" ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_17rem]",
      )}
    >
      <div className="flex flex-col gap-2.5">
        {[92, 100, 84, 0, 40, 100, 96, 70].map((w, i) =>
          w === 0 ? (
            <span key={i} className="h-3" />
          ) : (
            <span
              key={i}
              className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
              style={{ width: `${w}%` }}
            />
          ),
        )}
      </div>
      {mode === "phone" ? null : (
        <div className="flex flex-col gap-2">
          {[76, 58, 88].map((h, i) => (
            <span
              key={i}
              className="rounded-3 border border-hairline bg-card motion-safe:animate-pulse"
              style={{ height: h }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- surface -------------------------------- */

type Mode = "phone" | "tablet" | "desktop";

/**
 * A draft under review, its discussions pinned in the margin beside the words
 * they are about. Each card sits at the height of its passage; when one opens
 * and grows, the cards under it glide out of its way, and the one you open is
 * placed exactly on its passage. Hovering a passage or a card brightens the
 * highlight and draws a leader along the passage's underline into the card.
 *
 * Replies are real textareas with @-mentions. Resolving folds the thread back
 * into a one-line check with a dog-eared corner (or tucks it away). On a phone
 * the discussions sit under their paragraphs instead, with a notch that points
 * at the passage.
 *
 * The cards are a roving set of buttons: Up and Down walk the threads in
 * reading order, Enter opens, Escape closes. Under reduced motion cards jump
 * to their places, the fold and the leader fade instead of moving or drawing,
 * and every count, check and highlight still changes.
 */
export function ReviewThread({
  document: doc = defaultReviewDocument,
  threads: threadsProp,
  defaultThreads,
  onThreadsChange,
  people = defaultReviewPeople,
  me = "mira",
  now,
  active,
  defaultActive = null,
  onActiveChange,
  onReply,
  onResolve,
  onMention,
  onRetry,
  leaders = "curve",
  resolve: resolveMode = "fold",
  density = "cozy",
  highlight = "var(--warn)",
  status = "ready",
  placeholder = "Reply, or @ to mention",
  label,
  sound = false,
  disabled = false,
  className,
}: ReviewThreadProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const nowMs = toMs(now);
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownThreads, setOwnThreads] = React.useState<ReviewThreadData[]>(
    () => defaultThreads ?? defaultReviewThreads,
  );
  const threads = threadsProp ?? ownThreads;
  const [ownActive, setOwnActive] = React.useState<string | null>(
    defaultActive,
  );
  const activeId = active !== undefined ? active : ownActive;

  const [hover, setHover] = React.useState<string | null>(null);
  const [focusIn, setFocusIn] = React.useState<string | null>(null);
  const [rove, setRove] = React.useState<string | null>(null);
  const [showResolved, setShowResolved] = React.useState(false);
  const [lingering, setLingering] = React.useState<string[]>([]);
  const [width, setWidth] = React.useState<number | null>(null);
  const [anchors, setAnchors] = React.useState<Record<string, Anchor>>({});
  const [geo, setGeo] = React.useState<Geo>({
    railLeft: 0,
    railTop: 0,
    docRight: 0,
    textLeft: 0,
  });
  const [placed, setPlaced] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  const mode: Mode =
    width === null
      ? "tablet"
      : width < PHONE
        ? "phone"
        : width < DESKTOP
          ? "tablet"
          : "desktop";
  const rail = mode !== "phone";

  /* ----------------------------- derived data ----------------------------- */

  const blockIndex = new Map(doc.blocks.map((b, i) => [b.id, i]));
  const segments = new Map(
    doc.blocks.map((b) => [b.id, segmentsOf(b, threads)]),
  );
  const placedIds = new Set<string>();
  const startOf = new Map<string, number>();
  for (const b of doc.blocks) {
    let at = 0;
    for (const s of segments.get(b.id) ?? []) {
      if (s.thread) {
        placedIds.add(s.thread);
        startOf.set(s.thread, at);
      }
      at += s.text.length;
    }
  }
  const ordered = [...threads].sort((a, b) => {
    const pa = placedIds.has(a.id);
    const pb = placedIds.has(b.id);
    if (pa !== pb) return pa ? -1 : 1;
    return (
      (blockIndex.get(a.anchor.block) ?? 0) -
        (blockIndex.get(b.anchor.block) ?? 0) ||
      (startOf.get(a.id) ?? 0) - (startOf.get(b.id) ?? 0)
    );
  });
  const tucked = (t: ReviewThreadData) =>
    resolveMode === "tuck" &&
    !!t.resolved &&
    !showResolved &&
    !lingering.includes(t.id);
  const visible = ordered.filter((t) => !tucked(t));
  const visibleIds = visible.map((t) => t.id);
  const openCount = threads.filter((t) => !t.resolved).length;
  const resolvedCount = threads.length - openCount;
  const lit = hover ?? focusIn ?? activeId;
  const tabStop =
    rove && visibleIds.includes(rove) ? rove : (visibleIds[0] ?? null);

  /* --------------------------------- refs --------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const docRef = React.useRef<HTMLElement | null>(null);
  const railRef = React.useRef<HTMLUListElement | null>(null);
  const marks = React.useRef(new Map<string, HTMLElement>());
  const headers = React.useRef(new Map<string, HTMLButtonElement>());
  const slots = React.useRef(new Map<string, Slot>());
  const anchorsRef = React.useRef<Record<string, Anchor>>({});
  const geoRef = React.useRef<Geo>(geo);
  const scrollAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const timers = React.useRef(new Set<number>());
  const queued = React.useRef(false);
  const seq = React.useRef(0);
  const railH = useMotionValue(0);
  const api = React.useRef<{ keepInView: (el: Element | null) => void } | null>(
    null,
  );
  const state = React.useRef({
    ids: visibleIds,
    active: activeId,
    rail,
    placed,
    motionSafe,
    attach: 1 + d.pad + d.avatar / 2,
  });

  React.useLayoutEffect(() => {
    state.current = {
      ids: visibleIds,
      active: activeId,
      rail,
      placed,
      motionSafe,
      attach: 1 + d.pad + d.avatar / 2,
    };
  });

  const play: Play = React.useCallback(
    (tone, pitch, el) => {
      const rect = el?.getBoundingClientRect();
      audio.play(tone, {
        pitch,
        gain: tone === "tick" ? 0.35 : 0.55,
        pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
      });
    },
    [audio],
  );

  /* -------------------------------- layout -------------------------------- */

  /**
   * One pass places every card: the open one exactly on its passage, the
   * others as close to theirs as the cards around them allow. Heights are the
   * cards' resting heights, so a card that is still opening already has room.
   */
  const relayout = React.useCallback(() => {
    const s = state.current;
    if (!s.rail) {
      for (const slot of slots.current.values()) {
        slot.anim?.stop();
        slot.y.jump(0);
        slot.target = undefined;
      }
      return;
    }
    const list = s.ids
      .map((id) => ({ id, slot: slots.current.get(id) }))
      .filter((e): e is { id: string; slot: Slot } => !!e.slot);
    const g = geoRef.current;
    const heights = list.map((e) => e.slot.natural());
    const want = list.map((e) => {
      const a = anchorsRef.current[e.id];
      return a ? Math.max(0, a.top + a.lineH / 2 - s.attach - g.railTop) : 0;
    });
    const pos = want.slice();
    const at = list.findIndex((e) => e.id === s.active);
    const h = (i: number) => heights[i] ?? 0;
    const w = (i: number) => want[i] ?? 0;
    const p = (i: number) => pos[i] ?? 0;
    const forward = (from: number) => {
      for (let i = from; i < list.length; i += 1) {
        pos[i] =
          i === 0
            ? Math.max(0, w(i))
            : Math.max(w(i), p(i - 1) + h(i - 1) + GAP);
      }
    };
    if (at === -1) {
      forward(0);
    } else {
      pos[at] = w(at);
      forward(at + 1);
      for (let i = at - 1; i >= 0; i -= 1) {
        pos[i] = Math.min(w(i), p(i + 1) - h(i) - GAP);
      }
      if (p(0) < 0) forward(0);
    }
    let bottom = 0;
    list.forEach((e, i) => {
      const t = r2(p(i));
      bottom = Math.max(bottom, t + h(i));
      const slot = e.slot;
      if (slot.target !== undefined && Math.abs(slot.target - t) < 0.5) return;
      const fresh = slot.target === undefined;
      slot.target = t;
      slot.anim?.stop();
      if (fresh || !s.placed || !s.motionSafe) slot.y.jump(t);
      else slot.anim = animate(slot.y, t, springs.glide);
    });
    railH.set(Math.round(bottom + 16));
  }, [railH]);

  const requestLayout = React.useCallback(() => {
    if (queued.current) return;
    queued.current = true;
    // A microtask: several cards resizing in one frame are placed once, and
    // still before that frame paints.
    queueMicrotask(() => {
      queued.current = false;
      relayout();
    });
  }, [relayout]);

  const register = React.useCallback(
    (id: string, slot: Slot) => {
      slots.current.set(id, slot);
      requestLayout();
      return () => {
        if (slots.current.get(id) === slot) {
          slot.anim?.stop();
          slots.current.delete(id);
        }
      };
    },
    [requestLayout],
  );

  /** Reads every passage's line boxes and the columns' edges. */
  const measure = React.useCallback(() => {
    const content = contentRef.current;
    const docEl = docRef.current;
    if (!content || !docEl) return;
    const base = content.getBoundingClientRect();
    // Inside a scaled host the client rects are scaled; the layout is not.
    const k = content.offsetWidth > 0 ? base.width / content.offsetWidth : 1;
    const local = (v: number, o: number) => r2((v - o) / (k || 1));
    const next: Record<string, Anchor> = {};
    for (const [id, node] of marks.current) {
      const rects = [...node.getClientRects()].filter((r) => r.width > 1);
      const a = rects[0];
      const z = rects[rects.length - 1];
      if (!a || !z) continue;
      next[id] = {
        top: local(a.top, base.top),
        lineH: r2(a.height / (k || 1)),
        endX: local(z.right, base.left),
        endY: local(z.bottom, base.top),
        midX: local(a.left + a.width / 2, base.left),
      };
    }
    const docRect = docEl.getBoundingClientRect();
    const firstText = docEl.querySelector("[data-review-block]");
    const textRect = firstText?.getBoundingClientRect();
    const railRect = railRef.current?.getBoundingClientRect();
    const g: Geo = {
      railLeft: railRect ? local(railRect.left, base.left) : 0,
      railTop: railRect ? local(railRect.top, base.top) : 0,
      docRight: local(docRect.right, base.left),
      textLeft: textRect ? local(textRect.left, base.left) : 0,
    };
    anchorsRef.current = next;
    geoRef.current = g;
    setAnchors((was) =>
      JSON.stringify(was) === JSON.stringify(next) ? was : next,
    );
    setGeo((was) => (JSON.stringify(was) === JSON.stringify(g) ? was : g));
    relayout();
    // Placed once there is a rail to place in: the cards leave the flow
    // already standing where the pass just put them.
    if (railRect) setPlaced(true);
  }, [relayout]);

  // The surface's own width picks its layout, before the first paint.
  React.useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    setWidth(Math.round(node.offsetWidth));
    const ro = new ResizeObserver(() => setWidth(Math.round(node.offsetWidth)));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Anything that moves the words moves the passages.
  const anchorKey = threads
    .map((t) => `${t.id}:${t.anchor.block}:${t.anchor.quote}`)
    .join("|");
  const docKey = doc.blocks.map((b) => `${b.id}:${b.text.length}`).join("|");
  React.useLayoutEffect(() => {
    if (status !== "ready") return;
    measure();
  }, [measure, mode, density, anchorKey, docKey, status]);

  React.useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || status !== "ready") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(content);
    if (docRef.current) ro.observe(docRef.current);
    return () => ro.disconnect();
  }, [measure, mode, status]);

  // Opening, closing and tucking change which card is pinned to its passage.
  const idsKey = visibleIds.join("|");
  React.useLayoutEffect(() => {
    requestLayout();
  }, [activeId, idsKey, requestLayout]);

  React.useEffect(() => {
    const live = timers.current;
    const running = slots.current;
    const onVisibility = () => {
      if (document.hidden) scrollAnim.current?.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      for (const t of live) window.clearTimeout(t);
      live.clear();
      scrollAnim.current?.stop();
      for (const slot of running.values()) slot.anim?.stop();
    };
  }, []);

  /* ------------------------------- actions -------------------------------- */

  const commitThreads = (next: ReviewThreadData[]) => {
    if (threadsProp === undefined) setOwnThreads(next);
    onThreadsChange?.(next);
  };

  const setActive = (id: string | null) => {
    if (id === activeId) return;
    if (active === undefined) setOwnActive(id);
    onActiveChange?.(id);
  };

  const glideTo = (top: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const target = Math.max(
      0,
      Math.min(el.scrollHeight - el.clientHeight, Math.round(top)),
    );
    scrollAnim.current?.stop();
    if (!motionSafe || Math.abs(el.scrollTop - target) < 2) {
      el.scrollTop = target;
      return;
    }
    scrollAnim.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = Math.round(v);
      },
    });
  };

  /** Scrolls just enough to show an element's foot, on glide. */
  const keepInView = React.useCallback((el: Element | null) => {
    api.current?.keepInView(el);
  }, []);

  /** Brings a passage into the upper third of the view when it is out of sight. */
  const reveal = (id: string) => {
    const el = scrollerRef.current;
    const a = anchorsRef.current[id];
    if (!el || !a) return;
    const top = a.top;
    if (top > el.scrollTop + 24 && top < el.scrollTop + el.clientHeight - 140)
      return;
    glideTo(top - el.clientHeight * 0.28);
  };

  React.useLayoutEffect(() => {
    api.current = {
      keepInView: (el) => {
        const box = scrollerRef.current;
        if (!el || !box) return;
        const rect = box.getBoundingClientRect();
        const k = box.offsetHeight > 0 ? rect.height / box.offsetHeight : 1;
        const over =
          (el.getBoundingClientRect().bottom - rect.bottom) / (k || 1) + 12;
        if (over > 0) glideTo(box.scrollTop + over);
      },
    };
  });

  const toggle = (id: string) => {
    const opening = activeId !== id;
    setActive(opening ? id : null);
    setRove(id);
    play("tick", opening ? 1.15 : 0.95, headers.current.get(id));
    if (opening) {
      const t = threads.find((x) => x.id === id);
      say(
        t
          ? `Opened thread on “${t.anchor.quote}”, ${plural(t.comments.length, "comment", "comments")}.`
          : "Opened thread.",
      );
    }
  };

  const close = (id: string) => {
    if (activeId === id) setActive(null);
    headers.current.get(id)?.focus();
  };

  const openFromMark = (id: string) => {
    if (disabled) return;
    setRove(id);
    if (activeId !== id) {
      setActive(id);
      play("tick", 1.15, marks.current.get(id));
      const t = threads.find((x) => x.id === id);
      if (t) {
        say(
          `Opened thread on “${t.anchor.quote}”, ${plural(t.comments.length, "comment", "comments")}.`,
        );
      }
    }
  };

  const jump = (id: string) => {
    setRove(id);
    setActive(id);
    play("tick", 1.15, headers.current.get(id));
    reveal(id);
  };

  const onNav = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = visibleIds.indexOf(id);
    let next: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = visibleIds[Math.min(visibleIds.length - 1, i + 1)];
        break;
      case "ArrowUp":
        next = visibleIds[Math.max(0, i - 1)];
        break;
      case "Home":
        next = visibleIds[0];
        break;
      case "End":
        next = visibleIds[visibleIds.length - 1];
        break;
      case "Escape":
        if (activeId === id) {
          event.preventDefault();
          setActive(null);
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    if (!next || next === id) return;
    setRove(next);
    const node = headers.current.get(next);
    node?.focus();
    play("tick", event.key === "ArrowUp" ? 1.1 : 1.25, node);
    if (rail) reveal(next);
  };

  const reply = (id: string, text: string) => {
    const t = threads.find((x) => x.id === id);
    if (!t || disabled) return;
    seq.current += 1;
    const comment: ReviewComment = {
      id: `${id}-${me}-${t.comments.length + 1}-${seq.current}`,
      author: me,
      at: nowMs,
      text,
    };
    commitThreads(
      threads.map((x) =>
        x.id === id ? { ...x, comments: [...x.comments, comment] } : x,
      ),
    );
    onReply?.(id, comment);
    const named = people.filter(
      (p) => p.id !== me && text.includes(`@${p.name}`),
    );
    for (const p of named) onMention?.(p.id, id);
    say(
      named.length
        ? `Reply added. Mentioned ${named.map((p) => p.name).join(" and ")}.`
        : "Reply added.",
    );
    play("pop", 1, headers.current.get(id));
  };

  const resolveThread = (id: string, to: boolean, el: Element | null) => {
    if (disabled) return;
    commitThreads(
      threads.map((x) =>
        x.id !== id
          ? x
          : to
            ? { ...x, resolved: true, resolvedBy: me, resolvedAt: nowMs }
            : {
                ...x,
                resolved: false,
                resolvedBy: undefined,
                resolvedAt: undefined,
              },
      ),
    );
    onResolve?.(id, to);
    play("pop", to ? 1.12 : 0.85, el);
    const t = threads.find((x) => x.id === id);
    say(
      sentence(
        `${to ? "Resolved" : "Reopened"} thread on “${t?.anchor.quote ?? ""}”`,
      ),
    );
    if (to && activeId === id) setActive(null);
    if (to) headers.current.get(id)?.focus({ preventScroll: true });
    if (to && resolveMode === "tuck" && !showResolved) {
      // It folds where it is first, then leaves the rail.
      setLingering((l) => [...l, id]);
      const timer = window.setTimeout(() => {
        timers.current.delete(timer);
        const header = headers.current.get(id);
        const hadFocus =
          !!header && header.contains(document.activeElement ?? null);
        setLingering((l) => l.filter((x) => x !== id));
        if (hadFocus) {
          const ids = state.current.ids.filter((x) => x !== id);
          const i = state.current.ids.indexOf(id);
          const next = ids[Math.min(i, ids.length - 1)];
          if (next) {
            setRove(next);
            headers.current.get(next)?.focus({ preventScroll: true });
          }
        }
      }, TUCK_MS);
      timers.current.add(timer);
    }
  };

  const onHover = React.useCallback((id: string, on: boolean) => {
    setHover((h) => (on ? id : h === id ? null : h));
  }, []);
  const onFocusIn = React.useCallback((id: string, on: boolean) => {
    setFocusIn((f) => (on ? id : f === id ? null : f));
  }, []);
  const bindHeader = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (!node) return;
      const map = headers.current;
      map.set(id, node);
      return () => {
        if (map.get(id) === node) map.delete(id);
      };
    },
    [],
  );

  /* -------------------------------- render -------------------------------- */

  const card = (t: ReviewThreadData) => (
    <ThreadCard
      key={t.id}
      thread={t}
      people={people}
      me={me}
      now={nowMs}
      d={d}
      resolveMode={resolveMode}
      leaders={leaders}
      rail={rail}
      placed={placed}
      open={activeId === t.id}
      lit={lit === t.id}
      tabStop={tabStop === t.id}
      highlight={highlight}
      motionSafe={motionSafe}
      disabled={disabled}
      placeholder={placeholder}
      anchor={anchors[t.id]}
      geo={geo}
      register={register}
      requestLayout={requestLayout}
      bindHeader={bindHeader}
      onToggle={toggle}
      onClose={close}
      onNav={onNav}
      onHover={onHover}
      onFocusIn={onFocusIn}
      onReply={reply}
      onResolve={resolveThread}
      keepInView={keepInView}
      play={play}
      say={say}
    />
  );

  const markStyle = (t: ReviewThreadData): React.CSSProperties => {
    const on = lit === t.id;
    if (t.resolved && !on) {
      return {
        backgroundColor: "transparent",
        textDecorationLine: "underline",
        textDecorationStyle: "dotted",
        textDecorationColor: `color-mix(in oklab, ${highlight} 70%, transparent)`,
        textUnderlineOffset: 3,
      };
    }
    return {
      backgroundColor: `color-mix(in oklab, ${highlight} ${on ? 36 : 18}%, transparent)`,
      boxShadow: on ? `inset 0 -2px 0 ${highlight}` : "inset 0 0 0 transparent",
    };
  };

  const byBlock = new Map<string, ReviewThreadData[]>();
  const loose: ReviewThreadData[] = [];
  for (const t of visible) {
    if (!placedIds.has(t.id)) {
      loose.push(t);
      continue;
    }
    const list = byBlock.get(t.anchor.block) ?? [];
    list.push(t);
    byBlock.set(t.anchor.block, list);
  }
  const threadById = new Map(threads.map((t) => [t.id, t]));

  const inlineList = (list: ReviewThreadData[], name: string) =>
    list.length ? (
      <ul
        aria-label={name}
        className={cn("relative flex flex-col gap-2 pt-1", d.block)}
      >
        <AnimatePresence initial={false}>{list.map(card)}</AnimatePresence>
      </ul>
    ) : null;

  const body =
    status === "loading" ? (
      <Skeleton mode={mode} />
    ) : status === "error" ? (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 px-6 text-center">
        <CircleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          The review could not be loaded.
        </p>
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
    ) : (
      <div
        className={cn(
          "grid grid-rows-[minmax(0,1fr)]",
          mode === "desktop" && "grid-cols-[13rem_minmax(0,1fr)]",
        )}
      >
        {mode === "desktop" ? (
          <nav
            aria-label="Threads"
            className="[scrollbar-width:thin] overflow-y-auto overscroll-contain border-r border-hairline p-3"
          >
            <p className="mb-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Threads
            </p>
            <ol className="flex flex-col gap-0.5">
              {ordered.map((t) => {
                const who = people.find((p) => p.id === t.comments[0]?.author);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-current={activeId === t.id ? "true" : undefined}
                      onClick={() => {
                        if (tucked(t)) setShowResolved(true);
                        jump(t.id);
                      }}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") onHover(t.id, true);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType === "mouse") onHover(t.id, false);
                      }}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-2 px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed",
                        activeId === t.id && "bg-surface-2",
                        FOCUS_RING_IN,
                      )}
                    >
                      {t.resolved ? (
                        <Check
                          aria-hidden
                          className="mt-0.5 size-3.5 shrink-0 text-success"
                        />
                      ) : (
                        <MessageSquare
                          aria-hidden
                          className="mt-0.5 size-3.5 shrink-0 text-cobalt-bright"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-medium text-foreground">
                          {who?.name ?? "Someone"}
                          <span className="sr-only">
                            {t.resolved ? ", resolved" : ""}
                          </span>
                        </span>
                        <span
                          className="block truncate text-[11px] text-ink-3"
                          title={t.anchor.quote}
                        >
                          “{t.anchor.quote}”
                        </span>
                      </span>
                      <span className="shrink-0 pt-0.5 font-mono text-[10px] text-ink-3 tabular-nums">
                        {t.comments.length}
                        <span className="sr-only"> comments</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}

        <div
          ref={scrollerRef}
          onWheel={() => scrollAnim.current?.stop()}
          onTouchStart={() => scrollAnim.current?.stop()}
          className="relative [scrollbar-width:thin] overflow-x-clip overflow-y-auto overscroll-contain"
        >
          <div
            ref={contentRef}
            className={cn(
              "relative grid items-start gap-x-8 px-4 py-4",
              // Before the first measurement (the server's render) the
              // columns follow the container, so no width shows a squeeze.
              width === null
                ? "grid-cols-1 @min-[37.5rem]:grid-cols-[minmax(0,1fr)_17rem] @min-[65rem]:grid-cols-[minmax(0,38rem)_18rem] @min-[65rem]:justify-center"
                : mode === "phone"
                  ? "grid-cols-1"
                  : mode === "tablet"
                    ? "grid-cols-[minmax(0,1fr)_17rem]"
                    : "grid-cols-[minmax(0,38rem)_18rem] justify-center",
            )}
          >
            <article
              ref={docRef}
              aria-label={doc.title}
              className={cn("min-w-0 text-ink", d.doc)}
            >
              {doc.blocks.map((b) => {
                const segs = segments.get(b.id) ?? [];
                const content = segs.map((s, i) => {
                  const t = s.thread ? threadById.get(s.thread) : undefined;
                  if (!t)
                    return <React.Fragment key={i}>{s.text}</React.Fragment>;
                  const hidden = tucked(t);
                  return (
                    <mark
                      key={i}
                      ref={(node) => {
                        if (!node) return;
                        const map = marks.current;
                        map.set(t.id, node);
                        return () => {
                          if (map.get(t.id) === node) map.delete(t.id);
                        };
                      }}
                      data-review-anchor={t.id}
                      onPointerEnter={(event) => {
                        if (event.pointerType === "mouse" && !hidden)
                          onHover(t.id, true);
                      }}
                      onPointerLeave={(event) => {
                        if (event.pointerType === "mouse") onHover(t.id, false);
                      }}
                      onClick={() => {
                        if (!hidden) openFromMark(t.id);
                      }}
                      className={cn(
                        "rounded-[2px] text-inherit transition-[background-color,box-shadow,text-decoration-color] duration-200",
                        hidden ? "" : "cursor-pointer",
                      )}
                      style={markStyle(t)}
                    >
                      {s.text}
                      <span className="sr-only">
                        {" "}
                        ({t.resolved ? "resolved, " : ""}
                        {plural(t.comments.length, "comment", "comments")})
                      </span>
                    </mark>
                  );
                });
                return (
                  <React.Fragment key={b.id}>
                    {b.kind === "heading" ? (
                      <h3
                        data-review-block=""
                        className={cn(
                          "font-semibold text-foreground first:mt-0",
                          d.heading,
                        )}
                      >
                        {content}
                      </h3>
                    ) : (
                      <p data-review-block="" className={d.block}>
                        {content}
                      </p>
                    )}
                    {mode === "phone"
                      ? inlineList(
                          byBlock.get(b.id) ?? [],
                          `Comments on “${b.text.slice(0, 32)}…”`,
                        )
                      : null}
                  </React.Fragment>
                );
              })}
              {mode === "phone" ? inlineList(loose, "Other comments") : null}
              {mode === "phone" && visible.length === 0 ? (
                <p className="border-t border-hairline pt-3 text-[12px] text-ink-3">
                  No comments on this draft.
                </p>
              ) : null}
            </article>

            {rail ? (
              <motion.ul
                ref={railRef}
                aria-label="Comments"
                className={cn(
                  "relative",
                  placed
                    ? ""
                    : width === null
                      ? "hidden flex-col gap-2 @min-[37.5rem]:flex"
                      : "flex flex-col gap-2",
                )}
                style={placed ? { height: railH } : undefined}
              >
                {visible.length === 0 ? (
                  <li className="rounded-3 border border-dashed border-hairline-strong p-3 text-[12px] text-ink-3">
                    No comments on this draft.
                  </li>
                ) : null}
                <AnimatePresence initial={false}>
                  {visible.map(card)}
                </AnimatePresence>
              </motion.ul>
            ) : null}
          </div>
        </div>
      </div>
    );

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
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-[1_1_11rem]">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            <span className="sr-only">Review of </span>
            {doc.title}
          </h2>
          {doc.meta ? (
            <p className="truncate text-xs text-ink-3" title={doc.meta}>
              {doc.meta}
            </p>
          ) : null}
        </div>
        {status === "ready" ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-card px-2 font-mono text-[11px] text-ink-2 tabular-nums">
              <MessageSquare
                aria-hidden
                className="size-3 text-cobalt-bright"
              />
              {openCount} open
            </span>
            {resolveMode === "tuck" && resolvedCount > 0 ? (
              <button
                type="button"
                aria-pressed={showResolved}
                disabled={disabled}
                onClick={(event) => {
                  setShowResolved((v) => !v);
                  play("tick", showResolved ? 0.9 : 1.2, event.currentTarget);
                }}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 font-mono text-[11px] tabular-nums transition-colors disabled:cursor-not-allowed",
                  showResolved
                    ? "border-hairline-strong bg-surface-2 text-foreground"
                    : "border-hairline bg-card text-ink-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <Check aria-hidden className="size-3 text-success" />
                {resolvedCount} resolved
              </button>
            ) : resolveMode !== "off" && resolvedCount > 0 ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-card px-2 font-mono text-[11px] text-ink-2 tabular-nums">
                <Check aria-hidden className="size-3 text-success" />
                {resolvedCount} resolved
              </span>
            ) : null}
          </div>
        ) : null}
      </header>
      {body}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
