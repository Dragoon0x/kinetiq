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

export type MemberStatus = "online" | "away" | "busy" | "offline";

export type Member = {
  id: string;
  name: string;
  status: MemberStatus;
  /** A short line under the name ("on dock three"); spoken with the row. */
  note?: string;
};

export type MemberListProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The room. Sorted into two groups; ties keep the array's order. */
  members: Member[];
  /** Names the roster for assistive technology. */
  label: string;
  /** The two headings. */
  groupLabels?: { online: string; offline: string };
  /** Fires from a row's click, Enter or Space. */
  onSelect?: (id: string) => void;
  /** Fires once per frozen change sentence ("Rui Baptista is online"). */
  onAnnounce?: (sentence: string) => void;
  /** Drawn when the room is empty. @default "No one is here" */
  emptyLabel?: string;
  className?: string;
};

const WORD: Record<MemberStatus, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
};

const TONE: Record<MemberStatus, string> = {
  online: "bg-success",
  away: "bg-warn",
  busy: "bg-danger",
  offline: "bg-muted-foreground",
};

/** Sort weight inside a group; ties fall back to the caller's order. */
const RANK: Record<MemberStatus, number> = {
  online: 0,
  busy: 1,
  away: 2,
  offline: 3,
};

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const rowSentence = (member: Member): string =>
  member.note
    ? `${member.name}, ${WORD[member.status].toLowerCase()}, ${member.note}`
    : `${member.name}, ${WORD[member.status].toLowerCase()}`;

type Snapshot = Record<string, { status: MemberStatus; name: string }>;

const snapshotOf = (members: Member[]): Snapshot => {
  const map: Snapshot = {};
  for (const member of members) {
    map[member.id] = { status: member.status, name: member.name };
  }
  return map;
};

const sameSnapshot = (a: Snapshot, b: Snapshot): boolean => {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key]?.status === b[key]?.status);
};

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type RowProps = {
  member: Member;
  rowId: string;
  layoutId: string;
  tabIndex: number;
  washing: boolean;
  washKey: number;
  motionSafe: boolean;
  onFocusRow: () => void;
  onSelect?: (id: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

function MemberRow({
  member,
  rowId,
  layoutId,
  tabIndex,
  washing,
  washKey,
  motionSafe,
  onFocusRow,
  onSelect,
  onKeyDown,
}: RowProps) {
  return (
    <motion.li
      // Position-only projection: the frame around this list is animating its
      // own height, and a full layout projection would stretch the row's
      // contents against it.
      layout={motionSafe ? "position" : false}
      // The same person moving between the two lists is the same row, so it
      // travels on a shared layoutId rather than blinking out of one and into
      // the other; the fade underneath it is only the ghost clearing.
      layoutId={motionSafe ? layoutId : undefined}
      initial={
        motionSafe ? { opacity: 0, x: distances.step } : { opacity: 0, x: 0 }
      }
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.enter }
      }
      className="relative"
    >
      <button
        type="button"
        id={rowId}
        tabIndex={tabIndex}
        aria-label={rowSentence(member)}
        onClick={() => {
          onFocusRow();
          onSelect?.(member.id);
        }}
        onFocus={onFocusRow}
        onKeyDown={onKeyDown}
        className={cn(
          "relative flex w-full items-center gap-3 overflow-hidden rounded-2 px-2 py-2 text-left transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {washing ? (
          <motion.span
            key={washKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cobalt-wash"
            initial={
              motionSafe
                ? { opacity: 0.9, x: "-100%" }
                : { opacity: 0.7, x: "0%" }
            }
            animate={{ opacity: 0, x: "0%" }}
            transition={{
              duration: motionSafe ? durations.page : durations.base,
              ease: easings.move,
            }}
          />
        ) : null}

        <span
          aria-hidden
          className="relative grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface-2 text-[11px] font-semibold text-ink-2"
        >
          {initialsOf(member.name)}
        </span>

        <span className="relative flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-foreground">
            {member.name}
          </span>
          {member.note ? (
            <span className="truncate text-xs text-ink-3">{member.note}</span>
          ) : null}
        </span>

        {/* The word carries the state; the dot only reinforces it. */}
        <span
          aria-hidden
          className="relative flex shrink-0 items-center gap-1.5 text-[11px] text-ink-3"
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full transition-colors",
              TONE[member.status],
              member.status === "offline" && "opacity-70",
            )}
          />
          {WORD[member.status]}
        </span>
      </button>
    </motion.li>
  );
}

/**
 * Who is in the room, in two groups. Rows carry `layout`, so a change of state
 * re-sorts them on `glide` instead of jumping, and each row carries a
 * `useId`-prefixed `layoutId` so a member crossing from offline to online
 * travels between the two lists as one row rather than blinking out of one and
 * into the other. An arrival slides `distances.step` in and a cobalt wash
 * sweeps across it once, replayed by a key rather than a timer; a departure
 * only fades on the exit ease, because leaving never celebrates.
 *
 * The frame's height comes from a ResizeObserver bound to the inner column when
 * the node arrives, so an empty group reserves nothing. Rows are real buttons
 * under a roving tabindex — Down and Up step through both groups in visual
 * order, Home and End jump to the ends — and every row's name is a sentence
 * ("Marta Ferreira, away, on dock three"), so presence is never colour alone. A
 * polite status region speaks each change once. Under reduced motion nothing
 * travels: rows cross-fade, the wash becomes a single tint, and the frame
 * changes height on a tween.
 */
export function MemberList({
  ref,
  members,
  label,
  groupLabels = { online: "In the room", offline: "Offline" },
  onSelect,
  onAnnounce,
  emptyLabel = "No one is here",
  className,
}: MemberListProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const rowId = (id: string) => `${uid}-row-${id}`;

  const sorted = React.useMemo(() => {
    const indexed = members.map((member, index) => ({ member, index }));
    indexed.sort(
      (a, b) =>
        RANK[a.member.status] - RANK[b.member.status] || a.index - b.index,
    );
    return indexed.map((entry) => entry.member);
  }, [members]);

  const here = sorted.filter((member) => member.status !== "offline");
  const gone = sorted.filter((member) => member.status === "offline");
  const order = [...here, ...gone];

  // The change is frozen the moment the snapshot differs, so the sentence and
  // the wash belong to that change and not to a later unrelated re-render.
  const snapshot = snapshotOf(members);
  const [seen, setSeen] = React.useState(() => ({
    map: snapshot,
    sentence: "",
    wash: [] as string[],
    stamp: 0,
  }));
  if (!sameSnapshot(seen.map, snapshot)) {
    const sentences: string[] = [];
    const wash: string[] = [];
    for (const member of members) {
      const before = seen.map[member.id];
      if (!before) {
        sentences.push(`${member.name} joined`);
        wash.push(member.id);
      } else if (before.status !== member.status) {
        sentences.push(
          `${member.name} is ${WORD[member.status].toLowerCase()}`,
        );
        if (before.status === "offline") wash.push(member.id);
      }
    }
    for (const [id, before] of Object.entries(seen.map)) {
      if (!snapshot[id]) sentences.push(`${before.name} left`);
    }
    setSeen({
      map: snapshot,
      sentence:
        sentences.length === 1
          ? (sentences[0] ?? "")
          : sentences.length > 1
            ? `${sentences.length} members changed`
            : seen.sentence,
      wash,
      stamp: seen.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (seen.sentence) announceRef.current?.(seen.sentence);
  }, [seen.stamp, seen.sentence, announceRef]);

  const [activeId, setActiveId] = React.useState<string | undefined>(undefined);
  const activeIndex = Math.max(
    0,
    order.findIndex((member) => member.id === activeId),
  );

  const focusAt = (index: number) => {
    const clamped = Math.min(order.length - 1, Math.max(0, index));
    const member = order[clamped];
    if (!member) return;
    setActiveId(member.id);
    document.getElementById(rowId(member.id))?.focus();
  };

  const keyHandler =
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(index + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(order.length - 1);
      }
    };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const groups: { key: "online" | "offline"; head: string; items: Member[] }[] =
    [
      { key: "online", head: groupLabels.online, items: here },
      { key: "offline", head: groupLabels.offline, items: gone },
    ];

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="flex flex-col gap-3 p-1">
          <AnimatePresence initial={false}>
            {groups.map((group) =>
              group.items.length === 0 ? null : (
                <motion.div
                  key={group.key}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    duration: durations.fast,
                    ease: easings.enter,
                  }}
                  role="group"
                  aria-labelledby={`${uid}-${group.key}`}
                  className="flex flex-col gap-1"
                >
                  <h4
                    id={`${uid}-${group.key}`}
                    className="flex items-baseline gap-1.5 px-2 text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase"
                  >
                    {group.head}
                    <span className="font-mono tabular-nums">
                      {group.items.length}
                    </span>
                  </h4>
                  <ol
                    role="list"
                    aria-label={`${label}, ${group.head}, ${group.items.length}`}
                    className="flex flex-col"
                  >
                    <AnimatePresence initial={false}>
                      {group.items.map((member) => (
                        <MemberRow
                          key={member.id}
                          member={member}
                          rowId={rowId(member.id)}
                          layoutId={`${uid}-member-${member.id}`}
                          tabIndex={
                            order[activeIndex]?.id === member.id ? 0 : -1
                          }
                          washing={seen.wash.includes(member.id)}
                          washKey={seen.stamp}
                          motionSafe={motionSafe}
                          onFocusRow={() => setActiveId(member.id)}
                          onSelect={onSelect}
                          onKeyDown={keyHandler(
                            order.findIndex((one) => one.id === member.id),
                          )}
                        />
                      ))}
                    </AnimatePresence>
                  </ol>
                </motion.div>
              ),
            )}
          </AnimatePresence>

          {order.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-3">{emptyLabel}</p>
          ) : null}
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.sentence}
      </span>
    </div>
  );
}
