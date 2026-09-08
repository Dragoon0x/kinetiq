"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Recipient = {
  id: string;
  name: string;
  /** The payee's handle — shown on the chip and spoken with the name. */
  handle: string;
  /** Any CSS colour — pass a theme token so both themes read. */
  tint: string;
};

export type RecipientPickProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The recent payees, most recent first. */
  people: Recipient[];
  /** Controlled payee id; `null` is the unpicked row. */
  value?: string | null;
  /** Initial payee id for uncontrolled usage. */
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Controlled filter text. */
  query?: string;
  /** Initial filter text for uncontrolled usage. */
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Faces drawn before the row stops. @default 6 */
  max?: number;
  /** Visible field label and the row's group name. @default "Send to" */
  label?: string;
  /** @default "Name or handle" */
  placeholder?: string;
  className?: string;
};

/** Two initials at most; a one-word name keeps one. */
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase() || "?";

const matches = (person: Recipient, query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    person.name.toLowerCase().includes(needle) ||
    person.handle.toLowerCase().includes(needle)
  );
};

/**
 * Recent payees drawn as faces. Picking one is a shape change rather than a
 * highlight: the chosen face's row item grows into a chip carrying the full name
 * and handle beside the same disc — a `layout` animation on `glide`, ζ0.98, one
 * settle and no bounce, because a surface changing size is not a switch — while
 * the others shrink to 0.84 and dim on a tween, so the row recedes behind the
 * choice. The disc travels into the chip; nothing blinks.
 *
 * Typing filters the row, and the filter is the FLIP: faces that no longer match
 * leave on the exit ease under `popLayout` and the survivors travel to their new
 * slots on the same glide, so the row closes up rather than jumping. An incoming
 * set arrives on a `cascade()` that keeps a full row inside the 600ms budget.
 *
 * The row is a listbox of options with a roving tabindex: Left and Right step
 * without wrapping, Home and End jump to the ends, Enter and Space choose,
 * Escape hands focus back to the field. Down from the field enters the row at
 * the chosen face. Under reduced motion the chip swaps in, the row re-lays
 * instantly, and unchosen faces dim by opacity alone.
 */
export function RecipientPick({
  ref,
  people,
  value,
  defaultValue = null,
  onValueChange,
  query,
  defaultQuery = "",
  onQueryChange,
  max = 6,
  label = "Send to",
  placeholder = "Name or handle",
  className,
}: RecipientPickProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const fieldId = `${baseId}-field`;
  const listId = `${baseId}-list`;
  const countId = `${baseId}-count`;

  const [ownValue, setOwnValue] = React.useState<string | null>(defaultValue);
  const chosenId = value !== undefined ? value : ownValue;
  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const text = query !== undefined ? query : ownQuery;

  const fieldRef = React.useRef<HTMLInputElement | null>(null);
  const itemRefs = React.useRef<(HTMLLIElement | null)[]>([]);

  const shown = people.filter((person) => matches(person, text)).slice(0, max);
  const chosen = people.find((person) => person.id === chosenId) ?? null;
  const chosenIndex = shown.findIndex((person) => person.id === chosenId);
  const stagger = cascade(shown.length);

  const pick = (id: string | null) => {
    if (value === undefined) setOwnValue(id);
    onValueChange?.(id);
  };

  const setQuery = (next: string) => {
    if (query === undefined) setOwnQuery(next);
    onQueryChange?.(next);
  };

  const focusItem = (next: number) => {
    const clamped = Math.min(shown.length - 1, Math.max(0, next));
    itemRefs.current[clamped]?.focus();
  };

  const handleItemKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    index: number,
    person: Recipient,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusItem(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusItem(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(shown.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(person.id === chosenId ? null : person.id);
        fieldRef.current?.focus();
        break;
      case "Escape":
        event.preventDefault();
        fieldRef.current?.focus();
        break;
      default:
        break;
    }
  };

  const chipSpring = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <label htmlFor={fieldId} className="text-xs font-medium text-ink-2">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={fieldId}
          ref={fieldRef}
          type="text"
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          aria-controls={listId}
          aria-describedby={countId}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusItem(chosenIndex >= 0 ? chosenIndex : 0);
            } else if (event.key === "Escape" && text) {
              event.preventDefault();
              setQuery("");
            }
          }}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-2 border border-input bg-surface-0 px-3 text-sm transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        />
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={`${label} recents`}
        aria-orientation="horizontal"
        className="flex flex-wrap items-center gap-1.5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((person, index) => {
            const isChosen = person.id === chosenId;
            const dimmed = chosen !== null && !isChosen;
            return (
              <motion.li
                key={person.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                role="option"
                aria-selected={isChosen}
                aria-label={`${person.name} ${person.handle}`}
                tabIndex={isChosen || (chosenIndex < 0 && index === 0) ? 0 : -1}
                layout={motionSafe}
                onClick={() => pick(isChosen ? null : person.id)}
                onKeyDown={(event) => handleItemKeyDown(event, index, person)}
                initial={
                  motionSafe ? { opacity: 0, scale: 0.8 } : { opacity: 0 }
                }
                animate={{
                  opacity: 1,
                  scale: motionSafe && dimmed ? 0.84 : 1,
                }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        // The pick itself answers at once; the rest of the row
                        // recedes in a ripple behind it.
                        delay: isChosen ? 0 : index * stagger,
                      }
                    : { duration: durations.fast, ease: easings.enter }
                }
                className={cn(
                  "flex h-11 cursor-pointer items-center rounded-full border transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isChosen
                    ? "gap-2 border-cobalt-bright bg-cobalt-wash pr-1 pl-1"
                    : "border-transparent p-0.5 hover:bg-accent",
                  dimmed && "opacity-70",
                )}
              >
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{
                    color: person.tint,
                    // Opaque, so a face reads as a disc on any surface.
                    backgroundColor: `color-mix(in oklab, ${person.tint} 20%, var(--card))`,
                  }}
                >
                  {initialsOf(person.name)}
                </span>

                {/* The name only exists on the chip, so the chip's growth is
                    the reveal rather than a second element fading in beside it. */}
                {isChosen ? (
                  <motion.span
                    className="flex min-w-0 flex-col"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                  >
                    <span className="truncate text-sm leading-tight font-medium">
                      {person.name}
                    </span>
                    <span className="truncate font-mono text-[10px] leading-tight text-ink-3">
                      {person.handle}
                    </span>
                  </motion.span>
                ) : null}

                {/* A glyph, not a button: an option may not hold its own
                    focusable child, so pressing the chip is what clears it. */}
                {isChosen ? (
                  <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center text-ink-3"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      className="size-3.5 shrink-0"
                    >
                      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                    </svg>
                  </span>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>

        {shown.length === 0 ? (
          <motion.li
            key="empty"
            role="presentation"
            layout={motionSafe}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={chipSpring}
            className="flex h-11 items-center px-1 text-sm text-ink-3"
          >
            No recent payee matches that.
          </motion.li>
        ) : null}
      </ul>

      <p
        id={countId}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {chosen
          ? `${chosen.name} ${chosen.handle}`
          : `${shown.length} of ${people.length} recents`}
      </p>

      <p role="status" className="sr-only">
        {chosen
          ? `Sending to ${chosen.name}, ${chosen.handle}`
          : `${shown.length} of ${people.length} recent payees shown, none chosen`}
      </p>
    </div>
  );
}
