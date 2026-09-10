"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReportReason = {
  id: string;
  /** The chip's word. Written without a full stop; the name adds one. */
  label: string;
  /** A whole sentence, shown once the chip is picked and spoken in its name. */
  hint?: string;
};

export type ReportedMessage = {
  author: string;
  /** Sent time, already formatted by the host. */
  time: string;
  text: string;
};

export type ReportSheetProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The message under report, quoted at the top. */
  message: ReportedMessage;
  /** The chips, in the order given. */
  reasons: ReportReason[];
  /** Controlled sheet state. */
  open?: boolean;
  /** Initial sheet state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the trigger, Cancel, Escape, and the lower after a send. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled reason id. */
  reason?: string;
  /** Initial reason id. @default "" */
  defaultReason?: string;
  /** Fires from a chip press or an arrow key. */
  onReasonChange?: (id: string) => void;
  /** Controlled note. */
  note?: string;
  /** Initial note. @default "" */
  defaultNote?: string;
  /** Fires from every keystroke in the note field. */
  onNoteChange?: (note: string) => void;
  /** Fires once from Send with the frozen report. */
  onSubmit?: (report: { reason: string; label: string; note: string }) => void;
  /** Fires from Cancel and from Escape. */
  onCancel?: () => void;
  /** Characters the note field accepts. @default 140 */
  noteMaxLength?: number;
  /** How long the stamp holds before the sheet lowers. @default 1100 */
  holdMs?: number;
  /** The trigger's word. @default "Report" */
  triggerLabel?: string;
  /** The sheet's heading. @default "Why are you reporting this?" */
  title?: string;
  /** The stamp's word. @default "Report sent" */
  sentLabel?: string;
  /** Names the sheet for assistive technology. */
  label: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/**
 * Watches a node and hands back a height that glides to whatever it measures.
 * Nothing is read during render, and the first measurement is written outright:
 * given a first target after a mount, motion would otherwise paint the sheet
 * open on the very first frame it exists.
 */
function useMeasuredHeight<T extends HTMLElement>(motionSafe: boolean) {
  const ref = React.useRef<T | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  const height = useMotionValue<number>(0);
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

  return [ref, height] as const;
}

/** One sentence per name, built in one string, so nothing is spliced. */
const chipName = (reason: ReportReason): string =>
  reason.hint ? `${reason.label}. ${reason.hint}` : `${reason.label}.`;

function CheckMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.75" />
    </svg>
  );
}

type ReasonChipProps = {
  reason: ReportReason;
  index: number;
  id: string;
  checked: boolean;
  roving: boolean;
  stagger: number;
  motionSafe: boolean;
  onPick: (id: string, takeNote: boolean) => void;
  onMove: (index: number) => void;
  count: number;
};

/** One chip of the radio group: arrives on `snap` in its turn, steps on the
 *  arrows without wrapping, and hands the note field focus when it is pressed
 *  rather than merely stepped onto. */
function ReasonChip({
  reason,
  index,
  id,
  checked,
  roving,
  stagger,
  motionSafe,
  onPick,
  onMove,
  count,
}: ReasonChipProps) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    if (key === "ArrowRight" || key === "ArrowDown") onMove(index + 1);
    else if (key === "ArrowLeft" || key === "ArrowUp") onMove(index - 1);
    else if (key === "Home") onMove(0);
    else if (key === "End") onMove(count - 1);
    else if (key === " ") onPick(reason.id, true);
    else return;
    event.preventDefault();
  };

  return (
    <motion.button
      type="button"
      role="radio"
      id={id}
      aria-checked={checked}
      aria-label={chipName(reason)}
      tabIndex={roving ? 0 : -1}
      initial={motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe ? { ...springs.snap, delay: index * stagger } : FADE
      }
      onClick={() => onPick(reason.id, true)}
      onKeyDown={onKeyDown}
      className={cn(
        "flex h-7 items-center rounded-full border px-2.5 text-[11px] font-medium transition-colors",
        checked
          ? "border-cobalt-bright/45 bg-cobalt-wash text-cobalt-bright"
          : "border-hairline-strong text-ink-2 hover:bg-accent hover:text-accent-foreground",
        focusRing,
      )}
    >
      {reason.label}
    </motion.button>
  );
}

type ReportFormProps = {
  titleId: string;
  title: string;
  reasons: ReportReason[];
  picked: string;
  chosen: ReportReason | undefined;
  chipId: (id: string) => string;
  noteId: string;
  noteValue: string;
  noteMaxLength: number;
  motionSafe: boolean;
  onPick: (id: string, takeNote: boolean) => void;
  onMove: (index: number) => void;
  onNote: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

/** The sheet's first face: a heading, the chips, the note that unfolds once a
 *  reason is picked, and a footer whose three boxes share one height. */
function ReportForm({
  titleId,
  title,
  reasons,
  picked,
  chosen,
  chipId,
  noteId,
  noteValue,
  noteMaxLength,
  motionSafe,
  onPick,
  onMove,
  onNote,
  onCancel,
  onSubmit,
}: ReportFormProps) {
  const stagger = cascade(reasons.length);

  return (
    <>
      <h3 id={titleId} className="px-0.5 text-xs font-semibold text-foreground">
        {title}
      </h3>

      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="flex flex-wrap gap-1.5"
      >
        {reasons.map((item, index) => (
          <ReasonChip
            key={item.id}
            reason={item}
            index={index}
            count={reasons.length}
            id={chipId(item.id)}
            checked={item.id === picked}
            roving={item.id === picked || (picked === "" && index === 0)}
            stagger={stagger}
            motionSafe={motionSafe}
            onPick={onPick}
            onMove={onMove}
          />
        ))}
      </div>

      {chosen && (
        <motion.div
          // The note unfolds inside the sheet's own measured height: one box
          // moving, never two chasing each other's observers.
          initial={
            motionSafe ? { opacity: 0, y: -distances.nudge } : { opacity: 0 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={motionSafe ? springs.glide : FADE}
          className="flex flex-col gap-1.5"
        >
          {chosen.hint && (
            <p className="px-0.5 text-[11px] leading-snug text-ink-3">
              {chosen.hint}
            </p>
          )}
          <textarea
            id={noteId}
            rows={2}
            value={noteValue}
            maxLength={noteMaxLength}
            onChange={(event) => onNote(event.target.value)}
            aria-label="Add a note for the room hosts"
            placeholder="Anything the hosts should know"
            className={cn(
              "w-full resize-none rounded-2 border border-input bg-surface-0 px-2.5 py-2 text-xs leading-snug text-foreground placeholder:text-ink-3",
              focusRing,
            )}
          />
        </motion.div>
      )}

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="min-w-0 flex-1 truncate font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {chosen
            ? `${noteMaxLength - noteValue.length} left`
            : "Pick a reason"}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 px-2.5 text-xs font-medium text-ink-2 transition-colors hover:bg-accent hover:text-accent-foreground",
            focusRing,
          )}
        >
          Cancel
        </button>
        <button
          type="button"
          aria-disabled={!chosen}
          aria-label={
            chosen
              ? "Send the report."
              : "Send the report. Pick a reason first."
          }
          onClick={onSubmit}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 px-3 text-xs font-semibold transition-colors",
            chosen
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
            focusRing,
          )}
        >
          Send
        </button>
      </div>
    </>
  );
}

/** The second face. A stamp lands: two bounces of `recoil` on the scale, the
 *  ink arriving on a tween because opacity has no physics. */
function SentStamp({
  word,
  motionSafe,
}: {
  word: string;
  motionSafe: boolean;
}) {
  return (
    <motion.p
      initial={motionSafe ? { scale: 1.12, opacity: 0 } : { opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={motionSafe ? { scale: springs.recoil, opacity: FADE } : FADE}
      className="flex items-center justify-center gap-1.5 rounded-2 border border-cobalt-bright/45 bg-cobalt-wash py-2.5 text-xs font-semibold tracking-[0.04em] text-cobalt-bright uppercase"
    >
      <CheckMark />
      {word}
    </motion.p>
  );
}

/**
 * Reporting a message is three decisions and one sheet. Pressing Report raises
 * a sheet in flow beneath the quoted message — a box whose height follows a
 * ResizeObserver on its own content and glides on `glide`, so the sheet grows
 * out of the component's box rather than floating over whatever the host wrote
 * below it. The reasons are chips in a radio group, each arriving from
 * `distances.step` on `snap` in a `cascade` stagger; picking one unfolds the
 * note field inside that same measured height and hands it focus, because the
 * second half of a report is the sentence nobody offered you a box for. Send
 * stamps: the form gives way to a mark that lands from 1.12× on `recoil` — the
 * two bounces of a stamp hitting paper, not a celebration — and after `holdMs`
 * the sheet lowers.
 *
 * The sheet is a non-modal dialog opened in flow, so nothing is trapped: focus
 * moves to the picked chip on open, Escape closes and returns focus to the
 * trigger, and Send moves focus back to the trigger the moment the report
 * leaves, so no key lands on a removed element. The chips carry a roving
 * tabindex where arrows step without wrapping and Home and End jump. Under
 * reduced motion the sheet's height swaps on a fast tween and the stamp fades
 * in place; the confirmation still shows, because it is information.
 */
export function ReportSheet({
  ref,
  message,
  reasons,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  reason: controlledReason,
  defaultReason = "",
  onReasonChange,
  note: controlledNote,
  defaultNote = "",
  onNoteChange,
  onSubmit,
  onCancel,
  noteMaxLength = 140,
  holdMs = 1100,
  triggerLabel = "Report",
  title = "Why are you reporting this?",
  sentLabel = "Report sent",
  label,
  className,
}: ReportSheetProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const noteId = `${baseId}-note`;
  const chipId = (id: string) => `${baseId}-chip-${id}`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? ownOpen;
  const [ownReason, setOwnReason] = React.useState(defaultReason);
  const picked = controlledReason ?? ownReason;
  const [ownNote, setOwnNote] = React.useState(defaultNote);
  const noteValue = controlledNote ?? ownNote;

  const [stage, setStage] = React.useState<"form" | "sent">("form");
  const [said, setSaid] = React.useState("");
  const [wantsNote, setWantsNote] = React.useState(0);

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [sheetRef, sheetHeight] = useMeasuredHeight<HTMLDivElement>(motionSafe);

  // Read by the lower, which runs from a timer and must not carry a stale
  // closure of what the form held when the stamp landed.
  const reasonRef = React.useRef(picked);
  const noteRef = React.useRef(noteValue);
  React.useEffect(() => {
    reasonRef.current = picked;
    noteRef.current = noteValue;
  });

  // A host that closes the sheet mid-stamp gets a fresh form next time it
  // rises; adjusting during render is cheaper than an effect that re-renders.
  const [lastOpen, setLastOpen] = React.useState(open);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (!open && stage !== "form") setStage("form");
  }

  const chosen = reasons.find((item) => item.id === picked);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setOwnOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const commitReason = (id: string) => {
    if (controlledReason === undefined) setOwnReason(id);
    onReasonChange?.(id);
  };

  const commitNote = (next: string) => {
    if (controlledNote === undefined) setOwnNote(next);
    onNoteChange?.(next);
  };

  // The lower after a stamp is the one timed thing here: it lives in an effect,
  // is torn down on unmount, and never runs while the tab is hidden — a
  // confirmation nobody is looking at should still be there on the way back.
  const finish = React.useCallback(() => {
    setStage("form");
    setOpen(false);
    // Cleared through the same callbacks a host listens to, and only when
    // there is something to clear: an empty note never reports a change.
    if (controlledReason === undefined) setOwnReason("");
    if (controlledNote === undefined) setOwnNote("");
    if (reasonRef.current !== "") onReasonChange?.("");
    if (noteRef.current !== "") onNoteChange?.("");
  }, [controlledNote, controlledReason, onNoteChange, onReasonChange, setOpen]);

  React.useEffect(() => {
    if (stage !== "sent") return;
    let timer = 0;
    const stop = () => {
      if (timer !== 0) window.clearTimeout(timer);
      timer = 0;
    };
    const sync = () => {
      if (document.hidden) stop();
      else if (timer === 0) timer = window.setTimeout(finish, holdMs);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [stage, holdMs, finish]);

  // Focus lands on the picked chip a frame after the sheet exists, and never
  // scrolls the clipped box while its height is still gliding. The latch keeps
  // the aim to the rise: picking another chip must not drag focus back.
  const aimed = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      aimed.current = false;
      return;
    }
    if (aimed.current) return;
    aimed.current = true;
    const first = reasons[0];
    const target = picked !== "" ? picked : (first?.id ?? "");
    if (target === "") return;
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`${baseId}-chip-${target}`)
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, picked, reasons, baseId]);

  React.useEffect(() => {
    if (wantsNote === 0) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(noteId)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [wantsNote, noteId]);

  const openSheet = () => {
    setOpen(true);
    setSaid("The report sheet is open.");
  };

  const closeSheet = (cancelled: boolean) => {
    setOpen(false);
    if (cancelled) onCancel?.();
    setSaid("The report sheet is closed. Nothing was sent.");
    requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true }),
    );
  };

  const pick = (id: string, takeNote: boolean) => {
    const reason = reasons.find((item) => item.id === id);
    if (!reason) return;
    if (id !== picked) {
      commitReason(id);
      setSaid(`Reason: ${reason.label.toLowerCase()}.`);
    }
    if (takeNote) setWantsNote((tick) => tick + 1);
  };

  const moveTo = (index: number) => {
    const clamped = Math.min(reasons.length - 1, Math.max(0, index));
    const reason = reasons[clamped];
    if (!reason) return;
    document.getElementById(chipId(reason.id))?.focus({ preventScroll: true });
    pick(reason.id, false);
  };

  const submit = () => {
    if (!chosen) {
      setSaid("Pick a reason before sending the report.");
      return;
    }
    // The sentence is frozen at the change, and focus leaves for the trigger
    // before the form unmounts, so no key ever lands on a removed control.
    setStage("sent");
    setSaid(`${sentLabel}.`);
    onSubmit?.({
      reason: chosen.id,
      label: chosen.label,
      note: noteValue.trim(),
    });
    requestAnimationFrame(() =>
      triggerRef.current?.focus({ preventScroll: true }),
    );
  };

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div className="rounded-3 border border-hairline bg-surface-1 p-2.5">
        <span className="sr-only">
          {`Reporting a message from ${message.author}, sent at ${message.time}.`}
        </span>
        <div aria-hidden className="flex items-center gap-1.5 px-0.5">
          <span className="truncate text-[11px] font-medium text-ink-2">
            {message.author}
          </span>
          <span className="text-[11px] text-ink-3 tabular-nums">
            {message.time}
          </span>
        </div>
        <p className="mt-1 rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2 text-sm leading-snug wrap-break-word text-foreground">
          {message.text}
        </p>

        <div className="mt-2 flex justify-end">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => (open ? closeSheet(false) : openSheet())}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink-2 transition-colors hover:bg-accent hover:text-accent-foreground",
              open && "bg-accent text-accent-foreground",
              focusRing,
            )}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 shrink-0"
            >
              <path d="M4 14V2.5h8l-1.6 2.75L12 8H4" />
            </svg>
            {triggerLabel}
          </button>
        </div>

        {/* The sheet rises inside the component's own box: a measured height,
            never a panel floating over the host's page. */}
        <motion.div style={{ height: sheetHeight }} className="overflow-hidden">
          <div ref={sheetRef} className={open ? "pt-2" : undefined}>
            {open && (
              <div
                role="dialog"
                aria-label={label}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  closeSheet(true);
                }}
                className="flex flex-col gap-2 rounded-2 border border-hairline-strong bg-card p-2.5"
              >
                {stage === "sent" ? (
                  <SentStamp word={sentLabel} motionSafe={motionSafe} />
                ) : (
                  <ReportForm
                    titleId={titleId}
                    title={title}
                    reasons={reasons}
                    picked={picked}
                    chosen={chosen}
                    chipId={chipId}
                    noteId={noteId}
                    noteValue={noteValue}
                    noteMaxLength={noteMaxLength}
                    motionSafe={motionSafe}
                    onPick={pick}
                    onMove={moveTo}
                    onNote={commitNote}
                    onCancel={() => closeSheet(true)}
                    onSubmit={submit}
                  />
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
