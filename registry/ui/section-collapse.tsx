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

export type SectionChannel = {
  id: string;
  /** A room prints after a hash; a direct room prints as the person's name. */
  name: string;
  unread?: number;
  direct?: boolean;
  muted?: boolean;
};

export type RoomSection = {
  id: string;
  title: string;
  channels: SectionChannel[];
};

export type SectionCollapseProps = {
  ref?: React.Ref<HTMLDivElement>;
  sections: RoomSection[];
  /** Controlled ids of the unfolded sections. */
  open?: string[];
  /** Initial unfolded ids for uncontrolled usage. Defaults to every section. */
  defaultOpen?: string[];
  /** Fires from the press or key that folded or unfolded a section. */
  onOpenChange?: (id: string, open: boolean) => void;
  /** Controlled selected channel id. */
  activeChannel?: string;
  /** Initial selected channel for uncontrolled usage. */
  defaultActiveChannel?: string;
  /** Fires from a row press. */
  onChannelSelect?: (id: string) => void;
  /** Shown inside a section that holds no channels. */
  emptyLabel?: string;
  /** Names the whole sidebar for assistive technology. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** The strip's line box, in px. Kept integral so a roll never lands on a float. */
const DIGIT_H = 16;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const unreadIn = (section: RoomSection): number =>
  section.channels.reduce((total, channel) => total + (channel.unread ?? 0), 0);

const printed = (channel: SectionChannel): string =>
  channel.direct ? channel.name : `#${channel.name}`;

/** One sentence, built in one string, so the name algorithm cannot join two.
 *  Muted is spoken rather than left to the dimmer ink. */
const rowLabel = (channel: SectionChannel): string => {
  const marks = [printed(channel)];
  if (channel.muted) marks.push("muted");
  const unread = channel.unread ?? 0;
  if (unread > 0) marks.push(`${unread} unread`);
  return `${marks.join(", ")}.`;
};

const headerLabel = (section: RoomSection, open: boolean): string => {
  const count = section.channels.length;
  const rooms = `${count} ${count === 1 ? "channel" : "channels"}`;
  if (open) return `${section.title}, unfolded, ${rooms}.`;
  const unread = unreadIn(section);
  return unread > 0
    ? `${section.title}, folded, ${unread} unread inside.`
    : `${section.title}, folded, ${rooms}.`;
};

/**
 * A count that rolls instead of swapping: each place is a strip of ten digits
 * that slides to the one it should show. No presence key is involved, so two
 * arrivals inside one exit can never put two siblings on the same key.
 */
function RollCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const places = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className="flex items-center font-mono text-[10px] font-semibold tabular-nums"
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

type SectionProps = {
  section: RoomSection;
  open: boolean;
  headerId: string;
  activeChannel: string;
  emptyLabel: string;
  motionSafe: boolean;
  onToggle: () => void;
  onHeaderKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (id: string) => void;
};

/**
 * One section that measures its own body. The fold is a height rather than a
 * `display` swap, so it can travel: open is the body's border box from a
 * ResizeObserver and folded is zero, joined on `glide`.
 */
function Section({
  section,
  open,
  headerId,
  activeChannel,
  emptyLabel,
  motionSafe,
  onToggle,
  onHeaderKey,
  onSelect,
}: SectionProps) {
  const bodyId = React.useId();
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  const unread = unreadIn(section);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // Fires once on observe and again on reflow, so the open height stays
    // honest when the column narrows; nothing is measured during render.
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // "auto" until the first measurement, so the server's markup already has the
  // right shape. The first number is written outright — given a first target
  // after a string, motion treats it as current and paints nothing.
  const height = useMotionValue<number | string>(open ? "auto" : 0);
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (content === null) return;
    const target = open ? content : 0;
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
  }, [content, open, height, motionSafe]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div>
      <button
        id={headerId}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={headerLabel(section, open)}
        onClick={onToggle}
        onKeyDown={onHeaderKey}
        className={cn(
          "flex h-8 w-full items-center gap-1.5 rounded-2 px-1.5 transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <motion.svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5 shrink-0 text-ink-3"
          style={{ originX: 0.5, originY: 0.5 }}
          initial={false}
          animate={{ rotate: open ? 0 : -90 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <path d="m4 6.5 4 4 4-4" />
        </motion.svg>
        <span
          aria-hidden
          className="min-w-0 flex-1 truncate text-left font-mono text-[10px] font-semibold tracking-[0.08em] text-ink-2 uppercase"
        >
          {section.title}
        </span>
        {/* The count only surfaces while the rows that carry it are folded
            away; unfolding drops it, because each row says its own again. */}
        <AnimatePresence initial={false}>
          {!open && unread > 0 && (
            <motion.span
              key="tally"
              className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-primary-foreground"
              initial={
                motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: fade }
                  : { duration: durations.fast }
              }
            >
              <RollCount value={unread} motionSafe={motionSafe} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <motion.div style={{ height }} className="overflow-hidden">
        <motion.div
          ref={innerRef}
          id={bodyId}
          role="region"
          aria-labelledby={headerId}
          aria-hidden={!open}
          // The body clips at zero height, so the rows keep 4px of inset for
          // their focus rings to draw in.
          className="px-1 pt-1 pb-1.5"
          initial={false}
          animate={{ opacity: open ? 1 : 0 }}
          transition={fade}
        >
          {section.channels.length === 0 ? (
            <p className="px-2 py-2 text-xs text-ink-3">{emptyLabel}</p>
          ) : (
            <ol role="list" className="flex flex-col gap-0.5">
              {section.channels.map((channel) => {
                const current = channel.id === activeChannel;
                const unreadHere = channel.unread ?? 0;
                return (
                  <li key={channel.id}>
                    <button
                      type="button"
                      tabIndex={open ? 0 : -1}
                      aria-current={current ? "true" : undefined}
                      aria-label={rowLabel(channel)}
                      onClick={() => onSelect(channel.id)}
                      className={cn(
                        "flex h-7 w-full items-center gap-2 rounded-2 pr-1.5 pl-6 text-left transition-colors",
                        current ? "bg-cobalt-wash" : "hover:bg-accent",
                        focusRing,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs",
                          unreadHere > 0
                            ? "font-semibold text-foreground"
                            : channel.muted
                              ? "text-ink-3"
                              : "text-ink-2",
                        )}
                      >
                        {printed(channel)}
                      </span>
                      {unreadHere > 0 && (
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1",
                            channel.muted
                              ? "border border-hairline-strong bg-surface-2 text-ink-2"
                              : "bg-primary text-primary-foreground",
                          )}
                        >
                          <RollCount
                            value={unreadHere}
                            motionSafe={motionSafe}
                          />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * A sidebar of sections that fold their own rooms. A header press joins the
 * body to zero on `glide`, the layout spring, against a height a ResizeObserver
 * measured from the body's own content, so the fold is exact at any column width
 * and nothing reserves room for rows that are not showing. The caret turns a
 * quarter on `snap` and the rows fade on a tween rather than sliding, so the
 * section reads as closing rather than as content escaping. What the fold would
 * hide comes back to the header: the unread inside rises into a badge from 4px
 * on `snap`, its digits rolling in a strip, and unfolding drops it on the exit
 * ease because every row is about to carry its own count again.
 *
 * Each header is a real disclosure — `aria-expanded`, `aria-controls`, and a
 * name that is one sentence including the count — Down and Up move between
 * headers while Home and End jump, and a folded body is hidden from assistive
 * technology and taken out of the tab order rather than merely clipped. A status
 * region says what folded and what is waiting inside it, frozen as it happens.
 * Under reduced motion the heights swap, the caret turns without a spring and
 * the badge fades in place, but every count still updates, because what is
 * waiting behind a fold is information.
 */
export function SectionCollapse({
  ref,
  sections,
  open,
  defaultOpen,
  onOpenChange,
  activeChannel,
  defaultActiveChannel,
  onChannelSelect,
  emptyLabel = "No rooms in here yet.",
  label,
  className,
}: SectionCollapseProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const headerId = (id: string) => `${baseId}-head-${id}`;

  const [ownOpen, setOwnOpen] = React.useState<string[]>(
    () => defaultOpen ?? sections.map((section) => section.id),
  );
  const openIds = open ?? ownOpen;
  const [ownChannel, setOwnChannel] = React.useState(
    () => defaultActiveChannel ?? sections[0]?.channels[0]?.id ?? "",
  );
  const current = activeChannel ?? ownChannel;
  const [said, setSaid] = React.useState("");

  const toggle = (section: RoomSection) => {
    const next = !openIds.includes(section.id);
    if (open === undefined) {
      setOwnOpen((prev) =>
        next
          ? prev.includes(section.id)
            ? prev
            : [...prev, section.id]
          : prev.filter((id) => id !== section.id),
      );
    }
    const count = section.channels.length;
    const rooms = `${count} ${count === 1 ? "channel" : "channels"}`;
    const unread = unreadIn(section);
    setSaid(
      next
        ? `${section.title} unfolded, ${rooms}.`
        : unread > 0
          ? `${section.title} folded, ${unread} unread inside.`
          : `${section.title} folded, ${rooms}.`,
    );
    onOpenChange?.(section.id, next);
  };

  const focusHeader = (index: number) => {
    const section = sections[Math.min(sections.length - 1, Math.max(0, index))];
    if (!section) return;
    document.getElementById(headerId(section.id))?.focus();
  };

  const headerKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    // Arrows only move: the headers stay ordinary tab stops, so Tab still
    // reaches the rows inside an unfolded section.
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: sections.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    focusHeader(to);
  };

  const select = (id: string) => {
    if (activeChannel === undefined) setOwnChannel(id);
    onChannelSelect?.(id);
  };

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div
        role="group"
        aria-label={label}
        className="flex flex-col gap-0.5 rounded-3 border border-hairline bg-surface-1 p-1.5"
      >
        {sections.map((section, index) => (
          <Section
            key={section.id}
            section={section}
            open={openIds.includes(section.id)}
            headerId={headerId(section.id)}
            activeChannel={current}
            emptyLabel={emptyLabel}
            motionSafe={motionSafe}
            onToggle={() => toggle(section)}
            onHeaderKey={(event) => headerKey(event, index)}
            onSelect={select}
          />
        ))}
      </div>

      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}
