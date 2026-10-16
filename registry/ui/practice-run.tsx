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
  Check,
  ChevronDown,
  RotateCcw,
  Send,
  SkipForward,
  Tag,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PracticeLane = { id: string; title: string };
export type PracticeCard = {
  id: string;
  title: string;
  /** One short line under the title. */
  detail?: string;
  /** The lane it starts in. */
  lane: string;
};
export type PracticePerson = { id: string; name: string; role?: string };
export type PracticeLabelTone =
  "danger" | "warn" | "success" | "accent" | "neutral";
export type PracticeLabel = {
  id: string;
  name: string;
  tone: PracticeLabelTone;
};

type LessonBase = {
  /** Unique; the key into `progress`. */
  id: string;
  /** "Move a job to Done": the step rail's and the header's name for it. */
  title: string;
  /** Replaces any of the coach's lines for this lesson, keyed by event (start, grab, over, drop-wrong, other, cancel, typing, at, picked, wrong, sent-without, sent-wrong, open, remove, close, done). */
  coach?: Partial<Record<string, string>>;
};

export type PracticeMoveLesson = LessonBase & {
  kind: "move";
  /** The board's lanes, left to right. */
  lanes: PracticeLane[];
  /** Every card on the board; all of them can be moved. */
  cards: PracticeCard[];
  /** The card the task is about. */
  card: string;
  /** The lane it has to reach. */
  to: string;
};

export type PracticeMentionLesson = LessonBase & {
  kind: "mention";
  /** Who `@` can call in. */
  people: PracticePerson[];
  /** The person the task is to mention. */
  person: string;
  /** The message already in the thread, which the comment answers. */
  note: { author: string; text: string };
};

export type PracticeLabelLesson = LessonBase & {
  kind: "label";
  /** The job being labelled. */
  job: { title: string; detail: string };
  /** The labels in the menu. */
  labels: PracticeLabel[];
  /** The label the task is to add. */
  label: string;
};

export type PracticeLesson =
  PracticeMoveLesson | PracticeMentionLesson | PracticeLabelLesson;

export type PracticeProgress = Record<string, "done" | "skipped">;
export type PracticeCoachStyle = "bubble" | "ticker" | "margin";
export type PracticeStampStyle = "seal" | "tick" | "ink";
export type PracticeStatus = "ready" | "loading";

export type PracticeRunProps = {
  /** The lessons, in order: each a small real task in a sandboxed copy of the interface. @default defaultPracticeLessons */
  lessons?: PracticeLesson[];
  /** Controlled: each lesson's state. The run opens on the first lesson that is neither done nor skipped. */
  progress?: PracticeProgress;
  /** Initial progress when uncontrolled. @default {} */
  defaultProgress?: PracticeProgress;
  /** Fires from the finish, skip or restart that changed it, with the whole progress. */
  onProgressChange?: (progress: PracticeProgress) => void;
  /** A lesson's task was done. */
  onComplete?: (lesson: PracticeLesson) => void;
  /** A lesson was skipped. */
  onSkip?: (lesson: PracticeLesson) => void;
  /** "Start working" was pressed after the last lesson. */
  onFinish?: (progress: PracticeProgress) => void;
  /** "Practice again" was pressed; progress is cleared. */
  onRestart?: () => void;
  /** The coach's name, on its avatar and in the ticker. @default "Wren" */
  coach?: string;
  /** How the coach speaks: an avatar and a bubble, a single ticker line, or a note in the margin. Under 30rem it is always a caption. @default "bubble" */
  coachStyle?: PracticeCoachStyle;
  /** The stamp a finished task gets: a round seal, a drawn tick, or a rubber-stamped DONE. @default "seal" */
  stampStyle?: PracticeStampStyle;
  /** The stamp's ink, the lit lane, the step rail and the mention token. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long the stamp rests before the next lesson slides in, ms. @default 700 */
  stampHold?: number;
  /** The product being practised, in the copy. @default "Fieldline" */
  workspace?: string;
  /** Whether the lessons are ready; loading draws a still sandbox. @default "ready" */
  status?: PracticeStatus;
  /** The tallest the run grows before its body scrolls, px. @default 560 */
  maxHeight?: number;
  /** Nothing can be done or skipped. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Fieldline in three moves: a board, a site note and a label. */
export const defaultPracticeLessons: PracticeLesson[] = [
  {
    id: "move",
    kind: "move",
    title: "Move a job to Done",
    lanes: [
      { id: "todo", title: "To do" },
      { id: "doing", title: "Doing" },
      { id: "done", title: "Done" },
    ],
    cards: [
      {
        id: "hedge",
        title: "Hedge trim",
        detail: "Pier 9 offices",
        lane: "todo",
      },
      {
        id: "gutter",
        title: "Gutter clear",
        detail: "Coldbrook Row",
        lane: "todo",
      },
      {
        id: "valve",
        title: "Replace valve",
        detail: "Dock 4 · 09:30",
        lane: "doing",
      },
      {
        id: "boiler",
        title: "Boiler service",
        detail: "Basin Yard",
        lane: "done",
      },
    ],
    card: "valve",
    to: "done",
  },
  {
    id: "mention",
    kind: "mention",
    title: "Mention a teammate",
    people: [
      { id: "mara", name: "Mara Lind", role: "Dock lead" },
      { id: "tomas", name: "Tomas Ferrer", role: "Crane operator" },
      { id: "ines", name: "Ines Okafor", role: "Logistics" },
      { id: "kenji", name: "Kenji Arai", role: "Safety officer" },
    ],
    person: "mara",
    note: {
      author: "Kenji Arai",
      text: "Valve parts for Dock 4 are in the store room.",
    },
  },
  {
    id: "label",
    kind: "label",
    title: "Label a job",
    job: {
      title: "Pier 9 lighting",
      detail: "Three lamps out on the east walkway",
    },
    labels: [
      { id: "urgent", name: "Urgent", tone: "danger" },
      { id: "parts", name: "Parts", tone: "warn" },
      { id: "outdoor", name: "Outdoor", tone: "success" },
      { id: "customer", name: "Customer", tone: "accent" },
    ],
    label: "urgent",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const EMPTY_PROGRESS: PracticeProgress = {};
const FINALE = "\u0000finale";

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r1 = (v: number) => Math.round(v * 10) / 10;

const TONE: Record<
  PracticeLabelTone,
  { text: string; pigment: string; word: string }
> = {
  danger: {
    text: "text-danger",
    pigment: "oklch(from var(--danger) 0.66 0.19 h)",
    word: "red",
  },
  warn: {
    text: "text-warn",
    pigment: "oklch(from var(--warn) 0.8 0.13 h)",
    word: "amber",
  },
  success: {
    text: "text-success",
    pigment: "oklch(from var(--success) 0.72 0.14 h)",
    word: "green",
  },
  accent: {
    text: "text-cobalt-bright",
    pigment: "oklch(from var(--accent-bright) 0.64 0.17 h)",
    word: "blue",
  },
  neutral: {
    text: "text-ink-2",
    pigment: "oklch(from var(--ink-3) 0.62 0.02 h)",
    word: "grey",
  },
};

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

type Vars = Record<string, string>;
type React_ = (event: string, vars?: Vars) => void;

/** The coach's own words, unless the lesson brings its own for that moment. */
function coachLine(lesson: PracticeLesson, event: string, v: Vars): string {
  const own = lesson.coach?.[event];
  if (own) return own;
  if (lesson.kind === "move") {
    const card = lesson.cards.find((c) => c.id === lesson.card)?.title ?? "it";
    const to = lesson.lanes.find((l) => l.id === lesson.to)?.title ?? "the end";
    switch (event) {
      case "grab-pointer":
        return `Now drag it to ${to}.`;
      case "grab-key":
        return `Picked up. Arrow keys carry it to ${to}; Space puts it down.`;
      case "over-right":
        return `${to}. Let go here.`;
      case "over":
      case "drop-wrong":
        return `That's ${v.lane}. ${to} is ${v.far} further.`;
      case "other":
        return `“${v.moved}” can stay there. The one to move is “${card}”.`;
      case "cancel":
        return "Put back where it was. Pick it up again when you're ready.";
      case "tap":
        return `Drag “${card}” to ${to}, or press Space on it.`;
      case "done":
        return `That's it: “${card}” is in ${to}.`;
      default:
        return `Move “${card}” to ${to}. Drag it, or press Space to pick it up.`;
    }
  }
  if (lesson.kind === "mention") {
    const person = lesson.people.find((p) => p.id === lesson.person);
    const name = person?.name ?? "them";
    const first = firstName(name);
    switch (event) {
      case "typing":
        return `Start with @ so ${first} gets told.`;
      case "at":
        return `Good. Now pick ${name}.`;
      case "wrong":
        return `That's ${v.picked}. ${first} is the one on site today.`;
      case "picked":
        return "Now send it. Enter works too.";
      case "sent-without":
        return `Sent, but nobody was told. Start with @ to call ${first} in.`;
      case "sent-wrong":
        return `Sent to ${v.picked}. Try once more with ${first}.`;
      case "done":
        return `${first} will see it. That's a mention.`;
      default:
        return `Ask ${first} to check the parts. Type @ to call someone in.`;
    }
  }
  const label = lesson.labels.find((l) => l.id === lesson.label);
  const name = label?.name ?? "it";
  switch (event) {
    case "open":
      return `Pick ${name}.`;
    case "wrong":
      return `That's ${v.picked}. ${name} is the ${label ? TONE[label.tone].word : ""} one.`;
    case "remove":
      return `Taken off. ${name} is still the one to add.`;
    case "close":
      return "The labels live under Labels whenever you need them.";
    case "done":
      return `Marked ${name}. Everyone on the job sees it now.`;
    default:
      return `Mark “${lesson.job.title}” ${name}. The labels live under Labels.`;
  }
}

/* ----------------------------------------------------------------------- */
/*                               Lesson: move                               */
/* ----------------------------------------------------------------------- */

type Landing = {
  id: string;
  left: number;
  top: number;
  vx: number;
  vy: number;
};

function MoveCard({
  card,
  target,
  carried,
  disabled,
  motionSafe,
  pigment,
  hintId,
  takeLanding,
  bind,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTap,
  onKeyDown,
}: {
  card: PracticeCard;
  target: boolean;
  carried: boolean;
  disabled: boolean;
  motionSafe: boolean;
  pigment: string;
  hintId: string;
  takeLanding: (id: string) => Landing | null;
  bind: (id: string, node: HTMLButtonElement | null) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (
    id: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) => boolean;
  onTap: (id: string) => void;
  onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => void;
}) {
  const [node, setNode] = React.useState<HTMLButtonElement | null>(null);
  // One stable ref for the card's whole life: motion binds it once.
  const setRef = React.useCallback(
    (n: HTMLButtonElement | null) => {
      setNode(n);
      bind(card.id, n);
    },
    [bind, card.id],
  );
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const [lifted, setLifted] = React.useState(false);
  const velocity = React.useRef({ x: 0, y: 0 });
  const settling = React.useRef<AnimationPlaybackControls[]>([]);

  const settle = React.useCallback(
    (vx = 0, vy = 0) => {
      for (const s of settling.current) s.stop();
      if (!motionSafe) {
        x.jump(0);
        y.jump(0);
        scale.jump(1);
        settling.current = [];
        return;
      }
      settling.current = [
        animate(x.get(), 0, {
          ...springs.glide,
          velocity: vx,
          onUpdate: (v) => x.set(r1(v)),
        }),
        animate(y.get(), 0, {
          ...springs.glide,
          velocity: vy,
          onUpdate: (v) => y.set(r1(v)),
        }),
        animate(scale.get(), 1, {
          ...springs.flick,
          onUpdate: (v) => scale.set(Number(v.toFixed(3))),
        }),
      ];
    },
    [motionSafe, x, y, scale],
  );

  // A card that has just changed lanes is born where it was seen, then glides
  // into its new slot with whatever speed the hand gave it.
  React.useLayoutEffect(() => {
    if (!node) return;
    const landing = takeLanding(card.id);
    if (!landing || !motionSafe) return;
    const b = node.getBoundingClientRect();
    x.jump(r1(landing.left - b.left));
    y.jump(r1(landing.top - b.top));
    velocity.current = { x: landing.vx, y: landing.vy };
  }, [node, card.id, motionSafe, takeLanding, x, y]);

  React.useEffect(() => {
    if (!node) return;
    if (x.get() !== 0 || y.get() !== 0) {
      settle(velocity.current.x, velocity.current.y);
      velocity.current = { x: 0, y: 0 };
    }
    const running = settling;
    return () => {
      for (const s of running.current) s.stop();
    };
  }, [node, settle, x, y]);

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      for (const s of settling.current) s.stop();
      setLifted(true);
      if (motionSafe) scale.set(1.03);
      onDragStart(card.id);
    },
    onMove: ({ offset, point }) => {
      x.set(r1(offset.x));
      y.set(r1(offset.y));
      onDragMove(card.id, point.x, point.y);
    },
    onEnd: ({ point, velocity: v }) => {
      setLifted(false);
      const moved = onDragEnd(card.id, point.x, point.y, v.x, v.y);
      if (!moved) settle(v.x, v.y);
    },
    onCancel: () => {
      setLifted(false);
      onDragEnd(card.id, Number.NaN, Number.NaN, 0, 0);
      settle();
    },
    onTap: () => onTap(card.id),
  });

  return (
    <motion.button
      ref={setRef}
      type="button"
      data-practice-card={card.id}
      aria-pressed={carried}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      {...drag}
      onKeyDown={(event) => onKeyDown(event, card.id)}
      style={{
        x,
        y,
        scale,
        zIndex: lifted || carried ? 20 : 1,
        ...(carried || target
          ? {
              borderColor: carried
                ? pigment
                : `color-mix(in oklab, ${pigment} 45%, transparent)`,
            }
          : {}),
      }}
      className={cn(
        "relative flex max-w-full min-w-0 touch-none flex-col items-start rounded-2 border border-hairline bg-card px-2.5 py-2 text-left select-none @min-[30rem]/practice-run:w-full",
        lifted || carried
          ? "cursor-grabbing shadow-[0_10px_24px_color-mix(in_oklab,black_20%,transparent)]"
          : "cursor-grab hover:border-hairline-strong",
        FOCUS,
      )}
    >
      <span
        title={card.title}
        className="max-w-full truncate text-[12px] leading-4 font-medium text-foreground @min-[30rem]/practice-run:w-full @min-[30rem]/practice-run:text-[13px] @min-[30rem]/practice-run:leading-5"
      >
        {card.title}
      </span>
      {card.detail ? (
        <span className="max-w-full truncate text-[11px] leading-4 text-ink-3 @min-[30rem]/practice-run:w-full">
          {card.detail}
        </span>
      ) : null}
    </motion.button>
  );
}

function MoveLesson({
  lesson,
  motionSafe,
  pigment,
  disabled,
  autoFocus,
  onReact,
  onDone,
}: {
  lesson: PracticeMoveLesson;
  motionSafe: boolean;
  pigment: string;
  disabled: boolean;
  autoFocus: boolean;
  onReact: React_;
  onDone: () => void;
}) {
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [where, setWhere] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(lesson.cards.map((c) => [c.id, c.lane])),
  );
  const [carried, setCarried] = React.useState<{
    id: string;
    from: string;
  } | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const laneNodes = React.useRef(new Map<string, HTMLElement>());
  const cardNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const landing = React.useRef<Landing | null>(null);
  const focusAsk = React.useRef<string | null>(autoFocus ? lesson.card : null);
  const finished = React.useRef(false);
  const [solved, setSolved] = React.useState(false);
  const lastOver = React.useRef<string | null>(null);

  const laneOf = (id: string) => lesson.lanes.find((l) => l.id === id);
  const indexOf = (id: string) => lesson.lanes.findIndex((l) => l.id === id);
  const far = (lane: string) => {
    const d = Math.abs(indexOf(lesson.to) - indexOf(lane));
    return d === 1 ? "one lane" : `${d} lanes`;
  };

  const takeLanding = React.useCallback((id: string) => {
    const l = landing.current;
    if (!l || l.id !== id) return null;
    landing.current = null;
    return l;
  }, []);
  const bind = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) cardNodes.current.set(id, node);
      else cardNodes.current.delete(id);
    },
    [],
  );

  React.useEffect(() => {
    const want = focusAsk.current;
    if (!want) return;
    const node = cardNodes.current.get(want);
    if (node?.isConnected) {
      focusAsk.current = null;
      node.focus({ preventScroll: true });
    }
  });

  const moveTo = (id: string, lane: string, vx = 0, vy = 0) => {
    if (where[id] === lane) return false;
    const node = cardNodes.current.get(id);
    const rect = node?.getBoundingClientRect();
    landing.current = rect
      ? { id, left: rect.left, top: rect.top, vx, vy }
      : null;
    setWhere((w) => ({ ...w, [id]: lane }));
    return true;
  };

  const verdict = (id: string, lane: string) => {
    if (finished.current) return;
    if (id === lesson.card) {
      if (lane === lesson.to) {
        finished.current = true;
        setSolved(true);
        onReact("done");
        onDone();
      } else {
        onReact("drop-wrong", {
          lane: laneOf(lane)?.title ?? lane,
          far: far(lane),
        });
      }
    } else {
      onReact("other", {
        moved: lesson.cards.find((c) => c.id === id)?.title ?? "That one",
      });
    }
  };

  const laneAt = (px: number, py: number): string | null => {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [id, node] of laneNodes.current) {
      const r = node.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
        return id;
      }
      const d = Math.hypot(
        px - (r.left + r.width / 2),
        py - (r.top + r.height / 2),
      );
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  };

  const sayOver = (id: string, lane: string) => {
    if (id !== lesson.card || lastOver.current === lane) return;
    lastOver.current = lane;
    if (lane === lesson.to) onReact("over-right");
    else if (lane !== where[id]) {
      onReact("over", { lane: laneOf(lane)?.title ?? lane, far: far(lane) });
    }
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (disabled || finished.current) return;
    const lane = where[id] ?? "";
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (carried?.id === id) {
        setCarried(null);
        verdict(id, lane);
      } else {
        setCarried({ id, from: lane });
        if (id === lesson.card) onReact("grab-key");
      }
      return;
    }
    if (carried?.id !== id) return;
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step !== 0) {
      event.preventDefault();
      const next = lesson.lanes[indexOf(lane) + step];
      if (!next) return;
      focusAsk.current = id;
      moveTo(id, next.id);
      lastOver.current = null;
      sayOver(id, next.id);
      return;
    }
    if (event.key === "Escape") {
      // Ours: the card goes back, and nothing behind the run closes.
      event.preventDefault();
      focusAsk.current = id;
      moveTo(id, carried.from);
      setCarried(null);
      onReact("cancel");
    }
  };

  const lanesFor = lesson.lanes.map((lane) => ({
    lane,
    cards: lesson.cards.filter((c) => where[c.id] === lane.id),
  }));
  const liveLane = over ?? (carried ? (where[carried.id] ?? null) : null);

  return (
    <div className="flex flex-col gap-2">
      <p id={hintId} className="sr-only">
        Space or Enter picks a card up; the arrow keys carry it from lane to
        lane; Space or Enter puts it down; Escape puts it back.
      </p>
      <div className="grid grid-cols-1 gap-2 @min-[30rem]/practice-run:grid-cols-3">
        {lanesFor.map(({ lane, cards }) => {
          const lit = liveLane === lane.id;
          return (
            <div
              key={lane.id}
              ref={(node) => {
                if (node) laneNodes.current.set(lane.id, node);
                else laneNodes.current.delete(lane.id);
              }}
              role="group"
              aria-label={`${lane.title}, ${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
              className="flex flex-col gap-1.5 rounded-3 border p-2 transition-colors duration-150"
              style={{
                borderColor: lit ? pigment : "var(--hairline)",
                backgroundColor: lit
                  ? `color-mix(in oklab, ${pigment} 8%, transparent)`
                  : "color-mix(in oklab, var(--foreground) 2%, transparent)",
              }}
            >
              <p className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {lane.title}
                <span className="tabular-nums">{cards.length}</span>
              </p>
              <div className="flex flex-wrap gap-1.5 @min-[30rem]/practice-run:flex-col @min-[30rem]/practice-run:flex-nowrap">
                {cards.map((card) => (
                  <MoveCard
                    key={card.id}
                    card={card}
                    target={card.id === lesson.card && !solved}
                    carried={carried?.id === card.id}
                    disabled={disabled}
                    motionSafe={motionSafe}
                    pigment={pigment}
                    hintId={hintId}
                    takeLanding={takeLanding}
                    bind={bind}
                    onDragStart={(id) => {
                      setCarried(null);
                      lastOver.current = where[id] ?? null;
                      if (id === lesson.card) onReact("grab-pointer");
                    }}
                    onDragMove={(id, px, py) => {
                      const l = laneAt(px, py);
                      if (l !== over) setOver(l);
                      if (l) sayOver(id, l);
                    }}
                    onDragEnd={(id, px, py, vx, vy) => {
                      setOver(null);
                      if (Number.isNaN(px)) return false;
                      const l = laneAt(px, py) ?? where[id] ?? lane.id;
                      const moved = moveTo(id, l, vx, vy);
                      if (moved) verdict(id, l);
                      return moved;
                    }}
                    onTap={(id) => {
                      if (id === lesson.card) onReact("tap");
                    }}
                    onKeyDown={onKeyDown}
                  />
                ))}
                {cards.length === 0 ? (
                  <span className="flex h-9 w-full items-center justify-center rounded-2 border border-dashed border-hairline text-[11px] text-ink-3">
                    Empty
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Lesson: mention                             */
/* ----------------------------------------------------------------------- */

function withTokens(text: string, people: PracticePerson[], pigment: string) {
  const names = people.map((p) => `@${p.name}`);
  if (names.length === 0) return text;
  const re = new RegExp(
    `(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "g",
  );
  return text.split(re).map((part, i) =>
    names.includes(part) ? (
      <span
        key={i}
        className="rounded-1 px-0.5 font-medium text-foreground"
        style={{
          backgroundColor: `color-mix(in oklab, ${pigment} 18%, transparent)`,
        }}
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Avatar({
  name,
  you,
  pigment,
}: {
  name: string;
  you?: boolean;
  pigment: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
        you ? "text-primary-foreground" : "bg-cobalt-wash text-cobalt-bright",
      )}
      style={
        you
          ? { backgroundColor: `oklch(from ${pigment} 0.55 0.15 h)` }
          : undefined
      }
    >
      {you ? "Y" : initials(name)}
    </span>
  );
}

function MentionLesson({
  lesson,
  motionSafe,
  pigment,
  disabled,
  autoFocus,
  onReact,
  onDone,
}: {
  lesson: PracticeMentionLesson;
  motionSafe: boolean;
  pigment: string;
  disabled: boolean;
  autoFocus: boolean;
  onReact: React_;
  onDone: () => void;
}) {
  const uid = React.useId();
  const listId = `${uid}-people`;
  const [draft, setDraft] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [posted, setPosted] = React.useState<{ n: number; text: string }[]>([]);
  const [input, setInput] = React.useState<HTMLInputElement | null>(null);
  const caretAsk = React.useRef<number | null>(null);
  const typed = React.useRef(false);
  const finished = React.useRef(false);
  const target = lesson.people.find((p) => p.id === lesson.person);

  React.useEffect(() => {
    if (autoFocus && input) input.focus({ preventScroll: true });
  }, [autoFocus, input]);
  React.useEffect(() => {
    const at = caretAsk.current;
    if (at === null || !input) return;
    caretAsk.current = null;
    input.focus({ preventScroll: true });
    input.setSelectionRange(at, at);
  });

  const options = lesson.people.filter(
    (p) =>
      !query ||
      p.name
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.startsWith(query.toLowerCase())),
  );
  const activeIndex = Math.min(active, Math.max(0, options.length - 1));
  const activePerson = open ? options[activeIndex] : undefined;

  const read = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([A-Za-z]*)$/.exec(before);
    if (m) {
      if (!open) onReact("at");
      setOpen(true);
      setQuery(m[1] ?? "");
      setActive(0);
    } else {
      setOpen(false);
      if (!typed.current && value.trim().length > 0 && !value.includes("@")) {
        typed.current = true;
        onReact("typing");
      }
    }
  };

  const pick = (person: PracticePerson) => {
    const caret = input?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([A-Za-z]*)$/, "");
    const after = draft.slice(caret);
    const insert = `@${person.name} `;
    const next = `${before}${insert}${after.replace(/^\s+/, "")}`;
    setDraft(next);
    setOpen(false);
    caretAsk.current = before.length + insert.length;
    if (person.id === lesson.person) onReact("picked");
    else onReact("wrong", { picked: person.name });
  };

  const send = () => {
    const text = draft.trim();
    if (!text || disabled || finished.current) return;
    setPosted((p) => [...p, { n: p.length + 1, text }]);
    setDraft("");
    setOpen(false);
    const named = lesson.people.filter((p) => text.includes(`@${p.name}`));
    if (named.some((p) => p.id === lesson.person)) {
      finished.current = true;
      onReact("done");
      onDone();
    } else if (named.length > 0) {
      onReact("sent-wrong", { picked: named.map((p) => p.name).join(" and ") });
    } else {
      onReact("sent-without");
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <ol
        role="list"
        aria-label="Site note thread"
        className="flex flex-col gap-2"
      >
        <li className="flex items-start gap-2">
          <Avatar name={lesson.note.author} pigment={pigment} />
          <div className="min-w-0 text-[13px] leading-5">
            <p className="text-[11px] text-ink-3">{lesson.note.author}</p>
            <p className="text-foreground">{lesson.note.text}</p>
          </div>
        </li>
        {posted.map((p) => (
          <motion.li
            key={p.n}
            className="flex items-start gap-2"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { y: springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
          >
            <Avatar name="You" you pigment={pigment} />
            <div className="min-w-0 text-[13px] leading-5">
              <p className="text-[11px] text-ink-3">You · just now</p>
              <p className="break-words text-foreground">
                {withTokens(p.text, lesson.people, pigment)}
              </p>
            </div>
          </motion.li>
        ))}
      </ol>
      <form
        className="flex items-center gap-2 rounded-3 border border-hairline-strong bg-card py-1 pr-1 pl-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={setInput}
          role="combobox"
          aria-label="Comment"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activePerson ? `${listId}-${activePerson.id}` : undefined
          }
          value={draft}
          readOnly={disabled}
          aria-disabled={disabled || undefined}
          placeholder={`Reply to ${firstName(lesson.note.author)}…`}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            const value = e.currentTarget.value;
            const caret = e.currentTarget.selectionStart ?? value.length;
            setDraft(value);
            read(value, caret);
          }}
          onKeyDown={(e) => {
            if (open && options.length > 0) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const d = e.key === "ArrowDown" ? 1 : -1;
                setActive((activeIndex + d + options.length) % options.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                const p = options[activeIndex];
                if (p) {
                  e.preventDefault();
                  pick(p);
                }
                return;
              }
            }
            if (open && e.key === "Escape") {
              // Ours: the list closes, and nothing behind it.
              e.preventDefault();
              setOpen(false);
            }
          }}
          className="h-7 min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          aria-label="Send"
          aria-disabled={!draft.trim() || disabled || undefined}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-primary-foreground transition-opacity aria-disabled:opacity-40",
            FOCUS,
          )}
          style={{ backgroundColor: `oklch(from ${pigment} 0.55 0.16 h)` }}
        >
          <Send aria-hidden className="size-3.5" />
        </button>
      </form>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="list"
            id={listId}
            role="listbox"
            aria-label="People"
            className="flex flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_6px_18px_color-mix(in_oklab,black_14%,transparent)]"
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {options.length === 0 ? (
              <li className="px-2 py-1.5 text-[12px] text-ink-3">
                Nobody by that name
              </li>
            ) : (
              options.map((p, i) => (
                <li
                  key={p.id}
                  id={`${listId}-${p.id}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onPointerEnter={() => setActive(i)}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2 text-[13px]",
                    i === activeIndex
                      ? "bg-surface-2 text-foreground"
                      : "text-ink-2",
                  )}
                >
                  <Avatar name={p.name} pigment={pigment} />
                  <span className="truncate">{p.name}</span>
                  {p.role ? (
                    <span className="ml-auto hidden truncate text-[11px] text-ink-3 @min-[30rem]/practice-run:inline">
                      {p.role}
                    </span>
                  ) : null}
                </li>
              ))
            )}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      {target ? (
        <p className="sr-only">Type @ and choose {target.name}, then send.</p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Lesson: label                              */
/* ----------------------------------------------------------------------- */

function LabelLesson({
  lesson,
  motionSafe,
  disabled,
  autoFocus,
  onReact,
  onDone,
}: {
  lesson: PracticeLabelLesson;
  motionSafe: boolean;
  disabled: boolean;
  autoFocus: boolean;
  onReact: React_;
  onDone: () => void;
}) {
  const uid = React.useId();
  const menuId = `${uid}-menu`;
  const buttonId = `${uid}-button`;
  const [applied, setApplied] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [button, setButton] = React.useState<HTMLButtonElement | null>(null);
  const items = React.useRef(new Map<string, HTMLElement>());
  const wrap = React.useRef<HTMLDivElement | null>(null);
  const finished = React.useRef(false);
  const focusItem = React.useRef(false);

  React.useEffect(() => {
    if (autoFocus && button) button.focus({ preventScroll: true });
  }, [autoFocus, button]);
  React.useEffect(() => {
    if (!open || !focusItem.current) return;
    const l = lesson.labels[active];
    const node = l ? items.current.get(l.id) : undefined;
    if (node) {
      focusItem.current = false;
      node.focus({ preventScroll: true });
    }
  });

  const close = (refocus: boolean, quiet = false) => {
    setOpen(false);
    if (refocus) button?.focus({ preventScroll: true });
    if (!quiet && !finished.current) onReact("close");
  };
  const openMenu = (at = 0) => {
    if (disabled || finished.current) return;
    setOpen(true);
    setActive(at);
    focusItem.current = true;
    onReact("open");
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Node && wrap.current?.contains(event.target))
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  const toggle = (label: PracticeLabel) => {
    if (disabled || finished.current) return;
    const on = !applied.includes(label.id);
    setApplied((a) =>
      on ? [...a, label.id] : a.filter((x) => x !== label.id),
    );
    if (on && label.id === lesson.label) {
      finished.current = true;
      close(true, true);
      onReact("done");
      onDone();
    } else if (on) {
      onReact("wrong", { picked: label.name });
    } else {
      onReact("remove");
    }
  };

  const onMenuKey = (event: React.KeyboardEvent) => {
    const last = lesson.labels.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      setActive(to);
      focusItem.current = true;
    };
    if (event.key === "ArrowDown") move(active >= last ? 0 : active + 1);
    else if (event.key === "ArrowUp") move(active <= 0 ? last : active - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(last);
    else if (event.key === "Escape") {
      // Ours: the menu closes and focus goes home to its button.
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const l = lesson.labels[active];
      if (l) toggle(l);
    }
  };

  const chips = lesson.labels.filter((l) => applied.includes(l.id));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-3 border border-hairline bg-card p-3">
        <p className="text-[13px] font-medium text-foreground">
          {lesson.job.title}
        </p>
        <p className="mt-0.5 text-[12px] text-ink-3">{lesson.job.detail}</p>
        <ul
          role="list"
          aria-label="Labels on this job"
          className="mt-2 flex flex-wrap items-center gap-1.5"
        >
          <AnimatePresence initial={false}>
            {chips.length === 0 ? (
              <motion.li
                key="none"
                className="text-[11px] text-ink-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
              >
                No labels yet
              </motion.li>
            ) : null}
            {chips.map((l) => (
              <motion.li
                key={l.id}
                className={cn(
                  "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium",
                  TONE[l.tone].text,
                )}
                style={{
                  backgroundColor: `color-mix(in oklab, ${TONE[l.tone].pigment} 16%, transparent)`,
                }}
                initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.8 : 1,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: TONE[l.tone].pigment }}
                />
                {l.name}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
      <div ref={wrap} className="flex flex-col items-start gap-1.5">
        <button
          ref={setButton}
          id={buttonId}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-disabled={disabled || undefined}
          onClick={() => (open ? close(false) : openMenu(0))}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              openMenu(e.key === "ArrowUp" ? lesson.labels.length - 1 : 0);
            }
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          <Tag aria-hidden className="size-3.5 text-ink-3" />
          Labels
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 text-ink-3 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="menu"
              id={menuId}
              role="menu"
              aria-labelledby={buttonId}
              onKeyDown={onMenuKey}
              className="flex w-52 max-w-full flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_6px_18px_color-mix(in_oklab,black_14%,transparent)]"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {lesson.labels.map((l, i) => {
                const on = applied.includes(l.id);
                return (
                  <div
                    key={l.id}
                    ref={(node) => {
                      if (node) items.current.set(l.id, node);
                      else items.current.delete(l.id);
                    }}
                    role="menuitemcheckbox"
                    aria-checked={on}
                    tabIndex={i === active ? 0 : -1}
                    onClick={() => toggle(l)}
                    onFocus={() => setActive(i)}
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2 text-[13px] text-foreground hover:bg-surface-2",
                      "outline-none focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: TONE[l.tone].pigment }}
                    />
                    <span className="flex-1 truncate">{l.name}</span>
                    {on ? (
                      <Check
                        aria-hidden
                        className="size-3.5 shrink-0 text-ink-2"
                      />
                    ) : null}
                  </div>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The stamp                                 */
/* ----------------------------------------------------------------------- */

/**
 * The quiet check stamp. It comes down from 1.5× to rest on recoil — a
 * landing, two small bounces — set at a slight angle, while a ring of ink
 * spreads from under it and fades.
 */
function Stamp({
  stampStyle,
  ink,
  motionSafe,
}: {
  stampStyle: PracticeStampStyle;
  ink: string;
  motionSafe: boolean;
}) {
  const rimId = `${React.useId()}-rim`;
  const press = motionSafe
    ? {
        scale: springs.recoil,
        opacity: { duration: durations.fast, ease: easings.enter },
      }
    : { duration: durations.base };
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-30 flex items-center-safe justify-center-safe"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
    >
      {motionSafe ? (
        <motion.span
          className="absolute size-24 rounded-full border-2"
          style={{ borderColor: ink }}
          initial={{ scale: 0.7, opacity: 0.5 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 0.55, ease: easings.enter, delay: 0.06 }}
        />
      ) : null}
      <motion.div
        className="relative"
        style={{ rotate: -8, color: ink }}
        initial={{ scale: motionSafe ? 1.5 : 1, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.9 }}
        transition={press}
      >
        {stampStyle === "tick" ? (
          <span
            className="flex size-[72px] items-center justify-center rounded-4 border-[3px] bg-card/80"
            style={{ borderColor: ink }}
          >
            <svg viewBox="0 0 32 32" className="size-10">
              <motion.path
                d="M8 17 L14 23 L25 10"
                fill="none"
                stroke="currentColor"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: motionSafe ? 0 : 1 }}
                animate={{ pathLength: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.flick, delay: 0.14 }
                    : { duration: 0 }
                }
              />
            </svg>
          </span>
        ) : stampStyle === "ink" ? (
          <span
            className="flex flex-col items-center rounded-2 border-[3px] bg-card/80 px-4 py-1.5 font-mono"
            style={{
              borderColor: ink,
              outlineWidth: 1,
              outlineStyle: "solid",
              outlineColor: ink,
              outlineOffset: 2,
            }}
          >
            <span className="text-[22px] leading-7 font-bold tracking-[0.18em]">
              DONE
            </span>
            <span className="text-[8px] tracking-[0.2em] uppercase">
              practice run
            </span>
          </span>
        ) : (
          <svg viewBox="0 0 96 96" className="size-24">
            <defs>
              <path
                id={rimId}
                d="M48 48 m-36 0 a36 36 0 1 1 72 0 a36 36 0 1 1 -72 0"
              />
            </defs>
            <circle
              cx={48}
              cy={48}
              r={44}
              className="fill-card/80"
              stroke="currentColor"
              strokeWidth={3}
            />
            <circle
              cx={48}
              cy={48}
              r={29}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.2}
            />
            <text
              fill="currentColor"
              className="font-mono"
              style={{ fontSize: 8, letterSpacing: "0.32em" }}
            >
              <textPath href={`#${rimId}`}>
                DONE · PRACTICE RUN · DONE ·
              </textPath>
            </text>
            <path
              d="M36 49 L45 58 L61 39"
              fill="none"
              stroke="currentColor"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The run                                 */
/* ----------------------------------------------------------------------- */

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
      animate={{ height: height ?? "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 6 }}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/**
 * A hands-on tutorial: each lesson is one small real task in a sandboxed
 * copy of the interface — move a card on a working board, mention a teammate
 * from a working combobox, label a job from a working menu. A coach line
 * follows what the visitor actually does, answering each move with one
 * sentence that rises into place on snap. Finishing the task presses a quiet
 * check stamp onto the sandbox on recoil, then the next lesson slides in on
 * glide while the step rail fills.
 *
 * Every lesson has a keyboard path (Space picks a card up and the arrows
 * carry it; @ and the arrow keys pick a person; the arrow keys walk the
 * label menu) and a Skip. Progress is a value, so a run resumes on the first
 * lesson still open. Under 30rem the coach becomes a caption under the
 * sandbox. Under reduced motion nothing travels: cards change lanes in place,
 * the stamp fades in at rest and lessons cross-fade.
 */
export function PracticeRun({
  lessons = defaultPracticeLessons,
  progress,
  defaultProgress = EMPTY_PROGRESS,
  onProgressChange,
  onComplete,
  onSkip,
  onFinish,
  onRestart,
  coach = "Wren",
  coachStyle = "bubble",
  stampStyle = "seal",
  accent = "var(--accent-bright)",
  stampHold = 700,
  workspace = "Fieldline",
  status = "ready",
  maxHeight = 560,
  disabled = false,
  className,
}: PracticeRunProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const pigment = `oklch(from ${accent} 0.64 0.16 h)`;
  const ink = `oklch(from ${accent} 0.52 0.16 h)`;
  const ready = status === "ready";

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const [own, setOwn] = React.useState<PracticeProgress>(() => ({
    ...defaultProgress,
  }));
  const prog = progress ?? own;
  const firstOpen = (p: PracticeProgress) =>
    lessons.find((l) => !p[l.id])?.id ?? FINALE;
  const [view, setView] = React.useState<string>(() => firstOpen(prog));
  const [dir, setDir] = React.useState<1 | -1>(1);
  const [round, setRound] = React.useState(0);
  const [stamp, setStamp] = React.useState<{ n: number; id: string } | null>(
    null,
  );
  const [focusNew, setFocusNew] = React.useState(false);
  const lesson = lessons.find((l) => l.id === view);
  const index = lesson ? lessons.indexOf(lesson) : lessons.length;
  const [line, setLine] = React.useState(() => ({
    n: 0,
    text: lesson ? coachLine(lesson, "start", {}) : "",
  }));
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const speak = (text: string) => setLine((l) => ({ n: l.n + 1, text }));
  const finaleLine = (p: PracticeProgress) => {
    const done = lessons.filter((l) => p[l.id] === "done").length;
    return done === lessons.length
      ? `That's the run. You've done all ${lessons.length} for real now.`
      : `That's the run: ${done} done. Skipped ones are here whenever you want them.`;
  };

  const writeProgress = (next: PracticeProgress) => {
    if (progress === undefined) setOwn(next);
    onProgressChange?.(next);
  };

  const focusInside = () =>
    !!root &&
    typeof document !== "undefined" &&
    root.contains(document.activeElement);

  const show = (
    id: string,
    p: PracticeProgress,
    d: 1 | -1,
    hadFocus = focusInside(),
  ) => {
    setFocusNew(hadFocus);
    setDir(d);
    setView(id);
    setStamp(null);
    const next = lessons.find((l) => l.id === id);
    speak(next ? coachLine(next, "start", {}) : finaleLine(p));
  };

  /** After `from`, the next lesson still open, wrapping round; else the finale. */
  const nextOpen = (from: number, p: PracticeProgress) => {
    for (let k = 1; k <= lessons.length; k += 1) {
      const l = lessons[(from + k) % lessons.length];
      if (l && !p[l.id]) return l.id;
    }
    return FINALE;
  };

  const react = (event: string, vars: Vars = {}) => {
    if (!lesson) return;
    speak(coachLine(lesson, event, vars));
  };

  const complete = () => {
    if (!lesson) return;
    const next = { ...prog, [lesson.id]: "done" as const };
    writeProgress(next);
    onComplete?.(lesson);
    setStamp((s) => ({ n: (s?.n ?? 0) + 1, id: lesson.id }));
    const from = index;
    // Whether the hand was on the keyboard inside the run is read now: by
    // the time the next lesson arrives, the old one's controls are gone.
    const hadFocus = focusInside();
    const t = window.setTimeout(
      () => {
        timers.current.delete(t);
        show(nextOpen(from, next), next, 1, hadFocus || focusInside());
      },
      Math.max(200, stampHold) + (motionSafe ? 260 : 0),
    );
    timers.current.add(t);
  };

  const skip = () => {
    if (!lesson || disabled || stamp) return;
    const next = {
      ...prog,
      [lesson.id]: prog[lesson.id] ?? ("skipped" as const),
    };
    writeProgress(next);
    onSkip?.(lesson);
    show(nextOpen(index, next), next, 1);
  };

  const goTo = (id: string) => {
    if (id === view || disabled || stamp) return;
    const to = lessons.findIndex((l) => l.id === id);
    setRound((r) => r + 1);
    show(id, prog, to < index ? -1 : 1);
  };

  const restart = () => {
    writeProgress({});
    onRestart?.();
    setRound((r) => r + 1);
    const first = lessons[0];
    show(first?.id ?? FINALE, {}, -1);
  };

  const resolved = lessons.filter((l) => prog[l.id]).length;
  const doneCount = lessons.filter((l) => prog[l.id] === "done").length;
  const skippedCount = lessons.filter((l) => prog[l.id] === "skipped").length;
  const stamping = stamp !== null && stamp.id === view;

  const lessonBody = (() => {
    if (!ready) {
      return (
        <div aria-hidden className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-28 rounded-3 bg-surface-2" />
          ))}
        </div>
      );
    }
    if (!lesson) {
      return (
        <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-full text-primary-foreground"
            style={{ backgroundColor: ink }}
          >
            <Check className="size-5" />
          </span>
          <p className="text-sm font-semibold text-foreground">
            You&apos;ve practised {workspace}
          </p>
          <p className="text-[13px] text-ink-2">
            {doneCount} done
            {skippedCount ? ` · ${skippedCount} skipped` : ""} · nothing here
            was saved
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={restart}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Practice again
            </button>
            <FinishButton
              autoFocus={focusNew}
              ink={ink}
              onClick={() => onFinish?.(prog)}
            />
          </div>
        </div>
      );
    }
    const common = {
      motionSafe,
      disabled: disabled || stamping,
      autoFocus: focusNew,
      onReact: react,
      onDone: complete,
    };
    if (lesson.kind === "move") {
      return <MoveLesson lesson={lesson} pigment={pigment} {...common} />;
    }
    if (lesson.kind === "mention") {
      return <MentionLesson lesson={lesson} pigment={pigment} {...common} />;
    }
    return <LabelLesson lesson={lesson} {...common} />;
  })();

  const coachFace = (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-primary-foreground"
      style={{ backgroundColor: ink }}
    >
      {coach.charAt(0).toUpperCase()}
    </span>
  );

  const words = (className?: string) => (
    <span className={cn("grid", className)}>
      <AnimatePresence initial={false}>
        <motion.span
          key={line.n}
          className="[grid-area:1/1]"
          initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -distances.nudge : 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {line.text}
        </motion.span>
      </AnimatePresence>
    </span>
  );

  const coachWide =
    coachStyle === "ticker" ? (
      <div
        aria-hidden
        className="hidden flex-col gap-1.5 @min-[30rem]/practice-run:flex"
      >
        <p className="flex items-start gap-2 font-mono text-[12px] leading-5 text-ink-2">
          <span
            className="shrink-0 tracking-[0.08em] uppercase"
            style={{ color: ink }}
          >
            {coach} ›
          </span>
          {words("min-w-0 flex-1")}
        </p>
        <span className="block h-0.5 w-full overflow-clip rounded-full bg-hairline">
          <motion.span
            className="block h-full w-full"
            style={{ originX: 0, backgroundColor: pigment }}
            initial={false}
            animate={{
              scaleX: Number(
                (lessons.length ? resolved / lessons.length : 0).toFixed(3),
              ),
            }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
        </span>
      </div>
    ) : coachStyle === "margin" ? (
      <div
        aria-hidden
        className="relative hidden flex-col gap-2 pr-4 @min-[30rem]/practice-run:flex"
      >
        <span className="flex items-center gap-2 text-[11px] font-medium text-ink-2">
          {coachFace}
          {coach}
        </span>
        <p className="text-[13px] leading-5 text-ink-2 italic">{words()}</p>
        <svg
          viewBox="0 0 16 10"
          className="absolute top-3 -right-1 h-2.5 w-4 overflow-visible"
          style={{ color: pigment }}
        >
          <path
            d="M0 5 H14 M10 1 L14 5 L10 9"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ) : (
      <div
        aria-hidden
        className="hidden items-end gap-2 @min-[30rem]/practice-run:flex"
      >
        {coachFace}
        <p className="relative min-w-0 flex-1 rounded-3 rounded-bl-1 border border-hairline bg-surface-2 px-3 py-2 text-[13px] leading-5 text-foreground">
          {words()}
        </p>
      </div>
    );

  const caption = (
    <p
      aria-hidden
      className="sticky bottom-0 z-20 flex items-start gap-2 border-t border-hairline bg-popover px-3 py-2 text-[12px] leading-5 text-foreground @min-[30rem]/practice-run:hidden"
    >
      <span className="shrink-0 font-semibold" style={{ color: ink }}>
        {coach}
      </span>
      {words("min-w-0 flex-1")}
    </p>
  );

  const sandbox = (
    <div className="relative overflow-clip rounded-3 border border-hairline bg-surface-1">
      <div className="flex h-7 items-center justify-between gap-2 border-b border-hairline px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span className="truncate">Practice copy</span>
        <span className="hidden truncate @min-[30rem]/practice-run:inline">
          Nothing here is saved
        </span>
      </div>
      <Measured glide={motionSafe}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={`${view}-${round}`}
            custom={dir}
            className="p-3"
            variants={{
              enter: (d: number) => ({
                opacity: 0,
                x: motionSafe ? d * distances.shift : 0,
              }),
              shown: { opacity: 1, x: 0 },
              leave: (d: number) => ({
                opacity: 0,
                x: motionSafe ? -d * distances.shift : 0,
                transition: exitFor(),
              }),
            }}
            initial="enter"
            animate="shown"
            exit="leave"
            transition={
              motionSafe
                ? {
                    x: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            <motion.div
              animate={{ opacity: stamping ? 0.4 : 1 }}
              transition={{ duration: durations.base }}
              aria-hidden={stamping || undefined}
            >
              {lessonBody}
            </motion.div>
          </motion.div>
        </AnimatePresence>
        {caption}
      </Measured>
      <AnimatePresence>
        {stamping ? (
          <Stamp
            key={`stamp-${stamp.n}`}
            stampStyle={stampStyle}
            ink={ink}
            motionSafe={motionSafe}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );

  return (
    <section
      ref={setRoot}
      aria-labelledby={titleId}
      aria-busy={!ready || undefined}
      className={cn(
        "@container/practice-run flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            Practice run
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            Learn {workspace} by doing it once
          </p>
        </div>
        <ol aria-label="Lessons" className="flex shrink-0 items-center gap-1.5">
          {lessons.map((l, i) => {
            const state = prog[l.id];
            const current = l.id === view;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-label={`Lesson ${i + 1} of ${lessons.length}, ${l.title}${
                    state === "done"
                      ? ", done"
                      : state === "skipped"
                        ? ", skipped"
                        : ""
                  }`}
                  aria-current={current ? "step" : undefined}
                  aria-disabled={disabled || !ready || undefined}
                  onClick={() => {
                    if (ready) goTo(l.id);
                  }}
                  className={cn(
                    "relative flex size-6 items-center justify-center rounded-full border font-mono text-[10px] tabular-nums transition-colors duration-200",
                    state === "done"
                      ? "border-transparent text-primary-foreground"
                      : current
                        ? "border-transparent text-foreground"
                        : "border-hairline text-ink-3 hover:text-foreground",
                    FOCUS,
                  )}
                  style={
                    current && state !== "done"
                      ? { boxShadow: `0 0 0 1.5px ${pigment}` }
                      : undefined
                  }
                >
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: ink }}
                    initial={false}
                    animate={{
                      scale: state === "done" ? 1 : 0,
                      opacity: state === "done" ? 1 : 0,
                    }}
                    transition={
                      motionSafe
                        ? {
                            scale: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  />
                  <span className="relative">
                    {state === "done" ? (
                      <Check aria-hidden className="size-3" />
                    ) : state === "skipped" ? (
                      "–"
                    ) : (
                      i + 1
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-[13px] leading-5">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {lesson ? `Lesson ${index + 1} of ${lessons.length}` : "Done"}
              </span>
              <span className="block truncate text-sm font-semibold text-foreground">
                {lesson ? lesson.title : "Every lesson, once"}
              </span>
            </p>
            {lesson ? (
              <button
                type="button"
                onClick={skip}
                aria-disabled={disabled || stamping || !ready || undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50",
                  FOCUS,
                )}
              >
                Skip
                <SkipForward aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </div>
          {coachStyle === "margin" ? (
            <div className="grid grid-cols-1 gap-3 @min-[30rem]/practice-run:grid-cols-[9rem_minmax(0,1fr)]">
              {coachWide}
              {sandbox}
            </div>
          ) : (
            <>
              {coachWide}
              {sandbox}
            </>
          )}
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={line.n}>
          {stamping && lesson ? `Done: ${lesson.title}. ` : ""}
          {line.text}
        </span>
      </p>
    </section>
  );
}

function FinishButton({
  autoFocus,
  ink,
  onClick,
}: {
  autoFocus: boolean;
  ink: string;
  onClick: () => void;
}) {
  const [node, setNode] = React.useState<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (autoFocus && node) node.focus({ preventScroll: true });
  }, [autoFocus, node]);
  return (
    <button
      ref={setNode}
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium text-primary-foreground",
        FOCUS,
      )}
      style={{ backgroundColor: ink }}
    >
      Start working
    </button>
  );
}
