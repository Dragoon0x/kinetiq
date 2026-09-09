"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SeedLockProps = {
  /** The input, so a parent can focus it. */
  ref?: React.Ref<HTMLInputElement>;
  /** Controlled seed, digits only. */
  value?: string;
  /** Initial seed for uncontrolled usage. @default "48213907" */
  defaultValue?: string;
  /** Fires from a keystroke, an unlock or the regenerate control. */
  onValueChange?: (seed: string, reason: "typed" | "rolled") => void;
  /** Controlled lock state. */
  locked?: boolean;
  /** Initial lock state for uncontrolled usage. @default false */
  defaultLocked?: boolean;
  /** Fires from the lock switch. */
  onLockedChange?: (locked: boolean) => void;
  /** Longest seed the field accepts. @default 9 */
  maxDigits?: number;
  /** Names the field. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
/** Shackle paths share one command shape so motion can morph between them. */
const SHACKLE_CLOSED = "M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7";
const SHACKLE_OPEN = "M5.5 4V2.5a2.5 2.5 0 0 1 5 0V7";
const DOTS = Array.from({ length: 9 }, (_, i) => i);
const DOT_LEVELS = [0.25, 0.55, 1] as const;

/** An integer hash, so the next seed is the same on the server and in the browser. */
const mix = (n: number): number => {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
};

/** The seed that follows `seed`: eight digits or fewer, never the same one. */
export function nextSeed(seed: string, maxDigits = 9): string {
  const width = Math.max(1, Math.min(8, Math.floor(maxDigits)));
  const low = 10 ** (width - 1);
  let n = Number(seed) || 0;
  for (let i = 0; i < 4; i += 1) {
    n = mix(n + i);
    const candidate = String(width === 1 ? n % 10 : low + (n % (9 * low)));
    if (candidate !== seed) return candidate;
  }
  return String(low);
}

const digitsOnly = (text: string, max: number) =>
  text.replace(/\D/g, "").slice(0, max);

/** Digits that roll on `snap`; hidden because the input beneath carries the value. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = Math.max(
          0,
          DIGITS.indexOf(char as (typeof DIGITS)[number]),
        );
        return (
          <span
            // Keyed from the right so the units column keeps its identity.
            key={value.length - index}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A seed field with a lock. The field is a real mono input; over its text
 * sits a rolling readout, so a new seed rolls into place digit by digit on
 * `snap` while the input beneath keeps the real value for forms and assistive
 * technology. The lock is a switch whose shackle closes on `flick` — a lock
 * is a confirmation, not a celebration — turning the field read-only and
 * dimming the regenerate control: its cluster of randomness dots, which
 * scatter to a pattern drawn from the seed on every roll, settle to one faint
 * grey. Unlocking opens the shackle and rolls a new seed at once, derived
 * from the old one by an integer hash so the roll matches on server and
 * client; the regenerate control rolls another while unlocked.
 *
 * Typing edits the seed directly and the readout follows each digit without
 * speaking; the status region speaks only from the lock and the roll. Under
 * reduced motion the digits swap in place, the shackle swaps open or closed
 * and the dots swap their pattern — the read-only dim still shows.
 */
export function SeedLock({
  ref,
  value,
  defaultValue = "48213907",
  onValueChange,
  locked,
  defaultLocked = false,
  onLockedChange,
  maxDigits = 9,
  label,
  className,
}: SeedLockProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const inputId = `${baseId}-input`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    digitsOnly(defaultValue, maxDigits),
  );
  const seed = digitsOnly(value ?? uncontrolledValue, maxDigits);
  const [uncontrolledLocked, setUncontrolledLocked] =
    React.useState(defaultLocked);
  const isLocked = locked ?? uncontrolledLocked;
  const [announcement, setAnnouncement] = React.useState("");

  const commit = (next: string, reason: "typed" | "rolled") => {
    if (next === seed) return;
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next, reason);
  };

  const roll = () => {
    if (isLocked) return;
    const next = nextSeed(seed, maxDigits);
    commit(next, "rolled");
    setAnnouncement(`New seed ${next}`);
  };

  const toggleLock = () => {
    const next = !isLocked;
    if (locked === undefined) setUncontrolledLocked(next);
    onLockedChange?.(next);
    if (next) {
      setAnnouncement(`Seed locked at ${seed}`);
      return;
    }
    // Unlocking rolls: the point of unlocking is a different answer.
    const rolled = nextSeed(seed, maxDigits);
    commit(rolled, "rolled");
    setAnnouncement(`Seed unlocked, new seed ${rolled}`);
  };

  // The randomness: nine dots whose brightness pattern is a hash of the seed,
  // so every roll scatters them and a locked seed settles them to one grey.
  const scatter = mix(Number(seed) || 0);
  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <label
          id={labelId}
          htmlFor={inputId}
          className="min-w-0 truncate text-sm font-semibold"
        >
          {label}
        </label>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
            isLocked ? "text-foreground" : "text-ink-3",
          )}
        >
          {isLocked ? "Locked" : "Open"}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div
          className={cn(
            "relative flex h-9 min-w-0 flex-1 items-center rounded-2 border px-3 font-mono text-sm transition-colors",
            isLocked
              ? "border-hairline bg-surface-2/60"
              : "border-input bg-surface-0 focus-within:border-hairline-strong",
          )}
        >
          <input
            ref={ref}
            id={inputId}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            spellCheck={false}
            value={seed}
            readOnly={isLocked}
            aria-readonly={isLocked || undefined}
            aria-describedby={`${baseId}-hint`}
            placeholder="seed"
            maxLength={maxDigits}
            onChange={(event) =>
              commit(digitsOnly(event.target.value, maxDigits), "typed")
            }
            className={cn(
              "h-full w-full min-w-0 bg-transparent text-transparent outline-none placeholder:text-ink-3",
              isLocked ? "caret-transparent" : "caret-foreground",
            )}
          />
          {/* The visible digits: the same mono metrics as the input, so each
              rolling column sits exactly over the character it mirrors. */}
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-3 flex items-center transition-colors",
              isLocked ? "text-ink-2" : "text-foreground",
            )}
          >
            <RollingNumber value={seed} motionSafe={motionSafe} />
          </span>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isLocked}
          aria-label="Lock seed"
          onClick={toggleLock}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-2 border transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isLocked
              ? "border-cobalt-bright/50 bg-cobalt-wash text-cobalt-bright"
              : "border-hairline-strong bg-surface-0 text-ink-2 hover:bg-accent hover:text-foreground",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="size-4 shrink-0"
          >
            <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
            <motion.path
              initial={false}
              animate={{ d: isLocked ? SHACKLE_CLOSED : SHACKLE_OPEN }}
              // The shackle drops on flick: firm, over in a beat.
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </button>

        <button
          type="button"
          aria-label="New seed"
          aria-disabled={isLocked || undefined}
          onClick={roll}
          className={cn(
            "flex h-9 shrink-0 items-center gap-2 rounded-2 border px-2.5 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isLocked
              ? "cursor-not-allowed border-hairline text-ink-3"
              : "border-hairline-strong bg-surface-0 text-foreground hover:bg-accent active:bg-cobalt-wash",
          )}
        >
          <span
            aria-hidden
            className="grid size-3.5 shrink-0 grid-cols-3 gap-px"
          >
            {DOTS.map((dot) => {
              const level = DOT_LEVELS[(scatter >>> (dot * 2)) % 3] ?? 1;
              return (
                <motion.span
                  key={dot}
                  className={cn(
                    "rounded-full transition-colors",
                    isLocked ? "bg-ink-3" : "bg-cobalt-bright",
                  )}
                  initial={false}
                  animate={{ opacity: isLocked ? 0.3 : level }}
                  transition={fade}
                />
              );
            })}
          </span>
          Roll
        </button>
      </div>

      <span id={`${baseId}-hint`} className="sr-only">
        Digits only, up to {maxDigits}. The same seed gives the same answer.
      </span>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
