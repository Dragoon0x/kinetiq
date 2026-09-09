"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RunEventKind =
  "tool" | "message" | "plan" | "handoff" | "error" | "done";

export type RunEvent = {
  id: string;
  kind: RunEventKind;
  /** Who did it, printed before the text. */
  agent?: string;
  text: string;
  /** Seconds since the run began, owned by the host. */
  at: number;
};

export type RunTimelineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The run so far, oldest first. Append to grow it. */
  events: RunEvent[];
  /** The last event breathes while true. @default false */
  live?: boolean;
  /** Controlled grouping of similar events. */
  collapsed?: boolean;
  /** Initial grouping for uncontrolled usage. @default false */
  defaultCollapsed?: boolean;
  /** Fires from the Collapse similar control. */
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Names the timeline. */
  label: string;
  className?: string;
};

type Group = {
  id: string;
  kind: RunEventKind;
  members: string[];
  from: number;
  to: number;
};

const KIND_WORD: Record<RunEventKind, string> = {
  tool: "tool call",
  message: "message",
  plan: "plan",
  handoff: "handoff",
  error: "error",
  done: "done",
};

/** Node shapes carry the kind, so a folded run of squares reads as tool calls before the words do. */
const NODE: Record<RunEventKind, string> = {
  tool: "rounded-[3px] border-[1.5px] border-cobalt-bright bg-cobalt-wash",
  message: "rounded-full bg-ink-2",
  plan: "rotate-45 rounded-[2px] border-[1.5px] border-ink-2 bg-surface-1",
  handoff: "rounded-full border-[1.5px] border-cobalt-bright bg-surface-1",
  error: "rounded-full bg-danger",
  done: "rounded-full bg-success",
};

const formatAt = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** Runs of two or more same-kind events; errors, the finish and the live event stay their own rows. */
function findGroups(events: RunEvent[], live: boolean): Group[] {
  const groups: Group[] = [];
  let run: RunEvent[] = [];
  const flush = () => {
    const head = run[0];
    const tail = run[run.length - 1];
    if (head && tail && run.length >= 2) {
      groups.push({
        id: head.id,
        kind: head.kind,
        members: run.map((event) => event.id),
        from: head.at,
        to: tail.at,
      });
    }
    run = [];
  };
  events.forEach((event, index) => {
    const solo =
      event.kind === "error" ||
      event.kind === "done" ||
      (live && index === events.length - 1);
    if (solo || (run[0] && run[0].kind !== event.kind)) flush();
    if (!solo) run.push(event);
  });
  flush();
  return groups;
}

/** Measures its content so a row folds by its true height, wrapped text and all. */
function useMeasured() {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { innerRef, height };
}

const COLUMNS = "grid grid-cols-[36px_16px_minmax(0,1fr)] gap-x-2";

function Spine({ drawn, motionSafe }: { drawn: boolean; motionSafe: boolean }) {
  return (
    <span className="absolute inset-x-0 top-4 bottom-0 flex justify-center">
      <span className="relative h-full w-px bg-hairline-strong">
        {/* The segment grows from its top on `glide` only once a row exists
            beneath it, so the spine reaches each new event rather than
            waiting there for it. */}
        <motion.span
          className="absolute inset-0 origin-top bg-ink-3"
          initial={false}
          animate={{
            scaleY: drawn || !motionSafe ? 1 : 0,
            opacity: drawn ? 1 : 0,
          }}
          transition={
            motionSafe
              ? { ...springs.glide, opacity: { duration: durations.blink } }
              : { duration: durations.fast, ease: easings.enter }
          }
        />
      </span>
    </span>
  );
}

function EventRow({
  event,
  live,
  hidden,
  last,
  motionSafe,
}: {
  event: RunEvent;
  live: boolean;
  hidden: boolean;
  last: boolean;
  motionSafe: boolean;
}) {
  const { innerRef, height } = useMeasured();
  const error = event.kind === "error";
  const done = event.kind === "done";
  const fold = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  return (
    <motion.li
      className="overflow-hidden"
      aria-hidden={hidden}
      inert={hidden}
      initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
      animate={{
        height: hidden ? 0 : (height ?? "auto"),
        opacity: hidden ? 0 : 1,
        y: 0,
      }}
      transition={{
        ...fold,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
    >
      <div ref={innerRef} className={cn(COLUMNS, !last && "pb-3")}>
        <span className="flex h-4 items-center font-mono text-[11px] text-ink-3 tabular-nums">
          {formatAt(event.at)}
        </span>
        <span aria-hidden className="relative flex justify-center">
          <span className="relative z-10 grid size-4 place-items-center bg-surface-1">
            <motion.span
              className={cn("size-2.5", NODE[event.kind])}
              initial={done && motionSafe ? { scale: 0 } : false}
              animate={{ scale: 1 }}
              // The finish is a stamp: it lands on `flick`, drawn whole under
              // reduced motion.
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
            <motion.span
              className="absolute -inset-0.5 rounded-full border border-cobalt-bright"
              initial={false}
              animate={{ opacity: live ? (motionSafe ? [0.9, 0.2] : 0.6) : 0 }}
              transition={
                live && motionSafe
                  ? {
                      duration: 0.9,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatType: "reverse",
                    }
                  : { duration: durations.fast }
              }
            />
          </span>
          {!last ? <Spine drawn motionSafe={motionSafe} /> : null}
        </span>
        <p
          className={cn(
            "min-w-0 text-xs leading-4 transition-colors",
            error
              ? "text-danger"
              : live
                ? "text-cobalt-bright"
                : "text-foreground",
            done && "font-medium",
          )}
        >
          <span className="sr-only">{KIND_WORD[event.kind]}, </span>
          {event.agent ? (
            <span
              className={cn("font-medium", !error && !live && "text-ink-2")}
            >
              {event.agent}{" "}
            </span>
          ) : null}
          {event.text}
          {live ? <span className="sr-only">, live</span> : null}
        </p>
      </div>
    </motion.li>
  );
}

function GroupRow({
  group,
  open,
  onToggle,
  motionSafe,
}: {
  group: Group;
  open: boolean;
  onToggle: () => void;
  motionSafe: boolean;
}) {
  const { innerRef, height } = useMeasured();
  const count = group.members.length;
  const summary = `${count} ${KIND_WORD[group.kind]}s, ${formatAt(group.from)} to ${formatAt(group.to)}`;
  return (
    <motion.li
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: height ?? "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0, transition: exitFor() }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.base } }
          : { duration: durations.fast, ease: easings.move }
      }
    >
      <div ref={innerRef} className="pb-3">
        <button
          type="button"
          aria-expanded={open}
          aria-label={summary}
          onClick={onToggle}
          className={cn(
            COLUMNS,
            "w-full items-center rounded-2 pr-1 text-left transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="flex h-4 items-center font-mono text-[11px] text-ink-3 tabular-nums">
            {formatAt(group.from)}
          </span>
          <span aria-hidden className="relative flex justify-center">
            <span className="relative z-10 flex h-4 flex-col items-center justify-center gap-0.5 bg-surface-1">
              <span className="size-1 rounded-full bg-ink-3" />
              <span className="size-1 rounded-full bg-ink-3" />
              <span className="size-1 rounded-full bg-ink-3" />
            </span>
            <Spine drawn motionSafe={motionSafe} />
          </span>
          <span className="flex h-4 min-w-0 items-center gap-1.5 text-xs text-ink-2">
            <span className="truncate">
              {count} {KIND_WORD[group.kind]}s
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
              {formatAt(group.from)}–{formatAt(group.to)}
            </span>
            <motion.svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3 shrink-0 text-ink-3"
              initial={false}
              animate={{ rotate: open ? 90 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </motion.svg>
          </span>
        </button>
      </div>
    </motion.li>
  );
}

type Last = {
  kind: "collapsed" | "expanded";
  groups: number;
  at: number;
} | null;

/**
 * A timeline of run events that grows downward. Each row fades in from
 * `distances.nudge` on the enter ease and the spine segment above it draws
 * on `glide`, so the line reaches the new event. While the run is live the
 * last node breathes (opacity only) and its text sits in cobalt; the finish
 * lands on `flick`. Collapse similar folds every run of two or more
 * same-kind events under a header that reads the count: the members fold to
 * zero height on `glide`, each measured by a ResizeObserver so a wrapped line
 * folds by its true height, and a header can reopen its own group while the
 * rest stay folded. Errors and the finish never fold.
 *
 * The list stays flat — every event is its own `<li>` with a stable key — so
 * a row never remounts when it becomes a group member. Headers are real
 * buttons with `aria-expanded`; folded members are inert. The live region
 * speaks the newest event, completion, and a grouping change — once each.
 * Under reduced motion rows appear in place, segments appear whole, the live
 * node holds at mid opacity, and heights change on a tween.
 */
export function RunTimeline({
  ref,
  events,
  live = false,
  collapsed: collapsedProp,
  defaultCollapsed = false,
  onCollapsedChange,
  label,
  className,
}: RunTimelineProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [ownCollapsed, setOwnCollapsed] = React.useState(defaultCollapsed);
  const collapsed = collapsedProp ?? ownCollapsed;
  const [opened, setOpened] = React.useState<Record<string, boolean>>({});
  const [last, setLast] = React.useState<Last>(null);

  const groups = findGroups(events, live);
  const groupOf = new Map<string, Group>();
  groups.forEach((group) =>
    group.members.forEach((id) => groupOf.set(id, group)),
  );

  const toggleAll = () => {
    const next = !collapsed;
    if (collapsedProp === undefined) setOwnCollapsed(next);
    setOpened({});
    setLast({
      kind: next ? "collapsed" : "expanded",
      groups: groups.length,
      at: events.length,
    });
    onCollapsedChange?.(next);
  };

  const newest = events[events.length - 1];
  const finished = newest?.kind === "done";
  const announcement =
    last && last.at === events.length
      ? last.kind === "collapsed"
        ? `Similar events grouped, ${last.groups} ${last.groups === 1 ? "group" : "groups"}`
        : "Groups expanded"
      : finished
        ? `Run complete, ${events.length} events`
        : newest
          ? `${newest.agent ? `${newest.agent}: ` : ""}${newest.text}`
          : "";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-8 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
          <button
            type="button"
            aria-pressed={collapsed}
            disabled={groups.length === 0}
            onClick={toggleAll}
            className={cn(
              "flex h-7 items-center rounded-2 border border-hairline-strong px-2.5 text-[11px] font-medium transition-colors outline-none hover:bg-accent disabled:opacity-50",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              collapsed && "bg-accent",
            )}
          >
            Collapse similar
          </button>
        </span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-ink-3">No events yet.</p>
      ) : (
        <ol aria-labelledby={labelId} className="flex flex-col">
          <AnimatePresence initial={false}>
            {events.flatMap((event, index) => {
              const group = groupOf.get(event.id);
              const isHead = group?.id === event.id;
              const groupOpen = group ? (opened[group.id] ?? false) : true;
              const hidden = collapsed && group !== undefined && !groupOpen;
              const row = (
                <EventRow
                  key={event.id}
                  event={event}
                  live={live && index === events.length - 1}
                  hidden={hidden}
                  last={index === events.length - 1}
                  motionSafe={motionSafe}
                />
              );
              return collapsed && group && isHead
                ? [
                    <GroupRow
                      key={`group:${group.id}`}
                      group={group}
                      open={groupOpen}
                      onToggle={() =>
                        setOpened((prev) => ({
                          ...prev,
                          [group.id]: !groupOpen,
                        }))
                      }
                      motionSafe={motionSafe}
                    />,
                    row,
                  ]
                : [row];
            })}
          </AnimatePresence>
        </ol>
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
