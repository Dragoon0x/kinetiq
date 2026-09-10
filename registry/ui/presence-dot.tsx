"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PresenceStatus = "online" | "away" | "busy" | "offline";

export type PresenceDotSize = "sm" | "md" | "lg";

export type PresenceDotProps = {
  ref?: React.Ref<HTMLSpanElement>;
  /** The state; drives shape, colour, the breath and the ring. */
  status: PresenceStatus;
  /** Whose presence it is; opens the spoken sentence. */
  name?: string;
  /** Visible text beside the mark. Omit it and the status word is drawn. */
  label?: React.ReactNode;
  /** A quieter trailing clause ("back at 15:30"); spoken with the status. */
  detail?: string;
  /** 8 / 10 / 14px marks. @default "md" */
  size?: PresenceDotSize;
  /** Draws the status word beside the mark, so the shape is never alone. @default true */
  showWord?: boolean;
  /** The one-shot ring on a change; turn it off in dense rosters. @default true */
  ring?: boolean;
  /** Fires once per frozen sentence, from an effect, after a change. */
  onAnnounce?: (sentence: string) => void;
  className?: string;
};

/** SVG ids must survive url(#…) parsing — strip useId's sigil characters. */
const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");

const STATE: Record<PresenceStatus, { word: string; tone: string }> = {
  online: { word: "Online", tone: "text-success" },
  away: { word: "Away", tone: "text-warn" },
  busy: { word: "Busy", tone: "text-danger" },
  offline: { word: "Offline", tone: "text-muted-foreground" },
};

const SIZE: Record<PresenceDotSize, { mark: string; text: string }> = {
  sm: { mark: "size-2", text: "text-xs" },
  md: { mark: "size-2.5", text: "text-sm" },
  lg: { mark: "size-3.5", text: "text-sm" },
};

const sentenceFor = (
  status: PresenceStatus,
  name?: string,
  detail?: string,
): string => {
  const head = name
    ? `${name} is ${STATE[status].word.toLowerCase()}`
    : STATE[status].word;
  return detail ? `${head}, ${detail}` : head;
};

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Four states, four shapes, so colour is never the signal on its own: online is
 * a filled disc, away takes a crescent bite out of it, busy is crossed by a bar,
 * offline is a hollow ring at reduced opacity. The bite and the bar live in one
 * SVG mask and scale in on `snap` — nothing here asks motion to interpolate a
 * `d` whose command count changes. Away breathes, on a slow mirrored tween that
 * belongs to away alone, so a breathing dot always means the same thing. Every
 * change rings once: a single ring expands and fades, replayed by a key that
 * moves with the status rather than by a timer.
 *
 * The spoken sentence is frozen into state the moment the status differs from
 * the last one, so a polite status region says "Ines Moreau is away, back at
 * 15:30" once per change and not again on the next unrelated re-render. Under
 * reduced motion the shapes still swap and the dim still dims — shape is
 * information — but nothing breathes, rings or scales.
 */
export function PresenceDot({
  ref,
  status,
  name,
  label,
  detail,
  size = "md",
  showWord = true,
  ring = true,
  onAnnounce,
  className,
}: PresenceDotProps) {
  const motionSafe = useMotionSafe();
  const maskId = safeId(`${React.useId()}-mask`);
  const state = STATE[status];
  const scale = SIZE[size];
  const sentence = sentenceFor(status, name, detail);
  // With a visible label the name is already on screen, so the mark names only
  // the state; without one it has to carry the whole sentence itself.
  const clause = detail ? `${state.word}, ${detail}` : state.word;
  const markLabel = label ? clause : sentence;

  // Freezing the sentence at the moment of the change (and bumping the ring's
  // key with it) is what keeps the announcement tied to the change rather than
  // to whichever render happens to come next.
  const [seen, setSeen] = React.useState(() => ({ status, sentence, key: 0 }));
  if (seen.status !== status) {
    setSeen({ status, sentence, key: seen.key + 1 });
  } else if (seen.sentence !== sentence) {
    setSeen({ status, sentence, key: seen.key });
  }

  const announceRef = useLatest(onAnnounce);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    // The first sentence is the initial state, not a change; announcing it
    // would speak over whatever raised the component.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    announceRef.current?.(seen.sentence);
  }, [seen.sentence, announceRef]);

  const shape = motionSafe
    ? springs.snap
    : { duration: durations.fast, ease: easings.enter };
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const offline = status === "offline";

  return (
    <span
      ref={ref}
      className={cn("inline-flex max-w-full items-center gap-2", className)}
    >
      <motion.span
        role="img"
        aria-label={markLabel}
        className={cn(
          "relative grid shrink-0 place-items-center transition-colors",
          scale.mark,
          state.tone,
        )}
        style={{ transitionDuration: `${durations.base}s` }}
        initial={false}
        // Offline dims the whole mark rather than only recolouring it.
        animate={{ opacity: offline ? 0.65 : 1 }}
        transition={fade}
      >
        {motionSafe && status === "away" ? (
          <motion.span
            aria-hidden
            // A ring, not a wash: a filled halo would show through the crescent
            // and blunt the one thing that makes away legible without colour.
            className="absolute inset-0 rounded-full border border-current"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: [1, 1.45], opacity: [0.5, 0.12] }}
            transition={{
              duration: 2.4,
              ease: easings.move,
              repeat: Infinity,
              repeatType: "mirror",
            }}
          />
        ) : null}

        {motionSafe && ring && seen.key > 0 ? (
          <motion.span
            key={seen.key}
            aria-hidden
            className="absolute inset-0 rounded-full border border-current"
            initial={{ scale: 1, opacity: 0.55 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        ) : null}

        <svg viewBox="0 0 16 16" aria-hidden className="relative size-full">
          <mask id={maskId}>
            <rect width="16" height="16" fill="white" />
            {/* The bite and the bar are holes in the disc, so the shape reads on
                whatever surface the dot is dropped onto. */}
            <motion.circle
              cx="11.6"
              cy="4.4"
              r="4.6"
              fill="black"
              style={{ originX: 0.5, originY: 0.5 }}
              initial={false}
              animate={{ scale: status === "away" ? 1 : 0 }}
              transition={shape}
            />
            <motion.rect
              x="1.6"
              y="6.6"
              width="12.8"
              height="2.8"
              rx="1.4"
              fill="black"
              style={{ originX: 0.5, originY: 0.5 }}
              initial={false}
              animate={{ scaleX: status === "busy" ? 1 : 0 }}
              transition={shape}
            />
          </mask>
          <motion.circle
            cx="8"
            cy="8"
            r="6"
            fill="currentColor"
            mask={`url(#${maskId})`}
            initial={false}
            animate={{ opacity: offline ? 0 : 1 }}
            transition={fade}
          />
          <motion.circle
            cx="8"
            cy="8"
            r="4.9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            initial={false}
            animate={{ opacity: offline ? 1 : 0 }}
            transition={fade}
          />
        </svg>
      </motion.span>

      {label ? (
        <span
          className={cn(
            "min-w-0 truncate font-medium text-foreground",
            scale.text,
          )}
        >
          {label}
        </span>
      ) : null}

      {showWord ? (
        <span
          aria-hidden={label !== undefined}
          className={cn(
            "shrink-0",
            label
              ? "text-xs text-ink-3"
              : cn("font-medium text-foreground", scale.text),
          )}
        >
          {state.word}
        </span>
      ) : null}

      {detail ? (
        <span
          aria-hidden
          title={detail}
          className="min-w-0 truncate text-xs text-ink-3"
        >
          {detail}
        </span>
      ) : null}

      {/* The mark's own name is only read when the mark is reached; this is what
          lets a screen reader hear the change as it happens. */}
      <span role="status" aria-live="polite" className="sr-only">
        {seen.sentence}
      </span>
    </span>
  );
}
