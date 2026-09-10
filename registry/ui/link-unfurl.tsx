"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LinkPreview = {
  title: string;
  description: string;
  /** An invented domain — nothing that resolves. */
  domain: string;
  /** Draws the thumbnail. The same seed always draws the same picture. */
  seed: number;
};

export type LinkUnfurlState = "idle" | "fetching" | "ready" | "none";

export type LinkUnfurlProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The address in the bubble, and the thing being previewed. */
  url: string;
  /** What was typed before the link. */
  text?: string;
  /** Own messages sit on the right. @default "peer" */
  from?: "me" | "peer";
  /** Printed under the bubble, already formatted. */
  time?: string;
  /** The fold's state, owned by the host. @default "idle" */
  state?: LinkUnfurlState;
  /** What to show once the fold is open; required for "ready". */
  preview?: LinkPreview;
  /** Fires from the preview card. */
  onOpen?: (url: string) => void;
  /** Fires from the card's remove control; set `state` back to "idle". */
  onRemove?: () => void;
  /** Fires from Retry when no preview could be had. */
  onRetry?: () => void;
  /** Fires once, when the card has finished opening. */
  onUnfurled?: () => void;
  /** The other person; the meta line names them. @default "Them" */
  peerName?: string;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const CELL = "col-start-1 row-start-1 pt-2";

const r3 = (value: number) => Number(value.toFixed(3));

/** Integer ops only, so the server and the browser draw the same thumbnail. */
function stream(seed: number) {
  let state = (Math.floor(seed) * 0x9e3779b1) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The thumbnail is drawn from the seed: a status board, not a photograph. */
function Thumb({ seed }: { seed: number }) {
  const next = stream(seed);
  const bars = [0, 1, 2, 3, 4, 5, 6].map((index) => {
    const height = r3(8 + next() * 26);
    return { x: 5 + index * 7, y: r3(44 - height), height };
  });
  return (
    <svg viewBox="0 0 56 56" aria-hidden className="size-full">
      <rect width="56" height="56" className="fill-cobalt" opacity="0.1" />
      {bars.map((bar, index) => (
        <rect
          key={`bar-${index}`}
          x={bar.x}
          y={bar.y}
          width="5"
          height={bar.height}
          rx="1"
          className={index === 3 ? "fill-warn" : "fill-cobalt"}
          opacity={index === 3 ? 0.8 : 0.55}
        />
      ))}
      <path
        d="M4 46h48"
        className="stroke-cobalt"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

/** Binds a ResizeObserver to the fold's content as it arrives. */
function useMeasuredHeight() {
  const [height, setHeight] = React.useState<number | null>(null);
  const observerRef = React.useRef<ResizeObserver | null>(null);

  const attach = React.useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  React.useEffect(() => () => observerRef.current?.disconnect(), []);
  return [attach, height] as const;
}

/**
 * The skeleton is the card's own shape, so the fold opens once: the card that
 * follows lands in the room the wait already took.
 */
function FetchSkeleton({ motionSafe }: { motionSafe: boolean }) {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={FADE}
      className={CELL}
    >
      <div className="relative flex items-start gap-2.5 overflow-hidden rounded-2 border border-hairline bg-surface-0 p-2">
        <span className="size-14 shrink-0 rounded-1 bg-surface-2" />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
          <span className="h-2.5 w-3/4 rounded-full bg-surface-2" />
          <span className="h-2 w-full rounded-full bg-surface-2" />
          <span className="h-2 w-1/2 rounded-full bg-surface-2" />
        </span>
        {motionSafe ? (
          <motion.span
            initial={{ x: "-120%" }}
            animate={{ x: "120%" }}
            transition={{
              duration: 1.1,
              ease: easings.linear,
              repeat: Infinity,
            }}
            className="pointer-events-none absolute inset-y-0 w-1/2 bg-linear-to-r from-surface-0/0 via-surface-0 to-surface-0/0 opacity-70"
          />
        ) : (
          <span className="absolute right-2 bottom-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fetching preview
          </span>
        )}
      </div>
    </motion.div>
  );
}

type CardProps = {
  preview: LinkPreview;
  url: string;
  motionSafe: boolean;
  onOpen?: (url: string) => void;
  onRemove?: () => void;
  onUnfurled?: () => void;
};

/**
 * Its own component so the once-guard lives with the instance: the enter
 * animation reports, and the exit that follows later cannot report again.
 */
function PreviewCard({
  preview,
  url,
  motionSafe,
  onOpen,
  onRemove,
  onUnfurled,
}: CardProps) {
  const reported = React.useRef(false);

  return (
    <motion.div
      initial={motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={motionSafe ? springs.snap : FADE}
      onAnimationComplete={() => {
        if (reported.current) return;
        reported.current = true;
        onUnfurled?.();
      }}
      className={CELL}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpen?.(url)}
          aria-label={`Open preview: ${preview.title}, ${preview.domain}`}
          className={cn(
            "flex w-full items-start gap-2.5 rounded-2 border border-hairline bg-surface-0 p-2 text-left transition-colors outline-none",
            "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="size-14 shrink-0 overflow-hidden rounded-1 bg-surface-2">
            <Thumb seed={preview.seed} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 pr-6">
            <span
              className="truncate text-[13px] font-medium text-foreground"
              title={preview.title}
            >
              {preview.title}
            </span>
            <span className="line-clamp-2 text-[11px] leading-snug text-ink-3">
              {preview.description}
            </span>
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {preview.domain}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onRemove?.()}
          aria-label="Remove preview"
          className={cn(
            "absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none",
            "hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-3.5 shrink-0"
          >
            <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

const sentenceFor = (state: LinkUnfurlState, preview?: LinkPreview) => {
  if (state === "ready") {
    return preview ? `Preview loaded: ${preview.title}` : "Preview loaded";
  }
  if (state === "none") return "No preview available";
  if (state === "idle") return "Preview removed";
  return "";
};

/**
 * A link that unfolds its preview. The bubble holds the sentence and the
 * address; under it sits a fold whose height is 0 until the host reports a
 * preview. While `state` is "fetching" a skeleton the shape of the card mounts
 * inside it, the fold glides open to that measured height on `glide`, and a
 * highlight sweeps across on a linear tween so the wait has a shape and the
 * card that follows does not move the thread a second time. The card
 * cross-fades in over the skeleton — both stacked in one grid cell, so the
 * fold never collapses between them — arriving from `distances.step` on `snap`.
 *
 * The thumbnail is drawn from the preview's seed, never loaded, and the card
 * is a button rather than an anchor, so a synthetic sweep across a page of
 * specimens cannot navigate away. Removing folds it: the content leaves on the
 * exit ease while the fold glides back to 0, and `onRemove` fires from the
 * press rather than from inside a state updater. A preview that cannot be had
 * says so in words and offers Retry. Under reduced motion the fold still opens
 * and closes, on a tween, because a preview appearing is the information, and
 * the sweep gives way to a steady "Fetching preview".
 */
export function LinkUnfurl({
  ref,
  url,
  text,
  from = "peer",
  time,
  state = "idle",
  preview,
  onOpen,
  onRemove,
  onRetry,
  onUnfurled,
  peerName = "Them",
  label,
  className,
}: LinkUnfurlProps) {
  const motionSafe = useMotionSafe();
  const [foldRef, foldHeight] = useMeasuredHeight();
  const own = from === "me";

  // The sentence is frozen at the hop that produced it, so the region speaks
  // the change rather than whatever a later re-render computes.
  const [spoken, setSpoken] = React.useState({ state, message: "" });
  if (spoken.state !== state) {
    setSpoken({ state, message: sentenceFor(state, preview) });
  }

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <ol
        role="list"
        aria-label={label}
        className="flex flex-col gap-1 px-0.5 pb-0.5"
      >
        <li
          className={cn(
            "flex flex-col gap-1",
            own ? "items-end" : "items-start",
          )}
        >
          <div
            className={cn(
              "w-[94%] max-w-72 rounded-3 border px-3 py-2 text-sm leading-snug",
              own
                ? "rounded-br-1 border-transparent bg-primary text-primary-foreground"
                : "rounded-bl-1 border-hairline bg-surface-2 text-foreground",
            )}
          >
            {text ? <p className="wrap-break-word">{text}</p> : null}
            <p className="wrap-break-word">
              <span className={own ? "underline" : "text-cobalt-bright"}>
                {url}
              </span>
            </p>

            <motion.div
              initial={false}
              animate={{
                height: state === "idle" ? 0 : (foldHeight ?? "auto"),
              }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.base, ease: easings.move }
              }
              aria-busy={state === "fetching" || undefined}
              className="overflow-hidden"
            >
              {/* One grid cell holds every state, so the fold measures the
                  tallest of what is on screen and never collapses mid-swap. */}
              <div ref={foldRef} className="grid">
                <AnimatePresence initial={false}>
                  {state === "fetching" ? (
                    <FetchSkeleton key="skeleton" motionSafe={motionSafe} />
                  ) : null}

                  {state === "ready" && preview ? (
                    <PreviewCard
                      key="card"
                      preview={preview}
                      url={url}
                      motionSafe={motionSafe}
                      onOpen={onOpen}
                      onRemove={onRemove}
                      onUnfurled={onUnfurled}
                    />
                  ) : null}

                  {state === "none" ? (
                    <motion.div
                      key="none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor() }}
                      transition={FADE}
                      className={CELL}
                    >
                      <div className="flex items-center justify-between gap-2 rounded-2 border border-hairline bg-surface-0 px-2.5 py-2">
                        <span className="text-[11px] text-ink-3">
                          No preview available
                        </span>
                        <button
                          type="button"
                          onClick={() => onRetry?.()}
                          className={cn(
                            "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none",
                            "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-cobalt-wash",
                          )}
                        >
                          Retry
                        </button>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          <span className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
            <span>{own ? "You" : peerName}</span>
            {time ? <span className="tabular-nums">{time}</span> : null}
          </span>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.message}
      </span>
    </div>
  );
}
