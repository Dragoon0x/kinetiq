"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FolderId = "all" | "unread" | "mentions";

export type FolderChannel = {
  id: string;
  /** Printed after a hash: "returns" reads as #returns. */
  name: string;
  /** The row's second line. */
  preview: string;
  /** Unread messages waiting in the channel. */
  unread: number;
  /** Of those, how many name you. */
  mentions: number;
  /** A muted channel still counts, but its badge stays neutral. */
  muted?: boolean;
};

export type FolderTabsProps = {
  ref?: React.Ref<HTMLDivElement>;
  channels: FolderChannel[];
  /** Controlled folder. */
  value?: FolderId;
  /** Initial folder for uncontrolled usage. @default "all" */
  defaultValue?: FolderId;
  /** Fires from a tab press or an arrow key. */
  onValueChange?: (folder: FolderId) => void;
  /** Controlled open channel id. */
  activeChannel?: string;
  /** Initial open channel for uncontrolled usage. */
  defaultActiveChannel?: string;
  /** Fires from a row press. */
  onChannelSelect?: (id: string) => void;
  /** Tab copy. @default All / Unread / Mentions */
  labels?: Record<FolderId, string>;
  /** Sentence shown when a folder holds nothing. */
  emptyLabels?: Record<FolderId, string>;
  /** Pixels the list grows to before it scrolls. @default 216 */
  maxHeight?: number;
  /** Names the tablist and the list for assistive technology. */
  label: string;
  className?: string;
};

const FOLDERS: FolderId[] = ["all", "unread", "mentions"];

const DEFAULT_LABELS: Record<FolderId, string> = {
  all: "All",
  unread: "Unread",
  mentions: "Mentions",
};

const DEFAULT_EMPTY: Record<FolderId, string> = {
  all: "No channels here yet.",
  unread: "Nothing unread.",
  mentions: "No mentions waiting.",
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The strip's line box, in px. Kept integral so a roll never lands on a float. */
const DIGIT_H = 16;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const inFolder = (channel: FolderChannel, folder: FolderId): boolean =>
  folder === "all" ||
  (folder === "unread" ? channel.unread > 0 : channel.mentions > 0);

/**
 * A count that rolls instead of swapping: each place is a strip of ten digits
 * that slides to the one it should show. No presence key is involved, so two
 * arrivals inside one exit can never put two siblings on the same key.
 */
function RollCount({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const places = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center font-mono text-[10px] tabular-nums",
        className,
      )}
      style={{ height: DIGIT_H }}
    >
      {places.map((place, index) => (
        <span
          key={`place-${places.length - index}`}
          className="relative block w-[0.62em] overflow-hidden"
          style={{ height: DIGIT_H }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: -Number(place) * DIGIT_H }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((digit) => (
              <span
                key={digit}
                className="block"
                style={{ height: DIGIT_H, lineHeight: `${DIGIT_H}px` }}
              >
                {digit}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** One sentence, built in one string, so the name algorithm cannot join two.
 *  Muted is spoken rather than left to the neutral badge. */
const rowLabel = (channel: FolderChannel): string => {
  const marks = [`#${channel.name}`];
  if (channel.muted) marks.push("muted");
  if (channel.unread > 0) marks.push(`${channel.unread} unread`);
  if (channel.mentions > 0) {
    marks.push(
      `${channel.mentions} mention${channel.mentions === 1 ? "" : "s"}`,
    );
  }
  return `${marks.join(", ")}. ${channel.preview}.`;
};

/**
 * Three folders over one channel list. The indicator is a single pill keyed by a
 * `useId()`-prefixed `layoutId`, so it glides from folder to folder on `snap`
 * rather than three pills blinking, and switching re-filters the list beneath it:
 * rows that stay carry `layout` and travel to their new places on `glide`, rows
 * that no longer match leave on the exit ease, and rows that join arrive from
 * 4px. Each tab's count is a strip of digits that rolls on `snap` — no presence
 * key, so two arrivals inside one exit cannot collide — and the list box animates
 * to a ResizeObserver-measured height, capped at `maxHeight`, so a folder holding
 * one row closes to one row instead of leaving dead space.
 *
 * The tabs are a real tablist with a roving tabindex: Left and Right move and
 * activate, Home and End jump. Every tab and every row is named by a single
 * sentence, and a status region reads the folder you switched to and the channel
 * you opened. Under reduced motion the pill appears under its tab, the rows stop
 * travelling and the counts swap, because a count is information.
 */
export function FolderTabs({
  ref,
  channels,
  value,
  defaultValue = "all",
  onValueChange,
  activeChannel,
  defaultActiveChannel,
  onChannelSelect,
  labels = DEFAULT_LABELS,
  emptyLabels = DEFAULT_EMPTY,
  maxHeight = 216,
  label,
  className,
}: FolderTabsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const pillId = `${baseId}-pill`;
  const panelId = `${baseId}-panel`;
  const tabId = (folder: FolderId) => `${baseId}-tab-${folder}`;

  const [ownFolder, setOwnFolder] = React.useState<FolderId>(defaultValue);
  const folder = value ?? ownFolder;
  const [ownChannel, setOwnChannel] = React.useState(
    () => defaultActiveChannel ?? channels[0]?.id ?? "",
  );
  const openChannel = activeChannel ?? ownChannel;
  const [said, setSaid] = React.useState("");

  const counts: Record<FolderId, number> = {
    all: channels.length,
    unread: channels.filter((channel) => channel.unread > 0).length,
    mentions: channels.filter((channel) => channel.mentions > 0).length,
  };
  const rows = channels.filter((channel) => inFolder(channel, folder));

  // The box follows its content: measured on observe and on every reflow, so
  // the height is honest at any column width and nothing is measured in render.
  const innerRef = React.useRef<HTMLOListElement | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // "auto" until the first measurement, so the server's markup is already the
  // right shape. The first number is written outright — given a first target
  // after a string, motion treats it as current and paints nothing.
  const height = useMotionValue<number | string>("auto");
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (content === null) return;
    // The border box carries the box's own hairlines.
    const target = Math.min(content + 2, maxHeight);
    if (!seeded.current) {
      seeded.current = true;
      height.set(target);
      return;
    }
    const controls = animate(
      height,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [content, maxHeight, height, motionSafe]);

  const pick = (next: FolderId) => {
    if (value === undefined) setOwnFolder(next);
    const shown = channels.filter((channel) => inFolder(channel, next)).length;
    setSaid(
      `${labels[next]}, ${shown} ${shown === 1 ? "channel" : "channels"}.`,
    );
    if (next !== folder) onValueChange?.(next);
  };

  const focusTab = (index: number) => {
    const next = FOLDERS[(index + FOLDERS.length) % FOLDERS.length];
    if (!next) return;
    document.getElementById(tabId(next))?.focus();
    pick(next);
  };

  const handleTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: FOLDERS.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    focusTab(to);
  };

  const openRow = (channel: FolderChannel) => {
    if (activeChannel === undefined) setOwnChannel(channel.id);
    setSaid(`Opened #${channel.name}.`);
    onChannelSelect?.(channel.id);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div
        role="tablist"
        aria-label={label}
        className="flex items-center gap-1 rounded-full border border-hairline bg-surface-2 p-1"
      >
        {FOLDERS.map((id, index) => {
          const selected = id === folder;
          const count = counts[id];
          return (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              aria-label={`${labels[id]}, ${count} ${count === 1 ? "channel" : "channels"}`}
              onClick={() => pick(id)}
              onKeyDown={(event) => handleTabKey(event, index)}
              className={cn(
                "relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors",
                selected
                  ? "text-foreground"
                  : "text-ink-3 hover:text-foreground",
                focusRing,
              )}
            >
              {/* Without a layoutId the pill simply appears under its tab,
                  which is the reduced-motion state rather than a second node. */}
              {selected && (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? pillId : undefined}
                  transition={springs.snap}
                  className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                />
              )}
              <span className="relative">{labels[id]}</span>
              <RollCount
                value={count}
                motionSafe={motionSafe}
                className={cn(
                  "relative",
                  selected ? "text-cobalt-bright" : "text-ink-3",
                )}
              />
            </button>
          );
        })}
      </div>

      <motion.div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(folder)}
        tabIndex={0}
        style={{ height, maxHeight }}
        className={cn(
          "overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1",
          focusRing,
        )}
      >
        <ol
          ref={innerRef}
          role="list"
          className="relative flex flex-col gap-1 p-1.5"
        >
          {/* popLayout takes a leaving row out of flow at once, so the rows
              below start their FLIP with it rather than after it. */}
          <AnimatePresence initial={false} mode="popLayout">
            {rows.length === 0 ? (
              <motion.li
                key="empty"
                layout={motionSafe}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
                className="px-2 py-6 text-center text-xs text-ink-3"
              >
                {emptyLabels[folder]}
              </motion.li>
            ) : (
              rows.map((channel) => {
                const current = channel.id === openChannel;
                return (
                  <motion.li
                    key={channel.id}
                    layout={motionSafe}
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, opacity: fade }
                        : { duration: durations.fast }
                    }
                  >
                    <button
                      type="button"
                      aria-current={current ? "true" : undefined}
                      aria-label={rowLabel(channel)}
                      onClick={() => openRow(channel)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-2 px-2 py-1.5 text-left transition-colors",
                        current
                          ? "bg-cobalt-wash text-foreground"
                          : "hover:bg-accent",
                        focusRing,
                      )}
                    >
                      <span aria-hidden className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-xs",
                            channel.unread > 0
                              ? "font-semibold text-foreground"
                              : "font-medium text-ink-2",
                          )}
                        >
                          #{channel.name}
                        </span>
                        <span className="block truncate text-[11px] text-ink-3">
                          {channel.preview}
                        </span>
                      </span>
                      {channel.mentions > 0 && (
                        <span
                          aria-hidden
                          className="font-mono text-[10px] font-semibold text-signal"
                        >
                          @{channel.mentions}
                        </span>
                      )}
                      {channel.unread > 0 && (
                        <span
                          aria-hidden
                          className={cn(
                            "flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-semibold",
                            channel.muted
                              ? "border border-hairline-strong bg-surface-2 text-ink-2"
                              : "bg-primary text-primary-foreground",
                          )}
                        >
                          <RollCount
                            value={channel.unread}
                            motionSafe={motionSafe}
                          />
                        </span>
                      )}
                    </button>
                  </motion.li>
                );
              })
            )}
          </AnimatePresence>
        </ol>
      </motion.div>

      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}
