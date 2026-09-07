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

export type MentionPerson = {
  id: string;
  /** Shown in the list and carried into the chip. */
  name: string;
  /** Secondary identifier; searched alongside the name. */
  handle: string;
};

export type MentionValue = {
  /** The composed text. A mention is stored as `@Name`. */
  text: string;
  /** Ids of everyone mentioned, in the order they first appear. */
  mentions: string[];
};

export type MentionChipProps = {
  /** Who can be mentioned. */
  people: MentionPerson[];
  /** Controlled composer content. */
  value?: MentionValue;
  /** Initial content for uncontrolled usage. */
  defaultValue?: MentionValue;
  /** Fires on every edit, with the mention ids recomputed from the text. */
  onChange?: (value: MentionValue) => void;
  placeholder?: string;
  /** Visible field label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const NBSP = "\u00A0";
/** Holds the last row open when the text ends in a newline, so the caret has one. */
const ZWSP = "\u200B";
/** A mention query is a word, not a sentence; past this the trigger is stale. */
const MAX_QUERY = 24;
const MAX_OPTIONS = 5;

const tokenFor = (person: MentionPerson) =>
  `@${person.name.replace(/\s+/g, NBSP)}`;

const initialsOf = (name: string) =>
  name
    .split(/\s+/, 2)
    .map((part) => part.charAt(0))
    .join("");

type Segment = {
  text: string;
  start: number;
  end: number;
  /** Set when the run is a mention the caller knows about. */
  person?: MentionPerson;
};

/** Splits the raw text into plain runs and known mentions. */
function readSegments(
  text: string,
  byToken: Map<string, MentionPerson>,
): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  const plainUpTo = (end: number) => {
    if (end > cursor) {
      segments.push({ text: text.slice(cursor, end), start: cursor, end });
    }
  };
  for (const match of text.matchAll(/@[^\s@]+(?:\u00A0[^\s@]+)*/g)) {
    const person = byToken.get(match[0]);
    if (!person) continue;
    plainUpTo(match.index);
    cursor = match.index + match[0].length;
    segments.push({ text: match[0], start: match.index, end: cursor, person });
  }
  plainUpTo(text.length);
  return segments;
}

const idsOf = (segments: Segment[]): string[] => [
  ...new Set(segments.flatMap((segment) => segment.person?.id ?? [])),
];

/** The `@word` the caret is standing in, if it is standing in one. */
function findTrigger(text: string, caret: number) {
  const tail = text.slice(Math.max(0, caret - MAX_QUERY), caret);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(tail);
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: caret - query.length - 1, query };
}

/**
 * A composer that turns names into chips. Typing `@` opens a list under the
 * field that filters as you type; choosing inflates the word in place — scale
 * from 0.9 on `snap`, one crisp overshoot, the colour wash arriving as a tween
 * underneath it. Backspace against a chip's trailing edge fades the whole
 * mention out and only then takes the characters, so the line never reflows out
 * from under the fade.
 *
 * The field is a real textarea with a painted layer behind it: the layer draws
 * the chips, the textarea keeps the caret, the selection and every native
 * editing shortcut. Both wrap at identical places because the space inside a
 * name is stored as a non-breaking one — which is what keeps each chip sitting
 * on its own glyphs. The list is a listbox driven by `aria-activedescendant`,
 * so focus never leaves the text: Up and Down move the highlight, Enter or Tab
 * inserts, Escape dismisses. Under reduced motion the chip simply appears.
 */
export function MentionChip({
  people,
  value,
  defaultValue,
  onChange,
  placeholder = "Write a comment",
  label,
  className,
  "aria-label": ariaLabel,
}: MentionChipProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const fieldId = `${baseId}-field`;
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;

  const areaRef = React.useRef<HTMLTextAreaElement>(null);
  const caretRef = React.useRef<number | null>(null);

  const [innerText, setInnerText] = React.useState(defaultValue?.text ?? "");
  const text = value === undefined ? innerText : value.text;

  const [trigger, setTrigger] = React.useState<{
    start: number;
    query: string;
  } | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  /** The trigger Escape dismissed; cleared once the caret leaves it. */
  const [dismissed, setDismissed] = React.useState<number | null>(null);
  /** `start:id` of the mention just inserted — the only chip that inflates. */
  const [recent, setRecent] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<Segment | null>(null);

  const byToken = React.useMemo(() => {
    const map = new Map<string, MentionPerson>();
    for (const person of people) map.set(tokenFor(person), person);
    return map;
  }, [people]);

  const segments = React.useMemo(
    () => readSegments(text, byToken),
    [text, byToken],
  );

  const options = React.useMemo(() => {
    if (!trigger) return [];
    const query = trigger.query.toLowerCase();
    return people
      .filter(
        (person) =>
          person.name.toLowerCase().includes(query) ||
          person.handle.toLowerCase().includes(query),
      )
      .slice(0, MAX_OPTIONS);
  }, [people, trigger]);

  const open =
    trigger !== null && dismissed !== trigger.start && options.length > 0;
  const active = Math.min(activeIndex, Math.max(options.length - 1, 0));

  const emit = (nextText: string, caret: number | null) => {
    caretRef.current = caret;
    if (value === undefined) setInnerText(nextText);
    onChange?.({
      text: nextText,
      mentions: idsOf(readSegments(nextText, byToken)),
    });
  };

  // The pending removal reads the newest emit rather than the one captured when
  // its timer was armed, so a parent re-render mid-fade cannot strand it.
  const emitRef = React.useRef(emit);
  React.useEffect(() => {
    emitRef.current = emit;
  });

  // Restoring the caret is a DOM write once the text has committed. Doing it on
  // plain typing would fight the browser (and any IME), so only edits that move
  // the caret themselves leave a position behind.
  React.useEffect(() => {
    const caret = caretRef.current;
    const node = areaRef.current;
    caretRef.current = null;
    if (caret === null || !node || document.activeElement !== node) return;
    node.setSelectionRange(caret, caret);
  }, [text]);

  // The chip fades first and the characters leave with the fade's end: cutting
  // the text up front would reflow the line out from under the animation.
  React.useEffect(() => {
    if (!removing) return;
    const { start, end, text: token } = removing;
    const timer = window.setTimeout(
      () => {
        if (text.slice(start, end) === token) {
          emitRef.current(text.slice(0, start) + text.slice(end), start);
        }
        setRemoving(null);
      },
      motionSafe ? durations.fast * 1000 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [removing, text, motionSafe]);

  const syncTrigger = (node: HTMLTextAreaElement) => {
    const caret = node.selectionStart ?? node.value.length;
    const next = findTrigger(node.value, caret);
    if (next?.start !== trigger?.start || next?.query !== trigger?.query) {
      setTrigger(next);
      setActiveIndex(0);
    }
    if (next === null || next.start !== dismissed) setDismissed(null);
  };

  const choose = (person: MentionPerson | undefined) => {
    const node = areaRef.current;
    if (!node || !trigger || !person) return;
    const caret = node.selectionStart ?? text.length;
    const token = tokenFor(person);
    setRecent(`${trigger.start}:${person.id}`);
    setTrigger(null);
    setDismissed(null);
    emit(
      `${text.slice(0, trigger.start)}${token} ${text.slice(caret)}`,
      trigger.start + token.length + 1,
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && trigger) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : options.length - 1;
        setActiveIndex(
          (index) => (Math.min(index, active) + step) % options.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(options[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(trigger.start);
        return;
      }
    }

    if (event.key !== "Backspace" && event.key !== "Delete") return;
    const node = event.currentTarget;
    if (removing || node.selectionStart !== node.selectionEnd) return;
    const caret = node.selectionStart ?? 0;
    const edge = event.key === "Backspace" ? "end" : "start";
    const hit = segments.find(
      (segment) => segment.person && segment[edge] === caret,
    );
    if (!hit) return;
    event.preventDefault();
    setRemoving(hit);
  };

  const chipTransition = motionSafe
    ? {
        scale: springs.snap,
        opacity: { duration: durations.fast, ease: easings.enter },
      }
    : { duration: 0 };
  const listTransition = motionSafe
    ? springs.snap
    : { duration: durations.fast };

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {label ? (
        <label htmlFor={fieldId} className="text-sm font-semibold">
          {label}
        </label>
      ) : null}

      <div className="relative rounded-3 border border-input bg-surface-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
        {/* The painted layer is also the sizer: the box grows with the text, so
            nothing reserves a second row that may never be typed. */}
        <div
          aria-hidden
          className="px-3 py-2 text-sm leading-6 break-words whitespace-pre-wrap"
        >
          {text.length === 0 ? (
            <span className="text-ink-3">{placeholder}</span>
          ) : null}
          {segments.map(({ person, start, text: run }) => {
            if (!person) return <span key={`text-${start}`}>{run}</span>;
            const inflating = motionSafe && recent === `${start}:${person.id}`;
            return (
              <motion.span
                key={`mention-${start}`}
                initial={inflating ? { scale: 0.9, opacity: 0 } : false}
                animate={{
                  scale: 1,
                  opacity: removing?.start === start ? 0 : 1,
                }}
                transition={chipTransition}
                /* The wash bleeds 4px each side and takes it back in margin, so
                   the glyphs stay exactly where the textarea puts them. */
                className="-mx-1 inline-block rounded-2 bg-cobalt-wash px-1 font-medium text-cobalt-bright"
              >
                {run}
              </motion.span>
            );
          })}
          {ZWSP}
        </div>

        <textarea
          ref={areaRef}
          id={fieldId}
          value={text}
          rows={1}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={label ? undefined : ariaLabel}
          aria-describedby={hintId}
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          onChange={(event) => {
            emit(event.target.value, null);
            syncTrigger(event.target);
          }}
          onSelect={(event) => syncTrigger(event.currentTarget)}
          onFocus={(event) => syncTrigger(event.currentTarget)}
          onKeyDown={handleKeyDown}
          className="absolute inset-0 resize-none overflow-hidden bg-transparent px-3 py-2 text-sm leading-6 text-transparent caret-foreground outline-none selection:bg-cobalt-wash placeholder:text-transparent"
        />

        <AnimatePresence>
          {open ? (
            <motion.ul
              id={listId}
              role="listbox"
              aria-label="People to mention"
              initial={
                motionSafe
                  ? { opacity: 0, y: -distances.nudge }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={listTransition}
              className="absolute top-full right-0 left-0 z-20 mt-1 max-h-[9.5rem] overflow-y-auto rounded-3 border border-hairline bg-popover p-1 shadow-raised"
            >
              {options.map((person, index) => (
                <li
                  key={person.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onPointerEnter={() => setActiveIndex(index)}
                  /* Keeps focus — and the caret — in the text while clicking. */
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(person)}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2 rounded-2 px-2",
                    index === active && "bg-cobalt-wash",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2"
                  >
                    {initialsOf(person.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {person.name}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3">
                    {person.handle}
                  </span>
                </li>
              ))}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>

      <p id={hintId} className="sr-only">
        Type @ to mention someone. Up and Down choose, Enter or Tab inserts,
        Escape closes. Backspace at a mention removes all of it.
      </p>
      <span role="status" className="sr-only">
        {open ? `${options.length} people match` : ""}
      </span>
    </div>
  );
}
