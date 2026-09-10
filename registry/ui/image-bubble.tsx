"use client";

import * as React from "react";

import { AnimatePresence, motion, type Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PhotoMessage = {
  id: string;
  /** Own pictures sit on the right. */
  from: "me" | "peer";
  /** Draws the scene. The same seed always draws the same picture. */
  seed: number;
  /** One short line under the picture, and the viewer's heading. */
  caption: string;
  /** How much of the picture has arrived, 0..1. @default 1 */
  progress?: number;
  /** Printed under the picture, already formatted. */
  time?: string;
};

export type ImageBubbleProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The pictures in the thread, oldest first. */
  photos: PhotoMessage[];
  /** The other person; every sentence names them. @default "Them" */
  peerName?: string;
  /** Fires when a picture opens in the viewer. */
  onOpen?: (id: string) => void;
  /** Fires when the viewer closes, from the control or from Escape. */
  onClose?: (id: string) => void;
  /** Fires once, the first time a picture's progress reaches 1. */
  onSharp?: (id: string) => void;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

/** Blur of an untouched picture, in px. */
const MAX_BLUR = 14;
/** A picture starts grey and finds its colour. */
const MIN_SATURATION = 0.45;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** Three decimals: an unrounded float in an SVG attribute never hydrates. */
const r3 = (value: number) => Number(value.toFixed(3));

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * An integer hash stream. Integer ops are correctly rounded everywhere, so
 * unlike `Math.sin` the server and the browser draw the same picture.
 */
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

type Dot = { cx: number; cy: number; r: number };

type Scene = {
  horizon: number;
  shore: string;
  sun: Dot;
  stars: Dot[];
  rocks: { cx: number; cy: number; rx: number; ry: number }[];
  ripples: string[];
};

/** A harbour at dawn from a seed: three bands, then the things in them. */
function scene(seed: number): Scene {
  const next = stream(seed);
  const horizon = r3(52 + next() * 14);
  const sun = {
    cx: r3(24 + next() * 112),
    cy: r3(horizon - 12 - next() * 16),
    r: r3(6 + next() * 4),
  };
  const stars = [0, 1, 2, 3, 4].map(() => ({
    cx: r3(8 + next() * 144),
    cy: r3(6 + next() * Math.max(8, horizon - 24)),
    r: r3(0.8 + next() * 0.9),
  }));
  const crest = r3(92 + next() * 8);
  const shore = `M0,120 L0,${crest} Q${r3(38 + next() * 12)},${r3(crest - 8 - next() * 6)} 80,${r3(crest + next() * 5)} T160,${r3(crest - 2 - next() * 8)} L160,120 Z`;
  const rocks = [0, 1, 2].map((index) => ({
    cx: r3(18 + index * 52 + next() * 22),
    cy: r3(crest + 6 + next() * 8),
    rx: r3(7 + next() * 9),
    ry: r3(3 + next() * 3),
  }));
  const ripples = [0, 1, 2].map((index) => {
    const y = r3(horizon + 8 + index * 9 + next() * 4);
    const x = r3(12 + next() * 60);
    return `M${x},${y} h${r3(26 + next() * 44)}`;
  });
  return { horizon, shore, sun, stars, rocks, ripples };
}

type PictureProps = {
  view: Scene;
  /** 0..1 — the detail layer's presence, quiet until the picture is half here. */
  detail: number;
  skyId: string;
  transition: Transition;
};

/**
 * The picture is drawn, never loaded. The three bands stand from the first
 * frame — they are the placeholder — and the detail settles onto them as the
 * bytes land, so the viewer reads one picture developing rather than two
 * pictures cross-fading.
 */
function Picture({ view, detail, skyId, transition }: PictureProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="block size-full"
    >
      <defs>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-cobalt-wash)" />
          <stop offset="1" stopColor="var(--color-surface-0)" />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#${skyId})`} />
      <rect
        y={view.horizon}
        width="160"
        height={r3(120 - view.horizon)}
        className="fill-cobalt"
        opacity="0.3"
      />
      <path d={view.shore} className="fill-ink" opacity="0.16" />
      <motion.g
        initial={false}
        animate={{ opacity: detail }}
        transition={transition}
      >
        <circle
          cx={view.sun.cx}
          cy={view.sun.cy}
          r={view.sun.r}
          className="fill-warn"
          opacity="0.85"
        />
        {view.stars.map((star, index) => (
          <circle
            key={`star-${index}`}
            cx={star.cx}
            cy={star.cy}
            r={star.r}
            className="fill-ink"
            opacity="0.35"
          />
        ))}
        {view.ripples.map((path, index) => (
          <path
            key={`ripple-${index}`}
            d={path}
            className="stroke-surface-0"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
        ))}
        {view.rocks.map((rock, index) => (
          <ellipse
            key={`rock-${index}`}
            cx={rock.cx}
            cy={rock.cy}
            rx={rock.rx}
            ry={rock.ry}
            className="fill-ink"
            opacity="0.3"
          />
        ))}
      </motion.g>
    </svg>
  );
}

/** Binds a ResizeObserver to a node as it arrives, not to a ref read on mount. */
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

/** Keeps a callback out of an effect's deps so a re-render never replays it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const senderOf = (photo: PhotoMessage, peerName: string) =>
  photo.from === "me" ? "you" : peerName;

/**
 * A picture, arriving. Each photo is drawn from its seed — three bands of sky,
 * water and shore that stand from the first frame, with the sun, the stars and
 * the rocks settling onto them as the host's `progress` climbs — while the
 * frame's blur clears from 14px and its saturation lifts on a `durations.slow`
 * tween, because blur and colour are tweens rather than physics. A mono chip
 * reads the percentage and leaves on the exit ease once the picture is sharp.
 *
 * Pressing a sharp picture opens it inside the component's own box: the tile's
 * frame carries a `layoutId` prefixed with `useId`, so the same element grows
 * into a full-width viewer on `glide` instead of a second picture blinking in,
 * and the frame's height glides between the list's measured height and the
 * viewer's. The viewer is a `role="dialog"` in flow — focus moves to Close,
 * Tab cycles inside it, Escape closes and focus returns to the tile — so
 * nothing floats over whatever the host drew around the component. Under
 * reduced motion the blur still clears and the chip still counts, the viewer
 * cross-fades in, and no picture travels.
 */
export function ImageBubble({
  ref,
  photos,
  peerName = "Them",
  onOpen,
  onClose,
  onSharp,
  label,
  className,
}: ImageBubbleProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [listRef, listHeight] = useMeasuredHeight();
  const [viewerRef, viewerHeight] = useMeasuredHeight();
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  const tileId = (id: string) => `${baseId}-tile-${id}`;
  const open = photos.find((photo) => photo.id === openId) ?? null;

  const sharpIds = photos
    .filter((photo) => clamp01(photo.progress ?? 1) >= 1)
    .map((photo) => photo.id);
  const sharpKey = sharpIds.join(" ");

  // Sentences are frozen at the moment of the change, so the region speaks
  // the hop that happened rather than whatever a later re-render computes.
  const [spoken, setSpoken] = React.useState({ key: sharpKey, message: "" });
  if (spoken.key !== sharpKey) {
    const before = spoken.key === "" ? [] : spoken.key.split(" ");
    const arrived = sharpIds.filter((id) => !before.includes(id));
    const last = arrived[arrived.length - 1];
    const photo = photos.find((item) => item.id === last);
    setSpoken({
      key: sharpKey,
      message: photo ? `Photo sharp: ${photo.caption}` : spoken.message,
    });
  }

  // Reporting a settle belongs in an effect: a callback fired during render
  // would run for every parent re-render, and once per picture is the point.
  const onSharpRef = useLatest(onSharp);
  const [reported] = React.useState(() => new Set<string>(sharpIds));
  React.useEffect(() => {
    const ids = sharpKey === "" ? [] : sharpKey.split(" ");
    for (const id of ids) {
      if (reported.has(id)) continue;
      reported.add(id);
      onSharpRef.current?.(id);
    }
  }, [sharpKey, reported, onSharpRef]);

  React.useEffect(() => {
    if (openId === null) return;
    closeRef.current?.focus();
  }, [openId]);

  const openPhoto = (id: string, caption: string) => {
    setOpenId(id);
    setSpoken((current) => ({
      ...current,
      message: `Viewer open: ${caption}`,
    }));
    onOpen?.(id);
  };

  const closeViewer = () => {
    if (openId === null) return;
    const id = openId;
    setOpenId(null);
    setSpoken((current) => ({ ...current, message: "Viewer closed" }));
    onClose?.(id);
    // The tile button stays mounted behind the viewer, so focus can go home
    // in the same commit rather than falling to the body.
    document.getElementById(tileId(id))?.focus();
  };

  const trapKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeViewer();
      return;
    }
    if (event.key !== "Tab") return;
    const stops = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled])",
      ),
    );
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

  const pictureTween = motionSafe
    ? { duration: durations.slow, ease: easings.enter }
    : { duration: durations.fast, ease: easings.enter };
  const heightTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <motion.div
        initial={false}
        animate={{
          height:
            (openId === null ? listHeight : (viewerHeight ?? listHeight)) ??
            "auto",
        }}
        transition={heightTransition}
        className="overflow-hidden"
      >
        <div className="grid">
          <motion.div
            ref={listRef}
            aria-hidden={openId !== null}
            initial={false}
            animate={{ opacity: openId === null ? 1 : 0 }}
            transition={FADE}
            className={cn(
              "col-start-1 row-start-1",
              openId !== null && "pointer-events-none",
            )}
          >
            <ol
              role="list"
              aria-label={label}
              className="flex flex-col gap-3 px-0.5 pb-0.5"
            >
              {photos.map((photo) => {
                const fraction = clamp01(photo.progress ?? 1);
                const sharp = fraction >= 1;
                const percent = Math.round(fraction * 100);
                const view = scene(photo.seed);
                const sender = senderOf(photo, peerName);
                const filter = `blur(${r3((1 - fraction) * MAX_BLUR)}px) saturate(${r3(
                  MIN_SATURATION + (1 - MIN_SATURATION) * fraction,
                )})`;
                const hidden = openId === photo.id;
                return (
                  <li
                    key={photo.id}
                    className={cn(
                      "flex flex-col gap-1",
                      photo.from === "me" ? "items-end" : "items-start",
                    )}
                  >
                    <div className="relative w-[70%] max-w-60">
                      <button
                        type="button"
                        id={tileId(photo.id)}
                        disabled={!sharp}
                        onClick={() => openPhoto(photo.id, photo.caption)}
                        aria-label={
                          sharp
                            ? `Open photo: ${photo.caption}, from ${sender}`
                            : `Loading photo, ${percent} percent: ${photo.caption}, from ${sender}`
                        }
                        className="block w-full rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {hidden ? (
                          <span className="block aspect-[4/3] w-full rounded-3 border border-hairline bg-surface-2" />
                        ) : (
                          <motion.span
                            layoutId={
                              motionSafe
                                ? `${baseId}-frame-${photo.id}`
                                : undefined
                            }
                            transition={springs.glide}
                            className="block aspect-[4/3] w-full overflow-hidden rounded-3 border border-hairline bg-surface-2"
                          >
                            <motion.span
                              initial={false}
                              animate={{ filter }}
                              transition={pictureTween}
                              className="block size-full"
                            >
                              <Picture
                                view={view}
                                detail={clamp01((fraction - 0.35) / 0.65)}
                                skyId={`${baseId}-sky-${photo.id}`}
                                transition={pictureTween}
                              />
                            </motion.span>
                          </motion.span>
                        )}
                      </button>

                      <AnimatePresence initial={false}>
                        {sharp ? null : (
                          <motion.span
                            key="chip"
                            role="progressbar"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuetext={`${percent} percent of ${photo.caption} received`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: exitFor() }}
                            transition={FADE}
                            className="pointer-events-none absolute top-2 left-2 rounded-full bg-surface-0/90 px-2 py-0.5 font-mono text-[10px] text-ink-2 tabular-nums"
                          >
                            {percent}%
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>

                    <span className="flex max-w-[70%] items-center gap-1.5 px-1 text-[11px] text-ink-3">
                      <span className="truncate" title={photo.caption}>
                        {photo.caption}
                      </span>
                      {photo.time ? (
                        <span className="shrink-0 tabular-nums">
                          {photo.time}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.div>

          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="viewer"
                ref={viewerRef}
                role="dialog"
                aria-label={`Photo: ${open.caption}, from ${senderOf(open, peerName)}`}
                onKeyDown={trapKeys}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={FADE}
                className="col-start-1 row-start-1 flex flex-col gap-2 px-0.5 pb-0.5"
              >
                <motion.span
                  layoutId={
                    motionSafe ? `${baseId}-frame-${open.id}` : undefined
                  }
                  transition={springs.glide}
                  className="block aspect-[4/3] w-full overflow-hidden rounded-3 border border-hairline bg-surface-2"
                >
                  <Picture
                    view={scene(open.seed)}
                    detail={1}
                    skyId={`${baseId}-sky-viewer`}
                    transition={pictureTween}
                  />
                </motion.span>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 text-xs leading-snug text-ink-2">
                    <span className="font-medium text-foreground">
                      {open.caption}
                    </span>
                    <span className="text-ink-3">
                      {" · "}
                      {senderOf(open, peerName)}
                      {open.time ? ` · ${open.time}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    ref={closeRef}
                    onClick={closeViewer}
                    className="flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-cobalt-wash"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.message}
      </span>
    </div>
  );
}
