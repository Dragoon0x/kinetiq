"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, stagger } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EchoMessage = {
  id: string;
  /** The sender's name; spoken with the text. */
  from: string;
  text: string;
  /** The viewer's own messages sit on the right and carry no avatar. */
  own?: boolean;
};

export type TypingEchoProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: EchoMessage[];
  /** Who is typing now, in the order they started. Empty collapses the slot. */
  typing: string[];
  /** Names spelled out before "and N others". @default 2 */
  max?: number;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** One wave period; three dots spaced a fifth of it apart never meet. */
const WAVE_S = 0.9;
const PHASE_S = 0.15;

const TONES = [
  "bg-cobalt-wash text-cobalt-bright",
  "bg-success/15 text-success",
  "bg-warn/15 text-warn",
  "bg-signal/15 text-signal",
] as const;

/** A name always lands on the same tone, on the server and the client alike. */
const toneFor = (name: string) => {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return TONES[sum % TONES.length] ?? TONES[0];
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const joinNames = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const captionFor = (names: string[], max: number) => {
  if (names.length === 0) return "";
  const listed = names.slice(0, Math.max(1, Math.floor(max)));
  const rest = names.length - listed.length;
  // With names left over the listed ones are comma-joined, so the sentence
  // never reads "Marta and Rui and 1 other".
  const who =
    rest > 0
      ? `${listed.join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`
      : joinNames(listed);
  return `${who} ${names.length === 1 ? "is" : "are"} typing`;
};

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border-2 border-surface-0 text-[9px] font-semibold",
        toneFor(name),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

type EchoProps = {
  names: string[];
  caption: string;
  motionSafe: boolean;
  visible: boolean;
};

/**
 * The echo of the bubble that is coming. Its dots ride one imperative wave
 * started here and stopped on unmount, so the loop can be held while the tab
 * is hidden instead of spinning unseen.
 */
function Echo({ names, caption, motionSafe, visible }: EchoProps) {
  const dotsRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    const row = dotsRef.current;
    if (!row || !visible) return;
    const dots = Array.from(row.querySelectorAll<HTMLElement>("[data-dot]"));
    if (dots.length === 0) return;
    // A keyframe wave is a tween (a spring takes two keyframes); the stagger
    // gives each dot its own phase, which the repeat then keeps.
    const controls = animate(
      dots,
      motionSafe ? { y: [0, -3, 0] } : { opacity: [0.35, 1, 0.35] },
      {
        duration: WAVE_S,
        ease: easings.move,
        repeat: Infinity,
        repeatDelay: PHASE_S,
        delay: stagger(PHASE_S),
      },
    );
    return () => controls.stop();
  }, [motionSafe, visible]);

  const shown = names.slice(0, 3);

  return (
    <motion.div
      aria-hidden
      initial={motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={motionSafe ? { y: springs.snap, opacity: FADE } : FADE}
      className="flex flex-col items-start gap-1 pt-3"
    >
      <div className="flex items-end gap-2">
        <span className="flex shrink-0 items-center">
          {shown.map((name, index) => (
            <Avatar
              key={`${index}-${name}`}
              name={name}
              className={index > 0 ? "-ml-2" : undefined}
            />
          ))}
        </span>
        <span
          ref={dotsRef}
          className="flex h-9 items-center gap-1 rounded-3 rounded-bl-1 bg-surface-2 px-3"
        >
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              data-dot
              className="block size-1.5 rounded-full bg-ink-2"
            />
          ))}
        </span>
      </div>
      <span className="pl-1 text-[11px] text-ink-3">{caption}</span>
    </motion.div>
  );
}

/**
 * They are typing, honestly. The indicator lives in the thread: under the
 * list sits a slot whose height is measured by a ResizeObserver, and when
 * `typing` names someone it glides open on `glide` while an echo of the bubble
 * that is coming — the typers' initial avatars beside an incoming-message
 * shape — rises on `snap`. Three dots inside ride one keyframe wave with a
 * stagger, so no two are ever at the same height, and a caption names exactly
 * who is typing and re-words itself as they come and go. When everyone stops
 * the echo fades on the exit ease and the slot gives its room back. Arrivals
 * land on `snap` with a fade. Under reduced motion the slot swaps on a tween,
 * the echo fades in place, and the dots pulse opacity instead of travelling.
 */
export function TypingEcho({
  ref,
  messages,
  typing,
  max = 2,
  label,
  className,
}: TypingEchoProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const active = typing.length > 0;
  const caption = captionFor(typing, max);

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

  // Announce each arrival once. The seen state is adjusted during render so
  // the sentence belongs to the message that came in, not to a later render.
  const last = messages[messages.length - 1];
  const [seen, setSeen] = React.useState<{ id: string | null; note: string }>(
    () => ({ id: last?.id ?? null, note: "" }),
  );
  if ((last?.id ?? null) !== seen.id) {
    setSeen({
      id: last?.id ?? null,
      note: last && !last.own ? `New message from ${last.from}` : seen.note,
    });
  }

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.li
              key={message.id}
              aria-label={`${message.own ? "You" : message.from}: ${message.text}`}
              initial={
                motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe ? { y: springs.snap, opacity: FADE } : FADE
              }
              className={cn(
                "flex items-end gap-2",
                message.own ? "justify-end" : "justify-start",
              )}
            >
              {!message.own ? <Avatar name={message.from} /> : null}
              <span
                className={cn(
                  "max-w-[82%] rounded-3 px-3 py-2 text-sm leading-snug wrap-break-word",
                  message.own
                    ? "rounded-br-1 bg-primary text-primary-foreground"
                    : "rounded-bl-1 bg-surface-2 text-foreground",
                )}
              >
                {message.text}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>

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
        <div ref={innerRef}>
          <AnimatePresence initial={false}>
            {active ? (
              <Echo
                key="echo"
                names={typing}
                caption={caption}
                motionSafe={motionSafe}
                visible={visible}
              />
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Mounted whether or not anyone is typing, so each change of caption is
          announced exactly once and silence announces nothing. */}
      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {caption}
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {seen.note}
      </span>
    </div>
  );
}
