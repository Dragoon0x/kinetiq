"use client";

import * as React from "react";

import { AnimatePresence, motion, type Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MentionPresence = "online" | "away" | "offline";

export type MentionMember = {
  id: string;
  /** Shown in the list and carried into the chip. */
  name: string;
  /** Mono aside on the row; searched alongside the name. */
  handle: string;
  presence: MentionPresence;
};

export type MentionMessage = {
  id: string;
  /** "me" sits on the right; anything else is printed as the sender. */
  from: "me" | string;
  /** Mentions are `@Name` tokens; a space inside a name is non-breaking. */
  text: string;
};

export type MentionPopProps = {
  ref?: React.Ref<HTMLDivElement>;
  members: MentionMember[];
  /** The thread, oldest first. Append the sent message here from `onSend`. */
  messages: MentionMessage[];
  /** Controlled composer text. */
  value?: string;
  /** Initial composer text for uncontrolled usage. */
  defaultValue?: string;
  /** Fires on every edit and on the clear after a send. */
  onValueChange?: (text: string) => void;
  /** Fires from Enter or the Send button with the trimmed text and the ids in it. */
  onSend?: (text: string, mentioned: string[]) => void;
  /** @default "Message the room" */
  placeholder?: string;
  /** Names the thread and the composer for assistive technology. */
  label: string;
  className?: string;
};

const NBSP = "\u00A0";
/** Holds the last row open when the text ends in a newline, so the caret has one. */
const ZWSP = "\u200B";
/** A mention query is a word, not a sentence; past this the trigger is stale. */
const MAX_QUERY = 20;
const MAX_ROWS = 5;
const FADE = { duration: durations.fast, ease: easings.enter } as const;
const FLARE = { duration: durations.slow, ease: easings.exit } as const;
const DOT: Record<MentionPresence, string> = {
  online: "bg-success",
  away: "bg-warn",
  offline: "bg-ink-3",
};

const tokenFor = (member: MentionMember) =>
  `@${member.name.replace(/\s+/g, NBSP)}`;

const initialsOf = (name: string) =>
  name.split(/\s+/, 2).reduce((acc, part) => acc + part.charAt(0), "");

type Segment = { start: number; text: string; member?: MentionMember };

/** Splits text into plain runs and the mentions the room knows. */
function splitMentions(
  text: string,
  byToken: Map<string, MentionMember>,
): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/@(?:[^\s@]|\u00A0)+/g)) {
    const member = byToken.get(match[0]);
    if (!member) continue;
    if (match.index > cursor) {
      segments.push({ start: cursor, text: text.slice(cursor, match.index) });
    }
    segments.push({ start: match.index, text: match[0], member });
    cursor = match.index + match[0].length;
  }
  if (text.length > cursor) {
    segments.push({ start: cursor, text: text.slice(cursor) });
  }
  return segments;
}

/** The `@word` the caret stands in, if it stands in one. */
function findTrigger(text: string, caret: number) {
  const tail = text.slice(Math.max(0, caret - MAX_QUERY), caret);
  const match = /(?:^|\s)@([^\s@]*)$/.exec(tail);
  if (!match) return null;
  const query = match[1] ?? "";
  return { start: caret - query.length - 1, query };
}

/** `wrap` scales the wash over glyphs already drawn; `glow` flares once on mount. */
type ChipProps = {
  text: string;
  wrap: boolean;
  glow: boolean;
  motionSafe: boolean;
};

function Chip({ text, wrap, glow, motionSafe }: ChipProps) {
  return (
    <span className="relative -mx-1 inline-block rounded-2 px-1 font-medium text-cobalt-bright">
      <motion.span
        aria-hidden
        className="absolute inset-0 origin-left rounded-2 bg-cobalt-wash"
        initial={wrap ? (motionSafe ? { scaleX: 0 } : { opacity: 0 }) : false}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={motionSafe ? springs.snap : FADE}
      />
      {glow ? (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-2 border-2 border-cobalt-bright bg-cobalt-bright"
          initial={{ opacity: 0.5, scale: 1 }}
          animate={{ opacity: 0, scale: motionSafe ? 1.5 : 1 }}
          transition={FLARE}
        />
      ) : null}
      <span className="relative">{text}</span>
    </span>
  );
}

/**
 * Names that complete as you type. An `@` opens the room's members in a list
 * that rises above the composer from `distances.step` on `snap`, rows cascading
 * in with a presence dot that says in words who is here. Picking one wraps the
 * typed name as a chip: the wash scales from the left edge on `snap` around
 * glyphs the textarea already drew, so nothing moves — a painted layer beneath
 * a transparent textarea draws the chips while the textarea keeps the caret and
 * every native shortcut. Sending lands the message in the thread and its chips
 * glow once: a fill flashes and a ring flares outward on a tween, so the ping
 * reads as an event. Up and Down move the highlight, Home and End jump, Enter
 * or Tab inserts, Escape closes; with the list shut Enter sends. Under reduced
 * motion the list fades in place, the wash appears by opacity and the glow is
 * the flash alone.
 */
export function MentionPop({
  ref,
  members,
  messages,
  value,
  defaultValue,
  onValueChange,
  onSend,
  placeholder = "Message the room",
  label,
  className,
}: MentionPopProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const text = value ?? uncontrolled;
  const [trigger, setTrigger] = React.useState<{
    start: number;
    query: string;
  } | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [dismissed, setDismissed] = React.useState<number | null>(null);
  /** `start:id` of the mention just inserted — the only chip that wraps. */
  const [recent, setRecent] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const caretRef = React.useRef<number | null>(null);
  const threadRef = React.useRef<HTMLOListElement | null>(null);

  const byToken = React.useMemo(() => {
    const map = new Map<string, MentionMember>();
    for (const member of members) map.set(tokenFor(member), member);
    return map;
  }, [members]);
  const segments = React.useMemo(
    () => splitMentions(text, byToken),
    [text, byToken],
  );
  const rows = React.useMemo(() => {
    if (!trigger) return [];
    const query = trigger.query.toLowerCase();
    return members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.handle.toLowerCase().includes(query),
      )
      .slice(0, MAX_ROWS);
  }, [members, trigger]);
  const open =
    trigger !== null && dismissed !== trigger.start && rows.length > 0;
  const active = Math.min(activeIndex, Math.max(rows.length - 1, 0));
  const optionId = (member: MentionMember) => `${listId}-${member.id}`;

  // Pin the thread to the newest message.
  const count = messages.length;
  React.useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [count]);

  // Restoring the caret is a DOM write once the text has committed; plain
  // typing leaves no position behind, so the browser and any IME keep theirs.
  React.useEffect(() => {
    const caret = caretRef.current;
    const node = areaRef.current;
    caretRef.current = null;
    if (caret === null || !node || document.activeElement !== node) return;
    node.setSelectionRange(caret, caret);
  }, [text]);

  const commit = (next: string, caret: number | null) => {
    caretRef.current = caret;
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const syncTrigger = (node: HTMLTextAreaElement) => {
    const caret = node.selectionStart ?? node.value.length;
    const next = findTrigger(node.value, caret);
    if (next?.start !== trigger?.start || next?.query !== trigger?.query) {
      setTrigger(next);
      setActiveIndex(0);
    }
    if (next === null || next.start !== dismissed) setDismissed(null);
  };

  const choose = (member: MentionMember | undefined) => {
    const node = areaRef.current;
    if (!node || !trigger || !member) return;
    const caret = node.selectionStart ?? text.length;
    const token = tokenFor(member);
    setRecent(`${trigger.start}:${member.id}`);
    setTrigger(null);
    setDismissed(null);
    setAnnounce(`Mentioned ${member.name}`);
    commit(
      `${text.slice(0, trigger.start)}${token} ${text.slice(caret)}`,
      trigger.start + token.length + 1,
    );
  };

  const send = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    const mentioned = [
      ...new Set(segments.flatMap((s) => (s.member ? [s.member] : []))),
    ];
    const names = mentioned.map((m) => m.name).join(", ");
    setRecent(null);
    setTrigger(null);
    setAnnounce(names ? `Sent, pinged ${names}` : "Sent");
    commit("", null);
    onSend?.(
      trimmed,
      mentioned.map((m) => m.id),
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && trigger) {
      const moves: Record<string, number> = {
        ArrowDown: active + 1,
        ArrowUp: active - 1,
        Home: 0,
        End: rows.length - 1,
      };
      const to = moves[event.key];
      if (to !== undefined) {
        event.preventDefault();
        setActiveIndex(Math.max(0, Math.min(rows.length - 1, to)));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        choose(rows[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(trigger.start);
        return;
      }
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  };

  const enterFrom = (offset: number) =>
    motionSafe ? { opacity: 0, y: offset } : { opacity: 0 };
  const springOr = (spring: Transition, delay = 0): Transition =>
    motionSafe ? { ...spring, delay, opacity: FADE } : FADE;
  const renderSegments = (list: Segment[], glow: boolean) =>
    list.map((segment) =>
      segment.member ? (
        <Chip
          key={segment.start}
          text={segment.text}
          wrap={!glow && recent === `${segment.start}:${segment.member.id}`}
          glow={glow}
          motionSafe={motionSafe}
        />
      ) : (
        <span key={segment.start}>{segment.text}</span>
      ),
    );
  const canSend = text.trim().length > 0;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol
        ref={threadRef}
        role="list"
        aria-label={label}
        className="flex max-h-64 flex-col gap-2.5 overflow-x-hidden overflow-y-auto px-0.5 pb-0.5"
      >
        <AnimatePresence initial={false}>
          {messages.map((message) => {
            const own = message.from === "me";
            return (
              <motion.li
                key={message.id}
                initial={enterFrom(distances.step)}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor() }}
                transition={springOr(springs.glide)}
                className={cn(
                  "flex flex-col gap-0.5",
                  own ? "items-end" : "items-start",
                )}
              >
                <span className="px-1 text-[11px] text-ink-3">
                  {own ? "You" : message.from}
                </span>
                <span
                  className={cn(
                    "max-w-[88%] rounded-3 px-3 py-1.5 text-sm leading-6 wrap-break-word whitespace-pre-wrap text-foreground",
                    own
                      ? "rounded-br-1 bg-surface-2"
                      : "rounded-bl-1 border border-hairline bg-surface-1",
                  )}
                >
                  {/* Chips in a message that arrived after mount glow; the
                      presence context blocks the flare for the opening ones. */}
                  {renderSegments(splitMentions(message.text, byToken), own)}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      <div className="flex items-end gap-2">
        <div className="relative min-w-0 flex-1 rounded-3 border border-input bg-surface-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <AnimatePresence>
            {open ? (
              <motion.ul
                key="members"
                id={listId}
                role="listbox"
                aria-label="Members to mention"
                initial={enterFrom(distances.step)}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={springOr(springs.snap)}
                className="absolute right-0 bottom-full left-0 z-20 mb-1.5 flex flex-col rounded-2 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-raised"
              >
                {rows.map((member, index) => {
                  const selected = index === active;
                  return (
                    <motion.li
                      key={member.id}
                      id={optionId(member)}
                      role="option"
                      aria-selected={selected}
                      initial={enterFrom(distances.nudge)}
                      animate={{ opacity: 1, y: 0 }}
                      transition={springOr(
                        springs.snap,
                        index * cascade(rows.length),
                      )}
                      onPointerEnter={() => setActiveIndex(index)}
                      // Keeps focus — and the caret — in the text while clicking.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(member)}
                      className={cn(
                        "flex h-9 cursor-pointer items-center gap-2 rounded-2 px-2 transition-colors",
                        selected
                          ? "bg-cobalt-wash text-foreground"
                          : "text-ink-2",
                      )}
                    >
                      <span
                        aria-hidden
                        className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2"
                      >
                        {initialsOf(member.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {member.name}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-3">
                        {member.handle}
                      </span>
                      <span
                        role="img"
                        aria-label={`${member.name}, ${member.presence}`}
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          DOT[member.presence],
                        )}
                      />
                    </motion.li>
                  );
                })}
              </motion.ul>
            ) : null}
          </AnimatePresence>

          {/* The painted layer is also the sizer: the box grows with the text,
              so nothing reserves a second row that may never be typed. */}
          <div
            aria-hidden
            className="px-3 py-2 text-sm leading-5 wrap-break-word whitespace-pre-wrap"
          >
            {text.length === 0 ? (
              <span className="text-ink-3">{placeholder}</span>
            ) : null}
            {renderSegments(segments, false)}
            {ZWSP}
          </div>
          <textarea
            ref={areaRef}
            value={text}
            rows={1}
            spellCheck={false}
            placeholder={placeholder}
            aria-label={label}
            aria-describedby={hintId}
            aria-autocomplete="list"
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open && rows[active] ? optionId(rows[active]) : undefined
            }
            onChange={(event) => {
              commit(event.target.value, null);
              syncTrigger(event.target);
            }}
            onSelect={(event) => syncTrigger(event.currentTarget)}
            onFocus={(event) => syncTrigger(event.currentTarget)}
            // Rows keep focus by cancelling their own mousedown, so a blur here
            // is always a click somewhere else — the list has no business
            // staying open over a composer nobody is typing in.
            onBlur={() => setTrigger(null)}
            onKeyDown={handleKeyDown}
            className="absolute inset-0 resize-none overflow-hidden bg-transparent px-3 py-2 text-sm leading-5 text-transparent caret-foreground outline-none selection:bg-cobalt-wash placeholder:text-transparent"
          />
        </div>
        <button
          type="button"
          onClick={send}
          aria-disabled={canSend ? undefined : true}
          className={cn(
            "flex h-9 shrink-0 items-center rounded-3 bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity outline-none hover:opacity-90",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            !canSend && "opacity-40",
          )}
        >
          Send
        </button>
      </div>

      <p id={hintId} className="sr-only">
        Type @ to mention someone. Up and Down choose, Enter or Tab inserts,
        Escape closes the list. Enter sends, Shift+Enter breaks the line.
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
