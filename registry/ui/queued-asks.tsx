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
  ArrowUp,
  ChevronDown,
  CircleAlert,
  GripVertical,
  ListPlus,
  Pause,
  Pencil,
  RotateCcw,
  SkipForward,
  Square,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type QueuedAsk = { id: string; text: string };

export type QueuedAsksJobStatus = "running" | "done" | "failed";

/** The run the assistant is on now. Owned by the host. */
export type QueuedAsksJob = {
  /** Reuse the queued ask's id when it starts, so its card flies into the thread. */
  id: string;
  prompt: string;
  status: QueuedAsksJobStatus;
  /** 0 to 1. */
  progress?: number;
  /** What it is doing, in a few words: "Reading 9 of 22 gauge reports". */
  step?: string;
  /** The answer, once done. */
  answer?: string;
  /** Why it failed, once failed. */
  error?: string;
};

export type QueuedAsksTurn = { id: string; prompt: string; answer: string };

export type QueuedAsksCardStyle = "note" | "ticket" | "line";

export type QueuedAsksProps = {
  /** Controlled queue, top first. */
  queue?: QueuedAsk[];
  /** Initial queue when uncontrolled. @default defaultQueuedAsks */
  defaultQueue?: QueuedAsk[];
  /** Fires with the whole queue after any add, move, edit, removal or peel. */
  onQueueChange?: (queue: QueuedAsk[]) => void;
  /** The run in progress, or null when idle. @default defaultQueuedJob */
  job?: QueuedAsksJob | null;
  /** Finished turns, oldest first. @default defaultQueuedThread */
  thread?: QueuedAsksTurn[];
  /** A prompt was queued. */
  onEnqueue?: (item: QueuedAsk) => void;
  /** A card was moved: the new order, and which card went where. */
  onReorder?: (
    ids: string[],
    moved: { id: string; from: number; to: number },
  ) => void;
  /** A queued prompt was edited in place. */
  onEditQueued?: (id: string, text: string) => void;
  /** A queued prompt was removed, or Stop was pressed on the run (its id). */
  onCancel?: (id: string) => void;
  /** The top card peeled off: start it as the new job, with the same id. */
  onAdvance?: (next: QueuedAsk) => void;
  /** Nothing running and nothing queued: the prompt goes straight to the assistant. */
  onSend?: (text: string) => void;
  /** Retry was pressed on a failed run. */
  onRetry?: (jobId: string) => void;
  /** Skip was pressed on a failed run: the queue carries on. */
  onResume?: () => void;
  /** Hold the queue. @default true while the job has failed */
  paused?: boolean;
  /** Cards that stand fanned before the rest tuck into a deck. @default 3 */
  stackDepth?: number;
  /** Paper notes, tickets with a stub, or flat lines. @default "note" */
  cardStyle?: QueuedAsksCardStyle;
  /** Numbers, your bubbles, progress, Queue and Send — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long a finished answer rests before the next card peels off, ms. @default 500 */
  advanceDelay?: number;
  /** The most prompts the queue holds. @default 8 */
  maxQueue?: number;
  /** The session's name. @default "Basin storage review" */
  title?: string;
  /** The assistant's name. @default "Fernworks Model 3" */
  model?: string;
  /** Whose workspace the session is in. @default "Basinworks" */
  workspace?: string;
  /** Placeholder for the field. @default "Ask, or line up the next ask…" */
  placeholder?: string;
  /** The tallest the surface grows, px; past it the thread scrolls. @default 560 */
  height?: number;
  /** Nothing can be typed, queued or moved. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultQueuedThread: QueuedAsksTurn[] = [
  {
    id: "ashford",
    prompt: "Pull the storage levels for the Ashford basin, 2019 to 2024.",
    answer:
      "Ashford averaged 61% full in 2024, down from 74% in 2019. Most of the drop falls in August and September, when abstraction peaks.",
  },
];

export const defaultQueuedJob: QueuedAsksJob = {
  id: "four-basins",
  prompt: "Which of the four basins lost the most storage, and when?",
  status: "running",
  progress: 0.42,
  step: "Reading 9 of 22 gauge reports",
};

export const defaultQueuedAsks: QueuedAsk[] = [
  {
    id: "chart",
    text: "Chart monthly storage for all four basins on one axis.",
  },
  { id: "gaps", text: "Flag any gauge with gaps longer than a week." },
  {
    id: "board",
    text: "Draft two paragraphs for the board on what changed and why.",
  },
  { id: "sources", text: "List the sources you used, with their dates." },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]";

const CARD_H: Record<QueuedAsksCardStyle, number> = {
  note: 44,
  ticket: 44,
  line: 38,
};
const CARD_GAP: Record<QueuedAsksCardStyle, number> = {
  note: 6,
  ticket: 6,
  line: 2,
};
/** Each tucked card shows this much of its edge under the one above. */
const TUCK = 5;

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const clampNum = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
};

/** Narrower than the phone breakpoint (30rem), read from the surface itself. */
function useNarrow(node: HTMLElement | null) {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setNarrow(node.getBoundingClientRect().width < 480),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return narrow;
}

/* ----------------------------------------------------------------------- */
/*                                 A card                                   */
/* ----------------------------------------------------------------------- */

type CardProps = {
  item: QueuedAsk;
  number: number;
  count: number;
  slotY: number;
  scale: number;
  tucked: boolean;
  /** How deep in the deck a tucked card sits: 1, 2, … */
  layer: number;
  z: number;
  /** Added after mount: rises in. Cards there from the start render in place. */
  entering: boolean;
  /** Visible, so it can fly into the thread when it peels. */
  flies: boolean;
  pitch: number;
  stackHeight: number;
  height: number;
  cardStyle: QueuedAsksCardStyle;
  uid: string;
  tabbable: boolean;
  dragging: boolean;
  editing: string | null;
  disabled: boolean;
  motionSafe: boolean;
  onFocusCard: () => void;
  onKey: (event: React.KeyboardEvent<HTMLLIElement>) => void;
  onEdit: () => void;
  onEditChange: (text: string) => void;
  onEditDone: (save: boolean) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragMove: (y: number) => void;
  onDragEnd: (y: number, velocity: number) => number;
  onDragCancel: () => void;
};

function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="relative inline-flex h-4 overflow-hidden leading-4 tabular-nums">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className="block"
          initial={{ y: motionSafe ? 14 : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{
            y: motionSafe ? -14 : 0,
            opacity: 0,
            transition: { duration: durations.fast, ease: easings.exit },
          }}
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function QueueCard({
  item,
  number,
  count,
  slotY,
  scale,
  tucked,
  layer,
  z,
  entering,
  flies,
  pitch,
  stackHeight,
  height,
  cardStyle,
  uid,
  tabbable,
  dragging,
  editing,
  disabled,
  motionSafe,
  onFocusCard,
  onKey,
  onEdit,
  onEditChange,
  onEditDone,
  onRemove,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: CardProps) {
  const y = useMotionValue(slotY);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const landing = React.useRef<number | null>(null);
  const grabbedAt = React.useRef(0);

  // Slots glide; a card just dropped is already springing to its slot with
  // the release velocity, and that spring is left alone.
  React.useEffect(() => {
    if (dragging) return;
    if (landing.current === slotY) {
      landing.current = null;
      return;
    }
    run.current?.stop();
    run.current = animate(
      y,
      slotY,
      motionSafe ? springs.glide : { duration: 0 },
    );
  }, [slotY, dragging, motionSafe, y]);

  React.useEffect(() => () => run.current?.stop(), []);

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || editing !== null || tucked,
    onStart: () => {
      run.current?.stop();
      grabbedAt.current = y.get();
      onDragStart();
    },
    onMove: ({ offset }) => {
      const next = rubberClamp(
        grabbedAt.current + offset.y,
        0,
        Math.max(0, stackHeight - height),
        pitch,
      );
      y.set(Math.round(next * 100) / 100);
      onDragMove(next);
    },
    onEnd: ({ velocity }) => {
      const to = onDragEnd(y.get(), velocity.y);
      const target = to * pitch;
      landing.current = target;
      run.current?.stop();
      run.current = animate(
        y,
        target,
        motionSafe
          ? { ...springs.snap, velocity: velocity.y }
          : { duration: 0 },
      );
    },
    onCancel: () => {
      onDragCancel();
      run.current?.stop();
      run.current = animate(
        y,
        slotY,
        motionSafe ? springs.snap : { duration: 0 },
      );
    },
  });

  const stub =
    cardStyle === "ticket" ? (
      <span
        aria-hidden
        className="relative flex h-full w-9 shrink-0 items-center justify-center border-r border-dashed border-hairline-strong font-mono text-[12px] font-semibold text-(--qa-accent)"
      >
        <span className="absolute -top-1 -right-1 size-2 rounded-full border border-hairline bg-card" />
        <span className="absolute -right-1 -bottom-1 size-2 rounded-full border border-hairline bg-card" />
        <Digit value={number} motionSafe={motionSafe} />
      </span>
    ) : (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center font-mono text-[11px] font-semibold",
          cardStyle === "note"
            ? "size-6 rounded-full bg-(--qa-wash) text-(--qa-accent)"
            : "w-5 text-ink-3",
        )}
      >
        <Digit value={number} motionSafe={motionSafe} />
        {cardStyle === "line" ? "." : null}
      </span>
    );

  return (
    <motion.li
      layoutId={flies ? `${uid}-ask-${item.id}` : undefined}
      data-qasks-card={item.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`Queued ${number} of ${count}: ${item.text}`}
      aria-describedby={`${uid}-card-hint`}
      inert={tucked}
      onFocus={onFocusCard}
      onKeyDown={onKey}
      {...drag}
      initial={entering ? { opacity: 0, scale: motionSafe ? 0.96 : 1 } : false}
      animate={{
        opacity: tucked && layer > 2 ? 0 : 1,
        scale: dragging && motionSafe ? 1.02 : scale,
      }}
      transition={{
        opacity: { duration: durations.base, ease: easings.enter },
        scale: motionSafe ? springs.snap : { duration: 0 },
        layout: motionSafe ? springs.glide : { duration: 0 },
      }}
      className={cn(
        "group/queued-asks absolute inset-x-0 top-0 flex touch-pan-x items-center gap-2.5 text-left select-none",
        cardStyle === "note" &&
          "rounded-3 border border-hairline bg-surface-1 pr-2 pl-2.5 shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent)] after:pointer-events-none after:absolute after:top-0 after:right-0 after:size-3 after:rounded-tr-3 after:bg-[linear-gradient(225deg,var(--card)_50%,color-mix(in_oklab,var(--foreground)_12%,transparent)_50%)]",
        cardStyle === "ticket" &&
          "overflow-hidden rounded-2 border border-hairline bg-surface-1 pr-2",
        cardStyle === "line" &&
          "rounded-2 border-b border-hairline bg-card pr-1.5 pl-1",
        dragging
          ? "cursor-grabbing shadow-[0_10px_24px_color-mix(in_oklab,black_18%,transparent)]"
          : tucked
            ? "pointer-events-none"
            : "cursor-grab",
        FOCUS,
      )}
      style={{ y, height, zIndex: dragging ? 60 : z }}
    >
      {stub}
      {editing !== null ? (
        <input
          autoFocus
          aria-label={`Edit queued ${number}`}
          value={editing}
          onPointerDown={(event) => event.stopPropagation()}
          onFocus={(event) => {
            const n = event.currentTarget.value.length;
            event.currentTarget.setSelectionRange(n, n);
          }}
          onChange={(event) => onEditChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              onEditDone(true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              onEditDone(false);
            }
          }}
          onBlur={() => onEditDone(true)}
          className="h-7 min-w-0 flex-1 rounded-1 border border-(--qa-line) bg-surface-0 px-2 text-[13px] text-foreground outline-none"
        />
      ) : (
        <span
          title={item.text}
          className="min-w-0 flex-1 truncate text-[13px] text-foreground"
        >
          {item.text}
        </span>
      )}
      {editing === null ? (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-focus-within/queued-asks:opacity-100 group-hover/queued-asks:opacity-100 pointer-coarse:opacity-100">
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Edit queued ${number}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onEdit}
            className="inline-flex size-7 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-foreground"
          >
            <Pencil aria-hidden className="size-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Remove queued ${number}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onRemove}
            className="inline-flex size-7 items-center justify-center rounded-1 text-ink-3 hover:bg-surface-2 hover:text-danger"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        </span>
      ) : null}
      <GripVertical
        aria-hidden
        className={cn(
          "size-3.5 shrink-0 text-ink-3",
          editing !== null && "invisible",
        )}
      />
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A composer that keeps taking prompts while the assistant is busy. Each one
 * becomes a numbered card stacked above the field; cards drag into a new
 * order (1:1 under the finger, the cards they pass sliding aside on
 * `springs.glide`, the drop settling on `springs.snap` with the release
 * velocity) or edit in place, and beyond `stackDepth` they tuck into a deck.
 *
 * The signature moment is the peel: when the running answer finishes, the top
 * card lifts off the stack and flies into the thread as the new prompt bubble
 * — a shared layout transition on glide that untilts as it lands — while the
 * cards below shuffle up and their numbers roll to the new order on snap. A
 * failed run pauses the queue until Retry or Skip.
 *
 * The host owns the job and the thread; the queue is controlled or not. The
 * cards are a list with one roving card: Up and Down move, Alt with Up or
 * Down reorders, Delete removes, Enter edits; Up in an empty field edits the
 * last card. On a phone the stack collapses to a count you expand. Under
 * reduced motion cards jump to their slots and nothing flies.
 */
export function QueuedAsks({
  queue: queueProp,
  defaultQueue = defaultQueuedAsks,
  onQueueChange,
  job: jobProp,
  thread = defaultQueuedThread,
  onEnqueue,
  onReorder,
  onEditQueued,
  onCancel,
  onAdvance,
  onSend,
  onRetry,
  onResume,
  paused: pausedProp,
  stackDepth = 3,
  cardStyle = "note",
  accent = "var(--accent-bright)",
  advanceDelay = 500,
  maxQueue = 8,
  title = "Basin storage review",
  model = "Fernworks Model 3",
  workspace = "Basinworks",
  placeholder = "Ask, or line up the next ask…",
  height = 560,
  disabled = false,
  className,
}: QueuedAsksProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const job = jobProp === undefined ? defaultQueuedJob : jobProp;

  /* ------------------------------- queue -------------------------------- */

  const [ownQueue, setOwnQueue] = React.useState(defaultQueue);
  const [atMount] = React.useState(
    () => new Set((queueProp ?? defaultQueue).map((q) => q.id)),
  );
  const [surface, setSurface] = React.useState<HTMLElement | null>(null);
  const narrow = useNarrow(surface);
  const queue = queueProp ?? ownQueue;
  const commitQueue = (next: QueuedAsk[]) => {
    if (queueProp === undefined) setOwnQueue(next);
    onQueueChange?.(next);
  };

  // DOM order is the order cards arrived in, never the queue order: a
  // reorder moves cards with transforms, so no node ever changes places.
  const [arrival, setArrival] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(defaultQueue.map((q, i) => [q.id, i])),
  );
  const missing = queue.filter((q) => arrival[q.id] === undefined);
  if (missing.length) {
    const top = Math.max(-1, ...Object.values(arrival));
    setArrival({
      ...arrival,
      ...Object.fromEntries(missing.map((q, i) => [q.id, top + 1 + i])),
    });
  }

  const paused = pausedProp ?? job?.status === "failed";
  const running = job?.status === "running";
  const busy = running || paused || queue.length > 0;

  const [announcement, setAnnouncement] = React.useState("");
  const [peeled, setPeeled] = React.useState<string | null>(null);
  // Only the card about to peel and the bubble it becomes share a layout id,
  // and only for the flight: anything else carrying one would lag behind its
  // neighbours whenever the thread or the stack reflows.
  const armed = job?.status === "done" && !paused;
  React.useEffect(() => {
    if (!peeled) return;
    const t = window.setTimeout(() => setPeeled(null), 900);
    return () => window.clearTimeout(t);
  }, [peeled]);

  /* ------------------------------ advance ------------------------------- */

  const advance = () => {
    const next = queue[0];
    if (!next) return;
    commitQueue(queue.slice(1));
    setPeeled(next.id);
    onAdvance?.(next);
    setAnnouncement(`Now running: ${next.text}`);
  };
  const advanceRef = React.useRef(advance);
  React.useEffect(() => {
    advanceRef.current = advance;
  });

  const advancedFor = React.useRef<string | null>(null);
  const jobId = job?.id ?? null;
  const jobDone = job?.status === "done";
  const queued = queue.length;
  React.useEffect(() => {
    if (!jobDone || paused || queued === 0 || disabled || !jobId) return;
    if (advancedFor.current === jobId) return;
    const t = window.setTimeout(
      () => {
        advancedFor.current = jobId;
        advanceRef.current();
      },
      Math.max(0, advanceDelay),
    );
    return () => window.clearTimeout(t);
  }, [jobDone, jobId, paused, queued, disabled, advanceDelay]);

  // The answer and the failure are announced once, when they land.
  const jobKey = job ? `${job.id}:${job.status}` : "none";
  const [seenJob, setSeenJob] = React.useState(jobKey);
  if (seenJob !== jobKey) {
    setSeenJob(jobKey);
    if (job?.status === "done")
      setAnnouncement(
        `Answer ready${queue.length ? `. ${plural(queue.length, "ask")} still queued` : ""}.`,
      );
    else if (job?.status === "failed")
      setAnnouncement(
        `The run failed${job.error ? `: ${job.error}` : ""}. The queue is paused.`,
      );
  }

  /* ------------------------------- stack -------------------------------- */

  const [fanned, setFanned] = React.useState(false);
  const [phoneOpen, setPhoneOpen] = React.useState(false);
  const [drag, setDrag] = React.useState<{
    id: string;
    from: number;
    over: number;
  } | null>(null);
  const [editing, setEditing] = React.useState<{
    id: string;
    text: string;
  } | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const ch = CARD_H[cardStyle] ?? CARD_H.note;
  const gap = CARD_GAP[cardStyle] ?? CARD_GAP.note;
  const pitch = ch + gap;
  const depth = fanned
    ? queue.length
    : clampNum(Math.round(stackDepth), 1, Math.max(1, queue.length));
  const shownCount = Math.min(queue.length, depth);
  const tuckedCount = queue.length - shownCount;
  const stackHeight =
    queue.length === 0
      ? 0
      : shownCount * pitch - gap + Math.min(2, tuckedCount) * TUCK;

  // While dragging, the others make room where the card would land.
  const order = drag
    ? move(
        queue.map((q) => q.id),
        drag.from,
        drag.over,
      )
    : queue.map((q) => q.id);

  const listRef = React.useRef<HTMLOListElement | null>(null);
  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const focusCard = (id: string | undefined) => {
    if (!id) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-qasks-card="${CSS.escape(id)}"]`,
    );
    node?.focus({ preventScroll: true });
  };
  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    if (id === "field") fieldRef.current?.focus();
    else focusCard(id);
  });

  const reorder = (from: number, to: number) => {
    const item = queue[from];
    if (!item || from === to) return;
    const next = move(queue, from, to);
    commitQueue(next);
    onReorder?.(
      next.map((q) => q.id),
      { id: item.id, from, to },
    );
    setAnnouncement(`Moved to ${to + 1} of ${next.length}.`);
  };

  const remove = (id: string) => {
    const at = queue.findIndex((q) => q.id === id);
    if (at < 0) return;
    const next = queue.filter((q) => q.id !== id);
    commitQueue(next);
    onCancel?.(id);
    setAnnouncement(
      `Removed. ${next.length ? `${plural(next.length, "ask")} queued.` : "The queue is empty."}`,
    );
    pendingFocus.current = next[Math.min(at, next.length - 1)]?.id ?? "field";
  };

  const finishEdit = (save: boolean) => {
    if (!editing) return;
    const item = queue.find((q) => q.id === editing.id);
    const text = editing.text.trim();
    if (save && item && text && text !== item.text) {
      commitQueue(queue.map((q) => (q.id === item.id ? { ...q, text } : q)));
      onEditQueued?.(item.id, text);
      setAnnouncement("Queued ask updated.");
    }
    pendingFocus.current = editing.id;
    setEditing(null);
  };

  const startEdit = (id: string) => {
    if (disabled) return;
    const item = queue.find((q) => q.id === id);
    if (!item) return;
    const at = queue.indexOf(item);
    if (at >= depth) setFanned(true);
    setPhoneOpen(true);
    setEditing({ id, text: item.text });
  };

  const onCardKey = (
    event: React.KeyboardEvent<HTMLLIElement>,
    item: QueuedAsk,
  ) => {
    if (editing) return;
    const at = queue.findIndex((q) => q.id === item.id);
    const visible = queue.slice(0, depth);
    const go = (i: number) => {
      event.preventDefault();
      const target = queue[clampNum(i, 0, queue.length - 1)];
      if (!target) return;
      if (queue.indexOf(target) >= depth) setFanned(true);
      pendingFocus.current = target.id;
      focusCard(target.id);
    };
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      if (disabled) return;
      const to = clampNum(
        at + (event.key === "ArrowUp" ? -1 : 1),
        0,
        queue.length - 1,
      );
      if (to >= depth) setFanned(true);
      reorder(at, to);
      pendingFocus.current = item.id;
      return;
    }
    switch (event.key) {
      case "ArrowUp":
        return go(at - 1);
      case "ArrowDown":
        if (at === visible.length - 1 && !fanned && tuckedCount === 0) {
          event.preventDefault();
          fieldRef.current?.focus();
          return;
        }
        return go(at + 1);
      case "Home":
        return go(0);
      case "End":
        return go(queue.length - 1);
      case "Enter":
      case "F2":
        event.preventDefault();
        startEdit(item.id);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        if (!disabled) remove(item.id);
        return;
      case "Escape":
        event.preventDefault();
        fieldRef.current?.focus();
        return;
      default:
        return;
    }
  };

  /* ------------------------------ composer ------------------------------ */

  const [text, setText] = React.useState("");
  const seq = React.useRef(0);
  const full = queue.length >= maxQueue;

  const submit = () => {
    if (disabled) return;
    const value = text.trim();
    if (!value) return;
    if (!busy) {
      onSend?.(value);
      setText("");
      setAnnouncement("Sent.");
      return;
    }
    if (full) {
      setAnnouncement(
        `The queue holds ${maxQueue}. Remove one to add another.`,
      );
      return;
    }
    seq.current += 1;
    const item = { id: `${uid}-q${seq.current}`, text: value };
    commitQueue([...queue, item]);
    onEnqueue?.(item);
    setText("");
    setAnnouncement(`Queued as ${queue.length + 1}: ${value}`);
  };

  const onFieldKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    } else if (event.key === "ArrowUp" && !text && queue.length > 0) {
      event.preventDefault();
      const last = queue[queue.length - 1];
      if (last) startEdit(last.id);
    }
  };

  /* ------------------------------- layout ------------------------------- */

  const vars = {
    "--qa-accent": accent,
    "--qa-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    "--qa-line": `color-mix(in oklab, ${accent} 45%, transparent)`,
    "--qa-solid": `oklch(from ${accent} 0.55 c h)`,
    "--qa-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const statusPill = paused
    ? {
        label: "Paused",
        cls: "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] text-warn",
      }
    : running
      ? { label: "Running", cls: "border-(--qa-line) text-(--qa-accent)" }
      : job?.status === "done" && queue.length
        ? { label: "Up next", cls: "border-(--qa-line) text-(--qa-accent)" }
        : { label: "Idle", cls: "border-hairline text-ink-3" };

  const pct = Math.round(clampNum(job?.progress ?? 0, 0, 1) * 100);
  const tabbableId =
    activeId && queue.slice(0, depth).some((q) => q.id === activeId)
      ? activeId
      : queue[0]?.id;

  const bubble = (id: string, prompt: string, fly: boolean) => (
    <motion.p
      layoutId={fly ? `${uid}-ask-${id}` : undefined}
      initial={fly && motionSafe ? { rotate: -2.5 } : false}
      animate={{ rotate: 0 }}
      transition={{
        layout: motionSafe ? springs.glide : { duration: 0 },
        rotate: motionSafe ? springs.glide : { duration: 0 },
      }}
      className="ml-auto w-fit max-w-[85%] rounded-3 rounded-br-1 bg-(--qa-wash) px-3 py-2 text-[13px] leading-[1.45] text-foreground"
    >
      {prompt}
    </motion.p>
  );

  const jobItem = (job: QueuedAsksJob) => (
    <li key={job.id} className="flex flex-col gap-2">
      {bubble(job.id, job.prompt, peeled === job.id)}
      {job.status === "done" ? (
        <motion.p
          className="max-w-[92%] text-[13px] leading-[1.5] text-ink-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.base }}
        >
          {job.answer ?? "Done."}
        </motion.p>
      ) : job.status === "failed" ? (
        <p className="flex max-w-[92%] items-start gap-1.5 text-[13px] leading-[1.45] text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {job.error ?? "The run stopped before it finished."}
        </p>
      ) : (
        <div className="flex max-w-[92%] flex-col gap-1.5 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-(--qa-accent) motion-safe:animate-pulse"
              />
              <span className="truncate">{job.step ?? "Working…"}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                onCancel?.(job.id);
                setAnnouncement("Stopping the run.");
              }}
              className={cn(
                BUTTON,
                FOCUS,
                "h-7 px-2 text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Square aria-hidden className="size-3 fill-current" />
              Stop
            </button>
          </div>
          <div
            role="progressbar"
            aria-label="Answer progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%${job.step ? `, ${job.step}` : ""}`}
            className="relative h-1 overflow-hidden rounded-full bg-hairline-strong"
          >
            <motion.span
              className="absolute inset-0 rounded-full bg-(--qa-accent)"
              style={{ originX: 0 }}
              initial={false}
              animate={{ scaleX: pct / 100 }}
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            />
          </div>
        </div>
      )}
    </li>
  );

  const threadList = (
    <ol
      role="list"
      aria-label="Conversation"
      className="flex flex-col gap-4 px-4 py-3"
    >
      {[
        ...thread.map((turn) => (
          <li key={turn.id} className="flex flex-col gap-2">
            {bubble(turn.id, turn.prompt, false)}
            <p className="max-w-[92%] text-[13px] leading-[1.5] text-ink-2">
              {turn.answer}
            </p>
          </li>
        )),
        job && !thread.some((t) => t.id === job.id) ? jobItem(job) : null,
      ]}
    </ol>
  );

  const pausedStrip =
    paused && job ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_9%,transparent)] px-2.5 py-1.5">
        <Pause aria-hidden className="size-3.5 shrink-0 text-warn" />
        <p className="min-w-0 flex-1 text-[12px] leading-4 text-foreground">
          {queue.length
            ? `The last run failed, so ${plural(queue.length, "ask")} wait${queue.length === 1 ? "s" : ""}.`
            : "The last run failed."}
        </p>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              onRetry?.(job.id);
              setAnnouncement("Retrying the run.");
            }}
            className={cn(
              BUTTON,
              FOCUS,
              "h-6 bg-(--qa-solid) px-2 text-[11.5px] text-(--qa-on) hover:bg-[color-mix(in_oklab,var(--qa-solid)_88%,black)]",
            )}
          >
            <RotateCcw aria-hidden className="size-3" />
            Retry
          </button>
          {queue.length ? (
            <button
              type="button"
              onClick={() => {
                onResume?.();
                advance();
              }}
              className={cn(
                BUTTON,
                FOCUS,
                "h-6 px-2 text-[11.5px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <SkipForward aria-hidden className="size-3" />
              Skip
            </button>
          ) : null}
        </span>
      </div>
    ) : null;

  const stack = (
    <motion.div
      className={cn(
        "relative",
        !phoneOpen && "hidden @min-[30rem]/queued-asks:block",
      )}
      initial={false}
      animate={{ height: stackHeight }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <ol
        ref={listRef}
        role="list"
        aria-label="Queued asks"
        className="absolute inset-0"
      >
        {[...queue]
          .sort((a, b) => (arrival[a.id] ?? 0) - (arrival[b.id] ?? 0))
          .map((item) => {
            const at = order.indexOf(item.id);
            const tucked = at >= depth;
            const layer = tucked ? at - depth + 1 : 0;
            const slotY = tucked
              ? (depth - 1) * pitch + Math.min(2, layer) * TUCK
              : at * pitch;
            return (
              <QueueCard
                key={item.id}
                item={item}
                number={at + 1}
                count={queue.length}
                slotY={slotY}
                scale={
                  tucked
                    ? Number((1 - Math.min(2, layer) * 0.035).toFixed(3))
                    : 1
                }
                tucked={tucked}
                layer={layer}
                z={tucked ? 40 - layer : 45}
                entering={!atMount.has(item.id)}
                flies={at === 0 && armed && !tucked && (!narrow || phoneOpen)}
                pitch={pitch}
                stackHeight={stackHeight}
                height={ch}
                cardStyle={cardStyle}
                uid={uid}
                tabbable={tabbableId === item.id}
                dragging={drag?.id === item.id}
                editing={editing?.id === item.id ? editing.text : null}
                disabled={disabled}
                motionSafe={motionSafe}
                onFocusCard={() => setActiveId(item.id)}
                onKey={(event) => onCardKey(event, item)}
                onEdit={() => startEdit(item.id)}
                onEditChange={(t) =>
                  setEditing((e) => (e ? { ...e, text: t } : e))
                }
                onEditDone={finishEdit}
                onRemove={() => remove(item.id)}
                onDragStart={() => {
                  const from = queue.findIndex((q) => q.id === item.id);
                  setDrag({ id: item.id, from, over: from });
                }}
                onDragMove={(y) => {
                  const over = clampNum(
                    Math.round(y / pitch),
                    0,
                    Math.min(depth, queue.length) - 1,
                  );
                  setDrag((d) =>
                    d && d.id === item.id && d.over !== over
                      ? { ...d, over }
                      : d,
                  );
                }}
                onDragEnd={(y, vy) => {
                  const from = queue.findIndex((q) => q.id === item.id);
                  // A flick commits a little way on in the direction it was
                  // heading — never more than half a slot, so a slow drop
                  // lands where the card was let go.
                  const lead = clampNum(vy * 0.03, -pitch / 2, pitch / 2);
                  const to = clampNum(
                    Math.round((y + lead) / pitch),
                    0,
                    Math.min(depth, queue.length) - 1,
                  );
                  setDrag(null);
                  reorder(from, to);
                  return to;
                }}
                onDragCancel={() => setDrag(null)}
              />
            );
          })}
      </ol>
    </motion.div>
  );

  return (
    <section
      ref={setSurface}
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container/queued-asks relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ ...vars, maxHeight: height }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2
            id={`${uid}-title`}
            className="truncate text-[14px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <p className="truncate font-mono text-[10.5px] leading-4 text-ink-3">
            {`${workspace} · ${model}`}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 font-mono text-[10.5px] tracking-[0.06em] uppercase",
            statusPill.cls,
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {statusPill.label}
        </span>
      </header>

      <motion.div
        layoutScroll
        className="flex flex-1 [scrollbar-width:thin] flex-col-reverse overflow-y-auto overscroll-contain"
      >
        {threadList}
      </motion.div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-hairline px-4 pt-2.5 pb-3">
        {pausedStrip}
        {queue.length ? (
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {`Up next · ${queue.length}`}
            </p>
            <span className="flex items-center gap-1">
              {tuckedCount > 0 || fanned ? (
                <button
                  type="button"
                  aria-expanded={fanned}
                  onClick={() => setFanned((f) => !f)}
                  className={cn(
                    BUTTON,
                    FOCUS,
                    "hidden h-6 px-2 text-[11px] text-ink-2 hover:bg-surface-2 hover:text-foreground @min-[30rem]/queued-asks:inline-flex",
                  )}
                >
                  {fanned ? "Stack them" : `+${tuckedCount} more`}
                </button>
              ) : null}
              <button
                type="button"
                aria-expanded={phoneOpen}
                onClick={() => setPhoneOpen((o) => !o)}
                className={cn(
                  BUTTON,
                  FOCUS,
                  "h-6 border border-hairline px-2 text-[11px] text-foreground hover:bg-surface-2 @min-[30rem]/queued-asks:hidden",
                )}
              >
                {phoneOpen ? "Hide" : `${queue.length} queued`}
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-3 transition-transform",
                    phoneOpen && "rotate-180",
                  )}
                />
              </button>
            </span>
          </div>
        ) : null}
        {queue.length ? stack : null}

        <div
          className={cn(
            "flex items-end gap-2 rounded-3 border border-input bg-surface-0 p-1.5 pl-3 transition-colors focus-within:border-(--qa-line)",
            // The ring is drawn on the composer, around the text field.
            "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
          )}
        >
          <div className="grid min-w-0 flex-1">
            <span
              aria-hidden
              className="invisible max-h-[84px] overflow-hidden py-1 text-[13.5px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
            >
              {`${text} `}
            </span>
            <textarea
              ref={fieldRef}
              aria-label={busy ? "Ask, or queue the next ask" : "Ask"}
              aria-describedby={`${uid}-field-hint`}
              rows={1}
              value={text}
              readOnly={disabled}
              placeholder={placeholder}
              onChange={(event) => setText(event.currentTarget.value)}
              onKeyDown={onFieldKey}
              className="block h-full w-full resize-none overflow-y-auto bg-transparent py-1 text-[13.5px] leading-5 text-foreground outline-none [grid-area:1/1] placeholder:text-ink-3"
            />
          </div>
          <button
            type="button"
            onClick={submit}
            aria-disabled={
              disabled || !text.trim() || (busy && full) || undefined
            }
            className={cn(
              BUTTON,
              FOCUS,
              "h-8 bg-(--qa-solid) px-3 text-(--qa-on) hover:bg-[color-mix(in_oklab,var(--qa-solid)_88%,black)]",
              (disabled || !text.trim() || (busy && full)) && "opacity-55",
            )}
          >
            {busy ? (
              <ListPlus aria-hidden className="size-3.5" />
            ) : (
              <ArrowUp aria-hidden className="size-3.5" />
            )}
            {busy ? "Queue" : "Send"}
          </button>
        </div>
        <p id={`${uid}-field-hint`} className="sr-only">
          Enter queues while the assistant is busy. Up in an empty field edits
          the last queued ask.
        </p>
        {busy && full ? (
          <p className="text-[11.5px] leading-4 text-warn">
            {`The queue holds ${maxQueue}. Remove one to add another.`}
          </p>
        ) : null}
      </div>

      <p id={`${uid}-card-hint`} className="sr-only">
        Alt with Up or Down moves it, Enter edits, Delete removes.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
