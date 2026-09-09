"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TwoFactorMethod = "code" | "device";
export type TwoFactorStatus = "waiting" | "checking" | "verified" | "failed";

export type TwoFactorProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled route. */
  method?: TwoFactorMethod;
  /** Initial route for uncontrolled usage. @default "code" */
  defaultMethod?: TwoFactorMethod;
  onMethodChange?: (method: TwoFactorMethod) => void;
  /** Digits in the code. @default 6 */
  length?: number;
  /** Controlled code, digits only. A controlled host clears it after a failure. */
  value?: string;
  /** Initial code for uncontrolled usage. @default "" */
  defaultValue?: string;
  onValueChange?: (code: string) => void;
  /** Controlled outcome; the host decides it. */
  status?: TwoFactorStatus;
  /** Initial outcome for uncontrolled usage. @default "waiting" */
  defaultStatus?: TwoFactorStatus;
  /** Fires when the component itself moves status — a submit moves it to `checking`. */
  onStatusChange?: (status: TwoFactorStatus) => void;
  /** Fires when the last digit lands, or Enter is pressed on a full code. */
  onSubmit?: (code: string) => void;
  /** Named in the device route and its announcements. @default "your device" */
  deviceName?: string;
  /** The alert line under `failed`. @default "That code did not match." */
  errorMessage?: string;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const METHODS: { value: TwoFactorMethod; label: string }[] = [
  { value: "code", label: "Enter code" },
  { value: "device", label: "Approve on device" },
];

const TAB_STEP: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the caret and the screen rest while away. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/** A wait turns at a constant rate: a spring would claim to know how long. */
function PendingRing({ spin }: { spin: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3 shrink-0"
      style={{ originX: 0.5, originY: 0.5 }}
      animate={spin ? { rotate: 360 } : { rotate: 0 }}
      transition={
        spin
          ? { duration: 0.9, ease: easings.linear, repeat: Infinity }
          : { duration: 0 }
      }
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

/**
 * The second key, arriving. Two routes sit on a tablist — a code, or an
 * approval on a device — and the knob slides between them on `snap` while the
 * panel beneath cross-fades to a height measured by a ResizeObserver and
 * carried on `glide`. The code field is six drawn cells over one real numeric
 * input; the next empty cell holds a caret that pulses while the prompt waits,
 * and each digit lands on `flick`. Filling the last cell submits. The device
 * route draws a small phone whose screen breathes on `drift` until the host
 * reports approval, then lights by colour.
 *
 * Either route ending in `verified` stamps a chip into the header on `recoil`
 * from 1.5× — the one bounce here, because a second key landing is a landing.
 * A wrong code nudges the cells one `distances.nudge` on `snap`, raises an
 * alert and clears the field; nothing celebrates a failure. Under reduced
 * motion the caret is solid, digits appear in place, the screen lights
 * instantly and the stamp fades in.
 */
export function TwoFactor({
  ref,
  method,
  defaultMethod = "code",
  onMethodChange,
  length = 6,
  value,
  defaultValue = "",
  onValueChange,
  status,
  defaultStatus = "waiting",
  onStatusChange,
  onSubmit,
  deviceName = "your device",
  errorMessage = "That code did not match.",
  label,
  className,
  "aria-label": ariaLabel,
}: TwoFactorProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const knobId = `${baseId}-knob`;

  const [uncontrolledMethod, setUncontrolledMethod] =
    React.useState<TwoFactorMethod>(defaultMethod);
  const route = method ?? uncontrolledMethod;

  const [uncontrolledCode, setUncontrolledCode] = React.useState(defaultValue);
  const isCodeControlled = value !== undefined;
  const code = isCodeControlled ? value : uncontrolledCode;

  const [uncontrolledStatus, setUncontrolledStatus] =
    React.useState<TwoFactorStatus>(defaultStatus);
  const isStatusControlled = status !== undefined;
  const current = isStatusControlled ? status : uncontrolledStatus;

  const [focused, setFocused] = React.useState(false);
  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // A failure that arrives through props clears an uncontrolled field: the
  // adjustment happens during render, against the committed status, rather
  // than one paint late from an effect.
  const [seenStatus, setSeenStatus] = React.useState(current);
  if (seenStatus !== current) {
    setSeenStatus(current);
    if (current === "failed" && !isCodeControlled) setUncontrolledCode("");
  }

  const waiting = current === "waiting";
  const checking = current === "checking";
  const verified = current === "verified";
  const failed = current === "failed";
  const live = waiting || failed;

  const moveStatus = (next: TwoFactorStatus) => {
    if (!isStatusControlled) setUncontrolledStatus(next);
    onStatusChange?.(next);
  };

  const submit = (digits: string) => {
    if (!live || digits.length !== length) return;
    moveStatus("checking");
    onSubmit?.(digits);
  };

  const setCode = (next: string) => {
    if (!isCodeControlled) setUncontrolledCode(next);
    onValueChange?.(next);
  };

  const chooseMethod = (next: TwoFactorMethod) => {
    if (next === route) return;
    if (method === undefined) setUncontrolledMethod(next);
    onMethodChange?.(next);
  };

  const handleTabKey = (event: React.KeyboardEvent, index: number) => {
    const step = TAB_STEP[event.key];
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? METHODS.length - 1
          : step !== undefined
            ? index + step
            : null;
    if (to === null) return;
    event.preventDefault();
    const clamped = Math.min(METHODS.length - 1, Math.max(0, to));
    tabRefs.current[clamped]?.focus();
    chooseMethod(METHODS[clamped]!.value);
  };

  // The panel is exactly as tall as the route inside it. The observer rides
  // the callback ref because a waiting exit replaces the node after the key
  // has changed; an effect keyed on the route would watch the one that left.
  const [height, setHeight] = React.useState<number | null>(null);
  const observerRef = React.useRef<ResizeObserver | null>(null);
  React.useEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );
  const measure = React.useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      setHeight(
        Math.round(
          entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
        ),
      );
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const caretIndex = Math.min(code.length, length - 1);
  const showCaret = live && code.length < length;
  const pulse = showCaret && motionSafe && visible;
  const breathing = route === "device" && waiting && motionSafe && visible;
  const lit = verified || checking;
  const spin = motionSafe && visible;

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const blink = { duration: durations.blink } as const;
  // Digits land on flick; the stamp lands on recoil. Both fade in over the
  // blink so the shape, not the opacity, carries the arrival.
  const landFrom = motionSafe ? { scale: 0.7, opacity: 0 } : { opacity: 0 };
  const landIn = motionSafe ? { ...springs.flick, opacity: blink } : fade;
  const stampFrom = motionSafe
    ? { scale: 1.5, rotate: -8, opacity: 0 }
    : { opacity: 0 };
  const stampIn = motionSafe ? { ...springs.recoil, opacity: blink } : fade;
  const loop = { repeat: Infinity, repeatType: "mirror" } as const;

  const cellTone = (char: string, isCaret: boolean) =>
    verified
      ? "border-success/50 text-success"
      : failed
        ? "border-danger/60"
        : isCaret && focused
          ? "border-cobalt-bright outline-2 outline-offset-2 outline-ring"
          : char
            ? "border-hairline-strong"
            : "border-hairline";

  const hint = verified
    ? "Code accepted."
    : checking
      ? "Checking"
      : failed
        ? errorMessage
        : "From your authenticator app.";
  const deviceLine = verified
    ? `Approved on ${deviceName}`
    : checking
      ? "Confirming"
      : `Waiting for ${deviceName}`;
  const announcement = verified
    ? "Verified."
    : checking
      ? "Checking."
      : route === "device" && waiting
        ? `Waiting for approval on ${deviceName}.`
        : "";

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      {/* The label's line height equals the stamp's box, so the header is the
          same height with or without it: no reserve, no jump. */}
      <div className="flex items-center gap-3">
        {label ? (
          <span
            id={labelId}
            className="min-w-0 truncate text-sm leading-6 font-semibold"
          >
            {label}
          </span>
        ) : null}
        <AnimatePresence>
          {verified ? (
            <motion.span
              key="stamp"
              aria-hidden
              className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 text-[11px] font-medium text-success"
              initial={stampFrom}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={stampIn}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3 shrink-0"
              >
                <motion.path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  initial={motionSafe ? { pathLength: 0 } : { pathLength: 1 }}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
              Verified
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        role="tablist"
        aria-label="Verification method"
        className="flex h-9 items-stretch rounded-full border border-hairline bg-surface-2 p-1"
      >
        {METHODS.map((option, index) => {
          const selected = option.value === route;
          return (
            <button
              key={option.value}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${option.value}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${option.value}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => chooseMethod(option.value)}
              onKeyDown={(event) => handleTabKey(event, index)}
              className={cn(
                "relative flex min-w-0 flex-auto items-center justify-center rounded-full px-2 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {selected ? (
                <motion.span
                  aria-hidden
                  layoutId={motionSafe ? knobId : undefined}
                  transition={springs.snap}
                  className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                />
              ) : null}
              <span className="relative truncate">{option.label}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        initial={false}
        animate={{ height: motionSafe && height !== null ? height : "auto" }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="relative overflow-hidden"
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={route}
            ref={measure}
            role="tabpanel"
            id={`${baseId}-panel-${route}`}
            aria-labelledby={`${baseId}-tab-${route}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
            className="flex flex-col gap-2"
          >
            {route === "code" ? (
              <>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={length}
                    value={code}
                    disabled={verified}
                    readOnly={checking}
                    aria-label={`${length}-digit code`}
                    aria-describedby={hintId}
                    aria-invalid={failed || undefined}
                    onChange={(event) => {
                      const digits = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, length);
                      setCode(digits);
                      if (digits.length === length) submit(digits);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submit(code);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0 disabled:cursor-default"
                  />
                  {/* Keyed on the failure so the nudge replays per wrong code;
                      the input above is not remounted, so focus survives. */}
                  <motion.div
                    key={failed ? "failed" : "live"}
                    aria-hidden
                    initial={
                      failed && motionSafe ? { x: -distances.nudge } : false
                    }
                    animate={{ x: 0 }}
                    transition={springs.snap}
                    className="flex gap-1.5"
                  >
                    {Array.from({ length }, (_, index) => {
                      const char = code[index] ?? "";
                      const isCaret = showCaret && index === caretIndex;
                      return (
                        <span
                          key={index}
                          className={cn(
                            "grid h-11 min-w-0 flex-1 place-items-center rounded-2 border bg-surface-2 font-mono text-lg text-foreground tabular-nums transition-colors",
                            cellTone(char, isCaret),
                          )}
                        >
                          {char ? (
                            <motion.span
                              key={`${index}-${char}`}
                              initial={landFrom}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={landIn}
                            >
                              {char}
                            </motion.span>
                          ) : isCaret ? (
                            <motion.span
                              className={cn(
                                "h-5 w-0.5 rounded-full",
                                focused ? "bg-cobalt-bright" : "bg-ink-3",
                              )}
                              initial={{ opacity: 1 }}
                              animate={{ opacity: pulse ? 0.15 : 1 }}
                              transition={
                                pulse
                                  ? {
                                      duration: 0.5,
                                      ease: easings.move,
                                      ...loop,
                                    }
                                  : fade
                              }
                            />
                          ) : null}
                        </span>
                      );
                    })}
                  </motion.div>
                </div>
                <span
                  id={hintId}
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    failed ? "text-danger" : "text-ink-3",
                  )}
                >
                  {checking ? <PendingRing spin={spin} /> : null}
                  {hint}
                </span>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <div
                  aria-hidden
                  className={cn(
                    "relative aspect-[9/16] w-16 shrink-0 rounded-3 border bg-surface-2 p-1.5 transition-colors",
                    lit ? "border-cobalt-bright/60" : "border-hairline-strong",
                  )}
                >
                  <div className="relative size-full overflow-hidden rounded-2 bg-surface-0">
                    <motion.span
                      className="absolute inset-0 bg-cobalt-bright"
                      initial={{ opacity: 0.06 }}
                      animate={{
                        opacity: lit ? 0.35 : breathing ? 0.18 : 0.06,
                      }}
                      transition={
                        breathing ? { ...springs.drift, ...loop } : fade
                      }
                    />
                    <span
                      className={cn(
                        "absolute inset-x-1 top-1.5 flex h-4 items-center justify-center rounded-1 border border-hairline bg-popover text-[8px] leading-none font-medium transition-colors",
                        verified ? "text-success" : "text-popover-foreground",
                      )}
                    >
                      {verified ? "Approved" : "Sign in?"}
                    </span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {checking ? <PendingRing spin={spin} /> : null}
                    {deviceLine}
                  </span>
                  <span className="text-xs text-ink-3">
                    {verified
                      ? "You are signed in."
                      : "Open the notification and approve the sign-in."}
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
      {failed ? (
        <span role="alert" className="sr-only">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
