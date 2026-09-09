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

export type EmojiItem = {
  glyph: string;
  /** The searchable name; also the shortcode printed in the panel's foot. */
  name: string;
  keywords?: string[];
};

export type EmojiPickerState = {
  open: boolean;
  query: string;
  matches: number;
};

export type EmojiRiseProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled draft. */
  value?: string;
  /** Initial draft for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Fires from Enter with the picker closed, or the Send control, with the trimmed draft. */
  onSend?: (text: string) => void;
  /** Fires when a glyph is inserted. */
  onInsert?: (item: EmojiItem) => void;
  /** Fires whenever the picker opens, closes, or its match count changes. */
  onPickerChange?: (state: EmojiPickerState) => void;
  /** The set to search. @default the built-in sixteen */
  items?: EmojiItem[];
  /** @default "Message" */
  placeholder?: string;
  /** Names the textarea for assistive technology. */
  label: string;
  className?: string;
};

export const DEFAULT_EMOJI: EmojiItem[] = [
  { glyph: "\u{1F600}", name: "smile", keywords: ["happy"] },
  { glyph: "\u{1F604}", name: "big smile", keywords: ["happy", "grin"] },
  { glyph: "\u{1F60F}", name: "smirk" },
  { glyph: "\u{1F609}", name: "wink" },
  { glyph: "\u{1F602}", name: "laugh", keywords: ["tears", "joy"] },
  { glyph: "\u{2764}\u{FE0F}", name: "heart", keywords: ["love"] },
  { glyph: "\u{1F44D}", name: "thumbs up", keywords: ["yes", "ok"] },
  { glyph: "\u{1F44F}", name: "clap" },
  { glyph: "\u{1F44B}", name: "wave", keywords: ["hello", "bye"] },
  { glyph: "\u{1F525}", name: "fire", keywords: ["hot"] },
  { glyph: "\u{2728}", name: "sparkles", keywords: ["new"] },
  { glyph: "\u{2705}", name: "check", keywords: ["done", "yes"] },
  { glyph: "\u{1F440}", name: "eyes", keywords: ["look"] },
  { glyph: "\u{1F914}", name: "thinking", keywords: ["hmm"] },
  { glyph: "\u{1F389}", name: "party", keywords: ["celebrate"] },
  { glyph: "\u{1F680}", name: "rocket", keywords: ["launch", "ship"] },
];

/** The grid is eight across, which is what Up and Down step by. */
const COLS = 8;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

type Token = { start: number; end: number; query: string };

/** The `:query` word the caret sits at the end of, if any. */
const tokenAt = (text: string, caret: number): Token | null => {
  const head = text.slice(0, caret);
  const start = Math.max(head.lastIndexOf(" "), head.lastIndexOf("\n")) + 1;
  const word = head.slice(start);
  const match = /^:([a-z0-9_-]*)$/i.exec(word);
  if (!match) return null;
  return { start, end: caret, query: (match[1] ?? "").toLowerCase() };
};

const matchesFor = (items: EmojiItem[], query: string) => {
  if (query === "") return items;
  const hits = items.filter(
    (item) =>
      item.name.includes(query) ||
      (item.keywords ?? []).some((word) => word.includes(query)),
  );
  // Names that start with the query come first; the rest keep their order.
  return [
    ...hits.filter((item) => item.name.startsWith(query)),
    ...hits.filter((item) => !item.name.startsWith(query)),
  ];
};

/**
 * Emoji that rise to meet the caret. Typing a colon at the start of a word
 * opens a picker in the slot above the field: the slot's height is measured
 * by a ResizeObserver and glides open on `glide` while the panel rises from
 * `distances.step` on `snap`. Letters after the colon filter the set, and
 * because every option is a `layout` item the survivors slide to their new
 * cells on `glide` (FLIP), leavers fade on the exit ease without holding
 * space, and returners fade back in. The highlighted option lifts 2px on
 * `snap` and takes the wash; the foot reads its shortcode.
 *
 * Enter, Tab or a click replaces the `:query` token with the glyph and a
 * space, keeps the caret after it, and a last-used tile beside the field pops
 * in on `recoil` as a one-press repeat. Escape closes the picker and keeps
 * the text. Focus never leaves the textarea: it carries `aria-activedescendant`
 * for the highlighted option. Under reduced motion the slot and panel fade on
 * tweens, `layout` is off so cells swap in place, and the tile fades in.
 */
export function EmojiRise({
  ref,
  value,
  defaultValue,
  onValueChange,
  onSend,
  onInsert,
  onPickerChange,
  items = DEFAULT_EMOJI,
  placeholder = "Message",
  label,
  className,
}: EmojiRiseProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const draft = isControlled ? value : uncontrolled;
  const trimmed = draft.trim();

  const commit = (next: string) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  // The caret is DOM state, read in handlers and mirrored here for render.
  const [caret, setCaret] = React.useState(0);
  const [dismissed, setDismissed] = React.useState<string | null>(null);
  const [highlightName, setHighlightName] = React.useState<string | null>(null);
  const [last, setLast] = React.useState<{
    item: EmojiItem;
    pop: number;
  } | null>(null);
  const [note, setNote] = React.useState("");

  const token = tokenAt(draft, Math.min(caret, draft.length));
  const tokenKey = token ? `${token.start}:${token.query}` : null;
  const open = token !== null && dismissed !== tokenKey;
  const query = token?.query ?? "";
  const matches = open ? matchesFor(items, query) : [];
  const highlightIndex = Math.max(
    0,
    matches.findIndex((item) => item.name === highlightName),
  );
  const highlighted = matches[highlightIndex] ?? null;

  // Announce the match count per query, not per keystroke elsewhere. Adjusted
  // during render so the sentence belongs to the query that produced it.
  const announceKey = open ? `${query}|${matches.length}` : null;
  const [seenKey, setSeenKey] = React.useState<string | null>(announceKey);
  if (announceKey !== seenKey) {
    setSeenKey(announceKey);
    if (announceKey !== null) {
      setNote(
        matches.length === 0
          ? `No match for :${query}`
          : `${matches.length} ${matches.length === 1 ? "match" : "matches"} for :${query}`,
      );
    }
  }

  const latestPicker = React.useRef(onPickerChange);
  React.useEffect(() => {
    latestPicker.current = onPickerChange;
  });
  const matchCount = matches.length;
  React.useEffect(() => {
    latestPicker.current?.({ open, query, matches: matchCount });
  }, [open, query, matchCount]);

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // After an insert the caret belongs right after the glyph; the field's
  // value has to land first, so the move waits for the commit.
  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pendingCaret = React.useRef<number | null>(null);
  React.useEffect(() => {
    const pos = pendingCaret.current;
    const field = fieldRef.current;
    if (pos === null || !field) return;
    pendingCaret.current = null;
    field.focus();
    field.setSelectionRange(pos, pos);
  }, [draft]);

  const insertAt = (item: EmojiItem, start: number, end: number) => {
    const next = `${draft.slice(0, start)}${item.glyph} ${draft.slice(end)}`;
    const pos = start + item.glyph.length + 1;
    pendingCaret.current = pos;
    setCaret(pos);
    commit(next);
    setLast((prev) => ({ item, pop: (prev?.pop ?? 0) + 1 }));
    setDismissed(null);
    setHighlightName(null);
    setNote(`Inserted ${item.name}`);
    onInsert?.(item);
  };

  const pick = (item: EmojiItem) => {
    if (!token) return;
    insertAt(item, token.start, token.end);
  };

  const send = () => {
    if (trimmed === "") return;
    onSend?.(trimmed);
    commit("");
    setCaret(0);
    setNote("Message sent");
  };

  const moveHighlight = (delta: number) => {
    const next = Math.min(
      matches.length - 1,
      Math.max(0, highlightIndex + delta),
    );
    const item = matches[next];
    if (item) setHighlightName(item.name);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(tokenKey);
        return;
      }
      if (matches.length > 0) {
        const step =
          event.key === "ArrowRight"
            ? 1
            : event.key === "ArrowLeft"
              ? -1
              : event.key === "ArrowDown"
                ? COLS
                : event.key === "ArrowUp"
                  ? -COLS
                  : 0;
        if (step !== 0) {
          event.preventDefault();
          moveHighlight(step);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          moveHighlight(
            event.key === "Home" ? -matches.length : matches.length,
          );
          return;
        }
        if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
          event.preventDefault();
          if (highlighted) pick(highlighted);
          return;
        }
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

  const readCaret = (event: React.SyntheticEvent<HTMLTextAreaElement>) =>
    setCaret(event.currentTarget.selectionStart ?? 0);

  const optionId = (item: EmojiItem) =>
    `${baseId}-opt-${item.name.replace(/\s+/g, "-")}`;

  // A shortcode is one word: "big smile" prints as :big_smile:.
  const shortcode = highlighted
    ? `:${highlighted.name.replace(/\s+/g, "_")}:`
    : `:${query}`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
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
        <div ref={panelRef}>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="panel"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { y: springs.snap, opacity: FADE } : FADE
                }
                className="pb-2"
              >
                <div className="flex flex-col gap-1.5 rounded-3 border border-hairline bg-popover p-2 text-popover-foreground shadow-raised">
                  {matches.length > 0 ? (
                    <div
                      id={listId}
                      role="listbox"
                      aria-label="Emoji"
                      className="relative grid gap-1"
                      style={{
                        gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
                      }}
                    >
                      <AnimatePresence initial={false} mode="popLayout">
                        {matches.map((item) => {
                          const selected = highlighted?.name === item.name;
                          return (
                            <motion.button
                              key={item.name}
                              type="button"
                              role="option"
                              id={optionId(item)}
                              aria-selected={selected}
                              aria-label={item.name}
                              tabIndex={-1}
                              layout={motionSafe ? true : false}
                              initial={{ opacity: 0 }}
                              animate={{
                                opacity: 1,
                                y: selected && motionSafe ? -2 : 0,
                              }}
                              exit={{
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }}
                              transition={{
                                layout: springs.glide,
                                y: springs.snap,
                                opacity: FADE,
                              }}
                              onMouseDown={(event) => event.preventDefault()}
                              onPointerEnter={() => setHighlightName(item.name)}
                              onClick={() => pick(item)}
                              className={cn(
                                "grid aspect-square place-items-center rounded-2 border text-lg leading-none transition-colors",
                                selected
                                  ? "border-hairline-strong bg-cobalt-wash"
                                  : "border-transparent hover:bg-accent",
                              )}
                            >
                              <span aria-hidden>{item.glyph}</span>
                            </motion.button>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <p className="px-1 py-1.5 text-xs text-ink-3">
                      No match for :{query}
                    </p>
                  )}
                  <div className="flex h-5 items-center justify-between px-1 font-mono text-[11px] text-ink-3">
                    <span className="truncate">{shortcode}</span>
                    <span aria-hidden className="shrink-0">
                      Enter inserts
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <div className="flex items-center gap-2">
        <textarea
          ref={fieldRef}
          value={draft}
          onChange={(event) => {
            commit(event.target.value);
            readCaret(event);
          }}
          onSelect={readCaret}
          onKeyUp={readCaret}
          onClick={readCaret}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={open && matches.length > 0 ? listId : undefined}
          aria-activedescendant={
            open && highlighted ? optionId(highlighted) : undefined
          }
          rows={1}
          className={cn(
            "h-9 min-w-0 flex-1 resize-none rounded-3 border border-input bg-surface-0 px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        />

        {last ? (
          <motion.button
            key={last.pop}
            type="button"
            aria-label={`Insert ${last.item.name} again`}
            onClick={() => insertAt(last.item, caret, caret)}
            initial={motionSafe ? { scale: 0.5, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe ? { ...springs.recoil, opacity: FADE } : FADE
            }
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-3 border border-hairline bg-surface-1 text-lg leading-none transition-colors outline-none hover:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <span aria-hidden>{last.item.glyph}</span>
          </motion.button>
        ) : null}

        <button
          type="button"
          onClick={send}
          disabled={trimmed === ""}
          className={cn(
            "flex h-9 shrink-0 items-center rounded-3 bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity outline-none hover:opacity-90 disabled:opacity-50",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          Send
        </button>
      </div>

      <span id={hintId} className="sr-only">
        Type a colon to pick an emoji. Arrow keys move the highlight, Enter
        inserts, Escape closes. Enter sends, Shift+Enter breaks the line.
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {note}
      </span>
    </div>
  );
}
