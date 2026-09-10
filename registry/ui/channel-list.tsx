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

export type Channel = {
  id: string;
  name: string;
  /** The last line in the room, already trimmed by the host. */
  preview?: string;
  /** How many messages are unread. Zero takes the badge away. */
  unread: number;
  /** A monotonic rank from the host — higher is more recent. Never a clock. */
  activity: number;
  /** A muted room is quiet, not invisible: it dims and still shows its count. */
  muted?: boolean;
};

export type ChannelListProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The rooms. Sorted by `activity`; ties keep the array's order. */
  channels: Channel[];
  /** Controlled id of the open room. */
  value?: string;
  /** Initial open room for uncontrolled usage. @default the most active room */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Fires from a row's bell with the state the host should store. */
  onMuteToggle?: (id: string, muted: boolean) => void;
  /** Fires once per frozen change sentence ("New in Coldbrook yard. 4 unread."). */
  onAnnounce?: (sentence: string) => void;
  /** Names the list for assistive technology. */
  label: string;
  /** Tallest the list grows before it scrolls inside its own box. @default 280 */
  maxHeight?: number;
  /** Drawn when there are no rooms. @default "No rooms yet" */
  emptyLabel?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** The roving grid's moves: rows down the list, columns across a row. */
const MOVE: Record<string, { row?: number; col?: 0 | 1 } | undefined> = {
  ArrowDown: { row: 1 },
  ArrowUp: { row: -1 },
  ArrowRight: { col: 1 },
  ArrowLeft: { col: 0 },
  Home: { row: -Infinity },
  End: { row: Infinity },
};

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

type GlyphProps = { muted: boolean; motionSafe: boolean };

/** A drawn bell. The slash strokes itself on when the room goes quiet — one
 *  path whose length runs 0 → 1, so no `d` is ever interpolated. */
function BellGlyph({ muted, motionSafe }: GlyphProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0">
      <path {...STROKE} d="M4.8 10.6V7.4a3.2 3.2 0 0 1 6.4 0v3.2" />
      <path {...STROKE} d="M3.6 10.6h8.8" />
      <path {...STROKE} d="M6.7 12.6a1.5 1.5 0 0 0 2.6 0" />
      <motion.path
        {...STROKE}
        d="M3.4 3.4 12.6 12.6"
        initial={false}
        animate={{ pathLength: muted ? 1 : 0, opacity: muted ? 1 : 0 }}
        // Reduced motion keeps the slash but stops drawing it: the length
        // snaps and only the opacity crosses.
        transition={
          motionSafe
            ? springs.flick
            : { duration: durations.fast, pathLength: { duration: 0 } }
        }
      />
    </svg>
  );
}

type Seen = { unread: number; muted: boolean };
type Beat = {
  /** What the rooms looked like when this reading was frozen. */
  signature: string;
  map: Record<string, Seen>;
  sentence: string;
  /** One counter per room; changing it replays that badge's landing. */
  bumps: Record<string, number>;
  stamp: number;
};

const signatureOf = (channels: Channel[]): string =>
  channels
    .map((one) => `${one.id}:${one.unread}:${one.muted === true ? 1 : 0}`)
    .join("|");

const mapOf = (channels: Channel[]): Record<string, Seen> => {
  const map: Record<string, Seen> = {};
  for (const one of channels) {
    map[one.id] = { unread: one.unread, muted: one.muted === true };
  }
  return map;
};

/** One string per reading, so no accessible name is spliced from two nodes. */
const rowSentence = (channel: Channel): string => {
  const count =
    channel.unread > 0 ? `, ${channel.unread} unread` : ", nothing unread";
  const quiet = channel.muted ? ", muted" : "";
  const last = channel.preview ? ` Last message: ${channel.preview}` : "";
  return `${channel.name}${count}${quiet}.${last}`;
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
  channel: Channel;
  open: boolean;
  railId: string;
  rowId: string;
  bellId: string;
  /** Changing it replays the badge's landing. */
  bump: number;
  rowTab: number;
  bellTab: number;
  motionSafe: boolean;
  onOpen: () => void;
  onMute: () => void;
  onFocusCell: (col: 0 | 1) => void;
  onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    col: 0 | 1,
  ) => void;
};

function ChannelRow({
  channel,
  open,
  railId,
  rowId,
  bellId,
  bump,
  rowTab,
  bellTab,
  motionSafe,
  onOpen,
  onMute,
  onFocusCell,
  onKeyDown,
}: RowProps) {
  const muted = channel.muted === true;

  // The bump is driven imperatively rather than by a remount: this badge sits
  // inside an AnimatePresence whose `initial={false}` would otherwise swallow
  // the replay for every room that already had unread on first paint. One
  // spring, exactly two keyframes.
  const scale = useMotionValue(1);
  const firstBump = React.useRef(true);
  React.useEffect(() => {
    if (firstBump.current) {
      firstBump.current = false;
      return;
    }
    if (!motionSafe) {
      scale.set(1);
      return;
    }
    scale.set(1.18);
    const controls = animate(scale, 1, springs.recoil);
    return () => controls.stop();
  }, [bump, motionSafe, scale]);

  const cell =
    "transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <motion.li
      // Position-only projection: the row's own contents must not stretch
      // while the list re-forms around it.
      layout={motionSafe ? "position" : false}
      initial={motionSafe ? { opacity: 0, x: distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={motionSafe ? springs.glide : FADE}
      className="flex items-center gap-1"
    >
      <button
        type="button"
        id={rowId}
        tabIndex={rowTab}
        aria-current={open ? "true" : undefined}
        aria-label={rowSentence(channel)}
        onFocus={() => onFocusCell(0)}
        onClick={onOpen}
        onKeyDown={(event) => onKeyDown(event, 0)}
        className={cn(
          "relative flex min-w-0 flex-1 items-center gap-2 rounded-2 py-2 pr-2 pl-3 text-left",
          cell,
          open && "bg-cobalt-wash",
        )}
      >
        {open ? (
          <motion.span
            aria-hidden
            // One rail travels between rows; without motion it is simply drawn
            // on the open row.
            layoutId={motionSafe ? railId : undefined}
            transition={springs.snap}
            className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-cobalt-bright"
          />
        ) : null}

        <span
          aria-hidden
          className={cn(
            "flex min-w-0 flex-1 flex-col transition-opacity",
            muted && "opacity-60",
          )}
        >
          <span
            className={cn(
              "truncate text-sm text-foreground",
              open ? "font-semibold" : "font-medium",
            )}
          >
            {channel.name}
          </span>
          {channel.preview ? (
            <span className="truncate text-xs text-ink-3">
              {channel.preview}
            </span>
          ) : null}
        </span>

        <AnimatePresence initial={false}>
          {channel.unread > 0 ? (
            <motion.span
              key="badge"
              aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={FADE}
              className="shrink-0"
            >
              <motion.span
                style={{ scale }}
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] leading-none font-medium",
                  muted
                    ? "border border-hairline-strong text-ink-3"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {channel.unread}
              </motion.span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </button>

      <button
        type="button"
        id={bellId}
        tabIndex={bellTab}
        aria-pressed={muted}
        aria-label={`${muted ? "Unmute" : "Mute"} ${channel.name}`}
        onFocus={() => onFocusCell(1)}
        onClick={onMute}
        onKeyDown={(event) => onKeyDown(event, 1)}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-2",
          cell,
          muted ? "text-ink-3" : "text-ink-2",
        )}
      >
        <BellGlyph muted={muted} motionSafe={motionSafe} />
      </button>
    </motion.li>
  );
}

/**
 * The rooms you are in, ordered by what just happened in them. Rows carry
 * `layout`, so a room that receives a message climbs to the top and every row it
 * passes trades places on `glide` — the layout spring — rather than jumping. The
 * badge is the second motion: a room whose count grows replays a landing from
 * scale 1.18 on `recoil`, driven imperatively on a motion value so it is exactly
 * two keyframes and survives the `initial={false}` that keeps the list from
 * cascading in on load. The count under it changes without a flourish of its
 * own — one motion idea per component.
 *
 * Muted rooms dim and their badge goes hollow — the count still reads, because
 * muted is quiet rather than invisible — and each row's name is a whole sentence
 * ("Coldbrook yard, 4 unread, muted."), so state is never colour alone. One
 * cobalt rail marks the open room and travels on a `useId`-prefixed `layoutId`.
 * The list is one tab stop under a two-column roving tabindex: Down and Up step
 * rows, Home and End jump to the ends, Right moves to the row's bell and Left
 * comes back. Under reduced motion nothing travels or bounces — the re-sort
 * lands instantly and the count still changes, because unread is information.
 */
export function ChannelList({
  ref,
  channels,
  value,
  defaultValue,
  onValueChange,
  onMuteToggle,
  onAnnounce,
  label,
  maxHeight = 280,
  emptyLabel = "No rooms yet",
  className,
}: ChannelListProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const cellId = (id: string, col: 0 | 1) => `${uid}-${col}-${id}`;

  const sorted = React.useMemo(() => {
    const indexed = channels.map((channel, index) => ({ channel, index }));
    indexed.sort(
      (a, b) => b.channel.activity - a.channel.activity || a.index - b.index,
    );
    return indexed.map((entry) => entry.channel);
  }, [channels]);

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    () => defaultValue ?? sorted[0]?.id ?? "",
  );
  const selected = value ?? uncontrolled;

  // The sentence and the bumps are frozen the moment the rooms differ, so they
  // belong to that change and not to a later unrelated re-render.
  const signature = signatureOf(channels);
  const [beat, setBeat] = React.useState<Beat>(() => ({
    signature,
    map: mapOf(channels),
    sentence: "",
    bumps: {},
    stamp: 0,
  }));
  if (beat.signature !== signature) {
    const bumps = { ...beat.bumps };
    const arrivals: Channel[] = [];
    let quieted: string | null = null;
    let cleared: string | null = null;
    for (const channel of channels) {
      const before = beat.map[channel.id];
      if (before && channel.unread > before.unread) {
        arrivals.push(channel);
        bumps[channel.id] = (bumps[channel.id] ?? 0) + 1;
      }
      if (before && before.muted !== (channel.muted === true)) {
        quieted = `${channel.name} ${channel.muted ? "muted" : "unmuted"}.`;
      }
      if (before && before.unread > 0 && channel.unread === 0) {
        cleared = `${channel.name} is read.`;
      }
    }
    const first = arrivals[0];
    const sentence =
      arrivals.length === 1 && first
        ? `New in ${first.name}. ${first.unread} unread.`
        : arrivals.length > 1
          ? `${arrivals.length} rooms have new messages.`
          : (quieted ?? cleared ?? beat.sentence);
    setBeat({
      signature,
      map: mapOf(channels),
      sentence,
      bumps,
      stamp: beat.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const [active, setActive] = React.useState<{ id: string; col: 0 | 1 } | null>(
    null,
  );
  const focusedId = active?.id ?? selected;
  const activeIndex = Math.max(
    0,
    sorted.findIndex((channel) => channel.id === focusedId),
  );
  const activeCol: 0 | 1 = active?.col ?? 0;

  const focusAt = (index: number, col: 0 | 1) => {
    const clamped = Math.min(sorted.length - 1, Math.max(0, index));
    const channel = sorted[clamped];
    if (!channel) return;
    setActive({ id: channel.id, col });
    document.getElementById(cellId(channel.id, col))?.focus();
  };

  const keyHandler =
    (index: number, col: 0 | 1) =>
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const move = MOVE[event.key];
      if (!move) return;
      event.preventDefault();
      // ±Infinity is Home and End: the clamp inside focusAt turns them into
      // the first and last rows without a second branch.
      focusAt(index + (move.row ?? 0), move.col ?? col);
    };

  const select = (id: string) => {
    if (value === undefined) setUncontrolled(id);
    if (id !== selected) onValueChange?.(id);
  };

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div
        className="overflow-y-auto overscroll-contain"
        style={{ maxHeight: Math.round(maxHeight) }}
      >
        <ol role="list" aria-label={label} className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {sorted.map((channel, index) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                open={channel.id === selected}
                railId={`${uid}-rail`}
                rowId={cellId(channel.id, 0)}
                bellId={cellId(channel.id, 1)}
                bump={beat.bumps[channel.id] ?? 0}
                rowTab={index === activeIndex && activeCol === 0 ? 0 : -1}
                bellTab={index === activeIndex && activeCol === 1 ? 0 : -1}
                motionSafe={motionSafe}
                onOpen={() => select(channel.id)}
                onMute={() =>
                  onMuteToggle?.(channel.id, channel.muted !== true)
                }
                onFocusCell={(col) => setActive({ id: channel.id, col })}
                onKeyDown={(event, col) => keyHandler(index, col)(event)}
              />
            ))}
          </AnimatePresence>
        </ol>

        {sorted.length === 0 ? (
          <p className="px-3 py-3 text-sm text-ink-3">{emptyLabel}</p>
        ) : null}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
