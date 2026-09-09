"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AttachKind = "photo" | "doc" | "sheet";

export type Attachment = {
  id: string;
  name: string;
  kind: AttachKind;
  /** Draws the thumbnail. The same seed always draws the same picture. */
  seed: number;
};

export type PreviewMessage = {
  id: string;
  /** Own messages sit on the right. */
  from: "me" | "peer";
  text?: string;
  attachments?: Attachment[];
  /** Printed under the bubble, already formatted. */
  time?: string;
};

export type AttachPreviewProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: PreviewMessage[];
  /** Waiting in the strip. The parent adds from `onAttach` and clears on send. */
  pending: Attachment[];
  /** Fires from the Attach control; append the next file to `pending`. */
  onAttach?: () => void;
  /** Fires once a thumbnail's slot has finished narrowing to zero. */
  onRemove?: (id: string) => void;
  /** Fires from Enter or Send; clear `pending` and append the message together. */
  onSend?: (draft: { text: string; attachments: Attachment[] }) => void;
  /** @default "Them" */
  peerName?: string;
  /** @default "Message" */
  placeholder?: string;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

/** The thumbnail's side, and the slot it opens to with its trailing gap. */
const THUMB = 56;
const SLOT = THUMB + 8;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const KIND_WORD: Record<AttachKind, string> = {
  photo: "Photo",
  doc: "Document",
  sheet: "Sheet",
};

const KIND_SKIN: Record<AttachKind, string> = {
  photo: "bg-cobalt-wash text-cobalt-bright",
  doc: "bg-surface-2 text-ink-2",
  sheet: "bg-success/10 text-success",
};

/** Three decimals, because an unrounded float in an SVG attribute never hydrates. */
const r3 = (value: number) => Number(value.toFixed(3));

/**
 * A deterministic 0..1 from the seed. Multiplication, modulo and division are
 * correctly rounded everywhere, so unlike `Math.sin` this reads the same on
 * the server and in the browser.
 */
const pick = (seed: number, salt: number) =>
  (Math.abs(Math.round(seed) * 9301 + salt * 49297 + 49297) % 233280) / 233280;

/**
 * Every thumbnail is drawn from the attachment's seed, never loaded: a photo
 * is a sun over two ridges, a document is a page of lines, a sheet is a grid.
 */
function Thumb({ item }: { item: Attachment }) {
  const { seed, kind } = item;

  if (kind === "photo") {
    const cx = r3(10 + pick(seed, 1) * 36);
    const cy = r3(10 + pick(seed, 2) * 8);
    const back = `M0 56V${r3(34 + pick(seed, 3) * 6)}L${r3(16 + pick(seed, 4) * 10)} ${r3(20 + pick(seed, 5) * 8)}L56 ${r3(30 + pick(seed, 6) * 8)}V56Z`;
    const front = `M0 56V${r3(44 + pick(seed, 7) * 4)}L${r3(28 + pick(seed, 8) * 14)} ${r3(30 + pick(seed, 9) * 8)}L56 ${r3(42 + pick(seed, 10) * 6)}V56Z`;
    return (
      <svg viewBox="0 0 56 56" className="size-full" aria-hidden>
        <circle cx={cx} cy={cy} r="6" fill="currentColor" opacity="0.45" />
        <path d={back} fill="currentColor" opacity="0.3" />
        <path d={front} fill="currentColor" opacity="0.6" />
      </svg>
    );
  }

  if (kind === "sheet") {
    return (
      <svg viewBox="0 0 56 56" className="size-full" aria-hidden>
        <path d="M8 12h40v32H8z" fill="currentColor" opacity="0.18" />
        <path d="M8 12h40v8H8z" fill="currentColor" opacity="0.45" />
        <path
          d="M21.5 20v24M34.5 20v24M8 28h40M8 36h40"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.45"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 56 56" className="size-full" aria-hidden>
      <path d="M13 8h30v40H13z" fill="currentColor" opacity="0.18" />
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".5"
      >
        {[0, 1, 2, 3].map((row) => (
          <path
            key={row}
            d={`M19 ${18 + row * 7}h${r3(8 + pick(seed, row + 1) * 16)}`}
          />
        ))}
      </g>
    </svg>
  );
}

type SlotProps = {
  item: Attachment;
  leaving: boolean;
  motionSafe: boolean;
  flyId: string;
  onRemove: () => void;
  onGone: () => void;
  removeId: string;
};

/**
 * One pending thumbnail. The slot animates its width while the picture inside
 * sits absolutely at the slot's left, so the picture's own box never moves —
 * the slot clips it open and shut, and the shared `layoutId` it carries is
 * measuring a box that holds still until the send flies it into the thread.
 */
function Slot({
  item,
  leaving,
  motionSafe,
  flyId,
  onRemove,
  onGone,
  removeId,
}: SlotProps) {
  const move = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <motion.li
      aria-hidden={leaving || undefined}
      initial={{ width: 0 }}
      animate={{ width: leaving ? 0 : SLOT }}
      transition={move}
      onAnimationComplete={() => {
        // Only the narrowing hands the attachment back; the opening pass
        // completes too, and would drop a file the moment it arrived.
        if (leaving) onGone();
      }}
      className={cn(
        "relative h-14 shrink-0 overflow-hidden",
        leaving && "pointer-events-none",
      )}
    >
      <motion.div
        {...(motionSafe ? { layoutId: flyId } : {})}
        role="img"
        aria-label={`${KIND_WORD[item.kind]} ${item.name}`}
        title={item.name}
        initial={
          motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
        }
        animate={{ opacity: leaving ? 0 : 1, y: 0 }}
        transition={
          motionSafe
            ? {
                y: springs.snap,
                layout: springs.glide,
                // A leaver accelerates away; an arrival lands.
                opacity: leaving ? exitFor(durations.fast) : FADE,
              }
            : leaving
              ? exitFor(durations.fast)
              : FADE
        }
        className={cn(
          "absolute top-0 left-0 size-14 overflow-hidden rounded-2 border border-hairline",
          KIND_SKIN[item.kind],
        )}
      >
        <Thumb item={item} />
      </motion.div>

      <button
        type="button"
        id={removeId}
        aria-label={`Remove ${item.name}`}
        tabIndex={leaving ? -1 : undefined}
        onClick={onRemove}
        className={cn(
          "absolute top-1 left-9 grid size-5 place-items-center rounded-full bg-background/85 text-ink-2 transition-colors outline-none hover:text-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-3"
        >
          <path d="m4.5 4.5 7 7m0-7-7 7" />
        </svg>
      </button>
    </motion.li>
  );
}

/** Measures a border box without ever reading it during render. */
function useBoxHeight<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

const sentenceFor = (message: PreviewMessage, peerName: string) => {
  const files = message.attachments ?? [];
  const who = message.from === "me" ? "You" : peerName;
  const head =
    files.length === 0
      ? `${who}:`
      : `${who} sent ${files.length} ${files.length === 1 ? "attachment" : "attachments"}: ${files
          .map((file) => file.name)
          .join(", ")}.`;
  return message.text ? `${head} ${message.text}` : head;
};

/**
 * What you are about to send. Above the composer sits a strip whose height is
 * measured by a ResizeObserver, so it glides open on `glide` only when there
 * is something in it: a new thumbnail's slot widens from zero on `glide` while
 * the picture inside rises from `distances.step` on `snap`. Every thumbnail is
 * drawn from its attachment's seed — a sun over two ridges, a page of lines, a
 * grid — so nothing is loaded and nothing is random.
 *
 * Removing one narrows its slot to zero on `glide` and fades it on the exit
 * ease; its neighbours slide together, focus moves to the next remove control,
 * and the parent is told once the slot has actually closed. Sending moves the
 * files from `pending` into a new own-side message in one commit, and because
 * each picture carries a `layoutId` prefixed by `useId` it flies from the strip
 * into the bubble on `glide` rather than blinking out and back, while the
 * thread's measured height glides taller under it. Under reduced motion
 * nothing flies and nothing rises — the slots and the strip still open and
 * close, because a slot collapsing is feedback.
 */
export function AttachPreview({
  ref,
  messages,
  pending,
  onAttach,
  onRemove,
  onSend,
  peerName = "Them",
  placeholder = "Message",
  label,
  className,
}: AttachPreviewProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [draft, setDraft] = React.useState("");
  const [spoken, setSpoken] = React.useState("");
  const [leavingId, setLeavingId] = React.useState<string | null>(null);
  // Under reduced motion nothing flies, so the sent thumbnails stay a beat and
  // close their own slots. With motion on they must leave in the same commit
  // the bubble arrives, or the shared layoutId has two members and no handover.
  const [flown, setFlown] = React.useState<Attachment[]>([]);

  const attachRef = React.useRef<HTMLButtonElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const stripRef = React.useRef<HTMLDivElement | null>(null);
  const threadHeight = useBoxHeight(listRef);
  const stripHeight = useBoxHeight(stripRef);

  const removeId = (id: string) => `${baseId}-remove-${id}`;

  // Announce each arrival once. The seen list is adjusted during render so the
  // sentence belongs to the file that landed, not to a later re-render.
  const key = pending.map((item) => item.id).join(",");
  const [seen, setSeen] = React.useState<{ key: string; ids: string[] }>(
    () => ({
      key,
      ids: pending.map((item) => item.id),
    }),
  );
  if (key !== seen.key) {
    const added = pending.filter((item) => !seen.ids.includes(item.id));
    const last = added[added.length - 1];
    setSeen({ key, ids: pending.map((item) => item.id) });
    if (last) setSpoken(`${last.name} added`);
  }

  // A leaving id the parent has already dropped is simply gone.
  const leaving = pending.some((item) => item.id === leavingId)
    ? leavingId
    : null;
  const flushing = pending.length === 0 && flown.length > 0;
  const strip = pending.length > 0 ? pending : flown;

  // Pin the thread to the newest bubble; while the frame is still gliding
  // taller the browser clamps this back, which reads as the list rising.
  const count = messages.length;
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [count]);

  const remove = (item: Attachment, index: number) => {
    // Focus has to move before the slot closes, or it falls to the body: the
    // next remove control, the one before it, else the Attach control.
    const next = pending[index + 1] ?? pending[index - 1] ?? null;
    if (next) document.getElementById(removeId(next.id))?.focus();
    else attachRef.current?.focus();
    setSpoken(`Removed ${item.name}`);
    setLeavingId(item.id);
  };

  const submit = () => {
    const text = draft.trim();
    if (text === "" && pending.length === 0) return;
    onSend?.({ text, attachments: pending });
    if (!motionSafe) setFlown(pending);
    setDraft("");
    setSpoken(
      pending.length === 0
        ? "Sent"
        : `Sent with ${pending.length} ${pending.length === 1 ? "attachment" : "attachments"}`,
    );
  };

  const move = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <motion.div
        ref={scrollRef}
        initial={false}
        animate={{ height: threadHeight ?? "auto" }}
        transition={move}
        className="max-h-72 overflow-x-hidden overflow-y-auto"
      >
        <ol
          ref={listRef}
          role="list"
          aria-label={label}
          className="flex flex-col gap-3 px-0.5 pb-0.5"
        >
          {messages.map((message) => {
            const own = message.from === "me";
            const files = message.attachments ?? [];
            return (
              <motion.li
                key={message.id}
                aria-label={sentenceFor(message, peerName)}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe ? { y: springs.snap, opacity: FADE } : FADE
                }
                className={cn(
                  "flex flex-col gap-1",
                  own ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "flex max-w-[86%] flex-col gap-1.5 rounded-3 px-2 py-2 text-sm leading-snug wrap-break-word",
                    own
                      ? "rounded-br-1 bg-primary text-primary-foreground"
                      : "rounded-bl-1 bg-surface-2 text-foreground",
                  )}
                >
                  {files.length > 0 ? (
                    <span aria-hidden className="flex flex-wrap gap-1.5">
                      {files.map((file) => (
                        <motion.span
                          key={file.id}
                          {...(motionSafe
                            ? { layoutId: `${baseId}-fly-${file.id}` }
                            : {})}
                          transition={motionSafe ? springs.glide : FADE}
                          className={cn(
                            "size-14 overflow-hidden rounded-2 border border-hairline",
                            KIND_SKIN[file.kind],
                          )}
                        >
                          <Thumb item={file} />
                        </motion.span>
                      ))}
                    </span>
                  ) : null}
                  {message.text ? (
                    <span className="px-1">{message.text}</span>
                  ) : null}
                </div>
                {message.time ? (
                  <span className="px-1 text-[11px] text-ink-3 tabular-nums">
                    {message.time}
                  </span>
                ) : null}
              </motion.li>
            );
          })}
        </ol>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>

      {/* The strip and the composer share a column so the gap above the
          composer arrives with the strip's content instead of being held. */}
      <div className="flex flex-col">
        <motion.div
          initial={false}
          animate={{ height: stripHeight ?? "auto" }}
          transition={move}
          className="overflow-hidden"
        >
          <div ref={stripRef}>
            {strip.length > 0 ? (
              <ul
                aria-label="Attachments to send"
                className="flex flex-wrap gap-y-2 pb-2"
              >
                {strip.map((item, index) => (
                  <Slot
                    key={item.id}
                    item={item}
                    leaving={flushing || leaving === item.id}
                    motionSafe={motionSafe}
                    flyId={`${baseId}-fly-${item.id}`}
                    removeId={removeId(item.id)}
                    onRemove={() => remove(item, index)}
                    onGone={() =>
                      flushing
                        ? setFlown((prev) => (prev.length === 0 ? prev : []))
                        : onRemove?.(item.id)
                    }
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </motion.div>

        <div className="flex items-center gap-2">
          <button
            ref={attachRef}
            type="button"
            aria-label="Attach"
            onClick={() => onAttach?.()}
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-3 border border-input bg-surface-0 text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
            >
              <path d="M8 3.5v9M3.5 8h9" />
            </svg>
          </button>

          <textarea
            aria-label={`Message ${peerName}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder}
            rows={1}
            className={cn(
              "h-9 min-w-0 flex-1 resize-none rounded-3 border border-input bg-surface-0 px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          />

          <button
            type="button"
            onClick={submit}
            disabled={draft.trim() === "" && pending.length === 0}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-3 bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity outline-none hover:opacity-90 disabled:opacity-50",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
