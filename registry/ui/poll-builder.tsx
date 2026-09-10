"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PollDraftOption = {
  id: string;
  label: string;
};

export type PollDraft = {
  question: string;
  options: PollDraftOption[];
  multiple: boolean;
};

export type PollBuilderProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled draft. */
  value?: PollDraft;
  /** Initial draft for uncontrolled usage. @default an empty question and two empty options */
  defaultValue?: PollDraft;
  /** Fires from every keystroke, add, remove and switch — from the setter, never an effect. */
  onValueChange?: (draft: PollDraft) => void;
  /** Controlled posted state; the composer is closed while it is true. */
  posted?: boolean;
  /** Initial posted state for uncontrolled usage. @default false */
  defaultPosted?: boolean;
  /** Fires from Post and from Start another. */
  onPostedChange?: (posted: boolean) => void;
  /** Fires with the trimmed draft the moment Post is pressed. */
  onSend?: (draft: PollDraft) => void;
  /** Options the poll may carry. @default 6 */
  maxOptions?: number;
  /** Rows the builder will not go below. @default 2 */
  minOptions?: number;
  /** Name printed on the preview bubble. @default "You" */
  sender?: string;
  /** Already formatted; printed under the posted bubble. */
  time?: string;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  /** Holds every field and control. @default false */
  disabled?: boolean;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const chip =
  "flex h-8 shrink-0 items-center gap-2 rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50";

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`;

/**
 * The composer's box follows a `ResizeObserver` on its own content rather than
 * a fixed height, so adding a row grows the box by exactly the row and nothing
 * reserves space for a state that is not there. The first measurement is set
 * rather than animated — a box that springs open on mount would animate against
 * a height it never had.
 */
function useMeasuredHeight<T extends HTMLElement>(motionSafe: boolean) {
  const ref = React.useRef<T | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  const height = useMotionValue(0);
  const seeded = React.useRef(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (content === null) return;
    if (!seeded.current) {
      seeded.current = true;
      height.set(content);
      return;
    }
    const controls = animate(
      height,
      content,
      motionSafe ? springs.glide : { duration: durations.fast },
    );
    return () => controls.stop();
  }, [content, height, motionSafe]);

  return [ref, height, content !== null] as const;
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

/**
 * A poll written in the composer and watched from the thread. The preview sits
 * above the fields as a real message, so the thing being written is visible as
 * the thing it will become: the question, the option rows, the mark morphing
 * between a circle and a square as the multiple-answers switch flips on `snap`.
 *
 * Adding an option slides the row in from `distances.step` on `glide` — ζ0.98,
 * no overshoot — while the composer's box takes its new height from a
 * `ResizeObserver` on its own content on the same spring, so the row and the
 * box are one movement rather than two. Posting is the rise: the draft's dashed
 * edge goes solid and the bubble comes up from `distances.shift` on `recoil`,
 * the two bounces of something landing in a thread, while the composer's box
 * closes to a single posted line.
 *
 * The question and every option are real inputs. Enter inside an option adds a
 * row below and takes focus into it, Backspace in an empty one removes it and
 * returns focus above, and Control or Command with Enter posts. Post stays in
 * the tab order while the draft is incomplete, carrying `aria-disabled` and a
 * sentence saying what is missing. Under reduced motion rows appear and vanish
 * on opacity alone and the box resizes on a fast tween, because a composer that
 * jumps is worse than one that does not spring.
 */
export function PollBuilder({
  ref,
  value,
  defaultValue,
  onValueChange,
  posted,
  defaultPosted = false,
  onPostedChange,
  onSend,
  maxOptions = 6,
  minOptions = 2,
  sender = "You",
  time,
  label = "Thread",
  disabled = false,
  className,
}: PollBuilderProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const questionId = `${baseId}-question`;

  const [uncontrolled, setUncontrolled] = React.useState<PollDraft>(
    () =>
      defaultValue ?? {
        question: "",
        options: [
          { id: `${baseId}-a`, label: "" },
          { id: `${baseId}-b`, label: "" },
        ],
        multiple: false,
      },
  );
  const [uncontrolledPosted, setUncontrolledPosted] =
    React.useState(defaultPosted);
  const [say, setSay] = React.useState("");

  const draft = value ?? uncontrolled;
  const isPosted = posted ?? uncontrolledPosted;
  const options = draft.options;

  // Ids for rows added after mount come from a counter rather than a clock or a
  // random number, so the markup a prerender produces is the markup that
  // hydrates, and two sibling rows can never share a key.
  const seq = React.useRef(0);
  const pendingFocus = React.useRef<string | null>(null);

  const [bodyRef, bodyHeight, measured] =
    useMeasuredHeight<HTMLDivElement>(motionSafe);

  const riseY = useMotionValue(0);
  const wasPosted = React.useRef(isPosted);

  React.useEffect(() => {
    if (wasPosted.current === isPosted) return;
    wasPosted.current = isPosted;
    if (!isPosted || !motionSafe) return;
    // The rise is imperative because it happens at a moment rather than in a
    // state: the bubble is the same node before and after, so there is nothing
    // for AnimatePresence to mount.
    riseY.set(distances.shift);
    const controls = animate(riseY, 0, springs.recoil);
    return () => controls.stop();
  }, [isPosted, motionSafe, riseY]);

  React.useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(`${baseId}-input-${id}`)?.focus();
  });

  const filled = options.filter((option) => option.label.trim() !== "");
  const postable = draft.question.trim() !== "" && filled.length >= minOptions;
  const atMax = options.length >= maxOptions;

  const commit = (next: PollDraft) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const setPosted = (next: boolean) => {
    if (posted === undefined) setUncontrolledPosted(next);
    onPostedChange?.(next);
  };

  const setQuestion = (question: string) => commit({ ...draft, question });

  const setLabel = (id: string, text: string) =>
    commit({
      ...draft,
      options: options.map((option) =>
        option.id === id ? { ...option, label: text } : option,
      ),
    });

  const mintId = () => {
    seq.current += 1;
    return `${baseId}-n${seq.current}`;
  };

  const addOption = (afterIndex = options.length - 1) => {
    if (disabled) return;
    if (atMax) {
      setSay(`That is all ${plural(maxOptions, "option")}.`);
      return;
    }
    const id = mintId();
    const next = options.slice();
    next.splice(Math.min(options.length, afterIndex + 1), 0, { id, label: "" });
    commit({ ...draft, options: next });
    pendingFocus.current = id;
    setSay(`Option ${next.length} added, ${next.length} of ${maxOptions}.`);
  };

  const removeOption = (index: number) => {
    if (disabled) return;
    if (options.length <= minOptions) {
      setSay(`A poll needs at least ${plural(minOptions, "option")}.`);
      return;
    }
    const next = options.filter((_, i) => i !== index);
    commit({ ...draft, options: next });
    const neighbour = next[Math.max(0, index - 1)];
    if (neighbour) pendingFocus.current = neighbour.id;
    setSay(
      `Option ${index + 1} removed, ${plural(next.length, "option")} left.`,
    );
  };

  const toggleMultiple = () => {
    const multiple = !draft.multiple;
    commit({ ...draft, multiple });
    setSay(multiple ? "Multiple answers on." : "Multiple answers off.");
  };

  const post = () => {
    if (disabled) return;
    if (!postable) {
      setSay(
        `Add a question and at least ${plural(minOptions, "option")} before posting.`,
      );
      return;
    }
    onSend?.({
      question: draft.question.trim(),
      options: filled.map((option) => ({
        id: option.id,
        label: option.label.trim(),
      })),
      multiple: draft.multiple,
    });
    setPosted(true);
    setSay(`Poll posted with ${plural(filled.length, "option")}.`);
  };

  const startAnother = () => {
    const a = mintId();
    commit({
      question: "",
      options: [
        { id: a, label: "" },
        { id: mintId(), label: "" },
      ],
      multiple: false,
    });
    setPosted(false);
    pendingFocus.current = a;
    setSay("Draft cleared, two empty options.");
  };

  const onOptionKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      post();
      return;
    }
    const option = options[index];
    if (event.key === "Enter") {
      event.preventDefault();
      addOption(index);
    } else if (
      event.key === "Backspace" &&
      option !== undefined &&
      option.label === ""
    ) {
      event.preventDefault();
      removeOption(index);
    }
  };

  const rowFlow = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };

  const previewOptions = isPosted ? filled : options;
  const footer = `${plural(previewOptions.length, "option")} · ${
    draft.multiple ? "multiple answers" : "single answer"
  }`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-1">
        <li className="flex flex-col items-end gap-1">
          <motion.div
            style={{ y: riseY }}
            className={cn(
              "w-full max-w-[92%] rounded-3 rounded-br-1 border px-3 py-2.5 transition-colors",
              isPosted
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-dashed border-hairline-strong bg-surface-1 text-foreground",
            )}
          >
            <div className="flex flex-col gap-2.5">
              <p
                className={cn(
                  "text-[13px] leading-5 font-medium",
                  draft.question.trim() === "" && "opacity-55",
                )}
              >
                {draft.question.trim() === ""
                  ? "Your question goes here"
                  : draft.question}
              </p>

              <ul role="list" className="flex flex-col gap-1.5">
                {previewOptions.map((option, index) => (
                  <motion.li
                    key={option.id}
                    layout={motionSafe ? "position" : false}
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={rowFlow}
                    className="flex h-8 items-center gap-2 rounded-2 border border-current/15 px-2.5"
                  >
                    <motion.span
                      aria-hidden
                      className="size-3.5 shrink-0 border border-current/45"
                      initial={false}
                      animate={{ borderRadius: draft.multiple ? 4 : 999 }}
                      transition={
                        motionSafe ? springs.snap : { duration: durations.fast }
                      }
                    />
                    <span
                      title={option.label || undefined}
                      className={cn(
                        "min-w-0 flex-1 truncate text-[12px] leading-4",
                        option.label.trim() === "" && "opacity-55",
                      )}
                    >
                      {option.label.trim() === ""
                        ? `Option ${index + 1}`
                        : option.label}
                    </span>
                  </motion.li>
                ))}
              </ul>

              <p className="text-[11px] opacity-80">{footer}</p>
            </div>
          </motion.div>

          {/* The state is a sentence rather than a dashed edge: the mark below
              the bubble carries it for anyone who cannot see the border. */}
          <span className="px-1 text-[11px] text-ink-3 tabular-nums">
            <span className="sr-only">
              {isPosted
                ? `Poll from ${sender}, posted${time ? ` at ${time}` : ""}.`
                : `Poll from ${sender}, still a draft.`}
            </span>
            <span aria-hidden>{isPosted ? (time ?? "Posted") : "Draft"}</span>
          </span>
        </li>
      </ol>

      <section
        aria-label="Poll composer"
        className="rounded-3 border border-hairline-strong bg-card"
      >
        {/* The composer grows and closes inside its own box — never a panel
            floating over whatever the host put below it. */}
        <motion.div
          style={measured ? { height: bodyHeight } : undefined}
          className="overflow-hidden"
        >
          {/* The padding lives on the measured content so a focus ring inside
              it has room before the clip. */}
          <div ref={bodyRef} className="flex flex-col gap-2.5 p-2.5">
            {isPosted ? (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-cobalt-wash text-cobalt-bright"
                >
                  <CheckMark />
                </span>
                <p className="min-w-0 flex-1 text-[12px] leading-4 text-ink-2">
                  {`Posted with ${plural(filled.length, "option")}.`}
                </p>
                <button
                  type="button"
                  onClick={startAnother}
                  disabled={disabled}
                  className={cn(chip, focusRing)}
                >
                  New poll
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                    New poll
                  </h3>
                  <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                    {options.length}/{maxOptions}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={questionId}
                    className="text-[11px] font-medium text-ink-2"
                  >
                    Question
                  </label>
                  <input
                    id={questionId}
                    type="text"
                    value={draft.question}
                    disabled={disabled}
                    placeholder="What are you asking?"
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        (event.metaKey || event.ctrlKey) &&
                        event.key === "Enter"
                      ) {
                        event.preventDefault();
                        post();
                      }
                    }}
                    className={cn(
                      "h-9 w-full rounded-2 border border-input bg-surface-0 px-2.5 text-[13px] transition-colors placeholder:text-ink-3 disabled:opacity-50",
                      focusRing,
                    )}
                  />
                </div>

                <ol role="list" className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                    {options.map((option, index) => (
                      <motion.li
                        key={option.id}
                        layout={motionSafe ? "position" : false}
                        initial={
                          motionSafe
                            ? { opacity: 0, x: -distances.step }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, x: 0 }}
                        exit={{
                          opacity: 0,
                          x: motionSafe ? -distances.step : 0,
                          transition: exitFor(),
                        }}
                        transition={rowFlow}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          aria-hidden
                          className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-3 tabular-nums"
                        >
                          {index + 1}
                        </span>
                        <input
                          id={`${baseId}-input-${option.id}`}
                          type="text"
                          value={option.label}
                          disabled={disabled}
                          aria-label={`Option ${index + 1}`}
                          placeholder={`Option ${index + 1}`}
                          onChange={(event) =>
                            setLabel(option.id, event.target.value)
                          }
                          onKeyDown={(event) => onOptionKeyDown(event, index)}
                          className={cn(
                            "h-9 min-w-0 flex-1 rounded-2 border border-input bg-surface-0 px-2.5 text-[13px] transition-colors placeholder:text-ink-3 disabled:opacity-50",
                            focusRing,
                          )}
                        />
                        <button
                          type="button"
                          aria-label={`Remove option ${index + 1}`}
                          disabled={disabled || options.length <= minOptions}
                          onClick={() => removeOption(index)}
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-2 text-ink-3 transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent",
                            focusRing,
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
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ol>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.multiple}
                    aria-label="Multiple answers"
                    disabled={disabled}
                    onClick={toggleMultiple}
                    className={cn(chip, focusRing)}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "relative h-4 w-7 shrink-0 rounded-full transition-colors",
                        draft.multiple ? "bg-cobalt-bright" : "bg-surface-2",
                      )}
                    >
                      <motion.span
                        className="absolute top-0.5 left-0 size-3 rounded-full bg-surface-0"
                        initial={false}
                        animate={{ x: draft.multiple ? 14 : 2 }}
                        transition={
                          motionSafe
                            ? springs.snap
                            : { duration: durations.fast }
                        }
                      />
                    </span>
                    Multiple
                  </button>

                  <button
                    type="button"
                    disabled={disabled || atMax}
                    onClick={() => addOption()}
                    className={cn(chip, focusRing)}
                  >
                    Add option
                  </button>

                  <button
                    type="button"
                    onClick={post}
                    disabled={disabled}
                    aria-disabled={!postable || undefined}
                    aria-label={
                      postable
                        ? `Post the poll with ${plural(filled.length, "option")}.`
                        : `Post the poll. Add a question and at least ${plural(minOptions, "option")} first.`
                    }
                    className={cn(
                      "ml-auto flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50",
                      !postable && "opacity-50",
                      focusRing,
                    )}
                  >
                    Post
                  </button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </section>

      <span role="status" aria-live="polite" className="sr-only">
        {say}
      </span>
    </div>
  );
}
