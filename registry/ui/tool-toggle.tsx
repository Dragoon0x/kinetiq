"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ToggleToolIcon =
  "search" | "browser" | "file" | "shell" | "calc" | "mail";

export type ToggleTool = {
  id: string;
  name: string;
  /** One short line under the name. */
  hint?: string;
  /** Which procedural glyph the plate draws. */
  icon: ToggleToolIcon;
};

export type ToolToggleProps = {
  ref?: React.Ref<HTMLDivElement>;
  tools: ToggleTool[];
  /** Controlled ids that are on. */
  enabled?: string[];
  /** Initial ids for uncontrolled usage. @default [] */
  defaultEnabled?: string[];
  /** Fires from the press or key that flipped a switch. */
  onEnabledChange?: (
    enabled: string[],
    changed: { id: string; on: boolean },
  ) => void;
  /** Grid columns. @default 2 */
  columns?: 1 | 2 | 3;
  /** Names the group and the count. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const NONE: string[] = [];

/** Every glyph is strokes on a 16-unit grid, so it can be drawn with `pathLength`. */
const GLYPHS: Record<ToggleToolIcon, string[]> = {
  search: ["M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z", "M10.5 10.5 14 14"],
  browser: [
    "M3.5 3h9a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3Z",
    "M2 6.5h12",
    "M4.5 4.75h.01M6.5 4.75h.01",
  ],
  file: ["M4.5 2H9l3.5 3.5V14h-8V2Z", "M9 2v3.5h3.5", "M6.5 9h3M6.5 11.5h3"],
  shell: ["M3 5l4 3-4 3", "M8.5 11.5H13"],
  calc: [
    "M4.5 2h7A1.5 1.5 0 0 1 13 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 12.5v-9A1.5 1.5 0 0 1 4.5 2Z",
    "M5.5 5.5h5",
    "M5.5 9h.01M8 9h.01M10.5 9h.01M5.5 11.5h.01M8 11.5h.01M10.5 11.5h.01",
  ],
  mail: [
    "M3.5 3.5h9A1.5 1.5 0 0 1 14 5v6a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11V5a1.5 1.5 0 0 1 1.5-1.5Z",
    "M2 5.5l6 4 6-4",
  ],
};

/** Digits that roll on `snap`; hidden because the status line carries the count. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(Math.max(0, Math.round(value)));
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = Math.max(
          0,
          DIGITS.indexOf(char as (typeof DIGITS)[number]),
        );
        return (
          <span
            // Keyed from the right so the units column keeps its identity.
            key={text.length - index}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A grid of switches deciding what the model may reach for. Each cell is a
 * switch card: a plate with a procedural glyph, the tool's name and hint, and
 * a small knob. Switching a tool on draws its glyph — the strokes run in with
 * `pathLength` on `flick`, the physics of a confirmation — while the plate
 * tints cobalt and the knob crosses on `snap`; switching it off undraws the
 * glyph the same way and leaves the plate's empty socket, so an off tool
 * reads as an empty socket rather than a greyed picture. The header counts
 * the tools that are on and rolls its digits on `snap` from the flip that
 * changed it, never on its own.
 *
 * The cells are real `switch` buttons under a roving tabindex: Left and Right
 * move one cell, Up and Down move one row, Home and End jump, Space and Enter
 * flip. The status region speaks the flipped tool and the new count, once
 * per flip. Under reduced motion glyphs swap on opacity, knobs swap sides and
 * the digits swap in place — the count still changes, because it is information.
 */
export function ToolToggle({
  ref,
  tools,
  enabled,
  defaultEnabled = NONE,
  onEnabledChange,
  columns = 2,
  label,
  className,
}: ToolToggleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const cellRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const [focused, setFocused] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const [uncontrolled, setUncontrolled] = React.useState(defaultEnabled);
  const current = enabled ?? uncontrolled;
  const onSet = React.useMemo(() => new Set(current), [current]);
  const count = tools.filter((tool) => onSet.has(tool.id)).length;

  const flip = (tool: ToggleTool) => {
    const on = !onSet.has(tool.id);
    const next = on
      ? [...current, tool.id]
      : current.filter((id) => id !== tool.id);
    const nextCount = count + (on ? 1 : -1);
    if (enabled === undefined) setUncontrolled(next);
    setAnnouncement(
      `${tool.name} ${on ? "on" : "off"}, ${nextCount} of ${tools.length} tools enabled`,
    );
    onEnabledChange?.(next, { id: tool.id, on });
  };

  const focusCell = (index: number) => {
    const clamped = Math.min(tools.length - 1, Math.max(0, index));
    const tool = tools[clamped];
    if (!tool) return;
    setFocused(clamped);
    cellRefs.current.get(tool.id)?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const moves: Record<string, number | undefined> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      Home: 0,
      End: tools.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    focusCell(next);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-xs">
          <span className="font-medium text-foreground">
            <RollingNumber value={count} motionSafe={motionSafe} />
          </span>
          <span className="text-ink-3">/ {tools.length} on</span>
        </span>
      </div>

      <div
        role="group"
        aria-labelledby={labelId}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {tools.map((tool, index) => {
          const on = onSet.has(tool.id);
          const strokes = GLYPHS[tool.icon];
          const stagger = cascade(strokes.length);
          return (
            <button
              key={tool.id}
              type="button"
              role="switch"
              aria-checked={on}
              aria-labelledby={`${baseId}-name-${tool.id}`}
              aria-describedby={
                tool.hint ? `${baseId}-hint-${tool.id}` : undefined
              }
              ref={(node) => {
                cellRefs.current.set(tool.id, node);
              }}
              tabIndex={index === focused ? 0 : -1}
              onFocus={() => setFocused(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => flip(tool)}
              className={cn(
                "flex min-w-0 flex-col gap-2 rounded-2 border p-2.5 text-left transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                on
                  ? "border-cobalt-bright/50 bg-surface-0"
                  : "border-hairline-strong bg-surface-0/60 hover:bg-accent",
              )}
            >
              <span className="flex h-9 items-center justify-between gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "relative flex size-9 shrink-0 items-center justify-center rounded-2 border transition-colors",
                    on
                      ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline bg-surface-2 text-ink-3",
                  )}
                >
                  {/* The socket: what an off plate holds instead of a glyph. */}
                  <motion.span
                    className="absolute size-1.5 rounded-full bg-hairline-strong"
                    initial={false}
                    animate={{ opacity: on ? 0 : 1 }}
                    transition={fade}
                  />
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                  >
                    {strokes.map((d, strokeIndex) => (
                      <motion.path
                        key={d}
                        d={d}
                        pathLength={1}
                        initial={false}
                        animate={
                          motionSafe
                            ? { pathLength: on ? 1 : 0, opacity: 1 }
                            : { pathLength: 1, opacity: on ? 1 : 0 }
                        }
                        // Strokes draw in order on flick, the confirmation
                        // spring; undrawing runs the same order in reverse.
                        transition={
                          motionSafe
                            ? {
                                ...springs.flick,
                                delay:
                                  (on
                                    ? strokeIndex
                                    : strokes.length - 1 - strokeIndex) *
                                  stagger,
                              }
                            : fade
                        }
                      />
                    ))}
                  </svg>
                </span>

                <span
                  aria-hidden
                  className={cn(
                    "flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors",
                    on ? "bg-cobalt-bright" : "bg-hairline-strong",
                  )}
                >
                  <motion.span
                    className="size-3 rounded-full bg-surface-0 shadow-sm"
                    initial={false}
                    animate={{ x: on ? 12 : 0 }}
                    transition={
                      motionSafe
                        ? springs.snap
                        : { duration: durations.fast, ease: easings.move }
                    }
                  />
                </span>
              </span>

              <span className="flex min-w-0 flex-col">
                <span
                  id={`${baseId}-name-${tool.id}`}
                  title={tool.name}
                  className={cn(
                    "truncate text-sm leading-5 font-medium transition-colors",
                    on ? "text-foreground" : "text-ink-2",
                  )}
                >
                  {tool.name}
                </span>
                {tool.hint ? (
                  <span
                    id={`${baseId}-hint-${tool.id}`}
                    title={tool.hint}
                    className="truncate text-[11px] leading-4 text-ink-3"
                  >
                    {tool.hint}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
