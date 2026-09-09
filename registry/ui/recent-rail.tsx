"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RecentItem = {
  id: string;
  title: string;
  /** A short age the host supplies — "2h", "Yesterday" — never read from a clock. */
  age: string;
};

export type RecentRailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Newest first; the host owns the list. */
  items: RecentItem[];
  /** Rows the rail shows; the one past it fades out at the bottom. @default 6 */
  max?: number;
  /** Controlled active id. */
  value?: string;
  /** Initial active id for uncontrolled usage; defaults to the first item. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Fires from a committed rename with a non-empty title. */
  onRename?: (id: string, title: string) => void;
  /** Names the rail. */
  label: string;
  className?: string;
};

type Notice = { text: string; n: number };

/**
 * The glow behind the active plate: it arrives at full on `flick`, then
 * settles to a soft rest on `drift` — two springs chained, because a spring
 * takes two keyframes — and stays lit there without pulsing.
 */
function Bloom({ motionSafe }: { motionSafe: boolean }) {
  const [settled, setSettled] = React.useState(false);
  return (
    <motion.span
      aria-hidden
      initial={motionSafe ? { opacity: 0 } : false}
      animate={{ opacity: settled || !motionSafe ? 0.4 : 1 }}
      transition={settled ? springs.drift : springs.flick}
      onAnimationComplete={() => setSettled(true)}
      className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash"
    />
  );
}

function RenameField({
  title,
  onDone,
}: {
  title: string;
  /** `null` cancels; `refocus` says the keyboard ended it, so focus returns to the row. */
  onDone: (next: string | null, refocus: boolean) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const done = React.useRef(false);
  React.useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const finish = (next: string | null, refocus: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(next, refocus);
  };
  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={title}
      aria-label="Rename conversation"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(event.currentTarget.value, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(null, true);
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value, false)}
      className={cn(
        "h-8 min-w-0 flex-1 rounded-1 border border-input bg-surface-0 px-2 text-sm text-foreground outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    />
  );
}

/**
 * Recent conversations, newest first. Rows slide in from `distances.step` on
 * `snap` in a `cascade`, on mount and again whenever a new conversation lands
 * at the top while the rows beneath travel down with `layout` on `glide`; the
 * row pushed past `max` fades out at the bottom on the exit ease, and the
 * rail's measured height glides to fit. The active row glows: a shared
 * `layoutId` plate travels to it on `snap`, and a bloom behind it arrives at
 * full and settles to a soft rest on `drift`, lit but never pulsing.
 *
 * Renaming edits in place. The rename button, or F2 on a focused row, swaps
 * the title for an input at the same height with the text selected; Enter
 * commits through `onRename`, Escape cancels, blur commits, and the new title
 * cross-fades in. A roving tabindex sits on the active row: Up and Down move
 * between rows, Home and End jump, Enter or Space opens. Under reduced motion
 * rows fade in place, the plate swaps without travelling, the bloom starts at
 * rest and the rename swaps without a cross-fade.
 */
export function RecentRail({
  ref,
  items,
  max = 6,
  value,
  defaultValue,
  onValueChange,
  onRename,
  label,
  className,
}: RecentRailProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const plateId = `${baseId}-plate`;

  const visible = items.slice(0, Math.max(0, max));
  const [own, setOwn] = React.useState<string | undefined>(defaultValue);
  const active = value ?? own ?? items[0]?.id;
  // The tab stop follows the active row, or the first row when the active
  // conversation has been pushed past `max`, so the rail is always reachable.
  const tabStop = visible.some((item) => item.id === active)
    ? active
    : visible[0]?.id;
  const [editing, setEditing] = React.useState<string | null>(null);
  const refocus = React.useRef<string | null>(null);

  const [notice, setNotice] = React.useState<Notice>({ text: "", n: 0 });
  const announce = (text: string) =>
    setNotice((prev) => ({ text, n: prev.n + 1 }));

  // A conversation the rail has not seen at the top is new: announce it
  // once, from the committed list, without a clock or an effect.
  const [seen, setSeen] = React.useState(() => items.map((item) => item.id));
  const first = items[0];
  if (first && !seen.includes(first.id)) {
    setSeen(items.map((item) => item.id));
    announce(`New conversation: ${first.title}`);
  }

  const pick = (item: RecentItem) => {
    if (item.id === active) return;
    if (value === undefined) setOwn(item.id);
    onValueChange?.(item.id);
    announce(`Opened ${item.title}`);
  };

  const finishRename = (
    item: RecentItem,
    next: string | null,
    fromKeyboard: boolean,
  ) => {
    setEditing(null);
    if (fromKeyboard) refocus.current = item.id;
    const title = next?.trim() ?? "";
    if (next !== null && title && title !== item.title) {
      onRename?.(item.id, title);
      announce(`Renamed to ${title}`);
    }
  };

  // Focus returns to the row only when the keyboard ended the rename; a
  // pointer that clicked elsewhere keeps what it chose.
  React.useEffect(() => {
    if (editing !== null || !refocus.current) return;
    const id = refocus.current;
    refocus.current = null;
    document.getElementById(`${baseId}-row-${id}`)?.focus();
  }, [editing, baseId]);

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const targets: Record<string, number | undefined> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: visible.length - 1,
    };
    if (event.key === "F2") {
      event.preventDefault();
      setEditing(visible[index]?.id ?? null);
      return;
    }
    const to = targets[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const target = visible[Math.min(visible.length - 1, Math.max(0, to))];
    if (target) document.getElementById(`${baseId}-row-${target.id}`)?.focus();
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      setHeight(
        Math.round(
          box ? box.blockSize : entry.target.getBoundingClientRect().height,
        ),
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const stagger = cascade(visible.length);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="px-2 pb-2">
          {visible.length === 0 ? (
            <p className="flex h-9 items-center px-1 text-xs text-ink-3">
              No conversations yet
            </p>
          ) : null}
          <ul
            role="list"
            aria-labelledby={labelId}
            className="relative flex flex-col gap-0.5 empty:hidden"
          >
            <AnimatePresence mode="popLayout">
              {visible.map((item, index) => {
                const isActive = item.id === active;
                return (
                  <motion.li
                    key={item.id}
                    layout={motionSafe}
                    initial={
                      motionSafe
                        ? { opacity: 0, y: -distances.step }
                        : { opacity: 0 }
                    }
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: motionSafe
                        ? {
                            ...springs.snap,
                            delay: index * stagger,
                            opacity: { ...fade, delay: index * stagger },
                          }
                        : fade,
                    }}
                    exit={{ opacity: 0, transition: exitFor() }}
                    transition={{ layout: springs.glide }}
                    className="relative"
                  >
                    {isActive ? (
                      <>
                        <motion.span
                          aria-hidden
                          layoutId={motionSafe ? plateId : undefined}
                          transition={springs.snap}
                          className="absolute inset-0 rounded-2 border border-hairline-strong bg-surface-0"
                        />
                        <Bloom motionSafe={motionSafe} />
                      </>
                    ) : null}
                    <div className="relative flex h-10 items-center gap-1 pr-1 pl-1">
                      {editing === item.id ? (
                        <RenameField
                          title={item.title}
                          onDone={(next, fromKeyboard) =>
                            finishRename(item, next, fromKeyboard)
                          }
                        />
                      ) : (
                        <button
                          type="button"
                          id={`${baseId}-row-${item.id}`}
                          aria-current={isActive ? "true" : undefined}
                          aria-label={`${item.title}, ${item.age}`}
                          tabIndex={item.id === tabStop ? 0 : -1}
                          onClick={() => pick(item)}
                          onKeyDown={(event) => handleKeyDown(event, index)}
                          className={cn(
                            "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-1 px-2 text-left outline-none",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          )}
                        >
                          {/* Old and new titles share one grid cell so the
                              cross-fade never reflows the row. */}
                          <span className="grid min-w-0 flex-1">
                            <AnimatePresence initial={false}>
                              <motion.span
                                key={item.title}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={motionSafe ? fade : { duration: 0 }}
                                className={cn(
                                  "col-start-1 row-start-1 truncate text-sm",
                                  isActive
                                    ? "font-medium text-foreground"
                                    : "text-ink-2",
                                )}
                              >
                                {item.title}
                              </motion.span>
                            </AnimatePresence>
                          </span>
                          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                            {item.age}
                          </span>
                        </button>
                      )}
                      {editing === item.id ? null : (
                        <button
                          type="button"
                          aria-label={`Rename ${item.title}`}
                          onClick={() => setEditing(item.id)}
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                          )}
                        >
                          <svg
                            viewBox="0 0 16 16"
                            aria-hidden
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="size-3.5"
                          >
                            <path d="m11.5 2.5 2 2-8 8H3.5v-2l8-8zM10 4l2 2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        <span key={notice.n}>{notice.text}</span>
      </span>
    </div>
  );
}
