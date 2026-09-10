"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SendStatus = "idle" | "sending" | "sent" | "failed";

export type SendSwooshProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled composer text. */
  value?: string;
  /** Initial composer text for uncontrolled usage. */
  defaultValue?: string;
  /** Fires from every edit, the clear on send and the return on failure. */
  onValueChange?: (text: string) => void;
  /** The parent's report on the last send. @default "idle" */
  status?: SendStatus;
  /** Fires from Enter or the Send button with the trimmed text. */
  onSend?: (text: string) => void;
  /** @default "Message" */
  placeholder?: string;
  /** Names the composer for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
/** The wipe is a clip, so it is a tween: fast out, and back at the enter ease. */
const WIPE_OUT = { duration: durations.base, ease: easings.exit } as const;
const WIPE_IN = { duration: durations.base, ease: easings.enter } as const;
const SHOWN = "inset(0% 0% 0% 0%)";
const WIPED = "inset(0% 0% 0% 100%)";

type Ghost = { key: string; text: string; direction: "out" | "in" } | null;

/** Keeps callbacks out of effect dependencies so a re-render never replays a return. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The send, felt. Pressing Send fires the arrow forward — 14px to the right
 * and gone on the exit ease — and a fresh one returns from 10px behind on
 * `snap`, one crisp overshoot into place, the physics of a switch landing. In
 * the same moment the composer clears with a wipe: the text stays painted on a
 * ghost layer while a clip inset sweeps it away left to right, and the real
 * textarea, already empty underneath, is what remains. `status="sending"` holds
 * the button dimmed with a ring; `"failed"` returns the text — the ghost wipes
 * back in from the right, the field takes the words back with the caret at the
 * end, and the button turns danger with a "Not sent" line until the next edit.
 *
 * The composer is a real textarea: Enter sends, Shift+Enter breaks the line;
 * Send is a button, disabled by aria while the text is empty or a send is in
 * flight, and described by the failure line when there is one. A status region
 * announces the send and the return once each. Under reduced motion the arrow
 * dims and returns by opacity, the wipe is a fade, and nothing travels.
 */
export function SendSwoosh({
  ref,
  value,
  defaultValue,
  onValueChange,
  status = "idle",
  onSend,
  placeholder = "Message",
  label,
  className,
}: SendSwooshProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;
  const failId = `${baseId}-fail`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const text = value ?? uncontrolled;
  const [held, setHeld] = React.useState("");
  const [ghost, setGhost] = React.useState<Ghost>(null);
  const [swooshTick, setSwooshTick] = React.useState(0);
  const [returnTick, setReturnTick] = React.useState(0);
  const [failureSeen, setFailureSeen] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const arrowRef = React.useRef<HTMLSpanElement | null>(null);
  const caretRef = React.useRef(false);
  const handledReturn = React.useRef(0);
  const latest = useLatest({ onValueChange });

  const setRootNode = (node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  // The parent's verdict arrives as a prop, so the return is derived during
  // render: the failed send's words come back the moment the status says so,
  // and the sentence belongs to that render rather than a later one.
  const [seenStatus, setSeenStatus] = React.useState(status);
  if (seenStatus !== status) {
    setSeenStatus(status);
    if (status === "sent") setAnnounce("Sent");
    if (status === "failed" && held.length > 0) {
      const tick = returnTick + 1;
      setReturnTick(tick);
      setGhost({ key: `in-${tick}`, text: held, direction: "in" });
      if (value === undefined) setUncontrolled(held);
      setFailureSeen(false);
      setAnnounce("Not sent, text returned to the composer");
    }
  }

  // A controlled parent hears the return here, once per failure; focus goes
  // back to the field only when it was already inside the composer.
  React.useEffect(() => {
    if (returnTick === 0 || handledReturn.current === returnTick) return;
    handledReturn.current = returnTick;
    latest.current.onValueChange?.(held);
    const root = rootRef.current;
    const field = fieldRef.current;
    if (field && root?.contains(document.activeElement)) {
      caretRef.current = true;
      field.focus();
    }
  }, [returnTick, held, latest]);

  React.useEffect(() => {
    const field = fieldRef.current;
    if (!caretRef.current || !field || document.activeElement !== field) return;
    caretRef.current = false;
    field.setSelectionRange(field.value.length, field.value.length);
  }, [text]);

  // The arrow's flight is two moves chained — away on the exit ease, back on
  // snap — so it runs imperatively; a spring takes two keyframes, not four.
  React.useEffect(() => {
    if (swooshTick === 0) return;
    const node = arrowRef.current;
    if (!node) return;
    if (!motionSafe) {
      // `x: 0` also lands an arrow the preference changed mid-flight.
      const dim = animate(node, { x: 0, opacity: [0.3, 1] }, WIPE_IN);
      return () => dim.complete();
    }
    let back: AnimationPlaybackControls | null = null;
    let cancelled = false;
    const away = animate(
      node,
      { x: [0, 14], opacity: [1, 0] },
      exitFor(durations.fast),
    );
    away.then(() => {
      // Cleanup completes the outward leg, which resolves this promise: without
      // the flag a second send would start its return on the arrow the newer
      // flight already owns, and the two would fight over one node.
      if (cancelled) return;
      back = animate(node, { x: [-10, 0], opacity: [0, 1] }, springs.snap);
    });
    return () => {
      cancelled = true;
      away.complete();
      back?.complete();
    };
  }, [swooshTick, motionSafe]);

  const commit = (next: string) => {
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const sending = status === "sending";
  const failed = status === "failed" && !failureSeen;
  const canSend = text.trim().length > 0 && !sending;

  const send = () => {
    if (!canSend) return;
    const tick = swooshTick + 1;
    setHeld(text);
    setGhost({ key: `out-${tick}`, text, direction: "out" });
    setSwooshTick(tick);
    setFailureSeen(true);
    // The press has not sent anything yet: the parent answers with a status.
    // Saying "Sent" here told a reader the message had landed a moment before
    // telling them it had not.
    setAnnounce("Sending");
    commit("");
    onSend?.(text.trim());
  };

  return (
    <div
      ref={setRootNode}
      className={cn("flex w-full flex-col gap-2", className)}
    >
      <div
        className={cn(
          "flex flex-col rounded-3 border bg-surface-0 transition-colors focus-within:border-hairline-strong",
          failed ? "border-danger" : "border-input",
        )}
      >
        <div className="relative overflow-hidden">
          <textarea
            ref={fieldRef}
            value={text}
            rows={2}
            placeholder={placeholder}
            aria-label={label}
            aria-describedby={failed ? `${hintId} ${failId}` : hintId}
            onChange={(event) => {
              setFailureSeen(true);
              commit(event.target.value);
            }}
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
            className={cn(
              "block w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 outline-none",
              ghost
                ? "text-transparent caret-foreground placeholder:text-transparent"
                : "text-foreground placeholder:text-ink-3",
            )}
          />
          {/* The ghost carries the words while the field is already empty (out)
              or already refilled (in); the textarea goes transparent under it
              and takes over on settle, so the text never paints twice. */}
          {ghost ? (
            <motion.div
              key={ghost.key}
              aria-hidden
              initial={
                motionSafe
                  ? { clipPath: ghost.direction === "out" ? SHOWN : WIPED }
                  : { opacity: ghost.direction === "out" ? 1 : 0 }
              }
              animate={
                motionSafe
                  ? { clipPath: ghost.direction === "out" ? WIPED : SHOWN }
                  : { opacity: ghost.direction === "out" ? 0 : 1 }
              }
              transition={
                motionSafe
                  ? ghost.direction === "out"
                    ? WIPE_OUT
                    : WIPE_IN
                  : FADE
              }
              onAnimationComplete={() => setGhost(null)}
              className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2 text-sm leading-5 wrap-break-word whitespace-pre-wrap text-foreground"
            >
              {ghost.text}
            </motion.div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-hairline py-1.5 pr-1.5 pl-3">
          {/* Both lines stack in one grid cell and cross-fade, so the footer
              never changes height between them. Each is short enough to sit
              whole beside the button at the 342px column; the full keyboard
              sentence is the textarea's description instead. */}
          <span className="grid min-w-0 flex-1">
            <span
              aria-hidden
              className={cn(
                "col-start-1 row-start-1 truncate font-mono text-[11px] text-ink-3 transition-opacity",
                failed && "opacity-0",
              )}
            >
              Enter sends · Shift+Enter breaks
            </span>
            <AnimatePresence initial={false}>
              {failed ? (
                <motion.span
                  key="fail"
                  id={failId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={FADE}
                  className="col-start-1 row-start-1 truncate text-xs font-medium text-danger"
                >
                  Not sent · text returned
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>

          <button
            type="button"
            onClick={send}
            aria-disabled={canSend ? undefined : true}
            aria-describedby={failed ? failId : undefined}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-2 pr-2.5 pl-3 text-xs font-medium transition-[background-color,opacity,color] outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              failed
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90",
              !canSend && "opacity-60",
            )}
          >
            <span>{sending ? "Sending" : failed ? "Send again" : "Send"}</span>
            <span className="relative grid size-4 shrink-0 place-items-center overflow-visible">
              <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: sending ? 0 : 1 }}
                transition={FADE}
                className="col-start-1 row-start-1 grid place-items-center"
              >
                <span ref={arrowRef} className="grid place-items-center">
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4"
                  >
                    <path d="M2.5 8h10.5M9 4l4 4-4 4" />
                  </svg>
                </span>
              </motion.span>
              {/* The ring is the hold: it fades in over the arrow while the
                  parent has the message, and off again with its verdict. */}
              <motion.svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                initial={false}
                animate={{ opacity: sending ? 1 : 0 }}
                transition={FADE}
                className="pointer-events-none col-start-1 row-start-1 size-4"
              >
                <circle cx="8" cy="8" r="5.5" strokeOpacity="0.35" />
                <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" />
              </motion.svg>
            </span>
          </button>
        </div>
      </div>

      <span id={hintId} className="sr-only">
        Enter sends, Shift+Enter breaks the line
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
