"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

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

export type VaultKey = {
  id: string;
  label: string;
  /** What kind of credential it is — printed beside the label. */
  kind: string;
  /** The secret itself. Masked until an explicit reveal. */
  value: string;
};

export type KeyVaultProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The keys, in order. */
  keys: VaultKey[];
  /** Vault name; labels the card and the list. */
  label: React.ReactNode;
  /** Controlled lock state. */
  unlocked?: boolean;
  /** Initial lock state for uncontrolled usage. @default false */
  defaultUnlocked?: boolean;
  /** Fires from the switch, the Escape, or the ring running out. */
  onUnlockedChange?: (unlocked: boolean) => void;
  /** Milliseconds the vault stays open; 0 disables the ring. @default 12000 */
  autoLockMs?: number;
  /** Fires from the ring's completion when the vault locks itself. */
  onAutoLock?: () => void;
  /** Fires from the press that revealed or re-masked a value. */
  onReveal?: (id: string, revealed: boolean) => void;
  /** Fires from the copy attempt with whether the clipboard took it. */
  onCopy?: (id: string, ok: boolean) => void;
  className?: string;
};

/** How long a copy result holds in the live region before it clears. */
const NOTE_HOLD_MS = 1600;

const EMPTY: Record<string, boolean> = {};

/** One stroke recipe for every mark in the card, so the weights cannot drift. */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICON_BUTTON =
  "grid size-7 shrink-0 place-items-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-ink focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

/** Keeps callbacks out of effect dependencies so a re-render cannot restart the ring. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const subscribeVisibility = (onChange: () => void): (() => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

const getVisible = (): boolean =>
  typeof document === "undefined" || !document.hidden;

/**
 * A prerender has no document to ask, so it reports visible — the same value
 * the first client render must produce for hydration to match.
 */
const getServerVisible = (): boolean => true;

/**
 * A vault whose lock says both that it is open and how long it stays open.
 * Flipping the switch turns the lock on `snap`: the shackle lifts and the
 * keyway takes a quarter turn in one crisp overshoot, the physics of a switch
 * arriving at its position. Around it an auto-lock ring drains linearly, held
 * in a motion value rather than state so hiding the tab can stop it and
 * returning can resume from what is left; the vault locks itself from that
 * animation's completion, never from inside a state updater.
 *
 * The keys exist only while the vault is open — locked, their values are not in
 * the document at all — and they arrive from 8px away on `glide` in a cascade.
 * Locking takes them at once and closes the drawer on the exit ease, which
 * accelerates rather than springs, because a vault shutting is not a
 * celebration. The list's height is measured with a `ResizeObserver` and
 * animated, so a closed vault holds no empty room.
 *
 * The lock is a `role="switch"`, every reveal is an `aria-pressed` button, and
 * Escape anywhere inside locks the vault and hands focus back to the switch.
 * Under reduced motion the lock swaps without turning and rows fade rather than
 * slide, but the ring still drains, because how long you have is information.
 */
export function KeyVault({
  ref,
  keys,
  label,
  unlocked,
  defaultUnlocked = false,
  onUnlockedChange,
  autoLockMs = 12000,
  onAutoLock,
  onReveal,
  onCopy,
  className,
}: KeyVaultProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultUnlocked);
  const isControlled = unlocked !== undefined;
  const isUnlocked = isControlled ? unlocked : uncontrolled;

  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );

  const switchRef = React.useRef<HTMLButtonElement | null>(null);

  // Reveals belong to the session that opened the vault: keyed to the lock
  // state rather than cleared in an effect, so locking cannot leave a value
  // waiting to reappear the next time the vault opens.
  const [session, setSession] = React.useState({
    open: isUnlocked,
    ids: EMPTY,
  });
  if (session.open !== isUnlocked) {
    setSession({ open: isUnlocked, ids: EMPTY });
  }
  const revealed = session.ids;

  const setUnlocked = (next: boolean) => {
    if (next === isUnlocked) return;
    if (!isControlled) setUncontrolled(next);
    onUnlockedChange?.(next);
  };

  // 1 → 0 across autoLockMs. A motion value, not state: pausing is then a stop
  // and a restart from the remainder, with nothing re-rendering in between.
  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);
  const [arm, setArm] = React.useState(0);

  const rearm = React.useCallback(() => {
    remaining.set(1);
    setArm((count) => count + 1);
  }, [remaining]);

  // Runs before the drain below, so a vault opened from outside refills the
  // ring before the drain reads what is left of it. Locking leaves the ring
  // where it stopped: refilling it under a fading indicator reads as a flash.
  const wasUnlocked = React.useRef(isUnlocked);
  React.useEffect(() => {
    if (wasUnlocked.current === isUnlocked) return;
    wasUnlocked.current = isUnlocked;
    if (isUnlocked) remaining.set(1);
  }, [isUnlocked, remaining]);

  const latest = useLatest({ isControlled, onUnlockedChange, onAutoLock });

  React.useEffect(() => {
    if (!isUnlocked || autoLockMs <= 0 || !visible) return;
    const controls = animate(remaining, 0, {
      // A countdown is information, not flourish, so it drains at the same
      // linear rate whether or not rich motion is allowed.
      duration: (autoLockMs / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => {
        const handlers = latest.current;
        if (!handlers.isControlled) setUncontrolled(false);
        handlers.onUnlockedChange?.(false);
        handlers.onAutoLock?.();
      },
    });
    return () => controls.stop();
  }, [isUnlocked, autoLockMs, visible, arm, remaining, latest]);

  const listRef = React.useRef<HTMLUListElement | null>(null);
  const [listHeight, setListHeight] = React.useState(0);

  React.useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const height =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
      if (height > 0) setListHeight(Math.round(height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [isUnlocked]);

  const [note, setNote] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), NOTE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [note]);

  const toggleReveal = (key: VaultKey) => {
    const next = !revealed[key.id];
    setSession((current) => ({
      open: current.open,
      ids: { ...current.ids, [key.id]: next },
    }));
    rearm();
    onReveal?.(key.id, next);
  };

  const copyValue = async (key: VaultKey) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(key.value);
      ok = true;
    } catch {
      // A denied or missing clipboard is a state to show, not a crash.
      ok = false;
    }
    setNote(ok ? "Value copied" : "Clipboard unavailable");
    rearm();
    onCopy?.(key.id, ok);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const turn = motionSafe ? springs.snap : { duration: 0 };
  const stagger = cascade(keys.length);
  const seconds = Math.round(autoLockMs / 1000);
  const status =
    note ??
    (isUnlocked
      ? autoLockMs > 0
        ? `Vault unlocked, locks in ${seconds} seconds`
        : "Vault unlocked"
      : "Vault locked");

  return (
    <div
      ref={ref}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isUnlocked) return;
        event.stopPropagation();
        setUnlocked(false);
        switchRef.current?.focus();
      }}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center">
          <button
            ref={switchRef}
            type="button"
            role="switch"
            aria-checked={isUnlocked}
            aria-label="Vault lock"
            onClick={() => setUnlocked(!isUnlocked)}
            className={cn(
              "grid size-9 place-items-center rounded-full border transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isUnlocked
                ? "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright"
                : "border-hairline bg-surface-2 text-ink-2 hover:bg-accent",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              {...STROKE}
              strokeWidth="1.8"
              className="size-5"
            >
              <motion.path
                d="M8.4 10.6V7.8a3.6 3.6 0 0 1 7.2 0v2.8"
                initial={false}
                animate={{
                  y: isUnlocked ? -2.2 : 0,
                  rotate: isUnlocked ? -16 : 0,
                }}
                transition={turn}
                style={{
                  transformBox: "view-box",
                  originX: "15.6px",
                  originY: "10.6px",
                }}
              />
              <rect x="4.8" y="10.6" width="14.4" height="9" rx="2.2" />
              <motion.g
                initial={false}
                animate={{ rotate: isUnlocked ? 90 : 0 }}
                transition={turn}
                style={{
                  transformBox: "view-box",
                  originX: "12px",
                  originY: "14.4px",
                }}
              >
                <circle cx="12" cy="14.4" r="1.35" />
                <path d="M12 15.9v1.7" />
              </motion.g>
            </svg>
          </button>

          {/* The ring lives outside the button so its stroke can never be
              mistaken for a focus indicator on the control itself. */}
          <motion.svg
            viewBox="0 0 44 44"
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full -rotate-90"
            initial={false}
            animate={{ opacity: isUnlocked && autoLockMs > 0 ? 1 : 0 }}
            transition={fade}
          >
            <circle
              cx="22"
              cy="22"
              r="21"
              fill="none"
              stroke="var(--hairline-strong)"
              strokeWidth="2"
            />
            <motion.circle
              cx="22"
              cy="22"
              r="21"
              fill="none"
              stroke="var(--accent-bright)"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              style={{ strokeDashoffset: ringOffset }}
            />
          </motion.svg>
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {keys.length} keys {isUnlocked ? "open" : "sealed"}
          </span>
        </span>
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: isUnlocked ? listHeight : 0 }}
        transition={
          motionSafe
            ? isUnlocked
              ? springs.glide
              : exitFor(durations.slow)
            : { duration: 0 }
        }
      >
        {/* Unmounted while locked, not merely hidden: a sealed vault whose
            values still sit in the document is not sealed, and nothing
            focusable can hide behind a closed drawer. */}
        {isUnlocked ? (
          <ul
            ref={listRef}
            aria-labelledby={labelId}
            className="flex flex-col gap-0.5 pt-1"
          >
            {keys.map((key, index) => {
              const shown = revealed[key.id] === true;
              return (
                <motion.li
                  key={key.id}
                  className="flex h-10 items-center gap-2 rounded-2 px-2 transition-colors hover:bg-accent"
                  initial={
                    motionSafe
                      ? { opacity: 0, x: -distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  transition={
                    motionSafe
                      ? { ...springs.glide, delay: index * stagger }
                      : fade
                  }
                >
                  <span className="flex min-w-0 flex-1 flex-col justify-center">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        title={key.label}
                        className="truncate text-xs leading-tight font-medium text-ink"
                      >
                        {key.label}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        {key.kind}
                      </span>
                    </span>
                    {/* Both faces share one cell, so revealing cannot change
                          the row's height or shove the buttons sideways. */}
                    <span className="grid min-w-0">
                      <motion.span
                        aria-hidden
                        className="col-start-1 row-start-1 truncate font-mono text-[11px] tracking-[0.12em] text-ink-3"
                        initial={false}
                        animate={{ opacity: shown ? 0 : 1 }}
                        transition={fade}
                      >
                        ••••••••••
                      </motion.span>
                      <motion.span
                        aria-hidden={!shown}
                        title={shown ? key.value : undefined}
                        className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink-2"
                        initial={false}
                        animate={{ opacity: shown ? 1 : 0 }}
                        transition={fade}
                      >
                        {key.value}
                      </motion.span>
                    </span>
                  </span>

                  <button
                    type="button"
                    aria-pressed={shown}
                    aria-label={`${shown ? "Hide" : "Reveal"} ${key.label}`}
                    onClick={() => toggleReveal(key)}
                    className={cn(ICON_BUTTON, shown && "text-cobalt-bright")}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      {...STROKE}
                      strokeWidth="1.5"
                      className="size-4"
                    >
                      <path d="M1.6 8s2.4-4.2 6.4-4.2S14.4 8 14.4 8s-2.4 4.2-6.4 4.2S1.6 8 1.6 8Z" />
                      <circle cx="8" cy="8" r="1.9" />
                      <motion.path
                        d="M3 13 13 3"
                        pathLength={1}
                        initial={false}
                        animate={{ pathLength: shown ? 0 : 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </svg>
                  </button>

                  <button
                    type="button"
                    aria-label={`Copy ${key.label}`}
                    onClick={() => {
                      void copyValue(key);
                    }}
                    className={ICON_BUTTON}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      {...STROKE}
                      strokeWidth="1.5"
                      className="size-4"
                    >
                      <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
                      <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
                    </svg>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        ) : null}
      </motion.div>

      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  );
}
