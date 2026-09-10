"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GifDelivery = "sent" | "delivered" | "read";

export type GifClip = {
  id: string;
  /** Own clips sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  /** Caption under the picture, and the name in every sentence. */
  title: string;
  /** Any integer; the scene is drawn from it, so the same seed is the same clip. */
  seed: number;
  /** Frames in the loop. @default 12 */
  frames?: number;
  /** Printed in the caption, already formatted. */
  time?: string;
  /** Read for own clips only. @default "sent" */
  delivery?: GifDelivery;
};

export type GifLoopProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  clips: GifClip[];
  /** Controlled ids of clips paused by hand. */
  paused?: string[];
  /** Initial hand-paused ids for uncontrolled usage. @default [] */
  defaultPaused?: string[];
  /** Fires from the press or key that pauses or resumes a clip by hand. */
  onPausedChange?: (id: string, paused: boolean) => void;
  /** Fires on each frame a clip advances to. */
  onFrameChange?: (id: string, frame: number) => void;
  /** Fires as a clip wraps past its last frame, with its running loop count. */
  onLoop?: (id: string, loops: number) => void;
  /** Fires with the first reading and whenever a clip crosses `threshold`. */
  onInViewChange?: (id: string, inView: boolean) => void;
  /** Frames a second while a clip plays. @default 8 */
  fps?: number;
  /** Visible share a clip must hold to keep playing. @default 0.6 */
  threshold?: number;
  /** Height of the thread's scroll viewport, in pixels. @default 264 */
  viewportHeight?: number;
  /** Hands the scroll viewport to the host, so it can scroll the thread itself. */
  viewportRef?: React.RefObject<HTMLDivElement | null>;
  /** Names the other side in sentences. @default "Them" */
  peerName?: string;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const EMPTY: string[] = [];

/** The cel's coordinate space; the picture is a 16:9 box scaled by its frame. */
const W = 160;
const H = 90;
const GROUND = 64;

const BLOCKS = 5;
const STRIPES = 7;
const MOTES = 3;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A 32-bit integer hash. Deterministic and, unlike `Math.sin` seeding, free of
 * trigonometry: integer arithmetic agrees to the last digit between Node and
 * the browser, so a drawn scene hydrates against the markup the server sent.
 */
const hash = (a: number, b: number): number => {
  let x = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  x = x ^ (x >>> 13);
  x = Math.imul(x, 1274126177) | 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Every number that reaches an SVG attribute is rounded first. */
const round3 = (value: number): number => Number(value.toFixed(3));

type Cel = {
  blocks: { x: number; y: number; w: number; h: number }[];
  stripes: number[];
  marker: { x: number; y: number; shadow: number };
  motes: { x: number; y: number; r: number }[];
};

/**
 * One frame of the loop, computed rather than stored: the skyline and its
 * proportions come from the clip's seed, and only the phase comes from the
 * frame index, so a clip of any length draws the same place.
 */
const cel = (seed: number, frame: number, frames: number): Cel => {
  const t = frame / frames;
  const blocks = Array.from({ length: BLOCKS }, (_, i) => {
    const w = 16 + Math.round(hash(seed, i) * 13);
    const h = 14 + Math.round(hash(seed, i + 31) * 25);
    const x = Math.round(3 + i * 31 + hash(seed, i + 61) * 7);
    // Each block breathes on its own phase: the skyline is alive without
    // anything sliding, which is what keeps a cel from reading as a smear.
    const bob = hash(seed, i * 17 + frame) * 1.6;
    return { x, y: round3(GROUND - h + bob), w, h };
  });

  const span = W + 22;
  const stripes = Array.from({ length: STRIPES }, (_, i) =>
    round3(((((i * 26 - frame * 9) % span) + span) % span) - 22),
  );

  // A parabola written as a product — no Math.pow reaches an attribute.
  const swing = 2 * t - 1;
  const rise = 1 - swing * swing;
  const marker = {
    x: round3(14 + t * 132),
    y: round3(GROUND - 7 - rise * 26),
    shadow: round3(3 + (1 - rise) * 3.5),
  };

  const drift = 52;
  const motes = Array.from({ length: MOTES }, (_, i) => ({
    x: round3(18 + hash(seed, i + 91) * 124),
    y: round3(
      GROUND -
        8 -
        ((((hash(seed, i + 7) * drift + frame * 3) % drift) + drift) % drift),
    ),
    r: round3(1.2 + hash(seed, i + 41) * 1.3),
  }));

  return { blocks, stripes, marker, motes };
};

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

const deliverySentence = (delivery: GifDelivery, peerName: string) =>
  ({
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
  })[delivery];

const CHECK = "M2 8.5 5 11.5 10.5 5.5";
const CHECK_TRAIL = "M6.5 11.5 12 5.5";
const PLAY = "M5.5 3.5 12 8l-6.5 4.5z";

type ClipItemProps = {
  clip: GifClip;
  rootRef: React.RefObject<HTMLDivElement | null>;
  threshold: number;
  fps: number;
  visible: boolean;
  motionSafe: boolean;
  peerName: string;
  handPaused: boolean;
  onToggle: (id: string, paused: boolean) => void;
  onSay: (sentence: string) => void;
  onFrameChange?: (id: string, frame: number) => void;
  onLoop?: (id: string, loops: number) => void;
  onInViewChange?: (id: string, inView: boolean) => void;
};

/**
 * One clip. The frame lives in state so only this bubble re-renders on a tick,
 * and the tick itself is gated on three things at once: the clip's share of the
 * viewport, the document being visible, and the reader not having paused it.
 */
function ClipItem({
  clip,
  rootRef,
  threshold,
  fps,
  visible,
  motionSafe,
  peerName,
  handPaused,
  onToggle,
  onSay,
  onFrameChange,
  onLoop,
  onInViewChange,
}: ClipItemProps) {
  const frames = Math.max(2, Math.round(clip.frames ?? 12));
  const [frame, setFrame] = React.useState(0);
  // A clip starts assumed visible so the first one plays without waiting for
  // the observer; the first reading corrects the rest before anyone sees them.
  const [inView, setInView] = React.useState(true);
  const boxRef = React.useRef<HTMLButtonElement | null>(null);
  const frameRef = React.useRef(0);
  const loopsRef = React.useRef(0);
  const readRef = React.useRef(false);
  const lastSeenRef = React.useRef(true);

  const latest = React.useRef({ onFrameChange, onLoop, onInViewChange, onSay });
  React.useEffect(() => {
    latest.current = { onFrameChange, onLoop, onInViewChange, onSay };
  });

  const title = clip.title;
  const titleRef = React.useRef(title);
  React.useEffect(() => {
    titleRef.current = title;
  });

  // The observer is bound to the node when it arrives and rooted on the
  // thread's own scroll box, so "in view" means visible in the thread rather
  // than somewhere in the page.
  React.useEffect(() => {
    const node = boxRef.current;
    const root = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const next = entry.intersectionRatio + 0.001 >= threshold;
        const first = !readRef.current;
        // A scroll crosses several thresholds and reports each one: only a
        // real change of state is worth a render, a callback or a sentence.
        if (!first && lastSeenRef.current === next) return;
        lastSeenRef.current = next;
        readRef.current = true;
        setInView(next);
        latest.current.onInViewChange?.(clip.id, next);
        // The first reading is not a change: announcing it would greet a
        // reader with one sentence per clip already off the bottom.
        if (!first) {
          latest.current.onSay(
            next
              ? `${titleRef.current} playing`
              : `${titleRef.current} paused, out of view`,
          );
        }
      },
      { root, threshold: [0, threshold, 1] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [clip.id, rootRef, threshold]);

  const playing = motionSafe && visible && inView && !handPaused;

  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => {
        const next = frameRef.current + 1;
        if (next >= frames) {
          frameRef.current = 0;
          loopsRef.current += 1;
          setFrame(0);
          latest.current.onLoop?.(clip.id, loopsRef.current);
          latest.current.onFrameChange?.(clip.id, 0);
          return;
        }
        frameRef.current = next;
        setFrame(next);
        latest.current.onFrameChange?.(clip.id, next);
      },
      Math.round(1000 / Math.max(1, fps)),
    );
    return () => window.clearInterval(timer);
  }, [playing, frames, fps, clip.id]);

  // Reduced motion turns the picture into a frame stepper: one press, one
  // frame, so the whole loop stays reachable without a single unrequested move.
  const step = () => {
    const next = frameRef.current + 1 >= frames ? 0 : frameRef.current + 1;
    frameRef.current = next;
    setFrame(next);
    if (next === 0) {
      loopsRef.current += 1;
      onLoop?.(clip.id, loopsRef.current);
    }
    onFrameChange?.(clip.id, next);
    onSay(`${title}, frame ${next + 1} of ${frames}`);
  };

  const press = () => {
    if (!motionSafe) {
      step();
      return;
    }
    const next = !handPaused;
    onToggle(clip.id, next);
    onSay(next ? `${title} paused` : `${title} playing`);
  };

  const own = clip.from === "me";
  const state = handPaused
    ? "paused"
    : inView
      ? "playing"
      : "paused, out of view";
  const name = motionSafe
    ? own
      ? `Your looping clip, ${title}, ${state}`
      : `Looping clip from ${peerName}, ${title}, ${state}`
    : `Step ${title} forward one frame. Frame ${frame + 1} of ${frames}.`;

  const scene = cel(clip.seed, frame, frames);
  const showBadge = !playing;
  const delivery = clip.delivery ?? "sent";
  const railTo = round3((frame + 1) / frames);

  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={{ duration: durations.base, ease: easings.enter }}
      className={cn("flex flex-col", own ? "items-end" : "items-start")}
    >
      <div
        className={cn(
          "flex w-full max-w-[86%] flex-col gap-1.5 rounded-3 p-1.5",
          own
            ? "rounded-br-1 bg-primary text-primary-foreground"
            : "rounded-bl-1 bg-surface-2 text-foreground",
        )}
      >
        <button
          ref={boxRef}
          type="button"
          aria-label={name}
          aria-pressed={motionSafe ? handPaused : undefined}
          onClick={press}
          className={cn(
            "relative block aspect-[16/9] w-full overflow-hidden rounded-2 border border-hairline bg-surface-1",
            focusRing,
          )}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            aria-hidden
            className="absolute inset-0 size-full"
          >
            {/* Sky, ground and stripes: the picture is drawn from the seed on
                every frame, so nothing is fetched and nothing is an asset. */}
            <rect
              x={0}
              y={0}
              width={W}
              height={GROUND}
              className="text-cobalt-bright"
              fill="currentColor"
              fillOpacity={0.1}
            />
            <rect
              x={0}
              y={GROUND}
              width={W}
              height={H - GROUND}
              className="text-ink"
              fill="currentColor"
              fillOpacity={0.14}
            />
            {scene.blocks.map((block, index) => (
              <rect
                key={index}
                x={block.x}
                y={block.y}
                width={block.w}
                height={block.h}
                rx={2}
                className="text-ink"
                fill="currentColor"
                fillOpacity={0.24}
              />
            ))}
            {scene.stripes.map((x, index) => (
              <rect
                key={index}
                x={x}
                y={74}
                width={14}
                height={3}
                rx={1.5}
                className="text-ink"
                fill="currentColor"
                fillOpacity={0.32}
              />
            ))}
            {scene.motes.map((mote, index) => (
              <circle
                key={index}
                cx={mote.x}
                cy={mote.y}
                r={mote.r}
                className="text-ink-3"
                fill="currentColor"
                fillOpacity={0.5}
              />
            ))}
            <ellipse
              cx={scene.marker.x}
              cy={GROUND - 1}
              rx={scene.marker.shadow}
              ry={1.6}
              className="text-ink"
              fill="currentColor"
              fillOpacity={0.2}
            />
            <circle
              cx={scene.marker.x}
              cy={scene.marker.y}
              r={5}
              className="text-cobalt-bright"
              fill="currentColor"
            />
          </svg>

          {/* Reduced motion gets a corner chip instead of the scrim: a
              permanently dimmed picture would be a worse deal than the loop. */}
          {motionSafe ? (
            <AnimatePresence initial={false}>
              {showBadge ? (
                <motion.span
                  key="badge"
                  aria-hidden
                  className="absolute inset-0 grid place-items-center bg-background/55"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                >
                  <motion.span
                    className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface-0 py-1 pr-2.5 pl-2 text-ink shadow-sm"
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={springs.snap}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden className="size-3">
                      <path d={PLAY} fill="currentColor" />
                    </svg>
                    <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                      GIF
                    </span>
                  </motion.span>
                </motion.span>
              ) : null}
            </AnimatePresence>
          ) : (
            <span
              aria-hidden
              className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full border border-hairline bg-surface-0 py-0.5 pr-2 pl-1.5 text-ink"
            >
              <svg viewBox="0 0 16 16" aria-hidden className="size-2.5">
                <path d={PLAY} fill="currentColor" />
              </svg>
              <span className="text-[10px] font-semibold tracking-[0.08em] uppercase">
                GIF
              </span>
            </span>
          )}
        </button>

        {/* The loop rail: one head travelling one loop's width, linear, because
            a loop's position is a clock rather than a spring. */}
        <span
          aria-hidden
          className="h-[3px] w-full overflow-hidden rounded-full bg-current/20"
        >
          <motion.span
            className="block h-full origin-left rounded-full bg-current"
            initial={false}
            animate={{ scaleX: railTo }}
            transition={
              playing
                ? { duration: 1 / Math.max(1, fps), ease: easings.linear }
                : { duration: 0 }
            }
          />
        </span>

        <span className="flex items-center gap-2 px-0.5 pb-0.5">
          <span className="min-w-0 flex-1 truncate text-[11px] leading-4">
            {clip.title}
          </span>
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] tabular-nums opacity-70"
          >
            {motionSafe
              ? (clip.time ?? `${frames} frames`)
              : `${frame + 1}/${frames}`}
          </span>
          {own ? (
            <span
              role="img"
              aria-label={deliverySentence(delivery, peerName)}
              className="inline-flex size-3.5 shrink-0 items-center justify-center"
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5"
                opacity={delivery === "read" ? 1 : 0.7}
              >
                <path d={CHECK} />
                {delivery === "sent" ? null : <path d={CHECK_TRAIL} />}
              </svg>
            </span>
          ) : null}
        </span>
      </div>
    </motion.li>
  );
}

/**
 * A looping picture that plays only where it can be seen. Each clip is a
 * procedural cel animation — a seeded hash turns the clip's seed and frame
 * index into a skyline, a run of ground stripes and a marker arcing across the
 * frame — so a clip is drawn rather than fetched. An IntersectionObserver
 * rooted on the thread's own scroll box watches each clip's share of the
 * viewport: dropping below `threshold` stops the tick where it stands and lands
 * a play badge over the picture on `snap` behind a fading scrim, and scrolling
 * back resumes from the frame it held. Frames swap instantly, because a cel has
 * no in-between and springing one would smear the loop; the motion budget goes
 * to the badge and to a rail whose head travels one loop's width on a linear
 * tween. Pressing a clip pauses it by hand, and a hand-paused clip stays paused
 * when it scrolls back into view.
 *
 * Each clip is a `<button>` whose accessible name is a sentence — "Looping clip
 * from Rui, Bay 3 door cycle, paused, out of view" — with `aria-pressed`
 * carrying the hand pause, so no state rests on the badge alone; Space or Enter
 * toggles, and the scroll region is focusable so a keyboard can move the thread.
 * Under reduced motion nothing plays itself: every clip holds a still frame with
 * the badge up and the button becomes a frame step, one press per frame, so the
 * whole picture stays reachable.
 */
export function GifLoop({
  ref,
  clips,
  paused,
  defaultPaused = EMPTY,
  onPausedChange,
  onFrameChange,
  onLoop,
  onInViewChange,
  fps = 8,
  threshold = 0.6,
  viewportHeight = 264,
  viewportRef,
  peerName = "Them",
  label,
  className,
}: GifLoopProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const forwarded = React.useRef(viewportRef);
  React.useEffect(() => {
    forwarded.current = viewportRef;
  });

  // A stable callback ref: an inline one is re-invoked with null on every
  // render, which would tear the observers down under their own clips.
  const attachViewport = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    const host = forwarded.current;
    if (host) host.current = node;
  }, []);

  const [uncontrolled, setUncontrolled] =
    React.useState<string[]>(defaultPaused);
  const [spoken, setSpoken] = React.useState("");
  const pausedIds = paused ?? uncontrolled;

  const toggle = (id: string, next: boolean) => {
    if (paused === undefined) {
      setUncontrolled((prev) =>
        next ? [...prev, id] : prev.filter((item) => item !== id),
      );
    }
    onPausedChange?.(id, next);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={attachViewport}
        role="region"
        aria-label={label}
        tabIndex={0}
        style={{ maxHeight: viewportHeight }}
        className={cn(
          "overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 p-3",
          focusRing,
        )}
      >
        <ol role="list" className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {clips.map((clip) => (
              <ClipItem
                key={clip.id}
                clip={clip}
                rootRef={rootRef}
                threshold={threshold}
                fps={fps}
                visible={visible}
                motionSafe={motionSafe}
                peerName={peerName}
                handPaused={pausedIds.includes(clip.id)}
                onToggle={toggle}
                onSay={setSpoken}
                onFrameChange={onFrameChange}
                onLoop={onLoop}
                onInViewChange={onInViewChange}
              />
            ))}
          </AnimatePresence>
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
