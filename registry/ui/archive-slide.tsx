"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ArchiveChannel = {
  id: string;
  /** Printed after a hash: "returns" reads as #returns. */
  name: string;
  /** The row's second line. */
  preview: string;
  unread?: number;
};

export type ArchiveSlideProps = {
  ref?: React.Ref<HTMLDivElement>;
  channels: ArchiveChannel[];
  /** Controlled archived ids; those rows leave the list. */
  archived?: string[];
  /** Initial archived ids for uncontrolled usage. @default [] */
  defaultArchived?: string[];
  /** Fires with the next set from an archive or an undo. */
  onArchivedChange?: (ids: string[]) => void;
  /** Fires when a row commits, from the gesture or the button. */
  onArchive?: (id: string) => void;
  /** Fires from the undo chip. */
  onRestore?: (id: string) => void;
  /** Controlled open channel id. */
  activeChannel?: string;
  /** Initial open channel for uncontrolled usage. */
  defaultActiveChannel?: string;
  /** Fires from a row press that was a press, not a drag. */
  onChannelSelect?: (id: string) => void;
  /** Pixels of travel that commit the archive. @default 88 */
  threshold?: number;
  /** The parked action's copy. @default "Archive" */
  actionLabel?: string;
  /** Shown when every channel is archived. */
  emptyLabel?: string;
  /** Names the list for assistive technology. */
  label: string;
  className?: string;
};

const NONE: string[] = [];

/** Horizontal travel that claims the gesture. Under it a press is still a press
 *  and a vertical drag still belongs to whatever scrolls behind. */
const CLAIM = 4;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const enterFrom = (motionSafe: boolean) =>
  motionSafe ? { opacity: 0, x: -distances.nudge } : { opacity: 0 };

/**
 * Watches a node and hands back a height that glides to whatever it measures.
 * Nothing is read during render, and the first measurement is written outright:
 * given a first target after a string, motion treats it as current and paints
 * nothing.
 */
function useMeasuredHeight<T extends HTMLElement>(
  motionSafe: boolean,
  from: number | string,
) {
  const ref = React.useRef<T | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  const height = useMotionValue<number | string>(from);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (content === null) return;
    if (!seeded.current) {
      seeded.current = true;
      height.set(content);
      return;
    }
    const controls = animate(
      height,
      content,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [content, height, motionSafe]);

  return [ref, height] as const;
}

/** One sentence, built in one string, so the name algorithm cannot join two. */
const rowLabel = (channel: ArchiveChannel): string => {
  const unread = channel.unread ?? 0;
  const head =
    unread > 0 ? `#${channel.name}, ${unread} unread` : `#${channel.name}`;
  return `${head}. ${channel.preview}.`;
};

/** The parked action and the row's own button draw the same box. */
function ArchiveGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4", className)}
    >
      <path d="M2.5 3.5h11v3h-11z" />
      <path d="M4 6.5v6h8v-6" />
      <path d="M6.5 9h3" />
    </svg>
  );
}

type RowProps = {
  channel: ArchiveChannel;
  rowId: string;
  current: boolean;
  entering: boolean;
  threshold: number;
  actionLabel: string;
  motionSafe: boolean;
  onOpen: (id: string) => void;
  onCommit: (id: string, hadFocus: boolean) => void;
};

/**
 * One row and the action parked under it. The gesture is held in motion values
 * rather than state, so following the pointer costs no re-render and the parked
 * glyph can grow straight from the travel.
 */
function ArchiveRow({
  channel,
  rowId,
  current,
  entering,
  threshold,
  actionLabel,
  motionSafe,
  onOpen,
  onCommit,
}: RowProps) {
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const grab = React.useRef<{ x: number; y: number } | null>(null);
  const claimed = React.useRef(false);
  const moved = React.useRef(false);
  const leaving = React.useRef(false);
  const controls = React.useRef<{ stop: () => void } | null>(null);

  React.useEffect(() => () => controls.current?.stop(), []);

  // The pane earns its ink with the travel: nothing at rest, full at the point
  // where a release would commit, so the threshold is felt before the lift.
  const paneOpacity = useTransform(x, [-24, -4], [1, 0], { clamp: true });
  const glyphScale = useTransform(
    x,
    [-threshold, -threshold * 0.55],
    [1, 0.6],
    { clamp: true },
  );

  const settle = (to: number) => {
    controls.current?.stop();
    controls.current = animate(
      x,
      to,
      motionSafe ? springs.snap : { duration: durations.fast },
    );
  };

  const commit = (hadFocus: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    controls.current?.stop();
    const done = () => onCommit(channel.id, hadFocus);
    const tween = exitFor(durations.base);
    if (!motionSafe) {
      // Nothing travels: the row fades where it stands and the list closes.
      controls.current = animate(opacity, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: done,
      });
      return;
    }
    // A row leaving is an exit, and exits never spring: the tween accelerates
    // it off the edge while the fade takes the last of it.
    const width = surfaceRef.current?.offsetWidth ?? 320;
    animate(opacity, 0, tween);
    controls.current = animate(x, -width, { ...tween, onComplete: done });
  };

  const holdsFocus = () =>
    surfaceRef.current?.contains(document.activeElement) ?? false;

  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!grab.current) return;
    if (claimed.current) {
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // A synthetic sweep can lift a pointer the element never captured.
      }
    }
    const travelled = x.get();
    grab.current = null;
    claimed.current = false;
    if (travelled <= -threshold) commit(holdsFocus());
    else settle(0);
  };

  return (
    <motion.li
      layout={motionSafe}
      // Only a restored row animates in: rows already there on the first paint
      // must render as the server drew them.
      initial={entering ? enterFrom(motionSafe) : false}
      animate={{ opacity: 1, x: 0 }}
      transition={motionSafe ? springs.glide : { duration: durations.fast }}
      className="relative overflow-hidden rounded-2 bg-cobalt-wash"
    >
      <motion.span
        aria-hidden
        style={{ opacity: paneOpacity }}
        className="absolute inset-y-0 right-0 flex w-20 flex-col items-center justify-center gap-0.5 text-cobalt-bright"
      >
        <motion.span
          className="grid size-4 place-items-center"
          style={{ scale: glyphScale }}
        >
          <ArchiveGlyph />
        </motion.span>
        <span className="text-[10px] font-medium">{actionLabel}</span>
      </motion.span>

      <motion.div
        ref={surfaceRef}
        style={{ x, opacity }}
        className="relative flex touch-pan-y items-center gap-2 bg-card px-2 py-1.5"
        onPointerDown={(event) => {
          if (event.button !== 0 || leaving.current) return;
          grab.current = { x: event.clientX, y: event.clientY };
          claimed.current = false;
          moved.current = false;
          controls.current?.stop();
        }}
        onPointerMove={(event) => {
          const from = grab.current;
          if (!from) return;
          const dx = event.clientX - from.x;
          const dy = event.clientY - from.y;
          if (!claimed.current) {
            // A mostly vertical drag belongs to the page, not to the row.
            if (Math.abs(dy) > CLAIM && Math.abs(dy) >= Math.abs(dx)) {
              grab.current = null;
              return;
            }
            if (Math.abs(dx) < CLAIM) return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Capture is an optimisation; the gesture works without it.
            }
            claimed.current = true;
            moved.current = true;
          }
          x.set(Math.max(-threshold * 1.35, Math.min(0, dx)));
        }}
        onPointerUp={release}
        onPointerCancel={() => {
          if (!grab.current) return;
          grab.current = null;
          claimed.current = false;
          settle(0);
        }}
      >
        <button
          type="button"
          id={rowId}
          aria-current={current ? "true" : undefined}
          aria-label={rowLabel(channel)}
          onClick={() => {
            if (moved.current) {
              moved.current = false;
              return;
            }
            onOpen(channel.id);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Delete" && event.key !== "Backspace") return;
            event.preventDefault();
            commit(true);
          }}
          className={cn(
            "min-w-0 flex-1 rounded-1 text-left transition-colors",
            focusRing,
          )}
        >
          <span
            aria-hidden
            className={cn(
              "block truncate text-xs",
              current
                ? "font-semibold text-cobalt-bright"
                : "font-medium text-foreground",
            )}
          >
            #{channel.name}
          </span>
          <span aria-hidden className="block truncate text-[11px] text-ink-3">
            {channel.preview}
          </span>
        </button>

        {(channel.unread ?? 0) > 0 && (
          <span
            aria-hidden
            className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10px] font-semibold text-primary-foreground tabular-nums"
          >
            {channel.unread}
          </span>
        )}

        <button
          type="button"
          aria-label={`Archive #${channel.name}.`}
          onClick={() => commit(true)}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-1 text-ink-3 transition-colors hover:bg-accent hover:text-foreground",
            focusRing,
          )}
        >
          <ArchiveGlyph />
        </button>
      </motion.div>
    </motion.li>
  );
}

/**
 * A channel list where a row can be pushed aside. Dragging a row left uncovers
 * the one action parked under it, whose glyph grows straight from the travel so
 * the commit point is felt before the finger lifts; releasing short of the
 * threshold returns the row on `snap`, and releasing past it hands the rest of
 * the travel to a tween on the exit ease, because a row leaving is an exit and
 * exits never spring. The row then unmounts and the rows below close the gap on
 * `glide`. An undo chip unfolds in flow at the foot of the list — a measured
 * height, never a card floating over the host's page — and putting a row back
 * returns it to the index it came from, where it arrives from 4px while the list
 * opens for it.
 *
 * The pointer is captured only after 4px of horizontal travel, and only when the
 * drag is more horizontal than vertical, inside try/catch, so a plain press still
 * opens the channel and a scroll still belongs to the page. Nothing needs the
 * gesture: every row carries an archive button, Delete or Backspace on a focused
 * row archives it, and focus lands on the row that took its place. Under reduced
 * motion the row still follows the pointer — direct manipulation is not animation
 * — but nothing springs and a commit fades the row out where it stands.
 */
export function ArchiveSlide({
  ref,
  channels,
  archived,
  defaultArchived = NONE,
  onArchivedChange,
  onArchive,
  onRestore,
  activeChannel,
  defaultActiveChannel,
  onChannelSelect,
  threshold = 88,
  actionLabel = "Archive",
  emptyLabel = "Every channel is archived.",
  label,
  className,
}: ArchiveSlideProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const rowId = (id: string) => `${baseId}-row-${id}`;

  const [ownArchived, setOwnArchived] =
    React.useState<string[]>(defaultArchived);
  const gone = archived ?? ownArchived;
  const [ownChannel, setOwnChannel] = React.useState(
    () => defaultActiveChannel ?? channels[0]?.id ?? "",
  );
  const open = activeChannel ?? ownChannel;

  const [last, setLast] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState("");
  const [focusWish, setFocusWish] = React.useState<{
    id: string;
    tick: number;
  } | null>(null);

  const rows = channels.filter((channel) => !gone.includes(channel.id));

  // Focus is moved a frame after the list has re-rendered without the row, so
  // the element it lands on is the one that took the index.
  React.useEffect(() => {
    if (!focusWish) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(focusWish.id)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [focusWish]);

  const commitArchived = (next: string[]) => {
    if (archived === undefined) setOwnArchived(next);
    onArchivedChange?.(next);
  };

  const archive = (id: string, hadFocus: boolean) => {
    const channel = channels.find((item) => item.id === id);
    if (!channel || gone.includes(id)) return;
    const index = rows.findIndex((item) => item.id === id);
    const nextRow = rows[index + 1] ?? rows[index - 1];
    commitArchived([...gone, id]);
    setLast(id);
    setEntering(null);
    setSaid(`#${channel.name} archived.`);
    onArchive?.(id);
    if (hadFocus) {
      const to = nextRow ? rowId(nextRow.id) : `${baseId}-undo`;
      setFocusWish((prev) => ({ id: to, tick: (prev?.tick ?? 0) + 1 }));
    }
  };

  const restore = () => {
    const id = last !== null && gone.includes(last) ? last : null;
    if (!id) return;
    const channel = channels.find((item) => item.id === id);
    commitArchived(gone.filter((archivedId) => archivedId !== id));
    setEntering(id);
    setSaid(`#${channel?.name ?? id} is back in the list.`);
    onRestore?.(id);
    const to = rowId(id);
    setFocusWish((prev) => ({ id: to, tick: (prev?.tick ?? 0) + 1 }));
    setLast(null);
  };

  const openRow = (id: string) => {
    if (activeChannel === undefined) setOwnChannel(id);
    onChannelSelect?.(id);
  };

  // Both boxes follow their own content: the list so its border closes with the
  // rows that glide up into the gap rather than snapping ahead of them, and the
  // chip so the foot grows by exactly the chip and reserves nothing when there
  // is none.
  const [listRef, listHeight] = useMeasuredHeight<HTMLOListElement>(
    motionSafe,
    "auto",
  );
  const [chipRef, chipHeight] = useMeasuredHeight<HTMLDivElement>(
    motionSafe,
    0,
  );

  // A host that restores the row on its own (or clears the whole set) must not
  // leave an undo chip offering to bring back something already back.
  const pending = last !== null && gone.includes(last) ? last : null;
  const lastName = channels.find((channel) => channel.id === pending)?.name;

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div className="rounded-3 border border-hairline bg-surface-1 p-1.5">
        <motion.div style={{ height: listHeight }} className="overflow-hidden">
          <ol
            ref={listRef}
            role="list"
            aria-label={label}
            className="flex flex-col gap-1"
          >
            {rows.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-ink-3">
                {emptyLabel}
              </li>
            ) : (
              rows.map((channel) => (
                <ArchiveRow
                  key={channel.id}
                  channel={channel}
                  rowId={rowId(channel.id)}
                  current={channel.id === open}
                  entering={entering === channel.id}
                  threshold={threshold}
                  actionLabel={actionLabel}
                  motionSafe={motionSafe}
                  onOpen={openRow}
                  onCommit={archive}
                />
              ))
            )}
          </ol>
        </motion.div>

        <motion.div style={{ height: chipHeight }} className="overflow-hidden">
          <div ref={chipRef} className={pending ? "pt-1.5" : undefined}>
            {pending && (
              <motion.div
                initial={
                  motionSafe ? { opacity: 0, y: -distances.nudge } : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.fast, ease: easings.enter }
                }
                className="flex items-center gap-2 rounded-2 border border-hairline-strong bg-card px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">
                  #{lastName} archived
                </span>
                <button
                  id={`${baseId}-undo`}
                  type="button"
                  aria-label={`Put #${lastName} back in the list.`}
                  onClick={restore}
                  className={cn(
                    "flex h-6 shrink-0 items-center rounded-1 px-2 text-xs font-medium text-cobalt-bright transition-colors hover:bg-accent",
                    focusRing,
                  )}
                >
                  Undo
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}
