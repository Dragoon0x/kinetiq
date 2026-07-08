"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type Variants,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { CodeCells } from "@/registry/ui/code-cells";
import { PressureButton } from "@/registry/ui/pressure-button";
import { TraceInput } from "@/registry/ui/trace-input";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 20;
/** Bolt handle width in px — matches the `w-7` handle below. */
const BOLT_HANDLE_PX = 28;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AccessView = "request" | "code" | "granted";

export type AccessPanelProps = {
  /** Fired with the submitted code on every verify attempt. */
  onVerify?: (code: string) => void;
  /** The 6-digit code that throws the bolt. */
  expectedCode?: string;
  /** Prefills the email field (initial value only). */
  email?: string;
  /** Fired once, when the correct code lands. */
  onComplete?: (email: string) => void;
  className?: string;
};

/**
 * Sign-in that unlocks like a vault. The two steps ride a gantry rail —
 * views slide ±24px on `glide` while the card height follows and a sliding
 * pill mirrors position between two step dots. OTP entry is the shipped
 * CodeCells row (digits drop on `flick` with the phosphor tick, and it owns
 * the cell-row nudge plus the CODE REJECTED line); a wrong code additionally
 * nudges the whole plate sideways; the right code throws a breaker-style
 * bolt across the top on `snap` (with an end squash) while the form fades
 * down and an ACCESS GRANTED state rises, its check drawing itself on
 * `flick`. Reduced motion: fades only, digits appear instantly, the nudge
 * is skipped, and the bolt simply crossfades.
 */
export function AccessPanel({
  onVerify,
  expectedCode = "246810",
  email = "",
  onComplete,
  className,
}: AccessPanelProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const otpHintId = `${baseId}-otp-hint`;
  const pillId = `${baseId}-step-pill`;

  const [view, setView] = React.useState<AccessView>("request");
  /** 1 forward, -1 back, 0 vertical crossfade into the granted state. */
  const [direction, setDirection] = React.useState<1 | -1 | 0>(1);
  const [emailValue, setEmailValue] = React.useState(email);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");
  const [height, setHeight] = React.useState<number | null>(null);

  const otpRef = React.useRef<HTMLInputElement | null>(null);
  const viewNodeRef = React.useRef<HTMLDivElement | null>(null);
  const boltTrackRef = React.useRef<HTMLDivElement | null>(null);
  const clearCodeTimer = React.useRef(0);
  const nudgeControls = React.useRef<ReturnType<typeof animate> | null>(null);

  const plateX = useMotionValue(0);
  const boltX = useMotionValue(0);
  const boltSquash = useMotionValue(1);

  const granted = view === "granted";

  // The card height follows the active view; ResizeObserver also catches
  // in-place growth like the error line appearing.
  React.useLayoutEffect(() => {
    const node = viewNodeRef.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view]);

  // Resend cooldown ticks once per second.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  // Entering the code step hands focus to the (hidden) OTP input.
  React.useEffect(() => {
    if (view !== "code") return;
    const frame = requestAnimationFrame(() =>
      otpRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [view]);

  // The bolt throws left→right on `snap`, squashing against the far end.
  React.useEffect(() => {
    if (view !== "granted") return;
    const travel = Math.max(
      0,
      (boltTrackRef.current?.offsetWidth ?? 0) - BOLT_HANDLE_PX,
    );
    if (!motionSafe) {
      boltX.set(travel);
      return;
    }
    const throwControls = animate(boltX, travel, springs.snap);
    const squashControls = animate(boltSquash, [1, 0.82, 1], {
      ...springs.snap,
      // The squash waits for the throw to reach the far wall (~120ms).
      delay: 0.12,
    });
    return () => {
      throwControls.stop();
      squashControls.stop();
    };
  }, [view, motionSafe, boltX, boltSquash]);

  React.useEffect(
    () => () => {
      window.clearTimeout(clearCodeTimer.current);
      nudgeControls.current?.stop();
    },
    [],
  );

  const nudge = () => {
    if (!motionSafe) return;
    nudgeControls.current?.stop();
    nudgeControls.current = animate(plateX, [0, -2, 2, -1, 0], {
      duration: durations.base,
      ease: easings.move,
    });
  };

  const requestAccess = () => {
    const trimmed = emailValue.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setEmailValue(trimmed);
    setDirection(1);
    setView("code");
    setCooldown(RESEND_SECONDS);
    setAnnounce(
      `Step 2 of 2: enter the 6-digit code sent to ${trimmed}. You can resend in ${RESEND_SECONDS} seconds.`,
    );
  };

  const goBack = () => {
    window.clearTimeout(clearCodeTimer.current);
    setCode("");
    setCodeError(false);
    setDirection(-1);
    setView("request");
    setAnnounce("Step 1 of 2: request access.");
  };

  const resend = () => {
    setCooldown(RESEND_SECONDS);
    setAnnounce(
      `Code resent to ${emailValue}. You can resend again in ${RESEND_SECONDS} seconds.`,
    );
  };

  const verify = (entered: string) => {
    if (view !== "code" || entered.length !== OTP_LENGTH) return;
    onVerify?.(entered);
    if (entered === expectedCode) {
      setCodeError(false);
      setDirection(0);
      setView("granted");
      setAnnounce(`Access granted for ${emailValue}.`);
      onComplete?.(emailValue);
    } else {
      setCodeError(true);
      nudge();
      window.clearTimeout(clearCodeTimer.current);
      clearCodeTimer.current = window.setTimeout(() => {
        setCode("");
        otpRef.current?.focus({ preventScroll: true });
      }, 300);
    }
  };

  const stepVariants: Variants = {
    enter: (dir: number) =>
      !motionSafe
        ? { opacity: 0 }
        : dir === 0
          ? { y: distances.step, opacity: 0 }
          : { x: dir * 24, opacity: 0 },
    center: { x: 0, y: 0, opacity: 1 },
    exit: (dir: number) =>
      !motionSafe
        ? { opacity: 0, transition: { duration: durations.fast } }
        : dir === 0
          ? {
              y: distances.step,
              opacity: 0,
              transition: exitFor(durations.base),
            }
          : { x: dir * -24, opacity: 0, transition: exitFor(durations.base) },
  };

  const requestView = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        requestAccess();
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-base leading-tight font-semibold">
          Request access
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We send a one-time code to your inbox.
        </p>
      </div>
      <TraceInput
        label="Work email"
        type="email"
        name="email"
        autoComplete="email"
        value={emailValue}
        onChange={(event) => {
          setEmailValue(event.target.value);
          if (emailError) setEmailError(null);
        }}
        error={emailError ?? undefined}
      />
      <PressureButton type="submit" className="w-full">
        Continue
      </PressureButton>
    </form>
  );

  const codeView = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        verify(code);
      }}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-base leading-tight font-semibold">Enter code</h2>
        <p id={otpHintId} className="mt-1 text-sm text-muted-foreground">
          Enter the 6-digit code sent to{" "}
          <span className="font-medium text-foreground">
            {emailValue || "your email"}
          </span>
          .
        </p>
      </div>

      {/* CodeCells owns the cells, hidden input, caret pinning, the row
          nudge, and the CODE REJECTED line; the forwarded ref reaches its
          hidden input for the clear-and-refocus after a rejection. */}
      <CodeCells
        ref={otpRef}
        length={OTP_LENGTH}
        label="6-digit access code"
        name="code"
        autoFocus
        value={code}
        onValueChange={(next) => {
          setCode(next);
          if (codeError) setCodeError(false);
        }}
        onComplete={verify}
        error={codeError}
        errorMessage="Code rejected · Try again"
        aria-describedby={otpHintId}
      />

      <PressureButton
        type="submit"
        disabled={code.length !== OTP_LENGTH}
        className="w-full"
      >
        Verify
      </PressureButton>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Back
        </button>
        <p className="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase tabular-nums">
          <button
            type="button"
            onClick={resend}
            disabled={cooldown > 0}
            className="uppercase underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-60"
          >
            Resend code
          </button>
          {cooldown > 0 && <span aria-hidden>· {cooldown}s</span>}
        </p>
      </div>
    </form>
  );

  const grantedView = (
    <div className="flex flex-col items-center gap-1.5 py-4 text-center">
      <span className="mb-2 flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
          {motionSafe ? (
            <motion.path
              d="M5 12.5 10 17.5 19 7"
              fill="none"
              stroke="var(--signal, var(--primary))"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ ...springs.flick, delay: 0.18 }}
            />
          ) : (
            <path
              d="M5 12.5 10 17.5 19 7"
              fill="none"
              stroke="var(--signal, var(--primary))"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>
      <p className="font-mono text-sm font-semibold tracking-[0.15em] uppercase">
        Access granted
      </p>
      <p className="text-sm text-muted-foreground">{emailValue}</p>
    </div>
  );

  const activeView =
    view === "request" ? requestView : view === "code" ? codeView : grantedView;

  return (
    <motion.div
      style={{ x: plateX }}
      className={cn(
        "w-full max-w-sm rounded-4 border border-border bg-card p-5 text-card-foreground",
        className,
      )}
    >
      {/* The vault bolt: locked at rest, thrown across on the right code. */}
      <div ref={boltTrackRef} aria-hidden className="relative mb-5 h-3">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full border border-border bg-secondary" />
        <motion.div
          style={{
            x: boltX,
            scaleX: boltSquash,
            transformOrigin: "right center",
          }}
          className={cn(
            "absolute top-0 left-0 h-3 w-7 rounded-1 border transition-colors duration-300",
            granted ? "border-primary bg-primary" : "border-input bg-muted",
          )}
        />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <p className="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Access panel
        </p>
        {/* Step indicator: a pill glides between the two dots. */}
        <div aria-hidden className="flex items-center gap-1.5">
          {[0, 1].map((dot) => {
            const isCurrent = (view === "request" ? 0 : 1) === dot;
            return (
              <span
                key={dot}
                className="relative size-1.5 rounded-full bg-input"
              >
                {isCurrent &&
                  (motionSafe ? (
                    <motion.span
                      layoutId={pillId}
                      transition={springs.glide}
                      className="absolute -inset-x-1 inset-y-0 rounded-full bg-primary"
                    />
                  ) : (
                    <span className="absolute -inset-x-1 inset-y-0 rounded-full bg-primary" />
                  ))}
              </span>
            );
          })}
        </div>
      </div>

      <motion.div
        initial={false}
        animate={height === null ? undefined : { height }}
        transition={motionSafe ? springs.glide : { duration: durations.fast }}
        className="relative overflow-hidden"
      >
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={view}
            ref={(node: HTMLDivElement | null) => {
              // Both the entering and exiting views hold this ref during a
              // transition; only real nodes win so measurement tracks the
              // incoming view.
              if (node) viewNodeRef.current = node;
            }}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={
              motionSafe
                ? {
                    x: springs.glide,
                    y: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
          >
            {activeView}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <span aria-live="polite" role="status" className="sr-only">
        {announce}
      </span>
    </motion.div>
  );
}
