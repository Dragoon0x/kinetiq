"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShareTarget = {
  id: string;
  label: string;
  /** Key into the built-in icon set; an unknown name draws a dot. */
  icon: string;
  onSelect: (url: string) => void;
};

export type ShareTrayProps = {
  /** What is shared: written to the clipboard and handed to the native sheet. */
  url: string;
  /** Share title, shown in the tray and passed to the native sheet. */
  title: string;
  /** Custom destinations; the built-in copy target is always first. */
  targets: ShareTarget[];
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fires with the id of whichever target was used, "copy" and "more" included. */
  onAction?: (id: string) => void;
  className?: string;
};

/** Stroked 16×16 paths — the tray ships its own marks so it needs no icon package. */
const ICONS: Record<string, string[]> = {
  link: [
    "M6.75 9.25a2.5 2.5 0 0 0 3.54 0l2-2a2.5 2.5 0 0 0-3.54-3.54l-.75.75",
    "M9.25 6.75a2.5 2.5 0 0 0-3.54 0l-2 2a2.5 2.5 0 0 0 3.54 3.54l.75-.75",
  ],
  note: ["M4 2.75h8v10.5H4z", "M6.25 6h3.5", "M6.25 8.75h2.5"],
  chat: ["M3 4.5h10v6H8l-3 2.5V10.5H3z"],
  mail: ["M2.5 4h11v8h-11z", "M2.5 4.5 8 8.75 13.5 4.5"],
  board: ["M2.75 3h10.5v10H2.75z", "M6.25 3v10", "M6.25 7.5h7"],
  send: ["M13.5 2.5 7 9", "M13.5 2.5 9.25 13.5 7 9 2.5 6.75z"],
  more: ["M4 8h.01", "M8 8h.01", "M12 8h.01"],
  dot: ["M8 8h.01"],
};

const CHECK = "M3.75 8.5 6.5 11.25 12.25 4.75";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const emptySubscribe = () => () => {};

/**
 * The prerender has no `navigator`, so the server snapshot is false and the
 * first client render matches the markup that was sent; React swaps in the real
 * answer straight after hydration.
 */
const useCanHandOff = () =>
  React.useSyncExternalStore(
    emptySubscribe,
    () =>
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    () => false,
  );

function Glyph({ name }: { name: string }) {
  const paths = ICONS[name] ?? ICONS.dot ?? [];
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

type CopyState = "idle" | "done" | "failed";

/**
 * Tap share; the targets rise in turn. The tray itself is a surface, so it
 * raises on `glide`; the targets are arrivals, so each rises from
 * `distances.step` on `recoil` in a `cascade` that keeps the whole sweep inside
 * the 600ms budget. Copy writes the clipboard and stamps: the link mark
 * cross-fades into a check that draws on `flick`, and the label lands from
 * 1.15× on `recoil`, the two bounces of a stamp hitting paper. Where the
 * browser has a native share sheet, a "More" target hands off to it.
 *
 * A modal dialog: focus is trapped in the tray, the backdrop is a labelled
 * button, and Escape closes and returns focus to the trigger. Under reduced
 * motion the tray fades and the targets appear in place; the copy stamp still
 * swaps, because a confirmation is information.
 *
 * Fills the nearest positioned ancestor, so give the surface it sits on
 * `position: relative`.
 */
export function ShareTray({
  url,
  title,
  targets,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  onAction,
  className,
}: ShareTrayProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const canHandOff = useCanHandOff();

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const [copyState, setCopyState] = React.useState<CopyState>("idle");

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const closeTray = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setOpen]);

  // The stamp is a moment, not a mode: it clears itself, and the timer is torn
  // down if the tray closes first.
  React.useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const copyLink = () => {
    onAction?.("copy");
    const clipboard =
      typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard?.writeText) {
      setCopyState("failed");
      return;
    }
    clipboard.writeText(url).then(
      () => setCopyState("done"),
      () => setCopyState("failed"),
    );
  };

  const handOff = () => {
    onAction?.("more");
    void navigator.share?.({ title, url }).catch(() => {
      // A dismissed native sheet rejects; that is a choice, not a failure.
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTray();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((node) => node.tabIndex >= 0);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const copyLabel =
    copyState === "done"
      ? "Copied"
      : copyState === "failed"
        ? "Copy failed"
        : "Copy link";

  const cells = [
    { id: "copy", label: copyLabel, icon: "link", run: copyLink },
    ...targets.map((target) => ({
      id: target.id,
      label: target.label,
      icon: target.icon,
      run: () => {
        onAction?.(target.id);
        target.onSelect(url);
      },
    })),
    ...(canHandOff
      ? [{ id: "more", label: "More", icon: "more", run: handOff }]
      : []),
  ];
  const stagger = cascade(cells.length);

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-20", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "pointer-events-auto absolute top-3 right-3 flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <Glyph name="send" />
        Share
      </button>

      <AnimatePresence>
        {open ? (
          <motion.button
            key="scrim"
            type="button"
            tabIndex={-1}
            aria-label="Close share tray"
            onClick={closeTray}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.fast }}
            className="pointer-events-auto absolute inset-0 cursor-default bg-background/60"
          />
        ) : null}

        {open ? (
          <motion.div
            key="tray"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={handleKeyDown}
            initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
            animate={motionSafe ? { y: "0%" } : { opacity: 1 }}
            exit={
              motionSafe
                ? { y: "100%", transition: exitFor(durations.slow) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
            className="pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-full flex-col gap-3 overflow-y-auto rounded-t-4 border-t border-hairline-strong bg-popover p-4 text-popover-foreground shadow-lg"
          >
            <div className="flex flex-col gap-0.5">
              <h2 id={titleId} className="text-sm font-semibold">
                Share
              </h2>
              <p title={title} className="truncate text-xs text-ink-2">
                {title}
              </p>
              <p
                title={url}
                className="truncate font-mono text-[10px] text-ink-3"
              >
                {url}
              </p>
            </div>

            <ul className="grid grid-cols-3 gap-2">
              {cells.map((cell, index) => {
                const stamped = cell.id === "copy" && copyState !== "idle";
                const delay = index * stagger;
                return (
                  <li key={cell.id}>
                    <motion.button
                      type="button"
                      onClick={cell.run}
                      initial={
                        motionSafe
                          ? { y: distances.step, opacity: 0 }
                          : { y: 0, opacity: 0 }
                      }
                      animate={{ y: 0, opacity: 1 }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.recoil,
                              delay,
                              opacity: { duration: durations.fast, delay },
                            }
                          : { duration: durations.fast }
                      }
                      className={cn(
                        "flex w-full flex-col items-center gap-1.5 rounded-2 px-1 py-2 transition-colors outline-none hover:bg-accent hover:text-accent-foreground",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline-strong",
                          stamped && copyState === "done"
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "bg-surface-2",
                          stamped && copyState === "failed"
                            ? "text-danger"
                            : undefined,
                        )}
                      >
                        {stamped && copyState === "done" ? (
                          <svg
                            viewBox="0 0 16 16"
                            aria-hidden
                            className="size-4 shrink-0"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.75"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <motion.path
                              d={CHECK}
                              initial={
                                motionSafe
                                  ? { pathLength: 0 }
                                  : { pathLength: 1 }
                              }
                              animate={{ pathLength: 1 }}
                              transition={
                                motionSafe
                                  ? springs.flick
                                  : { duration: durations.fast }
                              }
                            />
                          </svg>
                        ) : (
                          <Glyph name={cell.icon} />
                        )}
                      </span>
                      {/* Keyed on the label, so a stamp remounts and lands
                          rather than cross-fading through a shorter box. */}
                      <motion.span
                        key={cell.label}
                        title={cell.label}
                        className="w-full truncate text-center text-[11px]"
                        initial={
                          motionSafe
                            ? { scale: 1.15, opacity: 0 }
                            : { scale: 1, opacity: 0 }
                        }
                        animate={{ scale: 1, opacity: 1 }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.recoil,
                                opacity: { duration: durations.blink },
                              }
                            : { duration: durations.fast }
                        }
                      >
                        {cell.label}
                      </motion.span>
                    </motion.button>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={closeTray}
              className={cn(
                "flex h-9 w-full items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              Cancel
            </button>

            <span role="status" className="sr-only">
              {copyState === "done"
                ? "Link copied"
                : copyState === "failed"
                  ? "Could not copy the link"
                  : ""}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
