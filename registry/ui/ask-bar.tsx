"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { ArrowUp, FileText, Paperclip, Square, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type AskBarAttachment = { id: string; name: string; meta?: string };
export type AskBarSize = "sm" | "md" | "lg";

export type AskBarProps = {
  /** Controlled draft. */
  value?: string;
  /** Initial draft when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires with the draft as it is typed, and with "" when it is sent. */
  onValueChange?: (value: string) => void;
  /** A prompt was sent (Enter or the send button), with the attachments it carried. */
  onSubmit?: (prompt: string, attachments: AskBarAttachment[]) => void;
  /** The host is answering: the send button becomes a stop button and Enter waits. @default false */
  busy?: boolean;
  /** The stop button, or Escape while busy. */
  onStop?: () => void;
  /** The host's answer, shown under the asked prompt; its height glides as it grows. */
  answer?: React.ReactNode;
  /** Files riding with the next prompt, shown as chips above the text. @default [] */
  attachments?: AskBarAttachment[];
  /** Shows the attach button; the host adds what was attached. */
  onAttach?: () => void;
  /** A chip's remove button, or Backspace in an empty field. */
  onRemoveAttachment?: (id: string) => void;
  /** Placeholder lines, rolled through while the field is empty. @default ["Ask anything"] */
  placeholders?: string[];
  /** Seconds between placeholder lines; 0 holds the first. @default 3 */
  cycle?: number;
  /** How many lines the field grows to before it scrolls. @default 5 */
  rows?: number;
  /** How high the prompt rises off the page as it flies to its bubble, in px. @default 12 */
  lift?: number;
  /** The field's accessible name. @default "Ask" */
  label?: string;
  /** Type and control size. @default "md" */
  size?: AskBarSize;
  /** A click on send and stop, a whoosh as the prompt lifts. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Turn = { id: number; text: string };
type Flight = { id: number; text: string; x: number; y: number; w: number };

const SIZES: Record<
  AskBarSize,
  { text: string; line: number; pad: number; button: string; px: number }
> = {
  sm: { text: "text-[13px]", line: 20, pad: 6, button: "size-7", px: 28 },
  md: { text: "text-sm", line: 20, pad: 6, button: "size-8", px: 32 },
  lg: { text: "text-base", line: 24, pad: 6, button: "size-9", px: 36 },
};
/** The bubble's padding, which the flying copy wears from the start. */
const BUBBLE_X = 12;
const BUBBLE_Y = 8;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * A compact prompt input that becomes the turn it starts. Typing grows the
 * field on the glide spring (a hidden mirror in the field's own type is
 * measured), up to `rows` lines. While it is empty the placeholder rolls
 * through `placeholders`, the old line rising out as the next rises in on
 * the snap spring. Attachments drop in above the text as chips with a small
 * bounce on the recoil spring. While the host is `busy` the round arrow
 * morphs into a rounded stop square with a thin arc orbiting it.
 *
 * Sending lifts the prompt out of the field: a copy set exactly over the
 * text rises to its bubble above on the snap spring, its ink turning to the
 * bubble's and its plate fading in, lifted `lift` px off the page as it
 * travels, while the field collapses to one line beneath it; when it lands
 * the bubble takes over. The host's `answer` grows in under it.
 *
 * The field is a real textarea: Enter sends, Shift+Enter breaks the line,
 * Escape stops while busy, and Backspace in an empty field drops the last
 * chip. Under reduced motion nothing travels: heights change at once, the
 * placeholder crossfades and the prompt fades into its bubble.
 */
export function AskBar({
  value,
  defaultValue = "",
  onValueChange,
  onSubmit,
  busy = false,
  onStop,
  answer,
  attachments = [],
  onAttach,
  onRemoveAttachment,
  placeholders = ["Ask anything"],
  cycle = 3,
  rows = 5,
  lift = 12,
  label = "Ask",
  size = "md",
  sound = false,
  disabled = false,
  className,
}: AskBarProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const s = SIZES[size] ?? SIZES.md;
  const maxRows = Math.max(1, Math.round(rows));
  const rise = Math.max(0, lift);
  const lines = placeholders.length > 0 ? placeholders : ["Ask anything"];

  const [own, setOwn] = React.useState(defaultValue);
  const draft = value ?? own;
  const [turn, setTurn] = React.useState<Turn | null>(null);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [landed, setLanded] = React.useState(-1);
  const [line, setLine] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);
  // An answer present from the first render shows at its own height until
  // it has been measured, so the server's frame is not a closed box.
  const [openAtMount] = React.useState(() => answer != null);
  const [turnMeasured, setTurnMeasured] = React.useState(false);

  const minH = s.line + s.pad * 2;
  const maxH = s.line * maxRows + s.pad * 2;
  const fieldH = useMotionValue(minH);
  const turnH = useMotionValue(0);
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fw = useMotionValue(0);
  const plate = useMotionValue(0);
  const height = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  const visible = React.useRef(true);
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const counter = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };

  const setDraft = (next: string) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const sendable = draft.trim().length > 0 || attachments.length > 0;

  const submit = () => {
    if (disabled || busy || !sendable) return;
    const typed = draft.trim();
    // Files alone still make a turn: the bubble names them.
    const text = typed || attachments.map((a) => a.name).join(", ");
    const area = areaRef.current;
    const root = rootRef.current;
    counter.current += 1;
    const id = counter.current;
    if (motionSafe && area && root && typed) {
      // Where the text sits now, so the flying copy starts exactly over it.
      const a = root.getBoundingClientRect();
      const b = area.getBoundingClientRect();
      const cs = getComputedStyle(area);
      setFlight({
        id,
        text,
        x: r2(b.left - a.left + parseFloat(cs.paddingLeft) - BUBBLE_X),
        y: r2(
          b.top - a.top + parseFloat(cs.paddingTop) - area.scrollTop - BUBBLE_Y,
        ),
        w: r2(
          b.width -
            parseFloat(cs.paddingLeft) -
            parseFloat(cs.paddingRight) +
            BUBBLE_X * 2,
        ),
      });
      audio.play("whoosh", { pitch: r2(1.1 - rise * 0.012), gain: 0.4 });
    } else {
      setLanded(id);
    }
    audio.play("click", { pitch: 1.2, gain: 0.5 });
    setTurn({ id, text });
    onSubmit?.(typed, attachments);
    setDraft("");
  };

  // The flight: from the field's text to the bubble's place, measured once
  // the bubble has been laid out (invisible) where it will stay.
  React.useLayoutEffect(() => {
    const f = flight;
    const root = rootRef.current;
    const bubble = bubbleRef.current;
    if (!f || !root || !bubble) return;
    const a = root.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const toX = r2(b.left - a.left);
    const toY = r2(b.top - a.top);
    fx.jump(f.x);
    fy.jump(f.y);
    fw.jump(f.w);
    plate.jump(0);
    height.jump(0);
    // It lands — and the bubble takes over — only once every part of the
    // flight is home, so the hand-off has no seam.
    let pending = 4;
    const home = () => {
      pending -= 1;
      if (pending > 0) return;
      setLanded(f.id);
      setFlight((now) => (now && now.id === f.id ? null : now));
    };
    run("fx", animate(fx, toX, { ...springs.glide, onComplete: home }));
    run("fw", animate(fw, r2(b.width), { ...springs.glide, onComplete: home }));
    run(
      "plate",
      animate(plate, 1, { duration: durations.slow, ease: easings.enter }),
    );
    // Up off the page and back down as it lands.
    run(
      "height",
      animate(height, [0, 1, 0], {
        duration: 0.5,
        times: [0, 0.4, 1],
        ease: [easings.enter, easings.move],
        onComplete: home,
      }),
    );
    run("fy", animate(fy, toY, { ...springs.snap, onComplete: home }));
    // One flight per send, measured once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.id]);

  // The field's height follows a hidden mirror of the draft.
  const bindMirror = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const natural = node.offsetHeight;
        const next = Math.min(maxH, Math.max(minH, natural));
        setOverflowing(natural > maxH + 0.5);
        if (Math.abs(next - fieldH.get()) < 0.5) return;
        if (node.dataset.reduced === "true") {
          running.current.get("fieldH")?.stop();
          fieldH.jump(next);
        } else {
          run("fieldH", animate(fieldH, next, springs.glide));
        }
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    // Rebound when the bounds change, so the observer reads them fresh.
    [minH, maxH, fieldH],
  );

  const bindTurn = React.useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const sizer = new ResizeObserver(() => {
        const next = node.offsetHeight;
        setTurnMeasured(true);
        if (node.dataset.reduced === "true" || node.dataset.open === "true") {
          node.dataset.open = "false";
          running.current.get("turnH")?.stop();
          turnH.jump(next);
          return;
        }
        run("turnH", animate(turnH, next, springs.glide));
      });
      sizer.observe(node);
      return () => sizer.disconnect();
    },
    [turnH],
  );

  // The bubble that is landing; an exiting one never clears it.
  const bindBubble = React.useCallback((node: HTMLDivElement | null) => {
    if (node) bubbleRef.current = node;
  }, []);

  // The placeholder rolls only when someone could be reading it.
  const rolling =
    cycle > 0 && lines.length > 1 && draft.length === 0 && !focused;
  React.useEffect(() => {
    if (!rolling) return;
    const ms = Math.max(500, cycle * 1000);
    const timer = window.setInterval(() => {
      if (!visible.current || document.hidden) return;
      setLine((n) => (n + 1) % lines.length);
    }, ms);
    return () => window.clearInterval(timer);
  }, [rolling, cycle, lines.length]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const watcher = new IntersectionObserver((entries) => {
      visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
    });
    watcher.observe(root);
    return () => watcher.disconnect();
  }, []);

  React.useEffect(() => {
    const anims = running.current;
    return () => {
      for (const c of anims.values()) c.stop();
      anims.clear();
    };
  }, []);

  const shadow = useTransform(height, (k) => {
    const e = Math.max(0, k) * rise;
    return e < 0.05
      ? "none"
      : `0 ${r2(e * 0.6)}px ${r2(e * 1.1)}px color-mix(in oklab, black 18%, transparent)`;
  });
  const flyScale = useTransform(height, (k) =>
    r3(1 + Math.max(0, k) * rise * 0.0025),
  );
  const flyBg = useTransform(
    plate,
    (p) =>
      `color-mix(in oklab, var(--primary) ${Math.round(p * 100)}%, transparent)`,
  );
  const flyInk = useTransform(
    plate,
    (p) =>
      `color-mix(in oklab, var(--primary-foreground) ${Math.round(p * 100)}%, var(--foreground))`,
  );

  const placeholder = lines[line % lines.length] ?? "";
  const reducedFlag = motionSafe ? "false" : "true";
  const textClass = cn("whitespace-pre-wrap break-words", s.text);
  const button = cn(
    "relative grid shrink-0 place-items-center outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    s.button,
  );

  return (
    <div
      ref={rootRef}
      className={cn("relative flex w-full flex-col", className)}
    >
      <span id={hintId} className="sr-only">
        Enter sends, Shift+Enter adds a line.
      </span>

      {turn || answer ? (
        <motion.div
          className="overflow-hidden"
          style={{ height: openAtMount && !turnMeasured ? "auto" : turnH }}
        >
          <div
            ref={bindTurn}
            data-reduced={reducedFlag}
            data-open={openAtMount && !turnMeasured ? "true" : undefined}
            className="flex flex-col gap-2 pb-3"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {turn ? (
                <motion.div
                  key={turn.id}
                  className="flex justify-end"
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                >
                  <motion.div
                    ref={bindBubble}
                    className={cn(
                      "max-w-[85%] rounded-3 rounded-br-1 bg-primary text-primary-foreground",
                      textClass,
                    )}
                    style={{ padding: `${BUBBLE_Y}px ${BUBBLE_X}px` }}
                    initial={motionSafe ? false : { opacity: 0 }}
                    animate={{ opacity: landed === turn.id ? 1 : 0 }}
                    transition={{
                      duration: motionSafe ? 0 : durations.base,
                      ease: easings.enter,
                    }}
                  >
                    {turn.text}
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {answer != null ? (
              <div
                aria-live="polite"
                aria-busy={busy}
                className={cn("text-ink-2", s.text)}
              >
                {answer}
              </div>
            ) : null}
          </div>
        </motion.div>
      ) : null}

      <div
        className={cn(
          "flex flex-col rounded-4 border border-input bg-card p-2 transition-colors",
          "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
          disabled && "opacity-50",
        )}
      >
        <AnimatePresence initial={false}>
          {attachments.length > 0 ? (
            <motion.ul
              key="chips"
              role="list"
              aria-label="Attachments"
              className="flex flex-wrap gap-1.5 px-1 pb-2"
              initial={motionSafe ? { opacity: 0, height: 0 } : { opacity: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{
                opacity: 0,
                height: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            >
              <AnimatePresence initial={false}>
                {attachments.map((file) => (
                  <motion.li
                    key={file.id}
                    layout={motionSafe ? "position" : false}
                    className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-2 border border-hairline bg-surface-2 pr-1 pl-2 text-xs text-foreground"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: -distances.step, scale: 0.92 }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 0.9,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe ? springs.recoil : { duration: durations.fast }
                    }
                  >
                    <FileText
                      aria-hidden
                      className="size-3.5 shrink-0 text-ink-3"
                    />
                    <span className="truncate" title={file.name}>
                      {file.name}
                    </span>
                    {file.meta ? (
                      <span className="shrink-0 font-mono text-[10px] text-ink-3">
                        {file.meta}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      disabled={disabled}
                      onClick={() => onRemoveAttachment?.(file.id)}
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-1 text-ink-3 outline-none hover:bg-surface-1 hover:text-foreground",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
                      )}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          ) : null}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          {onAttach ? (
            <button
              type="button"
              aria-label="Attach a file"
              disabled={disabled}
              onClick={onAttach}
              className={cn(
                button,
                "rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
              )}
            >
              <Paperclip aria-hidden className="size-4" />
            </button>
          ) : null}

          <div className="relative min-w-0 flex-1">
            {/* The mirror: the draft in the field's own type, measured. */}
            <div
              ref={bindMirror}
              aria-hidden
              data-reduced={reducedFlag}
              className={cn(
                "pointer-events-none invisible absolute inset-x-0 top-0",
                textClass,
              )}
              style={{ padding: `${s.pad}px 4px`, lineHeight: `${s.line}px` }}
            >
              {draft}
              {"​"}
            </div>
            {draft.length === 0 ? (
              <div
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 overflow-hidden text-ink-3",
                  s.text,
                )}
                style={{ padding: `${s.pad}px 4px`, lineHeight: `${s.line}px` }}
              >
                <AnimatePresence initial={false}>
                  <motion.span
                    key={line}
                    className="absolute inset-x-1 truncate"
                    style={{ top: s.pad }}
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.step }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      motionSafe
                        ? {
                            opacity: 0,
                            y: -distances.nudge,
                            transition: exitFor(durations.base),
                          }
                        : {
                            opacity: 0,
                            transition: { duration: durations.fast },
                          }
                    }
                    transition={
                      motionSafe
                        ? {
                            y: springs.snap,
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }
                        : { duration: durations.base }
                    }
                  >
                    {placeholder}
                  </motion.span>
                </AnimatePresence>
              </div>
            ) : null}
            <motion.textarea
              ref={areaRef}
              rows={1}
              value={draft}
              disabled={disabled}
              aria-label={label}
              aria-describedby={hintId}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setDraft(next);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit();
                  return;
                }
                if (event.key === "Escape" && busy) {
                  event.preventDefault();
                  onStop?.();
                  return;
                }
                if (
                  event.key === "Backspace" &&
                  draft.length === 0 &&
                  attachments.length > 0
                ) {
                  const last = attachments[attachments.length - 1];
                  if (last) {
                    event.preventDefault();
                    onRemoveAttachment?.(last.id);
                  }
                }
              }}
              className={cn(
                "block w-full resize-none bg-transparent text-foreground outline-none disabled:cursor-not-allowed",
                overflowing ? "overflow-y-auto" : "overflow-y-hidden",
                s.text,
              )}
              style={{
                height: fieldH,
                padding: `${s.pad}px 4px`,
                lineHeight: `${s.line}px`,
              }}
            />
          </div>

          <span className="relative shrink-0">
            {busy ? (
              <svg
                aria-hidden
                viewBox="0 0 40 40"
                className={cn(
                  "pointer-events-none absolute -inset-1 size-[calc(100%+8px)] text-cobalt-bright",
                  motionSafe && "animate-spin [animation-duration:1.2s]",
                )}
              >
                <circle
                  cx={20}
                  cy={20}
                  r={18.5}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeDasharray="26 90"
                />
              </svg>
            ) : null}
            <motion.button
              type="button"
              aria-label={busy ? "Stop" : "Send"}
              aria-disabled={disabled || (!busy && !sendable) || undefined}
              onClick={() => {
                if (disabled) return;
                if (busy) {
                  audio.play("click", { pitch: 0.9, gain: 0.5 });
                  onStop?.();
                  return;
                }
                submit();
              }}
              className={cn(
                button,
                "transition-colors",
                busy || sendable
                  ? "bg-primary text-primary-foreground hover:brightness-110"
                  : "cursor-default bg-surface-2 text-ink-3",
              )}
              initial={false}
              animate={{ borderRadius: busy ? 7 : s.px / 2 }}
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              <motion.span
                aria-hidden
                className="col-start-1 row-start-1 grid place-items-center"
                initial={false}
                animate={{ opacity: busy ? 0 : 1, scale: busy ? 0.6 : 1 }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
              >
                <ArrowUp className="size-4" />
              </motion.span>
              <motion.span
                aria-hidden
                className="col-start-1 row-start-1 grid place-items-center"
                initial={false}
                animate={{ opacity: busy ? 1 : 0, scale: busy ? 1 : 0.6 }}
                transition={
                  motionSafe ? springs.snap : { duration: durations.fast }
                }
              >
                <Square className="size-3 fill-current" />
              </motion.span>
            </motion.button>
          </span>
        </div>
      </div>

      {flight ? (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-10 rounded-3 rounded-br-1",
            textClass,
          )}
          style={{
            x: fx,
            y: fy,
            width: fw,
            scale: flyScale,
            originX: 1,
            originY: 1,
            padding: `${BUBBLE_Y}px ${BUBBLE_X}px`,
            backgroundColor: flyBg,
            color: flyInk,
            boxShadow: shadow,
          }}
        >
          {flight.text}
        </motion.div>
      ) : null}
    </div>
  );
}
