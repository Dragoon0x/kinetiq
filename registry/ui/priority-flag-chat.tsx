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

export type PriorityMessage = {
  id: string;
  /** Who sent it. Printed above the text and spoken in the control's name. */
  author: string;
  /** The message itself. */
  text: string;
  /** Urgent messages get the rail, the pulse and the control. */
  urgent?: boolean;
  /** Already seen by someone; the rail cools and the control becomes a stamp. */
  acknowledged?: boolean;
  /** Who acknowledged it. @default "you" */
  acknowledgedBy?: string;
};

export type PriorityFlagChatProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: PriorityMessage[];
  /** Fires from a row's control; set `acknowledged` on that message here. */
  onAcknowledge?: (id: string) => void;
  /** Fires when the number of unacknowledged urgent messages changes. */
  onPendingChange?: (pending: number) => void;
  /** Fires once per frozen change sentence. */
  onAnnounce?: (sentence: string) => void;
  /** Names the thread for assistive technology. */
  label: string;
  /** Copy for the row control. @default "Acknowledge" */
  acknowledgeLabel?: string;
  /** The strip above the thread. @default "Priority" */
  heading?: string;
  /** How tall the thread grows before it scrolls inside its own box. @default 260 */
  maxHeight?: number;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** One string per reading, so no accessible name is spliced from two nodes. */
const waitingSentence = (pending: number): string =>
  pending === 0
    ? "Nothing urgent waiting."
    : pending === 1
      ? "One urgent message waiting."
      : `${pending} urgent messages waiting.`;

const controlSentence = (
  message: PriorityMessage,
  acknowledgeLabel: string,
): string =>
  message.acknowledged
    ? `Acknowledged by ${message.acknowledgedBy ?? "you"}.`
    : `${acknowledgeLabel} the urgent message from ${message.author}.`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type Seen = { urgent: boolean; acknowledged: boolean };

const signatureOf = (messages: PriorityMessage[]): string =>
  messages
    .map(
      (one) =>
        `${one.id}:${one.urgent === true ? 1 : 0}:${one.acknowledged === true ? 1 : 0}`,
    )
    .join("|");

const mapOf = (messages: PriorityMessage[]): Record<string, Seen> => {
  const map: Record<string, Seen> = {};
  for (const one of messages) {
    map[one.id] = {
      urgent: one.urgent === true,
      acknowledged: one.acknowledged === true,
    };
  }
  return map;
};

const pendingIn = (messages: PriorityMessage[]): number =>
  messages.filter((one) => one.urgent === true && one.acknowledged !== true)
    .length;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * A raised flag whose pennant retracts as the tick draws. Each is its own path
 * run from `pathLength` 0 to 1, so motion never interpolates a `d` — which it
 * cannot do once the command count differs.
 */
function FlagGlyph({
  calm,
  motionSafe,
}: {
  calm: boolean;
  motionSafe: boolean;
}) {
  const draw = motionSafe ? springs.flick : { duration: durations.fast };
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0">
      <path {...STROKE} d="M4.6 2.6v10.8" />
      <motion.path
        {...STROKE}
        d="M4.6 3.4h6.8l-1.5 2.4 1.5 2.4H4.6"
        initial={false}
        animate={{ pathLength: calm ? 0 : 1, opacity: calm ? 0 : 1 }}
        transition={draw}
      />
      <motion.path
        {...STROKE}
        d="m7.4 8.6 2 2 4-4.4"
        initial={false}
        animate={{ pathLength: calm ? 1 : 0, opacity: calm ? 1 : 0 }}
        transition={draw}
      />
    </svg>
  );
}

type RowProps = {
  message: PriorityMessage;
  buttonId: string;
  tab: number;
  acknowledgeLabel: string;
  motionSafe: boolean;
  onAcknowledge: () => void;
  onFocusRow: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

function PriorityRow({
  message,
  buttonId,
  tab,
  acknowledgeLabel,
  motionSafe,
  onAcknowledge,
  onFocusRow,
  onKeyDown,
}: RowProps) {
  const urgent = message.urgent === true;
  const calm = message.acknowledged === true;

  return (
    <motion.li
      initial={
        motionSafe
          ? { opacity: 0, x: urgent ? distances.step : distances.nudge }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={motionSafe ? springs.glide : FADE}
    >
      <div
        className={cn(
          "relative rounded-2 border py-2 pr-2.5 pl-3 transition-colors",
          urgent && !calm
            ? "border-danger/30"
            : urgent
              ? "border-hairline-strong"
              : "border-hairline",
          urgent ? "bg-surface-2" : "bg-surface-2/60",
        )}
      >
        {urgent ? (
          <>
            {/* The wash breathes rather than bounces: an urgent message
                insists, it does not celebrate. A tween, because a pulse has to
                come back and a spring takes exactly two keyframes. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2 bg-danger"
              initial={false}
              animate={
                motionSafe && !calm
                  ? { opacity: [0.06, 0.16] }
                  : { opacity: calm ? 0 : 0.1 }
              }
              transition={
                motionSafe && !calm
                  ? {
                      duration: durations.page,
                      ease: easings.move,
                      repeat: Infinity,
                      repeatType: "reverse",
                    }
                  : FADE
              }
            />
            {/* The rail draws downward from the bubble's top on the layout
                spring; the danger layer above it fades to leave the hairline. */}
            <motion.span
              aria-hidden
              className="absolute inset-y-1 left-0 w-0.5 origin-top overflow-hidden rounded-full bg-hairline-strong"
              initial={motionSafe ? { scaleY: 0 } : { scaleY: 1 }}
              animate={{ scaleY: 1 }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              <motion.span
                className="absolute inset-0 bg-danger"
                initial={false}
                animate={{ opacity: calm ? 0 : 1 }}
                transition={{ duration: durations.slow, ease: easings.move }}
              />
            </motion.span>
          </>
        ) : null}

        <div className="relative flex flex-col gap-1">
          {urgent ? <span className="sr-only">Urgent message.</span> : null}
          <p
            className={cn(
              "truncate text-[11px] font-medium",
              urgent ? "text-ink-2" : "text-ink-3",
            )}
          >
            {message.author}
          </p>
          <p className="text-sm leading-snug text-foreground">{message.text}</p>

          {urgent ? (
            <div className="mt-0.5 flex items-center gap-2">
              <span
                aria-hidden
                className={cn(
                  "flex items-center gap-1 text-[11px] font-medium transition-colors",
                  calm ? "text-ink-3" : "text-danger",
                )}
              >
                <FlagGlyph calm={calm} motionSafe={motionSafe} />
                {calm ? "Seen" : "Urgent"}
              </span>
              <button
                type="button"
                id={buttonId}
                tabIndex={tab}
                aria-disabled={calm}
                aria-label={controlSentence(message, acknowledgeLabel)}
                onFocus={onFocusRow}
                onKeyDown={onKeyDown}
                onClick={() => {
                  if (calm) return;
                  onAcknowledge();
                }}
                className={cn(
                  // Never shrink-0: a long acknowledgement label truncates
                  // rather than pushing the row past the phone column.
                  "ml-auto flex h-7 min-w-0 items-center rounded-2 border px-2.5 text-xs font-medium transition-colors",
                  calm
                    ? "border-transparent text-ink-3"
                    : "border-hairline-strong bg-card hover:bg-accent",
                  focusRing,
                )}
              >
                <span aria-hidden className="truncate">
                  {calm
                    ? `Seen by ${message.acknowledgedBy ?? "you"}`
                    : acknowledgeLabel}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </motion.li>
  );
}

/**
 * Urgent, and then quiet again. A message the host marked urgent arrives eight
 * pixels out of place and settles on `glide` while a danger rail draws down its
 * leading edge from `scaleY` 0, and a wash behind it breathes on a repeating
 * tween — the honest shape for a pulse, since a spring takes exactly two
 * keyframes and a breath has to come back. Nothing bounces: an urgent message
 * insists rather than celebrates.
 *
 * Acknowledging calms it in small confirmations. The wash stops, the rail cools
 * from danger to hairline across `durations.slow`, the flag's pennant retracts
 * as a tick draws in its place on `flick` — one path each, run by `pathLength`,
 * so no `d` is ever interpolated — and the control stays exactly where it was,
 * keeping its place in the roving order and its focus, now reading who saw it.
 * The strip above counts what is still waiting and changes without a flourish
 * of its own.
 *
 * The thread is an `<ol role="list">` of real messages; urgency is carried by a
 * sentence rather than by colour, the controls are one tab stop under a roving
 * tabindex where Down and Up step and Home and End jump, and a status region
 * says what changed as it changes, frozen at the moment the messages differ.
 * Under reduced motion nothing travels and nothing breathes: the rail is drawn
 * whole, the wash holds one steady tint, and the cooling still happens, because
 * urgency is information.
 */
export function PriorityFlagChat({
  ref,
  messages,
  onAcknowledge,
  onPendingChange,
  onAnnounce,
  label,
  acknowledgeLabel = "Acknowledge",
  heading = "Priority",
  maxHeight = 260,
  className,
}: PriorityFlagChatProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const buttonId = (id: string) => `${uid}-ack-${id}`;

  const urgentIds = React.useMemo(
    () =>
      messages
        .filter((one) => one.urgent === true)
        .map((message) => message.id),
    [messages],
  );
  const pending = pendingIn(messages);

  // The sentence is frozen the moment the thread differs, so it belongs to that
  // change rather than to a later unrelated re-render.
  const signature = signatureOf(messages);
  const [beat, setBeat] = React.useState(() => ({
    signature,
    map: mapOf(messages),
    sentence: "",
    stamp: 0,
  }));
  if (beat.signature !== signature) {
    const arrived: PriorityMessage[] = [];
    let acknowledged: PriorityMessage | null = null;
    for (const message of messages) {
      const before = beat.map[message.id];
      if (!before && message.urgent === true && message.acknowledged !== true) {
        arrived.push(message);
      }
      if (before && !before.acknowledged && message.acknowledged === true) {
        acknowledged = message;
      }
    }
    const next = pendingIn(messages);
    const first = arrived[0];
    const sentence =
      arrived.length === 1 && first
        ? `Urgent from ${first.author}. ${waitingSentence(next)}`
        : arrived.length > 1
          ? `${arrived.length} urgent messages arrived. ${waitingSentence(next)}`
          : acknowledged
            ? `Acknowledged. ${waitingSentence(next)}`
            : beat.sentence;
    setBeat({
      signature,
      map: mapOf(messages),
      sentence,
      stamp: beat.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  const firstBeat = React.useRef(true);
  React.useEffect(() => {
    if (firstBeat.current) {
      firstBeat.current = false;
      return;
    }
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const pendingChangeRef = useLatest(onPendingChange);
  const reported = React.useRef(pending);
  React.useEffect(() => {
    if (reported.current === pending) return;
    reported.current = pending;
    pendingChangeRef.current?.(pending);
  }, [pending, pendingChangeRef]);

  // The roving index follows the row's identity, so a thread that grows under
  // the focus never moves it.
  const [active, setActive] = React.useState<string | null>(null);
  const focusedId = active ?? urgentIds[0] ?? "";
  const activeIndex = Math.max(
    0,
    urgentIds.findIndex((id) => id === focusedId),
  );

  const focusAt = (index: number) => {
    const clamped = Math.min(urgentIds.length - 1, Math.max(0, index));
    const id = urgentIds[clamped];
    if (id === undefined) return;
    setActive(id);
    document.getElementById(buttonId(id))?.focus();
  };

  const keyHandler =
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(index + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(urgentIds.length - 1);
      }
    };

  // The thread follows its own tail, the way a thread does. A DOM write in an
  // effect, never a layout read during render.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const last = messages[messages.length - 1]?.id ?? "";
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof node.scrollTo !== "function") return;
    node.scrollTo({ top: node.scrollHeight, behavior: "auto" });
  }, [last]);

  return (
    <div
      ref={ref}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase">
          {heading}
        </span>
        <span
          className={cn(
            "ml-auto flex h-5 items-center rounded-full px-2 font-mono text-[10px] tracking-[0.04em] transition-colors",
            pending > 0
              ? "bg-danger/12 text-danger"
              : "border border-hairline text-ink-3",
          )}
        >
          {pending > 0 ? `${pending} waiting` : "All seen"}
        </span>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto overscroll-contain"
        style={{ maxHeight: Math.round(maxHeight) }}
      >
        <ol role="list" aria-label={label} className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {messages.map((message) => {
              const index = urgentIds.indexOf(message.id);
              return (
                <PriorityRow
                  key={message.id}
                  message={message}
                  buttonId={buttonId(message.id)}
                  tab={index === activeIndex ? 0 : -1}
                  acknowledgeLabel={acknowledgeLabel}
                  motionSafe={motionSafe}
                  onAcknowledge={() => onAcknowledge?.(message.id)}
                  onFocusRow={() => setActive(message.id)}
                  onKeyDown={keyHandler(index)}
                />
              );
            })}
          </AnimatePresence>
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
