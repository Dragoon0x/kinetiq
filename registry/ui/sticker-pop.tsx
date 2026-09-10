"use client";

import * as React from "react";

import { motion, useAnimationControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StickerArt = "wave" | "star" | "cat" | "bolt";

export type StickerMessage = {
  id: string;
  /** Own messages sit on the right. */
  from: "me" | "peer";
  /** Which figure is drawn. Omit it and pass `text` for a plain bubble. */
  art?: StickerArt;
  /** A plain message, for the lines between stickers. */
  text?: string;
  /** Tilts the hover nudge one way or the other. @default 1 */
  seed?: number;
  /** Printed under the message, already formatted. */
  time?: string;
};

export type StickerPopProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: StickerMessage[];
  /** The other person; every sentence names them. @default "Them" */
  peerName?: string;
  /** Fires when a landing finishes, on arrival and on every replay. */
  onLand?: (id: string) => void;
  /** Fires from a press, or Enter or Space, on a landed sticker. */
  onReplay?: (id: string) => void;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const ART_WORD: Record<StickerArt, string> = {
  wave: "hand wave",
  star: "star",
  cat: "cat",
  bolt: "bolt",
};

const r3 = (value: number) => Number(value.toFixed(3));

/** The star's points come out of trigonometry, so they are rounded to three
 *  decimals: Node and the browser disagree in the last digits of `Math.cos`,
 *  and a mismatched attribute is a hydration error. */
const STAR_POINTS = Array.from({ length: 10 }, (_, index) => {
  const radius = index % 2 === 0 ? 34 : 15;
  const angle = ((-90 + index * 36) * Math.PI) / 180;
  return `${r3(48 + radius * Math.cos(angle))},${r3(48 + radius * Math.sin(angle))}`;
}).join(" ");

/**
 * Every sticker is drawn, never an asset and never a glyph: a die-cut edge
 * comes from painting the stroke behind the fill, so the figure reads as a
 * thing stuck onto the thread rather than a picture in it.
 */
function Sticker({ art }: { art: StickerArt }) {
  const cut = {
    stroke: "var(--color-surface-0)",
    strokeWidth: 7,
    strokeLinejoin: "round" as const,
    style: { paintOrder: "stroke" as const },
  };

  if (art === "star") {
    return (
      <svg viewBox="0 0 96 96" aria-hidden className="size-full">
        <polygon points={STAR_POINTS} className="fill-warn" {...cut} />
        <circle
          cx="48"
          cy="48"
          r="7"
          className="fill-surface-0"
          opacity="0.6"
        />
      </svg>
    );
  }

  if (art === "cat") {
    return (
      <svg viewBox="0 0 96 96" aria-hidden className="size-full">
        <g className="fill-cobalt" {...cut}>
          <polygon points="26,34 30,12 46,24" />
          <polygon points="70,34 66,12 50,24" />
          <circle cx="48" cy="54" r="27" />
        </g>
        <g className="fill-surface-0">
          <circle cx="38" cy="50" r="4" />
          <circle cx="58" cy="50" r="4" />
        </g>
        <g
          className="stroke-surface-0"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.8"
        >
          <path d="M30 62h-12M30 68h-11M66 62h12M66 68h11" />
        </g>
        <path d="M44 60h8l-4 5z" className="fill-surface-0" />
      </svg>
    );
  }

  if (art === "bolt") {
    return (
      <svg viewBox="0 0 96 96" aria-hidden className="size-full">
        <polygon
          points="54,10 26,52 44,52 38,86 70,42 50,42 58,10"
          className="fill-signal"
          {...cut}
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 96 96" aria-hidden className="size-full">
      <g className="fill-success" {...cut}>
        <rect x="32" y="40" width="34" height="40" rx="14" />
        <rect x="34" y="22" width="7" height="26" rx="3.5" />
        <rect x="43" y="16" width="7" height="32" rx="3.5" />
        <rect x="52" y="18" width="7" height="30" rx="3.5" />
        <rect x="61" y="26" width="7" height="22" rx="3.5" />
        <rect
          x="20"
          y="42"
          width="7"
          height="22"
          rx="3.5"
          transform="rotate(-28 23.5 53)"
        />
      </g>
    </svg>
  );
}

type ItemProps = {
  message: StickerMessage;
  art: StickerArt;
  sender: string;
  motionSafe: boolean;
  onLand?: (id: string) => void;
  onReplay: (id: string, word: string) => void;
};

/**
 * The landing lives in this component so a replay is a fresh drop rather than
 * a remount: remounting the button would take the keyboard's focus with it.
 * `set` puts the sticker at the top and one spring brings it home — two
 * keyframes, because a spring silently drops a third.
 */
function StickerItem({
  message,
  art,
  sender,
  motionSafe,
  onLand,
  onReplay,
}: ItemProps) {
  const sticker = useAnimationControls();
  const shadow = useAnimationControls();
  const ring = useAnimationControls();
  const [replays, setReplays] = React.useState(0);
  const [nudged, setNudged] = React.useState(false);
  const tilt = (message.seed ?? 1) % 2 === 0 ? 3 : -3;
  const word = ART_WORD[art];

  const onLandRef = React.useRef(onLand);
  React.useEffect(() => {
    onLandRef.current = onLand;
  });

  React.useEffect(() => {
    let cancelled = false;

    const drop = async () => {
      if (!motionSafe) {
        sticker.set({ y: 0, scale: 1, opacity: 1 });
        shadow.set({ scaleX: 1, opacity: 0.28 });
        if (replays > 0) {
          // The bounce is flourish, but the acknowledgement is information:
          // a ring answers the press without anything travelling.
          await ring.start({
            opacity: [0, 0.9, 0],
            transition: { duration: durations.slow, ease: easings.move },
          });
        }
        if (!cancelled) onLandRef.current?.(message.id);
        return;
      }
      sticker.set({ y: -distances.shift, scale: 0.86, opacity: 0 });
      shadow.set({ scaleX: 0.6, opacity: 0.1 });
      void shadow.start({
        scaleX: 1,
        opacity: 0.28,
        transition: springs.glide,
      });
      await sticker.start({
        y: 0,
        scale: 1,
        opacity: 1,
        transition: {
          y: springs.recoil,
          scale: springs.recoil,
          opacity: FADE,
        },
      });
      if (!cancelled) onLandRef.current?.(message.id);
    };

    void drop();
    return () => {
      cancelled = true;
      sticker.stop();
      shadow.stop();
      ring.stop();
    };
  }, [replays, motionSafe, sticker, shadow, ring, message.id]);

  return (
    <div className="relative size-24">
      <motion.span
        aria-hidden
        initial={{ scaleX: 0.6, opacity: 0.1 }}
        animate={shadow}
        className="absolute inset-x-4 bottom-0.5 h-1.5 rounded-full bg-ink"
      />
      <motion.span
        aria-hidden
        initial={{ opacity: 0 }}
        animate={ring}
        className="pointer-events-none absolute inset-1 rounded-full border-2 border-cobalt-bright"
      />
      <motion.button
        type="button"
        aria-label={`Replay sticker: ${word}, from ${sender}`}
        onClick={() => {
          setReplays((count) => count + 1);
          onReplay(message.id, word);
        }}
        onPointerEnter={() => setNudged(true)}
        onPointerLeave={() => setNudged(false)}
        onFocus={() => setNudged(true)}
        onBlur={() => setNudged(false)}
        initial={
          motionSafe
            ? { y: -distances.shift, scale: 0.86, opacity: 0 }
            : { opacity: 0 }
        }
        animate={sticker}
        className={cn(
          "relative block size-24 rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {/* The nudge sits on its own element, so the drop's controls and the
            hover never write the same transform. */}
        <motion.span
          initial={false}
          animate={{
            y: motionSafe && nudged ? -3 : 0,
            rotate: motionSafe && nudged ? tilt : 0,
          }}
          transition={springs.flick}
          className="block size-full"
        >
          <Sticker art={art} />
        </motion.span>
      </motion.button>
    </div>
  );
}

/**
 * A sticker that lands with weight. Each figure is drawn — a waving hand of
 * capsules, a five-point star from rounded polar coordinates, a cat, a bolt —
 * and drops from 16px above at 0.86 scale on `recoil`, whose ζ0.53 gives the
 * two visible bounces of something dropped rather than placed, while the
 * ellipse beneath it widens and deepens on `glide` half a beat behind, so the
 * weight reads as a contact shadow rather than as a shrinking sticker.
 *
 * Hovering or focusing nudges it 3px up with a 3-degree tilt whose direction
 * comes from the sticker's own seed, on `flick`, and it returns the moment the
 * pointer or focus leaves. Pressing replays the landing — the sticker is a
 * button, so the keyboard replays it too — driven by animation controls rather
 * than a remount, which would take the focus with it. Arrivals announce
 * themselves once from a sentence frozen at the change. Under reduced motion
 * nothing drops and nothing tilts: the sticker is simply there, and a press is
 * answered by a ring that pulses once, because the acknowledgement is
 * information even when the bounce is not.
 */
export function StickerPop({
  ref,
  messages,
  peerName = "Them",
  onLand,
  onReplay,
  label,
  className,
}: StickerPopProps) {
  const motionSafe = useMotionSafe();

  const idKey = messages.map((message) => message.id).join(" ");

  // The sentence is frozen at the arrival that produced it, so a re-render
  // never re-announces a sticker that landed long ago.
  const [spoken, setSpoken] = React.useState({ key: idKey, message: "" });
  if (spoken.key !== idKey) {
    const before = spoken.key === "" ? [] : spoken.key.split(" ");
    const arrived = messages.filter(
      (message) => !before.includes(message.id) && message.art,
    );
    const last = arrived[arrived.length - 1];
    setSpoken({
      key: idKey,
      message:
        last && last.art
          ? `${last.from === "me" ? "You" : peerName} sent a sticker: ${ART_WORD[last.art]}`
          : spoken.message,
    });
  }

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <ol
        role="list"
        aria-label={label}
        className="flex flex-col gap-3 px-0.5 pb-0.5"
      >
        {messages.map((message) => {
          const own = message.from === "me";
          const sender = own ? "you" : peerName;
          return (
            <li
              key={message.id}
              className={cn(
                "flex flex-col gap-1",
                own ? "items-end" : "items-start",
              )}
            >
              {message.art ? (
                <StickerItem
                  message={message}
                  art={message.art}
                  sender={sender}
                  motionSafe={motionSafe}
                  onLand={onLand}
                  onReplay={(id, word) => {
                    setSpoken((current) => ({
                      ...current,
                      message: `Replayed: ${word}`,
                    }));
                    onReplay?.(id);
                  }}
                />
              ) : (
                <span
                  className={cn(
                    "max-w-[82%] rounded-3 border border-transparent px-3 py-2 text-sm leading-snug wrap-break-word",
                    own
                      ? "rounded-br-1 bg-primary text-primary-foreground"
                      : "rounded-bl-1 bg-surface-2 text-foreground",
                  )}
                >
                  {message.text}
                </span>
              )}

              <span className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3">
                <span>{own ? "You" : peerName}</span>
                {message.time ? (
                  <span className="tabular-nums">{message.time}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.message}
      </span>
    </div>
  );
}
