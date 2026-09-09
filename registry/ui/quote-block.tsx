"use client";

import * as React from "react";

import { animate, motion, type AnimationPlaybackControls } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MessageQuote = {
  /** The message these words came from. */
  sourceId: string;
  /** The words themselves, matched against the source's own text. */
  text: string;
};

export type QuoteMessage = {
  id: string;
  /** "me" reads as "You"; anything else is the sender's name. */
  from: string;
  text: string;
  /** Already formatted — nothing here reads a clock. */
  time?: string;
  /** The passage this message carries inside it. */
  quote?: MessageQuote;
};

export type QuoteBlockProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: QuoteMessage[];
  /** Controlled id of the message whose quote card is unfolded; one at a time. */
  expandedId?: string | null;
  /** Initial unfolded card for uncontrolled usage. @default null */
  defaultExpandedId?: string | null;
  /** Fires from the disclosure control. */
  onExpandedChange?: (id: string | null) => void;
  /** Fires when the thread is carried back to the original. */
  onShowSource?: (sourceId: string, quoteId: string) => void;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

/** One line of the quote stays visible while it is folded. */
const FOLDED = 20;

type Lit = { id: string; sourceId: string };

const nameOf = (message: QuoteMessage) =>
  message.from === "me" ? "You" : message.from;

/**
 * Splits the source's text at the quoted words. The match is exact first, then
 * case-insensitive; a quote whose words are not in the source is not a claim
 * this component makes quietly — the whole message lights instead, and the
 * card's own label says the words were not found.
 */
const split = (
  text: string,
  quote: string,
): { before: string; hit: string; after: string; matched: boolean } => {
  const exact = text.indexOf(quote);
  const start =
    exact >= 0 ? exact : text.toLowerCase().indexOf(quote.toLowerCase());
  if (start < 0) return { before: "", hit: text, after: "", matched: false };
  return {
    before: text.slice(0, start),
    hit: text.slice(start, start + quote.length),
    after: text.slice(start + quote.length),
    matched: true,
  };
};

type CardProps = {
  quote: MessageQuote;
  sourceName: string;
  sourceTime?: string;
  matched: boolean;
  expanded: boolean;
  motionSafe: boolean;
  bodyId: string;
  onToggle: () => void;
  onShow: () => void;
  onActive: (active: boolean) => void;
};

/**
 * The card measures its own passage: a ResizeObserver binds to the blockquote
 * when the node arrives, so the unfold glides to a height that was read rather
 * than guessed, and the folded state holds one line instead of reserving room
 * for the rest.
 */
function QuoteCard({
  quote,
  sourceName,
  sourceTime,
  matched,
  expanded,
  motionSafe,
  bodyId,
  onToggle,
  onShow,
  onActive,
}: CardProps) {
  const [node, setNode] = React.useState<HTMLQuoteElement | null>(null);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = Math.round(node.offsetHeight);
      setHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  const quiet =
    "flex items-center rounded-2 outline-none transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

  return (
    <div
      onPointerEnter={() => onActive(true)}
      onPointerLeave={() => onActive(false)}
      onFocus={() => onActive(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        onActive(false);
      }}
      className="mb-1.5 flex flex-col rounded-2 border-l-2 border-cobalt-bright bg-surface-2/70"
    >
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
          aria-label={`Quote from ${sourceName}${sourceTime ? `, ${sourceTime}` : ""}: ${
            expanded ? "fold" : "unfold"
          }${matched ? "" : ". These words are not in the original"}`}
          className={cn(
            quiet,
            "h-6 min-w-0 flex-1 gap-1 px-1.5 text-[11px] font-medium text-cobalt-bright hover:bg-accent",
          )}
        >
          <motion.span
            aria-hidden
            initial={false}
            animate={{ rotate: expanded ? 90 : 0 }}
            // Reduced motion gets the swap, not the sweep: the caret is at its
            // new angle at once rather than turning through the arc.
            transition={motionSafe ? springs.snap : { duration: 0 }}
            className="flex size-3 shrink-0 items-center justify-center"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
            >
              <path d="m6 3.5 5 4.5-5 4.5" />
            </svg>
          </motion.span>
          <span className="truncate">{sourceName}</span>
          {sourceTime ? (
            <span className="shrink-0 font-mono text-ink-3 tabular-nums">
              {sourceTime}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onShow}
          aria-label={`Show ${sourceName}'s message in the thread`}
          className={cn(
            quiet,
            "size-6 shrink-0 justify-center text-ink-3 hover:bg-accent hover:text-foreground",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5"
          >
            <path d="M8 12.5V4m0 0L4.5 7.5M8 4l3.5 3.5" />
          </svg>
        </button>
      </div>

      <motion.div
        id={bodyId}
        initial={false}
        animate={{ height: expanded && height > 0 ? height : FOLDED }}
        transition={motionSafe ? springs.glide : { duration: durations.fast }}
        className="overflow-hidden"
      >
        <blockquote
          ref={setNode}
          className="px-2 pb-1.5 text-[12px] leading-5 wrap-break-word text-ink-2"
        >
          {`“${quote.text}”`}
          <cite className="block pt-0.5 text-[11px] text-ink-3 not-italic">
            {sourceName}
          </cite>
        </blockquote>
      </motion.div>
    </div>
  );
}

/**
 * A message that carries someone else's words. The quote sits inside the bubble
 * as a card with a cobalt rule down its side; folded it shows one line, and its
 * disclosure glides to a measured height on `glide` rather than to a guess.
 *
 * Pointing at the card — or focusing either of its controls — draws the wash
 * across the exact words in the original above: the source's text is split at
 * the matched run and the highlight's `scaleX` runs 0 to 1 from its left edge
 * on `snap`, so the sentence is marked rather than switched on. The card's
 * second control carries the thread back: `scrollTop` is driven by `glide` and
 * focus lands on the source with `preventScroll`, so the browser's own
 * scrolling cannot race the spring.
 *
 * Under reduced motion the height swaps on a fast tween and the wash appears at
 * full width at once, because which words were quoted is information.
 */
export function QuoteBlock({
  ref,
  messages,
  expandedId,
  defaultExpandedId = null,
  onExpandedChange,
  onShowSource,
  label,
  className,
}: QuoteBlockProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultExpandedId,
  );
  const expanded = expandedId === undefined ? uncontrolled : expandedId;
  const [hovered, setHovered] = React.useState<Lit | null>(null);
  const [shown, setShown] = React.useState<Lit | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const listRef = React.useRef<HTMLOListElement | null>(null);
  const itemRefs = React.useRef(new Map<string, HTMLLIElement>());
  const scrollRef = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => () => scrollRef.current?.stop(), []);

  const byId = React.useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  // Which words each source has had taken from it. Splitting the source once,
  // for good, keeps the marked run mounted: the wash can then be drawn and
  // drained on the same element instead of the text re-flowing under it.
  const quotedBy = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const message of messages) {
      if (message.quote && !map.has(message.quote.sourceId)) {
        map.set(message.quote.sourceId, message.quote.text);
      }
    }
    return map;
  }, [messages]);
  const lit = hovered ?? shown;

  const toggle = (message: QuoteMessage, source: QuoteMessage) => {
    const next = expanded === message.id ? null : message.id;
    if (expandedId === undefined) setUncontrolled(next);
    onExpandedChange?.(next);
    setAnnounce(
      next === null
        ? `Quote from ${nameOf(source)} folded`
        : `Quote from ${nameOf(source)} unfolded`,
    );
  };

  const show = (message: QuoteMessage, source: QuoteMessage) => {
    setShown({ id: message.id, sourceId: source.id });
    setAnnounce(
      `Showing ${nameOf(source)}'s message${source.time ? ` from ${source.time}` : ""}`,
    );
    onShowSource?.(source.id, message.id);

    const box = listRef.current;
    const node = itemRefs.current.get(source.id);
    if (!box || !node) return;
    const room = Math.max(0, box.scrollHeight - box.clientHeight);
    const centred = node.offsetTop - (box.clientHeight - node.offsetHeight) / 2;
    const dest = Math.round(Math.min(room, Math.max(0, centred)));
    // preventScroll: the browser's own scroll-into-view would land the message
    // at once and leave the glide chasing a box that had already moved.
    const land = () => node.focus({ preventScroll: true });
    scrollRef.current?.stop();
    if (!motionSafe) {
      box.scrollTop = dest;
      land();
      return;
    }
    scrollRef.current = animate(box.scrollTop, dest, {
      ...springs.glide,
      onUpdate: (value) => {
        box.scrollTop = value;
      },
      onComplete: land,
    });
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <ol
        ref={listRef}
        role="list"
        aria-label={label}
        className="flex max-h-72 flex-col gap-2.5 overflow-x-hidden overflow-y-auto px-0.5 py-0.5"
      >
        {messages.map((message) => {
          const own = message.from === "me";
          const source = message.quote
            ? byId.get(message.quote.sourceId)
            : undefined;
          const taken = quotedBy.get(message.id);
          const runs = taken ? split(message.text, taken) : null;
          const isLit = lit?.sourceId === message.id;
          const quoteMatch =
            message.quote && source
              ? split(source.text, message.quote.text).matched
              : true;

          return (
            <li
              key={message.id}
              ref={(node) => {
                if (node) itemRefs.current.set(message.id, node);
                else itemRefs.current.delete(message.id);
              }}
              tabIndex={-1}
              className={cn(
                "flex flex-col gap-0.5 rounded-3 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                own ? "items-end" : "items-start",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 px-1 text-[11px] text-ink-3",
                  own && "flex-row-reverse",
                )}
              >
                <span>{nameOf(message)}</span>
                {message.time ? (
                  <span className="font-mono tabular-nums">{message.time}</span>
                ) : null}
              </span>

              <div
                className={cn(
                  "max-w-[92%] min-w-0 rounded-3 px-2 py-1.5 text-sm leading-5 text-foreground",
                  own
                    ? "rounded-br-1 bg-surface-2"
                    : "rounded-bl-1 border border-hairline bg-surface-1",
                )}
              >
                {message.quote && source ? (
                  <QuoteCard
                    quote={message.quote}
                    sourceName={nameOf(source)}
                    sourceTime={source.time}
                    matched={quoteMatch}
                    expanded={expanded === message.id}
                    motionSafe={motionSafe}
                    bodyId={`${baseId}-${message.id}-body`}
                    onToggle={() => toggle(message, source)}
                    onShow={() => show(message, source)}
                    onActive={(active) =>
                      setHovered(
                        active ? { id: message.id, sourceId: source.id } : null,
                      )
                    }
                  />
                ) : null}

                <p className="px-1 wrap-break-word">
                  {runs ? (
                    <>
                      {runs.before}
                      <mark className="relative rounded-1 bg-transparent text-inherit">
                        {/* The wash is drawn across the words from their own
                            left edge; the text rides above it, untouched. It
                            stays mounted so leaving drains it rather than
                            cutting it. */}
                        <motion.span
                          aria-hidden
                          initial={false}
                          animate={
                            motionSafe
                              ? {
                                  scaleX: isLit ? 1 : 0,
                                  opacity: isLit ? 1 : 0,
                                }
                              : { scaleX: 1, opacity: isLit ? 1 : 0 }
                          }
                          transition={
                            motionSafe
                              ? {
                                  ...springs.snap,
                                  opacity: {
                                    duration: durations.fast,
                                    ease: isLit ? easings.enter : easings.exit,
                                  },
                                }
                              : { duration: durations.fast }
                          }
                          className="pointer-events-none absolute -inset-x-0.5 inset-y-0 origin-left rounded-1 bg-cobalt-wash"
                        />
                        <span className="relative">{runs.hit}</span>
                      </mark>
                      {runs.after}
                    </>
                  ) : (
                    message.text
                  )}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
