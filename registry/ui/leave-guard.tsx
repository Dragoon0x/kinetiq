"use client";

import * as React from "react";

import { animate, AnimatePresence, motion } from "motion/react";
import { PenLine, RotateCcw, TriangleAlert } from "lucide-react";

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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type LeaveGuardValue = string | number | boolean | null;

export type LeaveGuardChange = {
  id: string;
  /** The field's name as the page shows it. */
  label: string;
  /** Where the field lives, shown small beside the label. */
  section?: string;
  /** The saved value. */
  from: LeaveGuardValue;
  /** The value being left behind. */
  to: LeaveGuardValue;
};

export type LeaveGuardDiffStyle = "inline" | "stacked" | "split";
export type LeaveGuardDensity = "compact" | "cozy" | "roomy";
export type LeaveGuardTone = "calm" | "caution" | "stern";

/** A save that fails can name the fields it refused. */
export type LeaveGuardSaveError = Error & { fields?: Record<string, string> };

export type LeaveGuardLabels = {
  save?: string;
  discard?: string;
  cancel?: string;
};

export type LeaveGuardProps = {
  /** Every edited field with its saved and new value. @default defaultLeaveGuardChanges */
  changes?: LeaveGuardChange[];
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires when the guard opens or closes, from whichever action did it. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Save was pressed. Call `report(id)` as each field lands to fill the
   * progress; return a promise to hold the dialog until it resolves. A
   * rejection keeps the dialog open with its message (and `fields` messages
   * under their rows).
   */
  onSave?: (
    changes: LeaveGuardChange[],
    report: (id: string) => void,
  ) => void | Promise<void>;
  /** Discard finished unwinding: every change was let go. */
  onDiscard?: (changes: LeaveGuardChange[]) => void;
  /** One row let go during Discard's unwind, so the page can revert in step. */
  onRevert?: (change: LeaveGuardChange) => void;
  /** Keep editing or Escape: the guard closed and focus went back to the page. */
  onCancel?: () => void;
  /** The guarded page. It goes inert behind the scrim while the guard is open. */
  children?: React.ReactNode;
  /** The heading, or a function of the change count. @default "You changed four things" */
  title?: string | ((count: number) => string);
  /** The line under the heading. @default "Keep them or let go." */
  description?: string;
  /** The three actions' words. @default Save changes · Discard · Keep editing */
  labels?: LeaveGuardLabels;
  /** How a value is written in the diff. @default On/Off, "empty", String() */
  formatValue?: (value: LeaveGuardValue, change: LeaveGuardChange) => string;
  /** The diff: old struck → new on one line, a − and a + line, or Before and After columns. @default "inline" */
  diffStyle?: LeaveGuardDiffStyle;
  /** Row padding and type size. @default "cozy" */
  density?: LeaveGuardDensity;
  /** The badge, the new values' ink and Discard's weight: cobalt, amber or brick. @default "caution" */
  tone?: LeaveGuardTone;
  /** Save and Discard are unavailable; Keep editing still works. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Four edits to a Gaugeworks pump station's settings. */
export const defaultLeaveGuardChanges: LeaveGuardChange[] = [
  {
    id: "name",
    label: "Station name",
    section: "General",
    from: "Pump station 4",
    to: "Riverside PS4",
  },
  {
    id: "threshold",
    label: "Alarm threshold",
    section: "Alarms",
    from: "3.8 bar",
    to: "4.2 bar",
  },
  {
    id: "night",
    label: "Night mode",
    section: "Alarms",
    from: false,
    to: true,
  },
  {
    id: "crew",
    label: "Crew on call",
    section: "Rota",
    from: "Ana Ferreira",
    to: "Tomasz Wren",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

export const leaveGuardTitle = (count: number) =>
  `You changed ${count <= 12 ? WORDS[count] : String(count)} ${
    count === 1 ? "thing" : "things"
  }`;

const defaultFormat = (value: LeaveGuardValue): string => {
  if (value === true) return "On";
  if (value === false) return "Off";
  if (value === null || value === "") return "empty";
  return String(value);
};

const TONE: Record<LeaveGuardTone, string> = {
  calm: "var(--accent-bright)",
  caution: "var(--warn)",
  stern: "var(--danger)",
};

const DENSITY: Record<
  LeaveGuardDensity,
  { row: string; text: string; pad: string; gap: string }
> = {
  compact: {
    row: "py-1.5",
    text: "text-[12px] leading-4",
    pad: "px-3",
    gap: "gap-2",
  },
  cozy: {
    row: "py-2",
    text: "text-[13px] leading-5",
    pad: "px-4",
    gap: "gap-3",
  },
  roomy: {
    row: "py-3",
    text: "text-[14px] leading-5",
    pad: "px-5",
    gap: "gap-3",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const EDITABLE =
  'input, textarea, select, [contenteditable="true"], [role="switch"], [role="slider"], [role="combobox"], [role="spinbutton"]';

type Phase = "idle" | "saving" | "saved" | "failed" | "discarding";

/* ----------------------------------------------------------------------- */
/*                                  A row                                   */
/* ----------------------------------------------------------------------- */

/** A check drawn on flick: the stroke sweeps in rather than popping. */
function Tick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 text-success">
      <motion.path
        d="M3.5 8.5l3 3 6-7"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

function DiffRow({
  change,
  index,
  stagger,
  diffStyle,
  density,
  format,
  reverted,
  saved,
  error,
  motionSafe,
  uid,
}: {
  change: LeaveGuardChange;
  index: number;
  stagger: number;
  diffStyle: LeaveGuardDiffStyle;
  density: (typeof DENSITY)[LeaveGuardDensity];
  format: (value: LeaveGuardValue, change: LeaveGuardChange) => string;
  reverted: boolean;
  saved: boolean;
  error?: string;
  motionSafe: boolean;
  uid: string;
}) {
  const oldRef = React.useRef<HTMLSpanElement | null>(null);
  const newRef = React.useRef<HTMLSpanElement | null>(null);
  const from = format(change.from, change);
  const to = format(change.to, change);

  // The unwind: the new value travels back onto the old one — by its
  // measured offset, on glide — and fades into it as it arrives.
  React.useEffect(() => {
    const a = oldRef.current;
    const b = newRef.current;
    if (!a || !b) return;
    if (!reverted) {
      b.style.transform = "";
      b.style.opacity = "";
      return;
    }
    if (!motionSafe) {
      // A plain cross-fade, through the platform's own animations: nothing
      // travels, and no motion config is consulted for a value that is
      // only fading.
      const fade = b.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: durations.fast * 1000,
        fill: "forwards",
      });
      return () => fade.cancel();
    }
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    const dx = Math.round(ar.left - br.left);
    const dy = Math.round(ar.top - br.top);
    const slide = animate(b, { x: dx, y: dy }, springs.glide);
    const fade = animate(
      b,
      { opacity: 0 },
      { duration: durations.base, ease: easings.exit, delay: 0.12 },
    );
    return () => {
      slide.stop();
      fade.stop();
    };
  }, [reverted, motionSafe]);

  const oldValue = (
    <span
      ref={oldRef}
      className={cn(
        "relative inline-block max-w-full truncate align-top transition-colors duration-300",
        reverted ? "text-foreground" : "text-ink-3",
      )}
      title={from}
    >
      {from}
      {/* The strike retracts on glide as the edit lets go. */}
      <motion.span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-px bg-current"
        initial={false}
        animate={{ scaleX: reverted ? 0 : 1 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        style={{ originX: 0 }}
      />
    </span>
  );
  const newValue = (
    <span
      ref={newRef}
      className="relative inline-block max-w-full truncate align-top font-medium [color:var(--lg-tone)]"
      title={to}
    >
      {to}
    </span>
  );

  const marker = (
    <span
      aria-hidden
      className="mt-0.5 flex size-4 shrink-0 items-center justify-center"
    >
      {error ? (
        <TriangleAlert className="size-3.5 text-danger" />
      ) : saved ? (
        <Tick motionSafe={motionSafe} />
      ) : reverted ? (
        <motion.span
          className="inline-flex text-ink-3"
          initial={{ rotate: motionSafe ? 90 : 0, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={
            motionSafe
              ? { rotate: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          <RotateCcw className="size-3.5" />
        </motion.span>
      ) : (
        <span className="size-1.5 rounded-full bg-[var(--lg-tone)]" />
      )}
    </span>
  );

  return (
    <motion.li
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              opacity: { duration: durations.base },
              delay: index * stagger,
            }
          : { duration: durations.fast }
      }
      className={cn("flex items-start", density.gap, density.row)}
      aria-describedby={error ? `${uid}-${change.id}-err` : undefined}
    >
      {marker}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", density.text)}>
        <span className="sr-only">
          {reverted
            ? `${change.label}: back to ${from}.`
            : `${change.label}: ${to}, was ${from}.`}
        </span>
        <div aria-hidden className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium text-foreground">
            {change.label}
          </span>
          {change.section ? (
            <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              {change.section}
            </span>
          ) : null}
          {reverted ? (
            <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
              Reverted
            </span>
          ) : null}
        </div>
        {diffStyle === "stacked" ? (
          <div
            aria-hidden
            className="flex min-w-0 flex-col font-mono text-[0.92em]"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-3 shrink-0 text-ink-3">
                {reverted ? "=" : "−"}
              </span>
              {oldValue}
            </span>
            <span
              className={cn(
                "flex min-w-0 items-baseline gap-2 transition-opacity duration-300",
                reverted && "opacity-0 delay-300",
              )}
            >
              <span className="w-3 shrink-0 [color:var(--lg-tone)]">+</span>
              {newValue}
            </span>
          </div>
        ) : diffStyle === "split" ? (
          <div
            aria-hidden
            className="grid min-w-0 grid-cols-1 gap-x-3 @min-[24rem]:grid-cols-2"
          >
            <span className="min-w-0">{oldValue}</span>
            <span className="min-w-0">{newValue}</span>
          </div>
        ) : (
          <div
            aria-hidden
            className="flex min-w-0 flex-wrap items-baseline gap-x-2"
          >
            <span className="min-w-0">{oldValue}</span>
            <span
              className={cn(
                "shrink-0 text-ink-3 transition-opacity duration-300",
                reverted && "opacity-0",
              )}
            >
              →
            </span>
            <span className="min-w-0">{newValue}</span>
          </div>
        )}
        {error ? (
          <span
            id={`${uid}-${change.id}-err`}
            className="text-[11px] leading-4 text-danger"
          >
            {error}
          </span>
        ) : null}
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * An unsaved-changes guard that shows exactly what would be lost. It wraps the
 * page (which goes inert behind a scrim while it is open) and lists every
 * edited field as a compact diff — old value struck, new value in the tone.
 *
 * Discard does not just close: it plays the edits backwards one row at a
 * time, top to bottom, spending the 600ms budget across the rows. In each row
 * the new value slides back onto the old one — by its measured offset, on
 * `springs.glide` — and fades into it, while the old value's strike retracts
 * on glide and its ink returns; `onRevert` fires as each row lets go so the
 * page behind can revert in step, and a beat after the last the dialog leaves
 * on the exit ease. Save shows its progress: the fill under Save grows as
 * fields report in (or runs indeterminate), each row draws a check on flick,
 * and a failure keeps the dialog open with the reason inside it. Keep editing
 * — or Escape — puts focus back on the field that was last being edited.
 *
 * It is a real `alertdialog`: focus starts on Keep editing, Tab wraps, and
 * long lists scroll inside it with edge fades. Under reduced motion nothing
 * slides — each row cross-fades to its old value in turn, so the unwind still
 * reads — and the fill and the ticks still show.
 */
export function LeaveGuard({
  changes: changesProp = defaultLeaveGuardChanges,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onSave,
  onDiscard,
  onRevert,
  onCancel,
  children,
  title = leaveGuardTitle,
  description = "Keep them or let go.",
  labels,
  formatValue = defaultFormat,
  diffStyle = "inline",
  density = "cozy",
  tone = "caution",
  disabled = false,
  className,
}: LeaveGuardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.cozy;
  const words = {
    save: labels?.save ?? "Save changes",
    discard: labels?.discard ?? "Discard",
    cancel: labels?.cancel ?? "Keep editing",
  };

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [reported, setReported] = React.useState<Set<string>>(() => new Set());
  const [reverted, setReverted] = React.useState<Set<string>>(() => new Set());
  const [error, setError] = React.useState<{
    message: string;
    fields: Record<string, string>;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // While a save or a discard runs, the dialog keeps showing the list it
  // started with — the page behind may revert or save under it.
  const [frozen, setFrozen] = React.useState<LeaveGuardChange[] | null>(null);
  const changes = frozen ?? changesProp;
  // Each opening starts clean — decided in render as the guard opens, so a
  // quick reopen never inherits the last session's phase. Closing keeps the
  // state, so the leaving dialog does not flash back to idle.
  const [seenOpen, setSeenOpen] = React.useState(open);
  if (seenOpen !== open) {
    setSeenOpen(open);
    if (open) {
      setPhase("idle");
      setReported(new Set());
      setReverted(new Set());
      setError(null);
      setFrozen(null);
    }
  }
  const [fade, setFade] = React.useState({ top: false, bottom: false });

  const pageRef = React.useRef<HTMLDivElement | null>(null);
  const lastField = React.useRef<HTMLElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const restoreTo = React.useRef<HTMLElement | null>(null);
  const keepRef = React.useRef<HTMLButtonElement | null>(null);
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const [listNode, setListNode] = React.useState<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);
  const attempt = React.useRef(0);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  React.useEffect(() => () => clearTimers(), []);

  // The field being edited is remembered, so Keep editing can go back to it.
  React.useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const onFocus = (event: FocusEvent) => {
      const el = event.target as HTMLElement | null;
      if (el?.matches?.(EDITABLE)) lastField.current = el;
    };
    page.addEventListener("focusin", onFocus);
    return () => page.removeEventListener("focusin", onFocus);
  }, []);

  // Whatever had focus when the guard opened is the way back after a save.
  const wasOpen = React.useRef(open);
  React.useLayoutEffect(() => {
    if (open && !wasOpen.current) {
      const active = document.activeElement as HTMLElement | null;
      opener.current = active && active !== document.body ? active : null;
    }
    wasOpen.current = open;
  }, [open]);

  // Focus starts on the least destructive action…
  React.useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() =>
      keepRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // …and goes back into the page once it is no longer inert.
  React.useEffect(() => {
    if (open) return;
    const node = restoreTo.current;
    restoreTo.current = null;
    if (node?.isConnected) node.focus({ preventScroll: true });
  }, [open]);

  // Edge fades show only while more of the list waits past an edge.
  React.useEffect(() => {
    if (!listNode) return;
    const check = () => {
      const top = listNode.scrollTop > 1;
      const bottom =
        listNode.scrollHeight - listNode.clientHeight - listNode.scrollTop > 1;
      setFade((f) =>
        f.top === top && f.bottom === bottom ? f : { top, bottom },
      );
    };
    const ro = new ResizeObserver(check);
    ro.observe(listNode);
    if (listNode.firstElementChild) ro.observe(listNode.firstElementChild);
    listNode.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      listNode.removeEventListener("scroll", check);
    };
  }, [listNode]);

  const close = (back: HTMLElement | null) => {
    restoreTo.current = back;
    clearTimers();
    if (openProp === undefined) setOwnOpen(false);
    onOpenChange?.(false);
  };

  const busy =
    phase === "saving" || phase === "discarding" || phase === "saved";

  const keepEditing = () => {
    if (phase === "discarding" || phase === "saved") return;
    const field = lastField.current;
    setAnnouncement("Kept editing.");
    close(field?.isConnected ? field : opener.current);
    onCancel?.();
  };

  const save = () => {
    if (disabled || busy || changes.length === 0) return;
    const run = ++attempt.current;
    setFrozen(changes);
    setPhase("saving");
    setError(null);
    setReported(new Set());
    setAnnouncement("Saving.");
    const report = (id: string) => {
      if (attempt.current !== run) return;
      setReported((s) => (s.has(id) ? s : new Set(s).add(id)));
    };
    const done = () => {
      if (attempt.current !== run) return;
      setReported(new Set(changes.map((c) => c.id)));
      setPhase("saved");
      setAnnouncement(
        `Saved ${changes.length} ${changes.length === 1 ? "change" : "changes"}.`,
      );
      timers.current.push(
        window.setTimeout(
          () => close(opener.current ?? lastField.current),
          520,
        ),
      );
    };
    const result = onSave?.(changes, report);
    if (result && typeof (result as Promise<void>).then === "function") {
      (result as Promise<void>).then(done, (reason: unknown) => {
        if (attempt.current !== run) return;
        const err = reason as LeaveGuardSaveError | undefined;
        const message =
          err instanceof Error && err.message
            ? err.message
            : "The save did not go through. Your edits are still here.";
        // Nothing half-saved is shown as saved: the fill drains back.
        setPhase("failed");
        setFrozen(null);
        setReported(new Set());
        setError({ message, fields: err?.fields ?? {} });
        setAnnouncement(`Save failed. ${message}`);
      });
    } else {
      done();
    }
  };

  const discard = () => {
    if (disabled || busy || changes.length === 0) return;
    setFrozen(changes);
    setPhase("discarding");
    setError(null);
    setReported(new Set());
    setAnnouncement(
      `Discarding ${changes.length} ${changes.length === 1 ? "change" : "changes"}.`,
    );
    // One row at a time, top to bottom, inside the 600ms budget.
    const step = Math.min(140, Math.floor(600 / Math.max(1, changes.length)));
    changes.forEach((change, i) => {
      timers.current.push(
        window.setTimeout(
          () => {
            setReverted((s) => new Set(s).add(change.id));
            onRevert?.(change);
          },
          60 + i * step,
        ),
      );
    });
    const end = 60 + (changes.length - 1) * step + (motionSafe ? 420 : 220);
    timers.current.push(
      window.setTimeout(() => {
        setAnnouncement("Discarded. Every change was let go.");
        onDiscard?.(changes);
        close(opener.current ?? lastField.current);
      }, end),
    );
  };

  const onDialogKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      keepEditing();
      return;
    }
    if (event.key !== "Tab") return;
    const box = dialogRef.current;
    if (!box) return;
    const nodes = Array.from(
      box.querySelectorAll<HTMLElement>(TABBABLE),
    ).filter((n) => n.offsetParent !== null && n.tabIndex >= 0);
    const first = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (!first || !lastNode) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastNode.focus();
    } else if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault();
      first.focus();
    }
  };

  const count = changes.length;
  const heading = typeof title === "function" ? title(count) : title;
  const share = count > 0 ? reported.size / count : 0;
  const toneStyle = {
    "--lg-tone": TONE[tone] ?? TONE.caution,
  } as React.CSSProperties;
  const saveText =
    phase === "saving"
      ? reported.size > 0
        ? `Saving ${reported.size} of ${count}`
        : "Saving…"
      : phase === "saved"
        ? "Saved"
        : phase === "failed"
          ? "Try again"
          : words.save;
  const maskImage =
    fade.top && fade.bottom
      ? "linear-gradient(to bottom, transparent, black 16px, black calc(100% - 16px), transparent)"
      : fade.top
        ? "linear-gradient(to bottom, transparent, black 16px)"
        : fade.bottom
          ? "linear-gradient(to bottom, black calc(100% - 16px), transparent)"
          : undefined;

  return (
    <div
      className={cn("@container relative w-full", className)}
      style={toneStyle}
    >
      <div ref={pageRef} inert={open}>
        {children}
      </div>

      {/* Open on arrival, the dialog is simply there: the first frame —
          server-rendered included — shows it, not an empty scrim. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="guard"
            className="absolute inset-0 z-20 flex items-center justify-center p-2 @min-[30rem]:p-4"
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-[inherit] bg-background/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            />
            <motion.div
              ref={dialogRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`${uid}-title`}
              aria-describedby={`${uid}-desc`}
              onKeyDown={onDialogKey}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? { y: springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="relative flex max-h-full w-full flex-col overflow-hidden rounded-4 border border-hairline-strong bg-popover text-popover-foreground shadow-raised @min-[30rem]:w-[28rem]"
            >
              <div
                className={cn(
                  "flex shrink-0 items-start gap-3 pt-4 pb-3",
                  d.pad,
                )}
              >
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-3 bg-[color-mix(in_oklab,var(--lg-tone)_14%,transparent)] [color:var(--lg-tone)]"
                >
                  <PenLine className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h2
                    id={`${uid}-title`}
                    className="text-[15px] leading-5 font-semibold"
                  >
                    {heading}
                  </h2>
                  <p
                    id={`${uid}-desc`}
                    className="text-[12px] leading-4 text-ink-2"
                  >
                    {count === 0
                      ? "Nothing is waiting to be saved."
                      : description}
                  </p>
                </div>
              </div>

              <div
                ref={setListNode}
                className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-y border-hairline"
                style={{ maskImage }}
              >
                <ul
                  role="list"
                  aria-label="Unsaved changes"
                  className={cn("flex flex-col py-1", d.pad)}
                >
                  {diffStyle === "split" ? (
                    <li
                      aria-hidden
                      className={cn(
                        "hidden pt-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[24rem]:flex",
                        d.gap,
                      )}
                    >
                      <span className="w-4 shrink-0" />
                      <span className="grid flex-1 grid-cols-2 gap-x-3">
                        <span>Before</span>
                        <span>After</span>
                      </span>
                    </li>
                  ) : null}
                  {changes.map((change, i) => (
                    <DiffRow
                      key={change.id}
                      change={change}
                      index={i}
                      stagger={cascade(changes.length)}
                      diffStyle={diffStyle}
                      density={d}
                      format={formatValue}
                      reverted={reverted.has(change.id)}
                      saved={reported.has(change.id)}
                      error={error?.fields[change.id]}
                      motionSafe={motionSafe}
                      uid={uid}
                    />
                  ))}
                </ul>
              </div>

              <AnimatePresence initial={false}>
                {error ? (
                  <motion.div
                    key="error"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe
                        ? {
                            height: springs.glide,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: 0 }
                    }
                    className="shrink-0 overflow-hidden"
                  >
                    <p
                      role="alert"
                      className={cn(
                        "flex items-start gap-2 bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] py-2 text-[12px] leading-4 text-danger",
                        d.pad,
                      )}
                    >
                      <TriangleAlert
                        aria-hidden
                        className="mt-px size-3.5 shrink-0"
                      />
                      {error.message}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div
                role="progressbar"
                aria-label="Saving"
                aria-valuemin={0}
                aria-valuemax={count}
                aria-valuenow={reported.size}
                aria-hidden={phase !== "saving" && phase !== "saved"}
                className="relative h-0.5 w-full shrink-0 overflow-hidden"
              >
                {phase === "saving" && reported.size === 0 ? (
                  <motion.span
                    className="absolute inset-y-0 left-0 w-1/3 bg-primary"
                    initial={{ x: "-100%" }}
                    animate={motionSafe ? { x: "300%" } : { x: "100%" }}
                    transition={
                      motionSafe
                        ? {
                            duration: 1.1,
                            ease: easings.move,
                            repeat: Infinity,
                          }
                        : { duration: 0 }
                    }
                  />
                ) : (
                  <motion.span
                    className="absolute inset-0 origin-left bg-primary"
                    initial={false}
                    animate={{
                      scaleX:
                        phase === "saving" || phase === "saved" ? share : 0,
                    }}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  />
                )}
              </div>

              <div
                className={cn(
                  "flex shrink-0 flex-wrap items-center justify-end gap-2 py-3",
                  d.pad,
                )}
              >
                <button
                  type="button"
                  onClick={discard}
                  aria-disabled={disabled || busy || count === 0 || undefined}
                  className={cn(
                    "mr-auto inline-flex h-9 items-center rounded-2 px-3 text-[13px] font-medium transition-colors hover:bg-surface-2",
                    FOCUS,
                    tone === "calm" ? "text-ink-2" : "[color:var(--lg-tone)]",
                    (disabled || busy) && "cursor-default opacity-60",
                  )}
                >
                  {phase === "discarding" ? "Discarding…" : words.discard}
                </button>
                <button
                  ref={keepRef}
                  type="button"
                  onClick={keepEditing}
                  aria-disabled={
                    phase === "discarding" || phase === "saved" || undefined
                  }
                  className={cn(
                    "inline-flex h-9 items-center rounded-2 border border-input bg-surface-1 px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2",
                    FOCUS,
                  )}
                >
                  {words.cancel}
                </button>
                <button
                  type="button"
                  onClick={save}
                  aria-disabled={disabled || busy || count === 0 || undefined}
                  aria-busy={phase === "saving" || undefined}
                  className={cn(
                    "relative inline-flex h-9 basis-full items-center justify-center overflow-hidden rounded-2 bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 @min-[24rem]:basis-auto",
                    FOCUS,
                    disabled && "cursor-default opacity-60",
                  )}
                >
                  {/* The fill sweeps in as fields report: progress made, on glide. */}
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 origin-left bg-primary-foreground/20"
                    initial={false}
                    animate={{
                      scaleX:
                        phase === "saving" || phase === "saved"
                          ? phase === "saved"
                            ? 1
                            : share
                          : 0,
                    }}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  />
                  <span className="relative tabular-nums">{saveText}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
