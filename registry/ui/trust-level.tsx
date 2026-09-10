"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TrustLevelStep = {
  /** The level's name. */
  label: string;
  /** What holding this level lets a member do. */
  unlocks: string[];
};

export type TrustChange = {
  level: number;
  label: string;
  direction: "up" | "down";
};

export type TrustLevelProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The member, shown and spoken. */
  name: string;
  /** The member's handle, shown under the name. */
  handle?: string;
  /** The room the trust is held in; named in the sentences. @default "Coldbrook" */
  room?: string;
  /** The ladder, lowest first. */
  levels?: TrustLevelStep[];
  /** The level reached, as an index into `levels`. Only the host earns it. @default 1 */
  level?: number;
  /** How far through the next level, 0 to 1. @default 0 */
  progress?: number;
  /** Fires after a level settles, with the direction of the step. */
  onLevelChange?: (change: TrustChange) => void;
  /** Controlled index of the level being read. */
  shownLevel?: number;
  /** Initial read index; defaults to the level held. */
  defaultShownLevel?: number;
  onShownLevelChange?: (index: number) => void;
  /** Holds the pips; the ladder and the fill still read. @default false */
  disabled?: boolean;
  className?: string;
};

const DEFAULT_LEVELS: TrustLevelStep[] = [
  { label: "New", unlocks: ["Can post in the room"] },
  { label: "Regular", unlocks: ["Can post images", "Can react to messages"] },
  { label: "Trusted", unlocks: ["Can post links", "Can start threads"] },
  { label: "Guide", unlocks: ["Can pin messages", "Can welcome new members"] },
];

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const round3 = (value: number) => Number(value.toFixed(3));

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/**
 * Trust as rising bars — one bar per level, filled to the level held. Every
 * coordinate is a division rounded before it reaches an attribute, so the
 * glyph the server draws is the glyph the browser hydrates.
 */
function TrustBars({ step, total }: { step: number; total: number }) {
  const width = round3(16 / Math.max(1, total * 2 - 1));
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0">
      {Array.from({ length: total }, (_, index) => {
        const share = total > 1 ? index / (total - 1) : 1;
        const height = round3(4 + share * 9);
        return (
          <rect
            key={`bar-${index}`}
            x={round3(index * 2 * width)}
            y={round3(14 - height)}
            width={width}
            height={height}
            rx={round3(Math.min(1, width / 2))}
            fill="currentColor"
            fillOpacity={index <= step ? 1 : 0.22}
          />
        );
      })}
    </svg>
  );
}

/**
 * Earned, over time. Four pips on a rail, and a fill that reaches the level
 * held plus however far through the next one the member has got. The fill
 * glides — a quantity settling, never an overshoot — and its width is a
 * percentage rounded before it becomes a string motion paints, because an
 * unrounded percentage is a hydration mismatch waiting to happen.
 *
 * A level up stamps: the pip lands from 1.6 on `recoil` with its tick drawing
 * its pathLength on `flick`, and the bar badge beside the name cross-fades in
 * one grid cell and lands on the same spring. A level lost gets none of that —
 * the fill glides back and the badge dims to 0.4 and returns on a tween, no
 * scale and no bounce, because losing standing must not celebrate.
 *
 * Hovering or focusing a pip reads what that level unlocked, in a panel that
 * opens **in flow** under the rail in a ResizeObserver-measured height, never
 * floating over what the host wrote below; leaving returns the reading to the
 * level actually held unless the keyboard is still in the ladder. The pips are
 * a real tablist — Left and Right step without wrapping, Home and End jump,
 * selection follows focus — and the value lives on a `role="meter"` whose
 * `aria-valuetext` is a whole sentence. Under reduced motion the fill still
 * fills and the panel still opens, on tweens; nothing stamps, but a level lost
 * still dims once, because the direction of the change is information.
 */
export function TrustLevel({
  ref,
  name,
  handle,
  room = "Coldbrook",
  levels = DEFAULT_LEVELS,
  level = 1,
  progress = 0,
  onLevelChange,
  shownLevel,
  defaultShownLevel,
  onShownLevelChange,
  disabled = false,
  className,
}: TrustLevelProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;
  const tabId = (index: number) => `${baseId}-tab-${index}`;

  const count = Math.max(1, levels.length);
  const held = Math.max(0, Math.min(count - 1, Math.round(level)));
  const within = Math.max(0, Math.min(1, progress));
  const heldStep = levels[held];

  const [shownState, setShownState] = React.useState(defaultShownLevel ?? held);
  const shownControlled = shownLevel !== undefined;
  const shown = Math.max(
    0,
    Math.min(count - 1, shownControlled ? shownLevel : shownState),
  );
  const shownStep = levels[shown];

  // The step's direction and its sentence are frozen at the moment the level
  // changed, so the stamp, the dim and the reading all belong to that change.
  const [seen, setSeen] = React.useState(() => ({
    level: held,
    label: heldStep?.label ?? "",
    id: 0,
    direction: "up" as TrustChange["direction"],
    text: "",
  }));
  if (seen.level !== held) {
    const direction = held > seen.level ? "up" : "down";
    const label = heldStep?.label ?? "";
    const unlocks = (heldStep?.unlocks ?? [])
      .map((line) => line.toLowerCase())
      .join(", ");
    setSeen({
      level: held,
      label,
      id: seen.id + 1,
      direction,
      text:
        direction === "up"
          ? `Level ${held + 1} reached. ${label}. Unlocked: ${unlocks}.`
          : `Level ${held + 1}. ${label}. Some things are locked again.`,
    });
    // The reading follows the level the member actually holds. Only the
    // internal value moves here: a callback may never fire during render.
    if (!shownControlled) setShownState(held);
  }

  const changeRef = React.useRef(onLevelChange);
  React.useEffect(() => {
    changeRef.current = onLevelChange;
  });
  React.useEffect(() => {
    if (seen.id === 0) return;
    changeRef.current?.({
      level: seen.level,
      label: seen.label,
      direction: seen.direction,
    });
  }, [seen]);

  const listRef = React.useRef<HTMLDivElement | null>(null);

  const read = (index: number) => {
    if (disabled) return;
    const clamped = Math.max(0, Math.min(count - 1, index));
    if (!shownControlled) setShownState(clamped);
    onShownLevelChange?.(clamped);
  };

  const moveFocus = (index: number) => {
    const clamped = Math.max(0, Math.min(count - 1, index));
    document.getElementById(tabId(clamped))?.focus();
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(count - 1);
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

  const reach = count > 1 ? (held + within) / (count - 1) : 1;
  const fill = round3(Math.max(0, Math.min(1, reach)) * 100);
  const edge = round3(100 / (count * 2));
  const next = levels[held + 1];
  const valueText = next
    ? `Level ${held + 1} of ${count}, ${heldStep?.label ?? ""}, ${Math.round(within * 100)} percent of the way to ${next.label}.`
    : `Level ${count} of ${count}, ${heldStep?.label ?? ""}, the top level.`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-cobalt-wash text-[11px] font-semibold text-cobalt-bright"
        >
          {initialsOf(name)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm leading-snug font-medium">
            {name}
          </span>
          {handle ? (
            <span className="truncate text-[11px] leading-snug text-ink-3">
              @{handle}
            </span>
          ) : null}
        </span>

        {/* The badge's readings share one grid cell: the outgoing one fades
            under the incoming rather than pushing it sideways. */}
        <span className="grid shrink-0">
          <AnimatePresence initial={false}>
            <motion.span
              key={held}
              initial={
                motionSafe && seen.direction === "up"
                  ? { scale: 1.6, opacity: 0 }
                  : { opacity: seen.direction === "down" ? 0.4 : 0 }
              }
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe && seen.direction === "up"
                  ? { ...springs.recoil, opacity: FADE }
                  : { duration: durations.slow, ease: easings.enter }
              }
              style={{ originX: 0.5, originY: 0.5 }}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                "col-start-1 row-start-1 flex max-w-28 items-center gap-1.5 border-hairline-strong text-cobalt-bright",
              )}
            >
              <TrustBars step={held} total={count} />
              {/* truncate rather than nowrap: a long level name shortens
                  instead of shouldering the name column out of the row. */}
              <span className="truncate">{heldStep?.label ?? ""}</span>
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div className="relative">
        <div
          role="meter"
          aria-label={`Trust in ${room}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(Math.max(0, Math.min(1, reach)) * 100)}
          aria-valuetext={valueText}
          className="absolute top-2.5 -translate-y-1/2"
          style={{ left: `${edge}%`, right: `${edge}%` }}
        >
          <div
            aria-hidden
            className="h-1 overflow-hidden rounded-full bg-hairline-strong"
          >
            <motion.div
              className="h-full rounded-full bg-cobalt-bright"
              initial={false}
              animate={{ width: `${fill}%` }}
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            />
          </div>
        </div>

        <div
          ref={listRef}
          role="tablist"
          aria-label={`Trust ladder for ${name}`}
          onPointerLeave={() => {
            // A pointer leaving takes the reading back to the level held —
            // unless the keyboard is still in the ladder, whose choice wins.
            const node = listRef.current;
            if (node && node.contains(document.activeElement)) return;
            read(held);
          }}
          className="relative grid"
          style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
        >
          {levels.map((step, index) => {
            const reached = index <= held;
            return (
              <button
                key={`level-${index}`}
                id={tabId(index)}
                type="button"
                role="tab"
                aria-selected={index === shown}
                aria-controls={panelId}
                aria-disabled={disabled}
                tabIndex={index === shown ? 0 : -1}
                aria-label={`Level ${index + 1}, ${step.label}, ${reached ? "reached" : "not reached yet"}.`}
                onFocus={() => read(index)}
                onPointerEnter={() => read(index)}
                onClick={() => read(index)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  disabled && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "relative grid size-5 place-items-center rounded-full border bg-surface-1 transition-colors",
                    index === shown
                      ? "border-cobalt-bright"
                      : "border-hairline-strong",
                  )}
                >
                  <AnimatePresence initial={false}>
                    {reached ? (
                      <motion.span
                        key="reached"
                        aria-hidden
                        initial={
                          motionSafe
                            ? { scale: 1.6, opacity: 0 }
                            : { opacity: 0 }
                        }
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={motionSafe ? springs.recoil : FADE}
                        style={{ originX: 0.5, originY: 0.5 }}
                        className="absolute inset-0 grid place-items-center rounded-full bg-cobalt-wash text-cobalt-bright"
                      >
                        <motion.svg
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.25"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="size-2.5"
                        >
                          <motion.path
                            d="M3.5 8.4 6.6 11.5 12.5 5"
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={
                              motionSafe ? springs.flick : { duration: 0 }
                            }
                          />
                        </motion.svg>
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "max-w-full truncate text-[10px] leading-none transition-colors",
                    index === shown ? "text-ink" : "text-ink-3",
                  )}
                >
                  {step.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="-mx-1 overflow-hidden"
      >
        <div ref={innerRef} className="px-1">
          <div
            id={panelId}
            role="tabpanel"
            tabIndex={0}
            aria-labelledby={tabId(shown)}
            className={cn(
              "flex flex-col gap-1 rounded-2 border border-hairline bg-surface-2 p-2.5 outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <p className="text-xs leading-snug font-medium">
              {`What ${shownStep?.label ?? ""} unlocks in ${room}, ${shown <= held ? "already reached" : "not reached yet"}.`}
            </p>
            <ul role="list" className="flex flex-col gap-0.5">
              {(shownStep?.unlocks ?? []).map((unlock, unlockIndex) => (
                <li
                  key={`unlock-${unlockIndex}`}
                  className="flex items-center gap-1.5 text-[11px] leading-snug text-ink-3"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1 shrink-0 rounded-full",
                      shown <= held ? "bg-success" : "bg-ink-3/60",
                    )}
                  />
                  {unlock}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.text}
      </span>
    </div>
  );
}
