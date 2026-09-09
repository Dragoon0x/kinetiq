"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ScheduleOption = {
  id: string;
  /** Printed on the chip and spoken by the send button: "Tomorrow 9:00". */
  label: string;
  /** 0–23, the hour the short hand sweeps to. */
  hour: number;
  /** 0–59, the minute the long hand sweeps to. */
  minute: number;
  /** How long the queue holds a message before the parent is told to deliver. */
  delayMs: number;
};

export type ScheduledMessage = {
  id: string;
  text: string;
  /** Which option queued it; names the wait on the card. */
  optionId: string;
};

export type ScheduleChipProps = {
  ref?: React.Ref<HTMLDivElement>;
  options: ScheduleOption[];
  /** Controlled chosen option id. */
  value?: string | null;
  /** Initial chosen option for uncontrolled usage. @default null */
  defaultValue?: string | null;
  /** Fires from a pick, a clear, and after a queue. */
  onValueChange?: (id: string | null) => void;
  /** The queued messages the parent holds, oldest first. */
  queue: ScheduledMessage[];
  /** Controlled composer text. */
  draft?: string;
  /** Initial composer text for uncontrolled usage. */
  defaultDraft?: string;
  /** Fires from every edit and from the clear after a send or a queue. */
  onDraftChange?: (text: string) => void;
  /** Fires from Enter or Send with no time chosen. */
  onSend?: (text: string) => void;
  /** Fires from Enter or Send with a time chosen; append to `queue`. */
  onQueue?: (text: string, option: ScheduleOption) => void;
  /** Fires when a queued message's wait reaches zero; remove it from `queue`. */
  onDeliver?: (id: string) => void;
  /** @default "Message" */
  placeholder?: string;
  /** Names the composer for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
/** The arrow and the face cross slowly enough that the hands' sweep reads. */
const CROSS = { duration: durations.base, ease: easings.enter } as const;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Only origin* keys survive motion's transform-origin rewrite for SVG. */
const HUB = {
  transformBox: "view-box",
  originX: "8px",
  originY: "8px",
} as const;

const RING = {
  cx: 12,
  cy: 12,
  r: 10,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
} as const;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/** Keeps a callback out of effect dependencies so a re-render never restarts a wait. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const firstWords = (text: string): string => {
  const words = text.trim().split(/\s+/);
  return words.length > 6 ? `${words.slice(0, 6).join(" ")}…` : text.trim();
};

const waitLabel = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return total < 60 ? `${total}s` : `${Math.round(total / 60)}m`;
};

/** Degrees clockwise from twelve, rounded before they reach a motion target. */
const anglesFor = (option: ScheduleOption | undefined) => {
  if (!option) return { hour: 0, minute: 0 };
  const minute = ((Math.trunc(option.minute) % 60) + 60) % 60;
  const hour = ((Math.trunc(option.hour) % 12) + 12) % 12;
  return {
    hour: Math.round((hour * 30 + minute * 0.5) * 1000) / 1000,
    minute: minute * 6,
  };
};

/** A hand turns about the face's hub at (8,8), never about its own box. */
const Hand = ({
  tip,
  rotate,
  transition,
}: {
  tip: number;
  rotate: number;
  transition: Transition;
}) => (
  <motion.line
    x1="8"
    y1="8"
    x2="8"
    y2={tip}
    initial={false}
    animate={{ rotate }}
    transition={transition}
    style={{ ...HUB }}
  />
);

const Clock = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    aria-hidden
    {...STROKE}
    className={cn("shrink-0", className)}
  >
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.6V8l2.3 1.4" />
  </svg>
);

/**
 * One card owns one wait. The remainder lives in a motion value, so the ring
 * drains and the seconds count down without a re-render, and a hidden tab
 * simply stops the animation: the value holds where it was and the next
 * visible frame resumes from it rather than from the top.
 */
function QueueCard({
  message,
  option,
  visible,
  motionSafe,
  onElapse,
}: {
  message: ScheduledMessage;
  option: ScheduleOption | undefined;
  visible: boolean;
  motionSafe: boolean;
  onElapse: (id: string) => void;
}) {
  const seconds = Math.max(1, Math.round((option?.delayMs ?? 0) / 1000));
  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);
  const countText = useTransform(
    remaining,
    (value) => `${Math.max(0, Math.ceil(value * seconds))}s`,
  );
  const elapse = useLatest(onElapse);
  const id = message.id;

  React.useEffect(() => {
    if (!visible) return;
    const controls = animate(remaining, 0, {
      // A wait is information, so it drains at the same linear rate whatever
      // the motion preference says.
      duration: seconds * remaining.get(),
      ease: easings.linear,
      onComplete: () => elapse.current(id),
    });
    return () => controls.stop();
  }, [visible, seconds, remaining, elapse, id]);

  return (
    <motion.li
      aria-label={`Queued for ${option?.label ?? "later"}: ${firstWords(message.text)}`}
      initial={motionSafe ? { opacity: 0, y: -distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={motionSafe ? { ...springs.glide, opacity: FADE } : FADE}
      className="flex items-center gap-2.5 rounded-3 border border-hairline bg-surface-1 p-2.5"
    >
      <span className="relative grid size-9 shrink-0 place-items-center">
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="col-start-1 row-start-1 size-9"
        >
          <circle {...RING} strokeOpacity="0.15" />
          <motion.circle
            {...RING}
            className="text-cobalt-bright"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            transform="rotate(-90 12 12)"
            style={{ strokeDashoffset: ringOffset }}
          />
        </svg>
        <motion.span
          role="timer"
          className="col-start-1 row-start-1 font-mono text-[10px] text-ink-2 tabular-nums"
        >
          {countText}
        </motion.span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-[11px] text-cobalt-bright">
          <Clock className="size-3" />
          <span className="min-w-0 truncate font-medium">
            {option?.label ?? "Queued"}
          </span>
        </span>
        <span className="min-w-0 truncate text-sm leading-5 text-foreground">
          {message.text}
        </span>
      </span>
    </motion.li>
  );
}

/**
 * A composer whose send button can wear a clock. The schedule control opens a
 * list of times that rises above the field from `distances.step` on `snap`;
 * choosing one puts the time in a chip on the composer's foot — scaling in
 * from 0.9 on the same spring — and turns the send button into a clock: the
 * arrow crosses out as a face crosses in and the two hands sweep from twelve
 * to the hour and the minute on `snap`, each on its own rotation, so nine
 * o'clock is read off the button itself. Sending with a time queues instead
 * of sending: a card lands under the composer on `glide` carrying the text,
 * the time in words, and a ring that drains across the wait beside a seconds
 * readout. Both hold where they are while the tab is hidden and resume from
 * there, and at zero the parent is told to deliver. Clearing the chip sweeps
 * the hands back to twelve and the arrow returns.
 *
 * The list is a listbox with a roving tabindex — arrows move, Home and End
 * jump, Enter or Space picks, Escape closes and hands focus back to the
 * control, and a pointer down outside shuts it. Enter in the textarea sends or
 * queues, Shift+Enter breaks the line. Under reduced motion the list and the
 * chip fade in place and the hands swap without sweeping, but the ring still
 * drains and the seconds still count, because the wait is information.
 */
export function ScheduleChip({
  ref,
  options,
  value,
  defaultValue = null,
  onValueChange,
  queue,
  draft,
  defaultDraft,
  onDraftChange,
  onSend,
  onQueue,
  onDeliver,
  placeholder = "Message",
  label,
  className,
}: ScheduleChipProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const baseId = React.useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | null
  >(defaultValue);
  const chosenId = value === undefined ? uncontrolledValue : value;
  const [uncontrolledDraft, setUncontrolledDraft] = React.useState(
    defaultDraft ?? "",
  );
  const text = draft ?? uncontrolledDraft;

  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const controlRef = React.useRef<HTMLButtonElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const byId = React.useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );
  const chosen = chosenId === null ? undefined : byId.get(chosenId);
  const activeOptionId = options[activeIndex]?.id;
  const angles = anglesFor(chosen);
  const canSend = text.trim().length > 0;

  // The open list owns focus, so the highlight is a real focused button rather
  // than an activedescendant on a control that has already been left behind.
  // Keyed on the id, not on `options`: an inline array would otherwise pull
  // focus back into the list on every unrelated render.
  React.useEffect(() => {
    if (!open || activeOptionId === undefined) return;
    optionRefs.current.get(activeOptionId)?.focus();
  }, [open, activeOptionId]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      if (listRef.current?.contains(node)) return;
      if (controlRef.current?.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const commitDraft = (next: string) => {
    if (draft === undefined) setUncontrolledDraft(next);
    onDraftChange?.(next);
  };
  const commitValue = (id: string | null) => {
    if (value === undefined) setUncontrolledValue(id);
    onValueChange?.(id);
  };

  const close = () => {
    setOpen(false);
    controlRef.current?.focus();
  };

  const pick = (option: ScheduleOption) => {
    commitValue(option.id);
    setAnnounce(`Sending at ${option.label}`);
    close();
  };

  const clear = () => {
    commitValue(null);
    setAnnounce("Schedule cleared, sending now");
    // The chip is about to unmount under the focus that pressed it, so hand
    // focus to the control that can put a time back rather than to the body.
    controlRef.current?.focus();
  };

  const send = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    commitDraft("");
    if (chosen) {
      commitValue(null);
      setAnnounce(`Queued for ${chosen.label}`);
      onQueue?.(trimmed, chosen);
      return;
    }
    setAnnounce("Sent");
    onSend?.(trimmed);
  };

  // Called from the card's own animation, never from a state updater.
  const elapse = (id: string) => {
    const item = queue.find((message) => message.id === id);
    const option = item ? byId.get(item.optionId) : undefined;
    setAnnounce(option ? `Delivered, ${option.label}` : "Delivered");
    onDeliver?.(id);
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const moves: Record<string, number> = {
      ArrowDown: activeIndex + 1,
      ArrowUp: activeIndex - 1,
      Home: 0,
      End: options.length - 1,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    setActiveIndex(Math.min(options.length - 1, Math.max(0, to)));
  };

  const control =
    "flex items-center rounded-2 transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const handSpring: Transition = motionSafe ? springs.snap : { duration: 0 };
  const enterFrom = (offset: number) =>
    motionSafe ? { opacity: 0, y: offset } : { opacity: 0 };
  const springOr = (spring: Transition): Transition =>
    motionSafe ? { ...spring, opacity: FADE } : FADE;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="relative flex flex-col rounded-3 border border-input bg-surface-0 focus-within:border-hairline-strong">
        <AnimatePresence>
          {open ? (
            <motion.div
              key="times"
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="Send time"
              onKeyDown={onListKeyDown}
              onBlur={(event) => {
                // Tabbing out of a listbox should shut it: a panel left open
                // behind the focus ring is the next reader's trap.
                const next = event.relatedTarget;
                if (next instanceof Node && event.currentTarget.contains(next))
                  return;
                setOpen(false);
              }}
              initial={enterFrom(distances.step)}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={springOr(springs.snap)}
              className="absolute inset-x-0 bottom-full z-20 mb-1.5 flex flex-col rounded-2 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-raised"
            >
              {options.map((option, index) => {
                const selected = option.id === chosenId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    tabIndex={index === activeIndex ? 0 : -1}
                    ref={(node) => {
                      if (node) optionRefs.current.set(option.id, node);
                      else optionRefs.current.delete(option.id);
                    }}
                    onClick={() => pick(option)}
                    className={cn(
                      control,
                      "h-9 gap-2 px-2 text-left text-sm",
                      selected
                        ? "bg-cobalt-wash text-foreground"
                        : "text-ink-2 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Clock className="size-4" />
                    <span className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                      {waitLabel(option.delayMs)}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <textarea
          value={text}
          rows={2}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          onChange={(event) => commitDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
          className="block w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3"
        />

        <div className="flex items-center gap-2 border-t border-hairline py-1.5 pr-1.5 pl-3">
          {/* Hint and chip stack in one cell, so the foot keeps its height
              whether or not a time is chosen. */}
          <span className="grid min-w-0 flex-1">
            <span
              aria-hidden
              className={cn(
                "col-start-1 row-start-1 self-center truncate font-mono text-[11px] text-ink-3 transition-opacity",
                chosen && "opacity-0",
              )}
            >
              Enter sends
            </span>
            <AnimatePresence initial={false}>
              {chosen ? (
                <motion.span
                  key="chip"
                  initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: motionSafe ? 0.9 : 1,
                    transition: exitFor(durations.fast),
                  }}
                  transition={springOr(springs.snap)}
                  className="col-start-1 row-start-1 flex h-7 max-w-full min-w-0 items-center gap-1 self-center justify-self-start rounded-full border border-hairline-strong bg-cobalt-wash py-0 pr-0.5 pl-2"
                >
                  <Clock className="size-3 text-cobalt-bright" />
                  <span className="min-w-0 truncate text-xs font-medium text-cobalt-bright">
                    {chosen.label}
                  </span>
                  <button
                    type="button"
                    onClick={clear}
                    aria-label="Clear schedule"
                    className={cn(
                      control,
                      "size-6 shrink-0 justify-center rounded-full text-ink-2 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      {...STROKE}
                      className="size-3 shrink-0"
                    >
                      <path d="m4.5 4.5 7 7m0-7-7 7" />
                    </svg>
                  </button>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>

          <button
            ref={controlRef}
            type="button"
            aria-label="Schedule"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            onClick={() => {
              if (open) {
                setOpen(false);
                return;
              }
              const index = options.findIndex(
                (option) => option.id === chosenId,
              );
              setActiveIndex(index < 0 ? 0 : index);
              setOpen(true);
            }}
            className={cn(
              control,
              "size-8 shrink-0 justify-center",
              open || chosen
                ? "bg-cobalt-wash text-cobalt-bright"
                : "text-ink-2 hover:bg-accent hover:text-foreground",
            )}
          >
            <Clock className="size-4" />
          </button>

          <button
            type="button"
            onClick={send}
            aria-disabled={canSend ? undefined : true}
            aria-label={chosen ? `Schedule for ${chosen.label}` : "Send"}
            className={cn(
              control,
              "h-8 shrink-0 gap-1.5 bg-primary pr-2.5 pl-3 text-xs font-medium text-primary-foreground hover:opacity-90",
              !canSend && "opacity-40",
            )}
          >
            <span aria-hidden>Send</span>
            <span
              aria-hidden
              className="relative grid size-4 shrink-0 place-items-center"
            >
              <motion.svg
                viewBox="0 0 16 16"
                {...STROKE}
                strokeWidth={1.75}
                initial={false}
                animate={{ opacity: chosen ? 0 : 1 }}
                transition={CROSS}
                className="col-start-1 row-start-1 size-4"
              >
                <path d="M2.5 8h10.5M9 4l4 4-4 4" />
              </motion.svg>
              <motion.svg
                viewBox="0 0 16 16"
                {...STROKE}
                initial={false}
                animate={{ opacity: chosen ? 1 : 0 }}
                transition={CROSS}
                className="col-start-1 row-start-1 size-4"
              >
                <circle cx="8" cy="8" r="6" />
                <Hand tip={4.9} rotate={angles.hour} transition={handSpring} />
                <Hand
                  tip={3.4}
                  rotate={angles.minute}
                  transition={handSpring}
                />
              </motion.svg>
            </span>
          </button>
        </div>
      </div>

      <ol
        role="list"
        aria-label="Queued messages"
        className="flex flex-col gap-2 empty:hidden"
      >
        <AnimatePresence initial={false}>
          {queue.map((message) => (
            <QueueCard
              key={message.id}
              message={message}
              option={byId.get(message.optionId)}
              visible={visible}
              motionSafe={motionSafe}
              onElapse={elapse}
            />
          ))}
        </AnimatePresence>
      </ol>

      <span id={hintId} className="sr-only">
        Enter sends or queues, Shift+Enter breaks the line
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
