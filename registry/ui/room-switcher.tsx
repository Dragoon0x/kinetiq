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

export type SwitcherRoom = {
  id: string;
  /** A room prints after a hash; a direct room prints as the person's name. */
  name: string;
  /** The room's one-line subject. */
  topic: string;
  /** The room's most recent line. */
  last: string;
  /** Who wrote that line. */
  by: string;
  direct?: boolean;
  unread?: number;
};

export type RoomSwitcherProps = {
  ref?: React.Ref<HTMLDivElement>;
  rooms: SwitcherRoom[];
  /** Controlled room id. */
  value?: string;
  /** Initial room id for uncontrolled usage; defaults to the first room. */
  defaultValue?: string;
  /** Fires from Enter or an option press. */
  onValueChange?: (id: string) => void;
  /** Controlled panel state. */
  open?: boolean;
  /** Initial panel state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the hotkey, the trigger, Escape, the scrim, or a chosen room. */
  onOpenChange?: (open: boolean) => void;
  /** Fires from every keystroke with the trimmed query and how many matched. */
  onQueryChange?: (query: string, matches: number) => void;
  /** The key that raises the panel, pressed with Ctrl or Cmd. @default "k" */
  hotkey?: string;
  /** What the trigger prints in its keycaps, space separated. @default "Ctrl K" */
  hotkeyHint?: string;
  /** @default "Jump to a room" */
  placeholder?: string;
  /** Shown when nothing matches. */
  emptyLabel?: string;
  /** Names the switcher for assistive technology. */
  label: string;
  className?: string;
};

/** Pixels of options before the list scrolls; the panel's own box clips it. */
const LIST_MAX = 168;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const printed = (room: SwitcherRoom): string =>
  room.direct ? room.name : `#${room.name}`;

/** One sentence, built in one string, so the name algorithm cannot join two. */
const optionLabel = (room: SwitcherRoom): string => {
  const unread = room.unread ?? 0;
  const head =
    unread > 0 ? `${printed(room)}, ${unread} unread` : printed(room);
  return `${head}. ${room.topic}.`;
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/**
 * A room header with a switcher behind a hotkey. Ctrl or Cmd with K raises a
 * panel inside the component's own frame — never over the host's page — that
 * rises from 8px on `snap` behind a scrim that fades, with focus landing in the
 * field a frame after it mounts. Typing filters the rooms: the matches carry
 * `layout` and travel to their new rows on `glide` while the rooms that no
 * longer match leave on the exit ease, and the list animates to a
 * ResizeObserver-measured height so the panel closes to exactly what matched.
 * Enter switches and the header slides: the room you left rises out while the
 * one you chose arrives from 8px below, both stacked in one grid cell and keyed
 * by a jump counter rather than by room, so two jumps in a row can never put two
 * readings on the same key or leave the old name on screen.
 *
 * The panel is a modal dialog: Tab cycles inside it, Escape closes it and focus
 * returns to the trigger. The field is a combobox with `aria-activedescendant`
 * over a listbox, Down and Up wrap, Home and End jump, and the active option is
 * scrolled into view rather than focused. A status region says what matched and
 * where you landed, frozen as it happens. Under reduced motion the panel fades
 * in place, the options stop travelling and the header cross-fades without
 * either name moving.
 */
export function RoomSwitcher({
  ref,
  rooms,
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  onQueryChange,
  hotkey = "k",
  hotkeyHint = "Ctrl K",
  placeholder = "Jump to a room",
  emptyLabel = "No room matches that.",
  label,
  className,
}: RoomSwitcherProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-list`;
  const titleId = `${baseId}-title`;
  const optionId = (id: string) => `${baseId}-option-${id}`;

  const [ownValue, setOwnValue] = React.useState(
    () => defaultValue ?? rooms[0]?.id ?? "",
  );
  const currentId = value ?? ownValue;
  const room = rooms.find((item) => item.id === currentId) ?? rooms[0];
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;

  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const [jumps, setJumps] = React.useState(0);
  const [said, setSaid] = React.useState("");

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const fieldRef = React.useRef<HTMLInputElement | null>(null);

  const needle = query.trim().toLowerCase();
  const matches = rooms.filter(
    (item) =>
      needle === "" ||
      item.name.toLowerCase().includes(needle) ||
      item.topic.toLowerCase().includes(needle),
  );
  const at = Math.min(cursor, Math.max(0, matches.length - 1));
  const active = matches[at];

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setOwnOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  const raise = React.useCallback(() => {
    setQuery("");
    setCursor(0);
    setOpen(true);
  }, [setOpen]);

  const close = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setOpen]);

  // A document listener that lives exactly as long as the component: a switcher
  // that has left the page never answers a keypress again.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== hotkey.toLowerCase()) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      event.preventDefault();
      raise();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hotkey, raise]);

  // Focus lands on the field a frame after the panel mounts, so typing can
  // start at once without the effect body touching state.
  React.useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => fieldRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // The active option is scrolled into view rather than focused: focus stays in
  // the field, which is what makes the combobox keep taking keystrokes.
  const activeId = active?.id;
  React.useEffect(() => {
    if (!isOpen || activeId === undefined) return;
    document
      .getElementById(`${baseId}-option-${activeId}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeId, baseId]);

  // The list measures its own content while it is up, so filtering to three
  // rooms closes the panel to three rooms instead of leaving dead space.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  const height = useMotionValue<number | string>("auto");
  const seeded = React.useRef(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const node = innerRef.current;
    if (!node) return;
    // A fresh raise writes its first height outright instead of gliding down
    // from whatever the last query left behind. Nothing is reset on the way
    // out: the panel is still on screen while it fades, and a height reset
    // there would balloon the list under the fade.
    seeded.current = false;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isOpen]);

  React.useEffect(() => {
    if (content === null) return;
    const target = Math.min(content, LIST_MAX);
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
  }, [content, height, motionSafe]);

  const jump = (next: SwitcherRoom) => {
    if (next.id !== currentId) {
      if (value === undefined) setOwnValue(next.id);
      setJumps((count) => count + 1);
      onValueChange?.(next.id);
    }
    setSaid(`Now in ${printed(next)}.`);
    close();
  };

  const type = (text: string) => {
    setQuery(text);
    setCursor(0);
    const trimmed = text.trim();
    const found = rooms.filter(
      (item) =>
        trimmed === "" ||
        item.name.toLowerCase().includes(trimmed.toLowerCase()) ||
        item.topic.toLowerCase().includes(trimmed.toLowerCase()),
    ).length;
    setSaid(
      trimmed === ""
        ? ""
        : `${found} ${found === 1 ? "room matches" : "rooms match"} ${trimmed}.`,
    );
    onQueryChange?.(trimmed, found);
  };

  const fieldKeys = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: matches.length - 1,
    };
    const to = moves[event.key];
    if (to !== undefined) {
      event.preventDefault();
      if (matches.length === 0) return;
      setCursor((to + matches.length) % matches.length);
      return;
    }
    if (event.key === "Enter" && active) {
      event.preventDefault();
      jump(active);
    }
  };

  const panelKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const stops = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((node) => node.tabIndex >= 0);
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const caps = hotkeyHint.split(" ");

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <div className="rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex items-start gap-2">
          {/* Both readings share one grid cell and are keyed by the jump
              rather than by the room, so two jumps in a row cannot collide. */}
          <div className="grid min-w-0 flex-1">
            <AnimatePresence initial={false}>
              <motion.div
                key={jumps}
                className="col-start-1 row-start-1 flex min-w-0 flex-col"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.step : 0,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: fade }
                    : { duration: durations.fast }
                }
              >
                <span className="truncate text-sm font-semibold text-foreground">
                  {room ? printed(room) : ""}
                </span>
                <span className="truncate text-[11px] text-ink-3">
                  {room?.topic}
                </span>
                <span className="mt-2.5 flex items-center gap-2 border-t border-hairline pt-2.5">
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2"
                  >
                    {initialsOf(room?.by ?? "")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium text-ink-2">
                      {room?.by}
                    </span>
                    <span className="block truncate text-xs text-foreground">
                      {room?.last}
                    </span>
                  </span>
                </span>
                <span className="mt-2 block font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {(room?.unread ?? 0) > 0
                    ? `${room?.unread} unread here`
                    : "All caught up here"}
                  {` · ${rooms.length} rooms`}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>

          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-label={`${label}, ${hotkeyHint}.`}
            onClick={raise}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1 rounded-2 border border-hairline-strong bg-card px-1.5 transition-colors hover:bg-accent",
              focusRing,
            )}
          >
            {caps.map((cap, index) => (
              <kbd
                key={`cap-${index}`}
                aria-hidden
                className="flex h-5 min-w-5 items-center justify-center rounded-1 bg-surface-2 px-1 font-mono text-[10px] leading-none text-ink-2"
              >
                {cap}
              </kbd>
            ))}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              key="scrim"
              aria-hidden
              onClick={close}
              className="absolute inset-0 z-10 rounded-3 bg-background/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            />
            <motion.div
              key="panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onKeyDown={panelKeys}
              className="absolute inset-x-2 top-2 z-20 flex max-h-[calc(100%-1rem)] flex-col overflow-hidden rounded-2 border border-hairline-strong bg-popover p-1.5 shadow-raised"
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? -distances.nudge : 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: fade }
                  : { duration: durations.fast }
              }
            >
              <h2 id={titleId} className="sr-only">
                {label}
              </h2>
              <input
                ref={fieldRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={active ? optionId(active.id) : undefined}
                aria-autocomplete="list"
                aria-label={placeholder}
                autoComplete="off"
                placeholder={placeholder}
                value={query}
                onChange={(event) => type(event.target.value)}
                onKeyDown={fieldKeys}
                className={cn(
                  "h-8 w-full shrink-0 rounded-1 border border-hairline bg-surface-1 px-2 text-xs text-foreground placeholder:text-ink-3",
                  focusRing,
                )}
              />

              <motion.div
                style={{ height }}
                className="mt-1.5 min-h-0 overflow-y-auto overscroll-contain"
              >
                <div ref={innerRef}>
                  <ul
                    id={listId}
                    role="listbox"
                    aria-label={label}
                    className="relative flex flex-col gap-0.5"
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {matches.map((item, index) => (
                        <motion.li
                          key={item.id}
                          id={optionId(item.id)}
                          role="option"
                          aria-selected={index === at}
                          aria-label={optionLabel(item)}
                          layout={motionSafe}
                          initial={
                            motionSafe
                              ? { opacity: 0, y: distances.nudge }
                              : { opacity: 0 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={
                            motionSafe
                              ? { ...springs.glide, opacity: fade }
                              : { duration: durations.fast }
                          }
                          onPointerDown={(event) => event.preventDefault()}
                          onClick={() => jump(item)}
                          className={cn(
                            "flex cursor-pointer items-center gap-2 rounded-1 px-2 py-1.5",
                            index === at ? "bg-cobalt-wash" : "hover:bg-accent",
                          )}
                        >
                          <span aria-hidden className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-xs",
                                item.id === currentId
                                  ? "font-semibold text-cobalt-bright"
                                  : "font-medium text-foreground",
                              )}
                            >
                              {printed(item)}
                            </span>
                            <span className="block truncate text-[11px] text-ink-3">
                              {item.topic}
                            </span>
                          </span>
                          {(item.unread ?? 0) > 0 && (
                            <span
                              aria-hidden
                              className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-semibold text-primary-foreground tabular-nums"
                            >
                              {item.unread}
                            </span>
                          )}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                  {matches.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-ink-3">
                      {emptyLabel}
                    </p>
                  )}
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {said}
      </span>
    </div>
  );
}
