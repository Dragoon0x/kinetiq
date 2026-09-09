"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BoardStatus = "queued" | "running" | "done" | "failed";

export type BoardTask = {
  id: string;
  title: string;
  /** Who has it, printed under the title. */
  agent?: string;
  status: BoardStatus;
};

export type TaskBoardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Every task, in board order. */
  tasks: BoardTask[];
  /** Makes each queued and running card a button that moves it one column. */
  onAdvance?: (id: string, next: "running" | "done") => void;
  /** Heading overrides. */
  columns?: { queued?: string; running?: string; done?: string };
  /** Names the board. */
  label: string;
  className?: string;
};

type ColumnKey = "queued" | "running" | "done";

/** Three columns at this width scroll inside the box on a phone. */
const COL_W = 120;
const COL_GAP = 8;

const COLUMN_OF: Record<BoardStatus, ColumnKey> = {
  queued: "queued",
  running: "running",
  failed: "running",
  done: "done",
};

const NEXT: Partial<Record<BoardStatus, "running" | "done">> = {
  queued: "running",
  running: "done",
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** A count whose digits roll to their new value on `snap`. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity.
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** The card's mark: a ring, a breathing dot, a drawn tick or a cross. */
function Mark({
  status,
  motionSafe,
}: {
  status: BoardStatus;
  motionSafe: boolean;
}) {
  const done = status === "done";
  const failed = status === "failed";
  const running = status === "running";
  const draw = motionSafe ? springs.flick : { duration: 0 };
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-3.5 shrink-0 place-items-center rounded-full border bg-surface-0 transition-colors duration-300",
        running
          ? "border-cobalt-bright"
          : done
            ? "border-success"
            : failed
              ? "border-danger"
              : "border-hairline-strong",
      )}
    >
      <motion.span
        className={cn(
          "absolute inset-0 rounded-full",
          failed ? "bg-danger" : "bg-success",
        )}
        initial={false}
        animate={{ scale: done || failed ? 1 : 0 }}
        transition={draw}
      />
      <motion.span
        className="absolute size-1.5 rounded-full bg-cobalt-bright"
        initial={false}
        animate={{ opacity: running ? (motionSafe ? [1, 0.3] : 0.7) : 0 }}
        transition={
          running && motionSafe
            ? {
                duration: 0.8,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "reverse",
              }
            : { duration: durations.fast }
        }
      />
      <svg
        viewBox="0 0 16 16"
        className="relative size-2.5 text-background"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d="M3.5 8.5 6.5 11.5 12.5 4.5"
          pathLength={1}
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={draw}
        />
        <motion.path
          d="m4.5 4.5 7 7M11.5 4.5l-7 7"
          pathLength={1}
          initial={false}
          animate={{ pathLength: failed ? 1 : 0, opacity: failed ? 1 : 0 }}
          transition={draw}
        />
      </svg>
    </span>
  );
}

/**
 * Three columns — queued, running, done — and the cards that cross them.
 * The host owns every task's status; when it changes, the card travels from
 * its old column to its new one on `glide` through a shared `layoutId`, so
 * the same card is seen crossing the board, and the cards it leaves and
 * lands among close and open the gap on `glide` through `layout`. A running
 * card's mark breathes, a done card's tick draws on `flick`, a failed card
 * stays in the running column with a cross and the word in text. Each
 * column's count rolls on `snap` — the roll belongs to the landing. The
 * board is wider than a phone, so it scrolls inside its own box with edge
 * fades that appear only where there is more board to reach.
 *
 * With `onAdvance` each open card is a button in a roving tabindex: Up and
 * Down move within a column, Left and Right cross to the nearest card in
 * the next column, Home and End jump, Enter and Space advance. The live
 * region names the card that moved and the new counts, once per change.
 * Under reduced motion a moved card fades out of one column and into the
 * other, siblings shift on a tween and counts swap in place.
 */
export function TaskBoard({
  ref,
  tasks,
  onAdvance,
  columns,
  label,
  className,
}: TaskBoardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const cardRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const [focusedId, setFocusedId] = React.useState<string | null>(null);

  const heads: { key: ColumnKey; title: string }[] = [
    { key: "queued", title: columns?.queued ?? "Queued" },
    { key: "running", title: columns?.running ?? "Running" },
    { key: "done", title: columns?.done ?? "Done" },
  ];
  const lanes = heads.map((head) => ({
    ...head,
    cards: tasks.filter((task) => COLUMN_OF[task.status] === head.key),
  }));

  // Buttons in column-major order, with their place, for the arrow keys.
  const focusable = onAdvance
    ? lanes.flatMap((lane, col) =>
        lane.cards
          .filter((task) => NEXT[task.status] !== undefined)
          .map((task, row) => ({ id: task.id, col, row })),
      )
    : [];
  const tabStop =
    focusable.find((entry) => entry.id === focusedId)?.id ?? focusable[0]?.id;

  const focusEntry = (id: string | undefined) => {
    if (!id) return;
    setFocusedId(id);
    cardRefs.current.get(id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, id: string) => {
    const here = focusable.find((entry) => entry.id === id);
    if (!here) return;
    const inColumn = (col: number) =>
      focusable.filter((entry) => entry.col === col);
    const sideways = (dir: 1 | -1) => {
      for (
        let col = here.col + dir;
        col >= 0 && col < lanes.length;
        col += dir
      ) {
        const cards = inColumn(col);
        if (cards.length > 0) {
          return cards[Math.min(here.row, cards.length - 1)]?.id;
        }
      }
      return undefined;
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusEntry(inColumn(here.col)[here.row + 1]?.id);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusEntry(inColumn(here.col)[here.row - 1]?.id);
        break;
      case "ArrowRight":
        event.preventDefault();
        focusEntry(sideways(1));
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusEntry(sideways(-1));
        break;
      case "Home":
        event.preventDefault();
        focusEntry(focusable[0]?.id);
        break;
      case "End":
        event.preventDefault();
        focusEntry(focusable[focusable.length - 1]?.id);
        break;
      default:
        break;
    }
  };

  // The announcement is minted when the statuses change and held until the
  // next change, so a re-render never re-reads it and a tick never speaks.
  const signature = tasks.map((task) => `${task.id}:${task.status}`).join("|");
  const [seen, setSeen] = React.useState({ signature, text: "" });
  if (seen.signature !== signature) {
    const before = new Map(
      seen.signature
        .split("|")
        .map((pair) => pair.split(":") as [string, string]),
    );
    const changed = tasks.find(
      (task) => before.has(task.id) && before.get(task.id) !== task.status,
    );
    const counts = lanes.map((lane) => lane.cards.length);
    const open = tasks.filter(
      (task) => task.status === "queued" || task.status === "running",
    ).length;
    const failed = tasks.filter((task) => task.status === "failed").length;
    const text = !changed
      ? seen.text
      : open === 0
        ? failed > 0
          ? `${changed.title} ${changed.status}. All settled, ${failed} failed`
          : `${changed.title} ${changed.status}. All done`
        : `${changed.title} ${changed.status}. ${counts[0]} queued, ${counts[1]} running, ${counts[2]} done`;
    setSeen({ signature, text });
  }

  // Edge fades only where there is more board to reach; a ResizeObserver
  // fires once on observe so the first paint is honest.
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });
  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const measure = () => {
      const overflow = node.scrollWidth - node.clientWidth;
      setEdges({
        start: node.scrollLeft > 1,
        end: node.scrollLeft < overflow - 1,
      });
    };
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  const move = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
        </span>
      </div>

      <div className="relative">
        <div ref={scrollerRef} className="overflow-x-auto">
          <div
            role="group"
            aria-labelledby={labelId}
            className="grid grid-cols-3"
            style={{
              gap: COL_GAP,
              minWidth: COL_W * 3 + COL_GAP * 2,
            }}
          >
            {lanes.map((lane) => {
              const headId = `${baseId}-${lane.key}`;
              return (
                <section
                  key={lane.key}
                  aria-labelledby={headId}
                  className="flex min-w-0 flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2"
                >
                  <div className="flex h-5 items-center justify-between gap-2">
                    <span
                      id={headId}
                      className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                    >
                      {lane.title}
                      <span className="sr-only">, {lane.cards.length}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] font-medium text-foreground">
                      <RollingNumber
                        value={String(lane.cards.length)}
                        motionSafe={motionSafe}
                      />
                    </span>
                  </div>

                  <ul
                    aria-labelledby={headId}
                    className="flex flex-col gap-1.5"
                  >
                    {/* The shared layoutId is what carries a card across the
                        board; under reduced motion it is withheld so the card
                        fades out of one column and into the other instead. */}
                    <AnimatePresence initial={false}>
                      {lane.cards.map((task) => {
                        const next = NEXT[task.status];
                        const advance = onAdvance && next ? next : undefined;
                        const words = [task.title, task.agent, task.status]
                          .filter(Boolean)
                          .join(", ");
                        const face = (
                          <>
                            <Mark
                              status={task.status}
                              motionSafe={motionSafe}
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span
                                className="truncate text-xs font-medium text-foreground"
                                title={task.title}
                              >
                                {task.title}
                              </span>
                              <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                                {task.status === "failed"
                                  ? "Failed"
                                  : (task.agent ?? "Unassigned")}
                              </span>
                            </span>
                          </>
                        );
                        const surface =
                          "flex w-full items-center gap-2 rounded-2 border bg-surface-0 px-2 py-1.5 text-left";
                        return (
                          <motion.li
                            key={task.id}
                            layoutId={
                              motionSafe ? `${baseId}-${task.id}` : undefined
                            }
                            layout={motionSafe}
                            transition={move}
                            initial={motionSafe ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={
                              motionSafe
                                ? undefined
                                : {
                                    opacity: 0,
                                    transition: exitFor(durations.fast),
                                  }
                            }
                          >
                            {advance ? (
                              <button
                                type="button"
                                ref={(node) => {
                                  cardRefs.current.set(task.id, node);
                                }}
                                aria-label={`${words}. Move to ${advance}`}
                                tabIndex={tabStop === task.id ? 0 : -1}
                                onFocus={() => setFocusedId(task.id)}
                                onClick={() => onAdvance?.(task.id, advance)}
                                onKeyDown={(event) => onKeyDown(event, task.id)}
                                className={cn(
                                  surface,
                                  "border-hairline-strong transition-colors outline-none hover:border-cobalt-bright/60 hover:bg-accent/40",
                                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                                )}
                              >
                                {face}
                              </button>
                            ) : (
                              <div
                                aria-label={words}
                                className={cn(
                                  surface,
                                  task.status === "failed"
                                    ? "border-danger/50"
                                    : "border-hairline",
                                )}
                              >
                                {face}
                              </div>
                            )}
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </section>
              );
            })}
          </div>
        </div>

        {edges.start ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-background to-background/0"
          />
        ) : null}
        {edges.end ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-background to-background/0"
          />
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {seen.text}
      </span>
    </div>
  );
}
