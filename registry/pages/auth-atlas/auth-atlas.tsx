"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { PointGlobe } from "@/registry/ui/point-globe";
import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { StatusPip } from "@/registry/ui/status-pip";
import { TraceInput } from "@/registry/ui/trace-input";

export type AtlasPip = {
  id: string;
  yard: string;
  time: string;
  state: "online" | "busy" | "away";
};

export type AuthAtlasProps = {
  brand?: string;
  headline?: string;
  copy?: string;
  pips?: AtlasPip[];
  crews?: number;
  onSubmit?: (values: { name: string; email: string }) => void;
  className?: string;
};

const DEFAULT_PIPS: AtlasPip[] = [
  { id: "north-basin", yard: "North Basin", time: "06:10", state: "online" },
  { id: "cutter-row", yard: "Cutter Row", time: "09:42", state: "busy" },
  { id: "slate-point", yard: "Slate Point", time: "23:15", state: "away" },
];

const CREATES_LINE =
  "Creates a seat, a live pin for your yard, and crew invites you can send today.";
const NEXT_LINE =
  "One email follows this — a confirmation link, within a minute, and nothing else after it.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 10;

/** A fixed, deterministic wander for the crews-online counter — never Math.random. */
const CREW_STEPS = [1, 1, -1, 1, -1, 2, -1, 1] as const;
const CREW_STEP_MS = 2600;

const LG_QUERY = "(min-width: 1024px)";
const canMatchLg = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";
const subscribeLg = (onChange: () => void): (() => void) => {
  if (!canMatchLg()) return () => {};
  const list = window.matchMedia(LG_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
};
const getLgSnapshot = (): boolean => canMatchLg() && window.matchMedia(LG_QUERY).matches;
/** Prerender has no viewport — report narrow, same rationale as useMotionSafe. */
const getLgServerSnapshot = (): boolean => false;

function emailError(value: string): string | undefined {
  if (!value) return undefined;
  return EMAIL_PATTERN.test(value) ? undefined : "That does not look like a work email.";
}

function passwordError(length: number): string | undefined {
  if (length === 0) return undefined;
  return length < MIN_PASSWORD_LENGTH ? "Needs ten characters or more." : undefined;
}

/** Encouraging, never a meter — describes the password, does not grade it. */
function strengthLine(length: number): string {
  if (length === 0) return "Ten characters minimum. Longer beats clever.";
  if (length < MIN_PASSWORD_LENGTH) return "A few more characters and it is done.";
  if (length < 16) return "That clears the bar.";
  return "Long enough that we stop worrying about it.";
}

/**
 * Account creation staged beside a live activity map: point-globe spins on
 * the right doing its usual reassurance duty — other people, real yards,
 * working right now — while the left column keeps the ask to three fields
 * and states plainly, before the button is ever pressed, what creating the
 * account gets and the one email that follows it. The password field carries
 * a plain-language strength line rather than a meter, because a bar that
 * goes from red to green is still a small public shaming machine, and a text
 * link swaps the password for a passkey line entirely — state only, no
 * provider wired in. This is a shell: submission is a timer, not a network
 * call, and the success panel that replaces the form promises exactly one
 * email and nothing that follows it.
 *
 * Reduced motion: the globe falls back to its own single static frame (see
 * point-globe.tsx), and the crews-online counter keeps stepping regardless —
 * it is activity data, not a flourish.
 */
export function AuthAtlas({
  brand = "Basinworks",
  headline = "Start watching your yards.",
  copy = "One login covers every yard you run. No trial clock, no card up front.",
  pips = DEFAULT_PIPS,
  crews = 18,
  onSubmit,
  className,
}: AuthAtlasProps) {
  const motionSafe = useMotionSafe();
  const isDesktop = React.useSyncExternalStore(
    subscribeLg,
    getLgSnapshot,
    getLgServerSnapshot,
  );
  const headingId = React.useId();

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [emailTouched, setEmailTouched] = React.useState(false);
  const [passwordTouched, setPasswordTouched] = React.useState(false);
  const [usePasskey, setUsePasskey] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [succeeded, setSucceeded] = React.useState(false);

  const submitTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (submitTimerRef.current !== null) {
        window.clearTimeout(submitTimerRef.current);
      }
    };
  }, []);

  const [crewCount, setCrewCount] = React.useState(crews);
  const crewStepRef = React.useRef(0);
  const crewTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    crewTimerRef.current = window.setInterval(() => {
      setCrewCount((count) => {
        const delta = CREW_STEPS[crewStepRef.current % CREW_STEPS.length] ?? 0;
        crewStepRef.current += 1;
        return Math.max(0, count + delta);
      });
    }, CREW_STEP_MS);
    return () => {
      if (crewTimerRef.current !== null) {
        window.clearInterval(crewTimerRef.current);
      }
    };
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const nameValid = name.trim().length > 0;
    const emailValid = email.length > 0 && !emailError(email);
    const passwordValid = usePasskey || password.length >= MIN_PASSWORD_LENGTH;
    if (!nameValid || !emailValid || !passwordValid) {
      setEmailTouched(true);
      setPasswordTouched(true);
      return;
    }
    setSubmitting(true);
    submitTimerRef.current = window.setTimeout(() => {
      setSubmitting(false);
      setSucceeded(true);
      onSubmit?.({ name, email });
    }, 900);
  };

  const swapTransition = motionSafe
    ? { duration: durations.base, ease: easings.enter }
    : { duration: durations.fast };

  return (
    <main
      className={cn("grid min-h-screen bg-surface-0 lg:grid-cols-2", className)}
    >
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
            {brand}
          </p>
          <h1
            id={headingId}
            className="mt-6 text-3xl font-semibold tracking-tight text-ink"
          >
            {headline}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">{copy}</p>

          <AnimatePresence mode="wait" initial={false}>
            {succeeded ? (
              <motion.div
                key="success"
                initial={motionSafe ? { opacity: 0, y: distances.step } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.base) }}
                transition={swapTransition}
                className="mt-8 flex flex-col gap-3 rounded-4 border border-hairline bg-surface-1 p-5"
              >
                <p className="text-label text-ink-3">Check your inbox</p>
                <h2 className="text-xl font-semibold tracking-tight text-ink">
                  One email, from us, within a minute.
                </h2>
                <p className="text-sm leading-relaxed text-ink-2">
                  It carries a link that confirms {email} and finishes the
                  account. Nothing else follows it.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={motionSafe ? { opacity: 0, y: distances.step } : false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.base) }}
                transition={swapTransition}
              >
                <form
                  onSubmit={submit}
                  aria-labelledby={headingId}
                  className="mt-8 flex flex-col gap-4"
                >
                  <TraceInput
                    label="Your name"
                    name="name"
                    autoComplete="name"
                    placeholder="Mara Aldana"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                  <TraceInput
                    label="Work email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@yard.example"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    error={emailTouched ? emailError(email) : undefined}
                    required
                  />

                  {usePasskey ? (
                    <div>
                      <p className="mb-1.5 block text-sm font-medium text-foreground">
                        Password
                      </p>
                      <div className="flex h-11 items-center rounded-2 border border-input bg-transparent px-3 text-sm text-ink-2">
                        A passkey will be requested the first time you sign
                        in. Nothing to type here, nothing to leak.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUsePasskey(false);
                        }}
                        className="mt-1.5 text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
                      >
                        Use a password instead
                      </button>
                    </div>
                  ) : (
                    <div>
                      <TraceInput
                        label="Password"
                        type="password"
                        name="password"
                        autoComplete="new-password"
                        description={strengthLine(password.length)}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        onBlur={() => setPasswordTouched(true)}
                        error={passwordTouched ? passwordError(password.length) : undefined}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUsePasskey(true);
                          setPassword("");
                          setPasswordTouched(false);
                        }}
                        className="mt-1.5 text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
                      >
                        Use a passkey instead
                      </button>
                    </div>
                  )}

                  <PressureButton
                    type="submit"
                    disabled={submitting}
                    className="mt-2 w-full"
                  >
                    {submitting ? "Creating the account…" : "Create the account"}
                  </PressureButton>
                </form>

                <p className="mt-4 text-xs leading-relaxed text-ink-3">
                  {CREATES_LINE}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-3">
                  {NEXT_LINE}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <aside className="flex items-center justify-center border-t border-hairline bg-surface-1 px-6 py-10 lg:border-t-0 lg:border-l lg:py-16">
        <div className="w-full max-w-sm">
          <p className="text-label text-ink-3">Where the crews are</p>
          <div className="relative mt-4 overflow-hidden rounded-4 border border-hairline bg-surface-0">
            <PointGlobe height={isDesktop ? 420 : 240} points={420}>
              <div className="flex h-full flex-col justify-end gap-2 p-4">
                {pips.map((pip) => (
                  <StatusPip
                    key={pip.id}
                    status={pip.state}
                    label={`${pip.yard} · ${pip.time}`}
                    className="w-fit rounded-full bg-surface-0/85 px-2.5 py-1 text-xs backdrop-blur-sm"
                  />
                ))}
              </div>
            </PointGlobe>
          </div>

          <p className="mt-4 flex items-baseline gap-1.5 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
            <span>crews online now</span>
            <span aria-hidden>·</span>
            <Readout
              value={crewCount}
              size="sm"
              className="normal-case tracking-normal text-ink-2"
            />
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-3">
            The map is live activity, not a promise. It moves the way
            point-globe always does — a slow drift you can grab and spin,
            with other people visibly here while you sign up.
          </p>
        </div>
      </aside>
    </main>
  );
}
