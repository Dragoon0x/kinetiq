"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type QuickReplyTone = "neutral" | "warm";

export type QuickReplyNotice = {
  id: string;
  /** Who sent it. */
  title: string;
  /** The message. */
  body: string;
  /** A danger tone is announced assertively. @default "info" */
  tone?: "info" | "success" | "warn" | "danger";
  /** When it came: "now", "2m". */
  time?: string;
  /** Up to two letters for the avatar. @default the sender's initials */
  initials?: string;
};

export type QuickReplyProps = {
  /** The messages, front first. The first is answerable; the rest wait behind it. */
  notices: QuickReplyNotice[];
  /** Fires from the dismiss button or Delete on the front message. */
  onDismiss?: (id: string) => void;
  /** The reply, sent from the field, a suggestion, or Enter. */
  onReply?: (id: string, text: string) => void;
  /** Offer three suggested replies under the field. @default true */
  suggestions?: boolean;
  /** Show the sender typing before each new message. @default true */
  typing?: boolean;
  /** The suggestions' voice and colour. @default "neutral" */
  tone?: QuickReplyTone;
  /** Your own three suggestions for a message and tone. */
  suggest?: (notice: QuickReplyNotice, tone: QuickReplyTone) => string[];
  /** The region's accessible name. @default "Messages" */
  label?: string;
  /** Play the reply's pop, whoosh and tick. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

const REPLIES: Record<QuickReplyTone, string[]> = {
  neutral: ["On my way", "Sounds good", "Call you later"],
  warm: ["Thank you", "Love that", "Talk soon?"],
};

// Warm is a pigment taken from the warning hue at a fixed lightness, so the
// chips read the same on a light or a dark page; neutral stays on the accent.
const CHIP: Record<QuickReplyTone, React.CSSProperties> = {
  neutral: {
    background: "var(--accent-wash)",
    color: "var(--accent-bright)",
    borderColor: "color-mix(in oklab, var(--accent-bright) 30%, transparent)",
  },
  warm: {
    background: "oklch(from var(--warn) 0.9 0.06 calc(h - 18))",
    color: "oklch(from var(--warn) 0.38 0.09 calc(h - 18))",
    borderColor: "oklch(from var(--warn) 0.78 0.1 calc(h - 18))",
  },
};

const BUBBLE: Record<QuickReplyTone, React.CSSProperties> = {
  neutral: {
    background: "var(--accent)",
    color: "var(--primary-foreground)",
  },
  warm: {
    background: "oklch(from var(--warn) 0.58 0.13 calc(h - 18))",
    color: "color-mix(in oklab, var(--warn) 6%, white)",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const sentence = (text: string) =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

/** How long the sender types before a message shows: longer for longer ones. */
const typingFor = (body: string) => 900 + Math.min(700, body.length * 8);

type Rect = { x: number; y: number; w: number; h: number };

type Flight = { key: number; text: string; from: Rect };

type CardProps = {
  notice: QuickReplyNotice;
  revealed: boolean;
  reply: string | undefined;
  suggestions: boolean;
  tone: QuickReplyTone;
  offered: string[];
  fresh: boolean;
  leaving: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onSend: (text: string, from: Element | null) => void;
  onDismiss: () => void;
  onOpenReply: () => void;
  onTick: () => void;
  onGone: () => void;
  bindCard?: (node: HTMLDivElement | null) => void;
};

function Dots({ motionSafe }: { motionSafe: boolean }) {
  return (
    <span aria-hidden className="flex h-7 items-center gap-1 px-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-ink-3"
          // Three keyframes: a tween, never a spring. Offset per dot so no
          // two are ever at the same height.
          animate={
            motionSafe ? { y: [0, -3, 0] } : { opacity: [0.35, 1, 0.35] }
          }
          transition={{
            duration: 0.9,
            ease: easings.move,
            repeat: Infinity,
            delay: i * 0.15,
          }}
        />
      ))}
    </span>
  );
}

function ReplyCard({
  notice,
  revealed,
  reply,
  suggestions,
  tone,
  offered,
  fresh,
  leaving,
  disabled,
  motionSafe,
  onSend,
  onDismiss,
  onOpenReply,
  onTick,
  onGone,
  bindCard,
}: CardProps) {
  const uid = React.useId();
  const [composing, setComposing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [chip, setChip] = React.useState(0);
  const [bodyH, setBodyH] = React.useState<number | null>(null);
  const [crowded, setCrowded] = React.useState(false);
  const lifting = React.useRef(0);

  const reveal = useMotionValue(revealed ? 1 : 0);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const replyButton = React.useRef<HTMLButtonElement | null>(null);
  const field = React.useRef<HTMLTextAreaElement | null>(null);
  const chips = React.useRef(new Map<number, HTMLButtonElement>());
  const refocus = React.useRef<"card" | "reply" | null>(null);
  const growing = React.useRef<AnimationPlaybackControls | null>(null);

  // The dots' pill opens into the whole message, which is already laid out
  // at its final width: only the clip moves, so nothing reflows.
  const shown = React.useRef(revealed);
  React.useEffect(() => {
    if (revealed === shown.current) return;
    shown.current = revealed;
    if (!revealed) {
      reveal.jump(0);
      return;
    }
    growing.current?.stop();
    growing.current = motionSafe
      ? animate(reveal, 1, springs.glide)
      : animate(reveal, 1, { duration: durations.base, ease: easings.enter });
  }, [revealed, motionSafe, reveal]);

  React.useEffect(
    () => () => {
      growing.current?.stop();
      window.clearTimeout(lifting.current);
    },
    [],
  );

  // The chips scroll sideways when they do not fit; a fade says so.
  const bindChips = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() =>
      setCrowded(node.scrollWidth > node.clientWidth + 1),
    );
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const clip = useTransform(reveal, (p) => {
    const q = Math.max(0, 1 - p);
    // At 0 the clip is exactly the dots' pill: 50 by 28.
    return `inset(0 calc(${r2(q * 100)}% - ${r2(q * 50)}px) calc(${r2(q * 100)}% - ${r2(q * 28)}px) 0 round 10px)`;
  });
  const words = useTransform(reveal, (p) => r2(Math.max(0, (p - 0.35) / 0.65)));

  const bindInner = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      const h = Math.round(node.offsetHeight);
      setBodyH((prev) => (prev === h ? prev : h));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  // Focus goes where it belongs once the node it belongs on has arrived.
  const bindField = React.useCallback((node: HTMLTextAreaElement | null) => {
    field.current = node;
    if (node) node.focus({ preventScroll: true });
  }, []);
  const bindSent = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      // Reduced motion draws no tick, so the tick is heard as the row lands.
      if (!motionSafe) onTick();
      if (refocus.current !== "card") return;
      refocus.current = null;
      cardRef.current?.focus({ preventScroll: true });
    },
    // Bound once, when the sent row arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      bindCard?.(node);
    },
    [bindCard],
  );
  const bindReplyButton = React.useCallback(
    (node: HTMLButtonElement | null) => {
      replyButton.current = node;
      if (!node || refocus.current !== "reply") return;
      refocus.current = null;
      node.focus({ preventScroll: true });
    },
    [],
  );

  const open = () => {
    if (disabled || composing) return;
    setComposing(true);
    setChip(0);
    onOpenReply();
  };

  const close = () => {
    refocus.current = "reply";
    setComposing(false);
  };

  const send = (text: string, from: Element | null) => {
    const clean = text.trim();
    if (!clean || disabled) return;
    refocus.current = cardRef.current?.contains(document.activeElement ?? null)
      ? "card"
      : null;
    onSend(clean, from);
    // The reply lifts off first; the composer folds once it has left.
    window.clearTimeout(lifting.current);
    lifting.current = window.setTimeout(() => {
      setComposing(false);
      setDraft("");
    }, 160);
  };

  const onChipKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const n = offered.length;
    const to = (i: number) => {
      const next = (i + n) % n;
      setChip(next);
      chips.current.get(next)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        to(chip + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        to(chip - 1);
        return;
      case "Home":
        event.preventDefault();
        to(0);
        return;
      case "End":
        event.preventDefault();
        to(n - 1);
        return;
    }
  };

  const sender = notice.title;
  const tint = CHIP[tone] ?? CHIP.neutral;
  const lift = motionSafe ? springs.snap : { duration: durations.fast };

  return (
    <motion.div
      ref={bindRoot}
      role="group"
      tabIndex={leaving ? -1 : 0}
      aria-labelledby={`${uid}-from`}
      aria-describedby={revealed ? `${uid}-msg` : `${uid}-typing`}
      inert={leaving}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || disabled) return;
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onDismiss();
        } else if (event.key === "Enter" && revealed && !reply) {
          event.preventDefault();
          open();
        }
      }}
      initial={
        fresh
          ? motionSafe
            ? { opacity: 0, y: distances.step, scale: 0.96 }
            : { opacity: 0 }
          : false
      }
      animate={
        leaving
          ? motionSafe
            ? { opacity: 0, y: distances.shift, scale: 0.98 }
            : { opacity: 0 }
          : { opacity: 1, y: 0, scale: 1 }
      }
      transition={leaving ? exitFor() : lift}
      onAnimationComplete={() => {
        if (leaving) onGone();
      }}
      className={cn(
        "relative w-full rounded-3 border border-hairline-strong bg-popover p-3 text-left",
        "shadow-[0_8px_20px_-12px_color-mix(in_oklab,black_50%,transparent)]",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        leaving && "pointer-events-none absolute inset-x-0 top-0 z-20",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-xs font-medium text-cobalt-bright"
        >
          {notice.initials ?? initialsOf(sender)}
        </span>
        <div className="min-w-0 flex-1">
          <p
            id={`${uid}-from`}
            className="truncate text-sm leading-5 font-medium text-foreground"
            title={sender}
          >
            {sender}
          </p>
          <p id={`${uid}-typing`} className="text-[11px] leading-4 text-ink-3">
            {revealed ? (notice.time ?? "now") : "typing…"}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Dismiss message from ${sender}`}
          disabled={disabled || leaving}
          onClick={onDismiss}
          className={cn(
            "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-2 text-ink-3 transition-colors",
            "hover:bg-surface-2 hover:text-foreground",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
          >
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <motion.div
        className="overflow-clip"
        initial={false}
        animate={{ height: bodyH ?? "auto" }}
        transition={motionSafe ? springs.glide : { duration: durations.fast }}
      >
        <div ref={bindInner} className="flex flex-col gap-2 pt-2">
          <div className="relative">
            <motion.p
              id={`${uid}-msg`}
              aria-hidden={!revealed || undefined}
              className={cn(
                "w-fit max-w-full rounded-3 rounded-tl-1 bg-card px-3 py-1.5 text-sm leading-5 text-foreground shadow-[inset_0_0_0_1px_var(--hairline)]",
                !revealed && "invisible absolute inset-x-0 top-0",
              )}
              style={{ clipPath: clip }}
            >
              <motion.span style={{ opacity: words }}>
                {notice.body}
              </motion.span>
            </motion.p>
            {!revealed ? (
              <span className="flex w-fit rounded-3 rounded-tl-1 bg-card shadow-[inset_0_0_0_1px_var(--hairline)]">
                <Dots motionSafe={motionSafe} />
              </span>
            ) : null}
          </div>

          {revealed && reply && !composing ? (
            <div
              ref={bindSent}
              className="flex items-center justify-end gap-1.5 text-xs text-ink-2"
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="size-4 shrink-0 text-success"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <motion.path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.flick, delay: 0.12 }
                      : { duration: 0 }
                  }
                  onAnimationComplete={onTick}
                />
              </svg>
              <span className="min-w-0 truncate" title={reply}>
                You: {reply}
              </span>
            </div>
          ) : null}

          {revealed && !reply && !composing ? (
            <div className="flex justify-end">
              <button
                ref={bindReplyButton}
                type="button"
                disabled={disabled}
                aria-expanded={false}
                aria-controls={`${uid}-composer`}
                onClick={open}
                className={cn(
                  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs font-medium text-foreground transition-colors",
                  "hover:bg-surface-2",
                  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className="size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6.5 4 2.5 8l4 4" />
                  <path d="M2.5 8h7a4 4 0 0 1 4 4v.5" />
                </svg>
                Reply
              </button>
            </div>
          ) : null}

          {revealed && composing ? (
            <div
              id={`${uid}-composer`}
              inert={Boolean(reply)}
              className={cn(
                "flex flex-col gap-2 transition-opacity",
                reply && "opacity-40",
              )}
            >
              <div className="flex items-end gap-2">
                <textarea
                  ref={bindField}
                  rows={1}
                  value={draft}
                  disabled={disabled}
                  aria-label={`Reply to ${sender}`}
                  placeholder={`Reply to ${sender.split(" ")[0] ?? sender}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send(draft, event.currentTarget);
                    } else if (event.key === "Escape") {
                      // Handled where focus is: the stage must not also close.
                      event.preventDefault();
                      close();
                    }
                  }}
                  className={cn(
                    "h-9 min-w-0 flex-1 resize-none rounded-2 border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground placeholder:text-ink-3",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                />
                <button
                  type="button"
                  aria-label="Send reply"
                  disabled={disabled || draft.trim() === ""}
                  onClick={(event) =>
                    send(draft, field.current ?? event.currentTarget)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      close();
                    }
                  }}
                  className={cn(
                    "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-2 bg-primary text-primary-foreground transition-opacity",
                    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 13V3.5" />
                    <path d="M3.8 7.5 8 3.3l4.2 4.2" />
                  </svg>
                </button>
              </div>
              {suggestions && offered.length > 0 ? (
                <div
                  ref={bindChips}
                  role="toolbar"
                  aria-label="Suggested replies"
                  className="-mx-0.5 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-0.5 [&::-webkit-scrollbar]:hidden"
                  style={
                    crowded
                      ? {
                          maskImage:
                            "linear-gradient(to right, black calc(100% - 28px), transparent)",
                        }
                      : undefined
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      close();
                    }
                  }}
                >
                  {offered.map((text, i) => (
                    <motion.button
                      key={`${tone}-${text}`}
                      ref={(node: HTMLButtonElement | null) => {
                        if (node) chips.current.set(i, node);
                        else chips.current.delete(i);
                      }}
                      type="button"
                      tabIndex={chip === i ? 0 : -1}
                      disabled={disabled}
                      onKeyDown={onChipKey}
                      onFocus={() => setChip(i)}
                      onClick={(event) => send(text, event.currentTarget)}
                      initial={
                        motionSafe
                          ? { opacity: 0, x: distances.step }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, x: 0 }}
                      transition={
                        motionSafe
                          ? { ...springs.snap, delay: 0.05 + i * cascade(3) }
                          : { duration: durations.fast }
                      }
                      className={cn(
                        "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full border px-2.5 text-xs whitespace-nowrap transition-[filter]",
                        "hover:brightness-95",
                        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                      style={tint}
                    >
                      {text}
                    </motion.button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}

type Said = { n: number; text: string; urgent: boolean };

/**
 * A message notification you can answer without leaving where you are. A new
 * message first shows its sender typing, three dots on a staggered wave; then
 * the dots' pill opens into the message on glide. Reply expands the notice
 * inline, measured and gliding, into a real field with three suggested
 * replies that slide in on snap. Sending lifts the reply off from where its
 * words were, the field or the chip, and throws it up and out of the card
 * with a whoosh; the composer collapses and a tick draws itself beside
 * "You: …".
 *
 * Other messages wait behind the front one as slivers. Dismissing the front
 * one sends it down and away and the next rises into its place, typing first
 * if it has not been read. The notice is a focusable group: Enter replies,
 * Delete dismisses; in the field Enter sends and Escape goes back; the
 * suggestions are a toolbar with arrow keys. Under reduced motion the dots
 * fade instead of bouncing, the message and chips fade in, and the reply
 * fades where it was instead of flying.
 */
export function QuickReply({
  notices,
  onDismiss,
  onReply,
  suggestions = true,
  typing = true,
  tone = "neutral",
  suggest,
  label = "Messages",
  sound = false,
  disabled = false,
  className,
}: QuickReplyProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const voice: QuickReplyTone = tone === "warm" ? "warm" : "neutral";

  const [gone, setGone] = React.useState<string[]>([]);
  const [leaving, setLeaving] = React.useState<QuickReplyNotice | null>(null);
  const [revealed, setRevealed] = React.useState<string[]>([]);
  const [replies, setReplies] = React.useState<Record<string, string>>({});
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [firstFront] = React.useState(() => notices[0]?.id ?? null);
  const [said, setSaid] = React.useState<Said & { id: string }>({
    n: 0,
    id: "",
    text: "",
    urgent: false,
  });

  const live = notices.filter((n) => !gone.includes(n.id));
  if (gone.some((id) => !notices.some((n) => n.id === id))) {
    setGone(gone.filter((id) => notices.some((n) => n.id === id)));
  }
  const front = live[0] ?? null;
  const behind = live.slice(1);
  // With typing off a message is simply there, and stays read if typing is
  // turned back on.
  if (front && !typing && !revealed.includes(front.id)) {
    setRevealed([...revealed, front.id]);
  }
  const isRevealed = front ? revealed.includes(front.id) || !typing : false;
  if (front && isRevealed && said.id !== front.id) {
    setSaid({
      n: said.n + 1,
      id: front.id,
      text: `${front.title}: ${sentence(front.body)}`,
      urgent: front.tone === "danger",
    });
  }

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const flightKey = React.useRef(0);
  const frontNode = React.useRef<HTMLDivElement | null>(null);
  const focusFront = React.useRef(false);
  const justSent = React.useRef<string | null>(null);
  const bindFront = React.useCallback((node: HTMLDivElement | null) => {
    frontNode.current = node;
    if (!node || !focusFront.current) return;
    focusFront.current = false;
    node.focus({ preventScroll: true });
  }, []);

  // The sender types for a beat before the message shows.
  const frontId = front?.id ?? null;
  const frontBody = front?.body ?? "";
  const waiting = Boolean(frontId && typing && !revealed.includes(frontId));
  React.useEffect(() => {
    if (!waiting || !frontId) return;
    const t = window.setTimeout(() => {
      setRevealed((r) => (r.includes(frontId) ? r : [...r, frontId]));
    }, typingFor(frontBody));
    return () => window.clearTimeout(t);
  }, [waiting, frontId, frontBody]);

  const offered = front
    ? (suggest?.(front, voice) ?? REPLIES[voice]).slice(0, 3)
    : [];

  const panOf = (el: Element | null) => {
    const rect = el?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const send = (text: string, from: Element | null) => {
    if (!front) return;
    const root = rootRef.current?.getBoundingClientRect();
    const rect = from?.getBoundingClientRect();
    if (root && rect) {
      flightKey.current += 1;
      setFlight({
        key: flightKey.current,
        text,
        from: {
          x: r2(rect.left - root.left),
          y: r2(rect.top - root.top),
          w: r2(rect.width),
          h: r2(rect.height),
        },
      });
    }
    setReplies((r) => ({ ...r, [front.id]: text }));
    justSent.current = front.id;
    setSaid((p) => ({
      n: p.n + 1,
      id: p.id,
      text: `Reply sent to ${front.title}.`,
      urgent: false,
    }));
    onReply?.(front.id, text);
    audio.play("whoosh", { pitch: 1.15, gain: 0.5, pan: panOf(from) });
  };

  const dismiss = () => {
    if (!front || disabled) return;
    const hadFocus = Boolean(
      rootRef.current?.contains(document.activeElement ?? null),
    );
    setLeaving(front);
    setGone((g) => (g.includes(front.id) ? g : [...g, front.id]));
    onDismiss?.(front.id);
    if (hadFocus) {
      // The next message takes focus when it arrives; with none, the region.
      if (live.length > 1) focusFront.current = true;
      else rootRef.current?.focus({ preventScroll: true });
    }
  };

  const flightStyle = BUBBLE[voice] ?? BUBBLE.neutral;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={label}
      tabIndex={-1}
      className={cn(
        "relative isolate w-full max-w-[340px] overflow-clip outline-none",
        behind.length > 0 ? "pb-3" : "pb-0",
        className,
      )}
    >
      <div className="relative">
        {behind.slice(0, 2).map((n, i) => (
          <div
            key={n.id}
            aria-hidden
            className={cn(
              "absolute h-6 rounded-b-3 border border-t-0 border-hairline-strong bg-popover",
              i === 0
                ? "inset-x-3 -bottom-1.5 opacity-90"
                : "inset-x-6 -bottom-3 opacity-70",
            )}
            style={{ zIndex: -1 - i }}
          />
        ))}
        {front ? (
          <ReplyCard
            key={front.id}
            notice={front}
            revealed={isRevealed}
            reply={replies[front.id]}
            suggestions={suggestions}
            tone={voice}
            offered={offered}
            fresh={front.id !== firstFront}
            leaving={false}
            disabled={disabled}
            motionSafe={motionSafe}
            onSend={send}
            onDismiss={dismiss}
            onOpenReply={() =>
              audio.play("pop", {
                gain: 0.5,
                pan: panOf(rootRef.current),
              })
            }
            onTick={() => {
              // Only the reply the visitor just sent ticks, not one redrawn.
              if (justSent.current !== front.id) return;
              justSent.current = null;
              audio.play("tick", {
                pitch: 1.2,
                gain: 0.45,
                pan: panOf(rootRef.current),
              });
            }}
            onGone={() => {}}
            bindCard={bindFront}
          />
        ) : null}
        {leaving ? (
          <ReplyCard
            key={`leaving-${leaving.id}`}
            notice={leaving}
            revealed
            reply={replies[leaving.id]}
            suggestions={false}
            tone={voice}
            offered={[]}
            fresh={false}
            leaving
            disabled
            motionSafe={motionSafe}
            onSend={() => {}}
            onDismiss={() => {}}
            onOpenReply={() => {}}
            onTick={() => {}}
            onGone={() => setLeaving(null)}
          />
        ) : null}
      </div>

      {flight ? (
        <motion.p
          key={flight.key}
          aria-hidden
          className="pointer-events-none absolute z-30 flex items-center rounded-3 rounded-br-1 px-3 text-sm leading-5 whitespace-nowrap"
          style={{
            ...flightStyle,
            left: flight.from.x,
            top: flight.from.y,
            minWidth: 0,
            height: Math.max(28, Math.min(36, flight.from.h)),
          }}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
          animate={
            motionSafe
              ? { opacity: 0, x: 120, y: -90, rotate: -8, scale: 0.9 }
              : { opacity: 0 }
          }
          transition={
            motionSafe
              ? { duration: 0.45, ease: easings.exit }
              : { duration: durations.base, ease: easings.exit }
          }
          onAnimationComplete={() =>
            setFlight((f) => (f && f.key === flight.key ? null : f))
          }
        >
          {flight.text}
        </motion.p>
      ) : null}

      <p className="sr-only">
        {behind.length > 0
          ? `${behind.length} more ${behind.length === 1 ? "message" : "messages"}.`
          : ""}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.urgent ? "" : said.text}</span>
      </p>
      <p role="alert" aria-live="assertive" className="sr-only">
        <span key={said.n}>{said.urgent ? said.text : ""}</span>
      </p>
    </div>
  );
}
