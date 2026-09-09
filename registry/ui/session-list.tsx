"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

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

export type SessionKind = "phone" | "laptop" | "tablet";

export type SessionItem = {
  id: string;
  /** Device name, e.g. "Coldbrook phone". */
  device: string;
  kind: SessionKind;
  /** Where it signed in from. */
  place: string;
  /** When it was last seen, preformatted. */
  seen: string;
  /** The session reading this list. It breathes and cannot be signed out here. */
  current?: boolean;
};

export type SessionListProps = {
  ref?: React.Ref<HTMLDivElement>;
  sessions: SessionItem[];
  /** Fires from the row's button; the host removes the session. */
  onSignOut?: (id: string) => void;
  /** Fires from the footer with every non-current id; the host removes them. */
  onSignOutAll?: (ids: string[]) => void;
  /** List heading. */
  label: React.ReactNode;
  /** Chip text on the live row. @default "This device" */
  currentLabel?: string;
  /** Footer control. @default "Sign out all other sessions" */
  signOutAllLabel?: string;
  className?: string;
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the live dot rests while nobody looks. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

function DeviceIcon({ kind }: { kind: SessionKind }) {
  return (
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
      {kind === "phone" ? (
        <>
          <rect x="5" y="1.5" width="6" height="13" rx="1.5" />
          <path d="M7 12.5h2" />
        </>
      ) : kind === "tablet" ? (
        <>
          <rect x="3" y="1.5" width="10" height="13" rx="1.5" />
          <path d="M7 12.5h2" />
        </>
      ) : (
        <>
          <rect x="2.5" y="3.5" width="11" height="7.5" rx="1" />
          <path d="M1 13.5h14" />
        </>
      )}
    </svg>
  );
}

/**
 * Everywhere you are signed in. One row per session; the row reading the list
 * carries a chip whose dot breathes — a halo swelling and settling on `drift`,
 * mirrored forever, resting while the tab is hidden — so the live session is
 * found by motion and named by words. Signing one out fires from the press,
 * and when the host removes it the row slides aside by `distances.shift`
 * while its height closes on the exit ease, so the rows below glide up into
 * the space. Signing out all cascades the exits top to bottom on `cascade()`:
 * the order rides `AnimatePresence`'s `custom`, which reaches a row after it
 * has already been removed and can no longer take new props.
 *
 * Every Sign out is a real button named after its device, and focus is handed
 * to the next row or the footer before a row leaves so it never falls to the
 * body. Under reduced motion the dot is solid inside a still ring, rows fade
 * and close without travelling, and the cascade keeps its order as fades.
 */
export function SessionList({
  ref,
  sessions,
  onSignOut,
  onSignOutAll,
  label,
  currentLabel = "This device",
  signOutAllLabel = "Sign out all other sessions",
  className,
}: SessionListProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [order, setOrder] = React.useState<string[]>([]);
  const [announcement, setAnnouncement] = React.useState("");
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const footerRef = React.useRef<HTMLButtonElement>(null);

  const others = sessions.filter((session) => !session.current);
  const breathing = motionSafe && visible;

  const signOut = (session: SessionItem) => {
    // Hand focus on before the row leaves: the next row's control, or the
    // footer, or nothing — never the body.
    const index = others.findIndex((item) => item.id === session.id);
    const next = others[index + 1] ?? others[index - 1];
    const target = next ? buttonRefs.current.get(next.id) : footerRef.current;
    target?.focus();
    setAnnouncement(`Signed out ${session.device}`);
    onSignOut?.(session.id);
  };

  const signOutAll = () => {
    const ids = others.map((session) => session.id);
    if (ids.length === 0) return;
    setOrder(ids);
    setAnnouncement(`Signed out ${ids.length} sessions`);
    onSignOutAll?.(ids);
  };

  const enter = motionSafe
    ? {
        ...springs.glide,
        opacity: { duration: durations.fast, ease: easings.enter },
      }
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2.5">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] tabular-nums">
          <motion.span
            key={sessions.length}
            className="inline-block text-signal"
            initial={motionSafe ? { y: -6, opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe
                ? springs.snap
                : { duration: durations.fast, ease: easings.enter }
            }
          >
            {sessions.length}
          </motion.span>
          <span className="text-ink-3">
            {sessions.length === 1 ? "session" : "sessions"}
          </span>
        </span>
      </div>

      <ul aria-labelledby={labelId} className="flex flex-col">
        <AnimatePresence
          initial={false}
          custom={order}
          onExitComplete={() => setOrder([])}
        >
          {sessions.map((session) => (
            <motion.li
              key={session.id}
              className="overflow-hidden border-b border-hairline last:border-b-0"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto", x: 0 }}
              transition={enter}
              variants={{
                // Resolved at exit time against the presence `custom`, so a
                // row signed out alone leaves at once and one in a cascade
                // waits its turn.
                leave: (ids: string[]) => ({
                  x: motionSafe ? distances.shift : 0,
                  opacity: 0,
                  height: 0,
                  transition: {
                    ...exitFor(),
                    delay:
                      Math.max(0, ids.indexOf(session.id)) *
                      cascade(ids.length),
                  },
                }),
              }}
              exit="leave"
            >
              <div className="flex items-center gap-3 px-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-2 border border-hairline bg-surface-2 text-ink-2">
                  <DeviceIcon kind={session.kind} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="truncate text-sm font-medium"
                    title={session.device}
                  >
                    {session.device}
                  </span>
                  <span className="truncate text-xs text-ink-3">
                    {session.place} · {session.seen}
                  </span>
                </div>
                {session.current ? (
                  <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline-strong px-2 text-[11px] font-medium text-ink-2">
                    <span className="relative grid size-2 place-items-center">
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full bg-success"
                        initial={{ scale: 1, opacity: 0.5 }}
                        animate={
                          breathing
                            ? { scale: 2.6, opacity: 0 }
                            : { scale: 1.8, opacity: 0.25 }
                        }
                        transition={
                          breathing
                            ? {
                                ...springs.drift,
                                repeat: Infinity,
                                repeatType: "mirror",
                              }
                            : { duration: durations.fast }
                        }
                      />
                      <span className="relative size-2 rounded-full bg-success" />
                    </span>
                    {currentLabel}
                  </span>
                ) : (
                  <button
                    ref={(node) => {
                      if (node) buttonRefs.current.set(session.id, node);
                      else buttonRefs.current.delete(session.id);
                    }}
                    type="button"
                    aria-label={`Sign out ${session.device}`}
                    onClick={() => signOut(session)}
                    className={cn(
                      "flex h-7 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    Sign out
                  </button>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <AnimatePresence initial={false} mode="wait" custom={order}>
        {others.length > 0 ? (
          <motion.div
            key="footer"
            className="overflow-hidden"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={enter}
            variants={{
              // The footer waits for the last row of a cascade to leave, so
              // it never closes over rows still on their way out.
              leave: (ids: string[]) => ({
                opacity: 0,
                height: 0,
                transition: {
                  ...exitFor(),
                  delay:
                    ids.length > 0
                      ? (ids.length - 1) * cascade(ids.length) +
                        (exitFor().duration ?? 0)
                      : 0,
                },
              }),
            }}
            exit="leave"
          >
            <div className="border-t border-hairline p-3">
              <button
                ref={footerRef}
                type="button"
                onClick={signOutAll}
                className={cn(
                  "flex h-9 w-full items-center justify-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-sm font-medium transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                {signOutAllLabel}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.p
            key="empty"
            className="border-t border-hairline px-3 py-3 text-center text-xs text-ink-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            No other sessions.
          </motion.p>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
