"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShareSource = {
  id: string;
  name: string;
  /** Picks which window is drawn. @default "window" */
  kind?: "screen" | "window" | "board";
};

export type ShareFrameProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** What can be shared. Each one is drawn procedurally from its id. */
  sources: ShareSource[];
  /** Controlled chosen source. */
  sourceId?: string;
  /** Initial source for uncontrolled use. Defaults to the first source. */
  defaultSourceId?: string;
  onSourceChange?: (id: string) => void;
  /** Controlled sharing state. */
  sharing?: boolean;
  /** Initial sharing state for uncontrolled use. @default false */
  defaultSharing?: boolean;
  onSharingChange?: (sharing: boolean) => void;
  /** How many people are watching; stated in the badge. @default 0 */
  viewers?: number;
  /** Holds every control; a running share keeps its frame. @default false */
  disabled?: boolean;
  /** Names the group for assistive technology. @default "Screen share" */
  label?: string;
  className?: string;
};

/** A rounded rect as one path with a fixed command count, so `pathLength` can draw it. */
const FRAME_PATH =
  "M 9 1 H 151 A 8 8 0 0 1 159 9 V 91 A 8 8 0 0 1 151 99 H 9 A 8 8 0 0 1 1 91 V 9 A 8 8 0 0 1 9 1 Z";

/** FNV-1a, so the same source always draws the same window and nothing is random. */
const hashOf = (id: string) => {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
};

const watcherPhrase = (viewers: number) => {
  if (viewers <= 0) return "no one watching yet";
  return `${viewers} ${viewers === 1 ? "person" : "people"} watching`;
};

/** [key, x, y, width, height, fill opacity] — a tuple keeps the drawing readable as a list. */
type Block = [string, number, number, number, number, number];

/**
 * The shared surface, drawn rather than captured: a title strip, an optional
 * rail and a body laid out from a hash of the source's id. Every coordinate is
 * a whole number, so nothing here can hydrate against a differently rounded
 * float, and nothing anywhere touches a capture API.
 */
function Window({ source }: { source: ShareSource }) {
  const hash = hashOf(source.id);
  const kind = source.kind ?? "window";
  const sidebar = kind === "screen";
  const bodyX = sidebar ? 46 : 6;
  const bodyWidth = sidebar ? 108 : 148;
  const at = (shift: number, span: number) => (hash >> shift) % span;

  const blocks: Block[] = [
    ["chrome", 6, 6, 148, 12, 0.14],
    ["body", bodyX, 22, bodyWidth, 72, 0.07],
  ];
  if (sidebar) {
    blocks.push(["rail", 6, 22, 34, 72, 0.1]);
    for (let n = 0; n < 4; n += 1) {
      blocks.push([
        `rail-${n}`,
        11,
        28 + n * 11,
        12 + at(n * 2, 4) * 5,
        5,
        0.24,
      ]);
    }
  }
  for (let n = 0; n < 6; n += 1) {
    blocks.push(
      kind === "board"
        ? [
            `card-${n}`,
            12 + (n % 3) * 47,
            n < 3 ? 28 : 62,
            40,
            18 + at(n + 1, 4) * 4,
            0.22,
          ]
        : [
            `line-${n}`,
            bodyX + 6,
            30 + n * 10,
            Math.min(bodyWidth - 12, 44 + at(n + 3, 8) * 8),
            5,
            0.22,
          ],
    );
  }

  return (
    <svg
      viewBox="0 0 160 100"
      aria-hidden
      className="absolute inset-0 size-full text-ink"
    >
      {blocks.map(([key, x, y, width, height, opacity]) => (
        <rect
          key={key}
          x={x}
          y={y}
          width={width}
          height={height}
          rx="3"
          fill="currentColor"
          fillOpacity={opacity}
        />
      ))}
      {[12, 19, 26].map((cx) => (
        <circle
          key={cx}
          cx={cx}
          cy="12"
          r="2"
          fill="currentColor"
          fillOpacity="0.3"
        />
      ))}
    </svg>
  );
}

/**
 * Your screen, shared. Pressing Share opens the preview in flow — never floated
 * over whatever the host wrote below — with its height measured by a
 * ResizeObserver and glided from zero on `glide`, and the frame reserving its
 * own space by an aspect ratio rather than a minimum height. The border grows
 * rather than appearing: one rounded-rect path whose command count never
 * changes, drawn by `pathLength` from 0 to 1, so the outline travels around the
 * frame the way an edge of light does. Stopping retracts it on the exit ease and
 * closes the height behind it.
 *
 * Inside, the surface is drawn, not captured: a title strip, a rail and a body
 * laid out from a hash of the source's id, so the same source always draws the
 * same window and nothing anywhere touches a capture API. Choosing a different
 * source cross-fades the window at `durations.base` under a frame that holds its
 * shape. While sharing, a badge states the fact in words and how many people are
 * watching, and its dot's halo scales 1 → 2.1 and fades on a repeating tween —
 * the one ambient move in the component.
 *
 * The sources are a real radiogroup on a roving tabindex, so Left and Right step
 * without wrapping past the ends, Home and End jump, and Space selects; Share is
 * one `aria-pressed` button whose label is a whole sentence. Under reduced
 * motion the frame still opens and closes, because a share starting is
 * information, but on a tween, with the border swapping in and the badge holding
 * a steady ring instead of a pulse.
 */
export function ShareFrame({
  ref,
  sources,
  sourceId,
  defaultSourceId,
  onSourceChange,
  sharing,
  defaultSharing = false,
  onSharingChange,
  viewers = 0,
  disabled = false,
  label = "Screen share",
  className,
}: ShareFrameProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const firstId = sources[0]?.id ?? "";
  const [uncontrolledSource, setUncontrolledSource] = React.useState(
    defaultSourceId ?? firstId,
  );
  const sourceControlled = sourceId !== undefined;
  const rawSource = sourceControlled ? sourceId : uncontrolledSource;
  const currentIndex = Math.max(
    0,
    sources.findIndex((source) => source.id === rawSource),
  );
  const current = sources[currentIndex];
  const currentId = current?.id ?? "";
  const currentName = current?.name ?? "this screen";

  const [uncontrolledSharing, setUncontrolledSharing] =
    React.useState(defaultSharing);
  const sharingControlled = sharing !== undefined;
  const isSharing = sharingControlled ? sharing : uncontrolledSharing;

  const watchers = Math.max(0, Math.round(viewers));
  // One string, and pluralised: a label built from two text nodes can be joined
  // with a stray space, and "1 people" is not a sentence anyone would say.
  const watchingSentence =
    watchers === 0
      ? "No one is watching yet."
      : watchers === 1
        ? "1 person is watching."
        : `${watchers} people are watching.`;
  const frameLabel = isSharing
    ? `A preview of ${currentName}, the surface you are sharing. ${watchingSentence}`
    : `A preview of ${currentName}.`;

  // Frozen at the moment of the change, so a render that merely re-derives the
  // sentence cannot make the region repeat a past event, and a viewer arriving
  // never re-announces the share.
  const [seen, setSeen] = React.useState({
    sharing: isSharing,
    source: currentId,
  });
  const [spoken, setSpoken] = React.useState("");
  if (seen.sharing !== isSharing || seen.source !== currentId) {
    if (seen.sharing !== isSharing) {
      setSpoken(
        isSharing ? `You are sharing ${currentName}.` : "You stopped sharing.",
      );
    } else {
      setSpoken(isSharing ? `You are now sharing ${currentName}.` : "");
    }
    setSeen({ sharing: isSharing, source: currentId });
  }

  const pickSource = (id: string) => {
    if (!sourceControlled) setUncontrolledSource(id);
    onSourceChange?.(id);
  };

  const toggleSharing = () => {
    const next = !isSharing;
    if (!sharingControlled) setUncontrolledSharing(next);
    onSharingChange?.(next);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(sources.length - 1, Math.max(0, index));
    const source = sources[clamped];
    if (!source) return;
    document.getElementById(`${baseId}-src-${source.id}`)?.focus();
    pickSource(source.id);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(sources.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      const source = sources[index];
      if (source) pickSource(source.id);
    }
  };

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [frameHeight, setFrameHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The frame is always mounted, so the observer binds to a node that exists
    // and the open height stays honest when the column narrows.
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setFrameHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn("w-full", className)}
    >
      <div
        role="radiogroup"
        aria-label="What to share"
        className="flex flex-wrap items-center gap-1.5"
      >
        {sources.map((source, index) => {
          const checked = source.id === currentId;
          return (
            <button
              key={source.id}
              type="button"
              role="radio"
              aria-checked={checked}
              id={`${baseId}-src-${source.id}`}
              tabIndex={index === currentIndex ? 0 : -1}
              disabled={disabled}
              onClick={() => pickSource(source.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline-strong text-ink-2 hover:bg-accent",
                disabled && "opacity-50",
              )}
            >
              {source.name}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={toggleSharing}
          aria-pressed={isSharing}
          aria-label={
            isSharing ? `Stop sharing ${currentName}.` : `Share ${currentName}.`
          }
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isSharing
              ? "border border-hairline-strong hover:bg-accent"
              : "bg-primary text-primary-foreground hover:opacity-90",
            disabled && "opacity-50",
          )}
        >
          {isSharing ? "Stop sharing" : "Share"}
        </button>

        <span className="flex h-8 min-w-0 shrink items-center gap-1.5">
          <span className="relative grid size-2 shrink-0 place-items-center">
            {isSharing ? (
              motionSafe ? (
                <motion.span
                  aria-hidden
                  className="col-start-1 row-start-1 size-2 rounded-full bg-signal"
                  animate={{ scale: [1, 2.1], opacity: [0.5, 0] }}
                  transition={{
                    duration: durations.page,
                    ease: easings.enter,
                    repeat: Infinity,
                    repeatDelay: 0.2,
                  }}
                />
              ) : (
                <span
                  aria-hidden
                  className="col-start-1 row-start-1 size-2 rounded-full opacity-40 ring-2 ring-signal"
                />
              )
            ) : null}
            <span
              aria-hidden
              className={cn(
                "col-start-1 row-start-1 size-2 rounded-full transition-colors",
                isSharing ? "bg-signal" : "bg-ink-3",
              )}
            />
          </span>
          <span
            className={cn(
              "truncate text-xs leading-snug transition-colors",
              isSharing ? "text-ink" : "text-ink-3",
            )}
          >
            {isSharing ? `Sharing · ${watcherPhrase(watchers)}` : "Not sharing"}
          </span>
        </span>
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: isSharing ? (frameHeight ?? "auto") : 0 }}
        transition={glide}
      >
        <div ref={frameRef} className="pt-2">
          <div
            role="img"
            aria-hidden={!isSharing || undefined}
            aria-label={frameLabel}
            className="relative block aspect-[16/10] w-full overflow-hidden rounded-3 bg-surface-2"
          >
            {/* Both windows share the frame while the swap runs, so the box
                never collapses between them. */}
            <AnimatePresence initial={false}>
              {current ? (
                <motion.span
                  key={current.id}
                  className="absolute inset-0 block"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={fade}
                >
                  <Window source={current} />
                </motion.span>
              ) : null}
            </AnimatePresence>

            <svg
              viewBox="0 0 160 100"
              aria-hidden
              className="pointer-events-none absolute inset-0 size-full text-cobalt-bright"
            >
              <motion.path
                d={FRAME_PATH}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={false}
                animate={
                  motionSafe
                    ? { pathLength: isSharing ? 1 : 0, opacity: 1 }
                    : { pathLength: 1, opacity: isSharing ? 1 : 0 }
                }
                transition={
                  motionSafe
                    ? isSharing
                      ? springs.glide
                      : exitFor(durations.base)
                    : { duration: durations.fast, ease: easings.enter }
                }
              />
            </svg>
          </div>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
